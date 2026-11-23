// Clinical library: conditions (pathology, evaluation, treatment, complications),
// medications, procedures / surgery and anatomy, read verbatim from StatPearls
// chapters (CC BY-NC-ND 4.0, unchanged, attributed) through the local server.
// Condition-level education only: nothing here is about a particular patient,
// and nothing is written or summarised by a model.
//
// "Show on 3D model" finds the reference body's structures named in the
// chapter (name match against the atlas) and highlights them in the 3D Atlas.
// Procedure chapters open the surgery sandbox: step through the chapter's own
// technique paragraphs while the structures each paragraph names light up, with
// the structures named under Complications marked "at risk".

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TYPES = { condition: 'Conditions', drug: 'Medications', procedure: 'Procedures & surgery', anatomy: 'Anatomy', topic: 'Other topics', all: 'All' };
const KEY_SECTIONS = {
  condition: ['Introduction', 'Etiology', 'Pathophysiology', 'History and Physical', 'Evaluation', 'Treatment / Management', 'Differential Diagnosis', 'Prognosis', 'Complications', 'Deterrence and Patient Education'],
  drug: ['Indications', 'Mechanism of Action', 'Administration', 'Adverse Effects', 'Contraindications', 'Monitoring', 'Toxicity'],
  procedure: ['Introduction', 'Anatomy and Physiology', 'Indications', 'Contraindications', 'Equipment', 'Preparation', 'Technique or Treatment', 'Complications', 'Clinical Significance'],
};
let NAMES = null, CUR = null, kind = 'all';

export async function startClinical(openId) {
  if (!$('#cl-types').childElementCount) {
    $('#cl-types').innerHTML = Object.entries(TYPES).map(([k, v]) => `<button class="ghost-btn ${k === kind ? 'on' : ''}" data-k="${k}">${v}</button>`).join('');
    $('#cl-types').querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => { kind = b.dataset.k; $('#cl-types').querySelectorAll('[data-k]').forEach((x) => x.classList.toggle('on', x === b)); search(); }));
    let tm = null; $('#cl-q').oninput = () => { clearTimeout(tm); tm = setTimeout(search, 220); };
    $('#cl-types').insertAdjacentHTML('beforeend', '<button class="ghost-btn" id="cl-organs">By organ &amp; system (incl. cancers)</button>');
    $('#cl-organs').onclick = () => browseOrgans();
    $('#cl-types').insertAdjacentHTML('beforeend', '<button class="ghost-btn" id="cl-drugs">Medications library (FDA labels)</button><button class="ghost-btn" id="cl-equip">Surgical instruments &amp; equipment</button>');
    $('#cl-drugs').onclick = () => browseDrugs();
    $('#cl-equip').onclick = () => browseEquipment();
  }
  if (openId) openChapter(openId);
}

let PROC = null;
async function browseProcedures(region) {
  PROC = PROC || (await (await fetch('/training-4D/rt/clinical/procedures.json')).json());
  const host = $('#cl-results'), all = PROC.procedures, count = {};
  all.forEach((p) => (p.regions.length ? p.regions : ['Region not determined']).forEach((r) => { count[r] = (count[r] || 0) + 1; }));
  const regs = Object.keys(count).sort((a, b) => (a.startsWith('Region') ? 1 : b.startsWith('Region') ? -1 : count[b] - count[a]));
  const list = region ? all.filter((p) => (p.regions.length ? p.regions : ['Region not determined']).includes(region)) : [];
  host.innerHTML = `<p class="fine"><b>Procedures &amp; surgery by body region</b> (${all.length} StatPearls procedure chapters; region = where the anatomy each chapter names sits on the reference body)</p>
    <div class="cl-regs">${regs.map((r) => `<button class="ghost-btn ${r === region ? 'on' : ''}" data-reg="${esc(r)}">${esc(r)} <small>${count[r]}</small></button>`).join('')}</div>
    ${region ? `<ul class="cl-list">${list.map((x) => `<li><button class="cl-item" data-id="${esc(x.id)}"><span class="cl-t">${esc(x.title)}</span><small>${x.n_structures} structures named</small></button></li>`).join('')}</ul>` : '<p class="fine muted">Pick a region.</p>'}`;
  host.querySelectorAll('[data-reg]').forEach((b) => (b.onclick = () => browseProcedures(b.dataset.reg)));
  host.querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => openChapter(b.dataset.id)));
}

