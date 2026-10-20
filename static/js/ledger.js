/**
 * ledger.js — Calculation engine for CDN Splitwise
 * Implements:
 * - Resource cost breakdown (Free GB tier distribution, bonus deduction)
 * - Runway estimation (days until account balance depletion)
 * - Traffic spike detection (last day vs 7-day average)
 * - Account health and problem indicators
 * - Multi-member 2-step settlement and net balance matrix
 * - "With immediate effect" (с этого момента) adjustments preservation
 * - Context-aware CTA button states based on active viewer
 */

import { DAY, DIM, F } from './seed.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  }[c]));

export const rub = (n) => Math.round(Number(n) || 0).toLocaleString('ru-RU') + ' ₽';
export const gb = (n) => Math.round(Number(n) || 0).toLocaleString('ru-RU') + ' ГБ';

export const mem = (id, state) => state.members.find((m) => m.id === id);
export const nm = (id, state) => {
  const m = mem(id, state);
  return m ? esc(m.name) : '—';
};

export const av = (id, state, lg = false) => {
  const m = mem(id, state);
  return m
    ? `<span class="av ${lg ? 'lg' : ''}">${esc(m.name[0].toUpperCase())}</span>`
    : '';
};

export const ago = (m) => {
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин назад`;
  if (m < 1440) return `${Math.floor(m / 60)} ч назад`;
  return `${Math.floor(m / 1440)} дн назад`;
};

export function accCalc(a, day = DAY) {
  const total = (a.res || []).reduce((s, r) => s + (Number(r.gb) || 0), 0);
  const freeUsed = Math.min(Number(a.freeGb) || 0, total);
  const billable = total ? (total - freeUsed) / total : 0;

  let costs = (a.res || []).map((r) => (Number(r.gb) || 0) * billable * (Number(a.price) || 0));
  let sum = costs.reduce((s, c) => s + c, 0);
  let k = 1;

  if (!a.countBonus && sum > 0) {
    const bonusSpent = Number(a.bonusSpent) || 0;
    k = Math.max(0, sum - bonusSpent) / sum;
    costs = costs.map((c) => c * k);
    sum *= k;
  }

  const daily = day > 0 ? sum / day : 0;
  const funds = (Number(a.balance) || 0) + (Number(a.bonus) || 0);
  const days = daily > 0 ? funds / daily : Infinity;

  return { total, freeUsed, costs, sum, k, days, funds };
}

export const spikeX = (r) => {
  const h = r.h || [];
  if (h.length < 2) return 1;
  const last = h[h.length - 1];
  const pv = h.slice(-8, -1);
  if (!pv.length) return 1;
  const avg = pv.reduce((s, v) => s + v, 0) / pv.length;
  return avg > 0 ? last / avg : 1;
};

export function health(a, day = DAY) {
  const c = accCalc(a, day);
  const f = [];

  if (a.status === 'error') {
    f.push('key');
  } else if (c.days < 3) {
    f.push('low2');
  } else if (c.days < 7) {
    f.push('low1');
  }

  (a.res || []).forEach((r) => {
    if (!r.up) f.push('down');
    if (r.consumer === null) f.push('new');
    if (spikeX(r) >= 2.5) f.push('spike');
  });

  const sev = f.some((x) => ['key', 'low2', 'down'].includes(x)) ? 2 : f.length ? 1 : 0;
  return { c, f, sev };
}

export function contrib(consumer, x, members) {
  const o = {};
  members.forEach((m) => {
    o[m.id] = 0;
  });

  if (consumer === 'all') {
    const share = members.length > 0 ? x / members.length : 0;
    members.forEach((m) => {
      o[m.id] = share;
    });
  } else if (consumer && o[consumer] !== undefined) {
    o[consumer] = x;
  }
  return o;
}

export function calc(state, day = DAY) {
  const raw = { paid: {}, cons: {} };
  state.members.forEach((m) => {
    raw.paid[m.id] = (state.adj && state.adj.paid && state.adj.paid[m.id]) || 0;
    raw.cons[m.id] = (state.adj && state.adj.cons && state.adj.cons[m.id]) || 0;
  });

  let unalloc = 0;
  let unallocN = 0;

  state.accounts.forEach((a) => {
    const c = accCalc(a, day);
    if (raw.paid[a.payer] !== undefined) {
      raw.paid[a.payer] += c.sum;
    }

    (a.res || []).forEach((r, i) => {
      if (r.consumer === null) {
        unalloc += c.costs[i] || 0;
        unallocN++;
        return;
      }
      const o = contrib(r.consumer, c.costs[i] || 0, state.members);
      state.members.forEach((m) => {
        raw.cons[m.id] += o[m.id] || 0;
      });
    });
  });

  const paid = {};
  const cons = {};
  const bal = {};

  const baselinePaid = (state.baseline && state.baseline.paid) || {};
  const baselineCons = (state.baseline && state.baseline.cons) || {};

  state.members.forEach((m) => {
    paid[m.id] = (raw.paid[m.id] || 0) - (baselinePaid[m.id] || 0);
    cons[m.id] = (raw.cons[m.id] || 0) - (baselineCons[m.id] || 0);
    bal[m.id] = paid[m.id] - cons[m.id];
  });

  const cr = state.members
    .filter((m) => bal[m.id] > 0.5)
    .map((m) => ({ id: m.id, v: bal[m.id] }))
    .sort((a, b) => b.v - a.v);

  const db = state.members
    .filter((m) => bal[m.id] < -0.5)
    .map((m) => ({ id: m.id, v: -bal[m.id] }))
    .sort((a, b) => b.v - a.v);

  const tr = [];
  let i = 0;
  let j = 0;

  while (i < db.length && j < cr.length) {
    const s = Math.min(db[i].v, cr[j].v);
    if (s >= 1) {
      tr.push({ from: db[i].id, to: cr[j].id, sum: Math.round(s) });
    }
    db[i].v -= s;
    cr[j].v -= s;
    if (db[i].v < 0.5) i++;
    if (cr[j].v < 0.5) j++;
  }

  return { raw, paid, cons, bal, tr, unalloc, unallocN };
}

/**
 * Freeze accumulated debt when assignment changes "from now on" (с этого момента).
 * Past cost stays with former payer or consumer.
 */
export function freeze(kind, oldv, newv, x, state) {
  if (!state.adj) state.adj = { paid: {}, cons: {} };
  if (!state.adj.paid) state.adj.paid = {};
  if (!state.adj.cons) state.adj.cons = {};

  if (kind === 'cons') {
    // Retroactive assignment for newly discovered CDN: past applies to assigned consumer
    if (oldv === null) return;
    const b = contrib(oldv, x, state.members);
    const a = contrib(newv, x, state.members);
    state.members.forEach((m) => {
      state.adj.cons[m.id] = (state.adj.cons[m.id] || 0) + (b[m.id] || 0) - (a[m.id] || 0);
    });
  } else {
    // Kind === 'paid'
    state.adj.paid[oldv] = (state.adj.paid[oldv] || 0) + x;
    state.adj.paid[newv] = (state.adj.paid[newv] || 0) - x;
  }
}

export function ctaState(c, state) {
  if (!c.tr || !c.tr.length) return null;

  const out = c.tr.filter((t) => t.from === state.me);
  const inn = c.tr.filter((t) => t.to === state.me);
  const sum = (x) => x.reduce((s, t) => s + t.sum, 0);

  if (state.pending) {
    if (inn.length) {
      return {
        label: 'Подтвердить получение',
        a: 'confirm',
        note: `${nm(state.pending.by, state)} отметил перевод ${rub(sum(inn))}`,
        short: 'Подтвердить',
      };
    }
    if (state.pending.by === state.me) {
      return {
        label: 'Ждём подтверждения',
        a: 'cancelSent',
        wait: 1,
        note: `${nm(c.tr[0].to, state)} получит уведомление в Telegram`,
        short: 'Отменить',
      };
    }
    return {
      label: 'Ожидаем подтверждения',
      a: null,
      wait: 1,
      note: '',
      short: '…',
    };
  }

  if (out.length) {
    const targetMember = mem(out[0].to, state);
    return {
      label: `Я перевёл ${rub(sum(out))}`,
      a: 'sent',
      note: '',
      short: 'Я перевёл',
      sec: [['Реквизиты ' + (targetMember ? targetMember.name : ''), 'copy', out[0].to]],
    };
  }

  if (inn.length) {
    return {
      label: 'Мне перевели',
      a: 'confirm',
      note: '',
      short: 'Мне перевели',
      sec: [['Напомнить', 'remindDebt']],
    };
  }

  return {
    label: '',
    a: null,
    note: 'Вас этот расчёт не касается',
    short: '',
  };
}

export function settle(how, state) {
  const c = calc(state);
  const prev = JSON.parse(JSON.stringify(state.baseline || { paid: {}, cons: {} }));
  const prevAt = state.settledAt;

  const e = {
    id: Date.now(),
    date: 'сегодня',
    tr: c.tr,
    paid: { ...c.paid },
    cons: { ...c.cons },
    prev,
    prevAt,
    how,
  };

  if (!state.history) state.history = [];
  state.history.unshift(e);

  if (!state.baseline) state.baseline = { paid: {}, cons: {} };
  state.members.forEach((m) => {
    state.baseline.paid[m.id] = c.raw.paid[m.id];
    state.baseline.cons[m.id] = c.raw.cons[m.id];
  });

  state.settledAt = 'сегодня';
  state.pending = null;
  return e;
}

export function undoSettle(id, state) {
  if (!state.history || !state.history.length) return false;
  const i = state.history.findIndex((h) => h.id === id);
  if (i !== 0) return false;
  const h = state.history.shift();
  if (h && h.prev) state.baseline = h.prev;
  state.settledAt = (h && h.prevAt) || state.settledAt;
  return true;
}
