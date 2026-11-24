import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const lab = fileURLToPath(new URL('./', import.meta.url));
const root = resolve(lab, '../../..');
const assets = process.env.CAS_P3_ASSETS ?? join(lab, 'assets');
const out = process.env.CAS_P3_ARTIFACTS ?? join(tmpdir(), 'cas-head-v2-p3-browser');
const options = { '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.glb': 'model/gltf-binary' };
const routes = Object.fromEntries(['index.html', 'app.mjs', 'config.mjs', 'style.css'].map((name) => [`/${name}`, join(lab, name)]));
for (const name of ['meshy-casual-v1.glb', 'meshy-mira-mobile-v1.glb']) routes[`/assets/${name}`] = join(root, 'assets/characters', name);
for (const name of ['alex-p3.glb', 'mira-p3.glb']) routes[`/assets/${name}`] = join(assets, name);
routes['/vendor/playcanvas.mjs'] = join(root, 'node_modules/playcanvas/build/playcanvas.min.mjs');
routes['/'] = routes['/index.html'];
const server = createServer((request, response) => {
  const file = routes[new URL(request.url, 'http://localhost').pathname];
  if (!file) { response.writeHead(404).end(); return; }
  const stream = createReadStream(file);
  stream.on('open', () => response.writeHead(200, { 'Content-Type': options[extname(file)] }));
  stream.on('error', () => response.writeHead(404).end());
  stream.pipe(response);
});
await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
const url = process.env.CAS_P3_URL ?? `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_BIN,
  headless: true,
  args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
mkdirSync(out, { recursive: true });
const channels = ['eyes', 'nose', 'lips', 'chin', 'cheeks'];
const results = [];

function pixelDifference(page, a, b) {
  return page.evaluate(async ([a, b]) => {
    const load = async (data) => {
      const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, image.width, image.height).data;
    };
    const pixelsA = await load(a);
    const pixelsB = await load(b);
    let changed = 0;
    let aggregate = 0;
    for (let i = 0; i < pixelsA.length; i += 4) {
      const delta = Math.abs(pixelsA[i]-pixelsB[i]) + Math.abs(pixelsA[i+1]-pixelsB[i+1]) + Math.abs(pixelsA[i+2]-pixelsB[i+2]);
      if (delta >= 15) changed++;
      aggregate += delta;
    }
    return { changed, mean: aggregate / (pixelsA.length * .75) };
  }, [a.toString('base64'), b.toString('base64')]);
}

try {
  for (const [width, height] of [[390, 844], [320, 568]]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const canvas = page.locator('#review-canvas');
    const waitForModel = (family, variant) => page.waitForFunction(([family, variant]) => (
      document.querySelector('canvas').dataset.model === `${family}:${variant}` && !document.querySelector('[data-error]')
    ), [family, variant], { timeout: 20000 });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    try {
      await waitForModel('alex', 'derived');
    } catch (error) {
      throw new Error(`PlayCanvas start: ${await page.locator('#status').innerText()}. ${errors.join(', ')}`, { cause: error });
    }
    const viewport = await page.locator('#viewport').boundingBox();
    const canvasBounds = await canvas.boundingBox();
    const panel = await page.locator('#panel').boundingBox();
    assert.ok(Math.abs(canvasBounds.width - viewport.width) < 1);
    assert.ok(Math.abs(canvasBounds.height - viewport.height) < 1);
    assert.ok(viewport.height >= 205 && viewport.y + viewport.height <= panel.y + 1);
    const minimumSliderHeight = await page.locator('[data-morph]').evaluateAll((sliders) => Math.min(...sliders.map((el) => el.getBoundingClientRect().height)));
    assert.ok(minimumSliderHeight >= 44);
    for (const family of ['alex', 'mira']) {
      const familyResult = { width, height, family, viewport, perMorph: {}, animations: {} };
      const shot = (slug) => page.screenshot({ path: join(out, `${width}x${height}-${family}-${slug}.png`) });
      await page.locator(`[data-family="${family}"]`).tap();
      await waitForModel(family, 'derived');
      await page.locator('#min').tap();
      await page.evaluate(() => scrollTo(0, 0));
      await page.locator('#panel').evaluate((panel) => { panel.scrollTop = 0; });
      const before = await canvas.screenshot();
      await shot('neutral');
      for (const channel of channels) {
        const slider = page.locator(`[data-morph="${channel}"]`);
        await slider.fill('100');
        const delta = await pixelDifference(page, before, await canvas.screenshot());
        assert.ok(delta.changed >= 8, `${family} ${channel} did not move a visible region: ${JSON.stringify(delta)}`);
        familyResult.perMorph[channel] = delta;
        await slider.fill('0');
      }
      await page.locator('#max').tap();
      assert.deepEqual(await page.locator('[data-morph]').evaluateAll((els) => els.map((el) => el.value)), Array(5).fill('100'));
      familyResult.all = await pixelDifference(page, before, await canvas.screenshot());
      await page.locator('#panel').evaluate((panel) => { panel.scrollTop = 0; });
      await shot('all-max');
      await page.locator('#rotate').tap();
      await shot('three-quarter');
      await page.locator('#rotate').tap();
      await shot('profile');
      await page.locator('[data-variant="original"]').tap();
      await waitForModel(family, 'original');
      assert.equal(await page.locator('input[data-morph]:disabled').count(), 5);
      await shot('original-profile');
      await page.locator('[data-variant="derived"]').tap();
      await waitForModel(family, 'derived');
      assert.deepEqual(await page.locator('[data-morph]').evaluateAll((els) => els.map((el) => el.value)), Array(5).fill('100'));
      await page.locator('#min').tap();
      await page.locator('#frame').tap();
      await page.locator('#panel').evaluate((panel) => { panel.scrollTop = 0; });
      for (const cue of ['idle', 'walk', 'sit']) {
        await page.locator('#pose').selectOption(cue);
        const first = await canvas.screenshot();
        await page.waitForTimeout(380);
        const difference = await pixelDifference(page, first, await canvas.screenshot());
        assert.ok(difference.changed > 20, `${family} ${cue} did not animate: ${JSON.stringify(difference)}`);
        familyResult.animations[cue] = difference;
        if (cue !== 'idle') await shot(cue);
      }
      await page.locator('#pose').selectOption('neutral');
      await page.locator('#frame').tap();
      for (let i = 0; i < 6; i++) await page.locator('#rotate').tap();
      assert.equal(await page.locator('#rotate span').textContent(), '0°');
      assert.deepEqual(errors, []);
      results.push(familyResult);
      console.log(`${width}×${height} ${family}: 5 individual morphs, combined morph, original comparison and 3 live clips`);
    }
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
  writeFileSync(join(out, 'report.json'), JSON.stringify({ results, physicalIphoneVerified: false, ownerArtApproved: false }, null, 2));
}
