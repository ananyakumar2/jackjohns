import { BufferGeometry, Float32BufferAttribute, Mesh, OrthographicCamera, Scene, ShaderMaterial, Vector2 } from 'three';
import { ROOM_GLSL } from './room.js';

// The four clips, drawn straight into the canvas as one full-screen triangle.
// Same textures and brightness uniforms as the visor reflection.
export function createQuadPass(roomUniforms) {
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));

  const uniforms = {
    ...roomUniforms,
    uResolution: { value: new Vector2(1, 1) },
    uGap: { value: 1 },
    uSeat: { value: new Vector2(0, 0) },
    uSeatRadius: { value: 0.2 },
    uSeatAmount: { value: 0 },
  };

  const material = new ShaderMaterial({
    uniforms,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = position.xy * 0.5 + 0.5;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${ROOM_GLSL}
      uniform vec2 uResolution;
      uniform float uGap;
      uniform vec2 uSeat;
      uniform float uSeatRadius;
      uniform float uSeatAmount;
      varying vec2 vUv;

      void main() {
        int q = (vUv.x < 0.5 ? 0 : 1) + (vUv.y > 0.5 ? 0 : 2);
        vec2 st = fract(vUv * 2.0);
        vec2 half_ = uResolution * 0.5;
        float sx;
        vec2 uv = clipCover(q, st, half_.x / half_.y, sx);
        float texels = roomPick(uClipWidth, q) * sx / half_.x;
        vec3 c = clipSample(q, uv, max(log2(texels) - 0.25, 0.0)) * roomPick(uLevel, q);

        vec2 px = (vUv - 0.5) * uResolution;
        float gutter = min(abs(px.x), abs(px.y));
        c *= smoothstep(uGap - 0.5, uGap + 0.5, gutter);

        // a soft pool of shade under the helmet so it sits in the frame
        float r = length((vUv - 0.5 - uSeat) * vec2(uResolution.x / uResolution.y, 1.0)) / uSeatRadius;
        c *= 1.0 - uSeatAmount * exp(-r * r);

        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });

  const mesh = new Mesh(geo, material);
  mesh.frustumCulled = false;
  const scene = new Scene();
  scene.add(mesh);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  return {
    scene,
    camera,
    uniforms,
    resize(w, h, dpr) {
      uniforms.uResolution.value.set(w * dpr, h * dpr);
      uniforms.uGap.value = Math.max(1, dpr);
    },
  };
}
