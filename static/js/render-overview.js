/**
 * render-overview.js — Main screen renderer (Главная)
 * Includes:
 * - Sticky Hero debt card with context-aware primary CTA
 * - "Требует внимания" (Attention) section sorted by severity
 * - Accounts grouped into Hot (expanded) & OK (collapsible)
 * - Resource rows with sparkline, "как?" formula breakdown, consumer switcher
 * - Mobile bottom sticky settlement bar
 */

import { DAY, DIM, F, ICONS, CHK, CHK_S } from './seed.js';
import { esc, rub, gb, mem, nm, av, ago, accCalc, spikeX, health, calc, ctaState } from './ledger.js';

export function spark(h, bad) {
  const w = 88;
  const hh = 26;
  const mx = Math.max(...h) || 1;
  const p = h.map((v, i) => [
    2 + (i * (w - 4)) / (h.length - 1),
    hh - 3 - (v / mx) * (hh - 6),
  ]);
  const l = p[p.length - 1];

  return `<svg class="spark ${bad ? 'bad' : ''}" width="${w}" height="${hh}" viewBox="0 0 ${w} ${hh}">
  <polyline points="${p.map((q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ')}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="${l[0].toFixed(1)}" cy="${l[1].toFixed(1)}" r="2.5" fill="currentColor"/>
</svg>`;
}

export function seg(opts, val, act, extra = '', cls = '') {
  return `<div class="seg ${cls}">${opts
    .map(
      (o) =>
        `<button class="${o[0] === val ? 'on' : ''}" data-a="${act}" data-v="${o[0]}" ${extra}>${o[1]}</button>`
    )
    .join('')}</div>`;
}

export function heroHTML(c, state) {
  const tot = c.tr.reduce((s, t) => s + t.sum, 0);
  const cta = ctaState(c, state);

  let top;
  if (!c.tr.length) {
    top = `<div class="settled"><i>${CHK}</i>Все в расчёте</div><div class="muted small">Никто никому не должен</div>`;
  } else {
    top =
      `<div class="big"><span>${Math.round(tot).toLocaleString('ru-RU')}</span> ₽</div>` +
      c.tr
        .map(
          (t) =>
            `<div class="flow"><span class="who">${av(t.from, state)}${nm(t.from, state)}</span><span class="ar">→</span><span class="who">${av(t.to, state)}${nm(t.to, state)}</span><span class="sp"></span>${c.tr.length > 1 ? `<b class="num">${rub(t.sum)}</b>` : ''}</div>`
        )
        .join('');
  }

  return `<div class="hero" id="hero">
    <div class="lbl">Текущий долг · с учётом взаимозачёта</div>${top}
    ${c.tr.length ? `<div class="forecast"><span>К концу месяца при тех же темпах</span><b>≈ ${rub(tot * F)}</b></div>` : ''}
    <div class="period"><div class="lbl" style="display:flex;justify-content:space-between"><span>Период</span><span>день ${DAY} из ${DIM}</span></div><div class="bar"><i style="width:${(DAY / DIM) * 100}%"></i></div></div>
    <div class="stats">
      <div class="stat"><span></span><span class="c"><small>Платит за кабинеты</small></span><span class="c"><small>Потребил</small></span></div>
      ${state.members
        .map(
          (m) =>
            `<div class="stat"><span class="h">${av(m.id, state)}${nm(m.id, state)}</span><span class="c"><b>${rub(c.paid[m.id])}</b></span><span class="c"><b>${rub(c.cons[m.id])}</b></span></div>`
        )
        .join('')}
    </div>
    ${c.unallocN ? `<div class="unalloc"><span>Не распределено ${rub(c.unalloc)} · ${c.unallocN} CDN</span><button class="link" style="color:inherit" data-a="goattn">Распределить</button></div>` : ''}
    ${cta ? `<div class="cta-wrap">${cta.label ? `<button class="btn pri cta ${cta.wait ? 'wait' : ''}" ${cta.a ? `data-a="${cta.a}"` : 'disabled'}>${cta.label}</button>` : ''}
      ${cta.note ? `<div class="cta-note">${cta.note}</div>` : ''}
      ${cta.sec ? `<div class="cta-2">${cta.sec.map((s) => `<button class="link" data-a="${s[1]}" data-v="${s[2] || ''}">${s[0]}</button>`).join('')}</div>` : ''}</div>` : ''}
    <div class="since">Считаем с последнего расчёта · ${esc(state.settledAt)}</div>
  </div>`;
}

