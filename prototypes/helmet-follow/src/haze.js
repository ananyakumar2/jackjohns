import { BufferGeometry, Float32BufferAttribute, HalfFloatType, LinearFilter, Mesh, OrthographicCamera, Scene, ShaderMaterial, Vector2, Vector3, Vector4, WebGLRenderTarget } from 'three';
import { ROOM_GLSL } from './room.js';
import { DISPLAY_GLSL } from './palette.js';

const FIELD = 256;
const SIM_HZ = 60;
const FOLLOW = 0.42; // how fast the haze head chases the cursor (edolus: followLag 0.6)
const BRUSH = 0.048; // brush radius, fraction of screen height
const MIN_SPEED = 24; // CSS px/s below which nothing is stamped
const DECAY = 0.955; // density kept per 1/60 s
const DRIFT_DECAY = 0.9;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const SIM = /* glsl */ `
uniform sampler2D uPrev;
uniform vec2 uTexel;
uniform float uAspect;
uniform vec3 uDecay; // drift, density, gold
uniform vec4 uSeg; // a.xy, b.xy in field uv
uniform vec4 uStamp; // dir.xy, amount, gold
uniform float uRadius;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uPrev, vUv);
  // self-advect along the stored drift, then a light 5-tap blur
  vec2 back = vUv - c.xy * uTexel * 2.2;
  vec4 s = texture2D(uPrev, back) * 0.36;
  s += texture2D(uPrev, back + vec2(uTexel.x * 1.5, 0.0)) * 0.16;
  s += texture2D(uPrev, back - vec2(uTexel.x * 1.5, 0.0)) * 0.16;
  s += texture2D(uPrev, back + vec2(0.0, uTexel.y * 1.5)) * 0.16;
  s += texture2D(uPrev, back - vec2(0.0, uTexel.y * 1.5)) * 0.16;
  s *= vec4(uDecay.xx, uDecay.yz);
  if (uStamp.z > 0.0) {
    vec2 k = vec2(uAspect, 1.0);
    vec2 p = vUv * k;
    vec2 a = uSeg.xy * k;
    vec2 ab = uSeg.zw * k - a;
    float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
    vec2 q = p - a - ab * h;
    float w = exp(-dot(q, q) / (uRadius * uRadius));
    s.xy += uStamp.xy * w * uStamp.z;
    s.z = min(1.0, s.z + w * uStamp.z);
    s.w = max(s.w, w * uStamp.w);
  }
  s.xy = clamp(s.xy, -1.6, 1.6);
  gl_FragColor = s;
}
`;

