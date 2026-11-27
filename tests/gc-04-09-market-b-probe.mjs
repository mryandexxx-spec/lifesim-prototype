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
import {diningSeatApproach} from '../src/dining.js';
import {proposeKitchenRestock} from '../src/kitchen-market.js';
import {proposeReadyMealPurchase} from '../src/ready-food.js';
import {canCookRecipe} from '../src/kitchen.js';
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
const ids=['alex','mira'],days=30;
const MATERIAL=20, UNIT=1440, DAILY=(14+18)*8, CAP=DAILY*UNIT, WEEK=7*UNIT;
function demandAt(m,at){
 const t=Math.floor(at);
 assert.ok(Number.isSafeInteger(t)&&t>=m.at,'invalid/reversed market clock');
 return {at:t,units:Math.min(CAP,m.units+(t-m.at)*DAILY)};
}
function quote(m,at,base){const next=demandAt(m,at);return {amount:Math.min(base,Math.max(1,Math.floor(next.units/UNIT))),next};}
function settle(q){return {...q.next,units:Math.max(0,q.next.units-q.amount*UNIT)};}
function windowAt(at,start){return Math.floor((at-start)/WEEK);}
function eligibleOrder(order,work,at,start){
 return !!order&&!order.fulfilled&&order.window===windowAt(at,start)&&work.ownerId===order.owner&&work.contentId===order.subject&&work.createdAt>=order.acceptedAt;
}
function materials(root,id){
 if(root.shop.credits<MATERIAL)return {ok:false,reason:'insufficient-credits'};
 return recordFinanceChange(root,{...root.shop,credits:root.shop.credits-MATERIAL},{kind:'purchase',sourceId:'painting.materials',actorId:id,atGameMinute:Math.floor(root.minutes)});
}

