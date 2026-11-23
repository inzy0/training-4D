// Clinical overlay and surgery sandbox for the 3D Atlas.
//
// Overlay: structures of the reference body named in a StatPearls chapter are
// highlighted (blue), those named in its Complications section in red, the
// rest is ghosted. Sandbox (procedure chapters): step through the chapter's own
// "Technique" / "Preparation" paragraphs; each step lights up the structures it
// names (yellow). Dissect tool: click the body to remove the outermost visible
// layer around that spot (skin, then muscle, then vessels...), click again to
// go deeper; Undo / Reset. It is an anatomy exploration tool, not a surgical
// simulator: there is no tissue mechanics, bleeding or instrument model, and
// the text is the chapter's, unchanged.

import * as THREE from 'three';
import { structuresIn } from './clinical.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const M = {
  named: new THREE.MeshPhysicalMaterial({ color: 0x4cc9f0, emissive: 0x2a7fff, emissiveIntensity: 0.35, roughness: 0.45, side: THREE.DoubleSide }),
  risk: new THREE.MeshPhysicalMaterial({ color: 0xff4d6d, emissive: 0xff2040, emissiveIntensity: 0.4, roughness: 0.45, side: THREE.DoubleSide }),
  step: new THREE.MeshPhysicalMaterial({ color: 0xffd166, emissive: 0xffb000, emissiveIntensity: 0.55, roughness: 0.4, side: THREE.DoubleSide }),
  ghost: new THREE.MeshPhysicalMaterial({ color: 0x9fc4ff, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide }),
};
let S = null, O = null, undo = [];
const base = (n) => n.replace(/\b(left|right) /, '');

export function setupSurgery(state) {
  S = state;
  window.__atlas = window.__atlas || {};
  window.__atlas.clinical = (p) => apply(p);
  S.onPickPoint = (point) => { if (!S.dissect) return false; dissectAt(point); return true; };
  if (window.__pendingAtlas) { const p = window.__pendingAtlas; window.__pendingAtlas = null; setTimeout(() => apply(p), 50); }
}

function paint(stepNames = null) {
  const named = new Set(O.names), risk = new Set(O.atRisk), step = new Set(stepNames || []);
  for (const m of S.meshes) {
    if (m.userData.dissected) continue;
    const b = base(m.userData.part.name);
    m.userData.baseMat = m.userData.baseMat || S.layerState.get(m.userData.part.layer).mat;
    m.material = step.has(b) ? M.step : risk.has(b) ? M.risk : named.has(b) ? M.named : (O.ghost ? M.ghost : m.userData.baseMat);
    m.visible = true;
  }
}
function focusOn(names) {
  const set = new Set(names), box = new THREE.Box3();
  S.meshes.forEach((m) => { if (set.has(base(m.userData.part.name))) box.expandByObject(m); });
  if (box.isEmpty() || !S.pc) return;
  const c = box.getCenter(new THREE.Vector3()), r = Math.max(0.08, box.getSize(new THREE.Vector3()).length() * 0.9);
  S.pc.flyTo(c, r);
}

