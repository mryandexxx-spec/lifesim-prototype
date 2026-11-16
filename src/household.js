/** Two-person household without importing PlayCanvas, DOM or browser APIs.
 * Legacy root fields remain Alex's exact v1 state; otherSim is an optional extension.
 */
import { newGame, loadGame, tick, chooseAction, autonomousChoice, setAutonomyEnabled,ACTIONS } from './simulation.js';
import { refreshMind } from './psychology.js';
import {DEMO_PROFILES} from './trait-catalog.js';
import {starterInventory,restoreInventory,sharedDuration} from './gifts-leisure.js';
import {voluntaryMoodEfficiency} from './mood-action-policy.js';
import {NEED_DECAY_PER_MINUTE} from './need-balance.js';
import {newActionQueues,restoreActionQueues,pendingActions} from './action-queue.js';
import {newSocialGraph,restoreSocialGraph,markAcquainted,observePairViews,setLifeStage} from './social-graph.js';
import {BED_SLOTS,BED_SLOT_IDS,availableBedSlot,validBedSlot} from './bed-layout.js';
import {findPath,nearestWalkable} from './navigation.js';
import {newFurnitureWorld,restoreFurnitureWorld,resolveActionFurniture} from './furniture-catalog.js';
import {newFurnitureShop,restoreFurnitureShop} from './furniture-shop.js';
import {furniturePoint} from './furniture-transform.js';
import {chooseTvSofa,tvSofaView} from './tv-seating.js';
import {liveSharedTv} from './tv-together.js';
import {captureObjectUse,settleObjectUseStep} from './object-use-runtime.js';
import { newRelationship,loadRelationship,loadSocialAction,cancelSocial,
  tickSocial } from './relationships.js';

export const HOUSEHOLD_IDS = Object.freeze(['alex', 'mira']);
export const RESIDENT_NAMES = Object.freeze({ alex: 'Алекс', mira: 'Мира' });
export const RESIDENT_START = Object.freeze({ x: -0.80, z: 2.95 });

function newMira(minutes=480) {
  const mira=newGame(DEMO_PROFILES.second);
  mira.position={ ...RESIDENT_START };
  mira.needs={ hunger: 72, energy: 86, hygiene: 75, fun: 72, social:76, bladder:78 };
  mira.minutes=minutes;
  mira.autonomy.nextAt=minutes;
  mira.event='Свободное время';
  refreshMind(mira);
  return mira;
}

export function newHousehold() {
  const state=newGame(DEMO_PROFILES.first);
  state.otherSim=newMira(state.minutes);
  state.selectedSim='alex';
  state.relationship=newRelationship(state.minutes);
  state.socialGraph=newSocialGraph(HOUSEHOLD_IDS);
  // Both demonstrator residents are explicitly written as adults, no guess
  // from gender, name or 3D model. Unknown NPCs remain age-unverified.
  for(const id of HOUSEHOLD_IDS)setLifeStage(state.socialGraph,id,'adult');
  markAcquainted(state.socialGraph,HOUSEHOLD_IDS[0],HOUSEHOLD_IDS[1],state.minutes);
  observePairViews(state.socialGraph,HOUSEHOLD_IDS[0],HOUSEHOLD_IDS[1],state.relationship.views);
  state.inventory=starterInventory();
  state.actionQueues=newActionQueues(HOUSEHOLD_IDS);
  // F0 optional v1 extension; each piece has its own immutable instanceId.
  state.world={furniture:newFurnitureWorld()};
  // F2.1 optional root-v1 extension. Old households get test credits only once.
  state.shop=newFurnitureShop();
  refreshMind(state,state.world);refreshMind(state.otherSim,state.world);
  state.socialAction=null;
  return state;
}

