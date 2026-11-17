/** W1-A.3 real PlayCanvas/WebGL mobile calendar regression (390×844). */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
const state=newHousehold('2026-11-17');
state.autonomy.enabled=false;state.otherSim.autonomy.enabled=false;state.paused=true;
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
try {
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});
 await context.addInitScript(({key,seed})=>{
  if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));
  localStorage.setItem('lifesim.uiTour.v1','done');
 },{key:SAVE_KEY,seed:state});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push('PAGE '+e.stack));
 page.on('crash',()=>errors.push('CRASH'));
 page.on('requestfailed',r=>{if(r.url().includes('/src/')||r.url().includes('/vendor/'))errors.push('REQUEST '+r.url()+' '+r.failure()?.errorText)});
 await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
 await page.locator('#loading').waitFor({state:'hidden',timeout:30000});
 await page.locator('#calendar-anchor-toggle').click();
 assert.ok(await page.locator('#life-calendar').isVisible());
 assert.ok(await page.locator('#lc-days .lc-date').count()>=28);
 await page.locator('[data-lc-view="week"]').click();
 assert.equal(await page.locator('#lc-days .lc-date').count(),7);
 await page.locator('[data-lc-view="day"]').click();
 assert.ok(await page.locator('#lc-days').isVisible());
 await page.locator('[data-lc-view="month"]').click();
 await page.locator('#lc-add').click();
 await page.locator('#lc-event-form [name="title"]').fill('Встреча Алекса');
 await page.locator('#lc-event-form [name="participants"]').selectOption('alex');
 await page.locator('#lc-event-form [name="repeat"]').selectOption('weekly');
 await page.locator('#lc-event-form [name="reminder"]').selectOption('15');
 await page.locator('#lc-event-form button[type=submit]').click();
 assert.ok(await page.locator('#lc-agenda').getByText('Встреча Алекса').isVisible());
 const eventSave=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
 assert.equal(eventSave.calendar.events.length,1);
 assert.deepEqual(eventSave.calendar.events[0].participants,['alex']);
 assert.equal(eventSave.calendar.events[0].repeat,'weekly');
 assert.equal(eventSave.calendar.events[0].reminder,15);
 await page.locator('#lc-agenda .lc-entry').last().click();
 await page.locator('#lc-event-form [name="scope"]').selectOption('one');
 await page.locator('#lc-event-form [name="title"]').fill('Один особенный вторник');
 await page.locator('#lc-event-form button[type=submit]').click();
 assert.ok(await page.locator('#lc-agenda').getByText('Один особенный вторник').isVisible());
 const overridden=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
 assert.equal(overridden.calendar.occurrenceOverrides.length,1);
 await page.locator('#lc-add-holiday').click();
 await page.locator('#lc-holiday-form [name="title"]').fill('Семейный выходной');
 await page.locator('#lc-holiday-form [name="dayOffWork"]').check();
 await page.locator('#lc-holiday-form button[type=submit]').click();
 assert.ok(await page.locator('#lc-agenda').getByText('Семейный выходной').isVisible());
 await page.screenshot({path:'w1a3-mobile-calendar.png'});
 // W1-A.4: editing a FUTURE occurrence as a SERIES must keep the original anchor.
 await page.locator('[data-lc-view="week"]').click();
 await page.locator('#lc-next').click(); // Nov 24, one week after first occurrence.
 assert.ok(await page.locator('#lc-agenda').getByText('Встреча Алекса').isVisible());
 await page.locator('#lc-agenda').getByText('Встреча Алекса').click();
 assert.equal(await page.locator('#lc-event-form [name="date"]').inputValue(),'2026-11-17');
 await page.locator('#lc-event-form [name="title"]').fill('Еженедельная встреча');
 await page.locator('#lc-event-form button[type=submit]').click();
 const seriesSaved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
 assert.equal(seriesSaved.calendar.events[0].date,'2026-11-17',
   'Editing a future occurrence must not move the series anchor');
 assert.ok(await page.locator('#lc-agenda').getByText('Еженедельная встреча').isVisible());
 // Single occurrence can have its own participants while the next week keeps Alex.
 await page.locator('#lc-agenda').getByText('Еженедельная встреча').click();
 await page.locator('#lc-event-form [name="scope"]').selectOption('one');
 assert.equal(await page.locator('#lc-event-form [name="date"]').inputValue(),'2026-11-24');
 await page.locator('#lc-event-form [name="participants"]').selectOption('mira');
 await page.locator('#lc-event-form [name="title"]').fill('Только для Миры');
 await page.locator('#lc-event-form button[type=submit]').click();
 assert.ok(await page.locator('#lc-agenda').getByText('Только для Миры').isVisible());
 const oneSaved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
 assert.equal(oneSaved.calendar.events[0].date,'2026-11-17');
 assert.deepEqual(oneSaved.calendar.events[0].participants,['alex']);
 assert.deepEqual(oneSaved.calendar.occurrenceOverrides.find(x=>x.date==='2026-11-24').participants,['mira']);

 const before=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
 assert.equal(before.version,1);
 assert.equal(before.otherSim.minutes,before.minutes);
 assert.equal(before.calendar.holidays.length,1);
 assert.equal(before.calendar.holidays[0].dayOffWork,true);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#loading').waitFor({state:'hidden',timeout:30000});
 await page.locator('#calendar-anchor-toggle').click();
 assert.ok(await page.locator('#lc-agenda').getByText('Один особенный вторник').isVisible());
 assert.ok(await page.locator('#lc-agenda').getByText('Семейный выходной').isVisible());
 assert.ok(await page.locator('#game-canvas').isVisible());
 await page.locator('#lc-close').click();
 assert.ok(await page.locator('#life-calendar').isHidden());
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('W1-A.3 WebGL mobile calendar CRUD/week/day/reload succeeded');
}finally{await browser.close();}
