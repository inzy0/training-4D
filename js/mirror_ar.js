// Live Mirror AR skeleton: the full posed BodyParts3D skeleton (skull, every
// vertebra and disc, ribs, pelvis, scapulae and clavicles, limbs, hands, feet)
// drawn over the camera image and moving with you. Pose comes from the Motion
// Lab solver (rig.js); each frame the twin's joint centres are fitted to the
// tracked screen joints by a least-squares similarity (scale, rotation,
// shift, mirror tested both ways), so the reference skeleton sits on your body.
// It is ONE reference skeleton fitted to your joints, not your own bones.

import * as THREE from 'three';
import { startMotionLab, labState, labExtras, bioOverlay } from './motion_lab.js';
import { subscribeFrames, extern } from './mirror.js';
import { studio, materialFor, tissueKind } from './look.js';
import { FIT, refine, errors, drawLandmarks, alignment, startLearn, resetProportions } from './mirror_fit.js';

const $ = (s) => document.querySelector(s);
const REGIONS = [
  ['skull', 'Skull', (seg) => seg === 'head'], ['spine', 'Spine & discs', (seg) => seg.startsWith('v_')], ['ribs', 'Ribs & sternum', (seg) => seg === 'ribs'],
  ['pelvis', 'Pelvis', (seg) => seg === 'pelvis'], ['girdle', 'Scapulae & clavicles', (seg) => seg.endsWith('_girdle')],
  ['arms', 'Arms', (seg) => /_humerus|_forearm/.test(seg)], ['hands', 'Hands', (seg) => seg.endsWith('_hand')],
  ['legs', 'Legs', (seg) => /_femur|_leg$/.test(seg)], ['feet', 'Feet', (seg) => seg.endsWith('_foot')],
];
const STATE_NEXT = { show: 'fade', fade: 'hide', hide: 'show' };
const AR = { on: false, ready: false, renderer: null, scene: null, cam: null, groups: new Map(), regionState: {}, hidden: new Set(), style: 'xray', opacity: 0.75, muscles: false, fit: null, bio: false, xrayMat: null };

export function initMirrorAR() {
  $('#ar-regions').innerHTML = REGIONS.map(([k, label]) => `<button class="ghost-btn ar-reg" data-reg="${k}" data-state="show">${label}</button>`).join('');
  REGIONS.forEach(([k]) => { AR.regionState[k] = 'show'; });
  document.querySelectorAll('.ar-reg').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.reg; AR.regionState[k] = STATE_NEXT[AR.regionState[k]]; b.dataset.state = AR.regionState[k]; b.title = AR.regionState[k]; applyLook();
  }));
  $('#ar-opacity').addEventListener('input', (e) => { AR.opacity = e.target.value / 100; applyLook(); });
  document.querySelectorAll('[name=ar-style]').forEach((r) => r.addEventListener('change', () => { AR.style = r.value; applyLook(); }));
  $('#ar-muscles').addEventListener('change', (e) => { AR.muscles = e.target.checked; applyLook(); });
  $('#ar-bio').addEventListener('change', (e) => { AR.bio = e.target.checked; const B = labExtras().BIO; B.on = AR.bio || $('#bio-on').checked; $('#ar-bio-out').hidden = !AR.bio; });
  $('#ar-showall').addEventListener('click', () => { AR.hidden.clear(); REGIONS.forEach(([k]) => { AR.regionState[k] = 'show'; }); document.querySelectorAll('.ar-reg').forEach((b) => { b.dataset.state = 'show'; }); applyLook(); });
  $('#ar-canvas').addEventListener('click', pickBone);
  $('#ar-fitmode').addEventListener('change', (e) => { FIT.mode = e.target.value; FIT.err = { g: [], s: [] }; });
  $('#ar-lm').addEventListener('change', (e) => { FIT.lm = e.target.checked; if (!FIT.lm) { const c = $('#ar-lm-canvas'); c.getContext('2d').clearRect(0, 0, c.width, c.height); } });
  $('#ar-align').addEventListener('change', (e) => { FIT.align = e.target.checked; $('#ar-align-out').hidden = !FIT.align; });
  $('#ar-learn').addEventListener('click', () => {
    let n = 3; const b = $('#ar-learn'); b.disabled = true;
    const tick = () => { if (n > 0) { $('#ar-fitmsg').textContent = `Stand still facing the camera, arms by your sides, whole body in view… ${n}`; n--; setTimeout(tick, 1000); return; }
      $('#ar-fitmsg').textContent = 'Learning your proportions (2 s)…';
      startLearn((out) => { b.disabled = false; const k = Object.keys(out); $('#ar-fitmsg').textContent = k.length ? `Learned ${k.length} segment lengths: ${k.map((x) => `${x.replace('_', ' ')} ×${out[x].toFixed(2)}`).join(', ')}. Saved in this browser.` : 'Not enough clear frames: keep the whole body in view, limbs straight, and try again.'; }); };
    tick(); });
  $('#ar-unlearn').addEventListener('click', () => { resetProportions(); $('#ar-fitmsg').textContent = 'Proportions reset to the reference skeleton.'; });
}

