/** QUEUE-RESCUE-R1: headless, deterministic social approach recovery.
 * It does not tick social effects, alter relationships or change save schema.
 * Guard state is session-local runtime data, never persisted.
 */
export const SOCIAL_WALK_STALL_MINUTES=45;
export const SOCIAL_WALK_PROGRESS_METERS=.075;
export function newSocialWalkGuard(){
  return {session:null,positions:null,stillMinutes:0};
}
function positionsOf(positions){
  if(!positions||!['alex','mira'].every(id=>
    Number.isFinite(positions[id]?.x)&&Number.isFinite(positions[id]?.z)))return null;
  return {alex:{x:positions.alex.x,z:positions.alex.z},
    mira:{x:positions.mira.x,z:positions.mira.z}};
}
/** Only a walking session can time out. Required-choice/using and pause are immune. */
export function inspectSocialWalk(guard,session,positions,deltaMinutes,{
  paused=false,partnerAway=false}={}){
  if(!guard||typeof guard!=='object')return null;
  const current=positionsOf(positions);
  if(!session||session.phase!=='walking'||!current){
    guard.session=null;guard.positions=null;guard.stillMinutes=0;return null;
  }
  if(guard.session!==session||!guard.positions){
    guard.session=session;guard.positions=current;guard.stillMinutes=0;
    return partnerAway?'partner-away':null;
  }
  if(partnerAway)return 'partner-away';
  if(paused||!Number.isFinite(deltaMinutes)||deltaMinutes<=0)return null;
  const advanced=['alex','mira'].some(id=>Math.hypot(
    current[id].x-guard.positions[id].x,current[id].z-guard.positions[id].z)
    >=SOCIAL_WALK_PROGRESS_METERS);
  if(advanced){
    guard.positions=current;guard.stillMinutes=0;return null;
  }
  guard.stillMinutes+=deltaMinutes;
  return guard.stillMinutes>=SOCIAL_WALK_STALL_MINUTES?'no-approach-progress':null;
}
/** Preserve an accepted manual social intent if its walk cannot be completed.
 * Restart as a fresh FIFO entry; an aborted walk has NO social receipts/XP.
 */
export function recoverableSocialCommand(session){
  if(!session||session.automatic===true||!['alex','mira'].includes(session.initiator)||
    !['alex','mira'].includes(session.partner)||session.initiator===session.partner)
    return null;
  const targetId=session.partner;
  if(session.conversation?.topic)
    return {type:'conversation',targetId,topicId:session.conversation.topic};
  if(session.branchAction?.id)
    return {type:'branch',targetId,actionId:session.branchAction.id};
  if(session.shared?.mode&&session.shared?.choiceId)
    return {type:'shared',targetId,mode:session.shared.mode,
      choiceId:session.shared.choiceId,
      ...(session.shared.targetInstanceId?{targetInstanceId:session.shared.targetInstanceId}:{})};
  if(session.kind==='talk'||session.kind==='argue')
    return {type:'social',targetId,actionId:session.kind};
  return null;
}
