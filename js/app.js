import { initMirrorUI } from './mirror.js';
import('./notes.js').then((m) => m.initNotes()).catch((e) => console.error('notes', e));
import('./notes.js').then((m) => m.initNotes()).catch((e) => console.error('notes', e));

let atlasLoaded = false;
let labLoaded = false;
let brainLoaded = false;

function setMode(mode) {
  const tab = mode === 'tissue' ? 'atlas' : mode; // Tissue, fascia & chains is the second view of the 3D Atlas tab
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === tab)));
  document.querySelectorAll('main.mode').forEach((m) => { m.hidden = m.id !== `mode-${mode}`; });
  if (mode === 'atlas' && !atlasLoaded) {
    atlasLoaded = true;
    import('./atlas.js').then((m) => m.startAtlas()).catch((e) => {
      document.querySelector('#atlas-status').textContent = `Atlas failed to load: ${e.message}`;
      console.error(e);
    });
  }
  if (mode === 'lab' && !labLoaded) {
    labLoaded = true;
    import('./motion_lab.js').then((m) => m.startMotionLab()).catch((e) => {
      document.querySelector('#lab-status').textContent = `Motion Lab failed to load: ${e.message}`;
      console.error(e);
    });
  }
  if (mode === 'brain' && !brainLoaded) {
    brainLoaded = true;
    import('./brain.js').then((m) => m.startBrain()).catch((e) => { document.querySelector('#brain-status').textContent = `Brain view failed to load: ${e.message}`; console.error(e); });
  }
  if (mode === 'molecular') import('./molecular.js').then((m) => m.startMolecular()).catch((e) => { document.querySelector('#mol-status').textContent = `Body systems failed to load: ${e.message}`; console.error(e); });
  if (mode === 'clinical') import('./clinical.js').then((m) => m.startClinical()).catch((e) => console.error(e));
  if (mode === 'tests') import('./tests.js').then((m) => m.startTests()).catch((e) => console.error(e));
  if (mode === 'genome') import('./genome.js').then((m) => m.startGenome()).catch((e) => console.error(e));
  if (mode === 'train') import('./training.js').then((m) => m.startTraining()).catch((e) => { const el = document.querySelector('#tr-main'); if (el) el.innerHTML = `<p class="muted">Training System failed to load: ${e.message}</p>`; console.error(e); });
  if (mode === 'tissue') import('./tissue.js').then((m) => m.startTissue()).catch((e) => { const el = document.querySelector('#tis-status'); if (el) el.textContent = `Tissue Lab failed to load: ${e.message}`; console.error(e); });
  if (mode === 'space') import('./space.js').then((m) => m.startSpace()).catch((e) => console.error(e));
  if (mode === 'about') import('./about.js').then((m) => m.startAbout()).catch((e) => console.error(e));
  if (mode === 'ext') import('./extensions.js').then((m) => m.startExtensions()).catch((e) => console.error(e));
  if (mode === 'imaging') import('./imaging.js').then((m) => m.startImaging()).catch((e) => console.error(e));
  if (mode === 'diag') {
    import('./motion_lab.js').then((m) => m.startMotionLab()).then(() => import('./diagnostics.js')).then((d) => d.startDiagnostics()).catch((e) => console.error(e));
  }
  if (location.hash.slice(1).split('/')[0] !== mode) history.replaceState(null, '', `#${mode}`);
  try { localStorage.setItem('anatomy-lab-mode', mode); } catch { /* storage may be blocked */ }
}

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
initMirrorUI();
const MODES = ['mirror', 'lab', 'diag', 'atlas', 'tissue', 'brain', 'molecular', 'clinical', 'tests', 'genome', 'imaging', 'train', 'space', 'ext', 'about'];
let saved = 'mirror';
try { saved = localStorage.getItem('anatomy-lab-mode') || 'mirror'; } catch { /* ignore */ }
const fromHash = () => MODES.find((m) => m === location.hash.slice(1).split('/')[0]);
setMode(fromHash() || saved); // a link like /#imaging opens that tab
window.addEventListener('hashchange', () => { const m = fromHash(); if (m) setMode(m); });
