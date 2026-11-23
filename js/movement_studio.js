// Movement studio 4D (Motion Lab): the BodyParts3D skeleton twin performs every base movement of the owner's
// Training System (Anatomy_Map, 90 rows) in any body position, on a treatment plinth or a steel dissection table,
// with each muscle coloured by its role: agonist (prime mover), synergist, stabiliser, antagonist.
//
// Sources, shown on screen:
//  - prime movers / synergists / stabilisers: the workbook's Anatomy_Map row, matched to BodyParts3D muscle names
//    by tools/training_system_build.py (links.muscles). Unmatched words are listed, not guessed.
//  - antagonists: the opposite joint action of each agonist group (pairing as in anatomy_maps.js MUSCLE_ACTIONS,
//    OpenStax A&P 2e ch. 11 for elbow / shoulder / hip / knee; other pairs are standard anatomy, marked U).
//  - concentric / eccentric: from the geometry of THIS pose and position (does the moving part rise against gravity,
//    fall with it, or move across it), recomputed when the position changes.
// The animation is schematic: start and end angles follow the workbook's 'Joint angles & range' text; the rig has
// no scapula, finger, subtalar or segmental-spine joints, so those movements are shown as positions with roles.
import * as THREE from 'three';
import { labState, labHooks } from './motion_lab.js';
import { poseMatrices, posedPoint, LUMBOPELVIC_ALPHA } from './rig.js';
import { GROUPS as BIO_GROUPS } from './biomech.js';
import { initExtras, applyExtras, clearExtras, buildSkin, applySkin } from './rig_extras.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------- muscle groups (agonist group -> antagonist group)
const U = 'U';
const GROUPS = {
  ...Object.fromEntries(Object.entries(BIO_GROUPS).map(([k, v]) => [k, { ...v, grade: ['elbow_flexors', 'elbow_extensors', 'sh_flexors', 'sh_extensors', 'sh_abductors', 'sh_adductors', 'hip_flexors', 'hip_extensors', 'knee_flexors', 'knee_extensors'].includes(k) ? 'B' : U }])),
  sh_ext_rotators: { label: 'Shoulder external rotators (infraspinatus, teres minor)', re: /infraspinatus|teres minor/, grade: U },
  sh_int_rotators: { label: 'Shoulder internal rotators (subscapularis, teres major, pectoralis major)', re: /subscapularis|teres major|pectoralis major/, grade: U },
  hip_ext_rotators: { label: 'Hip external rotators (piriformis, gemelli, obturators, quadratus femoris)', re: /piriformis|gemellus|obturator|quadratus femoris/, grade: U },
  hip_int_rotators: { label: 'Hip internal rotators (gluteus medius/minimus anterior fibres, TFL)', re: /gluteus minimus|tensor fasciae latae/, grade: U },
  wrist_flexors: { label: 'Wrist flexors', re: /flexor carpi|palmaris longus/, grade: U }, wrist_extensors: { label: 'Wrist extensors', re: /extensor carpi/, grade: U },
  neck_flexors: { label: 'Neck flexors (SCM, longus colli/capitis, scalenes)', re: /sternocleidomastoid|longus colli|longus capitis|scalenus/, grade: U },
  neck_extensors: { label: 'Neck extensors (splenius, semispinalis, longissimus capitis)', re: /splenius|semispinalis c|longissimus capitis/, grade: U },
  invertors: { label: 'Foot invertors (tibialis anterior/posterior)', re: /tibialis anterior|tibialis posterior/, grade: U }, evertors: { label: 'Foot evertors (fibularis)', re: /fibularis/, grade: U },
  trunk_rotators: { label: 'Trunk rotators (obliques)', re: /external oblique|internal oblique/, grade: U }, trunk_lat: { label: 'Trunk lateral flexors (obliques, quadratus lumborum)', re: /external oblique|internal oblique|quadratus lumborum/, grade: U },
  pronators: { label: 'Forearm pronators', re: /pronator/, grade: U }, supinators: { label: 'Forearm supinators', re: /supinator|biceps brachii/, grade: U },
  scap_protractors: { label: 'Scapular protractors (serratus anterior, pectoralis minor)', re: /serratus anterior|pectoralis minor/, grade: U },
  scap_retractors: { label: 'Scapular retractors (rhomboids, middle trapezius)', re: /rhomboid|transverse part of trapezius/, grade: U },
  finger_flexors: { label: 'Finger flexors', re: /flexor digitorum superficialis|flexor digitorum profundus|flexor pollicis/, grade: 'B' }, finger_extensors: { label: 'Finger extensors', re: /extensor digitorum$|extensor indicis|extensor pollicis/, grade: 'B' },
};
const OPP = { hip_flexors: 'hip_extensors', hip_abductors: 'hip_adductors', knee_extensors: 'knee_flexors', plantarflexors: 'dorsiflexors', trunk_extensors: 'trunk_flexors', sh_flexors: 'sh_extensors',
  sh_abductors: 'sh_adductors', elbow_flexors: 'elbow_extensors', sh_ext_rotators: 'sh_int_rotators', hip_ext_rotators: 'hip_int_rotators', wrist_flexors: 'wrist_extensors', neck_flexors: 'neck_extensors',
  invertors: 'evertors', pronators: 'supinators', scap_protractors: 'scap_retractors', finger_flexors: 'finger_extensors', trunk_lat: 'trunk_lat', trunk_rotators: 'trunk_rotators' };
Object.entries({ ...OPP }).forEach(([a, b]) => { if (!OPP[b]) OPP[b] = a; });
export const ROLE = { ag: ['Agonist (prime mover)', '#ff4d5e'], syn: ['Synergist', '#ffb347'], stab: ['Stabiliser', '#4fc3ff'], ant: ['Antagonist', '#b07cff'] };

// ---------------------------------------------------------------- positions
// orient: whole-body rotation; base: joint angles the position needs; on: 'bed' | 'floor' | 'bar'
export const POSITIONS = {
  standing: { label: 'Standing', orient: 'none', base: {}, on: 'floor' },
  supine: { label: 'Supine (lying on the back)', orient: 'supine', base: {}, on: 'bed' },
  hooklying: { label: 'Hook-lying (supine, knees bent)', orient: 'supine', base: { lHipFlex: 50, rHipFlex: 50, lKnee: 95, rKnee: 95, lAnkle: 10, rAnkle: 10 }, on: 'bed' },
  prone: { label: 'Prone (lying face down)', orient: 'prone', base: { lAnkle: -30, rAnkle: -30 }, on: 'bed' },
  side_r: { label: 'Side-lying on the right side', orient: 'side_r', base: { rHipFlex: 30, rKnee: 45 }, on: 'bed' },
  side_l: { label: 'Side-lying on the left side', orient: 'side_l', base: { lHipFlex: 30, lKnee: 45 }, on: 'bed' },
  seated: { label: 'Seated (edge of the table)', orient: 'none', base: { lHipFlex: 90, rHipFlex: 90, lKnee: 90, rKnee: 90 }, on: 'bed', sit: true },
  longsit: { label: 'Long-sitting (legs out on the table)', orient: 'none', base: { lHipFlex: 90, rHipFlex: 90 }, on: 'bed' },
  quadruped: { label: 'Quadruped (hands and knees)', orient: 'prone', base: { lHipFlex: 90, rHipFlex: 90, lKnee: 90, rKnee: 90, lShFlex: 90, rShFlex: 90, lAnkle: -40, rAnkle: -40 }, on: 'bed' },
  plank: { label: 'Forearm plank', orient: 'prone', base: { lShFlex: 90, rShFlex: 90, lElbow: 90, rElbow: 90 }, on: 'bed' },
  kneeling: { label: 'Tall-kneeling', orient: 'none', base: { lKnee: 90, rKnee: 90, lAnkle: -40, rAnkle: -40 }, on: 'bed' },
  halfkneel: { label: 'Half-kneeling (right knee down)', orient: 'none', base: { lHipFlex: 90, lKnee: 90, rKnee: 90, rAnkle: -40 }, on: 'floor' },
  hang: { label: 'Hanging from a bar', orient: 'none', base: { lShFlex: 175, rShFlex: 175 }, on: 'bar' },
};

