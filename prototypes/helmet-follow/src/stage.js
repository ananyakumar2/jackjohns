import { LinearFilter, Matrix4, Mesh, PerspectiveCamera, PlaneGeometry, ShaderMaterial, Vector2, WebGLRenderTarget } from 'three';
import { DISPLAY_GLSL, PALETTE_GLSL } from './palette.js';
import { WALL_Z } from './layout.js';

export const REFLECT_LAYER = 1;
const REFLECT_SCALE = 1 / 6;

const NOISE_GLSL = /* glsl */ `
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
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return s;
}
`;

const VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// A night pit garage reduced to what light does in it: a blue-black back wall
// with a cool pool of light behind the helmet, the colour of whichever card is
// awake spilling onto the wall, and a faint wet-tarmac floor.
export function createStage(view, exposure) {
  const spill = {
    uSpillTex: { value: null },
    uSpillPos: { value: new Vector2() },
    uSpillAmt: { value: 0 },
  };
  const common = { uExposure: exposure, uFloorY: { value: -2.25 }, ...spill };

  const wall = new Mesh(
    new PlaneGeometry(1, 1),
    new ShaderMaterial({
      uniforms: common,
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        ${PALETTE_GLSL}
        ${DISPLAY_GLSL}
        uniform float uExposure;
        uniform float uFloorY;
        uniform sampler2D uSpillTex;
        uniform vec2 uSpillPos;
        uniform float uSpillAmt;
        varying vec3 vWorld;
        void main() {
          vec2 w = vWorld.xy;
          vec3 col = STAGE;
          vec2 r = (w - vec2(0.0, 0.5)) / vec2(4.2, 3.3);
          col += STAGE_LIFT * exp(-dot(r, r) * 1.6);
          col *= mix(1.0, 0.7, smoothstep(0.5, 5.5, w.y));
          col += STAGE_LIFT * 0.45 * exp(-pow((w.y - uFloorY) / 0.9, 2.0));
          if (uSpillAmt > 0.001) {
            vec3 avg = dispDecode(textureLod(uSpillTex, vec2(0.5), 9.0).rgb);
            vec2 s = (w - uSpillPos) / vec2(4.6, 3.4);
            col += avg * 0.05 * uSpillAmt * exp(-dot(s, s) * 2.2);
          }
          gl_FragColor = vec4(toDisplay(col * uExposure), 1.0);
        }
      `,
      depthWrite: false,
    }),
  );
  wall.renderOrder = -2;

  const reflRT = new WebGLRenderTarget(8, 8, { magFilter: LinearFilter, minFilter: LinearFilter });
  const reflMatrix = new Matrix4();
  const floorUniforms = {
    ...common,
    uRefl: { value: reflRT.texture },
    uReflMatrix: { value: reflMatrix },
    uReflTexel: { value: new Vector2(1 / 8, 1 / 8) },
  };
  const floor = new Mesh(
    new PlaneGeometry(1, 1),
    new ShaderMaterial({
      uniforms: floorUniforms,
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        ${PALETTE_GLSL}
        ${DISPLAY_GLSL}
        ${NOISE_GLSL}
        uniform float uExposure;
        uniform sampler2D uRefl;
        uniform mat4 uReflMatrix;
        uniform vec2 uReflTexel;
        uniform sampler2D uSpillTex;
        uniform vec2 uSpillPos;
        uniform float uSpillAmt;
        varying vec3 vWorld;
        void main() {
          vec3 V = normalize(cameraPosition - vWorld);
          float F = 0.04 + 0.96 * pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);
          vec2 xz = vWorld.xz;

          // standing water in patches; the rest is damp, rougher tarmac
          float wet = smoothstep(0.42, 0.7, fbm(xz * vec2(0.32, 0.5) + vec2(3.1, 7.7)));
          float g = vnoise(xz * 42.0);
          float gFade = 1.0 - smoothstep(0.15, 0.6, fwidth(xz.x * 42.0) + fwidth(xz.y * 42.0));

          vec4 rp = uReflMatrix * vec4(vWorld, 1.0);
          vec2 ruv = rp.xy / rp.w;
          ruv.x += (vnoise(xz * vec2(2.0, 6.0)) - 0.5) * mix(0.012, 0.003, wet);
          // wet tarmac stretches reflections towards the viewer
          float smear = mix(2.2, 0.9, wet);
          float jit = hash12(gl_FragCoord.xy);
          vec3 refl = vec3(0.0);
          float wsum = 0.0;
          for (int i = 0; i < 8; i++) {
            float fi = float(i) + jit;
            float wt = exp(-fi * 0.4);
            vec2 o = vec2((hash12(gl_FragCoord.yx + fi) - 0.5) * 1.5 * uReflTexel.x, fi * uReflTexel.y * smear);
            refl += dispDecode(texture2D(uRefl, ruv + o).rgb) * wt;
            wsum += wt;
          }
          refl /= wsum;

          vec3 col = STAGE * 0.55 * (1.0 + (g - 0.5) * 0.35 * gFade * (1.0 - wet));
          vec2 pool = (xz - vec2(0.0, 0.8)) / vec2(5.5, 4.0);
          col += STAGE_LIFT * 0.5 * exp(-dot(pool, pool) * 2.0);
          col += refl * mix(0.22, 0.75, wet) * F;
          if (uSpillAmt > 0.001) {
            vec3 avg = dispDecode(textureLod(uSpillTex, vec2(0.5), 9.0).rgb);
            vec2 s = (xz - vec2(uSpillPos.x, -1.6)) / vec2(4.0, 3.0);
            col += avg * 0.02 * uSpillAmt * exp(-dot(s, s) * 2.0) * (0.4 + wet);
          }
          // fade into the wall so the junction reads as distance, not an edge
          col = mix(col, STAGE * 0.9, smoothstep(${(WALL_Z + 2.5).toFixed(2)}, ${WALL_Z.toFixed(2)}, vWorld.z) * 0.85);
          gl_FragColor = vec4(toDisplay(col * uExposure), 1.0);
        }
      `,
      depthWrite: true,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.renderOrder = -1;

  const mirror = new PerspectiveCamera();
  mirror.matrixAutoUpdate = false;
  mirror.matrixWorldAutoUpdate = false;
  mirror.layers.set(REFLECT_LAYER);
  const flip = new Matrix4();
  const bias = new Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

  return {
    meshes: [wall, floor],
    spill,
    reflRT,
    layout(layout, camera) {
      const y = layout.floorY;
      common.uFloorY.value = y;
      const h = view.halfH(WALL_Z) * 1.1;
      wall.scale.set(h * 2 * view.aspect * 1.2, h * 2.4, 1);
      wall.position.set(0, 0, WALL_Z);
      const depth = camera.position.z + 2 - WALL_Z;
      floor.scale.set(view.halfH(0) * view.aspect * 6, depth, 1);
      floor.position.set(0, y, WALL_Z + depth / 2);
    },
    resize(w, h) {
      const rw = Math.max(16, Math.round(w * REFLECT_SCALE));
      const rh = Math.max(16, Math.round(h * REFLECT_SCALE));
      reflRT.setSize(rw, rh);
      floorUniforms.uReflTexel.value.set(1 / rw, 1 / rh);
    },
    // Mirror the camera in the floor and render just the reflecting layer.
    reflect(renderer, scene, camera, front) {
      const y = common.uFloorY.value;
      flip.set(1, 0, 0, 0, 0, -1, 0, 2 * y, 0, 0, 1, 0, 0, 0, 0, 1);
      mirror.projectionMatrix.copy(camera.projectionMatrix);
      mirror.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
      mirror.matrixWorld.multiplyMatrices(flip, camera.matrixWorld);
      mirror.matrixWorldInverse.copy(mirror.matrixWorld).invert();
      reflMatrix.multiplyMatrices(bias, mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);
      renderer.setRenderTarget(reflRT);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, false);
      renderer.render(scene, mirror);
      if (front) renderer.render(front, mirror);
    },
  };
}

