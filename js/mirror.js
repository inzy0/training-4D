// Live X-ray mirror: camera -> MediaPipe hand / face / pose landmarkers (WASM,
// on this machine) -> schematic bone overlay, labels, joint angles, range of
// motion, movement phase, textbook prime movers, and a short extrapolated
// "ghost". Nothing is uploaded; there is no network call after load.

import { FilesetResolver, HandLandmarker, FaceLandmarker, PoseLandmarker } from '/training-4D/rt/vendor/mediapipe/vision_bundle.mjs';
import {
  handBones, CARPALS, handJoints, FACE_OVAL, JAW, EYE_R, EYE_L, NOSE, SKULL_LABELS, BRAIN_LABELS,
  POSE_BONES, POSE_JOINTS, MUSCLE_ACTIONS, MODEL_ACCURACY, OPENSTAX_AP2E,
} from './anatomy_maps.js';
import { LandmarkSmoother, extrapolate, hingeFlexion, shoulderAngles, JointTrack, phaseOf } from './kinematics.js';
import { scanner, initScannerUI, setScannerEnabled, updateScanner } from './scanner.js';
import { initMirrorAR, setMirrorAR } from './mirror_ar.js';
import { multicam, fusePose, setMulticamModel } from './multicam.js';

const $ = (s) => document.querySelector(s);
const HAND_BONES = handBones();
const HAND_JOINTS = handJoints();
const GHOST_S = 0.2;

// Other views (Motion Lab) subscribe to processed frames; `extern.pose` keeps
// pose detection on for them even when the Body overlay is off.
const listeners = [];
export const extern = { pose: false };
export function subscribeFrames(fn) { listeners.push(fn); }

// heavy model too slow on this machine (fewer than 20 tracked frames in its first 5 s): fall back to full, once, and say so
let speed = null;
function watchPoseSpeed(now) {
  if (poseModel !== 'heavy') return;
  speed = speed || { t0: now, n: 0, done: false };
  if (speed.done) return;
  speed.n++;
  if (now - speed.t0 > 5000) {
    speed.done = true;
    if (speed.n < 20) {
      setPerfMode('balanced').then(() => {
        const pm = document.querySelector('#perf-mode'); if (pm) pm.value = 'balanced';
        const st = document.querySelector('#mirror-status'); if (st) st.textContent = `Live · Max accuracy ran at ${(speed.n / 5).toFixed(1)} fps here, switched to Balanced`;
        const sel = document.querySelector('#lab-posemodel'); if (sel) sel.value = 'full';
      });
    }
  }
}

// performance modes: pose model and how often the face / hand models run (in camera frames), staggered so that
// each frame does a similar amount of work (steadier frame times)
export const PERF = {
  accuracy: { label: 'Max accuracy', pose: 'heavy', face: 1, hands: 1, res: [1280, 720] },
  balanced: { label: 'Balanced', pose: 'full', face: 2, hands: 1, res: [1280, 720] },
  speed: { label: 'Max speed', pose: 'lite', face: 3, hands: 2, res: [960, 540] },
};
let perfMode = (() => { try { return localStorage.getItem('perfMode') || 'balanced'; } catch { return 'balanced'; } })();
export function getPerfMode() { return perfMode; }
export async function setPerfMode(m) {
  if (!PERF[m]) return; perfMode = m; try { localStorage.setItem('perfMode', m); } catch { /* private window */ }
  await setPoseModel(PERF[m].pose);
  const track = $('#cam')?.srcObject?.getVideoTracks()[0];
  if (track) { const [w, h] = PERF[m].res; try { await track.applyConstraints({ width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: 60 } }); } catch { /* camera keeps its mode */ } }
}
// frame-timing statistics shown in the header chip
const ST = { cam: [], det: [], disp: [], detMs: 0, intervals: [] };
const rate = (arr, now) => { while (arr.length && now - arr[0] > 1000) arr.shift(); return arr.length; };

// pose model: 'full' (faster) or 'heavy' (most accurate, better wrists/ankles/feet in fast movement)
let poseModel = (() => { try { return localStorage.getItem('poseModel') || 'full'; } catch { return 'full'; } })();
export function getPoseModel() { return poseModel; }
export async function setPoseModel(name) {
  poseModel = name; try { localStorage.setItem('poseModel', name); } catch { /* private window */ }
  setMulticamModel(`pose_landmarker_${name}.task`);
  if (state.worker) { await new Promise((res) => { state.onModel = res; state.worker.postMessage({ type: 'pose-model', pose: name }); setTimeout(res, 30000); }); return; }
  if (!state.landmarkers.pose || !state.fileset) return;
  const old = state.landmarkers.pose;
  state.landmarkers.pose = await PoseLandmarker.createFromOptions(state.fileset, { baseOptions: { modelAssetPath: `/training-4D/rt/models/pose_landmarker_${name}.task`, delegate: 'GPU' }, runningMode: 'VIDEO', numPoses: 1 });
  old.close?.();
}

const state = {
  running: false, landmarkers: {}, lastVideoTime: -1,
  layers: { hands: true, skull: true, brain: false, body: true, labels: true, angles: true, ghost: false, tint: true, scanner: false, ar: false },
  smoothers: { face: new LandmarkSmoother(478, 1.2, 6), pose: new LandmarkSmoother(33, 1.2, 6), hands: {} },
  joints: new Map(), selected: null, recording: null,
  fps: 0, frames: 0, fpsT: 0, uiT: 0,
};

