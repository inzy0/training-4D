// Kinematics: smoothing, 3D joint angles, range of motion, angular velocity,
// and short-horizon extrapolation.
//
// Angles use the models' WORLD landmarks (metres, 3D, depth estimated from a
// single camera). They are unvalidated estimates: no comparison against a
// goniometer or motion capture has been run for this build (see gate V1 in
// docs/ANATOMY_LAB_PLAN.md).

// One Euro filter (Casiez, Roussel & Vogel, CHI 2012): adaptive low-pass that
// cuts jitter at rest and lag during fast motion.
export class OneEuro {
  constructor(minCutoff = 1.0, beta = 0.0, dCutoff = 1.0) {
    this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff;
    this.x = null; this.dx = 0; this.t = null;
  }
  static alpha(cutoff, dt) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }
  filter(value, tSec) {
    if (this.t === null || !Number.isFinite(this.x)) { this.x = value; this.t = tSec; this.dx = 0; return value; }
    const dt = Math.max(1e-3, tSec - this.t); this.t = tSec;
    const rawDx = (value - this.x) / dt;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuro.alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }
  reset() { this.x = null; this.t = null; this.dx = 0; }
}

// Smooths a whole landmark list (x, y, z per point) and exposes velocity.
export class LandmarkSmoother {
  constructor(n, minCutoff = 1.5, beta = 8.0) {
    this.f = Array.from({ length: n }, () => [new OneEuro(minCutoff, beta), new OneEuro(minCutoff, beta), new OneEuro(minCutoff, beta)]);
    this.lastSeen = -1;
  }
  apply(points, tSec) {
    if (this.lastSeen >= 0 && tSec - this.lastSeen > 0.5) this.f.forEach((a) => a.forEach((g) => g.reset()));
    this.lastSeen = tSec;
    this.last = points.map((p, i) => ({
      x: this.f[i][0].filter(p.x, tSec), y: this.f[i][1].filter(p.y, tSec), z: this.f[i][2].filter(p.z ?? 0, tSec),
      vx: this.f[i][0].dx, vy: this.f[i][1].dx, visibility: p.visibility,
    }));
    return this.last;
  }
  // display-only frames between two detections: the last smoothed points moved on by their filtered velocity,
  // at most `maxH` seconds ahead (constant-velocity guess; never fed back into the filters or the angles)
  predict(tSec, maxH = 0.08) {
    if (!this.last) return null;
    const h = Math.max(0, Math.min(maxH, tSec - this.lastSeen));
    return this.last.map((p) => ({ ...p, x: p.x + p.vx * h, y: p.y + p.vy * h }));
  }
}

// Linear extrapolation of smoothed points `horizon` seconds ahead. This is a
// constant-velocity guess, not a learned or validated motion prediction.
export function extrapolate(points, horizon) {
  return points.map((p) => ({ ...p, x: p.x + p.vx * horizon, y: p.y + p.vy * horizon }));
}

const sub = (a, b) => [a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const n = norm(a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };

export function angleDeg(a, b, c) {
  const u = sub(a, b), v = sub(c, b); const nu = norm(u), nv = norm(v);
  if (!nu || !nv) return NaN;
  return (Math.acos(Math.max(-1, Math.min(1, dot(u, v) / (nu * nv)))) * 180) / Math.PI;
}

// Flexion of a hinge joint: 0 = straight, grows as the joint bends.
export const hingeFlexion = (p, j, n) => 180 - angleDeg(p, j, n);

// Shoulder: elevation of the arm from the side of the trunk, and the plane it
// is raised in (flexion = forward, abduction = sideways), from a torso frame
// built on the world landmarks. MediaPipe world axes: x right, y DOWN, z toward
// the camera is negative.
export function shoulderAngles(w, side) {
  const ls = w[11], rs = w[12], lh = w[23], rh = w[24];
  const sh = side === 'l' ? ls : rs, el = side === 'l' ? w[13] : w[14];
  const midS = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2, z: (ls.z + rs.z) / 2 };
  const midH = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2, z: (lh.z + rh.z) / 2 };
  const down = unit(sub(midH, midS));
  const lat0 = unit(sub(side === 'l' ? ls : rs, side === 'l' ? rs : ls)); // outward for this side
  const fwd = unit(cross(down, lat0));
  const lat = unit(cross(fwd, down));
  const arm = unit(sub(el, sh));
  const elevation = (Math.acos(Math.max(-1, Math.min(1, dot(arm, down)))) * 180) / Math.PI;
  const f = dot(arm, fwd), l = dot(arm, lat);
  // Sign of fwd depends on the side's cross-product handedness; use magnitude
  // ratio for plane and keep elevation unsigned.
  const plane = Math.abs(f) > Math.abs(l) ? 'flexion' : 'abduction';
  return { elevation, plane, planeDeg: (Math.atan2(Math.abs(f), Math.abs(l)) * 180) / Math.PI };
}

// Per-joint live state: smoothed angle, angular velocity, session ROM, history.
export class JointTrack {
  constructor(id, label, zone) {
    this.id = id; this.label = label; this.zone = zone;
    this.f = new OneEuro(1.2, 0.05, 1.0);
    this.angle = NaN; this.vel = 0; this.min = Infinity; this.max = -Infinity;
    this.hist = []; this.extra = '';
    this.lastT = -1;
  }
  update(raw, tSec, extra = '') {
    if (!Number.isFinite(raw)) return;
    if (this.lastT >= 0 && tSec - this.lastT > 0.5) this.f.reset();
    this.lastT = tSec;
    this.angle = this.f.filter(raw, tSec); this.vel = this.f.dx; this.extra = extra;
    this.min = Math.min(this.min, this.angle); this.max = Math.max(this.max, this.angle);
    this.hist.push([tSec, this.angle]);
    while (this.hist.length && tSec - this.hist[0][0] > 10) this.hist.shift();
  }
  fresh(tSec) { return this.lastT >= 0 && tSec - this.lastT < 0.5; }
  resetRom() { this.min = Infinity; this.max = -Infinity; }
}

// Movement phase from angular velocity (deg/s). Threshold keeps jitter quiet.
export function phaseOf(vel, threshold = 35) {
  if (vel > threshold) return 'flexing';
  if (vel < -threshold) return 'extending';
  return 'holding';
}
