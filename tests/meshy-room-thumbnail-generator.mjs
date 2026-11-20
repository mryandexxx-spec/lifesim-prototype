/** Generate static real-GLB catalog photos once in CI, never on iPhone. */
import assert from 'node:assert/strict';
import {mkdirSync,statSync} from 'node:fs';
import {chromium} from 'playwright';
import {MESHY_FURNITURE_SKUS} from '../src/meshy-furniture-policy.js';
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
mkdirSync('assets/furniture/meshy-room-v1/thumbnails',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:320,height:250},deviceScaleFactor:1});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 for(const [i,sku] of MESHY_FURNITURE_SKUS.entries()){
  await page.goto('http://127.0.0.1:8765/tools/meshy-room-thumbnail.html?sku='+encodeURIComponent(sku),
   {waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__thumb?.ready||window.__thumb?.error,
    null,{timeout:60000});
  const state=await page.evaluate(()=>window.__thumb);
  assert.equal(state.error,null,sku+' GLB thumbnail');
  const path='assets/furniture/meshy-room-v1/thumbnails/'+sku+'.png';
  await page.locator('#viewer').screenshot({path,omitBackground:true});
  assert.ok(statSync(path).size>1800,sku+' non-empty screenshot');
  console.log((i+1)+'/15 '+sku+' '+statSync(path).size+' bytes');
 }
 assert.deepEqual(errors,[],'no WebGL errors');
}finally{await browser.close()}
