// Training System: Exercise library, 8D combination lab, Programs, Drills / games / warm-ups.
import { S, T, api, esc, fmt, go, href, header, hbar, bindTips, kv, show3D, musclesFor, ev, openStudio, PAL, STAGE_COL } from './training.js';

const $ = (s, r = document) => r.querySelector(s);
export async function page(p, main, args) {
  if (p === 'library') return library(main, args);
  if (p === 'combo') return combo(main, args);
  if (p === 'programs') return programs(main, args);
  if (p === 'drills') return drills(main, args);
}

// ================================================================= EXERCISE LIBRARY
const EXF = ['Goal', 'Region', 'Depth (1-6)', 'Equipment Class'];
const EXS = ['Category', 'Movement Pattern', 'Loading Strategy', 'Source Library'];
const LIST_COLS = ['Exercise Name', 'Category', 'Movement Pattern', 'Equipment Class', 'Goal', 'Depth (1-6)', 'Sets × Reps'];
const L = { f: {}, q: '', off: 0, sel: null };

async function library(main, args) {
  try { L.f = JSON.parse(args[0] || '{}'); } catch { L.f = {}; }
  const fac = S.B.facets.Exercise_Library;
  main.innerHTML = `${header('Exercise library', `${fmt(S.B.stats.exercise.total)} exercises from your workbook, each with 47 fields: prescription, progressions to elite, muscles, joint angles, cues, errors, contraindications and depth reasoning. Filters combine; search covers names, muscles, applications and categories.`, 'Library')}
    <section class="card"><div class="bar"><input id="ex-q" class="tr-in" style="flex:1;min-width:240px" type="search" placeholder="Search e.g. nordic, patellar tendon, landmine, isometric, Achilles" value="${esc(L.q)}">
      ${EXS.map((c) => `<select class="tr-sel" data-sel="${esc(c)}"><option value="">${esc(c)}: all</option>${fac[c].map(([v, n]) => `<option value="${esc(v)}" ${L.f[c] === v ? 'selected' : ''}>${esc(v)} (${fmt(n)})</option>`).join('')}</select>`).join('')}
      <button class="ghost-btn" id="ex-clear">Clear filters</button></div>
      ${EXF.map((c) => `<div class="chips" style="margin-top:8px"><span class="mini" style="min-width:110px">${esc(c)}</span>${fac[c].sort((a, b) => (c === 'Depth (1-6)' ? a[0] - b[0] : b[1] - a[1])).map(([v, n]) => `<button class="chip-btn ${L.f[c] === v ? 'on' : ''}" data-f="${esc(c)}" data-v="${esc(v)}">${c === 'Depth (1-6)' ? 'L' : ''}${esc(v)}<small>${fmt(n)}</small></button>`).join('')}</div>`).join('')}
    </section>
    <div class="split"><section class="card"><div class="card-h"><h2 id="ex-count">…</h2><small id="ex-phasefit"></small></div><div class="tt-wrap" id="ex-list"></div><div class="pager" id="ex-pager"></div></section>
    <section class="card sticky" id="ex-detail"><p class="muted">Pick an exercise to see everything about it, how it progresses, which phases it fits and what it trains on the 3D body.</p></section></div>`;
  const setF = (c, v) => { if (L.f[c] === v || v === '') delete L.f[c]; else L.f[c] = v; L.off = 0; go('library', JSON.stringify(L.f)); };
  main.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => setF(b.dataset.f, b.dataset.v)));
  main.querySelectorAll('[data-sel]').forEach((s) => (s.onchange = () => { if (s.value) L.f[s.dataset.sel] = s.value; else delete L.f[s.dataset.sel]; L.off = 0; go('library', JSON.stringify(L.f)); }));
  $('#ex-clear').onclick = () => { L.f = {}; L.q = ''; go('library', '{}'); };
  let tm; $('#ex-q').oninput = (e) => { clearTimeout(tm); tm = setTimeout(() => { L.q = e.target.value; L.off = 0; listEx(); }, 220); };
  await listEx();
  if (args[1]) openEx(+args[1]);
}

async function listEx() {
  const r = await api('table', { t: 'Exercise_Library', q: L.q, f: L.f, off: L.off, lim: 60, cols: LIST_COLS });
  $('#ex-count').textContent = `${fmt(r.total)} exercises`;
  $('#ex-list').innerHTML = `<table class="tt"><thead><tr>${LIST_COLS.map((c) => `<th>${esc(c.replace(' (1-6)', ''))}</th>`).join('')}</tr></thead><tbody>
    ${r.rows.map((x) => `<tr class="click ${L.sel === x[0] ? 'on' : ''}" data-r="${x[0]}">${x.slice(1).map((v, i) => `<td${i === 5 ? ' class="num"' : ''}>${i === 0 ? `<b>${esc(v)}</b>` : esc(v)}</td>`).join('')}</tr>`).join('') || '<tr><td colspan="7" class="muted">No exercise matches.</td></tr>'}</tbody></table>`;
  $('#ex-list').querySelectorAll('[data-r]').forEach((tr) => (tr.onclick = () => { history.replaceState(null, '', href('library', JSON.stringify(L.f), tr.dataset.r)); openEx(+tr.dataset.r); }));
  $('#ex-pager').innerHTML = `${fmt(L.off + 1)}–${fmt(Math.min(r.total, L.off + 60))} of ${fmt(r.total)} <button class="ghost-btn" ${L.off ? '' : 'disabled'} id="pg-prev">‹ Prev</button><button class="ghost-btn" ${L.off + 60 < r.total ? '' : 'disabled'} id="pg-next">Next ›</button>`;
  $('#pg-prev').onclick = () => { L.off = Math.max(0, L.off - 60); listEx(); };
  $('#pg-next').onclick = () => { L.off += 60; listEx(); };
  const fits = phasesFor(L.f.Goal, L.f['Depth (1-6)']);
  $('#ex-phasefit').innerHTML = L.f.Goal || L.f['Depth (1-6)'] ? `fits phases: ${fits.map((p) => `<a class="lk" href="${href('phases', p)}">${p}</a>`).join(' ') || 'none'}` : '';
}

