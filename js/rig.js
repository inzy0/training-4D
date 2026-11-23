// Skeleton rig over BodyParts3D: joint centres and bony landmarks computed from
// the bone meshes, rigid segments for every bone (spine per vertebra), and a
// solver that poses the rig from tracked body landmarks.
//
// Joint centres (ISB-style where an ISB definition exists):
//   hip, shoulder  : least-squares sphere fit to the femoral / humeral head
//   knee, elbow    : midpoint of the femoral / humeral epicondyles
//   ankle, wrist   : midpoint of the malleoli / of the radial and ulnar styloids
//   spine          : centre of each vertebral body (anterior part of the bone)
// Bony landmarks are extreme points of a bone along an anatomical direction
// (e.g. ASIS = most anterior point of the upper ilium); each records its rule.
// This is ONE reference skeleton (BodyParts3D, adult male), not the user's.
//
// Solver: each tracked segment gets the rotation that takes its frame in the
// reference stance (anatomical position, or the user's calibration) to its
// frame now. Trunk motion between pelvis and thorax is shared across L5..T1,
// neck motion across C7..C1. Pelvic sagittal tilt is not observable from two
// hip points, so the pelvis stays level and that motion shows in the spine.

import * as THREE from 'three';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const mid = (a, b) => a.clone().add(b).multiplyScalar(0.5);

