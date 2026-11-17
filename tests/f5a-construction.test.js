import test from 'node:test';
import assert from 'node:assert/strict';
import {newConstructionWorld,restoreConstructionWorld,constructionContains,constructionWallAt,
 proposeConstructionEdit,createConstructionEditor,constructionRooms,constructionWallOutward,BUILD_LOT} from '../src/construction.js';
test('F5-A legacy migration preserves old exact walking envelope, no shifted floor',()=>{
 const old=newConstructionWorld();
 assert.equal(old.schema,1);assert.equal(old.legacy,true);
 assert.equal(constructionContains(old,-4.62,0),true);
 assert.equal(constructionContains(old,13.86,0),true);
 assert.equal(constructionContains(old,15,0),false);
 assert.deepEqual(restoreConstructionWorld(null),old);
 assert.deepEqual(restoreConstructionWorld({schema:1,step:.5,floorCells:['1,2'],wallEdges:[{id:'bad'}],openings:[]}),old);
});
test('F5-A room creates persistent floors, wall segments and distinct rooms',()=>{
 const initial=newConstructionWorld();
 const room=proposeConstructionEdit(initial,{type:'room',from:{x:14,z:-2},to:{x:18,z:2}});
 assert.ok(room.ok,room.reason);
 assert.equal(initial.wallEdges.length,0);
 assert.equal(room.world.wallEdges.length,32);
 assert.ok(constructionContains(room.world,16,0));
 assert.equal(constructionWallAt(room.world,14.01,0),true);
 assert.ok(constructionRooms(room.world).length>=2);
 assert.deepEqual(restoreConstructionWorld(room.world),room.world);
});
test('F5-A door opens three wall edges, window blocks passage',()=>{
 const base=proposeConstructionEdit(newConstructionWorld(),{type:'room',from:{x:14,z:-2},to:{x:18,z:2}}).world;
 const wall=base.wallEdges.find(e=>e.axis==='v'&&e.i===28&&e.j===0);
 assert.ok(wall);
 const door=proposeConstructionEdit(base,{type:'door',edgeId:wall.id});
 assert.equal(door.ok,true);
 assert.equal(door.world.openings[0].edgeIds.length,3);
 assert.equal(constructionWallAt(door.world,14,.25),false);
 const window=proposeConstructionEdit(base,{type:'window',edgeId:wall.id});
 assert.equal(window.ok,true);
 assert.equal(constructionWallAt(window.world,14,.25),true);
 assert.equal(proposeConstructionEdit(door.world,{type:'door',edgeId:wall.id}).ok,false);
});
test('F5-A cannot erase wall with door, collide with resident or delete old floor',()=>{
 const base=proposeConstructionEdit(newConstructionWorld(),{type:'room',from:{x:14,z:-2},to:{x:18,z:2}}).world;
 const wall=base.wallEdges.find(e=>e.axis==='v'&&e.i===28&&e.j===0);
 const door=proposeConstructionEdit(base,{type:'door',edgeId:wall.id}).world;
 assert.equal(proposeConstructionEdit(door,{type:'erase-wall',edgeId:wall.id}).reason,'wall-has-opening');
 assert.equal(proposeConstructionEdit(base,{type:'remove-floor',from:{x:0,z:-1},to:{x:2,z:1}}).reason,'protected-legacy-floor');
 assert.equal(proposeConstructionEdit(base,{type:'remove-floor',from:{x:15,z:-1},to:{x:17,z:1}},
   {residents:[{x:16,z:0}]}).reason,'resident-on-floor');
});
test('F5-A undo/redo and 50 entry bounded transaction history',()=>{
 const editor=createConstructionEditor(newConstructionWorld());
 for(let i=0;i<60;i++){
   const at={x:14.5+i*.5,z:0};
   // All edits must stay inside the lot; alternate two non-overlapping patches.
   const a={x:15,z:0},b={x:16,z:1};
   const out=editor.commit({type:i%2?'remove-floor':'floor',from:a,to:b});
   assert.equal(out.ok,true,out.reason);
 }
 assert.ok(editor.state().canUndo);
 assert.ok(editor.undo().ok);
 assert.ok(editor.redo().ok);
});
test('F5-A edit guards lot and source revision',()=>{
 const original=newConstructionWorld();
 assert.equal(proposeConstructionEdit(original,{type:'room',from:{x:20,z:1},to:{x:25,z:5}}).reason,'lot-bounds');
 assert.equal(proposeConstructionEdit(original,{type:'wall',from:{x:0,z:0},to:{x:1,z:1}}).reason,'wall-must-be-straight');
 assert.equal(original.revision,0);
 assert.equal(BUILD_LOT.maxX,23);
});

