/** Two-person household without importing PlayCanvas, DOM or browser APIs.
 * Legacy root fields remain Alex's exact v1 state; otherSim is an optional extension.
 */
import { newGame, loadGame, tick, chooseAction, autonomousChoice, setAutonomyEnabled,ACTIONS } from './simulation.js';
import {COOKING_SKILL_ID,kitchenRecipe,newKitchen,restoreKitchen,replenishKitchen,
  canCookRecipe,chooseKitchenPlan,cookingSourceValid,finishKitchenRecipe,
  takeKitchenServing,recordDirtyDish,washKitchenDishes} from './kitchen.js';
import {currentSkillLevel} from './skills-engine.js';
import { refreshMind } from './psychology.js';
import {DEMO_PROFILES} from './trait-catalog.js';
import {starterInventory,restoreInventory,sharedDuration,inventoryFor} from './gifts-leisure.js';
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
import {chooseReadingSeat,readingSeatId,readingStage,readingRouteId,
  beginReadingJourney,arriveReadingJourney,advanceReadingJourney,
  validReadingJourneyAction} from './reading-journey.js';
import {liveSharedTv} from './tv-together.js';
import {livePairedHobby} from './paired-hobby.js';
import {captureObjectUse,settleObjectUseStep} from './object-use-runtime.js';
import { newRelationship,loadRelationship,loadSocialAction,cancelSocial,
  tickSocial } from './relationships.js';
import {HOBBY_ACTIVITIES,HOBBY_CONTENT,HOBBY_SKILLS,READING_ACTIVITY_ID,READING_CONTENT_ID,
  MUSIC_ACTIVITY_ID,MUSIC_ACTIVITY_IDS,MUSIC_CONTENT_IDS,READING_SKILL_ID,
  canReadHobbyContent} from './hobby-reading.js';
import {getActivityDefinition,activityFitsItem} from './activity-registry.js';
import {createActivitySession,restoreActivitySession,arriveActivitySession,
  advanceActivitySession} from './activity-session.js';
import {newSkillProgress,restoreSkillProgress,creditActivityPractice} from './skills-engine.js';
import {getObjectItem} from './object-definition-registry.js';
import {newObjectOnceLedger,restoreObjectOnceLedger} from './object-once-ledger.js';
import {legacyObjectRegistry} from './object-legacy-adapter.js';
import {furnitureActionApproach} from './furniture-catalog.js';
import {chooseMusicListeningSpot,validMusicListeningSpot} from './music-listening.js';
import {switchLampAtArrival} from './furniture-interactions.js';
import {PAINT_ACTIVITY_ID,PAINT_CONTENT_IDS,PAINT_WORKS_LIMIT,restoreCreatedWorks,finishPainting} from './painting.js';
import {chooseDiningSeat,diningSeatApproach} from './dining.js';

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
  mira.skills=newSkillProgress();
  mira.createdWorks=[];
  mira.objectOnceLedger=newObjectOnceLedger();
  refreshMind(mira);
  return mira;
}

