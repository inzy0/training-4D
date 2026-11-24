// Imaging tab: research models trained on open, de-identified datasets
// (MedMNIST v3, CC BY 4.0; IXI brain MRI, CC BY-SA 3.0). Shows real held-out
// test results beside published benchmarks, and test-set examples with the
// true label and the model's output; double-click opens imaging_viewer.js. No upload: this does not read anyone's
// own scan and is not a diagnostic tool.

import { openViewer } from './imaging_viewer.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f3 = (x) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(3));

let M = null;
// MedMNIST 3D benchmark (medmnist.com, read 2026-11-21), AUC / ACC. The table does not state its input size.
const BENCH3D = {
  organmnist3d: { r3d: [0.996, 0.907], acs: [0.994, 0.900] }, nodulemnist3d: { r3d: [0.863, 0.844], acs: [0.873, 0.847] },
  fracturemnist3d: { r3d: [0.712, 0.508], acs: [0.714, 0.497] }, adrenalmnist3d: { r3d: [0.827, 0.721], acs: [0.839, 0.754] },
  vesselmnist3d: { r3d: [0.874, 0.877], acs: [0.930, 0.928] },
  synapsemnist3d: { r3d: [0.820, 0.745], acs: [0.705, 0.722] },
};
export async function startImaging() {
  const host = $('#img-cards');
  try { M = await (await fetch('/training-4D/rt/imaging/metrics.json', { cache: 'no-store' })).json(); } catch { M = null; }
  if (!M || !Object.keys(M).length) { host.innerHTML = '<p class="muted">No trained models yet. Training runs in the background (tools/imaging_train.py); reload this tab when it finishes.</p>'; return; }
  const order = ['pneumoniamnist', 'chestmnist', 'organamnist', 'organcmnist', 'organsmnist', 'organmnist3d', 'nodulemnist3d', 'fracturemnist3d', 'adrenalmnist3d', 'vesselmnist3d', 'breastmnist', 'octmnist', 'ixi_brain_age', 'retinamnist', 'pathmnist', 'bloodmnist', 'tissuemnist', 'synapsemnist3d'];
  const keys = order.filter((k) => M[k]).concat(Object.keys(M).filter((k) => !order.includes(k)));
  host.innerHTML = keys.map((k) => card(M[k])).join('');
  if (!document.getElementById('mri-open')) host.insertAdjacentHTML('beforebegin', `<div class="mri-open-bar"><button id="mri-open" class="primary small">Open MRI studio: full-resolution brain MRI (T1 · T2 · PD · MRA · fusion)</button> <span class="fine muted">Native-resolution scans of healthy volunteers (IXI), millimetre measurements, linked planes, MIP, cine.</span></div>`);
  document.getElementById('mri-open').onclick = () => import('./mri_studio.js').then((m) => m.openMriStudio());
  if (!document.getElementById('micro-open')) document.getElementById('mri-open').insertAdjacentHTML('afterend', ' <button id="micro-open" class="primary small">Open Microscopy lab: stained tissue &amp; blood cells, zoom, notes, identify quiz</button>');
  document.getElementById('micro-open').onclick = () => import('./micro_lab.js').then((m) => m.openMicroLab());
  host.querySelectorAll('[data-task]').forEach((b) => b.addEventListener('click', () => openTask(b.dataset.task)));
  openTask(keys[0]);
}

