/** Two-person household without importing PlayCanvas, DOM or browser APIs.
 * Legacy root fields remain Alex's exact v1 state; otherSim is an optional extension.
 */
import { newGame, loadGame, tick, chooseAction, autonomousChoice, setAutonomyEnabled,ACTIONS } from './simulation.js';
import {DEFAULT_CIVIL_DATE,createCalendar,restoreCalendar} from './calendar-core.js';
import {restoreEventRecords} from './calendar-events.js';
import {holidayDefinitions,restoreWeekendDays} from './calendar-holidays.js';
import {restoreReminderReceipts} from './calendar-reminders.js';
import {newCareerSystem,restoreCareerSystem} from './career-state.js';
import {newRecruitmentSystem,restoreRecruitmentSystem,progressCareerRecruitment} from './career-recruitment.js';
import {progressCareerWork,residentUnavailableForHome,residentAwayAtWork} from './career-work.js';
import {progressWorkNeeds} from './career-work-needs.js';
import {applyWorkMoodContext} from './career-worklife.js';
import {DISH_AUTO_WASH_THRESHOLD,COOKING_SKILL_ID,kitchenRecipe,newKitchen,restoreKitchen,replenishKitchen,
  canCookRecipe,chooseKitchenPlan,cookingSourceValid,finishKitchenRecipe,
  takeKitchenServingDetails,hasKitchenServing,shouldEatFreshKitchenMeal,
  recordDirtyDish,washKitchenDishes} from './kitchen.js';
import {currentSkillLevel} from './skills-engine.js';
import {settleReadyMealDeliveries} from './ready-food.js';
import {refreshMind,completePoolSwimMind,restorePoolFirstSwimAt} from './psychology.js';
import {restorePoolAutoRoutine,considerAutonomousPool,recordAutonomousPoolStart} from './pool-autonomy.js';
import {DEMO_PROFILES} from './trait-catalog.js';
import {starterInventory,restoreInventory,sharedDuration,inventoryFor} from './gifts-leisure.js';
import {voluntaryMoodEfficiency} from './mood-action-policy.js';
import {NEED_DECAY_PER_MINUTE} from './need-balance.js';
import {newActionQueues,restoreActionQueues,pendingActions} from './action-queue.js';
import {newOutdoorsWorld,restoreOutdoorsWorld} from './lot-surface.js';
import {validateRestoredPoolSwim,advancePoolSwim,requestPoolExit,
  interruptPoolSwimForWork} from './pool-swim-runtime.js';
import {poolHasExit} from './pool-equipment.js';
import {outdoorBench,outdoorBenchApproach,outdoorBenchAvailable} from './outdoor-interactions.js';
import {gardenFeature,gardenApproach,gardenActionAllowed,restoreGardenRewards,
  advanceGardens,settleGardenAction,GARDEN_DURATION,
  gardenRequestStillValid,gardenView} from './gardening.js';
import {restoreGardenRoutine,considerAutonomousGarden,noteAutonomousGardenStart} from './garden-autonomy.js';
import {restoreGardenMilestones,completeGardenExperience,refreshGardenWishes} from './garden-psychology.js';
import {newSocialGraph,restoreSocialGraph,markAcquainted,observePairViews,setLifeStage} from './social-graph.js';
import {BED_SLOTS,BED_SLOT_IDS,availableBedSlot,validBedSlot} from './bed-layout.js';
import {findPath,nearestWalkable} from './navigation.js';
import {newConstructionWorld,restoreConstructionWorld} from './construction.js';
import {newFurnitureWorld,restoreFurnitureWorld,resolveActionFurniture} from './furniture-catalog.js';
import {newFurnitureShop,restoreFurnitureShop} from './furniture-shop.js';
import {newFinancialHistory,restoreFinancialHistory} from './finance-ledger.js';
import {newHouseholdBills,restoreHouseholdBills,progressHouseholdBills} from './household-bills.js';
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
import {switchLampAtArrival,MIRROR_SPEECH_DURATION,MIRROR_SPEECH_XP} from './furniture-interactions.js';
import {PAINT_ACTIVITY_ID,PAINT_CONTENT_IDS,PAINT_WORKS_LIMIT,canPaintContent,restoreCreatedWorks,finishPainting} from './painting.js';
import {chooseDiningSeat,diningSeatApproach} from './dining.js';

