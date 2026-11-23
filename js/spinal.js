// Spinal cord detail for the Brain map: segments, nerve roots, tracts, isolated view,
// radiology link and an alignment check. Facts are StatPearls sentences (unchanged,
// tools/spinal_cord_detail_build.py); geometry uses the reference body's real vertebrae.
//
// - Segments: 31 (8 C, 12 T, 5 L, 5 S, 1 Co) between the quoted ends of the cord (C1
//   vertebra level -> lower third of L1), spaced evenly (an approximation: real segments
//   differ in length). Enlargements as quoted: C4-T2 and L2-S3 segments.
// - Roots: from each segment, down inside the canal, out at the intervertebral level the
//   quoted rule gives (C1-C7 above their vertebra, the rest below; C8 between C7 and T1;
//   sacral roots spaced evenly along the sacrum). The lumbosacral roots therefore run down
//   the canal before leaving (the cauda equina). Schematic tubes, not nerve meshes.
// - Tracts: a labelled cross-section schematic (positions from the funiculus each tract's
//   own description names); a tract with a brain counterpart in the HCP1065 atlas (CST,
//   medial lemniscus) lights up that tract in 3D.

import * as THREE from 'three';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const REG = { C: ['Cervical', '#4cc9f0'], T: ['Thoracic', '#ffd166'], L: ['Lumbar', '#06d6a0'], S: ['Sacral', '#b388ff'], Co: ['Coccygeal', '#ff8fab'] };
const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
const regionOf = (s) => (s.startsWith('Co') ? 'Co' : s[0]);

