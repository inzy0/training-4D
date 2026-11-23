// Scanner lens: point at your own body on the live camera (mouse, or your
// index fingertip as the "device") and the lens shows the reference anatomy
// that lies under that spot: zoom, enlarge, cut deeper, choose tissue
// categories, and see the structure under the crosshair with its conditions.
//
// How the spot is found: the pointer is mapped from the camera image onto the
// BodyParts3D reference body by matching landmarks (pose joints, hand, eyes)
// to the same joints in the atlas. It is ONE reference anatomy fitted to your
// joints, not your anatomy and not imaging.

import * as THREE from 'three';
import { loadAtlas, regionOf3D } from './atlas_data.js';
import { loadConditions, renderConditions } from './conditions.js';
import { meshLinkHtml } from './atlas.js';

const $ = (s) => document.querySelector(s);
const CATS = [
  ['skin', 'Skin'], ['muscles', 'Muscle'], ['arteries', 'Arteries'], ['veins', 'Veins'],
  ['nerves', 'Nerves'], ['organs', 'Organs'], ['skeleton', 'Bone'],
];
const REGION_LABEL = {
  head: 'Head', face: 'Face', neck: 'Neck', shoulder: 'Shoulder', upper_arm: 'Upper arm', elbow: 'Elbow', forearm: 'Forearm',
  wrist: 'Wrist', hand: 'Hand', thorax: 'Chest', back: 'Back', abdomen: 'Abdomen', hip: 'Hip / pelvis', thigh: 'Thigh',
  knee: 'Knee', lower_leg: 'Lower leg', ankle: 'Ankle', foot: 'Foot',
};

export const scanner = {
  enabled: false, ready: false, mode: 'mouse', locked: false, zoom: 1.6, depthCm: 0, radius: 120, big: false,
  style: 'xray', cats: { skin: false, muscles: true, arteries: true, veins: true, nerves: true, organs: true, skeleton: true },
  pointer: null, target: null, under: null, inView: [], lastPick: 0, pinchWas: false, lastPinch: 0, condState: {},
};

let atlas, renderer, scene, camera, clipPlane, groups = new Map(), mats = {}, ray = new THREE.Raycaster(), conds = null;

