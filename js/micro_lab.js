// Microscopy lab (Imaging tab): stained histology and cell images at 224 px from MedMNIST+ (CC BY 4.0):
// colorectal tissue (H&E, CRC-VAL-HE-7K), peripheral blood cells (May Grünwald-Giemsa, Acevedo et al. 2020) and
// kidney cortex cells (BBBC051). Browse by class, zoom and pan, pin floating notes on an image (saved in this
// browser), quiz yourself on identification, and read quoted identification / differential sentences per class with
// the tests that measure them. Labels are the datasets' own; nothing is diagnosed. Data: tools/imaging_learn_build.py.

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let I = null, NOTES = null, TESTS = null;
const S = { set: 'bloodmnist', cls: null, cur: null, zoom: 1, pan: [0, 0], quiz: null, score: [0, 0], noteMode: false };
const nKey = (set, file) => `micro-notes:${set}/${file}`;
const getNotes = (set, file) => { try { return JSON.parse(localStorage.getItem(nKey(set, file)) || '[]'); } catch { return []; } };
const putNotes = (set, file, v) => { try { localStorage.setItem(nKey(set, file), JSON.stringify(v)); } catch { /* storage blocked */ } };

export async function openMicroLab() {
  [I, NOTES, TESTS] = await Promise.all([fetch('/training-4D/rt/imaging/micro/index.json').then((r) => r.json()), fetch('/training-4D/rt/imaging/organ_notes.json').then((r) => r.json()).catch(() => null),
    TESTS ? TESTS : fetch('/training-4D/rt/clinical/tests.json').then((r) => r.json()).catch(() => null)]);
  let host = $('#micro-lab');
  if (!host) { host = document.createElement('div'); host.id = 'micro-lab'; host.className = 'iv'; document.body.appendChild(host); }
  host.hidden = false;
  render(host);
}

