import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ASSET_SHA256} from '../scripts/cas-02-1-f0-download-assets.mjs';
const dir='artifacts/cas-02-1-f1';
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
  page.on('pageerror',error=>errors.push(error.message));
  page.on('crash',()=>errors.push('Chromium renderer crash'));
  await page.goto('http://127.0.0.1:8765/cas-cc0-shoe-rig-lab.html',
   {waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__LifeSimCasF1Probe?.().loaded===true,{timeout:70000});
  const probe=()=>page.evaluate(()=>window.__LifeSimCasF1Probe());
  let s=await probe();
  assert.equal(s.license,'CC0-1.0');
  assert.equal(s.vendorSourceHash,ASSET_SHA256.dress);
  assert.equal(s.sourceClips.length,10,'the ORIGINAL Alex ten animations, not a mannequin');
  assert.equal(s.sourceTriangles,19744);
  assert.equal(s.twoSeparateMeshes,true);
  assert.equal(s.riggingType,'per-foot rigid attachment');
  assert.equal(s.skinDeformation,false,'should not falsely claim full skinned shoe');
  assert.equal(s.mode,'dress');
  assert.equal(s.sourceShoesVisible,false);
  assert.ok(s.footPixelY>40&&s.footPixelY<s.panelTop-20,
   'source foot / attached footwear must be visible above mobile panel');
  for(const side of ['left','right']){
   const item=s.binding[side];
   assert.equal(item.parentFoot,true,'shoe must follow its own real foot bone');
   assert.equal(item.visible,true);
   assert.match(item.boneName,/mixamorig:(?:LeftFoot|RightFoot)$/);
   assert.match(item.toeName,/mixamorig:(?:LeftToeBase|RightToeBase)$/);
   assert.ok(item.meshTriangles>6000);
   assert.ok(item.scale>.4&&item.scale<4);
   assert.ok(item.anchorDistance<.3,'shoe should be physically close to foot');
  }
  const control=await page.locator('#shoe-choice').boundingBox();
  assert.ok(control&&control.height>=43&&control.y+control.height<=height);
  const wearing=await page.locator('#rig-canvas').screenshot();
  await page.screenshot({path:dir+'/'+width+'x'+height+'-leather-worn.png'});
  await page.locator('#shoe-choice').selectOption('source');
  s=await probe();
  assert.equal(s.sourceShoesVisible,true);
  for(const p of Object.values(s.binding))assert.equal(p.visible,false);
  const original=await page.locator('#rig-canvas').screenshot();
  assert.notEqual(createHash('sha256').update(wearing).digest('hex'),
    createHash('sha256').update(original).digest('hex'),
    'real CC0 dress shoes must look different to original white sneakers');
  await page.screenshot({path:dir+'/'+width+'x'+height+'-original-restored.png'});
  await page.locator('#shoe-choice').selectOption('dress');
  await page.locator('#animation-clip').selectOption('Walking');
  await page.waitForTimeout(100);
  const start=await probe();
  await page.waitForTimeout(700);
  const walked=await probe();
  assert.equal(walked.currentClip,'Walking');
  assert.equal(walked.binding.left.parentFoot,true);
  assert.equal(walked.binding.right.parentFoot,true);
  const changed=['left','right'].some(side=>
   ['x','y','z'].some(axis=>Math.abs(
    start.binding[side].worldFoot[axis]-walked.binding[side].worldFoot[axis])>.001));
  assert.ok(changed,'actual Alex animation must move at least one attached foot');
  await page.screenshot({path:dir+'/'+width+'x'+height+'-walking-leather.png'});
  await page.locator('#animation-clip').selectOption('Running');
  await page.waitForTimeout(400);
  s=await probe();
  assert.equal(s.currentClip,'Running');
  for(const p of Object.values(s.binding))assert.equal(p.parentFoot,true);
  await page.screenshot({path:dir+'/'+width+'x'+height+'-running-leather.png'});
  assert.equal(await page.evaluate(()=>localStorage.getItem('lifesim.room01.v1')),null);
  assert.deepEqual(errors,[],'real PlayCanvas WebGL must be free of JS errors');
  reports.push({width,height,sourceAlexClips:s.sourceClips.length,
   originalRestored:true,perFootAnchors:true,animations:['Walking','Running'],
   cc0SourcePinned:true,noSaveChanges:true,jsErrors:0,
   physicalIphoneApproved:false});
  await context.close();
 }
}finally{
 await browser.close();
 writeFileSync(dir+'/browser.json',JSON.stringify(reports,null,2));
 console.log('CAS-02.1-F1 REAL ALEX FOOT-RIG WEBGL '+JSON.stringify(reports));
}
