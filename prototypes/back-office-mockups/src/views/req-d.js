import { store, pending, state, isActive, isInquiry, dueList, end, value, TODAY } from '../store.js';
import { esc, icon, fmt, addDays, startOfDay, sameDay, who, what, when, money, avatar, aed } from '../ui.js';
import { style, setTag } from './common.js';

const css = `
.rd { max-width: 920px; margin: 0 auto; }
.rd-day { display: flex; align-items: baseline; gap: 10px; margin: 26px 4px 10px; }
.rd-day:first-child { margin-top: 6px; }
.rd-day .hi { font-size: 14px; }
.rd-item { display: grid; grid-template-columns: 64px minmax(0, 1fr) auto; gap: 16px; align-items: center; padding: 14px 16px; border-radius: var(--r); background: var(--panel); border: 1px solid var(--line); }
.rd-item + .rd-item { margin-top: 8px; }
.rd-item.out { opacity: 0.5; }
.rd-time { font-size: 15px; color: var(--type-hi); line-height: 1.2; }
.rd-time span { display: block; font-size: 10px; color: var(--faint); margin-top: 3px; }
.rd-meta { display: flex; gap: 6px 12px; flex-wrap: wrap; font-size: 11px; color: var(--dim); margin-top: 3px; }

/* The gate: one track, four positions, one chrome knob. */
.gate { position: relative; display: grid; grid-template-columns: repeat(4, 62px); height: 40px; padding: 3px; border-radius: 999px; background: var(--stage); border: 1px solid var(--line-2); box-shadow: inset 0 2px 6px rgb(8 12 20 / 0.5); }
.gate button { position: relative; z-index: 1; border: 0; background: none; color: var(--faint); font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; border-radius: 999px; }
.gate button:not(:disabled):hover { color: var(--type-hi); }
.gate button:disabled { cursor: default; }
.gate button.here { color: var(--ink); }
.gate .knob { position: absolute; top: 3px; bottom: 3px; left: 3px; width: 62px; border-radius: 999px; transition: transform 0.35s cubic-bezier(0.3, 1.4, 0.5, 1), background 0.2s; box-shadow: 0 2px 6px rgb(8 12 20 / 0.5), inset 0 1px 0 rgb(255 255 255 / 0.5); }
.gate[data-pos="0"] .knob { transform: translateX(0); background: var(--panel-3); box-shadow: none; }
.gate[data-pos="0"] button.here { color: var(--dim); }
.gate[data-pos="1"] .knob { transform: translateX(62px); background: var(--chrome-silver); }
.gate[data-pos="2"] .knob { transform: translateX(124px); background: var(--chrome-blue); }
.gate[data-pos="2"] button.here { color: #fff; }
.gate[data-pos="3"] .knob { transform: translateX(186px); background: var(--chrome-gold); }
.gate.due { border-color: var(--gold); }
.rd-due { color: var(--gold); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; }
.rd-cal { display: grid; grid-template-columns: repeat(14, minmax(0, 1fr)); gap: 4px; margin-bottom: 8px; padding: 10px; border-radius: var(--r); background: var(--panel); border: 1px solid var(--line); }
.rd-cal button { all: unset; cursor: pointer; display: grid; gap: 3px; justify-items: center; align-content: start; padding: 6px 2px 7px; border-radius: 8px; min-height: 74px; }
.rd-cal button:hover { background: var(--silver-soft); }
.rd-cal button.today { background: var(--blue-soft); }
.rd-cal .n { font-size: 14px; color: var(--type-hi); }
.rd-cal .blk { width: 100%; height: 6px; padding: 0; border-radius: 3px; }
.rd-cal .wd { font-size: 9px; color: var(--faint); letter-spacing: 0.08em; text-transform: uppercase; }
.rd-top { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 8px; }
.rd-top button { all: unset; cursor: pointer; padding: 14px 16px; border-radius: var(--r); background: var(--panel); border: 1px solid var(--line); display: grid; gap: 4px; }
.rd-top button.on { border-color: var(--blue); }
@media (max-width: 760px) {
  .rd-item { grid-template-columns: 50px minmax(0, 1fr); gap: 10px 12px; padding: 12px; }
  .rd-item .gate { grid-column: 1 / -1; }
  .gate { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .gate .knob { width: calc((100% - 6px) / 4); }
  .gate[data-pos="1"] .knob { transform: translateX(100%); }
  .gate[data-pos="2"] .knob { transform: translateX(200%); }
  .gate[data-pos="3"] .knob { transform: translateX(300%); }
  .rd-top { gap: 6px; }
  .rd-cal { grid-template-columns: repeat(7, minmax(0, 1fr)); padding: 6px; }
  .rd-cal button { min-height: 58px; }
  .rd-top button { padding: 10px 12px; }
}
`;

