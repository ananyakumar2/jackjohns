import { Euler, MathUtils, Matrix4, PerspectiveCamera, Quaternion, Scene, Vector3, WebGLRenderer, WebGLRenderTarget } from 'three';
import { createClips } from './clips.js';
import { createRoomUniforms, REST_LEVEL, ROOM_DEPTH, ROOM_LY } from './room.js';
import { createStudioEnvironment, HELMET_RADIUS, loadHelmet, HELMET_SCALE } from './helmet.js';
import { HeadMotion } from './motion.js';
import { downloadSplit, Governor, Hud } from './perf.js';
import { CAMERA_Y, CAMERA_Z, CARD_Z, FOV, FRAME_PX, PILL, TITLE, WALL_Z, cardAt, computeLayout, createView, viewTan } from './layout.js';
import { createStage } from './stage.js';
import { Card, updateCards } from './cards.js';
import { createArc } from './arc.js';
import { createNames, createTextAtlas, createTitle } from './labels.js';
import { CSS } from './palette.js';
import { createBooking } from './booking.js';
import { createHaze } from './haze.js';

const SLOTS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const WOBBLE_SPEED = 1300; // CSS px/s: cards get knocked
const REDLINE_SPEED = 2600; // CSS px/s: the arc hits the limiter

const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(hover: none), (pointer: coarse)').matches;
const canvas = document.getElementById('gl');

// ?capture: frames are stepped on a fixed clock by an external driver (proof videos on machines without a GPU)
const capture = params.has('capture') ? { now: 0 } : null;
const clock = () => (capture ? capture.now : performance.now());
const stamp = (e) => (capture ? capture.now : e.timeStamp);

const perf = { stageAt: null, helmetAt: null, sleeping: true, renders: 0, downloads: downloadSplit };
window.__perf = perf;

// ---------- content ----------
const base = new URL('content/', location.href);
const config = await fetch(new URL('content.json', base)).then((r) => r.json());
const pillars = SLOTS.map((corner) => config.pillars.find((p) => p.corner === corner));

// ---------- renderer ----------
const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.autoClear = false;
const governor = new Governor({ fixed: params.has('dpr') ? Number(params.get('dpr')) : null });
const hud = params.has('hud') ? new Hud(renderer) : null;
const sceneRT = new WebGLRenderTarget(1, 1, { samples: 4 });

const view = createView();
const camera = new PerspectiveCamera(FOV, 1, 1, 60);
camera.position.set(0, CAMERA_Y, CAMERA_Z);

const helmetExposure = { value: 0 };
const stageExposure = { value: 1 };
const room = createRoomUniforms();
const scene = new Scene();
scene.environment = createStudioEnvironment(renderer);

// a clip can bind while the fonts are still loading; the loop only starts once the page is laid out
let raf = 0;
let live = false;
const clips = createClips(pillars, base, (clip) => bindClip(clip), { manual: !!capture });
const stage = createStage(view, stageExposure);
scene.add(...stage.meshes);
const cards = pillars.map(() => new Card(room, stageExposure));
cards.forEach((c) => scene.add(c.mesh));
const arc = createArc(room, stageExposure);
scene.add(arc.mesh);

const atlas = await createTextAtlas([...pillars.map((p) => p.name), 'Book']);
const names = createNames(atlas, pillars.map((p) => p.name), [0.776, 0.808, 0.851], stageExposure);
const titleEl = document.getElementById('title');
const title = createTitle(await createTextAtlas([titleEl.textContent], TITLE), titleEl.textContent, room, stageExposure);
names.scene.add(title.mesh);
const booking = createBooking({
  room,
  exposure: stageExposure,
  atlas,
  button: document.getElementById('book'),
  lens: document.getElementById('lens'),
  pillars,
  onChange: () => wake(),
});
// drawn over the finished frame, so neither the haze nor the lens can bend or copy it
const front = new Scene().add(booking.mesh);

const halfFloatOK = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
const haze = createHaze(renderer, room, { enabled: !reduced && halfFloatOK && params.get('haze') !== '0' });
const hu = haze.uniforms;

const nameEls = pillars.map((p) => {
  const el = document.createElement('p');
  el.className = 'pillar';
  el.textContent = p.name;
  document.getElementById('pillars').appendChild(el);
  return el;
});

