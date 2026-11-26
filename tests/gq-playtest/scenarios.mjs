import assert from 'node:assert/strict';
import {findMarketPlacement,buyMarketItem} from '../../src/furniture-shop.js';
import {PAINT_ACTIVITY_ID} from '../../src/painting.js';
import {newHousehold} from '../../src/household.js';
import {enqueueAction} from '../../src/action-queue.js';
import {acceptCareerOffer} from '../../src/career-job-board.js';
import {nextCareerShift} from '../../src/career-scheduler.js';
import {progressCareerWork} from '../../src/career-work.js';

const fixed=()=>{const s=newHousehold('2026-11-26');s.calendar.anchorConfirmed=true;s.paused=true;s.otherSim.paused=true;s.autonomy.enabled=false;s.otherSim.autonomy.enabled=false;return s;};
const queueSeed=()=>{const s=fixed();for(const actionId of ['bed','fridge','shower'])enqueueAction(s.actionQueues,'alex',{type:'object',actionId});for(const actionId of ['sofa','bed'])enqueueAction(s.actionQueues,'mira',{type:'object',actionId});return s;};
const returnSeed=()=>{const s=fixed();const offer=acceptCareerOffer(s,'mira','editorial');assert.ok(offer.ok,offer.reason);s.careerSystem=offer.careerSystem;const c=s.careerSystem.byResident.mira,p=nextCareerShift(s.calendar,c,s.minutes);assert.ok(p);c.currentShift={...p,phase:'working',departedAt:p.start,workMode:'normal'};s.minutes=p.end-1;s.otherSim.minutes=p.end-1;s.paused=false;s.otherSim.paused=false;progressCareerWork(s,p.end-1,p.end);s.minutes=p.end;s.otherSim.minutes=p.end;assert.equal(c.currentShift.phase,'returning');return s;};

