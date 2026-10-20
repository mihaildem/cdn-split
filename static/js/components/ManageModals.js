/**
 * ManageModals Components - Participants, Telegram Bots, History, JSON & Security
 */

import { ref, reactive } from "vue";

export const ParticipantsModal = {
  name: "ParticipantsModal",
  props: { store: { type: Object, required: true } },
  setup(props) {
    const newName = ref("");
    const newColor = ref("#38bdf8");
    const add = () => {
      if (!newName.value.trim()) return;
      props.store.saveParticipant({ name: newName.value.trim(), color: newColor.value });
      newName.value = "";
    };
    return { newName, newColor, add };
  },
  template: `
    <div class="modal-backdrop" @click.self="store.closeModal()">
      <div class="modal-card">
        <div class="modal-header">
          <h2 class="modal-title">👥 Участники взаиморасчетов</h2>
          <button class="btn btn-sm btn-icon" @click="store.closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <div v-for="p in store.dashboard.participants" :key="p.id" style="display: flex; gap: 0.5rem; align-items: center;">
            <input type="color" v-model="p.color" style="width: 36px; height: 36px; padding: 2px; border-radius: 4px; cursor: pointer;" @change="store.saveParticipant(p)" />
            <input v-model="p.name" @blur="store.saveParticipant(p)" style="flex: 1;" />
            <button class="btn btn-sm btn-icon btn-danger" @click="store.deleteParticipant(p.id)" title="Удалить">🗑️</button>
          </div>
          <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem; padding-top: 0.75rem; border-top: 1px solid var(--border);">
            <input type="color" v-model="newColor" style="width: 36px; height: 36px; padding: 2px; border-radius: 4px;" />
            <input v-model="newName" placeholder="Имя нового участника..." @keyup.enter="add" style="flex: 1;" />
            <button class="btn btn-sm btn-primary" @click="add">+ Добавить</button>
          </div>
        </div>
        <div class="modal-footer"><button class="btn btn-sm" @click="store.closeModal()">Закрыть</button></div>
      </div>
    </div>
  `
};

export const TelegramModal = {
  name: "TelegramModal",
  props: { store: { type: Object, required: true } },
  setup(props) {
    const showAdd = ref(false);
    const form = reactive({ name: "Основной бот", bot_token: "", chat_id: "", filter_owner: "all", notify_low_balance: true, notify_settlement: true, notify_cdn_down: true });
    const addBot = () => {
      if (!form.bot_token || !form.chat_id) return props.store.notify("Заполните токен и Chat ID", "error");
      props.store.saveBot(form);
      showAdd.value = false;
    };
    return { showAdd, form, addBot };
  },
  template: `
    <div class="modal-backdrop" @click.self="store.closeModal()">
      <div class="modal-card">
        <div class="modal-header">
          <h2 class="modal-title">🤖 Telegram Боты и Уведомления</h2>
          <button class="btn btn-sm btn-icon" @click="store.closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <div v-for="b in store.bots" :key="b.id" class="res-item" style="flex-direction: column; align-items: stretch; gap: 0.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <strong>{{ b.name }} (Chat: {{ b.chat_id }})</strong>
              <div style="display: flex; gap: 0.4rem;">
                <button class="btn btn-sm" @click="store.testBot(b)">⚡ Тест</button>
                <button class="btn btn-sm btn-icon btn-danger" @click="store.deleteBot(b.id)">✕</button>
              </div>
            </div>
            <div style="display: flex; gap: 1rem; font-size: 11px; color: var(--text-muted); flex-wrap: wrap;">
              <span>Фильтр: <b>{{ b.filter_owner }}</b></span>
              <span>Баланс: {{ b.notify_low_balance ? '✓' : '✕' }}</span>
              <span>Расчеты: {{ b.notify_settlement ? '✓' : '✕' }}</span>
              <span>CDN Down: {{ b.notify_cdn_down ? '✓' : '✕' }}</span>
            </div>
          </div>
          <button v-if="!showAdd" class="btn btn-sm btn-primary" @click="showAdd = true" style="align-self: flex-start;">+ Добавить бота</button>
          <div v-else style="display: flex; flex-direction: column; gap: 0.5rem; background: var(--bg-surface); padding: 0.75rem; border-radius: 8px;">
            <div class="form-row">
              <input v-model="form.name" placeholder="Название бота" />
              <input v-model="form.chat_id" placeholder="Telegram Chat ID" />
            </div>
            <input v-model="form.bot_token" type="password" placeholder="Bot Token (от @BotFather)" />
            <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
              <button class="btn btn-sm" @click="showAdd = false">Отмена</button>
              <button class="btn btn-sm btn-primary" @click="addBot">Сохранить</button>
            </div>
          </div>
        </div>
        <div class="modal-footer"><button class="btn btn-sm" @click="store.closeModal()">Закрыть</button></div>
      </div>
    </div>
  `
};