// ------------------------------------------------------------------ UI wiring
export function initScannerUI() {
  const bar = $('#scan-bar');
  bar.querySelector('#scan-cats').innerHTML = CATS.map(([k, l]) =>
    `<label class="chipbox"><input type="checkbox" data-cat="${k}" ${scanner.cats[k] ? 'checked' : ''}> ${l}</label>`).join('');
  bar.querySelectorAll('[data-cat]').forEach((el) => el.addEventListener('change', () => { scanner.cats[el.dataset.cat] = el.checked; applyCats(); }));
  bar.querySelectorAll('[name=scan-mode]').forEach((el) => el.addEventListener('change', () => { scanner.mode = el.value; scanner.locked = false; syncLock(); }));
  bar.querySelectorAll('[name=scan-style]').forEach((el) => el.addEventListener('change', () => { scanner.style = el.value; applyCats(); }));
  $('#scan-zoom-in').onclick = () => setZoom(scanner.zoom * 1.25);
  $('#scan-zoom-out').onclick = () => setZoom(scanner.zoom / 1.25);
  $('#scan-lock').onclick = () => { scanner.locked = !scanner.locked; syncLock(); };
  $('#scan-big').onclick = () => { scanner.big = !scanner.big; $('#scan-big').textContent = scanner.big ? 'Shrink' : 'Enlarge'; };
  $('#scan-size').addEventListener('input', (e) => { scanner.radius = +e.target.value; });
  $('#scan-depth').addEventListener('input', (e) => { scanner.depthCm = +e.target.value; $('#scan-depth-val').textContent = `${scanner.depthCm.toFixed(1)} cm`; });

  const stage = $('.stage');
  stage.addEventListener('pointermove', (e) => { if (scanner.enabled && scanner.mode === 'mouse' && !scanner.locked) scanner.pointer = cssToCanvas(e); });
  stage.addEventListener('click', (e) => { if (scanner.enabled && scanner.mode === 'mouse' && e.target.closest('.stage-cta') === null) { scanner.pointer = cssToCanvas(e); scanner.locked = !scanner.locked; syncLock(); } });
  stage.addEventListener('wheel', (e) => { if (!scanner.enabled) return; e.preventDefault(); setZoom(scanner.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }, { passive: false });
}

function setZoom(z) { scanner.zoom = Math.max(0.5, Math.min(12, z)); $('#scan-zoom-val').textContent = `${scanner.zoom.toFixed(1)}×`; }
function syncLock() { $('#scan-lock').textContent = scanner.locked ? 'Unlock' : 'Lock'; $('#lens').classList.toggle('locked', scanner.locked); }

export async function setScannerEnabled(on) {
  scanner.enabled = on;
  $('#lens').hidden = !on; $('#scan-bar').hidden = !on; $('#scan-card').hidden = !on;
  if (on && !scanner.ready) {
    $('#scan-info').textContent = 'Loading reference anatomy…';
    atlas = await loadAtlas((m) => { $('#scan-info').textContent = m; });
    conds = await loadConditions();
    buildScene();
    scanner.ready = true;
    $('#scan-info').textContent = 'Point at your body. Mouse: move and click to lock. Finger: point with your index finger, pinch to lock.';
  }
}

function buildScene() {
  renderer = new THREE.WebGLRenderer({ canvas: $('#lens-gl'), antialias: true, alpha: true });
  renderer.setPixelRatio(1);
  renderer.localClippingEnabled = true;
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
  scene.add(new THREE.HemisphereLight(0xe8f2ff, 0x221830, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(0.5, 1, 2 * atlas.anchors.anterior); scene.add(key);
  const A = atlas.anchors.anterior;
  clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, A), 9); // keeps A*z <= c (behind the cut)
  for (const L of atlas.index.layers) {
    mats[L.key] = {
      anatomy: new THREE.MeshStandardMaterial({ color: L.color, roughness: 0.5, side: THREE.DoubleSide, clippingPlanes: [clipPlane] }),
      xray: L.key === 'skeleton'
        // additive, low opacity: overlapping bone adds up like density on a radiograph instead of saturating
        ? new THREE.MeshBasicMaterial({ color: 0xa8ccff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, clippingPlanes: [clipPlane] })
        : new THREE.MeshBasicMaterial({ color: L.key === 'arteries' ? 0xff6a7a : L.key === 'veins' ? 0x6a8cff : L.key === 'nerves' ? 0xffe27a : 0x5aa0ff,
          // nerves/organs: the brain alone is ~100 overlapping meshes, so keep these faint
          transparent: true, opacity: L.key === 'muscles' ? 0.025 : L.key === 'skin' ? 0.015 : (L.key === 'nerves' || L.key === 'organs') ? 0.022 : 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, clippingPlanes: [clipPlane] }),
    };
    const g = new THREE.Group(); scene.add(g); groups.set(L.key, g);
  }
  for (const { part, geometry } of atlas.parts) {
    const m = new THREE.Mesh(geometry, mats[part.layer].xray); m.userData.part = part; groups.get(part.layer).add(m);
  }
  applyCats();
}

function applyCats() {
  if (!scene) return;
  groups.forEach((g, k) => {
    g.visible = !!scanner.cats[k];
    g.children.forEach((m) => { m.material = mats[k][scanner.style]; });
  });
}

// ------------------------------------------------------------------ geometry helpers
const V = (x, y) => ({ x, y });
// Affine map from 3 screen points to 3 atlas-2D points; returns fn + 2x2 matrix.
function affine(s, a) {
  const [s0, s1, s2] = s, [a0, a1, a2] = a;
  const m11 = s1.x - s0.x, m12 = s2.x - s0.x, m21 = s1.y - s0.y, m22 = s2.y - s0.y;
  const det = m11 * m22 - m12 * m21; if (Math.abs(det) < 1e-6) return null;
  const inv = [m22 / det, -m12 / det, -m21 / det, m11 / det];
  const b11 = a1.x - a0.x, b12 = a2.x - a0.x, b21 = a1.y - a0.y, b22 = a2.y - a0.y;
  const J = [b11 * inv[0] + b12 * inv[2], b11 * inv[1] + b12 * inv[3], b21 * inv[0] + b22 * inv[2], b21 * inv[1] + b22 * inv[3]];
  return { J, f: (p) => V(a0.x + J[0] * (p.x - s0.x) + J[1] * (p.y - s0.y), a0.y + J[2] * (p.x - s0.x) + J[3] * (p.y - s0.y)) };
}
// Similarity from 2 point pairs (adds a perpendicular third point on both sides).
function similarity(s0, s1, a0, a1) {
  const perp = (p, q) => V(p.x - (q.y - p.y), p.y + (q.x - p.x));
  return affine([s0, s1, perp(s0, s1)], [a0, a1, perp(a0, a1)]);
}

// atlas 3D <-> atlas 2D "mirror view" (subject's left on the left, y down like the screen)
function to2D(v) { return V(-atlas.anchors.leftX * v.x, -v.y); }
function from2D(p, z) { return new THREE.Vector3(-atlas.anchors.leftX * p.x, -p.y, z); }

// ------------------------------------------------------------------ per frame
export function updateScanner(frame, t) {
  if (!scanner.enabled || !scanner.ready) return;
  const A = atlas.anchors;
  // 1. pointer
  let probeSide = null;
  if (scanner.mode === 'finger' && frame.hands.length) {
    const h = frame.hands.find((x) => x.side === scanner.probeSide) || frame.hands[0];
    scanner.probeSide = h.side; probeSide = h.side;
    const p = h.pts, palm = Math.hypot(p[5].x - p[17].x, p[5].y - p[17].y) || 1;
    const pinch = Math.hypot(p[4].x - p[8].x, p[4].y - p[8].y) < palm * 0.3;
    if (pinch && !scanner.pinchWas && t - scanner.lastPinch > 0.6) { scanner.locked = !scanner.locked; scanner.lastPinch = t; syncLock(); }
    scanner.pinchWas = pinch;
    if (!scanner.locked) scanner.pointer = V(p[8].x, p[8].y);
  }
  const P = scanner.pointer; if (!P) { drawHud(frame, null); return; }
  // 2. map pointer onto the reference body (skipped while locked: keep the last fit)
  if (!scanner.locked || !scanner.target) scanner.target = mapPointer(P, frame, A, probeSide) || scanner.target;
  const T = scanner.target;
  placeLens(frame, P);
  if (!T) { drawHud(frame, null); return; }
  renderLens(frame, T, t);
  drawHud(frame, T);
}

function mapPointer(P, fr, A, probeSide) {
  const cands = [];
  // face (eyes): iris centres 468 (subject right) / 473 (subject left)
  if (fr.face && A.l_eye && A.r_eye) {
    const f = fr.face, eR = f[468] || f[33], eL = f[473] || f[263];
    const xs = [f[234].x, f[454].x], top = f[10].y, chin = f[152].y, eyeD = Math.hypot(eR.x - eL.x, eR.y - eL.y);
    if (P.x > Math.min(...xs) - eyeD * 0.3 && P.x < Math.max(...xs) + eyeD * 0.3 && P.y > top - eyeD * 1.4 && P.y < chin + eyeD * 0.2) {
      const m = similarity(eR, eL, to2D(A.r_eye), to2D(A.l_eye));
      if (m) cands.push({ m, d: 0, region: P.y < (eR.y + eL.y) / 2 - eyeD * 0.45 ? 'head' : 'face', z: A.r_eye.z });
    }
  }
  // hands (not the probe hand): wrist -> fingertip of the middle finger
  for (const h of fr.hands) {
    if (h.side === probeSide) continue;
    const k = h.side === 'L' ? 'l' : 'r', p = h.pts;
    if (!A[`${k}_wrist`] || !A[`${k}_fingertip`]) continue;
    const xs = p.map((q) => q.x), ys = p.map((q) => q.y);
    const pad = Math.hypot(p[5].x - p[17].x, p[5].y - p[17].y) * 0.3;
    if (P.x > Math.min(...xs) - pad && P.x < Math.max(...xs) + pad && P.y > Math.min(...ys) - pad && P.y < Math.max(...ys) + pad) {
      const m = similarity(p[0], p[12], to2D(A[`${k}_wrist`]), to2D(A[`${k}_fingertip`]));
      if (m) cands.push({ m, d: 0.01, region: 'hand', z: A[`${k}_wrist`].z });
    }
  }
  // limbs from pose
  if (fr.pose) {
    const s = fr.pose.pts, raw = fr.pose.raw;
    const ok = (i) => (raw[i].visibility ?? 1) > 0.5 && raw[i].y > -0.05 && raw[i].y < 1.05;
    const segs = [
      [11, 13, 'l_shoulder', 'l_elbow', 'upper_arm', 'shoulder', 'elbow', 'L'], [12, 14, 'r_shoulder', 'r_elbow', 'upper_arm', 'shoulder', 'elbow', 'R'],
      [13, 15, 'l_elbow', 'l_wrist', 'forearm', 'elbow', 'wrist', 'L'], [14, 16, 'r_elbow', 'r_wrist', 'forearm', 'elbow', 'wrist', 'R'],
      [23, 25, 'l_hip', 'l_knee', 'thigh', 'hip', 'knee', ''], [24, 26, 'r_hip', 'r_knee', 'thigh', 'hip', 'knee', ''],
      [25, 27, 'l_knee', 'l_ankle', 'lower_leg', 'knee', 'ankle', ''], [26, 28, 'r_knee', 'r_ankle', 'lower_leg', 'knee', 'ankle', ''],
      [29, 31, 'l_heel', 'l_toe', 'foot', 'ankle', 'foot', ''], [30, 32, 'r_heel', 'r_toe', 'foot', 'ankle', 'foot', ''],
    ];
    for (const [i, j, a, b, mid, st, en, side] of segs) {
      if (!ok(i) || !ok(j) || !A[a] || !A[b]) continue;
      if (probeSide && side === probeSide && mid === 'forearm') continue;
      const S0 = s[i], S1 = s[j], dx = S1.x - S0.x, dy = S1.y - S0.y, L2 = dx * dx + dy * dy; if (L2 < 25) continue;
      const tt = ((P.x - S0.x) * dx + (P.y - S0.y) * dy) / L2;
      if (tt < -0.1 || tt > 1.1) continue;
      const d = Math.abs((P.x - S0.x) * dy - (P.y - S0.y) * dx) / L2; // perpendicular distance / length
      if (d > 0.3) continue;
      const m = similarity(S0, S1, to2D(A[a]), to2D(A[b]));
      if (m) cands.push({ m, d: d + 0.02, region: tt < 0.12 ? st : tt > 0.88 ? en : mid, z: (A[a].z + A[b].z) / 2 });
    }
    // trunk: shoulders + mid-hip (affine)
    if (ok(11) && ok(12) && ok(23) && ok(24)) {
      const mh = V((s[23].x + s[24].x) / 2, (s[23].y + s[24].y) / 2);
      const amh = A.l_hip.clone().add(A.r_hip).multiplyScalar(0.5);
      const m = affine([s[11], s[12], mh], [to2D(A.l_shoulder), to2D(A.r_shoulder), to2D(amh)]);
      const minX = Math.min(s[11].x, s[12].x, s[23].x, s[24].x), maxX = Math.max(s[11].x, s[12].x, s[23].x, s[24].x);
      if (m && P.x > minX && P.x < maxX && P.y > Math.min(s[11].y, s[12].y) - 10 && P.y < Math.max(s[23].y, s[24].y) + 10) cands.push({ m, d: 0.2, region: null, z: amh.z });
    } else if (ok(11) && ok(12)) {
      // shoulders only (typical webcam framing): similarity on the shoulder line
      const m = similarity(s[11], s[12], to2D(A.l_shoulder), to2D(A.r_shoulder));
      const sw = Math.abs(s[11].x - s[12].x);
      if (m && P.x > Math.min(s[11].x, s[12].x) - sw * 0.1 && P.x < Math.max(s[11].x, s[12].x) + sw * 0.1 && P.y > Math.min(s[11].y, s[12].y) - sw * 0.35) cands.push({ m, d: 0.25, region: null, z: A.l_shoulder.z });
    }
  }
  if (!cands.length) return null;
  cands.sort((x, y) => x.d - y.d);
  const c = cands[0];
  const p2 = c.m.f(P);
  const pt = from2D(p2, c.z);
  const J = c.m.J;
  const scale = Math.sqrt(Math.abs(J[0] * J[3] - J[1] * J[2])); // atlas metres per canvas px
  const upA = from2D(V(-J[1], -J[3]), 0).sub(from2D(V(0, 0), 0)).normalize();  // screen "up" in atlas
  const rightA = from2D(V(J[0], J[2]), 0).sub(from2D(V(0, 0), 0)).normalize(); // screen "right" in atlas
  const region = c.region || regionOf3D(pt, atlas.anchors);
  return { pt, scale, upA, rightA, region };
}

function stageGeom(frame) {
  const st = $('.stage').getBoundingClientRect();
  const k = Math.min(st.width / frame.W, st.height / frame.H);
  return { k, ox: (st.width - frame.W * k) / 2, oy: (st.height - frame.H * k) / 2, st };
}
function cssToCanvas(e) {
  const v = $('#cam'); const W = v.videoWidth || 1280, H = v.videoHeight || 720;
  const st = $('.stage').getBoundingClientRect(); const k = Math.min(st.width / W, st.height / H);
  const ox = (st.width - W * k) / 2, oy = (st.height - H * k) / 2;
  return V((e.clientX - st.left - ox) / k, (e.clientY - st.top - oy) / k);
}

function placeLens(frame, P) {
  const g = stageGeom(frame);
  const R = scanner.big ? Math.min(g.st.height * 0.42, g.st.width * 0.3) : scanner.radius;
  scanner.R = R;
  const lens = $('#lens');
  lens.style.width = lens.style.height = `${2 * R}px`;
  lens.style.left = `${g.ox + P.x * g.k}px`; lens.style.top = `${g.oy + P.y * g.k}px`;
  const px = Math.round(2 * R * Math.min(2, devicePixelRatio));
  const hud = $('#lens-hud'); if (hud.width !== px) { hud.width = hud.height = px; }
  if ($('#lens-gl').width !== px) renderer.setSize(px, px, false); // pixel ratio is fixed at 1 in buildScene
  scanner.k = g.k;
}

function renderLens(frame, T, t) {
  const A = atlas.anchors.anterior;
  // half-size of the view in atlas metres: lens radius in canvas px x metres-per-px / zoom
  const half = (scanner.R / scanner.k) * T.scale / scanner.zoom;
  camera.left = -half; camera.right = half; camera.top = half; camera.bottom = -half;
  const zFront = (A > 0 ? atlas.box.max.z : atlas.box.min.z) + A * 0.4;
  camera.position.set(T.pt.x, T.pt.y, zFront);
  camera.up.copy(T.upA);
  camera.lookAt(T.pt.x, T.pt.y, T.pt.z);
  camera.near = 0.01; camera.far = 3; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  // flip the lens image if the camera's right does not match screen right
  const camRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  $('#lens-gl').style.transform = camRight.dot(T.rightA) < 0 ? 'scaleX(-1)' : 'none';
  // depth: find the body surface under the crosshair, then cut depthCm behind it
  clipPlane.constant = 99;
  const surf = hitAt(0, 0, false);
  const zs = surf ? surf.point.z : T.pt.z;
  clipPlane.constant = A * zs - scanner.depthCm / 100;
  scanner.surfaceZ = zs;
  renderer.render(scene, camera);
  if (t - scanner.lastPick > 0.2) { scanner.lastPick = t; pick(); }
}

function visibleMeshes() { const out = []; groups.forEach((g) => { if (g.visible) out.push(...g.children); }); return out; }
function hitAt(nx, ny, respectClip = true) {
  ray.setFromCamera(new THREE.Vector2(nx, ny), camera);
  const A = atlas.anchors.anterior;
  const hits = ray.intersectObjects(visibleMeshes(), false);
  return hits.find((h) => !respectClip || A * h.point.z <= clipPlane.constant + 1e-4) || null;
}

function pick() {
  const c = hitAt(0, 0);
  scanner.under = c ? c.object.userData.part : null;
  const names = new Map();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, r = i % 2 ? 0.35 : 0.7;
    const h = hitAt(Math.cos(a) * r, Math.sin(a) * r); if (h) names.set(h.object.userData.part.name, h.object.userData.part);
  }
  if (scanner.under) names.delete(scanner.under.name);
  scanner.inView = [...names.values()].slice(0, 10);
  updatePanel();
}

