/** UX-05 real PlayCanvas + WebGL: resident card and compulsory decisions. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
import {newHousehold} from '../src/household.js';
import {startConversation,arriveSocial} from '../src/relationships.js';
import {observePairViews} from '../src/social-graph.js';
import {romanceAvailability} from '../src/romance.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
const base=newHousehold('2026-11-20');
base.paused=true;base.otherSim.paused=true;base.autonomy.enabled=false;
for(const id of ['alex','mira'])
 Object.assign(base.relationship.views[id],{friendship:82,trust:82,tension:0});
assert.ok(observePairViews(base.socialGraph,'alex','mira',base.relationship.views));
assert.equal(romanceAvailability(base.socialGraph,'alex','mira','romance.flirt',base.minutes).enabled,true);
const required=newHousehold('2026-11-20');
assert.equal(startConversation(required,'alex',{x:-.2,z:1.85},'daily'),true);
assert.equal(arriveSocial(required),true);
mkdirSync('ux05-artifacts',{recursive:true});
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
try{
 for(const [width,height] of [[390,844],[375,667],[320,568],[844,390]]){
  const context=await browser.newContext({viewport:{width,height},
   deviceScaleFactor:1,hasTouch:true,isMobile:true});
  await context.addInitScript(({key,root,tour})=>{
   if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(root));
   localStorage.setItem(tour,'done');
  },{key:SAVE_KEY,root:base,tour:UI_TOUR_STORAGE_KEY});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('requestfailed',req=>{if(req.url().includes('/src/'))errors.push(req.url());});
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
  assert.ok(await page.locator('#game-canvas').evaluate(c=>
   Boolean(c.getContext('webgl2')||c.getContext('webgl'))));
  await page.locator('#mind-toggle').click();
  await page.locator('#mind-view-mira').click();
  assert.match(await page.locator('#mind-view-note').textContent(),/Просмотр: Мира/);
  assert.equal(await page.locator('#pick-alex').getAttribute('aria-pressed'),'true');
  assert.ok(await page.locator('#wish-do-btn').isDisabled());
  assert.ok((await page.locator('#mind-primary-need').textContent()).length>3);
  await page.locator('.mind-disclosure summary').first().click();
  await page.locator('#mind-tab-skills').click();
  assert.ok(await page.locator('#mind-skills-list .skill-card').count()>0);
  await page.screenshot({path:'ux05-artifacts/card-'+width+'x'+height+'.png'});
  await page.locator('#mind-close').click();
  // Genuine mobile taps on a long romance menu. The first available action
  // must reveal its confirmation INSIDE the visible scroller, not after the
  // 14+ disabled status rows at the end of the menu.
  await page.evaluate(()=>document.getElementById('romance-btn').click());
  await page.locator('#social-menu-panel').waitFor({state:'visible'});
  const boundary=page.getByRole('button',{name:/Романтическое общение:/});
  await boundary.tap();
  assert.match(await boundary.textContent(),/пока не готов/);
  await boundary.tap();
  assert.match(await boundary.textContent(),/открыт/);
  const flirt=page.getByRole('button',{name:'Осторожно пофлиртовать',exact:true});
  await flirt.tap();
  const confirmation=page.locator('#social-menu-options [data-ux05-confirm]');
  await confirmation.waitFor({state:'visible'});
  const boxPosition=await confirmation.evaluate(box=>{
   const rect=box.getBoundingClientRect();
   const panel=box.closest('#social-menu-panel').getBoundingClientRect();
   return {adjacent:box.previousElementSibling?.textContent==='Осторожно пофлиртовать',
    top:rect.top,bottom:rect.bottom,panelTop:panel.top,panelBottom:panel.bottom};
  });
  assert.equal(boxPosition.adjacent,true,JSON.stringify(boxPosition));
  assert.ok(boxPosition.top>=boxPosition.panelTop-2&&
   boxPosition.bottom<=boxPosition.panelBottom+2,JSON.stringify(boxPosition));
  await confirmation.getByRole('button',{name:'В очередь · Осторожно пофлиртовать'}).tap();
  const queued=JSON.parse(await page.evaluate(k=>localStorage.getItem(k),SAVE_KEY));
  assert.ok(queued.actionQueues.byResident.alex.some(task=>
   task.type==='branch'&&task.actionId==='romance.flirt'));
  await page.screenshot({path:'ux05-artifacts/romance-'+width+'x'+height+'.png'});
  const original=JSON.parse(await page.evaluate(k=>localStorage.getItem(k),SAVE_KEY));
  assert.equal(original.selectedSim,'alex');
  assert.equal(original.actionQueues.byResident.mira.length,0);
  await context.close();
  const alt=await browser.newContext({viewport:{width,height},
   deviceScaleFactor:1,hasTouch:true,isMobile:true});
  await alt.addInitScript(({key,root,tour})=>{
   if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(root));
   localStorage.setItem(tour,'done');
  },{key:SAVE_KEY,root:required,tour:UI_TOUR_STORAGE_KEY});
  const p=await alt.newPage();
  p.on('pageerror',error=>errors.push(error.message));
  await p.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await p.locator('#loading').waitFor({state:'hidden',timeout:65000});
  await p.locator('#conversation-panel.dialogue-required').waitFor({state:'visible'});
  assert.equal(await p.locator('#conversation-close').isHidden(),true);
  const time=await p.locator('#time-label').textContent();
  await p.keyboard.press('Escape');
  assert.equal(await p.locator('#conversation-panel.dialogue-required').isVisible(),true);
  await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  assert.equal(await p.locator('#conversation-panel.dialogue-required').isVisible(),true);
  await p.screenshot({path:'ux05-artifacts/required-'+width+'x'+height+'.png'});
  await p.evaluate(()=>{
   const old=document.querySelector('#conversation-options button');
   old.click();old.click();
  });
  await p.waitForTimeout(250);
  assert.equal(await p.locator('#time-label').textContent(),time);
  const updated=JSON.parse(await p.evaluate(k=>localStorage.getItem(k),SAVE_KEY));
  assert.equal(updated.version,1);
  assert.equal(updated.socialAction.conversation.turns.length,1);
  await p.reload({waitUntil:'domcontentloaded'});
  await p.locator('#loading').waitFor({state:'hidden',timeout:65000});
  assert.equal(await p.locator('#conversation-panel.dialogue-required').isVisible(),true);
  assert.equal(errors.length,0,JSON.stringify(errors));
  await alt.close();
 }
}finally{await browser.close();}
