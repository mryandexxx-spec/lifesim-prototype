/** UX08 real PlayCanvas/WebGL and touch, 4 approved iPhone viewports. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
import {newHousehold} from '../src/household.js';
import {addCalendarEvent} from '../src/calendar-events.js';
import {careerVacancies,acceptCareerOffer} from '../src/career-job-board.js';
import {weekdayFromSerial,civilToSerial} from '../src/calendar-core.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
import {SAVE_KEY} from '../src/simulation.js';
const seed=newHousehold('2026-11-17');
seed.minutes=600;seed.otherSim.minutes=600;
seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
const choice=careerVacancies(seed,'alex')[0];
const offer=acceptCareerOffer(seed,'alex',choice.id);
assert.equal(offer.ok,true);
seed.careerSystem=offer.careerSystem;
const workDay=offer.shift.iso;
seed.calendar=addCalendarEvent(seed.calendar,{title:'Личное дело Миры',
 date:workDay,start:1100,end:1160,participants:['mira'],category:'personal',repeat:'none'});
seed.calendar=addCalendarEvent(seed.calendar,{title:'Повтор Миры',
 date:workDay,start:1200,end:1260,participants:['mira'],category:'personal',repeat:'weekly',
 weekdays:[weekdayFromSerial(civilToSerial(workDay))],count:5});
mkdirSync('ux08-artifacts',{recursive:true});
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
try {
 for(const [width,height] of [[390,844],[375,667],[320,568],[844,390]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,
   isMobile:true,hasTouch:true});
  await context.addInitScript(({key,record,tour})=>{
   localStorage.setItem(key,JSON.stringify(record));
   localStorage.setItem(tour,'done');
  },{key:SAVE_KEY,record:seed,tour:UI_TOUR_STORAGE_KEY});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('requestfailed',r=>{
   if(r.url().includes('/src/')||r.url().includes('/vendor/'))errors.push(r.url());
  });
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
  assert.ok(await page.locator('#game-canvas').evaluate(c=>
   Boolean(c.getContext('webgl2')||c.getContext('webgl'))));
  if(await page.locator('#pause-btn').getAttribute('aria-label')==='Пауза')
   await page.locator('#pause-btn').tap();
  await page.locator('#calendar-anchor-toggle').tap();
  const calendar=page.locator('#life-calendar');
  assert.equal(await calendar.locator('#lc-title').innerText(),'Сегодня');
  assert.equal(await calendar.locator('[data-lc-view="day"]').getAttribute('aria-pressed'),'true');
  assert.match(await calendar.locator('#lc-selected').innerText(),/17 ноября 2026/);
  for(const tab of ['Месяц','Неделя','День']){
   await calendar.getByRole('button',{name:tab,exact:true}).tap();
   assert.equal(await calendar.locator('[data-lc-view]').filter({hasText:tab}).getAttribute('aria-pressed'),'true');
  }
  await calendar.locator('#lc-jump-date').fill(workDay);
  await calendar.locator('#lc-jump-date').press('Tab');
  assert.match(await calendar.locator('#lc-selected').innerText(),/2026/);
  assert.match(await calendar.locator('#lc-legend').innerText(),/Событие · 2/);
  assert.match(await calendar.locator('#lc-legend').innerText(),/Смена · [1-9]/);
  assert.ok(await calendar.locator('#lc-agenda').getByText('Личное дело Миры').isVisible());
  assert.match(await calendar.locator('#lc-agenda').innerText(),/Алекс/);
  if(width===390){
   await calendar.locator('#lc-agenda .lc-entry').filter({hasText:'Повтор Миры'}).tap();
   await calendar.locator('select[name="scope"]').selectOption('one');
   await calendar.locator('input[name="title"]').fill('Повтор Миры — только сегодня');
   const done=calendar.locator('#lc-event-done'),rect=await done.boundingBox();
   assert.ok(rect&&rect.width>=44&&rect.height>=44,'keyboard-friendly sticky Done');
   await done.tap();
   assert.ok(await calendar.locator('#lc-agenda').getByText('Повтор Миры — только сегодня').isVisible());
   const saved=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY));
   assert.equal(saved.version,1);
   assert.ok(saved.calendar.events.some(e=>e.title==='Повтор Миры'));
   assert.equal(saved.calendar.occurrenceOverrides.length,1);
  }
  await calendar.locator('#lc-today').tap();
  assert.match(await calendar.locator('#lc-selected').innerText(),/17 ноября 2026/);
  await calendar.locator('#lc-add').tap();
  const form=calendar.locator('#lc-event-form');
  assert.ok(await form.isVisible());
  await form.locator('input[name="title"]').fill('Новая заметка');
  await form.locator('input[name="date"]').fill('2026-11-17');
  await form.locator('#lc-event-back-top').tap();
  assert.match(await calendar.locator('#lc-selected').innerText(),/17 ноября 2026/);
  assert.equal(await calendar.locator('#lc-jump-date').inputValue(),'2026-11-17');
  await calendar.locator('#lc-add').tap();
  await form.locator('input[name="title"]').fill('Новая заметка');
  await form.locator('#lc-event-done').tap();
  assert.ok(await calendar.locator('#lc-agenda').getByText('Новая заметка').isVisible());
  await page.screenshot({path:'ux08-artifacts/calendar-'+width+'x'+height+'.png'});
  await calendar.locator('#lc-close').tap();
  assert.equal(await page.locator('#calendar-anchor-toggle').getAttribute('aria-expanded'),'false');
  await page.locator('#view-toggle').tap();
  const menu=page.locator('#view-panel');
  for(const name of ['Вид и управление','Игра и сохранение','Помощь','Начать заново'])
   assert.ok((await menu.innerText()).includes(name));
  await menu.locator('#reset-btn').scrollIntoViewIfNeeded();
  const before=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY));
  page.once('dialog',dialog=>dialog.dismiss());
  await menu.locator('#reset-btn').tap();
  const after=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY));
  assert.equal(after.version,1);
  assert.deepEqual(after.calendar,before.calendar,'cancel reset must keep calendar');
  assert.equal(after.shop.credits,before.shop.credits);
  assert.ok(await menu.isVisible(),'cancelled reset stays in menu');
  await menu.locator('#tour-replay').scrollIntoViewIfNeeded();
  await menu.locator('#tour-replay').tap();
  assert.ok(await page.locator('#tour-panel').isVisible());
  await page.locator('#tour-close').tap();
  await page.locator('#view-toggle').tap();
  await page.locator('#viewport-health-open').tap();
  assert.ok(await page.locator('#viewport-recovery').isVisible());
  await page.locator('#viewport-health-close').tap();
  const dims=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
  assert.ok(dims.scroll<=dims.width+2,'no horizontal page overflow');
  assert.deepEqual(errors,[]);
  await context.close();
 }
}finally{await browser.close();}
