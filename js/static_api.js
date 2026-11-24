// Static-site stand-in for the local server (loaded only on the public GitHub Pages build).
// Answers the app's /api/... calls from precomputed files in rt/sapi/ (tools/anatomy_lab_static_api.py), using the same
// search rules as anatomy_lab/server.py, so Clinical, care pathways, the medications library, Body systems and
// DNA -> Protein work without a server. Imaging labels are kept in this browser (per account, js/accounts.js). Other writes (notes mirror, conversions) answer
// "offline": on the public site those stay in the visitor's own browser.

const SAPI = new URL('../rt/sapi/', import.meta.url).href;
const cache = new Map();
const realFetch = window.fetch.bind(window);
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
async function get(path, gz = false) {
  if (cache.has(path)) return cache.get(path);
  const p = (async () => {
    const r = await realFetch(SAPI + path);
    if (!r.ok) return null;
    if (!gz) return r.json();
    const ds = r.body.pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(ds).text());
  })();
  cache.set(path, p);
  return p;
}
const num = (id) => String(id).split('-').pop();

const H = {
  async 'clinical/search'(q) {
    const words = (q.get('q') || '').toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => w.length > 1).slice(0, 6) || [];
    if (!words.length) return [];
    const kind = q.get('type') || 'all', lim = Math.min(100, +(q.get('limit') || 30)), ql = (q.get('q') || '').toLowerCase().trim();
    const idx = await get('clinical/index.json');
    const rows = idx.filter(([, t, ty]) => words.every((w) => t.toLowerCase().includes(w)) && (!['condition', 'drug', 'procedure', 'anatomy', 'topic'].includes(kind) || ty === kind)).slice(0, 400);
    rows.sort((a, b) => ((a[1].toLowerCase() === ql ? 0 : a[1].toLowerCase().startsWith(ql) ? 1 : 2) - (b[1].toLowerCase() === ql ? 0 : b[1].toLowerCase().startsWith(ql) ? 1 : 2)) || a[1].length - b[1].length);
    return rows.slice(0, lim).map(([id, title, type]) => ({ id, title, type }));
  },
  async 'clinical/doc'(q) { return (await get(`clinical/doc/${num(q.get('id'))}.json.gz`, true)) || { error: 'not found' }; },
  async 'clinical/pathway'(q) {
    const t = (q.get('q') || '').trim().toLowerCase(), idx = await get('clinical/index.json');
    const hit = idx.find(([, ti, ty]) => ty === 'condition' && ti.toLowerCase() === t) || idx.find(([, ti]) => ti.toLowerCase() === t);
    const p = hit ? await get(`clinical/pathway/${num(hit[0])}.json.gz`, true) : null;
    return p || { refused: false, found: false, banner: '', message: 'Care pathways on the public site are prepared for condition chapters.' };
  },
  async 'drugs/search'(q) {
    const t = (q.get('q') || '').trim().toLowerCase(), cls = (q.get('cls') || '').trim().toLowerCase(), idx = await get('drugs/index.json');
    return idx.filter(([g, b, , epc]) => (!t || g.toLowerCase().includes(t) || (b || '').toLowerCase().includes(t)) && (!cls || (epc || '').toLowerCase().includes(cls)))
      .sort((a, b) => b[5] - a[5] || a[0].localeCompare(b[0])).slice(0, 200)
      .map(([generic, brands, routes, epc, type, n, statpearls]) => ({ generic, brands, routes, epc, type, n_conditions: String(n), statpearls }));
  },
  async 'drugs/get'(q) { const g = (q.get('g') || '').toUpperCase(), idx = await get('drugs/index.json'), r = idx.find((x) => x[0] === g); return (r && (await get(`drugs/get/${r[7]}.json.gz`, true))) || { error: 'not found' }; },
  async 'drugs/for_condition'(q) { return (await get('drugs/for_condition.json'))[q.get('doc')] || []; },
  async 'drugs/classes'() { return get('drugs/classes.json'); },
  async 'mol/search'(q) {
    const s = (q.get('q') || '').trim(); if (s.length < 2) return { genes: [], pathways: [] };
    const sl = s.toLowerCase(), idx = await get('mol/index.json');
    const g = idx.genes.filter(([sym, d]) => sym.toLowerCase().startsWith(sl) || (d || '').toLowerCase().includes(sl))
      .sort((a, b) => ((b[0].toLowerCase() === sl) - (a[0].toLowerCase() === sl)) || (((b[1] || '').toLowerCase() === sl) - ((a[1] || '').toLowerCase() === sl)) || (b[0].toLowerCase().startsWith(sl) - a[0].toLowerCase().startsWith(sl)) || (a[1] || '').length - (b[1] || '').length).slice(0, 30);
    const pw = idx.pathways.filter(([, n]) => n.toLowerCase().includes(sl)).sort((a, b) => a[1].length - b[1].length).slice(0, 30);
    return { genes: g.map(([symbol, description]) => ({ symbol, description })), pathways: pw.map(([id, name]) => ({ id, name })) };
  },
  async 'mol/gene'(q) { return (await get(`mol/gene/${(q.get('s') || '').toUpperCase()}.json.gz`, true)) || { error: 'not found' }; },
  async 'mol/pathway'(q) { return (await get(`mol/pathway/${q.get('id')}.json.gz`, true)) || { error: 'not found' }; },
  async 'mol/tissues_for'(q) {
    const tm = await get('mol/tissue_map.json'), out = {};
    for (const s of (q.get('s') || '').split(',').slice(0, 60)) for (const [t, v] of tm[s] || []) { const o = (out[t] ||= { genes: 0, ntpm: 0 }); o.genes += 1; o.ntpm = Math.max(o.ntpm, v); }
    return out;
  },
  async 'mol/top'() { return get('mol/top.json'); },
  async 'mol/tissue'(q) { return (await get(`mol/tissue/${(q.get('t') || '').replace(/[^A-Za-z0-9]+/g, '_')}.json`)) || { tissue: q.get('t'), n_enriched: 0, genes: [], pathways: [] }; },
  async 'gene/search'(q) { const s = (q.get('q') || '').trim().toUpperCase(), idx = await get('gene/index.json'); return idx.filter((g) => g.symbol.startsWith(s)).sort((a, b) => (b.symbol === s) - (a.symbol === s) || a.symbol.length - b.symbol.length).slice(0, 20); },
  async 'gene/model'(q) {
    const s = (q.get('s') || '').trim().toUpperCase(), idx = await get('gene/index.json'), hit = idx.find((g) => g.symbol.toUpperCase() === s);
    if (!hit) return { error: `${s} is not in the public site's learning set (${idx.length} genes; try the suggestions). The full local app covers all 19,336 protein-coding genes.` };
    return get(`gene/${hit.symbol}.json.gz`, true);
  },
  'notes/list'() { return { notes: [], media: [] }; },
  'exercises/custom'() { return { custom: [], workouts: [], sessions: [] }; },
};

