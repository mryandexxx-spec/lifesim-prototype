/** Meshy furniture: real PlayCanvas/SwiftShader browser smoke, no physical iPhone claim. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {findMarketPlacement,buyMarketItem} from '../src/furniture-shop.js';
import {MESHY_FURNITURE_SKUS} from '../src/meshy-furniture-policy.js';
import {SAVE_KEY} from '../src/simulation.js';

const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
mkdirSync('meshy-room-artifacts',{recursive:true});
const errors=[],rows=[];
try{
 for(const [index,sku] of MESHY_FURNITURE_SKUS.entries()){
  const seed=newHousehold('2026-11-20');
  seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
  seed.paused=true;seed.otherSim.paused=true;
  const opts={construction:seed.world.construction};
  const pose=findMarketPlacement(seed.world.furniture,seed.shop,sku,opts);
  assert.ok(pose,sku+' must have a valid purchasable placement');
  const paid=buyMarketItem(seed.world.furniture,seed.shop,sku,pose,opts);
  assert.equal(paid.ok,true,sku+' must be purchasable');
  seed.world.furniture=paid.world;seed.shop=paid.shop;
  const landscape=sku==='sofa.loft'||sku==='rug.weave';
  const viewport=landscape?{width:844,height:390}:{width:390,height:844};
  const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await context.addInitScript(({key,root})=>{
   localStorage.setItem(key,JSON.stringify(root));
   localStorage.setItem('lifesim.uiTour.v1','done');
  },{key:SAVE_KEY,root:seed});
  const page=await context.newPage();
  const faults=[];
  page.on('pageerror',e=>faults.push('PAGE '+e.message));
  page.on('requestfailed',r=>{
   if(r.url().includes('/assets/furniture/meshy-room-v1/')||
      r.url().includes('/src/'))
    faults.push('REQUEST '+r.url()+' '+r.failure()?.errorText);
  });
  try{
   const pending=page.waitForResponse(r=>
    r.url().includes('/assets/furniture/meshy-room-v1/'+sku+'.glb'),{timeout:65000});
   await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
   await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
   const response=await pending;
   assert.equal(response.status(),200,sku+' must fetch GLB');
   await page.waitForTimeout(350); // allow PlayCanvas container instantiate
   const bytes=await page.locator('#game-canvas').screenshot();
   assert.ok(bytes.length>2500,sku+' mobile WebGL canvas');
   const stored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
   assert.equal(stored.version,1,'save root remains v1');
   assert.ok(stored.world.furniture.instances.some(x=>x.itemDefinitionId===sku),
    'purchased SKU must survive load with same identity');
   if(['sofa.comfort','armchair.wing','rug.weave','sconce.halo','bed.platform']
      .includes(sku)){
    await page.screenshot({path:'meshy-room-artifacts/'+sku+'.png',animations:'disabled'});
   }
   assert.deepEqual(faults,[],sku+' runtime faults');
   rows.push({sku,viewport,bytes:bytes.length,status:response.status()});
   console.log((index+1)+'/15 '+sku+': WebGL and GLB HTTP PASS');
  }catch(e){errors.push(sku+': '+(e.stack||e));}
  finally{await context.close();}
 }
}finally{await browser.close();}
writeFileSync('meshy-room-artifacts/report.json',JSON.stringify({rows,errors},null,2));
assert.deepEqual(errors,[],'All 15 genuine GLB WebGL smoke tests');
console.log('All 15 Meshy furniture SKU: PlayCanvas/WebGL and v1 save PASS');
