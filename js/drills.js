// Drill recognition: finds deliberate repetitions in the live joint-angle
// stream, names the exercise, counts reps, scores each rep against explicit
// form rules, and reports body position.
//
// Two different "accuracies", never mixed:
//   - recognition confidence: how well a movement matches a drill's pattern
//     (which joints must move, which must stay still);
//   - form accuracy: the share of that drill's form rules the rep met.
// The thresholds below are rules set in this app (grade U), shown to the
// user. They are not clinical standards and are not validated (gate V1/V3).

// ------------------------------------------------------------------ channels
export function channels(m) {
  if (!m) return {};
  const c = {};
  const put = (k, v) => { if (v != null && Number.isFinite(v)) c[k] = v; };
  put('neckFlex', m.neck?.flex); put('neckRot', m.neck?.rotL); put('neckSide', m.neck?.sideL);
  put('trunkFlex', m.trunkIncl ?? m.trunk?.flex); put('trunkRot', m.trunk?.rotL); put('trunkSide', m.trunk?.sideL); // trunkFlex = lean vs vertical
  put('lValgus', m.l_valgus); put('rValgus', m.r_valgus);
  if (m.l_heel != null && m.r_heel != null) put('heelRise', (m.l_heel + m.r_heel) / 2);
  if (m.l_footY != null && m.r_footY != null) { put('lFootUp', Math.max(0, m.l_footY - m.r_footY)); put('rFootUp', Math.max(0, m.r_footY - m.l_footY)); }
  put('pelvisObl', m.pelvis?.obliq);
  if (m.l_lift != null && m.r_lift != null) { put('jumpH', Math.min(m.l_lift, m.r_lift)); put('lLift', m.l_lift); put('rLift', m.r_lift); } // cm off the floor, from the image
  for (const k of ['l', 'r']) {
    put(`${k}Elbow`, m[`${k}_elbow`]); put(`${k}Knee`, m[`${k}_knee`]); put(`${k}Ankle`, m[`${k}_ankle`]);
    put(`${k}HipFlex`, m[`${k}_hip`]?.flex); put(`${k}HipAbd`, m[`${k}_hip`]?.abd);
    const sh = m[`${k}_sh`]; if (sh) { const pl = sh.elev >= 30 ? sh.plane : null; put(`${k}ShElev`, sh.elev); put(`${k}ShFlexPlane`, pl === 'flexion' ? sh.elev : 0); put(`${k}ShAbdPlane`, pl === 'abduction' ? sh.elev : 0); } // plane is undefined with the arm near the side
  }
  return c;
}

