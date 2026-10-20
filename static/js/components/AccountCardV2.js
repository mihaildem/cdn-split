/**
 * AccountCardV2 Component - Linear / Vercel Precision High-Density Account Card
 */

import { formatRubles } from "../services/billing.js";

export const AccountCardV2 = {
  name: "AccountCardV2",
  props: {
    account: { type: Object, required: true },
    store: { type: Object, required: true }
  },
  setup(props) {
    const getProviderMeta = (id) => props.store.providers[id] || { name: id, color: "#71717a" };

    const getFreeTierPercent = () => {
      const ft = Number(props.account.free_tier_gb) || 0;
      if (ft <= 0) return 0;
      const used = Number(props.account.free_tier_used_gb) || 0;
      return Math.min(100, Math.round((used / ft) * 100));
    };

    const formatCost = (cost) => {
      const num = Number(cost || 0);
      return num === 0 ? "0 ₽ free" : formatRubles(num);
    };

    return { formatRubles, getProviderMeta, getFreeTierPercent, formatCost };
  },
  template: `
    <article class="v2-acc-card" :class="{ 'v2-low-balance': account.is_low_balance }">
      <!-- 1. Single Compact Top Row -->
      <div class="v2-acc-top">
        <div class="v2-acc-identity">
          <span
            class="v2-prov-dot"
            :style="{ backgroundColor: getProviderMeta(account.provider).color }"
            :title="getProviderMeta(account.provider).name"
          ></span>
          <span class="v2-prov-tag">{{ getProviderMeta(account.provider).name }}</span>
          <span class="v2-acc-name">{{ account.name }}</span>
          <span class="v2-acc-id" v-if="account.account_identifier">#{{ account.account_identifier }}</span>
        </div>

        <div class="v2-acc-top-controls">
          <div class="v2-balance-group">
            <span
              class="v2-balance-pill tabular"
              :class="{ 'is-low': account.is_low_balance }"
              :title="'Текущий баланс ' + (account.is_low_balance ? '(Низкий баланс!)' : '')"
            >
              {{ formatRubles(account.balance_rub, true) }}
            </span>
            <span
              class="v2-bonus-tag tabular"
              v-if="account.bonus_balance_rub > 0"
              :title="'Бонусный баланс: +' + formatRubles(account.bonus_balance_rub)"
            >
              +{{ formatRubles(account.bonus_balance_rub) }}
            </span>
          </div>

          <!-- Payer Segmented Toggle [Миша | Макс] -->
          <div class="v2-segmented" title="Кто оплачивает аккаунт">
            <button
              v-for="p in store.dashboard.participants"
              :key="p.id"
              class="v2-seg-btn"
              :class="{ active: account.payer === p.id }"
              @click="store.setAccountPayer(account, p.id)"
            >
              {{ p.name }}
            </button>
          </div>

          <!-- Compact Action Icons -->
          <div class="v2-acc-actions">
            <button class="v2-btn-icon" @click="store.openModal('resource', { account_id: account.id })" title="Добавить CDN ресурс">+</button>
            <button class="v2-btn-icon" @click="store.openModal('account', account)" title="Настройки аккаунта и API">⚙</button>
            <button class="v2-btn-icon danger" @click="store.deleteAccount(account.id)" title="Удалить аккаунт">✕</button>
          </div>
        </div>
      </div>

      <!-- 2. Slim Inline Tariff & Free Tier Bar (Single 24px Row) -->
      <div class="v2-tariff-bar">
        <div class="v2-tariff-left">
          <span class="v2-stat-unit">Трафик: <b class="tabular text-zinc-100">{{ Number(account.total_traffic_gb || 0).toFixed(1) }} ГБ</b></span>
          <span class="v2-sep">·</span>

          <template v-if="account.free_tier_gb > 0">
            <span class="v2-stat-unit">Free Tier: <b class="tabular">{{ Number(account.free_tier_used_gb || 0).toFixed(0) }}/{{ account.free_tier_gb }} ГБ</b></span>
            <div class="v2-ft-track" :title="'Free Tier: ' + Number(account.free_tier_used_gb || 0).toFixed(1) + ' / ' + account.free_tier_gb + ' ГБ (' + getFreeTierPercent() + '%)'">
              <div class="v2-ft-fill" :class="{ full: getFreeTierPercent() >= 100 }" :style="{ width: getFreeTierPercent() + '%' }"></div>
            </div>
            <span class="v2-sep">·</span>
          </template>

          <span class="v2-stat-unit">
            К расчету: <b class="tabular" :class="account.unsettled_cost_rub > 0 ? 'text-amber' : 'text-zinc-300'">{{ formatRubles(account.unsettled_cost_rub) }}</b>
          </span>
        </div>

        <div class="v2-tariff-right">
          <span class="v2-cost-sub">Расход: <b class="tabular">{{ formatRubles(account.real_cost_rub) }}</b></span>
        </div>
      </div>

      <!-- 3. Linear-style Resource Rows -->
      <div class="v2-res-list" v-if="account.resources && account.resources.length > 0">
        <div
          v-for="res in account.resources"
          :key="res.id"
          class="v2-res-row"
        >
          <!-- Left: Status dot + Domain + Subtle CNAME -->
          <div class="v2-res-left">
            <span
              class="v2-ping-pill tabular"
              :class="res.http_status || 'unknown'"
              @click="store.pingResource(res)"
              :title="'HTTP ' + (res.http_code || '---') + ' (' + (res.http_latency_ms ? res.http_latency_ms.toFixed(0) + 'ms' : '---') + ') — клик для пинга'"
            >
              ● {{ res.http_latency_ms ? res.http_latency_ms.toFixed(0) + 'ms' : (res.http_status ? res.http_status.toUpperCase() : 'PING') }}
            </span>

            <div class="v2-domain-group">
              <span class="v2-domain-name" :title="res.domain">{{ res.domain }}</span>
              <span class="v2-cname-sub" v-if="res.cname" :title="'CNAME: ' + res.cname">{{ res.cname }}</span>
            </div>
          </div>

          <!-- Right: 42.5 ГБ · 13 ₽ (or 0 ₽ free) + Segmented toggle + Actions -->
          <div class="v2-res-right">
            <div class="v2-res-metrics tabular">
              <span class="v2-res-gb">{{ Number(res.total_gb || 0).toFixed(1) }} ГБ</span>
              <span class="v2-sep">·</span>
              <span class="v2-res-cost" :class="{ 'is-free': Number(res.unsettled_cost || 0) === 0 }">
                {{ formatCost(res.unsettled_cost) }}
              </span>
            </div>

            <!-- Crisp segmented pill [Поровну | Миша | Макс] -->
            <div class="v2-segmented tight" title="Кто оплачивает CDN ресурс">
              <button
                class="v2-seg-btn"
                :class="{ active: res.consumer === 'split' }"
                @click="store.setResourceConsumer(res, 'split')"
              >
                Поровну
              </button>
              <button
                v-for="p in store.dashboard.participants"
                :key="p.id"
                class="v2-seg-btn"
                :class="{ active: res.consumer === p.id }"
                @click="store.setResourceConsumer(res, p.id)"
              >
                {{ p.name }}
              </button>
            </div>

            <div class="v2-res-actions">
              <button
                class="v2-btn-icon sm"
                @click="store.openModal('resource', res)"
                title="Редактировать ресурс"
              >
                ✎
              </button>
              <button
                class="v2-btn-icon sm danger"
                @click="store.deleteResource(res.id)"
                title="Удалить ресурс"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="v2-empty-res">
        Нет привязанных CDN ресурсов. Нажмите «+» для добавления домена.
      </div>
    </article>
  `
};
