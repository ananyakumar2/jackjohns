import { store, totals, periodRange, state, value, end, seasonality, SERVICES, SERVICE_ORDER, TODAY } from '../store.js';
import { esc, icon, aed, money, fmt, who, what, when, chip } from '../ui.js';
import { style } from './common.js';

const css = `
.vb-periods { display: flex; gap: 6px; flex-wrap: wrap; }
.vb-periods button { height: 30px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--line); background: transparent; color: var(--dim); font-size: 10.5px; letter-spacing: 0.06em; }
.vb-periods button.on { border-color: var(--blue); color: var(--type-hi); background: var(--blue-soft); }
.vb { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 14px; align-items: start; }
.vb-flow { padding: 22px 22px 18px; }
.vb-flow svg { display: block; width: 100%; height: auto; }
.vb-flow text { font-family: var(--font); font-weight: 600; paint-order: stroke; stroke: #1a2130; stroke-width: 5px; stroke-linejoin: round; }
.vb-svc { display: grid; gap: 14px; margin-top: 8px; }
.vb-svc-row { display: grid; grid-template-columns: 130px minmax(0, 1fr) 110px 150px; gap: 14px; align-items: center; font-size: 12px; }
.vb-peak { font-size: 10.5px; color: var(--blue-ink); }
.vb-track { position: relative; height: 12px; border-radius: 6px; background: var(--panel-3); overflow: hidden; display: flex; }
.vb-collect { display: grid; gap: 8px; }
.vb-c { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; align-items: center; padding: 12px 14px; border-radius: 10px; background: var(--stage-2); border: 1px solid var(--line); }
.vb-c.due { border-color: rgb(226 191 106 / 0.45); }
@media (max-width: 1100px) { .vb { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 760px) {
  .vb-flow { padding: 14px 10px; }
  .vb-svc-row { grid-template-columns: 74px minmax(0, 1fr) 70px; gap: 8px; font-size: 11px; }
  .vb-peak { grid-column: 2 / -1; margin-top: -4px; }
}
`;

function flow(t, lost) {
  const W = 1000;
  const H = 300;
  const colW = 16;
  const gap = 10;
  const req = t.potential + lost;
  if (!req) return '<div class="empty">No bookings in this period</div>';
  const scale = (H - gap * 2) / req;
  const X = [150, 520, 860];
  const seg = (v) => Math.max(v ? 3 : 0, v * scale);

  const a = { y: 0, h: seg(req) };
  const c = { y: 0, h: seg(t.confirmed) };
  const te = { y: c.h + (t.confirmed ? gap : 0), h: seg(t.unconfirmed) };
  const lo = { y: te.y + te.h + (t.unconfirmed ? gap : 0), h: seg(lost) };
  const pa = { y: 0, h: seg(t.paid) };
  const un = { y: pa.h + (t.paid ? gap : 0), h: seg(t.unpaid) };

  const ribbon = (x1, y1, x2, y2, h, fill, op = 0.35) => {
    if (h <= 0) return '';
    const m = (x1 + x2) / 2;
    return `<path d="M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2} L${x2},${y2 + h} C${m},${y2 + h} ${m},${y1 + h} ${x1},${y1 + h} Z" fill="${fill}" opacity="${op}"/>`;
  };
  const bar = (x, s, fill, extra = '') => (s.h > 0 ? `<rect x="${x}" y="${s.y}" width="${colW}" height="${s.h}" rx="3" fill="${fill}" ${extra}/>` : '');
  const lbl = (x, s, name, v, anchor = 'start', color = '#c6ced9') => (s.h > 0 ? `<text x="${x}" y="${s.y + Math.min(s.h / 2, 40) - 4}" font-size="11" fill="#8b95a5" letter-spacing="1.2" text-anchor="${anchor}">${name.toUpperCase()}</text><text x="${x}" y="${s.y + Math.min(s.h / 2, 40) + 15}" font-size="17" fill="${color}" text-anchor="${anchor}">${aed(v)}</text>` : '');

  let ay = 0;
  const r1 = [[c, '#3f7bff', t.confirmed], [te, '#b7c0cd', t.unconfirmed], [lo, '#566173', lost]].map(([s, f, v]) => {
    const h = seg(v);
    const out = ribbon(X[0] + colW, ay, X[1], s.y, h, f, f === '#566173' ? 0.25 : 0.32);
    ay += h;
    return out;
  }).join('');
  const r2 = ribbon(X[1] + colW, c.y, X[2], pa.y, pa.h, '#e2bf6a', 0.38) + ribbon(X[1] + colW, c.y + pa.h, X[2], un.y, un.h, '#3f7bff', 0.28);

  return `<svg viewBox="-4 -4 ${W + 8} ${H + 8}" role="img" aria-label="Revenue flow">
    <defs><linearGradient id="vb-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbedbf"/><stop offset=".45" stop-color="#cfa24a"/><stop offset=".6" stop-color="#f6dc93"/><stop offset="1" stop-color="#a87c2c"/></linearGradient>
    <pattern id="vb-h" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#283245"/><rect width="3" height="6" fill="#b7c0cd" opacity=".45"/></pattern></defs>
    ${r1}${r2}
    ${bar(X[0], a, '#c6ced9')}
    ${bar(X[1], c, '#3f7bff')}${bar(X[1], te, 'url(#vb-h)', 'stroke="#b7c0cd" stroke-dasharray="3 2"')}${bar(X[1], lo, '#566173')}
    ${bar(X[2], pa, 'url(#vb-g)')}${bar(X[2], un, '#2f66e0', t.due ? 'stroke="#e2bf6a" stroke-dasharray="3 2" stroke-width="1.5"' : '')}
    ${lbl(X[0] - 14, a, 'Requested', req, 'end', '#e6ebf3')}
    ${lbl(X[1] + colW + 14, c, 'Confirmed', t.confirmed, 'start', '#a9c3ff')}
    ${lbl(X[1] + colW + 14, te, 'Tentative', t.unconfirmed)}
    ${lbl(X[1] + colW + 14, lo, 'Lost', lost, 'start', '#8b95a5')}
    ${lbl(X[2] + colW + 14, pa, 'Paid', t.paid, 'start', '#e2bf6a')}
    ${lbl(X[2] + colW + 14, un, 'Unpaid', t.unpaid, 'start', '#a9c3ff')}
  </svg>`;
}

