/** MICRO-UX-R1: actual mobile Chromium touch, real PlayCanvas/WebGL. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold,loadHousehold} from '../src/household.js';
import {newGame,SAVE_KEY} from '../src/simulation.js';
import {acceptCareerOffer} from '../src/career-job-board.js';
import {nextCareerShift} from '../src/career-scheduler.js';
import {progressCareerWork} from '../src/career-work.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
try{
 // PF-08: use real, valid settled shifts, then exercise the actual game's
 // returning -> home transition without ever selecting the away residents.
 for(const [width,height,count] of [[390,844,2],[320,568,3],[390,844,4]]){
   const base=newHousehold('2026-11-23');
   base.calendar.anchorConfirmed=true;
   base.autonomy.enabled=false;base.otherSim.autonomy.enabled=false;
   if(count>2){
     const residentsById={},linksByResident={
       alex:{familyId:'family_1',dwellingId:'dwelling_1'},
       mira:{familyId:'family_1',dwellingId:'dwelling_1'}};
     for(let i=3;i<=count;i++){
       const id='resident_'+i,actor=newGame();actor.position={x:i-2,z:1.2};
       residentsById[id]={id,identity:{firstName:'Тест'+i,lastName:'Житель',lifeStage:'adult'},actor};
       linksByResident[id]={familyId:'family_'+i,dwellingId:'dwelling_1'};
     }
     base.population={schema:1,nextResidentSerial:count+1,residentsById,linksByResident,kinship:[]};
   }
   const seed=loadHousehold(JSON.parse(JSON.stringify(base)));
   const workers=['mira',...Array.from({length:count-2},(_,i)=>'resident_'+(i+3))];
   let end;
   for(const id of workers){
     const offer=acceptCareerOffer(seed,id,'editorial');assert.equal(offer.ok,true,offer.reason);
     seed.careerSystem=offer.careerSystem;
     const contract=seed.careerSystem.byResident[id];
     const planned=nextCareerShift(seed.calendar,contract,seed.minutes);
     assert.ok(planned);end=planned.end;
     contract.currentShift={...planned,phase:'working',departedAt:planned.start,workMode:'normal'};
   }
   seed.minutes=end-1;seed.otherSim.minutes=end-1;seed.paused=false;
   progressCareerWork(seed,end-1,end);
   seed.minutes=end;seed.otherSim.minutes=end;
   for(const id of workers)assert.equal(seed.careerSystem.byResident[id].currentShift.phase,'returning');
   const balance=seed.shop.credits;
   const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,
     hasTouch:true,isMobile:true,serviceWorkers:'block'});
   await context.addInitScript(({key,root,tour,workers})=>{
     if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(root));
     localStorage.setItem(tour,'done');
     // Capture the initial picker projection even if WebGL startup finishes
     // the return before the loading overlay is dismissed.
     window.pf08Seen={};window.pf08Buttons={};
     new MutationObserver(()=>{
       for(const id of workers){
         const b=document.getElementById('pick-'+id);
         if(b?.dataset.away==='true'){
           window.pf08Seen[id]=true;window.pf08Buttons[id]??=b;
         }
       }
     }).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-away']});
   },{key:SAVE_KEY,root:seed,tour:UI_TOUR_STORAGE_KEY,workers});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:8765/?pf08',{waitUntil:'domcontentloaded'});
   await page.locator('#loading').waitFor({state:'hidden',timeout:80000});
   assert.ok((await page.locator('#game-canvas').screenshot()).length>2000);
   await page.waitForFunction(({key,workers})=>{
     const saved=JSON.parse(localStorage.getItem(key));
     return workers.every(id=>saved.careerSystem.byResident[id]?.currentShift===null);
   },{key:SAVE_KEY,workers},{timeout:30000});
   for(const id of workers){
     assert.equal(await page.evaluate(id=>window.pf08Seen[id],id),true,'initial away state '+id);
     await page.waitForFunction(id=>{
       const b=document.getElementById('pick-'+id);
       return b?.dataset.away==='false'&&!b.getAttribute('aria-label').includes('на работе');
     },id,{timeout:5000});
     assert.equal(await page.evaluate(id=>window.pf08Buttons[id]===document.getElementById('pick-'+id),id),true,
       'status refresh must preserve original button '+id);
   }
   assert.equal(await page.locator('#pick-alex').getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('#dashboard .resident-switch button').count(),count);
   const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
   assert.equal(saved.version,1);assert.equal(saved.shop.credits,balance,'return must not pay twice');
   assert.deepEqual(errors,[]);
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('#loading').waitFor({state:'hidden',timeout:80000});
   for(const id of workers)assert.equal(await page.locator('#pick-'+id).getAttribute('data-away'),'false');
   await context.close();
   console.log('PF-08 actual returning -> home, '+count+' residents '+width+'x'+height+' PASS');
 }
 for(const [width,height] of [[390,844],[320,568]]){
  const seed=newHousehold('2026-11-22');
  seed.paused=true;seed.otherSim.paused=true;
  seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
  const context=await browser.newContext({viewport:{width,height},
    deviceScaleFactor:1,hasTouch:true,isMobile:true});
  await context.addInitScript(({key,root,tour})=>{
    localStorage.setItem(key,JSON.stringify(root));
    localStorage.setItem(tour,'done');
  },{key:SAVE_KEY,root:seed,tour:UI_TOUR_STORAGE_KEY});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('requestfailed',request=>{
    if(request.url().includes('/src/'))errors.push('missing '+request.url());
  });
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
  assert.ok((await page.locator('#game-canvas').screenshot()).length>2000);
  const cameraPosition=()=>page.evaluate(async()=>{
    const pc=await import('playcanvas');
    const p=pc.Application.getApplication().root.findByName('Camera').getPosition();
    return [p.x,p.y,p.z];
  });
  const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
  const initial=await cameraPosition();
  await page.locator('#pick-mira').tap();
  assert.equal(await page.locator('#pick-mira').getAttribute('aria-pressed'),'true');
  await page.waitForTimeout(500);
  assert.ok(distance(initial,await cameraPosition())<.001,'single tap must not move camera');
  const box=await page.locator('#pick-mira').boundingBox();
  assert.ok(box);
  const tapMira=()=>page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
  await tapMira();await tapMira();
  await page.waitForFunction(async(initial)=>{
    const pc=await import('playcanvas');
    const p=pc.Application.getApplication().root.findByName('Camera').getPosition();
    return Math.hypot(p.x-initial[0],p.y-initial[1],p.z-initial[2])>.05;
  },initial,{timeout:5000});
  // The two always-visible resident-name buttons are the mobile tap targets.
  // In compact HUD layouts the nested descriptive label can have no tap box.
  assert.match(await page.locator('#pick-mira').textContent(),/Мира/);
  const displayName=page.locator('#resident-name');
  if(await displayName.isVisible())await displayName.tap();
  assert.equal(await page.locator('#mind-panel').isHidden(),true,
    'resident picker or visible name tap never opens the mind panel');
  await page.evaluate(()=>{
    const tv=[...document.querySelectorAll('#hotspots .hotspot')]
      .find(el=>el.textContent.includes('Телевизор'));
    if(!tv)throw Error('TV hotspot missing');
    tv.click();
  });
  assert.equal(await page.locator('#tv-talk-button').isVisible(),true);
  assert.equal(await page.locator('#mirror-speech-button').isHidden(),true);
  await page.locator('#tv-talk-button').tap();
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
  assert.equal(saved.version,1);
  assert.ok(saved.actionQueues.byResident.mira.some(task=>
    task.actionId==='tv'&&task.tvTalk===true&&task.targetInstanceId==='home-tv-1'));
  assert.equal(saved.actionQueues.byResident.alex.length,0,
    'solo TV must not queue another resident');
  await page.evaluate(()=>{
    const tv=[...document.querySelectorAll('#hotspots .hotspot')]
      .find(el=>el.textContent.includes('Телевизор'));
    tv.click();
  });
  assert.equal(await page.locator('#action-sheet').isVisible(),true);
  const oldTitle=await page.locator('#action-title').textContent();
  await page.touchscreen.tap(12,Math.round(height*.35));
  const previousContextClosed=await page.locator('#action-sheet').isHidden()||
    (await page.locator('#action-title').textContent())!==oldTitle;
  assert.equal(previousContextClosed,true,
    'outside tap must close old context or switch to a different scene object');
  assert.deepEqual(errors,[],'no WebGL startup or JavaScript errors');
  await context.close();
 }
 console.log('MICRO-UX-R1 390x844 and 320x568 PlayCanvas mobile touch smoke PASS');
}finally{await browser.close();}
