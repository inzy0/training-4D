// Structure explorer for the 3D Atlas: for a selected structure, its place in
// the anatomy tree, its divisions (isolated and colour-coded), and for bones:
// landmarks, zones, articulations and the muscles that attach near each end;
// for muscles: the bones near each end (likely origin and insertion).
//
// Sources and rules (stated in the UI):
//   - hierarchy: BodyParts3D part-of tree (CC BY 4.0)
//   - divisions: FMA naming ("acromial part of left deltoid" -> division of
//     "left deltoid"); same layer only
//   - landmarks: the rig's geometric rules (rig.js), within 12 mm of the bone
//   - articulations: other bone surface within 6 mm
//   - attachments: each muscle's two ends (15% extremes along its long axis)
//     matched to bone surface within 15 mm; the end on the more proximal bone of
//     the limb chain is the likely origin, the other the likely insertion. Inferred from
//     geometry, not a curated attachment database.

import * as THREE from 'three';
import { buildRig } from './rig.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PALETTE = ['#ff5d8f', '#4cc9f0', '#ffd166', '#06d6a0', '#f78c6b', '#b388ff', '#90e0ef', '#e9ff70', '#ff9e00', '#80ffdb', '#ff70a6', '#70d6ff'];

let S = null, partof = null, rig = null, grid = null, muscleEnds = null, markerGroup = null, labelEls = [];
const ghostMat = new THREE.MeshStandardMaterial({ color: 0x9fb3c8, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
const matCache = new Map();
const colMat = (c) => { if (!matCache.has(c)) matCache.set(c, new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.3, roughness: 0.45, side: THREE.DoubleSide })); return matCache.get(c); };

let EXPLAIN = null;
const LABEL = { 'Introduction': 'What it is', 'Structure and Function': 'What it does and why it is needed', 'Blood Supply and Lymphatics': 'Blood supply and lymphatics',
  'Nerves': 'Nerves', 'Muscles': 'Muscles', 'Physiologic Variants': 'Normal variants', 'Surgical Considerations': 'Surgical considerations', 'Clinical Significance': 'Clinical significance' };
export async function aboutHtml(name) {
  if (!EXPLAIN) { try { EXPLAIN = (await (await fetch('/training-4D/rt/atlas/explain/index.json')).json()); } catch { EXPLAIN = { map: {} }; } }
  const m = EXPLAIN.map[name];
  if (!m) return '<p class="fine muted">No StatPearls anatomy chapter matches this structure or a parent of it, so nothing is shown (nothing here is written by a model).</p>';
  const c = await (await fetch(`/training-4D/rt/atlas/explain/${m.f}.json`)).json();
  const secs = Object.entries(c.sections).map(([k, v], i) => `<details ${i < 2 ? 'open' : ''}><summary>${esc(LABEL[k] || k)}</summary><p class="fine about-t">${esc(v).split(String.fromCharCode(10, 10)).join('</p><p class="fine about-t">')}</p></details>`).join('');
  return `${m.via ? `<p class="fine"><b>No chapter of its own:</b> shown from the chapter for its parent, <b>${esc(m.via)}</b>.</p>` : ''}${secs}
    <p class="fine cite">Verbatim from: <i>${esc(c.title)}</i>${c.authors ? `. ${esc(c.authors)}` : ''}. ${esc(c.publisher)}, StatPearls [Internet], chapter ${esc(c.chapter)}. Licence <a href="${esc(c.licence)}" target="_blank" rel="noopener">CC BY-NC-ND 4.0</a> (unchanged text). <a href="${esc(c.link)}" target="_blank" rel="noopener">Find on NCBI Bookshelf</a>. First passage of each section only.</p>`;
}

