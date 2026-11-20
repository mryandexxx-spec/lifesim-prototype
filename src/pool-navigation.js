/** LOT-D2a: pure, bounded aquatic navigation and admission planning.
 * Land A* is intentionally never reused *inside* water. No PlayCanvas,
 * clocks, character models, saved cache or rewards belong in this module.
 */
import {POOL_GRID_WIDTH,POOL_GRID_HEIGHT,POOL_MAX_CELLS,
  canonicalPoolCells,poolCellBounds,poolBoundaryEdges,validPoolId} from './pool-topology.js';
import {poolFixtureSite,validPoolFixture,poolHasExit} from './pool-equipment.js';
import {findPath,isWalkable,nearestWalkable} from './navigation.js';

const SIDES=Object.freeze({west:[-1,0],east:[1,0],north:[0,-1],south:[0,1]});
const validCell=n=>Number.isSafeInteger(n)&&n>=0&&n<POOL_GRID_WIDTH*POOL_GRID_HEIGHT;
const pointOf=cell=>{
  const b=poolCellBounds(cell);
  return b?{x:(b.minX+b.maxX)/2,z:(b.minZ+b.maxZ)/2}:null;
};
const neighbours=cell=>{
  const col=cell%POOL_GRID_WIDTH,row=Math.floor(cell/POOL_GRID_WIDTH);
  return [col>0?cell-1:null,col<POOL_GRID_WIDTH-1?cell+1:null,
    row>0?cell-POOL_GRID_WIDTH:null,row<POOL_GRID_HEIGHT-1?cell+POOL_GRID_WIDTH:null]
    .filter(n=>n!==null);
};
const outdoorsOf=world=>world?.outdoors||world;
function poolOf(world,id){
  if(!validPoolId(id))return null;
  const p=outdoorsOf(world)?.pools?.find(p=>p?.poolId===id);
  return p&&canonicalPoolCells(p.cells)?p:null;
}
function excluded(raw){
  return new Set(Array.isArray(raw)?raw.filter(validCell):[]);
}
function routeLength(points,start){
  let len=0,previous=start;
  for(const point of points){
    len+=Math.hypot(point.x-previous.x,point.z-previous.z);
    previous=point;
  }
  return len;
}

/** Exact four-connected tile route, with reserved cells removed.
 * Never passes through a diagonally touching basin, dry ground or pool wall.
 * A cell index is used instead of a world float so revising the pool will
 * invalidate the route at the next planning boundary.
 */
export function findPoolWaterPath(world,poolId,startCell,goalCell,{blockedCells=[]}={}){
  const pool=poolOf(world,poolId);
  if(!pool||!validCell(startCell)||!validCell(goalCell))return null;
  const cells=new Set(pool.cells),blocked=excluded(blockedCells);
  if(!cells.has(startCell)||!cells.has(goalCell)||
    blocked.has(startCell)||blocked.has(goalCell))return null;
  const parent=new Map([[startCell,null]]),queue=[startCell];
  for(let i=0;i<queue.length&&i<POOL_MAX_CELLS;i++){
    const cell=queue[i];
    if(cell===goalCell){
      const result=[];
      for(let step=goalCell;step!==null;step=parent.get(step))result.push(step);
      return result.reverse();
    }
    for(const next of neighbours(cell)){
      if(cells.has(next)&&!blocked.has(next)&&!parent.has(next)){
        parent.set(next,cell);queue.push(next);
      }
    }
  }
  return null;
}

/** A slot needs an actual 1x2m (2x4 cells) unobstructed aquatic corridor.
 * Occupancy never assumes two slots per pool; anchors remain inside the
 * supplied geometry. 0.5m cell centres provide 0.25m wall clearance for
 * the streamlined swimming body, independent of dry ACTOR_RADIUS=.26.
 */
export function poolSwimSlots(world,poolId,{reservedCells=[]}={}){
  const pool=poolOf(world,poolId);
  if(!pool)return [];
  const wet=new Set(pool.cells),reserved=excluded(reservedCells),candidates=[];
  for(const cell of pool.cells){
    const col=cell%POOL_GRID_WIDTH,row=Math.floor(cell/POOL_GRID_WIDTH);
    for(const [width,height] of [[2,4],[4,2]]){
      if(col+width>POOL_GRID_WIDTH||row+height>POOL_GRID_HEIGHT)continue;
      const footprint=[];
      for(let dz=0;dz<height;dz++)for(let dx=0;dx<width;dx++)
        footprint.push(cell+dz*POOL_GRID_WIDTH+dx);
      if(!footprint.every(c=>wet.has(c)&&!reserved.has(c)))continue;
      const anchor=cell+Math.floor(height/2)*POOL_GRID_WIDTH+Math.floor(width/2);
      candidates.push({poolId,slotId:poolId+':'+anchor,
        anchorCell:anchor,cells:footprint,position:pointOf(anchor)});
    }
  }
  // Non-overlapping footprints: reserve whole corridors, not just a point.
  candidates.sort((a,b)=>a.cells[0]-b.cells[0]||a.anchorCell-b.anchorCell);
  const used=new Set(),slots=[];
  for(const slot of candidates){
    if(slot.cells.some(c=>used.has(c)))continue;
    slots.push(slot);
    for(const cell of slot.cells)used.add(cell);
  }
  return slots;
}

/** Canonical existing equipment only. The builder's site is NOT proof that
 * the path is still open after later furniture/construction changes.
 */
