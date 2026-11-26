import assert from 'node:assert/strict';
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
   await step('finance',async()=>{await tap('#career-phone-toggle');await tap('.career-phone-app-tab[data-app="finance"]');assert.match(await page.locator('#career-phone-title').innerText(),/Финансы/);});
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
