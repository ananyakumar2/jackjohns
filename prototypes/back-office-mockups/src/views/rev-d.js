import { store, totals, periodRange, state, value, SERVICES, SERVICE_ORDER, TODAY, STATE_LABEL } from '../store.js';
import { esc, icon, aed, fmt, who, chip, addDays } from '../ui.js';
import { style } from './common.js';

const css = `
.vd { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 20px; align-items: start; }
.vd-index { position: sticky; top: 0; display: grid; gap: 18px; }
.vd-index ul { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 2px; }
.vd-index button { width: 100%; display: flex; justify-content: space-between; gap: 8px; text-align: left; padding: 8px 10px; border: 0; border-radius: 8px; background: transparent; color: var(--dim); font-size: 12px; }
.vd-index button:hover { color: var(--type-hi); background: var(--silver-soft); }
.vd-index button.on { background: var(--panel-2); color: var(--type-hi); }
.vd-index button .faint { font-size: 10.5px; }
.vd-sheet { padding: 30px 34px; max-width: 980px; }
.vd-title { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; padding-bottom: 18px; border-bottom: 2px solid transparent; border-image: var(--chrome-silver) 1; }
.vd-title h2 { margin: 0; font-size: 24px; font-weight: 600; color: var(--type-hi); letter-spacing: 0.02em; }
.vd-sum { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 22px 0 28px; }
.vd-sum > div { padding: 0 18px; border-left: 1px solid var(--line); display: grid; gap: 6px; }
.vd-sum > div:first-child { padding-left: 0; border-left: 0; }
.vd-sum .sub { font-size: 11px; color: var(--dim); }
.vd-h { margin: 28px 0 10px; display: flex; justify-content: space-between; align-items: baseline; }
.vd-t { width: 100%; border-collapse: collapse; font-size: 12px; }
.vd-t th { text-align: right; font-weight: 600; font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--faint); padding: 0 8px 8px; border-bottom: 1px solid var(--line-2); }
.vd-t td { text-align: right; padding: 9px 8px; border-bottom: 1px solid var(--line); }
.vd-t th:first-child, .vd-t td:first-child { text-align: left; padding-left: 0; }
.vd-t td.l, .vd-t th.l { text-align: left; }
.vd-t tr.out td { color: var(--faint); }
.vd-t tr.out td.amt { text-decoration: line-through; }
.vd-who { display: block; max-width: 220px; }
.vd-bar { display: inline-block; height: 6px; border-radius: 3px; background: var(--chrome-gold); vertical-align: middle; margin-right: 8px; }
.vd-up { color: var(--blue-ink); font-size: 10.5px; }
.vd-down { color: var(--silver); font-size: 10.5px; }
.vd-note { margin: 22px 0 0; padding: 14px 16px; border-radius: 10px; background: var(--blue-soft); border: 1px solid rgb(63 123 255 / 0.35); color: var(--type-hi); font-size: 12px; line-height: 1.6; }
.vd-phone-pick { display: flex; gap: 8px; margin-bottom: 12px; }
.vd-phone-pick select { flex: 1; height: 36px; border-radius: 999px; border: 1px solid var(--line-2); background: var(--panel); padding: 0 14px; }
@media (max-width: 1100px) { .vd { grid-template-columns: 200px minmax(0, 1fr); } .vd-sheet { padding: 22px; } }
@media (max-width: 760px) {
  .vd { grid-template-columns: minmax(0, 1fr); }
  .vd-index { display: none; }
  .vd-sheet { padding: 18px 16px; }
  .vd-title h2 { font-size: 19px; }
  .vd-sum { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 0; }
  .vd-sum > div:nth-child(3) { padding-left: 0; border-left: 0; }
  .vd-t .hp { display: none; }
  .vd-who { max-width: 104px; }
  .vd-t td, .vd-t th { padding-left: 4px; padding-right: 4px; }
}
`;

const KINDS = { month: 'Monthly', quarter: 'Quarterly', half: 'Half-yearly' };
const COUNT = { month: 12, quarter: 5, half: 3 };

