import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../app/js/sim.js';

test('PRNG is deterministic, uniform-ish, and restorable', () => {
  const a = S.makeRng(9), b = S.makeRng(9);
  const xs = Array.from({ length: 1000 }, () => a());
  assert.deepEqual(xs.slice(0, 50), Array.from({ length: 50 }, () => b()));
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  assert.ok(Math.abs(mean - 0.5) < 0.04);
  const st = a.state(); const n1 = a(); a.setState(st); assert.equal(a(), n1);
  const g = S.makeRng(3); const gs = Array.from({ length: 4000 }, () => S.gauss(g));
  const gm = gs.reduce((s, x) => s + x, 0) / gs.length, gv = gs.reduce((s, x) => s + (x - gm) ** 2, 0) / gs.length;
  assert.ok(Math.abs(gm) < 0.06 && Math.abs(gv - 1) < 0.1, `gauss mean ${gm} var ${gv}`);
});

test('genomes stay inside their ranges through many mutations', () => {
  const rng = S.makeRng(1);
  let g = S.randomGenome(rng);
  assert.equal(g.w.length, S.N_W);
  for (let i = 0; i < 2000; i++) g = S.mutate(g, rng, 3);
  for (const k of S.TRAIT_KEYS) { const [lo, hi] = S.TRAITS[k]; assert.ok(g[k] >= lo && g[k] <= hi, `${k}=${g[k]}`); }
  assert.ok(g.w.every((x) => x >= -6 && x <= 6));
  assert.equal(S.distance(g, g), 0);
  const far = S.mutate(g, rng, 30);
  assert.ok(S.distance(g, far) > 0);
});

test('the ancestral reflex turns toward food and the hunter bites only smaller neighbours', () => {
  const rng = S.makeRng(5);
  const g = S.randomGenome(rng);
  const inp = new Float64Array(S.N_IN); inp[9] = 1;
  inp[1] = 0.6; inp[2] = 0.5; // food to the right (+lateral), fairly close
  const right = S.think(g.w, inp).out[0];
  inp[1] = -0.6;
  const left = S.think(g.w, inp).out[0];
  assert.ok(right > 0 && left < 0, `turn right ${right}, left ${left}`);
  const h = S.predatorGenome(rng);
  const p = new Float64Array(S.N_IN); p[9] = 1; p[5] = 0.9; // a creature very close
  p[6] = -0.6; const biteSmall = S.think(h.w, p).out[2];
  p[6] = 1.0; const biteBig = S.think(h.w, p).out[2];
  assert.ok(biteSmall > 0 && biteBig < biteSmall, `small ${biteSmall} big ${biteBig}`);
});

test('the torus spatial grid returns exactly what brute force does', () => {
  const rng = S.makeRng(11), W = 500, H = 300;
  const grid = new S.Grid(W, H, 64);
  const pts = Array.from({ length: 400 }, (_, i) => ({ i, x: rng() * W, y: rng() * H }));
  for (const p of pts) grid.insert(p);
  for (let q = 0; q < 60; q++) {
    const x = rng() * W, y = rng() * H, r = 10 + rng() * 200;
    const got = []; grid.query(x, y, r, (p) => got.push(p.i));
    const want = pts.filter((p) => { const dx = S.wrapDelta(p.x - x, W), dy = S.wrapDelta(p.y - y, H); return dx * dx + dy * dy <= r * r; }).map((p) => p.i);
    assert.deepEqual(got.sort((a, b) => a - b), want.sort((a, b) => a - b), `query ${q} r=${r.toFixed(0)}`);
  }
});

test('same seed, same world: the run is fully deterministic', () => {
  const a = S.run(S.createWorld(77), 800), b = S.run(S.createWorld(77), 800);
  assert.equal(S.fingerprint(a), S.fingerprint(b));
  const c = S.run(S.createWorld(78), 800);
  assert.notEqual(S.fingerprint(a), S.fingerprint(c));
});

test('a default world lives, evolves and speciates over 6000 ticks', () => {
  const w = S.run(S.createWorld(1), 6000);
  assert.ok(w.creatures.length > 50, `pop ${w.creatures.length}`);
  const last = w.samples.at(-1);
  assert.ok(last.gen >= 10, `generations ${last.gen}`);
  assert.ok([...w.species.values()].length >= 3, 'new species appeared');
  assert.ok(w.creatures.every((c) => c.energy > 0 && Number.isFinite(c.x) && c.x >= 0 && c.x < w.settings.width && c.y >= 0 && c.y < w.settings.height));
  assert.ok(w.plants <= w.settings.foodMax && w.food.length - w.plants <= S.MEAT_CAP);
  assert.equal(w.plants, w.food.filter((f) => f.kind === 'plant').length, 'plant counter is exact');
});

