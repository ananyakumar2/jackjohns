import { SERVICE_ORDER } from '../store.js';
import { aed } from '../ui.js';

// Services are told apart by tone within the palette, never a new hue.
export const SVC_FILL = { sim: '#3f7bff', track: 'url(#chrome-s)', commentary: '#8fb2ff', racing: 'url(#chrome-g)' };
export const SVC_SOLID = { sim: '#3f7bff', track: '#b7c0cd', commentary: '#8fb2ff', racing: '#e2bf6a' };

export const defs = `<defs>
  <linearGradient id="chrome-s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eef2f7"/><stop offset=".45" stop-color="#9aa5b4"/><stop offset=".6" stop-color="#dfe5ec"/><stop offset="1" stop-color="#7e8a9b"/></linearGradient>
  <linearGradient id="chrome-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbedbf"/><stop offset=".45" stop-color="#cfa24a"/><stop offset=".6" stop-color="#f6dc93"/><stop offset="1" stop-color="#a87c2c"/></linearGradient>
</defs>`;

// Monthly bars: stacked paid revenue by service, with the outstanding
// (confirmed but unpaid, plus tentative) drawn as an outline above.
export function monthBars(months, { h = 220, onClick = null, sel = null, byService } = {}) {
  const w = 100 / months.length;
  const max = Math.max(...months.map((m) => m.t.potential)) || 1;
  const nice = Math.ceil(max / 10000) * 10000;
  const y = (v) => h - (v / nice) * (h - 18);
  const bars = months.map((m, i) => {
    let acc = 0;
    const x = i * w + w * 0.18;
    const bw = w * 0.64;
    const segs = SERVICE_ORDER.map((s) => {
      const v = m.t.byService[s].paid;
      const r = `<rect x="${x}%" y="${y(acc + v)}" width="${bw}%" height="${Math.max(0, y(acc) - y(acc + v))}" fill="${SVC_FILL[s]}"/>`;
      acc += v;
      return v ? r : '';
    }).join('');
    const out = m.t.potential - m.t.paid;
    const ghost = out > 0 ? `<rect x="${x}%" y="${y(m.t.potential)}" width="${bw}%" height="${y(acc) - y(m.t.potential)}" fill="rgb(183 192 205 / .08)" stroke="rgb(183 192 205 / .55)" stroke-dasharray="3 3" stroke-width="1"/>` : '';
    const hit = onClick ? `<rect x="${i * w}%" y="0" width="${w}%" height="${h}" fill="transparent" data-ui="${onClick(m, i)}" style="cursor:pointer"/>` : '';
    const isSel = sel === i;
    return `${isSel ? `<rect x="${i * w}%" y="0" width="${w}%" height="${h}" fill="rgb(63 123 255 / .08)"/>` : ''}${segs}${ghost}${hit}`;
  }).join('');
  const grid = [0.5, 1].map((f) => `<line x1="0" x2="100%" y1="${y(nice * f)}" y2="${y(nice * f)}" stroke="rgb(198 206 217 / .08)"/><text x="0" y="${y(nice * f) - 5}" fill="#5f6a7b" font-size="10">${aed(nice * f, { short: true })}</text>`).join('');
  const labels = months.map((m, i) => `<text x="${i * w + w / 2}%" y="${h + 16}" text-anchor="middle" font-size="10" fill="${m.current ? '#a9c3ff' : '#8b95a5'}">${m.short}</text>`).join('');
  return `<svg class="chart" width="100%" height="${h + 22}" style="overflow:visible">${defs}${bars}${grid}${labels}</svg>`;
}

export function split(a, b, { ca = 'var(--blue)', cb = 'var(--hatch), var(--panel-3)', h = 10 } = {}) {
  const t = a + b || 1;
  return `<div style="display:flex;height:${h}px;border-radius:${h}px;overflow:hidden;background:var(--panel-3);gap:2px">
    <div style="width:${(a / t) * 100}%;background:${ca}"></div><div style="flex:1;background:${cb}"></div></div>`;
}

export function donut(parts, { size = 150, stroke = 18 } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = parts.reduce((s, p) => s + p.v, 0) || 1;
  let off = 0;
  const arcs = parts.map((p) => {
    const len = (p.v / total) * c;
    const a = `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${p.c}" stroke-width="${stroke}" stroke-dasharray="${Math.max(0, len - 2)} ${c}" stroke-dashoffset="${-off}" transform="rotate(-90 ${size / 2} ${size / 2})"/>`;
    off += len;
    return a;
  }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${defs}<circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="rgb(198 206 217 / .06)" stroke-width="${stroke}"/>${arcs}</svg>`;
}

export const svcKey = () => `<div class="key">${SERVICE_ORDER.map((s) => `<span><span class="sw sw-${s}"></span>${{ sim: 'Sim', track: 'Track day', commentary: 'Commentating', racing: 'Racing' }[s]}</span>`).join('')}<span><i style="border:1px dashed var(--silver);background:rgb(183 192 205 / .08)"></i>Not paid yet</span></div>`;
