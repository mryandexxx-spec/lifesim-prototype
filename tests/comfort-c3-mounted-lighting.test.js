import test from 'node:test';
import assert from 'node:assert/strict';
import {newConstructionWorld,starterShellSegments,constructionRooms} from '../src/construction.js';
import {createCalendar} from '../src/calendar-core.js';
import {MOUNTED_LIGHTS,lightingMountPose,lightingRoomAt,mountedLightIsOn,
  setMountedLightMode,mountedFixturesSurviveEdit} from '../src/mounted-lighting.js';

const c=()=>newConstructionWorld();
const calendar=createCalendar('2026-11-18');
test('C3 four independently priced, original SKU identities and mounting modes',()=>{
  assert.deepEqual(Object.keys(MOUNTED_LIGHTS),['sconce.halo','sconce.leaf','ceiling.globe','ceiling.ring']);
  assert.equal(new Set(Object.values(MOUNTED_LIGHTS).map(x=>x.modelKey)).size,4);
  assert.deepEqual(Object.values(MOUNTED_LIGHTS).map(x=>x.mount),['wall','wall','ceiling','ceiling']);
});
test('C3 ceiling and wall anchors are derived from real construction, never renderer cutaway',()=>{
  const world=c(),room=constructionRooms(world)[0];
  assert.ok(room);
  const ceiling=lightingMountPose(world,'ceiling.globe',{x:0,z:0});
  assert.ok(ceiling&&ceiling.y>1.5&&ceiling.roomId);
  assert.equal(lightingMountPose(world,'ceiling.globe',{x:100,z:100}),null);
  const north=starterShellSegments(world).find(w=>w.starterSide==='north'&&w.i===0);
  assert.ok(north);
  const wall=lightingMountPose(world,'sconce.halo',{edgeId:north.id,side:1,t:.5});
  assert.ok(wall&&wall.y>1.5&&wall.roomId);
  assert.equal(lightingMountPose(world,'sconce.halo',{edgeId:'missing',side:1}),null);
  assert.equal(lightingMountPose(world,'sconce.halo',{edgeId:north.id,side:0}),null);
});
test('C3 auto obeys true game night, same room, proximity, absence and manual overrides',()=>{
  const construction=c(),fixture={instanceId:'shop-ceilinglight-1',itemDefinitionId:'ceiling.globe',
    prefabId:'ceilinglight',x:0,z:0,location:'home',mount:{x:0,z:0},lightMode:'auto'};
  const state=(minutes,residents,extra={})=>mountedLightIsOn({
    fixture:{...fixture,...extra},construction,calendar,minutes,residents});
  assert.equal(state(0,[{x:0,z:0}]),true);
  assert.equal(state(720,[{x:0,z:0}]),false);
  assert.equal(state(0,[{x:12,z:0}]),false);
  assert.equal(state(0,[{x:0,z:0,away:true}]),false);
  assert.equal(state(0,[{x:0,z:0,home:false}]),false);
  assert.equal(state(0,[]),false);
  assert.equal(state(720,[],{lightMode:'on'}),true);
  assert.equal(state(0,[{x:0,z:0}],{lightMode:'off'}),false);
  assert.equal(state(0,[{x:0,z:0}],{location:'storage'}),false);
});
test('C3 mode edit is immutable and rejects malformed saved control commands',()=>{
  const world={schema:1,revision:1,instances:[{instanceId:'light-1',itemDefinitionId:'sconce.leaf'}]};
  const result=setMountedLightMode(world,'light-1','off');
  assert.equal(result.ok,true);assert.equal(result.world.instances[0].lightMode,'off');
  assert.equal(world.instances[0].lightMode,undefined);
  assert.equal(setMountedLightMode(world,'light-1','random').ok,false);
  assert.equal(setMountedLightMode(world,'light-2','on').ok,false);
});
test('C3 refuses construction changes that would orphan a paid wall fixture',()=>{
  const before=c(),edge=starterShellSegments(before).find(w=>w.starterSide==='north'&&w.i===0);
  const pose=lightingMountPose(before,'sconce.halo',{edgeId:edge.id,side:1});
  assert.ok(pose);
  const furniture={instances:[{instanceId:'light-1',itemDefinitionId:'sconce.halo',
    location:'home',mount:{edgeId:edge.id,side:1},x:pose.x,z:pose.z}]};
  assert.equal(mountedFixturesSurviveEdit(before,before,furniture).ok,true);
  const after={...before,starterRemoved:[edge.id]};
  assert.equal(mountedFixturesSurviveEdit(before,after,furniture).reason,
    'mounted-light-blocks-construction');
});
