// About tab: creator, purpose, education-only notice, privacy and full credits. Kept out of the header so the top of
// every page stays clear (owner request 2026-11-24).
import { CREDITS } from './credits.js';

const $ = (s) => document.querySelector(s);

export function startAbout() {
  const host = $('#about-body'); if (!host || host.dataset.ok) return; host.dataset.ok = '1';
  const pub = !!window.__STATIC_SITE;
  const img = document.querySelector('.author img')?.getAttribute('src') || '/training-4D/img/author.jpg';
  host.innerHTML = `
  <section class="card about-hero">
    <img class="about-photo" src="${img}" alt="Inzamam Shaikh" width="120" height="120">
    <div><small class="mini">Created by</small><h2>Inzamam Shaikh</h2>
      <p><a href="https://www.linkedin.com/in/dr-inzamam-shaikh-pt-05059a199/" target="_blank" rel="noopener noreferrer">LinkedIn profile</a></p>
      <p class="fine">Meridian Anatomy Lab and Training 4D: anatomy, movement and training, built from openly licensed sources and the creator's own training system.</p></div>
  </section>
  <section class="card"><div class="card-h"><h2>What this is for</h2></div>
    <p>Learning and research in anatomy, biomechanics and training: a live skeletal mirror and Motion Lab 4D, a layer-by-layer 3D atlas with tissue, fascia and fascial chains, imaging, body systems, DNA to protein, clinical reading, and the Training 4D system (library, programs, divisions, performance, builder).</p>
    <p><b>Education and research only.</b> It is not a medical device, gives no diagnosis and is not medical advice. Overlays sit on surface landmarks and one reference anatomy. Forces and moments are estimates from mechanics, not measurements. If you have pain, an injury or a concern, see a qualified clinician.</p>
    <p class="fine">Text from sources is quoted unchanged with its licence and citation. No AI model writes any of the content shown here.</p></section>
  <section class="card"><div class="card-h"><h2>Privacy</h2></div>
    <ul>
      <li>The camera runs on your own device (MediaPipe in the browser). No frames leave it.</li>
      <li>Notes, labels, recordings, your profile, athletes and builder work stay in this browser${pub ? '' : ' or on this computer'}; accounts are on-device only, and you can export or import a backup.</li>
      ${pub ? '<li>This public copy runs Training 4D in your browser on a privacy-cleaned copy of the workbook. Nothing you enter is sent anywhere.</li>' : ''}
    </ul></section>
  <section class="card"><div class="card-h"><h2>Credits and licences</h2></div>${CREDITS}</section>
  <p class="fine">Free and non-commercial.</p>`;
}
