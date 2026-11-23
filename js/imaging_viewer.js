// Big-view imaging viewer: double-click any test image in the Imaging gallery.
// Zoom (wheel, +/-), pan (drag), window/level, invert, smoothing; for 3D
// volumes a plane and slice; tools to drop labelled points, measure lines and
// write notes. Every change is saved automatically to
// data/anatomy_lab/annotations/<task>/<n>.json through the local server, with
// the image's context (dataset, modality, question, truth, model output) so a
// saved label always says what the image is and why it is shown.
//
// Images are held-out TEST examples of open research datasets (MedMNIST v3,
// IXI). There is no upload: it does not open anyone's own scan.

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let DS = null;

// colour maps: anchor colours of the published matplotlib maps (viridis, inferno), interpolated to 256 steps
const ANCH = {
  grey: ['#000000', '#ffffff'],
  bone: ['#000000', '#545474', '#a8c8c8', '#ffffff'],
  hot: ['#000000', '#e60000', '#ffd200', '#ffffff'],
  viridis: ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'],
  inferno: ['#000004', '#1b0c41', '#4a0c6b', '#781c6d', '#a52c60', '#cf4446', '#ed6925', '#fb9b06', '#f7d13d', '#fcffa4'],
};
const LUTS = {};
function lut(name) {
  if (LUTS[name]) return LUTS[name];
  const a = ANCH[name].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))), out = new Uint8Array(256 * 3);
  for (let v = 0; v < 256; v++) { const f = (v / 255) * (a.length - 1), i = Math.min(a.length - 2, Math.floor(f)), t = f - i; for (let c = 0; c < 3; c++) out[v * 3 + c] = Math.round(a[i][c] + t * (a[i + 1][c] - a[i][c])); }
  return (LUTS[name] = out);
}
export const CATS = { finding: '#ff5d8f', anatomy: '#4cc9f0', artefact: '#ffd166', question: '#b388ff', note: '#06d6a0' };
const FILTERS = { none: 'None', sharpen: 'Sharpen (unsharp 3×3)', edges: 'Edges (Sobel magnitude)', equalize: 'Histogram equalisation', local: 'Local contrast (8×8 tile equalisation)' };
export { lut, ANCH, FILTERS };

// grey-level filters on a Float32 image (0-255), w x h
export function filterGrey(g, w, h, kind) {
  if (kind === 'none') return g;
  const o = new Float32Array(g.length), at = (x, y) => g[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  if (kind === 'sharpen') { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o[y * w + x] = 5 * at(x, y) - at(x - 1, y) - at(x + 1, y) - at(x, y - 1) - at(x, y + 1); return o; }
  if (kind === 'edges') {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      o[y * w + x] = Math.hypot(gx, gy) / 4;
    }
    return o;
  }
  const eq = (x0, y0, x1, y1, dst) => { const hist = new Float64Array(256); let n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { hist[Math.max(0, Math.min(255, g[y * w + x] | 0))]++; n++; } let c = 0; const cdf = hist.map((v) => ((c += v) / n) * 255); for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) dst[y * w + x] = cdf[Math.max(0, Math.min(255, g[y * w + x] | 0))]; };
  if (kind === 'equalize') { eq(0, 0, w, h, o); return o; }
  const glob = new Float32Array(g.length); eq(0, 0, w, h, glob); // local: 8x8 tiles blended 50/50 with the global result
  const tx = Math.ceil(w / 8), ty = Math.ceil(h / 8);
  for (let y = 0; y < h; y += ty) for (let x = 0; x < w; x += tx) eq(x, y, Math.min(w, x + tx), Math.min(h, y + ty), o);
  for (let i = 0; i < o.length; i++) o[i] = 0.5 * o[i] + 0.5 * glob[i];
  return o;
}

const PLANES = { d: 'Depth plane (slice through axis 0)', r: 'Row plane (axis 1)', c: 'Column plane (axis 2)' };

