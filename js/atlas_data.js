// Shared loader for the BodyParts3D packs: geometry is decoded once and shared
// by the 3D Atlas tab and the scanner lens. Also exposes anatomical anchors
// (joint positions taken from bone meshes) and region lookup.

import * as THREE from 'three';

let loading = null;

export function loadAtlas(onStatus = () => {}) {
  if (!loading) loading = load(onStatus);
  return loading;
}

async function load(onStatus) {
  onStatus('Loading atlas index…');
  const res = await fetch('/training-4D/rt/atlas/index.json');
  if (!res.ok) throw new Error('Atlas not built yet. Run: .venv\\Scripts\\python.exe -m tools.anatomy_lab_build');
  const index = await res.json();
  const span = index.bbox_span, mn = index.bbox_min;
  const up = span.indexOf(Math.max(...span));
  const center = [0, 1, 2].map((a) => mn[a] + span[a] / 2);

  const parts = []; // { part, geometry }
  for (const L of index.layers) {
    onStatus(`Loading ${L.label} (${(L.bytes / 1e6).toFixed(1)} MB)…`);
    const buf = await (await fetch(`/training-4D/rt/atlas/${L.file}`)).arrayBuffer();
    for (const p of index.parts.filter((q) => q.layer === L.key)) {
      const q = new Uint16Array(buf, p.vOff, p.vCount * 3);
      const pos = new Float32Array(q.length);
      for (let i = 0; i < q.length; i += 3) {
        const v0 = ((mn[0] + (q[i] / 65535) * span[0]) - center[0]) / 1000;
        const v1 = ((mn[1] + (q[i + 1] / 65535) * span[1]) - center[1]) / 1000;
        const v2 = ((mn[2] + (q[i + 2] / 65535) * span[2]) - center[2]) / 1000;
        if (up === 2) { pos[i] = v0; pos[i + 1] = v2; pos[i + 2] = -v1; }
        else if (up === 1) { pos[i] = v0; pos[i + 1] = v1; pos[i + 2] = v2; }
        else { pos[i] = v1; pos[i + 1] = v0; pos[i + 2] = v2; }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setIndex(new THREE.BufferAttribute(new Uint32Array(buf, p.iOff, p.iCount), 1));
      g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
      parts.push({ part: p, geometry: g });
    }
  }
  const byName = new Map(parts.map((x) => [x.part.name, x]));
  const anchors = computeAnchors(byName);
  const box = new THREE.Box3();
  parts.forEach((x) => box.union(x.geometry.boundingBox));
  return { index, parts, byName, anchors, box };
}

function bb(byName, name) { const x = byName.get(name); return x ? x.geometry.boundingBox : null; }
const ctr = (b) => b.getCenter(new THREE.Vector3());
const top = (b) => { const c = ctr(b); c.y = b.max.y; return c; };
const bottom = (b) => { const c = ctr(b); c.y = b.min.y; return c; };

// Joint positions from bone meshes (reference anatomy, anatomical position).
function computeAnchors(byName) {
  const A = {};
  for (const s of ['left', 'right']) {
    const k = s[0];
    const hum = bb(byName, `${s} humerus`), rad = bb(byName, `${s} radius`), fem = bb(byName, `${s} femur`), tib = bb(byName, `${s} tibia`);
    const tip = bb(byName, `distal phalanx of ${s} middle finger`), toe = bb(byName, `distal phalanx of ${s} big toe`), cal = bb(byName, `${s} calcaneus`);
    const lens = bb(byName, `${s} lens`);
    if (hum) { A[`${k}_shoulder`] = top(hum); A[`${k}_elbow`] = bottom(hum); }
    if (rad) A[`${k}_wrist`] = bottom(rad);
    if (tip) A[`${k}_fingertip`] = bottom(tip);
    if (fem) { A[`${k}_hip`] = top(fem); A[`${k}_knee`] = bottom(fem); }
    if (tib) A[`${k}_ankle`] = bottom(tib);
    if (toe) A[`${k}_toe`] = ctr(toe);
    if (cal) A[`${k}_heel`] = ctr(cal);
    if (lens) A[`${k}_eye`] = ctr(lens);
  }
  const mand = bb(byName, 'mandible'), front = bb(byName, 'frontal bone');
  if (mand) A.chin = bottom(mand);
  if (front) A.vertex = top(front);
  const pat = bb(byName, 'left patella'), fem = bb(byName, 'left femur');
  // which way is anterior: the patella lies in front of the femur
  A.anterior = pat && fem ? Math.sign(ctr(pat).z - ctr(fem).z) || 1 : 1;
  // which way is the subject's left along x
  A.leftX = A.l_shoulder && A.r_shoulder ? Math.sign(A.l_shoulder.x - A.r_shoulder.x) || 1 : 1;
  return A;
}

// Region of a point in atlas space: nearest limb segment, else trunk/head band.
const SEGMENTS = [
  ['l_shoulder', 'l_elbow', 'upper_arm', 'shoulder', 'elbow'], ['r_shoulder', 'r_elbow', 'upper_arm', 'shoulder', 'elbow'],
  ['l_elbow', 'l_wrist', 'forearm', 'elbow', 'wrist'], ['r_elbow', 'r_wrist', 'forearm', 'elbow', 'wrist'],
  ['l_wrist', 'l_fingertip', 'hand', 'wrist', 'hand'], ['r_wrist', 'r_fingertip', 'hand', 'wrist', 'hand'],
  ['l_hip', 'l_knee', 'thigh', 'hip', 'knee'], ['r_hip', 'r_knee', 'thigh', 'hip', 'knee'],
  ['l_knee', 'l_ankle', 'lower_leg', 'knee', 'ankle'], ['r_knee', 'r_ankle', 'lower_leg', 'knee', 'ankle'],
  ['l_heel', 'l_toe', 'foot', 'ankle', 'foot'], ['r_heel', 'r_toe', 'foot', 'ankle', 'foot'],
];

export function regionOf3D(p, A) {
  let best = null;
  for (const [a, b, mid, start, end] of SEGMENTS) {
    if (!A[a] || !A[b]) continue;
    const ab = A[b].clone().sub(A[a]); const L = ab.length();
    const t = Math.max(0, Math.min(1, p.clone().sub(A[a]).dot(ab) / (L * L)));
    const d = p.distanceTo(A[a].clone().addScaledVector(ab, t)) / L;
    const reg = t < 0.12 ? start : t > 0.88 ? end : mid;
    if (!best || d < best.d) best = { d, region: reg };
  }
  if (best && best.d < 0.28) return best.region;
  // trunk and head bands by height
  const yS = (A.l_shoulder.y + A.r_shoulder.y) / 2, yH = (A.l_hip.y + A.r_hip.y) / 2;
  if (A.chin && p.y > A.chin.y) return (A.l_eye && p.y < A.l_eye.y + 0.03 && (p.z - A.l_eye.z) * A.anterior > -0.06) ? 'face' : 'head';
  if (p.y > yS) return 'neck';
  if (p.y > (yS + yH) / 2 + 0.02) return 'thorax';
  if (p.y > yH + 0.04) return 'abdomen';
  return 'hip';
}
