/** Real mobile PlayCanvas/WebGL: existing starter sofa, bed, plant + GLB catalog art. */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';

mkdirSync('meshy-starter-catalog-artifacts',{recursive:true});
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const faults=[];
try{
 for(const [w,h] of [[390,844],[844,390]]){
  const seed=newHousehold('2026-11-20');
  seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
  seed.paused=true;seed.otherSim.paused=true;
  // Existing pre-upgrade paid furniture stays physical and loads the matching
  // GLB without changing its saved itemDefinitionId or purchase price.
  seed.world.furniture.instances.push(
   {instanceId:'shop-chair-1',prefabId:'chair',itemDefinitionId:'chair.loft',
    purchasePriceCredits:110,x:1.75,z:3.5,yaw:0,location:'home'},
   {instanceId:'shop-rug-2',prefabId:'rug',itemDefinitionId:'mesh.fluffy_rug',
    purchasePriceCredits:170,x:0,z:2.25,yaw:0,location:'home'});

  const ctx=await browser.newContext({viewport:{width:w,height:h},
   isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await ctx.addInitScript(({key,root})=>{
   localStorage.setItem(key,JSON.stringify(root));
   localStorage.setItem('lifesim.uiTour.v1','done');
  },{key:SAVE_KEY,root:seed});
  const page=await ctx.newPage();
  page.on('pageerror',error=>faults.push(w+'x'+h+' '+error.message));
  page.on('requestfailed',r=>{
   if(r.url().includes('/assets/furniture/meshy-room-v1/')||
     r.url().includes('/assets/furniture/meshy-room-v2/')||
     r.url().includes('/src/'))faults.push(w+'x'+h+' '+r.url()+' '+r.failure()?.errorText);
  });
  await page.goto('http://127.0.0.1:8765/?furniture=qa',
   {waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
  await page.waitForFunction(()=>window.__LifeSimMeshyFurnitureStats?.().attached>=11,
   null,{timeout:60000});
  const attached=await page.evaluate(()=>window.__LifeSimMeshyFurnitureStats());
  assert.equal(attached.failures,0,'starter AND saved purchased model loads');
  assert.ok(attached.attached>=11,'nine original fixtures + two paid legacy/current items');
  assert.ok(attached.cachedSkus>=11,'old purchases use their exact visual SKU');
  assert.ok((await page.locator('#game-canvas').screenshot()).length>3000);
  await page.screenshot({path:'meshy-starter-catalog-artifacts/home-'+w+'x'+h+'.png'});
  await page.locator('#home-open').tap();
  await page.locator('#home-furnish').tap();
  await page.locator('#furnish-shop-toggle').tap();
  const count=await page.locator('#furnish-stock img.furnish-meshy-thumb').count();
  assert.ok(count>=38,'all 15 original + 23 new catalog models need real thumbnails: '+count);
  for(const sku of ['legacy.sofa','legacy.bed','sofa.comfort','bed.platform','rug.geo',
   'plant.palm','sconce.halo']){
   const image=page.locator('#furnish-stock button[data-item-id="'+sku+'"] img.furnish-meshy-thumb');
   assert.equal(await image.count(),1,'image must exist for '+sku);
   await image.evaluate(node=>node.loading='eager');
   await image.evaluate(node=>new Promise((resolve,reject)=>{
    if(node.complete){node.naturalWidth?resolve():reject(Error('empty thumbnail'));}
    else{node.addEventListener('load',resolve,{once:true});
      node.addEventListener('error',()=>reject(Error('thumbnail HTTP failure')),{once:true});}
   }));
   const src=await image.getAttribute('src');
   assert.ok(src.endsWith('.png')&&src.includes('meshy-room-v1/thumbnails/'));
  }
  assert.equal(await page.locator('#furnish-stock button[data-item-id="chair.cross"] svg.furnish-sku-sketch').count(),1,
    'unsupported SKU still has procedural fallback');
  for(const sku of ['chair.loft','stove.modern','sink.farm','mesh.vanity_set',
    'mesh.wall_art_triptych','mesh.hanging_plant']){
    const photo=page.locator('#furnish-stock button[data-item-id="'+sku+'"] img.furnish-meshy-thumb');
    assert.equal(await photo.count(),1,'true GLB preview must exist: '+sku);
    assert.ok((await photo.getAttribute('src')).includes('meshy-room-v2/thumbnails/'),
      sku+' should not show the old procedural gallery');
  }
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
  assert.equal(saved.version,1);
  assert.ok(saved.world.furniture.instances.some(i=>i.instanceId==='home-bed-1'));
  assert.ok(saved.world.furniture.instances.some(i=>
    i.instanceId==='shop-chair-1'&&i.itemDefinitionId==='chair.loft'&&
    i.purchasePriceCredits===110));
  await page.screenshot({path:'meshy-starter-catalog-artifacts/catalog-'+w+'x'+h+'.png'});
  await ctx.close();
 }
 const legacyCtx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await legacyCtx.addInitScript(()=>localStorage.setItem('lifesim.uiTour.v1','done'));
 const legacy=await legacyCtx.newPage();
 await legacy.goto('http://127.0.0.1:8765/?furniture=legacy',{waitUntil:'domcontentloaded'});
 await legacy.locator('#loading').waitFor({state:'hidden',timeout:65000});
 await legacy.locator('#home-open').tap();
 await legacy.locator('#home-furnish').tap();
 await legacy.locator('#furnish-shop-toggle').tap();
 assert.equal(await legacy.locator('#furnish-stock img.furnish-meshy-thumb').count(),0,
  'rollback must keep procedural preview for all SKUs');
 await legacyCtx.close();
 assert.deepEqual(faults,[],'no page/GLB errors');
 console.log('Starter+fixture GLBs, 15 prior+35 new Meshy catalog previews, landscape, save v1, rollback: PASS');
}finally{await browser.close();}
