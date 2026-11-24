// Training System 4D: the owner's workbook ALL_IN_ONE_EXERCISES_SYSTEM.xlsx as a linked app.
// Data: data/anatomy_lab/training_system (tools/training_system_build.py). Planners, gates, readiness and the
// session builder run on the server (anatomy_lab/training_api.py -> tools/training_engine.py), a port of the
// workbook's own formulas that the build checks against the workbook's cached results (Validation page).
// Content is shown as the workbook states it; evidence grades are the workbook's. Education and training
// planning only: not a diagnosis and not for decisions about any patient.

const $ = (s, r = document) => r.querySelector(s);
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('en-GB') : esc(n));
export const S = { B: null, prof: null, comp: null, page: null, args: [], cache: new Map() };
const ICON = {
  dash: 'M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z', today: 'M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zm-2 8h14v10H5z',
  lib: 'M4 6h16v2H4zm0 5h16v2H4zm0 5h10v2H4z', combo: 'M12 2 2 7l10 5 10-5zm-10 10 10 5 10-5M2 17l10 5 10-5', prog: 'M3 3h18v4H3zm0 7h12v4H3zm0 7h7v4H3z',
  drill: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4 4 6-4 6-4-6z', path: 'M3 17l6-6 4 4 8-8M14 7h7v7', phase: 'M4 20h3V10H4zm6 0h3V4h-3zm6 0h3v-7h-3z',
  sport: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-7.5 9a7.5 7.5 0 0 1 15 0z', anat: 'M12 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm-5 7h10l-1 6h-2l-1 7h-2l-1-7H8z',
  atlas: 'M12 2 3 7v10l9 5 9-5V7zm0 3 6 3.5-6 3.5-6-3.5z', sci: 'M9 2h6v2h-1v5l5 9a2 2 0 0 1-2 3H7a2 2 0 0 1-2-3l5-9V4H9z', nutr: 'M12 3c4 0 7 3 7 7 0 6-7 11-7 11S5 16 5 10c0-4 3-7 7-7z',
  val: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z', sheet: 'M3 3h18v18H3zm2 4v4h6V7zm8 0v4h6V7zm-8 6v4h6v-4zm8 0v4h6v-4z', prof: 'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-5 0-9 2.5-9 5v3h18v-3c0-2.5-4-5-9-5z',
  src: 'M4 4h16v12H5.2L4 17.2zm3 4h10v2H7zm0 4h7v2H7z', sync: 'M12 4V1L8 5l4 4V6a6 6 0 0 1 6 6c0 1-.25 1.97-.7 2.8l1.46 1.46A8 8 0 0 0 12 4zm0 14a6 6 0 0 1-6-6c0-1 .25-1.97.7-2.8L5.24 7.74A8 8 0 0 0 12 20v3l4-4-4-4z', team: 'M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-2.7 0-8 1.3-8 4v3h16v-3c0-2.7-5.3-4-8-4zm8 0c-.3 0-.7 0-1.1.1 1.2.9 2.1 2.1 2.1 3.9v3h7v-3c0-2.7-5.3-4-8-4z',
};
const PAGES = [
  ['Command', [['dash', 'Dashboard', 'dash'], ['today', 'Today', 'today'], ['profile', 'Profile & inputs', 'prof']]],
  ['Team', [['team', 'Team dashboard', 'team'], ['athletes', 'Athletes & groups', 'prof'], ['staff', 'Staff', 'team'], ['audit', 'Audit log', 'src']]],
  ['Library', [['library', 'Exercise library', 'lib'], ['combo', '8D combination lab', 'combo'], ['programs', 'Programs', 'prog'], ['drills', 'Drills, games & warm-ups', 'drill']]],
  ['Pathway', [['pathway', 'Pathway 4D', 'path'], ['phases', 'Phases & gates', 'phase'], ['sports', 'Sports', 'sport']]],
  ['Builder', [['build-ex', 'Exercise builder', 'lib'], ['build-prog', 'Program builder', 'prog'], ['train-mode', 'Training mode', 'today'], ['theory', 'Theory & evidence', 'sci'], ['questions', 'Questions & trials', 'val'], ['bsheet', 'Builder ↔ workbook', 'sheet']]],
  ['Divisions', [['divisions', 'Training divisions', 'lib'], ['mixed', 'Mixed program builder', 'combo']]],
  ['Performance', [['sportbio', 'Sport biomechanics', 'sport'], ['transfer', 'Sport → sport transfer', 'combo'], ['player', 'Player development', 'prof'], ['trainings', 'Training ↔ training', 'phase'], ['insights', 'Interpretation & program', 'val'], ['squad', 'Squad learning', 'team']]],
  ['Knowledge', [['anatomy', 'Anatomy map', 'anat'], ['atlas', 'Knowledge atlas', 'atlas'], ['science', 'Science & methods', 'sci'], ['nutrition', 'Nutrition & substances', 'nutr']]],
  ['System', [['sync', 'Sync & updates', 'sync'], ['validation', 'Validation', 'val'], ['sheets', 'All sheets', 'sheet'], ['rules', 'Rules & sources', 'src']]],
];
const MOD = { 'build-ex': 'ts_builder', 'build-prog': 'ts_builder', 'train-mode': 'ts_builder', theory: 'ts_builder', questions: 'ts_builder', bsheet: 'ts_builder', divisions: 'ts_divisions', mixed: 'ts_divisions', sportbio: 'ts_sport', transfer: 'ts_sport', player: 'ts_sport', trainings: 'ts_sport', insights: 'ts_sport', squad: 'ts_sport', staff: 'ts_team', team: 'ts_team', athletes: 'ts_team', athlete: 'ts_team', audit: 'ts_team', library: 'ts_library', combo: 'ts_library', programs: 'ts_library', drills: 'ts_library', pathway: 'ts_pathway', phases: 'ts_pathway', sports: 'ts_pathway', today: 'ts_pathway',
  anatomy: 'ts_knowledge', atlas: 'ts_knowledge', science: 'ts_knowledge', nutrition: 'ts_knowledge', validation: 'ts_system', sync: 'ts_system', sheets: 'ts_system', rules: 'ts_system', profile: 'ts_system' };
