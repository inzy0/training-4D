// Layer-by-layer 3D atlas over BodyParts3D 4.0 (CC BY 4.0, DBCLS).
// Geometry comes from atlas_data.js (shared with the scanner lens).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadAtlas, regionOf3D } from './atlas_data.js';
import { loadConditions, renderConditions, conditionCard } from './conditions.js';
import { setupCaseBody } from './case_body.js';
import { setupSurgery } from './surgery.js';
import { studio } from './look.js';
import { pointerControls, surfacePicker } from './view_controls.js';
import { initStructure, renderStructure, updateStructureLabels } from './structure.js';

const $ = (s) => document.querySelector(s);
const S = {
  atlas: null, meshes: [], byLayer: new Map(), layerState: new Map(), selected: null,
  peel: 0, explode: 0, clip: { x: 1, y: 1, z: 1 }, box: null, condState: {},
};

export async function startAtlas() {
  const status = $('#atlas-status');
  const canvas = $('#atlas-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.localClippingEnabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  studio(renderer, scene); // environment lighting shared with the Motion Lab
  const root = new THREE.Group(); scene.add(root);

  const resize = () => {
    const r = canvas.parentElement.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas.parentElement); resize();

  let atlas;
  try { atlas = await loadAtlas((m) => { status.textContent = m; }); } catch (e) { status.textContent = e.message; return; }
  S.atlas = atlas;
  const index = atlas.index;
  const planes = { x: new THREE.Plane(new THREE.Vector3(-1, 0, 0), 9), y: new THREE.Plane(new THREE.Vector3(0, -1, 0), 9), z: new THREE.Plane(new THREE.Vector3(0, 0, -1), 9) };
  const clipList = [planes.x, planes.y, planes.z];

  for (const L of index.layers) {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(L.color), roughness: L.key === 'skeleton' ? 0.5 : 0.42, metalness: 0.0, envMapIntensity: 0.9,
      side: THREE.DoubleSide, clippingPlanes: clipList, transparent: L.key === 'skin', opacity: L.key === 'skin' ? 0.35 : 1,
      depthWrite: L.key !== 'skin',
    });
    S.layerState.set(L.key, { visible: true, opacity: mat.opacity, mat, label: L.label, color: L.color });
    const group = new THREE.Group(); root.add(group); S.byLayer.set(L.key, group);
  }
  for (const { part, geometry } of atlas.parts) {
    const mesh = new THREE.Mesh(geometry, S.layerState.get(part.layer).mat);
    mesh.userData = { part, centroid: geometry.boundingSphere.center.clone() };
    S.byLayer.get(part.layer).add(mesh); S.meshes.push(mesh);
  }

  // ---- nervous system: central (brain from BodyParts3D + spinal cord fitted along this body's vertebral canal) and
  // peripheral (Z-Anatomy, CC BY-SA 4.0: spinal nerves and plexuses, cranial nerves along their course, sympathetic
  // trunks, ganglia and nerves, spinal ganglia). Shown as their own layers next to BodyParts3D's 'nerves' layer.
  S.layers = index.layers.map((L) => (L.key === 'nerves' ? { ...L, label: 'CNS: brain, brainstem, cerebellum (+ cranial nerve roots)' } : L));
  try {
    status.textContent = 'Adding the spinal cord and peripheral nerves…';
    const [{ spinalCordGeometry }, { zNerveGeoms }] = await Promise.all([import('./cord.js'), import('./znerves.js')]);
    const [cord, zs] = await Promise.all([spinalCordGeometry(atlas), zNerveGeoms(atlas)]);
    const NS = [
      ['cns_cord', 'CNS: spinal cord (open MRI, fitted to this spine)', '#f1e3b0', cord ? [{ geometry: cord, name: 'spinal cord', path: 'Central nervous system > Spinal cord (TotalSegmentator MRI s0175, CC BY 4.0)' }] : []],
      ['pns_spinal', 'PNS: spinal nerves and plexuses (Z-Anatomy)', '#ffe066', zs.filter((z) => z.group.startsWith('Spinal nerves'))],
      ['pns_cranial', 'PNS: cranial nerves, full course incl. vagus (Z-Anatomy)', '#ffd166', zs.filter((z) => z.group.startsWith('Cranial'))],
      ['pns_auto', 'PNS: autonomic, sympathetic trunk + ganglia (Z-Anatomy)', '#ff9e00', zs.filter((z) => z.group.startsWith('Autonomic'))],
      ['pns_ganglia', 'PNS: spinal (dorsal root) ganglia (Z-Anatomy)', '#ffb703', zs.filter((z) => z.group.startsWith('Spinal (dorsal'))],
    ];
    const at = S.layers.findIndex((L) => L.key === 'nerves') + 1;
    const add = [];
    for (const [key, label, color, items] of NS) {
      if (!items.length) continue;
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.4, side: THREE.DoubleSide, clippingPlanes: clipList, emissive: new THREE.Color(color), emissiveIntensity: 0.12 });
      S.layerState.set(key, { visible: true, opacity: 1, mat, label, color });
      const group = new THREE.Group(); root.add(group); S.byLayer.set(key, group);
      for (const it of items) {
        const part = { name: it.name, layer: key, id: key === 'cns_cord' ? 'MRI s0175' : 'Z-Anatomy', fma: null, vCount: it.geometry.attributes.position.count, zpath: it.path };
        const mesh = new THREE.Mesh(it.geometry, mat); mesh.userData = { part, centroid: it.geometry.boundingSphere.center.clone() };
        group.add(mesh); S.meshes.push(mesh);
      }
      add.push({ key, label, color, parts: items.length });
    }
    S.layers.splice(at, 0, ...add);
    S.nsInfo = add.map((a) => `${a.label}: ${a.parts}`);
  } catch (e) { console.error('nervous system layers', e); }

  S.box = atlas.box.clone();
  const size = S.box.getSize(new THREE.Vector3()), mid = S.box.getCenter(new THREE.Vector3());
  const front = atlas.anchors.anterior;
  camera.position.set(mid.x, mid.y + size.y * 0.05, mid.z + front * size.y * 1.9); controls.target.copy(mid); controls.update();
  const setClip = () => {
    planes.x.constant = S.box.min.x + S.clip.x * size.x + 1e-4;
    planes.y.constant = S.box.min.y + S.clip.y * size.y + 1e-4;
    planes.z.constant = S.box.min.z + S.clip.z * size.z + 1e-4;
  };
  setClip();
  status.textContent = `${S.meshes.length.toLocaleString()} structures · drag to rotate, scroll to zoom, right-drag to pan`;

  buildLayerUI();
  for (const ax of ['x', 'y', 'z']) $(`#clip-${ax}`).addEventListener('input', (e) => { S.clip[ax] = e.target.value / 1000; setClip(); });
  $('#peel').max = S.layers.length - 1;
  $('#peel').addEventListener('input', (e) => { S.peel = +e.target.value; $('#peel-val').textContent = S.peel; applyVisibility(); });
  addExplodeControl();
  setupSearch();
  setupPicking(renderer, camera);
  S.camera = camera; S.controls = controls; S.clipList = clipList; S.scene = scene;
  window.__atlas = { S, select: (name) => { const m = S.meshes.find((x) => x.userData.part.name === name); if (m) select(m); return !!m; } };
  initStructure(S);
  setupViews();
  const D = await loadConditions();
  setupClasses(D);
  S.applyClasses = applyClasses; S.syncClassBoxes = syncClassBoxes; S.applyVisibility = applyVisibility;
  setupCaseBody(S, D);
  setupSurgery(S);

  const pc = pointerControls({ controls, camera, canvas, pick: surfacePicker(camera, canvas, () => S.meshes.filter((m) => m.parent.visible && m.visible), insideClip) });
  pc.setHome(); S.pc = pc;
  renderer.setAnimationLoop(() => { pc.tick(); controls.update(); renderer.render(scene, camera); S.onFrame?.(); updateStructureLabels(); });
  S.focus = (mesh) => {
    const c = mesh.geometry.boundingSphere.center.clone().add(mesh.position);
    const r = Math.max(0.03, mesh.geometry.boundingSphere.radius);
    const dir = camera.position.clone().sub(controls.target).normalize();
    controls.target.copy(c); camera.position.copy(c.clone().add(dir.multiplyScalar(r * 4.5)));
  };
  S.focusMeshes = (list) => {
    const b = new THREE.Box3(); list.forEach((m) => b.expandByObject(m)); if (b.isEmpty()) return;
    const c = b.getCenter(new THREE.Vector3()), r = Math.max(0.04, b.getSize(new THREE.Vector3()).length() / 2);
    const dir = camera.position.clone().sub(controls.target).normalize();
    controls.target.copy(c); camera.position.copy(c.clone().add(dir.multiplyScalar(r * 3.2)));
  };
}