// ------------------------------------------------------------------ geometry helpers
function pts(atlas, name, step = 1) {
  const x = atlas.byName.get(name); if (!x) return [];
  const a = x.geometry.attributes.position.array, out = [];
  for (let i = 0; i < a.length; i += 3 * step) out.push(V3(a[i], a[i + 1], a[i + 2]));
  return out;
}
function centroid(P) { const c = V3(); P.forEach((p) => c.add(p)); return P.length ? c.multiplyScalar(1 / P.length) : c; }
function extreme(P, dir, frac = 0.02) {
  if (!P.length) return null;
  const d = dir.clone().normalize(); const s = P.map((p) => [p.dot(d), p]).sort((a, b) => b[0] - a[0]);
  return centroid(s.slice(0, Math.max(3, Math.round(s.length * frac))).map((x) => x[1]));
}
function fitSphere(P) {
  // x^2+y^2+z^2 = 2ax + 2by + 2cz + d  -> linear least squares (normal equations, 4x4)
  const M = Array.from({ length: 4 }, () => [0, 0, 0, 0]), r = [0, 0, 0, 0];
  for (const p of P) {
    const row = [2 * p.x, 2 * p.y, 2 * p.z, 1], f = p.lengthSq();
    for (let i = 0; i < 4; i++) { r[i] += row[i] * f; for (let j = 0; j < 4; j++) M[i][j] += row[i] * row[j]; }
  }
  for (let i = 0; i < 4; i++) { // Gaussian elimination
    let piv = i; for (let k = i + 1; k < 4; k++) if (Math.abs(M[k][i]) > Math.abs(M[piv][i])) piv = k;
    [M[i], M[piv]] = [M[piv], M[i]]; [r[i], r[piv]] = [r[piv], r[i]];
    for (let k = i + 1; k < 4; k++) { const f = M[k][i] / M[i][i]; for (let j = i; j < 4; j++) M[k][j] -= f * M[i][j]; r[k] -= f * r[i]; }
  }
  const x = [0, 0, 0, 0];
  for (let i = 3; i >= 0; i--) { let s = r[i]; for (let j = i + 1; j < 4; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; }
  const c = V3(x[0], x[1], x[2]); return { center: c, radius: Math.sqrt(x[3] + c.lengthSq()) };
}
const yMax = (P) => Math.max(...P.map((p) => p.y)), yMin = (P) => Math.min(...P.map((p) => p.y));

const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
// Rib cage modelled as one rigid unit: ribs 1-7 join the sternum, ribs 8-10 join the 7th costal cartilage,
// so ribs 1-10 and T10..T1 move together; trunk motion is spread over L5..T11, and floating ribs 11-12 follow
// their own vertebra. A simplification (the real cage flexes a little), chosen so no rib leaves its joints.
const CAGE_FROM = 7; // index of T10 in VERTEBRAE (bottom -> top)
export const VERTEBRAE = [ // bottom -> top
  'fifth lumbar vertebra', 'fourth lumbar vertebra', 'third lumbar vertebra', 'second lumbar vertebra', 'first lumbar vertebra',
  'twelfth thoracic vertebra', 'eleventh thoracic vertebra', 'tenth thoracic vertebra', 'ninth thoracic vertebra', 'eighth thoracic vertebra',
  'seventh thoracic vertebra', 'sixth thoracic vertebra', 'fifth thoracic vertebra', 'fourth thoracic vertebra', 'third thoracic vertebra',
  'second thoracic vertebra', 'first thoracic vertebra',
  'seventh cervical vertebra', 'sixth cervical vertebra', 'fifth cervical vertebra', 'fourth cervical vertebra', 'third cervical vertebra', 'axis', 'atlas',
];
const SHORT = (n) => n.replace(/(\w+) (lumbar|thoracic|cervical) vertebra/, (m, o, r) => `${r[0].toUpperCase()}${({ first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12 })[o]}`)
  .replace('axis', 'C2').replace(/^atlas$/, 'C1');

// ------------------------------------------------------------------ build
export function buildRig(atlas) {
  const A = atlas.anchors, up = V3(0, 1, 0), ant = V3(0, 0, A.anterior), leftV = V3(A.leftX, 0, 0);
  const J = {}, LM = {}, audit = [];
  const put = (store, key, p, how, seg) => { if (!p) return; store[key] = { p, how, seg }; audit.push({ key, how }); };

  for (const [side, k] of [['left', 'l'], ['right', 'r']]) {
    const lat = side === 'left' ? leftV.clone() : leftV.clone().negate(), med = lat.clone().negate();
    const S = (n) => `${side} ${n}`;
    // femur
    const fem = pts(atlas, S('femur'));
    if (fem.length) {
      const top = yMax(fem), bot = yMin(fem);
      const headRegion = fem.filter((p) => p.y > top - 0.06);
      const medVals = headRegion.map((p) => p.dot(med)).sort((a, b) => a - b), cut = medVals[Math.floor(medVals.length * 0.55)];
      const sph = fitSphere(headRegion.filter((p) => p.dot(med) > cut));
      put(J, `${k}_hip`, sph.center, `sphere fit to femoral head, r = ${(sph.radius * 1000).toFixed(1)} mm`, `${k}_femur`);
      const dist = fem.filter((p) => p.y < bot + 0.06);
      const le = extreme(dist, lat), me = extreme(dist, med);
      put(LM, `${k}_lat_femoral_epicondyle`, le, 'most lateral point, distal femur', `${k}_femur`);
      put(LM, `${k}_med_femoral_epicondyle`, me, 'most medial point, distal femur', `${k}_femur`);
      put(J, `${k}_knee`, mid(le, me), 'midpoint of femoral epicondyles (ISB)', `${k}_leg`);
      put(LM, `${k}_greater_trochanter`, extreme(fem.filter((p) => p.y > top - 0.12), lat), 'most lateral point, proximal femur', `${k}_femur`);
    }
    const tib = pts(atlas, S('tibia')), fib = pts(atlas, S('fibula'));
    if (tib.length && fib.length) {
      const mm = extreme(tib.filter((p) => p.y < yMin(tib) + 0.05), med), lm = extreme(fib, up.clone().negate());
      put(LM, `${k}_medial_malleolus`, mm, 'most medial point, distal tibia', `${k}_leg`);
      put(LM, `${k}_lateral_malleolus`, lm, 'lowest point of fibula', `${k}_leg`);
      put(J, `${k}_ankle`, mid(mm, lm), 'midpoint of malleoli (ISB)', `${k}_foot`);
      put(LM, `${k}_tibial_tuberosity`, extreme(tib.filter((p) => p.y > yMax(tib) - 0.1), ant), 'most anterior point, proximal tibia', `${k}_leg`);
    }
    const pat = pts(atlas, S('patella')); if (pat.length) put(LM, `${k}_patella`, centroid(pat), 'centroid of patella', `${k}_leg`);
    const cal = pts(atlas, S('calcaneus')); if (cal.length) put(LM, `${k}_heel`, extreme(cal, ant.clone().negate()), 'most posterior point of calcaneus', `${k}_foot`);
    const mt1 = pts(atlas, S('first metatarsal bone')), mt5 = pts(atlas, S('fifth metatarsal bone')), toe = pts(atlas, `distal phalanx of ${side} big toe`);
    if (mt1.length) put(LM, `${k}_mt1_head`, extreme(mt1, ant), 'most anterior point, first metatarsal', `${k}_foot`);
    if (mt5.length) put(LM, `${k}_mt5_head`, extreme(mt5, ant), 'most anterior point, fifth metatarsal', `${k}_foot`);
    if (toe.length) put(LM, `${k}_toe_tip`, extreme(toe, ant), 'tip of big toe', `${k}_foot`);
    // humerus
    const hum = pts(atlas, S('humerus'));
    if (hum.length) {
      const top = yMax(hum), bot = yMin(hum);
      const headRegion = hum.filter((p) => p.y > top - 0.05);
      const medVals = headRegion.map((p) => p.dot(med)).sort((a, b) => a - b), cut = medVals[Math.floor(medVals.length * 0.5)];
      const sph = fitSphere(headRegion.filter((p) => p.dot(med) > cut));
      put(J, `${k}_shoulder`, sph.center, `sphere fit to humeral head, r = ${(sph.radius * 1000).toFixed(1)} mm`, `${k}_humerus`);
      const dist = hum.filter((p) => p.y < bot + 0.05);
      const le = extreme(dist, lat), me = extreme(dist, med);
      put(LM, `${k}_lat_humeral_epicondyle`, le, 'most lateral point, distal humerus', `${k}_humerus`);
      put(LM, `${k}_med_humeral_epicondyle`, me, 'most medial point, distal humerus', `${k}_humerus`);
      put(J, `${k}_elbow`, mid(le, me), 'midpoint of humeral epicondyles (ISB)', `${k}_forearm`);
    }
    const rad = pts(atlas, S('radius')), uln = pts(atlas, S('ulna'));
    if (rad.length && uln.length) {
      const rs = extreme(rad, up.clone().negate()), us = extreme(uln, up.clone().negate());
      put(LM, `${k}_radial_styloid`, rs, 'lowest point of radius', `${k}_forearm`);
      put(LM, `${k}_ulnar_styloid`, us, 'lowest point of ulna', `${k}_forearm`);
      put(J, `${k}_wrist`, mid(rs, us), 'midpoint of radial and ulnar styloids (ISB)', `${k}_hand`);
      put(LM, `${k}_olecranon`, extreme(uln.filter((p) => p.y > yMax(uln) - 0.05), ant.clone().negate()), 'most posterior point, proximal ulna', `${k}_forearm`);
    }
    const mc2 = pts(atlas, S('second metacarpal bone')), mc5 = pts(atlas, S('fifth metacarpal bone')), mc1 = pts(atlas, S('first metacarpal bone'));
    if (mc2.length) put(LM, `${k}_mc2_head`, extreme(mc2, up.clone().negate()), 'distal end, second metacarpal', `${k}_hand`);
    if (mc5.length) put(LM, `${k}_mc5_head`, extreme(mc5, up.clone().negate()), 'distal end, fifth metacarpal', `${k}_hand`);
    if (mc1.length) put(LM, `${k}_mc1_head`, extreme(mc1, up.clone().negate()), 'distal end, first metacarpal', `${k}_hand`);
    const sca = pts(atlas, S('scapula')), cla = pts(atlas, S('clavicle'));
    if (sca.length) {
      put(LM, `${k}_acromion`, extreme(sca, lat.clone().add(up)), 'most lateral-superior point of scapula', `${k}_girdle`);
      put(LM, `${k}_inferior_angle`, extreme(sca, up.clone().negate()), 'lowest point of scapula', `${k}_girdle`);
    }
    if (cla.length) put(LM, `${k}_sternoclavicular`, extreme(cla, med), 'most medial point of clavicle', `${k}_girdle`);
    const hb = pts(atlas, S('hip bone'));
    if (hb.length) {
      const cy = centroid(hb).y, upper = hb.filter((p) => p.y > cy);
      put(LM, `${k}_ASIS`, extreme(upper, ant), 'most anterior point, upper ilium', 'pelvis');
      put(LM, `${k}_PSIS`, extreme(upper.filter((p) => p.dot(lat) < centroid(hb).dot(lat)), ant.clone().negate()), 'most posterior point, medial upper ilium', 'pelvis');
      put(LM, `${k}_iliac_crest`, extreme(hb, up), 'highest point of ilium', 'pelvis');
      put(LM, `${k}_ischial_tuberosity`, extreme(hb, up.clone().negate()), 'lowest point of hip bone', 'pelvis');
    }
    const temp = pts(atlas, S('temporal bone')); if (temp.length) put(LM, `${k}_ear`, extreme(temp, lat), 'most lateral point of temporal bone', 'head');
    const lens = atlas.byName.get(`${side} lens`); if (lens) put(LM, `${k}_eye`, lens.geometry.boundingSphere.center.clone(), 'centre of eye lens', 'head');
    const tip = atlas.byName.get(`distal phalanx of ${side} middle finger`); if (tip) put(LM, `${k}_fingertip`, extreme(pts(atlas, `distal phalanx of ${side} middle finger`), up.clone().negate()), 'tip of middle finger', `${k}_hand`);
  }
  // spine
  for (const v of VERTEBRAE) {
    const P = pts(atlas, v); if (!P.length) continue;
    const a = P.map((p) => p.dot(ant)).sort((x, y) => x - y), cut = a[Math.floor(a.length * 0.6)];
    const body = v === 'atlas' ? centroid(P) : centroid(P.filter((p) => p.dot(ant) >= cut));
    put(J, `v_${SHORT(v)}`, body, v === 'atlas' ? 'centroid of atlas (no vertebral body)' : 'centre of vertebral body (anterior 40% of bone)', `v_${SHORT(v)}`);
  }
  const c7 = pts(atlas, 'seventh cervical vertebra'); if (c7.length) put(LM, 'C7_spinous', extreme(c7, ant.clone().negate()), 'most posterior point of C7', 'v_C7');
  const sac = pts(atlas, 'sacrum'); if (sac.length) put(LM, 'S1_top', extreme(sac, up), 'highest point of sacrum', 'pelvis');
  const skull = ['frontal bone', 'left parietal bone', 'right parietal bone', 'occipital bone'].flatMap((n) => pts(atlas, n, 2));
  if (skull.length) put(LM, 'vertex', extreme(skull, up), 'highest point of skull', 'head');
  const nas = pts(atlas, 'left nasal bone').concat(pts(atlas, 'right nasal bone')); if (nas.length) put(LM, 'nose', extreme(nas, ant), 'most anterior point of nasal bones', 'head');
  const man = pts(atlas, 'mandible'); if (man.length) put(LM, 'menton', extreme(man, up.clone().negate()), 'lowest point of mandible', 'head');
  if (J.l_hip && J.r_hip) put(J, 'pelvis', mid(J.l_hip.p, J.r_hip.p), 'midpoint of hip joint centres', 'pelvis');

  const segs = buildSegments(atlas, J);
  return { atlas, J, LM, audit, segs, up, ant, leftV };
}

// ------------------------------------------------------------------ segments
const SIDE_SEG = [
  [/^(left|right) (clavicle|scapula)$/, 'girdle'],
  [/^(left|right) humerus$/, 'humerus'],
  [/^(left|right) (radius|ulna)$|^interosseous membrane of (left|right) forearm$/, 'forearm'],
  [/^(left|right) (capitate|hamate|lunate|scaphoid|pisiform|trapezium|trapezoid|triquetral|\w+ metacarpal bone)$|phalanx of (left|right) (thumb|index finger|middle finger|ring finger|little finger)$/, 'hand'],
  [/^(left|right) femur$/, 'femur'],
  [/^(left|right) (tibia|fibula|patella)$|^interosseous membrane of (left|right) leg$/, 'leg'],
  [/^(left|right) (calcaneus|talus|cuboid bone|\w+ cuneiform bone|\w+ metatarsal bone|long plantar ligament|calcaneal tendon)$|^navicular bone of (left|right) foot$|phalanx of (left|right) \w+ toe$|^sesamoid bone of (left|right) foot$/, 'foot'],
];

function buildSegments(atlas, J) {
  const S = new Map(); // key -> {key, parent, pivot, end, parts: Part[] }
  const add = (key, parent, pivot, end) => { if (pivot) S.set(key, { key, parent, pivot: pivot.clone(), end: (end || pivot).clone(), parts: [] }); };
  add('pelvis', null, J.pelvis?.p, J['v_L5']?.p);
  let prev = 'pelvis';
  VERTEBRAE.forEach((v, i) => {
    const k = `v_${SHORT(v)}`; const nxt = VERTEBRAE[i + 1] ? J[`v_${SHORT(VERTEBRAE[i + 1])}`]?.p : null;
    add(k, prev, J[k]?.p, nxt || J[k]?.p); prev = k;
  });
  add('head', 'v_C1', J['v_C1']?.p, J['v_C1']?.p.clone().add(V3(0, 0.15, 0)));
  add('ribs', 'v_T7', J['v_T7']?.p, J['v_T1']?.p);
  for (const k of ['l', 'r']) {
    add(`${k}_girdle`, 'v_T1', J[`${k}_shoulder`]?.p, J[`${k}_shoulder`]?.p);
    add(`${k}_humerus`, `${k}_girdle`, J[`${k}_shoulder`]?.p, J[`${k}_elbow`]?.p);
    add(`${k}_forearm`, `${k}_humerus`, J[`${k}_elbow`]?.p, J[`${k}_wrist`]?.p);
    add(`${k}_hand`, `${k}_forearm`, J[`${k}_wrist`]?.p, J[`${k}_wrist`]?.p.clone().add(V3(0, -0.18, 0)));
    add(`${k}_femur`, 'pelvis', J[`${k}_hip`]?.p, J[`${k}_knee`]?.p);
    add(`${k}_leg`, `${k}_femur`, J[`${k}_knee`]?.p, J[`${k}_ankle`]?.p);
    add(`${k}_foot`, `${k}_leg`, J[`${k}_ankle`]?.p, J[`${k}_ankle`]?.p.clone().add(V3(0, -0.05, 0.15 * atlas.anchors.anterior)));
  }
  // assign every part (all layers) to a segment
  const vertByName = new Map(VERTEBRAE.map((v) => [v, `v_${SHORT(v)}`]));
  const segList = [...S.values()];
  const distToSeg = (c, s) => { const ab = s.end.clone().sub(s.pivot); const L2 = ab.lengthSq(); const t = L2 ? Math.max(0, Math.min(1, c.clone().sub(s.pivot).dot(ab) / L2)) : 0; return c.distanceTo(s.pivot.clone().addScaledVector(ab, t)); };
  const c2y = J['v_C2']?.p.y ?? 0;
  for (const { part, geometry } of atlas.parts) {
    const n = part.name; let key = null;
    if (/^(left|right) hip bone$|^sacrum$|coccy/.test(n)) key = 'pelvis';
    else if (vertByName.has(n)) key = vertByName.get(n);
    else if (/tooth$/.test(n)) key = 'head'; // all teeth travel with the skull (lower teeth were falling to the neck)
    else if (/^intervertebral disk of /.test(n)) key = vertByName.get(n.replace('intervertebral disk of ', '')) || null;
    else if (/\brib$|costal cartilage/.test(n)) { // ribs 1-7 + cartilages: the cage; ribs 8-12 follow their own vertebra
      const o = ORD.findIndex((w) => n.includes(`${w} rib`) || n.includes(`${w} costal`)) + 1;
      key = o >= 11 ? `v_T${o}` : 'ribs';
    }
    else if (part.layer === 'skeleton') {
      for (const [re, seg] of SIDE_SEG) if (re.test(n)) { key = `${/\bleft\b/.test(n) ? 'l' : 'r'}_${seg}`; break; }
      if (!key && /cartilage|hyoid|thyrohyoid|cricothyroid|vocal ligament/.test(n) && !/costal/.test(n)) key = 'v_C4'; // larynx and hyoid travel with the neck
    }
    if (!key && part.layer === 'skeleton' && geometry.boundingSphere.center.y > c2y) key = 'head';
    if (!key) { // nearest segment axis (muscles, vessels, organs, remaining pieces)
      const c = geometry.boundingSphere.center; let best = null;
      for (const s of segList) { const d = distToSeg(c, s); if (!best || d < best[0]) best = [d, s.key]; }
      key = best[1]; part._nearest = true;
    }
    (S.get(key) || S.get('pelvis')).parts.push(part);
  }
  return S;
}

// ------------------------------------------------------------------ landmark maps (MediaPipe pose indices)
// The atlas points that correspond to each tracked pose landmark.
export function restLandmarks(rig) {
  const J = rig.J, L = rig.LM, W = {};
  const g = (o) => o?.p.clone();
  Object.assign(W, {
    0: g(L.nose), 2: g(L.l_eye), 5: g(L.r_eye), 7: g(L.l_ear), 8: g(L.r_ear),
    11: g(J.l_shoulder), 12: g(J.r_shoulder), 13: g(J.l_elbow), 14: g(J.r_elbow), 15: g(J.l_wrist), 16: g(J.r_wrist),
    17: g(L.l_mc5_head), 18: g(L.r_mc5_head), 19: g(L.l_mc2_head), 20: g(L.r_mc2_head), 21: g(L.l_mc1_head), 22: g(L.r_mc1_head),
    23: g(J.l_hip), 24: g(J.r_hip), 25: g(J.l_knee), 26: g(J.r_knee), 27: g(J.l_ankle), 28: g(J.r_ankle),
    29: g(L.l_heel), 30: g(L.r_heel), 31: g(L.l_toe_tip), 32: g(L.r_toe_tip),
  });
  return W;
}
// which segment carries each pose landmark (for the synthetic self-test)
export const LANDMARK_SEG = { 0: 'head', 2: 'head', 5: 'head', 7: 'head', 8: 'head', 11: 'l_humerus', 12: 'r_humerus', 13: 'l_forearm', 14: 'r_forearm',
  15: 'l_hand', 16: 'r_hand', 17: 'l_hand', 18: 'r_hand', 19: 'l_hand', 20: 'r_hand', 21: 'l_hand', 22: 'r_hand', 23: 'l_femur', 24: 'r_femur',
  25: 'l_leg', 26: 'r_leg', 27: 'l_foot', 28: 'r_foot', 29: 'l_foot', 30: 'r_foot', 31: 'l_foot', 32: 'r_foot' };

// ------------------------------------------------------------------ frames from landmarks
const perp = (b, a) => b.clone().addScaledVector(a, -b.dot(a));
function basis(a, b) { // primary axis a, secondary b (orthogonalised)
  const e1 = a.clone().normalize(); let e2 = perp(b, e1);
  if (e2.lengthSq() < 1e-10) e2 = perp(V3(0, 0, 1), e1);
  e2.normalize(); const e3 = e1.clone().cross(e2);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(e1, e2, e3));
}
function blendSecondary(a, preferred, fallback) {
  const an = a.clone().normalize(); const p = perp(preferred, an); const s = p.length() / Math.max(1e-9, preferred.length());
  const w = THREE.MathUtils.smoothstep(s, 0.15, 0.4); // trust the preferred vector only when it is far from the bone axis
  const f = perp(fallback, an).normalize();
  return p.normalize().multiplyScalar(w).add(f.multiplyScalar(1 - w));
}

