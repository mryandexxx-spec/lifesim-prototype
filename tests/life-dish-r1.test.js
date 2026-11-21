import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,chooseResidentAction,tickHousehold,
  residentAutonomousChoice,furnitureAvailable} from '../src/household.js';
import {newKitchen,recordDirtyDish,washKitchenDishes} from '../src/kitchen.js';
import {dirtyDishVisualPlan,DISH_VISUAL_CAP,DISH_AUTO_WASH_THRESHOLD} from '../src/dirty-dishes-visual.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {arrive,ACTIONS,SAVE_KEY} from '../src/simulation.js';
import {readFileSync} from 'node:fs';

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
  assert.ok(before.visible.every(p=>p.instanceId==='dish-sink'));
  h.world.furniture.instances.find(x=>x.instanceId==='dish-sink').location='storage';
  const fallback=dirtyDishVisualPlan(h.kitchen,h.world);
  assert.ok(fallback.visible.every(p=>p.instanceId==='dish-prep'));
  h.world.furniture.instances.find(x=>x.instanceId==='dish-prep').location='storage';
  const noSurface=dirtyDishVisualPlan(h.kitchen,h.world);
  assert.equal(noSurface.visible.length,0);assert.equal(noSurface.unplaced,32);
  assert.equal(h.kitchen.dirtyDishes,32,'rendering cannot create or clear dishes');
  h.world.furniture.instances.find(x=>x.instanceId==='dish-sink').location='home';
  h.world.furniture.instances.find(x=>x.instanceId==='dish-sink').yaw=180;
  const rotated=dirtyDishVisualPlan(h.kitchen,h.world);
  assert.notEqual(rotated.visible[0].x,before.visible[0].x);
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
