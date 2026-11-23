// DNA -> protein world: follow one real human gene from the cell to its folded, working protein.
// Levels (camera flies between them): cell -> nucleus -> chromosome -> gene neighbourhood -> double helix ->
// transcription -> splicing -> mRNA export -> translation -> folded protein -> destination -> interaction network.
// Everything is clickable: each object explains itself (verbatim textbook sentences at basic / intermediate /
// advanced level, tools/genome_concepts_build.py) plus this gene's real data (hg38 RefSeq, ENCODE cCREs, ClinVar,
// AlphaFold, HPA, STRING, BioGRID, Reactome, GTEx). Shapes of organelles are schematic and labelled so; sequences,
// positions, counts and structures are real. Nothing predicts clinical effect.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const BASE_COL = { A: '#06d6a0', T: '#ff6b6b', U: '#ff9e00', G: '#ffd166', C: '#4cc9f0', N: '#666' };
const AA_CLASS = { hydrophobic: 'AVLIMFWC', polar: 'STNQYGP', positive: 'KRH', negative: 'DE' };
const AA_COL = (a) => (AA_CLASS.hydrophobic.includes(a) ? '#ffd166' : AA_CLASS.polar.includes(a) ? '#90e0ef' : AA_CLASS.positive.includes(a) ? '#4cc9f0' : AA_CLASS.negative.includes(a) ? '#ff6b6b' : a === '*' ? '#fff' : '#aaa');
const SIG_COL = (s) => (/pathogenic/i.test(s) && !/benign|conflict/i.test(s) ? '#ff4d6d' : /benign/i.test(s) && !/conflict/i.test(s) ? '#06d6a0' : '#ffd166');
const CCRE_COL = { PLS: '#ff4d6d', pELS: '#ff9e00', dELS: '#ffd166', 'CA-CTCF': '#4cc9f0', 'CTCF-only': '#4cc9f0', 'CA-H3K4me3': '#b388ff', 'CA-TF': '#06d6a0', TF: '#06d6a0', CA: '#9aa7c7' };
const FORMULA = [
  ['Adenine (A)', 'C5H5N5', 'purine; pairs with T (DNA) or U (RNA), 2 hydrogen bonds'], ['Guanine (G)', 'C5H5N5O', 'purine; pairs with C, 3 hydrogen bonds'],
  ['Cytosine (C)', 'C4H5N3O', 'pyrimidine'], ['Thymine (T)', 'C5H6N2O2', 'pyrimidine; DNA only'], ['Uracil (U)', 'C4H4N2O2', 'pyrimidine; RNA only'],
  ['Deoxyribose', 'C5H10O4', 'DNA sugar (no 2′-OH)'], ['Ribose', 'C5H10O5', 'RNA sugar (2′-OH)'], ['Phosphate', 'PO4 (3−)', 'links sugars 3′→5′: the backbone'],
];
const STAGES = [
  ['cell', 'Cell'], ['nucleus', 'Nucleus'], ['chrom', 'Chromosome'], ['locus', 'Gene neighbourhood'], ['helix', 'Double helix'], ['tx', 'Transcription'],
  ['splice', 'Splicing'], ['export', 'mRNA export'], ['tl', 'Translation'], ['prot', 'Folded protein'], ['dest', 'Destination'], ['net', 'Interaction network'],
];
const G = { d: null, playing: true, speed: 1, t: 0, stage: 'cell', level: 'basic', concepts: null, journey: null };

export async function startGenome() {
  const host = $('#gn-body'); if (!host || host.dataset.ok) return; host.dataset.ok = '1';
  host.innerHTML = `
    <div class="gn-bar"><input id="gn-q" type="search" placeholder="Any human gene (e.g. HBB, ACTN3, CFTR, TP53, BRCA1, INS, COL1A1, MSTN, APOE, DMD)" value="HBB"><div id="gn-sugg" class="gn-sugg"></div>
      <label class="fine">Level <select id="gn-level"><option value="basic">Basic</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label>
      <button class="primary small" id="gn-journey">▶ Journey: follow this gene</button><span class="fine" id="gn-status"></span></div>
    <div id="gn-head"></div>
    <div class="gn-world">
      <section class="card gn-3d"><div class="gn-stages">${STAGES.map(([k, v], i) => `<button class="gn-st ${k === 'cell' ? 'on' : ''}" data-st="${k}"><b>${i + 1}</b> ${v}</button>`).join('')}</div>
        <div class="gn-cvwrap"><canvas id="gn-cv"></canvas><div id="gn-tip" class="gn-tip" hidden></div><div id="gn-narr" class="gn-narr"></div></div>
        <div class="gn-ctl"><button class="ghost-btn" id="gn-play">⏸</button><label class="fine">Speed <input type="range" id="gn-speed" min="1" max="30" value="8"></label><label class="fine">Time <input type="range" id="gn-pos" min="0" max="1000" value="0" style="width:180px"></label><span class="fine" id="gn-readout"></span></div>
        <p class="fine muted">Click anything in the view to learn what it is. Organelle shapes are schematic; sequences, positions, structures and counts are this gene's real data.</p></section>
      <aside class="card gn-explain"><div class="card-h"><h2 id="gn-ex-t">Explanation</h2></div><div id="gn-ex"></div></aside>
    </div>
    <div class="gn-grid">
      <section class="card"><div class="card-h"><h2>Gene → mRNA → protein</h2></div><div id="gn-layout"></div><div id="gn-seq" class="gn-seq"></div></section>
      <section class="card"><div class="card-h"><h2>What if a base changes?</h2></div><div id="gn-mut"></div></section>
      <section class="card"><div class="card-h"><h2>What it does, where, and which conditions</h2></div><div id="gn-info"></div></section>
      <section class="card"><div class="card-h"><h2>Chemistry and the genetic code</h2></div><div id="gn-chem"></div></section>
    </div>`;
  let tm = null;
  $('#gn-q').oninput = () => { clearTimeout(tm); tm = setTimeout(async () => { const r = await (await fetch(`/api/gene/search?q=${encodeURIComponent($('#gn-q').value)}`)).json(); $('#gn-sugg').innerHTML = r.map((x) => `<button data-g="${esc(x.symbol)}">${esc(x.symbol)} <small>${esc((x.description || '').slice(0, 50))} · ${x.aa} aa</small></button>`).join(''); $('#gn-sugg').querySelectorAll('[data-g]').forEach((b) => (b.onclick = () => { $('#gn-sugg').innerHTML = ''; openGene(b.dataset.g); })); }, 200); };
  $('#gn-q').onkeydown = (e) => { if (e.key === 'Enter') { $('#gn-sugg').innerHTML = ''; openGene($('#gn-q').value); } };
  $('#gn-level').onchange = (e) => { G.level = e.target.value; if (G.lastInfo) explain(G.lastInfo); };
  host.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => { stopJourney(); go(b.dataset.st); }));
  $('#gn-play').onclick = () => { G.playing = !G.playing; $('#gn-play').textContent = G.playing ? '⏸' : '▶'; };
  $('#gn-speed').oninput = (e) => { G.speed = +e.target.value / 8; };
  $('#gn-pos').oninput = (e) => { G.playing = false; $('#gn-play').textContent = '▶'; G.scrub = +e.target.value / 1000; };
  $('#gn-journey').onclick = () => (G.journey ? stopJourney() : journey());
  G.concepts = await fetch('/training-4D/rt/genome/concepts.json').then((r) => r.json()).then((j) => j.concepts).catch(() => ({}));
  initThree(); chem();
  if (!G.pending) load('HBB');
}

export function openGene(sym) { G.pending = sym; const q = $('#gn-q'); if (q) q.value = sym; return load(sym); }

async function load(sym) {
  $('#gn-status').textContent = `Loading ${sym}…`;
  G.req = sym;
  const d = await (await fetch(`/api/gene/model?s=${encodeURIComponent(sym)}`)).json();
  if (G.req !== sym) return;
  if (d.error) { $('#gn-status').textContent = d.error; return; }
  G.d = d; G.scrub = null; G.t = 0; G.mutPos = null;
  window.__noteCtx = { hash: 'genome', id: d.symbol, label: `${d.symbol} gene` };
  const I = d.info || {};
  $('#gn-status').textContent = ''; $('#gn-q').value = d.symbol;
  $('#gn-head').innerHTML = `<h2 class="cl-h">${esc(d.symbol)} <small>${esc(I.description || '')}</small></h2>
    <p class="fine">chr${esc(d.chrom.replace('chr', ''))}:${(d.start + 1).toLocaleString()}-${d.end.toLocaleString()} (${d.strand} strand, hg38) · ${esc(d.transcript)} · ${d.n_exons} exons · gene ${d.gene_len.toLocaleString()} bp → mRNA ${d.mrna_len.toLocaleString()} nt → coding ${d.cds_len.toLocaleString()} nt → protein ${d.protein.length.toLocaleString()} aa${I.uniprot ? ` · UniProt ${esc(I.uniprot)}` : ''}${d.context?.n_pubmed ? ` · ${d.context.n_pubmed.toLocaleString()} PubMed papers` : ''}</p>`;
  layout(d); seqView(d); mutPanel(d); info(d);
  explain({ concept: 'gene', title: `${d.symbol}: the gene`, facts: geneFacts(d) });
  go(G.stage);
}

