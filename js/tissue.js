// Tissue Lab 4D: tendons, ligaments, capsules, menisci, labra, discs, fascia, bursae, muscle attachment areas
// (origins and insertions) and peripheral nerves around the muscles, in 3D; the owner's Tendon Booklet as an
// interactive learning layer (tendon map focus, 4D load / strain / recovery views, plans, flashcards); StatPearls
// chapters on muscle types, connective tissue, fascia and nerve, quoted unchanged.
// 3D data: Z-Anatomy (CC BY-SA 4.0, derived from BodyParts3D CC BY-SA 2.1 JP) via tools/tissue_build.py; atlas meshes
// (BodyParts3D) via atlas_data.js. Numbers in the 4D views are the booklet's own, shown with its evidence grades.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadAtlas } from './atlas_data.js';
import { studio } from './look.js';
import { chainsPanel, chainTick } from './tissue_chains.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CAT = {
  insertion: ['Insertion (enthesis)', '#ffcf6b'], origin: ['Origin area', '#8fd3ff'], ligament: ['Ligaments', '#5ef0b0'], capsule: ['Joint capsules', '#b49bff'],
  meniscus: ['Menisci', '#4cc9f0'], labrum: ['Labra', '#4cc9f0'], disc: ['Articular discs', '#6fa8ff'], fascia: ['Fascia', '#ff9ecf'], bursa: ['Bursae', '#ff6b9a'],
  'joint (other)': ['Other joint tissue', '#9aa7c7'], other: ['Other', '#9aa7c7'],
};
const T = { started: false, atlas: null, scene: null, cam: null, ctl: null, ren: null, meshes: [], tissue: [], muscles: [], bones: [], nerves: [], tendons: [], book: null, know: null,
  show: { skin: false, artery: false, vein: false, organ: false, cns: false, bone: true, muscle: true, tendon: true, insertion: true, origin: false, ligament: true, capsule: true, meniscus: true, labrum: true, disc: false, fascia: false, bursa: true, nerve: true, 'joint (other)': false, other: false },
  muscleOp: 0.28, side: 'left', focus: null, pulse: 0, task: null, P: null };

export async function startTissue() {
  if (T.started) return; T.started = true;
  const host = $('#mode-tissue');
  host.innerHTML = `<section class="stage-wrap"><div class="tis-stage"><div class="atlas-views"><a class="chip-btn" href="#atlas">Structures</a><a class="chip-btn on" href="#tissue">Tissue, fascia &amp; chains</a></div><canvas id="tis-canvas"></canvas><div id="tis-pick" class="atlas-pick" hidden></div><div id="tis-status" class="atlas-status muted">Loading…</div>
      <div class="tis-legend" id="tis-legend"></div></div>
      <div class="layers lab-bar" id="tis-bar"></div></section>
    <aside class="side tis-side"><section class="card"><div class="bar tis-tabs">${[['explore', 'Explore'], ['chains', 'Fascial chains'], ['map', 'Tendon map'], ['lab', '4D lab'], ['plan', 'Plan'], ['learn', 'Learn'], ['cards', 'Cards'], ['src', 'Sources']].map(([k, v], i) => `<button class="chip-btn ${i ? '' : 'on'}" data-t="${k}">${v}</button>`).join('')}</div></section><div id="tis-panel"></div></aside>`;
  host.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { host.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('on', x === b)); panel(b.dataset.t); }));
  const [book, know] = await Promise.all([fetch('/training-4D/rt/tissue/booklet.json').then((r) => r.json()).catch(() => null), fetch('/training-4D/rt/tissue/knowledge.json').then((r) => r.json()).catch(() => null)]);
  T.book = book; T.know = know;
  panel('explore');
  await scene3d();
}