async function related(name) {
  const term = name.split(' of ').pop().replace(/\b(left|right)\b/g, '').replace(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\b/g, '').trim();
  const host = $('#st-related'); if (!host || term.length < 3) return;
  const get = (type) => fetch(`/api/clinical/search?q=${encodeURIComponent(term)}&type=${type}&limit=8`).then((r) => r.json()).catch(() => []);
  const [cond, proc] = await Promise.all([get('condition'), get('procedure')]);
  const li = (x) => `<li><a href="#clinical" data-cl="${esc(x.id)}">${esc(x.title)}</a></li>`;
  host.innerHTML = `<h3 class="st-h">Related clinical chapters <small>"${esc(term)}" in the title</small></h3>
    ${cond.length ? `<p class="fine"><b>Conditions</b></p><ul class="st-list">${cond.map(li).join('')}</ul>` : ''}${proc.length ? `<p class="fine"><b>Procedures &amp; surgery</b></p><ul class="st-list">${proc.map(li).join('')}</ul>` : ''}${!cond.length && !proc.length ? '<p class="fine muted">No StatPearls condition or procedure chapter has this term in its title.</p>' : ''}`;
  host.querySelectorAll('[data-cl]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); location.hash = '#clinical'; import('./clinical.js').then((m) => { m.startClinical(a.dataset.cl); }); }));
}

export async function initStructure(state) {
  window.__structure = { ends: () => Object.fromEntries([...computeMuscleEnds().entries()]) }; // for the S1 attachment check (tools/anatomy_lab_s1.py)
  S = state;
  try { partof = (await (await fetch('/training-4D/rt/atlas/partof.json')).json()).parent; } catch { partof = {}; }
}

// ------------------------------------------------------------------ hierarchy and divisions
const groupKey = (name) => (name.includes(' of ') ? name.split(' of ').slice(1).join(' of ') : name);
export function breadcrumb(name) {
  const chain = []; let n = partof[name] ? name : (partof[groupKey(name)] ? groupKey(name) : null);
  if (n && n !== name) chain.push(n);
  while (n && partof[n] && chain.length < 8) { n = partof[n]; chain.push(n); }
  return chain.reverse();
}
export function divisions(mesh) {
  const p = mesh.userData.part; const key = groupKey(p.name);
  const same = S.meshes.filter((m) => m.userData.part.layer === p.layer && (groupKey(m.userData.part.name) === key || m.userData.part.name === key));
  const uniq = new Map(); same.forEach((m) => { if (!uniq.has(m.userData.part.name)) uniq.set(m.userData.part.name, []); uniq.get(m.userData.part.name).push(m); });
  return { key, items: [...uniq.entries()].map(([name, meshes], i) => ({ name, meshes, color: PALETTE[i % PALETTE.length] })) };
}

// ------------------------------------------------------------------ geometry index (bones), built once on first use
function ensureIndex() {
  if (grid) return;
  rig = rig || buildRig(S.atlas);
  grid = new Map(); const V = 0.01;
  const key = (x, y, z) => `${Math.floor(x / V)},${Math.floor(y / V)},${Math.floor(z / V)}`;
  grid.key = key; grid.V = V;
  for (const { part, geometry } of S.atlas.parts) {
    if (part.layer !== 'skeleton' || /disk|cartilage|ligament|membrane|tendon|tooth/.test(part.name)) continue;
    const a = geometry.attributes.position.array;
    for (let i = 0; i < a.length; i += 6) { const k = key(a[i], a[i + 1], a[i + 2]); let c = grid.get(k); if (!c) grid.set(k, (c = [])); c.push(a[i], a[i + 1], a[i + 2], part.name); }
  }
}
function nearestBone(x, y, z, r, exclude) {
  const V = grid.V, ix = Math.floor(x / V), iy = Math.floor(y / V), iz = Math.floor(z / V), n = Math.ceil(r / V); let best = r * r, who = null;
  for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) for (let c = -n; c <= n; c++) {
    const cell = grid.get(`${ix + a},${iy + b},${iz + c}`); if (!cell) continue;
    for (let i = 0; i < cell.length; i += 4) { if (cell[i + 3] === exclude) continue; const d = (cell[i] - x) ** 2 + (cell[i + 1] - y) ** 2 + (cell[i + 2] - z) ** 2; if (d < best) { best = d; who = cell[i + 3]; } }
  }
  return who;
}
function pointsOf(name, step) {
  const g = S.atlas.byName.get(name)?.geometry; if (!g) return [];
  const a = g.attributes.position.array, out = [];
  for (let i = 0; i < a.length; i += 3 * step) out.push(new THREE.Vector3(a[i], a[i + 1], a[i + 2]));
  return out;
}
function principal(P) {
  const c = P.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / P.length);
  let v = new THREE.Vector3(0, 1, 0);
  for (let it = 0; it < 12; it++) { // power iteration on the covariance
    const nv = new THREE.Vector3();
    for (const p of P) { const d = p.clone().sub(c); nv.addScaledVector(d, d.dot(v)); }
    v = nv.normalize();
  }
  return { c, v };
}
const TRUNK = () => { const A = S.atlas.anchors; return A.l_shoulder.clone().add(A.r_shoulder).add(A.l_hip).add(A.r_hip).multiplyScalar(0.25); };
// position of a bone in the proximal-to-distal chain: axial 0, girdle 1, arm/thigh 2, forearm/leg 3, wrist/ankle 4, hand/foot 5
function boneRank(n) {
  if (/vertebra|sacrum|coccyx|rib|sternum|skull|cranial|occipital|temporal|parietal|frontal|sphenoid|ethmoid|mandible|maxilla|hyoid|zygomatic|nasal|palatine|vomer|lacrimal/.test(n)) return 0;
  if (/clavicle|scapula|hip bone|ilium|ischium|pubis/.test(n)) return 1;
  if (/humerus|femur|patella/.test(n)) return 2;
  if (/radius|ulna|tibia|fibula/.test(n)) return 3;
  if (/carpal|scaphoid|lunate|triquetr|pisiform|trapezi|capitate|hamate|talus|calcaneus|navicular|cuboid|cuneiform/.test(n)) return 4;
  return 5;
}
function computeMuscleEnds() {
  if (muscleEnds) return muscleEnds;
  ensureIndex(); muscleEnds = new Map();
  for (const { part } of S.atlas.parts) {
    if (part.layer !== 'muscles') continue;
    const P = pointsOf(part.name, 3); if (P.length < 20) continue;
    const { c, v } = principal(P);
    const proj = P.map((p) => [p.clone().sub(c).dot(v), p]).sort((a, b) => a[0] - b[0]);
    const k = Math.max(4, Math.round(P.length * 0.15));
    const endBones = (pts) => { const cnt = new Map(); for (const [, p] of pts) { const b = nearestBone(p.x, p.y, p.z, 0.015); if (b) cnt.set(b, (cnt.get(b) || 0) + 1); } return [...cnt.entries()].sort((a, b) => b[1] - a[1]).filter(([, n]) => n >= 2).slice(0, 3).map(([b]) => b); };
    const b1 = endBones(proj.slice(0, k)), b2 = endBones(proj.slice(-k));
    // origin = attachment on the more proximal bone of the chain (the usual anatomical convention);
    // when both ends sit at the same chain level the ends are reported without that label
    const r1 = Math.min(...b1.map(boneRank), 99), r2 = Math.min(...b2.map(boneRank), 99);
    if (r1 === r2) muscleEnds.set(part.name, { origin: [], insertion: [], ends: [b1, b2] });
    else muscleEnds.set(part.name, r1 < r2 ? { origin: b1, insertion: b2 } : { origin: b2, insertion: b1 });
  }
  return muscleEnds;
}

