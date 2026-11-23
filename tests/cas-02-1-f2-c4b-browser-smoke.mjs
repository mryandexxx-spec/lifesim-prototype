import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const output = 'artifacts/cas-02-1-f2-c4b';
mkdirSync(output, {recursive: true});
const browser = await chromium.launch({headless: true, args: [
  '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'
]});
const report = [];
const base = process.env.CAS_C4_TEST_URL ?? 'http://127.0.0.1:8765';
try {
  for (const [width, height] of [[390, 844], [320, 568]]) {
    const context = await browser.newContext({viewport: {width, height},
      deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block'});
    const page = await context.newPage();
    const errors = [];
    const modelRequests = new Set();
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname.includes('/cas-c3/') && url.pathname.endsWith('.glb'))
        modelRequests.add(url.searchParams.get('v'));
    });
    page.on('pageerror', e => errors.push(e.message));
    page.on('crash', () => errors.push('crash'));
    const probe = () => page.evaluate(() => window.__LifeSimCasC4B?.());
    const wait = (resident, outfit) => page.waitForFunction(([r, o]) => {
      const s = window.__LifeSimCasC4B?.();
      return s?.active?.resident === r && s.active.outfit === o;
    }, [resident, outfit], {timeout: 35000});
    const frame = async name => {
      const data = await page.screenshot({path: output + '/' + width + 'x' + height + '-' + name + '.png'});
      return createHash('sha256').update(data).digest('hex');
    };
    await page.goto(base + '/cas-f2-c4b-lab.html', {waitUntil: 'domcontentloaded'});
    assert.equal(await page.locator('#socks').inputValue(), 'off', 'female open shoes start without socks');
    const comparisons = [];
    for (const resident of ['mira']) {
      await page.locator('#resident').selectOption(resident);
      await wait(resident, 'ballet');
      for (const style of ['ballet','mary-jane','ankle-boots']) {
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
      await page.locator('#socks').selectOption('off');
      await page.locator('#outfit').selectOption('bare');
      await wait(resident, 'bare');
      await frame(resident + '-barefoot');
      await page.locator('#outfit').selectOption('ballet');
      await wait(resident, 'ballet');
      await frame(resident + '-dress-bare-ankle');
      await page.locator('#socks').selectOption('on');
    }
    assert.equal(new Set(comparisons.map(x => x.sha)).size, comparisons.length);
    await page.locator('#socks').selectOption('off');
    assert.ok((await probe()).residents[0].garment.includes('C3 opening foot left'));
    assert.ok(!(await probe()).residents[0].garment.some(x => x.includes('sock')));
    await frame('mira-without-socks');
    await page.locator('#socks').selectOption('on');
    assert.ok((await probe()).residents[0].garment.includes('C3 opening sock left'));
    await frame('mira-with-optional-cotton-socks');
    await page.locator('#socks').selectOption('off');

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
      const now = window.__LifeSimCasC4B().residents[0].lean;
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
    await page.locator('#outfit').selectOption('mary-jane');
    await wait('four', 'mary-jane');
    await page.waitForTimeout(1200);
    const s = await probe();
    assert.equal(s.residents.length, 4);
    assert.ok(s.residents.every(r => r.resident === 'mira' && r.skinned && r.garment.includes('C3 shoe right')));
    await frame('four-sneakers');
    assert.equal(await page.evaluate(() => localStorage.getItem('lifesim.room01.v1')), null);
    assert.deepEqual(errors, []);
    assert.equal(modelRequests.size, 4);
    assert.ok([...modelRequests].every(hash => /^[a-f0-9]{64}$/.test(hash)));
    const fallback = await context.newPage();
    await fallback.route('**/cas-c3/c4-manifest.json', route => route.fulfill({status: 404}));
    await fallback.goto(base + '/cas-f2-c4b-lab.html');
    await fallback.waitForFunction(() => window.__LifeSimCasC4B?.().originalFallback === true);
    assert.match(await fallback.locator('#status').innerText(), /исходная Мира/);
    await fallback.close();
    report.push({width, height, comparisons, fourResidentFps: s.fps, physicalSafari: false});
    await context.close();
  }
} finally {
  writeFileSync(output + '/report.json', JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
