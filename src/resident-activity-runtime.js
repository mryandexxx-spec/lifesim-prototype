/**
 * CAS-01.4: bounded headless simulation adapter for saved additional adults.
 * No renderer, career, inventory or household finance ownership is duplicated.
 * Alex/Mira keep their established visual/social pipelines; additional actors
 * use the same root clock, typed persistent FIFO and world A* geometry.
 */
import {ACTIONS,chooseAction,arrive,tick,evaluateAutonomy} from './simulation.js';
import {ACTOR_RADIUS,findPath,isWalkable,isClearLine,nearestWalkable} from './navigation.js';
import {resolveActionFurniture,furnitureActionApproach} from './furniture-catalog.js';
import {BED_SLOT_IDS,BED_SLOTS,validBedSlot} from './bed-layout.js';
import {furniturePoint} from './furniture-transform.js';
import {dispatchActionQueues,pendingActions,queueHeads} from './action-queue.js';

export const ADDITIONAL_OBJECT_ACTIONS=Object.freeze([
  'bed','sofa','fridge','shower','toilet','seat','tv','mirror','dresser','wardrobe'
]);
// CAS-01.5: only core, physically verified self-care runs autonomously.
// The remaining objects stay manual; career, social, food inventory and hobbies
// require their own N-resident household settlement stages.
export const ADDITIONAL_AUTONOMOUS_ACTIONS=Object.freeze([
  'fridge','bed','shower','toilet','sofa','tv','mirror'
]);
const owned=(v,k)=>Object.prototype.hasOwnProperty.call(v||{},k);
const extraPattern=/^resident_(?:[3-9]|[1-9][0-9]{1,7})$/;
const gap=ACTOR_RADIUS*2-.015;
const preparedRoots=new WeakSet();
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const extraEntries=root=>Object.entries(root?.population?.residentsById||{})
  .filter(([id,entry])=>extraPattern.test(id)&&entry?.id===id&&entry?.actor?.version===1)
  .sort(([a],[b])=>Number(a.slice(9))-Number(b.slice(9)));

