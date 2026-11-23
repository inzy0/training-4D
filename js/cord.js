// Spinal cord for any view that uses the BodyParts3D atlas: the vertebral-canal centre line measured from this
// body's own vertebrae (midline gap between vertebral body and arch, per vertebra, atlas to sacrum), and the cord
// surface from a labelled open MRI (TotalSegmentator MRI s0175, CC BY 4.0; tools/spinal_cord_build.py) placed along
// it between the quoted ends (C1 level to the lower third of L1). Same method as the Brain map (autonomic.js).

import * as THREE from 'three';

const ORDN = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
const VNAMES = ['atlas', 'axis', ...[3, 4, 5, 6, 7].map((k) => `${ORDN[k - 1]} cervical vertebra`), ...ORDN.map((o) => `${o} thoracic vertebra`), ...ORDN.slice(0, 5).map((o) => `${o} lumbar vertebra`)];

export function vertebralCanal(atlas) {
  const A = atlas.anchors;
  const foramen = (arr, cx, yLo = -Infinity, yHi = Infinity) => {
    const zs = [];
    for (let k = 0; k < arr.length; k += 3) { const y = arr[k + 1]; if (Math.abs(arr[k] - cx) < 0.004 && y >= yLo && y <= yHi) zs.push([arr[k + 2] * A.anterior, y]); }
    if (zs.length < 20) return null;
    zs.sort((a, b) => a[0] - b[0]);
    let bi = -1, bg = 0; for (let k = 1; k < zs.length; k++) { const g = zs[k][0] - zs[k - 1][0]; if (g > bg) { bg = g; bi = k; } }
    if (bg < 0.005) return null;
    const zMid = (zs[bi][0] + zs[bi - 1][0]) / 2, front = zs.slice(bi).filter((q) => q[0] < zs[bi][0] + 0.006);
    return new THREE.Vector3(cx, front.reduce((t, q) => t + q[1], 0) / front.length, zMid * A.anterior);
  };
  const raw = [];
  for (const n of VNAMES) { const g = atlas.byName.get(n)?.geometry; if (!g) continue; g.computeBoundingBox(); const bb = g.boundingBox, f = foramen(g.attributes.position.array, (bb.min.x + bb.max.x) / 2); if (f) raw.push(f); }
  const sac = atlas.byName.get('sacrum')?.geometry;
  if (sac) { sac.computeBoundingBox(); const bb = sac.boundingBox, cx = (bb.min.x + bb.max.x) / 2, NB = 6, h = (bb.max.y - bb.min.y) / NB; for (let k = 0; k < NB; k++) { const f = foramen(sac.attributes.position.array, cx, bb.max.y - (k + 1) * h, bb.max.y - k * h); if (f) raw.push(f); } }
  if (raw.length < 6) return null;
  const sm = raw.map((q, k) => (k === 0 || k === raw.length - 1 ? q.clone() : q.clone().multiplyScalar(0.5).addScaledVector(raw[k - 1], 0.25).addScaledVector(raw[k + 1], 0.25)));
  sm.unshift(sm[0].clone().addScaledVector(sm[0].clone().sub(sm[1]).normalize(), 0.012));
  const line = new THREE.CatmullRomCurve3(sm, false, 'centripetal').getSpacedPoints(160);
  const arc = [0]; for (let k = 1; k < line.length; k++) arc.push(arc[k - 1] + line[k].distanceTo(line[k - 1]));
  const len = arc[arc.length - 1];
  const along = (t) => { const s = Math.max(0, Math.min(1, t)) * len; let i = 1; while (i < arc.length - 1 && arc[i] < s) i++; const f = (s - arc[i - 1]) / (arc[i] - arc[i - 1] || 1); return line[i - 1].clone().lerp(line[i], f); };
  const tAtY = (y) => { let lo = 0, hi = 1; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (along(m).y > y) lo = m; else hi = m; } return (lo + hi) / 2; };
  const c1 = atlas.byName.get('atlas')?.geometry, l1 = atlas.byName.get('first lumbar vertebra')?.geometry;
  const cordT = { top: c1 ? tAtY(c1.boundingSphere.center.y) : 0, end: l1 ? (l1.computeBoundingBox(), tAtY(l1.boundingBox.min.y + (l1.boundingBox.max.y - l1.boundingBox.min.y) / 3)) : 1 };
  return { line, arc, len, along, tAtY, cordT, right: new THREE.Vector3(-A.leftX, 0, 0), ant: new THREE.Vector3(0, 0, A.anterior) };
}

export async function spinalCordGeometry(atlas, canal = vertebralCanal(atlas)) {
  const SC = await fetch('/training-4D/rt/brain/spinal_cord.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!SC || !canal) return null;
  const v = SC.v, pos = new Float32Array(v.length), { top, end } = canal.cordT;
  for (let i = 0; i < v.length; i += 3) { const c = canal.along(top + (end - top) * v[i]).addScaledVector(canal.right, v[i + 1] / 1000).addScaledVector(canal.ant, v[i + 2] / 1000); pos[i] = c.x; pos[i + 1] = c.y; pos[i + 2] = c.z; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(SC.f); g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}
