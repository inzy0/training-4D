// MRI studio: full-resolution IXI brain MRI (healthy volunteers, CC BY-SA 3.0)
// in T1, T2, PD and MR angiography (MRA), reoriented to RAS and kept at native
// resolution with the scanner's voxel spacing, so distances are in millimetres.
//   - three linked planes (axial / coronal / sagittal) with orientation letters,
//     click to move the crosshair; one plane can be enlarged
//   - window / level, colour maps, filters, cine (plays through the slices)
//   - MIP: maximum-intensity projection over a slab (vessels in MRA)
//   - fusion: T1 -> red, T2 -> green, PD -> blue, sampled through each
//     volume's own voxel-to-scanner matrix (no further registration)
//   - measure: click-drag in the enlarged view, length in mm
// Collections: brain (IXI), whole body and body regions with 50 labelled
// structures (TotalSegmentator MRI, CC BY 4.0), and functional MRI (OpenNeuro
// ds000105, PDDL) with a GLM t-map overlay, a time slider and the signal at the
// crosshair plotted against the stimulus blocks.
// Display convention: radiological (the subject's right on the viewer's left).

import { lut, filterGrey, ANCH, FILTERS } from './imaging_viewer.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SEQ = { T1: 'T1-weighted', T2: 'T2-weighted', PD: 'Proton density', MRA: 'MR angiography (time of flight)', FUSION: 'Fusion: T1 red · T2 green · PD blue' };
const cache = new Map();
let NOTES = null; // quoted organ notes (tools/imaging_learn_build.py)

const COLL = { brain: 'Brain (IXI, 4 sequences)', body: 'Whole body & regions, 50 labelled structures (TotalSegmentator MRI)', fmri: 'Functional MRI: visual objects task (OpenNeuro ds000105)' };
const get = async (u) => { try { const r = await fetch(u, { cache: 'no-store' }); return r.ok ? r.json() : null; } catch { return null; } };
async function loadCollections() {
  const C = {};
  const ixi = await get('/training-4D/rt/imaging/ixi_full/index.json');
  if (ixi && Object.keys(ixi.subjects).length) C.brain = { base: 'ixi_full', subjects: ixi.subjects, label: (s) => `IXI${String(s).padStart(3, '0')} (${ixi.subjects[s].T1?.site || ''})`, seqs: SEQ };
  const body = await get('/training-4D/rt/imaging/body_mri/index.json');
  if (body && Object.keys(body.subjects).length) {
    const subs = {}; for (const [sid, m] of Object.entries(body.subjects)) subs[sid] = { MRI: { file: `${sid}.u8`, shape_zyx: m.shape_zyx, spacing_mm_zyx: m.spacing_mm_zyx, site: m.study }, _labels: { file: `${sid}_labels.u8`, names: m.labels, present: m.present, overlap: m.overlap_voxels }, _m: m };
    C.body = { base: 'body_mri', subjects: subs, label: (s) => `${s} · ${body.subjects[s].study.replace(/^mri /, '')}`, seqs: { MRI: 'MRI (sequence as acquired)' }, source: body.source };
  }
  const f = await get('/training-4D/rt/imaging/fmri/index.json');
  if (f) C.fmri = { base: 'fmri', subjects: { 'sub-1 run-1': { EPI: { file: 'mean.u8', shape_zyx: f.shape_zyx, spacing_mm_zyx: f.spacing_mm_zyx, site: 'ds000105' }, _fmri: f } }, label: (s) => s, seqs: { EPI: 'Mean functional image (EPI)' } };
  return C;
}