export function segmentFrames(W, rig) {
  const sub = (i, j) => W[i].clone().sub(W[j]);
  const midp = (i, j) => mid(W[i], W[j]);
  const F = {};
  const lat = sub(23, 24), up = V3(0, 1, 0);
  F.pelvis = basis(lat, up);                                  // level pelvis: yaw and obliquity only
  const tUp = midp(11, 12).sub(midp(23, 24));
  F.thorax = basis(sub(11, 12), tUp);
  const tFwd = sub(11, 12).cross(tUp); // forward-ish, sign consistent between rest and now
  const pFwd = lat.clone().cross(up);
  if (W[7] && W[8] && W[0]) F.head = basis(sub(7, 8), W[0].clone().sub(midp(7, 8)));
  for (const [k, sh, el, wr, pk, ix, hp, kn, an, he, to] of [['l', 11, 13, 15, 17, 19, 23, 25, 27, 29, 31], ['r', 12, 14, 16, 18, 20, 24, 26, 28, 30, 32]]) {
    const arm = sub(el, sh), fore = sub(wr, el);
    F[`${k}_humerus`] = basis(arm, blendSecondary(arm, fore, tFwd));
    const handLat = sub(ix, pk);
    F[`${k}_forearm`] = basis(fore, blendSecondary(fore, handLat, tFwd));
    const handAx = midp(ix, pk).sub(W[wr]);
    F[`${k}_hand`] = basis(handAx, blendSecondary(handAx, handLat, tFwd));
    const thigh = sub(kn, hp), shank = sub(an, kn), foot = sub(to, he);
    F[`${k}_femur`] = basis(thigh, blendSecondary(thigh, shank.clone().negate(), foot.lengthSq() ? foot : pFwd));
    F[`${k}_leg`] = basis(shank, blendSecondary(shank, foot, pFwd));
    F[`${k}_foot`] = basis(foot, blendSecondary(foot, W[an].clone().sub(W[he]), up));
  }
  return F;
}

