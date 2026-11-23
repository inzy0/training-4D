// Brain map: BodyParts3D brain structures (by lobe / system), cranial nerves,
// cerebral arteries and skull for context, plus 87 white-matter tracts and the
// tract-to-region connectome of the HCP1065 population atlas (Yeh 2022,
// CC BY-SA 4.0; HCP acknowledgement required).
//
// The tract atlas lives in MNI space; it is placed on the reference body's
// brain by matching the bounding box of the cerebral tracts to the bounding
// box of BodyParts3D's cerebral white matter, axis by axis (an approximate fit,
// stated in the panel). Fibre-direction colours use the usual diffusion-MRI
// convention: red = left-right, green = front-back, blue = up-down.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadAtlas } from './atlas_data.js';
import { studio } from './look.js';
import { pointerControls, surfacePicker } from './view_controls.js';
import { aboutHtml } from './structure.js';
import { setupAutonomic, autonomicPanel, organHtml } from './autonomic.js';
import { setupSpinal, spinalPanel, spinalLabels } from './spinal.js';
import { setupZNerves, zCheck } from './znerves.js';
import { setupPathways } from './pathways.js';
import { setupNeurochem, neurochemPanel, regionCard, G_NET } from './neurochem.js';
import { areasPanel } from './areas.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const GROUPS = [
  ['Frontal lobe', /frontal gyrus|precentral/, '#ff8fab'], ['Parietal lobe', /postcentral|parietal lobule|supramarginal|angular gyrus/, '#ffd166'],
  ['Temporal lobe', /temporal gyrus|fusiform/, '#06d6a0'], ['Occipital lobe', /occipital lobe/, '#4cc9f0'],
  ['Limbic system', /cingulate|hippocamp|parahippocampal/, '#b388ff'], ['Insula', /\binsula\b/, '#f78c6b'],
  ['Deep grey matter and midbrain', /hypothalamus|habenula|pineal|tuber cinereum|colliculus|internal capsule/, '#e9ff70'],
  ['Ventricles (CSF)', /ventricle|aqueduct/, '#5fa8ff'], ['Cerebral white matter', /white matter of/, '#e8eef5'],
  ['Brainstem and cerebellum', /^cerebellum$|segment of metencephalon|segment of hindbrain/, '#90e0ef'],
  ['Basal ganglia, thalamic and limbic nuclei', /caudate nucleus|putamen|globus pallidus|amygdala|mammillary body|geniculate body|stria terminalis|fornix|septum of telencephalon|anterior commissure|posterior commissure|peduncle of midbrain|stria medullaris|lamina terminalis|corpus callosum|brachium of .* colliculus/, '#ff70a6'],
];
// BodyParts3D stores the pons and medulla under generic concept names (checked in isa_element_parts.txt)
const DNAME = { 'segment of metencephalon': 'pons (BodyParts3D: segment of metencephalon)', 'segment of hindbrain': 'medulla oblongata (BodyParts3D: segment of hindbrain)' };
async function selectOrgan(org) {
  B.selMesh = null; applyAll();
  B.pc.flyTo(org.center, 0.35);
  $('#br-info').innerHTML = organHtml(B, org) + '<div class="st-about"><p class="fine muted">Loading…</p></div>';
  $('#br-info .st-about').innerHTML = await aboutHtml(org.meshes[0].userData.part.name);
}
const CORTEX = new Set(['Frontal lobe', 'Parietal lobe', 'Temporal lobe', 'Occipital lobe', 'Insula', 'Cerebral white matter']);
const NERVE_RE = /optic|oculomotor|trochlear|trochlear|supratrochlear|infratrochlear|trigeminal|abducens|facial nerve|vestibulocochlear|glossopharyngeal|vagus|hypoglossal|olfactory/;
const ART_RE = /cerebral artery|basilar|vertebral artery|communicating artery|internal carotid|choroidal|pontine|cerebellar artery|ophthalmic artery|frontobasal|occipital artery|callosomarginal|pericallosal/;
const SKULL_RE = /^(frontal bone|occipital bone|sphenoid bone|ethmoid|(left|right) (parietal|temporal) bone)$/;
const PAL = ['#ff5d8f', '#4cc9f0', '#ffd166', '#06d6a0', '#f78c6b', '#b388ff', '#90e0ef', '#e9ff70', '#ff9e00', '#80ffdb', '#ff70a6', '#70d6ff'];
const CAT_COL = { Association: '#4cc9f0', Projection: '#ff8fab', Commissural: '#ffd166', Cerebellum: '#06d6a0', 'Cranial Nerves': '#f78c6b' };

