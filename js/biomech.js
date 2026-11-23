// Biomechanics estimates from tracked 3D motion (inverse dynamics, quasi-static
// by default). A camera cannot measure force: everything here is computed from
// body mass, population segment parameters and the tracked pose.
//
// Segment parameters: Zatsiorsky–Seluyanov adjusted by de Leva (1996), from the
// BMClab/BMC repository (CC BY 4.0), see
// data/research_library/reference/biomechanics/PROVENANCE.md.
//   mass  = % of body mass;  cm = % of segment length from the first endpoint.
//
// Outputs per frame: whole-body centre of mass (COM), ground-reaction force per
// foot (two-foot split by the lever rule, which is an assumption: the true split
// is indeterminate from motion alone), net joint moments (N·m) about the
// anatomical axes, which muscle group must produce each moment (agonist) and
// its opposite (antagonist), and joint power (concentric if > 0, eccentric if < 0).
// Co-contraction cannot be seen, so "agonist" means the group the net moment
// requires, not a measured activation.

import * as THREE from 'three';

export const BSP = { // [mass %, cm %] male / female
  M: { head: [6.94, 50], trunk: [43.46, 43.10], upperarm: [2.71, 57.72], forearm: [1.62, 45.74], hand: [0.61, 79.0], thigh: [14.16, 40.95], shank: [4.33, 43.95], foot: [1.37, 44.15] },
  F: { head: [6.68, 50], trunk: [42.57, 37.82], upperarm: [2.55, 57.54], forearm: [1.38, 45.59], hand: [0.56, 74.74], thigh: [14.78, 36.12], shank: [4.81, 43.52], foot: [1.29, 40.14] },
};
// Endpoint choices (tracked landmarks): trunk MIDS->MIDH ("Trunk 3" row), upper arm SJC->EJC,
// forearm EJC->WJC, hand WJC->MET3 (mid 2nd/5th knuckle), thigh HJC->KJC, shank KJC->AJC,
// foot HEEL->TTIP. Head: no vertex/gonion landmarks, so its centre of mass is placed at
// the mid-ear point (approximation, noted in the UI).
export const SOURCE = 'Zatsiorsky–Seluyanov segment parameters adjusted by de Leva (1996), via BMClab/BMC (CC BY 4.0)';

const G = 9.81;
const mid = (a, b) => a.clone().add(b).multiplyScalar(0.5);
const along = (a, b, pct) => a.clone().lerp(b, pct / 100);

export function segments(W, sex = 'M') {
  const P = BSP[sex];
  const S = [];
  const add = (name, side, mass, cm) => S.push({ name, side, mass: mass / 100, cm });
  const midS = mid(W[11], W[12]), midH = mid(W[23], W[24]);
  add('head', null, P.head[0], mid(W[7], W[8]));
  add('trunk', null, P.trunk[0], along(midS, midH, P.trunk[1]));
  for (const [k, sh, el, wr, pk, ix, hp, kn, an, he, to] of [['l', 11, 13, 15, 17, 19, 23, 25, 27, 29, 31], ['r', 12, 14, 16, 18, 20, 24, 26, 28, 30, 32]]) {
    add('upperarm', k, P.upperarm[0], along(W[sh], W[el], P.upperarm[1]));
    add('forearm', k, P.forearm[0], along(W[el], W[wr], P.forearm[1]));
    add('hand', k, P.hand[0], along(W[wr], mid(W[pk], W[ix]), P.hand[1]));
    add('thigh', k, P.thigh[0], along(W[hp], W[kn], P.thigh[1]));
    add('shank', k, P.shank[0], along(W[kn], W[an], P.shank[1]));
    add('foot', k, P.foot[0], along(W[he], W[to], P.foot[1]));
  }
  return S;
}

