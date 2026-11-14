import { Vector3, Vector4 } from 'three';

// The visor (and the shell's clear coat) reflect a virtual room around the
// helmet. Every face of the room is split along x = 0 and y = 0, and each part
// shows the clip of the page quadrant in that direction, so the helmet looking
// into the top-left corner sees mostly the top-left clip. Each pixel traces its
// own reflected ray into the room analytically: no cube camera, no extra
// passes, no resolution limit, and the reflection is computed from this
// frame's visor normal, so it can't lag the head.
//
// Slots: 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right.

export const ROOM_LY = 6;
export const ROOM_DEPTH = 0.9; // Lz = ROOM_DEPTH * Ly
export const REST_LEVEL = 0.12;

// Softboxes as [face, minA, minB, maxA, maxB, intensity] in units of the room
// half extents. Faces: 0 ceiling (a = x, b = z), 1 right wall (a = z, b = y),
// 2 left wall (a = z, b = y). They give the visor and the clear coat their
// highlight lines, which sweep across them when the head turns.
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
  };
}

const softboxGLSL = SOFTBOXES.map(
  ([face, a0, b0, a1, b1, k]) =>
    `if (face == ${face}) e += ${k.toFixed(3)} * softRect(fa, vec4(${a0.toFixed(3)}, ${b0.toFixed(3)}, ${a1.toFixed(3)}, ${b1.toFixed(3)}), soft);`,
).join('\n    ');

export const ROOM_GLSL = /* glsl */ `
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

vec3 roomDecode(vec3 c) {
  return mix(c * 0.0773993808, pow(c * 0.9478672986 + 0.0521327014, vec3(2.4)), step(0.04045, c));
}

float roomPick(vec4 v, int q) {
  return q == 0 ? v.x : q == 1 ? v.y : q == 2 ? v.z : v.w;
}

// Explicit LOD everywhere: the slot is chosen per pixel, so implicit derivatives
// would be undefined, and across a wall edge they'd blow up into a seam.
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

// Radiance seen from p (inside the room) along unit direction d.
// spread: angular size of one screen pixel along d (radians), for filtering.
// blur: extra mip bias for rougher surfaces. strip: how bright the softboxes read.
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
  vec2 panel = vec2(1.0);
  float edge = 0.0;
  float cosI = 1.0;
  int face = -1;
  vec2 fa = vec2(0.0);

  if (tF.z <= tF.x && tF.z <= tF.y) {
    cosI = abs(d.z);
    if (h.z > 0.0) {
      // the wall behind the viewer: the page itself, seen from the helmet
      q = (h.x < 0.0 ? 0 : 1) + (h.y > 0.0 ? 0 : 2);
      st = vec2((h.x < 0.0 ? -h.x : L.x - h.x) / L.x, (h.y > 0.0 ? h.y : h.y + L.y) / L.y);
      panel = vec2(L.x, L.y);
      edge = min(min(abs(h.x), abs(h.y)), min(L.x - abs(h.x), L.y - abs(h.y)));
    }
  } else if (tF.x <= tF.y) {
    cosI = abs(d.x);
    if (h.x < 0.0) {
      q = h.y > 0.0 ? 0 : 2;
      st.x = (L.z - h.z) / (2.0 * L.z);
      face = 2;
    } else {
      q = h.y > 0.0 ? 1 : 3;
      st.x = (h.z + L.z) / (2.0 * L.z);
      face = 1;
    }
    st.y = (h.y > 0.0 ? h.y : h.y + L.y) / L.y;
    panel = vec2(2.0 * L.z, L.y);
    edge = min(min(abs(h.y), L.y - abs(h.y)), L.z - abs(h.z));
    fa = vec2(h.z / L.z, h.y / L.y);
  } else {
    cosI = abs(d.y);
    st.x = (h.x < 0.0 ? -h.x : L.x - h.x) / L.x;
    if (h.y > 0.0) {
      q = h.x < 0.0 ? 0 : 1;
      st.y = (L.z - h.z) / (2.0 * L.z);
      face = 0;
    } else {
      q = h.x < 0.0 ? 2 : 3;
      st.y = (h.z + L.z) / (2.0 * L.z);
    }
    panel = vec2(L.x, 2.0 * L.z);
    edge = min(min(abs(h.x), L.x - abs(h.x)), L.z - abs(h.z));
    fa = vec2(h.x / L.x, h.z / L.z);
  }

  // world-space size of this pixel's footprint where it lands on the wall
  float foot = spread * t / max(cosI, 0.12);

  vec3 c = vec3(0.0035);
  if (q >= 0) {
    float sx;
    vec2 uv = clipCover(q, st, panel.x / panel.y, sx);
    float texels = foot * roomPick(uClipWidth, q) * sx / panel.x;
    float lod = log2(max(texels, 1.0)) + blur;
    c = clipSample(q, uv, lod) * roomPick(uLevel, q);
    // dark mullions between the panels, filtered by the footprint
    float gap = 0.035 * L.y;
    c *= smoothstep(gap - foot, gap + foot, edge);
  }

  float e = 0.0;
  if (face >= 0) {
    float soft = 0.02 + foot / L.y + blur * 0.02;
    ${softboxGLSL}
  }
  return c + vec3(e * strip);
}
`;