const B = { meshes: [], groups: new Map(), tracts: [], selTract: null, selRegion: null, explode: 0, clip: { x: 1, y: 1, z: 1 } };

export async function startBrain() {
  const status = $('#brain-status'), canvas = $('#brain-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.localClippingEnabled = true;
  const scene = new THREE.Scene(); studio(renderer, scene);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.002, 20);
  const controls = new OrbitControls(camera, canvas); controls.enableDamping = true;
  Object.assign(B, { renderer, scene, camera, controls });
  const resize = () => { const r = canvas.parentElement.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); };
  new ResizeObserver(resize).observe(canvas.parentElement); resize();

  let atlas; try { atlas = await loadAtlas((m) => { status.textContent = m; }); } catch (e) { status.textContent = e.message; return; }
  B.atlas = atlas;
  status.textContent = 'Loading tracts and connectome…';
  const [TJ, bin, CON] = await Promise.all([
    fetch('/training-4D/rt/brain/tracts.json').then((r) => r.json()), fetch('/training-4D/rt/brain/tracts.bin').then((r) => r.arrayBuffer()), fetch('/training-4D/rt/brain/connectome.json').then((r) => r.json()),
  ]);
  B.TJ = TJ; B.CON = CON;
  // brain membership from the BodyParts3D part-of tree (a name pattern alone caught the heart's ventricles)
  const parent = (await (await fetch('/training-4D/rt/atlas/partof.json')).json()).parent;
  const inBrain = (n) => { for (let k = 0; k < 14 && n; k++) { n = parent[n]; if (n === 'brain' || n === 'encephalon') return true; } return false; };
  B.planes = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), 9), new THREE.Plane(new THREE.Vector3(0, -1, 0), 9), new THREE.Plane(new THREE.Vector3(0, 0, -1), 9)];

  // ---- brain structures, nerves, arteries, skull
  const root = new THREE.Group(); scene.add(root);
  const grpOf = (n) => GROUPS.find(([, re]) => re.test(n));
  for (const { part, geometry } of atlas.parts) {
    const n = part.name; let kind = null, color = null, gname = null;
    const g = grpOf(n);
    if (g && (inBrain(n) || part.layer === 'nerves')) { kind = 'brain'; gname = g[0]; color = g[2]; }
    else if (NERVE_RE.test(n) && (part.layer === 'nerves')) { kind = 'nerve'; color = '#ffe14d'; gname = 'Cranial nerves'; }
    else if (ART_RE.test(n) && part.layer === 'arteries') { kind = 'artery'; color = '#ff3b4e'; gname = 'Cerebral arteries'; }
    else if (SKULL_RE.test(n)) { kind = 'skull'; color = '#d9d4c7'; gname = 'Skull'; }
    if (!kind) continue;
    const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, clearcoat: 0.3, side: THREE.DoubleSide, clippingPlanes: B.planes, transparent: true, opacity: kind === 'skull' ? 0.18 : 1, depthWrite: kind !== 'skull' });
    const m = new THREE.Mesh(geometry, mat); m.userData = { part, kind, group: gname, color, base: geometry.boundingSphere.center.clone(), dname: DNAME[n] || n };
    root.add(m); B.meshes.push(m);
    if (!B.groups.has(gname)) B.groups.set(gname, []); B.groups.get(gname).push(m);
  }
  // brain bounding box (cerebral white matter) and centre
  const wm = new THREE.Box3(); (B.groups.get('Cerebral white matter') || B.meshes.filter((m) => m.userData.kind === 'brain')).forEach((m) => wm.expandByObject(m));
  const brainBox = new THREE.Box3(); B.meshes.filter((m) => m.userData.kind === 'brain').forEach((m) => brainBox.expandByObject(m));
  B.center = brainBox.getCenter(new THREE.Vector3()); B.box = brainBox;
  // spinal cord, organs and the autonomic schematic (below the brain; not clipped, not exploded)
  try { B.autoInfo = await setupAutonomic(B, atlas, root); } catch (e) { console.error('autonomic layer', e); }
  try { B.zInfo = await setupZNerves(B, atlas, root); } catch (e) { console.error('Z-Anatomy nerves', e); }
  try { B.spinalInfo = await setupSpinal(B, atlas, root); } catch (e) { console.error('spinal layer', e); }
  if (B.zInfo) { B.zCheck = zCheck(B); if (B.zxs && B.levelAtY) B.zxsLevel = B.levelAtY(B.zxs.centre.y); }

  // ---- tracts: MNI (RAS mm) -> atlas by per-axis bounding-box fit of cerebral tracts to cerebral white matter
  const A = atlas.anchors, I16 = new Int16Array(bin), NP = TJ.n_pts;
  const mniBox = { lo: [1e9, 1e9, 1e9], hi: [-1e9, -1e9, -1e9] };
  for (const t of TJ.tracts) {
    if (!/Association|Commissural/.test(t.category)) continue;
    const a = new Int16Array(bin, t.offset, t.lines * NP * 3);
    for (let i = 0; i < a.length; i += 3) for (let k = 0; k < 3; k++) { const v = a[i + k] / 10; if (v < mniBox.lo[k]) mniBox.lo[k] = v; if (v > mniBox.hi[k]) mniBox.hi[k] = v; }
  }
  // atlas axes for MNI x (right), y (anterior), z (superior)
  const ax = [{ i: 0, s: -A.leftX }, { i: 2, s: A.anterior }, { i: 1, s: 1 }];
  const fit = ax.map(({ i, s }, k) => {
    const lo = [wm.min.x, wm.min.y, wm.min.z][i], hi = [wm.max.x, wm.max.y, wm.max.z][i];
    const sc = (hi - lo) / (mniBox.hi[k] - mniBox.lo[k]);
    return { i, s, sc, off: s > 0 ? lo - mniBox.lo[k] * sc : hi + mniBox.lo[k] * sc };
  });
  B.fit = fit;
  const toAtlas = (x, y, z, out) => { const v = [x, y, z]; out[0] = out[1] = out[2] = 0; fit.forEach((f, k) => { out[f.i] = f.s > 0 ? f.off + v[k] * f.sc : f.off - v[k] * f.sc; }); return out; };
  const tg = new THREE.Group(); scene.add(tg); B.tractGroup = tg;
  TJ.tracts.forEach((t, ti) => {
    const a = new Int16Array(bin, t.offset, t.lines * NP * 3), segs = t.lines * (NP - 1);
    const pos = new Float32Array(segs * 6), dir = new Float32Array(segs * 6), o = [0, 0, 0], o2 = [0, 0, 0]; let w = 0;
    for (let l = 0; l < t.lines; l++) for (let p = 0; p < NP - 1; p++) {
      const b = (l * NP + p) * 3, x1 = a[b] / 10, y1 = a[b + 1] / 10, z1 = a[b + 2] / 10, x2 = a[b + 3] / 10, y2 = a[b + 4] / 10, z2 = a[b + 5] / 10;
      toAtlas(x1, y1, z1, o); toAtlas(x2, y2, z2, o2); pos.set(o, w); pos.set(o2, w + 3);
      const d = Math.hypot(x2 - x1, y2 - y1, z2 - z1) || 1, c = [Math.abs(x2 - x1) / d, Math.abs(y2 - y1) / d, Math.abs(z2 - z1) / d];
      dir.set(c, w); dir.set(c, w + 3); w += 6;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(dir.slice(), 3));
    geo.userData.dir = dir;
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, clippingPlanes: B.planes, depthWrite: false });
    const L = new THREE.LineSegments(geo, mat); L.userData = { tract: t, idx: ti }; tg.add(L); B.tracts.push(L);
  });

  // camera
  const r = brainBox.getSize(new THREE.Vector3()).length();
  camera.position.copy(B.center.clone().add(new THREE.Vector3(r * 0.9 * -A.leftX, r * 0.35, r * 0.9 * A.anterior))); controls.target.copy(B.center); controls.update();
  B.pc = pointerControls({ controls, camera, canvas, pick: surfacePicker(camera, canvas, () => B.meshes.filter((m) => m.visible)) }); B.pc.setHome();

  try { B.ncInfo = await setupNeurochem(B, root, toAtlas); } catch (e) { console.error('neurochem', e); }
  buildUI(); autonomicPanel(B, selectOrgan); applyAll(); setupPicking(canvas);
  areasPanel(B, { select: (m) => { // make it visible, fly to it, select it (card + region card)
    const cb = document.querySelector(`[data-grp="${m.userData.group}"]`); if (cb && !cb.checked) { cb.checked = true; applyAll(); }
    m.visible = true; m.geometry.computeBoundingSphere(); B.pc.flyTo(m.geometry.boundingSphere.center.clone(), Math.max(0.08, m.geometry.boundingSphere.radius * 6));
    if (B.selMesh !== m) selectMesh(m);
  } });
  neurochemPanel(B, {
    cortex: (mode) => { // normal / ghost / hide / scatter the cerebral cortex so deep structures can be seen
      const cortexGroups = new Set(['Frontal lobe', 'Parietal lobe', 'Temporal lobe', 'Occipital lobe', 'Insula', 'Limbic system', 'Cerebral white matter']);
      document.querySelectorAll('[data-grp]').forEach((c) => { if (cortexGroups.has(c.dataset.grp)) c.checked = mode !== 'hide'; });
      $('#br-cortex').value = mode === 'ghost' ? 12 : 100; $('#br-explode').value = mode === 'scatter' ? 60 : 0; applyAll();
    },
    showGroup: (g) => { const cb = document.querySelector(`[data-grp="${g}"]`); if (cb && !cb.checked) { cb.checked = true; applyAll(); } },
    onShow: () => { // focus view: labels off, peripheral nerve layers off, cortex ghosted, so nuclei and live routes are visible
      $('#br-labels').checked = false;
      document.querySelectorAll('[data-grp]').forEach((c) => { if (/Z-Anatomy|Cranial nerves|Organs|Vertebral|Pelvis|Rib cage|Skull|arteries/.test(c.dataset.grp)) c.checked = false; });
      document.querySelectorAll('[data-tr]').forEach((c) => { c.checked = false; });
      $('#br-cortex').value = 12; applyAll();
    },
  });
  setupPathways(B, scene, { showTracts: (Ls) => { Ls.forEach((L) => { const cb = document.querySelector(`[data-tr="${L.userData.idx}"]`); if (cb) cb.checked = true; }); applyAll(); } }).catch((e) => console.error('pathways', e));
  spinalPanel(B, {
    isolate: () => {
      const keep = new Set(['Spinal cord', 'Vertebral column', 'Pelvis', 'Brainstem and cerebellum', 'Sympathetic trunk + ganglia (Z-Anatomy)', 'Spinal ganglia (Z-Anatomy)', 'Cord cross-section: tracts (Z-Anatomy)', 'Cord cross-section enlarged ×6']);
      document.querySelectorAll('[data-grp]').forEach((c) => { c.checked = keep.has(c.dataset.grp); });
      document.querySelectorAll('[data-tr],[data-fam]').forEach((c) => { c.checked = false; });
      const cut = $('#br-cut'); if (cut && !cut.checked) { cut.checked = true; cut.dispatchEvent(new Event('change')); }
      $('#br-labels').checked = false; applyAll();
      const A = B.atlas.anchors, mid = B.along(0.5), len = B.canal.len;
      B.camera.position.copy(mid.clone().add(new THREE.Vector3(0.75 * A.leftX, 0.1, -0.65 * A.anterior).normalize().multiplyScalar(len * 1.75))); B.controls.target.copy(mid); B.controls.update();
    },
    showBrainTract: (abbr) => {
      const ls = B.tracts.filter((L) => L.userData.tract.abbr === abbr);
      ls.forEach((L) => { const cb = document.querySelector(`[data-tr="${L.userData.idx}"]`); if (cb) cb.checked = true; });
      applyAll(); if (ls[0]) { B.selTract = null; selectTract(ls[0]); }
    },
  });
  $('#br-body').onclick = () => { const b = new THREE.Box3(); B.meshes.filter((x) => x.visible).forEach((x) => b.expandByObject(x)); const A = B.atlas.anchors; B.camera.position.copy(B.controls.target.clone().add(new THREE.Vector3(-0.55 * A.leftX, 0.12, 0.82 * A.anterior).normalize())); B.controls.update(); B.pc.flyTo(b.getCenter(new THREE.Vector3()), b.getSize(new THREE.Vector3()).length() * 1.9); };
  $('#br-head').onclick = () => B.pc.flyTo(B.center.clone(), B.box.getSize(new THREE.Vector3()).length() * 1.4);
  status.textContent = `${B.meshes.filter((m) => m.userData.kind === 'brain').length} brain structures · ${B.tracts.length} tracts (${TJ.tracts.reduce((n, t) => n + t.lines, 0).toLocaleString()} streamlines shown) · drag to rotate around the point you press, scroll to zoom to the pointer`;
  renderer.setAnimationLoop(() => { B.pc.tick(); controls.update(); renderer.render(scene, camera); labels(); });
  window.__brain = B;
}

