// Primordia UI: run loop, camera, inspector, records, charts, controls, save/load.
import * as S from './sim.js';
import { SlotMap, Camera, drawWorld, pick, drawPortrait, drawBrain } from './render.js';
import { lineChart, speciesChart, hoverIndex } from './charts.js';
import { t, setLang, getLang, applyI18n, detectLang } from './i18n.js';

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const ui = Object.assign({ lang: null, speed: 5 }, load());
function load() { try { return JSON.parse(localStorage.getItem('primordia:ui') || '{}'); } catch { return {}; } }
function saveUi() { try { localStorage.setItem('primordia:ui', JSON.stringify(ui)); } catch { /* private mode */ } }
let toastTimer;
function toast(msg) { const n = $('#toast'); n.textContent = msg; n.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { n.hidden = true; }, 2200); }

const params = new URLSearchParams(location.search);
let world, preset = params.get('preset') && S.PRESETS[params.get('preset')] ? params.get('preset') : 'ecosystem';
let playing = !params.has('paused'), selectedId = null, follow = false, lastSampleCount = -1;
const slots = new SlotMap(), cam = new Camera();
const canvas = $('#world'), wctx = canvas.getContext('2d');

function newWorld(seed, p = preset) {
  preset = p;
  world = S.createWorld(seed, S.PRESETS[p]);
  slots.slots.clear(); slots.update(world);
  selectedId = null; follow = false; lastSampleCount = -1;
  $('#seed').value = seed; $('#preset').value = p;
  resize(); cam.reset(world, canvas.clientWidth, canvas.clientHeight);
  history.replaceState(null, '', `?seed=${seed}&preset=${p}`);
  renderAll();
}
const selected = () => (selectedId == null ? null : world.creatures.find((c) => c.id === selectedId) ?? null);

// ---------- loop ----------
let lastTime = 0;
function frame(now) {
  if (playing && world.creatures.length) {
    const budget = 12, start = performance.now();
    for (let i = 0; i < ui.speed; i++) { S.step(world); if (performance.now() - start > budget || !world.creatures.length) break; }
  }
  if (world.tick % 6 === 0 || !playing || now - lastTime > 120) { slots.update(world); lastTime = now; }
  const sel = selected();
  if (follow && sel) { cam.cx = sel.x; cam.cy = sel.y; }
  draw();
  if (now - (frame.ui ?? 0) > 250) { frame.ui = now; renderStats(); renderInspector(); renderRecords(); }
  if (world.samples.length !== lastSampleCount) { lastSampleCount = world.samples.length; renderCharts(); }
  $('#extinct').hidden = world.creatures.length > 0;
  if (!world.creatures.length) $('#ext-body').textContent = t('ext.body', { t: world.tick });
  requestAnimationFrame(frame);
}
function draw() { const dpr = window.devicePixelRatio || 1; drawWorld(wctx, world, cam, slots, { selected: selected(), w: canvas.clientWidth, h: canvas.clientHeight, dpr }); }
function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(canvas.clientWidth * dpr); canvas.height = Math.round(canvas.clientHeight * dpr);
}

