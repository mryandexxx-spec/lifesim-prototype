/** W4-B PlayCanvas/WebGL + true touch: family wallet, work+finance, game period analytics.
 * Four iPhone viewports; owner Safari physical testing remains separate.
 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const D=1440;
const seed=newHousehold('2026-11-01');
seed.minutes=D*17+720;seed.otherSim.minutes=seed.minutes;
const changes=[['salary',300,10,'alex'],['purchase',-150,12,null],
  ['art-sale',200,14,'mira'],['sale',91,15,null],
  ['undo',-41,16,null],['redo',41,17,null]];
let credits=5000;
seed.financialHistory={schema:1,nextId:7,entries:changes.map(([kind,delta,day,actorId],i)=>{
  credits+=delta;
  return {id:'fin-'+(i+1),sourceId:'real-'+(i+1),kind,delta,actorId,
    atGameMinute:D*day+600,balanceAfter:credits};
})};
seed.shop.credits=credits;
seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const failures=[];
async function visit(w,h,save=seed){
  const context=await browser.newContext({viewport:{width:w,height:h},
    deviceScaleFactor:1,hasTouch:true,isMobile:true});
  await context.addInitScript(({key,record,tourKey})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
    localStorage.setItem(tourKey,'done');
  },{key:SAVE_KEY,record:save,tourKey:UI_TOUR_STORAGE_KEY});
  const page=await context.newPage();
  page.on('pageerror',e=>failures.push(w+'x'+h+' '+e.message));
  page.on('requestfailed',r=>{
    if(r.url().includes('/src/')||r.url().includes('/vendor/'))
      failures.push(w+'x'+h+' REQUEST '+r.url()+': '+r.failure()?.errorText);
  });
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:60000});
  const bytes=await page.locator('#game-canvas').screenshot();
  assert.ok(bytes.length>2000,'genuine PlayCanvas WebGL canvas '+w+'x'+h);
  return {context,page};
}
async function testPhone(page,w,h){
  const chip=page.locator('#family-balance-chip');
  assert.match(await chip.innerText(),/5.*441/,'current canonical family balance');
  assert.equal(await chip.getAttribute('aria-expanded'),'false');
  const chipRect=await chip.boundingBox();
  assert.ok(chipRect&&chipRect.height>=43&&chipRect.width>=43,'thumb-sized family funds');
  for(const id of ['#pick-alex','#pick-mira']){
    const r=await page.locator(id).boundingBox();
    assert.ok(r&&r.width>=43&&r.height>=43,'person switch preserved');
  }
  await chip.tap();
  const phone=page.locator('#career-phone-panel');
  assert.ok(await phone.isVisible());
  assert.match(await phone.getAttribute('aria-label'),/финансы семьи/);
  assert.equal(await phone.getByText(/Деньги семьи/).count(),1);
  assert.ok(await phone.getByText(/Общие деньги Алекса и Миры/).isVisible());
  await phone.getByRole('button',{name:'Операции',exact:true}).tap();
  assert.equal(await phone.locator('.finance-receipt').count(),6);
  await phone.getByRole('button',{name:'Расходы',exact:true}).tap();
  assert.equal(await phone.locator('.finance-receipt').count(),2);
  await phone.getByRole('button',{name:'Доходы',exact:true}).tap();
  assert.equal(await phone.locator('.finance-receipt').count(),4);
  await phone.getByRole('button',{name:'Все',exact:true}).tap();
  await phone.getByRole('button',{name:'Аналитика',exact:true}).tap();
  assert.match(await phone.locator('.finance-period-range').innerText(),/2026-11-12.*2026-11-18/);
  assert.equal(await phone.locator('.finance-chart').count(),3);
  assert.ok(await phone.getByText('Оценка периода').isVisible());
  assert.match(await phone.locator('.finance-kpis').innerText(),/332/);
  assert.match(await phone.locator('.finance-kpis').innerText(),/191/);
  // Real touch opens an individual SVG bar's recorded period summary.
  const bars=phone.locator('.finance-chart svg g[role="button"]');
  if(await bars.count()>0)await bars.first().tap();
  await phone.getByRole('button',{name:'Свой период',exact:true}).tap();
  await phone.locator('#finance-date-start').fill('2026-11-13');
  await phone.locator('#finance-date-end').fill('2026-11-15');
  await phone.getByRole('button',{name:'Применить период'}).tap();
  assert.match(await phone.locator('.finance-period-range').innerText(),/2026-11-13.*2026-11-15/);
  assert.match(await phone.locator('.finance-kpis').innerText(),/200/);
  assert.match(await phone.locator('.finance-kpis').innerText(),/150/);
  await page.screenshot({path:'w4b-finance-'+w+'x'+h+'.png',fullPage:false});
  // Career app MUST retain historical jobs and options.
  await phone.locator('.career-phone-apps').getByRole('button',{name:'Работа'}).tap();
  assert.equal(await phone.getAttribute('aria-label'),'Смартфон: работа Блин’С');
  assert.equal(await phone.locator('.career-phone-tabs .career-phone-tab').count(),3);
  assert.equal(await phone.getByRole('button',{name:/^Вакансия /}).count(),6);
  await phone.locator('.career-phone-x').tap();
  assert.equal(await chip.getAttribute('aria-expanded'),'false');
  const noOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2);
  assert.ok(noOverflow,'no document-wide horizontal scrolling '+w+'x'+h);
  const physical=await page.evaluate(()=>({
    available:document.querySelector('#game-canvas').getBoundingClientRect().height,
    hud:document.querySelector('#dashboard').getBoundingClientRect().height,
    bottom:document.querySelector('.life-nav').getBoundingClientRect().height
  }));
  assert.ok(physical.available>0&&physical.hud<180,'C2 HUD stays compact '+w+'x'+h);
}
try{
  for(const [w,h] of [[390,844],[375,667],[320,568],[844,390]]){
    const {context,page}=await visit(w,h);
    await testPhone(page,w,h);
    if(w===390){
      await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('#loading').waitFor({state:'hidden',timeout:60000});
      assert.match(await page.locator('#family-balance-chip').innerText(),/5.*441/);
      await page.locator('#career-phone-toggle').tap();
      assert.equal(await page.locator('#career-phone-panel').getAttribute('aria-label'),
        'Смартфон: работа Блин’С');
      await page.locator('#career-phone-panel .career-phone-x').tap();
      // Legacy household has money but no fabricated journal.
      const old=structuredClone(seed);old.shop.credits=2719;
      delete old.financialHistory;
      const legacy=await visit(390,844,old);
      assert.match(await legacy.page.locator('#family-balance-chip').innerText(),/2.*719/);
      await legacy.page.locator('#family-balance-chip').tap();
      await legacy.page.locator('#career-phone-panel').getByRole('button',
        {name:'Операции',exact:true}).tap();
      assert.ok(await legacy.page.getByText(/Пока нет записанных операций/).isVisible());
      await legacy.context.close();
    }
    await context.close();
  }
  assert.deepEqual(failures,[],'no missing modules or startup errors');
  console.log('W4-B PlayCanvas finance views + touch + period range PASS');
}finally{await browser.close();}
