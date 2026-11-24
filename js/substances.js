// Tests & labs → "Longevity & recovery substances": prescription drugs studied for ageing, supplements, recovery /
// performance aids, and hormones / peptides / "boosters". Everything shown is from a primary source, unchanged:
// FDA label (openFDA, CC0), LiverTox (NIDDK, copyright free), NCCIH (public domain), DEA schedules, and PMC OA titles.
// No doses. Being listed is not a recommendation. Built by tools/longevity_substances_build.py.

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let D = null, grp = 'all', cur = null;

export async function startSubstances() {
  D ||= await fetch('/training-4D/rt/clinical/longevity.json').then((r) => r.json());
  const counts = {}; D.substances.forEach((s) => { counts[s.group] = (counts[s.group] || 0) + 1; });
  $('#ts-cats').innerHTML = `<button class="ghost-btn ${grp === 'all' ? 'on' : ''}" data-g="all">All substances <small>${D.substances.length}</small></button>` +
    Object.entries(D.groups).map(([k, v]) => `<button class="ghost-btn ${grp === k ? 'on' : ''}" data-g="${k}">${esc(v)} <small>${counts[k] || 0}</small></button>`).join('');
  $('#ts-sys').innerHTML = '<span class="fine">Substances view · no doses are shown · listing is not a recommendation · several are prescription-only, unapproved, or prohibited in sport.</span>';
  $('#ts-cats').querySelectorAll('[data-g]').forEach((b) => (b.onclick = () => { grp = b.dataset.g; startSubstances(); }));
  $('#ts-q').oninput = list;
  list();
  if (!cur) overview(); else open(cur.id);
}

function list() {
  const q = $('#ts-q').value.trim().toLowerCase();
  const xs = D.substances.filter((s) => (grp === 'all' || s.group === grp) && (!q || s.name.toLowerCase().includes(q)));
  $('#ts-list').innerHTML = xs.map((s) => `<li data-sid="${s.id}" class="${cur?.id === s.id ? 'on' : ''}"><span>${esc(s.name)}</span><small>${esc(s.kind)} · ${s.research.n.toLocaleString()} studies${s.fda ? ' · FDA label' : ''}${s.livertox?.score ? ` · LiverTox ${esc(s.livertox.score)}` : ''}</small></li>`).join('') || '<li class="muted">No match.</li>';
  $('#ts-list').querySelectorAll('[data-sid]').forEach((li) => (li.onclick = () => open(li.dataset.sid)));
  $('#ts-count').textContent = `${xs.length} of ${D.substances.length}`;
}

