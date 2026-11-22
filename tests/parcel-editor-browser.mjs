import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {previewOutdoorFeatureEdit,commitOutdoorFeatureEdit} from '../src/outdoor-proposals.js';

const base=newHousehold('2026-11-22');
base.paused=base.otherSim.paused=true;
base.autonomy.enabled=base.otherSim.autonomy.enabled=false;
const proposal=previewOutdoorFeatureEdit(base,{operation:'place',itemId:'garden.bench',pose:{x:8,z:-7,yaw:0}});
assert.ok(proposal.ok,proposal.reason);
const seed=commitOutdoorFeatureEdit(base,proposal).root;
const browser=await chromium.launch({args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
try{
 for(const [width,height] of [[390,844],[320,568],[844,390]]){
  const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  await ctx.addInitScript(({key,seed})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));
    localStorage.setItem('lifesim.uiTour.v1','done');
  },{key:SAVE_KEY,seed});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:75000});
  const action=id=>page.locator('[data-parcel-action="'+id+'"]');
  const tap=id=>action(id).tap({timeout:8000});
  const root=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY);
  const worldTap=async(x,z,y=-.53)=>{
    const pt=await page.evaluate(async({x,z,y})=>{
      const {Application,Vec3}=await import('playcanvas');
      const app=Application.getApplication(),camera=app.root.findComponent('camera');
      const p=camera.worldToScreen(new Vec3(x,y,z)),r=app.graphicsDevice.canvas.getBoundingClientRect();
      return {x:r.left+p.x,y:r.top+p.y};
    },{x,y,z});
    await page.touchscreen.tap(pt.x,pt.y);
  };
  await page.locator('#home-open').tap();await page.locator('#home-outdoors').tap();
  await worldTap(8,-7,.35);
  assert.equal(await page.locator('#parcel-editor h2').textContent(),'Садовая скамейка');
  await tap('rotate');assert.equal((await root()).world.outdoors.features[0].yaw,0);
  await tap('apply');assert.equal((await root()).world.outdoors.features[0].yaw,90);
  await tap('undo');assert.equal((await root()).world.outdoors.features[0].yaw,0);
  await tap('redo');
  await tap('group:ground');await tap('pick:stone');
  await worldTap(2.25,-7.75);await worldTap(3.75,-7.75);
  assert.match(await page.locator('.parcel-wallet').textContent(),/32 кр/);
  await tap('view');await tap('view');await tap('apply');
  assert.equal((await root()).shop.credits,seed.shop.credits-32);
  await tap('section:pool');await tap('group:water');await tap('pick:paint');
  await worldTap(1.25,-8.75);await worldTap(3.75,-7.25);await tap('cancel');
  assert.equal((await root()).shop.credits,seed.shop.credits-32);
  await tap('section:house');await tap('group:room');await tap('pick:room');
  await worldTap(16,-6);await worldTap(19,-4);
  assert.equal(await action('apply').isEnabled(),true);
  await tap('apply');assert.ok((await root()).world.construction.revision>0);
  const built=(await root()).world.construction.floorCells.length;
  await tap('undo');
  assert.equal((await root()).world.construction.floorCells.length,
    seed.world.construction.floorCells.length);
  await tap('undo');
  assert.equal((await root()).shop.credits,seed.shop.credits,
    'History status: '+await page.locator('#parcel-editor output').textContent());
  await tap('redo');
  assert.equal((await root()).shop.credits,seed.shop.credits-32);
  await tap('redo');
  assert.equal((await root()).world.construction.floorCells.length,built);
  await tap('section:furniture');await tap('group:owned');
  assert.ok(await page.locator('[data-parcel-action^="select:"]').count()>0);
  await page.locator('[data-parcel-action^="select:"]').first().tap();
  assert.equal(await page.locator('#parcel-editor').getAttribute('data-stage'),'selected');
  await tap('back');await tap('group:shop');
  assert.equal(await page.locator('#furnish-search').isVisible(),true);
  await page.locator('#furnish-stock button:not([hidden])').first().tap();
  assert.equal(await page.locator('#parcel-editor').getAttribute('data-stage'),'draft');
  await tap('cancel');await tap('exit');
  await page.reload();await page.locator('#loading').waitFor({state:'hidden',timeout:75000});
  assert.equal((await root()).world.outdoors.features[0].yaw,90);
  assert.deepEqual(errors,[]);await ctx.close();console.log('Parcel editor passed',width,height);
 }
}finally{await browser.close();}
