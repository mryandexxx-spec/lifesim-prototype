/** LOT-D3a: one pure, renderer-independent protection gate for other editors.
 * Pool construction itself remains owned by pool-editor.js. This validator
 * checks prospective *non-pool* worlds before an atomic commit or history
 * traversal; it never mutates residents, queues, credits or root-v1 saves.
 */
import {poolCellBounds} from './pool-topology.js';
import {poolFixtureSite} from './pool-equipment.js';
import {constructionContains,constructionWallAt} from './construction.js';
import {outdoorFeatureRect} from './outdoor-catalog.js';
import {furnitureObstacles} from './furniture-catalog.js';
import {findPath,isWalkable,ACTOR_RADIUS} from './navigation.js';

const pass=()=>({ok:true});
const fail=reason=>({ok:false,reason});
const points=root=>[root?.position,root?.otherSim?.position].filter(p=>
  Number.isFinite(p?.x)&&Number.isFinite(p?.z));
const contains=(rect,p)=>rect&&p.x>=rect.minX-ACTOR_RADIUS&&
  p.x<=rect.maxX+ACTOR_RADIUS&&p.z>=rect.minZ-ACTOR_RADIUS&&
  p.z<=rect.maxZ+ACTOR_RADIUS;
const approachBlocked=(world,at)=>{
  const features=world.outdoors?.features||[];
  return features.some(f=>contains(outdoorFeatureRect(f),at))||
    furnitureObstacles(world.furniture).some(r=>contains(r,at))||
    constructionContains(world.construction,at.x,at.z);
};
const samples=b=>[
  {x:(b.minX+b.maxX)/2,z:(b.minZ+b.maxZ)/2},
  {x:b.minX+.10,z:b.minZ+.10},
  {x:b.maxX-.10,z:b.minZ+.10},
  {x:b.minX+.10,z:b.maxZ-.10},
  {x:b.maxX-.10,z:b.maxZ-.10}
];

/** Pool cells, real fixture landing places, and previously reachable paths
 * must survive house, garden/yard, furniture and history changes.
 * Existing bad old saves are not destroyed: only NEW obstruction is refused.
 *
 * `candidate` contains changed world slices (construction/furniture/outdoors).
 * The household root is the authoritative current snapshot. Pool topology
 * cannot be replaced by this guard; only the pool editor may modify it.
 */
export function protectPoolFromWorldEdit(root,candidate={}){
  const before=root?.world;
  if(!before?.construction||!before?.furniture)return pass();
  const pools=before.outdoors?.pools;
  if(!Array.isArray(pools)||!pools.some(p=>p?.cells?.length))return pass();
  const after={...before,...candidate,outdoors:before.outdoors};
  if(candidate.outdoors)after.outdoors=candidate.outdoors;
  // This is not an alternate pool editor: deny a candidate replacing water or
  // equipment through an unrelated construction/furniture/outdoor command.
  if(JSON.stringify(after.outdoors?.pools)!==JSON.stringify(pools)||
     JSON.stringify(after.outdoors?.poolFixtures)!==
       JSON.stringify(before.outdoors?.poolFixtures))
    return fail('pool-editor-required');

  if(after.construction!==before.construction){
    for(const pool of pools)for(const cell of pool.cells||[]){
      const bounds=poolCellBounds(cell);
      if(!bounds)continue;
      for(const pt of samples(bounds)){
        if(!constructionContains(before.construction,pt.x,pt.z)&&
          constructionContains(after.construction,pt.x,pt.z))
          return fail('pool-water-overlap');
      }
      // Include radius so walls cannot shave the swimmable water edge.
      const center=samples(bounds)[0];
      if(!constructionWallAt(before.construction,center.x,center.z,.26)&&
         constructionWallAt(after.construction,center.x,center.z,.26))
        return fail('pool-water-overlap');
    }
  }
  for(const fixture of before.outdoors.poolFixtures||[]){
    const basin=pools.find(p=>p.poolId===fixture.poolId);
    const site=poolFixtureSite(basin,fixture.edgeCell,fixture.side,fixture.kind);
    if(!site)continue; // Old damaged fixtures are handled by save sanitizer.
    const dry=site.dryApproach;
    const wasClear=!approachBlocked(before,dry)&&isWalkable(dry.x,dry.z,before);
    if(wasClear&&(approachBlocked(after,dry)||
        !isWalkable(dry.x,dry.z,after)))
      return fail('pool-landing-blocked');
    // A newly enclosed ladder, steps or board is not a usable fixture.
    if(!wasClear)continue;
    for(const actor of points(root)){
      if(!isWalkable(actor.x,actor.z,before))continue;
      if(findPath(actor,dry,before)&&!findPath(actor,dry,after))
        return fail('pool-exit-unreachable');
    }
  }
  return pass();
}
