/** LOT-C2b — headless garden wishes and once-only emotional milestones.
 * Every event is emitted only after a real physical garden completion.
 */
import {validOutdoorId} from './outdoor-catalog.js';
import {gardenFeature,gardenView,gardenApproach,gardenRequestStillValid,gardenBusy} from './gardening.js';
import {selectWish,refreshMind} from './psychology.js';
import {feelMemory} from './emotion-engine.js';

export const GARDEN_WISHES=Object.freeze({
  'garden.care':'water','garden.observe':'inspect','garden.bloom':'admire'
});
const PEOPLE=['alex','mira'],TIME_MAX=10000000,PLOT_LIMIT=32,HISTORY_LIMIT=16;
const validAt=(v,now)=>Number.isFinite(v)&&v>=0&&v<=now&&v<=TIME_MAX;
const resident=(root,id)=>id==='alex'?root:id==='mira'?root?.otherSim:null;
const blank=()=>({plots:[],wishHistory:[],lastMilestoneAt:null,lastOfferSlot:-1});
const validPlot=(x,now)=>x&&validOutdoorId(x.instanceId)&&validAt(x.plantedAt,now)&&
  Number.isInteger(x.lastObservedStage)&&x.lastObservedStage>=-1&&x.lastObservedStage<=3&&
  typeof x.firstCare==='boolean'&&typeof x.firstBloomSeen==='boolean';

export function restoreGardenMilestones(raw,now=480){
  const time=validAt(now,TIME_MAX)?now:480,result={schema:1,byResident:{}};
  for(const id of PEOPLE){
    const saved=raw?.schema===1?raw.byResident?.[id]:null;
    const data=blank(),seen=new Set();
    if(saved&&typeof saved==='object'&&!Array.isArray(saved)){
      if(Array.isArray(saved.plots))for(const x of saved.plots.slice(-PLOT_LIMIT)){
        if(!validPlot(x,time))continue;
        const key=x.instanceId+'|'+x.plantedAt;
        if(seen.has(key))continue;
        seen.add(key);
        data.plots.push({instanceId:x.instanceId,plantedAt:x.plantedAt,
          firstCare:x.firstCare,firstBloomSeen:x.firstBloomSeen,
          lastObservedStage:x.lastObservedStage});
      }
      if(Array.isArray(saved.wishHistory))
        for(const w of saved.wishHistory.slice(-HISTORY_LIMIT)){
          if(!w||!Object.hasOwn(GARDEN_WISHES,w.id)||
            !validOutdoorId(w.instanceId)||!validAt(w.at,time))continue;
          data.wishHistory.push({id:w.id,instanceId:w.instanceId,at:w.at});
        }
      data.lastMilestoneAt=validAt(saved.lastMilestoneAt,time)?saved.lastMilestoneAt:null;
      data.lastOfferSlot=Number.isSafeInteger(saved.lastOfferSlot)&&
        saved.lastOfferSlot>=-1&&saved.lastOfferSlot<=Math.floor(time/480)
        ?saved.lastOfferSlot:-1;
    }
    result.byResident[id]=data;
  }
  return result;
}
function ledger(root,id){
  if(!root?.gardenMilestones||root.gardenMilestones.schema!==1||
    !root.gardenMilestones.byResident?.alex||!root.gardenMilestones.byResident?.mira)
    root.gardenMilestones=restoreGardenMilestones(root?.gardenMilestones,root?.minutes);
  return root.gardenMilestones.byResident[id];
}
function plot(root,id,instanceId,view){
  const data=ledger(root,id);
  let found=data.plots.find(x=>x.instanceId===instanceId&&x.plantedAt===view.plantedAt);
  if(!found){
    found={instanceId,plantedAt:view.plantedAt,firstCare:false,
      firstBloomSeen:false,lastObservedStage:-1};
    data.plots.push(found);
    if(data.plots.length>PLOT_LIMIT)data.plots.splice(0,data.plots.length-PLOT_LIMIT);
  }
  return found;
}
const targeted=w=>w&&Object.hasOwn(GARDEN_WISHES,w.id)&&
  validOutdoorId(w.targetInstanceId)&&Number.isFinite(w.plantedAt)&&w.plantedAt>=0;

