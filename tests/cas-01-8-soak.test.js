/** CAS-01.8: reproducible multiday, 2-4-resident soak; no PlayCanvas or save schema writes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {mkdirSync,writeFileSync} from 'node:fs';
import {SAVE_KEY,newGame,NEEDS} from '../src/simulation.js';
import {newHousehold,loadHousehold,tickHousehold,getActor,setHouseholdAutonomy} from '../src/household.js';
import {residentIdsForSimulation} from '../src/resident-activity-runtime.js';
import {acceptCareerOffer} from '../src/career-job-board.js';
import {nextCareerShift} from '../src/career-scheduler.js';
import {arriveCareerPortal,finishCareerReturn} from '../src/career-work.js';
import {createProfile} from '../src/trait-catalog.js';
import {chooseAutonomousWorkOption,pendingWorkIncident,workScenario} from '../src/career-incidents.js';
import {progressWorkNeeds} from '../src/career-work-needs.js';
import {enqueueAction,pendingActions,MAX_ACTION_QUEUE} from '../src/action-queue.js';
import {queueAddressedSocial} from '../src/resident-social-runtime.js';
import {getPair} from '../src/social-graph.js';
import {findPath,isWalkable} from '../src/navigation.js';
import {FINANCE_HISTORY_LIMIT} from '../src/finance-ledger.js';

const copy=x=>JSON.parse(JSON.stringify(x));
const NAMES=['Вера','Игорь'];
function home(n=4,{remote=false,autonomy=true}={}){
  const raw=newHousehold('2026-11-23');
  if(n>2){
    const residentsById={},linksByResident={
      alex:{familyId:'family_1',dwellingId:'dwelling_1'},
      mira:{familyId:'family_1',dwellingId:'dwelling_1'}};
    for(let i=3;i<=n;i++){
      const id='resident_'+i,actor=newGame();
      actor.personality.name=NAMES[i-3];
      actor.position={x:1.2+(i-3)*.9,z:1.2};
      residentsById[id]={id,identity:{firstName:NAMES[i-3],lastName:'Тест',lifeStage:'adult'},actor};
      linksByResident[id]={familyId:'family_'+i,
        dwellingId:remote&&i===n?'dwelling_2':'dwelling_1'};
    }
    raw.population={schema:1,nextResidentSerial:n+1,residentsById,linksByResident,kinship:[]};
  }
  const result=loadHousehold(copy(raw));
  setHouseholdAutonomy(result,autonomy);
  return result;
}
function hire(root,id,careerId){
  const offer=acceptCareerOffer(root,id,careerId);
  assert.equal(offer.ok,true,offer.reason);
  root.careerSystem=offer.careerSystem;
  return offer.contract;
}
function invariant(root,ids){
  assert.equal(root.version,1);
  assert.equal(root.socialGraph?.schema,1);
  assert.deepEqual(residentIdsForSimulation(root),ids);
  assert.ok(Number.isFinite(root.minutes)&&root.minutes>=0);
  assert.ok(Number.isSafeInteger(root.shop.credits)&&root.shop.credits>=0);
  assert.ok(root.financialHistory.entries.length<=FINANCE_HISTORY_LIMIT);
  assert.ok(root.actionQueues.nextSeq>0);
  for(const id of ids){
    const actor=getActor(root,id);
    assert.ok(actor&&actor.version===1,id+' actor identity');
    for(const need of NEEDS)assert.ok(Number.isFinite(actor.needs[need])&&
      actor.needs[need]>=0&&actor.needs[need]<=100,
      id+' '+need+' must stay within 0..100, got '+actor.needs[need]);
    assert.ok(Number.isFinite(actor.position.x)&&Number.isFinite(actor.position.z),id+' finite position');
    const pending=pendingActions(root.actionQueues,id);
    assert.ok(pending.length<=MAX_ACTION_QUEUE,id+' queue cap');
    const seq=pending.map(a=>a.seq);
    assert.deepEqual([...seq].sort((a,b)=>a-b),seq,id+' FIFO order');
    assert.equal(new Set(seq).size,seq.length,id+' no duplicate queue IDs');
  }
  const journal=root.financialHistory.entries;
  assert.equal(new Set(journal.map(e=>e.id)).size,journal.length,'unique financial receipts');
  assert.ok(journal.every(e=>Number.isSafeInteger(e.delta)&&Number.isSafeInteger(e.balanceAfter)));
  const settlement=root.careerSystem.settlementIds;
  assert.equal(new Set(settlement).size,settlement.length,'one canonical settlement per shift');
  const salary=journal.filter(e=>e.kind==='salary');
  assert.equal(new Set(salary.map(e=>e.sourceId)).size,salary.length,'no double salary');
  assert.ok(salary.every(e=>settlement.includes(e.sourceId)),'each salary must have a completed shift');
}
test('CAS-01.8 v1 legacy 2 persons and remote third/fourth stay stable across ticks and reload',()=>{
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  const old=newHousehold('2026-11-23');
  const serialized=JSON.stringify(old);
  let root=loadHousehold(copy(old));
  assert.equal(JSON.stringify(old),serialized,'preflight must not mutate old snapshot');
  tickHousehold(root,20);
  root=loadHousehold(copy(root));
  assert.equal(Object.hasOwn(root,'population'),false);
  invariant(root,['alex','mira']);
  const away=home(4,{remote:true,autonomy:false});
  const awayBefore=copy(away.population.residentsById.resident_4.actor.needs);
  for(let i=0;i<48;i++)tickHousehold(away,30);
  invariant(away,['alex','mira','resident_3']);
  assert.deepEqual(away.population.residentsById.resident_4.actor.needs,awayBefore,
    'saved inhabitant of another dwelling is inert, not silently deleted');
  const resumed=loadHousehold(copy(away));
  assert.equal(resumed.version,1);
  assert.deepEqual(resumed.population.linksByResident,away.population.linksByResident);
  invariant(resumed,['alex','mira','resident_3']);
});
test('CAS-01.8 eight-game-day 4-person autonomy, FIFO, day/night shifts, finance and v1 reload soak',()=>{
  let root=home(4);
  const ids=['alex','mira','resident_3','resident_4'];
  hire(root,'resident_3','business-center');
  hire(root,'resident_4','civic-service');
  const day=nextCareerShift(root.calendar,root.careerSystem.byResident.resident_3,root.minutes);
  const night=nextCareerShift(root.calendar,root.careerSystem.byResident.resident_4,root.minutes);
  assert.ok(day&&night&&day.start%1440<night.start%1440);
  assert.ok(night.end>Math.floor(night.start/1440)*1440+1440,
    'civic rank 0 works across midnight');
  const first=enqueueAction(root.actionQueues,'resident_3',{type:'move',x:1.2,z:1.2});
  const second=enqueueAction(root.actionQueues,'resident_3',{type:'move',x:1.4,z:1.2});
  assert.ok(first&&second&&first.seq<second.seq);
  const start=root.minutes, samples=[],reloaded=[];
  const total=8*1440,step=20;
  for(let elapsed=step;elapsed<=total;elapsed+=step){
    const before=root.minutes,t0=performance.now();
    tickHousehold(root,step);
    samples.push(performance.now()-t0);
    assert.equal(root.minutes,before+step,'exactly one root clock per tick');
    if(elapsed%240===0)invariant(root,ids);
    if(elapsed%1440===0){
      const snapshot=copy(root),oldJson=JSON.stringify(snapshot);
      root=loadHousehold(snapshot);
      assert.equal(JSON.stringify(snapshot),oldJson,'reload never mutates serialized input');
      assert.equal(root.shop.credits,snapshot.shop.credits,'no reload payout');
      assert.deepEqual(root.careerSystem.settlementIds,snapshot.careerSystem.settlementIds);
      invariant(root,ids);
      reloaded.push(elapsed/1440);
    }
  }
  assert.equal(root.minutes,start+total);
  invariant(root,ids);
  const salary=root.financialHistory.entries.filter(e=>e.kind==='salary');
  assert.ok(salary.some(e=>e.actorId==='resident_3'),'day worker must complete a shift');
  assert.ok(salary.some(e=>e.actorId==='resident_4'),'overnight worker must complete a shift');
  assert.ok(root.careerSystem.settlementIds.length>=salary.length);
  const pre=copy(root);
  const repeat=loadHousehold(copy(pre));
  tickHousehold(repeat,1);
  assert.equal(repeat.financialHistory.entries.filter(e=>e.kind==='salary').length,salary.length,
    'reload plus next tick cannot mint a second paycheck');
  const sorted=samples.sort((a,b)=>a-b);
  const result={environment:'Node 22 headless simulation, not device FPS',days:8,
    persons:4,steps:samples.length,gameMinutes:total,
    perfMs:{median:+sorted[Math.floor(sorted.length/2)].toFixed(2),
      p95:+sorted[Math.ceil(sorted.length*.95)-1].toFixed(2),
      max:+sorted.at(-1).toFixed(2)},
    salaryReceipts:salary.length,settlements:root.careerSystem.settlementIds.length,
    savedReloadDays:reloaded,saveBytes:JSON.stringify(root).length,
    finalBalance:root.shop.credits,iPhoneSafariVerified:false};
  assert.ok(result.saveBytes<4000000,'bounded root-v1 snapshot after prolonged play');
  mkdirSync('artifacts/cas-01-8',{recursive:true});
  writeFileSync('artifacts/cas-01-8/node.json',JSON.stringify(result,null,2));
  console.log('CAS-01.8 8-day headless soak '+JSON.stringify(result));
});
test('CAS-01.8 3 residents survive multi-day autonomous simulation and resume',()=>{
  let root=home(3),start=root.minutes;
  for(let i=0;i<72;i++){
    tickHousehold(root,30);
    if(i%12===0)invariant(root,['alex','mira','resident_3']);
  }
  root=loadHousehold(copy(root));
  invariant(root,['alex','mira','resident_3']);
  assert.equal(root.minutes,start+2160);
});
function placePair(root,idA,idB){
  const a=getActor(root,idA),b=getActor(root,idB);
  for(let x=-4;x<=3;x+=.5)for(let z=-3;z<=3;z+=.5){
    const p={x,z},q={x:x+1.05,z};
    const others=['alex','mira','resident_3','resident_4'].filter(id=>id!==idA&&id!==idB);
    if(!isWalkable(p.x,p.z,root.world)||!isWalkable(q.x,q.z,root.world)||
      !findPath(p,q,root.world)||others.some(id=>[p,q].some(point=>
        Math.hypot(point.x-getActor(root,id).position.x,point.z-getActor(root,id).position.z)<1.2)))continue;
    a.position=p;b.position=q;return;
  }
  assert.fail('no genuine walkable rendezvous');
}
test('CAS-01.8 concurrent FIFO and real addressed social survives mid-session save with exactly one reward',()=>{
  let root=home(4,{autonomy:false});
  placePair(root,'resident_3','resident_4');
  const a=getActor(root,'resident_3'),b=getActor(root,'resident_4');
  a.needs.social=30;b.needs.social=30;
  assert.ok(queueAddressedSocial(root,'resident_3','resident_4','talk'));
  tickHousehold(root,.1);
  assert.equal(root.additionalSocial?.phase,'using');
  tickHousehold(root,5);
  const before=root.socialGraph.nextSeq;
  root=loadHousehold(copy(root));
  assert.equal(root.additionalSocial?.phase,'using');
  tickHousehold(root,13);
  const pair=getPair(root.socialGraph,'resident_3','resident_4');
  assert.equal(pair?.events.length,1,'one genuine social receipt after completed session');
  assert.equal(root.socialGraph.nextSeq,before+1);
  assert.ok(getActor(root,'resident_3').needs.social>30);
  assert.ok(getActor(root,'resident_4').needs.social>30);
  tickHousehold(root,5);
  assert.equal(getPair(root.socialGraph,'resident_3','resident_4').events.length,1,
    'next tick and resume cannot replay social reward');
  invariant(root,['alex','mira','resident_3','resident_4']);
});

/** Paired uninterrupted root-clock workloads. Legacy portal/return callbacks
 * stand in for renderer arrivals, not for successful physical routing.
 * Naturally scheduled incidents only; no injected scene, history or needs.
 */