// ---------------------------------------------------------------- facts (deterministic, from data)
const mb = (x) => (x / 1e6).toFixed(2);
function destination(d) {
  const I = d.info || {}, sub = I.subcellular || '', sec = I.secretome_loc || '', pc = I.protein_class || '';
  if (sec) return { key: 'out', label: `secreted (${sec})`, src: 'HPA secretome' };
  if (/plasma membrane|cell junction/i.test(sub)) return { key: 'membrane', label: sub, src: 'HPA subcellular' };
  if (/mitochondri/i.test(sub)) return { key: 'mito', label: sub, src: 'HPA subcellular' };
  if (/nucle/i.test(sub)) return { key: 'nucleus', label: sub, src: 'HPA subcellular' };
  if (/golgi|vesicle|endoplasmic/i.test(sub)) return { key: 'golgi', label: sub, src: 'HPA subcellular' };
  if (sub) return { key: 'cytosol', label: sub, src: 'HPA subcellular' };
  if (/secreted/i.test(pc)) return { key: 'out', label: 'predicted secreted', src: 'HPA protein class' };
  if (/membrane/i.test(pc)) return { key: 'membrane', label: 'predicted membrane', src: 'HPA protein class' };
  return { key: 'cytosol', label: /intracellular/i.test(pc) ? 'predicted intracellular' : 'location not recorded', src: 'HPA protein class' };
}
function geneFacts(d) {
  const c = d.context || {}, I = d.info || {}, sz = c.chrom_sizes?.[d.chrom];
  const f = [`Lives on chromosome ${d.chrom.replace('chr', '')} at ${mb(d.start)} Mb${sz ? ` (${((100 * d.start) / sz).toFixed(1)}% along its ${mb(sz)} Mb)` : ''}, read from the ${d.strand === '+' ? 'forward' : 'reverse'} strand.`,
    `${d.gene_len.toLocaleString()} bp of DNA in ${d.n_exons} exons; ${(d.gene_len - d.mrna_len).toLocaleString()} bp of introns are spliced out, leaving ${d.mrna_len.toLocaleString()} nt of mRNA (GC ${d.gc}%).`,
    `${d.cds_len.toLocaleString()} coding nucleotides = ${d.protein.length.toLocaleString()} codons → a ${d.protein.length.toLocaleString()}-amino-acid protein.`];
  if (I.summary) f.push(`RefSeq summary: “${I.summary}”`);
  if (I.uniprot_function) f.push(`UniProt function: “${I.uniprot_function.replace(/\{[^}]+\}/g, '').slice(0, 600)}”`);
  const dst = destination(d); f.push(`Where the protein works: ${dst.label} (${dst.src}).`);
  if (I.blood_ms) f.push(`Measured in blood plasma by mass spectrometry at about ${Number(I.blood_ms).toExponential(2)} pg/L (HPA).`);
  if (d.info?.tissues?.length) f.push(`Most RNA in: ${d.info.tissues.slice(0, 5).map((t) => `${t.tissue} (${t.ntpm} nTPM)`).join(', ')} (HPA).`);
  if (c.ccre?.length) f.push(`${c.ccre.length} ENCODE candidate regulatory elements lie within 50 kb (${Object.entries(c.ccre.reduce((o, x) => ((o[x.label] = (o[x.label] || 0) + 1), o), {})).map(([k, v]) => `${v} ${k}`).join(', ')}).`);
  if (c.orthologs) f.push(`Orthologs recorded in ${Object.keys(c.orthologs).length} other species (NCBI): ${Object.keys(c.orthologs).filter((x) => !x.startsWith('taxon')).join(', ') || 'see list'}.`);
  if (d.variants?.length) f.push(`${d.variants.length.toLocaleString()} ClinVar records change its protein; ${d.variants.filter((v) => SIG_COL(v.sig) === '#ff4d6d').length} are classed pathogenic / likely pathogenic.`);
  if (d.conditions?.length) f.push(`Conditions linked in ClinVar: ${d.conditions.slice(0, 6).map((x) => x.disease).join('; ')}${d.conditions.length > 6 ? '…' : ''}.`);
  return f;
}

