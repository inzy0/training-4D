// Live Mirror precision layer (used by mirror_ar.js).
//
// 1. Per-segment bone placement. After the whole-skeleton similarity fit, each limb chain (upper arm -> forearm ->
//    hand, thigh -> shank -> foot) is corrected segment by segment: the segment is turned in the camera plane about
//    its (already corrected) proximal joint so its distal joint lands on the tracked joint, and children follow.
//    The arm chain is also shifted so the shoulder sits on the tracked shoulder (girdle moves with it).
// 2. Learned proportions. Standing still, arms by the sides, for ~2 s: each segment's on-screen length is compared
//    with the reference skeleton's, the median ratio becomes that segment's length factor (clamped 0.8-1.25), saved
//    in this browser only. Bones are then stretched along their own axis by that factor.
// 3. Objective. Placement error is measured on HELD-OUT points the fit never uses: the eyes (pose 2, 5 vs the lens
//    centres) and the heels (pose 29, 30 vs the most posterior calcaneus point), in pixels and as % of shoulder width,
//    for the global fit and the per-segment fit side by side. Fitted joints are listed separately (their residual
//    after per-segment fitting is small by construction).
// 4. Bony landmarks of the fitted skeleton drawn on the image, and 2D alignment readouts from the tracked landmarks.
// Everything here is a 2D camera-plane estimate on one reference skeleton; not validated against measurement (gate V1).
import * as THREE from 'three';

const KEY = 'anatomy-lab-ar-proportions';
export const FIT = { mode: 'segment', learn: null, scale: load(), lm: true, align: true, err: { g: [], s: [] }, alignEma: {} };
function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(FIT.scale)); } catch { /* storage blocked */ } }
export function resetProportions() { FIT.scale = {}; save(); }

const CHAINS = [];
for (const [k, s] of [['l', 0], ['r', 1]]) {
  CHAINS.push({ side: k, kind: 'arm', root: [`${k}_shoulder`, 11 + s], extra: [`${k}_girdle`], segs: [
    { seg: `${k}_humerus`, a: ['J', `${k}_shoulder`], b: ['J', `${k}_elbow`], t: [13 + s] },
    { seg: `${k}_forearm`, a: ['J', `${k}_elbow`], b: ['J', `${k}_wrist`], t: [15 + s] }] }); // the hand follows the forearm: its knuckles are held out
  CHAINS.push({ side: k, kind: 'leg', root: null, segs: [
    { seg: `${k}_femur`, a: ['J', `${k}_hip`], b: ['J', `${k}_knee`], t: [25 + s] },
    { seg: `${k}_leg`, a: ['J', `${k}_knee`], b: ['J', `${k}_ankle`], t: [27 + s] }] }); // the foot follows the shank: its toes are held out
}
// held-out points (never fitted): eyes, heels, knuckles (pose 17/19 vs metacarpal heads II and V), toes (pose 31 vs 1st MT head)
const HELD = [[['LM', 'l_eye'], [2]], [['LM', 'r_eye'], [5]], [['LM', 'l_heel'], [29]], [['LM', 'r_heel'], [30]],
  [['MID', 'l_mc2_head', 'l_mc5_head'], [17, 19]], [['MID', 'r_mc2_head', 'r_mc5_head'], [18, 20]], [['LM', 'l_mt1_head'], [31]], [['LM', 'r_mt1_head'], [32]]];
export const SHOW_LM = ['acromion', 'lat_humeral_epicondyle', 'med_humeral_epicondyle', 'olecranon', 'radial_styloid', 'ulnar_styloid', 'ASIS', 'iliac_crest', 'greater_trochanter',
  'lat_femoral_epicondyle', 'med_femoral_epicondyle', 'patella', 'tibial_tuberosity', 'lateral_malleolus', 'medial_malleolus', 'heel', 'mt1_head', 'inferior_angle', 'sternoclavicular'];
const SHORT = { acromion: 'Acromion', lat_humeral_epicondyle: 'Lat epicondyle', med_humeral_epicondyle: 'Med epicondyle', olecranon: 'Olecranon', radial_styloid: 'Radial styloid', ulnar_styloid: 'Ulnar styloid',
  ASIS: 'ASIS', iliac_crest: 'Iliac crest', greater_trochanter: 'Gr trochanter', lat_femoral_epicondyle: 'Lat fem epicondyle', med_femoral_epicondyle: 'Med fem epicondyle', patella: 'Patella',
  tibial_tuberosity: 'Tibial tuberosity', lateral_malleolus: 'Lat malleolus', medial_malleolus: 'Med malleolus', heel: 'Calcaneus', mt1_head: '1st MT head', inferior_angle: 'Scapula inf angle', sternoclavicular: 'SC joint' };

