// Jack's colours, derived from his car rather than from motorsport habit: a
// blue Supra wearing silver- or gold-chrome livery on silver-chrome wheels.
// Chrome is the signature, blue the anchor in small doses, gold only when the
// engine is at the limiter. The stage is his blue in deep shade, not black.
//
// Linear RGB for shaders; the CSS values are the same colours for the DOM.

export const PALETTE = {
  stage: [0.0046, 0.0055, 0.0082],
  stageLift: [0.0058, 0.0082, 0.0155],
  blue: [0.03, 0.2, 1.0],
  blueCore: [0.62, 0.82, 1.0],
  silver: [0.9, 0.92, 0.95],
  gold: [1.0, 0.77, 0.36],
  goldCore: [1.0, 0.94, 0.76],
  type: [0.58, 0.63, 0.7],
  ink: [0.006, 0.014, 0.04],
};

export const CSS = {
  stage: '#10131a',
  type: '#c6ced9',
  typeDim: 'rgba(198, 206, 217, 0.62)',
  blue: '#3f7bff',
  ink: '#0c1a33',
};

const vec3 = (a) => `vec3(${a.map((n) => n.toFixed(4)).join(', ')})`;

export const PALETTE_GLSL = /* glsl */ `
const vec3 STAGE = ${vec3(PALETTE.stage)};
const vec3 STAGE_LIFT = ${vec3(PALETTE.stageLift)};
const vec3 JACK_BLUE = ${vec3(PALETTE.blue)};
const vec3 BLUE_CORE = ${vec3(PALETTE.blueCore)};
const vec3 SILVER = ${vec3(PALETTE.silver)};
const vec3 GOLD = ${vec3(PALETTE.gold)};
const vec3 GOLD_CORE = ${vec3(PALETTE.goldCore)};
const vec3 TYPE = ${vec3(PALETTE.type)};
const vec3 INK = ${vec3(PALETTE.ink)};
`;

// Everything renders into an 8-bit target that already holds display values,
// so the post pass can bend it without a float buffer. Each material therefore
// tone-maps and encodes for itself (three's own Neutral curve, sRGB OETF).
export const DISPLAY_GLSL = /* glsl */ `
vec3 dispTone(vec3 color) {
  const float start = 0.76;
  const float desat = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < start) return color;
  float d = 1.0 - start;
  float newPeak = 1.0 - d * d / (peak + d - start);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desat * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}
vec3 dispEncode(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, pow(c, vec3(0.41666)) * 1.055 - 0.055, step(0.0031308, c));
}
vec3 dispDecode(vec3 c) {
  return mix(c * 0.0773993808, pow(c * 0.9478672986 + 0.0521327014, vec3(2.4)), step(0.04045, c));
}
vec3 toDisplay(vec3 c) {
  return dispEncode(dispTone(max(c, 0.0)));
}
`;

// For three's built-in materials (the helmet): same output convention.
export function patchDisplay(material, exposure) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer);
    shader.uniforms.uExposure = exposure;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uExposure;\n${DISPLAY_GLSL}`)
      .replace('#include <colorspace_fragment>', 'gl_FragColor.rgb = toDisplay(gl_FragColor.rgb * uExposure);');
  };
}