function buildLayerUI() {
  const host = $('#atlas-layers');
  host.innerHTML = '';
  if (S.layers.some((L) => /^(cns|pns)_/.test(L.key))) {
    const b = document.createElement('div'); b.className = 'btnrow';
    b.innerHTML = '<button class="ghost-btn" id="ns-view">🧠 Nervous system view (CNS + PNS, faded skeleton)</button>';
    host.appendChild(b);
    b.querySelector('#ns-view').onclick = () => {
      S.layerState.forEach((st, k) => { st.visible = /^(nerves|cns_|pns_|skeleton)/.test(k); });
      const sk = S.layerState.get('skeleton'); if (sk) { sk.opacity = 0.22; sk.mat.opacity = 0.22; sk.mat.transparent = true; sk.mat.depthWrite = false; sk.mat.needsUpdate = true; }
      S.peel = 0; $('#peel').value = 0; $('#peel-val').textContent = 0; buildLayerUI(); applyVisibility();
    };
  }
  S.layers.forEach((L, i) => {
    const st = S.layerState.get(L.key);
    const row = document.createElement('div'); row.className = 'layer-row';
    row.innerHTML = `<input type="checkbox" ${st.visible ? 'checked' : ''} aria-label="Show ${L.label}">
      <span><span class="sw" style="display:inline-block;background:${L.color}"></span> ${i}. ${L.label} <small>${L.parts}</small></span>
      <input type="range" min="0" max="100" value="${Math.round(st.opacity * 100)}" aria-label="${L.label} opacity">
      <button class="ghost-btn" title="Show only this layer">Solo</button>`;
    const [chk, , rng, solo] = row.children;
    chk.addEventListener('change', () => { st.visible = chk.checked; applyVisibility(); });
    rng.addEventListener('input', () => {
      st.opacity = rng.value / 100; st.mat.opacity = st.opacity; st.mat.transparent = st.opacity < 1; st.mat.depthWrite = st.opacity >= 0.95; st.mat.needsUpdate = true;
    });
    solo.addEventListener('click', () => {
      S.layerState.forEach((s, k) => { s.visible = k === L.key; }); S.peel = 0; $('#peel').value = 0; $('#peel-val').textContent = 0; buildLayerUI(); applyVisibility();
    });
    host.appendChild(row);
  });
}

