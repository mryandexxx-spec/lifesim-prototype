/** LOT-B2: four real mobile-size PlayCanvas/WebGL plant purchases and returns. */
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
    await page.locator('#outdoor-category').selectOption('plants');
    await page.locator('#outdoor-feature-kind').selectOption('tree.round');
    await page.waitForTimeout(280);
    const rect=await page.locator('#game-canvas').evaluate(node=>{
      const r=node.getBoundingClientRect();
      return {x:r.left,y:r.top,width:r.width,height:r.height};
    });
    const loc=projectGround(rect.width,rect.height,7,-7);
    assert.ok(loc.x>8&&loc.x<rect.width-8&&loc.y>8&&loc.y<rect.height-8,
      'Outdoor target projected inside canvas');
    const point={x:rect.x+loc.x,y:rect.y+loc.y};
    await page.evaluate(p=>{
      const canvas=document.querySelector('#game-canvas');
      const send=(target,type)=>target.dispatchEvent(new PointerEvent(type,{
        pointerId:94,pointerType:'touch',isPrimary:true,bubbles:true,
        cancelable:true,clientX:p.x,clientY:p.y,button:0,
        buttons:type==='pointerup'?0:1
      }));
      send(canvas,'pointerdown');send(window,'pointerup');
    },point);
    await page.waitForFunction(()=>!document.getElementById('outdoor-apply').disabled,{timeout:8000});
    assert.match(await page.locator('#outdoor-preview-text').innerText(),/Место подходит/);
    await page.locator('#outdoor-apply').click();
    let saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(saved.world.outdoors.features.length,1,'tree is purchased in world');
    assert.equal(saved.world.outdoors.features[0].itemId,'tree.round');
    assert.equal(saved.financialHistory.entries.at(-1).kind,'purchase');
    assert.equal(saved.shop.credits,seed.shop.credits-220);
    await page.locator('#outdoor-feature-operation').selectOption('move');
    await page.locator('#outdoor-feature-rotate').click();
    await page.waitForFunction(()=>!document.getElementById('outdoor-apply').disabled,{timeout:8000});
    await page.locator('#outdoor-apply').click();
    saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(saved.world.outdoors.features[0].yaw,90,'real 90-degree rotation saved');
    assert.equal(saved.financialHistory.entries.length,1,'move has no fake money receipt');
    await page.locator('#outdoor-feature-operation').selectOption('sell');
    await page.waitForFunction(()=>!document.getElementById('outdoor-apply').disabled,{timeout:8000});
    await page.locator('#outdoor-apply').click();
    saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(saved.world.outdoors.features.length,0);
    assert.equal(saved.shop.credits,seed.shop.credits-66,'70% of paid tree price returned');
    assert.equal(saved.financialHistory.entries.at(-1).kind,'sale');
    await page.locator('#outdoor-undo').click();
    let undo=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(undo.world.outdoors.features.length,1);
    assert.equal(undo.shop.credits,seed.shop.credits-220);
    await page.locator('#outdoor-redo').click();
    const redo=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(redo.world.outdoors.features.length,0);
    assert.equal(redo.shop.credits,seed.shop.credits-66);
    await page.locator('#outdoor-exit').click();
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
    const reloaded=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(reloaded.shop.credits,redo.shop.credits);
    assert.equal(reloaded.world.outdoors.features.length,0);
    await page.screenshot({path:`lot-b2-${w}x${h}.png`});
    await context.close();
  }
}finally{await browser.close();}
assert.deepEqual(errors,[],'No JavaScript or WebGL page errors');
console.log('LOT-B2 real WebGL 3D vegetation, move, sell and undo/redo: four viewports PASS');
