// Training 4D · Builder: exercise builder (unlimited generator from the workbook's Combo_Dimensions grammar, copy from
// the 42,709-exercise library, or your own), program builder with a rule check (C3 order, C5 split, phase dose, level
// jumps, contraindications), training mode (session runner that logs to an athlete), theory & evidence library,
// questions & trials (judged against each test's MDC95), and Builder <-> workbook (Excel export, workbook-tab import).
// Data: /api/ath/bld/* (anatomy_lab/builder_api.py); private to this computer / this browser account.
import { esc, fmt, go, href, header } from './training.js';

const $ = (s, r = document) => r.querySelector(s);
const bget = async (route, params = {}) => { const u = new URL(`/api/ath/bld/${route}`, location.origin); Object.entries(params).forEach(([k, v]) => v != null && v !== '' && u.searchParams.set(k, v)); const r = await fetch(u); const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || r.statusText); return j; };
const bpost = async (route, body) => { const r = await fetch(`/api/ath/bld/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok || j.ok === false || j.error) throw new Error(j.error || r.statusText); return j; };
const LC = ['#64e6a8', '#6fd3ff', '#8fa8ff', '#b49bff', '#ffc067', '#ff8fa3'];
const LV = { act: ['bad', 'Act'], watch: ['warn', 'Watch'], info: ['', 'Info'] };
const toast = (t, bad) => { const el = document.createElement('div'); el.className = `note ${bad ? 'warn' : ''}`; el.style.cssText = 'position:fixed;right:20px;bottom:80px;z-index:99;max-width:420px'; el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 3500); };
const tabs = (cur) => `<section class="card"><div class="bar">${[['build-ex', 'Exercise builder'], ['build-prog', 'Program builder'], ['train-mode', 'Training mode'], ['theory', 'Theory & evidence'], ['questions', 'Questions & trials'], ['bsheet', 'Builder ↔ workbook']].map(([k, v]) => `<a class="chip-btn ${k === cur ? 'on' : ''}" href="${href(k)}" style="text-decoration:none">${v}</a>`).join('')}</div></section>`;

export async function page(p, main, args) {
  try {
    if (p === 'build-ex') return await buildEx(main, args);
    if (p === 'build-prog') return await buildProg(main, args);
    if (p === 'train-mode') return await trainMode(main, args);
    if (p === 'theory') return await theory(main, args);
    if (p === 'questions') return await questions(main, args);
    if (p === 'bsheet') return await sheets(main);
  } catch (e) { console.error(e); main.innerHTML = `<section class="card"><p class="muted">${esc(e.message)}</p></section>`; }
}

// ================================================================= EXERCISE BUILDER
async function buildEx(main, args) {
  const [D, S] = await Promise.all([bget('dims'), bget('state')]);
  const regions = [...new Set(D.bases.map((b) => b.region))];
  main.innerHTML = `${header('Exercise builder', 'Make new exercises three ways: generate from the workbook\'s combination grammar (only combinations each base movement allows, with the depth level and the reasoning of every option), copy any of the 42,709 library exercises and adapt it, or write your own. Saved exercises go into programs, training mode and the workbook export.', 'BUILDER')}${tabs('build-ex')}
    <div class="tr-grid"><section class="card s7"><div class="card-h"><h2>Generate · unlimited combinations</h2><small>Combo_Dimensions</small></div>
      <div class="bar"><label class="mini">Base movement <select class="tr-sel" id="g-base">${regions.map((r) => `<optgroup label="${esc(r)}">${D.bases.filter((b) => b.region === r).map((b) => `<option data-c="${esc(b.components.join(','))}">${esc(b.option)}</option>`).join('')}</optgroup>`).join('')}</select></label>
        <label class="mini">Component <select class="tr-sel" id="g-comp">${[['STR', 'Strength'], ['PWR', 'Power'], ['CON', 'Conditioning'], ['MOB', 'Mobility'], ['ACT', 'Activation / rehab']].map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
        <label class="mini">Equipment <select class="tr-sel" id="g-eq"><option value="">Any allowed</option>${D.equipment.map((e) => `<option>${esc(e)}</option>`).join('')}</select></label>
        <label class="mini">Level <select class="tr-sel" id="g-lv"><option value="0">Any</option>${[1, 2, 3, 4, 5, 6].map((l) => `<option value="${l}">L${l}</option>`).join('')}</select></label>
        <button class="primary small" id="g-go">Generate</button><button class="ghost-btn" id="g-more">More ↻</button></div>
      <p class="fine" id="g-meta"></p><div id="g-out" class="gen-list"></div></section>
      <section class="card s5"><div class="card-h"><h2>Copy from the library</h2><small>Exercise_Library</small></div><input class="tr-in" id="l-q" placeholder="Search 42,709 exercises (name, pattern, muscle)"><div id="l-out" class="mini"></div>
        <div class="card-h" style="margin-top:12px"><h2>Write your own</h2></div><form id="own" class="formgrid">
        ${[['name', 'Name *'], ['goal', 'Goal'], ['level', 'Level (1-6)'], ['equipment', 'Equipment'], ['pattern', 'Movement pattern'], ['muscles', 'Primary muscles'], ['setup', 'Set-up / position'], ['sets_reps', 'Sets × reps'], ['load', 'Load / intensity'], ['rpe', 'RPE'], ['rest', 'Rest'], ['tempo', 'Tempo']].map(([k, l]) => k === 'goal' ? `<label>${l}<select class="tr-sel" name="goal">${S.goals.map((g) => `<option>${esc(g)}</option>`).join('')}</select></label>` : `<label>${l}<input class="tr-in" name="${k}" ${k === 'level' ? 'type="number" min="1" max="6"' : ''}></label>`).join('')}
        ${[['intent', 'Biomechanical intent'], ['cues', 'Cues'], ['errors', 'Common errors'], ['contraindications', 'Contraindications / cautions'], ['regression', 'Easier version'], ['progression', 'Harder version'], ['description', 'Description & reasoning (yours)']].map(([k, l]) => `<label style="grid-column:1/-1">${l}<textarea class="tr-in" name="${k}" rows="2"></textarea></label>`).join('')}
        <button class="primary small" style="grid-column:1/-1">Save exercise</button></form></section>
      <section class="card s12"><div class="card-h"><h2>My exercises</h2><small>${S.exercises.length}</small></div>${myEx(S.exercises)}</section></div>
    <style>.gen-list{display:grid;gap:8px}.gen{border:1px solid var(--line);border-left:3px solid var(--c);border-radius:10px;padding:8px 10px}.gen h4{margin:0 0 4px;font-size:13px}.stars button{background:none;border:0;color:#ffc067;cursor:pointer;font-size:15px;padding:0 1px}</style>`;
  let seed = 1, last = null;
  const gen = async () => {
    const R = await bget('generate', { base: $('#g-base').value, comp: $('#g-comp').value, eq: $('#g-eq').value, level: $('#g-lv').value, n: 10, seed });
    last = R.results;
    $('#g-meta').textContent = `${fmt(R.combinations)} allowed combinations for ${R.base} · ${R.component}. ${R.method}`;
    $('#g-out').innerHTML = R.results.map((g, i) => `<div class="gen" style="--c:${LC[g.level - 1]}"><h4><span style="color:${LC[g.level - 1]}">L${g.level}</span> ${esc(g.name)}</h4><div class="mini"><b>${esc(g.sets_reps)}</b> · ${esc(g.goal)} · ${esc(Object.entries(g.choices).filter(([k, v]) => v && !['Intent', 'Equipment'].includes(k)).map(([k, v]) => v).join(' · '))}</div>
      <details><summary class="mini">Reasoning (${g.reasoning.length} options)</summary>${g.reasoning.map((r) => `<div class="mini"><b>${esc(r.dimension)}: ${esc(r.option)}</b> — physio: ${esc(r.physio || '—')} · S&amp;C: ${esc(r.sc || '—')}${r.caution ? ` · <span style="color:var(--hot)">caution: ${esc(r.caution)}</span>` : ''}</div>`).join('')}</details>
      <button class="ghost-btn" data-save="${i}">Save to my exercises</button></div>`).join('') || `<p class="muted">${R.results.length ? '' : 'No combination at this level; try Any level or another equipment.'}</p>`;
    $('#g-out').querySelectorAll('[data-save]').forEach((b) => (b.onclick = async () => { await bpost('from_gen', { gen: last[+b.dataset.save] }); toast('Saved to my exercises.'); b.disabled = true; b.textContent = 'Saved'; }));
  };
  $('#g-go').onclick = () => { seed = 1; gen().catch((e) => toast(e.message, true)); };
  $('#g-more').onclick = () => { seed += 1; gen().catch((e) => toast(e.message, true)); };
  let t = null;
  $('#l-q').oninput = (e) => { clearTimeout(t); t = setTimeout(async () => {
    const q = e.target.value.trim(); if (q.length < 2) { $('#l-out').innerHTML = ''; return; }
    const r = await fetch(new URL(`/api/ts/table?t=Exercise_Library&q=${encodeURIComponent(q)}&lim=15`, location.origin)).then((x) => x.json());
    const ci = (k) => r.cols.indexOf(k);
    $('#l-out').innerHTML = r.rows.map((row) => `<div class="comp" style="grid-template-columns:1fr auto"><span><b>${esc(row[ci('Exercise Name') + 1])}</b> · ${esc(row[ci('Goal') + 1] || '')} · L${esc(row[ci('Depth (1-6)') + 1] || '')}</span><button class="ghost-btn" data-row="${row[0]}">Copy</button></div>`).join('') + `<p>${fmt(r.total)} match</p>`;
    $('#l-out').querySelectorAll('[data-row]').forEach((b) => (b.onclick = async () => { await bpost('from_lib', { row: +b.dataset.row }); toast('Copied into my exercises: edit it below.'); go('build-ex'); }));
  }, 300); };
  $('#own').onsubmit = async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); if (f.level) f.level = +f.level; try { await bpost('ex', f); toast('Exercise saved.'); go('build-ex'); } catch (err) { toast(err.message, true); } };
  bindMyEx(main);
}
function myEx(X) {
  return X.length ? `<div class="tt-wrap" style="max-height:520px"><table class="tt"><thead><tr><th>Code</th><th>Exercise</th><th>Goal · L</th><th>Prescription</th><th>Origin</th><th>Rating</th><th></th></tr></thead><tbody>${X.map((e) => `<tr><td class="mono mini">${esc(e.code)}</td><td><b>${esc(e.name)}</b>${e.description ? `<div class="mini">${esc(e.description)}</div>` : ''}${e.contraindications ? `<div class="mini" style="color:var(--hot)">${esc(e.contraindications)}</div>` : ''}</td>
    <td class="mini">${esc(e.goal || '')} · L${esc(e.level || '—')}</td><td class="mini">${esc(e.sets_reps || '')} ${e.rpe ? `· RPE ${esc(e.rpe)}` : ''} ${e.rest ? `· ${esc(e.rest)}` : ''}</td><td class="mini">${esc(e.origin || '')}</td>
    <td class="stars" data-id="${e.id}">${[1, 2, 3, 4, 5].map((n) => `<button data-r="${n}">${n <= (e.rating || 0) ? '★' : '☆'}</button>`).join('')}</td><td><button class="ghost-btn" data-del="${e.id}">Delete</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No exercises yet. Generate, copy or write one above.</p>';
}
function bindMyEx(main) {
  main.querySelectorAll('.stars').forEach((s) => s.querySelectorAll('[data-r]').forEach((b) => (b.onclick = async () => { await bpost('rate', { id: +s.dataset.id, rating: +b.dataset.r }); s.querySelectorAll('[data-r]').forEach((x) => { x.textContent = +x.dataset.r <= +b.dataset.r ? '★' : '☆'; }); })));
  main.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => { if (!confirm('Delete this exercise?')) return; await bpost('ex_del', { id: +b.dataset.del }); go('build-ex'); }));
}