async function apply(p) {
  O = { ...p, ghost: true, step: 0 };
  undo = []; S.meshes.forEach((m) => { m.userData.dissected = false; });
  paint(); focusOn(p.names);
  const card = $('#atlas-clinical'); card.hidden = false;
  const steps = p.sandbox ? p.sandbox.sections.filter((s) => /^(Preparation|Technique)/i.test(s.name)).flatMap((s) => s.text.split('\n\n').map((t) => ({ sec: s.name, t }))) : [];
  O.steps = steps;
  card.innerHTML = `<div class="card-h"><h2>${p.sandbox ? 'Surgery sandbox' : 'Clinical overlay'}</h2><button class="ghost-btn" id="cs-clear">Clear</button></div>
    <p class="fine"><b>${esc(p.title)}</b></p>
    <p class="fine"><span class="cl-tag">named in the chapter</span><span class="cl-tag risk">named under Complications</span>${p.sandbox ? '<span class="cl-tag step">named in this step</span>' : ''}</p>
    <label class="fine"><input type="checkbox" id="cs-ghost" checked> Ghost everything else</label>
    ${p.sandbox ? `<div class="cs-steps"><p class="btnrow"><button class="ghost-btn" id="cs-prev">‹ Step</button><span id="cs-pos" class="mono"></span><button class="ghost-btn" id="cs-next">Step ›</button><button class="primary small" id="cs-play">▶ Play procedure</button></p>
      <label class="fine"><input type="checkbox" id="cs-reveal" checked> Reveal: peel back the layers covering the structures each step names</label>
      <label class="fine">Seconds per step <input id="cs-sec" type="range" min="3" max="20" value="7"> <span id="cs-secv" class="mono">7</span></label>
      <div id="cs-text" class="fine cs-text"></div></div>` : ''}
    <p class="btnrow"><button class="ghost-btn" id="cs-dissect">Dissect tool: off</button><button class="ghost-btn" id="cs-undo">Undo</button><button class="ghost-btn" id="cs-reset">Reset layers</button></p>
    <label class="fine">Dissection radius <input id="cs-rad" type="range" min="10" max="120" value="45"> <span id="cs-radv" class="mono">45 mm</span></label>
    <p class="fine muted">Dissect: click the body to remove the outermost layer around that point; click again to go deeper. Exploration of the anatomy only: no tissue mechanics, bleeding or instruments are modelled. Step text is the chapter's own, unchanged.</p>`;
  $('#cs-clear').onclick = clear;
  $('#cs-ghost').onchange = (e) => { O.ghost = e.target.checked; paint(O.stepNames); };
  $('#cs-dissect').onclick = () => { S.dissect = !S.dissect; $('#cs-dissect').textContent = `Dissect tool: ${S.dissect ? 'ON' : 'off'}`; $('#cs-dissect').classList.toggle('on', S.dissect); };
  $('#cs-undo').onclick = () => { const last = undo.pop(); if (last) last.forEach((m) => { m.userData.dissected = false; m.visible = true; }); };
  $('#cs-reset').onclick = () => { undo = []; S.meshes.forEach((m) => { m.userData.dissected = false; m.visible = true; }); paint(O.stepNames); };
  $('#cs-rad').oninput = (e) => { $('#cs-radv').textContent = `${e.target.value} mm`; };
  if (p.sandbox) {
    $('#cs-prev').onclick = () => showStep(O.step - 1); $('#cs-next').onclick = () => showStep(O.step + 1);
    $('#cs-sec').oninput = (e) => { $('#cs-secv').textContent = e.target.value; };
    $('#cs-play').onclick = () => {
      if (O.timer) { clearInterval(O.timer); O.timer = null; $('#cs-play').textContent = '▶ Play procedure'; return; }
      $('#cs-play').textContent = '■ Pause';
      const tick = () => { if (O.step >= O.steps.length - 1) { clearInterval(O.timer); O.timer = null; $('#cs-play').textContent = '▶ Play procedure'; return; } showStep(O.step + 1); };
      O.timer = setInterval(tick, +$('#cs-sec').value * 1000);
    };
    showStep(0);
  }
}
async function showStep(i) {
  if (!O.steps.length) { $('#cs-text').innerHTML = '<span class="muted">This chapter has no Preparation / Technique paragraphs.</span>'; return; }
  O.step = Math.max(0, Math.min(O.steps.length - 1, i));
  const st = O.steps[O.step];
  const names = await structuresIn({ sections: [{ text: st.t }] });
  O.stepNames = names;
  $('#cs-pos').textContent = `${O.step + 1} / ${O.steps.length}`;
  $('#cs-text').innerHTML = `<small>${esc(st.sec)}</small><p>${esc(st.t)}</p>${names.length ? `<p><b>Named here:</b> ${names.map((n) => `<span class="cl-tag step">${esc(n)}</span>`).join('')}</p>` : '<p class="muted">No structure of the model is named in this paragraph.</p>'}`;
  paint(names); if (names.length) { focusOn(names); if ($('#cs-reveal')?.checked) revealAround(names); }
}
// peel back outer layers that cover the named structures: meshes of a more superficial layer whose bounding
// sphere overlaps a named structure's are hidden (undoable as one step). A view of access to the anatomy, not a technique.
function revealAround(names) {
  const order = S.atlas.index.layers.map((L) => L.key), set = new Set(names);
  const targets = S.meshes.filter((m) => set.has(base(m.userData.part.name)));
  const gone = [];
  for (const t of targets) {
    const c = t.geometry.boundingSphere.center, r = t.geometry.boundingSphere.radius, depth = order.indexOf(t.userData.part.layer);
    for (const m of S.meshes) {
      if (!m.visible || m.userData.dissected || set.has(base(m.userData.part.name))) continue;
      if (order.indexOf(m.userData.part.layer) >= depth) continue;
      const mc = m.geometry.boundingSphere.center, mr = m.geometry.boundingSphere.radius;
      if (mc.distanceTo(c) < r + Math.min(mr, 0.12) * 0.6 + 0.01) { m.visible = false; m.userData.dissected = true; gone.push(m); }
    }
  }
  if (gone.length) { undo.push(gone); const st = $('#atlas-status'); if (st) st.textContent = `Revealed: ${gone.length} covering structure${gone.length === 1 ? '' : 's'} hidden (${[...new Set(gone.map((m) => m.userData.part.layer))].join(', ')})`; }
}
function clear() {
  if (O?.timer) clearInterval(O.timer);
  O = null; S.dissect = false; undo = [];
  S.meshes.forEach((m) => { m.userData.dissected = false; m.visible = true; m.material = m.userData.baseMat || m.material; });
  S.applyVisibility?.(); $('#atlas-clinical').hidden = true;
}
function dissectAt(p) {
  const R = +($('#cs-rad')?.value || 45) / 1000;
  const order = S.atlas.index.layers.map((L) => L.key); // outer -> inner
  const near = S.meshes.filter((m) => m.visible && !m.userData.dissected && m.geometry.boundingSphere.center.distanceTo(p) < R + m.geometry.boundingSphere.radius * 0.5);
  if (!near.length) return;
  const outer = order.find((k) => near.some((m) => m.userData.part.layer === k));
  const gone = near.filter((m) => m.userData.part.layer === outer);
  gone.forEach((m) => { m.visible = false; m.userData.dissected = true; });
  undo.push(gone);
  const msg = $('#atlas-status'); if (msg) msg.textContent = `Dissected ${gone.length} ${outer} structure${gone.length === 1 ? '' : 's'} within ${Math.round(R * 1000)} mm: ${gone.slice(0, 4).map((m) => m.userData.part.name).join(', ')}${gone.length > 4 ? '…' : ''}`;
}
