/** LOT-C1: functional garden domain. Pure game-clock rules; no DOM, timers or rendering. */
import {OUTDOOR_CATALOG,outdoorFeatureRect} from './outdoor-catalog.js';
import {findPath,isWalkable} from './navigation.js';
import {recordFinanceChange} from './finance-ledger.js';
import {KITCHEN_HARVEST_UNITS,KITCHEN_HERB_LIMIT} from './kitchen.js';

export const GARDEN_LIMIT=8;
export const GARDEN_MATURE_MINUTES=4320;
export const GARDEN_HYDRATION_MINUTES=2160;
export const GARDEN_CARE_COOLDOWN=1440;
export const GARDEN_ACTIONS=Object.freeze(['water','admire','inspect','harvest','replant']);
export const GARDEN_DURATION=Object.freeze({water:15,admire:8,inspect:8,harvest:12,replant:10});
export const GARDEN_REPLANT_PRICE=30;
export const GARDEN_LABELS=Object.freeze(['Посажено','Росток','Подросло','Цветёт']);
const validMinute=n=>Number.isFinite(n)&&n>=0&&n<=10000000;
const round=n=>Math.round(n*1000000)/1000000;
export const isGardenItem=itemId=>OUTDOOR_CATALOG[itemId]?.category==='garden';
export const gardenFeature=(world,id)=>(world?.outdoors?.features||[]).find(
  f=>f.instanceId===id&&isGardenItem(f.itemId))||null;
