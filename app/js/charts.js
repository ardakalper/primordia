// Small canvas charts following the dataviz rules: one axis, hairline recessive grid, 2px lines,
// species stack in sticky slot colours with "Other" last, crosshair + tooltip on hover.
import { SLOT_COLORS, OTHER_COLOR } from './render.js';

const INK = '#c9d1d9', GRID = '#18222c', AXIS = '#6b7885';

function setup(canvas) {
  const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}
const PAD = { l: 34, r: 8, t: 6, b: 16 };
function frame(ctx, w, h, yMax, yMin = 0, fmt = (v) => String(Math.round(v))) {
  ctx.font = '10px "Share Tech Mono", monospace'; ctx.fillStyle = AXIS; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const f of [0, 0.5, 1]) {
    const y = PAD.t + (1 - f) * (h - PAD.t - PAD.b);
    ctx.strokeStyle = GRID; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(PAD.l, Math.round(y) + 0.5); ctx.lineTo(w - PAD.r, Math.round(y) + 0.5); ctx.stroke();
    ctx.fillText(fmt(yMin + (yMax - yMin) * f), PAD.l - 5, y);
  }
}
const xOf = (i, n, w) => PAD.l + (n <= 1 ? 0 : (i / (n - 1)) * (w - PAD.l - PAD.r));
const yOf = (v, lo, hi, h) => PAD.t + (1 - (v - lo) / (hi - lo || 1)) * (h - PAD.t - PAD.b);

export function lineChart(canvas, samples, key, { fmt, hover = null, range = null } = {}) {
  const { ctx, w, h } = setup(canvas);
  const vals = samples.map((s) => s[key]);
  let lo = range ? range[0] : 0, hi = range ? range[1] : Math.max(1e-9, ...vals) * 1.1;
  if (!range && Math.min(...vals) > hi * 0.4) lo = Math.min(...vals) * 0.85; // zoom in on slow drifts
  frame(ctx, w, h, hi, lo, fmt);
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.beginPath();
  vals.forEach((v, i) => { const x = xOf(i, vals.length, w), y = yOf(v, lo, hi, h); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
  ctx.stroke();
  if (hover != null && vals.length) {
    const x = xOf(hover, vals.length, w), y = yOf(vals[hover], lo, hi, h);
    ctx.strokeStyle = AXIS; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, PAD.t); ctx.lineTo(Math.round(x) + 0.5, h - PAD.b); ctx.stroke();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#0d1319'; ctx.lineWidth = 2; ctx.stroke();
  }
}

// stacked area of living-slot species + "Other"; series = [{ id, color, name }] in slot order
export function speciesChart(canvas, samples, series, { hover = null } = {}) {
  const { ctx, w, h } = setup(canvas);
  const n = samples.length;
  const totals = samples.map((s) => s.pop);
  const hi = Math.max(10, ...totals) * 1.08;
  frame(ctx, w, h, hi);
  const ids = series.map((s) => s.id);
  const layers = series.map((s) => samples.map((smp) => smp.bySpecies[s.id] ?? 0));
  const other = samples.map((smp, i) => smp.pop - layers.reduce((a, l) => a + l[i], 0));
  const all = [...layers, other], colors = [...series.map((s) => s.color), OTHER_COLOR];
  const base = new Array(n).fill(0);
  all.forEach((layer, li) => {
    const top = base.map((b, i) => b + layer[i]);
    ctx.fillStyle = colors[li]; ctx.beginPath();
    top.forEach((v, i) => { const x = xOf(i, n, w), y = yOf(v, 0, hi, h); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(xOf(i, n, w), yOf(base[i], 0, hi, h));
    ctx.closePath(); ctx.fill();
    // 2px surface gap between stacked fills
    ctx.strokeStyle = '#0d1319'; ctx.lineWidth = 2; ctx.beginPath();
    top.forEach((v, i) => { const x = xOf(i, n, w), y = yOf(v, 0, hi, h); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.stroke();
    for (let i = 0; i < n; i++) base[i] = top[i];
  });
  if (hover != null && n) { const x = xOf(hover, n, w); ctx.strokeStyle = '#e6edf3'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, PAD.t); ctx.lineTo(Math.round(x) + 0.5, h - PAD.b); ctx.stroke(); }
  return { ids, other };
}

export const hoverIndex = (canvas, clientX, n) => {
  const r = canvas.getBoundingClientRect();
  const f = (clientX - r.left - PAD.l) / (r.width - PAD.l - PAD.r);
  return Math.max(0, Math.min(n - 1, Math.round(f * (n - 1))));
};
export { SLOT_COLORS };
