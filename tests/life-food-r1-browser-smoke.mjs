/** FOOD-R1: real PlayCanvas/WebGL browser, two payment channels, four iPhone sizes. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
import {readyMeal} from '../src/ready-meal-catalog.js';
const sizes=[[390,844],[375,667],[320,568],[844,390]];
const seed=newHousehold('2026-11-21');
seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
seed.paused=true; // keep due orders pending during touch checkout tests
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
try{
  for(const [width,height] of sizes){
    const context=await browser.newContext({viewport:{width,height},isMobile:true,
      hasTouch:true,deviceScaleFactor:1});
    await context.addInitScript(({key,game,tour})=>{
      localStorage.setItem(key,JSON.stringify(game));
      localStorage.setItem(tour,'done');
    },{key:SAVE_KEY,game:seed,tour:UI_TOUR_STORAGE_KEY});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('requestfailed',e=>{
      if(/\/src\/|\/vendor\//.test(e.url()))errors.push('failed asset '+e.url());
    });
    page.on('dialog',dialog=>dialog.accept());
    try{
      await page.goto('http://127.0.0.1:8765/?food-r1=qa',
        {waitUntil:'domcontentloaded'});
      await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
      const canvas=page.locator('#game-canvas');
      assert.ok((await canvas.screenshot()).length>2000,'real 3D scene');
      assert.equal(await page.evaluate(()=>Boolean(document.querySelector(
        '#game-canvas')?.getContext('webgl2')||
        document.querySelector('#game-canvas')?.getContext('webgl'))),true,
        'PlayCanvas must own a real WebGL context');
      await page.locator('#career-phone-toggle').tap();
      await page.locator('.career-phone-app-tab[data-app="food"]').tap();
      assert.match(await page.locator('#career-phone-title').innerText(),/Доставка/);
      assert.equal(await page.locator('.ready-food-card').count(),3);
      const cards=page.locator('.ready-food-card');
      for(let i=0;i<3;i++){
        const rect=await cards.nth(i).locator('button').boundingBox();
        assert.ok(rect&&rect.height>=44,'thumb target at '+width+'x'+height);
      }
      assert.equal(await cards.first().locator('button').isEnabled(),true);
      const nav=page.locator('.career-phone-apps');
      const n=await nav.boundingBox();
      assert.ok(n&&n.width<=width+1,'phone tabs fit portrait');
      if(width===390&&height===844){
        const before=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),
          SAVE_KEY);
        await cards.first().locator('button').tap();
        const paid=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),
          SAVE_KEY);
        const food=readyMeal('ready.sunny-grains');
        assert.equal(paid.shop.credits,before.shop.credits-food.deliveryPrice);
        assert.equal(paid.kitchen.deliveries.length,1);
        assert.equal(paid.kitchen.prepared.length,0);
        assert.equal(paid.financialHistory.entries.length,1);
        assert.match(await page.locator('.career-phone-facts').last().innerText(),
          /В пути/);
        assert.equal(await page.locator('.career-phone-app-tab[data-app="finance"]')
          .isVisible(),true);
        await page.locator('.career-phone-x').tap();
        // The fridge uses its existing physical action sheet and immediate stock.
        const fridge=page.locator('#hotspots .hotspot').filter({hasText:'Холодильник'});
        assert.equal(await fridge.count(),1);
        await fridge.evaluate(node=>node.click());
        assert.equal(await page.locator('#fridge-ready-select').isVisible(),true);
        await page.locator('#fridge-ready-select').selectOption('ready.garden-wrap');
        await page.locator('#fridge-ready-buy-button').tap();
        const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),
          SAVE_KEY);
        assert.equal(saved.kitchen.deliveries.length,1);
        assert.deepEqual(saved.kitchen.prepared,
          [{recipeId:'ready.garden-wrap',portions:1}]);
        assert.equal(saved.financialHistory.entries.length,2);
        assert.equal(saved.shop.credits,before.shop.credits-
          food.deliveryPrice-readyMeal('ready.garden-wrap').fridgePrice);
      }
      const overflow=await page.evaluate(()=>
        document.documentElement.scrollWidth-innerWidth);
      assert.ok(overflow<=2,'no horizontal overflow '+width+'x'+height+' '+overflow);
      assert.deepEqual(errors,[],'no runtime/ESM errors '+width+'x'+height);
      console.log('FOOD-R1 PlayCanvas/WebGL '+width+'x'+height+' pass');
    }finally{await context.close();}
  }
}finally{await browser.close();}