test('F5-A wall relocation preserves door IDs and extends foundation safely',()=>{
 const first=proposeConstructionEdit(newConstructionWorld(),{type:'room',
   from:{x:14,z:-2},to:{x:18,z:2}}).world;
 const wall=first.wallEdges.find(w=>w.axis==='v'&&w.i===36&&w.j===0);
 const door=proposeConstructionEdit(first,{type:'door',edgeId:wall.id});
 assert.equal(door.ok,true,door.reason);
 const moved=proposeConstructionEdit(door.world,{type:'move-wall',edgeId:wall.id,deltaI:2,deltaJ:0});
 assert.equal(moved.ok,true,moved.reason);
 assert.ok(moved.world.wallEdges.some(w=>w.axis==='v'&&w.i===38&&w.j===0));
 assert.ok(moved.world.openings[0].edgeIds.every(id=>moved.world.wallEdges.some(w=>w.id===id)));
 assert.ok(constructionContains(moved.world,18.3,0));
 assert.equal(moved.world.openings[0].id,door.world.openings[0].id);
 assert.equal(proposeConstructionEdit(moved.world,{type:'move-wall',edgeId:'v:38,0',
   deltaI:30,deltaJ:0}).reason,'invalid-wall-move');
});
test('F5-A walls never cut through bought furniture or delete its supporting floor',()=>{
 const initial=newConstructionWorld();
 const occupied=[{minX:15.1,maxX:15.9,minZ:-.4,maxZ:.4}];
 const collision=proposeConstructionEdit(initial,{type:'room',from:{x:15,z:0},to:{x:17,z:2}},
   {furnitureBoxes:occupied});
 assert.equal(collision.reason,'wall-intersects-furniture');
 const extension=proposeConstructionEdit(initial,{type:'floor',from:{x:15,z:-2},to:{x:18,z:2}}).world;
 assert.equal(proposeConstructionEdit(extension,{type:'remove-floor',from:{x:15,z:-1},to:{x:17,z:1}},
   {furnitureBoxes:occupied}).reason,'furniture-on-floor');
});

test('F5-A iPhone wall selector knows the exterior direction of an enlarged room',()=>{
 const room=proposeConstructionEdit(newConstructionWorld(),{
  type:'room',from:{x:14,z:-2},to:{x:18,z:2}});
 assert.equal(room.ok,true);
 const east=room.world.wallEdges.find(w=>w.axis==='v'&&w.i===36&&w.j===0);
 const south=room.world.wallEdges.find(w=>w.axis==='h'&&w.i===32&&w.j===4);
 assert.equal(constructionWallOutward(room.world,east.id),1);
 assert.equal(constructionWallOutward(room.world,south.id),1);
 const expanded=proposeConstructionEdit(room.world,{
  type:'move-wall',edgeId:east.id,deltaI:1,deltaJ:0});
 assert.equal(expanded.ok,true,expanded.reason);
 assert.ok(constructionContains(expanded.world,18.2,0));
 assert.equal(constructionWallOutward(room.world,'missing'),null);
 const inside=room.world.wallEdges.find(w=>w.axis==='v'&&w.i===28&&w.j===0);
 assert.equal(constructionWallOutward(room.world,inside.id),null);
});

