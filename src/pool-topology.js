/** LOT-D1a: canonical, renderer-independent freeform swimming-pool topology.
 * The existing half-metre lot grid owns all water tiles. Water is never land A*.
 * No equipment, cost transaction, swimming reward or UI is introduced here.
 */
import {BUILD_LOT,BUILD_STEP} from './construction.js';

export const POOL_GRID_WIDTH=64;
export const POOL_GRID_HEIGHT=48;
export const POOL_MAX_CELLS=512; // approved iPhone budget: 128m², not a side-length constraint
export const POOL_MAX_COMPONENTS=4;
export const POOL_BASE_CREDITS=600;
export const POOL_AREA_CREDITS_PER_SQUARE_METRE=70;
const TOTAL=POOL_GRID_WIDTH*POOL_GRID_HEIGHT;
const validIndex=n=>Number.isSafeInteger(n)&&n>=0&&n<TOTAL;
export const validPoolId=id=>typeof id==='string'&&/^pool-[1-9][0-9]{0,6}$/.test(id);
export const poolIdNumber=id=>validPoolId(id)?Number(id.slice(5)):null;

/** Footprint coordinates are integer cell ids; water cannot be diagonal-only connected. */
export function canonicalPoolCells(raw){
  if(!Array.isArray(raw)||raw.length===0||raw.length>POOL_MAX_CELLS)return null;
  if(!raw.every(validIndex))return null;
  const sorted=[...raw].sort((a,b)=>a-b);
  if(sorted.some((cell,i)=>i>0&&cell===sorted[i-1]))return null;
  return sorted;
}
export function poolCellBounds(cell){
  if(!validIndex(cell))return null;
  const x=BUILD_LOT.minX+(cell%POOL_GRID_WIDTH)*BUILD_STEP;
  const z=BUILD_LOT.minZ+Math.floor(cell/POOL_GRID_WIDTH)*BUILD_STEP;
  return {minX:x,maxX:x+BUILD_STEP,minZ:z,maxZ:z+BUILD_STEP};
}
export function poolCellIndex(x,z){
  if(!Number.isFinite(x)||!Number.isFinite(z)||
     x<BUILD_LOT.minX||x>=BUILD_LOT.maxX||z<BUILD_LOT.minZ||z>=BUILD_LOT.maxZ)
    return null;
  return Math.floor((z-BUILD_LOT.minZ)/BUILD_STEP)*POOL_GRID_WIDTH+
    Math.floor((x-BUILD_LOT.minX)/BUILD_STEP);
}
const adjacent=cell=>{
  const x=cell%POOL_GRID_WIDTH,z=Math.floor(cell/POOL_GRID_WIDTH);
  return [x>0?cell-1:null,x<POOL_GRID_WIDTH-1?cell+1:null,
    z>0?cell-POOL_GRID_WIDTH:null,z<POOL_GRID_HEIGHT-1?cell+POOL_GRID_WIDTH:null]
    .filter(v=>v!==null);
};
/** Deterministic 4-neighbour flood fill. Returns null only for invalid input. */
export function poolComponents(cells){
  if(Array.isArray(cells)&&cells.length===0)return [];
  const sorted=canonicalPoolCells(cells);
  if(!sorted)return null;
  const pending=new Set(sorted),result=[];
  for(const start of sorted){
    if(!pending.has(start))continue;
    const part=[],queue=[start];pending.delete(start);
    for(let i=0;i<queue.length;i++){
      const at=queue[i];part.push(at);
      for(const neighbour of adjacent(at))if(pending.delete(neighbour))queue.push(neighbour);
    }
    part.sort((a,b)=>a-b);result.push(part);
  }
  return result;
}
/** Each exterior edge belongs to a water tile, not a saved polygon or prefab. */
export function poolBoundaryEdges(cells){
  if(Array.isArray(cells)&&cells.length===0)return [];
  const sorted=canonicalPoolCells(cells);
  if(!sorted)return null;
  const set=new Set(sorted),edges=[];
  for(const cell of sorted){
    const x=cell%POOL_GRID_WIDTH,z=Math.floor(cell/POOL_GRID_WIDTH);
    for(const [side,neighbour,exists] of [
      ['west',cell-1,x>0],['east',cell+1,x<POOL_GRID_WIDTH-1],
      ['north',cell-POOL_GRID_WIDTH,z>0],['south',cell+POOL_GRID_WIDTH,z<POOL_GRID_HEIGHT-1]
    ])if(!exists||!set.has(neighbour))edges.push({cell,side});
  }
  return edges;
}
/** Exact quote independent of axis length, based on occupied quarter-square-metre cells. */
export function poolWaterPrice(componentCount,waterCellCount){
  if(!Number.isSafeInteger(componentCount)||componentCount<0||
     componentCount>POOL_MAX_COMPONENTS||
     !Number.isSafeInteger(waterCellCount)||waterCellCount<0||
     waterCellCount>POOL_MAX_CELLS||
     (componentCount===0)!==(waterCellCount===0))return null;
  return componentCount*POOL_BASE_CREDITS+
    Math.floor(waterCellCount*POOL_AREA_CREDITS_PER_SQUARE_METRE/4);
}
/** Unchanged components retain their id; merges choose largest overlap, splits
 * give the id to the largest retained component; ties are deterministic.
 * Only returns geometry drafts, not paid/committed purchase receipts.
 */