export async function openViewer(ctx) {
  if (!DS) { try { DS = await (await fetch('/training-4D/rt/imaging/datasets.json', { cache: 'no-store' })).json(); } catch { DS = {}; } }
  let host = $('#img-viewer');
  if (!host) { host = document.createElement('div'); host.id = 'img-viewer'; host.className = 'iv'; document.body.appendChild(host); }
  host.hidden = false;
  const V = new Viewer(host, ctx); await V.show(ctx.k);
  return V;
}

class Viewer {
  constructor(host, ctx) {
    Object.assign(this, ctx); this.host = host;
    host.innerHTML = `
      <div class="iv-top"><div id="iv-head" class="iv-head"></div><div class="iv-nav"><button class="ghost-btn" id="iv-prev" title="Previous (←)">‹</button><span id="iv-pos" class="mono"></span><button class="ghost-btn" id="iv-next" title="Next (→)">›</button><button class="ghost-btn" id="iv-close" title="Close (Esc)">✕</button></div></div>
      <div class="iv-body">
        <div class="iv-stage"><canvas id="iv-cv"></canvas><div id="iv-read" class="iv-read mono"></div></div>
        <aside class="iv-side">
          <h3>View</h3>
          <div class="iv-row"><button class="ghost-btn" id="iv-zin">Zoom +</button><button class="ghost-btn" id="iv-zout">Zoom −</button><button class="ghost-btn" id="iv-fit">Fit</button></div>
          <label class="fine">Window <input id="iv-ww" type="range" min="8" max="255" value="255"></label>
          <label class="fine">Level <input id="iv-wl" type="range" min="0" max="255" value="128"></label>
          <div class="iv-row"><label class="fine"><input type="checkbox" id="iv-inv"> Invert</label><label class="fine"><input type="checkbox" id="iv-smooth"> Smooth</label><button class="ghost-btn" id="iv-wreset">Reset W/L</button></div>
          <label class="fine">Filter <select id="iv-filter">${Object.entries(FILTERS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
          <label class="fine">Colour map <select id="iv-cmap">${Object.keys(ANCH).map((k) => `<option value="${k}">${k}</option>`).join('')}</select></label>
          <p class="fine muted" id="iv-res"></p>
          <div id="iv-vol" hidden>
            <label class="fine">Plane <select id="iv-plane">${Object.entries(PLANES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
            <label class="fine">Slice <input id="iv-slice" type="range" min="0" max="63" value="32"> <span id="iv-sliceval" class="mono"></span></label>
            <p class="fine muted">Mouse wheel + Shift moves through slices. Axis names follow the stored array; the source does not state patient orientation for every set.</p>
          </div>
          <h3>Tools</h3>
          <div class="iv-row" id="iv-tools"><button class="ghost-btn on" data-tool="pan">Pan</button><button class="ghost-btn" data-tool="point">Label point</button><button class="ghost-btn" data-tool="line">Measure</button><button class="ghost-btn" data-tool="angle">Angle</button><button class="ghost-btn" data-tool="roi">ROI</button><button class="ghost-btn" data-tool="arrow">Arrow</button></div>
          <label class="fine">Category <select id="iv-cat">${Object.keys(CATS).map((k) => `<option value="${k}">${k}</option>`).join('')}</select></label>
          <label class="fine">Label text <input id="iv-text" type="text" placeholder="e.g. opacity, left lower zone" maxlength="120"></label>
          <div class="iv-row"><button class="ghost-btn" id="iv-png">Save image (PNG)</button><button class="ghost-btn" id="iv-json">Export labels (JSON)</button></div>
          <ul id="iv-items" class="iv-items"></ul>
          <label class="fine">Notes <textarea id="iv-note" rows="3" placeholder="What you see, why it matters…"></textarea></label>
          <p class="fine" id="iv-saved">Auto-saved locally.</p>
        </aside>
      </div>`;
    this.cv = $('#iv-cv', host); this.g = this.cv.getContext('2d');
    this.tool = 'pan'; this.z = 1; this.px = 0; this.py = 0; this.ww = 255; this.wl = 128; this.inv = false; this.smooth = false; this.plane = 'd'; this.slice = 32; this.filter = 'none'; this.cmap = 'grey';
    this.bind();
    new ResizeObserver(() => this.resize()).observe(this.cv.parentElement);
  }

