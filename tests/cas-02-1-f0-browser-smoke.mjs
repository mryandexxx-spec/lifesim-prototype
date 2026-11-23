import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ASSET_SHA256} from '../scripts/cas-02-1-f0-download-assets.mjs';
const dir='artifacts/cas-02-1-f0';
mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const reports=[];
try{
 for(const [width,height] of [[390,844],[320,568]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,
   isMobile:true,hasTouch:true,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('crash',()=>errors.push('renderer crash'));
  await page.goto('http://127.0.0.1:8765/cas-cc0-shoe-fit-lab.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__LifeSimCasF0Probe?.().loaded===true,{timeout:70000});
  const probe=()=>page.evaluate(()=>window.__LifeSimCasF0Probe());
  let state=await probe();
  assert.equal(state.sourceAlex,true);
  assert.equal(state.clips.length,10,'actual old Alex animation library must be present');
  assert.equal(state.assetId,'dress');
  assert.equal(state.assetHash,ASSET_SHA256.dress);
  assert.equal(state.license,'CC0-1.0');
  assert.equal(state.skinCount,0,'vendor model is not pre-rigged');
  assert.equal(state.sourceShoeVisible,true,'source Alex shoes remain in compare mode');
  assert.equal(state.mode,'compare');
  const shoebox=await page.locator('#source-shoes').boundingBox();
  assert.ok(shoebox&&shoebox.height>=43&&shoebox.y+shoebox.height<=height);
  const modebox=await page.locator('#fit-mode').boundingBox();
  assert.ok(modebox&&modebox.height>=43&&modebox.y+modebox.height<=height);
  const hashes=[];
  for(const key of ['dress','sneakers','boots']){
   await page.locator('#source-shoes').selectOption(key);
   await page.waitForFunction(id=>window.__LifeSimCasF0Probe?.().assetId===id,key);
   await page.waitForTimeout(200);
   state=await probe();
   assert.equal(state.assetHash,ASSET_SHA256[key]);
   assert.equal(state.license,'CC0-1.0');
   assert.ok(state.triangles>10000);
   assert.ok(state.geometryBounds.visible);
   const screenshot=await page.locator('#fit-canvas').screenshot();
   hashes.push(createHash('sha256').update(screenshot).digest('hex'));
   await page.screenshot({path:dir+'/'+width+'x'+height+'-'+key+'-beside-Alex.png'});
  }
  assert.equal(new Set(hashes).size,3,'three genuinely different source GLB 3D renderings');
  await page.locator('#fit-mode').selectOption('mock');
  state=await probe();
  assert.equal(state.mode,'mock');
  assert.equal(state.sourceShoeVisible,false,'original shoe hidden ONLY during explicitly static fit test');
  assert.ok(state.geometryBounds.scale>0.2&&state.geometryBounds.scale<5);
  await page.screenshot({path:dir+'/'+width+'x'+height+'-boots-static-fit.png'});
  await page.locator('#fit-mode').selectOption('compare');
  state=await probe();
  assert.equal(state.sourceShoeVisible,true,'original real Alex source shoes restored');
  assert.deepEqual(errors,[],'browser should have no JS errors');
  assert.equal(await page.evaluate(()=>localStorage.getItem('lifesim.room01.v1')),null);
  reports.push({width,height,realSourceGLBs:3,cc0Manifests:3,
   baseResident:'alex',sourceClips:state.clips.length,
   shaPinned:true,visuallyDistinct:3,staticFitExplicitlyUnrigged:true,
   physicalSafariAccepted:false,jsErrors:0});
  await context.close();
 }
}finally{
 await browser.close();
 writeFileSync(dir+'/browser.json',JSON.stringify(reports,null,2));
 console.log('CAS-02.1-F0 REAL VENDOR CC0 GLB WEBGL '+JSON.stringify(reports));
}