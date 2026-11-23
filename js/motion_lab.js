// Motion Lab: a live 3D skeleton twin (3D + time) driven by the camera, with
// joint centres and bony landmarks computed from the bones, depth classes,
// a full-body movement-test protocol, a live sync check and a closed-loop
// self-test of the solver.

import { listCameras, addCamera, removeCamera, lockAlignment, multicam } from './multicam.js';
import { getPoseModel, setPoseModel } from './mirror.js';
import * as THREE from 'three';
import { pointerControls, surfacePicker } from './view_controls.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadAtlas } from './atlas_data.js';
import { studio, materialFor, tissueKind, KIND_LABEL, DEPTH_CLASSES } from './look.js';
import { buildRig, restLandmarks, LANDMARK_SEG, segmentFrames, solve, poseMatrices, posedPoint, angleAt, relEuler, refineThorax, refineTrunk, tiltPelvis, LUMBOPELVIC_ALPHA } from './rig.js';
import { LandmarkSmoother } from './kinematics.js';
import { startMirror, subscribeFrames, extern } from './mirror.js';
import { channels, bodyPosition, DrillRecognizer, DRILLS } from './drills.js';
import { buildJointMap } from './joint_map.js';
import { MUSCLE_ACTIONS } from './anatomy_maps.js';
import { analyse, interpret, GROUPS, SOURCE as BSP_SOURCE } from './biomech.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const L = {
  rig: null, atlas: null, scene: null, camera: null, controls: null, renderer: null, groups: new Map(), ghost: null,
  Fref: null, FrefRest: null, calibrated: false, R: {}, M: null, W: null, src: 'none', sx: 0, sz: 0,
  smoother: new LandmarkSmoother(33, 1.0, 1.5), depth: 2, showJ: true, showLM: true, showLabels: true,
  test: null, results: [], demo: null, hover: null, labelEls: [], lastFrameT: 0,
};

// Normal values, quoted verbatim from StatPearls (NCBI Bookshelf, CC BY-NC-ND 4.0), local open library.
const NORMS = {
  knee: { quote: 'The normal range of motion (ROM) of the knee is 0 to 140 degrees, with 8 to 12 degrees of rotation during flexion and extension.', src: 'StatPearls: Knee Dislocation' },
  elbow: { quote: 'Normal elbow flexion is approximately 140 degrees.', src: 'StatPearls: Coronoid Fractures' },
  trunk: { quote: 'For the range of motion of the thoracolumbar spine, the normal values are 90 degrees for flexion, 30 degrees for extension, lateral side bending, and rotation.', src: 'StatPearls: Kyphosis',
    note: 'The camera trunk angle is the thorax relative to a level pelvis (pelvic tilt is not observable), so it includes hip motion and is not a pure spinal measure.' },
};

// ------------------------------------------------------------------ movement tests
const TESTS = [
  { id: 'neck_flex', group: 'Spine', label: 'Neck flexion / extension', how: 'Chin to chest, then look up to the ceiling.', segs: ['head', 'v_C4'], m: (x) => x.neck?.flex, two: ['flexion', 'extension'] },
  { id: 'neck_rot', group: 'Spine', label: 'Neck rotation', how: 'Turn your head fully left, then fully right.', segs: ['head'], m: (x) => x.neck?.rotL, two: ['to the left', 'to the right'] },
  { id: 'neck_side', group: 'Spine', label: 'Neck side bend', how: 'Ear toward the left shoulder, then the right.', segs: ['head'], m: (x) => x.neck?.sideL, two: ['to the left', 'to the right'] },
  { id: 'trunk_flex', group: 'Spine', label: 'Trunk flexion / extension', how: 'Stand side-on if you can. Bend forward, then lean back.', segs: ['v_L3', 'v_T8'], m: (x) => x.trunkIncl ?? x.trunk?.flex, two: ['flexion', 'extension'], norm: 'trunk' },
  { id: 'trunk_side', group: 'Spine', label: 'Trunk side bend', how: 'Slide a hand down the side of each leg in turn.', segs: ['v_L3', 'v_T8'], m: (x) => x.trunk?.sideL, two: ['to the left', 'to the right'], norm: 'trunk' },
  { id: 'trunk_rot', group: 'Spine', label: 'Trunk rotation', how: 'Arms crossed, turn your shoulders left, then right. Keep hips facing the camera.', segs: ['v_T8'], m: (x) => x.trunk?.rotL, two: ['to the left', 'to the right'], norm: 'trunk' },
  { id: 'pelvis_drop', group: 'Pelvis', label: 'Single-leg stance (pelvic level)', how: 'Stand on one leg for 5 seconds, then the other.', segs: ['pelvis'], m: (x) => x.pelvis?.obliq, two: ['left side up', 'right side up'] },
  { id: 'pelvis_rot', group: 'Pelvis', label: 'Pelvic rotation', how: 'Turn your hips left, then right.', segs: ['pelvis'], m: (x) => x.pelvis?.rotL, two: ['to the left', 'to the right'] },
  ...['l', 'r'].flatMap((k) => {
    const S = k === 'l' ? 'Left' : 'Right';
    return [
      { id: `${k}_sh_flex`, group: S, label: `${S} shoulder flexion`, how: 'Raise the arm forward and overhead, elbow straight.', segs: [`${k}_humerus`], m: (x) => (x[`${k}_sh`]?.plane === 'flexion' ? x[`${k}_sh`].elev : null) },
      { id: `${k}_sh_abd`, group: S, label: `${S} shoulder abduction`, how: 'Raise the arm out to the side and overhead.', segs: [`${k}_humerus`], m: (x) => (x[`${k}_sh`]?.plane === 'abduction' ? x[`${k}_sh`].elev : null) },
      { id: `${k}_elbow`, group: S, label: `${S} elbow flexion`, how: 'Upper arm still, bend the elbow fully, then straighten.', segs: [`${k}_forearm`], m: (x) => x[`${k}_elbow`], norm: 'elbow' },
      { id: `${k}_hip_flex`, group: S, label: `${S} hip flexion`, how: 'Standing tall, lift the knee up toward the chest.', segs: [`${k}_femur`], m: (x) => x[`${k}_hip`]?.flex },
      { id: `${k}_hip_abd`, group: S, label: `${S} hip abduction`, how: 'Standing tall, lift the leg out to the side.', segs: [`${k}_femur`], m: (x) => x[`${k}_hip`]?.abd },
      { id: `${k}_knee`, group: S, label: `${S} knee flexion`, how: 'Hold a support. Bring the heel toward the buttock.', segs: [`${k}_leg`], m: (x) => x[`${k}_knee`], norm: 'knee' },
      { id: `${k}_ankle`, group: S, label: `${S} ankle dorsiflexion`, how: 'Foot flat, slide the knee forward over the toes.', segs: [`${k}_foot`], m: (x) => x[`${k}_ankle`] },
    ];
  }),
  { id: 'squat', group: 'Functional', label: 'Squat', how: 'Feet shoulder-width, squat as deep as is comfortable, stand up.', segs: ['l_femur', 'r_femur', 'l_leg', 'r_leg', 'v_L3'],
    m: (x) => (x.l_knee != null && x.r_knee != null ? (x.l_knee + x.r_knee) / 2 : null), extra: (x) => ({ 'L knee': x.l_knee, 'R knee': x.r_knee, 'L hip': x.l_hip?.flex, 'R hip': x.r_hip?.flex, 'Trunk': x.trunk?.flex }) },
];

// ------------------------------------------------------------------ start
export function labState() { return L; }
if (typeof window !== "undefined") window.__anatomyLab = { L, get BIO() { return BIO; }, rec: (ids) => recognitionTest(ids), selfTest: () => selfTest(),
  pose: (p) => { L.demo = false; const { W } = landmarksFrom(commanded(p)); L.W = W; L.vis = null; L.src = "demo"; L.Fref = L.FrefRest; step(performance.now() / 1000); },
  view: (dir) => { const c = L.atlas.box.getCenter(new THREE.Vector3()), h = L.atlas.box.getSize(new THREE.Vector3()).y, A = L.atlas.anchors; const d = { front: [0, 0, A.anterior], side: [A.leftX, 0, 0], back: [0, 0, -A.anterior] }[dir]; L.camera.position.set(c.x + d[0] * h * 2.2, c.y, c.z + d[2] * h * 2.2); L.controls.target.copy(c); L.controls.update(); } }; // for inspection in the browser console
// Movement studio (js/movement_studio.js) poses the twin itself and paints muscle roles through these.
export function labHooks() { return { applyMatrices, applyLook, stopExercise, stopDemo: () => { L.demo = null; const b = $('#lab-demo'); if (b) b.textContent = 'Demo motion'; const n = $('#lab-demo-name'); if (n) n.textContent = ''; } }; }
export function labExtras() { return { BIO, posedPoint, restLandmarks, LANDMARK_SEG }; }
// js/equipment.js: external loads fed into inverse dynamics, and a per-frame hook to move the equipment with the twin
let LOAD_PROVIDER = null; const FRAME_HOOKS = new Set();
export function setLoadProvider(fn) { LOAD_PROVIDER = fn; }
export function onLabFrame(fn) { FRAME_HOOKS.add(fn); return () => FRAME_HOOKS.delete(fn); }

let labStarted = null;
export function startMotionLab() { return (labStarted ||= startMotionLabInner()); }
async function startMotionLabInner() {
  window.__lab = L;
  import('./exercise_lib.js').then((m) => m.initExerciseLibrary()).catch((e) => console.error('exercise library', e));
  const status = $('#lab-status');
  const canvas = $('#lab-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  const scene = new THREE.Scene();
  studio(renderer, scene);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
  const controls = new OrbitControls(camera, canvas); controls.enableDamping = true;
  Object.assign(L, { renderer, scene, camera, controls });
  const resize = () => { const r = canvas.parentElement.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); };
  new ResizeObserver(resize).observe(canvas.parentElement); resize();

  try { L.atlas = await loadAtlas((m) => { status.textContent = m; }); } catch (e) { status.textContent = e.message; return; }
  status.textContent = 'Computing joint centres and bony landmarks…';
  await new Promise((r) => setTimeout(r, 20));
  L.rig = buildRig(L.atlas);
  L.FrefRest = segmentFrames(restLandmarks(L.rig), L.rig); L.Fref = L.FrefRest;

  buildTwin();
  const box = L.atlas.box, c = box.getCenter(new THREE.Vector3()), h = box.getSize(new THREE.Vector3()).y;
  camera.position.set(c.x, c.y, c.z + L.atlas.anchors.anterior * h * 2.4); controls.target.copy(c); controls.update();
  floor(box);
  L.pc = pointerControls({ controls, camera, canvas, pick: surfacePicker(camera, canvas, () => [...L.groups.values()].flatMap((g) => g.children.filter((c) => c.visible && c.isMesh))) }); L.pc.setHome();
  setupUI();
  L.M = poseMatrices(L.rig, {}); applyMatrices();
  renderAudit();
  import('./movement_studio.js').then((m) => m.initStudio()).catch((e) => console.error('movement studio', e));
  import('./equipment.js').then((m) => m.initEquipment()).catch((e) => console.error('equipment', e));
  status.textContent = `${L.rig.segs.size} rigid segments · ${Object.keys(L.rig.J).length} joint centres · ${Object.keys(L.rig.LM).length} bony landmarks. Start the camera, or press Demo.`;
  subscribeFrames(onFrame);
  renderer.setAnimationLoop(tick);
}

function floor(box) {
  const g = new THREE.Mesh(new THREE.CircleGeometry(0.9, 64), new THREE.MeshStandardMaterial({ color: 0x0b1a30, roughness: 0.9, metalness: 0, transparent: true, opacity: 0.75 }));
  g.rotation.x = -Math.PI / 2; g.position.y = box.min.y - 0.005; L.scene.add(g);
  const grid = new THREE.PolarGridHelper(0.9, 12, 6, 64, 0x2a4d7a, 0x1a3354); grid.position.y = box.min.y - 0.004; L.scene.add(grid);
}

function buildTwin() {
  const seg2group = new Map();
  for (const s of L.rig.segs.values()) {
    const g = new THREE.Group(); g.matrixAutoUpdate = false; g.userData.seg = s.key; L.scene.add(g); seg2group.set(s.key, g);
    for (const part of s.parts) {
      const geo = L.atlas.byName.get(part.name)?.geometry; if (!geo) continue;
      const layerColor = L.atlas.index.layers.find((x) => x.key === part.layer).color;
      const mesh = new THREE.Mesh(geo, materialFor(part, layerColor)); mesh.userData.part = part; mesh.userData.seg = s.key; g.add(mesh);
    }
  }
  L.groups = seg2group;
  // joint centres and landmarks (small spheres, carried by their segment)
  const jg = new THREE.SphereGeometry(0.009, 16, 12), lg = new THREE.SphereGeometry(0.006, 12, 10);
  const jm = new THREE.MeshStandardMaterial({ color: 0x4fd1ff, emissive: 0x1a7fb0, emissiveIntensity: 0.9 });
  const lm = new THREE.MeshStandardMaterial({ color: 0xffc067, emissive: 0x8a5200, emissiveIntensity: 0.9 });
  L.markers = [];
  for (const [store, geo, mat] of [['J', jg, jm], ['LM', lg, lm]]) {
    for (const [key, o] of Object.entries(L.rig[store])) {
      const g = seg2group.get(o.seg) || seg2group.get('pelvis'); if (!g) continue;
      const s = new THREE.Mesh(geo, mat); s.position.copy(o.p); s.userData = { marker: store, key }; g.add(s); L.markers.push(s);
    }
  }
  // rest-pose ghost
  L.ghost = new THREE.Group(); L.ghost.visible = false; L.scene.add(L.ghost);
  const gm = new THREE.MeshBasicMaterial({ color: 0x6fd3ff, transparent: true, opacity: 0.08, depthWrite: false });
  for (const s of L.rig.segs.values()) for (const part of s.parts) if (part.layer === 'skeleton' && tissueKind(part) === 'bone') L.ghost.add(new THREE.Mesh(L.atlas.byName.get(part.name).geometry, gm));
  applyDepth();
}

