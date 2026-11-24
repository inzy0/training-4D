// Fascial (myofascial) chains for 3D Atlas · Tissue, fascia & chains. Each chain is drawn station by station through its
// muscles, fasciae and ligaments (crossing to the opposite side where the chain does). Every transition is its own tube,
// coloured by its evidence status; the muscles of the station the pulse is passing glow, with a 3D label per station.
// Options: both sides, follow the pulse, speed, play every chain in turn.
// Stations, evidence and quotes: data/anatomy_lab/tissue/chains.json (tools/fascial_chains_build.py).

import * as THREE from 'three';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SC = { V: 0x19e6a5, C: 0xffb020, N: 0xff4d6d, M: 0x9aa4b2, P: 0x4da3ff, R: 0xb57bff };
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const C = { data: null, chain: null, ctx: null, runs: [], group: null, both: false, follow: false, labels: true, speed: 1, playAll: false, t0: 0, hold: -1, period: 8000 };

export async function chainsPanel(P, T, md, focusSet) {
  C.data ||= await fetch('/training-4D/rt/tissue/chains.json').then((r) => r.json()).catch(() => null);
  if (!C.data) { P.innerHTML = '<section class="card"><p class="muted">Chain data not built yet (tools/fascial_chains_build.py).</p></section>'; return; }
  C.ctx = { P, T, md, focusSet };
  const D = C.data, groups = [...new Set(D.chains.map((c) => c.group))], ch = C.chain || D.chains[0];
  C.chain = ch;
  const fascia = T.know?.topics?.Fascia || [];
  const quotes = D.quotes.filter((q) => (ch.id === 'sbl' ? /superficial back|Achilles tendon – plantar/i.test(q.topic) : ch.id === 'bfl' ? /hub|rotation/i.test(q.topic) : ch.id === 'sl' ? /Spirals/i.test(q.topic) : false));
  const nV = ch.links.filter((l) => l[0] === 'V').length, src = (s) => s ? (s.doi ? `<a href="https://doi.org/${esc(s.doi)}" target="_blank" rel="noopener">${esc(s.cite)}</a>` : `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.cite)}</a>`) : '';
  const legend = Object.entries(D.status).map(([k, v]) => `<span class="ch-lg"><i style="background:${hex(SC[k])}"></i>${esc(v)}</span>`).join('');
  P.innerHTML = `<section class="card"><div class="card-h"><h2>Fascial chains</h2><small>${D.chains.length} chains · ${D.chains.reduce((a, c) => a + c.links.length, 0)} transitions</small></div>
      ${groups.map((g) => `<div class="mini" style="margin-top:6px">${esc(g)}</div><div class="bar">${D.chains.filter((c) => c.group === g).map((c) => `<button class="chip-btn ${c.id === ch.id ? 'on' : ''}" data-ch="${c.id}">${esc(c.name)}</button>`).join('')}</div>`).join('')}
      <div class="bar" style="margin-top:8px"><button class="primary small" id="ch-play">▶ Run tension along the chain</button><button class="ghost-btn" id="ch-all">${C.playAll ? '■ Stop tour' : '⟳ Play all chains'}</button><button class="ghost-btn" id="ch-clear">Clear</button></div>
      <div class="bar ch-opts"><label><input type="checkbox" id="ch-both" ${C.both ? 'checked' : ''}> Both sides</label><label><input type="checkbox" id="ch-follow" ${C.follow ? 'checked' : ''}> Follow the pulse</label>
        <label><input type="checkbox" id="ch-labels" ${C.labels ? 'checked' : ''}> Labels</label><label>Speed <input type="range" id="ch-speed" min="0.25" max="3" step="0.25" value="${C.speed}"></label></div>
      <div class="ch-legend">${legend}</div>
      <p class="fine">${esc(D.rule)}</p></section>
    <section class="card"><div class="card-h"><h2>${esc(ch.name)}</h2><span class="pill">${esc(ch.plane)}</span></div>
      <p class="mini">${ch.nodes.length} stations · ${ch.links.length} transitions · <b style="color:${hex(SC.V)}">${nV} verified</b>. Click a station to hold the glow there.</p>
      <ol class="chain-ol ch-steps">${ch.nodes.map(([lab, m], i) => `<li data-node="${i}" class="ch-node ${C.hold === i ? 'on' : ''}">${esc(lab)}${m.side === 'contra' ? ' <span class="pill warn">opposite side</span>' : ''}${m.side === 'mid' ? ' <span class="pill">midline</span>' : ''}</li>${i < ch.links.length ? `<li class="ch-link" style="--c:${hex(SC[ch.links[i][0]])}"><b>${esc(ch.links[i][0])}</b> ${esc(ch.links[i][1])}</li>` : ''}`).join('')}</ol>
      <p><b>Evidence:</b> ${esc(ch.anatomy)} <small>— ${src(ch.anatomy_src)}</small>${ch.stations_src ? `<br><small>Stations: ${src(ch.stations_src)}</small>` : ''}</p>
      ${ch.force ? `<table class="tt"><thead><tr><th>Transition</th><th>Force transfer</th></tr></thead><tbody>${ch.force.map(([t, f]) => `<tr><td class="mini">${esc(t)}</td><td class="mini">${esc(f)}</td></tr>`).join('')}</tbody></table><p class="fine">Source: ${src(ch.force_src)} (cited, not reproduced).</p>` : ''}
      ${ch.note ? `<p class="fine">${esc(ch.note)}</p>` : ''}${ch.also ? `<p class="fine">${esc(ch.also)}</p>` : ''}
      ${quotes.map((q) => `<blockquote class="q">${esc(q.text)}<footer>${esc(q.topic)} · ${esc(q.cite)} · ${esc(q.licence)} · <a href="https://doi.org/${esc(q.doi)}" target="_blank" rel="noopener">${esc(q.pmcid)}</a></footer></blockquote>`).join('')}
      <p class="mini" id="ch-miss"></p></section>
    <section class="card"><div class="card-h"><h2>How fascia transmits force</h2><small>quoted</small></div>
      ${D.quotes.filter((q) => /force fascia|History|debated|Agreement/i.test(q.topic)).map((q) => `<blockquote class="q">${esc(q.text)}<footer>${esc(q.topic)} · ${esc(q.cite)} · ${esc(q.licence)} · <a href="https://doi.org/${esc(q.doi)}" target="_blank" rel="noopener">${esc(q.pmcid)}</a></footer></blockquote>`).join('')}</section>
    <section class="card"><div class="card-h"><h2>Fascia: types and function</h2><small>StatPearls, quoted</small></div>${fascia.map((c) => `<details><summary>${esc(c.title)}</summary>${Object.entries(c.sections).slice(0, 5).map(([s, x]) => `<p class="mini"><b>${esc(s)}.</b> ${esc(x.slice(0, 1600))}${x.length > 1600 ? '…' : ''}</p>`).join('')}<p class="mini">${esc(c.publisher)} · ${esc(c.licence)}</p></details>`).join('')}</section>
    <section class="card"><div class="card-h"><h2>Whole-body network (graph theory)</h2><small>Life 2025, CC BY</small></div>${D.network_tables.slice(0, 2).map((t) => md(t)).join('')}
      <p class="fine">From “From Myofascial Chains to the Polyconnective Network” (Life 2025, <a href="https://doi.org/10.3390/life15081200" target="_blank" rel="noopener">doi</a>), CC BY.</p></section>
    <section class="card"><div class="card-h"><h2>Studies on force transmission and remote effects</h2><small>${D.studies.length}</small></div>${D.studies.map((s) => `<details><summary>${esc(s.title)} <small>${esc(s.journal)} ${esc(s.year)}</small></summary><p class="mini">${esc(s.abstract)}</p><p class="mini">${esc(s.licence)} · <a href="https://doi.org/${esc(s.doi)}" target="_blank" rel="noopener">doi</a> · ${esc(s.pmcid)}</p></details>`).join('')}
      <p class="fine">${esc(D.attribution)}</p></section>`;
  const $ = (s) => P.querySelector(s);
  P.querySelectorAll('[data-ch]').forEach((b) => (b.onclick = () => { C.chain = D.chains.find((c) => c.id === b.dataset.ch); C.hold = -1; C.playAll = false; chainsPanel(P, T, md, focusSet); draw(); }));
  P.querySelectorAll('[data-node]').forEach((li) => (li.onclick = () => { const i = +li.dataset.node; C.hold = C.hold === i ? -1 : i; P.querySelectorAll('.ch-node').forEach((x) => x.classList.toggle('on', +x.dataset.node === C.hold)); if (!C.runs.length) draw(); }));
  $('#ch-play').onclick = () => { C.hold = -1; draw(); };
  $('#ch-all').onclick = () => { C.playAll = !C.playAll; if (C.playAll) { C.hold = -1; draw(); } chainsPanel(P, T, md, focusSet); };
  $('#ch-clear').onclick = () => { C.playAll = false; clear(); chainsPanel(P, T, md, focusSet); };
  $('#ch-both').onchange = (e) => { C.both = e.target.checked; if (C.runs.length) draw(); };
  $('#ch-follow').onchange = (e) => { C.follow = e.target.checked; };
  $('#ch-labels').onchange = (e) => { C.labels = e.target.checked; C.runs.forEach((r) => r.labels.forEach((s) => (s.visible = C.labels))); };
  $('#ch-speed').oninput = (e) => { C.speed = +e.target.value; };
}