// ------------------------------------------------------------------ posing
// R: world rotation (delta from reference stance) per measured segment.
export function solve(rig, Fnow, Fref) {
  const R = {};
  for (const k of Object.keys(Fnow)) if (Fref[k]) R[k] = Fnow[k].clone().multiply(Fref[k].clone().invert());
  return R;
}

export function poseMatrices(rig, R) {
  const M = new Map(), I = new THREE.Quaternion();
  const rot = (k) => R[k] || null;
  const qP = rot('pelvis') || I, qT = rot('thorax') || qP, qH = rot('head') || qT;
  const lumbThor = VERTEBRAE.slice(0, 17), cerv = VERTEBRAE.slice(17);
  const qOf = (key) => {
    if (key === 'pelvis') return qP;
    const v = key.startsWith('v_') ? key : null;
    if (v) {
      const name = VERTEBRAE.find((x) => `v_${SHORT(x)}` === v);
      // trunk motion is spread over L5..T11; T10..T1 move with the rib cage
      const i = lumbThor.indexOf(name);
      if (i >= 0) return i >= CAGE_FROM ? qT : qP.clone().slerp(qT, (i + 1) / CAGE_FROM);
      const j = cerv.indexOf(name); return qT.clone().slerp(qH, (j + 1) / (cerv.length + 1));
    }
    if (key === 'head') return qH;
    if (key === 'ribs') return qT; // upper rib cage moves as one unit with the thorax
    if (key.endsWith('_girdle')) return qT;
    return rot(key) || null;
  };
  const visit = (s) => {
    if (M.has(s.key)) return M.get(s.key);
    const parentM = s.parent ? visit(rig.segs.get(s.parent)) : new THREE.Matrix4();
    const pivotNow = s.pivot.clone().applyMatrix4(parentM);
    let q = qOf(s.key);
    if (!q) { q = new THREE.Quaternion().setFromRotationMatrix(parentM); } // follow parent
    const m = new THREE.Matrix4().makeTranslation(pivotNow.x, pivotNow.y, pivotNow.z)
      .multiply(new THREE.Matrix4().makeRotationFromQuaternion(q))
      .multiply(new THREE.Matrix4().makeTranslation(-s.pivot.x, -s.pivot.y, -s.pivot.z));
    M.set(s.key, m); return m;
  };
  rig.segs.forEach((s) => visit(s));
  return M;
}

