/**
 * api-sync.js — Backend synchronization, PIN auth, adapters and local persistence.
 *
 * Two modes:
 * - LIVE  — the FastAPI backend is reachable. Every fetch goes through the shared
 *   api() helper which attaches X-Access-Pin (when APP_ACCESS_PIN is set) and
 *   re-prompts on 401. State shape S is built from the backend by
 *   adaptBackendToState() (see field mapping comments below).
 * - DEMO  — no backend (GitHub Pages / offline). localStorage + seed.js demo
 *   data, exactly like before.
 */

import { getInitialState } from './seed.js';

const STORAGE_KEY = 'cs-state-v1';
const PIN_KEY = 'cs-pin';
const SBP_KEY = 'cs-sbp-v1'; // локальный справочник реквизитов (бэкенд их не хранит)

/* -------------------------------------------------------------------------- */
/*  PIN helpers                                                                */
/* -------------------------------------------------------------------------- */

export function getPin() {
  try {
    return (
      sessionStorage.getItem(PIN_KEY) ||
      localStorage.getItem(PIN_KEY) ||
      ''
    ).trim();
  } catch (_) {
    return '';
  }
}

export function savePin(pin) {
  try {
    sessionStorage.setItem(PIN_KEY, pin);
    localStorage.setItem(PIN_KEY, pin);
  } catch (_) {}
}

export function clearPin() {
  try {
    sessionStorage.removeItem(PIN_KEY);
    localStorage.removeItem(PIN_KEY);
  } catch (_) {}
}

let onUnauthorized = null;

/** main.js registers a hook that shows the PIN screen and reloads data. */
export function setUnauthorizedHandler(fn) {
  onUnauthorized = typeof fn === 'function' ? fn : null;
}

function handleUnauthorized() {
  clearPin();
  if (onUnauthorized) {
    try {
      onUnauthorized();
    } catch (_) {}
  }
}

export class ApiError extends Error {
  constructor(status, detail) {
    super(detail || 'Ошибка ' + status);
    this.status = status;
    this.detail = detail || 'Ошибка ' + status;
  }
}

/* -------------------------------------------------------------------------- */
/*  Shared fetch helper — ONE entry point for every /api/* request             */
/* -------------------------------------------------------------------------- */

/**
 * api(path, opts) — fetch wrapper.
 * opts: { method, body (object), keep401 (skip global 401 hook), json:false }
 * Throws ApiError with .status and backend "detail" on any non-2xx.
 */
