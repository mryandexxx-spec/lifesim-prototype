/** Comparative bounded headless policy probe. Not a browser playthrough.
 * Uses canonical decisions/ticks; test-only movement adapter verifies A* then
 * advances to arrival after a five-minute tick. Work portals are modelled.
 * Same starting household/date/easel/budget for all policies.
 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {newHousehold,getActor,tickHousehold,chooseResidentAction,bedDestinationFor,residentAutonomousChoice,loadHousehold} from '../src/household.js';
import {arrive} from '../src/simulation.js';
import {findPath,nearestWalkable} from '../src/navigation.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {findMarketPlacement,buyMarketItem} from '../src/furniture-shop.js';
import {hireCareer} from '../src/career-state.js';
import {arriveCareerPortal,finishCareerReturn,residentUnavailableForHome} from '../src/career-work.js';
import {startSocial,arriveSocial} from '../src/relationships.js';
import {PAINT_ACTIVITY_ID} from '../src/painting.js';
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(process.env.GQ_EXPECTED_SHA)assert.equal(sha,process.env.GQ_EXPECTED_SHA);
const ids=['alex','mira'],dt=5,days=30;
const dir='artifacts/gq-strategy';mkdirSync(dir,{recursive:true});
const report={sha,model:'Headless API policy probe; A* verified arrival at 5-minute resolution, simplified work portal/return; no live input, full browser autonomy, recruitment or human enjoyment claims',date:'2026-11-26',stepMinutes:dt,policies:[],failures:[]};
const flush=()=>writeFileSync(dir+'/report.json',JSON.stringify(report,null,2)+'\n');
const base=newHousehold(report.date);base.calendar.anchorConfirmed=true;
const placement=findMarketPlacement(base.world.furniture,base.shop,'easel.starter');assert.ok(placement);
const tx=buyMarketItem(base.world.furniture,base.shop,'easel.starter',placement);assert.ok(tx.ok,tx.reason);
base.world.furniture=tx.world;base.shop=tx.shop;
const easel=base.world.furniture.instances.find(i=>i.prefabId==='easel'&&i.location==='home');assert.ok(easel);
report.initial={minutes:base.minutes,wallet:base.shop.credits,needs:ids.map(id=>getActor(base,id).needs),easel:easel.instanceId};
const urgent=[['bladder','toilet',50],['hunger','fridge',55],['energy','bed',45],['hygiene','shower',55],['fun','sofa',50]];
const count=(map,key,n=1)=>map[key]=(map[key]||0)+n;
for(const policy of ['no-intervention','core-autonomy','career','creative','social','mixed']){
 const p={policy,status:'OPEN',daily:[],actions:{},minutesByAction:{},rejected:{},criticalNeedMinutes:{},decisions:0,receipts:{},events:{},travelFailures:0};report.policies.push(p);
 let root=structuredClone(base),lastWallet=root.shop.credits,seen=new Set(),socialGoal=null;
 const automatic=policy==='core-autonomy';
 root.autonomy.enabled=automatic;root.otherSim.autonomy.enabled=automatic;
 if(policy==='career'||policy==='mixed'){
   root.careerSystem=hireCareer(root.careerSystem,'alex','editorial',root.minutes,{rankSchedules:true});
   if(policy==='career')root.careerSystem=hireCareer(root.careerSystem,'mira','business-center',root.minutes,{rankSchedules:true});
 }
 const launch=(id,action)=>{
   const actor=getActor(root,id);
   const ok=chooseResidentAction(root,action,automatic,id,action==='paint'?easel.instanceId:null,action==='paint'?PAINT_ACTIVITY_ID:null,action==='paint'?'painting.hills':null);
   if(ok){count(p.actions,action);p.decisions++;return true;}
   count(p.rejected,action);return false;
 };
 try{
  for(let t=0;t<days*1440/dt;t++){
   for(const id of ids){
    const shift=root.careerSystem.byResident[id]?.currentShift;
    if(shift?.phase==='departing')arriveCareerPortal(root,id,root.minutes);
    if(shift?.phase==='returning')finishCareerReturn(root,id);
   }
   if(policy!=='no-intervention'&&!root.socialAction){
    if((policy==='social'||policy==='mixed')&&ids.every(id=>!getActor(root,id).action&&!residentUnavailableForHome(root,id))&&root.minutes>=(socialGoal??base.minutes)&&ids.every(id=>Math.min(...urgent.map(([key])=>getActor(root,id).needs[key]))>=40)){
     const a=getActor(root,'alex'),b=getActor(root,'mira');
     const target=nearestWalkable({x:b.position.x+.4,z:b.position.z},root.world);
     if(findPath(a.position,target,root.world)&&startSocial(root,'talk','alex',target)){
      count(p.actions,'talk');p.decisions++;socialGoal=root.minutes+180;
     }else{count(p.rejected,'talk');socialGoal=root.minutes+30;}
    }
    for(const id of ids){
     const a=getActor(root,id);if(a.action||root.socialAction||residentUnavailableForHome(root,id))continue;
     if(automatic){
      const choice=residentAutonomousChoice(root,id);
      if(choice&&['bed','fridge','shower','toilet','sofa','tv','wash'].includes(choice))launch(id,choice);
      else if(choice)count(p.rejected,'unsupported:'+choice);
      continue;
     }
     const needs=urgent.filter(([k,,limit])=>a.needs[k]<limit).sort((x,y)=>a.needs[x[0]]/x[2]-a.needs[y[0]]/y[2]);
     if(needs.length){for(const [,action] of needs)if(launch(id,action))break;}
     else if((policy==='creative'||(policy==='mixed'&&id==='mira'))&&(a.createdWorks?.length||0)<24&&a.needs.energy>=55&&a.needs.hunger>=55)launch(id,'paint');
    }
   }
   const walking=ids.map(id=>[id,getActor(root,id).action]).filter(([,a])=>a?.phase==='walking');
   const walkingSocial=root.socialAction?.phase==='walking'?root.socialAction:null;
   for(const id of ids){
    const a=getActor(root,id),phase=root.careerSystem.byResident[id]?.currentShift?.phase;
    count(p.minutesByAction,id+':'+(phase==='working'?'work':root.socialAction?'social':a.action?.id||'idle'),dt);
    for(const [k,v] of Object.entries(a.needs))if(typeof v==='number'&&v<20)count(p.criticalNeedMinutes,id+':'+k,dt);
   }
   const before=root.minutes,events=tickHousehold(root,dt)||[];
   assert.equal(root.minutes,before+dt,'clock did not advance');
   for(const e of events)count(p.events,e.type||'unknown');
   for(const [id,action] of walking){
    const a=getActor(root,id);if(a.action!==action||a.action.phase!=='walking'||residentUnavailableForHome(root,id))continue;
    const goal=action.id==='bed'?bedDestinationFor(root,id,action.targetInstanceId):
      action.id==='tv'&&action.watchSeatInstanceId?furnitureActionApproach(root.world,'sofa',action.watchSeatInstanceId):
      furnitureActionApproach(root.world,action.id,action.targetInstanceId);
    if(!goal||!findPath(a.position,goal,root.world)){p.travelFailures++;continue;}
    a.position={x:goal.x,z:goal.z};arrive(a);
   }
   if(walkingSocial&&root.socialAction===walkingSocial){
    const a=getActor(root,walkingSocial.initiator),goal=walkingSocial.target;
    if(findPath(a.position,goal,root.world)){a.position={...goal};arriveSocial(root);}
    else p.travelFailures++;
   }
   assert.equal(root.version,1);assert.equal(root.otherSim.minutes,root.minutes);
   for(const id of ids)for(const v of Object.values(getActor(root,id).needs))if(typeof v==='number')assert.ok(Number.isFinite(v)&&v>=0&&v<=100);
   let delta=0;
   for(const e of root.financialHistory.entries){if(seen.has(e.id))continue;seen.add(e.id);delta+=e.delta;count(p.receipts,e.kind); }
   assert.equal(root.shop.credits,lastWallet+delta,'unreconciled wallet delta');lastWallet=root.shop.credits;
   if((t+1)%(1440/dt)===0){
    const day=(t+1)*dt/1440;
    p.daily.push({day,minutes:root.minutes,wallet:root.shop.credits,relationship:root.relationship,actors:ids.map(id=>{const a=getActor(root,id),c=root.careerSystem.byResident[id];return {id,needs:a.needs,skills:a.skills,works:a.createdWorks?.length||0,career:c?{level:c.level,workedShifts:c.workedShifts,missedShifts:c.missedShifts,performance:c.performance}:null};}),decisions:p.decisions,actions:{...p.actions},criticalNeedMinutes:{...p.criticalNeedMinutes},minutesByAction:{...p.minutesByAction},rejected:{...p.rejected},events:{...p.events}});
    const restored=loadHousehold(structuredClone(root));
    assert.equal(restored.shop.credits,root.shop.credits);assert.equal(restored.minutes,root.minutes);assert.deepEqual(restored.financialHistory,root.financialHistory);
    // Observe roundtrip without replacing live ongoing routes/commands.
    flush();
   }
  }
  assert.equal(p.daily.length,30);p.status='PASS';console.log(policy,JSON.stringify({day7:p.daily[6],day30:p.daily[29],rejected:p.rejected,travelFailures:p.travelFailures}));
 }catch(e){p.status='FAIL';p.error=e.stack||String(e);report.failures.push({policy,error:p.error});console.error(policy,p.error);}
 flush();
}
assert.deepEqual(report.failures,[],'strategy diagnostics contain failures');
