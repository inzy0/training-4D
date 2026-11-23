// Exercise library for the Motion Lab: every exercise in two open libraries (free-exercise-db, Unlicense; wger, licence
// per exercise) plus any number of the owner's own exercises. Each exercise: photos (start / end frames animate),
// step-by-step instructions, primary and secondary muscles lit on the 3D body, equipment, level, licence and author,
// and a live counter driven by the camera's joint angles (js/drills.js channels()). The tracking rule is a suggested,
// editable counting aid (tools/exercise_library_build.py), not a form assessment, and is not validated.
// Workouts: build by hand or generate from muscles + equipment; sessions are logged and downloadable.
// Own exercises, workouts and session logs are saved in this browser and mirrored to data/anatomy_lab/exercises/custom.json.

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CH = { lKnee: 'left knee bend', rKnee: 'right knee bend', lHipFlex: 'left hip flexion', rHipFlex: 'right hip flexion', lElbow: 'left elbow bend', rElbow: 'right elbow bend',
  lShElev: 'left shoulder elevation', rShElev: 'right shoulder elevation', trunkFlex: 'trunk lean', heelRise: 'heel rise (cm)', jumpH: 'jump height (cm)', lHipAbd: 'left hip abduction', rHipAbd: 'right hip abduction', neckFlex: 'neck flexion', auto: 'auto (largest moving joint)' };
const MUSCLE_RE = { // exercise-library muscle words -> BodyParts3D muscle names
  abdominals: /rectus abdominis|oblique|transversus abdominis/, abs: /rectus abdominis|oblique|transversus abdominis/, obliques: /oblique/,
  quadriceps: /rectus femoris|vastus/, quads: /rectus femoris|vastus/, hamstrings: /biceps femoris|semitendinosus|semimembranosus/, glutes: /gluteus/,
  calves: /gastrocnemius|soleus/, chest: /pectoralis/, lats: /latissimus/, 'middle back': /rhomboid|trapezius/, traps: /trapezius/, trapezius: /trapezius/,
  'lower back': /erector spinae|iliocostalis|longissimus|multifidus|quadratus lumborum/, shoulders: /deltoid/, delts: /deltoid/, deltoid: /deltoid/,
  biceps: /biceps brachii|brachialis/, triceps: /triceps brachii/, forearms: /brachioradialis|flexor carpi|extensor carpi|flexor digitorum|extensor digitorum/,
  adductors: /adductor|gracilis|pectineus/, abductors: /gluteus medius|gluteus minimus|tensor fasciae latae/, neck: /sternocleidomastoid|splenius|scalen/,
  'serratus anterior': /serratus anterior/, soleus: /soleus/, gastrocnemius: /gastrocnemius/, brachialis: /brachialis/, 'anterior deltoid': /deltoid/,
};
const E = { lib: [], custom: [], workouts: [], sessions: [], f: { q: '', cat: '', mus: '', eq: '', lvl: '', src: '' }, shown: 200, cur: null, tracker: null, workout: null };

export async function initExerciseLibrary() {
  const card = $('#ex-card'); if (!card || card.dataset.ok) return; card.dataset.ok = '1';
  card.innerHTML = `<h2>Exercise library</h2><p class="fine" id="ex-count">Loading…</p>
    <div class="ex-row"><input id="ex-quick" type="search" placeholder="Find an exercise (e.g. squat, curl, plank)"><button class="primary small" id="ex-open">Open library</button></div>
    <div id="ex-hud" class="ex-hud" hidden></div>`;
  const [lib, cust] = await Promise.all([fetch('/training-4D/rt/exercises/library.json').then((r) => r.json()).catch(() => ({ exercises: [] })), loadCustom()]);
  E.lib = lib.exercises; E.rule = lib.rule; E.sources = lib.sources;
  Object.assign(E, cust);
  $('#ex-count').textContent = `${E.lib.length.toLocaleString()} exercises from open libraries + ${E.custom.length} of your own (create as many as you like). Live rep / hold counting from the camera.`;
  $('#ex-open').onclick = () => openLibrary();
  $('#ex-quick').onkeydown = (e) => { if (e.key === 'Enter') { E.f.q = e.target.value; openLibrary(); } };
  window.__exTrack = (t, ch) => E.tracker?.push(t, ch);
}

