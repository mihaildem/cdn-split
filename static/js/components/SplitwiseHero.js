/**
 * SplitwiseHero Component - Top Bento Hero Card showing mutual offsets & transfers
 */

import { formatRubles, formatDative } from "../services/billing.js";

export const SplitwiseHero = {
  name: "SplitwiseHero",
  props: {
    store: { type: Object, required: true }
  },
  setup(props) {
    const handleSettle = () => {
      const note = prompt("Заметка к оплате (например: 'Перевод Тинькофф')", "Перевод закрыт");
      if (note !== null) {
        props.store.settleUp(note);
      }
    };

    return { formatRubles, formatDative, handleSettle };
  },
  template: `
    <section class="hero-bento">
      <!-- Main Bento Hero -->
      <div class="bento-card hero-main">
        <div>
          <div class="hero-badge">
            <span>{{ store.dashboard.splitwise.direction === 'settled' ? '✓ Баланс закрыт' : '⚖️ Взаиморасчет' }}</span>
          </div>
          <h1 class="hero-summary">
            {{ store.dashboard.splitwise.summary_text }}
          </h1>

          <div class="hero-metrics">
            <div class="metric-col">
              <span class="metric-label">К расчету</span>
              <span class="metric-val tabular" :style="{ color: store.dashboard.splitwise.total_unsettled_cost > 0 ? '#f59e0b' : '#34d399' }">
                {{ formatRubles(store.dashboard.splitwise.total_unsettled_cost) }}
              </span>
            </div>
            <div class="metric-col">
              <span class="metric-label">CDN Ресурсы</span>
              <span class="metric-val tabular">
                {{ store.dashboard.splitwise.active_resources_count }} / {{ store.dashboard.splitwise.total_resources_count }}
              </span>
            </div>
            <div class="metric-col">
              <span class="metric-label">Аккаунты</span>
              <span class="metric-val tabular">
                {{ store.dashboard.splitwise.accounts_count || store.dashboard.accounts.length }}
              </span>
            </div>
          </div>
        </div>

        <div class="hero-actions">
          <button
            class="btn btn-success"
            :disabled="!store.dashboard.splitwise.total_unsettled_cost || store.dashboard.splitwise.total_unsettled_cost <= 0"
            @click="handleSettle"
            title="Зафиксировать взаиморасчет и обнулить текущий долг"
          >
            <span>✓</span>
            <span>Оплатил (Закрыть долг)</span>
          </button>

          <button
            v-if="store.settlements && store.settlements.length > 0"
            class="btn btn-sm"
            @click="store.undoSettlement"
            title="Отменить последний взаиморасчет и восстановить счетчики трафика"
          >
            <span>↩</span>
            <span>Отменить</span>
          </button>
        </div>
      </div>

      <!-- Right Sub Bento: Participants Breakdown & Transfers -->
      <div class="sub-bento">
        <!-- Participant Stats Cards -->
        <div class="participants-grid">
          <div
            v-for="p in store.dashboard.splitwise.participant_stats"
            :key="p.id"
            class="participant-stat-card"
          >
            <div class="part-header">
              <span class="part-dot" :style="{ backgroundColor: p.color || '#38bdf8' }"></span>
              <span>{{ p.name }}</span>
            </div>
            <div class="part-stat-line">
              <span>Оплатил:</span>
              <span class="tabular">{{ formatRubles(p.paid_total) }}</span>
            </div>
            <div class="part-stat-line">
              <span>Потребил:</span>
              <span class="tabular">{{ formatRubles(p.consumed_total) }}</span>
            </div>
            <div class="part-stat-line" style="margin-top: 2px; border-top: 1px dashed rgba(255,255,255,0.06); padding-top: 2px;">
              <span>Баланс:</span>
              <span class="tabular" :style="{ color: p.net_balance > 0 ? '#34d399' : (p.net_balance < 0 ? '#f87171' : 'inherit') }">
                {{ p.net_balance > 0 ? '+' : '' }}{{ formatRubles(p.net_balance) }}
              </span>
            </div>
          </div>
        </div>

        <!-- Debt Transfers Simplification -->
        <div class="transfers-card" v-if="store.dashboard.splitwise.transfers && store.dashboard.splitwise.transfers.length > 0">
          <div class="transfers-title">Оптимизированные переводы:</div>
          <div
            v-for="(t, idx) in store.dashboard.splitwise.transfers"
            :key="idx"
            class="transfer-item"
          >
            <div class="transfer-flow">
              <span>{{ t.from_name }}</span>
              <span class="transfer-arrow">→</span>
              <span>{{ formatDative(t.to_name) }}</span>
            </div>
            <span class="tabular font-bold" style="color: #38bdf8;">{{ formatRubles(t.amount) }}</span>
          </div>
        </div>
      </div>
    </section>
  `
};
