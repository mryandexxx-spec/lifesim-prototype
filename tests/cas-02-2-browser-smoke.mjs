/** CAS-02.2-A: original Alex/Mira morph-shape real PlayCanvas test, two mobile viewports. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
mkdirSync('artifacts/cas-02-2-a',{recursive:true});
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const results=[];
const hash=data=>createHash('sha256').update(data).digest('hex');
try{
 for(const resident of ['alex','mira'])for(const [width,height] of [[390,844],[320,568]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,
   isMobile:true,hasTouch:true,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('crash',()=>errors.push('renderer crash'));
  await page.goto('http://127.0.0.1:8765/cas-02-2-lab.html?resident='+resident,
    {waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__LifeSimCas022Probe?.().loaded===true,{timeout:65000});
  const probe=()=>page.evaluate(()=>window.__LifeSimCas022Probe());
  let state=await probe();
  assert.equal(state.graphics,true);
  assert.equal(state.resident,resident,'each original has its own source skin');
  assert.equal(state.morphCount,2,'two live PlayCanvas MorphTargets');
  assert.ok(state.weights.every(x=>x===0),'original geometry is always the default');
  assert.equal(state.clips.length,resident==='alex'?10:13,'all original animation clips preserved');
  assert.ok(state.frame.headY>=state.frame.topSafe-15,'head not cropped by top overlay');
  assert.ok(state.frame.footY<state.frame.dockTop-5,'feet above bottom control dock');
  for(const id of ['cas022-head','cas022-torso']){
   const field=page.locator('#'+id);
   const rect=await field.boundingBox();
   assert.ok(rect&&rect.height>=43.5,'44px interactive morph control '+id);
   assert.equal(await field.isEnabled(),true,'live controls only after real GLB load');
  }
  await page.locator('#pause-animation').tap();
  const original=hash(await page.locator('#lab-canvas').screenshot());
  await page.locator('#cas022-head').evaluate(el=>{
   el.value='100';el.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await page.waitForTimeout(220);
  state=await probe();
  assert.ok(state.weights[0]>.99&&state.weights[1]===0,'real head morph weight');
  const head=hash(await page.locator('#lab-canvas').screenshot());
  assert.notEqual(head,original,'morph of source head changes rendered GLB pixels');
  await page.screenshot({path:'artifacts/cas-02-2-a/'+resident+'-'+width+'x'+height+'-head.png'});
  await page.locator('#cas022-head').evaluate(el=>{
   el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await page.locator('#cas022-torso').evaluate(el=>{
   el.value='100';el.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await page.waitForTimeout(220);
  state=await probe();
  assert.ok(state.weights[1]>.99&&state.weights[0]===0,'real torso morph weight');
  const torso=hash(await page.locator('#lab-canvas').screenshot());
  assert.notEqual(torso,original,'torso morph changes real rendered geometry');
  await page.screenshot({path:'artifacts/cas-02-2-a/'+resident+'-'+width+'x'+height+'-body.png'});
  await page.locator('#cas022-torso').evaluate(el=>{
   el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));
  });
  assert.ok((await probe()).weights.every(x=>x===0),'reversible original face and silhouette');
  await page.locator('#pause-animation').tap();
  await page.locator('#clip-select').selectOption('Walking');
  await page.waitForTimeout(320);
  assert.deepEqual(errors,[],'no PlayCanvas errors/crashes');
  assert.equal(await page.evaluate(()=>localStorage.getItem('lifesim.room01.v1')),null,
    'isolated lab never writes to original save');
  results.push({resident,width,height,morphTargets:2,sourceClips:state.clips.length,
   renderedHeadChanged:true,renderedTorsoChanged:true,reversible:true,
   browser:'Chromium/SwiftShader',physicalIphoneAccepted:false});
  await context.close();
 }
}finally{
 await browser.close();
 writeFileSync('artifacts/cas-02-2-a/browser.json',JSON.stringify(results,null,2));
 console.log('CAS-02.2-A REAL-SOURCE MORPH WEBGL '+JSON.stringify(results));
}
