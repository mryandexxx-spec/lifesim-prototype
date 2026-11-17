import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILD_OPENING_STYLES,BUILD_DEFAULT_OPENING_STYLE,constructionOpeningStyle,
 newConstructionWorld,restoreConstructionWorld,proposeConstructionEdit,
 constructionWallAt,createConstructionEditor} from '../src/construction.js';
import {isWalkable} from '../src/navigation.js';

const edit=(world,command)=>{
 const r=proposeConstructionEdit(world,command);
 assert.equal(r.ok,true,r.reason);return r.world;
};
const room=()=>edit(newConstructionWorld(),{type:'room',
 from:{x:14,z:-2},to:{x:18,z:2}});
const inside='v:28,0',outside='v:36,0';

test('F5-B.2 opening registry is data-only, distinct and has accurate physical spans',()=>{
 assert.equal(Object.keys(BUILD_OPENING_STYLES).length,9);
 assert.equal(BUILD_OPENING_STYLES['door.double'].sections,4);
 assert.equal(BUILD_OPENING_STYLES['window.panorama'].sections,4);
 assert.equal(BUILD_DEFAULT_OPENING_STYLE.door,'door.simple');
 assert.equal(BUILD_OPENING_STYLES['arch.round'].type,'arch');
 assert.equal(Object.values(BUILD_OPENING_STYLES).every(x=>x.sections>=3),true);
});

test('F5-B.2 old door/window save stays unchanged in form and gets legacy defaults',()=>{
 const base=room(),d=edit(base,{type:'door',edgeId:inside});
 assert.equal(d.openings[0].styleId,undefined);
 assert.equal(constructionOpeningStyle(d.openings[0]),'door.simple');
 const reloaded=restoreConstructionWorld(JSON.parse(JSON.stringify(d)));
 assert.deepEqual(reloaded.openings,d.openings);
 assert.equal(constructionOpeningStyle({type:'window',edgeIds:['a','b','c']}),'window.classic');
});

test('F5-B.2 arches and all doors are portals, every window is a barrier',()=>{
 const base=room();
 for(const styleId of ['arch.round','arch.wide','door.simple','door.glass','door.double']){
   const type=BUILD_OPENING_STYLES[styleId].type;
   const world=edit(base,{type,styleId,edgeId:inside});
   assert.equal(constructionWallAt(world,14,.25),false,styleId);
   assert.equal(isWalkable(14,.25,{construction:world}),true,styleId);
 }
 for(const styleId of ['window.classic','window.panorama','window.high','window.slim']){
   const world=edit(base,{type:'window',styleId,edgeId:inside});
   assert.equal(constructionWallAt(world,14,.25),true,styleId);
   assert.equal(isWalkable(14,.25,{construction:world}),false,styleId);
 }
});

test('F5-B.2 wider 2m variants own exactly 4 edges and cannot overlap',()=>{
 const base=room(),wide=edit(base,{type:'arch',styleId:'arch.wide',edgeId:outside});
 assert.equal(wide.openings[0].edgeIds.length,4);
 assert.equal(wide.openings[0].styleId,'arch.wide');
 assert.equal(proposeConstructionEdit(wide,{type:'window',
   styleId:'window.panorama',edgeId:outside}).reason,'opening-overlap');
 assert.equal(proposeConstructionEdit(base,{type:'door',styleId:'door.double',
   edgeId:'v:36,-4'}).reason,'opening-needs-wall-space');
 assert.equal(proposeConstructionEdit(base,{type:'door',
   styleId:'window.classic',edgeId:outside}).reason,'unknown-opening-style');
});

