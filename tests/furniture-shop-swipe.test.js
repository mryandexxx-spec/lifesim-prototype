import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {CAMERA_INITIAL,screenFloorDragDelta} from '../src/camera-controls.js';
import {cameraPlacementPose,dragShopPlacement} from '../src/furniture-placement-preview.js';
import {snapFurnitureCoordinate} from '../src/furniture-editor.js';
const src=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const game=src('../src/game.js'),html=src('../index.html');
const near=(a,b,eps=1e-7)=>Math.abs(a-b)<eps;

test('pending purchase preview follows positive finger motion on ground at every camera yaw',()=>{
 for(const yaw of [0,42,90,180,270]){
  const view={...CAMERA_INITIAL,yaw},start={x:0,z:0,yaw:90};
  for(const [dx,dy] of [[70,0],[0,55],[-55,-20]]){
   const moved=dragShopPlacement(view,start,dx,dy,750);
   const delta=screenFloorDragDelta(view,dx,dy,750);
   assert.ok(near(moved.x,delta.x));assert.ok(near(moved.z,delta.z));
   assert.equal(moved.yaw,90);
  }
 }
});
test('sub-grid touch movement accumulates without snapping loss; room limits apply',()=>{
 const view={...CAMERA_INITIAL,yaw:0};let raw={x:0,z:0,yaw:270};
 for(let i=0;i<20;i++)raw=dragShopPlacement(view,raw,3,0,750);
 assert.ok(raw.x>.2);
 assert.ok(snapFurnitureCoordinate(raw.x)>=.25);
 assert.deepEqual(dragShopPlacement(view,{x:4.25,z:3.75,yaw:180},30000,30000,750),
   {x:4.25,z:3.75,yaw:180});
 assert.equal(dragShopPlacement(view,null,4,3,750),null);
});
test('real game pointermove moves shop preview only, not camera; 2-finger orbit retains world pose',()=>{
 const start=game.indexOf("  window.addEventListener('pointermove',event=>{");
 const end=game.indexOf('  // CSS-pixel tap ->',start);
 assert.ok(start>0&&end>start);
 const handlers={},view={...CAMERA_INITIAL},initial=cameraPlacementPose(view);
 let lastMode=null;
 const ctx={
   window:{addEventListener(kind,fn){handlers[kind]=fn;}},
   furnishMode:true,editDrag:null,holdGesture:{pending:false},
   cameraGesture:{count:()=>1,move(point,v,h,options){
      lastMode=options.oneFinger;
      return {view:v,changed:false,placementDelta:{dx:95,dy:45}};
   }},
   dialogueNeedsDecision:()=>false,game:{},gesturePoint:e=>e,
   canvas:{clientHeight:750},view,oneFingerMode:'pan',shopPlacing:true,
   shopPose:initial,shopSwipeRawPose:null,shopManualPose:false,
   dragShopPlacement,snapFurnitureCoordinate,
   renders:0,viewChanges:0,renderMarket(){},setView(){},
   cancelPendingGrab(){},moveEditorDrag(){},
   performance:{now:()=>100}
 };
 ctx.renderMarket=()=>{ctx.renders++};
 ctx.setView=()=>{ctx.viewChanges++};
 runInNewContext('(()=>{'+game.slice(start,end)+'})()',ctx,{timeout:1000});
 let prevented=false;
 handlers.pointermove({pointerId:1,clientX:200,clientY:200,cancelable:true,
   preventDefault(){prevented=true}});
 assert.equal(lastMode,'placement');
 assert.equal(prevented,true);
 assert.equal(ctx.viewChanges,0);
 assert.equal(ctx.view.centerX,view.centerX);
 assert.equal(ctx.view.centerZ,view.centerZ);
 assert.notDeepEqual(ctx.shopPose,initial);
 assert.equal(ctx.shopManualPose,true);assert.ok(ctx.renders>0);
 const frozen={...ctx.shopPose};
 ctx.cameraGesture.move=()=>({view:{...view,yaw:view.yaw+10},changed:true});
 handlers.pointermove({pointerId:1,clientX:230,clientY:200,cancelable:true,
   preventDefault(){}});
 assert.equal(ctx.viewChanges,1);
 assert.equal(JSON.stringify(ctx.shopPose),JSON.stringify(frozen));
});
test('shop-only mode preserves existing furniture long hold and two-step unpaid confirmation',()=>{
 assert.match(game,/shopPlacing&&oneFingerMode==='pan'\s*\?'placement':oneFingerMode/);
 assert.match(game,/shopSwipeRawPose=dragShopPlacement\(view,shopSwipeRawPose\|\|shopPose/);
 assert.match(game,/shopSwipeRawPose=null; \/\/ next gesture starts/);
 assert.match(game,/shopPlacing=true;shopPose=null/);
 assert.match(game,/moveShopPreviewToCamera\(true\)/);
 assert.match(game,/Веди предмет пальцем по полу/);
 assert.match(game,/armFurnitureHold\(event,now\)/);
 assert.match(html,/сборка \/ 1\.2j/);
});

test('shop overlay describes the correct swipe and orbit switch updates guidance',()=>{
 assert.match(game,/Один палец — перемещение предмета · два — камера и масштаб/);
 assert.match(game,/Один палец — вращение камеры · два — вращение и масштаб/);
 assert.match(game,/if\(furnishMode&&shopPlacing\)renderMarket\(\)/);
 assert.doesNotMatch(game,/Сдвигай камеру или выбери место/);
});
