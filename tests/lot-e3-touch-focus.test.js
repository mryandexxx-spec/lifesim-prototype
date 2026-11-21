/** LOT-E3: reproduce missed fixtures/artwork and jitter-cancelled taps.
 * Deliberate touch arbitration must not alter save or camera gesture modes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {pickWorldRayTarget} from '../src/world-interactions.js';
import {createCameraGestureSession} from '../src/camera-gestures.js';
import {CAMERA_INITIAL} from '../src/camera-controls.js';
const v=(x,y,z)=>({x,y,z});
const near=v(0,0,5),far=v(0,0,-10);
const box=(kind,id,z,extras={})=>({kind,id,
  bounds:{min:v(-.32,-.54,z-.32),max:v(.32,.48,z+.32)},...extras});
const finger=(id,x,y)=>({id,x,y});

test('LOT-E3: ladder/steps/board retain exact paid fixture and pool identities',()=>{
 for(const kind of ['ladder','steps','board']){
  const picked=pickWorldRayTarget(near,far,[
   box('pool-fixture',kind,0,{fixtureId:'fixture-7',poolId:'pool-2'})
  ]);
  assert.deepEqual(picked,{kind:'pool-fixture',id:kind,
   fixtureId:'fixture-7',poolId:'pool-2'});
 }
});

test('LOT-E3: finished artwork remains selectable with owner info',()=>{
 const work={id:'art-2',ownerId:'mira'};
 assert.deepEqual(pickWorldRayTarget(near,far,[
  box('artwork','art-2',0,{work})
 ]),{kind:'artwork',id:'art-2',work});
});

test('LOT-E3: nearest solid item wins; blocker conceals pool ladder',()=>{
 const fixture=box('pool-fixture','ladder',-1,
  {fixtureId:'fixture-1',poolId:'pool-1'});
 assert.deepEqual(pickWorldRayTarget(near,far,[
  fixture,box('outdoor','garden.bench',1,{instanceId:'out-1'})
 ]),{kind:'outdoor',id:'garden.bench',instanceId:'out-1'});
 assert.equal(pickWorldRayTarget(near,far,[
  fixture,box('blocker','solid-table',1)
 ]),null);
 assert.equal(pickWorldRayTarget(v(5,0,5),v(5,0,-10),[fixture]),null);
});

test('LOT-E3: bounded 1-6px reversible thumb jitter is a tap, not a pan',()=>{
 const g=createCameraGestureSession(),view={...CAMERA_INITIAL};
 assert.equal(g.begin(finger(1,180,280),0),true);
 for(let i=0;i<18;i++){
  const p=i%2?finger(1,180,280):finger(1,185,284);
  const result=g.move(p,view,844);
  assert.equal(result.changed,false,'jitter should not cross distance-based touch slop');
 }
 assert.deepEqual(g.end(finger(1,183,281),190),{x:183,y:281});
});

test('LOT-E3: a real drag stays a drag after returning to the start',()=>{
 const g=createCameraGestureSession(),view={...CAMERA_INITIAL};
 g.begin(finger(2,120,210),0);
 const swipe=g.move(finger(2,147,222),view,568);
 assert.equal(swipe.changed,true);
 g.move(finger(2,121,210),swipe.view,568);
 assert.equal(g.end(finger(2,121,210),110),null);
});

test('LOT-E3: pinch and pointercancel never generate selection or residual pan',()=>{
 const g=createCameraGestureSession(),view={...CAMERA_INITIAL};
 g.begin(finger(1,100,100),0);g.begin(finger(2,160,100),20);
 let s=g.move(finger(1,80,100),view,568);
 s=g.move(finger(2,180,100),s.view,568);
 assert.ok(s.view.distance<view.distance);
 assert.equal(s.view.centerX,view.centerX);
 assert.equal(s.view.centerZ,view.centerZ);
 assert.equal(g.end(finger(2,180,100),50,{cancel:true}),null);
 assert.equal(g.move(finger(1,135,100),s.view,568).changed,false);
 assert.equal(g.end(finger(1,135,100),80),null);
 g.begin(finger(3,100,100),90);
 assert.deepEqual(g.end(finger(3,100,100),130),{x:100,y:100});
});
