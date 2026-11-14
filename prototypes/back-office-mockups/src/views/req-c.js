import { store, pending, state, isActive, isInquiry, end, TODAY } from '../store.js';
import { esc, icon, fmt, addDays, startOfDay, startOfWeek, sameDay, who, what, when, chip, actionsFor, money } from '../ui.js';
import { card, cardCss, style, legend, itemsOn } from './common.js';

const HOURS = [...Array(12)].map((_, i) => 10 + i);

const css = `
${cardCss}
.rc { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 20px; align-items: start; }
.rc-month { padding: 14px; }
.rc-wk { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
.rc-wk + .rc-wk { margin-top: 6px; }
.rc-dn { padding: 0 4px 6px; }
.rc-day { min-width: 0; grid-template-columns: minmax(0, 1fr); position: relative; text-align: left; padding: 9px 9px 10px; min-height: 92px; border-radius: 10px; border: 1px solid var(--line); background: var(--stage-2); display: grid; align-content: space-between; gap: 8px; color: var(--type); }
.rc-day:hover { border-color: var(--line-2); }
.rc-day.out { opacity: 0.35; }
.rc-day.on { border-color: var(--blue); box-shadow: 0 0 0 1px var(--blue) inset; }
.rc-day.today .rc-num { color: var(--blue-ink); }
.rc-num { font-size: 15px; color: var(--type-hi); display: flex; justify-content: space-between; align-items: center; }
.rc-leds { display: grid; grid-template-columns: repeat(12, 1fr); gap: 2px; }
.rc-leds i { height: 12px; border-radius: 3px; background: rgb(198 206 217 / 0.07); }
.rc-leds i.tentative { background: var(--hatch), rgb(183 192 205 / 0.12); box-shadow: inset 0 0 0 1px rgb(183 192 205 / 0.5); }
.rc-leds i.confirmed { background: var(--blue); box-shadow: 0 0 6px rgb(63 123 255 / 0.55); }
.rc-leds i.due { background: var(--blue); box-shadow: inset 0 0 0 1.5px var(--gold); }
.rc-leds i.paid { background: var(--chrome-gold); box-shadow: 0 0 6px rgb(226 191 106 / 0.4); }
.rc-full { font-size: 9.5px; letter-spacing: 0.06em; color: var(--dim); }
.rc-ask { position: absolute; top: 9px; right: 9px; width: 8px; height: 8px; border-radius: 50%; border: 1.5px dashed var(--silver); }
.rc-panel { position: sticky; top: 0; display: grid; gap: 10px; }
.rc-hour { display: grid; grid-template-columns: 50px minmax(0, 1fr); gap: 10px; align-items: start; }
.rc-hour .t { font-size: 11px; color: var(--faint); padding-top: 14px; }
.rc-free { padding: 10px 12px; border-radius: 10px; border: 1px dashed var(--line); color: var(--faint); font-size: 11px; }
@media (max-width: 1100px) { .rc { grid-template-columns: minmax(0, 1fr) 320px; } }
@media (max-width: 760px) {
  .rc { grid-template-columns: minmax(0, 1fr); }
  .rc-month { padding: 8px; }
  .rc-wk { gap: 3px; }
  .rc-day { min-height: 58px; padding: 5px 4px 6px; border-radius: 7px; gap: 5px; }
  .rc-num { font-size: 12px; }
  .rc-leds { grid-template-columns: repeat(6, 1fr); gap: 1.5px; }
  .rc-leds i { height: 6px; border-radius: 2px; }
  .rc-full, .rc-ask { display: none; }
  .rc-panel { position: static; }
}
`;

function leds(d) {
  const its = itemsOn(d).filter((b) => isActive(b) || state(b) === 'paid');
  const full = its.find((b) => b.service !== 'sim');
  const cls = HOURS.map((h) => {
    if (full) return state(full);
    const b = its.find((x) => x.service === 'sim' && x.start.getHours() <= h && end(x).getHours() > h);
    return b ? state(b) : '';
  });
  return { cls, full, ask: its.some((b) => b.status === 'tentative' && end(b) >= TODAY) };
}

