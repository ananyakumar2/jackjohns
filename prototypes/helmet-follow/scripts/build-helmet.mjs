// Builds public/content/helmet/* from the CC BY 4.0 source model.
//
//   node scripts/build-helmet.mjs <source.glb>
//
// Needs ffmpeg and KTX-Software 4.x (`ktx`) on PATH (or KTX_BIN=/path/to/ktx).
// Output: helmet.glb (meshopt + quantised, trim texture as KTX2), livery.ktx2
// (neutral placeholder), livery-template.png (UV guide for designers), logo.png.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRTextureBasisu } from '@gltf-transform/extensions';
import { prune, dedup, quantize, reorder, weld, weldPrimitive, simplifyPrimitive, compactPrimitive, transformMesh } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'public', 'content', 'helmet');
const SRC = process.argv[2];
if (!SRC) {
  console.error('usage: node scripts/build-helmet.mjs <source.glb>');
  process.exit(1);
}
const KTX = process.env.KTX_BIN || 'ktx';
const TMP = mkdtempSync(join(tmpdir(), 'helmet-'));
mkdirSync(OUT, { recursive: true });

// Placeholder livery: warm off-white gloss, so it reads as "not Jack's yet".
const LIVERY_RGB = [233, 231, 226];
const LOGO_RGB = [38, 39, 43];

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const doc = await io.read(SRC);
const root = doc.getRoot();
const byName = (list, name) => list.find((x) => x.getName() === name);

// ---------- textures we still need from the source ----------
const srcTex = (name) => byName(root.listTextures(), name).getImage();
writeFileSync(join(TMP, 'main-color.jpg'), srcTex('main-color'));
writeFileSync(join(TMP, 'component-mr.jpg'), srcTex('Component-mr'));

const uvCoverage = dilate(rasterizeUVs(byName(root.listMeshes(), 'Helmet_main').listPrimitives()[0], 1024), 1024, 1);

// ---------- drop the authoring camera ----------
for (const node of root.listNodes()) {
  if (node.getCamera()) node.dispose();
}
for (const cam of root.listCameras()) cam.dispose();

// ---------- split the clear parts: visor vs vents/chin strip ----------
const glassNode = byName(root.listNodes(), 'Helmet_glass');
const glassPrim = glassNode.getMesh().listPrimitives()[0];
const components = connectedComponents(glassPrim);
const visorLabel = [...components.sizes.entries()].sort((a, b) => b[1] - a[1])[0][0];

const visorPrim = withTriangles(glassPrim, (t) => components.labels[t] === visorLabel);
const ventPrim = withTriangles(glassPrim, (t) => components.labels[t] !== visorLabel);
glassNode.getMesh().dispose();
glassNode.dispose();

const scene = root.listScenes()[0];
const parent = root.listNodes().find((n) => n.listChildren().length > 0) || null;
function addNode(name, prim) {
  const mesh = doc.createMesh(name).addPrimitive(prim);
  const node = doc.createNode(name).setMesh(mesh);
  (parent || scene).addChild(node);
  return node;
}
addNode('Visor', visorPrim);
addNode('Vents', ventPrim);

for (const [from, to] of [['Helmet_main', 'Shell'], ['Helmet_Component', 'Trim'], ['Helmet_inside', 'Padding']]) {
  const node = byName(root.listNodes(), from);
  node.setName(to);
  node.getMesh().setName(to);
}

// ---------- materials: named slots; the app builds the real shading ----------
for (const m of root.listMaterials()) m.dispose();
for (const t of root.listTextures()) t.dispose();

const mat = (name, rgb, rough, metal) =>
  doc.createMaterial(name).setBaseColorFactor([...rgb.map((c) => c / 255), 1]).setRoughnessFactor(rough).setMetallicFactor(metal);

const trimMR = await encodeTrimMR();
const materials = {
  Shell: mat('Shell', LIVERY_RGB, 0.32, 0),
  Trim: mat('Trim', [26, 27, 30], 1, 1).setMetallicRoughnessTexture(trimMR),
  Padding: mat('Padding', [16, 16, 18], 0.9, 0),
  Visor: mat('Visor', [6, 7, 9], 0.05, 0),
  Vents: mat('Vents', [12, 13, 15], 0.15, 0),
};
for (const node of root.listNodes()) {
  const m = node.getMesh();
  if (m && materials[node.getName()]) for (const p of m.listPrimitives()) p.setMaterial(materials[node.getName()]);
}