export function attention(c, state) {
  const it = [];
  const cta = ctaState(c, state);

  if (state.pending && cta && cta.a === 'confirm' && c.tr.some((t) => t.to === state.me)) {
    it.push({
      sev: 0,
      k: 'ok',
      t: `${nm(state.pending.by, state)} отметил перевод`,
      s: 'Проверьте поступление и подтвердите — долг обнулится',
      act: [['Подтвердить', 'confirm', 'pri']],
    });
  }

  state.accounts.forEach((a) => {
    const p = a.prov ? { n: a.name || a.prov } : { n: a.name };
    const h = health(a);

    if (h.f.includes('key')) {
      it.push({
        sev: 3,
        k: 'bad',
        t: `${a.name}: ключ не принят`,
        s: `Данные устарели (${ago(a.updated)}). Расходы считаем по последним известным.`,
        act: [['Обновить ключ', 'editAcc', a.id]],
      });
    }

    if (h.f.includes('low2') || h.f.includes('low1')) {
      const d = Math.max(1, Math.floor(h.c.days));
      it.push({
        sev: h.f.includes('low2') ? 3 : 1,
        k: h.f.includes('low2') ? 'bad' : 'warn',
        t: `${a.name}: хватит на ~${d} дн.`,
        s: a.payer === state.me ? 'Нужно пополнить вам' : `Пополнять ${nm(a.payer, state)}`,
        act: [a.payer === state.me ? ['Открыть кабинет', 'open', a.id] : ['Напомнить', 'remind', a.id]],
      });
    }

    (a.res || []).forEach((r) => {
      if (r.consumer === null) {
        it.push({
          sev: 2,
          k: 'warn',
          t: `Новый CDN: ${esc(r.domain)}`,
          s: `${a.name} · ${gb(r.gb)} за период. Чей он?`,
          assign: [a.id, r.id],
        });
      }
      if (!r.up) {
        it.push({
          sev: 3,
          k: 'bad',
          t: `${esc(r.domain)} не отвечает`,
          s: `${a.name} · потребитель: ${r.consumer === 'all' ? 'поровну' : nm(r.consumer, state)}`,
          act: [['Открыть', 'open', a.id]],
        });
      }
      const x = spikeX(r);
      if (x >= 2.5) {
        const ac = accCalc(a);
        const i = a.res.indexOf(r);
        it.push({
          sev: 2,
          k: 'warn',
          t: `${esc(r.domain)}: трафик ×${x.toFixed(1)} за сутки`,
          s: `Если так пойдёт — ~${rub(ac.costs[i] * F * 1.6)} к концу месяца. Возможен хотлинг или атака.`,
          act: [['Открыть', 'open', a.id]],
        });
      }
    });
  });

  return it.sort((a, b) => b.sev - a.sev);
}

export function attHTML(c, state) {
  const it = attention(c, state);
  if (!it.length) return '';

  return `<section class="sect" id="attn"><h2>Требует внимания · ${it.length}</h2><div class="attlist">${it
    .map(
      (i) => `<div class="att ${i.k}"><span class="mk"></span><div class="att-main"><div class="att-t">${i.t}</div><div class="att-s">${i.s}</div>
    ${
      i.assign
        ? seg(
            [...state.members.map((m) => [m.id, esc(m.name)]), ['all', 'Поровну']],
            null,
            'cons',
            `data-acc="${i.assign[0]}" data-res="${i.assign[1]}"`,
            'need'
          )
        : ''
    }</div>
    ${
      i.act
        ? `<div class="att-act">${i.act
            .map(
              (a) =>
                `<button class="btn sm ${a[2] === 'pri' ? 'pri' : 'ghost'}" data-a="${a[1]}" data-v="${a[1] === 'confirm' ? '' : a[2]}" ${['open', 'remind', 'editAcc'].includes(a[1]) ? `data-id="${a[2]}"` : ''}>${a[0]}</button>`
            )
            .join('')}</div>`
        : ''
    }</div>`
    )
    .join('')}</div></section>`;
}

export function formulaHTML(a, c, r, i) {
  const share = c.total ? r.gb / c.total : 0;
  const fs = a.freeGb ? c.freeUsed * share : 0;
  const bill = r.gb - fs;
  const base = bill * a.price;

  return `<div class="formula"><b>Как посчитано</b>
   <div class="eq">${gb(r.gb)}${a.freeGb ? ` − ${gb(fs)} бесплатных` : ''} = ${gb(bill)} × ${a.price.toLocaleString('ru-RU')} ₽ = ${rub(base)}</div>
   ${a.freeGb ? `<div>Бесплатный лимит ${gb(a.freeGb)} делится между ресурсами аккаунта пропорционально трафику.</div>` : ''}
   ${!a.countBonus && c.k < 1 ? `<div>Бонусные рубли не учитываем: ${rub(a.bonusSpent)} покрыто бонусами → итог <b>${rub(c.costs[i])}</b>.</div>` : ''}
   <div>Прогноз на конец месяца: ${rub(c.costs[i])} × ${DIM}/${DAY} = <b>${rub(c.costs[i] * F)}</b></div></div>`;
}