// Muscle groups and how to find them on BodyParts3D (FMA names).
export const GROUPS = {
  hip_flexors: { label: 'Hip flexors (iliopsoas, rectus femoris)', re: /psoas major|iliacus|rectus femoris/ },
  hip_extensors: { label: 'Hip extensors (gluteus maximus, hamstrings)', re: /gluteus maximus|biceps femoris|semitendinosus|semimembranosus/ },
  hip_abductors: { label: 'Hip abductors (gluteus medius/minimus, TFL)', re: /gluteus medius|gluteus minimus|tensor fasciae latae/ },
  hip_adductors: { label: 'Hip adductors', re: /adductor longus|adductor brevis|adductor magnus|gracilis|pectineus/ },
  knee_extensors: { label: 'Knee extensors (quadriceps)', re: /rectus femoris|vastus/ },
  knee_flexors: { label: 'Knee flexors (hamstrings, gastrocnemius)', re: /biceps femoris|semitendinosus|semimembranosus|gastrocnemius/ },
  plantarflexors: { label: 'Plantarflexors (gastrocnemius, soleus)', re: /gastrocnemius|soleus/ },
  dorsiflexors: { label: 'Dorsiflexors (tibialis anterior, toe extensors)', re: /tibialis anterior|extensor digitorum longus|extensor hallucis longus/ },
  trunk_extensors: { label: 'Trunk extensors (erector spinae, multifidus)', re: /iliocostalis|longissimus|spinalis|multifidus/ },
  trunk_flexors: { label: 'Trunk flexors (abdominals)', re: /rectus abdominis|external oblique|internal oblique/ },
  sh_flexors: { label: 'Shoulder flexors (anterior deltoid, pectoralis major)', re: /clavicular part of .*deltoid|clavicular part of .*pectoralis major|coracobrachialis/ },
  sh_extensors: { label: 'Shoulder extensors (latissimus dorsi, teres major, posterior deltoid)', re: /latissimus dorsi|teres major|spinal part of .*deltoid/ },
  sh_abductors: { label: 'Shoulder abductors (deltoid, supraspinatus)', re: /acromial part of .*deltoid|supraspinatus/ },
  sh_adductors: { label: 'Shoulder adductors (pectoralis major, latissimus)', re: /pectoralis major|latissimus dorsi|teres major/ },
  elbow_flexors: { label: 'Elbow flexors (biceps, brachialis, brachioradialis)', re: /biceps brachii|brachialis|brachioradialis/ },
  elbow_extensors: { label: 'Elbow extensors (triceps, anconeus)', re: /triceps brachii|anconeus/ },
};

/**
 * One frame of quasi-static inverse dynamics.
 * W: tracked landmarks in metres, y up (atlas axes). R: segment world rotations
 * (pelvis, thorax) from the solver, used for the anatomical axes.
 * opts: { mass, sex, axes: {up, ant, leftX} , prev, t }
 */
