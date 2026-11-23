// Learning layer for Body systems: guided tours and self-tests.
//   Tours: an ordered list of real items (genes, pathways, reaction chains). Only the
//   tour titles and the order are written here; every fact shown is the item's own
//   sourced data or quoted text (HPA, NCBI, UniProt, Reactome).
//   Self-test: questions generated mechanically from the data (tissue enrichment,
//   Reactome reaction order, reaction participants); the correct answer is the
//   data's own value, and each answer links back to the item.
// Score is kept in this browser only (localStorage), as a per-viewer convenience.

import { openGene, openPathway } from './molecular.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const api = (u) => fetch(u).then((r) => r.json());
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((x) => x[1]);

const TOURS = [
  { title: 'From glucose to ATP', steps: [['pathway', 'R-HSA-70171', 'Glycolysis'], ['pathway', 'R-HSA-70268', 'Pyruvate metabolism'], ['pathway', 'R-HSA-71403', 'Citric acid cycle'], ['pathway', 'R-HSA-611105', 'Respiratory electron transport'], ['pathway', 'R-HSA-163210', 'ATP synthesis by chemiosmotic coupling']] },
  { title: 'Insulin: from pancreas to muscle and liver', steps: [['gene', 'INS', 'The insulin gene and where it is made'], ['pathway', 'R-HSA-422356', 'Regulation of insulin secretion'], ['pathway', 'R-HSA-74751', 'Insulin receptor signalling cascade'], ['gene', 'SLC2A4', 'GLUT4, the insulin-regulated glucose transporter'], ['pathway', 'R-HSA-3322077', 'Glycogen synthesis']] },
  { title: 'Muscle contraction and its fuel', steps: [['gene', 'MYH7', 'Slow (beta) myosin heavy chain'], ['pathway', 'R-HSA-390522', 'Striated muscle contraction'], ['gene', 'CKM', 'Muscle creatine kinase'], ['pathway', 'R-HSA-71288', 'Creatine metabolism'], ['pathway', 'R-HSA-70221', 'Glycogen breakdown']] },
  { title: 'Oxygen transport', steps: [['gene', 'HBB', 'Haemoglobin beta chain'], ['pathway', 'R-HSA-1480926', 'O2/CO2 exchange in red blood cells'], ['pathway', 'R-HSA-189451', 'Heme biosynthesis'], ['pathway', 'R-HSA-917937', 'Iron uptake and transport']] },
  { title: 'Fat as fuel', steps: [['pathway', 'R-HSA-163560', 'Triglyceride catabolism'], ['pathway', 'R-HSA-77289', 'Mitochondrial fatty acid beta-oxidation'], ['pathway', 'R-HSA-74182', 'Ketone body metabolism']] },
];
let T = null;
const score = (() => { try { return JSON.parse(localStorage.getItem('learnScore') || '{"right":0,"asked":0}'); } catch { return { right: 0, asked: 0 }; } })();
const saveScore = () => { try { localStorage.setItem('learnScore', JSON.stringify(score)); } catch { /* storage blocked */ } };

