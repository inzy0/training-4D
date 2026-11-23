// Spinal cord, autonomic nervous system and target organs for the Brain map.
//
// - Spinal cord: surface from a labelled open MRI (TotalSegmentator MRI s0175, CC BY 4.0;
//   tools/spinal_cord_build.py), placed along the central canal of the BodyParts3D body
//   (approximate fit: that subject's cross-section, this body's course).
// - Organs: the reference body's organs that the quoted autonomic texts name.
// - Sympathetic / parasympathetic: SCHEMATIC connections, not anatomical nerve routes
//   (no openly licensed 3D model of these nerves is available here). Outflow levels come
//   from the quoted sentences: sympathetic T1-L2 (thoracolumbar); parasympathetic cranial
//   nerves III, VII, IX, X and S2-S4 (craniosacral). A parasympathetic line is drawn only
//   when an organ's quoted sentences name the route (cranial nerve / vagus, or pelvic /
//   sacral); otherwise the organ is shown without a line. Text: StatPearls, unchanged.

import * as THREE from 'three';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ORG_COL = ['#ff8fab', '#ffd166', '#f78c6b', '#90e0ef', '#06d6a0', '#b388ff', '#e9ff70', '#ff9e00', '#80ffdb', '#ff70a6', '#70d6ff', '#c77dff'];
const SYM = '#ff9e00', PARA = '#b388ff';

