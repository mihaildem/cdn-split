/**
 * render-modals.js — Modals, Bottom-Sheets, and Toast Notifications
 * Includes:
 * - Account Modal with 6 provider tiles, API vs Manual mode toggle, 3-point check, instructions
 * - Manual Usage input sheet (fallback mode per Section 5.4)
 * - BotFather guide & Telegram bot creation sheet
 * - Appearance popover sheet
 * - Toast with 6-second timeout and "Отменить" action
 */

import { PROV, PROVKEYS, PROV_API_KEYS, ICONS, CHK_S, XX } from './seed.js';
import { esc } from './ledger.js';
import { seg } from './render-overview.js';
import { appearHTML } from './render-settings.js';

let activeDraft = null;
let isHelpOpen = false;
let testResultHTML = '';
let toastTimeout;

export const closeSheet = () => {
  const layer = document.getElementById('layer');
  if (layer) layer.innerHTML = '';
};

export function sheet(title, body, foot, small = false) {
  const layer = document.getElementById('layer');
  if (!layer) return;
  layer.innerHTML = `<div class="ov" data-a="ovclose">
    <div class="sheet ${small ? 'sm' : ''}">
      <div class="sheet-h"><b>${title}</b><button class="iconbtn" data-a="close">${ICONS.x}</button></div>
      <div class="sheet-b" id="sbody">${body}</div>
      <div class="sheet-f">${foot}</div>
    </div>
  </div>`;
}

export function toast(msg, undo) {
  clearTimeout(toastTimeout);
  const toastbox = document.getElementById('toastbox');
  if (!toastbox) return;

  toastbox.innerHTML = `<div class="toast"><span>${msg}</span>${undo ? '<button data-a="toastUndo">Отменить</button>' : ''}</div>`;
  window._undo = undo;
  toastTimeout = setTimeout(() => {
    toastbox.innerHTML = '';
    window._undo = null;
  }, 6000);
}

/**
 * Credential field definitions for the account sheet.
 * LIVE: real fields from the backend catalog (GET /api/providers) so that the
 * values map 1:1 into the credentials dict (e.g. oauth_token / folder_id).
 * DEMO / fallback: static seed.js fields with legacy k0..k2 draft keys.
 */
export function getProvFieldDefs(state, provKey) {
  const bp = state && state.live && state.providers && state.providers[provKey];
  if (bp && Array.isArray(bp.fields) && bp.fields.length) {
    return bp.fields.map((f) => ({
      key: f.key,
      d: 'cred:' + f.key,
      label: f.label,
      type: f.type || 'text',
      placeholder: f.placeholder || '',
    }));
  }
  const p = PROV[provKey] || PROV.selectel;
  return (p.fields || []).map((f, i) => ({
    key: null,
    d: 'k' + i,
    label: f[0],
    type: f[1],
    placeholder: f[2],
  }));
}

export function accForm(draft, state) {
  const p = PROV[draft.prov] || PROV.selectel;
  const isManual = draft.source === 'manual';
  const fields = getProvFieldDefs(state, draft.prov);

  return `<div class="lab" style="margin-top:6px">Провайдер</div>
  <div class="pgrid">${PROVKEYS.map(
    (k) =>
      `<button class="pbtn ${draft.prov === k ? 'on' : ''}" data-a="prov" data-v="${k}">
        <span class="plogo" style="background:${PROV[k].c}">${PROV[k].s}</span>${PROV[k].n.split(' ')[0]}
      </button>`
  ).join('')}</div>

  <div class="lab">Название аккаунта</div>
  <input class="input" data-d="name" value="${esc(draft.name)}" placeholder="Например, основной">

  <div class="lab">Режим подключения</div>
  ${seg(
    [
      ['api', 'API (автоматически)'],
      ['manual', 'Вручную (без API)'],
    ],
    draft.source || 'api',
    'sourceToggle'
  )}

  ${
    !isManual
      ? `
    <div class="lab">Доступ к API <button class="help ${isHelpOpen ? 'on' : ''}" data-a="help" title="Где взять ключ">?</button></div>
    ${
      isHelpOpen
        ? `<div class="helpbox"><b>Как получить ключ в ${p.n}</b><ol>${p.help.steps.map((s) => `<li>${s}</li>`).join('')}</ol><a href="${p.help.url}" target="_blank" rel="noopener">Открыть инструкцию ↗</a></div>`
        : ''
    }
    ${fields
      .map(
        (f) =>
          `<div style="margin-top:10px">
            <div class="xs muted" style="margin-bottom:5px">${esc(f.label)}</div>
            <input class="input" type="${f.type}" placeholder="${esc(f.placeholder)}" data-d="${f.d}" value="${esc(draft[f.d] || '')}" autocomplete="off">
          </div>`
      )
      .join('')}
    <div class="hint">Выдавайте ключу только права на чтение — списывать деньги сервис не сможет.</div>
    <div class="row" style="margin-top:12px;gap:8px">
      <button class="btn ghost" style="flex:1" data-a="test">Проверить подключение</button>
      <button class="btn" data-a="sendlink" title="Ключи удобнее вставлять с компьютера">На компьютер ↗</button>
    </div>
    <div id="testres">${testResultHTML}</div>
  `
      : `
    <div style="margin-top:12px">
      <div class="xs muted" style="margin-bottom:5px">Текущий баланс кабинета, ₽</div>
      <input class="input" inputmode="decimal" data-d="balance" value="${draft.balance || 0}">
    </div>
    <div class="hint">В ручном режиме вы сами указываете трафик по ресурсам раз в месяц или по необходимости.</div>
  `
  }

  <div class="lab" style="margin-top:22px">Тарификация</div>
  <div class="two">
    <div>
      <div class="xs muted" style="margin-bottom:5px">Бесплатный лимит, ГБ</div>
      <input class="input" inputmode="decimal" data-d="freeGb" value="${draft.freeGb}">
    </div>
    <div>
      <div class="xs muted" style="margin-bottom:5px">Цена за ГБ, ₽</div>
      <input class="input" inputmode="decimal" data-d="price" value="${draft.price}">
    </div>
  </div>

  <div class="optrow" data-a="dcb" style="margin-top:6px">
    <div>
      <div>Учитывать бонусные рубли</div>
      <div class="xs faint">Если выключено, траты за счёт бонусов не попадут в долг</div>
    </div>
    <span class="switch ${draft.countBonus ? 'on' : ''}"></span>
  </div>

  <div class="lab">Кто платит за кабинет</div>
  ${seg(state.members.map((m) => [m.id, esc(m.name)]), draft.payer, 'dpayer')}

  <div class="lab">Новые CDN-ресурсы на этом аккаунте</div>
  ${seg(
    [
      ['ask', 'Спрашивать'],
      ...state.members.map((m) => [m.id, esc(m.name)]),
      ['all', 'Поровну'],
    ],
    draft.newRule,
    'drule'
  )}
  <div class="hint">«Спрашивать» — новый домен попадёт в «Требует внимания», пока вы не укажете, чей он.</div>`;
}

