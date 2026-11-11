import { Euler, MathUtils, NeutralToneMapping, Quaternion, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer, WebGLRenderTarget } from 'three';
import { createClips } from './clips.js';
import { createQuadPass } from './quadrants.js';
import { createRoomUniforms, REST_LEVEL, ROOM_DEPTH, ROOM_LY } from './room.js';
import { createStudioEnvironment, HELMET_RADIUS, HELMET_SCALE, loadHelmet } from './helmet.js';
import { HeadMotion, smoothing } from './motion.js';
import { downloadSplit, Governor, Hud } from './perf.js';

const SLOTS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const CAMERA_Z = 14.4;
const FOV = 26;

const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(hover: none), (pointer: coarse)').matches;
const canvas = document.getElementById('gl');

// ?capture: frames are stepped on a fixed clock by an external driver (proof videos on machines without a GPU)
const capture = params.has('capture') ? { now: 0 } : null;
const clock = () => (capture ? capture.now : performance.now());
const stamp = (e) => (capture ? capture.now : e.timeStamp);

const perf = { quadsAt: null, helmetAt: null, sleeping: true, renders: 0, downloads: downloadSplit };
window.__perf = perf;

// ---------- content ----------
const base = new URL('content/', location.href);
const config = await fetch(new URL('content.json', base)).then((r) => r.json());
const pillars = SLOTS.map((corner) => config.pillars.find((p) => p.corner === corner));

const labels = pillars.map((p) => {
  const el = document.createElement('p');
  el.className = 'pillar';
  el.dataset.corner = p.corner;
  el.textContent = p.name;
  document.getElementById('pillars').appendChild(el);
  return el;
});

// ---------- renderer ----------
const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
renderer.autoClear = false;
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = NeutralToneMapping;
renderer.toneMappingExposure = 0;

const governor = new Governor({ fixed: params.has('dpr') ? Number(params.get('dpr')) : null });
const hud = params.has('hud') ? new Hud(renderer) : null;

const camera = new PerspectiveCamera(FOV, innerWidth / innerHeight, 1, 40);
camera.position.set(0, 0, CAMERA_Z);

const room = createRoomUniforms();
const clips = createClips(pillars.map((p) => ({ clip: p.clip, focus: p.focus ?? [0.5, 0.5] })), base, () => wake(), { manual: !!capture });
clips.list.forEach((c, i) => {
  room[`uClip${i}`].value = c.texture;
  room.uFocusX.value.setComponent(i, c.focus[0]);
  room.uFocusY.value.setComponent(i, 1 - c.focus[1]);
  c.video.addEventListener('loadedmetadata', () => {
    room.uClipAspect.value.setComponent(i, c.aspect);
    room.uClipWidth.value.setComponent(i, c.video.videoWidth || 1280);
  });
});

const quad = createQuadPass(room);
const helmetScene = new Scene();
helmetScene.environment = createStudioEnvironment(renderer);

perf.state = () => ({
  active,
  playing: clips.list.map((c) => !c.video.paused),
  times: clips.list.map((c) => c.video.currentTime),
  spin: 2 * Math.acos(Math.min(1, Math.abs(motion.spin.q.w))),
  dpr: governor.dpr,
});

const motion = new HeadMotion({ camera, reduced: reduced || params.has('still') });
motion.lastMoveAt = clock();
if (params.has('yaw') || params.has('pitch')) {
  const deg = (k) => MathUtils.degToRad(Number(params.get(k) || 0));
  motion.forced = new Quaternion().setFromEuler(new Euler(-deg('pitch'), deg('yaw'), 0, 'YXZ'));
}
const showQuads = params.get('bg') !== '0';
let helmet = null;
let helmetShown = false;
let entryStart = 0;
let entry = 0;
const levels = [REST_LEVEL, REST_LEVEL, REST_LEVEL, REST_LEVEL];
let active = -1;
let raf = 0;
let lastFrame = 0;
let wasBusy = false;
const touch = { enabled: coarse, tap: null, tourAt: 0, tourIndex: 0, tiltAt: -1e9, tiltBase: null, asked: false };

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  if (governor.fixed == null) governor.dpr = Math.min(governor.dpr, governor.cap(w, h));
  renderer.setPixelRatio(governor.dpr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  room.uRoom.value.set(ROOM_LY * camera.aspect, ROOM_LY, ROOM_LY * ROOM_DEPTH);
  quad.resize(w, h, governor.dpr);
  quad.uniforms.uSeatRadius.value = (1.25 * HELMET_RADIUS) / (2 * CAMERA_Z * Math.tan(MathUtils.degToRad(FOV / 2)));
  wake();
}
addEventListener('resize', resize);
resize();

