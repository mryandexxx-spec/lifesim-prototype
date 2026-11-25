import assert from 'node:assert/strict';
import {newHousehold} from '../src/household.js';
import {OF_VEGETATION_ENTRIES} from '../src/of-vegetation-assets.js';
import {OUTDOOR_CATALOG} from '../src/outdoor-catalog.js';
import {restoreOutdoorsWorld} from '../src/lot-surface.js';
export function makeVegetationLot(){
 const seed=newHousehold('2026-11-25');
 seed.minutes=12*60;seed.otherSim.minutes=seed.minutes;seed.paused=true;seed.otherSim.paused=true;seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
 const features=[];
 // The expanded starter shell reaches x=14; only use canonical free yard.
 // Reserve a full 2m pitch even for trees, and verify each proposed placement
 // with the actual v1 recovery policy. No geometry/collision bypass.
 const positions=[];
 for(let z=-10;z<=10;z+=2.5)for(let x=15.5;x<=21.5;x+=2)positions.push({x,z});
 for(let z=-10;z<=10;z+=2)for(let x=-7.5;x<=21.5;x+=2)positions.push({x,z});
 for(let i=0;i<36;i++){
  const sku=OF_VEGETATION_ENTRIES[i%9].sku;
  const item={instanceId:'out-'+(i+1),itemId:sku,yaw:(i%4)*90,purchasePriceCredits:OUTDOOR_CATALOG[sku].price};
  let placed=false;
  for(const {x,z} of positions){
   if(features.some(f=>Math.hypot(f.x-x,f.z-z)<1.99))continue;
   const candidate={...item,x,z};
   const restored=restoreOutdoorsWorld({...seed.world.outdoors,features:[...features,candidate],nextId:i+2},seed.world.construction);
   if(restored.features.length!==i+1||!restored.features.some(f=>f.instanceId===candidate.instanceId))continue;
   features.push(candidate);placed=true;break;
  }
  assert.ok(placed,'no legal yard position for '+item.instanceId+' '+sku);
 }
 seed.world.outdoors={...seed.world.outdoors,features,nextId:37};
 const restored=restoreOutdoorsWorld(seed.world.outdoors,seed.world.construction);
 assert.deepEqual(restored.features,features,'all 36 priced plants survive canonical v1 recovery');
 return {seed,features,restored};
}