function applyVisibility() {
  const classView = (S.classOn && S.classOn.size > 0) || S.case?.active;
  S.layers.forEach((L, i) => { S.byLayer.get(L.key).visible = classView || (S.layerState.get(L.key).visible && i >= S.peel); });
}

// ------------------------------------------------------------------ views
function setupViews() {
  const A = S.atlas.anchors;
  const dirs = { Front: [0, 0, A.anterior], Back: [0, 0, -A.anterior], 'Subject left': [A.leftX, 0, 0], 'Subject right': [-A.leftX, 0, 0], Top: [0, 1, 0.001 * A.anterior] };
  $('#atlas-views').innerHTML = Object.keys(dirs).map((k) => `<button class="ghost-btn" data-view="${k}">${k}</button>`).join('');
  $('#atlas-views').insertAdjacentHTML('afterend', `<label class="fine" style="display:block;margin-top:6px"><input type="checkbox" id="atlas-viewlabels"> Label everything in view <small>(largest on screen first; zoom in for more)</small></label>`);
  $('#atlas-viewlabels').onchange = (e) => { S.viewLabels = e.target.checked; if (!S.viewLabels) $('#atlas-vlabels').innerHTML = ''; };
  $('#atlas-views').querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
    const d = new THREE.Vector3(...dirs[b.dataset.view]).normalize();
    const dist = S.camera.position.distanceTo(S.controls.target);
    S.camera.position.copy(S.controls.target).addScaledVector(d, dist);
    S.camera.up.set(0, 1, 0); S.controls.update();
  }));
}