/** Do not change save key or version: parse and sanitize each resident using v1 loader. */
export function loadHousehold(raw) {
  if (!raw || raw.version!==1) return newHousehold();
  const root=loadGame(raw,DEMO_PROFILES.first);
  root.world={furniture:restoreFurnitureWorld(raw.world?.furniture)};
  root.shop=restoreFurnitureShop(raw.shop);
  const validMira=raw.otherSim && typeof raw.otherSim==='object' && !Array.isArray(raw.otherSim) &&
    raw.otherSim.version===1 && raw.otherSim.needs && raw.otherSim.position;
  // Ignore saved clock/speed/pause for Mira; the household has one shared clock.
  const mira=validMira
    ? loadGame({ ...raw.otherSim, minutes:root.minutes, paused:root.paused, speed:root.speed,
        autonomy:{ ...raw.otherSim.autonomy, enabled:root.autonomy.enabled } },
        DEMO_PROFILES.second)
    : newMira(root.minutes);
  mira.minutes=root.minutes;
  mira.paused=root.paused;
  mira.speed=root.speed;
  mira.autonomy.enabled=root.autonomy.enabled;
  if (!root.autonomy.enabled && mira.action?.automatic) mira.action=null;
  root.otherSim=mira;
  root.selectedSim=raw.selectedSim==='mira' ? 'mira' : 'alex';
  root.inventory=restoreInventory(raw.inventory);
  root.actionQueues=restoreActionQueues(raw.actionQueues,HOUSEHOLD_IDS);
  // Retain the exact object target in persistent commands. Old un-targeted
  // v1 commands migrate to deterministic original instance IDs once.
  for(const id of HOUSEHOLD_IDS){
    const sim=id==='alex'?root:mira;
    if(sim.action){
      const object=resolveActionFurniture(root.world,sim.action.id,sim.action.targetInstanceId);
      if(object)sim.action.targetInstanceId=object.instanceId;
      else sim.action=null; // no phantom action or silent rerouting to another item
    }
    for(const task of root.actionQueues.byResident[id]){
      if(task.type!=='object'||task.targetInstanceId)continue;
      const object=resolveActionFurniture(root.world,task.actionId);
      if(object)task.targetInstanceId=object.instanceId;
    }
  }
  root.relationship=loadRelationship(raw.relationship,root.minutes,{
    alex:root.mind.memories,mira:mira.mind.memories
  });
  // The fixed two-resident household is only a legacy adapter for the N-person graph.
  root.socialGraph=restoreSocialGraph(raw.socialGraph,HOUSEHOLD_IDS,{
    ids:HOUSEHOLD_IDS,at:root.minutes,views:root.relationship.views
  });
  // Legacy 1.0j and earlier saves had no life-stage registry at all.
  // Only the two known demo adults receive a migration default; an explicit
  // new registry missing/invalid age does not gain unearned adult eligibility.
  if(!raw.socialGraph||!Object.hasOwn(raw.socialGraph,'lifeStages'))
    for(const id of HOUSEHOLD_IDS)setLifeStage(root.socialGraph,id,'adult');
  root.socialAction=loadSocialAction(raw.socialAction,root);
  // Restore F3b sofa reservations from optional v1 action data. A removed,
  // relocated or doubly booked seat cannot silently seize another sofa.
  const occupiedSofas=new Set();
  for(const id of HOUSEHOLD_IDS){
    const action=getActor(root,id)?.action;
    if(action?.id==='sofa')occupiedSofas.add(action.targetInstanceId||'home-sofa-1');
  }
  for(const id of HOUSEHOLD_IDS){
    const action=getActor(root,id)?.action;
    if(action?.id!=='tv'||!action.watchSeatInstanceId)continue;
    const seat=action.watchSeatInstanceId;
    if(occupiedSofas.has(seat)||!tvSofaView(root.world,seat,action.targetInstanceId))
      delete action.watchSeatInstanceId; // continue the valid TV action standing
    else occupiedSofas.add(seat);
  }
  // F0 committed furniture is now a first-class ambient mood input for both
  // residents; no ambient field or fabricated memory is persisted.
  refreshMind(root,root.world);refreshMind(mira,root.world);
  // Legacy v1 had no bedSlot. Keep valid reservations first, then assign
  // any remaining sleepers a distinct free half by actual route distance.
  // No preference or ownership of a bed side by Alex or Mira.
  // Bed halves are reserved PER INSTANCE. Two different beds may both use
  // their left halves; duplicate left claims on the SAME bed are repaired.
  const usedByBed=new Map();
  for(const id of HOUSEHOLD_IDS){
    const resident=getActor(root,id),action=resident.action;
    if(action?.id!=='bed'||!validBedSlot(action.bedSlot))continue;
    const bed=resolveActionFurniture(root.world,'bed',action.targetInstanceId);
    if(!bed){resident.action=null;continue;}
    const used=usedByBed.get(bed.instanceId)||[];
    if(!used.includes(action.bedSlot)){
      used.push(action.bedSlot);usedByBed.set(bed.instanceId,used);
    }else delete action.bedSlot;
  }
  for(const id of HOUSEHOLD_IDS){
    const resident=getActor(root,id),action=resident.action;
    if(action?.id!=='bed'||validBedSlot(action.bedSlot))continue;
    const bed=resolveActionFurniture(root.world,'bed',action.targetInstanceId);
    if(!bed){resident.action=null;continue;}
    const used=usedByBed.get(bed.instanceId)||[];
    const slot=chooseFreeBedSlot(resident.position,used,root.world,bed.instanceId);
    if(slot){
      action.bedSlot=slot;
      used.push(slot);usedByBed.set(bed.instanceId,used);
    }else resident.action=null;
  }
  return root;
}