// ---------------------------------------------------------------- the 90 base movements
const b = (o) => Object.fromEntries(Object.entries(o).flatMap(([k, v]) => [[`l${k}`, v], [`r${k}`, v]]));
const l = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [`l${k}`, v]));
const r = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [`r${k}`, v]));
// [base movement, position, side, agonist groups, start pose A, end pose B, note]
const MOVES = [
  ['Squat', 'standing', 'both', ['hip_extensors', 'knee_extensors'], {}, { ...b({ HipFlex: 85, Knee: 120, Ankle: 35 }), trunkFlex: 40 }],
  ['Hip hinge', 'standing', 'both', ['hip_extensors', 'trunk_extensors'], {}, { ...b({ HipFlex: -5, Knee: 20, Ankle: 15 }), trunkFlex: 85 }],
  ['Split squat / lunge', 'standing', 'l', ['hip_extensors', 'knee_extensors'], {}, { ...l({ HipFlex: 80, Knee: 95, Ankle: 20 }), ...r({ HipFlex: -20, Knee: 85, Ankle: -10 }) }],
  ['Step-up / step-down', 'standing', 'l', ['hip_extensors', 'knee_extensors'], {}, l({ HipFlex: 75, Knee: 85, Ankle: 10 })],
  ['Calf raise / ankle complex', 'standing', 'both', ['plantarflexors'], b({ Ankle: 15 }), b({ Ankle: -45 })],
  ['Hip abduction / adduction', 'side_r', 'l', ['hip_abductors'], {}, l({ HipAbd: 40 })],
  ['Hamstring curl / Nordic', 'prone', 'both', ['knee_flexors'], {}, b({ Knee: 120 })],
  ['Jump and land', 'standing', 'both', ['hip_extensors', 'knee_extensors', 'plantarflexors'], { ...b({ HipFlex: 60, Knee: 90, Ankle: 30 }), trunkFlex: 35 }, b({ Ankle: -40, ShFlex: 150 })],
  ['Lateral bound / shuffle', 'standing', 'l', ['hip_abductors', 'knee_extensors'], b({ HipFlex: 30, Knee: 45, Ankle: 20 }), { ...b({ HipFlex: 25, Knee: 35, Ankle: 15 }), ...l({ HipAbd: 35 }) }],
  ['Knee extension', 'seated', 'l', ['knee_extensors'], l({ Knee: 90 }), l({ Knee: 0 })],
  ['Hip 90/90 & rotation', 'seated', 'l', ['hip_int_rotators'], {}, l({ HipRot: 40 })],
  ['Ankle dorsiflexion drill', 'standing', 'l', ['dorsiflexors'], {}, { ...l({ HipFlex: 30, Knee: 45, Ankle: 40 }), ...r({ HipFlex: -15, Ankle: -10 }) }],
  ['Horizontal push', 'supine', 'both', ['sh_flexors', 'elbow_extensors'], b({ ShFlex: 90 }), b({ ShFlex: 30, ShAbd: 50, Elbow: 90 })],
  ['Vertical push', 'seated', 'both', ['sh_abductors', 'elbow_extensors'], b({ ShAbd: 85, Elbow: 100 }), b({ ShFlex: 170 })],
  ['Horizontal pull', 'prone', 'both', ['sh_extensors', 'elbow_flexors'], b({ ShFlex: 90 }), b({ ShFlex: 15, Elbow: 100 })],
  ['Vertical pull', 'seated', 'both', ['sh_adductors', 'elbow_flexors'], b({ ShAbd: 165 }), b({ ShAbd: 25, Elbow: 125 })],
  ['Rotator cuff ER/IR', 'side_r', 'l', ['sh_ext_rotators'], l({ Elbow: 90, ShRot: -50 }), l({ Elbow: 90, ShRot: 60 })],
  ['Scapular control', 'standing', 'both', ['scap_protractors'], b({ ShFlex: 90, ScapProt: -15 }), b({ ShFlex: 90, ScapProt: 15 }), 'Protraction / retraction of the shoulder girdle about the sternoclavicular joint, arms forward.'],
  ['Throw / catch', 'standing', 'r', ['sh_int_rotators', 'elbow_extensors'], { ...r({ ShAbd: 90, Elbow: 90, ShRot: 90 }), trunkRot: -25 }, { ...r({ ShAbd: 90, Elbow: 10, ShRot: -20, ShFlex: 30 }), trunkRot: 30 }],
  ['Grip / forearm', 'seated', 'r', ['finger_flexors', 'wrist_extensors'], r({ Elbow: 90, Grip: 0 }), r({ Elbow: 90, Wrist: -25, Grip: 1 })],
  ['Hang / support', 'hang', 'both', ['sh_adductors', 'finger_flexors'], b({ Grip: 0.75 }), b({ Grip: 0.75, ScapElev: -6 }), 'Isometric hang; scapulae set down (depression) on the end pose.'],
  ['Shoulder mobility drill', 'standing', 'both', ['sh_flexors'], {}, b({ ShFlex: 175 })],
  ['Wrist & hand mobility', 'seated', 'r', ['wrist_extensors'], r({ Elbow: 90, Wrist: 70 }), r({ Elbow: 90, Wrist: -70 })],
  ['Anti-extension', 'plank', 'both', ['trunk_flexors'], {}, {}, 'Isometric: the spine is held still against gravity.'],
  ['Anti-rotation', 'standing', 'both', ['trunk_rotators'], b({ ShFlex: 10, Elbow: 90 }), b({ ShFlex: 90 }), 'Pallof press: the trunk resists rotation while the arms press.'],
  ['Anti-lateral flexion', 'side_r', 'both', ['trunk_lat'], r({ ShAbd: 85, Elbow: 90 }), r({ ShAbd: 85, Elbow: 90 }), 'Side plank: isometric hold on the right forearm.'],
  ['Rotation / chop', 'standing', 'both', ['trunk_rotators'], { trunkRot: -40, pelvisRot: -15, ...b({ ShFlex: 30 }) }, { trunkRot: 40, pelvisRot: 15, ...b({ ShFlex: 120 }) }],
  ['Loaded carry', 'standing', 'both', ['trunk_lat'], { trunkSide: 0 }, { trunkSide: 4, ...l({ HipFlex: 25, Knee: 30 }) }],
  ['Neck stabilisation', 'seated', 'both', ['neck_flexors'], { neckFlex: -5 }, { neckFlex: 5 }],
  ['Thoracic mobility drill', 'side_r', 'both', ['trunk_rotators'], { ...b({ HipFlex: 70, Knee: 90 }), ...b({ ShFlex: 90 }) }, { ...b({ HipFlex: 70, Knee: 90 }), ...r({ ShFlex: 90 }), ...l({ ShFlex: 90, ShAbd: 80 }), trunkRot: 40 }],
  ['Segmental spinal mobility', 'quadruped', 'both', ['trunk_extensors'], { trunkFlex: 25 }, { trunkFlex: -20 }, 'Cat-camel: the rig spreads trunk motion over the vertebrae; segment-by-segment control is not modelled.'],
  ['Crawl / quadruped', 'quadruped', 'both', ['hip_flexors', 'sh_flexors'], {}, { ...l({ HipFlex: 115, Knee: 110 }), ...r({ ShFlex: 105 }) }],
  ['Squat-to-press (thruster)', 'standing', 'both', ['hip_extensors', 'knee_extensors', 'sh_flexors', 'elbow_extensors'], { ...b({ HipFlex: 85, Knee: 120, Ankle: 35, ShFlex: 30, ShAbd: 60, Elbow: 130 }), trunkFlex: 30 }, b({ ShFlex: 175 })],
  ['Pull from floor (clean/high pull)', 'standing', 'both', ['hip_extensors', 'knee_extensors', 'plantarflexors'], { ...b({ HipFlex: 60, Knee: 80, Ankle: 25 }), trunkFlex: 55 }, b({ Ankle: -30, ShAbd: 45, Elbow: 100 })],
  ['Turkish get-up', 'supine', 'r', ['trunk_flexors', 'sh_flexors'], { ...r({ ShFlex: 90 }), ...l({ ShAbd: 45 }), ...r({ HipFlex: 40, Knee: 90 }) }, { ...r({ ShFlex: 150 }), ...l({ ShAbd: 45 }), ...r({ HipFlex: 40, Knee: 90 }), trunkFlex: 60 }],
  ['Sled push / drag', 'standing', 'l', ['hip_extensors', 'knee_extensors'], { ...l({ HipFlex: 60, Knee: 70, Ankle: 15 }), ...r({ HipFlex: -15, Knee: 20 }), ...b({ ShFlex: 80 }), trunkFlex: 45 }, { ...r({ HipFlex: 60, Knee: 70, Ankle: 15 }), ...l({ HipFlex: -15, Knee: 20 }), ...b({ ShFlex: 80 }), trunkFlex: 45 }],
  ['Ground-to-standing transition', 'halfkneel', 'both', ['hip_extensors', 'knee_extensors'], {}, { lHipFlex: 0, lKnee: 0, rKnee: 0, rAnkle: 0 }],
  ['Rotational throw', 'standing', 'both', ['trunk_rotators', 'hip_ext_rotators'], { trunkRot: -45, pelvisRot: -30, ...b({ ShFlex: 60 }) }, { trunkRot: 45, pelvisRot: 30, ...b({ ShFlex: 60 }) }],
  ['Locomotion flow (animal flow)', 'quadruped', 'both', ['hip_flexors', 'trunk_flexors'], {}, { ...l({ HipFlex: 60, Knee: 60 }), ...r({ ShFlex: 120 }) }],
  ['Complex circuit', 'standing', 'both', ['hip_extensors', 'knee_extensors', 'sh_flexors'], { ...b({ HipFlex: 85, Knee: 120, Ankle: 35 }), trunkFlex: 40 }, b({ ShFlex: 175 })],
  ['Copenhagen adductor plank', 'side_r', 'l', ['hip_adductors'], r({ ShAbd: 85, Elbow: 90 }), r({ ShAbd: 85, Elbow: 90 }), 'Isometric side plank with the top leg supported.'],
  ['Tibialis raise / anterior shin', 'standing', 'both', ['dorsiflexors'], b({ Ankle: -15 }), b({ Ankle: 20 })],
  ['Foot intrinsic / short foot', 'standing', 'both', [], {}, b({ Arch: 1 }), 'Medial column turned about the first metatarsal head: the arch rises a few millimetres while the toes stay long.'],
  ['Hip airplane (single-leg pelvic rotation)', 'standing', 'l', ['hip_ext_rotators', 'hip_abductors'], { ...l({ HipFlex: 50, Knee: 15 }), ...r({ HipFlex: -40 }), trunkFlex: 45 }, { ...l({ HipFlex: 50, Knee: 15 }), ...r({ HipFlex: -40 }), trunkFlex: 45, pelvisRot: 35 }],
  ['Glute bridge / hip thrust', 'hooklying', 'both', ['hip_extensors'], {}, { ...b({ HipFlex: 0, Knee: 100, Ankle: 10 }), tilt: 22 }],
  ['Reverse Nordic / quad lengthening', 'kneeling', 'both', ['knee_extensors'], {}, { ...b({ HipFlex: -40, Knee: 130 }), trunkFlex: -40 }],
  ['Spanish squat / knee isometric', 'standing', 'both', ['knee_extensors'], {}, { ...b({ HipFlex: 70, Knee: 70 }), trunkFlex: 10 }, 'Held at the bottom as an isometric.'],
  ['Lateral lunge / Cossack squat', 'standing', 'l', ['hip_adductors', 'hip_extensors', 'knee_extensors'], {}, { ...l({ HipFlex: 70, Knee: 110, Ankle: 30, HipAbd: 15 }), ...r({ HipAbd: 45 }), trunkFlex: 30 }],
  ['Hip flexor raise / psoas march', 'standing', 'l', ['hip_flexors'], {}, l({ HipFlex: 115, Knee: 90 })],
  ['Ankle eversion / inversion (peroneal & tib post)', 'seated', 'l', ['evertors'], l({ FootInv: 25 }), l({ FootInv: -15 }), 'Start inverted, end everted: the evertors (fibularis) shorten; tibialis posterior controls the return.'],
  ['Deceleration / braking step', 'standing', 'l', ['knee_extensors', 'hip_extensors'], {}, { ...l({ HipFlex: 50, Knee: 65, Ankle: 25 }), ...r({ HipFlex: -20, Knee: 30 }) }],
  ['Hamstring long-lever bridge', 'supine', 'both', ['hip_extensors', 'knee_flexors'], b({ HipFlex: 25, Knee: 15 }), { ...b({ HipFlex: 0, Knee: 15 }), tilt: 12 }],
  ['Face pull / rear-delt ER pull', 'standing', 'both', ['sh_ext_rotators', 'scap_retractors'], b({ ShFlex: 90 }), b({ ShAbd: 90, Elbow: 90, ShRot: 80 })],
  ['Elbow flexion (curl / hammer)', 'standing', 'both', ['elbow_flexors'], {}, b({ Elbow: 140 })],
  ['Elbow extension (triceps)', 'standing', 'both', ['elbow_extensors'], b({ ShFlex: 170, Elbow: 140 }), b({ ShFlex: 170 })],
  ['Push-up plus / serratus punch', 'prone', 'both', ['sh_flexors', 'elbow_extensors', 'scap_protractors'], b({ ShFlex: 40, ShAbd: 30, Elbow: 95, Ankle: 10 }), b({ ShFlex: 90, Ankle: 10 })],
  ['Forearm pronation / supination', 'seated', 'r', ['pronators'], r({ Elbow: 90, ForeRot: -75 }), r({ Elbow: 90, ForeRot: 75 }), 'From supination to pronation: the radius turns about the ulna and carries the hand.'],
  ['Finger flexor hang / finger strength', 'hang', 'both', ['finger_flexors'], b({ Grip: 0.55 }), b({ Grip: 0.7 }), 'Half-crimp hang held as an isometric.'],
  ['Bottoms-up overhead stability', 'standing', 'r', ['sh_flexors'], r({ ShFlex: 90, Elbow: 90 }), r({ ShFlex: 175 })],
  ['Y-T-W raise (lower trapezius)', 'prone', 'both', ['sh_flexors', 'scap_retractors'], b({ ShFlex: 90 }), b({ ShFlex: 160, ShAbd: 20 })],
  ['Dip / support press', 'standing', 'both', ['elbow_extensors', 'sh_flexors'], {}, b({ ShFlex: -45, Elbow: 90 })],
  ['Shrug / scapular elevation', 'standing', 'both', [], {}, b({ ScapElev: 22 })],
  ['360° diaphragmatic breathing', 'hooklying', 'both', [], { breath: 0 }, { breath: 1 }, 'Schematic sizes: lower rib cage widens 6 % side to side and 5 % front to back, diaphragm descends 2.5 cm.'],
  ['Pelvic floor activation', 'hooklying', 'both', [], { pelvicFloor: 0 }, { pelvicFloor: 1 }, 'Schematic lift of the pelvic floor muscles (about 1 cm), then full release.'],
  ['Dead bug (contralateral control)', 'supine', 'both', ['trunk_flexors', 'hip_flexors'], b({ HipFlex: 90, Knee: 90, ShFlex: 90 }), { ...l({ HipFlex: 10, Knee: 5 }), ...r({ HipFlex: 90, Knee: 90, ShFlex: 170 }), lShFlex: 90 }],
  ['Bird dog', 'quadruped', 'both', ['hip_extensors', 'trunk_extensors'], {}, { ...l({ HipFlex: 0, Knee: 0 }), ...r({ ShFlex: 170 }) }],
  ['Hollow body / gymnastics core', 'supine', 'both', ['trunk_flexors'], {}, { ...b({ HipFlex: 25, ShFlex: 170 }), trunkFlex: 20 }, 'Held as an isometric.'],
  ['Back extension / spinal extensor endurance', 'prone', 'both', ['trunk_extensors', 'hip_extensors'], { trunkFlex: 45 }, { trunkFlex: -5 }],
  ['Hanging leg raise / trunk-hip flexion', 'hang', 'both', ['hip_flexors', 'trunk_flexors'], {}, b({ HipFlex: 110 })],
  ['Cranio-cervical flexion (chin tuck)', 'supine', 'both', ['neck_flexors'], {}, { neckFlex: 12 }],
  ['Neck 4-way strength', 'seated', 'both', ['neck_flexors'], { neckFlex: -35 }, { neckFlex: 40 }],
  ['Loaded trunk flexion (crunch / sit-up)', 'hooklying', 'both', ['trunk_flexors'], {}, { trunkFlex: 40 }],
  ['Sprint drills (A-skip / B-skip / wall drill)', 'standing', 'l', ['hip_flexors'], {}, { ...l({ HipFlex: 90, Knee: 100, Ankle: 15 }), ...r({ Ankle: -20 }), ...l({ ShFlex: -30, Elbow: 90 }), ...r({ ShFlex: 45, Elbow: 90 }) }],
  ['Change of direction / cutting', 'standing', 'l', ['hip_abductors', 'knee_extensors'], {}, { ...l({ HipFlex: 40, Knee: 50, HipAbd: 30, Ankle: 20 }), trunkSide: 15 }],
  ['Rope climb / climbing pull', 'hang', 'both', ['sh_extensors', 'elbow_flexors'], {}, b({ ShFlex: 120, Elbow: 95 })],
  ['Battle rope waves', 'standing', 'both', ['sh_flexors'], b({ HipFlex: 30, Knee: 30, Ankle: 20, Elbow: 30 }), b({ HipFlex: 30, Knee: 30, Ankle: 20, ShFlex: 90 })],
  ['Push press / jerk (overhead drive)', 'standing', 'both', ['sh_flexors', 'elbow_extensors', 'knee_extensors'], b({ ShAbd: 60, ShFlex: 30, Elbow: 130, HipFlex: 20, Knee: 20, Ankle: 15 }), b({ ShFlex: 175 })],
  ['Skipping / jump rope', 'standing', 'both', ['plantarflexors'], b({ Ankle: 10, Knee: 10 }), b({ Ankle: -15, Knee: 5 })],
  ['Deep-water / aquatic running', 'standing', 'l', ['hip_flexors', 'hip_extensors'], { ...l({ HipFlex: -15 }), ...r({ HipFlex: 70, Knee: 90 }) }, { ...l({ HipFlex: 70, Knee: 90 }), ...r({ HipFlex: -15 }) }, 'Shown on land: there is no water in the scene.'],
  ['Single-leg balance reach (Y-balance / star)', 'standing', 'l', ['knee_extensors', 'hip_abductors'], {}, { ...l({ HipFlex: 60, Knee: 70, Ankle: 30 }), ...r({ HipFlex: 60 }), trunkFlex: 20 }],
  ['Belt squat (hip-belt loaded)', 'standing', 'both', ['hip_extensors', 'knee_extensors'], {}, { ...b({ HipFlex: 90, Knee: 120, Ankle: 30 }), trunkFlex: 15 }],
  ['Knee-over-toe / sissy squat (quad lengthened)', 'standing', 'both', ['knee_extensors'], {}, { ...b({ HipFlex: 85, Knee: 125, Ankle: 40 }), trunkFlex: 10 }],
  ['Reverse hyper / 45° hip extension', 'prone', 'both', ['hip_extensors'], b({ HipFlex: 80 }), b({ HipFlex: -5 })],
  ['Straight-arm pulldown / pullover (lat)', 'standing', 'both', ['sh_extensors'], { ...b({ ShFlex: 165, Elbow: 15 }), trunkFlex: 20 }, { ...b({ ShFlex: 10, Elbow: 15 }), trunkFlex: 20 }],
  ['Wrist extensor eccentric (Tyler twist / tennis elbow)', 'seated', 'r', ['wrist_extensors'], r({ ShFlex: 80, Wrist: -55 }), r({ ShFlex: 80, Wrist: 35 })],
  ['Jefferson curl / loaded spinal flexion', 'standing', 'both', ['trunk_extensors', 'hip_extensors'], {}, { trunkFlex: 110, neckFlex: 30 }],
  ['Ab wheel rollout (long-lever anti-extension)', 'kneeling', 'both', ['trunk_flexors', 'sh_extensors'], { ...b({ HipFlex: 60, ShFlex: 70 }), trunkFlex: 60 }, { ...b({ HipFlex: 30, ShFlex: 150 }), trunkFlex: 30 }],
  ['Kettlebell swing (hip-hinge ballistic)', 'standing', 'both', ['hip_extensors'], { ...b({ Knee: 25, Ankle: 15, ShFlex: 70 }), trunkFlex: 75 }, b({ ShFlex: 90 })],
  ['Sandbag ground-to-shoulder', 'standing', 'both', ['hip_extensors', 'knee_extensors', 'elbow_flexors'], { ...b({ HipFlex: 80, Knee: 100, Ankle: 30, ShFlex: 60, Elbow: 20 }), trunkFlex: 70 }, b({ ShFlex: 30, ShAbd: 20, Elbow: 140 })],
  ['Sprint (acceleration / max velocity)', 'standing', 'l', ['hip_flexors', 'hip_extensors'], { ...l({ HipFlex: 90, Knee: 100, Ankle: 15, ShFlex: -35, Elbow: 90 }), ...r({ HipFlex: -15, Knee: 30, Ankle: -20, ShFlex: 45, Elbow: 90 }), trunkFlex: 15 },
    { ...r({ HipFlex: 90, Knee: 100, Ankle: 15, ShFlex: -35, Elbow: 90 }), ...l({ HipFlex: -15, Knee: 30, Ankle: -20, ShFlex: 45, Elbow: 90 }), trunkFlex: 15 }],
];

