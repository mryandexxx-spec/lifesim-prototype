/** Headless navigation: room geometry in world X/Z coordinates, no PlayCanvas dependency. */
import {FRIDGE_LAYOUT} from './fridge-interaction.js';
import {BUILD_LOT,constructionContains,constructionWallAt} from './construction.js';
import {insideLot,legacyLotWallAt,OUTDOORS_SCHEMA} from './lot-surface.js';
import {poolWaterNear} from './pool-topology.js';
import {outdoorFeatureObstacles} from './outdoor-catalog.js';
import {newFurnitureWorld,furnitureObstacles} from './furniture-catalog.js';
// F4D: eastward extension exactly doubles navigable floor area; old positions stay fixed.
export const ROOM = Object.freeze({ minX: -4.62, maxX: 13.86, minZ: -3.96, maxZ: 3.98 });
export const ACTOR_RADIUS = 0.26;
// Legacy export is generated from the same catalogue as the serializable layout.
export const FURNITURE = Object.freeze(furnitureObstacles(newFurnitureWorld()));
const layoutCache=new WeakMap();
// Function declaration is hoisted before the historic static-grid initialization.
function dynamicConstruction(layout){return layout?.construction?.schema===1&&
  (!layout.construction.legacy||layout?.outdoors?.schema===OUTDOORS_SCHEMA);}
function furnitureData(layout){
  return layout?.furniture?.instances?layout.furniture:layout?.instances?layout:null;
}
function obstaclesFor(layout){
  const data=furnitureData(layout);
  if(!data)return FURNITURE;
  const hit=layoutCache.get(data);
  if(hit&&hit.revision===data.revision)return hit.obstacles;
  const obstacles=furnitureObstacles(data);
  layoutCache.set(data,{revision:data.revision,obstacles,grid:null});
  return obstacles;
}
function canWalk(x,z,obstacles){
  if(!Number.isFinite(x)||!Number.isFinite(z))return false;
  if(x<ROOM.minX||x>ROOM.maxX||z<ROOM.minZ||z>ROOM.maxZ)return false;
  return !obstacles.some(rect=>x>=rect.minX-ACTOR_RADIUS&&x<=rect.maxX+ACTOR_RADIUS&&
    z>=rect.minZ-ACTOR_RADIUS&&z<=rect.maxZ+ACTOR_RADIUS);
}


/** Obstacles include a walking clearance radius to protect the body. */
export function isWalkable(x,z,layout=null){
  if(layout?.outdoors?.schema===OUTDOORS_SCHEMA&&layout?.construction?.schema===1)
    return insideLot(x,z)&&!poolWaterNear(layout.outdoors,x,z,ACTOR_RADIUS)&&
      !legacyLotWallAt(layout.construction,x,z,ACTOR_RADIUS)&&
      !constructionWallAt(layout,x,z,ACTOR_RADIUS)&&
      !obstaclesFor(layout).some(rect=>x>=rect.minX-ACTOR_RADIUS&&x<=rect.maxX+ACTOR_RADIUS&&
        z>=rect.minZ-ACTOR_RADIUS&&z<=rect.maxZ+ACTOR_RADIUS)&&
      !outdoorFeatureObstacles(layout).some(rect=>x>=rect.minX-ACTOR_RADIUS&&
        x<=rect.maxX+ACTOR_RADIUS&&z>=rect.minZ-ACTOR_RADIUS&&
        z<=rect.maxZ+ACTOR_RADIUS);
  if(dynamicConstruction(layout))return Number.isFinite(x)&&Number.isFinite(z)&&
    constructionContains(layout,x,z)&&!constructionWallAt(layout,x,z,ACTOR_RADIUS)&&
    !obstaclesFor(layout).some(rect=>x>=rect.minX-ACTOR_RADIUS&&x<=rect.maxX+ACTOR_RADIUS&&
      z>=rect.minZ-ACTOR_RADIUS&&z<=rect.maxZ+ACTOR_RADIUS);
  return canWalk(x,z,obstaclesFor(layout));
}