function updatePanel() {
  const T = scanner.target, u = scanner.under;
  const L = u ? atlas.index.layers.find((x) => x.key === u.layer) : null;
  $('#scan-info').innerHTML = T ? `
    <dl class="kv">
      <dt>Region</dt><dd>${REGION_LABEL[T.region] || T.region}</dd>
      <dt>Depth cut</dt><dd>${scanner.depthCm.toFixed(1)} cm below the surface · zoom ${scanner.zoom.toFixed(1)}×</dd>
      <dt>Crosshair</dt><dd>${u ? `<b>${esc(u.name)}</b> <span class="sw" style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${L.color}"></span> <small>${esc(L.label)}</small>` : '<span class="muted">nothing in the selected categories</span>'}</dd>
      ${u ? `<dt>MeSH</dt><dd>${meshLinkHtml(u)}</dd>` : ''}
      ${u?.mesh?.scope_note ? `<dt></dt><dd class="fine" style="margin:0">${esc(u.mesh.scope_note)}</dd>` : ''}
    </dl>
    ${scanner.inView.length ? `<p class="fine">Also in the lens: ${scanner.inView.map((p) => esc(p.name)).join(' · ')}</p>` : ''}` : '<p class="muted">Point at a tracked part of the body (face, hands, arms, trunk or legs).</p>';
  if (T) renderConditions($('#scan-conditions'), conds, T.region, u ? u.layer : null, scanner.condState);
}

function drawHud(frame, T) {
  const c = $('#lens-hud'); const ctx = c.getContext('2d'); const W = c.width, H = c.height, r = W / 2;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.strokeStyle = scanner.locked ? 'rgba(255,200,90,0.95)' : 'rgba(120,220,255,0.9)'; ctx.lineWidth = Math.max(2, W / 120);
  ctx.beginPath(); ctx.arc(r, r, r - ctx.lineWidth, 0, Math.PI * 2); ctx.stroke();
  // crosshair and depth ticks
  ctx.lineWidth = 1.5; ctx.beginPath();
  ctx.moveTo(r - r * 0.12, r); ctx.lineTo(r - r * 0.03, r); ctx.moveTo(r + r * 0.03, r); ctx.lineTo(r + r * 0.12, r);
  ctx.moveTo(r, r - r * 0.12); ctx.lineTo(r, r - r * 0.03); ctx.moveTo(r, r + r * 0.03); ctx.lineTo(r, r + r * 0.12); ctx.stroke();
  for (let i = 0; i < 60; i++) { const a = (i / 60) * Math.PI * 2; const l = i % 5 ? 0.03 : 0.06; ctx.beginPath(); ctx.moveTo(r + Math.cos(a) * r * (0.97 - l), r + Math.sin(a) * r * (0.97 - l)); ctx.lineTo(r + Math.cos(a) * r * 0.95, r + Math.sin(a) * r * 0.95); ctx.stroke(); }
  const fs = Math.max(11, W / 22); ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#e6f6ff';
  ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 6;
  if (T) {
    ctx.fillText(`${REGION_LABEL[T.region] || ''} · ${scanner.zoom.toFixed(1)}× · −${scanner.depthCm.toFixed(1)} cm`, r, r * 0.2);
    if (scanner.under) { ctx.font = `600 ${fs * 1.05}px Inter, system-ui, sans-serif`; ctx.fillText(scanner.under.name, r, r * 1.82); }
  } else ctx.fillText('No tracked body part here', r, r);
  ctx.restore();
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