export function residentIdsForSimulation(root){
  const dwelling=root?.population?.linksByResident?.alex?.dwellingId;
  return ['alex','mira',...extraEntries(root).filter(([id])=>
    root.population.linksByResident?.[id]?.dwellingId===dwelling).map(([id])=>id)];
}
export function savedAdditionalActor(root,id){
  return extraPattern.test(id)&&owned(root?.population?.residentsById,id)
    ?root.population.residentsById[id]?.actor??null:null;
}
const actors=root=>residentIdsForSimulation(root).map(id=>[
  id,id==='alex'?root:id==='mira'?root.otherSim:savedAdditionalActor(root,id)
]).filter(([,actor])=>actor?.position);
const others=(root,id)=>actors(root).filter(([other])=>other!==id);
const segmentDistance=(p,a,b)=>{
  const dx=b.x-a.x,dz=b.z-a.z,scale=dx*dx+dz*dz;
  const t=scale<1e-12?0:Math.max(0,Math.min(1,
    ((p.x-a.x)*dx+(p.z-a.z)*dz)/scale));
  return distance(p,{x:a.x+dx*t,z:a.z+dz*t});
};
export function residentCollisionFree(root,id,point){
  if(!Number.isFinite(point?.x)||!Number.isFinite(point?.z))return false;
  return others(root,id).every(([other,actor])=>{
    const phase=root?.careerSystem?.byResident?.[other]?.currentShift?.phase;
    return ['working','waiting'].includes(phase)||distance(actor.position,point)>=gap;
  });
}
export function residentSegmentClear(root,id,from,to,{additionalOnly=false}={}){
  if(!Number.isFinite(from?.x)||!Number.isFinite(to?.x))return false;
  return others(root,id).every(([other,actor])=>{
    if(additionalOnly&&!extraPattern.test(other))return true;
    const phase=root?.careerSystem?.byResident?.[other]?.currentShift?.phase;
    return ['working','waiting'].includes(phase)||
      segmentDistance(actor.position,from,to)>=gap;
  });
}
/** A legacy action cannot steal an additional resident's occupied resource. */
export function extraReservesFurniture(root,itemId,instanceId){
  for(const id of residentIdsForSimulation(root).slice(2)){
    const a=savedAdditionalActor(root,id)?.action;
    if(!a)continue;
    if(['fridge','cook','dining'].includes(itemId)&&a.id==='fridge')return true;
    if(itemId==='sofa'&&a.id==='tv'&&a.watchSeatInstanceId===instanceId)return true;
    if(a.id==='bed')continue; // bed halves have independent reservations
    if(a.targetInstanceId===instanceId)return true;
  }
  return false;
}
/** Lookup is independent of player selection; no assignment by list index. */
export function chosenAdditionalBedSlot(root,id,instanceId){
  const actor=savedAdditionalActor(root,id);
  if(!actor)return null;
  const taken=new Set();
  for(const [other,peer] of others(root,id)){
    const action=peer.action;
    if(action?.id!=='bed'||!validBedSlot(action.bedSlot))continue;
    const bed=resolveActionFurniture(root.world,'bed',action.targetInstanceId);
    if(bed?.instanceId===instanceId)taken.add(action.bedSlot);
  }
  const bed=resolveActionFurniture(root.world,'bed',instanceId);
  if(!bed)return null;
  if(actor.action?.id==='bed'&&actor.action.targetInstanceId===instanceId&&
    validBedSlot(actor.action.bedSlot)&&!taken.has(actor.action.bedSlot))
    return actor.action.bedSlot;
  let winner=null,cost=Infinity;
  const origin=nearestWalkable(actor.position,root.world);
  for(const slot of BED_SLOT_IDS){
    if(taken.has(slot))continue;
    const goal=furniturePoint(root.world,'bed',BED_SLOTS[slot].approach,instanceId);
    const path=goal&&findPath(origin,goal,root.world);
    if(!path)continue;
    let length=0,last=origin;
    for(const next of path){length+=distance(last,next);last=next;}
    if(length<cost){winner=slot;cost=length;}
  }
  return winner;
}
function actionGoal(root,action){
  if(action.id==='move')return action.goal;
  if(action.id==='bed')return validBedSlot(action.bedSlot)
    ?furniturePoint(root.world,'bed',BED_SLOTS[action.bedSlot].approach,action.targetInstanceId)
    :null;
  return furnitureActionApproach(root.world,action.id,action.targetInstanceId);
}
export function validAdditionalAction(action){
  if(action===null)return true;
  if(!action||typeof action!=='object'||Array.isArray(action)||
    !['walking','using'].includes(action.phase)||typeof action.automatic!=='boolean'||
    !Number.isFinite(action.elapsed)||action.elapsed<0||action.elapsed>1000)return false;
  if(action.id==='move')return action.automatic===false&&
    action.phase==='walking'&&
    Number.isFinite(action.goal?.x)&&Number.isFinite(action.goal?.z);
  if(action.automatic&&(!ADDITIONAL_AUTONOMOUS_ACTIONS.includes(action.id)||
    (action.id==='mirror'&&action.mirrorPractice!==true)))return false;
  if(!ADDITIONAL_OBJECT_ACTIONS.includes(action.id)||
    typeof action.targetInstanceId!=='string')return false;
  if(action.id==='bed'&&!validBedSlot(action.bedSlot))return false;
  return true;
}
function furnitureFree(root,id,actionId,instanceId,bedSlot=null){
  for(const [other,actor] of others(root,id)){
    const action=actor.action;
    if(!action)continue;
    if(actionId==='bed'){
      if(action.id==='bed'&&action.bedSlot===bedSlot){
        const bed=resolveActionFurniture(root.world,'bed',action.targetInstanceId);
        if(bed?.instanceId===instanceId)return false;
      }
      continue;
    }
    if(actionId==='fridge'&&(
      ['fridge','cook'].includes(action.id)||
      action.id==='dining'&&['toFridge','taking'].includes(action.diningStage)))return false;
    if(actionId==='sofa'&&action.id==='tv'&&
      action.watchSeatInstanceId===instanceId)return false;
    if(actionId==='seat'&&action.id==='dining'&&action.diningSeatInstanceId===instanceId)
      return false;
    if(actionId==='tv'&&action.id==='tv'&&action.targetInstanceId===instanceId)
      return false; // no seat assignment in the headless adapter
    const physical=resolveActionFurniture(root.world,action.id,action.targetInstanceId);
    if(physical?.instanceId===instanceId)return false;
    if(action.targetInstanceId===instanceId)return false;
  }
  return true;
}
function prepareCommand(root,id,command){
  const actor=savedAdditionalActor(root,id);
  if(!actor||actor.action)return null;
  if(command.type==='move'){
    const goal={x:command.x,z:command.z};
    return isWalkable(goal.x,goal.z,root.world)&&
      findPath(actor.position,goal,root.world)
      ?{id:'move',goal}:null;
  }
  if(command.type!=='object'||!ADDITIONAL_OBJECT_ACTIONS.includes(command.actionId))
    return null; // later CAS-01.5 handles social, hobbies, career and advanced objects
  const item=resolveActionFurniture(root.world,command.actionId,
    command.targetInstanceId||null);
  if(!item)return null;
  const slot=command.actionId==='bed'
    ?chosenAdditionalBedSlot(root,id,item.instanceId):null;
  if(command.actionId==='bed'&&!slot)return null;
  if(!furnitureFree(root,id,command.actionId,item.instanceId,slot))return null;
  const candidate={id:command.actionId,targetInstanceId:item.instanceId,
    ...(slot?{bedSlot:slot}:{})};
  const goal=actionGoal(root,candidate);
  return goal&&findPath(actor.position,goal,root.world)?candidate:null;
}
/** Manual FIFO always has priority. An automatic action never consumes a
 * queue entry or changes another resident's intent.
 */