// Exact segment/AABB clipping for the same closed, radius-inflated rectangles
// used by isWalkable. A uniform point sample can miss a short corner crossing,
// so a route accepted at full length can otherwise fail at its movement prefix.
function segmentHitsObstacle(from,to,rect){
  const minX=rect.minX-ACTOR_RADIUS,maxX=rect.maxX+ACTOR_RADIUS;
  const minZ=rect.minZ-ACTOR_RADIUS,maxZ=rect.maxZ+ACTOR_RADIUS;
  if(Math.max(from.x,to.x)<minX||Math.min(from.x,to.x)>maxX||
    Math.max(from.z,to.z)<minZ||Math.min(from.z,to.z)>maxZ)return false;
  let enter=0,exit=1;
  for(const [a,b,min,max] of [[from.x,to.x,minX,maxX],[from.z,to.z,minZ,maxZ]]){
    const delta=b-a;
    if(delta===0){if(a<min||a>max)return false;continue;}
    const t0=(min-a)/delta,t1=(max-a)/delta;
    enter=Math.max(enter,Math.min(t0,t1));
    exit=Math.min(exit,Math.max(t0,t1));
    if(enter>exit)return false;
  }
  return true;
}

/** Conservative segment test; rectangular obstacles use continuous clipping.
 * Existing point checks remain for construction, pool and surface geometry.
 */
export function isClearLine(from,to,layout=null){
  if (!isWalkable(from.x, from.z,layout) || !isWalkable(to.x, to.z,layout)) return false;
  if(obstaclesFor(layout).some(rect=>segmentHitsObstacle(from,to,rect)))return false;
  if(layout?.outdoors?.schema===OUTDOORS_SCHEMA&&layout?.construction?.schema===1&&
    outdoorFeatureObstacles(layout).some(rect=>segmentHitsObstacle(from,to,rect)))return false;
  const dist = Math.hypot(to.x-from.x, to.z-from.z);
  const samples = Math.max(1, Math.ceil(dist / 0.075));
  for (let s = 1; s < samples; s++) {
    const t = s/samples;
    if (!isWalkable(from.x + (to.x-from.x)*t, from.z + (to.z-from.z)*t,layout)) return false;
  }
  return true;
}

const STEP = 0.22;
const GRID = {
  nx: Math.floor((ROOM.maxX - ROOM.minX)/STEP)+1,
  nz: Math.floor((ROOM.maxZ - ROOM.minZ)/STEP)+1
};
const gridPoint = (ix, iz) => ({ x: ROOM.minX + ix*STEP, z: ROOM.minZ + iz*STEP });
const indexOf = (ix, iz) => iz*GRID.nx + ix;
const node = idx => gridPoint(idx % GRID.nx, Math.floor(idx/GRID.nx));
const gridWalkable = new Uint8Array(GRID.nx*GRID.nz);
for (let z=0; z<GRID.nz; z++) for (let x=0; x<GRID.nx; x++) {
  const p=gridPoint(x,z); gridWalkable[indexOf(x,z)] = isWalkable(p.x,p.z) ? 1 : 0;
}
const DELTAS = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
function gridFor(layout){
  const data=furnitureData(layout);
  if(!data)return gridWalkable;
  const obstacles=obstaclesFor(data);
  const entry=layoutCache.get(data);
  if(entry.grid)return entry.grid;
  const grid=new Uint8Array(GRID.nx*GRID.nz);
  for(let z=0;z<GRID.nz;z++)for(let x=0;x<GRID.nx;x++){
    const p=gridPoint(x,z);
    grid[indexOf(x,z)]=canWalk(p.x,p.z,obstacles)?1:0;
  }
  entry.grid=grid;
  return grid;
}
const nearestNode = (point,layout) => {
  const gridWalkable=gridFor(layout);
  let best=-1, d=Infinity;
  for (let idx=0; idx<gridWalkable.length; idx++) {
    if (!gridWalkable[idx]) continue;
    const p=node(idx), dx=p.x-point.x, dz=p.z-point.z, dd=dx*dx+dz*dz;
    if (dd<d) { d=dd; best=idx; }
  }
  return best;
};

