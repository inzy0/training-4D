// Joint connection map: for every joint, the structures that make it up or act
// on it, computed from the 3D geometry of the reference body:
//   bones      : bone surface within 40 mm of the joint centre (articular ends)
//   cartilage, discs, ligaments, membranes : within 30 mm (plus the named disc
//                of a spinal level)
//   muscles    : a muscle "crosses" the joint when part of it lies within
//                25 mm of bone on BOTH sides of the joint (proximal and distal
//                segments). Inferred from proximity, so approximate.
//   vessels, nerves : within 40 mm of the joint centre
// Textbook prime movers for the joint's actions are listed separately, with
// their grade and page (anatomy_maps.js), so geometry and textbook never mix.

import { tissueKind } from './look.js';
import { VERTEBRAE, SHORT } from './rig.js';

const CHAIN_SPINE = ['pelvis', ...VERTEBRAE.map((v) => `v_${SHORT(v)}`), 'head'];

export function jointList(rig) {
  const J = rig.J, out = [];
  const limb = (k, S) => [
    { id: `${k}_hip`, name: `${S} hip`, centre: J[`${k}_hip`]?.p, P: ['pelvis', 'v_L5', 'v_L4', 'v_L3', 'v_L2', 'v_L1', 'v_T12'], D: [`${k}_femur`, `${k}_leg`, `${k}_foot`], actions: ['hip_flexion', 'hip_extension'] },
    { id: `${k}_knee`, name: `${S} knee`, centre: J[`${k}_knee`]?.p, P: ['pelvis', `${k}_femur`], D: [`${k}_leg`, `${k}_foot`], actions: ['knee_flexion', 'knee_extension'] },
    { id: `${k}_ankle`, name: `${S} ankle`, centre: J[`${k}_ankle`]?.p, P: [`${k}_femur`, `${k}_leg`], D: [`${k}_foot`], actions: [] },
    { id: `${k}_shoulder`, name: `${S} shoulder`, centre: J[`${k}_shoulder`]?.p, P: ['ribs', `${k}_girdle`, 'head', ...CHAIN_SPINE.filter((s) => s.startsWith('v_')), 'pelvis'], D: [`${k}_humerus`, `${k}_forearm`, `${k}_hand`], actions: ['shoulder_flexion', 'shoulder_extension', 'shoulder_abduction', 'shoulder_adduction'] },
    { id: `${k}_elbow`, name: `${S} elbow`, centre: J[`${k}_elbow`]?.p, P: [`${k}_girdle`, `${k}_humerus`], D: [`${k}_forearm`, `${k}_hand`], actions: ['elbow_flexion', 'elbow_extension'] },
    { id: `${k}_wrist`, name: `${S} wrist`, centre: J[`${k}_wrist`]?.p, P: [`${k}_humerus`, `${k}_forearm`], D: [`${k}_hand`], actions: ['finger_flexion', 'finger_extension'] },
  ];
  out.push(...limb('l', 'Left'), ...limb('r', 'Right'));
  // spine: lumbosacral, every intervertebral level, atlanto-occipital
  for (let i = 0; i < CHAIN_SPINE.length - 1; i++) {
    const a = CHAIN_SPINE[i], b = CHAIN_SPINE[i + 1];
    const ca = a === 'pelvis' ? J['v_L5']?.p : J[a]?.p, cb = b === 'head' ? J['v_C1']?.p : J[b]?.p;
    if (!ca || !cb) continue;
    const centre = ca.clone().add(cb).multiplyScalar(0.5);
    const name = a === 'pelvis' ? 'Lumbosacral (L5–S1)' : b === 'head' ? 'Atlanto-occipital (C1–skull)' : `${a.slice(2)}–${b.slice(2)}`;
    const P = CHAIN_SPINE.slice(0, i + 1), D = CHAIN_SPINE.slice(i + 1);
    if (D.some((s) => ['v_T1', 'v_T2', 'v_T3', 'v_T4', 'v_T5', 'v_T6', 'v_T7'].includes(s))) D.push('ribs', 'l_girdle', 'r_girdle', 'l_humerus', 'r_humerus');
    else P.push('l_femur', 'r_femur');
    const disc = a === 'pelvis' ? 'intervertebral disk of fifth lumbar vertebra' : b === 'head' ? null : `intervertebral disk of ${VERTEBRAE[i]}`;
    out.push({ id: `sp_${a}_${b}`, name, centre, P, D, disc, spine: true, actions: [] });
  }
  return out.filter((j) => j.centre);
}

