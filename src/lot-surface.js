/** LOT-A/B: one canonical parcel surface shared by navigation, touch, renderer.
 * Optional outdoor entries extend root-v1 without replacing indoor construction.
 */
import {BUILD_LOT,BUILD_STEP,constructionContains} from './construction.js';
import {GARDEN_LIMIT,isGardenItem,restoreGardens} from './gardening.js';
import {POOL_MAX_CELLS,POOL_MAX_COMPONENTS,validPoolId,poolIdNumber,
  canonicalPoolCells,poolComponents,poolCellBounds,poolWaterNear,poolRectOverlaps}
  from './pool-topology.js';
import {OUTDOOR_CATALOG,OUTDOOR_FEATURE_LIMIT,validOutdoorId,
  outdoorFeatureRect,outdoorRectsOverlap} from './outdoor-catalog.js';

export const OUTDOORS_SCHEMA=1;
export const LOT_ACTOR_CLEARANCE=.26;
export const YARD_SURFACE_Y=-.53;
export const HOUSE_SURFACE_Y=0;
export const OUTDOOR_GRID_WIDTH=64;
export const OUTDOOR_GRID_HEIGHT=48;
export const OUTDOOR_GROUND_LIMIT=1536;
export const OUTDOOR_GROUND_PRICE=Object.freeze({
  lawn:0,stone:8,gravel:5,soil:2,flowers:12
});
export const OUTDOOR_GROUND_KINDS=Object.freeze(Object.keys(OUTDOOR_GROUND_PRICE));
const gridCells=OUTDOOR_GRID_WIDTH*OUTDOOR_GRID_HEIGHT;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const validRevision=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000000;
const quarter=n=>finite(n)&&Math.abs(n*4-Math.round(n*4))<1e-7;

export function newOutdoorsWorld(){
  return {schema:OUTDOORS_SCHEMA,revision:0,ground:[],features:[],nextId:1,
    pools:[],nextPoolId:1,poolTxnSeq:0};
}
/** Grid coordinates are canonical indices, not floats saved in 3072 objects. */
export function outdoorCellAt(x,z){
  if(!finite(x)||!finite(z)||x<BUILD_LOT.minX||x>=BUILD_LOT.maxX||
     z<BUILD_LOT.minZ||z>=BUILD_LOT.maxZ)return null;
  const i=Math.floor((x-BUILD_LOT.minX)/BUILD_STEP);
  const j=Math.floor((z-BUILD_LOT.minZ)/BUILD_STEP);
  return j*OUTDOOR_GRID_WIDTH+i;
}
export function outdoorCellCenter(cell){
  if(!Number.isSafeInteger(cell)||cell<0||cell>=gridCells)return null;
  return {x:BUILD_LOT.minX+(cell%OUTDOOR_GRID_WIDTH+.5)*BUILD_STEP,
    z:BUILD_LOT.minZ+(Math.floor(cell/OUTDOOR_GRID_WIDTH)+.5)*BUILD_STEP};
}
/** Reject trees under room floors/porches and outside the 32x24 plot. */
export function outdoorFeatureFits(item,construction=null,outdoors=null){
  const rect=outdoorFeatureRect(item);
  if(!rect||!quarter(item.x)||!quarter(item.z)||
     rect.minX<BUILD_LOT.minX+.02||rect.maxX>BUILD_LOT.maxX-.02||
     rect.minZ<BUILD_LOT.minZ+.02||rect.maxZ>BUILD_LOT.maxZ-.02)
    return false;
  if(outdoors&&poolRectOverlaps(outdoors,rect))return false;
  if(!construction)return true;
  // World ownership is tested across the complete rectangular footprint,
  // not only at the center of a large tree or bench.
  const nx=Math.max(1,Math.ceil((rect.maxX-rect.minX)/.25));
  const nz=Math.max(1,Math.ceil((rect.maxZ-rect.minZ)/.25));
  for(let ix=0;ix<=nx;ix++)for(let iz=0;iz<=nz;iz++){
    const x=rect.minX+(rect.maxX-rect.minX)*ix/nx;
    const z=rect.minZ+(rect.maxZ-rect.minZ)*iz/nz;
    if(constructionContains(construction,x,z))return false;
  }
  return true;
}
/** Bounded per-entry recovery: a damaged outdoor edit never resets the house,
 * its characters, queue, money or career.
 */