// ------------------------------------------------------------------ drills
// need:  [channel, min change in degrees] (sign matters: + means the value rises)
// still: [channel, max absolute change allowed]
// checks: form rules on the rep's peak values P (change from start) and peaks of raw values V
const both = (a, b) => (P) => Math.min(P[a] ?? 0, P[b] ?? 0);
const SQUAT_CHECKS = (depth) => [
  { label: `Depth: both knees ≥ ${depth}°`, cue: 'Go deeper: hips down toward knee height', f: (P, V) => [Math.min(V.lKnee, V.rKnee) >= depth, Math.min(V.lKnee, V.rKnee)] },
  { label: 'Knees track over the feet (valgus ≤ 4 cm)', cue: 'Knees caving in: push them out over your toes', f: (P, V) => [Math.max(V.lValgus ?? 0, V.rValgus ?? 0) <= 4, Math.max(V.lValgus ?? 0, V.rValgus ?? 0), ' cm'] },
  { label: 'Left/right knee within 15°', cue: 'Shifting to one side: share weight evenly', f: (P, V) => [Math.abs(V.lKnee - V.rKnee) <= 15, Math.abs(V.lKnee - V.rKnee)] },
  { label: 'Trunk lean ≤ 45°', cue: 'Chest up: too much forward lean', f: (P, V) => [(V.trunkFlex ?? 0) <= 45, V.trunkFlex] },
  { label: 'Heels stay down (≤ 2 cm rise)', cue: 'Heels lifting: sit back, keep heels down', f: (P) => [(P.heelRise ?? 0) <= 2, P.heelRise, ' cm'] },
  { label: 'Pelvis level (≤ 8°)', cue: 'Hips tilting: keep the pelvis level', f: (P, V, A) => [(A.pelvisObl ?? 0) <= 8, A.pelvisObl] },
  { label: 'Tempo 1–6 s per rep', cue: 'Control the tempo', f: (P, V, A, d) => [d >= 1 && d <= 6, d, 's'] },
];
// channels that are quality measures only: they never start a movement event
const NO_EVENT = new Set(['lValgus', 'rValgus', 'lFootUp', 'rFootUp']);
// start threshold per channel (degrees unless named); centimetre channels use small ones
const START_THR = { heelRise: 2.5, jumpH: 3, lLift: 3, rLift: 3 };
export const DRILLS = [
  { id: 'squat', name: 'Squat', need: [['lKnee', 60], ['rKnee', 60], ['lHipFlex', 35], ['rHipFlex', 35]], still: [['lElbow', 40], ['rElbow', 40], ['lHipAbd', 16], ['rHipAbd', 16], ['lShElev', 70], ['rShElev', 70], ['lFootUp', 4], ['rFootUp', 4], ['jumpH', 3]],
    checks: SQUAT_CHECKS(90) },
  { id: 'jump', name: 'Vertical jump', need: [['jumpH', 6]], still: [['lShElev', 70], ['rShElev', 70], ['lHipAbd', 15], ['rHipAbd', 15], ['lFootUp', 8], ['rFootUp', 8], ['lKnee', 75], ['rKnee', 75]],
    checks: [
      { label: 'Height ≥ 10 cm', cue: 'Drive up harder through the floor', f: (P) => [P.jumpH >= 10, P.jumpH, ' cm'] },
      { label: 'Both feet leave together (≤ 5 cm apart)', cue: 'Take off from both feet at once', f: (P) => [Math.abs((P.lLift ?? 0) - (P.rLift ?? 0)) <= 5, Math.abs((P.lLift ?? 0) - (P.rLift ?? 0)), ' cm'] },
      { label: 'Soft landing: knees bend ≥ 20°', cue: 'Land softly, bend the knees', f: (P) => [Math.min(P.lKnee ?? 0, P.rKnee ?? 0) >= 20, Math.min(P.lKnee ?? 0, P.rKnee ?? 0)] },
      { label: 'Knees track over the feet (valgus ≤ 4 cm)', cue: 'Knees caving in on landing: push them out', f: (P, V, A) => [Math.max(A.lValgus ?? 0, A.rValgus ?? 0) <= 4, Math.max(A.lValgus ?? 0, A.rValgus ?? 0), ' cm'] },
    ] },
  { id: 'squat_jump', name: 'Squat jump', need: [['jumpH', 6], ['lKnee', 75], ['rKnee', 75]], still: [['lShElev', 70], ['rShElev', 70], ['lFootUp', 8], ['rFootUp', 8]],
    checks: [
      { label: 'Squat depth: knees ≥ 80°', cue: 'Sink deeper before you jump', f: (P) => [Math.min(P.lKnee, P.rKnee) >= 80, Math.min(P.lKnee, P.rKnee)] },
      { label: 'Height ≥ 12 cm', cue: 'Explode up', f: (P) => [P.jumpH >= 12, P.jumpH, ' cm'] },
      { label: 'Both feet leave together (≤ 5 cm apart)', cue: 'Take off from both feet at once', f: (P) => [Math.abs((P.lLift ?? 0) - (P.rLift ?? 0)) <= 5, Math.abs((P.lLift ?? 0) - (P.rLift ?? 0)), ' cm'] },
    ] },
  { id: 'sumo_squat', name: 'Wide-stance (sumo) squat', need: [['lKnee', 55], ['rKnee', 55], ['lHipAbd', 18], ['rHipAbd', 18]], still: [['lElbow', 40], ['rElbow', 40], ['lShElev', 70], ['rShElev', 70], ['lFootUp', 4], ['rFootUp', 4]],
    checks: SQUAT_CHECKS(80) },
  { id: 'overhead_squat', name: 'Overhead squat', need: [['lKnee', 55], ['rKnee', 55], ['lShElev', 110], ['rShElev', 110]], still: [],
    checks: [...SQUAT_CHECKS(80), { label: 'Arms stay overhead (≥ 150°)', cue: 'Keep your arms up by your ears', f: (P, V) => [Math.min(V.lShElev, V.rShElev) >= 150, Math.min(V.lShElev, V.rShElev)] }] },
  { id: 'calf_raise', name: 'Calf raise (heel rise)', need: [['heelRise', 3]], still: [['lKnee', 15], ['rKnee', 15], ['lHipFlex', 15], ['rHipFlex', 15]],
    checks: [
      { label: 'Heels rise ≥ 5 cm', cue: 'Rise higher onto the balls of your feet', f: (P) => [P.heelRise >= 5, P.heelRise, ' cm'] },
      { label: 'Knees straight (≤ 10°)', cue: 'Keep your knees straight', f: (P, V) => [Math.max(V.lKnee ?? 0, V.rKnee ?? 0) <= 10, Math.max(V.lKnee ?? 0, V.rKnee ?? 0)] },
      { label: 'Controlled tempo (≥ 1 s)', cue: 'Slow down, control the lowering', f: (P, V, A, d) => [d >= 1, d, 's'] },
    ] },
  { id: 'lunge', name: 'Lunge / split squat', need: [['lKnee', 50], ['rKnee', 50]], still: [], asym: [['lHipFlex', 'rHipFlex', 25]],
    checks: [
      { label: 'Front knee ≥ 80°', cue: 'Lower further, front thigh toward parallel', f: (P, V) => [Math.max(V.lKnee, V.rKnee) >= 80, Math.max(V.lKnee, V.rKnee)] },
      { label: 'Trunk upright (≤ 20°)', cue: 'Chest up, stay tall', f: (P, V) => [(V.trunkFlex ?? 0) <= 20, V.trunkFlex] },
      { label: 'No side lean (≤ 10°)', cue: 'Keep your trunk centred', f: (P, V, A) => [(A.trunkSide ?? 0) <= 10, A.trunkSide] },
      { label: 'Knee tracks over the foot (valgus ≤ 4 cm)', cue: 'Front knee is caving in: push it out over your toes', f: (P, V) => [Math.max(V.lValgus ?? 0, V.rValgus ?? 0) <= 4, Math.max(V.lValgus ?? 0, V.rValgus ?? 0), ' cm'] },
    ] },
  ...['l', 'r'].flatMap((k) => {
    const o = k === 'l' ? 'r' : 'l', S = k === 'l' ? 'Left' : 'Right';
    return [
      { id: `${k}_sl_squat`, name: `${S} single-leg squat`, need: [[`${k}Knee`, 40], [`${o}FootUp`, 6]], still: [],
        checks: [
          { label: 'Knee ≥ 60°', cue: 'Bend the standing knee further', f: (P, V) => [V[`${k}Knee`] >= 60, V[`${k}Knee`]] },
          { label: 'Knee tracks over the foot (valgus ≤ 4 cm)', cue: 'Standing knee caving in: push it out', f: (P, V) => [(V[`${k}Valgus`] ?? 0) <= 4, V[`${k}Valgus`], ' cm'] },
          { label: 'Pelvis level (≤ 10°)', cue: 'Hip dropping: lift the free-side hip', f: (P, V, A) => [(A.pelvisObl ?? 0) <= 10, A.pelvisObl] },
          { label: 'Trunk lean ≤ 40°', cue: 'Stay taller through the chest', f: (P, V) => [(V.trunkFlex ?? 0) <= 40, V.trunkFlex] },
        ] },
      { id: `${k}_lat_lunge`, name: `${S} lateral (side) lunge`, need: [[`${k}Knee`, 50], [`${o}HipAbd`, 18]], still: [[`${o}Knee`, 25]],
        checks: [
          { label: 'Working knee ≥ 70°', cue: 'Sit deeper into the working hip', f: (P, V) => [V[`${k}Knee`] >= 70, V[`${k}Knee`]] },
          { label: 'Straight leg stays straight (≤ 15°)', cue: 'Keep the trailing leg straight', f: (P, V) => [(V[`${o}Knee`] ?? 0) <= 15, V[`${o}Knee`]] },
          { label: 'Chest up (lean ≤ 40°)', cue: 'Chest up', f: (P, V) => [(V.trunkFlex ?? 0) <= 40, V.trunkFlex] },
        ] },
      { id: `${k}_hop`, name: `${S} single-leg hop`, need: [[`${k}Lift`, 4], [`${o}FootUp`, 6]], still: [],
        checks: [
          { label: 'Hop height ≥ 5 cm', cue: 'Push off harder from the standing foot', f: (P) => [(P[`${k}Lift`] ?? 0) >= 5, P[`${k}Lift`], ' cm'] },
          { label: 'Pelvis level (≤ 10°)', cue: 'Keep the hips level', f: (P, V, A) => [(A.pelvisObl ?? 0) <= 10, A.pelvisObl] },
          { label: 'Soft landing: knee bends ≥ 15°', cue: 'Land softly on the hopping leg', f: (P) => [(P[`${k}Knee`] ?? 0) >= 15, P[`${k}Knee`]] },
        ] },
      { id: `${k}_march`, name: `${S} hip march (knee lift)`, need: [[`${k}HipFlex`, 50], [`${k}Knee`, 45]], still: [[`${o}HipFlex`, 15], [`${o}Knee`, 20], ['trunkFlex', 20]],
        checks: [
          { label: 'Hip flexion ≥ 80°', f: (P, V) => [V[`${k}HipFlex`] >= 80, V[`${k}HipFlex`]] },
          { label: 'Standing knee straight (≤ 15°)', f: (P, V) => [(V[`${o}Knee`] ?? 0) <= 15, V[`${o}Knee`]] },
          { label: 'Trunk upright (≤ 15°)', f: (P, V, A) => [(A.trunkFlex ?? 0) <= 15, A.trunkFlex] },
          { label: 'Pelvis level (≤ 8°)', f: (P, V, A) => [(A.pelvisObl ?? 0) <= 8, A.pelvisObl] },
        ] },
      { id: `${k}_curl_leg`, name: `${S} hamstring curl (heel to buttock)`, need: [[`${k}Knee`, 70]], still: [[`${k}HipFlex`, 30], [`${o}Knee`, 20], [`${o}HipFlex`, 20]],
        checks: [
          { label: 'Knee flexion ≥ 100°', f: (P, V) => [V[`${k}Knee`] >= 100, V[`${k}Knee`]] },
          { label: 'Thigh stays vertical (hip ≤ 20°)', f: (P, V) => [Math.abs(V[`${k}HipFlex`] ?? 0) <= 20, V[`${k}HipFlex`]] },
          { label: 'Pelvis level (≤ 8°)', f: (P, V, A) => [(A.pelvisObl ?? 0) <= 8, A.pelvisObl] },
        ] },
      { id: `${k}_hip_abd`, name: `${S} standing hip abduction`, need: [[`${k}HipAbd`, 18]], still: [[`${k}Knee`, 20], [`${o}HipAbd`, 10], [`${k}HipFlex`, 25], [`${o}Knee`, 20]],
        checks: [
          { label: 'Abduction ≥ 30°', f: (P, V) => [V[`${k}HipAbd`] >= 30, V[`${k}HipAbd`]] },
          { label: 'Knee straight (≤ 15°)', f: (P, V) => [(V[`${k}Knee`] ?? 0) <= 15, V[`${k}Knee`]] },
          { label: 'No trunk side lean (≤ 10°)', f: (P, V, A) => [(A.trunkSide ?? 0) <= 10, A.trunkSide] },
        ] },
      { id: `${k}_bicep_curl`, name: `${S} elbow curl`, need: [[`${k}Elbow`, 70]], still: [[`${k}ShElev`, 20], ['trunkFlex', 12], [`${o}Elbow`, 25]],
        checks: [
          { label: 'Elbow range ≥ 110°', f: (P) => [P[`${k}Elbow`] >= 110, P[`${k}Elbow`]] },
          { label: 'Upper arm still (≤ 15° change)', f: (P, V, A) => [(A[`${k}ShElev`] ?? 0) <= 15, A[`${k}ShElev`]] },
          { label: 'No body swing (trunk ≤ 10°)', f: (P, V, A) => [(A.trunkFlex ?? 0) <= 10, A.trunkFlex] },
        ] },
      { id: `${k}_sh_flex`, name: `${S} front raise (shoulder flexion)`, need: [[`${k}ShFlexPlane`, 80]], still: [[`${o}ShElev`, 25], [`${k}Elbow`, 30]],
        checks: [
          { label: 'Elevation ≥ 150°', f: (P, V) => [V[`${k}ShElev`] >= 150, V[`${k}ShElev`]] },
          { label: 'Elbow straight (≤ 20°)', f: (P, V) => [(V[`${k}Elbow`] ?? 0) <= 20, V[`${k}Elbow`]] },
          { label: 'No back arch (trunk ext ≤ 10°)', f: (P, V) => [-(V.trunkFlex ?? 0) <= 10, -(V.trunkFlex ?? 0)] },
        ] },
      { id: `${k}_sh_abd`, name: `${S} side raise (shoulder abduction)`, need: [[`${k}ShAbdPlane`, 80]], still: [[`${o}ShElev`, 25], [`${k}Elbow`, 30]],
        checks: [
          { label: 'Elevation ≥ 150°', f: (P, V) => [V[`${k}ShElev`] >= 150, V[`${k}ShElev`]] },
          { label: 'Elbow straight (≤ 20°)', f: (P, V) => [(V[`${k}Elbow`] ?? 0) <= 20, V[`${k}Elbow`]] },
          { label: 'No trunk side lean (≤ 10°)', f: (P, V, A) => [(A.trunkSide ?? 0) <= 10, A.trunkSide] },
        ] },
    ];
  }),
  { id: 'both_curl', name: 'Elbow curl, both arms', need: [['lElbow', 70], ['rElbow', 70]], still: [['lShElev', 20], ['rShElev', 20], ['trunkFlex', 12]],
    checks: [
      { label: 'Elbow range ≥ 110° (both)', f: (P) => [Math.min(P.lElbow, P.rElbow) >= 110, Math.min(P.lElbow, P.rElbow)] },
      { label: 'Left/right within 15°', f: (P) => [Math.abs(P.lElbow - P.rElbow) <= 15, Math.abs(P.lElbow - P.rElbow)] },
      { label: 'Upper arms still (≤ 15° change)', f: (P, V, A) => [Math.max(A.lShElev ?? 0, A.rShElev ?? 0) <= 15, Math.max(A.lShElev ?? 0, A.rShElev ?? 0)] },
      { label: 'No body swing (trunk ≤ 10°)', f: (P, V, A) => [(A.trunkFlex ?? 0) <= 10, A.trunkFlex] },
    ] },
  { id: 'both_raise', name: 'Overhead raise, both arms', need: [['lShElev', 100], ['rShElev', 100]], still: [['lHipAbd', 12], ['rHipAbd', 12], ['lKnee', 25], ['rKnee', 25]],
    checks: [
      { label: 'Both arms ≥ 150°', f: (P, V) => [Math.min(V.lShElev, V.rShElev) >= 150, Math.min(V.lShElev, V.rShElev)] },
      { label: 'Left/right within 15°', f: (P, V) => [Math.abs(V.lShElev - V.rShElev) <= 15, Math.abs(V.lShElev - V.rShElev)] },
      { label: 'No back arch (trunk ext ≤ 10°)', f: (P, V) => [-(V.trunkFlex ?? 0) <= 10, -(V.trunkFlex ?? 0)] },
    ] },
  { id: 'jumping_jack', name: 'Jumping jack', need: [['lShElev', 90], ['rShElev', 90], ['lHipAbd', 12], ['rHipAbd', 12]], still: [],
    checks: [
      { label: 'Arms ≥ 140°', f: (P, V) => [Math.min(V.lShElev, V.rShElev) >= 140, Math.min(V.lShElev, V.rShElev)] },
      { label: 'Legs apart (hip abduction ≥ 15°)', f: (P, V) => [Math.min(V.lHipAbd, V.rHipAbd) >= 15, Math.min(V.lHipAbd, V.rHipAbd)] },
      { label: 'Rhythm ≤ 2 s per rep', f: (P, V, A, d) => [d <= 2, d, 's'] },
    ] },
  { id: 'trunk_flex', name: 'Forward bend (trunk flexion)', need: [['trunkFlex', 40]], still: [['lKnee', 25], ['rKnee', 25]],
    checks: [
      { label: 'Trunk flexion ≥ 60°', f: (P, V) => [V.trunkFlex >= 60, V.trunkFlex] },
      { label: 'Knees straight (≤ 15°)', f: (P, V) => [Math.max(V.lKnee ?? 0, V.rKnee ?? 0) <= 15, Math.max(V.lKnee ?? 0, V.rKnee ?? 0)] },
      { label: 'No twist (rotation ≤ 10°)', f: (P, V, A) => [(A.trunkRot ?? 0) <= 10, A.trunkRot] },
    ] },
  { id: 'trunk_side', name: 'Side bend (trunk)', need: [['trunkSide', 15]], absNeed: true, still: [['trunkFlex', 20], ['trunkRot', 15], ['lKnee', 25], ['rKnee', 25]],
    checks: [
      { label: 'Side bend ≥ 25°', f: (P, V, A) => [A.trunkSide >= 25, A.trunkSide] },
      { label: 'No forward bend (≤ 15°)', f: (P, V, A) => [(A.trunkFlex ?? 0) <= 15, A.trunkFlex] },
      { label: 'No twist (≤ 10°)', f: (P, V, A) => [(A.trunkRot ?? 0) <= 10, A.trunkRot] },
    ] },
  { id: 'trunk_rot', name: 'Trunk rotation', need: [['trunkRot', 18]], absNeed: true, still: [['trunkFlex', 20], ['trunkSide', 15], ['pelvisObl', 10]],
    checks: [
      { label: 'Rotation ≥ 30°', f: (P, V, A) => [A.trunkRot >= 30, A.trunkRot] },
      { label: 'Stays upright (flexion ≤ 15°)', f: (P, V, A) => [(A.trunkFlex ?? 0) <= 15, A.trunkFlex] },
    ] },
  { id: 'neck_rot', name: 'Neck rotation', need: [['neckRot', 30]], absNeed: true, still: [['trunkRot', 12], ['trunkFlex', 12]],
    checks: [
      { label: 'Rotation ≥ 60°', f: (P, V, A) => [A.neckRot >= 60, A.neckRot] },
      { label: 'Shoulders still (trunk ≤ 10°)', f: (P, V, A) => [(A.trunkRot ?? 0) <= 10, A.trunkRot] },
    ] },
  { id: 'neck_flex', name: 'Neck flexion / extension', need: [['neckFlex', 20]], absNeed: true, still: [['trunkFlex', 12], ['neckRot', 20]],
    checks: [
      { label: 'Range ≥ 35°', f: (P, V, A) => [A.neckFlex >= 35, A.neckFlex] },
      { label: 'Trunk still (≤ 10°)', f: (P, V, A) => [(A.trunkFlex ?? 0) <= 10, A.trunkFlex] },
    ] },
  { id: 'neck_side', name: 'Neck side bend', need: [['neckSide', 15]], absNeed: true, still: [['trunkSide', 10], ['neckRot', 20]],
    checks: [
      { label: 'Side bend ≥ 30°', f: (P, V, A) => [A.neckSide >= 30, A.neckSide] },
      { label: 'Trunk still (≤ 10°)', f: (P, V, A) => [(A.trunkSide ?? 0) <= 10, A.trunkSide] },
    ] },
];