function clear() {
  const T = C.ctx?.T;
  if (C.group && T) { T.scene.remove(C.group); C.group.traverse((o) => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose?.(); }); }
  C.group = null; C.runs = [];
  C.ctx?.focusSet(null);
}

let MID = null;
function midX(T) {
  if (MID !== null) return MID;
  const b = new THREE.Box3(); T.muscles.forEach((m) => b.expandByObject(m)); MID = b.isEmpty() ? 0 : b.getCenter(new THREE.Vector3()).x; return MID;
}

// centre of the part of a mesh on one body side (for parts modelled as a single mesh across the midline)
function sideCentre(mesh, side, T) {
  const pos = mesh.geometry.attributes.position, lx = Math.sign(T.atlas?.anchors?.leftX || 1), want = side === 'left' ? lx : -lx, mx = midX(T);
  const v = new THREE.Vector3(), s = new THREE.Vector3(); let n = 0;
  const step = Math.max(1, Math.floor(pos.count / 4000));
  for (let i = 0; i < pos.count; i += step) { v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld); if (Math.sign(v.x - mx) === want) { s.add(v); n++; } }
  return n ? s.divideScalar(n) : null;
}

function label(text, color) {
  const cv = document.createElement('canvas'), g = cv.getContext('2d'), f = 26;
  g.font = `600 ${f}px system-ui, sans-serif`; const w = Math.min(560, g.measureText(text).width + 28);
  cv.width = w; cv.height = f + 18;
  g.font = `600 ${f}px system-ui, sans-serif`; g.fillStyle = 'rgba(8,10,24,0.78)'; g.strokeStyle = color; g.lineWidth = 3;
  g.beginPath(); g.roundRect(2, 2, w - 4, f + 14, 10); g.fill(); g.stroke();
  g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.fillText(text.length > 40 ? `${text.slice(0, 38)}…` : text, 14, (f + 18) / 2);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true }));
  const h = 0.026; sp.scale.set(h * (w / (f + 18)), h, 1); sp.renderOrder = 1001; return sp;
}

