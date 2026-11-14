import { totals, periodRange, seasonality, SERVICES, TODAY } from '../store.js';
import { aed } from '../ui.js';
import { style } from './common.js';
import { SVC_SOLID, split } from './charts.js';

const css = `
.vc { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 14px; align-items: stretch; }
.vc-clock { display: grid; place-items: center; padding: 18px; }
.vc-clock svg { width: 100%; max-width: 560px; height: auto; }
.vc-clock text { font-family: var(--font); font-weight: 600; }
.vc-clock .seg-hit { cursor: pointer; }
.vc-side { display: grid; gap: 14px; align-content: start; }
.vc-push { display: grid; gap: 10px; }
.vc-p { display: grid; grid-template-columns: 54px minmax(0, 1fr) auto; gap: 14px; align-items: center; padding: 14px; border-radius: 10px; background: var(--stage-2); border: 1px solid var(--line); }
.vc-p.now { border-color: rgb(63 123 255 / 0.5); }
.vc-m { font-size: 16px; color: var(--type-hi); }
.vc-strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
.vc-strip > div { padding: 14px 16px; display: grid; gap: 6px; }
.vc-laps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-top: 14px; }
.vc-lap { padding: 16px 18px; display: grid; gap: 10px; }
.vc-delta { font-size: 11px; display: inline-flex; align-items: center; gap: 4px; }
.vc-delta.up { color: var(--blue-ink); }
.vc-delta.down { color: var(--silver); }
.vc-sel { padding: 14px 16px; }
@media (max-width: 1100px) { .vc { grid-template-columns: minmax(0, 1fr); } .vc-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 760px) {
  .vc-laps { grid-template-columns: minmax(0, 1fr); }
  .vc-strip { gap: 8px; }
  .vc-clock { padding: 6px; }
}
`;

const MONTHS = [...Array(12)].map((_, m) => new Date(2026, m, 1).toLocaleString('en-GB', { month: 'short' }));

function sector(cx, cy, r0, r1, a0, a1) {
  const p = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x0, y0] = p(r1, a0);
  const [x1, y1] = p(r1, a1);
  const [x2, y2] = p(r0, a1);
  const [x3, y3] = p(r0, a0);
  return `M${x0},${y0} A${r1},${r1} 0 0 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 0 0 ${x3},${y3} Z`;
}

