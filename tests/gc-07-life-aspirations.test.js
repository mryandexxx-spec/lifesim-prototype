import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,getActor,chooseResidentAction,tickHousehold,enableArtMarketPilot} from '../src/household.js';
import {newGame,arrive} from '../src/simulation.js';
import {ASPIRATIONS,chooseAspiration,aspirationChoices,aspirationView,recordAspirationIncome,recordAspirationArtwork,prepareNewResidentAspiration} from '../src/life-aspirations.js';
import {changeRecurringTask,syncRecurringTasks,taskView,recordSocialTaskOutcome} from '../src/recurring-tasks.js';
import {hireCareer} from '../src/career-state.js';
import {nextCareerShift} from '../src/career-scheduler.js';
import {progressCareerWork} from '../src/career-work.js';
import {recordFinanceChange,FINANCE_HISTORY_LIMIT} from '../src/finance-ledger.js';
import {findMarketPlacement,buyMarketItem} from '../src/furniture-shop.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {PAINT_ACTIVITY_ID} from '../src/painting.js';
import {quoteArtSale,projectArtSale} from '../src/art-market.js';
import {transactPainting} from '../src/painting-gallery.js';
import {applySocialEvent,getPair} from '../src/social-graph.js';
import {SOCIAL_ACTIONS,startSocial,arriveSocial,cancelSocial} from '../src/relationships.js';
import {MINUTES_PER_GAME_DAY as DAY} from '../src/calendar-core.js';
const copy=x=>JSON.parse(JSON.stringify(x));
const row=(r,id)=>r.lifeAspirations?.byResident[id];
function setup(){const r=newHousehold('2026-11-23');r.autonomy.enabled=r.otherSim.autonomy.enabled=false;return r;}
function without(r){const c=copy(r);delete c.lifeAspirations;return c;}
function advance(r,at){r.minutes=r.otherSim.minutes=at;syncRecurringTasks(r);}
function extra(r){
 const a=newGame();a.position={x:1.2,z:1.2};
 r.population={schema:1,nextResidentSerial:4,residentsById:{resident_3:{id:'resident_3',identity:{firstName:'Вера',lastName:'Тест',lifeStage:'adult'},actor:a}},
 linksByResident:Object.fromEntries(['alex','mira','resident_3'].map(id=>[id,{familyId:'family_1',dwellingId:'dwelling_1'}])),kinship:[]};
 return loadHousehold(copy(r));
}
test('GC-07: explicit five choices, no default, personal switch, canonical state and old task proofs untouched',()=>{
 const r=setup(),before=copy(r);
 assert.equal(Object.keys(ASPIRATIONS).length,5);
 assert.equal(aspirationChoices(r,'alex').filter(x=>x.enabled).length,5);
 assert.equal(aspirationView(r,'alex').id,null);
 assert.equal(Object.hasOwn(loadHousehold(copy(r)),'lifeAspirations'),false);
 assert.equal(chooseAspiration(r,'ghost','wealth'),false);
 assert.equal(chooseAspiration(r,'alex','constructor'),false);
 assert.equal(chooseAspiration(r,'alex','wealth'),true);
 assert.equal(chooseAspiration(r,'alex','wealth'),false);
 assert.equal(chooseAspiration(r,'mira','home'),true);
 assert.equal(row(r,'alex').definitionId,'wealth');
 assert.equal(chooseAspiration(r,'alex','career'),true);
 assert.equal(row(r,'mira').definitionId,'home');
 assert.deepEqual(without(r),before);
 assert.deepEqual(loadHousehold(copy(r)).lifeAspirations,r.lifeAspirations);
 const raw=copy(r);raw.lifeAspirations.byResident.alex.earned=-5;
 raw.lifeAspirations.byResident.ghost=raw.lifeAspirations.byResident.mira;
 const restored=loadHousehold(raw);
 assert.equal(row(restored,'alex'),undefined);assert.equal(row(restored,'mira').definitionId,'home');
 assert.equal(row(restored,'ghost'),undefined);assert.equal(restored.shop.credits,r.shop.credits);
});
test('GC-07: CAS proposal requires new identity and explicit supported choice, never modifies old population',()=>{
 const old=setup(),candidate=extra(copy(old)),before=copy(candidate);
 assert.equal(prepareNewResidentAspiration(old,candidate,'resident_3',undefined).ok,false);
 assert.equal(prepareNewResidentAspiration(old,candidate,'alex','career').ok,false);
 assert.equal(prepareNewResidentAspiration(old,candidate,'resident_3','creative').ok,false);
 assert.equal(aspirationChoices(candidate,'resident_3').length,5);
 assert.equal(aspirationChoices(candidate,'resident_3').find(x=>x.id==='creative').enabled,false);
 const p=prepareNewResidentAspiration(old,candidate,'resident_3','relationships');
 assert.ok(p.ok);assert.equal(p.lifeAspirations.byResident.resident_3.definitionId,'relationships');
 assert.deepEqual(candidate,before);assert.equal(aspirationView(candidate,'resident_3').id,null);
 candidate.lifeAspirations=p.lifeAspirations;
 assert.equal(aspirationView(loadHousehold(copy(candidate)),'resident_3').id,'relationships');
});
test('GC-07: career requires actual top rank and valid specialization, no invented history',()=>{
 const r=setup();chooseAspiration(r,'alex','career');
 assert.equal(aspirationView(r,'alex').currentTargetMet,false);
 r.careerSystem=hireCareer(r.careerSystem,'alex','city-services',r.minutes);
 const c=r.careerSystem.byResident.alex;
 assert.equal(aspirationView(r,'alex').currentTargetMet,false);
 c.level=7;assert.equal(aspirationView(r,'alex').currentTargetMet,false);
 c.specialization={id:'logistics'};
 assert.equal(aspirationView(r,'alex').currentTargetMet,true);
 assert.equal(aspirationView(r,'mira').id,null);
 c.level=6;assert.equal(aspirationView(r,'alex').currentTargetMet,false);
});
test('GC-07: real payroll credited exactly once to selected resident, survives journal eviction',()=>{
 const r=setup();r.careerSystem=hireCareer(r.careerSystem,'alex','city-services',r.minutes);
 chooseAspiration(r,'alex','wealth');chooseAspiration(r,'mira','wealth');
 const shift=nextCareerShift(r.calendar,r.careerSystem.byResident.alex,r.minutes);
 advance(r,shift.end-1);
 r.careerSystem.byResident.alex.currentShift={...shift,phase:'working',departedAt:shift.start,warn60:true,warn15:true,readiness:75};
 const money=r.shop.credits;assert.ok(progressCareerWork(r,shift.end-1,shift.end).some(e=>e.type==='salary'));
 advance(r,shift.end);const entry=r.financialHistory.entries.at(-1),earned=row(r,'alex').earned;
 assert.equal(earned,r.shop.credits-money);assert.equal(earned,entry.delta);
 assert.equal(row(r,'mira').earned,0);
 assert.equal(recordAspirationIncome(r,entry),false);
 assert.equal(recordAspirationIncome(r,{...entry,actorId:'mira'}),false);
 for(let i=0;i<FINANCE_HISTORY_LIMIT;i++){
  const tx=recordFinanceChange(r,{...r.shop,credits:r.shop.credits-1},{kind:'purchase',sourceId:'gc07-filler-'+i,actorId:'alex',atGameMinute:Math.floor(r.minutes)});
  assert.ok(tx.ok);r.shop=tx.shop;r.financialHistory=tx.financialHistory;
  assert.equal(recordAspirationIncome(r,tx.entry),false);
 }
 assert.equal(r.financialHistory.entries.some(e=>e.id===entry.id),false);
 const restored=loadHousehold(copy(r));assert.equal(row(restored,'alex').earned,earned);
 assert.equal(recordAspirationIncome(restored,entry),false);
 chooseAspiration(restored,'alex','home');chooseAspiration(restored,'alex','wealth');
 assert.equal(row(restored,'alex').earned,0);
 assert.equal(recordAspirationIncome(restored,entry),false);
});
test('GC-07: real new artworks, not free practice, sale and retained work, no extra income',()=>{
 const r=setup();const pose=findMarketPlacement(r.world.furniture,r.shop,'easel.starter');assert.ok(pose);
 const b=buyMarketItem(r.world.furniture,r.shop,'easel.starter',pose);assert.ok(b.ok);
 r.world.furniture=b.world;r.shop=b.shop;assert.ok(enableArtMarketPilot(r));
 chooseAspiration(r,'alex','creative');
 function paint(mode){
  assert.ok(chooseResidentAction(r,'paint',false,'alex',b.instanceId,PAINT_ACTIVITY_ID,'painting.hills',null,null,null,false,false,mode,mode==='practice'?0:20));
  r.position=furnitureActionApproach(r.world,'paint',b.instanceId);arrive(r);
  for(let i=0;i<45;i++)tickHousehold(r,1);
 }
 paint('practice');assert.equal(row(r,'alex').created,0);assert.equal(r.createdWorks.length,0);
 for(let i=0;i<10;i++){
  paint('speculative');const work=r.createdWorks.at(-1);
  assert.ok(work);assert.equal(row(r,'alex').created,i+1);
  assert.equal(recordAspirationArtwork(r,'alex',work),false);
  const stored=transactPainting(r,'alex',work.id,'store');assert.ok(stored.ok);r.createdWorks=stored.works;
 }
 assert.equal(aspirationView(r,'alex').currentTargetMet,false);
 const work=r.createdWorks[0],q=quoteArtSale(r,'alex',work.id);assert.ok(q.ok);
 const cash=r.shop.credits,tx=projectArtSale(r,'alex',work.id,q);assert.ok(tx.ok);
 Object.assign(r,{artMarket:tx.artMarket,shop:tx.shop,financialHistory:tx.financialHistory,createdWorks:tx.works});
 assert.equal(recordAspirationIncome(r,tx.entry,work),true);
 assert.equal(recordAspirationIncome(r,tx.entry,work),false);
 assert.equal(r.shop.credits-cash,tx.amount);
 assert.equal(aspirationView(r,'alex').currentTargetMet,true);
 assert.equal(aspirationView(loadHousehold(copy(r)),'alex').currentTargetMet,true);
 r.createdWorks=[];assert.equal(aspirationView(r,'alex').currentTargetMet,false);
});
test('GC-07: real accepted talk advances relationship-context task, not queue/cancel/refusal; current pair condition',()=>{
 const r=setup();chooseAspiration(r,'alex','relationships');
 for(let i=0;i<8&&taskView(r,'alex')[0].kind!=='social';i++)assert.ok(changeRecurringTask(r,'alex','day','replace'));
 assert.equal(taskView(r,'alex')[0].kind,'social');
 const pos={x:-.2,z:1.85};
 assert.ok(startSocial(r,'talk','alex',pos));assert.ok(arriveSocial(r));assert.ok(cancelSocial(r));
 assert.equal(taskView(r,'alex')[0].progress,0);
 assert.ok(startSocial(r,'talk','alex',pos));assert.ok(arriveSocial(r));
 tickHousehold(r,SOCIAL_ACTIONS.talk.duration+1);
 assert.equal(taskView(r,'alex')[0].status,'complete');
 const pair=getPair(r.socialGraph,'alex','mira');
 assert.equal(recordSocialTaskOutcome(r,pair.events.at(-1)),false);
 assert.equal(recordSocialTaskOutcome(r,{seq:999999,type:'talk',actorId:'alex',targetId:'mira',at:r.minutes}),false);
 assert.equal(aspirationView(r,'alex').currentTargetMet,false);
 // Exercise actual graph recomputation with legitimate positive events over distinct days.
 for(let i=1;i<=12;i++){
  advance(r,(i+1)*DAY+480);
  applySocialEvent(r.socialGraph,{actorId:'alex',targetId:'mira',type:'friend.confide',at:r.minutes});
 }
 assert.equal(getPair(r.socialGraph,'alex','mira').friendship,'close');
 assert.equal(aspirationView(r,'alex').currentTargetMet,true);
 assert.equal(aspirationView(r,'mira').id,null);
});
test('GC-07: home projection needs installed compatible products, bills and reserve; shared condition not personal assets',()=>{
 const r=setup();chooseAspiration(r,'alex','home');chooseAspiration(r,'mira','home');
 assert.equal(aspirationView(r,'alex').currentTargetMet,false);
 // Canonical installed-SKU snapshot fixture; actual placement is separate integration QA.
 const products=[['bed','bed.canopy'],['stove','stove.copper'],['prep','prep.oak'],['sink','sink.farm'],['sofa','sofa.comfort']];
 const items=products.map(([prefabId,itemDefinitionId],i)=>({instanceId:'shop-'+prefabId+'-'+(i+101),prefabId,itemDefinitionId,location:'home',x:0,z:0,yaw:0}));
 r.world.furniture.instances.push(...items);
 assert.equal(aspirationView(r,'alex').currentTargetMet,true);
 assert.equal(aspirationView(r,'mira').currentTargetMet,true);
 items[0].location='storage';assert.equal(aspirationView(r,'alex').currentTargetMet,false);
 items[0].location='home';r.shop.credits=359;assert.equal(aspirationView(r,'alex').currentTargetMet,false);
 r.shop.credits=1000;advance(r,7*DAY+480);assert.equal(aspirationView(r,'alex').currentTargetMet,false);
});
test('GC-07: selection does not reset daily/weekly proof; next period prefers feasible direction and replace still cycles',()=>{
 const r=setup();const before=copy(r.recurringTasks);
 chooseAspiration(r,'alex','home');assert.deepEqual(r.recurringTasks,before);
 advance(r,DAY+480);assert.ok(['rest','tv'].includes(taskView(r,'alex')[0].kind));
 chooseAspiration(r,'alex','wealth');assert.ok(!['work','sale'].includes(taskView(r,'alex')[0].kind));
 advance(r,2*DAY+480);assert.ok(!['work','sale'].includes(taskView(r,'alex')[0].kind));
 chooseAspiration(r,'alex','relationships');
 const seen=new Set();for(let i=0;i<8;i++){seen.add(taskView(r,'alex')[0].kind);assert.ok(changeRecurringTask(r,'alex','day','replace'));}
 assert.ok(seen.has('social'));assert.ok(seen.has('rest')||seen.has('tv'));
});
