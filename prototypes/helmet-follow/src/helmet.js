import {
  BackSide,
  BoxGeometry,
  Color,
  DoubleSide,
  Group,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { ROOM_GLSL, ROOM_LY, ROOM_DEPTH, SOFTBOXES } from './room.js';
import { DISPLAY_GLSL, PALETTE, patchDisplay } from './palette.js';

// Helmet-space anchors (the build centres the shell at the origin, visor on +z).
const NECK_PIVOT = new Vector3(0, -0.95, -0.35);
const LOGO_CENTRE = new Vector2(0, -0.22);
// The source model is posed chin-up; this levels it so the neutral pose looks straight out.
const REST_PITCH = MathUtils.degToRad(24);
export const HELMET_SCALE = 1.0;
export const HELMET_RADIUS = 1.3 * HELMET_SCALE;

let ktx2;

function loaders(renderer) {
  if (!ktx2) {
    ktx2 = new KTX2Loader().setWorkerLimit(2).detectSupport(renderer);
  }
  const gltf = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  return { gltf, ktx2 };
}

// Livery can be KTX2 (preferred) or any image the browser decodes; the choice
// is made from the file extension in content.json.
function loadTexture(url, renderer) {
  if (/\.ktx2(\?|$)/i.test(url)) return loaders(renderer).ktx2.loadAsync(url);
  return new TextureLoader().loadAsync(url).then((t) => {
    t.colorSpace = SRGBColorSpace;
    t.flipY = false; // glTF UVs have their origin top-left
    t.anisotropy = 4;
    return t;
  });
}

export async function loadHelmet(renderer, config, base, room, exposure) {
  const url = (p) => new URL(p, base).href;
  const { gltf: gltfLoader } = loaders(renderer);
  const [gltf, livery, logo] = await Promise.all([
    gltfLoader.loadAsync(url(config.model)),
    loadTexture(url(config.livery), renderer),
    new TextureLoader().loadAsync(url(config.logo)).then((t) => {
      t.colorSpace = SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    }),
  ]);
  livery.anisotropy = 4;

  const model = gltf.scene;
  model.updateMatrixWorld(true);
  const parts = {};
  model.traverse((o) => {
    if (o.isMesh) parts[o.name] = o;
  });

  const shell = parts.Shell;
  shell.material = createShellMaterial(livery, logo, config.logoSize ?? 0.62, shell.matrixWorld.clone(), room);
  parts.Visor.material = createVisorMaterial(room, exposure);
  const trimMR = parts.Trim.material.metalnessMap;
  parts.Trim.material = createChromeMaterial(room);
  parts.Padding.material.envMapIntensity = 0.4;
  parts.Vents.material.envMapIntensity = 1.4;
  for (const name of ['Shell', 'Trim', 'Padding', 'Vents']) patchDisplay(parts[name].material, exposure);

  // look-at rotates about the neck; drag-spin rotates about the helmet's centre
  const rig = new Group();
  const centre = new Group();
  const spin = new Group();
  const rest = new Group();
  rig.add(centre);
  centre.add(spin);
  spin.add(rest);
  rest.add(model);
  rest.scale.setScalar(HELMET_SCALE);
  rest.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), REST_PITCH);
  const pivot = NECK_PIVOT.clone().multiplyScalar(HELMET_SCALE);
  rig.position.copy(pivot);
  centre.position.copy(pivot).negate();

  return {
    rig,
    spin,
    rest,
    pivot,
    parts,
    textures: [livery, logo, trimMR].filter(Boolean),
  };
}

