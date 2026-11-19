/** LOT-B1: four real mobile-size PlayCanvas/WebGL paint-to-buy flows. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

function projectGround(w,h,x,z){
  const yaw=42*Math.PI/180,pitch=60*Math.PI/180,dist=43;
  const cx=7,cy=.62,cz=0,y=-.53;
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
const seed=newHousehold('2026-11-19');
seed.paused=true;seed.otherSim.paused=true;
seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
const errors=[];
try{
  for(const [w,h] of [[390,844],[375,667],[320,568],[844,390]]){
    const context=await browser.newContext({viewport:{width:w,height:h},
      deviceScaleFactor:1,hasTouch:true,isMobile:true});
    await context.addInitScript(({key,record,tourKey})=>{
      if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
      localStorage.setItem(tourKey,'done');
    },{key:SAVE_KEY,record:seed,tourKey:UI_TOUR_STORAGE_KEY});
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push(w+'x'+h+' page: '+e.message));
    page.on('crash',()=>errors.push(w+'x'+h+' crash'));
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
    await page.locator('#home-open').click();
    await page.locator('#home-outdoors').click();
    assert.equal(await page.locator('#outdoor-editor').isVisible(),true,
      'Home > Lot editor must be available');
    assert.equal(await page.locator('#outdoor-apply').isDisabled(),true);
    await page.locator('#outdoor-ground-kind').selectOption('stone');
    await page.waitForTimeout(260); // settle the actual camera view and Safari layout
    const rect=await page.locator('#game-canvas').evaluate(node=>{
      const r=node.getBoundingClientRect();
      return {x:r.left,y:r.top,width:r.width,height:r.height};
    });
    const from=projectGround(rect.width,rect.height,7,-7);
    const to=projectGround(rect.width,rect.height,8,-6);
    assert.ok(from.x>9&&from.y>9&&from.x<rect.width-9&&from.y<rect.height-9,
      'Projected real grass gesture must be on the actual canvas');
    const p1={x:rect.x+from.x,y:rect.y+from.y};
    const p2={x:rect.x+to.x,y:rect.y+to.y};
    await page.evaluate(({p1,p2})=>{
      const canvas=document.querySelector('#game-canvas');
      const send=(target,type,p)=>target.dispatchEvent(new PointerEvent(type,{
        pointerId:93,pointerType:'touch',isPrimary:true,bubbles:true,
        cancelable:true,clientX:p.x,clientY:p.y,button:0,buttons:type==='pointerup'?0:1
      }));
      send(canvas,'pointerdown',p1);
      send(window,'pointermove',p2);
      send(window,'pointerup',p2);
    },{p1,p2});
    await page.waitForFunction(()=>!document.getElementById('outdoor-apply').disabled,{timeout:8000});
    assert.match(await page.locator('#outdoor-preview-text').innerText(),/Выбрано/);
    await page.locator('#outdoor-apply').click();
    const save=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.ok(save.world.outdoors.ground.length>0,'Physical brush creates paid terrain cells');
    assert.ok(save.shop.credits<seed.shop.credits,'One wallet was charged exactly once');
    assert.equal(save.financialHistory.entries.at(-1).kind,'purchase');
    assert.equal(await page.locator('#outdoor-undo').isEnabled(),true);
    await page.locator('#outdoor-undo').click();
    const undone=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(undone.shop.credits,seed.shop.credits,'Undo restores only this purchase');
    assert.equal(undone.world.outdoors.ground.length,0);
    assert.equal(undone.financialHistory.entries.at(-1).kind,'undo');
    await page.locator('#outdoor-redo').click();
    const redone=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(redone.shop.credits,save.shop.credits);
    assert.equal(redone.world.outdoors.ground.length,save.world.outdoors.ground.length);
    assert.equal(redone.financialHistory.entries.at(-1).kind,'redo');
    await page.locator('#outdoor-exit').click();
    assert.equal(await page.locator('#outdoor-editor').isVisible(),false);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
    const recovered=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(recovered.shop.credits,redone.shop.credits);
    assert.equal(recovered.world.outdoors.ground.length,redone.world.outdoors.ground.length);
    await page.screenshot({path:`lot-b1-${w}x${h}.png`});
    await context.close();
  }
}finally{await browser.close();}
assert.deepEqual(errors,[],'No JavaScript or WebGL page errors');
console.log('LOT-B1 real WebGL paint, finance, undo/redo and reload: 4 mobile viewports PASS');