export async function setupAutonomic(B, atlas, root) {
  const [AU, SC] = await Promise.all([fetch('/training-4D/rt/brain/autonomic.json').then((r) => r.json()).catch(() => null), fetch('/training-4D/rt/brain/spinal_cord.json').then((r) => r.json()).catch(() => null)]);
  B.AU = AU; const A = atlas.anchors;
  const right = new THREE.Vector3(-A.leftX, 0, 0), ant = new THREE.Vector3(0, 0, A.anterior);
  const add = (geometry, color, kind, group, extra = {}) => {
    // organs and the bony framework are semi-transparent so the cord and the connections stay visible
    const op = extra.opacity ?? (kind === 'organ' ? 0.42 : 1), see = op < 1;
    const m = new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, clearcoat: 0.3, side: THREE.DoubleSide, transparent: true, opacity: op, depthWrite: !see, clippingPlanes: extra.cut ? [B.spineCut] : null }));
    m.userData.op = op;
    m.userData = { kind, group, color, base: geometry.boundingSphere.center.clone(), ...extra };
    root.add(m); B.meshes.push(m); if (!B.groups.has(group)) B.groups.set(group, []); B.groups.get(group).push(m); return m;
  };
  // ---- bony framework: vertebral column (vertebrae + discs), pelvis, rib cage (BodyParts3D)
  B.spineCut = new THREE.Plane(new THREE.Vector3(A.leftX, 0, 0), 9); // midline cut, enabled from the panel
  for (const { part, geometry } of atlas.parts) {
    const base = part.name.replace(/\b(left|right) /, '');
    if (part.layer !== 'skeleton') continue;
    if (/vertebra$|^atlas$|^axis$/.test(base)) add(geometry, '#e9e2cf', 'bone', 'Vertebral column', { part, opacity: 0.38, cut: true });
    else if (/^intervertebral disk/.test(base)) add(geometry, '#5fa8ff', 'bone', 'Vertebral column', { part, opacity: 0.5, cut: true });
    else if (/^hip bone$|^sacrum$|coccy/.test(base)) add(geometry, '#e9e2cf', 'bone', 'Pelvis', { part, opacity: 0.4, cut: true });
    else if (/\brib$|costal cartilage|sternum/.test(base)) add(geometry, '#e9e2cf', 'bone', 'Rib cage', { part, opacity: 0.25 });
  }

  // ---- vertebral canal centre line, measured from this body's own vertebrae (top -> bottom, by arc length).
  // BodyParts3D's "central canal of spinal cord" mesh covers only ~C1-C2, so it cannot carry the cord.
  // For each vertebra: take its midline slab (|x - centre| < 4 mm), project onto the antero-posterior
  // axis, and take the widest empty interval between the vertebral body (front) and the arch (back):
  // that interval is the vertebral foramen in the midline; its middle is the canal centre.
  const ORDN = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
  const vnames = ['atlas', 'axis', ...[3, 4, 5, 6, 7].map((k) => `${ORDN[k - 1]} cervical vertebra`), ...ORDN.map((o) => `${o} thoracic vertebra`), ...ORDN.slice(0, 5).map((o) => `${o} lumbar vertebra`)];
  const foramen = (arr, cx, yLo = -Infinity, yHi = Infinity) => {
    const zs = [];
    for (let k = 0; k < arr.length; k += 3) { const y = arr[k + 1]; if (Math.abs(arr[k] - cx) < 0.004 && y >= yLo && y <= yHi) zs.push([arr[k + 2] * A.anterior, y]); }
    if (zs.length < 20) return null;
    zs.sort((a, b) => a[0] - b[0]);
    let bi = -1, bg = 0; for (let k = 1; k < zs.length; k++) { const g = zs[k][0] - zs[k - 1][0]; if (g > bg) { bg = g; bi = k; } }
    if (bg < 0.005) return null;
    const zMid = (zs[bi][0] + zs[bi - 1][0]) / 2, front = zs.slice(bi).filter((q) => q[0] < zs[bi][0] + 0.006);
    const y = front.reduce((t, q) => t + q[1], 0) / front.length;   // height of the front wall (body / anterior arch) next to the foramen
    return { p: new THREE.Vector3(cx, y, zMid * A.anterior), gap: bg };
  };
  const raw = []; B.canalSrc = [];
  for (const n of vnames) {
    const g = atlas.byName.get(n)?.geometry; if (!g) continue;
    g.computeBoundingBox(); const bb = g.boundingBox, f = foramen(g.attributes.position.array, (bb.min.x + bb.max.x) / 2);
    if (f) { raw.push(f.p); B.canalSrc.push({ v: n, ap_mm: +(f.gap * 1000).toFixed(1) }); }
  }
  const sacG = atlas.byName.get('sacrum')?.geometry;
  if (sacG) {
    sacG.computeBoundingBox(); const bb = sacG.boundingBox, cx = (bb.min.x + bb.max.x) / 2, NB = 6, h = (bb.max.y - bb.min.y) / NB;
    for (let k = 0; k < NB; k++) { const f = foramen(sacG.attributes.position.array, cx, bb.max.y - (k + 1) * h, bb.max.y - k * h); if (f) { raw.push(f.p); B.canalSrc.push({ v: `sacrum band ${k + 1}/${NB}`, ap_mm: +(f.gap * 1000).toFixed(1) }); } }
  }
  if (raw.length >= 6) {
    // light smoothing (keeps the ends), plus a short extension above C1 toward the foramen magnum
    const sm = raw.map((q, k) => (k === 0 || k === raw.length - 1 ? q.clone() : q.clone().multiplyScalar(0.5).addScaledVector(raw[k - 1], 0.25).addScaledVector(raw[k + 1], 0.25)));
    const up = sm[0].clone().sub(sm[1]).normalize(); sm.unshift(sm[0].clone().addScaledVector(up, 0.012));
    const curve = new THREE.CatmullRomCurve3(sm, false, 'centripetal'), line = curve.getSpacedPoints(160);
    const arc = [0]; for (let k = 1; k < line.length; k++) arc.push(arc[k - 1] + line[k].distanceTo(line[k - 1]));
    B.canal = { line, arc, len: arc[arc.length - 1], from: 'vertebral foramina (midline gap per vertebra)' };
  }
  const along = (t) => { const { line: L, arc, len } = B.canal, s = Math.max(0, Math.min(1, t)) * len; let i = 1; while (i < arc.length - 1 && arc[i] < s) i++; const f = (s - arc[i - 1]) / (arc[i] - arc[i - 1] || 1); return L[i - 1].clone().lerp(L[i], f); };
  const nearestT = (p) => { const { line: L, arc, len } = B.canal; let best = 0, bd = Infinity; L.forEach((q, i) => { const d = q.distanceTo(p); if (d < bd) { bd = d; best = arc[i] / len; } }); return best; };
  // ---- spinal cord surface placed along the canal
  const tAtY = (y) => { let lo = 0, hi = 1; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (along(m).y > y) lo = m; else hi = m; } return (lo + hi) / 2; };
  if (B.canal) {
    const c1 = atlas.byName.get('atlas')?.geometry, l1 = atlas.byName.get('first lumbar vertebra')?.geometry;
    B.cordT = { top: c1 ? tAtY(c1.boundingSphere.center.y) : 0, end: l1 ? tAtY(l1.boundingBox.min.y + (l1.boundingBox.max.y - l1.boundingBox.min.y) / 3) : 1 };
  }
  if (SC && B.canal) {
    const v = SC.v, pos = new Float32Array((v.length / 3) * 3), { top: cT, end: cE } = B.cordT;
    for (let i = 0, k = 0; i < v.length; i += 3, k += 3) { const c = along(cT + (cE - cT) * v[i]); c.addScaledVector(right, v[i + 1] / 1000).addScaledVector(ant, v[i + 2] / 1000); pos[k] = c.x; pos[k + 1] = c.y; pos[k + 2] = c.z; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(SC.f); g.computeVertexNormals(); g.computeBoundingSphere();
    add(g, '#f1e3b0', 'cord', 'Spinal cord', { part: { name: 'spinal cord', id: 'MRI s0175' }, dname: 'Spinal cord (fitted from open MRI)' });
  }
  // ---- organs named by the autonomic texts
  const organs = AU ? Object.entries(AU.organs).filter(([, o]) => o.mesh) : [];
  B.organs = [];
  organs.forEach(([name, o], i) => {
    const re = new RegExp(o.mesh), ms = [];
    for (const { part, geometry } of atlas.parts) {
      const base = part.name.replace(/\b(left|right) /, '');
      if (re.test(base) && part.layer !== 'skeleton') ms.push(add(geometry, ORG_COL[i % ORG_COL.length], 'organ', 'Organs (autonomic targets)', { part, organ: name, dname: `${part.name} · ${name}` }));
    }
    if (ms.length) { const b = new THREE.Box3(); ms.forEach((m) => b.expandByObject(m)); B.organs.push({ name, o, center: b.getCenter(new THREE.Vector3()), meshes: ms, color: ORG_COL[i % ORG_COL.length] }); }
  });
  // ---- schematic connections
  const G = new THREE.Group(); root.add(G); B.autoG = G; B.symG = new THREE.Group(); B.paraG = new THREE.Group(); G.add(B.symG, B.paraG);
  const dashed = (pts, color, grp, w = 1) => { const g = new THREE.BufferGeometry().setFromPoints(pts); const l = new THREE.Line(g, new THREE.LineDashedMaterial({ color, dashSize: 0.012, gapSize: 0.008, transparent: true, opacity: 0.95 })); l.computeLineDistances(); grp.add(l); return l; };
  const tube = (a, b, color, grp, r) => { if (!B.canal) return; const tA = nearestT(a), tB = nearestT(b), pts = []; for (let k = 0; k <= 30; k++) pts.push(along(tA + ((tB - tA) * k) / 30)); grp.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, r, 10, false), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false }))); return pts; };
  const vc = (n) => atlas.byName.get(n)?.geometry.boundingSphere.center.clone();
  B.along = along; B.nearestT = nearestT; B.right = right; B.ant = ant;
  const med = atlas.byName.get('segment of hindbrain')?.geometry.boundingSphere.center.clone() || (B.canal ? along(0) : null);
  // draw (or redraw) the schematic: anch = { T1, L2, sac } points where each outflow leaves
  B.redrawAutonomic = (anch) => {
    for (const g of [B.symG, B.paraG]) while (g.children.length) { const c = g.children.pop(); c.geometry?.dispose?.(); }
    const { T1, L2, sac } = anch;
    if (T1 && L2 && B.canal) {
      const band = tube(T1, L2, SYM, B.symG, 0.0095);
      // sympathetic chain (schematic): beside the cord over the stated outflow T1-L2, both sides
      for (const s of [1, -1]) dashed(band.map((p) => p.clone().addScaledVector(right, s * 0.03)), SYM, B.symG);
      for (const org of B.organs) {
        if (!org.o.sympathetic.length && !org.o.both.length) continue;
        const tO = Math.max(nearestT(band[0]), Math.min(nearestT(band[band.length - 1]), nearestT(org.center)));
        const side = org.center.clone().sub(along(tO)).dot(right) >= 0 ? 1 : -1;
        dashed([along(tO).addScaledVector(right, side * 0.03), org.center], SYM, B.symG);
      }
    }
    if (med) B.paraG.add(new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 12), new THREE.MeshBasicMaterial({ color: PARA })).translateX(med.x).translateY(med.y).translateZ(med.z));
    if (sac) B.paraG.add(new THREE.Mesh(new THREE.SphereGeometry(0.01, 16, 12), new THREE.MeshBasicMaterial({ color: PARA })).translateX(sac.x).translateY(sac.y).translateZ(sac.z));
    B.paraRoute = {};
    for (const org of B.organs) {
      const qs = [...org.o.parasympathetic, ...org.o.both].map((q) => q.text).join(' ');
      const cranial = /vag|cranial|oculomotor|facial|glossopharyngeal|\bIII\b|\bVII\b|\bIX\b/.test(qs), sacral = /pelvic|sacral|S2|S4/.test(qs);
      const head = med && org.center.y > med.y - 0.05;
      const route = cranial && (head || !sacral) ? 'cranial' : sacral && !head ? 'sacral' : null;
      B.paraRoute[org.name] = route;
      if (route === 'cranial' && med) dashed([med, org.center], PARA, B.paraG);
      if (route === 'sacral' && sac) dashed([sac, org.center], PARA, B.paraG);
    }
  };
  B.redrawAutonomic({ T1: vc('first thoracic vertebra'), L2: vc('second lumbar vertebra'), sac: vc('sacrum') });
  // the midline cut passes through the cord's centre line
  if (B.canal) { const mx = B.canal.line.reduce((s, p) => s + p.x, 0) / B.canal.line.length; B.spineCut.constant = -A.leftX * mx; B.spineCutOn = false; B.spineCut.constant += 9; }
  return { organs: B.organs.length, cord: !!(SC && B.canal), vertebral: (B.groups.get('Vertebral column') || []).length, pelvis: (B.groups.get('Pelvis') || []).length };
}