export const STAGE_COL = { 1: '#64e6a8', 2: '#6fd3ff', 3: '#8fa8ff', 4: '#b49bff', 5: '#ffc067', 6: '#ff8fa3' };
export const PAL = ['#6fd3ff', '#b49bff', '#64e6a8', '#ffc067', '#ff8fa3', '#7cf0e0', '#f5e663', '#9fb6ff', '#ffa36b', '#d39bff', '#8ee07a', '#ff6bb5'];

// ---------------------------------------------------------------- data
export function T(name) {
  if (S.cache.has(name)) return S.cache.get(name);
  const t = S.B.tables[name]; if (!t) return [];
  const rows = t.rows.map((r) => { const o = { __row: r[0] }; t.cols.forEach((c, i) => { o[c] = r[i + 1]; }); return o; });
  S.cache.set(name, rows); return rows;
}
export async function api(route, params = {}) {
  const u = new URL(`/api/ts/${route}`, location.origin);
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : v); });
  const r = await fetch(u); const j = await r.json(); if (!r.ok) throw new Error(j.error || r.statusText); return j;
}
export async function post(route, body) {
  const r = await fetch(`/api/ts/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json(); if (!r.ok) throw new Error(j.error || r.statusText); return j;
}
export async function refreshCompute() { S.comp = await post('compute', S.prof); return S.comp; }

// ---------------------------------------------------------------- routing
export function go(page, ...args) { location.hash = `#train/${[page, ...args].map((x) => encodeURIComponent(x)).join('/')}`; }
export const href = (page, ...args) => `#train/${[page, ...args].map((x) => encodeURIComponent(x)).join('/')}`;
function parse() {
  const parts = location.hash.slice(1).split('/');
  if (parts[0] !== 'train') return null;
  return { page: decodeURIComponent(parts[1] || 'dash'), args: parts.slice(2).map(decodeURIComponent) };
}
let started = false;
export async function startTraining() {
  if (!started) {
    started = true;
    const actorBox = `<div class="rd-sec" style="margin:2px 4px 8px"><div class="mini">Acting as</div><select class="tr-sel" id="tr-actor" style="width:100%"><option value="">— choose who you are —</option></select></div>`;
    $('#tr-nav').innerHTML = actorBox + PAGES.map(([g, ps]) => `<h3>${g}</h3>` + ps.map(([id, label, ic]) => `<a href="${href(id)}" data-p="${id}"><svg viewBox="0 0 24 24"><path fill="currentColor" d="${ICON[ic]}"/></svg>${label}</a>`).join('')).join('');
    try {
      const [b, p] = await Promise.all([fetch('/training-4D/rt/training_system/bundle.json').then((r) => { if (!r.ok) throw new Error('bundle missing'); return r.json(); }), api('profile').catch(() => ({}))]);
      S.B = b; S.prof = p;
      await refreshCompute().catch(() => null);
    } catch (e) {
      $('#tr-main').innerHTML = `<section class="card"><h2>Training System</h2><p class="muted">The Training System data is not on this machine yet (${esc(e.message)}). Build it with<br><code>.venv\\Scripts\\python.exe -m tools.training_system_build "path\\to\\ALL_IN_ONE_EXERCISES_SYSTEM.xlsx"</code>, then reload. It runs locally only; the public site does not include it.</p></section>`;
      return;
    }
    window.addEventListener('hashchange', () => { const r = parse(); if (r) render(r); });
    const fillActor = () => fetch('/api/ath/staff').then((r) => r.json()).then((S) => { const sel = $('#tr-actor'); let cur = ''; try { cur = localStorage.getItem('ts-actor') || ''; } catch { /* ignore */ }
      sel.innerHTML = `<option value="">— choose who you are —</option>${S.staff.filter((x) => x.active).map((x) => `<option value="${x.id}" ${String(x.id) === cur ? 'selected' : ''}>${esc(x.name)} · ${esc(x.role)}</option>`).join('')}`;
      sel.onchange = () => { try { localStorage.setItem('ts-actor', sel.value); } catch { /* ignore */ } }; }).catch(() => {});
    window.__tsActorRefresh = fillActor; fillActor();
  }
  render(parse() || { page: 'dash', args: [] });
}

async function render({ page, args }) {
  if (!S.B) return;
  S.page = page; S.args = args;
  document.querySelectorAll('#tr-nav a').forEach((a) => a.classList.toggle('on', a.dataset.p === page));
  const main = $('#tr-main');
  window.__noteCtx = { hash: location.hash.slice(1), id: [page, ...args].join('/'), label: `Training 4D · ${page}${args[0] ? ` · ${args[0]}` : ''}` };
  try {
    if (page === 'dash') return dashboard(main);
    const m = await import(`./${MOD[page] || 'ts_system'}.js`);
    await m.page(page, main, args);
  } catch (e) { console.error(e); main.innerHTML = `<section class="card"><p class="muted">This page failed to load: ${esc(e.message)}</p></section>`; }
}

// ---------------------------------------------------------------- shared UI pieces
export function header(title, sub, crumb = '') {
  return `<div class="tr-h"><div>${crumb ? `<div class="tr-crumb">${crumb}</div>` : ''}<h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>
    <div class="links-row"><span class="pill acc" title="Built from the owner's workbook">${esc(S.B.source.split(' (')[0])} · built ${esc(S.B.built)}</span>
    <a class="pill ${S.B.validation_summary.passed === S.B.validation_summary.checks ? 'ok' : 'warn'}" href="${href('validation')}" style="text-decoration:none">✔ ${S.B.validation_summary.passed}/${S.B.validation_summary.checks} checks</a></div></div>`;
}
let tipEl = null;
export function tip(e, html) {
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tip'; document.body.appendChild(tipEl); }
  if (!html) { tipEl.hidden = true; return; }
  tipEl.hidden = false; tipEl.innerHTML = html;
  const x = Math.min(window.innerWidth - tipEl.offsetWidth - 12, e.clientX + 14); tipEl.style.left = `${x}px`; tipEl.style.top = `${e.clientY + 14}px`;
}
export function bindTips(root) {
  root.querySelectorAll('[data-tip]').forEach((n) => { n.addEventListener('mousemove', (e) => tip(e, n.dataset.tip)); n.addEventListener('mouseleave', () => tip(null, '')); });
}
export function hbar(data, { w = 520, max = null, color = '#6fd3ff', onclick = '', label = (x) => x, limit = 14, lw = 170 } = {}) {
  const xs = data.slice(0, limit), mx = max || Math.max(1, ...xs.map((d) => d[1])), h = 20, H = xs.length * h + 6;
  return `<svg class="chart" viewBox="0 0 ${w} ${H}">${xs.map(([k, n], i) => {
    const bw = Math.max(1, ((w - lw - 60) * n) / mx), y = i * h + 3;
    return `<g ${onclick ? `class="day-cell" data-${onclick}="${esc(k)}"` : ''} data-tip="${esc(label(k))}: ${fmt(n)}"><text x="${lw - 6}" y="${y + 13}" text-anchor="end">${esc(String(label(k) || '—').slice(0, 30))}</text>
      <rect x="${lw}" y="${y + 2}" width="${bw}" height="${h - 7}" rx="3" fill="${typeof color === 'function' ? color(k, i) : color}" opacity="0.85"/><text x="${lw + bw + 5}" y="${y + 13}" class="t-muted">${fmt(n)}</text></g>`;
  }).join('')}</svg>`;
}
export function ring(v, max, label, col) {
  const r = 46, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, v / max));
  return `<svg class="ring" viewBox="0 0 112 112"><circle cx="56" cy="56" r="${r}" fill="none" stroke="rgba(120,190,255,.15)" stroke-width="9"/>
    <circle cx="56" cy="56" r="${r}" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${c * f} ${c}" transform="rotate(-90 56 56)" style="filter:drop-shadow(0 0 6px ${col})"/>
    <text x="56" y="58" text-anchor="middle" font-size="26">${esc(v)}</text><text x="56" y="76" text-anchor="middle" font-size="10" fill="#7f97b5">${esc(label)}</text></svg>`;
}
export const lightCol = (score) => (score >= 75 ? '#64e6a8' : score >= 55 ? '#ffc067' : '#ff6b6b');
export function phaseLadder(onPhase = 'phases') {
  const P = T('Phase_System'), C = S.comp, st = {};
  (C?.gates?.rows || []).forEach((g) => { st[g.phase] = g.status; });
  const stages = [...new Set(P.map((p) => p.Stage))], W = 980, H = 128, colW = W / stages.length;
  let x = 0; const pos = {};
  stages.forEach((s, si) => { const ps = P.filter((p) => p.Stage === s); ps.forEach((p, i) => { pos[p.Code] = { x: si * colW + ((i + 1) * colW) / (ps.length + 1), y: 66 + (i % 2 ? 14 : -6) }; }); });
  const path = P.map((p, i) => `${i ? 'L' : 'M'}${pos[p.Code].x},${pos[p.Code].y}`).join(' ');
  return `<svg class="ladder" viewBox="0 0 ${W} ${H}">
    ${stages.map((s, si) => `<rect x="${si * colW + 3}" y="6" width="${colW - 6}" height="${H - 12}" rx="10" fill="${STAGE_COL[si + 1]}" opacity="0.05"/><text x="${si * colW + colW / 2}" y="22" text-anchor="middle" class="lab">${esc(s)}</text>`).join('')}
    <path d="${path}" fill="none" stroke="url(#lg)" stroke-width="2" opacity="0.7"/><defs><linearGradient id="lg"><stop offset="0" stop-color="#64e6a8"/><stop offset="1" stop-color="#ff8fa3"/></linearGradient></defs>
    ${P.map((p) => { const s = st[p.Code] || 'Locked', fin = C?.final_phase === p.Code, auto = C?.gates?.auto_phase === p.Code, col = STAGE_COL[p.Code[0]];
      return `<a href="${href(onPhase, p.Code)}"><g class="node" data-tip="<b>${esc(p.Code)} · ${esc(p['Phase Name'])}</b><br>${esc(p['Primary Aim'])}<br>Gate: ${esc(s)}${fin ? '<br>◆ your phase' : ''}${auto ? '<br>▲ auto phase from tests' : ''}">
        <circle cx="${pos[p.Code].x}" cy="${pos[p.Code].y}" r="${fin ? 11 : 8}" fill="${s === 'Locked' ? '#0a1424' : col}" stroke="${col}" stroke-width="2" ${fin ? `style="filter:drop-shadow(0 0 8px ${col})"` : ''}/>
        ${auto ? `<path d="M${pos[p.Code].x - 6},${pos[p.Code].y + 26} l6,-9 l6,9z" fill="#6fd3ff"/>` : ''}
        <text x="${pos[p.Code].x}" y="${pos[p.Code].y - 15}" text-anchor="middle">${esc(p.Code)}</text></g></a>`; }).join('')}</svg>`;
}
export function kv(obj, keys) {
  return `<dl class="kv">${(keys || Object.keys(obj)).filter((k) => obj[k] !== undefined && obj[k] !== '' && !k.startsWith('__')).map((k) => `<dt>${esc(k)}</dt><dd>${esc(obj[k])}</dd>`).join('')}</dl>`;
}
export function show3D(names, title) {
  if (!names?.length) return;
  window.__pendingAtlas = { names, atRisk: [], title }; location.hash = '#atlas';
  const goA = () => { if (window.__atlas?.clinical) window.__atlas.clinical(window.__pendingAtlas); else setTimeout(goA, 300); }; goA();
}
export function musclesFor(text) { // workbook muscle words -> BodyParts3D names (build-time map)
  const M = S.B.links.muscles, out = new Set();
  String(text || '').replace(/\(([^)]*)\)/g, (m, g) => `(${g.replace(/,/g, '/')})`).split(/[;,]|\s\+\s|\band\b(?![^()]*\))/).map((x) => x.trim().replace(/^[\s.]+|[\s.]+$/g, '')).forEach((t) => (M[t] || []).forEach((n) => out.add(n)));
  return [...out];
}
export function openStudio(base, pos) { // Motion Lab 4D movement studio: the twin performs this base movement on the table
  location.hash = '#lab';
  const go_ = () => { if (window.__studio) window.__studio.start(base, pos); else { window.__pendingStudio = { base, pos }; } };
  if (window.__studio) setTimeout(go_, 50); else { window.__pendingStudio = { base, pos }; const w = () => { if (window.__studio) { if (window.__pendingStudio) { window.__studio.start(base, pos); window.__pendingStudio = null; } } else setTimeout(w, 400); }; setTimeout(w, 400); }
}
export function openClinical(id) { location.hash = '#clinical'; import('./clinical.js').then((m) => m.startClinical(id)); }
export function openTestTab(id) { location.hash = '#tests'; import('./tests.js').then((m) => m.startTests(id)); }
export const evClass = (e) => { const x = String(e || '').trim().toUpperCase(); return /^(A|HIGH)/.test(x) ? 'ok' : /^(B|MODERATE)/.test(x) ? 'acc' : /^(C|LOW)/.test(x) ? 'warn' : ''; };
export const ev = (e) => (e ? `<span class="pill ${evClass(e)}" title="Evidence grade as stated in the workbook (not re-graded here)">evidence ${esc(String(e).slice(0, 40))}</span>` : '');

