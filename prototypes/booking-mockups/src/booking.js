import { DoubleSide, Mesh, PlaneGeometry, ShaderMaterial, Vector2 } from 'three';
import { ROOM_GLSL } from './room.js';
import { DISPLAY_GLSL } from './palette.js';
import { PILL } from './layout.js';
import { REFLECT_LAYER } from './stage.js';
import { PLANE_VERT, SDF_GLSL } from './cards.js';

const PAD = 6;
const INK_MS = 420;
const DRAIN_MS = 520;
const OPEN_MS = 850;
const CLOSE_MS = 650;

const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

// Placeholder availability: the next few weekdays at fixed times.
function slots(now = new Date()) {
  const out = [];
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const times = [['10:00', '16:30'], ['13:00'], ['09:30', '18:00'], ['11:00']];
  let k = 0;
  while (out.length < 6) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    for (const t of times[k++ % times.length]) {
      if (out.length < 6) out.push(`${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })} · ${t}`);
    }
  }
  return out;
}

// Book: one small pill under the arc. The pillar is whichever the helmet was
// looking at. Clicking floods the pill with liquid chrome from the side you
// came in, then a lens opens over the hero (Jesper's lens, without the black
// disc: smoked glass you can still see the helmet through).
export function createBooking({ room, exposure, atlas, button, lens, pillars, onChange }) {
  const label = atlas.entries.Book;
  const uniforms = {
    ...room,
    uExposure: exposure,
    uSizePx: { value: new Vector2(PILL.w, PILL.h) },
    uInk: { value: 0 },
    uInkOrigin: { value: new Vector2() },
    uHover: { value: 0 },
    uAtlas: { value: atlas.texture },
    uLabel: { value: label.uv },
    uLabelPx: { value: new Vector2(label.w, label.h) },
  };
  const mesh = new Mesh(
    new PlaneGeometry(1, 1),
    new ShaderMaterial({
      uniforms,
      vertexShader: PLANE_VERT,
      fragmentShader: /* glsl */ `
        ${ROOM_GLSL}
        ${DISPLAY_GLSL}
        ${SDF_GLSL}
        uniform float uExposure;
        uniform vec2 uSizePx;
        uniform float uInk;
        uniform vec2 uInkOrigin;
        uniform float uHover;
        uniform sampler2D uAtlas;
        uniform vec4 uLabel;
        uniform vec2 uLabelPx;
        varying vec2 vUv;
        varying vec3 vWorld;
        varying vec3 vT;
        varying vec3 vB;
        varying vec3 vN;

        void main() {
          vec2 full = uSizePx + 2.0 * ${PAD.toFixed(1)};
          vec2 p = (vUv - 0.5) * full;
          vec2 hs = uSizePx * 0.5;
          float d = sdRound(p, hs, hs.y);
          float aa = max(length(fwidth(p)) * 0.7, 0.35);
          float cover = 1.0 - smoothstep(-aa, aa, d);
          if (cover <= 0.0) discard;
          vec3 V = normalize(cameraPosition - vWorld);

          vec3 glass = STAGE * 1.3 + chromeEnv(vWorld, reflect(-V, vN), 0.05, 3.0) * 0.03;

          // liquid chrome, domed, with a raised meniscus at its front
          float reach = length(abs(uInkOrigin) + hs) + 6.0;
          float front = length(p - uInkOrigin) - uInk * reach;
          float ink = (1.0 - smoothstep(-aa, aa, front)) * step(0.001, uInk);
          vec2 fdir = (p - uInkOrigin) / max(length(p - uInkOrigin), 1e-4);
          float men = exp(-pow((front + 3.0) / 3.5, 2.0)) * (1.0 - step(0.999, uInk));
          vec3 ni = normalize(vec3(p / hs * vec2(0.28, 0.75) + fdir * men * 1.4, 1.0));
          vec3 Ni = normalize(ni.x * vT + ni.y * vB + ni.z * vN);
          vec3 chrome = chromeShade(vWorld, Ni, V, SILVER, 0.01, 0.1) * 1.1 + 0.03;

          vec2 lp = (p + uLabelPx * 0.5) / uLabelPx;
          float lab = 0.0;
          if (lp.x > 0.0 && lp.x < 1.0 && lp.y > 0.0 && lp.y < 1.0) lab = texture2D(uAtlas, mix(uLabel.xy, uLabel.zw, lp)).a;

          vec3 col = mix(glass, chrome, ink);
          vec3 labelCol = mix(TYPE * (0.8 + 0.35 * uHover), INK, ink);
          col = mix(col, labelCol, lab);

          // chrome rim, a hairline bead
          float b = clamp((d + 0.8) / 0.8, -1.0, 1.0);
          vec2 dir = sdRoundDir(p, hs, hs.y);
          vec3 nb = normalize(vec3(dir * b * 1.2, sqrt(max(1.0 - b * b, 0.03))));
          vec3 Nb = normalize(nb.x * vT + nb.y * vB + nb.z * vN);
          vec3 rim = chromeShade(vWorld, Nb, V, SILVER, 0.01, 0.1) * (0.8 + 0.5 * uHover);
          col = mix(col, rim, (1.0 - smoothstep(0.8, 1.6, -d)) * (1.0 - ink * 0.6));

          gl_FragColor = vec4(toDisplay(col * uExposure), cover * uExposure);
        }
      `,
      transparent: true,
      side: DoubleSide,
    }),
  );
  mesh.layers.enable(REFLECT_LAYER);

  // box: half width, half height and corner radius when the lens is a rectangle (null when round)
  const lensU = { centre: new Vector2(), radius: 300, open: 0, box: null };
  const state = { hover: 0, hoverTarget: 0, inkFrom: 0, inkTo: 0, inkAt: -1e9, inkMs: INK_MS, openFrom: 0, openTo: 0, openAt: -1e9, openMs: OPEN_MS, pillar: 0 };
  let pillRect = { x: 0, y: 0, w: PILL.w, h: PILL.h };
  let now = 0;

  const nameEl = lens.querySelector('.lens-name');
  const list = lens.querySelector('.lens-slots');
  for (const s of slots()) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = s;
    b.addEventListener('pointerenter', (e) => {
      const r = b.getBoundingClientRect();
      b.style.setProperty('--ix', `${e.clientX - r.left}px`);
      b.style.setProperty('--iy', `${e.clientY - r.top}px`);
    });
    b.addEventListener('click', () => {
      list.querySelectorAll('button').forEach((o) => o.classList.toggle('picked', o === b && !b.classList.contains('picked')));
    });
    li.appendChild(b);
    list.appendChild(li);
  }

  const value = (from, to, at, ms) => from + (to - from) * ease((now - at) / ms);
  const isOpen = () => state.openTo === 1;

  function open() {
    state.inkFrom = value(state.inkFrom, state.inkTo, state.inkAt, state.inkMs);
    state.inkTo = 1;
    state.inkAt = now;
    state.inkMs = INK_MS;
    state.openFrom = value(state.openFrom, state.openTo, state.openAt, state.openMs);
    state.openTo = 1;
    state.openAt = now + INK_MS * 0.55;
    state.openMs = OPEN_MS;
    nameEl.textContent = pillars[state.pillar].name;
    lens.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    onChange();
  }

  function close() {
    if (!isOpen()) return;
    state.openFrom = value(state.openFrom, state.openTo, state.openAt, state.openMs);
    state.openTo = 0;
    state.openAt = now;
    state.openMs = CLOSE_MS;
    state.inkFrom = value(state.inkFrom, state.inkTo, state.inkAt, state.inkMs);
    state.inkTo = 0;
    state.inkAt = now + 120;
    state.inkMs = DRAIN_MS;
    lens.classList.remove('shown');
    button.setAttribute('aria-expanded', 'false');
    onChange();
  }

  button.addEventListener('pointerenter', (e) => {
    const r = button.getBoundingClientRect();
    if (!isOpen()) uniforms.uInkOrigin.value.set(e.clientX - r.left - r.width / 2, r.top + r.height / 2 - e.clientY);
    state.hoverTarget = 1;
    onChange();
  });
  button.addEventListener('pointerleave', () => {
    state.hoverTarget = 0;
    onChange();
  });
  button.addEventListener('click', (e) => {
    if (isOpen()) return close();
    // keyboard activation has no pointer: fill from the left edge
    if (e.detail === 0) uniforms.uInkOrigin.value.set(-PILL.w / 2, 0);
    open();
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  return {
    mesh,
    lens: lensU,
    isOpen,
    close,
    setPillar(i) {
      if (i < 0 || i === state.pillar) return;
      state.pillar = i;
      if (isOpen()) nameEl.textContent = pillars[i].name;
    },
    // a click anywhere outside the open lens closes it
    outside(x, y) {
      if (!isOpen()) return false;
      const inLens = lensU.box
        ? Math.abs(x - lensU.centre.x) < lensU.box.w && Math.abs(y - lensU.centre.y) < lensU.box.h
        : Math.hypot(x - lensU.centre.x, y - lensU.centre.y) < lensU.radius;
      const inPill = Math.abs(x - pillRect.x) < pillRect.w / 2 && Math.abs(y - pillRect.y) < pillRect.h / 2;
      if (inLens || inPill) return false;
      close();
      return true;
    },
    layout(view, layout) {
      const z = PILL.z;
      const [x, y] = view.toWorld(layout.pill.x, layout.pill.y, z);
      const k = view.pxToWorld(z);
      mesh.position.set(x, y, z);
      mesh.scale.set((PILL.w + 2 * PAD) * k, (PILL.h + 2 * PAD) * k, 1);
      pillRect = layout.pill;
      Object.assign(button.style, {
        left: `${layout.pill.x - PILL.w / 2}px`,
        top: `${layout.pill.y - PILL.h / 2}px`,
        width: `${PILL.w}px`,
        height: `${PILL.h}px`,
      });
      lensU.centre.set(layout.lens.x, layout.lens.y);
      lensU.radius = layout.lens.r;
      const { w, h, cr } = layout.lens;
      lensU.box = w ? { w: w / 2, h: h / 2, cr } : null;
      Object.assign(lens.style, {
        left: `${layout.lens.x - (w ? w / 2 : layout.lens.r)}px`,
        top: `${layout.lens.y - (h ? h / 2 : layout.lens.r)}px`,
        width: `${w || layout.lens.r * 2}px`,
        height: `${h || layout.lens.r * 2}px`,
        borderRadius: w ? `${cr}px` : '',
      });
    },
    update(dt, t) {
      now = t;
      const k = 1 - Math.pow(1 - 0.18, dt * 60);
      state.hover += (state.hoverTarget - state.hover) * k;
      if (Math.abs(state.hoverTarget - state.hover) < 1e-3) state.hover = state.hoverTarget;
      uniforms.uHover.value = state.hover;
      const ink = value(state.inkFrom, state.inkTo, state.inkAt, state.inkMs);
      uniforms.uInk.value = now < state.inkAt ? state.inkFrom : ink;
      const o = now < state.openAt ? state.openFrom : value(state.openFrom, state.openTo, state.openAt, state.openMs);
      lensU.open = o;
      if (state.openTo === 1 && o > 0.72) lens.classList.add('shown');
      if (state.openTo === 0 && o < 0.01) lens.hidden = true;
      const animating = now < state.inkAt + state.inkMs || now < state.openAt + state.openMs || state.hover !== state.hoverTarget;
      // the open lens breathes, so it keeps rendering
      return animating || o > 0;
    },
  };
}