// a piece of the chain curve between two parameters, for one coloured transition tube
class Piece extends THREE.Curve { constructor(c, a, b) { super(); this.c = c; this.a = a; this.b = b; } getPoint(t, o = new THREE.Vector3()) { return o.copy(this.c.getPoint(this.a + (this.b - this.a) * t)); } }

function build(ch, T, home) {
  const other = home === 'left' ? 'right' : 'left';
  const pool = [...T.muscles, ...T.tissue, ...T.tendons];
  const nodes = [], miss = [];
  ch.nodes.forEach(([lab, m], idx) => {
    const sd = m.side === 'contra' ? other : home;
    const rx = [m.m, m.t].filter(Boolean).map((r) => new RegExp(r, 'i'));
    const any = pool.filter((x) => rx.some((r) => r.test(x.userData.name) || r.test(x.userData.part?.n || '')));
    let hits = any.filter((x) => !['origin', 'insertion'].includes(x.userData.kind));
    if (!hits.length) hits = any; // some structures exist only as attachment areas (e.g. patellar ligament)
    const sided = hits.filter((x) => x.userData.side === sd);
    if (m.side !== 'mid' && sided.length) hits = sided; else hits = hits.filter((x) => !x.userData.side || x.userData.side === sd || m.side === 'mid');
    if (!hits.length) { miss.push(lab); return; }
    const pts = hits.map((h) => (!h.userData.side && m.side !== 'mid' ? sideCentre(h, sd, T) : null) || new THREE.Box3().setFromObject(h).getCenter(new THREE.Vector3()));
    const p = pts.reduce((a, b) => a.add(b), new THREE.Vector3()).divideScalar(pts.length);
    nodes.push({ idx, lab, p, meshes: hits });
  });
  return { nodes, miss };
}

