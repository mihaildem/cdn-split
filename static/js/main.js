/**
 * main.js — Application Entry Point for CDN Splitwise (cdn/split)
 * Integrates:
 * - Reactive state & LocalStorage / API synchronization
 * - 3 Skins (Pixel, Air, Orbit) × 5 Palettes × Light/Dark/Auto Themes
 * - Animated SVG brand mark with states (intro, debt, spin, merge, busy)
 * - Navigation & Tabs (Главная, История, Настройки)
 * - Two-step settlement flow, undoable assignment changes, CSV export
 */

import { DAY, DIM, F, SKINS, SKIN_PAL, PALS, PROV, PROV_API_KEYS, ICONS, CHK_S, XX, mk } from './seed.js';
import { getBrandMarkSVG, triggerLogoAnim, updateBrandDebtState } from './brand-mark.js';
import { esc, rub, gb, mem, nm, av, ago, accCalc, spikeX, health, calc, freeze, settle, undoSettle } from './ledger.js';
import {
  loadPersistedState,
  persistState,
  getEmptyState,
  detectBackend,
  fetchLiveBundle,
  adaptBackendToState,
  api,
  ApiError,
  showPinScreen,
  setUnauthorizedHandler,
  liveApi,
  downloadBackendCsv,
  setLocalSbp,
} from './api-sync.js';
import { renderHome, updateSbar } from './render-overview.js';
import { renderHist, exportCSV } from './render-history.js';
import { renderSet, appearHTML, curPal } from './render-settings.js';
import {
  sheet,
  closeSheet,
  toast,
  openAccSheet,
  refreshAccForm,
  openManualUsageSheet,
  openAddBotSheet,
  openAppearSheet,
  getActiveDraft,
  setActiveDraft,
  toggleHelp,
  setTestResult,
} from './render-modals.js';

const $ = (selector) => document.querySelector(selector);

// Initialize State
let S = loadPersistedState();

/* ------------------------------------------------------------------------ */
/*  LIVE / DEMO mode                                                         */
/*  LIVE  — backend reachable: state built from /api/*, actions wired to API. */
/*  DEMO  — no backend (GitHub Pages / offline): localStorage + seed, as     */
/*          before. A small DEMO pill in the header marks this mode.         */
/* ------------------------------------------------------------------------ */

function updateModePill() {
  const p = document.getElementById('mode-pill');
  // показываем только в подтверждённом демо-режиме
  if (p) p.hidden = !(S.live === false);
}

function showApiError(err, fallback) {
  const d = (err && (err.detail || err.message)) || fallback || 'Ошибка';
  toast('Ошибка: ' + d);
}

/** Re-fetch dashboard/overview/telegram/settlements and re-render. */
async function reloadLive() {
  try {
    const bundle = await fetchLiveBundle();
    Object.assign(S, adaptBackendToState(bundle, S));
    render();
    updateModePill();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return; // PIN hook already re-prompting
    showApiError(err, 'Не удалось загрузить данные');
  }
}

/** 401 from any api() call → clear stored PIN, show prompt, reload. */
setUnauthorizedHandler(async () => {
  const ok = await showPinScreen();
  if (ok) await reloadLive();
});

async function boot() {
  const det = await detectBackend();
  if (det.live) {
    // LIVE: старт с пустого состояния (без демо-участников/аккаунтов/ботов)
    S = getEmptyState();
    render();
    if (det.pinRequired) await showPinScreen();
    await reloadLive();
  } else {
    // DEMO: текущее поведение localStorage + seed
    S.live = false;
    updateModePill();
  }
}

const is401 = (err) => err instanceof ApiError && err.status === 401;

/* Собирает креденшалы из черновика формы аккаунта по ключам каталога бэкенда */
function collectDraftCreds(draft, provKey) {
  const out = {};
  const bp = S.live && S.providers && S.providers[provKey];
  if (bp && Array.isArray(bp.fields) && bp.fields.length) {
    bp.fields.forEach((f) => {
      const val = draft['cred:' + f.key];
      if (val !== undefined && String(val).trim() !== '') out[f.key] = String(val).trim();
    });
  } else {
    // Фолбэк: поля seed.js → ключи каталога бэкенда по порядку
    const keys = PROV_API_KEYS[provKey] || [];
    keys.forEach((k, i) => {
      const val = draft['k' + i];
      if (val !== undefined && String(val).trim() !== '') out[k] = String(val).trim();
    });
  }
  return out;
}