export function analyse(W, R, opts) {
  const M = opts.mass, sex = opts.sex || 'M';
  const S = segments(W, sex);
  const com = S.reduce((a, s) => a.addScaledVector(s.cm, s.mass), new THREE.Vector3());
  // dynamic term from COM acceleration (smoothed by caller); quasi-static if absent
  const acc = opts.comAcc || new THREE.Vector3();
  // external loads (js/equipment.js): [{ at: 'hand'|'foot'|'knee'|'trunk', side: 'l'|'r'|null, p: Vector3 (W space), F: Vector3 N acting ON the body }]
  // Whole body: GRF + body weight + ΣF_ext = M·a  ->  GRF = M·(a + g·ŷ) − ΣF_ext
  const loads = opts.loads || [];
  const Fext = loads.reduce((a, l) => a.add(l.F), new THREE.Vector3());
  const Ftot = new THREE.Vector3(acc.x * M, (G + acc.y) * M, acc.z * M).sub(Fext);
  // ground contact
  const foot = (k) => { const he = W[k === 'l' ? 29 : 30], to = W[k === 'l' ? 31 : 32]; return { he, to, c: mid(he, to), low: Math.min(he.y, to.y) }; };
  const fl = foot('l'), fr = foot('r'); const ground = Math.min(fl.low, fr.low);
  const onL = fl.low - ground < 0.05, onR = fr.low - ground < 0.05;
  let wl = 0.5;
  if (onL && !onR) wl = 1; else if (onR && !onL) wl = 0;
  else { // lever rule along the line between the two foot centres
    const ax = new THREE.Vector3(fl.c.x - fr.c.x, 0, fl.c.z - fr.c.z); const L = ax.length() || 1e-6;
    const t = new THREE.Vector3(com.x - fr.c.x, 0, com.z - fr.c.z).dot(ax) / (L * L);
    wl = Math.max(0, Math.min(1, t));
  }
  const grf = { l: Ftot.clone().multiplyScalar(wl), r: Ftot.clone().multiplyScalar(1 - wl) };
  const cop = { l: fl.c.clone().setY(ground), r: fr.c.clone().setY(ground) };
  // the COM inside the base of support? (between the feet in the horizontal plane, padded 4 cm)
  const xs = [fl.he, fl.to, fr.he, fr.to].filter((p, i) => (i < 2 ? onL : onR));
  const inside = xs.length ? pointInHull2D(com, xs, 0.04) : false;

  // anatomical axes (body-fixed, from the solver's rotations)
  const qP = R.pelvis || new THREE.Quaternion(), qT = R.thorax || qP;
  const ax = (q, v) => v.clone().applyQuaternion(q).normalize();
  const upP = ax(qP, opts.axes.up), antP = ax(qP, opts.axes.ant), latP = ax(qP, opts.axes.left);
  const upT = ax(qT, opts.axes.up), antT = ax(qT, opts.axes.ant), latT = ax(qT, opts.axes.left);
  const down = (u) => u.clone().negate();
  const g = (m) => new THREE.Vector3(0, -G * m * M, 0); // weight of a segment of mass fraction m
  const segW = (name, k) => S.find((s) => s.name === name && s.side === k);
  const torqueOf = (r, F, about) => r.clone().sub(about).cross(F);
  const J = {};
  for (const k of ['l', 'r']) {
    const s = k === 'l' ? 1 : -1;
    const hp = W[k === 'l' ? 23 : 24], kn = W[k === 'l' ? 25 : 26], an = W[k === 'l' ? 27 : 28];
    const sh = W[k === 'l' ? 11 : 12], el = W[k === 'l' ? 13 : 14], wr = W[k === 'l' ? 15 : 16];
    const F = grf[k], C = cop[k];
    // bottom-up lower limb: moment the muscles must supply = -(external moments on the distal chain)
    const legL = (lv) => loads.filter((l) => l.side === k && lv.includes(l.at));
    const ext = (about, segs, lv) => legL(lv).reduce((m, l) => m.add(torqueOf(l.p, l.F, about)), segs.reduce((m, nm) => m.add(torqueOf(segW(nm, k).cm, g(segW(nm, k).mass), about)), torqueOf(C, F, about)));
    const mAnk = ext(an, ['foot'], ['foot']).negate(), mKnee = ext(kn, ['foot', 'shank'], ['foot', 'ankle', 'knee']).negate(), mHip = ext(hp, ['foot', 'shank', 'thigh'], ['foot', 'ankle', 'knee']).negate();
    // top-down upper limb (hand free): weight of the distal segments only
    const handL = loads.filter((l) => l.side === k && l.at === 'hand');
    const extU = (about, segs) => handL.reduce((m, l) => m.add(torqueOf(l.p, l.F, about)), segs.reduce((m, nm) => m.add(torqueOf(segW(nm, k).cm, g(segW(nm, k).mass), about)), new THREE.Vector3()));
    const mWr = extU(wr, ['hand']).negate(), mEl = extU(el, ['hand', 'forearm']).negate(), mSh = extU(sh, ['hand', 'forearm', 'upperarm']).negate();
    const flexAxisLimb = (u, v, fallback) => { const a = v.clone().normalize().cross(u.clone().normalize()); return a.length() > 0.2 ? a.normalize() : fallback; };
    const latOut = latP.clone().multiplyScalar(s), latOutT = latT.clone().multiplyScalar(s);
    // hip: sagittal flexion axis takes 'down' toward anterior; frontal abduction axis takes 'down' toward lateral
    J[`${k}_hip`] = { pos: hp, sag: mHip.dot(down(upP).cross(antP).normalize()), fro: mHip.dot(down(upP).cross(latOut).normalize()), groups: ['hip_flexors', 'hip_extensors', 'hip_abductors', 'hip_adductors'] };
    const kneeAx = flexAxisLimb(hp.clone().sub(kn), an.clone().sub(kn), down(upP).cross(antP.clone().negate()).normalize());
    J[`${k}_knee`] = { pos: kn, sag: mKnee.dot(kneeAx), groups: ['knee_flexors', 'knee_extensors'] };
    J[`${k}_ankle`] = { pos: an, sag: mAnk.dot(antP.clone().cross(upP).normalize()), groups: ['dorsiflexors', 'plantarflexors'] };
    J[`${k}_shoulder`] = { pos: sh, sag: mSh.dot(down(upT).cross(antT).normalize()), fro: mSh.dot(down(upT).cross(latOutT).normalize()), groups: ['sh_flexors', 'sh_extensors', 'sh_abductors', 'sh_adductors'] };
    const elbAx = flexAxisLimb(sh.clone().sub(el), wr.clone().sub(el), down(upT).cross(antT).normalize());
    J[`${k}_elbow`] = { pos: el, sag: mEl.dot(elbAx), groups: ['elbow_flexors', 'elbow_extensors'] };
    J[`${k}_wrist`] = { pos: wr, sag: mWr.length(), info: 'magnitude only' };
  }
  // lumbosacral, about the mid-hip point: top-down from head, trunk-above and arms
  const L5 = mid(W[23], W[24]);
  const above = S.filter((s) => ['head', 'trunk', 'upperarm', 'forearm', 'hand'].includes(s.name));
  const mL5 = loads.filter((l) => l.at === 'hand' || l.at === 'trunk').reduce((m, l) => m.add(torqueOf(l.p, l.F, L5)),
    above.reduce((m, s) => m.add(torqueOf(s.cm, g(s.mass * (s.name === 'trunk' ? 32.29 / 43.46 : 1)), L5)), new THREE.Vector3())).negate();
  J.lumbar = { pos: L5, sag: mL5.dot(upP.clone().cross(antP).normalize()), groups: ['trunk_flexors', 'trunk_extensors'] };

  return { com, grf, cop, wl, onL, onR, inside, J, Ftot, Fext, loads, bodyWeightN: M * G };
}