export function accHTML(a, h, compact, state) {
  const provMap = {
    yandex: { n: 'Yandex Cloud', s: 'Ya', c: '#FC3F1D' },
    selectel: { n: 'Selectel', s: 'Se', c: '#1E6BFF' },
    vk: { n: 'VK Cloud', s: 'VK', c: '#0077FF' },
    mts: { n: 'MTS Cloud', s: 'MTS', c: '#E30611' },
    timeweb: { n: 'Timeweb Cloud', s: 'Tw', c: '#6C4BFF' },
    beget: { n: 'Beget', s: 'Be', c: '#00A86B' },
  };

  const p = provMap[a.prov] || { n: a.name || 'CDN Provider', s: 'CDN', c: '#493660' };
  const c = h.c;
  const err = a.status === 'error';
  const open = (state.openAcc && state.openAcc[a.id] !== undefined)
    ? state.openAcc[a.id]
    : (state.open && state.open[a.id] !== undefined ? state.open[a.id] : h.sev > 0);
  const isManual = a.source === 'manual';

  const chips = [];
  if (isManual) chips.push('<span class="pill">ручной режим</span>');
  if (h.f.includes('key')) chips.push('<span class="pill bad">ключ не принят</span>');
  if (h.f.includes('low2')) chips.push(`<span class="pill bad">хватит на ~${Math.max(1, Math.floor(c.days))} дн.</span>`);
  else if (h.f.includes('low1')) chips.push(`<span class="pill warn">хватит на ~${Math.floor(c.days)} дн.</span>`);

  const dn = (a.res || []).filter((r) => !r.up).length;
  const nw = (a.res || []).filter((r) => r.consumer === null).length;
  if (dn) chips.push(`<span class="pill bad">${dn} не работает</span>`);
  if (nw) chips.push(`<span class="pill warn">${nw} не назначен</span>`);
  if (h.f.includes('spike')) chips.push('<span class="pill warn">всплеск трафика</span>');

  const freeP = a.freeGb ? Math.min(100, (c.freeUsed / a.freeGb) * 100) : 0;

  return `<div class="acc ${open ? 'open is-open' : ''} ${compact ? 'compact' : ''}" id="acc-${a.id}">
   <div class="acc-head" data-a="toggle" data-act="toggle-acc" data-v="${a.id}">
     <div class="plogo" style="background:${p.c}">${p.s}</div>
     <div class="acc-main"><div class="acc-title">${esc(p.n)}</div><div class="acc-sub">${esc(a.login || '')} · ${esc(a.name || '')}</div>
       <div class="chips">${av(a.payer, state)}<span class="small muted">платит ${nm(a.payer, state)}</span>${chips.join('')}<span class="fresh ${a.updated > 60 ? 'old' : ''}">${a.updated > 60 ? 'данные от ' : ''}${ago(a.updated || 0)}</span></div></div>
     <div class="acc-bal ${err ? 'stale' : ''}"><b>${rub(a.balance)}</b><span class="xs faint">${err ? 'посл. известный' : a.bonus ? '+ ' + rub(a.bonus) + ' бонус' : 'баланс'}</span></div><span class="chev acc-chev">${ICONS.chev}</span>
   </div>
   <div class="acc-body">
    <div class="acc-body-in">
     ${err ? `<div class="alert"><span>API-ключ не принят — ${ago(a.updated || 0)} данные не обновлялись</span><button class="btn sm bad" style="background:var(--surface)" data-a="editAcc" data-v="${a.id}">Обновить</button></div>` : ''}
     <div class="meta">
       <div><div class="field-l">Кто платит за кабинет</div>${seg(state.members.map((m) => [m.id, esc(m.name)]), a.payer, 'payer', `data-acc="${a.id}"`)}</div>
       <div class="free"><div class="field-l">Бесплатный трафик по тарифу</div>${a.freeGb ? `<div class="small"><b class="num">${gb(c.freeUsed)}</b> <span class="muted">из ${gb(a.freeGb)}</span></div><div class="bar"><i style="width:${freeP}%"></i></div>` : '<div class="small muted">Нет бесплатного лимита</div>'}</div>
       <div class="full small muted">Пополнено за период: <b class="num" style="color:var(--ink)">${rub(a.topup || 0)}</b> <span class="faint">· справка, в долг не входит — считаем по потреблению</span></div>
     </div>
     ${(a.res || [])
       .map((r, i) => {
         const x = spikeX(r);
         const sp = x >= 2.5;
         const openHow = Boolean(
           (state.openHow && state.openHow[r.id] !== undefined)
             ? state.openHow[r.id]
             : (state.f && state.f[r.id])
         );
         return `<div class="res" id="res-${r.id}">
       <div class="res-top"><div><div class="dom"><span class="dot ${r.up ? '' : 'bad'}"></span>${esc(r.domain)}${r.isNew && r.consumer === null ? ' <span class="tag">новый</span>' : ''}</div><div class="tech">${esc(r.tech)}${r.up ? '' : ' · недоступен'}</div></div>
         <button class="cost how-btn ${openHow ? 'open is-open' : ''}" data-a="formula" data-act="toggle-how" data-v="${r.id}" title="Как посчитано"><b>${rub(c.costs[i])}</b><span class="how-label"><span class="how-text">${gb(r.gb)} · как?</span><span class="chev how-chev">${ICONS.chev}</span></span></button></div>
       <div class="res-mid">${spark(r.h, sp)}<span class="fc">14 дн.</span>${sp ? `<span class="pill bad">×${x.toFixed(1)} за сутки</span>` : ''}<span class="fc">→ ~${rub(c.costs[i] * F)} к концу мес.</span></div>
       <div class="how-box ${openHow ? 'open is-open' : ''}" id="how-${r.id}">
         <div class="how-box-in">
           ${formulaHTML(a, c, r, i)}
         </div>
       </div>
       <div class="res-bot"><span class="xs faint">Чей CDN</span>${seg([...state.members.map((m) => [m.id, esc(m.name)]), ['all', 'Поровну']], r.consumer, 'cons', `data-acc="${a.id}" data-res="${r.id}"`, r.consumer === null ? 'need' : '')}</div>
     </div>`;
       })
       .join('')}
     <div class="acc-foot">
       <span class="small muted">Итого за период: <b class="num" style="color:var(--ink)">${rub(c.sum)}</b> <span class="faint">· прогноз ${rub(c.sum * F)}</span></span>
       <div class="row" style="gap:6px">
         ${isManual ? `<button class="btn sm ghost" data-a="manualUsage" data-v="${a.id}">Ввести вручную</button>` : ''}
         <button class="btn sm ghost" data-a="editAcc" data-v="${a.id}">${ICONS.edit}Настроить</button>
       </div>
     </div>
    </div>
   </div></div>`;
}

