// Training System: Team (group dashboard), Athletes (roster + editor), Athlete (plan with reasoning, logs, tests,
// injuries, overrides, monitoring, audit), Audit log. Data: /api/ath/* (anatomy_lab/athletes_api.py), private and
// local. Every change is written to the audit log; manual phase changes and plan overrides require a reason.
import { S, T, esc, fmt, go, href, header, bindTips, kv, STAGE_COL, PAL } from './training.js';

const $ = (s, r = document) => r.querySelector(s);
const aget = async (route, params = {}) => { const u = new URL(`/api/ath/${route}`, location.origin); Object.entries(params).forEach(([k, v]) => v != null && u.searchParams.set(k, v)); const r = await fetch(u); const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || r.statusText); return j; };
export const actor = () => { try { return localStorage.getItem('ts-actor') || ''; } catch { return ''; } };
const apost = async (route, body) => { const r = await fetch(`/api/ath/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, by: actor() }) }); const j = await r.json(); if (!r.ok || j.ok === false) throw new Error(j.error || r.statusText); return j; };
const today = () => new Date().toISOString().slice(0, 10);
const STC = { Active: 'ok', Injured: 'bad', Returning: 'warn', Inactive: '' };

export async function page(p, main, args) {
  try {
    if (p === 'team') return await team(main, args);
    if (p === 'athletes') return await roster(main, args);
    if (p === 'athlete') return await athletePage(main, args);
    if (p === 'audit') return await auditPage(main);
    if (p === 'staff') return await staffPage(main);
  } catch (e) { main.innerHTML = `<section class="card"><p class="muted">${esc(e.message)}</p></section>`; }
}

// ================================================================= TEAM DASHBOARD
async function team(main, args) {
  const L = await aget('list'), gid = args[0] ? +args[0] : null, D = await aget('dashboard', { group: gid });
  const A = D.athletes;
  main.innerHTML = `${header('Team dashboard', 'Every athlete at a glance: status, phase, this week\'s load, the 7-day vs 28-day load ratio, readiness, pain and open injuries, with automatic flags. Private: stored on this machine only.', 'Team')}
    <section class="card"><div class="chips"><a class="chip-btn ${!gid ? 'on' : ''}" href="${href('team')}" style="text-decoration:none">All athletes <small>${L.athletes.length}</small></a>${L.groups.map((g) => `<a class="chip-btn ${gid === g.id ? 'on' : ''}" href="${href('team', String(g.id))}" style="text-decoration:none">${esc(g.name)} <small>${L.athletes.filter((a) => a.groups.includes(g.id)).length}</small></a>`).join('')}
      <a class="ghost-btn" href="${href('athletes')}">Manage athletes &amp; groups</a><a class="ghost-btn" href="${href('audit')}">Audit log</a></div></section>
    <div class="kpis">${[[D.n, 'athletes', '#6fd3ff'], [D.by_status.Active.length, 'active', '#64e6a8'], [D.by_status.Injured.length, 'injured', '#ff6b6b'], [D.by_status.Returning.length, 'returning to play', '#ffc067'],
      [D.flagged.length, 'with flags', '#ff8fa3'], [Math.round(D.week_load_total), 'group load this week (AU)', '#b49bff']].map(([n, l, c]) => `<div class="kpi" style="--c:${c};cursor:default"><b>${fmt(n)}</b><span>${l}</span></div>`).join('')}</div>
    <div class="tr-grid"><section class="card s8"><div class="card-h"><h2>Athletes</h2><button class="primary small" id="tm-log">Log a session for…</button></div>
      <div class="tt-wrap" style="max-height:none"><table class="tt"><thead><tr><th>Athlete</th><th>Status · level</th><th>Phase</th><th>Last session</th><th>Week load</th><th>7d:28d</th><th>Monotony</th><th>Readiness</th><th>Pain</th><th>Programs today</th><th>Latest update</th><th>Flags</th></tr></thead><tbody>
      ${A.map((a) => { const s = a.summary; return `<tr class="click" data-a="${a.id}"><td><b>${esc(a.name)}</b><div class="mini">${esc(a.sport || '')}${a.condition ? ` · ${esc(a.condition)}` : ''}</div></td><td><span class="pill ${STC[a.status] || ''}">${esc(a.status)}</span><div class="mini">${esc(a.level || '')}</div></td>
        <td><b style="color:${STAGE_COL[String(s.phase || '1')[0]]}">${esc(s.phase || '—')}</b><div class="mini">${esc(s.phase_name || '')}${s.auto_phase && s.auto_phase !== s.phase ? ` · tests: ${esc(s.auto_phase)}` : ''}</div></td>
        <td class="mini">${esc(s.last_day || '—')}<div>${s.sessions} logged</div></td><td class="num">${s.week_load != null ? fmt(Math.round(s.week_load)) : '—'}</td><td class="num ${s.acwr > 1.5 ? 'bad' : ''}">${s.acwr ?? '—'}</td><td class="num">${s.monotony ?? '—'}</td>
        <td class="num">${s.last_readiness ?? '—'}</td><td class="num">${s.last_pain ?? '—'}</td><td class="mini">${(s.programs || []).filter((p) => p.scheduled).map((p) => `${esc(p.title)}${p.level ? ` <small>${esc(p.level)}·${esc(p.block)}</small>` : ''}`).join('<br>') || '<span class="muted">none</span>'}</td><td class="mini">${s.mode && s.mode !== 'Standard' ? `<span class="pill warn">${esc(s.mode)}</span><br>` : ''}${s.updates?.[0] ? `<b>${esc(s.updates[0].group)}</b>: ${esc(s.updates[0].text)}<br><small>${esc(s.updates[0].ts)}${s.updates[0].reason ? ` · ${esc(s.updates[0].reason)}` : ''}</small>` : '—'}</td><td class="mini" style="color:#ff9b9b">${s.flags.map(esc).join('<br>') || (s.open_injuries ? `${s.open_injuries} open injury` : '')}</td></tr>`; }).join('') || '<tr><td colspan="12" class="muted">No athletes yet: add one under Manage athletes.</td></tr>'}</tbody></table></div></section>
      <section class="card s4"><div class="card-h"><h2>Phase map</h2></div>${Object.entries(D.phases).sort().map(([ph, names]) => `<div class="comp" style="grid-template-columns:60px 1fr"><b style="color:${STAGE_COL[ph[0]] || '#ccc'}">${esc(ph)}</b><span class="mini">${names.map(esc).join(', ')}</span></div>`).join('') || '<p class="mini">—</p>'}
        <div class="card-h" style="margin-top:10px"><h2>Levels</h2></div>${Object.entries(D.levels).map(([lv, n]) => `<div class="comp" style="grid-template-columns:130px 1fr"><span>${esc(lv)}</span><span class="vbar"><i style="width:${D.n ? (100 * n) / D.n : 0}%"></i></span></div>`).join('')}</section>
      <section class="card s12"><div class="card-h"><h2>Group load, last 28 days</h2><small>sum of minutes × session RPE per day (AU)</small></div><div id="tm-load"><p class="muted">Loading…</p></div></section></div>
    <p class="fine">Flags: 7-day load above 1.5× the 28-day weekly average, monotony above 2, pain above 3/10 or readiness below 55 in the last 3 days, or a weekly rise beyond the athlete's own largest pain-free rise. They are prompts for a conversation, not predictions or diagnoses. The acute:chronic ratio is debated as an injury predictor and is shown as a trend only.</p>`;
  main.querySelectorAll('[data-a]').forEach((tr) => (tr.onclick = () => go('athlete', tr.dataset.a)));
  $('#tm-log').onclick = () => { const id = prompt(`Athlete number:\n${A.map((a) => `${a.id} · ${a.name}`).join('\n')}`); if (id) go('athlete', id, 'log'); };
  // stacked group load chart (fetch each athlete's daily series)
  const full = await Promise.all(A.map((a) => aget('get', { id: a.id }).catch(() => null)));
  const days = full.find(Boolean)?.monitor.daily.slice(-28).map((d) => d.day) || [];
  const W = 1100, H = 200, bw = (W - 40) / Math.max(1, days.length), tot = days.map((d) => full.reduce((s, f) => s + (f?.monitor.daily.find((x) => x.day === d)?.load || 0), 0)), mx = Math.max(1, ...tot);
  $('#tm-load').innerHTML = days.length ? `<svg class="chart" viewBox="0 0 ${W} ${H}">${days.map((d, i) => { let y = H - 22;
    return full.map((f, j) => { const v = f?.monitor.daily.find((x) => x.day === d)?.load || 0, h = ((H - 40) * v) / mx; y -= h; return v ? `<rect x="${20 + i * bw + 2}" y="${y}" width="${bw - 4}" height="${h}" fill="${PAL[j % PAL.length]}" opacity="0.85" data-tip="${esc(f.name)} · ${d}: ${fmt(v)} AU"/>` : ''; }).join('') + (i % 7 === 0 ? `<text x="${20 + i * bw}" y="${H - 6}" class="t-muted" font-size="9">${d.slice(5)}</text>` : ''); }).join('')}</svg>
    <div class="legend">${full.filter(Boolean).map((f, j) => `<span><i style="background:${PAL[j % PAL.length]}"></i>${esc(f.name)}</span>`).join('')}</div>` : '<p class="mini">No sessions logged yet.</p>';
  bindTips($('#tm-load'));
}

// ================================================================= ROSTER + GROUPS
async function roster(main) {
  const L = await aget('list'), LA = await aget('list', { archived: '1' }), archived = LA.athletes.filter((x) => x.archived);
  const conds = T('Conditions_Meta').map((c) => c.Condition), sports = T('Sports_Demands').map((s) => s.Sport);
  const gname = (g) => L.groups.find((x) => x.id === g)?.name || g;
  const gopts = (blank) => `${blank ? `<option value="">${blank}</option>` : ''}${L.groups.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}`;
  main.innerHTML = `${header('Athletes & groups', 'Add, edit, group, move between groups, archive or delete athletes. Select several athletes to act on them together. Every change is written to the audit log.', 'Team')}
    <div class="tr-grid"><section class="card s8"><div class="card-h"><h2>Roster</h2><button class="primary small" id="ro-new">Add athlete</button></div>
      <div class="bar" id="ro-bulk" style="margin-bottom:8px"><span class="mini" id="ro-n">0 selected</span>
        <label>Move to <select class="tr-sel" id="bk-move">${gopts('— group —')}</select></label><label class="mini">from <select class="tr-sel" id="bk-from">${gopts('all their groups')}</select></label><button class="ghost-btn" id="bk-move-go">Move</button>
        <label>Add to <select class="tr-sel" id="bk-add">${gopts('— group —')}</select></label><button class="ghost-btn" id="bk-add-go">Add</button>
        <label>Remove from <select class="tr-sel" id="bk-rm">${gopts('— group —')}</select></label><button class="ghost-btn" id="bk-rm-go">Remove</button>
        <button class="ghost-btn" id="bk-arch">Archive</button><span class="mini" id="bk-msg"></span></div>
      <div class="tt-wrap" style="max-height:none"><table class="tt"><thead><tr><th><input type="checkbox" id="ro-all"></th><th>Name</th><th>Sport · position</th><th>Level</th><th>Status</th><th>Condition</th><th>Groups</th><th></th></tr></thead><tbody>
      ${L.athletes.map((a) => `<tr><td><input type="checkbox" data-sel="${a.id}"></td><td><a class="lk" href="${href('athlete', String(a.id))}"><b>${esc(a.name)}</b></a></td><td class="mini">${esc(a.sport || '')} ${esc(a.position || '')}</td><td>${esc(a.level || '')}</td><td><span class="pill ${STC[a.status] || ''}">${esc(a.status || '')}</span></td><td class="mini">${esc(a.condition || '—')}</td>
        <td class="mini">${a.groups.map((g) => `<span class="chip-btn">${esc(gname(g))} <button class="ghost-btn tiny" data-unmem="${a.id}:${g}" title="Remove from this group">×</button></span>`).join(' ') || '<span class="muted">no group</span>'}</td>
        <td><button class="ghost-btn tiny" data-edit="${a.id}">Edit</button> <button class="ghost-btn tiny" data-del="${a.id}">Delete</button></td></tr>`).join('') || '<tr><td colspan="8" class="muted">No athletes.</td></tr>'}</tbody></table></div></section>
      <section class="card s4"><div class="card-h"><h2>Groups</h2></div>${L.groups.map((g) => `<div class="comp" style="grid-template-columns:1fr auto"><span><b>${esc(g.name)}</b> <small>${esc(g.kind || '')}</small><div class="mini">${L.athletes.filter((a) => a.groups.includes(g.id)).map((a) => esc(a.name)).join(', ') || 'empty'}</div></span><span><button class="ghost-btn tiny" data-gren="${g.id}">Rename</button> <button class="ghost-btn tiny" data-gdel="${g.id}">Delete</button></span></div>`).join('') || '<p class="mini">No groups yet.</p>'}
        <div class="bar" style="margin-top:8px"><input class="tr-in" id="gr-name" placeholder="New group (e.g. First team, Rehab group)"><select class="tr-sel" id="gr-kind"><option>Squad</option><option>Rehab group</option><option>Position group</option><option>Age group</option><option>Other</option></select><button class="ghost-btn" id="gr-add">Add</button></div>
        ${archived.length ? `<div class="card-h" style="margin-top:12px"><h2>Archived</h2></div>${archived.map((a) => `<div class="comp" style="grid-template-columns:1fr auto"><span>${esc(a.name)} <small>${esc(a.sport || '')}</small></span><span><button class="ghost-btn tiny" data-restore="${a.id}">Restore</button> <button class="ghost-btn tiny" data-del="${a.id}">Delete</button></span></div>`).join('')}` : ''}</section>
      <section class="card s12" id="ro-form" hidden></section></div>`;
  const reload = () => roster(main);
  const sel = () => [...main.querySelectorAll('[data-sel]:checked')].map((x) => +x.dataset.sel);
  const upd = () => { $('#ro-n').textContent = `${sel().length} selected`; };
  main.querySelectorAll('[data-sel]').forEach((x) => (x.onchange = upd));
  $('#ro-all').onchange = (e) => { main.querySelectorAll('[data-sel]').forEach((x) => { x.checked = e.target.checked; }); upd(); };
  const bulk = async (body) => { const ids = sel(); if (!ids.length) { $('#bk-msg').textContent = 'Select athletes first.'; return; } const r = prompt('Reason (kept in the audit log):', ''); if (r == null) return;
    try { await apost('members', { ...body, athletes: ids, reason: r }); reload(); } catch (e) { $('#bk-msg').textContent = e.message; } };
  $('#bk-move-go').onclick = () => { if (!$('#bk-move').value) return ($('#bk-msg').textContent = 'Choose a target group.'); bulk({ action: 'move', to: +$('#bk-move').value, from: $('#bk-from').value ? +$('#bk-from').value : null }); };
  $('#bk-add-go').onclick = () => { if (!$('#bk-add').value) return ($('#bk-msg').textContent = 'Choose a group.'); bulk({ action: 'add', to: +$('#bk-add').value }); };
  $('#bk-rm-go').onclick = () => { if (!$('#bk-rm').value) return ($('#bk-msg').textContent = 'Choose a group.'); bulk({ action: 'remove', from: +$('#bk-rm').value }); };
  $('#bk-arch').onclick = async () => { const ids = sel(); if (!ids.length) return ($('#bk-msg').textContent = 'Select athletes first.'); const r = prompt(`Reason for archiving ${ids.length} athlete(s):`); if (!r) return; for (const id of ids) await apost('archive', { id, reason: r }); reload(); };
  main.querySelectorAll('[data-unmem]').forEach((b) => (b.onclick = async () => { const [aid, g] = b.dataset.unmem.split(':').map(Number); const r = prompt(`Remove from ${gname(g)}? Reason:`, ''); if (r == null) return; await apost('members', { action: 'remove', athletes: [aid], from: g, reason: r }); reload(); }));
  main.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    const a = [...L.athletes, ...archived].find((x) => x.id === +b.dataset.del);
    const name = prompt(`Delete ${a.name} permanently? Sessions, tests, injuries, programs and phase history are removed (one audit line is kept). Archive instead if you may need the record.\n\nType the name exactly to confirm:`); if (name == null) return;
    const r = prompt('Reason for deleting:'); if (!r) return;
    try { const out = await apost('delete', { id: a.id, confirm: name, reason: r }); alert(`Deleted. Records removed: ${Object.entries(out.removed).map(([k, v]) => `${k} ${v}`).join(', ')}`); reload(); } catch (e) { alert(e.message); } }));
  main.querySelectorAll('[data-restore]').forEach((b) => (b.onclick = async () => { await apost('restore', { id: +b.dataset.restore, reason: 'restored from archive' }); reload(); }));
  $('#gr-add').onclick = async () => { const n = $('#gr-name').value.trim(); if (!n) return; await apost('group', { name: n, kind: $('#gr-kind').value }); reload(); };
  main.querySelectorAll('[data-gdel]').forEach((b) => (b.onclick = async () => { const r = prompt('Delete this group? Athletes are kept (only the membership goes). Reason:'); if (r == null) return; await apost('group', { id: +b.dataset.gdel, delete: true, reason: r }); reload(); }));
  main.querySelectorAll('[data-gren]').forEach((b) => (b.onclick = async () => { const g = L.groups.find((x) => x.id === +b.dataset.gren); const n = prompt('New name:', g.name); if (!n) return; await apost('group', { id: g.id, name: n, kind: g.kind, notes: g.notes, reason: 'renamed' }); reload(); }));
  const form = (a = {}) => {
    const f = $('#ro-form'); f.hidden = false;
    f.innerHTML = `<div class="card-h"><h2>${a.id ? `Edit ${esc(a.name)}` : 'New athlete'}</h2></div><div class="formgrid">
      <label>Name<input class="tr-in" data-f="name" value="${esc(a.name || '')}"></label>
      <label>Sport<select class="tr-sel" data-f="sport">${sports.map((s) => `<option ${s === a.sport ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
      <label>Position / role<input class="tr-in" data-f="position" value="${esc(a.position || '')}"></label>
      <label>Level<select class="tr-sel" data-f="level">${L.levels.map((s) => `<option ${s === a.level ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
      <label>Status<select class="tr-sel" data-f="status">${L.statuses.map((s) => `<option ${s === a.status ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
      <label>Condition (pathway)<select class="tr-sel" data-f="condition"><option value="">— none (healthy / performance)</option>${conds.map((s) => `<option ${s === a.condition ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
      <label>Injury / surgery date<input class="tr-in" type="date" data-f="injury_date" value="${esc(a.injury_date || '')}"></label>
      <label>Manual phase (blank = from tests)<select class="tr-sel" data-f="phase_manual"><option value="">auto from tests</option>${T('Phase_System').map((p) => `<option ${p.Code === a.phase_manual ? 'selected' : ''}>${esc(p.Code)}</option>`).join('')}</select></label>
      <label>Phase start date<input class="tr-in" type="date" data-f="phase_start" value="${esc(a.phase_start || today())}"></label>
      <label>Body mass (kg)<input class="tr-in" data-f="body_mass" value="${esc(a.body_mass ?? '')}"></label><label>Height (cm)<input class="tr-in" data-f="height" value="${esc(a.height ?? '')}"></label>
      <label>Age<input class="tr-in" data-f="age" value="${esc(a.age ?? '')}"></label><label>Sex<select class="tr-sel" data-f="sex"><option></option><option ${a.sex === 'M' ? 'selected' : ''}>M</option><option ${a.sex === 'F' ? 'selected' : ''}>F</option></select></label>
      <label style="grid-column:1/-1">Notes<input class="tr-in" data-f="notes" value="${esc(a.notes || '')}"></label>
      <label style="grid-column:1/-1">Groups<span class="chips">${L.groups.map((g) => `<label class="chip-btn"><input type="checkbox" data-g="${g.id}" ${(a.groups || []).includes(g.id) ? 'checked' : ''}> ${esc(g.name)}</label>`).join('') || '<small>create a group first</small>'}</span></label>
      <label style="grid-column:1/-1">Reason for this change (required for a manual phase; recorded in the audit log)<input class="tr-in" id="ro-reason"></label></div>
      <div class="bar" style="margin-top:8px"><button class="primary small" id="ro-save">Save</button>${a.id ? '<button class="ghost-btn" id="ro-arch">Archive</button>' : ''}<span class="mini" id="ro-msg"></span></div>`;
    $('#ro-save').onclick = async () => {
      const b = { reason: $('#ro-reason').value, groups: [...f.querySelectorAll('[data-g]:checked')].map((x) => +x.dataset.g) }; if (a.id) b.id = a.id;
      f.querySelectorAll('[data-f]').forEach((x) => { const v = x.value.trim(); b[x.dataset.f] = ['body_mass', 'height', 'age'].includes(x.dataset.f) ? (v === '' ? null : +v) : v; });
      try { const r = await apost('save', b); go('athlete', String(r.id)); } catch (e) { $('#ro-msg').textContent = e.message; }
    };
    $('#ro-arch')?.addEventListener('click', async () => { const r = prompt('Reason for archiving (kept in the audit log):'); if (!r) return; await apost('archive', { id: a.id, reason: r }); reload(); });
    f.scrollIntoView({ behavior: 'smooth' });
  };
  $('#ro-new').onclick = () => form({ level: 'Amateur', status: 'Active', sport: 'General / Non-sport' });
  main.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = async () => form(await aget('get', { id: b.dataset.edit }))));
}

// ================================================================= ATHLETE
async function athletePage(main, args) {
  const a = await aget('get', { id: args[0] }), tab = args[1] || 'plan', P = a.plan, M = a.monitor;
  const tabs = [['plan', 'Plan & reasoning'], ['programs', `Programs (${a.programs.length})`], ['monitor', 'Monitoring'], ['log', `Sessions (${a.sessions.length})`], ['tests', `Tests (${a.tests.length})`], ['injuries', `Injuries (${a.injuries.length})`], ['overrides', `Overrides (${a.overrides.filter((o) => o.active).length})`], ['care', `Care team (${a.care.length})`], ['updates', 'Updates'], ['audit', 'Audit']];
  main.innerHTML = `${header(esc(a.name), `${esc(a.sport || '')} ${a.position ? `· ${esc(a.position)}` : ''} · ${esc(a.level || '')} · ${esc(a.condition || 'no condition pathway')}`, `<a class="lk" href="${href('team')}">Team</a> · <a class="lk" href="${href('athletes')}">Athletes</a>`)}
    <section class="card"><div class="links-row"><span class="pill ${STC[a.status] || ''}">${esc(a.status)}</span><span class="pill acc">phase ${esc(P.phase)}${P.auto_phase !== P.phase ? ` (tests: ${esc(P.auto_phase)})` : ''} · day ${P.day_in_phase}</span>${P.mode && P.mode !== 'Standard' ? `<span class="pill warn" title="${esc(P.modifications || '')}">${esc(P.mode)}</span>` : ''}
      <span class="pill">7d:28d ${M.last.acwr ?? '—'}</span><span class="pill">week load ${M.last.acute != null ? fmt(Math.round(M.last.acute)) : '—'} AU</span>${M.flags.map((f) => `<span class="pill bad">${esc(f)}</span>`).join('')}
      ${a.condition ? `<a class="ghost-btn" href="${href('pathway', a.condition, a.sport || 'General / Non-sport')}">Full pathway</a>` : ''}<a class="ghost-btn" href="${href('athletes')}">Edit athlete</a></div>
      <div class="chips" style="margin-top:8px">${tabs.map(([k, l]) => `<a class="chip-btn ${k === tab ? 'on' : ''}" href="${href('athlete', String(a.id), k)}" style="text-decoration:none">${l}</a>`).join('')}</div></section>
    <div id="at-body"></div>`;
  const body = $('#at-body');
  if (tab === 'plan') {
    const dp = P.day_plan;
    body.innerHTML = `<div class="tr-grid"><section class="card s5">${progCard(a)}<div class="card-h"><h2>Why this plan (step by step)</h2></div><ol class="tree" style="padding-left:18px;margin:0">${P.why.map((w) => `<li>${esc(w)}</li>`).join('')}</ol>
        ${phasePanel(a)}</section>
      <section class="card s7"><div class="card-h"><h2>Today${dp ? ` · ${esc(dp.condition)} · ${esc(dp.phase)} day ${dp.day}/${dp.days} · ${esc(dp.undulation)}` : ''}</h2></div>
        ${dp ? dp.rows.map((r) => `<div class="comp"><div><b>${esc(r.label)}</b><div class="mini">${esc(r.session)} · level ${r.level || '—'}</div>${r.level ? `<button class="ghost-btn tiny" data-ov="${r.comp}">Override…</button>` : ''}</div><div><b>${esc(r.today)}</b><div class="mini">${esc(r.dose)}</div>${r.level ? `<div class="mini" style="color:var(--accent2)">${esc(r.why)}</div>` : ""}${r.level ? `<details><summary class="mini">why this exercise</summary><p class="mini">${esc(r.physio)}</p><p class="mini">${esc(r.sc)}</p></details>` : ''}</div></div>`).join('') : '<p class="mini">Set a condition for this athlete to get the condition pathway.</p>'}
        ${P.court ? `<div class="card-h" style="margin-top:12px"><h2>Court training (${esc(a.sport || '')}, level L${P.court.level})</h2></div>
          ${P.court.today ? `<div class="comp"><div><b>${esc(P.court.today['Level name'])}</b><div class="mini">phases ${esc(P.court.today['Typical phases'])}</div></div><div><b>${esc(P.court.today['PRIMARY drill'])}</b><div class="mini">A ${esc(P.court.today['Alt A — easier, same goal'])} · B ${esc(P.court.today['Alt B — different set-up, same demand'])} · C ${esc(P.court.today['Alt C — variation / perceptual'])}</div><div class="mini">${esc(P.court.today['Physio justification'])} · ${esc(P.court.today['S&C justification'])}</div></div></div>` : ''}
          ${P.court.warmup ? `<p class="mini"><b>10-minute warm-up ${esc(P.court.warmup['Warm-up ID'])}</b>: ${['0:00-2:00 Mobility', '2:00-3:30 Activation & strength', '3:30-4:30 Loading hold (isometric)', '4:30-6:30 Dynamic movement', '6:30-8:30 Pre-game movement drills', '8:30-10:00 High-intensity clearance'].map((k) => `<b>${esc(k.split(' ')[0])}</b> ${esc(P.court.warmup[k])}`).join(' · ')}</p>` : ''}` : ''}
        <div class="card-h" style="margin-top:12px"><h2>Today's programs</h2><a class="ghost-btn" href="${href('athlete', String(a.id), 'programs')}">Assign / edit</a></div>${progToday(a.programs, true)}
        <div class="card-h" style="margin-top:12px"><h2>Session builder picks (phase ${esc(P.phase)})</h2></div><ol class="mini" style="padding-left:18px">${P.session.picks.map((p) => `<li><a class="lk" href="${href('library', '{}', String(p.row))}">${esc(p['Exercise Name'])}</a> — ${esc(p.auto)}</li>`).join('')}</ol></section></div>`;
    body.querySelectorAll('[data-ov]').forEach((b) => (b.onclick = () => overrideForm(a, b.dataset.ov, dp.rows.find((r) => r.comp === b.dataset.ov))));
    bindPhase(a, main);
  }
  if (tab === 'programs') return programsTab(a, body, main);
  if (tab === 'monitor') {
    const D = M.daily.slice(-56), mx = Math.max(1, ...D.map((d) => d.load)), W = 1100, H = 230, bw = (W - 60) / D.length;
    const ser = M.series, ax = (v) => H - 30 - ((H - 50) * Math.min(v, 2.5)) / 2.5;
    body.innerHTML = `<section class="card"><div class="card-h"><h2>Daily load, pain and readiness (8 weeks)</h2><small>${esc(M.method)}</small></div>
      <svg class="chart" viewBox="0 0 ${W} ${H}">${D.map((d, i) => `<rect x="${40 + i * bw + 1}" y="${H - 30 - ((H - 60) * d.load) / mx}" width="${bw - 2}" height="${((H - 60) * d.load) / mx}" fill="#6fd3ff" opacity="0.7" data-tip="${d.day}: ${fmt(d.load)} AU${d.pain != null ? ` · pain ${d.pain}` : ''}${d.readiness != null ? ` · readiness ${Math.round(d.readiness)}` : ''}"/>${d.pain != null ? `<circle cx="${40 + (i + 0.5) * bw}" cy="${H - 30 - (H - 60) * (d.pain / 10)}" r="3" fill="#ff6b6b"/>` : ''}${d.readiness != null ? `<circle cx="${40 + (i + 0.5) * bw}" cy="${H - 30 - (H - 60) * (d.readiness / 100)}" r="3" fill="#64e6a8"/>` : ''}${i % 7 === 0 ? `<text x="${40 + i * bw}" y="${H - 12}" font-size="9" class="t-muted">${d.day.slice(5)}</text>` : ''}`).join('')}</svg>
      <div class="legend"><span><i style="background:#6fd3ff"></i>load (AU)</span><span><i style="background:#ff6b6b"></i>pain /10 (scaled)</span><span><i style="background:#64e6a8"></i>readiness /100 (scaled)</span></div></section>
      <div class="tr-grid"><section class="card s7"><div class="card-h"><h2>7-day vs 28-day load ratio</h2><small>shaded band 0.8–1.3 for reference; trend only</small></div>
        <svg class="chart" viewBox="0 0 ${W} ${H}"><rect x="40" y="${ax(1.3)}" width="${W - 60}" height="${ax(0.8) - ax(1.3)}" fill="#64e6a8" opacity="0.07"/>${[0.5, 1, 1.5, 2].map((v) => `<line class="grid" x1="40" x2="${W - 20}" y1="${ax(v)}" y2="${ax(v)}"/><text x="34" y="${ax(v) + 3}" text-anchor="end" class="t-muted">${v}</text>`).join('')}
        <path d="${ser.filter((s) => s.acwr != null).map((s, i) => `${i ? 'L' : 'M'}${40 + ((W - 60) * ser.indexOf(s)) / Math.max(1, ser.length - 1)},${ax(s.acwr)}`).join(' ')}" fill="none" stroke="#ffc067" stroke-width="2"/></svg></section>
        <section class="card s5"><div class="card-h"><h2>Personal tolerance (from this athlete's log)</h2></div>${kv({ 'Weeks compared': M.tolerance.n_weeks, 'Largest pain-free weekly rise': M.tolerance.largest_ok_increase_pct != null ? `${M.tolerance.largest_ok_increase_pct}%` : 'not enough data', 'Smallest rise followed by pain > 3': M.tolerance.smallest_flare_increase_pct != null ? `${M.tolerance.smallest_flare_increase_pct}%` : 'none seen' })}
          <div class="tt-wrap" style="margin-top:6px"><table class="tt"><thead><tr><th>Week ending</th><th>Load change</th><th>Max pain next 3 days</th></tr></thead><tbody>${M.tolerance.weeks.map((w) => `<tr><td>${w.week_end}</td><td class="num">${w.change_pct > 0 ? '+' : ''}${w.change_pct}%</td><td class="num ${w.pain_after > 3 ? 'bad' : ''}">${w.pain_after ?? '—'}</td></tr>`).join('')}</tbody></table></div>
          <p class="fine">A description of this athlete's own data (few weeks), updated with every log. It learns their limits from what actually happened, not from population assumptions, and becomes a flag when a planned rise exceeds it.</p></section></div>`;
    bindTips(body);
  }
  if (tab === 'log') {
    body.innerHTML = `<section class="card"><div class="card-h"><h2>Log a session</h2></div><div class="formgrid">
      <label>Date<input class="tr-in" type="date" id="lg-day" value="${today()}"></label><label>Type<select class="tr-sel" id="lg-kind">${['Rehab', 'Strength', 'Conditioning', 'Speed / power', 'Sport practice', 'Match', 'Recovery', 'Mobility', 'Other'].map((x) => `<option>${x}</option>`).join('')}</select></label>
      <label>Minutes<input class="tr-in" id="lg-min" type="number" min="0" value="60"></label><label>Session RPE (0-10)<input class="tr-in" id="lg-rpe" type="number" min="0" max="10" step="0.5" value="5"></label>
      <label>Pain (0-10, worst)<input class="tr-in" id="lg-pain" type="number" min="0" max="10" value="0"></label><label>Readiness (0-100)<input class="tr-in" id="lg-rd" type="number" min="0" max="100" placeholder="from Today page"></label>
      <label style="grid-column:1/-1">Notes<input class="tr-in" id="lg-notes"></label></div><div class="bar" style="margin-top:8px"><button class="primary small" id="lg-save">Save session</button><span class="mini" id="lg-msg">Load = minutes × RPE.</span></div></section>
      <section class="card"><div class="tt-wrap"><table class="tt"><thead><tr><th>Date</th><th>Type</th><th>Min</th><th>RPE</th><th>Load</th><th>Pain</th><th>Readiness</th><th>Phase</th><th>Notes</th></tr></thead><tbody>${a.sessions.map((s) => `<tr><td>${esc(s.day)}</td><td>${esc(s.kind)}</td><td class="num">${s.minutes}</td><td class="num">${s.rpe}</td><td class="num">${fmt(s.load)}</td><td class="num ${s.pain > 3 ? 'bad' : ''}">${s.pain ?? ''}</td><td class="num">${s.readiness ?? ''}</td><td>${esc(s.phase || '')}</td><td class="mini">${esc(s.notes || '')}</td></tr>`).join('')}</tbody></table></div></section>`;
    $('#lg-save').onclick = async () => { try { await apost('session', { athlete: a.id, day: $('#lg-day').value, kind: $('#lg-kind').value, minutes: $('#lg-min').value, rpe: $('#lg-rpe').value, pain: $('#lg-pain').value, readiness: $('#lg-rd').value || null, notes: $('#lg-notes').value }); athletePage(main, [String(a.id), 'log']); } catch (e) { $('#lg-msg').textContent = e.message; } };
  }
  if (tab === 'tests') {
    const Mx = T('Phase_Metrics');
    body.innerHTML = `<section class="card"><div class="card-h"><h2>Enter test results</h2><small>raw values give an automatic %; or enter the final value</small></div>
      <table class="tt"><thead><tr><th>Metric</th><th>Raw 1</th><th>Raw 2</th><th>Final (manual)</th><th>Protocol</th></tr></thead><tbody>${Mx.map((m) => `<tr><td><b class="mono">${esc(m.Code)}</b> <span class="mini">${esc(m.Metric)} (${esc(m.Direction)} ${esc(m.Unit)})</span></td>${['raw1', 'raw2', 'manual'].map((k) => `<td><input class="tr-in" style="width:80px" data-m="${esc(m.Code)}" data-k="${k}"></td>`).join('')}<td class="mini">${esc(m.Protocol)}</td></tr>`).join('')}</tbody></table>
      <div class="bar" style="margin-top:8px"><label>Date <input class="tr-in" type="date" id="ts-day" value="${today()}"></label><input class="tr-in" id="ts-notes" placeholder="Notes" style="flex:1"><button class="primary small" id="ts-save">Save tests</button><span class="mini" id="ts-msg"></span></div></section>
      <section class="card"><div class="card-h"><h2>History</h2></div>${a.tests.map((t) => `<details class="rd-sec" style="margin-bottom:6px"><summary><b>${esc(t.day)}</b> <span class="mini">${esc(Object.entries(t.metrics).map(([k, v]) => `${k} ${v.manual || (v.raw1 ? `${v.raw1}/${v.raw2}` : '')}`).filter((x) => x.split(' ')[1]).join(' · '))}</span></summary><p class="mini">${esc(t.notes || '')}</p></details>`).join('') || '<p class="mini">No tests yet: the gates use the workbook values (athlete 1) or nothing.</p>'}</section>`;
    $('#ts-save').onclick = async () => { const m = {}; body.querySelectorAll('[data-m]').forEach((i) => { if (i.value.trim() !== '') (m[i.dataset.m] ||= {})[i.dataset.k] = i.value.trim(); });
      try { const r = await apost('test', { athlete: a.id, day: $('#ts-day').value, metrics: m, notes: $('#ts-notes').value }); $('#ts-msg').textContent = `Saved. Automatic phase ${r.before} → ${r.auto_phase}.`; setTimeout(() => athletePage(main, [String(a.id), 'plan']), 900); } catch (e) { $('#ts-msg').textContent = e.message; } };
  }
  if (tab === 'injuries') {
    body.innerHTML = `<section class="card"><div class="card-h"><h2>Record an injury</h2></div><div class="formgrid">
      <label>Date<input class="tr-in" type="date" id="in-day" value="${today()}"></label><label>Region<input class="tr-in" id="in-reg" placeholder="e.g. Knee"></label>
      <label>Condition<select class="tr-sel" id="in-cond"><option value="">— other</option>${T('Conditions_Meta').map((c) => `<option>${esc(c.Condition)}</option>`).join('')}</select></label>
      <label>Severity<select class="tr-sel" id="in-sev"><option>Minor</option><option>Moderate</option><option>Severe</option></select></label><label style="grid-column:1/-1">Notes<input class="tr-in" id="in-notes"></label></div>
      <div class="bar" style="margin-top:8px"><label><input type="checkbox" id="in-path" checked> Use this condition as the athlete's pathway</label><button class="primary small" id="in-save">Save</button><span class="mini" id="in-msg">Sets the athlete's status to Injured.</span></div></section>
      <section class="card"><div class="tt-wrap"><table class="tt"><thead><tr><th>Date</th><th>Region</th><th>Condition</th><th>Severity</th><th>Status</th><th>Return</th><th></th></tr></thead><tbody>${a.injuries.map((i) => `<tr><td>${esc(i.day)}</td><td>${esc(i.region)}</td><td>${esc(i.condition)}</td><td>${esc(i.severity)}</td><td><span class="pill ${i.status === 'Resolved' ? 'ok' : 'bad'}">${esc(i.status)}</span></td><td>${esc(i.return_day || '')}</td><td>${i.status !== 'Resolved' ? `<button class="ghost-btn tiny" data-res="${i.id}">Mark resolved</button>` : ''}</td></tr>`).join('')}</tbody></table></div></section>`;
    $('#in-save').onclick = async () => { const cond = $('#in-cond').value; try { await apost('injury', { athlete: a.id, day: $('#in-day').value, region: $('#in-reg').value, condition: cond, severity: $('#in-sev').value, notes: $('#in-notes').value, reason: 'injury recorded' });
      if (cond && $('#in-path').checked) await apost('save', { id: a.id, condition: cond, injury_date: $('#in-day').value, phase_start: $('#in-day').value, reason: 'new injury: pathway set to this condition' }); athletePage(main, [String(a.id), 'plan']); } catch (e) { $('#in-msg').textContent = e.message; } };
    body.querySelectorAll('[data-res]').forEach((b) => (b.onclick = async () => { const r = prompt('Reason / return-to-play note:'); if (r == null) return; await apost('injury', { id: +b.dataset.res, athlete: a.id, status: 'Resolved', return_day: today(), notes: r, reason: r }); await apost('save', { id: a.id, status: 'Returning', reason: `injury resolved: ${r}` }); athletePage(main, [String(a.id), 'injuries']); }));
  }
  if (tab === 'overrides') {
    body.innerHTML = `<section class="card"><div class="card-h"><h2>Plan overrides</h2><small>each one needs a reason and is shown on the plan next to the automatic choice</small></div>
      <div class="tt-wrap"><table class="tt"><thead><tr><th>Component</th><th>Field</th><th>Value</th><th>Reason</th><th>Since</th><th></th></tr></thead><tbody>${a.overrides.map((o) => `<tr class="${o.active ? '' : 'muted'}"><td>${esc(o.comp)}</td><td>${esc(o.field)}</td><td>${esc(o.value)}</td><td>${esc(o.reason)}</td><td class="mini">${esc(o.created)}</td><td>${o.active ? `<button class="ghost-btn tiny" data-off="${o.id}">Turn off</button>` : 'off'}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">None. Use “Override…” on the Plan tab.</td></tr>'}</tbody></table></div></section>`;
    body.querySelectorAll('[data-off]').forEach((b) => (b.onclick = async () => { const r = prompt('Reason for turning this override off:'); if (r == null) return; await apost('override', { id: +b.dataset.off, athlete: a.id, reason: r }); athletePage(main, [String(a.id), 'overrides']); }));
  }
  if (tab === 'care') return careTab(a, body, main);
  if (tab === 'updates') body.innerHTML = `<section class="card"><div class="card-h"><h2>Updates: rehab plan, S&amp;C, load, other</h2></div>${updatesList(a.updates, 60)}</section>`;
  if (tab === 'audit') body.innerHTML = auditTable(a.audit);
}

// ---------------------------------------------------------------- live progression + care team
function progCard(a) {
  const g = a.plan.progress; if (!g) return '';
  const ok = (b) => (b ? '<b style="color:var(--ok)">✔</b>' : '<b style="color:var(--warn)">✖</b>');
  return `<div class="rd-sec" style="margin-bottom:10px;border-color:${g.ready ? 'var(--ok)' : 'var(--line)'}"><h4>Live progression ${g.auto ? '<span class="pill ok">auto-progress on</span>' : '<span class="pill">auto-progress off</span>'}</h4>
    <div class="comp" style="grid-template-columns:150px 1fr"><span>Time in phase</span><span>${ok(g.time_ok)} day ${g.day} of ${g.days}<div class="vbar"><i style="width:${Math.min(100, (100 * g.day) / g.days)}%"></i></div></span></div>
    <div class="comp" style="grid-template-columns:150px 1fr"><span>Gate for ${esc(g.next || '—')}</span><span>${ok(g.gate_ok)} ${g.gate_ok ? 'met' : esc(g.unmet.join(' · ') || 'not met')}</span></div>
    <div class="comp" style="grid-template-columns:150px 1fr"><span>Clearances</span><span>${ok(g.roles_ok)} ${g.required.length ? esc(g.required.join(', ')) : 'none required'}${g.signoffs.length ? `<div class="mini">${g.signoffs.map((x) => `${esc(x.name)} (${esc(x.role)}): <b>${esc(x.verdict)}</b>${x.note ? ` — ${esc(x.note)}` : ''}`).join('<br>')}</div>` : ''}</span></div>
    <p class="mini" style="margin:6px 0 0"><b>${g.ready ? `READY to move to ${esc(g.next)}` : 'Holding'}</b>${g.ready && g.auto ? ' — will advance automatically (checked hourly and whenever the roster is opened)' : g.ready ? ' — use Phase decision below, or turn auto-progress on (Care team tab)' : ''}</p></div>`;
}

async function careTab(a, body, main) {
  const S = await aget('staff'), P0 = a.perspectives, phases = T('Phase_System').map((x) => x.Code);
  const me = S.staff.find((x) => String(x.id) === actor());
  const inTeam = new Set(a.care.map((x) => x.id)), lead = a.care.find((x) => x.lead)?.id;
  const render = (P) => Object.entries(P.roles).map(([role, v]) => `<div class="rd-sec" style="margin-bottom:8px"><h4>${esc(role)} <small>${esc(a.care.filter((x) => x.role === role).map((x) => x.name).join(', ') || 'not on the care team')}</small></h4>
      ${v.items.map((x) => `<div class="comp" style="grid-template-columns:200px 1fr"><span class="mini">${esc(x.k)}</span><span class="mini" style="color:var(--text)">${esc(x.v)}</span></div>`).join('') || '<p class="mini">Nothing specific in the workbook for this phase.</p>'}
      <p class="fine">Source: ${esc(v.source)}</p></div>`).join('');
  body.innerHTML = `<div class="tr-grid"><section class="card s5"><div class="card-h"><h2>Care team</h2><a class="ghost-btn" href="${href('staff')}">Staff list</a></div>
      ${S.staff.filter((x) => x.active).map((x) => `<label class="comp" style="grid-template-columns:24px 1fr auto"><input type="checkbox" data-team="${x.id}" ${inTeam.has(x.id) ? 'checked' : ''}><span><b>${esc(x.name)}</b> <small>${esc(x.role)}</small></span><span class="mini"><input type="radio" name="lead" value="${x.id}" ${lead === x.id ? 'checked' : ''}> lead</span></label>`).join('') || '<p class="mini">No staff yet: add them on the Staff page.</p>'}
      <div class="bar"><button class="primary small" id="ct-save">Save care team</button><span class="mini" id="ct-msg"></span></div>
      <div class="card-h" style="margin-top:12px"><h2>Progression rules</h2></div>
      <label class="comp" style="grid-template-columns:24px 1fr"><input type="checkbox" id="st-auto" ${a.auto_progress ? 'checked' : ''}><span>Auto-progress: advance one phase when the time, the next gate and the required clearances are all met</span></label>
      <p class="mini">Clearances required before moving on:</p><div class="chips">${S.roles.map((r) => `<label class="chip-btn"><input type="checkbox" data-req="${esc(r)}" ${(a.required_roles || '').split(',').includes(r) ? 'checked' : ''}> ${esc(r)}</label>`).join('')}</div>
      <div class="bar" style="margin-top:6px"><button class="ghost-btn" id="st-save">Save rules</button><span class="mini" id="st-msg"></span></div>
      <div class="card-h" style="margin-top:12px"><h2>Sign-off for phase ${esc(a.plan.phase)}</h2></div>
      ${me ? `<p class="mini">Signing as <b>${esc(me.name)}</b> (${esc(me.role)}).</p><div class="bar"><select class="tr-sel" id="so-v"><option value="clear">Clear to progress</option><option value="hold">Hold</option><option value="concern">Concern</option></select><input class="tr-in" id="so-n" placeholder="Note / finding" style="flex:1"><button class="primary small" id="so-go">Sign</button></div>` : '<p class="mini" style="color:var(--warn)">Choose who you are in “Acting as” (left menu) to sign off.</p>'}
      <div id="so-list">${a.plan.progress?.signoffs?.map((x) => `<div class="comp" style="grid-template-columns:150px 1fr"><span class="mini mono">${esc(x.ts)}</span><span class="mini"><b>${esc(x.name)}</b> (${esc(x.role)}): <b>${esc(x.verdict)}</b> ${esc(x.note || '')}</span></div>`).join('') || '<p class="mini">No sign-offs for this phase yet.</p>'}</div></section>
    <section class="card s7"><div class="card-h"><h2>Perspectives by role</h2><label class="mini">Phase <select class="tr-sel" id="pv-ph">${phases.map((x) => `<option ${x === P0.phase ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label></div>
      <p class="mini">What each discipline focuses on in this phase for ${esc(a.name)}, from the workbook's own columns (sources under each card).</p><div id="pv">${render(P0)}</div></section></div>`;
  $('#pv-ph').onchange = async () => { $('#pv').innerHTML = render(await aget('perspectives', { id: a.id, phase: $('#pv-ph').value })); };
  $('#ct-save').onclick = async () => { const ids = [...body.querySelectorAll('[data-team]:checked')].map((x) => +x.dataset.team), ld = +(body.querySelector('[name=lead]:checked')?.value || 0);
    try { await apost('care', { athlete: a.id, staff: ids, lead: ld || null, reason: 'care team updated' }); athletePage(main, [String(a.id), 'care']); } catch (e) { $('#ct-msg').textContent = e.message; } };
  $('#st-save').onclick = async () => { try { await apost('settings', { athlete: a.id, auto_progress: $('#st-auto').checked, required_roles: [...body.querySelectorAll('[data-req]:checked')].map((x) => x.dataset.req), reason: 'progression rules updated' }); athletePage(main, [String(a.id), 'care']); } catch (e) { $('#st-msg').textContent = e.message; } };
  $('#so-go')?.addEventListener('click', async () => { try { await apost('signoff', { athlete: a.id, phase: a.plan.phase, verdict: $('#so-v').value, note: $('#so-n').value }); athletePage(main, [String(a.id), 'care']); } catch (e) { alert(e.message); } });
}

async function staffPage(main) {
  const S = await aget('staff'), L = await aget('list');
  main.innerHTML = `${header('Staff', 'Everyone who works with the athletes: physiotherapists, doctors, surgeons, S&C, coaches, athletic trainers, dietitians, psychologists. Choose who you are under “Acting as” so decisions, sign-offs and changes are recorded under your name.', 'Team')}
    <div class="tr-grid"><section class="card s8"><div class="tt-wrap" style="max-height:none"><table class="tt"><thead><tr><th>Name</th><th>Role</th><th>Athletes</th><th>Status</th><th></th></tr></thead><tbody>
      ${S.staff.map((x) => `<tr><td><b>${esc(x.name)}</b><div class="mini">${esc(x.notes || '')}</div></td><td>${esc(x.role)}</td><td class="mini">${x.athletes.map((id) => esc(L.athletes.find((a) => a.id === id)?.name || id)).join(', ') || '—'}</td><td>${x.active ? '<span class="pill ok">active</span>' : '<span class="pill">inactive</span>'}</td>
        <td><button class="ghost-btn tiny" data-tog="${x.id}">${x.active ? 'Deactivate' : 'Activate'}</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">No staff yet.</td></tr>'}</tbody></table></div></section>
      <section class="card s4"><div class="card-h"><h2>Add staff member</h2></div><div class="formgrid"><label>Name<input class="tr-in" id="sf-name"></label><label>Role<select class="tr-sel" id="sf-role">${S.roles.map((r) => `<option>${esc(r)}</option>`).join('')}</select></label><label style="grid-column:1/-1">Notes<input class="tr-in" id="sf-notes" placeholder="e.g. qualifications, clinic, availability"></label></div>
        <div class="bar" style="margin-top:6px"><button class="primary small" id="sf-add">Add</button><span class="mini" id="sf-msg"></span></div></section></div>`;
  $('#sf-add').onclick = async () => { try { await apost('staff', { name: $('#sf-name').value, role: $('#sf-role').value, notes: $('#sf-notes').value }); staffPage(main); window.__tsActorRefresh?.(); } catch (e) { $('#sf-msg').textContent = e.message; } };
  main.querySelectorAll('[data-tog]').forEach((b) => (b.onclick = async () => { const x = S.staff.find((y) => y.id === +b.dataset.tog); await apost('staff', { ...x, active: x.active ? 0 : 1, reason: x.active ? 'deactivated' : 'activated' }); staffPage(main); }));
}

// ---------------------------------------------------------------- phase decisions
function phasePanel(a) {
  const J = a.justify, P = a.plan, phases = T('Phase_System').map((x) => x.Code), i = phases.indexOf(P.phase);
  return `<div class="card-h" style="margin-top:12px"><h2>Phase decision</h2><small>current ${esc(P.phase)} · ${esc(P.mode || 'Standard')}</small></div>
    <div class="rd-sec"><div class="formgrid">
      <label>Action<select class="tr-sel" id="ph-dir"><option value="next">▲ Advance to next (${esc(phases[Math.min(i + 1, phases.length - 1)])})</option><option value="back">▼ Shift back (${esc(phases[Math.max(i - 1, 0)])})</option><option value="hold">■ Hold ${esc(P.phase)} (change mode only)</option><option value="to">Move to…</option></select></label>
      <label>Phase (for Move to)<select class="tr-sel" id="ph-to">${phases.map((x) => `<option ${x === P.phase ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
      <label>Mode<select class="tr-sel" id="ph-mode">${J.modes.map((m) => `<option ${m === P.mode ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
      <label style="grid-column:1/-1">Modifications (what changes in the program)<input class="tr-in" id="ph-mod" placeholder="e.g. no cutting, straight-line running only; isometrics before court; reduce plyo contacts 30%" value="${esc(P.modifications || '')}"></label>
      <label style="grid-column:1/-1">Reason / justification (required, in the audit log)<input class="tr-in" id="ph-why" placeholder="e.g. pain-free 72 h, effusion trace, cleared by surgeon at week 12"></label></div>
      <p class="mini" id="ph-check"></p><div class="bar"><button class="primary small" id="ph-go">Apply phase decision</button><span class="mini" id="ph-msg"></span></div>
      <p class="fine">Modes: <b>Modified</b> = the same phase at × 0.8 volume; <b>Court training</b> = adds the sport's court drill ladder level and 10-minute warm-up; <b>Reasoning program</b> = your written plan (modifications) leads, shown on every plan. Advancing past unmet gates is allowed and recorded as "against the gates".</p></div>
    <div class="card-h" style="margin-top:12px"><h2>Gates: why each phase passed</h2><small>values: ${esc(J.source)}</small></div>
    ${J.rows.map((r) => `<details class="gate ${r.phase === P.phase ? 'current' : r.passed ? 'passed' : 'locked'}" style="display:block"><summary style="display:grid;grid-template-columns:46px 1fr auto;gap:10px;align-items:center;cursor:pointer"><b>${esc(r.phase)}</b><span>${esc(r.name)}${r.passed ? '' : `<div class="mini" style="color:var(--warn)">${esc(r.items.filter((x) => !x.met).map((x) => `${x.code} ${x.value ?? 'not tested'} (needs ${x.op} ${x.threshold})`).join(' · '))}</div>`}</span><span class="pill ${r.phase === P.phase ? 'acc' : r.passed ? 'ok' : ''}">${r.phase === P.phase ? '► current' : r.passed ? '✔ passed — why?' : 'locked — why?'}</span></summary>
      ${r.items.length ? `<table class="tt" style="margin:6px 0"><thead><tr><th>Metric</th><th>Value</th><th>Rule</th><th></th><th>From</th><th>Protocol</th></tr></thead><tbody>${r.items.map((x) => `<tr><td>${esc(x.code)} <span class="mini">${esc(x.metric)}</span></td><td class="num">${x.value ?? '—'}</td><td class="mono">${esc(x.op)} ${x.threshold}</td><td>${x.met ? '✔' : '✖'}</td><td class="mini">${esc(x.how)}</td><td class="mini">${esc(x.protocol)}</td></tr>`).join('')}</tbody></table>` : '<p class="mini">Entry phase: no thresholds.</p>'}
      <p class="mini">${r.passed ? `Passed because every threshold above is met and every earlier phase passed.` : 'Locked: every threshold must be met, in order.'}</p></details>`).join('')}
    ${J.events.length ? `<div class="card-h" style="margin-top:12px"><h2>Phase history</h2></div>${J.events.map((e) => `<div class="comp" style="grid-template-columns:150px 1fr"><span class="mini mono">${esc(e.ts)}</span><span><b>${esc(e.direction)} ${esc(e.from_phase)} → ${esc(e.to_phase)}</b> <span class="pill ${e.against ? 'bad' : ''}">${esc(e.mode)}${e.against ? ' · against gates' : ''}</span><div class="mini">${esc(e.reason)}${e.modifications ? ` · modifications: ${esc(e.modifications)}` : ''}</div></span></div>`).join('')}` : ''}`;
}
function bindPhase(a, main) {
  const J = a.justify, phases = T('Phase_System').map((x) => x.Code), cur = phases.indexOf(a.plan.phase);
  const target = () => { const d = $('#ph-dir').value; return d === 'next' ? phases[Math.min(cur + 1, phases.length - 1)] : d === 'back' ? phases[Math.max(cur - 1, 0)] : d === 'hold' ? a.plan.phase : $('#ph-to').value; };
  const check = () => { const t = target(), ti = phases.indexOf(t); const unmet = J.rows.slice(0, ti + 1).flatMap((r) => r.items.filter((x) => !x.met).map((x) => `${r.phase} ${x.code} ${x.value ?? 'not tested'} (needs ${x.op} ${x.threshold})`));
    $('#ph-check').innerHTML = ti > cur ? (unmet.length ? `<span style="color:var(--warn)">⚠ ${esc(t)} is ahead of the gates: ${esc(unmet.join(' · '))}. Allowed with a reason; recorded as against the gates.</span>` : `<span style="color:var(--ok)">✔ All gates up to ${esc(t)} are met.</span>`) : ti < cur ? `Shifting back to ${esc(t)}: the phase clock restarts today.` : `Holding ${esc(t)}: only the mode / modifications change.`; };
  ['#ph-dir', '#ph-to'].forEach((x) => ($(x).onchange = check)); check();
  $('#ph-go').onclick = async () => { try { const r = await apost('phase', { athlete: a.id, direction: $('#ph-dir').value, to: $('#ph-to').value, mode: $('#ph-mode').value, modifications: $('#ph-mod').value, reason: $('#ph-why').value });
    $('#ph-msg').textContent = `${r.direction}: ${r.from} → ${r.to} (${r.mode})${r.against_gates ? ' — against the gates' : ''}`; setTimeout(() => athletePage(main, [String(a.id), 'plan']), 700); } catch (e) { $('#ph-msg').textContent = e.message; } };
}
export function updatesList(list, n = 12) {
  const col = { 'Rehab plan': '#64e6a8', 'S&C': '#6fd3ff', 'Training load': '#b49bff', Other: '#7f97b5' };
  return list.slice(0, n).map((u) => `<div class="comp" style="grid-template-columns:110px 1fr"><span class="mini"><b style="color:${col[u.group] || '#ccc'}">${esc(u.group)}</b><br>${esc(u.ts.slice(0, 16))}</span><span class="mini">${esc(u.text)}${u.reason ? `<br><i>${esc(u.reason)}</i>` : ''}</span></div>`).join('') || '<p class="mini">No updates yet.</p>';
}

// ---------------------------------------------------------------- programs
function progToday(list, onlyToday) {
  const xs = list.filter((p) => !onlyToday || p.scheduled);
  if (!xs.length) return `<p class="mini">${list.length ? 'No program scheduled today.' : 'No programs assigned yet.'}</p>`;
  return xs.map((p) => p.kind === 'program' ? `<div class="rd-sec" style="margin-bottom:8px"><h4>${esc(p.program)} · ${esc(p.title)} <small>${esc(p.level)} · ${esc(p.block)} · week ${p.weeks}</small>${p.scheduled ? '' : ' <span class="pill">not today</span>'}</h4>
      ${p.variant ? `<ol class="mini" style="margin:0 0 4px;padding-left:18px"><li><b>${esc(p.variant['Drill 1'])}</b></li><li><b>${esc(p.variant['Drill 2'])}</b></li><li><b>${esc(p.variant['Drill 3'])}</b></li></ol><p class="mini"><b>Dose</b>: ${esc(p.variant.Dose)}</p><details><summary class="mini">how to · advance / stop · evidence</summary><p class="mini">${esc(p.variant['How to do drill 1'])}</p><p class="mini">${esc(p.variant['Advance / stop'])}</p><p class="mini">${esc(p.evidence)}</p><p class="mini"><b>Session template</b>: ${esc(p.template)}</p></details>` : `<p class="mini">${esc(p.error || 'No variant for this level / block.')}</p>`}
      <p class="mini" style="color:var(--accent2)">${(p.why || []).map(esc).join(' ')}</p></div>`
    : `<div class="rd-sec" style="margin-bottom:8px"><h4>Isometric / exercise · <a class="lk" href="${href('library', '{}', String(p.row))}">${esc(p.title)}</a> <small>${esc(p.strategy || '')}</small></h4><p class="mini"><b>Today</b>: ${esc(p.dose)}</p>
      <details><summary class="mini">cues · easier / harder · cautions</summary><p class="mini">${esc(p.cues)}</p><p class="mini">↓ ${esc(p.regress)} · ↑ ${esc(p.progress)}</p><p class="mini" style="color:var(--warn)">${esc(p.contra)}</p></details>
      <p class="mini" style="color:var(--accent2)">${(p.why || []).map(esc).join(' ')}</p></div>`).join('');
}

async function programsTab(a, body, main) {
  const P = T('Program_Library'), cats = [...new Set(P.map((p) => p.Category))], DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const ISO = ['Long-Duration Iso', 'Isometric Mid-Range', 'Isometric Long-Duration', 'Isometric Hold Mid-Range', 'Constant Static Tension (Iso Hold During Set)', 'Iso Weight (End-Range Hold)'];
  body.innerHTML = `<div class="tr-grid"><section class="card s7"><div class="card-h"><h2>Assigned programs (today and the full list)</h2></div>${progToday(a.programs, false)}
      ${a.programs.length ? `<div class="bar">${a.programs.map((p) => `<button class="ghost-btn tiny" data-rm="${p.id}">Remove ${esc(p.title).slice(0, 34)}</button>`).join('')}</div>` : ''}</section>
    <section class="card s5"><div class="card-h"><h2>Suggested for ${esc(a.name)}</h2><small>from condition, sport and phase</small></div>
      ${a.suggestions.map((x) => `<div class="comp" style="grid-template-columns:1fr auto"><span><b>${esc(x.id)}</b> ${esc(x.program)} <small>${esc(x.category)} · evidence ${esc(x.evidence)}</small><div class="mini" style="color:${/caution/.test(x.why) ? 'var(--warn)' : 'var(--accent2)'}">${esc(x.why)}</div></span>${x.assigned ? '<span class="pill ok">assigned</span>' : `<button class="ghost-btn tiny" data-pick="${esc(x.id)}">Use</button>`}</div>`).join('') || '<p class="mini">No match: pick from the full list.</p>'}</section>
    <section class="card s6"><div class="card-h"><h2>Assign a program</h2></div><div class="formgrid">
      <label style="grid-column:1/-1">Program<select class="tr-sel" id="pa-prog">${cats.map((c) => `<optgroup label="${esc(c)}">${P.filter((p) => p.Category === c).map((p) => `<option value="${esc(p.ID)}">${esc(p.ID)} · ${esc(p.Program)}</option>`).join('')}</optgroup>`).join('')}</select></label>
      <label>Equipment<select class="tr-sel" id="pa-eq"></select></label>
      <label>Level<select class="tr-sel" id="pa-lvl"><option value="">auto from phase</option><option>L1</option><option>L2</option><option>L3</option><option>L4</option></select></label>
      <label>Start date<input class="tr-in" type="date" id="pa-start" value="${today()}"></label>
      <label style="grid-column:1/-1">Days<span class="chips">${DAYS.map((d) => `<label class="chip-btn"><input type="checkbox" data-wd="${d}"> ${d}</label>`).join('')} <small>none ticked = every day</small></span></label>
      <label style="grid-column:1/-1">Reason (required, in the audit log)<input class="tr-in" id="pa-reason"></label></div>
      <p class="mini" id="pa-info"></p><div class="bar"><button class="primary small" id="pa-save">Assign</button><span class="mini" id="pa-msg"></span></div></section>
    <section class="card s6"><div class="card-h"><h2>Isometric block (from the 42,709-exercise library)</h2></div>
      <div class="bar"><input class="tr-in" id="iso-q" placeholder="e.g. wall sit, Spanish squat, calf, adductor, external rotation" style="flex:1"><select class="tr-sel" id="iso-s"><option value="">any isometric strategy</option>${ISO.map((x) => `<option>${esc(x)}</option>`).join('')}</select></div>
      <div class="tt-wrap" style="max-height:300px;margin-top:6px" id="iso-list"></div>
      <div class="formgrid" style="margin-top:6px"><label>Custom dose (blank = from phase)<input class="tr-in" id="iso-dose" placeholder="e.g. 5 x 45 s @ 70% MVC"></label><label>Reason (required)<input class="tr-in" id="iso-reason"></label></div><p class="mini" id="iso-msg">Pick an exercise, then Add.</p></section></div>`;
  body.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = async () => { const r = prompt('Reason for removing this program:'); if (r == null) return; await apost('assign', { id: +b.dataset.rm, athlete: a.id, reason: r }); athletePage(main, [String(a.id), 'programs']); }));
  const eqFill = async () => {
    const id = $('#pa-prog').value, p = P.find((x) => x.ID === id);
    const r = await fetch(`/api/ts/facet?t=Program_Variants&col=Equipment&f=${encodeURIComponent(JSON.stringify({ 'Program ID': id }))}`).then((x) => x.json());
    $('#pa-eq').innerHTML = `<option value="">${esc(p['Original equipment'])} (original)</option>` + r.values.map(([v]) => `<option>${esc(v)}</option>`).join('');
    $('#pa-info').innerHTML = `<b>${esc(p.Program)}</b> · ${esc(p['Target / condition / sport'])} · levels ${esc(p.Levels.split('|').filter(Boolean).join(', '))} · ${esc(p['Duration × frequency'])}<br>Advance: ${esc(p['Advance when'])} · Stop: ${esc(p['Regress / stop when'])} · evidence ${esc(p['Evidence level'])}`;
  };
  $('#pa-prog').onchange = eqFill; eqFill();
  body.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => { $('#pa-prog').value = b.dataset.pick; eqFill(); $('#pa-reason').value = a.suggestions.find((x) => x.id === b.dataset.pick)?.why || ''; $('#pa-reason').focus(); }));
  $('#pa-save').onclick = async () => { try { await apost('assign', { athlete: a.id, kind: 'program', ref: $('#pa-prog').value, equipment: $('#pa-eq').value, level: $('#pa-lvl').value, start_day: $('#pa-start').value,
    weekdays: [...body.querySelectorAll('[data-wd]:checked')].map((x) => x.dataset.wd).join(','), reason: $('#pa-reason').value }); athletePage(main, [String(a.id), 'programs']); } catch (e) { $('#pa-msg').textContent = e.message; } };
  let tm;
  const isoList = async () => { const f = $('#iso-s').value ? { 'Loading Strategy': $('#iso-s').value } : { 'Loading Strategy': ISO };
    const r = await fetch(`/api/ts/table?t=Exercise_Library&lim=60&q=${encodeURIComponent($('#iso-q').value)}&f=${encodeURIComponent(JSON.stringify(f))}&cols=${encodeURIComponent(JSON.stringify(['Exercise Name', 'Loading Strategy', 'Goal', 'Depth (1-6)', 'Sets × Reps']))}`).then((x) => x.json());
    $('#iso-list').innerHTML = `<table class="tt"><tbody>${r.rows.map((x) => `<tr><td><b>${esc(x[1])}</b><div class="mini">${esc(x[2])} · ${esc(x[3])} · L${esc(x[4])} · ${esc(x[5])}</div></td><td><button class="ghost-btn tiny" data-add="${x[0]}">Add</button></td></tr>`).join('') || '<tr><td class="muted">No isometric exercise matches.</td></tr>'}</tbody></table><p class="mini">${fmt(r.total)} isometric exercises match.</p>`;
    $('#iso-list').querySelectorAll('[data-add]').forEach((b) => (b.onclick = async () => { try { await apost('assign', { athlete: a.id, kind: 'exercise', ref: +b.dataset.add, notes: $('#iso-dose').value, reason: $('#iso-reason').value }); athletePage(main, [String(a.id), 'programs']); } catch (err) { $('#iso-msg').textContent = err.message; } })); };
  $('#iso-q').oninput = () => { clearTimeout(tm); tm = setTimeout(isoList, 250); }; $('#iso-s').onchange = isoList; isoList();
}

function overrideForm(a, comp, row) {
  const box = document.createElement('div'); box.className = 'card'; box.style.cssText = 'position:fixed;inset:20% 25% auto;z-index:50;box-shadow:0 20px 60px #000';
  box.innerHTML = `<div class="card-h"><h2>Override · ${esc(row.label)}</h2><button class="ghost-btn" id="ovx">Close</button></div>
    <p class="mini">Automatic choice: <b>${esc(row.today)}</b> · ${esc(row.dose)} (${esc(row.why)})</p>
    <div class="formgrid"><label>What to change<select class="tr-sel" id="ovf"><option value="option">Option (P/A/B/C/N)</option><option value="exercise">Exercise (free text)</option><option value="dose">Dose (free text)</option></select></label>
      <label>Value<input class="tr-in" id="ovv" placeholder="e.g. B, or the exercise / dose"></label><label style="grid-column:1/-1">Reason (required)<input class="tr-in" id="ovr"></label></div>
    <p class="mini">Options: ${Object.entries(row.options).map(([k, v]) => `<b>${k}</b> ${esc(v)}`).join(' · ')}</p><div class="bar"><button class="primary small" id="ovs">Save override</button><span class="mini" id="ovm"></span></div>`;
  document.body.appendChild(box);
  $('#ovx', box).onclick = () => box.remove();
  $('#ovs', box).onclick = async () => { try { await apost('override', { athlete: a.id, comp, field: $('#ovf', box).value, value: $('#ovv', box).value, reason: $('#ovr', box).value }); box.remove(); athletePage($('#tr-main'), [String(a.id), 'plan']); } catch (e) { $('#ovm', box).textContent = e.message; } };
}

function auditTable(rows) {
  return `<section class="card"><div class="tt-wrap" style="max-height:70vh"><table class="tt"><thead><tr><th>When</th>${rows[0]?.name !== undefined ? '<th>Athlete</th>' : ''}<th>Action</th><th>By</th><th>What changed</th><th>Reason</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="mini mono">${esc(r.ts)}</td>${r.name !== undefined ? `<td>${r.athlete ? `<a class="lk" href="${href('athlete', String(r.athlete))}">${esc(r.name)}</a>` : '—'}</td>` : ''}<td><b>${esc(r.action)}</b></td><td class="mini">${esc(r.by || (String(r.reason || '').startsWith('auto-progress') ? 'system (auto-progress)' : '—'))}</td><td class="mini">${esc(JSON.stringify(r.detail)).slice(0, 300)}</td><td class="mini">${esc(r.reason || '')}</td></tr>`).join('') || '<tr><td class="muted" colspan="5">Nothing yet.</td></tr>'}</tbody></table></div></section>`;
}
async function auditPage(main) {
  const rows = await aget('audit');
  main.innerHTML = `${header('Audit log', 'Every change to athletes, groups, tests, sessions, injuries and overrides, with the reason given. Kept on this machine.', 'Team')}${auditTable(rows)}`;
}
void kv;