// N, Held, Locked, Paid. Each move maps onto one store action.
function gate(b) {
  const s = state(b);
  const pos = { unlocked: 0, declined: 0, tentative: 1, confirmed: 2, due: 2, paid: 3 }[s];
  const future = end(b) >= TODAY;
  const moves = [
    s === 'tentative' ? 'decline' : s === 'confirmed' || s === 'due' || s === 'paid' ? 'unlock' : null,
    null,
    s === 'tentative' ? 'confirm' : s === 'paid' ? 'unpaid' : s === 'unlocked' && future ? 'relock' : null,
    s === 'paid' ? null : s === 'unlocked' || s === 'declined' ? null : 'paid',
  ];
  const names = ['Off', 'Held', 'Locked', 'Paid'];
  const tips = { decline: 'Decline', unlock: 'Unlock the slot', confirm: 'Confirm and lock', unpaid: 'Undo paid', relock: 'Lock again', paid: 'Mark paid, cash in hand' };
  return `<div class="gate ${s === 'due' ? 'due' : ''}" data-pos="${pos}" role="group" aria-label="Status">
    <span class="knob"></span>
    ${names.map((n, i) => `<button class="${i === pos ? 'here' : ''}" ${moves[i] && i !== pos ? `data-act="${moves[i]}:${b.id}" title="${tips[moves[i]]}"` : 'disabled'}>${s === 'declined' && i === 0 ? 'No' : n}</button>`).join('')}
  </div>`;
}

function item(b) {
  const s = state(b);
  const org = isInquiry(b);
  const time = b.service === 'sim' ? fmt.time(b.start) : b.days > 1 ? `${b.days}d` : 'Day';
  return `<div class="rd-item ${s === 'unlocked' || s === 'declined' ? 'out' : ''}">
    <div class="rd-time">${time}<span>${b.service === 'sim' ? `${b.hours} h` : b.service === 'track' ? 'Track' : org ? 'Inquiry' : ''}</span></div>
    <div style="min-width:0">
      <div class="row" style="gap:8px"><span class="hi trunc">${esc(who(b))}</span>${setTag(b)}${s === 'due' ? '<span class="rd-due">Cash due</span>' : ''}</div>
      <div class="rd-meta"><span>${esc(org ? `${b.client} · ${what(b)}` : what(b))}</span><span>${esc(b.venue)}</span><span class="${b.price == null ? '' : 'hi'}">${money(b.price)}</span></div>
    </div>
    ${gate(b)}
  </div>`;
}

const dayName = (d) => {
  if (sameDay(d, TODAY)) return 'Today';
  if (sameDay(d, addDays(TODAY, 1))) return 'Tomorrow';
  return fmt.dayLong(d);
};

export default {
  name: 'Gearbox stream',
  idea: 'One list, day by day, and one control: every booking has a gate with Off, Held, Locked and Paid. Jack shifts the knob to confirm, take cash or unlock. Works the same on the phone.',
  init: () => ({ f: 'next' }),
  render(u) {
    style('req-d', css);
    const today = startOfDay(TODAY);
    const p = pending();
    const due = dueList();
    let list;
    if (u.f === 'ask') list = p;
    else if (u.f === 'due') list = due;
    else list = store.items.filter((b) => end(b) >= today && b.start < addDays(today, 35) && (isActive(b) || b.status === 'unlocked'));

    const groups = [];
    for (const b of list) {
      const k = startOfDay(b.start).getTime();
      let g = groups[groups.length - 1];
      if (!g || g.k !== k) groups.push((g = { k, d: startOfDay(b.start), items: [] }));
      g.items.push(b);
    }

    return `<div class="page">
      <header class="head"><h1>Requests</h1></header>
      <div class="rd">
        <div class="rd-top">
          <button class="${u.f === 'next' ? 'on' : ''}" data-ui="f:next"><span class="label">Coming up</span><span class="big">${store.items.filter((b) => b.status === 'confirmed' && b.start >= today && b.start < addDays(today, 7)).length}<span class="small dim"> this week</span></span></button>
          <button class="${u.f === 'ask' ? 'on' : ''}" data-ui="f:ask"><span class="label">To confirm</span><span class="big">${p.length}</span></button>
          <button class="${u.f === 'due' ? 'on' : ''}" data-ui="f:due"><span class="label">Cash due</span><span class="big gold-t">${aed(due.reduce((s, b) => s + value(b), 0), { short: true })}</span></button>
        </div>
        <div class="rd-cal">${[...Array(14)].map((_, i) => {
          const d = addDays(today, i);
          const its = store.items.filter((b) => (isActive(b) || state(b) === 'paid') && startOfDay(b.start) <= d && addDays(startOfDay(b.start), b.days - 1) >= d);
          return `<button class="${i === 0 ? 'today' : ''}" data-ui="f:next;jump:${d.getTime()}" title="${fmt.dayLong(d)}"><span class="wd">${fmt.day(d).slice(0, 2)}</span><span class="n">${d.getDate()}</span>${its.slice(0, 4).map((b) => `<span class="blk ${state(b)}"></span>`).join('')}</button>`;
        }).join('')}</div>
        ${groups.map((g) => `<div class="rd-day" data-day="${g.k}"><span class="hi">${dayName(g.d)}</span>${u.f === 'next' ? '' : `<span class="dim small">${fmt.dm(g.d)}</span>`}</div>${g.items.map(item).join('')}`).join('') || '<div class="empty">Nothing here</div>'}
      </div>
    </div>`;
  },
  after(root, u) {
    if (!u.jump) return;
    const el = root.querySelector(`[data-day="${u.jump}"]`);
    u.jump = null;
    if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  },
};