// ================================================================= PROGRAM BUILDER
async function buildProg(main, args) {
  const S = await bget('state'), pid = +(args[0] || 0), P = S.programs.find((p) => p.id === pid);
  if (!P) {
    main.innerHTML = `${header('Program builder', 'Combine exercises into weeks and days with your own prescription and reasoning; the rule check reads it against the workbook (exercise order, concurrent split, phase dose, level jumps, contraindications).', 'BUILDER')}${tabs('build-prog')}
      <div class="tr-grid"><section class="card s5"><div class="card-h"><h2>New program</h2></div><form id="np" class="formgrid">
        <label style="grid-column:1/-1">Name *<input class="tr-in" name="name"></label><label>Goal<select class="tr-sel" name="goal">${S.goals.map((g) => `<option>${esc(g)}</option>`).join('')}</select></label>
        <label>Level (1-6)<input class="tr-in" name="level" type="number" min="1" max="6" value="3"></label><label>Phase<select class="tr-sel" name="phase"><option value="">—</option>${S.phases.map((p) => `<option value="${esc(p.code)}">${esc(p.code)} ${esc(p.name)}</option>`).join('')}</select></label>
        <label>Weeks<input class="tr-in" name="weeks" type="number" min="1" max="52" value="4"></label><label>Sessions / week<input class="tr-in" name="spw" type="number" min="1" max="14" value="3"></label>
        <label>Training mode<select class="tr-sel" name="mode">${['Standard', 'Circuit', 'EMOM', 'Contrast / complex', 'Concurrent (AM/PM)', 'Rehab (pain-monitored)', 'Court / field'].map((m) => `<option>${m}</option>`).join('')}</select></label>
        <label style="grid-column:1/-1">Description &amp; reasoning<textarea class="tr-in" name="description" rows="3"></textarea></label><button class="primary small" style="grid-column:1/-1">Create program</button></form></section>
        <section class="card s7"><div class="card-h"><h2>My programs</h2><small>${S.programs.length}</small></div>${S.programs.map((p) => `<a class="comp click" href="${href('build-prog', p.id)}" style="grid-template-columns:90px 1fr auto;text-decoration:none"><span class="mono mini">${esc(p.code)}</span><span><b>${esc(p.name)}</b><div class="mini">${esc(p.goal || '')} · L${esc(p.level || '—')} · ${esc(p.phase || 'no phase')} · ${p.weeks || '—'} wk × ${p.spw || '—'}/wk · ${esc(p.mode || '')}</div></span><span class="mini">${p.items.length} items</span></a>`).join('') || '<p class="muted">None yet.</p>'}</section></div>`;
    $('#np').onsubmit = async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); ['level', 'weeks', 'spw'].forEach((k) => { f[k] = +f[k] || null; }); try { const r = await bpost('prog', f); go('build-prog', r.id); } catch (err) { toast(err.message, true); } };
    return;
  }
  const C = await bget('check', { id: pid });
  const wk = +(args[1] || 1), days = Array.from({ length: Math.max(1, P.spw || 3) }, (_, i) => i + 1);
  main.innerHTML = `${header(`${esc(P.name)}`, `${esc(P.code)} · ${esc(P.goal || '')} · L${esc(P.level || '—')} · phase ${esc(P.phase || '—')} · ${P.weeks || '—'} weeks × ${P.spw || '—'} sessions · ${esc(P.mode || '')}${P.description ? ` — ${esc(P.description)}` : ''}`, 'BUILDER · PROGRAM')}${tabs('build-prog')}
    <section class="card"><div class="bar">${Array.from({ length: P.weeks || 1 }, (_, i) => `<a class="chip-btn ${i + 1 === wk ? 'on' : ''}" href="${href('build-prog', pid, i + 1)}" style="text-decoration:none">Week ${i + 1}</a>`).join('')}
      <button class="ghost-btn" id="cp-copy">Copy week ${wk} → next week</button><a class="ghost-btn" href="${href('train-mode', pid, wk, 1)}">▶ Training mode</a><button class="ghost-btn" id="pg-del">Delete program</button><a class="ghost-btn" href="${href('build-prog')}">All programs</a></div></section>
    <div class="tr-grid"><section class="card s8"><div class="mxw">${days.map((d) => `<div class="mxs"><h4>Day ${d}</h4>${P.items.filter((i) => (i.week || 1) === wk && (i.day || 1) === d).map((i) => `<div class="mxb"><b>${esc(i.name)}</b> <small>${esc(i.block || '')}</small>
        <div class="row-ed" data-id="${i.id}">${['sets_reps', 'load', 'rpe', 'rest', 'tempo'].map((k) => `<input class="tr-in" data-k="${k}" value="${esc(i[k] || '')}" placeholder="${k.replace('_', ' × ')}" title="${k}">`).join('')}<input class="tr-in" data-k="note" value="${esc(i.note || '')}" placeholder="reason / note" style="grid-column:1/-1"></div>
        <button class="ghost-btn" data-idel="${i.id}">Remove</button></div>`).join('')}
        <select class="tr-sel add-sel" data-day="${d}"><option value="">+ Add exercise…</option><optgroup label="My exercises">${S.exercises.map((e) => `<option value="bx:${e.id}">${esc(e.name)} (L${esc(e.level || '—')})</option>`).join('')}</optgroup></select>
        <input class="tr-in add-free" data-day="${d}" placeholder="+ or type any exercise name and press Enter"></div>`).join('')}</div></section>
      <section class="card s4"><div class="card-h"><h2>Rule check</h2><small>${C.findings.length}</small></div>${C.findings.map((f) => `<div class="note ${LV[f.level][0]}" style="margin:5px 0"><span class="pill ${LV[f.level][0]}">${LV[f.level][1]}</span> ${esc(f.text)}<div class="mini">Rule: ${esc(f.rule)} · ${esc(f.source)}</div></div>`).join('')}</section></div>
    <style>.mxw{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}.mxs{border:1px solid var(--line);border-radius:12px;padding:10px}.mxs h4{margin:0 0 6px}.mxb{border-left:3px solid var(--accent2);padding:4px 8px;margin:6px 0}.row-ed{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;margin:4px 0}.row-ed input,.mxs .tr-in,.mxs .tr-sel{font-size:11px;padding:3px 5px;min-width:0;width:100%;box-sizing:border-box}.mxs{min-width:0}</style>`;
  main.querySelectorAll('.add-sel').forEach((s) => (s.onchange = async () => { if (!s.value) return; const [, id] = s.value.split(':'); const e = S.exercises.find((x) => x.id === +id);
    await bpost('item', { prog: pid, week: wk, day: +s.dataset.day, src: 'bx', ref: e.id, name: e.name, goal: e.goal, sets_reps: e.sets_reps, load: e.load, rpe: e.rpe, rest: e.rest, tempo: e.tempo }); go('build-prog', pid, wk); }));
  main.querySelectorAll('.add-free').forEach((i) => (i.onkeydown = async (e) => { if (e.key !== 'Enter' || !i.value.trim()) return; await bpost('item', { prog: pid, week: wk, day: +i.dataset.day, src: 'free', ref: 0, name: i.value.trim() }); go('build-prog', pid, wk); }));
  main.querySelectorAll('.row-ed input').forEach((inp) => (inp.onchange = async () => { const id = +inp.parentElement.dataset.id; await bpost('item', { id, [inp.dataset.k]: inp.value }); }));
  main.querySelectorAll('[data-idel]').forEach((b) => (b.onclick = async () => { await bpost('item_del', { id: +b.dataset.idel }); go('build-prog', pid, wk); }));
  $('#cp-copy').onclick = async () => { if (wk >= (P.weeks || 1)) { toast('This is the last week.', true); return; } for (const i of P.items.filter((x) => (x.week || 1) === wk)) { const { id, ...rest } = i; await bpost('item', { ...rest, week: wk + 1 }); } go('build-prog', pid, wk + 1); };
  $('#pg-del').onclick = async () => { if (!confirm('Delete this program and its items?')) return; await bpost('prog_del', { id: pid }); go('build-prog'); };
}

