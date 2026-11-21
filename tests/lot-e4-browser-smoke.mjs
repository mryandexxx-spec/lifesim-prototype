/** LOT-E4 real PlayCanvas/WebGL integration on four Safari-size Chromium
 * emulations. The day/night screenshots are seeded reloads, NOT 12 hours
 * played in Chromium. Device FPS and native iPhone Safari remain unverified.
 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {newHousehold} from '../src/household.js';
import {hireCareer} from '../src/career-state.js';
import {outdoorCellAt} from '../src/lot-surface.js';
import {previewOutdoorFeatureEdit,commitOutdoorFeatureEdit} from '../src/outdoor-proposals.js';
import {enqueueAction} from '../src/action-queue.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const first=outdoorCellAt(18.25,8.25);
let root=newHousehold('2026-11-16');
root.shop.credits=30000;
root.autonomy.enabled=false;root.otherSim.autonomy.enabled=false;
root.world.outdoors={...root.world.outdoors,revision:1,
 pools:[{poolId:'pool-1',cells:Array.from({length:16},(_,i)=>
  first+Math.floor(i/4)*64+i%4).sort((a,b)=>a-b)}],
 poolFixtures:[{fixtureId:'fixture-1',poolId:'pool-1',kind:'ladder',
  edgeCell:first,side:'west',purchasePriceCredits:120}],
 nextPoolId:2,nextFixtureId:2,poolTxnSeq:1};
const plan=previewOutdoorFeatureEdit(root,{operation:'place',
 itemId:'garden.herb.mint',pose:{x:19,z:11,yaw:0}});
assert.equal(plan.ok,true,plan.reason);
const committed=commitOutdoorFeatureEdit(root,plan);
assert.equal(committed.ok,true,committed.reason);
root=committed.root;
const plot=root.world.outdoors.features.find(x=>x.itemId==='garden.herb.mint').instanceId;
root.careerSystem=hireCareer(root.careerSystem,'alex','editorial',root.minutes);
root.careerSystem=hireCareer(root.careerSystem,'mira','business-center',root.minutes);
root.minutes=720;root.otherSim.minutes=720;
root.paused=true;root.otherSim.paused=true;
assert.ok(enqueueAction(root.actionQueues,'alex',{
 type:'pool',poolId:'pool-1',actionId:'swim',fixtureId:'fixture-1',queuedAt:root.minutes}));
assert.ok(enqueueAction(root.actionQueues,'alex',{type:'move',x:16,z:6}));
assert.ok(enqueueAction(root.actionQueues,'mira',{
 type:'garden',instanceId:plot,actionId:'water'}));
assert.ok(enqueueAction(root.actionQueues,'mira',{type:'move',x:16,z:-6}));

function intent(data,id,type){
 const actor=id==='alex'?data:data.otherSim;
 const q=data.actionQueues?.byResident?.[id]||[];
 const queued=q.some(x=>x.type===type);
 const active=type==='pool'?actor.action?.id==='swim':
  actor.action?.id==='garden'&&actor.action?.targetInstanceId===plot;
 const done=type==='pool'?Number.isFinite(data.poolFirstSwimAt):
  Number.isFinite(data.world?.outdoors?.gardens?.[plot]?.lastWateredAt);
 assert.ok(queued||active||done,id+' '+type+' lost across WebGL scene/reload');
}
function verify(data){
 assert.equal(data.version,1);
 assert.equal(data.otherSim.minutes,data.minutes);
 assert.equal(data.world.outdoors.pools[0].cells.length,16);
 assert.equal(data.world.outdoors.poolFixtures[0].fixtureId,'fixture-1');
 assert.equal(data.world.outdoors.features.length,1);
 assert.ok(data.careerSystem.byResident.alex);
 assert.ok(data.careerSystem.byResident.mira);
 assert.equal(new Set(data.financialHistory.entries.map(e=>e.id)).size,
  data.financialHistory.entries.length);
 intent(data,'alex','pool');intent(data,'mira','garden');
}
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
mkdirSync('artifacts/lot-e4',{recursive:true});
const report=[];
try{
 for(const [w,h] of [[390,844],[375,667],[320,568],[844,390]]){
  const name=w+'x'+h,errors=[];
  const context=await browser.newContext({viewport:{width:w,height:h},
   deviceScaleFactor:1,isMobile:true,hasTouch:true});
  await context.addInitScript(({key,root,tour})=>{
   if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(root));
   localStorage.setItem(tour,'done');
  },{key:SAVE_KEY,root,tour:UI_TOUR_STORAGE_KEY});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('crash',()=>errors.push('renderer crash'));
  try{
   await page.goto('http://127.0.0.1:8765/?pool=qa&lot-e4=1',
    {waitUntil:'domcontentloaded'});
   await page.locator('#loading').waitFor({state:'hidden',timeout:80000});
   await page.locator('#pause-btn').click();
   const gl=await page.evaluate(()=>{
    const canvas=document.querySelector('#game-canvas');
    const box=canvas.getBoundingClientRect();
    return {width:box.width,height:box.height,
     webgl:!!(canvas.getContext('webgl2')||canvas.getContext('webgl'))};
   });
   assert.ok(gl.webgl&&gl.width>100&&gl.height>100,'real playable PlayCanvas WebGL');
   assert.equal(await page.locator('#speed-btn').textContent(),'1×');
   await page.locator('#speed-btn').click();
   assert.equal(await page.locator('#speed-btn').textContent(),'3×');
   await page.locator('#speed-btn').click();
   assert.equal(await page.locator('#speed-btn').textContent(),'1×');
   await page.locator('#home-open').click();
   await page.locator('#home-outdoors').click();
   await page.locator('#outdoor-category').selectOption('pool');
   const visual=await page.evaluate(()=>window.__LifeSimPoolVisualStats?.());
   assert.equal(visual?.hasPool,true,'pool rendered alongside garden');
   await page.locator('#outdoor-category').selectOption('garden');
   await page.locator('#outdoor-exit').click();
   const day=await page.evaluate(async key=>{
    const saved=JSON.parse(localStorage.getItem(key));
    const {sampleWorldLighting}=await import('/src/day-night-cycle.js');
    const light=sampleWorldLighting(saved.calendar,saved.minutes);
    return {saved,phase:light.phase};
   },SAVE_KEY);
   verify(day.saved);
   assert.equal(day.phase,'day','day scene seeded at 12:00');
   await page.screenshot({path:'artifacts/lot-e4/day-'+name+'.png'});
   // The old test changed localStorage *behind a live WebGL instance*,
   // which then re-saved its older day state on navigation. Create a separate
   // browser context with a genuine night save BEFORE boot, then reload it.
   // This checks the actual night scene instead of racing a live save timer.
   const nightSeed=structuredClone(day.saved);
   nightSeed.minutes=1320;nightSeed.otherSim.minutes=1320;
   for(const task of nightSeed.actionQueues?.byResident?.alex||[])
    if(task.type==='pool')task.queuedAt=1320;
   const nightContext=await browser.newContext({viewport:{width:w,height:h},
    deviceScaleFactor:1,isMobile:true,hasTouch:true});
   try{
    await nightContext.addInitScript(({key,record,tour})=>{
     if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
     localStorage.setItem(tour,'done');
    },{key:SAVE_KEY,record:nightSeed,tour:UI_TOUR_STORAGE_KEY});
    const nightPage=await nightContext.newPage();
    nightPage.on('pageerror',e=>errors.push(e.message));
    nightPage.on('crash',()=>errors.push('night renderer crash'));
    await nightPage.goto('http://127.0.0.1:8765/?pool=qa&lot-e4=1',
     {waitUntil:'domcontentloaded'});
    await nightPage.locator('#loading').waitFor({state:'hidden',timeout:80000});
    await nightPage.locator('#pause-btn').click();
    const nightState=async()=>nightPage.evaluate(async key=>{
     const saved=JSON.parse(localStorage.getItem(key));
     const {sampleWorldLighting}=await import('/src/day-night-cycle.js');
     return {saved,phase:sampleWorldLighting(saved.calendar,saved.minutes).phase};
    },SAVE_KEY);
    const night=await nightState();
    verify(night.saved);
    assert.ok(night.saved.minutes>=1320&&night.saved.minutes<1350,
     name+' night clock must survive WebGL boot; got '+night.saved.minutes);
    assert.equal(night.phase,'night','night scene seeded at 22:00');
    assert.equal(night.saved.shop.credits,day.saved.shop.credits,
     'night bootstrap cannot debit family wallet');
    assert.deepEqual(night.saved.financialHistory,day.saved.financialHistory,
     'night bootstrap cannot invent finance entries');
    assert.equal((await nightPage.evaluate(()=>window.__LifeSimPoolVisualStats?.()))?.hasPool,
     true,'night pool rendered alongside garden');
    await nightPage.screenshot({path:'artifacts/lot-e4/night-'+name+'.png'});
    await nightPage.reload({waitUntil:'domcontentloaded'});
    await nightPage.locator('#loading').waitFor({state:'hidden',timeout:80000});
    await nightPage.locator('#pause-btn').click();
    const restored=await nightState();
    verify(restored.saved);
    assert.equal(restored.phase,'night',name+' persisted night remains night after reload');
    assert.equal(restored.saved.shop.credits,night.saved.shop.credits);
    assert.deepEqual(restored.saved.financialHistory,night.saved.financialHistory);
   }finally{
    await nightContext.close();
   }
   assert.deepEqual(errors,[],name+' WebGL/javascript errors');
   report.push({viewport:name,webgl:gl.webgl,day:day.phase,night:night.phase,
    twoResidents:true,careers:2,manualFifo:true,garden:true,pool:true,
    speedToggled:true,saveReload:true,errorCount:errors.length});
  }finally{
   await context.close();
  }
 }
}finally{
 await browser.close();
 writeFileSync('artifacts/lot-e4/report.json',JSON.stringify(report,null,2));
}
assert.equal(report.length,4);
console.log('LOT-E4 real PlayCanvas/WebGL four-size cohabitation:',JSON.stringify(report));
