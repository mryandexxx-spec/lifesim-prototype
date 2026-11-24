/** UX-02b: pure non-persistent quotes for already-owned furniture.
 * Source of truth remains F1 layout and F2 shop transactions, not this adapter.
 */
import {proposeFurnitureMove} from './furniture-layout.js';
import {restoreMarketItem,findStoredPlacement} from './furniture-shop.js';
import {isWindowPanel,windowPlacementCandidates} from './window-mount.js';
const offsets=Object.freeze([
  [0,-2.1],[-.7,-2],[.1,-1.45],[-1,-.8],[3.2,2.95],
  [-.8,3.65],[.3,3.5],[3.4,-1.4],[.5,2.6],[-1.5,1.1],
  [2.8,-1.5],[0,1.5],[-2,.2],[2.5,3.5],
  [6.4,-2.3],[8.4,-2.3],[10.5,-2.3],[12.2,-2.3],
  [6.4,0],[8.4,0],[10.5,0],[12.2,0],
  [6.4,2.3],[8.4,2.3],[10.5,2.3],[12.2,2.3]
]);
export function quoteOwnedPlacement(world,shop,kind,id,pose,opts={}){
  const item=world?.instances?.find(x=>x.instanceId===id);
  if(!item)return {ok:false,reason:'missing-instance'};
  if(kind==='restore')return restoreMarketItem(world,shop,id,pose,opts);
  if(kind!=='move'||item.location!=='home')
    return {ok:false,reason:'fixed-or-missing'};
  return proposeFurnitureMove(world,id,pose,opts);
}
export function findOwnedPlacement(world,shop,kind,id,opts={}){
  const item=world?.instances?.find(x=>x.instanceId===id);
  if(!item)return null;
  if(kind==='restore')return findStoredPlacement(world,shop,id,opts);
  if(kind!=='move'||item.location!=='home')return null;
  const poses=isWindowPanel(item.itemDefinitionId)?windowPlacementCandidates(opts.construction,item.itemDefinitionId):offsets.map(([x,z])=>({x,z,yaw:item.yaw}));
  for(const pose of poses)if((pose.x!==item.x||pose.z!==item.z)&&
    quoteOwnedPlacement(world,shop,'move',id,pose,opts).ok)return pose;
  return null;
}