// ------------------------------------------------------------------ 3D
async function scene3d() {
  const canvas = $('#tis-canvas'), status = $('#tis-status');
  const ren = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); ren.setPixelRatio(Math.min(2, devicePixelRatio));
  const scene = new THREE.Scene(); studio(ren, scene);
  const cam = new THREE.PerspectiveCamera(32, 1, 0.01, 50), ctl = new OrbitControls(cam, canvas); ctl.enableDamping = true;
  Object.assign(T, { ren, scene, cam, ctl });
  const resize = () => { const r = canvas.getBoundingClientRect(); if (r.width < 2) return; ren.setSize(r.width, r.height, false); cam.aspect = r.width / r.height; cam.updateProjectionMatrix(); };
  new ResizeObserver(resize).observe(canvas); resize();
  try { T.atlas = await loadAtlas((m) => { status.textContent = m; }); } catch (e) { status.textContent = e.message; return; }
  const A = T.atlas, ix = A.index, span = ix.bbox_span, mn = ix.bbox_min, up = span.indexOf(Math.max(...span)), c = [0, 1, 2].map((a) => mn[a] + span[a] / 2);
  T.P = (x, y, z) => { const a = (x - c[0]) / 1000, b = (y - c[1]) / 1000, d = (z - c[2]) / 1000; return up === 2 ? new THREE.Vector3(a, d, -b) : new THREE.Vector3(a, b, d); };
  const mat = (color, op = 1, extra = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, clearcoat: 0.25, transparent: op < 1, opacity: op, depthWrite: op >= 0.6, side: THREE.DoubleSide, ...extra });
  for (const { part, geometry } of A.parts) {
    let kind = null;
    if (part.layer === 'skeleton') kind = 'bone'; else if (part.layer === 'muscles') kind = /tendon/i.test(part.name) ? 'tendon' : 'muscle'; else kind = { skin: 'skin', arteries: 'artery', veins: 'vein', organs: 'organ', nerves: 'cns' }[part.layer];
    if (!kind) continue;
    if (['skin', 'artery', 'vein', 'organ', 'cns'].includes(kind)) { const lc = { skin: 0xd9b59a, artery: 0xff3b3b, vein: 0x4d7cff, organ: 0xe9a6ff, cns: 0xffd84d }[kind], op = kind === 'skin' ? 0.25 : 1; const m = new THREE.Mesh(geometry, mat(lc, op)); m.userData = { kind, name: part.name, side: /left/.test(part.name) ? 'left' : /right/.test(part.name) ? 'right' : null, base: op }; m.visible = false; scene.add(m); T.meshes.push(m); continue; }
    const m = new THREE.Mesh(geometry, mat(kind === 'bone' ? 0xf1ead8 : kind === 'tendon' ? 0xf6f1de : 0xd9545f, kind === 'muscle' ? T.muscleOp : 1, kind === 'tendon' ? { emissive: 0x000000 } : {}));
    m.userData = { kind, name: part.name, side: /\bleft\b/.test(part.name) ? 'left' : /\bright\b/.test(part.name) ? 'right' : null };
    scene.add(m); T.meshes.push(m); (kind === 'bone' ? T.bones : kind === 'tendon' ? T.tendons : T.muscles).push(m);
  }
  status.textContent = 'Loading tendons, ligaments, fascia and bursae…';
  const meta = await fetch('/training-4D/rt/tissue/tissue.json').then((r) => r.json()), buf = await fetch('/training-4D/rt/tissue/tissue.bin').then((r) => r.arrayBuffer());
  const pos = new Float32Array(buf, 0, meta.vertices * 3), idx = new Uint32Array(buf, meta.pos_bytes, meta.indices);
  for (const p of meta.parts) {
    const arr = new Float32Array(p.vCount * 3);
    for (let i = 0; i < p.vCount; i++) { const o = (p.vOff + i) * 3, v = T.P(pos[o], pos[o + 1], pos[o + 2]); arr[3 * i] = v.x; arr[3 * i + 1] = v.y; arr[3 * i + 2] = v.z; }
    const ii = new Uint32Array(p.iCount); for (let i = 0; i < p.iCount; i++) ii[i] = idx[p.iOff + i] - 0;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3)); g.setIndex(new THREE.BufferAttribute(ii, 1)); g.computeVertexNormals(); g.computeBoundingSphere();
    if (p.cat === 'muscle') { const m = new THREE.Mesh(g, mat(0xd9545f, T.muscleOp)); m.userData = { kind: 'muscle', name: `${p.side ? `${p.side} ` : ''}${p.n}`, raw: p.raw, side: p.side, part: p, z: true }; scene.add(m); T.meshes.push(m); T.muscles.push(m); continue; }
    const col = (CAT[p.cat] || CAT.other)[1], op = p.cat === 'fascia' ? 0.35 : p.cat === 'bursa' ? 0.7 : 1;
    const m = new THREE.Mesh(g, mat(col, op)); m.userData = { kind: p.cat, name: `${p.side ? `${p.side} ` : ''}${p.n}`, raw: p.raw, side: p.side, part: p, base: op };
    scene.add(m); T.meshes.push(m); T.tissue.push(m);
  }
  T.meta = meta;
  // peripheral nerves (Z-Anatomy curves), loaded lazily from the Brain map's file
  fetch('/training-4D/rt/brain/z_nerves.json').then((r) => (r.ok ? r.json() : null)).then((Z) => {
    if (!Z) return;
    for (const o of Z.objects) {
      if (o.type !== 'CURVE' || /cord|Spinal cord/i.test(o.group)) continue;
      (o.l || []).forEach((ix2, k) => {
        const pts = ix2.map((i) => T.P(o.v[3 * i], o.v[3 * i + 1], o.v[3 * i + 2])); if (pts.length < 2) return;
        const rr = o.r?.[k] || [0.6], r = Math.max(0.0006, rr.reduce((s, x) => s + x, 0) / rr.length / 1000);
        const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), Math.min(200, pts.length * 4), r, 6, false), mat(0xffd84d, 1));
        m.userData = { kind: 'nerve', name: o.name.replace(/\.(l|r)$/, (x, s) => ` (${s === 'l' ? 'left' : 'right'})`), side: /\.l$/.test(o.name) ? 'left' : /\.r$/.test(o.name) ? 'right' : null };
        T.scene.add(m); T.meshes.push(m); T.nerves.push(m);
      });
    }
    applyLook();
  }).catch(() => {});
  const box = new THREE.Box3(); T.bones.forEach((m) => box.expandByObject(m)); const cc = box.getCenter(new THREE.Vector3()), h = box.getSize(new THREE.Vector3()).y;
  cam.position.set(cc.x, cc.y, cc.z + (A.anchors.anterior || 1) * h * 2.2); ctl.target.copy(cc); ctl.update(); T.home = { pos: cam.position.clone(), tgt: cc.clone() };
  status.textContent = `${meta.parts.length} tissue parts (${Object.entries(meta.counts).map(([k, n]) => `${n} ${k}`).join(', ')}) · ${T.muscles.length} muscles · ${T.bones.length} bones. Click any structure.`;
  bar(); applyLook(); pickSetup();
  const tick = (t) => { requestAnimationFrame(tick); if ($('#mode-tissue').hidden) return; ctl.update(); pulse(t); chainTick(t); ren.render(scene, cam); };
  requestAnimationFrame(tick);
}
function bar() {
  const n = (k) => (k === 'bone' ? T.bones.length : k === 'muscle' ? T.muscles.length : k === 'tendon' ? T.tendons.length : k === 'nerve' ? 'Z' : ['skin', 'artery', 'vein', 'organ', 'cns'].includes(k) ? T.meshes.filter((m) => m.userData.kind === k).length : T.meta.counts[k] || 0);
  const label = { skin: 'Skin', artery: 'Arteries', vein: 'Veins', organ: 'Organs', cns: 'Brain & cord', bone: 'Bones', muscle: 'Muscles', tendon: 'Tendons', nerve: 'Peripheral nerves', ...Object.fromEntries(Object.entries(CAT).map(([k, v]) => [k, v[0]])) };
  const col = { skin: '#d9b59a', artery: '#ff3b3b', vein: '#4d7cff', organ: '#e9a6ff', cns: '#ffd84d', bone: '#f1ead8', muscle: '#d9545f', tendon: '#f6f1de', nerve: '#ffd84d', ...Object.fromEntries(Object.entries(CAT).map(([k, v]) => [k, v[1]])) };
  $('#tis-bar').innerHTML = Object.keys(T.show).map((k) => `<label><input type="checkbox" data-s="${k}" ${T.show[k] ? 'checked' : ''}> <i class="sw" style="background:${col[k]}"></i>${label[k]} <small>${n(k)}</small></label>`).join('')
    + `<label>Muscle opacity <input type="range" id="tis-mop" min="0" max="100" value="${Math.round(T.muscleOp * 100)}"></label><label>Side <select id="tis-side"><option value="left">Left</option><option value="right">Right</option><option value="both">Both</option></select></label><button class="ghost-btn" id="tis-home">Reset view</button>`;
  $('#tis-bar').querySelectorAll('[data-s]').forEach((c) => (c.onchange = () => { T.show[c.dataset.s] = c.checked; applyLook(); }));
  $('#tis-mop').oninput = (e) => { T.muscleOp = e.target.value / 100; applyLook(); };
  $('#tis-side').onchange = (e) => { T.side = e.target.value; if (T.focus) focus(T.focus.key); };
  $('#tis-home').onclick = () => { T.focus = null; T.cam.position.copy(T.home.pos); T.ctl.target.copy(T.home.tgt); applyLook(); };
}
function applyLook() {
  const F = T.focus?.set;
  for (const m of T.meshes) {
    const k = m.userData.kind;
    let vis = T.show[k] ?? true;
    if (F && vis) vis = true;
    m.visible = vis;
    if (!vis) continue;
    const mt = m.material, inF = F ? F.has(m) : true;
    const base = k === 'muscle' ? T.muscleOp : m.userData.base ?? 1;
    const op = F ? (inF ? (k === 'muscle' ? 0.42 : k === 'fascia' ? 0.18 : k === 'bursa' ? 0.75 : 1) : k === 'bone' ? 0.18 : 0.04) : base;
    mt.opacity = op; mt.transparent = op < 1; mt.depthWrite = op >= 0.6;
    if (mt.emissive) mt.emissive.setHex(F && inF && k !== 'bone' ? 0x1a1a1a : 0x000000);
  }
}
function pickSetup() {
  const ray = new THREE.Raycaster(), v = new THREE.Vector2(), cv = $('#tis-canvas'), tip = $('#tis-pick');
  cv.addEventListener('click', (e) => {
    const r = cv.getBoundingClientRect(); v.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(v, T.cam);
    const hit = ray.intersectObjects(T.meshes.filter((m) => m.visible && m.material.opacity > 0.1), false)[0];
    if (!hit) { tip.hidden = true; return; }
    const u = hit.object.userData;
    tip.hidden = false; tip.style.left = `${e.clientX - r.left}px`; tip.style.top = `${e.clientY - r.top}px`;
    tip.innerHTML = `<b>${esc(u.name)}</b><br><small>${esc((CAT[u.kind] || [u.kind])[0])}${u.part?.path ? ` · ${esc(u.part.path)}` : ''}</small>`;
    const ex = $('#tis-pick-info'); if (ex) ex.innerHTML = `<b>${esc(u.name)}</b> · ${esc((CAT[u.kind] || [u.kind])[0])}${u.part?.region ? ` · ${esc(u.part.region)}` : ''}${u.part?.path ? `<div class="mini">${esc(u.part.path)}</div>` : ''}`;
  });
}

