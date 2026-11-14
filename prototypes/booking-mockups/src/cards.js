import { DoubleSide, Mesh, PlaneGeometry, ShaderMaterial, Vector2, Vector3 } from 'three';
import { ROOM_GLSL } from './room.js';
import { DISPLAY_GLSL } from './palette.js';
import { CARD_Z, FRAME_PX } from './layout.js';
import { REFLECT_LAYER } from './stage.js';

const RADIUS_PX = 9;
const PAD_PX = 2;
const NOTCH_SOFT_PX = 14;

// Damped spring, substepped so stiff settings stay stable at 30 Hz.
export class Spring {
  constructor(omega, zeta, x = 0) {
    this.w = omega;
    this.z = zeta;
    this.x = x;
    this.v = 0;
  }
  step(target, dt) {
    const n = Math.max(1, Math.ceil(dt * 240));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (this.w * this.w * (target - this.x) - 2 * this.z * this.w * this.v) * h;
      this.x += this.v * h;
    }
    const settled = Math.abs(target - this.x) < 1e-4 && Math.abs(this.v) < 1e-3;
    if (settled) {
      this.x = target;
      this.v = 0;
    }
    return !settled;
  }
}

export const SDF_GLSL = /* glsl */ `
float sdRound(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
vec2 sdRoundDir(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  vec2 g = (q.x > 0.0 && q.y > 0.0) ? normalize(q) : (q.x > q.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
  return sign(p) * g;
}
`;

export const PLANE_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vT;
varying vec3 vB;
varying vec3 vN;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vT = normalize(mat3(modelMatrix) * vec3(1.0, 0.0, 0.0));
  vB = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
  vN = normalize(cross(vT, vB));
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
${ROOM_GLSL}
${DISPLAY_GLSL}
${SDF_GLSL}
uniform sampler2D uMap;
uniform float uAspect;
uniform vec2 uFocus;
uniform vec2 uSizePx;
uniform float uWake;
uniform float uStillGain;
uniform vec3 uNotch; // centre (card px, y up) and radius of the circle the inner corner follows
uniform float uExposure;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vT;
varying vec3 vB;
varying vec3 vN;