function card(m) {
  const reg = m.kind === 'regression';
  const res = reg ? `<span><b class="mono">MAE ${m.test.mae_years.toFixed(2)} y</b> · r ${m.test.r.toFixed(3)} <small>(predicting the mean: ${m.baseline.mae_years_predicting_train_mean.toFixed(2)} y)</small></span>`
    : `<span><b class="mono">AUC ${f3(m.test.auc)}</b> · <b class="mono">ACC ${f3(m.test.acc)}</b></span>`;
  const b3 = BENCH3D[m.task];
  const bench = m.bench ? `<small>Published ResNet-18: 28px ${m.bench.res28[0]} / ${m.bench.res28[1]} · 224px ${m.bench.res224[0]} / ${m.bench.res224[1]} (AUC / ACC)</small>`
    : b3 ? `<small>Published: ResNet-18+3D ${b3.r3d[0]} / ${b3.r3d[1]} · ResNet-18+ACS ${b3.acs[0]} / ${b3.acs[1]} (AUC / ACC; input size not stated by the source)</small>`
    : '<small>No published benchmark for this task (own split).</small>';
  const ss = m.seed_summary;
  const seeds = ss ? (reg ? `<small class="seedrow">${ss.n_runs} runs: MAE mean ${ss.mae_years.mean.toFixed(2)} y (range ${ss.mae_years.min.toFixed(2)}–${ss.mae_years.max.toFixed(2)})</small>`
    : `<small class="seedrow">${ss.n_runs} runs: AUC mean ${ss.auc.mean.toFixed(3)} (${ss.auc.min.toFixed(3)}–${ss.auc.max.toFixed(3)}) · ACC mean ${ss.acc.mean.toFixed(3)} (${ss.acc.min.toFixed(3)}–${ss.acc.max.toFixed(3)})</small>`) : '<small class="seedrow">single run</small>';
  return `<button class="img-card" data-task="${m.task}"><span class="mod">${esc(m.modality)}</span><span class="tn">${esc(title(m))}</span>${res}${seeds}<br>${bench}
    <small>test n = ${m.n.test.toLocaleString()} · ${m.input} · best of ${m.epochs} epochs on validation (epoch ${m.best_epoch})</small></button>`;
}
function title(m) {
  const T = { pneumoniamnist: 'Pneumonia vs normal', chestmnist: '14 chest findings (multi-label)', organamnist: 'Organ identification (11)', organcmnist: 'Organ identification (11)',
    organsmnist: 'Organ identification (11)', organmnist3d: 'Organ identification (11)', nodulemnist3d: 'Lung nodule: benign vs malignant', fracturemnist3d: 'Rib fracture type (3)',
    adrenalmnist3d: 'Adrenal: normal vs hyperplasia', vesselmnist3d: 'Vessel vs aneurysm', breastmnist: 'Breast lesion: malignant vs normal/benign', octmnist: 'Retina: 4 classes', ixi_brain_age: 'Brain age from T1 MRI (healthy adults)',
    retinamnist: 'Diabetic retinopathy grade (5)', pathmnist: 'Colon tissue type (9)', bloodmnist: 'Blood cell type (8)', tissuemnist: 'Kidney cell type (8)', synapsemnist3d: 'Synapse: excitatory vs inhibitory' };
  return T[m.task] || m.task;
}

