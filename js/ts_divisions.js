// Training 4D · Divisions: one page per training quality (sprinting & speed, agility, power & plyometrics, max strength,
// hypertrophy, strength endurance, conditioning, mobility, motor control & balance, rehab & activation, recovery,
// sport skill) with the L1 -> L6 ladder, exercises and their progression chains, equipment, set-up, phase doses,
// biomechanics and forces as multiples of body weight, programs, drills, science, and a knowledge ladder;
// plus a mixed-program builder (C3 order, C5 concurrent, C4 x2 contrast, N15 x3 French contrast).
// Data: /api/ts/div/* (anatomy_lab/training_divisions.py), the owner's workbook only.
import { esc, fmt, go, href, header, STAGE_COL } from './training.js';

const $ = (s, r = document) => r.querySelector(s);
const div = async (route, params = {}) => { const u = new URL(`/api/ts/div/${route}`, location.origin); Object.entries(params).forEach(([k, v]) => v != null && v !== '' && u.searchParams.set(k, v)); const r = await fetch(u); const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || r.statusText); return j; };
const LC = ['#64e6a8', '#6fd3ff', '#8fa8ff', '#b49bff', '#ffc067', '#ff8fa3'];
const src = (t) => `<span class="mini" title="Source">⟶ ${esc(t)}</span>`;

export async function page(p, main, args) {
  try {
    if (p === 'divisions') return args[0] ? await division(main, args) : await hub(main);
    if (p === 'mixed') return await mixed(main, args);
  } catch (e) { console.error(e); main.innerHTML = `<section class="card"><p class="muted">${esc(e.message)}</p></section>`; }
}

// ================================================================= HUB
async function hub(main) {
  const L = await div('list');
  main.innerHTML = `${header('Training divisions', 'Every training quality as its own division: the six-level ladder from foundational to elite, the exercises at each level with their progression chains, equipment and set-up, phase doses, biomechanics and body-weight force multiples, programs, drills and the science behind it.', 'DIVISIONS')}
    <div class="kpis">${L.map((d, i) => `<a class="kpi" href="${href('divisions', d.id)}" style="--c:${LC[i % 6]};text-decoration:none"><b>${esc(d.name)}</b><span>${fmt(d.n)} exercises</span>
      <span class="lvlbar">${[1, 2, 3, 4, 5, 6].map((l) => `<i title="L${l}: ${d.by_level[l]}" style="flex:${Math.max(0.15, Math.log10(1 + d.by_level[l]))};background:${LC[l - 1]}"></i>`).join('')}</span></a>`).join('')}</div>
    <section class="card"><div class="card-h"><h2>Combine divisions</h2></div><p>Build a mixed program (for example sprint + power + strength + hypertrophy + conditioning) ordered and split by the workbook's own rules, with ×2 contrast pairs and ×3 French-contrast triads where they apply.</p><a class="primary small" href="${href('mixed')}" style="text-decoration:none">Open the mixed program builder →</a></section>
    <style>.lvlbar{display:flex;gap:2px;height:6px;margin-top:6px;border-radius:3px;overflow:hidden}.lvlbar i{display:block}</style>`;
}

