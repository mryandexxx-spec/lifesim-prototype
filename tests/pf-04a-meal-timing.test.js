import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold,chooseResidentAction,tickHousehold,nearestAvailableDiningTable} from '../src/household.js';
import {ACTIONS,arrive} from '../src/simulation.js';
import {fridgeActionFrame} from '../src/fridge-interaction.js';
import * as fridgePolicy from '../src/fridge-interaction.js';
import {DINING_TAKE_MINUTES,diningSeatApproach,chooseDiningSeat} from '../src/dining.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {findPath} from '../src/navigation.js';

const pathLength=(start,path)=>path.reduce((sum,p,i)=>sum+Math.hypot(p.x-(path[i-1]||start).x,p.z-(path[i-1]||start).z),0);
function home(){
  const h=newHousehold();h.autonomy.enabled=false;h.otherSim.autonomy.enabled=false;
  for(const [n,x] of [[901,8],[902,11]])h.world.furniture.instances.push(
    {instanceId:'pf-table-'+n,prefabId:'diningtable',itemDefinitionId:'diningtable.farm',x,z:0,yaw:0,location:'home'},
    {instanceId:'pf-chair-'+n,prefabId:'chair',itemDefinitionId:'chair.loft',x,z:2.25,yaw:0,location:'home'});
  return h;
}
test('PF-04/A: auto-table uses actual post-fridge A* length, not actor proximity',()=>{
  const h=home();h.position={x:10.8,z:2.6};
  const fridge=furnitureActionApproach(h.world,'fridge');
  const routeA=findPath(fridge,diningSeatApproach(h.world,'pf-table-901','pf-chair-901'),h.world);
  const routeB=findPath(fridge,diningSeatApproach(h.world,'pf-table-902','pf-chair-902'),h.world);
  assert.ok(routeA&&routeB);
  const shorter=pathLength(fridge,routeA)<pathLength(fridge,routeB)?'901':'902';
  assert.equal(shorter,'901','fixture must exercise an actual detour');
  assert.equal(nearestAvailableDiningTable(h,'alex')?.instanceId,'pf-table-'+shorter);
  assert.ok(chooseResidentAction(h,'dining',false,'alex','pf-table-902'),'explicit table remains respected');
  assert.equal(h.action.targetInstanceId,'pf-table-902');
});
test('PF-04/A: faster only while walking for dinner, budget in canonical game minutes',()=>{
  const policy=fridgePolicy.mealRouteMetersPerSecond;
  assert.equal(typeof policy,'function');
  const h=home();
  const fridge=furnitureActionApproach(h.world,'fridge');
  const seat=chooseDiningSeat(h.world,h.position,'pf-table-901').point;
  const legs=[pathLength(h.position,findPath(h.position,fridge,h.world)),pathLength(fridge,findPath(fridge,seat,h.world))];
  for(const speed of [1,3]){
    const stages=['toFridge','toSeat'];
    const before=legs.map(d=>d/(1.65*speed)*3*speed);
    const after=legs.map((d,i)=>d/(policy({id:'dining',phase:'walking',diningStage:stages[i]})*speed)*3*speed);
    assert.ok(after.every((m,i)=>m<=before[i]*.8));
    assert.equal(DINING_TAKE_MINUTES,4.5);
    assert.equal(ACTIONS.dining.duration,31);
    console.log('PF-04/A model budget',JSON.stringify({speed,before:[before[0],6,before[1],31],after:[after[0],DINING_TAKE_MINUTES,after[1],31]}));
  }
  for(const action of [null,{id:'move',phase:'walking'},{id:'cook',phase:'walking'},{id:'dining',phase:'using',diningStage:'taking'},{id:'fridge',phase:'walking'}])assert.equal(policy(action),1.65);
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  assert.ok(game.includes('mealRouteMetersPerSecond(resident.action)'),'real browser route must use tested policy');
});
test('PF-04/A: exact pickup and renderer share budget, pause and v1 reload preserve one portion',()=>{
  for(const id of ['alex','mira']){
    const h=home(),actor=id==='alex'?h:h.otherSim;
    actor.needs.hunger=15;h.kitchen.prepared=[{recipeId:'ready.sunny-grains',portions:1}];
    assert.ok(chooseResidentAction(h,'dining',false,id,'pf-table-901',null,null,null,null,'ready.sunny-grains'));
    actor.position={...furnitureActionApproach(h.world,'fridge')};arrive(actor);actor.action.diningStage='taking';
    tickHousehold(h,DINING_TAKE_MINUTES-1);
    assert.equal(actor.action.diningStage,'taking');
    const elapsed=actor.action.elapsed;
    h.paused=true;tickHousehold(h,99);assert.equal(actor.action.elapsed,elapsed);h.paused=false;
    const loaded=loadHousehold(structuredClone(h)),a=id==='alex'?loaded:loaded.otherSim;
    assert.equal(loaded.version,1);assert.equal(a.action.elapsed,elapsed);
    const frame=fridgeActionFrame({...a.action,elapsed:DINING_TAKE_MINUTES},ACTIONS.fridge.duration);
    assert.equal(frame.progress,1);assert.equal(frame.doorOpen,0);
    tickHousehold(loaded,1);
    assert.equal(a.action.diningStage,'toSeat');
    assert.equal(loaded.kitchen.prepared[0].portions,1);
    a.position={...diningSeatApproach(loaded.world,a.action.targetInstanceId,a.action.diningSeatInstanceId)};
    arrive(a);a.action.diningStage='eating';
    tickHousehold(loaded,1);assert.equal(loaded.kitchen.prepared.length,0);
    tickHousehold(loaded,ACTIONS.dining.duration-1);
    assert.equal(a.action,null);assert.equal(loaded.kitchen.dirtyDishes,1);
    assert.equal(loaded.financialHistory.entries.length,0);
  }
});