test('F5-A.3 starter perimeter enlarges all four directions without moving originals',()=>{
 const old=newConstructionWorld();
 const changes=[['west',-1,0,-5.25,0],['north',0,-1,0,-4.75],
  ['east',1,0,14.25,0],['south',0,1,0,4.75]];
 const ids={west:'starter:west',north:'starter:north',east:'starter:east',south:'starter:south'};
 for(const [side,di,dj,x,z] of changes){
  const command={type:'move-wall',edgeId:ids[side],deltaI:di,deltaJ:dj};
  const result=proposeConstructionEdit(old,command);
  assert.ok(result.ok,side+': '+result.reason);
  assert.ok(constructionContains(result.world,x,z),side+' new foundation');
  assert.equal(result.world.starterShell[side],old.starterShell[side]+di+dj);
  assert.ok(result.world.floorCells.length>old.floorCells.length);
  assert.deepEqual(restoreConstructionWorld(result.world).starterShell,result.world.starterShell);
  assert.deepEqual(restoreConstructionWorld(result.world).starterOwned,result.world.starterOwned);
  const back=proposeConstructionEdit(result.world,{
   type:'move-wall',edgeId:ids[side],deltaI:-di,deltaJ:-dj});
  assert.ok(back.ok,side+' retract '+back.reason);
  assert.equal(back.world.starterShell[side],old.starterShell[side]);
  assert.deepEqual([...back.world.floorCells].sort(),[...old.floorCells].sort());
 }
 assert.deepEqual(old.starterShell,{west:-10,east:28,north:-9,south:9});
 assert.equal(old.legacy,true);
 assert.equal(constructionWallOutward(old,'starter:west'),-1);
 assert.equal(constructionWallOutward(old,'starter:east'),1);
 assert.equal(constructionWallOutward(old,'starter:north'),-1);
 assert.equal(constructionWallOutward(old,'starter:south'),1);
});
test('F5-A.3 starter original perimeter respects lot, furniture, resident, undo and legacy saves',()=>{
 const old=newConstructionWorld();
 assert.equal(proposeConstructionEdit(old,{type:'move-wall',edgeId:'starter:west',
  deltaI:1,deltaJ:0}).reason,'starter-minimum');
 assert.equal(proposeConstructionEdit(old,{type:'move-wall',edgeId:'starter:west',
  deltaI:-20,deltaJ:0}).reason,'invalid-wall-move');
 const occupied=[{minX:-5.7,maxX:-5.4,minZ:-.2,maxZ:.2}];
 const blocked=proposeConstructionEdit(old,{type:'move-wall',edgeId:'starter:west',
  deltaI:-1,deltaJ:0},{furnitureBoxes:occupied});
 assert.equal(blocked.reason,'wall-intersects-furniture');
 const editor=createConstructionEditor(old);
 const result=editor.commit({type:'move-wall',edgeId:'starter:north',
  deltaI:0,deltaJ:-1});
 assert.equal(result.ok,true,result.reason);
 assert.equal(editor.undo().world.starterShell.north,-9);
 assert.equal(editor.redo().world.starterShell.north,-10);
 assert.deepEqual(restoreConstructionWorld({schema:1,step:.5,legacy:true,
  floorCells:old.floorCells,wallEdges:[],openings:[]}).starterShell,old.starterShell);
});

test('F5-A.3 expanded starter slab is never silently lost through remove-floor/reload',()=>{
 const old=newConstructionWorld();
 const grown=proposeConstructionEdit(old,{type:'move-wall',edgeId:'starter:east',
  deltaI:1,deltaJ:0}).world;
 const remove=proposeConstructionEdit(grown,{type:'remove-floor',
  from:{x:13.5,z:-1},to:{x:15,z:1}});
 assert.equal(remove.reason,'protected-legacy-floor');
 const outsideBase=proposeConstructionEdit(grown,{type:'remove-floor',
  from:{x:14,z:-1},to:{x:15,z:1}});
 assert.equal(outsideBase.reason,'protected-starter-floor');
 assert.deepEqual(restoreConstructionWorld(grown).starterOwned,grown.starterOwned);
});
