/** GRILL-R1: actual PlayCanvas/WebGL scene + canonical paid protein purchases.
 * Two mobile viewports; Chromium is not physical iPhone Safari acceptance.
 */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {previewOutdoorFeatureEdit,commitOutdoorFeatureEdit} from '../src/outdoor-proposals.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

let seed=newHousehold('2026-11-22');
seed.paused=true;seed.otherSim.paused=true;
seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
const preview=previewOutdoorFeatureEdit(seed,{operation:'place',itemId:'garden.grill',
  pose:{x:19,z:8,yaw:90}});
assert.ok(preview.ok,preview.reason);
const purchased=commitOutdoorFeatureEdit(seed,preview);
assert.ok(purchased.ok,purchased.reason);
seed=purchased.root;
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
try{
  mkdirSync('artifacts/grill-r1',{recursive:true});
  for(const [width,height] of [[390,844],[320,568]]){
    const context=await browser.newContext({
      viewport:{width,height},deviceScaleFactor:1,hasTouch:true,isMobile:true,
      serviceWorkers:'block'
    });
    await context.addInitScript(({key,record,tour})=>{
      localStorage.setItem(key,JSON.stringify(record));
      localStorage.setItem(tour,'done');
    },{key:SAVE_KEY,record:seed,tour:UI_TOUR_STORAGE_KEY});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',err=>errors.push(err.message));
    page.on('crash',()=>errors.push('renderer crashed'));
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
    const actualScene=await page.evaluate(async()=>{
      const {Application}=await import('playcanvas');
      const app=Application.getApplication();
      const grill=app?.root?.findByName('LOT-B2 out-1 garden.grill');
      return {webgl:Boolean(app?.graphicsDevice?.canvas),
        fixture:Boolean(grill),firebox:Boolean(grill?.findByName('firebox')),
        skewer:Boolean(grill?.findByName('GRILL-R1 animated skewer'))};
    });
    assert.equal(actualScene.webgl,true,'real WebGL PlayCanvas required');
    assert.equal(actualScene.fixture,true,'saved purchased grill must exist in actual scene');
    assert.equal(actualScene.firebox,true,'grill firebox must render');
    assert.equal(actualScene.skewer,true,'animated skewer must be in scene');
    assert.ok((await page.locator('#game-canvas').screenshot()).length>1800);
    await page.screenshot({path:'artifacts/grill-r1/game-'+width+'.png'});
    const initial=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(initial.version,1);
    assert.equal(initial.world.outdoors.features.filter(f=>f.itemId==='garden.grill').length,1,
      'real persisted grill fixture');
    assert.equal(initial.kitchen.pantry.meat,0,'never mint unpaid protein');
    assert.equal(initial.kitchen.pantry.chicken,0,'never mint unpaid protein');
    await page.evaluate(()=>{
      const layer=document.getElementById('hotspots');
      layer.hidden=false;
      const hotspot=[...layer.querySelectorAll('button')].find(
        b=>b.textContent.includes('Холодильник'));
      if(!hotspot)throw new Error('Real fridge hotspot missing');
      hotspot.click();
    });
    await page.locator('#fridge-r2').waitFor({state:'visible',timeout:10000});
    await page.locator('#fridge-r2-tab-buy').click();
    const protein=page.locator('[data-fridge-action="select-staple"][data-id="meat"]');
    await protein.waitFor({state:'visible'});
    await protein.click();
    assert.equal(await page.locator('#fridge-r2-buy').isVisible(),true,
      'selecting a dynamic staple must not close the contextual sheet');
    assert.match(await page.locator('#fridge-r2-staple-button').textContent(),/3.*36/);
    if(width===390){
      page.on('dialog',dialog=>dialog.accept());
      await page.locator('#fridge-r2-staple-button').click();
      const paid=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
      assert.equal(paid.shop.credits,initial.shop.credits-36);
      assert.equal(paid.kitchen.pantry.meat,3);
      assert.equal(paid.financialHistory.entries.at(-1).delta,-36);
      assert.equal(paid.kitchen.prepared.length,0,
        'a purchase cannot produce a ready-to-eat meal');
      await page.locator('[data-fridge-action="select-staple"][data-id="chicken"]').click();
      assert.match(await page.locator('#fridge-r2-staple-button').textContent(),/3.*30/);
      await page.locator('#fridge-r2-staple-button').click();
      const second=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
      assert.equal(second.shop.credits,initial.shop.credits-66);
      assert.equal(second.kitchen.pantry.chicken,3);
      assert.equal(second.financialHistory.entries.length,initial.financialHistory.entries.length+2);
    }
    const pane=await page.evaluate(()=>{
      const rect=document.querySelector('#action-sheet').getBoundingClientRect();
      const hud=document.querySelector('#dashboard').getBoundingClientRect();
      return {left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,hudTop:hud.top};
    });
    assert.ok(pane.left>=0&&pane.top>=0&&pane.right<=width+1);
    assert.ok(pane.bottom<=pane.hudTop+2);
    assert.deepEqual(errors,[],errors.join(' / '));
    await context.close();
  }
  console.log('GRILL-R1 PlayCanvas 390x844 / 320x568, saved grill, real protein purchase and HUD PASS');
}finally{await browser.close();}

// GRILL and ready food share the real dining journey.
await import('./pf-04a-meal-timing-browser-smoke.mjs');

await import('./pf-04b-browser-smoke.mjs');

await import('./pf-05-browser-smoke.mjs');
