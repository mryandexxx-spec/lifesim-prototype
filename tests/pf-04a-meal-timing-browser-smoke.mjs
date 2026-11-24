/** PF-04/A: real PlayCanvas phase timings in canonical game minutes. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold,chooseResidentAction} from '../src/household.js';
import {SAVE_KEY,ACTIONS} from '../src/simulation.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {diningSeatApproach,DINING_TAKE_MINUTES} from '../src/dining.js';
import {findPath} from '../src/navigation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
const length=(start,route)=>route.reduce((n,p,i)=>n+Math.hypot(p.x-(route[i-1]||start).x,p.z-(route[i-1]||start).z),0);
const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const report=[];
mkdirSync('artifacts/grill-r1',{recursive:true});
try{
  for(const [width,height,speed,id] of [[390,844,1,'alex'],[320,568,3,'mira']]){
    const seed=newHousehold('2026-11-24'),actor=id==='alex'?seed:seed.otherSim;
    seed.paused=true;seed.speed=speed;seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
    actor.needs.hunger=15;
    seed.kitchen.prepared=[{recipeId:'ready.sunny-grains',portions:1}];
    seed.world.furniture.instances.push(
      {instanceId:'pf-qa-table-901',prefabId:'diningtable',itemDefinitionId:'diningtable.farm',x:8,z:0,yaw:0,location:'home'},
      {instanceId:'pf-qa-chair-901',prefabId:'chair',itemDefinitionId:'chair.loft',x:8,z:2.25,yaw:0,location:'home'});
    assert.ok(chooseResidentAction(seed,'dining',false,id,'pf-qa-table-901',null,null,null,null,'ready.sunny-grains'));
    const fridge=furnitureActionApproach(seed.world,'fridge');
    const seat=diningSeatApproach(seed.world,actor.action.targetInstanceId,actor.action.diningSeatInstanceId);
    const legs=[length(actor.position,findPath(actor.position,fridge,seed.world)),length(fridge,findPath(fridge,seat,seed.world))];
    const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'});
    try{
      await context.addInitScript(({key,record,tour})=>{
        localStorage.setItem(key,JSON.stringify(record));localStorage.setItem(tour,'done');
      },{key:SAVE_KEY,record:seed,tour:UI_TOUR_STORAGE_KEY});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('crash',()=>errors.push('renderer crash'));
      await page.goto('http://127.0.0.1:8765/?pf-04a=qa',{waitUntil:'domcontentloaded'});
      await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
      assert.equal(await page.evaluate(()=>Boolean(document.querySelector('#game-canvas')?.getContext('webgl2')||document.querySelector('#game-canvas')?.getContext('webgl'))),true);
      const snapshot=()=>page.evaluate(id=>window.__LifeSimMealTimingQA(id),id);
      const initial=await snapshot();
      assert.equal(initial.stage,'toFridge');assert.equal(initial.speed,speed);assert.equal(initial.paused,true);
      await page.waitForTimeout(350);
      assert.deepEqual(await snapshot(),initial,'paused journey must not change state');
      await page.evaluate(id=>{
        const trace=[];let last;window.__pf04aTrace=trace;
        const frame=()=>{
          const s=window.__LifeSimMealTimingQA(id);
          if(s.stage!==last){last=s.stage;trace.push(s);}
          if(s.stage!==null)requestAnimationFrame(frame);
        };
        frame();
      },id);
      await page.locator('#pause-btn').tap();
      await page.waitForFunction(()=>window.__pf04aTrace.at(-1)?.stage===null,null,{timeout:120000});
      const trace=await page.evaluate(()=>window.__pf04aTrace);
      assert.deepEqual(trace.map(s=>s.stage),['toFridge','taking','toSeat','eating',null]);
      const times=trace.slice(1).map((s,i)=>s.minutes-trace[i].minutes);
      const baseline=legs.map(n=>n*3/1.65),target=legs.map(n=>n*3/2.2);
      assert.ok(times[0]<=target[0]+2.7,'fridge leg '+times[0]+' target '+target[0]);
      assert.ok(times[2]<=target[1]+3.6,'chair leg '+times[2]+' target '+target[1]);
      assert.ok(times[0]+times[2]<=baseline[0]+baseline[1]+.9,'combined walking must not exceed old path budget');
      assert.ok(Math.abs(times[1]-DINING_TAKE_MINUTES)<=1.8,'pickup '+times[1]);
      assert.ok(Math.abs(times[3]-ACTIONS.dining.duration)<=1.8,'meal '+times[3]);
      assert.ok(trace.slice(0,3).every(s=>s.portions===1),'no serving removed before arrival');
      const final=trace.at(-1);
      assert.equal(final.portions,0);assert.equal(final.dishes,initial.dishes+1);
      assert.equal(final.credits,initial.credits);assert.equal(final.receipts,initial.receipts);
      assert.ok(final.hunger>initial.hunger);
      assert.deepEqual(errors,[]);
      report.push({width,height,speed,id,legs,baseline:[baseline[0],6,baseline[1],31],actual:times});
      await page.screenshot({path:'artifacts/grill-r1/pf-04a-'+width+'.png'});
      console.log('PF-04/A PlayCanvas game minutes',JSON.stringify(report.at(-1)));
    }finally{await context.close();}
  }
}finally{
  writeFileSync('artifacts/grill-r1/pf-04a-timing.json',JSON.stringify(report,null,2));
  await browser.close();
}
