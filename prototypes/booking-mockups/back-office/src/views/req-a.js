import { store, pending, state, isInquiry, isActive, end, TODAY } from '../store.js';
import { esc, icon, fmt, addDays, startOfWeek, sameDay, money, what, who } from '../ui.js';
import { card, cardCss, style, legend, setTag } from './common.js';
import { actionsFor, chip, when } from '../ui.js';

const H0 = 8;
const H1 = 22;
const ROW = 46;

const css = `
${cardCss}
.ra { display: grid; grid-template-columns: 360px 1fr; gap: 20px; align-items: start; }
.ra-queue { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; position: sticky; top: 0; }
.ra-group { display: flex; align-items: center; gap: 8px; margin: 8px 2px 2px; }
.ra-cal { overflow: hidden; }
.ra-days { display: grid; grid-template-columns: 52px repeat(7, 1fr); border-bottom: 1px solid var(--line); }
.ra-day { padding: 10px 8px; text-align: left; border: 0; background: none; color: var(--dim); }
.ra-day b { display: block; font-size: 18px; color: var(--type-hi); font-weight: 600; margin-top: 2px; }
.ra-day.today b { color: var(--blue-ink); }
.ra-day.today { box-shadow: inset 0 -2px 0 var(--blue); }
.ra-allday { display: grid; grid-template-columns: 52px repeat(7, 1fr); border-bottom: 1px solid var(--line); min-height: 40px; }
.ra-allday > div { padding: 5px 4px; display: grid; gap: 4px; border-left: 1px solid var(--line); }
.ra-grid { display: grid; grid-template-columns: 52px repeat(7, 1fr); position: relative; }
.ra-hours { display: grid; grid-auto-rows: ${ROW}px; }
.ra-hours span { font-size: 10px; color: var(--faint); padding: 0 8px; transform: translateY(-7px); text-align: right; }
.ra-col { position: relative; border-left: 1px solid var(--line); background: repeating-linear-gradient(to bottom, transparent 0 ${ROW - 1}px, var(--line) ${ROW - 1}px ${ROW}px); }
.ra-col.today { background-color: rgb(63 123 255 / 0.04); }
.ra-col .blk { position: absolute; left: 3px; right: 3px; cursor: pointer; }
.blk.sel { box-shadow: 0 0 0 2px var(--type-hi); }
.ra-now { position: absolute; left: 0; right: 0; height: 0; border-top: 1.5px solid var(--silver); z-index: 2; }
.ra-now::before { content: ''; position: absolute; left: -4px; top: -4.5px; width: 7px; height: 7px; border-radius: 50%; background: var(--silver); }
.ra-detail { margin-bottom: 4px; }
.ra-pdays { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; }
.ra-pdays button { flex: none; width: 46px; padding: 7px 0; border-radius: 10px; border: 1px solid var(--line); background: var(--panel); color: var(--dim); font-size: 10px; display: grid; justify-items: center; gap: 2px; }
.ra-pdays button b { font-size: 15px; color: var(--type-hi); font-weight: 600; }
.ra-pdays button.on { border-color: var(--blue); background: var(--blue-soft); }
.ra-pdays i { width: 5px; height: 5px; border-radius: 50%; background: var(--blue); }
@media (max-width: 1100px) { .ra { grid-template-columns: 300px 1fr; } }
@media (max-width: 760px) {
  .ra { grid-template-columns: minmax(0, 1fr); }
  .ra-queue { position: static; }
}
`;

const top = (d) => ((d.getHours() + d.getMinutes() / 60 - H0) * ROW);

function block(b, sel) {
  const s = state(b);
  const h = b.hours * ROW - 3;
  return `<div class="blk ${s} ${sel ? 'sel' : ''}" style="top:${top(b.start) + 1}px;height:${h}px" data-ui="sel:${b.id}" title="${esc(who(b))}">
    <div class="trunc">${esc(b.client.split(' ')[0])}</div>
    ${b.hours > 1 ? `<div class="tiny" style="opacity:.8">${fmt.time(b.start)}–${fmt.time(end(b))}</div>` : ''}
  </div>`;
}

const visible = (b) => isActive(b) || state(b) === 'paid';