export async function setMirrorAR(on) {
  AR.on = on; $('#ar-bar').hidden = !on; $('#ar-canvas').hidden = !on; $('#ar-lm-canvas').hidden = !on; $('#ar-align-out').hidden = !on || !FIT.align;
  extern.pose = on || extern.pose;
  if (on && !AR.ready) {
    $('#ar-status').textContent = 'Loading the skeleton rig…';
    await startMotionLab();
    const L = labState(); L.mirrorAR = true;
    build(L); AR.ready = true;
    subscribeFrames(onFrame); // after the Motion Lab's own subscription, so the pose is already solved
    $('#ar-status').textContent = 'Step into view: the skeleton follows your tracked joints.';
  } else if (AR.ready) labState().mirrorAR = on;
}

function build(L) {
  const canvas = $('#ar-canvas');
  AR.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  AR.renderer.setPixelRatio(1);
  AR.scene = new THREE.Scene(); studio(AR.renderer, AR.scene);
  AR.cam = new THREE.Camera(); AR.cam.matrixAutoUpdate = false; // custom projection set every frame
  AR.xrayMat = { bone: new THREE.MeshBasicMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    soft: new THREE.MeshBasicMaterial({ color: 0x6fb6ff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    muscle: new THREE.MeshBasicMaterial({ color: 0xff6a7a, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }) };
  for (const s of L.rig.segs.values()) {
    const g = new THREE.Group(); g.matrixAutoUpdate = false; g.userData.seg = s.key; AR.scene.add(g); AR.groups.set(s.key, g);
    const region = REGIONS.find(([, , f]) => f(s.key))?.[0] || 'spine';
    for (const part of s.parts) {
      if (part.layer !== 'skeleton' && part.layer !== 'muscles') continue;
      const geo = L.atlas.byName.get(part.name)?.geometry; if (!geo) continue;
      const color = L.atlas.index.layers.find((x) => x.key === part.layer).color;
      const mesh = new THREE.Mesh(geo, materialFor(part, color)); mesh.frustumCulled = false;
      mesh.userData = { part, region, anat: mesh.material, kind: tissueKind(part) };
      g.add(mesh);
    }
  }
  applyLook();
}

function applyLook() {
  const bioSet = labState()?.bioSet;
  AR.groups.forEach((g) => g.children.forEach((m) => {
    const { part, region, anat, kind } = m.userData;
    const st = AR.regionState[region] || 'show';
    const isMuscle = part.layer === 'muscles';
    m.visible = st !== 'hide' && !AR.hidden.has(part.name) && (!isMuscle || AR.muscles);
    let mat = AR.style === 'xray' ? (isMuscle ? AR.xrayMat.muscle : kind === 'bone' || kind === 'tooth' ? AR.xrayMat.bone : AR.xrayMat.soft) : anat;
    if (isMuscle && AR.muscles && bioSet?.has(part.name)) {
      const b = bioSet.get(part.name);
      mat = new THREE.MeshBasicMaterial({ color: b.role === 'ag' ? new THREE.Color().setHSL(0.02 + 0.1 * (1 - b.level), 1, 0.55) : 0x3d7bff, transparent: true, opacity: b.role === 'ag' ? 0.55 + 0.4 * b.level : 0.2, depthWrite: false, side: THREE.DoubleSide });
    }
    const fade = st === 'fade' ? 0.25 : 1;
    if (mat.transparent || fade < 1 || AR.opacity < 1) {
      mat = mat.clone(); mat.transparent = true; mat.opacity = (mat.opacity ?? 1) * fade * AR.opacity; mat.depthWrite = false;
    }
    m.material = mat;
  }));
}

// ------------------------------------------------------------------ per frame
const FIT_LM = [['l_ear', 7], ['r_ear', 8], ['nose', 0]]; // skull landmarks: always in a webcam frame, they fix scale
const FIT_J = [['l_shoulder', 11], ['r_shoulder', 12], ['l_elbow', 13], ['r_elbow', 14], ['l_wrist', 15], ['r_wrist', 16], ['l_hip', 23], ['r_hip', 24], ['l_knee', 25], ['r_knee', 26], ['l_ankle', 27], ['r_ankle', 28]];
let lastLook = 0;
function onFrame(fr) {
  if (!AR.on || !AR.ready) return;
  const L = labState(); if (!L.M || !fr.pose?.landmarks?.length) return;
  const v = $('#cam'); const W = v.videoWidth, H = v.videoHeight; if (!W) return;
  const canvas = $('#ar-canvas'); if (canvas.width !== W || canvas.height !== H) AR.renderer.setSize(W, H, false);
  const raw = fr.pose.landmarks[0];
  const { posedPoint } = labExtras();
  const src = [], dst = [];
  for (const [jk, i] of FIT_J) {
    if ((raw[i].visibility ?? 0) < 0.6 || raw[i].y < -0.05 || raw[i].y > 1.05) continue;
    const p = posedPoint(L.rig, L.M, 'J', jk); if (!p) continue;
    src.push(p); dst.push([(1 - raw[i].x) * W, raw[i].y * H]);
  }
  for (const [lk, i] of FIT_LM) {
    if ((raw[i].visibility ?? 0) < 0.6) continue;
    const p = posedPoint(L.rig, L.M, 'LM', lk); if (!p) continue;
    src.push(p); dst.push([(1 - raw[i].x) * W, raw[i].y * H]);
  }
  if (src.length < 4) { $('#ar-status').textContent = 'Need the head and shoulders (4+ tracked points) in view to place the skeleton.'; AR.renderer.clear(); return; }
  const fit = fitSimilarity(src, dst, L);
  AR.fit = fit;
  const { M: Ms, used } = refine(L.rig, L.M, fit, raw, W, H);
  AR.groups.forEach((g, key) => { const m = Ms.get(key); if (m) { g.matrix.copy(m); g.matrixWorldNeedsUpdate = true; } });
  setProjection(fit, W, H, L);
  const lc = $('#ar-lm-canvas'); if (lc.width !== W || lc.height !== H) { lc.width = W; lc.height = H; }
  drawLandmarks(lc.getContext('2d'), L.rig, Ms, fit, W, H);
  const er = errors(L.rig, L.M, Ms, fit, raw, W, H);
  if (FIT.align && fr.t - (AR.alignT || 0) > 0.25) { AR.alignT = fr.t; renderAlign(alignment(raw, W, H), er); }
  // force arrows, joint moment markers and centre of mass from the biomechanics model (same twin space)
  if (AR.bioClone) { AR.scene.remove(AR.bioClone); AR.bioClone = null; }
  const bg = AR.bio ? bioOverlay() : null;
  if (bg) { AR.bioClone = bg.clone(); AR.bioClone.traverse((o) => { o.frustumCulled = false; }); AR.scene.add(AR.bioClone); }
  AR.renderer.render(AR.scene, AR.cam);
  const cue = L.lastCue && performance.now() / 1000 - L.lastCue.t < 4 ? L.lastCue : null;
  const ce = $('#ar-cue'); ce.hidden = !cue; if (cue) { ce.textContent = cue.text; ce.className = `ar-cue ${cue.ok ? 'ok' : 'bad'}`; }
  const pct = (v) => (er.sw && v != null ? ` (${((100 * v) / er.sw).toFixed(1)}% of shoulder width)` : '');
  $('#ar-status').textContent = `Whole-skeleton fit on ${src.length} joints: ${fit.rms.toFixed(1)} px rms · ${FIT.mode === 'segment' ? `${used} segments placed on your joints` : 'per-segment placement off'}` +
    (er.heldG != null ? ` · held-out (eyes, heels) error: global ${er.heldG.toFixed(1)} px${pct(er.heldG)} → per-segment ${er.heldS.toFixed(1)} px${pct(er.heldS)} (mean of ${er.n} frames)` : '');
  if (AR.muscles && fr.t - lastLook > 0.3) { lastLook = fr.t; applyLook(); }
  if (AR.bio) renderBioHud(fr, W, H);
}

// least-squares 2D similarity (Umeyama) from twin points (projected along the camera axis) to screen pixels; tries the mirrored axis too
function fitSimilarity(src, dst, L) {
  const A = L.atlas.anchors;
  const best = [1, -1].map((flip) => {
    const P = src.map((p) => [flip * p.x, p.y]);
    const n = P.length, mp = [0, 0], mq = [0, 0];
    P.forEach((p, i) => { mp[0] += p[0] / n; mp[1] += p[1] / n; mq[0] += dst[i][0] / n; mq[1] += dst[i][1] / n; });
    let sxx = 0, sxy = 0, var_ = 0;
    // screen y grows downward: flip it so both systems are right-handed for the rotation fit
    P.forEach((p, i) => { const a = [p[0] - mp[0], p[1] - mp[1]], b = [dst[i][0] - mq[0], -(dst[i][1] - mq[1])]; sxx += a[0] * b[0] + a[1] * b[1]; sxy += a[0] * b[1] - a[1] * b[0]; var_ += a[0] * a[0] + a[1] * a[1]; });
    const th = Math.atan2(sxy, sxx), s = Math.hypot(sxx, sxy) / Math.max(1e-9, var_);
    const c = Math.cos(th) * s, si = Math.sin(th) * s;
    const map = (p) => { const a = [p[0] - mp[0], p[1] - mp[1]]; return [mq[0] + c * a[0] - si * a[1], mq[1] - (si * a[0] + c * a[1])]; };
    const rms = Math.sqrt(P.reduce((e, p, i) => { const q = map(p); return e + (q[0] - dst[i][0]) ** 2 + (q[1] - dst[i][1]) ** 2; }, 0) / n);
    return { flip, c, si, mp, mq, rms, depthSign: A.anterior * (L.sz || 1) };
  }).sort((a, b) => a.rms - b.rms)[0];
  return best;
}

function setProjection(f, W, H) {
  // screen = mq + R*s*([flip*x, y] - mp), with screen y downward; then to NDC
  const ax = 2 / W, ay = -2 / H;
  const m00 = ax * f.c * f.flip, m01 = ax * -f.si, m03 = ax * (f.mq[0] - f.c * f.mp[0] + f.si * f.mp[1]) - 1;
  const m10 = ay * -(f.si * f.flip), m11 = ay * -f.c, m13 = ay * (f.mq[1] + f.si * f.mp[0] + f.c * f.mp[1]) + 1;
  const dz = -0.4 * f.depthSign; // points nearer the camera get smaller depth
  const P = new THREE.Matrix4().set(m00, m01, 0, m03, m10, m11, 0, m13, 0, 0, dz, 0, 0, 0, 0, 1);
  AR.cam.projectionMatrix.copy(P); AR.cam.projectionMatrixInverse.copy(P).invert();
  AR.cam.matrixWorld.identity(); AR.cam.matrixWorldInverse.identity();
}

function renderAlign(a, er) {
  const host = $('#ar-align-out'); if (!host) return;
  host.innerHTML = `<div><b>Alignment</b> · ${a.view === 'unknown' ? 'step fully into view' : `${a.view} view`}</div>` + a.rows.map(([n, , t]) => `<div>${n}: <b>${t}</b></div>`).join('') +
    `<div class="muted">2D image-plane estimates from the tracked landmarks; depend on camera height and angle; not validated (gate V1).</div>`;
}

function pickBone(e) {
  if (!AR.fit) return;
  const c = $('#ar-canvas'), r = c.getBoundingClientRect(), W = c.width, H = c.height;
  const k = Math.min(r.width / W, r.height / H), ox = (r.width - W * k) / 2, oy = (r.height - H * k) / 2;
  const x = ((e.clientX - r.left - ox) / k / W) * 2 - 1, y = -(((e.clientY - r.top - oy) / k / H) * 2 - 1);
  const a = new THREE.Vector3(x, y, -1).applyMatrix4(AR.cam.projectionMatrixInverse), b = new THREE.Vector3(x, y, 1).applyMatrix4(AR.cam.projectionMatrixInverse);
  const ray = new THREE.Raycaster(a, b.clone().sub(a).normalize());
  const objs = []; AR.groups.forEach((g) => g.children.forEach((m) => { if (m.visible) objs.push(m); }));
  const h = ray.intersectObjects(objs, false)[0];
  if (!h) return;
  AR.hidden.add(h.object.userData.part.name); applyLook();
  $('#ar-status').textContent = `Hidden: ${h.object.userData.part.name} (Show all to restore)`;
}

function renderBioHud(fr, W, H) {
  const B = labExtras().BIO, r = B.last, host = $('#ar-bio-out');
  if (!r || r.blocked || !r.rows) { host.innerHTML = '<small>Biomechanics needs the whole body in view.</small>'; return; }
  const top = r.rows.flatMap((row) => row.parts.filter((p) => p.plane === 'sagittal').map((p) => ({ id: row.id, ...p }))).sort((a, b) => Math.abs(b.moment) - Math.abs(a.moment)).slice(0, 5);
  const bw = r.bodyWeightN;
  host.innerHTML = `<div>GRF L <b>${Math.round((100 * r.grf.l.length()) / bw)}%</b> · R <b>${Math.round((100 * r.grf.r.length()) / bw)}%</b> BW · COM ${r.inside ? 'over' : '<b>outside</b>'} base</div>` +
    top.map((p) => `<div>${p.id.replace('_', ' ')} <b>${Math.abs(p.moment).toFixed(0)} N·m</b> → ${p.agonist.replace('_', ' ')}${p.mode ? ` · ${p.mode.split(' ')[0]}` : ''}</div>`).join('');
}
