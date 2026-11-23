// Notes: a floating notebook available on every page of the lab.
// - Type (Markdown-style), checklists, tags, pins, [[links]] between notes, search.
// - Record audio (with live level meter and time markers), video (camera), screen; take a photo;
//   attach / paste / drop any file; snapshot the 3D view on the current page.
// - Each note remembers the page (and test / chapter) it was written on; one click goes back there.
// - Node map: notes as nodes, joined by [[links]], shared tags and shared pages.
// - Autosave: every change is saved in this browser (IndexedDB) and mirrored to the project folder
//   data/anatomy_lab/notes/ through the local server (nothing leaves this machine).
// - Download a note (.md), any recording, or a full backup (.json with media); import a backup.
// - Optional dictation uses the browser's speech service, which sends audio to an online service:
//   off by default, and it asks before starting.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`).toLowerCase();
const now = () => new Date().toISOString();
const fmtT = (iso) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
const TAB = { mirror: 'Live Mirror', lab: 'Motion Lab 4D', diag: 'Diagnostics', atlas: '3D Atlas', brain: 'Brain map', molecular: 'Body systems', clinical: 'Clinical', tests: 'Tests & labs', genome: 'DNA → Protein', imaging: 'Imaging', train: 'Training 4D', ext: 'Extensions' };
const EXT_OF = (type, name) => (name && /\.([a-z0-9]{2,5})$/i.test(name) ? name.split('.').pop().toLowerCase() : type.includes('webm') ? 'webm' : type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'mp4' : type.includes('png') ? 'png' : type.includes('jpeg') ? 'jpg' : type.includes('gif') ? 'gif' : type.includes('webp') ? 'webp' : type.includes('pdf') ? 'pdf' : type.includes('wav') ? 'wav' : type.includes('mpeg') ? 'mp3' : 'txt');

// ------------------------------------------------------------------ storage (IndexedDB + project-folder mirror)
let DB = null;
function db() {
  if (DB) return DB;
  DB = new Promise((res, rej) => {
    const r = indexedDB.open('meridian-notes', 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('notes', { keyPath: 'id' }); d.createObjectStore('media', { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return DB;
}
const tx = async (store, mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(store, mode), s = t.objectStore(store), out = fn(s); t.oncomplete = () => res(out?.result ?? out); t.onerror = () => rej(t.error); }); };
const getAll = (store) => tx(store, 'readonly', (s) => s.getAll());
const put = (store, v) => tx(store, 'readwrite', (s) => s.put(v));
const del = (store, k) => tx(store, 'readwrite', (s) => s.delete(k));
const getOne = (store, k) => tx(store, 'readonly', (s) => s.get(k));

async function mirrorNote(n) {
  try { const r = await fetch('/api/notes/note', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(n) }); return r.ok; } catch { return false; }
}
async function mirrorBlob(m) {
  try { const r = await fetch(`/api/notes/blob?id=${m.id}&ext=${m.ext}`, { method: 'POST', body: m.blob }); return r.ok; } catch { return false; }
}

// ------------------------------------------------------------------ state
const S = { notes: [], cur: null, view: 'edit', q: '', tag: null, rec: null, open: false, dict: null, saveT: null, autoConv: (() => { try { return localStorage.getItem('nt-autoconv') !== '0'; } catch { return true; } })() };

export async function initNotes() {
  if (document.querySelector('#nt-fab')) return;
  injectCss();
  const fab = document.createElement('button'); fab.id = 'nt-fab'; fab.title = 'Notes (Alt+N)'; fab.innerHTML = '✎ Notes'; document.body.appendChild(fab);
  const P = document.createElement('section'); P.id = 'nt-panel'; P.hidden = true; document.body.appendChild(P);
  P.innerHTML = `
    <header id="nt-head"><b>Notes</b><span id="nt-status" class="nt-fine"></span>
      <span class="nt-sp"></span>
      <button data-v="edit" class="nt-hb on" title="Notes">Notes</button><button data-v="map" class="nt-hb" title="Node map">Nodes</button><button data-v="files" class="nt-hb" title="All recordings and files">Media</button>
      <button id="nt-dock" class="nt-hb" title="Dock left / right">⇆</button><button id="nt-min" class="nt-hb" title="Close (Alt+N)">✕</button></header>
    <div id="nt-body">
      <aside id="nt-side"><div class="nt-row"><input id="nt-q" type="search" placeholder="Search notes"><button id="nt-new" class="nt-btn pri" title="New note">＋</button></div><div id="nt-tags"></div><ul id="nt-list"></ul>
        <label class="nt-fine"><input type="checkbox" id="nt-autoconv"> Auto-convert recordings (audio → MP3, video → MP4)</label>
        <div class="nt-row nt-fine"><button id="nt-backup" class="nt-btn">Backup ⭳</button><label class="nt-btn">Import<input id="nt-import" type="file" accept=".json" hidden></label></div></aside>
      <main id="nt-main"></main>
    </div>`;
  // drag + dock + resize persisted
  const pos = (() => { try { return JSON.parse(localStorage.getItem('nt-pos') || 'null'); } catch { return null; } })();
  if (pos) Object.assign(P.style, pos);
  let drag = null;
  P.querySelector('#nt-head').addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; const r = P.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }; P.setPointerCapture(e.pointerId); });
  P.addEventListener('pointermove', (e) => { if (!drag) return; P.style.left = `${Math.max(0, Math.min(innerWidth - 120, e.clientX - drag.dx))}px`; P.style.top = `${Math.max(0, Math.min(innerHeight - 40, e.clientY - drag.dy))}px`; P.style.right = 'auto'; P.style.bottom = 'auto'; });
  P.addEventListener('pointerup', () => { if (drag) savePos(); drag = null; });
  new ResizeObserver(() => savePos()).observe(P);
  function savePos() { try { localStorage.setItem('nt-pos', JSON.stringify({ left: P.style.left, top: P.style.top, right: P.style.right, bottom: P.style.bottom, width: `${P.offsetWidth}px`, height: `${P.offsetHeight}px` })); } catch { /* storage blocked */ } }
  P.querySelector('#nt-dock').onclick = () => { const left = P.getBoundingClientRect().left > innerWidth / 2; Object.assign(P.style, { top: '70px', height: `${innerHeight - 90}px`, left: left ? '8px' : 'auto', right: left ? 'auto' : '8px', bottom: 'auto' }); savePos(); };
  const toggle = () => { S.open = !S.open; P.hidden = !S.open; fab.classList.toggle('on', S.open); if (S.open && !S.cur) render(); };
  fab.onclick = toggle; P.querySelector('#nt-min').onclick = toggle;
  addEventListener('keydown', (e) => { if (e.altKey && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); toggle(); } });
  P.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => { S.view = b.dataset.v; P.querySelectorAll('[data-v]').forEach((x) => x.classList.toggle('on', x === b)); render(); }));
  P.querySelector('#nt-new').onclick = () => newNote();
  P.querySelector('#nt-q').oninput = (e) => { S.q = e.target.value.toLowerCase(); renderList(); };
  P.querySelector('#nt-backup').onclick = backup;
  const ac = P.querySelector('#nt-autoconv'); ac.checked = S.autoConv; ac.onchange = () => { S.autoConv = ac.checked; try { localStorage.setItem('nt-autoconv', ac.checked ? '1' : '0'); } catch { /* blocked */ } };
  P.querySelector('#nt-import').onchange = (e) => importBackup(e.target.files[0]);
  // paste / drop files anywhere on the panel
  P.addEventListener('paste', (e) => { const fs = [...(e.clipboardData?.files || [])]; if (fs.length && S.cur) { e.preventDefault(); fs.forEach((f) => attach(f, f.name || 'pasted')); } });
  P.addEventListener('dragover', (e) => e.preventDefault());
  P.addEventListener('drop', (e) => { e.preventDefault(); if (!S.cur) return; [...(e.dataTransfer?.files || [])].forEach((f) => attach(f, f.name)); });
  await load();
}