// ================================================================= TRAINING MODE
async function trainMode(main, args) {
  const S = await bget('state'), pid = +(args[0] || 0), wk = +(args[1] || 1), day = +(args[2] || 1), P = S.programs.find((p) => p.id === pid);
  const L = await fetch(new URL('/api/ath/list', location.origin)).then((r) => r.json()).catch(() => ({ athletes: [] }));
  if (!P) {
    main.innerHTML = `${header('Training mode', 'Run a session from one of your programs: one exercise at a time, set counter, rest timer, RPE and pain per exercise; at the end the session is logged to the athlete you choose.', 'BUILDER')}${tabs('train-mode')}
      <section class="card">${S.programs.map((p) => `<a class="comp click" href="${href('train-mode', p.id, 1, 1)}" style="grid-template-columns:1fr auto;text-decoration:none"><span><b>${esc(p.name)}</b> <span class="mini">${esc(p.code)} · ${p.items.length} items</span></span><span>▶</span></a>`).join('') || `<p class="muted">Build a program first (<a href="${href('build-prog')}">Program builder</a>).</p>`}</section>`;
    return;
  }
  const items = P.items.filter((i) => (i.week || 1) === wk && (i.day || 1) === day);
  const st = { i: 0, set: 1, log: items.map(() => ({ rpe: '', pain: '', sets: 0 })), t0: Date.now(), rest: 0, timer: null };
  const restSecs = (r) => { const m = String(r || '').match(/(\d+(?:\.\d+)?)\s*(min|m\b|s)/i); return m ? Math.round(+m[1] * (/s/i.test(m[2]) && !/min/i.test(m[2]) ? 1 : 60)) : 90; };
  const sets = (sr) => { const m = String(sr || '').match(/^\s*(\d+)/); return m ? +m[1] : 3; };
  const draw = () => {
    const it = items[st.i];
    main.innerHTML = `${header(`Training mode · ${esc(P.name)}`, `Week ${wk} · Day ${day} · ${items.length} exercises · ${esc(P.mode || '')}`, 'BUILDER · RUN')}${tabs('train-mode')}
      <section class="card"><div class="bar"><select class="tr-sel" id="tm-wd">${Array.from({ length: P.weeks || 1 }, (_, w) => Array.from({ length: P.spw || 1 }, (_, d) => `<option value="${w + 1}/${d + 1}" ${w + 1 === wk && d + 1 === day ? 'selected' : ''}>Week ${w + 1} · Day ${d + 1}</option>`).join('')).join('')}</select>
        <label class="mini">Log to <select class="tr-sel" id="tm-ath"><option value="">— nobody (practice run) —</option>${(L.athletes || []).map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></label></div></section>
      ${!it ? `<section class="card"><p class="muted">${items.length ? 'Session complete.' : 'No exercises on this day.'}</p>${items.length ? `<button class="primary small" id="tm-finish">Log session</button>` : ''}</section>` : `
      <section class="card run"><div class="mini">Exercise ${st.i + 1} / ${items.length}</div><h2 style="font-size:22px;text-transform:none;letter-spacing:0">${esc(it.name)}</h2>
        <div class="bar"><span class="pill acc">${esc(it.sets_reps || '—')}</span>${it.load ? `<span class="pill">${esc(it.load)}</span>` : ''}${it.rpe ? `<span class="pill">RPE ${esc(it.rpe)}</span>` : ''}${it.tempo ? `<span class="pill">tempo ${esc(it.tempo)}</span>` : ''}${it.rest ? `<span class="pill">rest ${esc(it.rest)}</span>` : ''}</div>
        ${it.note ? `<p>${esc(it.note)}</p>` : ''}<div class="big">Set <b>${Math.min(st.set, sets(it.sets_reps))}</b> / ${sets(it.sets_reps)}</div><div class="big mono" id="tm-rest">${st.rest ? `Rest ${st.rest}s` : ''}</div>
        <div class="bar"><button class="primary" id="tm-set">✓ Set done</button><label class="mini">RPE <input class="tr-in" id="tm-rpe" type="number" min="0" max="10" step="0.5" value="${esc(st.log[st.i].rpe)}" style="width:70px"></label><label class="mini">Pain 0-10 <input class="tr-in" id="tm-pain" type="number" min="0" max="10" value="${esc(st.log[st.i].pain)}" style="width:70px"></label>
          <button class="ghost-btn" id="tm-prev">◀ Previous</button><button class="ghost-btn" id="tm-next">Next ▶</button></div></section>`}
      <style>.run .big{font-size:28px;margin:10px 0}</style>`;
    $('#tm-wd').onchange = (e) => { const [w, d] = e.target.value.split('/'); go('train-mode', pid, w, d); };
    if (!it) { $('#tm-finish')?.addEventListener('click', finish); return; }
    const keep = () => { st.log[st.i].rpe = $('#tm-rpe').value; st.log[st.i].pain = $('#tm-pain').value; };
    $('#tm-set').onclick = () => { keep(); st.log[st.i].sets++; if (st.set >= sets(it.sets_reps)) { st.i++; st.set = 1; draw(); return; } st.set++; st.rest = restSecs(it.rest); clearInterval(st.timer); st.timer = setInterval(() => { st.rest--; const el = $('#tm-rest'); if (el) el.textContent = st.rest > 0 ? `Rest ${st.rest}s` : 'Go'; if (st.rest <= 0) clearInterval(st.timer); }, 1000); draw(); };
    $('#tm-next').onclick = () => { keep(); st.i++; st.set = 1; draw(); }; $('#tm-prev').onclick = () => { keep(); st.i = Math.max(0, st.i - 1); st.set = 1; draw(); };
  };
  const finish = async () => {
    const ath = $('#tm-ath').value, mins = Math.max(1, Math.round((Date.now() - st.t0) / 60000)), rp = st.log.map((l) => +l.rpe).filter((x) => x > 0), pn = st.log.map((l) => +l.pain).filter((x) => x >= 0 && String(x) !== '');
    const rpe = rp.length ? Math.round((rp.reduce((a, b) => a + b, 0) / rp.length) * 10) / 10 : null;
    if (ath) { await fetch('/api/ath/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ athlete: +ath, minutes: mins, rpe: rpe ?? 0, pain: pn.length ? Math.max(...pn) : null, kind: `Program ${P.code}`, notes: `${P.name} W${wk} D${day}`, by: (() => { try { return localStorage.getItem('ts-actor') || ''; } catch { return ''; } })() }) }); }
    const tr = S.trials.find((t) => t.prog === pid && (!ath || String(t.athlete) === String(ath)));
    if (tr) await bpost('trial', { id: tr.id, done: (tr.done || 0) + 1 });
    toast(ath ? `Session logged: ${mins} min, RPE ${rpe ?? '—'} → load ${rpe ? Math.round(mins * rpe) : 0} AU.` : 'Practice run finished (not logged).'); go('train-mode');
  };
  draw();
}

// ================================================================= THEORY & EVIDENCE
async function theory(main, args) {
  const dom = args[0] || 'learning', q = args[1] || '', T = await bget('theory', { domain: dom, q }), all = await bget('theory', { q: '__none__' }).catch(() => null);
  const names = { physio: 'Physiotherapy & rehab', sportsci: 'Sports science', biomech: 'Biomechanics', learning: 'Motor learning', performance: 'Human performance', sport: 'Sport & movement' };
  const D = T.domains[dom];
  main.innerHTML = `${header('Theory & evidence', 'The theories, laws, mechanisms and methods behind the system, each with the workbook\'s stated source or references and evidence level. Turn any of them into a question and test it with a trial.', 'BUILDER')}${tabs('theory')}
    <section class="card"><div class="bar">${Object.entries(names).map(([k, v]) => `<a class="chip-btn ${k === dom ? 'on' : ''}" href="${href('theory', k)}" style="text-decoration:none">${v}</a>`).join('')}<input class="tr-in" id="th-q" placeholder="Search theories" value="${esc(q)}"></div><p class="fine">${esc(T.note)}</p></section>
    <div class="tr-grid"><section class="card s7"><div class="card-h"><h2>${esc(D.name)} · topics</h2><small>${D.topics.length} · Atlas_Topics</small></div>
      ${D.topics.map((t) => `<details class="thc"><summary><span class="pill">${esc(t.Level)}</span> <b>${esc(t.Topic)}</b> <small>${esc(t.Subject)}</small></summary>
        ${[['Basics', 'Must remember (basics)'], ['Theory / law / principle', 'Theory / law / principle'], ['Mechanism', 'Mechanism chain (cause → effect)'], ['Physio & sport', 'Physio & sport correlation'], ['How to assess', 'Assess / test / investigation'], ['Key numbers', 'Key numbers'], ['Pitfall', 'Pitfall / misconception'], ['Test yourself', 'Self-test question'], ['Source', 'Evidence / core source']].map(([l, k]) => t[k] ? `<p class="mini"><b>${l}:</b> ${esc(t[k])}</p>` : '').join('')}
        <button class="ghost-btn" data-ask="${esc(t.ID)}" data-title="${esc(t.Topic)}">Ask a question about this →</button></details>`).join('') || '<p class="muted">—</p>'}</section>
      <section class="card s5"><div class="card-h"><h2>Methods &amp; dose</h2><small>${D.science.length} · Training_Science</small></div>
      ${D.science.map((s) => `<details class="thc"><summary><b>${esc(s.ID)} ${esc(s.Concept)}</b> <span class="pill">${esc(s['Evidence level'])}</span></summary><p class="mini">${esc(s['What it is'])}</p><p class="mini"><b>Mechanism:</b> ${esc(s['How it works (mechanism)'])}</p><p class="mini"><b>Dose:</b> ${esc(s['Evidence-based dose'])}</p><p class="mini"><b>In the system:</b> ${esc(s['How to use in this system'])}</p><p class="mini"><b>Mistakes:</b> ${esc(s['Common mistakes'])}</p><p class="mini"><b>References:</b> ${esc(s['Key references'])}</p>
        <button class="ghost-btn" data-ask="${esc(s.ID)}" data-title="${esc(s.Concept)}">Test this →</button></details>`).join('')}</section></div>
    <style>.thc{border-bottom:1px solid var(--line);padding:6px 0}.thc summary{cursor:pointer}</style>`;
  void all;
  $('#th-q').onkeydown = (e) => { if (e.key === 'Enter') go('theory', dom, e.target.value); };
  main.querySelectorAll('[data-ask]').forEach((b) => (b.onclick = () => { try { sessionStorage.setItem('bq-draft', JSON.stringify({ theories: [b.dataset.ask], question: `Does ${b.dataset.title} hold for my athlete(s)?` })); } catch { /* ignore */ } go('questions'); }));
}

// ================================================================= QUESTIONS & TRIALS
async function questions(main) {
  const S = await bget('state');
  const L = await fetch(new URL('/api/ath/list', location.origin)).then((r) => r.json()).catch(() => ({ athletes: [] }));
  let draft = {}; try { draft = JSON.parse(sessionStorage.getItem('bq-draft') || '{}'); sessionStorage.removeItem('bq-draft'); } catch { /* none */ }
  const METRICS = ['PAIN', 'EFF', 'ROM', 'STR', 'END', 'BAL', 'HOP', 'CMJ', 'RSI', 'SPR', 'COD', 'AER', 'PROM', 'PSY', 'LOAD', 'TIME'];
  main.innerHTML = `${header('Questions & trials', 'Ask new questions, try new programs and combinations, and judge the answer with your own data: each trial records the test before and after, and the change is compared with that test\'s measurement error (MDC95 from Testing_Protocols).', 'BUILDER')}${tabs('questions')}
    <div class="tr-grid"><section class="card s5"><div class="card-h"><h2>New question</h2></div><form id="nq" class="formgrid">
      <label style="grid-column:1/-1">Question *<textarea class="tr-in" name="question" rows="2">${esc(draft.question || '')}</textarea></label><label style="grid-column:1/-1">Hypothesis (what you expect and why)<textarea class="tr-in" name="hypothesis" rows="2"></textarea></label>
      <label>Theory refs<input class="tr-in" name="theories" value="${esc((draft.theories || []).join(', '))}" placeholder="e.g. C4, SPS12"></label><label>Outcome test<select class="tr-sel" name="metric">${METRICS.map((m) => `<option>${m}</option>`).join('')}</select></label>
      <label style="grid-column:1/-1">Design<select class="tr-sel" name="design">${['Single athlete, before / after', 'Single athlete, A-B-A (on-off-on)', 'Two groups, before / after', 'Repeated sessions, within-session'].map((d) => `<option>${d}</option>`).join('')}</select></label>
      <button class="primary small" style="grid-column:1/-1">Save question</button></form></section>
      <section class="card s7"><div class="card-h"><h2>Questions</h2><small>${S.questions.length}</small></div>${S.questions.map((q) => `<div class="note" style="margin:6px 0"><span class="mono mini">${esc(q.code)}</span> <span class="pill">${esc(q.status || 'idea')}</span> <b>${esc(q.question)}</b>
        <div class="mini">${q.hypothesis ? `Hypothesis: ${esc(q.hypothesis)} · ` : ''}Outcome ${esc(q.metric || '—')} · ${esc(q.design || '')}${q.theories ? ` · theories ${esc(String(q.theories).replace(/[[\]"]/g, ''))}` : ''}</div>
        ${q.answer ? `<div class="mini"><b>Answer:</b> ${esc(q.answer)}</div>` : ''}<div class="bar"><button class="ghost-btn" data-trial="${q.id}" data-metric="${esc(q.metric || '')}">+ Start a trial</button><select class="tr-sel" data-qst="${q.id}">${['idea', 'running', 'answered', 'dropped'].map((s) => `<option ${s === q.status ? 'selected' : ''}>${s}</option>`).join('')}</select><button class="ghost-btn" data-ans="${q.id}">Write the answer</button></div></div>`).join('') || '<p class="muted">No questions yet.</p>'}</section>
      <section class="card s12"><div class="card-h"><h2>Trials</h2><small>${S.trials.length}</small></div><div class="tt-wrap"><table class="tt"><thead><tr><th>Trial</th><th>Question</th><th>Program</th><th>Athlete</th><th>Start</th><th>Sessions</th><th>Test</th><th>Before</th><th>After</th><th>Result</th><th></th></tr></thead><tbody>
        ${S.trials.map((t) => `<tr data-t="${t.id}"><td class="mono mini">${esc(t.code)}</td><td class="mini">${esc(S.questions.find((q) => q.id === t.question)?.code || '')}</td><td class="mini">${esc(S.programs.find((p) => p.id === t.prog)?.code || '')}</td><td class="mini">${esc((L.athletes || []).find((a) => String(a.id) === String(t.athlete))?.name || t.athlete || '')}</td><td class="mini">${esc(t.start || '')}</td>
          <td class="num">${t.done || 0}/${t.planned || '—'}</td><td>${esc(t.metric || '')}</td><td><input class="tr-in" data-k="before" value="${t.before ?? ''}" style="width:70px"></td><td><input class="tr-in" data-k="after" value="${t.after ?? ''}" style="width:70px"></td>
          <td class="mini"><span class="pill ${t.result.status === 'beyond error' ? (t.result.better ? 'ok' : 'bad') : ''}">${esc(t.result.status)}</span> ${esc(t.result.text)}</td><td><button class="ghost-btn" data-tdel="${t.id}">✕</button></td></tr>`).join('') || '<tr><td colspan="11" class="muted">No trials yet: start one from a question.</td></tr>'}</tbody></table></div></section></div>`;
  $('#nq').onsubmit = async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); f.theories = f.theories.split(',').map((x) => x.trim()).filter(Boolean); try { await bpost('q', f); go('questions'); } catch (err) { toast(err.message, true); } };
  main.querySelectorAll('[data-trial]').forEach((b) => (b.onclick = async () => {
    const prog = prompt(`Program code for this trial (${S.programs.map((p) => p.code).join(', ') || 'none yet'}), or leave empty:`, S.programs[0]?.code || '');
    const athlete = prompt(`Athlete (${(L.athletes || []).map((a) => `${a.id}=${a.name}`).join(', ') || 'self'}):`, (L.athletes || [])[0]?.id || 'self');
    const planned = +prompt('Sessions planned:', '12') || null;
    await bpost('trial', { question: +b.dataset.trial, prog: S.programs.find((p) => p.code === prog)?.id || null, athlete, start: new Date().toISOString().slice(0, 10), planned, done: 0, metric: b.dataset.metric });
    await bpost('q', { id: +b.dataset.trial, status: 'running' }); go('questions');
  }));
  main.querySelectorAll('[data-qst]').forEach((s) => (s.onchange = async () => { await bpost('q', { id: +s.dataset.qst, status: s.value }); }));
  main.querySelectorAll('[data-ans]').forEach((b) => (b.onclick = async () => { const a = prompt('Your answer (what the trial showed, and how sure you are):'); if (a) { await bpost('q', { id: +b.dataset.ans, answer: a, status: 'answered' }); go('questions'); } }));
  main.querySelectorAll('tr[data-t] input').forEach((i) => (i.onchange = async () => { await bpost('trial', { id: +i.closest('tr').dataset.t, [i.dataset.k]: i.value === '' ? null : +i.value }); go('questions'); }));
  main.querySelectorAll('[data-tdel]').forEach((b) => (b.onclick = async () => { if (confirm('Delete this trial?')) { await bpost('trial_del', { id: +b.dataset.tdel }); go('questions'); } }));
}