function phasesFor(goal, depth) { // the session builder's rule: goal in the phase's allowed goals and depth inside its band
  return T('Phase_System').filter((p) => (!goal || p['Allowed Goals (auto filter)'].includes(`|${goal}|`)) && (!depth || (+depth >= +p['Depth Min'] && +depth <= +p['Depth Max']))).map((p) => p.Code);
}

async function openEx(id) {
  L.sel = id; document.querySelectorAll('#ex-list tr').forEach((t) => t.classList.toggle('on', +t.dataset.r === id));
  const { data: d } = await api('row', { t: 'Exercise_Library', id });
  const det = $('#ex-detail'), depth = +d['Depth (1-6)'] || 0;
  const mus = musclesFor(`${d['Primary Muscle(s)']}, ${d['Secondary Muscle(s)']}`), prim = musclesFor(d['Primary Muscle(s)']);
  const ls = T('Loading_Strategies').find((s) => d['Loading Strategy'].startsWith(s['Loading strategy'])) || T('Loading_Strategies').find((s) => s['Loading strategy'] === d['Loading Strategy']);
  const dm = T('Depth_Model').find((x) => +x.Level === depth);
  const base = d['Movement Pattern'].replace(/ Pattern$/, '').toLowerCase();
  const am = T('Anatomy_Map').find((a) => a['Base movement'].toLowerCase() === base) || T('Anatomy_Map').find((a) => base && a['Base movement'].toLowerCase().startsWith(base.split(' ')[0]));
  const fits = phasesFor(d.Goal, depth);
  const ladder = [['Regression', d['Regression (Easier)']], ['This exercise', d['Exercise Name']], ['Standard', d['Standard Progression']], ['Advanced', d['Advanced Progression']], ['Elite', d['Elite / Expertised Variation']], ['Complex', d['Complex / Combination Progression']]];
  det.innerHTML = `<div class="rd">
    <div><div class="tr-crumb">${esc(d['Source Library'])} · ${esc(d['Exercise ID'])} · workbook row ${id}</div><h2 style="text-transform:none;font-size:17px;color:var(--text);margin:2px 0 6px">${esc(d['Exercise Name'])}</h2>
      <div class="links-row"><span class="pill acc">${esc(d.Goal)}</span><span class="pill">${esc(d.Region)}</span><span class="pill">${esc(d['Equipment Class'])}</span><span class="pill" title="${esc(d['Depth Reasoning (superficial → deep)'])}"><span class="depth">${[1, 2, 3, 4, 5, 6].map((i) => `<i class="${i <= depth ? 'on' : ''}"></i>`).join('')}</span> ${esc(d['Depth Level'])}</span></div></div>
    <div class="rd-sec"><h4>Prescription</h4>${kv(d, ['Modality / Equipment', 'Position / Grip / Stance', 'Loading Strategy', 'Tempo', 'Sets × Reps', 'Load / Intensity', 'RPE', 'Rest', 'Frequency', 'Load Ref (1RM)', 'Load Factor'])}</div>
    <div class="rd-sec"><h4>Progression ladder: easier → elite</h4><div class="prog">${ladder.map(([k, v], i) => `<div style="--i:${i}" class="${i === 1 ? 'cur' : ''}"><b>${k}</b>${esc(v || '—')}</div>`).join('')}</div></div>
    <div class="rd-sec"><h4>Muscles</h4>${kv(d, ['Primary Muscle(s)', 'Secondary Muscle(s)', 'Primary Intent (Biomechanical)'])}
      <div class="links-row" style="margin-top:6px">${mus.length ? `<button class="primary small" id="ex-3d">Show ${mus.length} muscles on the 3D body</button>` : '<span class="mini">No 3D mesh for these muscle words (BodyParts3D has 258 muscles; see Validation).</span>'}${am ? `<a class="ghost-btn" href="${href('anatomy', am['Base movement'])}">Anatomy map: ${esc(am['Base movement'])}</a><button class="ghost-btn" id="ex-studio">▶ Animate ${esc(am['Base movement'])} (Motion Lab 4D)</button>` : ''}</div></div>
    <div class="rd-sec"><h4>Use in rehab and in S&amp;C</h4>${kv(d, ['Physio Application', 'S&C Application', 'Movement Prerequisite'])}</div>
    <div class="rd-sec"><h4>Technique and safety</h4>${kv(d, ['Cues / Technique Focus', 'Common Errors', 'Contraindications', 'Notes'])}</div>
    <div class="rd-sec"><h4>Joint angles and ROM</h4>${kv(d, ['Joint Angles (Start → Mid-Range → End Position)', 'Multi-Joint Involvement & What Is Targeted at Each Angle', 'Ideal Angle, Variation Opportunities & Muscle Bias by Angle', 'ROM Standards, Measurement & Testing Criteria'])}</div>
    <div class="rd-sec"><h4>Visual and coaching</h4>${kv(d, ['Visual Description (for illustration / coaching)', 'Image Prompt Pose Family', 'Reference Diagram File', 'Video Search Reference'])}</div>
    <div class="rd-sec"><h4>Connections</h4>
      <p class="mini" style="margin:0 0 6px">Fits phases (goal ${esc(d.Goal)} allowed and depth L${depth} inside the band): ${fits.map((p) => `<a class="lk" href="${href('phases', p)}" style="color:${STAGE_COL[p[0]]}">${p}</a>`).join(' · ') || 'none'}</p>
      ${dm ? `<p class="mini" style="margin:0 0 6px"><b>${esc(dm.Name)}</b>: ${esc(dm['What it means'])} Entry: ${esc(dm['Entry requirement'])}</p>` : ''}
      ${ls ? `<p class="mini" style="margin:0 0 6px"><b>Loading strategy ${esc(ls['Loading strategy'])}</b>: used by ${fmt(+ls['Exercises using it'])} exercises · typical ${esc(ls['Typical sets x reps'])}, tempo ${esc(ls['Typical tempo'])}, RPE ${esc(ls['Typical RPE'])}, rest ${esc(ls['Typical rest'])}</p>` : ''}
      <div id="ex-variants" class="mini">Loading variants of ${esc(d['Base Exercise'])}…</div></div>
    <p class="fine">Exercise content is your workbook's, shown as written. The 3D view lights the textbook muscles named here; it is not a measure of activation.</p></div>`;
  $('#ex-studio')?.addEventListener('click', () => openStudio(am['Base movement']));
  $('#ex-3d')?.addEventListener('click', () => show3D(mus, `${d['Exercise Name']}: ${prim.length} primary + ${mus.length - prim.length} secondary`));
  const v = await api('table', { t: 'Exercise_Library', f: { 'Base Exercise': d['Base Exercise'] }, lim: 80, cols: ['Exercise Name', 'Loading Strategy', 'Equipment Class', 'Depth (1-6)'] });
  $('#ex-variants').innerHTML = `<b>${fmt(v.total)} variants of the base exercise “${esc(d['Base Exercise'])}”</b> (same base, different loading strategy / equipment):
    <div class="chips" style="margin-top:6px">${v.rows.map((x) => `<button class="chip-btn ${x[0] === id ? 'on' : ''}" data-r="${x[0]}" title="${esc(x[2])} · L${esc(x[4])}">${esc(x[2] || x[1])}</button>`).join('')}</div>`;
  $('#ex-variants').querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => openEx(+b.dataset.r)));
}