async function load() {
  S.notes = (await getAll('notes')).filter((n) => !n.deleted);
  // restore from the project folder if this browser has none (e.g. a new browser profile)
  if (!S.notes.length) {
    try {
      const r = await (await fetch('/api/notes/list')).json();
      for (const n of r.notes || []) { await put('notes', n); }
      for (const n of r.notes || []) for (const m of n.media || []) {
        if (!(await getOne('media', m.id)) && (r.media || []).includes(`${m.id}.${m.ext}`)) {
          const b = await (await fetch(`/training-4D/rt/notes/media/${m.id}.${m.ext}`)).blob(); await put('media', { ...m, blob: b });
        }
      }
      S.notes = (await getAll('notes')).filter((n) => !n.deleted);
      if (S.notes.length) status(`Restored ${S.notes.length} notes from the project folder`);
    } catch { /* server offline */ }
  }
  renderList();
}

function ctxNow() {
  const tab = location.hash.slice(1) || 'mirror', c = window.__noteCtx && window.__noteCtx.hash === tab ? window.__noteCtx : null;
  return { hash: tab, page: TAB[tab] || tab, id: c?.id || null, label: c?.label || null };
}

async function newNote(extra = {}) {
  const n = { id: uid(), title: '', body: '', tags: [], pinned: false, created: now(), updated: now(), ctx: ctxNow(), media: [], ...extra };
  S.notes.unshift(n); S.cur = n; S.view = 'edit';
  document.querySelectorAll('#nt-panel [data-v]').forEach((x) => x.classList.toggle('on', x.dataset.v === 'edit'));
  await persist(n); render();
  document.querySelector('#nt-title')?.focus();
  return n;
}

function persist(n, immediate = false) {
  n.updated = now();
  const go = async () => { await put('notes', n); const ok = await mirrorNote(n); status(ok ? `Saved ${new Date().toLocaleTimeString()} · browser + project folder` : `Saved ${new Date().toLocaleTimeString()} · browser only (server offline)`); renderList(); };
  clearTimeout(S.saveT);
  if (immediate) return go();
  status('Saving…'); S.saveT = setTimeout(go, 500);
  return Promise.resolve();
}
const status = (t) => { const el = document.querySelector('#nt-status'); if (el) el.textContent = t; };