// ------------------------------------------------------------------ setup
export async function startMirror() {
  if (state.running) return;
  if (state.starting) return state.starting;
  state.starting = startMirrorInner();
  return state.starting;
}
async function startMirrorInner() {
  const status = $('#mirror-status');
  try {
    status.textContent = 'Loading models (local)…';
    poseModel = PERF[perfMode].pose; setMulticamModel(`pose_landmarker_${poseModel}.task`);
    // detection in a background worker (drawing never waits); fall back to the main thread if the worker cannot start
    const engine = (() => { try { return localStorage.getItem('detEngine') || 'worker'; } catch { return 'worker'; } })();
    try { if (engine === 'main') throw new Error('main thread chosen'); state.worker = await startWorker(poseModel); state.engine = `worker (${state.workerDelegate})`; }
    catch (err) {
      console.warn('detection worker unavailable, using the main thread:', err);
      state.worker = null; state.engine = 'main thread';
      const fs = await FilesetResolver.forVisionTasks('/training-4D/rt/vendor/mediapipe/wasm'); state.fileset = fs;
      const base = (file) => ({ modelAssetPath: `/training-4D/rt/models/${file}`, delegate: 'GPU' });
      [state.landmarkers.hand, state.landmarkers.face, state.landmarkers.pose] = await Promise.all([
        HandLandmarker.createFromOptions(fs, { baseOptions: base('hand_landmarker.task'), runningMode: 'VIDEO', numHands: 2 }),
        FaceLandmarker.createFromOptions(fs, { baseOptions: base('face_landmarker.task'), runningMode: 'VIDEO', numFaces: 1 }),
        PoseLandmarker.createFromOptions(fs, { baseOptions: base(`pose_landmarker_${poseModel}.task`), runningMode: 'VIDEO', numPoses: 1 }),
      ]);
    }
    status.textContent = 'Requesting camera…';
    const [w, h] = PERF[perfMode].res;
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: 60 }, facingMode: 'user' }, audio: false });
    const video = $('#cam');
    video.srcObject = stream; await video.play();
    state.running = true;
    status.textContent = `Live · ${PERF[perfMode].label} · camera ${stream.getVideoTracks()[0].getSettings().frameRate?.toFixed?.(0) || '?'} fps · detection on the ${state.engine}`;
    $('#mirror-start').hidden = true;
    document.body.classList.add('cam-live');
    // detection runs once per new camera frame (requestVideoFrameCallback); drawing runs every display frame
    if (video.requestVideoFrameCallback) { const onFrame = (now, meta) => { if (!state.running) return; processFrame(now, meta); video.requestVideoFrameCallback(onFrame); }; video.requestVideoFrameCallback(onFrame); state.rvfc = true; }
    requestAnimationFrame(loop);
  } catch (e) {
    status.textContent = `Could not start: ${e.message || e}`;
    console.error(e);
  }
}

export function initMirrorUI() {
  $('#mirror-start').addEventListener('click', startMirror);
  const de = $('#det-engine'); if (de) { try { de.value = localStorage.getItem('detEngine') || 'worker'; } catch { /* default */ } de.onchange = () => { try { localStorage.setItem('detEngine', de.value); } catch { /* private window */ } const st = $('#mirror-status'); if (st && state.running) st.textContent = 'Engine change applies after reloading the page and starting the camera again.'; }; }
  const pm = $('#perf-mode'); if (pm) { pm.value = perfMode; pm.onchange = async () => { pm.disabled = true; await setPerfMode(pm.value); pm.disabled = false; const st = $('#mirror-status'); if (st && state.running) st.textContent = `Live · ${PERF[perfMode].label}`; }; }
  document.querySelectorAll('[data-layer]').forEach((el) => {
    el.checked = state.layers[el.dataset.layer];
    el.addEventListener('change', () => {
      state.layers[el.dataset.layer] = el.checked;
      document.body.classList.toggle('xray-tint', state.layers.tint);
      if (el.dataset.layer === 'scanner') setScannerEnabled(el.checked);
      if (el.dataset.layer === 'ar') setMirrorAR(el.checked);
    });
  });
  initScannerUI();
  initMirrorAR();
  document.body.classList.toggle('xray-tint', state.layers.tint);
  $('#rom-reset').addEventListener('click', () => state.joints.forEach((j) => j.resetRom()));
  $('#rec-btn').addEventListener('click', toggleRecording);
  $('#joint-table').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]'); if (tr) state.selected = tr.dataset.id;
  });
  $('#accuracy-list').innerHTML = MODEL_ACCURACY.map((a) => `
    <li><b>${a.model}</b><span class="mono">${a.value}</span><small>${a.metric}. ${a.note} <i>${a.src}</i></small></li>`).join('');
}

// ------------------------------------------------------------------ detection worker
function startWorker(pose) {
  return new Promise((resolve, reject) => {
    let w; try { w = new Worker('/training-4D/js/pose_worker.js', { type: 'module' }); } catch (e) { reject(e); return; }
    const to = setTimeout(() => { w.terminate(); reject(new Error('worker did not become ready in 90 s')); }, 90000);
    w.onerror = (e) => { clearTimeout(to); reject(e.error || new Error(e.message || 'worker error')); };
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'ready') { clearTimeout(to); state.workerDelegate = m.delegate; w.onmessage = onWorker; w.onerror = (ev) => console.error('worker', ev); resolve(w); }
      else if (m.type === 'error') { clearTimeout(to); reject(new Error(m.message)); }
    };
    w.postMessage({ type: 'init', pose });
  });
}
function onWorker(e) {
  const m = e.data;
  if (m.type === 'result') { if (m.delegate) state.engine = `worker (${m.delegate})`; if (m.backend) { state.backend = m.backend; console.info('detection backend', m.backend); } state.busy = false; const pend = state.pending; state.pending = null; if (pend) ST.latency = performance.now() - pend.sentAt; finishFrame(m, m.ts, m.ms); }
  else if (m.type === 'model') state.onModel?.();
  else if (m.type === 'error') { state.busy = false; console.error('worker:', m.message); }
}