function bindClip(clip) {
  const i = clips?.list.indexOf(clip) ?? -1;
  if (i < 0 || !clip.current) return;
  cards[i].uniforms.uMap.value = clip.current;
  cards[i].uniforms.uAspect.value = clip.aspect;
  cards[i].uniforms.uFocus.value.set(clip.focus[0], 1 - clip.focus[1]);
  cards[i].uniforms.uStillGain.value = clip.stillGain;
  room[`uClip${i}`].value = clip.current;
  room.uClipAspect.value.setComponent(i, clip.aspect);
  room.uClipWidth.value.setComponent(i, clip.video.videoWidth || 1280);
  room.uFocusX.value.setComponent(i, clip.focus[0]);
  room.uFocusY.value.setComponent(i, 1 - clip.focus[1]);
  wake();
}

perf.state = () => ({
  active,
  playing: clips.list.map((c) => !c.video.paused),
  live: clips.list.map((c) => c.live),
  times: clips.list.map((c) => c.video.currentTime),
  spin: 2 * Math.acos(Math.min(1, Math.abs(motion.spin.q.w))),
  dpr: governor.dpr,
  haze: haze.active,
  lens: booking.isOpen(),
  pointer: pointer.inside,
  arc: arc.levels,
  sleeping: perf.sleeping,
});
perf.layout = () => layout;

const motion = new HeadMotion({ camera, reduced: reduced || params.has('still') });
motion.lastMoveAt = clock();
if (params.has('yaw') || params.has('pitch')) {
  const deg = (k) => MathUtils.degToRad(Number(params.get(k) || 0));
  motion.forced = new Quaternion().setFromEuler(new Euler(-deg('pitch'), deg('yaw'), 0, 'YXZ'));
}

let layout = null;
let helmet = null;
let helmetShown = false;
let entryStart = 0;
let entry = 0;
let active = -1;
let lastFrame = 0;
let wasBusy = false;
const pointer = { x: 0, y: 0, inside: false };
const trail = [];
const touch = { enabled: coarse, tap: null, tourAt: 0, tourIndex: 0, tiltAt: -1e9, tiltBase: null, asked: false, finger: false };

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  if (governor.fixed == null) governor.dpr = Math.min(governor.dpr, governor.cap(w, h));
  const dpr = governor.dpr;
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  Object.assign(view, { W: w, H: h, aspect: w / h, tan: viewTan(w / h) });
  camera.aspect = view.aspect;
  camera.fov = MathUtils.radToDeg(2 * Math.atan(view.tan));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  layout = computeLayout(view);

  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  sceneRT.setSize(pw, ph);
  stage.resize(pw, ph);
  stage.layout(layout, camera);
  cards.forEach((c, i) => c.place(layout.cards[i], view, layout.open));
  names.layout(view, layout);
  title.layout(layout);
  Object.assign(titleEl.style, {
    left: `${title.box.x}px`,
    top: `${title.box.y}px`,
    width: `${title.box.w}px`,
    lineHeight: `${title.box.h}px`,
    fontSize: `${layout.title.size}px`,
  });
  booking.layout(view, layout);
  haze.resize(w, h);

  layout.names.forEach((n, i) => {
    const el = nameEls[i];
    el.style.left = `${n.x}px`;
    el.style.top = `${n.y}px`;
    el.style.transform = `translate(${n.align === 'right' ? '-100%' : '0'}, ${n.base === 'middle' ? '-50%' : n.base === 'bottom' ? '-100%' : '0'})`;
  });

  room.uRoom.value.set(ROOM_LY * view.aspect, ROOM_LY, ROOM_LY * ROOM_DEPTH);
  layout.cards.forEach((c, i) => {
    room.uCardRect.value[i].set(c.x / w, 1 - (c.y + c.h) / h, (c.x + c.w) / w, 1 - c.y / h);
    hu.uCards.value[i].set(c.x, h - (c.y + c.h), c.x + c.w, h - c.y);
  });
  hu.uHelmet.value.set(layout.helmet.x, h - layout.helmet.y, layout.helmet.r);
  hu.uPill.value.set(layout.pill.x, h - layout.pill.y, PILL.w / 2, PILL.h / 2);
  hu.uView.value.set(view.halfH(0.6) * view.aspect, view.halfH(0.6), CAMERA_Y);
  hu.uFade.value = 1;
  wake();
}
addEventListener('resize', resize);
live = true;
resize();

// ---------- render on demand ----------

function wake() {
  if (!raf && !capture && live) raf = requestAnimationFrame(frame);
}