// ---------------------------------------------------------------- 2D map of the similarity fit (same formula as mirror_ar.js)
export function project(f, p) { const a0 = f.flip * p.x - f.mp[0], a1 = p.y - f.mp[1]; return [f.mq[0] + f.c * a0 - f.si * a1, f.mq[1] - (f.si * a0 + f.c * a1)]; }
function unproject(f, q, z) { // screen pixel -> twin point at depth z
  const d0 = q[0] - f.mq[0], d1 = -(q[1] - f.mq[1]), n = f.c * f.c + f.si * f.si;
  const a0 = (f.c * d0 + f.si * d1) / n, a1 = (-f.si * d0 + f.c * d1) / n;
  return new THREE.Vector3((a0 + f.mp[0]) * f.flip, a1 + f.mp[1], z);
}
function pt(rig, M, ref) {
  if (ref[0] === 'MID') { const a = pp(rig, M, 'LM', ref[1]), b = pp(rig, M, 'LM', ref[2]); return a && b ? a.add(b).multiplyScalar(0.5) : null; }
  return pp(rig, M, ref[0], ref[1]);
}
function pp(rig, M, store, key) { const o = rig[store][key]; return o ? o.p.clone().applyMatrix4(M.get(o.seg) || new THREE.Matrix4()) : null; }
const seen = (raw, i) => raw[i] && (raw[i].visibility ?? 0) >= 0.6 && raw[i].x > -0.02 && raw[i].x < 1.02 && raw[i].y > -0.02 && raw[i].y < 1.02;
const scr = (raw, i, W, H) => [(1 - raw[i].x) * W, raw[i].y * H];

// rotation about the twin z axis (the camera axis of the fit) through point c, then a stretch along u about c
function rotZ(c, ang) { return new THREE.Matrix4().makeTranslation(c.x, c.y, c.z).multiply(new THREE.Matrix4().makeRotationZ(ang)).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z)); }
function stretch(c, u, k) {
  const S = new THREE.Matrix4().set(1 + (k - 1) * u.x * u.x, (k - 1) * u.x * u.y, (k - 1) * u.x * u.z, 0, (k - 1) * u.y * u.x, 1 + (k - 1) * u.y * u.y, (k - 1) * u.y * u.z, 0,
    (k - 1) * u.z * u.x, (k - 1) * u.z * u.y, 1 + (k - 1) * u.z * u.z, 0, 0, 0, 0, 1);
  return new THREE.Matrix4().makeTranslation(c.x, c.y, c.z).multiply(S).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
}

/** Corrected segment matrices. Returns { M: Map, used: n } (M includes every segment). */
export function refine(rig, M0, f, raw, W, H) {
  const M = new Map(); M0.forEach((m, k) => M.set(k, m.clone()));
  if (FIT.mode !== 'segment') return { M, used: 0 };
  let used = 0;
  for (const ch of CHAINS) {
    let C = new THREE.Matrix4();
    if (ch.root && seen(raw, ch.root[1])) { // shoulder onto the tracked shoulder (girdle follows)
      const a = pp(rig, M0, 'J', ch.root[0]); const tgt = unproject(f, scr(raw, ch.root[1], W, H), a.z);
      C = new THREE.Matrix4().makeTranslation(tgt.x - a.x, tgt.y - a.y, 0);
      for (const g of ch.extra) { const m = M.get(g); if (m) m.premultiply(C); }
    }
    for (const s of ch.segs) {
      const m0 = M0.get(s.seg); if (!m0) break;
      const A = pt(rig, M0, s.a)?.applyMatrix4(C), B = pt(rig, M0, s.b)?.applyMatrix4(C); if (!A || !B) break;
      const ok = s.t.every((i) => seen(raw, i));
      let R = new THREE.Matrix4(), ang = 0, k = FIT.scale[s.seg] || 1;
      const ab = B.clone().sub(A), lenXY = Math.hypot(ab.x, ab.y);
      if (ok) {
        const q = s.t.map((i) => scr(raw, i, W, H)), qm = [q.reduce((x, y) => x + y[0], 0) / q.length, q.reduce((x, y) => x + y[1], 0) / q.length];
        const T = unproject(f, qm, B.z), at = T.clone().sub(A);
        if (lenXY > 0.3 * ab.length()) { ang = Math.atan2(at.y, at.x) - Math.atan2(ab.y, ab.x); ang = Math.atan2(Math.sin(ang), Math.cos(ang)); R = rotZ(A, ang); used++; }
        if (FIT.learn && lenXY > 0.7 * ab.length()) (FIT.learn.r[s.seg] ||= []).push(Math.hypot(at.x, at.y) / lenXY);
      }
      const u = ab.clone().normalize();
      const Cseg = R.clone().multiply(stretch(A, u, k));
      M.set(s.seg, Cseg.clone().multiply(C).multiply(m0));
      // children: rigid turn about A plus the shift of the distal joint caused by the stretch
      const shift = ab.clone().multiplyScalar(k - 1).applyMatrix4(new THREE.Matrix4().makeRotationZ(ang));
      C = new THREE.Matrix4().makeTranslation(shift.x, shift.y, shift.z).multiply(R).multiply(C);
    }
  }
  if (FIT.learn) stepLearn();
  return { M, used };
}