export default {
  name: 'Queue and week',
  idea: 'Requests stack on the left like a pit wall to-do list; the week sits beside them as a time grid, so Jack sees the clash before he confirms.',
  init: () => ({ week: 0, sel: null, pday: 0 }),
  render(u) {
    style('req-a', css);
    const ws = addDays(startOfWeek(TODAY), u.week * 7);
    const days = [...Array(7)].map((_, i) => addDays(ws, i));
    const inWeek = (b, d) => {
      const s = new Date(b.start.getFullYear(), b.start.getMonth(), b.start.getDate());
      return d >= s && d <= addDays(s, b.days - 1);
    };
    const list = pending();
    const coaching = list.filter((b) => !isInquiry(b));
    const inquiries = list.filter(isInquiry);
    const sel = u.sel ? store.byId[u.sel] : null;
    const label = `${fmt.dm(days[0])} – ${fmt.dm(days[6])}`;
    const pd = addDays(startOfWeek(TODAY), u.pday);

    return `<div class="page">
      <header class="head">
        <h1>Requests</h1>
        <div class="grow"></div>
        <span class="hide-phone">${legend()}</span>
        <div class="row hide-phone">
          <button class="btn btn-icon btn-ghost" data-ui="week:-=1" aria-label="Previous week">${icon('left')}</button>
          <button class="btn btn-ghost" data-ui="week:0">${label}</button>
          <button class="btn btn-icon btn-ghost" data-ui="week:+=1" aria-label="Next week">${icon('right')}</button>
        </div>
      </header>
      <div class="ra">
        <section class="ra-queue">
          ${sel ? `<div class="ra-detail">${card(sel, { selected: true })}<div class="row" style="justify-content:flex-end;margin-top:6px"><button class="btn btn-sm btn-ghost" data-ui="sel:null">${icon('close')}<span>Close</span></button></div></div>` : ''}
          <div class="ra-group"><span class="label">To confirm</span><span class="badge">${coaching.length}</span></div>
          ${coaching.map((b) => card(b, { ui: `sel:${b.id};week:${weekOf(b.start)}`, selected: u.sel === b.id, note: false })).join('') || '<div class="empty">Nothing waiting</div>'}
          <div class="ra-group"><span class="label">Inquiries</span><span class="badge">${inquiries.length}</span></div>
          ${inquiries.map((b) => card(b, { ui: `sel:${b.id};week:${weekOf(b.start)}`, selected: u.sel === b.id, note: false })).join('')}
        </section>

        <section class="panel ra-cal hide-phone">
          <div class="ra-days"><span></span>${days.map((d) => `<div class="ra-day ${sameDay(d, TODAY) ? 'today' : ''}"><span class="label">${fmt.day(d).split(' ')[0]}</span><b>${d.getDate()}</b></div>`).join('')}</div>
          <div class="ra-allday"><span class="ra-hours"><span style="transform:none;padding-top:10px" class="tiny">Day</span></span>${days.map((d) => `<div>${store.items.filter((b) => b.service !== 'sim' && visible(b) && inWeek(b, d)).map((b) => `<div class="blk ${state(b)} ${u.sel === b.id ? 'sel' : ''}" data-ui="sel:${b.id}" style="cursor:pointer"><div class="trunc">${esc(b.service === 'track' ? `Track · ${b.client.split(' ')[0]}` : b.org)}</div></div>`).join('')}</div>`).join('')}</div>
          <div class="ra-grid scroll" style="max-height:${(H1 - H0) * ROW + 2}px">
            <div class="ra-hours">${[...Array(H1 - H0)].map((_, i) => `<span>${i ? `${String(H0 + i).padStart(2, '0')}:00` : ''}</span>`).join('')}</div>
            ${days.map((d) => `<div class="ra-col ${sameDay(d, TODAY) ? 'today' : ''}" style="height:${(H1 - H0) * ROW}px">
              ${sameDay(d, TODAY) ? `<div class="ra-now" style="top:${top(TODAY)}px"></div>` : ''}
              ${store.items.filter((b) => b.service === 'sim' && visible(b) && sameDay(b.start, d)).map((b) => block(b, u.sel === b.id)).join('')}
            </div>`).join('')}
          </div>
        </section>

        <section class="only-phone stack">
          <div class="ra-group"><span class="label">This week</span></div>
          <div class="ra-pdays">${[...Array(14)].map((_, i) => { const d = addDays(startOfWeek(TODAY), i); const has = store.items.some((b) => visible(b) && inWeek(b, d)); return `<button class="${u.pday === i ? 'on' : ''}" data-ui="pday:${i}"><span>${fmt.day(d).split(' ')[0]}</span><b>${d.getDate()}</b>${has ? '<i></i>' : '<i style="opacity:0"></i>'}</button>`; }).join('')}</div>
          ${store.items.filter((b) => visible(b) && inWeek(b, pd)).map((b) => `<div class="panel pad" style="padding:12px 14px"><div class="row between"><div><div class="hi">${esc(who(b))}</div><div class="dim small">${when(b)}</div></div>${chip(b)}</div><div style="margin-top:10px">${actionsFor(b, { compact: true })}</div></div>`).join('') || '<div class="empty">Free day</div>'}
        </section>
      </div>
    </div>`;
  },
};

function weekOf(d) {
  return Math.round((startOfWeek(d) - startOfWeek(TODAY)) / (7 * 864e5));
}