function boneInfo(name) {
  ensureIndex();
  const P = pointsOf(name, 5);
  const art = new Map();
  for (const p of P) { const b = nearestBone(p.x, p.y, p.z, 0.006, name); if (b) art.set(b, (art.get(b) || 0) + 1); }
  const articulates = [...art.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).map(([b]) => b);
  const ends = computeMuscleEnds();
  const originHere = [], insertHere = [];
  ends.forEach((e, m) => { if (e.origin.includes(name)) originHere.push(m); if (e.insertion.includes(name)) insertHere.push(m); });
  // landmarks within 12 mm of this bone
  const lm = Object.entries(rig.LM).concat(Object.entries(rig.J)).filter(([, o]) => nearestBone(o.p.x, o.p.y, o.p.z, 0.012) === name);
  return { articulates, originHere: [...new Set(originHere)].sort(), insertHere: [...new Set(insertHere)].sort(), lm };
}

// ------------------------------------------------------------------ zones on long bones (vertex colours by position along the bone)
function applyZones(mesh, on) {
  const g = mesh.geometry;
  if (!on) { mesh.material = mesh.userData.zoneBase || mesh.material; return; }
  const P = []; const a = g.attributes.position.array;
  for (let i = 0; i < a.length; i += 3) P.push(new THREE.Vector3(a[i], a[i + 1], a[i + 2]));
  const { c, v } = principal(P.filter((_, i) => i % 4 === 0));
  const t = P.map((p) => p.clone().sub(c).dot(v)); const lo = Math.min(...t), hi = Math.max(...t);
  const trunk = TRUNK(); const pLo = c.clone().addScaledVector(v, lo), pHi = c.clone().addScaledVector(v, hi);
  const loIsProx = pLo.distanceTo(trunk) < pHi.distanceTo(trunk);
  const col = new Float32Array(P.length * 3);
  const C = { prox: new THREE.Color('#ff9e00'), shaft: new THREE.Color('#e9edc9'), dist: new THREE.Color('#4cc9f0') };
  t.forEach((x, i) => { const f = (x - lo) / (hi - lo || 1); const fp = loIsProx ? f : 1 - f; const z = fp < 0.2 ? C.prox : fp > 0.8 ? C.dist : C.shaft; col.set([z.r, z.g, z.b], i * 3); });
  // a colour attribute is ignored by every material without vertexColors, so other views are unaffected
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  mesh.userData.zoneBase = mesh.userData.zoneBase || mesh.material;
  mesh.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, side: THREE.DoubleSide });
}

