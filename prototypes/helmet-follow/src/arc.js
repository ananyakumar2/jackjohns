import { DoubleSide, Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from 'three';
import { ROOM_GLSL } from './room.js';
import { DISPLAY_GLSL } from './palette.js';
import { ARC, CAMERA_Y, CAMERA_Z, HELMET_VISUAL_RADIUS, OPENING } from './layout.js';
import { REFLECT_LAYER } from './stage.js';
import { PLANE_VERT, Spring } from './cards.js';

const SIDE = (ARC.count - 1) / 2;
const STEP = ARC.span / SIDE;
// sized at its own depth so on screen it is concentric with the opening
const DEPTH_K = (CAMERA_Z - ARC.z) / CAMERA_Z;
const R = ARC.r * HELMET_VISUAL_RADIUS * DEPTH_K;
const CENTRE_Y = CAMERA_Y + (-OPENING.drop * HELMET_VISUAL_RADIUS - CAMERA_Y) * DEPTH_K;
const _f = new Vector3();

// The shift light, curved under the helmet like a smile. It fills from the
// centre towards wherever the helmet looks, so it reads as revs rising, never
// as a row of start lights. Unlit, each LED is a little chrome reflector
// behind smoked glass; lit, it glows in Jack's blue; at the limiter (a fast
// flick) the whole arc flashes gold chrome.
export function createArc(room, exposure) {
  const uniforms = {
    ...room,
    uExposure: exposure,
    uLeft: { value: 0 },
    uRight: { value: 0 },
    uFlash: { value: 0 },
    uIdle: { value: 0 },
    uPlane: { value: new Vector3() },
  };
  const w = 2 * R * Math.sin(ARC.span) + 0.8;
  const h = R * (1 - Math.cos(ARC.span)) + 0.8;
  const mesh = new Mesh(
    new PlaneGeometry(1, 1),
    new ShaderMaterial({
      uniforms,
      vertexShader: PLANE_VERT,
      fragmentShader: /* glsl */ `
        ${ROOM_GLSL}
        ${DISPLAY_GLSL}
        uniform float uExposure;
        uniform float uLeft;
        uniform float uRight;
        uniform float uFlash;
        uniform float uIdle;
        uniform vec3 uPlane; // plane width, height, centre y relative to the arc's centre
        varying vec2 vUv;
        varying vec3 vWorld;
        varying vec3 vT;
        varying vec3 vB;
        varying vec3 vN;

        const float R = ${R.toFixed(4)};
        const float STEP = ${STEP.toFixed(5)};
        const float LED = ${ARC.led.toFixed(4)};
        const float SIDE = ${SIDE.toFixed(1)};

        float ledLevel(float i) {
          float a = abs(i);
          float centre = max(uIdle, smoothstep(0.0, 0.08, max(uLeft, uRight)));
          if (a < 0.5) return max(centre, uFlash);
          float L = i < 0.0 ? uLeft : uRight;
          float lit = clamp(L * SIDE - a + 1.0, 0.0, 1.0);
          return max(lit * lit * (3.0 - 2.0 * lit) * (1.0 + 0.6 * max(L - 1.0, 0.0)), uFlash);
        }

        vec3 ledColour(float i, out vec3 core) {
          float k = abs(i) / SIDE;
          core = mix(BLUE_CORE, vec3(0.85, 0.93, 1.0), k * 0.5);
          vec3 glow = mix(JACK_BLUE, JACK_BLUE * vec3(1.0, 1.15, 1.0), k);
          core = mix(core, GOLD_CORE, step(0.01, uFlash));
          return mix(glow, GOLD * vec3(1.0, 0.82, 0.5), step(0.01, uFlash));
        }

        void main() {
          vec2 q = (vUv - 0.5) * uPlane.xy + vec2(0.0, uPlane.z);
          float ang = atan(q.y, q.x) + 1.5707963;
          float fi = clamp(floor(ang / STEP + 0.5), -SIDE, SIDE);
          vec3 V = normalize(cameraPosition - vWorld);
          float aa = length(fwidth(q)) * 0.75;

          vec3 halo = vec3(0.0);
          vec3 body = vec3(0.0);
          float bodyA = 0.0;
          for (int k = -1; k <= 1; k++) {
            float i = fi + float(k);
            if (abs(i) > SIDE) continue;
            float a = i * STEP - 1.5707963;
            vec2 c = R * vec2(cos(a), sin(a));
            vec2 d = q - c;
            float r = length(d) / LED;
            float lit = ledLevel(i);
            vec3 core;
            vec3 glow = ledColour(i, core);
            halo += glow * lit * (exp(-r * r * 0.28) * 0.12 + exp(-r * r * 1.6) * 0.35);
            if (k == 0) {
              float cover = 1.0 - smoothstep(-aa, aa, length(d) - LED);
              vec2 dir = d / max(length(d), 1e-5);
              // bezel: a chrome bead from r 0.7 to 1
              float b = clamp((r - 0.85) / 0.15, -1.0, 1.0);
              vec3 nb = normalize(vec3(dir * b * 1.2, sqrt(max(1.0 - b * b, 0.03))));
              vec3 Nb = normalize(nb.x * vT + nb.y * vB + nb.z * vN);
              vec3 bezel = chromeShade(vWorld, Nb, V, SILVER, 0.01, 0.15);
              // lens: smoked glass over a concave chrome reflector
              vec3 nr = normalize(vec3(-dir * r * 0.7, 1.0));
              vec3 Nr = normalize(nr.x * vT + nr.y * vB + nr.z * vN);
              vec3 cup = chromeShade(vWorld, Nr, V, SILVER, 0.02, 0.6) * 0.32 + STAGE * 0.6;
              vec3 lens = cup + core * lit * 2.6 * (1.0 - r * r * 0.55) + glow * lit * 0.4;
              body = mix(lens, bezel, smoothstep(0.68, 0.72, r));
              bodyA = cover;
            }
          }
          vec3 col = toDisplay(body * uExposure) * bodyA + toDisplay(halo * uExposure) * (1.0 - bodyA * 0.6);
          float alpha = bodyA;
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  mesh.layers.enable(REFLECT_LAYER);
  const offset = -R + h / 2 - 0.4;
  mesh.position.set(0, CENTRE_Y + offset, ARC.z);
  mesh.scale.set(w, h, 1);
  uniforms.uPlane.value.set(w, h, offset);

  const left = new Spring(13, 0.42);
  const right = new Spring(13, 0.42);
  let faced = -1;
  let flashAt = -1e9;
  let sweepAt = -1;

  return {
    mesh,
    get levels() {
      return [uniforms.uLeft.value, uniforms.uRight.value];
    },
    sweep(now) {
      sweepAt = now;
    },
    flick(now) {
      if (now - flashAt > 700) flashAt = now;
    },
    // gaze: the helmet's displayed orientation
    // idle: nobody is steering, so only the centre LED breathes
    update(dt, now, gaze, still, idle) {
      _f.set(0, 0, 1).applyQuaternion(gaze);
      const turn = Math.acos(Math.min(1, Math.max(-1, _f.z)));
      const amount = still || idle ? 0 : Math.min(1, Math.max(0, (turn - 0.05) / 0.62));
      const lateral = Math.hypot(_f.x, _f.y) || 1;
      const side = _f.x / lateral;
      let tl = amount * Math.min(1, Math.max(0, (-side + 0.3) / 0.6));
      let tr = amount * Math.min(1, Math.max(0, (side + 0.3) / 0.6));

      const q = turn < 0.12 ? -1 : (_f.x < 0 ? 0 : 1) + (_f.y > 0 ? 0 : 2);
      if (q !== faced) {
        if (q >= 0 && !still && !idle) (q % 2 ? right : left).v += 7;
        faced = q;
      }
      if (sweepAt >= 0 && now - sweepAt > 350) {
        left.v += 16;
        right.v += 16;
        sweepAt = -1;
      }
      const f = (now - flashAt) / 560;
      const flashing = f >= 0 && f < 1;
      if (flashing) {
        tl = Math.max(tl, 1.12);
        tr = Math.max(tr, 1.12);
      }
      let busy = left.step(tl, dt);
      busy = right.step(tr, dt) || busy;
      uniforms.uLeft.value = Math.max(0, left.x);
      uniforms.uRight.value = Math.max(0, right.x);
      // three short blinks at the limiter
      uniforms.uFlash.value = flashing && Math.sin(f * Math.PI * 6) > -0.2 ? 1 - f * 0.4 : 0;
      uniforms.uIdle.value = 0.2 + 0.08 * Math.sin(now * 0.0021);
      return busy || flashing || sweepAt >= 0;
    },
  };
}