// ------------------------------------------------------------------ list
function allTags() { const c = {}; S.notes.forEach((n) => n.tags.forEach((t) => { c[t] = (c[t] || 0) + 1; })); return c; }
function renderList() {
  const tags = allTags();
  const tg = document.querySelector('#nt-tags'); if (!tg) return;
  tg.innerHTML = Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([t, c]) => `<button class="nt-tag ${S.tag === t ? 'on' : ''}" data-t="${esc(t)}">#${esc(t)} <small>${c}</small></button>`).join('');
  tg.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { S.tag = S.tag === b.dataset.t ? null : b.dataset.t; renderList(); }));
  const xs = S.notes.filter((n) => (!S.tag || n.tags.includes(S.tag)) && (!S.q || `${n.title} ${n.body} ${n.tags.join(' ')} ${n.ctx?.label || ''}`.toLowerCase().includes(S.q)))
    .sort((a, b) => (b.pinned - a.pinned) || b.updated.localeCompare(a.updated));
  document.querySelector('#nt-list').innerHTML = xs.map((n) => `<li data-id="${n.id}" class="${S.cur?.id === n.id ? 'on' : ''}"><b>${n.pinned ? '📌 ' : ''}${esc(n.title || firstLine(n.body) || 'Untitled')}</b>
    <small>${esc(n.ctx?.page || '')}${n.ctx?.label ? ` · ${esc(n.ctx.label.slice(0, 30))}` : ''} · ${fmtT(n.updated)}${n.media.length ? ` · ${n.media.length} 📎` : ''}</small></li>`).join('') || '<li class="nt-fine">No notes yet. Press ＋.</li>';
  document.querySelectorAll('#nt-list [data-id]').forEach((li) => (li.onclick = () => { S.cur = S.notes.find((n) => n.id === li.dataset.id); S.view = 'edit'; document.querySelectorAll('#nt-panel [data-v]').forEach((x) => x.classList.toggle('on', x.dataset.v === 'edit')); render(); }));
}
const firstLine = (b) => (b || '').split('\n').find((l) => l.trim())?.replace(/^[#\-*\s[\]x]+/, '').slice(0, 60);

// ------------------------------------------------------------------ editor
function render() {
  renderList();
  const M = document.querySelector('#nt-main'); if (!M) return;
  if (S.view === 'map') return renderMap(M);
  if (S.view === 'files') return renderFiles(M);
  const n = S.cur;
  if (!n) { M.innerHTML = `<div class="nt-empty"><p>Write, record or attach on any page; notes save automatically.</p><p><button class="nt-btn pri" id="nt-new2">＋ New note</button> <button class="nt-btn" id="nt-qa">🎙 Quick audio note</button></p><p class="nt-fine">Alt+N opens and closes this panel. Drag the title bar to move it, drag the corner to resize, ⇆ docks it to a side.</p></div>`; M.querySelector('#nt-new2').onclick = () => newNote(); M.querySelector('#nt-qa').onclick = async () => { await newNote(); record('audio'); }; return; }
  M.innerHTML = `
    <input id="nt-title" class="nt-title" placeholder="Title" value="${esc(n.title)}">
    <div class="nt-meta">${n.ctx ? `<a href="#" id="nt-ctx" title="Go back to where this note was written">↪ ${esc(n.ctx.page)}${n.ctx.label ? ` · ${esc(n.ctx.label)}` : ''}</a>` : ''}
      <span class="nt-fine">created ${fmtT(n.created)}</span>
      <input id="nt-tagin" placeholder="tags, comma separated" value="${esc(n.tags.join(', '))}"></div>
    <div class="nt-tools">
      <button data-md="**" title="Bold">B</button><button data-md="_" title="Italic"><i>I</i></button><button data-ins="## " title="Heading">H</button><button data-ins="- " title="List">•</button><button data-ins="- [ ] " title="Checklist">☐</button>
      <button data-ins="[[" title="Link to another note: [[Title]]">[[ ]]</button><button id="nt-stamp" title="Insert time">🕒</button><button id="nt-here" title="Insert a link to the current page">📍</button>
      <span class="nt-sep"></span>
      <button id="nt-ra" title="Record audio">🎙 Audio</button><button id="nt-rv" title="Record video (camera)">🎥 Video</button><button id="nt-rs" title="Record the screen">🖥 Screen</button>
      <button id="nt-ph" title="Take a photo">📷</button><button id="nt-snap" title="Snapshot of the 3D view on this page">🧊 3D</button>
      <label title="Attach files">📎<input id="nt-file" type="file" multiple hidden></label>
      <button id="nt-dict" title="Dictation (online browser service; asks first)">🗣</button>
      <span class="nt-sep"></span>
      <button id="nt-prev" title="Preview">👁</button><button id="nt-pin" title="Pin">${n.pinned ? '📌' : '📍pin'}</button><button id="nt-dl" title="Download this note (.md)">⭳</button><button id="nt-del" title="Delete">🗑</button>
    </div>
    <div id="nt-recbar" hidden></div>
    <textarea id="nt-text" placeholder="Type here. Markdown works: # heading, - list, - [ ] task, **bold**, [[Another note]]. Paste or drop images and files.">${esc(n.body)}</textarea>
    <div id="nt-preview" class="nt-preview" hidden></div>
    <div id="nt-media" class="nt-media"></div>
    <div id="nt-backlinks" class="nt-fine"></div>`;
  const T = M.querySelector('#nt-text');
  M.querySelector('#nt-title').oninput = (e) => { n.title = e.target.value; persist(n); };
  M.querySelector('#nt-tagin').onchange = (e) => { n.tags = [...new Set(e.target.value.split(',').map((x) => x.trim().replace(/^#/, '')).filter(Boolean))]; persist(n); };
  T.oninput = () => { n.body = T.value; persist(n); };
  T.onkeydown = (e) => { if (e.key === 'Enter') { const ln = T.value.slice(0, T.selectionStart).split('\n').pop(); const m = /^(\s*)(- \[[ x]\] |- |\* |\d+\. )/.exec(ln); if (m) { e.preventDefault(); ins(T, `\n${m[1]}${m[2].replace('[x]', '[ ]').replace(/^\d+/, (d) => +d + 1)}`); } } };
  M.querySelectorAll('[data-md]').forEach((b) => (b.onclick = () => wrap(T, b.dataset.md)));
  M.querySelectorAll('[data-ins]').forEach((b) => (b.onclick = () => ins(T, b.dataset.ins === '[[' ? '[[]]' : b.dataset.ins, b.dataset.ins === '[[' ? -2 : 0)));
  M.querySelector('#nt-stamp').onclick = () => ins(T, `**${new Date().toLocaleString()}** `);
  M.querySelector('#nt-here').onclick = () => { const c = ctxNow(); ins(T, `[↪ ${c.page}${c.label ? ` · ${c.label}` : ''}](#${c.hash}${c.id ? `?id=${c.id}` : ''}) `); };
  M.querySelector('#nt-ctx')?.addEventListener('click', (e) => { e.preventDefault(); goCtx(n.ctx); });
  M.querySelector('#nt-ra').onclick = () => record('audio'); M.querySelector('#nt-rv').onclick = () => record('video'); M.querySelector('#nt-rs').onclick = () => record('screen');
  M.querySelector('#nt-ph').onclick = photo; M.querySelector('#nt-snap').onclick = snap3d;
  M.querySelector('#nt-file').onchange = (e) => [...e.target.files].forEach((f) => attach(f, f.name));
  M.querySelector('#nt-dict').onclick = dictation;
  M.querySelector('#nt-prev').onclick = () => { const p = M.querySelector('#nt-preview'), on = p.hidden; p.hidden = !on; T.hidden = on; if (on) { p.innerHTML = md(n.body); bindPreview(p, n); } };
  M.querySelector('#nt-pin').onclick = () => { n.pinned = !n.pinned; persist(n, true); render(); };
  M.querySelector('#nt-dl').onclick = () => downloadNote(n);
  M.querySelector('#nt-del').onclick = async () => { if (!confirm('Delete this note? (A copy is kept in data/anatomy_lab/notes/trash.)')) return; await del('notes', n.id); for (const m of n.media) await del('media', m.id); await mirrorNote({ id: n.id, deleted: true }); S.notes = S.notes.filter((x) => x !== n); S.cur = null; render(); };
  renderMedia(n);
  const bl = S.notes.filter((x) => x !== n && n.title && x.body.includes(`[[${n.title}]]`));
  M.querySelector('#nt-backlinks').innerHTML = bl.length ? `Linked from: ${bl.map((x) => `<a href="#" data-open="${x.id}">${esc(x.title || 'Untitled')}</a>`).join(' · ')}` : '';
  M.querySelectorAll('[data-open]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); S.cur = S.notes.find((x) => x.id === a.dataset.open); render(); }));
}
function ins(T, s, back = 0) { const a = T.selectionStart, b = T.selectionEnd; T.setRangeText(s, a, b, 'end'); if (back) T.selectionStart = T.selectionEnd = T.selectionEnd + back; T.focus(); T.dispatchEvent(new Event('input')); }
function wrap(T, w) { const a = T.selectionStart, b = T.selectionEnd, sel = T.value.slice(a, b) || 'text'; T.setRangeText(`${w}${sel}${w}`, a, b, 'select'); T.focus(); T.dispatchEvent(new Event('input')); }

function goCtx(c) {
  if (!c) return; location.hash = `#${c.hash}`;
  if (c.id && c.hash === 'tests') import('./tests.js').then((m) => m.startTests(c.id));
  if (c.id && c.hash === 'clinical') import('./clinical.js').then((m) => m.startClinical(c.id));
  if (c.id && c.hash === 'genome') import('./genome.js').then(async (m) => { await m.startGenome(); m.openGene(c.id); });
}

// tiny Markdown renderer (escape first, then a few patterns)
function md(src) {
  const lines = esc(src).split('\n'); let out = '', list = null;
  const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\W)_(.+?)_(?=\W|$)/g, '$1<i>$2</i>').replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[\[(.+?)\]\]/g, (_, t) => `<a href="#" data-wiki="${t}">${t}</a>`).replace(/\[(.+?)\]\((#[^)\s]+|https?:\/\/[^)\s]+)\)/g, (_, t, u) => `<a href="${u}" ${u.startsWith('http') ? 'target="_blank" rel="noopener noreferrer"' : 'data-hash="1"'}>${t}</a>`);
  for (const l of lines) {
    const m = /^(\s*)- \[( |x)\] (.*)$/.exec(l), b = /^(\s*)[-*] (.*)$/.exec(l), h = /^(#{1,3}) (.*)$/.exec(l);
    if (!(m || b) && list) { out += '</ul>'; list = null; }
    if (m) { if (!list) { out += '<ul class="nt-ul">'; list = 1; } out += `<li><input type="checkbox" disabled ${m[2] === 'x' ? 'checked' : ''}> ${inline(m[3])}</li>`; }
    else if (b) { if (!list) { out += '<ul class="nt-ul">'; list = 1; } out += `<li>${inline(b[2])}</li>`; }
    else if (h) out += `<h${h[1].length + 2}>${inline(h[2])}</h${h[1].length + 2}>`;
    else out += l.trim() ? `<p>${inline(l)}</p>` : '';
  }
  return out + (list ? '</ul>' : '');
}
function bindPreview(p, n) {
  p.querySelectorAll('[data-wiki]').forEach((a) => (a.onclick = async (e) => { e.preventDefault(); const t = a.dataset.wiki; S.cur = S.notes.find((x) => x.title.toLowerCase() === t.toLowerCase()) || (await newNote({ title: t })); render(); }));
  p.querySelectorAll('[data-hash]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); const [h, q] = a.getAttribute('href').slice(1).split('?id='); goCtx({ hash: h, id: q || null }); }));
}

// ------------------------------------------------------------------ media
async function attach(blob, name, extra = {}) {
  const n = S.cur; if (!n) return;
  const m = { id: uid(), noteId: n.id, type: blob.type || 'application/octet-stream', name: name || 'file', ext: EXT_OF(blob.type || '', name), size: blob.size, created: now(), ...extra };
  await put('media', { ...m, blob });
  n.media.push(m); await persist(n, true); renderMedia(n);
  const ok = await mirrorBlob({ ...m, blob });
  m.mirrored = ok;
  status(ok ? `Saved ${m.name} · browser + project folder` : `Saved ${m.name} · browser only`);
  return m;
}
const fmtS = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// local conversion (server ffmpeg): audio -> MP3 320 kbps, video -> MP4 H.264 + AAC; the converted file is kept beside the original
async function convert(m, to) {
  const n = S.notes.find((x) => x.id === m.noteId); if (!n) return;
  if (m.ext === to) { status(`Already ${to.toUpperCase()}`); return; }
  status(`Converting ${m.caption || m.name} to ${to.toUpperCase()}…`);
  try {
    const r = await (await fetch(`/api/notes/convert?id=${m.id}&ext=${m.ext}&to=${to}`, { method: 'POST' })).json();
    if (!r.ok) throw new Error(r.error);
    const it = n.media.find((x) => x.id === m.id); it.conv = { ...(it.conv || {}), [to]: { url: r.url, bytes: r.bytes } };
    await persist(n, true); if (S.cur === n) renderMedia(n);
    status(`${to.toUpperCase()} ready (${(r.bytes / 1e6).toFixed(1)} MB) · data/anatomy_lab/notes/media/${m.id}.${to}`);
  } catch (e) { status(`Conversion failed: ${e.message}`); }
}
async function renderMedia(n) {
  const host = document.querySelector('#nt-media'); if (!host || S.cur !== n) return;
  const items = await Promise.all(n.media.map(async (m) => ({ m, rec: await getOne('media', m.id) })));
  host.innerHTML = items.map(({ m, rec }) => {
    if (!rec) return `<div class="nt-att"><span class="nt-fine">${esc(m.name)} (not in this browser)</span></div>`;
    const url = URL.createObjectURL(rec.blob), t = m.type;
    const view = t.startsWith('image/') ? `<img src="${url}" alt="${esc(m.name)}">` : t.startsWith('audio/') ? `<audio controls src="${url}"></audio>` : t.startsWith('video/') ? `<video controls src="${url}"></video>` : `<span class="nt-fine">${esc(m.type)}</span>`;
    const marks = (m.marks || []).map((s) => `<button class="nt-mark" data-seek="${s}" data-m="${m.id}">⏱ ${s.toFixed(1)} s</button>`).join('');
    const av = t.startsWith('audio/') || t.startsWith('video/');
    const conv = av ? `<div class="nt-row nt-fine"><select class="nt-speed" title="Playback speed">${[0.5, 0.75, 1, 1.25, 1.5, 2].map((v) => `<option value="${v}" ${v === 1 ? 'selected' : ''}>${v}×</option>`).join('')}</select>
      ${['mp3', 'mp4'].filter((x) => (x === 'mp3') === t.startsWith('audio/') || (x === 'mp3' && t.startsWith('video/'))).map((x) => m.conv?.[x] ? `<a class="nt-btn" href="${m.conv[x].url}" download="${esc((m.caption || m.name).replace(/[^\w.-]+/g, '_'))}.${x}">⭳ ${x.toUpperCase()}</a>` : `<button class="nt-btn" data-conv="${x}" data-mid="${m.id}">→ ${x.toUpperCase()}</button>`).join('')}</div>` : '';
    const acts = (m.actions || []).length ? `<details class="nt-acts"><summary class="nt-fine">What I did (${m.actions.length} actions, click to jump)</summary>${m.actions.map((a) => `<button class="nt-act" data-seek="${a.t}" data-m="${m.id}">${fmtS(a.t)} · ${esc(a.page)}${a.ctx ? ` (${esc(a.ctx)})` : ''} · ${a.nav ? 'opened page' : `clicked “${esc(a.what)}”`}</button>`).join('')}</details>` : '';
    return `<div class="nt-att">${view}${conv}<div class="nt-row"><input class="nt-cap" data-cap="${m.id}" value="${esc(m.caption || m.name)}"><a class="nt-btn" href="${url}" download="${esc((m.caption || m.name).replace(/[^\w.-]+/g, '_'))}.${m.ext}">⭳</a><button class="nt-btn" data-rm="${m.id}">✕</button></div>${marks ? `<div>${marks}</div>` : ''}${acts}</div>`;
  }).join('');
  host.querySelectorAll('[data-cap]').forEach((i) => (i.onchange = () => { const m = n.media.find((x) => x.id === i.dataset.cap); m.caption = i.value; persist(n, true); }));
  host.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = async () => { n.media = n.media.filter((x) => x.id !== b.dataset.rm); await del('media', b.dataset.rm); persist(n, true); renderMedia(n); }));
  host.querySelectorAll('.nt-speed').forEach((sel) => (sel.onchange = () => { const el = sel.closest('.nt-att').querySelector('audio,video'); if (el) el.playbackRate = +sel.value; }));
  host.querySelectorAll('[data-conv]').forEach((b) => (b.onclick = () => convert(n.media.find((x) => x.id === b.dataset.mid), b.dataset.conv)));
  host.querySelectorAll('[data-seek]').forEach((b) => (b.onclick = () => { const el = b.closest('.nt-att').querySelector('audio,video'); if (el) { el.currentTime = +b.dataset.seek; el.play(); } }));
}

async function record(kind) {
  if (S.rec) return stopRec();
  if (!S.cur) await newNote();
  let stream;
  try {
    if (kind === 'audio') stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    else if (kind === 'video') stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } } });
    else { stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30 }, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: true }); try { const mic = await navigator.mediaDevices.getUserMedia({ audio: true }); mic.getAudioTracks().forEach((t) => stream.addTrack(t)); } catch { /* screen without mic */ } }
  } catch (e) { status(`Could not start ${kind}: ${e.message}`); return; }
  // MP4 straight from the browser when it can (newer Chrome); otherwise WebM, converted to MP4 / MP3 by the local server
  const mime = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'].find((t) => (kind === 'audio' ? t.startsWith('audio') : t.startsWith('video')) && MediaRecorder.isTypeSupported(t)) || '';
  const opts = { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 256000, ...(kind === 'audio' ? {} : { videoBitsPerSecond: kind === 'screen' ? 16000000 : 10000000 }) };
  const rec = new MediaRecorder(stream, opts), chunks = [], t0 = performance.now(), marks = [], actions = [];
  // what I did: every click inside Meridian while recording (page, the thing clicked, the open test / chapter), plus a click ripple that shows in the video
  const onClick = (e) => {
    const el = e.target.closest('button,a,input,select,label,li,canvas,[data-id],[data-pw],[data-tool],[data-org],[data-ty],[role=tab]') || e.target;
    const what = (el.getAttribute?.('aria-label') || el.title || (el.tagName === 'CANVAS' ? '3D / image view' : '') || el.innerText || el.value || el.id || el.tagName || '').toString().replace(/\s+/g, ' ').trim().slice(0, 80);
    const c = window.__noteCtx && window.__noteCtx.hash === (location.hash.slice(1) || 'mirror') ? window.__noteCtx.label : '';
    actions.push({ t: (performance.now() - t0) / 1000, page: TAB[location.hash.slice(1)] || location.hash.slice(1) || 'Live Mirror', what, ctx: c, x: Math.round(e.clientX), y: Math.round(e.clientY), inNotes: !!e.target.closest('#nt-panel') });
    const r = document.createElement('div'); r.className = 'nt-ripple'; r.style.left = `${e.clientX}px`; r.style.top = `${e.clientY}px`; document.body.appendChild(r); setTimeout(() => r.remove(), 700);
  };
  const onNav = () => actions.push({ t: (performance.now() - t0) / 1000, page: TAB[location.hash.slice(1)] || location.hash.slice(1), what: 'opened page', ctx: '', nav: true });
  if (kind !== 'audio') { document.addEventListener('pointerdown', onClick, true); addEventListener('hashchange', onNav); }
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop()); cancelAnimationFrame(S.rec?.raf); S.rec?.ac?.close?.();
    document.removeEventListener('pointerdown', onClick, true); removeEventListener('hashchange', onNav);
    const dur = (performance.now() - t0) / 1000, blob = new Blob(chunks, { type: rec.mimeType || (kind === 'audio' ? 'audio/webm' : 'video/webm') });
    const label = `${kind === 'audio' ? 'Audio' : kind === 'video' ? 'Video' : 'Screen'} ${new Date().toLocaleString()} (${dur.toFixed(0)} s)`;
    S.rec = null; const bar = document.querySelector('#nt-recbar'); if (bar) bar.hidden = true;
    const m = await attach(blob, label, { duration: dur, marks, actions: actions.filter((a) => !a.inNotes) });
    const T = document.querySelector('#nt-text');
    const acts = actions.filter((a) => !a.inNotes);
    if (T) ins(T, `\n${kind === 'audio' ? '🎙' : kind === 'video' ? '🎥' : '🖥'} ${label}${marks.length ? ` · markers at ${marks.map((x) => `${x.toFixed(1)} s`).join(', ')}` : ''}${acts.length ? `\nWhat I did (${acts.length} actions):\n${acts.slice(0, 40).map((a) => `- ${fmtS(a.t)} · ${a.page}${a.ctx ? ` (${a.ctx})` : ''} · ${a.nav ? 'opened page' : `clicked “${a.what}”`}`).join('\n')}` : ''}\n`);
    if (m && S.autoConv) convert(m, kind === 'audio' ? 'mp3' : 'mp4');
  };
  rec.start(1000);
  S.rec = { rec, kind, t0, marks };
  const bar = document.querySelector('#nt-recbar'); bar.hidden = false;
  bar.innerHTML = `<span class="nt-dot"></span><b>${kind === 'audio' ? 'Recording audio' : kind === 'video' ? 'Recording video' : 'Recording screen'}</b> <span id="nt-rt">0:00</span>
    ${kind !== 'audio' ? '<video id="nt-live" muted playsinline></video>' : '<canvas id="nt-lvl" width="160" height="22"></canvas>'}
    <button class="nt-btn" id="nt-mark">⏱ Mark</button><button class="nt-btn pri" id="nt-stop">■ Stop and save</button>`;
  bar.querySelector('#nt-stop').onclick = stopRec;
  bar.querySelector('#nt-mark').onclick = () => { const s = (performance.now() - t0) / 1000; marks.push(s); const T = document.querySelector('#nt-text'); if (T) ins(T, `\n⏱ ${s.toFixed(1)} s: `); };
  if (kind !== 'audio') { const v = bar.querySelector('#nt-live'); v.srcObject = stream; v.play().catch(() => {}); }
  else {
    try {
      const ac = new AudioContext(), an = ac.createAnalyser(); ac.createMediaStreamSource(stream).connect(an); an.fftSize = 512; S.rec.ac = ac;
      const cv = bar.querySelector('#nt-lvl'), g = cv.getContext('2d'), buf = new Uint8Array(an.fftSize);
      const loop = () => { an.getByteTimeDomainData(buf); let pk = 0; for (const x of buf) pk = Math.max(pk, Math.abs(x - 128)); g.clearRect(0, 0, 160, 22); g.fillStyle = pk > 100 ? '#ff6b6b' : '#06d6a0'; g.fillRect(0, 4, (pk / 128) * 160, 14); if (S.rec) S.rec.raf = requestAnimationFrame(loop); };
      loop();
    } catch { /* meter optional */ }
  }
  const tick = () => { if (!S.rec) return; const s = Math.floor((performance.now() - t0) / 1000), el = document.querySelector('#nt-rt'); if (el) el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; setTimeout(tick, 500); };
  tick();
  stream.getVideoTracks()[0]?.addEventListener('ended', stopRec); // screen share stopped from the browser bar
}
function stopRec() { if (S.rec && S.rec.rec.state !== 'inactive') S.rec.rec.stop(); }