  // ---------------------------------------------------------------- load one sample
  async show(k) {
    this.k = (k + this.samples.length) % this.samples.length;
    const s = this.samples[this.k]; this.s = s;
    this.items = []; $('#iv-note', this.host).value = ''; this.draft = null;
    if (s.png) {
      const img = new Image(); img.src = `/training-4D/rt/imaging/${this.task}/${s.hi || s.png}`; await img.decode();
      const n = s.hi ? s.hi_size : (s.native || [64, 64]); // 224 px copy when available, else the native 64 px image (the PNG is a nearest-neighbour 256 px copy)
      const off = document.createElement('canvas'); off.width = n[1]; off.height = n[0];
      const o = off.getContext('2d'); o.imageSmoothingEnabled = false; o.drawImage(img, 0, 0, n[1], n[0]);
      this.src = o.getImageData(0, 0, n[1], n[0]); this.vol = null;
    } else {
      this.vol = new Uint8Array(await (await fetch(`/training-4D/rt/imaging/${this.task}/${s.vol}`)).arrayBuffer());
      this.shape = s.shape; this.slice = Math.floor(s.shape[0] / 2);
    }
    $('#iv-vol', this.host).hidden = !this.vol;
    $('#iv-res', this.host).textContent = s.hi ? `Showing the 224 px copy of this test image (matched to the 64 px original, r = ${s.hi_r}). The model was run on the 64 px version.` : s.png ? 'Native 64 px image (no higher-resolution copy for this set yet).' : '64³ volume as used by the model.';
    this.header(); this.makeSlice(); this.fit();
    try { const r = await fetch(`/training-4D/rt/annotations/${this.task}/${this.k}.json`, { cache: 'no-store' }); if (r.ok) { const a = await r.json(); this.items = a.items || []; $('#iv-note', this.host).value = a.note || ''; $('#iv-saved', this.host).textContent = `Loaded saved labels (${a.saved}).`; } else $('#iv-saved', this.host).textContent = 'No saved labels yet. Anything you add is saved automatically.'; } catch { /* none */ }
    this.listItems(); this.draw();
  }