// ---------------------------------------------------------------- state
const ST = { tb: null, move: null, pos: 'standing', side: 'both', table: 'plinth', t0: 0, speed: 0.35, play: true, phase: 0, prevU: 0, ghost: true, rhythm: true, skin: true, show: { ag: true, syn: true, stab: true, ant: true }, sens: null, roles: null, geo: null };
let L, H, bed = null, bar = null, samples = null;

export async function initStudio() {
  L = labState(); H = labHooks();
  try { ST.tb = await fetch('/training-4D/rt/training_system/bundle.json').then((x) => (x.ok ? x.json() : null)); } catch { ST.tb = null; }
  const am = ST.tb ? tbl('Anatomy_Map') : [];
  ST.moves = MOVES.map(([name, pos, side, act, A, B, note]) => ({ name, pos, side, act, A, B, note, am: am.find((x) => x['Base movement'] === name) }));
  // movements present in the workbook but not defined above still appear, as positions with roles
  am.forEach((x) => { if (!ST.moves.find((m) => m.name === x['Base movement'])) ST.moves.push({ name: x['Base movement'], pos: 'standing', side: 'both', act: [], A: {}, B: {}, note: 'Not animated yet: position and roles only.', am: x }); });
  buildCard();
  calibrateSigns();
  initExtras(L);
  const pend = window.__pendingStudio; window.__pendingStudio = null;
  if (pend) start(pend.base, pend.pos);
  window.__studio = { start, positions: POSITIONS, moves: () => ST.moves.map((m) => m.name), debug: (name, pos) => {
    if (!ST.home) { const c = L.atlas.box.getCenter(new THREE.Vector3()); ST.home = { x: c.x, z: c.z }; }
    const m = ST.moves.find((x) => x.name === name), P = pos || m.pos, out = {};
    for (const [lab, q] of [['A', { ...POSITIONS[P].base, ...m.A }], ['B', { ...POSITIONS[P].base, ...m.B }]]) { const M = posed(q, P); place(M, P); out[lab] = Object.fromEntries(['pelvis', 'l_hip', 'l_knee', 'l_ankle', 'l_shoulder', 'l_wrist'].map((k) => [k, posedPoint(L.rig, M, 'J', k)?.toArray().map((v) => +v.toFixed(3))])); const v = new THREE.Vector3(); out[lab + '_segmin'] = [...samples.entries()].map(([k, pts]) => { const mm = M.get(k); if (!mm) return [k, null]; let mn = Infinity; pts.forEach((q) => { v.copy(q).applyMatrix4(mm); mn = Math.min(mn, v.y); }); return [k, +mn.toFixed(3)]; }).sort((x, y) => (x[1] ?? 9) - (y[1] ?? 9)).slice(0, 6); }
    return out; } };
}
function tbl(name) { const t = ST.tb.tables[name]; return t ? t.rows.map((r_) => Object.fromEntries(t.cols.map((c, i) => [c, r_[i + 1]]))) : []; }