async function photo() {
  if (!S.cur) await newNote();
  let st; try { st = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } }); } catch (e) { status(`Camera: ${e.message}`); return; }
  const v = document.createElement('video'); v.srcObject = st; v.muted = true; await v.play(); await new Promise((r) => setTimeout(r, 400));
  const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0); st.getTracks().forEach((t) => t.stop());
  c.toBlob((b) => attach(b, `Photo ${new Date().toLocaleString()}`), 'image/jpeg', 0.92);
}
async function snap3d() {
  if (!S.cur) await newNote();
  const cs = [...document.querySelectorAll('main.mode:not([hidden]) canvas')].filter((c) => c.width > 200 && c.offsetParent);
  const c = cs.sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (!c) { status('No 3D view on this page'); return; }
  await new Promise((r) => requestAnimationFrame(r)); // capture right after a frame
  const out = document.createElement('canvas'); out.width = c.width; out.height = c.height; const g = out.getContext('2d'); g.fillStyle = '#050c18'; g.fillRect(0, 0, out.width, out.height); g.drawImage(c, 0, 0);
  const px = g.getImageData(out.width >> 1, out.height >> 1, 1, 1).data;
  out.toBlob((b) => { attach(b, `3D view · ${ctxNow().page} · ${new Date().toLocaleString()}`); if (px[0] === 5 && px[1] === 12 && px[2] === 24) status('Snapshot saved; if it looks empty, the 3D view does not keep its last frame: use 🖥 Screen instead.'); }, 'image/png');
}