// ---------- panels ----------
const dietWord = (d) => t(d < 0.33 ? 'diet.herbivore' : d < 0.66 ? 'diet.omnivore' : 'diet.carnivore');
function renderStats() {
  const last = world.samples.at(-1);
  const alive = [...world.species.values()].filter((s) => s.count > 0).length;
  const items = [[world.tick, 'stat.tick'], [world.creatures.length, 'stat.pop'], [alive, 'stat.species'], [last?.gen ?? 0, 'stat.gen'], [world.births, 'stat.births'], [world.deaths, 'stat.deaths'], [world.plants, 'stat.food']];
  $('#stats').replaceChildren(...items.map(([v, k]) => { const d = el('div', 's'); d.dataset.stat = k; d.append(el('span', 'v', String(v)), el('span', 'k', t(k))); return d; }));
  $('#btn-play').textContent = playing ? t('ctl.pause') : t('ctl.play');
}
function renderInspector() {
  const box = $('#inspector'); box.replaceChildren(el('h3', null, t('ins.title')));
  const c = selected();
  if (selectedId == null) { box.append(el('p', 'empty', t('ins.empty'))); return; }
  if (!c) { box.append(el('p', 'empty', t('ins.dead'))); return; }
  const sp = world.species.get(c.species), color = slots.color(c.species);
  const head = el('div', 'ins-head');
  const pc = el('canvas'); pc.width = 16; pc.height = 16; drawPortrait(pc.getContext('2d'), c, color);
  const txt = el('div');
  const nm = el('div', 'nm'); const sw = el('span', 'swatch'); sw.style.background = color; nm.append(sw, document.createTextNode(sp.name));
  txt.append(nm, el('div', 'sub', `#${c.id} · ${dietWord(c.genome.diet)}`));
  head.append(pc, txt); box.append(head);
  const kv = el('div', 'kv');
  for (const [k, v] of [['ins.gen', c.gen], ['ins.age', c.age], ['ins.children', c.children], ['ins.kills', c.kills], ['ins.parent', c.parent ?? '—'], ['ins.energy', Math.round(c.energy)]]) kv.append(el('span', null, t(k)), el('span', null, String(v)));
  box.append(kv);
  const m = el('div', 'meter'); const mi = el('i'); mi.style.width = `${Math.min(100, (c.energy / S.reproThreshold(c.genome)) * 100)}%`; m.append(mi); box.append(m);
  box.append(el('h3', null, t('ins.genes')));
  const genes = el('div', 'genes');
  for (const k of S.TRAIT_KEYS) {
    const [lo, hi] = S.TRAITS[k], v = c.genome[k];
    const bar = el('div', 'g'); const bi = el('i'); bi.style.width = `${((v - lo) / (hi - lo)) * 100}%`; bar.append(bi);
    genes.append(el('span', null, t(`gene.${k}`)), bar, el('span', 'v', k === 'sense' ? v.toFixed(0) : v.toFixed(2)));
  }
  box.append(genes);
  box.append(el('h3', null, t('ins.brain')));
  const bc = el('canvas'); bc.id = 'brain'; box.append(bc);
  box.append(el('p', 'note', t('ins.brain.note')));
  const fb = el('button', 'tb', follow ? t('ins.unfollow') : t('ins.follow')); fb.id = 'btn-follow';
  fb.addEventListener('click', () => { follow = !follow; renderInspector(); });
  box.append(fb);
  requestAnimationFrame(() => { const dpr = window.devicePixelRatio || 1; bc.width = bc.clientWidth * dpr; bc.height = bc.clientHeight * dpr; drawBrain(bc.getContext('2d'), c, bc.clientWidth, bc.clientHeight, dpr); });
}
function renderRecords() {
  const box = $('#records'); box.replaceChildren(el('h3', null, t('rec.title')));
  for (const [key, label, stat] of [['oldest', 'rec.oldest', 'age'], ['parent', 'rec.parent', 'children'], ['hunter', 'rec.hunter', 'kills']]) {
    const c = world.creatures.reduce((b, x) => (!b || x[stat] > b[stat] ? x : b), null);
    const row = el('div', 'rec'); row.append(el('span', null, t(label)));
    if (c && (stat !== 'kills' || c.kills > 0)) {
      const b = el('button', null, `#${c.id} · ${c[stat]}`); b.dataset.rec = key;
      b.addEventListener('click', () => { selectedId = c.id; follow = true; renderInspector(); });
      row.append(b);
    } else row.append(el('span', null, t('rec.none')));
    box.append(row);
  }
}

