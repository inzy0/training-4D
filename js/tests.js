// Tests & labs: sports science, sports physiotherapy, performance, return to play / performance,
// questionnaires, concussion, cardiac screening, load / recovery, and laboratory tests (blood, iron,
// muscle, organ, hormones, immune, gut, nutrition), cross-linked to each other, to the 3D body,
// to the Body systems tab (genes) and to the clinical chapters.
// Built by tools/clinical_tests_build.py. Every explanation, interpretation and benchmark is a
// verbatim sentence from a licensed open source, shown with its source and licence. Numbers are
// as printed in the source: not reference ranges for any person, not validated here.

import { extLinksFor } from './extensions.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SYS_COL = { musculoskeletal: '#ffd166', nervous: '#b388ff', cardiovascular: '#ff6b6b', respiratory: '#90e0ef', blood: '#ef476f', immune: '#06d6a0', digestive: '#f78c6b', endocrine: '#ffb703', renal: '#4cc9f0', metabolic: '#e9ff70', skin: '#ffafcc', general: '#adb5bd' };
let D = null, byId = {}, cat = 'all', sys = null, cur = null;

export async function startTests(openId) {
  if (!D) {
    D = await (await fetch('/training-4D/rt/clinical/tests.json')).json();
    D.tests.forEach((t) => { byId[t.id] = t; });
    buildUI();
  }
  if (openId) openTest(openId);
  else if (!cur) overview();
}

function buildUI() {
  const counts = {}; D.tests.forEach((t) => { counts[t.cat] = (counts[t.cat] || 0) + 1; });
  $('#ts-cats').innerHTML = `<button class="ghost-btn on" data-c="all">All <small>${D.tests.length}</small></button>` +
    Object.entries(D.categories).map(([k, v]) => `<button class="ghost-btn" data-c="${k}">${esc(v)} <small>${counts[k] || 0}</small></button>`).join('');
  $('#ts-cats').querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { cat = b.dataset.c; $('#ts-cats').querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('on', x === b)); list(); }));
  const syss = [...new Set(D.tests.flatMap((t) => t.systems))].sort();
  $('#ts-sys').innerHTML = `<span class="fine">Body system:</span> ` + syss.map((s) => `<button class="ts-sys" data-s="${s}" style="--c:${SYS_COL[s] || '#ccc'}">${s}</button>`).join('');
  $('#ts-sys').querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { sys = sys === b.dataset.s ? null : b.dataset.s; $('#ts-sys').querySelectorAll('[data-s]').forEach((x) => x.classList.toggle('on', x.dataset.s === sys)); list(); }));
  let tm = null; $('#ts-q').oninput = () => { clearTimeout(tm); tm = setTimeout(list, 150); };
  $('#ts-map').onclick = overview;
  list();
}

function list() {
  const q = $('#ts-q').value.trim().toLowerCase();
  const xs = D.tests.filter((t) => (cat === 'all' || t.cat === cat) && (!sys || t.systems.includes(sys)) && (!q || t.name.toLowerCase().includes(q) || t.genes.some((g) => g.toLowerCase() === q)));
  $('#ts-list').innerHTML = xs.map((t) => {
    const n = Object.values(t.quotes).reduce((s, v) => s + v.length, 0);
    return `<li data-id="${t.id}" class="${cur?.id === t.id ? 'on' : ''}"><span>${esc(t.name)}${t.emerging ? ' <span class="ts-em">emerging</span>' : ''}</span><small>${n ? `${n} quotes` : 'no quote found'}${t.research ? ` · ${t.research.n_articles} studies` : ''}</small></li>`;
  }).join('') || '<li class="muted">No test matches.</li>';
  $('#ts-list').querySelectorAll('[data-id]').forEach((li) => (li.onclick = () => openTest(li.dataset.id)));
  $('#ts-count').textContent = `${xs.length} of ${D.tests.length}`;
}

const art = (r) => `<li><a href="https://pmc.ncbi.nlm.nih.gov/articles/${esc(r.pmcid)}/" target="_blank" rel="noopener">${esc(r.title)}</a> <small>${esc(r.journal || '')} ${esc(r.year || '')} · ${esc(String(r.design || '').replace(/_/g, ' '))}</small></li>`;
const quoteHtml = (q) => `<li><span class="ts-qt">“${esc(q.text)}”</span> <small class="ts-src">${q.source === 'pmc_oa' ? `<a href="${esc(q.link)}" target="_blank" rel="noopener">${esc(q.doc)}</a> · ${esc(q.title)}` : `${q.source === 'statpearls' ? `<a href="#" data-ch="${esc(q.doc)}">${esc(q.title)}</a>` : esc(q.title)}${q.section ? ` · ${esc(q.section)}` : ''}`} · ${esc(q.licence)}</small></li>`;

