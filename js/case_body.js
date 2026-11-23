// Case body: one shared reference body carrying several randomly drawn
// conditions at once, each numbered, colour-coded, pinned and listed.
//
// Placement uses only MeSH's own filing:
//   - organ conditions (Heart Diseases, Kidney Diseases, ...) go on that organ,
//     via the DISEASE_CLASSES table (BodyParts3D part-of / is-a concepts);
//   - injuries go on their MeSH body-region branch (Knee Injuries -> knee),
//     using bone + muscle structures whose position falls in that region.
// Whole-limb branches (Arm Injuries, Leg Injuries) are not used: they mix
// sub-regions, so a drawn condition could land in the wrong place. Conditions
// that are tissue-wide (e.g. osteoporosis) are not placed: they have no single
// location. Left/right is chosen at random for paired organs and limbs, and
// the legend says so. It is a teaching composite, not a patient.

import * as THREE from 'three';
import { regionOf3D } from './atlas_data.js';
import { conditionCard } from './conditions.js';

const $ = (s) => document.querySelector(s);
const ORGAN_CLASSES = ['heart', 'lung', 'brain', 'spinal_cord', 'eye', 'liver', 'stomach', 'intestine', 'kidney', 'teeth', 'spine'];
const BILATERAL_ORGANS = new Set(['lung', 'eye', 'kidney']);
const REGIONS_USED = ['head', 'face', 'neck', 'shoulder', 'elbow', 'forearm', 'wrist', 'hand', 'thorax', 'back', 'abdomen', 'hip', 'knee', 'ankle', 'foot'];
const MIDLINE = new Set(['head', 'face', 'neck', 'thorax', 'back', 'abdomen']);
const PALETTE = ['#ff5d8f', '#4cc9f0', '#ffd166', '#06d6a0', '#f78c6b', '#b388ff', '#90e0ef', '#e9ff70', '#ff9e00', '#80ffdb', '#ff70a6', '#70d6ff'];
const rnd = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let S, D, pinsHost;
const C = { active: false, cases: [], mats: [] };

export function setupCaseBody(state, data) {
  S = state; D = data; S.case = C;
  pinsHost = $('#case-pins');
  if (!D?.classes) { $('#case-legend').innerHTML = '<p class="muted">Build conditions first (tools/anatomy_lab_conditions.py).</p>'; return; }
  indexBody();
  $('#case-new').onclick = newCaseBody;
  $('#case-clear').onclick = clearCaseBody;
  S.onFrame = updatePins;
}

// side of a structure relative to the body midline, in the subject's terms
let midX = 0;
function sideOf(m) {
  const dx = (m.userData.centroid.x - midX) * S.atlas.anchors.leftX;
  return Math.abs(dx) < 0.012 ? 'mid' : dx > 0 ? 'left' : 'right';
}

const regionMeshes = new Map(); // region -> {left, right, mid: Mesh[]}
function indexBody() {
  const A = S.atlas.anchors; midX = (A.l_shoulder.x + A.r_shoulder.x) / 2;
  for (const m of S.meshes) {
    const L = m.userData.part.layer; if (L !== 'skeleton' && L !== 'muscles') continue;
    const r = regionOf3D(m.userData.centroid, A); if (!REGIONS_USED.includes(r)) continue;
    if (!regionMeshes.has(r)) regionMeshes.set(r, { left: [], right: [], mid: [] });
    regionMeshes.get(r)[sideOf(m)].push(m);
  }
}