// ---------------------------------------------------------------- posing (rig axes, as motion_lab.js commanded())
const ax = () => { const A = L.atlas.anchors; return { up: new THREE.Vector3(0, 1, 0), down: new THREE.Vector3(0, -1, 0), ant: new THREE.Vector3(0, 0, A.anterior), lat: new THREE.Vector3(A.leftX, 0, 0) }; };
const rot = (axis, deg) => new THREE.Quaternion().setFromAxisAngle(axis.clone().normalize(), THREE.MathUtils.degToRad(deg));
const SGN = { shRot: { l: 1, r: 1 }, hipRot: { l: 1, r: 1 }, tilt: 1 };
function rotations(p) {
  const { up, down, ant, lat } = ax(), flexAxis = down.clone().cross(ant), trunkAxis = up.clone().cross(ant), R = {};
  const base = rot(up, p.pelvisRot || 0).multiply(rot(ant, p.pelvisObl || 0));
  R.thorax = base.clone().multiply(rot(up, p.trunkRot || 0)).multiply(rot(trunkAxis, p.trunkFlex || 0)).multiply(rot(ant, p.trunkSide || 0));
  R.pelvis = base.clone().multiply(rot(trunkAxis, LUMBOPELVIC_ALPHA * (p.trunkFlex || 0)));
  R.head = R.thorax.clone().multiply(rot(up, p.neckRot || 0)).multiply(rot(ant, p.neckSide || 0)).multiply(rot(trunkAxis, p.neckFlex || 0));
  for (const k of ['l', 'r']) {
    const s = k === 'l' ? 1 : -1, abdAxis = down.clone().cross(lat.clone().multiplyScalar(s));
    const hum = R.thorax.clone().multiply(rot(abdAxis, p[`${k}ShAbd`] || 0)).multiply(rot(flexAxis, p[`${k}ShFlex`] || 0)).multiply(rot(down, SGN.shRot[k] * (p[`${k}ShRot`] || 0)));
    R[`${k}_humerus`] = hum;
    R[`${k}_forearm`] = hum.clone().multiply(rot(flexAxis, p[`${k}Elbow`] || 0));
    R[`${k}_hand`] = R[`${k}_forearm`].clone().multiply(rot(flexAxis, p[`${k}Wrist`] || 0));
    const fem = base.clone().multiply(rot(flexAxis, p[`${k}HipFlex`] || 0)).multiply(rot(abdAxis, p[`${k}HipAbd`] || 0)).multiply(rot(down, SGN.hipRot[k] * (p[`${k}HipRot`] || 0)));
    R[`${k}_femur`] = fem;
    R[`${k}_leg`] = fem.clone().multiply(rot(flexAxis, -(p[`${k}Knee`] || 0)));
    R[`${k}_foot`] = R[`${k}_leg`].clone().multiply(rot(flexAxis, p[`${k}Ankle`] || 0));
  }
  return R;
}
function orientQ(pos, tilt = 0) {
  const { up, down, ant, lat } = ax(), o = POSITIONS[pos].orient;
  const q = o === 'supine' ? new THREE.Quaternion().setFromUnitVectors(ant, up) : o === 'prone' ? new THREE.Quaternion().setFromUnitVectors(ant, down)
    : o === 'side_l' ? new THREE.Quaternion().setFromUnitVectors(lat, down) : o === 'side_r' ? new THREE.Quaternion().setFromUnitVectors(lat.clone().negate(), down) : new THREE.Quaternion();
  return tilt ? q.multiply(rot(lat, SGN.tilt * tilt)) : q;
}
// anatomy meshes only: the joint-marker spheres carry local coordinates and would swing below the body
function sampleSegments() { // contact points: bones, plus muscle surface within 8 cm of that segment's own bones
  samples = new Map();
  L.groups.forEach((g, key) => {
    const bone = [], soft = [], box = new THREE.Box3();
    g.children.forEach((m) => {
      const pa = m.geometry?.attributes?.position, part = m.userData.part; if (!pa || !m.isMesh || !part) return;
      const isBone = part.layer === 'skeleton', isMus = part.layer === 'muscles'; if (!isBone && !isMus) return;
      const step = Math.max(1, Math.floor(pa.count / 150));
      for (let i = 0; i < pa.count; i += step) { const v = new THREE.Vector3(pa.getX(i), pa.getY(i), pa.getZ(i)); (isBone ? bone : soft).push(v); if (isBone) box.expandByPoint(v); }
    });
    if (bone.length) box.expandByScalar(0.08);
    samples.set(key, bone.length ? bone.concat(soft.filter((v) => box.containsPoint(v))) : []);
  });
}
const floorY = () => L.atlas.box.min.y - 0.005;
const BED_H = 0.72, BAR_H = 2.35;
function posed(p, pos) {
  const R = rotations(p), M = applyExtras(poseMatrices(L.rig, R), p, ST.rhythm);
  const c = L.atlas.box.getCenter(new THREE.Vector3()), G = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z)
    .multiply(new THREE.Matrix4().makeRotationFromQuaternion(orientQ(pos, p.tilt || 0))).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
  M.forEach((m) => m.premultiply(G));
  return M;
}
function bounds(M, only) {
  if (!samples) sampleSegments();
  const lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity), v = new THREE.Vector3();
  samples.forEach((pts, key) => { if (only && !only.includes(key)) return; const m = M.get(key); if (!m) return; for (const p of pts) { v.copy(p).applyMatrix4(m); lo.min(v); hi.max(v); } });
  return { lo, hi };
}
function place(M, pos, ref) { // rest the body on its support; `ref` keeps the horizontal placement steady through a movement
  const P = POSITIONS[pos], bb = bounds(M), bs = P.sit ? bounds(M, ['pelvis', 'l_femur', 'r_femur']) : bb, sup = P.on === 'bed' ? floorY() + BED_H : floorY();
  let dy;
  if (P.on === 'bar') { const hy = Math.max(posedPoint(L.rig, M, 'J', 'l_wrist')?.y ?? bb.hi.y, posedPoint(L.rig, M, 'J', 'r_wrist')?.y ?? bb.hi.y); dy = floorY() + BAR_H - hy; }
  else dy = sup - bs.lo.y;
  const cx = ref ? ref.x : (bb.lo.x + bb.hi.x) / 2, cz = ref ? ref.z : (bb.lo.z + bb.hi.z) / 2;
  const T = new THREE.Matrix4().makeTranslation(-cx + ST.home.x, dy, -cz + ST.home.z);
  M.forEach((m) => m.premultiply(T));
  return { cx, cz };
}