// ------------------------------------------------------------------ body position
export function bodyPosition(W, m, vis = null) {
  if (!W || !W[11] || !W[23]) return null;
  const seen = (...ids) => !vis || ids.every((i) => (vis[i] ?? 0) > 0.5);
  if (!seen(11, 12, 23, 24)) return seen(11, 12) ? 'upper body only in view' + (m.l_sh && m.r_sh ? '' : '') : 'body not in view';
  const legs = seen(25, 26, 27, 28);
  const v = (a, b) => W[a].clone().sub(W[b]);
  const up = W[11].clone().add(W[12]).sub(W[23]).sub(W[24]).normalize();
  const lat = v(11, 12).normalize();
  const fwd = lat.clone().cross(up).normalize();
  const camDir = W.__cam || null; // set by caller: unit vector toward the camera in atlas axes
  const parts = [];
  if (Math.abs(up.y) < 0.5) parts.push('lying');
  else {
    const lk = m.l_knee ?? 0, rk = m.r_knee ?? 0, lh = m.l_hip?.flex ?? 0, rh = m.r_hip?.flex ?? 0;
    const ankleDy = W[27] && W[28] ? W[27].y - W[28].y : 0;
    if (!legs) parts.push('legs not in view');
    else if (Math.abs(ankleDy) > 0.08) parts.push(`single-leg stance (${ankleDy > 0 ? 'right' : 'left'} leg)`);
    else if (lk > 70 && rk > 70 && lh > 60 && rh > 60) parts.push('seated / deep squat');
    else if (lk > 75 && rk > 75 && lh < 35 && rh < 35) parts.push('kneeling');
    else if (lk > 35 || rk > 35) parts.push('standing, knees bent');
    else parts.push('standing');
  }
  if (camDir) {
    const f = fwd.dot(camDir);
    parts.push(Math.abs(f) > 0.8 ? (f > 0 ? 'facing camera' : 'back to camera') : Math.abs(f) < 0.45 ? 'side-on' : 'turned');
  }
  const le = m.l_sh?.elev, re = m.r_sh?.elev;
  if (le != null && re != null) parts.push(le > 140 && re > 140 ? 'arms overhead' : le > 140 || re > 140 ? 'one arm overhead' : le < 30 && re < 30 ? 'arms at sides' : 'arms raised');
  return parts.join(' · ');
}

