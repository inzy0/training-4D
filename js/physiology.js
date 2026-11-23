// Physiology panel for the Body systems tab: cardiovascular and oxygen-transport
// quantities computed from the user's inputs with equations quoted from
// StatPearls chapters (verbatim sentence + chapter shown beside each result),
// and a live circulation animation on the 3D body at the chosen heart rate.
// Nothing is fitted or invented: each output is one stated equation applied to
// the inputs. The animation's pulse timing is visual only (not to scale).

import * as THREE from 'three';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SRC = {
  bsa: ['Body Surface Area', 'statpearls:article-18427', 'Mosteller [BSA = √(height in cm) x (weight in kg) / 3600]'],
  vo2rest: ['Physiology, Cardiac Output', 'statpearls:article-18897', 'VO2 (mL/min) = 125 (mL/min/m2) × body surface area (BSA; measured in m2). … For patients aged 70 or older, the equation is as follows: VO2 (mL/min) = 110 (mL/min/m2) × BSA (m2).'],
  o2: ['Calculating FICK Cardiac Output and Input', 'statpearls:article-161955', 'Blood oxygen content = Hgb (g/dL) × 1.31 (mL/g) × Measured O2 saturation. … The partial pressure of oxygen (PaO2) multiplied by the oxygen solubility coefficient (0.0031) determines the amount of dissolved oxygen, which is minimal compared to the oxygen bound to hemoglobin.'],
  co: ['Exercise Physiology', 'statpearls:article-21434', 'cardiac output—the amount of blood pumped by the heart in 1 minute, calculated as heart rate × stroke volume'],
  vo2: ['Exercise Physiology', 'statpearls:article-21434', 'VO2 = Cardiac output x (Arterial O2 - Venous O2)'],
  map: ['Physiology, Mean Arterial Pressure', 'statpearls:article-24804', 'MAP = DP + 1/3(SP – DP)'],
  tpr: ['Physiology, Cardiac Output', 'statpearls:article-18897', 'This can be represented by CO = MAP/TPR.'],
};
const INPUTS = [
  ['age', 'Age', 'y', 18, 90, 30, 1], ['height', 'Height', 'cm', 120, 210, 175, 1], ['weight', 'Weight', 'kg', 35, 150, 70, 1],
  ['hb', 'Haemoglobin', 'g/dL', 7, 20, 14, 0.1], ['sao2', 'Arterial O2 saturation', '%', 70, 100, 98, 1], ['svo2', 'Venous O2 saturation', '%', 20, 90, 75, 1],
  ['pao2', 'Arterial PO2', 'mmHg', 40, 120, 95, 1], ['hr', 'Heart rate', 'beats/min', 35, 210, 70, 1], ['sv', 'Stroke volume', 'mL', 30, 200, 70, 1],
  ['sp', 'Systolic pressure', 'mmHg', 80, 220, 120, 1], ['dp', 'Diastolic pressure', 'mmHg', 40, 130, 80, 1],
];
let P = null, A = null;

export function setupPhysiology(M) {
  P = Object.fromEntries(INPUTS.map(([k, , , , , v]) => [k, v]));
  const host = $('#mol-phys');
  host.innerHTML = `<div class="card-h"><h2>Physiology: circulation and oxygen transport</h2><label class="fine"><input id="ph-anim" type="checkbox" checked> Animate</label></div>
    <p class="fine muted">Set the inputs; every result is one equation from a StatPearls chapter (quoted below it). These are textbook relationships applied to your numbers, not a measurement of you and not advice.</p>
    <div class="ph-in">${INPUTS.map(([k, l, u, lo, hi, v, st]) => `<label class="fine">${l} <span class="mono" id="ph-v-${k}">${v} ${u}</span><input type="range" data-ph="${k}" min="${lo}" max="${hi}" step="${st}" value="${v}"></label>`).join('')}</div>
    <div id="ph-out" class="ph-out"></div>`;
  host.querySelectorAll('[data-ph]').forEach((el) => (el.oninput = () => { P[el.dataset.ph] = +el.value; const d = INPUTS.find((x) => x[0] === el.dataset.ph); $(`#ph-v-${el.dataset.ph}`).textContent = `${el.value} ${d[2]}`; compute(); }));
  $('#ph-anim').onchange = (e) => { A.on = e.target.checked; if (!A.on) reset(); };
  // circulation animation targets
  const heart = M.meshes.filter((m) => m.userData.tissues.includes('heart muscle'));
  const hc = new THREE.Box3(); heart.forEach((m) => hc.expandByObject(m)); const c = hc.isEmpty() ? new THREE.Vector3() : hc.getCenter(new THREE.Vector3());
  const art = M.meshes.filter((m) => m.userData.part.layer === 'arteries'), ven = M.meshes.filter((m) => m.userData.part.layer === 'veins');
  const dmax = Math.max(...art.map((m) => m.geometry.boundingSphere.center.distanceTo(c)), 0.1);
  A = { on: true, heart, art: art.map((m) => ({ m, d: m.geometry.boundingSphere.center.distanceTo(c) / dmax })), ven, t0: performance.now() };
  M.onTick = tick;
  compute();
}