function dictation() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { status('Dictation is not available in this browser.'); return; }
  if (S.dict) { S.dict.stop(); S.dict = null; status('Dictation stopped'); return; }
  if (!sessionStorage.getItem('nt-dict-ok') && !confirm('Dictation uses your browser\'s speech service, which sends your voice to an online service (it leaves this machine). Audio recordings (🎙) stay local. Continue?')) return;
  sessionStorage.setItem('nt-dict-ok', '1');
  const r = new SR(); r.continuous = true; r.interimResults = false; r.lang = navigator.language || 'en-US';
  r.onresult = (e) => { const T = document.querySelector('#nt-text'); for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal && T) ins(T, `${e.results[i][0].transcript.trim()} `); };
  r.onend = () => { if (S.dict === r) { S.dict = null; status('Dictation ended'); } };
  r.start(); S.dict = r; status('Dictating… press 🗣 again to stop');
}

// ------------------------------------------------------------------ media library, node map
async function renderFiles(M) {
  const all = S.notes.flatMap((n) => n.media.map((m) => ({ n, m })));
  M.innerHTML = `<h3 class="nt-h">All recordings and files <small>${all.length}</small></h3><div class="nt-files">${all.map(({ n, m }) => `<div class="nt-fileit" data-open="${n.id}"><b>${m.type.startsWith('audio') ? '🎙' : m.type.startsWith('video') ? '🎥' : m.type.startsWith('image') ? '🖼' : '📄'} ${esc(m.caption || m.name)}</b><small>${esc(n.title || 'Untitled')} · ${(m.size / 1e6).toFixed(2)} MB</small></div>`).join('') || '<p class="nt-fine">Nothing recorded yet.</p>'}</div>`;
  M.querySelectorAll('[data-open]').forEach((d) => (d.onclick = () => { S.cur = S.notes.find((x) => x.id === d.dataset.open); S.view = 'edit'; document.querySelectorAll('#nt-panel [data-v]').forEach((x) => x.classList.toggle('on', x.dataset.v === 'edit')); render(); }));
}