async function search() {
  const q = $('#cl-q').value.trim(); const host = $('#cl-results');
  if (q.length < 2 && kind === 'procedure') { browseProcedures(null); return; }
  if (q.length < 2) { host.innerHTML = '<p class="fine muted">Type at least two letters: a disease, a drug, a procedure or a structure. Or choose "Procedures &amp; surgery" to browse by body region.</p>'; return; }
  const r = await (await fetch(`/api/clinical/search?q=${encodeURIComponent(q)}&type=${kind}&limit=60`)).json();
  host.innerHTML = r.length ? `<ul class="cl-list">${r.map((x) => `<li><button class="cl-item" data-id="${esc(x.id)}"><span class="cl-t">${esc(x.title)}</span><small>${esc(TYPES[x.type] || x.type)}</small></button></li>`).join('')}</ul>` : '<p class="fine muted">No chapter title matches.</p>';
  host.querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => openChapter(b.dataset.id)));
}

export async function openChapter(id) {
  const d = await (await fetch(`/api/clinical/doc?id=${encodeURIComponent(id)}`)).json();
  if (d.error) { $('#cl-reader').innerHTML = `<p class="muted">${esc(d.error)}</p>`; return; }
  CUR = d;
  window.__noteCtx = { hash: 'clinical', id, label: d.title };
  window.__noteCtx = { hash: 'clinical', id, label: d.title };
  const key = KEY_SECTIONS[d.type] || [];
  const ordered = [...d.sections].sort((a, b) => { const ia = key.indexOf(a.name), ib = key.indexOf(b.name); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
  const names = await structuresIn(d);
  const atRisk = await structuresIn({ sections: d.sections.filter((s) => /complication/i.test(s.name)) });
  $('#cl-reader').innerHTML = `
    <h2 class="cl-h">${esc(d.title)} <small>${esc(TYPES[d.type] || d.type)}</small></h2>
    <nav class="cl-toc">${ordered.map((s, i) => `<a href="#cl-s${i}">${esc(s.name)}</a>`).join('')}</nav>
    <div class="cl-3d"><b>Structures of the reference body named in this chapter</b> <small>(name match, ${names.length})</small>: ${names.slice(0, 40).map((n) => `<span class="cl-tag${atRisk.includes(n) ? ' risk' : ''}">${esc(n)}</span>`).join('') || '<span class="muted">none matched</span>'}
      <p class="btnrow">${d.type === 'condition' ? '<button class="primary small" id="cl-care">Care pathway: diagnosis → treatment → monitoring → return → long term</button>' : ''}${names.length ? '<button class="primary small" id="cl-show3d">Show on 3D model</button>' : ''}${d.type === 'procedure' ? '<button class="ghost-btn" id="cl-sandbox">Open surgery sandbox</button>' : ''}</p>
      ${atRisk.length ? '<p class="fine">Red tags = named in the chapter\'s Complications section (structures the chapter discusses in relation to complications).</p>' : ''}</div>
    ${d.type === 'procedure' ? procedureCards(d) : ''}
    ${ordered.map((s, i) => `<section id="cl-s${i}" class="cl-sec"><h3>${esc(s.name)}</h3>${s.text.split('\n\n').map((p) => `<p>${esc(p)}</p>`).join('')}</section>`).join('')}
    <p class="fine cite">Verbatim from <i>${esc(d.title)}</i>, ${esc(d.publisher)}, StatPearls [Internet], chapter ${esc(d.id.split('-').pop())}. Licence <a href="${esc(d.licence)}" target="_blank" rel="noopener">CC BY-NC-ND 4.0</a> (unchanged text; references omitted here). <a href="${esc(d.link)}" target="_blank" rel="noopener">Find on NCBI Bookshelf</a>. Education only, not advice for any patient.</p>`;
  $('#cl-reader').scrollTop = 0;
  $('#cl-show3d')?.addEventListener('click', () => toAtlas({ names, atRisk, title: d.title }));
  $('#cl-care')?.addEventListener('click', () => carePathway(d, names));
  $('#cl-sandbox')?.addEventListener('click', () => toAtlas({ names, atRisk, title: d.title, sandbox: d }));
}

// procedure overview: the chapter's own sections as cards; lines that start with "-" become list items,
// technique paragraphs become numbered steps. Text unchanged.
function procedureCards(d) {
  const sec = (re) => d.sections.find((s) => re.test(s.name));
  const items = (t) => t.split('\n\n').flatMap((p) => p.split(/\n(?=- )/)).map((x) => x.trim()).filter(Boolean);
  const card = (title, s, cls = '', numbered = false) => s ? `<div class="pc-card ${cls}"><h4>${title}</h4>${numbered ? `<ol>${items(s.text).map((x) => `<li>${esc(x.replace(/^- /, ''))}</li>`).join('')}</ol>` : `<ul>${items(s.text).map((x) => `<li>${esc(x.replace(/^- /, ''))}</li>`).join('')}</ul>`}</div>` : '';
  return `<div class="pc-grid">
    ${card('Indications', sec(/^Indications/))}${card('Contraindications', sec(/^Contraindications/), 'warn')}
    ${card('Equipment', sec(/^Equipment/))}${card('Personnel', sec(/^Personnel/))}
    ${card('Preparation', sec(/^Preparation/), '', true)}${card('Technique, step by step (as written in the chapter)', sec(/^Technique/), 'wide', true)}
    ${card('Complications', sec(/^Complications/), 'risk')}</div>`;
}

// structures of the atlas named in the text (multi-word names, or single distinctive words of 5+ letters)
const STOP = new Set(['skin', 'body', 'heart', 'brain', 'head', 'neck', 'trunk', 'mouth', 'nose', 'liver']);
async function structuresIn(d) {
  if (!NAMES) {
    const idx = await (await fetch('/training-4D/rt/atlas/index.json')).json();
    const base = new Set(idx.parts.map((p) => p.name.replace(/\b(left|right) /, '')));
    NAMES = [...base].filter((n) => n.includes(' ') || (n.length >= 5 && !STOP.has(n))).map((n) => ({ n, re: new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(s|es)?\\b`, 'i') }));
  }
  const text = d.sections.map((s) => s.text).join('\n');
  return NAMES.filter((x) => x.re.test(text)).map((x) => x.n).sort((a, b) => b.length - a.length);
}

function toAtlas(payload) {
  window.__pendingAtlas = payload;
  location.hash = '#atlas';
  const go = () => { if (window.__atlas?.clinical) window.__atlas.clinical(payload); else setTimeout(go, 300); };
  go();
}
export { structuresIn };

// ---------------------------------------------------------------- medications library (openFDA labels, CC0)
let DCLS = null;
async function browseDrugs(q = '', cls = '') {
  const host = $('#cl-results');
  DCLS = DCLS || (await (await fetch('/api/drugs/classes')).json().catch(() => []));
  if (!Array.isArray(DCLS)) { host.innerHTML = `<p class="muted">${esc(DCLS.error || 'Drug library not built yet.')}</p>`; return; }
  const r = await (await fetch(`/api/drugs/search?q=${encodeURIComponent(q)}&cls=${encodeURIComponent(cls)}`)).json();
  host.innerHTML = `<p class="fine"><b>Medications library</b>: every human prescription and OTC drug with an FDA label (openFDA, public domain), one label per generic name; ranked by how many condition chapters name it in their treatment text.</p>
    <input id="dr-q" type="search" placeholder="Drug or brand name (e.g. metformin, Lipitor, ceftriaxone)" value="${esc(q)}" style="width:100%">
    <select id="dr-cls" style="width:100%;margin:4px 0"><option value="">All pharmacologic classes (${DCLS.length})</option>${DCLS.map(([c, n]) => `<option value="${esc(c)}" ${c === cls ? 'selected' : ''}>${esc(c)} · ${n}</option>`).join('')}</select>
    <ul class="cl-list">${r.map((x) => `<li><button class="cl-item" data-drug="${esc(x.generic)}"><span class="cl-t">${esc(x.generic.toLowerCase())}</span><small>${esc((x.epc || '').split('; ')[0])}${x.brands ? ` · ${esc(x.brands.slice(0, 60))}` : ''} · ${esc(x.routes)}${+x.n_conditions ? ` · ${x.n_conditions} conditions` : ''}</small></button></li>`).join('') || '<li class="fine muted">No match.</li>'}</ul>`;
  let tm = null; $('#dr-q').oninput = (e) => { clearTimeout(tm); tm = setTimeout(() => browseDrugs(e.target.value, $('#dr-cls').value), 250); };
  $('#dr-cls').onchange = (e) => browseDrugs($('#dr-q').value, e.target.value);
  host.querySelectorAll('[data-drug]').forEach((b) => (b.onclick = () => openDrug(b.dataset.drug)));
}
export async function openDrug(g) {
  const d = await (await fetch(`/api/drugs/get?g=${encodeURIComponent(g)}`)).json(); const R = $('#cl-reader');
  if (d.error) { R.innerHTML = `<p class="muted">${esc(d.error)}</p>`; return; }
  window.__noteCtx = { hash: 'clinical', id: d.statpearls || null, label: `${d.generic.toLowerCase()} (drug)` };
  const sec = (k, h) => (d[k] ? `<section class="cl-sec"><h3>${h}</h3>${d[k].split(/\n+/).map((x) => `<p>${esc(x)}</p>`).join('')}${d[k].length >= 690 ? '<p class="fine muted">… (cut; full label on DailyMed)</p>' : ''}</section>` : '');
  R.innerHTML = `<h2 class="cl-h">${esc(d.generic.toLowerCase())} <small>${esc(d.type === 'HUMAN OTC DRUG' ? 'over the counter' : 'prescription')}</small></h2>
    <p class="fine">${d.brands ? `<b>Brands</b>: ${esc(d.brands)} · ` : ''}<b>Route</b>: ${esc(d.routes || '—')}${d.epc ? ` · <b>Class (FDA EPC)</b>: ${esc(d.epc)}` : ''}${d.moa ? ` · <b>Mechanism (FDA MoA)</b>: ${esc(d.moa)}` : ''}</p>
    <p class="btnrow">${d.setid ? `<a class="ghost-btn" href="https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=${esc(d.setid)}" target="_blank" rel="noopener">Full label on DailyMed</a>` : ''}${d.statpearls ? `<button class="primary small" id="dr-sp">StatPearls drug chapter</button>` : ''}</p>
    ${d.boxed_warning ? `<section class="cl-sec dr-box"><h3>Boxed warning</h3><p>${esc(d.boxed_warning)}</p></section>` : ''}
    ${sec('indications_and_usage', 'Indications and usage')}${sec('dosage_and_administration', 'Dosage and administration')}${sec('contraindications', 'Contraindications')}
    ${sec('warnings_and_cautions', 'Warnings and precautions')}${sec('adverse_reactions', 'Adverse reactions')}${sec('drug_interactions', 'Drug interactions')}
    ${sec('mechanism_of_action', 'Mechanism of action')}${sec('use_in_specific_populations', 'Specific populations')}${sec('overdosage', 'Overdosage')}
    ${d.conditions?.length ? `<section class="cl-sec"><h3>Condition chapters whose treatment text names it (${d.conditions.length})</h3><div class="ext-chips">${d.conditions.map((c) => `<a href="#" class="ext-chip" data-ch="${esc(c.doc_id)}">${esc(c.title)}</a>`).join('')}</div></section>` : ''}
    <p class="fine cite">FDA structured product label via openFDA (public domain), label effective ${esc(d.eff)}; text quoted verbatim and shortened. Education only: never use this to choose or dose a medicine for a person.</p>`;
  R.scrollTop = 0;
  $('#dr-sp')?.addEventListener('click', () => openChapter(d.statpearls));
  R.querySelectorAll('[data-ch]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); openChapter(a.dataset.ch); }));
}

// ---------------------------------------------------------------- surgical instruments and equipment (StatPearls Equipment sections)
let EQ = null, eqFam = null;
async function browseEquipment(q = '') {
  EQ = EQ || (await (await fetch('/training-4D/rt/clinical/equipment.json')).json());
  const host = $('#cl-results'), fc = {}; EQ.items.forEach((it) => it.families.forEach((f) => { fc[f] = (fc[f] || 0) + 1; }));
  const list = EQ.items.filter((it) => (!eqFam || it.families.includes(eqFam)) && (!q || it.item.toLowerCase().includes(q.toLowerCase())));
  host.innerHTML = `<p class="fine"><b>Surgical instruments and equipment</b>: ${EQ.items.length.toLocaleString()} items from the Equipment sections of ${Object.keys(EQ.procedures).length} StatPearls procedure chapters (verbatim), grouped by instrument family.</p>
    <input id="eq-q" type="search" placeholder="Instrument (e.g. retractor, trocar, needle driver, arthroscope)" value="${esc(q)}" style="width:100%">
    <div class="org-types">${EQ.families.map((f) => `<button class="ghost-btn ${f === eqFam ? 'on' : ''}" data-fam="${esc(f)}">${esc(f)} <small>${fc[f] || 0}</small></button>`).join('')}</div>
    <ul class="cl-list">${list.slice(0, 300).map((x, i) => `<li><button class="cl-item" data-eq="${EQ.items.indexOf(x)}"><span class="cl-t">${esc(x.item)}</span><small>${esc(x.families.join(' · '))} · ${x.n} procedure${x.n > 1 ? 's' : ''}</small></button></li>`).join('')}</ul>`;
  let tm = null; $('#eq-q').oninput = (e) => { clearTimeout(tm); tm = setTimeout(() => browseEquipment(e.target.value), 250); };
  host.querySelectorAll('[data-fam]').forEach((b) => (b.onclick = () => { eqFam = eqFam === b.dataset.fam ? null : b.dataset.fam; browseEquipment($('#eq-q').value); }));
  host.querySelectorAll('[data-eq]').forEach((b) => (b.onclick = () => openEquipment(EQ.items[+b.dataset.eq])));
}
function openEquipment(it) {
  const R = $('#cl-reader');
  R.innerHTML = `<h2 class="cl-h">${esc(it.item)} <small>${esc(it.families.join(' · '))}</small></h2>
    <p class="fine">Listed in the Equipment section of ${it.n} procedure chapter${it.n > 1 ? 's' : ''}. Open a procedure for its full equipment list, technique and the surgery sandbox on the 3D model.</p>
    <ul class="cl-list">${it.procs.map((d) => { const P = EQ.procedures[d]; return `<li><button class="cl-item" data-proc="${esc(d)}"><span class="cl-t">${esc(P?.title || d)}</span><small>${esc((P?.regions || []).join(', '))}</small></button></li>`; }).join('')}</ul>
    <div id="eq-proc"></div><p class="fine cite">${esc(EQ.licence)}. Families are a keyword index for browsing.</p>`;
  R.querySelectorAll('[data-proc]').forEach((b) => (b.onclick = () => { const P = EQ.procedures[b.dataset.proc]; $('#eq-proc').innerHTML = `<section class="cl-sec"><h3>${esc(P.title)}: full equipment list</h3><ul class="fine">${P.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><p class="btnrow"><button class="primary small" id="eq-open">Open the procedure chapter</button></p></section>`; $('#eq-open').onclick = () => openChapter(b.dataset.proc); }));
}


// ---------------------------------------------------------------- conditions by organ (incl. cancers)
let ORG = null, orgSel = null, typeSel = null;
async function browseOrgans() {
  ORG = ORG || (await (await fetch('/training-4D/rt/clinical/organs.json')).json());
  const host = $('#cl-results'), sys = [...new Set(Object.values(ORG.organs).map((o) => o.system))];
  const list = ORG.items.filter((it) => (!orgSel || it.organs.includes(orgSel)) && (!typeSel || it.types.includes(typeSel)));
  const tc = {}; ORG.items.filter((it) => !orgSel || it.organs.includes(orgSel)).forEach((it) => it.types.forEach((t) => { tc[t] = (tc[t] || 0) + 1; }));
  host.innerHTML = `<p class="fine"><b>Conditions by organ and system</b> (${ORG.items.length.toLocaleString()} StatPearls condition chapters; organ and type from the title, a mechanical index)</p>
    ${sys.map((sy) => `<div class="org-sys"><b class="fine">${esc(sy)}</b> ${Object.entries(ORG.organs).filter(([, o]) => o.system === sy).map(([k, o]) => `<button class="ghost-btn ${k === orgSel ? 'on' : ''}" data-org="${esc(k)}">${esc(k)} <small>${o.n}</small></button>`).join('')}</div>`).join('')}
    <div class="org-types">${ORG.types.map((t) => `<button class="ghost-btn ${t === typeSel ? 'on' : ''} ${t.startsWith('Cancer') ? 'cancer' : ''}" data-ty="${esc(t)}">${esc(t)} <small>${tc[t] || 0}</small></button>`).join('')}</div>
    ${orgSel || typeSel ? `<p class="fine">${list.length} chapters${orgSel ? ` · ${esc(orgSel)}` : ''}${typeSel ? ` · ${esc(typeSel)}` : ''} ${orgSel && ORG.organs[orgSel].structures.length ? '<button class="ghost-btn" id="org-3d">Show organ on 3D model</button>' : ''} <button class="ghost-btn" id="org-reset">Reset</button></p>
    <ul class="cl-list">${list.slice(0, 400).map((x) => `<li><button class="cl-item" data-id="${esc(x.id)}"><span class="cl-t">${esc(x.title)}</span><small>${esc(x.types.join(' · '))}</small></button></li>`).join('')}</ul>` : '<p class="fine muted">Pick an organ, a type, or both (e.g. Lung and airway + Cancer and tumours).</p>'}`;
  host.querySelectorAll('[data-org]').forEach((b) => (b.onclick = () => { orgSel = orgSel === b.dataset.org ? null : b.dataset.org; browseOrgans(); }));
  host.querySelectorAll('[data-ty]').forEach((b) => (b.onclick = () => { typeSel = typeSel === b.dataset.ty ? null : b.dataset.ty; browseOrgans(); }));
  host.querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => openChapter(b.dataset.id)));
  $('#org-reset')?.addEventListener('click', () => { orgSel = typeSel = null; browseOrgans(); });
  $('#org-3d')?.addEventListener('click', () => toAtlas({ names: ORG.organs[orgSel].structures, atRisk: [], title: orgSel }));
}

// ---------------------------------------------------------------- care pathway: the chapter's own course of care, verbatim
const STAGE_COL = ['#4cc9f0', '#90e0ef', '#b388ff', '#06d6a0', '#ffd166', '#ff6b6b', '#f78c6b', '#e9ff70', '#ff9e00'];
const LONG = [
  ['Monitoring and follow-up', /follow[- ]?up|monitor|surveillance|repeat (testing|imaging|measurement)|serial|recheck|periodic/i],
  ['Return to activity, sport and work', /return to (sport|play|work|activit|daily|full|normal|training|competition)|resum(e|ption) (of )?(sport|activit|work|training)|rehabilitat/i],
  ['Lifestyle, prevention and training', /lifestyle|exercise|physical activity|diet|nutrition|weight loss|smoking|alcohol|sleep|stress|prevent|strengthen|education/i],
  ['Outlook: recurrence, survival and long-term health', /prognos|surviv|mortality|recurren|relapse|life expectancy|long[- ]term|quality of life|remission|cure/i],
];
let TESTS = null;
async function carePathway(d, names) {
  const R = $('#cl-reader');
  R.innerHTML = `<h2 class="cl-h">${esc(d.title)} <small>care pathway</small></h2><p class="fine muted">Assembling the course of care from the chapter…</p>`;
  const [cp, T] = await Promise.all([fetch(`/api/clinical/pathway?q=${encodeURIComponent(d.title)}`).then((r) => r.json()).catch((e) => ({ error: String(e) })), TESTS || fetch('/training-4D/rt/clinical/tests.json').then((r) => r.json()).catch(() => null)]);
  TESTS = T;
  if (cp.error || cp.refused || !cp.found) { R.innerHTML += `<p class="muted">${esc(cp.error || cp.banner || 'No pathway found.')}</p>`; return; }
  const full = d.sections.map((x) => x.text).join(' \n');
  const sents = full.split(/(?<=[.!?])\s+(?=[A-Z])/).map((x) => x.trim()).filter((x) => x.length > 40 && x.length < 500);
  const longBy = LONG.map(([lab, rx]) => [lab, sents.filter((x) => rx.test(x)).slice(0, 8)]);
  const tests = T ? T.tests.filter((t) => { const n = t.name.replace(/\s*\(.*?\)\s*/g, ' ').split(/[/,]/)[0].trim(); return n.length > 3 && new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(full); }).slice(0, 40) : [];
  const tl = (Array.isArray(cp.timeline) ? cp.timeline : []).filter((x) => x.hours_low != null), lg = (h) => Math.log10(Math.max(0.1, h)), lo = lg(0.5), hi = lg(24 * 365 * 10);
  const ticks = [['1 h', 1], ['1 day', 24], ['1 week', 168], ['1 month', 720], ['6 months', 4380], ['1 year', 8760], ['5 years', 43800]];
  R.innerHTML = `<h2 class="cl-h">${esc(d.title)} <small>care pathway, verbatim</small></h2>
    <p class="fine">${esc(cp.banner)}</p>
    <div class="cp-journey">${cp.stages.map((st, i) => `<a href="#cp-s${i}" class="cp-stage" style="--c:${STAGE_COL[i % STAGE_COL.length]}">${esc(st.label.split(':')[0])}</a>`).join('<span class="cp-arrow">→</span>')}<span class="cp-arrow">→</span><a href="#cp-long" class="cp-stage" style="--c:#ff9e00">Back to life and long term</a></div>
    ${tl.length ? `<section class="cl-sec"><h3>Timeline (every time the chapter states)</h3><div class="cp-tl">${ticks.map(([l, h]) => `<span class="cp-tick" style="left:${((lg(h) - lo) / (hi - lo)) * 100}%">${l}</span>`).join('')}
      ${tl.map((x, i) => `<span class="cp-bar" title="${esc(x.when)}: ${esc(x.quote)}" style="left:${((lg(x.hours_low) - lo) / (hi - lo)) * 100}%;width:${Math.max(0.8, ((lg(x.hours_high || x.hours_low) - lg(x.hours_low)) / (hi - lo)) * 100)}%;top:${18 + (i % 6) * 9}px"></span>`).join('')}</div>
      <details><summary class="fine">${tl.length} timed statements</summary><ul class="fine">${tl.map((x) => `<li><b>${esc(x.when)}</b> (${esc(x.stage)}): “${esc(x.quote)}”</li>`).join('')}</ul></details></section>` : ''}
    ${cp.stages.map((st, i) => `<section class="cl-sec" id="cp-s${i}"><h3 style="color:${STAGE_COL[i % STAGE_COL.length]}">${i + 1}. ${esc(st.label)}</h3>
      ${Array.isArray(st.decision_points) && st.decision_points.length ? `<p class="fine"><b>Decision points</b> (the chapter's conditional sentences)</p><ul class="fine">${st.decision_points.slice(0, 6).map((x) => `<li>“${esc(x.quote || x.text || x)}”</li>`).join('')}</ul>` : ''}
      ${Array.isArray(st.reasons) && st.reasons.length ? `<p class="fine"><b>Reasons given</b></p><ul class="fine">${st.reasons.slice(0, 4).map((x) => `<li>“${esc(x.quote || x.text || x)}”</li>`).join('')}</ul>` : ''}
      <details><summary class="fine">Full text of this stage (${esc((st.sections || []).join(', '))})</summary>${String(st.text || '').split('\n\n').map((x) => `<p>${esc(x)}</p>`).join('')}</details></section>`).join('')}
    ${Array.isArray(cp.medications) && cp.medications.length ? `<section class="cl-sec"><h3>Medications named in the treatment text</h3><div class="cp-meds">${cp.medications.map((m) => `<div class="cp-med"><b>${esc(m.title)}</b>${Object.entries(m).filter(([k, v]) => typeof v === 'string' && !['title', 'doc_id'].includes(k) && v.length > 20).slice(0, 4).map(([k, v]) => `<p class="fine"><b>${esc(k.replace(/_/g, ' '))}:</b> ${esc(v.slice(0, 400))}</p>`).join('')}<a href="#" data-ch="${esc(m.doc_id)}" class="fine">Open drug chapter</a></div>`).join('')}</div></section>` : ''}
    <section class="cl-sec" id="cp-fda"></section>
    ${tests.length ? `<section class="cl-sec"><h3>Tests and measurements this chapter names</h3><p class="fine">Open a test for what it measures, how it is read and the numbers its sources report.</p><div class="ext-chips">${tests.map((t) => `<a href="#" class="ext-chip" data-test="${t.id}">${esc(t.name)}</a>`).join('')}</div></section>` : ''}
    <section class="cl-sec" id="cp-long"><h3 style="color:#ff9e00">Back to life and long term</h3><p class="fine">Sentences from this chapter about follow-up, return to activity, lifestyle and long-term outlook (keyword filter, unchanged text).</p>
      ${longBy.map(([lab, xs]) => `<p class="fine"><b>${esc(lab)}</b></p>${xs.length ? `<ul class="fine">${xs.map((x) => `<li>“${esc(x)}”</li>`).join('')}</ul>` : '<p class="fine muted">The chapter states none.</p>'}`).join('')}</section>
    ${Array.isArray(cp.scenarios) && cp.scenarios.length ? `<section class="cl-sec"><h3>Related chapters</h3>${cp.scenarios.map((x) => `<a href="#" class="ext-chip" data-ch="${esc(x.doc_id)}">${esc(x.title)}</a>`).join(' ')}</section>` : ''}
    <p class="fine"><a href="#" id="cp-back">← Back to the chapter</a></p>
    <p class="fine cite">${esc(cp.licence || '')} Course of care laid out by tools/clinical_pathway.py (sections in care order; decision points, reasons and times are the chapter's own sentences). Condition-level education, not a plan for any patient.</p>`;
  R.scrollTop = 0;
  R.querySelectorAll('[data-ch]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); openChapter(a.dataset.ch); }));
  R.querySelectorAll('[data-test]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); location.hash = '#tests'; import('./tests.js').then((m) => m.startTests(a.dataset.test)); }));
  $('#cp-back').onclick = (e) => { e.preventDefault(); openChapter(d.id); };
  fetch(`/api/drugs/for_condition?doc=${encodeURIComponent(d.id)}`).then((r) => r.json()).then((ds) => {
    if (!Array.isArray(ds) || !ds.length) return;
    const el = $('#cp-fda'); el.innerHTML = `<h3>Medications named in the treatment text (${ds.length}, FDA labels)</h3><p class="fine">Generic names found in this chapter's Treatment / Management section; open one for its FDA label (indications, dosing, contraindications, boxed warning, adverse reactions). A name match, not a prescription.</p><div class="ext-chips">${ds.map((x) => `<a href="#" class="ext-chip" data-drug="${esc(x.generic)}" title="${esc(x.epc)}">${esc(x.generic.toLowerCase())}</a>`).join('')}</div>`;
    el.querySelectorAll('[data-drug]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); openDrug(a.dataset.drug); }));
  }).catch(() => {});
}