// ------------------------------------------------------------------ landmarks on the selected bone
function showLandmarks(list, on) {
  if (markerGroup) { S.scene.remove(markerGroup); markerGroup = null; }
  const host = $('#atlas-lm-labels'); host.innerHTML = ''; labelEls = [];
  if (!on || !list.length) return;
  markerGroup = new THREE.Group(); S.scene.add(markerGroup);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffc067, depthTest: false });
  for (const [k, o] of list) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.005, 12, 8), mat); s.position.copy(o.p); s.renderOrder = 999; markerGroup.add(s); }
  host.innerHTML = list.map(([k]) => `<span class="lab-lbl">${esc(pretty(k))}</span>`).join('');
  labelEls = list.map(([, o], i) => ({ el: host.children[i], p: o.p }));
}
// labels for everything in view: visible structures ranked by projected size, collision-avoided, max 70
let vT = 0;
function updateViewLabels() {
  const host = document.getElementById('atlas-vlabels'); if (!host || !S?.viewLabels) return;
  const now = performance.now(); if (now - vT < 150) return; vT = now;
  const r = host.getBoundingClientRect(), cam = S.camera, v = new THREE.Vector3(), c = new THREE.Vector3();
  const fov = (cam.fov * Math.PI) / 180, cand = [];
  for (const m of S.meshes) {
    if (!m.visible || !m.parent.visible || (m.material.opacity ?? 1) < 0.2) continue;
    c.copy(m.geometry.boundingSphere.center).add(m.position);
    v.copy(c).project(cam); if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue;
    const d = cam.position.distanceTo(c), px = (m.geometry.boundingSphere.radius / (d * Math.tan(fov / 2))) * (r.height / 2);
    if (px < 14) continue;
    cand.push({ n: m.userData.part.name, x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height, px, col: S.layerState.get(m.userData.part.layer)?.color });
  }
  cand.sort((a, b) => b.px - a.px);
  const placed = [], out = [], seen = new Set();
  for (const L of cand) {
    if (out.length >= 70 || seen.has(L.n)) continue;
    const w = L.n.length * 5.8 + 12; let y = L.y, k = 0;
    while (k++ < 6 && placed.some((q) => Math.abs(q.y - y) < 15 && L.x < q.x + q.w && q.x < L.x + w)) y += 15;
    if (placed.some((q) => Math.abs(q.y - y) < 15 && L.x < q.x + q.w && q.x < L.x + w)) continue;
    placed.push({ x: L.x, y, w }); seen.add(L.n);
    out.push(`<span class="lab-lbl" style="transform:translate(${L.x}px,${y}px);border-color:${L.col || '#4cc9f0'}">${esc(L.n)}</span>`);
  }
  host.innerHTML = out.join('');
}