test('LP-02C/3 matched eight-day 2/4 resident workloads retain care and shift invariants',()=>{
  const report=[];
  const anchors=[['habits.neat','coordination.agile'],['temperament.calm','values.independent'],['approach.creative','social.outgoing'],['habits.untidy','values.empathetic']];
  const additions=['motivation.balanced','pace.patient','novelty.curious','novelty.familiar'];
  const careers=['editorial','kitchen-studio','business-center','civic-service'];
  for(const n of [2,4]){
    const results=[];
    for(const candidate of [false,true]){
      let root=home(n),ids=residentIdsForSimulation(root);
      ids.forEach((id,i)=>{getActor(root,id).personality=createProfile([...anchors[i],...(candidate?[additions[i]]:[])]);hire(root,id,careers[i]);});
      const profiles=Object.fromEntries(ids.map(id=>[id,copy(getActor(root,id).personality)]));
      const critical=Object.fromEntries(ids.map(id=>[id,0])),worst=Object.fromEntries(ids.map(id=>[id,100]));
      const initial=root.minutes,steps=8*1440/20;
      let portalCallbacks=0,returns=0;
      for(let step=1;step<=steps;step++){
        const before=root.minutes;tickHousehold(root,20);assert.equal(root.minutes,before+20);
        for(const id of ['alex','mira']){
          const s=root.careerSystem.byResident[id]?.currentShift;
          if(s?.phase==='departing'&&root.minutes<s.end){assert.ok(arriveCareerPortal(root,id,root.minutes));portalCallbacks++;}
          if(s?.phase==='returning'){assert.ok(finishCareerReturn(root,id));returns++;}
        }
        for(const id of ids){
          const a=getActor(root,id),low=Math.min(...['hunger','energy','bladder','hygiene'].map(k=>a.needs[k]));
          if(low<25)critical[id]++;worst[id]=Math.min(worst[id],low);
        }
        if(step%12===0)invariant(root,ids);
        if(step%72===0){
          const saved=copy(root),wallet=root.shop.credits,receipts=copy(root.careerSystem.incidentIds);
          root=loadHousehold(saved);
          assert.equal(root.shop.credits,wallet);assert.deepEqual(root.careerSystem.incidentIds,receipts);
          for(const id of ids)assert.deepEqual(getActor(root,id).personality,profiles[id]);
        }
      }
      assert.equal(root.minutes,initial+8*1440);invariant(root,ids);
      const salaries=root.financialHistory.entries.filter(e=>e.kind==='salary');
      const paid=Object.fromEntries(ids.map(id=>[id,salaries.filter(e=>e.actorId===id).length]));
      const journal=Object.fromEntries(ids.map(id=>[id,root.careerSystem.incidentHistory[id].map(x=>({scenario:x.scenarioId,choice:x.choiceId,delta:x.performanceDelta}))]));
      assert.equal(new Set(root.careerSystem.incidentIds).size,root.careerSystem.incidentIds.length);
      assert.ok(ids.every(id=>paid[id]>0),'all employed residents complete shifts');
      results.push({n,candidate,steps,critical,worst,paid,journal,portalCallbacks,returns,saveBytes:JSON.stringify(root).length});
    }
    const [base,next]=results;report.push(...results);
    // Frozen engineering screen: <=5 percentage-point rise in sampled critical
    // needs per actor and no loss of a completed paid shift in this workload.
    console.log('LP-02C matched workload '+JSON.stringify(results));
    for(const id of Object.keys(base.paid)){
      assert.ok(next.critical[id]-base.critical[id]<=base.steps*.05,'critical care regression '+id);
      assert.ok(next.paid[id]>=base.paid[id],'lost paid shift '+id);
    }
  }
  mkdirSync('artifacts/lp02c-workload',{recursive:true});
  writeFileSync('artifacts/lp02c-workload/report.json',JSON.stringify(report,null,2));
});

