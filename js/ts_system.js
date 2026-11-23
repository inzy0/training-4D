// Training System: Validation, All sheets (raw grid + tables), Rules & sources, Profile & inputs (private).
import { S, T, api, post, refreshCompute, esc, fmt, go, href, header, kv, ring } from './training.js';

const $ = (s, r = document) => r.querySelector(s);
export async function page(p, main, args) {
  if (p === 'sync') return sync(main);
  if (p === 'validation') return validation(main);
  if (p === 'sheets') return sheets(main, args);
  if (p === 'rules') return rules(main);
  if (p === 'profile') return profile(main);
  main.innerHTML = '<p class="muted">Unknown page.</p>';
}
const KIND = {
  engine: ['Engine port', 'The app\'s planners re-run the workbook\'s own formulas; each check compares the app\'s result with the value the workbook saved.'],
  link: ['Links', 'IDs and names that point to another sheet resolve to a real row there.'],
  rules: ['Rules', 'Generated combinations re-checked against the allowed lists in Combo_Dimensions.'],
  drift: ['Drift', 'A stored or cached value disagrees with what the live formulas compute now.'],
  quality: ['Data quality', 'Duplicates and cells the spreadsheet changed (e.g. a range typed as 1-4 stored as a date).'],
  coverage: ['Coverage', 'How much of the workbook links out to the rest of the Anatomy Lab (3D muscles, Tests & labs, StatPearls chapters, atlas sports). Coverage gaps are limits of the match, not errors in the workbook.'],
};

