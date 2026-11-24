// Training 4D on the public static site: runs the Anatomy Lab's own Python (anatomy_lab/training_api.py,
// athletes_api.py, tools/training_engine.py) in the browser with Pyodide, over the privacy-cleaned database built by
// tools/training_web_export.py. The visitor's profile and athletes live only in this browser (IndexedDB, handled by
// static_api.js); nothing is sent anywhere.
/* global importScripts, loadPyodide */
importScripts('https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js');
let py = null, booting = null;

async function boot(base, state) {
  py = await loadPyodide();
  await py.loadPackage('sqlite3');
  const FS = py.FS, mk = (p) => { try { FS.mkdirTree(p); } catch (e) { /* exists */ } };
  ['/app/anatomy_lab', '/app/tools', '/app/data/anatomy_lab/training_system'].forEach(mk);
  const get = async (p) => { const r = await fetch(base + p); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r; };
  for (const [f, dir] of [['training_api.py', 'anatomy_lab'], ['athletes_api.py', 'anatomy_lab'], ['sport_science.py', 'anatomy_lab'], ['training_divisions.py', 'anatomy_lab'], ['builder_api.py', 'anatomy_lab'], ['training_engine.py', 'tools']]) FS.writeFile(`/app/${dir}/${f}`, await (await get(`py/${f}`)).text());
  FS.writeFile('/app/anatomy_lab/__init__.py', ''); FS.writeFile('/app/tools/__init__.py', '');
  const man = await (await get('manifest.json')).json();
  const parts = await Promise.all(man.parts.map(async (p) => new Uint8Array(await (await get(p)).arrayBuffer())));
  const gz = new Blob(parts), db = new Uint8Array(await new Response(gz.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  FS.writeFile('/app/data/anatomy_lab/training_system/ts.sqlite', db);
  FS.writeFile('/app/data/anatomy_lab/training_system/profile.json', state.profile || await (await get('profile_template.json')).text());
  if (state.athletes) FS.writeFile('/app/data/anatomy_lab/training_system/athletes.sqlite', state.athletes);
  if (state.builder) FS.writeFile('/app/data/anatomy_lab/training_system/builder.sqlite', state.builder);
  py.runPython('import sys, json\nsys.path.insert(0, "/app")\nfrom anatomy_lab import training_api as T, athletes_api as A');
}

self.onmessage = async (ev) => {
  const { id, kind, base, state, method, path, query, body } = ev.data;
  try {
    if (kind === 'boot') { booting = booting || boot(base, state); await booting; self.postMessage({ id, ok: true }); return; }
    await booting;
    py.globals.set('_p', path); py.globals.set('_q', py.toPy(query || {})); py.globals.set('_b', py.toPy(body || {}));
    const mod = path.startsWith('/api/ath/') ? 'A' : 'T';
    const out = py.runPython(method === 'GET' ? `json.dumps(${mod}.handle_get(_p, _q), default=str)` : `json.dumps(${mod}.handle_post(_p, _b), default=str)`);
    const [code, obj] = JSON.parse(out);
    let persist = null;
    if (method !== 'GET') { // keep the visitor's own data in their browser
      const FS = py.FS, d = '/app/data/anatomy_lab/training_system/';
      persist = { profile: FS.analyzePath(d + 'profile.json').exists ? FS.readFile(d + 'profile.json', { encoding: 'utf8' }) : null,
        athletes: FS.analyzePath(d + 'athletes.sqlite').exists ? FS.readFile(d + 'athletes.sqlite') : null,
        builder: FS.analyzePath(d + 'builder.sqlite').exists ? FS.readFile(d + 'builder.sqlite') : null };
    }
    self.postMessage({ id, ok: true, code, obj, persist });
  } catch (e) { self.postMessage({ id, ok: false, error: String(e && e.message || e) }); }
};
