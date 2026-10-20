/**
 * SplitwiseHeroV2 Component - Precision Fintech Ledger Bar (Linear / Vercel Geist Style)
 */

import { computed } from "vue";
import { formatRubles, formatDative } from "../services/billing.js";

export const SplitwiseHeroV2 = {
  name: "SplitwiseHeroV2",
  props: {
    store: { type: Object, required: true }
  },
  setup(props) {
    const handleSettle = () => {
      const note = prompt("Заметка к взаиморасчету (например: 'Перевод Тинькофф')", "Перевод закрыт");
      if (note !== null) {
        props.store.settleUp(note);
      }
    };

    const settlementHeadline = computed(() => {
      const sw = props.store.dashboard.splitwise;
      if (!sw || sw.direction === "settled" || !sw.transfers || sw.transfers.length === 0) {
        return "Расчеты закрыты · 0 ₽";
      }
      return sw.transfers.map(t => `${t.from_name} → ${formatDative(t.to_name)} · ${formatRubles(t.amount)}`).join(" · ");
    });

    const getParticipantShare = (p) => {
      const stats = props.store.dashboard.splitwise.participant_stats || [];
      const total = stats.reduce((sum, s) => sum + Math.max(0, Number(s.consumed_total) || 0), 0);
      if (total <= 0) return Math.round(100 / (stats.length || 1));
      return Math.min(100, Math.max(5, Math.round(((Number(p.consumed_total) || 0) / total) * 100)));
    };

    return { formatRubles, formatDative, handleSettle, settlementHeadline, getParticipantShare };
  },
  template: `
    <section class="v2-ledger-bar">
      <!-- Left: Status dot + Net settlement headline + action buttons -->
      <div class="v2-ledger-left">
        <div class="v2-ledger-headline-wrap">
          <span
            class="v2-status-dot"
            :class="{ settled: store.dashboard.splitwise.direction === 'settled', debt: store.dashboard.splitwise.total_unsettled_cost > 0 }"
            :title="store.dashboard.splitwise.direction === 'settled' ? 'Взаиморасчеты закрыты' : 'Требуется погашение долга'"
          ></span>
          <span class="v2-headline-text">{{ settlementHeadline }}</span>
        </div>

        <div class="v2-ledger-actions">
          <button
            class="btn btn-v2-primary btn-sm"
            :disabled="!store.dashboard.splitwise.total_unsettled_cost || store.dashboard.splitwise.total_unsettled_cost <= 0"
            @click="handleSettle"
            title="Зафиксировать оплату и закрыть текущий долг"
          >
            <span>✓</span>
            <span>Оплатил</span>
          </button>

          <button
            v-if="store.settlements && store.settlements.length > 0"
            class="btn btn-v2-subtle btn-sm"
            @click="store.undoSettlement"
            title="Отменить последний взаиморасчет"
          >
            <span>↩</span>
            <span>Отмена</span>
          </button>
        </div>
      </div>

      <!-- Center/Right: Inline participant ledger pills + visual proportional bar -->
      <div class="v2-ledger-right">
        <div class="v2-participants-pills">
          <div
            v-for="p in store.dashboard.splitwise.participant_stats"
            :key="p.id"
            class="v2-part-pill"
          >
            <span class="v2-part-dot" :style="{ backgroundColor: p.color || '#a1a1aa' }"></span>
            <span class="v2-part-name">{{ p.name }}</span>
            <span class="v2-part-divider">·</span>
            <span class="v2-part-stat">Оплатил: <b class="tabular">{{ formatRubles(p.paid_total) }}</b></span>
            <span class="v2-part-divider">·</span>
            <span class="v2-part-stat">Потребил: <b class="tabular">{{ formatRubles(p.consumed_total) }}</b></span>
            <span
              class="v2-part-delta tabular"
              :class="{ positive: p.net_balance > 0, negative: p.net_balance < 0, neutral: p.net_balance === 0 }"
              :title="'Сальдо: ' + (p.net_balance > 0 ? '+' : '') + formatRubles(p.net_balance)"
            >
              {{ p.net_balance > 0 ? '+' : '' }}{{ formatRubles(p.net_balance) }}
            </span>
          </div>
        </div>

        <!-- Proportional visual bar -->
        <div class="v2-ratio-track" title="Соотношение потребления трафика участниками">
          <div
            v-for="p in store.dashboard.splitwise.participant_stats"
            :key="p.id"
            class="v2-ratio-bar"
            :style="{ width: getParticipantShare(p) + '%', backgroundColor: p.color || '#71717a' }"
            :title="p.name + ': ' + getParticipantShare(p) + '% потребления'"
          ></div>
        </div>
      </div>
    </section>
  `
};
