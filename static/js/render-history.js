/**
 * render-history.js — History & Settlement Logs screen
 * Includes:
 * - Settlements list with undoable latest settlement
 * - Audit log of assignment modifications
 * - Export to CSV (date;from;to;sum_rub;how)
 */

import { esc, rub, nm } from './ledger.js';

export function renderHist(state) {
  return `<div style="max-width:660px;margin:0 auto">
  <div class="row between"><h2 style="margin:0">История расчётов</h2><button class="btn sm ghost" data-a="csv">Экспорт CSV</button></div>
  <div class="list" style="margin-top:8px">${
    state.history && state.history.length
      ? state.history
          .map(
            (h, i) => `<div><div class="row between"><div><div class="tr">${
              h.tr && h.tr.length
                ? h.tr.map((t) => `${nm(t.from, state)} → ${nm(t.to, state)} · <span class="num">${rub(t.sum)}</span>`).join('<br>')
                : 'Без переводов'
            }</div><div class="small muted">${esc(h.date)} · ${esc(h.how || '')}</div></div>
    ${i === 0 ? `<button class="btn sm bad" data-a="undoHist" data-v="${h.id}">Отменить</button>` : ''}</div>
    <div class="xs faint mono" style="margin-top:6px">${state.members
      .map((m) =>
        h.paid && h.paid[m.id] !== undefined
          ? `${esc(m.name)}: платил ${rub(h.paid[m.id])}, потребил ${rub(h.cons[m.id])}`
          : ''
      )
      .filter(Boolean)
      .join(' · ')}</div></div>`
          )
          .join('')
      : '<div class="empty">Пока нет расчётов</div>'
  }</div>
  <p class="note">Отменить можно только последний расчёт</p>
  <h2 style="margin-top:26px">Изменения назначений</h2>
  <div class="logs">${(state.log || [])
    .map((l) => `<div class="logrow"><span class="d">${esc(l.d)}</span><span>${esc(l.t)}</span></div>`)
    .join('')}</div>
  <p class="note">Смена «кто платит» и «чей CDN» действует с даты изменения — прошлое не пересчитывается</p></div>`;
}

export function exportCSV(state) {
  const rows = [
    ['date', 'from', 'to', 'sum_rub', 'how'],
    ...(state.history || []).flatMap((h) =>
      (h.tr || []).map((t) => [h.date, nm(t.from, state), nm(t.to, state), t.sum, h.how || ''])
    ),
  ];
  try {
    const b = new Blob([rows.map((r) => r.join(';')).join('\n')], { type: 'text/csv;charset=utf-8;' });
    const u = document.createElement('a');
    u.href = URL.createObjectURL(b);
    u.download = `cdn-split-history-${new Date().toISOString().slice(0, 10)}.csv`;
    u.click();
    setTimeout(() => URL.revokeObjectURL(u.href), 1000);
  } catch (err) {
    console.error('CSV export failed:', err);
  }
}
