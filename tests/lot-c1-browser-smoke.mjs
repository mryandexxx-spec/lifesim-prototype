/** LOT-C1: real mobile PlayCanvas/WebGL startup, garden editor and saved stages. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {previewOutdoorFeatureEdit,commitOutdoorFeatureEdit} from '../src/outdoor-proposals.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
const root=newHousehold('2026-11-20');
root.paused=true;root.otherSim.paused=true;
root.autonomy.enabled=false;root.otherSim.autonomy.enabled=false;
const preview=previewOutdoorFeatureEdit(root,{operation:'place',
  itemId:'garden.flower.calendula',pose:{x:8,z:-7,yaw:0}});
assert.ok(preview.ok,preview.reason);
const seed=commitOutdoorFeatureEdit(root,preview).root;
const bed=seed.world.outdoors.features.find(f=>f.itemId==='garden.flower.calendula');
seed.world.outdoors.gardens[bed.instanceId].progressWetMinutes=2880;
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
try {
  for(const [w,h] of [[390,844],[375,667],[320,568],[844,390]]){
    const context=await browser.newContext({viewport:{width:w,height:h},
      deviceScaleFactor:1,hasTouch:true,isMobile:true});
    await context.addInitScript(({key,root,tour})=>{
      if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(root));
      localStorage.setItem(tour,'done');
    },{key:SAVE_KEY,root:seed,tour:UI_TOUR_STORAGE_KEY});
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(w+'x'+h+': '+error.message));
    page.on('crash',()=>errors.push(w+'x'+h+': crashed'));
    const status=await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
    assert.equal(status.status(),200);
    await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
    const canvas=page.locator('#game-canvas');
    assert.equal(await canvas.isVisible(),true);
    await page.locator('#home-open').click();
    await page.locator('#home-outdoors').click();
    assert.equal(await page.locator('#outdoor-editor').isVisible(),true);
    await page.locator('#outdoor-category').selectOption('garden');
    assert.equal(await page.locator('#outdoor-feature-controls').isVisible(),true);
    for(const id of ['garden.flower.calendula','garden.flower.cornflower',
      'garden.herb.mint','garden.herb.melissa']){
      assert.ok(await page.locator('#outdoor-feature-kind option[value="'+id+'"]').count());
    }
    await page.locator('#outdoor-feature-operation').selectOption('move');
    const stored=await page.locator('#outdoor-feature-owned option').allTextContents();
    assert.ok(stored.some(label=>label.includes('Календула')));
    await page.locator('#outdoor-exit').click();
    assert.equal(await page.locator('#outdoor-editor').isVisible(),false);
    const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(saved.world.outdoors.gardens[bed.instanceId].progressWetMinutes,2880);
    // Exercise real canvas touch -> contextual status -> confirmed garden FIFO.
    const canvasRect=await canvas.evaluate(node=>{
      const r=node.getBoundingClientRect();
      return {x:r.left,y:r.top,width:r.width,height:r.height};
    });
    const pt=projected(canvasRect.width,canvasRect.height,bed.x,bed.z);
    assert.ok(pt.x>8&&pt.x<canvasRect.width-8&&pt.y>8&&pt.y<canvasRect.height-8,
      'the garden must be tappable inside the visible mobile canvas');
    const tap=async()=>{
      await page.evaluate(pos=>{
        const el=document.getElementById('game-canvas');
        const send=(target,type)=>target.dispatchEvent(new PointerEvent(type,{
          pointerId:93,pointerType:'touch',isPrimary:true,bubbles:true,cancelable:true,
          clientX:pos.x,clientY:pos.y,button:0,buttons:type==='pointerup'?0:1
        }));
        send(el,'pointerdown');send(window,'pointerup');
      },{x:canvasRect.x+pt.x,y:canvasRect.y+pt.y});
    };
    await tap();
    await page.locator('#ground-walk-menu').waitFor({state:'visible',timeout:8000});
    assert.match(await page.locator('#ground-walk-title').textContent(),/Календула/);
    assert.match(await page.locator('#ground-walk-info').textContent(),/48\/72 ч роста/);
    // C2c may promote an exact-plot inspect wish above watering. Both
    // actions must remain available through explicit confirmation.
    const primaryWater=(await page.locator('#ground-walk-action-label').textContent())
      .includes('Полить');
    if(!primaryWater)assert.equal(await page.locator(
      '#ground-walk-more [data-garden-action="water"]').isEnabled(),true);
    let persisted=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(persisted.actionQueues.byResident.alex.length,0,
      'tap only opens garden menu, no action started');
    await page.locator('#ground-walk-close').click();
    assert.equal((await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY))
      .actionQueues.byResident.alex.length,0,
      'dismissal must not queue garden care');
    await tap();
    await page.locator('#ground-walk-menu').waitFor({state:'visible',timeout:8000});
    if(primaryWater)await page.locator('#ground-walk-action').click();
    else await page.locator('#ground-walk-more [data-garden-action="water"]').click();
    await page.waitForFunction(key=>{
      const state=JSON.parse(localStorage.getItem(key));
      return state.actionQueues?.byResident?.alex?.some(
        x=>x.type==='garden'&&x.actionId==='water')||
        (state.action?.id==='garden'&&state.action?.gardenActionId==='water');
    },SAVE_KEY,{timeout:8000});
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
    persisted=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(persisted.world.outdoors.gardens[bed.instanceId].progressWetMinutes,2880);
    assert.ok(persisted.actionQueues.byResident.alex.some(
      x=>x.type==='garden'&&x.actionId==='water')||
      persisted.action?.id==='garden','confirmed action must survive reload');
    await page.screenshot({path:'lot-c1-'+w+'x'+h+'.png'});
    await context.close();
  }
  assert.deepEqual(errors,[],errors.join(' | '));
  console.log('LOT-C1 4-size WebGL: garden editor, 3D tap, status popup, explicit FIFO and reload PASS.');
}finally{await browser.close();}