// ------------------------------------------------------------------ frame processing (one detection per camera frame)
function processFrame(now, meta) {
  const video = $('#cam'), canvas = $('#overlay');
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
  if (video.readyState < 2) return;
  ST.cam.push(now);
  // capture timestamp of this frame (falls back to now); MediaPipe needs strictly increasing timestamps
  let ts = meta?.captureTime || (meta?.mediaTime != null ? meta.mediaTime * 1000 : now);
  if (state.lastTs != null && ts <= state.lastTs) ts = state.lastTs + 1;
  if (state.lastTs != null) { ST.intervals.push(ts - state.lastTs); if (ST.intervals.length > 60) ST.intervals.shift(); }
  state.lastTs = ts; state.k = (state.k || 0) + 1;
  const t = ts / 1000, L = state.layers, sc = scanner.enabled, P = PERF[perfMode], k = state.k;
  // stagger face and hands across frames when they do not run every frame
  const runFace = (L.skull || L.brain || sc) && (k % P.face === 0);
  const runHands = (L.hands || sc) && ((k + 1) % P.hands === 0);
  const runPose = !!(L.body || sc || extern.pose);
  if (state.worker) {
    // the worker is still on the previous frame: drop this one, so the overlay always shows the newest frame (no backlog)
    if (state.busy) { ST.drop = (ST.drop || 0) + 1; return; }
    state.busy = true; state.pending = { sentAt: performance.now() };
    createImageBitmap(video).then((bmp) => state.worker.postMessage({ type: 'frame', bmp, ts, hands: runHands, face: runFace, pose: runPose, id: k }, [bmp]))
      .catch(() => { state.busy = false; });
    return;
  }
  const t0 = performance.now(), res = {};
  if (runHands) res.hands = state.landmarkers.hand.detectForVideo(video, ts);
  if (runFace) res.face = state.landmarkers.face.detectForVideo(video, ts);
  if (runPose) res.pose = state.landmarkers.pose.detectForVideo(video, ts);
  finishFrame(res, ts, performance.now() - t0);
}

// a detection result (from the worker or the main thread): draw, update angles, feed the other views
function finishFrame(res, ts, ms) {
  const video = $('#cam'), canvas = $('#overlay'), now = performance.now(), t = ts / 1000, L = state.layers, sc = scanner.enabled;
  if (res.hands) state.lastHands = res.hands;
  if (res.face) state.lastFace = res.face;
  const hands = (L.hands || sc) ? state.lastHands : null, face = (L.skull || L.brain || sc) ? state.lastFace : null, pose = res.pose || null;
  ST.detMs = ST.detMs ? ST.detMs * 0.9 + ms * 0.1 : ms; ST.det.push(now);
  if (state.lastResAt != null) { (ST.resIv ||= []).push(now - state.lastResAt); if (ST.resIv.length > 60) ST.resIv.shift(); } state.lastResAt = now;
  if (pose) watchPoseSpeed(now);
  state.lastRes = { hands, face, pose }; state.lastResT = t; state.renderedAt = now;
  const frame = render(canvas, state.lastRes, t);
  updateScanner(frame, t);
  const fused = pose && multicam.active ? fusePose(pose, ts) : pose;
  const aspect = video.videoWidth / Math.max(1, video.videoHeight);
  for (const fn of listeners) { try { fn({ t, pose: fused, face: frame.face, hands: frame.hands, aspect }); } catch (e) { console.error(e); } }
  state.frames++;
}

// ------------------------------------------------------------------ display loop
function loop() {
  if (!state.running) return;
  const video = $('#cam');
  const canvas = $('#overlay');
  const now = performance.now();
  ST.disp.push(now);
  if (state.rvfc) {
    // between detections: redraw with the smoothed points moved on by their velocity (display only)
    if (state.lastRes && now - state.renderedAt > 6 && now - state.renderedAt < 120) {
      state.predicting = true; try { render(canvas, state.lastRes, state.lastResT + (now - state.renderedAt) / 1000); } finally { state.predicting = false; }
    }
  } else if (video.currentTime !== state.lastVideoTime && video.readyState >= 2) { state.lastVideoTime = video.currentTime; processFrame(now, null); }
  if (now - state.fpsT > 500) { state.fpsT = now; const iv = ST.intervals, m = iv.reduce((a, b) => a + b, 0) / (iv.length || 1), sd = Math.sqrt(iv.reduce((a, b) => a + (b - m) ** 2, 0) / (iv.length || 1));
    state.fps = rate(ST.det, now); $('#fps').textContent = `${rate(ST.det, now)} fps`; $('#fps').title = `camera ${rate(ST.cam, now)} fps · detection ${rate(ST.det, now)} fps · display ${rate(ST.disp, now)} fps · detection ${ST.detMs.toFixed(1)} ms/frame${ST.latency != null ? ` · latency ${ST.latency.toFixed(0)} ms` : ''} · camera frame interval ${m.toFixed(1)} ± ${sd.toFixed(1)} ms · result interval ${(() => { const r = ST.resIv || [], mm = r.reduce((x, y) => x + y, 0) / (r.length || 1); return `${mm.toFixed(1)} ± ${Math.sqrt(r.reduce((x, y) => x + (y - mm) ** 2, 0) / (r.length || 1)).toFixed(1)}`; })()} ms · ${ST.drop || 0} frames skipped (worker busy) · ${PERF[perfMode].label} · ${state.engine}${state.backend ? ` (measured: GPU ${state.backend.gpu_ms.toFixed(0)} ms vs CPU ${state.backend.cpu_ms.toFixed(0)} ms per frame)` : ''}`;
    const el = $('#perf-stats'); if (el) el.textContent = $('#fps').title; }
  if (now - state.uiT > 140) { state.uiT = now; updatePanels(now / 1000); }
  requestAnimationFrame(loop);
}