export async function openMriStudio(opts = {}) {
  const C = await loadCollections();
  if (!Object.keys(C).length) { alert('No MRI collections downloaded yet (tools/imaging_hires.py, tools/imaging_fmri_body.py).'); return; }
  const coll0 = Object.keys(C)[0], idx = C[coll0], subs = Object.keys(idx.subjects);
  let host = $('#mri-studio');
  if (!host) { host = document.createElement('div'); host.id = 'mri-studio'; host.className = 'iv'; document.body.appendChild(host); }
  host.hidden = false;
  host.innerHTML = `
    <div class="iv-top"><div class="iv-head"><b>MRI studio</b> · <span id="ms-coll-src"></span> · <span id="ms-sub-info" class="fine"></span></div>
      <div class="iv-nav"><button class="ghost-btn" id="ms-close">✕</button></div></div>
    <div class="iv-body">
      <div class="ms-grid" id="ms-grid">${['ax', 'co', 'sa'].map((p) => `<div class="ms-cell" data-p="${p}"><canvas data-cv="${p}"></canvas><span class="ms-lbl" data-l="${p}"></span><span class="ms-or ms-t" data-o="${p}-t"></span><span class="ms-or ms-b" data-o="${p}-b"></span><span class="ms-or ms-l" data-o="${p}-l"></span><span class="ms-or ms-r" data-o="${p}-r"></span></div>`).join('')}<div class="ms-cell ms-info" id="ms-info"></div></div>
      <aside class="iv-side">
        <label class="fine">Collection <select id="ms-coll">${Object.keys(C).map((k) => `<option value="${k}">${COLL[k]}</option>`).join('')}</select></label>
        <label class="fine">Subject <select id="ms-sub"></select></label>
        <label class="fine">Sequence <select id="ms-seq"></select></label>
        <div id="ms-ov" class="ms-ov"></div>
        <label class="fine">Enlarge <select id="ms-big"><option value="">All three planes</option><option value="ax">Axial</option><option value="co">Coronal</option><option value="sa">Sagittal</option></select></label>
        <label class="fine">Window <input id="ms-ww" type="range" min="8" max="255" value="255"></label>
        <label class="fine">Level <input id="ms-wl" type="range" min="0" max="255" value="128"></label>
        <label class="fine">Colour map <select id="ms-cmap">${Object.keys(ANCH).map((k) => `<option>${k}</option>`).join('')}</select></label>
        <label class="fine">Filter <select id="ms-filter">${Object.entries(FILTERS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
        <label class="fine">MIP slab (mm, 0 = single slice) <input id="ms-mip" type="range" min="0" max="80" value="0"> <span id="ms-mipv" class="mono">0</span></label>
        <div class="iv-row"><button class="ghost-btn" id="ms-cine">▶ Cine</button><label class="fine"><input type="checkbox" id="ms-smooth" checked> Smooth</label><label class="fine"><input type="checkbox" id="ms-cross" checked> Crosshair</label><label class="fine"><input type="checkbox" id="ms-notes" checked> Floating notes</label></div>
        <div class="ms-tools"><span class="fine">Tool</span>${[['cross', '✛ Crosshair'], ['pan', '✋ Pan'], ['meas', '📏 Measure'], ['mark', '📍 Mark']].map(([k, v]) => `<button class="ghost-btn ${k === 'cross' ? 'on' : ''}" data-tool="${k}">${v}</button>`).join('')}</div>
        <div class="iv-row"><button class="ghost-btn" id="ms-zin">＋ Zoom</button><button class="ghost-btn" id="ms-zout">－</button><button class="ghost-btn" id="ms-zreset">Reset view</button><label class="fine"><input type="checkbox" id="ms-zlink" checked> Link zoom</label></div>
        <p class="fine" id="ms-meas">Scroll = slice · Ctrl+scroll = zoom at the pointer · Pan tool or middle-drag = move · Measure works in every view.</p>
        <details open><summary class="fine"><b>Marked points</b> <span id="ms-mk-n"></span></summary><ul id="ms-marks" class="ms-marks"></ul>
          <div class="iv-row"><button class="ghost-btn" id="ms-mk-dl">⭳ Export</button><button class="ghost-btn" id="ms-mk-note">→ Notes</button><button class="ghost-btn" id="ms-mk-clear">Clear</button></div>
          <p class="fine">A point is a 3D voxel: it shows in every plane that passes through it (±1 slice). Saved in this browser per scan.</p></details>
        <p class="fine muted">Healthy volunteers, research data: no diagnosis is made or implied. Intensities are an 8-bit window (1st-99.5th percentile) of each scan, not calibrated units.</p>
      </aside>
    </div>`;
  const V = { C, coll: coll0, idx, sub: subs[0], seq: Object.keys(idx.seqs)[0], pos: null, tool: 'cross', zoom: { ax: 1, co: 1, sa: 1 }, pan: { ax: [0, 0], co: [0, 0], sa: [0, 0] }, marks: [], ww: 255, wl: 128, cmap: 'grey', filter: 'none', mip: 0, big: '', cine: null, meas: null, ovOp: 0.55, thr: 4, con: 0, tIdx: -1, hide: new Set() };
  const draw = () => drawAll(host, V);
  const fillSelects = () => {
    const c = V.C[V.coll]; V.idx = c;
    $('#ms-sub', host).innerHTML = Object.keys(c.subjects).map((s) => `<option value="${esc(s)}">${esc(c.label(s))}</option>`).join('');
    $('#ms-seq', host).innerHTML = Object.entries(c.seqs).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
    V.sub = Object.keys(c.subjects)[0]; V.seq = Object.keys(c.seqs)[0];
    $('#ms-coll-src', host).textContent = V.coll === 'brain' ? 'full-resolution brain MRI of healthy volunteers (IXI dataset, CC BY-SA 3.0)' : V.coll === 'body' ? 'body MRI with 50 labelled structures (TotalSegmentator MRI dataset v3.0.0, CC BY 4.0)' : 'functional MRI, visual object recognition (OpenNeuro ds000105, Haxby et al., PDDL)';
  };
  fillSelects();
  if (opts.coll && C[opts.coll]) { V.coll = opts.coll; $('#ms-coll', host).value = opts.coll; fillSelects(); if (opts.sub && V.idx.subjects[opts.sub]) { V.sub = opts.sub; $('#ms-sub', host).value = opts.sub; } }
  if (opts.big) { V.big = opts.big; $('#ms-big', host).value = opts.big; $('#ms-grid', host).dataset.big = opts.big; }
  $('#ms-coll', host).onchange = (e) => { V.coll = e.target.value; fillSelects(); V.pos = null; V.hide.clear(); V.tIdx = -1; load(); };
  const load = async () => { $('#ms-sub-info', host).textContent = 'loading…'; await ensure(V); V.pos = V.pos || center(V); overlayUI(host, V, draw); info(host, V); loadMarks(V); renderMarks(host, V, draw); draw(); };
  $('#ms-close', host).onclick = () => { host.hidden = true; clearInterval(V.cine); };
  $('#ms-sub', host).onchange = (e) => { V.sub = e.target.value; V.pos = null; load(); };
  $('#ms-seq', host).onchange = (e) => { V.seq = e.target.value; V.pos = null; load(); };
  $('#ms-big', host).onchange = (e) => { V.big = e.target.value; $('#ms-grid', host).dataset.big = V.big; requestAnimationFrame(draw); };
  for (const [id, key, f] of [['ms-ww', 'ww', Number], ['ms-wl', 'wl', Number], ['ms-cmap', 'cmap', String], ['ms-filter', 'filter', String]]) $(`#${id}`, host).oninput = (e) => { V[key] = f(e.target.value); draw(); };
  $('#ms-mip', host).oninput = (e) => { V.mip = +e.target.value; $('#ms-mipv', host).textContent = V.mip; draw(); };
  $('#ms-smooth', host).onchange = draw; $('#ms-cross', host).onchange = draw; $('#ms-notes', host).onchange = draw;
  $('#ms-cine', host).onclick = () => {
    if (V.cine) { clearInterval(V.cine); V.cine = null; $('#ms-cine', host).textContent = '▶ Cine'; return; }
    $('#ms-cine', host).textContent = '■ Stop';
    V.cine = setInterval(() => {
      if (V.coll === 'fmri') { const T = V.fm.T; V.tIdx = (V.tIdx + 1) % T; const sl = $('#ms-t', host); if (sl) sl.value = V.tIdx; draw(); info(host, V); return; } // cine = play the scan over time
      const ax = { ax: 2, co: 1, sa: 0 }[V.big || 'ax'], n = dims(V)[ax]; V.pos[ax] = (V.pos[ax] + 1) % n; draw(); info(host, V);
    }, V.coll === 'fmri' ? 120 : 70);
  };
  host.querySelectorAll('[data-cv]').forEach((cv) => bindCanvas(cv, host, V, draw));
  host.querySelectorAll('[data-tool]').forEach((b) => (b.onclick = () => { V.tool = b.dataset.tool; host.querySelectorAll('[data-tool]').forEach((x) => x.classList.toggle('on', x === b)); }));
  const zoomAll = (f) => { for (const k of ['ax', 'co', 'sa']) V.zoom[k] = Math.max(1, Math.min(12, V.zoom[k] * f)); draw(); };
  $('#ms-zin', host).onclick = () => zoomAll(1.25); $('#ms-zout', host).onclick = () => zoomAll(0.8);
  $('#ms-zreset', host).onclick = () => { V.zoom = { ax: 1, co: 1, sa: 1 }; V.pan = { ax: [0, 0], co: [0, 0], sa: [0, 0] }; draw(); };
  $('#ms-mk-clear', host).onclick = () => { if (confirm('Remove all marked points on this scan?')) { V.marks = []; saveMarks(V); renderMarks(host, V, draw); draw(); } };
  $('#ms-mk-dl', host).onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(markExport(V), null, 1)], { type: 'application/json' })); a.download = `mri_points_${V.coll}_${V.sub}.json`; a.click(); };
  $('#ms-mk-note', host).onclick = () => { const t = markExport(V).points.map((m) => `- ${m.label}: voxel ${m.voxel.join(', ')} (${m.mm.join(', ')} mm)${m.structure ? ` · ${m.structure}` : ''}`).join('\n'); navigator.clipboard?.writeText(`MRI points · ${V.coll} ${V.sub} ${V.seq}\n${t}`); alert('Points copied: open Notes (Alt+N) and paste.'); };
  new ResizeObserver(draw).observe($('#ms-grid', host));
  await load();
}