// posed position of a joint centre / landmark
export function posedPoint(rig, M, store, key) {
  const o = rig[store][key]; if (!o) return null;
  return o.p.clone().applyMatrix4(M.get(o.seg) || new THREE.Matrix4());
}

// ------------------------------------------------------------------ angles (shared by measurement and twin)
export function angleAt(a, b, c) { const u = a.clone().sub(b), v = c.clone().sub(b); return THREE.MathUtils.radToDeg(u.angleTo(v)); }
export function relEuler(qA, qB) { // rotation of B relative to A, in A's anatomical axes (x lateral, y up, z anterior)
  const q = qA.clone().invert().multiply(qB); const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
  return { flex: THREE.MathUtils.radToDeg(e.x), rot: THREE.MathUtils.radToDeg(e.y), side: THREE.MathUtils.radToDeg(e.z) };
}
export { SHORT };

// The thorax frame is measured from the shoulder-hip chord, but the twin bends
// the spine as a curve, so the chord of the posed twin turns less than the top
// vertebra. Close the loop: pose, measure the twin's own thorax frame, correct.
export function refineThorax(rig, R, Wmeas, iters = 30) {
  if (!R.thorax) return R;
  const rest = restLandmarks(rig);
  const target = segmentFrames(Wmeas, rig).thorax;
  for (let i = 0; i < iters; i++) {
    const M = poseMatrices(rig, R), Wp = {};
    for (const k of [11, 12, 23, 24]) Wp[k] = rest[k].clone().applyMatrix4(M.get(LANDMARK_SEG[k]));
    const sub = (a, b) => Wp[a].clone().sub(Wp[b]);
    const upv = Wp[11].clone().add(Wp[12]).sub(Wp[23]).sub(Wp[24]);
    const posed = basis(sub(11, 12), upv);
    const corr = target.clone().multiply(posed.invert());
    if (2 * Math.acos(Math.min(1, Math.abs(corr.w))) < 1e-5) break;
    R.thorax = corr.multiply(R.thorax);
  }
  return R;
}

