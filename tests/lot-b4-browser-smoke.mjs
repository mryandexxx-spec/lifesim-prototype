/** LOT-B4: mixed outdoor surfaces/objects and context-only queues, real WebGL at 4 mobile sizes. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {previewOutdoorPaint,commitOutdoorPreview,
  previewOutdoorFeatureEdit,commitOutdoorFeatureEdit} from '../src/outdoor-proposals.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const seed=newHousehold('2026-11-19');
seed.paused=true;seed.otherSim.paused=true;
seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
const paint=previewOutdoorPaint(seed,{from:{x:5,z:-8},to:{x:5,z:-8},kind:'stone'});
assert.ok(paint.ok,paint.reason);
let household=commitOutdoorPreview(seed,paint).root;
for(const [itemId,x,z] of [
  ['garden.bench',7,-7],['light.path',8,-9],['flower.daisy',6,-9]
]){
  const draft=previewOutdoorFeatureEdit(household,{
    operation:'place',itemId,pose:{x,z,yaw:0}});
  assert.ok(draft.ok,itemId+': '+draft.reason);
  const committed=commitOutdoorFeatureEdit(household,draft);
  assert.ok(committed.ok,itemId+': '+committed.reason);
  household=committed.root;
}
const originalCredits=household.shop.credits;
const originalEntries=household.financialHistory.entries.length;

function projected(w,h,x,z,y=-.53){
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
      if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
      localStorage.setItem(tourKey,'done');
    },{key:SAVE_KEY,record:household,tourKey:UI_TOUR_STORAGE_KEY});
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push(w+'x'+h+': '+e.message));
    page.on('crash',()=>errors.push(w+'x'+h+': page crashed'));
    const save=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
    await page.locator('#home-open').click();
    await page.locator('#home-outdoors').click();
    assert.equal(await page.locator('#outdoor-editor').isVisible(),true);
    await page.locator('#outdoor-category').selectOption('plants');
    await page.locator('#outdoor-feature-kind').selectOption('tree.round');
    await page.waitForTimeout(280);
    const rect=await page.locator('#game-canvas').evaluate(node=>{
      const r=node.getBoundingClientRect();
      return {x:r.left,y:r.top,width:r.width,height:r.height};
    });
    const touch=async(x,z,y=-.53)=>{
      const p=projected(rect.width,rect.height,x,z,y);
      assert.ok(p.x>8&&p.x<rect.width-8&&p.y>8&&p.y<rect.height-8,
        'LOT-B4 projected point must be on visible mobile canvas');
      const point={x:rect.x+p.x,y:rect.y+p.y};
      await page.evaluate(q=>{
        const canvas=document.getElementById('game-canvas');
        const send=(target,type)=>target.dispatchEvent(new PointerEvent(type,{
          pointerId:97,pointerType:'touch',isPrimary:true,bubbles:true,
          cancelable:true,clientX:q.x,clientY:q.y,button:0,buttons:type==='pointerup'?0:1
        }));
        send(canvas,'pointerdown');send(window,'pointerup');
      },point);
    };
    await touch(9,-8);
    await page.waitForFunction(()=>!document.getElementById('outdoor-apply').disabled,
      {timeout:8000});
    await page.locator('#outdoor-apply').click();
    let state=await save();
    assert.equal(state.world.outdoors.features.length,4,'saved terrain and three prior outdoor SKUs survive purchase');
    assert.equal(state.world.outdoors.ground.length,1,'old paid stone persists');
    assert.equal(state.shop.credits,originalCredits-220,'new tree charged once');
    assert.equal(state.financialHistory.entries.length,originalEntries+1);
    assert.deepEqual(state.world.outdoors.features.map(x=>x.itemId),
      ['garden.bench','light.path','flower.daisy','tree.round']);
    await page.locator('#outdoor-exit').click();
    // Touching a functional object must only offer an action, never trigger it.
    await touch(7,-7);
    await page.locator('#ground-walk-menu').waitFor({state:'visible',timeout:8000});
    assert.match(await page.locator('#ground-walk-action-label').textContent(),/Отдохнуть/);
    state=await save();
    assert.equal(state.actionQueues.byResident.alex.length,0,'tap alone cannot enqueue');
    await page.locator('#ground-walk-close').click();
    assert.equal((await save()).actionQueues.byResident.alex.length,0,'cancel is side-effect free');
    await touch(7,-7);
    await page.locator('#ground-walk-menu').waitFor({state:'visible',timeout:8000});
    await page.locator('#ground-walk-action').click();
    await page.waitForFunction(key=>{
      const root=JSON.parse(localStorage.getItem(key));
      return root.actionQueues?.byResident?.alex?.some(x=>x.type==='outdoor')||
        root.action?.id==='bench';
    },SAVE_KEY,{timeout:8000});
    state=await save();
    const before=state.actionQueues.byResident.alex.length;
    // A cancelled gesture can never add a second movement, even over terrain.
    await page.evaluate(()=>{
      const canvas=document.getElementById('game-canvas');
      const options={pointerId:98,pointerType:'touch',isPrimary:true,bubbles:true,
        cancelable:true,clientX:105,clientY:125,button:0,buttons:1};
      canvas.dispatchEvent(new PointerEvent('pointerdown',options));
      window.dispatchEvent(new PointerEvent('pointercancel',{...options,buttons:0}));
    });
    assert.equal((await save()).actionQueues.byResident.alex.length,before,
      'pointercancel must not append commands');
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
    const restored=await save();
    assert.equal(restored.world.outdoors.features.length,4);
    assert.equal(restored.world.outdoors.ground.length,1);
    assert.equal(restored.shop.credits,originalCredits-220);
    assert.ok(restored.actionQueues.byResident.alex.some(x=>x.type==='outdoor')||
      restored.action?.id==='bench','chosen bench action survives reload');
    await page.screenshot({path:`lot-b4-${w}x${h}.png`});
    await context.close();
  }
}finally{await browser.close();}
assert.deepEqual(errors,[],'No page/PlayCanvas/WebGL errors');
console.log('LOT-B4 integrated mixed terrain, decor, purchase, popup, gesture and reload: four mobile viewports PASS');