export function poolAccessPoints(world,poolId,{from=null,board=false,blockedFixtureIds=[]}={}){
  const pool=poolOf(world,poolId),outdoors=outdoorsOf(world);
  if(!pool)return [];
  const blocked=new Set(blockedFixtureIds),result=[];
  for(const fixture of outdoors?.poolFixtures||[]){
    if(fixture.poolId!==poolId||blocked.has(fixture.fixtureId)||
      !validPoolFixture(fixture,outdoors.pools))continue;
    if(board?fixture.kind!=='board':fixture.kind==='board')continue;
    const site=poolFixtureSite(pool,fixture.edgeCell,fixture.side,fixture.kind);
    if(!site||!isWalkable(site.dryApproach.x,site.dryApproach.z,world))continue;
    const path=from?findPath(from,site.dryApproach,world):[];
    if(!path)continue;
    result.push({fixtureId:fixture.fixtureId,kind:fixture.kind,
      waterCell:site.waterCell,dryApproach:site.dryApproach,landPath:path});
  }
  return result.sort((a,b)=>a.fixtureId.localeCompare(b.fixtureId));
}

/** A planned swim requires both an independently usable EXIT and a land
 * approach to its entrance. The board never counts as an exit.
 */
export function planPoolEntry(world,from,poolId,{jump=false,
  reservedCells=[],blockedFixtureIds=[]}={}){
  if(!from||!Number.isFinite(from.x)||!Number.isFinite(from.z)||
    !poolHasExit(outdoorsOf(world),poolId))return null;
  const slots=poolSwimSlots(world,poolId,{reservedCells});
  if(!slots.length)return null;
  const points=poolAccessPoints(world,poolId,{
    from,board:jump,blockedFixtureIds});
  const blocked=excluded(reservedCells);
  let choice=null,score=Infinity;
  for(const entry of points)for(const slot of slots){
    const wetPath=findPoolWaterPath(world,poolId,entry.waterCell,slot.anchorCell,
      {blockedCells:[...blocked].filter(c=>!slot.cells.includes(c))});
    if(!wetPath)continue;
    const length=routeLength(entry.landPath,from)+wetPath.length*.5;
    if(length<score){
      score=length;
      choice={poolId,fixtureId:entry.fixtureId,kind:entry.kind,
        dryApproach:entry.dryApproach,landPath:entry.landPath,
        wetPath,slot,revision:outdoorsOf(world)?.revision??0};
    }
  }
  return choice;
}

/** Route to an actual exit, not a springboard. A conflicting fixture can be
 * temporarily reserved by a different resident in the entering/exiting stage.
 */
export function planPoolExit(world,poolId,fromCell,{blockedFixtureIds=[],
  blockedCells=[]}={}){
  if(!validCell(fromCell))return null;
  let best=null,score=Infinity;
  for(const access of poolAccessPoints(world,poolId,{blockedFixtureIds})){
    const path=findPoolWaterPath(world,poolId,fromCell,access.waterCell,
      {blockedCells});
    if(!path)continue;
    if(path.length<score){
      best={poolId,fixtureId:access.fixtureId,kind:access.kind,
        waterPath:path,dryApproach:access.dryApproach,
        revision:outdoorsOf(world)?.revision??0};
      score=path.length;
    }
  }
  return best;
}

/** Exceptional evacuation planner for deleted exits/invalid restored routes.
 * Try a reachable shoreline without rewards; only if NONE exists expose a
 * verified nearest dry fallback for a controlled rescue in D2b.
 * This function never changes actor position or any save by itself.
 */
export function planPoolRecovery(world,poolId,fromCell){
  const pool=poolOf(world,poolId);
  if(!pool||!validCell(fromCell)||!pool.cells.includes(fromCell))return null;
  let best=null,shortest=Infinity;
  for(const {cell,side} of poolBoundaryEdges(pool.cells)){
    const route=findPoolWaterPath(world,poolId,fromCell,cell);
    if(!route)continue;
    const vec=SIDES[side],center=pointOf(cell);
    const dryApproach={x:center.x+vec[0]*.54,z:center.z+vec[1]*.54};
    if(!isWalkable(dryApproach.x,dryApproach.z,world))continue;
    if(route.length<shortest){
      shortest=route.length;
      best={kind:'assisted-shore',waterPath:route,dryApproach};
    }
  }
  if(best)return best;
  const fallback=nearestWalkable(pointOf(fromCell),world);
  return fallback&&isWalkable(fallback.x,fallback.z,world)
    ?{kind:'emergency-rescue',waterPath:[],dryApproach:fallback}:null;
}

/** Only transient active swimmers occupy slots/anchors; no saved parallel
 * occupancy table is introduced. Queue command sequence retains FIFO order.
 */
export function planPoolAdmission(root,residentId,poolId,{jump=false}={}){
  if(!root?.world||!['alex','mira'].includes(residentId))return null;
  const actor=residentId==='alex'?root:root.otherSim;
  if(!actor?.position||actor.action)return null;
  const others=[residentId==='alex'?root.otherSim:root].filter(Boolean);
  const blockedFixtureIds=[],reservedCells=[];
  for(const other of others){
    const action=other.action;
    if(action?.id!=='swim'||action.poolId!==poolId)continue;
    if(['entering','exiting'].includes(action.stage)&&action.fixtureId)
      blockedFixtureIds.push(action.fixtureId);
    if(Array.isArray(action.slotCells))reservedCells.push(...action.slotCells);
  }
  // No second actor may overtake an older HEAD command for the same pool.
  const own=root.actionQueues?.byResident?.[residentId]?.[0];
  const otherId=residentId==='alex'?'mira':'alex';
  const earlier=root.actionQueues?.byResident?.[otherId]?.[0];
  if(own?.type==='pool'&&own.poolId===poolId&&
    earlier?.type==='pool'&&earlier.poolId===poolId&&
    Number.isSafeInteger(earlier.seq)&&earlier.seq<own.seq)return null;
  return planPoolEntry(root.world,actor.position,poolId,{jump,
    blockedFixtureIds,reservedCells});
}