// ---------- render on demand ----------

function wake() {
  if (!raf && !capture) raf = requestAnimationFrame(frame);
}

function frame(now) {
  raf = 0;
  const consecutive = wasBusy && now - lastFrame < 100;
  const dt = consecutive ? Math.min((now - lastFrame) / 1000, 0.05) : 1 / 60;
  const t0 = performance.now();
  const busy = update(dt, now);
  hud?.beginGpu();
  render();
  hud?.endGpu();
  const cpu = performance.now() - t0;
  if (consecutive && governor.sample(now - lastFrame, now, innerWidth, innerHeight)) resize();
  hud?.frame(consecutive ? now - lastFrame : null, cpu, now, perf);
  perf.renders++;
  lastFrame = now;
  wasBusy = busy;
  perf.sleeping = !busy;
  if (busy) raf = requestAnimationFrame(frame);
}

function render() {
  renderer.setRenderTarget(null);
  if (showQuads) renderer.render(quad.scene, quad.camera);
  else renderer.clear();
  if (helmetShown) {
    renderer.clearDepth();
    renderer.render(helmetScene, camera);
  }
}

const backOut = (t, c = 1.6) => 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
const easeOut = (t) => 1 - (1 - t) ** 3;

function update(dt, now) {
  let busy = false;
  if (touch.enabled) busy = touchTour(now) || busy;

  if (helmetShown) {
    busy = motion.update(dt, now) || busy;
    helmet.rig.quaternion.copy(motion.display);
    helmet.rig.position.copy(helmet.pivot).add(motion.position);
    helmet.spin.quaternion.copy(motion.spin.q);

    if (entry < 1) {
      entry = Math.min(1, (now - entryStart) / 900);
      const t = reduced ? 1 : entry;
      helmet.rest.scale.setScalar(HELMET_SCALE * (0.86 + 0.14 * backOut(t)));
      renderer.toneMappingExposure = easeOut(Math.min(1, entry / 0.6));
      quad.uniforms.uSeatAmount.value = 0.38 * renderer.toneMappingExposure;
      busy = true;
    }
    const visH = 2 * CAMERA_Z * Math.tan(MathUtils.degToRad(FOV / 2));
    quad.uniforms.uSeat.value.set(motion.position.x / (visH * camera.aspect), motion.position.y / visH);
  }

  const k = smoothing(0.09, dt);
  for (let i = 0; i < 4; i++) {
    const target = i === active ? 1 : REST_LEVEL;
    const d = target - levels[i];
    levels[i] = Math.abs(d) < 1e-3 ? target : levels[i] + d * k;
    if (levels[i] !== target) busy = true;
  }
  room.uLevel.value.set(levels[0], levels[1], levels[2], levels[3]);
  return busy;
}

// ---------- hover → play ----------
const quadrantOf = (x, y) => (x < 0 ? 0 : 1) + (y > 0 ? 0 : 2);

function setActive(q) {
  if (q === active) return;
  active = q;
  labels.forEach((el, i) => el.classList.toggle('on', i === q));
  if (q >= 0) clips.play(q);
  else clips.pauseAll();
  wake();
}

// ---------- input ----------
let drag = null;
const _c = new Vector3();

function overHelmet(cx, cy) {
  if (!helmetShown) return false;
  helmet.spin.getWorldPosition(_c).project(camera);
  const sx = (_c.x * 0.5 + 0.5) * innerWidth;
  const sy = (-_c.y * 0.5 + 0.5) * innerHeight;
  const r = (HELMET_RADIUS / (2 * CAMERA_Z * Math.tan(MathUtils.degToRad(FOV / 2)))) * innerHeight;
  return Math.hypot(cx - sx, cy - sy) < r * 0.92;
}

const ndc = (e) => [(e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1)];

addEventListener('pointermove', (e) => {
  if (drag && e.pointerId === drag.id) {
    motion.drag(e.clientX - drag.x, e.clientY - drag.y, stamp(e) - drag.t);
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.t = stamp(e);
    drag.moved = true;
    wake();
    return;
  }
  if (e.pointerType === 'touch') return;
  touch.enabled = false;
  const [x, y] = ndc(e);
  motion.setPointer(x, y, clock());
  setActive(quadrantOf(x, y));
  document.body.classList.toggle('grab', overHelmet(e.clientX, e.clientY));
  wake();
});

const leave = () => {
  if (drag) return;
  motion.leave();
  setActive(-1);
  document.body.classList.remove('grab');
  wake();
};
document.addEventListener('mouseleave', leave);
addEventListener('mouseout', (e) => {
  if (!e.relatedTarget) leave();
});
addEventListener('blur', leave);