export const HOUSEHOLD_IDS = Object.freeze(['alex', 'mira']);
export const RESIDENT_NAMES = Object.freeze({ alex: 'Алекс', mira: 'Мира' });
export const RESIDENT_START = Object.freeze({ x: -0.80, z: 2.95 });

function newMira(minutes=480) {
  const mira=newGame(DEMO_PROFILES.second);
  mira.position={ ...RESIDENT_START };
  mira.needs={ hunger: 82, energy: 88, hygiene: 80, fun: 78, social:76, bladder:82 };
  mira.minutes=minutes;
  mira.autonomy.nextAt=minutes;
  mira.event='Свободное время';
  mira.skills=newSkillProgress();
  mira.createdWorks=[];
  mira.objectOnceLedger=newObjectOnceLedger();
  refreshMind(mira);
  return mira;
}

export function newHousehold(suggestedDate=DEFAULT_CIVIL_DATE) {
  const state=newGame(DEMO_PROFILES.first);
  // W1-A.1: one root-only Gregorian epoch; neither resident keeps a separate calendar.
  state.calendar=createCalendar(suggestedDate);
  state.careerSystem=newCareerSystem();
  state.recruitmentSystem=newRecruitmentSystem();
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
  state.world={furniture:newFurnitureWorld(),construction:newConstructionWorld(),
    outdoors:newOutdoorsWorld()};
  // F2.1 optional root-v1 extension. Old households get test credits only once.
  state.shop=newFurnitureShop();
  state.financialHistory=newFinancialHistory();
  state.gardenRewards=restoreGardenRewards(null);
  state.gardenRoutine=restoreGardenRoutine(null,state.minutes);
  state.poolAutoRoutine=restorePoolAutoRoutine(null,state.minutes);
  state.gardenMilestones=restoreGardenMilestones(null,state.minutes);
  state.householdBills=newHouseholdBills(state.minutes);
  refreshMind(state,state.world);refreshMind(state.otherSim,state.world);
  state.socialAction=null;
  applyWorkMoodContext(state);
  return state;
}