// ================================================================= DIVISION
async function division(main, args) {
  const id = args[0], level = args[1] || '', eq = args[2] || '', bw = args[3] === 'bw';
  const D = await div('get', { d: id, level, eq, bw: bw ? 1 : '', lim: 40 });
  const all = await div('list');
  const nav = `<div class="bar">${all.map((d) => `<a class="chip-btn ${d.id === id ? 'on' : ''}" href="${href('divisions', d.id)}" style="text-decoration:none">${esc(d.name)}</a>`).join('')}</div>`;
  const ladder = D.ladder.map((r, i) => `<a class="ladder ${String(i + 1) === String(level) ? 'on' : ''}" href="${href('divisions', id, i + 1, eq, bw ? 'bw' : '')}" style="--c:${LC[i]}">
      <b>${esc(r.Name)}</b><span class="mini">${esc(r['What it means'])}</span><span class="mini"><b>Entry:</b> ${esc(r['Entry requirement'] || '—')}</span><span class="mini"><b>Phases:</b> ${esc(r['Phases where used'] || '—')}</span><em>${fmt(D.by_level[i + 1])} exercises</em></a>`).join('');
  const eqRows = D.equipment.slice(0, 14).map(([k, xs]) => { const t = xs.reduce((a, b) => a + b, 0), mx = Math.max(...D.equipment.map(([, y]) => y.reduce((a, b) => a + b, 0))); return `<a class="comp click" href="${href('divisions', id, level, k === eq ? '' : k, bw ? 'bw' : '')}" style="grid-template-columns:150px 1fr 50px;text-decoration:none;${k === eq ? 'outline:1px solid var(--accent)' : ''}"><span class="mini">${esc(k)}</span><span class="stack">${xs.map((x, i) => `<i style="width:${(100 * x) / mx}%;background:${LC[i]}" title="L${i + 1}: ${x}"></i>`).join('')}</span><span class="num mini">${fmt(t)}</span></a>`; }).join('');
  main.innerHTML = `${header(D.name, `${fmt(D.n)} exercises in this division (goal${D.goals.length > 1 ? 's' : ''}: ${esc(D.goals.join(', '))}), from foundational to elite. Pick a level, an equipment class or body-weight only; open an exercise for its full progression chain, joint angles, cues and errors.`, 'DIVISIONS')}
    <section class="card">${nav}</section>
    <section class="card"><div class="card-h"><h2>Level ladder · easy → elite</h2>${src('Depth_Model')}</div><div class="ladders">${ladder}</div></section>
    <div class="tr-grid">
      <section class="card s8"><div class="card-h"><h2>Exercises ${level ? `· L${esc(level)}` : '· all levels'}${eq ? ` · ${esc(eq)}` : ''}${bw ? ' · body weight' : ''}</h2>
        <div class="bar"><input class="tr-in" id="dv-q" placeholder="Search name, pattern, muscle"><label class="mini"><input type="checkbox" id="dv-bw" ${bw ? 'checked' : ''}> Body weight only</label>${level || eq || bw ? `<a class="ghost-btn" href="${href('divisions', id)}">Clear</a>` : ''}<span class="mini">${fmt(D.total)} match</span></div></div>
        <div class="tt-wrap" style="max-height:560px"><table class="tt" id="dv-ex"><thead><tr><th>L</th><th>Exercise</th><th>Equipment · set-up</th><th>Sets × reps</th><th>Load</th><th>RPE</th><th>Rest</th><th>Tempo</th></tr></thead><tbody>${rows(D.exercises)}</tbody></table></div>
        <div id="dv-detail"></div></section>
      <section class="card s4"><div class="card-h"><h2>Equipment by level</h2>${src('Exercise_Library')}</div>${eqRows}<p class="fine">Bars are coloured L1 → L6. Click a class to filter. 3D equipment models with their loads are in Motion Lab → Equipment (4D).</p>
        <div class="card-h" style="margin-top:10px"><h2>Phase doses</h2>${src('Phase_System (Allowed Goals)')}</div><div class="tt-wrap" style="max-height:330px"><table class="tt"><thead><tr><th>Phase</th><th>%1RM</th><th>RPE</th><th>Sets × reps</th><th>Rest</th><th>Plyo</th></tr></thead><tbody>${D.phases.map((p) => `<tr><td><b style="color:${STAGE_COL[String(p.Code)[0]]}">${esc(p.Code)}</b></td><td class="mini">${esc(p['%1RM Range'])}</td><td class="mini">${esc(p['RPE Target'])}</td><td class="mini">${esc(p['Sets (auto)'])} × ${esc(p['Reps / Duration'])}</td><td class="mini">${esc(p.Rest)}</td><td class="mini">${esc(p['Plyo Contacts / Session'])}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No phase lists this goal.</td></tr>'}</tbody></table></div></section>
      <section class="card s6"><div class="card-h"><h2>Biomechanics</h2>${src('Anatomy_Map')}</div>${D.biomechanics.map((b) => `<details><summary><b>${esc(b.base)}</b></summary><p class="mini"><b>Prime movers:</b> ${esc(b['Prime movers (agonists)'])}</p><p class="mini"><b>Tendons:</b> ${esc(b['Tendons loaded'])}</p><p class="mini"><b>Ligaments / capsule:</b> ${esc(b['Ligaments / capsule / fascia stressed'])}</p><p class="mini"><b>Joint angles:</b> ${esc(b['Joint angles & range'])}</p><p class="mini"><b>Line of force:</b> ${esc(b['Body position & line of force'])}</p></details>`).join('') || '<p class="muted">—</p>'}
        <div class="card-h" style="margin-top:10px"><h2>Body force · multiples of body weight</h2><small>${D.n_forces} stated</small></div>
        ${D.forces.map((f) => `<div class="comp" style="grid-template-columns:64px 1fr"><b class="mono" style="color:var(--hot)">×${esc(f.multiple)}</b><div><span class="mini">“${esc(f.quote)}”</span><div class="mini">${esc(f.exercise)}${f.level ? ` · L${f.level}` : ''} · ${esc(f.where)}</div></div></div>`).join('') || '<p class="mini">No force multiple is stated for this division in the workbook.</p>'}
        <p class="fine">Quoted from the workbook. Motion Lab 4D → Biomechanics estimates the ground reaction as % of body weight live from your own movement (estimate, not a force plate).</p></section>
      <section class="card s6"><div class="card-h"><h2>×2 / ×3 combinations</h2>${src('Training_Science')}</div>${D.combos.map((c) => `<div class="note" style="margin:6px 0"><b>${esc(c.ID)} ${esc(c.Concept)}</b> <span class="pill">${esc(c['Evidence level'])}</span><div class="mini">${esc(c['Evidence-based dose'])}</div><div class="mini">${esc(c['How to use in this system'])}</div></div>`).join('')}
        <a class="ghost-btn" href="${href('mixed', id)}">Use in the mixed program builder →</a></section>
      <section class="card s6"><div class="card-h"><h2>Programs</h2>${src('Program_Library / Program_Variants')}</div>${D.programs.map((p) => `<div class="mini" style="margin:4px 0"><b>${esc(p.ID)} ${esc(p.Program)}</b> · ${esc(p['Duration × frequency'])} · ${p.variants} variants<div>${esc(p['Progression structure'])}</div></div>`).join('') || '<p class="muted">—</p>'}
        <div class="card-h" style="margin-top:10px"><h2>Loading strategies</h2>${src('Loading_Strategies')}</div><table class="tt"><thead><tr><th>Strategy</th><th>Sets × reps</th><th>Tempo</th><th>RPE</th><th>Rest</th></tr></thead><tbody>${D.loading.map((r) => `<tr><td class="mini"><b>${esc(r['Loading strategy'])}</b></td><td class="mini">${esc(r['Typical sets x reps'])}</td><td class="mini">${esc(r['Typical tempo'])}</td><td class="mini">${esc(r['Typical RPE'])}</td><td class="mini">${esc(r['Typical rest'])}</td></tr>`).join('')}</tbody></table></section>
      <section class="card s6"><div class="card-h"><h2>Science</h2>${src('Training_Science')}</div>${D.science.map((s) => `<details><summary><b>${esc(s.ID)} ${esc(s.Concept)}</b> <span class="pill">${esc(s['Evidence level'])}</span></summary><p class="mini">${esc(s['What it is'])}</p><p class="mini"><b>Dose:</b> ${esc(s['Evidence-based dose'])}</p><p class="mini"><b>Mistakes:</b> ${esc(s['Common mistakes'])}</p><p class="mini"><b>References:</b> ${esc(s['Key references'])}</p></details>`).join('')}
        ${D.elite.length ? `<div class="card-h" style="margin-top:10px"><h2>Elite methods</h2>${src('Elite_Methods')}</div>${D.elite.map((m) => `<div class="mini"><b>${esc(m.Method)}</b> · ${esc(m.Dose)} · readiness: ${esc(m['Readiness Criteria'])} · phases ${esc(m['Best Phases'])} · evidence ${esc(m.Evidence)}</div>`).join('')}` : ''}</section>
      <section class="card s6"><div class="card-h"><h2>Drills</h2>${src('Drill_Bank')}</div>${Object.entries(D.drills.summary).map(([q, lv]) => `<div class="comp" style="grid-template-columns:170px 1fr"><span class="mini">${esc(q)}</span><span class="mini">${Object.entries(lv).sort().map(([l, n]) => `L${esc(l)} ${n}`).join(' · ')}</span></div>`).join('') || '<p class="muted">—</p>'}
        ${D.drills.samples.slice(0, 8).map((r) => `<div class="mini"><b>${esc(r.Drill)}</b> · L${esc(r.Level)} · ${esc(r.Constraint)} · ${esc(r['How to play'])}</div>`).join('')}</section>
      <section class="card s12"><div class="card-h"><h2>Knowledge ladder · basic → deep</h2>${src('Atlas_Subjects / Atlas_Topics')}</div>
        <p class="mini">${D.knowledge.subjects.map((s) => `<span class="pill">${esc(s.subject)} · ${esc(s.stage)}</span>`).join(' ')}</p>
        <div class="kl">${D.knowledge.levels.map((l, i) => `<div><h4 style="color:${LC[i + 1]}">${esc(l)}</h4>${D.knowledge.topics.filter((t) => t.Level === l).map((t) => `<details><summary>${esc(t.Topic)}</summary><p class="mini"><b>Basics:</b> ${esc(t['Must remember (basics)'])}</p><p class="mini"><b>Principle:</b> ${esc(t['Theory / law / principle'])}</p><p class="mini"><b>Mechanism:</b> ${esc(t['Mechanism chain (cause → effect)'])}</p><p class="mini"><b>Sport:</b> ${esc(t['Physio & sport correlation'])}</p><p class="mini"><b>Key numbers:</b> ${esc(t['Key numbers'])}</p><p class="mini"><b>Pitfall:</b> ${esc(t['Pitfall / misconception'])}</p><p class="mini"><b>Test yourself:</b> ${esc(t['Self-test question'])}</p><p class="mini"><b>Source:</b> ${esc(t['Evidence / core source'])}</p></details>`).join('') || '<p class="mini muted">—</p>'}</div>`).join('')}</div>
        <p class="fine">Curriculum stages are the workbook's own mapping. External professional bodies (UKSCA, NSCA, BASES, ACSM, ISBS) are linked under Extensions.</p></section>
    </div>
    <style>.ladders{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}@media(max-width:1100px){.ladders{grid-template-columns:repeat(2,1fr)}}
      .ladder{display:grid;gap:4px;padding:10px;border-radius:12px;border:1px solid var(--line);border-top:3px solid var(--c);text-decoration:none;color:inherit;background:rgba(255,255,255,.02)}.ladder.on{background:color-mix(in srgb,var(--c) 14%,transparent);border-color:var(--c)}.ladder em{font-style:normal;color:var(--c);font-weight:650}
      .stack{display:flex;height:10px;border-radius:5px;overflow:hidden;background:rgba(255,255,255,.04)}.stack i{display:block}.kl{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}@media(max-width:1000px){.kl{grid-template-columns:1fr 1fr}}</style>`;
  const reload = () => go('divisions', id, level, eq, $('#dv-bw').checked ? 'bw' : '');
  $('#dv-bw').onchange = reload;
  let t = null;
  $('#dv-q').oninput = (e) => { clearTimeout(t); t = setTimeout(async () => { const R = await div('get', { d: id, level, eq, bw: bw ? 1 : '', q: e.target.value, lim: 60 }); $('#dv-ex tbody').innerHTML = rows(R.exercises); bindRows(); }, 250); };
  bindRows();
}
function rows(X) {
  return X.map((e) => `<tr class="click" data-row="${e.row}"><td><b style="color:${LC[(e.level || 1) - 1]}">L${e.level}</b></td><td><b>${esc(e['Exercise Name'])}</b><div class="mini">${esc(e['Movement Pattern'] || '')} · ${esc(e['Primary Muscle(s)'] || '')}</div></td>
    <td class="mini">${esc(e['Equipment Class'] || '')}<div>${esc(String(e['Position / Grip / Stance'] || '').slice(0, 90))}</div></td><td class="mini">${esc(e['Sets × Reps'])}</td><td class="mini">${esc(e['Load / Intensity'])}</td><td class="mini">${esc(e.RPE)}</td><td class="mini">${esc(e.Rest)}</td><td class="mini">${esc(e.Tempo)}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">No exercises match.</td></tr>';
}
function bindRows() {
  document.querySelectorAll('#dv-ex [data-row]').forEach((tr) => (tr.onclick = async () => {
    const X = await div('ex', { row: tr.dataset.row }), e = X.exercise, host = $('#dv-detail');
    const f = (k) => (e[k] && String(e[k]).trim() && e[k] !== '—' ? `<p class="mini"><b>${esc(k)}:</b> ${esc(e[k])}</p>` : '');
    host.innerHTML = `<div class="note" style="margin-top:10px"><div class="card-h"><h2>${esc(e['Exercise Name'])}</h2><span class="pill">${esc(e['Depth Level'] || '')}</span></div>
      <div class="chain">${X.chain.map((c, i) => `<div style="--c:${LC[Math.min(5, i)]}"><small>${esc(c.step)}</small><b>${esc(c.what)}</b></div>`).join('<span>→</span>')}</div>
      ${X.forces.length ? `<p class="mini" style="color:var(--hot)"><b>Body-weight force stated:</b> ${X.forces.map(esc).join(' · ')}</p>` : ''}
      ${['Primary Intent (Biomechanical)', 'Joint Angles (Start → Mid-Range → End Position)', 'Multi-Joint Involvement & What Is Targeted at Each Angle', 'Ideal Angle, Variation Opportunities & Muscle Bias by Angle', 'Position / Grip / Stance', 'Movement Prerequisite', 'Cues / Technique Focus', 'Common Errors', 'Contraindications', 'S&C Application', 'Physio Application', 'ROM Standards, Measurement & Testing Criteria', 'Depth Reasoning (superficial → deep)'].map(f).join('')}</div>
      <style>.chain{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:8px 0}.chain div{display:grid;padding:6px 10px;border-radius:10px;border:1px solid var(--c);background:color-mix(in srgb,var(--c) 10%,transparent)}.chain small{color:var(--c);font-size:10px;text-transform:uppercase;letter-spacing:.06em}</style>`;
    host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }));
}