export async function api(path, opts = {}) {
  const { method = 'GET', body = null, keep401 = false, json = true, pin = null } = opts;
  const headers = { Accept: 'application/json' };
  if (body !== null) headers['Content-Type'] = 'application/json';
  const usePin = (pin !== null ? pin : getPin()).trim();
  if (usePin) headers['X-Access-Pin'] = usePin;

  let res;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body !== null ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch (_) {
    throw new ApiError(0, 'Нет соединения с сервером');
  }

  if (res.status === 401) {
    if (!keep401) handleUnauthorized();
    let detail = 'Требуется PIN-код доступа';
    try {
      const j = await res.json();
      if (j && typeof j.detail === 'string') detail = j.detail;
    } catch (_) {}
    throw new ApiError(401, detail);
  }

  if (!res.ok) {
    let detail = 'Ошибка ' + res.status;
    try {
      const j = await res.json();
      if (j && j.detail) {
        detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
      }
    } catch (_) {}
    throw new ApiError(res.status, detail);
  }

  if (!json) return res;
  try {
    return await res.json();
  } catch (_) {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Mode detection                                                             */
/* -------------------------------------------------------------------------- */

/**
 * detectBackend() — relative /api/auth/check probe.
 * - HTTP 200 with the auth-check payload  → LIVE, no PIN needed.
 * - HTTP 401 with a PIN detail            → LIVE, PIN required.
 * - network error / non-JSON 404 (GitHub Pages serves its own 404 page)
 *   → DEMO mode.
 */
export async function detectBackend() {
  try {
    const headers = { Accept: 'application/json' };
    const pin = getPin();
    if (pin) headers['X-Access-Pin'] = pin;
    const res = await fetch('/api/auth/check', { headers, cache: 'no-store' });
    let j = null;
    try {
      j = await res.json();
    } catch (_) {
      return { live: false };
    }
    const looksLikeAuthCheck =
      j && (typeof j.auth_required === 'boolean' || typeof j.authenticated === 'boolean');
    if (looksLikeAuthCheck) {
      const pinRequired = !!j.auth_required && (!getPin() || j.authenticated === false);
      return { live: true, pinRequired, payload: j };
    }
    // Backend with APP_ACCESS_PIN set answers 401 for /api/auth/check too.
    if (j && typeof j.detail === 'string' && /pin/i.test(j.detail)) {
      return { live: true, pinRequired: true, status: res.status };
    }
    return { live: false };
  } catch (_) {
    return { live: false };
  }
}

/**
 * Full-screen PIN prompt. Reuses .sheet/.input/.btn styles. Returns a promise
 * that resolves true once a working PIN is stored ('cs-pin').
 */
export function showPinScreen() {
  return new Promise((resolve) => {
    document.getElementById('pin-screen')?.remove();

    const root = document.createElement('div');
    root.id = 'pin-screen';
    root.innerHTML = `
      <div class="ov" data-pin-ov="1" style="z-index:80">
        <div class="sheet sm">
          <div class="sheet-h"><b>Код доступа</b><span class="pill n" data-pin-app title="Доступ к серверу">API</span></div>
          <div class="sheet-b">
            <div class="lab">Введите PIN-код сервера</div>
            <input class="input" id="pin-input" type="password" inputmode="numeric" autocomplete="off" placeholder="PIN">
            <div class="hint">PIN задаётся переменной APP_ACCESS_PIN на сервере и защищает данные от чужих.</div>
            <div class="hint" id="pin-err" style="color:var(--bad,var(--ink))"></div>
          </div>
          <div class="sheet-f"><button class="btn pri" style="width:100%" id="pin-ok">Войти</button></div>
        </div>
      </div>`;
    document.body.appendChild(root);

    const input = root.querySelector('#pin-input');
    const errEl = root.querySelector('#pin-err');
    const btn = root.querySelector('#pin-ok');
    if (input) input.focus();

    const tryPin = async () => {
      const pin = (input.value || '').trim();
      if (!pin) {
        errEl.textContent = 'Введите PIN-код';
        return;
      }
      btn.disabled = true;
      try {
        // keep401: только эта проверка реагирует ошибкой внутри формы
        await api('/api/auth/check', { keep401: true, body: null, pin });
        errEl.textContent = '';
        savePin(pin);
        root.remove();
        resolve(true);
      } catch (e) {
        errEl.textContent = e.detail || 'Неверный PIN';
        btn.disabled = false;
        input.select();
      }
    };

    btn && btn.addEventListener('click', tryPin);
    input &&
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') tryPin();
      });
  });
}

/* -------------------------------------------------------------------------- */
/*  Empty state for LIVE mode                                                  */
/* -------------------------------------------------------------------------- */

export function getEmptyState() {
  const skin = (() => {
    try { return localStorage.getItem('cs-skin'); } catch (_) { return null; }
  })() || 'pixel';
  const palPick = (() => {
    try { return localStorage.getItem('cs-pal'); } catch (_) { return null; }
  })();
  const theme = (() => {
    try { return localStorage.getItem('cs-theme'); } catch (_) { return null; }
  })() || 'auto';

  return {
    live: true,
    skin,
    palPick,
    theme,
    tab: 'home',
    me: null,
    pending: null,
    settledAt: '—',
    refreshes: 0,
    f: {},
    openHow: {},
    open: {},
    openAcc: {},
    testN: 0,
    members: [],
    accounts: [],
    bots: [],
    history: [],
    log: [],
    baseline: { paid: {}, cons: {} },
    adj: { paid: {}, cons: {} },
    transfers: [],
    providers: {},
  };
}

/* -------------------------------------------------------------------------- */
/*  Local persistence                                                          */
/* -------------------------------------------------------------------------- */

