/** LOT-D2b: one deterministic, headless swim action on the existing household clock.
 * Dry travel is the existing game's land A*. Wet travel uses D2a four-neighbour paths.
 * All exclusive resources are derived from the two canonical resident actions.
 * No separate scheduler, renderer, wallet or save schema.
 */
import {planPoolAdmission,planPoolEntry,planPoolExit,planPoolRecovery,
  poolAccessPoints,findPoolWaterPath} from './pool-navigation.js';
import {validPoolId} from './pool-topology.js';
import {isWalkable,nearestWalkable,findPath} from './navigation.js';

export const SWIM_MINUTES=45;
export const SWIM_EFFECTS=Object.freeze({fun:16,energy:-6,hygiene:-1.5});
export const SWIM_START=Object.freeze({energy:30,bladder:25});
export const SWIM_EMERGENCY=Object.freeze({energy:12,bladder:10});
export const SWIM_MAX_WAIT_MINUTES=60;
const RESIDENTS=['alex','mira'];
const STAGES=['approaching','waiting','entering','swimming','exiting','recovering'];
const validCell=n=>Number.isSafeInteger(n)&&n>=0&&n<3072;
const validPoint=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.z);
const clamp=n=>Math.max(0,Math.min(100,n));
const actorFor=(root,id)=>id==='alex'?root:id==='mira'?root.otherSim:null;
const otherFor=(root,id)=>actorFor(root,id==='alex'?'mira':'alex');
const active=a=>a?.id==='swim';
const pool=(root,id)=>root?.world?.outdoors?.pools?.find(p=>p.poolId===id);
const fixtures=root=>root?.world?.outdoors?.poolFixtures||[];
const inPool=(root,a)=>Boolean(pool(root,a.poolId)?.cells?.includes(a.waterCell));
const otherFixture=(root,id,fixtureId)=>{
  const a=otherFor(root,id)?.action;
  return active(a)&&a.fixtureId===fixtureId&&
    (a.stage==='entering'||(a.stage==='exiting'&&Array.isArray(a.exitWetPath)));
};
const entryOpen=(root,a)=>poolAccessPoints(root.world,a.poolId,
  {blockedFixtureIds:[]}).some(p=>p.fixtureId===a.fixtureId);
const cleanup=(root,id,message,point=null)=>{
  const actor=actorFor(root,id);
  if(!actor)return;
  if(validPoint(point)&&isWalkable(point.x,point.z,root.world))
    actor.position={...point};
  else if(!isWalkable(actor.position.x,actor.position.z,root.world)){
    const fallback=nearestWalkable(actor.position,root.world);
    if(fallback)actor.position={...fallback};
  }
  actor.action=null;
  actor.event=message;
  actor.autonomy.nextAt=Math.max(actor.autonomy.nextAt||0,root.minutes+7);
};
const occupiedCells=(root,id)=>{
  const a=otherFor(root,id)?.action;
  return active(a)?a.slotCells||[]:[];
};
const otherBusyFixtures=(root,id)=>{
  const a=otherFor(root,id)?.action;
  return active(a)&&(a.stage==='entering'||
    (a.stage==='exiting'&&Array.isArray(a.exitWetPath)))&&a.fixtureId
    ?[a.fixtureId]:[];
};

export function canBeginPoolSwim(root,id,request){
  const actor=actorFor(root,id);
  return Boolean(RESIDENTS.includes(id)&&actor&&!actor.action&&
    !root.paused&&root.world&&!root.socialAction&&
    actor.needs.energy>=SWIM_START.energy&&
    actor.needs.bladder>=SWIM_START.bladder&&
    planPoolAdmission(root,id,request?.poolId,{
      jump:request?.actionId==='jump',fixtureId:request?.fixtureId||null}));
}

export function beginPoolSwim(root,id,request){
  if(!canBeginPoolSwim(root,id,request))return null;
  const actor=actorFor(root,id),plan=planPoolAdmission(root,id,request.poolId,{
    jump:request.actionId==='jump',fixtureId:request.fixtureId||null});
  if(!plan)return null;
  // D2a already validates the real route, exit, slot, fixture and current FIFO.
  const a={id:'swim',phase:'walking',stage:'approaching',automatic:false,
    elapsed:0,waterElapsed:0,waitElapsed:0,poolId:plan.poolId,
    fixtureId:plan.fixtureId,entryKind:plan.kind,slotId:plan.slot.slotId,
    slotCells:[...plan.slot.cells],slotAnchor:plan.slot.anchorCell,
    dryApproach:{...plan.dryApproach},waterCell:plan.wetPath[0],
    entryWetPath:[...plan.wetPath],wetPathIndex:0,wetProgress:0,
    laneIndex:0,laneDirection:1,revision:plan.revision,
    exitRequested:null,runId:id+':'+(root.actionQueues?.nextSeq||1)+':'+Math.round(root.minutes*100)};
  actor.action=a;
  actor.event='Идёт к бассейну';
  return {landPath:plan.landPath,action:a};
}