function startPlannedObject(root,id,plan,automatic){
  const actor=savedAdditionalActor(root,id);
  if(!actor||actor.action||!furnitureFree(root,id,plan.id,
    plan.targetInstanceId,plan.bedSlot||null))return false;
  if(!chooseAction(actor,plan.id,automatic))return false;
  Object.assign(actor.action,{targetInstanceId:plan.targetInstanceId,
    ...(plan.bedSlot?{bedSlot:plan.bedSlot}:{}),
    ...(automatic&&plan.id==='mirror'?{mirrorPractice:true}:{})});
  return true;
}
export function dispatchAdditionalResidentQueues(root){
  if(!root?.population||root.paused||!root.actionQueues)return [];
  const ids=new Set(residentIdsForSimulation(root).slice(2));
  const prepared=new Map();
  return dispatchActionQueues(root.actionQueues,{
    canStart(id,command){
      if(!ids.has(id)||['departing','waiting','working','returning'].includes(
        root.careerSystem?.byResident?.[id]?.currentShift?.phase)||root.socialAction||
        [root.additionalSocial?.initiator,root.additionalSocial?.partner].includes(id))return false;
      const plan=prepareCommand(root,id,command);
      if(!plan)return false;
      prepared.set(id,plan);return true;
    },
    start(id,command){
      const actor=savedAdditionalActor(root,id),plan=prepared.get(id);
      if(!actor||!plan||!prepareCommand(root,id,command))return false;
      if(plan.id==='move'){
        actor.action={id:'move',phase:'walking',elapsed:0,automatic:false,goal:plan.goal};
        actor.event='Идёт в выбранное место';
      }else{
        if(!startPlannedObject(root,id,plan,false))return false;
      }
      return true;
    }
  });
}
/** Coordinates are shared with legacy scene residents. No intersection with
 * furniture (static A*) or another actor's swept collision disc is accepted.
 */
