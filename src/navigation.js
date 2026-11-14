/** Headless navigation: room geometry in world X/Z coordinates, no PlayCanvas dependency. */
import {FRIDGE_LAYOUT} from './fridge-interaction.js';
export const ROOM = Object.freeze({ minX: -4.62, maxX: 4.62, minZ: -3.96, maxZ: 3.98 });
export const ACTOR_RADIUS = 0.26;
export const FURNITURE = Object.freeze([
  { id: 'bed', minX: -3.83, maxX: -1.41, minZ: -2.69, maxZ: -0.16 },
  { id: 'nightstand', minX: -4.56, maxX: -3.90, minZ: -3.69, maxZ: -3.01 },
  { id: 'counter', minX: 0.52, maxX: 2.87, minZ: -3.84, maxZ: -2.79 },
  { id: 'fridge', minX: 2.86, maxX: 4.04, minZ: -3.49, maxZ: -2.26 },
  { id: 'fridge-door-sweep', ...FRIDGE_LAYOUT.sweep },
  { id: 'sofa', minX: -0.07, maxX: 2.78, minZ: 0.89, maxZ: 2.29 },
  { id: 'table', minX: 0.59, maxX: 2.09, minZ: -0.65, maxZ: 0.13 },
  { id: 'tv', minX: 3.43, maxX: 4.30, minZ: -0.49, maxZ: 1.18 },
  { id: 'shower', minX: -4.65, maxX: -2.74, minZ: 1.54, maxZ: 3.49 },
  { id: 'plant', minX: 3.83, maxX: 4.52, minZ: 2.78, maxZ: 3.66 }
]);

/** Obstacles include a walking clearance radius to protect the body. */
export function isWalkable(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (x < ROOM.minX || x > ROOM.maxX || z < ROOM.minZ || z > ROOM.maxZ) return false;
  return !FURNITURE.some(rect =>
    x >= rect.minX - ACTOR_RADIUS && x <= rect.maxX + ACTOR_RADIUS &&
    z >= rect.minZ - ACTOR_RADIUS && z <= rect.maxZ + ACTOR_RADIUS);
}

/** Conservative segment test; the walkable character never cuts through inflated furniture. */
export function isClearLine(from, to) {
  if (!isWalkable(from.x, from.z) || !isWalkable(to.x, to.z)) return false;
  const dist = Math.hypot(to.x-from.x, to.z-from.z);
  const samples = Math.max(1, Math.ceil(dist / 0.075));
  for (let s = 1; s < samples; s++) {
    const t = s/samples;
    if (!isWalkable(from.x + (to.x-from.x)*t, from.z + (to.z-from.z)*t)) return false;
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
const nearestNode = point => {
  let best=-1, d=Infinity;
  for (let idx=0; idx<gridWalkable.length; idx++) {
    if (!gridWalkable[idx]) continue;
    const p=node(idx), dx=p.x-point.x, dz=p.z-point.z, dd=dx*dx+dz*dz;
    if (dd<d) { d=dd; best=idx; }
  }
  return best;
};

/** Repair an old save position if it is inside a newly defined obstacle. */
export function nearestWalkable(point) {
  if (isWalkable(point.x,point.z)) return { x: point.x, z: point.z };
  const index=nearestNode(point);
  return index<0 ? {x:0,z:0} : node(index);
}

function simplify(start, points) {
  if (!points.length) return [];
  const route=[];
  let origin=start, i=0;
  while (i<points.length) {
    let furthest=i;
    for(let j=i; j<points.length; j++) {
      if (isClearLine(origin,points[j])) furthest=j;
      else break;
    }
    // Some grid edges can be valid while the exact starting point is near a corner.
    // For those cases, use the next available waypoint rather than entering an obstacle.
    if (!isClearLine(origin,points[furthest])) return null;
    route.push(points[furthest]); origin=points[furthest]; i=furthest+1;
  }
  return route;
}

/** Returns safe world waypoints (without the origin), or null when no route exists. */
export function findPath(from, to) {
  if (!isWalkable(to.x,to.z)) return null;
  const start = nearestWalkable(from);
  if (isClearLine(start,to)) return [to];
  const initial=nearestNode(start), dest=nearestNode(to);
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
      const route=simplify(start,points);
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
      const cost=Math.hypot(dx,dz)*STEP;
      if(scores[current]+cost < scores[next]){
        scores[next]=scores[current]+cost;back[next]=current;
        if(!open.includes(next))open.push(next);
      }
    }
  }
  return null;
}
