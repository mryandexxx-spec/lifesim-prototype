/** UX-02a real PlayCanvas/SwiftShader touchscreen catalog smoke.
 * This is Chromium CI, NOT the product owner's physical iPhone acceptance.
 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const sizes=[[390,844],[375,667],[320,568],[844,390]];
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
mkdirSync('ux02a-artifacts',{recursive:true});
const report=[],errors=[];
try{
 for(const [w,h] of sizes){
  const seed=newHousehold('2026-11-20');
  seed.paused=true;seed.otherSim.paused=true;
  seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
  const context=await browser.newContext({
   viewport:{width:w,height:h},isMobile:true,hasTouch:true,deviceScaleFactor:1
  });
  await context.addInitScript(({key,record,tourKey})=>{
   localStorage.setItem(key,JSON.stringify(record));
   localStorage.setItem(tourKey,'done');
  },{key:SAVE_KEY,record:seed,tourKey:UI_TOUR_STORAGE_KEY});
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(w+'x'+h+' '+error.message));
  page.on('requestfailed',request=>{
   if(request.url().includes('/src/')||request.url().includes('/vendor/'))
    errors.push(w+'x'+h+' '+request.url()+' '+request.failure()?.errorText);
  });
  try{
   await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
   await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
   assert.ok((await page.locator('#game-canvas').screenshot()).length>2000,
    'real WebGL canvas screenshot');
   await page.locator('#home-open').tap();
   await page.locator('#home-furnish').tap();
   await page.locator('#furnish-shop-toggle').tap();
   const sheet=page.locator('#furniture-editor');
   assert.equal(await sheet.getAttribute('data-editor-view'),'shop');
   await page.evaluate(()=>{document.querySelector('#furniture-editor').scrollTop=0;});
   await page.waitForTimeout(150);
   const bounds=await page.evaluate(()=>{
    const editor=document.querySelector('#furniture-editor').getBoundingClientRect();
    const button=document.querySelector('#furnish-buy').getBoundingClientRect();
    const action=document.querySelector('.furnish-purchase-actions').getBoundingClientRect();
    return {editor:{top:editor.top,bottom:editor.bottom},
     button:{top:button.top,bottom:button.bottom,height:button.height,width:button.width},
     action:{top:action.top,bottom:action.bottom}};
   });
   assert.ok(bounds.button.height>=44,'purchase target ≥44px');
   assert.ok(bounds.button.top>=bounds.editor.top-1&&
    bounds.button.bottom<=bounds.editor.bottom+1,
    'purchase CTA must remain visible WITHOUT scrolling through 47 cards '+JSON.stringify(bounds));
   assert.match(await page.locator('#furnish-buy').innerText(),/Примерить/);
   await page.screenshot({path:'ux02a-artifacts/catalog-'+w+'x'+h+'.png',
    animations:'disabled'});
   const chair=page.locator('#furnish-stock button[data-item-id="chair.loft"]');
   await chair.tap();
   assert.equal(await sheet.getAttribute('data-shop-placing'),'true',
    'first tap on SKU must immediately open placement preview');
   assert.match(await page.locator('#furnish-buy').innerText(),/Купить и установить/);
   assert.equal(await page.locator('#furnish-balance').innerText(),'Кредиты: 5000');
   await page.screenshot({path:'ux02a-artifacts/preview-'+w+'x'+h+'.png',
    animations:'disabled'});
   await page.locator('#furnish-place-cancel').tap();
   assert.equal(await sheet.getAttribute('data-shop-placing'),'false');
   assert.equal(await page.locator('#furnish-balance').innerText(),'Кредиты: 5000');
   await chair.tap();
   await page.locator('#furnish-preview-auto').tap();
   assert.equal(await page.locator('#furnish-buy').isEnabled(),true,
    'chair must have a safe placement using Find place');
   await page.locator('#furnish-buy').tap();
   assert.equal(await sheet.getAttribute('data-shop-placing'),'false');
   assert.equal(await page.locator('#furnish-balance').innerText(),'Кредиты: 4890');
   const stored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
   assert.equal(stored.version,1);
   assert.equal(stored.shop.credits,4890);
   assert.equal(stored.world.furniture.instances.filter(i=>
    i.itemDefinitionId==='chair.loft'&&i.location==='home').length,1);
   report.push({w,h,bounds,credits:stored.shop.credits,items:stored.world.furniture.instances.length});
   await page.screenshot({path:'ux02a-artifacts/purchased-'+w+'x'+h+'.png',
    animations:'disabled'});
  }catch(error){errors.push(w+'x'+h+' '+(error.stack||error));}
  finally{await context.close();}
 }
}finally{await browser.close();}
writeFileSync('ux02a-artifacts/measurements.json',JSON.stringify({report,errors},null,2));
console.log(JSON.stringify({report,errors},null,2));
assert.deepEqual(errors,[],'UX-02a WebGL and mobile touch regressions');