function applyDepth() { applyLook(); }

// One place decides each mesh's material and visibility:
// joint-map highlight > movement-test highlight > depth class.
const KIND_MAT = {};
function kindMat(kind) {
  if (kind.startsWith('col:')) { const c = kind.slice(4); return (KIND_MAT[kind] ||= new THREE.MeshPhysicalMaterial({ color: c, emissive: c, emissiveIntensity: 0.3, roughness: 0.45, side: THREE.DoubleSide })); }
  const col = { bone: 0xffc067, cartilage: 0x5fd8ff, disc: 0x5f8dff, ligament: 0xf4f7ff, tooth: 0xffc067, muscles: 0xff4d6d, arteries: 0xff2e3e, veins: 0x4a7dff, nerves: 0xffe14d }[kind] || 0xc77dff;
  return (KIND_MAT[kind] ||= new THREE.MeshPhysicalMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, roughness: 0.4, clearcoat: 0.5, side: THREE.DoubleSide }));
}
let ghostMat = null, _unseen = null;
const unseenMat = () => (_unseen ||= new THREE.MeshPhysicalMaterial({ color: 0x8fa8c8, transparent: true, opacity: 0.18, depthWrite: false, roughness: 0.7, side: THREE.DoubleSide }));
function applyLook() {
  if (L.hover) { L.hover.material = L.hover.userData.prevMat; L.hover = null; }
  ghostMat = ghostMat || new THREE.MeshPhysicalMaterial({ color: 0x9fc4ff, transparent: true, opacity: 0.06, depthWrite: false, roughness: 0.6, side: THREE.DoubleSide });
  hiMat = hiMat || new THREE.MeshPhysicalMaterial({ color: 0xffc067, emissive: 0xff9a1f, emissiveIntensity: 0.55, roughness: 0.35, clearcoat: 0.6, side: THREE.DoubleSide });
  const cls = DEPTH_CLASSES.find((d) => d.key === L.depth);
  L.groups.forEach((g, key) => g.children.forEach((m) => {
    const part = m.userData.part; if (!part) return;
    m.userData.base = m.userData.base || m.material;
    let mat = m.userData.base, vis = cls.show(part);
    if (L.jmSet) {
      const kind = L.jmSet.get(part.name);
      if (kind) { mat = kindMat(kind); vis = true; } else if (L.jmGhost) mat = ghostMat;
    } else if (L.bioSet && part.layer === 'muscles' && (L.bioSet.has(part.name) || L.bioGhost)) {
      const b = L.bioSet.get(part.name);
      if (b) { mat = bioMat(b); vis = true; } else mat = ghostMat;
    } else if ((L.hiSegs || []).includes(key) && tissueKind(part) === 'bone') mat = hiMat;
    if (L.unseen?.has(key) && !L.jmSet) mat = unseenMat(); // posed by assumption (seated / out of view), not measured
    m.material = mat; m.visible = vis;
  }));
  L.markers.forEach((m) => { m.visible = m.userData.marker === 'J' ? L.showJ : L.showLM; });
}

// Keep the lowest heel or toe on the floor: the body lowers in a squat instead of the feet lifting.
function ground(M) {
  const keys = ['l_heel', 'r_heel', 'l_toe_tip', 'r_toe_tip', 'l_mt1_head', 'r_mt1_head'];
  const restMin = Math.min(...keys.map((k) => L.rig.LM[k]?.p.y ?? Infinity));
  const nowMin = Math.min(...keys.map((k) => posedPoint(L.rig, M, 'LM', k)?.y ?? Infinity));
  if (!Number.isFinite(restMin) || !Number.isFinite(nowMin)) return M;
  // airborne: both feet measured off the floor in the image (jump) -> raise the whole body by the smaller lift
  const air = L.jumpLift && L.jumpLift.l > 2 && L.jumpLift.r > 2 ? Math.min(L.jumpLift.l, L.jumpLift.r) / 100 : 0;
  const T = new THREE.Matrix4().makeTranslation(0, restMin - nowMin + air, 0);
  M.forEach((m) => m.premultiply(T));
  return M;
}

function applyMatrices() {
  L.groups.forEach((g, key) => { const m = L.M.get(key); if (m) { g.matrix.copy(m); g.matrixWorldNeedsUpdate = true; } });
}

// ------------------------------------------------------------------ live frames (from the camera loop)
const NEED = [0, 7, 8, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
function onFrame(fr) {
  if (!L.rig || L.demo || L.studio || ($('#mode-lab').hidden && $('#mode-diag').hidden && !L.mirrorAR)) return;
  const res = fr.pose; if (!res?.worldLandmarks?.length) return;
  const w = L.smoother.apply(res.worldLandmarks[0], fr.t);
  const vis = res.landmarks[0].map((p) => p.visibility ?? 1);
  // axis conventions from the data itself (frozen at calibration)
  if (!L.calibrated) {
    const dx = w[11].x - w[12].x; if (Math.abs(dx) > 0.05) L.sx = Math.sign(dx);
    const dz = (w[7].z + w[8].z) / 2 - w[0].z; if (vis[0] > 0.6 && Math.abs(dz) > 0.02) L.sz = Math.sign(dz);
  }
  if (!L.sx || !L.sz) return;
  const A = L.atlas.anchors, W = {};
  for (const i of NEED) W[i] = new THREE.Vector3(A.leftX * L.sx * w[i].x, -w[i].y, A.anterior * L.sz * -w[i].z);
  L.W = W; L.vis = vis; L.src = 'camera';
  footLift(res.landmarks[0], w, res.landmarks[0].map((p) => p.pvis ?? p.visibility ?? 1), fr.aspect || 16 / 9, fr.t);
  step(fr.t);
  autoCalibrate(fr.t);
}

function step(t) {
  const F = segmentFrames(L.W, L.rig);
  // keep the previous rotation for segments whose landmarks are not reliably seen
  const seen = (ids) => !L.vis || ids.every((i) => (L.vis[i] ?? 1) > 0.5);
  const req = { pelvis: [23, 24], thorax: [11, 12, 23, 24], head: [0, 7, 8], l_humerus: [11, 13], r_humerus: [12, 14], l_forearm: [13, 15], r_forearm: [14, 16],
    l_hand: [15, 17, 19], r_hand: [16, 18, 20], l_femur: [23, 25], r_femur: [24, 26], l_leg: [25, 27], r_leg: [26, 28], l_foot: [29, 31], r_foot: [30, 32] };
  const Rn = solve(L.rig, F, L.Fref);
  for (const k of Object.keys(Rn)) if (seen(req[k] || [])) L.R[k] = Rn[k];
  bodyInView(seen, t);
  if (seen(req.thorax)) {
    if (L.Fref === L.FrefRest) refineTrunk(L.rig, L.R, L.W);          // pelvis tilt + thorax solved together
    else tiltPelvis(L.R, L.R.pelvis.clone(), L.atlas.anchors);     // calibrated: apply the same lumbopelvic rhythm
  }
  L.M = ground(poseMatrices(L.rig, L.R)); applyMatrices();
  L.meas = measure(L.W, L.R);
  L.lastFrameT = t;
  feedRecognizer(t);
  stepBiomech(t);
  energyTick(t);
}

// ------------------------------------------------------------------ jumps: vertical travel from the image
// World landmarks are centred on the hips, so a jump does not appear in them.
// Each foot's lowest image point is compared with its floor level (the lowest
// it has been while still), and converted to metres with the torso length
// (world metres / image length, both measured in this frame).
function footLift(im, w, vis, aspect, t) {
  if (!im || L.simulating) return;
  const seenF = (k) => [27, 29, 31].map((i) => i + (k === 'r' ? 1 : 0)).every((i) => (vis[i] ?? 0) > 0.5);
  const mid = (a, b, f) => [(f(a).x + f(b).x) / 2, (f(a).y + f(b).y) / 2, (f(a).z ?? 0) / 2 + (f(b).z ?? 0) / 2];
  const I = (i) => ({ x: im[i].x * aspect, y: im[i].y }), Wd = (i) => w[i];
  const si = mid(11, 12, I), hi = mid(23, 24, I), sw = mid(11, 12, Wd), hw = mid(23, 24, Wd);
  const torsoImg = Math.hypot(si[0] - hi[0], si[1] - hi[1]), torsoW = Math.hypot(sw[0] - hw[0], sw[1] - hw[1], sw[2] - hw[2]);
  if (torsoImg < 0.05 || !((vis[11] ?? 0) > 0.5 && (vis[23] ?? 0) > 0.5)) { L.jumpLift = null; return; }
  const sc = torsoW / torsoImg; L.jumpScale = L.jumpScale ? L.jumpScale + 0.1 * (sc - L.jumpScale) : sc;
  const F = (L.floor ||= {}), out = {};
  for (const k of ['l', 'r']) {
    if (!seenF(k)) { L.jumpLift = null; return; }
    const y = Math.max(...[27, 29, 31].map((i) => im[i + (k === 'r' ? 1 : 0)].y)); // lowest point of the foot in the image
    const f = (F[k] ||= { base: y, lastY: y, stillT: t });
    if (Math.abs(y - f.lastY) > 0.004) f.stillT = t; f.lastY = y;
    if (y > f.base) f.base = y;                                    // a lower foot is the new floor at once
    else if (t - f.stillT > 0.6) f.base += 0.05 * (y - f.base);   // standing still higher up (camera moved): follow slowly
    out[k] = Math.max(0, (f.base - y) * L.jumpScale * 100);       // cm
  }
  L.jumpLift = out;
}

// ------------------------------------------------------------------ body in view: full, seated, upper body
// Segments the camera cannot see are not measured. In "seated" they are drawn
// in a sitting pose (hips and knees at 90 deg), otherwise they keep the last
// pose; either way they are drawn faded, and no angle is reported for them.
const LEG_SEGS = ['l_femur', 'r_femur', 'l_leg', 'r_leg', 'l_foot', 'r_foot'];
function bodyInView(seen, t) {
  const legsSeen = seen([25, 26, 27, 28]);
  if (legsSeen) L.legsSeenT = t;
  const mode = L.viewMode || 'auto';
  const legsGone = !legsSeen && t - (L.legsSeenT ?? -9) > 0.8;
  const seated = mode === 'seated' || (mode === 'auto' && legsGone && L.autoSeated);
  const unseen = new Set();
  if (seated && (!legsSeen || mode === 'seated')) {
    const Rs = commanded({ lHipFlex: 90, rHipFlex: 90, lKnee: 90, rKnee: 90 });
    for (const k of LEG_SEGS) { if (mode === 'seated' && legsSeen) continue; L.R[k] = L.R.pelvis.clone().multiply(Rs[k]); unseen.add(k); }
  } else if (legsGone || mode === 'upper') LEG_SEGS.forEach((k) => unseen.add(k));
  for (const [k, ids] of Object.entries({ l_humerus: [11, 13], r_humerus: [12, 14], l_forearm: [13, 15], r_forearm: [14, 16], head: [0, 7, 8] })) if (!seen(ids)) unseen.add(k);
  const key = [...unseen].sort().join();
  if (key !== L.unseenKey) { L.unseenKey = key; L.unseen = unseen; applyLook(); }
  const el = document.getElementById('lab-viewstate');
  if (el) el.textContent = unseen.size ? `Not measured (faded): ${[...unseen].map((k) => k.replace('_', ' ')).join(', ')}` : 'Whole body measured';
}

function feedRecognizer(t) {
  if (!L.rec) return;
  const A = L.atlas.anchors;
  L.W.__cam = new THREE.Vector3(0, 0, A.anterior * (L.src === 'camera' ? L.sz : 1));
  L.position = bodyPosition(L.W, L.meas, L.vis);
  const chn = channels(L.meas);
  L.rec.push(t, chn, L.position);
  window.__exTrack?.(t, chn); // exercise library live counter
  L.rec.tick(t);
}

// ------------------------------------------------------------------ measurement
function measure(W, R) {
  const A = L.atlas.anchors, out = {};
  const ok = (...ids) => !L.vis || ids.every((i) => (L.vis[i] ?? 0) > 0.5); // only report what the camera actually sees
  const sF = A.anterior, sRot = A.anterior * A.leftX, sSide = -A.leftX;
  const rel = (a, b) => { if (!R[a] || !R[b]) return null; const e = relEuler(R[a], R[b]); return { flex: e.flex * sF, rotL: e.rot * sRot, sideL: e.side * sSide }; };
  out.trunk = ok(11, 12, 23, 24) ? rel('pelvis', 'thorax') : null;
  if (R.thorax && ok(11, 12, 23, 24)) { const e = relEuler(new THREE.Quaternion(), R.thorax); out.trunkIncl = e.flex * sF; } // thorax vs vertical (includes the modelled pelvic tilt)
  out.neck = ok(0, 7, 8, 11, 12, 23, 24) ? rel('thorax', 'head') : null;
  if (R.pelvis && ok(23, 24)) { const e = relEuler(new THREE.Quaternion(), R.pelvis); out.pelvis = { obliq: e.side * sSide, rotL: e.rot * sRot }; }
  const up = W[11] && W[23] && ok(11, 12, 23, 24) ? W[11].clone().add(W[12]).sub(W[23]).sub(W[24]).normalize() : new THREE.Vector3(0, 1, 0);
  const latv = W[11].clone().sub(W[12]).normalize(); const fwd = latv.clone().cross(up).normalize();
  for (const [k, sh, el, wr, hp, kn, an, to] of [['l', 11, 13, 15, 23, 25, 27, 31], ['r', 12, 14, 16, 24, 26, 28, 32]]) {
    out[`${k}_elbow`] = ok(sh, el, wr) ? 180 - angleAt(W[sh], W[el], W[wr]) : null;
    out[`${k}_knee`] = ok(hp, kn, an) ? 180 - angleAt(W[hp], W[kn], W[an]) : null;
    const arm = W[el].clone().sub(W[sh]).normalize();
    const elev = THREE.MathUtils.radToDeg(arm.angleTo(up.clone().negate()));
    if (ok(sh, el, 11, 12, 23, 24)) {
      // plane is decided below 110 deg and kept while the arm is overhead, where forward and sideways cannot be told apart
      L.planeLatch = L.planeLatch || {};
      if (elev < 110 || !L.planeLatch[k]) L.planeLatch[k] = Math.abs(arm.dot(fwd)) > Math.abs(arm.dot(latv)) ? 'flexion' : 'abduction';
      out[`${k}_sh`] = { elev, plane: L.planeLatch[k] };
    }
    const hip = ok(hp, kn, 23, 24) ? rel('pelvis', `${k}_femur`) : null; if (hip) { const thigh = W[kn].clone().sub(W[hp]).normalize(); const latOutP = new THREE.Vector3(L.atlas.anchors.leftX * (k === 'l' ? 1 : -1), 0, 0).applyQuaternion(R.pelvis);
      out[`${k}_hip`] = { flex: -hip.flex, abd: Math.max(0, THREE.MathUtils.radToDeg(Math.asin(Math.max(-1, Math.min(1, thigh.dot(latOutP)))))) }; } // limb flexion turns about the opposite lateral axis to trunk flexion
    if (ok(hp, kn, an, 23, 24)) { // knee valgus: knee displacement toward the midline from the hip-ankle line, in cm
      const line = W[an].clone().sub(W[hp]); const tt = Math.max(0, Math.min(1, W[kn].clone().sub(W[hp]).dot(line) / line.lengthSq()));
      const off = W[kn].clone().sub(W[hp].clone().addScaledVector(line, tt));
      const latOut = W[23].clone().sub(W[24]).normalize().multiplyScalar(k === 'l' ? 1 : -1);
      out[`${k}_valgus`] = -off.dot(latOut) * 100;
    }
    if (ok(an)) out[`${k}_footY`] = W[an].y * 100;
    if (L.jumpLift) out[`${k}_lift`] = L.jumpLift[k];
    if (ok(29, 30, 31, 32)) out[`${k}_heel`] = (W[k === 'l' ? 29 : 30].y - W[k === 'l' ? 31 : 32].y) * 100; // heel height above the toe, cm
    const ank = ok(kn, an, to) ? rel(`${k}_leg`, `${k}_foot`) : null; if (ank) out[`${k}_ankle`] = -ank.flex; // foot rotating up toward the shin
  }
  return out;
}

function twinAngles() {
  const P = (k) => posedPoint(L.rig, L.M, 'J', k);
  const o = {};
  for (const k of ['l', 'r']) {
    o[`${k}_elbow`] = 180 - angleAt(P(`${k}_shoulder`), P(`${k}_elbow`), P(`${k}_wrist`));
    o[`${k}_knee`] = 180 - angleAt(P(`${k}_hip`), P(`${k}_knee`), P(`${k}_ankle`));
  }
  return o;
}

// ------------------------------------------------------------------ tick: render, labels, panels
let uiT = 0;
function tick(now) {
  if ($('#mode-lab').hidden) return;
  if (L.studio) L.studio.step(now / 1000); else if (L.exercise) exerciseStep(now / 1000); else if (L.demo) demoStep(now / 1000);
  if ($('#lab-autorot').checked) { const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.004); L.camera.position.sub(L.controls.target).applyQuaternion(q).add(L.controls.target); }
  L.pc?.tick(); L.controls.update();
  for (const f of FRAME_HOOKS) { try { f(now / 1000); } catch (e) { console.error('lab frame hook', e); } }
  L.renderer.render(L.scene, L.camera);
  drawLabels();
  if (now - uiT > 150) { uiT = now; updatePanels(now / 1000); }
}

