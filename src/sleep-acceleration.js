/** Q3b: transient fast-forward while every resident is physically asleep.
 * Never mutate the saved speed or clock; game.js samples the returned step
 * multiplier before EACH fixed simulation tick. PlayCanvas-independent.
 */
import {nextCareerShift} from './career-scheduler.js';
import {pendingActions} from './action-queue.js';

export const SLEEP_FAST_FORWARD_SPEED=3;
export const SLEEP_WORK_WARNING_MINUTES=60;
export function effectiveSleepSpeed(root,{blocked=false}={}){
  const playerSpeed=root?.speed===3?3:1;
  if(blocked||!root||root.paused||root.socialAction||!root.otherSim||
     !root.actionQueues||!Number.isFinite(root.minutes))return playerSpeed;
  for(const id of ['alex','mira']){
    const actor=id==='alex'?root:root.otherSim;
    if(actor?.action?.id!=='bed'||actor.action.phase!=='using'||
       pendingActions(root.actionQueues,id).length>0)return playerSpeed;
    const contract=root.careerSystem?.byResident?.[id];
    const shift=contract?.currentShift;
    // A pending work departure/choice must never race ahead at 3x.
    if(shift?.phase)return playerSpeed;
    if(shift?.incident&&!shift.incident.choiceId)return playerSpeed;
    if(contract&&root.calendar){
      const upcoming=nextCareerShift(root.calendar,contract,root.minutes);
      if(upcoming&&upcoming.start-root.minutes<=SLEEP_WORK_WARNING_MINUTES)
        return playerSpeed;
    }
  }
  return SLEEP_FAST_FORWARD_SPEED;
}