test('energy economy: upkeep rises with size, speed and sense; bigger bodies reproduce later', () => {
  const base = { size: 1, speed: 1, sense: 80, diet: 0, repro: 1, mutation: 0.05 };
  assert.ok(S.upkeep({ ...base, size: 2 }, 1) > S.upkeep(base, 1));
  assert.ok(S.upkeep(base, 2) > S.upkeep(base, 1));
  assert.ok(S.upkeep({ ...base, sense: 200 }, 1) > S.upkeep(base, 1));
  assert.ok(S.reproThreshold({ ...base, size: 2 }) > S.reproThreshold(base));
  assert.ok(S.maxAge({ ...base, size: 2 }) > S.maxAge(base));
});

test('a hunter adjacent to a smaller creature kills and eats it', () => {
  const w = S.createWorld(3, { startPop: 0, predators: 0, foodRate: 0 });
  w.food = []; w.plants = 0;
  const rng = S.makeRng(4);
  const h = S.predatorGenome(rng); h.size = 2; h.diet = 1;
  // force the bite: huge attack bias
  h.w[S.N_IN * S.N_HID + S.N_HID * S.N_OUT + 2] = 6;
  const prey = S.randomGenome(rng); prey.size = 0.6;
  w.creatures.push({ id: 1, x: 100, y: 100, angle: 0, vel: 0, energy: 50, age: 0, gen: 0, parent: null, species: 1, genome: h, r: 3 + 2 * 3, children: 0, kills: 0, eaten: 0, out: [0, 0, 0], dead: false });
  w.creatures.push({ id: 2, x: 108, y: 100, angle: 0, vel: 0, energy: 40, age: 0, gen: 0, parent: null, species: 1, genome: prey, r: 3 + 0.6 * 3, children: 0, kills: 0, eaten: 0, out: [0, 0, 0], dead: false });
  w.species.get(1).count = 2;
  S.step(w);
  assert.equal(w.creatures.length, 1, 'prey eaten');
  assert.equal(w.creatures[0].kills, 1);
  assert.ok(w.creatures[0].energy > 50);
});

test('speciation: a child far enough from its species representative founds a new one', () => {
  const w = S.createWorld(8, { speciesThreshold: 0.0001 });
  const before = w.species.size;
  S.run(w, 600);
  assert.ok(w.species.size > before + 5, `${before} → ${w.species.size}`);
  const sp = [...w.species.values()].find((s) => s.parent != null);
  assert.ok(sp && w.species.has(sp.parent), 'new species remembers its parent');
  assert.match(sp.name, /^[A-Z][a-z]+$/);
});

test('events: meteor culls, bloom feeds, ice age slows growth for a while', () => {
  const w = S.run(S.createWorld(12), 400);
  const pop = w.creatures.length;
  S.event(w, 'meteor');
  assert.ok(w.creatures.length < pop * 0.85, `${pop} → ${w.creatures.length}`);
  const plants = w.plants;
  S.event(w, 'bloom');
  assert.ok(w.plants > plants);
  S.event(w, 'iceage');
  assert.equal(w.foodMul, 0.35);
  S.run(w, 3001);
  assert.equal(w.foodMul, 1);
  assert.deepEqual(w.events.map((e) => e.kind), ['meteor', 'bloom', 'iceage']);
});

test('save → load continues exactly the same timeline', () => {
  const a = S.run(S.createWorld(21), 500);
  const saved = JSON.parse(JSON.stringify(S.serialize(a)));
  const b = S.deserialize(saved);
  assert.equal(S.fingerprint(a), S.fingerprint(b));
  S.run(a, 400); S.run(b, 400);
  assert.equal(S.fingerprint(a), S.fingerprint(b));
  assert.throws(() => S.deserialize({ version: 9 }));
});

test('samples are taken on schedule and downsampled when long', () => {
  const w = S.run(S.createWorld(2), 600);
  assert.equal(w.samples.length, 600 / w.settings.sampleEvery + 1);
  const s = w.samples.at(-1);
  assert.equal(s.pop, w.creatures.length);
  assert.equal(Object.values(s.bySpecies).reduce((a, b) => a + b, 0), s.pop);
  const many = Array.from({ length: S.SAMPLE_CAP + 1 }, (_, i) => ({ tick: i }));
  const ds = S.downsample(many);
  assert.ok(ds.length <= S.SAMPLE_CAP / 2 + 2);
  assert.equal(ds.at(-1).tick, S.SAMPLE_CAP, 'keeps the newest');
});

test('species names are deterministic per rng', () => {
  assert.equal(S.speciesName(S.makeRng(5)), S.speciesName(S.makeRng(5)));
});

test('i18n: English and Turkish have the same keys', async () => {
  const { STRINGS } = await import('../app/js/i18n.js');
  assert.deepEqual(Object.keys(STRINGS.tr).sort(), Object.keys(STRINGS.en).sort());
});