/** Repair an old save position if it is inside a newly defined obstacle. */
export function nearestWalkable(point,layout=null) {
  if(dynamicConstruction(layout)){
    if(isWalkable(point.x,point.z,layout))return {x:point.x,z:point.z};
    const dynamic=dynamicGrid(layout),idx=dynamicNearest(point,dynamic);
    return idx<0?{x:0,z:0}:dynamic.point(idx);
  }
  if (isWalkable(point.x,point.z,layout)) return { x: point.x, z: point.z };
  const index=nearestNode(point,layout);
  return index<0 ? {x:0,z:0} : node(index);
}

function simplify(start, points,layout) {
  if (!points.length) return [];
  const route=[];
  let origin=start, i=0;
  while (i<points.length) {
    let furthest=i;
    for(let j=i; j<points.length; j++) {
      if (isClearLine(origin,points[j],layout)) furthest=j;
      else break;
    }
    // Some grid edges can be valid while the exact starting point is near a corner.
    // For those cases, use the next available waypoint rather than entering an obstacle.
    if (!isClearLine(origin,points[furthest],layout)) return null;
    route.push(points[furthest]); origin=points[furthest]; i=furthest+1;
  }
  return route;
}

/** Returns safe world waypoints (without the origin), or null when no route exists. */
export function findPath(from,to,layout=null){
  if(dynamicConstruction(layout))return dynamicFindPath(from,to,layout);
  const gridWalkable=gridFor(layout);
  if(!isWalkable(to.x,to.z,layout))return null;
  const start=nearestWalkable(from,layout);
  if(isClearLine(start,to,layout))return [to];
  const initial=nearestNode(start,layout), dest=nearestNode(to,layout);
  if (initial<0 || dest<0) return null;
  const count=GRID.nx*GRID.nz;
  const scores=new Float64Array(count).fill(Infinity), back=new Int32Array(count).fill(-1);
  const closed=new Uint8Array(count);
  const open=[initial]; scores[initial]=0;
  const heuristic = i => { const p=node(i),q=node(dest);return Math.hypot(p.x-q.x,p.z-q.z); };
  // Tiny fixed grid (~1600 nodes): linear open-set scan is simpler than a binary heap.
  while(open.length) {
    let bestAt=0,bestValue=Infinity;
    for(let k=0;k<open.length;k++){ const val=scores[open[k]]+heuristic(open[k]); if(val<bestValue){bestValue=val;bestAt=k;} }
    const current=open.splice(bestAt,1)[0];
    if (current===dest) {
      const points=[];
      let iter=dest;
      while(iter!==initial && iter!==-1){points.push(node(iter)); iter=back[iter];}
      points.reverse(); points.push(to);
      // Ensure link from precise start to first grid waypoint is collision-free.
      // Near-grid-boundary starts can use a nearby free node instead.
      const route=simplify(start,points,layout);
      if(route) return route;
      return null;
    }
    if(closed[current]) continue;
    closed[current]=1;
    const cx=current%GRID.nx,cz=Math.floor(current/GRID.nx);
    for(const [dx,dz] of DELTAS) {
      const x=cx+dx,z=cz+dz;
      if(x<0||x>=GRID.nx||z<0||z>=GRID.nz) continue;
      const next=indexOf(x,z);
      if(!gridWalkable[next]||closed[next]) continue;
      if(dx && dz && (!gridWalkable[indexOf(cx+dx,cz)] || !gridWalkable[indexOf(cx,cz+dz)])) continue;
      if(!isClearLine(node(current),node(next),layout))continue;
      const cost=Math.hypot(dx,dz)*STEP;
      if(scores[current]+cost < scores[next]){
        scores[next]=scores[current]+cost;back[next]=current;
        if(!open.includes(next))open.push(next);
      }
    }
  }
  return null;
}

/** F5-A: no global ROOM resize, legacy A* remains byte-compatible for old saves.
 * Binary heap and layout-revision cache avoid quadratic scans on a 32×24 lot.
 */