// ------------------------------------------------------------------ disease classes
function setupClasses(D) {
  const host = $('#atlas-classes');
  if (!D?.classes) { host.innerHTML = '<p class="muted">Run tools/anatomy_lab_conditions.py to build disease classes.</p>'; return; }
  S.D = D; S.classOn = new Set(); S.classMats = {};
  const byId = new Map(S.meshes.map((m) => [m.userData.part.id, m]));
  S.partClasses = new Map(); // part id -> class keys, specific first
  for (const c of D.classes) {
    // outer classes are see-through so inner classes stay visible when several are on
    const see = { skin: 0.12, muscle: 0.35 }[c.key];
    S.classMats[c.key] = new THREE.MeshStandardMaterial({ color: c.color, emissive: c.color, emissiveIntensity: 0.25, roughness: 0.45, side: THREE.DoubleSide, clippingPlanes: S.clipList,
      transparent: !!see, opacity: see || 1, depthWrite: !see });
    for (const id of c.parts) { if (!S.partClasses.has(id)) S.partClasses.set(id, []); S.partClasses.get(id).push(c.key); }
    c.meshes = c.parts.map((id) => byId.get(id)).filter(Boolean);
  }
  S.ghostMat = new THREE.MeshStandardMaterial({ color: 0x8fb3d9, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide, clippingPlanes: S.clipList });
  host.innerHTML = D.classes.map((c) => `<label class="cls-row"><input type="checkbox" data-cls="${c.key}">
    <span class="sw" style="background:${c.color}"></span><span>${esc(c.label)}</span>
    <small title="conditions in MeSH / structures on the model">${c.n_conditions} · ${c.parts.length}</small></label>`).join('');
  host.querySelectorAll('[data-cls]').forEach((el) => el.addEventListener('change', () => {
    el.checked ? S.classOn.add(el.dataset.cls) : S.classOn.delete(el.dataset.cls); S.userPool = new Set(S.classOn); applyClasses();
  }));
  $('#cls-all').onclick = () => { D.classes.forEach((c) => S.classOn.add(c.key)); S.userPool = new Set(S.classOn); syncClassBoxes(); applyClasses(); };
  $('#cls-none').onclick = () => { S.classOn.clear(); S.userPool = new Set(); syncClassBoxes(); applyClasses(); $('#atlas-random-card').innerHTML = ''; };
  $('#cls-ghost').addEventListener('change', applyClasses);
  $('#cls-random').onclick = randomCondition;
}

function syncClassBoxes() { document.querySelectorAll('[data-cls]').forEach((el) => { el.checked = S.classOn.has(el.dataset.cls); }); }

function applyClasses() {
  if (S.case?.active) {
    if (!S.classOn.size) return; // case body owns the colours
    S.case.active = false; S.case.cases = []; $('#case-pins').innerHTML = ''; $('#case-legend').innerHTML = '';
  }
  const ghost = $('#cls-ghost').checked;
  for (const m of S.meshes) {
    if (m === S.selected) continue;
    const base = m.userData.baseMat || S.layerState.get(m.userData.part.layer).mat;
    if (!S.classOn.size) { m.material = base; continue; }
    const k = (S.partClasses.get(m.userData.part.id) || []).find((x) => S.classOn.has(x));
    m.material = k ? S.classMats[k] : ghost ? S.ghostMat : base;
  }
  applyVisibility();
}

// crypto RNG: headless Chrome seeds Math.random identically per launch
const rnd = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;

