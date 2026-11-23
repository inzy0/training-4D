// Body systems: genes, biochemical pathways and protein partners mapped onto the
// 3D reference body.
//   - a gene paints the tissues where the Human Protein Atlas finds it enriched
//     (nTPM, log scale); a pathway paints tissues by how many of its genes are
//     enriched there; a tissue (click the body) lists its enriched genes and pathways
//   - Play walks a pathway's sub-pathways one by one with animated transitions
//   - partner network: STRING v12 links (combined score >= 700)
// Sources (all shown in the panel): Human Protein Atlas (CC BY-SA 4.0), NCBI Gene
// summaries (public domain), UniProt (CC BY 4.0), Reactome (CC0), STRING (CC BY 4.0).
// Text is quoted unchanged; nothing here is written by a model.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadAtlas } from './atlas_data.js';
import { studio } from './look.js';
import { pointerControls, surfacePicker } from './view_controls.js';
import { lut } from './imaging_viewer.js';
import { setupPhysiology } from './physiology.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const api = (u) => fetch(u).then((r) => r.json());
const M = { meshes: [], tissueOf: new Map(), cur: null, play: null };

export async function startMolecular() {
  if (M.started) return; M.started = true;
  const status = $('#mol-status'), canvas = $('#mol-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  const scene = new THREE.Scene(); studio(renderer, scene);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50); const controls = new OrbitControls(camera, canvas); controls.enableDamping = true;
  Object.assign(M, { renderer, scene, camera, controls });
  const resize = () => { const r = canvas.parentElement.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); };
  new ResizeObserver(resize).observe(canvas.parentElement); resize();
  let atlas; try { atlas = await loadAtlas((m) => { status.textContent = m; }); } catch (e) { status.textContent = e.message; return; }
  M.atlas = atlas;
  const TM = await api('/training-4D/rt/molecular/tissue_map.json'); M.TM = TM;
  const parent = (await api('/training-4D/rt/atlas/partof.json')).parent;
  const inBrain = (n) => { for (let k = 0; k < 14 && n; k++) { n = parent[n]; if (n === 'brain') return true; } return false; };
  const rules = Object.entries(TM.map).map(([t, r]) => ({ t, re: new RegExp(r.re), layer: r.layer ? new RegExp(`^(${r.layer})$`) : null }));
  const root = new THREE.Group(); scene.add(root);
  for (const { part, geometry } of atlas.parts) {
    const base = part.name.replace(/\b(left|right) /, '');
    const ts = rules.filter((r) => (r.t === 'brain' ? inBrain(part.name) : (!r.layer || r.layer.test(part.layer)) && r.re.test(base)) && !(r.t === 'skeletal muscle' && part.layer !== 'muscles')).map((r) => r.t);
    const mat = new THREE.MeshPhysicalMaterial({ color: 0x9fb3c8, transparent: true, opacity: 0.06, depthWrite: false, roughness: 0.5, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geometry, mat); m.userData = { part, tissues: ts, col: new THREE.Color(0x9fb3c8), target: new THREE.Color(0x9fb3c8), op: 0.06, opT: part.layer === 'skeleton' ? 0.14 : 0.04 };
    root.add(m); M.meshes.push(m);
    ts.forEach((t) => { if (!M.tissueOf.has(t)) M.tissueOf.set(t, []); M.tissueOf.get(t).push(m); });
  }
  const box = atlas.box, c = box.getCenter(new THREE.Vector3()), h = box.getSize(new THREE.Vector3()).y;
  camera.position.set(c.x, c.y, c.z + atlas.anchors.anterior * h * 2.0); controls.target.copy(c); controls.update();
  M.pc = pointerControls({ controls, camera, canvas, pick: surfacePicker(camera, canvas, () => M.meshes.filter((m) => m.userData.opT > 0.2)) }); M.pc.setHome();
  setupUI(); picking(canvas); setupPhysiology(M); import('./learn.js').then((m) => m.setupLearn());
  status.textContent = `${M.tissueOf.size} of ${Object.keys(TM.map).length + TM.not_in_model.length} Protein Atlas tissues are on this body · search a gene or a pathway, or click a coloured organ`;
  renderer.setAnimationLoop(() => { M.pc.tick(); controls.update(); if (!M.cur) M.onTick?.(performance.now()); animate(); renderer.render(scene, camera); });
  window.__mol = M;
  topSystems();
}

// smooth colour / opacity transitions toward each mesh's target
function animate() {
  for (const m of M.meshes) {
    const u = m.userData; if (u.col.equals(u.target) && Math.abs(u.op - u.opT) < 0.002) continue;
    u.col.lerp(u.target, 0.12); u.op += (u.opT - u.op) * 0.12;
    m.material.color.copy(u.col); m.material.emissive = m.material.emissive || new THREE.Color(); m.material.emissive.copy(u.col).multiplyScalar(u.opT > 0.2 ? 0.25 : 0);
    m.material.opacity = u.op; m.material.transparent = u.op < 0.98; m.material.depthWrite = u.op > 0.6;
  }
}
// paint tissues: values {tissue: number}; log scale onto the inferno colour map
function paint(values, label) {
  const L = lut('inferno'), max = Math.max(1e-9, ...Object.values(values));
  for (const m of M.meshes) {
    const vs = m.userData.tissues.map((t) => values[t]).filter((v) => v != null);
    if (vs.length) { const v = Math.max(...vs), f = Math.log10(1 + v) / Math.log10(1 + max), k = Math.round(70 + f * 160) * 3; m.userData.target.setRGB(L[k] / 255, L[k + 1] / 255, L[k + 2] / 255); m.userData.opT = 0.95; }
    else { m.userData.target.set(0x9fb3c8); m.userData.opT = m.userData.part.layer === 'skeleton' ? 0.1 : 0.03; }
  }
  const shown = Object.keys(values).filter((t) => M.tissueOf.has(t)), off = Object.keys(values).filter((t) => !M.tissueOf.has(t));
  $('#mol-legend').innerHTML = `<b>${esc(label)}</b> · colour = log scale, brightest = highest · ${shown.length} tissue${shown.length === 1 ? '' : 's'} on the body${off.length ? ` · not in this (male) reference body: ${off.map(esc).join(', ')}` : ''}`;
  // fly to the strongest tissue
  const best = shown.sort((a, b) => values[b] - values[a])[0];
  if (best) { const b = new THREE.Box3(); M.tissueOf.get(best).forEach((m) => b.expandByObject(m)); const sz = b.getSize(new THREE.Vector3()).length(); if (!b.isEmpty() && sz < 1.2) M.pc.flyTo(b.getCenter(new THREE.Vector3()), Math.max(0.35, sz * 1.6)); else M.pc.flyTo(M.atlas.box.getCenter(new THREE.Vector3()), M.atlas.box.getSize(new THREE.Vector3()).y * 2.0); }
}

// ------------------------------------------------------------------ UI
function setupUI() {
  let tm = null;
  $('#mol-q').oninput = () => { clearTimeout(tm); tm = setTimeout(search, 220); };
  $('#mol-home').onclick = () => { stopPlay(); M.cur = null; topSystems(); paint({}, 'No selection: circulation animation'); M.pc.flyTo(M.atlas.box.getCenter(new THREE.Vector3()), M.atlas.box.getSize(new THREE.Vector3()).y * 2.0); };
}
async function topSystems() {
  const res = await api('/api/mol/top'); // Reactome pathways with no parent: the top-level systems
  $('#mol-results').innerHTML = `<p class="fine"><b>Body systems (Reactome top-level pathways)</b></p><div class="mol-chips">${res.filter((r) => r && !r.error).map((r) => `<button class="ghost-btn" data-pw="${r.id}">${esc(r.name)} <small>${r.n_genes}</small></button>`).join('')}</div>`;
  $('#mol-results').querySelectorAll('[data-pw]').forEach((b) => (b.onclick = () => openPathway(b.dataset.pw)));
}
async function search() {
  const q = $('#mol-q').value.trim(); if (q.length < 2) return topSystems();
  const r = await api(`/api/mol/search?q=${encodeURIComponent(q)}`);
  $('#mol-results').innerHTML = `${r.genes.length ? `<p class="fine"><b>Genes</b></p><ul class="cl-list">${r.genes.map((g) => `<li><button class="cl-item" data-g="${esc(g.symbol)}"><span class="cl-t">${esc(g.symbol)}</span><small>${esc(g.description)}</small></button></li>`).join('')}</ul>` : ''}
    ${r.pathways.length ? `<p class="fine"><b>Pathways</b></p><ul class="cl-list">${r.pathways.map((p) => `<li><button class="cl-item" data-pw="${p.id}"><span class="cl-t">${esc(p.name)}</span><small>${p.id}</small></button></li>`).join('')}</ul>` : ''}${!r.genes.length && !r.pathways.length ? '<p class="fine muted">No match.</p>' : ''}`;
  $('#mol-results').querySelectorAll('[data-g]').forEach((b) => (b.onclick = () => openGene(b.dataset.g)));
  $('#mol-results').querySelectorAll('[data-pw]').forEach((b) => (b.onclick = () => openPathway(b.dataset.pw)));
}
const bars = (rows, key, val, unit) => { const mx = Math.max(...rows.map((r) => r[val]), 1); return `<ul class="mol-bars">${rows.map((r) => `<li><span>${esc(r[key])}</span><i style="width:${Math.max(2, (100 * Math.log10(1 + r[val])) / Math.log10(1 + mx))}%"></i><b class="mono">${r[val].toLocaleString()}${unit}</b></li>`).join('')}</ul>`; };

export async function openGene(sym) {
  stopPlay();
  const g = await api(`/api/mol/gene?s=${encodeURIComponent(sym)}`); if (g.error) return;
  M.cur = { gene: g.symbol };
  paint(Object.fromEntries(g.tissues.map((t) => [t.tissue, t.ntpm])), `${g.symbol}: tissue-enriched expression (HPA nTPM)`);
  $('#mol-card').innerHTML = `<h3 class="st-h">${esc(g.symbol)} <small>${esc(g.description)}</small></h3>
    <p class="fine">Chromosome ${esc(g.chromosome)}${g.position ? `:${esc(g.position)}` : ''} · ${esc(g.protein_class || '')}</p>
    ${g.bio_process || g.mol_function ? `<p class="fine"><b>Function (HPA keywords):</b> ${esc([g.mol_function, g.bio_process].filter(Boolean).join(' · '))}</p>` : ''}
    ${g.summary ? `<p class="fine about-t"><b>NCBI Gene summary:</b> ${esc(g.summary)}</p>` : ''}
    ${g.uniprot_function ? `<details><summary class="fine">UniProt function (${esc(g.uniprot)})</summary><p class="fine about-t">${esc(g.uniprot_function)}</p></details>` : ''}
    <p class="fine"><b>Tissue specificity:</b> ${esc(g.tissue_spec || '—')} (${esc(g.tissue_dist || '')})${g.secretome_loc ? ` · <b>Secretome:</b> ${esc(g.secretome_loc)}${g.secretome_fn ? ` (${esc(g.secretome_fn)})` : ''}` : ''}${g.subcellular ? ` · <b>In the cell:</b> ${esc(g.subcellular)}` : ''}</p>
    ${g.tissues.length ? `<p class="fine"><b>Tissues where it is enriched</b> (nTPM)</p>${bars(g.tissues, 'tissue', 'ntpm', '')}` : '<p class="fine muted">No tissue-enriched expression in HPA (expressed broadly or not detected), so the body is not coloured.</p>'}
    ${g.cells.length ? `<p class="fine"><b>Cell types</b> (single-cell nCPM)</p>${bars(g.cells, 'cell', 'ncpm', '')}` : ''}
    <p class="fine"><b>Pathways</b> (Reactome, most specific level): ${g.pathways.map((p) => `<a href="#" data-pw="${p.id}">${esc(p.name)}</a>`).join(' · ') || 'not mapped in Reactome'}</p>
    <p class="fine"><b>Protein partners</b> (STRING ≥ 700): ${g.partners.map((p) => `<a href="#" data-g="${esc(p.symbol)}">${esc(p.symbol)}</a> <small>${p.score}</small>`).join(' · ') || 'none at this confidence'}</p>
    <canvas id="mol-net" width="420" height="260"></canvas>
    ${g.disease ? `<p class="fine"><b>Disease involvement (HPA):</b> ${esc(g.disease)}</p>` : ''}
    <h3 class="st-h">Genetics</h3>
    ${g.eqtl?.length ? `<p class="fine"><b>GTEx eQTLs</b>: a common variant is associated with this gene's expression level in ${g.eqtl.length} tissue${g.eqtl.length === 1 ? '' : 's'} (lead variant per tissue, q ≤ 0.05). <button class="ghost-btn tiny" id="mol-eqtl">Paint these tissues</button></p>
      <details><summary class="fine">Tissues, lead variant, effect direction</summary><ul class="fine">${g.eqtl.slice(0, 30).map((e) => `<li>${esc(e.tissue.replace(/_/g, ' '))}: ${esc(e.rsid || '')} · slope ${e.slope?.toFixed(2)} (${e.slope > 0 ? 'higher' : 'lower'} expression with the alternative allele) · q ${e.q?.toExponential(1)}</li>`).join('')}</ul></details>` : '<p class="fine muted">No GTEx eQTL for this gene in the stored results.</p>'}
    ${g.gwas?.length ? `<p class="fine"><b>GWAS Catalog associations</b> mapped to this gene: ${g.n_gwas.toLocaleString()} (strongest shown). Associations mapped by genomic position, not proof that this gene causes the trait.</p>
      <ul class="fine gw">${g.gwas.slice(0, 15).map((a) => `<li>${esc(a.trait)} <small>p ${a.pvalue < 1e-300 ? '< 1e-300' : a.pvalue.toExponential(1)} · ${esc(a.risk_allele || '')}</small> <a href="https://pubmed.ncbi.nlm.nih.gov/${esc(a.pmid)}/" target="_blank" rel="noopener">PMID ${esc(a.pmid)}</a></li>`).join('')}</ul>` : '<p class="fine muted">No GWAS Catalog association mapped to this gene.</p>'}
    <p class="fine cite">Human Protein Atlas (CC BY-SA 4.0) · NCBI Gene (public domain) · UniProt (CC BY 4.0) · Reactome (CC0) · STRING v12 (CC BY 4.0) · GWAS Catalog (EMBL-EBI) · GTEx v8 eQTLs. Text unchanged.</p>`;
  bindLinks($('#mol-card')); drawNet(g);
  $('#mol-eqtl')?.addEventListener('click', () => { const v = {}; g.eqtl.forEach((e) => { if (e.hpa) v[e.hpa] = Math.max(v[e.hpa] || 0, -Math.log10(e.q || 1e-300)); }); paint(v, `${g.symbol}: tissues with a GTEx eQTL (colour = −log10 q of the lead variant)`); });
}

export async function openPathway(id, keepPlay = false) {
  if (!keepPlay) { stopPlay(); stopRx(); }
  const p = await api(`/api/mol/pathway?id=${id}`); if (p.error) return;
  M.cur = { pathway: p.id };
  paint(Object.fromEntries(p.tissues.map((t) => [t.tissue, t.genes])), `${p.name}: number of its genes enriched in each tissue`);
  if (keepPlay) return p;
  $('#mol-card').innerHTML = `<p class="fine">${p.parents.map((x) => `<a href="#" data-pw="${x.id}">${esc(x.name)}</a>`).join(' › ')}${p.parents.length ? ' › ' : ''}<b>${esc(p.name)}</b></p>
    <h3 class="st-h">${esc(p.name)} <small>${p.n_genes} genes · <a href="${esc(p.link)}" target="_blank" rel="noopener">Reactome ${esc(p.id)}</a></small></h3>
    ${p.children.length ? `<p class="fine"><b>Steps / sub-pathways</b> (${p.children.length}) <button class="primary small" id="mol-play">▶ Play steps</button></p><ol class="mol-steps">${p.children.map((c) => `<li><a href="#" data-pw="${c.id}">${esc(c.name)}</a> <small>${c.n_genes}</small></li>`).join('')}</ol>` : '<p class="fine muted">No sub-pathways (this is a most specific Reactome pathway).</p>'}
    <p class="fine"><b>Tissues</b> (genes of this pathway enriched there)</p>${bars(p.tissues.slice(0, 14), 'tissue', 'genes', '')}
    <p class="fine"><b>Genes</b>: ${p.genes.slice(0, 120).map((x) => `<a href="#" data-g="${esc(x)}">${esc(x)}</a>`).join(' ')}${p.n_genes > 120 ? ` … (+${p.n_genes - 120})` : ''}</p>
    <p class="fine cite">Reactome (CC0) pathway membership mapped to genes via UniProt; tissue enrichment from the Human Protein Atlas (CC BY-SA 4.0).</p>`;
  bindLinks($('#mol-card'));
  $('#mol-play')?.addEventListener('click', () => playSteps(p));
  reactionSection(p.id);
}

// ------------------------------------------------------------------ reaction player (Reactome reactions cached by tools/reactome_reactions.py)
let RXI = null;
async function reactionSection(pid) {
  RXI = RXI || (await api('/training-4D/rt/molecular/reactions/index.json').catch(() => ({ pathways: {} })));
  const card = $('#mol-card');
  if (!RXI.pathways?.[pid]) {
    const cached = Object.entries(RXI.pathways || {}).map(([id, v]) => `<a href="#" data-pw="${id}">${esc(v.name)}</a>`).join(' · ');
    card.insertAdjacentHTML('beforeend', `<p class="fine muted">Reaction-level steps are cached for: ${cached || 'none yet'}.</p>`); bindLinks(card); return;
  }
  const R = await api(`/training-4D/rt/molecular/reactions/${pid}.json`);
  card.insertAdjacentHTML('beforeend', `<div class="rx-box"><p class="fine"><b>Reactions, in order</b> (${R.reactions.length}; Reactome, ordered by "preceding event") <button class="primary small" id="rx-play">▶ Play reactions</button></p>
    ${R.summary ? `<details><summary class="fine">Pathway summary (Reactome)</summary><p class="fine about-t">${esc(R.summary)}</p></details>` : ''}
    <canvas id="rx-cv" width="460" height="230"></canvas><div id="rx-txt" class="fine"></div>
    <ol class="rx-list">${R.reactions.map((r, i) => `<li data-rx="${i}">${r.section ? `<small>${esc(r.section)} ›</small> ` : ''}${esc(r.name)}</li>`).join('')}</ol>
    <p class="fine cite">Reaction names, participants and summaries are Reactome's, unchanged (data CC0). The animation shows which molecules enter and leave each reaction; it does not show amounts or rates.</p></div>`);
  const show = (i) => showReaction(R, i);
  card.querySelectorAll('[data-rx]').forEach((li) => (li.onclick = () => { stopRx(); show(+li.dataset.rx); }));
  $('#rx-play').onclick = () => {
    if (M.rx) return stopRx();
    $('#rx-play').textContent = '■ Stop'; let i = 0; show(i);
    M.rx = setInterval(() => { i = (i + 1) % R.reactions.length; show(i); }, 3600);
  };
  show(0);
}
function stopRx() { if (M.rx) { clearInterval(M.rx); M.rx = null; const b = $('#rx-play'); if (b) b.textContent = '▶ Play reactions'; } }
async function showReaction(R, i) {
  const r = R.reactions[i]; if (!r) return;
  document.querySelectorAll('.rx-list li').forEach((li) => li.classList.toggle('on', +li.dataset.rx === i));
  $('#rx-txt').innerHTML = `<b>${i + 1}/${R.reactions.length}. ${esc(r.name)}</b>${r.compartment?.length ? ` <small>· ${esc(r.compartment.join(', '))}</small>` : ''}
    ${r.genes.length ? `<br>Enzyme / participant genes: ${r.genes.map((g) => `<a href="#" data-g="${esc(g)}">${esc(g)}</a>`).join(' ')}` : ''}
    ${r.summary ? `<details><summary>Reactome summary</summary><p class="about-t">${esc(r.summary)}</p></details>` : ''} <a href="${esc(r.link)}" target="_blank" rel="noopener">Reactome ${esc(r.id)}</a>`;
  bindLinks($('#rx-txt'));
  animateReaction(r);
  if (r.genes.length) {
    const t = await api(`/api/mol/tissues_for?s=${encodeURIComponent(r.genes.join(','))}`);
    paint(Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.ntpm])), `Step ${i + 1}: where its genes are enriched (HPA)`);
  } else paint({}, `Step ${i + 1}: no protein participants listed`);
}
// inputs on the left flow through the catalyst into the outputs on the right
function animateReaction(r) {
  const cv = $('#rx-cv'); if (!cv) return; const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  const short = (n) => n.split(' · ')[0].slice(0, 22);
  const ins = r.inputs.map(short), outs = r.outputs.map(short), enz = r.genes.slice(0, 4).join(', ') + (r.genes.length > 4 ? '…' : '');
  const yAt = (k, n) => (H * (k + 1)) / (n + 1);
  const t0 = performance.now(); cancelAnimationFrame(M.rxRaf);
  const frame = () => {
    const u = Math.min(1, (performance.now() - t0) / 2600), e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
    g.fillStyle = '#050c18'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#12304d'; g.beginPath(); g.ellipse(W / 2, H / 2, 64, 40, 0, 0, 7); g.fill();
    g.fillStyle = '#ffd166'; g.font = 'bold 11px system-ui'; g.textAlign = 'center'; g.fillText(enz || 'no enzyme listed', W / 2, H / 2 + 4);
    g.font = '11px system-ui';
    ins.forEach((n, k) => { const y = yAt(k, ins.length); g.fillStyle = '#4cc9f0'; g.fillText(n, 70, y - 10); const x = 70 + (W / 2 - 70) * Math.min(1, e * 2), yy = y + (H / 2 - y) * Math.min(1, e * 2); g.beginPath(); g.arc(x, yy, 7, 0, 7); g.globalAlpha = e < 0.5 ? 1 : 1 - (e - 0.5) * 2; g.fill(); g.globalAlpha = 1; });
    outs.forEach((n, k) => { const y = yAt(k, outs.length); g.fillStyle = '#ff7aa2'; g.fillText(n, W - 70, y - 10); if (e > 0.5) { const f = (e - 0.5) * 2, x = W / 2 + (W - 70 - W / 2) * f, yy = H / 2 + (y - H / 2) * f; g.beginPath(); g.arc(x, yy, 7, 0, 7); g.fill(); } });
    g.strokeStyle = 'rgba(159,200,255,.35)'; g.beginPath(); g.moveTo(130, H / 2); g.lineTo(W / 2 - 66, H / 2); g.moveTo(W / 2 + 66, H / 2); g.lineTo(W - 130, H / 2); g.stroke();
    if (u < 1) M.rxRaf = requestAnimationFrame(frame);
  };
  frame();
}
function playSteps(p) {
  if (M.play) return stopPlay();
  let i = 0; $('#mol-play').textContent = '■ Stop';
  const items = $('#mol-card').querySelectorAll('.mol-steps li');
  const step = async () => {
    if (!M.play) return; const c = p.children[i % p.children.length];
    items.forEach((li, k) => li.classList.toggle('on', k === i % p.children.length));
    await openPathway(c.id, true); $('#mol-legend').insertAdjacentHTML('afterbegin', `<span class="mol-step">Step ${(i % p.children.length) + 1}/${p.children.length}</span> `);
    i++;
  };
  M.play = setInterval(step, 3200); step();
}
function stopPlay() { if (M.play) { clearInterval(M.play); M.play = null; const b = $('#mol-play'); if (b) b.textContent = '▶ Play steps'; } }

