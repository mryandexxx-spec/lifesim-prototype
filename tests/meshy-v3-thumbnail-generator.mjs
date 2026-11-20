/** Render 13 true-GLB store thumbnails from exact in-game Meshy transforms. */
import assert from 'node:assert/strict';
import {mkdirSync,statSync} from 'node:fs';
import {chromium} from 'playwright';
import {MESHY_ROOM_V3_ENTRIES} from '../src/meshy-room-v3-data.js';
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
mkdirSync('assets/furniture/meshy-room-v3/thumbnails',{recursive:true});
try{
  const page=await browser.newPage({viewport:{width:320,height:250},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  for(const [i,item] of MESHY_ROOM_V3_ENTRIES.entries()){
    await page.goto('http://127.0.0.1:8765/tools/meshy-room-thumbnail.html?sku='+encodeURIComponent(item.sku),
      {waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__thumb?.ready||window.__thumb?.error,
      null,{timeout:90000});
    const state=await page.evaluate(()=>window.__thumb);
    assert.equal(state.error,null,item.sku+' real GLB');
    const path='assets/furniture/meshy-room-v3/thumbnails/'+item.sku+'.png';
    await page.locator('#viewer').screenshot({path,omitBackground:true});
    assert.ok(statSync(path).size>1500,item.sku+' must be a real WebGL screenshot');
    console.log((i+1)+'/13 '+item.sku+' '+statSync(path).size+' bytes');
  }
  assert.deepEqual(errors,[],'no page-level WebGL errors');
}finally{await browser.close();}
