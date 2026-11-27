/** Exact candidate, genuine browser touch on visible world/DOM controls.
 * Native select/confirmation automation is explicitly NOT physical touch. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chromium,webkit} from 'playwright';
import {newHousehold} from '../src/household.js';
import {findMarketPlacement,buyMarketItem} from '../src/furniture-shop.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(process.env.GC_EXPECTED_SHA)assert.equal(sha,process.env.GC_EXPECTED_SHA);
const out='artifacts/gc-04-09-c4';mkdirSync(out,{recursive:true});
const report={sha,base:'d75bb3c46d81c6c34f1d1f69969038351525d004',revision:'C4-R2',cases:[],limitations:['native select via selectOption, confirm dialog accepted/dismissed via Playwright; no claim trusted picker/dialog selection','scripted fixture, no human or physical device acceptance','limited touched path, not full gesture suite']};
const flush=()=>writeFileSync(out+'/report.json',JSON.stringify(report,null,2)+'\n');
function fixture(){
 const seed=newHousehold('2026-11-26');seed.calendar.anchorConfirmed=true;
 seed.paused=seed.otherSim.paused=true;seed.autonomy.enabled=seed.otherSim.autonomy.enabled=false;
 const pose=findMarketPlacement(seed.world.furniture,seed.shop,'easel.starter');assert.ok(pose);
 const bought=buyMarketItem(seed.world.furniture,seed.shop,'easel.starter',pose);assert.ok(bought.ok);
 seed.world.furniture=bought.world;seed.shop=bought.shop;
 const approach=furnitureActionApproach(seed.world,'paint',bought.instanceId);assert.ok(approach);
 seed.position={x:approach.x,z:approach.z};
 seed.createdWorks=[{id:'work:gc-market-smoke',ownerId:'alex',easelInstanceId:bought.instanceId,contentId:'painting.hills',seed:123,quality:50,createdAt:seed.minutes,kind:'artwork',location:'inventory'}];
 return {seed,item:seed.world.furniture.instances.find(x=>x.instanceId===bought.instanceId)};
}
for(const [engine,launcher] of [['chromium',chromium],['webkit',webkit]]){
 for(const [width,height] of [[390,844],[320,568]]){
 const row={id:engine+'-'+width,engine,width,height,status:'OPEN',steps:[],errors:[],layoutFindings:[]};report.cases.push(row);flush();
 let browser,ctx,page;
 try{
  browser=await launcher.launch(engine==='chromium'?{headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']}:{headless:true});
  ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,hasTouch:true,isMobile:true,serviceWorkers:'block'});
  const {seed,item}=fixture(),cash=seed.shop.credits;
  await ctx.addInitScript(({key,record,tour})=>{
   if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));localStorage.setItem(tour,'done');
   window.__artBootSave=JSON.parse(localStorage.getItem(key));
   window.__artTrace=[];
   for(const type of ['pointerdown','pointerup','pointercancel','touchstart','touchend','click'])window.addEventListener(type,e=>{
    const t=e.target?.closest?.('button,select')||e.target;
    window.__artTrace.push({type,trusted:e.isTrusted,pointerType:e.pointerType||null,id:t?.id||'',instance:t?.dataset?.instanceId||null,text:t?.textContent?.trim().slice(0,80)||'',x:e.clientX??e.changedTouches?.[0]?.clientX??null,y:e.clientY??e.changedTouches?.[0]?.clientY??null,at:performance.now()});
   },{capture:true,passive:true});
  },{key:SAVE_KEY,record:seed,tour:UI_TOUR_STORAGE_KEY});
  page=await ctx.newPage();page.on('pageerror',e=>row.errors.push(e.message));page.on('crash',()=>row.errors.push('crash'));
  page.on('requestfailed',r=>{if(/\/(src|vendor)\//.test(r.url()))row.errors.push(r.url()+' '+r.failure()?.errorText)});
  let answer='dismiss';page.on('dialog',d=>answer==='accept'?d.accept():d.dismiss());
  const state=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY);
  const ready=async()=>{await page.locator('#loading').waitFor({state:'hidden',timeout:85000});await page.locator('#game-canvas').waitFor({state:'visible'});};
  async function capture(name){
   const b=await page.screenshot({path:out+'/'+row.id+'-'+name+'.png',timeout:15000});
   return {file:row.id+'-'+name+'.png',sha256:createHash('sha256').update(b).digest('hex'),bytes:b.length};
  }
  async function step(name,fn){const st={name,status:'OPEN'};row.steps.push(st);const begin=Date.now();try{await fn(st);st.image=await capture(name);st.status='PASS';}catch(e){st.status='FAIL';st.error=String(e.stack||e);try{st.image=await capture(name);}catch{}throw e;}finally{st.ms=Date.now()-begin;try{st.trace=await page.evaluate(()=>window.__artTrace.slice(-100));}catch{}flush();}}
  async function tap(selector,principal=false){
   const loc=page.locator(selector).first();await loc.waitFor({state:'visible',timeout:12000});
   await loc.scrollIntoViewIfNeeded();const box=await loc.boundingBox();assert.ok(box,selector);
   if(principal&&(box.width<44||box.height<44))row.layoutFindings.push({selector,box,reason:'principal target below 44 CSS px'});
   const before=await page.evaluate(()=>window.__artTrace.length);
   await loc.tap({timeout:12000});
   const trace=await page.evaluate(n=>window.__artTrace.slice(n),before);
   assert.ok(trace.some(e=>e.type==='touchstart'&&e.trusted),selector+' no trusted touch');
  }
  async function pause(){if(await page.locator('#pause-btn').getAttribute('aria-label')!=='Продолжить')await tap('#pause-btn');assert.equal(await page.locator('#pause-btn').getAttribute('aria-label'),'Продолжить');}
  async function layout(){const d=await page.evaluate(()=>({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight}));assert.ok(d.sw<=d.w+2&&d.sh<=d.h+2,'whole-page scroll');}
  await step('boot',async()=>{await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});await ready();await pause();assert.ok((await state()).artMarket);await layout();});
  const sale='#mind-painting-works button:has-text("Продать · +175 кр.")';
  await step('portfolio-cancel',async()=>{await tap('#mind-toggle');await tap('#mind-tab-skills');await tap(sale,true);assert.equal((await state()).shop.credits,cash);assert.equal((await state()).createdWorks.length,1);await layout();});
  await step('portfolio-confirm',async()=>{answer='accept';await tap(sale,true);await page.waitForFunction(({k,cash})=>JSON.parse(localStorage.getItem(k)).shop.credits===cash+175,{k:SAVE_KEY,cash});const s=await state();assert.equal(s.createdWorks.length,0);assert.equal(s.financialHistory.entries.filter(e=>e.kind==='art-sale').length,1);await tap('#mind-close');});
  await step('focus-easel',async()=>{await tap('#view-toggle');await tap('#item-labels-btn');assert.equal(await page.locator('#item-labels-btn').getAttribute('aria-pressed'),'true');await tap('#menu-find-resident-btn');await page.locator('#view-panel').waitFor({state:'hidden'});await page.waitForTimeout(1700);});
  const marker='#hotspots button[data-instance-id="'+item.instanceId+'"]';
  await step('easel-touch',async()=>{const before=await state();await tap(marker);await page.locator('#painting-mode-select').waitFor({state:'visible'});assert.deepEqual((await state()).actionQueues,before.actionQueues);assert.equal(await page.locator('#painting-mode-select').inputValue(),'practice');assert.match(await page.locator('#painting-mode-note').innerText(),/Без расходов/);await layout();});
  await step('dismiss-practice',async()=>{await tap('#close-action');assert.deepEqual((await state()).actionQueues.byResident.alex,[]);await tap(marker);await page.locator('#painting-mode-select').waitFor({state:'visible'});});
  await step('commission-picker-functional',async(st)=>{st.nativePicker='programmatic selection, not trusted touch evidence';await page.locator('#painting-mode-select').selectOption('commission');assert.match(await page.locator('#painting-mode-note').innerText(),/20 кр./);await layout();});
  await step('queue-commission',async()=>{await tap('#action-button',true);await page.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).actionQueues.byResident.alex.some(c=>c.paintMode==='commission'),SAVE_KEY);const q=await state();assert.equal(q.shop.credits,cash+175);assert.equal(q.actionQueues.byResident.alex[0].targetInstanceId,item.instanceId);assert.equal(q.actionQueues.byResident.alex[0].paintExpectedPrice,20);assert.deepEqual(q.actionQueues.byResident.mira,[]);});
  function assertAdmission(s){
    const row=s.artMarket.byResident.alex;
    const receipts=s.financialHistory.entries.filter(e=>e.sourceId==='painting.materials');
    assert.equal(s.shop.credits,cash+175-20);
    assert.equal(receipts.length,1);assert.equal(receipts[0].delta,-20);
    assert.equal(receipts[0].actorId,'alex');
    assert.equal(row.active?.mode,'commission');
    assert.equal(row.order?.sessionId,row.active.sessionId);
    assert.equal(row.order.status,'accepted');
    assert.equal(s.actionQueues.byResident.alex.length,0);
    assert.deepEqual(s.actionQueues.byResident.mira,[]);
    return row.active.sessionId;
  }
  let admittedId=null;
  await step('reload-queue',async(st)=>{
    const prior=await state();
    assert.equal(prior.shop.credits,cash+175);
    const intent=prior.actionQueues.byResident.alex[0];assert.equal(intent.paintMode,'commission');
    await page.reload({waitUntil:'domcontentloaded'});
    // Stored record captured before any application code may resume the clock.
    const boot=await page.evaluate(()=>window.__artBootSave);
    assert.equal(boot.shop.credits,cash+175);
    assert.deepEqual(boot.actionQueues.byResident.alex,[intent]);
    assert.equal(boot.financialHistory.entries.filter(e=>e.sourceId==='painting.materials').length,0);
    await ready();await pause();
    const q=await state();
    if(q.artMarket.byResident.alex.active){
      admittedId=assertAdmission(q);st.restored='already admitted once after normal unpaused reload';
    }else{
      assert.equal(q.shop.credits,cash+175);
      assert.deepEqual(q.actionQueues.byResident.alex,[intent]);
      assert.equal(q.financialHistory.entries.filter(e=>e.sourceId==='painting.materials').length,0);
      st.restored='still pending, no debit';
    }
  });
  await step('actual-admission',async()=>{
    if(!admittedId){
      await tap('#pause-btn');
      await page.waitForFunction(({k,cash})=>{const s=JSON.parse(localStorage.getItem(k));return s.shop.credits===cash+175-20&&s.artMarket.byResident.alex.active?.mode==='commission';},{k:SAVE_KEY,cash},{timeout:25000});
      await pause();
    }
    const s=await state(),id=assertAdmission(s);
    if(admittedId)assert.equal(id,admittedId);
    admittedId=id;
  });
  await step('reload-admitted',async()=>{
    await page.reload({waitUntil:'domcontentloaded'});
    const boot=await page.evaluate(()=>window.__artBootSave);
    assert.equal(assertAdmission(boot),admittedId);
    await ready();await pause();
    assert.equal(assertAdmission(await state()),admittedId);
  });
  assert.deepEqual(row.errors,[]);row.status=row.layoutFindings.length?'LAYOUT_FAIL':'PASS';
 }catch(e){row.status='FAIL';row.failure=String(e.stack||e);console.error(row.id,row.failure);}
 finally{if(ctx)await ctx.close();if(browser)await browser.close();flush();}
 }
}
console.log('GC C4 MATRIX',JSON.stringify(report.cases.map(c=>({id:c.id,status:c.status,failed:c.steps.find(s=>s.status==='FAIL')?.name,layout:c.layoutFindings,errors:c.errors}))));
assert.equal(report.cases.length,4);assert.ok(report.cases.every(c=>c.status==='PASS'),'matrix has failures; evidence retained');