function createShellMaterial(livery, logo, logoSize, nodeMatrix, room) {
  // metallic blue paint under a clear coat: the flake catches the studio, the coat mirrors the room
  const m = new MeshPhysicalMaterial({
    map: livery,
    roughness: 0.34,
    metalness: 0.62,
    clearcoat: 1,
    clearcoatRoughness: 0.035,
    envMapIntensity: 1.5,
  });
  const uniforms = {
    ...room,
    uLogo: { value: logo },
    uLogoCentre: { value: LOGO_CENTRE },
    uLogoSize: { value: logoSize },
    uNodeMatrix: { value: new Matrix4().copy(nodeMatrix) },
    uRoomCoat: { value: 0.85 },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform mat4 uNodeMatrix;
        varying vec3 vRoomPos;
        varying vec3 vHelmetPos;
        varying vec3 vHelmetNormal;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vRoomPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vHelmetPos = (uNodeMatrix * vec4(transformed, 1.0)).xyz;
        vHelmetNormal = normalize(mat3(uNodeMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        ${ROOM_GLSL}
        uniform sampler2D uLogo;
        uniform vec2 uLogoCentre;
        uniform float uLogoSize;
        uniform float uRoomCoat;
        varying vec3 vRoomPos;
        varying vec3 vHelmetPos;
        varying vec3 vHelmetNormal;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          // logo decal, projected straight onto the back of the shell
          vec2 duv = vec2(-(vHelmetPos.x - uLogoCentre.x), vHelmetPos.y - uLogoCentre.y) / uLogoSize + 0.5;
          float onBack = smoothstep(0.25, 0.55, -normalize(vHelmetNormal).z);
          vec2 inside = step(vec2(0.0), duv) * step(duv, vec2(1.0));
          vec4 logo = texture2D(uLogo, clamp(duv, 0.0, 1.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, logo.rgb, logo.a * onBack * inside.x * inside.y);
        }`,
      )
      .replace(
        '#include <lights_fragment_maps>',
        `#include <lights_fragment_maps>
        #ifdef USE_CLEARCOAT
        {
          // the clear coat mirrors the same room as the visor, sharp
          vec3 nW = inverseTransformDirection(geometryClearcoatNormal, viewMatrix);
          vec3 vW = normalize(cameraPosition - vRoomPos);
          vec3 rW = reflect(-vW, nW);
          float spread = length(fwidth(rW));
          clearcoatRadiance = mix(clearcoatRadiance, roomRadiance(vRoomPos, rW, spread, 0.6, 1.0), uRoomCoat);
        }
        #endif`,
      );
  };
  m.customProgramCacheKey = () => 'helmet-shell';
  return m;
}

// Smoked iridium visor: opaque, dark behind, a Fresnel-weighted mirror of the
// room in front, with a slight thin-film hue shift towards grazing angles.
function createVisorMaterial(room, exposure) {
  return new ShaderMaterial({
    uniforms: {
      ...room,
      uExposure: exposure,
      uInterior: { value: new Color(0.0035, 0.0048, 0.0085) },
      uF0: { value: 0.3 },
      uGain: { value: 2.6 },
      uStrip: { value: 0.16 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      ${ROOM_GLSL}
      ${DISPLAY_GLSL}
      uniform float uExposure;
      uniform vec3 uInterior;
      uniform float uF0;
      uniform float uGain;
      uniform float uStrip;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      void main() {
        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float NdV = dot(N, V);
        // silhouette pixels whose interpolated normal tips away: bend it back
        N = normalize(N + V * max(0.0, 0.02 - NdV));
        NdV = max(dot(N, V), 1e-3);
        vec3 R = reflect(-V, N);
        float spread = length(fwidth(R));

        vec3 env = roomRadiance(vWorldPos, R, spread, 0.0, uStrip);
        float F = uF0 + (1.0 - uF0) * pow(1.0 - NdV, 5.0);
        // iridium film: cool face-on, a touch of gold chrome at grazing angles
        vec3 film = mix(vec3(0.8, 0.88, 1.0), vec3(1.0, 0.9, 0.7), smoothstep(0.3, 0.95, 1.0 - NdV));

        gl_FragColor = vec4(toDisplay((uInterior * (1.0 - F) + env * F * film * uGain) * uExposure), 1.0);
      }
    `,
  });
}

// Silver chrome for the trim (spoiler, vent caps): a mirror of the same room,
// so it carries the cards and the strip lights like the visor does.
function createChromeMaterial(room) {
  const m = new MeshStandardMaterial({ color: new Color(...PALETTE.silver), metalness: 1, roughness: 0.12, envMapIntensity: 1 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, room);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vRoomPos;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vRoomPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${ROOM_GLSL}
        varying vec3 vRoomPos;`)
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
        {
          vec3 nW = inverseTransformDirection(geometryNormal, viewMatrix);
          vec3 vW = normalize(cameraPosition - vRoomPos);
          vec3 rW = reflect(-vW, nW);
          radiance = mix(radiance, chromeEnv(vRoomPos, rW, length(fwidth(rW)), 0.3), 0.85);
        }`);
  };
  m.customProgramCacheKey = () => 'helmet-chrome';
  return m;
}

// A custom studio for the paint's base layer: blue-black walls, the same
// strip lights the analytic room has, and four dim panels where the cards
// are. Rendered once into a PMREM.
export function createStudioEnvironment(renderer, aspect = 16 / 9) {
  const Ly = ROOM_LY;
  const L = new Vector3(Ly * aspect, Ly, Ly * ROOM_DEPTH);
  const scene = new Scene();
  scene.add(new Mesh(new BoxGeometry(2 * L.x, 2 * L.y, 2 * L.z), new MeshBasicMaterial({ color: new Color(...PALETTE.stage).multiplyScalar(3), side: BackSide })));

  const glow = (k, tint = [1, 1, 1]) => new MeshBasicMaterial({ color: new Color(tint[0] * k, tint[1] * k, tint[2] * k), side: DoubleSide });
  for (const [face, a0, b0, a1, b1, k] of SOFTBOXES) {
    const w = a1 - a0, h = b1 - b0, ca = (a0 + a1) / 2, cb = (b0 + b1) / 2;
    let mesh;
    if (face === 0) {
      mesh = new Mesh(new PlaneGeometry(w * L.x, h * L.z), glow(k * 1.6));
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(ca * L.x, L.y * 0.995, cb * L.z);
    } else {
      mesh = new Mesh(new PlaneGeometry(w * L.z, h * L.y), glow(k * 1.6));
      mesh.rotation.y = Math.PI / 2;
      mesh.position.set((face === 1 ? 1 : -1) * L.x * 0.995, cb * L.y, ca * L.z);
    }
    scene.add(mesh);
  }
  for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const panel = new Mesh(new PlaneGeometry(L.x * 0.6, L.y * 0.5), glow(0.1, [0.86, 0.92, 1]));
    panel.position.set((sx * L.x) / 2, (sy * L.y) / 2, L.z * 0.99);
    panel.rotation.y = Math.PI;
    scene.add(panel);
  }
  const pmrem = new PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.015, 0.1, 100);
  pmrem.dispose();
  scene.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      o.material.dispose();
    }
  });
  return rt.texture;
}
