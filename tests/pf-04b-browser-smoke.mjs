/** PF-04/B real mobile WebGL: manual care at full needs via object menu. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
try{
  for(const [width,height,speed,resident,id,label,need,duration] of [
    [390,844,1,'alex','shower','Душев','hygiene',16],
    [320,568,3,'mira','toilet','Унитаз','bladder',18]
  ]){
    const seed=newHousehold('2026-11-24'),actor=resident==='alex'?seed:seed.otherSim;
    seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
    actor.needs[need]=100;actor.position={...furnitureActionApproach(seed.world,id)};
    seed.selectedSim=resident;
    const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'});
    try{
      await context.addInitScript(({key,record,tour})=>{
        localStorage.setItem(key,JSON.stringify(record));localStorage.setItem(tour,'done');
      },{key:SAVE_KEY,record:seed,tour:UI_TOUR_STORAGE_KEY});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('crash',()=>errors.push('renderer crash'));
      await page.goto('http://127.0.0.1:8765/?pf-04b=qa',{waitUntil:'domcontentloaded'});
      await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
      assert.ok(await page.evaluate(()=>Boolean(document.querySelector('#game-canvas')?.getContext('webgl2')||document.querySelector('#game-canvas')?.getContext('webgl'))));
      const snap=()=>page.evaluate(id=>window.__LifeSimManualCareQA(id),resident);
      if(!(await snap()).paused)await page.locator('#pause-btn').tap();
      if((await snap()).speed!==speed)await page.locator('#speed-btn').tap();
      const before=await snap();assert.equal(before.paused,true);assert.equal(before.speed,speed);assert.ok(before.needs[need]>=95);
      await page.evaluate(({resident,label})=>{
        document.getElementById('pick-'+resident).click();
        const layer=document.getElementById('hotspots');layer.hidden=false;
        const button=[...layer.querySelectorAll('button')].find(b=>b.textContent.includes(label));
        if(!button)throw Error('missing hotspot '+label);
        button.click();
      },{resident,label});
      await page.locator('#action-button').waitFor({state:'visible'});
      assert.equal(await page.locator('#action-button').isEnabled(),true);
      await page.locator('#action-button').tap();
      await page.evaluate(({resident,id})=>{
        window.__pf04bTrace=[];
        let seen=false;
        const frame=()=>{
          const s=window.__LifeSimManualCareQA(resident);
          if(s.id===id){seen=true;window.__pf04bTrace.push(s);}
          else if(seen){window.__pf04bTrace.push(s);return;}
          requestAnimationFrame(frame);
        };frame();
      },{resident,id});
      await page.locator('#pause-btn').tap();
      await page.waitForFunction(()=>window.__pf04bTrace.length>1&&window.__pf04bTrace.at(-1).id===null,null,{timeout:90000});
      const trace=await page.evaluate(()=>window.__pf04bTrace);
      const using=trace.filter(x=>x.phase==='using');
      assert.ok(using.length>1,'real use phase observed');
      assert.ok(using.every(s=>s.duration===duration),'correct duration locked '+JSON.stringify(using[0]));
      assert.ok(Math.abs(trace.at(-1).minutes-using[0].minutes-duration)<=3.6,'duration '+JSON.stringify([using[0],trace.at(-1)]));
      if(id==='shower'){
        assert.ok(using.some(s=>s.shower?.water),'water phase rendered');
        assert.ok(using.every(s=>!s.shower?.water||s.shower.privacy));
        assert.ok(using.every(s=>!s.shower?.bathing||s.shower.privacy));
      }else{
        assert.ok(using.some(s=>s.toilet?.relief),'relief phase rendered');
        assert.ok(using.some(s=>s.toilet?.flush),'flush phase rendered');
        assert.ok(using.every(s=>!s.toilet?.relief||s.toilet.privacy));
      }
      assert.ok(trace.at(-1).needs[need]>=95&&trace.at(-1).needs[need]<=100);
      assert.deepEqual(errors,[]);
      console.log('PF-04/B PlayCanvas manual care',JSON.stringify({width,height,speed,resident,id,duration,actual:trace.at(-1).minutes-using[0].minutes}));
    }finally{await context.close();}
  }
}finally{await browser.close();}
