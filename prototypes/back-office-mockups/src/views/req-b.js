import { store, pending, state, isActive, isInquiry, dueList, value, TODAY } from '../store.js';
import { esc, icon, fmt, addDays, startOfDay, sameDay, money, who, what, when, chip, actionsFor, aed } from '../ui.js';
import { card, cardCss, style, legend, itemsOn } from './common.js';

const BEFORE = 7;
const AFTER = 63;
const COL = 132;

const LANES = [
  { key: 'sim', name: 'Sim', test: (b) => b.service === 'sim' },
  { key: 'track', name: 'Track', test: (b) => b.service === 'track' },
  { key: 'inq', name: 'Inquiries', test: isInquiry },
];

const css = `
${cardCss}
.rb-board { display: flex; gap: 1px; margin-bottom: 18px; border-radius: var(--r); overflow: hidden; background: var(--line); border: 1px solid var(--line); }
.rb-board > div { flex: 1; padding: 14px 18px; background: var(--panel); display: grid; gap: 4px; }
.rb-board > div button { all: unset; cursor: pointer; display: grid; gap: 4px; }
.rb-tl { overflow-x: auto; overflow-y: hidden; border-radius: var(--r); border: 1px solid var(--line); background: var(--panel); }
.rb-grid { display: grid; grid-template-columns: 112px repeat(${BEFORE + AFTER}, ${COL}px); position: relative; }
.rb-lane-name { position: sticky; left: 0; z-index: 3; background: var(--panel); border-right: 1px solid var(--line-2); padding: 12px 14px; display: flex; align-items: flex-start; }
.rb-dh { padding: 10px 10px 8px; border-left: 1px solid var(--line); border-bottom: 1px solid var(--line-2); }
.rb-dh b { display: block; font-size: 15px; font-weight: 600; color: var(--type-hi); }
.rb-dh.wknd { background: rgb(198 206 217 / 0.025); }
.rb-dh.today { background: var(--blue-soft); }
.rb-dh.today b { color: var(--blue-ink); }
.rb-cell { border-left: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: 6px 5px; display: grid; gap: 4px; align-content: start; min-height: 64px; }
.rb-cell.wknd { background: rgb(198 206 217 / 0.025); }
.rb-cell.today { background: rgb(63 123 255 / 0.06); }
.rb-cell .blk { cursor: pointer; }
.rb-cell .blk.sel, .rb-pd .blk.sel { box-shadow: 0 0 0 2px var(--type-hi); }
.rb-cell.past .blk { opacity: 0.6; }
.rb-month { grid-column: span 1; }
.rb-sheet { position: fixed; top: 0; right: 0; bottom: 0; width: 400px; z-index: 20; padding: 20px; background: var(--stage-2); border-left: 1px solid var(--line-2); box-shadow: -20px 0 50px rgb(8 12 20 / 0.45); display: grid; align-content: start; gap: 14px; overflow-y: auto; }
.rb-pd { display: grid; gap: 8px; }
.rb-pd-day { display: grid; grid-template-columns: 54px minmax(0, 1fr); gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--line); }
.rb-pd-day b { display: block; font-size: 17px; color: var(--type-hi); font-weight: 600; }
.rb-pd-day.today b { color: var(--blue-ink); }
.rb-pd-items { display: grid; gap: 5px; }
@media (max-width: 760px) {
  .rb-board { flex-wrap: wrap; }
  .rb-board > div { flex: 1 1 40%; padding: 12px 14px; }
  .rb-sheet { left: 0; top: auto; width: auto; max-height: 82%; border-left: 0; border-top: 1px solid var(--line-2); border-radius: 18px 18px 0 0; padding-bottom: calc(20px + env(safe-area-inset-bottom)); }
}
`;

function blk(b, u) {
  const s = state(b);
  const label = b.service === 'sim' ? `${fmt.time(b.start)} ${b.client.split(' ')[0]}` : b.service === 'track' ? `${b.client.split(' ')[0]} · ${b.venue.split(' ')[0]}` : b.org;
  return `<div class="blk ${s} ${u.sel === b.id ? 'sel' : ''}" data-ui="sel:${b.id}" title="${esc(who(b))} · ${esc(what(b))}"><div class="trunc">${esc(label)}</div></div>`;
}

