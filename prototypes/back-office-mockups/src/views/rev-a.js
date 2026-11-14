import { totals, periodRange, monthly, seasonality, SERVICES, SERVICE_ORDER, TODAY } from '../store.js';
import { icon, aed, fmt } from '../ui.js';
import { style } from './common.js';
import { monthBars, split, svcKey, SVC_SOLID } from './charts.js';

const css = `
.va-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
.va-kpi { padding: 16px 18px; display: grid; gap: 8px; align-content: start; }
.va-kpi .foot { display: flex; justify-content: space-between; font-size: 10.5px; color: var(--dim); gap: 8px; }
.va-row { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr); gap: 14px; margin-bottom: 14px; }
.va-tbl { width: 100%; border-collapse: collapse; font-size: 12px; }
.va-tbl th { text-align: right; font-weight: 600; font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--faint); padding: 0 0 10px; }
.va-tbl th:first-child, .va-tbl td:first-child { text-align: left; }
.va-tbl td { text-align: right; padding: 10px 0; border-top: 1px solid var(--line); }
.va-tbl td:first-child { display: flex; align-items: center; gap: 8px; }
.va-heat { display: grid; grid-template-columns: 110px repeat(12, minmax(0, 1fr)); gap: 3px; font-size: 10px; }
.va-heat .c { height: 30px; border-radius: 5px; display: grid; place-items: center; font-size: 9.5px; color: var(--ink); }
.va-heat .mh { text-align: center; color: var(--dim); padding-bottom: 4px; }
.va-heat .mh.next { color: var(--blue-ink); }
.va-heat .rh { display: flex; align-items: center; gap: 8px; color: var(--type); }
.va-push { margin-top: 14px; display: flex; gap: 8px; flex-wrap: wrap; }
.va-push span { padding: 6px 11px; border-radius: 999px; border: 1px solid rgb(63 123 255 / 0.5); background: var(--blue-soft); color: var(--blue-ink); font-size: 10.5px; }
@media (max-width: 1100px) { .va-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .va-row { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 760px) {
  .va-kpis { gap: 8px; }
  .va-kpi { padding: 12px 14px; }
  .va-heat { grid-template-columns: 64px repeat(12, minmax(0, 1fr)); gap: 2px; }
  .va-heat .c { height: 22px; font-size: 0; }
  .va-heat .rh .sw + span { font-size: 9px; }
}
`;

