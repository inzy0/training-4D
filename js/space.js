// Space medicine tab: the mission from selection to long-term health, NASA's five hazards (RIDGE) in NASA's own words,
// and every spaceflight entry of Tests & labs (quoted text, research counts, newest reviews and trials, 3D links).
// Stage names and which entry sits in which stage are a navigation index; all explanatory text is quoted.
// Sources: data/anatomy_lab/space/nasa.json (tools/space_build.py), data/anatomy_lab/clinical/tests.json (cat "space").

import { EXT } from './extensions.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STAGES = [
  ['Selection & training', '🧑‍🚀', ['Astronaut selection and medical standards', 'Isolation and confinement (behavioural health)', 'Head-down tilt bed rest (ground analogue)']],
  ['Launch', '🚀', ['Launch and re-entry acceleration (G-loads)']],
  ['In orbit & transit', '🛰️', ['Microgravity physiology', 'Headward fluid shift', 'Space motion sickness', 'Spaceflight-associated neuro-ocular syndrome (SANS)', 'Bone loss in spaceflight', 'Muscle atrophy in spaceflight', 'Space anaemia', 'Immune changes in spaceflight', 'Sleep and circadian disruption (spaceflight and shift work)', 'Space radiation', 'Exercise countermeasures (ARED, treadmill, cycle)', 'Medical care in space (telemedicine, autonomy)']],
  ['Spacewalk (EVA)', '🧰', ['Decompression sickness (spacewalk / EVA)']],
  ['Moon & Mars surface', '🌕', ['Partial gravity (Moon, Mars)', 'Artificial gravity', 'Space radiation']],
  ['Re-entry & landing', '🪂', ['Launch and re-entry acceleration (G-loads)', 'Orthostatic intolerance (including after landing)']],
  ['Return: rehab, physiotherapy & exercise', '🏋️', ['Post-flight rehabilitation and reconditioning', 'Exercise countermeasures (ARED, treadmill, cycle)', 'Bone loss in spaceflight', 'Muscle atrophy in spaceflight', 'Orthostatic intolerance (including after landing)']],
  ['Long-term health & research', '🔬', ['Spaceflight and astronaut health (general)', 'Space radiation', 'Spaceflight-associated neuro-ocular syndrome (SANS)']],
];
const RIDGE = { 'Space Radiation': ['R', 'Space radiation'], 'Isolation and Confinement': ['I', 'Isolation and confinement (behavioural health)'], 'Distance from Earth': ['D', 'Medical care in space (telemedicine, autonomy)'], 'Gravity Fields': ['G', 'Microgravity physiology'], 'Hostile/Closed Environments': ['E', 'Immune changes in spaceflight'] };
let N = null, T = null, byName = {}, stage = 2;

export async function startSpace() {
  const host = $('#space-body'); if (!host) return;
  if (!N) {
    [N, T] = await Promise.all([fetch('/training-4D/rt/space/nasa.json').then((r) => r.json()).catch(() => null), fetch('/training-4D/rt/clinical/tests.json').then((r) => r.json()).catch(() => null)]);
    (T?.tests || []).filter((t) => t.cat === 'space').forEach((t) => { byName[t.name] = t; });
  }
  render(host);
}

