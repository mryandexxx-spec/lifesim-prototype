import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold,loadHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {proposeConstructionEdit} from '../src/construction.js';
const state=newHousehold();
const room=proposeConstructionEdit(state.world.construction,{type:'room',from:{x:14,z:-2},to:{x:18,z:2}});
assert.ok(room.ok,room.reason);
const wall=room.world.wallEdges.find(w=>w.axis==='v'&&w.i===28&&w.j===0);
const door=proposeConstructionEdit(room.world,{type:'door',edgeId:wall.id});
assert.ok(door.ok,door.reason);
state.world.construction=door.world;
state.autonomy.enabled=false;state.otherSim.autonomy.enabled=false;
assert.equal(loadHousehold(state).world.construction.wallEdges.length,32);
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
try{
 const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});
 await ctx.addInitScript(({key,value})=>{
   localStorage.setItem(key,JSON.stringify(value));
   localStorage.setItem('lifesim.uiTour.v1','done');
 },{key:SAVE_KEY,value:state});
 const page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push('PAGE '+e.stack));
 page.on('crash',()=>errors.push('CRASH'));
 page.on('requestfailed',r=>{
   if(r.url().includes('/src/')||r.url().includes('/vendor/'))
     errors.push('REQUEST '+r.url()+' '+r.failure()?.errorText);
 });
 await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
 await page.locator('#loading').waitFor({state:'hidden',timeout:25000});
 await page.locator('#build-toggle').click();
 assert.equal(await page.locator('#build-toggle').getAttribute('aria-pressed'),'true');
 assert.ok(await page.locator('#build-editor').isVisible());
 await page.locator('[data-build-tool="wall"]').click();
 assert.equal(await page.locator('[data-build-tool="wall"]').getAttribute('aria-pressed'),'true');
 await page.locator('[data-build-walls="down"]').click();
 assert.equal(await page.locator('[data-build-walls="down"]').getAttribute('aria-pressed'),'true');
 await page.locator('[data-build-walls="cut"]').click();
 await page.locator('[data-build-tool="room"]').click();
 await page.screenshot({path:'f5a-browser-build.png'});
 await page.locator('#build-exit').click();
 assert.equal(await page.locator('#build-toggle').getAttribute('aria-pressed'),'false');
 assert.ok(await page.locator('#build-editor').isHidden());
 await page.locator('#build-toggle').click();
 assert.ok(await page.locator('#build-editor').isVisible());
 await page.locator('#build-exit').click();
 await page.waitForTimeout(500);
 const saved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY);
 assert.equal(saved.world.construction.wallEdges.length,32);
 assert.equal(saved.world.construction.openings.length,1);
 assert.equal(saved.world.construction.schema,1);
 console.log(JSON.stringify({errors,wallEdges:saved.world.construction.wallEdges.length,
  openings:saved.world.construction.openings.length,buildModeToggle:'ok'},null,2));
 assert.deepEqual(errors,[],'Real PlayCanvas/ES module browser runtime must not error');
}finally{await browser.close();}