// ---------------------------------------------------------------- persistence (own exercises, workouts, sessions)
async function loadCustom() {
  let d = null;
  try { d = await (await fetch('/api/exercises/custom')).json(); } catch { /* server offline */ }
  if (!d || d.error) { try { d = JSON.parse(localStorage.getItem('ex-custom') || 'null'); } catch { d = null; } }
  return { custom: d?.custom || [], workouts: d?.workouts || [], sessions: d?.sessions || [] };
}
async function saveCustom() {
  const body = JSON.stringify({ custom: E.custom, workouts: E.workouts, sessions: E.sessions.slice(-500), saved: new Date().toISOString() });
  try { localStorage.setItem('ex-custom', body); } catch { /* blocked */ }
  try { await fetch('/api/exercises/custom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }); } catch { /* offline */ }
}
const all = () => [...E.custom, ...E.lib];

// ---------------------------------------------------------------- library browser (full-screen panel)
function openLibrary() {
  let host = $('#ex-lib'); if (!host) { host = document.createElement('div'); host.id = 'ex-lib'; host.className = 'iv'; document.body.appendChild(host); }
  host.hidden = false;
  const X = all(), uniq = (f) => [...new Set(X.flatMap(f).filter(Boolean))].sort();
  const cats = uniq((x) => [x.category]), mus = uniq((x) => [...x.primary, ...x.secondary].map((m) => String(m).toLowerCase())), eqs = uniq((x) => String(x.equipment).split(', ')), lvls = uniq((x) => [x.level]);
  host.innerHTML = `<div class="iv-top"><div class="iv-head"><b>Exercise library</b> · <span class="fine">${X.length.toLocaleString()} exercises · ${esc(E.sources || '')}</span></div><div class="iv-nav"><button class="ghost-btn" id="ex-new">＋ New exercise</button><button class="ghost-btn" id="ex-wk">Workouts</button><button class="ghost-btn" id="ex-close">✕</button></div></div>
    <div class="ex-body"><aside class="ex-side">
      <input id="ex-q" type="search" placeholder="Search name, muscle, equipment" value="${esc(E.f.q)}">
      <select id="ex-cat"><option value="">All categories</option>${cats.map((c) => `<option ${c === E.f.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <select id="ex-mus"><option value="">All muscles</option>${mus.map((c) => `<option ${c === E.f.mus ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <select id="ex-eq"><option value="">All equipment</option>${eqs.map((c) => `<option ${c === E.f.eq ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <select id="ex-lvl"><option value="">All levels</option>${lvls.map((c) => `<option ${c === E.f.lvl ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <select id="ex-src"><option value="">All sources</option><option value="mine" ${E.f.src === 'mine' ? 'selected' : ''}>My exercises</option><option value="free-exercise-db" ${E.f.src === 'free-exercise-db' ? 'selected' : ''}>free-exercise-db</option><option value="wger" ${E.f.src === 'wger' ? 'selected' : ''}>wger</option></select>
      <p class="fine" id="ex-n"></p><ul id="ex-list" class="ex-list"></ul></aside>
      <article id="ex-detail" class="ex-detail"><p class="fine">Pick an exercise. Its muscles light up on the Motion Lab body; “Track live” counts your reps from the camera.</p></article></div>`;
  const upd = () => { E.f = { q: $('#ex-q').value, cat: $('#ex-cat').value, mus: $('#ex-mus').value, eq: $('#ex-eq').value, lvl: $('#ex-lvl').value, src: $('#ex-src').value }; E.shown = 200; renderList(); };
  let tm = null; $('#ex-q').oninput = () => { clearTimeout(tm); tm = setTimeout(upd, 200); };
  ['#ex-cat', '#ex-mus', '#ex-eq', '#ex-lvl', '#ex-src'].forEach((s) => ($(s).onchange = upd));
  $('#ex-close').onclick = () => { host.hidden = true; };
  $('#ex-new').onclick = () => editExercise(null);
  $('#ex-wk').onclick = () => workouts();
  renderList();
}
function filtered() {
  const f = E.f, q = f.q.toLowerCase();
  return all().filter((x) => (!q || `${x.name} ${x.primary.join(' ')} ${x.secondary.join(' ')} ${x.equipment} ${x.category}`.toLowerCase().includes(q))
    && (!f.cat || x.category === f.cat) && (!f.mus || [...x.primary, ...x.secondary].some((m) => String(m).toLowerCase() === f.mus))
    && (!f.eq || String(x.equipment).split(', ').includes(f.eq)) && (!f.lvl || x.level === f.lvl) && (!f.src || (f.src === 'mine' ? x.source === 'mine' : x.source === f.src)));
}
function renderList() {
  const xs = filtered(), ul = $('#ex-list');
  $('#ex-n').textContent = `${xs.length.toLocaleString()} match`;
  ul.innerHTML = xs.slice(0, E.shown).map((x) => `<li data-id="${esc(x.id)}" class="${E.cur?.id === x.id ? 'on' : ''}">${x.images?.[0] ? `<img src="${esc(x.images[0])}" loading="lazy" alt="">` : '<span class="ex-noimg">🏋</span>'}<span><b>${esc(x.name)}</b><small>${esc(x.primary.slice(0, 3).join(', '))}${x.source === 'mine' ? ' · mine' : ''}</small></span></li>`).join('')
    + (xs.length > E.shown ? '<li class="ex-more"><button class="ghost-btn" id="ex-more">Show more</button></li>' : '');
  ul.querySelectorAll('[data-id]').forEach((li) => (li.onclick = () => showExercise(all().find((x) => x.id === li.dataset.id))));
  $('#ex-more')?.addEventListener('click', () => { E.shown += 300; renderList(); });
}
function showExercise(x) {
  if (!x) return; E.cur = x; renderList(); highlight(x);
  window.__noteCtx = { hash: 'lab', id: x.id, label: `exercise: ${x.name}` };
  const t = x.track || { channels: ['auto'], mode: 'reps', thr: 25, label: 'auto' };
  $('#ex-detail').innerHTML = `<h2 class="cl-h">${esc(x.name)} <small>${esc([x.category, x.level, x.mechanic, x.force].filter(Boolean).join(' · '))}</small></h2>
    ${x.images?.length ? `<div class="ex-imgs"><img id="ex-anim" src="${esc(x.images[0])}" alt="${esc(x.name)}">${x.images.length > 1 ? '<p class="fine">Start ↔ end position (photos alternate).</p>' : ''}</div>` : ''}
    <p class="fine"><b>Primary</b>: ${x.primary.map(esc).join(', ') || '—'}${x.secondary.length ? ` · <b>Secondary</b>: ${x.secondary.map(esc).join(', ')}` : ''} · <b>Equipment</b>: ${esc(x.equipment)}</p>
    ${x.instructions?.length ? `<ol class="ex-steps">${x.instructions.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : '<p class="fine muted">No written instructions in the source.</p>'}
    <div class="ex-track"><b class="fine">Live tracking rule</b> <small class="fine">(${esc(t.how || 'set by you')}; a counting aid, not a form assessment)</small>
      <div class="ex-row"><label class="fine">Joint <select id="ex-ch">${Object.entries(CH).map(([k, v]) => `<option value="${k}" ${t.channels[0] === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="fine"><input type="checkbox" id="ex-both" ${t.channels.length > 1 ? 'checked' : ''}> both sides</label>
        <label class="fine">Mode <select id="ex-mode"><option value="reps" ${t.mode === 'reps' ? 'selected' : ''}>count reps</option><option value="hold" ${t.mode === 'hold' ? 'selected' : ''}>hold time</option></select></label>
        <label class="fine">${t.mode === 'hold' ? 'Allowed wobble' : 'Rep counts at'} <input id="ex-thr" type="number" value="${t.thr}" style="width:60px"> ${/heel|jump/.test(t.channels[0]) ? 'cm' : '°'}</label>
        <label class="fine">Target <input id="ex-target" type="number" value="${t.mode === 'hold' ? 30 : 10}" style="width:60px"> ${t.mode === 'hold' ? 's' : 'reps'}</label></div>
      <p class="btnrow"><button class="primary small" id="ex-go">▶ Track live</button><button class="ghost-btn" id="ex-add">+ Add to workout</button><button class="ghost-btn" id="ex-dup">Copy as my exercise</button>${x.source === 'mine' ? '<button class="ghost-btn" id="ex-edit">Edit</button><button class="ghost-btn" id="ex-del">Delete</button>' : ''}</p></div>
    <p class="fine cite">${x.source === 'mine' ? 'Your own exercise.' : `Source: ${esc(x.source)} · licence ${x.licence_url ? `<a href="${esc(x.licence_url)}" target="_blank" rel="noopener">${esc(x.licence)}</a>` : esc(x.licence)} · author ${esc(x.author)}${x.url ? ` · <a href="${esc(x.url)}" target="_blank" rel="noopener">original</a>` : ''}${x.image_credits?.length ? ` · ${esc(x.image_credits.join('; '))}` : ''}`}</p>`;
  if (x.images?.length > 1) { let k = 0; clearInterval(E.anim); E.anim = setInterval(() => { const im = $('#ex-anim'); if (!im) { clearInterval(E.anim); return; } k = (k + 1) % x.images.length; im.src = x.images[k]; }, 1100); }
  const rule = () => { const ch = $('#ex-ch').value, both = $('#ex-both').checked && /^[lr][A-Z]/.test(ch); return { channels: both ? [ch, (ch[0] === 'l' ? 'r' : 'l') + ch.slice(1)] : [ch], mode: $('#ex-mode').value, thr: +$('#ex-thr').value, target: +$('#ex-target').value, label: CH[ch] }; };
  $('#ex-go').onclick = () => { startTracking(x, rule()); $('#ex-lib').hidden = true; };
  $('#ex-add').onclick = () => { const w = E.workout || (E.workout = { name: `Workout ${new Date().toLocaleDateString()}`, items: [] }); w.items.push({ id: x.id, name: x.name, sets: 3, ...rule() }); alert(`Added to ${w.name} (${w.items.length} exercises). Open "Workouts" to run it.`); };
  $('#ex-dup').onclick = () => editExercise({ ...x, id: null, name: `${x.name} (my version)`, source: 'mine' });
  $('#ex-edit')?.addEventListener('click', () => editExercise(x));
  $('#ex-del')?.addEventListener('click', async () => { if (!confirm(`Delete “${x.name}”?`)) return; E.custom = E.custom.filter((c) => c.id !== x.id); await saveCustom(); E.cur = null; renderList(); $('#ex-detail').innerHTML = ''; });
}

// ---------------------------------------------------------------- own exercises (unlimited)
function editExercise(x0) {
  const x = x0 || { name: '', category: '', level: '', equipment: 'body only', primary: [], secondary: [], instructions: [], images: [], track: { channels: ['auto'], mode: 'reps', thr: 25 } };
  $('#ex-detail').innerHTML = `<h2 class="cl-h">${x0?.id ? 'Edit' : 'New'} exercise</h2>
    <div class="ex-form"><label>Name <input id="ef-name" value="${esc(x.name)}"></label><label>Category <input id="ef-cat" value="${esc(x.category)}" placeholder="strength, mobility, rehab, sport…"></label>
      <label>Level <input id="ef-lvl" value="${esc(x.level)}" placeholder="beginner / intermediate / expert"></label><label>Equipment <input id="ef-eq" value="${esc(x.equipment)}"></label>
      <label>Primary muscles (comma separated) <input id="ef-pm" value="${esc(x.primary.join(', '))}" placeholder="quadriceps, glutes"></label><label>Secondary muscles <input id="ef-sm" value="${esc(x.secondary.join(', '))}"></label>
      <label>Steps (one per line) <textarea id="ef-st" rows="6">${esc(x.instructions.join('\n'))}</textarea></label>
      <label>Photo (optional) <input id="ef-img" type="file" accept="image/*"></label>
      <label>Tracked joint <select id="ef-ch">${Object.entries(CH).map(([k, v]) => `<option value="${k}" ${x.track.channels[0] === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Mode <select id="ef-mode"><option value="reps">count reps</option><option value="hold" ${x.track.mode === 'hold' ? 'selected' : ''}>hold time</option></select></label><label>Threshold <input id="ef-thr" type="number" value="${x.track.thr}"></label></div>
    <p class="btnrow"><button class="primary small" id="ef-save">Save exercise</button></p><p class="fine">Saved in this browser and in data/anatomy_lab/exercises/custom.json.</p>`;
  $('#ef-save').onclick = async () => {
    const f = $('#ef-img').files[0], img = f ? await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); }) : null;
    const ch = $('#ef-ch').value, list = (s) => s.split(',').map((v) => v.trim()).filter(Boolean);
    const rec = { id: x0?.id || `mine:${Date.now().toString(36)}`, name: $('#ef-name').value.trim() || 'My exercise', source: 'mine', licence: 'own', author: 'me', category: $('#ef-cat').value, level: $('#ef-lvl').value,
      force: '', mechanic: '', equipment: $('#ef-eq').value || 'body only', primary: list($('#ef-pm').value), secondary: list($('#ef-sm').value), instructions: $('#ef-st').value.split('\n').map((s) => s.trim()).filter(Boolean),
      images: img ? [img] : (x.images || []), track: { channels: /^[lr][A-Z]/.test(ch) ? [ch, (ch[0] === 'l' ? 'r' : 'l') + ch.slice(1)] : [ch], mode: $('#ef-mode').value, thr: +$('#ef-thr').value, how: 'set by you' } };
    E.custom = E.custom.filter((c) => c.id !== rec.id); E.custom.unshift(rec); await saveCustom(); showExercise(rec);
    $('#ex-count').textContent = `${E.lib.length.toLocaleString()} exercises from open libraries + ${E.custom.length} of your own.`;
  };
}

// ---------------------------------------------------------------- workouts: build, generate, run, log
function workouts() {
  const w = E.workout || (E.workout = { name: `Workout ${new Date().toLocaleDateString()}`, items: [] });
  const muscles = [...new Set(all().flatMap((x) => x.primary.map((m) => String(m).toLowerCase())))].sort(), eqs = [...new Set(all().flatMap((x) => String(x.equipment).split(', ')))].sort();
  $('#ex-detail').innerHTML = `<h2 class="cl-h">Workouts</h2>
    <div class="ex-track"><b class="fine">Generate</b><div class="ex-row"><select id="wg-mus" multiple size="5">${muscles.map((m) => `<option>${esc(m)}</option>`).join('')}</select><select id="wg-eq" multiple size="5">${eqs.map((m) => `<option>${esc(m)}</option>`).join('')}</select>
      <label class="fine">Exercises <input id="wg-n" type="number" value="6" style="width:50px"></label><label class="fine">Sets <input id="wg-s" type="number" value="3" style="width:50px"></label><button class="ghost-btn" id="wg-go">Generate</button></div>
      <p class="fine">Ctrl/Shift-click to pick several muscles / equipment; picks are random among matches (a browsing aid, not a training prescription).</p></div>
    <div class="ex-track"><b class="fine">Current: </b><input id="wk-name" value="${esc(w.name)}"> <ol class="ex-steps">${w.items.map((it, i) => `<li>${esc(it.name)} · ${it.sets} × ${it.target} ${it.mode === 'hold' ? 's' : 'reps'} · ${esc(it.label)} <a href="#" data-rm="${i}">✕</a></li>`).join('') || '<li class="muted">Empty: add exercises from the library or generate.</li>'}</ol>
      <p class="btnrow"><button class="primary small" id="wk-run" ${w.items.length ? '' : 'disabled'}>▶ Run workout</button><button class="ghost-btn" id="wk-save">Save workout</button><button class="ghost-btn" id="wk-clear">Clear</button></p></div>
    ${E.workouts.length ? `<div class="ex-track"><b class="fine">Saved workouts</b><ul class="ex-steps">${E.workouts.map((s, i) => `<li><a href="#" data-load="${i}">${esc(s.name)}</a> · ${s.items.length} exercises <a href="#" data-wdel="${i}">✕</a></li>`).join('')}</ul></div>` : ''}
    <div class="ex-track"><b class="fine">Session log</b> (${E.sessions.length}) <button class="ghost-btn" id="wk-csv">⭳ CSV</button><ul class="ex-steps">${E.sessions.slice(-12).reverse().map((s) => `<li>${esc(new Date(s.t).toLocaleString())} · ${esc(s.name)} · ${s.mode === 'hold' ? `${s.held.toFixed(1)} s held` : `${s.reps} reps, mean range ${s.meanRom?.toFixed(0) ?? '—'}${s.unit}`}</li>`).join('')}</ul></div>`;
  $('#wg-go').onclick = () => {
    const ms = [...$('#wg-mus').selectedOptions].map((o) => o.value), es = [...$('#wg-eq').selectedOptions].map((o) => o.value), n = +$('#wg-n').value, sets = +$('#wg-s').value;
    const pool = all().filter((x) => (!ms.length || x.primary.some((m) => ms.includes(String(m).toLowerCase()))) && (!es.length || String(x.equipment).split(', ').some((e) => es.includes(e))) && x.track);
    const pick = []; const used = new Set(); while (pick.length < n && used.size < pool.length) { const x = pool[Math.floor(Math.random() * pool.length)]; if (used.has(x.id)) continue; used.add(x.id); pick.push(x); }
    w.items = pick.map((x) => ({ id: x.id, name: x.name, sets, channels: x.track.channels, mode: x.track.mode, thr: x.track.thr, target: x.track.mode === 'hold' ? 30 : 10, label: x.track.label }));
    workouts();
  };
  $('#wk-name').onchange = (e) => { w.name = e.target.value; };
  $('#ex-detail').querySelectorAll('[data-rm]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); w.items.splice(+a.dataset.rm, 1); workouts(); }));
  $('#ex-detail').querySelectorAll('[data-load]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); E.workout = JSON.parse(JSON.stringify(E.workouts[+a.dataset.load])); workouts(); }));
  $('#ex-detail').querySelectorAll('[data-wdel]').forEach((a) => (a.onclick = async (e) => { e.preventDefault(); E.workouts.splice(+a.dataset.wdel, 1); await saveCustom(); workouts(); }));
  $('#wk-save').onclick = async () => { E.workouts = E.workouts.filter((s) => s.name !== w.name); E.workouts.push(JSON.parse(JSON.stringify(w))); await saveCustom(); workouts(); };
  $('#wk-clear').onclick = () => { w.items = []; workouts(); };
  $('#wk-run').onclick = () => { E.run = { w, i: 0, set: 1 }; nextInWorkout(); $('#ex-lib').hidden = true; };
  $('#wk-csv').onclick = () => { const rows = [['time', 'exercise', 'mode', 'reps', 'held_s', 'mean_range', 'unit', 'target'], ...E.sessions.map((s) => [s.t, s.name, s.mode, s.reps, s.held?.toFixed(1), s.meanRom?.toFixed(1), s.unit, s.target])]; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' })); a.download = 'motion_lab_exercise_sessions.csv'; a.click(); };
}
function nextInWorkout() {
  const R = E.run; if (!R) return;
  const it = R.w.items[R.i]; if (!it) { E.run = null; hud(`<b>Workout done</b> · ${R.w.items.length} exercises. Log saved.`); return; }
  startTracking(all().find((x) => x.id === it.id) || { name: it.name, primary: [], secondary: [] }, it, `Set ${R.set}/${it.sets} · exercise ${R.i + 1}/${R.w.items.length}`);
}

// ---------------------------------------------------------------- live counter
class Tracker {
  constructor(rule, onDone) { this.r = rule; this.onDone = onDone; this.reps = 0; this.roms = []; this.base = null; this.phase = 'rest'; this.peak = 0; this.t0 = null; this.hist = []; this.held = 0; this.last = null; this.done = false; }
  value(ch) {
    let ks = this.r.channels;
    if (ks[0] === 'auto') { // pick the channel that moved most over the last 4 s
      if (!this.auto || this.hist.length % 30 === 0) { const rng = {}; for (const h of this.hist) for (const [k, v] of Object.entries(h.ch)) { if (!(k in CH)) continue; const r = (rng[k] ||= [v, v]); r[0] = Math.min(r[0], v); r[1] = Math.max(r[1], v); } const best = Object.entries(rng).sort((a, b) => (b[1][1] - b[1][0]) - (a[1][1] - a[1][0]))[0]; if (best) this.auto = best[0]; }
      ks = this.auto ? [this.auto] : [];
    }
    const vs = ks.map((k) => ch[k]).filter((v) => Number.isFinite(v)); this.ch = ks;
    return vs.length ? vs.reduce((s, v) => s + v, 0) / vs.length : null;
  }
  push(t, ch) {
    if (this.done) return;
    this.hist.push({ t, ch }); while (this.hist.length && t - this.hist[0].t > 4) this.hist.shift();
    const v = this.value(ch); if (v == null) return;
    if (this.base == null) this.base = v;
    const dev = v - this.base, thr = this.r.thr;
    if (this.r.mode === 'hold') {
      if (this.last != null && Math.abs(dev) <= thr) this.held += Math.min(0.2, t - this.last);
      this.last = t; this.cur = v; this.dev = dev;
      if (this.held >= (this.r.target || 30)) this.finish();
      return;
    }
    if (this.phase === 'rest') { if (Math.abs(dev) < thr * 0.25) this.base += 0.05 * dev; if (Math.abs(dev) >= thr) { this.phase = 'out'; this.peak = dev; this.t0 = t; } }
    else { if (Math.abs(dev) > Math.abs(this.peak)) this.peak = dev; if (Math.abs(dev) < Math.abs(this.peak) * 0.3) { this.phase = 'rest'; this.reps += 1; this.roms.push(Math.abs(this.peak)); this.lastDur = t - this.t0; if (this.reps >= (this.r.target || 10)) this.finish(); } }
    this.cur = v; this.dev = dev;
  }
  finish() { this.done = true; this.onDone?.(this); }
}
function startTracking(x, rule, sub = '') {
  const unit = /heel|jump/.test(rule.channels[0]) ? ' cm' : '°';
  E.tracker = new Tracker(rule, (tr) => {
    const s = { t: new Date().toISOString(), name: x.name, id: x.id, mode: rule.mode, reps: tr.reps, held: tr.held, meanRom: tr.roms.length ? tr.roms.reduce((a, b) => a + b, 0) / tr.roms.length : null, unit, target: rule.target, channel: tr.ch?.join('+') };
    E.sessions.push(s); saveCustom();
    if (E.run) { const it = E.run.w.items[E.run.i]; if (E.run.set < it.sets) E.run.set += 1; else { E.run.i += 1; E.run.set = 1; } setTimeout(nextInWorkout, 2500); hud(`<b>${esc(x.name)}</b> done · next in 2.5 s…`); }
  });
  highlight(x);
  const tick = () => {
    const tr = E.tracker; if (!tr) return;
    hud(`<div class="ex-h"><b>${esc(x.name)}</b> <small>${esc(sub)}</small> <button class="ghost-btn" id="ex-stop">■ Stop</button></div>
      ${rule.mode === 'hold' ? `<div class="ex-big">${tr.held.toFixed(1)}<small> / ${rule.target || 30} s held</small></div>` : `<div class="ex-big">${tr.reps}<small> / ${rule.target || 10} reps</small></div>`}
      <p class="fine">Tracking: ${esc((tr.ch || rule.channels).map((k) => CH[k] || k).join(' + '))} · now ${tr.cur != null ? tr.cur.toFixed(0) : '—'}${unit} (change ${tr.dev != null ? tr.dev.toFixed(0) : '—'}${unit}, counts at ${rule.thr}${unit})${tr.roms.length ? ` · last range ${tr.roms[tr.roms.length - 1].toFixed(0)}${unit} in ${tr.lastDur?.toFixed(1)} s` : ''}</p>
      <p class="fine muted">${tr.cur == null ? 'No live pose yet: start the camera in Setup (or play a demo clip).' : 'A counting aid from joint angles, not a form assessment.'}</p>`);
    $('#ex-stop')?.addEventListener('click', () => { if (E.tracker && !E.tracker.done) E.tracker.finish(); E.tracker = null; E.run = null; hud(''); });
    if (!tr.done) requestAnimationFrame(() => setTimeout(tick, 150));
  };
  tick();
}
function hud(html) { const h = $('#ex-hud'); if (!h) return; h.hidden = !html; h.innerHTML = html; }

// ---------------------------------------------------------------- light the exercise's muscles on the Motion Lab body
function highlight(x) {
  const L = window.__lab; if (!L?.groups) return;
  (E.lit || []).forEach(([m, mat]) => { m.material = mat; }); E.lit = [];
  const pr = x.primary.map((m) => MUSCLE_RE[String(m).toLowerCase()] || new RegExp(String(m).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))), se = x.secondary.map((m) => MUSCLE_RE[String(m).toLowerCase()] || new RegExp(String(m).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  L.groups.forEach((g) => g.children.forEach((m) => {
    const p = m.userData.part; if (!p || p.layer !== 'muscles') return;
    const n = p.name.toLowerCase(), isP = pr.some((r) => r.test(n)), isS = !isP && se.some((r) => r.test(n));
    if (!isP && !isS) return;
    const mat = m.material.clone(); mat.emissive = new (m.material.emissive.constructor)(isP ? 0xff3b4e : 0xffb703); mat.emissiveIntensity = isP ? 0.7 : 0.45; mat.transparent = false; mat.opacity = 1;
    E.lit.push([m, m.material]); m.material = mat; m.visible = true;
  }));
}