// sign conventions found from the rig itself (so ER moves the hand away from the midline, IR moves the foot outward when the knee is bent)
function calibrateSigns() {
  if (!L.rig) return;
  const mid = L.atlas.box.getCenter(new THREE.Vector3()).x;
  const away = (k, M, j) => Math.abs((posedPoint(L.rig, M, 'J', `${k}_${j}`)?.x ?? mid) - mid);
  for (const k of ['l', 'r']) {
    const pE = { [`${k}Elbow`]: 90 }, M0 = poseMatrices(L.rig, rotations(pE)), M1 = poseMatrices(L.rig, rotations({ ...pE, [`${k}ShRot`]: 30 }));
    if (away(k, M1, 'wrist') < away(k, M0, 'wrist')) SGN.shRot[k] = -1;
    const pH = { [`${k}HipFlex`]: 90, [`${k}Knee`]: 90 }, H0 = poseMatrices(L.rig, rotations(pH)), H1 = poseMatrices(L.rig, rotations({ ...pH, [`${k}HipRot`]: 30 }));
    if (away(k, H1, 'ankle') < away(k, H0, 'ankle')) SGN.hipRot[k] = -1;
  }
  // tilt: positive raises the pelvis relative to the head (bridge) when supine
  const c = L.atlas.box.getCenter(new THREE.Vector3());
  const headMinusPelvis = (t) => { const q = orientQ('supine', t), v1 = (L.rig.LM.vertex?.p || c.clone().add(new THREE.Vector3(0, 0.8, 0))).clone().sub(c).applyQuaternion(q), v2 = (L.rig.J.pelvis?.p || c).clone().sub(c).applyQuaternion(q); return v1.y - v2.y; };
  SGN.tilt = 1; if (headMinusPelvis(15) > headMinusPelvis(0)) SGN.tilt = -1;
}

