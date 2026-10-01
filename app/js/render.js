// Drawing: the world view (torus-aware camera), creature portraits and brain diagrams.
import { wrapDelta, N_IN, N_HID, N_OUT, hashString } from './sim.js';

export const SLOT_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9'];
export const OTHER_COLOR = '#56616d';

// Species colour slots are sticky: a species keeps its slot while alive (colour follows the entity).
export class SlotMap {
  constructor() { this.slots = new Map(); }
  update(world) {
    const alive = [...world.species.values()].filter((s) => s.count > 0).sort((a, b) => b.count - a.count || a.id - b.id);
    for (const id of [...this.slots.keys()]) { const s = world.species.get(id); if (!s || s.count === 0 || !alive.slice(0, 12).includes(s)) this.slots.delete(id); }
    const used = new Set(this.slots.values());
    for (const s of alive.slice(0, SLOT_COLORS.length)) {
      if (this.slots.has(s.id)) continue;
      const free = SLOT_COLORS.findIndex((_, i) => !used.has(i));
      if (free < 0) break;
      this.slots.set(s.id, free); used.add(free);
    }
  }
  color(speciesId) { const i = this.slots.get(speciesId); return i == null ? OTHER_COLOR : SLOT_COLORS[i]; }
  has(speciesId) { return this.slots.has(speciesId); }
}

export class Camera {
  constructor() { this.cx = 0; this.cy = 0; this.zoom = 1; this.fit = 1; }
  reset(world, w, h) { this.cx = world.settings.width / 2; this.cy = world.settings.height / 2; this.fit = Math.min(w / world.settings.width, h / world.settings.height); this.zoom = this.fit; }
  toScreen(world, x, y, w, h) { return [wrapDelta(x - this.cx, world.settings.width) * this.zoom + w / 2, wrapDelta(y - this.cy, world.settings.height) * this.zoom + h / 2]; }
  toWorld(world, sx, sy, w, h) {
    const W = world.settings.width, H = world.settings.height;
    return [(((this.cx + (sx - w / 2) / this.zoom) % W) + W) % W, (((this.cy + (sy - h / 2) / this.zoom) % H) + H) % H];
  }
}