// ---------- orient (visor towards +z) and centre on the shell ----------
const shellPrim = byName(root.listNodes(), 'Shell').getMesh().listPrimitives()[0];
const box = bounds(shellPrim);
const cx = (box.min[0] + box.max[0]) / 2;
const cy = (box.min[1] + box.max[1]) / 2;
const cz = (box.min[2] + box.max[2]) / 2;
// rotate π about y, then translate so the shell's bounding-box centre is the origin
const M = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, cx, -cy, cz, 1];
for (const mesh of root.listMeshes()) transformMesh(mesh, M);

// The meshes were authored with heavy subdivision on the small vent covers.
await doc.transform(weld());
const ventsMesh = byName(root.listMeshes(), 'Vents');
await simplifyMesh(ventsMesh, 0.12, 0.0004);

// The shell keeps its UVs for the livery even though its material slot has no texture here.
for (const name of ['Visor', 'Vents', 'Padding']) {
  for (const prim of byName(root.listMeshes(), name).listPrimitives()) prim.setAttribute('TEXCOORD_0', null);
}

await doc.transform(
  dedup(),
  prune({ keepAttributes: true }),
  reorder({ encoder: MeshoptEncoder }),
  quantize({ quantizePosition: 14, quantizeNormal: 12, quantizeTexcoord: 12 }),
);

doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({
  method: EXTMeshoptCompression.EncoderMethod.FILTER,
});

root.setExtras({
  source: 'F1 Helmet ZhouGuanyu 24 by Miopass (CC BY 4.0), livery removed, see README',
});
await io.write(join(OUT, 'helmet.glb'), doc);

// ---------- livery placeholder + UV template ----------
buildLivery();
buildLogo();

for (const f of ['helmet.glb', 'livery.ktx2', 'livery-template.png', 'logo.png']) {
  console.log(f.padEnd(22), (statSync(join(OUT, f)).size / 1024).toFixed(1), 'KB');
}
console.log('shell bounds in source space', JSON.stringify(box));

// =====================================================================

function connectedComponents(prim) {
  const pos = prim.getAttribute('POSITION');
  const idx = prim.getIndices().getArray();
  const keyToId = new Map();
  const weldId = new Uint32Array(pos.getCount());
  const v = [0, 0, 0];
  for (let i = 0; i < pos.getCount(); i++) {
    pos.getElement(i, v);
    const key = `${Math.round(v[0] * 1e5)},${Math.round(v[1] * 1e5)},${Math.round(v[2] * 1e5)}`;
    let id = keyToId.get(key);
    if (id === undefined) keyToId.set(key, (id = keyToId.size));
    weldId[i] = id;
  }
  const parentOf = new Uint32Array(keyToId.size).map((_, i) => i);
  const find = (a) => {
    while (parentOf[a] !== a) a = parentOf[a] = parentOf[parentOf[a]];
    return a;
  };
  for (let t = 0; t < idx.length; t += 3) {
    const a = find(weldId[idx[t]]);
    for (let k = 1; k < 3; k++) {
      const b = find(weldId[idx[t + k]]);
      if (a !== b) parentOf[b] = a;
    }
  }
  const labels = new Uint32Array(idx.length / 3);
  const sizes = new Map();
  for (let t = 0; t < labels.length; t++) {
    const l = find(weldId[idx[t * 3]]);
    labels[t] = l;
    sizes.set(l, (sizes.get(l) || 0) + 1);
  }
  return { labels, sizes };
}

function withTriangles(prim, keep) {
  const idx = prim.getIndices().getArray();
  const out = [];
  for (let t = 0; t < idx.length / 3; t++) if (keep(t)) out.push(idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]);
  const clone = prim.clone();
  clone.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(out)).setBuffer(root.listBuffers()[0]));
  compactPrimitive(clone);
  return clone;
}

