/** PF-07 real parcel purchase flow, PlayCanvas scene transforms and v1 reload. */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
import {windowMountPose,validateWindowMounts} from '../src/window-mount.js';
const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
mkdirSync('artifacts/grill-r1',{recursive:true});
const parcel=(page,id)=>page.locator('[data-parcel-action="'+id+'"]');
const snap=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
const scene=(page,name)=>page.evaluate(async name=>{
 const {Application}=await import('playcanvas');
 const app=Application.getApplication(),node=app?.root?.findByName(name);
 if(!node)return null;
 const p=node.getPosition(),e=node.getEulerAngles();
 return {enabled:node.enabled,x:p.x,y:p.y,z:p.z,yaw:e.y,webgl:!!app.graphicsDevice.canvas};
},name);
try{
 for(const [width,height,sku,price] of [[390,844,'mesh.green_curtains',190],[320,568,'mesh.wooden_blinds',180]]){
  const seed=newHousehold();seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,hasTouch:true,isMobile:true});
  await context.addInitScript(({key,record,tour})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));localStorage.setItem(tour,'done');},{key:SAVE_KEY,record:seed,tour:UI_TOUR_STORAGE_KEY});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
  const baseline=await snap(page);
  await page.locator('#home-open').tap();await page.locator('#home-furnish').tap();
  await parcel(page,'group:shop').tap();
  // Parcel intentionally hides the legacy search input. Use the real visible category rail.
  await page.locator('#parcel-editor #furnish-type-tabs button[data-category-id="type.decor"]').tap();
  await page.locator('#parcel-editor #furnish-subtype-tabs button[data-category-id="type.decor.wall"]').tap();
  await page.locator('#parcel-editor #furnish-stock button[data-item-id="'+sku+'"]').tap();
  await parcel(page,'try').tap();await parcel(page,'auto').tap();
  assert.equal(await parcel(page,'apply').isDisabled(),false,'valid wall preview '+sku);
  assert.equal(await parcel(page,'turn').isDisabled(),true,'wall determines yaw');
  const preview=await scene(page,'Unsaved furniture placement preview');
  assert.ok(preview?.enabled&&preview.webgl,'real visible PlayCanvas preview');
  assert.equal((await snap(page)).shop.credits,baseline.shop.credits,'preview free');
  await page.screenshot({path:'artifacts/grill-r1/pf-07-preview-'+width+'.png'});
  await parcel(page,'apply').tap();
  const paid=await snap(page),item=paid.world.furniture.instances.find(i=>i.itemDefinitionId===sku);
  assert.ok(item?.mount,'persist real anchor');
  assert.equal(paid.shop.credits,baseline.shop.credits-price);
  assert.equal(validateWindowMounts(paid.world.construction,paid.world.furniture).ok,true);
  const pose=windowMountPose(paid.world.construction,sku,item.mount);
  assert.ok(Math.hypot(preview.x-pose.x,preview.y-pose.y,preview.z-pose.z)<.001,'preview and purchase agree');
  const installed=await scene(page,'F2 purchased / '+item.instanceId);
  assert.ok(installed?.webgl);assert.ok(Math.hypot(installed.x-pose.x,installed.y-pose.y,installed.z-pose.z)<.001);
  await parcel(page,'exit').tap();
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
  const saved=await snap(page);
  assert.deepEqual(saved.world.furniture.instances.find(i=>i.instanceId===item.instanceId),item);
  assert.equal(saved.shop.credits,paid.shop.credits);
  assert.deepEqual(errors,[]);
  await context.close();
 }
}finally{await browser.close();}
console.log('PF-07 both window panels real mobile purchase, automatic wall pose and reload PASS');
