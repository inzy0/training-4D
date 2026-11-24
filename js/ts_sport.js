// Training 4D · Performance: sport biomechanics, sport-to-sport transfer, player development, training-to-training,
// interpretation and development programs, squad learning. Data: /api/ath/sci/* (anatomy_lab/sport_science.py).
// Rule-based: every finding shows its rule and its source (workbook table or named formula); no generated text.
import { esc, fmt, go, href, header, STAGE_COL } from './training.js';

const $ = (s, r = document) => r.querySelector(s);
const sci = async (route, params = {}) => { const u = new URL(`/api/ath/sci/${route}`, location.origin); Object.entries(params).forEach(([k, v]) => v != null && v !== '' && u.searchParams.set(k, v)); const r = await fetch(u); const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || r.statusText); return j; };
const roster = async () => { const r = await fetch(new URL('/api/ath/list', location.origin)); const j = await r.json(); return j.athletes || []; };
const LV = { act: ['bad', 'Act'], watch: ['warn', 'Watch'], info: ['', 'Info'] };
const src = (t) => `<span class="mini" title="Source">⟶ ${esc(t)}</span>`;
const list = (xs) => (xs && xs.length ? xs.map((x) => `<span class="pill">${esc(x)}</span>`).join(' ') : '<span class="mini">—</span>');
const today = () => new Date().toISOString().slice(0, 10);
const ago = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

export async function page(p, main, args) {
  try {
    if (p === 'sportbio') return await sportBio(main, args);
    if (p === 'transfer') return await transfer(main, args);
    if (p === 'player') return await player(main, args);
    if (p === 'trainings') return await trainings(main, args);
    if (p === 'insights') return await insights(main, args);
    if (p === 'squad') return await squad(main, args);
  } catch (e) { main.innerHTML = `<section class="card"><p class="muted">${esc(e.message)}</p></section>`; }
}

async function sportSelect(id, cur) {
  const S = await sci('sports');
  const fams = [...new Set(S.map((s) => s.family))];
  return `<select class="tr-sel" id="${id}">${fams.map((f) => `<optgroup label="${esc(f)}">${S.filter((s) => s.family === f).map((s) => `<option ${s.sport === cur ? 'selected' : ''}>${esc(s.sport)}</option>`).join('')}</optgroup>`).join('')}</select>`;
}
async function athleteSelect(id, cur) {
  const L = await roster();
  if (!L.length) return { html: '<p class="muted">No athletes yet. Add one in Team → Athletes &amp; groups.</p>', first: null };
  const pick = cur && L.some((a) => String(a.id) === String(cur)) ? cur : L[0].id;
  return { html: `<select class="tr-sel" id="${id}">${L.map((a) => `<option value="${a.id}" ${String(a.id) === String(pick) ? 'selected' : ''}>${esc(a.name)}${a.sport ? ` · ${esc(a.sport)}` : ''}</option>`).join('')}</select>`, first: pick };
}

