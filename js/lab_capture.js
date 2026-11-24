// Camera studio for Motion Lab 4D: layouts (twin + camera inset, split camera | twin, camera + twin inset, camera only,
// twin only, all cameras grid + twin), mirror flip, skeleton and full-body detection area drawn over the camera,
// posture readout, pointer tools (track a joint with its trail and speed, distance, angle, reference scale) with a
// magnifier for precision, video recording of exactly what the stage shows (MP4 where the browser supports it,
// otherwise WebM), low-power auto-adjust, and live calibration of 2-4 cameras with their agreement figures.
// Everything runs in this browser; recordings are saved only when you download them.
// Measurements are camera estimates (MediaPipe pose; not validated against motion capture or a goniometer).

import { labState } from './motion_lab.js';
import { subscribeFrames, setPerfMode, getPerfMode, PERF } from './mirror.js';
import { multicam, calibrate, setExtraCameraRate, mcEvents } from './multicam.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LAYOUTS = { inset: 'Twin + camera inset', split: 'Split: camera | twin', campip: 'Camera + twin inset', cam: 'Camera only', twin: 'Twin only', grid: 'All cameras grid + twin' };
const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [27, 29], [29, 31], [27, 31], [24, 26], [26, 28], [28, 30], [30, 32], [28, 32], [0, 2], [0, 5], [2, 7], [5, 8], [15, 19], [16, 20]];
const NAMES = { 0: 'nose', 2: 'L eye', 5: 'R eye', 7: 'L ear', 8: 'R ear', 11: 'L shoulder', 12: 'R shoulder', 13: 'L elbow', 14: 'R elbow', 15: 'L wrist', 16: 'R wrist', 19: 'L hand', 20: 'R hand',
  23: 'L hip', 24: 'R hip', 25: 'L knee', 26: 'R knee', 27: 'L ankle', 28: 'R ankle', 29: 'L heel', 30: 'R heel', 31: 'L toe', 32: 'R toe' };
const FULL = { head: [0, 7, 8], shoulders: [11, 12], hips: [23, 24], knees: [25, 26], feet: [27, 28, 29, 30, 31, 32] };
const C = { layout: 'inset', mirror: true, skel: true, area: true, post: false, tool: 'off', pts: [], track: null, trail: [], speed: [], scale: null, lm: null, world: null, t: 0,
  mouse: null, rec: null, clips: [], post3: null, auto: true, slow: 0 };
let stage, video, ov, grid, ctx, gctx;

// test / integration hook: feed a pose frame (normalized image landmarks + metric world landmarks)
window.__capPose = (lm, world, t) => { C.lm = lm; C.world = world; C.t = t; onPose(t); };
window.__cap = C;

export function initCapture() {
  stage = $('.lab-stage'); video = $('#lab-video'); if (!stage || !video) return;
  try { Object.assign(C, JSON.parse(localStorage.getItem('lab-capture') || '{}'), { tool: 'off', pts: [], rec: null, clips: [] }); } catch { /* defaults */ }
  ov = document.createElement('canvas'); ov.id = 'lab-ov'; stage.appendChild(ov); ctx = ov.getContext('2d');
  grid = document.createElement('canvas'); grid.id = 'lab-grid'; stage.insertBefore(grid, stage.firstChild); gctx = grid.getContext('2d');
  card(); applyLayout();
  subscribeFrames((fr) => { const p = fr.pose; if (!p?.landmarks?.length) return; C.lm = p.landmarks[0]; C.world = p.worldLandmarks?.[0] || null; C.t = fr.t; onPose(fr.t); });
  ov.addEventListener('pointermove', (e) => { C.mouse = local(e); });
  ov.addEventListener('pointerleave', () => { C.mouse = null; });
  ov.addEventListener('pointerdown', onClick);
  new ResizeObserver(sizeCanvases).observe(stage); sizeCanvases();
  mcEvents.addEventListener('change', renderCams);
  setInterval(autoPerf, 3000);
  requestAnimationFrame(loop);
}
const save = () => { try { localStorage.setItem('lab-capture', JSON.stringify({ layout: C.layout, mirror: C.mirror, skel: C.skel, area: C.area, post: C.post, auto: C.auto, scale: C.scale })); } catch { /* private */ } };
function sizeCanvases() { const r = stage.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); for (const c of [ov, grid]) { c.width = r.width * d; c.height = r.height * d; c.style.width = `${r.width}px`; c.style.height = `${r.height}px`; } }