export function getActor(root,id='alex') {
  return id==='mira' ? root.otherSim : root;
}
export function getActorName(id='alex') {
  return RESIDENT_NAMES[id] || RESIDENT_NAMES.alex;
}
export function selectResident(root,id) {
  if (!HOUSEHOLD_IDS.includes(id)) return false;
  root.selectedSim=id;
  return true;
}

/** Choose the nearest *reachable* unoccupied bed half. This is not tied to
 * identity; either resident can sleep on either side on different nights.
 */
export function chooseFreeBedSlot(position,occupied=[],world=null,targetInstanceId=null) {
  // An explicit target must not silently redirect to a different saved bed.
  if(targetInstanceId!==null&&!resolveActionFurniture(world,'bed',targetInstanceId))
    return null;
  const origin=nearestWalkable(position,world);
  let best=null,bestCost=Infinity;
  for(const id of BED_SLOT_IDS){
    if(occupied.includes(id))continue;
    const to=furniturePoint(world,'bed',BED_SLOTS[id].approach,targetInstanceId);
    if(!to)continue;
    const path=findPath(origin,to,world);
    if(!path)continue;
    let prev=origin,cost=0;
    for(const point of path){
      cost+=Math.hypot(point.x-prev.x,point.z-prev.z);
      prev=point;
    }
    if(cost<bestCost){best=id;bestCost=cost;}
  }
  return best;
}
/** Two independently reserved physical halves, no owner-specific defaults.
 * Occupancy is kept in the existing optional v1 action.bedSlot.
 */
/** A slot belongs to a specific saved bed ID, not to the global prefab.
 * Keep the optional target argument last for every existing v1 callsite.
 */
export function bedSlotFor(root,residentId='alex',targetInstanceId=null) {
  if(!HOUSEHOLD_IDS.includes(residentId))return null;
  const bed=resolveActionFurniture(root.world,'bed',targetInstanceId);
  if(!bed)return null;
  const self=getActor(root,residentId);
  if(!self)return null;
  const ownBed=self.action?.id==='bed'
    ?resolveActionFurniture(root.world,'bed',self.action.targetInstanceId):null;
  if(ownBed?.instanceId===bed.instanceId&&validBedSlot(self.action.bedSlot))
    return self.action.bedSlot;
  const other=getActor(root,residentId==='alex'?'mira':'alex');
  const otherBed=other?.action?.id==='bed'
    ?resolveActionFurniture(root.world,'bed',other.action.targetInstanceId):null;
  const taken=otherBed?.instanceId===bed.instanceId&&
      validBedSlot(other.action.bedSlot)?[other.action.bedSlot]:[];
  return chooseFreeBedSlot(self.position,taken,root.world,bed.instanceId);
}
export function bedDestinationFor(root,residentId='alex',targetInstanceId=null){
  const self=getActor(root,residentId);
  const requested=targetInstanceId??(self?.action?.id==='bed'
    ?self.action.targetInstanceId??null:null);
  const bed=resolveActionFurniture(root.world,'bed',requested);
  if(!bed)return null;
  const slot=bedSlotFor(root,residentId,bed.instanceId);
  return slot?furniturePoint(root.world,'bed',BED_SLOTS[slot].approach,bed.instanceId):null;
}
/** Beds capacity=2; each of the other furniture actions remains exclusive. */
export function furnitureAvailable(root,itemId,residentId='alex',targetInstanceId=null) {
  const item=resolveActionFurniture(root.world,itemId,targetInstanceId);
  if(!item)return false;
  if(itemId==='bed')return bedSlotFor(root,residentId,item.instanceId)!==null;
  const other=getActor(root,residentId==='alex'?'mira':'alex');
  if(itemId==='sofa'&&other?.action?.id==='tv'&&
     other.action.watchSeatInstanceId===item.instanceId)return false;
  return other?.action?.targetInstanceId!==item.instanceId &&
    !(other?.action?.id===itemId&&!other.action.targetInstanceId);
}
export function chooseResidentAction(root,itemId,automatic=false,residentId='alex',targetInstanceId=null) {
  const item=resolveActionFurniture(root.world,itemId,targetInstanceId);
  if(!item||!HOUSEHOLD_IDS.includes(residentId)||
    !furnitureAvailable(root,itemId,residentId,item.instanceId))return false;
  const resident=getActor(root,residentId);
  // Explicit actions never supersede an ongoing action or interrupt a social.
  // Future manual commands are stored by action-queue.js and dispatched later.
  if (!resident || resident.action || root.socialAction ||
    (automatic && (root.paused||pendingActions(root.actionQueues,residentId).length)))return false;
  const slot=itemId==='bed'?bedSlotFor(root,residentId,item.instanceId):null;
  const chosen=chooseAction(resident,itemId,automatic);
  if(chosen)resident.action.targetInstanceId=item.instanceId;
  if(chosen&&itemId==='bed')resident.action.bedSlot=slot;
  // Book the same physical sofa before walking, so an ordinary rest or a
  // second television viewer cannot sit in the occupied spot.
  if(chosen&&itemId==='tv'){
    const seat=chooseTvSofa(root,residentId,item.instanceId);
    if(seat)resident.action.watchSeatInstanceId=seat.sofaId;
  }
  return chosen;
}

