/** Reusable scripted touch playtest, never human/device/ART acceptance. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {chromium,webkit} from 'playwright';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
import {scenarios} from './gq-playtest/ux3-06-scenarios.mjs';
import {pngEvidence,assertEvidence} from './gq-playtest/evidence.mjs';
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(process.env.GQ_EXPECTED_SHA)assert.equal(sha,process.env.GQ_EXPECTED_SHA);
const output='artifacts/ux3-06';mkdirSync(output,{recursive:true});
const url=process.env.GQ_URL||'http://127.0.0.1:8765/';
const parsed=new URL(url);assert.ok(['127.0.0.1','localhost'].includes(parsed.hostname),'Only local isolated game builds');
const report={schema:1,sha,url,started:new Date().toISOString(),device:'OPEN: emulated browsers, not physical iPhone',game:'OPEN: scripted interaction, not human enjoyment',art:'OPEN: screenshots require visual review',cases:[]};
const matrix=[['chromium',chromium,390,844],['chromium',chromium,320,568],['webkit',webkit,390,844],['webkit',webkit,320,568]];
const expected=matrix.flatMap(([engine,,w])=>scenarios.filter(s=>!s.only||s.only===engine+'-'+w).map(s=>engine+'-'+w+'-'+s.id));
const flush=()=>writeFileSync(output+'/report.json',JSON.stringify(report,null,2)+'\n');
flush();
for(const [engine,launcher,width,height] of matrix){
 const browser=await launcher.launch(engine==='chromium'?{headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']}:{headless:true});
 try{for(const scenario of scenarios){
  if(scenario.only&&scenario.only!==engine+'-'+width)continue;
  const id=engine+'-'+width+'-'+scenario.id,started=performance.now();
  const c={id,engine,width,height,goal:scenario.goal,fixture:'pending',status:'OPEN',errors:[],steps:[]};report.cases.push(c);flush();
  let seed;
  try{seed=scenario.seed?.()??null;c.fixture=seed?'seeded':'fresh';}
  catch(e){c.status='FAIL';c.failure=e.stack||String(e);c.durationMs=Math.max(1,Math.round(performance.now()-started));console.error('GQ FIXTURE FAIL',id,c.failure);flush();continue;}
  const ctx=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'});
  let page;
  try{
   await ctx.addInitScript(({key,tour,seed})=>{
     if(seed&&!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(seed));localStorage.setItem(tour,'done');}
     window.__gqTouch=0;window.__gqContextLost=0;window.__gqInput=[];
     for(const type of ['pointerdown','pointerup','pointercancel','lostpointercapture','touchstart','touchend','touchcancel','focus','blur','click'])window.addEventListener(type,e=>{
       const target=e.target?.closest?.('button')||e.target;const t={type,t:performance.now(),id:target?.id||'',text:target?.tagName==='BUTTON'?target.textContent?.trim().slice(0,80):'',trusted:e.isTrusted,pointerType:e.pointerType||null,pointerId:e.pointerId??null,isPrimary:e.isPrimary??null,button:e.button??null,windowTarget:e.target===window,detail:e.detail??null,x:e.clientX??e.changedTouches?.[0]?.clientX??null,y:e.clientY??e.changedTouches?.[0]?.clientY??null};
       queueMicrotask(()=>{t.defaultPrevented=e.defaultPrevented;});window.__gqInput.push(t);if(window.__gqInput.length>100)window.__gqInput.shift();
     },{capture:true,passive:true});
     document.addEventListener('touchstart',()=>window.__gqTouch++,{capture:true,passive:true});
     document.addEventListener('webglcontextlost',()=>window.__gqContextLost++,true);
   },{key:SAVE_KEY,tour:UI_TOUR_STORAGE_KEY,seed});
   page=await ctx.newPage();
   page.on('pageerror',e=>c.errors.push('page: '+e.message));page.on('crash',()=>c.errors.push('renderer crash'));
   page.on('requestfailed',r=>{if(/\/(src|vendor)\//.test(r.url()))c.errors.push('request: '+r.url()+' '+r.failure()?.errorText);});
   page.on('response',r=>{if(r.status()>=400&&/\/(src|vendor)\//.test(r.url()))c.errors.push('HTTP '+r.status()+' '+r.url());});
   const snapshot=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
   const ready=async()=>{await page.locator('#loading').waitFor({state:'hidden',timeout:100000});await page.locator('#game-canvas').waitFor({state:'visible'});};
   const reload=async()=>{await page.reload({waitUntil:'domcontentloaded'});await ready();};
   let current=null;
   const tap=async selector=>{
     const locator=page.locator(selector).first();
     await locator.waitFor({state:'visible',timeout:10000});
     const box=await locator.boundingBox();
     assert.ok(box&&box.width>0&&box.height>0,'no visible touch target '+selector);
     const before=await page.evaluate(()=>window.__gqTouch);
     await locator.tap({timeout:10000});
     const after=await page.evaluate(()=>window.__gqTouch);
     assert.ok(after>before,'no touch event '+selector);
     current.input='touch';current.touchEvents+=after-before;
     current.targets.push({selector,rect:box,hit44:box.width>=44&&box.height>=44});
   };
   const observe=value=>{(current.observations??=[]).push(value);};
   const inputTrace=()=>page.evaluate(()=>window.__gqInput.slice());
   const touchAt=async(x,y,count=1)=>{
     const before=await page.evaluate(()=>window.__gqTouch);
     for(let i=0;i<count;i++)await page.touchscreen.tap(x,y);
     const after=await page.evaluate(()=>window.__gqTouch);
     assert.ok(after-before>=count,'missing actual touchscreen event');
     current.input='touch';current.touchEvents+=after-before;
     current.targets.push({selector:'screen',rect:{x,y,width:1,height:1},hit44:null});
   };
   const doubleTap=async selector=>{const loc=page.locator(selector).first();await loc.waitFor({state:'visible'});const b=await loc.boundingBox();assert.ok(b);const x=b.x+b.width/2,y=b.y+b.height/2;
     const hit=await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest('button')?.id,{x,y});assert.equal(hit,selector.slice(1),'portrait not hit-testable');
     await page.evaluate(()=>{window.__gqInput.length=0;});await touchAt(x,y,2);};
   const capture=async s=>{
     const file=id+'-'+String(c.steps.length).padStart(2,'0')+'-'+s.name+'.png';
     const bytes=await page.screenshot({path:output+'/'+file,timeout:15000});
     s.image={file,...pngEvidence(bytes)};
   };
   const step=async(name,fn)=>{
     const t=performance.now(),s={name,input:'observe',touchEvents:0,targets:[],status:'OPEN'};current=s;c.steps.push(s);
     try{await fn();assert.equal(await page.evaluate(()=>window.__gqContextLost),0,'context lost');await capture(s);s.status='PASS';}
     catch(e){s.status='FAIL';s.error=e.stack||String(e);try{s.inputTrace=await inputTrace();await capture(s);}catch(captureError){s.captureError=String(captureError);}throw e;}
     finally{s.elapsedMs=Math.round(performance.now()-t);current=null;flush();}
   };
   await step('boot',async()=>{
     await page.goto(url,{waitUntil:'domcontentloaded'});await ready();
     const gl=await page.evaluate(async()=>{const {Application}=await import('playcanvas');const app=Application.getApplication(),canvas=app?.graphicsDevice?.canvas;return {actual:!!canvas,width:canvas?.width,height:canvas?.height,viewport:innerWidth,viewportHeight:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight};});
     assert.ok(gl.actual&&gl.width>100&&gl.height>100,'actual PlayCanvas device');assert.ok(gl.scrollWidth<=gl.viewport+2&&gl.scrollHeight<=gl.viewportHeight+2,'whole-page scroll');
     const frame=await page.locator('#game-canvas').screenshot({timeout:15000});assert.ok(frame.length>2000,'empty canvas screenshot');c.graphics=gl;
   });
   await scenario.run({page,step,tap,tapPoint:touchAt,doubleTap,observe,inputTrace,snapshot,reload,seed,key:SAVE_KEY});
   assert.deepEqual(c.errors,[]);c.status='PASS';
  }catch(e){c.status='FAIL';c.failure=e.stack||String(e);console.error('GQ CASE FAIL',id,c.failure,JSON.stringify(c.errors));}
  finally{c.durationMs=Math.max(1,Math.round(performance.now()-started));await ctx.close();flush();}
 }}finally{await browser.close();}
}
report.finished=new Date().toISOString();flush();
console.log('GQ matrix',JSON.stringify(report.cases.map(c=>({id:c.id,status:c.status,steps:c.steps.length,failed:c.steps.find(s=>s.status==='FAIL')?.name,durationMs:c.durationMs}))));
assertEvidence(report,sha,expected);
console.log('GQ scripted touch evidence PASS',report.cases.length,'cases; human/device/art OPEN');