// ---------- charts ----------
const CHARTS = [['pop', 'chart.pop', (v) => String(Math.round(v))], ['size', 'chart.size', (v) => v.toFixed(2)], ['speed', 'chart.speed', (v) => v.toFixed(2)], ['sense', 'chart.sense', (v) => String(Math.round(v))], ['diet', 'chart.diet', (v) => v.toFixed(2)]];
let hoverState = { chart: null, i: null };
function chartSeries() {
  return [...slots.slots.entries()].sort((a, b) => a[1] - b[1]).map(([id, slot]) => ({ id, color: slots.color(id), name: world.species.get(id)?.name ?? `#${id}` }));
}
function buildCharts() {
  const box = $('#charts'); box.replaceChildren();
  const sp = el('div', 'chart wide'); sp.dataset.chart = 'species';
  const h = el('h4'); h.append(el('span', null, t('chart.species')), el('span', 'now'));
  const cv = el('canvas'); sp.append(h, cv, el('div', 'legend')); box.append(sp);
  for (const [key, label] of CHARTS) {
    const c = el('div', 'chart'); c.dataset.chart = key;
    const hh = el('h4'); hh.append(el('span', null, t(label)), el('span', 'now'));
    c.append(hh, el('canvas')); box.append(c);
  }
  for (const c of box.querySelectorAll('.chart')) {
    const canvasEl = $('canvas', c), key = c.dataset.chart;
    canvasEl.addEventListener('pointermove', (e) => { hoverState = { chart: key, i: hoverIndex(canvasEl, e.clientX, world.samples.length) }; renderCharts(); showTip(e, key, hoverState.i); });
    canvasEl.addEventListener('pointerleave', () => { hoverState = { chart: null, i: null }; $('#tip').hidden = true; renderCharts(); });
  }
}
function renderCharts() {
  const smp = world.samples;
  if (!smp.length) return;
  const series = chartSeries();
  const spBox = $('.chart[data-chart="species"]');
  speciesChart($('canvas', spBox), smp, series, { hover: hoverState.chart === 'species' ? hoverState.i : null });
  $('.now', spBox).textContent = String([...world.species.values()].filter((s) => s.count > 0).length);
  const lg = $('.legend', spBox); lg.replaceChildren();
  for (const s of series) { const it = el('span'); const sw = el('span', 'swatch'); sw.style.background = s.color; it.append(sw, document.createTextNode(s.name)); lg.append(it); }
  const ot = el('span'); const osw = el('span', 'swatch'); osw.style.background = '#56616d'; ot.append(osw, document.createTextNode(t('chart.other'))); lg.append(ot);
  for (const [key, , fmt] of CHARTS) {
    const box = $(`.chart[data-chart="${key}"]`);
    lineChart($('canvas', box), smp, key, { fmt, hover: hoverState.chart === key ? hoverState.i : null, range: key === 'diet' ? [0, 1] : null });
    $('.now', box).textContent = fmt(smp.at(-1)[key]);
  }
}
function showTip(e, key, i) {
  const s = world.samples[i]; if (!s) return;
  const tip = $('#tip'); tip.replaceChildren(el('div', 'h', `${t('chart.tick')} ${s.tick}`));
  const row = (label, v, color) => { const r = el('div', 'r'); const l = el('span'); if (color) { const sw = el('span', 'swatch'); sw.style.background = color; l.append(sw); } l.append(document.createTextNode(label)); r.append(l, el('b', null, String(v))); tip.append(r); };
  if (key === 'species') {
    let shown = 0;
    for (const sp of chartSeries()) { row(sp.name, s.bySpecies[sp.id] ?? 0, sp.color); shown += s.bySpecies[sp.id] ?? 0; }
    row(t('chart.other'), s.pop - shown, '#56616d'); row(t('stat.pop'), s.pop);
  } else { const c = CHARTS.find((x) => x[0] === key); row(t(c[1]), c[2](s[key])); }
  tip.hidden = false;
  const x = Math.min(window.innerWidth - tip.offsetWidth - 8, e.clientX + 14);
  tip.style.left = `${x}px`; tip.style.top = `${e.clientY + 14}px`;
}
function renderAll() { renderStats(); renderInspector(); renderRecords(); buildCharts(); renderCharts(); }