/** Called only after the EXISTING dry A* walker reaches the actual ladder/steps. */
export function arrivePoolApproach(root,id){
  const actor=actorFor(root,id),a=actor?.action;
  if(!active(a)||a.stage!=='approaching'||!validPoint(a.dryApproach)||
    Math.hypot(actor.position.x-a.dryApproach.x,
      actor.position.z-a.dryApproach.z)>.15)return false;
  a.stage='waiting';a.phase='using';a.waitElapsed=0;
  actor.event='Ждёт свободного входа';
  return true;
}
const validSwimShape=a=>active(a)&&STAGES.includes(a.stage)&&
  validPoolId(a.poolId)&&typeof a.fixtureId==='string'&&
  typeof a.slotId==='string'&&a.slotId.length<=64&&
  Array.isArray(a.slotCells)&&a.slotCells.length===8&&
  a.slotCells.every(validCell)&&new Set(a.slotCells).size===8&&
  validCell(a.slotAnchor)&&a.slotCells.includes(a.slotAnchor)&&
  validCell(a.waterCell)&&validPoint(a.dryApproach)&&
  Array.isArray(a.entryWetPath)&&a.entryWetPath.length>=1&&
  a.entryWetPath.length<=512&&a.entryWetPath.every(validCell)&&
  Number.isFinite(a.waterElapsed)&&a.waterElapsed>=0&&a.waterElapsed<=SWIM_MINUTES&&
  Number.isFinite(a.waitElapsed)&&a.waitElapsed>=0&&a.waitElapsed<=SWIM_MAX_WAIT_MINUTES&&
  Number.isFinite(a.elapsed)&&a.elapsed>=0&&a.elapsed<=1000&&
  Number.isSafeInteger(a.wetPathIndex)&&a.wetPathIndex>=0&&
  a.wetPathIndex<a.entryWetPath.length&&
  Number.isFinite(a.wetProgress)&&a.wetProgress>=0&&a.wetProgress<1&&
  Number.isSafeInteger(a.laneIndex)&&a.laneIndex>=0&&a.laneIndex<=512&&
  (a.laneDirection===1||a.laneDirection===-1)&&
  typeof a.runId==='string'&&a.runId.length<=96;

/** v1 optional data: structural restore only; topology is checked AFTER world load. */
export function sanitizeSwimAction(raw){
  if(!validSwimShape(raw)||(raw.automatic!==true&&raw.automatic!==false))return null;
  const a={...raw,automatic:raw.automatic===true,
    phase:raw.stage==='approaching'?'walking':'using',
    slotCells:[...raw.slotCells],entryWetPath:[...raw.entryWetPath],
    dryApproach:{...raw.dryApproach}};
  a.exitRequested=typeof raw.exitRequested==='string'?raw.exitRequested:null;
  return a;
}

/** Restore validates against current topology, fixture and the other swimmer.
 * If impossible, actor remains on a verified dry anchor, never stranded in water.
 */
export function validateRestoredPoolSwim(root,id){
  const actor=actorFor(root,id),a=actor?.action;
  if(!active(a))return true;
  const p=pool(root,a.poolId);
  const other=otherFor(root,id)?.action;
  const valid=validSwimShape(a)&&p&&a.slotCells.every(c=>p.cells.includes(c))&&
    p.cells.includes(a.waterCell)&&
    a.entryWetPath.every(c=>p.cells.includes(c))&&
    !a.slotCells.some(c=>active(other)&&other.slotCells?.includes(c))&&
    validPoint(a.dryApproach)&&isWalkable(a.dryApproach.x,a.dryApproach.z,root.world)&&
    (a.stage==='recovering'||entryOpen(root,a)||
      Boolean(planPoolExit(root.world,a.poolId,a.waterCell)));
  if(!valid){
    cleanup(root,id,'Плавание остановлено после загрузки: безопасное восстановление');
    return false;
  }
  // Saved exit routes are transient. Recompute against the RESTORED world,
  // rather than trusting unvalidated persisted waypoints or equipment tokens.
  if(a.stage==='exiting'){
    a.exitWetPath=null;a.wetPathIndex=0;a.wetProgress=0;
  }
  if(a.stage==='recovering'){
    const rescue=planPoolRecovery(root.world,a.poolId,a.waterCell);
    if(!rescue){cleanup(root,id,'Восстановление пути к суше');return false;}
    a.exitWetPath=rescue.waterPath;
    a.exitDryApproach=rescue.dryApproach;
    a.wetPathIndex=0;a.wetProgress=0;
  }
  if(a.stage==='approaching'&&!findPath(actor.position,a.dryApproach,root.world)){
    cleanup(root,id,'Подход к бассейну изменился');
    return false;
  }
  return true;
}