// ================================================================= VALIDATION
async function validation(main) {
  const V = await fetch('/training-4D/rt/training_system/validation.json').then((r) => r.json());
  const by = V.summary.by_kind;
  main.innerHTML = `${header('Validation', `Real checks run by the build on ${esc(V.built)}: ${V.summary.passed} of ${V.summary.checks} pass. Every number is a count from the data, not rounded. Validation here means the app reproduces and links the workbook correctly; it does not validate the training content clinically.`, 'System')}
    <div class="kpis">${Object.entries(by).map(([k, [ok, n]]) => `<div class="kpi" style="--c:${ok === n ? '#64e6a8' : k === 'coverage' ? '#6fd3ff' : '#ffc067'};cursor:default"><b>${ok}/${n}</b><span>${esc(KIND[k]?.[0] || k)}</span><small>${esc(KIND[k]?.[1] || '')}</small></div>`).join('')}</div>
    ${[...new Set(V.checks.map((c) => c.group))].map((g) => `<section class="card"><div class="card-h"><h2>${esc(g)}</h2></div>${V.checks.filter((c) => c.group === g).map((c) => { const r = c.total ? c.ok / c.total : 1;
      return `<details class="rd-sec" style="margin-bottom:6px"><summary style="cursor:pointer;display:grid;grid-template-columns:70px 1fr 180px 120px;gap:10px;align-items:center"><span class="pill ${c.pass ? 'ok' : c.kind === 'coverage' ? 'acc' : 'warn'}">${c.pass ? 'PASS' : c.kind === 'coverage' ? 'PARTIAL' : 'FLAG'}</span><span><b>${esc(c.name)}</b> <span class="mini">· ${esc(KIND[c.kind]?.[0] || c.kind)}</span></span>
        <span class="vbar ${c.pass ? '' : 'bad'}"><i style="width:${(r * 100).toFixed(2)}%"></i></span><span class="mono" style="text-align:right">${fmt(c.ok)} / ${fmt(c.total)}</span></summary>
        ${c.detail ? `<p class="mini">${esc(c.detail)}</p>` : ''}${c.examples?.length ? `<p class="mini"><b>${c.pass ? 'Notes' : 'Examples'}</b> (up to 12):</p><ul class="mini" style="margin:0;padding-left:18px">${c.examples.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}</details>`; }).join('')}</section>`).join('')}
    <p class="fine">Source: data/anatomy_lab/training_system/validation.json, written by tools/training_system_build.py. Re-run the build after editing the workbook to refresh these numbers.</p>`;
}

// ================================================================= ALL SHEETS
const COL = (i) => { let s = ''; i += 1; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
async function sheets(main, args) {
  const SH = S.B.sheets, name = args[0];
  if (!name) {
    main.innerHTML = `${header(`All ${SH.length} sheets`, 'Every sheet of the workbook as it is: open one to read it cell by cell (rows and column letters as in the spreadsheet), or open the data tables extracted from it. Sheets marked private hold your personal inputs and stay on this machine.', 'System')}
      <section class="card"><div class="tt-wrap" style="max-height:none"><table class="tt"><thead><tr><th>Sheet</th><th>Title</th><th>Rows</th><th>Formulas</th><th>Tables in the app</th></tr></thead><tbody>${SH.map((s) => `<tr class="click" data-s="${esc(s.name)}"><td><b>${esc(s.name)}</b>${s.private ? ' <span class="pill warn">private</span>' : ''}</td><td class="mini">${esc(s.title)}<div>${esc(s.subtitle).slice(0, 140)}</div></td><td class="num">${fmt(s.n_rows)}</td><td class="num">${fmt(s.n_formulas)}</td><td class="mini">${s.tables.map((t) => `<a class="lk" href="${href('sheets', s.name, t)}">${esc(t)}</a>`).join(' · ')}</td></tr>`).join('')}</tbody></table></div></section>`;
    main.querySelectorAll('[data-s]').forEach((tr) => (tr.onclick = (e) => { if (e.target.closest('a')) return; go('sheets', tr.dataset.s); }));
    return;
  }
  const s = SH.find((x) => x.name === name); if (!s) { main.innerHTML = '<p class="muted">Unknown sheet.</p>'; return; }
  const tname = args[1];
  main.innerHTML = `${header(esc(s.name), `${esc(s.title)}${s.subtitle ? ` — ${esc(s.subtitle)}` : ''}`, `<a class="lk" href="${href('sheets')}">All sheets</a> · ${fmt(s.n_rows)} rows · ${fmt(s.n_formulas)} formulas${s.private ? ' · private' : ''}`)}
    <section class="card"><div class="chips"><a class="chip-btn ${!tname ? 'on' : ''}" href="${href('sheets', s.name)}" style="text-decoration:none">Sheet grid</a>${s.tables.map((t) => `<a class="chip-btn ${t === tname ? 'on' : ''}" href="${href('sheets', s.name, t)}" style="text-decoration:none">Table: ${esc(t)}</a>`).join('')}</div></section>
    <section class="card" id="sh"><p class="muted">Loading…</p></section>`;
  if (tname) return tableView(tname);
  const r = await api('raw', { s: s.name });
  if (!r.grid) { $('#sh').innerHTML = `<p class="muted">This sheet has ${fmt(s.n_rows)} rows, so it is read through its table${s.tables.length > 1 ? 's' : ''}: ${s.tables.map((t) => `<a class="lk" href="${href('sheets', s.name, t)}">${esc(t)}</a>`).join(', ')}.</p>`; return; }
  let shown = 400;
  const draw = () => { const g = r.grid.slice(0, shown), nc = Math.max(1, ...g.map(([, cs]) => (cs.length ? cs[cs.length - 1][0] + 1 : 0)));
    $('#sh').innerHTML = `<div class="tt-wrap" style="max-height:75vh"><table class="sheet-grid"><thead><tr><th></th>${Array.from({ length: nc }, (_, i) => `<th>${COL(i)}</th>`).join('')}</tr></thead><tbody>${g.map(([row, cs]) => { const m = Object.fromEntries(cs); return `<tr><td class="rn">${row}</td>${Array.from({ length: nc }, (_, i) => `<td>${esc(m[i] ?? '')}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div>
      ${r.grid.length > shown ? `<div class="pager">${fmt(shown)} of ${fmt(r.grid.length)} non-empty rows <button class="ghost-btn" id="sh-more">Show 400 more</button></div>` : ''}`;
    $('#sh-more')?.addEventListener('click', () => { shown += 400; draw(); }); };
  draw();
}
async function tableView(t) {
  let off = 0, q = '';
  const draw = async () => { const r = await api('table', { t, q, off, lim: 100 });
    $('#sh').innerHTML = `<div class="bar"><input class="tr-in" id="tv-q" style="flex:1" placeholder="Search this table" value="${esc(q)}"><span class="mini">${fmt(r.total)} rows · ${r.cols.length} columns · rowid = worksheet row</span></div>
      <div class="tt-wrap" style="max-height:72vh;margin-top:8px"><table class="tt"><thead><tr><th>row</th>${r.cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${r.rows.map((x) => `<tr><td class="num mini">${x[0]}</td>${x.slice(1).map((v) => `<td><div class="clip">${esc(v)}</div></td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <div class="pager">${fmt(off + 1)}–${fmt(Math.min(r.total, off + 100))} of ${fmt(r.total)} <button class="ghost-btn" id="tv-p" ${off ? '' : 'disabled'}>‹ Prev</button><button class="ghost-btn" id="tv-n" ${off + 100 < r.total ? '' : 'disabled'}>Next ›</button></div>`;
    let tm; $('#tv-q').oninput = (e) => { clearTimeout(tm); tm = setTimeout(() => { q = e.target.value; off = 0; draw().then(() => { const i = $('#tv-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 300); };
    $('#tv-p').onclick = () => { off = Math.max(0, off - 100); draw(); }; $('#tv-n').onclick = () => { off += 100; draw(); }; };
  draw();
}

// ================================================================= RULES & SOURCES
function rules(main) {
  const st = S.B.stats;
  const R = [
    ['Phase from tests', 'Phase_Gates', 'Each of 16 metrics takes a manual value, or an automatic % from two raw numbers (involved ÷ uninvolved × 100; sprint is baseline ÷ current; change of direction is |L − R| ÷ min × 100). A phase passes when every threshold set for it is met (blank = no condition); phases pass in order, and the last one passed is the automatic phase.'],
    ['Your phase', 'Athlete_Profile', 'A manual phase overrides the automatic one. In the workbook the auto and final cells hold typed values, so the app shows both: your saved phase and the phase the tests give.'],
    ['Days per phase', 'Day_Planner F8 · Full_Pathway', 'max(1, ROUND(Phase_Dose base days × the condition\'s healing factor)), Excel rounding (half away from zero). Phases follow one another from day 1; the total matches Conditions_Meta for all 52 conditions.'],
    ['Daily undulation', 'Full_Pathway E', 'Day in phase cycles Heavy → Medium → Light (×1, ×0.85, ×0.7 on sets, contacts and conditioning).'],
    ['Progressed dose', 'Day_Planner L · Full_Pathway H', 'Progress = (day in phase − 1) ÷ (phase days − 1). %1RM, contacts, conditioning, sport minutes, mobility and activation holds move linearly from the phase\'s start value to its end value (Phase_Dose). Stage 1 percentages are % MVC, later ones % 1RM.'],
    ['Option for each component', 'Day_Planner F', 'Primary unless you mark the day: Pain → Alt A (easier), No → Alt C, Unavailable → Alt B, Try new → the newest loop combination; readiness under 55 also switches to Alt A.'],
    ['Accelerators, games, recovery', 'Full_Pathway R–AD', 'Picked from Accelerator_Tree by stage band and day type, rotating by day number (accelerator k = (day × 7) mod n; game = the (day − 1) mod 5th base game plus a constraint (day × 3 − 1) mod n; recovery option rotates every 3 days).'],
    ['Readiness', 'Daily_Schedule F13', 'Mean of sleep, soreness, fatigue, stress and mood (1-5) × 20, minus 10 each for sleep under 7 h, HRV under 90% or CMJ under 92% of baseline, kept within 0-100. Green ≥ 75 (×1), amber ≥ 55 (×0.8), red (×0.5).'],
    ['Session builder', 'Session_Builder · Exercise_Library AU', 'From the 42,709 exercises: goal in the phase\'s allowed goals, depth within its band, optional region / category / name, equipment you have switched on; ranked by MOD(row × seed, 1,000,003), lowest first. Sets = phase sets × readiness modifier; load = your 1RM × load factor × phase %1RM when the exercise names a reference lift.'],
    ['1RM estimate', 'Athlete_Profile E', 'Epley: weight × (1 + reps ÷ 30), used when no tested 1RM is entered.'],
    ['Supplement dose', 'Supplements AB', 'Per-kg dose × your body mass when the sheet gives a per-kg dose; otherwise the fixed dose. Warnings when one of your health flags is listed for that product.'],
    ['Combinations', 'Combo_Dimensions · Generated_Library', 'A base movement allows certain stances, equipment, gravity vectors, chains, planes and intents per component; a combination is coherent only inside those lists. Depth = the intent\'s base depth + the other choices\' points, kept within L1-L6. All 2,457 stored combinations pass this check.'],
    ['Sport drill level', 'Full_Pathway J', 'Phase order maps to drill level 0,0,0,1,1,1,1,2,2,2,3,3,3,4,4,4,5,5,5,6,6,6 (0 = no sport work yet).'],
  ];
  main.innerHTML = `${header('Rules & sources', 'How the system decides, in plain words, with the sheet each rule comes from. The app runs these rules on the server (tools/training_engine.py) and the build checks them against the workbook\'s saved results.', 'System')}
    <section class="card"><div class="tt-wrap" style="max-height:none"><table class="tt"><thead><tr><th>Rule</th><th>From</th><th>What it does</th></tr></thead><tbody>${R.map(([a, b, c]) => `<tr><td><b>${esc(a)}</b></td><td class="mono mini">${esc(b)}</td><td>${esc(c)}</td></tr>`).join('')}</tbody></table></div></section>
    <div class="tr-grid"><section class="card s6"><div class="card-h"><h2>Where the data comes from</h2></div>${kv({
      Workbook: 'ALL_IN_ONE_EXERCISES_SYSTEM.xlsx (yours), copied to data/anatomy_lab/training_system/source/',
      'Sheets / rows / formulas': `${st.sheets} sheets · ${fmt(st.rows_total)} non-empty rows · ${fmt(st.formulas_total)} formula cells`,
      Built: S.B.built, 'Build script': 'tools/training_system_build.py', Engine: 'tools/training_engine.py (port of the workbook formulas)', 'App API': 'anatomy_lab/training_api.py → /api/ts/*',
      'Linked from the Anatomy Lab': '3D muscles: BodyParts3D (CC BY 4.0, DBCLS) · Tests & labs tab · StatPearls chapters in the Clinical tab (title search, for reading)',
      'Self-expanding loop': 'LOOP_SETUP / LOOP_ENGINE describe the workbook\'s scheduled generator in Google Sheets. The app reads its results (Generated_Library); it does not decode or run the stored generator code.' })}</section>
      <section class="card s6"><div class="card-h"><h2>Boundaries</h2></div><div class="note">Training and education. The content is your workbook's, shown as written; evidence grades are the workbook's own and are not re-graded here. Pathways describe conditions in general and are not a plan for a particular patient; injury care belongs with your clinician. Supplements: check with a sports physician or dietitian; prohibited substances are shown for awareness only.</div>
      <div class="note" style="margin-top:8px">Private: your profile (name, body, injury, tests, readiness, selections) is in data/anatomy_lab/training_system/profile.json on this machine. The public site export does not include the Training System.</div>
      <p class="mini">Rebuild after editing the workbook:<br><code>.venv\\Scripts\\python.exe -m tools.training_system_build "C:\\path\\to\\ALL_IN_ONE_EXERCISES_SYSTEM.xlsx"</code></p></section></div>`;
}

// ================================================================= PROFILE (private)
async function profile(main) {
  const P = S.prof, C = S.comp;
  main.innerHTML = `${header('Profile & inputs', 'Every input that drives loads, doses, phases and warnings. Saved only on this machine (profile.json). “Workbook values” brings back what the workbook held.', 'Command')}
    <div class="note warn">Private: personal and health details. Kept local; never published.</div>
    <div class="tr-grid"><section class="card s6"><div class="card-h"><h2>Identity & body</h2></div><div class="formgrid">${Object.entries(P.identity || {}).map(([k, v]) => `<label>${esc(k)}<input class="tr-in" data-id="${esc(k)}" value="${esc(v)}"></label>`).join('')}</div>
      <div class="card-h" style="margin-top:12px"><h2>Phase</h2></div><div class="bar"><label>Manual phase <select class="tr-sel" id="pf-ph"><option value="">auto from tests</option>${T('Phase_System').map((p) => `<option ${p.Code === P.manual_phase ? 'selected' : ''}>${esc(p.Code)}</option>`).join('')}</select></label><span id="pf-phase" class="mini"></span></div>
      <div class="card-h" style="margin-top:12px"><h2>Planner defaults</h2></div><div class="bar"><label>Condition <select class="tr-sel" id="pf-c">${T('Conditions_Meta').map((c) => `<option ${c.Condition === P.planner?.condition ? 'selected' : ''}>${esc(c.Condition)}</option>`).join('')}</select></label>
      <label>Sport <select class="tr-sel" id="pf-s">${T('Sports_Demands').map((s) => `<option ${s.Sport === P.planner?.sport ? 'selected' : ''}>${esc(s.Sport)}</option>`).join('')}</select></label><label>Seed <input class="tr-in" id="pf-seed" type="number" value="${esc(P.planner?.seed || 7919)}" style="width:90px"></label></div></section>
      <section class="card s6"><div class="card-h"><h2>Strength (1RM)</h2><small>tested, or estimated from a set (Epley)</small></div><table class="tt"><thead><tr><th>Lift</th><th>Tested kg</th><th>Set kg</th><th>Reps</th><th>Estimated</th><th>Final</th></tr></thead><tbody id="pf-l"></tbody></table>
      <div class="card-h" style="margin-top:12px"><h2>Health & eligibility flags</h2><small>drive supplement warnings</small></div><div class="formgrid">${Object.entries(P.flags || {}).map(([k, v]) => `<label>${esc(k)}<select class="tr-sel" data-flag="${esc(k)}"><option ${v === 'No' ? 'selected' : ''}>No</option><option ${v === 'Yes' ? 'selected' : ''}>Yes</option></select></label>`).join('')}</div></section>
      <section class="card s12"><div class="card-h"><h2>Equipment on hand</h2><small>switch off what you do not have: the session builder only picks from equipment that is on</small></div><div class="chips">${Object.entries(P.equipment || {}).map(([k, v]) => `<button class="chip-btn ${v === 'Yes' ? 'on' : ''}" data-eq="${esc(k)}">${esc(k)}</button>`).join('')}</div></section></div>
    <div class="bar"><button class="primary small" id="pf-save">Save</button><button class="ghost-btn" id="pf-wb">Workbook values</button><span class="mini" id="pf-msg">Last saved ${esc(P.saved || '—')} (${esc(P.origin || '')})</span></div>`;
  const lifts = () => { $('#pf-l').innerHTML = (C.lifts || []).map((l, i) => `<tr><td><b>${esc(l.lift)}</b></td>${['tested', 'weight', 'reps'].map((k) => `<td><input class="tr-in" style="width:70px" data-l="${i}" data-k="${k}" value="${esc(P.lifts[i][k] ?? '')}"></td>`).join('')}<td class="num">${esc(l.estimated ?? '')}</td><td class="num"><b>${esc(l.final)}</b></td></tr>`).join('');
    $('#pf-l').querySelectorAll('input').forEach((i) => (i.onchange = async () => { P.lifts[+i.dataset.l][i.dataset.k] = i.value; await refreshCompute(); Object.assign(C, S.comp); lifts(); })); };
  const ph = () => { $('#pf-phase').innerHTML = `in use: <b>${esc(S.comp.final_phase)}</b> · tests say <b>${esc(S.comp.gates.auto_phase)}</b>`; };
  lifts(); ph();
  main.querySelectorAll('[data-id]').forEach((i) => (i.oninput = () => { P.identity[i.dataset.id] = i.value; }));
  main.querySelectorAll('[data-flag]').forEach((i) => (i.onchange = () => { P.flags[i.dataset.flag] = i.value; }));
  main.querySelectorAll('[data-eq]').forEach((b) => (b.onclick = () => { const on = P.equipment[b.dataset.eq] === 'Yes'; P.equipment[b.dataset.eq] = on ? 'No' : 'Yes'; b.classList.toggle('on', !on); }));
  $('#pf-ph').onchange = async () => { P.manual_phase = $('#pf-ph').value; await refreshCompute(); ph(); };
  $('#pf-c').onchange = () => { (P.planner ||= {}).condition = $('#pf-c').value; }; $('#pf-s').onchange = () => { (P.planner ||= {}).sport = $('#pf-s').value; }; $('#pf-seed').onchange = () => { (P.planner ||= {}).seed = +$('#pf-seed').value; };
  $('#pf-save').onclick = async () => { try { const r = await post('profile', P); $('#pf-msg').textContent = `Saved ${r.saved} to data/anatomy_lab/training_system/profile.json`; } catch (e) { $('#pf-msg').textContent = e.message; } };
  $('#pf-wb').onclick = async () => { const w = await fetch('/training-4D/rt/training_system/profile_workbook.json').then((r) => r.json()); Object.keys(P).forEach((k) => delete P[k]); Object.assign(P, w); await refreshCompute(); profile(main); };
  void ring;
}

// ================================================================= SYNC & UPDATES
let syncTimer = null;
async function sync(main) {
  if (window.__STATIC_API) return syncPublic(main);
  const st = await fetch('/api/ts/sync/status').then((r) => r.json());
  const c = st.config, cur = st.current, v = cur.validation || {};
  main.innerHTML = `${header('Sync & updates', 'Keep this app in step with your workbook. Point it at your Google Sheet (or a local / Google Drive for desktop file), choose how often to check, or upload an .xlsx. When the workbook changes the app rebuilds itself, keeps the previous version and records exactly what changed. Your profile, athletes and logs are never touched by a rebuild.', 'System')}
    <div class="tr-grid"><section class="card s7"><div class="card-h"><h2>Source and schedule</h2><span class="pill ${st.busy ? 'warn' : c.enabled ? 'ok' : ''}">${st.busy ? 'rebuilding…' : c.enabled ? 'loop on' : 'loop off'}</span></div>
      <div class="formgrid"><label style="grid-column:1/-1">Google Sheets link or local .xlsx path<input class="tr-in" id="sy-src" value="${esc(c.source)}" placeholder="https://docs.google.com/spreadsheets/d/…  or  G:\\My Drive\\ALL_IN_ONE_EXERCISES_SYSTEM.xlsx"></label>
        <label>Check every (minutes)<input class="tr-in" id="sy-int" type="number" min="5" max="1440" value="${c.interval_min}"></label>
        <label>Automatic checks<select class="tr-sel" id="sy-on"><option value="1" ${c.enabled ? 'selected' : ''}>On</option><option value="0" ${!c.enabled ? 'selected' : ''}>Off</option></select></label></div>
      <div class="bar" style="margin-top:8px"><button class="primary small" id="sy-save">Save</button><button class="ghost-btn" id="sy-now">Check now</button><button class="ghost-btn" id="sy-force">Rebuild now</button>
        <label class="ghost-btn" style="cursor:pointer">Upload .xlsx<input type="file" id="sy-up" accept=".xlsx" hidden></label><span class="mini" id="sy-msg"></span></div>
      <p class="fine">A Google Sheet is read as an .xlsx export, which works while the sheet is shared "anyone with the link" (that also means anyone holding the link can open it; it contains your name and injury). A check that finds no change does nothing. The server runs the loop while it is running.</p>
      ${kv({ 'Last check': st.last_check || '—', 'Next check': st.next_check || (c.enabled ? 'after the first interval' : '—'), 'Current build': cur.built || '—', 'Checks passing': v.checks ? `${v.passed}/${v.checks}` : '—', 'Saved previous versions': st.versions.length ? st.versions.slice(0, 5).join(', ') : 'none yet' })}
      ${st.last_result ? `<div class="note ${st.last_result.ok === false ? 'warn' : ''}" style="margin-top:8px">Last result (${esc(st.last_result.ts)}): ${st.last_result.error ? esc(st.last_result.error) : st.last_result.changed ? `rebuilt from ${esc(st.last_result.origin)} in ${st.last_result.seconds} s` : 'no change in the workbook'}</div>` : ''}</section>
      <section class="card s5"><div class="card-h"><h2>Current tables</h2></div><div class="tt-wrap" style="max-height:420px"><table class="tt"><tbody>${Object.entries(cur.tables || {}).sort((x, y) => y[1] - x[1]).map(([k, n]) => `<tr><td>${esc(k)}</td><td class="num">${fmt(n)}</td></tr>`).join('')}</tbody></table></div></section>
      <section class="card s12"><div class="card-h"><h2>Update history</h2><small>data/anatomy_lab/training_system/sync_log.jsonl</small></div><div class="tt-wrap"><table class="tt"><thead><tr><th>When</th><th>From</th><th>Result</th><th>Checks before → after</th><th>Tables changed (rows before → after)</th></tr></thead><tbody>
        ${st.history.map((h) => `<tr><td class="mono mini">${esc(h.ts)}</td><td>${esc(h.origin)}</td><td>${h.error ? `<span class="pill bad">${esc(h.error)}</span>` : h.changed ? `<span class="pill ${h.ok ? 'ok' : 'bad'}">${h.ok ? 'rebuilt' : 'build failed'}</span> ${h.seconds} s` : 'no change'}</td>
          <td class="mini">${h.validation_before ? `${h.validation_before.passed ?? '—'}/${h.validation_before.checks ?? '—'} → ${h.validation_after?.passed ?? '—'}/${h.validation_after?.checks ?? '—'}` : ''}</td>
          <td class="mini">${h.table_changes ? Object.entries(h.table_changes).map(([k, [a, b]]) => `${esc(k)} ${a ?? 'new'} → ${b}`).join(' · ') || 'same row counts' : ''}${h.ok === false && h.build_tail ? `<details><summary>build output</summary><pre style="white-space:pre-wrap">${esc(h.build_tail)}</pre></details>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No updates yet.</td></tr>'}</tbody></table></div></section></div>`;
  const msg = (t) => { $('#sy-msg').textContent = t; };
  const post = (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
  $('#sy-save').onclick = async () => { const r = await post('/api/ts/sync/config', { source: $('#sy-src').value, interval_min: +$('#sy-int').value, enabled: $('#sy-on').value === '1' }); msg(r.ok ? 'Saved.' : r.error); sync(main); };
  $('#sy-now').onclick = async () => { const r = await post('/api/ts/sync/now', {}); msg(r.ok ? 'Checking… (a rebuild takes a minute or two)' : r.error); poll(main); };
  $('#sy-force').onclick = async () => { const r = await post('/api/ts/sync/now', { force: true }); msg(r.ok ? 'Rebuilding…' : r.error); poll(main); };
  $('#sy-up').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; msg(`Uploading ${f.name}…`); const r = await fetch('/api/ts/upload', { method: 'POST', body: f }).then((x) => x.json()); msg(r.ok ? 'Uploaded: rebuilding…' : r.error); poll(main); };
  if (st.busy) poll(main);
}
// Public site: the workbook copy is fixed (privacy-cleaned); syncing a workbook is part of the owner's local app.
async function syncPublic(main) {
  const v = await fetch('/training-4D/rt/training_system/validation.json').then((r) => r.json()).catch(() => ({}));
  const sum = v.summary || {}, n = Array.isArray(v.checks) ? v.checks.length : null, ok = Array.isArray(v.checks) ? v.checks.filter((c) => c.ok === true || c.pass === true || c.status === 'pass').length : null;
  const tables = Object.entries(S.B?.tables || {}).map(([k, t]) => [k, Array.isArray(t?.rows) ? t.rows.length : null]).filter(([, x]) => x != null).sort((a, b) => b[1] - a[1]);
  const acct = window.__ACCOUNT?.name;
  main.innerHTML = `${header('Sync & updates', 'This public site runs a fixed, privacy-cleaned copy of the training workbook in your browser.')}
    <div class="tr-grid"><section class="card s7"><div class="card-h"><h2>This copy</h2><span class="pill ok">public copy</span></div>
      ${kv({ 'Workbook build': v.built || S.B?.built || '—', 'Source': S.B?.source || '—', 'Checks': n ? `${ok}/${n}` : (sum.passed != null ? `${sum.passed}/${sum.checks}` : '—'), 'Where your own data lives': acct ? `your account (${esc(acct)}) in this browser` : 'this browser (guest)' })}
      <p class="fine">Linking a Google Sheet, uploading an .xlsx and the automatic update loop run in the owner's local app, where the workbook is rebuilt and validated on the owner's computer. They are not part of the public copy. Your own profile, athletes, sessions and plan overrides are saved as you use the pages; to keep them safe or move them to another device, use <b>Sign in → Export my data</b> in the header.</p></section>
      <section class="card s5"><div class="card-h"><h2>Tables in this copy</h2></div><div class="tt-wrap" style="max-height:420px"><table class="tt"><tbody>${tables.map(([k, x]) => `<tr><td>${esc(k)}</td><td class="num">${fmt(x)}</td></tr>`).join('')}</tbody></table></div></section></div>`;
}
function poll(main) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => { if (!location.hash.startsWith('#train/sync')) return; const st = await fetch('/api/ts/sync/status').then((r) => r.json()); if (st.busy) { const m = $('#sy-msg'); if (m) m.textContent = 'Rebuilding… (page refreshes when done)'; poll(main); } else { sync(main); } }, 4000);
}
