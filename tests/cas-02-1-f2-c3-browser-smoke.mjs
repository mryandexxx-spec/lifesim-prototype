import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const output = 'artifacts/cas-02-1-f2-c3';
mkdirSync(output, {recursive: true});
const browser = await chromium.launch({headless: true, args: [
  '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'
]});
const report = [];
const base = process.env.CAS_C3_TEST_URL ?? 'http://127.0.0.1:8765';
try {
  for (const [width, height] of [[390, 844], [320, 568]]) {
    const context = await browser.newContext({viewport: {width, height},
      deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block'});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('crash', () => errors.push('crash'));
    const probe = () => page.evaluate(() => window.__LifeSimCasC3?.());
    const wait = (resident, outfit) => page.waitForFunction(([r, o]) => {
      const s = window.__LifeSimCasC3?.();
      return s?.active?.resident === r && s.active.outfit === o;
    }, [resident, outfit], {timeout: 35000});
    const frame = async name => {
      const data = await page.screenshot({path: output + '/' + width + 'x' + height + '-' + name + '.png'});
      return createHash('sha256').update(data).digest('hex');
    };
    await page.goto(base + '/cas-f2-c3-lab.html', {waitUntil: 'domcontentloaded'});
    const comparisons = [];
    for (const resident of ['alex', 'mira']) {
      await page.locator('#resident').selectOption(resident);
      await wait(resident, 'dress');
      for (const style of ['dress', 'sneakers', 'boots']) {
        await page.locator('#outfit').selectOption(style);
        await wait(resident, style);
        const s = await probe();
        assert.equal(s.residents.length, 1);
        assert.equal(s.residents[0].original, false);
        assert.equal(s.residents[0].skinned, true);
        assert.ok(s.residents[0].garment.includes('C3 shoe left'));
        assert.ok(s.residents[0].garment.includes('C3 shoe right'));
        comparisons.push({resident, style, sha: await frame(resident + '-' + style)});
      }
      await page.locator('#outfit').selectOption('dress');
      await wait(resident, 'dress');
    }
    assert.equal(new Set(comparisons.map(x => x.sha)).size, comparisons.length);
    await page.locator('#socks').selectOption('off');
    assert.ok((await probe()).residents[0].garment.includes('C3 opening foot left'));
    assert.ok(!(await probe()).residents[0].garment.some(x => x.includes('sock')));
    await frame('mira-without-socks');

    for (const [motion, clip] of [['walk','Walking'], ['run','Running'], ['sit','Sit_to_Stand_Transition_F']]) {
      await page.locator('#motion').selectOption(motion);
      assert.equal((await probe()).residents[0].activeClip, clip);
      await frame('mira-' + motion);
    }
    await page.locator('#motion').selectOption('walk');
    await page.locator('#pause').click();
    const pose = (await probe()).residents[0].lean;
    await page.locator('#phase').evaluate(e => {
      e.value = Number(e.value) > 45 ? '0' : '65';
      e.dispatchEvent(new Event('input', {bubbles: true}));
    });
    await page.waitForFunction(initial => {
      const now = window.__LifeSimCasC3().residents[0].lean;
      return now.some((v, i) => Math.abs(v-initial[i]) > .01);
    }, pose);
    await frame('mira-walk-phase');
    await page.locator('#pause').click();

    await page.locator('#outfit').selectOption('original');
    await wait('mira', 'original');
    assert.equal((await probe()).residents[0].original, true);
    assert.deepEqual((await probe()).residents[0].garment, []);
    await page.locator('#resident').selectOption('two');
    await wait('two', 'original');
    assert.equal((await probe()).residents.length, 2);
    await page.locator('#resident').selectOption('four');
    await wait('four', 'original');
    await page.locator('#outfit').selectOption('sneakers');
    await wait('four', 'sneakers');
    await page.waitForTimeout(1200);
    const s = await probe();
    assert.equal(s.residents.length, 4);
    assert.ok(s.residents.every(r => r.skinned && r.garment.includes('C3 shoe right')));
    await frame('four-sneakers');
    assert.equal(await page.evaluate(() => localStorage.getItem('lifesim.room01.v1')), null);
    assert.deepEqual(errors, []);
    const fallback = await context.newPage();
    await fallback.route('**/cas-c3/manifest.json', route => route.fulfill({status: 404}));
    await fallback.goto(base + '/cas-f2-c3-lab.html');
    await fallback.waitForFunction(() => window.__LifeSimCasC3?.().originalFallback === true);
    assert.match(await fallback.locator('#status').innerText(), /исходный Алекс/);
    await fallback.close();
    report.push({width, height, comparisons, fourResidentFps: s.fps, physicalSafari: false});
    await context.close();
  }
} finally {
  writeFileSync(output + '/report.json', JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