function pointInHull2D(p, pts, pad) {
  // convex hull in the horizontal plane (x,z), then a padded inside test
  const P = pts.map((q) => [q.x, q.z]);
  const cx = P.reduce((s, q) => s + q[0], 0) / P.length, cz = P.reduce((s, q) => s + q[1], 0) / P.length;
  const h = P.map((q) => [cx + (q[0] - cx) * 1.0, cz + (q[1] - cz) * 1.0]).sort((a, b) => Math.atan2(a[1] - cz, a[0] - cx) - Math.atan2(b[1] - cz, b[0] - cx));
  if (h.length < 3) { // one foot (heel + toe): distance from the heel-toe line, foot half-width ~5 cm
    const [a0, b0] = P; const vx = b0[0] - a0[0], vz = b0[1] - a0[1], L2 = vx * vx + vz * vz || 1e-9;
    const t = Math.max(0, Math.min(1, ((p.x - a0[0]) * vx + (p.z - a0[1]) * vz) / L2));
    return Math.hypot(p.x - (a0[0] + t * vx), p.z - (a0[1] + t * vz)) < 0.05 + pad;
  }
  // inside if the point is on the same side of every edge (either winding), allowing the pad
  const d = h.map((a, i) => { const b = h[(i + 1) % h.length]; return ((b[0] - a[0]) * (p.z - a[1]) - (b[1] - a[1]) * (p.x - a[0])) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1); });
  return d.every((x) => x >= -pad) || d.every((x) => x <= pad);
}

// Interpret one joint: which group the net moment requires, its opposite, and contraction type.
// Sign conventions: positive 'sag' = flexor moment (dorsiflexor at the ankle, flexor at the trunk);
// positive 'fro' = abductor moment.
export function interpret(id, j, angVel) {
  const out = [];
  if (j.groups && j.sag != null) {
    const [pos, neg] = j.groups;
    const ag = j.sag >= 0 ? pos : neg, an = j.sag >= 0 ? neg : pos;
    const power = angVel != null ? j.sag * THREE.MathUtils.degToRad(angVel) : null; // flexion velocity positive
    out.push({ plane: 'sagittal', moment: j.sag, agonist: ag, antagonist: an, power, mode: power == null ? null : Math.abs(power) < 0.5 ? 'holding (isometric)' : power > 0 ? 'concentric (shortening)' : 'eccentric (lengthening)' });
  }
  if (j.groups && j.fro != null && j.groups.length > 2) {
    const [, , pos, neg] = j.groups;
    out.push({ plane: 'frontal', moment: j.fro, agonist: j.fro >= 0 ? pos : neg, antagonist: j.fro >= 0 ? neg : pos, power: null, mode: null });
  }
  return out;
}
