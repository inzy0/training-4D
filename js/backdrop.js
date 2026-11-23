// Meridian 4D background: base gradient, aurora fields, perspective grid floor (CSS, css/theme.css) and a canvas
// with a slowly rotating tesseract (a 4D hypercube, rotated in the XW and ZW planes and projected 4D -> 3D -> 2D)
// over a parallax star field. Runs at ~30 fps, pauses when the tab is hidden, draws one still frame when the visitor
// prefers reduced motion. Theme presets (aurora / ocean / ember / mono) are switched with the Theme chip.

const THEMES = ['aurora', 'ocean', 'ember', 'mono'];
const LABEL = { aurora: 'Aurora', ocean: 'Ocean', ember: 'Ember', mono: 'Mono' };
let theme = 'aurora';
try { theme = localStorage.getItem('mx-theme') || 'aurora'; } catch { /* storage blocked */ }
if (!THEMES.includes(theme)) theme = 'aurora';
document.documentElement.dataset.theme = theme;

function layers() {
  const mk = (id, tag = 'div') => { const e = document.createElement(tag); e.id = id; e.className = 'bg-layer'; e.setAttribute('aria-hidden', 'true'); return e; };
  const base = mk('bg-base'), aur = mk('bg-aurora'), grid = mk('bg-grid'), field = mk('bg-field', 'canvas'), vig = mk('bg-vignette');
  aur.innerHTML = '<i></i><i></i><i></i>';
  document.body.prepend(base, aur, grid, field, vig);
  return field;
}

function themeChip() {
  const host = document.querySelector('header .chips'); if (!host) return;
  const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.id = 'theme-btn';
  const set = () => { b.innerHTML = `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--grad);margin-right:6px;vertical-align:-1px"></span>${LABEL[theme]}`; b.title = 'Change the colour theme'; };
  set();
  b.onclick = () => { theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]; document.documentElement.dataset.theme = theme; try { localStorage.setItem('mx-theme', theme); } catch { /* blocked */ } set(); colors = readColors(); };
  host.prepend(b);
}

let colors = null;
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  return ['--accent', '--accent2', '--accent3'].map((k) => cs.getPropertyValue(k).trim() || '#8b7bff');
}

function field(canvas) {
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, dpr = 1, mx = 0, my = 0;
  const resize = () => { dpr = Math.min(1.5, devicePixelRatio || 1); W = innerWidth; H = innerHeight; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  addEventListener('resize', resize); resize();
  addEventListener('pointermove', (e) => { mx = e.clientX / W - 0.5; my = e.clientY / H - 0.5; }, { passive: true });
  // tesseract: 16 vertices (±1)^4, 32 edges between vertices differing in one coordinate
  const V = []; for (let i = 0; i < 16; i++) V.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1]);
  const E = []; for (let i = 0; i < 16; i++) for (let b = 0; b < 4; b++) { const j = i ^ (1 << b); if (j > i) E.push([i, j]); }
  const stars = Array.from({ length: Math.round(Math.min(220, (W * H) / 9000)) }, () => ({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random(), s: Math.random() }));
  const hex = (c, a) => { const m = c.match(/^#([0-9a-f]{6})$/i); if (!m) return c; const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  colors = readColors();
  let last = 0;
  const draw = (t) => {
    ctx.clearRect(0, 0, W, H);
    const [c1, c2, c3] = colors, time = t / 1000;
    // stars, drifting toward the viewer, with parallax on the pointer
    for (const s of stars) {
      if (!reduce) { s.z -= 0.0009; if (s.z <= 0.02) { s.z = 1; s.x = Math.random() * 2 - 1; s.y = Math.random() * 2 - 1; } }
      const k = 0.35 / s.z, x = W / 2 + (s.x * W * k) / 2 - mx * 30 * (1 - s.z), y = H / 2 + (s.y * H * k) / 2 - my * 30 * (1 - s.z);
      if (x < 0 || x > W || y < 0 || y > H) continue;
      ctx.fillStyle = hex(s.s > 0.66 ? c1 : s.s > 0.33 ? c2 : c3, 0.15 + 0.55 * (1 - s.z)); ctx.beginPath(); ctx.arc(x, y, 0.4 + 1.3 * (1 - s.z), 0, 6.283); ctx.fill();
    }
    // tesseract
    const a = time * 0.22, b = time * 0.15, c = time * 0.09;
    const P = V.map(([x, y, z, w]) => {
      let X = x * Math.cos(a) - w * Math.sin(a), Wd = x * Math.sin(a) + w * Math.cos(a); // XW rotation
      let Z = z * Math.cos(b) - Wd * Math.sin(b); Wd = z * Math.sin(b) + Wd * Math.cos(b); // ZW rotation
      let Y = y * Math.cos(c) - Z * Math.sin(c); Z = y * Math.sin(c) + Z * Math.cos(c);   // YZ rotation (3D)
      const k4 = 1.9 / (3 - Wd); X *= k4; Y *= k4; Z *= k4;                                // 4D -> 3D
      const k3 = 1 / (3.2 - Z), R = Math.min(W, H) * 0.34;                               // 3D -> 2D
      return [W * 0.74 + X * k3 * R - mx * 18, H * 0.42 + Y * k3 * R - my * 18, Wd];
    });
    const g = ctx.createLinearGradient(W * 0.55, H * 0.15, W * 0.95, H * 0.7); g.addColorStop(0, hex(c1, 0.55)); g.addColorStop(0.5, hex(c2, 0.5)); g.addColorStop(1, hex(c3, 0.45));
    ctx.strokeStyle = g; ctx.lineWidth = 1.1;
    for (const [i, j] of E) { ctx.globalAlpha = 0.25 + 0.35 * ((P[i][2] + P[j][2]) / 4 + 0.5); ctx.beginPath(); ctx.moveTo(P[i][0], P[i][1]); ctx.lineTo(P[j][0], P[j][1]); ctx.stroke(); }
    ctx.globalAlpha = 1;
    for (const p of P) { ctx.fillStyle = hex(c1, 0.8); ctx.beginPath(); ctx.arc(p[0], p[1], 1.6 + (p[2] + 1), 0, 6.283); ctx.fill(); }
  };
  const loop = (t) => { if (!document.hidden && t - last > 33) { last = t; draw(t); } requestAnimationFrame(loop); };
  if (reduce) { draw(0); addEventListener('resize', () => draw(0)); } else requestAnimationFrame(loop);
}

function init() { const c = layers(); themeChip(); field(c); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