export function newGardenRecord(atGameMinute=0){
  const time=validMinute(atGameMinute)?atGameMinute:0;
  return {schema:1,plantedAt:time,evaluatedAt:time,progressWetMinutes:0,
    hydratedUntil:0,lastWateredAt:null,harvestedAt:null};
}
export function restoreGardenRecord(raw,atGameMinute=null){
  const fallback=newGardenRecord(atGameMinute??0);
  if(raw?.schema!==1||!validMinute(raw.plantedAt)||
    !validMinute(raw.evaluatedAt)||raw.evaluatedAt<raw.plantedAt||
    !validMinute(raw.progressWetMinutes)||raw.progressWetMinutes>GARDEN_MATURE_MINUTES||
    !Number.isFinite(raw.hydratedUntil)||raw.hydratedUntil<0||
    raw.hydratedUntil>10002160||
    (raw.lastWateredAt!==null&&raw.lastWateredAt!==undefined&&
      !validMinute(raw.lastWateredAt)))return fallback;
  const now=validMinute(atGameMinute)?atGameMinute:null;
  // A malformed future timestamp is not a license to accrue offline growth.
  if(now!==null&&(raw.plantedAt>now||raw.evaluatedAt>now))return fallback;
  return {schema:1,plantedAt:raw.plantedAt,evaluatedAt:raw.evaluatedAt,
    progressWetMinutes:raw.progressWetMinutes,hydratedUntil:raw.hydratedUntil,
    lastWateredAt:raw.lastWateredAt??null,
    harvestedAt:validMinute(raw.harvestedAt)&&raw.harvestedAt>=raw.plantedAt&&
      raw.harvestedAt<=raw.evaluatedAt&&raw.progressWetMinutes>=GARDEN_MATURE_MINUTES
      ?raw.harvestedAt:null};
}
export function restoreGardens(raw,features,atGameMinute=null){
  const allowed=(features||[]).filter(f=>isGardenItem(f.itemId)).slice(0,GARDEN_LIMIT);
  const result={};
  for(const item of allowed)result[item.instanceId]=restoreGardenRecord(
    raw?.[item.instanceId],atGameMinute);
  return result;
}
export function advanceGardenRecord(record,toGameMinute){
  const time=validMinute(toGameMinute)?toGameMinute:record.evaluatedAt;
  if(time<=record.evaluatedAt)return {...record};
  const gain=Math.max(0,Math.min(time,record.hydratedUntil)-record.evaluatedAt);
  return {...record,evaluatedAt:time,progressWetMinutes:round(Math.min(
    GARDEN_MATURE_MINUTES,record.progressWetMinutes+gain))};
}
export function advanceGardens(outdoors,toGameMinute){
  if(!outdoors||!outdoors.gardens||!validMinute(toGameMinute))return false;
  let changed=false;
  for(const [id,record] of Object.entries(outdoors.gardens)){
    const next=advanceGardenRecord(record,toGameMinute);
    if(next.evaluatedAt!==record.evaluatedAt||
      next.progressWetMinutes!==record.progressWetMinutes){
      outdoors.gardens[id]=next;changed=true;
    }
  }
  return changed;
}
export function gardenView(outdoors,instanceId,atGameMinute){
  const record=outdoors?.gardens?.[instanceId];
  if(!record)return null;
  const state=advanceGardenRecord(record,atGameMinute);
  const stage=Math.min(3,Math.floor(state.progressWetMinutes/1440));
  return {...state,stage,label:GARDEN_LABELS[stage],
    mature:state.progressWetMinutes>=GARDEN_MATURE_MINUTES,
    waterRemaining:Math.max(0,state.hydratedUntil-atGameMinute)};
}
export function gardenApproach(world,instanceId,from){
  const feature=gardenFeature(world,instanceId),rect=feature&&outdoorFeatureRect(feature);
  if(!rect||!from)return null;
  const margin=.38;
  const candidates=[
    {x:rect.minX-margin,z:feature.z},{x:rect.maxX+margin,z:feature.z},
    {x:feature.x,z:rect.minZ-margin},{x:feature.x,z:rect.maxZ+margin}
  ];
  let chosen=null,score=Infinity;
  for(const point of candidates){
    const goal={x:round(point.x),z:round(point.z)};
    if(!isWalkable(goal.x,goal.z,world))continue;
    const path=findPath(from,goal,world);
    if(!path)continue;
    let length=0,prev=from;
    for(const step of path){length+=Math.hypot(step.x-prev.x,step.z-prev.z);prev=step;}
    if(length<score){chosen={goal,path};score=length;}
  }
  return chosen;
}
export function restoreGardenRewards(raw){
  return {schema:1,
    alexLastAdmireAt:validMinute(raw?.alexLastAdmireAt)?raw.alexLastAdmireAt:null,
    miraLastAdmireAt:validMinute(raw?.miraLastAdmireAt)?raw.miraLastAdmireAt:null};
}
export function gardenBusy(root,instanceId){
  return [root,root?.otherSim].some(a=>a?.action?.id==='garden'&&
    a.action.targetInstanceId===instanceId)||
    Object.values(root?.actionQueues?.byResident||{}).some(queue=>
      Array.isArray(queue)&&queue.some(c=>c.type==='garden'&&c.instanceId===instanceId));
}
/** Validity is independent of current ownership: a FIFO request can go stale. */
export function gardenRequestStillValid(root,residentId,instanceId,actionId){
  if(!GARDEN_ACTIONS.includes(actionId)||!gardenFeature(root?.world,instanceId))return false;
  const view=gardenView(root.world.outdoors,instanceId,root.minutes);
  if(!view)return false;
  const feature=gardenFeature(root.world,instanceId),herbs=root?.kitchen?.pantry?.herbs;
  if(actionId==='harvest')return feature?.itemId?.startsWith('garden.herb.')&&
    view.mature&&view.harvestedAt===null&&Number.isSafeInteger(herbs)&&herbs>=0&&
    herbs+KITCHEN_HARVEST_UNITS<=KITCHEN_HERB_LIMIT;
  if(actionId==='replant')return feature?.itemId?.startsWith('garden.herb.')&&
    view.mature&&view.harvestedAt!==null&&Number.isSafeInteger(root?.shop?.credits)&&
    root.shop.credits>=GARDEN_REPLANT_PRICE;
  if(actionId==='inspect')return !view.mature&&view.stage>=1;
  if(actionId==='water')return !view.mature&&
    (view.lastWateredAt===null||root.minutes-view.lastWateredAt>=GARDEN_CARE_COOLDOWN);
  const rewards=restoreGardenRewards(root.gardenRewards);
  const last=residentId==='mira'?rewards.miraLastAdmireAt:rewards.alexLastAdmireAt;
  return view.mature&&(last===null||root.minutes-last>=GARDEN_CARE_COOLDOWN);
}
export function gardenActionAllowed(root,residentId,instanceId,actionId,{ignoreReservation=false}={}){
  if(!gardenRequestStillValid(root,residentId,instanceId,actionId))return false;
  if(!ignoreReservation&&gardenBusy(root,instanceId))return false;
  const other=residentId==='alex'?root.otherSim:root;
  return !(other?.action?.id==='garden'&&other.action.targetInstanceId===instanceId);
}
export function settleGardenAction(root,residentId,instanceId,actionId){
  if(!gardenActionAllowed(root,residentId,instanceId,actionId,{ignoreReservation:true}))return false;
  const actor=residentId==='mira'?root.otherSim:root;
  if(!actor)return false;
  if(actionId==='harvest'){
    root.kitchen.pantry.herbs+=KITCHEN_HARVEST_UNITS;
    root.world.outdoors.gardens[instanceId]={
      ...advanceGardenRecord(root.world.outdoors.gardens[instanceId],root.minutes),
      harvestedAt:root.minutes};
    actor.event='Собраны садовые травы · +'+KITCHEN_HARVEST_UNITS;
    return true;
  }
  if(actionId==='replant'){
    const finance=recordFinanceChange(root,
      {...root.shop,credits:root.shop.credits-GARDEN_REPLANT_PRICE},{
        kind:'purchase',actorId:residentId,sourceId:'garden-replant-'+instanceId,
        atGameMinute:Math.floor(root.minutes),
        receiptId:'garden-replant-'+instanceId+'-'+Math.floor(root.minutes)});
    if(!finance.ok)return false;
    root.world.outdoors.gardens[instanceId]=newGardenRecord(root.minutes);
    root.shop=finance.shop;root.financialHistory=finance.financialHistory;
    actor.event='Травы посажены заново · −'+GARDEN_REPLANT_PRICE+' кр.';
    return true;
  }
  if(actionId==='water'){
    const previous=root.world.outdoors.gardens[instanceId];
    const progressed=advanceGardenRecord(previous,root.minutes);
    root.world.outdoors.gardens[instanceId]={...progressed,
      lastWateredAt:root.minutes,hydratedUntil:root.minutes+GARDEN_HYDRATION_MINUTES};
    actor.needs.energy=Math.max(0,actor.needs.energy-2);
    actor.event='Полил(а) грядку — растение растёт';
  }else if(actionId==='inspect'){
    actor.event='Осмотрел(а), как подросло растение';
  }else{
    const rewards=restoreGardenRewards(root.gardenRewards);
    rewards[residentId==='mira'?'miraLastAdmireAt':'alexLastAdmireAt']=root.minutes;
    root.gardenRewards=rewards;
    actor.needs.fun=Math.min(100,actor.needs.fun+5);
    actor.event='Полюбовался(ась) своим садом';
  }
  return true;
}
