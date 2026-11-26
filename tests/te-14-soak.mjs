/** TE-14 isolated diagnostic; real elapsed time, not iPhone or production acceptance. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {chromium,webkit} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY,newGame,NEEDS} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
import {pngEvidence} from './gq-playtest/evidence.mjs';
import {residentIdsForSimulation} from '../src/resident-activity-runtime.js';
const engine=process.env.TE_ENGINE,n=Number(process.env.TE_RESIDENTS),w=Number(process.env.TE_WIDTH),minutes=Number(process.env.TE_MINUTES),h=w===320?568:844;
assert.ok(['chromium','webkit'].includes(engine)&&[2,4].includes(n)&&[320,390].includes(w)&&[2,30,120].includes(minutes));
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
assert.equal(sha,process.env.TE_SHA);
const dir='artifacts/te-14';mkdirSync(dir,{recursive:true});
const report={sha,engine,n,viewport:[w,h],minutes,device:'OPEN',status:'OPEN',samples:[],events:[],errors:[],screens:[],memoryInterpretation:'Linux process-tree RSS sums shared pages; browser JS heap/CDP and engine VRAM estimates are not Safari OS memory'};
const flush=()=>writeFileSync(dir+'/report.json',JSON.stringify(report,null,2)+'\n');
const ids=['alex','mira',...Array.from({length:n-2},(_,i)=>'resident_'+(i+3))];
function checkSave(s){
 assert.equal(s.version,1);assert.ok(Number.isFinite(s.minutes)&&s.minutes>=0);
 assert.equal(s.otherSim.minutes,s.minutes);assert.deepEqual(residentIdsForSimulation(s),ids);
 assert.ok(Number.isSafeInteger(s.shop.credits)&&s.shop.credits>=0);
 for(const a of [s,s.otherSim,...Object.values(s.population?.residentsById||{}).map(x=>x.actor)])
  for(const k of NEEDS)assert.ok(Number.isFinite(a.needs[k])&&a.needs[k]>=0&&a.needs[k]<=100,'invalid need '+k);
 const journal=s.financialHistory.entries;assert.equal(new Set(journal.map(e=>e.id)).size,journal.length,'duplicate finance receipt');
}
function checkFrame(s){assert.ok(s.render.count>0&&s.update.count>0,'missing real engine events');assert.ok(s.render.max<7500&&s.update.max<7500&&s.render.age<7500&&s.update.age<7500,'visible engine stall');assert.equal(s.lost,0,'unexpected context loss');}
const memoryFlag=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&b-a>64*1024*1024&&b>a*1.25;
function checkClock(stalled){assert.ok(stalled<3,'three eligible windows without advancing game time');}
const seed=newHousehold('2026-11-26');seed.calendar.anchorConfirmed=true;
if(n===4){
 const residentsById={},linksByResident={alex:{familyId:'family_1',dwellingId:'dwelling_1'},mira:{familyId:'family_1',dwellingId:'dwelling_1'}};
 for(let i=3;i<=4;i++){const id='resident_'+i,actor=newGame();actor.personality.name=i===3?'Вера':'Игорь';actor.position={x:1.2+(i-3)*.9,z:1.2};residentsById[id]={id,identity:{firstName:actor.personality.name,lastName:'Тест',lifeStage:'adult'},actor};linksByResident[id]={familyId:'family_'+i,dwellingId:'dwelling_1'};}
 seed.population={schema:1,nextResidentSerial:5,residentsById,linksByResident,kinship:[]};
}
// Negative controls verify detection logic, not the runtime's ability to recover.
const good={render:{count:5,max:20,age:10},update:{count:5,max:20,age:10},lost:0};
checkFrame(good);assert.throws(()=>checkFrame({...good,render:{count:5,max:8000,age:10}}));assert.throws(()=>checkFrame({...good,lost:1}));assert.throws(()=>checkClock(3));assert.ok(memoryFlag(128*2**20,256*2**20));assert.ok(!memoryFlag(128*2**20,140*2**20));
const bad=structuredClone(seed);bad.financialHistory.entries=[{id:'duplicate'},{id:'duplicate'}];assert.throws(()=>checkSave(bad),/duplicate finance/);
report.negativeControls='PASS';flush();
function rss(){
 const lines=execFileSync('ps',['-eo','pid=,ppid=,rss='],{encoding:'utf8'}).trim().split('\n').map(l=>l.trim().split(/\s+/).map(Number));
 const set=new Set([process.pid]);for(let k=0;k<12;k++)for(const [pid,ppid] of lines)if(set.has(ppid))set.add(pid);
 return lines.filter(([pid])=>set.has(pid)&&pid!==process.pid).reduce((a,r)=>a+r[2]*1024,0);
}
const browser=await (engine==='chromium'?chromium:webkit).launch(engine==='chromium'?{headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']}:{headless:true});
let start=null;
try{
 const ctx=await browser.newContext({viewport:{width:w,height:h},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 await ctx.addInitScript(({key,tour,seed})=>{
  if(location.origin==='http://127.0.0.1:8765'&&!sessionStorage.getItem('te14-seeded')){
   if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));
   localStorage.setItem(tour,'done');sessionStorage.setItem('te14-seeded','1');
  }
  window.__teTouch=0;window.__teLost=0;
  document.addEventListener('touchstart',e=>{if(e.isTrusted)window.__teTouch++},{capture:true,passive:true});
  document.addEventListener('webglcontextlost',()=>window.__teLost++,true);
 },{key:SAVE_KEY,tour:UI_TOUR_STORAGE_KEY,seed});
 const page=await ctx.newPage();
 page.on('pageerror',e=>{report.errors.push(String(e.stack||e));flush();});
 page.on('crash',()=>{report.errors.push('renderer crash');flush();});
 const cdp=engine==='chromium'?await ctx.newCDPSession(page):null;
 if(cdp)await cdp.send('Performance.enable');
 const snap=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY);
 const vis=s=>page.locator(s).first().isVisible();
 const tap=async s=>{const before=await page.evaluate(()=>window.__teTouch);await page.locator(s).first().tap({timeout:8000});assert.ok(await page.evaluate(()=>window.__teTouch)>before,'missing trusted touch '+s);};
 const capture=async name=>{const file=name+'.png';const b=await page.screenshot({path:dir+'/'+file,timeout:15000});report.screens.push({file,...pngEvidence(b)});flush();};
 const ready=async()=>{
  const t=performance.now();await page.locator('#loading').waitFor({state:'hidden',timeout:100000});await page.locator('#game-canvas').waitFor({state:'visible'});
  await page.evaluate(async()=>{
   const {Application}=await import('playcanvas');const app=Application.getApplication();
   if(!app?.graphicsDevice?.canvas||typeof window.__LifeSimE1Stats!=='function')throw Error('missing actual device/probe');
   const tracker=()=>({last:performance.now(),gaps:[],count:0,max:0});
   let render=tracker(),update=tracker();
   const mark=t=>{const now=performance.now(),gap=now-t.last;t.last=now;t.count++;t.max=Math.max(t.max,gap);if(t.gaps.length<20000)t.gaps.push(gap);};
   app.on('postrender',()=>mark(render));app.on('update',()=>mark(update));
   const take=t=>{const a=t.gaps.slice().sort((x,y)=>x-y),p=q=>a.length?a[Math.ceil(a.length*q)-1]:null;return {count:t.count,p50:p(.5),p95:p(.95),p99:p(.99),max:t.max,age:performance.now()-t.last};};
   window.__teSample=()=>{const out={render:take(render),update:take(update),lost:window.__teLost,visible:!document.hidden,stats:window.__LifeSimE1Stats(),touch:window.__teTouch,resourceCount:performance.getEntriesByType('resource').length,assets:app.assets.list().length,entities:app.root.find(()=>true).length,cacheControlled:!!navigator.serviceWorker?.controller};for(const t of [render,update]){t.gaps.length=0;t.count=0;t.max=0;}return out;};
  });
  await page.waitForTimeout(14000);await page.evaluate(()=>window.__teSample());
  report.events.push({name:'boot-ready',ms:Math.round(performance.now()-t),rss:rss()});flush();
 };
 const modals=async()=>{
  for(let i=0;i<4;i++){
   if(await vis('.career-shift-summary-done'))await tap('.career-shift-summary-done');
   else if(await vis('#social-menu-panel.dialogue-required #social-menu-options button:not([disabled])'))await tap('#social-menu-panel.dialogue-required #social-menu-options button:not([disabled])');
   else if(await vis('.career-incident-later'))await tap('.career-incident-later');
   else break;
  }
 };
 const resume=async()=>{await modals();if(await page.locator('#pause-btn').getAttribute('aria-label')==='Продолжить')await tap('#pause-btn');};
 const ui=async()=>{await modals();await tap('#pick-mira');await tap('#pick-alex');await tap('#view-toggle');await tap('#view-close');await resume();};
 await page.goto('http://127.0.0.1:8765/?lot-e1=qa',{waitUntil:'domcontentloaded'});await ready();await resume();
 const initial=await snap();checkSave(initial);await capture('initial');
 start=performance.now();let previous=initial.minutes,stalled=0;report.start=new Date().toISOString();
 for(let i=1;i<=minutes*2;i++){
  await page.waitForTimeout(Math.max(0,start+i*30000-performance.now()));
  const sample=await page.evaluate(()=>window.__teSample());assert.ok(sample.visible,'unexpected hidden foreground test');
  const save=await snap();checkSave(save);
  let heap=null,dom=null;if(cdp){try{const m=await cdp.send('Performance.getMetrics');heap=m.metrics.find(x=>x.name==='JSHeapUsedSize')?.value??null;dom=await cdp.send('Memory.getDOMCounters');}catch(e){report.events.push({name:'cdp-unavailable',error:String(e)});}}
  const row={window:i,elapsedMs:Math.round(performance.now()-start),...sample,rssBytes:rss(),jsHeapBytes:heap,dom,saveBytes:Buffer.byteLength(JSON.stringify(save)),gameMinutes:save.minutes,credits:save.shop.credits,paused:save.paused};
  report.samples.push(row);flush();checkFrame(sample);assert.ok(sample.stats.drawCallCount>0,'no draws');assert.deepEqual(report.errors,[]);
  assert.ok(save.minutes>=previous,'clock regressed');
  const blocked=save.paused||await vis('.career-shift-summary-done')||await vis('#social-menu-panel.dialogue-required');
  stalled=save.minutes>previous||blocked?0:stalled+1;previous=save.minutes;checkClock(stalled);
  if(i===1||i%20===0||i===minutes*2){await capture('window-'+i);await ui();}
  else await resume();
 }
 report.actualElapsedMs=Math.round(performance.now()-start);assert.ok(report.actualElapsedMs>=minutes*60000);assert.ok(previous>initial.minutes,'no game clock progress');
 // Save via player controls, pause to make comparison stable, then warm reload; never reseed.
 await modals();if(await page.locator('#pause-btn').getAttribute('aria-label')!=='Продолжить')await tap('#pause-btn');
 await tap('#view-toggle');await tap('#save-btn');const before=await snap();checkSave(before);
 await page.reload({waitUntil:'domcontentloaded'});await ready();await modals();
 if(await page.locator('#pause-btn').getAttribute('aria-label')!=='Продолжить')await tap('#pause-btn');
 await tap('#view-toggle');await tap('#save-btn');const after=await snap();checkSave(after);
 assert.ok(after.minutes>=before.minutes,'reload lost clock');assert.ok(after.minutes-before.minutes<120,'reload advanced excessive game time');
 // Receipts may legitimately append on boot; no unexplained wallet change.
 const prior=new Set(before.financialHistory.entries.map(e=>e.id));const added=after.financialHistory.entries.filter(e=>!prior.has(e.id));
 assert.equal(after.shop.credits-before.shop.credits,added.reduce((a,e)=>a+e.delta,0),'unexplained reload debit/credit');
 await capture('warm-reload');await page.waitForTimeout(3000);checkFrame(await page.evaluate(()=>window.__teSample()));
 const early=report.samples.slice(1,Math.min(11,report.samples.length)),late=report.samples.slice(-Math.min(10,report.samples.length-1));
 const med=(a,k)=>{const v=a.map(x=>x[k]).filter(Number.isFinite).sort((x,y)=>x-y);return v.length?v[Math.floor(v.length/2)]:null;};
 report.memoryTriage={};for(const k of ['rssBytes','jsHeapBytes','assets','entities','saveBytes']){const a=med(early,k),b=med(late,k);report.memoryTriage[k]={early:a,late:b,flag:k.endsWith('Bytes')&&memoryFlag(a,b)};}
 report.reload={beforeMinutes:before.minutes,afterMinutes:after.minutes,addedReceipts:added.length};assert.deepEqual(report.errors,[]);report.status='PASS';await ctx.close();
}catch(e){report.status='FAIL';report.failure=String(e.stack||e);console.error(report.failure);}
finally{report.finished=new Date().toISOString();flush();await browser.close();}
assert.equal(report.status,'PASS',report.failure);console.log('TE-14 elapsed/summary',JSON.stringify({elapsed:report.actualElapsedMs,samples:report.samples.length,memory:report.memoryTriage,reload:report.reload}));
