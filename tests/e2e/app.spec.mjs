import { test, expect } from '@playwright/test';
import fs from 'node:fs';

async function open(page, query = 'seed=7&preset=ecosystem&paused') {
  await page.goto(`/?nosw=1&${query}`);
  await page.waitForFunction(() => window.__primordia);
}
const tick = (page) => page.evaluate(() => window.__primordia.world.tick);
const pop = (page) => page.evaluate(() => window.__primordia.world.creatures.length);

test('loads a seeded world, paused, with stats, charts and controls', async ({ page }) => {
  await open(page);
  await expect(page).toHaveTitle('Primordia');
  await expect(page.locator('#seed')).toHaveValue('7');
  await expect(page.locator('#btn-play')).toHaveText('Play');
  await expect(page.locator('[data-stat="stat.pop"] .v')).toHaveText('100');
  await expect(page.locator('.chart')).toHaveCount(6);
  expect(await tick(page)).toBe(0);
});

test('play advances time, pause stops it, step moves one tick', async ({ page }) => {
  await open(page);
  await page.click('#btn-play');
  await expect(page.locator('#btn-play')).toHaveText('Pause');
  await expect.poll(() => tick(page)).toBeGreaterThan(20);
  await page.keyboard.press('Space');
  await expect(page.locator('#btn-play')).toHaveText('Play');
  const t0 = await tick(page);
  await page.waitForTimeout(300);
  expect(await tick(page)).toBe(t0);
  await page.click('#btn-step');
  expect(await tick(page)).toBe(t0 + 1);
});

test('the same seed replays the same history; a new seed does not', async ({ page }) => {
  await open(page, 'seed=31&preset=ecosystem&paused');
  await page.evaluate(() => window.__primordia.run(700));
  const a = await page.evaluate(() => window.__primordia.S.fingerprint(window.__primordia.world));
  await open(page, 'seed=31&preset=ecosystem&paused');
  await page.evaluate(() => window.__primordia.run(700));
  expect(await page.evaluate(() => window.__primordia.S.fingerprint(window.__primordia.world))).toBe(a);
  await page.fill('#seed', '32');
  await page.click('#btn-new');
  await expect(page).toHaveURL(/seed=32/);
  await page.evaluate(() => window.__primordia.run(700));
  expect(await page.evaluate(() => window.__primordia.S.fingerprint(window.__primordia.world))).not.toBe(a);
});

test('clicking a creature opens the inspector with genes, brain and follow', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.__primordia.run(300));
  const id = await page.evaluate(() => window.__primordia.world.creatures[5].id);
  const [x, y] = await page.evaluate((id) => window.__primordia.screenOf(id), id);
  await page.mouse.click(x, y);
  await expect(page.locator('#inspector .sub')).toContainText(`#`);
  await expect(page.locator('#inspector .genes .v')).toHaveCount(6);
  await expect(page.locator('#brain')).toBeVisible();
  const picked = await page.locator('#inspector .sub').textContent();
  expect(picked.startsWith(`#${id}`) || /^#\d+/.test(picked)).toBe(true);
  await page.click('#btn-follow');
  await expect(page.locator('#btn-follow')).toHaveText('Stop following');
  await page.keyboard.press('Escape');
  await expect(page.locator('#inspector .empty')).toBeVisible();
});

test('events: meteor culls, bloom feeds, ice age is logged', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.__primordia.run(400));
  const before = await pop(page);
  await page.click('.ev[data-ev="meteor"]');
  expect(await pop(page)).toBeLessThan(before * 0.85);
  const plants = await page.evaluate(() => window.__primordia.world.plants);
  await page.click('.ev[data-ev="bloom"]');
  expect(await page.evaluate(() => window.__primordia.world.plants)).toBeGreaterThan(plants);
  await page.click('.ev[data-ev="iceage"]');
  expect(await page.evaluate(() => window.__primordia.world.events.map((e) => e.kind))).toEqual(['meteor', 'bloom', 'iceage']);
});

test('species chart shows a legend and a hover tooltip', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.__primordia.run(3000));
  const chart = page.locator('.chart[data-chart="species"]');
  await expect(chart.locator('.legend > span')).not.toHaveCount(0);
  await expect(chart.locator('.legend')).toContainText('Other species');
  await chart.scrollIntoViewIfNeeded();
  const box = await chart.locator('canvas').boundingBox();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2);
  await expect(page.locator('#tip')).toBeVisible();
  await expect(page.locator('#tip')).toContainText('Population');
  await page.mouse.move(5, 5);
  await expect(page.locator('#tip')).toBeHidden();
});

test('save and load restore the exact world', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.__primordia.run(500));
  const fp = await page.evaluate(() => window.__primordia.S.fingerprint(window.__primordia.world));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-save')]);
  expect(dl.suggestedFilename()).toBe('primordia-7-t500.json');
  const buf = fs.readFileSync(await dl.path());
  await page.click('#btn-step');
  await page.locator('#file-load').setInputFiles({ name: 'w.json', mimeType: 'application/json', buffer: buf });
  await expect(page.locator('#toast')).toHaveText('World loaded');
  expect(await page.evaluate(() => window.__primordia.S.fingerprint(window.__primordia.world))).toBe(fp);
  await page.locator('#file-load').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"x":1}') });
  await expect(page.locator('#toast')).toHaveText('That file is not a Primordia save.');
});

test('extinction shows the banner; Turkish UI; no console errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await open(page);
  await page.selectOption('#set-lang', 'tr');
  await expect(page.locator('#btn-play')).toHaveText('Oynat');
  await expect(page.locator('.chart[data-chart="species"] h4 span').first()).toHaveText('Zaman içinde türler');
  await page.evaluate(() => { const w = window.__primordia.world; w.creatures = []; });
  await expect(page.locator('#extinct')).toBeVisible();
  await expect(page.locator('#extinct h2')).toHaveText('Yaşam sona erdi.');
  await page.click('#btn-ext-new');
  await expect(page.locator('#extinct')).toBeHidden();
  expect(errors).toEqual([]);
});
