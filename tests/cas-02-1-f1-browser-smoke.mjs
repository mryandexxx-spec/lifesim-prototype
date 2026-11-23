import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import {ASSET_SHA256} from '../scripts/cas-02-1-f0-download-assets.mjs';
const dir='artifacts/cas-02-1-f1';
mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
/** Prevent false-positive WebGL smoke: an all-background canvas is NOT a visible avatar.
 * Decode actual Playwright PNG pixels with only built-in Node modules.
 */
function realRenderedColors(png,panelTop){
 let offset=8,width=0,height=0,channels=0,depth=0,interlace=0;
 const compressed=[];
 if(png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('not a PNG screenshot');
 while(offset+12<=png.length){
  const len=png.readUInt32BE(offset),type=png.toString('ascii',offset+4,offset+8);
  const value=png.subarray(offset+8,offset+8+len);
  if(type==='IHDR'){
   width=value.readUInt32BE(0);height=value.readUInt32BE(4);
   depth=value[8];channels=value[9]===6?4:value[9]===2?3:0;
   interlace=value[12];
  }
  if(type==='IDAT')compressed.push(value);
  offset+=12+len;
  if(type==='IEND')break;
 }
 if(depth!==8||!channels||interlace!==0)throw Error('Unsupported PNG pixel format');
 const bytes=inflateSync(Buffer.concat(compressed)),stride=width*channels;
 const colors=new Set();let prev=Buffer.alloc(stride),cursor=0;
 for(let y=0;y<height;y++){
  const filter=bytes[cursor++],row=Buffer.from(bytes.subarray(cursor,cursor+stride));
  cursor+=stride;
  for(let i=0;i<stride;i++){
   const a=i>=channels?row[i-channels]:0,b=prev[i],c=i>=channels?prev[i-channels]:0;
   let predictor=0;
   if(filter===1)predictor=a;
   else if(filter===2)predictor=b;
   else if(filter===3)predictor=Math.floor((a+b)/2);
   else if(filter===4){
    const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);
    predictor=pa<=pb&&pa<=pc?a:pb<=pc?b:c;
   }else if(filter!==0)throw Error('Unknown PNG filter '+filter);
   row[i]=(row[i]+predictor)&255;
  }
  // Avoid UI overlay and sample the character's central portion above the dock.
  if(y>=75&&y<Math.min(height*.72,panelTop-20)&&y%3===0){
   for(let x=Math.floor(width*.18);x<width*.82;x+=3){
    const i=x*channels;
    colors.add((row[i]<<16)|(row[i+1]<<8)|row[i+2]);
   }
  }
  prev=row;
 }
 return colors.size;
}
const reports=[];
try{
 for(const [width,height] of [[390,844],[320,568]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,
    isMobile:true,hasTouch:true,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];
  // Force a slow real CC0 shoe transfer to reproduce the owner's iPhone
  // screenshot: original Meshy sneakers must NEVER flash through meanwhile.
  await page.route('**/assets/characters/cas-cc0-f1/dress-right.glb',async route=>{
   await new Promise(resolve=>setTimeout(resolve,1800));
   await route.continue();
  });
  page.on('pageerror',error=>errors.push(error.message));
  page.on('crash',()=>errors.push('Chromium renderer crash'));
  await page.goto('http://127.0.0.1:8765/cas-cc0-shoe-rig-lab.html',
   {waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>{
   const p=window.__LifeSimCasF1Probe?.();
   return !!p?.avatarInstantiated&&!p.loaded;
  },null,{timeout:70000});
  const probe=()=>page.evaluate(()=>window.__LifeSimCasF1Probe());
  let s=await probe();
  assert.equal(s.previewRevealed,false);
  assert.equal(s.previewRendersSuppressed,true,
   'source Meshy white sneakers must NOT flash while true CC0 shoes download');
  await page.screenshot({path:dir+'/'+width+'x'+height+'-loading-no-meshy-sneaker-flash.png'});
  await page.waitForFunction(()=>window.__LifeSimCasF1Probe?.().loaded===true,null,{timeout:70000});
  s=await probe();
  assert.equal(s.previewRevealed,true);
  assert.equal(s.previewRendersSuppressed,false);
  assert.equal(s.license,'CC0-1.0');
  assert.equal(s.vendorSourceHash,ASSET_SHA256.dress);
  assert.equal(s.sourceClips.length,10,'the ORIGINAL Alex ten animations, not a mannequin');
  assert.equal(s.sourceTriangles,19744);
  assert.equal(s.twoSeparateMeshes,true);
  assert.equal(s.riggingType,'per-foot rigid attachment');
  assert.equal(s.skinDeformation,false,'should not falsely claim full skinned shoe');
  assert.equal(s.mode,'dress');
  assert.equal(s.sourceShoesVisible,false);
  assert.equal(s.sourceSneakerResidueVisible,false,'white source sneaker body triangles must be HIDDEN when wearing CC0 shoes');
  assert.ok(s.cameraHeight>.25,'camera must be above the floor, not beneath it: '+JSON.stringify(s.view));
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
   assert.ok(item.verticalFactor>=1.3&&item.verticalFactor<=2.2);
   assert.ok(item.collarAboveAnkle>=.005&&item.collarAboveAnkle<=.045,
    'shoe throat must reach actual Alex ankle, not leave the white air gap seen in Safari: '+
    JSON.stringify(item));
   assert.ok(item.soleWorldY>=-.01&&item.soleWorldY<=.045,
    'shoe cannot float above the source floor as a shortcut to closing ankle gap: '+
    JSON.stringify(item));
   assert.ok(s.footBonesPixelY[side]>20&&s.footBonesPixelY[side]<s.panelTop-12,
    'ACTUAL foot bone must be visible above controls: '+JSON.stringify(s.footBonesPixelY));
  }
  const control=await page.locator('#shoe-choice').boundingBox();
  assert.ok(control&&control.height>=43&&control.y+control.height<=height);
  const wearing=await page.locator('#rig-canvas').screenshot();
  const actualColors=realRenderedColors(wearing,s.panelTop);
  assert.ok(actualColors>175,
   'actual textured Alex and BOTH shoe meshes must visibly render, not blank floor/background: '+actualColors);
  await page.screenshot({path:dir+'/'+width+'x'+height+'-leather-worn.png'});
  // The reported iPhone visual defect was clear from a SIDE view:
  // a visible air gap below jeans and above the empty leather shoe collars.
  // Exercise a genuine canvas drag, then capture that same critical angle.
  await page.mouse.move(width*.77,height*.24);
  await page.mouse.down();
  await page.mouse.move(width*.24,height*.24,{steps:10});
  await page.mouse.up();
  s=await probe();
  assert.ok(s.view.yaw>62&&s.view.yaw<112,
   'side-view iPhone QA must rotate the actual camera via canvas pointer events');
  await page.screenshot({path:dir+'/'+width+'x'+height+'-ankle-side-worn.png'});
  await page.locator('#camera-reset').click();
  await page.locator('#shoe-choice').selectOption('source');
  s=await probe();
  assert.equal(s.sourceShoesVisible,true);
  assert.equal(s.sourceSneakerResidueVisible,true,'masked original source must return with white sneakers');
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
   actualRenderedColors:actualColors,sourceShoeFlashSuppressed:true,
   sideAngleQA:true,ankleRimOverlap:true,
   groundedSoles:true,physicalIphoneApproved:false});
  await context.close();
 }
}finally{
 await browser.close();
 writeFileSync(dir+'/browser.json',JSON.stringify(reports,null,2));
 console.log('CAS-02.1-F1 REAL ALEX FOOT-RIG WEBGL '+JSON.stringify(reports));
}