// ------------------------------------------------------------------ UI
function buildUI() {
  const TJ = B.TJ, CON = B.CON;
  $('#br-source').innerHTML = `<b>Tracts and connectome:</b> ${esc(TJ.source.citation)} Licence ${esc(TJ.source.licence)}. ${esc(TJ.source.acknowledgment)}
    <br><b>Placement:</b> the atlas is in MNI space and is fitted to this body's brain by matching bounding boxes axis by axis (approximate; scale ${B.fit.map((f) => (f.sc * 1000).toFixed(3)).join(' / ')} mm per mm). Up to ${TJ.max_lines_per_tract} streamlines per tract are drawn, resampled to ${TJ.n_pts} points.
    <br><b>Brain structures, nerves, arteries:</b> BodyParts3D (DBCLS), CC BY 4.0.`;
  // regions (structure groups)
  $('#br-regions').innerHTML = `<ul class="st-list">${[...B.groups.entries()].map(([g, ms]) => `<li><label><input type="checkbox" data-grp="${esc(g)}" ${g === 'Skull' || g === 'Cerebral arteries' || g === 'Rib cage' || g === G_NET ? '' : 'checked'}> <span class="sw" style="background:${ms[0].userData.color}"></span> ${esc(g)} <small>${ms.length}</small></label></li>`).join('')}</ul>`;
  document.querySelectorAll('[data-grp]').forEach((cb) => (cb.onchange = applyAll));
  // tracts grouped by family
  const fam = new Map(); B.tracts.forEach((L) => { const c = L.userData.tract.category; if (!fam.has(c)) fam.set(c, []); fam.get(c).push(L); });
  $('#br-tracts').innerHTML = [...fam.entries()].map(([c, ls]) => `<details ${c === 'Association' ? 'open' : ''}><summary><label><input type="checkbox" data-fam="${esc(c)}" checked> <span class="sw" style="background:${CAT_COL[c] || '#ccc'}"></span> ${esc(c)} <small>${ls.length}</small></label></summary>
    <ul class="st-list">${ls.map((L) => `<li><label><input type="checkbox" data-tr="${L.userData.idx}" checked> ${esc(L.userData.tract.name)} <small>${L.userData.tract.lines}/${L.userData.tract.total_lines.toLocaleString()}</small></label> <button class="ghost-btn tiny" data-trsel="${L.userData.idx}">info</button></li>`).join('')}</ul></details>`).join('');
  document.querySelectorAll('[data-fam]').forEach((cb) => (cb.onchange = () => { document.querySelectorAll(`[data-tr]`).forEach((t) => { if (B.tracts[+t.dataset.tr].userData.tract.category === cb.dataset.fam) t.checked = cb.checked; }); applyAll(); }));
  document.querySelectorAll('[data-tr]').forEach((cb) => (cb.onchange = applyAll));
  document.querySelectorAll('[data-trsel]').forEach((b) => (b.onclick = () => selectTract(B.tracts[+b.dataset.trsel])));
  $('#br-tr-none').onclick = () => { document.querySelectorAll('[data-tr],[data-fam]').forEach((c) => { c.checked = false; }); applyAll(); };
  $('#br-tr-all').onclick = () => { document.querySelectorAll('[data-tr],[data-fam]').forEach((c) => { c.checked = true; }); applyAll(); };
  for (const id of ['br-cortex', 'br-explode', 'br-cx', 'br-cy', 'br-cz', 'br-color', 'br-labels', 'br-skull', 'br-nerves', 'br-arteries', 'br-hemi-l', 'br-hemi-r']) $(`#${id}`).addEventListener('input', applyAll);
  $('#br-skull').onchange = () => { const cb = document.querySelector('[data-grp="Skull"]'); if (cb) cb.checked = $('#br-skull').checked; applyAll(); };
  $('#br-arteries').onchange = () => { const cb = document.querySelector('[data-grp="Cerebral arteries"]'); if (cb) cb.checked = $('#br-arteries').checked; applyAll(); };
  $('#br-nerves').onchange = () => { const cb = document.querySelector('[data-grp="Cranial nerves"]'); if (cb) cb.checked = $('#br-nerves').checked; document.querySelectorAll('[data-tr]').forEach((t) => { if (/Cranial/.test(B.tracts[+t.dataset.tr].userData.tract.category)) t.checked = $('#br-nerves').checked; }); applyAll(); };
  $('#br-atlas').onchange = () => { B.selRegion = null; drawMatrix(); applyAll(); };
  $('#br-thr').oninput = () => { $('#br-thr-v').textContent = (+$('#br-thr').value / 100).toFixed(2); drawMatrix(); applyAll(); };
  drawMatrix(); matrixClicks();
}