function track(id, label, zone, raw, t, extra) {
  let j = state.joints.get(id);
  if (state.predicting) return j; // display-only frames never update angles, range of motion or recordings
  if (!j) { j = new JointTrack(id, label, zone); state.joints.set(id, j); if (!state.selected) state.selected = id; }
  j.update(raw, t, extra);
  if (state.recording && Number.isFinite(j.angle)) state.recording.push([t.toFixed(3), id, j.angle.toFixed(2), j.vel.toFixed(1), extra]);
  return j;
}

// real frames filter the new detection; display-only frames use the filter's prediction
const smooth = (s, raw, t) => (state.predicting ? s.predict(t) || s.apply(raw, t) : s.apply(raw, t));

// ------------------------------------------------------------------ render
function render(canvas, res, t) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const toScreen = (p) => ({ x: (1 - p.x) * W, y: p.y * H, vx: -(p.vx ?? 0) * W, vy: (p.vy ?? 0) * H });
  const labels = [];
  const frame = { W, H, pose: null, face: null, hands: [] }; // handed to the scanner lens

  // ---- body (pose)
  if (res.pose?.landmarks?.length) {
    const raw = res.pose.landmarks[0];
    const sm = smooth(state.smoothers.pose, raw, t).map(toScreen);
    frame.pose = { pts: sm, raw };
    const world = res.pose.worldLandmarks?.[0];
    const shoulderW = dist(sm[11], sm[12]) || W * 0.2;
    if (world) {
      for (const jd of POSE_JOINTS) {
        const vis = (i) => (raw[i].visibility ?? 1) >= 0.5 && raw[i].y < 1.02 && raw[i].y > -0.02;
        if (!vis(jd.j) || !vis(jd.n) || (jd.p !== undefined && !vis(jd.p))) continue;
        if (jd.kind === 'hinge') track(jd.id, jd.label, jd.zone, hingeFlexion(world[jd.p], world[jd.j], world[jd.n]), t, jd.action);
        else { const s = shoulderAngles(world, jd.side); track(jd.id, jd.label, jd.zone, s.elevation, t, s.plane); }
      }
    }
    const inFrame = (i) => raw[i].x > -0.02 && raw[i].x < 1.02 && raw[i].y > -0.02 && raw[i].y < 1.02 && (raw[i].visibility ?? 1) >= 0.5;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const b of (state.layers.body ? POSE_BONES : [])) {
      if (!inFrame(b.from) || !inFrame(b.to)) continue;
      drawBone(ctx, sm[b.from], sm[b.to], Math.min(b.w * shoulderW * 1.6, H * 0.05), 'body');
      if (state.layers.labels && b.name !== 'Pelvis' && !b.name.startsWith('Clavicles')) labels.push({ text: b.name, x: (sm[b.from].x + sm[b.to].x) / 2, y: (sm[b.from].y + sm[b.to].y) / 2, group: 'body' });
    }
    ctx.restore();
    for (const jd of (state.layers.body ? POSE_JOINTS : [])) {
      const j = state.joints.get(jd.id); if (!j?.fresh(t) || !inFrame(jd.j)) continue;
      const p = sm[jd.j]; const active = phaseOf(j.vel) !== 'holding';
      ring(ctx, p, shoulderW * 0.09, active, t);
      if (state.layers.angles) tag(ctx, p.x, p.y - shoulderW * 0.14, `${Math.round(j.angle)}°`, shoulderW * 0.11, active);
    }
    if (state.layers.ghost && state.layers.body) drawGhost(ctx, extrapolate(sm, GHOST_S), POSE_BONES, raw);
  }

  // ---- face / skull / brain
  if (res.face?.faceLandmarks?.length) {
    const f = smooth(state.smoothers.face, res.face.faceLandmarks[0], t).map(toScreen);
    frame.face = f;
    const geo = faceGeometry(f);
    if (state.layers.skull) drawSkull(ctx, f, geo);
    if (state.layers.brain) drawBrain(ctx, f, geo);
    if (state.layers.labels) {
      if (state.layers.skull) for (const l of SKULL_LABELS) labels.push({ text: l.name, ...lift(f[l.lm], geo, l.lift), group: 'face' });
      if (state.layers.brain) for (const l of BRAIN_LABELS) labels.push({ text: l.name, ...lift(f[l.lm], geo, l.lift), group: 'face' });
    }
  }

  // ---- hands
  const seen = new Set();
  (res.hands?.landmarks || []).forEach((lm, i) => {
    // MediaPipe assumes a mirrored (selfie) input; this feed is not mirrored, so swap.
    const reported = res.hands.handedness?.[i]?.[0]?.categoryName || `H${i}`;
    let side = reported === 'Left' ? 'R' : reported === 'Right' ? 'L' : reported;
    // When the body is tracked, the nearer pose wrist decides, so hand and body
    // always agree (a pre-mirrored video source would otherwise flip only one).
    if (frame.pose) {
      const pr = frame.pose.raw, w = { x: 1 - lm[0].x, y: lm[0].y };
      const dl = Math.hypot((1 - pr[15].x) - w.x, pr[15].y - w.y), dr = Math.hypot((1 - pr[16].x) - w.x, pr[16].y - w.y);
      if (Math.min(pr[15].visibility ?? 0, 1) > 0.3 || Math.min(pr[16].visibility ?? 0, 1) > 0.3) side = dl < dr ? 'L' : 'R';
    }
    seen.add(side);
    const sm = smooth((state.smoothers.hands[side] ||= new LandmarkSmoother(21, 1.5, 8)), lm, t).map(toScreen);
    const world = res.hands.worldLandmarks?.[i];
    if (world) for (const hj of HAND_JOINTS) track(`${side}_${hj.id}`, `${side} ${hj.finger} ${hj.joint}`, `${side} hand`, hingeFlexion(world[hj.p], world[hj.j], world[hj.n]), t, 'finger');
    frame.hands.push({ side, pts: sm });
    if (!state.layers.hands) return;
    drawHand(ctx, sm, side, labels, t);
    if (state.layers.ghost) drawGhost(ctx, extrapolate(sm, GHOST_S), HAND_BONES.map((b) => ({ from: b.from, to: b.to })), null);
  });

  if (state.layers.labels) layoutLabels(ctx, labels, W, H);
  return frame;
}