function randomCondition() {
  const D = S.D; if (!D) return;
  const chosen = S.userPool || new Set(); // classes the user ticked; none ticked = all
  const pool = D.classes.filter((c) => (!chosen.size || chosen.has(c.key)) && c.meshes.length);
  const onlyMp = $('#cls-mp').checked;
  for (let tries = 0; tries < 50; tries++) {
    const c = pool[rnd(pool.length)];
    const members = [...new Set(c.roots.flatMap((r) => D.roots[r]?.members || []))].filter((u) => !onlyMp || D.nodes[u].mp.length);
    if (!members.length) continue;
    const ui = members[rnd(members.length)];
    // show it on the most specific class whose MeSH branch holds it (classes are listed specific-first)
    const cls = D.classes.find((k) => k.meshes.length && k.roots.some((r) => D.roots[r]?.members.includes(ui))) || c;
    S.classOn = new Set([cls.key]); syncClassBoxes(); applyClasses();
    // frame the class's structures
    const box = new THREE.Box3(); cls.meshes.forEach((m) => box.expandByObject(m));
    const ctr = box.getCenter(new THREE.Vector3()), r = Math.max(0.08, box.getSize(new THREE.Vector3()).length() / 2);
    const dir = S.camera.position.clone().sub(S.controls.target).normalize();
    S.controls.target.copy(ctr); S.camera.position.copy(ctr).addScaledVector(dir, r * 3.2); S.controls.update();
    $('#atlas-random-card').innerHTML = `
      <p class="fine" style="margin-top:8px">Random draw · class <b style="color:${cls.color}">${esc(cls.label)}</b> · shown on ${cls.meshes.length} structure${cls.meshes.length === 1 ? "" : "s"} (${esc(cls.targets_from.join(", "))})</p>
      ${conditionCard(ui, D.nodes[ui], true)}
      <p class="fine">A teaching example drawn at random from MeSH. Not a patient case: the model shows where this class of disease occurs, not a lesion.</p>`;
    return;
  }
  $('#atlas-random-card').innerHTML = '<p class="muted">No condition in the selected classes matches. Untick "only with a MedlinePlus summary".</p>';
}

function addExplodeControl() {
  const card = $('#peel').closest('.card');
  const lab = document.createElement('label'); lab.className = 'slider';
  lab.innerHTML = 'Explode <input id="explode" type="range" min="0" max="100" value="0"> <b id="explode-val">0</b>';
  card.appendChild(lab);
  const body = S.box.getCenter(new THREE.Vector3());
  const front = S.atlas.anchors.anterior;
  lab.querySelector('input').addEventListener('input', (e) => {
    S.explode = e.target.value / 100; $('#explode-val').textContent = e.target.value;
    // Each part moves away from the body axis; outer layers also move toward the viewer.
    S.layers.forEach((L, li) => {
      S.byLayer.get(L.key).children.forEach((m) => {
        const c = m.userData.centroid; const d = new THREE.Vector3(c.x - body.x, 0, c.z - body.z);
        m.position.copy(d.multiplyScalar(S.explode * 0.9)).add(new THREE.Vector3(0, 0, front * (S.layers.length - li) * S.explode * 0.08));
      });
    });
  });
}

function setupSearch() {
  const input = $('#atlas-search'), list = $('#atlas-results');
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase(); list.innerHTML = '';
    if (q.length < 2) return;
    const seen = new Set();
    for (const m of S.meshes) {
      const n = m.userData.part.name; if (!n.toLowerCase().includes(q) || seen.has(n)) continue; seen.add(n);
      const li = document.createElement('li'); li.textContent = n; li.onclick = () => { select(m); S.focus(m); };
      list.appendChild(li); if (seen.size >= 40) break;
    }
  });
}

function setupPicking(renderer, camera) {
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), tip = $('#atlas-pick');
  const canvas = renderer.domElement;
  let down = null, last = 0;
  const pick = (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const vis = S.meshes.filter((m) => m.parent.visible && m.visible);
    const hits = ray.intersectObjects(vis, false).filter((h) => insideClip(h.point));
    pick.lastPoint = hits[0]?.point || null;
    return hits[0]?.object || null;
  };
  canvas.addEventListener('pointermove', (e) => {
    const now = performance.now(); if (now - last < 60) return; last = now;
    const m = pick(e); const r = canvas.getBoundingClientRect();
    if (m) { tip.hidden = false; tip.textContent = m.userData.part.name; tip.style.left = `${e.clientX - r.left}px`; tip.style.top = `${e.clientY - r.top}px`; } else tip.hidden = true;
  });
  canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
    const m = pick(e); if (m && pick.lastPoint && S.onPickPoint?.(pick.lastPoint)) return; if (m) { if ((e.ctrlKey || e.metaKey || e.shiftKey || S.addMode) && S.focusSet?.size) { S.focusSet.add(m); applyFocus(); } select(m); }
  });
  // double-click: handled by pointerControls (fly to the point under the pointer)
}

