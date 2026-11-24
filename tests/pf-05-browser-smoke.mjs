/** Real PlayCanvas mobile QA: same physical mirror, distinct manual intents. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {findMarketPlacement,buyMarketItem} from '../src/furniture-shop.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
try{
  for(const [width,height,resident,speech,duration,label] of [
    [390,844,'alex',true,24,'Репетировать речь'],
    [320,568,'mira',false,17,'Причесаться у зеркала']
  ]){
    const seed=newHousehold('2026-11-24'),actor=resident==='alex'?seed:seed.otherSim;
    seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
    const pose=findMarketPlacement(seed.world.furniture,seed.shop,'mirror.panel');
    const bought=buyMarketItem(seed.world.furniture,seed.shop,'mirror.panel',pose);
    assert.ok(bought.ok,bought.reason);
    seed.world.furniture=bought.world;seed.shop=bought.shop;
    const instanceId=bought.instanceId;
    actor.position={...furnitureActionApproach(seed.world,'mirror',instanceId)};
    actor.needs.social=25;actor.needs.fun=25;seed.selectedSim=resident;
    const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'});
    try{
      await context.addInitScript(({key,record,tour})=>{
        localStorage.setItem(key,JSON.stringify(record));localStorage.setItem(tour,'done');
      },{key:SAVE_KEY,record:seed,tour:UI_TOUR_STORAGE_KEY});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('crash',()=>errors.push('renderer crash'));
      await page.goto('http://127.0.0.1:8765/?pf-05=qa',{waitUntil:'domcontentloaded'});
      await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
      assert.ok(await page.evaluate(()=>Boolean(document.querySelector('#game-canvas')?.getContext('webgl2')||document.querySelector('#game-canvas')?.getContext('webgl'))));
      const snap=()=>page.evaluate(({resident,instanceId})=>window.__LifeSimMirrorQA(resident,instanceId),{resident,instanceId});
      if(!(await snap()).paused)await page.locator('#pause-btn').tap();
      if((await snap()).speed!==3)await page.locator('#speed-btn').tap();
      const before=await snap();assert.equal(before.paused,true);
      await page.evaluate(resident=>{
        document.getElementById('pick-'+resident).click();
        const layer=document.getElementById('hotspots');layer.hidden=false;
        const button=[...layer.querySelectorAll('button')].find(b=>b.textContent.includes('Зеркало'));
        if(!button)throw Error('missing mirror hotspot');
        button.click();
      },resident);
      const action=page.locator(speech?'#mirror-speech-button':'#action-button');
      await action.waitFor({state:'visible'});
      assert.ok((await action.textContent()).includes(label));
      await action.tap();
      await page.evaluate(({resident,instanceId})=>{
        window.__pf05Trace=[];
        let seen=false;
        const frame=()=>{
          const s=window.__LifeSimMirrorQA(resident,instanceId);
          s.hud=document.getElementById('status-text').textContent;
          if(s.id==='mirror'){seen=true;window.__pf05Trace.push(s);}
          else if(seen){window.__pf05Trace.push(s);return;}
          requestAnimationFrame(frame);
        };frame();
      },{resident,instanceId});
      await page.locator('#pause-btn').tap();
      await page.waitForFunction(()=>window.__pf05Trace.length>1&&window.__pf05Trace.at(-1).id===null,null,{timeout:90000});
      const trace=await page.evaluate(()=>window.__pf05Trace),using=trace.filter(x=>x.phase==='using');
      const end=trace.at(-1);
      assert.ok(using.length>1,'physical mirror using phase observed');
      assert.ok(using.every(x=>x.speech===speech&&x.target===instanceId&&x.duration===duration&&x.label===label));
      assert.ok(using.some(x=>x.hud.includes(label)),'live HUD label');
      assert.ok(using.some(x=>x.glint?.enabled&&(speech?x.glint.x>x.glint.y:x.glint.y>x.glint.x)),'distinct actual object effect');
      assert.ok(Math.abs(end.minutes-using[0].minutes-duration)<=3.6,'duration '+JSON.stringify([using[0],end]));
      assert.equal(end.xp-before.xp,speech?18:0);
      assert.match(end.event,speech?/Речь отрепетирована/:/Причесаться у зеркала — готово/);
      assert.equal(end.social>before.social,speech);
      assert.deepEqual(errors,[]);
      console.log('PF-05/A real PlayCanvas mirror',JSON.stringify({width,height,resident,speech,duration,actual:end.minutes-using[0].minutes,xp:end.xp-before.xp}));
    }finally{await context.close();}
  }
}finally{await browser.close();}
