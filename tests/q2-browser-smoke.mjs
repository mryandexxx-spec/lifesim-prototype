/** Q2: real PlayCanvas/WebGL at four iPhone viewport sizes, starter furniture lifecycle. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {findMarketPlacement,buyMarketItem} from '../src/furniture-shop.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const seed=newHousehold('2026-11-19');
seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
seed.paused=true;seed.otherSim.paused=true;
const opts={residents:[seed.position,seed.otherSim.position],
  construction:seed.world.construction};
const location=findMarketPlacement(seed.world.furniture,seed.shop,'bed',opts);
assert.ok(location,'Can place a real replacement bed in starter home');
const purchased=buyMarketItem(seed.world.furniture,seed.shop,'bed',location,opts);
assert.equal(purchased.ok,true,purchased.reason);
seed.world.furniture=purchased.world;seed.shop=purchased.shop;
const replacementId=purchased.instanceId,starterId='home-bed-1';
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const issues=[];
try{
  for(const [w,h] of [[390,844],[375,667],[320,568],[844,390]]){
    const context=await browser.newContext({viewport:{width:w,height:h},
      deviceScaleFactor:1,hasTouch:true,isMobile:true});
    await context.addInitScript(({key,record,tourKey})=>{
      if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
      localStorage.setItem(tourKey,'done');
    },{key:SAVE_KEY,record:seed,tourKey:UI_TOUR_STORAGE_KEY});
    const page=await context.newPage();
    page.on('pageerror',error=>issues.push(w+'×'+h+': '+error.message));
    page.on('crash',()=>issues.push(w+'×'+h+': renderer crash'));
    page.on('dialog',dialog=>dialog.accept());
    const saved=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    const boot=()=>page.locator('#loading').waitFor({state:'hidden',timeout:65000});
    const enter=async()=>{
      await page.locator('#furnish-toggle').click();
      await page.locator('#furnish-commands').waitFor({state:'hidden'});
      await page.locator('#furnish-item-select').selectOption(starterId);
      await page.locator('#furnish-commands').waitFor({state:'visible'});
    };
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
    await boot();
    assert.equal(await page.locator('#game-canvas').evaluate(canvas=>
      Boolean(canvas.getContext('webgl2')||canvas.getContext('webgl'))),true,
    'Real PlayCanvas WebGL context must be available');
    await enter();
    assert.equal(await page.locator('#furnish-store').isDisabled(),false,
      'Starter bed can enter storage with a working replacement');
    await page.locator('#furnish-store').click();
    let state=await saved();
    assert.equal(state.world.furniture.instances.find(i=>i.instanceId===starterId).location,'storage');
    assert.equal(state.shop.credits,seed.shop.credits,'Storage is free');
    await page.reload({waitUntil:'domcontentloaded'});await boot();
    state=await saved();
    assert.equal(state.world.furniture.instances.find(i=>i.instanceId===starterId).location,'storage',
      'Saved starter must remain stored after full WebGL boot');
    assert.equal(state.world.furniture.instances.find(i=>i.instanceId===replacementId).location,'home');
    await page.locator('#furnish-toggle').click();
    await page.locator('#furnish-warehouse-toggle').click();
    const storage=page.locator('#furnish-storage-list');
    assert.equal(await storage.locator('.furnish-storage-card').count(),1);
    await storage.getByRole('button',{name:/Вернуть/}).click();
    state=await saved();
    assert.equal(state.world.furniture.instances.find(i=>i.instanceId===starterId).location,'home');
    assert.equal(state.shop.credits,seed.shop.credits);
    await page.locator('#furnish-edit-toggle').click();
    await page.locator('#furnish-item-select').selectOption(starterId);
    assert.match(await page.locator('#furnish-sell').innerText(),/255/);
    await page.locator('#furnish-sell').click();
    state=await saved();
    assert.equal(state.shop.credits,seed.shop.credits+255);
    assert.equal(state.world.furniture.instances.some(i=>i.instanceId===starterId),false);
    await page.reload({waitUntil:'domcontentloaded'});await boot();
    state=await saved();
    assert.equal(state.world.furniture.instances.some(i=>i.instanceId===starterId),false,
      'Starter must not respawn on reload');
    assert.equal(state.shop.credits,seed.shop.credits+255,
      'One-time payout must survive reload without replay');
    assert.equal(state.world.furniture.instances.find(i=>i.instanceId===replacementId).location,'home');
    await page.screenshot({path:`q2-starter-${w}x${h}.png`});
    await context.close();
  }
  assert.deepEqual(issues,[],'No browser errors on any mobile viewport');
  console.log('Q2 four-size PlayCanvas WebGL storage/restore/sale/reload + one-time credits PASS');
}finally{await browser.close();}