// ------------------------------------------------------------------ recognizer
export class DrillRecognizer {
  constructor(onRep) {
    this.hist = []; this.base = {}; this.state = {}; this.onRep = onRep; this.lastEvent = -1;
    this.session = new Map(); this.reps = [];
  }
  reset() { this.hist = []; this.base = {}; this.state = {}; this.session.clear(); this.reps = []; }

  push(t, ch, position) {
    this.hist.push({ t, ch, position });
    while (this.hist.length && t - this.hist[0].t > 12) this.hist.shift();
    // per-channel baselines: settle on the value when the channel is still
    for (const [k, x] of Object.entries(ch)) {
      const s = (this.state[k] ||= { phase: 'rest', start: null, peakDev: 0, stillT: t, last: x, lastT: t });
      const vel = Math.abs((x - s.last) / Math.max(1e-3, t - s.lastT)); s.last = x; s.lastT = t;
      if (this.base[k] == null) this.base[k] = x;
      const dev = x - this.base[k];
      const thrIn = START_THR[k] ?? 12, small = thrIn < 5;
      if (s.phase === 'rest') {
        if (vel < (small ? 4 : 20)) { if (t - s.stillT > 0.4) this.base[k] += 0.15 * (x - this.base[k]); } else s.stillT = t;
        if (!NO_EVENT.has(k) && Math.abs(dev) > thrIn) { s.phase = 'out'; s.start = t; s.peakDev = dev; }
      } else {
        if (Math.abs(dev) > Math.abs(s.peakDev)) s.peakDev = dev;
        if (Math.abs(dev) < Math.max(small ? 1.2 : 6, Math.abs(s.peakDev) * 0.3)) { s.phase = 'rest'; s.stillT = t; this._channelDone(k, s.start, t); }
        else if (t - s.start > 10) { s.phase = 'rest'; this.base[k] = x; } // a held position, not a rep
      }
    }
  }

