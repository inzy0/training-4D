// Rig extras for the Movement studio: motions the base rig (rig.js) does not carry, added on top of its segment
// matrices without changing the shared solver.
//  - Shoulder girdle: elevation / depression and protraction / retraction of clavicle + scapula about the
//    sternoclavicular joint, and scapular upward rotation (scapula only, about the root of the scapular spine).
//    Optional scapulohumeral rhythm: 1° of scapular upward rotation per 2° of arm elevation beyond 30° (Inman 1944,
//    standard anatomy, grade U here).
//  - Forearm rotation: the radius turns about the axis from the radial head to the ulnar head; the hand turns with it.
//  - Fingers and toes: each phalanx flexes about its own proximal joint (MCP / PIP / DIP; thumb MCP / IP; toes MTP / IP).
//  - Subtalar inversion / eversion: the foot turns about an axis inclined 42° up and 16° medial to the long axis of the
//    foot, through the talus (Inman 1976 average, grade U here).
//  - Short foot: the medial column (navicular, medial cuneiform, first metatarsal, big toe) turns about the first
//    metatarsal head so the arch rises.
//  - Breathing: rib cage widens side to side and front to back and the diaphragm descends. Pelvic floor: the pelvic
//    floor muscles lift. Both are schematic sizes, not measurements.
//  - Soft-tissue blending: muscles that cross a joint follow BOTH bones (per-vertex blend of the two segment
//    transforms near the joint), so long muscles bend with the knee, hip, elbow and shoulder instead of staying rigid.
import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rotAbout = (p, axis, deg) => new THREE.Matrix4().makeTranslation(p.x, p.y, p.z).multiply(new THREE.Matrix4().makeRotationAxis(axis.clone().normalize(), THREE.MathUtils.degToRad(deg))).multiply(new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z));
let X = null;

function meshPts(m, step = 3) { const pa = m.geometry.attributes.position, out = []; for (let i = 0; i < pa.count; i += step) out.push(V(pa.getX(i), pa.getY(i), pa.getZ(i))); return out; }
function extreme(P, d) { let b = null, bv = -Infinity; for (const p of P) { const v = p.dot(d); if (v > bv) { bv = v; b = p; } } return b?.clone(); }
const centroid = (P) => P.reduce((a, p) => a.add(p), V()).multiplyScalar(1 / Math.max(1, P.length));

