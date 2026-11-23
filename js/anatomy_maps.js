// Anatomy maps for the live mirror.
//
// Landmark indices are MediaPipe's published topologies (hand: 21 points,
// pose: 33 points, face mesh: 478 points). Bone and region names are placed on
// SURFACE landmarks: the overlay is a schematic projection, not imaging.
//
// Muscle actions: every row carries a grade and a source.
//   B = stated in OpenStax "Anatomy and Physiology 2e" (CC BY-NC-SA 4.0,
//       openstax.org/details/books/anatomy-and-physiology-2e), chapter 11;
//       "p" is the PDF page of the local copy (book page = p - 17).
//   U = standard anatomy not yet checked against a source in this build.
//       Shown with a U badge, never upgraded.

export const OPENSTAX_AP2E = {
  title: 'OpenStax, Anatomy and Physiology 2e, ch. 11 (CC BY-NC-SA 4.0)',
  url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/11-introduction',
};

// ---------------------------------------------------------------- hand
// MediaPipe hand: 0 wrist; thumb 1 CMC,2 MCP,3 IP,4 tip; index 5 MCP,6 PIP,7 DIP,8 tip;
// middle 9-12; ring 13-16; little 17-20.
export const FINGERS = [
  { key: 'thumb', name: 'Thumb', roman: 'I', mcp: 1, chain: [1, 2, 3, 4] },
  { key: 'index', name: 'Index', roman: 'II', mcp: 5, chain: [5, 6, 7, 8] },
  { key: 'middle', name: 'Middle', roman: 'III', mcp: 9, chain: [9, 10, 11, 12] },
  { key: 'ring', name: 'Ring', roman: 'IV', mcp: 13, chain: [13, 14, 15, 16] },
  { key: 'little', name: 'Little', roman: 'V', mcp: 17, chain: [17, 18, 19, 20] },
];

// Bone segments: [from, to, name, relative width]. Metacarpals II-V start 30 %
// of the way from the wrist landmark, leaving the carpus proximal to them.
export function handBones() {
  const bones = [];
  for (const f of FINGERS) {
    const [a, b, c, d] = f.chain;
    if (f.key === 'thumb') {
      bones.push({ from: a, to: b, name: 'Metacarpal I', w: 0.17 });
      bones.push({ from: b, to: c, name: 'Proximal phalanx (thumb)', w: 0.15 });
      bones.push({ from: c, to: d, name: 'Distal phalanx (thumb)', w: 0.13 });
    } else {
      bones.push({ from: 0, to: a, startT: 0.30, name: `Metacarpal ${f.roman}`, w: 0.14 });
      bones.push({ from: a, to: b, name: `Proximal phalanx (${f.name.toLowerCase()})`, w: 0.13 });
      bones.push({ from: b, to: c, name: `Middle phalanx (${f.name.toLowerCase()})`, w: 0.115 });
      bones.push({ from: c, to: d, name: `Distal phalanx (${f.name.toLowerCase()})`, w: 0.10 });
    }
  }
  return bones;
}

// Carpal bones laid out in the wrist frame: u across (+ = radial/thumb side),
// v along the hand (0 = wrist landmark, 1 = mid-MCP line).
export const CARPALS = [
  { name: 'Scaphoid', u: 0.24, v: 0.10, r: 0.085 },
  { name: 'Lunate', u: 0.06, v: 0.09, r: 0.075 },
  { name: 'Triquetrum', u: -0.12, v: 0.10, r: 0.07 },
  { name: 'Pisiform', u: -0.25, v: 0.07, r: 0.05 },
  { name: 'Trapezium', u: 0.32, v: 0.22, r: 0.07 },
  { name: 'Trapezoid', u: 0.17, v: 0.24, r: 0.06 },
  { name: 'Capitate', u: 0.02, v: 0.23, r: 0.08 },
  { name: 'Hamate', u: -0.17, v: 0.22, r: 0.075 },
];

// Finger joints whose flexion is measured: [prev, joint, next, label].
export function handJoints() {
  const out = [];
  for (const f of FINGERS) {
    const [a, b, c, d] = f.chain;
    if (f.key === 'thumb') {
      out.push({ id: 'thumb_mcp', finger: f.name, joint: 'MCP', p: a, j: b, n: c });
      out.push({ id: 'thumb_ip', finger: f.name, joint: 'IP', p: b, j: c, n: d });
    } else {
      out.push({ id: `${f.key}_mcp`, finger: f.name, joint: 'MCP', p: 0, j: a, n: b });
      out.push({ id: `${f.key}_pip`, finger: f.name, joint: 'PIP', p: a, j: b, n: c });
      out.push({ id: `${f.key}_dip`, finger: f.name, joint: 'DIP', p: b, j: c, n: d });
    }
  }
  return out;
}