const POST = /* glsl */ `
${ROOM_GLSL}
${DISPLAY_GLSL}
uniform sampler2D uScene;
uniform sampler2D uField;
uniform vec2 uFieldTexel;
uniform vec2 uCss;
uniform float uHazeOn;
uniform vec4 uCards[4];
uniform vec4 uWake;
uniform vec3 uHelmet;
uniform vec4 uPill;
uniform vec4 uLens;
uniform float uTime;
uniform vec3 uView;
uniform float uFade;
varying vec2 vUv;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// The colours heat leaves on titanium and chrome: straw gold, through silver,
// to blue. Jack's palette, produced by heat rather than painted on.
vec3 heatTint(float t) {
  t = fract(t);
  vec3 g = vec3(1.0, 0.78, 0.38);
  vec3 s = vec3(0.78, 0.84, 0.95);
  vec3 b = vec3(0.25, 0.45, 1.0);
  vec3 c = mix(g, s, smoothstep(0.0, 0.34, t));
  c = mix(c, b, smoothstep(0.34, 0.67, t));
  return mix(c, g, smoothstep(0.67, 1.0, t));
}

// Strongest over the footage, light over the stage, quiet over the helmet,
// held back from the Book pill and from the lens's content.
float onCard = 0.0;
float hazeMask(vec2 px) {
  float m = 0.38;
  for (int k = 0; k < 4; k++) {
    vec4 r = uCards[k];
    float d = sdBox(px - (r.xy + r.zw) * 0.5, (r.zw - r.xy) * 0.5);
    float c = 1.0 - smoothstep(-8.0, 16.0, d);
    onCard = max(onCard, c);
    m = max(m, c * (0.75 + 0.25 * uWake[k]));
  }
  float dh = length(px - uHelmet.xy) / uHelmet.z;
  m *= mix(0.12, 1.0, smoothstep(0.75, 1.15, dh));
  m *= mix(0.2, 1.0, smoothstep(0.0, 24.0, sdBox(px - uPill.xy, uPill.zw)));
  return m;
}

vec3 roomPoint(vec2 uv) {
  return vec3((uv.x * 2.0 - 1.0) * uView.x, uView.z + (uv.y * 2.0 - 1.0) * uView.y, 0.6);
}

void main() {
  vec2 uv = vUv;
  vec2 px = uv * uCss;
  vec2 suv = uv;
  float lensIn = 0.0;
  float rim = 0.0;
  vec3 rimCol = vec3(0.0);
  vec3 fringe = vec3(0.0);

  if (uLens.w > 0.001) {
    vec2 d = px - uLens.xy;
    float t = length(d) + 1e-3;
    float a = atan(d.y, d.x);
    float o = uLens.w;
    float E = uLens.z * o * (1.0 + 0.015 * (sin(3.0 * a + 0.7 * uTime) * 0.6 + sin(5.0 * a - 0.45 * uTime) * 0.4) + 0.01 * sin(uTime * 1.3));
    if (t > E) {
      // Jesper's lens term: pixels just outside the rim look back towards the centre
      float w = exp(-(t - E) / (uLens.z * 0.3));
      float src = t - (E * E / t) * w;
      src += (vnoise(vec2(a * 6.0, uTime * 1.6)) - 0.5) * 3.0 * w;
      suv = (uLens.xy + d / t * src) / uCss;
      fringe = heatTint(a * 0.16 + uTime * 0.04 + (t - E) / 60.0) * exp(-(t - E) / 7.0) * 0.16 * o;
    } else {
      lensIn = (1.0 - smoothstep(E - 2.0, E, t)) * smoothstep(0.0, 0.4, o);
      suv = (uLens.xy + d * 0.84) / uCss;
    }
    float b = clamp((t - E) / 1.7, -1.0, 1.0);
    vec3 n = normalize(vec3(d / t * b * 1.2, sqrt(max(1.0 - b * b, 0.03))));
    rimCol = toDisplay(chromeShade(roomPoint(uv), n, vec3(0.0, 0.0, 1.0), SILVER, 0.004, 0.15) * 1.15);
    rim = (1.0 - smoothstep(1.0, 2.2, abs(t - E))) * smoothstep(0.0, 0.15, o);
  }

  float m = hazeMask(px) * (1.0 - lensIn) * uHazeOn;
  vec2 gn = vec2(0.0);
  float rho = 0.0;
  float gold = 0.0;
  vec2 off = vec2(0.0);
  if (m > 0.001) {
    vec4 f = texture2D(uField, uv);
    rho = f.z;
    gold = f.w;
    float rx = texture2D(uField, uv + vec2(uFieldTexel.x, 0.0)).z - texture2D(uField, uv - vec2(uFieldTexel.x, 0.0)).z;
    float ry = texture2D(uField, uv + vec2(0.0, uFieldTexel.y)).z - texture2D(uField, uv - vec2(0.0, uFieldTexel.y)).z;
    gn = vec2(rx, ry) * 4.0;
    // rising shimmer inside the wake
    vec2 sp = px * 0.05 - vec2(0.0, uTime * 2.4);
    vec2 sh = vec2(vnoise(sp), vnoise(sp + vec2(17.3, 9.1))) - 0.5;
    vec2 offPx = (-gn * 14.0 + f.xy * 8.0 + sh * 9.0 * rho) * m;
    off = offPx / uCss;
  }

  vec3 col = texture2D(uScene, suv + off).rgb;
  if (lensIn > 0.0) {
    // smoked, frosted glass: the helmet stays visible, the words stay legible
    vec2 k = 7.0 / uCss;
    vec3 blur = col * 0.2;
    blur += texture2D(uScene, suv + vec2(k.x, k.y)).rgb * 0.2;
    blur += texture2D(uScene, suv + vec2(-k.x, k.y)).rgb * 0.2;
    blur += texture2D(uScene, suv + vec2(k.x, -k.y)).rgb * 0.2;
    blur += texture2D(uScene, suv + vec2(-k.x, -k.y)).rgb * 0.2;
    col = mix(col, blur * 0.3 + toDisplay(STAGE * 1.1) * 0.7, lensIn);
  }

  if (m > 0.001) {
    float g = length(gn);
    float band = smoothstep(0.3, 0.75, g) * (1.0 - 0.6 * smoothstep(0.9, 1.5, g));
    col += heatTint(rho * 1.3 + g * 0.45 + uTime * 0.03) * band * m * 0.065;
    // where the wake folds over, it catches the light like liquid chrome:
    // only the bright reflections show, so it glints rather than fogs
    float crest = smoothstep(0.45, 1.1, g) * m;
    if (crest > 0.002) {
      vec3 N = normalize(vec3(-gn * 1.3, 1.0));
      vec3 F0 = mix(SILVER, GOLD, clamp(gold, 0.0, 1.0));
      vec3 ch = toDisplay(chromeShade(roomPoint(uv), N, vec3(0.0, 0.0, 1.0), F0, 0.004, 0.25) * 1.35);
      float glint = smoothstep(0.5, 0.9, dot(ch, vec3(0.299, 0.587, 0.114)));
      col = mix(col, ch, crest * glint * mix(0.7, 0.35, onCard));
    }
  }

  col = mix(col, rimCol, rim) + fringe;
  col *= uFade;
  col += (hash12(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

function merge(segs) {
  if (!segs.length) return null;
  const a = segs[0];
  const b = segs[segs.length - 1];
  let dx = 0;
  let dy = 0;
  let amount = 0;
  let gold = 0;
  for (const s of segs) {
    dx += s.dx / segs.length;
    dy += s.dy / segs.length;
    amount = Math.max(amount, s.amount);
    gold = Math.max(gold, s.gold);
  }
  return { ax: a.ax, ay: a.ay, bx: b.bx, by: b.by, dx, dy, amount, gold };
}

function split(s, i, n) {
  const t0 = i / n;
  const t1 = (i + 1) / n;
  const x = (t) => s.ax + (s.bx - s.ax) * t;
  const y = (t) => s.ay + (s.by - s.ay) * t;
  return { ...s, ax: x(t0), ay: y(t0), bx: x(t1), by: y(t1) };
}

function fullScreenTriangle() {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  g.setAttribute('uv', new Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  return g;
}

// Heat haze over the whole hero: a small velocity + density field stamped by
// a lagging "head" that chases the cursor, advected and decayed at a fixed
// 60 Hz; then one full-screen pass that bends the finished frame with it.
// Reusable: it knows nothing about cards or helmets beyond the mask rects.
export function createHaze(renderer, room, { enabled = true } = {}) {
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const tri = fullScreenTriangle();
  const opts = { type: HalfFloatType, magFilter: LinearFilter, minFilter: LinearFilter, depthBuffer: false };
  let read = new WebGLRenderTarget(FIELD, FIELD, opts);
  let write = new WebGLRenderTarget(FIELD, FIELD, opts);

  const sim = new ShaderMaterial({
    uniforms: {
      uPrev: { value: null },
      uTexel: { value: new Vector2(1 / FIELD, 1 / FIELD) },
      uAspect: { value: 1 },
      uDecay: { value: new Vector3() },
      uSeg: { value: new Vector4() },
      uStamp: { value: new Vector4() },
      uRadius: { value: BRUSH },
    },
    vertexShader: VERT,
    fragmentShader: SIM,
    depthTest: false,
    depthWrite: false,
  });
  const simScene = new Scene().add(new Mesh(tri, sim));

  const uniforms = {
    ...room,
    uScene: { value: null },
    uField: { value: read.texture },
    uFieldTexel: { value: new Vector2(1 / FIELD, 1 / FIELD) },
    uCss: { value: new Vector2(1, 1) },
    uHazeOn: { value: 0 },
    uCards: { value: [new Vector4(), new Vector4(), new Vector4(), new Vector4()] },
    uWake: { value: new Vector4() },
    uHelmet: { value: new Vector3() },
    uPill: { value: new Vector4() },
    uLens: { value: new Vector4() },
    uTime: { value: 0 },
    uView: { value: new Vector3() },
    uFade: { value: 0 },
  };
  const post = new ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: POST, depthTest: false, depthWrite: false });
  const postScene = new Scene().add(new Mesh(tri, post));

  const head = { x: 0, y: 0, on: false };
  let pending = [];
  let acc = 0;
  let energy = 0;
  let active = false;
  let W = 1;
  let H = 1;

  function clear() {
    for (const rt of [read, write]) {
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, false, false);
    }
    renderer.setRenderTarget(null);
  }

  function stepSim(seg) {
    const u = sim.uniforms;
    u.uPrev.value = read.texture;
    if (seg) {
      u.uSeg.value.set(seg.ax / W, 1 - seg.ay / H, seg.bx / W, 1 - seg.by / H);
      u.uStamp.value.set(seg.dx, -seg.dy, seg.amount, seg.gold);
    } else {
      u.uStamp.value.set(0, 0, 0, 0);
    }
    renderer.setRenderTarget(write);
    renderer.render(simScene, camera);
    [read, write] = [write, read];
  }

  return {
    get active() {
      return active;
    },
    resize(w, h) {
      W = w;
      H = h;
      const aspect = w / h;
      const fw = aspect >= 1 ? FIELD : Math.round(FIELD * aspect);
      const fh = aspect >= 1 ? Math.round(FIELD / aspect) : FIELD;
      read.setSize(fw, fh);
      write.setSize(fw, fh);
      sim.uniforms.uTexel.value.set(1 / fw, 1 / fh);
      sim.uniforms.uAspect.value = aspect;
      uniforms.uFieldTexel.value.set(1 / fw, 1 / fh);
      uniforms.uCss.value.set(w, h);
      clear();
      energy = 0;
      active = false;
    },
    // pointer: CSS px, y down. gold: the stroke is a flick at the limiter.
    feed(pointer, dt, gold) {
      if (!enabled) return;
      if (!pointer.inside) {
        head.on = false;
        return;
      }
      if (!head.on) {
        head.x = pointer.x;
        head.y = pointer.y;
        head.on = true;
        return;
      }
      const k = 1 - Math.pow(1 - FOLLOW, dt * 60);
      const nx = head.x + (pointer.x - head.x) * k;
      const ny = head.y + (pointer.y - head.y) * k;
      const dx = nx - head.x;
      const dy = ny - head.y;
      const len = Math.hypot(dx, dy);
      const speed = len / Math.max(dt, 1e-3);
      if (speed > MIN_SPEED) {
        // concave: a slow drift already shimmers, a flick saturates
        const amount = 0.62 * Math.pow(Math.min(1, (speed - MIN_SPEED) / 1400), 0.55);
        const s = Math.min(1, speed / 1100) / len;
        pending.push({ ax: head.x, ay: head.y, bx: nx, by: ny, dx: dx * s, dy: dy * s, amount, gold: gold ? 1 : 0 });
        energy = Math.max(energy, amount);
        active = true;
      }
      head.x = nx;
      head.y = ny;
    },
    // Advance the field; returns whether it still has anything visible.
    update(dt) {
      if (!active) return false;
      acc += dt;
      const steps = Math.min(3, Math.floor(acc * SIM_HZ));
      acc = Math.min(acc - steps / SIM_HZ, 1 / SIM_HZ);
      if (steps > 0) {
        sim.uniforms.uDecay.value.set(DRIFT_DECAY, DECAY, 0.9);
        const seg = merge(pending);
        pending = [];
        // one stroke per frame, split across its sim steps so slow frames stay smooth
        for (let i = 0; i < steps; i++) stepSim(seg && split(seg, i, steps));
        energy *= Math.pow(DECAY, steps);
        renderer.setRenderTarget(null);
        uniforms.uField.value = read.texture;
      }
      if (energy < 0.004 && !pending.length) {
        active = false;
        clear();
      }
      return active;
    },
    render(sceneTexture, time) {
      uniforms.uScene.value = sceneTexture;
      uniforms.uHazeOn.value = active ? 1 : 0;
      uniforms.uTime.value = time;
      renderer.setRenderTarget(null);
      renderer.render(postScene, camera);
    },
    uniforms,
    scene: postScene,
    camera,
  };
}
