/** UX-09: cross-screen mobile regression and measurable UX-00 comparison.
 * Chromium SwiftShader/WebGL touch emulation is NOT owner Safari/VoiceOver QA.
 * Each viewport starts from exactly the same paused household and camera.
 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {newHousehold} from '../src/household.js';
import {enqueueAction} from '../src/action-queue.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const sizes=[[390,844],[375,667],[320,568],[844,390]];
const baseline={sha:'a0162d62d7dbdb8b5ba1fb5d45371c3c36dd169a',
 source:'PRIVATE/UX-00-MEASUREMENTS-2026-11-20.md',
 screens:{
  '390x844':{catalogBuyTop:4684,phoneCloseWidth:40,planHeight:44},
  '375x667':{catalogBuyTop:4726,phoneCloseWidth:40,planHeight:44},
  '320x568':{catalogBuyTop:4968,phoneCloseWidth:40,planHeight:44},
  '844x390':{catalogBuyTop:3089,phoneCloseWidth:40,planHeight:44}
 }};
const seed=newHousehold('2026-11-20');
seed.paused=true;seed.otherSim.paused=true;
seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
// Bootstrap can dispatch one queued action immediately even in a paused world.
// Keep future tasks for BOTH residents while the active task is initialized.
for(const actionId of ['bed','fridge','shower'])
 assert.ok(enqueueAction(seed.actionQueues,'alex',{type:'object',actionId}));
for(const actionId of ['sofa','bed'])
 assert.ok(enqueueAction(seed.actionQueues,'mira',{type:'object',actionId}));
mkdirSync('ux09-artifacts',{recursive:true});
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const report=[],issues=[];
const snapshot=async page=>page.evaluate(()=>{
 const ids=['#plan-peek','#pick-alex','#pick-mira','#pause-btn',
  '#speed-btn','#calendar-anchor-toggle','#home-open',
  '#career-phone-toggle','#view-toggle','#family-balance-chip'];
 const controls={};
 for(const id of ids){
  const e=document.querySelector(id),r=e?.getBoundingClientRect();
  const style=e&&getComputedStyle(e);
  controls[id]={visible:!!r&&r.width>0&&r.height>0&&style.display!=='none',
   x:r?Math.round(r.x):0,y:r?Math.round(r.y):0,
   width:r?Math.round(r.width):0,height:r?Math.round(r.height):0,
   accessible:!!e&&Boolean((e.getAttribute('aria-label')||e.textContent||'').trim())};
 }
 return {controls,docWidth:document.documentElement.scrollWidth,
  viewportWidth:innerWidth,viewportHeight:innerHeight,
  activeElement:document.activeElement?.id||''};
});
const state=async page=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY);
try{
 for(const [width,height] of sizes){
  const label=width+'x'+height,errors=[],steps=[];
  const context=await browser.newContext({viewport:{width,height},
   deviceScaleFactor:1,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  await context.addInitScript(({key,record,tour})=>{
   if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
   localStorage.setItem(tour,'done');
  },{key:SAVE_KEY,record:seed,tour:UI_TOUR_STORAGE_KEY});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push('pageerror '+e.message));
  page.on('requestfailed',r=>{
   if(/\/src\/|\/vendor\//.test(r.url()))errors.push('request '+r.url());
  });
  try{
   await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
   await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
   assert.ok((await page.locator('#game-canvas').screenshot()).length>2000,
    label+' must render genuine WebGL');
   const life=await snapshot(page);
   assert.ok(life.docWidth<=width+2,label+' life horizontal overflow');
   for(const [id,rect] of Object.entries(life.controls)){
    assert.ok(rect.visible&&rect.accessible,label+' reachable named control '+id);
    assert.ok(rect.width>=43&&rect.height>=43,label+' touch target '+id);
   }
   await page.screenshot({path:'ux09-artifacts/life-'+label+'.png',animations:'disabled'});
   steps.push('life');

   await page.locator('#pick-mira').tap();
   assert.equal(await page.locator('#pick-mira').getAttribute('aria-pressed'),'true');
   await page.locator('#pick-alex').tap();
   await page.locator('#plan-peek').tap();
   assert.ok(await page.locator('#queue-panel').isVisible());
   assert.match(await page.locator('#queue-title').innerText(),/Алекс/);
   // A bootstrapped active action is not shown among FUTURE tasks.
   const restored=await state(page);
   const alexFuture=restored.actionQueues.byResident.alex.length;
   const miraFuture=restored.actionQueues.byResident.mira.length;
   assert.ok(alexFuture>=2&&miraFuture>=1,
    label+' must preserve future FIFO for both residents after bootstrap');
   assert.equal(await page.locator('#queue-items li').count(),alexFuture);
   await page.locator('#queue-mira').tap();
   assert.equal(await page.locator('#queue-items li').count(),miraFuture);
   assert.equal(await page.locator('#pick-alex').getAttribute('aria-pressed'),'true',
    'inspection of Mira queue cannot select another resident');
   await page.locator('#queue-close').tap();
   steps.push('resident-plan');

   await page.locator('#home-open').tap();
   await page.locator('#home-furnish').tap();
   await page.locator('#furnish-shop-toggle').tap();
   const editor=page.locator('#furniture-editor');
   const catalog=await page.evaluate(()=>{
    const outer=document.querySelector('#furniture-editor').getBoundingClientRect();
    const btn=document.querySelector('#furnish-buy').getBoundingClientRect();
    return {buyTop:Math.round(btn.top),buyHeight:Math.round(btn.height),
     editorTop:Math.round(outer.top),editorBottom:Math.round(outer.bottom),
     visible:btn.top>=outer.top-1&&btn.bottom<=outer.bottom+1};
   });
   assert.ok(catalog.visible&&catalog.buyHeight>=44,
    label+' catalog purchase CTA must be visible, unlike UX-00');
   await page.screenshot({path:'ux09-artifacts/catalog-'+label+'.png',
    animations:'disabled'});
   const chair=page.locator('#furnish-stock button[data-item-id="chair.loft"]');
   await chair.tap();
   assert.equal(await editor.getAttribute('data-shop-placing'),'true');
   await page.locator('#furnish-place-cancel').tap();
   assert.equal(await editor.getAttribute('data-shop-placing'),'false');
   assert.equal((await state(page)).shop.credits,5000,'cancel is free');
   await page.locator('#furnish-exit').tap();
   steps.push('catalog-preview-cancel');

   await page.locator('#career-phone-toggle').tap();
   const phone=page.locator('#career-phone-panel');
   assert.ok(await phone.isVisible());
   assert.equal(await phone.locator('#career-phone-title').innerText(),'Работа · Алекс');
   const phoneClose=await phone.locator('.career-phone-header .career-phone-x').boundingBox();
   assert.ok(phoneClose&&phoneClose.width>=44&&phoneClose.height>=44,
    label+' phone close target improved over UX-00');
   await phone.locator('.career-phone-app-tab[data-app="finance"]').tap();
   assert.equal(await phone.locator('#career-phone-title').innerText(),'Финансы · Семья');
   await phone.locator('.career-phone-header .career-phone-x').tap();
   steps.push('career-finance');

   await page.locator('#calendar-anchor-toggle').tap();
   const calendar=page.locator('#life-calendar');
   assert.equal(await calendar.locator('#lc-title').innerText(),'Сегодня');
   await calendar.getByRole('button',{name:'Неделя',exact:true}).tap();
   await calendar.getByRole('button',{name:'День',exact:true}).tap();
   await calendar.locator('#lc-add').tap();
   const done=await calendar.locator('#lc-event-done').boundingBox();
   assert.ok(done&&done.width>=44&&done.height>=44,
    label+' calendar keyboard-safe Done');
   await calendar.locator('#lc-event-back-top').tap();
   await calendar.locator('#lc-close').tap();
   steps.push('calendar-cancel');

   await page.locator('#view-toggle').tap();
   await page.locator('#save-btn').tap();
   await page.locator('#view-panel').waitFor({state:'hidden'});
   const before=await state(page);
   assert.equal(before.version,1);
   assert.equal(before.shop.credits,5000);
   assert.ok(before.otherSim);
   assert.ok(before.actionQueues.byResident.alex.length>=1);
   assert.ok(before.actionQueues.byResident.mira.length>=1);
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
   const after=await state(page);
   assert.equal(after.version,1);
   assert.equal(after.shop.credits,before.shop.credits);
   assert.deepEqual(after.actionQueues,before.actionQueues);
   assert.equal(after.selectedSim,before.selectedSim);
   assert.deepEqual(after.world.furniture,before.world.furniture);
   steps.push('save-reload');

   const afterReload=await snapshot(page);
   assert.ok(afterReload.docWidth<=width+2,label+' reload overflow');
   // A reproducible increased-text observation; not a substitute for iOS Dynamic Type.
   await page.addStyleTag({content:'html{font-size:125%!important}'});
   const textZoom=await snapshot(page);
   await page.screenshot({path:'ux09-artifacts/text-125-'+label+'.png',
    animations:'disabled'});
   if(textZoom.docWidth>width+2)
    issues.push({viewport:label,screen:'life',scenario:'125% root text',
     problem:'horizontal overflow',actual:textZoom.docWidth,
     owner:'UX-09',stage:'triage'});
   await page.setViewportSize({width:height,height:width});
   await page.screenshot({path:'ux09-artifacts/rotated-'+label+'.png',
    animations:'disabled'});
   steps.push('text-zoom-rotate');
   assert.deepEqual(errors,[],label+' browser errors');
   report.push({viewport:label,steps,baseline:baseline.screens[label],
    life,catalog,phoneCloseWidth:Math.round(phoneClose.width),
    afterReload,textZoom,errors});
  }catch(e){
   issues.push({viewport:label,screen:steps.at(-1)||'startup',
    scenario:'cross-surface journey',problem:e.stack||String(e),
    owner:'UX-09',stage:'investigate'});
  }finally{await context.close();}
 }
}finally{await browser.close();}
writeFileSync('ux09-artifacts/report.json',JSON.stringify({
 created:'2026-11-21',engine:'PlayCanvas 2.24.1 / Chromium SwiftShader',
 deviceAcceptance:'NOT DONE: real Safari, VoiceOver, actual keyboard and background',
 baseline,report,issues},null,2)+'\n');
console.log('UX-09 report: '+report.length+' complete viewports, '+issues.length+' findings');
assert.deepEqual(issues,[],'UX-09 cross-surface regression findings (see report.json)');
assert.equal(report.length,4,'all four viewports completed');
