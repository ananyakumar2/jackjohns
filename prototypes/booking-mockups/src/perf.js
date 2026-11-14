import { Vector2 } from 'three';

// Adaptive pixel ratio: median of recent frame intervals, stepped in 0.25s,
// capped by a megapixel budget, remembered per screen for a day.
export class Governor {
  constructor({ min = 1, max = 2, budgetMP = 8.3, fixed = null } = {}) {
    this.min = min;
    this.max = max;
    this.budget = budgetMP * 1e6;
    this.fixed = fixed;
    this.samples = [];
    this.lastChange = 0;
    this.key = `helmet-follow:dpr:${screen.width}x${screen.height}@${devicePixelRatio}`;
    this.dpr = fixed ?? this.restore() ?? Math.min(devicePixelRatio, max);
  }

  restore() {
    try {
      const s = JSON.parse(localStorage.getItem(this.key) || 'null');
      if (s && Date.now() - s.t < 864e5) return s.dpr;
    } catch {}
    return null;
  }

  cap(cssW, cssH) {
    const byBudget = Math.sqrt(this.budget / Math.max(1, cssW * cssH));
    return Math.max(this.min, Math.min(devicePixelRatio, this.max, byBudget));
  }

  // interval: ms since the previous rendered frame, only for back-to-back frames
  sample(interval, now, cssW, cssH) {
    const cap = this.cap(cssW, cssH);
    if (this.fixed == null && this.dpr > cap) return this.set(cap, now);
    this.samples.push(interval);
    if (this.samples.length > 90) this.samples.shift();
    if (this.fixed != null || this.samples.length < 45) return false;

    const sorted = [...this.samples].sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    const refresh = Math.max(sorted[2], 6.5); // fastest frames ≈ display refresh
    const target = Math.max(refresh, 1000 / 60);
    if (median > target * 1.28 && now - this.lastChange > 1200 && this.dpr > this.min) {
      return this.set(Math.max(this.min, this.dpr - 0.25), now);
    }
    if (median <= target * 1.06 && now - this.lastChange > 6000 && this.dpr < cap) {
      return this.set(Math.min(cap, this.dpr + 0.25), now);
    }
    return false;
  }

  set(dpr, now) {
    if (Math.abs(dpr - this.dpr) < 1e-3) return false;
    this.dpr = dpr;
    this.lastChange = now;
    this.samples.length = 0;
    try {
      localStorage.setItem(this.key, JSON.stringify({ dpr, t: Date.now() }));
    } catch {}
    return true;
  }
}

// ?hud: frame timing, pixel ratio, render count, and what the page downloaded.
export class Hud {
  constructor(renderer) {
    this.el = document.createElement('div');
    this.el.id = 'hud';
    document.body.appendChild(this.el);
    this.intervals = [];
    this.cpu = [];
    this.gpu = [];
    this.frames = 0;
    this.renderer = renderer;
    const gl = renderer.getContext();
    this.gl = gl;
    this.timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.queries = [];
    this.lastPaint = 0;
    this.size = new Vector2();
  }

  beginGpu() {
    if (!this.timer) return;
    const q = this.gl.createQuery();
    this.gl.beginQuery(this.timer.TIME_ELAPSED_EXT, q);
    this.queries.push(q);
  }

  endGpu() {
    if (!this.timer) return;
    const gl = this.gl;
    gl.endQuery(this.timer.TIME_ELAPSED_EXT);
    while (this.queries.length) {
      const q = this.queries[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      if (!gl.getParameter(this.timer.GPU_DISJOINT_EXT)) push(this.gpu, gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(q);
      this.queries.shift();
    }
  }

  frame(interval, cpuMs, now, state) {
    this.frames++;
    if (interval != null) push(this.intervals, interval);
    push(this.cpu, cpuMs);
    if (now - this.lastPaint < 250) return;
    this.lastPaint = now;
    const r = this.renderer;
    const size = r.getDrawingBufferSize(this.size);
    const mp = (size.x * size.y) / 1e6;
    const med = pct(this.intervals, 0.5);
    this.el.textContent = [
      `frame  ${fmt(med)} ms median  ${fmt(pct(this.intervals, 0.95))} p95  (${med ? (1000 / med).toFixed(0) : '–'} fps while moving)`,
      `cpu    ${fmt(pct(this.cpu, 0.5))} ms median   gpu ${this.gpu.length ? fmt(pct(this.gpu, 0.5)) + ' ms' : 'n/a'}`,
      `dpr    ${r.getPixelRatio().toFixed(2)}  ${size.x}×${size.y} (${mp.toFixed(2)} MP)  renders ${this.frames}  ${state.sleeping ? 'asleep' : 'awake'}`,
      `first  quadrants ${fmt(state.quadsAt)} ms  helmet ${fmt(state.helmetAt)} ms`,
      `bytes  ${downloads()}`,
    ].join('\n');
  }
}

function push(arr, v) {
  arr.push(v);
  if (arr.length > 240) arr.shift();
}
function pct(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}
function fmt(v) {
  return v == null ? '–' : v.toFixed(1);
}

export function downloadSplit() {
  const out = { js: 0, model: 0, textures: 0, video: 0, other: 0 };
  for (const e of performance.getEntriesByType('resource')) {
    const n = e.encodedBodySize || e.transferSize || 0;
    const u = e.name.split('?')[0];
    if (/\.(m?js|wasm)$/.test(u)) out.js += n;
    else if (/\.(glb|gltf)$/.test(u)) out.model += n;
    else if (/\.(ktx2|png|jpe?g|webp|avif)$/.test(u)) out.textures += n;
    else if (/\.(mp4|webm|mov)$/.test(u) || e.initiatorType === 'video') out.video += n;
    else out.other += n;
  }
  return out;
}

function downloads() {
  const d = downloadSplit();
  const kb = (n) => (n / 1024).toFixed(0);
  return `js ${kb(d.js)}  model ${kb(d.model)}  tex ${kb(d.textures)}  video ${kb(d.video)}  other ${kb(d.other)} KB`;
}
