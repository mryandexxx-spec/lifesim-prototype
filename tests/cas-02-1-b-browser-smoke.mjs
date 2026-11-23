/** CAS-02.1-B: real PlayCanvas/GLB skinning and detachable geometry in two iPhone-sized browsers. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';

mkdirSync('artifacts/cas-02-1-b',{recursive:true});
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const report=[];
try{
 for(const [width,height] of [[390,844],[320,568]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:true,hasTouch:true,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('crash',()=>errors.push('renderer crash'));
  await page.goto('http://127.0.0.1:8765/cas-modular-lab.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__LifeSimCasModularProbe?.().loaded===true,{timeout:70000});
  let snapshot=await page.evaluate(()=>window.__LifeSimCasModularProbe());
  assert.ok(snapshot.graphics,'PlayCanvas WebGL graphics device required');
  assert.equal(snapshot.slots.length,4);
  assert.ok(snapshot.slots.every(x=>x.base===true&&x.alternate===false));
  assert.deepEqual(snapshot.clips,['idle','walk','sit','bed']);
  for(const slot of ['hair','top','trousers','shoes']){
   await page.locator('[data-cas-slot="'+slot+'"]').tap();
   snapshot=await page.evaluate(()=>window.__LifeSimCasModularProbe());
   assert.equal(snapshot.slots.find(x=>x.slot===slot).base,false,slot+' base really hidden');
   assert.equal(snapshot.slots.find(x=>x.slot===slot).alternate,true,slot+' alternate visible');
  }
  await page.locator('#clip-select').selectOption('walk');
  await page.waitForTimeout(350);
  await page.screenshot({path:'artifacts/cas-02-1-b/'+width+'x'+height+'-walk-alt.png'});
  for(const clip of ['sit','bed','idle']){
   await page.locator('#clip-select').selectOption(clip);
   await page.waitForTimeout(180);
  }
  const status=await page.locator('#lab-status').innerText();
  assert.match(status,/Загружено/);
  assert.deepEqual(errors,[],'no page errors or renderer crashes');
  // Isolated lab must not write canonical household localStorage.
  assert.equal(await page.evaluate(()=>localStorage.getItem('lifesim.room01.v1')),null);
  report.push({width,height,skinLoaded:true,uniqueSlotPairs:4,realMeshSwaps:4,animations:snapshot.clips.length,errors:0,webgl:true,physicalSafariAccepted:false});
  await context.close();
 }
}finally{
 await browser.close();
 writeFileSync('artifacts/cas-02-1-b/browser.json',JSON.stringify(report,null,2));
 console.log('CAS-02.1-B mobile Chromium PlayCanvas actual modular GLB results '+JSON.stringify(report));
}