function render(host) {
  const D = I.sets[S.set], labels = D.labels;
  const items = D.items.filter((it) => S.cls === null || it.cls === S.cls);
  host.innerHTML = `<div class="iv-top"><div class="iv-head"><b>Microscopy lab</b> · ${esc(D.title)} · <span class="fine">${esc(D.cite)}</span></div><div class="iv-nav"><button class="ghost-btn" id="ml-close">✕</button></div></div>
    <div class="iv-body ml-body">
      <section class="ml-main">
        <div class="bar">${Object.entries(I.sets).map(([k, v]) => `<button class="chip-btn ${k === S.set ? 'on' : ''}" data-set="${k}">${esc(v.title)}</button>`).join('')}
          <button class="primary small" id="ml-quiz">${S.quiz ? '■ Stop quiz' : '🎯 Identify quiz'}</button> ${S.score[1] ? `<span class="pill">score ${S.score[0]}/${S.score[1]}</span>` : ''}</div>
        <div class="bar"><button class="chip-btn ${S.cls === null ? 'on' : ''}" data-cls="">All classes</button>${Object.entries(labels).map(([k, v]) => `<button class="chip-btn ${S.cls === +k ? 'on' : ''}" data-cls="${k}">${esc(short(v))} <small>${D.items.filter((x) => x.cls === +k).length}</small></button>`).join('')}</div>
        ${S.quiz ? quizHtml(D) : `<div class="ml-grid">${items.map((it) => `<figure class="ml-it ${S.cur === it.file ? 'on' : ''}" data-f="${it.file}"><img src="/training-4D/rt/imaging/micro/${S.set}/${it.file}" alt="${esc(labels[it.cls])}" loading="lazy"><figcaption>${esc(short(labels[it.cls]))}${getNotes(S.set, it.file).length ? ' 📝' : ''}</figcaption></figure>`).join('')}</div>`}
      </section>
      <aside class="iv-side ml-side" id="ml-side">${side(D)}</aside>
    </div>`;
  $('#ml-close', host).onclick = () => { host.hidden = true; };
  host.querySelectorAll('[data-set]').forEach((b) => (b.onclick = () => { S.set = b.dataset.set; S.cls = null; S.cur = null; S.quiz = null; render(host); }));
  host.querySelectorAll('[data-cls]').forEach((b) => (b.onclick = () => { S.cls = b.dataset.cls === '' ? null : +b.dataset.cls; render(host); }));
  host.querySelectorAll('[data-f]').forEach((f) => (f.onclick = () => { S.cur = f.dataset.f; S.zoom = 1; S.pan = [0, 0]; render(host); }));
  $('#ml-quiz', host).onclick = () => { S.quiz = S.quiz ? null : newQ(D); render(host); };
  host.querySelectorAll('[data-ans]').forEach((b) => (b.onclick = () => { const ok = +b.dataset.ans === S.quiz.it.cls; S.score[1]++; if (ok) S.score[0]++; S.quiz.done = { ok, pick: +b.dataset.ans }; S.cls = S.quiz.it.cls; render(host); }));
  $('#ml-next', host)?.addEventListener('click', () => { S.quiz = newQ(D); render(host); });
  host.querySelectorAll('[data-test]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); host.hidden = true; location.hash = '#tests'; import('./tests.js').then((m) => m.startTests(a.dataset.test)); }));
  bindViewer(host, D);
}

const short = (s) => s.replace(/\(.*?\)/g, '').trim();
function newQ(D) { const it = D.items[Math.floor(Math.random() * D.items.length)]; return { it, done: null }; }
function quizHtml(D) {
  const q = S.quiz, L = D.labels;
  return `<div class="ml-quiz"><div class="ml-view" id="ml-view"><img id="ml-img" src="/training-4D/rt/imaging/micro/${S.set}/${q.it.file}" alt="quiz image" draggable="false"></div>
    <p>Which ${S.set === 'pathmnist' ? 'tissue' : 'cell'} is this?</p><div class="bar">${Object.entries(L).map(([k, v]) => `<button class="ghost-btn ${q.done ? (+k === q.it.cls ? 'ml-right' : +k === q.done.pick ? 'ml-wrong' : '') : ''}" data-ans="${k}" ${q.done ? 'disabled' : ''}>${esc(short(v))}</button>`).join('')}</div>
    ${q.done ? `<p><b>${q.done.ok ? '✓ Correct' : '✗ Not quite'}</b>: this image is labelled <b>${esc(L[q.it.cls])}</b> in the dataset. The quoted descriptions on the right say what to look for. <button class="primary small" id="ml-next">Next image</button></p>` : ''}</div>`;
}

function side(D) {
  const note = (k) => NOTES?.notes?.[`micro:${S.set}:${k}`];
  const qs = (arr) => (arr || []).map((x) => `<li><span class="ts-qt">“${esc(x.text)}”</span> <small class="ts-src">${esc(x.title)} · ${esc(x.licence || '')}</small></li>`).join('');
  const cls = S.cur ? D.items.find((x) => x.file === S.cur)?.cls : S.cls;
  const name = cls != null ? D.labels[cls] : null, n = name ? note(name) : null;
  const tests = (D.tests || []).map((t) => TESTS?.tests?.find((x) => x.name === t)).filter(Boolean);
  return `${S.cur && !S.quiz ? `<div class="ml-view" id="ml-view"><img id="ml-img" src="/training-4D/rt/imaging/micro/${S.set}/${S.cur}" alt="${esc(name)}" draggable="false"><div id="ml-pins"></div></div>
      <div class="iv-row"><button class="ghost-btn" id="ml-zin">＋</button><button class="ghost-btn" id="ml-zout">－</button><button class="ghost-btn" id="ml-z1">1:1</button><button class="ghost-btn ${S.noteMode ? 'on' : ''}" id="ml-note">📝 Pin a note</button></div>
      <p class="fine">Scroll = zoom at the pointer · drag = pan · with “Pin a note” on, click the image to pin a floating note (drag it to move; saved in this browser).</p>` : ''}
    ${name ? `<h3>${esc(name)}</h3>` : '<p class="fine">Pick a class or an image to read how it is identified.</p>'}
    ${n?.quotes?.identify?.length ? `<h4>How it is identified</h4><ul class="ts-q">${qs(n.quotes.identify)}</ul>` : name ? '<p class="fine muted">No sentence naming this class with a microscopy word was found in the local open texts.</p>' : ''}
    ${n?.quotes?.differential?.length ? `<h4>Telling it apart</h4><ul class="ts-q">${qs(n.quotes.differential)}</ul>` : ''}
    ${D.stain ? `<h4>Stain</h4><p class="ts-qt">“${esc(D.stain.text)}”</p><p class="fine"><a href="https://pmc.ncbi.nlm.nih.gov/articles/${esc(D.stain.pmcid)}/" target="_blank" rel="noopener">${esc(D.stain.pmcid)}</a> (CC BY)</p>` : ''}
    ${tests.length ? `<h4>Tests that look at these</h4><ul>${tests.map((t) => `<li><a href="#" data-test="${t.id}">${esc(t.name)}</a></li>`).join('')}</ul>` : ''}
    <details><summary class="fine">About the dataset</summary><p class="fine">${esc(D.description)}</p><p class="fine">${esc(I.source)}. Images are the dataset's test split at ${D.shape.slice(0, 2).join('×')} px; labels are the dataset's own. Teaching only, no diagnosis.</p></details>`;
}

function bindViewer(host, D) {
  const view = $('#ml-view', host), img = $('#ml-img', host); if (!view || !img) return;
  const apply = () => { img.style.transform = `translate(${S.pan[0]}px, ${S.pan[1]}px) scale(${S.zoom})`; drawPins(host); };
  img.style.transformOrigin = '0 0'; img.style.imageRendering = S.zoom > 2 ? 'pixelated' : 'auto'; apply();
  const zoomAt = (f, cx, cy) => { const z0 = S.zoom, z1 = Math.max(1, Math.min(16, z0 * f)); S.pan[0] = cx - (cx - S.pan[0]) * (z1 / z0); S.pan[1] = cy - (cy - S.pan[1]) * (z1 / z0); S.zoom = z1; if (z1 === 1) S.pan = [0, 0]; img.style.imageRendering = z1 > 2 ? 'pixelated' : 'auto'; apply(); };
  view.addEventListener('wheel', (e) => { e.preventDefault(); const r = view.getBoundingClientRect(); zoomAt(e.deltaY > 0 ? 0.85 : 1.18, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  let drag = null;
  view.addEventListener('pointerdown', (e) => { if (e.target.closest('.ml-pin')) return; drag = { x: e.clientX, y: e.clientY, moved: false }; });
  view.addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.hypot(dx, dy) > 3) drag.moved = true; if (!drag.moved) return; S.pan[0] += dx; S.pan[1] += dy; drag.x = e.clientX; drag.y = e.clientY; apply(); });
  view.addEventListener('pointerup', (e) => {
    if (drag && !drag.moved && S.noteMode && S.cur) { const r = view.getBoundingClientRect(), u = (e.clientX - r.left - S.pan[0]) / (r.width * S.zoom), v = (e.clientY - r.top - S.pan[1]) / (r.height * S.zoom);
      const t = prompt('Note for this spot'); if (t) { const N = getNotes(S.set, S.cur); N.push({ u, v, t, at: new Date().toISOString() }); putNotes(S.set, S.cur, N); drawPins(host); } }
    drag = null; });
  $('#ml-zin', host)?.addEventListener('click', () => { const r = view.getBoundingClientRect(); zoomAt(1.4, r.width / 2, r.height / 2); });
  $('#ml-zout', host)?.addEventListener('click', () => { const r = view.getBoundingClientRect(); zoomAt(0.7, r.width / 2, r.height / 2); });
  $('#ml-z1', host)?.addEventListener('click', () => { S.zoom = 1; S.pan = [0, 0]; apply(); });
  $('#ml-note', host)?.addEventListener('click', (e) => { S.noteMode = !S.noteMode; e.target.classList.toggle('on', S.noteMode); });
}

function drawPins(host) {
  const box = $('#ml-pins', host), view = $('#ml-view', host); if (!box || !view || !S.cur) return;
  const r = view.getBoundingClientRect(), N = getNotes(S.set, S.cur);
  box.innerHTML = N.map((n, i) => `<div class="ml-pin" data-i="${i}" style="left:${S.pan[0] + n.u * r.width * S.zoom}px;top:${S.pan[1] + n.v * r.height * S.zoom}px"><i></i><span>${esc(n.t)}</span><b data-rm="${i}" title="Remove">✕</b></div>`).join('');
  box.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); const N2 = getNotes(S.set, S.cur); N2.splice(+b.dataset.rm, 1); putNotes(S.set, S.cur, N2); drawPins(host); }));
  box.querySelectorAll('.ml-pin').forEach((p) => { // drag a note to move it
    p.addEventListener('pointerdown', (e) => { if (e.target.dataset.rm) return; e.stopPropagation(); p.setPointerCapture(e.pointerId);
      const mv = (ev) => { p.style.left = `${ev.clientX - r.left}px`; p.style.top = `${ev.clientY - r.top}px`; };
      const up = (ev) => { p.removeEventListener('pointermove', mv); p.removeEventListener('pointerup', up); const N2 = getNotes(S.set, S.cur), i = +p.dataset.i;
        N2[i].u = (ev.clientX - r.left - S.pan[0]) / (r.width * S.zoom); N2[i].v = (ev.clientY - r.top - S.pan[1]) / (r.height * S.zoom); putNotes(S.set, S.cur, N2); drawPins(host); };
      p.addEventListener('pointermove', mv); p.addEventListener('pointerup', up); });
  });
}