export function restoreOutdoorsWorld(raw,construction=null,atGameMinute=null){
  if(!raw||raw.schema!==OUTDOORS_SCHEMA)return newOutdoorsWorld();
  const next=newOutdoorsWorld();
  next.revision=validRevision(raw.revision)?raw.revision:0;
  const cells=new Map();
  if(Array.isArray(raw.ground))for(const entry of raw.ground.slice(0,OUTDOOR_GROUND_LIMIT*4)){
    if(!Number.isSafeInteger(entry?.cell)||entry.cell<0||entry.cell>=gridCells||
      !Object.hasOwn(OUTDOOR_GROUND_PRICE,entry.kind)||entry.kind==='lawn')continue;
    const center=outdoorCellCenter(entry.cell);
    if(construction&&constructionContains(construction,center.x,center.z))continue;
    cells.set(entry.cell,entry.kind);
    if(cells.size>=OUTDOOR_GROUND_LIMIT)break;
  }
  next.ground=[...cells].sort(([a],[b])=>a-b).map(([cell,kind])=>({cell,kind}));
  const seen=new Set(),rects=[];
  let greatestId=0,gardenCount=0;
  if(Array.isArray(raw.features))for(const saved of raw.features.slice(0,OUTDOOR_FEATURE_LIMIT*4)){
    if(next.features.length>=OUTDOOR_FEATURE_LIMIT)break;
    if(!validOutdoorId(saved?.instanceId)||seen.has(saved.instanceId)||
       !OUTDOOR_CATALOG[saved?.itemId]||
       ![0,90,180,270].includes(saved.yaw)||
       !outdoorFeatureFits(saved,construction)||
       !Number.isSafeInteger(saved.purchasePriceCredits)||
       saved.purchasePriceCredits<0||saved.purchasePriceCredits>1000000)continue;
    const rect=outdoorFeatureRect(saved);
    if(isGardenItem(saved.itemId)&&gardenCount>=GARDEN_LIMIT)continue;
    if(rects.some(prior=>outdoorRectsOverlap(prior,rect)))continue;
    if(isGardenItem(saved.itemId))gardenCount++;
    seen.add(saved.instanceId);rects.push(rect);
    greatestId=Math.max(greatestId,Number(saved.instanceId.slice(4)));
    next.features.push({instanceId:saved.instanceId,itemId:saved.itemId,
      x:saved.x,z:saved.z,yaw:saved.yaw,
      purchasePriceCredits:saved.purchasePriceCredits});
  }
  const requestedId=Number.isSafeInteger(raw.nextId)&&raw.nextId>=1&&
    raw.nextId<=10000000?raw.nextId:1;
  next.nextId=Math.min(10000000,Math.max(requestedId,greatestId+1));
  if(gardenCount)next.gardens=restoreGardens(raw.gardens,next.features,atGameMinute);
  // Pools are optional in every existing root-v1 save. Reject only a damaged
  // pool, never repair by overwriting the home, money, garden or furniture.
  const accepted=new Set(),poolIds=new Set();
  let largestPoolId=0,totalWater=0;
  if(Array.isArray(raw.pools))for(const saved of raw.pools.slice(0,POOL_MAX_COMPONENTS*4)){
    if(next.pools.length>=POOL_MAX_COMPONENTS)break;
    const sorted=canonicalPoolCells(saved?.cells);
    if(!validPoolId(saved?.poolId)||poolIds.has(saved.poolId)||!sorted||
       totalWater+sorted.length>POOL_MAX_CELLS||
       poolComponents(sorted).length!==1)continue;
    let blocked=false;
    for(const cell of sorted){
      if(accepted.has(cell)){blocked=true;break;}
      const b=poolCellBounds(cell);
      if(rects.some(rect=>outdoorRectsOverlap(rect,b))){blocked=true;break;}
      if(construction){
        const q=.02;
        const sites=[[b.minX+q,b.minZ+q],[b.maxX-q,b.minZ+q],
          [b.minX+q,b.maxZ-q],[b.maxX-q,b.maxZ-q],
          [(b.minX+b.maxX)/2,(b.minZ+b.maxZ)/2]];
        if(sites.some(([x,z])=>constructionContains(construction,x,z))){
          blocked=true;break;
        }
      }
    }
    if(blocked)continue;
    poolIds.add(saved.poolId);
    largestPoolId=Math.max(largestPoolId,poolIdNumber(saved.poolId));
    totalWater+=sorted.length;
    for(const cell of sorted)accepted.add(cell);
    next.pools.push({poolId:saved.poolId,cells:sorted});
  }
  const wantedPoolId=Number.isSafeInteger(raw.nextPoolId)&&raw.nextPoolId>=1&&
    raw.nextPoolId<=10000000?raw.nextPoolId:1;
  next.nextPoolId=Math.min(10000000,Math.max(wantedPoolId,largestPoolId+1));
  if(validRevision(raw.poolTxnSeq))next.poolTxnSeq=raw.poolTxnSeq;
  return next;
}
const groundCache=new WeakMap();
export function outdoorGroundKind(outdoors,x,z){
  const cell=outdoorCellAt(x,z);
  if(cell===null)return null;
  if(!outdoors||!Array.isArray(outdoors.ground))return 'lawn';
  let cached=groundCache.get(outdoors);
  if(!cached||cached.revision!==outdoors.revision||cached.source!==outdoors.ground){
    cached={revision:outdoors.revision,source:outdoors.ground,
      map:new Map(outdoors.ground.map(e=>[e.cell,e.kind]))};
    groundCache.set(outdoors,cached);
  }
  return cached.map.get(cell)||'lawn';
}