function applyAll() {
  const op = +$('#br-cortex').value / 100, ex = +$('#br-explode').value / 100, colorMode = $('#br-color').value;
  const showL = $('#br-hemi-l').checked, showR = $('#br-hemi-r').checked;
  const size = B.box.getSize(new THREE.Vector3());
  B.planes[0].constant = B.box.min.x + (+$('#br-cx').value / 1000) * size.x + 1e-4;
  B.planes[1].constant = B.box.min.y + (+$('#br-cy').value / 1000) * size.y + 1e-4;
  B.planes[2].constant = B.box.min.z + (+$('#br-cz').value / 1000) * size.z + 1e-4;
  const on = new Set([...document.querySelectorAll('[data-grp]')].filter((c) => c.checked).map((c) => c.dataset.grp));
  const side = (n) => (/\bleft\b/.test(n) ? 'L' : /\bright\b/.test(n) ? 'R' : null);
  for (const m of B.meshes) {
    const g = m.userData.group, s = side(m.userData.part.name);
    m.visible = on.has(g) && !(s === 'L' && !showL) && !(s === 'R' && !showR);
    if (m.userData.kind === 'brain') { const o = CORTEX.has(g) ? op : 1; m.material.opacity = o; m.material.depthWrite = o > 0.95; m.material.transparent = o < 1; }
    const sel = B.selMesh === m; m.material.emissive = new THREE.Color(sel ? 0x3fa9ff : 0x000000); m.material.emissiveIntensity = sel ? 0.6 : 0;
    // explode: push away from the brain centre along the direction to the structure
    if (m.userData.kind === 'brain') { const d = m.userData.base.clone().sub(B.center); m.position.copy(d.multiplyScalar(ex * 0.9)); } else m.position.set(0, 0, 0);
  }
  const thr = +$('#br-thr').value / 100, reg = B.selRegion;
  const regionTracts = reg ? connectedTracts(reg, thr) : null;
  B.tracts.forEach((L, i) => {
    const t = L.userData.tract, cb = document.querySelector(`[data-tr="${i}"]`);
    let vis = cb ? cb.checked : true; if ((t.hemi === 'L' && !showL) || (t.hemi === 'R' && !showR)) vis = false;
    if (regionTracts) vis = vis && regionTracts.has(t.id);
    L.visible = vis;
    const col = L.geometry.attributes.color, dir = L.geometry.userData.dir;
    if (colorMode === 'dir') col.array.set(dir); else { const c = new THREE.Color(colorMode === 'cat' ? (CAT_COL[t.category] || '#ccc') : PAL[i % PAL.length]); for (let k = 0; k < col.array.length; k += 3) { col.array[k] = c.r; col.array[k + 1] = c.g; col.array[k + 2] = c.b; } }
    col.needsUpdate = true;
    L.material.opacity = B.selTract && B.selTract !== L ? 0.06 : 0.6;
  });
}

