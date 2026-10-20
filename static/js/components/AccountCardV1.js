/**
 * AccountCardV1 Component - Classic CDN account card with full metric tiles
 */

import { formatRubles } from "../services/billing.js";

export const AccountCardV1 = {
  name: "AccountCardV1",
  props: {
    account: { type: Object, required: true },
    store: { type: Object, required: true }
  },
  setup(props) {
    const getProviderMeta = (id) => props.store.providers[id] || { name: id, color: "#64748b" };

    const getFreeTierPercent = () => {
      const ft = Number(props.account.free_tier_gb) || 0;
      if (ft <= 0) return 0;
      const used = Number(props.account.free_tier_used_gb) || 0;
      return Math.min(100, Math.round((used / ft) * 100));
    };

    return { formatRubles, getProviderMeta, getFreeTierPercent };
  },
  template: `
    <article class="account-card" :class="{ 'low-balance': account.is_low_balance }">
      <div class="acc-header">
        <div class="acc-title-group">
          <span
            class="provider-badge"
            :style="{ backgroundColor: getProviderMeta(account.provider).color }"
          >
            {{ getProviderMeta(account.provider).name }}
          </span>
          <span class="acc-name">{{ account.name }}</span>
          <span class="acc-id" v-if="account.account_identifier">#{{ account.account_identifier }}</span>
        </div>

        <div class="acc-tools">
          <button class="btn btn-sm" @click="store.openModal('resource', { account_id: account.id })" title="Добавить CDN ресурс">
            <span>+ Ресурс</span>
          </button>
          <button class="btn btn-sm btn-icon" @click="store.openModal('account', account)" title="Настройки аккаунта и API">⚙</button>
          <button class="btn btn-sm btn-icon btn-danger" @click="store.deleteAccount(account.id)" title="Удалить аккаунт">✕</button>
        </div>
      </div>

      <div class="acc-metrics-bar">
        <div class="acc-metric-item">
          <span class="metric-label">Баланс</span>
          <span class="val tabular" :class="{ danger: account.is_low_balance }">
            {{ formatRubles(account.balance_rub, true) }}
          </span>
        </div>
        <div class="acc-metric-item" v-if="account.bonus_balance_rub > 0">
          <span class="metric-label">Бонусы</span>
          <span class="val tabular success">+{{ formatRubles(account.bonus_balance_rub) }}</span>
        </div>
        <div class="acc-metric-item">
          <span class="metric-label">Трафик всего</span>
          <span class="val tabular">{{ Number(account.total_traffic_gb || 0).toFixed(1) }} ГБ</span>
        </div>
        <div class="acc-metric-item">
          <span class="metric-label">Расход за месяц</span>
          <span class="val tabular">{{ formatRubles(account.real_cost_rub) }}</span>
        </div>
        <div class="acc-metric-item">
          <span class="metric-label">К расчету</span>
          <span class="val tabular" :style="{ color: account.unsettled_cost_rub > 0 ? '#f59e0b' : 'inherit' }">
            {{ formatRubles(account.unsettled_cost_rub) }}
          </span>
        </div>
      </div>

      <div class="free-tier-box" v-if="account.free_tier_gb > 0">
        <div class="free-tier-labels">
          <span>Бесплатный лимит (Free Tier)</span>
          <span class="tabular">{{ Number(account.free_tier_used_gb || 0).toFixed(1) }} / {{ account.free_tier_gb }} ГБ ({{ getFreeTierPercent() }}%)</span>
        </div>
        <div class="progress-track">
          <div
            class="progress-fill"
            :class="{ full: getFreeTierPercent() >= 100 }"
            :style="{ width: getFreeTierPercent() + '%' }"
          ></div>
        </div>
      </div>

      <div class="payer-bar">
        <span class="metric-label">Оплачивает аккаунт:</span>
        <div class="segmented-control">
          <button
            v-for="p in store.dashboard.participants"
            :key="p.id"
            class="segment-btn"
            :class="{ active: account.payer === p.id }"
            @click="store.setAccountPayer(account, p.id)"
          >
            {{ p.name }}
          </button>
        </div>
      </div>

      <div class="resources-list" v-if="account.resources && account.resources.length > 0">
        <div
          v-for="res in account.resources"
          :key="res.id"
          class="res-item"
        >
          <div class="res-main">
            <span
              class="status-pill tabular"
              :class="res.http_status || 'unknown'"
              @click="store.pingResource(res)"
              :title="'HTTP ' + (res.http_code || '---') + ' (' + (res.http_latency_ms ? res.http_latency_ms.toFixed(0) + 'ms' : '---') + ') - нажмите для пинга'"
            >
              ● {{ res.http_latency_ms ? res.http_latency_ms.toFixed(0) + 'ms' : (res.http_status ? res.http_status.toUpperCase() : 'PING') }}
            </span>
            <div>
              <div class="domain-title">{{ res.domain }}</div>
              <div class="cname-sub" v-if="res.cname">{{ res.cname }}</div>
            </div>
          </div>

          <div class="res-meta">
            <div class="res-stat">
              <span class="val tabular">{{ Number(res.total_gb || 0).toFixed(1) }} ГБ</span>
              <span class="lbl">{{ formatRubles(res.unsettled_cost) }}</span>
            </div>

            <div class="segmented-control" title="Кто оплачивает этот CDN ресурс">
              <button
                class="segment-btn"
                :class="{ active: res.consumer === 'split' }"
                @click="store.setResourceConsumer(res, 'split')"
              >
                Поровну
              </button>
              <button
                v-for="p in store.dashboard.participants"
                :key="p.id"
                class="segment-btn"
                :class="{ active: res.consumer === p.id }"
                @click="store.setResourceConsumer(res, p.id)"
              >
                {{ p.name }}
              </button>
            </div>

            <div class="res-actions">
              <button
                class="btn btn-sm btn-icon"
                @click="store.openModal('resource', res)"
                title="Редактировать ресурс"
              >
                ✎
              </button>
              <button
                class="btn btn-sm btn-icon btn-danger"
                @click="store.deleteResource(res.id)"
                title="Удалить ресурс"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="form-hint" style="text-align: center; padding: 0.5rem;">
        Нет привязанных CDN ресурсов. Нажмите «+ Ресурс» чтобы добавить домен.
      </div>
    </article>
  `
};