const LM_NAMES = {
  hip: 'Hip centre', knee: 'Knee centre', ankle: 'Ankle centre', shoulder: 'Shoulder centre', elbow: 'Elbow centre', wrist: 'Wrist centre',
  ASIS: 'ASIS', PSIS: 'PSIS', greater_trochanter: 'Greater trochanter', lat_femoral_epicondyle: 'Lat. femoral epicondyle', med_femoral_epicondyle: 'Med. femoral epicondyle',
  medial_malleolus: 'Medial malleolus', lateral_malleolus: 'Lateral malleolus', tibial_tuberosity: 'Tibial tuberosity', patella: 'Patella', heel: 'Calcaneus',
  acromion: 'Acromion', olecranon: 'Olecranon', radial_styloid: 'Radial styloid', ulnar_styloid: 'Ulnar styloid', lat_humeral_epicondyle: 'Lat. humeral epicondyle',
  med_humeral_epicondyle: 'Med. humeral epicondyle', sternoclavicular: 'Sternoclavicular joint', iliac_crest: 'Iliac crest', inferior_angle: 'Scapula inf. angle',
  ischial_tuberosity: 'Ischial tuberosity', mt1_head: '1st MT head', mt5_head: '5th MT head', C7_spinous: 'C7 spinous process', S1_top: 'Sacral base', vertex: 'Vertex',
};
const LABEL_KEYS = ['l_hip', 'r_hip', 'l_knee', 'r_knee', 'l_ankle', 'r_ankle', 'l_shoulder', 'r_shoulder', 'l_elbow', 'r_elbow', 'l_wrist', 'r_wrist',
  'l_ASIS', 'r_ASIS', 'l_greater_trochanter', 'l_acromion', 'r_acromion', 'C7_spinous', 'l_medial_malleolus', 'r_lateral_malleolus', 'l_tibial_tuberosity', 'l_olecranon', 'v_L3', 'v_T8', 'v_C4'];
function prettyKey(k) {
  if (k.startsWith('v_')) return `${k.slice(2)} body`;
  const side = k.startsWith('l_') ? 'L ' : k.startsWith('r_') ? 'R ' : ''; const base = side ? k.slice(2) : k;
  return side + (LM_NAMES[base] || base.replace(/_/g, ' '));
}
function drawLabels() {
  const host = $('#lab-labels');
  if (!L.showLabels) { host.innerHTML = ''; return; }
  const r = host.getBoundingClientRect(); const v = new THREE.Vector3();
  if (!L.labelEls.length) { host.innerHTML = LABEL_KEYS.map((k) => `<span class="lab-lbl" data-k="${k}">${esc(prettyKey(k))}</span>`).join(''); L.labelEls = [...host.children]; }
  const items = [];
  for (const el of L.labelEls) {
    const k = el.dataset.k; const store = L.rig.J[k] ? 'J' : 'LM'; const o = L.rig[store][k];
    if (!o || (store === 'J' && !L.showJ) || (store === 'LM' && !L.showLM)) { el.style.display = 'none'; continue; }
    v.copy(o.p).applyMatrix4(L.M.get(o.seg) || new THREE.Matrix4()).project(L.camera);
    if (v.z > 1) { el.style.display = 'none'; continue; }
    el.style.display = ''; items.push({ el, x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height });
  }
  // labels sit beside their point (left half -> left, right half -> right) and are pushed apart vertically
  const cx = r.width / 2, placed = [];
  for (const it of items.sort((a, b) => a.y - b.y)) {
    const w = it.el.offsetWidth || 90, h = 17, right = it.x >= cx;
    const lx = right ? it.x + 10 : it.x - 10 - w; let ly = it.y - h / 2;
    for (let n = 0; n < 40 && placed.some((q) => lx < q[0] + q[2] && lx + w > q[0] && ly < q[1] + q[3] && ly + h > q[1]); n++) ly += h + 2;
    placed.push([lx, ly, w, h]);
    it.el.style.transform = `translate(${lx}px, ${ly}px)`;
  }
}

function updatePanels(t) {
  renderBiomech();
  // sync table: tracked vs twin
  const live = L.src !== 'none' && t - L.lastFrameT < 1.0;
  $('#lab-src').textContent = L.demo ? 'Demo motion (synthetic)' : live ? `Camera${L.calibrated ? ' · calibrated' : ' · not calibrated (using reference stance)'}` : 'No live input';
  if (L.meas && L.M) {
    const tw = twinAngles(); const m = L.meas;
    const rows = [['L elbow flexion', m.l_elbow, tw.l_elbow], ['R elbow flexion', m.r_elbow, tw.r_elbow], ['L knee flexion', m.l_knee, tw.l_knee], ['R knee flexion', m.r_knee, tw.r_knee],
      ['L shoulder elevation', m.l_sh?.elev, null], ['R shoulder elevation', m.r_sh?.elev, null], ['L hip flexion', m.l_hip?.flex, null], ['R hip flexion', m.r_hip?.flex, null],
      ['Trunk incline (thorax vs vertical)', m.trunkIncl, null], ['Lumbar/spinal flexion (modelled)', m.trunk?.flex, null], ['Trunk side bend (L+)', m.trunk?.sideL, null], ['Trunk rotation (L+)', m.trunk?.rotL, null],
      ['Neck flexion', m.neck?.flex, null], ['Neck rotation (L+)', m.neck?.rotL, null], ['Pelvic obliquity (L up +)', m.pelvis?.obliq, null]];
    $('#lab-sync tbody').innerHTML = rows.map(([n, a, b]) => `<tr><td>${n}</td><td class="mono">${fmt(a)}</td><td class="mono">${b == null ? '<span class="muted">—</span>' : fmt(b)}</td><td class="mono">${a != null && b != null ? fmt(b - a) : ''}</td></tr>`).join('');
  }
  if (L.test) runTest(t);
}
const fmt = (x) => (x == null || !Number.isFinite(x) ? '—' : `${x.toFixed(1)}°`);

// ------------------------------------------------------------------ calibration, demo, self-test
function calibrate() {
  if (!L.W || L.src !== 'camera') { $('#lab-calib-msg').textContent = 'Start the camera and step fully into view first.'; return; }
  let n = 3; const msg = $('#lab-calib-msg');
  msg.textContent = 'Stand tall facing the camera, arms by your sides, palms forward. 3…';
  const iv = setInterval(() => {
    n--; if (n > 0) { msg.textContent = `${n}…`; return; }
    clearInterval(iv);
    L.Fref = segmentFrames(L.W, L.rig); L.calibrated = true; L.R = {};
    L.calib = { W: Object.fromEntries(Object.entries(L.W).map(([k, v]) => [k, v.clone()])) };
    msg.textContent = 'Calibrated: this stance is now the twin\'s reference (anatomical position).';
  }, 1000);
}