// ---- Training 4D: Python in the browser (ts_worker.js); the visitor's profile / athletes kept in IndexedDB
let TSW = null, tsSeq = 0; const tsWait = new Map();
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('meridian-ts', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const kvGet = async (k) => { const d = await idb(); return new Promise((res) => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); };
const kvSet = async (k, v) => { const d = await idb(); return new Promise((res) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => res(); }); };
function tsCall(msg) {
  if (!TSW) {
    TSW = new Worker(new URL('./ts_worker.js', import.meta.url));
    TSW.onmessage = (e) => { const w = tsWait.get(e.data.id); if (w) { tsWait.delete(e.data.id); w(e.data); } };
    TSW.__boot = (async () => { const [profile, athletes, builder] = await Promise.all([kvGet('profile'), kvGet('athletes'), kvGet('builder')]);
      return new Promise((res) => { const id = ++tsSeq; tsWait.set(id, res); TSW.postMessage({ id, kind: 'boot', base: SAPI + 'ts/', state: { profile, athletes, builder } }); }); })();
  }
  return TSW.__boot.then((b) => (b.ok ? new Promise((res) => { const id = ++tsSeq; tsWait.set(id, res); TSW.postMessage({ id, ...msg }); }) : b));
}
async function tsRoute(url, method, init) {
  const path = url.pathname.replace(/^.*(\/api\/)/, '/api/');
  if (/^\/api\/ts\/(sync|upload)/.test(path)) return json({ ok: false, error: 'Workbook sync is part of the owner\u2019s local app; the public site uses a fixed, privacy-cleaned copy.' }, 200);
  const query = {}; url.searchParams.forEach((v, k) => { (query[k] ||= []).push(v); });
  let body = {}; if (method !== 'GET' && init.body) { try { body = JSON.parse(init.body); } catch { body = {}; } }
  const r = await tsCall({ method, path, query, body });
  if (!r.ok) return json({ error: `Training engine (in-browser): ${r.error}` }, 500);
  if (r.persist) { if (r.persist.profile) kvSet('profile', r.persist.profile); if (r.persist.athletes) kvSet('athletes', r.persist.athletes); if (r.persist.builder) kvSet('builder', r.persist.builder); }
  return json(r.obj, r.code || 200);
}

