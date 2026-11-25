/**
 * CAS-01.5-social — headless N-resident social rendezvous.
 * One existing household clock/queue/graph. No visual actors, new wallets,
 * automatic intimacy, private NPC identity inference or free social rewards.
 */
import {residentIdsForSimulation,savedAdditionalActor,residentSegmentClear} from './resident-activity-runtime.js';
import {enqueueAction,pendingActions,queueHeads} from './action-queue.js';
import {findPath,isWalkable,isClearLine} from './navigation.js';
import {registerPerson,setLifeStage,addFamilyLink,restoreSocialGraph,
  availableSocialActions,resolveBranchResponse,applySocialEvent,
  getDirectedView,relationSummary} from './social-graph.js';
import {evaluateSocialReaction} from './social-reactions.js';
import {creditCompletedSocialNeed} from './social-need.js';
import {feelMemory} from './emotion-engine.js';
import {refreshMind} from './psychology.js';
import {createConversation,restoreConversation,conversationOutcome,CONVERSATION_TOPICS} from './conversation-engine.js';
import {learnSocialPreference,learnSocialCue} from './social-graph.js';
import {CONVERSATION_DISCOVERY_TAGS} from './social-compatibility.js';
import {cueFromAnswer} from './social-boundaries.js';
import {dialogueNeedsDecision} from './dialogue-decision.js';

export const ADDRESSED_SOCIAL_SCHEMA=1;
export const ADDRESSED_SOCIAL_DURATION=18;
// Complex paired props, physical affection and relationship milestones
// remain with the existing fully staged renderer until CAS-01.7/02.
export const ADDRESSED_BRANCHES=Object.freeze([
  'acquaint.introduce','acquaint.chat','friend.tease','friend.confide',
  'rival.taunt','rival.truce','romance.flirt','romance.confess'
]);
const legacy=id=>id==='alex'||id==='mira';
const actor=(root,id)=>id==='alex'?root:id==='mira'?root.otherSim:savedAdditionalActor(root,id);
const isExtra=id=>typeof id==='string'&&/^resident_(?:[3-9]|[1-9][0-9]{1,7})$/.test(id);
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const participating=(s,id)=>s&&(s.initiator===id||s.partner===id);
const validAction=actionId=>['talk','argue',...ADDRESSED_BRANCHES].includes(actionId);
// Sports currently has a separate legacy-pair match receipt; do not fabricate one for other pairs.
const validTopic=topic=>typeof topic==='string'&&topic!=='sports'&&Object.hasOwn(CONVERSATION_TOPICS,topic);
const validCommand=command=>command?.type==='conversation'?validTopic(command.topicId):validAction(command?.actionId);
const validPair=(root,a,b)=>Boolean(root?.population&&a!==b&&
  (isExtra(a)||isExtra(b))&&residentIdsForSimulation(root).includes(a)&&
  residentIdsForSimulation(root).includes(b)&&actor(root,a)?.position&&actor(root,b)?.position);
const available=(root,id)=>!['departing','working','waiting','returning'].includes(
  root?.careerSystem?.byResident?.[id]?.currentShift?.phase);
const canMeet=(root,a,b)=>validPair(root,a,b)&&available(root,a)&&available(root,b);
const allActors=root=>Object.fromEntries(residentIdsForSimulation(root)
  .map(id=>[id,actor(root,id)]).filter(([,p])=>p?.position));

/** Optional population IDs participate in the SAME canonical N-person graph.
 * Explicit kinship (not surname/familyId) is authoritative. Re-restoring
 * once after new family edges strips any now-invalid romantic saved bond.
 */
export function reconcileAdditionalSocialGraph(root){
  if(!root?.population||!root.socialGraph)return;
  const ids=['alex','mira',...Object.keys(root.population.residentsById||{})];
  for(const id of ids)registerPerson(root.socialGraph,id);
  for(const id of ids.slice(2))setLifeStage(root.socialGraph,id,'adult');
  for(const edge of root.population.kinship||[])
    addFamilyLink(root.socialGraph,edge.fromId,edge.toId,edge.type);
  root.socialGraph=restoreSocialGraph(root.socialGraph,ids);
}

/** ID-based peer picker for the later CAS-01.7 HUD.
 * Remote dwellings and nonexistent people cannot become phantom targets.
 */