export default {
  name: 'Money flow',
  idea: 'The period as a flow: what was requested splits into confirmed, tentative and lost, and confirmed splits into paid and unpaid. Beside it, the cash still to collect, with Paid one tap away.',
  init: () => ({ kind: 'quarter', off: 0 }),
  render(u) {
    style('rev-b', css);
    const p = periodRange(u.kind, u.off);
    const t = totals(p.from, p.to);
    const lost = store.items.filter((b) => b.start >= p.from && b.start < p.to && (b.status === 'unlocked' || b.status === 'declined')).reduce((s, b) => s + value(b), 0);
    const periods = [-4, -3, -2, -1, 0, 1].map((o) => ({ o, ...periodRange(u.kind, o) }));
    const collect = store.items.filter((b) => (state(b) === 'due' || state(b) === 'confirmed') && b.start < new Date(TODAY.getTime() + 14 * 864e5)).sort((a, b) => a.start - b.start);
    const dueSum = collect.filter((b) => state(b) === 'due').reduce((s, b) => s + value(b), 0);
    const maxSvc = Math.max(...SERVICE_ORDER.map((s) => t.byService[s].potential)) || 1;
    const sea = seasonality();
    const peaks = (s) => { const m = sea.rows.find((r) => r.service === s).months; return m.map((v, i) => [v, i]).filter(([v]) => v).sort((a, b) => b[0] - a[0]).slice(0, 3).sort((a, b) => a[1] - b[1]).map(([, i]) => new Date(2026, i, 1).toLocaleString('en-GB', { month: 'short' })).join(' · ') || '—'; };

    return `<div class="page">
      <header class="head">
        <h1>Revenue</h1>
        <div class="grow"></div>
        <div class="seg">${['month', 'quarter', 'half'].map((k) => `<button class="${u.kind === k ? 'on' : ''}" data-ui="kind:${k};off:0">${{ month: 'Month', quarter: 'Quarter', half: 'Half-year' }[k]}</button>`).join('')}</div>
      </header>
      <div class="vb-periods" style="margin-bottom:14px">${periods.map((x) => `<button class="${x.o === u.off ? 'on' : ''}" data-ui="off:${x.o}">${x.label}</button>`).join('')}</div>

      <div class="vb">
        <div style="display:grid;gap:14px">
          <section class="panel vb-flow">
            <div class="row between wrap" style="margin-bottom:18px">
              <span class="label">${p.label} · ${t.active} bookings · net potential AED ${aed(t.potential)}</span>
              <span class="small dim">${t.cancelled} unlocked · ${t.declined} declined${t.pendingQuotes ? ` · ${t.pendingQuotes} awaiting quote` : ''}</span>
            </div>
            ${flow(t, lost)}
          </section>
          <section class="panel pad">
            <div class="row between wrap"><span class="label">By service</span><div class="key"><span><i class="paid"></i>Paid</span><span><i class="confirmed"></i>Unpaid</span><span><i class="tentative"></i>Tentative</span></div></div>
            <div class="vb-svc" style="margin-top:16px">${SERVICE_ORDER.map((s) => {
              const sv = t.byService[s];
              const items = store.items.filter((b) => b.service === s && b.start >= p.from && b.start < p.to);
              const conf = items.filter((b) => ['confirmed', 'due'].includes(state(b))).reduce((x, b) => x + value(b), 0);
              const tent = sv.potential - sv.paid - conf;
              const w = (v) => `${(v / maxSvc) * 100}%`;
              return `<div class="vb-svc-row"><span class="row" style="gap:8px"><span class="sw sw-${s}"></span><span class="trunc">${SERVICES[s].name}</span></span>
                <div class="vb-track"><span style="width:${w(sv.paid)};background:var(--chrome-gold)"></span><span style="width:${w(conf)};background:var(--blue-2)"></span><span style="width:${w(tent)};background:var(--hatch)"></span></div>
                <span style="text-align:right"><span class="hi">${aed(sv.paid)}</span><span class="dim tiny"> / ${aed(sv.potential, { short: true })}</span></span><span class="vb-peak" title="Best months over the last year">Peaks ${peaks(s)}</span></div>`;
            }).join('')}</div>
          </section>
        </div>

        <section class="panel pad">
          <div class="row between"><span class="label">To collect</span><span class="gold-t">AED ${aed(dueSum)} overdue</span></div>
          <div class="vb-collect" style="margin-top:14px">
            ${collect.map((b) => `<div class="vb-c ${state(b) === 'due' ? 'due' : ''}">
              <div style="min-width:0"><div class="hi trunc">${esc(who(b))}</div><div class="dim small trunc">${when(b)}</div></div>
              <div class="hi" style="text-align:right">${aed(value(b))}</div>
              <div>${chip(b)}</div>
              <button class="btn btn-gold btn-sm" data-act="paid:${b.id}">${icon('cash')}<span>Paid</span></button>
            </div>`).join('') || '<div class="empty">All settled</div>'}
          </div>
        </section>
      </div>
    </div>`;
  },
};