/** Do not change save key or version: parse and sanitize each resident using v1 loader. */
export function loadHousehold(raw,suggestedDate=DEFAULT_CIVIL_DATE) {
  if (!raw || raw.version!==1) return newHousehold(suggestedDate);
  const root=loadGame(raw,DEMO_PROFILES.first);
  // Missing old v1 calendar: align the SUGGESTED date to the current game day.
  // This adds one optional field without touching minutes, money, people or possessions.
  root.calendar={...restoreCalendar(raw.calendar,root.minutes,suggestedDate),
    ...restoreEventRecords(raw.calendar),
    holidays:Array.isArray(raw.calendar?.holidays)
      ?holidayDefinitions({holidays:raw.calendar.holidays}).filter(h=>
        raw.calendar.holidays.some(saved=>saved?.id===h.id)):[],
    reminderReceipts:restoreReminderReceipts(raw.calendar?.reminderReceipts),
    weekendDays:restoreWeekendDays(raw.calendar?.weekendDays)};
  const restoredConstruction=restoreConstructionWorld(raw.world?.construction);
  root.world={furniture:restoreFurnitureWorld(raw.world?.furniture),
    construction:restoredConstruction,
    outdoors:restoreOutdoorsWorld(raw.world?.outdoors,restoredConstruction,root.minutes)};
  root.kitchen=restoreKitchen(raw.kitchen);
  root.shop=restoreFurnitureShop(raw.shop);
  root.financialHistory=restoreFinancialHistory(raw.financialHistory);
  root.gardenRewards=restoreGardenRewards(raw.gardenRewards);
  root.gardenRoutine=restoreGardenRoutine(raw.gardenRoutine,root.minutes);
  root.gardenMilestones=restoreGardenMilestones(raw.gardenMilestones,root.minutes);
  root.householdBills=restoreHouseholdBills(raw.householdBills,root.minutes);
  root.careerSystem=restoreCareerSystem(raw.careerSystem);
  root.recruitmentSystem=restoreRecruitmentSystem(raw.recruitmentSystem,root.careerSystem,root.minutes);
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
  if (!root.autonomy.enabled && mira.action?.automatic &&
      !(mira.action.id==='swim'&&mira.action.exitRequested)) mira.action=null;
  root.otherSim=mira;
  root.poolAutoRoutine=restorePoolAutoRoutine(raw.poolAutoRoutine,root.minutes);
  restorePoolFirstSwimAt(raw,root);
  restorePoolFirstSwimAt(raw.otherSim,mira);
  applyWorkMoodContext(root);
  // Restored off-lot residents cannot resume a stale home action or grant
  // cooking/painting/social rewards after refreshing Safari midshift.
  for(const id of HOUSEHOLD_IDS){
    if(!residentUnavailableForHome(root,id))continue;
    const actor=getActor(root,id);
    actor.action=null;actor.activitySession=null;
  }
  mira.objectOnceLedger=restoreObjectOnceLedger(raw.otherSim?.objectOnceLedger);
  root.selectedSim=raw.selectedSim==='mira' ? 'mira' : 'alex';
  root.inventory=restoreInventory(raw.inventory);
  root.actionQueues=restoreActionQueues(raw.actionQueues,HOUSEHOLD_IDS);
  // Retain the exact object target in persistent commands. Old un-targeted
  // v1 commands migrate to deterministic original instance IDs once.
  for(const id of HOUSEHOLD_IDS){
    const sim=id==='alex'?root:mira;
    if(sim.action&&sim.action.id==='bench'){
      const target=outdoorBenchApproach(root.world,sim.action.targetInstanceId);
      const otherActor=getActor(root,id==='alex'?'mira':'alex');
      if(!target||!outdoorBenchAvailable(root,id,sim.action.targetInstanceId)||
        (sim.action.phase==='using'&&Math.hypot(
          sim.position.x-target.x,sim.position.z-target.z)>.5)||
        (sim.action.phase==='walking'&&!findPath(sim.position,target,root.world)))
        sim.action=null;
    }
    if(sim.action?.id==='garden'){
      const a=sim.action,plan=gardenApproach(root.world,a.targetInstanceId,sim.position);
      const valid=plan&&gardenActionAllowed(root,id,a.targetInstanceId,
        a.gardenActionId,{ignoreReservation:true})&&
        (a.phase!=='using'||Math.hypot(sim.position.x-a.gardenGoal.x,
          sim.position.z-a.gardenGoal.z)<.45);
      if(!valid||(Number.isFinite(a.gardenPlantedAt)&&
        a.gardenPlantedAt!==root.world.outdoors.gardens[a.targetInstanceId]?.plantedAt))sim.action=null;
    }
    if(sim.action&&sim.action.id!=='move'&&sim.action.id!=='bench'&&
      sim.action.id!=='garden'&&sim.action.id!=='swim'){
      const object=resolveActionFurniture(root.world,sim.action.id,sim.action.targetInstanceId);
      if(object)sim.action.targetInstanceId=object.instanceId;
      else sim.action=null; // no phantom action or silent rerouting to another item
    }
    // Restored training still needs the exact real reachable mirror.
    if(sim.action?.id==='mirror'&&sim.action.mirrorPractice===true){
      const point=furnitureActionApproach(root.world,'mirror',sim.action.targetInstanceId);
      if(!point||(sim.action.phase==='using'&&
        Math.hypot(sim.position.x-point.x,sim.position.z-point.z)>.45)||
        (sim.action.phase==='walking'&&!findPath(sim.position,point,root.world)))
        sim.action=null;
    }
    root.actionQueues.byResident[id]=root.actionQueues.byResident[id].filter(task=>
      (task.type!=='outdoor'||Boolean(outdoorBench(root.world,task.instanceId)))&&
      (task.type!=='garden'||gardenRequestStillValid(root,id,task.instanceId,task.actionId))&&
      (task.type!=='pool'||((root.world.outdoors?.pools||[])
        .some(p=>p.poolId===task.poolId)&&poolHasExit(root.world.outdoors,task.poolId)&&
        (task.actionId!=='jump'||root.world.outdoors.poolFixtures
          .some(f=>f.fixtureId===task.fixtureId&&f.poolId===task.poolId&&f.kind==='board')))));
    // Legacy D2a commands have no queuedAt. Start a bounded 60-minute wait
    // at restored time rather than letting an impossible entry wait forever.
    for(const task of root.actionQueues.byResident[id])if(task.type==='pool'&&
      !Number.isFinite(task.queuedAt))task.queuedAt=root.minutes;
    for(const task of root.actionQueues.byResident[id]){
      if(task.type!=='object'||task.targetInstanceId)continue;
      const object=resolveActionFurniture(root.world,task.actionId);
      if(object)task.targetInstanceId=object.instanceId;
    }
  }
  // One v1 swimming action per resident; reject corrupt/overlapping water slots
  // only AFTER the canonical pools and both residents have been restored.
  for(const id of HOUSEHOLD_IDS)validateRestoredPoolSwim(root,id);
  // A saved manual walk must still have a real destination on this lot.
  for(const id of HOUSEHOLD_IDS){
    const resident=getActor(root,id);
    if(resident.action?.id==='move'&&
      !findPath(resident.position,resident.action.goal,root.world))resident.action=null;
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
  refreshGardenWishes(root);
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
    ['toFridge','taking','toFridgeStore','storing'].includes(other.action.cookStage))return false;
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
      ['toFridge','taking'].includes(other.action.diningStage))||
      (other?.action?.id==='cook'&&
        ['toFridge','taking','toFridgeStore','storing'].includes(other.action.cookStage)))return false;
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
    canPaintContent(actor.skills,HOBBY_SKILLS,action.contentId)&&
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
  activityId=null,contentId=null,musicPlan=null,inventoryItemId=null,recipeId=null,
  mirrorPractice=false) {
  const item=resolveActionFurniture(root.world,itemId,targetInstanceId);
  if(residentUnavailableForHome(root,residentId))return false;
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
    if(recipeId!==null&&!hasKitchenServing(root.kitchen,recipeId))return false;
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
    if(activity?.id!==PAINT_ACTIVITY_ID||!canPaintContent(resident.skills,HOBBY_SKILLS,contentId)||
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
  if(chosen&&itemId==='mirror'&&mirrorPractice===true&&!automatic)
    resident.action.mirrorPractice=true;
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
    if(recipeId!==null)resident.action.selectedRecipeId=recipeId;
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
    if(removed.objectId==='swim')requestPoolExit(root,residentId,'manual-command');
    else resident.action=null;
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
  // Care must run BEFORE settlement if this tick crosses the end of a shift.
  progressWorkNeeds(root,root.minutes,root.minutes+minutes);
  const careerEvents=[...progressCareerWork(root,root.minutes,root.minutes+minutes),
    ...progressCareerRecruitment(root,root.minutes,root.minutes+minutes)];
  other.minutes=root.minutes;
  other.paused=root.paused;
  other.speed=root.speed;
  other.autonomy.enabled=root.autonomy.enabled;
  replenishKitchen(root.kitchen,root.minutes);
  for(const id of HOUSEHOLD_IDS){
    const actor=getActor(root,id),a=actor?.action;
    if(a?.id!=='mirror'||a.mirrorPractice!==true)continue;
    const point=furnitureActionApproach(root.world,'mirror',a.targetInstanceId);
    if(!point||(a.phase==='using'&&
      Math.hypot(actor.position.x-point.x,actor.position.z-point.z)>.45)||
      (a.phase==='walking'&&!findPath(actor.position,point,root.world))){
      actor.action=null;actor.event='Практика речи прервана: зеркало недоступно';
    }
  }
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
  // LOT-B3: only a physically valid, occupied bench can restore Fun.
  // A removed/broken item or a teleported/restored resident never gets credit.
  for(const id of HOUSEHOLD_IDS){
    const actor=getActor(root,id),action=actor?.action;
    if(action?.id!=='bench')continue;
    const target=outdoorBenchApproach(root.world,action.targetInstanceId);
    if(!target||!outdoorBenchAvailable(root,id,action.targetInstanceId)||
      (action.phase==='using'&&Math.hypot(
        actor.position.x-target.x,actor.position.z-target.z)>.5)||
      (action.phase==='walking'&&!findPath(actor.position,target,root.world))){
      actor.action=null;actor.event='Скамейка недоступна';
    }
  }
  // Kitchen preflight: a moved/stored source or an interrupted resident
  // cannot finish a ghost dish. Check on every active simulation step.
  for(const id of HOUSEHOLD_IDS){
    const actor=getActor(root,id),action=actor?.action;
    if(action?.id!=='cook')continue;
    const level=currentSkillLevel(actor.skills,HOBBY_SKILLS,COOKING_SKILL_ID);
    const lookup=['toFridge','taking','toFridgeStore','storing'].includes(action.cookStage)
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
      const serving=takeKitchenServingDetails(root.kitchen,action.selectedRecipeId??null);
      if(action.selectedRecipeId&&!serving){
        getActor(root,id).action=null;
        getActor(root,id).event='Выбранное готовое блюдо закончилось';
        continue;
      }
      action.cookedRecipeId=serving?.recipeId??null;
      if(serving?.quality&&serving.quality!=='normal')
        action.cookedQuality=serving.quality;
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
  // Capture timed garden sessions before generic tick() clears a completed action.
  // Completion and persistent watermarks are committed once per household, not per actor.
  const gardenBefore=Object.fromEntries(HOUSEHOLD_IDS.map(id=>{
    const a=getActor(root,id).action;
    return [id,a?.id==='garden'&&a.phase==='using'
      ?{instanceId:a.targetInstanceId,actionId:a.gardenActionId,
          plantedAt:a.gardenPlantedAt,elapsed:a.elapsed,
          goal:a.gardenGoal?{...a.gardenGoal}:null}:null];
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
      stage:a.diningStage,cookStage:a.cookStage,recipeId:recipe?.id,
      cookingMinutes}];
  }));
  // Away residents do not eat, cook, paint, socialize or run household AI.
  // Advance only the single canonical clock (once per resident in their v1
  // representation). The at-home partner still receives the full tick.
  if(residentAwayAtWork(root,'alex'))root.minutes+=minutes;
  else tick(root,minutes,root.world);
  if(residentAwayAtWork(root,'mira'))other.minutes+=minutes;
  else tick(other,minutes,root.world);
  // Pool movement and rewards run exactly once after natural need decay,
  // never on UI frames, queue dispatch or inside the PlayCanvas renderer.
  for(const id of HOUSEHOLD_IDS){
    const actor=getActor(root,id),wasSwimming=actor.action?.id==='swim';
    if(wasSwimming&&residentAwayAtWork(root,id))
      interruptPoolSwimForWork(root,id);
    if(!residentAwayAtWork(root,id)){
      advancePoolSwim(root,id,minutes);
      // Wet time alone is insufficient: the swimmer must safely exit.
      if(wasSwimming&&!actor.action&&actor.event==='Завершил плавание')
        completePoolSwimMind(actor,root.world);
      if(actor.action?.id==='swim'||actor.event==='Завершил плавание')
        refreshMind(actor,root.world);
    }
  }
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
      if(before.phase==='using'&&before.cookStage==='storing'&&
        !actor.action&&before.recipeId){
        const level=currentSkillLevel(actor.skills,HOBBY_SKILLS,COOKING_SKILL_ID);
        if(finishKitchenRecipe(root.kitchen,before.recipeId,level)){
          actor.event='Убрал «'+kitchenRecipe(before.recipeId).label+'» в холодильник';
          // Freshly cooked food belongs to the shared fridge first. Hungry
          // cooks can then fetch ONE real serving via the existing dining route.
          const table=nearestAvailableDiningTable(root,id);
          if(shouldEatFreshKitchenMeal(actor.needs.hunger,Boolean(table))&&
            chooseResidentAction(root,'dining',false,id,table.instanceId,
              null,null,null,null,before.recipeId))
            actor.event='Проголодался · берёт одну порцию «'+
              kitchenRecipe(before.recipeId).label+'»';
        }
      }
    }
    if(before.id==='mirror'&&before.phase==='using'&&
      before.action.mirrorPractice===true&&!actor.action&&
      before.action.elapsed>=MIRROR_SPEECH_DURATION&&
      actor.event===ACTIONS.mirror.label+' — готово'){
      const point=furnitureActionApproach(root.world,'mirror',before.action.targetInstanceId);
      if(point&&Math.hypot(actor.position.x-point.x,actor.position.z-point.z)<=.45){
        const cap=HOBBY_SKILLS.skills.charisma.xpThresholds.at(-1);
        const previous=actor.skills.xpById.charisma||0;
        const next=Math.min(cap,previous+MIRROR_SPEECH_XP);
        actor.skills.xpById.charisma=next;
        actor.event='Речь отрепетирована · харизма +'+(next-previous)+' XP';
      }
    }
    if(before.id==='dining'&&before.phase==='using'&&
      before.stage==='eating'&&!actor.action)recordDirtyDish(root.kitchen);
    if(before.id==='wash'&&before.phase==='using'&&!actor.action&&
      before.action?.elapsed>=ACTIONS.wash.duration){
      const point=furnitureActionApproach(root.world,'wash',before.action.targetInstanceId);
      // A cancelled, relocated or stored sink is never a completed wash.
      if(point&&Math.hypot(actor.position.x-point.x,actor.position.z-point.z)<=.5){
        const cleaned=washKitchenDishes(root.kitchen);
        if(cleaned)actor.event='Посуда вымыта: '+cleaned;
      }
    }
  }
  replenishKitchen(root.kitchen,root.minutes);
  // FOOD-R1: only elapsed game time can fulfill a paid delivery, once.
  // This changes canonical stock, not an actor's A* or manual FIFO action.
  settleReadyMealDeliveries(root);
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
  // Use the ONE shared household clock for growth. Never credit dry or offline hours.
  advanceGardens(root.world.outdoors,root.minutes);
  for(const id of HOUSEHOLD_IDS){
    const before=gardenBefore[id],actor=getActor(root,id);
    const currentGarden=gardenView(root.world.outdoors,before?.instanceId,root.minutes);
    if(before&&!actor.action&&currentGarden&&
      (!Number.isFinite(before.plantedAt)||before.plantedAt===currentGarden.plantedAt)&&
      before.goal&&Math.hypot(actor.position.x-before.goal.x,
        actor.position.z-before.goal.z)<=.45&&
      before.elapsed+minutes>=GARDEN_DURATION[before.actionId]){
      if(settleGardenAction(root,id,before.instanceId,before.actionId)&&
        ['water','inspect','admire'].includes(before.actionId))
        completeGardenExperience(root,id,before.instanceId,before.actionId);
    }
  }
  // Both clocks remain identical (including when paused).
  other.minutes=root.minutes;
  for(const id of HOUSEHOLD_IDS)if(residentAwayAtWork(root,id))
    refreshMind(getActor(root,id),root.world);
  tickSocial(root,minutes);
  applyWorkMoodContext(root);
  refreshGardenWishes(root);
  // One family calendar, one weekly bill cycle, never one charge per resident.
  const billEvents=progressHouseholdBills(root,root.minutes-minutes,root.minutes);
  return [...careerEvents,...billEvents];
}

