import { Matrix3, Vector3, Vector4 } from 'three';
import { PALETTE_GLSL } from './palette.js';

// Everything reflective on the page (visor, clear coat, chrome trim, card
// frames, LED bezels, the Book pill, the haze crest) reflects one analytic
// room around the helmet: a dark garage in Jack's blue, three strip lights,
// and the four cards hung where the helmet can see them. Each pixel traces its
// own reflected ray into the room, so nothing lags and nothing needs a cube
// camera. The front wall carries the page's own layout (each card mirrored, as
// a reflection should be); the side walls and ceiling carry a card in the
// direction of each corner, so the helmet looking into a corner sees that card.
//
// Slots: 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right.

export const ROOM_LY = 6;
export const ROOM_DEPTH = 0.9; // Lz = ROOM_DEPTH * Ly
export const REST_LEVEL = 0.12;

// Strip lights as [face, minA, minB, maxA, maxB, intensity] in units of the
// room half extents. Faces: 0 ceiling (a = x, b = z), 1 right wall (a = z,
// b = y), 2 left wall (a = z, b = y).
export const SOFTBOXES = [
  [0, -0.72, 0.34, 0.72, 0.56, 5.0],
  [1, 0.18, -0.55, 0.42, 0.82, 3.2],
  [2, -0.55, -0.35, -0.32, 0.7, 1.4],
];

export function createRoomUniforms() {
  return {
    uClip0: { value: null },
    uClip1: { value: null },
    uClip2: { value: null },
    uClip3: { value: null },
    uClipAspect: { value: new Vector4(16 / 9, 16 / 9, 16 / 9, 16 / 9) },
    uClipWidth: { value: new Vector4(1280, 1280, 1280, 1280) },
    uFocusX: { value: new Vector4(0.5, 0.5, 0.5, 0.5) },
    uFocusY: { value: new Vector4(0.5, 0.5, 0.5, 0.5) },
    uLevel: { value: new Vector4(REST_LEVEL, REST_LEVEL, REST_LEVEL, REST_LEVEL) },
    uRoom: { value: new Vector3(ROOM_LY * (16 / 9), ROOM_LY, ROOM_LY * ROOM_DEPTH) },
    uCardRect: { value: [new Vector4(), new Vector4(), new Vector4(), new Vector4()] },
    uChromeRot: { value: new Matrix3() },
  };
}

const softboxGLSL = SOFTBOXES.map(
  ([face, a0, b0, a1, b1, k]) =>
    `if (face == ${face}) e += ${k.toFixed(3)} * softRect(fa, vec4(${a0.toFixed(3)}, ${b0.toFixed(3)}, ${a1.toFixed(3)}, ${b1.toFixed(3)}), soft);`,
).join('\n    ');