export async function openTissue(t) {
  stopPlay();
  const r = await api(`/api/mol/tissue?t=${encodeURIComponent(t)}`);
  paint({ [t]: 1 }, `${t}`);
  $('#mol-card').innerHTML = `<h3 class="st-h">${esc(t)} <small>${r.n_enriched.toLocaleString()} tissue-enriched genes (HPA)</small></h3>
    <p class="fine"><b>Highest-expressed enriched genes</b> (nTPM)</p>${bars(r.genes.slice(0, 20), 'symbol', 'ntpm', '')}
    <p class="fine"><b>Most represented pathways</b> among its enriched genes: ${r.pathways.map((p) => `<a href="#" data-pw="${p.id}">${esc(p.name)}</a> <small>${p.genes}</small>`).join(' · ')}</p>
    <p class="fine">Genes: ${r.genes.map((g) => `<a href="#" data-g="${esc(g.symbol)}">${esc(g.symbol)}</a>`).join(' ')}</p>`;
  $('#mol-card').querySelectorAll('.mol-bars li span').forEach((s) => { s.style.cursor = 'pointer'; s.onclick = () => openGene(s.textContent); });
  bindLinks($('#mol-card'));
}
function bindLinks(el) {
  el.querySelectorAll('[data-g]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); openGene(a.dataset.g); }));
  el.querySelectorAll('[data-pw]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); openPathway(a.dataset.pw); }));
}
// partner network: the gene in the middle, partners on a circle, line width = STRING score
function drawNet(g) {
  const cv = $('#mol-net'); if (!cv || !g.partners.length) { if (cv) cv.remove(); return; }
  const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.38, n = g.partners.length;
  const pos = g.partners.map((p, i) => [cx + R * Math.cos((2 * Math.PI * i) / n - Math.PI / 2), cy + R * Math.sin((2 * Math.PI * i) / n - Math.PI / 2)]);
  ctx.fillStyle = '#050c18'; ctx.fillRect(0, 0, W, H);
  g.partners.forEach((p, i) => { ctx.strokeStyle = `rgba(76,201,240,${0.25 + 0.6 * ((p.score - 700) / 300)})`; ctx.lineWidth = 1 + 3 * ((p.score - 700) / 300); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(...pos[i]); ctx.stroke(); });
  ctx.font = '11px system-ui'; ctx.textAlign = 'center';
  g.partners.forEach((p, i) => { ctx.fillStyle = '#12385a'; ctx.beginPath(); ctx.arc(...pos[i], 15, 0, 7); ctx.fill(); ctx.fillStyle = '#cfe6ff'; ctx.fillText(p.symbol, pos[i][0], pos[i][1] + 4); });
  ctx.fillStyle = '#ff5d8f'; ctx.beginPath(); ctx.arc(cx, cy, 20, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 12px system-ui'; ctx.fillText(g.symbol, cx, cy + 4);
  cv.onclick = (e) => { const r = cv.getBoundingClientRect(), x = ((e.clientX - r.left) * W) / r.width, y = ((e.clientY - r.top) * H) / r.height; const k = pos.findIndex(([a, b]) => Math.hypot(a - x, b - y) < 16); if (k >= 0) openGene(g.partners[k].symbol); };
}
function picking(canvas) {
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), tip = $('#mol-pick'); let down = null;
  const hit = (e) => { const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, M.camera); return ray.intersectObjects(M.meshes.filter((m) => m.userData.tissues.length && m.material.opacity > 0.05), false)[0]?.object; };
  canvas.addEventListener('pointermove', (e) => { const m = hit(e), r = canvas.getBoundingClientRect(); if (!m) { tip.hidden = true; return; } tip.hidden = false; tip.style.left = `${e.clientX - r.left}px`; tip.style.top = `${e.clientY - r.top}px`; tip.textContent = `${m.userData.part.name} · ${m.userData.tissues.join(', ')}`; });
  canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => { if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return; const m = hit(e); if (m) openTissue(m.userData.tissues[0]); });
}
