// Accounts on this device (public static site only). Each person signs up / signs in and gets their own space for
// everything they create: Training 4D profile and athletes, own exercises / workouts / sessions, notes and recordings,
// imaging labels, quiz scores and choices. Nothing is uploaded: data stays in this browser, kept apart per account,
// and moves between devices with "Export my data" / "Import".
//
// How: a classic script loaded before the app. It namespaces the personal localStorage keys and IndexedDB databases
// by account ("name@<account id>"); the signed-out "Guest" space uses the original names, so earlier visitors keep
// their data. Passwords are checked against a PBKDF2-SHA-256 hash (150,000 iterations, random salt); the password
// itself is never stored. This separates people who share a browser; it is not encryption: anyone who can open this
// browser profile's storage could read it. On a shared computer, use a private window or your own browser profile.
(function () {
  'use strict';
  var ACC = 'mx-accounts', SES = 'mx-session';
  var LS_RE = /^(ex-custom|learnScore|ts-actor|ts-player|nt-pos|nt-autoconv|eq-presets)$/;
  var DB_RE = /^(meridian-notes|meridian-ts|meridian-ann)$/;
  var DBS = ['meridian-notes', 'meridian-ts', 'meridian-ann'];
  var SP = Storage.prototype, rawGet = SP.getItem, rawSet = SP.setItem, rawDel = SP.removeItem;
  var rawOpen = IDBFactory.prototype.open, rawDelDb = IDBFactory.prototype.deleteDatabase;
  function readAccounts() { try { return JSON.parse(rawGet.call(localStorage, ACC) || '[]'); } catch (e) { return []; } }
  function writeAccounts(a) { rawSet.call(localStorage, ACC, JSON.stringify(a)); }
  var current = null;
  try { current = rawGet.call(sessionStorage, SES) || rawGet.call(localStorage, SES) || null; } catch (e) { current = null; }
  if (current && !readAccounts().some(function (a) { return a.id === current; })) current = null;
  var sfx = function (acct) { return acct ? '@' + acct : ''; };
  var lsKey = function (k, acct) { return LS_RE.test(k) && acct ? k + sfx(acct) : k; };
  var dbName = function (n, acct) { return DB_RE.test(n) && acct ? n + sfx(acct) : n; };
  SP.getItem = function (k) { return rawGet.call(this, this === window.localStorage ? lsKey(k, current) : k); };
  SP.setItem = function (k, v) { return rawSet.call(this, this === window.localStorage ? lsKey(k, current) : k, v); };
  SP.removeItem = function (k) { return rawDel.call(this, this === window.localStorage ? lsKey(k, current) : k); };
  IDBFactory.prototype.open = function (n, v) { return v === undefined ? rawOpen.call(this, dbName(n, current)) : rawOpen.call(this, dbName(n, current), v); };
  IDBFactory.prototype.deleteDatabase = function (n) { return rawDelDb.call(this, dbName(n, current)); };

  // ---------------------------------------------------------------- password hashing
  var enc = new TextEncoder();
  var b64 = function (buf) { var s = '', u = new Uint8Array(buf); for (var i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  var unb64 = function (s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  async function hash(pw, saltB64) {
    var key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
    return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltB64), iterations: 150000 }, key, 256));
  }

  // ---------------------------------------------------------------- data copy / backup (raw names, no namespacing)
  function req(r) { return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
  async function exists(name) { if (!indexedDB.databases) return true; var l = await indexedDB.databases(); return l.some(function (d) { return d.name === name; }); }
  async function pack(v) {
    if (v instanceof Blob) return { __blob: b64(await v.arrayBuffer()), type: v.type };
    if (v instanceof ArrayBuffer) return { __ab: b64(v) };
    if (ArrayBuffer.isView(v)) return { __u8: b64(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength)) };
    if (Array.isArray(v)) { var a = []; for (var i = 0; i < v.length; i++) a.push(await pack(v[i])); return a; }
    if (v && typeof v === 'object' && !(v instanceof Date)) { var o = {}; for (var k in v) o[k] = await pack(v[k]); return o; }
    return v;
  }
  function unpack(v) {
    if (Array.isArray(v)) return v.map(unpack);
    if (v && typeof v === 'object') {
      if (v.__blob !== undefined) return new Blob([unb64(v.__blob)], { type: v.type || '' });
      if (v.__ab !== undefined) return unb64(v.__ab).buffer;
      if (v.__u8 !== undefined) return unb64(v.__u8);
      var o = {}; for (var k in v) o[k] = unpack(v[k]); return o;
    }
    return v;
  }
  async function dumpDb(raw) {
    if (!(await exists(raw))) return null;
    var d = await req(rawOpen.call(indexedDB, raw)), out = { version: d.version, stores: [] };
    for (var i = 0; i < d.objectStoreNames.length; i++) {
      var sn = d.objectStoreNames[i], s = d.transaction(sn).objectStore(sn);
      var keys = await req(s.getAllKeys()), vals = await req(d.transaction(sn).objectStore(sn).getAll());
      out.stores.push({ name: sn, keyPath: s.keyPath, autoIncrement: s.autoIncrement, keys: await pack(keys), values: await pack(vals) });
    }
    d.close(); return out;
  }
  async function restoreDb(raw, dump) {
    await req(rawDelDb.call(indexedDB, raw)).catch(function () {});
    if (!dump) return;
    var r = rawOpen.call(indexedDB, raw, dump.version || 1);
    r.onupgradeneeded = function () { dump.stores.forEach(function (st) { var o = { autoIncrement: !!st.autoIncrement }; if (st.keyPath != null) o.keyPath = st.keyPath; r.result.createObjectStore(st.name, o); }); };
    var d = await req(r);
    for (var i = 0; i < dump.stores.length; i++) {
      var st = dump.stores[i], keys = unpack(st.keys), vals = unpack(st.values);
      await new Promise(function (res, rej) { var t = d.transaction(st.name, 'readwrite'), s = t.objectStore(st.name); vals.forEach(function (v, j) { st.keyPath != null ? s.put(v) : s.put(v, keys[j]); }); t.oncomplete = res; t.onerror = function () { rej(t.error); }; });
    }
    d.close();
  }
  async function exportSpace(acct) {
    var out = { app: 'meridian-4d', format: 1, exported: new Date().toISOString(), ls: {}, dbs: {} };
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i), base = acct ? k.slice(0, -sfx(acct).length) : k; if ((acct ? k.endsWith(sfx(acct)) : true) && LS_RE.test(base)) out.ls[base] = rawGet.call(localStorage, k); }
    for (var j = 0; j < DBS.length; j++) out.dbs[DBS[j]] = await dumpDb(dbName(DBS[j], acct));
    return out;
  }
  async function importSpace(acct, data) {
    if (!data || data.app !== 'meridian-4d') throw new Error('not a Meridian 4D backup file');
    Object.keys(data.ls || {}).forEach(function (k) { if (LS_RE.test(k)) rawSet.call(localStorage, lsKey(k, acct), data.ls[k]); });
    for (var j = 0; j < DBS.length; j++) if (data.dbs && DBS[j] in data.dbs) await restoreDb(dbName(DBS[j], acct), data.dbs[DBS[j]]);
  }
  async function wipeSpace(acct) {
    var ks = []; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k.endsWith(sfx(acct))) ks.push(k); }
    ks.forEach(function (k) { rawDel.call(localStorage, k); });
    for (var j = 0; j < DBS.length; j++) await req(rawDelDb.call(indexedDB, dbName(DBS[j], acct))).catch(function () {});
  }

  // ---------------------------------------------------------------- actions
  function setSession(id, remember) {
    try { rawDel.call(sessionStorage, SES); rawDel.call(localStorage, SES); if (id) rawSet.call(remember ? localStorage : sessionStorage, SES, id); } catch (e) { /* blocked */ }
  }
  async function signUp(name, pw, remember, copyGuest) {
    name = String(name || '').trim();
    if (name.length < 2) throw new Error('Choose a name of at least 2 characters.');
    if (String(pw || '').length < 8) throw new Error('Use a password of at least 8 characters.');
    var list = readAccounts(); if (list.some(function (a) { return a.name.toLowerCase() === name.toLowerCase(); })) throw new Error('That name is taken on this device.');
    var salt = b64(crypto.getRandomValues(new Uint8Array(16))), id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2)).replace(/-/g, '').slice(0, 16);
    list.push({ id: id, name: name, salt: salt, hash: await hash(pw, salt), created: new Date().toISOString() }); writeAccounts(list);
    if (copyGuest) await importSpace(id, await exportSpace(null));
    setSession(id, remember); location.reload();
  }
  async function signIn(name, pw, remember) {
    var a = readAccounts().find(function (x) { return x.name.toLowerCase() === String(name || '').trim().toLowerCase(); });
    if (!a || (await hash(pw, a.salt)) !== a.hash) throw new Error('Name or password not recognised on this device.');
    setSession(a.id, remember); location.reload();
  }
  function signOut() { setSession(null); location.reload(); }
  async function deleteAccount(pw) {
    var list = readAccounts(), a = list.find(function (x) { return x.id === current; }); if (!a) return;
    if ((await hash(pw, a.salt)) !== a.hash) throw new Error('Password not recognised.');
    await wipeSpace(a.id); writeAccounts(list.filter(function (x) { return x.id !== a.id; })); setSession(null); location.reload();
  }
  async function changePassword(oldPw, newPw) {
    var list = readAccounts(), a = list.find(function (x) { return x.id === current; }); if (!a) return;
    if ((await hash(oldPw, a.salt)) !== a.hash) throw new Error('Current password not recognised.');
    if (String(newPw || '').length < 8) throw new Error('Use a password of at least 8 characters.');
    a.salt = b64(crypto.getRandomValues(new Uint8Array(16))); a.hash = await hash(newPw, a.salt); writeAccounts(list);
  }
  async function download() {
    var data = await exportSpace(current), me = readAccounts().find(function (x) { return x.id === current; });
    var url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })), a = document.createElement('a');
    a.href = url; a.download = 'meridian-4d-' + (me ? me.name.replace(/[^A-Za-z0-9_-]+/g, '_') : 'guest') + '-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  // ---------------------------------------------------------------- UI
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  function me() { return readAccounts().find(function (x) { return x.id === current; }) || null; }
  function render(dlg) {
    var m = me();
    var priv = '<p class="acct-fine">Your data stays in this browser, kept apart per account. Nothing is uploaded. Export a backup to move it to another device, or to keep it safe if this browser’s data is cleared. Accounts separate people who share a browser; they are not encryption.</p>';
    dlg.innerHTML = m ? '<form method="dialog" class="acct-x"><button aria-label="Close">✕</button></form>' +
      '<h3>Signed in as ' + esc(m.name) + '</h3><p class="acct-fine">Account created ' + esc(new Date(m.created).toLocaleDateString()) + '. Everything you make in Training 4D, exercises, notes, recordings and imaging labels is saved to this account.</p>' +
      '<div class="acct-row"><button data-a="export" class="primary small">Export my data</button><label class="ghost-btn acct-file">Import a backup<input type="file" accept=".json,application/json" data-a="import" hidden></label><button data-a="signout" class="ghost-btn">Sign out</button></div>' +
      '<details><summary>Change password</summary><div class="acct-row"><input type="password" data-f="old" placeholder="Current password" autocomplete="current-password"><input type="password" data-f="new" placeholder="New password (8+)" autocomplete="new-password"><button data-a="pw" class="ghost-btn">Change</button></div></details>' +
      '<details><summary>Delete this account</summary><p class="acct-fine">Deletes the account and all its data from this browser. Export first if you want to keep it.</p><div class="acct-row"><input type="password" data-f="delpw" placeholder="Password" autocomplete="current-password"><button data-a="delete" class="ghost-btn danger">Delete account and data</button></div></details>' +
      '<p class="acct-msg" data-msg></p>' + priv
      : '<form method="dialog" class="acct-x"><button aria-label="Close">✕</button></form>' +
      '<h3>Sign in or create an account</h3><p class="acct-fine">You are using the site as a guest. Create an account to keep your own profile, athletes, exercises, notes and labels separate and backed up.</p>' +
      '<div class="acct-cols"><div><h4>Sign in</h4><input data-f="n1" placeholder="Name" autocomplete="username"><input type="password" data-f="p1" placeholder="Password" autocomplete="current-password"><label class="acct-fine"><input type="checkbox" data-f="r1" checked> Keep me signed in on this device</label><button data-a="signin" class="primary small">Sign in</button></div>' +
      '<div><h4>Create account</h4><input data-f="n2" placeholder="Name" autocomplete="username"><input type="password" data-f="p2" placeholder="Password (8+ characters)" autocomplete="new-password"><input type="password" data-f="p3" placeholder="Repeat password" autocomplete="new-password"><label class="acct-fine"><input type="checkbox" data-f="g2" checked> Bring my guest data into the new account</label><label class="acct-fine"><input type="checkbox" data-f="r2" checked> Keep me signed in on this device</label><button data-a="signup" class="primary small">Create account</button></div></div>' +
      '<div class="acct-row"><button data-a="export" class="ghost-btn">Export guest data</button><label class="ghost-btn acct-file">Import a backup as guest<input type="file" accept=".json,application/json" data-a="import" hidden></label></div>' +
      '<p class="acct-msg" data-msg></p>' + priv;
    var f = function (k) { var el = dlg.querySelector('[data-f="' + k + '"]'); return el ? (el.type === 'checkbox' ? el.checked : el.value) : ''; };
    var say = function (t, bad) { var el = dlg.querySelector('[data-msg]'); el.textContent = t; el.className = 'acct-msg' + (bad ? ' bad' : ''); };
    var run = function (fn) { return function (e) { e.preventDefault(); say('Working…'); fn().catch(function (err) { say(err.message || String(err), true); }); }; };
    var on = function (a, fn) { var el = dlg.querySelector('[data-a="' + a + '"]'); if (el) el.addEventListener(el.type === 'file' ? 'change' : 'click', run(fn)); };
    on('signin', function () { return signIn(f('n1'), f('p1'), f('r1')); });
    on('signup', function () { if (f('p2') !== f('p3')) return Promise.reject(new Error('The passwords do not match.')); return signUp(f('n2'), f('p2'), f('r2'), f('g2')); });
    on('signout', function () { signOut(); return Promise.resolve(); });
    on('export', function () { return download().then(function () { say('Backup downloaded.'); }); });
    on('import', function () { var file = dlg.querySelector('[data-a="import"]').files[0]; if (!file) return Promise.resolve(); return file.text().then(function (t) { return importSpace(current, JSON.parse(t)); }).then(function () { say('Imported. Reloading…'); setTimeout(function () { location.reload(); }, 600); }); });
    on('pw', function () { return changePassword(f('old'), f('new')).then(function () { say('Password changed.'); }); });
    on('delete', function () { return deleteAccount(f('delpw')); });
  }
  function mount() {
    var css = document.createElement('style');
    css.textContent = '#acct-btn{cursor:pointer}#acct-dlg{max-width:640px;width:calc(100% - 32px);background:#0b1626;color:#dfe7f5;border:1px solid #2a4d7a;border-radius:12px;padding:18px 20px}#acct-dlg::backdrop{background:rgba(0,0,0,.55)}' +
      '#acct-dlg h3{margin:0 0 6px}#acct-dlg h4{margin:4px 0}#acct-dlg input:not([type=checkbox]):not([type=file]){display:block;width:100%;margin:5px 0;padding:7px 9px;border-radius:7px;border:1px solid #2a4d7a;background:#06101e;color:inherit}' +
      '.acct-cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:560px){.acct-cols{grid-template-columns:1fr}}.acct-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0}.acct-row input{flex:1;min-width:140px}' +
      '.acct-fine{font-size:12px;opacity:.8;display:block;margin:6px 0}.acct-msg{min-height:1.2em;font-size:13px;color:#64e6a8}.acct-msg.bad{color:#ff8a8a}.acct-x{float:right}.acct-x button{background:none;border:0;color:inherit;font-size:18px;cursor:pointer}.acct-file{cursor:pointer}.danger{border-color:#ff6b6b!important;color:#ff8a8a!important}';
    document.head.appendChild(css);
    var m = me(), btn = document.createElement('button');
    btn.id = 'acct-btn'; btn.className = 'chip'; btn.type = 'button'; btn.textContent = m ? '\u{1F464} ' + m.name : '\u{1F464} Sign in';
    btn.title = m ? 'Your account on this device' : 'Guest. Sign in or create an account to keep your own data';
    var dlg = document.createElement('dialog'); dlg.id = 'acct-dlg'; document.body.appendChild(dlg);
    btn.onclick = function () { render(dlg); dlg.showModal(); };
    var host = document.querySelector('header .chip.ok'); host ? host.parentNode.insertBefore(btn, host) : document.body.appendChild(btn);
  }
  window.__ACCOUNT = { id: current, name: (me() || {}).name || null, exportSpace: exportSpace, importSpace: importSpace, signUp: signUp, signIn: signIn, signOut: signOut };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