export async function setupSpinal(B, atlas, root) {
  const D = await fetch('/training-4D/rt/brain/spinal_detail.json').then((r) => r.json()).catch(() => null);
  if (!D || !B.canal) return null;
  B.SD = D;
  const A = atlas.anchors, right = B.right, get = (n) => atlas.byName.get(n)?.geometry;
  const vname = (k, i) => (k === 'C' ? (i === 1 ? 'atlas' : i === 2 ? 'axis' : `${ORD[i - 1]} cervical vertebra`) : `${ORD[i - 1]} ${k === 'T' ? 'thoracic' : 'lumbar'} vertebra`);
  const V = {}; for (let i = 1; i <= 7; i++) V[`C${i}`] = get(vname('C', i)); for (let i = 1; i <= 12; i++) V[`T${i}`] = get(vname('T', i)); for (let i = 1; i <= 5; i++) V[`L${i}`] = get(vname('L', i));
  const sac = get('sacrum'); const cen = (g) => g?.boundingSphere.center.clone();
  // t on the canal at a given height (canal runs top -> bottom)
  const tAtY = (y) => { let lo = 0, hi = 1; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (B.along(m).y > y) lo = m; else hi = m; } return (lo + hi) / 2; };
  // ---- quoted ends of the cord
  const tTop = B.cordT?.top ?? (V.C1 ? tAtY(cen(V.C1).y) : 0);
  const L1 = V.L1?.boundingBox, tEnd = B.cordT?.end ?? (L1 ? tAtY(L1.min.y + (L1.max.y - L1.min.y) / 3) : 1);
  const segs = D.segments, n = segs.length, tSeg = (i) => tTop + ((tEnd - tTop) * (i + 0.5)) / n, tB = (i) => tTop + ((tEnd - tTop) * i) / n;
  B.segT = Object.fromEntries(segs.map((s, i) => [s, tSeg(i)]));
  const inRange = (s, a, b) => { const ia = segs.indexOf(a), ib = segs.indexOf(b), is = segs.indexOf(s); return is >= ia && is <= ib; };
  // ---- segment bands
  const G = new THREE.Group(); root.add(G); B.spinalG = G; const bands = new THREE.Group(), roots = new THREE.Group(); G.add(bands, roots);
  const tube = (pts, r, color, op = 0.6) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.max(8, pts.length * 4), r, 10, false), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false }));
  segs.forEach((s, i) => {
    const pts = []; for (let k = 0; k <= 6; k++) pts.push(B.along(tB(i) + ((tB(i + 1) - tB(i)) * k) / 6));
    const enl = inRange(s, 'C4', 'T2') || inRange(s, 'L2', 'S3');
    const m = tube(pts, enl ? 0.0082 : 0.0068, REG[regionOf(s)][1], 0.5); m.userData = { seg: s }; bands.add(m);
  });
  // ---- nerve roots per the quoted exit rule
  const yMid = (a, b) => (a && b ? (cen(a).y + cen(b).y) / 2 : null);
  const exitY = (s) => {
    const r = regionOf(s), i = +s.replace(/\D/g, '');
    if (r === 'C') { if (i === 1) return V.C1 ? V.C1.boundingBox.max.y + 0.004 : null; if (i <= 7) return yMid(V[`C${i - 1}`], V[`C${i}`]); return yMid(V.C7, V.T1); }
    if (r === 'T') return yMid(V[`T${i}`], i < 12 ? V[`T${i + 1}`] : V.L1);
    if (r === 'L') return i < 5 ? yMid(V[`L${i}`], V[`L${i + 1}`]) : (V.L5 && sac ? (cen(V.L5).y + sac.boundingBox.max.y) / 2 : null);
    if (r === 'S' && sac) { const bb = sac.boundingBox; return bb.max.y - ((bb.max.y - bb.min.y) * 0.8 * (i - 0.5)) / 5; }
    if (sac) return sac.boundingBox.min.y - 0.004;
    return null;
  };
  B.rootEnds = {}; B.drgPts = []; B.snapMoves = [];
  segs.forEach((s, i) => {
    const y = exitY(s); if (y == null) return;
    const col = REG[regionOf(s)][1], tExit = tAtY(y);
    for (const side of [1, -1]) {
      const start = B.along(tSeg(i)).addScaledVector(right, side * 0.0055);
      const inside = B.along(Math.max(tSeg(i), tExit)).addScaledVector(right, side * 0.008);
      let out = B.along(tExit).addScaledVector(right, side * 0.03);
      // snap to the real dorsal root ganglion (Z-Anatomy spinal ganglia) at this exit height, same side
      if (B.zGan) { let best = null, bd = 0.04 ** 2; for (const q of B.zGan) { if (Math.abs(q.y - out.y) > 0.012 || (q.clone().sub(B.along(tExit)).dot(right) * side) < 0.005) continue; const d = q.distanceToSquared(out); if (d < bd) { bd = d; best = q; } } if (best) { B.snapMoves.push(best.distanceTo(out)); out = best.clone(); } }
      const pts = tExit > tSeg(i) + 0.01 ? [start, B.along((tSeg(i) + tExit) / 2).addScaledVector(right, side * 0.007), inside, out] : [start, out];
      const m = tube(pts, 0.0011, col, 0.9); m.userData = { seg: s }; roots.add(m);
      const drg = new THREE.Mesh(new THREE.SphereGeometry(0.0028, 10, 8), new THREE.MeshBasicMaterial({ color: col })); drg.position.copy(B.zGan ? out : out.clone().addScaledVector(right, -side * 0.006)); roots.add(drg); B.drgPts.push(drg.position.clone());
      if (side === 1) B.rootEnds[s] = out;
    }
  });
  // ---- autonomic outflow re-attached at the quoted cord segments
  if (B.redrawAutonomic) B.redrawAutonomic({ T1: B.along(B.segT.T1), L2: B.along(B.segT.L2), sac: B.along((B.segT.S2 + B.segT.S4) / 2) });
  // ---- alignment check (numbers shown in the panel)
  B.spinalCheck = check(B, atlas, V, sac, tTop, tEnd); B.levelAtY = (y) => levelAt(V, sac, y);
  return { segments: n, roots: roots.children.length / 2 };
}