function renderMap(M) {
  const ns = S.notes, W = M.clientWidth || 600, H = Math.max(360, M.clientHeight || 420);
  // nodes: notes + tags + pages; edges: [[links]], note-tag, note-page
  const nodes = [], idx = {}, edges = [];
  const node = (key, label, kind, ref) => { if (idx[key] == null) { idx[key] = nodes.length; nodes.push({ key, label, kind, ref, x: W / 2 + (Math.random() - 0.5) * W * 0.6, y: H / 2 + (Math.random() - 0.5) * H * 0.6, vx: 0, vy: 0 }); } return idx[key]; };
  ns.forEach((n) => node(`n:${n.id}`, n.title || firstLine(n.body) || 'Untitled', 'note', n));
  ns.forEach((n) => {
    const a = idx[`n:${n.id}`];
    n.tags.forEach((t) => edges.push([a, node(`t:${t}`, `#${t}`, 'tag'), 'tag']));
    if (n.ctx) edges.push([a, node(`p:${n.ctx.hash}:${n.ctx.label || ''}`, n.ctx.label ? `${n.ctx.page}: ${n.ctx.label}` : n.ctx.page, 'page', n.ctx), 'page']);
    for (const m of n.body.matchAll(/\[\[(.+?)\]\]/g)) { const tgt = ns.find((x) => x.title.toLowerCase() === m[1].toLowerCase()); if (tgt) edges.push([a, idx[`n:${tgt.id}`], 'link']); }
  });
  for (let it = 0; it < 300; it++) {
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) { const A = nodes[i], B = nodes[j], dx = A.x - B.x, dy = A.y - B.y, d2 = dx * dx + dy * dy + 0.01, f = 1800 / d2; A.vx += dx * f; A.vy += dy * f; B.vx -= dx * f; B.vy -= dy * f; }
    for (const [a, b] of edges) { const A = nodes[a], B = nodes[b], dx = B.x - A.x, dy = B.y - A.y, f = 0.02; A.vx += dx * f; A.vy += dy * f; B.vx -= dx * f; B.vy -= dy * f; }
    for (const N of nodes) { N.vx += (W / 2 - N.x) * 0.004; N.vy += (H / 2 - N.y) * 0.004; N.x = Math.max(20, Math.min(W - 110, N.x + N.vx * 0.5)); N.y = Math.max(20, Math.min(H - 20, N.y + N.vy * 0.5)); N.vx *= 0.6; N.vy *= 0.6; }
  }
  const col = { note: '#4cc9f0', tag: '#ffd166', page: '#b388ff' }, ecol = { link: '#ffffff', tag: '#ffd16688', page: '#b388ff66' };
  M.innerHTML = `<h3 class="nt-h">Node map <small>${ns.length} notes · notes (blue), tags (yellow), pages (purple); white lines are [[links]]</small></h3>
    <svg class="nt-map" viewBox="0 0 ${W} ${H}">${edges.map(([a, b, k]) => `<line x1="${nodes[a].x}" y1="${nodes[a].y}" x2="${nodes[b].x}" y2="${nodes[b].y}" stroke="${ecol[k]}" stroke-width="${k === 'link' ? 2 : 1}"/>`).join('')}
    ${nodes.map((N, i) => `<g class="nt-node" data-i="${i}"><circle cx="${N.x}" cy="${N.y}" r="${N.kind === 'note' ? 7 : 5}" fill="${col[N.kind]}"/><text x="${N.x + 9}" y="${N.y + 4}">${esc(N.label.slice(0, 32))}</text></g>`).join('')}</svg>
    ${ns.length ? '' : '<p class="nt-fine">Create notes, add tags and [[links]] to see the map.</p>'}`;
  M.querySelectorAll('.nt-node').forEach((g) => (g.onclick = () => { const N = nodes[+g.dataset.i]; if (N.kind === 'note') { S.cur = N.ref; S.view = 'edit'; document.querySelectorAll('#nt-panel [data-v]').forEach((x) => x.classList.toggle('on', x.dataset.v === 'edit')); render(); } else if (N.kind === 'tag') { S.tag = N.label.slice(1); renderList(); } else goCtx(N.ref); }));
}