// ------------------------------------------------------------------ drawing helpers
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

function boneGradient(ctx, A, B, r, tone) {
  const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  const g = ctx.createLinearGradient(A.x + nx * r, A.y + ny * r, A.x - nx * r, A.y - ny * r);
  const edge = tone === 'body' ? 'rgba(170,215,255,0.55)' : 'rgba(235,245,255,0.92)';
  const mid = tone === 'body' ? 'rgba(90,150,230,0.18)' : 'rgba(150,190,240,0.35)';
  g.addColorStop(0, edge); g.addColorStop(0.28, mid); g.addColorStop(0.72, mid); g.addColorStop(1, edge);
  return g;
}

// Long bone: shaft narrowing toward the middle, rounded epiphyses at both ends.
function drawBone(ctx, A, B, width, tone = 'hand') {
  const L = dist(A, B); if (L < 2) return;
  const ang = Math.atan2(B.y - A.y, B.x - A.x);
  const hw = width / 2, head = hw * 1.3, waist = hw * 0.78;
  ctx.save(); ctx.translate(A.x, A.y); ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, -head);
  ctx.quadraticCurveTo(L * 0.5, -waist * 1.0, L, -head);
  ctx.arc(L, 0, head, -Math.PI / 2, Math.PI / 2);
  ctx.quadraticCurveTo(L * 0.5, waist * 1.0, 0, head);
  ctx.arc(0, 0, head, Math.PI / 2, (3 * Math.PI) / 2);
  ctx.closePath();
  ctx.restore();
  ctx.fillStyle = boneGradient(ctx, A, B, head, tone);
  ctx.shadowColor = 'rgba(120,190,255,0.8)'; ctx.shadowBlur = width * 0.9;
  ctx.fill(); ctx.shadowBlur = 0;
  ctx.strokeStyle = tone === 'body' ? 'rgba(150,210,255,0.5)' : 'rgba(200,230,255,0.75)';
  ctx.lineWidth = Math.max(1, width * 0.06); ctx.stroke();
}

function drawHand(ctx, p, side, labels, t) {
  const palmW = dist(p[5], p[17]) || 40;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const O = p[0];
  const up = { x: p[9].x - O.x, y: p[9].y - O.y };
  const acrossLen = dist(p[5], p[17]) || 1;
  const across = { x: (p[5].x - p[17].x) / acrossLen * palmW, y: (p[5].y - p[17].y) / acrossLen * palmW };
  const at = (u, v) => ({ x: O.x + across.x * u + up.x * v, y: O.y + across.y * u + up.y * v });
  // distal radius and ulna
  const rad0 = at(0.24, -0.55), rad1 = at(0.22, 0.02), uln0 = at(-0.2, -0.55), uln1 = at(-0.2, -0.01);
  drawBone(ctx, rad0, rad1, palmW * 0.26); drawBone(ctx, uln0, uln1, palmW * 0.19);
  for (const c of CARPALS) {
    const q = at(c.u, c.v); const r = c.r * palmW;
    ctx.beginPath(); ctx.ellipse(q.x, q.y, r * 1.1, r * 0.85, Math.atan2(up.y, up.x), 0, Math.PI * 2);
    const g = ctx.createRadialGradient(q.x, q.y, r * 0.1, q.x, q.y, r * 1.1);
    g.addColorStop(0, 'rgba(140,180,235,0.3)'); g.addColorStop(1, 'rgba(230,242,255,0.85)');
    ctx.fillStyle = g; ctx.fill();
  }
  for (const b of HAND_BONES) {
    const A = b.startT ? lerp(p[b.from], p[b.to], b.startT) : p[b.from];
    drawBone(ctx, A, p[b.to], b.w * palmW * 1.15);
  }
  ctx.restore();

  if (state.layers.angles) {
    for (const hj of HAND_JOINTS) {
      if (hj.joint !== 'PIP' && !(hj.finger === 'Thumb' && hj.joint === 'MCP')) continue;
      const j = state.joints.get(`${side}_${hj.id}`); if (!j?.fresh(t)) continue;
      tag(ctx, p[hj.j].x, p[hj.j].y - palmW * 0.16, `${Math.round(j.angle)}°`, palmW * 0.13, phaseOf(j.vel) !== 'holding');
    }
  }
  if (state.layers.labels) {
    const L = (text, q) => labels.push({ text, x: q.x, y: q.y, group: `hand${side}` });
    L('Radius', lerp(rad0, rad1, 0.5)); L('Ulna', lerp(uln0, uln1, 0.5));
    L('Scaphoid', at(0.24, 0.10)); L('Capitate', at(0.02, 0.23)); L('Hamate', at(-0.17, 0.22));
    L('Metacarpal I', lerp(p[1], p[2], 0.5)); L('Metacarpal V', lerp(lerp(p[0], p[17], 0.3), p[17], 0.5));
    L('Proximal phalanx', lerp(p[5], p[6], 0.5)); L('Middle phalanx', lerp(p[6], p[7], 0.5)); L('Distal phalanx', lerp(p[7], p[8], 0.5));
  }
}

function faceGeometry(f) {
  const top = f[10], chin = f[152];
  const faceH = dist(top, chin), faceW = dist(f[234], f[454]);
  const ux = (top.x - chin.x) / (faceH || 1), uy = (top.y - chin.y) / (faceH || 1); // unit "up" in the head
  const roll = Math.atan2(f[263].y - f[33].y, f[263].x - f[33].x);
  return { faceH, faceW, up: { x: ux, y: uy }, roll, center: lerp(top, chin, 0.5) };
}

