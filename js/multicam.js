// Multi-camera pose fusion (2-4 cameras on this machine).
//
// The primary camera is the Live Mirror camera. Each extra camera runs its own
// pose landmarker. MediaPipe's world landmarks are metric 3D points centred on
// the hips, expressed in that camera's orientation, so the cameras differ by a
// rotation. Each frame (or once, when locked) that rotation is found from the
// joints both cameras see clearly (Horn's closed-form absolute orientation,
// least squares), every camera's skeleton is rotated into the primary frame,
// and each joint is averaged with weights = how clearly each camera sees it.
// A joint hidden from the primary camera is then filled in by the others.
//
// Reported per camera: frames per second, joints it contributes, and the RMS
// disagreement with the primary after alignment (mm) - a real consistency
// measure, not an accuracy figure. Frames are matched by "latest available"
// (no hardware sync), so fast movements can differ by up to one frame
// (~33 ms at 30 fps).

import { FilesetResolver, PoseLandmarker } from '/training-4D/rt/vendor/mediapipe/vision_bundle.mjs';

const cams = [];            // { id, label, video, lm, res, t, n, fps, q, locked, resid, used }
let fileset = null, modelFile = 'pose_landmarker_full.task';

export const multicam = { cams, get active() { return cams.length > 0; } };

