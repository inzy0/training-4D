// Real 3D nerves from Z-Anatomy (CC BY-SA 4.0) for the Brain map: spinal nerves (plexuses down to
// digital branches), cranial nerves along their full course (vagus included), sympathetic trunks
// with their ganglia and sympathetic nerves, spinal ganglia, and the spinal-cord cross-section
// (tracts, horns, nuclei) that Z-Anatomy models at ONE level.
// Built by tools/z_anatomy_nerves_build.py from the peer export (BodyParts3D frame, so it lines up
// with the atlas bones). Curves are stored control points (Bezier handles not evaluated).
// Attribution (verbatim, required): see ATTR.

import * as THREE from 'three';

export const ATTR = ['BodyParts3D - The Database Center for Life Science - CC-BY-SA 2.1 Japan', 'Z-Anatomy - The libre 3D atlas of anatomy - CC-BY-SA 4.0'];
const G_SPN = 'Spinal nerves (Z-Anatomy)', G_CRN = 'Cranial nerves, full course (Z-Anatomy)', G_SYM = 'Sympathetic trunk + ganglia (Z-Anatomy)',
  G_GAN = 'Spinal ganglia (Z-Anatomy)', G_XS = 'Cord cross-section: tracts (Z-Anatomy)', G_XL = 'Cord cross-section enlarged ×6';
const DESC = /corticospinal|rubrospinal|reticulospinal|vestibulospinal|tectospinal/i, ASC = /spinothalamic|spinocerebellar|gracile|cuneate|spinotectal|posterolateral|spinal reticular/i;
const xsColor = (n) => (DESC.test(n) ? '#ff6b6b' : ASC.test(n) ? '#4cc9f0' : /proprius/i.test(n) ? '#c9b6ff' : /central canal/i.test(n) ? '#5fa8ff' : /white matter/i.test(n) ? '#f1e3b0' : '#bdbdbd');