function overview() {
  const rows = D.substances.filter((s) => grp === 'all' || s.group === grp).sort((a, b) => b.research.n - a.research.n);
  const mx = Math.max(...rows.map((s) => s.research.n), 1);
  $('#ts-reader').innerHTML = `<h2 class="cl-h">Longevity &amp; recovery substances</h2>
    <p class="fine">Research volume: open-access article titles naming each substance (bar), and how many of those also name its ageing or recovery / performance use (number in brackets). Volume is not evidence of benefit.</p>
    <div class="sb-bars">${rows.map((s) => `<a href="#" data-sid="${s.id}" class="sb-row"><span>${esc(s.name)}</span><i style="width:${(100 * s.research.n / mx).toFixed(1)}%"></i><small>${s.research.n.toLocaleString()} (${s.research.n_use.toLocaleString()})</small></a>`).join('')}</div>
    <p class="fine cite">${esc(D.sources)}. ${esc(D.rule)}</p>`;
  $('#ts-reader').querySelectorAll('[data-sid]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); open(a.dataset.sid); }));
}

function open(id) {
  const s = D.substances.find((x) => x.id === id); if (!s) return; cur = s; list();
  window.__noteCtx = { hash: 'tests', id: `sub:${id}`, label: s.name };
  const art = (r) => `<li><a href="https://pmc.ncbi.nlm.nih.gov/articles/${esc(r.pmcid)}/" target="_blank" rel="noopener">${esc(r.title)}</a> <small>${esc(r.journal || '')} ${esc(r.year || '')}</small></li>`;
  const F = s.fda, L = s.livertox, N = s.nccih, R = s.research;
  $('#ts-reader').innerHTML = `<h2 class="cl-h">${esc(s.name)} <small>${esc(D.groups[s.group])}</small></h2>
    <p><span class="ts-tag">${esc(s.kind)}</span>${F ? ` <span class="ts-tag">FDA label: ${esc(F.type)}</span>` : ''}${s.dea ? s.dea.map((d) => ` <span class="ts-tag">DEA Schedule ${esc(d.schedule)}</span>`).join('') : ''}</p>
    ${F ? `<section class="ts-sec"><h3>FDA label (${esc(F.generic)})</h3>${F.epc ? `<p class="fine">Class: ${esc(F.epc)}</p>` : ''}
      ${F.boxed_warning ? `<p class="sb-box"><b>Boxed warning.</b> ${esc(F.boxed_warning)}</p>` : ''}
      ${F.indications ? `<p><b>Indications and usage.</b> ${esc(F.indications)}</p>` : ''}${F.contraindications ? `<p><b>Contraindications.</b> ${esc(F.contraindications)}</p>` : ''}
      <p class="fine cite">openFDA structured product label (CC0)${F.setid ? ` · <a href="https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=${esc(F.setid)}" target="_blank" rel="noopener">DailyMed</a>` : ''}. Shortened; dosage sections are not shown. Approved uses only; ageing or recovery use is not an approved indication unless the label says so.</p></section>` : ''}
    ${L ? `<section class="ts-sec"><h3>Liver safety (LiverTox)</h3>${L.score ? `<p><b>Likelihood score ${esc(L.score)}</b>${L.meaning ? `: ${esc(L.meaning)}` : ''}</p>` : ''}<p>${esc(L.overview)}</p>
      <p class="fine cite"><a href="${esc(L.url)}" target="_blank" rel="noopener">LiverTox: ${esc(L.title)}</a>, NIDDK (copyright free).</p></section>` : ''}
    ${N ? `<section class="ts-sec"><h3>NCCIH: ${esc(N.title)}</h3>${Object.entries(N.sections).map(([h, t]) => `<p><b>${esc(h)}</b> ${esc(t)}</p>`).join('')}<p class="fine cite"><a href="${esc(N.url)}" target="_blank" rel="noopener">NCCIH Herbs at a Glance</a> (public domain; no endorsement implied).</p></section>` : ''}
    ${!F && !L && !N ? '<p class="muted">No FDA label, LiverTox chapter or NCCIH page covers this substance in the local sources. What exists is the research below.</p>' : ''}
    <section class="ts-sec"><h3>Research</h3><p class="fine"><b>${R.n.toLocaleString()}</b> open-access article titles name it; <b>${R.n_use.toLocaleString()}</b> of them also name ${esc(R.use_label)}.</p>
      ${R.reviews.length ? `<p class="fine"><b>Newest systematic reviews / guidelines</b></p><ul class="ts-q">${R.reviews.map(art).join('')}</ul>` : ''}
      ${R.rcts.length ? `<p class="fine"><b>Newest randomised trials</b></p><ul class="ts-q">${R.rcts.map(art).join('')}</ul>` : ''}</section>
    ${s.group === 'horm' ? '<p class="sb-box">Prescription-only, unapproved or prohibited in sport. Athletes: check the <a href="https://www.wada-ama.org/en/prohibited-list" target="_blank" rel="noopener">WADA Prohibited List</a> and <a href="https://www.globaldro.com/" target="_blank" rel="noopener">Global DRO</a>.</p>' : ''}
    <p class="fine cite">Education only; not advice for any person and no doses. Supplements can be contaminated: see Informed Sport and similar certifiers in Extensions.</p>`;
  $('#ts-reader').scrollTop = 0;
}