export async function listCameras() {
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === 'videoinput').map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` }));
}
export function setMulticamModel(file) { modelFile = file; }

export async function addCamera(deviceId, label) {
  if (cams.length >= 3) throw new Error('Up to 3 extra cameras (4 in total)');
  if (cams.some((c) => c.id === deviceId)) return;
  fileset ||= await FilesetResolver.forVisionTasks('/training-4D/rt/vendor/mediapipe/wasm');
  const lm = await PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: `/training-4D/rt/models/${modelFile}`, delegate: 'GPU' }, runningMode: 'VIDEO', numPoses: 1 });
  const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.srcObject = stream; await video.play();
  const c = { id: deviceId, label, video, lm, res: null, t: 0, lastVT: -1, n: 0, fpsT: performance.now(), fps: 0, q: null, locked: null, resid: null, used: 0, capT: null, fresh: false, lag: null };
  // record each new camera frame's capture time, so detections can be matched to the primary frame in time
  if (video.requestVideoFrameCallback) { const cb = (now, meta) => { c.capT = meta.captureTime || meta.expectedDisplayTime || now; c.fresh = true; if (cams.includes(c)) video.requestVideoFrameCallback(cb); }; video.requestVideoFrameCallback(cb); }
  cams.push(c);
}
export function removeCamera(deviceId) {
  const i = cams.findIndex((c) => c.id === deviceId); if (i < 0) return;
  const c = cams[i]; c.video.srcObject?.getTracks().forEach((tr) => tr.stop()); c.lm.close?.(); cams.splice(i, 1);
}
// freeze each camera's rotation (average of the recent estimates): do it while standing still, fully in view of every camera
export function lockAlignment(on = true) { cams.forEach((c) => { c.locked = on && c.q ? c.q.slice() : null; }); }

// ------------------------------------------------------------------ per frame
let rr = 0;
export function fusePose(primary, now) {
  const pw = primary?.worldLandmarks?.[0], pi = primary?.landmarks?.[0];
  // round-robin: with several extra cameras, one extra detection per primary frame keeps the frame time steady
  const due = cams.length > 1 ? [cams[rr++ % cams.length]] : cams;
  for (const c of due) {
    const fresh = c.video.requestVideoFrameCallback ? c.fresh : c.video.currentTime !== c.lastVT;
    if (c.video.readyState >= 2 && fresh) {
      c.lastVT = c.video.currentTime; c.fresh = false;
      try { c.res = c.lm.detectForVideo(c.video, now); c.t = now; c.n++; c.lag = c.capT != null ? performance.now() - c.capT : null; } catch { /* skip frame */ }
    }
  }
  for (const c of cams) if (performance.now() - c.fpsT > 1000) { c.fps = (c.n * 1000) / (performance.now() - c.fpsT); c.n = 0; c.fpsT = performance.now(); }
  if (!pw || !pi) return primary;
  const N = pw.length, sum = Array.from({ length: N }, () => [0, 0, 0, 0]), vis = new Array(N).fill(0);
  const pv = (i) => Math.max(0, Math.min(1, pi[i].visibility ?? 0));
  for (let i = 0; i < N; i++) { const w = pv(i); sum[i][0] += w * pw[i].x; sum[i][1] += w * pw[i].y; sum[i][2] += w * pw[i].z; sum[i][3] += w; vis[i] = w; }
  for (const c of cams) {
    c.used = 0; const cw = c.res?.worldLandmarks?.[0], ci = c.res?.landmarks?.[0];
    if (!cw || now - c.t > 150 * Math.max(1, cams.length)) continue; // stale result (round-robin spreads updates over the cameras)
    const cv = (i) => Math.max(0, Math.min(1, ci[i].visibility ?? 0));
    const pairs = []; for (let i = 0; i < N; i++) if (pv(i) > 0.6 && cv(i) > 0.6) pairs.push(i);
    if (pairs.length >= 6) {
      const qn = horn(pairs.map((i) => [cw[i].x, cw[i].y, cw[i].z]), pairs.map((i) => [pw[i].x, pw[i].y, pw[i].z]));
      c.q = c.q ? slerp(c.q, qn, 0.15) : qn;
    }
    const q = c.locked || c.q; if (!q) continue;
    let se = 0, ne = 0;
    for (let i = 0; i < N; i++) {
      const w = cv(i); if (w < 0.3) continue;
      const r = rot(q, [cw[i].x, cw[i].y, cw[i].z]);
      sum[i][0] += w * r[0]; sum[i][1] += w * r[1]; sum[i][2] += w * r[2]; sum[i][3] += w; vis[i] = Math.max(vis[i], w); c.used++;
      if (pv(i) > 0.6 && w > 0.6) { se += (r[0] - pw[i].x) ** 2 + (r[1] - pw[i].y) ** 2 + (r[2] - pw[i].z) ** 2; ne++; }
    }
    c.resid = ne ? Math.sqrt(se / ne) * 1000 : null;
  }
  if (!cams.some((c) => c.used)) return primary;
  const fw = sum.map((s, i) => (s[3] > 0 ? { x: s[0] / s[3], y: s[1] / s[3], z: s[2] / s[3], visibility: vis[i] } : { ...pw[i] }));
  // image landmarks stay the primary camera's (for the overlay and jump height); `pvis` keeps its own visibility
  const fi = pi.map((p, i) => ({ ...p, visibility: vis[i], pvis: p.visibility }));
  return { ...primary, worldLandmarks: [fw], landmarks: [fi], fused: cams.filter((c) => c.used).length + 1 };
}

// ------------------------------------------------------------------ maths
// Horn (1987): unit quaternion q minimising sum |R(q) a_i - b_i|^2 (both sets centred first)
function horn(A, B) {
  const ca = [0, 0, 0], cb = [0, 0, 0];
  A.forEach((a, k) => { for (let j = 0; j < 3; j++) { ca[j] += a[j] / A.length; cb[j] += B[k][j] / A.length; } });
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  A.forEach((a, k) => { for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) S[r][c] += (a[r] - ca[r]) * (B[k][c] - cb[c]); });
  const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = S;
  const Nm = [
    [xx + yy + zz, yz - zy, zx - xz, xy - yx],
    [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
    [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
  ];
  // largest eigenvector by power iteration on N + cI (shift makes it positive definite)
  const sh = Math.abs(xx) + Math.abs(yy) + Math.abs(zz) + Math.abs(xy) + Math.abs(xz) + Math.abs(yx) + Math.abs(yz) + Math.abs(zx) + Math.abs(zy) + 1e-9;
  let v = [1, 0, 0, 0];
  for (let it = 0; it < 60; it++) {
    const nv = [0, 0, 0, 0]; for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) nv[r] += (Nm[r][c] + (r === c ? sh : 0)) * v[c];
    const n = Math.hypot(...nv); v = nv.map((x) => x / n);
  }
  return v; // [w, x, y, z]
}
function rot(q, p) { // p' = p + w t + qv x t, with t = 2 qv x p
  const [w, x, y, z] = q, [px, py, pz] = p;
  const tx = 2 * (y * pz - z * py), ty = 2 * (z * px - x * pz), tz = 2 * (x * py - y * px);
  return [px + w * tx + (y * tz - z * ty), py + w * ty + (z * tx - x * tz), pz + w * tz + (x * ty - y * tx)];
}
function slerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; if (d < 0) { b = b.map((x) => -x); d = -d; }
  const o = a.map((x, i) => x + t * (b[i] - x)); const n = Math.hypot(...o); return o.map((x) => x / n);
}