export async function setupZNerves(B, atlas, root) {
  const Z = await fetch('/training-4D/rt/brain/z_nerves.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!Z) return null;
  const ix = atlas.index, span = ix.bbox_span, mn = ix.bbox_min, up = span.indexOf(Math.max(...span)), c = [0, 1, 2].map((a) => mn[a] + span[a] / 2);
  // BodyParts3D raw mm -> app metres (same mapping as atlas_data.js)
  const P = (x, y, z) => { const a = (x - c[0]) / 1000, b = (y - c[1]) / 1000, d = (z - c[2]) / 1000; return up === 2 ? new THREE.Vector3(a, d, -b) : new THREE.Vector3(a, b, d); };
  const named = (n) => { const m = /^(.*)\.(l|r)$/.exec(n); return m ? `${m[2] === 'l' ? 'left' : 'right'} ${m[1]}` : n; };
  const add = (geom, color, group, name, extra = {}) => {
    geom.computeBoundingSphere();
    const op = extra.opacity ?? 1;
    const m = new THREE.Mesh(geom, new THREE.MeshPhysicalMaterial({ color, roughness: 0.45, clearcoat: 0.3, side: THREE.DoubleSide, transparent: op < 1, opacity: op, depthWrite: op >= 1 }));
    m.userData = { kind: 'znerve', group, color, base: geom.boundingSphere.center.clone(), part: { name: named(name), id: 'Z-Anatomy' }, dname: `${named(name)} · Z-Anatomy (CC BY-SA 4.0)`, zpath: extra.path, op };
    root.add(m); B.meshes.push(m); if (!B.groups.has(group)) B.groups.set(group, []); B.groups.get(group).push(m); return m;
  };
  const meshGeom = (o, map = (v) => v) => {
    const pos = new Float32Array(o.v.length);
    for (let i = 0; i < o.v.length; i += 3) { const p = map(P(o.v[i], o.v[i + 1], o.v[i + 2])); pos[i] = p.x; pos[i + 1] = p.y; pos[i + 2] = p.z; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(o.f); g.computeVertexNormals(); return g;
  };
  const stats = { objects: 0, tubes: 0 }; const xs = [];
  for (const o of Z.objects) {
    stats.objects++;
    if (o.type === 'MESH') {
      // the one-level cross-section (5 mm slab); other cord objects (e.g. nucleus of the accessory nerve) stay in place
      if (o.group.startsWith('Spinal cord')) { const zz = o.v.filter((_, i) => i % 3 === 2); if (Math.max(...zz) - Math.min(...zz) < 10) { xs.push(o); continue; } }
      const grp = o.group === 'Sympathetic (autonomic)' ? G_SYM : o.group === 'Spinal ganglia' ? G_GAN : o.group === 'Cranial nerves' ? G_CRN : G_SPN;
      add(meshGeom(o), grp === G_SYM ? '#ffb703' : '#ffe8a3', grp, o.name, { path: o.path });
      continue;
    }
    // curves -> tubes with the stored radius
    const grp = o.group === 'Sympathetic (autonomic)' ? G_SYM : o.group === 'Cranial nerves' ? G_CRN : G_SPN;
    const col = /vagus/i.test(o.name) ? '#b388ff' : grp === G_SYM ? '#ff9e00' : grp === G_CRN ? '#ffd166' : '#ffe066';
    (o.l || []).forEach((idx, k) => {
      const pts = idx.map((i) => P(o.v[3 * i], o.v[3 * i + 1], o.v[3 * i + 2]));
      if (pts.length < 2) return;
      const rr = o.r?.[k] || [0.6], r = Math.max(0.0006, (rr.reduce((s, x) => s + x, 0) / rr.length) / 1000);
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), Math.min(400, pts.length * 6), r, 8, false), col, grp, o.name, { path: o.path });
      stats.tubes++;
    });
  }
  // ---- cord cross-section: Z-Anatomy models one half at one level; mirrored about the midline for the other half
  if (xs.length) {
    const cc = xs.find((o) => /^Central canal$/.test(o.name));
    let mx = 0, n = 0; for (const o of (cc ? [cc] : xs)) for (let i = 0; i < o.v.length; i += 3) { mx += o.v[i]; n++; } mx /= n;
    const mid = (() => { const b = new THREE.Box3(); xs.forEach((o) => { for (let i = 0; i < o.v.length; i += 3) b.expandByPoint(P(o.v[i], o.v[i + 1], o.v[i + 2])); }); return b.getCenter(new THREE.Vector3()); })();
    const mxApp = P(mx, 0, 0).x;
    // Z-Anatomy places its cross-section as an illustration (in this frame it lies behind the canal, in the
    // posterior arch of C6). Move it, unchanged in shape, so its central canal sits on the canal centre line
    // measured from the vertebrae at the same height; the shift is reported in the alignment check.
    let ccC = mid.clone(); if (cc) { const b = new THREE.Box3(); for (let i = 0; i < cc.v.length; i += 3) b.expandByPoint(P(cc.v[i], cc.v[i + 1], cc.v[i + 2])); ccC = b.getCenter(new THREE.Vector3()); ccC.x = mxApp; }
    let shift = new THREE.Vector3();
    if (B.canal) { let lo = 0, hi = 1; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (B.along(m).y > ccC.y) lo = m; else hi = m; } shift = B.along((lo + hi) / 2).sub(ccC); }
    B.zxsShiftMm = +(shift.length() * 1000).toFixed(1); B.zxsOrig = ccC.clone();
    const mirror = (v) => new THREE.Vector3(2 * mxApp - v.x, v.y, v.z);
    const moved = (v) => v.clone().add(shift);
    const big = new THREE.Vector3(-0.09 * (atlas.anchors.leftX || 1), 0, 0); // enlarged copy sits beside the cord
    const enlarge = (v) => { const d = v.clone().sub(ccC); d.x *= 6; d.z *= 6; d.y *= 1.5; return d.add(ccC).add(shift).add(big); }; // in-plane ×6, slab thickness ×1.5
    for (const o of xs) {
      const col = xsColor(o.name), op = /white matter/i.test(o.name) ? 0.35 : 1;
      for (const [map, grp, tag] of [[moved, G_XS, ''], [(v) => moved(mirror(v)), G_XS, ' (mirrored)'], [enlarge, G_XL, ''], [(v) => enlarge(mirror(v)), G_XL, ' (mirrored)']]) {
        const g = meshGeom(o, map); if (tag) g.index.array.reverse?.();
        const m = add(g, col, grp, o.name + tag, { path: o.path, opacity: op }); m.userData.xs = o.name;
      }
    }
    B.zxs = { centre: ccC.clone().add(shift), orig: ccC, mid_x_mm: +mx.toFixed(2), z_mm: [Math.min(...xs.map((o) => Math.min(...o.v.filter((_, i) => i % 3 === 2)))), Math.max(...xs.map((o) => Math.max(...o.v.filter((_, i) => i % 3 === 2))))] };
  }
  B.zAttr = ATTR;
  B.zGan = []; for (const m of B.groups.get(G_GAN) || []) { const p = m.geometry.attributes.position.array; for (let i = 0; i < p.length; i += 3) B.zGan.push(new THREE.Vector3(p[i], p[i + 1], p[i + 2])); }
  return { ...stats, groups: [G_SPN, G_CRN, G_SYM, G_GAN, G_XS, G_XL].filter((g) => B.groups.has(g)).map((g) => `${g}:${B.groups.get(g).length}`) };
}