export function startLearn(onDone) { FIT.learn = { r: {}, t0: performance.now(), onDone }; }
function stepLearn() {
  const L_ = FIT.learn, dt = performance.now() - L_.t0, nmin = Math.min(...Object.values(L_.r).map((x) => x.length), 99);
  if (dt < 2200 || (dt < 6000 && nmin < 15)) return; // at least 2.2 s; up to 6 s on a slow machine
  const out = {};
  for (const [seg, xs] of Object.entries(L_.r)) {
    if (xs.length < 8) continue;
    const s = [...xs].sort((a, b) => a - b), med = s[Math.floor(s.length / 2)];
    out[seg] = Math.max(0.8, Math.min(1.25, (FIT.scale[seg] || 1) * med));
  }
  Object.assign(FIT.scale, out); save(); FIT.learn = null; L_.onDone?.(out);
}

/** Held-out and fitted-point errors for the global and corrected fits. */
export function errors(rig, Mg, Ms, f, raw, W, H) {
  const sw = seen(raw, 11) && seen(raw, 12) ? Math.hypot(...[0, 1].map((i) => scr(raw, 11, W, H)[i] - scr(raw, 12, W, H)[i])) : null;
  const held = (M) => { const e = HELD.filter(([, ix]) => ix.every((i) => seen(raw, i))).map(([ref, ix]) => { const p = pt(rig, M, ref); if (!p) return null; const a = project(f, p), q = ix.map((i) => scr(raw, i, W, H)), b = [q.reduce((x, y) => x + y[0], 0) / q.length, q.reduce((x, y) => x + y[1], 0) / q.length]; return Math.hypot(a[0] - b[0], a[1] - b[1]); }).filter((x) => x != null); return e.length ? e.reduce((x, y) => x + y, 0) / e.length : null; };
  const g = held(Mg), s = held(Ms);
  const push = (arr, v) => { if (v != null) { arr.push(v); if (arr.length > 90) arr.shift(); } };
  push(FIT.err.g, g); push(FIT.err.s, s);
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const fitted = (M) => CHAINS.flatMap((ch) => ch.segs).filter((s_) => s_.t.every((i) => seen(raw, i))).map((s_) => { const p = pt(rig, M, s_.b); if (!p) return null; const a = project(f, p), q = s_.t.map((i) => scr(raw, i, W, H)); const b = [q.reduce((x, y) => x + y[0], 0) / q.length, q.reduce((x, y) => x + y[1], 0) / q.length]; return Math.hypot(a[0] - b[0], a[1] - b[1]); }).filter((x) => x != null);
  const fa = fitted(Mg), fb = fitted(Ms);
  return { heldG: avg(FIT.err.g), heldS: avg(FIT.err.s), n: FIT.err.g.length, sw, fitG: fa.length ? fa.reduce((x, y) => x + y, 0) / fa.length : null, fitS: fb.length ? fb.reduce((x, y) => x + y, 0) / fb.length : null };
}