// ---------------------------------------------------------------- face / skull
// Face-mesh contours (MediaPipe canonical face mesh).
export const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377,
  152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
export const JAW = [234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454];
export const EYE_R = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
export const EYE_L = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
export const LIPS_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
export const NOSE = { bridgeTop: 168, bridge: 6, mid: 197, tip: 1, base: 2, alaR: 98, alaL: 327 };

// Bone labels anchored to surface landmarks. `side` picks the label column
// before mirroring is applied ('r' = subject's right).
export const SKULL_LABELS = [
  { name: 'Frontal bone', lm: 151, side: 'r' },
  { name: 'Parietal bone', lm: 103, side: 'l', lift: 0.25 },
  { name: 'Temporal bone', lm: 127, side: 'r' },
  { name: 'Sphenoid (greater wing)', lm: 54, side: 'r', lift: 0.08 },
  { name: 'Nasal bone', lm: 197, side: 'l' },
  { name: 'Zygomatic bone', lm: 345, side: 'l' },
  { name: 'Orbit', lm: 159, side: 'r' },
  { name: 'Maxilla', lm: 425, side: 'l' },
  { name: 'Teeth', lm: 13, side: 'r' },
  { name: 'Mandible (body)', lm: 172, side: 'r' },
  { name: 'Mandible (ramus)', lm: 361, side: 'l' },
  { name: 'Mental protuberance', lm: 152, side: 'l' },
];

export const BRAIN_LABELS = [
  { name: 'Frontal lobe', lm: 9, side: 'l', lift: 0.32 },
  { name: 'Temporal lobe', lm: 356, side: 'l', lift: 0.05 },
  { name: 'Parietal lobe', lm: 109, side: 'r', lift: 0.3 },
];

// ---------------------------------------------------------------- pose
export const POSE = {
  nose: 0, l_shoulder: 11, r_shoulder: 12, l_elbow: 13, r_elbow: 14, l_wrist: 15, r_wrist: 16,
  l_hip: 23, r_hip: 24, l_knee: 25, r_knee: 26, l_ankle: 27, r_ankle: 28, l_heel: 29, r_heel: 30,
  l_foot: 31, r_foot: 32,
};

// Long-bone segments drawn from pose landmarks (L/R = subject's side).
export const POSE_BONES = [
  { from: 11, to: 12, name: 'Clavicles / shoulder girdle', w: 0.04 },
  { from: 11, to: 13, name: 'L humerus', w: 0.05 }, { from: 12, to: 14, name: 'R humerus', w: 0.05 },
  { from: 13, to: 15, name: 'L radius + ulna', w: 0.04 }, { from: 14, to: 16, name: 'R radius + ulna', w: 0.04 },
  { from: 23, to: 24, name: 'Pelvis', w: 0.06 },
  { from: 23, to: 25, name: 'L femur', w: 0.06 }, { from: 24, to: 26, name: 'R femur', w: 0.06 },
  { from: 25, to: 27, name: 'L tibia + fibula', w: 0.05 }, { from: 26, to: 28, name: 'R tibia + fibula', w: 0.05 },
  { from: 29, to: 31, name: 'L foot', w: 0.035 }, { from: 30, to: 32, name: 'R foot', w: 0.035 },
];

// ---------------------------------------------------------------- muscle actions
// action -> muscles that produce it. `anta` names the action whose muscles may
// instead be working eccentrically when gravity or a load drives this motion.
const B = (p) => ({ grade: 'B', src: OPENSTAX_AP2E.title, page: p });
const U = { grade: 'U', src: 'Standard anatomy - not checked against a source in this build', page: null };