// ------------------------------------------------------------------ data
const meta = (V, s = V.seq === 'FUSION' ? 'T1' : V.seq) => V.idx.subjects[V.sub][s];
async function fetchBin(V, file, kind = Uint8Array) {
  const key = `${V.idx.base}/${file}`;
  if (!cache.has(key)) cache.set(key, new kind(await (await fetch(`/training-4D/rt/imaging/${key}`)).arrayBuffer()));
  return cache.get(key);
}
async function vol(V, s) { return fetchBin(V, V.idx.subjects[V.sub][s].file); }
async function ensure(V) {
  V.vols = {};
  for (const s of V.seq === 'FUSION' ? ['T1', 'T2', 'PD'] : [V.seq]) V.vols[s] = await vol(V, s);
  // fusion: the IXI headers do not put the sequences in one scanner frame (they are not co-registered), so each
  // sequence is aligned to T1 by its head bounding box in millimetres, axis by axis (approximate)
  if (V.seq === 'FUSION') { V.bb = {}; for (const s of ['T1', 'T2', 'PD']) V.bb[s] = headBox(V, s); }
  const sj = V.idx.subjects[V.sub];
  V.labels = sj._labels ? await fetchBin(V, sj._labels.file) : null; V.labelNames = sj._labels?.names || null;
  V.lstat = V.labels ? labelStats(V) : null;
  if (V.labels && !NOTES) NOTES = await fetch('/training-4D/rt/imaging/organ_notes.json').then((r) => r.json()).catch(() => ({ notes: {} }));
  V.fm = sj._fmri || null;
  if (V.fm) { V.bold = await fetchBin(V, 'bold.u8'); V.tmaps = []; for (const c of V.fm.contrasts) V.tmaps.push(await fetchBin(V, V.fm.tmaps[c], Float32Array)); }
  else { V.bold = null; V.tmaps = null; }
}
// colour of label k (stable, well separated hues)
const labCol = (k) => { const h = (k * 137.508) % 360, s = 0.75, l = 0.55; const a = s * Math.min(l, 1 - l), f = (n) => { const q = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(q - 3, 9 - q, 1)))); }; return [f(0), f(8), f(4)]; };
const dims = (V) => { const [z, y, x] = meta(V).shape_zyx; return [x, y, z]; };
const center = (V) => dims(V).map((n) => Math.floor(n / 2));
const spacing = (V) => { const [z, y, x] = meta(V).spacing_mm_zyx; return [x, y, z]; };

function sample(V, s, x, y, z) { // voxel value of sequence s at T1-grid voxel (x,y,z) (fusion) or own grid
  const m = meta(V, s), [Z, Y, X] = m.shape_zyx;
  if (V.seq === 'FUSION' && s !== 'T1') { const A = V.bb.T1, B = V.bb[s], v = [x, y, z]; [x, y, z] = v.map((c, k) => Math.round(B.lo[k] + ((c - A.lo[k]) / (A.hi[k] - A.lo[k] || 1)) * (B.hi[k] - B.lo[k]))); }
  if (x < 0 || y < 0 || z < 0 || x >= X || y >= Y || z >= Z) return 0;
  if (V.bold && V.tIdx >= 0) return V.bold[((V.tIdx * Z + z) * Y + y) * X + x]; // fMRI: the volume at the chosen time point
  return V.vols[s][(z * Y + y) * X + x];
}