export const HistoryModal = {
  name: "HistoryModal",
  props: { store: { type: Object, required: true } },
  template: `
    <div class="modal-backdrop" @click.self="store.closeModal()">
      <div class="modal-card">
        <div class="modal-header">
          <h2 class="modal-title">📜 История взаиморасчетов</h2>
          <button class="btn btn-sm btn-icon" @click="store.closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <div v-if="store.settlements && store.settlements.length > 0" style="display: flex; flex-direction: column; gap: 0.5rem;">
            <div v-for="s in store.settlements" :key="s.id" class="res-item" style="justify-content: space-between;">
              <div>
                <div style="font-weight: 600;">{{ s.summary || 'Взаиморасчет закрыт' }}</div>
                <div style="font-size: 11px; color: var(--text-dim);">{{ new Date(s.settled_at).toLocaleString('ru-RU') }} — {{ s.note }}</div>
              </div>
            </div>
          </div>
          <div v-else class="form-hint" style="text-align: center;">История взаиморасчетов пока пуста</div>
        </div>
        <div class="modal-footer">
          <button v-if="store.settlements && store.settlements.length > 0" class="btn btn-sm btn-danger" @click="store.undoSettlement()">↩ Отменить последний</button>
          <button class="btn btn-sm" @click="store.closeModal()">Закрыть</button>
        </div>
      </div>
    </div>
  `
};

export const JsonModal = {
  name: "JsonModal",
  props: { store: { type: Object, required: true } },
  setup(props) {
    const raw = ref("");
    return { raw, importData: () => props.store.importJson(raw.value) };
  },
  template: `
    <div class="modal-backdrop" @click.self="store.closeModal()">
      <div class="modal-card">
        <div class="modal-header">
          <h2 class="modal-title">⇄ Экспорт / Импорт JSON</h2>
          <button class="btn btn-sm btn-icon" @click="store.closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <button class="btn btn-sm btn-primary" @click="store.exportJson()" style="align-self: flex-start;">⬇ Скачать файл экспорта (.json)</button>
          <div class="form-group" style="margin-top: 0.5rem;">
            <label>Импорт JSON данных</label>
            <textarea v-model="raw" rows="6" placeholder="Вставьте JSON конфигурацию сюда..."></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-sm" @click="store.closeModal()">Отмена</button>
          <button class="btn btn-sm btn-primary" :disabled="!raw.trim()" @click="importData">Загрузить JSON</button>
        </div>
      </div>
    </div>
  `
};

export const SecurityModal = {
  name: "SecurityModal",
  props: { store: { type: Object, required: true } },
  setup(props) {
    const url = ref(props.store.backendUrl);
    const pin = ref(props.store.accessPin);
    return { url, pin, save: () => props.store.saveSecurity(url.value, pin.value) };
  },
  template: `
    <div class="modal-backdrop" @click.self="store.closeModal()">
      <div class="modal-card">
        <div class="modal-header">
          <h2 class="modal-title">🔒 Подключение и PIN-код</h2>
          <button class="btn btn-sm btn-icon" @click="store.closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>URL Бэкенда (пусто = локальный / текущий домен)</label>
            <input v-model="url" placeholder="http://localhost:8095 или https://api.my-domain.com" />
          </div>
          <div class="form-group">
            <label>PIN-код доступа (X-Access-Pin)</label>
            <input v-model="pin" type="password" placeholder="Оставьте пустым если PIN не включен" />
          </div>
          <div style="border-top: 1px solid var(--border); padding-top: 0.75rem; display: flex; justify-content: space-between; align-items: center;">
            <span class="form-hint">Восстановить заводские демо-данные:</span>
            <button class="btn btn-sm btn-danger" @click="store.resetDemo()">⚠️ Сброс демо</button>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-sm" @click="store.closeModal()">Отмена</button>
          <button class="btn btn-sm btn-primary" @click="save">Сохранить</button>
        </div>
      </div>
    </div>
  `
};
