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

/** PF-15: transient, episode-scoped household speed. The saved speed is
 * the player's preference; automatic x3 is never serialized. */
import {residentIdsForSimulation,savedAdditionalActor} from './resident-activity-runtime.js';
import {pendingWorkIncident} from './career-incidents.js';
import {dialogueNeedsDecision} from './dialogue-decision.js';

export function householdIdleEpisode(root){
  if(!root)return null;
  const ids=residentIdsForSimulation(root).filter(id=>id!=='mira'||root.otherSim);
  if(!ids.length)return null;
  const modes=ids.map(id=>{
    const actor=id==='alex'?root:id==='mira'?root.otherSim:savedAdditionalActor(root,id);
    if(!actor)return null;
    const phase=root.careerSystem?.byResident?.[id]?.currentShift?.phase;
    if(phase==='working')return 'work';
    if(phase)return null;
    return actor.action?.id==='bed'&&actor.action.phase==='using'?'sleep':null;
  });
  return modes[0]&&modes.every(mode=>mode===modes[0])?modes[0]:null;
}

export function createHouseholdSpeedController(){
  const episodes=new WeakMap();
  function state(root){
    let previous=episodes.get(root);
    const episode=householdIdleEpisode(root);
    if(!previous){previous={episode:null,override:false,owned:false};episodes.set(root,previous);}
    if(previous.episode!==episode){
      if(previous.owned&&!previous.override)root.speed=1;
      previous.episode=episode;previous.override=false;previous.owned=false;
    }
    return previous;
  }
  function read(root,{blocked=false}={}){
    const current=state(root),manual=root.speed===3?3:1;
    if(!current.episode||current.override)return manual;
    if(blocked||root.paused||dialogueNeedsDecision(root)||root.socialAction||root.additionalSocial||
      residentIdsForSimulation(root).some(id=>pendingWorkIncident(root,id)))return manual;
    current.owned=true;
    return SLEEP_FAST_FORWARD_SPEED;
  }
  function toggle(root,options={}){
    const next=read(root,options)===3?1:3;
    const current=state(root);
    current.override=Boolean(current.episode);current.owned=false;
    root.speed=next;
    return next;
  }
  return {read,toggle};
}
