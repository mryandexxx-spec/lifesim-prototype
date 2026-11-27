/** Real mobile browser touch of the existing personal plan. Physical iPhone remains separate. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chromium,webkit} from 'playwright';
import {newHousehold,loadHousehold} from '../src/household.js';
import {newGame,SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
import {changeRecurringTask} from '../src/recurring-tasks.js';
import {findMarketPlacement,buyMarketItem} from '../src/furniture-shop.js';
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(process.env.GC_EXPECTED_SHA)assert.equal(sha,process.env.GC_EXPECTED_SHA);
const out='artifacts/gc-06-tasks';mkdirSync(out,{recursive:true});
const report={sha,cases:[],limitations:['emulated mobile touch, not physical iPhone','scripted navigation, no human interest/discovery verdict']};
const flush=()=>writeFileSync(out+'/report.json',JSON.stringify(report,null,2)+'\n');
function fixture(extra=false){
 const seed=newHousehold('2026-11-23');seed.calendar.anchorConfirmed=true;
 seed.autonomy.enabled=seed.otherSim.autonomy.enabled=false;
 const pose=findMarketPlacement(seed.world.furniture,seed.shop,'easel.starter');assert.ok(pose);
 const b=buyMarketItem(seed.world.furniture,seed.shop,'easel.starter',pose);assert.ok(b.ok);
 seed.world.furniture=b.world;seed.shop=b.shop;
 seed.createdWorks=[{id:'work:gc06-sale',ownerId:'alex',easelInstanceId:b.instanceId,contentId:'painting.hills',seed:123,quality:50,createdAt:seed.minutes,kind:'artwork',location:'inventory'}];
 if(extra){
  const actor=newGame();actor.position={x:1.2,z:1.2};
  seed.population={schema:1,nextResidentSerial:4,residentsById:{resident_3:{id:'resident_3',identity:{firstName:'Вера',lastName:'Тест',lifeStage:'adult'},actor}},linksByResident:Object.fromEntries(['alex','mira','resident_3'].map(id=>[id,{familyId:'family_1',dwellingId:'dwelling_1'}])),kinship:[]};
 }
 const root=loadHousehold(JSON.parse(JSON.stringify(seed)));
 for(let i=0;i<6&&root.recurringTasks.byResident.alex.day.kind!=='sale';i++)assert.ok(changeRecurringTask(root,'alex','day','replace'));
 assert.equal(root.recurringTasks.byResident.alex.day.kind,'sale');
 return root;
}
for(const [engine,launcher] of [['chromium',chromium],['webkit',webkit]]){
 for(const [width,height] of [[390,844],[320,568]]){
 const row={id:engine+'-'+width,engine,width,height,status:'OPEN',steps:[],errors:[]};report.cases.push(row);flush();
 let b,ctx,page;
 try{
  b=await launcher.launch(engine==='chromium'?{headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']}:{headless:true});
  ctx=await b.newContext({viewport:{width,height},deviceScaleFactor:1,hasTouch:true,isMobile:true,serviceWorkers:'block'});
  const extra=width===390&&engine==='chromium',seed=fixture(extra);
  await ctx.addInitScript(({key,record,tour})=>{
   if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
   localStorage.setItem(tour,'done');window.__gcTrace=[];
   for(const type of ['pointerdown','pointerup','pointercancel','touchstart','touchend','click'])window.addEventListener(type,e=>{
    const t=e.target?.closest?.('button,summary')||e.target;
    window.__gcTrace.push({type,trusted:e.isTrusted,pointerType:e.pointerType||null,id:t?.id||'',text:t?.textContent?.trim().slice(0,80)||'',at:performance.now()});
   },{capture:true,passive:true});
  },{key:SAVE_KEY,record:seed,tour:UI_TOUR_STORAGE_KEY});
  page=await ctx.newPage();page.on('pageerror',e=>row.errors.push(e.message));page.on('crash',()=>row.errors.push('renderer crash'));
  page.on('requestfailed',q=>{if(/\/(src|vendor)\//.test(q.url()))row.errors.push(q.url()+' '+q.failure()?.errorText);});
  const state=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY);
  const snap=s=>({shop:s.shop,finance:s.financialHistory,queues:s.actionQueues,skills:s.skills,otherSkills:s.otherSim.skills});
  const cards='#queue-recurring-cards';
  const day=cards+' [data-period="day"]',week=cards+' [data-period="week"]';
  const ready=async()=>{await page.locator('#loading').waitFor({state:'hidden',timeout:85000});await page.locator('#game-canvas').waitFor({state:'visible'});};
  async function tap(selector,principal=true){
   const el=page.locator(selector).first();await el.waitFor({state:'visible',timeout:12000});
   await el.scrollIntoViewIfNeeded();const box=await el.boundingBox();assert.ok(box,selector);
   if(principal)assert.ok(box.width>=43.5&&box.height>=43.5,selector+' below 44px '+JSON.stringify(box));
   const n=await page.evaluate(()=>window.__gcTrace.length);await el.tap({timeout:15000});
   const trace=await page.evaluate(n=>window.__gcTrace.slice(n),n);
   assert.ok(trace.some(e=>e.type==='touchstart'&&e.trusted),selector+' no trusted touch');
  }
  async function pause(){if(await page.locator('#pause-btn').getAttribute('aria-label')!=='Продолжить')await tap('#pause-btn',false);assert.equal(await page.locator('#pause-btn').getAttribute('aria-label'),'Продолжить');}
  async function screenshot(name){const path=row.id+'-'+name+'.png';const p=await page.screenshot({path:out+'/'+path});return {path,sha256:createHash('sha256').update(p).digest('hex'),bytes:p.length};}
  async function step(name,fn){const st={name,status:'OPEN'};row.steps.push(st);flush();try{await fn();st.image=await screenshot(name);st.status='PASS';}catch(e){st.status='FAIL';st.error=String(e.stack||e);try{st.image=await screenshot(name);}catch{}throw e;}finally{try{st.trace=await page.evaluate(()=>window.__gcTrace.slice(-100));}catch{}flush();}}
  async function layout(){const v=await page.evaluate(()=>({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight}));assert.ok(v.sw<=v.w+2&&v.sh<=v.h+2,'whole-page scroll '+JSON.stringify(v));}
  async function open(){await tap('#plan-peek');await page.locator('#queue-panel').waitFor({state:'visible'});if(!(await page.locator('#queue-recurring').getAttribute('open')!==null))await tap('#queue-recurring summary');await page.locator(day).waitFor({state:'visible'});}
  await step('boot',async()=>{await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});await ready();await pause();assert.ok((await page.locator('#game-canvas').screenshot()).length>2000);await layout();});
  await step('open-and-skip',async()=>{await open();const before=await state();
   assert.match(await page.locator(day).innerText(),/Продать картину/);
   await tap(week+' [data-task-operation="dismiss"]');
   await page.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).recurringTasks.byResident.alex.week.dismissed,SAVE_KEY);
   const after=await state();assert.deepEqual(snap(after),snap(before));
   assert.equal(await page.locator(week).getAttribute('data-status'),'dismissed');await layout();});
  await step('switch-and-replace',async()=>{await tap('#queue-mira');assert.equal(await page.locator('#queue-mira').getAttribute('aria-pressed'),'true');
   const before=await state();await tap(day+' [data-task-operation="replace"]');
   const after=await state();assert.notEqual(after.recurringTasks.byResident.mira.day.kind,before.recurringTasks.byResident.mira.day.kind);
   assert.deepEqual(after.recurringTasks.byResident.alex,before.recurringTasks.byResident.alex);
   assert.deepEqual(snap(after),snap(before));assert.equal(after.selectedSim,'alex');
   await tap('#queue-close');await page.locator('#queue-panel').waitFor({state:'hidden'});await layout();});
  await step('reload',async()=>{const before=await state();await page.reload({waitUntil:'domcontentloaded'});await ready();await pause();await open();
   assert.equal(await page.locator(week).getAttribute('data-status'),'dismissed');
   assert.deepEqual((await state()).recurringTasks,before.recurringTasks);await tap('#queue-close');});
  await step('actual-sale',async()=>{const before=await state();await tap('#mind-toggle',false);await tap('#mind-tab-skills',false);
   const sale='#mind-painting-works button:has-text("Продать · +")';
   page.once('dialog',d=>d.accept());await tap(sale,false);
   await page.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).recurringTasks.byResident.alex.day.proofs.length===1,SAVE_KEY);
   const after=await state();assert.equal(after.createdWorks.length,0);
   const receipt=after.financialHistory.entries.find(e=>e.kind==='art-sale');assert.ok(receipt);
   assert.equal(after.recurringTasks.byResident.alex.day.proofs[0].id,receipt.id);
   assert.equal(after.shop.credits-before.shop.credits,receipt.delta);
   await tap('#mind-close',false);await open();assert.equal(await page.locator(day).getAttribute('data-status'),'complete');await tap('#queue-close');});
  if(extra)await step('extra-resident',async()=>{await tap('#pick-resident_3');await page.locator('#cas-resident-details').waitFor({state:'visible'});
   await tap('#cas-resident-details .gc-task-details summary');
   const target='#extra-recurring-cards [data-period="day"] [data-task-operation="replace"]';const before=await state();await tap(target);
   const after=await state();assert.notEqual(after.recurringTasks.byResident.resident_3.day.kind,before.recurringTasks.byResident.resident_3.day.kind);
   assert.deepEqual(after.recurringTasks.byResident.alex,before.recurringTasks.byResident.alex);await layout();});
  assert.deepEqual(row.errors,[]);row.status='PASS';
 }catch(e){row.status='FAIL';row.error=String(e.stack||e);console.error(row.id,row.error);}
 finally{flush();if(ctx)await ctx.close();if(b)await b.close();}
 }
}
console.log(JSON.stringify(report.cases.map(x=>({id:x.id,status:x.status,error:x.error,errors:x.errors,steps:x.steps.map(s=>({name:s.name,status:s.status}))}))));
assert.ok(report.cases.every(c=>c.status==='PASS'),'GC-06 browser matrix incomplete');