export function openAccSheet(account, state) {
  isHelpOpen = false;
  testResultHTML = '';

  let credFill = {};
  if (account) {
    if (state && state.live) {
      // LIVE: маскированные значения из GET /api/accounts (токен скрыт,
      // бэкенд сохранит прежние значения, если поле не редактировалось)
      getProvFieldDefs(state, account.prov).forEach((f) => {
        const v = (account.credentials || {})[f.key];
        if (f.key) credFill[f.d] = v === undefined || v === null ? '' : String(v);
      });
    } else {
      credFill = { k0: '••••••••', k1: '••••••••', k2: '••••••••' };
    }
  }

  activeDraft = account
    ? { ...account, ...credFill, source: account.source || 'api' }
    : {
        prov: 'selectel',
        source: 'api',
        name: '',
        freeGb: 0,
        price: 2,
        countBonus: true,
        payer: state.me,
        newRule: 'ask',
      };

  sheet(
    account ? 'Настройки аккаунта' : 'Новый аккаунт',
    accForm(activeDraft, state),
    `${account ? `<button class="btn bad" style="flex:0 0 auto" data-a="delAcc" data-v="${account.id}">Удалить</button>` : ''}
     <button class="btn pri" data-a="saveAcc" data-v="${account ? account.id : ''}">${account ? 'Сохранить' : 'Подключить'}</button>`
  );
}

export function refreshAccForm(state) {
  const el = document.getElementById('sbody');
  if (!el || !activeDraft) return;
  const st = el.scrollTop;
  el.innerHTML = accForm(activeDraft, state);
  el.scrollTop = st;
}

export function openManualUsageSheet(account) {
  const resourcesHTML = (account.res || [])
    .map(
      (r, i) => `
    <div style="margin-bottom:12px">
      <div class="xs muted" style="margin-bottom:4px">${esc(r.domain)}</div>
      <div class="row">
        <input class="input" style="flex:1" inputmode="decimal" placeholder="ГБ" id="mres-${r.id}" value="${r.gb}">
        <span class="xs muted">ГБ</span>
      </div>
    </div>`
    )
    .join('');

  sheet(
    `Трафик вручную · ${esc(account.name)}`,
    `<div class="lab" style="margin-top:6px">Баланс аккаунта, ₽</div>
     <input class="input" inputmode="decimal" id="macc-bal" value="${account.balance || 0}">
     <div class="lab" style="margin-top:14px">Потребление за период</div>
     ${resourcesHTML}
     <div class="hint">После сохранения данные обновятся и применятся в текущем расчёте долга.</div>`,
    `<button class="btn pri" data-a="saveManual" data-v="${account.id}">Сохранить трафик</button>`
  );
}

export function openAddBotSheet() {
  sheet(
    'Новый бот',
    `<div class="lab" style="margin-top:6px">Название</div>
     <input class="input" id="bn" placeholder="Например, Мой бот">
     <div class="lab">Токен бота <button class="help" data-a="bhelp">?</button></div>
     <div id="bh"></div>
     <input class="input" id="bt" placeholder="123456:ABC-DEF…">
     <div class="lab">ID чата или @username</div>
     <input class="input" id="bc" placeholder="@username или -100…">`,
    '<button class="btn pri" data-a="saveBot">Добавить бота</button>'
  );
}

export function openAppearSheet(state) {
  sheet(
    'Оформление',
    appearHTML(state),
    '<button class="btn pri" data-a="close">Готово</button>',
    true
  );
  const b = document.getElementById('sbody');
  if (b) b.dataset.appear = '1';
}

export function getActiveDraft() {
  return activeDraft;
}

export function setActiveDraft(d) {
  activeDraft = d;
}

export function toggleHelp() {
  isHelpOpen = !isHelpOpen;
}

export function setTestResult(html) {
  testResultHTML = html;
}
