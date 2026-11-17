import test from 'node:test';
import assert from 'node:assert/strict';
import {newConstructionWorld,restoreConstructionWorld,starterShellSegments,
 constructionWallSegments,nearestConstructionEdge,constructionWallAt,
 proposeConstructionEdit,createConstructionEditor,constructionWallOutward} from '../src/construction.js';

const w=()=>newConstructionWorld();
const segment=(world,side,index)=>starterShellSegments(world).find(edge=>
 edge.starterSide===side&&(edge.axis==='h'?edge.i:edge.j)===index);
const edit=(world,command,context)=>{
 const result=proposeConstructionEdit(world,command,context);
 assert.equal(result.ok,true,result.reason);
 return result.world;
};
test('F5-B.3 original west/north/east/south are first-class touch-selectable edges',()=>{
 const world=w();
 assert.equal(world.wallEdges.length,0);
 for(const [side,index] of [['north',21],['west',4],['east',4],['south',21]]){
   const edge=segment(world,side,index);
   assert.ok(edge,side);
   assert.equal(edge.id,'starter:'+side+':'+index);
   assert.ok(constructionWallSegments(world).some(x=>x.id===edge.id));
   assert.notEqual(constructionWallOutward(world,edge.id),null);
 }
 assert.equal(nearestConstructionEdge(world,{x:11,z:-4.5}).id,'starter:north:21');
 assert.equal(nearestConstructionEdge(world,{x:-5,z:2.25}).id,'starter:west:4');
});
test('F5-B.3 old back wall accepts real window with save and original shell unchanged',()=>{
 const world=w(),edge=segment(world,'north',21);
 const opened=edit(world,{type:'window',edgeId:edge.id,styleId:'window.high'});
 assert.equal(opened.legacy,false);
 assert.equal(opened.openings[0].styleId,'window.high');
 assert.equal(opened.openings[0].edgeIds.length,3);
 assert.equal(constructionWallAt(opened,11,-4.5),true,'a window is never a door');
 assert.equal(opened.starterShell.north,-9);
 assert.equal(opened.wallEdges.length,0,'no duplicate construction wall over the original');
 assert.deepEqual(restoreConstructionWorld(opened).openings,opened.openings);
 assert.deepEqual(restoreConstructionWorld(opened).starterShell,world.starterShell);
});
test('F5-B.3 original west wall takes doors and arches without a special legacy command',()=>{
 const world=w(),edge=segment(world,'west',4);
 for(const [type,style] of [['door','door.simple'],['door','door.double'],
   ['arch','arch.round'],['arch','arch.wide']]){
   const opened=edit(world,{type,styleId:style,edgeId:edge.id});
   assert.equal(constructionWallAt(opened,-5,2.25),false,style);
   assert.equal(opened.openings[0].edgeIds.length,style.endsWith('double')||style.endsWith('wide')?4:3);
   assert.equal(restoreConstructionWorld(opened).openings[0].id,opened.openings[0].id);
 }
});
test('F5-B.3 original cutaway walls remain backwards-open until deliberately built',()=>{
 const world=w();
 const extended=edit(world,{type:'floor',from:{x:14,z:-2},to:{x:16,z:2}});
 assert.equal(constructionWallAt(extended,14,0),false,'historic east cutaway stays open');
 const westSide=edit(extended,{type:'door',edgeId:segment(extended,'east',0).id});
 assert.deepEqual(westSide.starterSolidSides,['east']);
 assert.equal(constructionWallAt(westSide,14,0),false,'door gap is a portal');
 assert.equal(constructionWallAt(westSide,14,2),true,'remaining original east wall now is physical');
 const closed=edit(westSide,{type:'remove-opening',id:westSide.openings[0].id});
 assert.equal(constructionWallAt(closed,14,0),true,'removing the door closes its opening');
 assert.deepEqual(restoreConstructionWorld(closed).starterSolidSides,['east']);
});
test('F5-B.3 protected authored painting/shelf and hung player artwork cannot be punctured',()=>{
 const world=w();
 const painting=proposeConstructionEdit(world,{type:'window',
   edgeId:segment(world,'north',0).id});
 assert.equal(painting.reason,'wall-has-decor');
 const shelf=proposeConstructionEdit(world,{type:'door',
   edgeId:segment(world,'west',0).id});
 assert.equal(shelf.reason,'wall-has-decor');
 const work=proposeConstructionEdit(world,{type:'window',
   edgeId:segment(world,'north',22).id},
   {wallDecor:[{x:11.25,z:-4.34,radius:.45}]});
 assert.equal(work.reason,'wall-has-decor');
 const oldWindow=edit(world,{type:'window',
   edgeId:segment(world,'north',-5).id,styleId:'window.panorama'});
 assert.equal(oldWindow.openings[0].edgeIds.length,4,
   'the old decorative window can be visually replaced');
});
test('F5-B.3 removing one half-meter original wall is real, undoable and saveable',()=>{
 const world=w(),edge=segment(world,'north',21);
 const editor=createConstructionEditor(world);
 const result=editor.commit({type:'erase-wall',edgeId:edge.id});
 assert.equal(result.ok,true,result.reason);
 assert.deepEqual(result.world.starterRemoved,[edge.id]);
 assert.equal(constructionWallSegments(result.world).some(w=>w.id===edge.id),false);
 assert.equal(restoreConstructionWorld(result.world).starterRemoved[0],edge.id);
 assert.equal(editor.undo().world.starterRemoved.length,0);
 assert.equal(editor.redo().world.starterRemoved.length,1);
 assert.equal(proposeConstructionEdit(result.world,{type:'window',edgeId:edge.id}).reason,'wall-not-found');
});
test('F5-B.3 opening replacement keeps stable identity and A* portal semantics',()=>{
 const world=w(),first=edit(world,{type:'window',edgeId:segment(world,'north',21).id,
   styleId:'window.classic'});
 const id=first.openings[0].id;
 const second=edit(first,{type:'change-opening',id,styleId:'door.double'});
 assert.equal(second.openings[0].id,id);
 assert.equal(second.openings[0].edgeIds.length,4);
 assert.equal(constructionWallAt(second,11,-4.5),false);
 const third=edit(second,{type:'change-opening',id,styleId:'arch.round'});
 assert.equal(third.openings[0].id,id);
 assert.equal(constructionWallAt(third,11,-4.5),false);
 assert.deepEqual(restoreConstructionWorld(third).openings,third.openings);
});
test('F5-B.3 moving old wall carries its opening ID and attached finish',()=>{
 const original=w(),edge=segment(original,'north',21);
 const painted=edit(original,{type:'paint-wall',edgeId:edge.id,materialId:'wall.sage'});
 assert.deepEqual(painted.materials.wall['starter:north'],{a:'wall.sage',b:'wall.sage'});
 const portal=edit(painted,{type:'arch',edgeId:edge.id,styleId:'arch.wide'});
 const moved=edit(portal,{type:'move-wall',edgeId:edge.id,deltaI:0,deltaJ:-1});
 assert.equal(moved.starterShell.north,-10);
 assert.deepEqual(moved.openings,portal.openings);
 assert.deepEqual(moved.materials.wall['starter:north'],painted.materials.wall['starter:north']);
 assert.equal(constructionWallAt(moved,11,-5),false);
 assert.deepEqual(restoreConstructionWorld(moved).openings,moved.openings);
});
test('F5-B.3 explicit view remains free of duplicate preexisting walls',()=>{
 const world=w();
 const newRoom=edit(world,{type:'room',from:{x:12,z:4.5},to:{x:16,z:6.5}});
 assert.ok(newRoom.wallEdges.some(w=>w.axis==='h'&&w.j===13));
 const matching=[...newRoom.wallEdges].filter(w=>w.id==='h:24,9');
 assert.equal(matching.length,0,'the baseline south shell segment is reused');
});
test('F5-B.3 old schema sanitizes out-of-range starter holes and invalid sides',()=>{
 const base=edit(w(),{type:'window',edgeId:segment(w(),'north',21).id});
 const raw=JSON.parse(JSON.stringify(base));
 raw.starterRemoved=['starter:north:120','starter:west:2','junk'];
 raw.starterSolidSides=['east','north','blah'];
 const restored=restoreConstructionWorld(raw);
 assert.deepEqual(restored.starterRemoved,['starter:west:2']);
 assert.deepEqual(restored.starterSolidSides,['east']);
 assert.deepEqual(restored.openings,base.openings);
 const old=JSON.parse(JSON.stringify(w()));
 delete old.starterRemoved;delete old.starterSolidSides;
 const older=restoreConstructionWorld(old);
 assert.deepEqual(older.starterRemoved,[]);
 assert.deepEqual(older.starterSolidSides,[]);
 assert.equal(older.legacy,true);
});
