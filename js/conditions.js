// Condition cards for a (region, tissue layer) pair. All text is NLM's own:
// MeSH scope notes and public-domain MedlinePlus summaries, built by
// tools/anatomy_lab_conditions.py. Nothing here is model-written.

let data = null;
export async function loadConditions() {
  if (!data) data = fetch('/training-4D/rt/conditions.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return data;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LAYER_LABEL = { skin: 'Skin', muscles: 'Muscle & tendon', arteries: 'Arteries', veins: 'Veins', nerves: 'Nerves', skeleton: 'Bone & joint', organs: 'Organs' };

export function sectionsFor(D, region, layer) {
  if (!D) return [];
  const out = [];
  const R = D.regions[region];
  if (R) out.push({ title: `Injuries · ${R.label}`, kind: 'region', roots: R.roots, note: R.note });
  if (layer) {
    const roots = [...(D.tissues[layer] || []), ...(D.region_tissue_extra[`${region}|${layer}`] || [])];
    const uniq = [...new Set(roots)];
    if (uniq.length) out.push({ title: `${LAYER_LABEL[layer] || layer} conditions`, kind: 'tissue', roots: uniq,
      note: (D.tissues[layer] || []).length ? 'Tissue-level conditions can occur wherever this tissue is; they are not specific to this region.' : '' });
  }
  return out;
}

// Renders into `host`; keeps a filter box. Returns nothing.
export function renderConditions(host, D, region, layer, state = {}) {
  const secs = sectionsFor(D, region, layer);
  if (!D) { host.innerHTML = '<p class="muted">Conditions data not built. Run: .venv\\Scripts\\python.exe -m tools.anatomy_lab_conditions</p>'; return; }
  if (!secs.length) { host.innerHTML = '<p class="muted">Point at a body region.</p>'; return; }
  const key = `${region}|${layer}`;
  if (host.dataset.key === key) return; // unchanged: keep open cards and scroll position
  host.dataset.key = key;
  const active = state.tab && secs.some((s) => s.kind === state.tab) ? state.tab : secs[0].kind;
  host.innerHTML = `
    <div class="ctabs">${secs.map((s) => `<button class="ctab ${s.kind === active ? 'on' : ''}" data-kind="${s.kind}">${esc(s.title)}</button>`).join('')}</div>
    <input class="cfilter" type="search" placeholder="Filter conditions" aria-label="Filter conditions">
    <div class="clist"></div>
    <p class="fine">Definitions: MeSH scope notes (NLM). Summaries: MedlinePlus, U.S. National Library of Medicine (public domain). Imaging appearance per condition is not included yet (plan P3b).</p>`;
  const list = host.querySelector('.clist'), filter = host.querySelector('.cfilter');
  const draw = (kind) => {
    const s = secs.find((x) => x.kind === kind); const q = filter.value.trim().toLowerCase();
    let html = s.note ? `<p class="fine">${esc(s.note)}</p>` : '';
    for (const rootName of s.roots) {
      const root = D.roots[rootName]; if (!root) continue;
      const members = root.members.filter((u) => !q || D.nodes[u].name.toLowerCase().includes(q));
      html += `<div class="croot">${esc(rootName)} <small>${root.members.length} in MeSH ${esc(root.tree[0])}</small></div>`;
      html += members.slice(0, 80).map((u) => card(u, D.nodes[u])).join('');
      if (members.length > 80) html += `<p class="fine">${members.length - 80} more. Use the filter.</p>`;
    }
    list.innerHTML = html;
  };
  host.querySelectorAll('.ctab').forEach((b) => b.addEventListener('click', () => {
    host.querySelectorAll('.ctab').forEach((x) => x.classList.toggle('on', x === b)); state.tab = b.dataset.kind; draw(b.dataset.kind);
  }));
  filter.addEventListener('input', () => draw(host.querySelector('.ctab.on').dataset.kind));
  draw(active);
}

export function conditionCard(ui, n, open = false) { return card(ui, n).replace('<details class="cond">', `<details class="cond"${open ? ' open' : ''}>`); }

function card(ui, n) {
  const mp = n.mp.map((t) => `<div class="mp"><b>MedlinePlus: <a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.title)}</a></b><p>${esc(t.summary)}</p></div>`).join('');
  return `<details class="cond"><summary>${esc(n.name)}${n.mp.length ? ' <span class="grade gB" title="Has a MedlinePlus summary">MP</span>' : ''}</summary>
    ${n.scope ? `<p>${esc(n.scope)} <i class="muted">(MeSH ${esc(ui)})</i></p>` : `<p class="muted">No MeSH scope note. <a href="https://meshb.nlm.nih.gov/record/ui?ui=${esc(ui)}" target="_blank" rel="noopener">${esc(ui)}</a></p>`}
    ${mp}</details>`;
}