function lift(p, geo, k = 0) { return { x: p.x + geo.up.x * geo.faceH * k, y: p.y + geo.up.y * geo.faceH * k }; }

function vaultPath(ctx, f, geo) {
  // Cranial vault as the upper half of an ellipse joined to the jaw line.
  const c = lift(f[168], geo, 0.02);
  const rx = geo.faceW * 0.56, ry = geo.faceH * 0.72;
  const rot = Math.atan2(geo.up.y, geo.up.x) + Math.PI / 2;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, rx, ry, rot, Math.PI, 2 * Math.PI);
  // The arc ends at local (+rx, 0). Continue along the jaw from whichever end
  // is nearer, so the outline never cuts across the face (mirroring swaps sides).
  const end = { x: c.x + Math.cos(rot) * rx, y: c.y + Math.sin(rot) * rx };
  const jaw = dist(end, f[JAW[0]]) < dist(end, f[JAW[JAW.length - 1]]) ? JAW : [...JAW].reverse();
  for (const i of jaw) ctx.lineTo(f[i].x, f[i].y);
  ctx.closePath();
  return { c, rx, ry, rot };
}

function polyPath(ctx, f, idx, close = true) {
  ctx.beginPath(); ctx.moveTo(f[idx[0]].x, f[idx[0]].y);
  for (let i = 1; i < idx.length; i++) ctx.lineTo(f[idx[i]].x, f[idx[i]].y);
  if (close) ctx.closePath();
}

function drawSkull(ctx, f, geo) {
  const s = geo.faceW;
  ctx.save();
  // vault + face glow
  const v = vaultPath(ctx, f, geo);
  const g = ctx.createRadialGradient(v.c.x, v.c.y, s * 0.1, v.c.x, v.c.y, s * 0.9);
  g.addColorStop(0, 'rgba(120,160,230,0.10)'); g.addColorStop(0.75, 'rgba(170,205,255,0.22)'); g.addColorStop(1, 'rgba(225,240,255,0.55)');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(205,230,255,0.7)'; ctx.lineWidth = s * 0.012; ctx.shadowColor = 'rgba(120,190,255,0.9)'; ctx.shadowBlur = s * 0.05; ctx.stroke();
  ctx.shadowBlur = 0;
  // orbits
  for (const eye of [EYE_R, EYE_L]) {
    let cx = 0, cy = 0; eye.forEach((i) => { cx += f[i].x; cy += f[i].y; }); cx /= eye.length; cy /= eye.length;
    const w = dist(f[eye[0]], f[eye[8]]);
    ctx.beginPath(); ctx.ellipse(cx, cy - w * 0.08, w * 0.85, w * 0.66, geo.roll, 0, Math.PI * 2);
    const og = ctx.createRadialGradient(cx, cy, w * 0.1, cx, cy, w * 0.9);
    og.addColorStop(0, 'rgba(5,10,30,0.15)'); og.addColorStop(0.8, 'rgba(10,20,50,0.45)'); og.addColorStop(1, 'rgba(220,238,255,0.7)');
    ctx.fillStyle = og; ctx.fill();
    ctx.strokeStyle = 'rgba(220,238,255,0.75)'; ctx.lineWidth = s * 0.01; ctx.stroke();
  }
  // nasal aperture
  const top = f[NOSE.mid], aR = f[NOSE.alaR], aL = f[NOSE.alaL], base = f[NOSE.base];
  ctx.beginPath(); ctx.moveTo(top.x, top.y);
  ctx.quadraticCurveTo(aR.x, aR.y - s * 0.02, lerp(aR, base, 0.5).x, base.y);
  ctx.lineTo(lerp(aL, base, 0.5).x, base.y);
  ctx.quadraticCurveTo(aL.x, aL.y - s * 0.02, top.x, top.y);
  ctx.fillStyle = 'rgba(8,14,36,0.5)'; ctx.fill(); ctx.strokeStyle = 'rgba(210,232,255,0.6)'; ctx.lineWidth = s * 0.008; ctx.stroke();
  // zygomatic arches
  ctx.strokeStyle = 'rgba(225,240,255,0.65)'; ctx.lineWidth = s * 0.02; ctx.lineCap = 'round';
  for (const [a, b, c] of [[33, 116, 127], [263, 345, 356]]) {
    ctx.beginPath(); ctx.moveTo(f[a].x, f[a].y); ctx.quadraticCurveTo(f[b].x, f[b].y, f[c].x, f[c].y); ctx.stroke();
  }
  // teeth along the mouth line
  const upper = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308];
  const th = geo.faceH * 0.045;
  ctx.fillStyle = 'rgba(235,245,255,0.75)';
  for (let i = 0; i < upper.length - 1; i++) {
    const a = f[upper[i]], b = f[upper[i + 1]]; const m = lerp(a, b, 0.5); const w = dist(a, b) * 0.8;
    ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(geo.roll);
    roundRect(ctx, -w / 2, -th, w, th * 0.95, w * 0.25); ctx.fill();
    roundRect(ctx, -w / 2, th * 0.08, w, th * 0.9, w * 0.25); ctx.fill();
    ctx.restore();
  }
  // mandible
  polyPath(ctx, f, JAW, false);
  ctx.strokeStyle = 'rgba(235,245,255,0.85)'; ctx.lineWidth = s * 0.03; ctx.shadowColor = 'rgba(120,190,255,0.9)'; ctx.shadowBlur = s * 0.04; ctx.stroke();
  ctx.restore();
}

