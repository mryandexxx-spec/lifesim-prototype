/** Life Systems P4: multi-week integration across the new career and food systems.
 * This is headless simulation. Real touch/WebGL is tested separately;
 * old LOT-E4 covers garden/pool/FIFO and LOT-E5 covers editor mode changes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,tickHousehold,getActor} from '../src/household.js';
import {hireCareer} from '../src/career-state.js';
import {arriveCareerPortal,finishCareerReturn} from '../src/career-work.js';
import {proposeReadyMealPurchase,settleReadyMealDeliveries} from '../src/ready-food.js';
import {READY_MEAL_IDS} from '../src/ready-meal-catalog.js';
import {finishKitchenRecipe,kitchenSummary} from '../src/kitchen.js';
import {SAVE_KEY} from '../src/simulation.js';

const clone=x=>structuredClone(x);
const people=['alex','mira'];
function buy(root,recipeId,channel,residentId){
  const prior=root.shop.credits;
  const tx=proposeReadyMealPurchase(root,recipeId,channel,residentId);
  assert.equal(tx.ok,true,tx.reason);
  assert.equal(root.shop.credits,prior,'quote must not mutate source save');
  root.shop=tx.shop;
  root.kitchen=tx.kitchen;
  root.financialHistory=tx.financialHistory;
  assert.equal(root.shop.credits,prior-tx.price);
}
function start(){
  const root=newHousehold('2026-11-16');
  root.autonomy.enabled=false;
  root.otherSim.autonomy.enabled=false;
  root.shop.credits=4000;
  root.careerSystem=hireCareer(root.careerSystem,'alex','editorial',root.minutes);
  root.careerSystem=hireCareer(root.careerSystem,'mira','business-center',root.minutes);
  assert.ok(root.careerSystem.byResident.alex);
  assert.ok(root.careerSystem.byResident.mira);
  buy(root,READY_MEAL_IDS[0],'fridge','alex');
  buy(root,READY_MEAL_IDS[1],'phone','mira');
  assert.equal(finishKitchenRecipe(root.kitchen,'cook.soup',0),true,
    'legacy home recipe can coexist with two paid products');
  assert.equal(root.kitchen.deliveries.length,1);
  assert.equal(kitchenSummary(root.kitchen).prepared>=2,true);
  return root;
}
function check(root,walletOrigin){
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.equal(root.version,1);
  assert.equal(root.otherSim.minutes,root.minutes);
  assert.equal(root.otherSim.speed,root.speed);
  for(const id of people){
    const actor=getActor(root,id);
    for(const [need,n] of Object.entries(actor.needs))
      if(typeof n==='number')assert.ok(Number.isFinite(n)&&n>=0&&n<=100,
        id+' '+need+' '+n);
    assert.ok(Number.isFinite(actor.position.x)&&Number.isFinite(actor.position.z));
    assert.equal(actor.skills.xpById.charisma||0,0,
      'passive work/food time cannot mint mirror speech XP');
    assert.equal(actor.skills.xpById.gardening||0,0,
      'passive time cannot mint gardening XP');
  }
  const history=root.financialHistory.entries;
  assert.equal(new Set(history.map(x=>x.id)).size,history.length,'unique ledger receipt ids');
  assert.equal(root.shop.credits,walletOrigin+
    history.reduce((sum,x)=>sum+x.delta,0),'single wallet is conserved');
  assert.equal(new Set(root.careerSystem.settlementIds).size,
    root.careerSystem.settlementIds.length,'salary settlements are unique');
  assert.ok(root.kitchen.prepared.every(x=>x.portions>0));
  assert.ok(kitchenSummary(root.kitchen).prepared<=12);
}
function reload(root,walletOrigin){
  const previous=clone(root);
  const restored=loadHousehold(previous);
  assert.equal(restored.minutes,root.minutes);
  assert.equal(restored.shop.credits,root.shop.credits);
  assert.deepEqual(restored.financialHistory,root.financialHistory);
  assert.deepEqual(restored.kitchen,root.kitchen);
  assert.deepEqual(restored.careerSystem.settlementIds,root.careerSystem.settlementIds);
  check(restored,walletOrigin);
  return restored;
}
function transitions(root,totals){
  for(const id of people){
    const shift=root.careerSystem.byResident[id]?.currentShift;
    if(shift?.phase==='departing'){
      assert.equal(arriveCareerPortal(root,id,root.minutes),true);
      totals.departures[id]++;
    }
    if(shift?.phase==='returning'){
      assert.equal(finishCareerReturn(root,id),true);
      totals.returns[id]++;
    }
  }
}
function simulate(days){
  let root=start();
  const origin=root.shop.credits-
    root.financialHistory.entries.reduce((sum,x)=>sum+x.delta,0);
  // Real game time, not UI frames, completes exactly one paid delivery.
  root.speed=1;
  tickHousehold(root,17);
  assert.equal(root.kitchen.deliveries.length,1);
  root=reload(root,origin);
  root.speed=3;
  tickHousehold(root,1);
  assert.equal(root.kitchen.deliveries.length,0);
  assert.equal(settleReadyMealDeliveries(root).length,0,'delivery cannot replay');
  const initialMeals=kitchenSummary(root.kitchen).prepared;
  assert.ok(initialMeals>=3);
  const savedReceipts=root.financialHistory.entries.length;
  const totals={departures:{alex:0,mira:0},returns:{alex:0,mira:0},
    salaries:0,bills:0,reloads:1};
  for(let i=0;i<days*48;i++){
    transitions(root,totals);
    if(i===7){
      root.paused=true;
      const frozen=clone(root);
      tickHousehold(root,180);
      assert.deepEqual(root,frozen,'pause must freeze salaries, needs, delivery and clock');
      root.paused=false;
    }
    root.speed=i%32<16?1:3;
    const events=tickHousehold(root,30)||[];
    totals.salaries+=events.filter(e=>e.type==='salary').length;
    totals.bills+=events.filter(e=>e.type==='bill-issued').length;
    if(i%48===12||i%48===47){
      root=reload(root,origin);
      totals.reloads++;
    }
    if(i%48===47)check(root,origin);
  }
  assert.equal(root.minutes,480+18+days*1440);
  assert.ok(totals.salaries>=2,'both paid careers must generate real work receipts');
  for(const id of people){
    assert.ok(totals.departures[id]>=2,id+' departures');
    assert.ok(totals.returns[id]>=2,id+' returns');
  }
  assert.ok(totals.bills>=1,'recurring bills coexist with work and food');
  assert.ok(root.financialHistory.entries.length>savedReceipts,'salary debit history grew');
  assert.equal(kitchenSummary(root.kitchen).prepared,initialMeals,
    'time progression alone cannot consume physical food');
  const fresh=reload(root,origin);
  assert.equal(settleReadyMealDeliveries(fresh).length,0);
  const snapshot=clone(fresh);
  tickHousehold(fresh,0);
  assert.equal(fresh.shop.credits,snapshot.shop.credits,
    'zero game time after reload cannot create income');
  assert.deepEqual(fresh.financialHistory,snapshot.financialHistory);
  console.log('P4 multi-system duration:',JSON.stringify({days,
    salaries:totals.salaries,bills:totals.bills,
    departures:totals.departures,returns:totals.returns,
    reloads:totals.reloads,receipts:root.financialHistory.entries.length,
    credits:root.shop.credits,prepared:initialMeals,rootVersion:root.version}));
}
test('P4 seven-day two-career economy, food, skill and v1 reload',()=>simulate(7));
test('P4 thirty-day two-speed payroll, bills, food delivery and replay guard',()=>simulate(30));
test('P4 older v1 save missing new Life Systems extensions restores safely',()=>{
  const legacy=newHousehold('2026-11-16');
  delete legacy.kitchen;
  delete legacy.careerSystem;
  delete legacy.skills;
  delete legacy.otherSim.skills;
  const root=loadHousehold(clone(legacy));
  assert.equal(root.version,1);
  assert.ok(root.kitchen&&root.careerSystem&&root.skills&&root.otherSim.skills);
  assert.equal(root.otherSim.minutes,root.minutes);
  const after=loadHousehold(clone(root));
  assert.deepEqual(after.kitchen,root.kitchen);
  assert.equal(after.shop.credits,root.shop.credits);
});