// Commanded motion for the demo / self-test: world rotations per segment, built
// from the rig's own anatomical axes.
function commanded(p) {
  const A = L.atlas.anchors, up = new THREE.Vector3(0, 1, 0), ant = new THREE.Vector3(0, 0, A.anterior), lat = new THREE.Vector3(A.leftX, 0, 0), down = up.clone().negate();
  const rot = (axis, deg) => new THREE.Quaternion().setFromAxisAngle(axis.clone().normalize(), THREE.MathUtils.degToRad(deg));
  const flexAxis = down.clone().cross(ant); // takes a downward limb toward anterior
  const R = {};
  const base = rot(up, p.pelvisRot || 0).multiply(rot(ant, p.pelvisObl || 0));
  const trunkAxis = up.clone().cross(ant); // takes 'up' toward anterior: forward flexion
  R.thorax = base.clone().multiply(rot(up, p.trunkRot || 0)).multiply(rot(trunkAxis, p.trunkFlex || 0)).multiply(rot(ant, p.trunkSide || 0));
  R.pelvis = base.clone().multiply(rot(trunkAxis, LUMBOPELVIC_ALPHA * (p.trunkFlex || 0))); // same lumbopelvic rhythm as the solver
  R.head = R.thorax.clone().multiply(rot(up, p.neckRot || 0)).multiply(rot(ant, p.neckSide || 0)).multiply(rot(trunkAxis, p.neckFlex || 0));
  for (const k of ['l', 'r']) {
    const s = k === 'l' ? 1 : -1, latS = lat.clone().multiplyScalar(s);
    const abdAxis = down.clone().cross(latS);
    const hum = R.thorax.clone().multiply(rot(abdAxis, p[`${k}ShAbd`] || 0)).multiply(rot(flexAxis, p[`${k}ShFlex`] || 0));
    R[`${k}_humerus`] = hum;
    R[`${k}_forearm`] = hum.clone().multiply(rot(flexAxis, p[`${k}Elbow`] || 0));
    R[`${k}_hand`] = R[`${k}_forearm`].clone();
    const fem = base.clone().multiply(rot(flexAxis, p[`${k}HipFlex`] || 0)).multiply(rot(abdAxis, p[`${k}HipAbd`] || 0)); // thigh angle vs vertical
    R[`${k}_femur`] = fem;
    R[`${k}_leg`] = fem.clone().multiply(rot(flexAxis, -(p[`${k}Knee`] || 0)));
    R[`${k}_foot`] = R[`${k}_leg`].clone().multiply(rot(flexAxis, p[`${k}Ankle`] || 0)); // foot (anterior) toward up: dorsiflexion
  }
  return R;
}

function landmarksFrom(R) {
  const M = poseMatrices(L.rig, R); const rest = restLandmarks(L.rig); const W = {};
  for (const [i, p] of Object.entries(rest)) W[i] = p.clone().applyMatrix4(M.get(LANDMARK_SEG[i] || 'head') || new THREE.Matrix4());
  return { W, M };
}

const SCRIPT = [
  ['Left shoulder abduction', { lShAbd: 160 }], ['Right shoulder flexion', { rShFlex: 150 }], ['Elbow flexion', { lElbow: 130, rElbow: 130 }],
  ['Trunk flexion', { trunkFlex: 60 }], ['Trunk side bend', { trunkSide: 25 }], ['Trunk rotation', { trunkRot: 30 }],
  ['Neck rotation', { neckRot: 60 }], ['Neck flexion', { neckFlex: 40 }], ['Squat', { lHipFlex: 80, rHipFlex: 80, lKnee: 110, rKnee: 110, lAnkle: 30, rAnkle: 30, trunkFlex: 40 }], // thigh 80 deg from vertical; ankle = knee - thigh keeps the feet flat
  ['Single-leg stance + knee lift', { lHipFlex: 90, lKnee: 90, pelvisObl: 5 }], ['Hip abduction', { rHipAbd: 35 }], ['Ankle dorsiflexion', { lAnkle: 20, rAnkle: 20, lKnee: 30, rKnee: 30, lHipFlex: 20, rHipFlex: 20 }],
];
function demoStep(t) {
  const seg = 3.2, i = Math.floor(t / seg) % SCRIPT.length, ph = (t % seg) / seg, k = Math.sin(Math.PI * ph) ** 2;
  const [name, peak] = SCRIPT[i]; const p = {}; for (const [a, b] of Object.entries(peak)) p[a] = b * k;
  const { W } = landmarksFrom(commanded(p));
  L.W = W; L.vis = null; L.src = 'demo'; L.Fref = L.FrefRest;
  step(t);
  $('#lab-demo-name').textContent = `${name} · ${Math.round(k * 100)}%`;
}

function selfTest() {
  // Closed loop: commanded pose -> landmarks -> solver -> twin. Compares twin landmarks and joint angles with the commanded ones.
  const rows = []; let worstMm = 0, worstDeg = 0;
  for (const [name, peak] of SCRIPT) {
    const { W, M: Mcmd } = landmarksFrom(commanded(peak));
    const R = refineTrunk(L.rig, solve(L.rig, segmentFrames(W, L.rig), L.FrefRest), W), M = poseMatrices(L.rig, R);
    let mm = 0; for (const [i, p] of Object.entries(restLandmarks(L.rig))) { const seg = LANDMARK_SEG[i] || 'head'; mm = Math.max(mm, p.clone().applyMatrix4(M.get(seg)).distanceTo(W[i]) * 1000); }
    const ang = (MM) => { const P = (k) => L.rig.J[k].p.clone().applyMatrix4(MM.get(L.rig.J[k].seg)); return ['l', 'r'].flatMap((s) => [180 - angleAt(P(`${s}_shoulder`), P(`${s}_elbow`), P(`${s}_wrist`)), 180 - angleAt(P(`${s}_hip`), P(`${s}_knee`), P(`${s}_ankle`))]); };
    const a = ang(Mcmd), b = ang(M); const deg = Math.max(...a.map((x, j) => Math.abs(x - b[j])));
    worstMm = Math.max(worstMm, mm); worstDeg = Math.max(worstDeg, deg);
    rows.push(`<tr><td>${name}</td><td class="mono">${mm.toFixed(2)} mm</td><td class="mono">${deg.toFixed(2)}°</td></tr>`);
  }
  $('#lab-selftest').innerHTML = `<p class="fine">Commanded pose → landmarks → solver → twin, for each scripted movement. Worst landmark error <b class="mono">${worstMm.toFixed(2)} mm</b>, worst elbow/knee angle error <b class="mono">${worstDeg.toFixed(2)}°</b>. This checks the solver's maths only, not camera accuracy.</p>
    <table><thead><tr><th>Movement</th><th>Landmark</th><th>Angle</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

// ------------------------------------------------------------------ movement tests
function startTest(id) {
  const T = TESTS.find((x) => x.id === id); if (!T) return;
  L.test = { T, t0: null, pos: -Infinity, neg: Infinity, extra: {} };
  highlight(T.segs);
  const n = T.norm ? NORMS[T.norm] : null;
  $('#lab-test-active').innerHTML = `<div class="test-h"><b>${esc(T.label)}</b> <button class="ghost-btn" id="lab-test-stop">Stop &amp; save</button></div>
    <p>${esc(T.how)}</p><div class="test-live"><span>Now <b class="mono" id="lab-test-now">—</b></span><span>Peak <b class="mono" id="lab-test-peak">—</b></span><span class="muted" id="lab-test-time"></span></div>
    ${n ? `<p class="fine"><i>Reference:</i> “${esc(n.quote)}” <span class="muted">(${esc(n.src)}, CC BY-NC-ND 4.0)</span>${n.note ? `<br>${esc(n.note)}` : ''}</p>` : '<p class="fine">No cited normal value is loaded for this movement; the measured value is shown on its own.</p>'}
    <p class="fine">Measured by one camera; not validated against a goniometer (gate V1).</p>`;
  $('#lab-test-stop').onclick = stopTest;
}
function runTest(t) {
  const S = L.test; if (!L.meas) return;
  if (S.t0 == null) S.t0 = t;
  const v = S.T.m(L.meas); const now = $('#lab-test-now');
  if (v != null && Number.isFinite(v)) { S.pos = Math.max(S.pos, v); S.neg = Math.min(S.neg, v); now.textContent = fmt(v); }
  if (S.T.extra) for (const [k, x] of Object.entries(S.T.extra(L.meas))) if (x != null) S.extra[k] = Math.max(S.extra[k] ?? -Infinity, x);
  $('#lab-test-peak').textContent = S.T.two ? `${fmt(S.pos)} ${S.T.two[0]} / ${fmt(-S.neg)} ${S.T.two[1]}` : fmt(S.pos);
  $('#lab-test-time').textContent = `${(t - S.t0).toFixed(0)} s`;
}
function stopTest() {
  const S = L.test; if (!S) return;
  const res = { test: S.T.label, group: S.T.group, when: new Date().toLocaleTimeString(), src: L.src === 'demo' ? 'demo' : L.calibrated ? 'camera (calibrated)' : 'camera',
    a: Number.isFinite(S.pos) ? S.pos : null, b: S.T.two && Number.isFinite(S.neg) ? -S.neg : null, two: S.T.two, extra: S.extra };
  L.results.push(res); L.test = null; highlight([]);
  $('#lab-test-active').innerHTML = '<p class="muted">Pick a movement.</p>';
  renderResults();
}
function renderResults() {
  $('#lab-results tbody').innerHTML = L.results.map((r) => `<tr><td>${esc(r.test)}<br><small>${esc(r.src)} · ${r.when}</small></td>
    <td class="mono">${r.two ? `${fmt(r.a)} ${r.two[0]}<br>${fmt(r.b)} ${r.two[1]}` : fmt(r.a)}${Object.keys(r.extra).length ? `<br><small>${Object.entries(r.extra).map(([k, v]) => `${k} ${fmt(v)}`).join(' · ')}</small>` : ''}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">No results yet.</td></tr>';
}
function exportCsv() {
  const rows = [['test', 'group', 'time', 'source', 'peak_a_deg', 'label_a', 'peak_b_deg', 'label_b', 'extra'],
    ...L.results.map((r) => [r.test, r.group, r.when, r.src, r.a?.toFixed(1) ?? '', r.two?.[0] ?? 'peak', r.b?.toFixed(1) ?? '', r.two?.[1] ?? '', Object.entries(r.extra).map(([k, v]) => `${k}=${v.toFixed(1)}`).join(' ')])];
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' }));
  a.download = `motion_lab_tests_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`; a.click();
}

let hiMat = null;
function highlight(segs) { L.hiSegs = segs; applyLook(); }

// ------------------------------------------------------------------ UI
function setupUI() {
  $('#lab-depth').innerHTML = DEPTH_CLASSES.map((d) => `<option value="${d.key}" ${d.key === L.depth ? 'selected' : ''}>${d.key}. ${d.label}</option>`).join('');
  $('#lab-depth').onchange = (e) => { L.depth = +e.target.value; applyDepth(); };
  $('#lab-show-j').onchange = (e) => { L.showJ = e.target.checked; applyDepth(); };
  $('#lab-show-lm').onchange = (e) => { L.showLM = e.target.checked; applyDepth(); };
  $('#lab-show-labels').onchange = (e) => { L.showLabels = e.target.checked; };
  $('#lab-ghost').onchange = (e) => { L.ghost.visible = e.target.checked; };
  $('#lab-cam').onclick = async () => { L.studio?.stop(); await startMirror(); extern.pose = true; const v = $('#lab-video'); v.srcObject = $('#cam').srcObject; v.play().catch(() => {}); L.demo = null; $('#lab-demo').textContent = 'Demo motion'; $('#lab-demo-name').textContent = ''; };
  $('#lab-calib').onclick = calibrate;
  $('#lab-demo').onclick = () => { L.studio?.stop(); L.demo = L.demo ? null : true; $('#lab-demo').textContent = L.demo ? 'Stop demo' : 'Demo motion'; if (!L.demo) { $('#lab-demo-name').textContent = ''; } };
  $('#lab-selftest-btn').onclick = selfTest;
  setupViewAndCameras();
  setupExerciseLibrary();
  setupDrills();
  setupJointMap();
  setupBiomech();
  $('#lab-csv').onclick = exportCsv;
  const groups = [...new Set(TESTS.map((t) => t.group))];
  $('#lab-tests').innerHTML = groups.map((g) => `<div class="tgroup"><span class="lbl">${g}</span>${TESTS.filter((t) => t.group === g).map((t) => `<button class="ghost-btn" data-test="${t.id}">${esc(t.label.replace(/^(Left|Right) /, ''))}</button>`).join('')}</div>`).join('');
  $('#lab-tests').querySelectorAll('[data-test]').forEach((b) => b.addEventListener('click', () => { if (L.test) stopTest(); startTest(b.dataset.test); }));
  renderResults();
  const A = L.atlas.anchors;
  const views = { Front: [0, 0, A.anterior], Back: [0, 0, -A.anterior], 'Subject left': [A.leftX, 0, 0], 'Subject right': [-A.leftX, 0, 0], Top: [0, 1, 0.001 * A.anterior] };
  $('#lab-views').innerHTML = Object.keys(views).map((k) => `<button class="ghost-btn" data-v="${k}">${k}</button>`).join('');
  $('#lab-views').querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => {
    const d = new THREE.Vector3(...views[b.dataset.v]).normalize(), dist = L.camera.position.distanceTo(L.controls.target);
    L.camera.position.copy(L.controls.target).addScaledVector(d, dist); L.controls.update();
  }));
  // hover: name of bone / marker
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), tip = $('#lab-pick'), cv = L.renderer.domElement;
  let last = 0;
  let downXY = null;
  cv.addEventListener('pointerdown', (e) => { downXY = [e.clientX, e.clientY]; });
  cv.addEventListener('pointerup', (e) => {
    if (!downXY || Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) > 4 || $('#jm-mode').value !== 'pick') return;
    const r = cv.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, L.camera);
    const objs = []; L.groups.forEach((g) => g.children.forEach((mm) => { if (mm.visible && mm.userData.part?.layer === 'muscles') objs.push(mm); }));
    const hit = ray.intersectObjects(objs, false)[0]; if (hit) togglePick(hit.object.userData.part.name);
  });
  cv.addEventListener('pointermove', (e) => {
    const n = performance.now(); if (n - last < 60) return; last = n;
    const r = cv.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, L.camera);
    const objs = []; L.groups.forEach((g) => g.children.forEach((m) => { if (m.visible) objs.push(m); }));
    const h = ray.intersectObjects(objs, false)[0];
    if (L.hover && L.hover !== h?.object) { L.hover.material = L.hover.userData.prevMat; L.hover = null; }
    if (!h) { tip.hidden = true; return; }
    const o = h.object;
    if (o.userData.part && L.hover !== o) { o.userData.prevMat = o.material; const hm = o.material.clone(); hm.emissive = new THREE.Color(0x3fa9ff); hm.emissiveIntensity = 0.6; o.material = hm; L.hover = o; }
    tip.hidden = false; tip.style.left = `${e.clientX - r.left}px`; tip.style.top = `${e.clientY - r.top}px`;
    if (o.userData.marker) { const s = L.rig[o.userData.marker][o.userData.key]; tip.innerHTML = `<b>${esc(prettyKey(o.userData.key))}</b><br><small>${esc(s.how)}</small>`; }
    else { const p = o.userData.part; tip.innerHTML = `<b>${esc(p.name)}</b><br><small>${esc(KIND_LABEL[tissueKind(p)] || p.layer)} · segment ${esc(o.userData.seg)}${p._nearest ? ' (carried by nearest segment)' : ''}</small>`; }
  });
}