// ================================================================= SPORT BIOMECHANICS
async function sportBio(main, args) {
  const s = args[0] || 'Basketball', P = await sci('sport', { s }), d = P.demands;
  main.innerHTML = `${header('Sport biomechanics', 'What a sport asks of the body: energy systems, key movements broken down to prime movers, tendons, ligaments, joint angles and line of force, injuries linked to the knowledge atlas, test targets, drills, elite methods and the weekly load shape.', 'PERFORMANCE')}
    <section class="card"><div class="bar">${await sportSelect('sb-s', s)}<span class="pill">${esc(P.family || '—')} family</span>${P.highest_action ? `<span class="pill warn" title="Highest-intensity action (clearance target)">⚡ ${esc(P.highest_action)}</span>` : ''}<a class="ghost-btn" href="${href('transfer', s, 'Football (soccer)')}">Compare with another sport →</a></div></section>
    <div class="tr-grid">
      <section class="card s6"><div class="card-h"><h2>Demands</h2>${src('Sports_Demands')}</div><table class="tt"><tbody>${['Type', 'Energy Systems (approx.)', 'Key Movements', 'Key Physical Qualities', 'Positions / Roles', 'Unique Skills to Train', 'Ultimate-Performer Focus', 'Season Structure'].map((k) => `<tr><td class="mini" style="width:34%">${esc(k)}</td><td>${esc(d[k])}</td></tr>`).join('')}</tbody></table></section>
      <section class="card s6"><div class="card-h"><h2>Injuries, prehab &amp; test targets</h2>${src('Sports_Demands · Atlas_Sports')}</div>
        <p><b>Common injuries:</b> ${esc(d['Common Injuries'])}</p><p><b>Prehab priorities:</b> ${esc(d['Prehab Priorities'])}</p>
        <p><b>Elite targets:</b></p><div>${P.kpis.map((k) => `<span class="pill ${k.code ? 'acc' : ''}" title="${k.code ? `Feeds gate metric ${k.code}` : 'No matching gate metric'}">${esc(k.target)}${k.code ? ` · ${k.code}` : ''}</span>`).join(' ')}</div>
        ${P.atlas.map((a) => `<details style="margin-top:8px"><summary><b>${esc(a.name)}</b> · knowledge atlas</summary><p class="mini">${esc(a.profile)}</p><p class="mini"><b>Key tests:</b> ${esc(a.tests)}</p><p class="mini"><b>Return to sport:</b> ${esc(a.rts)}</p>
          ${[['Injury topics', a.injury_topics], ['Rehab & prevention', a.rehab_topics], ['Performance', a.performance_topics]].map(([l, ts]) => ts.length ? `<p class="mini"><b>${l}:</b> ${ts.map((t) => `<a href="${href('atlas', t.id)}">${esc(t.id)} ${esc(t.topic)}</a>`).join(' · ')}</p>` : '').join('')}</details>`).join('')}</section>
      <section class="card s12"><div class="card-h"><h2>Movement biomechanics</h2>${src(P.sources.biomechanics)}</div>
        <div class="tt-wrap" style="max-height:none"><table class="tt"><thead><tr><th>Base movement</th><th>Prime movers</th><th>Tendons loaded</th><th>Ligaments / capsule stressed</th><th>Joint angles &amp; range</th><th>Line of force</th></tr></thead><tbody>
        ${P.biomechanics.map((b) => `<tr><td><b>${esc(b.base)}</b><div class="mini">matched “${esc(b.matched)}”</div><button class="ghost-btn" data-ms="${esc(b.base)}" style="margin-top:4px">Play in Motion Lab</button></td><td class="mini">${esc(b['Prime movers (agonists)'])}</td><td class="mini">${esc(b['Tendons loaded'])}</td><td class="mini">${esc(b['Ligaments / capsule / fascia stressed'])}</td><td class="mini">${esc(b['Joint angles & range'])}</td><td class="mini">${esc(b['Body position & line of force'])}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No movement words matched.</td></tr>'}
        </tbody></table></div></section>
      <section class="card s6"><div class="card-h"><h2>Sport drill ladder</h2>${src('Sport_Drills')}</div>${P.drills.map((r) => `<div class="comp" style="grid-template-columns:44px 1fr"><b style="color:${STAGE_COL[String(r.Level)] || '#ccc'}">L${esc(r.Level)}</b><div><b>${esc(r['PRIMARY drill'])}</b><div class="mini">${esc(r['Level name'])} · easier: ${esc(r['Alt A — easier, same goal'])}</div></div></div>`).join('') || '<p class="muted">—</p>'}</section>
      <section class="card s6"><div class="card-h"><h2>Weekly load shape</h2>${src(`Load_Templates · ${P.schedule || '—'}`)}</div><table class="tt"><thead><tr><th>Day</th><th>Focus</th><th>AU</th><th>Intensity</th></tr></thead><tbody>${P.load_template.map((r) => `<tr><td>${esc(r['Day label'] || r.Day)}</td><td class="mini">${esc(r['Session focus'])}</td><td class="num">${esc(r['Base load (AU)'])}</td><td class="mini">${esc(r.Intensity)}</td></tr>`).join('')}</tbody></table>
        <div class="card-h" style="margin-top:10px"><h2>Elite methods for this sport</h2>${src('Elite_Methods')}</div>${P.methods.slice(0, 8).map((m) => `<div class="mini"><b>${esc(m.Method)}</b> · ${esc(m.Dose)} · phases ${esc(m['Best Phases'])} · evidence ${esc(m.Evidence)}</div>`).join('')}</section>
    </div>`;
  $('#sb-s').onchange = (e) => go('sportbio', e.target.value);
  main.querySelectorAll('[data-ms]').forEach((b) => (b.onclick = () => {
    const name = b.dataset.ms; location.hash = '#lab';
    let n = 0; const t = setInterval(() => { // the Motion Lab loads its twin first; then the Movement Studio plays the base movement
      if (window.__studio?.start && window.__studio.moves().includes(name)) { clearInterval(t); window.__studio.start(name); document.querySelector('#ms-move')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      else if (++n > 120) clearInterval(t);
    }, 500);
  }));
}

// ================================================================= SPORT -> SPORT
async function transfer(main, args) {
  const a = args[0] || 'Basketball', b = args[1] || 'Football (soccer)', C = await sci('compare', { a, b });
  const block = (title, x, s) => `<section class="card s6"><div class="card-h"><h2>${title}</h2>${src(s)}</div>
    <p><b>Carries over</b> ${list(x.shared)}</p><p><b>Related in ${esc(b)}</b> ${list(x.related_in_b)}</p><p><b>New for ${esc(b)}</b> ${list(x.new_in_b)}</p><p><b>Less needed in ${esc(b)}</b> ${list(x.only_in_a)}</p></section>`;
  main.innerHTML = `${header('Sport → sport transfer', 'Moving an athlete between sports, or cross-training: which movements and qualities carry over, what is new, what fades, and the injury and prehab picture of the new sport.', 'PERFORMANCE')}
    <section class="card"><div class="bar">From ${await sportSelect('tf-a', a)} to ${await sportSelect('tf-b', b)}<span class="pill ${C.family.same ? 'ok' : ''}">${C.family.same ? 'same family' : `${esc(C.family.a)} → ${esc(C.family.b)}`}</span>
      <span class="pill acc">movement overlap ${C.overlap.base_movements ?? '—'}</span><span class="pill acc">quality overlap ${C.overlap.qualities ?? '—'}</span></div><p class="fine">${esc(C.method)}</p></section>
    <div class="tr-grid">${block('Base movements', C.moves, 'Anatomy_Map via movement words')}${block('Physical qualities', C.qualities, 'Sports_Demands')}${block('Injury exposure', C.injuries, 'Sports_Demands')}${block('Prehab priorities', C.prehab, 'Sports_Demands')}
      <section class="card s12"><div class="card-h"><h2>New movements in ${esc(b)}: what they load</h2>${src('Anatomy_Map')}</div><table class="tt"><thead><tr><th>Movement</th><th>Prime movers</th><th>Tendons</th><th>Joint angles</th></tr></thead><tbody>${C.new_movement_detail.map((m) => `<tr><td><b>${esc(m.base)}</b></td><td class="mini">${esc(m['Prime movers (agonists)'])}</td><td class="mini">${esc(m['Tendons loaded'])}</td><td class="mini">${esc(m['Joint angles & range'])}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">None.</td></tr>'}</tbody></table></section>
      <section class="card s12"><div class="card-h"><h2>Side by side</h2></div><table class="tt"><thead><tr><th></th><th>${esc(a)}</th><th>${esc(b)}</th></tr></thead><tbody>${C.side_by_side.map((r) => `<tr><td class="mini">${esc(r.field)}</td><td class="mini">${esc(r.a)}</td><td class="mini">${esc(r.b)}</td></tr>`).join('')}</tbody></table></section>
      <section class="card s12"><div class="card-h"><h2>Entry ladder for ${esc(b)}</h2>${src('Sport_Drills')}</div>${C.b_drills.map((r) => `<span class="pill">L${esc(r.Level)} ${esc(r['PRIMARY drill'])}</span>`).join(' ')}</section></div>`;
  $('#tf-a').onchange = (e) => go('transfer', e.target.value, b); $('#tf-b').onchange = (e) => go('transfer', a, e.target.value);
}

// ================================================================= PLAYER DEVELOPMENT
function spark(series, th, low) {
  if (!series.length) return '<span class="mini">no tests</span>';
  const ys = series.map((s) => s[1]).concat(th != null ? [th] : []), mn = Math.min(...ys), mx = Math.max(...ys), W = 140, H = 34, X = (i) => (series.length === 1 ? W / 2 : 4 + (i * (W - 8)) / (series.length - 1)), Y = (v) => H - 4 - ((v - mn) / (mx - mn || 1)) * (H - 8);
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${th != null ? `<line x1="0" x2="${W}" y1="${Y(th)}" y2="${Y(th)}" stroke="#ffc067" stroke-dasharray="3 3"/>` : ''}<polyline fill="none" stroke="var(--accent)" stroke-width="2" points="${series.map((s, i) => `${X(i)},${Y(s[1])}`).join(' ')}"/>${series.map((s, i) => `<circle cx="${X(i)}" cy="${Y(s[1])}" r="2.5" fill="${th == null ? 'var(--accent2)' : (low ? s[1] <= th : s[1] >= th) ? '#64e6a8' : '#ff8fa3'}"/>`).join('')}</svg>`;
}
async function player(main, args) {
  const sel = await athleteSelect('pl-a', args[0]);
  if (!sel.first) { main.innerHTML = header('Player development', '', 'PERFORMANCE') + `<section class="card">${sel.html}</section>`; return; }
  const P = await sci('player', { id: sel.first }), a = P.athlete;
  const lags = P.metrics.filter((m) => m.lag);
  main.innerHTML = `${header('Player development', 'One athlete: every gate metric with its trend, the next phase\'s threshold, the gap, and whether the last change is bigger than the test\'s measurement error. Load, injuries and the sport\'s targets alongside.', 'PERFORMANCE')}
    <section class="card"><div class="bar">${sel.html}<span class="pill acc">${esc(a.sport || 'General')}</span><b style="color:${STAGE_COL[String(P.phase)[0]]}">Phase ${esc(P.phase)}</b><span class="mini">${esc(P.phase_name || '')} → next ${esc(P.next_phase || '—')}</span>
      <span class="pill ${lags.length ? 'warn' : 'ok'}">${lags.length} lag${lags.length === 1 ? '' : 's'}</span><span class="mini">${P.n_tests} test${P.n_tests === 1 ? '' : 's'} · last ${esc(P.last_test || '—')}</span>
      <a class="ghost-btn" href="${href('insights', a.id)}">Interpretation &amp; program →</a><a class="ghost-btn" href="${href('athlete', a.id)}">Log a test</a></div></section>
    <div class="tr-grid"><section class="card s8"><div class="card-h"><h2>Gate metrics</h2>${src('Phase_Gates · Phase_Metrics · Testing_Protocols')}</div><div class="tt-wrap" style="max-height:none"><table class="tt"><thead><tr><th>Metric</th><th>Trend (dashed = next gate)</th><th>Now</th><th>Next gate</th><th>Gap</th><th>Last change</th><th>MDC95</th></tr></thead><tbody>
      ${P.metrics.map((m) => `<tr class="${m.lag ? 'hot' : ''}"><td><b>${esc(m.code)}</b><div class="mini">${esc(m.metric)} · ${esc(m.test || '')}</div></td><td>${spark(m.series, m.next_gate, m.dir === '<=')}</td><td class="num">${m.value ?? '—'}</td><td class="num">${m.next_gate != null ? `${esc(m.dir)} ${m.next_gate}` : '—'}</td>
        <td class="num ${m.lag ? 'bad' : ''}">${m.gap ?? '—'}</td><td class="num">${m.change != null ? (m.change > 0 ? '+' : '') + m.change : '—'}${m.change_beyond_error != null ? `<div class="mini">${m.change_beyond_error ? 'beyond error' : 'within error'}</div>` : ''}</td><td class="num" title="${esc(m.reliability)}">${m.mdc95 ?? '—'}</td></tr>`).join('')}
      </tbody></table></div><p class="fine">${esc(P.method)}</p></section>
      <section class="card s4"><div class="card-h"><h2>Load</h2>${src('athletes_api.monitor')}</div>
        <table class="tt"><tbody><tr><td>7-day load</td><td class="num">${P.load.last.acute ?? '—'}</td></tr><tr><td>28-day weekly mean</td><td class="num">${P.load.last.chronic ?? '—'}</td></tr><tr><td>Acute:chronic</td><td class="num">${P.load.last.acwr ?? '—'}</td></tr><tr><td>Monotony</td><td class="num">${P.load.last.monotony ?? '—'}</td></tr><tr><td>Strain</td><td class="num">${P.load.last.strain ?? '—'}</td></tr>
        <tr><td>Largest pain-free weekly rise</td><td class="num">${P.load.tolerance.largest_ok_increase_pct != null ? P.load.tolerance.largest_ok_increase_pct + '%' : '—'}</td></tr></tbody></table>
        ${P.load.flags.map((f) => `<div class="note warn" style="margin-top:6px">${esc(f)}</div>`).join('')}<p class="fine">${esc(P.load.method)}</p>
        <div class="card-h" style="margin-top:10px"><h2>${esc(a.sport || 'Sport')} targets</h2>${src('Sports_Demands')}</div><p class="mini">${esc(P.sport_targets)}</p><p class="mini"><b>Common injuries:</b> ${esc(P.sport_injuries)}</p><p class="mini"><b>Prehab:</b> ${esc(P.prehab)}</p>
        <div class="card-h" style="margin-top:10px"><h2>Injury history</h2></div>${P.injuries.map((i) => `<div class="mini">${esc(i.day)} · ${esc(i.region || '')} ${esc(i.condition || '')} · ${esc(i.status || '')}</div>`).join('') || '<p class="mini">none logged</p>'}</section></div>`;
  $('#pl-a').onchange = (e) => go('player', e.target.value);
}

// ================================================================= TRAINING -> TRAINING
async function trainings(main, args) {
  const sel = await athleteSelect('tr2-a', args[0]);
  if (!sel.first) { main.innerHTML = header('Training ↔ training', '', 'PERFORMANCE') + `<section class="card">${sel.html}</section>`; return; }
  const [af, at, bf, bt] = [args[1] || ago(13), args[2] || ago(7), args[3] || ago(6), args[4] || today()];
  const R = await sci('trainings', { id: sel.first, af, at, bf, bt });
  const K = [['sessions', 'Sessions'], ['load', 'Load (AU)'], ['per_week_load', 'Load per week (AU)'], ['minutes', 'Minutes'], ['rpe', 'Mean RPE'], ['monotony', 'Monotony'], ['strain', 'Strain'], ['pain', 'Mean pain'], ['readiness', 'Mean readiness']];
  const kinds = [...new Set([...Object.keys(R.a.kinds), ...Object.keys(R.b.kinds)])];
  main.innerHTML = `${header('Training ↔ training', 'Compare two training periods for one athlete: volume, intensity, variation, strain, pain and readiness, and where the load went.', 'PERFORMANCE')}
    <section class="card"><div class="bar">${sel.html} A <input type="date" class="tr-in" id="t-af" value="${af}"> – <input type="date" class="tr-in" id="t-at" value="${at}"> B <input type="date" class="tr-in" id="t-bf" value="${bf}"> – <input type="date" class="tr-in" id="t-bt" value="${bt}"><button class="primary small" id="t-go">Compare</button></div><p class="fine">${esc(R.method)}</p></section>
    <div class="tr-grid"><section class="card s7"><div class="card-h"><h2>Period A vs period B</h2></div><table class="tt"><thead><tr><th></th><th>A</th><th>B</th><th>Change</th></tr></thead><tbody>
      ${K.map(([k, l]) => `<tr><td>${l}</td><td class="num">${R.a[k] ?? '—'}</td><td class="num">${R.b[k] ?? '—'}</td><td class="num ${R.delta_pct[k] > 30 ? 'bad' : ''}">${R.delta_pct[k] != null ? (R.delta_pct[k] > 0 ? '+' : '') + R.delta_pct[k] + '%' : '—'}</td></tr>`).join('')}</tbody></table></section>
      <section class="card s5"><div class="card-h"><h2>Where the load went</h2></div>${kinds.map((k) => { const x = R.a.kinds[k] || 0, y = R.b.kinds[k] || 0, m = Math.max(1, ...kinds.map((q) => Math.max(R.a.kinds[q] || 0, R.b.kinds[q] || 0))); return `<div class="comp" style="grid-template-columns:110px 1fr"><span class="mini">${esc(k)}</span><div><span class="vbar"><i style="width:${(100 * x) / m}%;background:var(--accent2)"></i></span><span class="vbar"><i style="width:${(100 * y) / m}%;background:var(--accent)"></i></span><div class="mini">A ${fmt(Math.round(x))} · B ${fmt(Math.round(y))} AU</div></div></div>`; }).join('') || '<p class="muted">No sessions in either period.</p>'}</section></div>`;
  $('#tr2-a').onchange = (e) => go('trainings', e.target.value, af, at, bf, bt);
  $('#t-go').onclick = () => go('trainings', $('#tr2-a').value, $('#t-af').value, $('#t-at').value, $('#t-bf').value, $('#t-bt').value);
}

// ================================================================= INTERPRETATION + PROGRAM
function actionsHtml(x) {
  if (!x || (!x.programs?.length && !x.methods?.length && !x.science?.length && !x.sport_drill)) return '';
  return `<div class="mini" style="margin-top:6px">${x.sport_drill ? `<div><b>Sport drill (${esc(x.sport_drill.level)}):</b> ${esc(x.sport_drill.drill)} · easier: ${esc(x.sport_drill.alt_easier)}</div>` : ''}
    ${x.programs?.length ? `<div><b>Programs:</b> ${x.programs.map((p) => `${esc(p.id)} ${esc(p.program)} <small>(${esc(p.duration)})</small>`).join(' · ')}</div>` : ''}
    ${x.methods?.length ? `<div><b>Methods allowed in this phase:</b> ${x.methods.map((m) => `${esc(m.method)} <small>${esc(m.dose)}, evidence ${esc(m.evidence)}</small>`).join(' · ')}</div>` : ''}
    ${x.science?.length ? `<div><b>Science:</b> ${x.science.map((s) => `<span title="${esc(s.refs)}">${esc(s.id)} ${esc(s.concept)} <small>(${esc(s.evidence)})</small></span>`).join(' · ')}</div>` : ''}</div>`;
}
async function insights(main, args) {
  const sel = await athleteSelect('in-a', args[0]);
  if (!sel.first) { main.innerHTML = header('Interpretation & program', '', 'PERFORMANCE') + `<section class="card">${sel.html}</section>`; return; }
  const weeks = +(args[1] || 4), [I, P] = await Promise.all([sci('interpret', { id: sel.first }), sci('plan', { id: sel.first, weeks })]);
  main.innerHTML = `${header('Interpretation & development program', 'Rule-based reading of the athlete\'s tests, load and history, each finding with its rule, its source and matched actions from the workbook; then a development block built from the largest gaps.', 'PERFORMANCE')}
    <section class="card"><div class="bar">${sel.html}<b style="color:${STAGE_COL[String(I.phase)[0]]}">Phase ${esc(I.phase)}</b><span class="mini">next ${esc(I.next_phase || '—')}</span>
      <label class="mini">Weeks <select class="tr-sel" id="in-w">${[2, 3, 4, 6, 8, 12].map((w) => `<option ${w === weeks ? 'selected' : ''}>${w}</option>`).join('')}</select></label>
      <a class="ghost-btn" href="${href('player', I.athlete.id)}">Player development</a></div><p class="fine">${esc(I.note)}</p></section>
    <div class="tr-grid"><section class="card s12"><div class="card-h"><h2>Findings</h2><small>${I.findings.length}</small></div>
      ${I.findings.map((f) => `<div class="note ${LV[f.level][0]}" style="margin:6px 0"><span class="pill ${LV[f.level][0]}">${LV[f.level][1]}</span> <b>${esc(f.finding)}</b><div class="mini">Rule: ${esc(f.rule)} · Source: ${esc(f.source)}</div>${actionsHtml(f.actions)}</div>`).join('') || '<p class="muted">No findings.</p>'}</section>
      <section class="card s12"><div class="card-h"><h2>Development program · ${P.weeks.length} weeks</h2>${src('Load_Schedule · Phase_System · Program_Library · Elite_Methods · Training_Science · Sport_Drills')}</div>
        <p class="mini"><b>Phase aim:</b> ${esc(P.phase_aim || '—')} · <b>RPE target:</b> ${esc(P.rpe_target || '—')} · <b>Sessions/week:</b> ${esc(P.sessions_per_week || '—')} · <b>Emphasis:</b> ${P.lags.map((l) => `${esc(l.code)} (gap ${l.gap})`).join(', ') || 'no lags: follow the phase plan'}</p>
        ${P.weeks.map((w) => `<details ${w.week === 1 ? 'open' : ''} style="margin:6px 0"><summary><b>Week ${w.week}</b> · target ${w.target_load != null ? fmt(w.target_load) + ' AU' : '—'}${w.cap_from_tolerance != null ? ` <small>(cap from tolerance ${fmt(w.cap_from_tolerance)})</small>` : ''}${w.retest.length ? ' · <span class="pill warn">retest</span>' : ''}</summary>
          <table class="tt"><thead><tr><th>Day</th><th>Focus</th><th>Main content</th><th>AU</th><th>Intensity</th></tr></thead><tbody>${w.days.map((d) => `<tr><td>${esc(d['Day label'] || d.Day)}</td><td class="mini">${esc(d['Session focus'])}</td><td class="mini">${esc(d['Main content'])}</td><td class="num">${esc(d['Target load (AU)'])}</td><td class="mini">${esc(d.Intensity)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No load schedule for this sport and stage.</td></tr>'}</tbody></table>
          ${w.emphasis.map((e) => `<div class="note" style="margin-top:6px"><b>${esc(e.code)} · ${esc(e.metric)}</b> (gap ${e.gap})${actionsHtml(e)}</div>`).join('')}
          ${w.retest.length ? `<div class="note warn">Retest: ${w.retest.map((r) => `${esc(r.code)} (${esc(r.protocol)} ${esc(r.test)})`).join(' · ')}</div>` : ''}</details>`).join('')}
        <p class="fine">${esc(P.method)}</p></section></div>`;
  $('#in-a').onchange = (e) => go('insights', e.target.value, weeks); $('#in-w').onchange = (e) => go('insights', $('#in-a').value, e.target.value);
}

// ================================================================= SQUAD LEARNING
async function squad(main, args) {
  const s = args[0] || '', C = await sci('cohort', { sport: s });
  main.innerHTML = `${header('Squad learning', 'What the group\'s data shows: where athletes sit on each test, the smallest worthwhile change for this group, and how each program has moved the tests of the athletes who did it.', 'PERFORMANCE')}
    <section class="card"><div class="bar"><select class="tr-sel" id="sq-s"><option value="">All sports</option>${(await sci('sports')).map((x) => `<option ${x.sport === s ? 'selected' : ''}>${esc(x.sport)}</option>`).join('')}</select><span class="pill acc">${C.athletes} athletes</span></div><p class="fine">${esc(C.method)}</p></section>
    <div class="tr-grid"><section class="card s6"><div class="card-h"><h2>Tests across the squad</h2></div><table class="tt"><thead><tr><th>Metric</th><th>n</th><th>Mean</th><th>SD</th><th>Range</th><th>SWC</th></tr></thead><tbody>${C.tests.map((t) => `<tr><td><b>${esc(t.code)}</b><div class="mini">${esc(t.metric)}</div></td><td class="num">${t.n}</td><td class="num">${t.mean}</td><td class="num">${t.sd ?? '—'}</td><td class="num">${t.min}–${t.max}</td><td class="num">${t.swc ?? '—'}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No tests logged yet.</td></tr>'}</tbody></table></section>
      <section class="card s6"><div class="card-h"><h2>Program responses</h2></div><table class="tt"><thead><tr><th>Program</th><th>Metric</th><th>n</th><th>Mean change</th></tr></thead><tbody>${C.responses.map((r) => `<tr><td>${esc(r.program)}</td><td>${esc(r.code)}</td><td class="num">${r.n}</td><td class="num">${r.mean_change > 0 ? '+' : ''}${r.mean_change}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No athlete has tests both before and after a program assignment yet.</td></tr>'}</tbody></table></section></div>`;
  $('#sq-s').onchange = (e) => go('squad', e.target.value);
}
