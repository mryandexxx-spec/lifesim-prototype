/** LOT-B3: four real mobile-size PlayCanvas/WebGL garden and rest queue QA. */
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
const seed=newHousehold('2026-11-19');
seed.minutes=21*60;seed.otherSim.minutes=seed.minutes;
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
    await page.locator('#outdoor-category').selectOption('objects');
    await page.locator('#outdoor-feature-kind').selectOption('garden.bench');
    await page.waitForTimeout(300);
    const rect=await page.locator('#game-canvas').evaluate(node=>{
      const r=node.getBoundingClientRect();
      return {x:r.left,y:r.top,width:r.width,height:r.height};
    });
    const touch=async(x,z,y=-.53)=>{
      const hit=projectGround(rect.width,rect.height,x,z,y);
      assert.ok(hit.x>8&&hit.x<rect.width-8&&hit.y>8&&hit.y<rect.height-8,
        'Outdoor 3D point must be on visible canvas');
      const point={x:rect.x+hit.x,y:rect.y+hit.y};
      await page.evaluate(p=>{
        const canvas=document.querySelector('#game-canvas');
        const send=(target,type)=>target.dispatchEvent(new PointerEvent(type,{
          pointerId:99,pointerType:'touch',isPrimary:true,bubbles:true,
          cancelable:true,clientX:p.x,clientY:p.y,button:0,
          buttons:type==='pointerup'?0:1
        }));
        send(canvas,'pointerdown');send(window,'pointerup');
      },point);
    };
    await touch(7,-7);
    await page.waitForFunction(()=>!document.getElementById('outdoor-apply').disabled,{timeout:8000});
    await page.locator('#outdoor-apply').click();
    let saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(saved.world.outdoors.features.length,1);
    assert.equal(saved.world.outdoors.features[0].itemId,'garden.bench');
    assert.equal(saved.shop.credits,seed.shop.credits-240);
    await page.locator('#outdoor-feature-kind').selectOption('light.standing');
    await touch(8,-9);
    await page.waitForFunction(()=>!document.getElementById('outdoor-apply').disabled,{timeout:8000});
    await page.locator('#outdoor-apply').click();
    saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(saved.world.outdoors.features.length,2);
    assert.equal(saved.world.outdoors.features[1].itemId,'light.standing');
    assert.equal(saved.shop.credits,seed.shop.credits-420);
    assert.equal(saved.financialHistory.entries.length,2);
    await page.locator('#outdoor-exit').click();
    // Physical bench: FIRST the popup, never automatic seating/queue changes.
    // Cancel must leave the previous task order and needs untouched.
    await touch(7,-7);
    await page.locator('#ground-walk-menu').waitFor({state:'visible',timeout:8000});
    assert.match(await page.locator('#ground-walk-title').textContent(),/скамейка/i);
    assert.match(await page.locator('#ground-walk-action-label').textContent(),/Отдохнуть/);
    let beforeAction=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(beforeAction.actionQueues.byResident.alex.length,0,
      'Bench tap must not queue seating until the player confirms');
    await page.locator('#ground-walk-close').click();
    assert.equal(await page.locator('#ground-walk-menu').isVisible(),false);
    await touch(7,-7);
    await page.locator('#ground-walk-menu').waitFor({state:'visible',timeout:8000});
    await page.locator('#ground-walk-action').click();
    await page.waitForFunction(key=>{
      const save=JSON.parse(localStorage.getItem(key));
      return (save.actionQueues?.byResident?.alex||[]).some(t=>t.type==='outdoor')||
        (save.action?.id==='bench'&&save.action?.automatic===false&&
          save.action?.targetInstanceId==='out-1');
    },SAVE_KEY,{timeout:8000});
    const queued=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    const pickedBench=queued.actionQueues.byResident.alex.find(t=>t.type==='outdoor');
    const runningBench=queued.action?.id==='bench'&&
      queued.action?.automatic===false?queued.action:null;
    assert.equal(pickedBench?.instanceId||runningBench?.targetInstanceId,'out-1',
      'confirmed bench must be queued or already active, never lost');
    assert.ok(queued.needs.fun<=seed.needs.fun,'tapping bench cannot instantly reward Fun (normal time decay is allowed)');
    // A tall lamp is not a hidden walk-on-ground shortcut: its hit volume
    // opens the same action menu and only explicit confirmation appends MOVE.
    await touch(8,-9,1.35);
    await page.locator('#ground-walk-menu').waitFor({state:'visible',timeout:8000});
    assert.match(await page.locator('#ground-walk-title').textContent(),/фонарь/i);
    assert.match(await page.locator('#ground-walk-action-label').textContent(),/Подойти/);
    beforeAction=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    const activeBenchBeforeLamp=beforeAction.action?.id==='bench'&&
      beforeAction.action?.automatic===false&&
      beforeAction.action?.targetInstanceId==='out-1';
    assert.equal(beforeAction.actionQueues.byResident.alex.length+(activeBenchBeforeLamp?1:0),1,
      'Lamp tap cannot enqueue a movement before the player selects an action (bench may already be active)');
    await page.locator('#ground-walk-action').click();
    const afterLamp=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    const remaining=afterLamp.actionQueues.byResident.alex;
    const activeBench=afterLamp.action?.id==='bench'&&
      afterLamp.action?.automatic===false?afterLamp.action:null;
    const menuDebug=await page.evaluate(()=>({
      toast:document.getElementById('toast')?.textContent,
      feedback:document.getElementById('queue-feedback')?.textContent,
      popupHidden:document.getElementById('ground-walk-menu')?.hidden
    }));
    // A frame may dispatch the old bench between the two button clicks.
    // Count the active bench as the FIFO head rather than treating it as lost.
    assert.equal(remaining.length+(activeBench?1:0),2,
      'Lamp approach must append once; '+JSON.stringify({
        pending:remaining,active:afterLamp.action,menuDebug}));
    if(activeBench){
      assert.equal(activeBench.targetInstanceId,'out-1');
      assert.equal(remaining[0]?.type,'move',
        'A running bench precedes the newly queued lamp approach');
    }else{
      assert.equal(remaining[0]?.type,'outdoor');
      assert.equal(remaining[1]?.type,'move',
        'Lamp approach appends behind the existing bench reservation');
    }
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
    const old=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(old.world.outdoors.features.length,2);
    // Reload may dispatch the FIFO head immediately. In that case the
    // exact saved target must already be the actively walking/resting bench.
    const queuedRest=old.actionQueues.byResident.alex.find(t=>t.type==='outdoor');
    const activeRest=old.action?.id==='bench'?old.action:null;
    assert.ok(queuedRest||activeRest,'rest must persist as FIFO or active action');
    assert.equal((queuedRest?.instanceId||activeRest?.targetInstanceId),'out-1');
    assert.equal(old.shop.credits,queued.shop.credits);
    await page.screenshot({path:`lot-b3-${w}x${h}.png`});
    await context.close();
  }
}finally{await browser.close();}
assert.deepEqual(errors,[],'No JavaScript or PlayCanvas/WebGL errors');
console.log('LOT-B3 real WebGL buying bench and standing lamp, night and persistent tapped rest: four viewports PASS');