export const ROOM_GLSL = /* glsl */ `
${PALETTE_GLSL}
uniform sampler2D uClip0;
uniform sampler2D uClip1;
uniform sampler2D uClip2;
uniform sampler2D uClip3;
uniform vec4 uClipAspect;
uniform vec4 uClipWidth;
uniform vec4 uFocusX;
uniform vec4 uFocusY;
uniform vec4 uLevel;
uniform vec3 uRoom;
uniform vec4 uCardRect[4];
uniform mat3 uChromeRot;

vec3 roomDecode(vec3 c) {
  return mix(c * 0.0773993808, pow(c * 0.9478672986 + 0.0521327014, vec3(2.4)), step(0.04045, c));
}

float roomPick(vec4 v, int q) {
  return q == 0 ? v.x : q == 1 ? v.y : q == 2 ? v.z : v.w;
}

// Explicit LOD everywhere: the slot is chosen per pixel, so implicit derivatives
// would be undefined, and across a card edge they'd blow up into a seam.
vec3 clipSample(int q, vec2 uv, float lod) {
  vec3 c;
  if (q == 0) c = textureLod(uClip0, uv, lod).rgb;
  else if (q == 1) c = textureLod(uClip1, uv, lod).rgb;
  else if (q == 2) c = textureLod(uClip2, uv, lod).rgb;
  else c = textureLod(uClip3, uv, lod).rgb;
  return roomDecode(c);
}

// Cover-fit panel coordinates st (0..1, y up) into the clip. scaleX is the
// fraction of the clip's width that spans the panel.
vec2 clipCover(int q, vec2 st, float panelAspect, out float scaleX) {
  float ca = roomPick(uClipAspect, q);
  vec2 s = panelAspect > ca ? vec2(1.0, ca / panelAspect) : vec2(panelAspect / ca, 1.0);
  vec2 f = vec2(roomPick(uFocusX, q), roomPick(uFocusY, q));
  vec2 c = clamp(f, s * 0.5, 1.0 - s * 0.5);
  scaleX = s.x;
  return c + (st - 0.5) * s;
}

float softRect(vec2 p, vec4 r, float soft) {
  vec2 d = max(r.xy - p, p - r.zw);
  return 1.0 - smoothstep(-soft, soft, max(d.x, d.y));
}

// A card as the room shows it: desaturated and dim at rest, full colour awake,
// with a thin bright frame where its chrome bezel would catch the light.
vec3 roomCard(int q, vec2 st, vec2 size, float foot, float blur) {
  float level = roomPick(uLevel, q);
  float frame = 0.012 * max(size.x, size.y);
  vec2 inner = min(st, 1.0 - st) * size;
  float din = min(inner.x, inner.y);
  vec3 c = vec3(0.0);
  if (din > 0.0) {
    float sx;
    vec2 uv = clipCover(q, vec2(1.0 - st.x, st.y), size.x / size.y, sx);
    float texels = foot * roomPick(uClipWidth, q) * sx / size.x;
    c = clipSample(q, uv, log2(max(texels, 1.0)) + blur);
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l) * vec3(0.8, 0.88, 1.0), c, smoothstep(0.15, 0.9, level)) * level;
  }
  float rim = 1.0 - smoothstep(frame - foot, frame + foot, abs(din));
  return mix(c, vec3(0.05 + 0.25 * level), rim * 0.85);
}

// Radiance seen from p (inside the room) along unit direction d.
// spread: angular size of one screen pixel along d (radians), for filtering.
// blur: extra mip bias for rougher surfaces. strip: how bright the lights read.
vec3 roomRadiance(vec3 p, vec3 d, float spread, float blur, float strip) {
  vec3 L = uRoom;
  vec3 dd = d + vec3(equal(d, vec3(0.0))) * 1e-6;
  vec3 tA = (L - p) / dd;
  vec3 tB = (-L - p) / dd;
  vec3 tF = max(tA, tB);
  float t = min(min(tF.x, tF.y), tF.z);
  vec3 h = p + d * t;

  int q = -1;
  vec2 st = vec2(0.0);
  vec2 size = vec2(1.0);
  float cosI = 1.0;
  int face = -1;
  vec2 fa = vec2(0.0);
  float shade = 1.0;

  if (tF.z <= tF.x && tF.z <= tF.y) {
    cosI = abs(d.z);
    if (h.z > 0.0) {
      // the page itself, as the helmet sees it
      vec2 P = vec2(0.5 + h.x / (2.0 * L.x), 0.5 + h.y / (2.0 * L.y));
      for (int k = 0; k < 4; k++) {
        vec4 r = uCardRect[k];
        vec2 a = (P - r.xy) / (r.zw - r.xy);
        if (a.x >= -0.02 && a.x <= 1.02 && a.y >= -0.03 && a.y <= 1.03) {
          q = k;
          st = a;
          size = (r.zw - r.xy) * 2.0 * L.xy;
        }
      }
    } else {
      shade = 0.7;
    }
  } else if (tF.x <= tF.y) {
    cosI = abs(d.x);
    float sx;
    if (h.x < 0.0) {
      q = h.y > 0.0 ? 0 : 2;
      sx = (L.z - h.z) / (2.0 * L.z);
      face = 2;
    } else {
      q = h.y > 0.0 ? 1 : 3;
      sx = (h.z + L.z) / (2.0 * L.z);
      face = 1;
    }
    float sy = (h.y > 0.0 ? h.y : h.y + L.y) / L.y;
    st = (vec2(sx, sy) - vec2(0.1, 0.16)) / vec2(0.8, 0.68);
    size = vec2(2.0 * L.z * 0.8, L.y * 0.68);
    fa = vec2(h.z / L.z, h.y / L.y);
  } else {
    cosI = abs(d.y);
    if (h.y > 0.0) {
      q = h.x < 0.0 ? 0 : 1;
      float sx = (h.x < 0.0 ? -h.x : L.x - h.x) / L.x;
      float sy = (L.z - h.z) / (2.0 * L.z);
      st = (vec2(sx, sy) - vec2(0.12, 0.14)) / vec2(0.76, 0.6);
      size = vec2(L.x * 0.76, 2.0 * L.z * 0.6);
      face = 0;
      fa = vec2(h.x / L.x, h.z / L.z);
    } else {
      shade = 0.45; // the floor: dark wet tarmac
    }
  }

  float foot = spread * t / max(cosI, 0.12);

  vec3 c = STAGE * 1.4 * shade;
  if (q >= 0 && st.x > -0.03 && st.x < 1.03 && st.y > -0.03 && st.y < 1.03) {
    c = roomCard(q, st, size, foot, blur);
  }

  float e = 0.0;
  if (face >= 0) {
    float soft = 0.02 + foot / L.y + blur * 0.02;
    ${softboxGLSL}
  }
  return c + vec3(0.9, 0.95, 1.0) * (e * strip);
}

// Chrome: a near-white metal reflecting the room, plus the studio horizon that
// makes chrome read as chrome (lit above, a dark band at the horizon, the wet
// floor below). uChromeRot follows the helmet a little, so even the chrome on
// things that never move slides when the helmet turns.
vec3 chromeEnv(vec3 p, vec3 R, float spread, float blur) {
  vec3 r = uChromeRot * R;
  vec3 env = roomRadiance(p, r, spread, blur, 1.0);
  float up = r.y;
  env += vec3(0.24, 0.27, 0.33) * smoothstep(0.08, 0.6, up);
  env += vec3(0.55, 0.6, 0.68) * exp(-pow((up - 0.16) / 0.05, 2.0)) * 0.55;
  env += STAGE_LIFT * 2.0 * smoothstep(-0.05, -0.5, up);
  return env;
}

vec3 chromeShade(vec3 p, vec3 N, vec3 V, vec3 F0, float spread, float blur) {
  vec3 R = reflect(-V, N);
  float f = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
  return (F0 + (1.0 - F0) * f) * chromeEnv(p, R, spread, blur);
}
`;
