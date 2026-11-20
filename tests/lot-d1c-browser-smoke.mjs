/** LOT-D1c: four real SwiftShader PlayCanvas mobile-size touch and v1 save QA. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

function projectGround(w,h,x,z,y=-.53){
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
const seed=newHousehold('2026-11-20');
seed.shop.credits=30000;
seed.minutes=21*60;seed.otherSim.minutes=seed.minutes;
seed.paused=true;seed.otherSim.paused=true;
seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
try{
  for(const [w,h] of [[390,844],[375,667],[320,568],[844,390]]){
    const context=await browser.newContext({viewport:{width:w,height:h},
      deviceScaleFactor:1,hasTouch:true,isMobile:true});
    await context.addInitScript(({key,record,tourKey})=>{
      if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
      localStorage.setItem(tourKey,'done');
    },{key:SAVE_KEY,record:seed,tourKey:UI_TOUR_STORAGE_KEY});
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push(w+'x'+h+': '+e.message));
    page.on('crash',()=>errors.push(w+'x'+h+': renderer crashed'));
    await page.goto('http://127.0.0.1:8765/?pool=qa',{waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
    await page.locator('#home-open').click();
    await page.locator('#home-outdoors').click();
    await page.locator('#outdoor-category').selectOption('pool');
    assert.equal(await page.locator('#pool-controls').isVisible(),true);
    const rect=await page.locator('#game-canvas').evaluate(canvas=>{
      const b=canvas.getBoundingClientRect();
      return {x:b.left,y:b.top,width:b.width,height:b.height};
    });
    const touch=async(from,to=from)=>{
      const a=projectGround(rect.width,rect.height,...from);
      const b=projectGround(rect.width,rect.height,...to);
      for(const p of [a,b])
        assert.ok(p.x>6&&p.x<rect.width-6&&p.y>6&&p.y<rect.height-6,
          w+'x'+h+': touch point outside canvas '+JSON.stringify(p));
      await page.evaluate(({a,b,rect})=>{
        const canvas=document.getElementById('game-canvas');
        const send=(target,type,p)=>target.dispatchEvent(new PointerEvent(type,{
          pointerId:151,pointerType:'touch',isPrimary:true,bubbles:true,
          cancelable:true,clientX:rect.x+p.x,clientY:rect.y+p.y,
          button:0,buttons:type==='pointerup'?0:1}));
        send(canvas,'pointerdown',a);
        if(a.x!==b.x||a.y!==b.y)send(window,'pointermove',b);
        send(window,'pointerup',b);
      },{a,b,rect});
    };
    await touch([7.25,-7.25],[8.25,-6.25]);
    await page.waitForFunction(()=>!document.getElementById('outdoor-apply').disabled,{timeout:8000});
    assert.match(await page.locator('#outdoor-preview-text').textContent(),/площадь/);
    await page.locator('#outdoor-apply').click();
    let saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(saved.version,1);
    assert.equal(saved.world.outdoors.pools.length,1);
    assert.equal(saved.world.outdoors.pools[0].cells.length,9);
    assert.equal(saved.shop.credits,30000-757);
    const geometry=await page.evaluate(()=>window.__LifeSimPoolVisualStats?.());
    assert.equal(geometry?.hasPool,true,w+'x'+h+': visual water aperture');
    assert.equal(geometry?.meshCount,5,w+'x'+h+': five batched mesh categories');
    await page.locator('#pool-tool').selectOption('ladder');
    await touch([6.98,-6.75]);
    await page.waitForFunction(()=>!document.getElementById('outdoor-apply').disabled,{timeout:8000});
    await page.locator('#outdoor-apply').click();
    saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(saved.world.outdoors.poolFixtures.length,1);
    assert.equal(saved.world.outdoors.poolFixtures[0].kind,'ladder');
    assert.equal(saved.shop.credits,30000-757-120);
    await page.locator('#pool-fixture-operation').selectOption('fixture-remove');
    await page.waitForFunction(()=>!document.getElementById('outdoor-apply').disabled,{timeout:8000});
    await page.locator('#outdoor-apply').click();
    saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(saved.world.outdoors.poolFixtures.length,0);
    assert.equal(saved.shop.credits,30000-757-120+84);
    await page.locator('#outdoor-undo').click();
    saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(saved.world.outdoors.poolFixtures.length,1);
    assert.equal(saved.shop.credits,30000-757-120+84-120);
    await page.locator('#outdoor-redo').click();
    saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(saved.world.outdoors.poolFixtures.length,0);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
    assert.equal(await page.evaluate(key=>
      JSON.parse(localStorage.getItem(key))?.world?.outdoors?.pools?.[0]?.cells?.length,
      SAVE_KEY),9);
    assert.equal((await page.evaluate(()=>window.__LifeSimPoolVisualStats?.()))?.hasPool,true);
    // The reload restores CAMERA_INITIAL (center 0, pitch 47, distance 16.9).
    // projectGround() above is intentionally calibrated to the OUTDOOR camera
    // (center 7, pitch 60, distance 43). Re-enter and leave outdoor mode
    // without editing to establish that same real camera before world tapping.
    // A screen coordinate from the build camera must not be reused after reload.
    await page.locator('#home-open').click();
    await page.locator('#home-outdoors').click();
    await page.locator('#outdoor-category').selectOption('pool');
    await page.locator('#outdoor-exit').click();
    await page.waitForTimeout(180); // one real camera render frame on slow CI
    // In Life mode water is picked as water, never offered as a land waypoint.
    // D1c does not enqueue a fake swimming action before the separate D2 stage.
    await touch([7.75,-6.75]);
    await page.locator('#ground-walk-menu').waitFor({state:'visible',timeout:8000});
    assert.match(await page.locator('#ground-walk-title').textContent(),/Бассейн/);
    assert.equal(await page.locator('#ground-walk-action').isDisabled(),true);
    await page.locator('#ground-walk-close').click();
    await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log('LOT-D1c four PlayCanvas touch viewports, safe refunds, undo and v1 restore OK');
}finally{await browser.close();}