// ================================================================= 8D COMBINATION LAB
const AX = ['Component', 'Intent / contraction', 'Kinetic chain', 'Lever', 'Gravity / vector', 'Stance / base', 'Plane', 'Equipment class'];
const C8 = { rows: null, sel: {}, axes: AX.slice(), seed: 1 };

async function combo(main) {
  main.innerHTML = `${header('8D combination lab', `Every generated combination in your Generated_Library placed in 8 dimensions at once (component, intent, kinetic chain, lever, gravity vector, stance, plane, equipment). Click values on any axis to slice the space. The generator below builds new combinations with the workbook's own Combo_Dimensions rules.`, 'Library')}
    <section class="card"><div class="card-h"><h2>8-dimension space</h2><span class="links-row"><small id="c8-n"></small><button class="ghost-btn" id="c8-clear">Clear selection</button></span></div>
      <div id="c8-pc"><p class="muted">Loading ${fmt(S.B.stats.tables.Generated_Library)} combinations…</p></div>
      <p class="fine">Each line is one combination crossing the 8 axes. Bright lines match every selected value; the rest fade. Axis order can be changed: drag is not needed, use the axis menus.</p>
      <div class="bar" id="c8-axes"></div></section>
    <div class="split"><section class="card"><div class="card-h"><h2>Matching combinations</h2></div><div class="tt-wrap" id="c8-list" style="max-height:520px"></div></section>
      <section class="card sticky" id="c8-detail"><p class="muted">Pick a combination.</p></section></div>
    <section class="card" id="gen"></section>`;
  if (!C8.rows) {
    const n = S.B.stats.tables.Generated_Library, cols = S.B.big.Generated_Library.cols, out = [];
    for (let off = 0; off < n; off += 500) { const r = await api('table', { t: 'Generated_Library', off, lim: 500 }); out.push(...r.rows.map((x) => { const o = { __row: x[0] }; r.cols.forEach((c, i) => { o[c] = x[i + 1]; }); return o; })); }
    C8.rows = out.filter((x) => x.ID); void cols;
  }
  $('#c8-clear').onclick = () => { C8.sel = {}; drawPC(); };
  $('#c8-axes').innerHTML = C8.axes.map((a, i) => `<label>axis ${i + 1}<select class="tr-sel" data-ax="${i}">${['Component', 'Goal', 'Region group', 'Base movement', 'Intent / contraction', 'Kinetic chain', 'Lever', 'Gravity / vector', 'Stance / base', 'Plane', 'Equipment class', 'Equipment', 'Modifier', 'Mindset / focus', 'Skill type', 'Environment', 'Depth (1-6)'].map((o) => `<option ${o === a ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`).join('');
  $('#c8-axes').querySelectorAll('[data-ax]').forEach((s) => (s.onchange = () => { C8.axes[+s.dataset.ax] = s.value; C8.sel = {}; drawPC(); }));
  drawPC();
  generator();
}

function matches(r) { return Object.entries(C8.sel).every(([a, vs]) => !vs.size || vs.has(r[a])); }
function drawPC() {
  const rows = C8.rows, ax = C8.axes, W = 1100, H = 430, top = 30, bot = 20, xs = ax.map((_, i) => 70 + (i * (W - 220)) / (ax.length - 1));
  const vals = ax.map((a) => { const c = {}; rows.forEach((r) => { c[r[a]] = (c[r[a]] || 0) + 1; }); return Object.entries(c).sort((x, y) => (a === 'Depth (1-6)' ? x[0] - y[0] : y[1] - x[1])); });
  const ypos = vals.map((vs) => { const m = {}, n = vs.length; vs.forEach(([v], j) => { m[v] = top + ((H - top - bot) * (j + 0.5)) / n; }); return m; });
  const hit = rows.filter(matches), any = Object.values(C8.sel).some((s) => s.size);
  const colorOf = (r) => PAL[['MOB', 'ACT', 'STR', 'PWR', 'CON'].indexOf(r.Component) % PAL.length] || '#6fd3ff';
  const line = (r) => ax.map((a, i) => `${i ? 'L' : 'M'}${xs[i]},${ypos[i][r[a]]}`).join(' ');
  const bg = any ? rows.filter((r) => !matches(r)) : [];
  $('#c8-pc').innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}">
    ${bg.slice(0, 1500).map((r) => `<path d="${line(r)}" fill="none" stroke="#4a5d78" stroke-opacity="0.08"/>`).join('')}
    ${(any ? hit : rows).slice(0, 2500).map((r) => `<path d="${line(r)}" fill="none" stroke="${colorOf(r)}" stroke-opacity="${any ? 0.5 : 0.09}" stroke-width="${any ? 1.2 : 1}"/>`).join('')}
    ${ax.map((a, i) => `<line class="ax" x1="${xs[i]}" y1="${top}" x2="${xs[i]}" y2="${H - bot}"/><text x="${xs[i]}" y="16" text-anchor="middle" style="font-weight:650;fill:#dcecff">${esc(a)}</text>
      ${vals[i].map(([v, n]) => { const on = C8.sel[a]?.has(v); return `<g class="day-cell" data-a="${esc(a)}" data-v="${esc(v)}" data-tip="${esc(a)}: <b>${esc(v)}</b> · ${n} combinations"><rect x="${xs[i] - 4}" y="${ypos[i][v] - 4}" width="8" height="8" rx="2" fill="${on ? '#ffc067' : '#dcecff'}"/>
        <text x="${xs[i] + (i === ax.length - 1 ? -8 : 8)}" y="${ypos[i][v] + 3}" text-anchor="${i === ax.length - 1 ? 'end' : 'start'}" font-size="9" style="fill:${on ? '#ffc067' : '#9fb3cc'}">${esc(String(v).slice(0, 26))}</text></g>`; }).join('')}`).join('')}</svg>
    <div class="legend">${['MOB', 'ACT', 'STR', 'PWR', 'CON'].map((c, i) => `<span><i style="background:${PAL[i]}"></i>${c}</span>`).join('')}</div>`;
  bindTips($('#c8-pc'));
  $('#c8-pc').querySelectorAll('[data-a]').forEach((g) => (g.onclick = () => { const s = (C8.sel[g.dataset.a] ||= new Set()); s.has(g.dataset.v) ? s.delete(g.dataset.v) : s.add(g.dataset.v); drawPC(); }));
  $('#c8-n').textContent = `${fmt(hit.length)} of ${fmt(rows.length)} combinations`;
  $('#c8-list').innerHTML = `<table class="tt"><thead><tr><th>Combination</th><th>Component</th><th>Depth</th><th>Fits phases</th><th>Trial</th></tr></thead><tbody>${hit.slice(0, 300).map((r) => `<tr class="click" data-id="${r.__row}"><td>${esc(r['Exercise (generated)'])}</td><td>${esc(r.Component)}</td><td class="num">${esc(r['Depth (1-6)'])}</td><td class="mini">${esc(r['Fits phases'])}</td><td class="mini">${esc(r["TRIAL RESULT (Worked / Didn't / Pain / Keep)"] || 'untried')}</td></tr>`).join('')}</tbody></table>${hit.length > 300 ? `<p class="fine">First 300 of ${fmt(hit.length)} shown; narrow the selection.</p>` : ''}`;
  $('#c8-list').querySelectorAll('[data-id]').forEach((tr) => (tr.onclick = () => comboDetail(C8.rows.find((r) => r.__row === +tr.dataset.id))));
}

function comboDetail(r) {
  const mus = musclesFor(`${r['Prime movers (agonists)']}; ${r.Synergists}`);
  $('#c8-detail').innerHTML = `<div class="rd"><div><div class="tr-crumb">${esc(r.ID)} · ${esc(r.Batch)} · planner key ${esc(r['Planner key'])}</div><h2 style="text-transform:none;font-size:16px;color:var(--text);margin:2px 0 6px">${esc(r['Exercise (generated)'])}</h2>
    <div class="links-row"><span class="pill acc">${esc(r.Component)} · ${esc(r.Goal)}</span><span class="pill">depth L${esc(r['Depth (1-6)'])}</span><span class="pill">${esc(r['Sets x reps'])}</span>${r['Duplicate check (auto)'] ? `<span class="pill warn">${esc(r['Duplicate check (auto)'])}</span>` : ''}</div></div>
    <div class="rd-sec"><h4>The 8+ dimensions</h4>${kv(r, ['Region', 'Base movement', 'Intent / contraction', 'Kinetic chain', 'Lever', 'Gravity / vector', 'Stance / base', 'Plane', 'Equipment', 'Modifier', 'Mindset / focus', 'Skill type', 'Environment', 'Fits phases'])}</div>
    <div class="rd-sec"><h4>Alternatives</h4>${kv(r, ['Alt A — easier, same goal', 'Alt B — equipment swap', 'Alt C — position/plane variation'])}</div>
    <div class="rd-sec"><h4>Why</h4>${kv(r, ['Physiotherapy justification', 'S&C justification', 'Cautions'])}</div>
    <div class="rd-sec"><h4>Anatomy: loaded · activated · trained</h4>${kv(r, ['Prime movers (agonists)', 'Synergists', 'Stabilisers / co-contractors (incl. stance, plane, equipment, modifier)', 'Tendons loaded → how', 'Ligaments / capsule / fascia stressed', 'Joint angles & range', 'Body position & line of force', 'Muscles involved (count)', 'Anatomy explanation: loaded · activated · trained · why'])}
      ${mus.length ? `<button class="primary small" id="c8-3d" style="margin-top:6px">Show ${mus.length} muscles on the 3D body</button>` : ''} <button class="ghost-btn" id="c8-studio" style="margin-top:6px">▶ Animate ${esc(r['Base movement'])} (Motion Lab 4D)</button></div>
    <div class="rd-sec"><h4>Your trial</h4>${kv(r, ["TRIAL RESULT (Worked / Didn't / Pain / Keep)", 'Rating 1-5', 'Notes'])}<p class="mini">Untried unless a result is written in the workbook.</p></div></div>`;
  $('#c8-3d')?.addEventListener('click', () => show3D(mus, r['Exercise (generated)']));
  $('#c8-studio').onclick = () => openStudio(r['Base movement'], ({ Supine: 'supine', 'Prone / plank position': 'prone', 'Side-lying': 'side_r', Seated: 'seated', Quadruped: 'quadruped', 'Half-kneeling': 'halfkneel', 'Tall-kneeling': 'kneeling' })[r['Stance / base']]);
}

// ---- generator: the workbook's Combo_Dimensions rules (allowed lists per base movement, intents per component)
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const list = (s) => String(s || '').split('|').filter(Boolean);
function generator() {
  const D = T('Combo_Dimensions'), dim = (k) => D.filter((r) => r.Dimension === k);
  const goalOf = {}; C8.rows.forEach((r) => { goalOf[r.Component] ||= {}; goalOf[r.Component][r.Goal] = (goalOf[r.Component][r.Goal] || 0) + 1; });
  const g = $('#gen');
  g.innerHTML = `<div class="card-h"><h2>Generator: roll a new coherent combination</h2><small>rules from Combo_Dimensions · nothing is written to the workbook</small></div>
    <div class="bar"><label>Region group <select class="tr-sel" id="g-rg">${['Lower', 'Upper', 'Core', 'Total'].map((x) => `<option>${x}</option>`).join('')}</select></label>
      <label>Component <select class="tr-sel" id="g-c">${['MOB', 'ACT', 'STR', 'PWR', 'CON'].map((x) => `<option>${x}</option>`).join('')}</select></label>
      <label>Base <select class="tr-sel" id="g-b"><option value="">random</option></select></label>
      <label>Seed <input class="tr-in" id="g-seed" type="number" value="${C8.seed}" style="width:90px"></label>
      <button class="primary small" id="g-roll">Roll 6</button></div><div id="g-out" class="cardlist" style="margin-top:10px"></div>`;
  const fillBase = () => { const rg = $('#g-rg').value, c = $('#g-c').value; $('#g-b').innerHTML = '<option value="">random</option>' + dim(`Base-${rg}`).filter((b) => list(b['Extra (|components| / class / sets x reps)']).includes(c)).map((b) => `<option>${esc(b.Option)}</option>`).join(''); };
  $('#g-rg').onchange = fillBase; $('#g-c').onchange = fillBase; fillBase();
  const roll = () => {
    const rg = $('#g-rg').value, comp = $('#g-c').value, seed = +$('#g-seed').value || 1, R = rng(seed), pick = (xs) => xs[Math.floor(R() * xs.length)];
    const bases = dim(`Base-${rg}`).filter((b) => list(b['Extra (|components| / class / sets x reps)']).includes(comp) && (!$('#g-b').value || b.Option === $('#g-b').value));
    const out = [];
    for (let k = 0; k < 6 && bases.length; k++) {
      const b = pick(bases);
      const intents = list(b[`Intents: ${comp}`]).length ? list(b[`Intents: ${comp}`]) : dim(`Intent-${comp}`).map((x) => x.Option);
      const opt = (dname, allowed) => { const xs = dim(dname).filter((x) => !allowed.length || allowed.includes(x.Option)); return xs.length ? pick(xs) : null; };
      const want = pick(intents), it = dim(`Intent-${comp}`).find((x) => x.Option === want) || dim(`Intent-${comp}`).find((x) => want && x.Option.startsWith(want.split(' (')[0])) || pick(dim(`Intent-${comp}`));
      const st = opt('Stance / base', list(b['Allowed stances / minds'])), eq = opt('Equipment', list(b['Allowed equipment'])), gv = opt('Gravity / vector', list(b['Allowed gravity'])),
        ch = opt('Kinetic chain', list(b['Allowed chains'])), pl = opt('Plane', list(b['Allowed planes'])), lv = b['Lever applies (Y/N)'] === 'Y' ? opt('Lever', []) : dim('Lever').find((x) => x.Option === 'Medium lever'),
        md = opt('Modifier', []), mf = opt('Mindset / focus', []), sk = opt('Skill type', []), en = opt('Environment', []);
      const parts = [it, st, eq, gv, ch, pl, lv, md, mf, sk, en].filter(Boolean);
      const depth = Math.max(1, Math.min(6, Math.round((+it?.['Points (depth +/-; base depth for Intent)'] || 1) + parts.slice(1).reduce((a, x) => a + (+x['Points (depth +/-; base depth for Intent)'] || 0), 0))));
      const goal = Object.entries(goalOf[comp] || {}).sort((a, b2) => b2[1] - a[1])[0]?.[0] || '';
      const fits = T('Phase_System').filter((p) => p['Allowed Goals (auto filter)'].includes(`|${goal}|`) && depth >= +p['Depth Min'] && depth <= +p['Depth Max']).map((p) => p.Code);
      const name = `${st?.Option || ''} ${b.Option.toLowerCase()} — ${eq?.Option || ''}${md && md.Option !== 'none' ? ` ${md.Option}` : ''} · ${it?.Option || ''}${lv && lv.Option !== 'Medium lever' ? `, ${lv.Option.toLowerCase()}` : ''}${gv && gv.Option !== 'Against gravity' ? `, ${gv.Option.toLowerCase()}` : ''}`;
      const exists = C8.rows.find((r) => r['Exercise (generated)'].toLowerCase() === name.toLowerCase());
      out.push({ name, b, parts, depth, goal, fits, exists, sets: it?.['Extra (|components| / class / sets x reps)'], cautions: parts.map((x) => x.Caution).filter(Boolean) });
    }
    $('#g-out').innerHTML = out.map((o) => `<div class="card"><h4>${esc(o.name)}</h4><div class="links-row"><span class="pill acc">${comp} · ${esc(o.goal)}</span><span class="pill">depth L${o.depth}</span><span class="pill">${esc(o.sets || '')}</span>${o.exists ? `<span class="pill ok">already in your library (${esc(o.exists.ID)})</span>` : '<span class="pill warn">new · untried</span>'}</div>
      <p class="mini">Fits phases: ${o.fits.map((p) => `<a class="lk" href="${href('phases', p)}">${p}</a>`).join(' ') || 'none (depth outside every band for this goal)'}</p>
      <p class="mini"><b>Physio</b>: ${esc([o.b['Physiotherapy rationale'], ...o.parts.slice(0, 3).map((x) => x['Physiotherapy rationale'])].filter(Boolean).join('; '))}</p>
      <p class="mini"><b>S&amp;C</b>: ${esc([o.b['S&C rationale'], ...o.parts.slice(0, 3).map((x) => x['S&C rationale'])].filter(Boolean).join('; '))}</p>
      ${o.cautions.length ? `<p class="mini" style="color:var(--warn)">⚠ ${esc(o.cautions.join('; '))}</p>` : ''}
      <a class="ghost-btn" href="${href('anatomy', o.b.Option)}">Anatomy of ${esc(o.b.Option)}</a> <button class="ghost-btn" data-studio="${esc(o.b.Option)}">▶ Animate</button></div>`).join('') || '<p class="muted">No base movement for this region group allows that component.</p>';
    $('#g-out').querySelectorAll('[data-studio]').forEach((x) => (x.onclick = () => openStudio(x.dataset.studio)));
    C8.seed = seed;
  };
  $('#g-roll').onclick = () => { roll(); $('#g-seed').value = +$('#g-seed').value + 1; };
  roll();
}

// ================================================================= PROGRAMS
async function programs(main, args) {
  const P = T('Program_Library'), cats = [...new Set(P.map((p) => p.Category))];
  const sel = P.find((p) => p.ID === args[0]) || P[0];
  main.innerHTML = `${header('Programs', `${P.length} core programs (warm-up to game) from Program_Library, each expanded by equipment × level × block into ${fmt(S.B.stats.tables.Program_Variants)} variants (Program_Variants), with doses (Program_Dose) and equipment-specific drills (Equipment_Drills).`, 'Library')}
    <div class="split"><section class="card"><div class="chips" id="pg-cats">${cats.map((c) => `<button class="chip-btn" data-c="${esc(c)}">${esc(c)} <small>${P.filter((p) => p.Category === c).length}</small></button>`).join('')}</div>
      <div class="tt-wrap" style="margin-top:8px;max-height:640px"><table class="tt"><thead><tr><th>ID</th><th>Program</th><th>Target</th><th>Evidence</th><th>Variants</th></tr></thead><tbody id="pg-list"></tbody></table></div></section>
      <section class="card sticky" id="pg-detail"></section></div>
    <section class="card"><div class="card-h"><h2>Equipment drills: equipment × pattern</h2><small>${T('Equipment_Drills').length} drills, 3 blocks each</small></div><div id="eqd"></div></section>`;
  let cat = null;
  const list = () => { $('#pg-list').innerHTML = P.filter((p) => !cat || p.Category === cat).map((p) => `<tr class="click ${p.ID === sel.ID ? 'on' : ''}" data-id="${esc(p.ID)}"><td class="mono">${esc(p.ID)}</td><td><b>${esc(p.Program)}</b><div class="mini">${esc(p.Category)} · ${esc(p.Quality)}</div></td><td class="mini">${esc(p['Target / condition / sport'])}</td><td>${ev(p['Evidence level'])}</td><td class="num">${esc(p['Variants generated (auto)'])}</td></tr>`).join('');
    $('#pg-list').querySelectorAll('[data-id]').forEach((tr) => (tr.onclick = () => go('programs', tr.dataset.id))); };
  $('#pg-cats').querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { cat = cat === b.dataset.c ? null : b.dataset.c; $('#pg-cats').querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('on', x.dataset.c === cat)); list(); }));
  list();
  const v = await api('table', { t: 'Program_Variants', f: { 'Program ID': sel.ID }, lim: 500 });
  const V = v.rows.map((x) => Object.fromEntries(v.cols.map((c, i) => [c, x[i + 1]])));
  const eqs = [...new Set(V.map((x) => x.Equipment))], lb = [...new Set(V.map((x) => `${x.Level}|${x.Block}`))].sort();
  $('#pg-detail').innerHTML = `<div class="rd"><div><div class="tr-crumb">${esc(sel.ID)} · ${esc(sel.Category)} · ${esc(sel.Status)}</div><h2 style="text-transform:none;font-size:17px;color:var(--text);margin:2px 0 6px">${esc(sel.Program)}</h2>${ev(sel['Evidence level'])}</div>
    <div class="rd-sec"><h4>Program</h4>${kv(sel, ['Target / condition / sport', 'Quality', 'Levels', 'Pattern 1', 'Pattern 2', 'Pattern 3', 'Original equipment', 'Duration × frequency', 'Progression structure', 'Session template', 'Advance when', 'Regress / stop when', 'Evidence source', 'Trial verdict (auto)'])}</div>
    <div class="rd-sec"><h4>Variant matrix: equipment × level · block (${V.length})</h4><div class="tt-wrap" style="max-height:340px"><table class="tt"><thead><tr><th>Equipment</th>${lb.map((k) => `<th>${esc(k.replace('|', ' · '))}</th>`).join('')}</tr></thead><tbody>
      ${eqs.map((e) => `<tr><td><b>${esc(e)}</b></td>${lb.map((k) => { const x = V.find((y) => y.Equipment === e && `${y.Level}|${y.Block}` === k); return `<td>${x ? `<a class="lk" href="#" data-v="${esc(x['Variant ID'])}">${esc(x['Variant ID'].split('-').pop())}</a>` : ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div></div>
    <div class="rd-sec" id="pg-var"><p class="mini">Click a cell for the variant's drills, dose and rules.</p></div>
    <div class="rd-sec"><h4>Dose for ${esc(sel.Quality)}</h4>${kv(Object.fromEntries(T('Program_Dose').filter((d) => d.Key.startsWith(`${sel.Quality}|`)).map((d) => [d.Key.split('|')[1], `${d['Dose / emphasis']}${d.Notes ? ` — ${d.Notes}` : ''}`])))}</div></div>`;
  $('#pg-detail').querySelectorAll('[data-v]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); const x = V.find((y) => y['Variant ID'] === a.dataset.v);
    $('#pg-var').innerHTML = `<h4>${esc(x['Variant ID'])} · ${esc(x['Level name'])} · ${esc(x['Block (weeks)'])}</h4>${kv(x, ['Equipment', 'Drill 1', 'Drill 2', 'Drill 3', 'Dose', 'How to do drill 1', 'Advance / stop', 'Evidence', 'Status'])}`; }));
  const ED = T('Equipment_Drills'), E1 = [...new Set(ED.map((x) => x.Equipment))], P1 = [...new Set(ED.map((x) => x.Pattern))];
  $('#eqd').innerHTML = `<div class="tt-wrap" style="max-height:420px"><table class="tt"><thead><tr><th>Equipment</th>${P1.map((p) => `<th>${esc(p)}</th>`).join('')}</tr></thead><tbody>${E1.map((e) => `<tr><td><b>${esc(e)}</b></td>${P1.map((p) => { const x = ED.find((y) => y.Equipment === e && y.Pattern === p);
    return `<td class="mini" ${x ? `data-tip="<b>${esc(x['Block 1 drill (wk 1-4)'])}</b><br>Set-up: ${esc(x['Set-up & execution (Block 1 drill)'])}<br>Cues: ${esc(x['Coaching cues'])}<br>⚠ ${esc(x['Common errors / safety'])}"` : ''}>${x ? `① ${esc(x['Block 1 drill (wk 1-4)'])}<br>② ${esc(x['Block 2 drill (wk 5-8)'])}<br>③ ${esc(x['Block 3 drill (wk 9-12)'])}` : ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
  bindTips($('#eqd'));
}

// ================================================================= DRILLS, GAMES, WARM-UPS
async function drills(main, args) {
  const G = T('Training_Games'), fams = T('Sport_Family_Groups').map((f) => f.Family);
  const gsel = G.find((g) => g['Game ID'] === args[0]) || G[0];
  main.innerHTML = `${header('Drills, games & warm-ups', `${G.length} training games × ${fams.length} sport families × ${T('Drill_Constraints').length} constraints × levels = ${fmt(S.B.stats.tables.Drill_Bank)} drills (Drill_Bank); ${fmt(S.B.stats.tables.Warmup_10min)} ten-minute warm-ups by sport, stage and day type; ${T('Clearance_Drills').length} clearance tests.`, 'Library')}
    <div class="split"><section class="card"><div class="card-h"><h2>Training games</h2></div><div class="tt-wrap" style="max-height:560px"><table class="tt"><thead><tr><th>Game</th><th>Type</th><th>Quality</th><th>Evidence</th></tr></thead><tbody>
      ${G.map((g) => `<tr class="click ${g['Game ID'] === gsel['Game ID'] ? 'on' : ''}" data-g="${esc(g['Game ID'])}"><td><b>${esc(g.Game)}</b><div class="mini">${esc(g['Game ID'])} · ${esc(g.Families)}</div></td><td>${esc(g.Type)}</td><td class="mini">${esc(g.Quality)}</td><td>${ev(g.Evidence)}</td></tr>`).join('')}</tbody></table></div></section>
      <section class="card sticky" id="gm"></section></div>
    <section class="card"><div class="card-h"><h2>10-minute warm-up builder</h2><small>Warmup_10min · 6 segments, clock-timed</small></div>
      <div class="bar"><label>Sport <select class="tr-sel" id="wu-s">${S.B.facets.Warmup_10min.Sport.map(([v]) => `<option>${esc(v)}</option>`).join('')}</select></label>
      <label>Phase <select class="tr-sel" id="wu-p">${T('Phase_System').map((p) => `<option>${esc(p.Code)}</option>`).join('')}</select></label>
      <label>Day type <select class="tr-sel" id="wu-d">${S.B.facets.Warmup_10min['Day type'].map(([v]) => `<option>${esc(v)}</option>`).join('')}</select></label></div><div id="wu" style="margin-top:10px"></div></section>
    <section class="card"><div class="card-h"><h2>Clearance drills (return-to-play tests)</h2></div><div class="tt-wrap" style="max-height:420px"><table class="tt"><thead><tr><th>ID</th><th>Test</th><th>Pass criterion</th><th>Red flag</th><th>Sports</th><th>Evidence</th></tr></thead><tbody>
      ${T('Clearance_Drills').map((c) => `<tr data-tip="${esc(c['How to do it'])}<br><i>Re-test: ${esc(c['When to re-test'])}</i>"><td class="mono">${esc(c.ID)}</td><td><b>${esc(c['Clearance drill / test'])}</b><div class="mini">${esc(c['Region / quality'])}</div>${(S.B.links.tests[c.ID] || []).map((t) => `<a class="lk mini" href="#" data-test="${esc(t.id)}">Tests &amp; labs: ${esc(t.name)}</a>`).join(' ')}</td><td class="mini">${esc(c['Pass criterion'])}</td><td class="mini" style="color:var(--warn)">${esc(c['Red flag'])}</td><td class="mini">${esc(c['Main sports'])}</td><td>${ev(c.Level)}<div class="mini">${esc(c.Evidence)}</div></td></tr>`).join('')}</tbody></table></div></section>`;
  bindTips(main);
  main.querySelectorAll('[data-test]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); import('./training.js').then((m) => m.openTestTab(a.dataset.test)); }));
  main.querySelectorAll('[data-g]').forEach((tr) => (tr.onclick = () => go('drills', tr.dataset.g)));
  const db = await api('table', { t: 'Drill_Bank', f: { 'Game ID': gsel['Game ID'] }, lim: 500 });
  const DB = db.rows.map((x) => Object.fromEntries(db.cols.map((c, i) => [c, x[i + 1]])));
  const ff = [...new Set(DB.map((x) => x.Family))], cc = [...new Set(DB.map((x) => x.Constraint))];
  $('#gm').innerHTML = `<div class="rd"><div><div class="tr-crumb">${esc(gsel['Game ID'])} · ${esc(gsel.Type)}</div><h2 style="text-transform:none;font-size:17px;color:var(--text);margin:2px 0 6px">${esc(gsel.Game)}</h2>${ev(gsel.Evidence)}</div>
    <div class="rd-sec"><h4>How it works</h4>${kv(gsel, ['Quality', 'Equipment', 'Players', 'How to play', 'Scoring', 'Progression', 'Safety'])}${/^\d{4}-\d\d-\d\d/.test(gsel.Players || '') ? '<p class="mini" style="color:var(--warn)">“Players” holds a date: the spreadsheet turned a typed range (e.g. 1-4) into a date. Kept as stored; see Validation.</p>' : ''}</div>
    <div class="rd-sec"><h4>Drill bank: family × constraint (${DB.length} drills)</h4><div class="tt-wrap" style="max-height:300px"><table class="tt"><thead><tr><th>Family</th>${cc.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${ff.map((f) => `<tr><td><b>${esc(f)}</b></td>${cc.map((c) => { const xs = DB.filter((d) => d.Family === f && d.Constraint === c);
      return `<td>${xs.map((x) => `<span class="pill" data-tip="<b>${esc(x.Drill)}</b><br>${esc(x.Dose)}<br>${esc(x['Progression & safety'])}">${esc(x.Level)}</span>`).join(' ')}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div></div>
    <div class="rd-sec"><h4>Constraints (how the problem changes)</h4>${kv(Object.fromEntries(T('Drill_Constraints').map((c) => [c.Constraint, c['What changes']])))}</div></div>`;
  bindTips($('#gm'));
  const wu = async () => {
    const r = await api('table', { t: 'Warmup_10min', f: { Sport: $('#wu-s').value, Phase: $('#wu-p').value, 'Day type': $('#wu-d').value }, lim: 5 });
    const x = r.rows[0] ? Object.fromEntries(r.cols.map((c, i) => [c, r.rows[0][i + 1]])) : null;
    if (!x) { $('#wu').innerHTML = '<p class="muted">No warm-up for this combination.</p>'; return; }
    const segs = [['0:00-2:00 Mobility', 2, '#64e6a8'], ['2:00-3:30 Activation & strength', 1.5, '#6fd3ff'], ['3:30-4:30 Loading hold (isometric)', 1, '#8fa8ff'], ['4:30-6:30 Dynamic movement', 2, '#b49bff'], ['6:30-8:30 Pre-game movement drills', 2, '#ffc067'], ['8:30-10:00 High-intensity clearance', 1.5, '#ff8fa3']];
    $('#wu').innerHTML = `<div class="tr-crumb">${esc(x['Warm-up ID'])} · ${esc(x.Family)} · stage ${esc(x.Stage)} · ${esc(x['Phase name'])}</div>
      <div class="timeline" style="margin:6px 0 10px">${segs.map(([k, m, c]) => `<div style="flex:${m};background:${c}" title="${esc(k)}">${esc(k.split(' ').slice(1).join(' '))}</div>`).join('')}</div>
      <div class="cardlist">${segs.map(([k, , c]) => `<div class="card" style="border-color:${c}55"><h4 style="color:${c}">${esc(k)}</h4><p class="mini" style="color:var(--text)">${esc(x[k])}</p></div>`).join('')}</div>
      <p class="mini"><b>Clearance rule</b>: ${esc(x['Clearance pass rule'])}</p><p class="mini" style="color:var(--warn)"><b>Red flags</b>: ${esc(x["Red flags (don't progress)"])}</p>`;
  };
  ['#wu-s', '#wu-p', '#wu-d'].forEach((id) => ($(id).onchange = wu)); wu();
}
void hbar;