// one plane as an ImageData. Axial: fixed z, cols x (flipped: radiological), rows y (anterior up).
// Coronal: fixed y, cols x (flipped), rows z (superior up). Sagittal: fixed x, cols y (anterior left), rows z.
function plane(V, p) {
  const [X, Y, Z] = dims(V), sp = spacing(V), [px, py, pz] = V.pos;
  const def = { ax: { w: X, h: Y, f: (i, j, d) => [X - 1 - i, Y - 1 - j, pz + d], ax: 2, sw: sp[0], sh: sp[1] },
    co: { w: X, h: Z, f: (i, j, d) => [X - 1 - i, py + d, Z - 1 - j], ax: 1, sw: sp[0], sh: sp[2] },
    sa: { w: Y, h: Z, f: (i, j, d) => [px + d, Y - 1 - i, Z - 1 - j], ax: 0, sw: sp[1], sh: sp[2] } }[p];
  const half = V.mip ? Math.max(0, Math.round(V.mip / 2 / sp[def.ax])) : 0;
  const seqs = V.seq === 'FUSION' ? ['T1', 'T2', 'PD'] : [V.seq];
  const ch = seqs.map(() => new Float32Array(def.w * def.h));
  const ov = V.labels ? new Uint8Array(def.w * def.h) : V.tmaps ? new Float32Array(def.w * def.h) : null;
  for (let j = 0; j < def.h; j++) for (let i = 0; i < def.w; i++) {
    seqs.forEach((s, c) => { let v = 0; for (let d = -half; d <= half; d++) { const [x, y, z] = def.f(i, j, d); const u = sample(V, s, x, y, z); if (u > v) v = u; } ch[c][j * def.w + i] = v; });
    if (ov) { const [x, y, z] = def.f(i, j, 0); if (x >= 0 && y >= 0 && z >= 0 && x < X && y < Y && z < Z) { const o = (z * Y + y) * X + x; ov[j * def.w + i] = V.labels ? V.labels[o] : V.tmaps[V.con][o]; } }
  }
  const lo = V.wl - V.ww / 2, im = new ImageData(def.w, def.h), N = def.w * def.h;
  const wl = (v) => Math.max(0, Math.min(255, ((v - lo) / V.ww) * 255));
  const f = ch.map((c) => filterGrey(c.map(wl), def.w, def.h, V.filter));
  if (seqs.length === 3) { for (let i = 0; i < N; i++) { im.data[i * 4] = f[0][i]; im.data[i * 4 + 1] = f[1][i]; im.data[i * 4 + 2] = f[2][i]; im.data[i * 4 + 3] = 255; } }
  else { const L = lut(V.cmap); for (let i = 0; i < N; i++) { const x = Math.max(0, Math.min(255, f[0][i])) | 0; im.data[i * 4] = L[x * 3]; im.data[i * 4 + 1] = L[x * 3 + 1]; im.data[i * 4 + 2] = L[x * 3 + 2]; im.data[i * 4 + 3] = 255; } }
  if (ov && V.ovOp > 0) for (let i = 0; i < N; i++) {
    let c = null;
    if (V.labels) { const k = ov[i]; if (k && !V.hide.has(k)) c = labCol(k); }
    else { const t = ov[i]; if (t >= V.thr) { const u = Math.min(1, (t - V.thr) / 4); c = [255, Math.round(80 + 175 * u), Math.round(40 * u)]; } else if (V.neg && t <= -V.thr) { const u = Math.min(1, (-t - V.thr) / 4); c = [40, Math.round(120 + 100 * u), 255]; } }
    if (c) for (let k = 0; k < 3; k++) im.data[i * 4 + k] = Math.round(im.data[i * 4 + k] * (1 - V.ovOp) + c[k] * V.ovOp);
  }
  return { im, def };
}

