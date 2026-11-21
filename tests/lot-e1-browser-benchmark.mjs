/** LOT-E1b: PlayCanvas 2.24 AppStats sampling on actual Chromium/WebGL.
 * Reports real CI runner timings, never an iPhone Safari FPS claim.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {outdoorCellAt} from '../src/lot-surface.js';
import {previewOutdoorFeatureEdit,commitOutdoorFeatureEdit,
  previewOutdoorPaint,commitOutdoorPreview} from '../src/outdoor-proposals.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const sizes=[[390,844],[375,667],[320,568],[844,390]];
const poolStart=outdoorCellAt(18.25,8.25);
let root=newHousehold('2026-11-21');
root.shop.credits=30000;
root.autonomy.enabled=false;root.otherSim.autonomy.enabled=false;
root.world.outdoors={...root.world.outdoors,revision:1,
  pools:[{poolId:'pool-1',cells:Array.from({length:16},(_,i)=>
    poolStart+Math.floor(i/4)*64+i%4).sort((a,b)=>a-b)}],
  poolFixtures:[{fixtureId:'fixture-1',poolId:'pool-1',kind:'ladder',
    edgeCell:poolStart,side:'west',purchasePriceCredits:120}],
  nextPoolId:2,nextFixtureId:2,poolTxnSeq:1};

function place(itemId,x,z){
  const d=previewOutdoorFeatureEdit(root,{
    operation:'place',itemId,pose:{x,z,yaw:0}});
  assert.equal(d.ok,true,d.reason);
  const t=commitOutdoorFeatureEdit(root,d);
  assert.equal(t.ok,true,t.reason);
  root=t.root;
}
place('garden.herb.mint',19,11);
place('garden.bench',18,-8);
const proposal=previewOutdoorPaint(root,{
  from:{x:21,z:5},to:{x:21,z:5},kind:'stone'});
assert.equal(proposal.ok,true,proposal.reason);
const receipt=commitOutdoorPreview(root,proposal);
assert.equal(receipt.ok,true,receipt.reason);
root=receipt.root;
const originalBalance=root.shop.credits;
const originalLedgerCount=root.financialHistory.entries.length;

const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const percentile=(data,p)=>{
  if(!data.length)return null;
  const sorted=[...data].sort((a,b)=>a-b);
  return +sorted[Math.ceil(sorted.length*p)-1].toFixed(2);
};
const numeric=v=>Number.isFinite(v)?v:null;
fs.mkdirSync('artifacts/lot-e1',{recursive:true});
const reports=[];
try{
  for(const [width,height] of sizes){
    const context=await browser.newContext({viewport:{width,height},
      deviceScaleFactor:1,isMobile:true,hasTouch:true});
    await context.addInitScript(({key,root,tour})=>{
      if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(root));
      localStorage.setItem(tour,'done');
    },{key:SAVE_KEY,root,tour:UI_TOUR_STORAGE_KEY});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('crash',()=>errors.push('renderer-crash'));
    const started=Date.now();
    await page.goto('http://127.0.0.1:8765/?pool=qa&lot-e1=qa',
      {waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:80000});
    const loadMs=Date.now()-started;
    // Pause only by live UI. Paused is not restored by canonical v1 load.
    await page.locator('#pause-btn').click();
    const initial=await page.evaluate(key=>{
      const canvas=document.querySelector('#game-canvas'),b=canvas.getBoundingClientRect();
      const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
      const r=performance.getEntriesByType('resource');
      return {
        webgl:!!gl,canvasWidth:b.width,canvasHeight:b.height,
        memoryBytes:Number.isFinite(performance.memory?.usedJSHeapSize)
          ?performance.memory.usedJSHeapSize:null,
        resourceCount:r.length,
        transferredBytes:r.reduce((sum,x)=>sum+(x.transferSize||0),0),
        save:JSON.parse(localStorage.getItem(key)),
        qaProbe:typeof window.__LifeSimE1Stats
      };
    },SAVE_KEY);
    assert.ok(initial.webgl,'must use real WebGL, not screenshots alone');
    assert.ok(initial.canvasWidth>100&&initial.canvasHeight>100,
      'visible canvas required');
    assert.equal(initial.qaProbe,'function',
      'PlayCanvas read-only stats hook should exist only on lot-e1=qa');
    assert.equal(initial.save.version,1);
    assert.equal(initial.save.world.outdoors.pools[0].cells.length,16);
    assert.equal(initial.save.world.outdoors.features.length,2);
    assert.equal(initial.save.shop.credits,originalBalance);
    const samples=[];
    for(let i=0;i<16;i++){
      await page.waitForTimeout(80);
      const s=await page.evaluate(()=>window.__LifeSimE1Stats?.());
      assert.ok(s&&Number.isFinite(s.drawCallCount),
        'PlayCanvas 2.24 drawCallCount getter must return a number');
      samples.push(s);
    }
    assert.ok(samples.some(s=>s.drawCallCount>0),
      'real mixed world must issue nonzero PlayCanvas draw calls');
    const pool=await page.evaluate(()=>window.__LifeSimPoolVisualStats?.());
    assert.equal(pool?.hasPool,true,'pool geometry must be in mixed render');

    // Exercise editor rendering rather than reporting only initial house view.
    await page.locator('#home-open').click();
    await page.locator('#home-outdoors').click();
    await page.locator('#outdoor-category').selectOption('pool');
    assert.equal(await page.locator('#pool-controls').isVisible(),true);
    await page.waitForTimeout(200);
    const editorStats=await page.evaluate(()=>window.__LifeSimE1Stats?.());
    assert.ok(editorStats?.drawCallCount>0,'editor still renders');
    await page.screenshot({path:'artifacts/lot-e1/mixed-'+width+'x'+height+'.png',
      fullPage:true});
    await page.locator('#outdoor-exit').click();
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:80000});
    await page.locator('#pause-btn').click();
    const after=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(after.version,1);
    assert.equal(after.world.outdoors.pools[0].cells.length,16);
    assert.equal(after.world.outdoors.features.length,2);
    assert.equal(after.shop.credits,originalBalance,
      'reload must not charge the family wallet again');
    assert.equal(after.financialHistory.entries.length,originalLedgerCount,
      'profiling never creates finance receipts');
    const afterStats=await page.evaluate(()=>window.__LifeSimE1Stats?.());
    assert.ok(afterStats?.drawCallCount>=0,'stats hook must survive reload');
    assert.deepEqual(errors,[],'PlayCanvas browser must have no uncaught errors');

    const take=key=>samples.map(s=>s[key]).filter(Number.isFinite);
    reports.push({
      viewport:width+'x'+height,environment:'Chromium PlayCanvas 2.24 SwiftShader WebGL',
      loadMs,webgl:true,screen:{width:initial.canvasWidth,height:initial.canvasHeight},
      drawCalls:{median:percentile(take('drawCallCount'),.5),
        p95:percentile(take('drawCallCount'),.95),
        editor:editorStats.drawCallCount},
      frameTimeMs:{p50:percentile(take('frameTimeMs'),.5),
        p95:percentile(take('frameTimeMs'),.95)},
      cpuUpdateMs:{p95:percentile(take('cpuUpdateMs'),.95)},
      cpuRenderMs:{p95:percentile(take('cpuRenderMs'),.95)},
      estimatedVramBytes:numeric(samples.at(-1).vramBytes),
      browserHeapBytes:initial.memoryBytes,
      networkResourceCount:initial.resourceCount,
      transferredBytes:initial.transferredBytes,
      sampleCount:samples.length,saveReload:true,errorCount:errors.length,
      iPhoneSafariVerified:false
    });
    await context.close();
  }
}finally{
  await browser.close();
  fs.writeFileSync('artifacts/lot-e1/browser.json',JSON.stringify({
    stage:'LOT-E1b',mode:'measured browser baseline only, not iPhone Safari',
    reports
  },null,2));
}
assert.equal(reports.length,4);
console.log('LOT-E1 measured WebGL baseline:',JSON.stringify(reports));
