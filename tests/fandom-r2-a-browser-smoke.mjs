/** FANDOM-R2-A real mobile PlayCanvas + procedural phone broadcast smoke.
 * Two target viewports; no purchased TV, free Fun or phantom saved TV receipt.
 * Physical Safari owner QA remains deferred.
 */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold,tickHousehold} from '../src/household.js';
import {sportsFixtures} from '../src/sports-league.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
try{
  mkdirSync('artifacts/fandom-r2-a',{recursive:true});
  for(const [width,height] of [[390,844],[320,568]]){
    const root=newHousehold('2026-11-22'),match=sportsFixtures(root.sportsWorld)[0];
    root.autonomy.enabled=false;root.otherSim.autonomy.enabled=false;
    tickHousehold(root,match.kickoff-root.minutes+32);
    root.world.furniture.instances=root.world.furniture.instances.filter(x=>x.prefabId!=='tv');
    const context=await browser.newContext({viewport:{width,height},
      deviceScaleFactor:1,isMobile:true,hasTouch:true,serviceWorkers:'block'});
    await context.addInitScript(({key,record,tour})=>{
      if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
      localStorage.setItem(tour,'done');
    },{key:SAVE_KEY,record:root,tour:UI_TOUR_STORAGE_KEY});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('crash',()=>errors.push('WebGL crashed'));
    await page.goto('http://127.0.0.1:8765/?fandom-r2-a',
      {waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:80000});
    assert.ok((await page.locator('#game-canvas').screenshot()).length>2400);
    await page.locator('#career-phone-toggle').tap();
    const panel=page.locator('#career-phone-panel');
    await panel.waitFor({state:'visible'});
    assert.equal(await panel.locator('.phone-platform-tile').count(),5);
    await panel.locator('[data-phone-app="sports"]').tap();
    const before=JSON.parse(await page.evaluate(k=>localStorage.getItem(k),SAVE_KEY));
    assert.equal(before.world.furniture.instances.some(x=>x.prefabId==='tv'),false);
    assert.equal(await panel.locator('.sports-watch-match').isEnabled(),false,
      'physical TV watch remains gated by genuine TV ownership');
    await panel.locator('.sports-watch-mobile').tap();
    await panel.locator('.sports-phone-stream-canvas').waitFor({state:'visible'});
    const painted=await panel.locator('.sports-phone-stream-canvas').evaluate(canvas=>{
      const ctx=canvas.getContext('2d');
      const samples=[[10,10],[110,85],[230,150],[450,210],[120,260]];
      const colors=samples.map(([x,y])=>[...ctx.getImageData(x,y,1,1).data].join(','));
      return {size:[canvas.width,canvas.height],colors:[...new Set(colors)].length,
        source:canvas.toDataURL().length};
    });
    assert.deepEqual(painted.size,[512,312]);
    assert.ok(painted.colors>=3,'a genuine drawn pitch, not a static blank canvas');
    assert.ok(painted.source>2000,'procedural broadcast has visible pixels');
    assert.match(await panel.locator('.sports-phone-stream-status').innerText(),/Прямой игровой эфир/);
    const after=JSON.parse(await page.evaluate(k=>localStorage.getItem(k),SAVE_KEY));
    assert.equal(after.version,1);
    assert.equal(after.needs.fun,before.needs.fun,'no immediate remote phone Fun reward');
    assert.equal(after.action?.id,'tv',false);
    assert.deepEqual(after.sportsWorld.results,before.sportsWorld.results);
    assert.deepEqual(errors,[],'browser errors at '+width+'x'+height);
    await page.screenshot({path:'artifacts/fandom-r2-a/mobile-'+width+'.png'});
    await context.close();
  }
  console.log('FANDOM-R2-A 390x844/320x568 actual PlayCanvas + original phone live Canvas2D PASS; iPhone device QA deferred');
}finally{await browser.close();}