async function simplifyMesh(mesh, ratio, error) {
  for (const prim of mesh.listPrimitives()) {
    weldPrimitive(prim);
    simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio, error, lockBorder: true });
  }
}

function bounds(prim) {
  const pos = prim.getAttribute('POSITION');
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const v = [0, 0, 0];
  for (let i = 0; i < pos.getCount(); i++) {
    pos.getElement(i, v);
    for (let k = 0; k < 3; k++) {
      if (v[k] < min[k]) min[k] = v[k];
      if (v[k] > max[k]) max[k] = v[k];
    }
  }
  return { min, max };
}

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });
}
function ktx(args) {
  execFileSync(KTX, args, { stdio: 'inherit' });
}

async function encodeTrimMR() {
  const png = join(TMP, 'trim-mr.png');
  const out = join(TMP, 'trim-mr.ktx2');
  ffmpeg(['-i', join(TMP, 'component-mr.jpg'), '-vf', 'scale=256:256:flags=area', '-pix_fmt', 'rgb24', png]);
  ktx(['create', '--format', 'R8G8B8_UNORM', '--assign-tf', 'linear', '--encode', 'uastc', '--uastc-quality', '2', '--zstd', '19', '--generate-mipmap', png, out]);
  doc.createExtension(KHRTextureBasisu).setRequired(true);
  return doc.createTexture('trim-mr').setMimeType('image/ktx2').setImage(readFileSync(out));
}

