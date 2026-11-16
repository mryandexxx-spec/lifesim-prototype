import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createFurnitureHoldGesture,FURNITURE_HOLD_MS} from '../src/furniture-hold.js';
import {createCameraGestureSession} from '../src/camera-gestures.js';
import {CAMERA_INITIAL} from '../src/camera-controls.js';
const read=file=>readFileSync(new URL(file,import.meta.url),'utf8');
const game=read('../src/game.js');
const page=read('../.github/workflows/pages.yml');
const pt=(id,x,y)=>({id,x,y});
test('pan over a sofa begins before any furniture pickup',()=>{
  const camera=createCameraGestureSession(),hold=createFurnitureHoldGesture();
  camera.begin(pt(1,130,130),0);hold.begin(pt(1,130,130),'home-sofa-1',0);
  assert.equal(hold.move(pt(1,150,130)),'camera');
  const panned=camera.move(pt(1,150,130),{...CAMERA_INITIAL},700);
  assert.equal(panned.changed,true);
  assert.equal(panned.view.yaw,CAMERA_INITIAL.yaw);
  assert.notEqual(panned.view.centerX,CAMERA_INITIAL.centerX);
  assert.equal(hold.activate(700),null);
  assert.equal(camera.end(pt(1,150,130),701),null);
});
test('pan over movable toilet goes to camera and cannot change object',()=>{
  const camera=createCameraGestureSession(),hold=createFurnitureHoldGesture();
  camera.begin(pt(1,120,90),0);hold.begin(pt(1,120,90),'home-toilet-1',0);
  assert.equal(hold.move(pt(1,125,116)),'camera');
  const moved=camera.move(pt(1,125,116),{...CAMERA_INITIAL},650,{oneFinger:'pan'});
  assert.equal(moved.changed,true);
  assert.notEqual(moved.view.centerZ,CAMERA_INITIAL.centerZ);
  assert.equal(hold.activate(550),null);
});
test('second finger preempts the hold, preserves ordinary pinch and cancels all taps',()=>{
  const camera=createCameraGestureSession(),hold=createFurnitureHoldGesture();
  camera.begin(pt(1,100,100),0);hold.begin(pt(1,100,100),'home-bed-1',0);
  hold.cancel();camera.begin(pt(2,200,100),90);
  assert.equal(camera.count(),2);
  const changed=camera.move(pt(2,260,100),{...CAMERA_INITIAL},650);
  assert.equal(changed.changed,true);
  assert.equal(hold.activate(600),null);
  assert.equal(camera.end(pt(2,260,100),610),null);
  assert.equal(camera.end(pt(1,100,100),615),null);
});
test('short tap over any furniture can select but never mutates a pose',()=>{
  const camera=createCameraGestureSession(),hold=createFurnitureHoldGesture();
  const click=pt(1,100,100);
  camera.begin(click,0);hold.begin(click,'home-fridge-1',0);
  assert.deepEqual(hold.end(click),{kind:'tap',instanceId:'home-fridge-1'});
  assert.deepEqual(camera.end(click,150),{x:100,y:100});
  assert.equal(hold.active,false);
});
test('stationary long press disqualifies click before the user drags object',()=>{
  const camera=createCameraGestureSession(),hold=createFurnitureHoldGesture();
  const p=pt(1,100,100);
  camera.begin(p,0);hold.begin(p,'home-shower-1',0);
  const activated=hold.activate(FURNITURE_HOLD_MS);
  assert.ok(activated);
  camera.clear();
  assert.equal(camera.end(p,520),null);
  assert.equal(hold.move(pt(1,150,100)),'drag');
  assert.deepEqual(hold.end(pt(1,150,100)),
    {kind:'drop',instanceId:'home-shower-1'});
});
test('Game input: pickup only in timed callback, never on pointerdown, with shared camera',()=>{
  const down=game.slice(game.indexOf("canvas.addEventListener('pointerdown'"),
    game.indexOf("window.addEventListener('pointermove'"));
  assert.ok(down.includes('cameraGesture.begin(point,now)'));
  assert.ok(down.includes('armFurnitureHold(event,now)'));
  assert.doesNotMatch(down,/startEditorDrag\(event\)/);
  assert.match(game,/const armFurnitureHold=\(event,now\)=>/);
  assert.match(game,/if\(!furnishMode\|\|shopOpen\|\|warehouseOpen\|\|cameraGesture\.count\(\)!==1\)return/);
  assert.match(game,/furnitureHoldTimer=setTimeout\(\(\)=>\{/);
  assert.match(game,/furnitureHoldTimer=null;/);
  assert.match(game,/holdGesture\.activate\(performance\.now\(\)\)/);
  assert.match(game,/cameraGesture\.clear\(\);\s*const grabEvent=/);
  assert.match(game,/if\(!startEditorDrag\(grabEvent\)\)holdGesture\.cancel\(\)/);
});
test('Game input: iPhone cancelled/second touches never commit layout or suppress camera',()=>{
  assert.match(game,/if\(furnishMode&&editDrag\)\{[\s\S]*?cameraGesture\.begin\(first,now\)/);
  assert.match(game,/if\(furnishMode\)cancelPendingGrab\(\)/);
  assert.match(game,/if\(holdGesture\.move\(gesturePoint\(event\)\)==='camera'\)\{/);
  assert.match(game,/const result=cameraGesture\.move\(gesturePoint\(event\),view,/);
  assert.match(game,/if\(furnishMode&&holdGesture\.pointerId===event\.pointerId\)\s*cancelPendingGrab\(\)/);
  assert.match(game,/window\.addEventListener\('pointercancel',event=>\{/);
  assert.match(game,/window\.addEventListener\('blur',\(\)=>\{\s*cancelPendingGrab\(\)/);
  assert.match(game,/document\.addEventListener\('visibilitychange',\(\)=>\{/);
  assert.match(game,/canvas\.addEventListener\('lostpointercapture',event=>\{/);
  assert.match(game,/const exitFurniture=\(\)=>\{\s*if\(!furnishMode\)return;\s*cancelPendingGrab\(\)/);
  assert.match(game,/canvas\.addEventListener\('contextmenu',event=>event\.preventDefault\(\)\)/);
  assert.match(game,/if\(event\.cancelable\)event\.preventDefault\(\)/);
});
test('Old v1 household, queued actions, M4 and M5 are not part of this transient gesture',()=>{
  const src=read('../src/furniture-hold.js');
  assert.doesNotMatch(src,/localStorage|world\.furniture|save\(|document|window|playcanvas/);
  assert.match(game,/commitFurniture\(instanceId,pose\)/);
  assert.match(game,/refreshMind\(game\.otherSim,game\.world\)/);
  assert.match(game,/proposeFurnitureMove\(game\.world\.furniture,editDrag\.instanceId,pose,editorContext\(\)\)/);
  assert.match(game,/if\(furnishMode&&endEditorDrag\(event\)\)return/);
  assert.match(read('../src/simulation.js'),/lifesim\.room01\.v1/);
});
test('Pages includes tested non-DOM long-press module before GitHub deploy',()=>{
  assert.match(page,/node --check src\/furniture-hold\.js/);
  assert.match(page,/cp src\/furniture-catalog\.js src\/furniture-layout\.js src\/furniture-editor\.js src\/furniture-transform\.js src\/furniture-hold\.js site\/src\//);
});