export function addressedSocialPeers(root,initiator){
  if(!root?.population||!residentIdsForSimulation(root).includes(initiator))return [];
  return residentIdsForSimulation(root).filter(id=>id!==initiator).map(id=>{
    const person=actor(root,id);
    return {id,name:legacy(id)?id==='alex'?'Алекс':'Мира':
      root.population.residentsById[id].identity.firstName,
      ready:canMeet(root,initiator,id)&&!root.socialAction&&
        !root.additionalSocial&&!person.action&&!actor(root,initiator).action&&
        !pendingActions(root.actionQueues,id).length&&
        !pendingActions(root.actionQueues,initiator).length,
      relationship:relationSummary(root.socialGraph,initiator,id)};
  });
}
export function additionalSocialEngaged(root,id){
  return Boolean(participating(root?.additionalSocial,id));
}
/** Manual request goes through the existing validated persistent FIFO.
 * No queue acknowledgement, social graph mutation, memory or need reward yet.
 */
export function queueAddressedSocial(root,initiator,partner,actionId='talk'){
  if(!canMeet(root,initiator,partner)||!validAction(actionId)||
    !root.actionQueues||root.paused||
    (ADDRESSED_BRANCHES.includes(actionId)&&
      !actionAllowed(root,initiator,partner,actionId)))return null;
  const command=ADDRESSED_BRANCHES.includes(actionId)
    ?{type:'branch',targetId:partner,actionId}
    :{type:'social',targetId:partner,actionId};
  const receipt=enqueueAction(root.actionQueues,initiator,command);
  // A new explicit invitation outranks either participant's *automatic*
  // routine. Never cancel manual action, another session or somebody else's job.
  if(receipt)for(const id of [initiator,partner]){
    const person=actor(root,id);
    if(person?.action?.automatic){
      person.action=null;person.event='Ожидает социального действия';
    }
  }
  return receipt;
}
export function queueAddressedConversation(root,initiator,partner,topicId){
  if(!validTopic(topicId)||!canMeet(root,initiator,partner)||!root.actionQueues||dialogueNeedsDecision(root))return null;
  const receipt=enqueueAction(root.actionQueues,initiator,{type:'conversation',targetId:partner,topicId});
  if(receipt)for(const id of [initiator,partner]){
    const person=actor(root,id);
    if(person?.action?.automatic){person.action=null;person.event='Ожидает социального действия';}
  }
  return receipt;
}
const allowedBranch=(root,a,b,id)=>availableSocialActions(
  root.socialGraph,a,b,root.minutes).some(x=>x.id===id&&x.enabled);
const actionAllowed=(root,a,b,id)=>!ADDRESSED_BRANCHES.includes(id)||
  allowedBranch(root,a,b,id);
