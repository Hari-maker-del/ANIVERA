/**
 * End-to-end regression test for the hero slideshow (real browser, real clicks).
 *
 *   npm run build && node scripts/test-hero-slideshow.mjs
 *
 * Needs Playwright + a Chromium build (not a project dependency, so Vercel never installs it):
 *   PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs   (optional; defaults to `import("playwright")`)
 *   PLAYWRIGHT_CHROMIUM=/path/to/chrome               (optional; defaults to Playwright's own browser)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const mod = process.env.PLAYWRIGHT_MODULE || 'playwright';
let chromium;
try { ({ chromium } = await import(mod)); } catch {
  console.error(`Cannot load Playwright (${mod}). Install it or set PLAYWRIGHT_MODULE.`);
  process.exit(2);
}

const DIST = path.resolve('dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(DIST, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}/`;

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
let passed = 0;
const ok = (name) => { passed++; console.log(`  PASS  ${name}`); };

async function open(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 }, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ANIVERA_HERO__);
  return { ctx, page, errors };
}
const state = (page) => page.evaluate(() => {
  const h = window.__ANIVERA_HERO__, cat = h.getCatalogue(), i = h.getCurrentIndex();
  const t = (id) => document.getElementById(id).textContent.trim();
  const act = document.querySelector('#cinematic-hero .cinematic-hero-img.is-active');
  return {
    i, total: cat.length, counter: t('hero-slide-num'), name: t('hero-common-name'), sci: t('hero-scientific-name'),
    desc: t('hero-description'), src: act && act.getAttribute('src'), alt: act && act.alt, playing: h.isPlaying(), busy: h.isBusy(),
    expected: { name: cat[i].name || cat[i].commonName, sci: cat[i].scientificName, desc: cat[i].description, src: cat[i].imageUrl || cat[i].imageSource, counter: String(i + 1).padStart(2, '0') + ' / ' + cat.length }
  };
});
function assertSynced(s, label) {
  assert.equal(s.name, s.expected.name, `${label}: name`);
  assert.equal(s.sci, s.expected.sci, `${label}: scientific name`);
  assert.equal(s.desc, s.expected.desc, `${label}: description`);
  assert.equal(s.src, s.expected.src, `${label}: photograph`);
  assert.equal(s.counter, s.expected.counter, `${label}: counter`);
}
const idle = (page) => page.waitForFunction(() => !window.__ANIVERA_HERO__.isBusy(), null, { timeout: 4000 });
const ty = (page, sel) => page.evaluate((s) => new DOMMatrix(getComputedStyle(document.querySelector(s)).transform).m42, sel);

try {
  // 1. Structure, errors, initial state ------------------------------------------------
  {
    const { ctx, page, errors } = await open();
    assert.equal(await page.locator('#hero-play-pause-btn').count(), 1, 'exactly one Play/Pause button');
    assert.ok(await page.locator('#hero-play-pause-btn').isVisible(), 'Play/Pause visible');
    assert.ok(await page.locator('#hero-slide-num').isVisible(), 'counter visible');
    const s = await state(page);
    assert.equal(s.total, 142); assert.equal(s.counter, '01 / 142'); assert.equal(s.name, 'Snow Leopard'); assertSynced(s, 'initial');
    ok('initial state: 142 animals, 01 / 142, synced, one Play/Pause button');

    // 2. DOWN arrow -> next, upward slide, 900ms --------------------------------------
    await page.click('#hero-next-btn');
    await page.waitForTimeout(350);
    const inUp = await ty(page, '#cinematic-hero .cinematic-hero-img.is-active');
    const outUp = await ty(page, '#cinematic-hero .cinematic-hero-img:not(.is-active).hero-pos-above');
    assert.ok(inUp > 0, `incoming photo should be travelling up from below (translateY=${inUp})`);
    assert.ok(outUp < 0, `outgoing photo should be leaving upward (translateY=${outUp})`);
    const t0 = Date.now(); await idle(page); const dur = Date.now() - t0 + 350;
    assert.ok(dur >= 800 && dur <= 1150, `transition ~900ms, measured ${dur}ms`);
    let n = await state(page); assert.equal(n.counter, '02 / 142'); assertSynced(n, 'after DOWN');
    ok(`DOWN arrow: next animal, upward vertical slide, ~${dur}ms, all fields synced`);

    // 3. UP arrow -> previous, downward slide -------------------------------------------
    await page.click('#hero-prev-btn');
    await page.waitForTimeout(350);
    const inDown = await ty(page, '#cinematic-hero .cinematic-hero-img.is-active');
    const outDown = await ty(page, '#cinematic-hero .cinematic-hero-img:not(.is-active).hero-pos-below');
    assert.ok(inDown < 0, `incoming photo should travel down from above (translateY=${inDown})`);
    assert.ok(outDown > 0, `outgoing photo should be leaving downward (translateY=${outDown})`);
    await idle(page);
    n = await state(page); assert.equal(n.counter, '01 / 142'); assertSynced(n, 'after UP');
    ok('UP arrow: previous animal, downward vertical slide, all fields synced');

    // 4. Looping both directions ---------------------------------------------------------
    await page.click('#hero-prev-btn'); await idle(page);
    n = await state(page); assert.equal(n.counter, '142 / 142'); assertSynced(n, 'wrap back');
    await page.click('#hero-next-btn'); await idle(page);
    n = await state(page); assert.equal(n.counter, '01 / 142'); assertSynced(n, 'wrap forward');
    ok('continuous looping: 01 -> 142 and 142 -> 01');

    // 5. Rapid clicks are queued, not lost ----------------------------------------------
    await page.click('#hero-next-btn'); await page.click('#hero-next-btn'); await page.click('#hero-next-btn');
    await page.waitForFunction(() => window.__ANIVERA_HERO__.getCurrentIndex() === 3 && !window.__ANIVERA_HERO__.isBusy(), null, { timeout: 6000 });
    assertSynced(await state(page), 'after 3 rapid clicks');
    ok('rapid clicks: 3 quick DOWN clicks land on animal 04');
    assert.deepEqual(errors, [], 'page errors: ' + errors.join(' | '));
    ok('no JavaScript errors during interaction');
    await ctx.close();
  }

  // 6. Automatic rotation every 5s; manual click resets the timer; Play/Pause -------------
  {
    const { ctx, page, errors } = await open();
    const changes = [];
    await page.exposeFunction('__mark', (i) => changes.push({ i, t: Date.now() }));
    await page.evaluate(() => { let last = window.__ANIVERA_HERO__.getCurrentIndex(); setInterval(() => { const c = window.__ANIVERA_HERO__.getCurrentIndex(); if (c !== last) { last = c; window.__mark(c); } }, 25); });
    await page.waitForFunction(() => window.__ANIVERA_HERO__.getCurrentIndex() >= 2, null, { timeout: 13000 });
    const gap = changes[1].t - changes[0].t;
    assert.ok(Math.abs(gap - 5000) < 400, `auto interval ~5000ms, measured ${gap}ms`);
    ok(`automatic rotation: animals change every ~5s (measured ${gap}ms)`);
    await idle(page);

    // manual click while auto is running -> timer restarts
    const before = (await state(page)).i;
    await page.waitForTimeout(3000);
    const tClick = Date.now(); await page.click('#hero-next-btn');
    await page.waitForTimeout(3600);                         // 3.6s after click: old timer (2s left) would already have fired
    let s = await state(page);
    assert.equal(s.i, before + 1, 'no extra auto change before the reset timer elapses');
    await page.waitForFunction((b) => window.__ANIVERA_HERO__.getCurrentIndex() === b + 2, before, { timeout: 4000 });
    const reset = Date.now() - tClick;
    assert.ok(Math.abs(reset - 5000) < 500, `next auto change ~5s after the manual click, measured ${reset}ms`);
    assertSynced(await state(page), 'after reset');
    ok(`manual click while auto runs; timer reset (next auto change ${reset}ms after click)`);

    // pause / play
    await page.click('#hero-play-pause-btn');
    assert.equal(await page.locator('#hero-play-pause-btn').textContent(), 'Play');
    const paused = (await state(page)).i; await page.waitForTimeout(6000);
    assert.equal((await state(page)).i, paused, 'no auto change while paused');
    await page.click('#hero-next-btn'); await idle(page);   // manual still works while paused
    assert.equal((await state(page)).i, paused + 1);
    await page.click('#hero-play-pause-btn');
    assert.equal(await page.locator('#hero-play-pause-btn').textContent(), 'Pause');
    await page.waitForFunction((p) => window.__ANIVERA_HERO__.getCurrentIndex() === p + 2, paused, { timeout: 7000 });
    ok('Play/Pause: pauses rotation, manual nav still works, Play resumes');
    assert.deepEqual(errors, [], 'page errors: ' + errors.join(' | '));
    await ctx.close();
  }

  // 7. Walk every one of the 142 animals (reduced motion = instant slides) ---------------
  {
    const { ctx, page, errors } = await open({ reducedMotion: 'reduce' });
    await page.click('#hero-play-pause-btn');
    const seen = new Set();
    for (let k = 0; k < 142; k++) {
      const s = await state(page);
      assertSynced(s, `animal ${k + 1}`); seen.add(s.expected.name + s.i);
      await page.click('#hero-next-btn'); await idle(page);
    }
    assert.equal(seen.size, 142, 'all 142 animals shown');
    assert.equal((await state(page)).counter, '01 / 142', 'looped back to the start');
    ok('all 142 animals visited via real clicks, each fully synced, loop closes');
    assert.deepEqual(errors, [], 'page errors: ' + errors.join(' | '));
    await ctx.close();
  }
  console.log(`\n${passed} checks passed`);
} catch (err) {
  console.error('\nFAILED:', err.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}