// ------------------------------------------------------------------ UI card
function card() {
  const host = document.createElement('section'); host.className = 'card cap-card'; host.id = 'cap-card';
  const setup = [...document.querySelectorAll('#mode-lab .side > section.card')].find((s) => s.querySelector('#lab-cam'));
  setup ? setup.after(host) : $('#mode-lab .side')?.prepend(host);
  host.innerHTML = `<div class="card-h"><h2>Camera studio</h2><span id="cap-state" class="chip mono">camera off</span></div>
    <div class="ctl-grid"><label>Layout <select id="cap-layout">${Object.entries(LAYOUTS).map(([k, v]) => `<option value="${k}" ${k === C.layout ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Performance <select id="cap-perf">${Object.entries(PERF).map(([k, v]) => `<option value="${k}" ${k === getPerfMode() ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label></div>
    <p class="btnrow cap-toggles"><label><input type="checkbox" id="cap-mirror" ${C.mirror ? 'checked' : ''}> Mirror camera</label><label><input type="checkbox" id="cap-skel" ${C.skel ? 'checked' : ''}> Skeleton on camera</label>
      <label><input type="checkbox" id="cap-area" ${C.area ? 'checked' : ''}> Body detection area</label><label><input type="checkbox" id="cap-post" ${C.post ? 'checked' : ''}> Posture lines</label>
      <label><input type="checkbox" id="cap-auto" ${C.auto ? 'checked' : ''}> Auto-adjust when slow</label></p>
    <div id="cap-body" class="fine"></div>
    <h3 class="cap-h">Pointer tools</h3>
    <p class="btnrow" id="cap-tools">${[['off', 'Off'], ['track', 'Track a joint'], ['dist', 'Distance'], ['angle', 'Angle'], ['scale', 'Set scale']].map(([k, v]) => `<button class="ghost-btn" data-tool="${k}">${v}</button>`).join('')}<button class="ghost-btn" id="cap-clear">Clear</button></p>
    <div id="cap-tool-msg" class="fine muted">Click on the camera image. Points within 14 px of a detected joint snap to it and follow it live; a magnifier shows the exact spot.</div>
    <div id="cap-read" class="cap-read"></div>
    <h3 class="cap-h">Posture</h3>
    <p class="btnrow"><button class="ghost-btn" id="cap-post-snap">Capture posture (hold still 3 s)</button><button class="ghost-btn" id="cap-post-csv" disabled>Download CSV</button></p>
    <div id="cap-post-out" class="fine"></div>
    <h3 class="cap-h">Record</h3>
    <div class="ctl-grid"><label>Quality <select id="cap-q"><option value="720">1280 × 720</option><option value="1080">1920 × 1080</option><option value="480">854 × 480 (low-power)</option></select></label><label>Frame rate <select id="cap-fps"><option>30</option><option>24</option><option>60</option></select></label></div>
    <p class="btnrow"><button class="primary small" id="cap-rec">● Record</button><span id="cap-rec-t" class="mono fine"></span></p>
    <ul id="cap-clips" class="cap-clips"></ul>
    <p class="fine muted">Records exactly what the stage shows in the chosen layout (camera, skeleton, measurements and the 3D twin). Saved only when you download it.</p>
    <h3 class="cap-h">Multiple cameras</h3>
    <div class="ctl-grid"><label>Extra camera rate <select id="cap-xr"><option value="0">As fast as possible</option><option value="20">20 fps each</option><option value="12">12 fps each</option><option value="8">8 fps each (low-power)</option></select></label></div>
    <p class="btnrow"><button class="ghost-btn" id="cap-cal">Calibrate cameras (stand still 3 s)</button></p>
    <div id="cap-cams" class="fine"></div>
    <p class="fine muted">Add cameras under Setup → Cameras. Calibration averages each camera's rotation onto the primary while you stand still in view of all of them, then locks it. Agreement = how far each aligned skeleton lies from the primary's (median / 90th percentile): consistency between cameras, not accuracy against a reference system.</p>`;
  const bind = (id, k, fn) => { $(id).onchange = (e) => { C[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; save(); fn?.(); }; };
  bind('#cap-layout', 'layout', applyLayout); bind('#cap-mirror', 'mirror', applyLayout); bind('#cap-skel', 'skel'); bind('#cap-area', 'area'); bind('#cap-post', 'post'); bind('#cap-auto', 'auto');
  $('#cap-perf').onchange = async (e) => { e.target.disabled = true; await setPerfMode(e.target.value); e.target.disabled = false; msg(`Performance: ${PERF[e.target.value].label}`); };
  host.querySelectorAll('[data-tool]').forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
  $('#cap-clear').onclick = () => { C.pts = []; C.track = null; C.trail = []; C.speed = []; readout(); };
  $('#cap-post-snap').onclick = postureSnap; $('#cap-post-csv').onclick = postureCsv;
  $('#cap-rec').onclick = () => (C.rec ? stopRec() : startRec());
  $('#cap-xr').onchange = (e) => setExtraCameraRate(+e.target.value);
  $('#cap-cal').onclick = calibrateCams;
  setTool('off'); renderCams();
}
const msg = (t) => { const el = $('#cap-tool-msg'); if (el) el.textContent = t; };
function setTool(t) {
  C.tool = t; C.pts = t === 'track' ? C.pts : []; ov.style.pointerEvents = t === 'off' ? 'none' : 'auto'; ov.style.cursor = t === 'off' ? '' : 'crosshair';
  document.querySelectorAll('#cap-tools [data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
  msg({ off: 'Click on the camera image. Points within 14 px of a detected joint snap to it and follow it live; a magnifier shows the exact spot.', track: 'Click a joint on the camera: its path (last 3 s) and speed are shown.',
    dist: 'Click two points. Two joints: 3D distance from the pose model (metres, estimate). Otherwise: distance in the image, in cm if a scale is set.', angle: 'Click three points; the middle one is the vertex.',
    scale: 'Click both ends of an object of known length in the image, then enter its length. Applies to things at the same distance from the camera.' }[t]);
  readout();
}

// ------------------------------------------------------------------ layout
function applyLayout() {
  stage.classList.remove(...Object.keys(LAYOUTS).map((k) => `ly-${k}`)); stage.classList.add(`ly-${C.layout}`);
  video.classList.toggle('no-mirror', !C.mirror);
  if (C.layout === 'grid' || C.layout === 'split' || C.layout === 'cam' || C.layout === 'campip') if (!video.srcObject && $('#cam')?.srcObject) { video.srcObject = $('#cam').srcObject; video.play().catch(() => {}); }
  requestAnimationFrame(() => { const L = labState(); if (L.renderer) { const r = L.renderer.domElement.getBoundingClientRect(); if (r.width > 2) { L.renderer.setSize(r.width, r.height, false); L.camera.aspect = r.width / r.height; L.camera.updateProjectionMatrix(); } } });
}

// ------------------------------------------------------------------ geometry
function vrect(el = video) { // the drawn video picture inside its element (object-fit: contain), in stage CSS px
  const s = stage.getBoundingClientRect(), r = el.getBoundingClientRect();
  if (!r.width || el.style.display === 'none' || getComputedStyle(el).display === 'none') return null;
  const vw = el.videoWidth || 16, vh = el.videoHeight || 9, k = Math.min(r.width / vw, r.height / vh), w = vw * k, h = vh * k;
  return { x: r.left - s.left + (r.width - w) / 2, y: r.top - s.top + (r.height - h) / 2, w, h, vw, vh };
}
const toPx = (R, p, mir) => ({ x: R.x + (mir ? 1 - p.x : p.x) * R.w, y: R.y + p.y * R.h });
const toNorm = (R, x, y, mir) => { const nx = (x - R.x) / R.w, ny = (y - R.y) / R.h; return nx < 0 || nx > 1 || ny < 0 || ny > 1 ? null : { x: mir ? 1 - nx : nx, y: ny }; };
function local(e) { const s = stage.getBoundingClientRect(); return { x: e.clientX - s.left, y: e.clientY - s.top }; }
function snap(R, n) { // nearest visible joint within 14 px
  if (!C.lm) return null; let best = null, bd = 14;
  for (const i of Object.keys(NAMES).map(Number)) { const p = C.lm[i]; if (!p || (p.visibility ?? 1) < 0.5) continue; const q = toPx(R, p, C.mirror), m = toPx(R, n, C.mirror), d = Math.hypot(q.x - m.x, q.y - m.y); if (d < bd) { bd = d; best = i; } }
  return best;
}
const ptNorm = (pt) => (pt.j != null && C.lm?.[pt.j] ? C.lm[pt.j] : pt.n);
const ptPix = (R, pt) => { const n = ptNorm(pt); return { x: n.x * R.vw, y: n.y * R.vh }; }; // native camera pixels
const ptWorld = (pt) => (pt.j != null && C.world?.[pt.j] ? C.world[pt.j] : null);

// ------------------------------------------------------------------ pointer tools
function onClick(e) {
  const R = vrect(); if (!R) { msg('Start the camera and choose a layout that shows it.'); return; }
  const m = local(e), n = toNorm(R, m.x, m.y, C.mirror); if (!n) return;
  const j = snap(R, n);
  if (C.tool === 'track') { if (j == null) { msg('No joint within 14 px: click closer to a joint.'); return; } C.track = j; C.trail = []; C.speed = []; msg(`Tracking ${NAMES[j]}.`); }
  if (C.tool === 'dist' || C.tool === 'angle' || C.tool === 'scale') {
    const max = C.tool === 'angle' ? 3 : 2; if (C.pts.length >= max) C.pts = [];
    C.pts.push(C.tool === 'scale' ? { n, j: null } : { n, j });
    if (C.tool === 'scale' && C.pts.length === 2) {
      const a = ptPix(R, C.pts[0]), b = ptPix(R, C.pts[1]), px = Math.hypot(a.x - b.x, a.y - b.y), cm = parseFloat(prompt('Real length between the two points (cm):', '100') || '');
      if (cm > 0 && px > 2) { C.scale = { cmPerPx: cm / px, vw: R.vw, vh: R.vh, ref: cm }; save(); msg(`Scale set: ${(cm / px).toFixed(3)} cm per camera pixel (${cm} cm reference). Valid at that distance from the camera.`); }
    }
  }
  readout();
}
function readout() {
  const host = $('#cap-read'); if (!host) return; const R = vrect();
  const out = [];
  if (C.tool === 'dist' && C.pts.length === 2 && R) {
    const [a, b] = C.pts, wa = ptWorld(a), wb = ptWorld(b), pa = ptPix(R, a), pb = ptPix(R, b), px = Math.hypot(pa.x - pb.x, pa.y - pb.y);
    if (wa && wb) out.push(`3D distance <b class="mono">${(100 * Math.hypot(wa.x - wb.x, wa.y - wb.y, wa.z - wb.z)).toFixed(1)} cm</b> <small>(${esc(NAMES[a.j])} – ${esc(NAMES[b.j])}, pose model estimate)</small>`);
    out.push(`Image distance <b class="mono">${px.toFixed(1)} px</b>${C.scale && C.scale.vw === R.vw ? ` = <b class="mono">${(px * C.scale.cmPerPx).toFixed(1)} cm</b> <small>at the reference distance</small>` : ''}`);
  }
  if (C.tool === 'angle' && C.pts.length === 3 && R) {
    const [a, v, b] = C.pts.map((p) => ptPix(R, p)), ang = (u, w) => { const d = Math.acos(Math.max(-1, Math.min(1, (u.x * w.x + u.y * w.y + (u.z || 0) * (w.z || 0)) / (Math.hypot(u.x, u.y, u.z || 0) * Math.hypot(w.x, w.y, w.z || 0) || 1)))); return (d * 180) / Math.PI; };
    out.push(`Angle in the image <b class="mono">${ang({ x: a.x - v.x, y: a.y - v.y }, { x: b.x - v.x, y: b.y - v.y }).toFixed(1)}°</b>`);
    const W = C.pts.map(ptWorld); if (W.every(Boolean)) out.push(`3D angle <b class="mono">${ang({ x: W[0].x - W[1].x, y: W[0].y - W[1].y, z: W[0].z - W[1].z }, { x: W[2].x - W[1].x, y: W[2].y - W[1].y, z: W[2].z - W[1].z }).toFixed(1)}°</b> <small>(vertex ${esc(NAMES[C.pts[1].j])})</small>`);
  }
  if (C.track != null) { const sp = C.speed.length ? C.speed[C.speed.length - 1] : null, pk = C.speed.length ? Math.max(...C.speed) : null; out.push(`${esc(NAMES[C.track])}: speed <b class="mono">${sp == null ? '—' : sp.toFixed(2)} m/s</b> · peak (3 s) <b class="mono">${pk == null ? '—' : pk.toFixed(2)} m/s</b> <small>3D, pose model estimate</small>`); }
  if (C.scale) out.push(`<small>Scale: ${C.scale.cmPerPx.toFixed(3)} cm/px from a ${C.scale.ref} cm reference.</small>`);
  host.innerHTML = out.map((x) => `<div>${x}</div>`).join('');
}

// ------------------------------------------------------------------ per pose frame
let lastTrailT = 0;
function onPose(t) {
  if (C.track != null && C.lm?.[C.track]) {
    C.trail.push({ x: C.lm[C.track].x, y: C.lm[C.track].y, t }); while (C.trail.length && t - C.trail[0].t > 3) C.trail.shift();
    const w = C.world?.[C.track];
    if (w && C.prevW && t > C.prevW.t) { const v = Math.hypot(w.x - C.prevW.x, w.y - C.prevW.y, w.z - C.prevW.z) / (t - C.prevW.t); C.speed.push(C.sv = C.sv == null ? v : C.sv * 0.6 + v * 0.4); while (C.speed.length > 90) C.speed.shift(); }
    C.prevW = w ? { x: w.x, y: w.y, z: w.z, t } : null;
  }
  if (C.postAcc) postureAccumulate();
  if (t - lastTrailT > 0.2) { lastTrailT = t; readout(); }
}

// ------------------------------------------------------------------ drawing
let lastDraw = 0;
function loop(now) {
  requestAnimationFrame(loop);
  if ($('#mode-lab')?.hidden || document.hidden || now - lastDraw < (getPerfMode() === 'eco' ? 66 : 33)) return;
  lastDraw = now; draw(); if (C.layout === 'grid') drawGrid(); stateChip();
}
function draw() {
  const d = ov.width / (stage.getBoundingClientRect().width || 1); ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, ov.width, ov.height);
  const R = vrect(); if (!R || !C.lm || !video.srcObject) { if (C.tool !== 'off' && R) loupe(R); return; }
  drawSkeleton(ctx, R, C.lm, C.mirror);
  if (C.area) bodyArea(ctx, R, C.lm, C.mirror);
  if (C.post) postureLines(ctx, R);
  if (C.trail.length > 1) { ctx.lineWidth = 2.5; for (let i = 1; i < C.trail.length; i++) { const a = toPx(R, C.trail[i - 1], C.mirror), b = toPx(R, C.trail[i], C.mirror); ctx.strokeStyle = `rgba(255,61,242,${i / C.trail.length})`; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); } }
  const P = C.pts.map((p) => toPx(R, ptNorm(p), C.mirror));
  if (P.length > 1) { ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.beginPath(); P.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke(); ctx.setLineDash([]); }
  P.forEach((p, i) => { ctx.strokeStyle = C.pts[i].j != null ? '#5ef0b0' : '#ffd166'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, 6.283); ctx.stroke(); ctx.beginPath(); ctx.moveTo(p.x - 11, p.y); ctx.lineTo(p.x + 11, p.y); ctx.moveTo(p.x, p.y - 11); ctx.lineTo(p.x, p.y + 11); ctx.stroke(); });
  if (C.tool !== 'off') loupe(R);
}
function drawSkeleton(g, R, lm, mir, small = false) {
  if (!C.skel && !small) return;
  g.lineWidth = small ? 1.5 : 3; g.lineCap = 'round';
  for (const [a, b] of BONES) { const p = lm[a], q = lm[b]; if (!p || !q) continue; const v = Math.min(p.visibility ?? 1, q.visibility ?? 1); if (v < 0.3) continue; const A = toPx(R, p, mir), B = toPx(R, q, mir); g.strokeStyle = `rgba(94,231,255,${0.25 + 0.75 * v})`; g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.stroke(); }
  for (const i of Object.keys(NAMES).map(Number)) { const p = lm[i]; if (!p || (p.visibility ?? 1) < 0.3) continue; const A = toPx(R, p, mir); g.fillStyle = i === C.track ? '#ff3df2' : (p.visibility ?? 1) > 0.7 ? '#e6ecff' : '#8b98bd'; g.beginPath(); g.arc(A.x, A.y, small ? 2 : 3.5, 0, 6.283); g.fill(); }
}
function bodyArea(g, R, lm, mir) {
  const vis = lm.map((p, i) => ({ p, i })).filter(({ p }) => (p.visibility ?? 1) > 0.5);
  if (!vis.length) return;
  const xs = vis.map(({ p }) => (mir ? 1 - p.x : p.x)), ys = vis.map(({ p }) => p.y), pad = 0.04;
  const x0 = Math.max(0, Math.min(...xs) - pad), x1 = Math.min(1, Math.max(...xs) + pad), y0 = Math.max(0, Math.min(...ys) - pad * 1.5), y1 = Math.min(1, Math.max(...ys) + pad);
  const missing = Object.entries(FULL).filter(([, ids]) => ids.some((i) => (lm[i]?.visibility ?? 0) < 0.6 || lm[i].y > 0.995 || lm[i].y < 0.005 || lm[i].x < 0.005 || lm[i].x > 0.995)).map(([k]) => k);
  const full = !missing.length, col = full ? '#5ef0b0' : '#ffc067';
  g.strokeStyle = col; g.lineWidth = 2; g.setLineDash(full ? [] : [8, 6]); g.strokeRect(R.x + x0 * R.w, R.y + y0 * R.h, (x1 - x0) * R.w, (y1 - y0) * R.h); g.setLineDash([]);
  const label = full ? `Full body · ${Math.round(100 * (Math.max(...ys) - Math.min(...ys)))}% of frame height` : `Not in view: ${missing.join(', ')}`;
  g.font = '600 12px system-ui'; const tw = g.measureText(label).width; g.fillStyle = 'rgba(3,5,13,.75)'; g.fillRect(R.x + x0 * R.w, R.y + y0 * R.h - 20, tw + 12, 18); g.fillStyle = col; g.fillText(label, R.x + x0 * R.w + 6, R.y + y0 * R.h - 7);
  C.bodyFull = full; C.bodyMissing = missing;
  const host = $('#cap-body'); if (host) host.innerHTML = full ? '<span class="q good">Full body detected</span>' : `<span class="q poor">Partial: ${esc(missing.join(', '))} not clearly in view</span> — step back or lower/raise the camera.`;
}
function loupe(R) {
  if (!C.mouse || !video.videoWidth) return;
  const n = toNorm(R, C.mouse.x, C.mouse.y, C.mirror); if (!n) return;
  const z = 4, S = 130, sx = n.x * R.vw - S / (2 * z) * (R.vw / R.w), sy = n.y * R.vh - S / (2 * z) * (R.vh / R.h), sw = (S / z) * (R.vw / R.w), sh = (S / z) * (R.vh / R.h);
  const ox = C.mouse.x + 18 + S > ov.clientWidth ? C.mouse.x - 18 - S : C.mouse.x + 18, oy = Math.max(4, C.mouse.y - S - 18);
  ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, S, S); ctx.clip();
  if (C.mirror) { ctx.translate(ox + S, oy); ctx.scale(-1, 1); ctx.drawImage(video, sx, sy, sw, sh, 0, 0, S, S); } else ctx.drawImage(video, sx, sy, sw, sh, ox, oy, S, S);
  ctx.restore();
  ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 1.5; ctx.strokeRect(ox, oy, S, S); ctx.beginPath(); ctx.moveTo(ox + S / 2, oy); ctx.lineTo(ox + S / 2, oy + S); ctx.moveTo(ox, oy + S / 2); ctx.lineTo(ox + S, oy + S / 2); ctx.stroke();
  const j = snap(R, n); ctx.font = '11px system-ui'; ctx.fillStyle = 'rgba(3,5,13,.8)'; ctx.fillRect(ox, oy + S, S, 30); ctx.fillStyle = '#e6ecff';
  ctx.fillText(`${(n.x * R.vw).toFixed(1)}, ${(n.y * R.vh).toFixed(1)} px`, ox + 4, oy + S + 12); ctx.fillText(j != null ? `snaps to ${NAMES[j]}` : 'free point', ox + 4, oy + S + 25);
}

// ------------------------------------------------------------------ posture (frontal view: image geometry; 3D from the pose model)
function postureNow() {
  const L = C.lm, W = C.world; if (!L) return null;
  const R = vrect() || { vw: 16, vh: 9 }, P = (i) => ({ x: L[i].x * R.vw, y: L[i].y * R.vh, v: L[i].visibility ?? 1 });
  const tilt = (a, b) => { const A = P(a), B = P(b); if (Math.min(A.v, B.v) < 0.5) return null; return { deg: (Math.atan2(B.y - A.y, B.x - A.x) * 180) / Math.PI * -1, higher: A.y < B.y ? 'left' : 'right' }; };
  const mid = (a, b) => { const A = P(a), B = P(b); return { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, v: Math.min(A.v, B.v) }; };
  const ms = mid(11, 12), mh = mid(23, 24), ma = mid(27, 28);
  const lean = ms.v > 0.5 && mh.v > 0.5 ? (Math.atan2(ms.x - mh.x, mh.y - ms.y) * 180) / Math.PI : null;
  const knee = (h, k, a) => { const H = P(h), K = P(k), A = P(a); if (Math.min(H.v, K.v, A.v) < 0.5) return null; const t = ((K.x - H.x) * (A.x - H.x) + (K.y - H.y) * (A.y - H.y)) / ((A.x - H.x) ** 2 + (A.y - H.y) ** 2 || 1); const fx = H.x + t * (A.x - H.x), legLen = Math.hypot(A.x - H.x, A.y - H.y) || 1; return (100 * (K.x - fx)) / legLen; };
  const shift = ma.v > 0.5 && mh.v > 0.5 ? (100 * (mh.x - ma.x)) / (Math.abs(P(27).x - P(28).x) || 1) : null;
  let fwd = null;
  if (W && (L[7].visibility ?? 0) > 0.5 && (L[11].visibility ?? 0) > 0.5) { const ez = (W[7].z + W[8].z) / 2, sz = (W[11].z + W[12].z) / 2; fwd = 100 * (sz - ez); }
  return { shoulders: tilt(11, 12), hips: tilt(23, 24), head: tilt(7, 8), lean, kneeL: knee(23, 25, 27), kneeR: knee(24, 26, 28), shift, fwd };
}
function postureLines(g, R) {
  const L = C.lm, line = (a, b, col) => { if ((L[a].visibility ?? 0) < 0.5 || (L[b].visibility ?? 0) < 0.5) return; const A = toPx(R, L[a], C.mirror), B = toPx(R, L[b], C.mirror); g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.stroke(); const lv = (A.y + B.y) / 2; g.setLineDash([3, 5]); g.strokeStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(Math.min(A.x, B.x) - 30, lv); g.lineTo(Math.max(A.x, B.x) + 30, lv); g.stroke(); g.setLineDash([]); };
  line(7, 8, '#ff8fa3'); line(11, 12, '#ffc067'); line(23, 24, '#8b7bff');
  if ((L[0].visibility ?? 0) > 0.5) { const top = toPx(R, L[0], C.mirror), feet = toPx(R, { x: ((L[27].x + L[28].x) / 2), y: Math.max(L[27].y, L[28].y) }, C.mirror); g.strokeStyle = 'rgba(94,231,255,.5)'; g.setLineDash([2, 6]); g.beginPath(); g.moveTo(feet.x, top.y - 20); g.lineTo(feet.x, feet.y); g.stroke(); g.setLineDash([]); }
}
function postureSnap() {
  if (!C.lm) { $('#cap-post-out').textContent = 'Start the camera first (Setup → Start camera).'; return; }
  C.postAcc = []; $('#cap-post-out').textContent = 'Hold still, facing the camera, whole body in view… 3';
  let n = 3; const iv = setInterval(() => { n--; if (n > 0) $('#cap-post-out').textContent = `Hold still… ${n}`; else { clearInterval(iv); finishPosture(); } }, 1000);
}
function postureAccumulate() { const p = postureNow(); if (p) C.postAcc.push(p); }
function finishPosture() {
  const A = C.postAcc || []; C.postAcc = null;
  if (A.length < 5) { $('#cap-post-out').textContent = 'Not enough frames: make sure the whole body is in view and try again.'; return; }
  const med = (f) => { const xs = A.map(f).filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b); return xs.length ? { m: xs[Math.floor(xs.length / 2)], sd: Math.sqrt(xs.reduce((s, x, _, a) => s + (x - a.reduce((p, q) => p + q, 0) / a.length) ** 2, 0) / xs.length), n: xs.length } : null; };
  const side = (f) => { const h = A.map(f).filter(Boolean); const l = h.filter((x) => x === 'left').length; return h.length ? (l > h.length / 2 ? 'left' : 'right') : ''; };
  const rows = [
    ['Head tilt (ear line vs horizontal)', med((p) => (p.head ? Math.abs(p.head.deg) : null)), '°', side((p) => p.head?.higher) && `${side((p) => p.head?.higher)} ear higher`],
    ['Shoulder line vs horizontal', med((p) => (p.shoulders ? Math.abs(p.shoulders.deg) : null)), '°', side((p) => p.shoulders?.higher) && `${side((p) => p.shoulders?.higher)} shoulder higher`],
    ['Pelvic line (hip centres) vs horizontal', med((p) => (p.hips ? Math.abs(p.hips.deg) : null)), '°', side((p) => p.hips?.higher) && `${side((p) => p.hips?.higher)} hip higher`],
    ['Trunk lean (hips → shoulders vs vertical)', med((p) => p.lean), '°', 'sign: + = towards image right'],
    ['Left knee off the hip–ankle line', med((p) => p.kneeL), '% of leg length', '+ = towards image right'],
    ['Right knee off the hip–ankle line', med((p) => p.kneeR), '% of leg length', '+ = towards image right'],
    ['Pelvis over the feet (sideways shift)', med((p) => p.shift), '% of stance width', '+ = towards image right'],
    ['Ear in front of shoulder (depth, 3D)', med((p) => p.fwd), 'cm', 'facing the camera; pose-model depth, least reliable'],
  ];
  C.post3 = { at: new Date().toISOString(), frames: A.length, rows: rows.map(([k, v, u, note]) => ({ k, median: v?.m, sd: v?.sd, n: v?.n, unit: u, note })) };
  $('#cap-post-out').innerHTML = `<table class="bio-table"><thead><tr><th>Measure</th><th>Median</th><th>± SD</th><th></th></tr></thead><tbody>${C.post3.rows.map((r) => `<tr><td>${esc(r.k)}</td><td class="mono">${r.median == null ? '—' : r.median.toFixed(1)} ${esc(r.unit)}</td><td class="mono">${r.sd == null ? '' : r.sd.toFixed(1)}</td><td><small>${esc(r.note || '')}</small></td></tr>`).join('')}</tbody></table>
    <p class="fine muted">${A.length} frames over 3 s. Camera estimates from a single view (MediaPipe pose), not validated against a posture-assessment standard; the camera must be level and square to you. Values only, no diagnosis.</p>`;
  $('#cap-post-csv').disabled = false;
}
function postureCsv() {
  if (!C.post3) return;
  const csv = ['measure,median,sd,frames,unit,note', ...C.post3.rows.map((r) => [r.k, r.median?.toFixed(2) ?? '', r.sd?.toFixed(2) ?? '', r.n ?? '', r.unit, r.note || ''].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(','))].join('\n');
  dl(new Blob([csv], { type: 'text/csv' }), `posture-${C.post3.at.slice(0, 19).replace(/[:T]/g, '-')}.csv`);
}