export function initExtras(L) {
  if (X) return X;
  const A = L.atlas.anchors, up = V(0, 1, 0), down = V(0, -1, 0), ant = V(0, 0, A.anterior), left = V(A.leftX, 0, 0);
  const byName = new Map(); L.groups.forEach((g, key) => g.children.forEach((m) => { if (m.userData.part) byName.set(m.userData.part.name, { m, key }); }));
  const children = new Map(); L.rig.segs.forEach((s) => { if (s.parent) { if (!children.has(s.parent)) children.set(s.parent, []); children.get(s.parent).push(s.key); } });
  const desc = (k) => [k, ...(children.get(k) || []).flatMap(desc)];
  X = { L, byName, desc, side: {}, ribs: null, dia: [], pfloor: [], skin: null };
  for (const [side, k] of [['left', 'l'], ['right', 'r']]) {
    const lat = side === 'left' ? left.clone() : left.clone().negate(), med = lat.clone().negate(), o = (X.side[k] = { lat, med });
    const sca = byName.get(`${side} scapula`), rad = byName.get(`${side} radius`), uln = byName.get(`${side} ulna`);
    o.sc = L.rig.LM[`${k}_sternoclavicular`]?.p;
    if (sca) { const P = meshPts(sca.m), yMin = Math.min(...P.map((p) => p.y)), yMax = Math.max(...P.map((p) => p.y)); o.scap = sca.m; o.scapPivot = extreme(P.filter((p) => p.y > yMin + 0.65 * (yMax - yMin)), med); }
    if (rad && uln) { o.radius = rad.m; o.radHead = extreme(meshPts(rad.m), up); o.ulnHead = extreme(meshPts(uln.m), down); o.proAxis = o.ulnHead.clone().sub(o.radHead).normalize(); }
    // fingers and toes: [mesh, pivot (proximal end centre)] chains
    const chain = (names) => names.map((n) => byName.get(n)).filter(Boolean).map(({ m }) => { const P = meshPts(m, 2); return { m, top: P }; });
    o.fingers = ['thumb', 'index finger', 'middle finger', 'ring finger', 'little finger'].map((f) => {
      const ph = chain((f === 'thumb' ? ['proximal', 'distal'] : ['proximal', 'middle', 'distal']).map((w) => `${w} phalanx of ${side} ${f}`));
      return { f, ph: ph.map(({ m, top }) => ({ m, pivot: centroid(top.filter((p) => p.y > Math.max(...top.map((q) => q.y)) - 0.004)) })) };
    }).filter((x) => x.ph.length);
    o.toes = ['big toe', 'second toe', 'third toe', 'fourth toe', 'little toe'].map((t) => {
      const ph = chain((t === 'big toe' ? ['proximal', 'distal'] : ['proximal', 'middle', 'distal']).map((w) => `${w} phalanx of ${side} ${t}`));
      return { t, ph: ph.map(({ m, top }) => ({ m, pivot: centroid(top.filter((p) => p.dot(ant) < Math.min(...top.map((q) => q.dot(ant))) + 0.004)) })) };
    }).filter((x) => x.ph.length);
    const tal = byName.get(`${side} talus`); o.talus = tal ? centroid(meshPts(tal.m)) : L.rig.J[`${k}_ankle`]?.p;
    const ang42 = THREE.MathUtils.degToRad(42), ang16 = THREE.MathUtils.degToRad(16);
    o.stAxis = ant.clone().multiplyScalar(Math.cos(ang42) * Math.cos(ang16)).add(up.clone().multiplyScalar(Math.sin(ang42))).add(med.clone().multiplyScalar(Math.cos(ang42) * Math.sin(ang16))).normalize();
    o.arch = ['navicular bone of ' + side + ' foot', `${side} medial cuneiform bone`, `${side} first metatarsal bone`, `proximal phalanx of ${side} big toe`, `distal phalanx of ${side} big toe`].map((n) => byName.get(n)?.m).filter(Boolean);
    const mt1 = byName.get(`${side} first metatarsal bone`); o.mt1Head = mt1 ? extreme(meshPts(mt1.m), ant) : null;
    // sign conventions measured on the rig: + pronation, + finger / toe flexion, + inversion, + arch rise, + upward rotation
    o.sgn = {};
    if (o.radius) { const s0 = L.rig.LM[`${k}_radial_styloid`]?.p; const s1 = s0 && s0.clone().applyMatrix4(rotAbout(o.radHead, o.proAxis, 30)); o.sgn.pro = s1 && s1.clone().sub(s0).dot(med) > 0 ? 1 : -1; }
    const tipOf = (ph) => ph[ph.length - 1].m.geometry.boundingSphere.center;
    if (o.fingers[1]) { const t = tipOf(o.fingers[1].ph), t1 = t.clone().applyMatrix4(rotAbout(o.fingers[1].ph[0].pivot, lat.clone().cross(down), 20)); o.fAxis = lat.clone().cross(down).multiplyScalar(t1.sub(t).dot(ant) > 0 ? 1 : -1); }
    if (o.toes[0]) { const t = tipOf(o.toes[0].ph), t1 = t.clone().applyMatrix4(rotAbout(o.toes[0].ph[0].pivot, lat, 20)); o.tAxis = lat.clone().multiplyScalar(t1.sub(t).y < 0 ? 1 : -1); }
    const mt5 = L.rig.LM[`${k}_mt5_head`]?.p, mt1h = L.rig.LM[`${k}_mt1_head`]?.p;
    if (mt5 && mt1h) { const R = rotAbout(o.talus, o.stAxis, 15); o.sgn.inv = mt1h.clone().applyMatrix4(R).y - mt5.clone().applyMatrix4(R).y > mt1h.y - mt5.y ? 1 : -1; /* inversion lifts the medial border */ }
    if (o.arch[0] && o.mt1Head) { const c = o.arch[0].geometry.boundingSphere.center; o.sgn.arch = c.clone().applyMatrix4(rotAbout(o.mt1Head, lat, 5)).y > c.y ? 1 : -1; }
    const acr = L.rig.LM[`${k}_acromion`]?.p;
    if (o.sc && acr) { o.sgn.elev = acr.clone().applyMatrix4(rotAbout(o.sc, ant, 10)).y > acr.y ? 1 : -1; o.sgn.prot = acr.clone().applyMatrix4(rotAbout(o.sc, up, 10)).dot(ant) > acr.dot(ant) ? 1 : -1; }
    if (o.scapPivot) { const ia = L.rig.LM[`${k}_inferior_angle`]?.p; o.sgn.up = ia && ia.clone().applyMatrix4(rotAbout(o.scapPivot, ant, 10)).dot(lat) > ia.dot(lat) ? 1 : -1; }
  }
  const rg = L.groups.get('ribs'); X.ribs = rg ? { g: rg, c: L.rig.J.v_T7?.p || V() } : null;
  X.dia = [...byName.entries()].filter(([n]) => /diaphragm/.test(n)).map(([, v]) => v.m);
  X.pfloor = [...byName.entries()].filter(([n]) => /pubococcygeus|iliococcygeus|puborectalis|coccygeus/.test(n)).map(([, v]) => v.m);
  X.up = up; X.ant = ant; X.left = left;
  return X;
}