function advanceExtraPosition(root,id,actor,goal,minutes){
  if(!isWalkable(goal?.x,goal?.z,root.world))return false;
  const path=findPath(actor.position,goal,root.world);
  if(!path)return false;
  const budget=Math.min(2,Math.max(0,minutes*2.2));
  let remaining=budget;
  for(const next of path){
    if(remaining<=.0001)break;
    const d=distance(actor.position,next);
    if(d<.0001)continue;
    const step=Math.min(d,remaining);
    const point={x:actor.position.x+(next.x-actor.position.x)*step/d,
      z:actor.position.z+(next.z-actor.position.z)*step/d};
    if(!isClearLine(actor.position,point,root.world))return false;
    if(!residentSegmentClear(root,id,actor.position,point)){
      // Choose a safe perpendicular bypass only if A* still reaches the goal.
      const ux=(next.x-actor.position.x)/d,uz=(next.z-actor.position.z)/d;
      const alternatives=[1,-1].map(side=>({
        x:actor.position.x-uz*side*step,z:actor.position.z+ux*side*step}));
      const detour=alternatives.find(p=>isWalkable(p.x,p.z,root.world)&&
        isClearLine(actor.position,p,root.world)&&
        residentSegmentClear(root,id,actor.position,p)&&
        findPath(p,goal,root.world));
      if(detour){actor.position=detour;remaining-=step;}
      break;
    }
    actor.position=point;
    remaining-=step;
    // Never jump across an unverified A* corner inside one simulation tick.
    // The next step replans from this precise collision-free location.
    break;
  }
  return true;
}
/** Migrate legacy inert snapshots to collision-free physical starts, without
 * changing their IDs, identities, budgets or clock. No new resident is created.
 */
export function prepareAdditionalResidents(root){
  if(!root?.population)return;
  const ids=residentIdsForSimulation(root).slice(2);
  for(const id of ids){
    const actor=savedAdditionalActor(root,id);
    actor.minutes=root.minutes;
    actor.paused=root.paused;
    actor.speed=root.speed;
    actor.autonomy.enabled=root.autonomy.enabled;
    if(!Number.isFinite(actor.autonomy.nextAt))
      actor.autonomy.nextAt=root.minutes;
    if(!root.autonomy.enabled&&actor.action?.automatic){
      actor.action=null;
      actor.event='Ждёт указаний';
    }
    if(!isWalkable(actor.position.x,actor.position.z,root.world)||
      !residentCollisionFree(root,id,actor.position)){
      const start=nearestWalkable(actor.position,root.world);
      const candidates=[start];
      for(let radius=.55;radius<=2.75;radius+=.55){
        for(let k=0;k<16;k++){
          const theta=k*Math.PI/8;
          candidates.push({x:start.x+Math.cos(theta)*radius,
            z:start.z+Math.sin(theta)*radius});
        }
      }
      const safe=candidates.find(p=>isWalkable(p.x,p.z,root.world)&&
        residentCollisionFree(root,id,p)&&findPath(start,p,root.world));
      if(safe)actor.position=safe;
      else {actor.action=null;actor.event='Нет безопасного места для жителя';}
    }
    if(actor.action){
      const goal=actionGoal(root,actor.action);
      if(!validAdditionalAction(actor.action)||!goal||
        !findPath(actor.position,goal,root.world)||
        (actor.action.id!=='move'&&!furnitureFree(root,id,actor.action.id,
          actor.action.targetInstanceId,actor.action.bedSlot||null)))
        {actor.action=null;actor.event='Маршрут или предмет недоступен';}
    }
  }
}
/** CAS-01.5: use the SAME pure, personality-aware scoring kernel as the
 * original residents. No free needs, fabricated social rewards or hidden
 * purchases; each decision must obtain a real reachable resource first.
 * Failed reservations retry after a small game-time cooldown, so fast frame
 * loops cannot spin on a missing item.
 */
