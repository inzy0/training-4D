// Training System: Anatomy map, Knowledge atlas (subjects + topic graph), Science & methods, Nutrition & substances.
import { S, T, api, post, esc, fmt, go, href, header, hbar, bindTips, kv, ev, show3D, musclesFor, openStudio, PAL } from './training.js';

const $ = (s, r = document) => r.querySelector(s);
export async function page(p, main, args) {
  if (p === 'anatomy') return anatomy(main, args);
  if (p === 'atlas') return atlas(main, args);
  if (p === 'science') return science(main, args);
  if (p === 'nutrition') return nutrition(main, args);
}

// ================================================================= ANATOMY MAP
async function anatomy(main, args) {
  const AM = T('Anatomy_Map'), groups = [...new Set(AM.map((a) => a['Region group']))];
  const a = AM.find((x) => x['Base movement'] === args[0]) || AM[0];
  const AR = T('Anatomy_Reference');
  main.innerHTML = `${header('Anatomy map', `${AM.length} base movements: what each one loads, activates and trains (prime movers, synergists, stabilisers, tendons, ligaments, joint angles, line of force), and every one of the ${AR.length} named skeletal muscles with the movements that train it. Lit on the BodyParts3D body in the 3D Atlas tab.`, 'Knowledge')}
    <div class="split"><section class="card">${groups.map((g) => `<h2 style="margin:6px 0">${esc(g)}</h2><div class="chips">${AM.filter((x) => x['Region group'] === g).map((x) => `<a class="chip-btn ${x === a ? 'on' : ''}" href="${href('anatomy', x['Base movement'])}" style="text-decoration:none">${esc(x['Base movement'])}<small>${esc(x['Muscles involved (approx., per side)'])}</small></a>`).join('')}</div>`).join('')}</section>
      <section class="card sticky" id="am"></section></div>
    <section class="card"><div class="card-h"><h2>All ${AR.length} muscles</h2><span class="bar"><input class="tr-in" id="ar-q" placeholder="Filter muscles, actions, joints"><span class="chips" id="ar-reg"></span></span></div><div class="tt-wrap" style="max-height:620px" id="ar"></div></section>`;
  const roles = [['Prime movers (agonists)', '#ff6b6b'], ['Synergists', '#ffc067'], ['Stabilisers / co-contractors', '#6fd3ff']];
  const byRole = roles.map(([k]) => musclesFor(String(a[k]).replace(/;/g, ',')));
  const all = [...new Set(byRole.flat())];
  $('#am').innerHTML = `<div class="rd"><div><div class="tr-crumb">${esc(a['Region group'])} · ~${esc(a['Muscles involved (approx., per side)'])} muscles per side</div><h2 style="text-transform:none;font-size:18px;color:var(--text);margin:2px 0 6px">${esc(a['Base movement'])}</h2>
      <div class="links-row"><button class="primary small" id="am-studio">▶ Animate in Motion Lab 4D</button><select class="tr-sel" id="am-pos"><option value="">usual position</option>${['standing','supine','hooklying','prone','side_r','side_l','seated','longsit','quadruped','plank','kneeling','halfkneel','hang'].map((k) => `<option value="${k}">${k.replace('_r', ' (right side down)').replace('_l', ' (left side down)')}</option>`).join('')}</select>${all.length ? `<button class="ghost-btn" data-3d="all">Show all ${all.length} on the 3D body</button>` : ''}${roles.map(([k, c], i) => byRole[i].length ? `<button class="ghost-btn" data-3d="${i}" style="border-color:${c};color:${c}">${esc(k.split(' (')[0])} (${byRole[i].length})</button>` : '').join('')}</div></div>
    ${roles.map(([k, c], i) => `<div class="rd-sec" style="border-color:${c}44"><h4 style="color:${c}">${esc(k)}</h4><div class="chips">${String(a[k]).split(/;\s*/).filter(Boolean).map((m) => `<span class="chip-btn" title="${esc((S.B.links.muscles[m.trim()] || []).join(', ') || 'no 3D mesh')}">${esc(m)}${(S.B.links.muscles[m.trim()] || []).length ? '' : ' <small>·no 3D</small>'}</span>`).join('')}</div></div>`).join('')}
    <div class="rd-sec"><h4>Tissues and mechanics</h4>${kv(a, ['Tendons loaded', 'Ligaments / capsule / fascia stressed', 'Joint angles & range', 'Body position & line of force'])}</div>
    <div class="rd-sec"><h4>Connections</h4><div id="am-conn" class="mini">…</div></div>
    <p class="fine">Muscles named in the workbook, matched to BodyParts3D mesh names (CC BY 4.0, DBCLS). Shown for learning; not a measurement of activation.</p></div>`;
  $('#am-studio').onclick = () => openStudio(a['Base movement'], $('#am-pos').value || undefined);
  $('#am').querySelectorAll('[data-3d]').forEach((b) => (b.onclick = () => show3D(b.dataset['3d'] === 'all' ? all : byRole[+b.dataset['3d']], `${a['Base movement']}: ${b.textContent}`)));
  const gen = await api('table', { t: 'Generated_Library', f: { 'Base movement': a['Base movement'] }, lim: 1, cols: ['ID'] });
  const lib = await api('table', { t: 'Exercise_Library', q: a['Base movement'].split(/[ /(]/)[0], lim: 1, cols: ['Exercise ID'] });
  const usedBy = AR.filter((m) => String(m['Trained by base movements (auto)']).split(/[;,|]\s*/).includes(a['Base movement'])).length;
  $('#am-conn').innerHTML = `<a class="lk" href="${href('combo')}">${fmt(gen.total)} generated combinations</a> use this base · <a class="lk" href="#" id="am-lib">${fmt(lib.total)} library exercises</a> match “${esc(a['Base movement'].split(/[ /(]/)[0])}” · ${usedBy} reference muscles list it as a training movement.`;
  $('#am-lib').onclick = (e) => { e.preventDefault(); go('library', '{}'); setTimeout(() => { const q = $('#ex-q'); if (q) { q.value = a['Base movement'].split(/[ /(]/)[0]; q.dispatchEvent(new Event('input')); } }, 400); };
  const regs = [...new Set(AR.map((m) => m['Body region']))]; let reg = null;
  $('#ar-reg').innerHTML = regs.map((r) => `<button class="chip-btn" data-r="${esc(r)}">${esc(r)}</button>`).join('');
  const draw = () => { const q = $('#ar-q').value.toLowerCase();
    const xs = AR.filter((m) => (!reg || m['Body region'] === reg) && (!q || Object.values(m).join(' ').toLowerCase().includes(q)));
    $('#ar').innerHTML = `<table class="tt"><thead><tr><th>#</th><th>Muscle</th><th>Region · group</th><th>Action</th><th>Tendon / attachment</th><th>Joint / ligaments</th><th>Trained by</th><th>3D</th></tr></thead><tbody>${xs.map((m) => { const bp = S.B.links.muscles[m.Muscle] || [];
      return `<tr><td class="num">${esc(m['#'])}</td><td><b>${esc(m.Muscle)}</b><div class="mini">L+R ${esc(m['Count (L+R)'])}</div></td><td class="mini">${esc(m['Body region'])} · ${esc(m['Functional group'])}</td><td class="mini">${esc(m['Main action(s)'])}</td><td class="mini">${esc(m['Key tendon / attachment'])}</td><td class="mini">${esc(m['Related joint / ligaments'])}</td>
        <td class="mini">${String(m['Trained by base movements (auto)']).startsWith('Not targeted') ? esc(m['Trained by base movements (auto)']) : String(m['Trained by base movements (auto)']).split(/;\s*|,\s*/).filter(Boolean).map((b) => `<a class="lk" href="${href('anatomy', b.trim())}">${esc(b)}</a>`).join(', ')}</td>
        <td>${bp.length ? `<button class="ghost-btn tiny" data-bp="${esc(bp.join('|'))}" data-n="${esc(m.Muscle)}">3D</button>` : '<span class="mini">—</span>'}</td></tr>`; }).join('')}</tbody></table>`;
    $('#ar').querySelectorAll('[data-bp]').forEach((b) => (b.onclick = () => show3D(b.dataset.bp.split('|'), b.dataset.n))); };
  $('#ar-reg').querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => { reg = reg === b.dataset.r ? null : b.dataset.r; $('#ar-reg').querySelectorAll('[data-r]').forEach((x) => x.classList.toggle('on', x.dataset.r === reg)); draw(); }));
  $('#ar-q').oninput = draw; draw();
}