function levelAt(V, sac, y) {
  for (const [k, g] of Object.entries(V)) if (g && y <= g.boundingBox.max.y && y >= g.boundingBox.min.y) return k;
  if (sac && y <= sac.boundingBox.max.y && y >= sac.boundingBox.min.y) return 'sacrum';
  let best = null, bd = Infinity; for (const [k, g] of Object.entries(V)) { if (!g) continue; const d = Math.abs(g.boundingSphere.center.y - y); if (d < bd) { bd = d; best = k; } } return `near ${best}`;
}
function check(B, atlas, V, sac, tTop, tEnd) {
  const cord = B.meshes.find((m) => m.userData.kind === 'cord');
  const out = { canal_top: levelAt(V, sac, B.along(0).y), canal_bottom: levelAt(V, sac, B.along(1).y), quoted_top: 'C1', quoted_end: 'lower third of L1',
    cord_length_mm: Math.round(B.canal.len * (tEnd - tTop) * 1000), canal_length_mm: Math.round(B.canal.len * 1000), quoted_length_mm: 423, canal_from: B.canal.from || 'central canal mesh', foramina: (B.canalSrc || []).length, cord_top_level: levelAt(V, sac, B.along(tTop).y), cord_end_level: levelAt(V, sac, B.along(tEnd).y) };
  if (cord) {
    // clearance: cord surface vertices closer than 1 mm to any vertebra surface vertex (possible overlap with bone)
    const cell = 0.004, H = new Map(), key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
    for (const g of Object.values(V)) { if (!g) continue; const a = g.attributes.position.array; for (let i = 0; i < a.length; i += 6) { const k = key(a[i], a[i + 1], a[i + 2]); (H.get(k) || H.set(k, []).get(k)).push(a[i], a[i + 1], a[i + 2]); } }
    const a = cord.geometry.attributes.position.array; let close = 0, nv = 0, minD = Infinity;
    for (let i = 0; i < a.length; i += 3) {
      nv++; const x = a[i], y = a[i + 1], z = a[i + 2]; let best = Infinity;
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) { const c = H.get(`${cx + dx},${cy + dy},${cz + dz}`); if (!c) continue; for (let j = 0; j < c.length; j += 3) { const d = Math.hypot(c[j] - x, c[j + 1] - y, c[j + 2] - z); if (d < best) best = d; } }
      if (best < 0.001) close++; if (best < minD) minD = best;
    }
    out.cord_vertices = nv; out.within_1mm_of_bone = close; out.min_clearance_mm = Number.isFinite(minD) ? +(minD * 1000).toFixed(2) : null;
  }
  return out;
}

