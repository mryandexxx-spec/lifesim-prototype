/** COOK-R1: real PlayCanvas WebGL, skill-gated recipes and cost quote at
 * four Safari-sized touch viewports. No second economy or early meal mint. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const sizes=[[390,844],[375,667],[320,568],[844,390]];
const seed=newHousehold('2026-11-21');
seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
seed.paused=true;
seed.skills.xpById.cooking=610; // level 8: four new recipes available
seed.kitchen.pantry.herbs=8;
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
    try{
      await page.goto('http://127.0.0.1:8765/?cook-r1=qa',
        {waitUntil:'domcontentloaded'});
      await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
      assert.ok((await page.locator('#game-canvas').screenshot()).length>2000);
      assert.equal(await page.evaluate(()=>Boolean(document.querySelector(
        '#game-canvas')?.getContext('webgl2')||
        document.querySelector('#game-canvas')?.getContext('webgl'))),true);
      const fridge=page.locator('#hotspots .hotspot').filter({hasText:'Холодильник'});
      assert.equal(await fridge.count(),1);
      await fridge.evaluate(node=>node.click());
      const menu=page.locator('#cooking-recipe-select');
      assert.equal(await menu.locator('option').count(),9);
      for(const id of ['cook.grain-bowl','cook.herb-noodles',
        'cook.roast-tray','cook.festival-pie']){
        assert.equal(await menu.locator('option[value="'+id+'"]').isEnabled(),true);
      }
      await menu.selectOption('cook.festival-pie');
      const note=await page.locator('#cook-recipe-quote').innerText();
      assert.match(note,/Эквивалент купленных продуктов/);
      assert.match(note,/Садовые травы ×2/);
      assert.match(note,/Качество «Отличное»/);
      assert.match(note,/кредиты не списываются/);
      const box=await page.locator('#cook-recipe-quote').boundingBox();
      assert.ok(box&&box.width<=width,'cost quote fits phone');
      const overflow=await page.evaluate(()=>
        document.documentElement.scrollWidth-innerWidth);
      assert.ok(overflow<=2,'no horizontal overflow '+width+'x'+height+' '+overflow);
      assert.deepEqual(errors,[],'no runtime/ESM errors '+width+'x'+height);
      console.log('COOK-R1 PlayCanvas/WebGL '+width+'x'+height+' pass');
    }finally{await context.close();}
  }
}finally{await browser.close();}