// ------------------------------------------------------------------ connectome
function table() { return B.CON[$('#br-atlas').value]; }
function connectedTracts(region, thr) {
  const T = table(), i = T.regions.indexOf(region), out = new Set(); if (i < 0) return out;
  B.CON.tracts.forEach((tr, j) => { if (T.left[i][j] >= thr) out.add(`${tr}_L`); if (T.right[i][j] >= thr) out.add(`${tr}_R`); if (tr === 'F' && (T.left[i][j] >= thr || T.right[i][j] >= thr)) out.add('F'); });
  return out;
}
function drawMatrix() {
  const cv = $('#br-matrix'), g = cv.getContext('2d'), T = table(), tr = B.CON.tracts, R = T.regions.length, C = tr.length * 2;
  const left = 74, top = 54, cw = (cv.width - left - 6) / C, ch = (cv.height - top - 6) / R;
  B.mat = { left, top, cw, ch };
  g.clearRect(0, 0, cv.width, cv.height); g.font = '9px system-ui'; g.fillStyle = '#9fc0e0';
  const vir = ['#440154', '#3e4989', '#26828e', '#35b779', '#fde725'].map((h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)));
  const col = (v) => { const f = Math.max(0, Math.min(1, v)) * (vir.length - 1), i = Math.min(vir.length - 2, Math.floor(f)), t = f - i; return `rgb(${vir[i].map((c, k) => Math.round(c + t * (vir[i + 1][k] - c))).join(',')})`; };
  const thr = +$('#br-thr').value / 100;
  for (let i = 0; i < R; i++) {
    g.fillStyle = B.selRegion === T.regions[i] ? '#ffffff' : '#9fc0e0'; g.fillText(T.regions[i], 2, top + i * ch + ch * 0.8);
    for (let j = 0; j < C; j++) {
      const v = j < tr.length ? T.left[i][j] : T.right[i][j - tr.length];
      g.fillStyle = v > 0 ? col(v) : '#0b1626'; g.globalAlpha = v >= thr ? 1 : 0.35; g.fillRect(left + j * cw, top + i * ch, cw - 0.5, ch - 0.5); g.globalAlpha = 1;
    }
  }
  g.save(); g.fillStyle = '#9fc0e0';
  for (let j = 0; j < C; j++) { g.save(); g.translate(left + j * cw + cw * 0.7, top - 3); g.rotate(-Math.PI / 2.6); g.fillText(tr[j % tr.length], 0, 0); g.restore(); }
  g.fillStyle = '#cfe6ff'; g.fillText('left hemisphere', left, 10); g.fillText('right hemisphere', left + tr.length * cw, 10);
  g.restore();
}
function matrixClicks() {
  const cv = $('#br-matrix');
  cv.onclick = (e) => {
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * (cv.width / r.width), y = (e.clientY - r.top) * (cv.height / r.height);
    const { left, top, cw, ch } = B.mat, T = table(), tr = B.CON.tracts;
    const i = Math.floor((y - top) / ch); if (i < 0 || i >= T.regions.length) return;
    const j = Math.floor((x - left) / cw);
    if (x < left) { B.selRegion = B.selRegion === T.regions[i] ? null : T.regions[i]; B.selTract = null; }
    else if (j >= 0 && j < tr.length * 2) { const id = tr[j % tr.length] === 'F' ? 'F' : `${tr[j % tr.length]}_${j < tr.length ? 'L' : 'R'}`; B.selRegion = T.regions[i]; const L = B.tracts.find((t) => t.userData.tract.id === id); if (L) { selectTract(L, true); } }
    drawMatrix(); applyAll(); regionInfo();
  };
}
function regionInfo() {
  const reg = B.selRegion, el = $('#br-conn');
  if (!reg) { el.innerHTML = 'Click a region name (left column) to show only the tracts that reach it, or a cell to select that tract.'; return; }
  const T = table(), i = T.regions.indexOf(reg), tr = B.CON.tracts, thr = +$('#br-thr').value / 100;
  const rows = tr.flatMap((t, j) => [[`${t} left`, T.left[i][j]], [`${t} right`, T.right[i][j]]]).filter(([, v]) => v >= thr).sort((a, b) => b[1] - a[1]);
  el.innerHTML = `<b>${esc(reg)}</b>: ${rows.length} tract sides at ≥ ${thr.toFixed(2)}<br>${rows.map(([n, v]) => `${esc(fullName(n.split(' ')[0]))} ${n.split(' ')[1]} <span class="mono">${v.toFixed(3)}</span>`).join(' · ') || 'none'}
    <br><small>Value = the published tract-to-region connectivity (Yeh 2022), 0-1.</small>`;
}
const fullName = (abbr) => B.CON.names[abbr]?.name || abbr;