export function autonomicPanel(B, selectOrgan) {
  const AU = B.AU, el = $('#br-auto'); if (!AU || !el) return;
  const q = (x) => `<li>“${esc(x.text)}” <small><i>${esc(x.chapter)}</i></small></li>`;
  el.innerHTML = `<p class="fine"><label><input type="checkbox" id="br-sym" checked> <b style="color:${SYM}">Sympathetic</b> (thoracolumbar)</label> · <label><input type="checkbox" id="br-para" checked> <b style="color:${PARA}">Parasympathetic</b> (craniosacral)</label></p>
    <details open><summary class="fine">Where each system leaves the central nervous system (quoted)</summary>
      <p class="fine"><b style="color:${SYM}">Sympathetic</b></p><ul class="fine au-q">${AU.outflow.sympathetic.filter((x) => /T1|thoracolumbar|lumbar/.test(x.text)).slice(0, 3).map(q).join('')}</ul>
      <p class="fine"><b style="color:${PARA}">Parasympathetic</b></p><ul class="fine au-q">${AU.outflow.parasympathetic.filter((x) => /cranial nerves|S2|craniosacral/.test(x.text)).slice(0, 3).map(q).join('')}</ul></details>
    <p class="fine"><label><input type="checkbox" id="br-cut"> Cut the spine and pelvis in half (midline) to see the cord in the canal</label></p>
    <p class="fine"><b>Organs</b> (click for the quoted effects of each system):</p>
    <div class="mol-chips">${B.organs.map((o, i) => `<button class="ghost-btn" data-org="${i}"><span class="sw" style="background:${o.color}"></span> ${esc(o.name)}</button>`).join('')}</div>
    <p class="fine muted">Connections are schematic, not nerve routes: the 3D model has no sympathetic trunk or vagus. Orange: the stated T1-L2 outflow band on the cord, a chain beside it, and a line to each organ whose quoted text names a sympathetic effect (attached at the organ's height within T1-L2, not its true segmental level). Purple: lines from the brainstem (cranial nerves III, VII, IX, X) or the sacrum (S2-S4) only where an organ's quoted sentences name that route. ${esc(AU.rule)}</p>`;
  el.querySelectorAll('[data-org]').forEach((b) => (b.onclick = () => selectOrgan(B.organs[+b.dataset.org])));
  $('#br-sym').onchange = (e) => { B.symG.visible = e.target.checked; };
  $('#br-cut').onchange = (e) => { B.spineCut.constant += e.target.checked ? -9 : 9; };
  $('#br-para').onchange = (e) => { B.paraG.visible = e.target.checked; };
}