async function openTask(task) {
  document.querySelectorAll('.img-card').forEach((b) => b.classList.toggle('on', b.dataset.task === task));
  const m = M[task]; const g = $('#img-gallery');
  let S = [];
  try { S = await (await fetch(`/training-4D/rt/imaging/${task}/samples.json`, { cache: 'no-store' })).json(); } catch { /* none */ }
  const extra = m.per_label_auc ? `<details><summary class="fine">Per-finding AUC on the test set</summary><p class="fine mono">${Object.entries(m.per_label_auc).map(([k, v]) => `${esc(k)} ${v.toFixed(3)}`).join(' · ')}</p></details>` : '';
  $('#img-detail').innerHTML = `<h2>${esc(m.modality)} · ${esc(title(m))}</h2>
    <p class="fine">Train ${m.n.train.toLocaleString()} · validation ${m.n.val.toLocaleString()} · test ${m.n.test.toLocaleString()} · ${m.minutes} min on GPU · trained ${esc(m.trained || '')}.
    The checkpoint was chosen on validation; the test split was scored once.</p>${extra}`;
  g.innerHTML = S.map((s, k) => {
    const ok = m.kind === 'regression' ? null : m.kind === 'multilabel' ? null : s.truth === s.pred;
    const top = s.probs ? Object.entries(s.probs).sort((a, b) => b[1] - a[1]).slice(0, m.kind === 'multilabel' ? 4 : 3) : [];
    const body = m.kind === 'regression' ? `<div>True age <b class="mono">${s.truth.toFixed(1)}</b> · model <b class="mono">${s.pred.toFixed(1)}</b> <small>(${(s.pred - s.truth >= 0 ? '+' : '')}${(s.pred - s.truth).toFixed(1)} y)</small></div>`
      : `<div>Truth: <b>${esc(Array.isArray(s.truth) ? (s.truth.join(', ') || 'no finding') : s.truth)}</b>${s.pred ? ` · model: <b>${esc(s.pred)}</b>` : ''}</div>
         <div class="probs">${top.map(([k, v]) => `<span><i style="width:${Math.round(v * 100)}%"></i>${esc(k)} ${(v * 100).toFixed(0)}%</span>`).join('')}</div>`;
    return `<figure class="img-item ${ok === true ? 'ok' : ok === false ? 'bad' : ''}" data-k="${k}" title="Double-click for the big view">
      ${s.png ? `<img src="/training-4D/rt/imaging/${task}/${s.png}" alt="test image ${k + 1}" loading="lazy">` : `<canvas class="vol" data-vol="/training-4D/rt/imaging/${task}/${s.vol}" data-shape="${s.shape.join(',')}" width="192" height="64"></canvas><input class="volz" type="range" min="0" max="${s.shape[0] - 1}" value="${Math.floor(s.shape[0] / 2)}" aria-label="Slice">`}
      <figcaption>${ok === true ? '<span class="q good">correct</span>' : ok === false ? '<span class="q poor">wrong</span>' : ''} ${body}<button class="ghost-btn iv-open" data-open="${k}">Open big view</button></figcaption></figure>`;
  }).join('') || '<p class="muted">No samples saved for this model.</p>';
  g.querySelectorAll('canvas.vol').forEach(initVolume);
  const open = (k) => openViewer({ task, m, samples: S, k, title: title(m) });
  g.querySelectorAll('figure.img-item').forEach((f) => f.addEventListener('dblclick', (e) => { if (!e.target.matches('input')) open(+f.dataset.k); }));
  g.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => open(+b.dataset.open)));
  $('#img-detail').insertAdjacentHTML('beforeend', `<p class="fine">${S.length} held-out test images, drawn at random within each class (tools/imaging_export.py). <b>Double-click any image</b> for the big view: zoom, pan, window/level, slices, labels and measurements, saved automatically.</p>`);
}

// three orthogonal slices of a 64^3 uint8 volume side by side; slider moves all three
async function initVolume(cv) {
  const [D, H, W] = cv.dataset.shape.split(',').map(Number);
  const v = new Uint8Array(await (await fetch(cv.dataset.vol)).arrayBuffer());
  const slider = cv.nextElementSibling; const ctx = cv.getContext('2d');
  cv.width = W * 3 + 4; cv.height = Math.max(H, D);
  const draw = () => {
    const z = +slider.value, y = Math.round((z / (D - 1)) * (H - 1)), x = Math.round((z / (D - 1)) * (W - 1));
    const put = (w, h, ox, f) => { const im = ctx.createImageData(w, h); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const g = f(i, j), o = (j * w + i) * 4; im.data[o] = im.data[o + 1] = im.data[o + 2] = g; im.data[o + 3] = 255; } ctx.putImageData(im, ox, 0); };
    put(W, H, 0, (i, j) => v[z * H * W + j * W + i]);                // plane at depth z
    put(W, D, W + 2, (i, k) => v[(D - 1 - k) * H * W + y * W + i]);  // orthogonal plane at row y
    put(H, D, 2 * W + 4, (j, k) => v[(D - 1 - k) * H * W + j * W + x]); // orthogonal plane at column x
  };
  slider.addEventListener('input', draw); draw();
}