// geometries only (for the 3D Atlas): [{ geometry, name, group, path, color }]
export async function zNerveGeoms(atlas, { crossSection = false } = {}) {
  const Z = await fetch('/training-4D/rt/brain/z_nerves.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!Z) return [];
  const ix = atlas.index, span = ix.bbox_span, mn = ix.bbox_min, up = span.indexOf(Math.max(...span)), c = [0, 1, 2].map((a) => mn[a] + span[a] / 2);
  const P = (x, y, z) => { const a = (x - c[0]) / 1000, b = (y - c[1]) / 1000, d = (z - c[2]) / 1000; return up === 2 ? new THREE.Vector3(a, d, -b) : new THREE.Vector3(a, b, d); };
  const named = (n) => { const m = /^(.*)\.(l|r)$/.exec(n); return m ? `${m[2] === 'l' ? 'left' : 'right'} ${m[1]}` : n; };
  const out = [];
  for (const o of Z.objects) {
    if (o.group.startsWith('Spinal cord') && !crossSection) continue;
    const grp = o.group === 'Sympathetic (autonomic)' ? 'Autonomic: sympathetic trunk, ganglia, nerves' : o.group === 'Spinal ganglia' ? 'Spinal (dorsal root) ganglia' : o.group === 'Cranial nerves' ? 'Cranial nerves (full course, incl. vagus)' : o.group.startsWith('Spinal cord') ? 'Spinal cord cross-section' : 'Spinal nerves and plexuses';
    const col = /vagus/i.test(o.name) ? '#b388ff' : o.group === 'Sympathetic (autonomic)' ? '#ff9e00' : o.group === 'Cranial nerves' ? '#ffd166' : '#ffe066';
    if (o.type === 'MESH') {
      const pos = new Float32Array(o.v.length); for (let i = 0; i < o.v.length; i += 3) { const p = P(o.v[i], o.v[i + 1], o.v[i + 2]); pos[i] = p.x; pos[i + 1] = p.y; pos[i + 2] = p.z; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(o.f); g.computeVertexNormals(); g.computeBoundingSphere();
      out.push({ geometry: g, name: named(o.name.trim()), group: grp, path: o.path, color: o.group === 'Sympathetic (autonomic)' ? '#ffb703' : '#ffe8a3' });
    } else {
      (o.l || []).forEach((idx, k) => {
        const pts = idx.map((i) => P(o.v[3 * i], o.v[3 * i + 1], o.v[3 * i + 2])); if (pts.length < 2) return;
        const rr = o.r?.[k] || [0.6], r = Math.max(0.0006, (rr.reduce((s, x) => s + x, 0) / rr.length) / 1000);
        const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), Math.min(400, pts.length * 6), r, 8, false); g.computeBoundingSphere();
        out.push({ geometry: g, name: named(o.name.trim()), group: grp, path: o.path, color: col });
      });
    }
  }
  return out;
}

// alignment of the drawn layout against the real Z-Anatomy structures (numbers for the panel)
export function zCheck(B) {
  const out = {};
  const verts = (grp) => { const a = []; for (const m of B.groups.get(grp) || []) { const p = m.geometry.attributes.position.array; for (let i = 0; i < p.length; i += 3) a.push(new THREE.Vector3(p[i], p[i + 1], p[i + 2])); } return a; };
  const nearest = (p, arr) => arr.reduce((d, q) => Math.min(d, q.distanceToSquared(p)), Infinity) ** 0.5;
  const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
  if (B.zxs && B.canal) {
    const t = B.nearestT(B.zxs.orig); out.xs_to_canal_mm_as_published = +(B.along(t).distanceTo(B.zxs.orig) * 1000).toFixed(1); out.xs_shift_mm = B.zxsShiftMm;
  }
  const gan = verts('Spinal ganglia (Z-Anatomy)').filter((_, i) => i % 2 === 0);
  if (gan.length && B.drgPts?.length) { const d = B.drgPts.map((p) => nearest(p, gan) * 1000); out.drawn_drg_to_real_ganglion_mm_median = +med(d).toFixed(1); out.drawn_drg_n = d.length; }
  const trunk = (B.groups.get('Sympathetic trunk + ganglia (Z-Anatomy)') || []).filter((m) => /sympathetic trunk$/.test(m.userData.part.name));
  if (trunk.length && B.canal) {
    const d = []; for (const m of trunk) { const p = m.geometry.attributes.position.array; for (let i = 0; i < p.length; i += 30) { const v = new THREE.Vector3(p[i], p[i + 1], p[i + 2]); d.push(B.along(B.nearestT(v)).distanceTo(v) * 1000); } }
    out.real_sym_trunk_to_canal_mm_median = +med(d).toFixed(1);
  }
  return out;
}