test('F5-B.2 replace keeps opening ID while changing width, type and A* access',()=>{
 const base=room(),old=edit(base,{type:'door',edgeId:inside});
 const uuid=old.openings[0].id;
 const wide=edit(old,{type:'change-opening',id:uuid,styleId:'door.double'});
 assert.equal(wide.openings[0].id,uuid);
 assert.equal(wide.openings[0].edgeIds.length,4);
 assert.equal(constructionWallAt(wide,14,.25),false);
 const closed=edit(wide,{type:'change-opening',id:uuid,styleId:'window.panorama'});
 assert.equal(closed.openings[0].id,uuid);
 assert.equal(closed.openings[0].type,'window');
 assert.equal(constructionWallAt(closed,14,.25),true);
 const arch=edit(closed,{type:'change-opening',id:uuid,styleId:'arch.wide'});
 assert.equal(arch.openings[0].id,uuid);
 assert.equal(constructionWallAt(arch,14,.25),false);
 assert.equal(restoreConstructionWorld(arch).openings[0].styleId,'arch.wide');
});

test('F5-B.2 replacement rejects adjacent overlapping openings and invalid styles',()=>{
 const base=room(),first=edit(base,{type:'door',edgeId:'v:36,-2'});
 const second=edit(first,{type:'window',edgeId:'v:36,1'});
 assert.equal(second.openings.length,2);
 assert.equal(proposeConstructionEdit(second,{type:'change-opening',
   id:first.openings[0].id,styleId:'door.double'}).reason,'opening-overlap');
 assert.equal(proposeConstructionEdit(second,{type:'change-opening',
   id:'missing',styleId:'arch.round'}).reason,'opening-not-found');
 assert.equal(proposeConstructionEdit(second,{type:'change-opening',
   id:first.openings[0].id,styleId:'arch.missing'}).reason,'unknown-opening-style');
});

test('F5-B.2 wall relocation preserves styled arch ID and floor/wall finishes',()=>{
 const base=room();
 const painted=edit(base,{type:'paint-wall',edgeId:outside,
  materialId:'wall.blue',side:'both',scope:'segment'});
 const first=edit(painted,{type:'arch',edgeId:outside,styleId:'arch.wide'});
 const opening=first.openings[0];
 const shifted=edit(first,{type:'move-wall',edgeId:outside,deltaI:1,deltaJ:0});
 assert.equal(shifted.openings[0].id,opening.id);
 assert.equal(shifted.openings[0].styleId,'arch.wide');
 assert.deepEqual(shifted.openings[0].edgeIds.length,4);
 assert.equal(shifted.materials.wall['v:37,0'].a,'wall.blue');
 assert.deepEqual(restoreConstructionWorld(shifted).openings,shifted.openings);
});

test('F5-B.2 undo/redo and remove-opening retain save coherence',()=>{
 const base=room(),session=createConstructionEditor(base);
 let out=session.commit({type:'arch',edgeId:inside,styleId:'arch.round'});
 assert.equal(out.ok,true,out.reason);
 const uuid=out.world.openings[0].id;
 out=session.commit({type:'change-opening',id:uuid,styleId:'window.high'});
 assert.equal(out.ok,true,out.reason);
 assert.equal(session.undo().world.openings[0].type,'arch');
 assert.equal(session.redo().world.openings[0].type,'window');
 const erased=session.commit({type:'remove-opening',id:uuid});
 assert.equal(erased.ok,true,erased.reason);
 assert.equal(erased.world.openings.length,0);
 assert.equal(constructionWallAt(erased.world,14,.25),true);
});

test('F5-B.2 corrupt variant IDs are sanitized and cannot change saved topology',()=>{
 const base=room(),arch=edit(base,{type:'arch',styleId:'arch.round',edgeId:inside});
 const raw=JSON.parse(JSON.stringify(arch));
 raw.openings[0].styleId='window.panorama';
 const restored=restoreConstructionWorld(raw);
 assert.equal(restored.openings[0].styleId,undefined);
 assert.equal(restored.openings[0].type,'arch');
 assert.equal(constructionOpeningStyle(restored.openings[0]),'arch.round');
 assert.equal(constructionWallAt(restored,14,.25),false);
});
