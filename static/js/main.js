/**
 * main.js — Application Entry Point for CDN Splitwise (cdn/split)
 * Integrates:
 * - Reactive state & LocalStorage / API synchronization
 * - 3 Skins (Pixel, Air, Orbit) × 5 Palettes × Light/Dark/Auto Themes
 * - Animated SVG brand mark with states (intro, debt, spin, merge, busy)
 * - Navigation & Tabs (Главная, История, Настройки)
 * - Two-step settlement flow, undoable assignment changes, CSV export
 */

import { DAY, DIM, F, SKINS, SKIN_PAL, PALS, PROV, ICONS, CHK_S, XX, mk } from './seed.js';
import { getBrandMarkSVG, triggerLogoAnim, updateBrandDebtState } from './brand-mark.js';
import { esc, rub, gb, mem, nm, av, ago, accCalc, spikeX, health, calc, freeze, settle, undoSettle } from './ledger.js';
import { loadPersistedState, persistState, testProviderApi, testBotApi } from './api-sync.js';
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
document.addEventListener('click', (e) => {
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
      S.pending = { by: S.me };
      render();
      const c = calc(S);
      toast(`Отметили перевод. ${c.tr[0] ? nm(c.tr[0].to, S) : ''} получит уведомление в Telegram`);
      break;
    }

    case 'cancelSent':
      S.pending = null;
      render();
      toast('Отметка о переводе отменена');
      break;

    case 'confirm': {
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
      break;
    }

    case 'toastUndo':
      if (window._undo) {
        window._undo();
        window._undo = null;
      }
      $('#toastbox').innerHTML = '';
      break;

    case 'undoHist':
      if (undoSettle(+v, S)) {
        render();
        toast('Расчёт отменён');
      }
      break;

    case 'csv':
      exportCSV(S);
      break;

    case 'refresh': {
      triggerLogoAnim('spin');
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
      closeSheet();
      break;

    case 'addAcc':
      openAccSheet(null, S);
      break;

    case 'editAcc': {
      const aObj = S.accounts.find((x) => String(x.id) === String(id));
      openAccSheet(aObj, S);
      break;
    }

    case 'manualUsage': {
      const aObj = S.accounts.find((x) => String(x.id) === String(id));
      if (aObj) openManualUsageSheet(aObj);
      break;
    }

    case 'saveManual': {
      const aObj = S.accounts.find((x) => String(x.id) === String(v));
      if (aObj) {
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
      }
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
      setTimeout(() => {
        const el = $('#testres');
        if (!el) return;
        const draft = getActiveDraft();
        if (!draft || !draft.k0) {
          const res = `<div class="checks"><div class="no">${XX}<span>Введите ключ</span></div></div>`;
          setTestResult(res);
          el.innerHTML = res;
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
          setTestResult(res);
          el.innerHTML = res;
        }
      }, 900);
      break;
    }

    case 'saveAcc': {
      const draft = getActiveDraft();
      if (!draft) return;
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
      S.accounts = S.accounts.filter((x) => String(x.id) !== String(v));
      closeSheet();
      render();
      toast('Аккаунт удалён');
      break;

    case 'ev': {
      const b = S.bots.find((x) => String(x.id) === String(v));
      if (b && b.ev) {
        b.ev[t.dataset.e] = b.ev[t.dataset.e] ? 0 : 1;
        render();
      }
      break;
    }

    case 'delBot':
      S.bots = S.bots.filter((x) => String(x.id) !== String(v));
      render();
      toast('Бот удалён');
      break;

    case 'testBot':
      testBotApi(v);
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

    case 'addMember': {
      const n = ['Третий', 'Четвёртый'][S.members.length - 2] || 'Участник';
      S.members.push({ id: 'u' + Date.now(), name: n, sbp: '' });
      render();
      break;
    }

    case 'delMember': {
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
      break;
    }
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
    persistState(S);
    render();
  }
  if (e.target.dataset && e.target.dataset.a === 'sbp') {
    persistState(S);
  }
});

window.addEventListener('scroll', () => updateSbar(S), { passive: true });
window.addEventListener('resize', () => updateSbar(S));

// Startup logic
applySkin();
applyTheme();
render();

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