// ------------------------------------------------------------------ tendon focus
function focus(key) {
  const f = T.book?.focus?.find((x) => x.tendon === key); if (!f || !T.P) return;
  const map = f.map || {}, sideOk = (m) => T.side === 'both' || !m.userData.side || m.userData.side === T.side;
  const rx = (s) => (s ? new RegExp(s, 'i') : null), rm = rx(map.muscles), rt = rx(map.tissue), ra = rx(map.atlas_tendon), rn = rx(map.nerves);
  const set = new Set();
  T.muscles.forEach((m) => { if (rm && rm.test(m.userData.name) && sideOk(m)) set.add(m); });
  T.tendons.forEach((m) => { if (ra && ra.test(m.userData.name) && sideOk(m)) set.add(m); });
  T.tissue.forEach((m) => { if (rt && rt.test(m.userData.part.n) && sideOk(m)) set.add(m); });
  // centre on the tendon itself: its attachment areas and tendon meshes (a whole muscle can span two joints)
  const core = new THREE.Box3();
  set.forEach((m) => { if (['insertion', 'tendon', 'ligament', 'bursa'].includes(m.userData.kind)) core.expandByObject(m); });
  if (core.isEmpty()) set.forEach((m) => core.expandByObject(m));
  if (core.isEmpty()) return;
  const cc = core.getCenter(new THREE.Vector3()), R = Math.min(0.12, Math.max(0.06, core.getSize(new THREE.Vector3()).length() * 0.5));
  const near = [];
  T.tissue.forEach((m) => { if (set.has(m) || !sideOk(m) || !['ligament', 'bursa', 'fascia', 'capsule', 'meniscus', 'labrum'].includes(m.userData.kind)) return; const s = m.geometry.boundingSphere; if (s && s.center.distanceTo(cc) < R) { set.add(m); near.push(m.userData); } });
  const nerves = [];
  T.nerves.forEach((m) => { if (rn && rn.test(m.userData.name) && sideOk(m)) { const s = m.geometry.boundingSphere; if (s && s.center.distanceTo(cc) < R * 2.5) { set.add(m); nerves.push(m.userData.name); } } });
  T.bones.forEach((m) => { const s = m.geometry.boundingSphere; if (s && s.center.distanceTo(cc) < R) set.add(m); });
  T.focus = { key, set, near, nerves: [...new Set(nerves)], center: cc };
  ['muscle', 'tendon', 'insertion', 'origin', 'ligament', 'bursa', 'nerve', 'fascia', 'capsule'].forEach((k) => { T.show[k] = true; });
  bar(); applyLook();
  const A = T.atlas.anchors, an = A.anterior || 1, lx = (A.leftX || 1) * (T.side === 'right' ? -1 : 1);
  const VIEW = { back: [0, 0.25, -an], front: [0, 0.25, an], lateral: [lx, 0.2, 0.15 * an], medial: [-lx, 0.2, 0.15 * an] };
  const v = /Achilles|hamstring|Rotator cuff/.test(key) ? 'back' : /Patellar|Quadriceps|Adductor|biceps/.test(key) ? 'front' : /Tibialis posterior|Medial elbow/.test(key) ? 'medial' : 'lateral';
  const dir = new THREE.Vector3(...VIEW[v]).normalize();
  T.ctl.target.copy(cc); T.cam.position.copy(cc.clone().add(dir.multiplyScalar(R * 3.4)));
}
function pulse(t) {
  if (!T.focus || !T.task) return;
  const k = T.task.bw, a = (Math.sin(t / 300) + 1) / 2, I = Math.min(1, k / 12);
  T.focus.set.forEach((m) => { if (['tendon', 'insertion'].includes(m.userData.kind) && m.material.emissive) m.material.emissive.setRGB(I * (0.3 + 0.7 * a), I * 0.35 * a, 0); });
}

