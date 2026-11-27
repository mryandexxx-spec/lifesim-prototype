/** PF-14 real touch admission, timed settlement and root-v1 reload on mobile. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
import {newHousehold} from '../src/household.js';
import {previewOutdoorFeatureEdit,commitOutdoorFeatureEdit} from '../src/outdoor-proposals.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
const out='artifacts/pf-14';mkdirSync(out,{recursive:true});
let seed=newHousehold('2026-11-26');
seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
seed.shop.credits=4000;seed.needs.social=30;seed.paused=true;seed.otherSim.paused=true;
for(const [x,z] of [[8,-7],[15,-5],[19,-5],[19,7],[15,7],[8,7]]){
 const proposal=previewOutdoorFeatureEdit(seed,{operation:'place',itemId:'garden.flower.calendula',pose:{x,z,yaw:0}});
 if(proposal.ok){const r=commitOutdoorFeatureEdit(seed,proposal);assert.ok(r.ok);seed=r.root;}
}
const beds=seed.world.outdoors.features.filter(f=>f.itemId==='garden.flower.calendula');
assert.ok(beds.length>=3,'several actual selectable beds');
const report=[];
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch(name==='chromium'?{headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']}:{headless:true});
 try{for(const [width,height] of [[390,844],[320,568]]){
  const label=name+'-'+width,result={label};report.push(result);
  const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:true,hasTouch:true,serviceWorkers:'block'});
  try{
   await ctx.addInitScript(({seed,key,tour})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));localStorage.setItem(tour,'done');},{seed,key:SAVE_KEY,tour:UI_TOUR_STORAGE_KEY});
   const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('crash',()=>errors.push('crash'));
   const ready=()=>page.locator('#loading').waitFor({state:'hidden',timeout:100000});
   await page.goto('http://127.0.0.1:8765/?furniture=qa&garden-start-paused=1',{waitUntil:'domcontentloaded'});await ready();
   const read=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
   // Leaving the parcel editor restores the pre-editor camera. Use the actual
   // gameplay lot-camera control, not the obsolete editor framing assumption.
   const frameLot=async()=>{await page.locator('#view-toggle').tap();await page.locator('#menu-lot-camera-btn').tap();await page.locator('#view-panel').waitFor({state:'hidden'});};
   await frameLot();
   const menu=page.locator('#ground-walk-menu');
   const project=()=>page.evaluate(async beds=>{
    const {Application,Vec3}=await import('playcanvas');const camera=Application.getApplication().root.findByName('Camera').camera;
    const canvas=document.querySelector('#game-canvas'),rect=canvas.getBoundingClientRect();
    return beds.flatMap(f=>{
     const v=camera.worldToScreen(new Vec3(f.x,0,f.z)),x=Math.round(v.x+rect.left),y=Math.round(v.y+rect.top);
     return document.elementFromPoint(x,y)===canvas?[{x,y,id:f.instanceId}]:[];
    });
   },beds);
   const openBed=async()=>{
    const points=await project();result.projected=points;
    for(const pt of points){
     await page.touchscreen.tap(pt.x,pt.y);
     await menu.waitFor({state:'visible',timeout:1500}).catch(()=>{});
     if(await menu.isVisible()){
      const title=await page.locator('#ground-walk-title').textContent();
      (result.taps??=[]).push({pt,title});
      if(title.includes('Календула'))return;
      await page.locator('#ground-walk-close').tap();
     }
    }
    throw Error('No visible garden selected by actual touch: '+JSON.stringify({points,taps:result.taps}));
   };
   await openBed();
   const talk=page.locator('#ground-walk-more [data-garden-action="talk"]');
   assert.ok(await talk.isVisible());assert.equal(await talk.isDisabled(),false);
   const bounds=await menu.boundingBox(),hud=await page.locator('#dashboard').boundingBox();
   assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1&&bounds.y>=0&&bounds.y+bounds.height<=hud.y+1);
   const checkSheet=async()=>{
    const layout=await page.evaluate(()=>{
     const panel=document.querySelector('#ground-walk-menu'),btn=panel.querySelector('[data-garden-action="talk"]'),note=btn.querySelector('small');
     const r=panel.getBoundingClientRect(),n=note.getBoundingClientRect(),b=btn.getBoundingClientRect();
     return {noteVisible:n.top>=r.top&&n.bottom<=r.bottom+1,hitHeight:b.height,
      panelZ:Number(getComputedStyle(panel).zIndex),toastZ:Number(getComputedStyle(document.querySelector('#toast')).zIndex)};
    });
    assert.ok(layout.noteVisible,JSON.stringify(layout));
    assert.ok(layout.hitHeight>=48,JSON.stringify(layout));
    assert.ok(layout.toastZ<layout.panelZ,JSON.stringify(layout));
    (result.layouts??=[]).push(layout);
   };
   await checkSheet();
   await page.screenshot({path:out+'/'+label+'-menu.png'});
   const initial=await read();
   assert.equal(initial.actionQueues.byResident.alex.length,0);
   await talk.tap();
   await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).actionQueues.byResident.alex.some(a=>a.type==='garden'&&a.actionId==='talk'),SAVE_KEY,{timeout:10000});
   const queued=await read();
   assert.equal(queued.needs.social,initial.needs.social);
   await page.locator('#pause-btn').tap();
   await page.waitForFunction(()=>{const a=window.__LifeSimGardenSessionQA?.().actors.alex;return a&&!a.action&&a.event.startsWith('Поговорил');},null,{timeout:90000});
   await page.locator('#pause-btn').tap();
   await page.screenshot({path:out+'/'+label+'-complete.png'});
   await page.reload({waitUntil:'domcontentloaded'});await ready();
   const saved=await read();
   assert.equal(saved.version,1);assert.ok(saved.needs.social>initial.needs.social);
   assert.ok(Number.isFinite(saved.gardenRewards.alexLastTalkAt));
   assert.equal(saved.shop.credits,initial.shop.credits);
   assert.equal(saved.actionQueues.byResident.alex.filter(a=>a.actionId==='talk').length,0);
   await frameLot();await openBed();
   // Reopening immediately after settlement/reload must not hide repeatable talk.
   assert.equal(await talk.isDisabled(),false);
   assert.match(await talk.textContent(),/общение до 45%/);
   assert.ok(saved.needs.social<=45);
   await checkSheet();
   await page.screenshot({path:out+'/'+label+'-repeatable.png'});
   assert.deepEqual(errors,[]);Object.assign(result,{passed:true,initialSocial:initial.needs.social,finalSocial:saved.needs.social,lastTalk:saved.gardenRewards.alexLastTalkAt});
  }catch(e){result.error=String(e.stack||e);throw e;}finally{writeFileSync(out+'/report.json',JSON.stringify(report,null,2));await ctx.close();}
 }}finally{await browser.close();}
}