/** D0 discovery only: natural work schedule, no invented history/scene,
 * paired counterfactual selectors at actual open and pre-settlement states.
 * Extra actors have the real headless home executor. Legacy home care
 * remains renderer-owned, so do not generalize their headless deprivation.
 */
test('LP-02D0 natural incident exposure and decision-window audit',()=>{
  const motives=['novelty.curious','novelty.familiar','motivation.ambitious','motivation.balanced','pace.patient','pace.impatient'];
  const anchors=['habits.neat','coordination.agile'];
  const banks=[['city-services','kitchen-studio'],['business-center','art-studio'],['editorial','civic-service']];
  const matrix=[];
  function inspect(root,id){
    const actor=getActor(root,id),c=root.careerSystem.byResident[id],incident=pendingWorkIncident(root,id);
    assert.ok(incident);
    const before=JSON.stringify(root),original=actor.personality,choices={};
    const neutral=chooseAutonomousWorkOption(root,id);
    for(const trait of motives){
      try{actor.personality=createProfile([...anchors,trait]);choices[trait]=chooseAutonomousWorkOption(root,id);}
      finally{actor.personality=original;}
    }
    assert.equal(JSON.stringify(root),before,'counterfactual read never changes live state');
    const def=workScenario(c.careerId,incident.scenarioId);
    assert.ok(def.options.some(o=>o.id===neutral));
    for(const choice of Object.values(choices))assert.ok(def.options.some(o=>o.id===choice));
    const {energy,hunger,bladder,hygiene}=actor.needs,mood=actor.mind.mood.value;
    return {minute:root.minutes,energy,hunger,bladder,hygiene,mood,performance:c.performance,
      gate:energy>=45&&mood>=45&&Math.min(hunger,bladder,hygiene)>=25,
      neutral,choices,known:(root.careerSystem.incidentHistory[id]||[]).filter(h=>h.careerId===c.careerId&&h.scenarioId===incident.scenarioId&&h.performanceDelta>0).map(h=>h.choiceId)};
  }
  for(const [careerA,careerB] of banks){
    let root=home(4),ids=residentIdsForSimulation(root);
    for(const [id,career] of [['resident_3',careerA],['resident_4',careerB]]){
      getActor(root,id).personality=createProfile(anchors);hire(root,id,career);
    }
    const rows=new Map(),initial=root.minutes,critical={resident_3:0,resident_4:0},steps=12*1440/10;
    for(let i=1;i<=steps;i++){
      const before=root.minutes;
      for(const id of ['resident_3','resident_4']){
        const incident=pendingWorkIncident(root,id),shift=root.careerSystem.byResident[id]?.currentShift;
        if(!incident)continue;
        if(!rows.has(incident.id))rows.set(incident.id,{id,career:shift.careerId,scene:incident.scenarioId,incidentId:incident.id,opened:inspect(root,id)});
        // Mirror actual work-needs accrual on a detached snapshot immediately
        // before the end tick. This is a forecast, NOT a committed receipt.
        if(before+10>=shift.end){
          const probe=copy(root);
          progressWorkNeeds(probe,before,before+10);
          rows.get(incident.id).endForecast=inspect(probe,id);
        }
      }
      tickHousehold(root,10);assert.equal(root.minutes,before+10);
      for(const id of ['resident_3','resident_4']){
        const a=getActor(root,id);
        if(Math.min(a.needs.energy,a.needs.hunger,a.needs.bladder,a.needs.hygiene)<25)critical[id]++;
        for(const receipt of root.careerSystem.incidentHistory[id]||[]){
          const row=rows.get(receipt.id);
          if(row&&!row.actual)row.actual={choice:receipt.choiceId,performance:receipt.performanceDelta,energy:receipt.energyDelta,auto:receipt.auto};
        }
      }
      if(i%144===0){
        invariant(root,ids);const snapshot=copy(root);
        root=loadHousehold(snapshot);
        assert.deepEqual(root.careerSystem.incidentIds,snapshot.careerSystem.incidentIds);
      }
    }
    assert.equal(root.minutes,initial+12*1440);
    invariant(root,ids);
    const completed=[...rows.values()].filter(x=>x.actual);
    assert.ok(completed.length>0,careerA+'/'+careerB);
    assert.ok(completed.every(x=>x.actual.auto));
    const summary={careers:[careerA,careerB],steps,critical,opened:rows.size,completed:completed.length,
      eligibleAtOpen:completed.filter(x=>x.opened.gate).length,
      eligibleAtEndForecast:completed.filter(x=>x.endForecast?.gate).length,
      forecastMatches:completed.filter(x=>x.endForecast?.neutral===x.actual.choice).length,
      effects:Object.fromEntries(motives.map(t=>[t,{
        open:completed.filter(x=>x.opened.choices[t]!==x.opened.neutral).length,
        end:completed.filter(x=>x.endForecast&&x.endForecast.choices[t]!==x.endForecast.neutral).length
      }]))};
    matrix.push({summary,rows:[...rows.values()]});
    console.log('LP-02D0 natural exposure '+JSON.stringify(summary));
  }
  mkdirSync('artifacts/lp02d0',{recursive:true});
  writeFileSync('artifacts/lp02d0/exposure.json',JSON.stringify({matrix,limitations:['natural extra resident schedule only','end forecast is detached and not guaranteed exact actual end state','counterfactual choices are not candidate settlements','legacy home routing absent']},null,2));
});