function reset() { for (const m of [...A.heart, ...A.art.map((x) => x.m), ...A.ven]) { m.userData.anim = 0; } }

// each beat: the heart brightens (systole ~ first third of the beat), then a red wave runs out along the arteries
// (delay ~ distance from the heart); veins glow gently in counter-phase. Visual timing only.
function tick(now) {
  if (!A?.on || !P) return;
  const beat = 60000 / P.hr, ph = ((now - A.t0) % beat) / beat;
  const sys = ph < 0.33 ? Math.sin((Math.PI * ph) / 0.33) : 0;
  for (const m of A.heart) glow(m, 0xff3355, 0.25 + 0.75 * sys);
  for (const { m, d } of A.art) { const x = ph - d * 0.45; const w = x > 0 && x < 0.25 ? Math.sin((Math.PI * x) / 0.25) : 0; glow(m, 0xff2244, 0.15 + 0.85 * w); }
  const v = 0.35 + 0.25 * Math.sin(2 * Math.PI * (ph + 0.5));
  for (const m of A.ven) glow(m, 0x3366ff, v);
}
function glow(m, hex, k) {
  const u = m.userData; u.target.set(hex).multiplyScalar(0.55 + 0.45 * k); u.opT = 0.35 + 0.6 * k;
}

function compute() {
  const bsa = Math.sqrt((P.height * P.weight) / 3600);
  const vo2rest = (P.age >= 70 ? 110 : 125) * bsa;
  const cao2 = P.hb * 1.31 * (P.sao2 / 100) + 0.0031 * P.pao2, cvo2 = P.hb * 1.31 * (P.svo2 / 100);
  const co = (P.hr * P.sv) / 1000;
  const vo2 = co * (cao2 - cvo2) * 10; // L/min x mL O2/dL -> x10 for mL O2/L
  const map = P.dp + (P.sp - P.dp) / 3, tpr = map / co;
  const row = (label, val, unit, key, how) => { const s = SRC[key]; return `<div class="ph-row"><div><b>${label}</b> <span class="mono">${val} ${unit}</span><br><small>${how}</small></div><details><summary class="fine">source</summary><p class="fine about-t">“${esc(s[2])}”<br><i>${esc(s[0])}</i>, StatPearls (CC BY-NC-ND 4.0) · <a href="#clinical" data-cl="${s[1]}">open chapter</a></p></details></div>`; };
  $('#ph-out').innerHTML = [
    row('Body surface area', bsa.toFixed(2), 'm²', 'bsa', `√(${P.height} × ${P.weight} / 3600)`),
    row('Resting VO2 estimate', vo2rest.toFixed(0), 'mL/min', 'vo2rest', `${P.age >= 70 ? 110 : 125} × BSA`),
    row('Arterial O2 content', cao2.toFixed(1), 'mL O2/dL', 'o2', `${P.hb} × 1.31 × ${(P.sao2 / 100).toFixed(2)} + 0.0031 × ${P.pao2}`),
    row('Venous O2 content', cvo2.toFixed(1), 'mL O2/dL', 'o2', `${P.hb} × 1.31 × ${(P.svo2 / 100).toFixed(2)} (dissolved O2 not counted: venous PO2 is not an input)`),
    row('Cardiac output', co.toFixed(2), 'L/min', 'co', `${P.hr} beats/min × ${P.sv} mL`),
    row('Oxygen uptake (Fick)', vo2.toFixed(0), 'mL O2/min', 'vo2', `CO × (CaO2 − CvO2) = ${co.toFixed(2)} L/min × ${(cao2 - cvo2).toFixed(1)} mL/dL × 10 dL/L`),
    row('Mean arterial pressure', map.toFixed(0), 'mmHg', 'map', `${P.dp} + (${P.sp} − ${P.dp}) / 3`),
    row('Total peripheral resistance', tpr.toFixed(1), 'mmHg·min/L', 'tpr', `MAP / CO (right-atrial pressure ignored, as in the quoted form)`),
  ].join('') + `<p class="fine">${vo2 > vo2rest * 1.3 ? `Oxygen uptake from these inputs is ${(vo2 / vo2rest).toFixed(1)} × the resting estimate for this body size.` : 'Oxygen uptake from these inputs is close to the resting estimate for this body size.'} The animation runs at ${P.hr} beats/min.</p>`;
  $('#ph-out').querySelectorAll('[data-cl]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); location.hash = '#clinical'; import('./clinical.js').then((m) => m.startClinical(a.dataset.cl)); }));
}
