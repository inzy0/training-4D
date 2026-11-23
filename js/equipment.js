// Equipment in Motion Lab 4D: training equipment modelled in 3D, moving with the twin through time, with the
// external load each item puts on the body fed into inverse dynamics (js/biomech.js, opts.loads).
//
// Catalogue: /rt/exercises/equipment.json (tools/exercise_equipment_build.py). Rulebook items (IWF TCRR 2024,
// IPF Technical Rulebook 2026) use the quoted dimensions; items with no governing standard have illustrative
// geometry and the load you set. Loads are computed from mechanics, not measured:
//   gravity  F = m·(g − a)            elastic  F = k·(L − L0) toward the anchor     cable  F = stack·g / ratio toward the pulley
//   landmine F = g·(m_bar·L/2 + m_pl·L_pl) / L_hand (vertical)                      sled   F = μ·(m_sled + m_pl)·g, horizontal
// Physics runs on the tracked / commanded landmarks (metres); the 3D equipment is drawn on the posed twin.

import * as THREE from 'three';
import { labState, labExtras, setLoadProvider, onLabFrame } from './motion_lab.js';

const G = 9.81;
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const placed = (m, p) => { m.position.copy(p); return m; };
const mid = (a, b) => a.clone().add(b).multiplyScalar(0.5);
const COLORS = { red: 0xd62828, blue: 0x1d4ed8, yellow: 0xf2c200, green: 0x2e9e4f, white: 0xf1f1f1, black: 0x1b1b1b, silver: 0xb8bec6, none: 0x9aa4ad };
const ANCHORS = { // relative to the mid-feet ground point: [anterior m, up m, lateral m]
  low_front: { label: 'Low, in front (1 m)', v: [1.0, 0.10, 0] }, mid_front: { label: 'Chest height, in front (1 m)', v: [1.0, 1.10, 0] },
  high_front: { label: 'High, in front (0.6 m)', v: [0.6, 2.10, 0] }, low_behind: { label: 'Low, behind (1 m)', v: [-1.0, 0.10, 0] },
  mid_behind: { label: 'Chest height, behind (1 m)', v: [-1.0, 1.10, 0] }, side_r: { label: 'Chest height, right side (1 m)', v: [0, 1.10, -1.0] },
  floor_under: { label: 'Floor, under the feet', v: [0, 0.0, 0] },
};
const POSITIONS = { hands: 'In the hands', back: 'Back rack (on the shoulders)', front: 'Front rack (on the front of the shoulders)' };

const EQ = { cat: null, item: null, p: {}, group: null, loads: [], info: null, hist: [], prev: null, on: false };

export async function initEquipment() {
  const host = $('#eq-card'); if (!host) return;
  try { EQ.cat = await (await fetch('/training-4D/rt/exercises/equipment.json')).json(); } catch (e) { host.querySelector('#eq-body').textContent = `Equipment catalogue not available: ${e.message}`; return; }
  const fams = [...new Set(EQ.cat.items.map((i) => i.family))];
  $('#eq-pick').innerHTML = '<option value="">— none —</option>' + fams.map((f) => `<optgroup label="${esc(f)}">${EQ.cat.items.filter((i) => i.family === f).map((i) => `<option value="${i.id}">${esc(i.name)}</option>`).join('')}</optgroup>`).join('');
  $('#eq-pick').onchange = () => choose($('#eq-pick').value);
  $('#eq-test').onclick = selfTest;
  setLoadProvider(provideLoads);
  onLabFrame(frame);
  $('#eq-body').innerHTML = `<p class="fine muted">${EQ.cat.items.length} items in ${fams.length} families. Pick one: it appears on the twin and moves with it (camera, demo, exercise player or movement studio); its load is added to the biomechanics.</p>`;
}

// ------------------------------------------------------------------ choosing and parameters
function choose(id) {
  EQ.item = EQ.cat.items.find((i) => i.id === id) || null; EQ.hist = []; EQ.prev = null;
  const pick = $('#eq-pick'); if (pick && pick.value !== (id || '')) pick.value = id || '';
  const it = EQ.item; EQ.p = {};
  if (it) {
    const l = it.load || {};
    Object.assign(EQ.p, { total: l.bar != null ? l.bar + 2 * (l.collars || 0) + (l.plates ? 40 : 20) : l.total, each: l.each, bar: l.bar, collars: (l.collars || 0) > 0, plates_kg: l.plates_kg,
      rest_len: l.rest_len, force_at: l.force_at, len_at: l.len_at, anchor: l.anchor || 'low_front', stack: l.stack, ratio: l.ratio || 1, sled: l.sled, mu: l.mu, pos: it.attach === 'back' ? 'back' : 'hands' });
    if (it.model !== 'none') { const b = $('#bio-on'); if (b && !b.checked) { b.checked = true; b.dispatchEvent(new Event('change')); } }
  }
  rebuild(); renderPanel();
}