function drawBrain(ctx, f, geo) {
  ctx.save();
  const v = vaultPath(ctx, f, geo); ctx.clip();
  const browY = lift(f[9], geo, 0.06);
  // region above the brow line, in head coordinates
  ctx.translate(v.c.x, v.c.y); ctx.rotate(v.rot);
  const by = -Math.hypot(browY.x - v.c.x, browY.y - v.c.y);
  const g = ctx.createRadialGradient(0, by - v.ry * 0.3, v.rx * 0.1, 0, by - v.ry * 0.2, v.rx * 1.1);
  g.addColorStop(0, 'rgba(255,120,190,0.42)'); g.addColorStop(1, 'rgba(140,90,255,0.18)');
  ctx.fillStyle = g; ctx.fillRect(-v.rx * 1.1, -v.ry * 1.1, v.rx * 2.2, by + v.ry * 1.1);
  // schematic gyri (decorative, not anatomical sulci positions)
  ctx.strokeStyle = 'rgba(255,190,230,0.35)'; ctx.lineWidth = v.rx * 0.012;
  for (let k = 0; k < 7; k++) {
    const yy = -v.ry * 0.95 + k * (by + v.ry * 0.95) / 7 + v.ry * 0.05;
    ctx.beginPath();
    for (let x = -v.rx; x <= v.rx; x += v.rx / 24) ctx.lineTo(x, yy + Math.sin(x / v.rx * 9 + k * 1.7) * v.ry * 0.03);
    ctx.stroke();
  }
  // central division
  ctx.strokeStyle = 'rgba(255,210,240,0.5)'; ctx.beginPath(); ctx.moveTo(0, -v.ry); ctx.lineTo(0, by); ctx.stroke();
  ctx.restore();
}

function drawGhost(ctx, pts, bones, raw) {
  ctx.save(); ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(255,200,90,0.75)'; ctx.lineWidth = 2;
  for (const b of bones) {
    if (raw && Math.min(raw[b.from].visibility ?? 1, raw[b.to].visibility ?? 1) < 0.5) continue;
    ctx.beginPath(); ctx.moveTo(pts[b.from].x, pts[b.from].y); ctx.lineTo(pts[b.to].x, pts[b.to].y); ctx.stroke();
  }
  ctx.restore();
}

function ring(ctx, p, r, active, t) {
  ctx.save();
  ctx.beginPath(); ctx.arc(p.x, p.y, r * (active ? 1 + 0.25 * Math.sin(t * 12) : 1), 0, Math.PI * 2);
  ctx.strokeStyle = active ? 'rgba(255,190,80,0.95)' : 'rgba(120,220,255,0.7)'; ctx.lineWidth = active ? 3 : 2; ctx.stroke();
  ctx.restore();
}