// ------------------------------------------------------------------ panels
function panel(t) {
  const P = $('#tis-panel'); if (!T.book) { P.innerHTML = '<section class="card"><p class="muted">Tissue data not built yet (tools/tissue_build.py).</p></section>'; return; }
  if (t === 'chains') { chainsPanel(P, T, md, (set) => { T.focus = set ? { key: null, set, near: [], nerves: [] } : null; if (set) ['muscle', 'fascia', 'ligament', 'tendon'].forEach((k) => { T.show[k] = true; }); bar(); applyLook(); }); return; }
  ({ explore, map: tendonMap, lab: lab4d, plan, learn, cards, src: sources })[t](P);
}
function explore(P) {
  const parts = T.meta?.parts || [];
  P.innerHTML = `<section class="card"><div class="card-h"><h2>Explore the support network</h2></div>
    <p class="fine">Muscles (BodyParts3D), their origin and insertion areas, ligaments, capsules, menisci, labra, discs, fascia and bursae (Z-Anatomy), and peripheral nerves. Toggle layers under the 3D view; click a structure to name it.</p>
    <div id="tis-pick-info" class="note">Click a structure in the 3D view.</div>
    <input class="tr-in" id="tis-q" placeholder="Find a ligament, bursa, fascia, attachment…"><div id="tis-res" class="mini"></div></section>
    <section class="card"><div class="card-h"><h2>Tissue types</h2><small>StatPearls, quoted</small></div>${Object.entries(T.know?.topics || {}).map(([topic, chs]) => `<details><summary><b>${esc(topic)}</b> <small>${chs.length} chapters</small></summary>${chs.map((c) => `<details style="margin-left:10px"><summary>${esc(c.title)}</summary>${Object.entries(c.sections).slice(0, 4).map(([s, x]) => `<p class="mini"><b>${esc(s)}.</b> ${esc(x.slice(0, 1400))}${x.length > 1400 ? '…' : ''}</p>`).join('')}<p class="mini"><a href="${esc(c.link)}" target="_blank" rel="noopener">${esc(c.publisher)} · ${esc(c.licence)}</a></p></details>`).join('')}</details>`).join('')}</section>`;
  $('#tis-q').oninput = (e) => {
    const q = e.target.value.trim().toLowerCase(); if (q.length < 2) { $('#tis-res').innerHTML = ''; return; }
    const hits = T.tissue.filter((m) => m.userData.name.toLowerCase().includes(q)).slice(0, 30);
    $('#tis-res').innerHTML = hits.map((m, i) => `<div class="comp click" data-i="${T.tissue.indexOf(m)}" style="grid-template-columns:1fr auto"><span>${esc(m.userData.name)}</span><small>${esc((CAT[m.userData.kind] || [m.userData.kind])[0])}</small></div>`).join('') || 'No match.';
    $('#tis-res').querySelectorAll('[data-i]').forEach((el) => (el.onclick = () => { const m = T.tissue[+el.dataset.i]; T.show[m.userData.kind] = true; T.focus = { key: null, set: new Set([m]), near: [], nerves: [] }; bar(); applyLook(); const s = m.geometry.boundingSphere; const dir = T.cam.position.clone().sub(T.ctl.target).normalize(); T.ctl.target.copy(s.center); T.cam.position.copy(s.center.clone().add(dir.multiplyScalar(Math.max(0.15, s.radius * 6)))); $('#tis-pick-info').innerHTML = `<b>${esc(m.userData.name)}</b> · ${esc((CAT[m.userData.kind] || [m.userData.kind])[0])}<div class="mini">${esc(m.userData.part.path)}</div>`; }));
  };
}
function tendonMap(P) {
  const F = T.book.focus, cur = T.focus?.key || F[0].tendon, f = F.find((x) => x.tendon === cur) || F[0], r = f.row;
  P.innerHTML = `<section class="card"><div class="card-h"><h2>Body-wide tendon map</h2><small>booklet Ch. 10</small></div><div class="bar">${F.map((x) => `<button class="chip-btn ${x.tendon === cur ? 'on' : ''}" data-f="${esc(x.tendon)}">${esc(x.tendon)}</button>`).join('')}</div></section>
    <section class="card"><div class="card-h"><h2>${esc(f.tendon)}</h2><span class="pill">${esc(r['Best evidence'] || '')}</span></div>
      <table class="tt"><tbody>${['Typical population', 'Provocation test', 'Compression to avoid early', 'First-line loading'].map((k) => `<tr><td class="mini" style="width:38%">${esc(k)}</td><td>${esc(r[k])}</td></tr>`).join('')}</tbody></table>
      <p class="mini"><b>In 3D:</b> ${T.focus?.key === f.tendon ? `${T.focus.set.size} structures highlighted; nearby: ${esc(T.focus.near.map((n) => n.name).slice(0, 12).join(', ') || '—')}${T.focus.nerves.length ? `; nerves: ${esc(T.focus.nerves.slice(0, 6).join(', '))}` : ''}` : 'loading…'}</p>
      <p class="fine">3D match (app mapping): muscles /${esc(f.map?.muscles || '')}/ · tissue /${esc(f.map?.tissue || '')}/ · nerves /${esc(f.map?.nerves || '')}/; nearby ligaments, bursae, fascia and capsules within the focus radius.</p></section>
    <section class="card"><div class="card-h"><h2>Movements that load it</h2><small>workbook Anatomy_Map</small></div>${f.movements.map((m) => `<div class="comp" style="grid-template-columns:1fr auto"><span><b>${esc(m.base)}</b><div class="mini">${esc(m.tendons)}</div><div class="mini">${esc(m.line)}</div></span><button class="ghost-btn" data-ms="${esc(m.base)}">▶ Motion Lab</button></div>`).join('') || '<p class="muted">No workbook movement names this tendon.</p>'}</section>
    <section class="card"><div class="card-h"><h2>Support network</h2><small>booklet Ch. 13</small></div>${table((T.book.tables['13.1 The network'] || [])[0])}</section>`;
  P.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { focus(b.dataset.f); tendonMap(P); }));
  P.querySelectorAll('[data-ms]').forEach((b) => (b.onclick = () => { const name = b.dataset.ms; location.hash = '#lab'; let n = 0; const t = setInterval(() => { if (window.__studio?.start && window.__studio.moves().includes(name)) { clearInterval(t); window.__studio.start(name); } else if (++n > 120) clearInterval(t); }, 500); }));
  if (T.focus?.key !== f.tendon) setTimeout(() => { focus(f.tendon); if ($('#tis-panel')) tendonMap(P); }, 50);
}

