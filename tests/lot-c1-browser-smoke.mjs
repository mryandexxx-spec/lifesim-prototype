/** LOT-C1: real mobile PlayCanvas/WebGL startup, garden editor and saved stages. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {previewOutdoorFeatureEdit,commitOutdoorFeatureEdit} from '../src/outdoor-proposals.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
const root=newHousehold('2026-11-20');
root.paused=true;root.otherSim.paused=true;
root.autonomy.enabled=false;root.otherSim.autonomy.enabled=false;
const preview=previewOutdoorFeatureEdit(root,{operation:'place',
  itemId:'garden.flower.calendula',pose:{x:19,z:8,yaw:0}});
assert.ok(preview.ok,preview.reason);
const seed=commitOutdoorFeatureEdit(root,preview).root;
const bed=seed.world.outdoors.features.find(f=>f.itemId==='garden.flower.calendula');
seed.world.outdoors.gardens[bed.instanceId].progressWetMinutes=2880;
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const errors=[];
try {
  for(const [w,h] of [[390,844],[375,667],[320,568],[844,390]]){
    const context=await browser.newContext({viewport:{width:w,height:h},
      deviceScaleFactor:1,hasTouch:true,isMobile:true});
    await context.addInitScript(({key,root,tour})=>{
      if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(root));
      localStorage.setItem(tour,'done');
    },{key:SAVE_KEY,root:seed,tour:UI_TOUR_STORAGE_KEY});
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(w+'x'+h+': '+error.message));
    page.on('crash',()=>errors.push(w+'x'+h+': crashed'));
    const status=await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
    assert.equal(status.status(),200);
    await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
    const canvas=page.locator('#game-canvas');
    assert.equal(await canvas.isVisible(),true);
    await page.locator('#home-open').click();
    await page.locator('#home-outdoors').click();
    assert.equal(await page.locator('#outdoor-editor').isVisible(),true);
    await page.locator('#outdoor-category').selectOption('garden');
    assert.equal(await page.locator('#outdoor-feature-controls').isVisible(),true);
    for(const id of ['garden.flower.calendula','garden.flower.cornflower',
      'garden.herb.mint','garden.herb.melissa']){
      assert.ok(await page.locator('#outdoor-feature-kind option[value="'+id+'"]').count());
    }
    await page.locator('#outdoor-feature-operation').selectOption('move');
    const stored=await page.locator('#outdoor-feature-owned option').allTextContents();
    assert.ok(stored.some(label=>label.includes('Календула')));
    await page.locator('#outdoor-exit').click();
    assert.equal(await page.locator('#outdoor-editor').isVisible(),false);
    const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(saved.world.outdoors.gardens[bed.instanceId].progressWetMinutes,2880);
    await page.screenshot({path:'lot-c1-'+w+'x'+h+'.png'});
    await context.close();
  }
  assert.deepEqual(errors,[],errors.join(' | '));
  console.log('LOT-C1 4-size real WebGL: loaded garden, editor catalog, owned listing, safe reload.');
}finally{await browser.close();}
