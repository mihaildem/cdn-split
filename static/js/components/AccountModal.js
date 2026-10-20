/**
 * AccountModal & ResourceModal Components - Add/Edit Account & Resource with Dynamic Credentials & Help
 */

import { ref, reactive, computed, watch } from "vue";

export const AccountModal = {
  name: "AccountModal",
  props: { store: { type: Object, required: true } },
  setup(props) {
    const data = props.store.modalData || {};
    const showHelp = ref(false), isTesting = ref(false), testResult = ref(null);

    const form = reactive({
      id: data.id || null, provider: data.provider || "selectel", name: data.name || "",
      payer: data.payer || (props.store.dashboard.participants[0]?.id || "misha"),
      credentials: { ...(data.credentials || {}) },
      free_tier_gb: data.free_tier_gb ?? 100, price_per_gb: data.price_per_gb ?? 1.50,
      package_cost_rub: data.package_cost_rub || 0, ignore_bonus: Boolean(data.ignore_bonus),
      low_balance_threshold: data.low_balance_threshold || 200
    });

    const currentProvider = computed(() => props.store.providers[form.provider] || { fields: [], help: null });

    watch(() => form.provider, (p) => {
      const meta = props.store.providers[p];
      if (meta && !form.id) {
        form.name = meta.name; form.free_tier_gb = meta.default_free_gb; form.price_per_gb = meta.default_price_per_gb;
      }
    }, { immediate: !form.id });

    const handleTest = async () => {
      isTesting.value = true; testResult.value = null;
      try {
        const res = await props.store.testAccountCredentials({ provider: form.provider, credentials: form.credentials });
        testResult.value = { success: res.success !== false, message: res.success !== false ? `Подключено! Баланс: ${res.balance_rub} ₽` : (res.error || "Ошибка") };
      } catch (e) { testResult.value = { success: false, message: e.message }; }
      finally { isTesting.value = false; }
    };

    const handleSave = () => {
      if (!form.name.trim()) return props.store.notify("Укажите название аккаунта", "error");
      props.store.saveAccount(form);
    };

    return { form, showHelp, isTesting, testResult, currentProvider, handleTest, handleSave };
  },
  template: `
    <div class="modal-backdrop" @click.self="store.closeModal()">
      <div class="modal-card">
        <div class="modal-header">
          <h2 class="modal-title">{{ form.id ? '✏️ Редактировать аккаунт' : '➕ Добавить CDN аккаунт' }}</h2>
          <button class="btn btn-sm btn-icon" @click="store.closeModal()">✕</button>
        </div>

        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label>Провайдер</label>
              <select v-model="form.provider" :disabled="Boolean(form.id)">
                <option v-for="(p, id) in store.providers" :key="id" :value="id">{{ p.name }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>Название аккаунта</label>
              <input v-model="form.name" placeholder="Например: Selectel (Основной)" />
            </div>
          </div>

          <!-- Dynamic Credentials Inputs -->
          <div v-for="field in currentProvider.fields" :key="field.key" class="form-group">
            <label>{{ field.label }}</label>
            <input v-model="form.credentials[field.key]" :type="field.type || 'text'" :placeholder="field.placeholder || ''" />
          </div>

          <!-- Expandable Help Block -->
          <div class="help-box" v-if="currentProvider.help">
            <div class="help-header" @click="showHelp = !showHelp">
              <span>[?] Где взять ключи API для {{ currentProvider.name }}?</span>
              <span>{{ showHelp ? '▲' : '▼' }}</span>
            </div>
            <div v-if="showHelp" style="margin-top: 0.5rem;">
              <ol class="help-steps"><li v-for="(step, idx) in currentProvider.help.steps" :key="idx">{{ step }}</li></ol>
              <a :href="currentProvider.help.portal_url" target="_blank" class="help-link">↗ {{ currentProvider.help.portal_label }}</a>
            </div>
          </div>

          <!-- Tariff & Limits -->
          <div class="form-row">
            <div class="form-group">
              <label>Бесплатный лимит (Free Tier, ГБ)</label>
              <input type="number" step="any" v-model.number="form.free_tier_gb" />
            </div>
            <div class="form-group">
              <label>Цена за 1 ГБ трафика (₽)</label>
              <input type="number" step="0.01" v-model.number="form.price_per_gb" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Оплачивает по умолчанию</label>
              <select v-model="form.payer">
                <option v-for="p in store.dashboard.participants" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>Порог низкого баланса (₽)</label>
              <input type="number" step="any" v-model.number="form.low_balance_threshold" />
            </div>
          </div>

          <label class="check-card">
            <input type="checkbox" v-model="form.ignore_bonus" />
            <span>Не учитывать бонусные рубли при расчете долга (ignore_bonus)</span>
          </label>

          <div v-if="testResult" :style="{ color: testResult.success ? '#34d399' : '#f87171', fontSize: '12px' }">
            {{ testResult.message }}
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-sm" :disabled="isTesting" @click="handleTest">
            {{ isTesting ? 'Проверка...' : '⚡ Проверить подключение' }}
          </button>
          <button class="btn btn-sm" @click="store.closeModal()">Отмена</button>
          <button class="btn btn-sm btn-primary" @click="handleSave">Сохранить</button>
        </div>
      </div>
    </div>
  `
};

export const ResourceModal = {
  name: "ResourceModal",
  props: { store: { type: Object, required: true } },
  setup(props) {
    const data = props.store.modalData || {};
    const form = reactive({
      id: data.id || null, account_id: data.account_id || (props.store.dashboard.accounts[0]?.id || ""),
      domain: data.domain || "", cname: data.cname || "", consumer: data.consumer || "split", total_gb: data.total_gb || 0
    });

    const handleSave = () => {
      if (!form.domain.trim()) return props.store.notify("Укажите домен ресурса", "error");
      props.store.saveResource(form);
    };

    return { form, handleSave };
  },
  template: `
    <div class="modal-backdrop" @click.self="store.closeModal()">
      <div class="modal-card">
        <div class="modal-header">
          <h2 class="modal-title">{{ form.id ? '✏️ Редактировать ресурс' : '➕ Добавить CDN ресурс' }}</h2>
          <button class="btn btn-sm btn-icon" @click="store.closeModal()">✕</button>
        </div>

        <div class="modal-body">
          <div class="form-group" v-if="!form.id">
            <label>Привязать к аккаунту</label>
            <select v-model="form.account_id">
              <option v-for="acc in store.dashboard.accounts" :key="acc.id" :value="acc.id">{{ acc.name }}</option>
            </select>
          </div>
          <div class="form-group">
            <label>Домен (CNAME домен клиента)</label>
            <input v-model="form.domain" placeholder="cdn.mydomain.com" />
          </div>
          <div class="form-group">
            <label>CDN CNAME провайдера</label>
            <input v-model="form.cname" placeholder="cdn-xyz.selectelcdn.ru" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Потребитель (кто платит)</label>
              <select v-model="form.consumer">
                <option value="split">Поровну между всеми</option>
                <option v-for="p in store.dashboard.participants" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>Трафик (ГБ)</label>
              <input type="number" step="0.1" v-model.number="form.total_gb" />
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-sm" @click="store.closeModal()">Отмена</button>
          <button class="btn btn-sm btn-primary" @click="handleSave">Сохранить</button>
        </div>
      </div>
    </div>
  `
};