// ================================================================= MIXED PROGRAM BUILDER
async function mixed(main, args) {
  const all = await div('list');
  const chosen = (args[0] || 'sprint,power,strength,hypertrophy,conditioning').split(',').filter(Boolean);
  const level = +(args[1] || 4), spw = +(args[2] || 3), weeks = +(args[3] || 4), bw = args[4] === 'bw';
  const C = await div('combo', { ds: chosen.join(','), level, spw, weeks, bw: bw ? 1 : '' });
  const ex = (e) => `<div class="mini"><b>${esc(e['Exercise Name'])}</b> · ${esc(e['Sets × Reps'])}${e['Load / Intensity'] ? ` · ${esc(e['Load / Intensity'])}` : ''}${e.RPE ? ` · RPE ${esc(e.RPE)}` : ''}${e.Rest ? ` · rest ${esc(e.Rest)}` : ''} <small>${esc(e['Equipment Class'] || '')}</small></div>`;
  main.innerHTML = `${header('Mixed program builder', 'Combine divisions into one program. Exercises come from the chosen level with their own prescriptions; order, concurrent split and ×2 / ×3 combinations follow the workbook\'s training-science rules, shown below with how each was applied.', 'DIVISIONS')}
    <section class="card"><div class="bar">${all.map((d) => `<label class="chip-btn ${chosen.includes(d.id) ? 'on' : ''}"><input type="checkbox" class="mx-d" value="${d.id}" ${chosen.includes(d.id) ? 'checked' : ''} hidden>${esc(d.name)}</label>`).join('')}</div>
      <div class="bar" style="margin-top:8px"><label class="mini">Level <select class="tr-sel" id="mx-l">${[1, 2, 3, 4, 5, 6].map((l) => `<option value="${l}" ${l === level ? 'selected' : ''}>L${l}</option>`).join('')}</select></label>
        <label class="mini">Sessions / week <select class="tr-sel" id="mx-s">${[2, 3, 4, 5, 6].map((l) => `<option ${l === spw ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="mini">Weeks <select class="tr-sel" id="mx-w">${[1, 2, 3, 4, 6, 8].map((l) => `<option ${l === weeks ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="mini"><input type="checkbox" id="mx-bw" ${bw ? 'checked' : ''}> Body weight only</label><button class="primary small" id="mx-go">Build</button></div>
      ${C.level_info ? `<p class="mini"><b>${esc(C.level_info.Name)}:</b> ${esc(C.level_info['What it means'])} · typical content: ${esc(C.level_info['Typical content in the library'])}</p>` : ''}
      ${C.advance_when ? `<p class="mini"><b>Move up to ${esc(C.advance_when.Name)} when:</b> ${esc(C.advance_when['Entry requirement'])}</p>` : ''}</section>
    <div class="tr-grid"><section class="card s12"><div class="card-h"><h2>Rules applied</h2>${src('Training_Science')}</div>${C.rules.map((r) => `<div class="note" style="margin:6px 0"><b>${esc(r.id)}</b> · ${esc(r.applied)}<div class="mini">${esc(r.rule)}</div></div>`).join('')}
      <p class="mini">Pools at L${level}: ${C.divisions.map((d) => `${esc(d.name)} ${fmt(d.pool)}`).join(' · ')}</p></section>
      ${C.weeks.map((w) => `<section class="card s12"><div class="card-h"><h2>Week ${w.week}</h2></div><div class="mxw">${w.sessions.map((s) => `<div class="mxs"><h4>${esc(s.session)}</h4>${s.blocks.map((b, i) => `<div class="mxb"><small>${i + 1}. ${esc(b.division)}${b.rule ? ` · ${esc(b.rule)}` : ''}</small>${b.exercises.map(ex).join('')}</div>`).join('')}
        ${s.pm ? `<div class="mxb pm"><small>PM (≥ 6 h later) · ${esc(s.pm.division)} · C5</small>${s.pm.exercises.map(ex).join('')}</div>` : ''}</div>`).join('')}</div></section>`).join('')}
      <section class="card s12"><p class="fine">${esc(C.method)}</p></section></div>
    <style>.mxw{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px}.mxs{border:1px solid var(--line);border-radius:12px;padding:10px;background:rgba(255,255,255,.02)}.mxs h4{margin:0 0 6px}
      .mxb{border-left:3px solid var(--accent2);padding:4px 8px;margin:6px 0}.mxb small{color:var(--accent);text-transform:uppercase;font-size:10px;letter-spacing:.06em}.mxb.pm{border-left-color:var(--hot)}</style>`;
  main.querySelectorAll('.mx-d').forEach((c) => (c.onchange = () => c.parentElement.classList.toggle('on', c.checked)));
  $('#mx-go').onclick = () => go('mixed', [...main.querySelectorAll('.mx-d:checked')].map((c) => c.value).join(','), $('#mx-l').value, $('#mx-s').value, $('#mx-w').value, $('#mx-bw').checked ? 'bw' : '');
}