function draw() {
  const { T, focusSet } = C.ctx, ch = C.chain;
  clear();
  const home = T.side === 'right' ? 'right' : 'left';
  const sides = C.both || T.side === 'both' ? [home, home === 'left' ? 'right' : 'left'] : [home];
  C.group = new THREE.Group(); C.group.renderOrder = 999;
  const all = new Set(), allPts = []; let missTxt = '';
  for (const sd of sides) {
    const { nodes, miss } = build(ch, T, sd);
    if (sd === home) missTxt = miss.length ? `Not in the 3D model: ${miss.join(', ')}.` : '';
    if (nodes.length < 2) continue;
    nodes.forEach((n) => { n.meshes.forEach((m) => all.add(m)); allPts.push(n.p); });
    const curve = new THREE.CatmullRomCurve3(nodes.map((n) => n.p), false, 'centripetal'), k = nodes.length - 1;
    for (let i = 0; i < k; i++) {
      // transition status: the link leaving the station before this drawn node (missing stations are skipped over)
      const st = ch.links[Math.min(nodes[i + 1].idx - 1, ch.links.length - 1)]?.[0] || 'R';
      const geo = new THREE.TubeGeometry(new Piece(curve, i / k, (i + 1) / k), 40, st === 'V' ? 0.0065 : 0.0045, 10, false);
      const tube = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: SC[st], transparent: true, opacity: st === 'V' ? 0.9 : 0.6, depthTest: false }));
      tube.renderOrder = 999; C.group.add(tube);
    }
    const dots = nodes.map((n) => { const d = new THREE.Mesh(new THREE.SphereGeometry(0.011, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false })); d.position.copy(n.p); d.renderOrder = 1000; C.group.add(d); return d; });
    const labels = sd === home ? nodes.map((n, i) => { const s = label(`${n.idx + 1}. ${n.lab}`, '#ff3df2'); s.position.copy(n.p).add(new THREE.Vector3(0, 0.03, 0)); s.visible = C.labels; C.group.add(s); return s; }) : [];
    const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.019, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false })); pulse.renderOrder = 1002;
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.034, 20, 14), new THREE.MeshBasicMaterial({ color: 0xff3df2, transparent: true, opacity: 0.35, depthTest: false })); halo.renderOrder = 1001;
    C.group.add(pulse, halo);
    C.runs.push({ curve, nodes, dots, labels, pulse, halo });
  }
  const missEl = document.querySelector('#ch-miss');
  if (missEl) missEl.textContent = `${missTxt} ${all.size} structures on the path${sides.length > 1 ? ' (both sides)' : ''}.`.trim();
  if (!C.runs.length) return;
  focusSet(all);
  // chain muscles stay clearly visible and tinted; the station the pulse is passing glows (chainTick)
  all.forEach((m) => { const mt = m.material; if (m.userData.kind === 'muscle') { mt.opacity = 0.78; mt.transparent = true; mt.depthWrite = true; } if (mt.emissive) mt.emissive.setHex(0x2a0a22); });
  T.scene.add(C.group);
  const box = new THREE.Box3().setFromPoints(allPts), c = box.getCenter(new THREE.Vector3()), R = box.getSize(new THREE.Vector3()).length();
  const A = T.atlas.anchors, back = /back|posterior|dorsal/i.test(ch.name + ch.plane) ? -1 : 1;
  T.ctl.target.copy(c); T.cam.position.copy(c.clone().add(new THREE.Vector3(0.25, 0.1, back * (A.anterior || 1)).normalize().multiplyScalar(Math.max(0.7, R * 1.95))));
  C.period = 1500 * Math.max(2, C.runs[0].nodes.length - 1);
  C.t0 = performance.now();
}

const tmp = new THREE.Color(), PINK = new THREE.Color(0xff2fb0), BASE = new THREE.Color(0x2a0a22);
export function chainTick(t) {
  if (!C.runs.length) return;
  const el = Math.max(0, (t - C.t0) * C.speed), u = Math.min(0.9999, (el / C.period) % 1); // rAF time can precede t0
  if (C.playAll && el > C.period * 2) { // tour: next chain after two passes
    const L = C.data.chains, i = L.indexOf(C.chain); C.chain = L[(i + 1) % L.length];
    const { P, T, md, focusSet } = C.ctx; chainsPanel(P, T, md, focusSet); draw(); return;
  }
  for (const r of C.runs) {
    const k = r.nodes.length - 1, pos = C.hold >= 0 ? null : u * k;
    const p = r.curve.getPoint(pos === null ? 0 : u);
    if (pos === null) { const hn = r.nodes.find((n) => n.idx === C.hold); if (hn) p.copy(hn.p); }
    r.pulse.position.copy(p); r.halo.position.copy(p);
    const beat = 1 + 0.35 * Math.sin(t / 110); r.pulse.scale.setScalar(beat); r.halo.scale.setScalar(1.2 + 0.5 * Math.sin(t / 160));
    r.nodes.forEach((n, i) => {
      const w = pos === null ? (n.idx === C.hold ? 1 : 0) : Math.max(0, 1 - Math.abs(pos - i) * 1.6);
      tmp.copy(BASE).lerp(PINK, w);
      n.meshes.forEach((m) => { if (m.material.emissive) { m.material.emissive.copy(tmp); m.material.emissiveIntensity = 1 + w * 1.5; } });
      r.dots[i].scale.setScalar(1 + w * 1.4);
      if (r.labels[i]) r.labels[i].material.opacity = 0.55 + 0.45 * w;
    });
  }
  if (C.follow && C.ctx) C.ctx.T.ctl.target.lerp(C.runs[0].pulse.position, 0.06);
}
