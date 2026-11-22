/** R2-C mobile WebGL: real consent-based match invite through the fifth app.
 * Real native Safari acceptance remains separately deferred.
 */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {sportsFixtures} from '../src/sports-league.js';
import {sportsPhoneView} from '../src/sports-phone-model.js';
import {planSharedTv} from '../src/tv-together.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
const prepare=()=>{
 const root=newHousehold('2026-11-22'),match=sportsFixtures(root.sportsWorld)[0];
 root.minutes=match.kickoff+20;root.otherSim.minutes=root.minutes;
 root.autonomy.enabled=false;root.otherSim.autonomy.enabled=false;
 for(const actor of [root,root.otherSim]){
   actor.needs.hunger=90;actor.needs.energy=90;
   actor.needs.bladder=90;actor.needs.hygiene=90;
 }
 const watch=sportsPhoneView(root,'alex')?.watch;
 assert.equal(watch?.matchId,match.id,'genuine existing live fixture');
 const plan=planSharedTv(root,'alex',watch.tvId);
 assert.ok(plan,'real separate pathfindable viewing spots');
 assert.ok(Math.hypot(plan.places.alex.x-plan.places.mira.x,
   plan.places.alex.z-plan.places.mira.z)>=.82,'two non-overlapping positions');
 return {root,match,plan};
};
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
try{
 mkdirSync('artifacts/fandom-r2-c',{recursive:true});
 for(const [width,height] of [[390,844],[320,568]]){
  const {root,match}=prepare();
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,
    isMobile:true,hasTouch:true,serviceWorkers:'block'});
  await context.addInitScript(({key,record,tour})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
    localStorage.setItem(tour,'done');
  },{key:SAVE_KEY,record:root,tour:UI_TOUR_STORAGE_KEY});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('crash',()=>errors.push('WebGL crashed'));
  await page.goto('http://127.0.0.1:8765/?fandom-r2-c=qa',{waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:80000});
  assert.ok((await page.locator('#game-canvas').screenshot()).length>2500);
  await page.locator('#career-phone-toggle').tap();
  const panel=page.locator('#career-phone-panel');
  await panel.waitFor({state:'visible'});
  await panel.locator('[data-phone-app="sports"]').tap();
  const invite=panel.locator('.sports-watch-together');
  assert.equal(await invite.isEnabled(),true,'live game plus real owned TV');
  assert.match(await invite.innerText(),/Пригласить/);
  await invite.tap();
  await panel.waitFor({state:'hidden'});
  const saved=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY));
  const queued=saved.actionQueues?.byResident?.alex?.find(x=>
    x.type==='shared'&&x.mode==='leisure'&&x.choiceId==='tv');
  assert.equal(queued?.sportsMatchId,match.id,'typed match-linked persisted social FIFO');
  assert.equal(queued?.targetInstanceId,'home-tv-1');
  assert.equal(saved.sportsSharedWatch?.memories?.length,0,
    'queueing invitation is never enough to mint a match memory');
  assert.equal(saved.shop.credits,root.shop.credits);
  assert.equal(saved.version,1);
  assert.deepEqual(errors,[],width+'x'+height);
  await page.screenshot({path:'artifacts/fandom-r2-c/mobile-'+width+'.png'});
  await context.close();
 }
 console.log('FANDOM-R2-C genuine phone shared match invite and physical paired A-star at 390x844/320x568 PASS');
}finally{await browser.close();}