function pool(onlyMp) {
  const out = []; const seen = new Set();
  const add = (ui, loc) => { if (seen.has(ui)) return; if (onlyMp && !D.nodes[ui].mp.length) return; seen.add(ui); out.push({ ui, ...loc }); };
  for (const k of ORGAN_CLASSES) {
    const c = D.classes.find((x) => x.key === k); if (!c?.meshes?.length) continue;
    for (const r of c.roots) for (const ui of D.roots[r]?.members || []) add(ui, { kind: 'organ', key: k, cls: c, root: r });
  }
  for (const reg of REGIONS_USED) {
    const R = D.regions[reg]; if (!R || !regionMeshes.has(reg)) continue;
    for (const r of R.roots) for (const ui of D.roots[r]?.members || []) add(ui, { kind: 'region', key: reg, root: r });
  }
  return out;
}

function placeCase(p) {
  if (p.kind === 'organ') {
    let meshes = p.cls.meshes, side = null;
    if (BILATERAL_ORGANS.has(p.key)) {
      side = rnd(2) ? 'left' : 'right';
      const s = meshes.filter((m) => sideOf(m) === side); if (s.length) meshes = s; else side = null;
    }
    return { meshes, side, where: side ? `${side[0].toUpperCase()}${side.slice(1)} ${p.cls.label.toLowerCase()}` : p.cls.label, locKey: `organ:${p.key}:${side}` };
  }
  const g = regionMeshes.get(p.key);
  let side = null, meshes;
  if (MIDLINE.has(p.key)) meshes = [...g.left, ...g.right, ...g.mid];
  else { side = rnd(2) ? 'left' : 'right'; meshes = g[side].length ? g[side] : [...g.left, ...g.right]; }
  const lab = D.regions[p.key].label.toLowerCase();
  return { meshes, side, where: side ? `${side[0].toUpperCase()}${side.slice(1)} ${lab}` : D.regions[p.key].label, locKey: `region:${p.key}:${side}` };
}

function newCaseBody() {
  const n = +$('#case-n').value; const P = pool($('#case-mp').checked);
  const cases = []; const usedLoc = new Set(); const usedUi = new Set();
  for (let tries = 0; cases.length < n && tries < 400; tries++) {
    const p = P[rnd(P.length)]; if (usedUi.has(p.ui)) continue;
    const loc = placeCase(p);
    // one case per place, and one per organ/region overall so each stays identifiable
    const placeKey = loc.locKey.split(':').slice(0, 2).join(':');
    if (!loc.meshes.length || usedLoc.has(placeKey)) continue;
    usedLoc.add(placeKey); usedUi.add(p.ui);
    const box = new THREE.Box3(); loc.meshes.forEach((m) => box.expandByObject(m));
    cases.push({ ...p, ...loc, n: cases.length + 1, color: PALETTE[cases.length % PALETTE.length], box, pin: box.getCenter(new THREE.Vector3()) });
  }
  C.cases = cases; C.active = cases.length > 0;
  C.mats = cases.map((c) => new THREE.MeshStandardMaterial({ color: c.color, emissive: c.color, emissiveIntensity: 0.45, roughness: 0.4, side: THREE.DoubleSide, clippingPlanes: S.clipList }));
  S.classOn?.clear(); S.syncClassBoxes?.();
  applyCase(); renderLegend(); buildPins();
}

function clearCaseBody() {
  C.active = false; C.cases = []; pinsHost.innerHTML = ''; $('#case-legend').innerHTML = '';
  S.applyClasses?.();
}

function applyCase() {
  if (!C.active) return;
  const owner = new Map();
  C.cases.forEach((c, i) => c.meshes.forEach((m) => owner.set(m, i)));
  for (const m of S.meshes) {
    if (m === S.selected) continue;
    const i = owner.get(m);
    m.material = i !== undefined ? C.mats[i] : S.ghostMat;
  }
  S.applyVisibility?.();
}