// ---------------------------------------------------------------- roles
function bpBase(name) { return name.replace(/\b(left|right) /, ''); }
function groupNames(g) { const re = GROUPS[g]?.re; return re ? [...new Set(L.atlas.parts.filter(({ part }) => part.layer === 'muscles' && re.test(part.name)).map(({ part }) => bpBase(part.name)))] : []; }
function rolesFor(m) {
  const M = ST.tb?.links?.muscles || {}, R = { ag: new Map(), syn: new Map(), stab: new Map(), ant: new Map() }, unmatched = [];
  const add = (role, words, src) => {
    String(words || '').split(/;\s*/).map((w) => w.trim()).filter(Boolean).forEach((w) => {
      const names = M[w] || []; if (!names.length) unmatched.push(`${w} (${ROLE[role][0].toLowerCase()})`);
      names.forEach((n) => { if (!R.ag.has(n) && !R.syn.has(n) && !R.stab.has(n)) R[role].set(n, { word: w, src }); });
    });
  };
  if (m.am) { add('ag', m.am['Prime movers (agonists)'], 'workbook Anatomy_Map'); add('syn', m.am.Synergists, 'workbook Anatomy_Map'); add('stab', m.am['Stabilisers / co-contractors'], 'workbook Anatomy_Map'); }
  if (!R.ag.size) m.act.forEach((g) => groupNames(g).forEach((n) => R.ag.set(n, { word: GROUPS[g].label, src: `group ${g} (${GROUPS[g].grade})` })));
  const used = new Set([...R.ag.keys(), ...R.syn.keys(), ...R.stab.keys()]);
  m.act.forEach((g) => { const o = OPP[g]; if (!o || o === g) return; groupNames(o).forEach((n) => { if (!used.has(n)) R.ant.set(n, { word: GROUPS[o].label, src: `opposite action of ${g.replace(/_/g, ' ')} (${GROUPS[o].grade === 'B' || GROUPS[g].grade === 'B' ? 'B: OpenStax A&P 2e ch. 11' : 'U: standard anatomy'})` }); }); });
  return { R, unmatched: [...new Set(unmatched)] };
}
function paint() {
  if (!ST.move) return;
  const set = new Map(), side = ST.side === 'both' ? null : ST.side === 'l' ? 'left' : 'right';
  const order = ['ant', 'stab', 'syn', 'ag'];
  for (const role of order) {
    if (!ST.show[role]) continue;
    const names = ST.roles.R[role];
    for (const { part } of L.atlas.parts) {
      if (part.layer !== 'muscles' || !names.has(bpBase(part.name))) continue;
      if (side && role !== 'stab' && /\b(left|right)\b/.test(part.name) && !part.name.includes(side)) continue;
      set.set(part.name, `col:${ROLE[role][1]}`);
    }
  }
  L.jmSet = set; L.jmGhost = ST.ghost; L.bioSet = null; H.applyLook();
}

// ---------------------------------------------------------------- the gravity reading of this pose and position
function analyse() {
  const m = ST.move, pos = ST.pos, A = { ...POSITIONS[pos].base, ...m.A }, B = { ...POSITIONS[pos].base, ...m.B };
  const MA = posed(A, pos), MB = posed(B, pos); const ref = place(MA, pos); place(MB, pos, { x: ref.cx, z: ref.cz });
  const keys = [['J', 'l_wrist'], ['J', 'r_wrist'], ['J', 'l_elbow'], ['J', 'r_elbow'], ['J', 'l_ankle'], ['J', 'r_ankle'], ['J', 'l_knee'], ['J', 'r_knee'], ['J', 'l_hip'], ['J', 'r_hip'], ['J', 'l_shoulder'], ['J', 'r_shoulder'],
    ['LM', 'l_mt5_head'], ['LM', 'r_mt5_head'], ['LM', 'l_acromion'], ['LM', 'r_acromion']];
  const moved = keys.map(([st, k]) => { const a = posedPoint(L.rig, MA, st, k), b2 = posedPoint(L.rig, MB, st, k); return a && b2 ? { k, d: b2.clone().sub(a), dy: b2.y - a.y } : null; }).filter((x) => x && x.d.length() > 0.012);
  const small = ['Grip', 'Toe', 'Arch', 'breath', 'pelvicFloor', 'ForeRot', 'FootInv', 'ScapElev', 'ScapProt'].some((w) => Object.keys({ ...m.A, ...m.B }).some((k) => k.endsWith(w) && (m.A[k] ?? 0) !== (m.B[k] ?? 0)));
  const lead = moved.sort((x, y) => y.d.length() - x.d.length())[0];
  const com = (M) => { // body-centre proxy: mean height of the posed pelvis, hips, shoulders and vertex
    const pts = [['J', 'pelvis'], ['J', 'l_hip'], ['J', 'r_hip'], ['J', 'l_shoulder'], ['J', 'r_shoulder'], ['LM', 'vertex']].map(([s, k]) => posedPoint(L.rig, M, s, k)).filter(Boolean);
    return pts.length ? pts.reduce((a, p) => a + p.y, 0) / pts.length : 0; };
  const dCom = com(MB) - com(MA);
  let txt, upAB = null;
  if (small && (!lead || lead.d.length() < 0.06) && Math.abs(dCom) < 0.02) { txt = 'Small-joint movement (fingers, toes, foot, forearm rotation, shoulder girdle or breathing): the agonists shorten from start to end and lengthen on the return; the weight lifted is the small part itself, so body position changes little.'; upAB = true; }
  else if (!lead && Math.abs(dCom) < 0.02) txt = 'Held position (isometric): the agonists work without changing length; gravity is resisted, not lifted.';
  else {
    const bodyLeads = !lead || Math.abs(dCom) > 0.04 && Math.abs(dCom) > 0.35 * lead.d.length(); // closed chain: the body moves; open chain: the limb end moves
    const big = bodyLeads ? { what: 'body', dy: dCom } : { what: lead.k.replace(/_/g, ' ').replace(/^l /, 'left ').replace(/^r /, 'right ').replace('mt5 head', '5th metatarsal head'), dy: lead.dy };
    const horiz = lead ? Math.abs(lead.dy) < 0.25 * lead.d.length() && Math.abs(dCom) < 0.04 : false;
    if (horiz) txt = `In this position the ${big.what} moves across gravity (${Math.round(Math.abs(lead.dy) * 100)} cm up or down of ${Math.round(lead.d.length() * 100)} cm travel): close to gravity-eliminated, so the load comes from bands, cables, friction or the limb's own inertia rather than its weight.`;
    else { upAB = big.dy > 0; txt = `In this position the ${big.what} ${upAB ? 'rises' : 'falls'} ${Math.round(Math.abs(big.dy) * 100)} cm from start to end: the agonists shorten (concentric) while it ${upAB ? 'goes from start to end' : 'returns from end to start'} and lengthen under control (eccentric) the other way.`; }
  }
  ST.geo = { txt, upAB };
}