export function newHousehold() {
  const state=newGame(DEMO_PROFILES.first);
  state.otherSim=newMira(state.minutes);
  state.skills=newSkillProgress();
  state.createdWorks=[];
  state.kitchen=newKitchen();
  state.objectOnceLedger=newObjectOnceLedger();
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
  root.kitchen=restoreKitchen(raw.kitchen);
  root.shop=restoreFurnitureShop(raw.shop);
  root.objectOnceLedger=restoreObjectOnceLedger(raw.objectOnceLedger);
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
  mira.objectOnceLedger=restoreObjectOnceLedger(raw.otherSim?.objectOnceLedger);
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
  // H1 optional per-resident skill progress in the existing v1 root;
  // malformed or absent fields never reset old household/furniture.
  for(const id of HOUSEHOLD_IDS){
    const actor=id==='alex'?root:mira;
    const saved=id==='alex'?raw:raw.otherSim;
    actor.skills=restoreSkillProgress(saved?.skills,HOBBY_SKILLS);
    actor.createdWorks=restoreCreatedWorks(saved?.createdWorks,id);
    actor.activitySession=null;
    if(actor.action?.id==='paint'){
      const session=restoreActivitySession(HOBBY_ACTIVITIES,saved?.activitySession,HOBBY_CONTENT);
      const target=furnitureActionApproach(root.world,'paint',actor.action.targetInstanceId);
      if(!session||session.actorId!==id||session.activityId!==PAINT_ACTIVITY_ID||
        session.targetInstanceId!==actor.action.targetInstanceId||
        session.contentId!==actor.action.contentId||
        !validPaintingSource(root,actor)||
        Math.abs(session.elapsed-actor.action.elapsed)>.00001||
        !((session.phase==='walking'&&actor.action.phase==='walking')||
          (session.phase==='using'&&actor.action.phase==='using'))||
        (actor.action.phase==='using'&&(!target||
          Math.hypot(actor.position.x-target.x,actor.position.z-target.z)>.35)))
        actor.action=null;
      else actor.activitySession=session;
      continue;
    }
    if(actor.action?.id==='music'){
      const listening=restoreActivitySession(HOBBY_ACTIVITIES,saved?.activitySession,HOBBY_CONTENT);
      // Older 1.2u saves did not persist a listening-side anchor. Upgrade
      // only this optional action field; never erase the apartment or queue.
      const storedSpot=actor.action.musicSpot;
      const point=validMusicListeningSpot(root.world,actor.action.targetInstanceId,storedSpot)
        ?storedSpot
        :chooseMusicListeningSpot(root.world,actor.position,actor.action.targetInstanceId)?.point;
      if(point)actor.action.musicSpot={x:point.x,z:point.z};
      if(!point||!listening||listening.actorId!==id||!MUSIC_ACTIVITY_IDS.includes(listening.activityId)||
        listening.activityId!==actor.action.activityId||
        listening.targetInstanceId!==actor.action.targetInstanceId||
        listening.contentId!==actor.action.contentId||
        !validMusicSource(root,actor)||
        Math.abs(listening.elapsed-actor.action.elapsed)>.00001||
        !((listening.phase==='walking'&&actor.action.phase==='walking')||
          (listening.phase==='using'&&actor.action.phase==='using'))||
        (actor.action.phase==='using'&&(!point||
          Math.hypot(actor.position.x-point.x,actor.position.z-point.z)>.35)))
        actor.action=null;
      else actor.activitySession=listening;
      continue;
    }
    if(actor.action?.id!=='hobby')continue;
    const restored=restoreActivitySession(HOBBY_ACTIVITIES,saved?.activitySession,HOBBY_CONTENT);
    if(!restored||restored.actorId!==id||
       restored.activityId!==actor.action.activityId||
       restored.targetInstanceId!==actor.action.targetInstanceId||
       restored.contentId!==actor.action.contentId||
       !((restored.phase==='walking'&&actor.action.phase==='walking'&&
            (!readingStage(actor.action)||!['closing','standing','returnShelf','returning']
              .includes(readingStage(actor.action))))||
          (restored.phase==='using'&&actor.action.phase==='using')||
          (restored.phase==='ready'&&
            ['closing','standing','returnShelf','returning'].includes(readingStage(actor.action))&&
            actor.action.phase==='walking')||
          (restored.phase==='walking'&&actor.action.phase==='using'&&
            (()=>{const point=readingStage(actor.action)
              ?furnitureActionApproach(root.world,'sofa',actor.action.readingSeatInstanceId)
              :furnitureActionApproach(root.world,'hobby',actor.action.targetInstanceId);
              return Boolean(point&&
              Math.hypot(actor.position.x-point.x,actor.position.z-point.z)<=.35);})()))||
       (readingStage(actor.action)&&
         (!validReadingJourneyAction(actor.action)||
           !chooseReadingSeat(root,id,actor.action.targetInstanceId,
             actor.action.readingSeatInstanceId)))||
       Math.abs(restored.elapsed-actor.action.elapsed)>.00001||
       !validReadingSource(root,actor)){
      actor.action=null;continue;
    }
    actor.activitySession=restored;
  }
  // H5b: malicious or partially restored saved walls cannot overlap.
  // The second claimant keeps the original painting in their own inventory.
  const usedWallSlots=new Set();
  for(const id of HOUSEHOLD_IDS){
    const person=getActor(root,id);
    person.createdWorks=person.createdWorks.map(work=>{
      if(work.location!=='wall')return work;
      if(usedWallSlots.has(work.wallSlot)){
        const fixed={...work,location:'inventory'};
        delete fixed.wallSlot;
        return fixed;
      }
      usedWallSlots.add(work.wallSlot);
      return work;
    });
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
  // F4D: reject ambiguous/corrupt saved double-seat reservations before
  // either sim can resume the physical sitting action.
  const occupiedChairs=new Set();
  for(const id of HOUSEHOLD_IDS){
    const actor=getActor(root,id),action=actor?.action;
    if(action?.id!=='seat')continue;
    const seat=resolveActionFurniture(root.world,'seat',action.targetInstanceId);
    if(!seat||occupiedChairs.has(seat.instanceId)){
      actor.action=null;continue;
    }
    occupiedChairs.add(seat.instanceId);
  }
  // F4F: restore the exact chair/table reservation. Invalid, relocated or
  // duplicate seating never grants a meal or takes another saved chair.
  for(const id of HOUSEHOLD_IDS){
    const actor=getActor(root,id),a=actor?.action;
    if(a?.id!=='dining')continue;
    const seat=diningSeatApproach(root.world,a.targetInstanceId,a.diningSeatInstanceId);
    const fridge=furnitureActionApproach(root.world,'fridge');
    const spot=a.diningStage==='eating'?seat:fridge;
    if(!seat||!spot||occupiedChairs.has(a.diningSeatInstanceId)||
      (a.phase==='using'&&Math.hypot(actor.position.x-spot.x,actor.position.z-spot.z)>.36)){
      actor.action=null;continue;
    }
    occupiedChairs.add(a.diningSeatInstanceId);
  }
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
  if(itemId==='wash'&&!(root.kitchen?.dirtyDishes>0))return false;
  const other=getActor(root,residentId==='alex'?'mira':'alex');
  if(itemId==='cook'){
    // One cooking resident owns the shared fridge/prep pipeline at a time.
    if(['cook','fridge'].includes(other?.action?.id)||(
      other?.action?.id==='dining'&&
      ['toFridge','taking'].includes(other.action.diningStage)))return false;
    return Boolean(chooseKitchenPlan(root.world,getActor(root,residentId)?.position,item.instanceId));
  }
  if(itemId==='fridge'&&other?.action?.id==='cook'&&
    ['toFridge','taking'].includes(other.action.cookStage))return false;
  if(itemId==='sofa'&&other?.action?.id==='tv'&&
     other.action.watchSeatInstanceId===item.instanceId)return false;
  if(itemId==='sofa'&&readingSeatId(other?.action)===item.instanceId)return false;
  if(itemId==='seat'&&other?.action?.id==='dining'&&
    other.action.diningSeatInstanceId===item.instanceId)return false;
  if(itemId==='fridge'&&other?.action?.id==='dining'&&
    ['toFridge','taking'].includes(other.action.diningStage))return false;
  if(itemId==='dining'){
    // Two residents can dine at the same table, but must have different
    // real chairs; collection at the single fridge happens one at a time.
    if(other?.action?.id==='fridge'||(other?.action?.id==='dining'&&
      ['toFridge','taking'].includes(other.action.diningStage)))return false;
    const occupied=[other?.action?.id==='seat'?other.action.targetInstanceId:null,
      other?.action?.id==='dining'?other.action.diningSeatInstanceId:null].filter(Boolean);
    return Boolean(chooseDiningSeat(root.world,getActor(root,residentId)?.position,
      item.instanceId,occupied));
  }
  if(itemId==='tv'&&other?.action?.id==='hobby'&&readingSeatId(other.action))
    return true; // TV itself remains usable; seating selection excludes readers.
  // A queued reading action may start only when a physically reachable
  // supported sitting place is actually free.
  if(itemId==='hobby'&&!chooseReadingSeat(root,residentId,item.instanceId))return false;
  return other?.action?.targetInstanceId!==item.instanceId &&
    !(other?.action?.id===itemId&&!other.action.targetInstanceId);
}
/** F4F.2: nearest reachable dining table at dispatch, using this resident's position.
 * The actual meal remains the existing table-specific dining action.
 */
export function nearestAvailableDiningTable(root,residentId='alex'){
  const actor=getActor(root,residentId);
  if(!actor||!resolveActionFurniture(root?.world,'fridge'))return null;
  let best=null;
  for(const table of root.world?.furniture?.instances??[]){
    if(table.prefabId!=='diningtable'||table.location!=='home'||
      !furnitureAvailable(root,'dining',residentId,table.instanceId))continue;
    const distance=Math.hypot(actor.position.x-table.x,actor.position.z-table.z);
    if(!best||distance<best.distance-1e-6||
      (Math.abs(distance-best.distance)<=1e-6&&table.instanceId<best.instanceId))
      best={instanceId:table.instanceId,distance};
  }
  return best;
}
const objectRegistry=legacyObjectRegistry();
function validReadingSource(root,actor){
  const action=actor?.action;
  const item=action?.id==='hobby'
    ?resolveActionFurniture(root.world,'hobby',action.targetInstanceId):null;
  const activity=getActivityDefinition(HOBBY_ACTIVITIES,action?.activityId);
  const id=actor===root?'alex':'mira';
  const owned=action?.inventoryItemId===undefined||inventoryFor(root,id)
    .some(gift=>gift.type==='book'&&gift.id===action.inventoryItemId);
  return Boolean(owned&&item&&activity&&canReadHobbyContent(actor.skills,action.contentId)&&
    activityFitsItem(activity,getObjectItem(objectRegistry,item.itemDefinitionId)));
}
function validPaintingSource(root,actor){
  const action=actor?.action;
  const item=action?.id==='paint'
    ?resolveActionFurniture(root.world,'paint',action.targetInstanceId):null;
  const activity=getActivityDefinition(HOBBY_ACTIVITIES,action?.activityId);
  return Boolean(item&&activity?.id===PAINT_ACTIVITY_ID&&
    PAINT_CONTENT_IDS.includes(action.contentId)&&
    activityFitsItem(activity,getObjectItem(objectRegistry,item.itemDefinitionId)));
}
function validMusicSource(root,actor){
  const action=actor?.action;
  const item=action?.id==='music'
    ?resolveActionFurniture(root.world,'music',action.targetInstanceId):null;
  const activity=getActivityDefinition(HOBBY_ACTIVITIES,action?.activityId);
  return Boolean(item&&MUSIC_ACTIVITY_IDS.includes(activity?.id)&&
    MUSIC_CONTENT_IDS.includes(action.contentId)&&
    activityFitsItem(activity,getObjectItem(objectRegistry,item.itemDefinitionId)));
}
export function chooseResidentAction(root,itemId,automatic=false,residentId='alex',targetInstanceId=null,
  activityId=null,contentId=null,musicPlan=null,inventoryItemId=null,recipeId=null) {
  const item=resolveActionFurniture(root.world,itemId,targetInstanceId);
  if(!item||!HOUSEHOLD_IDS.includes(residentId)||
    !furnitureAvailable(root,itemId,residentId,item.instanceId))return false;
  const resident=getActor(root,residentId);
  let readingSeat=null,plannedMusic=null,diningSeat=null,kitchenPlan=null;
  if(itemId==='cook'){
    const level=currentSkillLevel(resident.skills,HOBBY_SKILLS,COOKING_SKILL_ID);
    if(!canCookRecipe(root.kitchen,recipeId,level))return false;
    kitchenPlan=chooseKitchenPlan(root.world,resident.position,item.instanceId);
    if(!kitchenPlan)return false;
  }
  if(itemId==='dining'){
    const other=getActor(root,residentId==='alex'?'mira':'alex');
    const taken=[other?.action?.id==='seat'?other.action.targetInstanceId:null,
      other?.action?.id==='dining'?other.action.diningSeatInstanceId:null].filter(Boolean);
    diningSeat=chooseDiningSeat(root.world,resident.position,item.instanceId,taken);
    if(!diningSeat)return false;
  }
  if(inventoryItemId!==null&&(
    itemId!=='hobby'||activityId!==READING_ACTIVITY_ID||
    !inventoryFor(root,residentId).some(gift=>gift.type==='book'&&
      gift.id===inventoryItemId)))return false;
  if(itemId==='hobby'){
    const activity=getActivityDefinition(HOBBY_ACTIVITIES,activityId);
    if(!activity||!canReadHobbyContent(resident.skills,contentId)||
      !activityFitsItem(activity,getObjectItem(objectRegistry,item.itemDefinitionId)))return false;
    readingSeat=chooseReadingSeat(root,residentId,item.instanceId);
    if(!readingSeat)return false;
  }
  if(itemId==='paint'){
    // H5b: a full collection is NOT a ring buffer. Finished works, including
    // those on a wall or in inventory, must not disappear on a 25th painting.
    if((resident.createdWorks?.length||0)>=PAINT_WORKS_LIMIT)return false;
    const activity=getActivityDefinition(HOBBY_ACTIVITIES,activityId);
    if(activity?.id!==PAINT_ACTIVITY_ID||!PAINT_CONTENT_IDS.includes(contentId)||
      !activityFitsItem(activity,getObjectItem(objectRegistry,item.itemDefinitionId)))return false;
  }
  if(itemId==='music'){
    const activity=getActivityDefinition(HOBBY_ACTIVITIES,activityId);
    if(!MUSIC_ACTIVITY_IDS.includes(activity?.id)||
      !MUSIC_CONTENT_IDS.includes(contentId)||
      !activityFitsItem(activity,getObjectItem(objectRegistry,item.itemDefinitionId)))
      return false;
    plannedMusic=musicPlan||chooseMusicListeningSpot(root.world,resident.position,item.instanceId);
    if(!plannedMusic||!validMusicListeningSpot(root.world,item.instanceId,plannedMusic.point))
      return false;
  }
  // Explicit actions never supersede an ongoing action or interrupt a social.
  // Future manual commands are stored by action-queue.js and dispatched later.
  if (!resident || resident.action || root.socialAction ||
    (automatic && (root.paused||pendingActions(root.actionQueues,residentId).length)))return false;
  const slot=itemId==='bed'?bedSlotFor(root,residentId,item.instanceId):null;
  const chosen=chooseAction(resident,itemId,automatic);
  if(chosen)resident.action.targetInstanceId=item.instanceId;
  if(chosen&&itemId==='hobby'){
    const session=createActivitySession(HOBBY_ACTIVITIES,{
      sessionId:'reading:'+residentId+':'+root.actionQueues.nextSeq+':'+Math.round(root.minutes*1000),
      activityId,actorId:residentId,targetInstanceId:item.instanceId,contentId
    },HOBBY_CONTENT);
    if(!session){resident.action=null;return false;}
    resident.action.activityId=activityId;
    resident.action.contentId=contentId;
    if(inventoryItemId)resident.action.inventoryItemId=inventoryItemId;
    if(!beginReadingJourney(resident.action,readingSeat)){
      resident.action=null;return false;
    }
    resident.activitySession=session;
  }
  if(chosen&&itemId==='paint'){
    const session=createActivitySession(HOBBY_ACTIVITIES,{
      sessionId:'painting:'+residentId+':'+root.actionQueues.nextSeq+':'+Math.round(root.minutes*1000),
      activityId,actorId:residentId,targetInstanceId:item.instanceId,contentId
    },HOBBY_CONTENT);
    if(!session){resident.action=null;return false;}
    resident.action.activityId=activityId;
    resident.action.contentId=contentId;
    resident.activitySession=session;
  }
  if(chosen&&itemId==='music'){
    const session=createActivitySession(HOBBY_ACTIVITIES,{
      sessionId:'music:'+residentId+':'+root.actionQueues.nextSeq+':'+Math.round(root.minutes*1000),
      activityId,actorId:residentId,targetInstanceId:item.instanceId,contentId
    },HOBBY_CONTENT);
    if(!session){resident.action=null;return false;}
    resident.action.activityId=activityId;
    resident.action.contentId=contentId;
    resident.action.musicSpot={x:plannedMusic.point.x,z:plannedMusic.point.z};
    resident.activitySession=session;
  }
  if(chosen&&itemId==='cook'){
    resident.action.recipeId=recipeId;
    resident.action.prepInstanceId=kitchenPlan.prepInstanceId;
    resident.action.cookStage='toFridge';
  }
  if(chosen&&itemId==='bed')resident.action.bedSlot=slot;
  if(chosen&&itemId==='dining'){
    resident.action.diningSeatInstanceId=diningSeat.instanceId;
    resident.action.diningStage='toFridge';
  }
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
    resident.activitySession=null;
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

/** H1 real-time book practice: source/geometry/occupancy validated by household.
 * The H0 kernel returns session+XP together, both committed in one actor update.
 * Never awards during walking, after cancellation, or to the wrong resident.
 */
function advanceReading(root,id,minutes){
  const actor=getActor(root,id),action=actor?.action;
  if(action?.id!=='hobby'){if(actor&&!['music','paint'].includes(action?.id))actor.activitySession=null;return;}
  const stage=readingStage(action);
  const seat=stage?chooseReadingSeat(root,id,action.targetInstanceId,
    action.readingSeatInstanceId):null;
  if(!validReadingSource(root,actor)||
    !furnitureAvailable(root,'hobby',id,action.targetInstanceId)||
    (stage&&!seat)){
    actor.action=null;actor.activitySession=null;actor.event='Книжный шкаф или место чтения недоступны';return;
  }
  let session=actor.activitySession;
  if(!session||session.actorId!==id||session.activityId!==action.activityId||
    session.targetInstanceId!==action.targetInstanceId){
    actor.action=null;actor.activitySession=null;return;
  }
  // Stage timers are stepped AFTER the simulation tick, so the transition
  // from opening to using never earns a phantom same-frame reading reward.
  if(action.phase!=='using')return;
  if(stage&&readingStage(action)!=='reading')return;
  const target=stage
    ?furnitureActionApproach(root.world,'sofa',action.readingSeatInstanceId)
    :furnitureActionApproach(root.world,'hobby',action.targetInstanceId);
  // Only the real seated arrival (or an old pre-H1n shelf save) grants
  // skill XP. Walking with a borrowed book has no credited time.
  if(!target||Math.hypot(actor.position.x-target.x,actor.position.z-target.z)>.35){
    actor.action=null;actor.activitySession=null;actor.event='Не удалось добраться до места чтения';return;
  }
  if(session.phase==='walking')
    session=arriveActivitySession(session,{authorized:true,resourceAvailable:true});
  if(!session){actor.action=null;actor.activitySession=null;return;}
  const advanced=advanceActivitySession(HOBBY_ACTIVITIES,session,minutes,
    {authorized:true,resourceAvailable:true,paused:root.paused});
  session=advanced.session;
  const xp=creditActivityPractice(actor.skills,HOBBY_SKILLS,HOBBY_ACTIVITIES,session,
    {authorized:true,resourceAvailable:true,content:HOBBY_CONTENT});
  if(xp){actor.skills=xp.progress;session=xp.session;}
  actor.activitySession=session;
}
/** H2: leisure only at the actual occupied, reachable playback station. */
function advanceMusic(root,id,minutes){
  const actor=getActor(root,id),action=actor?.action;
  if(action?.id!=='music')return;
  const point=action.musicSpot;
  let session=actor.activitySession;
  if(!validMusicSource(root,actor)||
    !validMusicListeningSpot(root.world,action.targetInstanceId,point)||
    !furnitureAvailable(root,'music',id,action.targetInstanceId)||
    !session||session.actorId!==id||!MUSIC_ACTIVITY_IDS.includes(session.activityId)||
    session.activityId!==action.activityId||
    session.contentId!==action.contentId||
    session.targetInstanceId!==action.targetInstanceId){
    actor.action=null;actor.activitySession=null;
    actor.event='Музыкальный центр недоступен';return;
  }
  if(action.phase!=='using')return;
  if(!point||Math.hypot(actor.position.x-point.x,actor.position.z-point.z)>.35){
    actor.action=null;actor.activitySession=null;
    actor.event='Не удалось добраться до музыки';return;
  }
  if(session.phase==='walking')
    session=arriveActivitySession(session,{authorized:true,resourceAvailable:true});
  if(!session){actor.action=null;actor.activitySession=null;return;}
  const advanced=advanceActivitySession(HOBBY_ACTIVITIES,session,minutes,
    {authorized:true,resourceAvailable:true,paused:root.paused});
  actor.activitySession=advanced.session;
}
/** H5: verified physical practice is the only source of painting XP. */
function advancePainting(root,id,minutes){
  const actor=getActor(root,id),action=actor?.action;
  if(action?.id!=='paint')return;
  const target=furnitureActionApproach(root.world,'paint',action.targetInstanceId);
  let session=actor.activitySession;
  if(!validPaintingSource(root,actor)||
    !furnitureAvailable(root,'paint',id,action.targetInstanceId)||
    !session||session.actorId!==id||session.activityId!==PAINT_ACTIVITY_ID||
    session.contentId!==action.contentId||
    session.targetInstanceId!==action.targetInstanceId){
    actor.action=null;actor.activitySession=null;actor.event='Мольберт недоступен';return;
  }
  if(action.phase!=='using')return;
  if(!target||Math.hypot(actor.position.x-target.x,actor.position.z-target.z)>.35){
    actor.action=null;actor.activitySession=null;actor.event='Нет подхода к мольберту';return;
  }
  if(session.phase==='walking')
    session=arriveActivitySession(session,{authorized:true,resourceAvailable:true});
  if(!session){actor.action=null;actor.activitySession=null;return;}
  const advanced=advanceActivitySession(HOBBY_ACTIVITIES,session,minutes,
    {authorized:true,resourceAvailable:true,paused:root.paused});
  session=advanced.session;
  const xp=creditActivityPractice(actor.skills,HOBBY_SKILLS,HOBBY_ACTIVITIES,session,
    {authorized:true,resourceAvailable:true,content:HOBBY_CONTENT});
  if(xp){actor.skills=xp.progress;session=xp.session;}
  actor.activitySession=session;
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
  replenishKitchen(root.kitchen,root.minutes);
  // A removed/moved sink cannot clean dishes from afar or from storage.
  for(const id of HOUSEHOLD_IDS){
    const actor=getActor(root,id),action=actor?.action;
    if(action?.id!=='wash')continue;
    const target=furnitureActionApproach(root.world,'wash',action.targetInstanceId);
    if(!target||root.kitchen.dirtyDishes===0||
      (action.phase==='using'&&Math.hypot(
        actor.position.x-target.x,actor.position.z-target.z)>.5)){
      actor.action=null;
      actor.event='Мойка недоступна или посуды больше нет';
    }
  }
  // Kitchen preflight: a moved/stored source or an interrupted resident
  // cannot finish a ghost dish. Check on every active simulation step.
  for(const id of HOUSEHOLD_IDS){
    const actor=getActor(root,id),action=actor?.action;
    if(action?.id!=='cook')continue;
    const level=currentSkillLevel(actor.skills,HOBBY_SKILLS,COOKING_SKILL_ID);
    const lookup=action.cookStage==='toFridge'||action.cookStage==='taking'
      ?furnitureActionApproach(root.world,'fridge')
      :action.cookStage==='toPrep'||action.cookStage==='preparing'
        ?furnitureActionApproach(root.world,'prep',action.prepInstanceId)
        :furnitureActionApproach(root.world,'cook',action.targetInstanceId);
    if(!cookingSourceValid(root.world,action)||
      !canCookRecipe(root.kitchen,action.recipeId,level)||!lookup||
      (action.phase==='using'&&Math.hypot(
        actor.position.x-lookup.x,actor.position.z-lookup.z)>.6)){
      actor.action=null;actor.event='Готовка прервана: нет продуктов или кухонного оборудования';
    }
  }
  // Dining validates the real table, exact chair and serving spot before
  // any hunger reward. Invalid geometry stops the meal without a benefit.
  for(const id of HOUSEHOLD_IDS){
    const actor=getActor(root,id),a=actor?.action;
    if(a?.id!=='dining')continue;
    const point=diningSeatApproach(root.world,a.targetInstanceId,a.diningSeatInstanceId);
    const other=getActor(root,id==='alex'?'mira':'alex');
    if(!point||(other?.action?.id==='seat'&&
        other.action.targetInstanceId===a.diningSeatInstanceId)||
       (other?.action?.id==='dining'&&
        other.action.diningSeatInstanceId===a.diningSeatInstanceId)||
       (a.diningStage==='eating'&&a.phase==='using'&&
        Math.hypot(actor.position.x-point.x,actor.position.z-point.z)>.36)){
      actor.action=null;actor.event='Стол или обеденный стул недоступен';
    }
  }
  // Only physically arrived diners consume cooked portions; leaving before
  // eating keeps inventory intact. Old table meals remain available.
  for(const id of HOUSEHOLD_IDS){
    const action=getActor(root,id)?.action;
    if(action?.id==='dining'&&action.phase==='using'&&
      action.diningStage==='eating'&&!action.portionTaken){
      action.cookedRecipeId=takeKitchenServing(root.kitchen);
      action.portionTaken=true;
    }
  }
  // Refuse stale/removed/stored/occupied reading sources before simulation
  // can grant Fun, and account only physically performed game minutes.
  advanceReading(root,'alex',minutes);
  advanceReading(root,'mira',minutes);
  advanceMusic(root,'alex',minutes);
  advanceMusic(root,'mira',minutes);
  advancePainting(root,'alex',minutes);
  advancePainting(root,'mira',minutes);
  // Capture only genuinely finished sessions: a canceled/removed station
  // never yields a work, even if the saved timer was nearly complete.
  const readyPaint=Object.fromEntries(HOUSEHOLD_IDS.map(id=>{
    const actor=getActor(root,id);
    return [id,actor.action?.id==='paint'&&actor.activitySession?.phase==='ready'
      ?{action:actor.action,session:actor.activitySession}:null];
  }));
  // Capture stages BEFORE the simulation. The completion tick may switch
  // reading→closing; it must not also consume a full closing interval.
  const stageBefore=Object.fromEntries(HOUSEHOLD_IDS.map(id=>
    [id,readingStage(getActor(root,id)?.action)]));
  const shared=liveSharedTv(root);
  const paired=livePairedHobby(root);
  const watchMinutes=shared?Math.min(minutes,Math.max(0,
    sharedDuration(root.socialAction.shared)-root.socialAction.elapsed)):0;
  const pairMinutes=paired?Math.min(minutes,Math.max(0,
    sharedDuration(root.socialAction.shared)-root.socialAction.elapsed)):0;
  // Toggle after the real A* arrival, never when walking/queued/paused.
  // Capture state before tick completion so short actions cannot miss it.
  switchLampAtArrival(root.world,root);
  switchLampAtArrival(root.world,other);
  const alexUse=captureObjectUse(root),miraUse=captureObjectUse(other);
  const kitchenBefore=Object.fromEntries(HOUSEHOLD_IDS.map(id=>{
    const actor=getActor(root,id),a=actor.action;
    if(!a)return [id,null];
    const recipe=a.id==='cook'?kitchenRecipe(a.recipeId):null;
    const cookingMinutes=recipe&&a.phase==='using'&&a.cookStage==='cooking'
      ?Math.min(minutes,Math.max(0,recipe.cookMinutes-a.elapsed)):0;
    return [id,{action:a,id:a.id,phase:a.phase,
      stage:a.diningStage,recipeId:recipe?.id,
      cookingMinutes}];
  }));
  tick(root,minutes,root.world);
  tick(other,minutes,root.world);
  for(const id of HOUSEHOLD_IDS){
    const actor=getActor(root,id),before=kitchenBefore[id];
    if(!before)continue;
    if(before.id==='cook'){
      if(before.cookingMinutes>0){
        const max=HOBBY_SKILLS.skills[COOKING_SKILL_ID].xpThresholds.at(-1);
        actor.skills.xpById[COOKING_SKILL_ID]=Math.min(max,
          Math.round(((actor.skills.xpById[COOKING_SKILL_ID]||0)+
            before.cookingMinutes*1.05)*1000000)/1000000);
      }
      if(before.phase==='using'&&before.action.cookStage==='cooking'&&
        !actor.action&&before.recipeId){
        const level=currentSkillLevel(actor.skills,HOBBY_SKILLS,COOKING_SKILL_ID);
        if(finishKitchenRecipe(root.kitchen,before.recipeId,level))
          actor.event='Готово блюдо «'+kitchenRecipe(before.recipeId).label+'» · порции в холодильнике';
      }
    }
    if(before.id==='dining'&&before.phase==='using'&&
      before.stage==='eating'&&!actor.action)recordDirtyDish(root.kitchen);
    if(before.id==='wash'&&before.phase==='using'&&!actor.action){
      const cleaned=washKitchenDishes(root.kitchen);
      actor.event='Посуда вымыта: '+cleaned;
    }
  }
  replenishKitchen(root.kitchen,root.minutes);
  for(const id of HOUSEHOLD_IDS){
    const actor=getActor(root,id),completed=readyPaint[id];
    if(completed&&!actor.action&&actor.activitySession===completed.session){
      const result=finishPainting({session:completed.session,actor,actorId:id,
        world:root.world,at:root.minutes,registry:HOBBY_ACTIVITIES,skills:HOBBY_SKILLS});
      if(result){actor.createdWorks=result.works;
        actor.event='Готова картина «'+HOBBY_CONTENT.entries[result.work.contentId].label+'»';}
      actor.activitySession=null;
    }
  }
  for(const id of HOUSEHOLD_IDS){
    const actor=getActor(root,id),action=actor?.action;
    if(action?.id==='hobby'&&action.phase==='walking'&&
      readingStage(action)===stageBefore[id]){
      const progressed=advanceReadingJourney(action,minutes);
      if(progressed.done){
        actor.action=null;actor.activitySession=null;
        actor.event='Книга возвращена в шкаф';
      }
    }
  }
  // Canonical F4b3 item-use receipts and H1 reading XP coexist.
  settleObjectUseStep({world:root.world,actor:root,before:alexUse});
  settleObjectUseStep({world:root.world,actor:other,before:miraUse});
  for(const id of HOUSEHOLD_IDS){
    const person=getActor(root,id);
    if(!['hobby','music','paint'].includes(person.action?.id))person.activitySession=null;
  }
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
  if(pairMinutes>0&&livePairedHobby(root)){
    const session=root.socialAction.shared;
    const credited=Math.min(pairMinutes,Math.max(0,
      sharedDuration(session)-Math.max(session.creditedMinutes,root.socialAction.elapsed)));
    if(credited>0){
      for(const id of HOUSEHOLD_IDS){
        const actor=getActor(root,id);
        const efficiency=voluntaryMoodEfficiency(actor,{type:'shared',mode:'leisure'});
        const perMinute=session.choiceId==='books'?1.05:.94;
        actor.needs.fun=Math.min(100,actor.needs.fun+credited*perMinute*efficiency);
        if(session.choiceId==='books'){
          // Genuine synchronized reading, not XP for discussion alone.
          const max=HOBBY_SKILLS.skills?.[READING_SKILL_ID]?.xpThresholds?.at(-1)??1380;
          actor.skills.xpById[READING_SKILL_ID]=Math.min(max,
            Math.round(((actor.skills.xpById[READING_SKILL_ID]||0)+credited)*1e6)/1e6);
        }
        refreshMind(actor,root.world);
      }
      session.creditedMinutes=Math.min(sharedDuration(session),
        session.creditedMinutes+credited);
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
