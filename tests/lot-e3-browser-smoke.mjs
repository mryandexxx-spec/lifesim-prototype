/** LOT-E3: genuine PlayCanvas/WebGL, not a DOM mock.
 * Four Safari-sized Chromium canvases: fixture selection, reversible thumb
 * jitter, pinch without selection/focus drift, editor touch cancellation.
 * Native iPhone Safari acceptance is deliberately out of scope.
 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {newHousehold} from '../src/household.js';
import {outdoorCellAt} from '../src/lot-surface.js';
import {poolFixtureVisualPose} from '../src/pool-visual.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const cell=outdoorCellAt(7.25,-7.25);
const fixture={fixtureId:'fixture-1',poolId:'pool-1',
 kind:'ladder',edgeCell:cell,side:'west',purchasePriceCredits:120};
const seed=newHousehold('2026-11-21');
seed.shop.credits=30000;
seed.paused=true;seed.otherSim.paused=true;
seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
seed.world.outdoors={...seed.world.outdoors,
 revision:seed.world.outdoors.revision+1,
 pools:[{poolId:'pool-1',cells:Array.from({length:16},(_,i)=>
  cell+Math.floor(i/4)*64+i%4).sort((a,b)=>a-b)}],
 poolFixtures:[fixture]};
const pose=poolFixtureVisualPose(fixture);
assert.ok(pose);
mkdirSync('artifacts/lot-e3',{recursive:true});

const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const report=[],failures=[];
try{
 for(const [w,h] of [[390,844],[375,667],[320,568],[844,390]]){
  const name=w+'x'+h,errors=[];
  const context=await browser.newContext({viewport:{width:w,height:h},
   deviceScaleFactor:1,hasTouch:true,isMobile:true});
  await context.addInitScript(({key,record,tour})=>{
   localStorage.setItem(key,JSON.stringify(record));
   localStorage.setItem(tour,'done');
  },{key:SAVE_KEY,record:seed,tour:UI_TOUR_STORAGE_KEY});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('crash',()=>errors.push('WebGL renderer crashed'));
  try{
   await page.goto('http://127.0.0.1:8765/?lot-e3=1',{waitUntil:'domcontentloaded'});
   await page.locator('#loading').waitFor({state:'hidden',timeout:80000});
   assert.ok((await page.locator('#game-canvas').screenshot()).length>2000,
    name+' real canvas rendered');
   // The established outdoor overview camera is intentionally retained
   // after editor exit; a Life-mode tap must then pick the fixture.
   await page.locator('#home-open').click();
   await page.locator('#home-outdoors').click();
   await page.locator('#outdoor-category').selectOption('pool');
   await page.locator('#outdoor-exit').click();
   const canvas=page.locator('#game-canvas');
   const sample=()=>page.evaluate(async p=>{
    const {Application,Vec3}=await import('playcanvas');
    const cam=Application.getApplication().root.findByName('Camera');
    const box=document.querySelector('#game-canvas').getBoundingClientRect();
    const at=cam.camera.worldToScreen(new Vec3(p.x,-.13,p.z));
    const position=cam.getPosition();
    const target=new Vec3(7,.62,0);
    return {point:{x:box.x+at.x,y:box.y+at.y},
      position:{x:position.x,y:position.y,z:position.z},
      distance:position.distance(target),
      yaw:Math.atan2(position.x-7,position.z)*180/Math.PI};
   },pose);
   const dispatch=async events=>page.evaluate(events=>{
    const canvas=document.querySelector('#game-canvas');
    for(const [type,id,x,y] of events){
     const target=type==='pointerdown'?canvas:window;
     target.dispatchEvent(new PointerEvent(type,{
      pointerId:id,pointerType:'touch',isPrimary:id===91,
      bubbles:true,cancelable:true,clientX:x,clientY:y,
      button:0,buttons:type==='pointerup'||type==='pointercancel'?0:1
     }));
    }
   },events);
   const initial=await sample();
   assert.ok(initial.point.x>0&&initial.point.x<w&&
    initial.point.y>0&&initial.point.y<h,name+' ladder in camera view');
   // 16 alternating micro-motions exceed the old cumulative slop even
   // though the fingertip never leaves a six-pixel radius.
   const x=initial.point.x,y=initial.point.y;
   const jitter=[['pointerdown',91,x,y]];
   for(let i=0;i<16;i++)jitter.push(['pointermove',91,x+(i%2?0:4),y+(i%2?0:3)]);
   jitter.push(['pointerup',91,x+2,y+1]);
   await dispatch(jitter);
   await page.locator('#ground-walk-menu').waitFor({state:'visible',timeout:7000});
   assert.match(await page.locator('#ground-walk-title').textContent(),/Лестница бассейна/,
    name+' ladder action must not be mistaken for water/free ground');
   await page.locator('#ground-walk-close').click();

   // Symmetric pinch must zoom, without turning/teleporting the viewpoint
   // and without choosing an object when either finger leaves the glass.
   const cx=Math.min(w-95,Math.max(95,w*.48)),cy=Math.min(h-100,Math.max(120,h*.43));
   await dispatch([['pointerdown',91,cx-34,cy],['pointerdown',92,cx+34,cy],
    ['pointermove',91,cx-60,cy],['pointermove',92,cx+60,cy],
    ['pointerup',92,cx+60,cy],['pointerup',91,cx-60,cy]]);
   const zoomed=await sample();
   assert.ok(zoomed.distance<initial.distance-1,name+' pinch changes distance');
   assert.ok(Math.abs(zoomed.yaw-initial.yaw)<.02,name+' no accidental yaw');
   assert.ok(await page.locator('#ground-walk-menu').isHidden(),
    name+' pinch must not select items');
   // The saved root and item identity do not belong to the camera.
   const before=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
   assert.equal(before.version,1);assert.equal(before.shop.credits,30000);
   assert.equal(before.world.outdoors.poolFixtures[0].fixtureId,'fixture-1');

   await page.locator('#home-open').click();
   await page.locator('#home-outdoors').click();
   await page.locator('#outdoor-category').selectOption('pool');
   await dispatch([['pointerdown',91,cx-24,cy],['pointermove',91,cx-14,cy+10],
    ['pointerdown',92,cx+38,cy],['pointercancel',92,cx+38,cy],
    ['pointerup',91,cx-14,cy+10]]);
   assert.equal(await page.locator('#outdoor-apply').isDisabled(),true,
    name+' multi-touch cancels painting without staging a purchase');
   await page.locator('#outdoor-exit').click();
   const after=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
   assert.equal(after.version,1);assert.equal(after.shop.credits,30000);
   assert.deepEqual(after.world.outdoors.pools,before.world.outdoors.pools);
   assert.deepEqual(after.world.outdoors.poolFixtures,before.world.outdoors.poolFixtures);
   assert.deepEqual(errors,[],name+' runtime/renderer errors');
   await page.screenshot({path:'artifacts/lot-e3/life-'+name+'.png',
    animations:'disabled'});
   report.push({viewport:name,ladder:'selected',pinchZoom:true,
    editorCancel:true,rootVersion:after.version,errors});
  }catch(e){failures.push(name+': '+(e?.stack||e));}
  await context.close();
 }
}finally{
 writeFileSync('artifacts/lot-e3/report.json',JSON.stringify({report,failures},null,2));
 await browser.close();
}
assert.deepEqual(failures,[],'LOT-E3 four real WebGL viewports');
console.log('LOT-E3: four mobile Chromium/WebGL selection/pinch/editor cancellation cases PASS');