// ---- 4D lab: load (x body weight), hand calculation, stress-strain with crimp, recovery clocks over time, hierarchy
const TASKS = [['Squat', 0.8, '~0.8 (model)'], ['Walking', 3, '~2–4 (models and transducers)'], ['Single-leg jump landing', 6.7, '~6.7 (model)'], ['Running', 8.75, '~5–12.5 (models 5.3–10; transducer 12.5)']];
function lab4d(P) {
  P.innerHTML = `<section class="card"><div class="card-h"><h2>Load the tendon · Achilles</h2><small>booklet Ch. 2.1 table</small></div>
      <div class="bar">${TASKS.map(([k, bw], i) => `<button class="chip-btn" data-task="${i}">${esc(k)}</button>`).join('')}<button class="ghost-btn" data-task="-1">Stop</button></div>
      <label class="mini">Body mass <input class="tr-in" id="lb-m" type="number" value="75" style="width:70px"> kg</label><div id="lb-out" class="mini"></div>
      <p class="fine">The focused tendon glows with the task's force (× body weight, booklet values; the mid-range is shown where the booklet gives a range). Focus the Achilles in Tendon map first.</p></section>
    <section class="card"><div class="card-h"><h2>Tendon force by hand</h2><small>booklet Ch. 16.2</small></div>
      <div class="formgrid"><label>Ground force (N)<input class="tr-in" id="hc-f" type="number" value="800"></label><label>External moment arm (m)<input class="tr-in" id="hc-de" type="number" step="0.01" value="0.15"></label><label>Tendon moment arm (m)<input class="tr-in" id="hc-dt" type="number" step="0.005" value="0.05"></label></div>
      <p id="hc-out" class="big mono"></p><p class="fine">F<sub>tendon</sub> = F<sub>ground</sub> × d<sub>external</sub> ÷ d<sub>tendon</sub>. Defaults are the booklet's worked example (single-leg heel raise); typical textbook moment arms, individual values vary (grade D).</p></section>
    <section class="card"><div class="card-h"><h2>Stretch the tendon</h2><small>Ch. 2.2</small></div><input type="range" id="ss-s" min="0" max="120" value="20" style="width:100%"><canvas id="ss-c" width="560" height="220" class="tis-c"></canvas>
      <p class="fine">Toe region below ~2% strain (crimped collagen straightens), linear region, failure beyond ~8–12% in isolated tissue; measured Achilles strain ~4.3% walking to 9.0% fast running. Curve shape is schematic; the marked strains are the booklet's.</p></section>
    <section class="card"><div class="card-h"><h2>After one heavy session · time</h2><small>Ch. 3–4, 12.1</small></div><input type="range" id="rc-t" min="0" max="1000" value="0" style="width:100%"><button class="ghost-btn" id="rc-play">▶ Play</button><canvas id="rc-c" width="560" height="240" class="tis-c"></canvas><div id="rc-txt" class="mini"></div>
      <p class="fine">Thickness: ~15% immediate drop, most back within ~6 h, full by ~24 h (time constant 2.5 h reported for eccentric loading). Collagen: breakdown peaks early; synthesis peaks ~24 h and stays raised ~72 h; structure changes over 8–12+ weeks. The thickness curve uses those numbers; the collagen curves are schematic shapes of the booklet's table, not measured values.</p></section>
    <section class="card"><div class="card-h"><h2>Collagen hierarchy</h2><small>Ch. 1.2</small></div><input type="range" id="hz-z" min="0" max="4" step="1" value="4" style="width:100%"><canvas id="hz-c" width="560" height="220" class="tis-c"></canvas><div id="hz-txt" class="mini"></div></section>`;
  const BWN = () => (+$('#lb-m').value || 75) * 9.81;
  P.querySelectorAll('[data-task]').forEach((b) => (b.onclick = () => { const i = +b.dataset.task; T.task = i < 0 ? null : { name: TASKS[i][0], bw: TASKS[i][1], txt: TASKS[i][2] }; if (T.task && !T.focus) focus('Achilles mid-portion'); $('#lb-out').innerHTML = T.task ? `<b>${esc(T.task.name)}</b>: ${esc(T.task.txt)} × BW ≈ <b class="mono">${Math.round(T.task.bw * BWN())} N</b> for ${$('#lb-m').value} kg` : ''; if (!T.task) T.focus?.set.forEach((m) => m.material.emissive?.setHex(0)); }));
  const hc = () => { const F = +$('#hc-f').value, de = +$('#hc-de').value, dt = +$('#hc-dt').value; const r = dt > 0 ? (F * de) / dt : NaN; $('#hc-out').textContent = Number.isFinite(r) ? `${Math.round(r).toLocaleString()} N  (${(r / F).toFixed(1)} × the ground force)` : '—'; };
  ['#hc-f', '#hc-de', '#hc-dt'].forEach((s) => ($(s).oninput = hc)); hc();
  const ss = () => drawSS(+$('#ss-s').value / 10); $('#ss-s').oninput = ss; ss();
  const rc = () => drawRC(+$('#rc-t').value / 1000); $('#rc-t').oninput = rc; rc();
  let play = null; $('#rc-play').onclick = () => { if (play) { clearInterval(play); play = null; $('#rc-play').textContent = '▶ Play'; return; } $('#rc-play').textContent = '❚❚ Pause'; play = setInterval(() => { const el = $('#rc-t'); if (!el) { clearInterval(play); return; } el.value = (+el.value + 4) % 1001; rc(); }, 40); };
  const hz = () => drawHZ(+$('#hz-z').value); $('#hz-z').oninput = hz; hz();
}
function ctx2(id) { const c = $(id), g = c.getContext('2d'), d = Math.min(2, devicePixelRatio || 1); if (c.dataset.s !== String(d)) { c.dataset.s = d; c.style.width = '100%'; c.width = c.clientWidth * d || 560 * d; c.height = (+c.getAttribute('height')) * d; } g.setTransform(d, 0, 0, d, 0, 0); return [g, c.width / d, c.height / d]; }
function drawSS(s) {
  const [g, W, H] = ctx2('#ss-c'); g.clearRect(0, 0, W, H);
  const X = (e) => 40 + (e / 12) * (W - 60), Y = (f) => H - 30 - f * (H - 50);
  const stress = (e) => (e <= 2 ? 0.08 * (e / 2) ** 2 : e <= 8 ? 0.08 + ((e - 2) / 6) * 0.82 : e <= 10 ? 0.9 + ((e - 8) / 2) * 0.1 : Math.max(0, 1 - (e - 10) * 0.45));
  g.strokeStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.moveTo(40, Y(0)); g.lineTo(W - 20, Y(0)); g.moveTo(40, Y(0)); g.lineTo(40, 10); g.stroke();
  g.fillStyle = 'rgba(94,240,176,.08)'; g.fillRect(X(0), 10, X(2) - X(0), Y(0) - 10); g.fillStyle = 'rgba(255,107,154,.1)'; g.fillRect(X(8), 10, X(12) - X(8), Y(0) - 10);
  g.strokeStyle = '#5ee7ff'; g.lineWidth = 2; g.beginPath(); for (let e = 0; e <= 12; e += 0.05) { const p = [X(e), Y(stress(e))]; e ? g.lineTo(...p) : g.moveTo(...p); } g.stroke();
  for (const [e, l] of [[4.3, 'walking 4.3%'], [9, 'fast run 9%']]) { g.strokeStyle = '#ffc067'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(X(e), Y(0)); g.lineTo(X(e), 14); g.stroke(); g.setLineDash([]); g.fillStyle = '#ffc067'; g.font = '10px system-ui'; g.fillText(l, X(e) + 3, 22); }
  g.fillStyle = '#ff3df2'; g.beginPath(); g.arc(X(s), Y(stress(s)), 5, 0, 6.283); g.fill();
  g.fillStyle = '#9fb3c8'; g.font = '11px system-ui'; g.fillText('strain %', W - 60, H - 10); g.fillText('force', 4, 16); g.fillText('toe', X(0.5), H - 34); g.fillText('linear', X(4.6), H - 34); g.fillText('failure', X(9.5), H - 34);
  const amp = s >= 2 ? 0 : 6 * (1 - s / 2), y0 = H - 14; g.strokeStyle = s > 10 ? '#ff6b6b' : '#e6ecff'; g.lineWidth = 1.5;
  for (let k = 0; k < 3; k++) { g.beginPath(); for (let x = 0; x <= 200; x += 2) { const yy = y0 - k * 4 + Math.sin(x / 9) * amp * 0.35; x ? g.lineTo(60 + x * (1 + s / 40), yy) : g.moveTo(60, yy); } g.stroke(); }
  g.fillStyle = '#e6ecff'; g.fillText(`${s.toFixed(1)}% · ${s < 2 ? 'crimp straightening' : s <= 8 ? 'collagen carrying load directly' : s <= 12 ? 'failure range (isolated tissue)' : 'beyond'}`, 280, H - 10);
}
function drawRC(f) {
  const [g, W, H] = ctx2('#rc-c'); g.clearRect(0, 0, W, H);
  // log time axis: 1 min .. 16 weeks
  const t0 = 1 / 60, t1 = 16 * 7 * 24, th = Math.exp(Math.log(t0) + f * (Math.log(t1) - Math.log(t0)));
  const X = (h) => 40 + ((Math.log(h) - Math.log(t0)) / (Math.log(t1) - Math.log(t0))) * (W - 60), Y = (v) => H - 30 - v * (H - 50);
  g.strokeStyle = 'rgba(255,255,255,.2)'; g.beginPath(); g.moveTo(40, Y(0)); g.lineTo(W - 20, Y(0)); g.stroke();
  for (const [h, l] of [[1 / 6, '10 min'], [6, '6 h'], [24, '24 h'], [72, '72 h'], [24 * 14, '2 wk'], [24 * 7 * 12, '12 wk']]) { g.fillStyle = '#7f8db0'; g.font = '10px system-ui'; g.fillText(l, X(h) - 10, H - 12); g.strokeStyle = 'rgba(255,255,255,.07)'; g.beginPath(); g.moveTo(X(h), 10); g.lineTo(X(h), Y(0)); g.stroke(); }
  const thick = (h) => 1 - 0.15 * Math.exp(-h / 2.5), syn = (h) => Math.exp(-((Math.log(h / 24)) ** 2) / 1.2), brk = (h) => Math.exp(-((Math.log(h / 8)) ** 2) / 1.0) * 0.8, str = (h) => 1 / (1 + Math.exp(-(h / 24 - 70) / 15));
  const line = (fn, col, sc = 1, off = 0) => { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); for (let i = 0; i <= 200; i++) { const h = Math.exp(Math.log(t0) + (i / 200) * (Math.log(t1) - Math.log(t0))); const p = [X(h), Y(off + fn(h) * sc)]; i ? g.lineTo(...p) : g.moveTo(...p); } g.stroke(); };
  line((h) => (thick(h) - 0.85) / 0.15, '#5ee7ff', 0.3, 0.68); line(brk, '#ff8fa3', 0.55); line(syn, '#5ef0b0', 0.55); line(str, '#b49bff', 0.25, 0.02);
  g.strokeStyle = '#ffd166'; g.beginPath(); g.moveTo(X(th), 8); g.lineTo(X(th), Y(0)); g.stroke();
  g.font = '11px system-ui'; [['thickness (−15% → back)', '#5ee7ff'], ['breakdown', '#ff8fa3'], ['synthesis', '#5ef0b0'], ['structure (stiffness, CSA)', '#b49bff']].forEach(([l, c], i) => { g.fillStyle = c; g.fillText(l, 46 + i * 130, 14); });
  const ts = th < 1 ? `${Math.round(th * 60)} min` : th < 48 ? `${th.toFixed(1)} h` : th < 24 * 21 ? `${(th / 24).toFixed(1)} days` : `${(th / 168).toFixed(1)} weeks`;
  const clock = th < 6 ? 'Mechanical clock: fluid squeezed out, tendon thinner; cells refractory (C)' : th < 24 ? 'Thickness recovering; breakdown phase — a second high-strain session now loads a softer tendon (Ch. 12)' : th < 72 ? 'Biological clock: synthesis peaks (~24 h) and stays raised (~72 h) — the window for the next heavy session (B)' : th < 24 * 7 * 8 ? 'Between sessions: repeat the 48–72 h rhythm; structure changes accumulate slowly' : 'Structural clock: stiffness, modulus and CSA change over 8–12+ weeks (A)';
  $('#rc-txt').innerHTML = `<b class="mono">${ts}</b> after loading · thickness ≈ <b>${(100 * thick(th)).toFixed(0)}%</b> of baseline · ${esc(clock)}`;
}
const HZ = [['Collagen molecule', 'triple helix, ~300 nm long'], ['Fibril', 'molecules staggered and crosslinked; tens to hundreds of nm wide'], ['Fibre', 'bundles of fibrils'], ['Fascicle', 'fibres wrapped in endotenon; the main load unit'], ['Tendon', 'fascicles wrapped in epitenon, often with a paratenon or sheath']];
function drawHZ(z) {
  const [g, W, H] = ctx2('#hz-c'); g.clearRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2, R = H * 0.42;
  const ring = (x, y, r, col, lw = 1.5) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.stroke(); };
  const pack = (x, y, r, n, depth) => { ring(x, y, r, ['#e6ecff', '#b49bff', '#8fd3ff', '#5ef0b0', '#ffc067'][depth], depth === z ? 2.5 : 1); if (depth >= 4 || r < 3) return; const k = 7, rr = r / 3.1; for (let i = 0; i < k; i++) { const a = (i / 6) * 6.283; const px = i === 6 ? x : x + Math.cos(a) * rr * 2.05, py = i === 6 ? y : y + Math.sin(a) * rr * 2.05; pack(px, py, rr, n, depth + 1); } };
  const startDepth = 4 - z; g.save(); pack(cx, cy, R, 0, startDepth); g.restore();
  $('#hz-txt').innerHTML = `<b>${esc(HZ[z][0])}</b>: ${esc(HZ[z][1])}. Each level has its own sheath and can slide on its neighbours; interfascicular sliding matters most in energy-storing tendons (Achilles, patellar). Drawing is schematic.`;
}

