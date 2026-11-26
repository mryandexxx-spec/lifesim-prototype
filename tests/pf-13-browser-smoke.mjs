import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
import {newHousehold} from '../src/household.js';
import {previewOutdoorFeatureEdit,commitOutdoorFeatureEdit} from '../src/outdoor-proposals.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
const dir='artifacts/pf-13';mkdirSync(dir,{recursive:true});
const seed=newHousehold('2026-11-26');seed.shop.credits=1000;seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
const sku='garden.flower.calendula';
const candidates=[];
for(let x=15;x<=23;x+=2)for(let z=-9;z<=9;z+=2){
 const p={x,z,yaw:0};if(previewOutdoorFeatureEdit(seed,{operation:'place',itemId:sku,pose:p}).ok)candidates.push(p);
}
assert.ok(candidates.length>=2);
const report=[];
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch(name==='chromium'?{headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']}:{headless:true});
 try{for(const [width,height] of [[390,844],[320,568]]){
 const label=name+'-'+width,ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const result={label};report.push(result);
 try{
 await ctx.addInitScript(({seed,key,tour})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));localStorage.setItem(tour,'done');},{seed,key:SAVE_KEY,tour:UI_TOUR_STORAGE_KEY});
 const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const ready=()=>page.locator('#loading').waitFor({state:'hidden',timeout:100000});
 await page.goto('http://127.0.0.1:8765/?furniture=qa&garden-start-paused=1',{waitUntil:'domcontentloaded'});await ready();
 const tap=id=>page.locator('[data-parcel-action="'+id+'"]').tap();
 const read=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
 const initial=await read();
 await page.locator('#home-open').tap();await page.locator('#home-outdoors').tap();
 await tap('group:garden');await tap('pick:'+sku);await tap('quantity-plus');await tap('quantity-plus');
 assert.match(await page.locator('.parcel-wallet').textContent(),/360/);
 await page.screenshot({path:dir+'/'+label+'-quantity.png'});
 const project=points=>page.evaluate(async points=>{
  const {Application,Vec3}=await import('playcanvas');const cam=Application.getApplication().root.findByName('Camera').camera;
  const canvas=document.querySelector('#game-canvas'),rect=canvas.getBoundingClientRect();
  for(const p of points){const v=cam.worldToScreen(new Vec3(p.x,-.53,p.z));const x=Math.round(v.x+rect.left),y=Math.round(v.y+rect.top);
   if([[0,0],[-5,0],[5,0],[0,-5],[0,5]].every(([dx,dy])=>document.elementFromPoint(x+dx,y+dy)===canvas))return {x,y,p};
  }return null;
 },points);
 let used=[];
 for(let n=1;n<=2;n++){
  let point=await project(candidates.filter(p=>!used.some(q=>Math.hypot(p.x-q.x,p.z-q.z)<2)));
  for(let i=0;!point&&i<3;i++){await tap('zoom-out');point=await project(candidates.filter(p=>!used.some(q=>Math.hypot(p.x-q.x,p.z-q.z)<2)));}
  assert.ok(point,'valid visible ground');used.push(point.p);
  await page.touchscreen.tap(point.x,point.y);
  const apply=page.locator('[data-parcel-action="apply"]');assert.equal(await apply.isDisabled(),false);
  await tap('apply');
  const next=await read();assert.equal(next.shop.credits,initial.shop.credits-n*120);
  assert.equal(next.world.outdoors.features.length,initial.world.outdoors.features.length+n);
  assert.equal(next.financialHistory.entries.length,initial.financialHistory.entries.length+n);
  assert.equal(await apply.isDisabled(),true,'old confirmation is consumed');
 }
 await page.screenshot({path:dir+'/'+label+'-partial.png'});
 await tap('cancel');const paid=await read();assert.equal(paid.shop.credits,760);
 await tap('exit');await page.reload({waitUntil:'domcontentloaded'});await ready();
 const loaded=await read();assert.deepEqual(loaded.world.outdoors.features,paid.world.outdoors.features);
 assert.deepEqual(loaded.world.outdoors.gardens,paid.world.outdoors.gardens);
 assert.equal(loaded.shop.credits,paid.shop.credits);assert.deepEqual(errors,[]);
 result.passed=true;
 }catch(e){result.error=String(e.stack||e);throw e;}finally{writeFileSync(dir+'/report.json',JSON.stringify(report,null,2));await ctx.close();}
 }}finally{await browser.close();}
}
