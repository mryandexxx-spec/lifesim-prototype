/** Paired real PlayCanvas runtime qualification, not physical-device acceptance.
 * The only injected game state is a frozen v1 starting fixture. Existing QA
 * readers observe state; real touch starts, pauses and changes time speed.
 * The storage fault intentionally targets only the ordinary v1 write. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
import {newHousehold,loadHousehold,getActor} from '../src/household.js';
import {newGame,SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
import {nearestWalkable} from '../src/navigation.js';
import {furnitureActionApproach,resolveActionFurniture} from '../src/furniture-catalog.js';
import {parkInterruptedAction} from '../src/action-queue.js';

const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(people){
  let root=newHousehold('2026-11-21');
  root.calendar.anchorConfirmed=true;
  root.minutes=800;
  root.speed=1;
  if(people===4){
    root.population={schema:1,nextResidentSerial:5,residentsById:{},
      linksByResident:{alex:{familyId:'family_1',dwellingId:'dwelling_1'},
        mira:{familyId:'family_1',dwellingId:'dwelling_1'}},kinship:[]};
    for(const [i,id] of ['resident_3','resident_4'].entries()){
      const actor=newGame(),name=i?'Игорь':'Вера';
      actor.personality.name=name;
      actor.position=nearestWalkable({x:i?3.5:-3.2,z:2.6},root.world);
      root.population.residentsById[id]={id,identity:{firstName:name,lastName:'Тестовая',lifeStage:'adult'},actor};
      root.population.linksByResident[id]={familyId:'family_1',dwellingId:'dwelling_1'};
    }
  }
  root=loadHousehold(clone(root));
  const ids=people===4?['alex','mira','resident_3','resident_4']:['alex','mira'];
  const target=people===4?'resident_3':'mira';
  root.autonomy.enabled=true;root.speed=1;
  for(const id of ids){
    const actor=getActor(root,id);
    actor.minutes=root.minutes;
    actor.autonomy.enabled=true;
    actor.autonomy.nextAt=480;
    for(const key of Object.keys(actor.needs))actor.needs[key]=95;
    actor.mind.memories=[];actor.mind.wish=null;
  }
  const actor=getActor(root,target);
  actor.needs.bladder=8;
  actor.position={...furnitureActionApproach(root.world,'toilet')};
  assert.ok(Number.isFinite(actor.position.x)&&Number.isFinite(actor.position.z));
  const fridge=resolveActionFurniture(root.world,'fridge');
  assert.ok(parkInterruptedAction(root.actionQueues,'alex',
    {type:'object',actionId:'fridge',targetInstanceId:fridge.instanceId},
    'resource-busy',root.minutes));
  return {root,target,ids};
}
const engineName=process.env.CARE_ENGINE,width=Number(process.env.CARE_WIDTH);
assert.ok(['chromium','webkit'].includes(engineName)&&[320,390].includes(width));
const height=width===320?568:844;
const dir='artifacts/care-browser';mkdirSync(dir,{recursive:true});
const browser=await (engineName==='chromium'?chromium:webkit).launch(engineName==='chromium'?
  {headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
    '--enable-unsafe-swiftshader','--disable-dev-shm-usage']}:{headless:true});
const results=[];
async function run(port,people,label){
  const {root,target,ids}=fixture(people);
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,
    isMobile:true,hasTouch:true,serviceWorkers:'block'});
  const errors=[];
  try{
    await context.addInitScript(({key,seed,tour})=>{
      if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));
      localStorage.setItem(tour,'done');
    },{key:SAVE_KEY,seed:root,tour:UI_TOUR_STORAGE_KEY});
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));page.on('crash',()=>errors.push('renderer crash'));
    const url='http://127.0.0.1:'+port+'/?pf-15=qa&furniture=qa&garden-start-paused=1';
    const boot=async()=>{
      await page.locator('#loading').waitFor({state:'hidden',timeout:100000});
      await page.waitForFunction(()=>typeof window.__LifeSimSpeedQA==='function');
      const graphic=await page.evaluate(async()=>{
        const {Application}=await import('playcanvas');
        const app=Application.getApplication();
        return Boolean(app?.graphicsDevice?.canvas);
      });
      assert.equal(graphic,true);
      assert.equal(await page.locator('#dashboard .resident-switch button').count(),people);
    };
    await page.goto(url,{waitUntil:'domcontentloaded'});await boot();
    const snap=()=>page.evaluate(()=>window.__LifeSimSpeedQA());
    const initial=await snap();assert.equal(initial.paused,true);
    assert.deepEqual(initial.residents.map(a=>a.id),ids);
    await page.waitForTimeout(500);
    assert.equal((await snap()).minutes,initial.minutes);
    await page.locator('#pause-btn').tap();
    await page.waitForFunction(at=>window.__LifeSimSpeedQA().minutes>at,initial.minutes,{timeout:15000});
    const normal=await snap();assert.equal(normal.manual,1);
    await page.locator('#speed-btn').tap();
    await page.waitForFunction(()=>window.__LifeSimSpeedQA().manual===3);
    await page.waitForFunction(at=>window.__LifeSimSpeedQA().minutes>at,normal.minutes,{timeout:15000});
    await page.waitForFunction(id=>window.__LifeSimSpeedQA().residents.some(a=>a.id===id&&a.action==='toilet'),
      target,{timeout:65000});
    const active=await snap();
    assert.equal(active.manual,3);
    await page.locator('#pause-btn').tap();
    await page.waitForFunction(()=>window.__LifeSimSpeedQA().paused===true);
    const paused=await snap();
    assert.equal(paused.residents.find(a=>a.id===target).action,'toilet');
    await page.waitForTimeout(400);assert.equal((await snap()).minutes,paused.minutes);
    // Exercise the existing save-on-pagehide route while deliberately failing
    // a real localStorage.setItem call. Restore the API before actual reload.
    const save=await page.evaluate(key=>{
      window.dispatchEvent(new Event('pagehide'));
      const before=localStorage.getItem(key),native=Storage.prototype.setItem;
      let writes=0;
      try{
        Storage.prototype.setItem=function(k,v){
          if(k===key){writes++;throw new DOMException('fixture quota','QuotaExceededError');}
          return native.call(this,k,v);
        };
        window.dispatchEvent(new Event('pagehide'));
      }finally{Storage.prototype.setItem=native;}
      const unchanged=before===localStorage.getItem(key);
      window.dispatchEvent(new Event('pagehide'));
      return {writes,unchanged,record:JSON.parse(localStorage.getItem(key))};
    },SAVE_KEY);
    assert.ok(save.writes>0);assert.equal(save.unchanged,true);
    const persisted=target==='mira'?save.record.otherSim:save.record.population.residentsById[target].actor;
    assert.equal(persisted.action.id,'toilet');
    assert.equal(save.record.version,1);
    assert.deepEqual(save.record.actionQueues.blockedByResident.alex,root.actionQueues.blockedByResident.alex);
    await page.reload({waitUntil:'domcontentloaded'});await boot();
    const restored=await snap();
    assert.equal(restored.paused,true);
    assert.equal(restored.residents.find(a=>a.id===target).action,'toilet');
    const stored=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY));
    assert.deepEqual(stored.actionQueues.blockedByResident.alex,root.actionQueues.blockedByResident.alex);
    assert.deepEqual(errors,[]);
    const comparison={ids,target,action:'toilet',normal:true,accelerated:true,paused:true,
      activeReload:true,parked:stored.actionQueues.blockedByResident.alex.length,
      storageFailurePreserved:true,version:stored.version};
    results.push({label,people,comparison,initial,normal,active,paused,restored});
    await page.screenshot({path:dir+'/'+label+'-'+people+'.png'});
    return comparison;
  }finally{await context.close();}
}
try{
  for(const people of [2,4]){
    const baseline=await run(8766,people,'baseline');
    const candidate=await run(8765,people,'candidate');
    assert.deepEqual(candidate,baseline);
    console.log('Matched real runtime '+engineName+' '+width+' '+people+' residents '+JSON.stringify(candidate));
  }
}finally{
  writeFileSync(dir+'/report.json',JSON.stringify({engineName,width,height,results},null,2));
  await browser.close();
}