// ------------------------------------------------------------------ multi-camera grid
function drawGrid() {
  const s = stage.getBoundingClientRect(), d = grid.width / (s.width || 1); gctx.setTransform(d, 0, 0, d, 0, 0); gctx.clearRect(0, 0, s.width, s.height);
  const tiles = [{ v: video, lm: C.lm, label: 'Primary', mir: C.mirror }, ...multicam.cams.map((c) => ({ v: c.video, lm: c.res?.landmarks?.[0], label: c.label, mir: C.mirror, c }))].slice(0, 4);
  const W = s.width / 2, cols = tiles.length > 1 ? 2 : 1, rows = Math.ceil(tiles.length / cols), tw = W / cols, th = s.height / rows;
  tiles.forEach((t, i) => {
    const x = (i % cols) * tw, y = Math.floor(i / cols) * th; gctx.fillStyle = '#02040a'; gctx.fillRect(x, y, tw, th);
    if (!t.v?.videoWidth) return;
    const k = Math.min(tw / t.v.videoWidth, th / t.v.videoHeight), w = t.v.videoWidth * k, h = t.v.videoHeight * k, R = { x: x + (tw - w) / 2, y: y + (th - h) / 2, w, h, vw: t.v.videoWidth, vh: t.v.videoHeight };
    gctx.save(); if (t.mir) { gctx.translate(R.x + R.w, R.y); gctx.scale(-1, 1); gctx.drawImage(t.v, 0, 0, R.w, R.h); } else gctx.drawImage(t.v, R.x, R.y, R.w, R.h); gctx.restore();
    if (t.lm) drawSkeleton(gctx, R, t.lm, t.mir, true);
    gctx.font = '600 11px system-ui'; gctx.fillStyle = 'rgba(3,5,13,.75)'; gctx.fillRect(x + 6, y + 6, 230, 18); gctx.fillStyle = '#e6ecff';
    gctx.fillText(t.c ? `${t.label} · ${t.c.fps.toFixed(0)} fps${t.c.resid != null ? ` · ${t.c.resid.toFixed(0)} mm` : ''}${t.c.locked ? ' · locked' : ''}` : `${t.label} (primary)`, x + 10, y + 19);
  });
}
function renderCams() {
  const host = $('#cap-cams'); if (!host) return;
  if (!multicam.cams.length) { host.innerHTML = `<span class="muted">Primary camera only.</span>${C.calOut || ''}`; return; }
  const med = (h) => { const s = h.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
  host.innerHTML = `<table class="bio-table"><thead><tr><th>Camera</th><th>fps</th><th>Detector</th><th>Joints</th><th>Agreement now (median of last 3 s)</th><th></th></tr></thead><tbody>${multicam.cams.map((c) => `<tr><td>${esc(c.label)}</td><td class="mono">${c.fps.toFixed(0)}</td><td>${esc(c.delegate || '')}</td><td class="mono">${c.used}</td><td class="mono">${med(c.hist) == null ? '—' : med(c.hist).toFixed(0) + ' mm'}</td><td>${c.locked ? 'locked' : 'live'}</td></tr>`).join('')}</tbody></table>${C.calOut || ''}`;
}
setInterval(() => { if (!$('#mode-lab')?.hidden) renderCams(); }, 1500);
async function calibrateCams() {
  if (!multicam.cams.length) { C.calOut = '<p class="muted">Add a second camera first (Setup → Cameras → Use all cameras).</p>'; renderCams(); return; }
  const b = $('#cap-cal'); b.disabled = true;
  for (let n = 3; n > 0; n--) { b.textContent = `Get ready… ${n}`; await new Promise((r) => setTimeout(r, 1000)); }
  b.textContent = 'Hold still (3 s)…';
  const res = await calibrate(3000);
  b.disabled = false; b.textContent = 'Calibrate cameras (stand still 3 s)';
  C.calOut = `<p><b>Calibration ${new Date().toLocaleTimeString()}</b></p><table class="bio-table"><thead><tr><th>Camera</th><th>Frames</th><th>Median</th><th>90th pct</th><th></th></tr></thead><tbody>${res.map((r) => `<tr><td>${esc(r.label)}</td><td class="mono">${r.frames}</td><td class="mono">${r.ok ? r.median_mm.toFixed(0) + ' mm' : '—'}</td><td class="mono">${r.ok ? r.p90_mm.toFixed(0) + ' mm' : '—'}</td><td>${r.ok ? 'locked' : `<span class="q poor">${esc(r.note)}</span>`}</td></tr>`).join('')}</tbody></table>`;
  renderCams();
}

// ------------------------------------------------------------------ recording
function pickMime() { for (const m of ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) if (window.MediaRecorder?.isTypeSupported?.(m)) return m; return ''; }
function startRec() {
  const q = +$('#cap-q').value, fps = +$('#cap-fps').value, H = q, Wd = Math.round((q * 16) / 9 / 2) * 2;
  const out = document.createElement('canvas'); out.width = Wd; out.height = H; const g = out.getContext('2d');
  const mime = pickMime(); if (!mime) { $('#cap-rec-t').textContent = 'Recording is not supported in this browser.'; return; }
  const stream = out.captureStream(fps), rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: q >= 1080 ? 16e6 : q >= 720 ? 8e6 : 3e6 });
  const chunks = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.onstop = () => { const blob = new Blob(chunks, { type: mime.split(';')[0] }), ext = mime.includes('mp4') ? 'mp4' : 'webm', name = `motion-lab-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`; C.clips.unshift({ blob, name, secs: (performance.now() - C.recT0) / 1000, url: URL.createObjectURL(blob) }); clipsUi(); };
  C.rec = { rec, out, g, fps, last: 0 }; C.recT0 = performance.now(); rec.start(1000);
  $('#cap-rec').textContent = '■ Stop'; $('#cap-rec').classList.add('recording');
  const frame = (now) => {
    if (!C.rec) return; requestAnimationFrame(frame);
    if (now - C.rec.last < 1000 / fps - 2) return; C.rec.last = now; compose(g, out);
    $('#cap-rec-t').textContent = `${((now - C.recT0) / 1000).toFixed(1)} s · ${mime.split(';')[0]}`;
  };
  requestAnimationFrame(frame);
}
function stopRec() { if (!C.rec) return; C.rec.rec.stop(); C.rec = null; $('#cap-rec').textContent = '● Record'; $('#cap-rec').classList.remove('recording'); $('#cap-rec-t').textContent = ''; }
function compose(g, out) {
  const s = stage.getBoundingClientRect(), k = Math.min(out.width / s.width, out.height / s.height), ox = (out.width - s.width * k) / 2, oy = (out.height - s.height * k) / 2;
  g.fillStyle = '#03050d'; g.fillRect(0, 0, out.width, out.height);
  const put = (el, mirror) => { if (!el || getComputedStyle(el).display === 'none' || getComputedStyle(el).visibility === 'hidden') return; const r = el.getBoundingClientRect(); if (!r.width) return; const x = ox + (r.left - s.left) * k, y = oy + (r.top - s.top) * k, w = r.width * k, h = r.height * k;
    try { if (el.tagName === 'VIDEO') { if (!el.videoWidth) return; const R = vrect(el); const vx = ox + R.x * k, vy = oy + R.y * k, vw = R.w * k, vh = R.h * k; g.save(); if (mirror) { g.translate(vx + vw, vy); g.scale(-1, 1); g.drawImage(el, 0, 0, vw, vh); } else g.drawImage(el, vx, vy, vw, vh); g.restore(); } else g.drawImage(el, x, y, w, h); } catch { /* frame not ready */ } };
  const L = labState(), cv = L.renderer?.domElement;
  if (C.layout === 'grid') put(grid);
  if (cv && C.layout !== 'cam') { L.renderer.render(L.scene, L.camera); }
  const order = C.layout === 'campip' ? [[video, C.mirror], [cv], [ov]] : [[cv], [video, C.mirror], [ov]];
  for (const [el, m] of order) if (!(C.layout === 'grid' && el === video)) put(el, m);
  g.font = `600 ${Math.round(out.height / 45)}px system-ui`; g.fillStyle = 'rgba(230,236,255,.85)'; g.fillText(`Meridian Motion Lab 4D · ${new Date().toLocaleString()}`, 14, out.height - 14);
}
function clipsUi() {
  $('#cap-clips').innerHTML = C.clips.map((c, i) => `<li><video src="${c.url}" controls muted playsinline></video><div><b>${esc(c.name)}</b><small>${c.secs.toFixed(1)} s · ${(c.blob.size / 1e6).toFixed(1)} MB</small><span class="btnrow"><a class="ghost-btn" href="${c.url}" download="${esc(c.name)}">Download</a><button class="ghost-btn" data-del="${i}">Delete</button></span></div></li>`).join('');
  document.querySelectorAll('#cap-clips [data-del]').forEach((b) => (b.onclick = () => { const c = C.clips.splice(+b.dataset.del, 1)[0]; URL.revokeObjectURL(c.url); clipsUi(); }));
}
function dl(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }

// ------------------------------------------------------------------ status and low-power auto-adjust
function stateChip() {
  const el = $('#cap-state'); if (!el) return;
  const live = !!video.srcObject, n = 1 + multicam.cams.length;
  el.textContent = live ? `${$('#fps')?.textContent || ''} · ${n} camera${n > 1 ? 's' : ''}${C.rec ? ' · ● REC' : ''}` : 'camera off';
}
function autoPerf() {
  if (!C.auto || !video.srcObject || $('#mode-lab')?.hidden) return;
  const fps = parseFloat(($('#fps')?.textContent || '').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(fps)) return;
  C.slow = fps < 12 ? C.slow + 1 : 0;
  if (C.slow >= 3) {
    const order = ['accuracy', 'balanced', 'speed', 'eco'], cur = getPerfMode(), i = order.indexOf(cur);
    if (i >= 0 && i < order.length - 1) { setPerfMode(order[i + 1]); $('#cap-perf').value = order[i + 1]; if (multicam.cams.length) { setExtraCameraRate(order[i + 1] === 'eco' ? 8 : 12); $('#cap-xr').value = order[i + 1] === 'eco' ? '8' : '12'; } msg(`Detection was below 12 fps for 9 s: switched to ${PERF[order[i + 1]].label}.`); }
    C.slow = 0;
  }
}
