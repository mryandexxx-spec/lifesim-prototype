/** W4-C: real PlayCanvas/WebGL and touch billing on four compact iPhone sizes. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
const D=1440;
const seed=newHousehold('2026-11-01');
seed.minutes=25*D+720;seed.otherSim.minutes=seed.minutes;
seed.shop.credits=1000;
seed.householdBills={schema:1,activatedDayIndex:0,lastIssuedCycle:3,
  lastPaidCycle:2,lastReminderCycle:3};
seed.paused=true;seed.otherSim.paused=true;
seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const failures=[];
async function visit(w,h,record=seed){
  const context=await browser.newContext({viewport:{width:w,height:h},
    deviceScaleFactor:1,hasTouch:true,isMobile:true});
  await context.addInitScript(({key,record,tourKey})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
    localStorage.setItem(tourKey,'done');
  },{key:SAVE_KEY,record,tourKey:UI_TOUR_STORAGE_KEY});
  const page=await context.newPage();
  page.on('pageerror',e=>failures.push(w+'x'+h+' PAGE '+e.message));
  page.on('requestfailed',r=>{
    if(/\/src\/|\/vendor\//.test(r.url()))
      failures.push(w+'x'+h+' REQUEST '+r.url()+' '+r.failure()?.errorText);
  });
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:60000});
  assert.ok((await page.locator('#game-canvas').screenshot()).length>2000);
  return {context,page};
}
try {
  for(const [w,h] of [[390,844],[375,667],[320,568],[844,390]]){
    const {context,page}=await visit(w,h);
    assert.match(await page.locator('#family-balance-chip').innerText(),/1.*000/);
    await page.locator('#family-balance-chip').tap();
    const phone=page.locator('#career-phone-panel');
    const bills=phone.locator('.finance-bills');
    assert.ok(await bills.isVisible(),'bill card in existing Finance Overview');
    assert.match(await bills.innerText(),/Неоплачено: 1/);
    assert.match(await bills.innerText(),/Просрочено: 1/);
    const pay=bills.getByRole('button',{name:'Оплатить 180 кр.'});
    assert.ok(await pay.isEnabled());
    const paymentRect=await pay.boundingBox();
    assert.ok(paymentRect&&paymentRect.height>=44,'touch payment >=44px');
    await pay.tap();
    assert.match(await bills.innerText(),/Неоплаченных счетов нет/);
    assert.match(await page.locator('#family-balance-chip').innerText(),/820/);
    await phone.getByRole('button',{name:'Операции',exact:true}).tap();
    const receipts=phone.locator('.finance-receipt');
    assert.equal(await receipts.count(),1);
    assert.match(await receipts.first().innerText(),/Оплата семейного счёта/);
    assert.match(await receipts.first().innerText(),/180/);
    await phone.getByRole('button',{name:'Аналитика',exact:true}).tap();
    assert.match(await phone.locator('.finance-kpis').innerText(),/180/);
    assert.equal(await phone.locator('.finance-chart').count(),3);
    await phone.locator('.career-phone-apps').getByRole('button',{name:'Работа'}).tap();
    assert.equal(await phone.locator('.career-phone-tabs .career-phone-tab').count(),3);
    await phone.locator('.career-phone-x').tap();
    const geometry=await page.evaluate(()=>({
      doc:document.documentElement.scrollWidth,
      width:window.innerWidth,
      hud:document.querySelector('#dashboard').getBoundingClientRect().height}));
    assert.ok(geometry.doc<=geometry.width+2,'no horizontal viewport overflow');
    assert.ok(geometry.hud<180,'compact C2 HUD still intact');
    await page.screenshot({path:'w4c-bills-'+w+'x'+h+'.png',fullPage:false});
    if(w===390){
      await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('#loading').waitFor({state:'hidden',timeout:60000});
      assert.match(await page.locator('#family-balance-chip').innerText(),/820/);
      await page.locator('#family-balance-chip').tap();
      assert.match(await page.locator('.finance-bills').innerText(),/Неоплаченных счетов нет/);
      assert.equal(await page.locator('.finance-receipt').count(),1);
      await page.locator('#career-phone-panel .career-phone-x').tap();
      // A save created before W4-C must never receive retrospective invoices.
      const old=structuredClone(seed);
      delete old.householdBills;
      const legacy=await visit(390,844,old);
      await legacy.page.locator('#family-balance-chip').tap();
      const text=await legacy.page.locator('.finance-bills').innerText();
      assert.match(text,/Неоплаченных счетов нет/);
      assert.match(text,/2026-12-03/,'first issue 7 game days after legacy load');
      await legacy.context.close();
    }
    await context.close();
  }
  assert.deepEqual(failures,[]);
  console.log('W4-C real mobile PlayCanvas, payment, reload, old save PASS');
}finally{await browser.close();}