const canBegin=(root,id,command)=>{
  const peer=command?.targetId;
  if(!canMeet(root,id,peer)||root.paused||root.socialAction||
    root.additionalSocial||!validCommand(command)||!available(root,id)||
    !available(root,peer)||!actionAllowed(root,id,peer,command.actionId))return false;
  // Never hijack another person's manual work/queued action or active routine.
  if(actor(root,id).action||actor(root,peer).action||
    (command.type==='conversation'
      ?(pendingActions(root.actionQueues,peer)[0]?.seq??Infinity)<command.seq
      :pendingActions(root.actionQueues,peer).length))return false;
  return Boolean(approach(root,id,peer));
};
const reachable=(root,a,b,point)=>{
  if(!isWalkable(point.x,point.z,root.world)||
    !findPath(a.position,point,root.world))return false;
  // All other people retain their physical collision discs.
  return Object.entries(allActors(root)).every(([id,p])=>
    id===a.id||id===b.id||dist(p.position,point)>=.72);
};
function approach(root,sourceId,targetId){
  const a=actor(root,sourceId),b=actor(root,targetId);
  if(!a?.position||!b?.position)return null;
  const source={...a.position},target=b.position;
  if(!isWalkable(source.x,source.z,root.world)||
    !isWalkable(target.x,target.z,root.world))return null;
  const unobstructed=Object.entries(allActors(root)).every(([id,p])=>
    id===sourceId||id===targetId||
      dist(p.position,source)>=.72&&dist(p.position,target)>=.72);
  if(unobstructed&&dist(source,target)>=.76&&dist(source,target)<=1.5&&
    isClearLine(source,target,root.world))return source;
  const points=[];
  for(let i=0;i<16;i++){
    const angle=i*Math.PI/8;
    points.push({x:target.x+Math.cos(angle)*1.05,
      z:target.z+Math.sin(angle)*1.05});
  }
  return points.filter(p=>reachable(root,{...a,id:sourceId},{...b,id:targetId},p))
    .sort((p,q)=>dist(source,p)-dist(source,q))[0]||null;
}
/** Called after the normal FIFO/need ticks. A blocked HEAD stays put. */
export function dispatchAddressedSocial(root){
  if(!root?.population||root.paused||root.additionalSocial)return false;
  for(const {residentId,command} of queueHeads(root.actionQueues)){
    if(!['social','branch','conversation'].includes(command.type)||!isExtra(residentId)&&
      !isExtra(command.targetId)||!canBegin(root,residentId,command))continue;
    const head=pendingActions(root.actionQueues,residentId);
    if(head[0]?.seq!==command.seq)continue;
    root.additionalSocial={schema:ADDRESSED_SOCIAL_SCHEMA,seq:command.seq,
      initiator:residentId,partner:command.targetId,actionId:command.type==='conversation'?'talk':command.actionId,
      phase:'walking',elapsed:0,createdAt:root.minutes,
      ...(command.type==='conversation'?{conversation:createConversation(command.topicId)}:{})};
    head.shift();
    actor(root,residentId).event='Идёт к собеседнику';
    actor(root,command.targetId).event='Ожидает разговора';
    return true; // only one shared social lock
  }
  return false;
}
export function cancelAddressedSocial(root,id=null){
  const session=root?.additionalSocial;
  if(!session||(id!==null&&!participating(session,id)))return false;
  root.additionalSocial=null;
  return true;
}
export function restoreAddressedSocial(raw,root){
  if(raw==null)return null;
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||
    Object.keys(raw).some(k=>!['schema','seq','initiator','partner','actionId',
      'phase','elapsed','createdAt','conversation'].includes(k))||
    raw.schema!==ADDRESSED_SOCIAL_SCHEMA||
    !Number.isSafeInteger(raw.seq)||raw.seq<1||
    raw.seq>=root.actionQueues?.nextSeq||
    !['walking','using'].includes(raw.phase)||
    !Number.isFinite(raw.elapsed)||raw.elapsed<0||
    raw.elapsed>=ADDRESSED_SOCIAL_DURATION||
    !Number.isFinite(raw.createdAt)||raw.createdAt<0||
    raw.createdAt>root.minutes||raw.elapsed>root.minutes-raw.createdAt+1e-6||
    !validAction(raw.actionId)||!canMeet(root,raw.initiator,raw.partner)||
    root.socialAction||actor(root,raw.initiator).action||
    actor(root,raw.partner).action)return null;
  if(raw.phase==='using'){
    const a=actor(root,raw.initiator),b=actor(root,raw.partner);
    if(dist(a.position,b.position)<.76||dist(a.position,b.position)>1.55||
      !isClearLine(a.position,b.position,root.world))return null;
  }
  const conversation=raw.conversation===undefined?null:restoreConversation(raw.conversation);
  if(raw.conversation!==undefined&&(!conversation||!validTopic(conversation.topic)||raw.actionId!=='talk'||raw.elapsed!==0||raw.phase==='walking'&&conversation.phase!=='opening'))return null;
  return {...raw,...(conversation?{conversation}:{})};
}
function stepTowards(root,id,goal,minutes){
  const person=actor(root,id),path=findPath(person.position,goal,root.world);
  if(!path)return false;
  const first=path.find(p=>dist(person.position,p)>.0001);
  if(!first)return true;
  const length=dist(person.position,first),step=Math.min(length,Math.max(0,minutes*2.2),1);
  const next={x:person.position.x+(first.x-person.position.x)*step/length,
    z:person.position.z+(first.z-person.position.z)*step/length};
  if(!isClearLine(person.position,next,root.world)||
    !residentSegmentClear(root,id,person.position,next))return false;
  person.position=next;
  return true;
}
const hasTime=(root,s)=>root.minutes>=s.createdAt&&
  Number.isFinite(root.minutes)&&root.minutes<=10000000;
/** Physical arrival and recipient's fresh response are mandatory before
 * writing ONE canonical graph receipt, pair-specific episode and social need.
 */
