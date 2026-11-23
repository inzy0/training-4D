// Diagnostics area: diagnoses the MEASUREMENTS, never the person.
//   1. Tracking quality (live): how well each body region is seen, jitter, fps.
//   2. Gate V1, goniometer agreement: paired readings -> bias, mean absolute
//      difference, Bland-Altman 95% limits; pass marks set before any data
//      (elbow/knee 5 deg, from docs/ANATOMY_LAB_PLAN.md; others report only).
//   3. Real recognition check: the user marks each detected rep right/wrong.
//   4. Movement observations: left/right differences, values vs cited normals,
//      repeatedly failed form rules. Observations only: no condition is named
//      or suggested, and nothing here is a diagnosis.

import { labState } from './motion_lab.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STORE = 'anatomy-lab-v1-pairs';
const D = { pairs: load(), qual: [], jit: [], marks: new Map(), started: false };

function load() { try { return JSON.parse(localStorage.getItem(STORE) || '[]'); } catch { return []; } }
function save() { try { localStorage.setItem(STORE, JSON.stringify(D.pairs)); } catch { /* storage blocked: CSV export still works */ } }

const REGIONS = { Head: [0, 7, 8], Shoulders: [11, 12], 'Elbows & wrists': [13, 14, 15, 16], Hands: [17, 18, 19, 20], Hips: [23, 24], Knees: [25, 26], 'Ankles & feet': [27, 28, 29, 30, 31, 32] };

// V1 joints: how to read the app value, and the pre-registered pass mark (null = report only)
const V1 = {
  l_elbow: { label: 'Left elbow flexion', get: (m) => m.l_elbow, pass: 5 }, r_elbow: { label: 'Right elbow flexion', get: (m) => m.r_elbow, pass: 5 },
  l_knee: { label: 'Left knee flexion', get: (m) => m.l_knee, pass: 5 }, r_knee: { label: 'Right knee flexion', get: (m) => m.r_knee, pass: 5 },
  l_sh: { label: 'Left shoulder elevation', get: (m) => m.l_sh?.elev, pass: null }, r_sh: { label: 'Right shoulder elevation', get: (m) => m.r_sh?.elev, pass: null },
  l_hip: { label: 'Left hip flexion', get: (m) => m.l_hip?.flex, pass: null }, r_hip: { label: 'Right hip flexion', get: (m) => m.r_hip?.flex, pass: null },
  trunk: { label: 'Trunk flexion', get: (m) => m.trunk?.flex, pass: null },
};
const NORM = { knee: 140, elbow: 140 }; // StatPearls quotes, see motion_lab.js NORMS

export function startDiagnostics() {
  if (D.started) return; D.started = true;
  $('#v1-joint').innerHTML = Object.entries(V1).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('');
  $('#v1-record').onclick = recordPair;
  $('#v1-csv').onclick = v1Csv;
  $('#v1-clear').onclick = () => { if (confirm('Delete all recorded goniometer pairs?')) { D.pairs = []; save(); renderV1(); } };
  $('#obs-build').onclick = buildObservations;
  $('#obs-save').onclick = saveObservations;
  renderV1();
  setInterval(tick, 100);
}

