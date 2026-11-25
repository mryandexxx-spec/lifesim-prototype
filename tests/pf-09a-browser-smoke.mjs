/** Real PlayCanvas mobile-sized browser test; not physical iPhone Safari. */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {hireCareer} from '../src/career-state.js';
import {plannedCareerShift} from '../src/career-scheduler.js';
import {planWorkIncident} from '../src/career-incidents.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
function fixture(status){
  const root=newHousehold('2026-11-16');
  root.calendar.anchorConfirmed=true;
  root.autonomy.enabled=false;root.otherSim.autonomy.enabled=false;
  root.careerSystem=hireCareer(root.careerSystem,'alex','editorial',480);
  const c=root.careerSystem.byResident.alex;
  for(let day=0;day<60;day++){
    const shift=plannedCareerShift(root.calendar,c,day);
    if(!shift)continue;
    const active={...shift,phase:'working',departedAt:shift.start,readiness:75};
    const plan=planWorkIncident(c,'alex',active);
    if(plan.status!==status)continue;
    c.currentShift=active;
    root.minutes=status==='due'?plan.dueAt-3:active.end-10;
    root.otherSim.minutes=root.minutes;
    // No injected incident or forced outcome. The live game generates its own plan.
    return {root,plan,shift:active};
  }
  throw Error('No deterministic fixture for '+status);
}
mkdirSync('artifacts/career-shifts-r1',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
try{
  for(const [width,height] of [[390,844],[320,568]])for(const status of ['due','none']){
    const {root,shift}=fixture(status);
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:true,hasTouch:true,serviceWorkers:'block'});
    await context.addInitScript(({key,record,tour})=>{
      if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
      localStorage.setItem(tour,'done');
    },{key:SAVE_KEY,record:root,tour:UI_TOUR_STORAGE_KEY});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('crash',()=>errors.push('renderer crash'));
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:80000});
    assert.ok(await page.evaluate(async()=>{
      const {Application}=await import('playcanvas');
      return Boolean(Application.getApplication()?.graphicsDevice?.canvas);
    }));
    if(status==='due'){
      await page.waitForFunction(key=>{
        const s=JSON.parse(localStorage.getItem(key)||'{}');
        return s.careerSystem?.byResident?.alex?.currentShift?.incident?.choiceId===null;
      },SAVE_KEY,{timeout:30000});
      const phone=page.locator('#career-phone-panel');
      await page.locator('#career-phone-toggle').tap();
      await phone.locator('[data-phone-app="work"]').tap();
      await phone.locator('.career-work-option').first().waitFor({state:'visible',timeout:12000});
      assert.equal(await phone.locator('.career-work-option').count(),3);
      await page.screenshot({path:'artifacts/career-shifts-r1/pf09a-choice-'+width+'.png'});
      await phone.locator('.career-work-option').first().tap();
      const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
      assert.equal(saved.careerSystem.incidentIds.filter(id=>id===shift.id+'#work').length,1);
      assert.ok(saved.careerSystem.byResident.alex.currentShift.incident.choiceId);
      assert.ok(saved.notificationHistory.entries.some(e=>e.incidentId===shift.id+'#work'));
      await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('#loading').waitFor({state:'hidden',timeout:80000});
      const loaded=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
      assert.equal(loaded.careerSystem.incidentIds.filter(id=>id===shift.id+'#work').length,1);
    }else{
      await page.waitForFunction(({key,id})=>{
        const s=JSON.parse(localStorage.getItem(key)||'{}');
        return s.careerSystem?.settlementIds?.includes(id);
      },{key:SAVE_KEY,id:shift.id},{timeout:35000});
      const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
      assert.equal(saved.careerSystem.settlementIds.filter(id=>id===shift.id).length,1);
      assert.equal(saved.careerSystem.byResident.alex.lastShift.incident,null);
      assert.ok(saved.careerSystem.byResident.alex.lastShift.salary>0);
      assert.equal(saved.careerSystem.incidentIds.length,0);
      assert.ok(!saved.notificationHistory.entries.some(e=>e.incidentId===shift.id+'#work'));
      await page.screenshot({path:'artifacts/career-shifts-r1/pf09a-no-event-'+width+'.png'});
    }
    assert.deepEqual(errors,[],status+' '+width);
    await context.close();
  }
  console.log('PF-09/A live mobile WebGL scheduled choice, v1 reload, notification and no-event salary PASS');
}finally{await browser.close();}
