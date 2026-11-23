/** QSK-02: deterministic real PlayCanvas/Chromium fault matrix, NOT physical iPhone Safari QA.
 * Standalone test harness only: does not alter production loaders, GLB, SW or storage.
 * Requires localhost:8765 and vendor/playcanvas.mjs prepared by CI.
 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const dir='artifacts/qsk-02';
mkdirSync(dir,{recursive:true});
const seed=newHousehold('2026-11-23');
seed.autonomy.enabled=false;
seed.otherSim.autonomy.enabled=false;
const balance=seed.shop.credits;
const base='http://127.0.0.1:8765/?qsk-02=qa';
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const findings=[];
const makeContext=async({width,height,raw=JSON.stringify(seed)})=>{
  const context=await browser.newContext({
    viewport:{width,height},deviceScaleFactor:1,isMobile:true,hasTouch:true,
    serviceWorkers:'block'
  });
  await context.addInitScript(({key,raw,tour})=>{
    if(localStorage.getItem(key)===null)localStorage.setItem(key,raw);
    localStorage.setItem(tour,'done');
  },{key:SAVE_KEY,raw,tour:UI_TOUR_STORAGE_KEY});
  return context;
};
const documentState=page=>page.evaluate(async()=>{
  const canvas=document.querySelector('#game-canvas');
  const {Application}=await import('playcanvas');
  const app=Application.getApplication();
  const steps=[...document.querySelectorAll('#loading-stages li')];
  return {
    webgl:!!(canvas.getContext('webgl2')||canvas.getContext('webgl')),
    device:!!app?.graphicsDevice?.canvas,
    canvas:{width:canvas.clientWidth,height:canvas.clientHeight},
    hidden:document.querySelector('#loading').hidden,
    steps:Object.fromEntries(steps.map(x=>[x.dataset.stage,x.dataset.status])),
    stageCount:document.getElementById('loading-count').textContent
  };
});
const checkSave=async(page,label)=>{
  const saved=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY));
  assert.equal(saved.version,1,label+' must retain v1');
  assert.equal(saved.shop.credits,balance,label+' must not create phantom transactions');
  return saved;
};
const waitReady=async page=>{
  await page.locator('#loading').waitFor({state:'hidden',timeout:60000});
  const state=await documentState(page);
  assert.equal(state.hidden,true);
  assert.equal(state.webgl,true);
  assert.equal(state.device,true);
  assert.ok(state.canvas.width>=300&&state.canvas.height>=500);
  assert.equal(state.stageCount,'7 / 7');
  for(const name of ['engine','scene','interface','frame'])
    assert.equal(state.steps[name],'ready',name+' must be a real completed milestone');
  return state;
};
try{
  for(const [width,height] of [[390,844],[320,568]]){
    const label=width+'x'+height;
    const normal=await makeContext({width,height});
    const page=await normal.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('crash',()=>errors.push('browser crash'));
    const coldAt=Date.now();
    await page.goto(base,{waitUntil:'domcontentloaded'});
    const cold=await waitReady(page);
    const coldMs=Date.now()-coldAt;
    assert.deepEqual(errors,[],'cold boot errors '+label);
    await checkSave(page,'cold boot '+label);
    await page.screenshot({path:dir+'/cold-'+label+'.png'});
    const warmAt=Date.now();
    await page.reload({waitUntil:'domcontentloaded'});
    const warm=await waitReady(page);
    const warmMs=Date.now()-warmAt;
    assert.deepEqual(errors,[],'warm reload errors '+label);
    await checkSave(page,'warm reload '+label);
    await page.screenshot({path:dir+'/warm-'+label+'.png'});
    findings.push({scenario:'cold-warm-http-no-sw',viewport:label,coldMs,warmMs,
      baselineStages:cold.steps,warmStages:warm.steps,renderer:true,
      note:'Chromium HTTP/browser cache; NOT an iPhone Safari cache benchmark'});

    // Actual WEBGL_lose_context extension causes the real graphics context to be lost.
    // No fake dispatched DOM event is substituted. Unsupported extension is recorded.
    if(width===390){
      const available=await page.evaluate(()=>{
        const gl=document.querySelector('#game-canvas').getContext('webgl2');
        const ext=gl?.getExtension('WEBGL_lose_context');
        if(!ext)return false;
        window.__qsk02Restore=()=>ext.restoreContext();
        ext.loseContext();
        return true;
      });
      if(available){
        await page.waitForFunction(()=>!document.querySelector('#viewport-recovery').hidden,
          null,{timeout:10000});
        const warning=await page.locator('#viewport-health-title').innerText();
        assert.match(warning,/Safari|3D|график/i);
        assert.equal(await page.locator('#viewport-health-reload').isVisible(),true,
          'user-controlled recovery must remain visible after actual context loss');
        await page.screenshot({path:dir+'/webgl-lost-'+label+'.png'});
        await page.evaluate(()=>window.__qsk02Restore());
        await page.waitForFunction(()=>document.querySelector('#viewport-recovery').hidden,
          null,{timeout:18000});
        await checkSave(page,'real context restore');
        findings.push({scenario:'real-webgl-context-loss-and-restore',viewport:label,
          supported:true,visibleWarning:true,recovery:true});
      }else{
        findings.push({scenario:'real-webgl-context-loss-and-restore',viewport:label,
          supported:false,verified:false,reason:'WEBGL_lose_context extension unavailable'});
      }
    }
    await normal.close();

    // Network fault: truly return HTTP 404 for BOTH original Meshy resident GLBs.
    // Keep a valid original/procedural resident and an intact local v1 save.
    const failed=await makeContext({width,height});
    const blocked=[];
    await failed.route('**/assets/characters/*.glb*',async route=>{
      const url=route.request().url();
      if(/meshy-(?:casual|mira-mobile)-v1\.glb(?:\?|$)/.test(url)){
        blocked.push(new URL(url).pathname);
        await route.fulfill({status:404,contentType:'application/octet-stream',body:'Not Found'});
      }else await route.continue();
    });
    const failPage=await failed.newPage(),faultErrors=[];
    failPage.on('pageerror',e=>faultErrors.push(e.message));
    failPage.on('crash',()=>faultErrors.push('browser crash'));
    await failPage.goto(base,{waitUntil:'domcontentloaded'});
    const degraded=await waitReady(failPage);
    assert.ok(blocked.some(x=>x.endsWith('meshy-casual-v1.glb')),'Alex 404 injected');
    assert.ok(blocked.some(x=>x.endsWith('meshy-mira-mobile-v1.glb')),'Mira 404 injected');
    assert.equal(degraded.steps.alex,'fallback','Alex must explicitly show fallback');
    assert.equal(degraded.steps.mira,'fallback','Mira must explicitly show fallback');
    await checkSave(failPage,'404 resident GLBs '+label);
    assert.deepEqual(faultErrors,[],'missing optional model must not crash JS '+label);
    await failPage.screenshot({path:dir+'/missing-models-'+label+'.png'});
    findings.push({scenario:'dual-resident-404-procedural-fallback',viewport:label,
      injected404:blocked.length,stages:degraded.steps,renderer:true,saveV1:true});
    await failed.close();
  }

  // A corrupted/future save remains EXACTLY intact; no fallback session may
  // overwrite it, even though a playable temporary world is rendered.
  const raw='{"version":99,"privatePayload":{"must":"survive"}}';
  const context=await makeContext({width:390,height:844,raw});
  const page=await context.newPage();
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await waitReady(page);
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY),raw);
  await page.reload({waitUntil:'domcontentloaded'});
  await waitReady(page);
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY),raw);
  await page.screenshot({path:dir+'/protected-invalid-save.png'});
  findings.push({scenario:'unsupported-save-locked',viewport:'390x844',
    originalBytesPreserved:true,afterReload:true});
  await context.close();
  console.log('QSK-02 fault matrix PASS:',JSON.stringify(findings));
}finally{
  await browser.close();
  writeFileSync(dir+'/report.json',JSON.stringify({
    stage:'QSK-02',environment:'Linux Chromium SwiftShader/PlayCanvas; not physical Safari',
    physicalIphoneAccepted:false,results:findings
  },null,2));
}