export function reconcilePoolComponents(previous,nextCells,nextPoolId=1){
  const components=poolComponents(nextCells);
  if(!components||components.length>POOL_MAX_COMPONENTS||!Array.isArray(previous)||
    !Number.isSafeInteger(nextPoolId)||nextPoolId<1||nextPoolId>10000000)
    return null;
  const old=previous.filter(p=>validPoolId(p?.poolId)&&canonicalPoolCells(p.cells))
    .map(p=>({id:p.poolId,cells:new Set(p.cells)}));
  const ranked=[];
  for(let i=0;i<components.length;i++)for(const item of old){
    let hits=0;
    for(const cell of components[i])if(item.cells.has(cell))hits++;
    if(hits)ranked.push({i,id:item.id,hits,size:components[i].length});
  }
  ranked.sort((a,b)=>b.hits-a.hits||b.size-a.size||
    poolIdNumber(a.id)-poolIdNumber(b.id)||a.i-b.i);
  const assigned=new Map(),used=new Set();
  for(const item of ranked){
    if(!assigned.has(item.i)&&!used.has(item.id)){
      assigned.set(item.i,item.id);used.add(item.id);
    }
  }
  const pools=[];let fresh=nextPoolId;
  for(let i=0;i<components.length;i++){
    let id=assigned.get(i);
    if(!id){
      if(fresh>9999999)return null;
      id='pool-'+fresh++;
      if(used.has(id))return null;
    }
    used.add(id);
    pools.push({poolId:id,cells:components[i]});
  }
  return {pools,nextPoolId:fresh};
}
const indexCache=new WeakMap();
function waterMap(outdoors){
  if(!outdoors||!Array.isArray(outdoors.pools))return null;
  const cached=indexCache.get(outdoors);
  if(cached&&cached.revision===outdoors.revision&&cached.source===outdoors.pools)
    return cached.map;
  const map=new Map();
  for(const pool of outdoors.pools.slice(0,POOL_MAX_COMPONENTS)){
    if(!validPoolId(pool?.poolId)||!Array.isArray(pool?.cells))continue;
    for(const cell of pool.cells.slice(0,POOL_MAX_CELLS))
      if(validIndex(cell))map.set(cell,pool.poolId);
  }
  indexCache.set(outdoors,{revision:outdoors.revision,source:outdoors.pools,map});
  return map;
}
/** Returns touched basin id or null. A radius expands shore collision for actors. */
export function poolWaterNear(worldOrOutdoors,x,z,radius=0){
  const outdoors=worldOrOutdoors?.outdoors||worldOrOutdoors;
  if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(radius)||
    radius<0||radius>1)return null;
  const map=waterMap(outdoors);
  if(!map?.size)return null;
  const left=Math.max(0,Math.floor((x-radius-BUILD_LOT.minX)/BUILD_STEP));
  const right=Math.min(POOL_GRID_WIDTH-1,Math.floor((x+radius-BUILD_LOT.minX)/BUILD_STEP));
  const north=Math.max(0,Math.floor((z-radius-BUILD_LOT.minZ)/BUILD_STEP));
  const south=Math.min(POOL_GRID_HEIGHT-1,Math.floor((z+radius-BUILD_LOT.minZ)/BUILD_STEP));
  if(left>right||north>south)return null;
  for(let j=north;j<=south;j++)for(let i=left;i<=right;i++){
    const cell=j*POOL_GRID_WIDTH+i,id=map.get(cell);
    if(!id)continue;
    const b=poolCellBounds(cell);
    const dx=Math.max(b.minX-x,0,x-b.maxX),dz=Math.max(b.minZ-z,0,z-b.maxZ);
    if(dx*dx+dz*dz<=radius*radius+1e-12)return id;
  }
  return null;
}
export function poolRectOverlaps(worldOrOutdoors,rect){
  const outdoors=worldOrOutdoors?.outdoors||worldOrOutdoors;
  if(!rect||!Object.values(rect).every(Number.isFinite))return false;
  const map=waterMap(outdoors);if(!map?.size)return false;
  for(const cell of map.keys()){
    const b=poolCellBounds(cell);
    if(rect.minX<b.maxX&&rect.maxX>b.minX&&rect.minZ<b.maxZ&&rect.maxZ>b.minZ)
      return true;
  }
  return false;
}