export default {
  name: 'Timing screen',
  idea: 'Nine weeks on one horizontal strip, a lane per service like a timing screen. Requests sit inline where they would land; tap one and a side sheet holds the decision.',
  init: () => ({ sel: null, filter: 'all', first: true }),
  render(u) {
    style('req-b', css);
    const start = addDays(startOfDay(TODAY), -BEFORE);
    const days = [...Array(BEFORE + AFTER)].map((_, i) => addDays(start, i));
    const show = (b) => (u.filter === 'pending' ? b.status === 'tentative' : isActive(b) || b.status === 'unlocked' || state(b) === 'paid');
    const sel = u.sel ? store.byId[u.sel] : null;
    const p = pending();
    const weekEnd = addDays(startOfDay(TODAY), 7);
    const thisWeek = store.items.filter((b) => b.status === 'confirmed' && b.start >= startOfDay(TODAY) && b.start < weekEnd);
    const due = dueList();

    const lanes = LANES.map((l) => `
      <div class="rb-lane-name"><span class="label">${l.name}</span></div>
      ${days.map((d) => {
        const its = itemsOn(d).filter((b) => l.test(b) && show(b) && (b.service !== 'sim' || sameDay(b.start, d)));
        const wk = d.getDay() === 5 || d.getDay() === 6;
        return `<div class="rb-cell ${wk ? 'wknd' : ''} ${sameDay(d, TODAY) ? 'today' : ''} ${d < startOfDay(TODAY) ? 'past' : ''}">${its.map((b) => blk(b, u)).join('')}</div>`;
      }).join('')}`).join('');

    const phoneDays = days.slice(BEFORE, BEFORE + 28).map((d) => {
      const its = itemsOn(d).filter((b) => show(b) && (b.service !== 'sim' || sameDay(b.start, d)));
      if (!its.length) return '';
      return `<div class="rb-pd-day ${sameDay(d, TODAY) ? 'today' : ''}"><div><span class="label">${fmt.day(d).split(' ')[0]}</span><b>${d.getDate()}</b><span class="tiny dim">${fmt.mon(d)}</span></div><div class="rb-pd-items">${its.map((b) => blk(b, u)).join('')}</div></div>`;
    }).join('');

    return `<div class="page">
      <header class="head">
        <h1>Requests</h1>
        <div class="grow"></div>
        <span class="hide-phone">${legend()}</span>
        <div class="seg"><button class="${u.filter === 'all' ? 'on' : ''}" data-ui="filter:all">All</button><button class="${u.filter === 'pending' ? 'on' : ''}" data-ui="filter:pending">To confirm</button></div>
      </header>

      <div class="rb-board">
        <div><button data-ui="filter:pending"><span class="label">To confirm</span><span class="big">${p.length}</span></button></div>
        <div><span class="label">Next 7 days</span><span class="big">${thisWeek.length}<span class="dim small"> locked</span></span></div>
        <div><span class="label">Held, unconfirmed</span><span class="big"><span class="cur">AED</span>${aed(p.reduce((s, b) => s + value(b), 0))}</span></div>
        <div><span class="label">Cash due</span><span class="big gold-t"><span class="cur">AED</span>${aed(due.reduce((s, b) => s + value(b), 0))}</span></div>
      </div>

      <div class="rb-tl hide-phone" data-keep="rb-tl">
        <div class="rb-grid">
          <div class="rb-lane-name" style="border-bottom:1px solid var(--line-2)"></div>
          ${days.map((d) => `<div class="rb-dh ${d.getDay() === 5 || d.getDay() === 6 ? 'wknd' : ''} ${sameDay(d, TODAY) ? 'today' : ''}"><span class="label">${fmt.day(d).split(' ')[0]}${d.getDate() === 1 || sameDay(d, days[0]) ? ` · ${fmt.mon(d)}` : ''}</span><b>${d.getDate()}</b></div>`).join('')}
          ${lanes}
        </div>
      </div>

      <div class="rb-pd only-phone">${phoneDays || '<div class="empty">Nothing to confirm</div>'}</div>

      ${sel ? `<aside class="rb-sheet">
        <div class="row between"><span class="label">${esc(what(sel))}</span><button class="btn btn-icon btn-ghost" data-ui="sel:null" aria-label="Close">${icon('close')}</button></div>
        ${card(sel, { selected: false })}
        ${sel.email ? `<div class="panel pad small stack"><div class="row">${icon('mail')}<span>${esc(sel.email)}</span></div><div class="row">${icon('chat')}<a class="blue-t" href="#/messages">Open conversation</a></div></div>` : ''}
      </aside>` : ''}
    </div>`;
  },
  after(root, u) {
    if (!u.first) return;
    u.first = false;
    const tl = root.querySelector('.rb-tl');
    if (tl) tl.scrollLeft = (BEFORE - 1) * COL;
  },
};