// ------------------------------------------------------------------ download / backup
function save(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
function downloadNote(n) {
  const head = `# ${n.title || 'Untitled'}\n\n_${n.ctx ? `Written on ${n.ctx.page}${n.ctx.label ? ` · ${n.ctx.label}` : ''} · ` : ''}created ${fmtT(n.created)} · updated ${fmtT(n.updated)}_${n.tags.length ? `\n\nTags: ${n.tags.map((t) => `#${t}`).join(' ')}` : ''}\n\n`;
  const att = n.media.length ? `\n\n## Attachments\n\n${n.media.map((m) => `- ${m.caption || m.name} (${m.type}, ${(m.size / 1e6).toFixed(2)} MB${m.duration ? `, ${m.duration.toFixed(0)} s` : ''}) — file: data/anatomy_lab/notes/media/${m.id}.${m.ext}`).join('\n')}\n` : '';
  save(new Blob([head + n.body + att], { type: 'text/markdown' }), `${(n.title || 'note').replace(/[^\w.-]+/g, '_')}.md`);
}
async function backup() {
  const media = await getAll('media'), b64 = (blob) => new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(blob); });
  const out = { app: 'Meridian Anatomy Lab notes', version: 1, exported: now(), notes: S.notes, media: await Promise.all(media.map(async (m) => ({ ...m, blob: undefined, data: await b64(m.blob) }))) };
  save(new Blob([JSON.stringify(out)], { type: 'application/json' }), `meridian_notes_${new Date().toISOString().slice(0, 10)}.json`);
}
async function importBackup(file) {
  if (!file) return;
  try {
    const d = JSON.parse(await file.text()); let n = 0;
    for (const m of d.media || []) { const blob = await (await fetch(m.data)).blob(); const rec = { ...m, data: undefined, blob }; await put('media', rec); mirrorBlob(rec); }
    for (const x of d.notes || []) { await put('notes', x); mirrorNote(x); n++; }
    S.notes = (await getAll('notes')).filter((x) => !x.deleted); status(`Imported ${n} notes`); render();
  } catch (e) { status(`Import failed: ${e.message}`); }
}