function paramInputs(it) {
  const p = EQ.p, num = (k, label, step = 0.5, min = 0, unit = '') => `<label>${label} <input data-k="${k}" type="number" step="${step}" min="${min}" value="${p[k] ?? ''}" style="width:72px"> ${unit}</label>`;
  const anchorSel = `<label>Anchor <select data-k="anchor">${Object.entries(ANCHORS).map(([k, a]) => `<option value="${k}" ${p.anchor === k ? 'selected' : ''}>${a.label}</option>`).join('')}</select></label>`;
  const m = it.model, out = [];
  if (it.kind === 'barbell' || it.id === 'ssb' || it.id === 'trap_bar' || it.id === 'ez_bar') {
    out.push(num('total', 'Total load', 0.5, p.bar || 0, 'kg'));
    if (it.load?.plates) out.push(`<label><input data-k="collars" type="checkbox" ${p.collars ? 'checked' : ''}> Competition collars (2 × 2.5 kg)</label>`);
    if (it.load?.editable && it.id !== 'band_bar') out.push(num('bar', 'Bar mass', 0.5, 0, 'kg'));
    if (it.kind === 'barbell') out.push(`<label>Position <select data-k="pos">${Object.entries(POSITIONS).map(([k, v]) => `<option value="${k}" ${p.pos === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`);
  }
  if (p.each != null) out.push(num('each', it.attach === 'hands' || it.attach === 'ankles' ? 'Mass each' : 'Mass', 0.5, 0, 'kg'));
  if (p.total != null && !(it.kind === 'barbell' || ['ssb', 'trap_bar', 'ez_bar'].includes(it.id))) out.push(num('total', 'Mass', 0.5, 0, 'kg'));
  if (m === 'elastic' || m === 'elastic_knees' || m === 'bar_bands') out.push(num('rest_len', 'Band rest length L₀', 0.05, 0.05, 'm'), num('force_at', 'Rated tension', 5, 0, 'N'), num('len_at', 'at length', 0.05, 0.1, 'm'));
  if (m === 'elastic' || m === 'cable') out.push(anchorSel);
  if (m === 'cable') out.push(num('stack', 'Stack', 2.5, 0, 'kg'), `<label>Pulley ratio <select data-k="ratio"><option value="1" ${p.ratio == 1 ? 'selected' : ''}>1:1</option><option value="2" ${p.ratio == 2 ? 'selected' : ''}>2:1</option></select></label>`);
  if (m === 'landmine') out.push(num('bar', 'Bar mass', 0.5, 0, 'kg'), num('plates_kg', 'Plates on the sleeve', 2.5, 0, 'kg'));
  if (m === 'sled') out.push(num('sled', 'Sled', 2.5, 0, 'kg'), num('plates_kg', 'Plates', 5, 0, 'kg'), num('mu', 'Friction μ', 0.05, 0, ''));
  return out.join(' ');
}

// ------------------------------------------------------------------ geometry helpers
function twinW() { // twin-posed copies of the pose landmarks (same indices as L.W)
  const L = labState(), { restLandmarks, LANDMARK_SEG } = labExtras();
  if (!L.rig || !L.M) return null;
  const rest = (L.__eqRest ||= restLandmarks(L.rig)), W = {};
  for (const k of Object.keys(rest)) W[k] = rest[k].clone().applyMatrix4(L.M.get(LANDMARK_SEG[k]) || new THREE.Matrix4());
  return W;
}
function frameOf(W) {
  const A = labState().atlas.anchors;
  const ground = Math.min(W[29].y, W[30].y, W[31].y, W[32].y);
  const feet = mid(mid(W[29], W[31]), mid(W[30], W[32])); feet.y = ground;
  return { ground, feet, ant: V(0, 0, A.anterior), left: V(A.leftX, 0, 0), up: V(0, 1, 0), shW: W[11].distanceTo(W[12]) };
}
const hand = (W, k) => mid(W[k === 'l' ? 15 : 16], W[k === 'l' ? 19 : 20]); // grip centre: wrist to 2nd knuckle
function anchorAt(Fr, name, scale = 1) { const a = ANCHORS[name] || ANCHORS.low_front; return Fr.feet.clone().addScaledVector(Fr.ant, a.v[0] * scale).addScaledVector(Fr.up, a.v[1] * scale).addScaledVector(Fr.left, a.v[2] * scale); }
function trunkPoint(W, Fr, where) {
  const S = mid(W[11], W[12]), H = mid(W[23], W[24]);
  if (where === 'back') return S.clone().addScaledVector(Fr.ant, -0.06);
  if (where === 'front') return S.clone().addScaledVector(Fr.ant, 0.08);
  if (where === 'chest') return S.clone().lerp(H, 0.35).addScaledVector(Fr.ant, 0.16);
  if (where === 'waist') return H.clone();
  return S.clone().lerp(H, 0.431); // trunk centre of mass (de Leva)
}
function platesFor(it, total) { // per-side disc stack from the rulebook disc set, heaviest first (IPF/IWF loading order)
  const set = EQ.cat.items.find((i) => i.id === (it.load?.plates === 'ipf' ? 'ipf_discs' : 'iwf_discs'))?.discs || [];
  let side = (total - (EQ.p.bar ?? it.load?.bar ?? 0) - (EQ.p.collars ? 5 : 0)) / 2; const out = [];
  for (const d of set) while (side >= d[0] - 1e-9 && out.length < 12) { out.push(d); side -= d[0]; }
  return { discs: out, rest: side };
}
function massOf(it) {
  const p = EQ.p;
  if (it.kind === 'barbell' || ['ssb', 'trap_bar', 'ez_bar'].includes(it.id)) {
    if (it.load?.plates) { const { discs } = platesFor(it, p.total); return (p.bar ?? it.load.bar) + (p.collars ? 5 : 0) + 2 * discs.reduce((s, d) => s + d[0], 0); }
    return Math.max(p.total ?? 0, p.bar ?? 0);
  }
  if (p.each != null) return p.each; return p.total ?? 0;
}

// ------------------------------------------------------------------ loads (W space, N, acting on the body)
function computeLoads(W, t, dyn) {
  const it = EQ.item; if (!it || it.model === 'none' || !W || !W[15]) return { loads: [], info: null };
  const Fr = frameOf(W), p = EQ.p, loads = [], info = { parts: [] };
  const accOf = (pt) => { // second difference of the load point (only with "Include acceleration")
    const h = EQ.prevPts ||= []; h.push({ t, pt: pt.clone() }); while (h.length > 9) h.shift();
    if (!dyn || h.length < 9) return V();
    const a = h[8], b = h[4], c = h[0], d1 = a.t - b.t, d2 = b.t - c.t; if (d1 < 0.02 || d2 < 0.02) return V();
    return a.pt.clone().sub(b.pt).multiplyScalar(1 / d1).sub(b.pt.clone().sub(c.pt).multiplyScalar(1 / d2)).multiplyScalar(2 / (d1 + d2));
  };
  const weight = (m, pt) => { const a = accOf(pt); return V(-m * a.x, -m * (G + a.y), -m * a.z); }; // F = m(g_vec − a)
  const add = (at, side, pt, F, label) => { loads.push({ at, side, p: pt, F }); info.parts.push({ label, F: F.length(), dir: F.clone().normalize(), pt }); };
  const hl = hand(W, 'l'), hr = hand(W, 'r');
  if (it.model === 'gravity' || it.model === 'bar_bands') {
    const m = massOf(it); info.mass = m;
    if (it.attach === 'hands' || it.attach === 'ankles') {
      const pl = it.attach === 'ankles' ? W[27] : hl, pr = it.attach === 'ankles' ? W[28] : hr, at = it.attach === 'ankles' ? 'ankle' : 'hand';
      add(at, 'l', pl, weight(m, pl), `Left ${at}`); add(at, 'r', pr, weight(m, pr), `Right ${at}`); info.mass = 2 * m;
    } else if (it.attach === 'hand_r') add('hand', 'r', hr, weight(m, hr), 'Right hand');
    else if (['chest', 'trunk', 'waist'].includes(it.attach) || (it.kind === 'barbell' && p.pos !== 'hands') || it.attach === 'back') {
      const pt = trunkPoint(W, Fr, it.attach === 'back' ? 'back' : it.kind === 'barbell' ? p.pos : it.attach); add('trunk', null, pt, weight(m, pt), it.attach === 'back' || p.pos === 'back' ? 'Upper back' : p.pos === 'front' ? 'Front of shoulders' : 'Trunk');
    } else { const c = mid(hl, hr), F = weight(m, c).multiplyScalar(0.5); add('hand', 'l', hl, F.clone(), 'Left hand'); add('hand', 'r', hr, F, 'Right hand'); }
    if (it.model === 'bar_bands') { // one band per side from the floor under each sleeve end
      const k = (p.force_at || 0) / Math.max(0.01, (p.len_at || 1) - (p.rest_len || 0)); info.k = k;
      const axis = hl.clone().sub(hr).normalize(), half = (it.geom?.length || 2.2) / 2 - 0.2;
      for (const [s, h] of [['l', hl], ['r', hr]]) {
        const sleeve = mid(hl, hr).addScaledVector(axis, s === 'l' ? half : -half), floorPt = sleeve.clone(); floorPt.y = Fr.ground;
        const L0 = sleeve.distanceTo(floorPt), T = k * Math.max(0, L0 - p.rest_len);
        const F = floorPt.clone().sub(sleeve).normalize().multiplyScalar(T); add('hand', s, h, F, `Band ${s === 'l' ? 'left' : 'right'} (${L0.toFixed(2)} m)`);
      }
    }
  } else if (it.model === 'elastic') {
    const k = (p.force_at || 0) / Math.max(0.01, (p.len_at || 1) - (p.rest_len || 0)), A = anchorAt(Fr, p.anchor); info.k = k; info.anchor = A;
    for (const [s, h] of [['l', hl], ['r', hr]]) { const Lb = A.distanceTo(h), T = k * Math.max(0, Lb - p.rest_len); add('hand', s, h, A.clone().sub(h).normalize().multiplyScalar(T), `Band to ${s === 'l' ? 'left' : 'right'} hand (${Lb.toFixed(2)} m)`); }
  } else if (it.model === 'elastic_knees') {
    const k = (p.force_at || 0) / Math.max(0.01, (p.len_at || 1) - (p.rest_len || 0)), d = W[25].distanceTo(W[26]), T = k * Math.max(0, d - p.rest_len); info.k = k;
    add('knee', 'l', W[25].clone(), W[26].clone().sub(W[25]).normalize().multiplyScalar(T), `Left knee (width ${d.toFixed(2)} m)`);
    add('knee', 'r', W[26].clone(), W[25].clone().sub(W[26]).normalize().multiplyScalar(T), 'Right knee');
  } else if (it.model === 'cable') {
    const A = anchorAt(Fr, p.anchor), T = (p.stack || 0) * G / (p.ratio || 1); info.anchor = A;
    if (it.attach === 'hand_r') add('hand', 'r', hr, A.clone().sub(hr).normalize().multiplyScalar(T), 'Right hand');
    else { const c = mid(hl, hr), F = A.clone().sub(c).normalize().multiplyScalar(T / 2); add('hand', 'l', hl, F.clone(), 'Left hand'); add('hand', 'r', hr, F, 'Right hand'); }
  } else if (it.model === 'landmine') {
    const Lb = it.geom?.length || 2.2, Lh = Lb - 0.05, Lp = Lb - 0.33; // hands at the sleeve end, plates centred on the inner sleeve (geometry assumption, shown in the panel)
    const Fh = G * ((p.bar || 0) * Lb / 2 + (p.plates_kg || 0) * Lp) / Lh; info.landmine = { Lb, Lh, Lp, Fh };
    const c = mid(hl, hr); add('hand', 'l', hl, V(0, -Fh / 2, 0), 'Left hand'); add('hand', 'r', hr, V(0, -Fh / 2, 0), 'Right hand'); info.pivotFrom = c;
  } else if (it.model === 'sled') {
    const N = ((p.sled || 0) + (p.plates_kg || 0)) * G, T = (p.mu || 0) * N, pt = trunkPoint(W, Fr, 'waist');
    add('trunk', null, pt, Fr.ant.clone().negate().multiplyScalar(T), 'Harness at the waist'); info.sled = { N, T };
  }
  return { loads, info };
}
function provideLoads(W, t) { const r = computeLoads(W, t, labExtras().BIO.dyn); EQ.loads = r.loads; EQ.info = r.info; return r.loads; }

// ------------------------------------------------------------------ 3D models
const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, metalness: o.metal ?? 0.6, roughness: o.rough ?? 0.35, ...o.extra });
const STEEL = () => mat(0xc9ced6, { metal: 0.9, rough: 0.25 }), BLACK = () => mat(0x23272e, { metal: 0.2, rough: 0.7 });
function cyl(r, len, m, seg = 28) { const g = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), m); g.rotation.z = Math.PI / 2; const o = new THREE.Group(); o.add(g); return o; } // along +x
function buildBarbell(it, length) {
  const g = new THREE.Group(), gm = it.geom || {}, sl = gm.sleeve_len || 0.415, shaft = length - 2 * sl;
  g.add(cyl((gm.grip_d || 0.028) / 2, shaft, STEEL()));
  for (const s of [-1, 1]) {
    const sleeve = cyl((gm.sleeve_d || 0.05) / 2, sl, STEEL()); sleeve.position.x = s * (shaft / 2 + sl / 2); g.add(sleeve);
    const rim = cyl(0.039, 0.03, STEEL()); rim.position.x = s * (shaft / 2 + 0.015); g.add(rim);
    if (gm.mark && gm.mark !== 'none') { const mk = cyl((gm.grip_d || 0.028) / 2 + 0.0008, 0.012, mat(COLORS[gm.mark], { metal: 0.1 })); mk.position.x = s * (shaft / 2 - 0.02); g.add(mk); }
    let x = shaft / 2 + 0.03;
    if (it.load?.plates) {
      for (const d of platesFor(it, EQ.p.total).discs) { const w = d[3], disc = cyl(d[2] / 2, w, mat(COLORS[d[1]] ?? 0x555555, { metal: 0.05, rough: 0.6 }), 48); disc.position.x = s * (x + w / 2); g.add(disc); x += w; }
      if (EQ.p.collars) { const c = cyl(0.045, 0.07, STEEL()); c.position.x = s * (x + 0.035); g.add(c); }
    }
  }
  return g;
}
function buildTrapBar() {
  const g = new THREE.Group(), s = STEEL(), hex = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.014, 10, 6), s); hex.rotation.x = Math.PI / 2; g.add(hex);
  for (const k of [-1, 1]) { const sl = cyl(0.025, 0.42, s); sl.position.x = k * 0.54; g.add(sl); const pl = cyl(0.225, 0.054, mat(0x1b1b1b, { metal: 0.05 }), 40); pl.position.x = k * 0.45; g.add(pl); }
  return g;
}
function buildDumbbell(m) { // illustrative: heads sized from mass (cast iron, two hexagonal heads)
  const g = new THREE.Group(), v = m / 7200 / 2, r = Math.cbrt(v / (Math.PI * 1.3)), h = 1.3 * r;
  g.add(cyl(0.016, 0.13, STEEL()));
  for (const s of [-1, 1]) { const hd = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 6), BLACK()); hd.rotation.z = Math.PI / 2; hd.position.x = s * (0.065 + h / 2); g.add(hd); }
  return g;
}
function buildKettlebell(m) { // illustrative: ball radius from mass (cast iron), handle above
  const g = new THREE.Group(), r = Math.max(0.07, Math.cbrt((3 * m / 7200) / (4 * Math.PI)) * 1.25);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), BLACK()); ball.position.y = -0.06 - r; g.add(ball);
  const h = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.016, 12, 32, Math.PI), BLACK()); h.position.y = -0.06; g.add(h);
  return g;
}
function line(a, b, color, width = 0.008) {
  const d = b.clone().sub(a), len = d.length(), m = new THREE.Mesh(new THREE.CylinderGeometry(width, width, Math.max(1e-4, len), 10), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
  m.position.copy(mid(a, b)); m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); return m;
}
function floorProps(it, Fr, s) {
  const g = new THREE.Group(), f = Fr.feet.clone(), at = (a, u, l = 0) => f.clone().addScaledVector(Fr.ant, a * s).addScaledVector(Fr.up, u * s).addScaledVector(Fr.left, l * s);
  const put = (mesh, p) => { mesh.position.copy(p); g.add(mesh); return mesh; };
  const yaw = Math.atan2(Fr.ant.x, Fr.ant.z);
  if (it.kind === 'cones') for (const [a, l] of [[2, 0], [2, 4.57], [2, -4.57], [6.57, 0]]) put(new THREE.Mesh(new THREE.ConeGeometry(0.1 * s, 0.23 * s, 24), mat(0xff7a00, { metal: 0 })), at(a, 0.115, l * 0.5));
  if (it.kind === 'hurdles') for (let i = 0; i < 5; i++) { const h = (it.geom?.h || 0.15); for (const l of [-0.3, 0.3]) g.add(line(at(1 + i * 0.6, 0, l), at(1 + i * 0.6, h, l), 0xffd400, 0.01 * s)); g.add(line(at(1 + i * 0.6, h, -0.3), at(1 + i * 0.6, h, 0.3), 0xffd400, 0.01 * s)); }
  if (it.kind === 'ladder') { for (const l of [-0.25, 0.25]) g.add(line(at(0.6, 0.005, l), at(0.6 + 4.5, 0.005, l), 0xffe14d, 0.008 * s)); for (let i = 0; i <= 10; i++) g.add(line(at(0.6 + i * 0.45, 0.005, -0.25), at(0.6 + i * 0.45, 0.005, 0.25), 0xffe14d, 0.008 * s)); }
  if (it.kind === 'box') { const h = it.geom?.h || 0.5, b = put(new THREE.Mesh(new THREE.BoxGeometry(0.6 * s, h * s, 0.5 * s), mat(0x8b5a2b, { metal: 0, rough: 0.8 })), at(0.7, h / 2)); b.rotation.y = yaw; }
  if (it.kind === 'swissball') put(new THREE.Mesh(new THREE.SphereGeometry((it.geom?.d || 0.65) / 2 * s, 40, 24), mat(0x3a7bd5, { metal: 0, rough: 0.5 })), at(0.8, (it.geom?.d || 0.65) / 2));
  if (it.kind === 'roller') { const r = put(new THREE.Mesh(new THREE.CylinderGeometry(0.075 * s, 0.075 * s, 0.9 * s, 32), mat(0x2bb3a3, { metal: 0, rough: 0.8 })), at(0.7, 0.075)); r.rotation.z = Math.PI / 2; r.rotation.y = yaw; }
  if (it.kind === 'platform') { const p = put(new THREE.Mesh(new THREE.BoxGeometry(4 * s, 0.1 * s, 4 * s), mat(0x6b4f33, { metal: 0, rough: 0.9 })), at(0, -0.05)); p.rotation.y = yaw; }
  if (it.kind === 'rack') { for (const l of [-0.6, 0.6]) for (const a of [-0.35, 0.35]) g.add(line(at(a, 0, l), at(a, 2.0, l), 0x30343b, 0.025 * s)); for (const l of [-0.6, 0.6]) g.add(line(at(0.1, 1.30, l), at(-0.15, 1.30, l), 0xc9ced6, 0.02 * s)); }
  if (it.kind === 'bench') { const b = put(new THREE.Mesh(new THREE.BoxGeometry(0.30 * s, 0.06 * s, 1.22 * s), mat(0x1b1b1b, { metal: 0, rough: 0.8 })), at(-0.9, 0.42)); b.rotation.y = yaw; for (const l of [-0.55, 0.55]) g.add(line(at(-1.4, 0, l), at(-1.4, 1.0, l), 0x30343b, 0.02 * s)); }
  return g;
}

function rebuild() {
  const L = labState(); if (!L.scene) return;
  if (EQ.group) { L.scene.remove(EQ.group); EQ.group.traverse((o) => { o.geometry?.dispose?.(); }); }
  EQ.group = new THREE.Group(); EQ.group.name = 'equipment'; L.scene.add(EQ.group); EQ.parts = {};
  const it = EQ.item; if (!it) return;
  const k = it.kind;
  if (k === 'barbell' || k === 'ssb' || k === 'ezbar' || k === 'landmine') EQ.parts.bar = buildBarbell(k === 'barbell' || k === 'landmine' ? it : { ...it, geom: { length: it.geom?.length || 1.2, sleeve_len: k === 'ezbar' ? 0.2 : 0.42, grip_d: 0.028, sleeve_d: 0.05 } }, it.geom?.length || 2.2);
  if (k === 'trapbar') EQ.parts.bar = buildTrapBar();
  if (k === 'dumbbell') { EQ.parts.dl = it.attach === 'hands' ? buildDumbbell(EQ.p.each) : null; EQ.parts.dr = buildDumbbell(EQ.p.each); }
  if (k === 'kettlebell') { EQ.parts.dl = it.attach === 'hands' ? buildKettlebell(EQ.p.each) : null; EQ.parts.dr = buildKettlebell(EQ.p.each); }
  if (k === 'ball') EQ.parts.ball = new THREE.Mesh(new THREE.SphereGeometry((it.geom?.d || 0.35) / 2, 32, 20), mat(0x7a2e2e, { metal: 0, rough: 0.7 }));
  if (k === 'sandbag') EQ.parts.ball = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.45, 8, 16), mat(0x4b5d3a, { metal: 0, rough: 0.9 }));
  if (k === 'vest') EQ.parts.vest = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.26), mat(0x222831, { metal: 0, rough: 0.9, extra: { transparent: true, opacity: 0.85 } }));
  if (k === 'cuff') { EQ.parts.cl = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.025, 10, 24), BLACK()); EQ.parts.cr = EQ.parts.cl.clone(); }
  if (k === 'sled') { EQ.parts.sled = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.9), BLACK()); b.position.y = 0.06; EQ.parts.sled.add(b); const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 12), STEEL()); post.position.y = 0.3; EQ.parts.sled.add(post); }
  if (k === 'cable') { EQ.parts.col = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.2, 0.35), mat(0x30343b, { metal: 0.3 })); EQ.parts.pulley = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 10, 24), STEEL()); }
  for (const v of Object.values(EQ.parts)) if (v) EQ.group.add(v);
  EQ.dyn = new THREE.Group(); EQ.group.add(EQ.dyn);
  EQ.static = null;
}

function frame(t) {
  const it = EQ.item; if (!it || !EQ.group) return;
  const TW = twinW(); if (!TW) return;
  const L = labState(), Fr = frameOf(TW), Wm = L.W && L.W[15] ? L.W : null;
  const s = Wm ? Fr.shW / Math.max(1e-3, Wm[11].distanceTo(Wm[12])) : 1; // physics space (m) -> twin space
  // without biomechanics running, still compute loads for the panel (no dynamics)
  if (!labExtras().BIO.on && Wm) provideLoads(Wm, t);
  const hl = hand(TW, 'l'), hr = hand(TW, 'r'), P = EQ.parts;
  while (EQ.dyn.children.length) { const c = EQ.dyn.children.pop(); c.geometry?.dispose?.(); }
  const orientX = (o, a, b) => { o.position.copy(mid(a, b)); o.quaternion.setFromUnitVectors(V(1, 0, 0), b.clone().sub(a).normalize()); };
  if (P.bar) {
    if (it.kind === 'barbell' && EQ.p.pos !== 'hands') { const c = trunkPoint(TW, Fr, EQ.p.pos); P.bar.position.copy(c); P.bar.quaternion.setFromUnitVectors(V(1, 0, 0), TW[11].clone().sub(TW[12]).setY(0).normalize()); }
    else if (it.kind === 'ssb') { P.bar.position.copy(trunkPoint(TW, Fr, 'back')); P.bar.quaternion.setFromUnitVectors(V(1, 0, 0), TW[11].clone().sub(TW[12]).setY(0).normalize()); }
    else if (it.kind === 'landmine') { const c = mid(hl, hr), Lb = (it.geom?.length || 2.2) * s, h = c.y - Fr.ground, horiz = Math.sqrt(Math.max(0, (Lb - 0.05 * s) ** 2 - h * h)), piv = c.clone().addScaledVector(Fr.ant, horiz); piv.y = Fr.ground;
      P.bar.position.copy(mid(piv, piv.clone().add(c.clone().sub(piv).normalize().multiplyScalar(Lb)))); P.bar.quaternion.setFromUnitVectors(V(1, 0, 0), c.clone().sub(piv).normalize());
      EQ.dyn.add(placed(new THREE.Mesh(new THREE.CylinderGeometry(0.06 * s, 0.08 * s, 0.1 * s, 16), STEEL()), piv.clone().setY(Fr.ground + 0.05 * s))); }
    else if (it.kind === 'trapbar') { P.bar.position.copy(mid(hl, hr)); P.bar.quaternion.setFromUnitVectors(V(1, 0, 0), hl.clone().sub(hr).normalize()); }
    else orientX(P.bar, hr, hl);
  }
  const hang = (o, h, a, b) => { if (!o) return; o.position.copy(h); o.quaternion.setFromUnitVectors(V(1, 0, 0), b.clone().sub(a).normalize()); };
  if (it.kind === 'dumbbell') { hang(P.dr, hr, TW[18], TW[22]); hang(P.dl, hl, TW[17], TW[21]); }
  if (it.kind === 'kettlebell') { for (const [o, h] of [[P.dr, hr], [P.dl, hl]]) if (o) { o.position.copy(h); o.quaternion.identity(); } }
  if (P.ball) P.ball.position.copy(it.kind === 'sandbag' ? trunkPoint(TW, Fr, 'chest') : mid(hl, hr).addScaledVector(Fr.ant, 0.12 * s));
  if (it.kind === 'sandbag') P.ball.quaternion.setFromUnitVectors(V(0, 1, 0), TW[11].clone().sub(TW[12]).normalize());
  if (P.vest) { P.vest.position.copy(trunkPoint(TW, Fr, 'trunk')); P.vest.scale.setScalar(s); P.vest.quaternion.setFromUnitVectors(V(1, 0, 0), TW[11].clone().sub(TW[12]).setY(0).normalize()); }
  if (P.cl) { P.cl.position.copy(TW[27]); P.cr.position.copy(TW[28]); P.cl.rotation.x = P.cr.rotation.x = Math.PI / 2; }
  // elastic / cable lines, anchors, sled and floor layouts
  const loadsTw = (EQ.info?.parts || []);
  if (it.model === 'elastic' || it.model === 'cable') {
    const A = anchorAt(Fr, EQ.p.anchor, s), col = it.model === 'cable' ? 0xd0d4da : 0x2fbf71;
    const ends = it.attach === 'hand_r' ? [hr] : it.model === 'cable' && it.attach === 'hands2close' ? [mid(hl, hr)] : [hl, hr];
    for (const h of ends) EQ.dyn.add(line(A, h, col, it.model === 'cable' ? 0.004 : 0.009 * (1 + Math.min(2, (EQ.info?.parts?.[0]?.F || 0) / 300))));
    EQ.dyn.add(placed(new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 10), STEEL()), A));
    if (P.col) { P.col.position.copy(A.clone().addScaledVector(Fr.ant, 0.25 * s)); P.col.position.y = Fr.ground + 1.1 * s; P.col.scale.setScalar(s); P.pulley.position.copy(A); }
  }
  if (it.model === 'elastic_knees') EQ.dyn.add(line(TW[25], TW[26], 0x2fbf71, 0.012));
  if (it.model === 'bar_bands' && P.bar) { const ax = hl.clone().sub(hr).normalize(), half = ((it.geom?.length || 2.2) / 2 - 0.2) * s; for (const k of [1, -1]) { const sl = mid(hl, hr).addScaledVector(ax, k * half), fl = sl.clone(); fl.y = Fr.ground; EQ.dyn.add(line(sl, fl, 0x2fbf71, 0.01)); } }
  if (P.sled) { const w = trunkPoint(TW, Fr, 'waist'), sp = Fr.feet.clone().addScaledVector(Fr.ant, -3 * s); P.sled.position.copy(sp); P.sled.scale.setScalar(s); P.sled.rotation.y = Math.atan2(Fr.ant.x, Fr.ant.z); EQ.dyn.add(line(w, sp.clone().setY(Fr.ground + 0.3 * s), 0x30343b, 0.006)); }
  if (['overhead'].includes(it.attach)) {
    const top = mid(hl, hr).y + 0.15 * s, c = mid(TW[11], TW[12]).setY(Math.max(top, Fr.ground + 2.2 * s));
    const ax = TW[11].clone().sub(TW[12]).setY(0).normalize();
    if (it.kind === 'pullup') EQ.dyn.add(line(c.clone().addScaledVector(ax, -0.6 * s), c.clone().addScaledVector(ax, 0.6 * s), 0xc9ced6, 0.016));
    else for (const h of [hl, hr]) { const a = c.clone().addScaledVector(ax, h === hl ? 0.25 * s : -0.25 * s).setY(c.y + 0.4 * s); EQ.dyn.add(line(a, h, it.kind === 'rings' ? 0xd9c79c : 0xffd400, 0.006)); if (it.kind === 'rings') EQ.dyn.add(placed(new THREE.Mesh(new THREE.TorusGeometry(0.09 * s, 0.014 * s, 10, 28), mat(0xc89b5e, { metal: 0 })), h.clone())); }
  }
  if (it.attach === 'floor' || it.attach === 'floor_front') { if (!EQ.static) { EQ.static = floorProps(it, Fr, s); EQ.group.add(EQ.static); } }
  // load arrows (length = share of body weight × 0.6 m), magenta: distinct from the green ground-reaction arrows
  const bw = labExtras().BIO.mass * G, Lw = labState().W;
  for (const pr of loadsTw) {
    if (pr.F < 1) continue;
    const at = Lw ? nearestTw(pr.pt, Lw, TW) : pr.pt;
    const len = Math.min(1.2, (pr.F / bw) * 0.6 + 0.08) * s, d = pr.dir.clone();
    const arr = new THREE.ArrowHelper(d, at, len, 0xff3df2, 0.06 * s, 0.035 * s); arr.traverse((o) => { if (o.material) { o.material.depthTest = false; o.renderOrder = 998; } }); EQ.dyn.add(arr);
  }
  EQ.hist.push({ t, F: loadsTw.reduce((a, x) => a + x.F, 0), m: jointMomentSeries() }); while (EQ.hist.length && t - EQ.hist[0].t > 10) EQ.hist.shift();
  if (!EQ.uiT || t - EQ.uiT > 0.2) { EQ.uiT = t; renderLive(); }
}
function nearestTw(pt, W, TW) { // map a physics-space point to the twin via the nearest landmark offset (scaled)
  let best = null, bd = Infinity; for (const k of [11, 12, 15, 16, 19, 20, 23, 24, 25, 26, 27, 28]) { const d = W[k].distanceTo(pt); if (d < bd) { bd = d; best = k; } }
  const s = TW[11].distanceTo(TW[12]) / Math.max(1e-3, W[11].distanceTo(W[12]));
  return TW[best].clone().add(pt.clone().sub(W[best]).multiplyScalar(s));
}
function jointMomentSeries() { const r = labExtras().BIO.last; if (!r || !r.J) return null; const o = {}; for (const [k, j] of Object.entries(r.J)) if (j.sag != null && !k.endsWith('wrist')) o[k] = j.sag; return o; }

// ------------------------------------------------------------------ panel
function renderPanel() {
  const it = EQ.item, host = $('#eq-body'); if (!host) return;
  if (!it) { rebuild(); host.innerHTML = '<p class="fine muted">No equipment.</p>'; return; }
  const mdl = EQ.cat.models[it.model] || EQ.cat.models.none;
  const specs = (it.specs || []).map((s) => `<tr><td>${esc(s.label)}</td><td><b>${esc(s.value)}</b></td><td class="fine">${esc(s.doc)} p.${s.page} · “${esc(s.quote)}”</td></tr>`).join('');
  const src = (it.specs || []).length ? [...new Set(it.specs.map((s) => s.doc))].map((d) => esc(EQ.cat.source[d].title)).join('; ') : '';
  const drills = (it.drills || []).map((d) => `<details><summary>${esc(d.Equipment)} · ${esc(d.Pattern)}: ${esc(d['Block 1 drill (wk 1-4)'])}</summary><p class="fine"><b>Blocks:</b> ${esc(d['Block 1 drill (wk 1-4)'])} → ${esc(d['Block 2 drill (wk 5-8)'])} → ${esc(d['Block 3 drill (wk 9-12)'])}</p><p class="fine"><b>Set-up:</b> ${esc(d['Set-up & execution (Block 1 drill)'])}</p><p class="fine"><b>Cues:</b> ${esc(d['Coaching cues'])}</p><p class="fine"><b>Errors / safety:</b> ${esc(d['Common errors / safety'])}</p></details>`).join('');
  const lib = (it.library || []).map((e) => `<button class="chip" data-ex="${esc(e.id)}" title="Open it in the exercise library">${esc(e.name)}</button>`).join(' ');
  host.innerHTML = `
    <div class="cls-tools eq-params">${paramInputs(it)}</div>
    <div class="eq-model"><b>${esc(mdl.name)}</b> · <span class="mono">${esc(mdl.formula)}</span><p class="fine">${esc(mdl.profile)}</p>${it.note ? `<p class="fine">${esc(it.note)}</p>` : ''}
      ${it.model === 'landmine' ? '<p class="fine">Assumed geometry: hands at the sleeve end (bar length − 5 cm from the pivot), plates centred 33 cm from the end.</p>' : ''}
      ${it.standard === null ? '<p class="fine muted">No governing standard for this item: the 3D geometry is illustrative and the load is what you set.</p>' : ''}</div>
    <div id="eq-live" class="eq-live"></div>
    <canvas id="eq-chart" width="520" height="120" class="eq-chart"></canvas>
    <p class="fine muted">Last 10 s: magenta = external load (N); orange/cyan = net hip, knee and lumbar moments in the sagittal plane (N·m), needs Biomechanics on.</p>
    ${specs ? `<details open><summary>Specifications (${it.specs.length}, quoted from ${src})</summary><table class="bio-table eq-specs"><tbody>${specs}</tbody></table></details>` : ''}
    ${drills ? `<details><summary>Owner's workbook: ${it.drills.length} equipment drills (12-week blocks, cues, errors)</summary>${drills}</details>` : ''}
    <p class="fine">${it.workbook_count ? `<b>${it.workbook_count.toLocaleString()}</b> workbook exercises use this equipment class (Training 4D → Exercise library). ` : ''}${it.library_count ? `<b>${it.library_count}</b> in the open exercise library:` : ''}</p>
    ${lib ? `<div class="eq-lib">${lib}</div>` : ''}`;
  host.querySelectorAll('[data-k]').forEach((el) => (el.onchange = () => {
    const k = el.dataset.k; EQ.p[k] = el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' && !['ratio'].includes(k) ? el.value : +el.value;
    rebuild(); renderLive();
  }));
  host.querySelectorAll('[data-ex]').forEach((b) => (b.onclick = () => { const q = $('#ex-quick'); if (!q) return; q.value = b.textContent.trim(); q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); q.scrollIntoView({ behavior: 'smooth', block: 'center' }); }));
  rebuild(); renderLive();
}
function renderLive() {
  const host = $('#eq-live'); if (!host || !EQ.item) return;
  const inf = EQ.info, bw = labExtras().BIO.mass * G, f = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '—');
  if (!inf) { host.innerHTML = EQ.item.model === 'none' ? '<p class="fine">Set-up geometry only: no external load.</p>' : '<p class="fine muted">Waiting for a pose (start the camera, press Demo, or play an exercise).</p>'; drawChart(); return; }
  const rows = inf.parts.map((p) => `<tr><td>${esc(p.label)}</td><td class="mono">${f(p.F)} N</td><td class="mono">${f((100 * p.F) / bw, 1)}% BW</td><td class="mono">${f(p.F / G, 1)} kg-equiv.</td><td class="fine">${dirWord(p.dir)}</td></tr>`).join('');
  const tot = inf.parts.reduce((a, p) => a.add(p.dir.clone().multiplyScalar(p.F)), V());
  host.innerHTML = `<table class="bio-table"><thead><tr><th>Load on</th><th>Force</th><th>Body weight</th><th>Equivalent</th><th>Direction</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="fine">${inf.mass != null ? `Implement mass <b class="mono">${f(inf.mass, 1)} kg</b>. ` : ''}${inf.k != null ? `Band stiffness k = <b class="mono">${f(inf.k, 0)} N/m</b>. ` : ''}${inf.landmine ? `Hands carry <b class="mono">${f(inf.landmine.Fh)} N</b> of the lever. ` : ''}${inf.sled ? `Normal force ${f(inf.sled.N)} N × μ ${EQ.p.mu}. ` : ''}Net external force on the body: <b class="mono">${f(tot.length())} N</b>; the ground reaction in the biomechanics panel already includes it.</p>`;
  drawChart();
}
function dirWord(d) { const L = labState(), A = L.atlas?.anchors || { anterior: 1 }; const up = d.y, ant = d.z * A.anterior; return Math.abs(up) > 0.9 ? (up < 0 ? 'down' : 'up') : `${up < -0.2 ? 'down and ' : up > 0.2 ? 'up and ' : ''}${ant > 0.3 ? 'forward' : ant < -0.3 ? 'backward' : 'sideways'}`; }
function drawChart() {
  const c = $('#eq-chart'); if (!c) return; const x = c.getContext('2d'), W = c.width, H = c.height, h = EQ.hist; x.clearRect(0, 0, W, H);
  if (h.length < 2) return; const t0 = h[h.length - 1].t - 10, X = (t) => ((t - t0) / 10) * W;
  const maxF = Math.max(50, ...h.map((p) => p.F)); x.strokeStyle = '#ff3df2'; x.lineWidth = 2; x.beginPath(); h.forEach((p, i) => { const y = H - 6 - (p.F / maxF) * (H - 14); i ? x.lineTo(X(p.t), y) : x.moveTo(X(p.t), y); }); x.stroke();
  x.fillStyle = '#ff3df2'; x.font = '11px system-ui'; x.fillText(`${maxF.toFixed(0)} N`, 4, 12);
  const keys = [['r_hip', '#ff8a1f'], ['r_knee', '#29d9ff'], ['lumbar', '#ffd166']]; const mm = Math.max(20, ...h.flatMap((p) => (p.m ? keys.map(([k]) => Math.abs(p.m[k] || 0)) : [0])));
  for (const [k, col] of keys) { x.strokeStyle = col; x.lineWidth = 1.2; x.beginPath(); let on = false; h.forEach((p) => { if (!p.m) return; const y = H / 2 - ((p.m[k] || 0) / mm) * (H / 2 - 8); on ? x.lineTo(X(p.t), y) : x.moveTo(X(p.t), y); on = true; }); x.stroke(); }
  x.fillStyle = '#9fb3c8'; x.fillText(`±${mm.toFixed(0)} N·m  R hip · R knee · lumbar`, W - 190, 12);
}

// ------------------------------------------------------------------ validation (mechanics checks, not a clinical validation)
async function selfTest() {
  const out = $('#eq-test-out'); const L = labState(), { restLandmarks } = labExtras();
  const { analyse } = await import('./biomech.js');
  const W = restLandmarks(L.rig), A = L.atlas.anchors, axes = { up: V(0, 1, 0), ant: V(0, 0, A.anterior), left: V(A.leftX, 0, 0) }, R = {};
  const res = [], ok = (name, err, tol, unit) => res.push(`<tr><td>${name}</td><td class="mono">${err.toExponential(2)} ${unit}</td><td>${Math.abs(err) <= tol ? '✓' : '✗'}</td></tr>`);
  const base = analyse(W, R, { mass: 70, axes });
  // 1 gravity: a 20 kg load in the right hand raises total ground reaction by exactly m·g
  const hr = hand(W, 'r'), F = V(0, -20 * G, 0), withL = analyse(W, R, { mass: 70, axes, loads: [{ at: 'hand', side: 'r', p: hr, F }] });
  ok('ΣGRF rises by m·g (20 kg in the hand)', withL.grf.l.clone().add(withL.grf.r).y - base.grf.l.clone().add(base.grf.r).y - 20 * G, 1e-6, 'N');
  // 2 a load applied exactly at the elbow adds no elbow moment
  const atEl = analyse(W, R, { mass: 70, axes, loads: [{ at: 'hand', side: 'r', p: W[14].clone(), F }] });
  ok('Load at the elbow adds 0 elbow moment', atEl.J.r_elbow.sag - base.J.r_elbow.sag, 1e-9, 'N·m');
  // 3 shoulder moment change equals (r × F)·axis computed independently along the solver's own axis
  const dSh = withL.J.r_shoulder.sag - base.J.r_shoulder.sag, rxF = hr.clone().sub(W[12]).cross(F), axis = V(0, -1, 0).cross(axes.ant).normalize();
  ok('Δ shoulder moment = −(r × F)·axis', dSh - (-rxF.dot(axis)), 1e-6, 'N·m');
  // 4 elastic law
  const k = 200 / (2.0 - 1.0); ok('Band: k·(L − L₀) at L = 1.6 m equals 120 N', k * (1.6 - 1.0) - 120, 1e-9, 'N');
  // 5 landmine: moments about the pivot balance (hand force vs bar and plate weights)
  const Lb = 2.2, Lh = Lb - 0.05, Lp = Lb - 0.33, mb = 20, mp = 10, Fh = G * (mb * Lb / 2 + mp * Lp) / Lh, th = 0.6;
  ok('Landmine: Σ moments about the pivot = 0', Fh * Lh * Math.cos(th) - (mb * G * (Lb / 2) * Math.cos(th) + mp * G * Lp * Math.cos(th)), 1e-9, 'N·m');
  // 6 rulebook plate loading: 140 kg on the IWF men's bar with collars uses 2 × (25+25+10)
  const bar = EQ.cat.items.find((i) => i.id === 'iwf_bar_men'), sv = EQ.p; EQ.p = { bar: 20, collars: true, total: 140 }; const pl = platesFor(bar, 140); EQ.p = sv;
  ok('IWF loading 140 kg: per side 25+25+10 (+collar)', pl.discs.reduce((s, d) => s + d[0], 0) * 2 + 20 + 5 - 140, 1e-9, 'kg');
  out.innerHTML = `<table class="bio-table"><thead><tr><th>Check</th><th>Error</th><th></th></tr></thead><tbody>${res.join('')}</tbody></table><p class="fine muted">These check the mechanics code against hand calculations. They do not validate the camera, the body model or real-world forces (no force plate or EMG comparison).</p>`;
  return res;
}
window.__eqSelfTest = selfTest; window.__EQ = EQ; window.__eqChoose = choose;
