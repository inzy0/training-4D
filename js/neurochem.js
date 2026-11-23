// Neurochemistry, networks and diagnoses for the Brain map.
// - Nuclei: CIT168 subcortical atlas (CC BY 4.0) and, when downloaded, Harvard AAN v2.0 brainstem nuclei (CC0), meshed
//   from MNI space (tools/brain_nuclei_build.py) and placed with the same MNI -> body fit as the HCP1065 tracts.
// - Networks: Yeo 2011 7 cortical networks (MIT).
// - Transmitter systems: 8 transmitters; each projection route is an authored, labelled schematic drawn through real 3D
//   objects; particles show the effect (filled = excitatory, ring = inhibitory, diamond = modulatory).
// - Diagnoses: the regions / transmitters / networks their own StatPearls chapter names (mechanical), and the drugs its
//   treatment text names (FDA labels). Text is verbatim StatPearls (CC BY-NC-ND 4.0). Education only.
// - Region cards: StatPearls "Neuroanatomy" chapter sections grouped into tabs.

import * as THREE from 'three';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const NUC_COL = { Pu: '#e76f51', Ca: '#f4a261', NAC: '#ffd166', EXA: '#ef476f', GPe: '#06d6a0', GPi: '#118ab2', SNc: '#3a0ca3', SNr: '#7209b7', RN: '#d00000',
  PBP: '#9d4edd', VTA: '#ff9e00', VeP: '#80ffdb', HN: '#e9ff70', HTH: '#ff70a6', MN: '#ffafcc', STH: '#4cc9f0' };
export const G_NUC = 'Subcortical nuclei (CIT168)', G_AAN = 'Brainstem arousal nuclei (Harvard AAN)', G_NET = 'Cortical networks (Yeo 2011)';
const N = { data: null, D: null, G: null, active: [], t: 0, playing: true, speed: 1 };

export async function setupNeurochem(B, root, toAtlas) {
  const [nuc, D] = await Promise.all([fetch('/training-4D/rt/brain/nuclei.json').then((r) => (r.ok ? r.json() : null)).catch(() => null), fetch('/training-4D/rt/brain/neurochem.json').then((r) => (r.ok ? r.json() : null)).catch(() => null)]);
  if (!nuc || !D) return null;
  N.D = D; N.B = B; B.aanFallback = D.aan_fallback;
  const o = [0, 0, 0];
  const geo = (it) => { const v = it.v, pos = new Float32Array(v.length); for (let i = 0; i < v.length; i += 3) { toAtlas(v[i] / 10, v[i + 1] / 10, v[i + 2] / 10, o); pos[i] = o[0]; pos[i + 1] = o[1]; pos[i + 2] = o[2]; } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(it.f); g.computeVertexNormals(); g.computeBoundingSphere(); return g; };
  const add = (g, color, group, part, extra = {}) => {
    const m = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ color, roughness: 0.45, clearcoat: 0.4, side: THREE.DoubleSide, clippingPlanes: B.planes, transparent: true, opacity: extra.op ?? 1, depthWrite: (extra.op ?? 1) >= 1 }));
    m.userData = { kind: extra.kind || 'brain', group, color, base: g.boundingSphere.center.clone(), part, dname: extra.dname || part.name, ...extra };
    root.add(m); B.meshes.push(m); if (!B.groups.has(group)) B.groups.set(group, []); B.groups.get(group).push(m); return m;
  };
  const byCode = new Map();
  for (const it of nuc.nuclei) {
    const grp = it.atlas === 'CIT168' ? G_NUC : G_AAN, side = it.hemi === 'L' ? 'left' : it.hemi === 'R' ? 'right' : '';
    const m = add(geo(it), NUC_COL[it.code] || '#ffb703', grp, { name: `${side} ${it.name}`.trim(), id: it.atlas }, { dname: `${it.name}${side ? ` (${side})` : ''} · ${it.atlas}`, nucleus: it.code });
    byCode.set(`${it.code}:${it.hemi}`, m); if (!byCode.has(it.code)) byCode.set(it.code, m);
  }
  B.nucleusMesh = (code, side) => byCode.get(`${code}:${side}`) || byCode.get(`${code}:M`) || byCode.get(code) || null;
  N.net = new Map();
  for (const it of nuc.networks) { const m = add(geo(it), it.color, G_NET, { name: `${it.hemi === 'L' ? 'left' : 'right'} ${it.name} network`, id: 'Yeo2011' }, { op: 0.35, kind: 'network', network: it.code, dname: `${it.name} network (${it.hemi === 'L' ? 'left' : 'right'}) · Yeo 2011` }); (N.net.get(it.code) || N.net.set(it.code, []).get(it.code)).push(m); }
  N.G = new THREE.Group(); root.add(N.G); N.sources = nuc.sources;
  return { nuclei: nuc.nuclei.length, networks: nuc.networks.length, aan: nuc.nuclei.some((x) => x.atlas !== 'CIT168') };
}