function insideClip(p) {
  const s = S.box.getSize(new THREE.Vector3());
  return p.x <= S.box.min.x + S.clip.x * s.x + 1e-3 && p.y <= S.box.min.y + S.clip.y * s.y + 1e-3 && p.z <= S.box.min.z + S.clip.z * s.z + 1e-3;
}

export function meshLinkHtml(p) {
  const m = p.mesh;
  return m ? `<a href="https://meshb.nlm.nih.gov/record/ui?ui=${m.ui}" target="_blank" rel="noopener">${esc(m.name)} (${m.ui})</a> <small>${m.match === 'entry_term' ? `“${esc(m.term)}” is an entry term NLM files under this broader descriptor` : 'exact descriptor name'}</small>` : '<span class="muted">No exact MeSH match</span>';
}

// ---- focus set: isolate / fade / reverse several structures, optionally with the structures near them
Object.assign(S, { focusSet: new Set(), fsMode: 'isolate', fsNear: false, fsR: 15, fsOp: 0.08, addMode: false });
function renderFocusList() {
  const el = document.querySelector('#fs-list'), n = document.querySelector('#fs-n'); if (!el) return;
  n.textContent = `${S.focusSet.size} selected${S.fsNearN ? ` · ${S.fsNearN} nearby shown` : ''}`;
  el.innerHTML = [...S.focusSet].map((m, i) => `<span class="cl-tag">${esc(m.userData.part.name)} <a href="#" data-fsrm="${i}">✕</a></span>`).join(' ');
  el.querySelectorAll('[data-fsrm]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); S.focusSet.delete([...S.focusSet][+a.dataset.fsrm]); applyFocus(); }));
}
function applyFocus() {
  const set = S.focusSet, on = set.size > 0;
  S.fadeMat = S.fadeMat || S.ghostMat.clone(); S.fadeMat.opacity = S.fsOp;
  // nearby: bounding-sphere surfaces within fsR mm of any selected structure's bounding sphere (atlas units are metres)
  const near = new Set();
  if (on && S.fsNear) {
    const r = S.fsR / 1000, sel = [...set].map((m) => m.geometry.boundingSphere);
    for (const m of S.meshes) { if (set.has(m)) continue; const b = m.geometry.boundingSphere; if (sel.some((s) => s.center.distanceTo(b.center) - s.radius - b.radius < r)) near.add(m); }
  }
  S.fsNearN = near.size;
  for (const m of S.meshes) {
    const base = m === S.selected ? m.material : (m.userData.baseMat || S.layerState.get(m.userData.part.layer).mat);
    if (!on) { m.visible = S.layerState.get(m.userData.part.layer)?.visible !== false; if (m !== S.selected) m.material = base; continue; }
    const inSet = set.has(m), isNear = near.has(m);
    if (S.fsMode === 'reverse') { m.visible = !inSet; if (m !== S.selected) m.material = base; continue; }
    if (inSet || isNear) { m.visible = true; if (m !== S.selected) m.material = base; continue; }
    if (S.fsMode === 'isolate') m.visible = false; else { m.visible = true; m.material = S.fadeMat; }
  }
  renderFocusList();
}

async function select(mesh) {
  if (S.selected) { const prev = S.selected; S.selected = null; prev.material = prev.userData.baseMat; if (S.classOn?.size) applyClasses(); }
  S.selected = mesh;
  mesh.userData.baseMat = mesh.userData.baseMat || S.layerState.get(mesh.userData.part.layer).mat;
  const hl = mesh.userData.baseMat.clone(); hl.emissive = new THREE.Color(0x3fa9ff); hl.emissiveIntensity = 0.65; hl.opacity = 1; hl.transparent = false; hl.depthWrite = true;
  mesh.material = hl;
  const p = mesh.userData.part, L = S.layerState.get(p.layer);
  const region = regionOf3D(mesh.geometry.boundingSphere.center, S.atlas.anchors);
  const mesh_ = p.mesh;
  $('#atlas-info').innerHTML = `
    <h3 style="margin:0 0 6px;font-size:15px">${esc(p.name)}</h3>
    <dl class="kv">
      <dt>Layer</dt><dd><span class="sw" style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${L.color}"></span> ${esc(L.label)}</dd>
      <dt>Region</dt><dd>${esc(region.replace('_', ' '))} <small>from position</small></dd>
      <dt>FMA</dt><dd class="mono">${esc(p.fma || '—')}</dd>
      <dt>Mesh</dt><dd class="mono">${esc(p.id)} · ${p.vCount.toLocaleString()} vertices</dd>
      <dt>MeSH</dt><dd>${meshLinkHtml(p)}</dd>
      ${p.zpath ? `<dt>Source</dt><dd class="fine">${esc(p.zpath)}${p.id === 'Z-Anatomy' ? '<br><small>BodyParts3D - The Database Center for Life Science - CC-BY-SA 2.1 Japan · Z-Anatomy - The libre 3D atlas of anatomy - CC-BY-SA 4.0</small>' : ''}</dd>` : ''}
    </dl>
    ${mesh_?.scope_note ? `<p class="fine" style="color:#c9dcf2">${esc(mesh_.scope_note)} <i>(MeSH scope note, NLM)</i></p>` : ''}
    <p style="margin-top:8px"><button class="ghost-btn" id="act-focus">Fly to</button> <button class="ghost-btn" id="act-iso">Isolate</button> <button class="ghost-btn" id="act-add">+ Add to set</button> <button class="ghost-btn" id="act-hide">Hide</button> <button class="ghost-btn" id="act-all">Show all</button></p>
    <div class="fs-box"><b class="fine">Focus set</b> <span class="fine" id="fs-n">${S.focusSet?.size || 0} selected</span>
      <div class="fs-modes">${[['isolate', 'Isolate (hide others)'], ['fade', 'Fade others'], ['reverse', 'Reverse (hide selected)']].map(([k, v]) => `<label class="fine"><input type="radio" name="fs-mode" value="${k}" ${S.fsMode === k ? 'checked' : ''}> ${v}</label>`).join('')}</div>
      <label class="fine"><input type="checkbox" id="fs-near" ${S.fsNear ? 'checked' : ''}> Allow nearby structures, within <input type="range" id="fs-r" min="2" max="80" value="${S.fsR}" style="width:90px"> <span id="fs-rv">${S.fsR}</span> mm</label>
      <label class="fine"><input type="range" id="fs-op" min="0" max="60" value="${Math.round(S.fsOp * 100)}" style="width:90px"> faded opacity <span id="fs-opv">${Math.round(S.fsOp * 100)}</span>%</label>
      <label class="fine"><input type="checkbox" id="fs-addmode" ${S.addMode ? 'checked' : ''}> Each click adds to the set (or Ctrl/Shift-click)</label>
      <p class="fine" id="fs-list"></p><button class="ghost-btn" id="fs-clear">Clear set</button></div>
    <h2 style="margin-top:12px">Structure explorer</h2><div id="atlas-structure"></div>
    <h2 style="margin-top:12px">Conditions</h2><div id="atlas-conditions" class="conds"></div>`;
  $('#act-focus').onclick = () => S.focus(mesh);
  $('#act-iso').onclick = () => { S.focusSet = new Set([mesh]); applyFocus(); };
  $('#act-add').onclick = () => { (S.focusSet ||= new Set()).add(mesh); applyFocus(); };
  document.querySelectorAll('[name=fs-mode]').forEach((r) => (r.onchange = () => { S.fsMode = r.value; applyFocus(); }));
  $('#fs-near').onchange = (e) => { S.fsNear = e.target.checked; applyFocus(); };
  $('#fs-r').oninput = (e) => { S.fsR = +e.target.value; $('#fs-rv').textContent = S.fsR; applyFocus(); };
  $('#fs-op').oninput = (e) => { S.fsOp = +e.target.value / 100; $('#fs-opv').textContent = e.target.value; applyFocus(); };
  $('#fs-addmode').onchange = (e) => { S.addMode = e.target.checked; };
  $('#fs-clear').onclick = () => { S.focusSet = new Set(); applyFocus(); };
  renderFocusList();
  $('#act-hide').onclick = () => { mesh.visible = false; };
  $('#act-all').onclick = () => { S.focusSet = new Set(); applyFocus(); S.meshes.forEach((m) => { m.visible = true; }); };
  renderStructure(mesh);
  renderConditions($('#atlas-conditions'), await loadConditions(), region, /^(cns|pns)_/.test(p.layer) ? 'nerves' : p.layer, S.condState);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
