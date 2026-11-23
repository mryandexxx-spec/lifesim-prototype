/** CAS-02.1-E actual Alex/Mira original source-skinned footwear, not a simulated canvas. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

mkdirSync('artifacts/cas-02-1-e',{recursive:true});
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const report=[];
try{
 for(const kind of ['alex','mira']){
  for(const [width,height] of [[390,844],[320,568]]){
   const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,
    isMobile:true,hasTouch:true,serviceWorkers:'block'});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('crash',()=>errors.push('renderer crash'));
   const url='http://127.0.0.1:8765/cas-resident-footwear-lab.html?resident='+kind;
   await page.goto(url,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.__LifeSimCasResidentStylesProbe?.().loaded===true,
    {timeout:80000});
   const probe=()=>page.evaluate(()=>window.__LifeSimCasResidentStylesProbe());
   let state=await probe();
   assert.equal(state.resident,kind);
   assert.equal(state.graphics,true,'real PlayCanvas WebGL source model, not fake render');
   assert.equal(state.styles.length,3,'three full-rig source footwear meshes');
   assert.ok(state.styles.every(s=>s.exists&&s.skinned&&s.primitives>=1));
   assert.deepEqual(state.styles.map(s=>s.enabled),[true,false,false],
    'only original source shoes appear initially');
   assert.equal(state.clips.length,kind==='alex'?10:13);
   assert.ok(state.frame.headY>=state.frame.topSafe-12,
    'default camera head visible; intentional user zoom remains permitted');
   assert.ok(state.frame.footY<state.frame.dockTop-5,
    'default camera footwear above action dock');
   const selector=await page.locator('#footwear-style').boundingBox();
   assert.ok(selector&&selector.height>=43&&selector.y+selector.height<=height);
   // Preserve a fixed avatar pose so pixel changes prove real shoe mesh change.
   await page.locator('#pause-animation').tap();
   await page.waitForTimeout(180);
   const screenshots=[];
   for(const style of ['original','graphite','terracotta']){
    await page.locator('#footwear-style').selectOption(style);
    await page.waitForTimeout(250);
    state=await probe();
    assert.equal(state.active,style);
    assert.deepEqual(state.styles.map(s=>s.enabled),[
     style==='original',style==='graphite',style==='terracotta'
    ],kind+' active truly independent skinned mesh only');
    const screenshot=await page.locator('#lab-canvas').screenshot();
    const hash=createHash('sha256').update(screenshot).digest('hex');
    screenshots.push(hash);
    await page.screenshot({path:'artifacts/cas-02-1-e/'+kind+'-'+width+'x'+height+'-'+style+'.png'});
   }
   assert.equal(new Set(screenshots).size,3,
    'all three styles must render measurably different WebGL canvas pixel images');
   await page.locator('#footwear-style').selectOption('original');
   assert.deepEqual((await probe()).styles.map(s=>s.enabled),[true,false,false],
    'original source footwear must be exactly recoverable');
   await page.locator('#pause-animation').tap();
   await page.locator('#clip-select').selectOption(kind==='alex'?'Walking':'Walking_Woman');
   await page.waitForTimeout(300);
   const status=await page.locator('#lab-status').innerText();
   assert.match(status,/исходн|Выбрана|Загружено/i);
   assert.deepEqual(errors,[],'zero JS errors or GPU renderer crashes');
   assert.equal(await page.evaluate(()=>localStorage.getItem('lifesim.room01.v1')),null,
    'no gameplay/save changes from fashion viewer');
   report.push({kind,width,height,sourceRig:true,clips:state.clips.length,
    originalRestored:true,distinctShoeStylePixelHashes:3,skinnedShoes:3,
    jsErrors:0,physicalSafariAccepted:false});
   await context.close();
  }
 }
}finally{
 await browser.close();
 writeFileSync('artifacts/cas-02-1-e/browser.json',JSON.stringify(report,null,2));
 console.log('CAS-02.1-E REAL RESIDENT FOOTWEAR WEBGL '+JSON.stringify(report));
}