// ---------------------------------------------------------------- panel
export function neurochemPanel(B, hooks) {
  const el = $('#br-nc'); if (!el || !N.D) return;
  const D = N.D;
  el.innerHTML = `<div class="nc-tabs">${[['nt', 'Transmitters'], ['net', 'Networks'], ['dx', 'Diagnoses'], ['card', 'Region card']].map(([k, v], i) => `<button class="ghost-btn ${i ? '' : 'on'}" data-nct="${k}">${v}</button>`).join('')}</div>
    <div class="nc-cortex fine">Cortex: ${['normal', 'ghost', 'hide', 'scatter'].map((k) => `<button class="pw-btn" data-ctx="${k}" style="--c:#90e0ef">${k}</button>`).join('')} <span class="fine">· Play <button class="pw-btn" id="nc-play" style="--c:#ffd166">⏸</button> <input type="range" id="nc-speed" min="1" max="30" value="10" style="width:70px"></span></div>
    <div id="nc-body"></div>`;
  const tab = (k) => { el.querySelectorAll('[data-nct]').forEach((b) => b.classList.toggle('on', b.dataset.nct === k)); ({ nt: ntTab, net: netTab, dx: dxTab, card: () => cardTab(N.lastCard) })[k](); };
  el.querySelectorAll('[data-nct]').forEach((b) => (b.onclick = () => tab(b.dataset.nct)));
  el.querySelectorAll('[data-ctx]').forEach((b) => (b.onclick = () => hooks.cortex(b.dataset.ctx)));
  $('#nc-play').onclick = () => { N.playing = !N.playing; $('#nc-play').textContent = N.playing ? '⏸' : '▶'; };
  $('#nc-speed').oninput = (e) => { N.speed = +e.target.value / 10; };
  N.hooks = hooks; N.tab = tab;
  const body = () => $('#nc-body');
  function ntTab() {
    body().innerHTML = `<div class="pw-fams">${D.transmitters.map((t) => `<button class="pw-btn" data-nt="${t.id}" style="--c:${t.color}">${esc(t.abbr)} · ${esc(t.name.split(' (')[0])}</button>`).join('')} <button class="pw-btn" id="nc-allnt" style="--c:#fff">all at once</button></div><div id="nc-info" class="fine"><p class="muted">Pick a transmitter: all its main projections run live through the real nuclei and tracts.</p></div>`;
    body().querySelectorAll('[data-nt]').forEach((b) => (b.onclick = () => showNT([D.transmitters.find((t) => t.id === b.dataset.nt)])));
    $('#nc-allnt').onclick = () => showNT(D.transmitters);
  }
  function netTab() {
    body().innerHTML = `<div class="pw-fams">${D.networks.map((n) => `<button class="pw-btn" data-net="${n.code}" style="--c:${(N.net.get(n.code) || [])[0]?.userData.color || '#ccc'}">${esc(n.name)}</button>`).join('')} <button class="pw-btn" id="nc-allnet" style="--c:#fff">all seven</button></div><div id="nc-info" class="fine"></div>`;
    body().querySelectorAll('[data-net]').forEach((b) => (b.onclick = () => showNet([b.dataset.net])));
    $('#nc-allnet').onclick = () => showNet(D.networks.map((n) => n.code));
  }
  function dxTab() {
    body().innerHTML = `<div class="pw-fams">${D.diagnoses.map((x) => `<button class="pw-btn" data-dx="${x.id}" style="--c:#ffafcc">${esc(x.name)}</button>`).join('')}</div><div id="nc-info" class="fine"><p class="muted">Pick a diagnosis: the structures, transmitters and networks its StatPearls chapter names light up.</p></div>`;
    body().querySelectorAll('[data-dx]').forEach((b) => (b.onclick = () => showDx(D.diagnoses.find((x) => x.id === b.dataset.dx))));
  }
  tab('nt');
  // animation
  let last = performance.now();
  const loop = (now) => { const dt = Math.min(0.1, (now - last) / 1000); last = now; if (N.playing) N.t += dt * 0.15 * N.speed;
    for (const R of N.active) R.parts.forEach((p, k) => { const u = (N.t + k / R.parts.length) % 1; p.position.copy(R.curve.getPointAt(u)); p.rotation.y += dt * 3; });
    for (const m of N.glow || []) if (m.material.emissive) { m.material.emissiveIntensity = 0.35 + 0.25 * Math.sin(now / 200); }
    requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}

function clearActive() {
  while (N.G.children.length) { const c = N.G.children.pop(); c.geometry?.dispose(); c.material?.dispose(); }
  (N.glow || []).forEach((m) => { if (m.userData._mat) { m.material = m.userData._mat; delete m.userData._mat; } }); N.glow = []; N.active = [];
}
function glow(m, col) { if (!m || m.userData._mat) return; m.userData._mat = m.material; const g = m.material.clone(); g.emissive = new THREE.Color(col); g.emissiveIntensity = 0.5; g.opacity = /lobe|Insula|white matter|Limbic/.test(m.userData.group || '') ? 0.4 : Math.max(0.85, g.opacity); g.depthWrite = g.opacity >= 0.85; g.transparent = g.opacity < 1; m.material = g; m.visible = true; N.glow.push(m); }
function particle(effect, col) {
  const mat = new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true });
  const g = effect === 'inhibitory' ? new THREE.TorusGeometry(0.0032, 0.0009, 8, 18) : effect === 'modulatory' ? new THREE.OctahedronGeometry(0.003) : new THREE.SphereGeometry(0.003, 12, 10);
  const m = new THREE.Mesh(g, mat); m.renderOrder = 12; return m;
}
function drawRoute(steps, col, effect, side) {
  const R = N.B.resolveRoute(steps, side); if (!R || R.pts.length < 2) return null;
  const curve = new THREE.CatmullRomCurve3(R.pts, false, 'centripetal');
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(40, R.pts.length * 6), 0.0008, 6, false), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.4, depthTest: false })); tube.renderOrder = 10; N.G.add(tube);
  const parts = Array.from({ length: 6 }, () => { const p = particle(effect, col); N.G.add(p); return p; });
  R.meshes.forEach((m) => glow(m, col));
  N.active.push({ curve, parts });
  return R;
}
function showNT(list) {
  clearActive(); N.hooks.onShow?.();
  const out = [];
  for (const t of list) for (const r of t.routes) for (const side of ['L', 'R']) { const R = drawRoute(r.steps, t.color, t.effect, side); if (side === 'L') out.push({ t, r, R }); }
  const one = list.length === 1 ? list[0] : null;
  $('#nc-info').innerHTML = one ? `<h3 class="pw-h" style="color:${one.color}">${esc(one.name)} <small>${esc(one.effect)}</small></h3>
      <ol class="pw-steps">${out.map(({ r, R }) => `<li>${esc(r.name)}: ${r.steps.map((s) => { const ap = R?.missing?.includes(s[1]) ? ' (no 3D object)' : ''; return esc(s[0] === 't' ? `HCP ${s[1]}` : s[0] === 'thal' ? 'thalamus (estimated)' : s[1] || s[0]) + ap; }).join(' → ')}</li>`).join('')}</ol>
      <details open><summary class="fine"><b>What the sources say</b></summary><ul class="fine au-q">${one.quotes.map((q) => `<li>“${esc(q.text)}” <small><i>${esc(q.chapter)}</i></small></li>`).join('')}</ul></details>
      <p class="fine cite">Routes: authored schematic through real nuclei / tracts; particle timing illustrative. ${esc(N.D.licence)}.</p>`
    : `<p class="fine">All ${list.length} transmitter systems live: ${list.map((t) => `<span style="color:${t.color}">${esc(t.abbr)}</span>`).join(' · ')}. Filled = excitatory, ring = inhibitory, diamond = modulatory.</p>`;
}
function showNet(codes) {
  clearActive(); N.hooks.onShow?.();
  N.net.forEach((ms, code) => ms.forEach((m) => { m.visible = codes.includes(code); if (m.visible) glow(m, m.userData.color); }));
  N.hooks.showGroup?.(G_NET);
  const one = codes.length === 1 ? N.D.networks.find((n) => n.code === codes[0]) : null;
  $('#nc-info').innerHTML = one ? `<h3 class="pw-h">${esc(one.name)} network</h3>${one.quotes.length ? `<ul class="fine au-q">${one.quotes.map((q) => `<li>“${esc(q.text)}” <small><i>${esc(q.chapter)}</i></small></li>`).join('')}</ul>` : '<p class="fine muted">No StatPearls sentence names this network.</p>'}
      <p class="fine cite">Network map: Yeo et al. 2011 (MIT licence), resting-state functional connectivity of 1,000 subjects, placed on this brain with the MNI fit (approximate).</p>`
    : `<p class="fine">The seven Yeo 2011 networks together cover the cerebral cortex (each colour = one network).</p>`;
}
function showDx(x) {
  clearActive(); N.hooks.onShow?.();
  const ntIds = new Set();
  for (const L of x.lights) {
    const [k, v] = L.k;
    if (k === 'n' || k === 'a') ['L', 'R'].forEach((s) => glow(N.B.nucleusMesh(v, s), '#ffafcc'));
    else if (k === 's') N.B.meshes.filter((m) => m.userData.part?.name?.replace(/\b(left|right) /g, '') === v).forEach((m) => glow(m, '#ffafcc'));
    else if (k === 'nt') ntIds.add(v);
    else if (k === 'net') (N.net.get(v) || []).forEach((m) => { m.visible = true; glow(m, m.userData.color); });
  }
  for (const id of ntIds) { const t = N.D.transmitters.find((y) => y.id === id); t?.routes.forEach((r) => drawRoute(r.steps, t.color, t.effect, 'L')); }
  $('#nc-info').innerHTML = `<h3 class="pw-h" style="color:#ffafcc">${esc(x.name)}</h3>
    <p class="fine">Lit: ${x.lights.map((l) => esc(l.k[0] === 'nt' ? N.D.transmitters.find((t) => t.id === l.k[1])?.abbr : l.k[0] === 'net' ? `${l.k[1]} network` : l.k[0] === 'thal' ? 'thalamus' : l.k[1])).join(' · ') || 'nothing named'} <small>(named in the chapter's own etiology / pathophysiology text)</small></p>
    <ul class="fine au-q">${x.quotes.map((q) => `<li>“${esc(q.text)}” <small><i>${esc(q.section)}</i></small></li>`).join('')}</ul>
    ${x.meds.length ? `<p class="fine"><b>Medications its treatment text names</b> (FDA labels):</p><div class="ext-chips">${x.meds.map((m) => `<a href="#" class="ext-chip" data-drug="${esc(m.generic)}" title="${esc(m.epc)}">${esc(m.generic.toLowerCase())}</a>`).join('')}</div>` : ''}
    <p class="btnrow"><a href="#" class="ghost-btn" id="nc-ch">Open the chapter + care pathway</a></p>
    <p class="fine cite">Verbatim from <i>${esc(x.chapter)}</i>, StatPearls (CC BY-NC-ND 4.0). Education only: not a diagnosis.</p>`;
  $('#nc-ch').onclick = (e) => { e.preventDefault(); location.hash = '#clinical'; import('./clinical.js').then((m) => m.startClinical(x.doc)); };
  $('#nc-info').querySelectorAll('[data-drug]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); location.hash = '#clinical'; import('./clinical.js').then(async (m) => { await m.startClinical(); m.openDrug?.(a.dataset.drug); }); }));
}

// ---------------------------------------------------------------- region card (StatPearls Neuroanatomy chapter, tabbed)
const TABS = [['Functions', /Function|Physiolog/i], ['Anatomy', /Introduction|Structure|Blood Supply|Nerves|Muscles|Physiologic Variants|Lymphatics/i], ['Development', /Embryolog|Development/i], ['Clinical', /Clinical|Surgical|Other Issues/i]];
export async function regionCard(mesh) {
  const nm = (mesh.userData.part?.name || '').replace(/\b(left|right) /g, '').replace(/,.*$/, '').trim();
  N.lastCard = { mesh, nm };
  if ($('#br-nc')) N.tab?.('card');
}
async function cardTab(c) {
  const body = $('#nc-body'); if (!c) { body.innerHTML = '<p class="fine muted">Click a nucleus, structure or network in the 3D view to open its card.</p>'; return; }
  body.innerHTML = `<p class="fine muted">Looking up “${esc(c.nm)}”…</p>`;
  const q = c.nm.replace(/^(Substantia nigra).*$/i, 'substantia nigra').replace(/^Globus pallidus.*$/i, 'globus pallidus');
  const r = await (await fetch(`/api/clinical/search?q=${encodeURIComponent(q)}&type=anatomy&limit=8`)).json().catch(() => []);
  let hit = (Array.isArray(r) ? r : []).find((x) => /Neuroanatomy|Anatomy/.test(x.title)) || (Array.isArray(r) ? r[0] : null);
  if (!hit) { const r2 = await (await fetch(`/api/clinical/search?q=${encodeURIComponent(q)}&type=all&limit=12`)).json().catch(() => []); hit = (Array.isArray(r2) ? r2 : []).find((x) => /Neuroanatomy|Physiology|Anatomy/.test(x.title)) || null; }
  const code = c.mesh.userData.nucleus, nts = N.D.transmitters.filter((t) => t.routes.some((rr) => rr.steps.some((s) => s[1] === code || s[1] === c.nm.toLowerCase())));
  const dxs = N.D.diagnoses.filter((x) => x.lights.some((l) => l.k[1] === code || l.k[1] === c.nm.toLowerCase()));
  let tabs = [];
  if (hit) {
    const d = await (await fetch(`/api/clinical/doc?id=${encodeURIComponent(hit.id)}`)).json();
    tabs = TABS.map(([lab, rx]) => [lab, d.sections.filter((s) => rx.test(s.name)).map((s) => s.text).join('\n\n')]);
    const all = d.sections.map((s) => s.text).join(' '), conn = all.split(/(?<=[.!?])\s+(?=[A-Z])/).filter((s) => /\b(project|afferent|efferent|input|output|connect|pathway|fibers? (from|to))/i.test(s)).slice(0, 12).join('\n\n');
    tabs.push(['Connections', conn]); c.chapter = d.title; c.doc = hit.id;
  }
  tabs.push(['Transmitters & diagnoses', `${nts.length ? `Transmitter systems through this structure: ${nts.map((t) => t.name).join(', ')}.` : ''}${dxs.length ? `\n\nDiagnoses whose chapter names it: ${dxs.map((x) => x.name).join(', ')}.` : ''}` || 'None linked.']);
  body.innerHTML = `<h3 class="pw-h">${esc(c.mesh.userData.dname || c.nm)}</h3>
    <div class="nc-tabs">${tabs.map(([l, t], i) => `<button class="ghost-btn ${i ? '' : 'on'}" data-ct="${i}" ${t ? '' : 'disabled'}>${esc(l)}</button>`).join('')}</div><div id="nc-ct" class="fine nc-ct"></div>
    <p class="fine cite">${c.chapter ? `Verbatim from <i>${esc(c.chapter)}</i>, StatPearls (CC BY-NC-ND 4.0); sections grouped into tabs by heading.` : 'No StatPearls anatomy chapter found for this structure.'} Atlas: ${esc(c.mesh.userData.part?.id || '')}.</p>`;
  const show = (i) => { body.querySelectorAll('[data-ct]').forEach((b) => b.classList.toggle('on', +b.dataset.ct === i)); $('#nc-ct').innerHTML = (tabs[i][1] || '').split(/\n\n+/).map((p) => `<p>${esc(p)}</p>`).join('') || '<p class="muted">The chapter has no section for this.</p>'; };
  body.querySelectorAll('[data-ct]').forEach((b) => (b.onclick = () => show(+b.dataset.ct)));
  show(tabs.findIndex(([, t]) => t) >= 0 ? tabs.findIndex(([, t]) => t) : 0);
}