export function tickAddressedSocial(root,minutes){
  const s=root?.additionalSocial;
  if(!s||root.paused||!Number.isFinite(minutes)||minutes<=0)return false;
  if(!hasTime(root,s)||!canMeet(root,s.initiator,s.partner)||
    root.socialAction||actor(root,s.initiator).action||actor(root,s.partner).action||
    (!s.conversation&&(pendingActions(root.actionQueues,s.initiator).length||
      pendingActions(root.actionQueues,s.partner).length))||
    !actionAllowed(root,s.initiator,s.partner,s.actionId)){
    cancelAddressedSocial(root);return false;
  }
  const a=actor(root,s.initiator),b=actor(root,s.partner);
  if(s.phase==='walking'){
    const goal=approach(root,s.initiator,s.partner);
    if(!goal){cancelAddressedSocial(root);return false;}
    if(dist(a.position,b.position)>=.76&&dist(a.position,b.position)<=1.5&&
      isClearLine(a.position,b.position,root.world)){
      s.phase='using';s.elapsed=0;
      a.event='Общается';b.event='Слушает собеседника';
      return false; // no benefit in the arrival tick
    }
    if(!stepTowards(root,s.initiator,goal,minutes)){
      // Geometry or another actor can change between ticks; do not teleport.
      cancelAddressedSocial(root);
    }
    return false;
  }
  if(dist(a.position,b.position)<.76||dist(a.position,b.position)>1.55||
    !isWalkable(a.position.x,a.position.z,root.world)||
    !isWalkable(b.position.x,b.position.z,root.world)||
    !isClearLine(a.position,b.position,root.world)){
    cancelAddressedSocial(root);return false;
  }
  if(s.conversation)return false; // shared explicit-choice gate; no automatic receipt
  s.elapsed+=minutes;
  if(s.elapsed<ADDRESSED_SOCIAL_DURATION)return false;
  let outcome=null;
  if(ADDRESSED_BRANCHES.includes(s.actionId)){
    outcome=resolveBranchResponse(root.socialGraph,s.initiator,s.partner,s.actionId,
      {recipient:b,minutes:root.minutes});
  }else{
    const response=evaluateSocialReaction({kind:'conversation',recipient:b,
      view:getDirectedView(root.socialGraph,s.partner,s.initiator),
      minutes:root.minutes,tone:s.actionId==='argue'?'harsh':'warm',
      weight:s.actionId==='argue'?-4:3});
    if(response?.accepted)outcome={type:s.actionId,accepted:true};
  }
  return settleAddressedSocial(root,s,outcome);
}
function settleAddressedSocial(root,s,outcome){
  const a=actor(root,s.initiator),b=actor(root,s.partner);
  const receipt=outcome&&applySocialEvent(root.socialGraph,{
    actorId:s.initiator,targetId:s.partner,type:outcome.type,at:root.minutes,
    token:'cas-social:'+s.seq
  });
  if(receipt){
    creditCompletedSocialNeed(allActors(root),receipt);
    if(s.conversation)for(const turn of s.conversation.turns){
      const tag=CONVERSATION_DISCOVERY_TAGS[turn.id];
      if(turn.accepted&&tag)learnSocialPreference(root.socialGraph,receipt,s.initiator,s.partner,b.personality,tag);
      if(cueFromAnswer(turn.id,turn.accepted))learnSocialCue(root.socialGraph,receipt,s.initiator,s.partner,turn.id,turn.accepted);
    }
    for(const [id,person] of [[s.initiator,a],[s.partner,b]]){
      const memory={id:outcome.accepted?
        (s.actionId==='argue'||outcome.type==='conversation.argue')?(id===s.initiator?'regret':'hurt'):'talk':
        'hurt',at:root.minutes,fulfilled:false};
      if(Array.isArray(person.mind?.memories)){
        person.mind.memories.push(memory);
        person.mind.memories=person.mind.memories.slice(-12);
        feelMemory(person,memory);
      }
      refreshMind(person,root.world);
      person.autonomy.nextAt=Math.max(person.autonomy.nextAt||0,root.minutes+15);
      person.event=outcome.accepted?'Состоялось общение':'Собеседник отказался';
    }
  }
  root.additionalSocial=null;
  return Boolean(receipt);
}

/** The addressed physical adapter commits through its existing canonical receipt path. */
export function finishAddressedConversation(root){
  const s=root?.additionalSocial;
  if(root?.paused||s?.phase!=='using'||!s.conversation||!canMeet(root,s.initiator,s.partner))return null;
  const a=actor(root,s.initiator),b=actor(root,s.partner);
  if(a.action||b.action||root.socialAction||!isWalkable(a.position.x,a.position.z,root.world)||
    !isWalkable(b.position.x,b.position.z,root.world)||dist(a.position,b.position)<.76||
    dist(a.position,b.position)>1.55||!isClearLine(a.position,b.position,root.world))return null;
  const outcome=conversationOutcome(s.conversation);
  if(!outcome)return null;
  return settleAddressedSocial(root,s,{type:'conversation.'+outcome.kind,accepted:true})?outcome:null;
}