function drawAll(host, V) {
  if (!V.pos) return;
  for (const p of ['ax', 'co', 'sa']) {
    const cv = $(`[data-cv="${p}"]`, host), cell = cv.parentElement;
    if (V.big && V.big !== p) { cell.hidden = true; continue; } cell.hidden = false;
    const r = cell.getBoundingClientRect(); cv.width = Math.max(10, r.width); cv.height = Math.max(10, r.height);
    const { im, def } = plane(V, p);
    const off = document.createElement('canvas'); off.width = def.w; off.height = def.h; off.getContext('2d').putImageData(im, 0, 0);
    // fit with the true aspect ratio (pixel spacing may differ per axis)
    const ar = (def.w * def.sw) / (def.h * def.sh), s = Math.min(cv.width / ar, cv.height) * V.zoom[p];
    const W = s * ar, H = s, ox = (cv.width - W) / 2 + V.pan[p][0], oy = (cv.height - H) / 2 + V.pan[p][1];
    const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height); g.imageSmoothingEnabled = $('#ms-smooth', host).checked;
    g.drawImage(off, ox, oy, W, H);
    cv._map = { ox, oy, W, H, def };
    const [X, Y, Z] = dims(V), [px, py, pz] = V.pos;
    if ($('#ms-cross', host).checked) {
      const ci = { ax: [X - 1 - px, Y - 1 - py], co: [X - 1 - px, Z - 1 - pz], sa: [Y - 1 - py, Z - 1 - pz] }[p];
      const cx = ox + ((ci[0] + 0.5) / def.w) * W, cy = oy + ((ci[1] + 0.5) / def.h) * H;
      g.strokeStyle = 'rgba(76,201,240,0.7)'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx, oy); g.lineTo(cx, oy + H); g.moveTo(ox, cy); g.lineTo(ox + W, cy); g.stroke();
    }
    { const pa = { ax: 2, co: 1, sa: 0 }[p]; g.font = '12px system-ui';
      V.marks.forEach((m, i) => { if (Math.abs(m.v[pa] - V.pos[pa]) > 1) return; const ci = { ax: [X - 1 - m.v[0], Y - 1 - m.v[1]], co: [X - 1 - m.v[0], Z - 1 - m.v[2]], sa: [Y - 1 - m.v[1], Z - 1 - m.v[2]] }[p];
        const mx = ox + ((ci[0] + 0.5) / def.w) * W, my = oy + ((ci[1] + 0.5) / def.h) * H; g.fillStyle = '#ff5d8f'; g.beginPath(); g.arc(mx, my, 5, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.stroke(); g.fillStyle = '#fff'; g.fillText(`${i + 1} ${m.label}`, mx + 8, my - 6);
        if (m.note && $('#ms-notes', host)?.checked) callout(g, mx, my, m.note, cv.width); }); }
    if (V.meas && V.meas.p === p) { const m = V.meas; g.strokeStyle = '#ffd166'; g.lineWidth = 2; g.beginPath(); g.moveTo(m.a[0], m.a[1]); g.lineTo(m.b[0], m.b[1]); g.stroke(); g.fillStyle = '#ffd166'; g.font = '13px system-ui'; g.fillText(`${m.mm.toFixed(1)} mm`, m.b[0] + 8, m.b[1]); }
    const [n, k] = { ax: [Z, pz], co: [Y, py], sa: [X, px] }[p];
    $(`[data-l="${p}"]`, host).textContent = `${{ ax: 'Axial', co: 'Coronal', sa: 'Sagittal' }[p]} · slice ${k + 1}/${n}${V.mip ? ` · MIP ${V.mip} mm` : ''}`;
    const O = { ax: ['A', 'P', 'R', 'L'], co: ['S', 'I', 'R', 'L'], sa: ['S', 'I', 'A', 'P'] }[p];
    ['t', 'b', 'l', 'r'].forEach((e, i) => { $(`[data-o="${p}-${e}"]`, host).textContent = O[i]; });
  }
}
function info(host, V) {
  const m = meta(V), sp = spacing(V), [X, Y, Z] = dims(V);
  $('#ms-sub-info', host).textContent = `${V.idx.seqs[V.seq] || SEQ[V.seq]} · ${X}×${Y}×${Z} voxels · ${sp.map((v) => v.toFixed(2)).join(' × ')} mm · site ${m.site}`;
  const [X0, Y0, Z0] = dims(V), oi = (V.pos[2] * Y0 + V.pos[1]) * X0 + V.pos[0];
  const extra = V.labels ? `<br><b>Structure at crosshair:</b> ${V.labels[oi] ? esc(V.labelNames[V.labels[oi] - 1].replace(/_/g, ' ')) : 'none labelled'}` : V.fm ? `<br><b>t (${esc(V.fm.contrasts[V.con])}):</b> ${V.tmaps[V.con][oi].toFixed(2)}<br><canvas id="ms-ts" width="420" height="130"></canvas><br><small>Signal at the crosshair over the run (yellow); pink = face blocks, blue = house blocks, grey = scrambled, gold = other objects.</small>` : '';
  $('#ms-info', host).innerHTML = (V.focusK && V.organHtml ? V.organHtml : '') + `<div class="fine"><b>Crosshair</b>${extra}<br>voxel ${V.pos.join(', ')}<br>${V.pos.map((v, i) => (v * sp[i]).toFixed(1)).join(', ')} mm from the volume corner<br><br><b>${esc(SEQ[V.seq])}</b><br>${V.seq === 'FUSION' ? 'Each colour channel is one sequence; tissues that differ between sequences show up as different colours. The IXI sequences are not co-registered, so T2 and PD are aligned to T1 by head bounding box (approximate: expect some edge mismatch).' : V.seq === 'MRA' ? 'Flowing blood is bright. Raise the MIP slab to see vessels as a projection.' : ''}<br><br><button class="ghost-btn" id="ms-learn">Read about MRI (StatPearls)</button></div>`;
  timeSeries(host, V);
  $('#ms-org-off', host)?.addEventListener('click', (e) => { e.preventDefault(); V.focusK = null; V.hide.clear(); overlayUI(host, V, () => drawAll(host, V)); drawAll(host, V); info(host, V); });
  $('#ms-learn', host).onclick = async () => {
    const r = await (await fetch('/api/clinical/search?q=magnetic%20resonance&type=all&limit=8')).json();
    $('#ms-info', host).insertAdjacentHTML('beforeend', `<ul class="fine">${r.map((x) => `<li><a href="#clinical" data-cl="${esc(x.id)}">${esc(x.title)}</a></li>`).join('') || '<li>no chapter found</li>'}</ul>`);
    $('#ms-info', host).querySelectorAll('[data-cl]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); host.hidden = true; location.hash = '#clinical'; import('./clinical.js').then((mm) => mm.startClinical(a.dataset.cl)); }));
  };
}
function bindCanvas(cv, host, V, draw) {
  const p = cv.dataset.cv;
  const toVox = (e) => { const M = cv._map; if (!M) return null; const r = cv.getBoundingClientRect(); const i = Math.floor(((e.clientX - r.left - M.ox) / M.W) * M.def.w), j = Math.floor(((e.clientY - r.top - M.oy) / M.H) * M.def.h); if (i < 0 || j < 0 || i >= M.def.w || j >= M.def.h) return null; return M.def.f(i, j, 0); };
  let drag = null;
  cv.addEventListener('pointerdown', (e) => { const r = cv.getBoundingClientRect(); drag = { x: e.clientX - r.left, y: e.clientY - r.top, lx: e.clientX - r.left, ly: e.clientY - r.top, moved: false, btn: e.button }; if (e.button === 1) e.preventDefault(); });
  cv.addEventListener('pointermove', (e) => {
    if (!drag && (V.labels || V.tmaps)) { const v = toVox(e); const [X, Y] = dims(V); if (v) { const o = (v[2] * Y + v[1]) * X + v[0]; cv.title = V.labels ? (V.labels[o] ? V.labelNames[V.labels[o] - 1].replace(/_/g, ' ') : '') : `t = ${V.tmaps[V.con][o]?.toFixed(2)}`; } }
    if (!drag) return; const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (Math.hypot(x - drag.x, y - drag.y) < 4 && !drag.moved) return; drag.moved = true;
    if (V.tool === 'pan' || drag.btn === 1) { const ks = $('#ms-zlink', host)?.checked ? ['ax', 'co', 'sa'] : [p]; ks.forEach((k) => { V.pan[k][0] += x - drag.lx; V.pan[k][1] += y - drag.ly; }); drag.lx = x; drag.ly = y; draw(); return; }
    if (V.tool !== 'meas' && !V.big) return;
    const M = cv._map, mmPerPx = [(M.def.w * M.def.sw) / M.W, (M.def.h * M.def.sh) / M.H];
    V.meas = { p, a: [drag.x, drag.y], b: [x, y], mm: Math.hypot((x - drag.x) * mmPerPx[0], (y - drag.y) * mmPerPx[1]) };
    $('#ms-meas', host).textContent = `Measured ${V.meas.mm.toFixed(1)} mm in the ${{ ax: 'axial', co: 'coronal', sa: 'sagittal' }[p]} plane (scanner voxel spacing).`; draw();
  });
  cv.addEventListener('pointerup', (e) => {
    if (drag && !drag.moved) { const v = toVox(e); if (v) { const vv = v.map((x, i) => Math.max(0, Math.min(dims(V)[i] - 1, x)));
      if (V.tool === 'mark') { const lbl = prompt('Label for this point', `Point ${V.marks.length + 1}`); if (lbl !== null) { const note = prompt('Floating note (optional): a finding, a question, what you see here', '') || ''; const [X0, Y0] = dims(V), o = (vv[2] * Y0 + vv[1]) * X0 + vv[0]; V.marks.push({ v: vv, label: lbl || `Point ${V.marks.length + 1}`, note, plane: p, seq: V.seq, structure: V.labels?.[o] ? V.labelNames[V.labels[o] - 1].replace(/_/g, ' ') : null, t: new Date().toISOString() }); saveMarks(V); renderMarks(host, V, draw); } }
      V.pos = vv; info(host, V); draw(); } }
    drag = null; });
  cv.addEventListener('wheel', (e) => { e.preventDefault();
    if (e.ctrlKey) { const r = cv.getBoundingClientRect(), mx = e.clientX - r.left - cv.width / 2, my = e.clientY - r.top - cv.height / 2, f = e.deltaY > 0 ? 0.85 : 1.18;
      const ks = $('#ms-zlink', host)?.checked ? ['ax', 'co', 'sa'] : [p];
      ks.forEach((k) => { const z0 = V.zoom[k], z1 = Math.max(1, Math.min(12, z0 * f)), q = z1 / z0; if (k === p) { V.pan[k][0] = mx - (mx - V.pan[k][0]) * q; V.pan[k][1] = my - (my - V.pan[k][1]) * q; } else { V.pan[k][0] *= q; V.pan[k][1] *= q; } V.zoom[k] = z1; if (z1 === 1) V.pan[k] = [0, 0]; });
      draw(); return; }
    const ax = { ax: 2, co: 1, sa: 0 }[p]; V.pos[ax] = Math.max(0, Math.min(dims(V)[ax] - 1, V.pos[ax] + (e.deltaY > 0 ? -1 : 1))); info(host, V); draw(); }, { passive: false });
}

// ---- marked points (3D voxels), saved per scan in this browser
const mkKey = (V) => `ms-marks:${V.coll}:${V.sub}`;
function loadMarks(V) { try { V.marks = JSON.parse(localStorage.getItem(mkKey(V)) || '[]'); } catch { V.marks = []; } }
function saveMarks(V) { try { localStorage.setItem(mkKey(V), JSON.stringify(V.marks)); } catch { /* storage blocked */ } }
function markExport(V) { const sp = spacing(V); return { collection: V.coll, subject: V.sub, spacing_mm: sp, points: V.marks.map((m) => ({ label: m.label, note: m.note || '', voxel: m.v, mm: m.v.map((x, i) => +(x * sp[i]).toFixed(1)), structure: m.structure, sequence: m.seq, created: m.t })) }; }
function renderMarks(host, V, draw) {
  const ul = $('#ms-marks', host); if (!ul) return; $('#ms-mk-n', host).textContent = `(${V.marks.length})`;
  const sp = spacing(V);
  ul.innerHTML = V.marks.map((m, i) => `<li><a href="#" data-go="${i}">${i + 1}. ${esc(m.label)}</a> <small>${m.v.join(',')}${m.structure ? ` · ${esc(m.structure)}` : ''}</small>${m.note ? ` <small class="ms-note">📝 ${esc(m.note)}</small>` : ''} <a href="#" data-ed="${i}" title="Edit note">✎</a> ${i ? `<small>· ${Math.hypot(...m.v.map((x, k) => (x - V.marks[i - 1].v[k]) * sp[k])).toFixed(1)} mm from ${i}</small>` : ''} <a href="#" data-rm="${i}">✕</a></li>`).join('');
  ul.querySelectorAll('[data-go]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); V.pos = [...V.marks[+a.dataset.go].v]; info(host, V); draw(); }));
  ul.querySelectorAll('[data-ed]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); const m = V.marks[+a.dataset.ed], t = prompt('Floating note', m.note || ''); if (t !== null) { m.note = t; saveMarks(V); renderMarks(host, V, draw); draw(); } }));
  ul.querySelectorAll('[data-rm]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); V.marks.splice(+a.dataset.rm, 1); saveMarks(V); renderMarks(host, V, draw); draw(); }));
}

function overlayUI(host, V, draw) {
  const el = $('#ms-ov', host);
  if (V.labels) {
    const names = V.labelNames, present = V.idx.subjects[V.sub]._labels.present;
    el.innerHTML = `<label class="fine">Label opacity <input id="ms-op" type="range" min="0" max="100" value="${Math.round(V.ovOp * 100)}"></label>
      <p class="fine">${present.length} of ${names.length} structures present in this scan. Click a name to hide or show it; hover the image to name what is under the pointer.</p>
      <p class="fine"><b>Organ explorer:</b> click a name to isolate it, jump to its centre and read its MRI notes; click the colour square to hide or show it.</p>
      <ul class="ms-leg">${present.map((k) => { const c = labCol(k), st = V.lstat?.[k]; return `<li data-k="${k}" class="${V.hide.has(k) ? 'off' : ''} ${V.focusK === k ? 'on' : ''}"><i data-eye="${k}" style="background:rgb(${c.join(',')})"></i><span data-org="${k}">${esc(names[k - 1].replace(/_/g, ' '))}</span>${st ? `<small> ${st.ml >= 10 ? st.ml.toFixed(0) : st.ml >= 1 ? st.ml.toFixed(1) : st.ml.toFixed(2)} mL</small>` : ''}</li>`; }).join('')}</ul>
      <p class="btnrow"><button class="ghost-btn" id="ms-allon">All</button><button class="ghost-btn" id="ms-alloff">None</button></p>`;
    el.querySelectorAll('[data-eye]').forEach((i) => (i.onclick = (e) => { e.stopPropagation(); const k = +i.dataset.eye; V.hide.has(k) ? V.hide.delete(k) : V.hide.add(k); i.parentElement.classList.toggle('off'); draw(); }));
    el.querySelectorAll('[data-org]').forEach((sp) => (sp.onclick = () => focusOrgan(host, V, draw, +sp.dataset.org)));
    $('#ms-allon', host).onclick = () => { V.hide.clear(); V.focusK = null; overlayUI(host, V, draw); draw(); };
    $('#ms-alloff', host).onclick = () => { present.forEach((k) => V.hide.add(k)); overlayUI(host, V, draw); draw(); };
  } else if (V.fm) {
    el.innerHTML = `<label class="fine">Contrast <select id="ms-con">${V.fm.contrasts.map((c, i) => `<option value="${i}" ${i === V.con ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
      <label class="fine">t threshold <input id="ms-thr" type="range" min="20" max="100" value="${V.thr * 10}"> <span id="ms-thrv" class="mono">${V.thr.toFixed(1)}</span></label>
      <label class="fine">Overlay opacity <input id="ms-op" type="range" min="0" max="100" value="${Math.round(V.ovOp * 100)}"></label>
      <label class="fine"><input type="checkbox" id="ms-neg" ${V.neg ? 'checked' : ''}> Show negative t (blue)</label>
      <p class="btnrow"><button class="ghost-btn" id="ms-peak">Go to peak of this contrast</button></p>
      <label class="fine">Time point <input id="ms-t" type="range" min="-1" max="${V.fm.T - 1}" value="${V.tIdx}"> <span id="ms-tv" class="mono">mean</span></label>
      <p class="fine muted">${esc(V.fm.method)}</p><p class="fine muted">${esc(V.fm.source)}</p>`;
    $('#ms-con', host).onchange = (e) => { V.con = +e.target.value; draw(); info(host, V); };
    $('#ms-thr', host).oninput = (e) => { V.thr = +e.target.value / 10; $('#ms-thrv', host).textContent = V.thr.toFixed(1); draw(); };
    $('#ms-neg', host).onchange = (e) => { V.neg = e.target.checked; draw(); };
    $('#ms-peak', host).onclick = () => { const tm = V.tmaps[V.con]; let bi = 0; for (let i = 1; i < tm.length; i++) if (tm[i] > tm[bi]) bi = i; const [X, Y] = dims(V); V.pos = [bi % X, Math.floor(bi / X) % Y, Math.floor(bi / (X * Y))]; info(host, V); draw(); };
    $('#ms-t', host).oninput = (e) => { V.tIdx = +e.target.value; $('#ms-tv', host).textContent = V.tIdx < 0 ? 'mean' : `${V.tIdx + 1}/${V.fm.T} · ${(V.tIdx * V.fm.tr_s).toFixed(1)} s`; draw(); info(host, V); };
  } else el.innerHTML = '';
  const op = $('#ms-op', host); if (op) op.oninput = (e) => { V.ovOp = +e.target.value / 100; draw(); };
}
function timeSeries(host, V) {
  const cv = $('#ms-ts', host); if (!cv || !V.fm) return;
  const g = cv.getContext('2d'), W = cv.width, H = cv.height, T = V.fm.T, tr = V.fm.tr_s, [X, Y, Z] = dims(V), [x, y, z] = V.pos;
  const sig = []; for (let t = 0; t < T; t++) sig.push(V.bold[((t * Z + z) * Y + y) * X + x]);
  const lo = Math.min(...sig), hi = Math.max(...sig) || 1, px = (t) => 30 + (t / (T - 1)) * (W - 40), py = (v) => H - 18 - ((v - lo) / (hi - lo || 1)) * (H - 30);
  g.clearRect(0, 0, W, H); g.fillStyle = '#050c18'; g.fillRect(0, 0, W, H);
  const COL = { face: 'rgba(255,93,143,0.35)', house: 'rgba(76,201,240,0.35)', scrambledpix: 'rgba(160,160,160,0.25)' };
  for (const e of V.fm.events) { g.fillStyle = COL[e.trial_type] || 'rgba(255,209,102,0.18)'; const a = px(e.onset / tr), b = px((e.onset + e.duration) / tr); g.fillRect(a, 4, Math.max(1, b - a), H - 22); }
  g.strokeStyle = '#e9ff70'; g.lineWidth = 1.5; g.beginPath(); sig.forEach((v, t) => (t ? g.lineTo(px(t), py(v)) : g.moveTo(px(t), py(v)))); g.stroke();
  if (V.tIdx >= 0) { g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(px(V.tIdx), 4); g.lineTo(px(V.tIdx), H - 18); g.stroke(); }
  g.fillStyle = '#9fc0e0'; g.font = '10px system-ui'; g.fillText('0 s', 26, H - 4); g.fillText(`${((T - 1) * tr).toFixed(0)} s`, W - 34, H - 4);
}

// bounding box (in voxels, x y z) of the head: voxels above 12% of the 8-bit range, 0.5th-99.5th percentile per axis
function headBox(V, s) {
  const m = meta(V, s), [Z, Y, X] = m.shape_zyx, v = V.vols[s], hx = new Float64Array(X), hy = new Float64Array(Y), hz = new Float64Array(Z); let n = 0;
  for (let z = 0; z < Z; z += 2) for (let y = 0; y < Y; y += 2) for (let x = 0; x < X; x += 2) if (v[(z * Y + y) * X + x] > 30) { hx[x]++; hy[y]++; hz[z]++; n++; }
  const q = (h) => { let c = 0, lo = 0, hi = h.length - 1; for (let i = 0; i < h.length; i++) { c += h[i]; if (c < n * 0.005) lo = i; if (c < n * 0.995) hi = i; } return [lo, hi]; };
  const [x0, x1] = q(hx), [y0, y1] = q(hy), [z0, z1] = q(hz);
  return { lo: [x0, y0, z0], hi: [x1, y1, z1] };
}

// ------------------------------------------------------------------ 4x4 helpers
function mul4(A, B) { return A.map((r, i) => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0))); }
function inv4(m) { // Gauss-Jordan
  const a = m.map((r, i) => [...r, ...[0, 1, 2, 3].map((j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < 4; c++) {
    let p = c; for (let r = c + 1; r < 4; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r; [a[c], a[p]] = [a[p], a[c]];
    const d = a[c][c]; for (let k = 0; k < 8; k++) a[c][k] /= d;
    for (let r = 0; r < 4; r++) if (r !== c) { const f = a[r][c]; for (let k = 0; k < 8; k++) a[r][k] -= f * a[c][k]; }
  }
  return a.map((r) => r.slice(4));
}

// ------------------------------------------------------------------ organ explorer
// per-label voxel count, centroid and bounding box (one pass over the label volume); volume in mL from voxel spacing
function labelStats(V) {
  const [X, Y, Z] = dims(V), sp = spacing(V), L = V.labels, st = {};
  for (let z = 0; z < Z; z++) for (let y = 0; y < Y; y++) { const row = (z * Y + y) * X; for (let x = 0; x < X; x++) { const k = L[row + x]; if (!k) continue;
    let s = st[k]; if (!s) s = st[k] = { n: 0, sx: 0, sy: 0, sz: 0, lo: [x, y, z], hi: [x, y, z] };
    s.n++; s.sx += x; s.sy += y; s.sz += z; if (x < s.lo[0]) s.lo[0] = x; if (y < s.lo[1]) s.lo[1] = y; if (z < s.lo[2]) s.lo[2] = z; if (x > s.hi[0]) s.hi[0] = x; if (y > s.hi[1]) s.hi[1] = y; if (z > s.hi[2]) s.hi[2] = z; } }
  const vml = (sp[0] * sp[1] * sp[2]) / 1000;
  for (const s of Object.values(st)) { s.c = [Math.round(s.sx / s.n), Math.round(s.sy / s.n), Math.round(s.sz / s.n)]; s.ml = s.n * vml; s.ext = [0, 1, 2].map((i) => (s.hi[i] - s.lo[i] + 1) * sp[i]); }
  return st;
}
function focusOrgan(host, V, draw, k) {
  const present = V.idx.subjects[V.sub]._labels.present, st = V.lstat?.[k]; if (!st) return;
  if (V.focusK === k) { V.focusK = null; V.hide.clear(); } else { V.focusK = k; V.hide = new Set(present.filter((x) => x !== k)); V.pos = [...st.c]; }
  overlayUI(host, V, draw); draw();
  if (!V.focusK) { info(host, V); return; }
  const raw = V.labelNames[k - 1], stem = raw.replace(/_(left|right)$/, ''), name = raw.replace(/_/g, ' '), n = NOTES?.notes?.[`organ:${stem}`];
  const qs = (arr) => (arr || []).map((x) => `<li><span class="ts-qt">“${esc(x.text)}”</span> <small class="ts-src">${esc(x.title)} · ${esc(x.licence || '')}</small></li>`).join('');
  const sec = (kd, h) => (n?.quotes?.[kd]?.length ? `<details ${kd === 'mri' ? 'open' : ''}><summary><b>${h}</b> <small>${n.quotes[kd].length}</small></summary><ul class="ts-q">${qs(n.quotes[kd])}</ul></details>` : '');
  V.organHtml = (`<div class="ms-organ"><h3>${esc(name)}</h3>
    <p class="fine mono">${st.ml >= 1 ? st.ml.toFixed(1) : st.ml.toFixed(2)} mL · ${st.n.toLocaleString()} voxels · extent ${st.ext.map((v) => v.toFixed(0)).join(' × ')} mm (R-L × A-P × S-I) · centre voxel ${st.c.join(', ')}</p>
    <p class="fine">Measured from this scan's label volume and voxel spacing (TotalSegmentator MRI labels): one person, not a normal range.</p>
    ${sec('mri', 'How it looks on MRI')}${sec('findings', 'Findings and problems')}${sec('differential', 'Telling conditions apart')}
    ${n && !Object.values(n.quotes).some((v) => v.length) ? '<p class="fine muted">No quoted MRI sentence for this structure in the local open texts.</p>' : ''}
    <p class="fine">Quoted unchanged from StatPearls / NCBI Bookshelf / OpenStax (licence per quote). <a href="#" id="ms-org-off">Show all structures</a></p></div><hr>`);
  info(host, V);
}
// floating note: a small box with wrapped text next to a marked point
function callout(g, x, y, text, cw) {
  g.font = '12px system-ui'; const maxW = 190, words = String(text).split(/\s+/), lines = []; let cur = '';
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur); lines.splice(5);
  const w = Math.min(maxW, Math.max(...lines.map((l) => g.measureText(l).width))) + 12, h = lines.length * 15 + 8;
  let bx = x + 14, by = y + 10; if (bx + w > cw - 4) bx = x - 14 - w;
  g.strokeStyle = 'rgba(255,93,143,0.9)'; g.beginPath(); g.moveTo(x, y); g.lineTo(bx, by + 6); g.stroke();
  g.fillStyle = 'rgba(8,10,24,0.88)'; g.fillRect(bx, by, w, h); g.strokeRect(bx, by, w, h);
  g.fillStyle = '#fff'; lines.forEach((l, i) => g.fillText(l, bx + 6, by + 16 + i * 15));
}