export function renderHome(state) {
  const c = calc(state);
  const hs = state.accounts.map((a) => ({ a, h: health(a) })).sort((x, y) => y.h.sev - x.h.sev);
  const bad = hs.filter((x) => x.h.sev > 0);
  const ok = hs.filter((x) => x.h.sev === 0);

  return `<div class="grid home" id="view-main">
   <div><div class="sticky">${heroHTML(c, state)}</div></div>
   <div>${attHTML(c, state)}
     <div class="row between" style="margin-bottom:6px"><h2 style="margin:0">Аккаунты · ${state.accounts.length}</h2><button class="btn sm pri" data-a="addAcc">${ICONS.plus}Добавить</button></div>
     ${bad.map((x) => accHTML(x.a, x.h, false, state)).join('')}
     ${ok.length ? `<h2 class="group-t">Всё в порядке · ${ok.length}</h2>${ok.map((x) => accHTML(x.a, x.h, true, state)).join('')}` : ''}
   </div></div>`;
}

export function updateSbar(state) {
  const el = document.getElementById('sbar');
  if (!el) return;

  const c = calc(state);
  const cta = ctaState(c, state);
  const hero = document.getElementById('hero');

  const show = (state.tab === 'home' || state.tab === 'main') && cta && cta.label && hero && hero.getBoundingClientRect().bottom < 60;
  if (!cta || !cta.label) {
    el.className = 'sbar';
    return;
  }

  const tot = c.tr.reduce((s, t) => s + t.sum, 0);
  const t = c.tr[0];
  if (!t) {
    el.className = 'sbar';
    return;
  }

  el.innerHTML = `<div class="t">${nm(t.from, state)} → ${nm(t.to, state)} · ${rub(tot)}<small>${cta.note || 'долг на сейчас'}</small></div><button class="btn" ${cta.a ? `data-a="${cta.a}"` : 'disabled'}>${cta.short}</button>`;
  el.className = 'sbar' + (show ? ' show' : '');
}