function zRows(B) {
  const Z = B.zCheck; if (!Z) return '<li>Real nerve models (Z-Anatomy): not loaded.</li>';
  const r = [];
  if (Z.xs_shift_mm != null) r.push(`<li>Z-Anatomy's cord cross-section (level ${esc(B.zxsLevel || '?')}) lies <b>${Z.xs_to_canal_mm_as_published} mm</b> from the canal centre line measured here from the vertebrae (independent agreement); shown moved ${Z.xs_shift_mm} mm onto the line, shape unchanged, mirrored from its one modelled half.</li>`);
  const sm = B.snapMoves || []; if (sm.length) { const s = [...sm].sort((a, b) => a - b); r.push(`<li>Root ends snapped to the real Z-Anatomy spinal ganglia at their exit height: <b>${sm.length}</b> of ${B.drgPts.length} roots (median move ${(s[Math.floor(s.length / 2)] * 1000).toFixed(1)} mm); the others keep the schematic position.</li>`); }
  if (Z.real_sym_trunk_to_canal_mm_median != null) r.push(`<li>Real sympathetic trunk: median <b>${Z.real_sym_trunk_to_canal_mm_median} mm</b> from the canal centre line (the schematic chain is drawn at 30 mm).</li>`);
  return r.join('');
}
// ------------------------------------------------------------------ panel: isolated view, tracts, radiology, check
export function spinalPanel(B, hooks) {
  const D = B.SD, el = $('#br-spinal'); if (!D || !el) return;
  const f = (k) => (D.facts[k] ? `<li>“${esc(D.facts[k].text)}” <small><i>${esc(D.facts[k].chapter)}</i></small></li>` : '');
  const C = B.spinalCheck || {};
  el.innerHTML = `<p class="btnrow"><button class="primary small" id="sp-view">Spinal cord view (isolated)</button><button class="ghost-btn" id="sp-mri">Spine MRI (sagittal, colour labels)</button><button class="ghost-btn" id="sp-xs3d">Cord cross-section close-up (real 3D)</button><label class="fine"><input type="checkbox" id="sp-labels" checked> Segment labels</label><label class="fine"><input type="checkbox" id="sp-roots" checked> Nerve roots</label></p>
    <div class="sp-legend">${Object.values(REG).map(([n, c]) => `<span><i style="background:${c}"></i>${n}</span>`).join('')} <span><i style="background:#ff9e00"></i>Sympathetic outflow T1-L2</span><span><i style="background:#b388ff"></i>Parasympathetic S2-S4</span></div>
    <details><summary class="fine">The facts this layout uses (quoted)</summary><ul class="fine au-q">${['extent', 'conus', 'count', 'cerv_enl', 'lumb_enl', 'exit_cerv', 'exit_rest', 'roots_caudal', 'cauda', 'lateral_horn', 'autonomic_horn'].map(f).join('')}</ul></details>
    <p class="fine"><b>Tracts in the cord</b> (click; schematic cross-section):</p>
    <div class="sp-xs">${crossSection(D)}</div>
    <div id="sp-tract" class="fine"></div>
    <details open><summary class="fine"><b>Alignment check</b> (measured on this model)</summary><ul class="fine">
      <li>Canal centre line measured from <b>${C.foramina}</b> vertebral foramina of this body (midline gap per vertebra), running <b>${esc(C.canal_top)}</b> to <b>${esc(C.canal_bottom)}</b> (${C.canal_length_mm} mm).</li>
      <li>Cord placed between the quoted ends: top at <b>${esc(C.cord_top_level)}</b>, end at <b>${esc(C.cord_end_level)}</b> (quoted: ${esc(C.quoted_top)} to the ${esc(C.quoted_end)}). Length along this body's canal: <b>${C.cord_length_mm} mm</b> (quoted male average ${C.quoted_length_mm} mm).</li>
      ${C.cord_vertices ? `<li>Cord surface vs vertebrae: <b>${C.within_1mm_of_bone}</b> of ${C.cord_vertices.toLocaleString()} cord vertices lie within 1 mm of bone; closest approach ${C.min_clearance_mm} mm.</li>` : ''}
      ${zRows(B)}
      <li>Not validated against imaging of this body: segment spacing is even between the quoted ends; the coloured roots and the autonomic lines are schematic. The Z-Anatomy nerves are real 3D models.</li></ul></details>
    <p class="fine cite">${esc(D.licence)}. Spinal cord surface: TotalSegmentator MRI (CC BY 4.0). ${(B.zAttr || ['BodyParts3D - The Database Center for Life Science - CC-BY-SA 2.1 Japan']).map(esc).join(' · ')}.</p>`;
  $('#sp-view').onclick = () => hooks.isolate();
  $('#sp-mri').onclick = () => import('./mri_studio.js').then((m) => m.openMriStudio({ coll: 'body', sub: 's0175', big: 'sa' }));
  $('#sp-labels').onchange = (e) => { B.spLabels = e.target.checked; };
  const xb = $('#sp-xs3d'); if (xb) { if (!B.groups.get('Cord cross-section enlarged ×6')) xb.disabled = true; xb.onclick = () => {
    hooks.isolate(); const ms = B.groups.get('Cord cross-section enlarged ×6') || []; if (!ms.length) return;
    const b = new THREE.Box3(); ms.forEach((m) => b.expandByObject(m)); const c = b.getCenter(new THREE.Vector3()), r = b.getSize(new THREE.Vector3()).length();
    B.camera.position.set(c.x, c.y + r * 1.6, c.z + r * 0.15 * (B.atlas.anchors.anterior || 1)); B.controls.target.copy(c); B.controls.update();
  }; }
  $('#sp-roots').onchange = (e) => { B.spinalG.children[1].visible = e.target.checked; };
  B.spLabels = true;
  el.querySelectorAll('[data-tr]').forEach((p) => (p.onclick = () => showTract(B, D.tracts.find((t) => t.id === p.dataset.tr), hooks)));
}
// schematic transverse section: H-shaped grey matter, white-matter funiculi, tract regions on both sides
function crossSection(D) {
  const pos = { dc: [[0, 34, 16, 14]], lst: [[52, 2, 12, 10]], ast: [[30, -32, 12, 9]], scb: [[66, 14, 8, 16]], lcst: [[48, 22, 12, 11]], acst: [[10, -40, 8, 9]] };
  const col = { dc: '#4cc9f0', lst: '#ff5d8f', ast: '#f78c6b', scb: '#06d6a0', lcst: '#ffd166', acst: '#b388ff' };
  const shapes = D.tracts.map((t) => (pos[t.id] || []).flatMap(([x, y, rx, ry]) => [1, -1].map((s) => `<ellipse data-tr="${t.id}" cx="${100 + s * x}" cy="${90 - y}" rx="${rx}" ry="${ry}" fill="${col[t.id]}" fill-opacity="0.55" stroke="${col[t.id]}"><title>${esc(t.name)}</title></ellipse>`)).join('')).join('');
  return `<svg viewBox="0 0 200 180" class="sp-svg"><ellipse cx="100" cy="90" rx="86" ry="66" fill="#e8eef5" fill-opacity="0.12" stroke="#9fc0e0"/>
    <path d="M100 52 C 92 60 74 40 64 52 C 58 60 80 78 88 86 C 80 96 60 112 66 124 C 74 136 92 116 100 112 C 108 116 126 136 134 124 C 140 112 120 96 112 86 C 120 78 142 60 136 52 C 126 40 108 60 100 52 Z" fill="#9b8ec4" fill-opacity="0.55" stroke="#c9b8ff"><title>Grey matter (H / butterfly shape)</title></path>
    ${shapes}<text x="100" y="18" text-anchor="middle" fill="#9fc0e0" font-size="9">posterior (dorsal)</text><text x="100" y="172" text-anchor="middle" fill="#9fc0e0" font-size="9">anterior (ventral)</text></svg>
    <ul class="sp-tl">${D.tracts.map((t) => `<li data-tr="${t.id}"><i style="background:${col[t.id]}"></i>${esc(t.name)} <small>${t.direction} · ${t.funiculus} funiculus</small></li>`).join('')}</ul>`;
}
function showTract(B, t, hooks) {
  if (!t) return;
  document.querySelectorAll('.sp-svg [data-tr]').forEach((e) => e.setAttribute('fill-opacity', e.dataset.tr === t.id ? '0.95' : '0.2'));
  $('#sp-tract').innerHTML = `<h3 class="st-h">${esc(t.name)}</h3><p class="fine">${esc(t.direction)} · ${esc(t.funiculus)} funiculus (as named in its description; position in the drawing is schematic)${t.hcp ? ` · brain part shown in 3D: HCP1065 <b>${esc(t.hcp)}</b> tract` : ' · no matching tract in the brain atlas'}</p>
    <ul class="fine au-q">${t.quotes.map((q) => `<li>“${esc(q.text)}” <small><i>${esc(q.chapter)}</i></small></li>`).join('')}</ul>`;
  if (t.hcp) hooks.showBrainTract(t.hcp);
}

// segment labels projected on screen (called every frame by the Brain map's label pass)
export function spinalLabels(B, host, cam) {
  if (!B.SD || !B.spLabels || !B.spinalG?.visible) return '';
  const r = host.getBoundingClientRect(), v = new THREE.Vector3(), out = [];
  for (const [s, t] of Object.entries(B.segT)) {
    v.copy(B.rootEnds[s] || B.along(t)).project(cam); if (v.z > 1) continue;
    const x = ((v.x + 1) / 2) * r.width + 6, y = ((1 - v.y) / 2) * r.height - 7;
    out.push(`<span class="lab-lbl sp-lbl" style="transform:translate(${x}px,${y}px);border-color:${REG[regionOf(s)][1]}">${s}</span>`);
  }
  return out.join('');
}