const topologyGrids=new WeakMap();
const DSTEP=.22;
function dynamicGrid(layout){
  const construction=layout.construction,revision=[construction.revision||0,
    furnitureData(layout)?.revision||0,layout.outdoors?.revision||0].join(':');
  const prior=topologyGrids.get(construction);
  if(prior?.revision===revision)return prior.grid;
  const nx=Math.floor((BUILD_LOT.maxX-BUILD_LOT.minX)/DSTEP)+1;
  const nz=Math.floor((BUILD_LOT.maxZ-BUILD_LOT.minZ)/DSTEP)+1;
  const point=index=>({x:BUILD_LOT.minX+(index%nx)*DSTEP,
    z:BUILD_LOT.minZ+Math.floor(index/nx)*DSTEP});
  const walk=new Uint8Array(nx*nz);
  for(let k=0;k<walk.length;k++){
    const p=point(k);walk[k]=isWalkable(p.x,p.z,layout)?1:0;
  }
  const grid={nx,nz,walk,point};
  topologyGrids.set(construction,{revision,grid});
  return grid;
}
function dynamicNearest(p,g){
  let best=-1,d=Infinity;
  for(let i=0;i<g.walk.length;i++)if(g.walk[i]){
    const q=g.point(i),v=(q.x-p.x)**2+(q.z-p.z)**2;
    if(v<d){d=v;best=i;}
  }
  return best;
}
function dynamicFindPath(from,to,layout){
  if(!Number.isFinite(from?.x)||!Number.isFinite(from?.z)||
    !isWalkable(to?.x,to?.z,layout))return null;
  const start=nearestWalkable(from,layout);
  if(isClearLine(start,to,layout))return [to];
  const grid=dynamicGrid(layout),origin=dynamicNearest(start,grid),dest=dynamicNearest(to,grid);
  if(origin<0||dest<0)return null;
  const scores=new Float64Array(grid.walk.length).fill(Infinity);
  const parent=new Int32Array(grid.walk.length).fill(-1);
  const closed=new Uint8Array(grid.walk.length);
  const heap=[],pos=new Int32Array(grid.walk.length).fill(-1);
  const target=grid.point(dest);
  const cost=i=>{const p=grid.point(i);return scores[i]+Math.hypot(p.x-target.x,p.z-target.z);};
  const swap=(i,j)=>{const a=heap[i],b=heap[j];heap[i]=b;heap[j]=a;pos[a]=j;pos[b]=i;};
  const up=i=>{while(i){const p=(i-1)>>1;if(cost(heap[p])<=cost(heap[i]))break;swap(p,i);i=p;}};
  const down=i=>{for(;;){let v=i,l=i*2+1,r=l+1;if(l<heap.length&&cost(heap[l])<cost(heap[v]))v=l;if(r<heap.length&&cost(heap[r])<cost(heap[v]))v=r;if(v===i)break;swap(i,v);i=v;}};
  const push=n=>{if(pos[n]!==-1){up(pos[n]);return;}pos[n]=heap.length;heap.push(n);up(heap.length-1);};
  const pop=()=>{const top=heap[0],last=heap.pop();pos[top]=-1;if(heap.length){heap[0]=last;pos[last]=0;down(0);}return top;};
  scores[origin]=0;push(origin);
  while(heap.length){
    const current=pop();
    if(closed[current])continue;
    if(current===dest){
      const route=[];let cursor=dest;
      while(cursor!==origin&&cursor!==-1){route.push(grid.point(cursor));cursor=parent[cursor];}
      if(cursor!==origin)return null;
      route.reverse();route.push(to);
      return simplify(start,route,layout);
    }
    closed[current]=1;
    const x=current%grid.nx,z=Math.floor(current/grid.nx);
    for(const [dx,dz] of DELTAS){
      const xx=x+dx,zz=z+dz;
      if(xx<0||xx>=grid.nx||zz<0||zz>=grid.nz)continue;
      const next=zz*grid.nx+xx;
      if(!grid.walk[next]||closed[next])continue;
      if(dx&&dz&&(!grid.walk[z*grid.nx+xx]||!grid.walk[zz*grid.nx+x]))continue;
      if(!isClearLine(grid.point(current),grid.point(next),layout))continue;
      const candidate=scores[current]+Math.hypot(dx,dz)*DSTEP;
      if(candidate<scores[next]){scores[next]=candidate;parent[next]=current;push(next);}
    }
  }
  return null;
}