// ---------------------------------------------------------------- run
function start(name, pos) {
  const m = ST.moves.find((x) => x.name === name) || ST.moves[0];
  ST.move = m; ST.pos = pos || m.pos; ST.side = m.side === 'both' ? 'both' : m.side;
  H.stopExercise(); H.stopDemo();
  ST.roles = rolesFor(m); ST.t0 = performance.now() / 1000; ST.play = true;
  if (ST.skin) { const sk = buildSkin(L); ST.skinInfo = `${sk.list.length} muscles, vessels and nerves crossing a joint blend between the bones they span (${sk.verts.toLocaleString()} vertices)`; }
  L.studio = { step, stop };
  $('#ms-move').value = m.name; $('#ms-pos').value = ST.pos;
  setScene(); analyse(); paint(); info(); frame(true);
}
function stop() {
  if (!L.studio) return;
  clearExtras(); L.studio = null; L.jmSet = null; L.jmGhost = false; if (bed) bed.visible = false; if (bar) bar.visible = false;
  H.applyLook(); const s = $('#ms-state'); if (s) s.textContent = 'Stopped. The camera, demo or exercise player drives the twin.';
}
let lastU = 0;
function step(t) {
  if (!ST.move) return;
  if (ST.play) ST.phase = ((t - ST.t0) * ST.speed) % 1;
  const u = Math.sin(Math.PI * ST.phase) ** 2, m = ST.move, base = POSITIONS[ST.pos].base, p = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(m.A), ...Object.keys(m.B)]);
  keys.forEach((k) => { const a = m.A[k] ?? base[k] ?? 0, bb = m.B[k] ?? base[k] ?? 0; p[k] = a + (bb - a) * u; });
  const M = posed(p, ST.pos);
  if (!ST.ref) { const MA = posed(Object.fromEntries([...keys].map((k) => [k, m.A[k] ?? base[k] ?? 0])), ST.pos); const r_ = place(MA, ST.pos); ST.ref = { x: r_.cx, z: r_.cz }; }
  place(M, ST.pos, ST.ref);
  L.M = M; H.applyMatrices();
  if (ST.skin) applySkin(M);
  const dir = u > lastU ? 'AB' : u < lastU ? 'BA' : null; lastU = u;
  const ph = $('#ms-phase');
  if (ph && dir) {
    const g = ST.geo; let lab;
    if (!g || g.upAB === null) lab = g?.txt?.startsWith('Held') ? 'isometric hold' : 'across gravity';
    else lab = (dir === 'AB') === g.upAB ? 'agonists CONCENTRIC (shortening)' : 'agonists ECCENTRIC (lengthening under control)';
    ph.innerHTML = `<b>${dir === 'AB' ? 'start → end' : 'end → start'}</b> · ${Math.round(u * 100)}% · ${lab}`;
    const sl = $('#ms-scrub'); if (sl && ST.play) sl.value = Math.round(ST.phase * 1000);
  }
}
function setScene() {
  ST.ref = null;
  const P = POSITIONS[ST.pos];
  if (!ST.home) { const c = L.atlas.box.getCenter(new THREE.Vector3()); ST.home = { x: c.x, z: c.z }; }
  if (!bed) buildBed(); if (!bar) buildBar();
  // table under the body: long axis along the body when lying, across it when seated or kneeling
  const A = ax(), q = orientQ(ST.pos), bodyUp = A.up.clone().applyQuaternion(q), long = Math.abs(bodyUp.y) > 0.7 ? A.lat.clone() : new THREE.Vector3(bodyUp.x, 0, bodyUp.z).normalize();
  bed.visible = P.on === 'bed';
  bed.rotation.set(0, Math.atan2(long.x, long.z), 0);
  const antH = A.ant.clone().applyQuaternion(q); antH.y = 0;
  const off = P.sit ? antH.normalize().multiplyScalar(-0.3) : new THREE.Vector3();
  bed.position.set(ST.home.x + off.x, floorY(), ST.home.z + off.z);
  bed.children.forEach((c) => { if (c.userData.top) c.material = ST.table === 'steel' ? matSteel : matPad; });
  bar.visible = P.on === 'bar'; bar.position.set(ST.home.x, floorY() + BAR_H + 0.02, ST.home.z);
}
const matPad = new THREE.MeshStandardMaterial({ color: 0x1d4e72, roughness: 0.85, metalness: 0.05 });
const matSteel = new THREE.MeshStandardMaterial({ color: 0xc9d3dd, roughness: 0.25, metalness: 0.9 });
function buildBed() {
  bed = new THREE.Group(); const W = 0.78, Lg = 2.0, top = new THREE.Mesh(new THREE.BoxGeometry(W, 0.08, Lg), matPad);
  top.position.y = BED_H - 0.04; top.userData.top = true; bed.add(top);
  const frame = new THREE.MeshStandardMaterial({ color: 0x8a97a8, roughness: 0.35, metalness: 0.85 });
  const rail = new THREE.Mesh(new THREE.BoxGeometry(W - 0.06, 0.05, Lg - 0.06), frame); rail.position.y = BED_H - 0.105; bed.add(rail);
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, BED_H - 0.13, 12), frame); leg.position.set(x * (W / 2 - 0.07), (BED_H - 0.13) / 2, z * (Lg / 2 - 0.1)); bed.add(leg); }
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(W - 0.12, 0.02, Lg - 0.3), frame); shelf.position.y = 0.18; bed.add(shelf);
  bed.visible = false; L.scene.add(bed);
}
function buildBar() {
  bar = new THREE.Group(); const m = new THREE.MeshStandardMaterial({ color: 0xb9c4d0, roughness: 0.3, metalness: 0.9 });
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.3, 16), m); rod.rotation.z = Math.PI / 2; bar.add(rod);
  for (const x of [-0.65, 0.65]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, BAR_H, 12), m); post.position.set(x, -BAR_H / 2, 0); bar.add(post); }
  bar.visible = false; L.scene.add(bar);
}
function frame(reset) {
  const A = ax(), q = orientQ(ST.pos), lying = Math.abs(A.up.clone().applyQuaternion(q).y) < 0.7;
  const y = floorY() + (POSITIONS[ST.pos].on === 'bed' ? BED_H + 0.25 : POSITIONS[ST.pos].on === 'bar' ? 1.4 : 0.9);
  const tgt = new THREE.Vector3(ST.home.x, y, ST.home.z), side = A.lat.clone().multiplyScalar(lying ? 1 : 0.6).add(A.ant.clone().multiplyScalar(lying ? 0.35 : 1)).normalize();
  if (reset) { L.camera.position.copy(tgt).addScaledVector(side, lying ? 2.6 : 3.2).add(new THREE.Vector3(0, lying ? 1.3 : 0.5, 0)); L.controls.target.copy(tgt); L.controls.update(); }
}

