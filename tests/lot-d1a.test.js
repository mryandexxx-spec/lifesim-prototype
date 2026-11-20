/** LOT-D1a: module-level water construction, no renderer or paid pool release. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold} from '../src/household.js';
import {newOutdoorsWorld,restoreOutdoorsWorld,lotSurfaceAt,lotRaySurface,
  outdoorCellAt} from '../src/lot-surface.js';
import {previewOutdoorFeature,previewOutdoorPaint} from '../src/outdoor-proposals.js';
import {isWalkable,isClearLine,findPath,nearestWalkable} from '../src/navigation.js';
import {POOL_MAX_CELLS,POOL_MAX_COMPONENTS,canonicalPoolCells,poolComponents,
  poolCellBounds,poolBoundaryEdges,poolWaterNear,poolRectOverlaps,
  reconcilePoolComponents,poolWaterPrice} from '../src/pool-topology.js';
import {SAVE_KEY} from '../src/simulation.js';

const copy=v=>JSON.parse(JSON.stringify(v));
const at=(x,z)=>outdoorCellAt(x+.25,z+.25);
const base=at(18,8);
const lshape=[base,base+1,base+2,base+64,base+128];
function withPool(root,cells,poolId='pool-1'){
  root.world.outdoors={...root.world.outdoors,revision:root.world.outdoors.revision+1,
    pools:[{poolId,cells:[...cells].sort((a,b)=>a-b)}],
    nextPoolId:Number(poolId.slice(5))+1,poolTxnSeq:0};
  return root;
}
test('LOT-D1a: original root-v1 save, credits and both actors remain intact',()=>{
  const old=copy(newHousehold());
  delete old.world.outdoors;
  const loaded=loadHousehold(old);
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.equal(loaded.version,1);
  assert.deepEqual(loaded.world.outdoors,newOutdoorsWorld());
  assert.deepEqual(loaded.shop,old.shop);
  assert.deepEqual(loaded.position,old.position);
  assert.deepEqual(loaded.otherSim.position,old.otherSim.position);
  assert.deepEqual(loaded.world.construction,old.world.construction);
  assert.deepEqual(loaded.world.furniture,old.world.furniture);
  assert.deepEqual(loaded.actionQueues,old.actionQueues);
});
test('LOT-D1a: tiles have no fixed rectangle and build 4-neighbour irregular shapes',()=>{
  assert.equal(POOL_MAX_CELLS,512);
  assert.equal(POOL_MAX_COMPONENTS,4);
  assert.deepEqual(canonicalPoolCells([base+2,base,base+1]),[base,base+1,base+2]);
  assert.deepEqual(poolComponents(lshape),[lshape]);
  assert.equal(poolBoundaryEdges(lshape).length,12);
  assert.equal(poolComponents([base,base+65]).length,2,'diagonal contact is two basins');
  assert.equal(poolComponents([base,base+1,base+65]).length,1);
  assert.deepEqual(poolComponents([]),[]);
  assert.deepEqual(poolBoundaryEdges([]),[]);
  assert.equal(canonicalPoolCells([base,base]),null);
  assert.equal(canonicalPoolCells([base,3072]),null);
  assert.equal(canonicalPoolCells([base,1.25]),null);
  assert.equal(canonicalPoolCells(Array.from({length:513},(_,i)=>i)),null);
  assert.deepEqual(poolCellBounds(base),{minX:18,maxX:18.5,minZ:8,maxZ:8.5});
});
test('LOT-D1a: component identity survives resizing, deterministic split and merge',()=>{
  const initial=[{poolId:'pool-7',cells:[base,base+1,base+2]}];
  const resized=reconcilePoolComponents(initial,[base,base+1,base+2,base+64],8);
  assert.equal(resized.pools[0].poolId,'pool-7');
  assert.equal(resized.nextPoolId,8);
  const split=reconcilePoolComponents(initial,[base,base+2],8);
  assert.deepEqual(split.pools.map(p=>p.poolId),['pool-7','pool-8']);
  assert.equal(split.nextPoolId,9);
  const joined=reconcilePoolComponents(split.pools,[base,base+1,base+2],9);
  assert.deepEqual(joined.pools.map(p=>p.poolId),['pool-7']);
  assert.deepEqual(reconcilePoolComponents(split.pools,[],9),{pools:[],nextPoolId:9});
  assert.equal(reconcilePoolComponents([],Array.from({length:5},(_,i)=>base+i*2),1),null);
  assert.equal(poolWaterPrice(1,48),1440);
  assert.equal(poolWaterPrice(2,48),2040);
  assert.equal(poolWaterPrice(0,0),0);
  assert.equal(poolWaterPrice(5,48),null);
  assert.equal(poolWaterPrice(1,513),null);
});
test('LOT-D1a: saved irregular basin survives load with same wallet and household',()=>{
  const root=withPool(newHousehold(),lshape);
  const saved=loadHousehold(copy(root));
  assert.deepEqual(saved.world.outdoors,root.world.outdoors);
  assert.deepEqual(saved.shop,root.shop);
  assert.deepEqual(saved.financialHistory,root.financialHistory);
  assert.deepEqual(saved.otherSim.position,root.otherSim.position);
  assert.equal(saved.world.outdoors.pools[0].cells.length,5);
  assert.equal(saved.world.outdoors.pools[0].poolId,'pool-1');
  assert.equal(saved.world.outdoors.nextPoolId,2);
  assert.equal(saved.world.outdoors.poolTxnSeq,0);
});
test('LOT-D1a: pool water is not a floor or a legal walking / shortcut surface',()=>{
  const root=withPool(newHousehold(),lshape),w=root.world;
  assert.equal(lotSurfaceAt(w,18.25,8.25).kind,'pool-water');
  assert.equal(lotSurfaceAt(w,18.25,8.25).walkable,false);
  assert.equal(lotSurfaceAt(w,0,0).kind,'floor');
  assert.equal(lotSurfaceAt(w,20.25,8.25).kind,'yard');
  assert.equal(poolWaterNear(w,18.25,8.25),'pool-1');
  assert.equal(poolWaterNear(w,17.85,8.25,.26),'pool-1','actor radius keeps rim clear');
  assert.equal(isWalkable(18.25,8.25,w),false);
  assert.equal(isWalkable(17.85,8.25,w),false);
  assert.equal(findPath({x:17,z:8.25},{x:18.25,z:8.25},w),null);
  assert.equal(isClearLine({x:17,z:8.25},{x:20.5,z:8.25},w),false);
  const path=findPath({x:17,z:8.25},{x:20.5,z:8.25},w);
  assert.ok(path?.length,'land A* goes around water');
  const walk=nearestWalkable({x:18.25,z:8.25},w);
  assert.ok(isWalkable(walk.x,walk.z,w));
  assert.equal(lotRaySurface({x:18.25,y:5,z:8.25},
    {x:18.25,y:-5,z:8.25},w)?.kind,'pool-water');
  assert.equal(lotRaySurface({x:0,y:5,z:0},{x:0,y:-5,z:0},w)?.kind,'floor');
  assert.equal(lotRaySurface({x:20,y:5,z:8},{x:20,y:-5,z:8},w)?.kind,'yard');
});
test('LOT-D1a: A* cache key respects outdoors revision after installing basin',()=>{
  const root=newHousehold(),w=root.world;
  const from={x:17,z:8.25},to={x:20.5,z:8.25};
  assert.ok(isClearLine(from,to,w));
  assert.ok(findPath(from,to,w));
  const updated=withPool(root,lshape).world;
  assert.equal(isClearLine(from,to,updated),false);
  assert.ok(findPath(from,to,updated));
});
test('LOT-D1a: damaged, orphaned, diagonal, duplicate and house-overlap pools recover independently',()=>{
  const before=newHousehold(),root=copy(before),validCells=[at(20,9),at(20.5,9)];
  root.world.outdoors={schema:1,revision:16,ground:[{cell:at(17,8),kind:'stone'}],
    nextId:1,features:[],pools:[
      {poolId:'pool-1',cells:[at(0,0)]},
      {poolId:'pool-2',cells:[base,base+65]},
      {poolId:'pool-3',cells:[base,base]},
      {poolId:'pool-4',cells:[3072]},
      {poolId:'pool-5',cells:validCells},
      {poolId:'pool-6',cells:[validCells[0]]},
      {poolId:'pool-5',cells:[at(19,10)]}
    ],nextPoolId:1,poolTxnSeq:Infinity};
  const loaded=loadHousehold(copy(root));
  assert.deepEqual(loaded.world.outdoors.pools,[{poolId:'pool-5',cells:validCells}]);
  assert.equal(loaded.world.outdoors.nextPoolId,6);
  assert.equal(loaded.world.outdoors.poolTxnSeq,0);
  assert.equal(loaded.world.outdoors.ground.length,1);
  assert.deepEqual(loaded.world.construction,before.world.construction);
  assert.deepEqual(loaded.world.furniture,before.world.furniture);
  assert.deepEqual(loaded.shop,before.shop);
  assert.deepEqual(loaded.financialHistory,before.financialHistory);
  assert.deepEqual(loaded.position,before.position);
  assert.deepEqual(loaded.otherSim.position,before.otherSim.position);
});
test('LOT-D1a: tree, garden decor and ground paint cannot occupy pool water',()=>{
  const root=withPool(newHousehold(),[base,base+1,base+64,base+65]);
  assert.equal(poolRectOverlaps(root.world.outdoors,
    {minX:18.1,maxX:18.3,minZ:8.1,maxZ:8.3}),true);
  assert.equal(poolRectOverlaps(root.world.outdoors,
    {minX:21,maxX:22,minZ:9,maxZ:10}),false);
  assert.equal(previewOutdoorFeature(root,'tree.round',{x:18.5,z:8.5,yaw:0}).reason,
    'blocked-or-outside');
  assert.equal(previewOutdoorPaint(root,{from:{x:18.25,z:8.25},
    to:{x:18.25,z:8.25},kind:'gravel'}).reason,'unchanged');
  const ok=previewOutdoorFeature(root,'light.path',{x:21,z:8,yaw:0});
  assert.equal(ok.ok,true,ok.reason);
});
test('LOT-D1a: pool overlapping existing feature or construction rejected, no duplicate credits',()=>{
  const h=newHousehold();
  const old=copy(h);
  const tree=previewOutdoorFeature(h,'tree.round',{x:19,z:8,yaw:0});
  assert.ok(tree.ok,tree.reason);
  const withTree={...h,world:{...h.world,outdoors:tree.outdoors}};
  withTree.world.outdoors.pools=[{poolId:'pool-1',cells:[at(19,8)]}];
  withTree.world.outdoors.nextPoolId=2;
  const restored=loadHousehold(copy(withTree));
  assert.equal(restored.world.outdoors.pools.length,0);
  assert.equal(restored.world.outdoors.features.length,1);
  assert.deepEqual(restored.shop,old.shop);
  assert.deepEqual(restoreOutdoorsWorld({schema:99}),newOutdoorsWorld());
});