/** Bony landmarks of the fitted skeleton, drawn on a 2D canvas. */
export function drawLandmarks(ctx, rig, M, f, W, H) {
  ctx.clearRect(0, 0, W, H);
  if (!FIT.lm) return;
  ctx.font = `${Math.max(11, Math.round(W / 110))}px Inter, system-ui, sans-serif`; ctx.textBaseline = 'middle';
  const pts = [];
  for (const side of ['l', 'r']) for (const k of SHOW_LM) { const p = pp(rig, M, 'LM', `${side}_${k}`); if (p) pts.push([side, k, project(f, p)]); }
  for (const k of ['C7_spinous', 'S1_top', 'vertex', 'menton']) { const p = pp(rig, M, 'LM', k); if (p) pts.push(['', k, project(f, p)]); }
  // reference lines between paired landmarks (acromions, ASIS, femoral epicondyles, malleoli)
  ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]); ctx.strokeStyle = 'rgba(255,192,103,0.8)';
  for (const k of ['acromion', 'ASIS', 'lat_femoral_epicondyle', 'lateral_malleolus']) {
    const a = pts.find((x) => x[0] === 'l' && x[1] === k), b = pts.find((x) => x[0] === 'r' && x[1] === k);
    if (a && b) { ctx.beginPath(); ctx.moveTo(...a[2]); ctx.lineTo(...b[2]); ctx.stroke(); }
  }
  ctx.setLineDash([]);
  for (const [side, k, [x, y]] of pts) {
    if (x < 0 || y < 0 || x > W || y > H) continue;
    ctx.fillStyle = '#ffc067'; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill();
    ctx.strokeStyle = '#3b2200'; ctx.lineWidth = 1; ctx.stroke();
    if (['acromion', 'ASIS', 'greater_trochanter', 'lat_femoral_epicondyle', 'lateral_malleolus', 'olecranon', 'radial_styloid'].includes(k) || !side) {
      const t = `${side ? side.toUpperCase() + ' ' : ''}${SHORT[k] || k.replace('_', ' ')}`, right = side === 'l';
      ctx.fillStyle = 'rgba(4,12,26,0.75)'; const w = ctx.measureText(t).width + 8; ctx.fillRect(right ? x + 6 : x - 6 - w, y - 8, w, 16);
      ctx.fillStyle = '#ffe2b0'; ctx.fillText(t, right ? x + 10 : x - 2 - w, y);
    }
  }
}

