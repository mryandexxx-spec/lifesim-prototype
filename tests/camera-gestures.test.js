import test from 'node:test';
import assert from 'node:assert/strict';
import {createCameraGestureSession,TAP_SLOP_PX} from '../src/camera-gestures.js';
import {CAMERA_INITIAL,CAMERA_BOUNDS} from '../src/camera-controls.js';
const pt=(id,x,y)=>({id,x,y});
const initial=()=>({...CAMERA_INITIAL});
test('single gentle touch remains a selectable tap; hand jitter does not rotate',()=>{
 const g=createCameraGestureSession(),v=initial();
 assert.equal(g.begin(pt(5,100,210),12),true);
 assert.deepEqual(g.move(pt(5,104,213),v,700),{view:v,changed:false});
 assert.deepEqual(g.end(pt(5,105,213),190),{x:105,y:213});
 assert.deepEqual(v,CAMERA_INITIAL);assert.equal(g.count(),0);
});
test('single drag orbits without moving target: initial slop not lost',()=>{
 const g=createCameraGestureSession();g.begin(pt(1,120,120),0);
 let r=g.move(pt(1,125,123),initial(),680);
 assert.equal(r.changed,false);
 r=g.move(pt(1,145,140),r.view,680);
 assert.equal(r.changed,true);assert.notEqual(r.view.yaw,CAMERA_INITIAL.yaw);
 assert.notEqual(r.view.pitch,CAMERA_INITIAL.pitch);
 assert.equal(r.view.centerX,CAMERA_INITIAL.centerX);
 assert.equal(r.view.centerZ,CAMERA_INITIAL.centerZ);
 assert.equal(g.end(pt(1,145,140),170),null);
});
test('explicit one-finger pan remains accessible but is not default',()=>{
 const g=createCameraGestureSession();g.begin(pt(1,100,100),0);
 const r=g.move(pt(1,145,155),initial(),680,{oneFinger:'pan'});
 assert.equal(r.changed,true);assert.equal(r.view.yaw,CAMERA_INITIAL.yaw);
 assert.notEqual(r.view.centerX,CAMERA_INITIAL.centerX);
});
test('two-finger translation pans without rotating; pinch zooms while tracking centroid',()=>{
 const g=createCameraGestureSession();g.begin(pt(1,100,100),0);
 g.begin(pt(2,200,100),70);
 let r=g.move(pt(1,120,110),initial(),680);
 r=g.move(pt(2,220,110),r.view,680);
 assert.equal(r.view.yaw,CAMERA_INITIAL.yaw);
 assert.equal(r.view.pitch,CAMERA_INITIAL.pitch);
 assert.notEqual(r.view.centerX,CAMERA_INITIAL.centerX);
 assert.equal(r.view.distance,CAMERA_INITIAL.distance);
 const near=g.move(pt(1,80,110),r.view,680);
 assert.ok(near.view.distance<CAMERA_INITIAL.distance);
 g.end(pt(2,220,110),250);
 assert.equal(g.end(pt(1,80,110),300),null);
});
test('second touch disqualifies all taps, including residual one-finger and cancellation',()=>{
 const g=createCameraGestureSession();
 g.begin(pt(1,140,160),0);
 g.begin(pt(2,200,160),40);
 assert.equal(g.end(pt(2,200,160),60),null);
 assert.equal(g.move(pt(1,240,160),initial(),690).changed,false);
 assert.equal(g.end(pt(1,240,160),100),null);
 g.begin(pt(3,110,110),200);
 assert.deepEqual(g.end(pt(3,110,110),250),{x:110,y:110});
 g.begin(pt(4,200,180),0);
 assert.equal(g.end(pt(4,200,180),80,{cancel:true}),null);
});
test('duration, travel and out-of-order pointers are safe',()=>{
 const g=createCameraGestureSession();
 assert.equal(g.begin(pt(1,20,20),500),true);
 assert.equal(g.begin(pt(1,20,20),500),false);
 assert.equal(g.move(pt(11,0,0),initial(),650).changed,false);
 assert.equal(g.end(pt(11,0,0),550),null);
 assert.equal(g.end(pt(1,20,20),900),null);
 assert.equal(g.begin(pt(2,0,0),1000),true);
 assert.ok(TAP_SLOP_PX>=9);
 g.clear();assert.equal(g.count(),0);
 assert.equal(g.end(pt(2,0,0),1030),null);
});
test('pinch and orbit remain bounded across aggressive moves',()=>{
 const g=createCameraGestureSession();
 g.begin(pt(1,1,1),0);
 let r=g.move(pt(1,20001,20001),initial(),750);
 assert.ok(r.view.pitch<=CAMERA_BOUNDS.maxPitch);
 g.end(pt(1,20001,20001),100);
 g.begin(pt(2,100,100),150);g.begin(pt(3,200,100),160);
 r=g.move(pt(3,100000,100),initial(),750);
 assert.ok(r.view.distance>=CAMERA_BOUNDS.minDistance);
 assert.ok(r.view.distance<=CAMERA_BOUNDS.maxDistance);
});
