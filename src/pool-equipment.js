/** LOT-D1b: pool fixtures are canonical save objects, never cosmetic shop items. */
import {poolBoundaryEdges,poolCellBounds,POOL_GRID_WIDTH,POOL_GRID_HEIGHT,validPoolId}
 from './pool-topology.js';

export const POOL_FIXTURE_PRICES=Object.freeze({ladder:120,steps:180,board:400});
export const POOL_FIXTURE_LIMIT=64;
export const POOL_SIDES=Object.freeze(['west','east','north','south']);
export const validPoolFixtureId=id=>typeof id==='string'&&/^fixture-[1-9][0-9]{0,6}$/.test(id);
const delta={west:[-1,0],east:[1,0],north:[0,-1],south:[0,1]};

/** Exterior edge only, independent of perspective, camera and walk/nav. */
export function poolFixtureSite(pool,edgeCell,side,kind){
  if(!pool||!validPoolId(pool.poolId)||!POOL_SIDES.includes(side)||
     !Object.hasOwn(POOL_FIXTURE_PRICES,kind)||
     !Array.isArray(pool.cells)||!pool.cells.includes(edgeCell)||
     !poolBoundaryEdges(pool.cells)?.some(e=>e.cell===edgeCell&&e.side===side))
    return null;
  const bounds=poolCellBounds(edgeCell);
  if(!bounds)return null;
  const [dx,dz]=delta[side],x=edgeCell%POOL_GRID_WIDTH,
    z=Math.floor(edgeCell/POOL_GRID_WIDTH);
  const dryX=x+dx,dryZ=z+dz;
  if(dryX<0||dryX>=POOL_GRID_WIDTH||dryZ<0||dryZ>=POOL_GRID_HEIGHT)
    return null;
  const cx=(bounds.minX+bounds.maxX)/2,cz=(bounds.minZ+bounds.maxZ)/2;
  // Actor radius .26: 0.54m from tile centre keeps feet off water.
  const dryApproach={x:cx+dx*.54,z:cz+dz*.54};
  if(kind==='board'){
    // Safe feet-first board: a real uncluttered 2x2m water landing patch
    // (4x4 contiguous half-metre tiles). The board faces INTO the water.
    const water=new Set(pool.cells),insideX=-dx,insideZ=-dz,
      lateralX=dz,lateralZ=-dx;
    for(let forward=0;forward<4;forward++)
      for(let across=-1;across<=2;across++){
        const xx=x+forward*insideX+across*lateralX,
          zz=z+forward*insideZ+across*lateralZ;
        if(xx<0||xx>=POOL_GRID_WIDTH||zz<0||zz>=POOL_GRID_HEIGHT||
           !water.has(zz*POOL_GRID_WIDTH+xx))return null;
      }
  }
  return {dryApproach,waterCell:kind==='board'?edgeCell-2*(dz*POOL_GRID_WIDTH+dx):edgeCell};
}
export function validPoolFixture(fixture,pools){
  if(!validPoolFixtureId(fixture?.fixtureId)||!validPoolId(fixture?.poolId)||
     !Object.hasOwn(POOL_FIXTURE_PRICES,fixture.kind)||
     fixture.purchasePriceCredits!==POOL_FIXTURE_PRICES[fixture.kind])
    return false;
  const pool=pools.find(p=>p.poolId===fixture.poolId);
  return Boolean(poolFixtureSite(pool,fixture.edgeCell,fixture.side,fixture.kind));
}
export function poolHasExit(outdoors,poolId){
  return (outdoors?.poolFixtures||[]).some(f=>f.poolId===poolId&&
    (f.kind==='ladder'||f.kind==='steps')&&validPoolFixture(f,outdoors.pools||[]));
}
