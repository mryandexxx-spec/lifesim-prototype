/** PHONE-PLATFORM-R1: actual game + PlayCanvas/WebGL, two mobile sizes.
 * Does not stand in for owner's physical Safari acceptance.
 */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const seed=newHousehold('2026-11-22');
seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
seed.speed=3;seed.otherSim.speed=3;
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
try{
  mkdirSync('artifacts/phone-platform-r1',{recursive:true});
  for(const [width,height] of [[390,844],[320,568]]){
    const context=await browser.newContext({viewport:{width,height},
      deviceScaleFactor:1,hasTouch:true,isMobile:true,serviceWorkers:'block'});
    await context.addInitScript(({key,record,tour})=>{
      if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
      localStorage.setItem(tour,'done');
    },{key:SAVE_KEY,record:seed,tour:UI_TOUR_STORAGE_KEY});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('crash',()=>errors.push('WebGL crashed'));
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
    assert.equal(await page.evaluate(async()=>{
      const {Application}=await import('playcanvas');
      return Boolean(Application.getApplication()?.graphicsDevice?.canvas);
    }),true,'real PlayCanvas WebGL startup');
    assert.ok((await page.locator('#game-canvas').screenshot()).length>1800);
    await page.locator('#career-phone-toggle').tap();
    const phone=page.locator('#career-phone-panel');
    await phone.waitFor({state:'visible'});
    assert.equal(await phone.getAttribute('aria-label'),'Смартфон: главный экран');
    assert.equal(await phone.locator('.phone-platform-tile').count(),5);
    const appIds=await phone.locator('.phone-platform-tile').evaluateAll(els=>
      els.map(el=>el.dataset.phoneApp));
    assert.deepEqual(appIds,['work','food','finance','calls','sports']);
    await page.screenshot({path:'artifacts/phone-platform-r1/home-'+width+'.png'});
    await phone.locator('[data-phone-app="work"]').tap();
    assert.equal(await phone.getAttribute('aria-label'),'Смартфон: работа Блин’С');
    assert.ok(await phone.locator('.career-phone-tab').count()>=3,
      'existing careers, applications, history and map preserved');
    await phone.locator('.phone-platform-home').tap();
    await phone.locator('[data-phone-app="food"]').tap();
    assert.match(await phone.locator('.career-phone-body').innerText(),/Солнечная крупяная миска/);
    assert.match(await phone.locator('.career-phone-body').innerText(),/18 игровых минут/);
    assert.equal(await phone.locator('.ready-food-card').count(),3);
    await phone.locator('.phone-platform-home').tap();
    await phone.locator('[data-phone-app="finance"]').tap();
    assert.match(await phone.locator('.finance-wallet').innerText(),/БАЛАНС СЕМЬИ/);
    await page.screenshot({path:'artifacts/phone-platform-r1/bank-'+width+'.png'});
    await phone.locator('.career-phone-x').tap();
    await page.locator('#family-balance-chip').tap();
    assert.equal(await phone.getAttribute('aria-label'),'Смартфон: финансы семьи',
      'HUD wallet opens the same canonical bank directly');
    await phone.locator('.phone-platform-home').tap();
    await phone.locator('[data-phone-app="calls"]').tap();
    const first=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(first.version,1);
    assert.equal(first.phoneCalls.active,null);
    await phone.locator('.phone-call-start').tap();
    const active=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.ok(active.phoneCalls.active,'real call state saved with the v1 root');
    assert.equal(active.shop.credits,first.shop.credits,'remote call has no price');
    await page.waitForFunction(key=>{
      const s=JSON.parse(localStorage.getItem(key)||'{}');
      return s.phoneCalls?.receipts?.length===1;
    },SAVE_KEY,{timeout:18000});
    const completed=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(completed.phoneCalls.receipts.length,1);
    assert.equal(completed.phoneCalls.active,null);
    assert.equal(completed.shop.credits,first.shop.credits);
    assert.ok(completed.relationship.affinity>first.relationship.affinity);
    assert.equal(completed.position.x,first.position.x,'no teleport');
    assert.equal(completed.otherSim.position.x,first.otherSim.position.x,'no teleport');
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
    const restored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(restored.phoneCalls.receipts.length,1,'no duplicate benefit on reload');
    assert.deepEqual(errors,[],'no browser errors at '+width+'x'+height);
    await context.close();
  }
  console.log('PHONE-PLATFORM-R1 real dual-viewport WebGL and calls PASS; iPhone device QA deferred');
}finally{await browser.close();}