export default {
  name: 'Ledger dashboard',
  idea: 'Everything on one screen for the chosen month, quarter or half: the four numbers Jack asked for on top, the year of months below, then where the money comes from and which service peaks when.',
  init: () => ({ kind: 'month', off: 0 }),
  render(u) {
    style('rev-a', css);
    const p = periodRange(u.kind, u.off);
    const t = totals(p.from, p.to);
    const months = monthly(15, 2);
    const cur = months.findIndex((m) => m.current);
    const sea = seasonality();
    const maxCell = Math.max(...sea.rows.flatMap((r) => r.months)) || 1;
    const next = [TODAY.getMonth(), (TODAY.getMonth() + 1) % 12, (TODAY.getMonth() + 2) % 12];
    const best = next.map((m) => {
      const r = [...sea.rows].sort((a, b) => b.months[m] - a.months[m])[0];
      return { m, svc: r.service };
    });
    const mName = (m) => new Date(2026, m, 1).toLocaleString('en-GB', { month: 'short' });
    const totalPaid = SERVICE_ORDER.reduce((s, k) => s + t.byService[k].paid, 0) || 1;

    return `<div class="page">
      <header class="head">
        <h1>Revenue</h1>
        <div class="grow"></div>
        <div class="seg">${['month', 'quarter', 'half'].map((k) => `<button class="${u.kind === k ? 'on' : ''}" data-ui="kind:${k};off:0">${{ month: 'Month', quarter: 'Quarter', half: 'Half-year' }[k]}</button>`).join('')}</div>
        <div class="row">
          <button class="btn btn-icon btn-ghost" data-ui="off:-=1" aria-label="Previous">${icon('left')}</button>
          <span class="hi" style="min-width:140px;text-align:center">${p.label}</span>
          <button class="btn btn-icon btn-ghost" data-ui="off:+=1" aria-label="Next">${icon('right')}</button>
        </div>
      </header>

      <div class="va-kpis">
        <div class="panel va-kpi"><span class="label">Bookings</span><span class="big">${t.active}</span><div class="foot"><span>${t.cancelled} unlocked</span><span>${t.declined} declined</span></div></div>
        <div class="panel va-kpi"><span class="label">Net potential</span><span class="big"><span class="cur">AED</span>${aed(t.potential)}</span><div class="foot"><span>${t.pendingQuotes ? `${t.pendingQuotes} quote${t.pendingQuotes > 1 ? 's' : ''} pending` : 'All priced'}</span></div></div>
        <div class="panel va-kpi"><span class="label">Confirmed</span><span class="big blue-t"><span class="cur">AED</span>${aed(t.confirmed)}</span>${split(t.confirmed, t.unconfirmed)}<div class="foot"><span>Confirmed</span><span>${aed(t.unconfirmed)} tentative</span></div></div>
        <div class="panel va-kpi"><span class="label">Paid</span><span class="big gold-t"><span class="cur">AED</span>${aed(t.paid)}</span>${split(t.paid, t.unpaid, { ca: 'var(--chrome-gold)', cb: 'var(--blue-2)' })}<div class="foot"><span>Cash in</span><span>${aed(t.unpaid)} unpaid${t.due ? `, ${aed(t.due)} overdue` : ''}</span></div></div>
      </div>

      <div class="va-row">
        <section class="panel pad">
          <div class="row between wrap" style="margin-bottom:16px"><span class="label">Paid by month</span>${svcKey()}</div>
          ${monthBars(months, { onClick: (m, i) => `kind:month;off:${i - cur}`, sel: u.kind === 'month' ? u.off + cur : null })}
        </section>
        <section class="panel pad">
          <span class="label">By service · ${p.label}</span>
          <table class="va-tbl" style="margin-top:14px">
            <thead><tr><th>Service</th><th>Bookings</th><th>Paid</th><th>Share</th></tr></thead>
            <tbody>${SERVICE_ORDER.map((s) => `<tr><td><span class="sw sw-${s}"></span>${SERVICES[s].name}</td><td>${t.byService[s].count}</td><td class="hi">${aed(t.byService[s].paid)}</td><td class="dim">${Math.round((t.byService[s].paid / totalPaid) * 100)}%</td></tr>`).join('')}</tbody>
          </table>
        </section>
      </div>

      <section class="panel pad">
        <div class="row between wrap" style="margin-bottom:14px"><span class="label">What sells when · paid, ${fmt.mon(sea.from)} ${sea.from.getFullYear()} to ${fmt.mon(new Date(sea.to - 1))} ${new Date(sea.to - 1).getFullYear()}</span></div>
        <div class="va-heat">
          <span></span>${[...Array(12)].map((_, m) => `<span class="mh ${next.includes(m) ? 'next' : ''}">${mName(m)}</span>`).join('')}
          ${sea.rows.map((r) => `<span class="rh"><span class="sw sw-${r.service}"></span><span class="trunc">${SERVICES[r.service].short}</span></span>${r.months.map((v) => {
            const a = v / maxCell;
            return `<span class="c" title="${aed(v)}" style="background:${v ? `color-mix(in srgb, ${SVC_SOLID[r.service]} ${Math.round(15 + a * 85)}%, var(--panel))` : 'var(--stage-2)'};color:${a > 0.55 ? 'var(--ink)' : 'var(--type)'}">${v ? aed(v, { short: true }) : ''}</span>`;
          }).join('')}`).join('')}
        </div>
        <div class="va-push">${best.map((b) => `<span>${mName(b.m)}: push ${SERVICES[b.svc].name.toLowerCase()}</span>`).join('')}</div>
      </section>
    </div>`;
  },
};
