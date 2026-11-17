import test from 'node:test';
import assert from 'node:assert/strict';
import {newConstructionWorld,proposeConstructionEdit} from '../src/construction.js';
import {findPath,isWalkable,nearestWalkable} from '../src/navigation.js';
import {newFurnitureWorld} from '../src/furniture-catalog.js';
test('F5-A after building, a walled room is isolated until a real door is inserted',()=>{
 const built=proposeConstructionEdit(newConstructionWorld(),{type:'room',from:{x:14,z:-2},to:{x:18,z:2}}).world;
 const before={furniture:newFurnitureWorld(),construction:built};
 assert.equal(isWalkable(15.7,0,before),true);
 assert.equal(isWalkable(14.01,.2,before),false);
 assert.equal(findPath({x:13.5,z:0},{x:16,z:0},before),null);
 const wall=built.wallEdges.find(e=>e.axis==='v'&&e.i===28&&e.j===0);
 const door=proposeConstructionEdit(built,{type:'door',edgeId:wall.id}).world;
 const after={furniture:newFurnitureWorld(),construction:door};
 const route=findPath({x:13.5,z:0},{x:16,z:0},after);
 assert.ok(route?.length, 'Residents can cross an actual doorway');
 assert.deepEqual(route.at(-1),{x:16,z:0});
});
test('F5-A invalid/legacy construction cannot change historic route semantics',()=>{
 const world={furniture:newFurnitureWorld(),construction:newConstructionWorld()};
 assert.equal(isWalkable(20,0,world),false);
 assert.ok(findPath({x:12,z:2.5},{x:12.2,z:2.5},world)?.length);
 assert.ok(nearestWalkable({x:0,z:0},world));
});