// ================================================================= KNOWLEDGE ATLAS
let G = null;
async function atlas(main, args) {
  const SU = T('Atlas_Subjects'), TO = T('Atlas_Topics'), byT = Object.fromEntries(TO.map((t) => [t.ID, t])), byS = Object.fromEntries(SU.map((s) => [s.Code, s]));
  const doms = [...new Set(SU.map((s) => s.Domain))], dcol = Object.fromEntries(doms.map((d, i) => [d, PAL[i % PAL.length]]));
  const colOf = (t) => dcol[byS[t['Subject code']]?.Domain] || '#ccc';
  main.innerHTML = `${header('Knowledge atlas', `The human knowledge atlas from your workbook: ${SU.length} subjects (MBBS → specialties → physiotherapy → sport science) and ${TO.length} topics from basic to frontier, joined by ${fmt(S.B.links.topic_edges.length)} topic-to-topic links. Every link resolves (Validation).`, 'Knowledge')}
    <section class="card"><div class="card-h"><h2>Topic network</h2><span class="bar"><input class="tr-in" id="kg-q" placeholder="Find a topic (e.g. tendon, ACL, VO2)"><select class="tr-sel" id="kg-lvl"><option value="">all levels</option>${[...new Set(TO.map((t) => t.Level))].sort().map((l) => `<option>${esc(l)}</option>`).join('')}</select></span></div>
      <canvas class="graph" id="kg"></canvas><div class="legend">${doms.map((d) => `<span><i style="background:${dcol[d]}"></i>${esc(d)}</span>`).join('')}<span>· drag to pan, wheel to zoom, click a node</span></div></section>
    <div class="split"><section class="card"><div class="card-h"><h2>Subjects</h2></div><div class="cardlist" id="kg-subj">${SU.map((s) => `<a class="card" style="text-decoration:none;color:inherit;border-left:3px solid ${dcol[s.Domain]}" href="${href('atlas', 'subject', s.Code)}"><h4>${esc(s.Subject)}</h4><p class="mini">${esc(s.Code)} · ${esc(s.Domain)} · ${esc(s['Curriculum stage'])}</p><p class="mini">${esc(s['Topics in atlas (auto)'])} topics · ${esc(s['Links from other subjects (auto)'])} links in</p></a>`).join('')}</div></section>
      <section class="card sticky" id="kg-read"><p class="muted">Click a topic in the network or a subject.</p></section></div>`;
  if (!G) G = layout(TO, S.B.links.topic_edges);
  const cv = $('#kg'), ctx = cv.getContext('2d'); let view = { x: 0, y: 0, k: 1 }, hover = null, sel = args[0] === 'topic' ? args[1] : null, drag = null;
  const lvl = () => $('#kg-lvl').value, q = () => $('#kg-q').value.toLowerCase();
  const ro = new ResizeObserver(() => draw());
  const draw = () => {
    if (!cv.isConnected) { ro.disconnect(); return; }
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; cv.width = r.width * dpr; cv.height = r.height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, r.width, r.height);
    const sx = (x) => r.width / 2 + (x + view.x) * view.k, sy = (y) => r.height / 2 + (y + view.y) * view.k;
    const focus = sel || hover, nb = new Set(focus ? G.adj[focus] : []);
    const match = (t) => (!lvl() || t.Level === lvl()) && (!q() || `${t.ID} ${t.Topic} ${t['Must remember (basics)']}`.toLowerCase().includes(q()));
    G.edges.forEach(([a, b]) => { const on = focus && (a === focus || b === focus); if (!on && focus) { ctx.globalAlpha = 0.04; } else ctx.globalAlpha = on ? 0.8 : 0.1;
      ctx.strokeStyle = on ? '#ffc067' : '#6fd3ff'; ctx.lineWidth = on ? 1.4 : 0.6; ctx.beginPath(); ctx.moveTo(sx(G.p[a].x), sy(G.p[a].y)); ctx.lineTo(sx(G.p[b].x), sy(G.p[b].y)); ctx.stroke(); });
    ctx.globalAlpha = 1;
    TO.forEach((t) => { const p = G.p[t.ID], m = match(t), on = t.ID === focus || nb.has(t.ID); ctx.globalAlpha = focus ? (on ? 1 : 0.18) : m ? 0.95 : 0.12;
      ctx.fillStyle = colOf(t); ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), (2.2 + Math.sqrt(G.deg[t.ID] || 0)) * Math.min(1.6, view.k), 0, 7); ctx.fill();
      if ((on || (view.k > 1.6 && m)) || (q() && m)) { ctx.fillStyle = '#dcecff'; ctx.font = '11px Inter, sans-serif'; ctx.fillText(`${t.ID} ${t.Topic.slice(0, 40)}`, sx(p.x) + 6, sy(p.y) - 6); } });
    ctx.globalAlpha = 1;
  };
  const at = (e) => { const r = cv.getBoundingClientRect(), x = (e.clientX - r.left - r.width / 2) / view.k - view.x, y = (e.clientY - r.top - r.height / 2) / view.k - view.y;
    let best = null, bd = 14 / view.k; TO.forEach((t) => { const p = G.p[t.ID], d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = t.ID; } }); return best; };
  cv.onmousemove = (e) => { if (drag) { view.x += (e.clientX - drag.x) / view.k; view.y += (e.clientY - drag.y) / view.k; drag = { x: e.clientX, y: e.clientY, moved: true }; draw(); return; } const h = at(e); if (h !== hover) { hover = h; draw(); } };
  cv.onmousedown = (e) => { drag = { x: e.clientX, y: e.clientY }; };
  cv.onmouseup = (e) => { const moved = drag?.moved; drag = null; if (!moved) { const h = at(e); if (h) { sel = h; readTopic(byT[h]); draw(); } } };
  cv.onwheel = (e) => { e.preventDefault(); view.k = Math.max(0.4, Math.min(6, view.k * (e.deltaY < 0 ? 1.15 : 0.87))); draw(); };
  $('#kg-q').oninput = draw; $('#kg-lvl').onchange = draw;
  ro.observe(cv); draw();
  function readTopic(t) {
    if (!t) return;
    history.replaceState(null, '', href('atlas', 'topic', t.ID));
    const out = String(t['Linked topics (IDs |)']).split('|').filter((x) => byT[x]), inn = G.into[t.ID] || [];
    const sports = T('Atlas_Sports').filter((s) => ['Injury topic IDs', 'Surgery topic IDs', 'Rehab & prevention topic IDs', 'Performance topic IDs'].some((c) => String(s[c]).split('|').includes(t.ID)));
    $('#kg-read').innerHTML = `<div class="rd"><div><div class="tr-crumb">${esc(t.ID)} · <a class="lk" href="${href('atlas', 'subject', t['Subject code'])}">${esc(t.Subject)}</a> · ${esc(t['System / region'])}</div><h2 style="text-transform:none;font-size:17px;color:var(--text);margin:2px 0 6px">${esc(t.Topic)}</h2><span class="pill acc">${esc(t.Level)}</span></div>
      <div class="rd-sec"><h4>Core</h4>${kv(t, ['Must remember (basics)', 'Theory / law / principle', 'Mechanism chain (cause → effect)', 'Key numbers'])}</div>
      <div class="rd-sec"><h4>Correlations</h4>${kv(t, ['Clinical correlation', 'Physio & sport correlation', 'Assess / test / investigation'])}</div>
      <div class="rd-sec"><h4>Connections</h4><p class="mini"><b>Links out</b>: ${out.map((x) => `<a class="lk" href="#" data-t="${x}">${x} ${esc(byT[x].Topic)}</a>`).join(' · ') || '—'}</p><p class="mini"><b>Linked from</b>: ${inn.map((x) => `<a class="lk" href="#" data-t="${x}">${x} ${esc(byT[x].Topic)}</a>`).join(' · ') || '—'}</p>
        <p class="mini"><b>Deepest connection</b>: ${esc(t['Deepest connection (why linked)'])}</p>${sports.length ? `<p class="mini"><b>Sports</b>: ${sports.map((s) => `<a class="lk" href="${href('sports', S.B.links.atlas_sport_alias[s.Sport] || '')}">${esc(s.Sport)}</a>`).join(' · ')}</p>` : ''}</div>
      <div class="rd-sec"><h4>Learn</h4>${kv(t, ['Pitfall / misconception', 'Self-test question', 'Evidence / core source', 'Mastery', 'My notes'])}</div></div>`;
    $('#kg-read').querySelectorAll('[data-t]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); sel = a.dataset.t; readTopic(byT[sel]); draw(); }));
  }
  if (args[0] === 'topic' && byT[args[1]]) readTopic(byT[args[1]]);
  if (args[0] === 'subject' && byS[args[1]]) {
    const s = byS[args[1]], ts = TO.filter((t) => t['Subject code'] === s.Code);
    const groups = [['What it is', ['Domain', 'Curriculum stage', 'What it explains about the human', 'Scale (molecule → society)', 'Mental model / analogy', 'Learning order (basic → deep)']], ['Basics to frontier', ['Core building blocks (basics)', 'Foundational laws / theories', 'Must-remember facts', 'Key classifications', 'Core mechanisms', 'Advanced topics', 'Deepest / frontier concepts', 'Key formulas / equations', 'Normal values to know']],
      ['Practice', ['Clinical correlation', 'Physio / rehab correlation', 'Sport / S&C correlation', 'Key investigations / tools', 'Key outcome measures / scales', 'Key interventions', 'Red flags / safety', 'Common misconceptions', 'Exam high-yield', 'Practical skill to master', 'Self-test question']],
      ['Connections', ['Upstream (feeds from)', 'Downstream (feeds into)', 'Strongest interconnection (why)', 'Integrating question', 'Development & ageing', 'Sex / gender differences', 'Psychosocial link', 'Nutrition / metabolism link', 'Pharmacology link', 'Pathology link', 'Imaging link', 'Genetics / molecular link', 'Immunology link', 'Biomechanics link', 'Evidence-based practice link', 'Ethics / legal link', 'Technology / AI frontier', 'India context']],
      ['Sources', ['Standard textbooks', 'Guidelines / bodies', 'Scales / questionnaires', 'My notes']]];
    $('#kg-read').innerHTML = `<div class="rd"><div><div class="tr-crumb">${esc(s.Code)} · ${esc(s.Domain)}</div><h2 style="text-transform:none;font-size:17px;color:var(--text);margin:2px 0 6px">${esc(s.Subject)}</h2></div>${groups.map(([h, ks]) => `<div class="rd-sec"><h4>${h}</h4>${kv(s, ks)}</div>`).join('')}
      <div class="rd-sec"><h4>${ts.length} topics</h4>${ts.map((t) => `<p class="mini"><a class="lk" href="${href('atlas', 'topic', t.ID)}">${esc(t.ID)} ${esc(t.Topic)}</a> · ${esc(t.Level)}</p>`).join('')}</div></div>`;
  }
}