export function gardenWishEligible(root,id,w){
  const actor=resident(root,id);
  if(!actor||!PEOPLE.includes(id)||!targeted(w)||!root?.world?.outdoors||
    !gardenFeature(root.world,w.targetInstanceId)||
    !validAt(w.plantedAt,root.minutes))return false;
  const view=gardenView(root.world.outdoors,w.targetInstanceId,root.minutes);
  if(!view||view.plantedAt!==w.plantedAt)return false;
  const prior=ledger(root,id).plots.find(x=>
    x.instanceId===w.targetInstanceId&&x.plantedAt===view.plantedAt);
  if(w.id==='garden.care')return !view.mature&&view.waterRemaining<=360&&
    gardenRequestStillValid(root,id,w.targetInstanceId,'water');
  if(w.id==='garden.observe')return !view.mature&&view.stage>=1&&
    (prior?.lastObservedStage??-1)<view.stage;
  return view.mature&&!prior?.firstBloomSeen&&
    gardenRequestStillValid(root,id,w.targetInstanceId,'admire');
}
function ordinary(actor,now){
  actor.mind.wish={id:selectWish(actor),since:now,until:now+480};
}
/** Replaces stale targets without credit; evaluates new wishes only once per slot. */
export function refreshGardenWishes(root){
  if(!root?.world?.outdoors||!Number.isFinite(root.minutes))return;
  const now=root.minutes;
  for(const id of PEOPLE){
    const actor=resident(root,id),data=ledger(root,id),wish=actor?.mind?.wish;
    if(!actor||!wish)continue;
    if(Object.hasOwn(GARDEN_WISHES,wish.id)){
      if(wish.until<=now||!gardenWishEligible(root,id,wish)){
        ordinary(actor,now);refreshMind(actor,root.world);
      }
      continue;
    }
    const slot=Math.floor(now/480);
    if(wish.since!==now||data.lastOfferSlot>=slot)continue;
    data.lastOfferSlot=slot;
    if(now%1440<420||now%1440>=1200||
      Math.min(actor.needs.energy,actor.needs.hunger,actor.needs.bladder)<65||
      Math.min(actor.needs.hygiene,actor.needs.social)<45||
      data.wishHistory.some(h=>now-h.at<1440))continue;
    const candidates=[];
    for(const feature of root.world.outdoors.features||[]){
      const view=gardenView(root.world.outdoors,feature.instanceId,now);
      if(!view||gardenBusy(root,feature.instanceId))continue;
      for(const wishId of ['garden.bloom','garden.observe','garden.care']){
        const choice={id:wishId,targetInstanceId:feature.instanceId,
          plantedAt:view.plantedAt,since:now,until:now+480};
        if(!gardenWishEligible(root,id,choice))continue;
        if(data.wishHistory.some(h=>(h.id===wishId&&now-h.at<4320)||
          (h.instanceId===feature.instanceId&&now-h.at<2880)))continue;
        candidates.push(choice);
      }
    }
    const order=['garden.bloom','garden.observe','garden.care'];
    candidates.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id)||
      a.targetInstanceId.localeCompare(b.targetInstanceId));
    const chosen=candidates.find(x=>
      gardenApproach(root.world,x.targetInstanceId,actor.position));
    if(!chosen)continue;
    actor.mind.wish=chosen;
    data.wishHistory.push({id:chosen.id,instanceId:chosen.targetInstanceId,at:now});
    data.wishHistory=data.wishHistory.slice(-HISTORY_LIMIT);
  }
}
/** Existing Wish button can schedule a typed FIFO command, never a fake item. */
export function gardenWishCommand(root,id){
  const wish=resident(root,id)?.mind?.wish;
  return gardenWishEligible(root,id,wish)
    ?{type:'garden',instanceId:wish.targetInstanceId,actionId:GARDEN_WISHES[wish.id]}
    :null;
}
/** After, and ONLY after, successful settleGardenAction. */
export function completeGardenExperience(root,id,instanceId,actionId){
  const actor=resident(root,id),view=gardenView(root?.world?.outdoors,instanceId,root?.minutes);
  if(!actor||!view||!['water','inspect','admire'].includes(actionId))return false;
  const data=ledger(root,id),item=plot(root,id,instanceId,view),now=root.minutes;
  const wish=actor.mind?.wish;
  const fulfilled=targeted(wish)&&GARDEN_WISHES[wish.id]===actionId&&
    wish.targetInstanceId===instanceId&&wish.plantedAt===view.plantedAt&&
    wish.since<=now&&wish.until>=now;
  if(actionId==='inspect')item.lastObservedStage=Math.max(item.lastObservedStage,view.stage);
  if(actionId==='admire')item.lastObservedStage=3;
  const milestone=actionId==='water'?'firstCare':
    actionId==='admire'?'firstBloomSeen':null;
  if(milestone&&!item[milestone]){
    item[milestone]=true;
    if(data.lastMilestoneAt===null||now-data.lastMilestoneAt>=1440){
      data.lastMilestoneAt=now;
      const memory={id:actionId==='water'?'garden.firstCare':'garden.firstBloomSeen',
        at:now,fulfilled:false};
      actor.mind.memories=[...(actor.mind.memories||[]),memory].slice(-12);
      feelMemory(actor,memory);
    }
  }
  if(fulfilled)ordinary(actor,now);
  refreshMind(actor,root.world);
  return true;
}
