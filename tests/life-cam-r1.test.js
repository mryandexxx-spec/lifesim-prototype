/** Life CAM-R1 regression: midpoint drag + actual twist both orbit.
 * Only the transient camera state changes. No save, economy or game clock.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCameraGestureSession} from '../src/camera-gestures.js';
import {CAMERA_INITIAL,CAMERA_BOUNDS} from '../src/camera-controls.js';
const p=(id,x,y)=>({id,x,y});
const view=()=>({...CAMERA_INITIAL});
const angleGap=(a,b)=>Math.abs(((a-b+540)%360)-180);
const close=(a,b,eps=1e-7)=>Math.abs(a-b)<eps;

test('two-finger quarter twist rotates yaw while final midpoint stays fixed',()=>{
  const g=createCameraGestureSession(),before=view();
  assert.equal(g.begin(p(1,100,100),0),true);
  assert.equal(g.begin(p(2,200,100),20),true);
  let s=g.move(p(1,150,50),before,844);
  s=g.move(p(2,150,150),s.view,844);
  assert.ok(angleGap(s.view.yaw,before.yaw)>80,'a quarter twist needs a responsive yaw');
  assert.ok(close(s.view.pitch,before.pitch),'fixed midpoint must not tilt');
  assert.ok(close(s.view.distance,before.distance),'no lasting zoom if finger spacing unchanged');
  assert.ok(close(s.view.centerX,before.centerX));
  assert.ok(close(s.view.centerZ,before.centerZ));
  assert.equal(g.end(p(2,150,150),110),null);
  assert.equal(g.end(p(1,150,50),130),null);
});

test('two-finger parallel drag retains directional yaw and pitch',()=>{
  const g=createCameraGestureSession(),before=view();
  g.begin(p(1,100,100),0);g.begin(p(2,200,100),10);
  let s=g.move(p(1,130,120),before,390);
  s=g.move(p(2,230,120),s.view,390);
  assert.ok(angleGap(s.view.yaw,before.yaw)>12,'drag yaw responsiveness');
  assert.ok(s.view.pitch>before.pitch,'drag should tilt upward');
  assert.ok(close(s.view.distance,before.distance),'parallel fingers do not pinch');
});

test('pure pinch changes distance without permanent yaw or target drift',()=>{
  const g=createCameraGestureSession(),before=view();
  g.begin(p(1,100,100),0);g.begin(p(2,200,100),10);
  let s=g.move(p(1,80,100),before,568);
  s=g.move(p(2,220,100),s.view,568);
  assert.ok(s.view.distance<before.distance);
  assert.ok(close(s.view.yaw,before.yaw));
  assert.ok(close(s.view.pitch,before.pitch));
  assert.ok(close(s.view.centerX,before.centerX));
});

test('twist angle wrap at +/-180 degrees is continuous, not a full revolution',()=>{
  const g=createCameraGestureSession(),before=view();
  g.begin(p(1,100,100),0);g.begin(p(2,0,101),10);
  const s=g.move(p(2,0,99),before,844);
  assert.ok(angleGap(s.view.yaw,before.yaw)>0.5);
  assert.ok(angleGap(s.view.yaw,before.yaw)<5,'no 358-degree jump');
});

test('near-coincident fingers and microscopic twist do not spin',()=>{
  const g=createCameraGestureSession(),before=view();
  g.begin(p(1,100,100),0);g.begin(p(2,108,100),10);
  const s=g.move(p(2,106,106),before,844);
  assert.ok(angleGap(s.view.yaw,before.yaw)<3,'no unstable near-zero pinch twist');
  assert.ok(s.view.distance>=CAMERA_BOUNDS.minDistance);
  const stable=createCameraGestureSession();
  stable.begin(p(1,100,100),0);stable.begin(p(2,200,100),10);
  const tiny=stable.move(p(2,200,100.2),before,844);
  assert.ok(close(tiny.view.yaw,before.yaw),'discard sub-degree angle jitter');
});

test('cancel, residual pointer and reset never generate phantom camera rotation',()=>{
  const g=createCameraGestureSession(),before=view();
  g.begin(p(1,100,100),0);g.begin(p(2,200,100),10);
  const s=g.move(p(2,205,160),before,390);
  assert.ok(s.changed);
  assert.equal(g.end(p(2,205,160),40,{cancel:true}),null);
  assert.equal(g.move(p(1,150,100),s.view,390).changed,false);
  assert.equal(g.end(p(1,150,100),60),null);
  g.clear();
  assert.equal(g.count(),0);
  g.begin(p(3,100,100),70);g.begin(p(4,200,100),80);
  const fresh=g.move(p(4,200,100.1),before,390);
  assert.ok(close(fresh.view.yaw,before.yaw));
});

test('1-finger navigation remains unchanged in life and placement modes',()=>{
  const g=createCameraGestureSession(),before=view();
  g.begin(p(1,100,100),0);
  let s=g.move(p(1,155,125),before,844);
  assert.ok(s.changed);
  assert.ok(close(s.view.yaw,before.yaw),'ordinary swipe still pans');
  g.clear();g.begin(p(7,110,110),0);
  s=g.move(p(7,150,130),before,844,{oneFinger:'placement'});
  assert.equal(s.changed,false);
  assert.deepEqual(s.placementDelta,{dx:40,dy:20});
});
