/** H1n: headless, resumable book journey. Geometry and reservations live here;
 * the renderer only animates the real seat and the temporary carried book.
 * No PlayCanvas, UI, currency or saved version changes.
 */
import {FURNITURE_CATALOG,furnitureActionApproach,
  resolveActionFurniture,validFurnitureInstanceId} from './furniture-catalog.js';
import {findPath} from './navigation.js';

export const READING_JOURNEY_STAGES=Object.freeze([
  'toShelf','taking','toSeat','sitting','opening','reading','closing',
  'standing','returnShelf','returning'
]);
export const READING_ROUTE_STAGES=Object.freeze(['toShelf','toSeat','returnShelf']);
export const READING_SEATED_STAGES=Object.freeze([
  'sitting','opening','reading','closing'
]);
export const READING_STAGE_MINUTES=Object.freeze({
  taking:2.4,sitting:6,opening:2.4,closing:2.4,standing:5.4,returning:2.4
});
const next=Object.freeze({
  taking:'toSeat',sitting:'opening',opening:'reading',
  closing:'standing',standing:'returnShelf',returning:'done'
});
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
/** A future chair can opt in with seat.read and a validated pose adapter;
 * for now the built-in sofa is the only supported skinned seat transition.
 */
export function isReadingSeat(item){
  const def=FURNITURE_CATALOG[item?.prefabId];
  return Boolean(item?.location==='home'&&def?.capabilities.includes('seat.read')&&
    def?.actionId==='sofa');
}
export const readingSeatId=action=>action?.id==='hobby'&&
  validFurnitureInstanceId(action.readingSeatInstanceId)
  ?action.readingSeatInstanceId:null;
export const readingStage=action=>action?.id==='hobby'&&
  READING_JOURNEY_STAGES.includes(action.readingStage)
  ?action.readingStage:null;
export const readingIsSeated=action=>READING_SEATED_STAGES.includes(readingStage(action));
export const readingHasBook=action=>Boolean(readingStage(action)&&
  !['toShelf','taking'].includes(readingStage(action)));
export const readingRouteId=action=>
  READING_ROUTE_STAGES.includes(readingStage(action))
    ?'hobby:'+action.readingStage:null;
const occupiedSeats=(root,residentId)=>{
  const blocked=new Set();
  if(root?.socialAction?.eveningSofa?.instanceId)
    blocked.add(root.socialAction.eveningSofa.instanceId);
  const otherId=residentId==='alex'?'mira':'alex';
  const other=otherId==='mira'?root?.otherSim:root;
  const action=other?.action;
  if(action?.id==='sofa')blocked.add(action.targetInstanceId||'home-sofa-1');
  if(action?.id==='tv'&&action.watchSeatInstanceId)blocked.add(action.watchSeatInstanceId);
  if(readingSeatId(action))blocked.add(action.readingSeatInstanceId);
  for(const command of root?.actionQueues?.byResident?.[otherId]||[])
    if(command.type==='object'&&command.actionId==='sofa')
      blocked.add(command.targetInstanceId||'home-sofa-1');
  return blocked;
};
const pathLength=(from,route)=>{
  let at=from,length=0;
  for(const p of route){length+=dist(at,p);at=p;}
  return length;
};
/** Nearest FREE sofa by actual A* travel from the exact purchased bookcase.
 * Stable instance-ID tie break avoids save/replay divergence.
 */
export function chooseReadingSeat(root,residentId,bookcaseId,requestedSeatId=null){
  if(!['alex','mira'].includes(residentId)||
    !validFurnitureInstanceId(bookcaseId)||
    (requestedSeatId!==null&&!validFurnitureInstanceId(requestedSeatId)))
    return null;
  const source=resolveActionFurniture(root?.world,'hobby',bookcaseId);
  const shelf=source&&furnitureActionApproach(root.world,'hobby',bookcaseId);
  if(!shelf)return null;
  const occupied=occupiedSeats(root,residentId);
  let best=null,bestCost=Infinity;
  for(const item of root.world?.furniture?.instances||[]){
    if(!isReadingSeat(item)||occupied.has(item.instanceId)||
      (requestedSeatId!==null&&item.instanceId!==requestedSeatId))continue;
    const to=furnitureActionApproach(root.world,'sofa',item.instanceId);
    if(!to)continue;
    const route=findPath(shelf,to,root.world);
    if(!route)continue;
    const cost=pathLength(shelf,route);
    if(cost<bestCost-1e-8||(Math.abs(cost-bestCost)<=1e-8&&
      (best===null||item.instanceId<best.instanceId))){
      best={instanceId:item.instanceId,prefabId:item.prefabId,
        approach:to,routeCost:cost};
      bestCost=cost;
    }
  }
  return best;
}
export function beginReadingJourney(action,seat){
  if(action?.id!=='hobby'||action.phase!=='walking'||
    !validFurnitureInstanceId(seat?.instanceId)||!isReadingSeat({
      location:'home',prefabId:seat.prefabId}))return false;
  action.readingSeatInstanceId=seat.instanceId;
  action.readingStage='toShelf';
  action.readingStepElapsed=0;
  return true;
}
export function arriveReadingJourney(action){
  const stage=readingStage(action);
  const target=stage==='toShelf'?'taking':
    stage==='toSeat'?'sitting':stage==='returnShelf'?'returning':null;
  if(!target||action.phase!=='walking')return false;
  action.readingStage=target;
  action.readingStepElapsed=0;
  return true;
}
export function finishReadingMinutes(action){
  if(readingStage(action)!=='reading'||action.phase!=='using')return false;
  action.phase='walking';
  action.readingStage='closing';
  action.readingStepElapsed=0;
  return true;
}
/** Timers are game minutes, just like the reading activity. Only the
 * actual reading stage runs simulation benefits/skill practice.
 */
export function advanceReadingJourney(action,minutes){
  const stage=readingStage(action),duration=READING_STAGE_MINUTES[stage];
  if(!duration||action?.phase!=='walking'||!Number.isFinite(minutes)||
    minutes<=0||minutes>1440)return {done:false,stage};
  action.readingStepElapsed=Math.min(duration,
    (Number.isFinite(action.readingStepElapsed)
      ?Math.max(0,action.readingStepElapsed):0)+minutes);
  if(action.readingStepElapsed+1e-9<duration)return {done:false,stage};
  const target=next[stage];
  action.readingStepElapsed=0;
  if(target==='done')return {done:true,stage:'done'};
  action.readingStage=target;
  if(target==='reading')action.phase='using';
  return {done:false,stage:target};
}
export function validReadingJourneyAction(action){
  const stage=readingStage(action);
  if(!stage||!readingSeatId(action)||
    !Number.isFinite(action.readingStepElapsed)||action.readingStepElapsed<0||
    action.readingStepElapsed>=(READING_STAGE_MINUTES[stage]??1))return false;
  return (stage==='reading')===(action.phase==='using')&&
    (stage==='reading'||action.phase==='walking');
}
