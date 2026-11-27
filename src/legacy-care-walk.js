/** Bounded recovery for Alex/Mira's simple single-leg household walks.
 * Multi-stage activities, work and social sessions retain their own lifecycle.
 * Only session-local QSK guard state; canonical saved FIFO owns parked intent.
 */
import {findPath,isClearLine} from './navigation.js';
import {residentSegmentClear} from './resident-activity-runtime.js';
import {parkInterruptedAction} from './action-queue.js';
import {inspectWalkingAction,resetWalkGuard} from './qsk-07-fairness.js';

const SIMPLE_CARE=new Set(['bed','fridge','shower','toilet','sofa','move']);
export function isLegacyCareWalk(action){
  return action?.phase==='walking'&&SIMPLE_CARE.has(action.id);
}
export function legacyCareArrivalClear(root,id,actor,goal){
  return Boolean(goal&&Math.hypot(actor.position.x-goal.x,actor.position.z-goal.z)<.065&&
    isClearLine(actor.position,goal,root.world)&&
    residentSegmentClear(root,id,actor.position,goal,{additionalOnly:true}));
}
export function recoverableLegacyCareCommand(action){
  if(!isLegacyCareWalk(action)||action.automatic===true)return null;
  if(action.id==='move')return {type:'move',x:action.goal?.x,z:action.goal?.z};
  return {type:'object',actionId:action.id,
    ...(action.targetInstanceId?{targetInstanceId:action.targetInstanceId}:{}),
    ...(action.id==='shower'&&action.showerSinging===true?{showerSinging:true}:{})};
}
/** Observe only actual active game minutes. Reroute on a bounded new stall,
 * not on every blocked frame. A manual action is released ONLY after its
 * validated command is durably represented in the existing review tray.
 */
export function recoverLegacyCareWalk(root,id,actor,guard,goal,minutes,{routeValid=true}={}){
  const action=actor.action;
  if(!isLegacyCareWalk(action)){resetWalkGuard(guard);return {status:'inactive'};}
  if(root.paused||!Number.isFinite(minutes)||minutes<=0)return {status:'suspended'};
  const previous=guard.stalls;
  const outcome=inspectWalkingAction(guard,action,actor.position,minutes,root.minutes,{routeValid});
  if(outcome==='exhausted'||outcome==='invalid-position'){
    if(action.automatic!==true){
      const command=recoverableLegacyCareCommand(action);
      if(!command||!parkInterruptedAction(root.actionQueues,id,command,'unreachable-route',root.minutes)){
        // Invalid coordinates can otherwise report every frame. Back off as
        // for full-tray exhaustion; retain the exact active player intent.
        guard.retryAt=Math.max(guard.retryAt||0,root.minutes+8);
        return {status:'retained'};
      }
    }
    actor.action=null;actor.activitySession=null;
    actor.event=action.automatic===true?'Маршрут недоступен':'Маршрут недоступен; задание отложено';
    if(action.automatic===true)actor.autonomy.nextAt=Math.max(root.minutes+4,actor.autonomy.nextAt||0);
    resetWalkGuard(guard);
    return {status:action.automatic===true?'cancelled':'parked'};
  }
  if(outcome==='backoff'&&guard.stalls>previous&&goal){
    const clear=(a,b)=>residentSegmentClear(root,id,a,b,{additionalOnly:true});
    const points=findPath(actor.position,goal,root.world,clear);
    if(points&&(!points.length||isClearLine(actor.position,points[0],root.world)&&clear(actor.position,points[0])))
      return {status:'rerouted',points};
  }
  return {status:outcome};
}
