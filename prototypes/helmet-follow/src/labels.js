import { CanvasTexture, LinearFilter, Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector3, Vector4 } from 'three';

export const FONT_FAMILY = '"Archivo Expanded"';
export const TYPE = { size: 11.5, tracking: 0.18, weight: 600 };
const SS = 4; // atlas supersampling

// Words are drawn into the canvas, not just laid over it, so the heat haze
// bends them along with everything else (Colombel's trick). Transparent DOM
// text sits on top for selection, find-in-page and screen readers.
export async function createTextAtlas(words) {
  await document.fonts.load(`${TYPE.weight} ${TYPE.size}px ${FONT_FAMILY}`).catch(() => {});
  const px = TYPE.size * SS;
  const font = `${TYPE.weight} ${px}px ${FONT_FAMILY}, sans-serif`;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  const track = TYPE.tracking * px;
  const lineH = Math.ceil(px * 1.5);
  const measure = (s) => [...s].reduce((w, ch) => w + ctx.measureText(ch).width + track, -track);
  const widths = words.map((w) => Math.ceil(measure(w.toUpperCase())) + 8);
  canvas.width = Math.max(...widths);
  canvas.height = lineH * words.length;
  ctx.font = font;
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  const entries = {};
  words.forEach((word, i) => {
    let x = 4;
    const y = i * lineH + lineH / 2;
    for (const ch of word.toUpperCase()) {
      ctx.fillText(ch, x, y);
      x += ctx.measureText(ch).width + track;
    }
    const top = i * lineH;
    entries[word] = {
      uv: new Vector4(0, 1 - (top + lineH) / canvas.height, widths[i] / canvas.width, 1 - top / canvas.height),
      w: widths[i] / SS,
      h: lineH / SS,
    };
  });
  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  return { texture, entries };
}

// Pillar names, in screen space, drawn after the 3D scene.
export function createNames(atlas, names, colour, exposure) {
  const scene = new Scene();
  const camera = new OrthographicCamera(0, 1, 0, -1, -1, 1);
  const items = names.map((name) => {
    const e = atlas.entries[name];
    const uniforms = {
      uAtlas: { value: atlas.texture },
      uRect: { value: e.uv },
      uColor: { value: new Vector3(...colour) },
      uOn: { value: 0 },
      uGlint: { value: -1 },
      uExposure: exposure,
    };
    const mesh = new Mesh(
      new PlaneGeometry(1, 1),
      new ShaderMaterial({
        uniforms,
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: /* glsl */ `
          uniform sampler2D uAtlas;
          uniform vec4 uRect;
          uniform vec3 uColor;
          uniform float uOn;
          uniform float uGlint;
          uniform float uExposure;
          varying vec2 vUv;
          void main() {
            float a = texture2D(uAtlas, mix(uRect.xy, uRect.zw, vUv)).a;
            // a band of light runs across the letters as the card wakes, like a badge catching it
            float g = exp(-pow((vUv.x - uGlint) * 5.0, 2.0)) * step(-0.5, uGlint);
            vec3 c = uColor * (0.66 + 0.34 * uOn) + vec3(0.3, 0.32, 0.36) * g;
            gl_FragColor = vec4(c, a * uExposure);
          }
        `,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    scene.add(mesh);
    return { name, mesh, uniforms, w: e.w, h: e.h, glintAt: -1e9, on: 0 };
  });

  return {
    scene,
    camera,
    items,
    layout(view, layout) {
      camera.right = view.W;
      camera.bottom = -view.H;
      camera.updateProjectionMatrix();
      items.forEach((it, i) => {
        const n = layout.names[i];
        const x = n.align === 'right' ? n.x - it.w / 2 + 4 : n.x + it.w / 2 - 4;
        const y = n.base === 'bottom' ? n.y - it.h / 2 : n.y + it.h / 2;
        it.mesh.scale.set(it.w, it.h, 1);
        it.mesh.position.set(Math.round(x), -Math.round(y), 0);
        it.box = { x: x - it.w / 2, y: y - it.h / 2, w: it.w, h: it.h };
      });
    },
    update(dt, now, active) {
      let busy = false;
      items.forEach((it, i) => {
        const target = i === active ? 1 : 0;
        if (target && it.on < 0.5 && now - it.glintAt > 900) it.glintAt = now;
        const k = 1 - Math.pow(1 - 0.12, dt * 60);
        it.on += (target - it.on) * k;
        if (Math.abs(target - it.on) < 1e-3) it.on = target;
        else busy = true;
        const g = (now - it.glintAt) / 650;
        it.uniforms.uGlint.value = g >= 0 && g <= 1 ? -0.2 + g * 1.4 : -1;
        if (g >= 0 && g <= 1) busy = true;
        it.uniforms.uOn.value = it.on;
      });
      return busy;
    },
  };
}