export const scenarios=[
 {id:'fresh',goal:'First visit, learn and reach normal play without seeded storage',seed:null,
 async run(h){
   const {page,step,tap}=h;
   await step('onboarding',async()=>{await page.locator('#tour-panel').waitFor({state:'visible',timeout:15000});assert.match(await page.locator('#tour-body').innerText(),/камер/i);});
   await step('next-tour',async()=>{await tap('#tour-next');assert.match(await page.locator('#tour-body').innerText(),/земли/);});
   await step('skip-tour',async()=>{await tap('#tour-skip');await page.locator('#tour-panel').waitFor({state:'hidden'});});
   await step('open-phone',async()=>{await tap('#career-phone-toggle');await page.locator('#career-phone-panel').waitFor({state:'visible'});});
   await step('close-phone',async()=>{await tap('.career-phone-x');await page.locator('#career-phone-panel').waitFor({state:'hidden'});});
 }},
 {id:'queue',goal:'Inspect and cancel another resident’s queued task; switch, save and reload',seed:queueSeed,
 async run(h){
   const {page,step,tap,snapshot}=h;let before,after;
   await step('baseline-save',async()=>{await tap('#view-toggle');await tap('#save-btn');await page.locator('#view-panel').waitFor({state:'hidden'});before=await snapshot();assert.ok(before.actionQueues.byResident.alex.length>=2);assert.ok(before.actionQueues.byResident.mira.length>=1);});
   await step('inspect-other-plan',async()=>{await tap('#plan-peek');await tap('#queue-mira');assert.equal(await page.locator('#pick-alex').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#queue-items li').count(),before.actionQueues.byResident.mira.length);});
   await step('cancel-other-task',async()=>{await tap('#queue-items li button');after=await snapshot();assert.deepEqual(after.actionQueues.byResident.alex,before.actionQueues.byResident.alex);assert.equal(after.actionQueues.byResident.mira.length,before.actionQueues.byResident.mira.length-1);assert.equal(after.selectedSim,'alex');});
   await step('switch-resident',async()=>{await tap('#queue-close');await tap('#pick-mira');assert.equal(await page.locator('#pick-mira').getAttribute('aria-pressed'),'true');});
   await step('phone-home',async()=>{await tap('#career-phone-toggle');const phone=page.locator('#career-phone-panel');await phone.waitFor({state:'visible'});assert.equal(await phone.getAttribute('aria-label'),'Смартфон: главный экран');});
   await step('finance',async()=>{await tap('#career-phone-panel [data-phone-app="finance"]');assert.equal(await page.locator('#career-phone-panel').getAttribute('aria-label'),'Смартфон: финансы семьи');assert.match(await page.locator('.finance-wallet').innerText(),/БАЛАНС СЕМЬИ/);assert.equal((await snapshot()).shop.credits,before.shop.credits);});
   await step('save',async()=>{await tap('.career-phone-x');await tap('#view-toggle');await tap('#save-btn');await page.locator('#view-panel').waitFor({state:'hidden'});});
   await step('reload',async()=>{await h.reload();const saved=await snapshot();assert.equal(saved.version,1);assert.equal(saved.selectedSim,'mira');assert.equal(saved.shop.credits,before.shop.credits);assert.deepEqual(saved.actionQueues,after.actionQueues);});
 }},
 {id:'return',goal:'Observe real work return without switching resident and without double salary',seed:returnSeed,
 async run(h){
   const {page,step,tap,snapshot,seed}=h;
   await step('return-complete',async()=>{await page.waitForFunction(k=>JSON.parse(localStorage.getItem(k))?.careerSystem?.byResident?.mira?.currentShift===null,h.key,{timeout:45000});await page.waitForFunction(()=>document.getElementById('pick-mira')?.dataset.away==='false');assert.equal(await page.locator('#pick-alex').getAttribute('aria-pressed'),'true');assert.equal((await snapshot()).shop.credits,seed.shop.credits);});
   await step('select-returned',async()=>{await tap('#pick-mira');assert.equal(await page.locator('#pick-mira').getAttribute('aria-pressed'),'true');});
   await step('reload-return',async()=>{await h.reload();assert.equal(await page.locator('#pick-mira').getAttribute('data-away'),'false');assert.equal((await snapshot()).shop.credits,seed.shop.credits);});
 }}
];

// Baseline audit: only actual UI inputs after isolated fixture setup.
const auditSeed=()=>{const s=fixed();return s;};
const creativeSeed=()=>{const s=auditSeed();const pose=findMarketPlacement(s.world.furniture,s.shop,'easel.starter');assert.ok(pose);const tx=buyMarketItem(s.world.furniture,s.shop,'easel.starter',pose);assert.ok(tx.ok,tx.reason);s.world.furniture=tx.world;s.shop=tx.shop;return s;};
async function pause(h){if(await h.page.locator('#pause-btn').getAttribute('aria-label')!=='Продолжить')await h.tap('#pause-btn');assert.equal(await h.page.locator('#pause-btn').getAttribute('aria-label'),'Продолжить');}
async function cameraPose(page){return page.evaluate(async()=>{const {Application}=await import('playcanvas');const c=Application.getApplication().root.findByName('Camera');const v=c.getPosition();return [v.x,v.y,v.z];});}
const distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
scenarios.push(
 {id:'camera-focus',goal:'Single portrait tap switches; fast double tap focuses the actual camera',seed:auditSeed,async run(h){
  const {page,step,tap,snapshot}=h;let before;
  await step('pause-and-reset',async()=>{await pause(h);await tap('#view-toggle');await tap('#menu-reset-camera-btn');await tap('#view-close');await page.locator('#view-panel').waitFor({state:'hidden'});await page.waitForTimeout(500);before=await cameraPose(page);});
  await step('single-select',async()=>{await tap('#pick-mira');await page.waitForTimeout(1500);assert.equal((await snapshot()).selectedSim,'mira');assert.ok(distance(await cameraPose(page),before)<.1,'single tap moved camera');});
  await step('double-focus',async()=>{
   const start=await cameraPose(page);await h.doubleTap('#pick-mira');
   const events=await h.inputTrace();
   const clicks=events.filter(e=>e.type==='click'&&e.id==='pick-mira');
   const pair=clicks.slice(-2);const gap=pair.length===2?pair[1].t-pair[0].t:null;
   const samples=[];for(let i=0;i<12;i++){await page.waitForTimeout(500);const pose=await cameraPose(page);samples.push({elapsedMs:(i+1)*500,pose,distance:distance(pose,start)});if(samples.at(-1).distance>.1)break;}
   h.observe({gapMs:gap,clicks:pair,samples});
   assert.equal(pair.length,2,'two actual portrait click events required');
   assert.ok(gap<=350,'double tap exceeded 350ms recognition window: '+gap);
   assert.ok(samples.some(x=>x.distance>.1),'valid double tap did not move actual camera');
   assert.equal((await snapshot()).selectedSim,'mira');
  });
 }},
 {id:'social-scene',goal:'Find the other resident on the 3D lot and enqueue talk with explicit confirmation in both directions',seed:auditSeed,async run(h){
  const {page,step,tap,snapshot}=h;
  await step('pause',()=>pause(h));
  for(const [actor,partner,name] of [['alex','mira','Мира'],['mira','alex','Алекс']]){
   await step(actor+'-find-partner',async()=>{
    await tap('#pick-'+actor);await page.waitForTimeout(500);const baseline=await snapshot();
    const probes=[];
    for(const y of [1.45,1.85,1.0]){
     const pt=await page.evaluate(async({name,y})=>{const {Application,Vec3}=await import('playcanvas');const app=Application.getApplication();const avatar=app.root.findByName(name);const camera=app.root.findComponents('camera').find(c=>c.enabled);if(!avatar||!camera)throw Error('resident or camera missing');const p=camera.worldToScreen(avatar.getPosition().clone().add(new Vec3(0,y,0)));return {x:Math.round(p.x),y:Math.round(p.y),w:innerWidth,h:innerHeight};},{name,y});
     if(pt.x<0||pt.x>=pt.w||pt.y<0||pt.y>=pt.h)continue;
     const hit=await page.evaluate(({x,y})=>{const e=document.elementFromPoint(x,y);return {id:e?.id,tag:e?.tagName,cls:typeof e?.className==='string'?e.className:''};},pt);
     probes.push({...pt,hit});h.observe({actor,partner,point:pt,hit});
     // Never tap through a menu or an overlay to probe another world point.
     if(hit.id!=='game-canvas')continue;
     const prior=await snapshot();
     await h.tapPoint(pt.x,pt.y);
     h.observe({worldInput:await h.inputTrace()});
     // Canvas tap may be deferred until gesture recognition finishes.
     await page.locator('#social-context').waitFor({state:'visible',timeout:1500}).catch(()=>{});
     assert.deepEqual((await snapshot()).actionQueues,prior.actionQueues,'scene selection alone must not enqueue');
     if(await page.locator('#social-context').isVisible())break;
     assert.equal(await page.locator('#social-menu-panel').isVisible(),false,'unexpected social menu after scene-only tap');
     if(await page.locator('#ground-walk-menu').isVisible())await tap('#ground-walk-close');
     if(await page.locator('#action-button').isVisible())await tap('#close-action');
    }
    assert.deepEqual((await snapshot()).actionQueues,baseline.actionQueues,'finding a resident must not enqueue');assert.ok(await page.locator('#social-context').isVisible(),'resident not discoverable through projected touch '+JSON.stringify(probes));
   });
   await step(actor+'-confirm-talk',async()=>{const b=await snapshot();await tap('#conversation-btn');await tap('#social-menu-options button:has-text("Поговорить")');await tap('#social-menu-options button:has-text("В очередь · Поговорить")');const a=await snapshot();assert.equal(a.actionQueues.byResident[actor].length,b.actionQueues.byResident[actor].length+1);assert.ok(a.actionQueues.byResident[actor].some(q=>q.type==='social'&&q.targetId===partner&&q.actionId==='talk'));assert.deepEqual(a.actionQueues.byResident[partner],b.actionQueues.byResident[partner]);});
  }
 }},
 {id:'creative-admission',goal:'Find a purchased easel, choose painting, admit a real creative action without spending again',seed:creativeSeed,async run(h){
  const {page,step,tap,snapshot}=h;let before;
  await step('show-item-labels',async()=>{await pause(h);before=await snapshot();await tap('#view-toggle');await tap('#item-labels-btn');assert.equal(await page.locator('#item-labels-btn').getAttribute('aria-pressed'),'true');await tap('#view-close');await page.locator('#view-panel').waitFor({state:'hidden'});});
  await step('choose-easel',async()=>{
   const item=before.world.furniture.instances.find(i=>i.prefabId==='easel'&&i.location==='home');assert.ok(item,'purchased easel exists');
   const label=page.locator('#hotspots button:has-text("Мольберт")');
   h.observe({easelInstance:item.instanceId,labelVisible:await label.isVisible()});
   // The optional legacy hotspot does not necessarily cover a purchased instance.
   // Select the real placed object by its live camera projection, no action injection.
   await tap('#view-toggle');await tap('#item-labels-btn');await tap('#view-close');await page.locator('#view-panel').waitFor({state:'hidden'});
   for(const y of [1.15,.75,1.5]){
    const pt=await page.evaluate(async({x,z,y,instanceId})=>{const {Application,Vec3}=await import('playcanvas');const app=Application.getApplication();const node=app.root.findByName('F2 purchased / '+instanceId);if(!node?.enabled)throw Error('placed easel not rendered');const cam=app.root.findComponents('camera').find(c=>c.enabled);const p=cam.worldToScreen(new Vec3(x,y,z));const b=document.querySelector('#game-canvas').getBoundingClientRect();const px=Math.round(p.x+b.left),py=Math.round(p.y+b.top);return {x:px,y:py,hit:document.elementFromPoint(px,py)?.id};},{x:item.x,z:item.z,y,instanceId:item.instanceId});
    h.observe({easelProjection:pt});if(pt.hit!=='game-canvas')continue;
    await h.tapPoint(pt.x,pt.y);await page.locator('#painting-theme-select').waitFor({state:'visible',timeout:1500}).catch(()=>{});
    h.observe({worldInput:await h.inputTrace()});assert.deepEqual((await snapshot()).actionQueues,before.actionQueues,'selecting easel must not enqueue or start a different command');
    if(await page.locator('#painting-theme-select').isVisible())break;
    if(await page.locator('#ground-walk-menu').isVisible())await tap('#ground-walk-close');
    if(await page.locator('#social-context').isVisible())await tap('#social-context-close');
    if(await page.locator('#action-button').isVisible())await tap('#close-action');
   }
   await page.locator('#painting-theme-select').waitFor({state:'visible',timeout:2000});assert.ok(await page.locator('#painting-theme-select option:not([disabled])').count()>0);
  });
  await step('queue-painting',async()=>{await tap('#action-button');const s=await snapshot();assert.equal(s.shop.credits,before.shop.credits);assert.equal(s.actionQueues.byResident.alex.length,before.actionQueues.byResident.alex.length+1);assert.ok(s.actionQueues.byResident.alex.some(q=>q.type==='activity'&&q.activityId===PAINT_ACTIVITY_ID));assert.deepEqual(s.actionQueues.byResident.mira,before.actionQueues.byResident.mira);});
 }},
 {id:'career-discovery',goal:'Find actual career vacancies and inspect a job before committing to a career',seed:auditSeed,async run(h){
  const {page,step,tap,snapshot}=h;let before;
  await step('open-work',async()=>{await pause(h);before=await snapshot();await tap('#career-phone-toggle');await tap('#career-phone-panel [data-phone-app="work"]');assert.equal(await page.locator('#career-phone-panel').getAttribute('aria-label'),'Смартфон: работа Блин’С');});
  await step('vacancies',async()=>{const offers=page.locator('#career-phone-panel [aria-label^="Вакансия "]');assert.ok(await offers.count()>1,'multiple available job choices');await tap('#career-phone-panel [aria-label^="Вакансия "]');assert.ok((await page.locator('#career-phone-panel').innerText()).length>50);});
  await step('leave-without-commit',async()=>{await tap('.career-phone-x');const s=await snapshot();assert.deepEqual(s.careerSystem,before.careerSystem);assert.equal(s.shop.credits,before.shop.credits);});
 }},
 {id:'autonomy-five-min',only:'chromium-390',goal:'Five real minutes of unattended simulation with periodic observable telemetry; not a human play session',seed:()=>{const s=newHousehold('2026-11-26');s.calendar.anchorConfirmed=true;return s;},async run(h){
  const {page,step,tap,snapshot}=h;let first,last;
  await step('start',async()=>{await tap('#pick-alex');if(await page.locator('#pause-btn').getAttribute('aria-label')==='Продолжить')await tap('#pause-btn');first=await snapshot();last=first.minutes;});
  for(let i=1;i<=5;i++)await step('minute-'+i,async()=>{await page.waitForTimeout(60000);const s=await snapshot();assert.ok(s.minutes>last,'clock stalled');last=s.minutes;assert.equal(s.version,1);assert.equal(s.otherSim.minutes,s.minutes);for(const actor of [s,s.otherSim])for(const n of Object.values(actor.needs))if(typeof n==='number')assert.ok(Number.isFinite(n)&&n>=0&&n<=100);h.observe({minute:i,gameMinutes:s.minutes,credits:s.shop.credits,alex:{needs:s.needs,action:s.action?.id??null},mira:{needs:s.otherSim.needs,action:s.otherSim.action?.id??null},queues:s.actionQueues});});
 }}
);
