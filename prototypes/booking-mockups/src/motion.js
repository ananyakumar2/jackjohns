import { Euler, MathUtils, Quaternion, Vector3 } from 'three';

// Frame-rate independent smoothing factor: identical feel at 60 and 120 Hz.
export const smoothing = (s, dt) => 1 - Math.pow(1 - s, 60 * dt);

const MAX_PITCH = MathUtils.degToRad(60);
const MAX_YAW = MathUtils.degToRad(82);
const MAX_ROLL = MathUtils.degToRad(11);
const LOOK_PLANE_Z = 2.2; // the cursor ray lands on this plane just in front of the visor

const _q = new Quaternion();
const _q2 = new Quaternion();
const _v = new Vector3();
const _v2 = new Vector3();
const _e = new Euler(0, 0, 0, 'YXZ');
const IDENTITY = new Quaternion();
const Z_AXIS = new Vector3(0, 0, 1);

function logQ(q, out) {
  let { x, y, z, w } = q;
  if (w < 0) {
    x = -x; y = -y; z = -z; w = -w;
  }
  const s = Math.hypot(x, y, z);
  if (s < 1e-9) return out.set(2 * x, 2 * y, 2 * z);
  return out.set(x, y, z).multiplyScalar((2 * Math.atan2(s, w)) / s);
}

function expQ(v, out) {
  const a = v.length();
  if (a < 1e-9) return out.set(v.x / 2, v.y / 2, v.z / 2, 1).normalize();
  const s = Math.sin(a / 2) / a;
  return out.set(v.x * s, v.y * s, v.z * s, Math.cos(a / 2));
}

// Damped spring on orientation. w is angular velocity in the parent frame.
class OrientationSpring {
  constructor(wn, zeta) {
    this.q = new Quaternion();
    this.w = new Vector3();
    this.wn = wn;
    this.zeta = zeta;
    this.error = 0;
  }

  step(target, dt, friction = 0) {
    const n = Math.max(1, Math.ceil(dt * 240));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      logQ(_q.copy(target).multiply(_q2.copy(this.q).invert()), _v);
      this.w.addScaledVector(_v, this.wn * this.wn * h).multiplyScalar(Math.max(0, 1 - (2 * this.zeta * this.wn + friction) * h));
      this.q.premultiply(expQ(_v2.copy(this.w).multiplyScalar(h), _q)).normalize();
    }
    this.error = _v.length();
  }

  get resting() {
    return this.error < 2e-4 && this.w.lengthSq() < 4e-8;
  }
}

export class HeadMotion {
  constructor({ camera, reduced = false }) {
    this.camera = camera;
    this.reduced = reduced;

    // pointer in NDC, and whether it's in the window at all
    this.pointer = { x: 0, y: 0 };
    this.inside = false;
    this.lastMoveAt = -1e9;

    this.target = new Quaternion(); // where the cursor says to look
    this.goal = new Quaternion(); // target plus idle micro-movement
    this.smoothed = new Quaternion(); // slerped towards goal, s = 0.1
    this.look = new OrientationSpring(10, reduced ? 1 : 0.4); // with mass: slight overshoot
    this.roll = 0;
    this.lean = new Vector3();
    this.idle = 0; // idle envelope 0..1
    this.time = 0;

    // drag-to-spin
    this.spin = new OrientationSpring(0, 0.8);
    this.dragging = false;
    this.dragVel = new Vector3(); // world-space angular velocity while dragging
    this.releasedAt = -1;

    this.forced = null; // fixed look orientation for stills (?yaw=&pitch=)
    this.display = new Quaternion(); // look-at (with roll and idle)
    this.position = new Vector3();
    this.settled = false;
  }

  setPointer(x, y, now) {
    this.pointer.x = x;
    this.pointer.y = y;
    this.inside = true;
    this.lastMoveAt = now;
  }

  leave() {
    this.inside = false;
  }

  // Cast a ray from the camera through the cursor onto a plane just in front of
  // the helmet and turn the visor to face the hit point. Yaw first, then pitch.
  aim(x, y, out) {
    const cam = this.camera;
    const tanY = Math.tan(MathUtils.degToRad(cam.fov / 2));
    const dir = _v.set(x * tanY * cam.aspect, y * tanY, -1).normalize();
    const t = (LOOK_PLANE_Z - cam.position.z) / dir.z;
    const hit = _v2.copy(cam.position).addScaledVector(dir, t);
    const yaw = MathUtils.clamp(Math.atan2(hit.x, hit.z), -MAX_YAW, MAX_YAW);
    const pitch = MathUtils.clamp(Math.atan2(hit.y, Math.hypot(hit.x, hit.z)), -MAX_PITCH, MAX_PITCH);
    return out.setFromEuler(_e.set(-pitch, yaw, 0, 'YXZ'));
  }