export function startAdditionalResidentAutonomy(root,id){
  if(!root?.autonomy?.enabled||root.paused||root.socialAction||
    root.phoneCalls?.active||
    [root.additionalSocial?.initiator,root.additionalSocial?.partner].includes(id)||
    queueHeads(root.actionQueues).some(({command})=>
      ['social','branch'].includes(command.type)&&command.targetId===id)||
    !residentIdsForSimulation(root).slice(2).includes(id)||
    ['departing','waiting','working','returning'].includes(
      root.careerSystem?.byResident?.[id]?.currentShift?.phase)||
    pendingActions(root.actionQueues,id).length)return false;
  const actor=savedAdditionalActor(root,id);
  if(!actor||actor.action)return false;
  actor.autonomy.enabled=root.autonomy.enabled;
  actor.minutes=root.minutes;
  // Deterministic reason-coded utility order is shared with Alex/Mira.
  // Inspect actual reservations AND A* reachability for every candidate:
  // an occupied fridge cannot suppress a different urgent reachable need.
  // Manual FIFO, work and social gates above always preempt this loop.
  const evaluation=evaluateAutonomy(actor);
  if(evaluation.blocked)return false;
  for(const candidate of evaluation.candidates){
    if(candidate.score<=0||!ADDITIONAL_AUTONOMOUS_ACTIONS.includes(candidate.id))
      continue;
    let plan=prepareCommand(root,id,{type:'object',actionId:candidate.id});
    // The physical TV is an alternative ONLY to a valid leisure wish.
    if(!plan&&candidate.id==='sofa')
      plan=prepareCommand(root,id,{type:'object',actionId:'tv'});
    if(plan&&startPlannedObject(root,id,plan,true))return true;
  }
  // Mirror practice needs a real installed, free and reachable fixture;
  // it never simulates a conversation, relationship or free reward.
  if(Number.isFinite(actor.needs.social)&&actor.needs.social<35){
    const mirror=prepareCommand(root,id,{type:'object',actionId:'mirror'});
    if(mirror&&startPlannedObject(root,id,mirror,true))return true;
  }
  actor.autonomy.nextAt=Math.max(root.minutes+2,actor.autonomy.nextAt||0);
  return false;
}
/** Additional people share the canonical clock and core need tick. They
 * neither own nor settle household career, social, finance or inventory.
 */
export function tickAdditionalResidents(root,minutes){
  if(!root?.population||root.paused||!Number.isFinite(minutes)||minutes<=0)return;
  if(!preparedRoots.has(root)){
    prepareAdditionalResidents(root);
    preparedRoots.add(root);
  }
  for(const id of residentIdsForSimulation(root).slice(2)){
    const actor=savedAdditionalActor(root,id);
    actor.minutes=root.minutes-minutes;
    actor.paused=false;actor.speed=root.speed;
    actor.autonomy.enabled=root.autonomy.enabled;
    // Away workers never receive a second home-need tick, A* step or FIFO
    // action. Their work needs were advanced by the canonical career sweep.
    if(['departing','waiting','working','returning'].includes(
      root.careerSystem?.byResident?.[id]?.currentShift?.phase)){
      actor.action=null;actor.activitySession=null;
      actor.minutes=root.minutes;
      continue;
    }
    // Newly queued manual commands interrupt only this resident's automatic
    // routine. Blocked FIFO heads still suppress autonomous replacements.
    if(actor.action?.automatic&&
      (!root.autonomy.enabled||pendingActions(root.actionQueues,id).length)){
      actor.action=null;
      actor.event='Ждёт следующего действия';
      actor.autonomy.nextAt=Math.max(root.minutes+7,actor.autonomy.nextAt||0);
    }
    const action=actor.action;
    if(action&&action.id!=='move'){
      const goal=actionGoal(root,action);
      if(!goal||!furnitureFree(root,id,action.id,action.targetInstanceId,
        action.bedSlot||null)||
        (action.phase==='using'&&distance(actor.position,goal)>.4)){
        actor.action=null;actor.event='Предмет или место недоступны';
      }
    }
    if(actor.action?.phase==='walking'){
      const goal=actionGoal(root,actor.action);
      if(!goal||!advanceExtraPosition(root,id,actor,goal,minutes)){
        actor.action=null;actor.event='Маршрут недоступен';
      }else if(distance(actor.position,goal)<.065){
        actor.position={x:goal.x,z:goal.z};
        if(actor.action.id==='move'){actor.action=null;actor.event='Пришёл в выбранное место';}
        else arrive(actor);
      }
    }
    tick(actor,minutes,root.world);
    actor.minutes=root.minutes;
  }
  // Dispatch manual heads before considering a new autonomous action.
  // Both paths recheck reservation/physical A* access at actual start.
  dispatchAdditionalResidentQueues(root);
  for(const id of residentIdsForSimulation(root).slice(2))
    startAdditionalResidentAutonomy(root,id);
}