const dir='artifacts/gc-04-09-market-b';mkdirSync(dir,{recursive:true});
const report={sha,model:'GC04/09 market B spot demand plus voluntary commissions and informed sale choice, test-only sidecar; common endowed FOOD-R1 kitchen/dining fixture and purchased easel/bookcase; actual cook/dining/stock/ledger domain, modeled A* arrival; 1 minute ticks, 5 minute policy cadence, 30 minute admin, no real UI/traversal',policies:[],failures:[],controls:{},blocks:[{date:'2026-11-26',swap:false},{date:'2026-12-01',swap:true,heldOut:true}]};
const flush=()=>writeFileSync(dir+'/report.json',JSON.stringify(report,null,2)+'\n');
function fixture(date){const base=newHousehold(date);base.calendar.anchorConfirmed=true;
base.world.furniture.instances.push(
 {instanceId:'food-table-904',prefabId:'diningtable',itemDefinitionId:'diningtable.farm',x:6.8,z:-1.5,yaw:0,location:'home'},
 {instanceId:'food-chair-905',prefabId:'chair',itemDefinitionId:'chair.loft',x:6.8,z:.75,yaw:0,location:'home'},
 {instanceId:'food-prep-901',prefabId:'prep',itemDefinitionId:'prep.oak',x:9.2,z:1.5,yaw:0,location:'home'},
 {instanceId:'food-stove-902',prefabId:'stove',itemDefinitionId:'stove.copper',x:11.3,z:1.5,yaw:0,location:'home'}
);
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
const variants=[
 {name:'no-intervention',policy:'no-intervention',food:'snack'},
 {name:'limited-autonomy',policy:'core-autonomy',food:'snack'},
 {name:'care-social',policy:'care-social',food:'home',social:true},
 {name:'single-career-social',policy:'single-career',food:'home',train:true,social:true},
 {name:'two-career-social',policy:'career',food:'home',train:true,social:true},
 {name:'mixed-career-art-social',policy:'mixed',food:'home',train:true,cap:1,social:true},
 {name:'creative-cap1-social',policy:'creative',food:'home',cap:1,social:true},
 {name:'creative-uncapped-social',policy:'creative',food:'home',social:true}
].map(v=>({...v,dt:1,arrival:5}));
for(const v of variants.filter(v=>['mixed','creative'].includes(v.policy)))variants.push({...v,name:v.name+'-market',market:true});
const routeOf=a=>a?.id==='hobby'?readingRouteId(a):a?.id==='cook'?'cook:'+a.cookStage:a?.id==='dining'?'dining:'+a.diningStage:a?.id;
const totalPrepared=h=>h.kitchen.prepared.reduce((n,x)=>n+x.portions,0);
const totalStock=h=>totalPrepared(h)+h.kitchen.deliveries.length;
function run(block,variant,replay=false){
 const {policy,dt,arrival,cap}=variant;
 const paintAdmissions={},orders={};let market;const startedWalk=new WeakMap();
 const {base,easel,shelf}=fixture(block.date);market={at:Math.floor(base.minutes),units:CAP};
 const lead=block.swap?'mira':'alex',partner=block.swap?'alex':'mira';
 const p={block,variant,policy,replay,paintAdmissions,status:'OPEN',initial:{wallet:base.shop.credits,minutes:base.minutes,needs:ids.map(id=>structuredClone(getActor(base,id).needs))},daily:[],actions:{},minutesByAction:{},timeClasses:{},rejected:{},criticalNeedMinutes:{},decisions:0,receipts:{},cashByKind:{},events:{},travelFailures:0,sales:0,negativeSales:0,negativeBills:0,readingReturns:0,readingRoutes:{},artReceipts:[],food:{purchases:0,readyOrders:0,restocks:0,batches:0,servings:0,delivered:0,escapeSnacks:0,cost:0,routes:{}}};report.policies.push(p);
 p.materialCost=0;p.marketOffers=[];p.orderEvents=[];p.declinedOffers=0;let root=structuredClone(base),lastWallet=root.shop.credits,seen=new Set(),socialGoal=null;p.socialCompletions=0;
 const automatic=policy==='core-autonomy';
 root.autonomy.enabled=automatic;root.otherSim.autonomy.enabled=automatic;
 const jobs=policy==='career'?{[lead]:'editorial',[partner]:'business-center'}:['mixed','single-career'].includes(policy)?{[lead]:'editorial'}:{};
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
      const actor=getActor(root,id),work=(variant.market?actor.createdWorks?.find(w=>eligibleOrder(orders[id],w,root.minutes,base.minutes)):null)||actor.createdWorks?.[0];
      if(!work)continue;
      if(work.location!=='inventory'){
        const stored=transactPainting(root,id,work.id,'store');if(note('store-art',stored))actor.createdWorks=stored.works;
      }else{
        const sold=transactPainting(root,id,work.id,'sell');
        if(!sold.ok){note('sell-art',sold);continue;}
        let pendingMarket=null,fulfilled=null;
        if(variant.market){
          const order=orders[id];
          if(eligibleOrder(order,work,root.minutes,base.minutes)){
            fulfilled=order;
          }else{
            const q=quote(market,root.minutes,sold.amount);
            p.marketOffers.push({at:root.minutes,base:sold.amount,offer:q.amount,owner:id});
            if(q.amount<MATERIAL){p.declinedOffers++;count(p.rejected,'sell-art:below-material-cost');continue;}
            sold.amount=q.amount;sold.shop={...root.shop,credits:root.shop.credits+q.amount};
            pendingMarket=settle(q);
          }
        }
        note('sell-art',sold);
        const finance=recordFinanceChange(root,sold.shop,{kind:'art-sale',sourceId:work.id,actorId:id,atGameMinute:Math.floor(root.minutes),receiptId:'art:'+id+':'+work.id});
        assert.ok(finance.ok,finance.reason);
        if(pendingMarket)market=pendingMarket;
        if(fulfilled){assert.ok(!fulfilled.fulfilled);fulfilled.fulfilled=true;p.orderEvents.push({kind:'fulfilled',owner:id,window:fulfilled.window,workId:work.id,amount:sold.amount,at:root.minutes});}
        actor.createdWorks=sold.works;root.shop=finance.shop;root.financialHistory=finance.financialHistory;p.sales++;p.artReceipts.push({id:work.id,owner:id,quality:work.quality,at:root.minutes,amount:sold.amount});
        assert.equal(transactPainting(root,id,work.id,'sell').ok,false,'duplicate work sale');p.negativeSales++;
      }
    }
  }
 }
 function launchFood(id,action,recipe=null){
   const ok=chooseResidentAction(root,action,false,id,action==='cook'?'food-stove-902':'food-table-904',null,null,null,null,recipe);
   return note(action,{ok});
 }
 function purchase(tx,kind){
   if(!note(kind,tx))return false;
   Object.assign(root,{shop:tx.shop,kitchen:tx.kitchen,financialHistory:tx.financialHistory});
   p.food.purchases++;p.food.cost-=tx.entry.delta;
   if(kind==='ready-order')p.food.readyOrders++;else p.food.restocks++;
   return true;
 }
 function chooseFood(id){
   const actor=getActor(root,id),mode=variant.food;
   if(mode==='snack')return launch(id,'fridge');
   const recipe=mode==='home'?'cook.soup':'ready.sunny-grains';
   if(root.kitchen.prepared.some(x=>x.recipeId===recipe&&x.portions>0)){
      if(launchFood(id,'dining',recipe))return true;
   }else if(mode==='home'){
      if(!ids.some(other=>getActor(root,other).action?.id==='cook')){
        if(root.kitchen.pantry.vegetables<2)purchase(proposeKitchenRestock(root,'vegetables',id),'restock');
        if(canCookRecipe(root.kitchen,recipe,0)&&launchFood(id,'cook',recipe))return true;
      }
   }else if(root.kitchen.deliveries.length===0){
      if(purchase(proposeReadyMealPurchase(root,recipe,mode,id),'ready-order')&&mode==='fridge'&&launchFood(id,'dining',recipe))return true;
   }
   if(actor.needs.hunger<25&&launch(id,'fridge')){p.food.escapeSnacks++;return true;}
   return false;
 }
 const launch=(id,action)=>{
   const actor=getActor(root,id);
   const paid=variant.market&&action==='paint';
   const material=paid?materials(root,id):null;
   if(paid&&!material.ok){count(p.rejected,'paint:'+material.reason);return false;}
   const ok=chooseResidentAction(root,action,automatic,id,action==='paint'?easel.instanceId:action==='hobby'?shelf.instanceId:null,action==='paint'?PAINT_ACTIVITY_ID:action==='hobby'?READING_ACTIVITY_ID:null,action==='paint'?'painting.hills':action==='hobby'?READING_CONTENT_ID:null);
   if(ok){if(paid){root.shop=material.shop;root.financialHistory=material.financialHistory;p.materialCost+=MATERIAL;const window=windowAt(root.minutes,base.minutes);if(orders[id]?.window!==window){orders[id]={owner:id,subject:'painting.hills',window,acceptedAt:root.minutes,fulfilled:false};p.orderEvents.push({kind:'accepted',owner:id,window,at:root.minutes});}}
   count(p.actions,action);p.decisions++;if(action==='paint'){const k=id+':'+Math.floor((root.minutes-base.minutes)/1440);count(paintAdmissions,k);if(cap)assert.ok(paintAdmissions[k]<=cap,'policy cap exceeded');}return true;}
   count(p.rejected,action);return false;
 };
 try{
  for(let t=0;t<days*1440/dt;t++){
   if(t*dt%30===0)administration();
   for(const id of ids){
    const shift=root.careerSystem.byResident[id]?.currentShift;
    if(t*dt%5===0&&shift?.phase==='departing')arriveCareerPortal(root,id,root.minutes);
    if(t*dt%5===0&&shift?.phase==='returning')finishCareerReturn(root,id);
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
     const needs=urgent.filter(([k,,limit])=>a.needs[k]<limit).sort((x,y)=>a.needs[x[0]]/x[2]-a.needs[y[0]]/y[2]);
     if(needs.length){for(const [key,action] of needs)if(key==='hunger'?chooseFood(id):launch(id,action))break;}
     else if(root.kitchen.dirtyDishes>=6&&launch(id,'wash')){}
     else if(variant.train&&id===lead&&currentSkillLevel(a.skills,HOBBY_SKILLS,'literature')<10&&a.needs.energy>=55&&a.needs.hunger>=55)launch(id,'hobby');
     else if((policy==='creative'||(policy==='mixed'&&id===partner))&&(a.createdWorks?.length||0)<24&&a.needs.energy>=55&&a.needs.hunger>=55&&(!cap||(paintAdmissions[id+':'+Math.floor((root.minutes-base.minutes)/1440)]||0)<cap))launch(id,'paint');
    }
   }
   const walking=ids.map(id=>{const a=getActor(root,id).action;return [id,a,routeOf(a)];}).filter(([,a,route])=>a?.phase==='walking'&&route);
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
   const beforeStock=totalStock(root),beforeVegetables=root.kitchen.pantry.vegetables,beforePending=root.kitchen.deliveries.length;
   const seated=ids.filter(id=>{const a=getActor(root,id).action;return a?.id==='dining'&&a.phase==='using'&&a.diningStage==='eating'&&!a.portionTaken&&a.selectedRecipeId;}).length;
   const before=root.minutes, priorSocialAt=root.relationship.nextSocialAt, events=tickHousehold(root,dt)||[];
   if(root.relationship.nextSocialAt>priorSocialAt)p.socialCompletions++;
   const newBatches=(beforeVegetables-root.kitchen.pantry.vegetables)/2;
   assert.ok(Number.isInteger(newBatches)&&newBatches>=0,'unexpected pantry consumption');
   const ate=beforeStock+newBatches*3-totalStock(root);
   assert.ok(Number.isInteger(ate)&&ate>=0&&ate<=seated,'stock consumption not seated');
   p.food.batches+=newBatches;p.food.servings+=ate;p.food.delivered+=beforePending-root.kitchen.deliveries.length;
   assert.equal(totalStock(root),p.food.readyOrders+3*p.food.batches-p.food.servings,'meal stock conservation');
   assert.equal(root.minutes,before+dt,'clock did not advance');
   for(const e of events)count(p.events,e.type||'unknown');
   for(const id of returning)if(!getActor(root,id).action)p.readingReturns++;
   for(const [id,action,route] of walking){
    const a=getActor(root,id);if(root.minutes-startedWalk.get(action).at<arrival)continue;if(a.action!==action||a.action.phase!=='walking'||residentUnavailableForHome(root,id))continue;
    if(routeOf(action)!==route)continue;
    const goal=action.id==='cook'?(['toFridge','toFridgeStore'].includes(action.cookStage)?furnitureActionApproach(root.world,'fridge'):action.cookStage==='toPrep'?furnitureActionApproach(root.world,'prep',action.prepInstanceId):furnitureActionApproach(root.world,'cook',action.targetInstanceId)):action.id==='dining'?(action.diningStage==='toFridge'?furnitureActionApproach(root.world,'fridge'):diningSeatApproach(root.world,action.targetInstanceId,action.diningSeatInstanceId)):action.id==='hobby'&&readingStage(action)==='toSeat'?furnitureActionApproach(root.world,'sofa',action.readingSeatInstanceId):action.id==='bed'?bedDestinationFor(root,id,action.targetInstanceId):
      action.id==='tv'&&action.watchSeatInstanceId?furnitureActionApproach(root.world,'sofa',action.watchSeatInstanceId):
      furnitureActionApproach(root.world,action.id,action.targetInstanceId);
    if(!goal||!findPath(a.position,goal,root.world)){p.travelFailures++;continue;}
    a.position={x:goal.x,z:goal.z};if(action.id==='hobby'){assert.ok(arriveReadingJourney(action));count(p.readingRoutes,route);}else {arrive(a);if(action.id==='cook'){action.cookStage={toFridge:'taking',toPrep:'preparing',toStove:'cooking',toFridgeStore:'storing'}[action.cookStage];assert.ok(action.cookStage);count(p.food.routes,route);}else if(action.id==='dining'){action.diningStage={toFridge:'taking',toSeat:'eating'}[action.diningStage];assert.ok(action.diningStage);count(p.food.routes,route);}}
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
    p.daily.push({food:structuredClone(p.food),materialCost:p.materialCost,market:variant.market?structuredClone(market):null,orders:variant.market?structuredClone(orders):null,declinedOffers:p.declinedOffers,fulfilledOrders:p.orderEvents.filter(e=>e.kind==='fulfilled').length,stock:totalStock(root),day,minutes:root.minutes,wallet:root.shop.credits,debt:householdBillView(root).totalDue,timeClasses:{...p.timeClasses},cashByKind:{...p.cashByKind},sales:p.sales,relationship:structuredClone(root.relationship),actors:ids.map(id=>{const a=getActor(root,id),c=root.careerSystem.byResident[id];return {id,needs:structuredClone(a.needs),skills:structuredClone(a.skills),works:a.createdWorks?.length||0,career:c?{level:c.level,workedShifts:c.workedShifts,missedShifts:c.missedShifts,performance:c.performance}:null};}),socialCompletions:p.socialCompletions,decisions:p.decisions,actions:{...p.actions},criticalNeedMinutes:{...p.criticalNeedMinutes},minutesByAction:{...p.minutesByAction},rejected:{...p.rejected},events:{...p.events}});
    const restored=loadHousehold(structuredClone(root));
    assert.equal(restored.shop.credits,root.shop.credits);assert.equal(restored.minutes,root.minutes);assert.deepEqual(restored.financialHistory,root.financialHistory);assert.equal(totalStock(restored),totalStock(root));assert.equal(restored.kitchen.pantry.vegetables,root.kitchen.pantry.vegetables);assert.equal(p.food.cost+p.materialCost+(p.cashByKind.purchase||0),0,'purchase ledger reconciliation');assert.deepEqual(JSON.parse(JSON.stringify({market,orders})),{market,orders});
    for(const snap of p.daily){
      assert.ok(snap.relationship.nextSocialAt<=snap.minutes+180,'future relationship state leaked into checkpoint');
      for(const view of Object.values(snap.relationship.views||{}))for(const entry of view.sentiments||[])assert.ok(entry.at<=snap.minutes,'future sentiment leaked into checkpoint');
    }
    // Observe roundtrip without replacing live ongoing routes/commands.
    if(day===7||day===30||day===90)flush();
   }
  }
  assert.equal(p.daily.length,days);p.status='PASS';console.log(block.date,policy,p.status,p.sales,p.daily[days-1].wallet,p.daily[days-1].debt);
 }catch(e){p.status='FAIL';p.error=e.stack||String(e);report.failures.push({policy,error:p.error});console.error(policy,p.error);}
 flush();return p;
}
for(const block of report.blocks)for(const variant of variants)run(block,variant);
const original=report.policies.find(p=>p.variant.name==='mixed-career-art-social'&&p.block===report.blocks[0]);
const replay=run(report.blocks[0],variants.find(v=>v.name==='mixed-career-art-social'),true);
const {replay:ignoredA,...a}=original,{replay:ignoredB,...b}=replay;
try{
 assert.equal(original.status,'PASS');assert.equal(replay.status,'PASS');
 assert.deepEqual(a,b,'exact replay diverged');report.controls.replay='PASS';
 const cv=variants.find(v=>v.name==='mixed-career-art-social-market');
 const co=report.policies.find(p=>p.variant===cv&&p.block===report.blocks[0]);
 const cr=run(report.blocks[0],cv,true);
 const {replay:ci,...ca}=co,{replay:cj,...cb}=cr;
 assert.equal(cr.status,'PASS');assert.deepEqual(ca,cb,'market replay diverged');report.controls.marketReplay='PASS';
 const m={at:480,units:CAP};const q=quote(m,480,325);
 assert.equal(q.amount,DAILY);assert.deepEqual(q,quote(m,480,325));assert.equal(settle(q).units,0);
 assert.equal(quote(settle(q),480,325).amount,1);assert.equal(demandAt(m,480+100000).units,CAP);
 assert.throws(()=>demandAt(m,479));const poorArt=newHousehold('2026-11-26');poorArt.shop.credits=0;assert.equal(materials(poorArt,'alex').reason,'insufficient-credits');
 for(const row of report.policies.filter(p=>p.variant.market)){assert.ok(row.materialCost>0&&row.sales>0);assert.ok(row.marketOffers.every(o=>o.offer>=1&&o.offer<=o.base));}
 const ord={owner:'alex',subject:'painting.hills',window:0,acceptedAt:500,fulfilled:false};
 const w={ownerId:'alex',contentId:'painting.hills',createdAt:501};
 assert.ok(eligibleOrder(ord,w,501,480));assert.ok(!eligibleOrder(ord,{...w,createdAt:499},501,480));
 assert.ok(!eligibleOrder(ord,{...w,ownerId:'mira'},501,480));assert.ok(!eligibleOrder(ord,{...w,contentId:'painting.city'},501,480));
 assert.ok(!eligibleOrder({...ord,fulfilled:true},w,501,480));assert.ok(!eligibleOrder(ord,w,480+WEEK,480));
 for(const row of report.policies.filter(p=>p.variant.market)){
   const fulfilled=row.orderEvents.filter(e=>e.kind==='fulfilled');
   assert.ok(fulfilled.length>0,'commission unexercised');
   assert.equal(new Set(fulfilled.map(e=>e.owner+':'+e.window)).size,fulfilled.length,'duplicate order');
   assert.equal(new Set(fulfilled.map(e=>e.workId)).size,fulfilled.length,'duplicate work');
   assert.ok(fulfilled.every(e=>row.orderEvents.some(a=>a.kind==='accepted'&&a.owner===e.owner&&a.window===e.window&&a.at<=e.at)));
 }
 assert.ok(report.policies.some(p=>p.variant.market&&p.declinedOffers>0),'decline unexercised');
 report.controls.market='PASS';report.controls.orders='PASS';
 assert.ok(report.policies.some(p=>p.negativeSales>0),'sale control unexercised');report.controls.sale='PASS';
 assert.ok(report.policies.some(p=>p.negativeBills>0),'bill control unexercised');report.controls.bill='PASS';
 for(const row of report.policies.filter(p=>p.variant.cap)){assert.ok(row.sales>0,'capped policy unexercised');assert.ok(Object.values(row.paintAdmissions).every(n=>n<=row.variant.cap),'cap exceeded');}report.controls.cap='PASS';
 for(const row of report.policies.filter(p=>p.variant.train)){const lead=row.block.swap?'mira':'alex';assert.ok(row.readingReturns>0,'reading return unexercised');assert.ok(['hobby:toShelf','hobby:toSeat','hobby:returnShelf'].every(k=>row.readingRoutes[k]>0),'missing journey stage');assert.ok((row.daily.at(-1).actors.find(a=>a.id===lead).skills.xpById.literature||0)>0,'training unexercised');}report.controls.reading='PASS';
 for(const row of report.policies.filter(p=>p.variant.social))assert.ok(row.actions.talk>0&&row.socialCompletions>0,'social policy unexercised');report.controls.social='PASS';
 for(const row of report.policies.filter(p=>p.variant.food!=='snack')){assert.ok(row.food.servings>0,row.variant.name+' no servings');assert.ok(row.food.routes['dining:toFridge']>0&&row.food.routes['dining:toSeat']>0,'missing dining stages');if(row.variant.food==='home'){assert.ok(row.food.batches>0&&row.food.restocks>0,'no cooked batches/restock');for(const s of ['toFridge','toPrep','toStove','toFridgeStore'])assert.ok(row.food.routes['cook:'+s]>0,'missing cook stage '+s);}else assert.ok(row.food.readyOrders>0&&row.food.cost>0,'no paid order');if(row.variant.food==='phone')assert.ok(row.food.delivered>0,'no delivery');} report.controls.food='PASS';
 const poor=newHousehold('2026-11-26');poor.shop.credits=0;assert.equal(proposeReadyMealPurchase(poor,'ready.sunny-grains','fridge','alex').reason,'insufficient-credits');assert.equal(proposeKitchenRestock(poor,'vegetables','alex').reason,'insufficient-credits');report.controls.poor='PASS';
}catch(e){report.failures.push({control:e.message});}
report.summary=Object.fromEntries(variants.map(variant=>{
 const rows=report.policies.filter(p=>p.variant.name===variant.name&&!p.replay&&p.status==='PASS').map(p=>p.daily.at(-1));
 const metrics={};
 for(const k of ['wallet','debt','sales','decisions']){const values=rows.map(r=>r[k]).sort((a,b)=>a-b);metrics[k]={n:values.length,min:values[0]??null,median:values.length?values[Math.floor(values.length/2)]:null,max:values.at(-1)??null};}
 return [variant.name,{metrics,missing:report.blocks.length-rows.length}];
}));
report.checkpoints=[];
for(const row of report.policies.filter(p=>p.status==='PASS'&&!p.replay)){
 for(const day of [7,30]){
  const d=row.daily[day-1], net=d.wallet-d.debt-row.initial.wallet;
  const critical=Object.values(d.criticalNeedMinutes).reduce((a,b)=>a+b,0);
  const missed=d.actors.reduce((a,b)=>a+(b.career?.missedShifts||0),0);
  report.checkpoints.push({block:row.block.date,variant:row.variant.name,day,net,wallet:d.wallet,debt:d.debt,critical,missed,travelFailures:day===30?row.travelFailures:null,sales:d.sales,affinity:d.relationship.affinity,talkStarts:d.actions.talk||0,socialCompletions:d.socialCompletions,decisions:d.decisions,career:d.actors.map(a=>({id:a.id,career:a.career,skills:a.skills})),timeClasses:d.timeClasses,needs:d.actors.map(a=>({id:a.id,needs:a.needs})),cashByKind:d.cashByKind,foodCost:d.food.cost,materialCost:d.materialCost,declinedOffers:d.declinedOffers,fulfilledOrders:d.fulfilledOrders,viableScreen:day===30?d.debt===0&&d.wallet>=row.initial.wallet&&missed===0&&row.travelFailures===0:null});
 }
}
try{
 assert.equal(report.policies.length,24);
 assert.equal(report.checkpoints.length,44);
 for(const d of report.checkpoints.filter(d=>d.variant==='no-intervention'&&d.day===30))assert.ok(d.critical>0||d.debt>0,'no intervention negative control did not discriminate');
 report.controls.noIntervention='PASS';
 for(const d of report.checkpoints.filter(d=>d.variant==='mixed-career-art-social'&&d.day===30)){assert.ok(d.career.some(x=>x.career?.workedShifts>0)&&d.sales>0&&d.socialCompletions>0,'mixed outcomes not exercised');}
 report.controls.mixed='PASS';
}catch(e){report.failures.push({control:e.message});}
report.balance=[];
for(const block of report.blocks)for(const day of [7,30]){
 const find=name=>report.checkpoints.find(d=>d.block===block.date&&d.day===day&&d.variant===name);
 const career=find('two-career-social'),uncapped=find('creative-uncapped-social-market'),mixed=find('mixed-career-art-social-market'),creative=find('creative-cap1-social-market');
 if(!career||!uncapped||!mixed||!creative)continue;
 report.balance.push({block:block.date,day,careerNet:career.net,uncappedNet:uncapped.net,mixedNet:mixed.net,creativeNet:creative.net,exploitSignal:career.net>0?uncapped.net<=2*career.net:null,moderateViability:day===30?mixed.viableScreen&&creative.viableScreen:null});
}
console.log('MARKET BALANCE',JSON.stringify(report.balance));
flush();assert.deepEqual(report.failures,[],'strategy diagnostics contain failures');
