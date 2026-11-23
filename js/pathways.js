// Signal pathways in the Brain map, animated live: ascending sensory, descending motor, feedback loops
// (basal ganglia, cerebellum, thalamocortical, Papez), special senses, language, limbic, autonomic, reflex.
// Route = an authored station list (tools/brain_pathways_build.py), drawn through the app's real 3D
// objects: BodyParts3D structures, HCP1065 tract centre lines (mean of the tract's streamlines), the
// spinal cord segments, and a thalamus position estimated from the thalamic-radiation endpoints.
// Text = verbatim StatPearls sentences. Pulse timing is illustrative, not measured conduction time.

import * as THREE from 'three';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FAM_COL = { 'Ascending sensory': '#4cc9f0', 'Descending motor': '#ff6b6b', 'Feedback loop': '#ffd166', Limbic: '#b388ff', 'Special senses': '#06d6a0', Association: '#f78c6b', Autonomic: '#ff9e00', Reflex: '#e9ff70' };
const unside = (n) => n.replace(/\b(left|right) /g, '');

export async function setupPathways(B, scene, hooks) {
  const D = await fetch('/training-4D/rt/brain/pathways.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const el = $('#br-paths'); if (!D || !el) return null;
  const G = new THREE.Group(); scene.add(G);
  const P = { D, G, cur: null, side: 'L', speed: 1, t: 0, play: true, reverse: false, multi: [], fade: false };
  B.paths = P;

  // ---- station resolvers
  const meshFor = (name, side) => {
    const want = unside(name).toLowerCase(), sw = side === 'L' ? 'left' : 'right';
    const ok = (m) => ['brain', 'nerve', 'organ'].includes(m.userData.kind);
    let ms = B.meshes.filter((m) => ok(m) && unside(m.userData.part.name).toLowerCase() === want);
    if (!ms.length) ms = B.meshes.filter((m) => ok(m) && unside(m.userData.part.name).toLowerCase().includes(want));
    return ms.find((m) => new RegExp(`\\b${sw}\\b`).test(m.userData.part.name)) || ms[0] || null;
  };
  const lines = (L) => { // streamlines of one HCP tract mesh as arrays of Vector3
    const a = L.geometry.attributes.position.array, nl = L.userData.tract.lines || 1, segs = a.length / 6, per = Math.round(segs / nl), out = [];
    for (let l = 0; l < nl; l++) { const pts = []; for (let p = 0; p < per; p++) { const b = (l * per + p) * 6; pts.push(new THREE.Vector3(a[b], a[b + 1], a[b + 2])); } const e = (l * per + per - 1) * 6 + 3; pts.push(new THREE.Vector3(a[e], a[e + 1], a[e + 2])); out.push(pts); }
    return out;
  };
  const tractFor = (abbr, side) => B.tracts.find((L) => L.userData.tract.abbr === abbr && (!L.userData.tract.hemi || L.userData.tract.hemi === side)) || B.tracts.find((L) => L.userData.tract.abbr === abbr);
  const centreLine = (L, ref) => {
    const ls = lines(L); if (!ls.length) return [];
    const n = ls[0].length, acc = Array.from({ length: n }, () => new THREE.Vector3());
    for (const pts of ls) { const flip = ref && pts[0].distanceTo(ref) > pts[n - 1].distanceTo(ref); for (let i = 0; i < n; i++) acc[i].add(pts[flip ? n - 1 - i : i]); }
    return acc.map((v) => v.multiplyScalar(1 / ls.length));
  };
  const thal = {};
  const thalamus = (side) => {
    if (thal[side]) return thal[side];
    const c = B.center || new THREE.Vector3(), acc = new THREE.Vector3(); let n = 0;
    for (const ab of ['TR_A', 'TR_S', 'TR_P']) { const L = tractFor(ab, side); if (!L) continue; for (const pts of lines(L)) { const a = pts[0], b = pts[pts.length - 1]; acc.add(a.distanceTo(c) < b.distanceTo(c) ? a : b); n++; } }
    return (thal[side] = n ? acc.multiplyScalar(1 / n) : null);
  };
  const named = (n) => B.meshes.find((m) => m.userData.part.name === n);
  const cordPt = (seg, side) => (B.along && B.segT?.[seg] != null ? B.along(B.segT[seg]).addScaledVector(B.right || new THREE.Vector3(1, 0, 0), (side === 'R' ? 1 : -1) * 0.004) : null);

  function build(pw, side0) {
    let side = side0; const pts = [], marks = [], meshes = [], tracts = [], missing = [];
    for (const st of pw.steps) {
      const prev = pts[pts.length - 1];
      let add = null;
      if (st.k === 'x') { side = side === 'L' ? 'R' : 'L'; marks.push({ i: pts.length, label: st.label }); continue; }
      if (st.k === 's') { const m = meshFor(st.v, side); if (m) { meshes.push(m); m.geometry.computeBoundingSphere(); add = [m.geometry.boundingSphere.center.clone()]; } }
      else if (st.k === 't') { const L = tractFor(st.v, side); if (L) { tracts.push(L); add = centreLine(L, prev); } }
      else if (st.k === 'thal') { const t = thalamus(side); if (t) add = [t.clone()]; }
      else if (st.k === 'cord') { const c = cordPt(st.v, side); if (c) add = [c]; }
      else if (st.k === 'n' || st.k === 'a') { // atlas nuclei (CIT168 / Harvard AAN); AAN missing -> labelled approximate brainstem station
        const m = B.nucleusMesh?.(st.v, side);
        if (m) { meshes.push(m); m.geometry.computeBoundingSphere(); add = [m.geometry.boundingSphere.center.clone()]; }
        else if (st.k === 'a' && B.aanFallback?.[st.v]) { const fb = B.aanFallback[st.v], mm = fb[0] === 's' ? meshFor(fb[1], side) : named(fb[0] === 'pons' ? 'segment of metencephalon' : 'segment of hindbrain');
          if (mm) { meshes.push(mm); mm.geometry.computeBoundingSphere(); add = [mm.geometry.boundingSphere.center.clone().addScaledVector(B.right || new THREE.Vector3(1, 0, 0), (side === 'R' ? 1 : -1) * 0.002)]; st.approx = fb[fb.length - 1]; } }
      }
      else if (st.k === 'hind' || st.k === 'pons') { const m = named(st.k === 'hind' ? 'segment of hindbrain' : 'segment of metencephalon'); if (m) { meshes.push(m); m.geometry.computeBoundingSphere(); add = [m.geometry.boundingSphere.center.clone().addScaledVector(B.right || new THREE.Vector3(1, 0, 0), (side === 'R' ? 1 : -1) * 0.003)]; } }
      if (!add || !add.length) { missing.push(st.label); continue; }
      marks.push({ i: pts.length, label: st.label }); pts.push(...add);
    }
    // drop near-duplicate consecutive points (keeps the curve well-behaved)
    const clean = []; const idxMap = [];
    pts.forEach((p, i) => { if (!clean.length || clean[clean.length - 1].distanceTo(p) > 0.0015) clean.push(p); idxMap[i] = clean.length - 1; });
    marks.forEach((m) => { m.i = idxMap[Math.min(m.i, idxMap.length - 1)] ?? 0; });
    return { pts: clean, marks, meshes, tracts, missing, side };
  }

  B.resolveRoute = (steps, side = 'L') => build({ steps: steps.map(([k, v, label]) => ({ k, v, label: label || v })) }, side);
  function show(pw, extra = false) {
    if (!extra) { clear(); P.cur = pw; }
    const R = build(pw, P.side);
    if (R.pts.length < 2) { el.querySelector('#pw-info').innerHTML = '<p class="muted">Not enough stations available in this view.</p>'; return; }
    const curve = new THREE.CatmullRomCurve3(R.pts, pw.direction === 'loop' && R.pts[0].distanceTo(R.pts[R.pts.length - 1]) < 0.01, 'centripetal');
    const col = new THREE.Color(FAM_COL[pw.family] || '#ffffff');
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(80, R.pts.length * 6), 0.0011, 8, false), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.45, depthWrite: false, depthTest: false }));
    tube.renderOrder = 10; G.add(tube);
    const pulses = Array.from({ length: 5 }, () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.0034, 14, 10), new THREE.MeshBasicMaterial({ color: col, transparent: true, depthTest: false })); m.renderOrder = 11; G.add(m); return m; });
    const trail = Array.from({ length: 30 }, () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.002, 8, 6), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.4, depthTest: false })); m.renderOrder = 11; G.add(m); return m; });
    // station dots
    R.marks.forEach((mk) => { const p = R.pts[mk.i]; if (!p) return; const d = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false })); d.position.copy(p); d.renderOrder = 12; G.add(d); });
    const total = R.pts.length - 1, u = R.marks.map((m) => m.i / total);
    const entry = { pw, R, curve, pulses, trail, col, u };
    P.multi.push(entry);
    hooks.showTracts?.(R.tracts);
    if (!extra) renderInfo(entry);
  }
  function clear() { while (G.children.length) { const c = G.children.pop(); c.geometry?.dispose(); c.material?.dispose(); } P.multi.forEach((e) => e.R.meshes.forEach((m) => { if (m.material.emissive) m.material.emissiveIntensity = 0; })); P.multi = []; P.cur = null; }

  function renderInfo(E) {
    const { pw, R } = E;
    el.querySelector('#pw-info').innerHTML = `<h3 class="pw-h" style="color:${FAM_COL[pw.family]}">${esc(pw.name)}</h3>
      <p class="fine">${esc(pw.family)} · ${pw.direction === 'loop' ? 'loop (output feeds back to the start)' : pw.direction === 'up' ? 'input: periphery → spinal cord → brainstem → thalamus → cortex' : pw.direction === 'down' ? 'output: brain → brainstem → spinal cord' : 'cortex → cortex'} · drawn on the ${P.side === 'L' ? 'left' : 'right'} side first${R.missing.length ? ` · not drawn (no 3D object here): ${R.missing.map(esc).join(', ')}` : ''}</p>
      <ol class="pw-steps">${pw.steps.map((s, i) => `<li data-st="${i}" class="${s.k === 'x' ? 'x' : ''}">${s.k === 'x' ? '⤫ ' : ''}${esc(s.label)} <small>${s.k === 't' ? `HCP ${esc(s.v)}` : s.k === 'thal' ? 'estimated position' : s.k === 'cord' ? esc(s.v) : ''}</small></li>`).join('')}</ol>
      <details open><summary class="fine"><b>What the sources say</b></summary><ul class="fine au-q">${pw.quotes.map((q) => `<li>“${esc(q.text)}” <small><i>${esc(q.chapter)}</i></small></li>`).join('') || '<li>No sentence found.</li>'}</ul></details>
      <p class="fine cite">${esc(D.licence)}. Route: navigation schematic; pulse timing illustrative.</p>`;
  }

  el.innerHTML = `<div class="pw-ctrl"><button class="ghost-btn" id="pw-play">⏸ Pause</button><button class="ghost-btn" id="pw-rev">⇄ Reverse (feedback direction)</button>
      <label class="fine">Speed <input type="range" id="pw-speed" min="1" max="40" value="10" style="width:80px"></label>
      <label class="fine">Time <input type="range" id="pw-time" min="0" max="1000" value="0" style="width:110px"></label>
      <label class="fine">Side <select id="pw-side"><option value="L">Start left</option><option value="R">Start right</option></select></label>
      <button class="ghost-btn" id="pw-all">▶ Run all at once</button><button class="ghost-btn" id="pw-clear">Clear</button></div>
    <div class="pw-fams">${[...new Set(D.pathways.map((p) => p.family))].map((f) => `<div><b class="fine" style="color:${FAM_COL[f]}">${esc(f)}</b> ${D.pathways.filter((p) => p.family === f).map((p) => `<button class="pw-btn" data-pw="${p.id}" style="--c:${FAM_COL[f]}">${esc(p.name.split(' (')[0])}</button>`).join('')}</div>`).join('')}</div>
    <div id="pw-info" class="fine"><p class="muted">Pick a pathway: a live signal runs along it through the real structures and tracts, station by station.</p></div>`;
  el.querySelectorAll('[data-pw]').forEach((b) => (b.onclick = () => { show(D.pathways.find((p) => p.id === b.dataset.pw)); P.t = 0; }));
  $('#pw-play').onclick = () => { P.play = !P.play; $('#pw-play').textContent = P.play ? '⏸ Pause' : '▶ Play'; };
  $('#pw-rev').onclick = () => { P.reverse = !P.reverse; $('#pw-rev').classList.toggle('on', P.reverse); };
  $('#pw-speed').oninput = (e) => { P.speed = +e.target.value / 10; };
  $('#pw-time').oninput = (e) => { P.play = false; $('#pw-play').textContent = '▶ Play'; P.t = +e.target.value / 1000; };
  $('#pw-side').onchange = (e) => { P.side = e.target.value; Object.keys(thal).forEach((k) => delete thal[k]); if (P.cur) show(P.cur); };
  $('#pw-all').onclick = () => { clear(); D.pathways.forEach((p) => show(p, true)); el.querySelector('#pw-info').innerHTML = `<p class="fine">All ${D.pathways.length} pathways running together: blue = sensory input, red = motor output, yellow = feedback loops, purple = limbic, green = special senses, orange = association / autonomic.</p>`; };
  $('#pw-clear').onclick = () => { clear(); el.querySelector('#pw-info').innerHTML = ''; };

  // ---- animation
  let last = performance.now();
  const tick = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (P.multi.length) {
      if (P.play) P.t = (P.t + dt * 0.12 * P.speed) % 1;
      const tm = $('#pw-time'); if (tm && P.play) tm.value = Math.round(P.t * 1000);
      for (const E of P.multi) {
        const head = P.reverse ? 1 - P.t : P.t;
        E.pulses.forEach((m, k) => { let u = (head + k / E.pulses.length) % 1; if (P.reverse) u = 1 - ((1 - head + k / E.pulses.length) % 1); m.position.copy(E.curve.getPointAt(u)); m.scale.setScalar(k === 0 ? 1.5 : 1); });
        E.trail.forEach((m, k) => { const u = P.reverse ? Math.min(1, head + (k + 1) * 0.004) : Math.max(0, head - (k + 1) * 0.004); m.position.copy(E.curve.getPointAt(u)); m.material.opacity = 0.45 * (1 - k / E.trail.length); });
        // stations light up as the lead pulse passes; their structures glow
        if (E === P.multi[0] && P.multi.length === 1) {
          const lis = el.querySelectorAll('.pw-steps li'); let active = -1; E.u.forEach((uu, i) => { if (uu <= head + 1e-6) active = i; });
          const stepIdx = []; E.pw.steps.forEach((s, i) => { if (s.k !== 'x') stepIdx.push(i); });
          lis.forEach((li, i) => li.classList.toggle('on', i === stepIdx[Math.min(active, stepIdx.length - 1)]));
        }
        E.R.meshes.forEach((m) => { if (!m.material.emissive) return; m.material.emissive.copy(E.col); m.material.emissiveIntensity = 0.25 + 0.25 * Math.sin(now / 180); });
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return { pathways: D.pathways.length };
}