function layout(TO, E) { // small force layout, run once (deterministic start)
  const ids = TO.map((t) => t.ID), p = {}, adj = {}, into = {}, deg = {};
  const subj = [...new Set(TO.map((t) => t['Subject code']))];
  TO.forEach((t, i) => { const si = subj.indexOf(t['Subject code']), a = (si / subj.length) * Math.PI * 2, r = 260 + (i % 7) * 6; p[t.ID] = { x: Math.cos(a) * r + ((i * 37) % 23) - 11, y: Math.sin(a) * r + ((i * 53) % 19) - 9, vx: 0, vy: 0 }; adj[t.ID] = []; });
  const edges = E.filter(([a, b]) => p[a] && p[b]);
  edges.forEach(([a, b]) => { adj[a].push(b); adj[b].push(a); (into[b] ||= []).push(a); deg[a] = (deg[a] || 0) + 1; deg[b] = (deg[b] || 0) + 1; });
  for (let it = 0; it < 220; it++) {
    const cool = 1 - it / 240;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const A = p[ids[i]], B = p[ids[j]]; let dx = A.x - B.x, dy = A.y - B.y; const d2 = dx * dx + dy * dy + 0.01; if (d2 > 90000) continue; const f = 900 / d2; dx *= f; dy *= f; A.vx += dx; A.vy += dy; B.vx -= dx; B.vy -= dy; }
    edges.forEach(([a, b]) => { const A = p[a], B = p[b], dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1, f = (d - 60) * 0.012; A.vx += (dx / d) * f * d * 0.05; A.vy += (dy / d) * f * d * 0.05; B.vx -= (dx / d) * f * d * 0.05; B.vy -= (dy / d) * f * d * 0.05; });
    ids.forEach((id) => { const q = p[id]; q.vx -= q.x * 0.004; q.vy -= q.y * 0.004; q.x += Math.max(-12, Math.min(12, q.vx)) * cool; q.y += Math.max(-12, Math.min(12, q.vy)) * cool; q.vx *= 0.5; q.vy *= 0.5; });
  }
  return { p, adj, into, deg, edges };
}

