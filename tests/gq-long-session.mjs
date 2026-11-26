/** Real wall-clock scripted exploratory session with actual touch controls.
 * Synthetic start fixture: one employed resident and one bought easel.
 * No state writes after boot; decisions and failures retained, not human play.
 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {chromium,webkit} from 'playwright';
import {newHousehold} from '../src/household.js';
import {hireCareer} from '../src/career-state.js';
import {findMarketPlacement,buyMarketItem} from '../src/furniture-shop.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
import {pngEvidence} from './gq-playtest/evidence.mjs';
const duration=Number(process.env.GQ_MINUTES),engine=process.env.GQ_ENGINE;
assert.ok([30,120].includes(duration)&&['chromium','webkit'].includes(engine));
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(process.env.GQ_EXPECTED_SHA)assert.equal(sha,process.env.GQ_EXPECTED_SHA);
const dir='artifacts/gq-long';mkdirSync(dir,{recursive:true});
const report={sha,engine,viewport:[390,844],durationTargetMinutes:duration,fixture:'one employed resident; one purchased easel; isolated save',human:'OPEN',device:'OPEN',art:'OPEN',status:'OPEN',steps:[],samples:[],errors:[],failures:[]};
const flush=()=>writeFileSync(dir+'/report.json',JSON.stringify(report,null,2)+'\n');
flush();
const seed=newHousehold('2026-11-26');seed.calendar.anchorConfirmed=true;seed.paused=true;seed.otherSim.paused=true;
seed.careerSystem=hireCareer(seed.careerSystem,'mira','editorial',seed.minutes,{rankSchedules:true});
const placement=findMarketPlacement(seed.world.furniture,seed.shop,'easel.starter');assert.ok(placement);
const tx=buyMarketItem(seed.world.furniture,seed.shop,'easel.starter',placement);assert.ok(tx.ok,tx.reason);seed.world.furniture=tx.world;seed.shop=tx.shop;
const item=seed.world.furniture.instances.find(i=>i.prefabId==='easel'&&i.location==='home');assert.ok(item);
const browser=await (engine==='chromium'?chromium:webkit).launch(engine==='chromium'?{headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']}:{headless:true});
let started=null;
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'});
 await context.addInitScript(({key,tour,seed})=>{
  if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(seed));localStorage.setItem(tour,'done');}
  window.__gqLongTouch=0;window.__gqLost=0;
  document.addEventListener('touchstart',e=>{if(e.isTrusted)window.__gqLongTouch++;},{capture:true,passive:true});
  document.addEventListener('webglcontextlost',()=>window.__gqLost++,true);
 },{key:SAVE_KEY,tour:UI_TOUR_STORAGE_KEY,seed});
 const page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));page.on('crash',()=>report.errors.push('renderer crash'));
 page.on('requestfailed',r=>{if(/\/(src|vendor)\//.test(r.url()))report.errors.push(r.url()+' '+r.failure()?.errorText);});
 page.on('response',r=>{if(r.status()>=400&&/\/(src|vendor)\//.test(r.url()))report.errors.push('HTTP '+r.status()+' '+r.url());});
 page.on('dialog',d=>{report.errors.push('Unexpected native dialog: '+d.message());d.dismiss().catch(()=>{});});
 const visible=s=>page.locator(s).first().isVisible();
 const snap=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY);
 const touch=async selector=>{
  const n=await page.evaluate(()=>window.__gqLongTouch);
  await page.locator(selector).first().tap({timeout:7000});
  assert.ok(await page.evaluate(()=>window.__gqLongTouch)>n,'missing trusted touch: '+selector);
 };
 const point=async(x,y)=>{
  const n=await page.evaluate(()=>window.__gqLongTouch);
  await page.touchscreen.tap(x,y);
  assert.ok(await page.evaluate(()=>window.__gqLongTouch)>n,'missing trusted world touch');
 };
 let sequence=0;
 const capture=async label=>{const file=String(++sequence).padStart(3,'0')+'-'+label+'.png';const bytes=await page.screenshot({path:dir+'/'+file,timeout:15000});return {file,...pngEvidence(bytes)};};
 const attempt=async(name,fn)=>{
  const s={name,atMs:started===null?null:Math.round(performance.now()-started),status:'OPEN'};
  report.steps.push(s);
  try{await fn();s.status='PASS';}catch(e){s.status='FAIL';s.error=String(e.stack||e);report.failures.push({name,error:s.error});}
  try{s.image=await capture(name);}catch(e){s.captureError=String(e);report.failures.push({name,error:s.captureError});}
  flush();return s.status==='PASS';
 };
 const ready=async()=>{await page.locator('#loading').waitFor({state:'hidden',timeout:100000});await page.locator('#game-canvas').waitFor({state:'visible'});};
 await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});await ready();
 const gl=await page.evaluate(async()=>{const {Application}=await import('playcanvas');const canvas=Application.getApplication()?.graphicsDevice?.canvas;return {width:canvas?.width,height:canvas?.height,scroll:document.documentElement.scrollHeight,viewport:innerHeight};});
 assert.ok(gl.width>100&&gl.height>100&&gl.scroll<=gl.viewport+2);report.graphics=gl;
 const closeOptional=async()=>{for(const s of ['.career-shift-summary-done','.career-phone-x','#queue-close','#close-action','#ground-walk-close','#social-context-close','#view-close'])if(await visible(s))await touch(s);};
 const unpause=async()=>{if(await page.locator('#pause-btn').getAttribute('aria-label')==='Продолжить')await touch('#pause-btn');};
 const pause=async()=>{if(await page.locator('#pause-btn').getAttribute('aria-label')!=='Продолжить')await touch('#pause-btn');};
 const project=async(x,z,y)=>page.evaluate(async({x,z,y})=>{
  const {Application,Vec3}=await import('playcanvas');const app=Application.getApplication();const cam=app.root.findComponents('camera').find(c=>c.enabled);
  const p=cam.worldToScreen(new Vec3(x,y,z)),b=document.querySelector('#game-canvas').getBoundingClientRect();
  const px=Math.round(p.x+b.left),py=Math.round(p.y+b.top);return {x:px,y:py,hit:document.elementFromPoint(px,py)?.id};
 },{x,z,y});
 const paint=async()=>{
  await closeOptional();await touch('#pick-alex');
  for(const y of [1.15,.75,1.5]){
   const p=await project(item.x,item.z,y);if(p.hit!=='game-canvas')continue;
   await point(p.x,p.y);
   await page.locator('#painting-theme-select').waitFor({state:'visible',timeout:1500}).catch(()=>{});
   if(await visible('#painting-theme-select')){await touch('#action-button');return;}
   await closeOptional();
  }
  throw Error('No visible real easel action reached via scene picking');
 };
 const social=async()=>{
  await closeOptional();await touch('#pick-alex');
  const s=await snap();assert.ok(s.otherSim?.position);
  for(const y of [1.4,.95,1.65]){
   const p=await project(s.otherSim.position.x,s.otherSim.position.z,y);if(p.hit!=='game-canvas')continue;
   await point(p.x,p.y);
   await page.locator('#social-context').waitFor({state:'visible',timeout:1500}).catch(()=>{});
   if(await visible('#social-context')){
    await touch('#friendship-btn');
    const opt='#social-menu-options button:not([disabled])';
    await page.locator(opt).first().waitFor({state:'visible',timeout:4000});
    const label=await page.locator(opt).first().innerText();report.steps.at(-1).decision=label;
    await touch(opt);
    return;
   }
   await closeOptional();
  }
  throw Error('No reachable partner interaction via real scene picking');
 };
 const finance=async()=>{await closeOptional();await touch('#career-phone-toggle');await touch('#career-phone-panel [data-phone-app="finance"]');assert.ok(await visible('.finance-wallet'));await touch('.career-phone-x');};
 const queue=async()=>{await closeOptional();await touch('#plan-peek');await touch('#queue-mira');assert.ok(await visible('#queue-panel'));await touch('#queue-close');};
 const saveReload=async()=>{await closeOptional();await pause();await touch('#view-toggle');await touch('#save-btn');const before=await snap();await page.reload({waitUntil:'domcontentloaded'});await ready();const after=await snap();assert.equal(after.version,1);assert.equal(after.shop.credits,before.shop.credits);assert.equal(after.minutes,before.minutes);await unpause();};
 const decisions=async()=>{
  if(await visible('.career-shift-summary-done'))await attempt('work-summary',()=>touch('.career-shift-summary-done'));
  if(await visible('.career-incident-open'))await attempt('inspect-incident',async()=>{await touch('.career-incident-open');if(await visible('.career-incident-later'))await touch('.career-incident-later');});
  if(await visible('#social-menu-panel.dialogue-required'))await attempt('dialogue-choice',async()=>{
    const opt='#social-menu-options button:not([disabled])';const b=page.locator(opt).first();assert.ok(await b.isVisible());report.steps.at(-1).decision=await b.innerText();await touch(opt);
  });
 };
 started=performance.now();report.started=new Date().toISOString();flush();
 await attempt('start-creative',async()=>{await pause();await paint();await unpause();});
 await attempt('resume',unpause);
 await attempt('speed',async()=>{if(!(await page.locator('#speed-btn').innerText()).includes('3'))await touch('#speed-btn');});
 const initial=await snap();report.initial={minutes:initial.minutes,credits:initial.shop.credits,works:initial.createdWorks?.length||0};
 let previous=initial.minutes,stalled=0,socialAttempts=0;
 for(let i=1;i<=duration;i++){
  const until=started+i*60000;
  await page.waitForTimeout(Math.max(0,until-performance.now()));
  await decisions();
  const s=await snap();assert.equal(s.version,1);assert.equal(s.otherSim.minutes,s.minutes);assert.equal(await page.evaluate(()=>window.__gqLost),0,'context lost');
  for(const a of [s,s.otherSim])for(const v of Object.values(a.needs))if(typeof v==='number')assert.ok(Number.isFinite(v)&&v>=0&&v<=100);
  const row={minute:i,elapsedMs:Math.round(performance.now()-started),gameMinutes:s.minutes,advance:s.minutes-previous,credits:s.shop.credits,alex:{needs:s.needs,action:s.action,skills:s.skills,works:s.createdWorks},mira:{needs:s.otherSim.needs,action:s.otherSim.action,skills:s.otherSim.skills,works:s.otherSim.createdWorks},queues:s.actionQueues,relationship:s.relationship,careers:s.careerSystem,events:[s.event,s.otherSim.event],dialogue:s.socialAction?.conversation??null,paused:s.paused,touchEvents:await page.evaluate(()=>window.__gqLongTouch)};
  stalled=s.minutes>previous?0:stalled+1;previous=s.minutes;row.stalledSamples=stalled;report.samples.push(row);
  if(stalled===3)report.failures.push({name:'clock-stall',minute:i,paused:s.paused,dialogue:row.dialogue});
  if(i===1||i%5===0||i===duration)row.image=await capture('minute-'+i);
  flush();
  if(i===5||i%30===15)await attempt('finance-'+i,finance);
  if(i===10||i%30===20)await attempt('queue-'+i,queue);
  if(i===12||i%30===22)await attempt('save-reload-'+i,saveReload);
  if(i>=2&&i%5===2&&socialAttempts<4&&!s.action&&!s.otherSim.action&&!s.socialAction&&!s.careerSystem.byResident.mira?.currentShift){socialAttempts++;await attempt('social-'+i,social);}
  if(i===8&&!(s.createdWorks?.length)&&!s.action)await attempt('creative-retry-'+i,paint);
 }
 const final=await snap();report.final={minutes:final.minutes,credits:final.shop.credits,works:final.createdWorks?.length||0,relationship:final.relationship,career:final.careerSystem.byResident.mira};
 report.actualElapsedMs=Math.round(performance.now()-started);
 assert.ok(report.actualElapsedMs>=duration*60000);assert.equal(report.samples.length,duration);
 if(report.final.works<=report.initial.works)report.failures.push({name:'creative-completion',reason:'No completed artwork observed'});
 if(!socialAttempts)report.failures.push({name:'social-opportunity',reason:'No idle at-home pair at sampled decision opportunities'});
 if(final.minutes<=initial.minutes)report.failures.push({name:'no-clock-progress'});
 report.status=report.failures.length||report.errors.length?'FAIL':'PASS';
 await context.close();
}catch(e){report.status='FAIL';report.failures.push({name:'fatal',error:String(e.stack||e)});}
finally{if(started!==null)report.actualElapsedMs=Math.round(performance.now()-started);report.finished=new Date().toISOString();flush();await browser.close();}
assert.equal(report.status,'PASS',JSON.stringify(report.failures));assert.deepEqual(report.errors,[]);
