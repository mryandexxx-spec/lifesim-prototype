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
import {submitCareerApplication,startCareerInterview,answerCareerInterview,finishRecruitmentApplication,INTERVIEW_QUESTIONS_BY_CAREER} from '../src/career-recruitment.js';
import {promotionReadiness,promoteCareer} from '../src/career-progression.js';
import {transactPainting} from '../src/painting-gallery.js';
import {householdBillView,payHouseholdBill} from '../src/household-bills.js';
import {recordFinanceChange} from '../src/finance-ledger.js';
import {arriveCareerPortal,finishCareerReturn,residentUnavailableForHome} from '../src/career-work.js';
import {startSocial,arriveSocial} from '../src/relationships.js';
import {PAINT_ACTIVITY_ID} from '../src/painting.js';
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(process.env.GC_EXPECTED_SHA)assert.equal(sha,process.env.GC_EXPECTED_SHA);
const ids=['alex','mira'],dt=5,days=30;
const dir='artifacts/gc-02';mkdirSync(dir,{recursive:true});
const report={sha,model:'Headless API policy probe; A* verified arrival at 5-minute resolution, simplified work portal/return; no live input, full browser autonomy or human enjoyment claims; recruitment and transactions through domain APIs; 30-minute administrative cadence',stepMinutes:dt,policies:[],failures:[],controls:{},blocks:[{date:'2026-11-26',swap:false},{date:'2026-11-27',swap:true},{date:'2026-12-01',swap:false,heldOut:true}]};
const flush=()=>writeFileSync(dir+'/report.json',JSON.stringify(report,null,2)+'\n');
function fixture(date){const base=newHousehold(date);base.calendar.anchorConfirmed=true;
const placement=findMarketPlacement(base.world.furniture,base.shop,'easel.starter');assert.ok(placement);
const tx=buyMarketItem(base.world.furniture,base.shop,'easel.starter',placement);assert.ok(tx.ok,tx.reason);
base.world.furniture=tx.world;base.shop=tx.shop;
const easel=base.world.furniture.instances.find(i=>i.prefabId==='easel'&&i.location==='home');assert.ok(easel);
return {base,easel};}
const urgent=[['bladder','toilet',50],['hunger','fridge',55],['energy','bed',45],['hygiene','shower',55],['fun','sofa',50]];
const count=(map,key,n=1)=>map[key]=(map[key]||0)+n;
const policies=['no-intervention','core-autonomy','career','creative','social','mixed'];
function run(block,policy,replay=false){
 const {base,easel}=fixture(block.date);
 const lead=block.swap?'mira':'alex',partner=block.swap?'alex':'mira';
 const p={block,policy,replay,status:'OPEN',initial:{wallet:base.shop.credits,minutes:base.minutes,needs:ids.map(id=>structuredClone(getActor(base,id).needs))},daily:[],actions:{},minutesByAction:{},timeClasses:{},rejected:{},criticalNeedMinutes:{},decisions:0,receipts:{},cashByKind:{},events:{},travelFailures:0,sales:0,negativeSales:0,negativeBills:0};report.policies.push(p);
 let root=structuredClone(base),lastWallet=root.shop.credits,seen=new Set(),socialGoal=null;
 const automatic=policy==='core-autonomy';
 root.autonomy.enabled=automatic;root.otherSim.autonomy.enabled=automatic;
 const jobs=policy==='career'?{[lead]:'editorial',[partner]:'business-center'}:policy==='mixed'?{[lead]:'editorial'}:{};
 const nextApplication={};
 const note=(kind,result)=>{if(result?.ok){count(p.actions,kind);p.decisions++;}else count(p.rejected,kind+':'+(result?.reason||'unknown'));return result?.ok;};
 function administration(){
  if(policy==='no-intervention')return;
  const bill=householdBillView(root);
  if(bill.canPay){const r=payHouseholdBill(root);assert.ok(r.ok,r.reason);
    Object.assign(root,{shop:r.shop,financialHistory:r.financialHistory,householdBills:r.householdBills});
    note('pay-bill',r);
    const duplicate=recordFinanceChange(root,{...root.shop,credits:root.shop.credits-r.amount},{kind:'bill-payment',sourceId:r.entry.sourceId,receiptId:r.entry.receiptId,atGameMinute:Math.round(root.minutes)});
    assert.equal(duplicate.ok,false,'duplicate bill receipt accepted');p.negativeBills++;
  }
  for(const id of ids){
    if(jobs[id]){
      const contract=root.careerSystem.byResident[id],app=root.recruitmentSystem.byResident[id];
      if(!contract){
        if(!app&&root.minutes>=(nextApplication[id]||0)){note('apply',submitCareerApplication(root,id,jobs[id]));nextApplication[id]=root.minutes+1440;}
        else if(app?.phase==='interview_invited')note('interview',startCareerInterview(root,id));
        else if(app?.phase==='interview_active'){
          const question=INTERVIEW_QUESTIONS_BY_CAREER[app.careerId][app.interview.answers.length];
          const best=[...question.answers].sort((a,b)=>b.score-a.score)[0];
          note('interview-answer',answerCareerInterview(root,id,best.id));
        }else if(app?.phase==='offer_ready')note('hire',finishRecruitmentApplication(root,id,'accept'));
        else if(app?.phase==='rejected')note('dismiss-rejected',finishRecruitmentApplication(root,id,'dismiss'));
      }else if(!contract.currentShift&&promotionReadiness(root,id)?.ready)note('promote',promoteCareer(root,id));
    }
    if(policy==='creative'||(policy==='mixed'&&id===partner)){
      const actor=getActor(root,id),work=actor.createdWorks?.[0];
      if(!work)continue;
      if(work.location!=='inventory'){
        const stored=transactPainting(root,id,work.id,'store');if(note('store-art',stored))actor.createdWorks=stored.works;
      }else{
        const sold=transactPainting(root,id,work.id,'sell');
        if(!note('sell-art',sold))continue;
        const finance=recordFinanceChange(root,sold.shop,{kind:'art-sale',sourceId:work.id,actorId:id,atGameMinute:Math.floor(root.minutes),receiptId:'art:'+id+':'+work.id});
        assert.ok(finance.ok,finance.reason);actor.createdWorks=sold.works;root.shop=finance.shop;root.financialHistory=finance.financialHistory;p.sales++;
        assert.equal(transactPainting(root,id,work.id,'sell').ok,false,'duplicate work sale');p.negativeSales++;
      }
    }
  }
 }
 const launch=(id,action)=>{
   const actor=getActor(root,id);
   const ok=chooseResidentAction(root,action,automatic,id,action==='paint'?easel.instanceId:null,action==='paint'?PAINT_ACTIVITY_ID:null,action==='paint'?'painting.hills':null);
   if(ok){count(p.actions,action);p.decisions++;return true;}
   count(p.rejected,action);return false;
 };
 try{
  for(let t=0;t<days*1440/dt;t++){
   if(t%6===0)administration();
   for(const id of ids){
    const shift=root.careerSystem.byResident[id]?.currentShift;
    if(shift?.phase==='departing')arriveCareerPortal(root,id,root.minutes);
    if(shift?.phase==='returning')finishCareerReturn(root,id);
   }
   if(policy!=='no-intervention'&&!root.socialAction){
    if((policy==='social'||policy==='mixed')&&ids.every(id=>!getActor(root,id).action&&!residentUnavailableForHome(root,id))&&root.minutes>=(socialGoal??base.minutes)&&ids.every(id=>Math.min(...urgent.map(([key])=>getActor(root,id).needs[key]))>=40)){
     const a=getActor(root,lead),b=getActor(root,partner);
     const target=nearestWalkable({x:b.position.x+.4,z:b.position.z},root.world);
     if(findPath(a.position,target,root.world)&&startSocial(root,'talk',lead,target)){
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
     else if((policy==='creative'||(policy==='mixed'&&id===partner))&&(a.createdWorks?.length||0)<24&&a.needs.energy>=55&&a.needs.hunger>=55)launch(id,'paint');
    }
   }
   const walking=ids.map(id=>[id,getActor(root,id).action]).filter(([,a])=>a?.phase==='walking');
   const walkingSocial=root.socialAction?.phase==='walking'?root.socialAction:null;
   for(const id of ids){
    const a=getActor(root,id),phase=root.careerSystem.byResident[id]?.currentShift?.phase;
    count(p.minutesByAction,id+':'+(phase==='working'?'work':root.socialAction?'social':a.action?.id||'idle'),dt);
    const kind=phase==='working'?'work':phase&&['departing','returning','waiting'].includes(phase)?'work-transit-wait':a.action?.phase==='walking'||root.socialAction?.phase==='walking'?'travel':root.socialAction?'social':a.action?.id==='bed'?'sleep':['fridge','toilet','shower','wash','dining','cook'].includes(a.action?.id)?'care':['paint','hobby','music'].includes(a.action?.id)?'hobby':a.action?'other-leisure':'idle';
    count(p.timeClasses,id+':'+kind,dt);
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
   for(const e of root.financialHistory.entries){if(seen.has(e.id))continue;seen.add(e.id);delta+=e.delta;count(p.receipts,e.kind);count(p.cashByKind,e.kind,e.delta); }
   assert.equal(root.shop.credits,lastWallet+delta,'unreconciled wallet delta');lastWallet=root.shop.credits;
   if((t+1)%(1440/dt)===0){
    const day=(t+1)*dt/1440;
    for(const id of ids)assert.equal(Object.entries(p.timeClasses).filter(([k])=>k.startsWith(id+':')).reduce((n,[,v])=>n+v,0),day*1440,'time partition');
    p.daily.push({day,minutes:root.minutes,wallet:root.shop.credits,debt:householdBillView(root).totalDue,timeClasses:{...p.timeClasses},cashByKind:{...p.cashByKind},sales:p.sales,relationship:structuredClone(root.relationship),actors:ids.map(id=>{const a=getActor(root,id),c=root.careerSystem.byResident[id];return {id,needs:structuredClone(a.needs),skills:structuredClone(a.skills),works:a.createdWorks?.length||0,career:c?{level:c.level,workedShifts:c.workedShifts,missedShifts:c.missedShifts,performance:c.performance}:null};}),decisions:p.decisions,actions:{...p.actions},criticalNeedMinutes:{...p.criticalNeedMinutes},minutesByAction:{...p.minutesByAction},rejected:{...p.rejected},events:{...p.events}});
    const restored=loadHousehold(structuredClone(root));
    assert.equal(restored.shop.credits,root.shop.credits);assert.equal(restored.minutes,root.minutes);assert.deepEqual(restored.financialHistory,root.financialHistory);
    for(const snap of p.daily){
      assert.ok(snap.relationship.nextSocialAt<=snap.minutes+180,'future relationship state leaked into checkpoint');
      for(const view of Object.values(snap.relationship.views||{}))for(const entry of view.sentiments||[])assert.ok(entry.at<=snap.minutes,'future sentiment leaked into checkpoint');
    }
    // Observe roundtrip without replacing live ongoing routes/commands.
    flush();
   }
  }
  assert.equal(p.daily.length,30);p.status='PASS';console.log(block.date,policy,p.status,p.sales,p.daily[29].wallet,p.daily[29].debt);
 }catch(e){p.status='FAIL';p.error=e.stack||String(e);report.failures.push({policy,error:p.error});console.error(policy,p.error);}
 flush();return p;
}
for(const block of report.blocks)for(const policy of policies)run(block,policy);
const original=report.policies.find(p=>p.policy==='mixed'&&p.block===report.blocks[0]);
const replay=run(report.blocks[0],'mixed',true);
const {replay:ignoredA,...a}=original,{replay:ignoredB,...b}=replay;
try{
 assert.equal(original.status,'PASS');assert.equal(replay.status,'PASS');
 assert.deepEqual(a,b,'exact replay diverged');report.controls.replay='PASS';
 assert.ok(report.policies.some(p=>p.negativeSales>0),'sale control unexercised');report.controls.sale='PASS';
 assert.ok(report.policies.some(p=>p.negativeBills>0),'bill control unexercised');report.controls.bill='PASS';
}catch(e){report.failures.push({control:e.message});}
report.summary=Object.fromEntries(policies.map(policy=>{
 const rows=report.policies.filter(p=>p.policy===policy&&!p.replay&&p.status==='PASS').map(p=>p.daily.at(-1));
 const metrics={};
 for(const k of ['wallet','debt','sales','decisions']){const values=rows.map(r=>r[k]).sort((a,b)=>a-b);metrics[k]={n:values.length,min:values[0]??null,median:values.length?values[Math.floor(values.length/2)]:null,max:values.at(-1)??null};}
 return [policy,{metrics,missing:report.blocks.length-rows.length}];
}));
flush();assert.deepEqual(report.failures,[],'strategy diagnostics contain failures');