function frame(now) {
  raf = 0;
  const consecutive = wasBusy && now - lastFrame < 100;
  const dt = consecutive ? Math.min((now - lastFrame) / 1000, 0.05) : 1 / 60;
  const t0 = performance.now();
  const busy = update(dt, now);
  hud?.beginGpu();
  render(now);
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

function render(now) {
  stage.reflect(renderer, scene, camera, front);
  renderer.setRenderTarget(sceneRT);
  renderer.setClearColor(CSS.stage, 1);
  renderer.clear(true, true, false);
  renderer.render(scene, camera);
  renderer.render(names.scene, names.camera);
  haze.render(sceneRT.texture, now / 1000);
  renderer.clearDepth();
  renderer.render(front, camera);
}

const backOut = (t, c = 1.6) => 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
const easeOut = (t) => 1 - (1 - t) ** 3;
const _q = new Quaternion();
const _m = new Matrix4();
const ID = new Quaternion();
const SPILL_K = (CAMERA_Z - WALL_Z) / (CAMERA_Z - CARD_Z);

// pointer velocity over the last few events, CSS px/s
function pointerVelocity(now) {
  while (trail.length && now - trail[0].t > 70) trail.shift();
  if (trail.length < 2) return null;
  const a = trail[0];
  const b = trail[trail.length - 1];
  const dt = (b.t - a.t) / 1000;
  if (dt < 0.008) return null;
  return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
}

function update(dt, now) {
  let busy = false;
  if (touch.enabled) busy = touchTour(now) || busy;

  const vel = pointerVelocity(now);
  const speed = vel ? Math.hypot(vel.x, vel.y) : 0;
  const redline = speed > REDLINE_SPEED && !reduced;
  if (redline) arc.flick(now);
  if (trail.length) busy = true;

  if (helmetShown) {
    busy = motion.update(dt, now) || busy;
    helmet.rig.quaternion.copy(motion.display);
    helmet.rig.position.copy(helmet.pivot).add(motion.position);
    helmet.spin.quaternion.copy(motion.spin.q);
    if (entry < 1) {
      entry = Math.min(1, (now - entryStart) / 900);
      const t = reduced ? 1 : entry;
      helmet.rest.scale.setScalar(HELMET_SCALE * (0.86 + 0.14 * backOut(t)));
      helmetExposure.value = easeOut(Math.min(1, entry / 0.6));
      busy = true;
    }
    busy = arc.update(dt, now, motion.display, reduced, !pointer.inside && !touch.enabled) || busy;
  }

  // chrome everywhere follows the helmet a little, so its highlights slide as the head turns
  _q.copy(ID).slerp(motion.display, 0.35);
  room.uChromeRot.value.setFromMatrix4(_m.makeRotationFromQuaternion(_q));

  busy = updateCards(cards, dt, { pointer, active, view, flick: speed > WOBBLE_SPEED && !reduced ? vel : null, still: reduced }) || busy;
  let spill = -1;
  cards.forEach((c, i) => {
    const w = Math.max(0, c.wake.x);
    room.uLevel.value.setComponent(i, REST_LEVEL + (1 - REST_LEVEL) * Math.min(1, w));
    hu.uWake.value.setComponent(i, Math.min(1, w));
    if (w > 0.01 && (spill < 0 || w > cards[spill].wake.x)) spill = i;
  });
  if (spill >= 0) {
    const c = cards[spill];
    stage.spill.uSpillTex.value = clips.list[spill].current;
    stage.spill.uSpillPos.value.set(c.base.x * SPILL_K, CAMERA_Y + (c.base.y - CAMERA_Y) * SPILL_K);
    stage.spill.uSpillAmt.value = Math.min(1, c.wake.x);
  } else {
    stage.spill.uSpillAmt.value = 0;
  }

  busy = names.update(dt, now, active) || busy;
  busy = booking.update(dt, now) || busy;
  const lens = booking.lens;
  hu.uLens.value.set(lens.centre.x, view.H - lens.centre.y, lens.radius, lens.open);

  haze.feed(pointer, dt, redline);
  busy = haze.update(dt) || busy;
  return busy;
}

// ---------- hover → play ----------
function setActive(i) {
  if (i === active) return;
  active = i;
  nameEls.forEach((el, j) => el.classList.toggle('on', j === i));
  if (i >= 0) {
    clips.play(i);
    booking.setPillar(i);
  } else {
    clips.pauseAll();
  }
  wake();
}

// ---------- input ----------
let drag = null;
const _c = new Vector3();

function overHelmet(cx, cy) {
  if (!helmetShown) return false;
  helmet.spin.getWorldPosition(_c).project(camera);
  const sx = (_c.x * 0.5 + 0.5) * view.W;
  const sy = (-_c.y * 0.5 + 0.5) * view.H;
  return Math.hypot(cx - sx, cy - sy) < (HELMET_RADIUS / view.pxToWorld(0)) * 0.85;
}

const ndc = (x, y) => [(x / view.W) * 2 - 1, -((y / view.H) * 2 - 1)];
const inLens = (x, y) => booking.isOpen() && Math.hypot(x - booking.lens.centre.x, y - booking.lens.centre.y) < booking.lens.radius;

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
  if (e.pointerType === 'touch') {
    // a finger dragging across the stage leaves haze behind it
    if (!touch.finger) return;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    trail.push({ x: e.clientX, y: e.clientY, t: clock() });
    wake();
    return;
  }
  touch.enabled = false;
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.inside = true;
  trail.push({ x: e.clientX, y: e.clientY, t: clock() });
  motion.setPointer(...ndc(e.clientX, e.clientY), clock());
  if (!inLens(e.clientX, e.clientY)) setActive(cardAt(layout, e.clientX, e.clientY, FRAME_PX + 2));
  document.body.classList.toggle('grab', overHelmet(e.clientX, e.clientY) && !inLens(e.clientX, e.clientY));
  wake();
});