canvas.addEventListener('pointerdown', (e) => {
  if (overHelmet(e.clientX, e.clientY)) {
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: stamp(e), moved: false };
    canvas.setPointerCapture(e.pointerId);
    motion.startDrag();
    document.body.classList.add('grabbing');
    e.preventDefault();
    wake();
  } else if (e.pointerType === 'touch') {
    touch.tap = { x: e.clientX, y: e.clientY, t: e.timeStamp };
  }
});

const endDrag = (e) => {
  if (drag && e.pointerId === drag.id) {
    motion.endDrag(clock());
    drag = null;
    document.body.classList.remove('grabbing');
    wake();
    return true;
  }
  return false;
};
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('pointerup', (e) => {
  if (endDrag(e) || e.pointerType !== 'touch' || !touch.tap) return;
  const moved = Math.hypot(e.clientX - touch.tap.x, e.clientY - touch.tap.y);
  touch.tap = null;
  if (moved < 12) onTap(...ndc(e));
});

// ---------- touch: corner tour, tap to play, tilt to look ----------
const TOUR = [[-0.55, 0.5], [0.55, 0.5], [0.55, -0.5], [-0.55, -0.5]];

function touchTour(now) {
  if (active >= 0 || now - touch.tiltAt < 2500) return false;
  if (now - touch.tourAt > 2400) {
    touch.tourAt = now;
    const [x, y] = TOUR[touch.tourIndex++ % TOUR.length];
    motion.setPointer(x, y, now);
  }
  return true;
}

function onTap(x, y) {
  touch.enabled = true;
  askForTilt();
  const q = quadrantOf(x, y);
  if (q === active) {
    setActive(-1);
  } else {
    setActive(q);
    motion.setPointer(TOUR[[0, 1, 3, 2][q]][0], TOUR[[0, 1, 3, 2][q]][1], clock());
  }
  wake();
}

function onOrientation(e) {
  if (e.beta == null || e.gamma == null || drag) return;
  if (!touch.tiltBase) touch.tiltBase = { b: e.beta, g: e.gamma };
  const b = touch.tiltBase;
  b.b += (e.beta - b.b) * 0.004; // slowly re-centre on however the phone is held
  b.g += (e.gamma - b.g) * 0.004;
  const x = MathUtils.clamp((e.gamma - b.g) / 16, -1, 1);
  const y = MathUtils.clamp((e.beta - b.b) / 16, -1, 1);
  if (Math.hypot(x, y) < 0.06 && clock() - touch.tiltAt > 2500) return;
  touch.tiltAt = clock();
  if (active < 0) motion.setPointer(x * 0.75, y * 0.75, touch.tiltAt);
  wake();
}

function askForTilt() {
  if (touch.asked || typeof DeviceOrientationEvent === 'undefined') return;
  touch.asked = true;
  const listen = () => addEventListener('deviceorientation', onOrientation);
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().then((s) => s === 'granted' && listen()).catch(() => {});
  } else {
    listen();
  }
}
if (coarse && typeof DeviceOrientationEvent?.requestPermission !== 'function') askForTilt();

document.addEventListener('visibilitychange', () => {
  if (document.hidden) clips.pauseAll();
  else {
    if (active >= 0) clips.play(active);
    wake();
  }
});

// ---------- arrival: quadrants first, then the helmet, warmed up ----------
const timeout = (ms) => new Promise((r) => setTimeout(r, ms));
const clipsReady = Promise.race([Promise.all(clips.list.map((c) => c.ready)), timeout(2500)]);

clipsReady.then(async () => {
  await renderer.compileAsync(quad.scene, quad.camera);
  render();
  canvas.classList.add('ready');
  perf.quadsAt = performance.now();
  wake();
});

loadHelmet(renderer, config.helmet, base, room).then(async (h) => {
  helmet = h;
  helmetScene.add(h.rig);
  // Warm-up: upload every texture and compile every program before the first
  // frame that shows the helmet, so its first turn never hitches.
  for (const t of h.textures) renderer.initTexture(t);
  await renderer.compileAsync(helmetScene, camera);
  await clipsReady;
  const rt = new WebGLRenderTarget(64, 64);
  renderer.setRenderTarget(rt);
  renderer.render(helmetScene, camera);
  renderer.setRenderTarget(null);
  rt.dispose();

  helmetShown = true;
  entryStart = clock();
  perf.helmetAt = performance.now();
  motion.lastMoveAt = entryStart;
  wake();
});

if (capture) {
  const { installCapture } = await import('./capture.js');
  installCapture({ capture, clips, step: (dt) => (update(dt, capture.now), render()) });
}
