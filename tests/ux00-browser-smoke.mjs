/** UX-00: reproducible baseline-vs-candidate iPhone-size WebGL/DOM atlas and startup recovery.
 * Each viewport uses the same persisted household, camera, clock and tour preference.
 * Chromium/SwiftShader is NOT a physical iPhone Safari acceptance.
 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
const sizes=[[390,844],[375,667],[320,568],[844,390]];
const base=newHousehold('2026-11-20');
base.paused=true;base.otherSim.paused=true;
base.autonomy.enabled=false;base.otherSim.autonomy.enabled=false;
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
mkdirSync('ux00-artifacts',{recursive:true});
const report=[],problems=[];
const views={
 'first-run':['#tour-panel','#tour-next','#tour-skip'],
 'life':['#plan-peek','#queue-toggle','#pause-btn','#speed-btn','#pick-alex','#pick-mira','#home-open','#career-phone-toggle','#view-toggle'],
 'catalog':['#furniture-editor','#furnish-shop','#furnish-buy','#furnish-shop-toggle'],
 'placement':['#furnish-placement-guide','#furnish-buy','#furnish-place-cancel'],
 'build':['#build-editor','#build-exit','#build-instruction'],
 'phone':['#career-phone-panel','.career-phone-x'],
 'returning':['#plan-peek','#home-open','#career-phone-toggle']
};
async function snap(page,build,w,h,mode){
 const selectors=views[mode];
 const metrics=await page.evaluate(selectors=>selectors.map(selector=>{
  const el=document.querySelector(selector);
  if(!el)return {selector,found:false};
  const cs=getComputedStyle(el),r=el.getBoundingClientRect();
  const visible=!el.hidden&&cs.display!=='none'&&cs.visibility!=='hidden'&&
   Number(cs.opacity)!==0&&r.width>0&&r.height>0;
  const clipped=visible&&(r.top<0||r.left<0||r.bottom>innerHeight||r.right>innerWidth);
  return {selector,found:true,visible,clipped,rect:{
   x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},
   hit44:visible&&r.width>=44&&r.height>=44};
 }),selectors);
 report.push({build,viewport:w+'x'+h,mode,metrics});
 await page.screenshot({path:'ux00-artifacts/'+build+'-'+mode+'-'+w+'x'+h+'.png',animations:'disabled'});
}
async function run(build,w,h){
 const ctx=await browser.newContext({viewport:{width:w,height:h},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 await ctx.addInitScript(({key,seed})=>{
  if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));
 },{key:SAVE_KEY,seed:base});
 const page=await ctx.newPage();
 page.on('pageerror',e=>problems.push(build+' '+w+'×'+h+' '+e.message));
 try{
  await page.goto('http://127.0.0.1:'+(build==='baseline'?8766:8765)+'/',{waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
  await page.locator('#tour-panel').waitFor({state:'visible',timeout:8000});
  await snap(page,build,w,h,'first-run');
  if(build==='candidate'){
   assert.match(await page.locator('#tour-tip').innerText(),/Камера/);
   await page.locator('#tour-next').click();
   assert.match(await page.locator('#tour-body').innerText(),/земли/);
   assert.match(await page.locator('#tour-tip').innerText(),/«Меню»/);
  }
  await page.locator('#tour-skip').click();
  await snap(page,build,w,h,'life');
  await page.locator('#home-open').click();
  await page.locator('#home-furnish').click();
  await page.locator('#furnish-shop-toggle').click();
  await snap(page,build,w,h,'catalog');
  const product=page.locator('#furnish-stock button[data-item-id]').first();
  await product.waitFor({state:'visible',timeout:10000});
  await product.click();
  // UX-02a enters preview directly from the card. UX-00 baseline still uses
  // its former card -> Buy path; compare the same *placement* state.
  const placing=()=>page.locator('#furniture-editor').getAttribute('data-shop-placing');
  if(await placing()!=='true'&&await page.locator('#furnish-buy').isEnabled())
   await page.locator('#furnish-buy').click();
  if(await placing()==='true'){
   assert.equal(await placing(),'true');
   await snap(page,build,w,h,'placement');
   await page.locator('#furnish-place-cancel').click();
  }else{
   problems.push(build+' '+w+'×'+h+' no affordable catalog item for placement');
  }
  await page.locator('#furnish-exit').click();
  await page.locator('#home-open').click();
  await page.locator('#home-build').click();
  await snap(page,build,w,h,'build');
  await page.locator('#build-exit').click();
  await page.locator('#career-phone-toggle').click();
  await page.locator('#career-phone-panel').waitFor({state:'visible',timeout:10000});
  await snap(page,build,w,h,'phone');
  await page.locator('.career-phone-x').click();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
  assert.equal(await page.locator('#tour-panel').isVisible(),false,'tour skipped on returning visit');
  await snap(page,build,w,h,'returning');
  assert.equal((await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY)).version,1);
 }finally{await ctx.close();}
}
// Disable only WebGL to force a real PlayCanvas graphics boot error. Retry must
// not overwrite an existing save, including the 8-second global autosave tick.
async function failedBoot(){
 for(const seeded of [true,false]){
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await ctx.addInitScript(({key,seed,seeded})=>{
   if(seeded)localStorage.setItem(key,JSON.stringify(seed));
   const old=HTMLCanvasElement.prototype.getContext;
   HTMLCanvasElement.prototype.getContext=function(type,...args){
     if(/^webgl/i.test(type)||type==='experimental-webgl')return null;
     return old.call(this,type,...args);
   };
  },{key:SAVE_KEY,seed:base,seeded});
  try{
   const page=await ctx.newPage();
   await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
   const expected=await page.evaluate(k=>localStorage.getItem(k),SAVE_KEY);
   await page.locator('#startup-retry').waitFor({state:'visible',timeout:20000});
   assert.match(await page.locator('#loading').innerText(),/Повторить/);
   const b=await page.locator('#startup-retry').boundingBox();
   assert.ok(b?.width>=44&&b.height>=44,'retry is touch-accessible');
   await page.waitForTimeout(8500);
   assert.equal(await page.evaluate(k=>localStorage.getItem(k),SAVE_KEY),expected,
    'failed boot must preserve saved bytes through autosave tick');
   await Promise.all([
    page.waitForNavigation({waitUntil:'domcontentloaded'}),
    page.locator('#startup-retry').click()
   ]);
   await page.locator('#startup-retry').waitFor({state:'visible',timeout:20000});
   assert.equal(await page.evaluate(k=>localStorage.getItem(k),SAVE_KEY),expected,
    'manual retry must not write an empty household');
   await page.screenshot({path:'ux00-artifacts/candidate-startup-failure-'+(seeded?'existing':'new')+'.png'});
  }finally{await ctx.close();}
 }
}
try{
 for(const [w,h] of sizes)for(const build of ['baseline','candidate'])await run(build,w,h);
 await failedBoot();
 assert.deepEqual(problems,[]);
 writeFileSync('ux00-artifacts/measurements.json',JSON.stringify({
  baselineSha:'a0162d62d7dbdb8b5ba1fb5d45371c3c36dd169a',
  conditions:'paused household, identical 2026-11-20 saved state, default camera, PlayCanvas 2.24.1, SwiftShader',
  report},null,2)+'\n');
 console.log('UX-00 baseline and candidate WebGL/DOM + startup recovery PASS:',report.length);
}finally{await browser.close();}
