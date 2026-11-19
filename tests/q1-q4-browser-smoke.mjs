/** Q1+Q4: real PlayCanvas/WebGL mobile viewports and work-incident deep-link. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {hireCareer} from '../src/career-state.js';
import {progressCareerWork,arriveCareerPortal} from '../src/career-work.js';
import {startWorkIncident} from '../src/career-incidents.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const seed=newHousehold('2026-11-16');
seed.careerSystem=hireCareer(seed.careerSystem,'alex','editorial',480);
seed.careerSystem=hireCareer(seed.careerSystem,'mira','business-center',480);
seed.minutes=540;seed.otherSim.minutes=540;
progressCareerWork(seed,539,540);
assert.equal(arriveCareerPortal(seed,'alex',540),true);
assert.equal(arriveCareerPortal(seed,'mira',540),true);
seed.minutes=781;seed.otherSim.minutes=781;
assert.equal(startWorkIncident(seed,'alex',781),true);
assert.equal(startWorkIncident(seed,'mira',781),true);
seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
seed.paused=true;seed.otherSim.paused=true;

const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const errors=[];
try{
  for(const [w,h] of [[390,844],[375,667],[320,568],[844,390]]){
    const context=await browser.newContext({viewport:{width:w,height:h},
      deviceScaleFactor:1,hasTouch:true,isMobile:true});
    await context.addInitScript(({key,record,tourKey})=>{
      if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
      localStorage.setItem(tourKey,'done');
    },{key:SAVE_KEY,record:seed,tourKey:UI_TOUR_STORAGE_KEY});
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push(w+'x'+h+': '+e.message));
    page.on('crash',()=>errors.push(w+'x'+h+': crash'));
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
    const boot=()=>page.locator('#loading').waitFor({state:'hidden',timeout:65000});
    await boot();
    const badge=page.locator('#career-incident-badge');
    assert.equal(await badge.innerText(),'2','Both residents need independent decisions');
    assert.ok(await badge.isVisible(),'Phone alert persists with phone closed');
    if(await page.locator('#pause-btn').getAttribute('aria-label')==='Пауза')
      await page.locator('#pause-btn').click();

    const canvas=page.locator('#game-canvas');
    const before=await canvas.screenshot();
    await page.evaluate(({w,h})=>{
      const node=document.getElementById('game-canvas');
      const left=node.getBoundingClientRect().left,top=node.getBoundingClientRect().top;
      const pointer=(target,type,id,x,y)=>target.dispatchEvent(new PointerEvent(type,{
        pointerId:id,pointerType:'touch',isPrimary:id===1,bubbles:true,cancelable:true,
        clientX:left+x,clientY:top+y,button:0,buttons:type==='pointerup'?0:1
      }));
      const cy=Math.round(h*.48);
      pointer(node,'pointerdown',1,w*.35,cy);
      pointer(node,'pointerdown',2,w*.65,cy);
      pointer(window,'pointermove',1,w*.23,cy);
      pointer(window,'pointermove',2,w*.77,cy);
      pointer(window,'pointerup',2,w*.77,cy);
      pointer(window,'pointerup',1,w*.23,cy);
    },{w,h});
    await page.waitForTimeout(350);
    const after=await canvas.screenshot();
    assert.ok(!before.equals(after),'Two-finger camera pinch must visually affect WebGL view');
    assert.equal(await badge.innerText(),'2','Camera gestures cannot choose work incidents');

    // A finance screen must not hide the pending incident: direct action opens
    // the precise work card for Alex instead of restoring a stale finance tab.
    await page.locator('#family-balance-chip').tap();
    const phone=page.locator('#career-phone-panel');
    await phone.waitFor({state:'visible'});
    assert.ok(await phone.locator('.career-phone-incident-banner').isVisible());
    await phone.locator('.career-phone-incident-banner .career-incident-open').tap();
    assert.equal(await page.evaluate(()=>document.activeElement?.id),
      'career-pending-incident-title','Direct link focuses the pending card');
    assert.equal(await phone.locator('.career-work-option').count(),3);
    await phone.locator('.career-incident-later').tap();
    assert.equal(await phone.isVisible(),false);
    assert.equal(await badge.innerText(),'2','Later is not a silent choice');
    await page.reload({waitUntil:'domcontentloaded'});await boot();
    assert.equal(await badge.innerText(),'2','Pending indicator survives reload');

    // When Alex is selected, the top priority card points to Alex first;
    // after Alex answers, it routes to Mira automatically, not to Alex again.
    await page.locator('#career-phone-toggle').tap();
    await phone.locator('.career-work-option').nth(1).tap();
    assert.equal(await badge.innerText(),'1');
    let saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(saved.careerSystem.byResident.alex.currentShift.incident.choiceId,'rewrite');
    assert.equal(saved.careerSystem.byResident.mira.currentShift.incident.choiceId,null);
    assert.equal(saved.careerSystem.incidentIds.length,1);
    await phone.locator('.career-phone-x').tap();
    await page.locator('#career-phone-toggle').tap();
    await phone.locator('.career-phone-incident-banner .career-incident-open').tap();
    assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).selectedSim,SAVE_KEY),
      'mira','Deep link switches to the resident with an unresolved incident');
    assert.equal(await page.evaluate(()=>document.activeElement?.id),
      'career-pending-incident-title');
    await phone.locator('.career-work-option').first().tap();
    assert.equal(await badge.isVisible(),false,'Resolved incidents clear the badge');
    saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(saved.careerSystem.incidentIds.length,2);
    assert.equal(saved.shop.credits,seed.shop.credits);
    await phone.locator('.career-phone-x').tap();
    await page.screenshot({path:`q1-q4-work-${w}x${h}.png`});
    await context.close();
  }
  assert.deepEqual(errors,[],'Real mobile WebGL boots without page errors');
  console.log('Q1+Q4 real WebGL pinch, priority incident badge, finance -> resident direct link, reload and once-only decisions PASS');
}finally{
  await browser.close();
}
