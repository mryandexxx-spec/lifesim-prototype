import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,chooseResidentAction,tickHousehold,
  residentAutonomousChoice,furnitureAvailable,getActor} from '../src/household.js';
import {DISH_AUTO_WASH_THRESHOLD,newKitchen,recordDirtyDish,washKitchenDishes} from '../src/kitchen.js';
import {dirtyDishVisualPlan,DISH_VISUAL_CAP} from '../src/dirty-dishes-visual.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {arrive,ACTIONS,SAVE_KEY} from '../src/simulation.js';
import {readFileSync} from 'node:fs';
import {createProfile} from '../src/trait-catalog.js';
import {enqueueAction} from '../src/action-queue.js';

const sink={instanceId:'dish-sink',prefabId:'sink',itemDefinitionId:'sink.farm',
  location:'home',x:12.5,z:1.5,yaw:0};
const prep={instanceId:'dish-prep',prefabId:'prep',itemDefinitionId:'prep.oak',
  location:'home',x:10.7,z:1.5,yaw:90};
function household(){
  const h=newHousehold();h.autonomy.enabled=false;h.otherSim.autonomy.enabled=false;
  h.world.furniture.instances.push({...sink},{...prep});
  return h;
}
test('DISH-R1: exactly one visible plate per canonical dish, zero at start',()=>{
  const h=household();
  for(let n=0;n<=32;n++){
    h.kitchen.dirtyDishes=n;
    const plan=dirtyDishVisualPlan(h.kitchen,h.world);
    assert.equal(plan.visible.length,n);
    assert.equal(plan.count,n);
    assert.equal(plan.unplaced,0);
    assert.equal(new Set(plan.visible.map(x=>x.instanceId)).size<=2,true);
    assert.ok(plan.visible.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&
      Number.isFinite(p.z)&&p.height>=0&&p.height<8));
  }
  assert.equal(DISH_VISUAL_CAP,32);
  assert.equal(dirtyDishVisualPlan(newKitchen(),h.world).visible.length,0);
});
test('DISH-R1: physical layout follows furniture rotation, storage, purchase and removal',()=>{
  const h=household();h.kitchen.dirtyDishes=32;
  const before=dirtyDishVisualPlan(h.kitchen,h.world);
  assert.equal(before.visible.length,32);
  assert.equal(before.visible.filter(p=>p.instanceId==='dish-sink').length,16);
  assert.equal(before.visible.filter(p=>p.instanceId==='dish-prep').length,16);
  h.world.furniture.instances.find(x=>x.instanceId==='dish-sink').location='storage';
  const fallback=dirtyDishVisualPlan(h.kitchen,h.world);
  assert.equal(fallback.visible.filter(p=>p.instanceId==='dish-prep').length,16);
  assert.equal(fallback.visible.filter(p=>p.instanceId==='home-counter-1').length,16);
  h.world.furniture.instances.find(x=>x.instanceId==='dish-prep').location='storage';
  const starterFallback=dirtyDishVisualPlan(h.kitchen,h.world);
  assert.equal(starterFallback.visible.length,32);
  assert.ok(starterFallback.visible.every(p=>p.instanceId==='home-counter-1'));
  h.world.furniture.instances.find(x=>x.instanceId==='home-counter-1').location='storage';
  const noSurface=dirtyDishVisualPlan(h.kitchen,h.world);
  assert.equal(noSurface.visible.length,0);assert.equal(noSurface.unplaced,32);
  assert.equal(h.kitchen.dirtyDishes,32,'rendering cannot create or clear dishes');
  h.world.furniture.instances.find(x=>x.instanceId==='dish-sink').location='home';
  h.world.furniture.instances.find(x=>x.instanceId==='dish-sink').yaw=180;
  const rotated=dirtyDishVisualPlan(h.kitchen,h.world);
  assert.notEqual(rotated.visible[0].x,before.visible[0].x);
});
test('DISH-R1: original starter kitchen counter renders dishes before a separate sink purchase',()=>{
  const h=newHousehold();h.kitchen.dirtyDishes=4;
  const plan=dirtyDishVisualPlan(h.kitchen,h.world);
  assert.equal(plan.visible.length,4);
  assert.ok(plan.visible.every(x=>x.instanceId==='home-counter-1'));
  assert.equal(furnitureAvailable(h,'wash','alex'),false);
});
test('DISH-R1: 32-cap, restore v1 and wash derive same 3D count without second state',()=>{
  const h=household();
  for(let n=0;n<42;n++)recordDirtyDish(h.kitchen);
  assert.equal(h.kitchen.dirtyDishes,32);
  let p=dirtyDishVisualPlan(h.kitchen,h.world);assert.equal(p.visible.length,32);
  const saved=loadHousehold(structuredClone(h));
  assert.equal(saved.version,1);
  assert.equal(saved.kitchen.dirtyDishes,32);
  assert.equal(dirtyDishVisualPlan(saved.kitchen,saved.world).visible.length,32);
  assert.equal(washKitchenDishes(saved.kitchen),3);
  assert.equal(dirtyDishVisualPlan(saved.kitchen,saved.world).visible.length,29);
  assert.equal(washKitchenDishes(saved.kitchen),3);
  assert.equal(washKitchenDishes({dirtyDishes:0}),0);
  const old=loadHousehold({version:1,minutes:480,position:{x:0,z:0},
    needs:{hunger:80,energy:80,fun:80,hygiene:80,social:80,bladder:80}});
  assert.equal(dirtyDishVisualPlan(old.kitchen,old.world).visible.length,0);
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
});
test('DISH-R1: two residents cannot use same sink, pause does not clean, completion does',()=>{
  const h=household();h.kitchen.dirtyDishes=9;
  assert.equal(furnitureAvailable(h,'wash','alex','dish-sink'),true);
  assert.ok(chooseResidentAction(h,'wash',false,'alex','dish-sink'));
  assert.equal(chooseResidentAction(h,'wash',false,'mira','dish-sink'),false);
  assert.equal(dirtyDishVisualPlan(h.kitchen,h.world).visible.length,9);
  h.position={...furnitureActionApproach(h.world,'wash','dish-sink')};
  arrive(h);
  h.paused=true;tickHousehold(h,999);
  assert.equal(h.kitchen.dirtyDishes,9);
  h.paused=false;tickHousehold(h,ACTIONS.wash.duration);
  assert.equal(h.kitchen.dirtyDishes,6);
  assert.equal(dirtyDishVisualPlan(h.kitchen,h.world).visible.length,6);
  assert.equal(chooseResidentAction(h,'wash',false,'mira','dish-sink'),true);
  h.otherSim.position={...furnitureActionApproach(h.world,'wash','dish-sink')};
  arrive(h.otherSim);tickHousehold(h,ACTIONS.wash.duration/2);
  assert.equal(h.kitchen.dirtyDishes,6);
  tickHousehold(h,ACTIONS.wash.duration/2);
  assert.equal(h.kitchen.dirtyDishes,3);
});
test('DISH-R1: autonomy favors cleaning significant piles only when sink is free',()=>{
  const h=household();h.autonomy.enabled=true;h.otherSim.autonomy.enabled=true;
  h.kitchen.dirtyDishes=DISH_AUTO_WASH_THRESHOLD;
  assert.equal(residentAutonomousChoice(h,'alex'),'wash');
  assert.equal(chooseResidentAction(h,'wash',true,'alex','dish-sink'),true);
  assert.notEqual(residentAutonomousChoice(h,'mira'),'wash');
  h.paused=true;assert.equal(residentAutonomousChoice(h,'mira'),null);
});
test('DISH-R1: actual PlayCanvas UI contract, bounded 3D cache and one save key',()=>{
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(game,/dirtyDishVisualPlan\(game\.kitchen,game\.world\)/);
  assert.match(game,/DISH_VISUAL_CAP/);
  assert.match(game,/DISH-R1 porcelain/);
  assert.match(html,/id="dish-alert"/);
  assert.match(game,/select\('wash',sink\.instanceId\)/);
  assert.doesNotMatch(game,/dirtyDishes\s*[+\-]=/);
});