// ---------- input on the world ----------
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, cx: cam.cx, cy: cam.cy, moved: false }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 4) { drag.moved = true; follow = false; canvas.classList.add('grab'); }
  if (drag.moved) { cam.cx = drag.cx - dx / cam.zoom; cam.cy = drag.cy - dy / cam.zoom; if (!playing) draw(); }
});
canvas.addEventListener('pointerup', (e) => {
  canvas.classList.remove('grab');
  if (drag && !drag.moved) {
    const r = canvas.getBoundingClientRect();
    const c = pick(world, cam, e.clientX - r.left, e.clientY - r.top, canvas.clientWidth, canvas.clientHeight);
    selectedId = c ? c.id : null; follow = false; renderInspector(); if (!playing) draw();
  }
  drag = null;
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = canvas.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
  const [wx, wy] = cam.toWorld(world, sx, sy, canvas.clientWidth, canvas.clientHeight);
  cam.zoom = Math.max(cam.fit, Math.min(cam.fit * 8, cam.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
  const [nx, ny] = cam.toWorld(world, sx, sy, canvas.clientWidth, canvas.clientHeight);
  cam.cx += wx - nx; cam.cy += wy - ny;
  if (!playing) draw();
}, { passive: false });
canvas.addEventListener('dblclick', () => { follow = false; cam.reset(world, canvas.clientWidth, canvas.clientHeight); if (!playing) draw(); });

// ---------- controls ----------
function init() {
  setLang(ui.lang || detectLang());
  $('#set-lang').value = getLang();
  for (const p of Object.keys(S.PRESETS)) $('#preset').append(Object.assign(el('option', null, t(`preset.${p}`)), { value: p }));
  applyI18n();
  $('#speed').value = String(ui.speed);
  $('#set-lang').addEventListener('change', (e) => {
    ui.lang = e.target.value; saveUi(); setLang(ui.lang); applyI18n();
    [...$('#preset').options].forEach((o) => { o.textContent = t(`preset.${o.value}`); });
    renderAll();
  });
  $('#btn-play').addEventListener('click', () => { playing = !playing; renderStats(); });
  $('#btn-step').addEventListener('click', () => { playing = false; S.step(world); slots.update(world); draw(); renderStats(); renderInspector(); });
  $('#speed').addEventListener('change', (e) => { ui.speed = Number(e.target.value); saveUi(); });
  $('#btn-new').addEventListener('click', () => { const v = Number($('#seed').value); newWorld(Number.isFinite(v) && v > 0 && $('#seed').value.trim() ? Math.floor(v) : Math.floor(Math.random() * 1e6) + 1, $('#preset').value); });
  $('#btn-ext-new').addEventListener('click', () => newWorld(Math.floor(Math.random() * 1e6) + 1, $('#preset').value));
  for (const b of document.querySelectorAll('.ev')) b.addEventListener('click', () => { S.event(world, b.dataset.ev); slots.update(world); renderStats(); draw(); });
  $('#btn-save').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(S.serialize(world))], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `primordia-${world.seed}-t${world.tick}.json` });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 3000);
    toast(t('msg.saved'));
  });
  $('#btn-load').addEventListener('click', () => $('#file-load').click());
  $('#file-load').addEventListener('change', async () => {
    const f = $('#file-load').files[0]; $('#file-load').value = '';
    if (!f) return;
    try { world = S.deserialize(JSON.parse(await f.text())); slots.slots.clear(); slots.update(world); selectedId = null; $('#seed').value = world.seed; cam.reset(world, canvas.clientWidth, canvas.clientHeight); lastSampleCount = -1; renderAll(); toast(t('msg.loaded')); }
    catch { toast(t('msg.badfile')); }
  });
  $('#btn-share').addEventListener('click', async () => { try { await navigator.clipboard.writeText(location.href); } catch { /* clipboard blocked */ } toast(t('msg.copied')); });
  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.key === ' ') { e.preventDefault(); playing = !playing; renderStats(); }
    if (e.key === 'Escape') { selectedId = null; follow = false; renderInspector(); }
  });
  window.addEventListener('resize', () => { resize(); cam.fit = Math.min(canvas.clientWidth / world.settings.width, canvas.clientHeight / world.settings.height); cam.zoom = Math.max(cam.zoom, cam.fit); renderCharts(); });
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !params.has('nosw')) navigator.serviceWorker.register('sw.js').catch(() => {});

  const seed = Number(params.get('seed')) > 0 ? Math.floor(Number(params.get('seed'))) : Math.floor(Math.random() * 1e6) + 1;
  newWorld(seed, preset);
  requestAnimationFrame(frame);
  window.__primordia = {
    get world() { return world; }, S, cam, slots,
    select(id) { selectedId = id; renderInspector(); },
    screenOf(id) { const c = world.creatures.find((x) => x.id === id); if (!c) return null; const r = canvas.getBoundingClientRect(); const [x, y] = cam.toScreen(world, c.x, c.y, canvas.clientWidth, canvas.clientHeight); return [r.left + x, r.top + y]; },
    setPlaying(v) { playing = v; renderStats(); },
    run(n) { S.run(world, n); slots.update(world); renderAll(); draw(); },
  };
}
init();