export function drawWorld(ctx, world, cam, slots, { selected = null, w, h, dpr = 1 }) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const z = cam.zoom;
  // fertile patches as faint glows
  for (const p of world.patches) {
    const [x, y] = cam.toScreen(world, p.x, p.y, w, h);
    const g = ctx.createRadialGradient(x, y, 0, x, y, p.r * z);
    g.addColorStop(0, 'rgba(63, 208, 201, 0.06)'); g.addColorStop(1, 'rgba(63, 208, 201, 0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, p.r * z, 0, Math.PI * 2); ctx.fill();
  }
  // food
  const fr = Math.max(1, 1.6 * z);
  for (const f of world.food) {
    const [x, y] = cam.toScreen(world, f.x, f.y, w, h);
    if (x < -4 || y < -4 || x > w + 4 || y > h + 4) continue;
    ctx.fillStyle = f.kind === 'plant' ? '#3f7d5c' : '#8a3b2e';
    ctx.fillRect(x - fr / 2, y - fr / 2, fr, fr);
  }
  // creatures
  for (const c of world.creatures) {
    const [x, y] = cam.toScreen(world, c.x, c.y, w, h);
    const r = c.r * z;
    if (x < -r - 8 || y < -r - 8 || x > w + r + 8 || y > h + r + 8) continue;
    const col = slots.color(c.species);
    const carn = c.genome.diet > 0.55;
    ctx.save(); ctx.translate(x, y); ctx.rotate(c.angle);
    if (carn) { // jaws: a forward wedge
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(r * 1.7, 0); ctx.lineTo(r * 0.3, -r * 0.75); ctx.lineTo(r * 0.3, r * 0.75); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(8,12,16,0.85)'; ctx.lineWidth = Math.max(1, r * 0.18); ctx.stroke();
    // eye shows heading
    ctx.fillStyle = '#e6edf3'; ctx.beginPath(); ctx.arc(r * 0.45, 0, Math.max(0.8, r * 0.28), 0, Math.PI * 2); ctx.fill();
    if (c.attack && carn) { ctx.strokeStyle = '#e66767'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, r + 2.5, -0.6, 0.6); ctx.stroke(); }
    ctx.restore();
  }
  if (selected) {
    const [x, y] = cam.toScreen(world, selected.x, selected.y, w, h);
    ctx.strokeStyle = 'rgba(230,237,243,0.9)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, selected.r * z + 6, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(230,237,243,0.18)'; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(x, y, selected.genome.sense * z, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  }
}

// nearest creature to a screen point, within a few pixels of its body
export function pick(world, cam, sx, sy, w, h) {
  let best = null, bd = Infinity;
  for (const c of world.creatures) {
    const [x, y] = cam.toScreen(world, c.x, c.y, w, h);
    const d = Math.hypot(x - sx, y - sy);
    if (d < Math.max(10, c.r * cam.zoom + 6) && d < bd) { bd = d; best = c; }
  }
  return best;
}

// 16×16 symmetric pixel portrait from the genome: size→body, vision→eyes, speed→fins, diet→teeth
export function drawPortrait(ctx, c, color) {
  const N = 16, g = c.genome, img = new Uint8Array(N * N);
  let seed = hashString(c.genome.w.slice(0, 12).map((v) => v.toFixed(2)).join(','));
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const bw = 3.2 + g.size * 1.6, bh = 3 + g.size * 1.5;
  for (let y = 0; y < N; y++) for (let x = 0; x < N / 2; x++) {
    const dx = (x - 7.5) / bw, dy = (y - 8.5) / bh;
    if (dx * dx + dy * dy <= 1) img[y * N + x] = rnd() < 0.2 ? 2 : 1;
    // fins: longer with speed
    if (y >= 9 && y <= 10 + Math.round(g.speed) && x <= 7.5 - bw + 0.5 && x >= 7.5 - bw - g.speed * 1.4) img[y * N + x] = 3;
    // antennae: longer with vision
    if (x === 5 && y < 8.5 - bh && y >= 8.5 - bh - g.sense / 70) img[y * N + x] = 3;
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N / 2; x++) img[y * N + (N - 1 - x)] = img[y * N + x];
  const eyeY = Math.round(8.5 - bh * 0.35), eyeX = 6, big = g.sense > 120;
  for (const ex of [eyeX, N - 1 - eyeX]) { img[eyeY * N + ex] = 4; if (big) img[(eyeY - 1) * N + ex] = 4; img[(eyeY + 1) * N + ex] = 5; }
  if (g.diet > 0.45) { const my = Math.round(8.5 + bh * 0.45); for (let x = 6; x <= 9; x++) img[my * N + x] = (x % 2) ? 4 : 5; }
  const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16); const ch = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f))); return `rgb(${ch(16)},${ch(8)},${ch(0)})`; };
  const pal = { 1: color, 2: shade(color, 0.7), 3: shade(color, 1.3), 4: '#f2f5f8', 5: '#0b0f14' };
  ctx.clearRect(0, 0, N, N);
  for (let i = 0; i < img.length; i++) if (img[i]) { ctx.fillStyle = pal[img[i]]; ctx.fillRect(i % N, Math.floor(i / N), 1, 1); }
}

// brain: 10 inputs → 8 hidden → 3 outputs, edges coloured by sign (blue excite / red inhibit)
export function drawBrain(ctx, c, w, h, dpr = 1) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  const W = c.genome.w, col = (n, i, x) => ({ x, y: 10 + (i + 0.5) * ((h - 20) / n) });
  const ins = Array.from({ length: N_IN }, (_, i) => col(N_IN, i, 16)), hid = Array.from({ length: N_HID }, (_, i) => col(N_HID, i, w / 2)), outs = Array.from({ length: N_OUT }, (_, i) => col(N_OUT, i, w - 16));
  const edge = (a, b, wt) => {
    const m = Math.min(1, Math.abs(wt) / 3);
    if (m < 0.08) return;
    ctx.strokeStyle = wt > 0 ? `rgba(57,135,229,${0.15 + m * 0.75})` : `rgba(230,103,103,${0.15 + m * 0.75})`;
    ctx.lineWidth = 0.5 + m * 2.2; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  };
  for (let i = 0; i < N_IN; i++) for (let k = 0; k < N_HID; k++) edge(ins[i], hid[k], W[i * N_HID + k]);
  for (let k = 0; k < N_HID; k++) for (let o = 0; o < N_OUT; o++) edge(hid[k], outs[o], W[N_IN * N_HID + k * N_OUT + o]);
  const node = (p, v) => { ctx.fillStyle = v == null ? '#9aa7b4' : v > 0 ? '#3987e5' : '#e66767'; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#0d1319'; ctx.lineWidth = 2; ctx.stroke(); };
  ins.forEach((p) => node(p)); hid.forEach((p) => node(p)); outs.forEach((p, i) => node(p, c.out?.[i]));
}
