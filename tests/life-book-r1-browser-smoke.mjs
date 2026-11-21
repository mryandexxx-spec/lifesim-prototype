/** BOOK-R1: real PlayCanvas/WebGL boot on four mobile viewports plus DOM catalog. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
import {READING_BOOKS,READING_CONTENT_ID,READING_ADVANCED_CONTENT_ID} from '../src/hobby-reading.js';
const sizes=[[390,844],[375,667],[320,568],[844,390]];
const state=newHousehold('2026-11-21');
state.autonomy.enabled=false;state.otherSim.autonomy.enabled=false;
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
try{
 for(const [width,height] of sizes){
   const ctx=await browser.newContext({viewport:{width,height},isMobile:true,
     hasTouch:true,deviceScaleFactor:1});
   await ctx.addInitScript(({key,seed,tour})=>{
     localStorage.setItem(key,JSON.stringify(seed));
     localStorage.setItem(tour,'done');
   },{key:SAVE_KEY,seed:state,tour:UI_TOUR_STORAGE_KEY});
   const page=await ctx.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('requestfailed',e=>{if(/\/src\/|\/vendor\//.test(e.url()))errors.push(e.url());});
   try{
     await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
     await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
     assert.ok((await page.locator('#game-canvas').screenshot()).length>2000);
     const values=await page.locator('#reading-content-select option').evaluateAll(
       options=>options.map(x=>({id:x.value,text:x.textContent,disabled:x.disabled})));
     assert.equal(values.length,10,width+'x'+height+' book entries');
     assert.deepEqual(values.map(v=>v.id),READING_BOOKS.map(x=>x.id));
     assert.equal(values[0].id,READING_CONTENT_ID);
     assert.equal(values[0].disabled,false);
     assert.equal(values.find(v=>v.id===READING_ADVANCED_CONTENT_ID).disabled,true);
     assert.equal(values.find(v=>v.id==='book.orbit.scifi').disabled,false);
     assert.equal(values.find(v=>v.id==='book.silence.drama').disabled,true);
     assert.ok(values.every(v=>v.text.includes('доступно')||v.text.includes('уровне')));
     const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
     assert.ok(overflow<=2,width+'x'+height+' overflow '+overflow);
     assert.deepEqual(errors,[],width+'x'+height+' browser errors');
     console.log('BOOK-R1 real WebGL '+width+'x'+height+' pass');
   }finally{await ctx.close();}
 }
}finally{await browser.close();}