  _channelDone(k, t0, t1) {
    // group channels that finished together into one movement event
    clearTimeout(this._timer);
    this._pending = this._pending || { t0, t1, chans: new Set() };
    this._pending.t0 = Math.min(this._pending.t0, t0); this._pending.t1 = Math.max(this._pending.t1, t1); this._pending.chans.add(k);
    this._flushAt = t1 + 0.35;
    if (!this._deferred) { this._deferred = true; }
  }

  tick(t) {
    if (!this._pending || t < this._flushAt) return;
    // wait while any joint that started moving during this event is still out
    const P = this._pending;
    const busy = Object.values(this.state).some((s) => s.phase === 'out' && s.start >= P.t0 - 0.3 && s.start <= P.t1 + 0.3); // a movement that starts right after (e.g. take-off after the crouch) belongs to the same event
    if (busy && t - P.t1 < 1.2) return; // short grace, so a joint that never fully returns cannot hold the event open
    const e = this._pending; this._pending = null; this._deferred = false; this._event(e);
  }

  _event(e) {
    if (e.t1 - e.t0 < (e.chans.has('jumpH') ? 0.15 : 0.35)) return; // too quick to be a deliberate repetition (a hop's flight can be short)
    const win = this.hist.filter((h) => h.t >= e.t0 - 0.2 && h.t <= e.t1 + 0.05); if (win.length < 5) return;
    const keys = new Set(); win.forEach((h) => Object.keys(h.ch).forEach((k) => keys.add(k)));
    const P = {}, A = {}, V = {}; // signed peak change, absolute peak change, raw value at the main peak
    const first = win[0].ch;
    for (const k of keys) {
      let best = 0, bestV = null;
      for (const h of win) { const x = h.ch[k]; if (x == null) continue; const d = x - (this.base[k] ?? first[k] ?? x); if (Math.abs(d) > Math.abs(best)) { best = d; bestV = x; } }
      P[k] = best; A[k] = Math.abs(best); V[k] = bestV;
    }
    // classify
    const scored = DRILLS.map((D) => {
      const nf = D.need.map(([c, min]) => { const v = D.absNeed ? A[c] : P[c]; return v == null ? 0 : Math.max(0, Math.min(1, v / min)); });
      let needScore = nf.length ? Math.min(...nf) : 0;
      if (D.asym) for (const [a, b, d] of D.asym) needScore = Math.min(needScore, Math.max(0, Math.min(1, Math.abs((P[a] ?? 0) - (P[b] ?? 0)) / d)));
      const sf = D.still.map(([c, max]) => (A[c] == null ? 1 : A[c] <= max ? 1 : Math.max(0, 1 - (A[c] - max) / max)));
      const stillScore = sf.length ? sf.reduce((x, y) => x + y, 0) / sf.length : 1;
      return { D, score: needScore >= 0.999 ? 0.7 + 0.3 * stillScore : needScore * 0.6 * stillScore };
    }).sort((a, b) => b.score - a.score);
    const best = scored[0], second = scored[1];
    const dur = e.t1 - e.t0;
    const position = win[Math.floor(win.length / 2)].position;
    if (!best || best.score < 0.7) { this._emit({ t: e.t1, name: 'Unclassified movement', id: null, conf: best?.score ?? 0, dur, position, checks: [], form: null, chans: [...e.chans] }); return; }
    const checks = best.D.checks.map((c) => { const [pass, val, unit] = c.f(P, V, A, dur); return { label: c.label, pass: !!pass, val, unit: unit || '°', cue: c.cue || null }; });
    const form = Math.round((100 * checks.filter((c) => c.pass).length) / Math.max(1, checks.length));
    this._emit({ t: e.t1, name: best.D.name, id: best.D.id, conf: best.score, margin: best.score - (second?.score ?? 0), dur, position, checks, form, P, V });
  }

  _emit(rep) {
    this.reps.push(rep);
    if (rep.id) {
      const s = this.session.get(rep.id) || { name: rep.name, reps: 0, formSum: 0, confSum: 0, positions: new Map() };
      s.reps++; s.formSum += rep.form; s.confSum += rep.conf; s.positions.set(rep.position, (s.positions.get(rep.position) || 0) + 1);
      this.session.set(rep.id, s);
    }
    this.onRep?.(rep);
  }
}
