import test from 'node:test';
import assert from 'node:assert/strict';
import {CAMERA_INITIAL,CAMERA_BOUNDS,CAMERA_LOT_BOUNDS,setCameraBuildBounds,panCamera,orbitCamera,pinchCamera,wheelCamera,screenFloorDragDelta} from '../src/camera-controls.js';
const near=(x,y,eps=.00001)=>Math.abs(x-y)<=eps;
test('one finger drags camera target without rotating or zooming',()=>{
 const a={...CAMERA_INITIAL},b=panCamera(a,80,35,800);
 assert.equal(b.yaw,a.yaw);assert.equal(b.pitch,a.pitch);assert.equal(b.distance,a.distance);
 assert.ok(b.centerX<a.centerX&&Math.abs(b.centerZ-a.centerZ)>.1);
 assert.deepEqual(a,CAMERA_INITIAL);
});
test('reverse swipe restores view center on XZ plane',()=>{
 const a=panCamera(CAMERA_INITIAL,60,-45,900);
 const b=panCamera(a,-60,45,900);
 assert.ok(near(b.centerX,0)&&near(b.centerZ,0));
});
test('screen dragging follows camera-oriented axes',()=>{
 const a={...CAMERA_INITIAL,yaw:0};
 const right=panCamera(a,100,0,780),down=panCamera(a,0,100,780);
 assert.ok(right.centerX<0&&near(right.centerZ,0));
 assert.ok(down.centerZ<0&&near(down.centerX,0));
 const turned=panCamera({...a,yaw:90},100,0,780);
 assert.ok(turned.centerZ>0&&near(turned.centerX,0));
});
test('panning is bounded and never changes target height',()=>{
 const b=panCamera(CAMERA_INITIAL,1e5,-1e5,700);
 assert.ok(b.centerX>=CAMERA_BOUNDS.minX&&b.centerX<=CAMERA_BOUNDS.maxX);
 assert.ok(b.centerZ>=CAMERA_BOUNDS.minZ&&b.centerZ<=CAMERA_BOUNDS.maxZ);
 assert.equal(b.centerY,CAMERA_INITIAL.centerY);
});
test('two fingers orbit and tilt without exceeding pitch bounds',()=>{
 const b=orbitCamera(CAMERA_INITIAL,80,60);
 assert.notEqual(b.yaw,CAMERA_INITIAL.yaw);
 assert.ok(b.pitch>CAMERA_INITIAL.pitch);
 assert.equal(orbitCamera(CAMERA_INITIAL,0,1e5).pitch,CAMERA_BOUNDS.maxPitch);
 assert.equal(orbitCamera(CAMERA_INITIAL,0,-1e5).pitch,CAMERA_BOUNDS.minPitch);
 assert.ok(orbitCamera(CAMERA_INITIAL,1e5,0).yaw>=0);
});
test('pinch and desktop zoom respect camera distance bounds',()=>{
 assert.equal(pinchCamera(CAMERA_INITIAL,100,200).distance,CAMERA_BOUNDS.minDistance);
 assert.ok(pinchCamera(CAMERA_INITIAL,200,100).distance>CAMERA_INITIAL.distance);
 assert.equal(wheelCamera(CAMERA_INITIAL,1e6).distance,CAMERA_BOUNDS.maxDistance);
 assert.equal(wheelCamera(CAMERA_INITIAL,-1e6).distance,CAMERA_BOUNDS.minDistance);
});
test('Q1 extended zoom reaches both endpoints in room and lot modes',()=>{
 setCameraBuildBounds(null);
 assert.equal(CAMERA_BOUNDS.minDistance,5.5);
 assert.equal(CAMERA_BOUNDS.maxDistance,64);
 assert.equal(CAMERA_LOT_BOUNDS.minDistance,5.5);
 assert.equal(CAMERA_LOT_BOUNDS.maxDistance,100);
 assert.equal(pinchCamera(CAMERA_INITIAL,200,1000).distance,5.5);
 assert.equal(wheelCamera(CAMERA_INITIAL,10000).distance,64);
 setCameraBuildBounds(CAMERA_LOT_BOUNDS);
 try{
   assert.equal(pinchCamera(CAMERA_INITIAL,200,1000).distance,5.5);
   assert.equal(pinchCamera(CAMERA_INITIAL,200,2).distance,100);
   assert.equal(wheelCamera(CAMERA_INITIAL,10000).distance,100);
   assert.equal(wheelCamera(CAMERA_INITIAL,-10000).distance,5.5);
 }finally{setCameraBuildBounds(null);}
});
test('invalid inputs are harmless; complete reset restores target and angles',()=>{
 assert.deepEqual(panCamera(CAMERA_INITIAL,NaN,20,800),CAMERA_INITIAL);
 assert.deepEqual(panCamera(CAMERA_INITIAL,20,20,0),CAMERA_INITIAL);
 assert.deepEqual(pinchCamera(CAMERA_INITIAL,0,200),CAMERA_INITIAL);
 assert.deepEqual(pinchCamera(CAMERA_INITIAL,100,NaN),CAMERA_INITIAL);
 assert.deepEqual(orbitCamera(CAMERA_INITIAL,Infinity,8),CAMERA_INITIAL);
 const moved=orbitCamera(pinchCamera(panCamera(CAMERA_INITIAL,80,85,800),100,130),70,15);
 assert.notDeepEqual(moved,CAMERA_INITIAL);
 assert.deepEqual({...CAMERA_INITIAL},CAMERA_INITIAL);
});

test('screen-floor item movement exactly opposes unchanged camera grab direction',()=>{
  for(const yaw of [0,42,90,180,270]){
    for(const [dx,dy] of [[80,0],[0,60],[-25,45]]){
      const v={...CAMERA_INITIAL,yaw},d=screenFloorDragDelta(v,dx,dy,800);
      const p=panCamera(v,dx,dy,800);
      assert.ok(near(d.x,-(p.centerX-v.centerX),.000001));
      assert.ok(near(d.z,-(p.centerZ-v.centerZ),.000001));
    }
  }
  assert.ok(screenFloorDragDelta({...CAMERA_INITIAL,yaw:0},80,0,800).x>0);
  assert.ok(screenFloorDragDelta({...CAMERA_INITIAL,yaw:90},80,0,800).z<0);
});
