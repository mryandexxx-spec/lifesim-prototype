import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newFurnitureWorld,FURNITURE_CATALOG,
  furnitureActionApproach} from '../src/furniture-catalog.js';
import {createFurnitureEditor,F1_MOVEABLE_PREFABS} from '../src/furniture-editor.js';
import {furniturePoint,furniturePose,inverseFurniturePose} from '../src/furniture-transform.js';
import {BED_SLOTS} from '../src/bed-layout.js';
import {SOFA_POSE} from '../src/pose-config.js';
import {SHOWER_LAYOUT,showerSequence,showerPrivacyInvariant} from '../src/shower-interaction.js';
import {TOILET_LAYOUT,toiletSequence,toiletPrivacyInvariant} from '../src/toilet-interaction.js';
import {FRIDGE_LAYOUT} from '../src/fridge-interaction.js';
import {bedDestinationFor,chooseFreeBedSlot,newHousehold,loadHousehold} from '../src/household.js';
import {findPath} from '../src/navigation.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const scene=read('../src/game.js');
const house=read('../src/household.js');
const layout=read('../src/furniture-layout.js');
const mesh=read('../src/meshy-fridge-runtime.js');
const male=read('../src/meshy-visual.js');
const female=read('../src/meshy-mira-visual.js');
const copy=o=>JSON.parse(JSON.stringify(o));
test('F1b all five physical appliances are scene grouped and registered for touch picking',()=>{
  assert.deepEqual(F1_MOVEABLE_PREFABS,
    ['nightstand','table','tv','plant','bed','sofa','fridge','shower','toilet']);
  for(const key of ['bed','sofa','fridge','shower','toilet']){
    assert.ok(scene.includes("withDecor('"+key+"',()=>{"),key);
    assert.ok(scene.includes("touchBox('"+key+"'"),key);
    assert.ok(FURNITURE_CATALOG[key].actionId,key);
  }
  assert.match(scene,/fixtureType:decorDrawing\?\.origin\.prefabId\|\|null/);
  assert.match(scene,/bounds:furnitureBounds\(game\.world,volume\.fixtureType/);
  assert.match(scene,/const placed=furniturePoint\(game\.world,id,/);
});
test('F1b bed two slots and available sleeping destination use current transformed instance',()=>{
  const root=newHousehold();
  const bed=root.world.furniture.instances.find(i=>i.prefabId==='bed');
  bed.x=-1.8;bed.z=-1.1;bed.yaw=90;root.world.furniture.revision++;
  for(const slot of ['left','right']){
    const expected=furniturePoint(root.world,'bed',BED_SLOTS[slot].approach);
    assert.ok(expected&&Number.isFinite(expected.x)&&Number.isFinite(expected.z));
    assert.notDeepEqual(expected,BED_SLOTS[slot].approach);
  }
  const choice=chooseFreeBedSlot(root.position,[],root.world);
  if(choice){
    assert.deepEqual(bedDestinationFor(root,'alex'),
      furniturePoint(root.world,'bed',BED_SLOTS[choice].approach));
  }
  assert.match(house,/const to=furniturePoint\(world,'bed',BED_SLOTS\[id\]\.approach\)/);
  assert.match(layout,/findPath\(person,furniturePoint\(candidate,'bed',slot\.approach\),candidate\)/);
});
test('F1b positional frame transforms keep sitter, masked toilet and bathing shower co-located',()=>{
  const world=newFurnitureWorld();
  for(const type of ['sofa','toilet','shower']){
    const i=world.instances.find(item=>item.prefabId===type);
    i.x=0;i.z=0;i.yaw=270;
  }
  const seated=furniturePose(world,'sofa',SOFA_POSE);
  assert.ok(Math.abs(seated.x)>0);
  assert.equal(seated.yaw,SOFA_POSE.yaw-270);
  const wc=toiletSequence(16,26);
  assert.equal(toiletPrivacyInvariant(wc),true);
  const seat=furniturePose(world,'toilet',wc.pose);
  const mask=furniturePoint(world,'toilet',{...TOILET_LAYOUT.interior,y:0});
  assert.equal(seat.x,mask.x);
  assert.ok(Math.abs(seat.z-mask.z)<=1.04);
  const shower=showerSequence(20,32);
  assert.equal(showerPrivacyInvariant(shower),true);
  const pose=furniturePose(world,'shower',shower.pose);
  assert.ok(Math.abs(pose.x-furniturePoint(world,'shower',SHOWER_LAYOUT.interior).x)<.2);
  assert.ok(Math.abs(pose.z-furniturePoint(world,'shower',SHOWER_LAYOUT.interior).z)<.2);
  assert.deepEqual(inverseFurniturePose(world,'shower',pose),shower.pose);
  assert.match(scene,/showerPrivacy\.setLocalPosition\(SHOWER_LAYOUT\.interior\.x-decorDrawing\.origin\.x/);
  assert.match(scene,/toiletPrivacy\.setLocalPosition\(TOILET_LAYOUT\.interior\.x-decorDrawing\.origin\.x/);
});
test('fridge door hinge, hand targets, water, quilt and Meshy seat are instance-based',()=>{
  for(const phrase of [
    "decorDrawing.node.addChild(fridgeHinge)",
    "FRIDGE_LAYOUT.hinge.x-decorDrawing.origin.x",
    "const liveFridgeLayout=()=>fixtureContactLayout(game.world,'fridge',FRIDGE_LAYOUT)",
    "fridgeLayout:liveFridgeLayout",
    "fridgeOpen>.001",
    "drop.setLocalPosition(-4.28+(i%5)*.22-showerOrigin.x",
    "quilts[slot].body.setLocalPosition",
    "const makeSofaSeat=()=>",
    "refreshSofaSeat=()=>{livingSofaSeat=makeSofaSeat();}"
  ])assert.ok(scene.includes(phrase),phrase);
  assert.match(mesh,/const layoutNow=\(\)=>typeof layout==='function'\?layout\(\):layout/);
  assert.match(male,/layout:fridgeLayout\|\|undefined/);
  assert.match(female,/layout:fridgeLayout\|\|undefined/);
});
test('F1b busy fixture blocks editor relocation and game state retains queue/old save schema',()=>{
  const w=newFurnitureWorld();
  const editor=createFurnitureEditor(w);
  for(const type of ['bed','sofa','fridge','shower','toilet']){
    const item=w.instances.find(i=>i.prefabId===type);
    const res=editor.commit(item.instanceId,{x:item.x+.25,z:item.z,yaw:0},
      {lockedInstanceIds:[item.instanceId],residents:[]});
    assert.equal(res.reason,'reserved',type);
    assert.equal(res.ok,false,type);
  }
  const state=newHousehold();
  assert.deepEqual(loadHousehold(copy(state)).world.furniture,state.world.furniture);
  assert.match(scene,/if\(Object\.values\(bedStates\)\.some\(s=>s\.progress>0\)\)/);
  assert.match(scene,/if\(Object\.values\(showerStates\)\.some\(s=>s\.active\)\)/);
  assert.match(scene,/if\(Object\.values\(toiletStates\)\.some\(s=>s\.active\)\)/);
  assert.match(scene,/if\(fridgeOpen>\.001\|\|Object\.values\(fridgeLeaving\)\.some\(Boolean\)\)/);
});
test('F1b active visual timelines use transformed resident contact not mutable hardcoded constants',()=>{
  for(const phrase of [
    "furniturePose(game.world,'sofa',sofaTransitionPose(sofaStates.alex))",
    "furniturePose(game.world,'sofa',sofaTransitionPose(sofaStates.mira))",
    "furniturePose(game.world,'bed',bedTransitionPose(bedStates.alex))",
    "furniturePose(game.world,'bed',bedTransitionPose(bedStates.mira))",
    "furniturePose(game.world,'shower',showerStates.alex.frame.pose)",
    "furniturePose(game.world,'shower',showerStates.mira.frame.pose)",
    "furniturePose(game.world,'toilet',toiletStates.alex.frame.pose)",
    "furniturePose(game.world,'toilet',toiletStates.mira.frame.pose)",
    "inverseFurniturePose(game.world,'bed',display)",
    "inverseFurniturePose(game.world,'bed',miraDisplay)"
  ])assert.ok(scene.includes(phrase),phrase);
});
