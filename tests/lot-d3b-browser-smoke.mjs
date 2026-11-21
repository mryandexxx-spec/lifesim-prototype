/** LOT-D3b: real SwiftShader PlayCanvas/WebGL four-viewport mobile resilience.
 * This is browser automation, not a physical iPhone Safari performance claim.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {outdoorCellAt} from '../src/lot-surface.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const sizes=[[390,844],[375,667],[320,568],[844,390]];
const base=outdoorCellAt(18.25,8.25);
const seed=newHousehold('2026-11-21');
seed.shop.credits=30000;
seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
seed.world.outdoors={...seed.world.outdoors,revision:1,
  pools:[{poolId:'pool-1',cells:Array.from({length:16},(_,i)=>
    base+Math.floor(i/4)*64+i%4).sort((a,b)=>a-b)}],
  poolFixtures:[{fixtureId:'fixture-1',poolId:'pool-1',kind:'ladder',
    edgeCell:base,side:'west',purchasePriceCredits:120}]};

const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
fs.mkdirSync('artifacts/lot-d3b',{recursive:true});
const report=[],failures=[];
try{
  for(const [width,height] of sizes){
    const context=await browser.newContext({viewport:{width,height},
      deviceScaleFactor:1,isMobile:true,hasTouch:true});
    await context.addInitScript(({key,root,tour})=>{
      localStorage.setItem(key,JSON.stringify(root));
      localStorage.setItem(tour,'done');
    },{key:SAVE_KEY,root:seed,tour:UI_TOUR_STORAGE_KEY});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('crash',()=>errors.push('renderer-crash'));
    const start=Date.now();
    await page.goto('http://127.0.0.1:8765/?pool=qa',
      {waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:80000});
    const loadedMs=Date.now()-start;
    const scene=await page.evaluate(()=>{
      const canvas=document.querySelector('#game-canvas');
      const bbox=canvas.getBoundingClientRect();
      return {width:bbox.width,height:bbox.height,
        webgl2:!!canvas.getContext('webgl2'),
        webgl:!!canvas.getContext('webgl')};
    });
    assert.ok(scene.width>100&&scene.height>100,
      width+'x'+height+': expected visible real WebGL canvas');
    assert.ok(scene.webgl||scene.webgl2,'WebGL unavailable');

    await page.locator('#home-open').click();
    await page.locator('#home-outdoors').click();
    await page.locator('#outdoor-category').selectOption('pool');
    assert.equal(await page.locator('#pool-controls').isVisible(),true);
    const visual=await page.evaluate(()=>window.__LifeSimPoolVisualStats?.());
    assert.equal(visual?.hasPool,true);
    await page.locator('#outdoor-exit').click();

    // One-finger camera rotation mode is real interactive UI, not only CSS.
    const rotate=page.locator('#rotate-camera-btn');
    await rotate.click();
    assert.equal(await rotate.getAttribute('aria-pressed'),'true');
    await rotate.click();
    assert.equal(await rotate.getAttribute('aria-pressed'),'false');

    // Emulate actual viewport rotation without remounting or deleting a save.
    const wasPortrait=height>width;
    const rotated={width:height,height:width};
    await page.setViewportSize(rotated);
    await page.waitForTimeout(180);
    const turned=await page.locator('#game-canvas').boundingBox();
    assert.ok(turned&&turned.width>100&&turned.height>100,
      width+'x'+height+': responsive canvas disappeared after rotation');
    await page.setViewportSize({width,height});
    await page.waitForTimeout(180);
    const restoredBox=await page.locator('#game-canvas').boundingBox();
    assert.ok(restoredBox?.width>100&&restoredBox?.height>100);

    // Simulate GL context loss when the driver exposes the WebGL extension.
    // Never claim this proves Safari's platform-specific context behavior.
    const glReport=await page.evaluate(async()=>{
      const canvas=document.querySelector('#game-canvas');
      const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
      const extension=gl?.getExtension('WEBGL_lose_context');
      if(!extension)return {supported:false,lost:false,restored:false};
      let lost=false,restored=false;
      canvas.addEventListener('webglcontextlost',()=>{lost=true;},{once:true});
      canvas.addEventListener('webglcontextrestored',()=>{restored=true;},{once:true});
      extension.loseContext();
      await new Promise(r=>setTimeout(r,200));
      extension.restoreContext();
      for(let i=0;i<40&&!restored;i++)
        await new Promise(r=>setTimeout(r,125));
      return {supported:true,lost,restored};
    });
    if(glReport.supported){
      assert.equal(glReport.lost,true,'real WebGL loss event must fire');
      assert.equal(glReport.restored,true,'real WebGL context must restore');
    }
    await page.screenshot({path:`artifacts/lot-d3b/pool-${width}x${height}.png`,
      fullPage:true});
    const before=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(before.world.outdoors.pools[0].cells.length,16);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:80000});
    const after=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(after.version,1);
    assert.equal(after.world.outdoors.pools[0].cells.length,16);
    assert.equal(after.world.outdoors.poolFixtures.length,1);
    assert.equal((await page.evaluate(()=>window.__LifeSimPoolVisualStats?.()))?.hasPool,true);
    if(errors.length)failures.push(width+'x'+height+': '+errors.join('; '));
    report.push({viewport:`${width}x${height}`,loadedMs,
      webgl2:scene.webgl2,rotation:wasPortrait?'portrait-to-landscape':'landscape-to-portrait',
      contextLoss:glReport,saveReload:true,errors});
    await context.close();
  }
}finally{
  await browser.close();
  fs.writeFileSync('artifacts/lot-d3b/report.json',JSON.stringify(report,null,2));
}
assert.deepEqual(failures,[],'real WebGL/PlayCanvas browser errors');
assert.equal(report.length,4);
console.log('LOT-D3b real four-viewport WebGL/mobile resilience:',JSON.stringify(report));
