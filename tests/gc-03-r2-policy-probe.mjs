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
import {READING_ACTIVITY_ID,READING_CONTENT_ID,HOBBY_SKILLS} from '../src/hobby-reading.js';
import {currentSkillLevel} from '../src/skills-engine.js';
import {readingStage,readingRouteId,arriveReadingJourney} from '../src/reading-journey.js';
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(process.env.GC_EXPECTED_SHA)assert.equal(sha,process.env.GC_EXPECTED_SHA);
const ids=['alex','mira'],days=14;
const dir='artifacts/gc-03-r2';mkdirSync(dir,{recursive:true});
const report={sha,model:'GC-03 R2 night-aware voluntary policy; common purchased easel/bookcase; canonical reading journey, modeled A* travel, trained career and voluntary social/creative policies; 1 minute ticks, 5 minute policy cadence, 30 minute admin, no real UI/traversal',policies:[],failures:[],controls:{},blocks:[{date:'2026-11-26',swap:false},{date:'2026-12-01',swap:false,heldOut:true}]};
const flush=()=>writeFileSync(dir+'/report.json',JSON.stringify(report,null,2)+'\n');
function fixture(date){const base=newHousehold(date);base.calendar.anchorConfirmed=true;
const placement=findMarketPlacement(base.world.furniture,base.shop,'easel.starter');assert.ok(placement);
const tx=buyMarketItem(base.world.furniture,base.shop,'easel.starter',placement);assert.ok(tx.ok,tx.reason);
base.world.furniture=tx.world;base.shop=tx.shop;
const easel=base.world.furniture.instances.find(i=>i.prefabId==='easel'&&i.location==='home');assert.ok(easel);
const shelfPlacement=findMarketPlacement(base.world.furniture,base.shop,'bookcase.starter');assert.ok(shelfPlacement,'bookcase placement missing');
const shelfTx=buyMarketItem(base.world.furniture,base.shop,'bookcase.starter',shelfPlacement);assert.ok(shelfTx.ok,shelfTx.reason);
base.world.furniture=shelfTx.world;base.shop=shelfTx.shop;
const shelf=base.world.furniture.instances.find(i=>i.prefabId==='bookcase'&&i.location==='home');assert.ok(shelf);
return {base,easel,shelf};}
const urgent=[['bladder','toilet',50],['hunger','fridge',55],['energy','bed',45],['hygiene','shower',55],['fun','sofa',50]];
const count=(map,key,n=1)=>map[key]=(map[key]||0)+n;
const variants=[{"name":"ordinary-social","policy":"social","dt":1,"arrival":5,"social":true},{"name":"career-trained-social","policy":"career","dt":1,"arrival":5,"train":true,"social":true},{"name":"creative-cap2-social","policy":"creative","dt":1,"arrival":5,"cap":2,"social":true},{"name":"night-career-social","policy":"career","dt":1,"arrival":5,"night":true,"social":true}];
function run(block,variant,replay=false){
 const {policy,dt,arrival,cap}=variant;
 const paintAdmissions={};const startedWalk=new WeakMap();
 const {base,easel,shelf}=fixture(block.date);
 const lead=block.swap?'mira':'alex',partner=block.swap?'alex':'mira';
 const p={block,variant,policy,replay,paintAdmissions,status:'OPEN',initial:{wallet:base.shop.credits,minutes:base.minutes,needs:ids.map(id=>structuredClone(getActor(base,id).needs))},daily:[],actions:{},minutesByAction:{},timeClasses:{},rejected:{},criticalNeedMinutes:{},decisions:0,receipts:{},cashByKind:{},events:{},travelFailures:0,sales:0,negativeSales:0,negativeBills:0,readingReturns:0,readingRoutes:{},sleepEpisodes:{},nightReturns:[]};report.policies.push(p);
 let root=structuredClone(base),lastWallet=root.shop.credits,seen=new Set(),socialGoal=null;
 const automatic=policy==='core-autonomy';
 root.autonomy.enabled=automatic;root.otherSim.autonomy.enabled=automatic;
 const jobs=policy==='career'?{[lead]:variant.night?'civic-service':'editorial',[partner]:'business-center'}:policy==='mixed'?{[lead]:'editorial'}:{};
 const nextApplication={};
 const note=(kind,result)=>{if(result?.ok){count(p.actions,kind);p.decisions++;}else count(p.rejected,kind+':'+(result?.reason||'unknown'));return result?.ok;};
 function administration(){
  if(policy==='no-intervention')return;
  const bill=householdBillView(root);
  if(bill.canPay){const r=payHouseholdBill(root);assert.ok(r.ok,r.reason);
    Object.assign(root,{shop:r.shop,financialHistory:r.financialHistory,householdBills:r.householdBills});
    note('pay-bill',r);
    if(root.shop.credits>=r.amount){
      const duplicate=recordFinanceChange(root,{...root.shop,credits:root.shop.credits-r.amount},{kind:'bill-payment',sourceId:r.entry.sourceId,receiptId:r.entry.id,atGameMinute:Math.round(root.minutes)});
      assert.equal(duplicate.reason,'duplicate-transaction','duplicate bill receipt accepted or invalid control');p.negativeBills++;
    }
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
   const ok=chooseResidentAction(root,action,automatic,id,action==='paint'?easel.instanceId:action==='hobby'?shelf.instanceId:null,action==='paint'?PAINT_ACTIVITY_ID:action==='hobby'?READING_ACTIVITY_ID:null,action==='paint'?'painting.hills':action==='hobby'?READING_CONTENT_ID:null);
   if(ok){count(p.actions,action);p.decisions++;if(action==='paint'){const k=id+':'+Math.floor((root.minutes-base.minutes)/1440);count(paintAdmissions,k);if(cap)assert.ok(paintAdmissions[k]<=cap,'policy cap exceeded');}return true;}
   count(p.rejected,action);return false;
 };
 try{
  for(let t=0;t<days*1440/dt;t++){
   if(t*dt%30===0)administration();
   for(const id of ids){
    const shift=root.careerSystem.byResident[id]?.currentShift;
    if(t*dt%5===0&&shift?.phase==='departing')arriveCareerPortal(root,id,root.minutes);
    if(t*dt%5===0&&shift?.phase==='returning'){finishCareerReturn(root,id);if(variant.night&&id===lead)p.nightReturns.push(root.minutes);}
   }
   if(t*dt%5===0&&policy!=='no-intervention'&&!root.socialAction){
    if(variant.social&&ids.every(id=>!getActor(root,id).action&&!residentUnavailableForHome(root,id))&&root.minutes>=(socialGoal??base.minutes)&&ids.every(id=>Math.min(...urgent.map(([key])=>getActor(root,id).needs[key]))>=40)){
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
     const hour=Math.floor(root.minutes%1440/60);
     const postNight=variant.night&&id===lead&&hour>=4&&hour<12&&p.nightReturns.length>0&&root.minutes-p.nightReturns.at(-1)<=480;
     if((hour>=21||hour<6||postNight)&&a.needs.energy<70&&!urgent.some(([k])=>k!=='energy'&&a.needs[k]<24)&&launch(id,'bed'))continue;
     const needs=urgent.filter(([k,,limit])=>a.needs[k]<limit).sort((x,y)=>a.needs[x[0]]/x[2]-a.needs[y[0]]/y[2]);
     if(needs.length){for(const [,action] of needs)if(launch(id,action))break;}
     else if(variant.train&&id===lead&&currentSkillLevel(a.skills,HOBBY_SKILLS,'literature')<10&&a.needs.energy>=55&&a.needs.hunger>=55)launch(id,'hobby');
     else if((policy==='creative'||(policy==='mixed'&&id===partner))&&(a.createdWorks?.length||0)<24&&a.needs.energy>=55&&a.needs.hunger>=55&&(!cap||(paintAdmissions[id+':'+Math.floor((root.minutes-base.minutes)/1440)]||0)<cap))launch(id,'paint');
    }
   }
   const walking=ids.map(id=>{const a=getActor(root,id).action;return [id,a,a?.id==='hobby'?readingRouteId(a):a?.id];}).filter(([,a,route])=>a?.phase==='walking'&&route);
   const returning=ids.filter(id=>readingStage(getActor(root,id).action)==='returning');
   const walkingSocial=root.socialAction?.phase==='walking'?root.socialAction:null;
   for(const [,action,route] of walking)if(startedWalk.get(action)?.route!==route)startedWalk.set(action,{route,at:root.minutes});
   if(walkingSocial&&!startedWalk.has(walkingSocial))startedWalk.set(walkingSocial,root.minutes);
   for(const id of ids){
    const a=getActor(root,id),phase=root.careerSystem.byResident[id]?.currentShift?.phase;
    count(p.minutesByAction,id+':'+(phase==='working'?'work':root.socialAction?'social':a.action?.id||'idle'),dt);
    const kind=phase==='working'?'work':phase&&['departing','returning','waiting'].includes(phase)?'work-transit-wait':(a.action?.phase==='walking'&&(a.action.id!=='hobby'||readingRouteId(a.action)))||root.socialAction?.phase==='walking'?'travel':root.socialAction?'social':a.action?.id==='bed'?'sleep':['fridge','toilet','shower','wash','dining','cook'].includes(a.action?.id)?'care':['paint','hobby','music'].includes(a.action?.id)?'hobby':a.action?'other-leisure':'idle';
    count(p.timeClasses,id+':'+kind,dt);
    for(const [k,v] of Object.entries(a.needs))if(typeof v==='number'&&v<20)count(p.criticalNeedMinutes,id+':'+k,dt);
   }
   const sleepBefore=ids.map(id=>[id,getActor(root,id).action]).filter(([,a])=>a?.id==='bed'&&a.phase==='using');
   const before=root.minutes,events=tickHousehold(root,dt)||[];
   for(const [id,action] of sleepBefore){const actor=getActor(root,id);if(actor.action?.id!=='bed'||actor.action.phase!=='using'){const phase=root.careerSystem.byResident[id]?.currentShift?.phase;const result=actor.needs.energy>=99.9?'full':phase&&['departing','working','waiting'].includes(phase)?'work-interrupt':action.elapsed>=539?'timeout':'other';(p.sleepEpisodes[id]??=[]).push({at:root.minutes,elapsed:action.elapsed,energy:actor.needs.energy,result});}}
   assert.equal(root.minutes,before+dt,'clock did not advance');
   for(const e of events)count(p.events,e.type||'unknown');
   for(const id of returning)if(!getActor(root,id).action)p.readingReturns++;
   for(const [id,action,route] of walking){
    const a=getActor(root,id);if(root.minutes-startedWalk.get(action).at<arrival)continue;if(a.action!==action||a.action.phase!=='walking'||residentUnavailableForHome(root,id))continue;
    if(action.id==='hobby'&&readingRouteId(action)!==route)continue;
    const goal=action.id==='hobby'&&readingStage(action)==='toSeat'?furnitureActionApproach(root.world,'sofa',action.readingSeatInstanceId):action.id==='bed'?bedDestinationFor(root,id,action.targetInstanceId):
      action.id==='tv'&&action.watchSeatInstanceId?furnitureActionApproach(root.world,'sofa',action.watchSeatInstanceId):
      furnitureActionApproach(root.world,action.id,action.targetInstanceId);
    if(!goal||!findPath(a.position,goal,root.world)){p.travelFailures++;continue;}
    a.position={x:goal.x,z:goal.z};if(action.id==='hobby'){assert.ok(arriveReadingJourney(action));count(p.readingRoutes,route);}else arrive(a);
   }
   if(walkingSocial&&root.socialAction===walkingSocial&&root.minutes-startedWalk.get(walkingSocial)>=arrival){
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
  if(variant.night)assert.ok(p.nightReturns.length>0,'night shift not exercised');assert.equal(p.daily.length,days);p.status='PASS';console.log(block.date,policy,p.status,p.sales,p.daily.at(-1).wallet,p.daily.at(-1).debt);
 }catch(e){p.status='FAIL';p.error=e.stack||String(e);report.failures.push({policy,error:p.error});console.error(policy,p.error);}
 flush();return p;
}
for(const block of report.blocks)for(const variant of variants)run(block,variant);
const original=report.policies.find(p=>p.variant.name==='career-trained-social'&&p.block===report.blocks[0]);
const replay=run(report.blocks[0],variants.find(v=>v.name==='career-trained-social'),true);
const {replay:ignoredA,...a}=original,{replay:ignoredB,...b}=replay;
try{
 assert.equal(original.status,'PASS');assert.equal(replay.status,'PASS');
 assert.deepEqual(a,b,'exact replay diverged');report.controls.replay='PASS';
 assert.ok(report.policies.some(p=>p.negativeSales>0),'sale control unexercised');report.controls.sale='PASS';
 assert.ok(report.policies.some(p=>p.negativeBills>0),'bill control unexercised');report.controls.bill='PASS';
 for(const row of report.policies.filter(p=>p.variant.cap)){assert.ok(row.sales>0,'capped policy unexercised');assert.ok(Object.values(row.paintAdmissions).every(n=>n<=row.variant.cap),'cap exceeded');}report.controls.cap='PASS';
 for(const row of report.policies.filter(p=>p.variant.train)){const lead=row.block.swap?'mira':'alex';assert.ok(row.readingReturns>0,'reading return unexercised');assert.ok(['hobby:toShelf','hobby:toSeat','hobby:returnShelf'].every(k=>row.readingRoutes[k]>0),'missing journey stage');assert.ok((row.daily.at(-1).actors.find(a=>a.id===lead).skills.xpById.literature||0)>0,'training unexercised');}report.controls.reading='PASS';
 for(const row of report.policies.filter(p=>p.variant.social))assert.ok(row.actions.talk>0,'social policy unexercised');report.controls.social='PASS';
}catch(e){report.failures.push({control:e.message});}
for(const row of report.policies){row.energySummary=ids.map(id=>({id,sleepHoursPerDay:(row.timeClasses[id+':sleep']||0)/60/days,criticalEnergyMinutesPerDay:(row.criticalNeedMinutes[id+':energy']||0)/days,careMinutesPerDay:(row.timeClasses[id+':care']||0)/days,leisureMinutesPerDay:((row.timeClasses[id+':hobby']||0)+(row.timeClasses[id+':other-leisure']||0)+(row.timeClasses[id+':social']||0))/days,episodes:row.sleepEpisodes[id]||[]}));}
report.summary=Object.fromEntries(variants.map(variant=>{
 const rows=report.policies.filter(p=>p.variant.name===variant.name&&!p.replay&&p.status==='PASS').map(p=>p.daily.at(-1));
 const metrics={};
 for(const k of ['wallet','debt','sales','decisions']){const values=rows.map(r=>r[k]).sort((a,b)=>a-b);metrics[k]={n:values.length,min:values[0]??null,median:values.length?values[Math.floor(values.length/2)]:null,max:values.at(-1)??null};}
 return [variant.name,{metrics,missing:report.blocks.length-rows.length}];
}));
flush();assert.deepEqual(report.failures,[],'strategy diagnostics contain failures');