/** One global autonomy preference, mirrored into both independent actor controllers. */
/** A successfully queued player task outranks the addressed resident's own
 * autonomous task. A spontaneous social task reserves BOTH participants:
 * either can release it by receiving a player instruction. Never touch an
 * ongoing MANUAL action or another resident's independent object work.
 * Call only after enqueueAction succeeded.
 */
export function preemptAutomaticForManual(root,residentId){
  if(!HOUSEHOLD_IDS.includes(residentId)||!root?.actionQueues)return null;
  const resident=getActor(root,residentId);
  const removed={residentId,objectId:null,objectPhase:null,socialInitiator:null};
  if(resident?.action?.automatic===true){
    removed.objectId=resident.action.id;
    removed.objectPhase=resident.action.phase;
    resident.action=null;
    resident.event='Выполняет поручение игрока';
  }
  const social=root.socialAction;
  if(social?.automatic===true &&
    (social.initiator===residentId||social.partner===residentId)){
    removed.socialInitiator=social.initiator;
    cancelSocial(root);
    for(const id of [social.initiator,social.partner]){
      const actor=getActor(root,id);
      if(actor)actor.event=id===residentId
        ?'Выполняет поручение игрока':'Свободное время';
    }
  }
  if(removed.objectId||removed.socialInitiator)
    resident.autonomy.nextAt=Math.max(resident.autonomy.nextAt,root.minutes+7);
  return removed;
}

export function setHouseholdAutonomy(root,enabled) {
  setAutonomyEnabled(root,enabled);
  if (root.otherSim) setAutonomyEnabled(root.otherSim,enabled);
  if(!root.autonomy.enabled&&root.socialAction?.automatic)cancelSocial(root);
  return root.autonomy.enabled;
}

/** A single time step, applied to both actors without doubling the household clock. */
export function tickHousehold(root,minutes) {
  // A paused or invalid tick must be completely side-effect free, including Mira's fields.
  if (root.paused || !Number.isFinite(minutes) || minutes<=0) return;
  const other=root.otherSim;
  if (!other) return tick(root,minutes);
  other.minutes=root.minutes;
  other.paused=root.paused;
  other.speed=root.speed;
  other.autonomy.enabled=root.autonomy.enabled;
  const shared=liveSharedTv(root);
  const watchMinutes=shared?Math.min(minutes,Math.max(0,
    sharedDuration(root.socialAction.shared)-root.socialAction.elapsed)):0;
  const alexUse=captureObjectUse(root),miraUse=captureObjectUse(other);
  tick(root,minutes,root.world);
  tick(other,minutes,root.world);
  // Canonical receipts are built from the same real simulation step, not
  // from rendering, catalog selections, or self-reported action completions.
  settleObjectUseStep({world:root.world,actor:root,before:alexUse});
  settleObjectUseStep({world:root.world,actor:other,before:miraUse});
  if(watchMinutes>0){
    // Fun reflects REAL time in front of a running screen. Only the final
    // canonically accepted leisure receipt later grants the SOCIAL benefit.
    for(const id of HOUSEHOLD_IDS){
      const actor=getActor(root,id),seat=shared.places[id]?.seatId;
      const efficiency=voluntaryMoodEfficiency(actor,{type:'shared',mode:'leisure'});
      actor.needs.fun=Math.min(100,actor.needs.fun+
        ACTIONS.tv.benefitPerMinute*efficiency*watchMinutes);
      if(seat)actor.needs.energy=Math.min(100,actor.needs.energy+
        NEED_DECAY_PER_MINUTE.energy*watchMinutes);
      refreshMind(actor,root.world);
    }
  }
  // Both clocks remain identical (including when paused).
  other.minutes=root.minutes;
  tickSocial(root,minutes);
}

export function residentAutonomousChoice(root,id='alex') {
  if(root.socialAction||pendingActions(root.actionQueues,id).length)return null;
  const resident=getActor(root,id);
  if (!root.autonomy.enabled || !resident) return null;
  resident.autonomy.enabled=root.autonomy.enabled;
  resident.paused=root.paused;
  resident.minutes=root.minutes;
  const proposal=autonomousChoice(resident);
  return proposal && furnitureAvailable(root,proposal,id) ? proposal : null;
}
