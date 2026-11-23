import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {chromium} from 'playwright';

const output = 'artifacts/cas-02-1-f2-c4c';
mkdirSync(output, {recursive: true});
const base = process.env.CAS_C4_TEST_URL ?? 'http://127.0.0.1:8765';
const preview = base + '/cas-f2-c4b-lab.html';
const browser = await chromium.launch({headless: true, args: [
  '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'
]});
const report = [];
try {
  for (const [width, height] of [[390, 844], [320, 568]]) {
    const context = await browser.newContext({
      viewport: {width, height}, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block'
    });
    const page = await context.newPage();
    const errors = [], requests = new Set();
    page.on('pageerror', error => errors.push(error.message));
    page.on('crash', () => errors.push('crash'));
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname.endsWith('/mira-c4c-heels.glb')) requests.add(url.searchParams.get('v'));
    });
    const probe = () => page.evaluate(() => window.__LifeSimCasC4B());
    const wait = (outfit, resident = 'mira') => page.waitForFunction(([outfit, resident]) => {
      const active = window.__LifeSimCasC4B?.().active;
      return active?.outfit === outfit && active.resident === resident;
    }, [outfit, resident], {timeout: 30000});
    const frame = name => page.screenshot({path: output + '/' + width + 'x' + height + '-' + name + '.png'});
    const drag = async (dx, dy) => {
      const x = width / 2, y = 104;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx, y + dy, {steps: 5});
      await page.mouse.up();
    };
    const motion = page.locator('#motion');
    const outfit = page.locator('#outfit');
    const run = () => page.locator('#motion option[value="run"]').evaluate(option => option.disabled);
    await page.goto(preview + '?outfit=heels', {waitUntil: 'domcontentloaded'});
    await wait('heels');
    assert.equal(await page.locator('#preview-still').isVisible(), false);
    const first = (await probe()).residents[0];
    assert.equal(first.activeClip, 'C4C heel idle');
    assert.equal(first.groundOffset, 0);
    assert.equal(first.skinned, true);
    assert.equal(await run(), true);
    assert.deepEqual(first.garment.filter(name => name.includes('opening')), ['C3 opening foot left', 'C3 opening foot right']);
    await motion.selectOption('bind');
    assert.equal((await probe()).residents[0].activeClip, 'C4C heel stance');
    await frame('front');
    await drag(0, 80);
    await frame('opening');
    await page.locator('#socks').selectOption('on');
    assert.deepEqual((await probe()).residents[0].garment.filter(name => name.includes('opening')),
      ['C3 opening sock left', 'C3 opening sock right']);
    await frame('opening-socks');
    await page.locator('#socks').selectOption('off');
    await drag(-135, -72);
    await frame('side');
    await drag(-150, 0);
    await frame('rear');
    await drag(115, 0);
    await motion.selectOption('walk');
    await page.locator('#pause').click();
    const before = (await probe()).residents[0];
    assert.equal(before.activeClip, 'C4C heel walk');
    const phase = page.locator('#phase');
    await phase.evaluate(el => {
      el.value = Number(el.value) > 47 ? '5' : '70';
      el.dispatchEvent(new Event('input', {bubbles: true}));
    });
    await page.waitForFunction(p => window.__LifeSimCasC4B().residents[0].lean.some((v, i) =>
      Math.abs(v - p[i]) > .01), before.lean);
    await frame('walk-phase');
    await motion.selectOption('sit');
    assert.equal((await probe()).residents[0].activeClip, 'C4C heel sit to stand');
    await phase.evaluate(el => {
      el.value = '33';
      el.dispatchEvent(new Event('input', {bubbles: true}));
    });
    await frame('sit-to-stand');
    await page.locator('#pause').click();
    await outfit.selectOption('mary-jane');
    await wait('mary-jane');
    assert.equal(await run(), false);
    await motion.selectOption('run');
    assert.equal((await probe()).residents[0].activeClip, 'Running');
    await outfit.selectOption('heels');
    await wait('heels');
    assert.equal(await motion.inputValue(), 'walk');
    assert.equal((await probe()).residents[0].activeClip, 'C4C heel walk');
    await motion.selectOption('idle');
    await page.locator('#resident').selectOption('two');
    await wait('heels', 'two');
    assert.equal((await probe()).residents.length, 2);
    await page.locator('#resident').selectOption('four');
    await wait('heels', 'four');
    await page.waitForTimeout(1200);
    const group = await probe();
    assert.equal(group.residents.length, 4);
    assert.ok(group.residents.every(r => r.resident === 'mira' && r.skinned && r.activeClip === 'C4C heel idle'));
    assert.equal(requests.size, 1);
    assert.match([...requests][0], /^[a-f0-9]{64}$/);
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => localStorage.getItem('lifesim.room01.v1')), null);
    await frame('four-rigs');
    await page.close();
    if (width === 390) {
      const fallback = await context.newPage();
      await fallback.route('**/c4c-manifest.json', route => route.fulfill({status: 503}));
      await fallback.goto(preview);
      await fallback.waitForFunction(() => window.__LifeSimCasC4B?.().active?.outfit === 'ballet');
      await fallback.locator('#outfit').selectOption('heels');
      await fallback.waitForFunction(() => document.getElementById('status').textContent.includes('каблуков недоступна'));
      assert.equal(await fallback.locator('#outfit').inputValue(), 'ballet');
      assert.equal(await fallback.evaluate(() => window.__LifeSimCasC4B().active.outfit), 'ballet');
      await fallback.close();

      const blocked = await context.newPage();
      await blocked.route('**/vendor/playcanvas.mjs*', route => route.abort());
      await blocked.goto(preview + '?outfit=heels');
      await blocked.locator('#retry').waitFor({state: 'visible'});
      assert.match(await blocked.locator('#status').innerText(), /Не удалось запустить 3D/);
      assert.ok(await blocked.locator('#preview-still img').evaluate(img => img.complete && img.naturalWidth > 0));
      await blocked.close();

      const noGpu = await context.newPage();
      await noGpu.addInitScript(() => {
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          return type.startsWith('webgl') ? null : getContext.call(this, type, ...args);
        };
      });
      await noGpu.goto(preview + '?outfit=heels');
      await noGpu.locator('#retry').waitFor({state: 'visible'});
      assert.match(await noGpu.locator('#status').innerText(), /Не удалось запустить 3D/);
      assert.equal(await noGpu.locator('#preview-still').isVisible(), true);
      await noGpu.close();

      const slow = await context.newPage();
      await slow.route('**/mira-c4c-heels.glb*', async route => {
        await slow.clock.fastForward(21000);
        await route.abort();
      });
      await slow.clock.install();
      await slow.goto(preview + '?outfit=heels');
      await slow.waitForFunction(() => document.getElementById('status').textContent.includes('Истекло время загрузки'));
      assert.equal(await slow.locator('#outfit').inputValue(), 'original');
      assert.equal(await slow.evaluate(() => window.__LifeSimCasC4B().active.outfit), 'original');
      await slow.close();

    }
    report.push({width, height, fourMiraFps: group.fps, physicalIphone: false});
    await context.close();
  }
} finally {
  writeFileSync(output + '/report.json', JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
