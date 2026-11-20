/** LOT-D2c four real mobile PlayCanvas/WebGL renderings, tap and safe exit. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold,tickHousehold} from '../src/household.js';
import {beginPoolSwim,arrivePoolApproach} from '../src/pool-swim-runtime.js';
import {outdoorCellAt} from '../src/lot-surface.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

function projectGround(w,h,x,z,y=-.475){
  const yaw=42*Math.PI/180,pitch=60*Math.PI/180,dist=43;
  const cx=7,cy=.62,cz=0;
  const px=cx+Math.sin(yaw)*Math.cos(pitch)*dist;
  const py=cy+Math.sin(pitch)*dist;
  const pz=cz+Math.cos(yaw)*Math.cos(pitch)*dist;
  const rx=x-px,ry=y-py,rz=z-pz;
  const right=rx*Math.cos(yaw)-rz*Math.sin(yaw);
  const up=-rx*Math.sin(yaw)*Math.sin(pitch)+ry*Math.cos(pitch)-
    rz*Math.cos(yaw)*Math.sin(pitch);
  const forward=-rx*Math.sin(yaw)*Math.cos(pitch)-ry*Math.sin(pitch)-
    rz*Math.cos(yaw)*Math.cos(pitch);
  const size=forward*Math.tan(41*Math.PI/360);
  return {x:w/2+right/(size*w/h)*w/2,y:h/2-up/size*h/2};
}
const cell=outdoorCellAt(7.25,-7.25);
const seed=newHousehold('2026-11-21');
seed.shop.credits=30000;
seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
seed.world.outdoors={...seed.world.outdoors,revision:seed.world.outdoors.revision+1,
  pools:[{poolId:'pool-1',cells:Array.from({length:16},(_,i)=>
    cell+Math.floor(i/4)*64+i%4).sort((a,b)=>a-b)}],
  poolFixtures:[{fixtureId:'fixture-1',poolId:'pool-1',kind:'ladder',
    edgeCell:cell,side:'west',purchasePriceCredits:120}]};
const plan=beginPoolSwim(seed,'alex',{actionId:'swim',poolId:'pool-1'});
assert.ok(plan,'browser fixture needs real safe path and wet slots');
seed.position={...plan.action.dryApproach};
assert.equal(arrivePoolApproach(seed,'alex'),true);
for(let i=0;i<25&&seed.action?.stage!=='swimming';i++)tickHousehold(seed,1);
assert.equal(seed.action?.stage,'swimming','save must contain an actually swimming resident');
// Existing v1 loader intentionally starts unpaused even when the save had
// paused=true. Exercise a real UI pause immediately after the splash instead.
// This keeps WebGL assertions deterministic without changing save semantics.
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const errors=[];
try{
  for(const [w,h] of [[390,844],[375,667],[320,568],[844,390]]){
    const context=await browser.newContext({viewport:{width:w,height:h},
      deviceScaleFactor:1,hasTouch:true,isMobile:true});
    await context.addInitScript(({key,record,tourKey})=>{
      localStorage.setItem(key,JSON.stringify(record));
      localStorage.setItem(tourKey,'done');
    },{key:SAVE_KEY,record:seed,tourKey:UI_TOUR_STORAGE_KEY});
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push(w+'x'+h+': '+e.message));
    page.on('crash',()=>errors.push(w+'x'+h+': WebGL crashed'));
    await page.goto('http://127.0.0.1:8765/?pool=qa',{waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:80000});
    await page.locator('#pause-btn').click();
    // The outdoor camera shows the complete shore; no construction is mutated.
    await page.locator('#home-open').click();
    await page.locator('#home-outdoors').click();
    await page.locator('#outdoor-category').selectOption('pool');
    await page.locator('#outdoor-exit').click();
    await page.waitForFunction(()=>{
      const snap=window.__LifeSimSwimVisualQA?.().alex;
      return snap?.stage==='swimming'&&snap.pose&&
        Math.hypot(snap.avatar.x-snap.pose.x,snap.avatar.y-snap.pose.y,
          snap.avatar.z-snap.pose.z)<.15;
    },{timeout:20000});
    const visual=await page.evaluate(()=>window.__LifeSimSwimVisualQA());
    assert.equal(visual.alex.paused,true,'user pause holds swimming while inspecting WebGL');
    assert.equal(visual.alex.pose.stage,'swimming');
    // Resume real game time briefly, assert that canonical wet travel advances,
    // and pause again before taking an evidence screenshot.
    await page.locator('#pause-btn').click();
    await page.waitForFunction(before=>{
      const current=window.__LifeSimSwimVisualQA?.().alex;
      return current?.stage==='swimming'&&current.waterElapsed>before;
    },visual.alex.waterElapsed,{timeout:14000});
    await page.locator('#pause-btn').click();
    assert.ok(visual.alex.avatar.y<-.40,w+'x'+h+': avatar must be in water');
    assert.ok(Math.abs(visual.alex.avatar.x-seed.position.x)>.1,
      w+'x'+h+': not dry walking anchor');
    const rect=await page.locator('#game-canvas').evaluate(canvas=>{
      const b=canvas.getBoundingClientRect();
      return {x:b.left,y:b.top,width:b.width,height:b.height};
    });
    const pos=projectGround(rect.width,rect.height,8.1,-6.4);
    assert.ok(pos.x>8&&pos.x<rect.width-8&&pos.y>8&&pos.y<rect.height-8,
      'water point visible '+w+'x'+h);
    await page.evaluate(({pos,rect})=>{
      const canvas=document.getElementById('game-canvas');
      for(const type of ['pointerdown','pointerup']){
        const target=type==='pointerdown'?canvas:window;
        target.dispatchEvent(new PointerEvent(type,{
          pointerId:171,pointerType:'touch',isPrimary:true,bubbles:true,
          cancelable:true,clientX:rect.x+pos.x,clientY:rect.y+pos.y,
          button:0,buttons:type==='pointerdown'?1:0
        }));
      }
    },{pos,rect});
    await page.locator('#ground-walk-menu').waitFor({state:'visible',timeout:8000});
    assert.match(await page.locator('#ground-walk-title').textContent(),/Бассейн/);
    assert.match(await page.locator('#ground-walk-primary-reason').textContent(),/уже плавает/);
    assert.equal(await page.locator('#ground-walk-action').isDisabled(),true);
    await page.screenshot({path:`artifacts/lot-d2c/swim-${w}x${h}.png`,
      animations:'disabled'});
    const cancel=page.locator('#ground-walk-more button').filter({hasText:'Прервать плавание'});
    assert.equal(await cancel.count(),1);
    await cancel.click();
    const updated=await page.evaluate(()=>window.__LifeSimSwimVisualQA());
    assert.ok(['exiting','recovering'].includes(updated.alex.stage),
      'water cancellation must request safe route, not delete swimmer');
    await context.close();
  }
  assert.deepEqual(errors,[],'no JS crash during four WebGL water renders');
  console.log('LOT-D2c: four mobile WebGL swimming screenshots, touch, safe exits OK');
}finally{await browser.close();}
