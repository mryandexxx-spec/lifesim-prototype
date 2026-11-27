/** Comparative bounded headless policy probe. Not a browser playthrough.
 * Uses canonical decisions/ticks; test-only movement adapter verifies A* then
 * advances to arrival after a five-minute tick. Work portals are modelled.
 * Same starting household/date/easel/budget for all policies.
 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {newHousehold,getActor,tickHousehold,chooseResidentAction,bedDestinationFor,residentAutonomousChoice,loadHousehold,enableArtMarketPilot} from '../src/household.js';
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
import {ART_MARKET_PILOT,artAdmissionQuote,quoteArtSale,projectArtSale} from '../src/art-market.js';
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
const MATERIAL=ART_MARKET_PILOT.materials;
const dir='artifacts/gc-04-09-food-b';mkdirSync(dir,{recursive:true});
const report={sha,model:'GC04/09 FOOD B candidate timed taste; current canonical household/art-market domain; no changed prices or delivery mechanics; common endowed FOOD-R1 kitchen/dining fixture and purchased easel/bookcase; actual cook/dining/stock/ledger domain, modeled A* arrival; 1 minute ticks, 5 minute policy cadence, 30 minute admin, no real UI/traversal',policies:[],failures:[],controls:{},blocks:[{date:'2026-11-26',swap:false},{date:'2026-12-01',swap:true,heldOut:true}]};
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
 {name:'creative-cap1-home',policy:'creative',food:'home',cap:1,social:true},
 ...['career','mixed'].flatMap(policy=>['snack','home','fridge','phone','fridge-premium','phone-premium'].map(food=>({
   name:policy+'-'+food,policy,food,train:true,social:true,...(policy==='mixed'?{cap:1}:{}),
 })))
].map(v=>({...v,market:true,dt:1,arrival:5}));
const routeOf=a=>a?.id==='hobby'?readingRouteId(a):a?.id==='cook'?'cook:'+a.cookStage:a?.id==='dining'?'dining:'+a.diningStage:a?.id;
const totalPrepared=h=>h.kitchen.prepared.reduce((n,x)=>n+x.portions,0);
const totalStock=h=>totalPrepared(h)+h.kitchen.deliveries.length;
function run(block,variant,replay=false){
 const {policy,dt,arrival,cap}=variant;
 const paintAdmissions={};const startedWalk=new WeakMap();
 const {base,easel,shelf}=fixture(block.date);if(variant.market)assert.ok(enableArtMarketPilot(base));
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
      const actor=getActor(root,id),order=root.artMarket?.byResident[id]?.order,work=(variant.market&&order?.status==='ready'?actor.createdWorks?.find(w=>w.id===order.workId):null)||actor.createdWorks?.[0];
      if(!work)continue;
      if(work.location!=='inventory'){
        const stored=transactPainting(root,id,work.id,'store');if(note('store-art',stored))actor.createdWorks=stored.works;
      }else{
        let sold;
        if(variant.market){
          const q=quoteArtSale(root,id,work.id);
          p.marketOffers.push({at:root.minutes,base:q.base??null,offer:q.amount??0,owner:id,kind:q.kind??null,reason:q.reason??null});
          if(!q.ok||q.amount<MATERIAL){p.declinedOffers++;count(p.rejected,'sell-art:'+(q.reason||'below-material-cost'));continue;}
          sold=projectArtSale(root,id,work.id,q);assert.ok(sold.ok,sold.reason);
          if(q.kind==='commission')p.orderEvents.push({kind:'fulfilled',owner:id,window:order.window,workId:work.id,amount:sold.amount,at:root.minutes});
          root.artMarket=sold.artMarket;root.shop=sold.shop;root.financialHistory=sold.financialHistory;actor.createdWorks=sold.works;
          assert.equal(projectArtSale(root,id,work.id,q).ok,false,'duplicate canonical sale');
        }else{
          sold=transactPainting(root,id,work.id,'sell');
          if(!sold.ok){note('sell-art',sold);continue;}
          const finance=recordFinanceChange(root,sold.shop,{kind:'art-sale',sourceId:work.id,actorId:id,atGameMinute:Math.floor(root.minutes),receiptId:'art:'+id+':'+work.id});
          assert.ok(finance.ok,finance.reason);
          actor.createdWorks=sold.works;root.shop=finance.shop;root.financialHistory=finance.financialHistory;
          assert.equal(transactPainting(root,id,work.id,'sell').ok,false,'duplicate legacy sale');
        }
        note('sell-art',sold);p.sales++;p.artReceipts.push({id:work.id,owner:id,quality:work.quality,at:root.minutes,amount:sold.amount});p.negativeSales++;
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
   const actor=getActor(root,id),mode=variant.food.replace('-premium','');
   if(mode==='snack')return launch(id,'fridge');
   const recipe=mode==='home'?'cook.soup':variant.food.endsWith('-premium')?'ready.gold-roast':'ready.sunny-grains';
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
   let mode=null,price=null;
   if(paid){
     let q=artAdmissionQuote(root,id,'commission','painting.hills');
     if(!q.ok)q=artAdmissionQuote(root,id,'speculative','painting.hills');
     if(!q.ok&&variant.adaptive)q=artAdmissionQuote(root,id,'practice','painting.hills');
     if(!q.ok){count(p.rejected,'paint:'+q.reason);return false;}
     mode=q.mode;price=q.price;
   }
   const beforeCash=root.shop.credits;
   const ok=chooseResidentAction(root,action,automatic,id,action==='paint'?easel.instanceId:action==='hobby'?shelf.instanceId:null,action==='paint'?PAINT_ACTIVITY_ID:action==='hobby'?READING_ACTIVITY_ID:null,action==='paint'?'painting.hills':action==='hobby'?READING_CONTENT_ID:null,null,null,null,false,false,mode,price);
   assert.equal(root.shop.credits,beforeCash-(ok&&paid?price:0),'canonical admission debit must be exact');
   if(ok){if(paid){p.materialCost+=price;count(p.actions,'paint-mode:'+mode);if(mode==='commission'){const order=root.artMarket.byResident[id].order;p.orderEvents.push({kind:'accepted',owner:id,window:order.window,at:root.minutes});}}
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
     else if((policy==='creative'||(policy==='mixed'&&id===partner))&&(variant.adaptive||(a.createdWorks?.length||0)<24)&&a.needs.energy>=55&&a.needs.hunger>=55&&(!cap||(paintAdmissions[id+':'+Math.floor((root.minutes-base.minutes)/1440)]||0)<cap))launch(id,'paint');
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
    p.daily.push({food:structuredClone(p.food),materialCost:p.materialCost,market:variant.market?structuredClone(root.artMarket):null,declinedOffers:p.declinedOffers,fulfilledOrders:p.orderEvents.filter(e=>e.kind==='fulfilled').length,stock:totalStock(root),day,minutes:root.minutes,wallet:root.shop.credits,debt:householdBillView(root).totalDue,timeClasses:{...p.timeClasses},cashByKind:{...p.cashByKind},sales:p.sales,relationship:structuredClone(root.relationship),actors:ids.map(id=>{const a=getActor(root,id),c=root.careerSystem.byResident[id];return {id,needs:structuredClone(a.needs),skills:structuredClone(a.skills),works:a.createdWorks?.length||0,career:c?{level:c.level,workedShifts:c.workedShifts,missedShifts:c.missedShifts,performance:c.performance}:null};}),socialCompletions:p.socialCompletions,decisions:p.decisions,actions:{...p.actions},criticalNeedMinutes:{...p.criticalNeedMinutes},minutesByAction:{...p.minutesByAction},rejected:{...p.rejected},events:{...p.events}});
    const restored=loadHousehold(structuredClone(root));
    assert.equal(restored.shop.credits,root.shop.credits);assert.equal(restored.minutes,root.minutes);assert.deepEqual(restored.financialHistory,root.financialHistory);assert.equal(totalStock(restored),totalStock(root));assert.equal(restored.kitchen.pantry.vegetables,root.kitchen.pantry.vegetables);assert.equal(p.food.cost+p.materialCost+(p.cashByKind.purchase||0),0,'purchase ledger reconciliation');if(variant.market){assert.deepEqual(restored.artMarket,root.artMarket,'canonical saved market roundtrip');for(const id of ids)assert.deepEqual(getActor(restored,id).createdWorks,getActor(root,id).createdWorks,'canonical works roundtrip');}
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
const cv=variants.find(v=>v.name==='mixed-phone-premium');
const original=report.policies.find(p=>p.variant===cv&&p.block===report.blocks[0]);
const replay=run(report.blocks[0],cv,true);
try{
 const {replay:ra,...a}=original,{replay:rb,...b}=replay;
 assert.equal(original.status,'PASS');assert.equal(replay.status,'PASS');
 assert.deepEqual(a,b,'exact replay diverged');report.controls.replay='PASS';
 assert.equal(report.policies.length,29);
 assert.ok(report.policies.every(p=>p.status==='PASS'),'incomplete policy');
 assert.ok(report.policies.some(p=>p.negativeBills>0),'bill control unexercised');
 assert.ok(report.policies.some(p=>p.negativeSales>0),'sale control unexercised');
 report.controls.ledger='PASS';
 for(const row of report.policies){
   if(row.policy==='no-intervention'){
      assert.ok(Object.values(row.criticalNeedMinutes).some(n=>n>0)||row.daily.at(-1).debt>0,'negative control failed');
      continue;
   }
   assert.equal(row.travelFailures,0,'unreachable route '+row.variant.name);
   if(row.variant.food==='snack'){
     assert.equal(row.food.cost,0);assert.equal(row.food.purchases,0);assert.ok(row.actions.fridge>0);
   }else{
     assert.ok(row.food.servings>0,row.variant.name+' no servings');
     assert.ok(row.food.routes['dining:toFridge']>0&&row.food.routes['dining:toSeat']>0,'missing dining stages');
     if(row.variant.food==='home'){
       assert.ok(row.food.batches>0&&row.food.restocks>0,'no cooked batches/restock');
       for(const s of ['toFridge','toPrep','toStove','toFridgeStore'])assert.ok(row.food.routes['cook:'+s]>0,'missing cook stage '+s);
     }else{
       assert.ok(row.food.readyOrders>0&&row.food.cost>0,'no paid order');
       if(row.variant.food.startsWith('phone'))assert.ok(row.food.delivered>0,'no delivery');
     }
   }
   if(row.policy==='mixed'||row.policy==='creative'){
     assert.ok(row.sales>0,'art market not exercised');
     assert.ok(row.materialCost>0);
     assert.ok(Object.values(row.paintAdmissions).every(n=>n<=row.variant.cap),'cap exceeded');
   }
   if(row.variant.train)assert.ok(row.readingReturns>0,'training unexercised');
 }
 report.controls.food='PASS';
 const poor=newHousehold('2026-11-26');poor.shop.credits=0;poor.kitchen.pantry.vegetables=0;
 assert.equal(proposeReadyMealPurchase(poor,'ready.sunny-grains','fridge','alex').reason,'insufficient-credits');
 assert.equal(proposeReadyMealPurchase(poor,'ready.sunny-grains','phone','alex').reason,'insufficient-credits');
 assert.equal(proposeKitchenRestock(poor,'vegetables','alex').reason,'insufficient-credits');
 const before=structuredClone(poor.financialHistory);
 assert.ok(chooseResidentAction(poor,'fridge',false,'alex'),'free snack must remain available');
 assert.equal(poor.shop.credits,0);assert.deepEqual(poor.financialHistory,before);
 report.controls.poor='PASS';
}catch(e){report.failures.push({control:e.stack||String(e)});}
const sum=(map,keys)=>Object.entries(map).filter(([k])=>keys.some(v=>k.endsWith(':'+v))).reduce((n,[,v])=>n+v,0);
report.checkpoints=[];
for(const row of report.policies.filter(p=>p.status==='PASS'&&!p.replay)){
 for(const day of [7,30]){
   const d=row.daily[day-1];
   report.checkpoints.push({block:row.block.date,variant:row.variant.name,day,net:d.wallet-d.debt-row.initial.wallet,wallet:d.wallet,debt:d.debt,food:d.food,foodActionMinutes:sum(d.minutesByAction,['fridge','dining','cook']),criticalHungerMinutes:sum(d.criticalNeedMinutes,['hunger']),criticalFunMinutes:sum(d.criticalNeedMinutes,['fun']),leisureActionMinutes:sum(d.minutesByAction,['sofa','tv','bench']),criticalAllMinutes:Object.values(d.criticalNeedMinutes).reduce((a,b)=>a+b,0),missed:d.actors.reduce((a,b)=>a+(b.career?.missedShifts||0),0),sales:d.sales,materialCost:d.materialCost,socialCompletions:d.socialCompletions,decisions:d.decisions,timeClasses:d.timeClasses,needs:d.actors.map(a=>({id:a.id,needs:a.needs})),cashByKind:d.cashByKind,travelFailures:day===30?row.travelFailures:null});
 }
}
report.comparisons=[];
for(const block of report.blocks)for(const policy of ['career','mixed'])for(const day of [7,30]){
 const find=food=>report.checkpoints.find(d=>d.block===block.date&&d.variant===policy+'-'+food&&d.day===day);
 const a=find('phone'),b=find('phone-premium'),h=find('home'),f=find('fridge'),g=find('fridge-premium'),s=find('snack');
 if(!a||!b||!h||!f||!g||!s)continue;
 const fields=x=>({cost:x.food.cost,servings:x.food.servings,foodMinutes:x.foodActionMinutes,leisureMinutes:x.leisureActionMinutes,criticalHunger:x.criticalHungerMinutes,criticalFun:x.criticalFunMinutes,net:x.net,missed:x.missed,debt:x.debt});
 report.comparisons.push({block:block.date,policy,day,snack:fields(s),home:fields(h),fridge:fields(f),fridgePremium:fields(g),phone:fields(a),phonePremium:fields(b)});
}
if(report.checkpoints.length!==56||report.comparisons.length!==8)report.failures.push({control:'incomplete checkpoint/comparison coverage'});
for(const d of report.checkpoints.filter(d=>d.variant!=='no-intervention')){
 if(d.criticalHungerMinutes!==0||d.missed!==0||d.debt!==0||(d.day===30&&d.travelFailures!==0))report.failures.push({control:'active policy safety screen',row:d.variant,block:d.block,day:d.day});
}
console.log('FOOD B',JSON.stringify(report.comparisons));
flush();assert.deepEqual(report.failures,[],'food diagnostics contain failures');