  context() {
    const m = this.m, s = this.s, d = DS[this.task] || {};
    const labels = d.labels ? Object.values(d.labels) : null;
    const question = this.m.kind === 'regression' ? 'How old is this person, from the brain MRI alone?'
      : this.m.kind === 'multilabel' ? `Which of these findings are present: ${labels.join(', ')}?`
      : `Which class is this: ${labels.join(' / ')}?`;
    const truth = Array.isArray(s.truth) ? (s.truth.join(', ') || 'no finding') : (typeof s.truth === 'number' ? `${s.truth.toFixed(1)} y` : s.truth);
    const pred = this.m.kind === 'regression' ? `${s.pred.toFixed(1)} y` : this.m.kind === 'multilabel' ? Object.entries(s.probs).filter(([, v]) => v >= 0.5).map(([k]) => k).join(', ') || 'none ≥ 50%' : s.pred;
    return { dataset: this.task, title: this.title, modality: m.modality, question, truth, model_output: pred, license: d.license, test_index: s.i,
      why_shown: 'Held-out TEST image of an open research dataset, drawn at random within each class; the model never trained on it.' };
  }
  header() {
    const c = this.context(), d = DS[this.task] || {}, s = this.s;
    const ok = this.m.kind === 'binary' || this.m.kind === 'multiclass' ? (s.truth === s.pred ? '<span class="q good">model correct</span>' : '<span class="q poor">model wrong</span>') : '';
    const top = s.probs ? Object.entries(s.probs).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${esc(k)} ${(v * 100).toFixed(1)}%`).join(' · ') : '';
    $('#iv-head', this.host).innerHTML = `<b>${esc(c.modality)} · ${esc(c.title)}</b> ${ok}
      <div class="fine"><b>Question this dataset asks:</b> ${esc(c.question)}</div>
      <div class="fine"><b>Truth (dataset label):</b> ${esc(c.truth)} · <b>Model:</b> ${esc(c.model_output)}${top ? ` <small>(${top})</small>` : ''}</div>
      <details class="fine"><summary>What this image is and why it is shown</summary>${esc(c.why_shown)} Test-set index ${s.i}. ${esc(d.description || '')} <i>Licence: ${esc(d.license || '—')}. ${esc(d.source || '')}</i> Research and teaching only; not a diagnosis.</details>`;
    $('#iv-pos', this.host).textContent = `${this.k + 1} / ${this.samples.length}`;
  }

  // ---------------------------------------------------------------- image pipeline
  makeSlice() {
    if (!this.vol) { this.img = this.src; return; }
    const [D, H, W] = this.shape, v = this.vol, z = Math.max(0, Math.min(this.slice, (this.plane === 'd' ? D : this.plane === 'r' ? H : W) - 1));
    let w, h, f;
    if (this.plane === 'd') { w = W; h = H; f = (i, j) => v[z * H * W + j * W + i]; }
    else if (this.plane === 'r') { w = W; h = D; f = (i, j) => v[(D - 1 - j) * H * W + z * W + i]; }
    else { w = H; h = D; f = (i, j) => v[(D - 1 - j) * H * W + i * W + z]; }
    const im = new ImageData(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const g = f(i, j), o = (j * w + i) * 4; im.data[o] = im.data[o + 1] = im.data[o + 2] = g; im.data[o + 3] = 255; }
    this.img = im;
    const sl = $('#iv-slice', this.host); sl.max = (this.plane === 'd' ? D : this.plane === 'r' ? H : W) - 1; sl.value = z; $('#iv-sliceval', this.host).textContent = `${z + 1}/${+sl.max + 1}`;
  }
  rendered() { // window/level, filter, invert and colour map applied to a copy at native resolution
    const a = this.img, w = a.width, h = a.height, out = new ImageData(w, h), lo = this.wl - this.ww / 2, N = w * h;
    const rgb = (() => { for (let i = 0; i < a.data.length; i += 4 * 97) if (a.data[i] !== a.data[i + 1] || a.data[i] !== a.data[i + 2]) return true; return false; })();
    const wl = (v) => { const x = ((v - lo) / this.ww) * 255; return x < 0 ? 0 : x > 255 ? 255 : x; };
    if (rgb) { // colour images (fundus, histology): filters per channel, no colour map
      for (let c = 0; c < 3; c++) { const g = new Float32Array(N); for (let i = 0; i < N; i++) g[i] = wl(a.data[i * 4 + c]); const f = filterGrey(g, w, h, this.filter); for (let i = 0; i < N; i++) { const x = Math.max(0, Math.min(255, f[i])); out.data[i * 4 + c] = this.inv ? 255 - x : x; } }
    } else {
      const g = new Float32Array(N); for (let i = 0; i < N; i++) g[i] = wl(a.data[i * 4]);
      const f = filterGrey(g, w, h, this.filter), L = lut(this.cmap);
      for (let i = 0; i < N; i++) { let x = Math.max(0, Math.min(255, f[i])) | 0; if (this.inv) x = 255 - x; out.data[i * 4] = L[x * 3]; out.data[i * 4 + 1] = L[x * 3 + 1]; out.data[i * 4 + 2] = L[x * 3 + 2]; }
    }
    for (let i = 3; i < out.data.length; i += 4) out.data[i] = 255;
    const off = document.createElement('canvas'); off.width = a.width; off.height = a.height; off.getContext('2d').putImageData(out, 0, 0); return off;
  }
  resize() { const r = this.cv.parentElement.getBoundingClientRect(); this.cv.width = r.width; this.cv.height = r.height; this.draw(); }
  fit() { if (!this.img) return; const r = this.cv.parentElement.getBoundingClientRect(); this.z = Math.min(r.width / this.img.width, r.height / this.img.height) * 0.92; this.px = (r.width - this.img.width * this.z) / 2; this.py = (r.height - this.img.height * this.z) / 2; this.draw(); }
  toImg(e) { const r = this.cv.getBoundingClientRect(); return [(e.clientX - r.left - this.px) / this.z, (e.clientY - r.top - this.py) / this.z]; }
  zoomAt(f, cx, cy) { const nz = Math.max(0.5, Math.min(80, this.z * f)); this.px = cx - ((cx - this.px) * nz) / this.z; this.py = cy - ((cy - this.py) * nz) / this.z; this.z = nz; this.draw(); }
  here(it) { return !this.vol || (it.plane === this.plane && it.slice === +$('#iv-slice', this.host).value); }

  draw() {
    if (!this.img) return;
    const g = this.g; g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#000'; g.fillRect(0, 0, this.cv.width, this.cv.height);
    g.imageSmoothingEnabled = this.smooth; g.setTransform(this.z, 0, 0, this.z, this.px, this.py); g.drawImage(this.rendered(), 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    const P = (x, y) => [x * this.z + this.px, y * this.z + this.py];
    const all = this.draft ? [...this.items, this.draft] : this.items;
    g.font = '12px system-ui'; g.lineWidth = 2;
    all.forEach((it, n) => {
      if (!this.here(it)) return;
      g.strokeStyle = g.fillStyle = it === this.draft ? '#ffffff' : (CATS[it.cat] || '#4cc9f0');
      const tag = `${n + 1}. ${this.describe(it)}${it.text ? ' · ' + it.text : ''}`;
      if (it.type === 'point') { const [x, y] = P(it.x, it.y); g.beginPath(); g.arc(x, y, 5, 0, 7); g.stroke(); g.fillText(`${n + 1}. ${it.text || ''}`, x + 8, y - 6); }
      else if (it.type === 'angle') { const pts = it.pts.map(([a, b]) => P(a, b)); g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); const [x, y] = pts[1] || pts[0]; g.fillText(tag, x + 8, y - 8); }
      else if (it.type === 'roi') { const [x1, y1] = P(it.x1, it.y1), [x2, y2] = P(it.x2, it.y2); g.beginPath(); g.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, 7); g.stroke(); g.fillText(tag, Math.max(x1, x2) + 6, Math.min(y1, y2)); }
      else if (it.type === 'arrow') { const [x1, y1] = P(it.x1, it.y1), [x2, y2] = P(it.x2, it.y2), a = Math.atan2(y2 - y1, x2 - x1); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x2 - 12 * Math.cos(a - 0.4), y2 - 12 * Math.sin(a - 0.4)); g.moveTo(x2, y2); g.lineTo(x2 - 12 * Math.cos(a + 0.4), y2 - 12 * Math.sin(a + 0.4)); g.stroke(); g.fillText(`${n + 1}. ${it.text || ''}`, x1 + 6, y1 - 6); }
      else { const [x1, y1] = P(it.x1, it.y1), [x2, y2] = P(it.x2, it.y2); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.fillText(tag, x2 + 8, y2); }
    });
    $('#iv-read', this.host).textContent = `zoom ${(this.z).toFixed(2)}× · W ${this.ww} L ${this.wl}${this.inv ? ' · inverted' : ''} · ${this.img.width}×${this.img.height} px native`;
  }

  // ---------------------------------------------------------------- annotations
  describe(it) {
    if (it.type === 'line') return `${Math.hypot(it.x2 - it.x1, it.y2 - it.y1).toFixed(1)} px`;
    if (it.type === 'angle' && it.pts.length === 3) { const [a, b, c] = it.pts, v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]]; return `${((Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2) || 1)))) * 180) / Math.PI).toFixed(1)}°`; }
    if (it.type === 'roi' && it.stats) return `mean ${it.stats.mean.toFixed(1)} · SD ${it.stats.sd.toFixed(1)} · ${it.stats.n} px`;
    return it.type;
  }
  roiStats(it) { // statistics of the ORIGINAL pixel values (first channel) inside the ellipse
    const cx = (it.x1 + it.x2) / 2, cy = (it.y1 + it.y2) / 2, rx = Math.abs(it.x2 - it.x1) / 2, ry = Math.abs(it.y2 - it.y1) / 2, a = this.img; let n = 0, s = 0, s2 = 0, mn = 255, mx = 0;
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      if (x < 0 || y < 0 || x >= a.width || y >= a.height || ((x + 0.5 - cx) / (rx || 1)) ** 2 + ((y + 0.5 - cy) / (ry || 1)) ** 2 > 1) continue;
      const v = a.data[(y * a.width + x) * 4]; n++; s += v; s2 += v * v; mn = Math.min(mn, v); mx = Math.max(mx, v);
    }
    return n ? { n, mean: s / n, sd: Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2)), min: mn, max: mx } : { n: 0, mean: 0, sd: 0, min: 0, max: 0 };
  }
  listItems() {
    const ul = $('#iv-items', this.host);
    ul.innerHTML = this.items.map((it, n) => `<li><span><i class="sw" style="background:${CATS[it.cat] || '#4cc9f0'}"></i>${n + 1}. ${it.type === 'point' ? `point (${it.x.toFixed(1)}, ${it.y.toFixed(1)})` : `${it.type} ${this.describe(it)}`}${it.plane ? ` <small>${it.plane}${it.slice + 1}</small>` : ''} ${it.text ? '· ' + esc(it.text) : ''}</span><button class="ghost-btn" data-del="${n}" title="Delete">✕</button></li>`).join('') || '<li class="muted">No labels yet.</li>';
    ul.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => { this.items.splice(+b.dataset.del, 1); this.listItems(); this.draw(); this.save(); }));
  }
  save() {
    clearTimeout(this._t);
    this._t = setTimeout(async () => {
      const body = { task: this.task, n: this.k, test_index: this.s.i, items: this.items, note: $('#iv-note', this.host).value, context: this.context() };
      try { const r = await (await fetch('/api/annotations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json(); $('#iv-saved', this.host).textContent = r.ok ? `Saved ${r.saved} → data/anatomy_lab/annotations/${this.task}/${this.k}.json` : `Not saved: ${r.error}`; }
      catch (e) { $('#iv-saved', this.host).textContent = `Not saved: ${e.message}`; }
    }, 400);
  }
  stamp(it) { it.cat = $('#iv-cat', this.host).value; if (it.type === 'roi') it.stats = this.roiStats(it); if (this.vol) { it.plane = this.plane; it.slice = +$('#iv-slice', this.host).value; } it.text = $('#iv-text', this.host).value.trim(); return it; }

  // ---------------------------------------------------------------- input
  bind() {
    const H = this.host, cv = this.cv;
    $('#iv-close', H).onclick = () => this.close();
    $('#iv-prev', H).onclick = () => this.show(this.k - 1); $('#iv-next', H).onclick = () => this.show(this.k + 1);
    $('#iv-zin', H).onclick = () => this.zoomAt(1.25, cv.width / 2, cv.height / 2); $('#iv-zout', H).onclick = () => this.zoomAt(0.8, cv.width / 2, cv.height / 2); $('#iv-fit', H).onclick = () => this.fit();
    $('#iv-ww', H).oninput = (e) => { this.ww = +e.target.value; this.draw(); }; $('#iv-wl', H).oninput = (e) => { this.wl = +e.target.value; this.draw(); };
    $('#iv-inv', H).onchange = (e) => { this.inv = e.target.checked; this.draw(); }; $('#iv-smooth', H).onchange = (e) => { this.smooth = e.target.checked; this.draw(); };
    $('#iv-wreset', H).onclick = () => { this.ww = 255; this.wl = 128; $('#iv-ww', H).value = 255; $('#iv-wl', H).value = 128; this.draw(); };
    $('#iv-plane', H).onchange = (e) => { this.plane = e.target.value; this.slice = Math.floor(this.shape[{ d: 0, r: 1, c: 2 }[this.plane]] / 2); this.makeSlice(); this.fit(); };
    $('#iv-slice', H).oninput = (e) => { this.slice = +e.target.value; this.makeSlice(); this.draw(); };
    $('#iv-note', H).oninput = () => this.save();
    $('#iv-filter', H).onchange = (e) => { this.filter = e.target.value; this.draw(); };
    $('#iv-cmap', H).onchange = (e) => { this.cmap = e.target.value; this.draw(); };
    $('#iv-png', H).onclick = () => { const a = document.createElement('a'); a.download = `${this.task}_${this.k}.png`; a.href = this.cv.toDataURL('image/png'); a.click(); };
    $('#iv-json', H).onclick = () => { const a = document.createElement('a'); a.download = `${this.task}_${this.k}_labels.json`; a.href = URL.createObjectURL(new Blob([JSON.stringify({ context: this.context(), items: this.items, note: $('#iv-note', H).value }, null, 1)], { type: 'application/json' })); a.click(); };
    H.querySelectorAll('[data-tool]').forEach((b) => (b.onclick = () => { this.tool = b.dataset.tool; H.querySelectorAll('[data-tool]').forEach((x) => x.classList.toggle('on', x === b)); cv.style.cursor = this.tool === 'pan' ? 'grab' : 'crosshair'; }));
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.shiftKey && this.vol) { const sl = $('#iv-slice', H); sl.value = +sl.value + (e.deltaY > 0 ? 1 : -1); this.slice = +sl.value; this.makeSlice(); this.draw(); return; }
      const r = cv.getBoundingClientRect(); this.zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    let drag = null;
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId); const [x, y] = this.toImg(e);
      if (this.tool === 'pan') drag = { x: e.clientX, y: e.clientY, px: this.px, py: this.py };
      else if (this.tool === 'point') { this.items.push(this.stamp({ type: 'point', x, y })); this.listItems(); this.draw(); this.save(); }
      else if (this.tool === 'angle') { // three clicks: arm, vertex, arm
        if (!this.draft || this.draft.type !== 'angle') this.draft = { type: 'angle', pts: [[x, y]] }; else this.draft.pts.push([x, y]);
        if (this.draft.pts.length === 3) { this.items.push(this.stamp(this.draft)); this.draft = null; this.listItems(); this.save(); }
        this.draw();
      }
      else { this.draft = { type: this.tool, x1: x, y1: y, x2: x, y2: y }; }
    });
    cv.addEventListener('pointermove', (e) => {
      const [x, y] = this.toImg(e);
      if (drag) { this.px = drag.px + e.clientX - drag.x; this.py = drag.py + e.clientY - drag.y; this.draw(); }
      else if (this.draft && this.draft.type !== 'angle') { this.draft.x2 = x; this.draft.y2 = y; this.draw(); }
      if (this.img && x >= 0 && y >= 0 && x < this.img.width && y < this.img.height) { const o = (Math.floor(y) * this.img.width + Math.floor(x)) * 4; $('#iv-read', H).textContent = `x ${Math.floor(x)} y ${Math.floor(y)} · value ${this.img.data[o]} · zoom ${this.z.toFixed(2)}×`; }
    });
    cv.addEventListener('pointerup', () => {
      drag = null;
      if (this.draft && this.draft.type !== 'angle') { const d = this.draft; this.draft = null; if (Math.hypot(d.x2 - d.x1, d.y2 - d.y1) > 0.5) { this.items.push(this.stamp(d)); this.listItems(); this.save(); } this.draw(); }
    });
    this._key = (e) => {
      if (H.hidden || e.target.matches('input[type=text], textarea')) return;
      if (e.key === 'Escape') this.close(); else if (e.key === 'ArrowLeft') this.show(this.k - 1); else if (e.key === 'ArrowRight') this.show(this.k + 1);
      else if (e.key === '+' || e.key === '=') this.zoomAt(1.25, cv.width / 2, cv.height / 2); else if (e.key === '-') this.zoomAt(0.8, cv.width / 2, cv.height / 2);
    };
    document.addEventListener('keydown', this._key);
  }
  close() { this.host.hidden = true; document.removeEventListener('keydown', this._key); this.onClose?.(); }
}