// ================================================================= SCIENCE & METHODS
async function science(main, args) {
  const TS = T('Training_Science').filter((x) => x.ID && x.Concept), cats = [...new Set(TS.map((x) => x.Category))].filter(Boolean);
  const tab = args[0] || 'science';
  const tabs = [['science', `Training science (${TS.length})`], ['elite', `Elite methods (${T('Elite_Methods').length})`], ['loading', `Loading strategies (${T('Loading_Strategies').length})`], ['depth', 'Depth model L1-L6']];
  main.innerHTML = `${header('Science & methods', 'The evidence reference behind the system: what each concept is, what it trains, how it works, the dose, how to use it here, common mistakes, evidence level and references; elite methods with readiness criteria; loading strategies mined from the library; the depth model.', 'Knowledge')}
    <section class="card"><div class="chips">${tabs.map(([k, l]) => `<a class="chip-btn ${k === tab ? 'on' : ''}" href="${href('science', k)}" style="text-decoration:none">${l}</a>`).join('')}</div><div class="bar" style="margin-top:8px"><input class="tr-in" id="sc-q" style="flex:1" placeholder="Filter"></div></section><div id="sc"></div>`;
  const draw = () => { const q = $('#sc-q').value.toLowerCase(), f = (o) => !q || Object.values(o).join(' ').toLowerCase().includes(q);
    if (tab === 'science') $('#sc').innerHTML = cats.map((c) => { const xs = TS.filter((x) => x.Category === c && f(x)); return xs.length ? `<section class="card" style="margin-bottom:12px"><div class="card-h"><h2>${esc(c)}</h2><small>${xs.length}</small></div><div class="cardlist">${xs.map((x) => `<details class="card"><summary><h4 style="display:inline">${esc(x.ID)} · ${esc(x.Concept)}</h4> ${ev(x['Evidence level'])}<p class="mini">${esc(x['What it is'])}</p></summary>${kv(x, ['What it trains / adapts', 'How it works (mechanism)', 'Evidence-based dose', 'How to use in this system', 'Common mistakes', 'Key references'])}</details>`).join('')}</div></section>` : ''; }).join('');
    if (tab === 'elite') $('#sc').innerHTML = `<section class="card"><div class="tt-wrap" style="max-height:none"><table class="tt"><thead><tr><th>Method</th><th>Protocol · dose</th><th>Mechanism</th><th>Readiness</th><th>Best phases</th><th>Best sports</th><th>Risks</th><th>Evidence</th></tr></thead><tbody>${T('Elite_Methods').filter(f).map((m) => `<tr><td><b>${esc(m.Method)}</b><div class="mini">${esc(m.Category)}</div></td><td class="mini">${esc(m.Protocol)}<br><b>${esc(m.Dose)}</b></td><td class="mini">${esc(m.Mechanism)}</td><td class="mini">${esc(m['Readiness Criteria'])}</td><td class="mini">${String(m['Best Phases']).split(/,\s*/).map((p) => T('Phase_System').some((x) => x.Code === p.trim()) ? `<a class="lk" href="${href('phases', p.trim())}">${esc(p)}</a>` : esc(p)).join(', ')}</td><td class="mini">${esc(m['Best Sports'])}</td><td class="mini" style="color:var(--warn)">${esc(m['Risks / Precautions'])}</td><td>${ev(m.Evidence)}</td></tr>`).join('')}</tbody></table></div></section>`;
    if (tab === 'loading') { const LS = T('Loading_Strategies').filter(f); $('#sc').innerHTML = `<div class="tr-grid"><section class="card s5"><div class="card-h"><h2>Most used</h2></div>${hbar(LS.map((x) => [x['Loading strategy'], +x['Exercises using it'] || 0]).sort((a, b) => b[1] - a[1]), { w: 460, lw: 190, limit: 24, color: '#b49bff' })}</section>
      <section class="card s7"><div class="tt-wrap" style="max-height:640px"><table class="tt"><thead><tr><th>Strategy</th><th>Uses</th><th>Tempo</th><th>Sets × reps</th><th>RPE</th><th>Rest</th><th>Goal</th><th>Depth</th></tr></thead><tbody>${LS.map((x) => `<tr class="click" data-ls="${esc(x['Loading strategy'])}"><td><b>${esc(x['Loading strategy'])}</b><div class="mini">${esc(x['Purpose / intensity'])}</div></td><td class="num">${fmt(+x['Exercises using it'])}</td><td class="mini">${esc(x['Typical tempo'])}</td><td class="mini">${esc(x['Typical sets x reps'])}</td><td class="mini">${esc(x['Typical RPE'])}</td><td class="mini">${esc(x['Typical rest'])}</td><td class="mini">${esc(x['Dominant goal'])}</td><td class="num">${esc(x['Median depth'])} <small>${+x['Depth modifier'] > 0 ? '+' : ''}${esc(x['Depth modifier'])}</small></td></tr>`).join('')}</tbody></table></div></section></div>`;
      $('#sc').querySelectorAll('[data-ls]').forEach((tr) => (tr.onclick = () => { const v = S.B.facets.Exercise_Library['Loading Strategy'].find(([k]) => k === tr.dataset.ls || k.startsWith(tr.dataset.ls)); go('library', JSON.stringify(v ? { 'Loading Strategy': v[0] } : {})); })); }
    if (tab === 'depth') $('#sc').innerHTML = `<div class="cardlist">${T('Depth_Model').filter((d) => +d.Level >= 1 && +d.Level <= 6).map((d) => `<a class="card" href="${href('library', JSON.stringify({ 'Depth (1-6)': String(+d.Level) }))}" style="text-decoration:none;color:inherit;border-top:3px solid ${PAL[+d.Level - 1]}"><h4>${esc(d.Name)}</h4><div class="depth" style="margin:4px 0">${[1, 2, 3, 4, 5, 6].map((i) => `<i class="${i <= +d.Level ? 'on' : ''}"></i>`).join('')}</div>${kv(d, ['What it means', 'Typical content in the library', 'Entry requirement', 'Phases where used', 'Why it matters', 'Exercises in library'])}</a>`).join('')}</div>
      <section class="card" style="margin-top:12px"><div class="card-h"><h2>Goal × depth counts (live in the workbook)</h2></div>${rawRest(T('Depth_Model').filter((d) => !(+d.Level >= 1 && +d.Level <= 6)))}</section>`;
    bindTips($('#sc'));
  };
  $('#sc-q').oninput = draw; draw();
}
function rawRest(rows) { if (!rows.length) return '<p class="mini">—</p>'; const ks = Object.keys(rows[0]).filter((k) => !k.startsWith('__'));
  return `<div class="tt-wrap"><table class="tt"><tbody>${rows.map((r) => `<tr>${ks.map((k) => `<td class="mini">${esc(r[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; }

// ================================================================= NUTRITION & SUBSTANCES
async function nutrition(main) {
  const ALL = T('Supplements'), SU = ALL.filter((x) => /^S\d+/.test(x.ID)), P = S.prof, mass = parseFloat(P.identity?.['Body mass (kg)']) || 0, pop = P.identity?.['Population type'] || 'Athlete';
  const flagsOn = Object.entries(P.flags || {}).filter(([, v]) => String(v).toLowerCase() === 'yes').map(([k]) => k);
  const cats = [...new Set(SU.map((x) => x.Category))]; let cat = null;
  main.innerHTML = `${header('Nutrition & substances', `${SU.length} supplements and sports foods (AIS evidence groups), doses scaled to your body mass (${mass} kg), timing slots, interactions, contraindications and anti-doping risk; brand testing, certification schemes and stacks from the same sheet; WADA prohibited classes for awareness only.`, 'Knowledge')}
    <div class="note warn">Educational reference from your workbook. Supplements can interact with medicines and conditions, and products can be contaminated; check with a sports physician or accredited dietitian, and use batch-tested products if you are drug-tested. Prohibited substances are listed for awareness only, with no dosing.</div>
    <section class="card"><div class="card-h"><h2>Supplement atlas</h2><span class="links-row"><span class="mini">your flags on: ${flagsOn.length ? esc(flagsOn.join(', ')) : 'none'}</span><button class="primary small" id="su-save">Save selections</button></span></div>
      <div class="chips" id="su-cats">${cats.map((c) => `<button class="chip-btn" data-c="${esc(c)}">${esc(c)} <small>${SU.filter((x) => x.Category === c).length}</small></button>`).join('')}</div><div class="tt-wrap" style="margin-top:8px;max-height:640px" id="su"></div><p class="fine" id="su-msg"></p></section>
    <section class="card"><div class="card-h"><h2>Detail</h2></div><div id="su-d"><p class="muted">Click a supplement.</p></div></section>
    <div id="su-more"></div>
    <section class="card"><div class="card-h"><h2>Anti-doping: WADA prohibited classes (awareness only)</h2></div><div class="tt-wrap"><table class="tt"><thead><tr><th>Class</th><th>Category · examples</th><th>Why athletes use them</th><th>Status</th><th>Major health risks</th><th>Detection</th><th>Legal / safer alternative</th></tr></thead><tbody>
      ${T('Prohibited_Substances').map((x) => `<tr><td class="mono"><b>${esc(x['WADA Class'])}</b></td><td><b>${esc(x.Category)}</b><div class="mini">${esc(x.Examples)}</div></td><td class="mini">${esc(x['Why Athletes Use Them'])}</td><td class="mini">${esc(x.Status)}</td><td class="mini" style="color:#ff9b9b">${esc(x['Major Health Risks'])}</td><td class="mini">${esc(x['Detection / Strict Liability'])}</td><td class="mini" style="color:var(--ok)">${esc(x['Legal / Safer Alternative'])}</td></tr>`).join('')}</tbody></table></div></section>`;
  const dose = (x) => (x['Dose per kg'] && mass ? `${Math.round(+x['Dose per kg'] * mass * 10) / 10} ${x.Unit} (${x['Dose per kg']} ${x.Unit}/kg)` : x['Fixed / Standard Dose']);
  const warn = (x) => flagsOn.filter((f) => String(x['Caution Flags']).includes(`|${f}|`));
  const draw = () => { $('#su').innerHTML = `<table class="tt"><thead><tr><th>Use</th><th>Supplement</th><th>Evidence</th><th>Primary use</th><th>Your dose</th><th>Timing</th><th>Score</th><th>Doping risk</th></tr></thead><tbody>${SU.filter((x) => !cat || x.Category === cat).map((x) => { const w = warn(x), on = String(P.supplements?.[x.ID] || '').toLowerCase() === 'yes';
      return `<tr class="click" data-id="${esc(x.ID)}"><td><input type="checkbox" data-use="${esc(x.ID)}" ${on ? 'checked' : ''}></td><td><b>${esc(x.Supplement)}</b><div class="mini">${esc(x.ID)} · ${esc(x.Category)}</div>${w.length ? `<span class="pill bad">⚠ ${esc(w.join(', '))}</span>` : ''}</td><td>${ev(x['Evidence (AIS group)'])}</td><td class="mini">${esc(x['Primary Use'])}</td><td class="mini"><b>${esc(dose(x))}</b><div>${esc(pop === 'General adult' ? x['General Adult Dose'] : x['Athlete Dose'])}</div></td><td class="mini">${esc(String(x['Timing Slots']).split('|').filter(Boolean).join(' · '))}</td><td class="num">${esc(x['OVERALL SCORE (0-100)'])}</td><td class="mini">${esc(x['Anti-Doping Risk'])}</td></tr>`; }).join('')}</tbody></table>`;
    $('#su').querySelectorAll('[data-use]').forEach((c) => { c.onclick = (e) => e.stopPropagation(); c.onchange = () => { (P.supplements ||= {})[c.dataset.use] = c.checked ? 'Yes' : 'No'; }; });
    $('#su').querySelectorAll('[data-id]').forEach((tr) => (tr.onclick = () => { const x = SU.find((y) => y.ID === tr.dataset.id);
      $('#su-d').innerHTML = `<div class="daycard"><div class="rd-sec"><h4>${esc(x.Supplement)} · ${esc(x.Forms)}</h4>${kv(x, ['For Whom', 'Primary Use', 'Mechanism', 'Fixed / Standard Dose', 'General Adult Dose', 'Athlete Dose', 'Timing Detail', 'Loading / Cycling', 'Time to Effect', 'Take With / Combine', 'Food-First Source', 'Phase Relevance'])}<p class="mini"><b>Your dose</b>: ${esc(dose(x))}</p></div>
        <div class="rd-sec"><h4>Safety and quality</h4>${kv(x, ['Do Not Combine / Interactions', 'Contraindications & Cautions', 'Caution Flags', 'Side Effects', 'Monitor', 'Anti-Doping Risk', 'Best form / isomer (and forms to avoid)', 'Form grade (A-D)', 'Evidence score (0-10)', 'Safety score (0-10)', 'Doping-safety score (0-10, 10 = lowest risk)', 'Value score (0-10)', 'OVERALL SCORE (0-100)', 'Verified effect (true claim)', 'Marketing claim NOT supported', 'Men: utility & what suits', 'Women: utility & what suits', 'Best-fit athlete level', 'Best-fit sport type', 'Regulation: UK/EU · US · AUS · India', 'Key source'])}</div></div>`; }));
  };
  $('#su-cats').querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { cat = cat === b.dataset.c ? null : b.dataset.c; $('#su-cats').querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('on', x.dataset.c === cat)); draw(); }));
  $('#su-save').onclick = async () => { const r = await post('profile', P); $('#su-msg').textContent = `Saved ${r.saved} (profile.json, this machine only).`; };
  draw();
  // the rest of the Supplements sheet, split into its own sections (scoring, brands, certification, stacks, checklist, sources)
  const rest = ALL.filter((x) => !/^S\d+/.test(x.ID)), secs = []; let cur = null;
  rest.forEach((r) => { const vals = Object.entries(r).filter(([k, v]) => !k.startsWith('__') && v !== ''); const first = r.ID;
    if (vals.length === 1 && first && first === first.toUpperCase() && /[A-Z]{4}/.test(first)) { cur = { title: first, header: null, rows: [] }; secs.push(cur); return; }
    if (!cur) { cur = { title: 'Notes', header: null, rows: [] }; secs.push(cur); }
    if (!cur.header && vals.length >= 3 && cur.rows.length === 0 && /^(Brand|Scheme|Level|#|Step)/.test(first)) { cur.header = Object.keys(r).filter((k) => !k.startsWith('__')).map((k) => r[k]); return; }
    cur.rows.push(Object.keys(r).filter((k) => !k.startsWith('__')).map((k) => r[k])); });
  $('#su-more').innerHTML = secs.map((s) => { const n = Math.max(1, ...[s.header || [], ...s.rows].map((r) => r.map((v, i) => (v !== '' ? i + 1 : 0)).reduce((a, b) => Math.max(a, b), 0)));
    return `<section class="card" style="margin-top:14px"><div class="card-h"><h2>${esc(s.title)}</h2><small>${s.rows.length} rows · as recorded in your workbook; verify at the named source</small></div><div class="tt-wrap" style="max-height:480px"><table class="tt">${s.header ? `<thead><tr>${s.header.slice(0, n).map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>` : ''}<tbody>${s.rows.map((r) => `<tr>${r.slice(0, n).map((v, i) => `<td class="${i ? 'mini' : ''}">${i ? esc(v) : `<b>${esc(v)}</b>`}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`; }).join('');
}
