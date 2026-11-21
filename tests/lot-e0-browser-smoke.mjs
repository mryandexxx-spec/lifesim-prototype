/** LOT-E0: composite plot roundtrip through actual PlayCanvas/WebGL mobile UI.
 * Four emulated Chromium viewports; not Safari device acceptance or FPS proof.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {outdoorCellAt} from '../src/lot-surface.js';
import {previewOutdoorFeatureEdit,commitOutdoorFeatureEdit,
  previewOutdoorPaint,commitOutdoorPreview} from '../src/outdoor-proposals.js';
import {enqueueAction} from '../src/action-queue.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const sizes=[[390,844],[375,667],[320,568],[844,390]];
const base=outdoorCellAt(18.25,8.25);
let root=newHousehold('2026-11-21');
root.shop.credits=30000;
root.paused=true;root.otherSim.paused=true;
root.autonomy.enabled=false;root.otherSim.autonomy.enabled=false;
root.world.outdoors={...root.world.outdoors,revision:1,
  pools:[{poolId:'pool-1',cells:Array.from({length:16},(_,i)=>
    base+Math.floor(i/4)*64+i%4).sort((a,b)=>a-b)}],
  poolFixtures:[{fixtureId:'fixture-1',poolId:'pool-1',kind:'ladder',
    edgeCell:base,side:'west',purchasePriceCredits:120}],
  nextPoolId:2,nextFixtureId:2,poolTxnSeq:1};

function place(itemId,x,z){
  const draft=previewOutdoorFeatureEdit(root,{
    operation:'place',itemId,pose:{x,z,yaw:0}});
  assert.equal(draft.ok,true,itemId+': '+draft.reason);
  const applied=commitOutdoorFeatureEdit(root,draft);
  assert.equal(applied.ok,true,applied.reason);
  root=applied.root;
}
place('garden.herb.mint',19,11);
place('garden.bench',18,-8);
const paint=previewOutdoorPaint(root,{
  from:{x:21,z:5},to:{x:21,z:5},kind:'stone'});
assert.equal(paint.ok,true,paint.reason);
root=commitOutdoorPreview(root,paint).root;
const garden=root.world.outdoors.features.find(x=>x.itemId==='garden.herb.mint');
assert.ok(enqueueAction(root.actionQueues,'alex',{
  type:'pool',poolId:'pool-1',actionId:'swim',fixtureId:'fixture-1',queuedAt:root.minutes}));
assert.ok(enqueueAction(root.actionQueues,'mira',{
  type:'garden',instanceId:garden.instanceId,actionId:'water'}));

// The canonical v1 loader intentionally does NOT restore paused from disk:
 // a queued command may already be running by the first rendered frame.
 // Guard real intent (queued OR active), never assume a dispatch queue is static.
function assertResidentIntent(saved,id,kind){
  const queue=saved.actionQueues?.byResident?.[id]||[];
  const pending=queue.some(item=>item.type===kind&&
    (kind!=='pool'||item.poolId==='pool-1')&&
    (kind!=='garden'||item.instanceId===garden.instanceId));
  const action=id==='alex'?saved.action:saved.otherSim?.action;
  const active=kind==='pool'
    ?action?.id==='swim'&&action.poolId==='pool-1'
    :action?.id==='garden'&&action.targetInstanceId===garden.instanceId;
  // A short garden action can legitimately finish during first-load and
  // reload frames. Completion is proven by the canonical settled record,
  // never by a timer or by assuming the queue is still populated.
  const completed=kind==='garden'
    ?Number.isFinite(saved.world?.outdoors?.gardens?.[garden.instanceId]?.lastWateredAt)
    :Number.isFinite(saved.poolFirstSwimAt);
  assert.ok(pending||active||completed,
    id+' '+kind+' intent lost (not queued, running or receipted): '+
    JSON.stringify({paused:saved.paused,minutes:saved.minutes,queue,action,
      gardenLastWateredAt:saved.world?.outdoors?.gardens?.[garden.instanceId]?.lastWateredAt,
      poolFirstSwimAt:saved.poolFirstSwimAt}));
}

const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
fs.mkdirSync('artifacts/lot-e0',{recursive:true});
const report=[];
try{
  for(const [width,height] of sizes){
    const context=await browser.newContext({
      viewport:{width,height},deviceScaleFactor:1,isMobile:true,hasTouch:true});
    await context.addInitScript(({key,data,tour})=>{
      if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(data));
      localStorage.setItem(tour,'done');
    },{key:SAVE_KEY,data:root,tour:UI_TOUR_STORAGE_KEY});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('crash',()=>errors.push('renderer-crashed'));
    await page.goto('http://127.0.0.1:8765/?pool=qa&lot-e0=qa',{waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:80000});
    // Saved pause is deliberately ephemeral. Freeze the *live* simulation
    // through its real UI before editor navigation and state verification.
    await page.locator('#pause-btn').click();
    const gl=await page.evaluate(()=>{
      const canvas=document.querySelector('#game-canvas');
      const bounds=canvas.getBoundingClientRect();
      return {webgl:!!(canvas.getContext('webgl2')||canvas.getContext('webgl')),
        width:bounds.width,height:bounds.height};
    });
    assert.ok(gl.webgl,'actual WebGL is required');
    assert.ok(gl.width>100&&gl.height>100,'canvas disappeared');

    await page.locator('#home-open').click();
    await page.locator('#home-outdoors').click();
    const category=page.locator('#outdoor-category');
    for(const mode of ['pool','garden','objects','ground','plants']){
      await category.selectOption(mode);
      assert.equal(await category.inputValue(),mode);
      if(mode==='pool'){
        assert.equal(await page.locator('#pool-controls').isVisible(),true);
        const visual=await page.evaluate(()=>window.__LifeSimPoolVisualStats?.());
        assert.ok(visual,'pool visual QA hook absent; pass pool=qa in URL');
        assert.equal(visual.hasPool,true,'pool mesh missing in mixed world');
      }
    }
    await page.locator('#outdoor-exit').click();
    const before=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(before.version,1);
    assert.equal(before.world.outdoors.pools[0].cells.length,16);
    assert.equal(before.world.outdoors.features.length,2);
    assert.equal(before.paused,true,'explicit UI pause must freeze mixed test');
    assertResidentIntent(before,'alex','pool');
    assertResidentIntent(before,'mira','garden');
    await page.screenshot({path:'artifacts/lot-e0/mixed-'+width+'x'+height+'.png',
      fullPage:true});
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:80000});
    // Pause is intentionally not rehydrated from root-v1. Stop the next frame
    // before comparing durable commands and active manual actions.
    await page.locator('#pause-btn').click();
    const after=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(after.version,1);
    assert.equal(after.world.outdoors.pools[0].cells.length,16);
    assert.equal(after.world.outdoors.features.length,2);
    assert.equal(after.shop.credits,before.shop.credits,'reload must not charge again');
    assert.equal(after.financialHistory.entries.length,before.financialHistory.entries.length);
    assertResidentIntent(after,'alex','pool');
    assertResidentIntent(after,'mira','garden');
    assert.equal((await page.evaluate(()=>window.__LifeSimPoolVisualStats?.()))?.hasPool,true);
    assert.deepEqual(errors,[],'PlayCanvas/browser errors');
    report.push({viewport:width+'x'+height,webgl:true,
      poolCells:16,featureCount:2,reload:true,errorCount:errors.length});
    await context.close();
  }
}finally{
  await browser.close();
  fs.writeFileSync('artifacts/lot-e0/report.json',JSON.stringify(report,null,2));
}
assert.equal(report.length,4);
console.log('LOT-E0 mixed-world real WebGL:',JSON.stringify(report));