/** Work has an authoritative scene transition: no resident can swim while away.
 * Save the already credited need changes, release pool resources, keep dry anchor.
 */
export function interruptPoolSwimForWork(root,id){
  const actor=actorFor(root,id);
  if(!active(actor?.action))return false;
  cleanup(root,id,'Плавание прервано: пора на работу');
  return true;
}

/** Player abort, autonomy-mode switch or care request. A swimmer exits safely. */
export function requestPoolExit(root,id,reason='cancelled'){
  const a=actorFor(root,id)?.action;
  if(!active(a))return false;
  if(['approaching','waiting'].includes(a.stage)){
    cleanup(root,id,'Плавание отменено до входа');
  }else{
    a.exitRequested=reason;
    if(a.stage!=='recovering')a.stage='exiting';
    a.phase='using';a.waitElapsed=0;a.exitWetPath=null;
  }
  return true;
}

function recover(root,id,reason){
  const actor=actorFor(root,id),a=actor?.action;
  if(!active(a))return;
  // If a pool disappeared, the persisted actor is STILL dry; no phantom wet teleport.
  if(!pool(root,a.poolId)){
    cleanup(root,id,'Бассейн изменился — плавание прекращено');
    return;
  }
  const rescue=planPoolRecovery(root.world,a.poolId,a.waterCell);
  if(!rescue){
    cleanup(root,id,'Экстренное восстановление на суше');
    return;
  }
  a.stage='recovering';a.phase='using';
  a.exitRequested=reason;
  a.exitWetPath=[...rescue.waterPath];
  a.wetPathIndex=0;a.wetProgress=0;
  a.exitDryApproach={...rescue.dryApproach};
  actor.event='Безопасный выход из бассейна';
}
function travelWet(a,path,minutes,rate=.6){
  if(!Array.isArray(path)||!path.length)return true;
  // Progress over D2a 4-neighbour cell centres, never a coordinate jump.
  let budget=minutes;
  while(a.wetPathIndex<path.length-1&&budget>0){
    const remaining=(1-a.wetProgress)*rate;
    const step=Math.min(remaining,budget);
    budget-=step;a.wetProgress+=step/rate;
    if(a.wetProgress>=1-1e-9){
      a.wetPathIndex++;a.wetProgress=0;a.waterCell=path[a.wetPathIndex];
    }
  }
  return a.wetPathIndex>=path.length-1;
}
function laneTravel(root,a,minutes){
  // Actual path through the dedicated slot, not an arbitrary animation offset.
  const target=a.slotCells.at(-1);
  const path=findPoolWaterPath(root.world,a.poolId,a.slotAnchor,target);
  if(!path||!path.length)return false;
  const steps=Math.floor(a.wetProgress+minutes);
  a.wetProgress=(a.wetProgress+minutes)-steps;
  for(let i=0;i<steps;i++){
    a.laneIndex+=a.laneDirection;
    if(a.laneIndex>=path.length-1){a.laneIndex=path.length-1;a.laneDirection=-1;}
    if(a.laneIndex<=0){a.laneIndex=0;a.laneDirection=1;}
  }
  a.waterCell=path[a.laneIndex];
  return true;
}

/** Called by tickHousehold once per actual game-minute delta, after natural
 * need decay. Pause, x3 and reload all use the same source of elapsed minutes.
 */