// ---- plan
function plan(P) {
  const Tb = T.book.tables, chap = (s) => T.book.chapters.find((c) => c.title.startsWith(s));
  const sub = (cTitle, h) => { const c = chap(cTitle); if (!c) return ''; const m = c.md.split(/\n(?=### )/).find((x) => x.startsWith(`### ${h}`)); return m || ''; };
  let rts = {}; try { rts = JSON.parse(localStorage.getItem('tissue-rts') || '{}'); } catch { /* none */ }
  const checklist = sub('Chapter 11', '11.5').split('\n').filter((l) => l.startsWith('- [ ]')).map((l) => l.replace('- [ ] ', ''));
  P.innerHTML = `<section class="card"><div class="card-h"><h2>Rehab stages &amp; gates</h2><small>Ch. 6.4</small></div>${md(sub('Chapter 6', '6.4'))}</section>
    <section class="card"><div class="card-h"><h2>Pain-monitoring model</h2><small>Ch. 6.2 (Silbernagel)</small></div>${table((Tb['6.2 The pain-monitoring model (Silbernagel)'] || [])[0])}</section>
    <section class="card"><div class="card-h"><h2>HSR template</h2><small>Ch. 5.3</small></div>${table((Tb['5.3 HSR vs eccentric: why HSR is now often preferred'] || [])[0])}
      <div class="bar"><button class="primary small" data-hsr="patellar">Create patellar HSR program in Builder</button><button class="primary small" data-hsr="achilles">Create Achilles HSR program in Builder</button></div><p id="hsr-msg" class="mini"></p>
      <p class="fine">Exercises as the booklet lists them (patellar: squat, leg press, hack squat; Achilles: seated and standing calf raise, leg press calf raise); 3 sessions a week; 3 s up / 3 s down; rest 2–3 min; pain up to ~5/10 that settles by next morning.</p></section>
    <section class="card"><div class="card-h"><h2>Force-and-speed ladder</h2><small>Ch. 12.7</small></div>${md(sub('Chapter 12', '12.7'))}</section>
    <section class="card"><div class="card-h"><h2>In-season week · preseason ramp</h2><small>Ch. 11.3–11.4</small></div>${table((Tb['11.3 In-season weekly template (one game a week)'] || [])[0])}${table((Tb['11.4 Preseason ramp (6 weeks)'] || [])[0])}</section>
    <section class="card"><div class="card-h"><h2>Daily decision rules</h2><small>Ch. 11.2 · 12.4</small></div>${md(sub('Chapter 11', '11.2'))}${md(sub('Chapter 12', '12.4'))}</section>
    <section class="card"><div class="card-h"><h2>Return-to-sport checklist</h2><small>Ch. 11.5 · saved in this browser</small></div>${checklist.map((c, i) => `<label class="comp" style="grid-template-columns:24px 1fr"><input type="checkbox" data-rts="${i}" ${rts[i] ? 'checked' : ''}><span>${esc(c)}</span></label>`).join('')}</section>`;
  P.querySelectorAll('[data-rts]').forEach((c) => (c.onchange = () => { rts[c.dataset.rts] = c.checked; try { localStorage.setItem('tissue-rts', JSON.stringify(rts)); } catch { /* blocked */ } }));
  P.querySelectorAll('[data-hsr]').forEach((b) => (b.onclick = async () => {
    const which = b.dataset.hsr, ex = which === 'patellar' ? ['Squat', 'Leg press', 'Hack squat'] : ['Seated calf raise', 'Standing calf raise', 'Leg press calf raise'];
    const W = [[1, '15RM', '3 x 15'], [2, '12RM', '3 x 12'], [3, '12RM', '3 x 12'], [4, '10RM', '4 x 10'], [5, '10RM', '4 x 10'], [6, '8RM', '4 x 8'], [7, '8RM', '4 x 8'], [8, '8RM', '4 x 8'], [9, '6RM', '4 x 6'], [10, '6RM', '4 x 6'], [11, '6RM', '4 x 6'], [12, '6RM', '4 x 6']];
    const post = (r, body) => fetch(`/api/ath/bld/${r}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json());
    try {
      b.disabled = true; $('#hsr-msg').textContent = 'Creating…';
      const p = await post('prog', { name: `${which === 'patellar' ? 'Patellar' : 'Achilles'} tendon HSR (12 weeks)`, goal: 'Rehab/Activation', level: 3, weeks: 12, spw: 3, mode: 'Rehab (pain-monitored)', description: 'From The Tendon Booklet Ch. 5.3 (Copenhagen HSR template): 3 s up / 3 s down, rest 2-3 min, pain up to ~5/10 that settles by next morning; progress by the 24-hour response, not the calendar (Ch. 6).' });
      if (!p.id) throw new Error(p.error || 'program not created');
      for (const [w, load, sr] of W) for (let d = 1; d <= 3; d++) for (const e of ex) await post('item', { prog: p.id, week: w, day: d, src: 'free', ref: 0, name: e, goal: 'Rehab/Activation', sets_reps: sr, load, tempo: '3-0-3', rest: '2-3 min', note: 'Booklet Ch. 5.3 HSR' });
      $('#hsr-msg').innerHTML = `Created in Training 4D → Builder → Program builder (12 weeks × 3 days). <a href="#train/build-prog/${p.id}">Open it</a>`;
    } catch (e) { $('#hsr-msg').textContent = e.message; } finally { b.disabled = false; }
  }));
}

// ---- learn: booklet reader
function learn(P) {
  const C = T.book.chapters;
  P.innerHTML = `<section class="card"><div class="card-h"><h2>${esc(T.book.title)}</h2></div><p class="mini">${esc(T.book.byline)} · ${esc(T.book.note)}</p>
    <input class="tr-in" id="bk-q" placeholder="Search the booklet"><div class="bar" style="margin-top:6px">${C.map((c, i) => `<button class="chip-btn" data-c="${i}">${esc(c.title.replace(/^Chapter (\d+) — /, '$1 · '))}</button>`).join('')}</div></section><section class="card bk" id="bk-body"></section>`;
  const show = (i, q = '') => { const c = C[i]; let h = md(c.md); if (q) h = h.replace(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>'); $('#bk-body').innerHTML = `<h2 style="text-transform:none;letter-spacing:0">${esc(c.title)}</h2>${h}`; P.querySelectorAll('[data-c]').forEach((b) => b.classList.toggle('on', +b.dataset.c === i)); };
  P.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => show(+b.dataset.c, $('#bk-q').value.trim())));
  $('#bk-q').onkeydown = (e) => { if (e.key !== 'Enter') return; const q = e.target.value.trim().toLowerCase(); const i = C.findIndex((c) => c.md.toLowerCase().includes(q)); if (i >= 0) show(i, e.target.value.trim()); };
  show(C.findIndex((c) => c.title.startsWith('Chapter 1')) >= 0 ? C.findIndex((c) => c.title.startsWith('Chapter 1')) : 0);
}
const UNV = (t) => (/from memory/i.test(t) ? ' <span class="unv" title="The booklet marks this as written from memory; its source was not opened for the booklet. Treat as unverified.">unverified</span>' : '');
function inline(s) {
  return esc(s).replace(/\\~/g, '~').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*([^*]+)\*/g, '<i>$1</i>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\((A|B|C|D)(?:\/(A|B|C|D))?\)|\bgrade ([ABCD](?:\/[ABCD])?)\b/g, (m) => `<span class="gr">${m}</span>`);
}
function md(src) {
  const L = String(src || '').split('\n'), out = []; let i = 0;
  while (i < L.length) {
    const l = L[i];
    if (/^```/.test(l)) { const buf = []; i++; while (i < L.length && !/^```/.test(L[i])) buf.push(L[i++]); i++; out.push(`<pre class="code">${esc(buf.join('\n'))}</pre>`); continue; }
    if (/^###\s/.test(l)) { out.push(`<h3>${inline(l.slice(4))}</h3>`); i++; continue; }
    if (l.startsWith('|') && /^\|\s*:?-{3}/.test(L[i + 1] || '')) { const cols = l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()); i += 2; const rows = []; while (i < L.length && L[i].startsWith('|')) rows.push(L[i++].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())); out.push(table({ cols, rows })); continue; }
    if (/^\s*([-*]|\d+\.)\s/.test(l)) { const ord = /^\s*\d+\./.test(l), items = []; while (i < L.length && /^\s*([-*]|\d+\.)\s/.test(L[i])) { let it = L[i++].replace(/^\s*([-*]|\d+\.)\s/, ''); while (i < L.length && /^\s{2,}\S/.test(L[i]) && !/^\s*([-*]|\d+\.)\s/.test(L[i])) it += ' ' + L[i++].trim(); items.push(it); } out.push(`<${ord ? 'ol' : 'ul'}>${items.map((x) => `<li>${inline(x.replace(/^\[ \] /, '☐ '))}${UNV(x)}</li>`).join('')}</${ord ? 'ol' : 'ul'}>`); continue; }
    if (!l.trim()) { i++; continue; }
    const buf = [l]; i++; while (i < L.length && L[i].trim() && !/^(#|\||```|\s*([-*]|\d+\.)\s)/.test(L[i])) buf.push(L[i++]);
    out.push(`<p>${inline(buf.join(' '))}${UNV(buf.join(' '))}</p>`);
  }
  return out.join('');
}
function table(t) { if (!t) return ''; return `<div class="tt-wrap" style="max-height:none"><table class="tt"><thead><tr>${t.cols.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map((c, i) => `<td class="mini">${inline(c)}${i === r.length - 1 ? UNV(r.join(' ')) : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; }

// ---- cards: spaced repetition from the booklet's own tables
function deck() {
  const Tb = T.book.tables, D = [];
  const add = (sec, f) => { for (const t of Tb[sec] || []) for (const r of t.rows) { const c = f(Object.fromEntries(t.cols.map((k, i) => [k, r[i]]))); if (c) D.push({ ...c, src: sec }); } };
  add('12.1 Myths vs evidence', (r) => ({ q: `Myth or fact? ${r.Myth}`, a: r['What the evidence shows'] }));
  add('4.1 The three recovery clocks', (r) => ({ q: `Recovery clock: ${r.Clock} — what recovers and how long?`, a: `${r['What recovers']} · ${r['Typical time']} (grade ${r.Evidence})` }));
  add('12.1 The adaptation timeline: seconds to months', (r) => ({ q: `Time scale: ${r['Time scale']} — what changes in the tendon?`, a: `${r['What changes in the tendon']} → ${r['Practical meaning']} (${r.Grade})` }));
  add('6.1 The dose variables', (r) => ({ q: `Dose variable: ${r.Variable} — evidence-based target?`, a: `${r['Evidence-based target']} · ${r.Notes} (${r.Grade})` }));
  add('1.1 Composition', (r) => ({ q: `Tendon component: ${r.Component} — share and job?`, a: `${r.Share} · ${r.Job} · when it changes: ${r['What happens when it changes']}` }));
  add('5.1 Summary table', (r) => ({ q: `Training mode: ${r.Mode} — best use?`, a: `${r['What it is']} · best use: ${r['Best use']} (${r.Grade})` }));
  add('2.3 Viscoelasticity', (r) => ({ q: `Viscoelastic effect: ${r.Effect}?`, a: `${r['What happens']} · ${r['Why it matters']}` }));
  (T.book.glossary.match(/\*([^*]+)\* is ([^.]+)\./g) || []).forEach((g) => { const m = /\*([^*]+)\* is ([^.]+)\./.exec(g); D.push({ q: `Define: ${m[1]}`, a: m[2], src: 'Words used throughout' }); });
  return D;
}
function cards(P) {
  const D = deck(); let S = {}; try { S = JSON.parse(localStorage.getItem('tissue-cards') || '{}'); } catch { /* none */ }
  const due = () => D.map((c, i) => ({ c, i, s: S[i] || { box: 0, due: 0 } })).filter((x) => x.s.due <= Date.now()).sort((a, b) => a.s.box - b.s.box);
  const save = () => { try { localStorage.setItem('tissue-cards', JSON.stringify(S)); } catch { /* blocked */ } };
  const boxes = [0, 1, 2, 3, 4, 5].map((b) => D.filter((_, i) => (S[i]?.box || 0) === b).length);
  const q = due()[0];
  P.innerHTML = `<section class="card"><div class="card-h"><h2>Flashcards</h2><small>${D.length} cards from the booklet's tables</small></div>
    <p class="mini">Boxes (Leitner): ${boxes.map((n, b) => `<span class="pill">${b}: ${n}</span>`).join(' ')} · due now ${due().length}. Right moves a card up a box (next review 1, 3, 7, 14, 30 days); wrong sends it back to box 0. Saved in this browser.</p></section>
    ${q ? `<section class="card flash"><div class="mini">${esc(q.c.src)}</div><h3>${inline(q.c.q)}</h3><div id="fl-a" class="note" hidden>${inline(q.c.a)}${UNV(q.c.a)}</div>
      <div class="bar"><button class="primary small" id="fl-show">Show answer</button><button class="ghost-btn" id="fl-ok" hidden>✓ I knew it</button><button class="ghost-btn" id="fl-no" hidden>✗ Not yet</button></div></section>` : '<section class="card"><p>All cards reviewed for now. Come back later.</p></section>'}`;
  if (!q) return;
  $('#fl-show').onclick = () => { $('#fl-a').hidden = false; $('#fl-show').hidden = true; $('#fl-ok').hidden = false; $('#fl-no').hidden = false; };
  const next = (ok) => { const s = S[q.i] || { box: 0 }; s.box = ok ? Math.min(5, s.box + 1) : 0; s.due = Date.now() + [0, 1, 3, 7, 14, 30][s.box] * 864e5; S[q.i] = s; save(); cards(P); };
  $('#fl-ok').onclick = () => next(true); $('#fl-no').onclick = () => next(false);
}
function sources(P) {
  const m = T.meta;
  P.innerHTML = `<section class="card"><div class="card-h"><h2>Sources &amp; licences</h2></div>
    <p><b>3D tissue:</b> ${esc(m?.source || '')}. Licence ${esc(m?.licence || '')}. Attribution: ${(m?.attribution || []).map(esc).join(' · ')}.</p>
    <p><b>Muscles, bones:</b> BodyParts3D (Database Center for Life Science, CC BY-SA 2.1 Japan). <b>Peripheral nerves:</b> Z-Anatomy (CC BY-SA 4.0).</p>
    <p><b>Booklet:</b> ${esc(T.book.title)} — ${esc(T.book.byline)}. ${esc(T.book.note)}</p>
    <p><b>Tissue types:</b> ${esc(T.know?.note || '')}</p>
    <p class="fine">The 4D views use the booklet's numbers; curve shapes marked schematic are teaching drawings, not measurements. Nothing here is a diagnosis or a treatment instruction.</p></section>`;
}
window.__tissue = T;
