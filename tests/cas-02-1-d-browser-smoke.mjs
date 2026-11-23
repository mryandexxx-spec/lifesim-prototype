/** CAS-02.1-D: real source Alex GLB, two true foot mesh choices, actual PlayCanvas mobile sizes. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
mkdirSync('artifacts/cas-02-1-d',{recursive:true});
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const results=[];
try{
 for(const [width,height] of [[390,844],[320,568]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,
   isMobile:true,hasTouch:true,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('crash',()=>errors.push('renderer crash'));
  await page.goto('http://127.0.0.1:8765/cas-alex-wardrobe-lab.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__LifeSimCasAlexProbe?.().loaded===true,{timeout:70000});
  const probe=()=>page.evaluate(()=>window.__LifeSimCasAlexProbe());
  let state=await probe();
  assert.equal(state.graphics,true,'actual PlayCanvas graphics device must render original Alex');
  assert.equal(state.originalSkin,true,'original footwear must be its own real skinned mesh');
  assert.equal(state.alternativeSkin,true,'alternative footwear must be its own real skinned mesh');
  assert.equal(state.originalFootwearVisible,true,'original shoes selected on first render');
  assert.equal(state.alternativeFootwearVisible,false);
  assert.equal(state.clips.length,10,'keep every original Alex animation');
  assert.ok(state.clips.includes('Walking')&&state.clips.includes('Sit_to_Stand_Transition_M'));
  assert.ok(state.frame.headY>=state.frame.topSafe-10,
   'Alex head visible above safe top: '+JSON.stringify(state.frame));
  assert.ok(state.frame.footY<state.frame.dockTop-5,
   'Alex shoes visible above controls: '+JSON.stringify(state.frame));
  assert.ok(state.frame.pitch>=-5&&state.frame.pitch<=8,'front facing instead of top down');
  const hit=await page.locator('#alex-footwear-swap').boundingBox();
  assert.ok(hit&&hit.height>=43.5&&hit.width>=100&&hit.y>=0&&hit.y+hit.height<=height,
   'accessible on-screen 44px real footwear switch');
  await page.locator('#pause-animation').tap();
  await page.waitForTimeout(130);
  const before=await page.locator('#lab-canvas').screenshot();
  await page.locator('#alex-footwear-swap').tap();
  await page.waitForTimeout(250);
  state=await probe();
  assert.equal(state.originalFootwearVisible,false);
  assert.equal(state.alternativeFootwearVisible,true);
  const after=await page.locator('#lab-canvas').screenshot();
  assert.notEqual(createHash('sha256').update(before).digest('hex'),
   createHash('sha256').update(after).digest('hex'),
   'actual rendered GLB canvas must change pixels when shoes are switched');
  await page.screenshot({path:'artifacts/cas-02-1-d/'+width+'x'+height+'-alternate.png'});
  await page.locator('#alex-footwear-swap').tap();
  state=await probe();assert.equal(state.originalFootwearVisible,true);
  assert.equal(state.alternativeFootwearVisible,false);
  await page.locator('#pause-animation').tap();
  await page.locator('#clip-select').selectOption('Walking');
  await page.waitForTimeout(330);
  await page.screenshot({path:'artifacts/cas-02-1-d/'+width+'x'+height+'-walking-original.png'});
  assert.equal(await page.locator('#lab-status').innerText()!=='',true);
  assert.equal(await page.evaluate(()=>localStorage.getItem('lifesim.room01.v1')),null,
   'standalone wardrobe lab cannot alter legacy resident save');
  assert.deepEqual(errors,[],'no JS errors / renderer crashes');
  results.push({width,height,originalAlexClips:state.clips.length,realFootwearPair:true,
   reversible:true,canvasPixelsChanged:true,headVisible:true,shoesVisible:true,
   jsErrors:0,physicalSafariAccepted:false});
  await context.close();
 }
}finally{
 await browser.close();
 writeFileSync('artifacts/cas-02-1-d/browser.json',JSON.stringify(results,null,2));
 console.log('CAS-02.1-D REAL ALEX WEBGL '+JSON.stringify(results));
}