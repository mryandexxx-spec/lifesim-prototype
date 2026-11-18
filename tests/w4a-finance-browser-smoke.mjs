/** W4-A mobile WebGL acceptance: migrate old v1, transact genuine furniture in touch UI. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';

const seed=newHousehold('2026-11-18');
seed.shop.credits=2719; // old previously earned money, must NOT refill.
delete seed.financialHistory;
seed.autonomy.enabled=false;
seed.otherSim.autonomy.enabled=false;
const plant=seed.world.furniture.instances.find(i=>i.prefabId==='plant');
assert.ok(plant);
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const faults=[];
try{
  for(const [width,height] of [[390,844],[844,390]]){
    const ctx=await browser.newContext({viewport:{width,height},isMobile:true,
      hasTouch:true,deviceScaleFactor:1});
    await ctx.addInitScript(({key,root})=>{
      // Only seed the first navigation: reload must retain the game's own save.
      if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(root));
      localStorage.setItem('lifesim.uiTour.v1','done');
    },{key:SAVE_KEY,root:seed});
    const page=await ctx.newPage();
    page.on('pageerror',e=>faults.push(width+'x'+height+' PAGE '+e.message));
    page.on('requestfailed',r=>{
      if(r.url().includes('/src/')||r.url().includes('/vendor/'))
        faults.push(width+'x'+height+' REQ '+r.url()+' '+r.failure()?.errorText);
    });
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:60000});
    assert.ok((await page.locator('#game-canvas').screenshot()).length>2000);
    await page.locator('#home-open').tap();
    await page.locator('#home-furnish').tap();
    await page.locator('#furnish-item-select').selectOption(plant.instanceId);
    const selected=await page.locator('#furnish-item-select').inputValue();
    const sellDisabled=await page.locator('#furnish-sell').isDisabled();
    const sellVisible=await page.locator('#furnish-sell').isVisible();
    let confirmed=false;
    page.once('dialog',async d=>{confirmed=true;await d.accept();});
    await page.locator('#furnish-sell').tap();
    const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    console.log('W4A sale diagnostic',JSON.stringify({width,height,selected,sellDisabled,
      sellVisible,confirmed,credits:saved.shop?.credits,
      entries:saved.financialHistory?.entries?.length,
      feedback:await page.locator('#furnish-feedback').textContent()}));
    assert.equal(saved.version,1);
    assert.equal(saved.shop.credits,2810,'legacy balance plus one 70% plant sale');
    assert.equal(saved.financialHistory.schema,1);
    assert.equal(saved.financialHistory.entries.length,1);
    assert.equal(saved.financialHistory.entries[0].kind,'sale');
    assert.equal(saved.financialHistory.entries[0].delta,91);
    assert.equal(saved.world.furniture.instances.some(i=>i.instanceId===plant.instanceId),false);
    await page.screenshot({path:'w4a-finance-'+width+'x'+height+'.png'});
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:60000});
    const restored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(restored.shop.credits,2810);
    assert.equal(restored.financialHistory.entries.length,1);
    assert.equal(faults.length,0,faults.join('\n'));
    await ctx.close();
  }
  console.log('W4-A original WebGL, touch sale, v1 balance/history and reload: PASS');
}finally{await browser.close();}