// ================================================================= BUILDER <-> WORKBOOK
async function sheets(main) {
  const X = await bget('export');
  main.innerHTML = `${header('Builder ↔ workbook', 'Your builder content as workbook tabs: Builder_Exercises, Builder_Programs, Builder_Program_Items, Builder_Questions and Builder_Trials.', 'BUILDER')}${tabs('bsheet')}
    <div class="tr-grid"><section class="card s6"><div class="card-h"><h2>Export</h2></div><p>${Object.entries(X.counts).map(([k, n]) => `<span class="pill">${esc(k)} ${n}</span>`).join(' ')}</p>
      <p class="btnrow"><button class="primary small" id="bx-xlsx">Download ${esc(X.filename)}</button></p>
      <p class="mini">Or copy one tab and paste it into the tab of the same name in your Google Sheet (cell A1):</p><p class="btnrow">${Object.keys(X.tsv).map((k) => `<button class="ghost-btn" data-tsv="${esc(k)}">Copy ${esc(k)}</button>`).join('')}</p></section>
      <section class="card s6"><div class="card-h"><h2>Import from the workbook</h2></div><p class="mini">Rows typed into Builder_* tabs of your training workbook (the Google Sheet the app syncs from) arrive with the next sync and rebuild; import them here. Rows are matched by their code (BX-, BP-, BQ-, BT-); rows without a code are added.</p>
      <p class="btnrow"><button class="primary small" id="bx-imp">Import Builder_* tabs</button></p><p id="bx-imp-out" class="mini"></p></section></div>`;
  $('#bx-xlsx').onclick = () => { const bin = Uint8Array.from(atob(X.b64), (c) => c.charCodeAt(0)), a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bin], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); a.download = X.filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  main.querySelectorAll('[data-tsv]').forEach((b) => (b.onclick = async () => { try { await navigator.clipboard.writeText(X.tsv[b.dataset.tsv]); toast(`${b.dataset.tsv} copied: paste into cell A1 of that tab.`); } catch { toast('Clipboard blocked by the browser.', true); } }));
  $('#bx-imp').onclick = async () => { try { const r = await bpost('import_sheet', {}); $('#bx-imp-out').textContent = r.note || `${r.imported} rows imported.`; } catch (e) { $('#bx-imp-out').textContent = e.message; } };
}