// ------------------------------------------------------------------ geometry index
function sampled(geo, step) {
  const a = geo.attributes.position.array, out = [];
  for (let i = 0; i < a.length; i += 3 * step) out.push(a[i], a[i + 1], a[i + 2]);
  return out;
}
function minDist(arr, c) {
  let m = Infinity;
  for (let i = 0; i < arr.length; i += 3) { const dx = arr[i] - c.x, dy = arr[i + 1] - c.y, dz = arr[i + 2] - c.z; const d = dx * dx + dy * dy + dz * dz; if (d < m) m = d; }
  return Math.sqrt(m);
}

export function buildJointMap(rig) {
  const t0 = performance.now();
  const atlas = rig.atlas;
  const segOf = new Map(); rig.segs.forEach((s) => s.parts.forEach((p) => segOf.set(p.name, s.key)));
  // voxel grid of bone surface points, each tagged with its segment
  const V = 0.0125, grid = new Map();
  const key = (x, y, z) => `${Math.floor(x / V)},${Math.floor(y / V)},${Math.floor(z / V)}`;
  const parts = atlas.parts.map(({ part, geometry }) => ({ part, kind: tissueKind(part), seg: segOf.get(part.name), pts: sampled(geometry, part.layer === 'skeleton' ? 2 : 4) }));
  for (const p of parts) {
    if (p.kind !== 'bone') continue;
    for (let i = 0; i < p.pts.length; i += 3) {
      const k = key(p.pts[i], p.pts[i + 1], p.pts[i + 2]);
      let cell = grid.get(k); if (!cell) grid.set(k, (cell = [])); cell.push(p.pts[i], p.pts[i + 1], p.pts[i + 2], p.seg);
    }
  }
  const R = 0.025, R2 = R * R;
  const nearestSeg = (x, y, z) => {
    const ix = Math.floor(x / V), iy = Math.floor(y / V), iz = Math.floor(z / V); let best = R2, seg = null;
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let c = -2; c <= 2; c++) {
      const cell = grid.get(`${ix + a},${iy + b},${iz + c}`); if (!cell) continue;
      for (let i = 0; i < cell.length; i += 4) { const dx = cell[i] - x, dy = cell[i + 1] - y, dz = cell[i + 2] - z; const d = dx * dx + dy * dy + dz * dz; if (d < best) { best = d; seg = cell[i + 3]; } }
    }
    return seg;
  };
  // which segments each muscle lies against
  const muscleSegs = new Map();
  for (const p of parts) {
    if (p.part.layer !== 'muscles') continue;
    const counts = new Map(); let n = 0;
    for (let i = 0; i < p.pts.length; i += 6) { const s = nearestSeg(p.pts[i], p.pts[i + 1], p.pts[i + 2]); if (s) { counts.set(s, (counts.get(s) || 0) + 1); n++; } }
    const segs = new Set(); counts.forEach((c, s) => { if (c >= Math.max(2, n * 0.04)) segs.add(s); });
    muscleSegs.set(p.part.name, segs);
  }
  const joints = jointList(rig).map((j) => {
    const near = (p, r) => minDist(p.pts, j.centre) <= r;
    const bones = [], soft = [], muscles = [], vn = [];
    for (const p of parts) {
      if (p.kind === 'bone' && (j.P.includes(p.seg) || j.D.includes(p.seg)) && near(p, 0.04)) bones.push(p.part);
      else if (['cartilage', 'disc', 'ligament'].includes(p.kind) && (near(p, 0.03) || p.part.name === j.disc)) soft.push(p.part);
      else if (p.part.layer === 'muscles') { const s = muscleSegs.get(p.part.name); if ([...s].some((x) => j.P.includes(x)) && [...s].some((x) => j.D.includes(x)) && near(p, j.spine ? 0.08 : 0.15)) muscles.push(p.part); }
      else if (['arteries', 'veins', 'nerves'].includes(p.part.layer) && near(p, 0.04)) vn.push(p.part);
    }
    return { ...j, bones, soft, muscles, vn };
  });
  return { joints, ms: performance.now() - t0 };
}