function renderAudit() {
  const J = Object.entries(L.rig.J), LM = Object.entries(L.rig.LM);
  const segParts = [...L.rig.segs.values()].map((s) => `${s.key} ${s.parts.filter((p) => p.layer === 'skeleton').length}`).join(' · ');
  const total = [...L.rig.segs.values()].reduce((n, s) => n + s.parts.length, 0);
  $('#lab-audit').innerHTML = `<p class="fine">All ${total.toLocaleString()} structures are carried by a segment, so none is dropped. Skeleton pieces are assigned by name; other tissue (muscles, vessels, organs) goes to the nearest segment, which is approximate where a muscle crosses a joint.</p>
    <details><summary>Joint centres (${J.length})</summary><ul class="audit">${J.map(([k, o]) => `<li><b>${esc(prettyKey(k))}</b> — ${esc(o.how)}</li>`).join('')}</ul></details>
    <details><summary>Bony landmarks (${LM.length})</summary><ul class="audit">${LM.map(([k, o]) => `<li><b>${esc(prettyKey(k))}</b> — ${esc(o.how)}</li>`).join('')}</ul></details>
    <details><summary>Skeleton pieces per segment</summary><p class="fine mono">${esc(segParts)}</p></details>`;
}

// ------------------------------------------------------------------ automatic drill detection
function setupDrills() {
  L.rec = new DrillRecognizer(onRep);
  $('#drill-reset').onclick = () => { L.rec.reset(); $('#drill-last').innerHTML = '<p class="muted">Move deliberately: each repetition is detected and named.</p>'; renderSession(); };
  $('#drill-csv').onclick = drillCsv;
  $('#drill-test').onclick = recognitionTest;
  $('#drill-list').innerHTML = DRILLS.map((d) => `<li><b>${esc(d.name)}</b><small>${d.checks.map((c) => esc(c.label)).join(' · ')}</small></li>`).join('');
  renderSession();
}

function drillJoint(id) {
  if (!id) return null;
  const k = id[0] === 'l' || id[0] === 'r' ? id[0] : null;
  if (/sl_squat|lat_lunge/.test(id)) return `${k}_knee`;
  if (/squat|lunge/.test(id)) return 'l_knee';
  if (/calf/.test(id)) return 'l_ankle';
  if (/march|hip_abd/.test(id)) return `${k}_hip`;
  if (/curl_leg/.test(id)) return `${k}_knee`;
  if (/bicep/.test(id)) return `${k}_elbow`;
  if (id === 'both_curl') return 'l_elbow';
  if (/sh_|both_raise|jumping/.test(id)) return `${k || 'l'}_shoulder`;
  if (/trunk/.test(id)) return 'sp_v_L3_v_L2';
  if (/neck/.test(id)) return 'sp_v_C4_v_C3';
  return null;
}

function onRep(rep) {
  if (L.simulating) return;
  const checks = rep.checks.map((c) => `<li class="${c.pass ? 'ok' : 'no'}">${c.pass ? '✓' : '✗'} ${esc(c.label)} <span class="mono">${c.val == null ? '—' : `${(+c.val).toFixed(c.unit === 's' ? 1 : 0)}${c.unit}`}</span></li>`).join('');
  $('#drill-last').innerHTML = rep.id ? `
    <div class="rep-h"><b>${esc(rep.name)}</b> <span class="chip mono">form ${rep.form}%</span></div>
    <div class="fine">Recognition confidence ${(rep.conf * 100).toFixed(0)}% · rep ${rep.dur.toFixed(1)} s · ${esc(rep.position || 'position unknown')}</div>
    <ul class="checks">${checks}</ul>` : `<div class="rep-h"><b>Unclassified movement</b></div><div class="fine">Best match ${(rep.conf * 100).toFixed(0)}% (below the 70% needed to name a drill). Joints that moved: ${esc((rep.chans || []).join(', '))}.</div>`;
  const fails = rep.checks.filter((c) => !c.pass);
  L.lastCue = rep.id ? { t: performance.now() / 1000, text: fails.length ? fails.map((c) => c.cue || c.label).join(' · ') : `Good ${rep.name.toLowerCase()} rep`, ok: !fails.length } : null;
  $('#drill-cue').innerHTML = L.lastCue ? `<span class="q ${L.lastCue.ok ? 'good' : 'poor'}">${L.lastCue.ok ? '✓' : 'Correction'}</span> ${esc(L.lastCue.text)}` : '';
  renderSession();
  if ($('#jm-follow').checked && rep.id) { const j = drillJoint(rep.id); if (j) { $('#jm-select').value = j; showJoint(j); } }
}