function tag(ctx, x, y, text, size, hot) {
  const fs = Math.max(11, Math.min(22, size));
  ctx.save(); ctx.font = `600 ${fs}px "JetBrains Mono", ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + fs * 0.8;
  ctx.fillStyle = hot ? 'rgba(60,35,0,0.8)' : 'rgba(4,16,32,0.75)'; roundRect(ctx, x - w / 2, y - fs * 0.75, w, fs * 1.5, fs * 0.4); ctx.fill();
  ctx.fillStyle = hot ? '#ffd27a' : '#bfe8ff'; ctx.fillText(text, x, y);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// Labels go into a column on the outer side of their group, then are pushed
// apart vertically so they never overlap; a leader line joins label to anchor.
function layoutLabels(ctx, labels, W, H) {
  const fs = Math.round(Math.max(11, Math.min(16, W / 85)));
  ctx.save(); ctx.font = `500 ${fs}px Inter, system-ui, sans-serif`; ctx.textBaseline = 'middle';
  const groups = {};
  labels.forEach((l) => (groups[l.group] ||= []).push(l));
  const placed = []; // label boxes already drawn, across all groups
  const hits = (x0, y0, w, h) => placed.some((r) => x0 < r[0] + r[2] && x0 + w > r[0] && y0 < r[1] + r[3] && y0 + h > r[1]);
  const faceCx = groups.face ? groups.face.reduce((s, l) => s + l.x, 0) / groups.face.length : null;
  // face first so its two columns are stable; hands then body fit around it
  const order = Object.keys(groups).sort((a, b) => (a === 'face' ? -1 : b === 'face' ? 1 : a.localeCompare(b)));
  for (const g of order) {
    const items = groups[g];
    const xs = items.map((l) => l.x); const minX = Math.min(...xs), maxX = Math.max(...xs); const cx = (minX + maxX) / 2;
    const pad = fs * 2.2;
    // A hand's labels all go on the side away from the face.
    const oneSide = g.startsWith('hand') && faceCx !== null ? (cx < faceCx ? 'left' : 'right') : null;
    for (const sideLeft of [true, false]) {
      const col = items.filter((l) => (oneSide ? oneSide === 'left' : (l.x < cx)) === sideLeft).sort((a, b) => a.y - b.y);
      let lastY = -Infinity;
      for (const l of col) {
        const tw = ctx.measureText(l.text).width;
        let tx = sideLeft ? minX - pad : maxX + pad;
        tx = sideLeft ? Math.max(tw + 6, tx) : Math.min(W - tw - 6, tx);
        let ty = Math.min(H - fs, Math.max(fs, Math.max(l.y, lastY + fs * 1.35)));
        const bx = () => (sideLeft ? tx - tw - 3 : tx - 1);
        for (let k = 0; k < 40 && hits(bx(), ty - fs * 0.62, tw + 6, fs * 1.24); k++) ty += fs * 0.7;
        if (ty > H - fs) continue; // no room: skip rather than overlap
        lastY = ty; placed.push([bx(), ty - fs * 0.62, tw + 6, fs * 1.24]);
        ctx.strokeStyle = 'rgba(190,230,255,0.55)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(tx + (sideLeft ? 4 : -4), ty); ctx.stroke();
        ctx.fillStyle = 'rgba(200,240,255,0.95)'; ctx.beginPath(); ctx.arc(l.x, l.y, 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(2,10,22,0.6)'; ctx.fillRect(sideLeft ? tx - tw - 3 : tx - 1, ty - fs * 0.62, tw + 6, fs * 1.24);
        ctx.fillStyle = '#e6f6ff'; ctx.textAlign = sideLeft ? 'right' : 'left';
        ctx.fillText(l.text, sideLeft ? tx : tx + 2, ty);
      }
    }
  }
  ctx.restore();
}

// ------------------------------------------------------------------ panels
function actionFor(j) {
  const ph = phaseOf(j.vel); if (ph === 'holding') return null;
  if (j.extra === 'finger') return ph === 'flexing' ? 'finger_flexion' : 'finger_extension';
  if (j.extra === 'flexion') return ph === 'flexing' ? 'shoulder_flexion' : 'shoulder_extension';
  if (j.extra === 'abduction') return ph === 'flexing' ? 'shoulder_abduction' : 'shoulder_adduction';
  return `${j.extra}_${ph === 'flexing' ? 'flexion' : 'extension'}`;
}

function updatePanels(t) {
  const rows = [...state.joints.values()].filter((j) => j.fresh(t));
  // joint table
  $('#joint-table tbody').innerHTML = rows.filter((j) => j.extra !== 'finger' || /PIP|Thumb MCP/.test(j.label)).map((j) => {
    const ph = phaseOf(j.vel);
    const plane = j.id.endsWith('shoulder') ? ` <small>${j.extra}</small>` : '';
    return `<tr data-id="${j.id}" class="${j.id === state.selected ? 'sel' : ''} ${ph !== 'holding' ? 'hot' : ''}">
      <td>${j.label}${plane}</td><td class="mono">${j.angle.toFixed(0)}°</td>
      <td class="mono">${j.min.toFixed(0)}–${j.max.toFixed(0)}°</td><td class="mono">${j.vel > 0 ? '+' : ''}${j.vel.toFixed(0)}</td></tr>`;
  }).join('') || '<tr><td colspan="4" class="muted">Step into view: face, hands or full body.</td></tr>';

  // zones
  const zones = new Map();
  rows.forEach((j) => { const hot = phaseOf(j.vel) !== 'holding'; zones.set(j.zone, (zones.get(j.zone) || false) || hot); });
  $('#zones').innerHTML = [...zones.entries()].map(([z, hot]) => `<span class="zone ${hot ? 'hot' : ''}">${z}</span>`).join('') || '<span class="muted">No zones tracked yet</span>';

  // active movements -> prime movers (fingers aggregated per hand)
  const seen = new Set(); const items = [];
  for (const j of rows) {
    const a = actionFor(j); if (!a || !MUSCLE_ACTIONS[a]) continue;
    const key = j.extra === 'finger' ? `${j.zone}:${a}` : `${j.id}:${a}`; if (seen.has(key)) continue; seen.add(key);
    const act = MUSCLE_ACTIONS[a]; const anta = MUSCLE_ACTIONS[act.anta];
    const who = j.extra === 'finger' ? j.zone : j.label;
    items.push(`<div class="move"><div class="move-h"><b>${who}</b> · ${act.label} <span class="mono">${Math.abs(j.vel).toFixed(0)}°/s</span></div>
      <ul>${act.muscles.map((m) => `<li>${m.m} <span class="grade g${m.grade}" title="${m.src}${m.page ? `, PDF p.${m.page}` : ''}">${m.grade}${m.page ? ` p${m.page}` : ''}</span></li>`).join('')}</ul>
      <small>Under a load or gravity, the ${anta.label.toLowerCase()} group may be lengthening (eccentric) instead. The camera does not measure which muscle is working.</small></div>`);
  }
  $('#movers').innerHTML = items.slice(0, 4).join('') || '<p class="muted">Move a joint to see the muscles that produce that action.</p>';

  drawSpark(t);
  $('#rec-count').textContent = state.recording ? `${state.recording.length} samples` : '';
}

function drawSpark(t) {
  const c = $('#spark'); const ctx = c.getContext('2d'); const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);
  const j = state.joints.get(state.selected); $('#spark-label').textContent = j ? j.label : '—';
  if (!j || j.hist.length < 2) return;
  const lo = Math.min(0, j.min), hi = Math.max(j.max, lo + 30);
  const X = (tt) => W - ((t - tt) / 10) * W, Y = (a) => H - 6 - ((a - lo) / (hi - lo)) * (H - 12);
  ctx.fillStyle = 'rgba(80,170,255,0.12)'; ctx.fillRect(0, Y(j.max), W, Y(j.min) - Y(j.max));
  ctx.strokeStyle = '#7fd4ff'; ctx.lineWidth = 2; ctx.beginPath();
  j.hist.forEach(([tt, a], i) => (i ? ctx.lineTo(X(tt), Y(a)) : ctx.moveTo(X(tt), Y(a)))); ctx.stroke();
  ctx.fillStyle = 'rgba(200,230,255,0.7)'; ctx.font = '11px ui-monospace, monospace';
  ctx.fillText(`${hi.toFixed(0)}°`, 4, 12); ctx.fillText(`${lo.toFixed(0)}°`, 4, H - 4); ctx.fillText('10 s', W - 28, H - 4);
}

function toggleRecording() {
  const btn = $('#rec-btn');
  if (!state.recording) { state.recording = []; btn.textContent = 'Stop & save CSV'; btn.classList.add('rec'); return; }
  const rows = [['t_s', 'joint', 'angle_deg', 'vel_deg_s', 'context'], ...state.recording];
  const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `anatomy_lab_angles_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`; a.click();
  state.recording = null; btn.textContent = 'Record angles'; btn.classList.remove('rec');
}

export { OPENSTAX_AP2E };
