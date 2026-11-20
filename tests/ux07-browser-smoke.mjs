/** UX07 genuine PlayCanvas/WebGL and touch on four Safari-size viewports. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
const DAY=1440;
const seed=newHousehold('2026-11-01');
seed.minutes=17*DAY+720;seed.otherSim.minutes=seed.minutes;
seed.paused=true;seed.otherSim.paused=true;
seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
seed.financialHistory={schema:1,nextId:3,entries:[
 {id:'fin-1',sourceId:'s1',kind:'salary',delta:220,actorId:'alex',
  atGameMinute:12*DAY+600,balanceAfter:5220},
 {id:'fin-2',sourceId:'s2',kind:'purchase',delta:-70,actorId:null,
  atGameMinute:16*DAY+600,balanceAfter:5150}]};
seed.shop.credits=5150;
seed.householdBills={schema:1,activatedDayIndex:0,lastIssuedCycle:2,
 lastPaidCycle:1,lastReminderCycle:2};
mkdirSync('ux07-artifacts',{recursive:true});
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
try{
 for(const [width,height] of [[390,844],[375,667],[320,568],[844,390]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,
   hasTouch:true,isMobile:true});
  await context.addInitScript(({record,key,tour})=>{
   localStorage.setItem(key,JSON.stringify(record));
   localStorage.setItem(tour,'done');
  },{record:seed,key:SAVE_KEY,tour:UI_TOUR_STORAGE_KEY});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('requestfailed',request=>{
   if(/\/src\/|\/vendor\//.test(request.url()))errors.push(request.url());
  });
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
  assert.ok(await page.locator('#game-canvas').evaluate(c=>
   Boolean(c.getContext('webgl2')||c.getContext('webgl'))));
  await page.locator('#family-balance-chip').tap();
  const phone=page.locator('#career-phone-panel');
  assert.ok(await phone.isVisible());
  const summary=phone.locator('.finance-ux07-summary');
  assert.match(await summary.innerText(),/2026-11-12.*2026-11-18/);
  assert.match(await summary.innerText(),/220/);
  assert.match(await summary.innerText(),/70/);
  const pos=await summary.boundingBox();
  const body=await phone.locator('.career-phone-body').boundingBox();
  assert.ok(pos&&body&&pos.y<body.y+body.height,
   'period summary visible before filters on '+width+'x'+height);
  assert.ok(await phone.locator('.finance-ux07-bill-status').isVisible());
  const pay=phone.locator('.finance-bills .finance-bill-pay');
  const rect=await pay.boundingBox();
  assert.ok(rect&&rect.height>=44&&rect.width>=44);
  await pay.tap();
  assert.match(await phone.locator('.finance-bills').innerText(),/Неоплаченных счетов нет/);
  assert.match(await page.locator('#family-balance-chip').innerText(),/4.*970/);
  await phone.getByRole('button',{name:'Аналитика',exact:true}).tap();
  assert.match(await phone.locator('.finance-ux07-analytics-summary').innerText(),/2026-11-12/);
  await phone.getByRole('button',{name:'Свой период',exact:true}).tap();
  for(const id of ['#finance-date-start','#finance-date-end']){
   const r=await phone.locator(id).boundingBox();
   assert.ok(r&&r.height>=44,'date input >=44px');
  }
  await phone.locator('#finance-date-start').fill('2026-11-13');
  await phone.locator('#finance-date-end').fill('2026-11-18');
  await phone.getByRole('button',{name:'Применить период'}).tap();
  assert.match(await phone.locator('.finance-period-range').innerText(),/2026-11-13.*2026-11-18/);
  assert.match(await phone.locator('.finance-kpis').innerText(),/250/);
  await phone.locator('#finance-date-start').fill('2026-11-18');
  await phone.locator('#finance-date-end').fill('2026-11-13');
  await phone.getByRole('button',{name:'Применить период'}).tap();
  assert.match(await phone.locator('.finance-error').innerText(),/Дата начала позже даты окончания/);
  await phone.getByRole('button',{name:'Операции',exact:true}).tap();
  assert.equal(await phone.locator('.finance-receipt').count(),3);
  await phone.locator('.career-phone-x').tap();
  const geo=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,
   vw:innerWidth,hud:document.querySelector('#dashboard').getBoundingClientRect().height}));
  assert.ok(geo.doc<=geo.vw+2,'no horizontal document overflow');
  assert.ok(geo.hud<180,'original game HUD retained');
  await page.screenshot({path:'ux07-artifacts/finance-'+width+'x'+height+'.png'});
  const saved=JSON.parse(await page.evaluate(k=>localStorage.getItem(k),SAVE_KEY));
  assert.equal(saved.version,1);
  assert.deepEqual(errors,[]);
  await context.close();
 }
}finally{await browser.close();}
