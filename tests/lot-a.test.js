/** LOT-A: canonical yard geometry, playable path, and save-safe manual intent. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {newConstructionWorld,proposeConstructionEdit,BUILD_LOT} from '../src/construction.js';
import {newOutdoorsWorld,restoreOutdoorsWorld,lotSurfaceAt,lotRaySurface,
  insideLot,legacyLotWallAt,lotActorHeight} from '../src/lot-surface.js';
import {isWalkable,findPath,nearestWalkable} from '../src/navigation.js';
import {enqueueAction,newActionQueues,restoreActionQueues,pendingActions} from '../src/action-queue.js';
import {SAVE_KEY} from '../src/simulation.js';
const clone=x=>JSON.parse(JSON.stringify(x));
test('LOT-A: same 32x24 parcel, ordinary indoor floor and real outdoor lawn',()=>{
 const h=newHousehold();
 assert.equal(SAVE_KEY,'lifesim.room01.v1');
 assert.equal(h.version,1);assert.equal(h.world.outdoors.schema,1);
 assert.deepEqual(BUILD_LOT,{minX:-9,maxX:23,minZ:-12,maxZ:12});
 assert.equal(lotSurfaceAt(h.world,0,0).kind,'floor');
 assert.equal(lotSurfaceAt(h.world,18,8).kind,'yard');
 assert.equal(lotActorHeight(h.world,{x:18,z:8}),-.53);
 assert.equal(lotSurfaceAt(h.world,22.9,11).kind,'outside',
   'A character radius remains inside the property');
 assert.ok(insideLot(18,8));
 assert.equal(lotSurfaceAt(h.world,NaN,0).walkable,false);
 assert.equal(restoreOutdoorsWorld({schema:1,revision:3}).revision,3);
 assert.deepEqual(restoreOutdoorsWorld({schema:1,revision:Infinity}),newOutdoorsWorld());
});
test('LOT-A: original west/north walls block A*, east/south cutaway affords access',()=>{
 const h=newHousehold(),w=h.world;
 assert.equal(w.construction.legacy,true);
 assert.equal(isWalkable(0,0,w),true);
 assert.equal(isWalkable(19,8,w),true);
 assert.equal(isWalkable(-4.97,0,w),false);
 assert.equal(isWalkable(0,-4.34,w),false);
 assert.ok(legacyLotWallAt(w.construction,-4.97,0));
 assert.ok(findPath(h.position,{x:19,z:6},w)?.length>0);
 assert.ok(findPath({x:19,z:6},h.position,w)?.length>0);
 assert.equal(findPath(h.position,{x:23,z:2},w),null);
 assert.equal(isWalkable(0,0,{furniture:w.furniture,construction:w.construction}),true);
});
test('LOT-A: constructed walls stay real, ground outside newly built room is accessible',()=>{
 const h=newHousehold();
 const room=proposeConstructionEdit(newConstructionWorld(),{
   type:'room',from:{x:14,z:-2},to:{x:18,z:2}});
 assert.ok(room.ok,room.reason);
 h.world.construction=room.world;
 assert.equal(isWalkable(20,5,h.world),true);
 assert.equal(isWalkable(14,.25,h.world),false);
 assert.equal(findPath({x:0,z:0},{x:16,z:0},h.world),null,
  'Four walls isolate the new room, regardless of walkable garden');
 const wall=room.world.wallEdges.find(e=>e.axis==='v'&&e.i===28&&e.j===0);
 const opened=proposeConstructionEdit(room.world,{type:'door',edgeId:wall.id});
 assert.ok(opened.ok,opened.reason);
 h.world.construction=opened.world;
 assert.ok(findPath({x:0,z:0},{x:16,z:0},h.world),
  'A real door restores access without teleporting through the wall');
});
test('LOT-A: perspective ray selects actual top surface, rejects sky and off-lot',()=>{
 const h=newHousehold();
 const cast=(x,z)=>lotRaySurface({x,y:12,z},{x,y:-12,z},h.world);
 assert.equal(cast(0,0)?.kind,'floor');
 assert.equal(cast(19,8)?.kind,'yard');
 assert.equal(cast(19,8)?.y,-.53);
 assert.equal(cast(70,8),null);
 assert.equal(lotRaySurface({x:19,y:4,z:8},{x:19,y:5,z:8},h.world),null);
 assert.equal(lotRaySurface({x:0,y:0,z:0},{x:0,y:0,z:0},h.world),null);
});
test('LOT-A: move queue is typed, bounded, quantized, persistent FIFO',()=>{
 const q=newActionQueues(['alex','mira']);
 const f=enqueueAction(q,'alex',{type:'move',x:19.023,z:6.024});
 assert.ok(f);
 assert.deepEqual({type:f.type,x:f.x,z:f.z},{type:'move',x:19,z:6});
 assert.equal(enqueueAction(q,'mira',{type:'move',x:Infinity,z:0}),null);
 assert.equal(enqueueAction(q,'alex',{type:'move',x:23,z:0}),null);
 assert.equal(enqueueAction(q,'alex',{type:'move',x:0,z:1e9}),null);
 const n=enqueueAction(q,'alex',{type:'move',x:2,z:3});
 const restored=restoreActionQueues(clone(q),['alex','mira']);
 assert.deepEqual(restored.byResident.alex.map(x=>x.seq),[f.seq,n.seq]);
 assert.deepEqual(pendingActions(restored,'alex')[0],f);
});
test('LOT-A: old root-v1 save and new outside coordinates survive without fake benefits',()=>{
 const old=newHousehold();
 const oldSnapshot=clone(old);
 delete oldSnapshot.world.outdoors;
 const oldRestored=loadHousehold(oldSnapshot);
 assert.equal(oldRestored.world.outdoors.schema,1);
 assert.deepEqual(oldRestored.position,old.position);
 assert.deepEqual(oldRestored.shop,old.shop);
 assert.deepEqual(oldRestored.careerSystem,old.careerSystem);
 const h=newHousehold();
 h.autonomy.enabled=false;h.otherSim.autonomy.enabled=false;
 h.position={x:19.25,z:6.25};
 h.otherSim.position={x:18.4,z:5.4};
 h.action={id:'move',phase:'walking',elapsed:0,automatic:false,
   goal:{x:7.25,z:0}};
 enqueueAction(h.actionQueues,'alex',{type:'move',x:16,z:7});
 const saved=clone(h);
 const reloaded=loadHousehold(saved);
 assert.deepEqual(reloaded.position,h.position);
 assert.deepEqual(reloaded.otherSim.position,h.otherSim.position);
 assert.deepEqual(reloaded.action.goal,h.action.goal);
 assert.equal(reloaded.action.phase,'walking');
 assert.deepEqual(reloaded.actionQueues.byResident.alex[0].type,'move');
 const before={...reloaded.needs};
 tickHousehold(reloaded,1);
 assert.ok(reloaded.needs.energy<=before.energy,'Walking earns no bonus');
 assert.deepEqual(reloaded.position,h.position,
   'Headless tick never fabricates an instant arrival; scene route follower owns movement');
 assert.equal(reloaded.shop.credits,h.shop.credits);
});
test('LOT-A: bad outdoors extension / impossible saved move never resets household',()=>{
 const h=newHousehold();h.world.outdoors={schema:99,revision:1};
 h.action={id:'move',phase:'walking',automatic:false,elapsed:0,
   goal:{x:99,z:0}};
 const loaded=loadHousehold(clone(h));
 assert.deepEqual(loaded.world.outdoors,newOutdoorsWorld());
 assert.equal(loaded.action,null);
 assert.equal(loaded.shop.credits,h.shop.credits);
 assert.equal(loaded.world.construction.schema,1);
 assert.ok(nearestWalkable({x:-100,z:0},loaded.world));
});
