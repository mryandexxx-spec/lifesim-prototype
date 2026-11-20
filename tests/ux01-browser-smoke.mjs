/** UX-01: actual PlayCanvas/WebGL at four touch viewports, same-state
 * UX-00 predecessor versus candidate screenshots and per-resident queue controls.
 * SwiftShader Chromium is not a physical Safari iPhone sign-off.
 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {enqueueAction} from '../src/action-queue.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const baselineSha='15334e34747d281c3cbb9c7ffd8dbc2f1f90b21b';
const seed=newHousehold('2026-11-20');
seed.paused=true;seed.otherSim.paused=true;
seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
enqueueAction(seed.actionQueues,'alex',{type:'object',actionId:'bed'});
enqueueAction(seed.actionQueues,'alex',{type:'object',actionId:'fridge'});
enqueueAction(seed.actionQueues,'mira',{type:'object',actionId:'sofa'});
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const problems=[],screens=[];
mkdirSync('ux01-artifacts',{recursive:true});
const sizes=[[390,844],[375,667],[320,568],[844,390]];
const positions=async page=>page.evaluate(()=>{
 const ids=['#plan-peek','#dashboard','#pick-alex','#pick-mira',
  '#pause-btn','#speed-btn','#calendar-anchor-toggle','#home-open',
  '#career-phone-toggle','#view-toggle'];
 return Object.fromEntries(ids.map(id=>{
  const e=document.querySelector(id),r=e.getBoundingClientRect(),c=getComputedStyle(e);
  return [id,{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),
   h:Math.round(r.height),visible:c.display!=='none'&&r.width>0&&r.height>0,
   clipped:r.top<0||r.left<0||r.right>innerWidth||r.bottom>innerHeight}];
 }));
});
async function run(build,w,h){
 const ctx=await browser.newContext({viewport:{width:w,height:h},
   isMobile:true,hasTouch:true,deviceScaleFactor:1});
 await ctx.addInitScript(({key,record,tourKey})=>{
  localStorage.setItem(key,JSON.stringify(record));
  localStorage.setItem(tourKey,'done');
  localStorage.removeItem('blins.ui.hud.compact.v1');
 },{key:SAVE_KEY,record:seed,tourKey:UI_TOUR_STORAGE_KEY});
 const page=await ctx.newPage();
 page.on('pageerror',e=>problems.push(build+' '+w+'x'+h+' page '+e.message));
 page.on('crash',()=>problems.push(build+' '+w+'x'+h+' crash'));
 page.on('requestfailed',r=>{
  if(r.url().includes('/src/') || r.url().includes('/vendor/'))
   problems.push(build+' '+w+'x'+h+' request '+r.url()+' '+r.failure()?.errorText);
 });
 try{
  await page.goto('http://127.0.0.1:'+(build==='baseline'?8766:8765)+'/',{
   waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
  const frame=await page.locator('#game-canvas').screenshot();
  assert.ok(frame.length>2000,'genuine PlayCanvas WebGL scene '+build+' '+w+'x'+h);
  const initial=await positions(page);
  await page.screenshot({path:'ux01-artifacts/'+build+'-life-'+w+'x'+h+'.png',
   animations:'disabled'});
  screens.push({build,w,h,life:initial});
  if(build==='baseline')return;
  assert.equal((await page.locator('#plan-label').innerText()).trim(),'План · 2');
  assert.match(await page.locator('#plan-resident').innerText(),/Алекс/);
  for(const id of ['#plan-peek','#pick-alex','#pick-mira','#pause-btn',
   '#speed-btn','#calendar-anchor-toggle','#home-open','#career-phone-toggle',
   '#view-toggle']){
   const r=initial[id];
   assert.ok(r.visible&&!r.clipped&&r.w>=43&&r.h>=43,id+' touch '+w+'x'+h);
  }
  await page.locator('#plan-peek').tap();
  assert.equal(await page.locator('#queue-panel').isVisible(),true);
  assert.match(await page.locator('#queue-title').innerText(),/Алекс/);
  assert.equal(await page.locator('#queue-items li').count(),2);
  for(const id of ['#queue-alex','#queue-mira','#queue-close']){
   const r=await page.locator(id).boundingBox();
   assert.ok(r?.width>=44&&r.height>=44,id+' must be touch-sized');
  }
  await page.locator('#queue-mira').tap();
  assert.equal(await page.locator('#queue-mira').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#pick-alex').getAttribute('aria-pressed'),'true',
   'inspecting Mira must not steal control');
  assert.equal(await page.locator('#queue-items li').count(),1);
  assert.match(await page.locator('#queue-person-note').innerText(),/не переключает/);
  const untouched=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY);
  assert.equal(untouched.actionQueues.byResident.alex.length,2);
  assert.equal(untouched.actionQueues.byResident.mira.length,1);
  assert.equal(untouched.selectedSim,'alex');
  await page.screenshot({path:'ux01-artifacts/candidate-mira-plan-'+w+'x'+h+'.png',
   animations:'disabled'});
  // Remove a FUTURE Mira task: neither Alex FIFO nor active action changes.
  await page.locator('#queue-items li button').first().tap();
  const changed=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY);
  assert.equal(changed.actionQueues.byResident.alex.length,2);
  assert.equal(changed.actionQueues.byResident.mira.length,0);
  assert.equal(changed.selectedSim,'alex');
  assert.equal(await page.locator('#queue-mira').getAttribute('aria-pressed'),'true');
  await page.locator('#queue-close').tap();
  await page.locator('#pick-mira').tap();
  assert.equal(await page.locator('#pick-mira').getAttribute('aria-pressed'),'true');
  assert.equal((await page.locator('#plan-label').innerText()).trim(),'План · 0');
  await page.locator('#plan-peek').tap();
  await page.locator('#queue-alex').tap();
  assert.equal(await page.locator('#pick-mira').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#queue-items li').count(),2);
  await page.locator('#queue-close').tap();
  await page.locator('#calendar-anchor-toggle').tap();
  assert.equal(await page.locator('#calendar-anchor-panel').isVisible(),true);
  await page.locator('#calendar-anchor-close').tap();
  await page.locator('#home-open').tap();
  assert.equal(await page.locator('#home-panel').isVisible(),true);
  await page.locator('#home-close').tap();
  await page.locator('#career-phone-toggle').tap();
  assert.equal(await page.locator('#career-phone-panel').isVisible(),true);
  await page.locator('.career-phone-x').tap();
  await page.locator('#view-toggle').tap();
  assert.equal(await page.locator('#view-panel').isVisible(),true);
  await page.locator('#view-close').tap();
  await page.locator('#save-btn').count(); // save remains in its existing menu
  const final=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY);
  assert.equal(final.version,1);
  assert.equal(final.actionQueues.byResident.alex.length,2);
  assert.equal(final.actionQueues.byResident.mira.length,0);
  await page.screenshot({path:'ux01-artifacts/candidate-after-plan-'+w+'x'+h+'.png',
   animations:'disabled'});
 }finally{await ctx.close();}
}
try{
 for(const [w,h]of sizes){
  await run('baseline',w,h);
  await run('candidate',w,h);
 }
 assert.deepEqual(problems,[]);
 writeFileSync('ux01-artifacts/measurements.json',JSON.stringify({
  baselineSha,comparison:'paused, identical root-v1 queue + camera + 4 real SwiftShader WebGL viewports',
  screens},null,2)+'\\n');
 console.log('UX-01 four-view baseline/candidate PlayCanvas WebGL PASS:',screens.length);
}finally{await browser.close();}