export const MUSCLE_ACTIONS = {
  elbow_flexion: { label: 'Elbow flexion', anta: 'elbow_extension', muscles: [
    { m: 'Biceps brachii', ...B(456) }, { m: 'Brachialis', ...B(456) }, { m: 'Brachioradialis', ...B(456) }] },
  elbow_extension: { label: 'Elbow extension', anta: 'elbow_flexion', muscles: [
    { m: 'Triceps brachii', ...B(456) }, { m: 'Anconeus', ...B(456) }] },
  shoulder_flexion: { label: 'Shoulder flexion', anta: 'shoulder_extension', muscles: [
    { m: 'Deltoid (assists flexion)', ...B(455) }, { m: 'Coracobrachialis', ...B(455) }, { m: 'Biceps brachii', ...B(456) },
    { m: 'Pectoralis major (clavicular head)', ...U }] },
  shoulder_extension: { label: 'Shoulder extension', anta: 'shoulder_flexion', muscles: [
    { m: 'Deltoid (assists extension)', ...B(455) }, { m: 'Latissimus dorsi', ...U }, { m: 'Teres major', ...U }] },
  shoulder_abduction: { label: 'Shoulder abduction', anta: 'shoulder_adduction', muscles: [
    { m: 'Deltoid (major abductor)', ...B(455) }, { m: 'Supraspinatus', ...B(455) }] },
  shoulder_adduction: { label: 'Shoulder adduction', anta: 'shoulder_abduction', muscles: [
    { m: 'Coracobrachialis', ...B(455) }, { m: 'Latissimus dorsi', ...U }, { m: 'Pectoralis major', ...U }] },
  hip_flexion: { label: 'Hip flexion', anta: 'hip_extension', muscles: [
    { m: 'Iliopsoas', ...B(464) }, { m: 'Adductor longus', ...B(465) }, { m: 'Rectus femoris', ...U }] },
  hip_extension: { label: 'Hip extension', anta: 'hip_flexion', muscles: [
    { m: 'Adductor magnus', ...B(465) }, { m: 'Gluteus maximus', ...U }, { m: 'Hamstrings', ...U }] },
  knee_flexion: { label: 'Knee flexion', anta: 'knee_extension', muscles: [
    { m: 'Hamstring group', ...B(467) }, { m: 'Gracilis', ...B(465) }] },
  knee_extension: { label: 'Knee extension', anta: 'knee_flexion', muscles: [
    { m: 'Quadriceps femoris group', ...B(466) }] },
  finger_flexion: { label: 'Finger flexion', anta: 'finger_extension', muscles: [
    { m: 'Flexor digitorum superficialis', ...B(458) }, { m: 'Flexor digitorum profundus', ...B(458) }] },
  finger_extension: { label: 'Finger extension', anta: 'finger_flexion', muscles: [
    { m: 'Extensor digitorum', ...B(458) }] },
};

// Joints measured from the pose model: id -> definition used by kinematics.js.
// kind 'hinge': flexion = 180 - angle(p, j, n).  kind 'shoulder': elevation of
// the arm in the torso frame, split into flexion vs abduction by plane.
export const POSE_JOINTS = [
  { id: 'l_elbow', label: 'L elbow', zone: 'L elbow', kind: 'hinge', p: 11, j: 13, n: 15, action: 'elbow' },
  { id: 'r_elbow', label: 'R elbow', zone: 'R elbow', kind: 'hinge', p: 12, j: 14, n: 16, action: 'elbow' },
  { id: 'l_shoulder', label: 'L shoulder', zone: 'L shoulder', kind: 'shoulder', side: 'l', j: 11, n: 13 },
  { id: 'r_shoulder', label: 'R shoulder', zone: 'R shoulder', kind: 'shoulder', side: 'r', j: 12, n: 14 },
  { id: 'l_hip', label: 'L hip', zone: 'L hip', kind: 'hinge', p: 11, j: 23, n: 25, action: 'hip' },
  { id: 'r_hip', label: 'R hip', zone: 'R hip', kind: 'hinge', p: 12, j: 24, n: 26, action: 'hip' },
  { id: 'l_knee', label: 'L knee', zone: 'L knee', kind: 'hinge', p: 23, j: 25, n: 27, action: 'knee' },
  { id: 'r_knee', label: 'R knee', zone: 'R knee', kind: 'hinge', p: 24, j: 26, n: 28, action: 'knee' },
];

// Published landmark accuracy (model cards, Apache-2.0 bundles). These
// measure landmark placement in the image, NOT joint-angle accuracy.
export const MODEL_ACCURACY = [
  { model: 'Hand landmarker (full)', metric: 'Mean normalised absolute error, % of palm size, 14 regions',
    value: '10.09% ± 1.73% (range 6.10–13.00%)', note: 'Error grows from finger base toward fingertip.',
    src: 'Model Card Hand Tracking (Lite/Full) with Fairness, Oct 2021' },
  { model: 'Face landmarker', metric: 'MAE normalised by inter-ocular distance, tracking mode, 17 regions',
    value: '2.06% – 3.27%', note: 'Human annotator discrepancy: 2.56%.',
    src: 'Model Card MediaPipe Face Mesh V2' },
  { model: 'Pose landmarker (full)', metric: 'PDJ / PCK@0.2, 14 regions',
    value: '91.8% ± 1.4% (range 89.2–94.0%)', note: 'Heavy 94.2%, lite 87.0%.',
    src: 'Model Card BlazePose GHUM 3D' },
];