/** Garden opportunity belongs to the SAME household brain, after social/self-care.
 * It never inserts an automatic task into the player's FIFO queue.
 */
export function residentGardenOpportunity(root,id='alex'){
  if(!root||residentUnavailableForHome(root,id))return null;
  return considerAutonomousGarden(root,id);
}
export function recordResidentGardenStart(root,id,instanceId){
  return noteAutonomousGardenStart(root,id,instanceId);
}

export function residentPoolOpportunity(root,id='alex'){
  return considerAutonomousPool(root,id);
}
export function recordResidentPoolStart(root,id){
  return recordAutonomousPoolStart(root,id);
}
export function residentAutonomousChoice(root,id='alex') {
  if(residentUnavailableForHome(root,id))return null;
  if(root.socialAction||pendingActions(root.actionQueues,id).length)return null;
  const resident=getActor(root,id);
  if (!root.autonomy.enabled || !resident || root.paused) return null;
  resident.autonomy.enabled=root.autonomy.enabled;
  resident.paused=root.paused;
  resident.minutes=root.minutes;
  if(root.minutes<resident.autonomy.nextAt)return null;
  // Essential self-care always takes precedence over housekeeping.
  const urgent=Math.min(...['hunger','energy','bladder','hygiene'].map(
    key=>resident.needs?.[key]??100))<25;
  // Dish care uses the same ordinary physical A*/FIFO wash action.
  // No instant count mutation, alternate economy or additional save field.
  if(!urgent&&root.kitchen?.dirtyDishes>=DISH_AUTO_WASH_THRESHOLD&&
    furnitureAvailable(root,'wash',id))return 'wash';
  const proposal=autonomousChoice(resident);
  return proposal && furnitureAvailable(root,proposal,id) ? proposal : null;
}