export function advancePoolSwim(root,id,minutes){
  if(root?.paused||!Number.isFinite(minutes)||minutes<=0)return;
  const actor=actorFor(root,id),a=actor?.action;
  if(!active(a))return;
  const p=pool(root,a.poolId);
  if(!p||!a.slotCells.every(c=>p.cells.includes(c))){
    recover(root,id,'removed-pool');return;
  }
  // If needs become critical BEFORE entering water, remain safely dry.
  if(['approaching','waiting'].includes(a.stage)&&
    (actor.needs.energy<SWIM_START.energy||actor.needs.bladder<SWIM_START.bladder)){
    cleanup(root,id,'Плавание отменено: сначала отдохнуть или в туалет');
    return;
  }
  // Auto-off may arrive while still on dry land. Never reroute an already
  // cancelled, not-yet-entered person through a phantom wet exit.
  if(a.exitRequested&&['approaching','waiting'].includes(a.stage)){
    cleanup(root,id,'Плавание отменено до входа');
    return;
  }
  if(a.stage==='approaching'){
    if(!entryOpen(root,a)||!findPath(actor.position,a.dryApproach,root.world))
      cleanup(root,id,'Вход в бассейн стал недоступен');
    return;
  }
  if(actor.needs.energy<SWIM_EMERGENCY.energy||
    actor.needs.bladder<SWIM_EMERGENCY.bladder)
    a.exitRequested='urgent-needs';
  if(a.exitRequested&&!['exiting','recovering'].includes(a.stage)){
    a.stage='exiting';a.waitElapsed=0;a.exitWetPath=null;
  }
  if(a.stage==='waiting'){
    if(!entryOpen(root,a)){cleanup(root,id,'Вход в бассейн удалён');return;}
    if(otherFixture(root,id,a.fixtureId)){
      a.waitElapsed+=minutes;
      if(a.waitElapsed>=SWIM_MAX_WAIT_MINUTES)
        cleanup(root,id,'Время ожидания лестницы истекло');
      return;
    }
    a.stage='entering';a.elapsed=0;a.wetPathIndex=0;a.wetProgress=0;
    actor.event='Входит в бассейн';
    return;
  }
  if(a.stage==='entering'){
    if(!entryOpen(root,a)){recover(root,id,'lost-entry');return;}
    const before=a.elapsed;
    a.elapsed+=minutes;
    const entryDuration=a.entryKind==='steps'?3:2;
    if(a.elapsed<entryDuration)return;
    const wetMinutes=Math.max(0,a.elapsed-entryDuration)-
      Math.max(0,before-entryDuration);
    if(travelWet(a,a.entryWetPath,wetMinutes)){
      a.stage='swimming';a.elapsed=0;a.wetProgress=0;a.laneIndex=0;
      a.waterCell=a.slotAnchor;
      actor.event='Плавает';
    }
    return;
  }
  if(a.stage==='swimming'){
    // Removed/sealed final exits never strand swimmers for another 45 minutes.
    // A temporarily reserved shared ladder remains a valid exit, however.
    if(!poolAccessPoints(root.world,a.poolId).length){
      recover(root,id,'no-safe-exit');return;
    }
    const delta=Math.min(minutes,Math.max(0,SWIM_MINUTES-a.waterElapsed));
    if(delta>0){
      if(!laneTravel(root,a,delta)){recover(root,id,'lane-invalid');return;}
      a.waterElapsed+=delta;
      for(const [need,effect] of Object.entries(SWIM_EFFECTS))
        actor.needs[need]=clamp(actor.needs[need]+effect*delta/SWIM_MINUTES);
    }
    if(a.waterElapsed>=SWIM_MINUTES-1e-9){
      a.stage='exiting';a.elapsed=0;a.waitElapsed=0;a.exitWetPath=null;
      actor.event='Возвращается к выходу';
    }
    return;
  }
  if(a.stage==='exiting'){
    if(!Array.isArray(a.exitWetPath)){
      const plan=planPoolExit(root.world,a.poolId,a.waterCell,{
        blockedFixtureIds:otherBusyFixtures(root,id),
        blockedCells:occupiedCells(root,id)});
      if(!plan){
        a.waitElapsed+=minutes;
        if(a.waitElapsed>=SWIM_MAX_WAIT_MINUTES)recover(root,id,'unavailable-exit');
        return;
      }
      a.fixtureId=plan.fixtureId;
      a.exitWetPath=plan.waterPath;
      a.exitDryApproach=plan.dryApproach;
      a.wetPathIndex=0;a.wetProgress=0;a.elapsed=0;
    }
    if(otherFixture(root,id,a.fixtureId)){
      a.waitElapsed+=minutes;
      if(a.waitElapsed>=SWIM_MAX_WAIT_MINUTES)recover(root,id,'busy-exit');
      return;
    }
    if(!travelWet(a,a.exitWetPath,minutes))return;
    a.elapsed+=minutes;
    if(a.elapsed<2)return;
    cleanup(root,id,a.exitRequested?'Вышел из бассейна досрочно':'Завершил плавание',
      a.exitDryApproach);
    return;
  }
  if(a.stage==='recovering'){
    if(!travelWet(a,a.exitWetPath,minutes))return;
    cleanup(root,id,'Безопасно покинул бассейн',a.exitDryApproach);
  }
}
