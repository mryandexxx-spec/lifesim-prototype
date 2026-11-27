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
  if(blocked||!root||root.paused||root.socialAction||root.additionalSocial||
     householdIdleEpisode(root)!=='sleep'||sleepBoostBlocked(root))return playerSpeed;
  return SLEEP_FAST_FORWARD_SPEED;
}

/** PF-15: transient, episode-scoped household speed. The saved speed is
 * the player's preference; automatic x3 is never serialized. */
import {residentIdsForSimulation,savedAdditionalActor} from './resident-activity-runtime.js';
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
    if(phase&&phase!=='pending')return null;
    return actor.action?.id==='bed'&&actor.action.phase==='using'?'sleep':null;
  });
  return modes.every(Boolean)?(modes.every(mode=>mode===modes[0])?modes[0]:'mixed'):null;
}

function sleepBoostBlocked(root){
  return residentIdsForSimulation(root).some(id=>{
    const actor=id==='alex'?root:id==='mira'?root.otherSim:savedAdditionalActor(root,id);
    if(actor?.action?.id!=='bed'||actor.action.phase!=='using'||
      root.careerSystem?.byResident?.[id]?.currentShift?.phase==='working')return false;
    if(root.actionQueues&&pendingActions(root.actionQueues,id).length>0)return true;
    const contract=root.careerSystem?.byResident?.[id];
    if(!contract||!root.calendar||!Number.isFinite(root.minutes))return false;
    const upcoming=nextCareerShift(root.calendar,contract,root.minutes);
    return Boolean(upcoming&&upcoming.start-root.minutes<=SLEEP_WORK_WARNING_MINUTES);
  });
}

export function createHouseholdSpeedController(){
  const episodes=new WeakMap();
  function state(root){
    let previous=episodes.get(root);
    const episode=householdIdleEpisode(root);
    if(!previous){previous={episode:null,override:false,owned:false};episodes.set(root,previous);}
    if(Boolean(previous.episode)!==Boolean(episode)){
      if(previous.owned&&!previous.override)root.speed=1;
      previous.override=false;previous.owned=false;
    }
    previous.episode=episode;
    return previous;
  }
  function read(root,{blocked=false}={}){
    const current=state(root),manual=root.speed===3?3:1;
    if(!current.episode||current.override)return manual;
    // Work incidents are optional phone choices with automatic end-of-shift resolution.
    // Mandatory dialogue/modal decisions still stop fast-forward.
    if(blocked||root.paused||dialogueNeedsDecision(root)||root.socialAction||root.additionalSocial||
      (current.episode!=='work'&&sleepBoostBlocked(root)))return manual;
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
