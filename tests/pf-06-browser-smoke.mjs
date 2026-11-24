import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
try{
 for(const [width,height] of [[390,844],[320,568]]){
  const seed=newHousehold();seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,hasTouch:true,isMobile:true});
  await context.addInitScript(({key,record,tour})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));localStorage.setItem(tour,'done');},{key:SAVE_KEY,record:seed,tour:UI_TOUR_STORAGE_KEY});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
  await page.locator('#pick-mira').click();
  await page.locator('#pick-alex').click();
  const phone=page.locator('#career-phone-panel');
  await page.locator('#career-phone-toggle').tap();
  await phone.locator('[data-phone-app="notifications"]').tap();
  assert.match(await phone.innerText(),/Выбран житель: Мира/);
  assert.match(await phone.innerText(),/Выбран житель: Алекс/);
  await phone.getByRole('button',{name:'Прочитать все'}).tap();
  assert.match(await phone.innerText(),/0 новых/);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
  await page.locator('#career-phone-toggle').tap();
  await phone.locator('[data-phone-app="notifications"]').tap();
  assert.match(await phone.innerText(),/Выбран житель: Мира/);
  assert.equal(await phone.locator('.pf-notice-card').evaluateAll(els=>els.filter(el=>el.textContent.includes('Выбран житель:')).every(el=>!el.classList.contains('pf-notice-unread'))),true);
  assert.deepEqual(errors,[]);
  await context.close();
 }
}finally{await browser.close();}
console.log('PF-06 real mobile phone history, read and reload PASS');