export function loadPersistedState() {
  let state = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      state = JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Could not parse localStorage state:', err);
  }

  const initial = getInitialState();

  // LIVE-сессия сохраняет только настройки интерфейса — бизнес-данные
  // всегда приходят с бэкенда. Поэтому скармливаем ей seed-данные.
  if (state && state.liveUI) {
    return {
      ...initial,
      tab: state.tab || initial.tab,
      me:
        state.me && initial.members.some((m) => m.id === state.me)
          ? state.me
          : initial.me,
      open: state.open || {},
      openAcc: state.openAcc || {},
      f: state.f || {},
      openHow: state.openHow || {},
      pending: null,
      baseline: { paid: {}, cons: {} },
      adj: { paid: {}, cons: {} },
      skin: localStorage.getItem('cs-skin') || initial.skin,
      palPick: localStorage.getItem('cs-pal') || initial.palPick,
      theme: localStorage.getItem('cs-theme') || initial.theme,
      live: false,
    };
  }

  if (!state) {
    return { ...initial, live: false };
  }

  // Ensure mandatory fields exist if schema evolved
  return {
    ...initial,
    ...state,
    live: false,
    skin: localStorage.getItem('cs-skin') || state.skin || initial.skin,
    palPick: localStorage.getItem('cs-pal') || state.palPick || initial.palPick,
    theme: localStorage.getItem('cs-theme') || state.theme || initial.theme,
    members: state.members && state.members.length ? state.members : initial.members,
    accounts: state.accounts && state.accounts.length ? state.accounts : initial.accounts,
    bots: state.bots && state.bots.length ? state.bots : initial.bots,
    history: state.history || initial.history,
    log: state.log || initial.log,
    baseline: state.baseline || initial.baseline,
    adj: state.adj || initial.adj,
    open: state.open || initial.open || {},
    openAcc: state.openAcc || state.open || initial.openAcc || {},
    f: state.f || initial.f || {},
    openHow: state.openHow || state.f || initial.openHow || {},
  };
}

