/** FRIDGE-UX-R2: real PlayCanvas/WebGL at two mobile Safari-like viewports.
 * Uses the actual fridge hotspot + existing HUD and game JS, not a styled mock.
 */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const seed=newHousehold('2026-11-22');
seed.paused=true;seed.otherSim.paused=true;
seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
try{
  mkdirSync('artifacts/fridge-ux-r2',{recursive:true});
  for(const [width,height] of [[390,844],[320,568]]){
    const context=await browser.newContext({
      viewport:{width,height},deviceScaleFactor:1,hasTouch:true,isMobile:true,
      serviceWorkers:'block'
    });
    await context.addInitScript(({key,record,tour})=>{
      localStorage.setItem(key,JSON.stringify(record));
      localStorage.setItem(tour,'done');
    },{key:SAVE_KEY,record:seed,tour:UI_TOUR_STORAGE_KEY});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('crash',()=>errors.push('renderer crashed'));
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
    const graphics=await page.evaluate(async()=>{
      const {Application}=await import('playcanvas');
      return Boolean(Application.getApplication()?.graphicsDevice?.canvas);
    });
    assert.equal(graphics,true,'real PlayCanvas WebGL graphics required');
    async function openFridge(){
      await page.evaluate(()=>{
        const layer=document.getElementById('hotspots');
        layer.hidden=false;
        const item=[...layer.querySelectorAll('button')].find(
          b=>b.textContent.includes('Холодильник'));
        if(!item)throw new Error('Real fridge hotspot not found');
        item.click();
      });
      await page.locator('#fridge-r2').waitFor({state:'visible',timeout:10000});
    }
    await openFridge();
    assert.equal(await page.locator('.fridge-r2-tabs [role="tab"]').count(),3);
    assert.equal(await page.locator('#fridge-r2-tab-eat').getAttribute('aria-selected'),'true');
    assert.match(await page.locator('#fridge-r2-summary').textContent(),/Алекс/);
    assert.equal(await page.locator('#fridge-r2-meal-list .fridge-r2-card').count(),0,
      'new household must not invent cooked servings');
    assert.equal(await page.locator('#fridge-r2-recipe-list .fridge-r2-card').count()>0,true);
    await page.screenshot({path:'artifacts/fridge-ux-r2/eat-'+width+'.png'});
    await page.locator('#fridge-r2-tab-stock').click();
    assert.equal(await page.locator('#fridge-r2-stock').isVisible(),true);
    assert.match(await page.locator('#fridge-r2-stock').textContent(),/Овощи/);
    await page.screenshot({path:'artifacts/fridge-ux-r2/stock-'+width+'.png'});
    await page.locator('#fridge-r2-tab-buy').click();
    assert.equal(await page.locator('#fridge-r2-buy').isVisible(),true);
    assert.match(await page.locator('#fridge-r2-ready-list').textContent(),/Солнечная крупяная миска/);
    assert.match(await page.locator('#fridge-r2-ready-list').textContent(),/18 кр/);
    await page.screenshot({path:'artifacts/fridge-ux-r2/buy-'+width+'.png'});
    const bounds=await page.evaluate(()=>{
      const r=document.querySelector('#action-sheet').getBoundingClientRect();
      const h=document.querySelector('#dashboard').getBoundingClientRect();
      return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,hudTop:h.top};
    });
    assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.right<=width+1,'sheet within phone');
    assert.ok(bounds.bottom<=bounds.hudTop+2,'sheet must not obscure lower HUD');
    // Resident switching closes the optional sheet; the next fridge tap
    // targets Mira and resets to the default «Поесть» tab.
    await page.evaluate(()=>document.getElementById('pick-mira').click());
    await openFridge();
    assert.match(await page.locator('#fridge-r2-summary').textContent(),/Мира/);
    assert.equal(await page.locator('#fridge-r2-tab-eat').getAttribute('aria-selected'),'true');
    const post=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(post.version,1,'save v1 unchanged');
    assert.equal(post.kitchen.prepared.length,0,'no free meals');
    assert.equal(post.shop.credits,seed.shop.credits,'tab clicks do not spend money');
    assert.deepEqual(errors,[]);
    await context.close();
  }
  console.log('FRIDGE-UX-R2 real PlayCanvas WebGL 390x844 and 320x568 three-tab + Mira smoke PASS');
}finally {await browser.close();}
