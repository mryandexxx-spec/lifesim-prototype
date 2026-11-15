import test from 'node:test';
import assert from 'node:assert/strict';
import {newFurnitureWorld,ORIGINAL_FURNITURE} from '../src/furniture-catalog.js';
import {FURNITURE_CATALOG,furnitureActionApproach} from '../src/furniture-catalog.js';
import {BED_SLOTS} from '../src/bed-layout.js';
import {FRIDGE_LAYOUT} from '../src/fridge-interaction.js';
import {SHOWER_LAYOUT} from '../src/shower-interaction.js';
import {TOILET_LAYOUT} from '../src/toilet-interaction.js';
import {furniturePoint,furniturePose,inverseFurniturePose,
  furnitureBounds,fixtureContactLayout} from '../src/furniture-transform.js';
const copy=x=>JSON.parse(JSON.stringify(x));
const moved=(type,pose)=>{
  const w=newFurnitureWorld(),i=w.instances.find(i=>i.prefabId===type);
  Object.assign(i,pose);w.revision++;return w;
};
test('identity fixture transforms preserve authored coordinates, y, yaw and IK',()=>{
  const w=newFurnitureWorld();
  for(const original of ORIGINAL_FURNITURE){
    const p={x:original.x+.15,y:.4,z:original.z-.4,pitch:-30,yaw:77,
      bedFootYaw:90,bedAnkles:[{x:original.x,y:.1,z:original.z}]};
    const t=furniturePose(w,original.prefabId,p);
    assert.deepEqual(t,p);
    assert.deepEqual(inverseFurniturePose(w,original.prefabId,t),p);
  }
});
test('all four quarter turns are exact rigid transforms and actor heading offsets',()=>{
  for(const yaw of [0,90,180,270]){
    const w=moved('bed',{x:0,z:0,yaw});
    const orig=ORIGINAL_FURNITURE.find(x=>x.prefabId==='bed');
    const sample={x:orig.x+1,y:.4,z:orig.z,pitch:-78,yaw:180};
    const transformed=furniturePose(w,'bed',sample);
    const positions={0:[1,0],90:[0,1],180:[-1,0],270:[0,-1]};
    const [x,z]=positions[yaw];
    assert.ok(Math.abs(transformed.x-x)<1e-10);
    assert.ok(Math.abs(transformed.z-z)<1e-10);
    assert.equal(transformed.yaw,180-yaw);
    assert.deepEqual(inverseFurniturePose(w,'bed',transformed),sample);
  }
});
test('rotated bed side approaches remain in their physical slots and not base location',()=>{
  const w=moved('bed',{x:.5,z:-.2,yaw:90});
  for(const slot of Object.values(BED_SLOTS)){
    const placed=furniturePoint(w,'bed',slot.approach);
    assert.ok(placed);
    assert.notDeepEqual(placed,slot.approach);
  }
});
test('appliance contact, fridge hand reach, shower mask and toilet seat use matching transforms',()=>{
  const fixtures=[['fridge',FRIDGE_LAYOUT.approach],['shower',SHOWER_LAYOUT.interior],
    ['toilet',TOILET_LAYOUT.interior]];
  for(const [type,anchor] of fixtures){
    const w=moved(type,{x:.2,z:-.2,yaw:90});
    const pos=furniturePoint(w,type,anchor);
    assert.ok(pos);
    assert.notDeepEqual(pos,anchor);
    const back=inverseFurniturePose(w,type,pos);
    assert.ok(Math.abs(back.x-anchor.x)<1e-9);
    assert.ok(Math.abs(back.z-anchor.z)<1e-9);
  }
  const world=moved('fridge',{x:0,z:0,yaw:270});
  const hand=fixtureContactLayout(world,'fridge',FRIDGE_LAYOUT);
  assert.deepEqual(hand.handle,furniturePoint(world,'fridge',FRIDGE_LAYOUT.handle));
  assert.deepEqual(hand.shelfTarget,furniturePoint(world,'fridge',FRIDGE_LAYOUT.shelfTarget));
  assert.equal(hand.handleY,FRIDGE_LAYOUT.handleY);
});
test('rotated full 3D part AABB follows instance and quarter turn correctly',()=>{
  const w=moved('sofa',{x:0,z:0,yaw:90});
  const origin=ORIGINAL_FURNITURE.find(i=>i.prefabId==='sofa');
  const box={min:{x:origin.x-.6,y:.1,z:origin.z-.2},
    max:{x:origin.x+.6,y:.9,z:origin.z+.2}};
  const t=furnitureBounds(w,'sofa',box);
  assert.equal(Math.round((t.max.x-t.min.x)*100)/100,.4);
  assert.equal(Math.round((t.max.z-t.min.z)*100)/100,1.2);
  assert.equal(t.min.y,.1);
  assert.equal(t.max.y,.9);
});
test('F1a saved decor coordinates are left untouched, not re-migrated',()=>{
  const w=newFurnitureWorld();
  w.instances.find(i=>i.prefabId==='tv').x=1.5;
  const old=copy(w);
  const pts=ORIGINAL_FURNITURE.filter(x=>x.prefabId==='tv').map(i=>furniturePoint(w,'tv',{x:i.x,z:i.z}));
  assert.equal(pts[0].x,1.5);
  assert.deepEqual(w,old);
});