function renderLegend() {
  const host = $('#case-legend');
  if (!C.cases.length) { host.innerHTML = '<p class="muted">No placeable condition matched. Untick "only with a MedlinePlus summary".</p>'; return; }
  host.innerHTML = C.cases.map((c) => `
    <div class="case" data-n="${c.n}">
      <div class="case-h"><span class="case-num" style="background:${c.color}">${c.n}</span>
        <b>${esc(D.nodes[c.ui].name)}</b>
        <button class="ghost-btn case-focus" data-n="${c.n}">Focus</button></div>
      <div class="fine">${esc(c.where)} · MeSH branch ${esc(c.root)}${c.side ? ' · side chosen at random' : ''} · ${c.meshes.length} structure${c.meshes.length === 1 ? '' : 's'}</div>
      ${conditionCard(c.ui, D.nodes[c.ui])}
    </div>`).join('') + `<p class="fine">A teaching composite: conditions drawn at random from MeSH and placed on the organ or body region MeSH files them under. Colour marks where the condition occurs, not a lesion. Not a patient.</p>`;
  host.querySelectorAll('.case-focus').forEach((b) => b.addEventListener('click', () => focusCase(+b.dataset.n)));
}

function focusCase(n) {
  const c = C.cases.find((x) => x.n === n); if (!c) return;
  const ctr = c.box.getCenter(new THREE.Vector3()), r = Math.max(0.08, c.box.getSize(new THREE.Vector3()).length() / 2);
  const dir = S.camera.position.clone().sub(S.controls.target).normalize();
  S.controls.target.copy(ctr); S.camera.position.copy(ctr).addScaledVector(dir, r * 3.2); S.controls.update();
  const el = document.querySelector(`.case[data-n="${n}"]`); if (el) { el.querySelector('details')?.setAttribute('open', ''); el.scrollIntoView({ block: 'nearest' }); }
}

function buildPins() {
  pinsHost.innerHTML = '<svg class="case-lines" width="100%" height="100%"></svg>' + C.cases.map((c) => `<button class="case-pin" data-n="${c.n}" style="--c:${c.color}"><b>${c.n}</b><span>${esc(D.nodes[c.ui].name)}</span></button>`).join('');
  pinsHost.querySelectorAll('.case-pin').forEach((b) => b.addEventListener('click', () => focusCase(+b.dataset.n)));
}

const v = new THREE.Vector3();
// Labels are spread apart so none overlap; a leader line joins each label to a
// dot at its true location on the body.
function updatePins() {
  if (!C.active || !C.cases.length) return;
  const r = pinsHost.getBoundingClientRect();
  const svg = pinsHost.querySelector('svg');
  const pts = C.cases.map((c, i) => {
    v.copy(c.pin).project(S.camera);
    return { i, vis: v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05, x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height };
  });
  // labels to the right of the body's screen centre go right, others left
  const cx = pts.filter((p) => p.vis).reduce((s, p) => s + p.x, 0) / Math.max(1, pts.filter((p) => p.vis).length);
  const placed = []; let lines = '';
  for (const p of [...pts].sort((a, b) => a.y - b.y)) {
    const el = pinsHost.querySelectorAll('.case-pin')[p.i];
    if (!p.vis) { el.style.display = 'none'; continue; }
    el.style.display = '';
    const w = el.offsetWidth, h = 26, right = p.x >= cx;
    let lx = right ? p.x + 40 : p.x - 40 - w, ly = p.y - h / 2;
    for (let k = 0; k < 60 && placed.some((q) => lx < q[0] + q[2] && lx + w > q[0] && ly < q[1] + q[3] && ly + h > q[1]); k++) ly += h + 4;
    placed.push([lx, ly, w, h]);
    el.style.transform = `translate(${lx + 13}px, ${ly + 13}px)`;
    const col = C.cases[p.i].color, ex = right ? lx : lx + w;
    lines += `<line x1="${p.x}" y1="${p.y}" x2="${ex}" y2="${ly + h / 2}" stroke="${col}" stroke-width="1.5" opacity="0.85"/><circle cx="${p.x}" cy="${p.y}" r="4.5" fill="${col}" stroke="#08111f" stroke-width="1.5"/>`;
  }
  svg.innerHTML = lines;
}