export function insideLot(x,z,margin=LOT_ACTOR_CLEARANCE){
  return Number.isFinite(x)&&Number.isFinite(z)&&Number.isFinite(margin)&&margin>=0&&
    x>=BUILD_LOT.minX+margin&&x<=BUILD_LOT.maxX-margin&&
    z>=BUILD_LOT.minZ+margin&&z<=BUILD_LOT.maxZ-margin;
}
/** Classify the *topmost* physical ground; never treat a yard tile as a roofable room. */
export function lotSurfaceAt(world,x,z){
  if(!insideLot(x,z))return {kind:'outside',y:null,walkable:false};
  if(constructionContains(world,x,z))
    return {kind:'floor',y:HOUSE_SURFACE_Y,walkable:true};
  const poolId=poolWaterNear(world?.outdoors,x,z);
  if(poolId)return {kind:'pool-water',y:YARD_SURFACE_Y,walkable:false,poolId};
  return {kind:'yard',y:YARD_SURFACE_Y,walkable:true,ground:outdoorGroundKind(world?.outdoors,x,z)};
}
/** A real wall in the original cutaway room is still solid on west and north.
 * East/south were intentionally open in legacy household saves.
 */
export function legacyLotWallAt(construction,x,z,radius=LOT_ACTOR_CLEARANCE){
  if(construction?.legacy!==true)return false;
  const shell=construction.starterShell||{west:-10,east:28,north:-9,south:9};
  const west=shell.west*.5,north=shell.north*.5;
  const minX=west,maxX=shell.east*.5,minZ=north,maxZ=shell.south*.5;
  return (Math.abs(x-west)<=radius+.09&&z>=minZ-radius&&z<=maxZ+radius)||
    (Math.abs(z-north)<=radius+.09&&x>=minX-radius&&x<=maxX+radius);
}
/** Nearest visible supported plane along the actual PlayCanvas camera ray.
 * A tap on the sky or ground behind the edge of the property has no target.
 */
export function lotRaySurface(near,far,world){
  if(!near||!far||![near.x,near.y,near.z,far.x,far.y,far.z].every(Number.isFinite))
    return null;
  const dy=far.y-near.y;
  if(Math.abs(dy)<1e-9)return null;
  const options=[];
  for(const [y,kind] of [[HOUSE_SURFACE_Y,'floor'],[YARD_SURFACE_Y,'pool-water'],[YARD_SURFACE_Y,'yard']]){
    const t=(y-near.y)/dy;
    if(t<0||t>1)continue;
    const x=near.x+(far.x-near.x)*t,z=near.z+(far.z-near.z)*t;
    if(lotSurfaceAt(world,x,z).kind===kind)options.push({x,z,y,kind,t});
  }
  options.sort((a,b)=>a.t-b.t);
  return options[0]||null;
}
/** 3D display offset, optional smoothing is owned by the existing avatar spring. */
export function lotActorHeight(world,position){
  return lotSurfaceAt(world,position?.x,position?.z).y??0;
}
