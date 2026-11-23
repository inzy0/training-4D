// All brain areas with their position: every structure in the Brain map (BodyParts3D brain parts, CIT168 nuclei,
// Harvard AAN nuclei when present, Yeo networks, cranial nerves) listed by group with
//   - side and group (lobe / deep grey / brainstem / nuclei / network),
//   - where its centre sits relative to the centre of this brain: anterior/posterior, superior/inferior, distance from
//     the midline, in mm (measured on the 3D model),
//   - approximate MNI coordinates (the model's MNI <-> body fit inverted; the same fit that places the HCP tracts),
//   - size (bounding-box extent) and its three nearest neighbouring structures.
// Positions are measurements on this reference model, not on any person.

import * as THREE from 'three';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function areasPanel(B, hooks) {
  const el = $('#br-areas'); if (!el) return;
  const A = B.atlas.anchors, mm = (v) => Math.round(v * 1000);
  const box = new THREE.Box3(); B.meshes.filter((m) => m.userData.kind === 'brain').forEach((m) => box.expandByObject(m));
  const C = box.getCenter(new THREE.Vector3());
  const toMNI = (p) => { const a = [p.x, p.y, p.z], out = [0, 0, 0]; (B.fit || []).forEach((f, k) => { out[k] = f.s > 0 ? (a[f.i] - f.off) / f.sc : (f.off - a[f.i]) / f.sc; }); return out.map((v) => Math.round(v)); };
  const items = B.meshes.filter((m) => ['brain', 'network', 'nerve'].includes(m.userData.kind) && m.userData.part?.name).map((m) => {
    m.geometry.computeBoundingBox(); const bb = m.geometry.boundingBox, c = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3());
    const d = c.clone().sub(C), lat = d.x * -A.leftX, ant = d.z * A.anterior, sup = d.y; // lat > 0 = subject's right
    const name = m.userData.part.name, side = /\bleft\b/.test(name) ? 'left' : /\bright\b/.test(name) ? 'right' : Math.abs(lat) < 0.004 ? 'midline' : lat > 0 ? 'right of midline' : 'left of midline';
    return { m, name: m.userData.dname || name, group: m.userData.group, side, c, ant: mm(ant), sup: mm(sup), lat: mm(Math.abs(lat)), latDir: lat > 0 ? 'right' : 'left', mni: B.fit ? toMNI(c) : null,
      size: [mm(sz.x), mm(sz.y), mm(sz.z)] };
  });
  // nearest neighbours by centre distance (other structures of any group)
  for (const it of items) it.near = items.filter((o) => o !== it && o.group !== 'Cortical networks (Yeo 2011)').map((o) => [o, o.c.distanceTo(it.c)]).sort((a, b) => a[1] - b[1]).slice(0, 3).map(([o, dd]) => `${o.name.replace(/ · .*$/, '')} (${mm(dd)} mm)`);
  const groups = [...new Set(items.map((i) => i.group))];
  const pos = (it) => `${it.ant >= 0 ? `${it.ant} mm anterior` : `${-it.ant} mm posterior`}, ${it.sup >= 0 ? `${it.sup} mm superior` : `${-it.sup} mm inferior`}, ${it.lat} mm ${it.side === 'midline' ? 'from the midline' : `to the ${it.latDir}`}`;
  el.innerHTML = `<p class="fine">${items.length} areas in this view, each placed by its centre relative to the centre of this brain (measured on the 3D model). MNI coordinates are approximate (inverse of the model's MNI fit).</p>
    <input id="ar-q" type="search" placeholder="Find an area (e.g. hippocampus, putamen, default mode)" style="width:100%">
    <select id="ar-g" style="width:100%;margin:4px 0"><option value="">All groups (${groups.length})</option>${groups.map((g) => `<option>${esc(g)}</option>`).join('')}</select>
    <div id="ar-list" class="ar-list"></div>`;
  const render = () => {
    const q = $('#ar-q').value.toLowerCase(), g = $('#ar-g').value;
    const xs = items.filter((it) => (!q || it.name.toLowerCase().includes(q) || (it.group || '').toLowerCase().includes(q)) && (!g || it.group === g)).sort((a, b) => (a.group || '').localeCompare(b.group || '') || a.name.localeCompare(b.name));
    let last = null;
    $('#ar-list').innerHTML = xs.map((it, i) => { const h = it.group !== last ? `<h4 class="ar-h">${esc(it.group)}</h4>` : ''; last = it.group;
      return `${h}<div class="ar-item" data-i="${items.indexOf(it)}"><b>${esc(it.name.replace(/ · .*$/, ''))}</b> <small>${esc(it.side)}</small><br><small>${esc(pos(it))}${it.mni ? ` · MNI ≈ (${it.mni.join(', ')})` : ''} · size ${it.size.join(' × ')} mm<br>near: ${esc(it.near.join('; '))}</small></div>`; }).join('') || '<p class="fine muted">No match.</p>';
    $('#ar-list').querySelectorAll('[data-i]').forEach((d) => (d.onclick = () => { const it = items[+d.dataset.i]; hooks.select(it.m); }));
  };
  let tm = null; $('#ar-q').oninput = () => { clearTimeout(tm); tm = setTimeout(render, 150); };
  $('#ar-g').onchange = render;
  render();
  B.areaIndex = items;
}
