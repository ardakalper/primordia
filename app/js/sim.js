// Primordia simulation core. Pure and deterministic: no DOM, no Date, no Math.random.
// One world = creatures + food on a torus, advanced in fixed ticks by step(world).

// ---------- seeded PRNG (mulberry32) ----------
export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  next.state = () => a;
  next.setState = (s) => { a = s >>> 0; };
  return next;
}
export function gauss(rng) { // Box-Muller
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
export function hashString(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// ---------- genome ----------
// Trait genes with their legal ranges. Every trait has an energy price in step(), so no creature
// can be big, fast, far-sighted and omnivorous at once.
export const TRAITS = {
  size: [0.5, 2.5],      // body mass: more energy storage, can eat smaller creatures, costs metabolism
  speed: [0.4, 3.0],     // top speed: costs energy squared
  sense: [30, 220],      // vision radius: costs energy
  diet: [0, 1],          // 0 herbivore … 1 carnivore: plant vs meat digestion efficiency
  repro: [0.5, 1.6],     // how full the tank must be before splitting
  mutation: [0.01, 0.3], // per-gene mutation probability (it evolves too)
};
export const TRAIT_KEYS = Object.keys(TRAITS);
// Brain: 10 inputs (+bias) → 8 hidden (tanh, +bias) → 3 outputs
export const N_IN = 10, N_HID = 8, N_OUT = 3;
export const N_W = N_IN * N_HID + (N_HID + 1) * N_OUT;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function randomGenome(rng) {
  const g = {};
  for (const k of TRAIT_KEYS) { const [lo, hi] = TRAITS[k]; g[k] = lo + rng() * (hi - lo); }
  g.size = 0.8 + rng() * 0.6; g.speed = 1 + rng() * 0.8; g.sense = 70 + rng() * 60; g.diet = rng() * 0.3; g.mutation = 0.08;
  g.w = new Array(N_W).fill(0).map(() => gauss(rng) * 0.25);
  seedReflex(g.w, rng);
  return g;
}
// The ancestral reflex: hidden0 ← food lateral offset → turn; hidden1 ← food ahead → thrust.
// Without it the first generations starve before selection can find anything.
function seedReflex(w, rng) {
  const W1 = (i, h) => i * N_HID + h; // input i → hidden h
  const W2 = (h, o) => N_IN * N_HID + h * N_OUT + o; // hidden h (N_HID = bias) → output o
  w[W1(1, 0)] = 2.4 + gauss(rng) * 0.3;  // food lateral → hidden0
  w[W2(0, 0)] = 1.8 + gauss(rng) * 0.2;  // hidden0 → turn
  w[W1(2, 1)] = 1.6;                       // food proximity → hidden1
  w[W1(9, 1)] = 0.6;                       // bias → hidden1 (keep moving when nothing is seen)
  w[W2(1, 1)] = 2.2 + gauss(rng) * 0.2;  // hidden1 → thrust
  w[W2(N_HID, 2)] = -2;                     // attack output biased off at birth
}

// A hunter ancestor: turns toward other creatures and bites when one is close and smaller.
export function predatorGenome(rng) {
  const g = randomGenome(rng);
  g.size = 1.5 + rng() * 0.2; g.speed = 1.25 + rng() * 0.2; g.sense = 110 + rng() * 30; g.diet = 0.85 + rng() * 0.1; g.repro = 1.0;
  const W1 = (i, h) => i * N_HID + h, W2 = (h, o) => N_IN * N_HID + h * N_OUT + o;
  g.w.fill(0).forEach((_, i) => { g.w[i] = gauss(rng) * 0.2; });
  g.w[W1(4, 2)] = 2.6;                       // creature lateral → hidden2
  g.w[W2(2, 0)] = 1.9;                       // hidden2 → turn
  g.w[W1(5, 3)] = 1.8; g.w[W1(9, 3)] = 0.7;  // creature proximity + bias → hidden3
  g.w[W2(3, 1)] = 2.2;                       // hidden3 → thrust
  g.w[W1(5, 4)] = 3; g.w[W1(6, 4)] = -2.5; g.w[W1(9, 4)] = -1.6; // close and smaller → hidden4
  g.w[W2(4, 2)] = 3; g.w[W2(N_HID, 2)] = -1; // hidden4 → attack
  g.w[W1(1, 5)] = 1.4; g.w[W2(5, 0)] = 0.8;  // still glance at meat
  return g;
}

export function mutate(g, rng, scale = 1) {
  const c = { w: g.w.slice() };
  const p = g.mutation * scale;
  for (const k of TRAIT_KEYS) {
    const [lo, hi] = TRAITS[k];
    c[k] = g[k];
    if (rng() < p) c[k] = clamp(g[k] + gauss(rng) * (hi - lo) * 0.08, lo, hi);
  }
  for (let i = 0; i < c.w.length; i++) if (rng() < p) c.w[i] = clamp(c.w[i] + gauss(rng) * 0.35, -6, 6);
  return c;
}

// Normalised genetic distance: traits on 0..1 scale, plus mean weight difference.
export function distance(a, b) {
  let d = 0;
  for (const k of TRAIT_KEYS) { if (k === 'mutation') continue; const [lo, hi] = TRAITS[k]; d += Math.abs(a[k] - b[k]) / (hi - lo); }
  let dw = 0;
  for (let i = 0; i < a.w.length; i++) dw += Math.abs(a.w[i] - b.w[i]);
  return d + (dw / a.w.length) * 0.6;
}

// ---------- brain ----------
export function think(w, inputs, out = new Float64Array(N_OUT), hid = new Float64Array(N_HID)) {
  for (let h = 0; h < N_HID; h++) {
    let s = 0;
    for (let i = 0; i < N_IN; i++) s += inputs[i] * w[i * N_HID + h];
    hid[h] = Math.tanh(s);
  }
  const base = N_IN * N_HID;
  for (let o = 0; o < N_OUT; o++) {
    let s = w[base + N_HID * N_OUT + o]; // hidden bias row
    for (let h = 0; h < N_HID; h++) s += hid[h] * w[base + h * N_OUT + o];
    out[o] = s;
  }
  return { out, hid };
}

// ---------- spatial hash on a torus ----------
export class Grid {
  // cells divide the world exactly, so wrapped queries never skip a narrow seam cell
  constructor(W, H, cell) {
    this.W = W; this.H = H;
    this.cols = Math.max(1, Math.floor(W / cell)); this.rows = Math.max(1, Math.floor(H / cell));
    this.cw = W / this.cols; this.ch = H / this.rows;
    this.buckets = Array.from({ length: this.cols * this.rows }, () => []);
  }
  clear() { for (const b of this.buckets) b.length = 0; }
  key(x, y) { const cx = Math.floor(x / this.cw) % this.cols, cy = Math.floor(y / this.ch) % this.rows; return cy * this.cols + cx; }
  insert(item) { this.buckets[this.key(item.x, item.y)].push(item); }
  // calls fn(item, dx, dy, d2) for every item within r of (x, y), using wrapped deltas
  query(x, y, r, fn) {
    const nx = Math.ceil(r / this.cw), ny = Math.ceil(r / this.ch), cx = Math.floor(x / this.cw), cy = Math.floor(y / this.ch), r2 = r * r;
    const spanX = Math.min(this.cols, nx * 2 + 1), spanY = Math.min(this.rows, ny * 2 + 1);
    const x0 = spanX === this.cols ? 0 : cx - nx, y0 = spanY === this.rows ? 0 : cy - ny;
    for (let j = 0; j < spanY; j++) {
      const row = ((((y0 + j) % this.rows) + this.rows) % this.rows) * this.cols;
      for (let i = 0; i < spanX; i++) {
        for (const it of this.buckets[row + ((((x0 + i) % this.cols) + this.cols) % this.cols)]) {
          const dx = wrapDelta(it.x - x, this.W), dy = wrapDelta(it.y - y, this.H), d2 = dx * dx + dy * dy;
          if (d2 <= r2) fn(it, dx, dy, d2);
        }
      }
    }
  }
}
export const wrapDelta = (d, size) => (d > size / 2 ? d - size : d < -size / 2 ? d + size : d);
const wrap = (v, size) => ((v % size) + size) % size;

// ---------- settings and presets ----------
export const DEFAULTS = {
  width: 1600, height: 1000, startPop: 90, predators: 10, foodRate: 1.5, foodMax: 650, foodEnergy: 28,
  patches: 4, mutationScale: 1, popCap: 600, speciesThreshold: 0.55, sampleEvery: 60,
};
export const PRESETS = {
  ecosystem: {},
  pond: { predators: 0 },
  predators: { predators: 24, startPop: 120 },
  scarcity: { foodRate: 1.1, foodEnergy: 34, foodMax: 450 },
  bloom: { foodRate: 4, foodMax: 1600, patches: 6 },
  chaos: { mutationScale: 2.6 },
};

// ---------- names ----------
const SYL_A = ['Pro', 'Xe', 'Ly', 'Ar', 'Ve', 'Thal', 'Myr', 'Cy', 'Or', 'Ze', 'Quo', 'Pyr', 'Nim', 'Sor', 'Dra', 'Ul'];
const SYL_B = ['to', 'no', 'ri', 'ca', 'la', 'mo', 'phi', 'xa', 'te', 'du', 'si', 'gu'];
const SYL_C = ['ra', 'don', 'lus', 'pis', 'nax', 'tes', 'mora', 'zoa', 'lith', 'cus', 'vex', 'dae'];
export function speciesName(rng) { return SYL_A[Math.floor(rng() * SYL_A.length)] + SYL_B[Math.floor(rng() * SYL_B.length)] + SYL_C[Math.floor(rng() * SYL_C.length)]; }

// ---------- world ----------
export function createWorld(seed = 1, overrides = {}) {
  const s = { ...DEFAULTS, ...overrides };
  const rng = makeRng(seed);
  const w = {
    seed, settings: s, rng, tick: 0, nextId: 1, nextSpecies: 1,
    creatures: [], food: [], species: new Map(), samples: [], events: [],
    patches: Array.from({ length: s.patches }, () => ({ x: rng() * s.width, y: rng() * s.height, r: 120 + rng() * 140, a: rng() * Math.PI * 2 })),
    foodMul: 1, foodMulUntil: 0, plants: 0, records: { oldest: null, parent: null, hunter: null }, deaths: 0, births: 0,
    grid: new Grid(s.width, s.height, 64), foodGrid: new Grid(s.width, s.height, 64),
  };
  // the first species: everyone starts as one lineage of near-identical ancestors
  const root = randomGenome(rng);
  const sp0 = newSpecies(w, root, null);
  for (let i = 0; i < s.startPop; i++) spawn(w, mutate(root, rng, 2), rng() * s.width, rng() * s.height, 60, null, sp0.id, 0);
  if (s.predators > 0) {
    const hunter = predatorGenome(rng);
    const sp1 = newSpecies(w, hunter, null);
    for (let i = 0; i < s.predators; i++) spawn(w, mutate(hunter, rng, 1), rng() * s.width, rng() * s.height, 140, null, sp1.id, 0);
  }
  for (let i = 0; i < s.foodMax * 0.5; i++) addFood(w, 'plant');
  sample(w);
  return w;
}

function newSpecies(w, genome, parentSpecies) {
  const sp = { id: w.nextSpecies++, name: speciesName(w.rng), rep: genome, parent: parentSpecies, born: w.tick, count: 0, peak: 0, extinct: null };
  w.species.set(sp.id, sp);
  return sp;
}

function spawn(w, genome, x, y, energy, parent, speciesId, gen) {
  const c = {
    id: w.nextId++, x, y, angle: w.rng() * Math.PI * 2, vel: 0, energy, age: 0, gen,
    parent: parent ? parent.id : null, species: speciesId, genome,
    r: 3 + genome.size * 3, children: 0, kills: 0, eaten: 0, attack: false, out: [0, 0, 0], dead: false,
  };
  w.creatures.push(c);
  return c;
}

export const MEAT_CAP = 250, MEAT_ROT = 900; // corpses are capped separately and rot away
export function addFood(w, kind = 'plant', x = null, y = null, energy = null) {
  const s = w.settings;
  if (kind === 'plant' ? w.plants >= s.foodMax : w.food.length - w.plants >= MEAT_CAP) return null;
  if (x == null) {
    // most plants grow in fertile patches, some anywhere
    if (w.rng() < 0.75 && w.patches.length) {
      const p = w.patches[Math.floor(w.rng() * w.patches.length)];
      x = wrap(p.x + gauss(w.rng) * p.r * 0.5, s.width); y = wrap(p.y + gauss(w.rng) * p.r * 0.5, s.height);
    } else { x = w.rng() * s.width; y = w.rng() * s.height; }
  }
  const f = { x, y, kind, energy: energy ?? s.foodEnergy, eaten: false, born: w.tick };
  w.food.push(f);
  if (kind === 'plant') w.plants += 1;
  return f;
}

// metabolic price per tick — the trade-offs that make niches
export function upkeep(g, vel) {
  return 0.07 * g.size * g.size + 0.05 * g.size * vel * vel + 0.0004 * g.sense + 0.03;
}
export const reproThreshold = (g) => 70 * g.size * g.repro;
export const maxAge = (g) => 1400 + g.size * 600;
const MAX_TURN = 0.16, ATTACK_COST = 0.25;

const _in = new Float64Array(N_IN), _out = new Float64Array(N_OUT), _hid = new Float64Array(N_HID);

export function step(w) {
  const s = w.settings, rng = w.rng;
  w.tick += 1;
  // food regrowth; patches drift slowly so the map keeps changing
  if (w.tick >= w.foodMulUntil) w.foodMul = 1;
  let grow = s.foodRate * w.foodMul;
  while (grow > 0) { if (rng() < grow) addFood(w, 'plant'); grow -= 1; }
  for (const p of w.patches) { p.a += (rng() - 0.5) * 0.05; p.x = wrap(p.x + Math.cos(p.a) * 0.05, s.width); p.y = wrap(p.y + Math.sin(p.a) * 0.05, s.height); }

  w.grid.clear(); w.foodGrid.clear();
  for (const c of w.creatures) w.grid.insert(c);
  for (const f of w.food) w.foodGrid.insert(f);

  const born = [];
  for (const c of w.creatures) {
    if (c.dead) continue;
    const g = c.genome;
    // ---- sense: nearest food, nearest other creature ----
    let fBest = Infinity, fdx = 0, fdy = 0, food = null;
    w.foodGrid.query(c.x, c.y, g.sense, (f, dx, dy, d2) => {
      if (f.eaten) return;
      // value food by what this diet can digest; meat is invisible-ish to pure herbivores and vice versa
      const worth = f.kind === 'plant' ? 1 - g.diet : g.diet;
      if (worth < 0.15) return;
      const score = d2 / (0.3 + worth);
      if (score < fBest) { fBest = score; fdx = dx; fdy = dy; food = f; }
    });
    let cBest = Infinity, cdx = 0, cdy = 0, other = null;
    w.grid.query(c.x, c.y, g.sense, (o, dx, dy, d2) => {
      if (o === c || o.dead) return;
      if (d2 < cBest) { cBest = d2; cdx = dx; cdy = dy; other = o; }
    });
    // ---- think: inputs in the body frame ----
    const ca = Math.cos(-c.angle), sa = Math.sin(-c.angle);
    const toLocal = (dx, dy) => [(dx * ca - dy * sa) / g.sense, (dx * sa + dy * ca) / g.sense];
    const [fx, fy] = food ? toLocal(fdx, fdy) : [0, 0];
    const [ox, oy] = other ? toLocal(cdx, cdy) : [0, 0];
    _in[0] = fx; _in[1] = fy; _in[2] = food ? 1 - Math.sqrt(fdx * fdx + fdy * fdy) / g.sense : 0;
    _in[3] = ox; _in[4] = oy; _in[5] = other ? 1 - Math.sqrt(cBest) / g.sense : 0;
    _in[6] = other ? clamp(other.genome.size / g.size - 1, -2, 2) : 0;
    _in[7] = other ? (other.species === c.species ? 1 : -1) : 0;
    _in[8] = clamp(c.energy / reproThreshold(g), 0, 2) - 0.5;
    _in[9] = 1;
    think(g.w, _in, _out, _hid);
    c.out[0] = _out[0]; c.out[1] = _out[1]; c.out[2] = _out[2];
    // ---- act ----
    c.angle += Math.tanh(_out[0]) * MAX_TURN;
    c.vel = (1 / (1 + Math.exp(-_out[1]))) * g.speed;
    c.x = wrap(c.x + Math.cos(c.angle) * c.vel, s.width);
    c.y = wrap(c.y + Math.sin(c.angle) * c.vel, s.height);
    c.energy -= upkeep(g, c.vel);
    c.age += 1;
    // eat food in reach
    w.foodGrid.query(c.x, c.y, c.r + 2, (f) => {
      if (f.eaten) return;
      const eff = f.kind === 'plant' ? 1 - g.diet : g.diet;
      if (eff < 0.05) return;
      f.eaten = true; c.energy += f.energy * eff; c.eaten += 1;
    });
    // attack: bite a smaller creature in reach
    c.attack = _out[2] > 0;
    if (c.attack) {
      c.energy -= ATTACK_COST * 0.08; // holding jaws open is cheap; a real bite costs more
      if (other && !other.dead && Math.sqrt(cBest) < c.r + other.r + 1) {
        c.energy -= ATTACK_COST;
        if (c.r <= other.r * 1.15) { /* too big to bite: wasted effort */ } else {
        other.dead = true; other.killedBy = c.id;
        c.energy += (Math.max(0, other.energy) * 0.7 + other.genome.size * 45) * (0.15 + 0.85 * g.diet);
        c.kills += 1;
        }
      }
    }
    // die or reproduce
    if (c.energy <= 0 || c.age > maxAge(g)) { c.dead = true; continue; }
    if (c.energy > reproThreshold(g) && c.age > 120 && w.creatures.length + born.length < s.popCap) {
      const childG = mutate(g, rng, s.mutationScale);
      let sp = c.species;
      const spec = w.species.get(sp);
      if (spec && distance(childG, spec.rep) > s.speciesThreshold) sp = newSpecies(w, childG, sp).id;
      c.energy /= 2;
      const ang = rng() * Math.PI * 2;
      born.push([childG, wrap(c.x + Math.cos(ang) * c.r * 2, s.width), wrap(c.y + Math.sin(ang) * c.r * 2, s.height), c.energy, c, sp, c.gen + 1]);
      c.children += 1;
    }
  }
  // corpses become meat, the dead leave, the born arrive
  const alive = [];
  for (const c of w.creatures) {
    if (!c.dead) { alive.push(c); continue; }
    w.deaths += 1;
    if (!c.killedBy) addFood(w, 'meat', c.x, c.y, 18 + c.genome.size * 22);
  }
  w.creatures = alive;
  for (const b of born) { spawn(w, ...b); w.births += 1; }
  for (const f of w.food) if (f.kind === 'meat' && w.tick - f.born > MEAT_ROT) f.eaten = true;
  if (w.food.some((f) => f.eaten)) { w.food = w.food.filter((f) => !f.eaten); w.plants = w.food.reduce((n, f) => n + (f.kind === 'plant'), 0); }
  // species bookkeeping
  for (const sp of w.species.values()) sp.count = 0;
  for (const c of w.creatures) w.species.get(c.species).count += 1;
  for (const sp of w.species.values()) { if (sp.count > sp.peak) sp.peak = sp.count; if (!sp.count && sp.extinct == null && w.tick > sp.born) sp.extinct = w.tick; }
  if (w.tick % s.sampleEvery === 0) sample(w);
  return w;
}

export function run(w, n) { for (let i = 0; i < n; i++) step(w); return w; }

// ---------- statistics ----------
export const SAMPLE_CAP = 600;
export function sample(w) {
  const cs = w.creatures, n = cs.length || 1;
  const mean = (k) => cs.reduce((a, c) => a + c.genome[k], 0) / n;
  const bySpecies = {};
  for (const c of cs) bySpecies[c.species] = (bySpecies[c.species] ?? 0) + 1;
  w.samples.push({
    tick: w.tick, pop: cs.length, food: w.food.length, species: Object.keys(bySpecies).length, bySpecies,
    size: mean('size'), speed: mean('speed'), sense: mean('sense'), diet: mean('diet'),
    gen: cs.reduce((a, c) => Math.max(a, c.gen), 0),
  });
  if (w.samples.length > SAMPLE_CAP) w.samples = downsample(w.samples);
  // living records
  const best = (key) => cs.reduce((b, c) => (!b || c[key] > b[key] ? c : b), null);
  w.records = { oldest: best('age')?.id ?? null, parent: best('children')?.id ?? null, hunter: best('kills')?.id ?? null };
}
// halve resolution: keep every other sample, so long runs stay cheap to chart
export function downsample(samples) { return samples.filter((_, i) => i % 2 === 0 || i === samples.length - 1); }

// ---------- events ----------
export function event(w, kind) {
  const s = w.settings, rng = w.rng;
  if (kind === 'meteor') {
    const x = rng() * s.width, y = rng() * s.height, r = Math.min(s.width, s.height) * 0.42;
    for (const c of w.creatures) {
      const dx = wrapDelta(c.x - x, s.width), dy = wrapDelta(c.y - y, s.height);
      if (dx * dx + dy * dy < r * r || rng() < 0.25) c.dead = true;
    }
    for (const f of w.food) if (rng() < 0.6) f.eaten = true;
    w.creatures = w.creatures.filter((c) => !c.dead);
    w.food = w.food.filter((f) => !f.eaten);
    w.plants = w.food.reduce((n, f) => n + (f.kind === 'plant'), 0);
  } else if (kind === 'bloom') {
    for (let i = 0; i < 400; i++) addFood(w, 'plant');
  } else if (kind === 'iceage') {
    w.foodMul = 0.35; w.foodMulUntil = w.tick + 3000;
  }
  w.events.push({ tick: w.tick, kind });
}

// ---------- save / load ----------
export function serialize(w) {
  return {
    version: 1, seed: w.seed, settings: w.settings, rngState: w.rng.state(), tick: w.tick, nextId: w.nextId, nextSpecies: w.nextSpecies,
    creatures: w.creatures.map(({ dead, killedBy, out, ...c }) => c),
    food: w.food.filter((f) => !f.eaten).map(({ eaten, ...f }) => f),
    species: [...w.species.values()], samples: w.samples, events: w.events, patches: w.patches,
    foodMul: w.foodMul, foodMulUntil: w.foodMulUntil, deaths: w.deaths, births: w.births,
  };
}
export function deserialize(o) {
  if (!o || o.version !== 1) throw new Error('not a Primordia save');
  const w = createWorld(o.seed, { ...o.settings, startPop: 0 });
  w.rng.setState(o.rngState);
  Object.assign(w, { tick: o.tick, nextId: o.nextId, nextSpecies: o.nextSpecies, samples: o.samples, events: o.events, patches: o.patches, foodMul: o.foodMul, foodMulUntil: o.foodMulUntil, deaths: o.deaths, births: o.births });
  w.creatures = o.creatures.map((c) => ({ ...c, out: [0, 0, 0], dead: false, attack: false }));
  w.food = o.food.map((f) => ({ ...f, eaten: false }));
  w.plants = w.food.reduce((n, f) => n + (f.kind === 'plant'), 0);
  w.species = new Map(o.species.map((s) => [s.id, s]));
  return w;
}

// a cheap fingerprint of world state, for determinism tests
export function fingerprint(w) {
  let h = 0;
  for (const c of w.creatures) h = (Math.imul(h, 31) + Math.round(c.x * 100) + Math.round(c.y * 100) * 7 + c.id) >>> 0;
  return `${w.tick}:${w.creatures.length}:${w.food.length}:${h}`;
}