const setLocal = (m, M) => { m.matrixAutoUpdate = false; m.matrix.copy(M); m.matrixWorldNeedsUpdate = true; };

/** Apply the extras to segment matrices M (Map, posed world) and to mesh-local matrices. p = joint parameters. */
export function applyExtras(M, p, rhythm = true) {
  if (!X) return M;
  const { L } = X;
  for (const k of ['l', 'r']) {
    const o = X.side[k]; if (!o) continue;
    const thor = M.get('v_T1') || M.get('pelvis'), rq = new THREE.Quaternion().setFromRotationMatrix(thor);
    // girdle about the SC joint (clavicle + scapula + whole arm)
    const elevArm = Math.max(Math.abs(p[`${k}ShFlex`] || 0), p[`${k}ShAbd`] || 0);
    const rhythmUp = rhythm ? Math.max(0, elevArm - 30) / 2 : 0; // 2:1 beyond 30°
    const up = (p[`${k}ScapUp`] || 0) + rhythmUp, elev = (p[`${k}ScapElev`] || 0) + rhythmUp * 0.35, prot = p[`${k}ScapProt`] || 0;
    if (o.sc && (elev || prot)) {
      const sc = o.sc.clone().applyMatrix4(thor), antW = X.ant.clone().applyQuaternion(rq), upW = X.up.clone().applyQuaternion(rq);
      const G = rotAbout(sc, antW, (o.sgn.elev || 1) * elev).multiply(rotAbout(sc, upW, (o.sgn.prot || 1) * prot)); // signs measured on the rig: + raises / moves the acromion forward
      const g = M.get(`${k}_girdle`); if (g) g.premultiply(G);
      // the arm keeps its own orientation: it is carried by the moved shoulder joint, not turned with the girdle
      const sh = L.rig.J[`${k}_shoulder`]?.p, hm = M.get(`${k}_humerus`);
      if (sh && hm) { const p0 = sh.clone().applyMatrix4(hm), p1 = p0.clone().applyMatrix4(G), T = new THREE.Matrix4().makeTranslation(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z); X.desc(`${k}_humerus`).forEach((s) => { const m = M.get(s); if (m) m.premultiply(T); }); }
    }
    if (o.scap) setLocal(o.scap, o.scapPivot && up ? rotAbout(o.scapPivot, X.ant, o.sgn.up * up) : new THREE.Matrix4());
    // forearm rotation: radius (in the forearm group) and the hand group turn about the radio-ulnar axis
    const pro = p[`${k}ForeRot`] || 0;
    if (o.radius) {
      const Rr = rotAbout(o.radHead, o.proAxis, o.sgn.pro * pro); setLocal(o.radius, Rr);
      const mf = M.get(`${k}_forearm`), mh = M.get(`${k}_hand`);
      if (mf && mh && pro) { const W = mf.clone().multiply(Rr).multiply(mf.clone().invert()); X.desc(`${k}_hand`).forEach((s) => { const m = M.get(s); if (m) m.premultiply(W); }); }
    }
    // fingers (grip 0..1): MCP 80°, PIP 100°, DIP 70°; thumb MCP 50°, IP 70°
    const grip = p[`${k}Grip`] || 0;
    for (const f of o.fingers) {
      const angs = f.f === 'thumb' ? [50, 70] : [80, 100, 70], axis = f.f === 'thumb' ? X.ant.clone().multiplyScalar(o.med.dot(X.left) > 0 ? 1 : -1) : o.fAxis;
      let C = new THREE.Matrix4();
      f.ph.forEach((ph, i) => { const piv = ph.pivot.clone().applyMatrix4(C); C = rotAbout(piv, axis, grip * angs[i]).multiply(C); setLocal(ph.m, C); });
    }
    // toes: + flexion (curl), - extension
    const toe = p[`${k}Toe`] || 0;
    for (const t of o.toes) { let C = new THREE.Matrix4(); t.ph.forEach((ph, i) => { const piv = ph.pivot.clone().applyMatrix4(C); C = rotAbout(piv, o.tAxis, toe * (i === 0 ? 1 : 0.8)).multiply(C); setLocal(ph.m, C); }); }
    // subtalar inversion (+) / eversion (-): whole foot about the subtalar axis through the talus
    const inv = p[`${k}FootInv`] || 0, ml = M.get(`${k}_leg`), mfoot = M.get(`${k}_foot`);
    if (inv && ml && mfoot && o.talus) {
      const footQ = new THREE.Quaternion().setFromRotationMatrix(mfoot), piv = o.talus.clone().applyMatrix4(mfoot), ax = o.stAxis.clone().applyQuaternion(footQ);
      const G = rotAbout(piv, ax, o.sgn.inv * inv); X.desc(`${k}_foot`).forEach((s) => { const m = M.get(s); if (m) m.premultiply(G); });
    }
    // short foot: medial column about the 1st MT head
    const arch = p[`${k}Arch`] || 0;
    o.arch.forEach((m) => { if (!/phalanx/.test(m.userData.part.name)) setLocal(m, arch && o.mt1Head ? rotAbout(o.mt1Head, o.lat, o.sgn.arch * 6 * arch) : new THREE.Matrix4()); });
  }
  // breathing: rib cage (ribs 1-10) widens 6 % side to side and 5 % front to back; diaphragm descends 2.5 cm (schematic)
  const br = p.breath || 0;
  if (X.ribs) { const c = X.ribs.c, S = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z).multiply(new THREE.Matrix4().makeScale(1 + 0.06 * br, 1, 1 + 0.05 * br)).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z)); X.ribs.g.children.forEach((m) => { if (m.userData.part) setLocal(m, S); }); }
  X.dia.forEach((m) => setLocal(m, new THREE.Matrix4().makeTranslation(0, -0.025 * br, 0)));
  X.pfloor.forEach((m) => setLocal(m, new THREE.Matrix4().makeTranslation(0, 0.012 * (p.pelvicFloor || 0), 0)));
  return M;
}