const num = (x) => {
  const n = parseFloat(String(x ?? '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
};

const consBody = (v) => (v === null || v === undefined ? { mode: 'unassigned' } : { consumer: v === 'all' ? 'split' : v });

const snap = () => JSON.stringify({ adj: S.adj, accounts: S.accounts });
const restore = (j) => {
  try {
    const o = JSON.parse(j);
    S.adj = o.adj;
    S.accounts = o.accounts;
  } catch (e) {
    console.error('Failed to restore snapshot:', e);
  }
};

function logChange(t) {
  if (!S.log) S.log = [];
  S.log.unshift({ d: 'сегодня', t });
}

function applySkin() {
  const h = document.documentElement;
  h.dataset.skin = S.skin;
  h.dataset.pal = curPal(S);
  try {
    localStorage.setItem('cs-skin', S.skin);
    localStorage.setItem('cs-pal', curPal(S));
  } catch (_) {}
}

function setSkin(v) {
  const h = document.documentElement;
  if (h.classList) h.classList.add('tx');
  S.skin = v;
  applySkin();
  applyTheme();
  render();
  setTimeout(() => h.classList && h.classList.remove('tx'), 450);
}

function setPal(v) {
  const h = document.documentElement;
  if (h.classList) h.classList.add('tx');
  S.palPick = v;
  try {
    localStorage.setItem('cs-pal', v);
  } catch (_) {}
  applySkin();
  applyTheme();
  render();
  setTimeout(() => h.classList && h.classList.remove('tx'), 450);
}

function applyTheme() {
  const t =
    S.theme === 'auto'
      ? window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : S.theme;
  document.documentElement.dataset.t = t;

  const m = document.querySelector('meta[name=theme-color]');
  if (m && typeof getComputedStyle === 'function') {
    const c = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    if (c) m.setAttribute('content', c);
  }
  try {
    localStorage.setItem('cs-theme', S.theme);
  } catch (_) {}
}

function setTheme(v) {
  const h = document.documentElement;
  if (h.classList) h.classList.add('tx');
  S.theme = v;
  applyTheme();
  render();
  setTimeout(() => h.classList && h.classList.remove('tx'), 450);
}

function setAssign(kind, a, r, v) {
  if (S.live) {
    liveSetAssign(kind, a, r, v);
    return;
  }
  const before = snap();
  const c = accCalc(a);

  if (kind === 'cons') {
    const i = a.res.indexOf(r);
    const old = r.consumer;
    freeze('cons', old, v, c.costs[i], S);
    r.consumer = v;
    logChange(
      `${esc(r.domain)} → потребитель: ${v === 'all' ? 'поровну' : nm(v, S)}${old === null ? ' · за весь период' : ' · с этой даты'}`
    );
    toast(
      old === null
        ? `${esc(r.domain)}: назначено — за весь период`
        : `Действует с сегодня · прошлое остаётся за ${old === 'all' ? 'всеми' : nm(old, S)}`,
      () => {
        restore(before);
        S.log.shift();
        render();
      }
    );
  } else {
    const old = a.payer;
    if (old === v) return;
    freeze('paid', old, v, c.sum, S);
    a.payer = v;
    logChange(`${nm(v, S)} стал платить за ${esc(a.name)} · с этой даты`);
    toast(`Действует с сегодня · прошлое остаётся за ${nm(old, S)}`, () => {
      restore(before);
      S.log.shift();
      render();
    });
  }
  persistState(S);
  render();
}

/** LIVE: смена плательщика/потребителя через API, затем перезагрузка данных. */
async function liveSetAssign(kind, a, r, v) {
  const accId = a.id;
  const resId = r.id;
  const domain = r.domain;
  const accName = a.name;
  const oldPayer = a.payer;
  const oldCons = r.consumer;
  try {
    if (kind === 'cons') {
      await liveApi.setConsumer(resId, consBody(v));
    } else {
      await liveApi.setPayer(accId, v);
    }
    await reloadLive();
    if (kind === 'cons') {
      toast(
        `${esc(domain)} → потребитель: ${v === 'all' ? 'поровну' : nm(v, S)} · с сегодня`,
        () => revertLive('cons', resId, oldCons)
      );
    } else {
      toast(`${nm(v, S)} стал платить за ${esc(accName)} · с сегодня`, () =>
        revertLive('paid', accId, oldPayer)
      );
    }
  } catch (err) {
    if (!is401(err)) showApiError(err);
  }
}

/** Отмена назначения (toast «Отменить») — повторный вызов API со старым значением. */
async function revertLive(kind, id, oldVal) {
  try {
    if (kind === 'cons') {
      await liveApi.setConsumer(id, consBody(oldVal));
    } else {
      await liveApi.setPayer(id, oldVal);
    }
    await reloadLive();
  } catch (err) {
    if (!is401(err)) showApiError(err);
  }
}

/** LIVE: «Я перевёл» — pending-переводы от моего имени. */
async function liveSent() {
  const c = calc(S);
  const out = c.tr.filter((t) => t.from === S.me);
  if (!out.length) {
    toast('Вас этот расчёт не касается');
    return;
  }
  try {
    for (const t of out) {
      await liveApi.createTransfer(t.from, t.to, t.sum, 'pending', 'Отметка «Я перевёл»');
    }
    await reloadLive();
    toast(`Отметили перевод. ${out[0] ? nm(out[0].to, S) : ''} получит уведомление в Telegram`);
  } catch (err) {
    if (!is401(err)) showApiError(err, 'Не удалось отметить перевод');
  }
}

/** LIVE: снять свою отметку «Я перевёл» (pending → rejected). */
async function liveCancelSent() {
  const list = (S.transfers || []).filter(
    (t) => t.status === 'pending' && t.from_member === S.me
  );
  try {
    for (const t of list) await liveApi.rejectTransfer(t.id);
    await reloadLive();
    toast('Отметка о переводе отменена');
  } catch (err) {
    if (!is401(err)) showApiError(err, 'Не удалось отменить отметку');
  }
}

/**
 * LIVE: подтверждение расчёта. Если есть pending-перевод — подтверждаем его,
 * иначе создаём confirmed-переводы по расчёту; затем POST /api/settle
 * обнуляет незакрытые расходы (водяные знаки).
 */
async function liveConfirm() {
  const c = calc(S);
  const pending = (S.transfers || []).find((t) => t.status === 'pending');
  const note = pending
    ? `${nm(pending.from_member, S)} отметил · ${nm(S.me, S)} подтвердил`
    : `${nm(S.me, S)} подтвердил без запроса`;
  try {
    if (pending) {
      await liveApi.confirmTransfer(pending.id);
    } else if (c.tr.length) {
      for (const t of c.tr) {
        await liveApi.createTransfer(t.from, t.to, t.sum, 'confirmed', note);
      }
    }
    await liveApi.settle(note);
    render();
    triggerLogoAnim('merge');
    await reloadLive();
    toast('Расчёт записан в историю', () => liveUndoSettle());
  } catch (err) {
    if (!is401(err)) showApiError(err, 'Не удалось записать расчёт');
  }
}

/** LIVE: отмена последнего расчёта (восстановление водяных знаков). */
async function liveUndoSettle() {
  try {
    await liveApi.undoSettlement();
    await reloadLive();
    toast('Расчёт отменён');
  } catch (err) {
    if (!is401(err)) showApiError(err);
  }
}

/** LIVE: создание/обновление аккаунта (POST/PUT /api/accounts). Креденшалы
 *  write-only: бэкенд шифрует их и возвращает замаскированный токен. */
async function liveSaveAcc(draft, editId) {
  const creds = collectDraftCreds(draft, draft.prov);
  if (!editId) {
    // при создании маскированные значения не отправляем
    Object.keys(creds).forEach((k) => {
      if (String(creds[k]).startsWith('••••')) delete creds[k];
    });
  }
  const payload = {
    provider: draft.prov,
    name: draft.name || (PROV[draft.prov] ? PROV[draft.prov].n : 'CDN Account'),
    payer: draft.payer || S.me || 'misha',
    free_tier_gb: num(draft.freeGb),
    price_per_gb: num(draft.price) || 1.5,
    ignore_bonus: !draft.countBonus,
    low_balance_threshold: 200,
  };
  if (draft.source === 'manual') {
    payload.balance_rub = num(draft.balance);
  }
  if (Object.keys(creds).length) payload.credentials = creds;
  try {
    if (editId) {
      await liveApi.updateAccount(editId, payload);
    } else {
      await liveApi.createAccount(payload);
    }
    closeSheet();
    await reloadLive();
    toast(editId ? 'Аккаунт сохранён' : 'Аккаунт подключён, ресурсы загружены');
  } catch (err) {
    if (!is401(err)) showApiError(err, 'Не удалось сохранить аккаунт');
  }
}

/** LIVE: ручной ввод трафика (POST /api/accounts/{id}/manual-usage).
 *  Бэкенд ПРИБАВляет введённые ГБ к ресурсу, поэтому отправляем дельту:
 *  «введённое − текущее». Баланс отправляем как есть. */
async function liveSaveManual(aObj) {
  const balEl = document.getElementById('macc-bal');
  const resources = [];
  (aObj.res || []).forEach((r) => {
    const el = document.getElementById(`mres-${r.id}`);
    if (!el) return;
    const delta = num(el.value) - (Number(r.gb) || 0);
    if (Math.abs(delta) > 0.001) resources.push({ resource_id: r.id, gb: delta });
  });
  const body = { resources };
  if (balEl) body.balance_rub = num(balEl.value);
  try {
    await liveApi.manualUsage(aObj.id, body);
    closeSheet();
    await reloadLive();
    toast('Данные трафика обновлены вручную');
  } catch (err) {
    if (!is401(err)) showApiError(err, 'Не удалось сохранить трафик');
  }
}

export function goHome() {
  S.tab = 'home';
  closeSheet();
  render();
  window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  triggerLogoAnim('spin');
}

function syncLookPop(state) {
  const pop = document.getElementById('look-pop');
  if (!pop) return;
  const skin = state.skin;
  const pal = curPal(state);
  const theme = state.theme;
  pop.querySelectorAll('[data-a="skin"]').forEach((b) => b.classList.toggle('on', b.dataset.v === skin));
  pop.querySelectorAll('[data-a="pal"]').forEach((b) => b.classList.toggle('on', b.dataset.v === pal));
  pop.querySelectorAll('[data-a="theme"]').forEach((b) => b.classList.toggle('on', b.dataset.v === theme));
  const lookBtn = document.getElementById('look-btn');
  if (lookBtn) lookBtn.setAttribute('aria-expanded', String(pop.classList.contains('open')));
}

function closeLookPop() {
  const pop = document.getElementById('look-pop');
  if (pop && pop.classList.contains('open')) {
    pop.classList.remove('open');
    pop.setAttribute('aria-hidden', 'true');
    const lookBtn = document.getElementById('look-btn');
    if (lookBtn) lookBtn.setAttribute('aria-expanded', 'false');
  }
}

function render() {
  const items = [
    ['home', 'Главная', ICONS.home],
    ['hist', 'История', ICONS.hist],
    ['set', 'Настройки', ICONS.set],
  ];

  const topNav = $('#topnav');
  if (topNav) {
    topNav.innerHTML = items
      .map(
        (i) => `<button class="${(S.tab === i[0] || (i[0] === 'home' && S.tab === 'main')) ? 'on' : ''}" data-a="tab" data-v="${i[0]}">${i[1]}</button>`
      )
      .join('');
  }

  const sideNav = $('#sidenav');
  if (sideNav && topNav) {
    sideNav.innerHTML = topNav.innerHTML;
  }

  const skinBtn = $('#look-btn');
  if (skinBtn) {
    skinBtn.innerHTML = `<span style="width:12px;height:12px;border-radius:${S.skin === 'pixel' ? 0 : '50%'};background:var(--accent);border:1.5px solid var(--ink);display:inline-block"></span><span class="t" style="color:var(--ink)">${SKINS[S.skin] || 'Pixel'}</span>`;
  }

  syncLookPop(S);

  const tabbar = $('#tabbar');
  if (tabbar) {
    tabbar.innerHTML = items
      .map(
        (i) => `<button class="${(S.tab === i[0] || (i[0] === 'home' && S.tab === 'main')) ? 'on' : ''}" data-a="tab" data-v="${i[0]}">${i[2]}${i[1]}</button>`
      )
      .join('');
  }

  const me = mem(S.me, S) || S.members[0];
  const meChip = $('#mechip');
  if (meChip && me) {
    meChip.innerHTML = `${av(S.me, S)}<span>${esc(me.name)}</span><span class="t">это я</span>`;
  }

  const frList = S.accounts.filter((a) => a.status !== 'error').map((a) => a.updated || 0);
  const fr = frList.length ? Math.min(...frList) : Infinity;

  const freshEl = $('#fresh');
  if (freshEl) {
    freshEl.textContent = isFinite(fr) ? ago(fr) : '';
  }

  const sideb = $('#sideb');
  if (sideb) {
    sideb.innerHTML = `Данные<b>${isFinite(fr) ? ago(fr) : '—'}</b>`;
  }

  const appEl = $('#app');
  if (appEl) {
    appEl.innerHTML =
      (S.tab === 'home' || S.tab === 'main')
        ? renderHome(S)
        : S.tab === 'hist'
        ? renderHist(S)
        : renderSet(S);
  }

  const ab = document.getElementById('sbody');
  if (ab && ab.dataset && ab.dataset.appear) {
    ab.innerHTML = appearHTML(S);
  }

  const calculation = calc(S);
  const hasDebt = calculation.tr.length > 0;
  updateBrandDebtState(hasDebt);

  updateSbar(S);
  persistState(S);
}

// Global Event Delegation
document.addEventListener('click', async (e) => {
  // Close the appearance popover when clicking anywhere outside of it
  // (never on the same click that opened it — #look-btn stops propagation).
  const pop = document.getElementById('look-pop');
  if (pop && pop.classList.contains('open') && !pop.contains(e.target) && !e.target.closest('#look-btn')) {
    closeLookPop();
  }

  const brandEl = e.target.closest('.brand, [data-act="go-home"]');
  if (brandEl) {
    goHome();
    return;
  }

  const t = e.target.closest('[data-a], [data-act]');
  if (!t) return;

  const a = t.dataset.a;
  const act = t.dataset.act;
  const action = act || a;
  const v = t.dataset.v || t.dataset.acc || t.dataset.id;
  const id = t.dataset.id || v;

  switch (action) {
    case 'tab':
      S.tab = (v === 'main') ? 'home' : v;
      render();
      window.scrollTo(0, 0);
      break;

    case 'go-home':
    case 'logo':
      goHome();
      break;

    case 'me': {
      const i = S.members.findIndex((m) => m.id === S.me);
      S.me = S.members[(i + 1) % S.members.length].id;
      render();
      break;
    }

    case 'toggle':
    case 'toggle-acc': {
      const targetAcc = S.accounts.find((x) => String(x.id) === String(v));
      if (targetAcc) {
        const h = health(targetAcc);
        const currentOpen = (S.openAcc && S.openAcc[v] !== undefined)
          ? S.openAcc[v]
          : (S.open && S.open[v] !== undefined ? S.open[v] : h.sev > 0);
        const nextOpen = !currentOpen;
        if (!S.openAcc) S.openAcc = {};
        if (!S.open) S.open = {};
        S.openAcc[v] = nextOpen;
        S.open[v] = nextOpen;
        persistState(S);

        const card = document.getElementById(`acc-${v}`) || t.closest('.acc');
        if (card) {
          card.classList.toggle('open', nextOpen);
          card.classList.toggle('is-open', nextOpen);
        } else {
          render();
        }
      }
      break;
    }

    case 'payer': {
      const targetAcc = S.accounts.find((x) => String(x.id) === String(t.dataset.acc));
      if (targetAcc) {
        setAssign('payer', targetAcc, null, v);
      }
      break;
    }

    case 'cons': {
      const targetAcc = S.accounts.find((x) => String(x.id) === String(t.dataset.acc));
      if (targetAcc) {
        const targetRes = targetAcc.res.find((r) => String(r.id) === String(t.dataset.res));
        if (targetRes) {
          setAssign('cons', targetAcc, targetRes, v);
        }
      }
      break;
    }

    case 'formula':
    case 'toggle-how': {
      if (!S.openHow) S.openHow = {};
      if (!S.f) S.f = {};
      const currentHow = (S.openHow[v] !== undefined)
        ? S.openHow[v]
        : Boolean(S.f[v]);
      const nextHow = !currentHow;
      S.openHow[v] = nextHow;
      S.f[v] = nextHow;
      persistState(S);

      const howBtn = t.classList.contains('how-btn') ? t : t.closest('.how-btn');
      const howBox = document.getElementById(`how-${v}`) || (t.closest('.res') && t.closest('.res').querySelector('.how-box'));

      if (howBtn) {
        howBtn.classList.toggle('open', nextHow);
        howBtn.classList.toggle('is-open', nextHow);
      }
      if (howBox) {
        howBox.classList.toggle('open', nextHow);
        howBox.classList.toggle('is-open', nextHow);
      }
      if (!howBtn && !howBox) {
        render();
      }
      break;
    }

    case 'goattn': {
      const el = document.getElementById('attn');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
      break;
    }

    case 'open': {
      if (!S.openAcc) S.openAcc = {};
      if (!S.open) S.open = {};
      S.openAcc[id] = true;
      S.open[id] = true;
      persistState(S);
      const el = document.getElementById('acc-' + id);
      if (el) {
        el.classList.add('open', 'is-open');
        el.scrollIntoView({ behavior: 'smooth' });
      } else {
        render();
        const reEl = document.getElementById('acc-' + id);
        if (reEl) reEl.scrollIntoView({ behavior: 'smooth' });
      }
      break;
    }

    case 'remind': {
      const targetAcc = S.accounts.find((x) => String(x.id) === String(id));
      toast('Напоминание отправлено в Telegram: ' + (targetAcc ? nm(targetAcc.payer, S) : ''));
      break;
    }

    case 'remindDebt': {
      const c = calc(S);
      if (c.tr[0]) {
        toast('Напомнили в Telegram: ' + nm(c.tr[0].from, S));
      }
      break;
    }

    case 'copy': {
      const m = mem(v, S);
      if (m) {
        try {
          navigator.clipboard.writeText(m.sbp || m.name);
        } catch (_) {}
        toast('Скопировано: ' + (m.sbp || m.name));
      }
      break;
    }

    case 'sent': {
      if (S.live) {
        liveSent();
        break;
      }
      S.pending = { by: S.me };
      render();
      const c = calc(S);
      toast(`Отметили перевод. ${c.tr[0] ? nm(c.tr[0].to, S) : ''} получит уведомление в Telegram`);
      break;
    }

    case 'cancelSent':
      if (S.live) {
        liveCancelSent();
        break;
      }
      S.pending = null;
      render();
      toast('Отметка о переводе отменена');
      break;

    case 'confirm':
      if (S.live) {
        liveConfirm();
        break;
      }
      {
        const how = S.pending
          ? `${nm(S.pending.by, S)} отметил · ${nm(S.me, S)} подтвердил`
          : `${nm(S.me, S)} подтвердил без запроса`;
        const settlementRecord = settle(how, S);
        render();
        triggerLogoAnim('merge');
        toast('Расчёт записан в историю', () => {
          undoSettle(settlementRecord.id, S);
          render();
        });
      }
      break;

    case 'toastUndo':
      if (window._undo) {
        window._undo();
        window._undo = null;
      }
      $('#toastbox').innerHTML = '';
      break;

    case 'undoHist':
      if (S.live) {
        liveUndoSettle();
        break;
      }
      if (undoSettle(+v, S)) {
        render();
        toast('Расчёт отменён');
      }
      break;

    case 'csv':
      if (S.live) {
        downloadBackendCsv(`cdn-split-history-${new Date().toISOString().slice(0, 10)}.csv`).catch(
          (err) => {
            if (!is401(err)) showApiError(err, 'Не удалось выгрузить CSV');
          }
        );
        break;
      }
      exportCSV(S);
      break;

    case 'refresh': {
      triggerLogoAnim('spin');
      if (S.live) {
        // LIVE: настоящий синк аккаунтов + пинг ресурсов на бэкенде
        try {
          const r = await liveApi.syncAll();
          await reloadLive();
          const list = (r && r.sync_results) || [];
          const okN = list.filter((x) => x.success).length;
          toast(
            list.length
              ? `Обновлено из API · синхронизировано ${okN} из ${list.length} аккаунтов`
              : 'Нет аккаунтов для синхронизации'
          );
        } catch (err) {
          if (!is401(err)) showApiError(err, 'Не удалось обновить данные');
        }
        break;
      }
      S.accounts.forEach((x) => {
        if (x.status !== 'error') x.updated = 0;
        x.res.forEach((r) => {
          if (r.up && x.status !== 'error') r.gb += Math.round(Math.random() * 8 + 1);
        });
      });
      let msg = 'Данные обновлены из API';
      if (S.refreshes === 0) {
        const x = S.accounts.find((a) => a.id === 1);
        if (x) {
          x.res.push({
            id: Date.now(),
            domain: 'beta.mishasite.ru',
            tech: 'k8m9n0.edge.yandexcloud.net',
            up: true,
            gb: 45,
            consumer: null,
            isNew: true,
            h: mk(3),
          });
          msg = 'API: найден новый CDN-ресурс beta.mishasite.ru';
        }
      } else if (S.refreshes === 1) {
        const x = S.accounts.find((a) => a.id === 5);
        if (x) {
          x.res.push({
            id: Date.now(),
            domain: 'cdn2.shared.ru',
            tech: 'cdn.beget.com/1042',
            up: true,
            gb: 30,
            consumer: 'all',
            h: mk(2),
          });
          msg = 'API: найден ресурс cdn2.shared.ru (распределён «поровну»)';
        }
      }
      S.refreshes++;
      render();
      toast(msg);
      break;
    }

    case 'theme':
      setTheme(v);
      break;

    case 'skin':
      setSkin(v);
      break;

    case 'skinCycle':
      openAppearSheet(S);
      break;

    case 'pal':
      setPal(v);
      break;

    case 'themeToggle':
      setTheme(document.documentElement.dataset.t === 'dark' ? 'light' : 'dark');
      break;

    case 'logo':
      goHome();
      break;

    case 'close':
    case 'ovclose':
      // Backdrop tap: only close when clicking the .ov itself, not inside .sheet
      if (action === 'ovclose' && e.target !== t) return;
      closeSheet();
      break;

    case 'addAcc':
      openAccSheet(null, S);
      break;

    case 'editAcc': {
      const aObj = S.accounts.find((x) => String(x.id) === String(id));
      openAccSheet(aObj, S);
      if (S.live && aObj) {
        // LIVE: подтягиваем маскированные креденшалы для формы (токен скрыт)
        api(`/api/accounts/${aObj.id}`)
          .then((accRaw) => {
            const draft = getActiveDraft();
            if (!draft || String(draft.id) !== String(aObj.id)) return;
            const merged = { ...draft, credentials: accRaw.credentials || {} };
            Object.keys(accRaw.credentials || {}).forEach((k) => {
              merged['cred:' + k] = String(accRaw.credentials[k]);
            });
            setActiveDraft(merged);
            refreshAccForm(S);
          })
          .catch(() => {});
      }
      break;
    }

    case 'manualUsage': {
      const aObj = S.accounts.find((x) => String(x.id) === String(id));
      if (aObj) openManualUsageSheet(aObj);
      break;
    }

    case 'saveManual': {
      const aObj = S.accounts.find((x) => String(x.id) === String(v));
      if (!aObj) break;
      if (S.live) {
        liveSaveManual(aObj);
        break;
      }
      const balInput = document.getElementById('macc-bal');
      if (balInput) aObj.balance = parseFloat(balInput.value) || 0;
      (aObj.res || []).forEach((r) => {
        const resInput = document.getElementById(`mres-${r.id}`);
        if (resInput) r.gb = parseFloat(resInput.value) || 0;
      });
      aObj.updated = 0;
      closeSheet();
      render();
      toast('Данные трафика обновлены вручную');
      break;
    }

    case 'sourceToggle': {
      const draft = getActiveDraft();
      if (draft) {
        draft.source = v;
        refreshAccForm(S);
      }
      break;
    }

    case 'prov': {
      const draft = getActiveDraft();
      if (draft) {
        draft.prov = v;
        toggleHelp(); // close help
        setTestResult('');
        refreshAccForm(S);
      }
      break;
    }

    case 'help': {
      toggleHelp();
      refreshAccForm(S);
      break;
    }

    case 'dcb': {
      const draft = getActiveDraft();
      if (draft) {
        draft.countBonus = !draft.countBonus;
        refreshAccForm(S);
      }
      break;
    }

    case 'dpayer': {
      const draft = getActiveDraft();
      if (draft) {
        draft.payer = v;
        refreshAccForm(S);
      }
      break;
    }

    case 'drule': {
      const draft = getActiveDraft();
      if (draft) {
        draft.newRule = v;
        refreshAccForm(S);
      }
      break;
    }

    case 'sendlink': {
      const draft = getActiveDraft();
      try {
        navigator.clipboard.writeText('https://cdnsplit.app/add?p=' + (draft ? draft.prov : ''));
      } catch (_) {}
      toast('Ссылка для компьютера скопирована');
      break;
    }

    case 'test': {
      const testRes = $('#testres');
      if (testRes) {
        testRes.innerHTML =
          '<div class="checks"><div><span class="spin"></span><span class="muted">Проверяем ключ в облаке…</span></div></div>';
      }
      setTimeout(async () => {
        const el = $('#testres');
        if (!el) return;
        const draft = getActiveDraft();
        if (!draft) return;
        const show = (res) => {
          setTestResult(res);
          el.innerHTML = res;
        };

        if (S.live) {
          // LIVE: настоящая проверка ключа через POST /api/accounts/validate
          const creds = collectDraftCreds(draft, draft.prov);
          if (!Object.keys(creds).length) {
            show(`<div class="checks"><div class="no">${XX}<span>Введите ключ</span></div></div>`);
            return;
          }
          try {
            const k = await liveApi.validateCredentials(draft.prov, creds);
            const need = PROV[draft.prov] ? PROV[draft.prov].need : '';
            const okRow = (t, s) => `<div class="ok">${CHK_S}<span>${esc(t)}<small>${esc(s || '')}</small></span></div>`;
            const noRow = (t, s) => `<div class="no">${XX}<span>${esc(t)}<small>${esc(s || '')}</small></span></div>`;
            const res = `<div class="checks">
              ${k.key_accepted ? okRow('Ключ рабочий', need) : noRow('Ключ не принят', k.error || '')}
              ${
                k.resources_read && k.resources_read.ok
                  ? okRow('Чтение CDN-ресурсов', `найдено ${k.resources_read.count || 0} доменов`)
                  : noRow('Нет доступа к CDN-ресурсам', need)
              }
              ${
                k.balance_access && k.balance_access.ok
                  ? okRow('Баланс и расходы', `баланс ${rub(k.balance_access.balance_rub)}`)
                  : noRow('Нет доступа к биллингу', `добавьте право ${need}`)
              }
            </div>`;
            show(res);
          } catch (err) {
            if (!is401(err)) show(err ? `<div class="checks"><div class="no">${XX}<span>${esc(err.detail || 'Ошибка проверки')}</span></div></div>` : '');
          }
          return;
        }

        // DEMO: прежняя демонстрация чек-листа
        if (!draft.k0) {
          show(`<div class="checks"><div class="no">${XX}<span>Введите ключ</span></div></div>`);
        } else {
          S.testN = (S.testN || 0) + 1;
          const p = PROV[draft.prov] || PROV.selectel;
          const full = S.testN % 2 === 0;
          const res = `<div class="checks">
            <div class="ok">${CHK_S}<span>Ключ рабочий<small>${p.need}</small></span></div>
            <div class="ok">${CHK_S}<span>Чтение CDN-ресурсов<small>найдено 3 домена</small></span></div>
            ${
              full
                ? `<div class="ok">${CHK_S}<span>Баланс и расходы<small>баланс 1 240 ₽</small></span></div>`
                : `<div class="no">${XX}<span>Нет доступа к биллингу<small>добавьте право ${p.need}</small></span></div>`
            }
          </div>`;
          show(res);
        }
      }, 900);
      break;
    }

    case 'saveAcc': {
      const draft = getActiveDraft();
      if (!draft) return;
      if (S.live) {
        liveSaveAcc(draft, v);
        break;
      }
      const f = {
        prov: draft.prov,
        source: draft.source || 'api',
        name: draft.name || (PROV[draft.prov] ? PROV[draft.prov].n : 'CDN Account'),
        freeGb: +String(draft.freeGb).replace(',', '.') || 0,
        price: +String(draft.price).replace(',', '.') || 2,
        countBonus: Boolean(draft.countBonus),
        payer: draft.payer || S.me,
        newRule: draft.newRule || 'ask',
      };
      if (draft.source === 'manual') {
        f.balance = parseFloat(draft.balance) || 1000;
      }
      if (v) {
        const existing = S.accounts.find((x) => String(x.id) === String(v));
        if (existing) {
          Object.assign(existing, f, { status: 'ok', updated: 0 });
        }
      } else {
        S.accounts.push({
          id: Date.now(),
          login: f.source === 'manual' ? 'ручной ввод' : 'новый аккаунт',
          balance: f.balance || 1000,
          bonus: 0,
          bonusSpent: 0,
          topup: 0,
          status: 'ok',
          updated: 0,
          res: [
            {
              id: Date.now() + 1,
              domain: 'newcdn.example.com',
              tech: 'cdn.edge.net',
              up: true,
              gb: 120,
              consumer: f.newRule === 'ask' ? null : f.newRule,
              h: mk(8),
            },
          ],
          ...f,
        });
      }
      closeSheet();
      render();
      toast(v ? 'Аккаунт сохранён' : 'Аккаунт подключён, ресурсы загружены');
      break;
    }

    case 'delAcc':
      if (S.live) {
        liveApi
          .deleteAccount(v)
          .then(async () => {
            closeSheet();
            await reloadLive();
            toast('Аккаунт удалён');
          })
          .catch((err) => {
            if (!is401(err)) showApiError(err, 'Не удалось удалить аккаунт');
          });
        break;
      }
      S.accounts = S.accounts.filter((x) => String(x.id) !== String(v));
      closeSheet();
      render();
      toast('Аккаунт удалён');
      break;

    case 'ev': {
      const b = S.bots.find((x) => String(x.id) === String(v));
      if (b && b.ev) {
        const key = t.dataset.e;
        const next = b.ev[key] ? 0 : 1;
        b.ev[key] = next;
        render();
        if (S.live) {
          // Каналы бэкенда: balance/key/down/paid. spike/newcdn/weekly в
          // бэкенде отсутствуют — переключаются только локально.
          const flagMap = {
            balance: 'notify_low_balance',
            key: 'notify_api_error',
            down: 'notify_cdn_down',
            paid: 'notify_settlement',
          };
          const flag = flagMap[key];
          if (flag) {
            liveApi
              .updateBot(b.id, { [flag]: Boolean(next) })
              .catch((err) => {
                b.ev[key] = next ? 0 : 1; // откат локального переключателя
                render();
                if (!is401(err)) showApiError(err, 'Не удалось сохранить настройку бота');
              });
          }
        }
      }
      break;
    }

    case 'delBot':
      if (S.live) {
        liveApi
          .deleteBot(v)
          .then(async () => {
            await reloadLive();
            toast('Бот удалён');
          })
          .catch((err) => {
            if (!is401(err)) showApiError(err, 'Не удалось удалить бота');
          });
        break;
      }
      S.bots = S.bots.filter((x) => String(x.id) !== String(v));
      render();
      toast('Бот удалён');
      break;

    case 'testBot':
      if (S.live) {
        liveApi
          .testBot(v)
          .then((r) => {
            if (r && r.success) toast(r.message || 'Тестовое сообщение отправлено');
            else toast('Не удалось отправить: ' + ((r && r.error) || 'ошибка Telegram'));
          })
          .catch((err) => {
            if (!is401(err)) showApiError(err, 'Не удалось отправить тест');
          });
        break;
      }
      toast('Тестовое сообщение отправлено');
      break;

    case 'addBot':
      openAddBotSheet();
      break;

    case 'bhelp': {
      const bh = $('#bh');
      if (bh) {
        bh.innerHTML = bh.innerHTML
          ? ''
          : `<div class="helpbox"><ol>
            <li>В Telegram откройте <b>@BotFather</b></li>
            <li>Отправьте <code>/newbot</code>, задайте имя и username</li>
            <li>Скопируйте полученный токен сюда</li>
            <li>Добавьте бота в чат или начните с ним диалог</li>
          </ol></div>`;
      }
      break;
    }

    case 'saveBot': {
      const bn = $('#bn');
      const bc = $('#bc');
      if (S.live) {
        const bt = $('#bt');
        const token = bt && bt.value ? bt.value.trim() : '';
        if (!token) {
          toast('Ошибка: введите токен бота');
          break;
        }
        liveApi
          .createBot({
            name: (bn && bn.value) || 'Новый бот',
            bot_token: token,
            chat_id: (bc && bc.value) || '@chat',
          })
          .then(async () => {
            closeSheet();
            await reloadLive();
            toast('Бот добавлен');
          })
          .catch((err) => {
            if (!is401(err)) showApiError(err, 'Не удалось добавить бота');
          });
        break;
      }
      S.bots.push({
        id: Date.now(),
        name: (bn && bn.value) || 'Новый бот',
        chat: (bc && bc.value) || '@chat',
        ev: { balance: 1, key: 1, down: 1, spike: 1, newcdn: 1, paid: 1, weekly: 1 },
      });
      closeSheet();
      render();
      toast('Бот добавлен');
      break;
    }

    case 'addMember':
      if (S.live) {
        const n = ['Третий', 'Четвёртый'][S.members.length - 2] || 'Участник';
        liveApi
          .createParticipant(n)
          .then(async () => {
            await reloadLive();
            render();
          })
          .catch((err) => {
            if (!is401(err)) showApiError(err, 'Не удалось добавить участника');
          });
        break;
      }
      {
        const n = ['Третий', 'Четвёртый'][S.members.length - 2] || 'Участник';
        S.members.push({ id: 'u' + Date.now(), name: n, sbp: '' });
        render();
      }
      break;

    case 'delMember':
      if (S.live) {
        liveApi
          .deleteParticipant(v)
          .then(async () => {
            await reloadLive();
            toast('Участник удалён · его CDN перешли первому участнику');
          })
          .catch((err) => {
            if (!is401(err)) showApiError(err, 'Не удалось удалить участника');
          });
        break;
      }
      {
        S.members = S.members.filter((m) => m.id !== v);
        const f = S.members[0].id;
        if (S.me === v) S.me = f;
        S.accounts.forEach((x) => {
          if (x.payer === v) x.payer = f;
          (x.res || []).forEach((r) => {
            if (r.consumer === v) r.consumer = f;
          });
        });
        render();
        toast('Участник удалён · его CDN перешли первому участнику');
      }
      break;
  }
});

document.addEventListener('input', (e) => {
  const t = e.target;
  const draft = getActiveDraft();
  if (t.dataset.d && draft) {
    draft[t.dataset.d] = t.value;
  }
  if (t.dataset.a === 'rename') {
    const m = mem(t.dataset.v, S);
    if (m) {
      m.name = t.value.trim() || 'Без имени';
      const h = t.parentElement ? t.parentElement.querySelector('.av') : null;
      if (h) h.textContent = m.name[0].toUpperCase();
    }
  }
  if (t.dataset.a === 'sbp') {
    const m = mem(t.dataset.v, S);
    if (m) m.sbp = t.value;
  }
});

document.addEventListener('focusout', (e) => {
  if (e.target.dataset && e.target.dataset.a === 'rename') {
    const val = e.target.value.trim() || 'Без имени';
    if (S.live) {
      // LIVE: переименование → PUT /api/participants/{id}
      liveApi
        .updateParticipant(e.target.dataset.v, { name: val })
        .then(() => reloadLive())
        .catch((err) => {
          if (!is401(err)) showApiError(err, 'Не удалось переименовать участника');
        });
    } else {
      persistState(S);
    }
    render();
  }
  if (e.target.dataset && e.target.dataset.a === 'sbp') {
    if (S.live) {
      // LIVE: реквизиты СБП бэкенд не хранит — сохраняем локально
      setLocalSbp(e.target.dataset.v, e.target.value);
    } else {
      persistState(S);
    }
  }
});

window.addEventListener('scroll', () => updateSbar(S), { passive: true });
window.addEventListener('resize', () => updateSbar(S));

// Startup logic
applySkin();
applyTheme();
render();
updateModePill();

// Mode detection & live boot (async): LIVE = backend, DEMO = localStorage+seed
boot();

// Click listeners for brand logo/title
document.querySelectorAll('.brand, [data-act="go-home"]').forEach((el) => {
  el.style.cursor = 'pointer';
  el.addEventListener('click', (e) => {
    e.preventDefault();
    goHome();
  });
});

// Appearance popover toggle — stopPropagation so the document click handler
// doesn't immediately close the popover on the same click that opened it.
const lookBtn = document.getElementById('look-btn');
const lookPop = document.getElementById('look-pop');
if (lookBtn && lookPop) {
  lookBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !lookPop.classList.contains('open');
    lookPop.classList.toggle('open', open);
    lookPop.setAttribute('aria-hidden', String(!open));
    lookBtn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closeLookPop();
  });
}

// Remove splash screen after intro animation completes
setTimeout(() => {
  const sp = document.getElementById('splash');
  if (sp && sp.remove) {
    sp.remove();
  }
}, 1800);