function breakdown(p, kind) {
  // Months inside a quarter or half; weeks inside a month.
  const rows = [];
  if (kind === 'month') {
    let s = new Date(p.from);
    while (s < p.to) {
      const e = new Date(Math.min(addDays(s, 7 - ((s.getDay() + 6) % 7)), p.to));
      rows.push({ label: `${fmt.dm(s)}–${fmt.dm(addDays(e, -1))}`, t: totals(s, e) });
      s = e;
    }
  } else {
    for (let s = new Date(p.from); s < p.to; s = new Date(s.getFullYear(), s.getMonth() + 1, 1)) {
      const e = new Date(s.getFullYear(), s.getMonth() + 1, 1);
      rows.push({ label: fmt.month(s), t: totals(s, e) });
    }
  }
  return rows;
}

function csv(p) {
  const rows = [['Date', 'Client', 'Organisation', 'Service', 'Detail', 'Amount AED', 'Status', 'Paid on']];
  for (const b of store.items) {
    if (b.start < p.from || b.start >= p.to) continue;
    rows.push([fmt.date(b.start), b.client, b.org || '', SERVICES[b.service].name, b.title || (b.service === 'sim' ? `${b.hours} h` : b.venue), b.price ?? '', STATE_LABEL[state(b)], b.paidAt ? fmt.date(b.paidAt) : '']);
  }
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}

function delta(a, b) {
  if (!b) return '';
  const d = Math.round(((a - b) / b) * 100);
  return `<span class="${d >= 0 ? 'vd-up' : 'vd-down'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(d)}%</span>`;
}