function readRGB(file, size) {
  const raw = join(TMP, 'raw.rgb');
  ffmpeg(['-i', file, '-vf', `scale=${size}:${size}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', raw]);
  return new Uint8Array(readFileSync(raw));
}
function writeRGB(data, size, file, fmt = 'rgb24') {
  const raw = join(TMP, 'out.raw');
  writeFileSync(raw, data);
  ffmpeg(['-f', 'rawvideo', '-pix_fmt', fmt, '-s', `${size}x${size}`, '-i', raw, '-frames:v', '1', file]);
}

// Livery islands are the saturated or bright pixels of the original artwork
// (plus any holes inside them, e.g. outlines). Neutral dark pixels outside
// them are vent covers and the visor gasket: those stay as they were.
function buildLivery() {
  const N = 1024;
  const src = readRGB(join(TMP, 'main-color.jpg'), N);
  const seed = new Uint8Array(N * N);
  const used = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const r = src[i * 3], g = src[i * 3 + 1], b = src[i * 3 + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx > 0 ? (mx - mn) / mx : 0;
    seed[i] = (sat > 0.25 && mx > 20) || mx > 150 ? 1 : 0;
    used[i] = mx > 10 ? 1 : 0;
  }
  const livery = dilate(seed, N, 3);
  // flood the non-livery area from the border; anything unreached is a hole inside a livery island
  const reached = new Uint8Array(N * N);
  const stack = [];
  for (let i = 0; i < N; i++) stack.push(i, (N - 1) * N + i, i * N, i * N + N - 1);
  while (stack.length) {
    const p = stack.pop();
    if (reached[p] || livery[p]) continue;
    reached[p] = 1;
    const x = p % N, y = (p / N) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < N - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - N);
    if (y < N - 1) stack.push(p + N);
  }
  // trim = large neutral regions (vent caps, gasket); small specks are livery detail
  const trimMask = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) trimMask[i] = !(livery[i] || !reached[i]) && used[i] ? 1 : 0;
  const isTrimRegion = keepLarge(trimMask, N, 600);

  const out = new Uint8Array(N * N * 3);
  const tpl = new Uint8Array(N * N * 3);
  for (let i = 0; i < N * N; i++) {
    const isTrim = isTrimRegion[i] === 1;
    for (let k = 0; k < 3; k++) {
      const grey = (src[i * 3] * 0.3 + src[i * 3 + 1] * 0.59 + src[i * 3 + 2] * 0.11) | 0;
      out[i * 3 + k] = isTrim ? grey : LIVERY_RGB[k];
      tpl[i * 3 + k] = isTrim ? 70 : uvCoverage[i] ? 214 : 24;
    }
  }
  // 1 px outline on the template so island edges are easy to find
  const edge = new Uint8Array(N * N);
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
    const i = y * N + x;
    const a = tpl[i * 3];
    if (a !== tpl[(i + 1) * 3] || a !== tpl[(i + N) * 3]) edge[i] = 1;
  }
  for (let i = 0; i < N * N; i++) if (edge[i]) tpl[i * 3] = tpl[i * 3 + 1] = tpl[i * 3 + 2] = 255;

  const png = join(TMP, 'livery.png');
  writeRGB(out, N, png);
  writeRGB(tpl, N, join(OUT, 'livery-template.png'));
  ktx(['create', '--format', 'R8G8B8_SRGB', '--assign-tf', 'srgb', '--encode', 'uastc', '--uastc-quality', '2', '--uastc-rdo', '--zstd', '19', '--generate-mipmap', png, join(OUT, 'livery.ktx2')]);
}

function rasterizeUVs(prim, N) {
  const uv = prim.getAttribute('TEXCOORD_0');
  const idx = prim.getIndices().getArray();
  const cov = new Uint8Array(N * N);
  const a = [0, 0], b = [0, 0], c = [0, 0];
  for (let t = 0; t < idx.length; t += 3) {
    uv.getElement(idx[t], a);
    uv.getElement(idx[t + 1], b);
    uv.getElement(idx[t + 2], c);
    const p = [a, b, c].map(([u, v]) => [u * N, v * N]);
    const x0 = Math.max(0, Math.floor(Math.min(p[0][0], p[1][0], p[2][0])));
    const x1 = Math.min(N - 1, Math.ceil(Math.max(p[0][0], p[1][0], p[2][0])));
    const y0 = Math.max(0, Math.floor(Math.min(p[0][1], p[1][1], p[2][1])));
    const y1 = Math.min(N - 1, Math.ceil(Math.max(p[0][1], p[1][1], p[2][1])));
    const area = (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[2][0] - p[0][0]) * (p[1][1] - p[0][1]);
    if (Math.abs(area) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((p[1][0] - px) * (p[2][1] - py) - (p[2][0] - px) * (p[1][1] - py)) / area;
      const w1 = ((p[2][0] - px) * (p[0][1] - py) - (p[0][0] - px) * (p[2][1] - py)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 >= -0.02 && w1 >= -0.02 && w2 >= -0.02) cov[y * N + x] = 1;
    }
  }
  return cov;
}

function keepLarge(mask, N, minArea) {
  const out = new Uint8Array(N * N);
  const seen = new Uint8Array(N * N);
  for (let s = 0; s < N * N; s++) {
    if (!mask[s] || seen[s]) continue;
    const region = [];
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const p = stack.pop();
      region.push(p);
      const x = p % N;
      for (const q of [x > 0 ? p - 1 : -1, x < N - 1 ? p + 1 : -1, p - N, p + N]) {
        if (q >= 0 && q < N * N && mask[q] && !seen[q]) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    if (region.length >= minArea) for (const p of region) out[p] = 1;
  }
  return out;
}

function dilate(mask, N, r) {
  let cur = mask;
  for (let s = 0; s < r; s++) {
    const next = cur.slice();
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      const i = y * N + x;
      if (!cur[i] && (cur[i - 1] || cur[i + 1] || cur[i - N] || cur[i + N])) next[i] = 1;
    }
    cur = next;
  }
  return cur;
}

// Placeholder for Jack's logo: a thin registration ring, nothing that reads as a design.
function buildLogo() {
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  const c = (N - 1) / 2;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x - c, y - c) / (N / 2);
    const ring = 1 - Math.min(1, Math.abs(d - 0.86) / 0.035);
    const dot = 1 - Math.min(1, Math.max(0, d - 0.1) / 0.02);
    const a = Math.max(0, Math.min(1, Math.max(ring * 1.6, dot)));
    const i = (y * N + x) * 4;
    data[i] = LOGO_RGB[0];
    data[i + 1] = LOGO_RGB[1];
    data[i + 2] = LOGO_RGB[2];
    data[i + 3] = Math.round(a * 255);
  }
  writeRGB(data, N, join(OUT, 'logo.png'), 'rgba');
}