const leave = () => {
  if (drag) return;
  motion.leave();
  pointer.inside = false;
  trail.length = 0;
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
  if (booking.outside(e.clientX, e.clientY)) return;
  if (overHelmet(e.clientX, e.clientY) && !inLens(e.clientX, e.clientY)) {
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: stamp(e), moved: false };
    canvas.setPointerCapture(e.pointerId);
    motion.startDrag();
    document.body.classList.add('grabbing');
    e.preventDefault();
    wake();
  } else if (e.pointerType === 'touch') {
    touch.tap = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    touch.finger = true;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.inside = true;
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
const endFinger = () => {
  if (!touch.finger) return;
  touch.finger = false;
  pointer.inside = false;
  trail.length = 0;
};
canvas.addEventListener('pointercancel', (e) => {
  endDrag(e);
  endFinger();
});
canvas.addEventListener('pointerup', (e) => {
  if (endDrag(e) || e.pointerType !== 'touch' || !touch.tap) return;
  endFinger();
  const moved = Math.hypot(e.clientX - touch.tap.x, e.clientY - touch.tap.y);
  touch.tap = null;
  if (moved < 12) onTap(e.clientX, e.clientY);
});

// ---------- touch: card tour, tap to play, tilt to look ----------
const TOUR = [0, 1, 3, 2];
const cardNdc = (i) => {
  const c = layout.cards[i];
  return ndc(c.x + c.w / 2, c.y + c.h / 2);
};

function touchTour(now) {
  if (active >= 0 || now - touch.tiltAt < 2500 || touch.finger) return false;
  if (now - touch.tourAt > 2400) {
    touch.tourAt = now;
    motion.setPointer(...cardNdc(TOUR[touch.tourIndex++ % TOUR.length]), now);
  }
  return true;
}

function onTap(x, y) {
  touch.enabled = true;
  askForTilt();
  const i = cardAt(layout, x, y, 10);
  if (i < 0 || i === active) {
    setActive(-1);
  } else {
    setActive(i);
    motion.setPointer(...cardNdc(i), clock());
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

// ---------- arrival: the stage and its stills, then the helmet, warmed up; footage last ----------
const timeout = (ms) => new Promise((r) => setTimeout(r, ms));
const stillsReady = Promise.race([Promise.all(clips.list.map((c) => c.stillReady)), timeout(3000)]);

stillsReady.then(async () => {
  for (const c of clips.list) if (c.still) renderer.initTexture(c.still);
  await renderer.compileAsync(scene, camera);
  await renderer.compileAsync(haze.scene, haze.camera);
  await renderer.compileAsync(front, camera);
  render(clock());
  canvas.classList.add('ready');
  perf.stageAt = performance.now();
  if (capture) clips.loadAll();
  else setTimeout(() => clips.loadAll(), 250);
  wake();
});

loadHelmet(renderer, config.helmet, base, room, helmetExposure).then(async (h) => {
  helmet = h;
  // Warm-up, off stage: upload every texture and compile every program before
  // the first frame that shows the helmet, so its first turn never hitches.
  const warm = new Scene();
  warm.environment = scene.environment;
  warm.add(h.rig);
  for (const t of h.textures) renderer.initTexture(t);
  await renderer.compileAsync(warm, camera);
  await stillsReady;
  const rt = new WebGLRenderTarget(64, 64);
  renderer.setRenderTarget(rt);
  renderer.render(warm, camera);
  renderer.setRenderTarget(null);
  rt.dispose();

  scene.add(h.rig);
  helmetShown = true;
  entryStart = clock();
  perf.helmetAt = performance.now();
  motion.lastMoveAt = entryStart;
  if (!reduced) arc.sweep(entryStart);
  wake();
});

if (capture) {
  const { installCapture } = await import('./capture.js');
  installCapture({ capture, clips, step: (dt) => (update(dt, capture.now), render(capture.now)) });
}