/** Reset all mesh-local changes (when the studio stops). */
export function clearExtras() {
  if (!X) return;
  for (const o of Object.values(X.side)) {
    [o.scap, o.radius, ...o.arch, ...o.fingers.flatMap((f) => f.ph.map((x) => x.m)), ...o.toes.flatMap((t) => t.ph.map((x) => x.m))].filter(Boolean).forEach((m) => setLocal(m, new THREE.Matrix4()));
  }
  X.ribs?.g.children.forEach((m) => { if (m.userData.part) setLocal(m, new THREE.Matrix4()); });
  [...X.dia, ...X.pfloor].forEach((m) => setLocal(m, new THREE.Matrix4()));
  if (X.skin) for (const d of X.skin.list) { d.m.geometry = d.orig; }
}

// ---------------------------------------------------------------- soft-tissue blending across joints
export function buildSkin(L) {
  initExtras(L);
  if (X.skin) return X.skin;
  const segs = L.rig.segs, kids = (k) => [...segs.values()].filter((s) => s.parent === k).map((s) => s.key);
  const below = (k, d) => (d ? kids(k).flatMap((c) => [c, ...below(c, d - 1)]) : []);
  const near = (k) => [k, segs.get(k)?.parent, ...below(k, 3)].filter((x, i, a) => x && segs.has(x) && a.indexOf(x) === i); // own segment, parent, and down the limb chain
  const axisDist = (p, s) => { const ab = s.end.clone().sub(s.pivot), L2 = ab.lengthSq(), t = L2 ? Math.max(0, Math.min(1, p.clone().sub(s.pivot).dot(ab) / L2)) : 0; return p.distanceTo(s.pivot.clone().addScaledVector(ab, t)); };
  const list = []; let verts = 0;
  L.groups.forEach((g, key) => {
    if (key.startsWith('v_') || key === 'head' || key === 'ribs') return;
    const cand = near(key).filter((k) => !k.startsWith('v_')).map((k) => segs.get(k)); if (cand.length < 2) return;
    for (const m of g.children) {
      const part = m.userData.part; if (!part || !['muscles', 'arteries', 'veins', 'nerves'].includes(part.layer)) continue;
      const pa = m.geometry.attributes.position, n = pa.count; let other = 0, tot = 0; const v = V();
      for (let i = 0; i < n; i += 25) { v.set(pa.getX(i), pa.getY(i), pa.getZ(i)); const ds = cand.map((s) => axisDist(v, s)); const best = ds.indexOf(Math.min(...ds)); if (cand[best].key !== key && ds[best] + 0.01 < ds[0]) other++; tot++; }
      if (!tot || other / tot < 0.12) continue;
      const geo = m.geometry.clone(), rest = Float32Array.from(pa.array), i1 = new Uint8Array(n), i2 = new Uint8Array(n), w = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        v.set(rest[3 * i], rest[3 * i + 1], rest[3 * i + 2]);
        const ds = cand.map((s) => axisDist(v, s)), ord = ds.map((d, j) => [d, j]).sort((a, b) => a[0] - b[0]);
        const [d1, a] = ord[0], [d2, b] = ord[1] || ord[0], e1 = Math.exp(-d1 / 0.012), e2 = Math.exp(-d2 / 0.012);
        i1[i] = a; i2[i] = b; w[i] = e1 + e2 > 0 ? e1 / (e1 + e2) : 1;
      }
      list.push({ m, key, orig: m.geometry, geo, rest, i1, i2, w, cand: cand.map((s) => s.key) }); verts += n;
    }
  });
  X.skin = { list, verts };
  return X.skin;
}
let skinTick = 0;
export function applySkin(M) {
  if (!X?.skin) return;
  const v = V(), a = V(), b = V();
  for (const d of X.skin.list) {
    const gm = M.get(d.key); if (!gm) continue;
    if (d.m.geometry !== d.geo) d.m.geometry = d.geo;
    const inv = gm.clone().invert(), rel = d.cand.map((k) => inv.clone().multiply(M.get(k) || gm)), pos = d.geo.attributes.position.array, r = d.rest;
    for (let i = 0, n = d.w.length; i < n; i++) {
      v.set(r[3 * i], r[3 * i + 1], r[3 * i + 2]);
      a.copy(v).applyMatrix4(rel[d.i1[i]]); b.copy(v).applyMatrix4(rel[d.i2[i]]);
      const w = d.w[i]; pos[3 * i] = a.x * w + b.x * (1 - w); pos[3 * i + 1] = a.y * w + b.y * (1 - w); pos[3 * i + 2] = a.z * w + b.z * (1 - w);
    }
    d.geo.attributes.position.needsUpdate = true;
  }
  if (++skinTick % 6 === 0) X.skin.list.forEach((d) => { d.geo.computeVertexNormals(); d.geo.computeBoundingSphere(); });
}