// ------------------------------------------------------------------ selection and picking
async function selectTract(L, keepRegion = false) {
  B.selTract = B.selTract === L ? null : L; B.selMesh = null; if (!keepRegion) B.selRegion = null; applyAll(); drawMatrix();
  if (!B.selTract) { $('#br-info').innerHTML = 'Click a structure or a tract.'; return; }
  const t = L.userData.tract, j = B.CON.tracts.indexOf(t.abbr);
  let conn = '';
  if (j >= 0) {
    const T = table(), side = t.hemi === 'R' ? T.right : T.left;
    const rows = T.regions.map((r, i) => [r, side[i][j]]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 14);
    conn = `<p class="fine"><b>Regions it reaches (${$('#br-atlas').value}):</b> ${rows.map(([r, v]) => `${esc(r)} <span class="mono">${v.toFixed(3)}</span>`).join(' · ') || 'none'}</p>`;
  } else conn = '<p class="fine muted">This tract is not in the published tract-to-region table (that table covers 26 cerebral tracts).</p>';
  const about = await aboutHtml(t.name.replace(/ \((left|right)\)$/, '').toLowerCase());
  $('#br-info').innerHTML = `<h3 class="st-h">${esc(t.name)}</h3><p class="fine">Family: ${esc(t.category)}${t.other ? ` · also called ${esc(t.other)}` : ''} · ${t.lines} of ${t.total_lines.toLocaleString()} population streamlines drawn.</p>${conn}<div class="st-about">${about}</div>`;
}
async function selectMesh(m) {
  B.selMesh = B.selMesh === m ? null : m; B.selTract = null; applyAll();
  if (!B.selMesh) return;
  if (m.userData.organ) { const org = B.organs.find((o) => o.name === m.userData.organ); if (org) { selectOrgan(org); return; } }
  const p = m.userData.part;
  $('#br-info').innerHTML = `<h3 class="st-h">${esc(p.name)}</h3><p class="fine">${esc(m.userData.group)} · BodyParts3D ${esc(p.id)}</p><div class="st-about"><p class="fine muted">Loading…</p></div>`;
  $('#br-info .st-about').innerHTML = await aboutHtml(p.name);
  regionCard(m);
}
function setupPicking(canvas) {
  const ray = new THREE.Raycaster(); ray.params.Line.threshold = 0.0015; const ndc = new THREE.Vector2(), tip = $('#brain-pick');
  const hitAt = (e) => {
    const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, B.camera);
    const hm = ray.intersectObjects(B.meshes.filter((m) => m.visible && m.material.opacity > 0.3), false)[0];
    const ht = ray.intersectObjects(B.tracts.filter((t) => t.visible), false)[0];
    if (ht && (!hm || ht.distance < hm.distance + 0.004)) return { tract: ht.object };
    return hm ? { mesh: hm.object } : null;
  };
  let last = 0, down = null;
  canvas.addEventListener('pointermove', (e) => {
    const n = performance.now(); if (n - last < 70) return; last = n;
    const h = hitAt(e), r = canvas.getBoundingClientRect();
    if (!h) { tip.hidden = true; return; }
    tip.hidden = false; tip.style.left = `${e.clientX - r.left}px`; tip.style.top = `${e.clientY - r.top}px`;
    tip.textContent = h.tract ? h.tract.userData.tract.name : (h.mesh.userData.dname || h.mesh.userData.part.name);
  });
  canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
    const h = hitAt(e); if (h?.tract) selectTract(h.tract); else if (h?.mesh) selectMesh(h.mesh);
  });
}

