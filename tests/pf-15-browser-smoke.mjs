import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
import {newHousehold,chooseResidentAction,bedDestinationFor} from '../src/household.js';
import {arrive,SAVE_KEY} from '../src/simulation.js';
import {hireCareer} from '../src/career-state.js';
import {progressCareerWork,arriveCareerPortal} from '../src/career-work.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
function seedFor(mode){
 const root=newHousehold('2026-11-16');
 root.calendar.anchorConfirmed=true;
 root.autonomy.enabled=false;root.otherSim.autonomy.enabled=false;
 if(mode==='sleep'){
  for(const [id,actor,energy] of [['alex',root,97],['mira',root.otherSim,45]]){
   assert.ok(chooseResidentAction(root,'bed',false,id));
   actor.position=bedDestinationFor(root,id);actor.needs.energy=energy;arrive(actor);
   actor.action.elapsed=60;
  }
 }else{
  root.careerSystem=hireCareer(root.careerSystem,'alex','city-services',400);
  root.careerSystem=hireCareer(root.careerSystem,'mira','editorial',400);
  for(const [id,start] of [['alex',480],['mira',540]]){
   root.minutes=start;root.otherSim.minutes=start;
   progressCareerWork(root,start-1,start);
   assert.ok(arriveCareerPortal(root,id,start));
   root.careerSystem.byResident[id].currentShift.incidentPlan={version:1,status:'none',rarity:null,dueAt:null,proofScenes:[]};
  }
  root.minutes=954;root.otherSim.minutes=954;
 }
 return root;
}
const dir='artifacts/pf-15';mkdirSync(dir,{recursive:true});const report=[];
for(const [engineName,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch(engineName==='chromium'?{headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']}:{headless:true});
 try{for(const [width,height] of [[390,844],[320,568]])for(const mode of ['sleep','work']){
  const label=engineName+'-'+width+'-'+mode,seed=seedFor(mode),result={label};report.push(result);
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:true,hasTouch:true,serviceWorkers:'block'});
  try{
   await context.addInitScript(({seed,key,tour})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));localStorage.setItem(tour,'done');},{seed,key:SAVE_KEY,tour:UI_TOUR_STORAGE_KEY});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('crash',()=>errors.push('crash'));
   await page.goto('http://127.0.0.1:8765/?pf-15=qa&furniture=qa&garden-start-paused=1',{waitUntil:'domcontentloaded'});
   await page.locator('#loading').waitFor({state:'hidden',timeout:100000});
   const snap=()=>page.evaluate(()=>window.__LifeSimSpeedQA());
   const initial=await snap();assert.equal(initial.paused,true);
   const matches=s=>s.residents.every(r=>mode==='sleep'?r.action==='bed'&&r.phase==='using':r.work==='working');
   assert.ok(matches(initial),JSON.stringify(initial));
   await page.locator('#pause-btn').tap();
   await page.waitForFunction(()=>document.querySelector('#speed-btn').textContent==='3×');
   const boosted=await snap();assert.ok(matches(boosted));assert.equal(boosted.manual,1);
   await page.screenshot({path:dir+'/'+label+'-boost.png'});
   await page.waitForFunction(mode=>{const s=window.__LifeSimSpeedQA();return s.residents.some(r=>mode==='sleep'?r.action!=='bed':r.work!=='working')&&document.querySelector('#speed-btn').textContent==='1×';},mode,{timeout:90000});
   const end=await snap();assert.ok(!matches(end));assert.ok(end.minutes>initial.minutes);
   if(mode==='work')assert.equal(end.settlements.length,1);
   if(mode==='sleep'){
    await page.locator('#speed-btn').tap();await page.waitForFunction(()=>document.querySelector('#speed-btn').textContent==='3×');
    assert.equal((await snap()).manual,3);
    await page.locator('#speed-btn').tap();await page.waitForFunction(()=>document.querySelector('#speed-btn').textContent==='1×');
   }
   await page.screenshot({path:dir+'/'+label+'-exit.png'});assert.deepEqual(errors,[]);
   Object.assign(result,{initial,boosted,end,passed:true});
  }catch(e){result.error=String(e.stack||e);throw e;}finally{writeFileSync(dir+'/report.json',JSON.stringify(report,null,2));await context.close();}
 }}finally{await browser.close();}
}