export function persistState(state) {
  try {
    let toSave;
    if (state.live) {
      // LIVE: бизнес-данные на бэкенде — храним только UI-настройки
      toSave = {
        liveUI: true,
        tab: state.tab,
        me: state.me,
        open: state.open,
        openAcc: state.openAcc,
        f: state.f,
        openHow: state.openHow,
      };
    } else {
      toSave = {
        tab: state.tab,
        me: state.me,
        pending: state.pending,
        settledAt: state.settledAt,
        refreshes: state.refreshes,
        members: state.members,
        accounts: state.accounts,
        bots: state.bots,
        history: state.history,
        log: state.log,
        baseline: state.baseline,
        adj: state.adj,
        open: state.open,
        openAcc: state.openAcc,
        f: state.f,
        openHow: state.openHow,
      };
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    if (state.skin) localStorage.setItem('cs-skin', state.skin);
    if (state.palPick) localStorage.setItem('cs-pal', state.palPick);
    if (state.theme) localStorage.setItem('cs-theme', state.theme);
  } catch (err) {
    console.warn('Could not persist state:', err);
  }
}

/* Local-only СБП реквизиты (бэкенд их не хранит) */
export function getLocalSbp() {
  try {
    return JSON.parse(localStorage.getItem(SBP_KEY) || '{}') || {};
  } catch (_) {
    return {};
  }
}

export function setLocalSbp(id, value) {
  try {
    const all = getLocalSbp();
    all[id] = value;
    localStorage.setItem(SBP_KEY, JSON.stringify(all));
  } catch (_) {}
}

/* -------------------------------------------------------------------------- */
/*  Backend → frontend state adapter                                           */
/* -------------------------------------------------------------------------- */

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function fmtDay(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.getUTCDate() + ' ' + (MONTHS_SHORT[d.getUTCMonth()] || '');
}

/** '2026-10-21T10:31:00Z' → минуты назад (для ago()) */
function minsAgo(iso) {
  if (!iso) return 99999;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return 99999;
  return Math.max(0, Math.round((Date.now() - t) / 60000));
}

/** backend consumer ('split' | 'unassigned' | member id) → frontend ('all' | null | member id) */
const mapConsumer = (c) => (c === 'split' ? 'all' : c === 'unassigned' ? null : c);

const AUDIT_TEXT = {
  update_payer: 'Смена плательщика аккаунта',
  update_consumer: 'Смена потребителя CDN-ресурса',
  manual_usage_input: 'Введён трафик вручную',
  create_transfer: 'Создан перевод',
  confirm_transfer: 'Перевод подтверждён',
  reject_transfer: 'Перевод отклонён',
  cancel_transfer: 'Перевод отменён',
};

/**
 * adaptBackendToState(bundle, prev) → partial S (members/accounts/bots/…).
 *
 * Данные: GET /api/dashboard (биллинг), /api/overview (traffic_14d, transfers,
 * audit_log), /api/telegram, /api/settlements, /api/providers (каталог полей).
 *
 * Поля, которых нет в бэкенде, и как они выведены:
 *  - member.sbp        — реквизиты хранятся локально (cs-sbp-v1);
 *  - account.topup     — пополнения не хранятся → 0;
 *  - account.newRule   — правила «новых CDN» нет у аккаунтов бэкенда → 'ask';
 *  - res.gb            — unsettled_gb (трафик со времени последнего расчёта);
 *  - res.h             — traffic_14d из /api/overview (или [total_gb]);
 *  - res.up            — http_status !== 'down';
 *  - history.tr        — направление определяется из net_balance расчёта
 *                        (net>0 → max должен misha), содержимое note в how;
 *  - bots.ev           — 4 канала бэкенда → balance/key/down/paid,
 *                        spike/newcdn/weekly каналов в бэкенде нет → 0.
 */
export function adaptBackendToState(bundle, prev) {
  const { dash, overview, bots = [], settlements = [], providers = null } = bundle;
  if (!dash) throw new ApiError(500, 'Пустой ответ /api/dashboard');

  const participants = dash.participants || (overview && overview.members) || [];
  const names = {};
  participants.forEach((p) => (names[p.id] = p.name));

  const localSbp = getLocalSbp();
  const members = participants.map((p) => ({
    id: p.id,
    name: p.name,
    sbp: localSbp[p.id] || '',
  }));

  // 14-дневная история трафика из /api/overview
  const traffic14 = {};
  (overview && overview.accounts ? overview.accounts : []).forEach((a) =>
    (a.resources || []).forEach((r) => (traffic14[r.id] = r.traffic_14d || []))
  );

  const accounts = (dash.accounts || []).map((a) => {
    const allManual = a.resources.length > 0 && a.resources.every((r) => r.is_manual);
    const creds = allRawCredsMasked(a);
    return {
      id: a.id,
      // режим подключения: все ресурсы вводились вручную → считаем ручным
      source: allManual ? 'manual' : 'api',
      prov: a.provider,
      name: a.name,
      login: a.account_identifier || '',
      balance: a.balance_rub,
      bonus: a.bonus_balance_rub,
      bonusSpent: a.bonus_spend_rub,
      topup: 0, // бэкенд не хранит пополнения
      payer: a.payer,
      freeGb: a.free_tier_gb,
      price: a.price_per_gb,
      countBonus: !a.ignore_bonus,
      newRule: 'ask',
      status: ['error', 'auth_error'].includes(String(a.sync_status)) ? 'error' : 'ok',
      updated: minsAgo(a.last_synced_at),
      // маскированные креденшалы — только для формы редактирования
      credentials: creds,
      res: (a.resources || []).map((r) => {
        let h = (traffic14[r.id] || []).map(Number);
        if (!h.length) h = [Number(r.unsettled_gb) || 0];
        const consumer = mapConsumer(r.consumer);
        return {
          id: r.id,
          domain: r.domain,
          tech: r.cname || '—',
          up: String(r.http_status) !== 'down',
          gb: Number(r.unsettled_gb) || 0,
          consumer,
          isNew: consumer === null,
          h,
        };
      }),
    };
  });

  const botsState = (bots || []).map((b) => ({
    id: b.id,
    name: b.name,
    chat: b.chat_id,
    ev: {
      balance: b.notify_low_balance ? 1 : 0,
      key: b.notify_api_error ? 1 : 0,
      down: b.notify_cdn_down ? 1 : 0,
      paid: b.notify_settlement ? 1 : 0,
      // каналов spike/newcdn/weekly в бэкенде нет
      spike: 0,
      newcdn: 0,
      weekly: 0,
    },
  }));

  // История расчётов ← /api/settlements
  const twoHas = (id) => members.some((m) => m.id === id);
  const classicPair = twoHas('misha') && twoHas('max');
  const history = (settlements || []).map((s) => {
    const net = Number(s.net_balance) || 0;
    let tr = [];
    if (classicPair && Math.abs(net) >= 1) {
      // net_balance = max_owes_misha − misha_owes_max → направление долга
      tr = [{ from: net > 0 ? 'max' : 'misha', to: net > 0 ? 'misha' : 'max', sum: Math.round(Math.abs(net)) }];
    }
    return {
      id: s.id,
      date: fmtDay(s.settled_at),
      tr,
      paid: {},
      cons: {},
      how: s.note || 'Расчёт через API',
    };
  });

  const log = ((overview && overview.audit_log) || []).map((e) => ({
    d: fmtDay(e.created_at),
    t: AUDIT_TEXT[e.action] || String(e.action || 'событие').replace(/_/g, ' '),
  }));

  const pendingTransfer = ((overview && overview.transfers) || []).find(
    (t) => t.status === 'pending'
  );
  const pending = pendingTransfer ? { by: pendingTransfer.from_member } : null;

  const settledAt = (settlements && settlements[0] ? fmtDay(settlements[0].settled_at) : '—');

  // S.me: сохраняем текущего, если он есть среди участников
  let me = prev && prev.me;
  if (!members.some((m) => m.id === me)) {
    me = (twoHas('misha') ? 'misha' : null) || (members[0] ? members[0].id : null);
  }

  const provCatalog = {};
  (providers || []).forEach((p) => (provCatalog[p.id] = p));

  return {
    live: true,
    members,
    accounts,
    bots: botsState,
    history,
    log,
    pending,
    settledAt,
    me,
    transfers: (overview && overview.transfers) || [],
    providers: provCatalog,
  };
}

function allRawCredsMasked(a) {
  const out = {};
  const creds = a && a.credentials;
  if (creds && typeof creds === 'object') {
    Object.keys(creds).forEach((k) => {
      const v = creds[k];
      out[k] = v === undefined || v === null ? '' : String(v);
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Live data fetching                                                         */
/* -------------------------------------------------------------------------- */

export async function fetchLiveBundle() {
  const [dash, overview, tgbots, settlements, catalog] = await Promise.all([
    api('/api/dashboard'),
    api('/api/overview'),
    api('/api/telegram').catch(() => []),
    api('/api/settlements?limit=20').catch(() => []),
    api('/api/providers').catch(() => null),
  ]);
  return { dash, overview, bots: tgbots || [], settlements: settlements || [], providers: catalog || [] };
}

/* -------------------------------------------------------------------------- */
/*  Mutations (LIVE)                                                           */
/* -------------------------------------------------------------------------- */

export const liveApi = {
  /* participants */
  createParticipant: (name) => api('/api/participants', { method: 'POST', body: { name } }),
  updateParticipant: (id, patch) => api(`/api/participants/${id}`, { method: 'PUT', body: patch }),
  deleteParticipant: (id) => api(`/api/participants/${id}`, { method: 'DELETE' }),

  /* accounts */
  createAccount: (payload) => api('/api/accounts', { method: 'POST', body: payload }),
  updateAccount: (id, payload) => api(`/api/accounts/${id}`, { method: 'PUT', body: payload }),
  deleteAccount: (id) => api(`/api/accounts/${id}`, { method: 'DELETE' }),
  validateCredentials: (provider, credentials) =>
    api('/api/accounts/validate', { method: 'POST', body: { provider, credentials } }),
  syncAll: () => api('/api/sync/all', { method: 'POST', body: {} }),
  syncOne: (id) => api(`/api/accounts/${id}/sync`, { method: 'POST', body: {} }),

  /* assignments */
  setPayer: (accountId, memberId) =>
    api(`/api/accounts/${accountId}/payer`, { method: 'PUT', body: { memberId } }),
  setConsumer: (resourceId, body) =>
    api(`/api/resources/${resourceId}/consumer`, { method: 'PUT', body }),

  /* manual usage */
  manualUsage: (accountId, payload) =>
    api(`/api/accounts/${accountId}/manual-usage`, { method: 'POST', body: payload }),

  /* transfers & settlements */
  createTransfer: (from_member, to_member, amount_rub, status = 'pending', note = null) =>
    api('/api/transfers', { method: 'POST', body: { from_member, to_member, amount_rub, status, note } }),
  confirmTransfer: (id) => api(`/api/transfers/${id}/confirm`, { method: 'POST', body: {} }),
  rejectTransfer: (id) => api(`/api/transfers/${id}/reject`, { method: 'POST', body: {} }),
  settle: (note = null) => api('/api/settle', { method: 'POST', body: { note } }),
  undoSettlement: () => api('/api/settlements/undo', { method: 'POST', body: {} }),

  /* telegram bots */
  createBot: (payload) => api('/api/telegram', { method: 'POST', body: payload }),
  updateBot: (id, patch) => api(`/api/telegram/${id}`, { method: 'PUT', body: patch }),
  deleteBot: (id) => api(`/api/telegram/${id}`, { method: 'DELETE' }),
  testBot: (id) => api(`/api/telegram/${id}/test`, { method: 'POST', body: {} }),
};

/* Директория бэка для CSV — с PIN-заголовком, но без JSON */
export async function downloadBackendCsv(filename = 'history.csv') {
  const res = await api('/api/history.csv', { json: false });
  const blob = await res.blob();
  const u = document.createElement('a');
  u.href = URL.createObjectURL(blob);
  u.download = filename;
  u.click();
  setTimeout(() => URL.revokeObjectURL(u.href), 1000);
}