// ------------------------------------------------------------------ live: quality + app value preview
const hist = [];
function tick() {
  const L = labState(); if (!L?.rig) { $('#q-body').innerHTML = '<p class="muted">Open Motion Lab once to load the rig.</p>'; return; }
  const now = performance.now() / 1000;
  if (L.meas) hist.push({ t: now, m: L.meas, vis: L.vis ? [...L.vis] : null, W: L.W ? { 11: L.W[11]?.clone(), 12: L.W[12]?.clone() } : null });
  while (hist.length && now - hist[0].t > 5) hist.shift();
  const live = L.src === 'camera' && now - (L.lastFrameT || 0) < 1.5;
  // region visibility over the last 5 s
  const rows = Object.entries(REGIONS).map(([name, ids]) => {
    const vals = hist.filter((h) => h.vis).flatMap((h) => ids.map((i) => h.vis[i] ?? 0));
    const v = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    const cls = v == null ? 'na' : v > 0.8 ? 'good' : v > 0.5 ? 'fair' : 'poor';
    return `<tr><td>${name}</td><td><span class="q ${cls}">${v == null ? '—' : `${Math.round(v * 100)}%`}</span></td></tr>`;
  }).join('');
  // jitter: shoulder landmark spread over the last second while the body is still
  const last = hist.filter((h) => now - h.t < 1 && h.W?.[11]);
  let jit = null;
  if (last.length > 5) {
    const ch = (h) => [h.m.l_elbow, h.m.r_elbow, h.m.l_knee, h.m.r_knee].filter((x) => x != null);
    const a = ch(last[0]), b = ch(last[last.length - 1]);
    const still = a.length && a.every((x, i) => Math.abs(x - b[i]) < 3);
    if (still) {
      const m = last.reduce((s, h) => s.add(h.W[11]), last[0].W[11].clone().multiplyScalar(0)).multiplyScalar(1 / last.length);
      jit = Math.sqrt(last.reduce((s, h) => s + h.W[11].distanceToSquared(m), 0) / last.length) * 1000;
      D.jit.push(jit); if (D.jit.length > 40) D.jit.shift();
    }
  }
  const fps = $('#fps')?.textContent || '—';
  $('#q-body').innerHTML = `
    <p class="fine">Input: <b>${live ? 'camera' : L.src === 'demo' ? 'demo (synthetic)' : 'none'}</b> · ${esc(fps)} · ${L.calibrated ? 'calibrated stance' : 'not calibrated'} · position: ${esc(L.position || '—')}</p>
    <table><thead><tr><th>Region</th><th>Seen (avg visibility, 5 s)</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="fine">Landmark jitter while still (shoulder, RMS): <b class="mono">${jit == null ? (D.jit.length ? `${median(D.jit).toFixed(1)} mm (median of recent)` : 'hold still to measure') : `${jit.toFixed(1)} mm`}</b>.
    Good: ≥ 80% seen. Fair: 50–80%. Poor: below 50%, so angles there are not reported.</p>`;
  // V1 preview
  const k = $('#v1-joint').value; const vals = hist.filter((h) => now - h.t < 1).map((h) => V1[k].get(h.m)).filter((x) => x != null && Number.isFinite(x));
  $('#v1-live').textContent = vals.length ? `${median(vals).toFixed(1)}° (median of last 1 s, ${vals.length} frames)` : 'not seen';
  renderMarks(L);
}
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };

// ------------------------------------------------------------------ V1
function recordPair() {
  const L = labState(); const k = $('#v1-joint').value; const g = parseFloat($('#v1-gonio').value);
  const now = performance.now() / 1000;
  const vals = hist.filter((h) => now - h.t < 1).map((h) => V1[k].get(h.m)).filter((x) => x != null && Number.isFinite(x));
  const msg = $('#v1-msg');
  if (!Number.isFinite(g)) { msg.textContent = 'Enter the goniometer reading in degrees first.'; return; }
  if (vals.length < 5) { msg.textContent = 'The app does not see this joint right now. Check tracking quality.'; return; }
  const spread = Math.max(...vals) - Math.min(...vals);
  if (spread > 4) { msg.textContent = `Not still enough (app value moved ${spread.toFixed(1)}° in 1 s). Hold the position and try again.`; return; }
  D.pairs.push({ joint: k, app: +median(vals).toFixed(2), gonio: g, when: new Date().toISOString(), src: L.src, calibrated: !!L.calibrated });
  save(); $('#v1-gonio').value = ''; msg.textContent = `Recorded: app ${median(vals).toFixed(1)}° vs goniometer ${g}°.`;
  renderV1();
}

