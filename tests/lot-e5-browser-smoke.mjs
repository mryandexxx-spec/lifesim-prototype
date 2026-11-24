/** LOT-E5 release QA: one real mobile journey across Life, Build, Lot,
 * Furnish, Phone and Menu; preserve synthetic save-v1/finance/FIFO.
 * Real PlayCanvas WebGL in Chromium SwiftShader != physical iPhone Safari QA.
 * Four viewport sizes and orientation switching; no production mutations.
 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
import {outdoorCellAt} from '../src/lot-surface.js';
import {previewOutdoorFeatureEdit,commitOutdoorFeatureEdit} from '../src/outdoor-proposals.js';
import {enqueueAction} from '../src/action-queue.js';

const origin=outdoorCellAt(18.25,8.25);
let seed=newHousehold('2026-11-22');
seed.shop.credits=30000;
seed.autonomy.enabled=false;
seed.otherSim.autonomy.enabled=false;
seed.paused=true;seed.otherSim.paused=true;
seed.world.outdoors={...seed.world.outdoors,revision:1,
  pools:[{poolId:'pool-1',cells:Array.from({length:16},(_,i)=>
    origin+Math.floor(i/4)*64+i%4).sort((a,b)=>a-b)}],
  poolFixtures:[{fixtureId:'fixture-1',poolId:'pool-1',kind:'ladder',
    edgeCell:origin,side:'west',purchasePriceCredits:120}],
  nextPoolId:2,nextFixtureId:2,poolTxnSeq:1};
const draft=previewOutdoorFeatureEdit(seed,{operation:'place',
  itemId:'garden.herb.mint',pose:{x:19,z:11,yaw:0}});
assert.equal(draft.ok,true,draft.reason);
seed=commitOutdoorFeatureEdit(seed,draft).root;
for(const item of ['bed','shower'])
  assert.ok(enqueueAction(seed.actionQueues,'alex',{type:'object',actionId:item}));
for(const item of ['sofa','bed'])
  assert.ok(enqueueAction(seed.actionQueues,'mira',{type:'object',actionId:item}));
assert.equal(SAVE_KEY,'lifesim.room01.v1');

const stable=root=>({
  version:root.version,
  selectedSim:root.selectedSim,
  credits:root.shop.credits,
  finance:root.financialHistory,
  construction:root.world.construction,
  furniture:root.world.furniture,
  outdoors:root.world.outdoors,
  queues:root.actionQueues
});
const snapshot=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
const modes=page=>page.evaluate(()=>{
  const id=['build-editor','furniture-editor','outdoor-editor'];
  const shell=document.querySelector('.app-shell');
  return {editors:Object.fromEntries(id.map(k=>[k,!document.getElementById(k).hidden])),
    flags:['buildMode','furnishMode','outdoorMode'].map(k=>shell.dataset[k]),
    parcel:shell.dataset.parcel||null};
});
async function assertMode(page,expected,section=null){
  const value=await modes(page);
  for(const [id,open] of Object.entries(value.editors))
    assert.equal(open,id===expected,'unexpected editor '+id+' for '+expected);
  assert.ok(value.flags.every(v=>v==='false'||v===undefined||
    (v==='true'&&expected!==null)),'mode flags cannot leak into Life mode');
  assert.ok(Object.values(value.editors).filter(Boolean).length<=1,
    'only one editor can be active');
  assert.equal(value.parcel,section,'active public parcel section');
  assert.equal(await page.locator('#parcel-editor').isVisible(),section!==null);
  assert.equal(await page.locator('#parcel-bar').isVisible(),section!==null);
  if(expected)assert.equal(await page.locator('#'+expected).isVisible(),false,
    'native editor must be hidden behind parcel UI');
}
const parcelAction=(page,id)=>page.locator('[data-parcel-action="'+id+'"]');
async function assertStable(page,base,label){
  const current=await snapshot(page);
  assert.ok(current,label+' saved root must exist');
  assert.deepEqual(stable(current),base,label+' must not change saved systems or FIFO');
  assert.equal(new Set(current.financialHistory.entries.map(e=>e.id)).size,
    current.financialHistory.entries.length,label+' unique receipts');
}
async function assertCanvas(page,label){
  const info=await page.evaluate(()=>{
    const canvas=document.querySelector('#game-canvas');
    const rect=canvas.getBoundingClientRect();
    return {w:rect.width,h:rect.height,webgl:Boolean(
      canvas.getContext('webgl2')||canvas.getContext('webgl')),
      scrollWidth:document.documentElement.scrollWidth,
      viewportWidth:innerWidth};
  });
  assert.ok(info.webgl&&info.w>100&&info.h>100,label+' real PlayCanvas canvas');
  assert.ok(info.scrollWidth<=info.viewportWidth+2,
    label+' horizontal overflow '+JSON.stringify(info));
  assert.ok((await page.locator('#game-canvas').screenshot()).length>2000,
    label+' canvas must render actual pixels');
  return info;
}
mkdirSync('artifacts/lot-e5',{recursive:true});
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const results=[],failures=[];
try{
  for(const [width,height] of [[390,844],[375,667],[320,568],[844,390]]){
    const name=width+'x'+height,errors=[],steps=[];
    const context=await browser.newContext({viewport:{width,height},
      deviceScaleFactor:1,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    await context.addInitScript(({key,record,tour})=>{
      if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
      localStorage.setItem(tour,'done');
    },{key:SAVE_KEY,record:{...seed,minutes:width===320||width===844?60:720},tour:UI_TOUR_STORAGE_KEY});
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push('JavaScript: '+e.message));
    page.on('crash',()=>errors.push('WebGL renderer crash'));
    page.on('requestfailed',r=>{
      if(/\/src\/|\/vendor\//.test(r.url()))errors.push('module '+r.url());
    });
    try{
      await page.goto('http://127.0.0.1:8765/?pool=qa&lot-e5=1',
        {waitUntil:'domcontentloaded'});
      await page.locator('#loading').waitFor({state:'hidden',timeout:80000});
      const canvas=await assertCanvas(page,name+' initial Life');
      await assertMode(page,null);
      // Root-v1 intentionally does not persist pause: pause the live app
      // before taking a baseline so editor transitions are compared fairly.
      await page.locator('#pause-btn').tap();
      await page.locator('#pick-mira').tap();
      const initial=await snapshot(page),baseline=stable(initial);
      assert.equal(initial.version,1);
      assert.equal(initial.selectedSim,'mira');
      assert.equal(initial.world.outdoors.pools[0].cells.length,16);
      assert.equal(initial.world.outdoors.features.length,1);
      assert.ok(initial.otherSim);
      assert.ok(initial.actionQueues.byResident.alex.length>=1);
      assert.ok(initial.actionQueues.byResident.mira.length>=1);
      steps.push('Life-WebGL-two-residents-FIFO');

      await page.locator('#home-open').tap();
      await page.locator('#home-build').tap();
      await assertMode(page,'build-editor','house');
      await parcelAction(page,'exit').tap();
      await assertMode(page,null);
      await assertStable(page,baseline,name+' Build exit');
      steps.push('Build-to-Life-no-transaction');

      await page.locator('#home-open').tap();
      await page.locator('#home-pool').tap();
      await assertMode(page,'outdoor-editor','pool');
      assert.equal((await page.evaluate(()=>
        window.__LifeSimPoolVisualStats?.()))?.hasPool,true);
      // PF-01: target canonical cell CENTERS inside the yard/pool, not the
      // first available pixel on the clipped scene's edge. The latter was
      // unreliable on landscape Chromium and only showed a tiny single cell.
      // Verify projection and inverse ray before each real touch.
      const point=async(x,z,kind)=>page.evaluate(async({x,z,kind,world})=>{
        const {Application,Vec3}=await import('playcanvas');
        const {lotRaySurface,outdoorCellAt}=await import('/src/lot-surface.js');
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const cam=Application.getApplication().root.findByName('Camera').camera;
        const canvas=document.querySelector('#game-canvas'),rect=canvas.getBoundingClientRect();
        const p=cam.worldToScreen(new Vec3(x,-.53,z));
        const sx=Math.round(p.x+rect.left),sy=Math.round(p.y+rect.top);
        const margin=5;
        const clear=[[0,0],[-margin,0],[margin,0],[0,-margin],[0,margin]].every(([dx,dy])=>
          document.elementFromPoint(sx+dx,sy+dy)===canvas);
        const near=cam.screenToWorld(sx-rect.left,sy-rect.top,cam.nearClip);
        const far=cam.screenToWorld(sx-rect.left,sy-rect.top,cam.farClip);
        const hit=lotRaySurface(near,far,world);
        return {x:sx,y:sy,clear,hit,expectedCell:outdoorCellAt(x,z),
          actualCell:hit?outdoorCellAt(hit.x,hit.z):null,kind};
      },{x,z,kind,world:initial.world});
      // Passive evidence for distinguishing a missed touch, a cancelled
      // gesture, and a renderer failure; do not inject gameplay events.
      await page.evaluate(()=>{
        window.__pf01TouchTrace=[];
        for(const type of ['pointerdown','pointerup','pointercancel','lostpointercapture'])
          document.addEventListener(type,e=>{
            const trace=window.__pf01TouchTrace;
            trace.push({type,target:e.target.id,x:e.clientX,y:e.clientY,time:e.timeStamp});
            if(trace.length>16)trace.shift();
          },{capture:true,passive:true});
      });
      const outline=()=>page.evaluate(async()=>{
        const {Application}=await import('playcanvas');
        const root=Application.getApplication().root;
        const border=root.findByName('PF-01 pool preview outline');
        const fill=root.findByName('LOT-B1 paint preview');
        const scale=fill.getLocalScale();
        return {enabled:border.enabled,edges:border.children.length,lit:border.children.some(n=>n.render.material.useLighting),
          fill:fill.enabled,opacity:fill.render.material.opacity,size:[scale.x,scale.z]};
      });
      for(const tool of ['paint','erase']){
        await parcelAction(page,'group:water').tap();
        await parcelAction(page,'pick:'+tool).tap();
        assert.equal(await parcelAction(page,'apply').isDisabled(),true);
        const corners=tool==='paint'?[[1.25,-8.75],[3.75,-7.25]]:[[18.75,8.75],[19.75,9.75]];
        const kind=tool==='paint'?'yard':'pool-water';
        for(const [i,[x,z]] of corners.entries()){
          const at=await point(x,z,kind);
          assert.ok(at.clear&&at.hit?.kind===kind&&at.actualCell===at.expectedCell,
            name+' '+tool+' corner '+i+' projection '+JSON.stringify(at));
          await page.touchscreen.tap(at.x,at.y);
          const expected=i===0?[.5,.5]:
            [Math.abs(corners[1][0]-corners[0][0])+.5,Math.abs(corners[1][1]-corners[0][1])+.5];
          const actual=await outline();
          const trace=await page.evaluate(()=>window.__pf01TouchTrace);
          assert.deepEqual(actual,{enabled:true,edges:4,lit:false,fill:true,opacity:.62,size:expected},
            name+' '+tool+' corner '+i+' '+JSON.stringify({at,trace,
              hint:await page.locator('#parcel-editor output').textContent()}));
          if(i===0)assert.match(await page.locator('#parcel-editor output').textContent(),/противоположной клетки/);
        }
        await page.screenshot({path:'artifacts/lot-e5/pf-01-'+tool+'-'+name+'.png'});
        await parcelAction(page,'cancel').tap();
        assert.equal((await outline()).enabled,false);
        assert.equal((await outline()).fill,false);
      }
      await parcelAction(page,'exit').tap();
      await assertMode(page,null);
      await assertStable(page,baseline,name+' Lot exit');
      steps.push('Lot-pool-to-Life-no-transaction');

      await page.locator('#home-open').tap();
      await page.locator('#home-furnish').tap();
      await assertMode(page,'furniture-editor','furniture');
      await parcelAction(page,'group:shop').tap();
      await page.locator('#parcel-editor #furnish-stock button[data-item-id="chair.loft"]').tap();
      await parcelAction(page,'try').tap();
      assert.equal(await page.locator('#furniture-editor')
        .getAttribute('data-shop-placing'),'true');
      await parcelAction(page,'cancel').tap();
      assert.equal(await page.locator('#furniture-editor')
        .getAttribute('data-shop-placing'),'false');
      await parcelAction(page,'exit').tap();
      await assertMode(page,null);
      await assertStable(page,baseline,name+' Furnish preview cancelled');
      steps.push('Furnish-cancel-to-Life-no-charge');

      await page.locator('#career-phone-toggle').tap();
      assert.match(await page.locator('.phone-platform-welcome').innerText(),/Мира/);
      await page.locator('#career-phone-panel [data-phone-app="finance"]').tap();
      assert.match(await page.locator('#career-phone-title').innerText(),/Финансы/);
      await page.locator('#career-phone-panel .career-phone-header .career-phone-x').tap();
      await page.locator('#calendar-anchor-toggle').tap();
      await page.locator('#lc-close').tap();
      await page.locator('#view-toggle').tap();
      await page.locator('#menu-rotate-btn').tap();
      assert.equal(await page.locator('#menu-rotate-btn')
        .getAttribute('aria-pressed'),'true');
      await page.locator('#menu-rotate-btn').tap();
      await page.locator('#view-close').tap();
      await assertStable(page,baseline,name+' phone/calendar/camera');
      steps.push('Phone-finance-calendar-camera-no-charge');

      await page.setViewportSize({width:height,height:width});
      await page.waitForTimeout(180);
      const rotated=await assertCanvas(page,name+' rotated Life');
      await page.locator('#home-open').tap();
      await page.locator('#home-outdoors').tap();
      await assertMode(page,'outdoor-editor','yard');
      await parcelAction(page,'exit').tap();
      await assertMode(page,null);
      await assertStable(page,baseline,name+' rotated Lot exit');
      await page.screenshot({path:'artifacts/lot-e5/rotated-'+name+'.png'});
      await page.setViewportSize({width,height});
      await page.waitForTimeout(180);
      await assertCanvas(page,name+' restored Life');
      steps.push('Rotate-Lot-to-Life');

      await page.locator('#view-toggle').tap();
      await page.locator('#save-btn').tap();
      await page.locator('#view-panel').waitFor({state:'hidden'});
      const beforeReload=await snapshot(page);
      assert.deepEqual(stable(beforeReload),baseline,'explicit save without edits');
      await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('#loading').waitFor({state:'hidden',timeout:80000});
      await assertMode(page,null);
      await assertCanvas(page,name+' reload Life');
      const reloaded=await snapshot(page);
      // On boot the active resident can advance a queued task; the
      // previously saved world and financial ledger must remain exact.
      const {queues:priorQueues,...immutable}=baseline;
      const {queues:afterQueues,...afterImmutable}=stable(reloaded);
      assert.deepEqual(afterImmutable,immutable,name+' reload retains paid world and wallet');
      assert.ok(afterQueues.byResident.alex&&afterQueues.byResident.mira,
        name+' both residents retain valid FIFO stores');
      assert.deepEqual(errors,[],name+' runtime errors');
      await page.screenshot({path:'artifacts/lot-e5/reloaded-'+name+'.png'});
      steps.push('Save-v1-reload-Life-no-duplicate-finance');
      results.push({viewport:name,engine:'Chromium SwiftShader/PlayCanvas WebGL',
        canvas,rotated,steps,rootVersion:reloaded.version,
        credits:reloaded.shop.credits,receiptCount:reloaded.financialHistory.entries.length,
        jsErrors:errors.length});
    }catch(e){
      await page.screenshot({path:'artifacts/lot-e5/failure-'+name+'.png'}).catch(()=>{});
      failures.push({viewport:name,step:steps.at(-1)||'startup',error:e.stack||String(e),
        browserErrors:errors});
    }finally{await context.close();}
  }
}finally{
  await browser.close();
  writeFileSync('artifacts/lot-e5/report.json',JSON.stringify({
    engine:'Chromium SwiftShader / real PlayCanvas WebGL',
    deviceAcceptance:'NOT DONE: actual Safari on iPhone, orientation, thermal, gestures',
    saveKey:SAVE_KEY,results,failures
  },null,2)+'\n');
}
assert.deepEqual(failures,[],'LOT-E5 cross-mode findings; see artifacts/lot-e5/report.json');
assert.equal(results.length,4,'four viewport transitions required');
console.log('LOT-E5 cross-mode four WebGL viewport QA PASS: '+JSON.stringify(results));