export default {
  name: 'Shift-light month',
  idea: 'The month as a wall of days; each day is a row of twelve shift lights from 10:00 to 22:00 that light up as hours are held, locked and paid. Track days light the whole row. Tap a day to work it.',
  init: () => ({ m: 0, day: TODAY.getDate(), dm: 0 }),
  render(u) {
    style('req-c', css);
    const first = new Date(TODAY.getFullYear(), TODAY.getMonth() + u.m, 1);
    const gridStart = startOfWeek(first);
    const weeks = [];
    for (let w = 0; w < 6; w++) {
      const row = [...Array(7)].map((_, i) => addDays(gridStart, w * 7 + i));
      if (w > 3 && row[0].getMonth() !== first.getMonth()) break;
      weeks.push(row);
    }
    const selDay = new Date(TODAY.getFullYear(), TODAY.getMonth() + u.dm, u.day);
    const dayItems = itemsOn(selDay, { all: true }).filter((b) => b.service !== 'sim' || sameDay(b.start, selDay));
    const full = dayItems.find((b) => b.service !== 'sim' && (isActive(b) || state(b) === 'paid'));
    const p = pending();

    const hourRows = full ? '' : HOURS.map((h) => {
      const b = dayItems.find((x) => x.service === 'sim' && x.start.getHours() === h);
      const covered = dayItems.find((x) => x.service === 'sim' && isActive(x) && x.start.getHours() < h && end(x).getHours() > h);
      if (covered) return '';
      return `<div class="rc-hour"><span class="t">${h}:00</span>${b ? card(b, { compact: true, note: false }) : '<div class="rc-free">Free</div>'}</div>`;
    }).join('');

    return `<div class="page">
      <header class="head">
        <h1>Requests</h1>
        <span class="badge" title="To confirm">${p.length}</span>
        <div class="grow"></div>
        <span class="hide-phone">${legend()}</span>
        <div class="row">
          <button class="btn btn-icon btn-ghost" data-ui="m:-=1" aria-label="Previous month">${icon('left')}</button>
          <button class="btn btn-ghost" data-ui="m:0">${fmt.month(first)}</button>
          <button class="btn btn-icon btn-ghost" data-ui="m:+=1" aria-label="Next month">${icon('right')}</button>
        </div>
      </header>
      <div class="rc">
        <section class="panel rc-month">
          <div class="rc-wk">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((n) => `<span class="label rc-dn">${n}</span>`).join('')}</div>
          ${weeks.map((row) => `<div class="rc-wk">${row.map((d) => {
            const l = leds(d);
            const on = sameDay(d, selDay);
            const dm = (d.getFullYear() - TODAY.getFullYear()) * 12 + d.getMonth() - TODAY.getMonth();
            return `<button class="rc-day ${d.getMonth() !== first.getMonth() ? 'out' : ''} ${on ? 'on' : ''} ${sameDay(d, TODAY) ? 'today' : ''}" data-ui="day:${d.getDate()};dm:${dm}">
              <span class="rc-num">${d.getDate()}</span>
              ${l.ask ? '<span class="rc-ask" title="Request waiting"></span>' : ''}
              <span>${l.full ? `<span class="rc-full trunc" style="display:block;margin-bottom:4px">${esc(l.full.service === 'track' ? 'Track day' : l.full.org)}</span>` : ''}<span class="rc-leds">${l.cls.map((c) => `<i class="${c}"></i>`).join('')}</span></span>
            </button>`;
          }).join('')}</div>`).join('')}
        </section>
        <section class="rc-panel">
          <div class="row between"><span class="label">${fmt.dayLong(selDay)}</span></div>
          ${full ? dayItems.map((b) => card(b)).join('') : hourRows}
          ${full ? '' : dayItems.filter((b) => b.service !== 'sim').map((b) => card(b)).join('')}
        </section>
      </div>
    </div>`;
  },
};