// ---------------------------------------------------------------- dashboard
function dashboard(main) {
  const B = S.B, st = B.stats, C = S.comp, tb = st.tables, ex = st.exercise;
  const rd = C?.readiness || { score: 0, light: '—' };
  const tiles = [
    [ex.total, 'exercises', 'Exercise_Library, 47 fields each', 'library', '#6fd3ff'], [tb.Condition_Progression, 'condition-phase rows', `${tb.Conditions_Meta} conditions × 22 phases × 8 components`, 'pathway', '#64e6a8'],
    [tb.Phase_System, 'phases', '6 stages, gate-driven', 'phases', '#b49bff'], [tb.Sports_Demands, 'sports', `${tb.Sport_Drills} ladder drills`, 'sports', '#ffc067'],
    [tb.Drill_Bank, 'drills & games', `${tb.Training_Games} games × families × constraints × levels`, 'drills', '#ff8fa3'], [tb.Program_Variants, 'program variants', `${tb.Program_Library} core programs`, 'programs', '#7cf0e0'],
    [tb.Generated_Library, 'generated combinations', '8-dimension rules', 'combo', '#f5e663'], [tb.Warmup_10min, '10-min warm-ups', 'sport × phase × day type', 'drills', '#9fb6ff'],
    [tb.Atlas_Topics, 'knowledge topics', `${tb.Atlas_Subjects} subjects, MBBS → specialty`, 'atlas', '#d39bff'], [tb.Anatomy_Reference, 'muscles', `${tb.Anatomy_Map} base movements mapped`, 'anatomy', '#ffa36b'],
    [tb.Training_Science, 'science concepts', `${tb.Elite_Methods} elite methods`, 'science', '#8ee07a'], [st.formulas_total, 'live formulas', `${st.sheets} sheets read`, 'sheets', '#ff6bb5'],
  ];
  const goals = [...new Set(ex.goal_depth.map((x) => x[0]))].sort(), mx = Math.max(...ex.goal_depth.map((x) => x[2]));
  const cellN = (g, d) => (ex.goal_depth.find((x) => x[0] === g && String(x[1]) === String(d)) || [0, 0, 0])[2];
  main.innerHTML = `${header('Training System 4D', `Your workbook as one linked system: profile and tests → phase gates → day-by-day pathway → session, with every exercise, drill, program, sport, muscle and concept connected. Planners run the workbook's own formulas (checked against its saved results).`, 'Command · Dashboard')}
    <section class="card"><div class="status">
      <a href="${href('today')}" style="text-decoration:none" data-tip="Readiness from Daily_Schedule: mean of 5 ratings × 20, minus 10 each for sleep &lt; 7 h, HRV &lt; 90%, CMJ &lt; 92%">${ring(rd.score, 100, 'readiness', lightCol(rd.score))}</a>
      <div>${phaseLadder()}
        <div class="links-row"><span class="pill acc">◆ your phase ${esc(C?.final_phase || '—')} · ${esc(C?.phase?.['Phase Name'] || '')}</span>
        <span class="pill">▲ tests say ${esc(C?.gates?.auto_phase || '—')}</span>${C?.gates?.unmet_next ? `<span class="pill warn">next gate needs ${esc(C.gates.unmet_next)}</span>` : ''}
        <span class="pill ${rd.score >= 75 ? 'ok' : rd.score >= 55 ? 'warn' : 'bad'}">${esc(rd.light)}</span></div></div>
      <div class="bar" style="flex-direction:column;align-items:stretch"><a class="primary small" href="${href('today')}" style="text-align:center;text-decoration:none">Today's plan</a><a class="ghost-btn" href="${href('phases')}" style="text-align:center;text-decoration:none">Gate calculator</a><a class="ghost-btn" href="${href('pathway')}" style="text-align:center;text-decoration:none">Pathway 4D</a></div>
    </div></section>
    <div class="kpis">${tiles.map(([n, l, s, p, c]) => `<a class="kpi" href="${href(p)}" style="--c:${c}"><b>${fmt(n)}</b><span>${l}</span><small>${esc(s)}</small></a>`).join('')}</div>
    <div class="tr-grid">
      <section class="card s7"><div class="card-h"><h2>Exercise space: goal × depth</h2><small>${fmt(ex.total)} exercises · click a cell to open them</small></div>
        <svg class="chart" viewBox="0 0 640 ${goals.length * 22 + 40}">${[1, 2, 3, 4, 5, 6].map((d, j) => `<text x="${190 + j * 72 + 34}" y="14" text-anchor="middle">L${d}</text>`).join('')}
        ${goals.map((g, i) => `<text x="182" y="${i * 22 + 36}" text-anchor="end">${esc(g)}</text>${[1, 2, 3, 4, 5, 6].map((d, j) => { const n = cellN(g, d);
          return `<a href="${href('library', JSON.stringify({ Goal: g, 'Depth (1-6)': String(d) }))}"><rect x="${190 + j * 72}" y="${i * 22 + 22}" width="68" height="19" rx="4" fill="#6fd3ff" opacity="${n ? (0.1 + (0.85 * Math.sqrt(n)) / Math.sqrt(mx)).toFixed(2) : 0.03}" data-tip="${esc(g)} · depth L${d}: ${fmt(n)}"/><text x="${190 + j * 72 + 34}" y="${i * 22 + 35}" text-anchor="middle" style="fill:#02101d;font-weight:600">${n ? fmt(n) : ''}</text></a>`; }).join('')}`).join('')}</svg>
        <p class="fine">Depth L1 Foundational / Protective → L6 Elite (Depth_Model). Each phase allows a depth band and a set of goals, which is how the session builder filters this space.</p></section>
      <section class="card s5"><div class="card-h"><h2>How the ${S.B.sheets.length} sheets feed each other</h2><small>${fmt(st.sheet_edges.reduce((a, e) => a + e[2], 0))} formula references</small></div>${sheetNet(st)}
        <p class="fine">Lines are real cross-sheet formula references read from the workbook (thicker = more references). Click a sheet to open it.</p></section>
      <section class="card s4"><div class="card-h"><h2>Conditions by region</h2><a class="ghost-btn" href="${href('pathway')}">Open pathway</a></div>${hbar(st.conditions.by_region, { w: 420, lw: 150, color: (k, i) => PAL[i % PAL.length] })}</section>
      <section class="card s4"><div class="card-h"><h2>Library by equipment class</h2></div>${hbar(ex.by_equipment, { w: 420, lw: 150, color: '#b49bff', limit: 17 })}</section>
      <section class="card s4" id="dash-today"><div class="card-h"><h2>Today's top picks</h2><a class="ghost-btn" href="${href('today')}">Full day</a></div><p class="muted">Loading session…</p></section>
      <section class="card s6"><div class="card-h"><h2>Evidence grades as stated in the workbook</h2></div>${evidenceBars(st.evidence)}<p class="fine">Counts of the grade written in each table's evidence column (A/B/C/D or HIGH/MODERATE/LOW). Shown as authored, not re-graded here.</p></section>
      <section class="card s12" id="dash-sel"><div class="card-h"><h2>Selected player</h2></div><p class="muted">Loading…</p></section>
      <section class="card s12" id="dash-players"><div class="card-h"><h2>Players today</h2><a class="ghost-btn" href="${href('team')}">Team dashboard</a></div><p class="muted">Loading…</p></section>
      <section class="card s6"><div class="card-h"><h2>What I explored</h2><small>sheet "what i explored"</small></div><ul class="fine" style="margin:0;padding-left:18px;font-size:12.5px;color:var(--text)">${B.explored.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>
    </div>`;
  bindTips(main);
  main.querySelectorAll('[data-sheet]').forEach((n) => n.addEventListener('click', () => go('sheets', n.dataset.sheet)));
  fetch('/api/ath/list').then((r) => r.json()).then((L) => selectedPlayer(L)).catch(() => {});
  fetch('/api/ath/list').then((r) => r.json()).then((L) => {
    const st = { Active: 'ok', Injured: 'bad', Returning: 'warn' };
    $('#dash-players').innerHTML = `<div class="card-h"><h2>Players today</h2><a class="ghost-btn" href="${href('team')}">Team dashboard</a></div><div class="cardlist">${L.athletes.map((a) => { const s = a.summary;
      return `<a class="card" style="text-decoration:none;color:inherit" href="${href('athlete', String(a.id))}"><h4>${esc(a.name)} <span class="pill ${st[a.status] || ''}">${esc(a.status)}</span></h4><p class="mini">${esc(a.sport || '')} · ${esc(a.condition || 'performance')} · phase <b style="color:${STAGE_COL[String(s.phase || '1')[0]]}">${esc(s.phase || '—')}</b> ${esc(s.phase_name || '')}</p>
        <p class="mini"><b>Programs today</b>: ${(s.programs || []).filter((p) => p.scheduled).map((p) => esc(p.title) + (p.level ? ` (${esc(p.level)}·${esc(p.block)})` : '')).join('; ') || 'none assigned'}</p>
        <p class="mini">week load ${s.week_load != null ? fmt(Math.round(s.week_load)) : '—'} AU · readiness ${s.last_readiness ?? '—'} · pain ${s.last_pain ?? '—'}</p>${s.flags.length ? `<p class="mini" style="color:#ff9b9b">${s.flags.map(esc).join(' · ')}</p>` : ''}</a>`; }).join('') || '<p class="mini">No athletes yet.</p>'}</div>`;
  }).catch(() => { $('#dash-players').innerHTML = '<p class="muted">Athlete data unavailable.</p>'; });
  api('session', { phase: C?.final_phase, n: 5, volume: C?.readiness?.final }).then((s) => {
    $('#dash-today').innerHTML = `<div class="card-h"><h2>Today's top picks</h2><a class="ghost-btn" href="${href('today')}">Full day</a></div>
      <p class="fine" style="margin-top:0">Phase ${esc(s.phase)} · ${esc(s.phase_name)} · goals ${esc(s.goals.join(', '))} · depth L${s.depth.join('–L')} · ${fmt(s.matches)} matches</p>
      <ol style="margin:0;padding-left:18px;font-size:12.5px">${s.picks.map((p) => `<li><a class="lk" href="${href('library', '{}', String(p.row))}">${esc(p['Exercise Name'])}</a><div class="mini">${esc(p.auto)}</div></li>`).join('')}</ol>`;
  }).catch((e) => { $('#dash-today').innerHTML += `<p class="muted">${esc(e.message)}</p>`; });
}

function sheetNet(st) {
  const names = S.B.sheets.map((s) => s.name), n = names.length, R = 200, cx = 240, cy = 230, pos = {};
  names.forEach((s, i) => { const a = (i / n) * Math.PI * 2 - Math.PI / 2; pos[s] = [cx + Math.cos(a) * R, cy + Math.sin(a) * R, a]; });
  const mx = Math.max(...st.sheet_edges.map((e) => e[2]));
  const deg = {}; st.sheet_edges.forEach(([a, b, k]) => { deg[a] = (deg[a] || 0) + k; deg[b] = (deg[b] || 0) + k; });
  return `<svg class="chart" viewBox="-120 -20 720 500">${st.sheet_edges.map(([a, b, k]) => pos[a] && pos[b] ? `<path d="M${pos[a][0]},${pos[a][1]} Q${cx},${cy} ${pos[b][0]},${pos[b][1]}" fill="none" stroke="#6fd3ff" stroke-opacity="${(0.12 + 0.5 * Math.log1p(k) / Math.log1p(mx)).toFixed(2)}" stroke-width="${(0.5 + 2.5 * Math.log1p(k) / Math.log1p(mx)).toFixed(2)}" data-tip="${esc(a)} → ${esc(b)}: ${fmt(k)} references"/>` : '').join('')}
    ${names.map((s) => { const [x, y, a] = pos[s], r = 3 + Math.min(6, Math.log1p(deg[s] || 0) / 1.5), right = Math.cos(a) >= 0;
      return `<g class="day-cell" data-sheet="${esc(s)}" data-tip="<b>${esc(s)}</b><br>${fmt(deg[s] || 0)} references in/out · ${fmt(st.formulas[s] || 0)} formulas"><circle cx="${x}" cy="${y}" r="${r}" fill="${S.B.sheets.find((q) => q.name === s)?.private ? '#ffc067' : '#b49bff'}"/>
      <text x="${x + (right ? 8 : -8)}" y="${y + 3}" text-anchor="${right ? 'start' : 'end'}" font-size="8.5" transform="rotate(${((a * 180) / Math.PI + (right ? 0 : 180)).toFixed(1)} ${x} ${y})">${esc(s.trim().slice(0, 22))}</text></g>`; }).join('')}</svg>`;
}

function evidenceBars(E) {
  const order = ['A', 'HIGH', 'B', 'MODERATE', 'C', 'LOW', 'D', 'VERY LOW', 'other'], col = { A: '#64e6a8', HIGH: '#64e6a8', B: '#6fd3ff', MODERATE: '#6fd3ff', C: '#ffc067', LOW: '#ffc067', D: '#ff8fa3', 'VERY LOW': '#ff8fa3', other: '#4a5d78' };
  const rows = Object.entries(E).filter(([, v]) => v.length).map(([k, v]) => [k, Object.fromEntries(v), v.reduce((a, x) => a + x[1], 0)]).sort((a, b) => b[2] - a[2]).slice(0, 12);
  const W = 640, lw = 290;
  return `<svg class="chart" viewBox="0 0 ${W} ${rows.length * 20 + 8}">${rows.map(([k, m, tot], i) => { let x = lw;
    return `<text x="${lw - 6}" y="${i * 20 + 15}" text-anchor="end">${esc(k.replace(/_/g, ' ').replace('.', ' · ').slice(0, 44))}</text>` + order.filter((g) => m[g]).map((g) => { const w = ((W - lw - 40) * m[g]) / tot, r = `<rect x="${x}" y="${i * 20 + 4}" width="${w}" height="13" fill="${col[g]}" opacity="0.85" data-tip="${esc(k)}: ${esc(g)} = ${m[g]}"/>`; x += w; return r; }).join('') + `<text x="${x + 4}" y="${i * 20 + 15}" class="t-muted">${tot}</text>`; }).join('')}</svg>
    <div class="legend">${['A / HIGH', 'B / MODERATE', 'C / LOW', 'D', 'other text'].map((l, i) => `<span><i style="background:${['#64e6a8', '#6fd3ff', '#ffc067', '#ff8fa3', '#4a5d78'][i]}"></i>${l}</span>`).join('')}</div>`;
}

// ---------------------------------------------------------------- dashboard: one selected player (rehab plan, S&C, other, updates)
async function selectedPlayer(L) {
  const box = document.querySelector('#dash-sel'); if (!box) return;
  let id = null; try { id = +localStorage.getItem('ts-player') || null; } catch { /* storage blocked */ }
  if (!L.athletes.find((a) => a.id === id)) id = L.athletes[0]?.id;
  if (!id) { box.innerHTML = '<div class="card-h"><h2>Selected player</h2></div><p class="mini">No athletes yet.</p>'; return; }
  const a = await fetch(`/api/ath/get?id=${id}`).then((r) => r.json()), P = a.plan, dp = P.day_plan;
  const REHAB = ['KEY', 'MOB', 'ACT', 'REC'], SC = ['STR', 'PWR', 'CON'], REHAB_CAT = ['Condition-specific', 'Joint prehab', 'Mobility', 'Warm-up'];
  const rows = (codes) => (dp ? dp.rows.filter((r) => codes.includes(r.comp) && r.level).map((r) => `<li><b>${esc(r.label)}</b>: ${esc(r.today)} <span class="mini">— ${esc(r.dose)}</span></li>`).join('') : '');
  const progs = (rehab) => a.programs.filter((p) => p.scheduled && (p.kind === 'exercise' ? rehab : REHAB_CAT.includes(p.category) === rehab)).map((p) => `<li><b>${esc(p.title)}</b>${p.level ? ` <small>${esc(p.level)}·${esc(p.block)}</small>` : ''}${p.variant ? ` <span class="mini">— ${esc(p.variant['Drill 1'])}; ${esc(p.variant.Dose)}</span>` : p.dose ? ` <span class="mini">— ${esc(p.dose)}</span>` : ''}</li>`).join('');
  const { updatesList } = await import('./ts_team.js');
  box.innerHTML = `<div class="card-h"><h2>Selected player</h2><span class="bar"><select class="tr-sel" id="sel-pl">${L.athletes.map((x) => `<option value="${x.id}" ${x.id === id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select><a class="ghost-btn" href="${href('athlete', String(id))}">Open player</a></span></div>
    <div class="links-row"><span class="pill">${esc(a.status)}</span><span class="pill acc">phase ${esc(P.phase)} · ${esc(T('Phase_System').find((x) => x.Code === P.phase)?.['Phase Name'] || '')} · day ${P.day_in_phase}</span>${P.mode !== 'Standard' ? `<span class="pill warn">${esc(P.mode)}${P.modifications ? `: ${esc(P.modifications)}` : ''}</span>` : ''}<span class="pill">tests say ${esc(P.auto_phase)}</span>${a.monitor.flags.map((f) => `<span class="pill bad">${esc(f)}</span>`).join('')}</div>
    <div class="tr-grid" style="margin-top:8px"><div class="s4 rd-sec"><h4>Rehab plan today</h4><ul class="mini" style="padding-left:16px;margin:0">${rows(REHAB)}${progs(true)}</ul>${!dp ? '<p class="mini">No condition pathway set.</p>' : ''}</div>
      <div class="s4 rd-sec"><h4>S&amp;C today</h4><ul class="mini" style="padding-left:16px;margin:0">${rows(SC)}${progs(false)}</ul></div>
      <div class="s4 rd-sec"><h4>Sport / court and other</h4><ul class="mini" style="padding-left:16px;margin:0">${rows(['SPORT'])}${P.court?.today ? `<li><b>Court L${P.court.level}</b>: ${esc(P.court.today['PRIMARY drill'])}</li>` : ''}</ul><p class="mini">${esc(P.why[0])}</p></div>
      <div class="s12 rd-sec"><h4>Latest updates</h4>${updatesList(a.updates, 6)}</div></div>`;
  document.querySelector('#sel-pl').onchange = (e) => { try { localStorage.setItem('ts-player', e.target.value); } catch { /* ignore */ } selectedPlayer(L); };
}