export function organHtml(B, org) {
  const q = (x) => `<li>“${esc(x.text)}” <small><i>${esc(x.chapter)}</i></small></li>`, o = org.o;
  return `<h3 class="st-h"><span class="sw" style="background:${org.color}"></span> ${esc(org.name)}</h3>
    <p class="fine"><b style="color:${SYM}">Sympathetic</b></p><ul class="fine au-q">${o.sympathetic.map(q).join('') || '<li class="muted">No sentence in the quoted chapters names a sympathetic effect here.</li>'}</ul>
    <p class="fine"><b style="color:${PARA}">Parasympathetic</b> ${B.paraRoute[org.name] ? `<small>(route named: ${B.paraRoute[org.name]})</small>` : '<small>(route not named in these sentences: no line drawn)</small>'}</p><ul class="fine au-q">${o.parasympathetic.map(q).join('') || '<li class="muted">No sentence in the quoted chapters names a parasympathetic effect here.</li>'}</ul>
    ${o.both.length ? `<p class="fine"><b>Both systems</b></p><ul class="fine au-q">${o.both.map(q).join('')}</ul>` : ''}
    <p class="fine cite">StatPearls chapters, CC BY-NC-ND 4.0, sentences unchanged. Filed by a mechanical rule (organ word + system name in the same sentence).</p>`;
}
