/** FANDOM-R2-B: actual two-size PlayCanvas/WebGL original club purchases. */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {findMarketPlacement,buyMarketItem} from '../src/furniture-shop.js';
import {selectSportsClub} from '../src/sports-fandom.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
const people={residents:[{x:-.8,z:2.95},{x:-.25,z:.35}]};
function boughtHome(){
 const root=newHousehold('2026-11-22');
 root.autonomy.enabled=false;root.otherSim.autonomy.enabled=false;
 for(const id of ['fanflag.sapphire-sparks','fanstand.moon-foxes']){
   const pose=findMarketPlacement(root.world.furniture,root.shop,id,people);
   assert.ok(pose,'real collision-safe place for '+id);
   const paid=buyMarketItem(root.world.furniture,root.shop,id,pose,people);
   assert.equal(paid.ok,true,'canonical paid purchase '+id+' '+paid.reason);
   root.world.furniture=paid.world;root.shop=paid.shop;
 }
 assert.equal(root.shop.credits,4910);
 assert.equal(selectSportsClub(root,'alex','sapphire-sparks').ok,true);
 return root;
}
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
try{
 mkdirSync('artifacts/fandom-r2-b',{recursive:true});
 for(const [width,height] of [[390,844],[320,568]]){
  const root=boughtHome();
  const context=await browser.newContext({viewport:{width,height},
    deviceScaleFactor:1,isMobile:true,hasTouch:true,serviceWorkers:'block'});
  await context.addInitScript(({key,record,tour})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
    localStorage.setItem(tour,'done');
  },{key:SAVE_KEY,record:root,tour:UI_TOUR_STORAGE_KEY});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('crash',()=>errors.push('Chromium WebGL crashed'));
  await page.goto('http://127.0.0.1:8765/?fandom-r2-b=qa',{waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:90000});
  assert.ok((await page.locator('#game-canvas').screenshot()).length>3000);
  const stats=await page.evaluate(()=>window.__LifeSimFanDecorStats?.());
  assert.equal(stats?.length,2,JSON.stringify(stats));
  for(const item of stats){
    assert.equal(item.visible,true,'purchased model shown '+item.sku);
    assert.ok(item.meshes>=6,'genuine authored 3D geometry '+JSON.stringify(item));
  }
  const saved=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY));
  assert.equal(saved.shop.credits,4910,'one ledger/wallet, no refund');
  assert.equal(saved.world.furniture.instances.filter(x=>x.prefabId.startsWith('fan')).length,2);
  await page.locator('#career-phone-toggle').tap();
  const panel=page.locator('#career-phone-panel');
  await panel.waitFor({state:'visible'});
  await panel.locator('[data-phone-app="sports"]').tap();
  assert.equal(await panel.locator('.sports-phone-personal-crest').count(),1);
  assert.equal(await panel.locator('.sports-phone-team .sports-phone-crest').count(),6);
  assert.match(await panel.locator('.sports-phone-personal-crest').innerText(),/Сапфировые Искры/);
  assert.deepEqual(errors,[],width+'x'+height);
  await page.screenshot({path:'artifacts/fandom-r2-b/mobile-'+width+'.png'});
  await context.close();
 }
 console.log('FANDOM-R2-B six-club 3D paid SKUs and phone original crests: two actual mobile WebGL viewports PASS');
}finally{await browser.close();}