export function openTest(id) {
  const t = byId[id]; if (!t) return; cur = t; list();
  window.__noteCtx = { hash: 'tests', id, label: t.name };
  const Q = t.quotes, sec = (k, h, note) => (Q[k]?.length ? `<section class="ts-sec"><h3>${h}</h3>${note ? `<p class="fine">${note}</p>` : ''}<ul class="ts-q">${Q[k].map(quoteHtml).join('')}</ul></section>` : '');
  const R = t.research;
  $('#ts-reader').innerHTML = `
    <h2 class="cl-h">${esc(t.name)} <small>${esc(D.categories[t.cat])}</small>${t.emerging ? ' <span class="ts-em" title="Newer or less routine test: a navigation label, not an evidence grade">emerging</span>' : ''}</h2>
    <p>${t.systems.map((s) => `<span class="ts-tag" style="--c:${SYS_COL[s] || '#ccc'}">${esc(s)}</span>`).join('')}</p>
    <div class="ts-links">
      ${t.cat === 'img' ? `<p class="btnrow"><button class="ghost-btn" id="ts-img">Open the Imaging tab</button>${/MRI|magnetic|MR |fMRI|DTI|spectroscopy|susceptib/i.test(t.name) ? '<button class="ghost-btn" id="ts-mri">Open the MRI studio (open MRI scans)</button>' : ''}</p>` : ''}
      ${t.structures.length ? `<button class="primary small" id="ts-3d">Show on 3D model</button> <small class="fine">${t.structures.map(esc).join(', ')}</small>` : ''}
      ${t.genes.length ? `<p class="fine"><b>Genes</b> (the measured protein, or its synthesis enzyme), open in Body systems: ${t.genes.map((g) => `<a href="#" class="ts-gene" data-g="${esc(g)}">${esc(g)}</a> <a href="#" class="ts-dna" data-g="${esc(g)}" title="DNA → RNA → protein">🧬</a>`).join(' · ')}</p>` : ''}
      ${t.chapters.length ? `<p class="fine"><b>Full chapters</b>: ${[...new Map(t.chapters.map((c) => [c.title.split(':')[0], c])).values()].slice(0, 4).map((c) => c.source === 'statpearls' ? `<a href="#" data-ch="${esc(c.id)}">${esc(c.title)}</a>` : esc(c.title)).join(' · ')}</p>` : ''}
    </div>
    ${t.related.length ? `<section class="ts-sec"><h3>Connected tests</h3><p class="fine">Named together in the same source passages (count of passages).</p>${relGraph(t)}</section>` : ''}
    ${sec('about', 'What it is and how it is done')}
    ${sec('interpretation', 'Interpretation')}
    ${sec('benchmark', 'Benchmarks and numbers', 'Sentences that state numbers, cut-offs, sensitivity or specificity, exactly as printed in the source. They describe populations or studies, not reference values for any one person, and are not validated here.')}
    ${!Object.values(Q).some((v) => v.length) ? '<p class="muted">No sentence naming this test was found in the local open texts. Use the links below.</p>' : ''}
    ${R ? `<section class="ts-sec"><h3>Research and references</h3><p class="fine"><b>${R.n_articles.toLocaleString()}</b> complete open-access articles in the local PMC library name this test in their title.${R.reviews.length ? ' Newest systematic reviews and guidelines:' : ''}</p>
      <ul class="ts-q">${R.reviews.map(art).join('')}</ul>${R.newest?.length ? `<p class="fine"><b>Newest articles</b> (any design except preclinical; new and rare uses show up here first):</p><ul class="ts-q">${R.newest.map(art).join('')}</ul>` : ''}</section>` : ''}
    <section class="ts-sec"><h3>Look it up in other free resources</h3><p class="fine">Opens the site in your browser with this test as the search; nothing is copied into the app.</p>${extLinksFor(t.name.replace(/\s*\(.*?\)\s*/g, ' ').trim())}</section>
    <p class="fine cite">${esc(D.sources)}. Index (names, categories, systems, structures, genes) authored for navigation; all explanatory text is quoted. Education only: not for decisions about any patient.</p>`;
  $('#ts-reader').scrollTop = 0;
  $('#ts-img')?.addEventListener('click', () => { location.hash = '#imaging'; });
  $('#ts-mri')?.addEventListener('click', () => { location.hash = '#imaging'; import('./mri_studio.js').then((m) => m.openMriStudio({})); });
  $('#ts-3d')?.addEventListener('click', () => { window.__pendingAtlas = { names: t.structures, atRisk: [], title: t.name }; location.hash = '#atlas'; const go = () => { if (window.__atlas?.clinical) window.__atlas.clinical(window.__pendingAtlas); else setTimeout(go, 300); }; go(); });
  $('#ts-reader').querySelectorAll('[data-ch]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); location.hash = '#clinical'; import('./clinical.js').then((m) => m.startClinical(a.dataset.ch)); }));
  $('#ts-reader').querySelectorAll('.ts-gene').forEach((a) => (a.onclick = (e) => { e.preventDefault(); location.hash = '#molecular'; import('./molecular.js').then(async (m) => { await m.startMolecular(); m.openGene(a.dataset.g); }); }));
  $('#ts-reader').querySelectorAll('.ts-dna').forEach((a) => (a.onclick = (e) => { e.preventDefault(); location.hash = '#genome'; import('./genome.js').then(async (m) => { await m.startGenome(); m.openGene(a.dataset.g); }); }));
  $('#ts-reader').querySelectorAll('[data-rel]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); openTest(a.dataset.rel); }));
}

// radial graph of the connected tests
function relGraph(t) {
  const W = 520, H = 230, cx = W / 2, cy = H / 2, rs = t.related, mx = Math.max(...rs.map((r) => r.n));
  const nodes = rs.map((r, i) => { const a = (i / rs.length) * Math.PI * 2 - Math.PI / 2; return { ...r, x: cx + Math.cos(a) * 190, y: cy + Math.sin(a) * 88, c: byId[r.id] ? SYS_COL[byId[r.id].systems[0]] || '#ccc' : '#ccc' }; });
  return `<svg class="ts-graph" viewBox="0 0 ${W} ${H}">${nodes.map((n) => `<line x1="${cx}" y1="${cy}" x2="${n.x}" y2="${n.y}" stroke="${n.c}" stroke-opacity="0.5" stroke-width="${1 + (4 * n.n) / mx}"/>`).join('')}
    <circle cx="${cx}" cy="${cy}" r="7" fill="#fff"/><text x="${cx}" y="${cy - 12}" text-anchor="middle" class="ts-gt b">${esc(t.name.slice(0, 40))}</text>
    ${nodes.map((n) => `<a href="#" data-rel="${n.id}"><circle cx="${n.x}" cy="${n.y}" r="5" fill="${n.c}"/><text x="${n.x}" y="${n.y + (n.y < cy ? -9 : 15)}" text-anchor="middle" class="ts-gt">${esc(n.name.slice(0, 34))} (${n.n})</text></a>`).join('')}</svg>`;
}

// overview: categories x body systems (how the tests interconnect across the body)
function overview() {
  cur = null; list();
  const syss = [...new Set(D.tests.flatMap((t) => t.systems))].sort(), cats = Object.keys(D.categories);
  const cell = (c, s) => D.tests.filter((t) => t.cat === c && t.systems.includes(s)).length;
  const mx = Math.max(...cats.flatMap((c) => syss.map((s) => cell(c, s))));
  const withQ = D.tests.filter((t) => Object.values(t.quotes).some((v) => v.length)).length;
  const nQ = D.tests.reduce((s, t) => s + Object.values(t.quotes).reduce((a, v) => a + v.length, 0), 0);
  $('#ts-reader').innerHTML = `<h2 class="cl-h">Tests &amp; labs: how they connect</h2>
    <p class="fine"><b>${D.tests.length}</b> tests in ${cats.length} groups; <b>${withQ}</b> have quoted text (${nQ.toLocaleString()} quotes in all). Each cell counts the tests of a group that involve a body system; click a cell to list them.</p>
    <div class="ts-matrix"><table><thead><tr><th></th>${syss.map((s) => `<th><span style="color:${SYS_COL[s] || '#ccc'}">${esc(s)}</span></th>`).join('')}</tr></thead><tbody>
    ${cats.map((c) => `<tr><th>${esc(D.categories[c])}</th>${syss.map((s) => { const n = cell(c, s); return `<td>${n ? `<a href="#" data-cs="${c}|${s}" style="background:rgba(76,201,240,${(0.12 + (0.75 * n) / mx).toFixed(2)})">${n}</a>` : ''}</td>`; }).join('')}</tr>`).join('')}
    </tbody></table></div>
    <p class="fine">${esc(D.rule)}</p>`;
  $('#ts-reader').querySelectorAll('[data-cs]').forEach((a) => (a.onclick = (e) => {
    e.preventDefault(); const [c, s] = a.dataset.cs.split('|'); cat = c; sys = s;
    $('#ts-cats').querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('on', x.dataset.c === c));
    $('#ts-sys').querySelectorAll('[data-s]').forEach((x) => x.classList.toggle('on', x.dataset.s === s)); list();
  }));
}
