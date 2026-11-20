/** Genuine PlayCanvas/SwiftShader: V3 GLBs for old purchases, starter counter, store icons and reload. */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {FURNITURE_PRODUCT_BY_ID} from '../src/furniture-products.js';
import {MESHY_ROOM_V3_ENTRIES} from '../src/meshy-room-v3-data.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

mkdirSync('meshy-v3-artifacts',{recursive:true});
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
try{
  for(const [width,height] of [[390,844],[375,667],[320,568],[844,390]]){
    const seed=newHousehold('2026-11-20');
    seed.paused=true;seed.otherSim.paused=true;
    seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
    const purchased=MESHY_ROOM_V3_ENTRIES.filter(x=>x.sku!=='fixture.counter');
    for(const [i,entry] of purchased.entries()){
      const product=FURNITURE_PRODUCT_BY_ID[entry.sku];
      seed.world.furniture.instances.push({
        instanceId:'shop-v3-'+(i+1),prefabId:product.prefabId,
        itemDefinitionId:entry.sku,purchasePriceCredits:product.price,
        x:5.8+(i%4)*2,z:-7+Math.floor(i/4)*3,yaw:0,
        location:i%4===0?'storage':'home'
      });
    }
    const context=await browser.newContext({
      viewport:{width,height},deviceScaleFactor:1,isMobile:true,hasTouch:true});
    await context.addInitScript(({key,tour,seed})=>{
      localStorage.setItem(key,JSON.stringify(seed));
      localStorage.setItem(tour,'done');
    },{key:SAVE_KEY,tour:UI_TOUR_STORAGE_KEY,seed});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push('PAGE '+e.message));
    page.on('requestfailed',req=>{
      if(/\/src\/|\/assets\/furniture\/meshy-room-v3\//.test(req.url()))
        errors.push('ASSET '+req.url()+' '+req.failure()?.errorText);
    });
    await page.goto('http://127.0.0.1:8765/?furniture=qa',{waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:100000});
    assert.ok(await page.locator('#game-canvas').evaluate(c=>!!(c.getContext('webgl2')||c.getContext('webgl'))));
    await page.waitForFunction(()=>window.__LifeSimMeshyFurnitureStats?.().attached>=20,
      null,{timeout:85000});
    const loaded=await page.evaluate(()=>window.__LifeSimMeshyFurnitureStats());
    assert.equal(loaded.failures,0,'all visual GLB should load');
    const scene=await page.evaluate(async()=>{
      const {Application}=await import('playcanvas');
      const root=Application.getApplication().root;
      const counter=root.findByName('F1 furniture / home-counter-1');
      const fixture=counter?.findByName('Meshy furniture fixture.counter');
      const paid=root.findByName('F2 purchased / shop-v3-1');
      return {counter:Boolean(counter),fixture:Boolean(fixture),paid:Boolean(paid),
        savedVisible:paid?.enabled===false};
    });
    assert.equal(scene.counter,true,'preexisting starter counter');
    assert.equal(scene.fixture,true,'Meshy is attached to old counter ID');
    assert.equal(scene.paid,true,'preexisting paid instance has original instance ID');
    assert.equal(scene.savedVisible,true,'old storage property honored');
    await page.screenshot({path:'meshy-v3-artifacts/home-'+width+'x'+height+'.png'});
    await page.locator('#home-open').tap();
    await page.locator('#home-furnish').tap();
    await page.locator('#furnish-shop-toggle').tap();
    const images=page.locator('#furnish-stock img.furnish-meshy-thumb');
    assert.ok(await images.count()>=50,'existing 50 + 12 newly mapped products');
    for(const item of purchased){
      const img=page.locator('#furnish-stock button[data-item-id="'+item.sku+'"] img.furnish-meshy-thumb');
      assert.equal(await img.count(),1,item.sku+' storefront thumbnail');
      assert.ok((await img.getAttribute('src')).includes('/meshy-room-v3/thumbnails/'+item.sku+'.png'));
      await img.evaluate(node=>node.loading='eager');
      await img.evaluate(node=>new Promise((resolve,reject)=>{
        if(node.complete) return node.naturalWidth?resolve():reject(Error('blank V3 icon'));
        node.addEventListener('load',resolve,{once:true});
        node.addEventListener('error',()=>reject(Error('bad V3 icon')),{once:true});
      }));
    }
    await page.screenshot({path:'meshy-v3-artifacts/shop-'+width+'x'+height+'.png'});
    const saved=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY));
    assert.equal(saved.version,1);
    for(const [i,item] of purchased.entries()){
      const same=saved.world.furniture.instances.find(x=>x.instanceId==='shop-v3-'+(i+1));
      assert.equal(same?.itemDefinitionId,item.sku,'preserve saved model identity');
      assert.equal(same?.purchasePriceCredits,FURNITURE_PRODUCT_BY_ID[item.sku].price);
      assert.equal(same?.location,i%4===0?'storage':'home');
    }
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:100000});
    assert.equal(errors.length,0,JSON.stringify(errors));
    await context.close();
    console.log(width+'x'+height+': '+loaded.attached+' mesh instances, store PNG and v1 reload PASS');
  }
  const legacy=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await legacy.addInitScript(tour=>localStorage.setItem(tour,'done'),UI_TOUR_STORAGE_KEY);
  const page=await legacy.newPage();
  await page.goto('http://127.0.0.1:8765/?furniture=legacy',{waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:100000});
  await page.locator('#home-open').tap();
  await page.locator('#home-furnish').tap();
  await page.locator('#furnish-shop-toggle').tap();
  assert.equal(await page.locator('#furnish-stock img.furnish-meshy-thumb').count(),0);
  await legacy.close();
}finally{await browser.close()}