function render(host) {
  const body = N?.pages.find((p) => p.key === 'body'), haz = N?.pages.find((p) => p.key === 'hazards');
  const about = haz?.sections.find((s) => /About the Five/i.test(s.heading));
  const nasaCite = (p) => `<p class="fine cite">NASA, “${esc(p.title)}”, <a href="${esc(p.url)}" target="_blank" rel="noopener">nasa.gov</a>${p.last_updated ? `, last updated ${esc(String(p.last_updated).slice(0, 10))}` : ''}; retrieved ${esc(N.retrieved)}. ${esc(N.usage)}</p>`;
  const ents = Object.values(byName);
  const nArt = ents.reduce((a, t) => a + (t.research?.n_articles || 0), 0);
  host.innerHTML = `
  <section class="card sp-hero"><div class="card-h"><h2>Space medicine: from launch to return</h2><small>${ents.length} topics · ${nArt.toLocaleString()} article titles</small></div>
    ${about ? about.paras.slice(0, 2).map((p) => `<p>${esc(p)}</p>`).join('') + nasaCite(haz) : '<p class="muted">NASA text not built (tools/space_build.py).</p>'}
    <div class="sp-track">${STAGES.map(([n, ic], i) => `<button class="sp-stage ${i === stage ? 'on' : ''}" data-st="${i}"><span class="sp-ic">${ic}</span><b>${i + 1}</b><small>${esc(n)}</small></button>`).join('<i class="sp-arrow"></i>')}</div>
  </section>
  <section class="card"><div class="card-h"><h2>${STAGES[stage][1]} ${esc(STAGES[stage][0])}</h2><small>click a topic for quoted text, research and 3D</small></div>
    <div class="sp-topics">${STAGES[stage][2].map((n) => { const t = byName[n]; return t ? `<button class="sp-topic" data-t="${esc(n)}"><b>${esc(n)}</b>${t.emerging ? ' <span class="ts-em">emerging</span>' : ''}<small>${(t.research?.n_articles || 0).toLocaleString()} articles · ${Object.values(t.quotes).reduce((a, v) => a + v.length, 0)} quotes</small></button>` : ''; }).join('')}</div>
    <div id="sp-entry"></div></section>
  <section class="card"><div class="card-h"><h2>NASA's five hazards (RIDGE)</h2><small>NASA's own words</small></div>
    ${body ? body.sections.filter((s) => RIDGE[s.heading]).map((s) => `<details class="sp-haz"><summary><span class="sp-ridge">${RIDGE[s.heading][0]}</span> ${esc(s.heading)} <small>${s.paras.length} paragraphs</small></summary>${s.paras.map((p) => `<p class="${/^The Key:/.test(p) ? 'sp-key' : ''}">${esc(p)}</p>`).join('')}
      <p><button class="ghost-btn small" data-t="${esc(RIDGE[s.heading][1])}">Related topic: ${esc(RIDGE[s.heading][1])}</button></p></details>`).join('') + nasaCite(body) : ''}
  </section>
  <section class="card"><div class="card-h"><h2>Research: what has been studied</h2><small>PMC open-access article titles naming each topic</small></div>
    <table class="tt sp-res"><thead><tr><th>Topic</th><th>Articles</th><th>Newest systematic review or guideline</th></tr></thead><tbody>
    ${ents.sort((a, b) => (b.research?.n_articles || 0) - (a.research?.n_articles || 0)).map((t) => { const r = t.research, v = r?.reviews?.[0]; return `<tr><td><a href="#" data-t="${esc(t.name)}">${esc(t.name)}</a></td><td>${(r?.n_articles || 0).toLocaleString()}</td><td class="mini">${v ? `<a href="https://pmc.ncbi.nlm.nih.gov/articles/${esc(v.pmcid)}/" target="_blank" rel="noopener">${esc(v.title)}</a> (${esc(v.year)})` : '—'}</td></tr>`; }).join('')}</tbody></table>
    <p class="fine">Counts are titles in the local PMC open-access library that name the topic; they show where research is dense or thin, not what it found. Gaps NASA itself lists are in the Human Research Roadmap (link below).</p></section>
  <section class="card"><div class="card-h"><h2>Programmes, open data and learning</h2></div><div class="ext-grid">${EXT.filter((e) => /^Space/.test(e[0])).map((e) => `<div class="ext-card"><a href="${esc(e[2])}" target="_blank" rel="noopener noreferrer"><b>${esc(e[1])}</b></a><p class="fine">${esc(e[3])}</p><p class="fine"><span class="ext-acc ${e[4] === 'free' ? 'ok' : ''}">${esc(e[4])}</span> · ${esc(e[6])}</p></div>`).join('')}</div></section>
  <p class="fine">Education only. Stage names and topic grouping are a navigation index; explanations are quoted from NASA and from open-access sources with their licences.</p>`;
  host.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => { stage = +b.dataset.st; render(host); }));
  host.querySelectorAll('[data-t]').forEach((b) => (b.onclick = (e) => { e.preventDefault(); entry(b.dataset.t); }));
}

function entry(name) {
  const t = byName[name], el = $('#sp-entry'); if (!t || !el) return;
  const q = (k, h) => (t.quotes[k]?.length ? `<h4>${h}</h4><ul class="ts-q">${t.quotes[k].slice(0, 4).map((x) => `<li><span class="ts-qt">“${esc(x.text)}”</span> <small class="ts-src">${x.link ? `<a href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.doc)}</a>` : esc(x.doc)} · ${esc(x.title)} · ${esc(x.licence || '')}</small></li>`).join('')}</ul>` : '');
  const art = (r) => `<li><a href="https://pmc.ncbi.nlm.nih.gov/articles/${esc(r.pmcid)}/" target="_blank" rel="noopener">${esc(r.title)}</a> <small>${esc(r.journal || '')} ${esc(r.year || '')} · ${esc(String(r.design || '').replace(/_/g, ' '))}</small></li>`;
  el.innerHTML = `<div class="sp-entry"><h3>${esc(t.name)}</h3>
    <p class="btnrow">${t.structures.length ? '<button class="primary small" id="sp-3d">Show on 3D model</button>' : ''}<button class="ghost-btn small" id="sp-full">Open full page in Tests &amp; labs</button></p>
    ${q('about', 'What it is')}${q('interpretation', 'What is known')}${q('benchmark', 'Numbers, as printed in the source')}
    ${t.research ? `<h4>Research</h4><p class="fine"><b>${t.research.n_articles.toLocaleString()}</b> open-access article titles.</p><ul class="ts-q">${[...(t.research.reviews || []), ...(t.research.newest || [])].slice(0, 8).map(art).join('')}</ul>` : ''}</div>`;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.querySelector('#sp-full')?.addEventListener('click', () => { location.hash = '#tests'; import('./tests.js').then((m) => m.startTests(t.id)); });
  el.querySelector('#sp-3d')?.addEventListener('click', () => { window.__pendingAtlas = { names: t.structures, atRisk: [], title: t.name }; location.hash = '#atlas'; const go = () => { if (window.__atlas?.clinical) window.__atlas.clinical(window.__pendingAtlas); else setTimeout(go, 300); }; go(); });
}
