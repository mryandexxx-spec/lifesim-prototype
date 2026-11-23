import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const dir='artifacts/cas-02-1-f2-c2';
mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const report=[];
try{
 for(const [width,height] of [[390,844],[320,568]]){
  const context=await browser.newContext({viewport:{width,height},
   deviceScaleFactor:1,isMobile:true,hasTouch:true,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('crash',()=>errors.push('Chromium crashed'));
  await page.route('**/cas-cc0-f2/dress-right.glb',async route=>{
   await new Promise(resolve=>setTimeout(resolve,1100));
   await route.continue();
  });
  await page.goto('http://127.0.0.1:8765/cas-f2-footwear-lab.html',{waitUntil:'domcontentloaded'});
  const probe=()=>page.evaluate(()=>window.__LifeSimCasF2Probe?.());
  await page.waitForFunction(()=>!!window.__LifeSimCasF2Probe?.()?.avatarInstantiated,null,{timeout:70000});
  const loading=await probe();
  assert.equal(loading.previewRevealed,false);
  assert.equal(loading.previewRendersSuppressed,true,
   'original white shoes must not appear during real CC0 source load');
  await page.screenshot({path:dir+'/'+width+'x'+height+'-no-white-sneaker-flash.png'});
  await page.waitForFunction(()=>{
   const s=window.__LifeSimCasF2Probe?.();
   const t=document.querySelector('#lab-status')?.textContent||'';
   return s?.loaded===true||t.includes('примерка остановлена');
  },null,{timeout:25000});
  let s=await probe();
  if(!s?.loaded){
   const status=await page.locator('#lab-status').innerText();
   throw Error('F2 authentic PlayCanvas lab fail-closed: '+status+'; page errors: '+JSON.stringify(errors));
  }
  assert.equal(s.mode,'dress');
  assert.equal(s.previewRevealed,true);
  assert.equal(s.originalShoesVisible,false);
  assert.equal(s.originalResidueVisible,false);
  assert.equal(s.sourceClips.length,10,'must use genuine source Alex animation');
  assert.deepEqual(s.auditedSources.map(x=>x.id),['dress','sneakers','boots']);
  for(const x of s.auditedSources){
   assert.equal(x.orientationVerified,false,
    'geometric split alone cannot claim audited real left/right orientation');
   assert.equal(x.contactApproved,false);
  }
  assert.ok(s.attached.dress);
  for(const side of ['left','right']){
   const a=s.attached.dress.sides[side];
   assert.equal(a.parentFoot,true);
   assert.equal(a.visible,true);
   assert.equal(a.noVerticalStretch,true);
   assert.ok(a.scale>.2&&a.scale<1.5);
   assert.ok(s.sockLayers[side].faces>0,'anatomically animated sock must bridge low-cut shoe and ankle');
   assert.equal(s.sockLayers[side].originalGarment,true);
   assert.equal(s.sockLayers[side].layer,'sock');
  }
  const shoePixels=await page.locator('#rig-canvas').screenshot();
  assert.ok(shoePixels.length>15000,'real 3D canvas should not be a blank background');
  await page.screenshot({path:dir+'/'+width+'x'+height+'-dress-with-animated-socks.png'});

  await page.locator('#sock-choice').selectOption('off');
  s=await probe();
  for(const side of ['left','right']){
   assert.equal(s.sockLayers[side].layer,'neutral-foot');
   assert.ok(s.sockLayers[side].faces>0,'neutral foot must replace optional sock');
  }
  await page.screenshot({path:dir+'/'+width+'x'+height+'-neutral-skin-without-socks.png'});
  await page.locator('#sock-choice').selectOption('on');

  await page.locator('#animation-clip').selectOption('Walking');
  await page.waitForTimeout(180);
  const start=await probe();
  await page.waitForTimeout(680);
  const walked=await probe();
  assert.equal(walked.currentClip,'Walking');
  const changed=['left','right'].some(side=>
   ['x','y','z'].some(ax=>Math.abs(start.sockLayers[side].movingToe[ax]-
    walked.sockLayers[side].movingToe[ax])>.0008));
  assert.ok(changed,'genuine original Alex foot/toe bones must actually animate socks');
  await page.screenshot({path:dir+'/'+width+'x'+height+'-walking-with-socks.png'});
  await page.locator('#animation-clip').selectOption('Running');
  await page.waitForTimeout(280);
  s=await probe();
  assert.equal(s.currentClip,'Running');
  await page.screenshot({path:dir+'/'+width+'x'+height+'-running-with-socks.png'});

  await page.locator('#shoe-choice').selectOption('source');
  s=await probe();
  assert.equal(s.originalShoesVisible,true);
  assert.equal(s.originalResidueVisible,true);
  for(const x of Object.values(s.sockLayers))assert.equal(x.visible,false);
  const originalPixels=await page.locator('#rig-canvas').screenshot();
  assert.notEqual(createHash('sha256').update(shoePixels).digest('hex'),
    createHash('sha256').update(originalPixels).digest('hex'));
  await page.screenshot({path:dir+'/'+width+'x'+height+'-original-restored.png'});

  const styles=[];
  for(const id of ['sneakers','boots']){
   await page.locator('#shoe-choice').selectOption(id);
   await page.waitForFunction(id=>{
    const x=window.__LifeSimCasF2Probe?.();
    const status=document.querySelector('#lab-status')?.textContent||'';
    return x?.mode===id||status.includes('не прошла стандарт');
   },id,{timeout:80000});
   s=await probe();
   const fitted=s.mode===id;
   styles.push({id,fitted,status:await page.locator('#lab-status').innerText()});
   if(fitted){
    for(const side of ['left','right']){
     assert.equal(s.attached[id].sides[side].parentFoot,true);
     assert.equal(s.attached[id].sides[side].noVerticalStretch,true);
    }
    await page.screenshot({path:dir+'/'+width+'x'+height+'-'+id+'-candidate.png'});
   }else{
    assert.equal(await page.locator('#shoe-choice').inputValue(),s.mode,
     'failed source cannot leave phantom selection');
   }
  }
  assert.equal(await page.evaluate(()=>localStorage.getItem('lifesim.room01.v1')),null);
  assert.deepEqual(errors,[],'real WebGL must not throw JS errors');
  report.push({width,height,realModel:'original Alex',genuineSourcePairs:3,
   testedStyles:styles,neutralAnatomy:true,separateAnimatedSocks:true,
   originalRestored:true,noSaveChanges:true,jsErrors:0,
   sourceOrientationApproved:false,contactApproved:false,physicalIphoneApproved:false});
  await context.close();
 }
}finally{
 await browser.close();
 writeFileSync(dir+'/browser.json',JSON.stringify(report,null,2)+'\n');
 console.log('CAS F2-C2 real PlayCanvas outfit trial '+JSON.stringify(report));
}