// ---- imaging labels: kept in this browser (per account, js/accounts.js), same shape as the local server's files
const annDb = () => new Promise((res, rej) => { const r = indexedDB.open('meridian-ann', 1); r.onupgradeneeded = () => r.result.createObjectStore('ann'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function annGet(k) { const d = await annDb(); return new Promise((res) => { const q = d.transaction('ann').objectStore('ann').get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); }
async function annPut(k, v) { const d = await annDb(); return new Promise((res, rej) => { const t = d.transaction('ann', 'readwrite'); t.objectStore('ann').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }

window.fetch = async (input, init = {}) => {
  const url = new URL(input instanceof URL ? input.href : typeof input === 'string' ? input : input.url, location.href);
  const ann = url.pathname.match(/\/rt\/annotations\/([A-Za-z0-9_-]+)\/(\d+)\.json$/);
  if (ann) { const v = await annGet(`${ann[1]}/${ann[2]}`); return v ? json(v) : json({ error: 'none' }, 404); }
  if (/\/api\/annotations$/.test(url.pathname) && (init.method || 'GET').toUpperCase() === 'POST') {
    try { const b = JSON.parse(init.body || '{}'); if (!/^[A-Za-z0-9_-]+$/.test(b.task || '') || !Number.isInteger(+b.n)) return json({ ok: false, error: 'bad request' }, 400);
      const saved = new Date().toISOString(); await annPut(`${b.task}/${+b.n}`, { ...b, saved });
      return json({ ok: true, saved, where: window.__ACCOUNT?.name ? `your account (${window.__ACCOUNT.name}) in this browser` : 'this browser (guest)' });
    } catch (e) { return json({ ok: false, error: String(e) }, 500); }
  }
  const m = url.pathname.match(/\/api\/(.+)$/);
  if (!m) return realFetch(input, init);
  const route = m[1], method = (init.method || (typeof input !== 'string' && input.method) || 'GET').toUpperCase();
  if (/^(ts|ath)\//.test(route)) return tsRoute(url, method, init);
  if (method !== 'GET') return json({ ok: false, error: 'offline: the public site keeps this in your browser only' }, 503);
  const h = H[route];
  if (!h) return json({ error: 'not available on the public site' }, 404);
  try { const r = await h(url.searchParams); return json(r, r && r.error ? 404 : 200); } catch (e) { return json({ error: String(e) }, 500); }
};
window.__STATIC_API = true;