export default {
  name: 'Report sheets',
  idea: 'Reports as documents, laid out like a results sheet: pick a month, quarter or half-year from the index and read it top to bottom, from the four totals to every line in the ledger. Exports to a spreadsheet.',
  init: () => ({ kind: 'month', off: -1, all: false }),
  render(u) {
    style('rev-d', css);
    const p = periodRange(u.kind, u.off);
    const prev = periodRange(u.kind, u.off - 1);
    const t = totals(p.from, p.to);
    const tp = totals(prev.from, prev.to);
    const lines = store.items.filter((b) => b.start >= p.from && b.start < p.to);
    const shown = u.all ? lines : lines.slice(0, 14);
    const svcs = [...SERVICE_ORDER].sort((a, b) => t.byService[b].paid - t.byService[a].paid);
    const maxSvc = Math.max(...SERVICE_ORDER.map((s) => t.byService[s].paid)) || 1;
    const top = svcs[0];
    const open = p.to > TODAY;
    const index = Object.keys(KINDS).map((k) => `<div><span class="label">${KINDS[k]}</span><ul>${[...Array(COUNT[k])].map((_, i) => {
      const o = -i + (k === 'month' ? 1 : 0);
      const pr = periodRange(k, o);
      const tt = totals(pr.from, pr.to);
      return `<li><button class="${u.kind === k && u.off === o ? 'on' : ''}" data-ui="kind:${k};off:${o};all:false"><span>${pr.label}</span><span class="faint">${aed(tt.paid, { short: true })}</span></button></li>`;
    }).join('')}</ul></div>`).join('');
    const options = Object.keys(KINDS).flatMap((k) => [...Array(COUNT[k])].map((_, i) => {
      const o = -i + (k === 'month' ? 1 : 0);
      return { k, o, label: periodRange(k, o).label };
    }));

    return `<div class="page">
      <header class="head"><h1>Revenue</h1><div class="grow"></div>
        <a class="btn btn-ghost" download="jack-johns-${p.label.toLowerCase().replace(/\s+/g, '-')}.csv" href="data:text/csv;charset=utf-8,${encodeURIComponent(csv(p))}">${icon('quote')}<span>Export</span></a>
      </header>
      <div class="vd">
        <nav class="vd-index">${index}</nav>
        <div>
          <div class="vd-phone-pick only-phone">
            <select aria-label="Report" onchange="this.nextElementSibling.dataset.ui=this.value;this.nextElementSibling.click()">${options.map((x) => `<option value="kind:${x.k};off:${x.o};all:false" ${u.kind === x.k && u.off === x.o ? 'selected' : ''}>${KINDS[x.k]} · ${x.label}</option>`).join('')}</select><span hidden></span>
          </div>
          <article class="panel vd-sheet">
            <div class="vd-title">
              <div><span class="label">${KINDS[u.kind]} report</span><h2>${p.label}</h2></div>
              <span class="small dim">${open ? 'In progress · ' : ''}${fmt.dm(p.from)} – ${fmt.date(addDays(p.to, -1))}</span>
            </div>

            <div class="vd-sum">
              <div><span class="label">Bookings</span><span class="big">${t.active}</span><span class="sub">${t.cancelled} unlocked, ${t.declined} declined ${delta(t.active, tp.active)}</span></div>
              <div><span class="label">Net potential</span><span class="big"><span class="cur">AED</span>${aed(t.potential)}</span><span class="sub">${delta(t.potential, tp.potential)} vs ${prev.label}</span></div>
              <div><span class="label">Confirmed</span><span class="big blue-t"><span class="cur">AED</span>${aed(t.confirmed)}</span><span class="sub">${aed(t.unconfirmed)} unconfirmed</span></div>
              <div><span class="label">Paid</span><span class="big gold-t"><span class="cur">AED</span>${aed(t.paid)}</span><span class="sub">${aed(t.unpaid)} unpaid${t.due ? `, ${aed(t.due)} overdue` : ''}</span></div>
            </div>

            <div class="vd-h"><span class="label">By service</span></div>
            <table class="vd-t">
              <thead><tr><th>Service</th><th>Bookings</th><th class="hp">Potential</th><th class="l">Paid</th><th class="hp">vs ${prev.short}</th></tr></thead>
              <tbody>${svcs.map((s) => `<tr><td><span class="row" style="gap:8px"><span class="sw sw-${s}"></span>${SERVICES[s].name}</span></td><td>${t.byService[s].count}</td><td class="hp dim">${aed(t.byService[s].potential)}</td><td class="l hi"><span class="vd-bar" style="width:${(t.byService[s].paid / maxSvc) * 90}px"></span>${aed(t.byService[s].paid)}</td><td class="hp">${delta(t.byService[s].paid, tp.byService[s].paid)}</td></tr>`).join('')}</tbody>
            </table>

            <div class="vd-h"><span class="label">${u.kind === 'month' ? 'Week by week' : 'Month by month'}</span></div>
            <table class="vd-t">
              <thead><tr><th>${u.kind === 'month' ? 'Week' : 'Month'}</th><th>Bookings</th><th class="hp">Potential</th><th>Confirmed</th><th>Paid</th></tr></thead>
              <tbody>${breakdown(p, u.kind).map((r) => `<tr><td>${r.label}</td><td>${r.t.active}</td><td class="hp dim">${aed(r.t.potential)}</td><td class="blue-t">${aed(r.t.confirmed)}</td><td class="gold-t">${aed(r.t.paid)}</td></tr>`).join('')}</tbody>
            </table>

            ${t.paid ? `<p class="vd-note">${SERVICES[top].name} led ${p.label} with AED ${aed(t.byService[top].paid)} paid${tp.byService[top].paid ? `, against AED ${aed(tp.byService[top].paid)} in ${prev.label}` : ''}.</p>` : ''}

            <div class="vd-h"><span class="label">Ledger · ${lines.length} lines</span></div>
            <table class="vd-t">
              <thead><tr><th>Date</th><th class="l">Client</th><th class="l hp">Service</th><th>AED</th><th class="l">Status</th></tr></thead>
              <tbody>${shown.map((b) => { const s = state(b); return `<tr class="${s === 'unlocked' || s === 'declined' ? 'out' : ''}"><td>${fmt.dm(b.start)}</td><td class="l"><span class="trunc vd-who">${esc(who(b))}</span></td><td class="l hp dim">${SERVICES[b.service].name}</td><td class="amt">${b.price == null ? '—' : aed(b.price)}</td><td class="l">${chip(b)}</td></tr>`; }).join('')}</tbody>
            </table>
            ${lines.length > shown.length ? `<div style="margin-top:12px"><button class="btn btn-ghost btn-sm" data-ui="all:true">All ${lines.length} lines</button></div>` : ''}
          </article>
        </div>
      </div>
    </div>`;
  },
};