export function setupLearn() {
  const host = $('#mol-learn'); if (!host) return;
  host.innerHTML = `<div class="card-h"><h2>Learn</h2></div>
    <p class="fine"><b>Guided tours</b> (the order is a teaching choice; every fact shown comes from the item's own sources)</p>
    <div class="mol-chips">${TOURS.map((t, i) => `<button class="ghost-btn" data-tour="${i}">${esc(t.title)} <small>${t.steps.length}</small></button>`).join('')}</div>
    <div id="tour-bar" class="tour-bar" hidden></div>
    <p class="fine" style="margin-top:10px"><b>Self-test</b> <span id="q-score" class="mono"></span> <button class="primary small" id="q-new">New question</button></p>
    <div id="q-box" class="fine"></div>`;
  host.querySelectorAll('[data-tour]').forEach((b) => (b.onclick = () => startTour(+b.dataset.tour)));
  $('#q-new').onclick = newQuestion; showScore();
}
function startTour(i) { T = { tour: TOURS[i], k: 0 }; tourStep(); }
async function tourStep() {
  const { tour, k } = T, [kind, id, title] = tour.steps[k], bar = $('#tour-bar'); bar.hidden = false;
  bar.innerHTML = `<b>${esc(tour.title)}</b> · step ${k + 1}/${tour.steps.length}: ${esc(title)}
    <span class="btnrow"><button class="ghost-btn tiny" id="t-prev" ${k ? '' : 'disabled'}>‹</button><button class="ghost-btn tiny" id="t-next">${k < tour.steps.length - 1 ? 'Next ›' : 'Finish'}</button><button class="ghost-btn tiny" id="t-end">End</button></span>`;
  $('#t-prev').onclick = () => { T.k--; tourStep(); };
  $('#t-next').onclick = () => { if (T.k < tour.steps.length - 1) { T.k++; tourStep(); } else { bar.innerHTML = `<b>${esc(tour.title)}</b> finished. Try a self-test question.`; } };
  $('#t-end').onclick = () => { bar.hidden = true; T = null; };
  if (kind === 'gene') await openGene(id); else await openPathway(id);
  $('#mol-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ------------------------------------------------------------------ self-test
const TISSUES = ['liver', 'skeletal muscle', 'heart muscle', 'brain', 'pancreas', 'kidney', 'stomach 1', 'intestine', 'lung', 'testis', 'adrenal gland', 'skin 1', 'tongue', 'retina'];
async function qTissue() {
  const t = pick(TISSUES); const r = await api(`/api/mol/tissue?t=${encodeURIComponent(t)}`);
  const g = pick(r.genes.slice(0, 15)); const gene = await api(`/api/mol/gene?s=${encodeURIComponent(g.symbol)}`);
  const top = gene.tissues[0]?.tissue; if (!top) return null;
  const opts = shuffle([top, ...shuffle(TISSUES.filter((x) => !gene.tissues.some((y) => y.tissue === x))).slice(0, 3)]);
  return { q: `In which tissue does the Human Protein Atlas find <b>${esc(gene.symbol)}</b> (${esc(gene.description)}) most enriched?`, opts, ok: top,
    why: `HPA tissue-enriched expression: ${gene.tissues.map((x) => `${esc(x.tissue)} ${x.ntpm.toLocaleString()} nTPM`).join(', ')}.`, open: () => openGene(gene.symbol) };
}
let RX = null;
async function qOrder(kind) {
  RX = RX || (await api('/training-4D/rt/molecular/reactions/index.json'));
  const ids = Object.entries(RX.pathways).filter(([, v]) => v.n_reactions >= 5).map(([id]) => id); if (!ids.length) return null;
  const pid = pick(ids), P = await api(`/training-4D/rt/molecular/reactions/${pid}.json`), rs = P.reactions;
  if (kind === 'order') {
    const i = Math.floor(Math.random() * (rs.length - 1)), a = rs[i], b = rs[i + 1];
    if (!b.preceding.includes(a.id)) return null; // only ask when Reactome itself links the two steps
    const opts = shuffle([b.name, ...shuffle(rs.filter((r) => r !== a && r !== b)).slice(0, 3).map((r) => r.name)]);
    return { q: `In <b>${esc(P.name)}</b>, which reaction directly follows “${esc(a.name)}” (Reactome's preceding-event link)?`, opts, ok: b.name, why: `Reactome lists “${esc(a.name)}” as the preceding event of “${esc(b.name)}”.`, open: () => openPathway(pid) };
  }
  const withGenes = rs.filter((r) => r.genes.length); if (withGenes.length < 4) return null;
  const r = pick(withGenes), others = [...new Set(withGenes.filter((x) => x !== r).flatMap((x) => x.genes))].filter((g) => !r.genes.includes(g));
  if (others.length < 3) return null;
  const ok = pick(r.genes), opts = shuffle([ok, ...shuffle(others).slice(0, 3)]);
  return { q: `Which gene's protein takes part in the reaction “${esc(r.name)}” (${esc(P.name)})?`, opts, ok, why: `Reactome participants of this reaction: ${r.genes.map(esc).join(', ')}.`, open: () => openPathway(pid) };
}
async function newQuestion() {
  const box = $('#q-box'); box.innerHTML = '<span class="muted">Building a question from the data…</span>';
  let q = null;
  for (let tries = 0; tries < 6 && !q; tries++) { const k = pick(['tissue', 'order', 'enzyme']); q = k === 'tissue' ? await qTissue() : await qOrder(k === 'order' ? 'order' : 'enzyme'); }
  if (!q) { box.innerHTML = '<span class="muted">Could not build a question; try again.</span>'; return; }
  box.innerHTML = `<p>${q.q}</p><div class="q-opts">${q.opts.map((o, i) => `<button class="ghost-btn q-opt" data-i="${i}">${esc(o)}</button>`).join('')}</div><p id="q-res"></p>`;
  box.querySelectorAll('.q-opt').forEach((b) => (b.onclick = () => {
    const right = q.opts[+b.dataset.i] === q.ok; score.asked++; if (right) score.right++; saveScore(); showScore();
    box.querySelectorAll('.q-opt').forEach((x) => { x.disabled = true; if (q.opts[+x.dataset.i] === q.ok) x.classList.add('q-right'); else if (x === b) x.classList.add('q-wrong'); });
    $('#q-res').innerHTML = `${right ? '<b class="good">Correct.</b>' : '<b class="poor">Not quite.</b>'} ${q.why} <a href="#" id="q-open">Show it on the body</a>`;
    $('#q-open').onclick = (e) => { e.preventDefault(); q.open(); };
  }));
}
function showScore() { $('#q-score').textContent = score.asked ? `${score.right}/${score.asked}` : ''; }
