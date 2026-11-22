/** FANDOM-R1-C actual PlayCanvas/WebGL live TV + virtual calendar at two Safari-sized viewports.
 * Chromium is automated; owner's physical iPhone Safari acceptance is separate.
 */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold,tickHousehold} from '../src/household.js';
import {sportsFixtures} from '../src/sports-league.js';
import {calendarAt} from '../src/calendar-core.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
const seed=newHousehold('2026-11-22'),match=sportsFixtures(seed.sportsWorld)[0];
tickHousehold(seed,match.kickoff-seed.minutes+42);
seed.paused=true;seed.otherSim.paused=true;
seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
seed.action={id:'tv',phase:'using',elapsed:6,automatic:false,
  targetInstanceId:'home-tv-1'};
const matchDate=calendarAt(seed.calendar,match.kickoff).iso;
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
try{
 mkdirSync('artifacts/fandom-r1-c',{recursive:true});
 for(const [width,height] of [[390,844],[320,568]]){
  const context=await browser.newContext({viewport:{width,height},
    deviceScaleFactor:1,hasTouch:true,isMobile:true,serviceWorkers:'block'});
  await context.addInitScript(({key,record,tour})=>{
    localStorage.setItem(key,JSON.stringify(record));
    localStorage.setItem(tour,'done');
  },{key:SAVE_KEY,record:seed,tour:UI_TOUR_STORAGE_KEY});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('crash',()=>errors.push('WebGL crashed'));
  await page.goto('http://127.0.0.1:8765/?fandom-r1-c=qa',
    {waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:80000});
  assert.ok((await page.locator('#game-canvas').screenshot()).length>2500);
  await page.waitForFunction(id=>
    window.__LifeSimSportsScreenStats?.().some(x=>x.tvId==='home-tv-1'&&
      x.frameKey.startsWith(id+'@')),match.id,{timeout:20000});
  await page.screenshot({path:'artifacts/fandom-r1-c/tv-'+width+'.png'});
  await page.locator('#calendar-anchor-toggle').tap();
  await page.locator('#life-calendar').waitFor({state:'visible'});
  await page.locator('#lc-jump-date').fill(matchDate);
  await page.locator('#lc-jump-date').dispatchEvent('change');
  const content=await page.locator('#lc-agenda').innerText();
  assert.match(content,/Лига Блин’С/);
  assert.match(content,/⚽/);
  await page.screenshot({path:'artifacts/fandom-r1-c/calendar-'+width+'.png'});
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
  assert.equal(saved.version,1);
  assert.equal(saved.sportsWorld.results.length,0,'future results are not made by rendering');
  assert.deepEqual(errors,[],'no browser errors at '+width+'x'+height);
  await context.close();
 }
 console.log('FANDOM-R1-C genuine two-viewport WebGL TV texture/calendar PASS; physical Safari iPhone deferred');
}finally{await browser.close();}