function tiltRow(out, a, b, name) {
  if (!a || !b) return;
  const lft = a[0] > b[0] ? a : b, rgt = a[0] > b[0] ? b : a, t = (Math.atan2(rgt[1] - lft[1], lft[0] - rgt[0]) * 180) / Math.PI;
  out.rows.push([name, t, `${Math.abs(t).toFixed(1)}° ${Math.abs(t) < 0.5 ? 'level' : t > 0 ? 'right side of image lower' : 'left side of image lower'}`]);
}
/** 2D alignment readouts from the tracked landmarks (image plane). */
export function alignment(raw, W, H) {
  const P = (i) => (seen(raw, i) ? scr(raw, i, W, H) : null), deg = (r) => (r * 180) / Math.PI;
  const S = [P(11), P(12)], Hp = [P(23), P(24)], sw = S[0] && S[1] ? Math.hypot(S[0][0] - S[1][0], S[0][1] - S[1][1]) : 0;
  const torso = S[0] && Hp[0] ? Math.hypot(S[0][0] - Hp[0][0], S[0][1] - Hp[0][1]) : 0;
  const ears = [P(7), P(8)], earW = ears[0] && ears[1] ? Math.hypot(ears[0][0] - ears[1][0], ears[0][1] - ears[1][1]) : 0;
  const view = sw && torso ? (sw / torso > 0.45 ? 'front' : sw / torso < 0.25 ? 'side' : 'oblique') : sw && earW ? 'upper body, front' : sw && (ears[0] || ears[1]) ? 'upper body, side' : 'unknown';
  const out = { view, rows: [] };
  if (view === 'upper body, front') { // no hips in view: shoulder level, head over the shoulders, head tilt
    tiltRow(out, S[0], S[1], 'Shoulder line'); tiltRow(out, ears[0], ears[1], 'Head tilt (ear line)');
    const nose = P(0); if (nose) { const mx = (S[0][0] + S[1][0]) / 2, d = (100 * (nose[0] - mx)) / sw; out.rows.push(['Head over shoulders', d, `${Math.abs(d).toFixed(0)}% of shoulder width ${Math.abs(d) < 3 ? '(centred)' : d > 0 ? 'to image right' : 'to image left'}`]); }
    return out;
  }
  if (view === 'upper body, side') { const e = ears[0] || ears[1], sh = ears[0] ? S[0] : S[1]; if (e && sh) { const a = deg(Math.atan2(sh[1] - e[1], Math.abs(e[0] - sh[0]))); out.rows.push(['Head: shoulder→ear angle above horizontal', a, `${a.toFixed(0)}° (smaller = head further forward of the shoulder)`]); } return out; }
  const tilt = (a, b, name) => tiltRow(out, a, b, name);
  if (view === 'front' || view === 'oblique') {
    tilt(S[0], S[1], 'Shoulder line'); tilt(Hp[0], Hp[1], 'Pelvic line (hip joints)');
    const nose = P(0); if (nose && Hp[0] && Hp[1] && sw) { const mx = (Hp[0][0] + Hp[1][0]) / 2, d = (100 * (nose[0] - mx)) / sw; out.rows.push(['Head over pelvis', d, `${Math.abs(d).toFixed(0)}% of shoulder width ${Math.abs(d) < 3 ? '(centred)' : d > 0 ? 'to image right' : 'to image left'}`]); }
    if (S[0] && S[1] && Hp[0] && Hp[1]) { const ms = [(S[0][0] + S[1][0]) / 2, (S[0][1] + S[1][1]) / 2], mh = [(Hp[0][0] + Hp[1][0]) / 2, (Hp[0][1] + Hp[1][1]) / 2], t = deg(Math.atan2(ms[0] - mh[0], mh[1] - ms[1])); out.rows.push(['Trunk lateral lean', t, `${Math.abs(t).toFixed(1)}° ${Math.abs(t) < 1 ? 'upright' : t > 0 ? 'toward image right' : 'toward image left'}`]); }
    for (const [lab, h, k, a, other] of [['Left knee', 23, 25, 27, 24], ['Right knee', 24, 26, 28, 23]]) { // frontal-plane projection angle
      const hp = P(h), kp = P(k), ap = P(a), op = P(other); if (!hp || !kp || !ap || !op) continue;
      const v1 = [hp[0] - kp[0], hp[1] - kp[1]], v2 = [ap[0] - kp[0], ap[1] - kp[1]], ang = deg(Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2))))));
      const line = ap[0] + ((hp[0] - ap[0]) * (kp[1] - ap[1])) / ((hp[1] - ap[1]) || 1e-6), medial = Math.sign(op[0] - hp[0]), inward = (kp[0] - line) * medial > 0;
      const dev = 180 - ang; out.rows.push([`${lab} (frontal projection angle)`, dev, `${dev.toFixed(1)}° from straight, knee ${dev < 1 ? 'in line' : inward ? 'inside the hip–ankle line' : 'outside the hip–ankle line'}`]);
    }
  }
  if (view === 'side' || view === 'oblique') {
    const sideOf = [[7, 11, 23, 25, 27], [8, 12, 24, 26, 28]].find((ix) => ix.every((i) => P(i)));
    if (sideOf) {
      const [ear, sh, hip, kn, an] = sideOf.map(P);
      const head = deg(Math.atan2(sh[1] - ear[1], Math.abs(ear[0] - sh[0]))); out.rows.push(['Head: shoulder→ear angle above horizontal', head, `${head.toFixed(0)}° (smaller = head further forward of the shoulder)`]);
      const tr = deg(Math.atan2(Math.abs(sh[0] - hip[0]), hip[1] - sh[1])); out.rows.push(['Trunk from vertical', tr, `${tr.toFixed(1)}°`]);
      const k = 180 - deg(Math.acos(((hip[0] - kn[0]) * (an[0] - kn[0]) + (hip[1] - kn[1]) * (an[1] - kn[1])) / (Math.hypot(hip[0] - kn[0], hip[1] - kn[1]) * Math.hypot(an[0] - kn[0], an[1] - kn[1]))));
      out.rows.push(['Knee flexion (side view)', k, `${k.toFixed(1)}°`]);
      const plumb = (100 * (ear[0] - an[0])) / (Math.hypot(sh[0] - hip[0], sh[1] - hip[1]) || 1); out.rows.push(['Ear vs ankle (plumb line)', plumb, `${Math.abs(plumb).toFixed(0)}% of trunk length ${Math.abs(plumb) < 5 ? '(over the ankle)' : 'off the ankle'}`]);
    }
  }
  return out;
}