function injectCss() {
  const st = document.createElement('style');
  st.textContent = `
  #nt-fab{position:fixed;right:18px;bottom:18px;z-index:9998;border:1px solid #4cc9f0;background:#0b1a2e;color:#cfefff;border-radius:999px;padding:9px 15px;font-weight:600;cursor:pointer;box-shadow:0 6px 24px rgba(0,0,0,.45)}
  #nt-fab.on{background:#4cc9f0;color:#06121f}
  #nt-panel{position:fixed;right:18px;bottom:66px;width:720px;height:560px;min-width:380px;min-height:300px;max-width:96vw;max-height:92vh;z-index:9999;display:flex;flex-direction:column;background:rgba(8,18,34,.97);border:1px solid rgba(76,201,240,.45);border-radius:12px;box-shadow:0 18px 60px rgba(0,0,0,.6);resize:both;overflow:hidden;color:#dfe7f5;font-size:13px;backdrop-filter:blur(6px)}
  #nt-panel[hidden]{display:none}
  #nt-head{display:flex;align-items:center;gap:6px;padding:6px 10px;background:rgba(76,201,240,.08);cursor:move;user-select:none;border-bottom:1px solid rgba(255,255,255,.07)}
  .nt-sp{flex:1}.nt-fine{font-size:11px;opacity:.7}
  .nt-hb{background:transparent;border:1px solid rgba(255,255,255,.15);color:#dfe7f5;border-radius:6px;padding:2px 8px;cursor:pointer;font-size:12px}.nt-hb.on{background:#4cc9f0;color:#06121f}
  #nt-body{flex:1;display:grid;grid-template-columns:210px 1fr;min-height:0}
  #nt-side{border-right:1px solid rgba(255,255,255,.07);display:flex;flex-direction:column;min-height:0;padding:6px;gap:6px}
  #nt-list{list-style:none;margin:0;padding:0;overflow:auto;flex:1}#nt-list li{padding:6px;border-radius:6px;cursor:pointer;display:flex;flex-direction:column}#nt-list li small{opacity:.6;font-size:10px}#nt-list li.on,#nt-list li:hover{background:rgba(76,201,240,.13)}
  #nt-main{overflow:auto;padding:8px 10px;display:flex;flex-direction:column;gap:6px;min-height:0}
  .nt-row{display:flex;gap:4px;align-items:center}.nt-row input{flex:1;min-width:0}
  #nt-panel input,#nt-panel textarea{background:#050c18;color:#dfe7f5;border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:5px 7px;font:inherit}
  .nt-btn{background:transparent;border:1px solid rgba(255,255,255,.18);color:#dfe7f5;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:12px;text-decoration:none}.nt-btn.pri{background:#4cc9f0;color:#06121f;border-color:#4cc9f0}
  .nt-title{font-size:16px;font-weight:600}.nt-meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.nt-meta input{flex:1;min-width:120px}
  .nt-tools{display:flex;flex-wrap:wrap;gap:3px;align-items:center}.nt-tools button,.nt-tools label{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);color:#dfe7f5;border-radius:5px;padding:2px 7px;cursor:pointer;font-size:12px}.nt-sep{width:8px}
  #nt-text{flex:1;min-height:180px;resize:vertical;line-height:1.5}
  .nt-preview{flex:1;overflow:auto;line-height:1.5}.nt-preview a{color:#4cc9f0}.nt-ul{padding-left:18px;margin:4px 0}
  .nt-media{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}.nt-att{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:6px;display:flex;flex-direction:column;gap:4px}
  .nt-att img,.nt-att video{width:100%;border-radius:6px;max-height:180px;object-fit:contain;background:#000}.nt-att audio{width:100%}
  .nt-ripple{position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:3px solid #ffd166;pointer-events:none;z-index:100000;animation:ntr .7s ease-out forwards}@keyframes ntr{from{transform:scale(.3);opacity:1}to{transform:scale(1.6);opacity:0}}
  .nt-acts{max-height:160px;overflow:auto}.nt-act{display:block;width:100%;text-align:left;background:transparent;border:0;border-bottom:1px solid rgba(255,255,255,.05);color:#dfe7f5;font-size:11px;padding:2px 0;cursor:pointer}.nt-act:hover{color:#ffd166}.nt-speed{background:#050c18;color:#dfe7f5;border:1px solid rgba(255,255,255,.15);border-radius:5px;font-size:11px}
  .nt-mark{background:transparent;border:1px solid #ffd16688;color:#ffd166;border-radius:999px;font-size:10px;margin:2px;cursor:pointer}
  #nt-recbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:rgba(255,107,107,.1);border:1px solid rgba(255,107,107,.4);border-radius:8px;padding:6px}#nt-recbar video{width:160px;border-radius:6px}
  .nt-dot{width:10px;height:10px;border-radius:50%;background:#ff4d4d;animation:ntb 1s infinite}@keyframes ntb{50%{opacity:.25}}
  .nt-tag{background:transparent;border:1px solid #ffd16655;color:#ffd166;border-radius:999px;font-size:10px;padding:1px 6px;margin:1px;cursor:pointer}.nt-tag.on{background:#ffd166;color:#06121f}
  .nt-map{width:100%;height:auto;background:#050c18;border-radius:8px}.nt-map text{fill:#dfe7f5;font-size:10px}.nt-node{cursor:pointer}
  .nt-files{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px}.nt-fileit{border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:6px;cursor:pointer;display:flex;flex-direction:column}.nt-fileit small{opacity:.6}
  .nt-h{margin:0;font-size:14px}.nt-empty{margin:auto;text-align:center;max-width:360px}
  @media (max-width:700px){#nt-panel{left:4px!important;right:4px!important;width:auto!important;top:60px!important;height:80vh!important}#nt-body{grid-template-columns:1fr}#nt-side{max-height:30%}}`;
  document.head.appendChild(st);
}