function stats(ps) {
  const d = ps.map((p) => p.app - p.gonio), n = d.length;
  const bias = d.reduce((a, b) => a + b, 0) / n, mad = d.reduce((a, b) => a + Math.abs(b), 0) / n;
  const sd = n > 1 ? Math.sqrt(d.reduce((a, b) => a + (b - bias) ** 2, 0) / (n - 1)) : NaN;
  return { n, bias, mad, sd, lo: bias - 1.96 * sd, hi: bias + 1.96 * sd };
}

// sessions = groups of pairs separated by more than 30 minutes (plan: 10 positions over 2 sessions)
function sessions(ps) { const t = ps.map((p) => Date.parse(p.when)).sort((a, b) => a - b); let n = t.length ? 1 : 0; for (let i = 1; i < t.length; i++) if (t[i] - t[i - 1] > 30 * 60 * 1000) n++; return n; }

function renderV1() {
  const rows = Object.entries(V1).map(([k, v]) => {
    const ps = D.pairs.filter((p) => p.joint === k); if (!ps.length) return '';
    const s = stats(ps);
    let verdict = '<span class="muted">report only (no pre-set pass mark)</span>';
    const ns = sessions(ps);
    if (v.pass != null) verdict = s.n < 10 ? `<span class="muted">needs ≥ 10 pairs (${s.n})</span>` : ns < 2 ? `<span class="muted">needs a 2nd session (pairs ≥ 30 min apart)</span>` : s.mad <= v.pass ? `<span class="q good">PASS (≤ ${v.pass}°)</span>` : `<span class="q poor">NOT PASSED (> ${v.pass}°)</span>`;
    return `<tr><td>${esc(v.label)}</td><td class="mono">${s.n}</td><td class="mono">${s.bias.toFixed(2)}°</td><td class="mono">${s.mad.toFixed(2)}°</td><td class="mono">${Number.isFinite(s.sd) ? `${s.lo.toFixed(1)} to ${s.hi.toFixed(1)}°` : '—'}</td><td>${verdict}</td></tr>`;
  }).join('');
  $('#v1-table tbody').innerHTML = rows || '<tr><td colspan="6" class="muted">No pairs recorded yet.</td></tr>';
}

function v1Csv() {
  const rows = [['joint', 'app_deg', 'goniometer_deg', 'difference_deg', 'when', 'source', 'calibrated'], ...D.pairs.map((p) => [p.joint, p.app, p.gonio, (p.app - p.gonio).toFixed(2), p.when, p.src, p.calibrated])];
  download(rows.map((r) => r.join(',')).join('\n'), `v1_goniometer_pairs_${stamp()}.csv`, 'text/csv');
}

// ------------------------------------------------------------------ real recognition check
function renderMarks(L) {
  const reps = (L.rec?.reps || []).filter((r) => r.id).slice(-12).reverse();
  const host = $('#rc-list');
  const sig = reps.map((r) => r.t).join(',') + [...D.marks.values()].join('');
  if (host.dataset.sig === sig) return; host.dataset.sig = sig;
  host.innerHTML = reps.map((r) => { const m = D.marks.get(r.t); return `<li><span>${esc(r.name)} <small>${r.dur.toFixed(1)} s · ${esc(r.position || '')}</small></span>
    <span><button class="ghost-btn ${m === true ? 'on' : ''}" data-t="${r.t}" data-v="1">Right</button> <button class="ghost-btn ${m === false ? 'on' : ''}" data-t="${r.t}" data-v="0">Wrong</button></span></li>`; }).join('') || '<li class="muted">No named reps yet. Do some movements in Motion Lab.</li>';
  host.querySelectorAll('button[data-t]').forEach((b) => b.onclick = () => { D.marks.set(+b.dataset.t, b.dataset.v === '1'); host.dataset.sig = ''; renderMarks(L); });
  const marked = [...D.marks.values()]; const ok = marked.filter(Boolean).length;
  $('#rc-sum').innerHTML = marked.length ? `Real recognition accuracy so far: <b class="mono">${ok}/${marked.length} (${((100 * ok) / marked.length).toFixed(1)}%)</b>, from your own labels. Missed reps are not counted here: note any repetition the app did not detect.` : 'Mark each detected rep as right or wrong to measure real recognition accuracy.';
}

