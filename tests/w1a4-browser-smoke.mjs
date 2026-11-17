/** W1-A.4: 390x844 PlayCanvas/WebGL real household clock + calendar integration smoke. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {addCalendarEvent} from '../src/calendar-events.js';
import {civilToSerial} from '../src/calendar-core.js';
import {SAVE_KEY} from '../src/simulation.js';

const seed=newHousehold('2024-02-28');
seed.paused=false;seed.speed=1;seed.minutes=1400;
seed.otherSim.minutes=seed.minutes;
seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
seed.calendar=addCalendarEvent(seed.calendar,{title:'Полночный праздник',date:'2024-02-29',
  start:0,end:60,participants:['alex','mira'],repeat:'none',reminder:0});
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const errors=[];
try {
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,
  hasTouch:true,isMobile:true});
 await context.addInitScript(({key,record})=>{
  if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
  // Apply scenario overrides only AFTER the outgoing pagehide handler has saved.
  const future=Number(sessionStorage.getItem('w1a4.next-minute'));
  if(Number.isFinite(future)&&future>0){
    const state=JSON.parse(localStorage.getItem(key));
    state.minutes=future;state.otherSim.minutes=future;state.paused=true;
    localStorage.setItem(key,JSON.stringify(state));
    sessionStorage.removeItem('w1a4.next-minute');
  }
  localStorage.setItem('lifesim.uiTour.v1','done');
 },{key:SAVE_KEY,record:seed});
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push('PAGE '+e.stack));
 page.on('crash',()=>errors.push('CRASH'));
 page.on('requestfailed',r=>{
  if(r.url().includes('/src/')||r.url().includes('/vendor/'))
   errors.push('REQUEST '+r.url()+' '+r.failure()?.errorText);
 });
 const start=async()=>{await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
   await page.locator('#loading').waitFor({state:'hidden',timeout:30000});};
 await start();
 // Legacy v1 loader intentionally restores at speed ×1 and unpaused. Freeze explicitly
 // before testing W1-A.4, rather than assuming pause/speed persisted in a save.
 await page.locator('#pause-btn').click();
 assert.match(await page.locator('#day-label').innerText(),/28 фев/);
 assert.equal(await page.locator('#light-phase-label').innerText(),'Ночь');
 const pausedTime=await page.locator('#time-label').innerText();
 await page.waitForTimeout(750);
 assert.equal(await page.locator('#time-label').innerText(),pausedTime,'Pause freezes game clock and lighting');
 const winterNight=await page.locator('#game-canvas').screenshot();
 await page.locator('#speed-btn').click();
 assert.equal(await page.locator('#speed-btn').innerText(),'3×');
 await page.locator('#pause-btn').click();
 await page.waitForFunction(()=>document.querySelector('#day-label')?.textContent?.includes('29 фев'),null,{timeout:18000});
 await page.waitForFunction(key=>{
  const c=JSON.parse(localStorage.getItem(key)||'null')?.calendar;
  return c?.reminderReceipts?.length===1;
 },SAVE_KEY,{timeout:8000});
 await page.locator('#pause-btn').click();
 const savedMidnight=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
 assert.equal(savedMidnight.calendar.reminderReceipts.length,1);
 assert.equal(savedMidnight.calendar.events[0].title,'Полночный праздник');
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#loading').waitFor({state:'hidden',timeout:30000});
 assert.match(await page.locator('#day-label').innerText(),/29 фев/);
 assert.equal(await page.locator('#light-phase-label').innerText(),'Ночь');
 await page.locator('#calendar-anchor-toggle').click();
 assert.ok(await page.locator('#lc-agenda').getByText('Полночный праздник').isVisible());
 assert.equal(await page.locator('#life-calendar .lc-entry').count()>0,true);
 await page.locator('#lc-close').click();
 // Summer snapshot from a TEST seed only: both day/night still use stored root.minutes.
 const summerDay=(civilToSerial('2024-06-21')-civilToSerial('2024-02-28'))*1440+780;
 await page.evaluate(minutes=>{
  sessionStorage.setItem('w1a4.next-minute',String(minutes));
 },summerDay);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#loading').waitFor({state:'hidden',timeout:30000});
 assert.match(await page.locator('#day-label').innerText(),/21 июн/);
 assert.equal(await page.locator('#light-phase-label').innerText(),'День');
 const summerCanvas=await page.locator('#game-canvas').screenshot();
 assert.notDeepEqual(summerCanvas,winterNight,'Seasonal sun changes the actual canvas');
 await page.screenshot({path:'w1a4-calendar-summer-day.png'});
 // Legacy save resets to unpaused ×1; choose x3 again for visible movement.
 await page.locator('#speed-btn').click();
 assert.equal(await page.locator('#speed-btn').innerText(),'3×');
 await page.locator('#build-toggle').click();
 assert.ok(await page.locator('#build-editor').isVisible());
 await page.waitForTimeout(350); // Let the last pre-build HUD time sample settle.
 const buildClock=await page.locator('#time-label').innerText();
 await page.waitForTimeout(1200);
 assert.equal(await page.locator('#time-label').innerText(),buildClock,
  'Build mode never advances the shared calendar');
 await page.locator('#build-exit').click();
 const beforeLive=await page.locator('#time-label').innerText();
 await page.waitForFunction(before=>document.querySelector('#time-label')?.textContent!==before,
  beforeLive,{timeout:7000});
 await page.locator('#furnish-toggle').click();
 assert.ok(await page.locator('#furniture-editor').isVisible());
 await page.waitForTimeout(350); // The HUD may be one frame behind the tick.
 const furnishClock=await page.locator('#time-label').innerText();
 await page.waitForTimeout(1100);
 assert.equal(await page.locator('#time-label').innerText(),furnishClock,
  'Furnish mode freezes the single calendar as in previous versions');
 await page.locator('#furnish-exit').click();
 // Hidden Safari tab must not process simulation minutes or reminders.
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});});
 await page.waitForTimeout(350); // Flush pending HUD refresh before measuring freeze.
 const hiddenClock=await page.locator('#time-label').innerText();
 await page.waitForTimeout(1100);
 assert.equal(await page.locator('#time-label').innerText(),hiddenClock,'Hidden tab never ticks');
 await page.evaluate(()=>{delete document.hidden;});
 await page.locator('#pause-btn').click();
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('W1-A.4 Chromium 390x844: leap midnight, once reminder, reload, seasonal light, x3 and editor/hidden freeze passed');
} finally {await browser.close();}
