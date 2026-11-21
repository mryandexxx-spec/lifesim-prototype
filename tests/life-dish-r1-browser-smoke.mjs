/** DISH-R1 real PlayCanvas/WebGL validation on four iPhone-like viewports. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
const sizes=[[390,844],[375,667],[320,568],[844,390]];
const state=newHousehold('2026-11-21');
state.autonomy.enabled=false;state.otherSim.autonomy.enabled=false;
state.kitchen.dirtyDishes=7;
state.world.furniture.instances.push({
  instanceId:'dish-smoke-sink',prefabId:'sink',itemDefinitionId:'sink.farm',
  location:'home',x:13,z:1.5,yaw:0
});
state.position=furnitureActionApproach(state.world,'wash','dish-smoke-sink');
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
    await page.goto('http://127.0.0.1:8765/?dish-r1=qa',{waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
    await page.waitForFunction(()=>window.__LifeSimDishStats?.().visible===7,{timeout:25000});
    const stats=await page.evaluate(()=>window.__LifeSimDishStats());
    assert.deepEqual(stats,{canonical:7,visible:7,poolSize:32},width+'x'+height);
    assert.ok((await page.locator('#game-canvas').screenshot()).length>2000);
    assert.equal(await page.locator('#dish-alert').isVisible(),true);
    assert.match(await page.locator('#dish-alert').innerText(),/7/);
    await page.locator('#dish-alert').click();
    assert.match(await page.locator('#action-title').innerText(),/Кухонная мойка/);
    assert.match(await page.locator('#action-button').innerText(),/Помыть до 3/);
    assert.match(await page.locator('#action-description').innerText(),/Грязных тарелок: 7/);
    assert.ok((await page.evaluate(()=>window.__LifeSimDishStats())).canonical===7,
      'selecting wash alone cannot clear a dish');
    if(width===390&&height===844){
      await page.locator('#action-button').click();
      const queued=await page.evaluate(()=>window.__LifeSimDishStats());
      assert.equal(queued.canonical,7,'FIFO press cannot clear a dish instantly');
      await page.waitForFunction(()=>window.__LifeSimDishStats?.().canonical===4,
        {timeout:45000});
      assert.deepEqual(await page.evaluate(()=>window.__LifeSimDishStats()),
        {canonical:4,visible:4,poolSize:32},'physical wash -> three fewer 3D plates');
    }
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.ok(overflow<=2,width+'x'+height+' overflow '+overflow);
    assert.deepEqual(errors,[],width+'x'+height+' page errors');
    console.log('DISH-R1 PlayCanvas/WebGL '+width+'x'+height+' pass');
  }finally{await ctx.close();}
 }
}finally{await browser.close();}
