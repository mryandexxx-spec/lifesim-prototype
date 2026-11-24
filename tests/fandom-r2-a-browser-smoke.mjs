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
    assert.notEqual(after.action?.id,'tv','phone stream must not forge physical TV use');
    assert.deepEqual(after.sportsWorld.results,before.sportsWorld.results);
    assert.deepEqual(errors,[],'browser errors at '+width+'x'+height);
    await page.screenshot({path:'artifacts/fandom-r2-a/mobile-'+width+'.png'});

    // PF-02: drive the real phone presenter with a deterministic canonical
    // clock fixture in its own DOM, without changing or exposing live game state.
    const fixture=newHousehold('2026-11-22'),first=sportsFixtures(fixture.sportsWorld)[0];
    fixture.minutes=first.kickoff-1;fixture.otherSim.minutes=fixture.minutes;
    fixture.autonomy.enabled=false;fixture.otherSim.autonomy.enabled=false;
    fixture.world.furniture.instances=fixture.world.furniture.instances.filter(x=>x.prefabId!=='tv');
    await page.route('**/pf02-phone-fixture',route=>route.fulfill({contentType:'text/html',body:
      '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><div class="app-shell"><button id="pf02-open" style="position:fixed;top:20px;left:20px;z-index:1000">Телефон</button></div>'}));
    await page.goto('http://127.0.0.1:8765/pf02-phone-fixture');
    await page.evaluate(async record=>{
      const {createCareerPhoneUI}=await import('/src/career-phone-ui.js');
      const {tickHousehold}=await import('/src/household.js');
      const root=record;
      const ui=createCareerPhoneUI({host:document.querySelector('.app-shell'),
        trigger:document.querySelector('#pf02-open'),getRoot:()=>root,
        setCareerSystem:()=>{},save:()=>true,notify:()=>{}});
      window.pf02Fixture={advance:minute=>tickHousehold(root,minute-root.minutes),
        pause:()=>{root.paused=true;},snapshot:()=>JSON.stringify(root)};
    },fixture);
    await page.locator('#pf02-open').tap();
    await panel.locator('[data-phone-app="sports"]').tap();
    assert.equal(await panel.locator('.sports-phone-live').count(),0);
    await page.evaluate(minute=>window.pf02Fixture.advance(minute),first.kickoff+1);
    await panel.locator('.sports-watch-mobile').waitFor({state:'visible',timeout:3500});
    assert.equal(await panel.locator('.sports-watch-match').isEnabled(),false);
    const stateBefore=await page.evaluate(()=>window.pf02Fixture.snapshot());
    await panel.locator('.sports-watch-mobile').tap();
    const liveCanvas=panel.locator('.sports-phone-stream-canvas');
    await liveCanvas.waitFor({state:'visible'});
    assert.match(await panel.locator('.sports-phone-stream-status').innerText(),/Прямой игровой эфир/);
    assert.equal(await panel.locator('.sports-phone-stream').evaluate(el=>
      !!(el.compareDocumentPosition(el.parentElement.querySelector('.sports-phone-live'))&Node.DOCUMENT_POSITION_FOLLOWING)),true,
      'broadcast image is before the physical-TV controls');
    assert.equal(await page.evaluate(()=>window.pf02Fixture.snapshot()),stateBefore,'watching is read-only');
    await page.evaluate(minute=>window.pf02Fixture.advance(minute),first.end+1);
    await panel.locator('.sports-phone-live').waitFor({state:'detached',timeout:3500});
    await page.waitForFunction(()=>document.querySelector('.sports-phone-stream-status')?.textContent.includes('Следующий эфир'));
    assert.match(await panel.locator('.sports-phone-stream-status').innerText(),/\d{2}:\d{2}/);
    await page.evaluate(()=>window.pf02Fixture.pause());
    assert.equal(await panel.locator('.sports-watch-mobile').count(),0);
    assert.deepEqual(errors,[],'PF-02 presenter errors at '+width+'x'+height);
    await context.close();
  }
  console.log('FANDOM-R2-A 390x844/320x568 actual PlayCanvas + original phone live Canvas2D PASS; iPhone device QA deferred');
}finally{await browser.close();}
