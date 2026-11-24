/** FANDOM-R1-D: genuine phone/WebGL owner-size smoke for fifth sports app.
 * Source of truth: canonical saved root v1. Physical Safari remains owner-deferred.
 */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold,tickHousehold} from '../src/household.js';
import {sportsFixtures} from '../src/sports-league.js';
import {selectSportsClub} from '../src/sports-fandom.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
function seed(type){
 const root=newHousehold('2026-11-22'),m=sportsFixtures(root.sportsWorld)[0];
 root.autonomy.enabled=false;root.otherSim.autonomy.enabled=false;
 root.speed=1;root.otherSim.speed=1;
 if(type==='finished')selectSportsClub(root,'alex',m.home);
 tickHousehold(root,(type==='finished'?m.end+1:m.kickoff+35)-root.minutes);
 return {root,m};
}
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
try{
 mkdirSync('artifacts/fandom-r1-d',{recursive:true});
 for(const [width,height,type] of [[390,844,'live'],[320,568,'finished']]){
  const {root, m}=seed(type);
  const context=await browser.newContext({viewport:{width,height},
    deviceScaleFactor:1,hasTouch:true,isMobile:true,serviceWorkers:'block'});
  await context.addInitScript(({key,record,tour})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
    localStorage.setItem(tour,'done');
  },{key:SAVE_KEY,record:root,tour:UI_TOUR_STORAGE_KEY});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('crash',()=>errors.push('WebGL crashed'));
  await page.goto('http://127.0.0.1:8765/?fandom-r1-d',
    {waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:80000});
  assert.ok((await page.locator('#game-canvas').screenshot()).length>2400,
    'genuine PlayCanvas scene must render');
  await page.locator('#career-phone-toggle').tap();
  const phone=page.locator('#career-phone-panel');
  await phone.waitFor({state:'visible'});
  assert.equal(await phone.locator('.phone-platform-tile').count(),6);
  const ids=await phone.locator('.phone-platform-tile').evaluateAll(nodes=>nodes.map(x=>x.dataset.phoneApp));
  assert.deepEqual(ids,['work','food','finance','calls','sports','notifications']);
  await page.screenshot({path:'artifacts/fandom-r1-d/home-'+width+'.png'});
  await phone.locator('[data-phone-app="sports"]').tap();
  assert.equal(await phone.getAttribute('aria-label'),'Смартфон: Блин’С Спорт');
  assert.match(await phone.innerText(),/Блин’С Спорт/);
  assert.equal(await phone.locator('.sports-phone-team').count(),6);
  if(type==='live'){
    await phone.locator('[data-sports-team="moon-foxes"]').tap();
    const fresh=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(fresh.sportsFan.favoriteTeamId,'moon-foxes');
    assert.equal(fresh.otherSim.sportsFan.favoriteTeamId,null);
    assert.equal(fresh.version,1);
    assert.ok(await phone.locator('.sports-watch-match').isEnabled());
    const prior=JSON.parse(JSON.stringify(fresh));
    await phone.locator('.sports-watch-match').tap();
    const watched=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.ok(watched.actionQueues.byResident.alex.some(q=>q.type==='object'&&q.actionId==='tv')||
      watched.action?.id==='tv','existing TV action must be enqueued instead of remote fake viewing');
    assert.ok(watched.needs.fun-prior.needs.fun<5,'no immediate double Fun award');
    assert.equal(watched.sportsWorld.results.length,0,'future goals not completed by UI tap');
  }else{
    assert.equal(await phone.locator('.sports-news-read').count(),1);
    await phone.locator('.sports-news-read').tap();
    const read=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.ok(read.sportsFan.lastReactedMatchIds.includes(m.id));
    assert.ok(read.mind.memories.some(x=>x.id.startsWith('sports.')));
    assert.equal(read.otherSim.sportsFan.favoriteTeamId,null);
    await phone.locator('[data-sports-tab="matches"]').tap();
    assert.match(await phone.locator('.career-phone-body').innerText(),/Результаты/);
    await phone.locator('[data-sports-tab="table"]').tap();
    assert.equal(await phone.locator('.sports-phone-table-row').count(),6);
    await page.screenshot({path:'artifacts/fandom-r1-d/sports-'+width+'.png'});
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:80000});
    const restored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.ok(restored.sportsFan.lastReactedMatchIds.includes(m.id),
      'sports emotion receipt must persist and not replay');
  }
  assert.deepEqual(errors,[],'no JavaScript errors at '+width+'x'+height);
  await context.close();
 }
 console.log('FANDOM-R1-D original fifth-app, match/news/physical-TV, 390x844+320x568 WebGL PASS; physical iPhone QA deferred');
}finally{await browser.close();}