// ------------------------------------------------------------------ labels (one per named structure, collision-avoiding)
function labels() {
  const host = $('#brain-labels');
  if (!$('#br-labels').checked) { const now0 = performance.now(); if (now0 - (B.lblT || 0) < 120) return; B.lblT = now0; host.innerHTML = spinalLabels(B, host, B.camera); return; }
  const now = performance.now(); if (now - (B.lblT || 0) < 120) return; B.lblT = now;
  const r = host.getBoundingClientRect(), v = new THREE.Vector3(), placed = [], out = [];
  const far = B.camera.position.distanceTo(B.controls.target) > B.box.getSize(new THREE.Vector3()).length() * 1.1;
  const items = B.meshes.filter((m) => m.visible && (m.userData.kind === 'brain' || m.userData.kind === 'nerve') && !/white matter/.test(m.userData.part.name) && (!far || !/^(left|right) /.test(m.userData.part.name) || /left /.test(m.userData.part.name)));
  for (const m of items) {
    v.copy(m.userData.base).add(m.position).project(B.camera); if (v.z > 1) continue;
    let x = ((v.x + 1) / 2) * r.width, y = ((1 - v.y) / 2) * r.height; const nm = m.userData.dname || m.userData.part.name, w = nm.length * 5.6 + 10;
    let k = 0; while (k++ < 8 && placed.some((q) => Math.abs(q.y - y) < 15 && x < q.x + q.w && q.x < x + w)) y += 15;
    if (placed.some((q) => Math.abs(q.y - y) < 15 && x < q.x + q.w && q.x < x + w)) continue;
    placed.push({ x, y, w }); out.push(`<span class="lab-lbl" style="transform:translate(${x}px,${y}px);border-color:${m.userData.color}">${esc(nm)}</span>`);
  }
  host.innerHTML = out.join('') + spinalLabels(B, host, B.camera);
}