function clock(sea, selM) {
  const C = 260;
  const ringW = 30;
  const r0 = 92;
  const step = (Math.PI * 2) / 12;
  // Each ring is scaled to its own best month, so it shows that service's season.
  const rings = sea.rows.map((row, i) => {
    const max = Math.max(...row.months) || 1;
    const a = r0 + i * (ringW + 4);
    return row.months.map((v, m) => {
      const a0 = -Math.PI / 2 + m * step + 0.012;
      const a1 = a0 + step - 0.024;
      const k = v / max;
      const fill = v ? `color-mix(in srgb, ${SVC_SOLID[row.service]} ${Math.round(12 + k * 88)}%, #1a2130)` : '#171d28';
      return `<path d="${sector(C, C, a, a + ringW, a0, a1)}" style="fill:${fill}"><title>${SERVICES[row.service].name}, ${MONTHS[m]}: AED ${aed(v)}</title></path>`;
    }).join('');
  }).join('');
  const outer = r0 + 4 * (ringW + 4);
  const sa0 = -Math.PI / 2 + selM * step;
  const selRing = `<path d="${sector(C, C, r0 - 3, outer - 1, sa0, sa0 + step)}" fill="none" stroke="#e6ebf3" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  const labels = MONTHS.map((n, m) => {
    const a = -Math.PI / 2 + (m + 0.5) * step;
    const x = C + (outer + 20) * Math.cos(a);
    const y = C + (outer + 20) * Math.sin(a) + 4;
    return `<text x="${x}" y="${y}" text-anchor="middle" font-size="12" fill="${m === TODAY.getMonth() ? '#a9c3ff' : '#8b95a5'}">${n}</text>`;
  }).join('');
  const hits = MONTHS.map((_, m) => {
    const a0 = -Math.PI / 2 + m * step;
    return `<path class="seg-hit" d="${sector(C, C, r0, outer, a0, a0 + step)}" fill="transparent" data-ui="m:${m}"><title>${MONTHS[m]}</title></path>`;
  }).join('');
  const dayFrac = (TODAY.getMonth() + (TODAY.getDate() - 1) / 30) / 12;
  const ha = -Math.PI / 2 + dayFrac * Math.PI * 2;
  const hand = `<line x1="${C + 30 * Math.cos(ha)}" y1="${C + 30 * Math.sin(ha)}" x2="${C + (outer + 6) * Math.cos(ha)}" y2="${C + (outer + 6) * Math.sin(ha)}" stroke="url(#vc-chrome)" stroke-width="3" stroke-linecap="round"/>`;
  return `<svg viewBox="0 0 ${C * 2} ${C * 2}" role="img" aria-label="Paid revenue by service and month">
    <defs><linearGradient id="vc-chrome" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3f6fa"/><stop offset=".5" stop-color="#8e99a9"/><stop offset="1" stop-color="#e3e8ef"/></linearGradient>
    <radialGradient id="vc-hub"><stop offset="0" stop-color="#eef2f7"/><stop offset=".7" stop-color="#9aa5b4"/><stop offset="1" stop-color="#6c7788"/></radialGradient></defs>
    ${rings}${selRing}${hits}${labels}${hand}
    <circle cx="${C}" cy="${C}" r="26" fill="url(#vc-hub)"/>
    <text x="${C}" y="${C + 4}" text-anchor="middle" font-size="11" fill="#0c1a33">${MONTHS[TODAY.getMonth()]}</text>
  </svg>`;
}

function lap(kind) {
  const now = periodRange(kind, 0);
  const prev = periodRange(kind, kind === 'month' ? -12 : kind === 'quarter' ? -4 : -2);
  const a = totals(now.from, now.to);
  const b = totals(prev.from, prev.to);
  const d = b.potential ? Math.round(((a.potential - b.potential) / b.potential) * 100) : 0;
  return `<div class="panel vc-lap">
    <div class="row between"><span class="label">${{ month: 'Month', quarter: 'Quarter', half: 'Half-year' }[kind]}</span><span class="dim small">${now.label} vs ${prev.label}</span></div>
    <div class="row between" style="align-items:flex-end"><span class="big"><span class="cur">AED</span>${aed(a.potential)}</span><span class="vc-delta ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(d)}%</span></div>
    ${split(a.paid, a.potential - a.paid, { ca: 'var(--chrome-gold)', cb: 'var(--blue-2)', h: 8 })}
    <div class="row between small dim"><span>${aed(a.paid)} paid</span><span>last year ${aed(b.potential)}</span></div>
  </div>`;
}

export default {
  name: 'Season clock',
  idea: 'The year as a dial: one ring per service, each month glowing by how well that service sold, a chrome hand at today. What to push next reads straight off the dial; the month, quarter and half-year reports sit below as this year against last.',
  init: () => ({ m: TODAY.getMonth() }),
  render(u) {
    style('rev-c', css);
    const sea = seasonality();
    const next = [0, 1, 2].map((i) => (TODAY.getMonth() + i) % 12);
    const ranked = (m) => [...sea.rows].sort((a, b) => b.months[m] - a.months[m]);
    const cur = periodRange('month', 0);
    const t = totals(cur.from, cur.to);
    const selRows = ranked(u.m);
    const selTotal = selRows.reduce((s, r) => s + r.months[u.m], 0);

    return `<div class="page">
      <header class="head"><h1>Revenue</h1><div class="grow"></div><span class="dim small">${cur.label}</span></header>
      <div class="vc-strip">
        <div class="panel"><span class="label">Bookings</span><span class="big">${t.active}</span></div>
        <div class="panel"><span class="label">Net potential</span><span class="big"><span class="cur">AED</span>${aed(t.potential)}</span></div>
        <div class="panel"><span class="label">Confirmed / tentative</span><span class="big"><span class="blue-t">${aed(t.confirmed, { short: true })}</span><span class="dim"> / ${aed(t.unconfirmed, { short: true })}</span></span></div>
        <div class="panel"><span class="label">Paid / unpaid</span><span class="big"><span class="gold-t">${aed(t.paid, { short: true })}</span><span class="dim"> / ${aed(t.unpaid, { short: true })}</span></span></div>
      </div>
      <div class="vc">
        <section class="panel vc-clock">${clock(sea, u.m)}</section>
        <div class="vc-side">
          <section class="panel pad">
            <span class="label">Push next</span>
            <div class="vc-push" style="margin-top:14px">${next.map((m, i) => {
              const r = ranked(m);
              const top = r[0];
              return `<div class="vc-p ${i === 0 ? 'now' : ''}"><span class="vc-m">${MONTHS[m]}</span>
                <div style="min-width:0"><div class="row" style="gap:8px"><span class="sw sw-${top.service}"></span><span class="hi">${SERVICES[top.service].name}</span></div><div class="dim small">then ${SERVICES[r[1].service].name.toLowerCase()}</div></div>
                <span class="small dim" style="text-align:right">last year<br><span class="hi">AED ${aed(top.months[m])}</span></span></div>`;
            }).join('')}</div>
          </section>
          <section class="panel vc-sel">
            <div class="row between"><span class="label">${MONTHS[u.m]}, last 12 months</span><span class="hi">AED ${aed(selTotal)}</span></div>
            <div style="display:grid;gap:8px;margin-top:12px">${selRows.map((r) => `<div class="row between small"><span class="row" style="gap:8px"><span class="sw sw-${r.service}"></span>${SERVICES[r.service].name}</span><span class="${r.months[u.m] ? 'hi' : 'faint'}">${aed(r.months[u.m])}</span></div>`).join('')}</div>
          </section>
        </div>
      </div>
      <div class="vc-laps">${lap('month')}${lap('quarter')}${lap('half')}</div>
    </div>`;
  },
};
