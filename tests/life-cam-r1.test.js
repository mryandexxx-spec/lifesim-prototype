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
  assert.ok(close(s.view.yaw,before.yaw+90),'clockwise quarter-turn must follow the fingers 1:1');
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

test('anchored twist follows either finger and is independent of sampling and pinch',()=>{
  for(const direction of [-1,1]){
    for(const samples of [1,12,600]){
      for(const anchorId of [1,2]){
        const g=createCameraGestureSession(),before=view();
        const anchor=p(anchorId,180,220),movingId=3-anchorId;
        const start=p(movingId,260,220);
        for(const point of (anchorId===1?[anchor,start]:[start,anchor]))g.begin(point);
        let current=before;
        for(let i=1;i<=samples;i++){
          const progress=i/samples,angle=direction*90*progress*Math.PI/180;
          const radius=80+20*progress;
          current=g.move(p(movingId,anchor.x+radius*Math.cos(angle),
            anchor.y+radius*Math.sin(angle)),current,844).view;
          if(progress*90>=.35){
            assert.ok(angleGap(current.yaw,before.yaw+direction*90*progress)<1e-7);
          }
          assert.ok(close(current.pitch,before.pitch),'stationary finger contributes no drag tilt');
        }
        assert.ok(close(current.distance,before.distance*80/100));
      }
    }
  }
});

test('a new pair uses current contact positions after a single-finger swipe',()=>{
  const g=createCameraGestureSession();
  g.begin(p(1,100,100));
  const pan=g.move(p(1,160,100),view(),844).view;
  g.begin(p(2,240,100));
  const zoom=g.move(p(2,290,100),pan,844).view;
  assert.ok(close(zoom.yaw,pan.yaw));
  assert.ok(close(zoom.pitch,pan.pitch));
  assert.ok(close(zoom.distance,pan.distance*80/130));
});