  startDrag() {
    this.dragging = true;
    this.dragVel.set(0, 0, 0);
  }

  // dx, dy in CSS px. The increment is a world (screen) rotation, carried into
  // the spin's frame so that look-at * spin * rest stays one clean composition.
  drag(dx, dy, dtMs) {
    const angle = Math.hypot(dx, dy) * 0.0085;
    if (angle < 1e-6) return;
    const axis = _v.set(dy, dx, 0).normalize();
    const w = _q.setFromAxisAngle(axis, angle);
    const lInv = _q2.copy(this.display).invert();
    // spin' = L^-1 * W * L * spin
    this.spin.q.premultiply(lInv.multiply(w).multiply(this.display)).normalize();
    const vel = axis.multiplyScalar(angle / Math.max(dtMs / 1000, 1 / 240));
    this.dragVel.lerp(vel, 0.5);
  }

  endDrag(now) {
    this.dragging = false;
    this.releasedAt = now;
    if (this.reduced) {
      this.spin.w.set(0, 0, 0);
      return;
    }
    if (this.dragVel.length() > 18) this.dragVel.setLength(18);
    this.spin.w.copy(this.dragVel).applyQuaternion(_q.copy(this.display).invert());
  }

  update(dt, now) {
    this.time += dt;
    const still = (now - this.lastMoveAt) / 1000;

    // idle micro-movement: fades in once the cursor rests, out again after a while
    let idleTarget = 0;
    if (!this.reduced && !this.dragging) idleTarget = still > 0.6 && still < 12 ? 1 : 0;
    this.idle += (idleTarget - this.idle) * smoothing(idleTarget ? 0.03 : 0.02, dt);
    if (this.idle < 1e-3 && !idleTarget) this.idle = 0;

    if (this.forced) this.target.copy(this.forced);
    else if (!this.dragging) {
      if (this.inside) this.aim(this.pointer.x, this.pointer.y, this.target);
      else this.target.identity();
    }
    if (this.idle > 0) {
      const t = this.time;
      _e.set(
        this.idle * (0.022 * Math.sin(t * 0.53 + 1.3) + 0.012 * Math.sin(t * 1.21)),
        this.idle * (0.034 * Math.sin(t * 0.71) + 0.014 * Math.sin(t * 1.37 + 0.4)),
        this.idle * 0.016 * Math.sin(t * 0.41 + 2.1),
        'YXZ',
      );
      this.goal.copy(this.target).multiply(_q2.setFromEuler(_e));
    } else {
      this.goal.copy(this.target);
    }
    this.smoothed.slerp(this.goal, smoothing(this.inside ? 0.1 : 0.05, dt));
    this.look.step(this.smoothed, dt);

    // lean into fast turns: roll about the head's own forward axis
    const rollTarget = this.reduced ? 0 : MathUtils.clamp(-this.look.w.y * 0.07, -MAX_ROLL, MAX_ROLL);
    this.roll += (rollTarget - this.roll) * smoothing(0.14, dt);
    this.display.copy(this.look.q).multiply(_q.setFromAxisAngle(Z_AXIS, this.roll));

    // two-speed lag: the head drifts towards the cursor slower than it turns
    const lx = this.inside && !this.dragging ? this.pointer.x * 0.16 : 0;
    const ly = this.inside && !this.dragging ? this.pointer.y * 0.1 : 0;
    const k = smoothing(0.035, dt);
    this.lean.x += (lx - this.lean.x) * k;
    this.lean.y += (ly - this.lean.y) * k;
    const float = this.reduced ? 0 : this.idle * 0.03 * Math.sin(this.time * 1.3);
    this.position.set(this.lean.x, this.lean.y + float, 0);

    // spin: momentum first, then a spring that firms up and brings it home
    if (!this.dragging) {
      const since = (now - this.releasedAt) / 1000;
      this.spin.wn = 6.5 * MathUtils.smoothstep(since, 0.12, 0.9);
      this.spin.step(IDENTITY, dt, 2.2);
      if (this.spin.resting) {
        this.spin.q.identity();
        this.spin.w.set(0, 0, 0);
      }
    }

    const leanSettled = Math.abs(this.lean.x - lx) < 1e-4 && Math.abs(this.lean.y - ly) < 1e-4;
    const spinSettled = !this.dragging && this.spin.q.equals(IDENTITY);
    this.settled =
      this.look.resting && Math.abs(this.roll - rollTarget) < 1e-4 && leanSettled && this.idle === 0 && spinSettled &&
      this.smoothed.angleTo(this.goal) < 1e-4;
    return !this.settled;
  }
}
