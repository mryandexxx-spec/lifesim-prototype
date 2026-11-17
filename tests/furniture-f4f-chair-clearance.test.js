import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,chooseResidentAction} from '../src/household.js';
import {proposeFurnitureMove} from '../src/furniture-layout.js';
import {diningSeatMatches,diningSeatApproach,chooseDiningSeat,
  diningChairPullLimit,diningChairPullOffset,isPermittedDiningTuck}
  from '../src/dining.js';
import {purchasedSeatPose,purchasedSeatSurface,purchasedDiningSeatPose,
  purchasedDiningSeatSurface} from '../src/seat-furniture.js';
import {sofaTransitionPose} from '../src/sofa-transition.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {isWalkable,findPath} from '../src/navigation.js';
import {readFileSync} from 'node:fs';

function household(){
  const h=newHousehold();
  h.world.furniture.instances.push(
    {instanceId:'shop-diningtable-901',prefabId:'diningtable',itemDefinitionId:'diningtable.farm',
      x:8,z:0,yaw:0,location:'home'},
    {instanceId:'shop-chair-902',prefabId:'chair',itemDefinitionId:'chair.loft',
      x:8,z:2.25,yaw:0,location:'home'}
  );
  return h;
}
const table='shop-diningtable-901',chair='shop-chair-902';
test('F4F.1: tucked chair at tabletop edge is accepted by same real shop/editor transaction',()=>{
  const h=household();
  const proposed=proposeFurnitureMove(h.world.furniture,chair,{x:8,z:1.10,yaw:0});
  assert.equal(proposed.ok,true,'a tabletop should not need a full walking tile');
  const world=proposed.world;
  assert.equal(diningSeatMatches(world,table,chair),true);
  assert.equal(isPermittedDiningTuck(world,table,chair),true);
  const approach=diningSeatApproach(world,table,chair);
  assert.ok(approach&&Math.abs(approach.side)===1,'must use an open chair side');
  assert.ok(isWalkable(approach.x,approach.z,world));
  const fridge=furnitureActionApproach(world,'fridge');
  assert.ok(findPath(fridge,approach,world),'food remains physically reachable');
  h.world.furniture=world;
  assert.equal(chooseResidentAction(h,'dining',false,'alex',table),true);
  assert.equal(h.action.diningSeatInstanceId,chair);
});
test('F4F.1: backwards/overlapping chairs and tables are not falsely accepted',()=>{
  const h=household();
  const near={x:8,z:1.10,yaw:180};
  const rejected=proposeFurnitureMove(h.world.furniture,chair,near);
  assert.equal(rejected.ok,false,'backwards chairs may not tuck into a table');
  assert.equal(diningSeatMatches({...h.world,furniture:{...h.world.furniture,
    instances:h.world.furniture.instances.map(x=>x.instanceId===chair?{...x,...near}:x)}},table,chair),false);
  assert.equal(proposeFurnitureMove(h.world.furniture,chair,{x:8,z:0,yaw:0}).ok,false,
    'table and chair may not occupy the same floor area');
});
test('F4F.1: path selection survives 90-degree rotation and finds side',()=>{
  const h=household();
  const set=h.world.furniture.instances;
  const t=set.find(x=>x.instanceId===table),c=set.find(x=>x.instanceId===chair);
  t.yaw=90;c.x=9.1;c.z=0;c.yaw=270;
  assert.equal(diningSeatMatches(h.world,table,chair),true);
  const p=diningSeatApproach(h.world,table,chair);
  assert.ok(p&&p.side!==0);
  assert.ok(isWalkable(p.x,p.z,h.world));
});
test('F4F.1: chair pull, sit, push and stand are smooth and reversible',()=>{
  const h=household();
  h.world.furniture.instances.find(x=>x.instanceId===chair).z=1.1;
  const approach=diningSeatApproach(h.world,table,chair);
  const max=diningChairPullLimit(h.world,table,chair);
  assert.ok(max>.15,'room should allow a believable chair pull');
  const pull=[0,.10,.45,.72,1].map(p=>diningChairPullOffset(p,max));
  assert.equal(pull[0],0);
  assert.ok(pull[2]>pull[1]&&pull[2]>pull[3]&&pull[3]>pull[4]);
  assert.ok(pull[4]>0&&pull[4]<pull[2],'chair pushes back toward table after sitting');
  const start=purchasedDiningSeatPose(h.world,chair,sofaTransitionPose({progress:0}),
    0,approach.side,max);
  const seated=purchasedDiningSeatPose(h.world,chair,sofaTransitionPose({progress:1}),
    1,approach.side,max);
  assert.ok(Math.hypot(start.x-approach.x,start.z-approach.z)<.01);
  assert.ok(Math.abs(seated.x-8)<.02&&seated.z>1.1);
  const surface=purchasedDiningSeatSurface(h.world,chair,pull[4]);
  const original=purchasedSeatSurface(h.world,chair);
  assert.ok(surface.contact.z>original.contact.z);
  assert.deepEqual(purchasedDiningSeatPose(h.world,chair,sofaTransitionPose({progress:0}),
    0,approach.side,max),start,'return to starting pose is deterministic');
});
test('F4F.1: visual pull never tunnels through furniture behind a chair',()=>{
  const h=household();
  const c=h.world.furniture.instances.find(x=>x.instanceId===chair);
  c.z=1.1;
  const free=diningChairPullLimit(h.world,table,chair);
  h.world.furniture.instances.push({instanceId:'shop-chair-903',prefabId:'chair',
    x:8,z:2.15,yaw:0,location:'home'});
  const blocked=diningChairPullLimit(h.world,table,chair);
  assert.ok(blocked<free,'rear obstacle must reduce visual movement');
});
test('F4F.1: v1 chair location stays fixed, sofa/ordinary sitting animations unchanged',()=>{
  const h=household(),c=h.world.furniture.instances.find(x=>x.instanceId===chair);
  c.z=1.1;
  const old={x:c.x,z:c.z,yaw:c.yaw};
  const actual=purchasedSeatPose(h.world,chair,sofaTransitionPose({progress:1}));
  assert.ok(actual);
  const pull=diningChairPullLimit(h.world,table,chair);
  purchasedDiningSeatPose(h.world,chair,sofaTransitionPose({progress:.6}),.6,-1,pull);
  assert.deepEqual({x:c.x,z:c.z,yaw:c.yaw},old);
  const loaded=loadHousehold(structuredClone(h));
  const restored=loaded.world.furniture.instances.find(x=>x.instanceId===chair);
  assert.deepEqual({x:restored.x,z:restored.z,yaw:restored.yaw},old);
});
test('F4F.1: engine adapter actually drives both avatars and visual-only chair roots',()=>{
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert.match(game,/purchasedDiningSeatPose\(game\.world,sofaVisualTargets\.alex/);
  assert.match(game,/purchasedDiningSeatPose\(game\.world,sofaVisualTargets\.mira/);
  assert.match(game,/renderDiningChairOffsets\(\)/);
  assert.match(game,/purchasedDiningSeatSurface\(game\.world,alexDiningVisual\.chairId/);
  assert.match(workflow,/node --check src\/dining\.js/);
});
