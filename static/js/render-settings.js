/**
 * render-settings.js — Settings screen (Настройки)
 * Includes:
 * - Appearance settings: 3 skins (Pixel, Air, Orbit), 5 palettes, Light/Dark/Auto theme
 * - Telegram bots management (multiple bots, 7 event toggles, Test button, chat preview)
 * - Members management (rename, SBP details, add up to 4, delete with safe reassignment)
 */

import { SKINS, SKIN_PAL, PALS, EVS, ICONS, CHK } from './seed.js';
import { esc, rub, nm, av, calc } from './ledger.js';
import { seg } from './render-overview.js';

export const curPal = (state) =>
  state.palPick && PALS[state.palPick] ? state.palPick : SKIN_PAL[state.skin] || 'mint';

export function appearHTML(state) {
  const currentPalette = curPal(state);
  return `<div class="appear">
  <div class="field-l">Стиль</div>
  ${seg(Object.entries(SKINS), state.skin, 'skin')}
  <div class="field-l">Цвет</div>
  <div class="sws">${Object.entries(PALS)
    .map(
      ([k, v]) =>
        `<button class="swb ${currentPalette === k ? 'on' : ''}" data-a="pal" data-v="${k}" title="${v[0]}">
          <span class="sw" style="background:${v[1]}"><i style="background:${v[2]}"></i>${CHK.replace('<svg', '<svg style="color:' + v[2] + '"')}</span>${v[0]}
        </button>`
    )
    .join('')}</div>
  <div class="field-l">Тема</div>
  ${seg(
    [
      ['light', 'Светлая'],
      ['dark', 'Тёмная'],
      ['auto', 'Авто'],
    ],
    state.theme,
    'theme'
  )}
</div>`;
}

export function renderSet(state) {
  const c = calc(state);
  const t = c.tr[0];

  return `<div class="cols">
   <div>
    <div class="row between" style="margin-bottom:6px">
      <h2 style="margin:0">Telegram-уведомления</h2>
      <button class="btn sm pri" data-a="addBot">${ICONS.plus}Бот</button>
    </div>
    ${(state.bots || [])
      .map(
        (b) => `<div class="botc"><div class="row between"><div><b>${esc(b.name)}</b><div class="xs muted mono">${esc(b.chat)}</div></div>
      <div class="row" style="gap:2px"><button class="btn sm ghost" data-a="testBot" data-v="${b.id}">Тест</button><button class="iconbtn" data-a="delBot" data-v="${b.id}">${ICONS.x}</button></div></div>
      <div style="margin-top:6px">${EVS.map(
        (e) =>
          `<div class="optrow" data-a="ev" data-v="${b.id}" data-e="${e[0]}"><span>${e[1]}</span><span class="switch ${b.ev && b.ev[e[0]] ? 'on' : ''}"></span></div>`
      ).join('')}</div></div>`
      )
      .join('')}
    <h2>Так выглядит сводка в чате</h2>
    <div class="tg"><div class="tg-b"><b>CDN Split · сводка</b><br>${
      t ? `${nm(t.from, state)} → ${nm(t.to, state)}: <b class="mono">${rub(t.sum)}</b>` : 'Все в расчёте'
    }<br><span class="muted">Timeweb: хватит на ~2 дн.<br>img.maxapp.ru: трафик ×3,4 за сутки</span>
      ${t ? `<div class="tg-btns"><span>Я перевёл</span><span>Подтверждаю</span></div>` : ''}</div></div>
   </div>

   <div>
    <h2>Участники</h2>
    <div class="card">
     ${
       state.live && !state.members.length
         ? `<div class="empty">Добавьте первого участника…</div><button class="btn pri block" data-a="addMember">${ICONS.plus}Добавить участника</button>`
         : state.members
             .map(
               (m) => `<div style="margin-bottom:14px">
         <div class="row">${av(m.id, state, true)}<input class="input" value="${esc(m.name)}" data-a="rename" data-v="${m.id}" maxlength="20">${
                  state.members.length > 2
                    ? `<button class="iconbtn" data-a="delMember" data-v="${m.id}">${ICONS.x}</button>`
                    : ''
                }</div>
         <input class="input" style="margin-top:6px;height:40px;font-size:13px" value="${esc(m.sbp || '')}" data-a="sbp" data-v="${m.id}" placeholder="Реквизиты для перевода (СБП, телефон, банк)">
       </div>`
             )
             .join('')
     }
     ${state.members.length < 4 ? `<button class="btn block ghost" data-a="addMember">${ICONS.plus}Добавить участника</button>` : ''}
     <p class="hint">«Поровну» делит расходы на всех (сейчас на ${state.members.length}). Реквизиты показываются должнику по кнопке «Реквизиты».</p>
    </div>

    <h2 style="margin-top:26px">Оформление</h2>
    ${appearHTML(state)}
   </div>
</div>`;
}
