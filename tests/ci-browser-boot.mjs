/** One-screen PR smoke: real Chromium/SwiftShader PlayCanvas startup, not iPhone Safari QA. */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const seed=newHousehold('2026-11-21');
seed.paused=true;
seed.otherSim.paused=true;
seed.autonomy.enabled=false;
seed.otherSim.autonomy.enabled=false;
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
try{
  const context=await browser.newContext({
    viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true
  });
  await context.addInitScript(({key,record,tour})=>{
    localStorage.setItem(key,JSON.stringify(record));
    localStorage.setItem(tour,'done');
  },{key:SAVE_KEY,record:seed,tour:UI_TOUR_STORAGE_KEY});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('crash',()=>errors.push('renderer crashed'));
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
  const canvas=page.locator('#game-canvas');
  await canvas.waitFor({state:'visible',timeout:10000});
  assert.ok((await canvas.screenshot()).length>2000,'3D canvas must render pixels');
  const realGraphicsDevice=await page.evaluate(async()=>{
    const {Application}=await import('playcanvas');
    const app=Application.getApplication();
    return Boolean(app&&app.graphicsDevice&&app.graphicsDevice.canvas);
  });
  assert.equal(realGraphicsDevice,true,'real PlayCanvas graphics device must boot');
  assert.deepEqual(errors,[],'no JavaScript errors or renderer crashes during boot');
  assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).version,SAVE_KEY),1,
    'pre-existing v1 save remains intact');
  mkdirSync('artifacts/ci-boot',{recursive:true});
  await page.screenshot({path:'artifacts/ci-boot/390x844.png'});
  await context.close();
  console.log('Targeted Chromium PlayCanvas 390x844 boot PASS; physical iPhone QA deferred');
}finally{
  await browser.close();
}