export function updateStructureLabels() {
  updateViewLabels();
  if (!labelEls.length) return;
  const r = $('#atlas-lm-labels').getBoundingClientRect(), v = new THREE.Vector3();
  const placed = [];
  for (const L of labelEls) {
    v.copy(L.p).project(S.camera); const vis = v.z < 1; L.el.style.display = vis ? '' : 'none'; if (!vis) continue;
    const x = ((v.x + 1) / 2) * r.width + 8, w = L.el.offsetWidth || 120; let y = ((1 - v.y) / 2) * r.height - 8;
    for (let k = 0; k < 12 && placed.some((q) => Math.abs(q.y - y) < 18 && x < q.x + q.w && q.x < x + w); k++) y += 18; // push down until free
    placed.push({ x, y, w }); L.el.style.transform = `translate(${x}px, ${y}px)`;
  }
}
const pretty = (k) => k.replace(/^v_/, '').replace(/^([lr])_/, (m, s) => (s === 'l' ? 'L ' : 'R ')).replace(/_/g, ' ');

// ------------------------------------------------------------------ panel
export function renderStructure(mesh) {
  const p = mesh.userData.part, host = $('#atlas-structure');
  const bc = breadcrumb(p.name), dv = divisions(mesh);
  const isBone = p.layer === 'skeleton' && !/disk|cartilage|ligament|membrane|tendon|tooth/.test(p.name);
  const isMuscle = p.layer === 'muscles';
  host.innerHTML = `
    <div id="st-about" class="st-about"><p class="fine muted">Loading what it is and what it does…</p></div>
    <div id="st-related"></div>
    <p class="fine"><b>Where it sits:</b> ${bc.length ? bc.map(esc).join(' › ') + ' › ' : ''}<b>${esc(p.name)}</b> <small>(BodyParts3D part-of tree)</small></p>
    <h3 class="st-h">Divisions of ${esc(dv.key)} <small>${dv.items.length}</small></h3>
    <ul class="st-list">${dv.items.map((d) => `<li><span class="sw" style="background:${d.color}"></span> ${esc(d.name)}${d.name === p.name ? ' <small>(selected)</small>' : ''}</li>`).join('')}</ul>
    <p class="btnrow"><button class="ghost-btn" id="st-iso">Isolate &amp; colour divisions</button><button class="ghost-btn" id="st-all">Show everything</button></p>
    <div id="st-detail"><p class="muted">${isBone || isMuscle ? 'Computing attachments from the geometry…' : ''}</p></div>
    <p class="fine">Divisions follow FMA naming (e.g. "acromial part of left deltoid"). Landmarks, articulations and attachments are inferred from the 3D geometry of one reference body, not from a curated attachment database.</p>`;
  $('#st-iso').onclick = () => {
    const keep = new Set(dv.items.flatMap((d) => d.meshes));
    S.meshes.forEach((m) => { m.visible = keep.has(m); });
    dv.items.forEach((d) => d.meshes.forEach((m) => { m.userData.baseMat = m.userData.baseMat || m.material; m.material = colMat(d.color); }));
    S.focusMeshes?.(dv.items.flatMap((d) => d.meshes));
  };
  $('#st-all').onclick = () => { S.meshes.forEach((m) => { m.visible = true; if (m.userData.baseMat && m !== S.selected) m.material = m.userData.baseMat; }); showLandmarks([], false); };
  aboutHtml(p.name).then((h) => { const el = $('#st-about'); if (el) el.innerHTML = `<h3 class="st-h">About this structure</h3>${h}`; });
  related(p.name);
  if (!isBone && !isMuscle) { $('#st-detail').innerHTML = ''; return; }
  setTimeout(async () => {
    const d = $('#st-detail');
    if (isBone) {
      const b = boneInfo(p.name);
      d.innerHTML = `
        <h3 class="st-h">Bony landmarks on this bone <small>${b.lm.length}</small></h3>
        <ul class="st-list">${b.lm.map(([k, o]) => `<li><b>${esc(pretty(k))}</b> <small>${esc(o.how)}</small></li>`).join('') || '<li class="muted">none computed for this bone</li>'}</ul>
        <p class="btnrow"><button class="ghost-btn" id="st-bone">Isolate bone with its neighbours</button></p>
        <label class="fine"><input id="st-lm" type="checkbox" checked> Show landmarks on the bone</label> <label class="fine"><input id="st-zones" type="checkbox"> Colour zones (proximal end · shaft · distal end)</label>
        <h3 class="st-h">Articulates / contacts <small>${b.articulates.length}</small></h3>
        <p class="fine">${b.articulates.map(esc).join(' · ') || 'none within 6 mm'}</p>
        <h3 class="st-h">Muscles with their proximal attachment here (likely origin) <small>${b.originHere.length}</small></h3>
        <p class="fine">${b.originHere.map(esc).join(' · ') || 'none found'}</p>
        <h3 class="st-h">Muscles with their distal attachment here (likely insertion) <small>${b.insertHere.length}</small></h3>
        <p class="fine">${b.insertHere.map(esc).join(' · ') || 'none found'}</p>`;
      showLandmarks(b.lm, true);
      $('#st-lm').onchange = (e) => showLandmarks(b.lm, e.target.checked);
      $('#st-zones').onchange = (e) => applyZones(mesh, e.target.checked);
      $('#st-bone').onclick = () => {
        const near = new Set(b.articulates);
        S.meshes.forEach((m) => { const n = m.userData.part.name; m.visible = m === mesh || near.has(n); if (near.has(n)) { m.userData.baseMat = m.userData.baseMat || m.material; m.material = ghostMat; } });
        S.focusMeshes?.([mesh]);
      };
    } else {
      const e = computeMuscleEnds().get(p.name) || { origin: [], insertion: [] };
      let s1 = ''; try { S.s1 = S.s1 || (await (await fetch('/training-4D/rt/atlas/s1_report.json')).json()); const r = S.s1.rows.find((x) => x.muscle === p.name);
        if (r) { const v = (k, lab) => r[`strict_${k}_agrees`] === undefined ? `${lab}: not checkable (the chapter's ${k} clause names no known bone)` : r[`strict_${k}_agrees`] ? `${lab}: <b class="good">agrees</b> with the chapter` : `${lab}: <b class="poor">differs</b>, the chapter's ${k} clause names ${esc(r[`strict_${k}_bones`].join(', '))}`;
          s1 = `<p class="fine"><b>Checked against <i>${esc(r.chapter)}</i></b> (gate S1, strict clause rule): ${v('origin', 'origin')} · ${v('insertion', 'insertion')}. Overall: origin ${S.s1.strict_origin.agree}/${S.s1.strict_origin.evaluable}, insertion ${S.s1.strict_insertion.agree}/${S.s1.strict_insertion.evaluable} muscles agree.</p>`; } } catch { /* report not built */ }
      if (e.ends) { d.innerHTML = `<h3 class="st-h">Attachments (both ends at the same chain level, so not labelled origin/insertion)</h3><p class="fine">End 1: ${e.ends[0].map(esc).join(' · ') || 'no bone within 15 mm'}<br>End 2: ${e.ends[1].map(esc).join(' · ') || 'no bone within 15 mm'}</p>`; return; }
      d.innerHTML = `
        <h3 class="st-h">Likely origin (attachment on the more proximal bone)</h3><p class="fine">${e.origin.map(esc).join(' · ') || 'no bone within 15 mm of this end'}</p>
        <h3 class="st-h">Likely insertion (attachment on the more distal bone)</h3><p class="fine">${e.insertion.map(esc).join(' · ') || 'no bone within 15 mm of this end'}</p>${s1}`;
    }
  }, 30);
}