function personalityDishFixture(id,trait,count,fun=95){
  const h=household(),a=getActor(h,id);
  h.autonomy.enabled=true;h.otherSim.autonomy.enabled=true;
  h.minutes=480;a.minutes=480;a.autonomy.nextAt=480;
  Object.assign(a.needs,{hunger:95,energy:95,hygiene:95,fun,social:95,bladder:95});
  a.personality=createProfile(['temperament.calm',trait],{likes:[],dislikes:[]});
  h.kitchen.dirtyDishes=count;
  return {h,a};
}
test('LP-02A: housekeeping timing differs by profile, not legacy actor identity',()=>{
  for(const id of ['alex','mira'])for(const count of [0,2,3,5,6,8,9,32]){
    for(const [trait,threshold] of [['habits.neat',3],['habits.untidy',6],['coordination.agile',6]]){
      const {h}=personalityDishFixture(id,trait,count);
      assert.equal(residentAutonomousChoice(h,id)==='wash',count>=threshold,
        JSON.stringify({id,trait,count}));
      assert.equal(h.kitchen.dirtyDishes,count,'selection does not settle dishes');
    }
  }
});
test('LP-02A: care choice outranks early tidy impulse; untidy may defer only before hard ceiling',()=>{
  for(const id of ['alex','mira'])for(const count of [3,5,6,8,9,32]){
    for(const trait of ['habits.neat','habits.untidy','coordination.agile']){
      const {h}=personalityDishFixture(id,trait,count,30);
      const shouldWash=count>=9||(count>=6&&trait!=='habits.untidy');
      assert.equal(residentAutonomousChoice(h,id),shouldWash?'wash':'sofa',
        JSON.stringify({id,trait,count}));
      assert.equal(h.kitchen.dirtyDishes,count);
    }
  }
});
test('LP-02A: missing/occupied sink, active command, urgent hunger, pause and FIFO prevent early wash',()=>{
  for(const id of ['alex','mira']){
    const fixture=()=>personalityDishFixture(id,'habits.neat',3);
    const missing=fixture();missing.h.world.furniture.instances.find(x=>x.instanceId==='dish-sink').location='storage';
    assert.notEqual(residentAutonomousChoice(missing.h,id),'wash');
    const occupied=fixture(),other=id==='alex'?'mira':'alex';
    assert.ok(chooseResidentAction(occupied.h,'wash',false,other,'dish-sink'));
    assert.notEqual(residentAutonomousChoice(occupied.h,id),'wash');
    const active=fixture();
    assert.ok(chooseResidentAction(active.h,'sofa',false,id));
    assert.notEqual(residentAutonomousChoice(active.h,id),'wash');
    const urgent=fixture();urgent.a.needs.hunger=10;
    assert.equal(residentAutonomousChoice(urgent.h,id),'fridge');
    const paused=fixture();paused.h.paused=true;
    assert.equal(residentAutonomousChoice(paused.h,id),null);
    const disabled=fixture();disabled.h.autonomy.enabled=false;
    assert.equal(residentAutonomousChoice(disabled.h,id),null);
    const queued=fixture();assert.ok(enqueueAction(queued.h.actionQueues,id,{type:'object',actionId:'sofa'}));
    assert.equal(residentAutonomousChoice(queued.h,id),null);
    for(const item of [missing,occupied,active,urgent,paused,disabled,queued])
      assert.equal(item.h.kitchen.dirtyDishes,3);
  }
});
test('LP-02A: early wash uses existing physical completion once and survives profile reload',()=>{
  for(const id of ['alex','mira']){
    const {h,a}=personalityDishFixture(id,'habits.neat',3);
    const restored=loadHousehold(structuredClone(h));
    assert.equal(restored.version,1);
    assert.deepEqual(getActor(restored,id).personality,a.personality);
    assert.equal(restored.kitchen.dirtyDishes,3);
    assert.equal(residentAutonomousChoice(h,id),'wash');
    assert.ok(chooseResidentAction(h,'wash',true,id,'dish-sink'));
    assert.equal(h.kitchen.dirtyDishes,3);
    a.position={...furnitureActionApproach(h.world,'wash','dish-sink')};
    arrive(a);
    h.autonomy.enabled=false;h.otherSim.autonomy.enabled=false;
    h.paused=true;tickHousehold(h,ACTIONS.wash.duration);
    assert.equal(h.kitchen.dirtyDishes,3);
    h.paused=false;tickHousehold(h,ACTIONS.wash.duration);
    assert.equal(h.kitchen.dirtyDishes,0);
    assert.equal(a.action,null);
    tickHousehold(h,ACTIONS.wash.duration);
    assert.equal(h.kitchen.dirtyDishes,0);
  }
});