// ------------------------------------------------------------------ observations report
function buildObservations() {
  const L = labState(); const out = []; const R = L.results || [];
  const peak = (label) => R.filter((r) => r.test === label).map((r) => r.a).filter((x) => x != null);
  // left/right differences
  for (const base of ['shoulder flexion', 'shoulder abduction', 'elbow flexion', 'hip flexion', 'hip abduction', 'knee flexion', 'ankle dorsiflexion']) {
    const l = peak(`Left ${base}`), r = peak(`Right ${base}`);
    if (l.length && r.length) {
      const a = Math.max(...l), b = Math.max(...r), d = Math.abs(a - b);
      out.push({ kind: d >= 10 ? 'flag' : 'ok', text: `${base[0].toUpperCase()}${base.slice(1)}: left ${a.toFixed(1)}°, right ${b.toFixed(1)}°, difference ${d.toFixed(1)}°${d >= 10 ? ' (10° or more)' : ''}.` });
    }
  }
  // vs cited normals
  for (const [side, S] of [['Left', 'l'], ['Right', 'r']]) for (const [j, n] of Object.entries(NORM)) {
    const p = peak(`${side} ${j} flexion`); if (!p.length) continue;
    const a = Math.max(...p);
    out.push({ kind: a < n - 10 ? 'flag' : 'ok', text: `${side} ${j} flexion peak ${a.toFixed(1)}° against the cited normal of about ${n}° (StatPearls)${a < n - 10 ? ': more than 10° below' : ''}.` });
  }
  // repeatedly failed form rules
  const reps = (L.rec?.reps || []).filter((r) => r.id);
  const byDrill = new Map(); reps.forEach((r) => { if (!byDrill.has(r.name)) byDrill.set(r.name, []); byDrill.get(r.name).push(r); });
  byDrill.forEach((rs, name) => {
    const fails = new Map(); rs.forEach((r) => r.checks.forEach((c) => { if (!c.pass) fails.set(c.label, (fails.get(c.label) || 0) + 1); }));
    fails.forEach((n, label) => { if (rs.length >= 2 && n / rs.length >= 0.5) out.push({ kind: 'flag', text: `${name}: "${label}" not met in ${n} of ${rs.length} reps.` }); });
    out.push({ kind: 'ok', text: `${name}: ${rs.length} reps, mean form ${(rs.reduce((s, r) => s + r.form, 0) / rs.length).toFixed(0)}%.` });
  });
  const valid = Object.entries(V1).filter(([k, v]) => v.pass != null).map(([k]) => { const ps = D.pairs.filter((p) => p.joint === k); return ps.length >= 10 && sessions(ps) >= 2 && stats(ps).mad <= V1[k].pass; });
  const vstate = valid.every(Boolean) ? 'Gate V1 passed for elbow and knee.' : 'Gate V1 has not passed, so these angles are unvalidated estimates.';
  D.obs = { out, vstate, when: new Date().toLocaleString() };
  $('#obs-body').innerHTML = out.length ? `<ul class="obs">${out.map((o) => `<li class="${o.kind}">${esc(o.text)}</li>`).join('')}</ul><p class="fine">${esc(vstate)}</p>` : '<p class="muted">Nothing to report yet. Run movement tests (both sides) or drills in Motion Lab.</p>';
}

function saveObservations() {
  if (!D.obs) buildObservations();
  const o = D.obs; const L = labState();
  const md = `# Movement observations\n\n${o.when}\n\n> These are measurements and observations from one camera. They are not a diagnosis, and this app cannot identify any medical condition. ${o.vstate} If you have pain, injury or concern, see a qualified clinician.\n\n${o.out.map((x) => `- ${x.kind === 'flag' ? '**Noted:** ' : ''}${x.text}`).join('\n')}\n\nInput: ${L.src}, ${L.calibrated ? 'calibrated' : 'not calibrated'}.\n`;
  download(md, `movement_observations_${stamp()}.md`, 'text/markdown');
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
function download(text, name, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); }