// Lumbopelvic rhythm (modelling assumption, not a measurement): a camera cannot
// see pelvic tilt from two hip points, so a fixed share ALPHA of the trunk's
// sagittal inclination (thorax relative to the level pelvis) is given to the
// pelvis and the rest to the lumbar and thoracic spine. Without it, squats and
// lunges force every degree of lean into the lumbar spine.
export const LUMBOPELVIC_ALPHA = 0.4;
export function tiltPelvis(R, base, anchors, alpha = LUMBOPELVIC_ALPHA) {
  if (!R.thorax || !base) return R;
  const e = relEuler(base, R.thorax); // flex = rotation about the atlas x axis
  const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(base);
  R.pelvis = new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(alpha * e.flex)).multiply(base);
  return R;
}

// Thorax refinement with the pelvis re-tilted each iteration (so pelvis and
// thorax converge together). `base` = the level pelvis from the hip line.
export function refineTrunk(rig, R, Wmeas, iters = 40, alpha = LUMBOPELVIC_ALPHA) {
  if (!R.thorax || !R.pelvis) return R;
  const base = R.pelvis.clone();
  const rest = restLandmarks(rig);
  const target = segmentFrames(Wmeas, rig).thorax;
  for (let i = 0; i < iters; i++) {
    tiltPelvis(R, base, rig.atlas.anchors, alpha);
    const M = poseMatrices(rig, R), Wp = {};
    for (const k of [11, 12, 23, 24]) Wp[k] = rest[k].clone().applyMatrix4(M.get(LANDMARK_SEG[k]));
    const sub = (a, b) => Wp[a].clone().sub(Wp[b]);
    const posed = basis(sub(11, 12), Wp[11].clone().add(Wp[12]).sub(Wp[23]).sub(Wp[24]));
    const corr = target.clone().multiply(posed.invert());
    if (2 * Math.acos(Math.min(1, Math.abs(corr.w))) < 1e-5) break;
    R.thorax = corr.multiply(R.thorax);
  }
  tiltPelvis(R, base, rig.atlas.anchors, alpha);
  R.pelvisLevel = base;
  return R;
}