// ---------------------------------------------------------------- UI
function buildCard() {
  const card = $('#ms-card'); if (!card) return;
  const groups = [...new Set(ST.moves.map((m) => m.am?.['Region group'] || 'Other'))];
  card.innerHTML = `<div class="card-h"><h2>Movement studio 4D</h2><span class="btnrow"><button id="ms-play" class="primary small">Play</button><button id="ms-stop" class="ghost-btn">Stop</button></span></div>
    <p class="fine" style="margin-top:0">Every base movement of your Training System on the twin, in any position, on a plinth or dissection table, with muscles coloured by role.</p>
    <div class="ctl-grid"><label>Movement <select id="ms-move">${groups.map((g) => `<optgroup label="${esc(g)}">${ST.moves.filter((m) => (m.am?.['Region group'] || 'Other') === g).map((m) => `<option ${m.act.length || Object.keys(m.B).length ? '' : 'class="muted"'}>${esc(m.name)}</option>`).join('')}</optgroup>`).join('')}</select></label>
      <label>Position <select id="ms-pos">${Object.entries(POSITIONS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select></label>
      <label>Side <select id="ms-side"><option value="both">Both</option><option value="l">Left</option><option value="r">Right</option></select></label>
      <label>Table <select id="ms-table"><option value="plinth">Treatment plinth</option><option value="steel">Steel dissection table</option></select></label>
      <label>Speed <input id="ms-speed" type="range" min="5" max="120" value="35"></label>
      <label>Phase <input id="ms-scrub" type="range" min="0" max="1000" value="0"></label></div>
    <div class="ms-roles">${Object.entries(ROLE).map(([k, [lab, c]]) => `<label><input type="checkbox" data-role="${k}" checked><i style="background:${c}"></i>${lab} <small id="ms-n-${k}"></small></label>`).join('')}<label><input type="checkbox" id="ms-ghost" checked> Ghost other tissue</label><label title="1° scapular upward rotation per 2° arm elevation beyond 30° (Inman; grade U)"><input type="checkbox" id="ms-rhythm" checked> Scapular rhythm</label><label title="Muscles that cross a joint follow both bones"><input type="checkbox" id="ms-skin" checked> Soft-tissue blending</label></div>
    <p class="fine" id="ms-phase"></p><div id="ms-info" class="fine"></div><p class="fine muted" id="ms-state"></p>`;
  $('#ms-move').onchange = () => start($('#ms-move').value);
  $('#ms-pos').onchange = () => { if (!ST.move) return start($('#ms-move').value, $('#ms-pos').value); ST.pos = $('#ms-pos').value; setScene(); analyse(); info(); frame(true); };
  $('#ms-side').onchange = () => { ST.side = $('#ms-side').value; paint(); };
  $('#ms-table').onchange = () => { ST.table = $('#ms-table').value; if (ST.move) setScene(); };
  $('#ms-speed').oninput = (e) => { const ph = ST.phase; ST.speed = +e.target.value / 100; ST.t0 = performance.now() / 1000 - ph / ST.speed; };
  $('#ms-scrub').oninput = (e) => { ST.play = false; ST.phase = +e.target.value / 1000; $('#ms-play').textContent = 'Play'; };
  $('#ms-play').onclick = () => { if (!L.studio) return start($('#ms-move').value, $('#ms-pos').value); ST.play = !ST.play; ST.t0 = performance.now() / 1000 - ST.phase / ST.speed; $('#ms-play').textContent = ST.play ? 'Pause' : 'Play'; };
  $('#ms-stop').onclick = () => stop();
  card.querySelectorAll('[data-role]').forEach((c) => (c.onchange = () => { ST.show[c.dataset.role] = c.checked; paint(); }));
  $('#ms-ghost').onchange = (e) => { ST.ghost = e.target.checked; paint(); };
  $('#ms-rhythm').onchange = (e) => { ST.rhythm = e.target.checked; };
  $('#ms-skin').onchange = (e) => { ST.skin = e.target.checked; if (ST.skin) { if (L.studio) buildSkin(L); } else clearExtras(); };
  $('#ms-state').textContent = ST.tb ? `${ST.moves.length} movements from Anatomy_Map · ${Object.keys(POSITIONS).length} positions.` : 'Training System data not built on this machine: movements run with textbook muscle groups only.';
}
function info() {
  const m = ST.move, R = ST.roles.R; $('#ms-play').textContent = ST.play ? 'Pause' : 'Play'; $('#ms-side').value = ST.side;
  Object.keys(ROLE).forEach((k) => { const n = $(`#ms-n-${k}`); if (n) n.textContent = R[k].size; });
  const list = (role) => { const by = new Map(); R[role].forEach((v, n) => { const key = v.word; if (!by.has(key)) by.set(key, { src: v.src, n: [] }); by.get(key).n.push(n); });
    return [...by.entries()].map(([w, x]) => `<li><b>${esc(w)}</b> <small>· ${x.n.length} mesh${x.n.length > 1 ? 'es' : ''} · ${esc(x.src)}</small></li>`).join('') || '<li class="muted">none</li>'; };
  const animated = Object.keys(m.B).length || Object.keys(m.A).length;
  $('#ms-info').innerHTML = `<p><b>${esc(m.name)}</b> · ${esc(POSITIONS[ST.pos].label)}${ST.pos !== m.pos ? ` <small>(usual: ${esc(POSITIONS[m.pos].label)})</small>` : ''}${animated ? '' : ' · <span class="muted">position and roles only</span>'}</p>
    <p>${esc(ST.geo?.txt || '')}</p>${m.note ? `<p class="muted">${esc(m.note)}</p>` : ''}
    ${m.am ? `<p><b>Workbook angles</b>: ${esc(m.am['Joint angles & range'])}</p><p><b>Line of force</b>: ${esc(m.am['Body position & line of force'])}</p>` : ''}
    ${Object.keys(ROLE).map((k) => `<details ${k === 'ag' ? 'open' : ''}><summary style="color:${ROLE[k][1]}">${ROLE[k][0]} (${R[k].size} meshes)</summary><ul class="ms-list">${list(k)}</ul></details>`).join('')}
    ${m.am ? `<details><summary>Tendons, ligaments, joints</summary><p><b>Tendons loaded</b>: ${esc(m.am['Tendons loaded'])}</p><p><b>Ligaments / capsule / fascia</b>: ${esc(m.am['Ligaments / capsule / fascia stressed'])}</p></details>` : ''}
    ${ST.roles.unmatched.length ? `<p class="muted">Workbook muscle words with no BodyParts3D mesh (not coloured): ${esc(ST.roles.unmatched.slice(0, 14).join(', '))}${ST.roles.unmatched.length > 14 ? '…' : ''}</p>` : ''}
    <p class="btnrow"><a class="ghost-btn" href="#train/anatomy/${encodeURIComponent(m.name)}">Open in Training 4D</a><button class="ghost-btn" id="ms-depth">Muscles layer</button><button class="ghost-btn" id="ms-bones">Bones only</button></p>
    ${ST.skinInfo && ST.skin ? `<p class="muted">${esc(ST.skinInfo)}.</p>` : ''}
    <p class="muted">Agonists, synergists and stabilisers: your workbook's Anatomy_Map. Antagonists: opposite joint action of each agonist group. Animation is schematic (angles from the workbook text, not measured); concentric / eccentric is read from the geometry of this pose in this position.</p>`;
  $('#ms-depth').onclick = () => { L.depth = 3; const d = $('#lab-depth'); if (d) d.value = 3; ST.ghost = false; $('#ms-ghost').checked = false; paint(); };
  $('#ms-bones').onclick = () => { L.depth = 1; const d = $('#lab-depth'); if (d) d.value = 1; ST.ghost = true; $('#ms-ghost').checked = true; paint(); };
}