void main() {
  vec2 full = uSizePx + 2.0 * (${FRAME_PX.toFixed(2)} + ${PAD_PX.toFixed(2)});
  vec2 p = (vUv - 0.5) * full;
  vec2 hs = uSizePx * 0.5;
  // rounded rect minus the opening, joined by a smooth max so the cut meets the edges with a fillet
  float dRect = sdRound(p, hs, ${RADIUS_PX.toFixed(2)});
  vec2 toC = p - uNotch.xy;
  float dCut = uNotch.z + ${FRAME_PX.toFixed(2)} - length(toC);
  float hk = clamp(0.5 + 0.5 * (dCut - dRect) / ${NOTCH_SOFT_PX.toFixed(1)}, 0.0, 1.0);
  float dIn = mix(dRect, dCut, hk) + ${NOTCH_SOFT_PX.toFixed(1)} * hk * (1.0 - hk);
  float aa = max(length(fwidth(p)) * 0.7, 0.35);
  float cover = 1.0 - smoothstep(-aa, aa, dIn - ${FRAME_PX.toFixed(2)});
  if (cover <= 0.0) discard;
  vec3 V = normalize(cameraPosition - vWorld);

  // the footage (or its still), cover-fitted
  vec2 st = clamp((p + hs) / uSizePx, 0.0, 1.0);
  float pa = uSizePx.x / uSizePx.y;
  vec2 s = pa > uAspect ? vec2(1.0, uAspect / pa) : vec2(pa / uAspect, 1.0);
  vec2 c = clamp(uFocus, s * 0.5, 1.0 - s * 0.5);
  vec3 img = dispDecode(texture2D(uMap, c + (st - 0.5) * s).rgb);
  float wake = clamp(uWake, 0.0, 1.0);
  float l = dot(img, vec3(0.2126, 0.7152, 0.0722));
  vec3 still = vec3(l) * vec3(0.74, 0.84, 1.0) * 0.55 * uStillGain;
  img = mix(still, img, wake) * (1.0 + 0.35 * max(uWake - 1.0, 0.0));
  img *= mix(0.62, 1.0, smoothstep(0.0, 0.18 * uSizePx.y, -dIn) * (0.6 + 0.4 * wake) + 0.4 * wake);
  // cover glass: the room slides across it as the card leans
  vec3 Rg = reflect(-V, vN);
  img += roomRadiance(vWorld, Rg, 0.03, 4.0, 0.35) * 0.05;
  img *= mix(0.25, 1.0, smoothstep(0.0, 1.8, -dIn));

  // silver chrome bezel: a half-round bead, lit by the same room as the visor
  float b = clamp(dIn / ${FRAME_PX.toFixed(2)}, 0.0, 1.0) * 2.0 - 1.0;
  vec2 dir = normalize(mix(sdRoundDir(p, hs, ${RADIUS_PX.toFixed(2)}), -toC / max(length(toC), 1e-3), hk));
  vec3 nl = normalize(vec3(dir * b * 1.3, sqrt(max(1.0 - b * b, 0.03))));
  vec3 N = normalize(nl.x * vT + nl.y * vB + nl.z * vN);
  float spread = length(fwidth(N)) + 0.004;
  vec3 bezel = vec3(0.0);
  if (dIn > -aa - 1.0) bezel = chromeShade(vWorld, N, V, SILVER, spread, 0.2) * (0.8 + 0.3 * wake);

  vec3 col = mix(bezel, img, 1.0 - smoothstep(-aa, aa, dIn));
  gl_FragColor = vec4(toDisplay(col * uExposure), cover * uExposure);
}
`;

export class Card {
  constructor(room, exposure) {
    this.uniforms = {
      ...room,
      uExposure: exposure,
      uMap: { value: null },
      uAspect: { value: 16 / 9 },
      uFocus: { value: new Vector2(0.5, 0.5) },
      uSizePx: { value: new Vector2(320, 200) },
      uWake: { value: 0 },
      uStillGain: { value: 1 },
      uNotch: { value: new Vector3(0, 0, -1e4) },
    };
    this.mesh = new Mesh(
      new PlaneGeometry(1, 1),
      new ShaderMaterial({ uniforms: this.uniforms, vertexShader: PLANE_VERT, fragmentShader: FRAG, transparent: true, side: DoubleSide }),
    );
    this.mesh.layers.enable(REFLECT_LAYER);
    this.wake = new Spring(8, 0.5);
    this.lift = new Spring(10, 0.8);
    this.yaw = new Spring(9, 0.26);
    this.pitch = new Spring(9, 0.26);
    this.kick = { x: 0, y: 0 };
    this.base = { x: 0, y: 0, wpx: 1 };
    this.rect = { x: 0, y: 0, w: 1, h: 1 };
  }

  place(rect, view, open) {
    this.rect = rect;
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const [x, y] = view.toWorld(cx, cy, CARD_Z);
    this.base = { x, y, wpx: view.pxToWorld(CARD_Z) };
    this.uniforms.uSizePx.value.set(rect.w, rect.h);
    this.uniforms.uNotch.value.set(open.x - cx, cy - open.y, open.r);
    this.apply();
  }

  apply() {
    const m = this.mesh;
    const pad = 2 * (FRAME_PX + PAD_PX);
    const k = 1 + 0.012 * this.lift.x;
    m.scale.set((this.rect.w + pad) * this.base.wpx * k, (this.rect.h + pad) * this.base.wpx * k, 1);
    m.position.set(this.base.x, this.base.y, CARD_Z + 0.2 * this.lift.x);
    m.rotation.set(this.pitch.x, this.yaw.x, 0, 'YXZ');
    this.uniforms.uWake.value = this.wake.x;
  }
}

// Cards turn towards the cursor (as the helmet does), the hovered one most;
// a fast flick past them knocks them into a short wobble.
const clamp = (v, m) => Math.max(-m, Math.min(m, v));

export function updateCards(cards, dt, { pointer, active, view, flick, still }) {
  let busy = false;
  cards.forEach((card, i) => {
    const r = card.rect;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    let ty = 0;
    let tp = 0;
    if (pointer.inside && !still) {
      const dx = (pointer.x - cx) / (view.W * 0.5);
      const dy = (pointer.y - cy) / (view.H * 0.5);
      const w = i === active ? 1 : 0.4 * Math.exp(-(dx * dx + dy * dy) * 1.2);
      ty = Math.max(-1, Math.min(1, dx * 1.6)) * 0.2 * w;
      tp = Math.max(-1, Math.min(1, dy * 1.6)) * 0.16 * w;
      if (flick) {
        // one knock per flick, as hard as its peak speed (capped), then the spring rings out
        const f = Math.exp(-(dx * dx + dy * dy) * 1.5);
        const kx = clamp(flick.x / 1000, 4) * 0.9 * f;
        const ky = clamp(flick.y / 1000, 4) * 0.7 * f;
        if (Math.abs(kx) > Math.abs(card.kick.x)) {
          card.yaw.v += kx - card.kick.x;
          card.kick.x = kx;
        }
        if (Math.abs(ky) > Math.abs(card.kick.y)) {
          card.pitch.v += ky - card.kick.y;
          card.kick.y = ky;
        }
      }
    }
    if (!flick) card.kick.x = card.kick.y = 0;
    busy = card.yaw.step(ty, dt) || busy;
    busy = card.pitch.step(tp, dt) || busy;
    busy = card.lift.step(i === active ? 1 : 0, dt) || busy;
    busy = card.wake.step(i === active ? 1 : 0, dt) || busy;
    card.apply();
  });
  return busy;
}