// ---------------------------------------------------------------- explanation panel
function explain(inf) {
  G.lastInfo = inf;
  const C = (G.concepts || {})[inf.concept];
  const lv = G.level, order = lv === 'basic' ? ['basic', 'intermediate', 'advanced'] : lv === 'intermediate' ? ['intermediate', 'basic', 'advanced'] : ['advanced', 'intermediate', 'basic'];
  const qs = C ? order.flatMap((k) => (C[k] || []).map((q) => ({ ...q, lvl: k }))).slice(0, lv === 'basic' ? 3 : 5) : [];
  $('#gn-ex-t').textContent = inf.title || C?.title || 'Explanation';
  $('#gn-ex').innerHTML = `${inf.facts?.length ? `<p class="fine"><b>This gene, real data</b></p><ul class="fine gn-facts">${inf.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
    ${qs.length ? `<p class="fine"><b>${esc(C.title)}</b>: what the textbooks say <small>(${esc(lv)} level)</small></p><ul class="fine au-q">${qs.map((q) => `<li>“${esc(q.text)}” <small><i>${esc(q.title)}</i> · ${esc(q.licence)}${q.lvl !== lv ? ` · ${q.lvl}` : ''}</small></li>`).join('')}</ul>` : ''}
    ${inf.actions || ''}`;
  $('#gn-ex').querySelectorAll('[data-gene]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); openGene(a.dataset.gene); }));
  $('#gn-ex').querySelectorAll('[data-goto]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); go(a.dataset.goto); }));
  $('#gn-ex').querySelectorAll('[data-codon]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); $('#gn-mpos').value = a.dataset.codon; mutate(); $('#gn-mut').scrollIntoView({ behavior: 'smooth', block: 'center' }); }));
}

// ---------------------------------------------------------------- 2D panels (layout, sequence, mutation, info, chemistry)
function layout(d) {
  const W = 800, L = d.gene_len, x = (p) => 10 + (p / L) * (W - 20);
  const ex = d.exons.map(([a, b], i) => `<rect x="${x(a)}" y="22" width="${Math.max(1.5, x(b) - x(a))}" height="18" fill="#4cc9f066" stroke="#4cc9f0"><title>Exon ${i + 1}: ${(b - a).toLocaleString()} nt</title></rect>`).join('');
  const cd = d.cds.map(([a, b]) => `<rect x="${x(a)}" y="18" width="${Math.max(1.5, x(b) - x(a))}" height="26" fill="#06d6a0"/>`).join('');
  $('#gn-layout').innerHTML = `<svg viewBox="0 0 ${W} 70" class="gn-svg"><line x1="10" y1="31" x2="${W - 10}" y2="31" stroke="#777"/>${ex}${cd}<text x="10" y="62" class="gn-t">5′ (transcription start)</text><text x="${W - 10}" y="62" text-anchor="end" class="gn-t">3′</text></svg>
    <p class="fine">Line = introns (spliced out) · blue = exons (kept in the mRNA) · green = coding part · the remaining exon ends are the 5′ and 3′ untranslated regions.</p>`;
}
function seqView(d) {
  const cs = d.cds_seq, p = d.protein, n = Math.min(60, Math.floor(cs.length / 3));
  $('#gn-seq').innerHTML = `<p class="fine"><b>First ${n} codons</b> (DNA → mRNA → amino acid). Click one to change it.</p>
    <div class="gn-codons">${Array.from({ length: n }, (_, i) => cs.slice(3 * i, 3 * i + 3)).map((c, i) => `<span class="gn-codon" data-i="${i}"><b>${[...c].map((b) => `<i style="color:${BASE_COL[b]}">${b}</i>`).join('')}</b><small>${c.replace(/T/g, 'U')}</small><em style="color:${AA_COL(p[i] || '*')}">${p[i] || '*'}</em></span>`).join('')}</div>
    <details><summary class="fine">Full protein (${p.length} aa) and mRNA (${d.mrna_len.toLocaleString()} nt)</summary><p class="gn-mono">${p.replace(/(.{60})/g, '$1\n')}</p><p class="gn-mono small">${d.mrna.replace(/T/g, 'U').replace(/(.{100})/g, '$1\n')}</p></details>`;
  $('#gn-seq').querySelectorAll('[data-i]').forEach((s) => (s.onclick = () => { $('#gn-mpos').value = +s.dataset.i + 1; mutate(); }));
}
function mutPanel(d) {
  const v = d.variants, by = {}; v.forEach((x) => { const k = SIG_COL(x.sig); by[k] = (by[k] || 0) + 1; });
  const L = d.protein.length, W = 800;
  $('#gn-mut').innerHTML = `<div class="gn-row"><label class="fine">Codon <input id="gn-mpos" type="number" min="1" max="${L}" value="${d.symbol === 'HBB' ? 7 : 1}" style="width:80px"></label>
      <label class="fine">Position <select id="gn-mnt"><option value="0">1st</option><option value="1" selected>2nd</option><option value="2">3rd</option></select></label>
      <label class="fine">New base <select id="gn-mb"><option>A</option><option>C</option><option>G</option><option selected>T</option></select></label><button class="primary small" id="gn-mgo">Change it</button></div>
    <div id="gn-mres" class="fine"></div>
    <p class="fine"><b>ClinVar protein changes</b>: ${v.length.toLocaleString()} · <span style="color:#ff4d6d">pathogenic ${by['#ff4d6d'] || 0}</span> · <span style="color:#06d6a0">benign ${by['#06d6a0'] || 0}</span> · <span style="color:#ffd166">uncertain / conflicting ${by['#ffd166'] || 0}</span></p>
    <svg viewBox="0 0 ${W} 60" class="gn-svg"><rect x="10" y="26" width="${W - 20}" height="8" fill="#334"/>${v.slice(0, 3000).map((x) => `<line x1="${10 + (x.pos / L) * (W - 20)}" x2="${10 + (x.pos / L) * (W - 20)}" y1="${x.kind === 'missense' ? 8 : 40}" y2="${x.kind === 'missense' ? 26 : 52}" stroke="${SIG_COL(x.sig)}" stroke-opacity=".7"><title>${esc(x.name)} · ${esc(x.sig)}</title></line>`).join('')}<text x="10" y="8" class="gn-t">missense above · nonsense / frameshift / synonymous below</text></svg>`;
  $('#gn-mgo').onclick = mutate; mutate();
}
function mutate() {
  const d = G.d, i = Math.max(1, Math.min(d.protein.length, +$('#gn-mpos').value)) - 1, k = +$('#gn-mnt').value, nb = $('#gn-mb').value;
  const cod = d.cds_seq.slice(3 * i, 3 * i + 3), nc = cod.slice(0, k) + nb + cod.slice(k + 1), a0 = d.code[cod], a1 = d.code[nc];
  const kind = cod === nc ? 'no change' : a0 === a1 ? 'synonymous (same amino acid)' : a1 === '*' ? 'nonsense (premature stop: protein cut short)' : a0 === '*' ? 'stop-loss (protein runs on)' : 'missense (different amino acid)';
  const cv = d.variants.filter((x) => x.pos === i + 1), exact = cv.filter((x) => (a1 === '*' ? x.kind === 'nonsense' : x.alt === a1));
  $('#gn-mres').innerHTML = `<p>Codon ${i + 1}: <b class="gn-mono">${cod}</b> (${esc(d.aa_names[a0])}) → <b class="gn-mono">${nc}</b> (${esc(d.aa_names[a1])}) · <b>${kind}</b></p>
    <p class="fine">Effect on the protein sequence only, computed with the genetic code. Whether it causes disease is <b>not</b> predicted here; real classifications:</p>
    ${cv.length ? `<ul class="fine">${cv.slice(0, 12).map((x) => `<li style="${exact.includes(x) ? 'font-weight:600' : ''}"><span style="color:${SIG_COL(x.sig)}">${esc(x.sig)}</span> · ${esc(x.name)} · ${esc(x.phenotypes.split('|').slice(0, 3).join('; '))} <small>(${esc(x.review)})</small> <a href="https://www.ncbi.nlm.nih.gov/clinvar/variation/${esc(x.vid)}/" target="_blank" rel="noopener">ClinVar</a></li>`).join('')}</ul>` : '<p class="fine muted">ClinVar has no protein-level record at this position.</p>'}`;
  G.mutPos = i; if (G.stage === 'prot') go('prot');
}
function info(d) {
  const I = d.info || {}, c = d.context || {};
  $('#gn-info').innerHTML = `${I.mol_function ? `<p class="fine"><b>Molecular function</b> (HPA): ${esc(I.mol_function)}</p>` : ''}${I.bio_process ? `<p class="fine"><b>Biological process</b>: ${esc(I.bio_process)}</p>` : ''}
    ${I.disease ? `<p class="fine"><b>Disease involvement</b> (HPA): ${esc(I.disease)}</p>` : ''}
    ${I.tissues?.length ? `<p class="fine"><b>Highest RNA expression</b>: ${I.tissues.map((t) => `${esc(t.tissue)} ${t.ntpm}`).join(' · ')}</p>` : ''}
    ${d.conditions.length ? `<p class="fine"><b>ClinVar conditions</b>:</p><ul class="fine">${d.conditions.slice(0, 20).map((x) => `<li>${esc(x.disease)} <small>${esc(x.source)}${x.mim ? ` · MIM ${esc(x.mim)}` : ''}</small></li>`).join('')}</ul>` : ''}
    ${I.gwas?.length ? `<p class="fine"><b>GWAS traits</b>: ${I.gwas.map((g) => `${esc(g.trait)} (p=${Number(g.pvalue).toExponential(1)})`).join(' · ')}</p>` : ''}
    ${c.eqtl?.length ? `<p class="fine"><b>Variants that change its expression</b> (GTEx eQTL, strongest first): ${c.eqtl.slice(0, 8).map((e) => `${esc(e.rsid)} in ${esc(e.tissue.replace(/_/g, ' '))} (slope ${e.slope})`).join(' · ')}</p>` : ''}
    ${c.pathways?.length ? `<p class="fine"><b>Reactome pathways</b>: ${c.pathways.slice(0, 15).map((p) => esc(p.name)).join(' · ')}</p>` : ''}
    <p class="btnrow"><button class="ghost-btn" id="gn-mol">Open in Body systems</button></p><p class="fine cite">${esc(d.sources)}; ENCODE SCREEN cCREs; NCBI orthologs; BioGRID; STRING; Reactome; GTEx v8.</p>`;
  $('#gn-mol').onclick = () => { location.hash = '#molecular'; import('./molecular.js').then(async (m) => { await m.startMolecular(); m.openGene(d.symbol); }); };
}
function chem() {
  const code = {}; const B = 'TCAG', AA = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG'; let i = 0; for (const a of B) for (const b of B) for (const c of B) code[a + b + c] = AA[i++];
  $('#gn-chem').innerHTML = `<table class="gn-tab"><tr><th>Molecule</th><th>Formula</th><th>Note</th></tr>${FORMULA.map(([n, f, t]) => `<tr><td>${esc(n)}</td><td class="gn-mono">${f.replace(/(\d+)/g, '<sub>$1</sub>')}</td><td class="fine">${esc(t)}</td></tr>`).join('')}</table>
    <div class="gn-code">${'UCAG'.split('').map((a) => `<div>${'UCAG'.split('').map((b) => `<div class="gn-cc">${'UCAG'.split('').map((c) => { const aa = code[(a + b + c).replace(/U/g, 'T')]; return `<span style="color:${AA_COL(aa)}">${a + b + c} ${aa}</span>`; }).join('')}</div>`).join('')}</div>`).join('')}</div>
    <p class="fine">Standard molecular formulas of the free bases and sugars; standard nuclear genetic code. Colours: <span style="color:#ffd166">hydrophobic</span>, <span style="color:#90e0ef">polar</span>, <span style="color:#4cc9f0">positive</span>, <span style="color:#ff6b6b">negative</span>, white = stop.</p>`;
}

// ---------------------------------------------------------------- three.js world
let R, S, C, OC, root;
function initThree() {
  const cv = $('#gn-cv');
  R = new THREE.WebGLRenderer({ canvas: cv, antialias: true }); R.setPixelRatio(Math.min(2, devicePixelRatio)); R.toneMapping = THREE.ACESFilmicToneMapping; R.outputColorSpace = THREE.SRGBColorSpace;
  S = new THREE.Scene(); S.background = new THREE.Color('#040a14'); S.fog = new THREE.FogExp2('#040a14', 0.004);
  S.environment = new THREE.PMREMGenerator(R).fromScene(new RoomEnvironment(), 0.04).texture;
  C = new THREE.PerspectiveCamera(45, 1, 0.1, 3000); C.position.set(0, 0, 120);
  OC = new OrbitControls(C, cv); OC.enableDamping = true;
  S.add(new THREE.AmbientLight(0xffffff, 0.35)); const dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(60, 80, 100); S.add(dl); const rl = new THREE.PointLight(0x4cc9f0, 400, 400); rl.position.set(-80, -40, 60); S.add(rl);
  root = new THREE.Group(); S.add(root);
  const fit = () => { const r = cv.parentElement.getBoundingClientRect(); const w = r.width - 2, h = Math.max(380, Math.min(620, w * 0.58)); R.setSize(w, h, false); cv.style.width = `${w}px`; cv.style.height = `${h}px`; C.aspect = w / h; C.updateProjectionMatrix(); };
  new ResizeObserver(fit).observe(cv.parentElement); fit();
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let down = null;
  const hit = (e) => { const r = cv.getBoundingClientRect(); ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ptr, C); for (const h of ray.intersectObjects(root.children, true)) { if (h.object.isSprite) continue; let o = h.object; while (o && !o.userData.info) o = o.parent; if (o) return { o, h }; } return null; };
  cv.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  cv.addEventListener('pointerup', (e) => { if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return; const r = hit(e); if (r) { explain(r.o.userData.info); flash(r.o); } });
  cv.addEventListener('pointermove', (e) => { const r = hit(e), tip = $('#gn-tip'); if (!r) { tip.hidden = true; cv.style.cursor = 'grab'; return; } tip.hidden = false; tip.textContent = r.o.userData.info.title; const b = cv.getBoundingClientRect(); tip.style.left = `${e.clientX - b.left + 12}px`; tip.style.top = `${e.clientY - b.top + 12}px`; cv.style.cursor = 'pointer'; });
  let last = performance.now();
  const loop = (now) => { const dt = Math.min(0.1, (now - last) / 1000); last = now; if (G.playing) G.t += dt * G.speed; G.tick?.(dt, G.scrub ?? null, now); if (G.fly) flyStep(); OC.update(); R.render(S, C); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}
function flash(o) { o.traverse?.((x) => { if (x.material?.emissive) { const e0 = x.material.emissive.clone(), i0 = x.material.emissiveIntensity; x.material.emissive.set('#ffffff'); x.material.emissiveIntensity = 0.8; setTimeout(() => { x.material.emissive.copy(e0); x.material.emissiveIntensity = i0; }, 350); } }); }
function flyTo(pos, target) { G.fly = { p: pos.clone(), t: target.clone(), k: 0 }; }
function flyStep() { const f = G.fly; f.k = Math.min(1, f.k + 0.03); C.position.lerp(f.p, 0.08); OC.target.lerp(f.t, 0.08); if (f.k >= 1) G.fly = null; }
const clearRoot = () => { while (root.children.length) { const o = root.children.pop(); o.traverse?.((x) => { x.geometry?.dispose(); if (x.material) [].concat(x.material).forEach((m) => { m.map?.dispose(); m.dispose(); }); }); } G.tick = null; };
const mat = (col, o = {}) => new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.35, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.3, ...o });
const glass = (col, op = 0.18) => new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.15, transmission: 0.6, thickness: 2, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide });
const sph = (r, col, o) => new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat(col, o));
const tag = (o, concept, title, facts, actions) => { o.userData.info = { concept, title, facts, actions }; return o; };
function label(txt, col = '#fff', size = 30, w = 512) { const c = document.createElement('canvas'); c.width = w; c.height = 64; const g = c.getContext('2d'); g.font = `600 ${size}px system-ui`; g.fillStyle = col; g.textAlign = 'center'; g.shadowColor = '#000'; g.shadowBlur = 6; g.fillText(txt, w / 2, 44); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false })); s.scale.set(w / 16, 4, 1); s.renderOrder = 20; return s; }
const narr = (html) => { $('#gn-narr').innerHTML = html; };
const codonBtn = (n, txt) => `<p class="btnrow"><a href="#" class="ghost-btn" data-codon="${n}">${txt}</a></p>`;

function go(stage) {
  G.stage = stage; clearRoot(); root.rotation.set(0, 0, 0); G.scrub = null; $('#gn-readout').textContent = '';
  document.querySelectorAll('.gn-st').forEach((b) => b.classList.toggle('on', b.dataset.st === stage));
  const d = G.d; if (!d) return;
  (SCENES[stage] || SCENES.cell)(d);
}

// ---------------------------------------------------------------- scenes
const SCENES = {
  cell(d) {
    const dst = destination(d);
    root.add(tag(new THREE.Mesh(new THREE.SphereGeometry(60, 64, 40), glass('#7fb6ff', 0.12)), 'membrane', 'Plasma membrane', ['The cell boundary: a lipid bilayer with proteins (shape schematic).']));
    const nuc = new THREE.Group(); nuc.position.set(-8, 2, 0); root.add(nuc);
    nuc.add(tag(new THREE.Mesh(new THREE.SphereGeometry(20, 48, 32), glass('#b388ff', 0.3)), 'nucleus', 'Nucleus', [`${d.symbol} is stored here as DNA on chromosome ${d.chrom.replace('chr', '')}.`], '<p class="btnrow"><a href="#" data-goto="nucleus" class="ghost-btn">Go inside the nucleus →</a></p>'));
    nuc.add(tag(sph(5, '#7b2cbf', { roughness: 0.6 }), 'nucleolus', 'Nucleolus', ['Makes ribosomal RNA and assembles ribosome subunits.']));
    for (let i = 0; i < 40; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(20); const p = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.35, 8, 16), mat('#e0aaff')); p.position.copy(v); p.lookAt(0, 0, 0); tag(p, 'pore', 'Nuclear pore', ['mRNA leaves the nucleus through these channels.']); nuc.add(p); }
    const er = new THREE.Group(); root.add(er);
    for (let k = 0; k < 5; k++) { const t = new THREE.Mesh(new THREE.TorusGeometry(25 + k * 3.2, 0.9, 10, 80, Math.PI * 1.3), mat('#4cc9f0', { transparent: true, opacity: 0.55 })); t.position.copy(nuc.position); t.rotation.set(0.2 * k, 0.4, 1.2 + 0.15 * k); tag(t, 'er', 'Rough endoplasmic reticulum', ['Ribosomes on the ER make proteins that are secreted or go to membranes.']); er.add(t); }
    for (let i = 0; i < 160; i++) { const a = Math.random() * Math.PI * 1.3, r = 25 + Math.floor(Math.random() * 5) * 3.2; const s = sph(0.55, '#ffd166'); const v = new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, (Math.random() - 0.5) * 2); v.applyEuler(new THREE.Euler(0.4, 0.4, 1.4)); s.position.copy(v.add(nuc.position)); tag(s, 'ribosome', 'Ribosome', ['Reads mRNA codons and joins amino acids into the protein chain.']); er.add(s); }
    const golgi = new THREE.Group(); golgi.position.set(32, -6, 8); root.add(golgi);
    for (let k = 0; k < 6; k++) { const g = new THREE.Mesh(new THREE.TorusGeometry(9 - k * 0.6, 1.1, 10, 40, Math.PI), mat('#ff9e00')); g.position.y = k * 2.6; g.rotation.x = Math.PI / 2; golgi.add(g); }
    tag(golgi, 'golgi', 'Golgi apparatus', ['Modifies, sorts and packages proteins into vesicles.']);
    for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(new THREE.CapsuleGeometry(2.4, 7, 8, 16), mat('#ff6b6b')); m.position.set((Math.random() - 0.3) * 80, (Math.random() - 0.5) * 70, (Math.random() - 0.5) * 50); m.rotation.set(Math.random() * 3, Math.random() * 3, 0); if (m.position.length() > 52) m.position.setLength(45); tag(m, 'mito', 'Mitochondrion', ['Makes most of the cell\'s ATP.']); root.add(m); }
    for (let i = 0; i < 14; i++) { const v = sph(1.4, '#06d6a0', { transparent: true, opacity: 0.85 }); v.position.set(28 + Math.random() * 18, -10 + Math.random() * 30, Math.random() * 20); tag(v, 'vesicle', 'Vesicle', ['Carries proteins from the Golgi to the membrane or out of the cell.']); root.add(v); }
    for (let i = 0; i < 4; i++) { const l = sph(2.2, '#90e0ef'); l.position.set(-30 + Math.random() * 20, -30 + Math.random() * 10, 20); tag(l, 'lysosome', 'Lysosome', ['Breaks down worn-out proteins and organelles.']); root.add(l); }
    for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 4, 12), mat('#c9b6ff')); p.position.set(10 + i * 6, 30, -10); tag(p, 'proteasome', 'Proteasome', ['Destroys proteins tagged with ubiquitin: how the cell recycles its proteins.']); root.add(p); }
    const mito = root.children.find((o) => o.userData.info?.concept === 'mito');
    const where = { out: [62, 0, 0], membrane: [0, 59, 0], mito: mito ? mito.position.toArray() : [30, 30, 0], nucleus: nuc.position.toArray(), golgi: golgi.position.toArray(), cytosol: [20, 25, 10] }[dst.key];
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(4, 24, 16), new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.5 })); beacon.position.fromArray(where); tag(beacon, 'folding', `Where ${d.symbol} protein works`, [`${dst.label} (${dst.src}).`], '<p class="btnrow"><a href="#" data-goto="dest" class="ghost-btn">Watch it get there →</a></p>'); root.add(beacon);
    const bl = label(`${d.symbol} protein works here`, '#ffffff', 26); bl.position.fromArray(where).add(new THREE.Vector3(0, 7, 0)); root.add(bl);
    flyTo(new THREE.Vector3(0, 30, 150), new THREE.Vector3(0, 0, 0));
    G.tick = (dt, s, now) => { beacon.material.opacity = 0.35 + 0.3 * Math.sin(now / 300); beacon.scale.setScalar(1 + 0.2 * Math.sin(now / 300)); root.rotation.y += dt * 0.03 * G.speed; };
    narr(`<b>Level 1 · the cell.</b> Every cell carries the same genome; ${esc(d.symbol)} is used where it is needed. Its protein works: <b>${esc(dst.label)}</b>. Click the nucleus, ER, ribosomes, Golgi, mitochondria, vesicles or the white beacon.`);
    return { nuc, golgi };
  },
  nucleus(d) {
    root.add(tag(new THREE.Mesh(new THREE.SphereGeometry(40, 64, 40), glass('#b388ff', 0.15)), 'nucleus', 'Nuclear envelope', ['A double membrane with pores separating DNA from the cytoplasm.']));
    for (let i = 0; i < 80; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(40); const p = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.6, 8, 16), mat('#e0aaff')); p.position.copy(v); p.lookAt(0, 0, 0); tag(p, 'pore', 'Nuclear pore complex', ['mRNA is exported through these.']); root.add(p); }
    root.add(tag(sph(7, '#7b2cbf', { roughness: 0.7 }), 'nucleolus', 'Nucleolus', ['Ribosome factory inside the nucleus.']));
    const sizes = d.context?.chrom_sizes || {}, names = Object.keys(sizes), maxS = Math.max(...Object.values(sizes));
    names.forEach((c, i) => {
      const on = c === d.chrom, a = (i / names.length) * Math.PI * 2, ring = 18 + (i % 3) * 6;
      const centre = new THREE.Vector3(Math.cos(a) * ring, Math.sin(a * 1.7) * 14, Math.sin(a) * ring);
      const blob = new THREE.Group(); const n = 6 + Math.round((sizes[c] / maxS) * 14);
      for (let k = 0; k < n; k++) { const s = sph(2 + (sizes[c] / maxS) * 1.8, on ? '#ffd166' : `hsl(${(i * 37) % 360},55%,42%)`, { transparent: !on, opacity: on ? 1 : 0.55 }); s.position.copy(centre).add(new THREE.Vector3().randomDirection().multiplyScalar(Math.random() * 4.5)); blob.add(s); }
      tag(blob, 'chromosome', `Chromosome ${c.replace('chr', '')} territory`, [`${mb(sizes[c])} Mb of DNA${on ? `; ${d.symbol} sits at ${mb(d.start)} Mb` : ''}. Each chromosome occupies its own region (territory) of the nucleus (positions here schematic).`], on ? '<p class="btnrow"><a href="#" data-goto="chrom" class="ghost-btn">Zoom into this chromosome →</a></p>' : '');
      root.add(blob); if (on) { const l = label(`${c} · ${d.symbol}`, '#ffd166'); l.position.copy(centre).add(new THREE.Vector3(0, 8, 0)); root.add(l); }
    });
    flyTo(new THREE.Vector3(0, 20, 95), new THREE.Vector3(0, 0, 0));
    G.tick = (dt) => { root.rotation.y += dt * 0.05 * G.speed; };
    narr(`<b>Level 2 · the nucleus.</b> 24 chromosome territories (1-22, X, Y; sizes from hg38). ${esc(d.symbol)}'s chromosome ${esc(d.chrom.replace('chr', ''))} is gold. Territory positions are schematic.`);
  },
  chrom(d) {
    const sz = d.context?.chrom_sizes?.[d.chrom] || d.end * 1.2, L = 100, pos = (d.start / sz) * L - L / 2;
    for (const off of [-2.6, 2.6]) { const arm = new THREE.Mesh(new THREE.CapsuleGeometry(2.4, L, 12, 32), mat('#c9b6ff', { roughness: 0.6 })); arm.rotation.z = Math.PI / 2; arm.position.y = off; tag(arm, 'chromatin', `Chromosome ${d.chrom.replace('chr', '')} (${mb(sz)} Mb)`, ['Two identical sister chromatids (as before cell division); length drawn to the hg38 size. DNA is wound on histones as chromatin.']); root.add(arm); }
    for (let k = 0; k < 40; k++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(2.55, 2.55, 0.6, 24), mat(k % 2 ? '#8e7cc3' : '#d5c9ff')); b.rotation.z = Math.PI / 2; b.position.x = -L / 2 + (k + 0.5) * (L / 40); b.position.y = 2.6; root.add(b); const b2 = b.clone(); b2.position.y = -2.6; root.add(b2); }
    const mk = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.5, 10, 32), new THREE.MeshBasicMaterial({ color: '#ffd166' })); mk.position.set(pos, 0, 0); mk.rotation.y = Math.PI / 2; tag(mk, 'gene', `${d.symbol} locus`, geneFacts(d).slice(0, 3), '<p class="btnrow"><a href="#" data-goto="locus" class="ghost-btn">Open the gene neighbourhood →</a></p>'); root.add(mk);
    const l = label(`${d.symbol} · ${mb(d.start)} Mb (${((100 * d.start) / sz).toFixed(1)}%)`, '#ffd166'); l.position.set(pos, 8, 0); root.add(l);
    const l0 = label('position 0', '#9fb0c8', 22, 256); l0.position.set(-L / 2, -7, 0); root.add(l0); const l1 = label(`${mb(sz)} Mb`, '#9fb0c8', 22, 256); l1.position.set(L / 2, -7, 0); root.add(l1);
    flyTo(new THREE.Vector3(pos * 0.4, 10, 90), new THREE.Vector3(pos * 0.3, 0, 0));
    G.tick = (dt, s, now) => { mk.scale.setScalar(1 + 0.15 * Math.sin(now / 250)); };
    narr(`<b>Level 3 · chromosome ${esc(d.chrom.replace('chr', ''))}.</b> ${mb(sz)} Mb long; ${esc(d.symbol)} is the gold ring at ${mb(d.start)} Mb. (Band pattern decorative; size and position real.)`);
  },
  locus(d) {
    const c = d.context || {}, W = 160, span = 1_100_000, lo = d.start - 550_000, X = (p) => ((p - lo) / span) * W - W / 2;
    root.add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, W, 8), mat('#556')).rotateZ(Math.PI / 2));
    (c.neighbours || []).forEach((g, i) => {
      const me = g.symbol === d.symbol, x0 = X(g.start), x1 = X(g.end), w = Math.max(0.6, x1 - x0), y = me ? 0 : (i % 2 ? 3.2 : -3.2);
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, me ? 2.2 : 1.4, me ? 2.2 : 1.4), mat(me ? '#06d6a0' : '#4cc9f0', { emissive: me ? '#06d6a0' : '#000', emissiveIntensity: me ? 0.4 : 0 }));
      b.position.set(x0 + w / 2, y, 0); tag(b, 'gene', `${g.symbol}${me ? ' (this gene)' : ''}`, [`chr${d.chrom.replace('chr', '')}:${g.start.toLocaleString()}-${g.end.toLocaleString()} (${g.strand} strand), ${((g.end - g.start) / 1000).toFixed(1)} kb.`], me ? '' : `<p class="btnrow"><a href="#" data-gene="${esc(g.symbol)}" class="ghost-btn">Follow ${esc(g.symbol)} instead →</a></p>`); root.add(b);
      if (me || w > 3) { const l = label(g.symbol, me ? '#06d6a0' : '#90e0ef', 24, 256); l.position.set(x0 + w / 2, y + (me ? 3.5 : 2.4 * Math.sign(y || 1)), 0); root.add(l); }
    });
    (c.ccre || []).forEach((r) => { const x = X(d.start + r.start), w = Math.max(0.35, X(d.start + r.end) - x); const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, 0.9), mat(CCRE_COL[r.cls] || '#aaa', { emissive: CCRE_COL[r.cls] || '#000', emissiveIntensity: 0.35 })); m.position.set(x + w / 2, -6.5, 0); tag(m, /PLS/.test(r.cls) ? 'promoter' : 'enhancer', `ENCODE cCRE ${r.id}: ${r.label}`, [`${r.cls} element, ${r.start < 0 ? `${(-r.start / 1000).toFixed(1)} kb upstream of` : `${(r.start / 1000).toFixed(1)} kb downstream of`} the gene's lowest coordinate (ENCODE SCREEN V4, from biochemical signals: a candidate, not a proven function).`]); root.add(m); });
    const lc = label('ENCODE candidate regulatory elements (±50 kb): red promoter-like · orange/yellow enhancer-like · blue CTCF', '#c9dcf2', 20, 1400); lc.scale.set(90, 4, 1); lc.position.set(0, -10, 0); root.add(lc);
    flyTo(new THREE.Vector3(0, 6, 70), new THREE.Vector3(0, -2, 0));
    narr(`<b>Level 4 · the gene neighbourhood</b> (1.1 Mb around ${esc(d.symbol)}). Real neighbouring genes (click to follow one) and ${(c.ccre || []).length} ENCODE regulatory elements: switches that help decide when and where the gene is read.`);
  },
  helix(d) {
    const cdsStart = d.dna_cds ?? d.cds[0][0], seq = d.dna.slice(cdsStart, cdsStart + 36), comp = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };
    const g = new THREE.Group(); root.add(g); const rise = 3.4, R0 = 10, n = seq.length, P1 = [], P2 = [];
    for (let i = 0; i < n; i++) {
      const a = (i / 10.5) * Math.PI * 2, y = (i - n / 2) * rise;
      const p1 = new THREE.Vector3(Math.cos(a) * R0, y, Math.sin(a) * R0), p2 = new THREE.Vector3(Math.cos(a + 2.4) * R0, y, Math.sin(a + 2.4) * R0); P1.push(p1); P2.push(p2);
      for (const p of [p1, p2]) { const ph = sph(1.1, '#ff9e00'); ph.position.copy(p); tag(ph, 'backbone', 'Phosphate (backbone)', ['Phosphates link sugars 3′→5′ into each strand\'s backbone.']); g.add(ph); const su = sph(0.8, '#e9e2cf'); su.position.copy(p.clone().multiplyScalar(0.82)); tag(su, 'backbone', 'Deoxyribose sugar', ['The five-carbon sugar of DNA.']); g.add(su); }
      const s1 = p1.clone().multiplyScalar(0.82), s2 = p2.clone().multiplyScalar(0.82), mid = s1.clone().lerp(s2, 0.5), cod = Math.floor(i / 3), aa = d.protein[cod], codon = d.cds_seq.slice(cod * 3, cod * 3 + 3);
      const cv = d.variants.filter((v) => v.pos === cod + 1);
      for (const [pa, b] of [[s1, seq[i]], [s2, comp[seq[i]]]]) {
        const L = pa.distanceTo(mid), slab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, L), mat(BASE_COL[b], { emissive: BASE_COL[b], emissiveIntensity: 0.15 }));
        slab.position.copy(pa.clone().lerp(mid, 0.5)); slab.lookAt(mid);
        tag(slab, 'basepair', `${b === seq[i] ? 'Coding' : 'Template'} strand base ${b} (position ${i + 1} from the start codon)`,
          [`Base pair ${seq[i]}-${comp[seq[i]]}: ${'GC'.includes(seq[i]) ? '3' : '2'} hydrogen bonds.`, `Codon ${cod + 1} = ${codon} → ${d.aa_names[aa]} (${aa}); this is base ${(i % 3) + 1} of the codon.`, cv.length ? `ClinVar at amino acid ${cod + 1}: ${cv.slice(0, 4).map((v) => `${v.name.split(' ').pop()} ${v.sig}`).join('; ')}.` : 'No ClinVar protein record at this codon.'],
          codonBtn(cod + 1, `Try changing codon ${cod + 1} →`));
        g.add(slab);
      }
    }
    for (const pts of [P1, P2]) g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 6, 0.35, 8, false), mat('#ffb703', { transparent: true, opacity: 0.6 })));
    const l = label(`${d.symbol}: first ${n} bp from the start codon (ATG), real sequence`, '#ffd166', 24, 900); l.position.set(0, 18, 0); root.add(l);
    g.rotation.z = Math.PI / 2; flyTo(new THREE.Vector3(0, 10, 75), new THREE.Vector3(0, 0, 0));
    G.tick = (dt) => { g.rotation.x += dt * 0.25 * G.speed; };
    narr(`<b>Level 5 · the double helix.</b> Orange = phosphates, ivory = sugars, coloured slabs = bases (<span style="color:${BASE_COL.A}">A</span> <span style="color:${BASE_COL.T}">T</span> <span style="color:${BASE_COL.G}">G</span> <span style="color:${BASE_COL.C}">C</span>). Click any base for its codon, amino acid and ClinVar records. 10.5 bp per turn, 3.4 Å per step.`);
  },
  tx(d) {
    const seq = d.dna.slice(0, 220), pol = tag(sph(5, '#b388ff', { transparent: true, opacity: 0.55 }), 'polymerase', 'RNA polymerase II', ['Reads the template strand 3′→5′ and builds mRNA 5′→3′.']); root.add(pol);
    const grp = new THREE.Group(); root.add(grp); let lastAt = -1;
    flyTo(new THREE.Vector3(0, 8, 60), new THREE.Vector3(0, 0, 0));
    G.tick = (dt, scrub) => {
      const u = scrub ?? ((G.t * 0.04) % 1), at = Math.floor(u * (seq.length - 1)); if (at === lastAt) return; lastAt = at;
      while (grp.children.length) { const o = grp.children.pop(); o.geometry?.dispose(); o.material?.dispose(); }
      for (let i = -30; i < 30; i++) { const k = at + i; if (k < 0 || k >= seq.length) continue; const open = Math.max(0, 1 - Math.abs(i) / 6), x = i * 1.1, a = (k / 10.5) * Math.PI * 2;
        for (const [sgn, b] of [[1, seq[k]], [-1, { A: 'T', T: 'A', G: 'C', C: 'G' }[seq[k]] || 'N']]) { const m = sph(0.5, BASE_COL[b]); m.position.set(x, Math.cos(a) * 2.5 * sgn + sgn * open * 4, Math.sin(a) * 2.5 * sgn); tag(m, 'basepair', `DNA base ${b}`, [`Gene position ${k + 1}.`]); grp.add(m); } }
      const tail = seq.slice(0, at).replace(/T/g, 'U').slice(-40);
      [...tail].forEach((b, i) => { const m = sph(0.5, BASE_COL[b]); const t = tail.length - i; m.position.set(-t * 0.5, 6 + t * 0.35, Math.sin(t * 0.3) * 2); tag(m, 'mrna', `RNA base ${b}`, ['Part of the growing pre-mRNA (U replaces T).']); grp.add(m); });
      $('#gn-readout').textContent = `RNA polymerase at nt ${at + 1} of ${d.gene_len.toLocaleString()} · new mRNA (5′→3′): …${tail}`; $('#gn-pos').value = Math.round(u * 1000);
    };
    narr(`<b>Level 6 · transcription.</b> RNA polymerase opens the helix and copies the template strand into pre-mRNA (U replaces T). Real first bases of ${esc(d.symbol)}, including the 5′ untranslated region. Click the polymerase or any base.`);
  },
  splice(d) {
    const L = d.gene_len, sc = 120 / L, ex = d.exons, y = 8;
    const bars = ex.map(([a, b], i) => { const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.5, (b - a) * sc), 3.4, 3.4), mat('#4cc9f0', { emissive: '#4cc9f0', emissiveIntensity: 0.2 })); m.userData.x0 = -60 + ((a + b) / 2) * sc; m.position.set(m.userData.x0, y, 0); tag(m, 'exon', `Exon ${i + 1} (${(b - a).toLocaleString()} nt)`, [`Kept in the mature mRNA.${d.cds.some(([c0, c1]) => c0 < b && c1 > a) ? ' Contains coding sequence.' : ' Untranslated (UTR) only.'}`]); root.add(m); return m; });
    const intr = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 120, 8), mat('#777', { transparent: true, opacity: 1 })), 'exon', 'Introns', [`${(d.gene_len - d.mrna_len).toLocaleString()} nt removed by the spliceosome.`]); intr.rotation.z = Math.PI / 2; intr.position.y = y; root.add(intr);
    const sp = tag(sph(3, '#ff70a6', { transparent: true, opacity: 0.7 }), 'splicing', 'Spliceosome', ['A large RNA-protein machine that cuts introns out and joins exons.']); root.add(sp);
    const tot = ex.reduce((s, [a, b]) => s + Math.max(0.5, (b - a) * sc), 0); let acc = -tot / 2; const target = ex.map(([a, b]) => { const w = Math.max(0.5, (b - a) * sc), c = acc + w / 2; acc += w; return c; });
    const cap = tag(sph(1.6, '#e9ff70'), 'cap', '5′ cap', ['Added to the start of the mRNA: protects it and helps ribosomes bind.']), tail = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 6, 8), mat('#e9ff70')), 'cap', 'Poly(A) tail', ['A run of adenines added to the end: stability and export.']); tail.rotation.z = Math.PI / 2; root.add(cap, tail);
    flyTo(new THREE.Vector3(0, 0, 95), new THREE.Vector3(0, 0, 0));
    G.tick = (dt, scrub) => { const u = scrub ?? ((G.t * 0.05) % 1), k = Math.min(1, Math.max(0, (u - 0.15) / 0.6)); bars.forEach((m, i) => { m.position.x = m.userData.x0 + (target[i] - m.userData.x0) * k; m.position.y = y - 16 * k; }); intr.material.opacity = 1 - k; sp.position.set(-60 + 120 * ((u * 3) % 1), y + 4, 0); sp.visible = k < 1; cap.position.set(target[0] - 3, y - 16 * k, 0); cap.visible = k > 0.9; tail.position.set(target[target.length - 1] + 5, y - 16 * k, 0); tail.visible = k > 0.9; $('#gn-pos').value = Math.round(u * 1000); $('#gn-readout').textContent = `${ex.length} exons joined; ${(d.gene_len - d.mrna_len).toLocaleString()} nt of introns removed → mRNA ${d.mrna_len.toLocaleString()} nt`; };
    narr(`<b>Level 7 · splicing.</b> The spliceosome removes ${esc(d.symbol)}'s introns and joins its ${ex.length} exons (lengths to scale); a 5′ cap and a poly(A) tail finish the mRNA.`);
  },
  export(d) {
    const env = tag(new THREE.Mesh(new THREE.SphereGeometry(60, 64, 40, 0, Math.PI * 2, 0, Math.PI / 2.2), glass('#b388ff', 0.22)), 'nucleus', 'Nuclear envelope', ['Inside: nucleus. Outside: cytoplasm.']); env.position.y = -60; root.add(env);
    const pore = tag(new THREE.Mesh(new THREE.TorusGeometry(3.4, 1.4, 16, 40), mat('#e0aaff')), 'pore', 'Nuclear pore complex', ['A gated channel in the nuclear envelope; mRNA passes through bound to export factors.']); pore.rotation.x = Math.PI / 2; root.add(pore);
    const mr = d.mrna.replace(/T/g, 'U').slice(0, 90), beads = [...mr].map((b) => { const m = sph(0.7, BASE_COL[b]); tag(m, 'mrna', `mRNA base ${b}`, ['The mature messenger RNA on its way to the ribosomes.']); root.add(m); return m; });
    const rib = tag(sph(4, '#90e0ef', { transparent: true, opacity: 0.6 }), 'ribosome', 'Ribosome (cytoplasm)', ['The small subunit binds the cap and scans to the start codon AUG.']); rib.position.set(18, 22, 0); root.add(rib);
    flyTo(new THREE.Vector3(0, 10, 80), new THREE.Vector3(0, 5, 0));
    G.tick = (dt, scrub) => { const u = scrub ?? ((G.t * 0.05) % 1); beads.forEach((m, i) => { const s = u * 1.6 - i / beads.length; const y = -25 + s * 60; m.position.set(y > 0 ? Math.sin(y * 0.15) * 8 + y * 0.25 : Math.sin(i * 0.4) * 2, y, Math.cos(i * 0.4) * 2); m.visible = s > -0.3; }); $('#gn-pos').value = Math.round(u * 1000); };
    narr(`<b>Level 8 · export.</b> The finished ${d.mrna_len.toLocaleString()}-nt mRNA leaves the nucleus through a nuclear pore and meets ribosomes in the cytoplasm.`);
  },
  tl(d) {
    const dst = destination(d), onER = ['out', 'membrane', 'golgi'].includes(dst.key);
    const cds = d.cds_seq.replace(/T/g, 'U'), prot = d.protein, N = Math.min(prot.length, 90);
    const mr = new THREE.Group(); root.add(mr);
    for (let i = 0; i < N * 3; i++) { const m = sph(0.45, BASE_COL[cds[i]]); m.position.set(i * 0.9, -6, 0); tag(m, 'codon', `mRNA base ${cds[i]} (codon ${Math.floor(i / 3) + 1})`, [`Codon ${Math.floor(i / 3) + 1} = ${cds.slice(Math.floor(i / 3) * 3, Math.floor(i / 3) * 3 + 3)} → ${d.aa_names[prot[Math.floor(i / 3)]]}.`], codonBtn(Math.floor(i / 3) + 1, 'Change this codon →')); mr.add(m); }
    if (onER) { const er = tag(new THREE.Mesh(new THREE.BoxGeometry(N * 3, 0.8, 30), mat('#4cc9f0', { transparent: true, opacity: 0.35 })), 'er', 'ER membrane', [`${d.symbol} protein is ${dst.label}: such proteins are made on ribosomes bound to the ER and threaded into it.`]); er.position.set(N * 1.35, 9, 0); root.add(er); }
    const ribo = new THREE.Group(); const big = sph(4.2, '#90e0ef', { transparent: true, opacity: 0.45 }), small = sph(2.8, '#4cc9f0', { transparent: true, opacity: 0.5 }); big.position.y = -1.6; small.position.y = -8.5; ribo.add(big, small); tag(ribo, 'ribosome', 'Ribosome', ['Large + small subunits; reads one codon at a time; tRNAs bring the matching amino acid.']); root.add(ribo);
    const trna = tag(new THREE.Mesh(new THREE.ConeGeometry(1.2, 4, 3), mat('#e9ff70')), 'trna', 'Transfer RNA (tRNA)', ['Its anticodon pairs with the mRNA codon; it carries the amino acid.']); root.add(trna);
    const chain = new THREE.Group(); root.add(chain); let lastK = -1, aaLab = null;
    G.fly = null; C.position.set(0, 6, 45); OC.target.set(0, 2, 0);
    G.tick = (dt, scrub) => {
      const u = scrub ?? ((G.t * 0.025) % 1), k = Math.floor(u * N), x = (k * 3 + 1) * 0.9;
      ribo.position.x = x; trna.position.set(x + 1, 4 + Math.sin(G.t * 6) * 0.5, 2); const dx = x - OC.target.x; OC.target.x += dx * 0.12; C.position.x += dx * 0.12;
      if (k === lastK) return; lastK = k;
      while (chain.children.length) { const o = chain.children.pop(); o.geometry?.dispose(); o.material?.dispose(); }
      for (let j = 0; j <= k; j++) { const t = k - j, m = sph(0.9, AA_COL(prot[j])); m.position.set(x + Math.sin(t * 0.7) * 2.2, 2 + t * 0.85, Math.cos(t * 0.7) * 2.2); tag(m, 'aminoacid', `Amino acid ${j + 1}: ${d.aa_names[prot[j]]} (${prot[j]})`, [`Added by codon ${cds.slice(j * 3, j * 3 + 3)}.`]); chain.add(m); }
      const cod = cds.slice(3 * k, 3 * k + 3), aa = prot[k] || '*';
      if (aaLab) { root.remove(aaLab); aaLab.material.map.dispose(); aaLab.material.dispose(); } aaLab = label(`${cod} → ${d.aa_names[aa]}`, AA_COL(aa), 28); aaLab.position.set(x, 13, 0); root.add(aaLab);
      $('#gn-readout').textContent = `Codon ${k + 1}/${prot.length}: ${cod} → ${aa} (${d.aa_names[aa]}) · chain …${prot.slice(Math.max(0, k - 20), k + 1)}`; $('#gn-pos').value = Math.round(u * 1000);
    };
    narr(`<b>Level 9 · translation${onER ? ' on the ER' : ' in the cytosol'}.</b> The ribosome reads ${esc(d.symbol)}'s real codons; each tRNA adds one amino acid (colour = chemistry). ${onER ? `Because this protein is ${esc(dst.label)}, it is made into the ER.` : ''} Click any codon or amino acid.`);
  },
  prot(d) {
    const af = d.alphafold;
    if (!af) { narr('No AlphaFold model for this protein in the local set.'); return; }
    const pts = af.ca.map((a) => new THREE.Vector3(a[0], a[1], a[2])), c = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3()); pts.forEach((p) => p.sub(c));
    const col = (pl) => (pl > 90 ? '#0053d6' : pl > 70 ? '#65cbf3' : pl > 50 ? '#ffdb13' : '#ff7d45');
    let s0 = 0; for (let i = 1; i <= pts.length; i++) { if (i === pts.length || col(af.ca[i][3]) !== col(af.ca[s0][3])) { const seg = pts.slice(Math.max(0, s0 - 1), i + 1); if (seg.length >= 2) root.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(seg), seg.length * 4, 0.7, 8, false), mat(col(af.ca[s0][3])))); s0 = i; } }
    const pv = new Map(); d.variants.forEach((v) => { if (v.pos <= pts.length) { if (!pv.has(v.pos)) pv.set(v.pos, []); pv.get(v.pos).push(v); } });
    pts.forEach((p, i) => { const vs = pv.get(i + 1) || [], path = vs.some((v) => SIG_COL(v.sig) === '#ff4d6d'); const s = new THREE.Mesh(new THREE.SphereGeometry(path ? 0.95 : 0.75, 10, 8), mat(path ? '#ff4d6d' : col(af.ca[i][3]), path ? {} : { transparent: true, opacity: 0.02, depthWrite: false })); s.position.copy(p);
      tag(s, 'aminoacid', `Residue ${i + 1}: ${d.aa_names[d.protein[i]] || af.ca[i][4]} (${d.protein[i]})`, [`AlphaFold confidence (pLDDT) ${af.ca[i][3]}.`, vs.length ? `ClinVar at this residue: ${vs.slice(0, 5).map((v) => `${v.name.split(' ').pop()} ${v.sig}`).join('; ')}.` : 'No ClinVar protein record here.'], codonBtn(i + 1, `What if residue ${i + 1} changes? →`));
      root.add(s); });
    if (G.mutPos != null && pts[G.mutPos]) { const m = sph(1.8, '#ffffff'); m.position.copy(pts[G.mutPos]); root.add(m); }
    const r = new THREE.Box3().setFromPoints(pts).getSize(new THREE.Vector3()).length(); flyTo(new THREE.Vector3(0, 0, r * 1.05), new THREE.Vector3(0, 0, 0));
    G.tick = (dt) => { root.rotation.y += dt * 0.12 * G.speed; };
    narr(`<b>Level 10 · the folded protein</b> (AlphaFold v6, ${af.ca.length} residues). Colour = model confidence (dark blue >90, light blue 70-90, yellow 50-70, orange <50). Red balls = ClinVar pathogenic positions. Click any residue.`);
  },
  dest(d) {
    const dst = destination(d);
    SCENES.cell(d); root.rotation.set(0, 0, 0); G.tick = null;
    const p = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2, 1), mat('#ffffff', { emissive: '#ffd166', emissiveIntensity: 0.8 })); tag(p, 'folding', `${d.symbol} protein`, [`Destination: ${dst.label} (${dst.src}).`]); root.add(p);
    const path = { out: [[-8, 2, 26], [10, 10, 20], [32, 4, 8], [44, 6, 10], [62, 0, 0], [80, 0, 0]], membrane: [[-8, 2, 26], [10, 10, 20], [32, 4, 8], [30, 30, 10], [0, 59, 0]], golgi: [[-8, 2, 26], [10, 10, 20], [32, 4, 8]], mito: [[-8, 2, 26], [10, 15, 15], [30, 30, 0]], nucleus: [[20, 20, 20], [5, 10, 15], [-8, 2, 0]], cytosol: [[-8, 2, 26], [5, 20, 15], [20, 25, 10]] }[dst.key].map((a) => new THREE.Vector3(...a));
    const curve = new THREE.CatmullRomCurve3(path); root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.3, 6, false), new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.5 })));
    G.tick = (dt, scrub) => { const u = scrub ?? ((G.t * 0.06) % 1); p.position.copy(curve.getPointAt(u)); p.rotation.y += dt * 2; $('#gn-pos').value = Math.round(u * 1000); };
    narr(`<b>Level 11 · destination.</b> ${esc(d.symbol)} protein → <b>${esc(dst.label)}</b> (${esc(dst.src)}). ${dst.key === 'out' ? 'Route: ribosome on ER → ER → Golgi → secretory vesicle → out of the cell.' : dst.key === 'membrane' ? 'Route: ER → Golgi → vesicle → plasma membrane.' : dst.key === 'nucleus' ? 'Imported back into the nucleus through a pore.' : dst.key === 'mito' ? 'Imported into a mitochondrion.' : 'Stays in the cytosol after it is made.'} Route drawn schematically.`);
  },
  net(d) {
    const c = d.context || {}, items = [...(c.string || []).map((x) => ({ s: x.symbol, w: x.score / 1000, src: `STRING combined score ${x.score}` })), ...(c.biogrid || []).filter(([s]) => !(c.string || []).some((x) => x.symbol === s)).slice(0, 15).map(([s, n]) => ({ s, w: Math.min(1, n / 10), src: `BioGRID: ${n} experimental records` }))];
    root.add(tag(sph(4, '#06d6a0', { emissive: '#06d6a0', emissiveIntensity: 0.4 }), 'gene', d.symbol, geneFacts(d))); const cl = label(d.symbol, '#06d6a0'); cl.position.y = 6; root.add(cl);
    items.forEach((it, i) => { const a = (i / items.length) * Math.PI * 2, r = 22 + (1 - it.w) * 18, p = new THREE.Vector3(Math.cos(a) * r, Math.sin(a * 2) * 8, Math.sin(a) * r);
      const n = sph(1.6 + it.w * 1.4, it.src.startsWith('STRING') ? '#4cc9f0' : '#ff9e00'); n.position.copy(p); tag(n, 'gene', it.s, [it.src, 'Interaction partners work with the protein in complexes, pathways or signalling.'], `<p class="btnrow"><a href="#" data-gene="${esc(it.s)}" class="ghost-btn">Follow ${esc(it.s)} →</a></p>`); root.add(n);
      root.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(), p), 2, 0.12 + it.w * 0.25, 6), new THREE.MeshBasicMaterial({ color: it.src.startsWith('STRING') ? '#4cc9f0' : '#ff9e00', transparent: true, opacity: 0.45 })));
      const l = label(it.s, '#dfe7f5', 24, 256); l.position.copy(p).add(new THREE.Vector3(0, 3.2, 0)); root.add(l); });
    flyTo(new THREE.Vector3(0, 30, 80), new THREE.Vector3(0, 0, 0));
    G.tick = (dt) => { root.rotation.y += dt * 0.06 * G.speed; };
    narr(`<b>Level 12 · interaction network.</b> ${items.length} partners: blue = STRING (closer = higher score), orange = BioGRID experimental records. Click a partner to follow its gene.${c.pathways?.length ? ` Pathways: ${c.pathways.slice(0, 5).map((p) => esc(p.name)).join(' · ')}…` : ''}`);
  },
};

// ---------------------------------------------------------------- journey: guided tour through all levels with this gene's facts
const JNOTE = { cell: 'membrane', nucleus: 'nucleus', chrom: 'chromosome', locus: 'enhancer', helix: 'dna', tx: 'transcription', splice: 'splicing', export: 'export', tl: 'translation', prot: 'folding', dest: 'vesicle', net: 'expression' };
function journey() {
  let i = 0; $('#gn-journey').textContent = '■ Stop journey'; G.playing = true;
  const step = () => { if (!G.journey) return; const [k, v] = STAGES[i]; go(k); explain({ concept: JNOTE[k], title: `${i + 1}. ${v}: ${G.d.symbol}`, facts: i === 0 ? geneFacts(G.d) : [] }); i += 1; G.journey = i < STAGES.length ? setTimeout(step, 9000) : (stopJourney(), null); };
  G.journey = 1; step();
}
function stopJourney() { if (G.journey && G.journey !== 1) clearTimeout(G.journey); G.journey = null; const b = $('#gn-journey'); if (b) b.textContent = '▶ Journey: follow this gene'; }
