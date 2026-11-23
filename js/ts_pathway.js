// Training System: Pathway 4D (condition × phase × day × component), Phases & gates, Sports, Today.
import { S, T, api, post, refreshCompute, esc, fmt, go, href, header, hbar, bindTips, kv, ev, ring, lightCol, phaseLadder, openClinical, openTestTab, STAGE_COL, PAL } from './training.js';

const $ = (s, r = document) => r.querySelector(s);
export async function page(p, main, args) {
  if (p === 'pathway') return pathway(main, args);
  if (p === 'phases') return phases(main, args);
  if (p === 'sports') return sports(main, args);
  if (p === 'today') return today(main, args);
}
const sportsList = () => T('Sports_Demands').map((s) => s.Sport);
const UNDC = { Heavy: 1, Medium: 0.7, Light: 0.42 };

// ================================================================= PATHWAY 4D
async function pathway(main, args) {
  const CM = T('Conditions_Meta'), regions = [...new Set(CM.map((c) => c.Region))];
  const cond = CM.find((c) => c.Condition === args[0])?.Condition || S.prof?.planner?.condition || CM[0].Condition;
  const sport = sportsList().includes(args[1]) ? args[1] : (S.prof?.planner?.sport || 'General / Non-sport');
  main.innerHTML = `${header('Pathway 4D', 'Pick a condition and a sport: the whole road from day 1 to elite performance, day by day. Four dimensions on one view: phase (lanes) × day (across) × daily undulation heavy / medium / light (cell brightness) × progressed dose (curve). Click any day.', 'Pathway')}
    <section class="card"><div class="bar"><label>Condition <select class="tr-sel" id="pw-c">${regions.map((r) => `<optgroup label="${esc(r)}">${CM.filter((c) => c.Region === r).map((c) => `<option ${c.Condition === cond ? 'selected' : ''}>${esc(c.Condition)}</option>`).join('')}</optgroup>`).join('')}</select></label>
      <label>Sport <select class="tr-sel" id="pw-s">${sportsList().map((s) => `<option ${s === sport ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label><span id="pw-meta" class="links-row"></span></div></section>
    <section class="card"><div id="pw-viz"><p class="muted">Building the pathway…</p></div></section>
    <section class="card" id="pw-day"></section>
    <section class="card"><div class="card-h"><h2>Phase by phase</h2><small>Condition_Progression · 8 components per phase</small></div><div id="pw-phases"></div></section>`;
  $('#pw-c').onchange = () => go('pathway', $('#pw-c').value, $('#pw-s').value);
  $('#pw-s').onchange = () => go('pathway', $('#pw-c').value, $('#pw-s').value);
  const P = await api('pathway', { c: cond, sport });
  const m = P.meta, cl = S.B.links.conditions[cond] || [];
  $('#pw-meta').innerHTML = `<span class="pill">${esc(m.Region)} · ${esc(m.Tissue)}</span><span class="pill">${esc(m['Atlas category'])}</span><span class="pill" title="Scales every phase's base days (Phase_Dose)">healing factor ×${esc(m['Healing factor'])}</span><span class="pill acc">${P.total_days} days · ${Math.round(P.total_days / 7)} weeks</span>
    ${cl.length ? `<a class="ghost-btn" href="#" id="pw-sp" title="StatPearls title search (query “${esc(cl[0].query)}”), for reading">StatPearls: ${esc(cl[0].title)}</a>` : ''}<a class="ghost-btn" href="#" id="pw-cs">Search Clinical</a>`;
  $('#pw-sp')?.addEventListener('click', (e) => { e.preventDefault(); openClinical(cl[0].id); });
  $('#pw-cs').onclick = (e) => { e.preventDefault(); location.hash = '#clinical'; import('./clinical.js').then(async (mm) => { await mm.startClinical(); const q = document.querySelector('#cl-q'); if (q) { q.value = cond.replace(/\(.*?\)/g, '').split('–').pop().trim(); q.dispatchEvent(new Event('input')); } }); };
  drawRibbon(P, +args[2] || 1, cond, sport);
  $('#pw-phases').innerHTML = `<div class="tt-wrap" style="max-height:520px"><table class="tt"><thead><tr><th>Phase</th><th>Days</th><th>Key exercise</th><th>Strength</th><th>Power</th><th>Sport drill</th><th>Criteria to progress</th></tr></thead><tbody>
    ${P.phases.map((ph) => { const d = P.days[ph.start - 1]; return `<tr class="click" data-day="${ph.start}"><td><b style="color:${STAGE_COL[ph.code[0]]}">${esc(ph.code)}</b> ${esc(ph.name)}</td><td class="num">${ph.days}<div class="mini">day ${ph.start}–${ph.start + ph.days - 1}</div></td><td>${esc(d.key)}</td><td>${esc(d.strength)}<div class="mini">${esc(d.strength_dose)}</div></td><td>${esc(d.power)}</td><td class="mini">${esc(d.sport_drill)}</td><td class="mini">${esc(d.option_tree.split('▸')[0].replace('✔ ADVANCE if:', ''))}</td></tr>`; }).join('')}</tbody></table></div>`;
  $('#pw-phases').querySelectorAll('[data-day]').forEach((tr) => (tr.onclick = () => drawRibbon(P, +tr.dataset.day, cond, sport)));
}

function drawRibbon(P, day, cond, sport) {
  const W = 1180, lane = 15, top = 34, left = 132, n = P.total_days, dw = (W - left - 20) / n, H = top + P.phases.length * lane + 120;
  const pct = P.days.map((d) => { const m = /@ (\d+)%/.exec(d.strength_dose); return m ? +m[1] : 0; });
  const y0 = top + P.phases.length * lane + 100, ys = (v) => y0 - (v / 100) * 80;
  const curve = pct.map((v, i) => `${i ? 'L' : 'M'}${left + (i + 0.5) * dw},${ys(v)}`).join(' ');
  $('#pw-viz').innerHTML = `<svg class="chart ribbon" viewBox="0 0 ${W} ${H}">
    ${Array.from({ length: Math.ceil(n / 7) }, (_, w) => `<line class="grid" x1="${left + w * 7 * dw}" y1="${top - 6}" x2="${left + w * 7 * dw}" y2="${y0}"/>${w % 4 === 0 ? `<text x="${left + w * 7 * dw + 2}" y="${top - 10}" class="t-muted" font-size="9">wk ${w + 1}</text>` : ''}`).join('')}
    ${P.phases.map((ph, i) => { const y = top + i * lane, c = STAGE_COL[ph.code[0]];
      return `<text x="${left - 6}" y="${y + 11}" text-anchor="end" font-size="10"><tspan style="fill:${c};font-weight:700">${esc(ph.code)}</tspan> ${esc(ph.name.slice(0, 17))}</text>` +
      Array.from({ length: ph.days }, (_, k) => { const d = P.days[ph.start - 1 + k];
        return `<rect class="day-cell" data-d="${d.day}" x="${left + (d.day - 1) * dw}" y="${y + 1}" width="${Math.max(1, dw - 0.6)}" height="${lane - 3}" fill="${c}" opacity="${(0.25 + 0.75 * UNDC[d.undulation]).toFixed(2)}" data-tip="<b>Day ${d.day}</b> · week ${d.week} · ${esc(d.phase)} day ${d.day_in_phase}/${d.phase_days}<br>${esc(d.undulation)} · ${esc(d.strength_dose)}${d.milestone ? `<br>${esc(d.milestone)}` : ''}"/>`; }).join('') +
      `<path d="M${left + (ph.start + ph.days - 1.5) * dw},${y + 2} l3,5 l-3,5 l-3,-5z" fill="#fff" opacity="0.85"><title>Test day: exit criteria for ${esc(ph.code)}</title></path>`; }).join('')}
    <line class="ax" x1="${left}" y1="${y0}" x2="${W - 20}" y2="${y0}"/><text x="${left - 6}" y="${ys(100) + 4}" text-anchor="end" class="t-muted">100%</text><text x="${left - 6}" y="${y0}" text-anchor="end" class="t-muted">0</text>
    <text x="${left - 6}" y="${ys(50) + 4}" text-anchor="end" font-size="10">strength dose</text>
    <path d="${curve}" fill="none" stroke="#ffc067" stroke-width="1.6"/>
    <line id="pw-cur" x1="${left + (day - 0.5) * dw}" y1="${top - 6}" x2="${left + (day - 0.5) * dw}" y2="${y0}" stroke="#fff" stroke-width="1.5" stroke-dasharray="3 3"/></svg>
    <div class="bar" style="margin-top:6px"><label>Day <input type="range" id="pw-range" min="1" max="${n}" value="${day}" style="width:520px"></label><b id="pw-dn" class="mono">day ${day}</b>
    <div class="legend"><span><i style="background:#6fd3ff"></i>heavy</span><span><i style="background:#6fd3ff;opacity:.7"></i>medium</span><span><i style="background:#6fd3ff;opacity:.5"></i>light</span><span><i style="background:#ffc067"></i>strength dose % (MVC in stage 1, 1RM after)</span><span>◆ test day</span></div></div>`;
  bindTips($('#pw-viz'));
  const pick = (d) => { $('#pw-cur').setAttribute('x1', left + (d - 0.5) * dw); $('#pw-cur').setAttribute('x2', left + (d - 0.5) * dw); $('#pw-range').value = d; $('#pw-dn').textContent = `day ${d}`; dayCard(P, d, cond, sport);
    history.replaceState(null, '', href('pathway', cond, sport, String(d))); };
  $('#pw-viz').querySelectorAll('[data-d]').forEach((r) => (r.onclick = () => pick(+r.dataset.d)));
  $('#pw-range').oninput = (e) => pick(+e.target.value);
  pick(day);
}

const choices = {};
async function dayCard(P, d, cond, sport) {
  const x = P.days[d - 1], box = $('#pw-day');
  const plan = await api('dayplan', { c: cond, phase: x.phase, day: x.day_in_phase, sport, choices });
  box.innerHTML = `<div class="card-h"><h2>Day ${d} · week ${x.week} · ${esc(x.phase)} ${esc(x.phase_name)} · day ${x.day_in_phase}/${x.phase_days}</h2>
    <span class="links-row"><span class="pill acc">${esc(plan.undulation)}</span><span class="pill">progress ${Math.round(x.progress * 100)}%</span>${x.milestone ? `<span class="pill warn">${esc(x.milestone)}</span>` : ''}<span class="pill">${esc(x.evidence)}</span></span></div>
    <div class="daycard"><div class="rd-sec"><h4>Today's combined programme (Day_Planner rules)</h4>
      ${plan.rows.map((r) => `<div class="comp"><div><b>${esc(r.label)}</b><div class="mini">${esc(r.session)} · level ${r.level || '—'}</div>${r.level ? `<div class="opts">${['P', 'A', 'B', 'C', 'N'].map((o) => `<button class="${r.option === o ? 'on' : ''}" data-comp="${r.comp}" data-o="${o}" title="${esc({ P: 'Primary', A: 'Alt A: easier, same goal', B: 'Alt B: equipment swap', C: 'Alt C: variation / next step', N: 'New loop combination' }[o])}: ${esc(r.options[o])}">${o}</button>`).join('')}</div>` : ''}</div>
        <div><b>${esc(r.today)}</b><div class="mini">${esc(r.dose)}</div>${r.level ? `<details><summary class="mini">why</summary><p class="mini"><b>Physio</b>: ${esc(r.physio)}</p><p class="mini"><b>S&amp;C</b>: ${esc(r.sc)}</p></details>` : ''}</div></div>`).join('')}
      <p class="mini">Option P is used unless readiness is below 55 (then A). P/A/B/C/N switch one component for this view. Doses are progressed by day in phase and today's undulation.</p></div>
      <div class="rd-sec"><h4>Full pathway day (Full_Pathway rules)</h4>${kv({ 'Strength dose': x.strength_dose, 'Sport drill': x.sport_drill, 'Training load target': x.load_target, 'Game-based drill': x.game,
        'Accelerator #1': x.acc1, 'Why #1': x.acc1_why, 'Accelerator #2': x.acc2, 'Recovery set-up': x.recovery, 'Readiness check tomorrow': x.readiness_check, 'Progression theory': x.theory, 'Biological floor (never skip)': x.floor, 'New loop combination': x.new_combo })}
        <h4 style="margin-top:10px">Session tree</h4><div class="tree">${esc(x.session_tree)}</div>
        <h4 style="margin-top:10px">Option tree</h4><div class="tree">${esc(x.option_tree).replace(/ ▸ /g, '<br>')}</div>
        ${plan.criteria ? `<p class="mini"><b>Criteria to progress</b>: ${esc(plan.criteria)}</p>` : ''}${plan.precautions ? `<p class="mini" style="color:var(--warn)"><b>Precautions</b>: ${esc(plan.precautions)}</p>` : ''}
        <div class="links-row"><a class="ghost-btn" href="${href('phases', x.phase)}">Gates for ${esc(x.phase)}</a><a class="ghost-btn" href="${href('library', JSON.stringify({}))}" id="pw-findkey">Find “${esc(x.key.slice(0, 30))}” in the library</a></div></div></div>`;
  box.querySelectorAll('[data-comp]').forEach((b) => (b.onclick = () => { choices[b.dataset.comp] = b.dataset.o; dayCard(P, d, cond, sport); }));
  $('#pw-findkey').onclick = (e) => { e.preventDefault(); import('./ts_library.js').then(() => { go('library', '{}'); setTimeout(() => { const q = $('#ex-q'); if (q) { q.value = x.key.split('(')[0].trim(); q.dispatchEvent(new Event('input')); } }, 400); }); };
}

// ================================================================= PHASES & GATES
async function phases(main, args) {
  const P = T('Phase_System'), code = P.find((p) => p.Code === args[0])?.Code || S.comp?.final_phase || P[0].Code;
  main.innerHTML = `${header('Phases & gates', 'Test results decide the phase: each of the 22 phases has entry thresholds (Phase_Gates). Enter raw numbers (the % is worked out) or a final value; phases unlock in order. Every phase then sets goals, depth band, %1RM, RPE, sets, reps, tempo, rest, contacts and conditioning.', 'Pathway')}
    <section class="card">${phaseLadder()}</section>
    <div class="tr-grid"><section class="card s5"><div class="card-h"><h2>Gate calculator</h2><span class="links-row"><button class="ghost-btn" id="gt-reset">Workbook values</button><button class="primary small" id="gt-save">Save</button></span></div><div id="gt-form"></div><p class="fine" id="gt-msg"></p></section>
      <section class="card s7"><div class="card-h"><h2>Gate status</h2><small id="gt-auto"></small></div><div id="gt-status"></div></section></div>
    <section class="card" id="ph-card"></section>
    <section class="card"><div class="card-h"><h2>Dose across the 22 phases</h2><small>Phase_Dose start → end values</small></div><div id="ph-dose"></div></section>
    <section class="card"><div class="card-h"><h2>Testing protocols</h2><small>how each gate metric is measured</small></div><div id="ph-tests"></div></section>`;
  bindTips(main);
  const M = T('Phase_Metrics');
  const form = () => { $('#gt-form').innerHTML = `<table class="tt"><thead><tr><th>Metric</th><th>Raw 1</th><th>Raw 2</th><th>Manual</th><th>Final</th></tr></thead><tbody>${M.map((m) => { const x = S.prof.metrics?.[m.Code] || {};
    return `<tr><td><b class="mono">${esc(m.Code)}</b> <span class="mini">${esc(m.Direction)} ${esc(m.Unit)}</span><div class="mini">${esc(m.Metric)}</div></td>${['raw1', 'raw2', 'manual'].map((k) => `<td><input class="tr-in" style="width:70px" data-m="${esc(m.Code)}" data-k="${k}" value="${esc(x[k] ?? '')}"></td>`).join('')}<td class="num mono" id="fv-${esc(m.Code)}">${esc(S.comp?.values?.[m.Code] ?? '')}</td></tr>`; }).join('')}</tbody></table>`;
    $('#gt-form').querySelectorAll('input').forEach((i) => (i.oninput = async () => { S.prof.metrics ||= {}; (S.prof.metrics[i.dataset.m] ||= {})[i.dataset.k] = i.value; await refreshCompute(); status(); M.forEach((m) => { const c = $(`#fv-${m.Code}`); if (c) c.textContent = S.comp.values[m.Code] ?? ''; }); })); };
  const status = () => { const g = S.comp.gates;
    $('#gt-auto').innerHTML = `auto phase <b>${esc(g.auto_phase)}</b> · your phase <b>${esc(S.comp.final_phase)}</b>${g.unmet_next ? ` · next needs ${esc(g.unmet_next)}` : ''}`;
    $('#gt-status').innerHTML = g.rows.map((r) => `<div class="gate ${r.status.includes('CURRENT') ? 'current' : r.cumulative ? 'passed' : 'locked'}"><b style="color:${STAGE_COL[r.phase[0]]}">${esc(r.phase)}</b><span>${esc(r.name)}${r.unmet.length ? `<div class="mini" style="color:var(--warn)">needs ${esc(r.unmet.join(' · '))}</div>` : ''}</span><span class="pill ${r.status.includes('CURRENT') ? 'acc' : r.cumulative ? 'ok' : ''}">${esc(r.status)}</span></div>`).join(''); };
  form(); status();
  $('#gt-save').onclick = async () => { try { const r = await post('profile', S.prof); $('#gt-msg').textContent = `Saved ${r.saved} to data/anatomy_lab/training_system/profile.json (this machine only).`; } catch (e) { $('#gt-msg').textContent = e.message; } };
  $('#gt-reset').onclick = async () => { const w = await fetch('/training-4D/rt/training_system/profile_workbook.json').then((r) => r.json()); S.prof.metrics = w.metrics; await refreshCompute(); form(); status(); };
  phaseCard(code);
  // dose small multiples
  const PD = T('Phase_Dose'), series = [['%1RM start', '%1RM end', '%1RM (MVC in stage 1)', 100, '#ffc067'], ['Contacts start', 'Contacts end', 'plyo contacts', null, '#ff8fa3'], ['Conditioning min start', 'Conditioning min end', 'conditioning min', null, '#64e6a8'], ['Sport min start', 'Sport min end', 'sport min', null, '#6fd3ff'], ['Mobility hold s start', 'Mobility hold s end', 'mobility hold s', null, '#b49bff'], ['Activation s start', 'Activation s end', 'activation s', null, '#7cf0e0']];
  $('#ph-dose').innerHTML = `<div class="tr-grid">${series.map(([a, b, l, sc, c]) => { const vals = PD.flatMap((d) => [+d[a] * (sc || 1), +d[b] * (sc || 1)]), mx = Math.max(1, ...vals), W = 360, H = 120, dx = (W - 30) / PD.length;
    return `<div class="s4"><div class="mini">${esc(l)}</div><svg class="chart" viewBox="0 0 ${W} ${H}">${PD.map((d, i) => { const y1 = H - 16 - ((+d[a] * (sc || 1)) / mx) * (H - 30), y2 = H - 16 - ((+d[b] * (sc || 1)) / mx) * (H - 30);
      return `<line x1="${20 + i * dx + 2}" y1="${y1}" x2="${20 + (i + 1) * dx - 2}" y2="${y2}" stroke="${c}" stroke-width="3" stroke-linecap="round" data-tip="${esc(d.Phase)}: ${esc(d[a])} → ${esc(d[b])}"/>${i % 3 === 0 ? `<text x="${20 + i * dx}" y="${H - 3}" font-size="8" class="t-muted">${esc(d.Phase)}</text>` : ''}`; }).join('')}<text x="2" y="12" font-size="9" class="t-muted">${fmt(Math.round(mx))}</text></svg></div>`; }).join('')}</div>`;
  bindTips($('#ph-dose'));
  $('#ph-tests').innerHTML = `<div class="tt-wrap" style="max-height:480px"><table class="tt"><thead><tr><th>ID</th><th>Test</th><th>Metric</th><th>Protocol</th><th>Scoring</th><th>Threshold / norm</th><th>Reliability</th><th>Phases</th></tr></thead><tbody>${T('Testing_Protocols').map((t) => `<tr><td class="mono">${esc(t.ID)}</td><td><b>${esc(t.Test)}</b><div class="mini">${esc(t.Equipment)}</div>${(S.B.links.tests[t.ID] || []).map((x) => `<a class="lk mini" href="#" data-test="${esc(x.id)}">Tests &amp; labs: ${esc(x.name)}</a>`).join(' ')}</td><td class="mono">${esc(t['Feeds Metric'])}</td><td class="mini">${esc(t['Protocol (step by step)'])}</td><td class="mini">${esc(t['Scoring / Calculation'])}</td><td class="mini">${esc(t['Threshold / Norm'])}</td><td class="mini">${esc(t.Reliability)}</td><td class="mini">${esc(t['Phases Used'])}</td></tr>`).join('')}</tbody></table></div>`;
  $('#ph-tests').querySelectorAll('[data-test]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); openTestTab(a.dataset.test); }));
}

function phaseCard(code) {
  const p = T('Phase_System').find((x) => x.Code === code), d = T('Phase_Dose').find((x) => x.Phase === code), a = T('Accel_Phase').find((x) => x.Phase === code), g = T('Phase_Gates').find((x) => x.Phase === code);
  const tests = String(p['Exit Tests (protocol IDs)']).split(/[,;]\s*/).map((t) => T('Testing_Protocols').find((x) => x.ID === t.trim())).filter(Boolean);
  const th = Object.entries(g || {}).filter(([k, v]) => /(<=|>=)$/.test(k) && v !== '').map(([k, v]) => `${k} ${v}`);
  $('#ph-card').innerHTML = `<div class="card-h"><h2 style="color:${STAGE_COL[code[0]]}">${esc(code)} · ${esc(p['Phase Name'])} <small>${esc(p.Stage)}</small></h2>
    <span class="links-row">${T('Phase_System').map((x) => `<a class="chip-btn ${x.Code === code ? 'on' : ''}" href="${href('phases', x.Code)}" style="text-decoration:none">${esc(x.Code)}</a>`).join('')}</span></div>
    <div class="daycard"><div class="rd-sec"><h4>Training state and aim</h4>${kv(p, ['Tissue / Training State', 'Primary Aim', 'Allowed Goals (auto filter)', 'Depth Min', 'Depth Max', 'Typical Duration', 'Regress If', 'Atlas Equivalent'])}
      <h4 style="margin-top:10px">Entry gate</h4><p class="mini">${th.length ? esc(th.join(' · ')) : 'no threshold (entry phase)'}</p>
      <h4 style="margin-top:10px">Exit tests</h4>${tests.map((t) => `<p class="mini"><b>${esc(t.ID)} ${esc(t.Test)}</b>: ${esc(t['Threshold / Norm'])}</p>`).join('')}</div>
    <div class="rd-sec"><h4>Dose</h4>${kv(p, ['%1RM Range', 'RPE Target', 'Sets (auto)', 'Reps / Duration', 'Tempo', 'Rest', 'Sessions / Week', 'Weekly Hard Sets per Muscle', 'Plyo Contacts / Session', 'Conditioning', 'Mobility & Recovery'])}
      ${d ? `<p class="mini">Base days ${esc(d['Base days'])} (× the condition's healing factor) · %1RM ${esc(d['%1RM start'])} → ${esc(d['%1RM end'])} · conditioning ${esc(d['Conditioning min start'])}→${esc(d['Conditioning min end'])} min ${esc(d['Conditioning intensity'])}</p>` : ''}</div>
    ${a ? `<div class="rd-sec"><h4>Accelerator tree</h4>${kv(a, ['Fast-track aim', 'Loading model', 'Load start', 'Load end', 'Unit', 'Weekly load rule', '✔ ADVANCE / fast-track if…', '~ HOLD response', '✖ REGRESS trigger → option', 'Biological floor (never skip)', 'Progression theory in play'])}${ev(a.Evidence)}</div>
      <div class="rd-sec"><h4>Session tree template</h4><div class="tree">${esc(a['Combined session tree ({KEY} {STR} {PWR} {ACC} {GAME} {REC} auto-filled)'])}</div>
      <h4 style="margin-top:10px">Accelerator methods for stage ${esc(code[0])}</h4>${T('Accel_Methods').filter((m) => +m['Min band'] <= +code[0] && +code[0] <= +m['Max band']).map((m) => `<p class="mini"><b>${esc(m.Method)}</b> (${esc(m['Day type'])}) — ${esc(m.Dose)}. ${esc(m['Physio mechanism'])} ${ev(m.Evidence)}</p>`).join('')}</div>` : ''}</div>`;
}

// ================================================================= SPORTS
async function sports(main, args) {
  const SD = T('Sports_Demands'), s = SD.find((x) => x.Sport === args[0]) || SD.find((x) => x.Sport === S.prof?.planner?.sport) || SD[0];
  const fam = T('Sport_Family').find((x) => x.Sport === s.Sport) || {}, grp = T('Sport_Family_Groups').find((g) => g.Family === fam.Family) || {};
  const alias = Object.entries(S.B.links.atlas_sport_alias).filter(([, v]) => v === s.Sport).map(([k]) => k);
  const AS = T('Atlas_Sports').filter((a) => alias.includes(a.Sport)), topics = Object.fromEntries(T('Atlas_Topics').map((t) => [t.ID, t]));
  main.innerHTML = `${header('Sports', `${SD.length} sports: energy systems, movements, qualities, injuries, elite targets, a 6-level drill ladder, a weekly load plan per stage, warm-ups and games, linked to the knowledge atlas.`, 'Pathway')}
    <section class="card"><div class="chips">${SD.map((x) => `<a class="chip-btn ${x.Sport === s.Sport ? 'on' : ''}" href="${href('sports', x.Sport)}" style="text-decoration:none">${esc(x.Sport)}</a>`).join('')}</div></section>
    <div class="tr-grid"><section class="card s6"><div class="card-h"><h2>${esc(s.Sport)} <small>${esc(s.Type)}</small></h2><span class="links-row"><span class="pill acc">${esc(fam.Family || '—')} family</span><span class="pill">${esc(fam['Schedule type'] || '')}</span><a class="ghost-btn" href="${href('pathway', S.prof?.planner?.condition || T('Conditions_Meta')[0].Condition, s.Sport)}">Pathway with this sport</a></span></div>
      ${kv(s, ['Energy Systems (approx.)', 'Key Movements', 'Key Physical Qualities', 'Positions / Roles', 'Common Injuries', 'Elite KPI / Test Targets', 'Unique Skills to Train', 'Ultimate-Performer Focus', 'Prehab Priorities', 'Season Structure'])}
      ${grp['Highest-intensity action (clearance target)'] ? `<p class="mini"><b>Clearance target for the ${esc(fam.Family)} family</b>: ${esc(grp['Highest-intensity action (clearance target)'])} · same family: ${esc(grp['Sports in family'])}</p>` : ''}</section>
      <section class="card s6"><div class="card-h"><h2>Drill ladder: 6 levels</h2><small>levels map to phases</small></div>${T('Sport_Drills').filter((d) => d.Sport === s.Sport).map((d, i) => `<div class="comp"><div><b style="color:${PAL[i]}">${esc(d['Level name'])}</b><div class="mini">phases ${esc(d['Typical phases'])}</div></div><div><b>${esc(d['PRIMARY drill'])}</b><div class="mini">A: ${esc(d['Alt A — easier, same goal'])} · B: ${esc(d['Alt B — different set-up, same demand'])} · C: ${esc(d['Alt C — variation / perceptual'])}</div><div class="mini">${esc(d['Physio justification'])} · ${esc(d['S&C justification'])}</div></div></div>`).join('')}</section>
      <section class="card s12"><div class="card-h"><h2>Weekly load plan</h2><span class="bar"><label>Stage <select class="tr-sel" id="ls-st">${S.B.facets.Load_Schedule.Stage.map(([v]) => v).sort().map((v) => `<option>${esc(v)}</option>`).join('')}</select></label></span></div><div id="ls"></div></section>
      ${AS.length ? `<section class="card s12"><div class="card-h"><h2>Knowledge atlas for ${esc(s.Sport)}</h2></div>${AS.map((a) => `<div class="rd-sec" style="margin-bottom:8px"><h4>${esc(a.Sport)} · ${esc(a.Category)}</h4>${kv(a, ['Energy & physical profile', 'Key movements & demands', 'Most common injuries', 'Key tests', 'Return-to-sport specifics', 'India context'])}
        ${['Injury topic IDs', 'Surgery topic IDs', 'Rehab & prevention topic IDs', 'Performance topic IDs'].map((col) => `<p class="mini"><b>${esc(col.replace(' topic IDs', ''))}</b>: ${String(a[col] || '').split('|').filter(Boolean).map((id) => `<a class="lk" href="${href('atlas', 'topic', id)}" title="${esc(topics[id]?.Topic || 'not found')}">${esc(id)} ${esc(topics[id]?.Topic || '(missing)')}</a>`).join(' · ')}</p>`).join('')}</div>`).join('')}</section>` : `<section class="card s12"><p class="mini">No Atlas_Sports row is matched to ${esc(s.Sport)} by name (Validation lists the unmatched ones).</p></section>`}
      <section class="card s12"><div class="card-h"><h2>Games for the ${esc(fam.Family || '')} family</h2><a class="ghost-btn" href="${href('drills')}">All drills</a></div><div class="cardlist">${T('Training_Games').filter((g) => g.Families.includes('|ALL|') || g.Families.includes(`|${fam.Family}|`)).map((g) => `<a class="card" style="text-decoration:none;color:inherit" href="${href('drills', g['Game ID'])}"><h4>${esc(g.Game)}</h4><p class="mini">${esc(g.Type)} · ${esc(g.Quality)}</p><p class="mini">${esc(g['How to play']).slice(0, 160)}</p>${ev(g.Evidence)}</a>`).join('')}</div></section></div>`;
  const ls = async () => {
    const r = await api('table', { t: 'Load_Schedule', f: { Sport: s.Sport, Stage: $('#ls-st').value }, lim: 14 });
    const X = r.rows.map((x) => Object.fromEntries(r.cols.map((c, i) => [c, x[i + 1]]))), mx = Math.max(1, ...X.map((x) => +x['Target load (AU)'] || 0)), W = 1100, H = 190, bw = (W - 40) / Math.max(1, X.length);
    $('#ls').innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}">${X.map((x, i) => { const v = +x['Target load (AU)'] || 0, h = (v / mx) * (H - 60);
      return `<g data-tip="<b>${esc(x.Day)} · ${esc(x['Day label'])}</b><br>${esc(x['Session focus'])}<br>${esc(x['Main content'])}<br>${esc(x.Intensity)} · warm-up ${esc(x['Warm-up ID'])}<br><i>${esc(x.Reasoning)}</i>"><rect x="${20 + i * bw + 6}" y="${H - 40 - h}" width="${bw - 12}" height="${h}" rx="6" fill="${PAL[i % PAL.length]}" opacity="0.8"/>
        <text x="${20 + i * bw + bw / 2}" y="${H - 44 - h}" text-anchor="middle">${fmt(v)} AU</text><text x="${20 + i * bw + bw / 2}" y="${H - 24}" text-anchor="middle" style="font-weight:650">${esc(x.Day)} ${esc(x['Day label'] !== x.Day ? x['Day label'] : '')}</text><text x="${20 + i * bw + bw / 2}" y="${H - 10}" text-anchor="middle" class="t-muted" font-size="9">${esc(String(x['Session focus']).slice(0, 26))}</text></g>`; }).join('')}</svg>
      <p class="mini">${esc(X[0]?.['Schedule type'] || '')} · ${esc(X[0]?.['Stage rule'] || '')} · load = session RPE × minutes (AU). Weekly total ${fmt(X.reduce((a, x) => a + (+x['Target load (AU)'] || 0), 0))} AU.</p>`;
    bindTips($('#ls'));
  };
  $('#ls-st').onchange = ls; ls();
}

// ================================================================= TODAY
async function today(main) {
  const C = S.comp, rd = C.readiness, P = S.prof;
  const Rk = [['sleep_q', 'Sleep quality (1-5)'], ['soreness', 'Muscle soreness (5 = none)'], ['fatigue', 'Fatigue (5 = fresh)'], ['stress', 'Stress (5 = calm)'], ['mood', 'Mood (1-5)'], ['sleep_h', 'Sleep hours last night'], ['hrv', 'HRV % of baseline'], ['cmj', 'CMJ % of baseline'], ['manual', 'Manual volume modifier']];
  const cond = P.planner?.condition || T('Conditions_Meta')[0].Condition;
  main.innerHTML = `${header('Today', 'Readiness check → volume modifier → today\'s session from the 42,709-exercise library (phase rules) and today\'s condition plan. Timeline and supplements from your Daily_Schedule and Supplements selections.', 'Command')}
    <div class="tr-grid"><section class="card s4"><div class="card-h"><h2>Readiness</h2><button class="primary small" id="rd-save">Save</button></div><div style="display:flex;gap:14px;align-items:center"><div id="rd-ring">${ring(rd.score, 100, 'readiness', lightCol(rd.score))}</div><div id="rd-txt"></div></div>
      <div class="formgrid" style="margin-top:8px">${Rk.map(([k, l]) => `<label>${esc(l)}<input class="tr-in" data-r="${k}" value="${esc(P.readiness?.[k] ?? '')}"></label>`).join('')}</div><p class="fine" id="rd-msg">Score = mean of the five 1-5 ratings × 20, minus 10 each for sleep under 7 h, HRV under 90%, CMJ under 92% (Daily_Schedule). ≥75 green ×1 · ≥55 amber ×0.8 · else red ×0.5.</p></section>
      <section class="card s8"><div class="card-h"><h2>Session builder</h2><small id="sb-info"></small></div>
        <div class="bar"><label>Phase <select class="tr-sel" id="sb-ph">${T('Phase_System').map((p) => `<option ${p.Code === C.final_phase ? 'selected' : ''}>${esc(p.Code)}</option>`).join('')}</select></label>
        <label>Goal <select class="tr-sel" id="sb-g"><option>Auto</option>${S.B.facets.Exercise_Library.Goal.map(([g]) => `<option>${esc(g)}</option>`).join('')}</select></label>
        <label>Region <select class="tr-sel" id="sb-r"><option>Any</option>${S.B.facets.Exercise_Library.Region.map(([g]) => `<option>${esc(g)}</option>`).join('')}</select></label>
        <label>Category has <input class="tr-in" id="sb-cat" style="width:120px" placeholder="e.g. Knee"></label><label>Name has <input class="tr-in" id="sb-name" style="width:120px"></label>
        <label>Seed <input class="tr-in" id="sb-seed" type="number" value="${esc(P.planner?.seed || 7919)}" style="width:80px"></label><label>Show <input class="tr-in" id="sb-n" type="number" value="10" min="1" max="15" style="width:56px"></label>
        <button class="ghost-btn" id="sb-new">New picks</button></div><div id="sb-out" style="margin-top:8px"></div></section>
      <section class="card s12"><div class="card-h"><h2>Today's condition plan</h2><span class="bar"><label>Condition <select class="tr-sel" id="tp-c">${T('Conditions_Meta').map((c) => `<option ${c.Condition === cond ? 'selected' : ''}>${esc(c.Condition)}</option>`).join('')}</select></label><label>Day in phase <input class="tr-in" id="tp-d" type="number" min="1" value="1" style="width:60px"></label></span></div><div id="tp"></div></section>
      <section class="card s7"><div class="card-h"><h2>Daily timeline</h2><small>Daily_Schedule (saved in the workbook)</small></div><div class="tt-wrap" style="max-height:520px"><table class="tt"><thead><tr><th>Time</th><th>Block</th><th>What to do</th><th>Nutrition</th><th>Supplements</th></tr></thead><tbody>${T('Daily_Timeline').map((t) => `<tr><td class="mono">${esc(t.Time)}</td><td><b>${esc(t.Block)}</b></td><td class="mini">${esc(t['What to do (by day type)'])}</td><td class="mini">${esc(t['Nutrition (auto from body mass)'])}</td><td class="mini">${esc(t['Supplements (from your Supplements selection)'])}</td></tr>`).join('')}</tbody></table></div></section>
      <section class="card s5"><div class="card-h"><h2>Supplement stack by time</h2><a class="ghost-btn" href="${href('nutrition')}">Edit</a></div><div id="sup-stack"></div></section></div>`;
  const rdUpd = async () => { await refreshCompute(); const r = S.comp.readiness; $('#rd-ring').innerHTML = ring(r.score, 100, 'readiness', lightCol(r.score)); $('#rd-txt').innerHTML = `<b style="color:${lightCol(r.score)}">${esc(r.light)}</b><div class="mini">volume modifier ×${esc(r.final)}</div>`; };
  main.querySelectorAll('[data-r]').forEach((i) => (i.oninput = () => { (P.readiness ||= {})[i.dataset.r] = i.value; rdUpd().then(sb); }));
  $('#rd-save').onclick = async () => { const r = await post('profile', P); $('#rd-msg').textContent = `Saved ${r.saved} (profile.json, this machine only).`; };
  rdUpd();
  const sb = async () => {
    const s = await api('session', { phase: $('#sb-ph').value, goal: $('#sb-g').value, region: $('#sb-r').value, cat: $('#sb-cat').value, name: $('#sb-name').value, seed: $('#sb-seed').value, n: $('#sb-n').value, volume: S.comp.readiness.final });
    $('#sb-info').textContent = `${fmt(s.matches)} matches · goals ${s.goals.join(', ')} · depth L${s.depth.join('–L')} · ${s.equipment_on ? `${s.equipment_on.length} equipment classes on` : 'all equipment'}`;
    $('#sb-out').innerHTML = `<p class="mini" style="margin-top:0">Phase ${esc(s.phase)} ${esc(s.phase_name)}: ${Object.entries(s.params).map(([k, v]) => `${esc(k)} ${esc(v)}`).join(' · ')}</p>
      <div class="tt-wrap" style="max-height:440px"><table class="tt"><thead><tr><th>#</th><th>Exercise</th><th>Pattern · equipment</th><th>Today (auto)</th><th>Easier / harder</th></tr></thead><tbody>${s.picks.map((p, i) => `<tr class="click" data-row="${p.row}"><td>${i + 1}</td><td><b>${esc(p['Exercise Name'])}</b><div class="mini">${esc(p.Goal)} · L${esc(p['Depth (1-6)'])} · ${esc(p.Category)}</div></td><td class="mini">${esc(p['Movement Pattern'])} · ${esc(p['Equipment Class'])}</td><td class="mini">${esc(p.auto)}</td><td class="mini">↓ ${esc(p['Regression (Easier)'])}<br>↑ ${esc(p['Standard Progression'])}</td></tr>`).join('')}</tbody></table></div>
      <p class="fine">Same rule as the workbook's Session_Builder: goal in the phase's allowed goals, depth in its band, equipment you have switched on, ranked by MOD(row × seed, 1000003). Change the seed for new picks.</p>`;
    $('#sb-out').querySelectorAll('[data-row]').forEach((tr) => (tr.onclick = () => go('library', '{}', tr.dataset.row)));
  };
  ['#sb-ph', '#sb-g', '#sb-r'].forEach((id) => ($(id).onchange = sb)); ['#sb-cat', '#sb-name', '#sb-seed', '#sb-n'].forEach((id) => ($(id).onchange = sb));
  $('#sb-new').onclick = () => { $('#sb-seed').value = Math.floor(Math.random() * 999983) + 1; sb(); };
  sb();
  const tp = async () => {
    const plan = await api('dayplan', { c: $('#tp-c').value, phase: C.final_phase, day: $('#tp-d').value });
    $('#tp').innerHTML = `<p class="mini" style="margin-top:0">${esc(plan.condition)} · ${esc(plan.phase)} ${esc(plan.phase_name)} · day ${plan.day}/${plan.days} · ${esc(plan.undulation)} · ${esc(plan.region)}</p><div class="daycard">${['AM', 'Midday', 'PM'].map((slot) => `<div class="rd-sec"><h4>${slot}</h4>${plan.rows.filter((r) => r.session === slot && r.level).map((r) => `<div class="comp"><div><b>${esc(r.label)}</b></div><div><b>${esc(r.today)}</b><div class="mini">${esc(r.dose)}</div></div></div>`).join('') || '<p class="mini">—</p>'}</div>`).join('')}</div>
      <a class="ghost-btn" href="${href('pathway', plan.condition)}">Open the full pathway</a>`;
  };
  $('#tp-c').onchange = tp; $('#tp-d').onchange = tp; tp();
  const mass = parseFloat(P.identity?.['Body mass (kg)']) || 0, use = T('Supplements').filter((x) => String(P.supplements?.[x.ID] || '').toLowerCase() === 'yes');
  const slots = ['Wake', 'Breakfast', 'Pre', 'Intra', 'Post', 'Lunch', 'Dinner', 'Bed'];
  $('#sup-stack').innerHTML = slots.map((sl) => { const xs = use.filter((x) => String(x['Timing Slots']).includes(`|${sl}|`));
    return `<div class="comp"><div><b>${sl}</b></div><div class="mini">${xs.map((x) => `${esc(x.Supplement)} <b>${esc(x['Dose per kg'] ? `${(Math.round(+x['Dose per kg'] * mass * 10) / 10)} ${x.Unit}` : x['Fixed / Standard Dose'])}</b>`).join('; ') || '—'}</div></div>`; }).join('') + `<p class="fine">${use.length} selected · doses from body mass ${mass} kg where the workbook gives a per-kg dose. Educational; check with a clinician or sports dietitian, and see Prohibited substances if tested.</p>`;
}
void hbar;