function renderSession() {
  const rows = [...(L.rec?.session.entries() || [])].map(([, s]) => {
    const pos = [...s.positions.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    return `<tr><td>${esc(s.name)}<br><small>${esc(pos)}</small></td><td class="mono">${s.reps}</td><td class="mono">${(s.formSum / s.reps).toFixed(0)}%</td><td class="mono">${((100 * s.confSum) / s.reps).toFixed(0)}%</td></tr>`;
  });
  const un = (L.rec?.reps || []).filter((r) => !r.id).length;
  const html = rows.join('') + (un ? `<tr><td class="muted">Unclassified movements</td><td class="mono">${un}</td><td></td><td></td></tr>` : '');
  $('#drill-session tbody').innerHTML = html || '<tr><td colspan="4" class="muted">No repetitions yet.</td></tr>';
}

function drillCsv() {
  const rows = [['time_s', 'exercise', 'recognition_confidence', 'form_percent', 'rep_seconds', 'body_position', 'checks']];
  for (const r of L.rec.reps) rows.push([r.t.toFixed(2), r.name, (r.conf * 100).toFixed(0), r.form ?? '', r.dur.toFixed(2), r.position || '', r.checks.map((c) => `${c.pass ? 'PASS' : 'FAIL'} ${c.label} (${c.val == null ? '-' : (+c.val).toFixed(1)})`).join(' | ')]);
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' }));
  a.download = `motion_lab_drills_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`; a.click();
}

// Synthetic recognition test: each drill, 3 reps, through the full pipeline with landmark noise.
const DRILL_SIM = {
  squat: { lHipFlex: 80, rHipFlex: 80, lKnee: 110, rKnee: 110, lAnkle: 30, rAnkle: 30, trunkFlex: 40 },
  lunge: { lHipFlex: 80, lKnee: 95, rHipFlex: -15, rKnee: 85, trunkFlex: 5 },
  jumping_jack: { lShAbd: 150, rShAbd: 150, lHipAbd: 20, rHipAbd: 20, _dur: 0.9 },
  both_raise: { lShFlex: 165, rShFlex: 165 },
  both_curl: { lElbow: 130, rElbow: 130 },
  sumo_squat: { lHipFlex: 70, rHipFlex: 70, lHipAbd: 30, rHipAbd: 30, lKnee: 100, rKnee: 100, lAnkle: 25, rAnkle: 25, trunkFlex: 25 },
  overhead_squat: { lHipFlex: 70, rHipFlex: 70, lKnee: 100, rKnee: 100, lAnkle: 25, rAnkle: 25, trunkFlex: 25, lShFlex: 165, rShFlex: 165 },
  calf_raise: { lAnkle: -25, rAnkle: -25 },
  l_sl_squat: { lHipFlex: 45, lKnee: 75, lAnkle: 25, rHipFlex: 70, rKnee: 100, trunkFlex: 15 },
  r_sl_squat: { rHipFlex: 45, rKnee: 75, rAnkle: 25, lHipFlex: 70, lKnee: 100, trunkFlex: 15 },
  l_lat_lunge: { lHipFlex: 55, lKnee: 85, lAnkle: 25, rHipAbd: 30, trunkFlex: 20 },
  jump: { lHipFlex: 30, rHipFlex: 30, lKnee: 45, rKnee: 45, lAnkle: 15, rAnkle: 15, _lift: 22, _dur: 1.0 },
  squat_jump: { lHipFlex: 80, rHipFlex: 80, lKnee: 100, rKnee: 100, lAnkle: 25, rAnkle: 25, trunkFlex: 30, _lift: 25, _dur: 1.4 },
  l_hop: { rHipFlex: 50, rKnee: 90, lKnee: 25, _lift: 10, _liftR: 10, _dur: 0.9 },
  r_lat_lunge: { rHipFlex: 55, rKnee: 85, rAnkle: 25, lHipAbd: 30, trunkFlex: 20 },
  trunk_flex: { trunkFlex: 75 }, trunk_side: { trunkSide: 30 }, trunk_rot: { trunkRot: 35 },
  neck_rot: { neckRot: 70 }, neck_flex: { neckFlex: 45 }, neck_side: { neckSide: 35 },
  ...Object.fromEntries(['l', 'r'].flatMap((k) => [
    [`${k}_march`, { [`${k}HipFlex`]: 90, [`${k}Knee`]: 90 }], [`${k}_curl_leg`, { [`${k}Knee`]: 115 }], [`${k}_hip_abd`, { [`${k}HipAbd`]: 35 }],
    [`${k}_bicep_curl`, { [`${k}Elbow`]: 130 }], [`${k}_sh_flex`, { [`${k}ShFlex`]: 160 }], [`${k}_sh_abd`, { [`${k}ShAbd`]: 160 }],
  ])),
};
// pose of a drill at cycle position u (0..1). Jumps are two-phase: crouch and extend (0-0.5),
// flight with extended joints (0.5-0.8), soft landing (0.8-1); everything else rises and returns (sin^2).
function profileAt(prof, u) {
  const p = {}; let lift = null, f = 0;
  if (prof._lift) {
    if (u < 0.5) f = Math.sin((Math.PI * u) / 0.5) ** 2;
    else if (u < 0.8) { const s2 = Math.sin((Math.PI * (u - 0.5)) / 0.3); lift = { l: prof._lift * s2, r: (prof._liftR ?? prof._lift) * s2 }; f = prof._liftR ? 1 : 0; }
    else f = 0.6 * Math.sin((Math.PI * (u - 0.8)) / 0.2) ** 2;
  } else f = Math.sin(Math.PI * u) ** 2;
  for (const [a, b] of Object.entries(prof)) if (a[0] !== '_') p[a] = b * f;
  return { p, lift: lift || (prof._lift ? { l: 0, r: 0 } : null) };
}
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

async function recognitionTest(only = null) {
  const host = $('#drill-testres'); const noiseMm = 4, fps = 30, reps = 3;
  const savedVis = L.vis, savedLatch = L.planeLatch; L.vis = null; L.simulating = true;
  const rows = []; let correct = 0, total = 0, extra = 0, formSum = 0, formN = 0;
  const ids = Object.keys(DRILL_SIM).filter((k) => !Array.isArray(only) || only.includes(k));
  window.__lastRecReps = {};
  for (let di = 0; di < ids.length; di++) {
    const id = ids[di], prof = DRILL_SIM[id], dur = prof._dur || 2.0;
    host.innerHTML = `<p class="fine">Running ${di + 1}/${ids.length}: ${esc(DRILLS.find((d) => d.id === id)?.name || id)}…</p>`;
    await new Promise((r) => setTimeout(r, 0));
    const rec = new DrillRecognizer(null); let t = 0; L.planeLatch = {};
    const frame = (k) => { // k = cycle position u (0..1)
      const { p, lift } = profileAt(prof, k); L.jumpLift = lift || { l: 0, r: 0 };
      const { W } = landmarksFrom(commanded(p));
      for (const v of Object.values(W)) v.add(new THREE.Vector3(gauss(), gauss(), gauss()).multiplyScalar(noiseMm / 1000));
      const R = refineTrunk(L.rig, solve(L.rig, segmentFrames(W, L.rig), L.FrefRest), W);
      const m = measure(W, R);
      W.__cam = new THREE.Vector3(0, 0, L.atlas.anchors.anterior);
      rec.push(t, channels(m), bodyPosition(W, m)); rec.tick(t); t += 1 / fps;
    };
    for (let i = 0; i < fps; i++) frame(0);
    for (let r = 0; r < reps; r++) {
      for (let i = 0; i < dur * fps; i++) frame(i / (dur * fps));
      for (let i = 0; i < 0.8 * fps; i++) frame(0);
    }
    for (let i = 0; i < fps; i++) frame(0);
    const got = rec.reps; window.__lastRecReps[id] = { reps: got.map((x) => ({ name: x.name, conf: x.conf, dur: x.dur })), pending: !!rec._pending, out: Object.entries(rec.state).filter(([, v]) => v.phase === 'out').map(([k2]) => k2) };
    const ok = got.filter((x) => x.id === id).length;
    correct += Math.min(ok, reps); total += reps; extra += Math.max(0, got.length - reps);
    got.filter((x) => x.id === id).forEach((x) => { formSum += x.form; formN++; });
    const labels = [...new Set(got.map((x) => x.name))].join(', ') || 'nothing detected';
    rows.push(`<tr class="${ok === reps && got.length === reps ? '' : 'warnrow'}"><td>${esc(DRILLS.find((d) => d.id === id)?.name || id)}</td><td class="mono">${Math.min(ok, reps)}/${reps}</td><td class="mono">${got.length}</td><td><small>${esc(labels)}</small></td></tr>`);
  }
  L.vis = savedVis; L.planeLatch = savedLatch; L.simulating = false; L.jumpLift = null;
  host.innerHTML = `<p class="fine">Synthetic test: ${ids.length} drills × ${reps} reps, landmark noise σ = ${noiseMm} mm, ${fps} fps, full pipeline (landmarks → solver → angles → recognizer).
    Correctly named: <b class="mono">${correct}/${total} (${((100 * correct) / total).toFixed(1)}%)</b>. Extra or split detections: <b class="mono">${extra}</b>. Mean form score of correct reps: <b class="mono">${formN ? (formSum / formN).toFixed(1) : '—'}%</b>.
    Synthetic movements are cleaner than real ones; real-camera recognition accuracy is not yet measured.</p>
    <table><thead><tr><th>Drill</th><th>Named right</th><th>Detected</th><th>Labels given</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

// ------------------------------------------------------------------ joint map
function setupJointMap() {
  $('#jm-status').textContent = 'Computing connections from the 3D geometry…';
  setTimeout(() => {
    const res = buildJointMap(L.rig); L.jm = res.joints;
    $('#jm-status').textContent = `${res.joints.length} joints mapped in ${(res.ms / 1000).toFixed(1)} s.`;
    const groups = { Limbs: res.joints.filter((j) => !j.spine), Spine: res.joints.filter((j) => j.spine) };
    $('#jm-select').innerHTML = Object.entries(groups).map(([g, js]) => `<optgroup label="${g}">${js.map((j) => `<option value="${j.id}">${esc(j.name)}</option>`).join('')}</optgroup>`).join('');
    $('#jm-select').onchange = (e) => showJoint(e.target.value);
    $('#jm-mode').onchange = (e) => { const v = e.target.value; $('#jm-select').disabled = v !== 'joint'; if (v === 'joint') showJoint($('#jm-select').value); else if (v === 'pick') showPicker(); else showFullBody(v); };
    $('#auto-sync').onchange = (e) => { AUTO.on = e.target.checked; };
    $('#jm-ghost').onchange = (e) => { L.jmGhost = e.target.checked; applyLook(); };
    $('#jm-clear').onclick = () => { L.jmSet = null; applyLook(); };
    L.jmGhost = true;
    $('#jm-select').value = 'l_knee'; showJoint('l_knee');
  }, 30);
}

function showJoint(id) {
  const j = L.jm?.find((x) => x.id === id); if (!j) return;
  if (BIO.on && BIO.show) { BIO.show = false; $('#bio-show').checked = false; L.bioSet = null; clearBioVis(); } // one highlight at a time
  const set = new Map();
  j.bones.forEach((p) => set.set(p.name, 'bone'));
  j.soft.forEach((p) => set.set(p.name, tissueKind(p)));
  j.muscles.forEach((p) => set.set(p.name, 'muscles'));
  j.vn.forEach((p) => set.set(p.name, p.layer));
  L.jmSet = set; applyLook();
  const list = (title, arr, kind) => `<details ${arr.length && arr.length < 14 ? 'open' : ''}><summary><span class="sw" style="background:#${kindMat(kind).color.getHexString()}"></span> ${title} <small>${arr.length}</small></summary>
    <p class="fine">${arr.length ? arr.map((p) => esc(p.name)).join(' · ') : 'none: this BodyParts3D release has no mesh for these structures here (for example, knee ligaments and menisci are not modelled)'}</p></details>`;
  const textbook = j.actions.map((a) => MUSCLE_ACTIONS[a]).filter(Boolean).map((a) => `<li><b>${esc(a.label)}</b>: ${a.muscles.map((m) => `${esc(m.m)} <span class="grade g${m.grade}">${m.grade}${m.page ? ` p${m.page}` : ''}</span>`).join(', ')}</li>`).join('');
  $('#jm-detail').innerHTML = `
    ${list('Bones forming the joint', j.bones, 'bone')}
    ${list('Cartilage, discs, ligaments', j.soft, 'cartilage')}
    ${list('Muscles crossing it (from geometry)', j.muscles, 'muscles')}
    ${list('Vessels and nerves within 40 mm', j.vn, 'arteries')}
    ${textbook ? `<p class="fine" style="margin-top:8px"><b>Textbook prime movers</b> (OpenStax A&amp;P 2e):</p><ul class="fine tb">${textbook}</ul>` : ''}`;
  const jc = L.rig.J[id] || null;
  if (jc && $('#jm-focus').checked) {
    const c = jc.p.clone().applyMatrix4(L.M.get(jc.seg) || new THREE.Matrix4());
    const dir = L.camera.position.clone().sub(L.controls.target).normalize();
    L.controls.target.copy(c); L.camera.position.copy(c).addScaledVector(dir, 0.75); L.controls.update();
  }
}


// ------------------------------------------------------------------ biomechanics
const BIO = { on: false, mass: 70, sex: 'M', dyn: false, show: true, hist: [], last: null, vel: {}, lookT: 0 };
const bioMats = new Map();
function bioMat(b) {
  const k = `${b.role}:${Math.round(b.level * 10)}`;
  if (!bioMats.has(k)) {
    const c = b.role === 'ag' ? new THREE.Color().setHSL(0.02 + 0.1 * (1 - b.level), 1, 0.5) : new THREE.Color(0x3d7bff);
    bioMats.set(k, new THREE.MeshPhysicalMaterial({ color: c, emissive: c, emissiveIntensity: b.role === 'ag' ? 0.25 + 0.6 * b.level : 0.15, roughness: 0.45, transparent: b.role !== 'ag', opacity: b.role === 'ag' ? 1 : 0.35, side: THREE.DoubleSide }));
  }
  return bioMats.get(k);
}

function setupBiomech() {
  $('#bio-on').onchange = (e) => { BIO.on = e.target.checked; if (!BIO.on) { L.bioSet = null; applyLook(); clearBioVis(); } };
  $('#bio-mass').oninput = (e) => { BIO.mass = Math.max(20, Math.min(250, +e.target.value || 70)); };
  $('#bio-sex').onchange = (e) => { BIO.sex = e.target.value; };
  $('#bio-dyn').onchange = (e) => { BIO.dyn = e.target.checked; };
  $('#bio-show').onchange = (e) => { BIO.show = e.target.checked; if (!BIO.show) { L.bioSet = null; applyLook(); clearBioVis(); } };
  $('#bio-ghost').onchange = (e) => { L.bioGhost = e.target.checked; applyLook(); };
  $('#bio-src').textContent = BSP_SOURCE;
  L.bioGhost = $('#bio-ghost').checked;
}

function velOf(key, v, t) { // smoothed angular velocity (deg/s) from successive measurements
  if (v == null) return null;
  const p = BIO.vel[key];
  if (!p) { BIO.vel[key] = { v, t, w: 0 }; return 0; }
  const dt = Math.max(1e-3, t - p.t); const raw = (v - p.v) / dt; p.w += 0.35 * (raw - p.w); p.v = v; p.t = t; return p.w;
}

export function biomechState() { return BIO; }

function stepBiomech(t) {
  if (!BIO.on || !L.W || !L.R.pelvis) return;
  if (L.vis && ![11, 12, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32].every((i) => (L.vis[i] ?? 0) > 0.5)) { BIO.last = { blocked: true }; return; }
  const A = L.atlas.anchors;
  let comAcc = null; // optional dynamic term: second difference of the COM over ~0.1 s
  if (BIO.dyn && BIO.hist.length > 8) {
    const h = BIO.hist, a = h[h.length - 1], b = h[h.length - 4], c = h[h.length - 8];
    const dt1 = a.t - b.t, dt2 = b.t - c.t;
    if (dt1 > 0.02 && dt2 > 0.02) comAcc = a.com.clone().sub(b.com).multiplyScalar(1 / dt1).sub(b.com.clone().sub(c.com).multiplyScalar(1 / dt2)).multiplyScalar(2 / (dt1 + dt2));
  }
  const loads = LOAD_PROVIDER ? LOAD_PROVIDER(L.W, t) : [];
  const r = analyse(L.W, L.R, { mass: BIO.mass, sex: BIO.sex, comAcc, loads, axes: { up: new THREE.Vector3(0, 1, 0), ant: new THREE.Vector3(0, 0, A.anterior), left: new THREE.Vector3(A.leftX, 0, 0) } });
  BIO.hist.push({ t, com: r.com.clone() }); while (BIO.hist.length > 30) BIO.hist.shift();
  const m = L.meas || {};
  const vel = {
    l_hip: velOf('l_hip', m.l_hip?.flex, t), r_hip: velOf('r_hip', m.r_hip?.flex, t), l_knee: velOf('l_knee', m.l_knee, t), r_knee: velOf('r_knee', m.r_knee, t),
    l_ankle: velOf('l_ankle', m.l_ankle, t), r_ankle: velOf('r_ankle', m.r_ankle, t), l_elbow: velOf('l_elbow', m.l_elbow, t), r_elbow: velOf('r_elbow', m.r_elbow, t),
    l_shoulder: m.l_sh?.plane === 'flexion' ? velOf('l_sh', m.l_sh?.elev, t) : null, r_shoulder: m.r_sh?.plane === 'flexion' ? velOf('r_sh', m.r_sh?.elev, t) : null,
    lumbar: velOf('trunk', m.trunk?.flex, t),
  };
  r.rows = Object.entries(r.J).filter(([id]) => !id.endsWith('wrist')).map(([id, j]) => ({ id, parts: interpret(id, j, vel[id]) }));
  BIO.last = r;
  if (BIO.show && t - BIO.lookT > 0.25) { BIO.lookT = t; paintMuscles(r); drawBioVis(r); }
}

function paintMuscles(r) {
  const set = new Map(), ref = 1.5 * BIO.mass; // 1.5 N·m per kg: a colour scale only, not an activation level
  for (const row of r.rows) {
    const side = row.id.startsWith('l_') ? 'left' : row.id.startsWith('r_') ? 'right' : null;
    for (const p of row.parts) {
      const level = Math.min(1, Math.abs(p.moment) / ref);
      if (level < 0.04) continue;
      const reA = GROUPS[p.agonist].re, reN = GROUPS[p.antagonist].re;
      for (const { part } of L.atlas.parts) {
        if (part.layer !== 'muscles' || (side && !part.name.includes(side))) continue;
        if (reA.test(part.name)) { const o = set.get(part.name); if (!o || o.role !== 'ag' || o.level < level) set.set(part.name, { role: 'ag', level }); }
        else if (reN.test(part.name) && !set.has(part.name)) set.set(part.name, { role: 'an', level: 0 });
      }
    }
  }
  L.bioSet = set; L.jmSet = null; // biomechanics display takes over the highlight
  if (L.depth < 3) { L.depth = 3; $('#lab-depth').value = 3; }
  applyLook();
}

let bioGroup = null;
function clearBioVis() { if (bioGroup) { L.scene.remove(bioGroup); bioGroup = null; } }
function drawBioVis(r) {
  clearBioVis(); bioGroup = new THREE.Group(); L.scene.add(bioGroup);
  const P = (k) => posedPoint(L.rig, L.M, 'LM', k), J = (k) => posedPoint(L.rig, L.M, 'J', k);
  const floorY = Math.min(...['l_heel', 'r_heel', 'l_toe_tip', 'r_toe_tip'].map((k) => P(k)?.y ?? 0));
  for (const k of ['l', 'r']) { // ground-reaction arrows: length = share of body weight x 0.9 m, drawn on top of everything
    const F = r.grf[k]; const frac = F.length() / r.bodyWeightN; if (frac < 0.02) continue;
    const c = P(`${k}_heel`).clone().lerp(P(`${k}_toe_tip`), 0.5); c.y = floorY;
    bioGroup.add(bigArrow(c, F.clone().normalize(), frac * 0.9, 0x39ff6a)); // bright green: distinct from bone, muscle and marker colours
  }
  // joint moment markers: size = |moment| per kg, orange = extensor/plantarflexor/abductor demand, cyan = flexor/dorsiflexor/adductor
  const JPOS = { l_hip: () => J('l_hip'), r_hip: () => J('r_hip'), l_knee: () => J('l_knee'), r_knee: () => J('r_knee'), l_ankle: () => J('l_ankle'), r_ankle: () => J('r_ankle'),
    l_shoulder: () => J('l_shoulder'), r_shoulder: () => J('r_shoulder'), l_elbow: () => J('l_elbow'), r_elbow: () => J('r_elbow'), lumbar: () => J('v_L5') };
  for (const row of r.rows) {
    const p = row.parts.find((x) => x.plane === 'sagittal'); const pos = JPOS[row.id]?.(); if (!p || !pos) continue;
    const lvl = Math.min(1, Math.abs(p.moment) / (1.5 * BIO.mass)); if (lvl < 0.03) continue;
    const ext = /extensor|plantar|abductor/.test(p.agonist);
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.012 + 0.035 * lvl, 18, 12), new THREE.MeshBasicMaterial({ color: ext ? 0xff8a1f : 0x29d9ff, transparent: true, opacity: 0.75, depthTest: false }));
    m.position.copy(pos); m.renderOrder = 998; bioGroup.add(m);
  }
  // twin COM: the same segment fractions applied to the twin's joint centres
  const midS = J('l_shoulder').clone().add(J('r_shoulder')).multiplyScalar(0.5), midH = J('l_hip').clone().add(J('r_hip')).multiplyScalar(0.5);
  const segs = [[0.4346, midS.clone().lerp(midH, 0.431)], [0.0694, P('l_ear').clone().add(P('r_ear')).multiplyScalar(0.5)]];
  for (const k of ['l', 'r']) segs.push([0.0271, J(`${k}_shoulder`).clone().lerp(J(`${k}_elbow`), 0.5772)], [0.0162, J(`${k}_elbow`).clone().lerp(J(`${k}_wrist`), 0.4574)], [0.0061, J(`${k}_wrist`)],
    [0.1416, J(`${k}_hip`).clone().lerp(J(`${k}_knee`), 0.4095)], [0.0433, J(`${k}_knee`).clone().lerp(J(`${k}_ankle`), 0.4395)], [0.0137, P(`${k}_heel`).clone().lerp(P(`${k}_toe_tip`), 0.4415)]);
  const com = segs.reduce((a, [mm, pp]) => a.addScaledVector(pp, mm), new THREE.Vector3()).multiplyScalar(1 / segs.reduce((s, [mm]) => s + mm, 0));
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.022, 20, 14), new THREE.MeshStandardMaterial({ color: r.inside ? 0x64e6a8 : 0xff6b6b, emissive: r.inside ? 0x1f7a52 : 0x7a1f1f }));
  ball.position.copy(com); bioGroup.add(ball);
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([com, com.clone().setY(floorY)]), new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.02, gapSize: 0.015 }));
  line.computeLineDistances(); bioGroup.add(line);
}

function renderBiomech() {
  const host = $('#bio-out'); if (!host) return;
  if (!BIO.on) { host.innerHTML = '<p class="muted">Off. Turn on to estimate forces and moments from the tracked motion.</p>'; return; }
  const r = BIO.last;
  if (!r) { host.innerHTML = '<p class="muted">Waiting for a full-body frame (or press Demo).</p>'; return; }
  if (r.blocked) { host.innerHTML = '<p class="muted">Needs the whole body in view (shoulders, hips, knees, ankles, feet).</p>'; return; }
  const bw = r.bodyWeightN, f = (x, d = 0) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d));
  const name = { lumbar: 'Lumbosacral', l_hip: 'L hip', r_hip: 'R hip', l_knee: 'L knee', r_knee: 'R knee', l_ankle: 'L ankle', r_ankle: 'R ankle', l_shoulder: 'L shoulder', r_shoulder: 'R shoulder', l_elbow: 'L elbow', r_elbow: 'R elbow' };
  const rows = r.rows.flatMap((row) => row.parts.map((p) => `<tr><td>${name[row.id] || row.id}${p.plane === 'frontal' ? ' <small>frontal</small>' : ''}</td>
    <td class="mono">${f(Math.abs(p.moment), 1)} <small>(${f(Math.abs(p.moment) / BIO.mass, 2)}/kg)</small></td><td>${esc(GROUPS[p.agonist].label)}</td><td><small>${esc(GROUPS[p.antagonist].label.split(' (')[0])}</small></td>
    <td><small>${p.mode ? esc(p.mode) : '—'}</small></td><td class="mono">${p.power == null ? '—' : f(p.power, 0)}</td></tr>`)).join('');
  host.innerHTML = `
    <div class="bio-top"><span>Ground reaction · L <b class="mono">${f(r.grf.l.length())} N</b> (${f((100 * r.grf.l.length()) / bw)}% BW) · R <b class="mono">${f(r.grf.r.length())} N</b> (${f((100 * r.grf.r.length()) / bw)}% BW)</span>
    <span class="q ${r.inside ? 'good' : 'poor'}">centre of mass ${r.inside ? 'over' : 'outside'} base of support</span></div>
    <table class="bio-table"><thead><tr><th>Joint</th><th>Net moment N·m</th><th>Group the moment requires</th><th>Opposing group</th><th>Contraction</th><th>Power W</th></tr></thead><tbody>${rows}</tbody></table>`;
}


function bigArrow(from, dir, len, color) {
  const g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 });
  const shaft = Math.max(0.02, len - 0.09);
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, shaft, 14), mat); cyl.position.y = shaft / 2;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.09, 18), mat); cone.position.y = shaft + 0.045;
  g.add(cyl, cone); g.position.copy(from); g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  g.traverse((o) => { o.renderOrder = 999; });
  return g;
}
export function bioOverlay() { return bioGroup; }

// ------------------------------------------------------------------ auto-sync (auto-calibration)
// Calibrates by itself when you stand still, upright, arms at your sides, facing the camera, for 1.5 s.
const AUTO = { on: true, buf: [] };
function autoCalibrate(t) {
  if (!AUTO.on || L.calibrated || !L.meas || !L.vis) return;
  const m = L.meas, vis = L.vis;
  const okVis = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].every((i) => (vis[i] ?? 0) > 0.6);
  const upright = okVis && (m.l_knee ?? 99) < 12 && (m.r_knee ?? 99) < 12 && (m.l_sh?.elev ?? 99) < 25 && (m.r_sh?.elev ?? 99) < 25 && Math.abs(m.trunk?.rotL ?? 99) < 12;
  if (!upright) { AUTO.buf = []; return; }
  AUTO.buf.push({ t, a: [m.l_knee, m.r_knee, m.l_sh.elev, m.r_sh.elev, m.l_elbow, m.r_elbow] });
  while (AUTO.buf.length && t - AUTO.buf[0].t > 1.5) AUTO.buf.shift();
  if (AUTO.buf.length < 10 || t - AUTO.buf[0].t < 1.4) return;
  const still = AUTO.buf[0].a.every((x, i) => Math.max(...AUTO.buf.map((b) => b.a[i])) - Math.min(...AUTO.buf.map((b) => b.a[i])) < 4);
  if (!still) return;
  L.Fref = segmentFrames(L.W, L.rig); L.calibrated = true; L.R = {}; AUTO.buf = [];
  $('#lab-calib-msg').textContent = `Auto-synced at ${new Date().toLocaleTimeString()}: this standing posture is now the twin's reference. Press Calibrate stance to redo it.`;
}

// ------------------------------------------------------------------ joint map: full-body muscle views
const FB_COLORS = ['#ff5d8f', '#4cc9f0', '#ffd166', '#06d6a0', '#f78c6b', '#b388ff', '#90e0ef', '#e9ff70', '#ff9e00', '#80ffdb', '#ff70a6', '#70d6ff', '#c0fdff', '#ffb4a2', '#cdb4db', '#a0c4ff'];
const REGION_OF = (seg) => seg === 'head' ? 'Head & face' : /^v_C/.test(seg) ? 'Neck' : /^v_[TL]|ribs/.test(seg) ? 'Trunk & back' : seg === 'pelvis' ? 'Pelvis & hip' : /girdle|humerus/.test(seg) ? 'Shoulder & upper arm'
  : /forearm|hand/.test(seg) ? 'Forearm & hand' : /femur/.test(seg) ? 'Thigh' : /_leg|_foot/.test(seg) ? 'Leg & foot' : 'Other';
function showFullBody(mode) {
  const segOf = new Map(); L.rig.segs.forEach((sg) => sg.parts.forEach((pt) => segOf.set(pt.name, sg.key)));
  const muscles = L.atlas.parts.map((x) => x.part).filter((pt) => pt.layer === 'muscles');
  const buckets = new Map();
  for (const pt of muscles) {
    let key;
    if (mode === 'group') { const g = Object.entries(GROUPS).find(([, v]) => v.re.test(pt.name)); key = g ? GROUPS[g[0]].label : 'Other muscles (not in a modelled action group)'; }
    else key = REGION_OF(segOf.get(pt.name) || '');
    if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(pt);
  }
  const keys = [...buckets.keys()].sort((a, b) => (a.startsWith('Other') ? 1 : b.startsWith('Other') ? -1 : a.localeCompare(b)));
  const colorOf = new Map(keys.map((k, i) => [k, FB_COLORS[i % FB_COLORS.length]]));
  const set = new Map(); for (const k of keys) for (const pt of buckets.get(k)) set.set(pt.name, `col:${colorOf.get(k)}`);
  if (BIO.on && BIO.show) { BIO.show = false; $('#bio-show').checked = false; L.bioSet = null; clearBioVis(); }
  L.jmSet = set; if (L.depth < 3) { L.depth = 3; $('#lab-depth').value = 3; } applyLook();
  $('#jm-detail').innerHTML = `<p class="fine">All ${muscles.length} muscles of the reference body, coloured by ${mode === 'group' ? 'action group (the groups used by biomechanics)' : 'body region (the skeleton segment each muscle is carried by)'}.</p>` +
    keys.map((k) => `<details><summary><span class="sw" style="background:${colorOf.get(k)}"></span> ${esc(k)} <small>${buckets.get(k).length}</small></summary><p class="fine">${buckets.get(k).map((pt) => esc(pt.name)).join(' · ')}</p></details>`).join('');
}


// ------------------------------------------------------------------ body-in-view mode, pose model, extra cameras
function setupViewAndCameras() {
  const vm = $('#lab-viewmode'); vm.value = L.viewMode || 'auto'; vm.onchange = () => { L.viewMode = vm.value; };
  const pm = $('#lab-posemodel'); pm.value = getPoseModel(); pm.onchange = async () => { pm.disabled = true; await setPoseModel(pm.value); pm.disabled = false; };
  const list = $('#cam-list');
  const render = async () => {
    let devs = []; try { devs = await listCameras(); } catch { /* no permission yet */ }
    const primary = document.getElementById('cam')?.srcObject?.getVideoTracks()[0]?.getSettings().deviceId;
    list.innerHTML = devs.map((d) => {
      const c = multicam.cams.find((x) => x.id === d.id);
      const st = d.id === primary ? '<small>primary</small>' : c ? `<small class="mono" data-st="${d.id}"></small>` : '';
      return `<li><label><input type="checkbox" data-cam="${d.id}" ${c || d.id === primary ? 'checked' : ''} ${d.id === primary ? 'disabled' : ''}> ${esc(d.label)}</label> ${st}</li>`;
    }).join('') || '<li class="muted">No cameras listed yet: start the camera first (the browser shows names only after permission).</li>';
    list.querySelectorAll('[data-cam]').forEach((cb) => cb.onchange = async () => {
      try { if (cb.checked) await addCamera(cb.dataset.cam, cb.parentElement.textContent.trim()); else removeCamera(cb.dataset.cam); }
      catch (e) { cb.checked = false; alert(`Camera not added: ${e.message}`); }
      render();
    });
    $('#cam-count').textContent = `${multicam.cams.length + 1} (${multicam.cams.length ? 'fused' : 'primary only'})`;
  };
  $('#cam-scan').onclick = render;
  $('#cam-all').onclick = async () => {
    let devs = []; try { devs = await listCameras(); } catch { /* none */ }
    const primary = document.getElementById('cam')?.srcObject?.getVideoTracks()[0]?.getSettings().deviceId;
    for (const d of devs.filter((x) => x.id !== primary).slice(0, 3)) { try { await addCamera(d.id, d.label); } catch (e) { console.warn(e); } }
    render();
  };
  $('#cam-lock').onclick = () => { const on = !multicam.cams.some((c) => c.locked); lockAlignment(on); $('#cam-lock').textContent = on ? 'Unlock alignment' : 'Lock alignment (stand still, seen by all)'; };
  setInterval(() => multicam.cams.forEach((c) => { const el = list.querySelector(`[data-st="${CSS.escape(c.id)}"]`); if (el) el.textContent = `${c.fps.toFixed(0)} fps · ${c.used} joints · disagreement ${c.resid == null ? '—' : c.resid.toFixed(0) + ' mm'}${c.lag != null ? ` · frame age ${c.lag.toFixed(0)} ms` : ''}${c.locked ? ' · locked' : ''}`; }), 500);
}


// ------------------------------------------------------------------ pick muscles: multi-select, bilateral (B/L), live on the moving twin
const PICK = { names: new Set(), bilateral: true, filter: '' };
const PICK_COLORS = ['#ff5d8f', '#4cc9f0', '#ffd166', '#06d6a0', '#f78c6b', '#b388ff', '#90e0ef', '#e9ff70', '#ff9e00', '#80ffdb', '#ff70a6', '#70d6ff'];
const otherSide = (n) => (/\bleft\b/.test(n) ? n.replace(/\bleft\b/, 'right') : /\bright\b/.test(n) ? n.replace(/\bright\b/, 'left') : null);
const baseName = (n) => n.replace(/\b(left|right) /, '');
function togglePick(name) {
  const both = [name]; if (PICK.bilateral) { const o = otherSide(name); if (o && L.atlas.byName.has(o)) both.push(o); }
  const on = !PICK.names.has(name); both.forEach((n) => (on ? PICK.names.add(n) : PICK.names.delete(n)));
  showPicker();
}
function showPicker() {
  const all = L.atlas.parts.map((x) => x.part).filter((p) => p.layer === 'muscles');
  // one colour per muscle; a bilateral pair shares its colour so left and right read as one muscle
  const bases = [...new Set([...PICK.names].map(baseName))];
  const colOf = new Map(bases.map((b, i) => [b, PICK_COLORS[i % PICK_COLORS.length]]));
  const set = new Map(); PICK.names.forEach((n) => set.set(n, `col:${colOf.get(baseName(n))}`));
  if (BIO.on && BIO.show) { BIO.show = false; $('#bio-show').checked = false; L.bioSet = null; clearBioVis(); }
  L.jmSet = set.size ? set : null; L.jmGhost = $('#jm-ghost').checked; if (L.depth < 3) { L.depth = 3; $('#lab-depth').value = 3; } applyLook();
  const f = PICK.filter.toLowerCase();
  const groups = new Map(); all.forEach((p) => { const b = baseName(p.name); if (f && !b.toLowerCase().includes(f)) return; if (!groups.has(b)) groups.set(b, []); groups.get(b).push(p.name); });
  const rows = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(0, 400).map(([b, names]) => {
    const L_ = names.find((n) => /\bleft\b/.test(n)), R_ = names.find((n) => /\bright\b/.test(n)), mid = names.filter((n) => !/\b(left|right)\b/.test(n));
    const box = (n, lab) => n ? `<label class="pk"><input type="checkbox" data-pk="${esc(n)}" ${PICK.names.has(n) ? 'checked' : ''}> ${lab}</label>` : '';
    const sw = colOf.has(b) && names.some((n) => PICK.names.has(n)) ? `<span class="sw" style="background:${colOf.get(b)}"></span>` : '';
    return `<li>${sw}<span class="pk-n">${esc(b)}</span>${box(L_, 'L')}${box(R_, 'R')}${mid.map((n) => box(n, 'midline')).join('')}</li>`;
  }).join('');
  $('#jm-detail').innerHTML = `
    <div class="pk-bar"><input id="pk-q" type="search" placeholder="Search muscles (e.g. gluteus, deltoid, rotator)" value="${esc(PICK.filter)}">
      <label><input id="pk-bl" type="checkbox" ${PICK.bilateral ? 'checked' : ''}> Bilateral (B/L)</label>
      <button class="ghost-btn" id="pk-none">Clear</button></div>
    <p class="fine">${PICK.names.size} selected · tick L / R, or click muscles on the twin. With B/L on, each pick adds both sides in one colour. Colours stay on while the twin moves (live camera or demo).</p>
    <ul class="pk-list">${rows || '<li class="muted">No muscle matches.</li>'}</ul>`;
  const q = $('#pk-q'); q.oninput = () => { PICK.filter = q.value; const pos = q.selectionStart; showPicker(); const q2 = $('#pk-q'); q2.focus(); q2.setSelectionRange(pos, pos); };
  $('#pk-bl').onchange = (e) => { PICK.bilateral = e.target.checked; };
  $('#pk-none').onclick = () => { PICK.names.clear(); showPicker(); };
  $('#jm-detail').querySelectorAll('[data-pk]').forEach((cb) => (cb.onchange = () => togglePick(cb.dataset.pk)));
}


// ------------------------------------------------------------------ exercise library: the twin performs any recognised drill
const EX_GROUPS = [
  ['Squat family', /squat/], ['Lunges', /lunge/], ['Jumps and hops', /jump|hop|jack/], ['Hip and knee', /march|curl_leg|hip_abd|hamstring|calf/],
  ['Shoulder and elbow', /raise|curl|sh_|bicep/], ['Trunk', /^trunk/], ['Neck', /^neck/],
];
const PARAM_ACTION = { ShFlex: 'shoulder_flexion', ShAbd: 'shoulder_abduction', Elbow: 'elbow_flexion', HipFlex: 'hip_flexion', Knee: 'knee_flexion' };
function setupExerciseLibrary() {
  const sel = $('#ex-pick');
  const ids = Object.keys(DRILL_SIM);
  const groups = EX_GROUPS.map(([g, re]) => [g, ids.filter((id) => re.test(id))]);
  const rest = ids.filter((id) => !groups.some(([, l]) => l.includes(id)));
  if (rest.length) groups.push(['Other', rest]);
  const nameOf = (id) => DRILLS.find((d) => d.id === id)?.name || id;
  sel.innerHTML = '<option value="">Choose an exercise…</option>' + groups.filter(([, l]) => l.length).map(([g, l]) => `<optgroup label="${esc(g)}">${l.map((id) => `<option value="${id}">${esc(nameOf(id))}</option>`).join('')}</optgroup>`).join('');
  sel.onchange = () => { if (sel.value) startExercise(sel.value); else stopExercise(); };
  $('#ex-stop').onclick = () => { sel.value = ''; stopExercise(); };
  $('#ex-speed').oninput = () => { if (L.exercise) L.exercise.speed = +$('#ex-speed').value / 100; };
}
function startExercise(id) {
  L.studio?.stop(); L.demo = false; L.exercise = { id, t0: performance.now() / 1000, speed: +$('#ex-speed').value / 100, phase: 0 };
  const D = DRILLS.find((d) => d.id === id), prof = DRILL_SIM[id];
  const actions = new Set();
  for (const [k, v] of Object.entries(prof)) { const base = k.replace(/^[lr]/, ''); const a = PARAM_ACTION[base]; if (a) { actions.add(a); if (MUSCLE_ACTIONS[a]?.anta) actions.add(MUSCLE_ACTIONS[a].anta); } }
  const tb = [...actions].map((a) => MUSCLE_ACTIONS[a]).filter(Boolean).map((a) => `<li><b>${esc(a.label)}</b>: ${a.muscles.map((mm) => `${esc(mm.m)} <span class="grade g${mm.grade}">${mm.grade}${mm.page ? ` p${mm.page}` : ''}</span>`).join(', ')}</li>`).join('');
  // let the computed biomechanics colour the working muscles (the joint-map highlight would hide it)
  L.jmSet = null; L.hiSegs = null; if (!BIO.on) { BIO.on = true; $('#bio-on').checked = true; } BIO.show = true; if ($('#bio-show')) $('#bio-show').checked = true; applyLook();
  const joints = Object.entries(prof).filter(([k]) => k[0] !== '_').map(([k, v]) => `${esc(k.replace(/^l/, 'L ').replace(/^r(?=[A-Z])/, 'R ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase())} ${v > 0 ? '+' : ''}${v}°`).join(' · ');
  $('#ex-info').innerHTML = `<h3 class="st-h">${esc(D?.name || id)}</h3>
    <p><b>Peak joint positions in this model:</b> ${joints}${prof._lift ? ` · flight ${prof._lift} cm` : ''}</p>
    <p><b>Live angles:</b> <span id="ex-live" class="mono">—</span></p>
    ${tb ? `<p><b>Muscles for the movements at these joints, both directions</b> (OpenStax Anatomy &amp; Physiology 2e; B = page-cited, U = not yet cited). Which group is actually working, and whether it shortens (concentric) or lengthens under load (eccentric), depends on gravity and is what the coloured twin shows: e.g. in a squat the knee and hip <i>extensors</i> work, lengthening on the way down.</p><ul class="fine">${tb}</ul>` : ''}
    ${D?.checks?.length ? `<p><b>Form rules the recogniser scores</b> (app rules, not clinical standards):</p><ul class="fine">${D.checks.map((c) => `<li>${esc(c.label)}${c.cue ? ` <i>→ "${esc(c.cue)}"</i>` : ''}</li>`).join('')}</ul>` : ''}
    <p class="muted">Biomechanics is on: muscle colours are computed each frame from the joint moments of this idealised movement (quasi-static, de Leva segment data). It is a model, not a recording of a person.</p>`;
}
function stopExercise() { L.exercise = null; L.jumpLift = null; $('#ex-info').innerHTML = ''; }
function exerciseStep(t) {
  const E = L.exercise, prof = DRILL_SIM[E.id], dur = (prof._dur || 2.0) / E.speed, rest = 0.6 / E.speed;
  const cyc = ((t - E.t0) % (dur + rest));
  const { p, lift } = cyc < dur ? profileAt(prof, cyc / dur) : { p: {}, lift: prof._lift ? { l: 0, r: 0 } : null };
  L.jumpLift = lift;
  const { W } = landmarksFrom(commanded(p));
  L.W = W; L.vis = null; L.src = 'demo'; L.Fref = L.FrefRest;
  step(t);
  const el = document.getElementById('ex-live');
  if (el && L.meas) { const m = L.meas; el.textContent = [['L knee', m.l_knee], ['R knee', m.r_knee], ['L hip', m.l_hip?.flex], ['R hip', m.r_hip?.flex], ['L elbow', m.l_elbow], ['R elbow', m.r_elbow], ['trunk', m.trunkIncl]].filter(([, v]) => v != null && Math.abs(v) > 2).map(([n, v]) => `${n} ${v.toFixed(0)}°`).join(' · ') + (L.jumpLift ? ` · lift ${Math.min(L.jumpLift.l, L.jumpLift.r).toFixed(0)} cm` : ''); }
}


// ------------------------------------------------------------------ energy systems: textbook phases of a continuous effort
const EN_PHASES = [
  { until: 15, name: 'Creatine phosphate', col: '#ffd166', quote: 'Creatine phosphate provides about the first 15 seconds of ATP at the beginning of muscle contraction.' },
  { until: 60, name: 'Anaerobic glycolysis', col: '#f78c6b', quote: 'Glycolysis itself cannot be sustained for very long (approximately 1 minute of muscle activity), but it is useful in facilitating short bursts of high- intensity output.' },
  { until: Infinity, name: 'Aerobic respiration', col: '#06d6a0', quote: 'Aerobic respiration is much more efficient than anaerobic glycolysis, producing approximately 36 ATPs per molecule of glucose versus four from glycolysis.' },
];
const EN = { active: 0, stillT: null, lastT: null, prev: null };
function energyTick(t) {
  const el = document.getElementById('en-time'); if (!el || !L.W) return;
  const ids = [15, 16, 27, 28].filter((i) => L.W[i]);
  let speed = 0;
  if (EN.prev && EN.lastT != null && t > EN.lastT) { for (const i of ids) speed = Math.max(speed, L.W[i].distanceTo(EN.prev[i]) / (t - EN.lastT)); }
  const dt = EN.lastT == null ? 0 : Math.min(0.5, t - EN.lastT);
  EN.prev = Object.fromEntries(ids.map((i) => [i, L.W[i].clone()])); EN.lastT = t;
  if (speed > 0.15) { EN.active += dt; EN.stillT = null; } else { EN.stillT = EN.stillT ?? t; if (t - EN.stillT > 10) EN.active = 0; }
  const ph = EN_PHASES.find((p) => EN.active < p.until);
  el.textContent = `${EN.active.toFixed(1)} s`;
  document.getElementById('en-state').textContent = speed > 0.15 ? `moving (${speed.toFixed(2)} m/s)` : EN.active ? 'paused' : 'resting';
  document.getElementById('en-fill').style.width = `${Math.min(100, (EN.active / 120) * 100)}%`;
  document.getElementById('en-fill').style.background = ph.col;
  const key = EN.active ? ph.name : 'rest';
  if (EN.key !== key) { EN.key = key; document.getElementById('en-phase').innerHTML = EN.active ? `<b style="color:${ph.col}">${ph.name}</b>: “${ph.quote}”` : 'At rest.'; }
}
document.addEventListener('click', (e) => { if (e.target?.id === 'en-reset') { EN.active = 0; EN.stillT = null; } });
