import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,bedSlotFor,bedDestinationFor,chooseFreeBedSlot,
  furnitureAvailable,chooseResidentAction} from '../src/household.js';
import {newFurnitureWorld,resolveActionFurniture} from '../src/furniture-catalog.js';
import {furniturePoint} from '../src/furniture-transform.js';
import {BED_SLOTS} from '../src/bed-layout.js';

const copy=v=>JSON.parse(JSON.stringify(v));
const B1='home-bed-1',B2='shop-bed-2',S1='home-sofa-1',S2='shop-sofa-3';
function twoBeds(){
  const root=newHousehold();
  const bed=root.world.furniture.instances.find(v=>v.instanceId===B1);
  // Two-bed layout exercises instance-specific sleep slots independently of rendering.
  root.world.furniture={schema:1,revision:1,instances:[
    {...bed},{instanceId:B2,prefabId:'bed',x:1.6,z:1.6,yaw:90,location:'home'}
  ]};
  return root;
}
const same=(a,b)=>Math.abs(a-b)<1e-7;

test('per-instance bed destinations transform onto each distinct saved bed',()=>{
 const root=twoBeds(),left=BED_SLOTS.left.approach;
 const p1=furniturePoint(root.world,'bed',left,B1);
 const p2=furniturePoint(root.world,'bed',left,B2);
 assert.notDeepEqual(p1,p2);
 assert.equal(resolveActionFurniture(root.world,'bed',B2).instanceId,B2);
 assert.equal(resolveActionFurniture(root.world,'bed','home-sofa-1'),null);
 assert.equal(chooseFreeBedSlot(root.position,[],root.world,'missing-bed-2'),null);
 assert.ok(chooseFreeBedSlot(root.position,[],root.world,B2));
 assert.notDeepEqual(bedDestinationFor(root,'alex',B1),bedDestinationFor(root,'alex',B2));
});

test('two different beds may reserve the same half without fighting each other',()=>{
 const root=twoBeds();
 assert.equal(chooseResidentAction(root,'bed',false,'alex',B1),true);
 root.action.bedSlot='left';
 assert.equal(furnitureAvailable(root,'bed','mira',B2),true);
 assert.equal(chooseResidentAction(root,'bed',false,'mira',B2),true);
 root.otherSim.action.bedSlot='left';
 assert.equal(root.action.targetInstanceId,B1);
 assert.equal(root.otherSim.action.targetInstanceId,B2);
 assert.equal(bedSlotFor(root,'alex',B1),'left');
 assert.equal(bedSlotFor(root,'mira',B2),'left');
 const a=bedDestinationFor(root,'alex'),b=bedDestinationFor(root,'mira');
 const left1=furniturePoint(root.world,'bed',BED_SLOTS.left.approach,B1);
 const left2=furniturePoint(root.world,'bed',BED_SLOTS.left.approach,B2);
 assert.ok(same(a.x,left1.x)&&same(a.z,left1.z));
 assert.ok(same(b.x,left2.x)&&same(b.z,left2.z));
});

test('same bed serializes two distinct slots; old untargeted actions migrate',()=>{
 const root=twoBeds();
 assert.equal(chooseResidentAction(root,'bed',false,'alex',B1),true);
 root.action.bedSlot='left';
 assert.equal(chooseResidentAction(root,'bed',false,'mira',B1),true);
 assert.equal(root.otherSim.action.bedSlot,'right');
 root.otherSim.action.bedSlot='left'; // Simulate a corrupt or old conflicting save.
 const restored=loadHousehold(copy(root));
 assert.equal(restored.action.targetInstanceId,B1);
 assert.equal(restored.otherSim.action.targetInstanceId,B1);
 assert.notEqual(restored.action.bedSlot,restored.otherSim.action.bedSlot);
 const legacy=twoBeds();
 assert.equal(chooseResidentAction(legacy,'bed',false,'alex',B1),true);
 delete legacy.action.targetInstanceId; // old v1 saved before F0 furniture IDs
 const migrated=loadHousehold(copy(legacy));
 assert.equal(migrated.action.targetInstanceId,B1);
});

test('load preserves identical half names when they belong to different bed IDs',()=>{
 const root=twoBeds();
 assert.equal(chooseResidentAction(root,'bed',false,'alex',B1),true);
 assert.equal(chooseResidentAction(root,'bed',false,'mira',B2),true);
 root.action.bedSlot='right';
 root.otherSim.action.bedSlot='right';
 const restored=loadHousehold(copy(root));
 assert.equal(restored.action.targetInstanceId,B1);
 assert.equal(restored.otherSim.action.targetInstanceId,B2);
 assert.equal(restored.action.bedSlot,'right');
 assert.equal(restored.otherSim.action.bedSlot,'right');
});

test('invalid or stored target fails closed instead of redirecting sleeping character',()=>{
 const root=twoBeds();
 assert.equal(bedSlotFor(root,'alex','missing-bed-2'),null);
 assert.equal(bedDestinationFor(root,'alex','missing-bed-2'),null);
 assert.equal(furnitureAvailable(root,'bed','alex','missing-bed-2'),false);
 assert.equal(chooseResidentAction(root,'bed',false,'alex','missing-bed-2'),false);
 root.world.furniture.instances[1].location='storage';
 assert.equal(bedDestinationFor(root,'mira',B2),null);
 assert.equal(furnitureAvailable(root,'bed','mira',B2),false);
});

test('other functional fixtures already have isolated instance reservations',()=>{
 const root=newHousehold();
 root.world.furniture.instances.push({instanceId:S2,prefabId:'sofa',x:-2,z:0,yaw:90,location:'home'});
 root.otherSim.action={id:'sofa',phase:'using',elapsed:1,automatic:false,targetInstanceId:S2};
 assert.equal(furnitureAvailable(root,'sofa','alex',S1),true);
 assert.equal(furnitureAvailable(root,'sofa','alex',S2),false);
});
