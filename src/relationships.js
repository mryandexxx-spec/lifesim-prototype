/** Headless two-person social relationship simulation. */
import { refreshMind } from './psychology.js';
import {feelMemory} from './emotion-engine.js';
import {evaluateSocialReaction} from './social-reactions.js';
import {emitSocialReaction} from './social-feedback.js';
import {socialCompatibility,CONVERSATION_DISCOVERY_TAGS} from './social-compatibility.js';
import {cueFromAnswer} from './social-boundaries.js';
import {proposeAutonomousSocial} from './social-dynamics.js';
import {GIFT_CATALOG,LEISURE_CATALOG,inventoryFor} from './gifts-leisure.js';
import {newPerspective,restorePerspective,applySocialPerspective,getPerspective} from './social-perspective.js';
import {createConversation,restoreConversation,chooseConversationTurn,continueConversation,conversationOutcome} from './conversation-engine.js';
import {createSharedSession,restoreSharedSession,sharedDuration,completeSharedSession} from './gifts-leisure.js';
import {availableSocialActions,resolveBranchResponse,observePairViews,
  applySocialEvent,learnSocialPreference,learnSocialCue} from './social-graph.js';
export const SOCIAL_ACTIONS=Object.freeze({
  talk:{label:'Поговорить',duration:18,affinity:8,fun:6},
  argue:{label:'Поспорить',duration:16,affinity:-12,fun:-5}
});
export const SOCIAL_COOLDOWN_MINUTES=180;
export const RECONCILIATION_WINDOW_MINUTES=480;
const SOCIAL_MEMORY_IDS=new Set(['talk','argue','regret','hurt','reconcile']);
const CONFLICT_MEMORY_IDS=new Set(['argue','regret','hurt']);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const validId=id=>id==='alex'||id==='mira';
const otherId=id=>id==='alex'?'mira':'alex';
const get=(root,id)=>id==='mira'?root.otherSim:root;
function lastSocialMemory(resident){
  const memories=resident?.mind?.memories;
  return Array.isArray(memories)
    ?memories.filter(m=>SOCIAL_MEMORY_IDS.has(m?.id)).at(-1)||null:null;
}
/** Both residents must still remember a recent unresolved quarrel.
 * No separate saved flag: works with old v1 'argue' memories too.
 */
export function canReconcile(root){
  if(root?.relationship?.lastKind!=='argue'||!root?.otherSim||
    !Number.isFinite(root.minutes))return false;
  return ['alex','mira'].every(id=>{
    const memory=lastSocialMemory(get(root,id));
    const age=root.minutes-memory?.at;
    return memory&&CONFLICT_MEMORY_IDS.has(memory.id)&&
      Number.isFinite(age)&&age>=0&&age<=RECONCILIATION_WINDOW_MINUTES;
  });
}

export function newRelationship(minutes=480) {
  return {affinity:50,nextSocialAt:minutes+90,lastKind:null,
    views:{alex:newPerspective(50),mira:newPerspective(50)}};
}
/** v1 compatibility: shared affinity keeps its exact historical semantics.
 * Missing directed views are derived without replaying social events.
 */
export function loadRelationship(data,minutes,legacyMemories={}){
  const rel=newRelationship(minutes);
  if(data&&typeof data==='object'&&!Array.isArray(data)){
    if(Number.isFinite(data.affinity))rel.affinity=clamp(Math.round(data.affinity),0,100);
    if(Number.isFinite(data.nextSocialAt))rel.nextSocialAt=clamp(data.nextSocialAt,0,10000000);
    if(Object.hasOwn(SOCIAL_ACTIONS,data.lastKind))rel.lastKind=data.lastKind;
  }
  const views=data?.views;
  rel.views={
    alex:restorePerspective(views?.alex,rel.affinity,minutes,legacyMemories.alex),
    mira:restorePerspective(views?.mira,rel.affinity,minutes,legacyMemories.mira)
  };
  return rel;
}
export function relationshipLabel(value) {
  return value<30?'Напряжённо':value<66?'Нейтрально':'Дружески';
}
export function canStartSocial(root,kind,initiator,automatic=false) {
  if(!Object.hasOwn(SOCIAL_ACTIONS,kind)||!validId(initiator)||!root.otherSim||root.socialAction)return false;
  const self=get(root,initiator),partner=get(root,otherId(initiator));
  if(!self||!partner)return false;
  // No social invitation interrupts furniture work, another talk or sleep.
  // Player requests wait in a per-resident FIFO queue until both are idle.
  if(self.action||partner.action||root.paused)return false;
  if(automatic&&(!root.autonomy?.enabled||
    root.minutes<root.relationship.nextSocialAt))return false;
  return true;
}
export function startSocial(root,kind,initiator,target,automatic=false) {
  if(!canStartSocial(root,kind,initiator,automatic)||!target||
    !Number.isFinite(target.x)||!Number.isFinite(target.z)||
    Math.abs(target.x)>4.65||Math.abs(target.z)>4.01)return false;
  const self=get(root,initiator),partner=get(root,otherId(initiator));
  // Both actors are idle here. Never reset their ongoing work as a side effect.
  root.socialAction={kind,initiator,partner:otherId(initiator),
    target:{x:target.x,z:target.z},phase:'walking',elapsed:0,automatic:Boolean(automatic)};
  self.event=SOCIAL_ACTIONS[kind].label;
  partner.event='Ждёт общения';
  return true;
}
/** Multi-turn sessions reuse the existing path reservation and social poses. */
export function startConversation(root,initiator,target,topic){
  const session=createConversation(topic);
  if(!session||!startSocial(root,'talk',initiator,target,false))return false;
  root.socialAction.conversation=session;
  return true;
}
export const chooseSocialLine=(root,id)=>chooseConversationTurn(root,id);
export const nextSocialLine=root=>continueConversation(root);
export function finishSocialConversation(root){
  const social=root?.socialAction,session=social?.conversation;
  if(root?.paused||social?.phase!=='using'||!session)return null;
  const outcome=conversationOutcome(session);
  if(!outcome)return null;
  social.kind=outcome.kind;
  if(!completeSocial(root,outcome.score))return null;
  // Each completed conversation can leave its initiator with a different feeling.
  emitSocialReaction(root,{
    actorId:social.partner,responderId:social.initiator,
    eventType:'conversation.finish',outcome:outcome.kind==='argue'?'awkward':'neutral'
  });
  return outcome;
}
/** Existing walk/animation/social reservation also supports gift/leisure.
 * Nothing changes until this shared action finishes its fixed game time.
 */
export function startSharedSocial(root,initiator,target,mode,choiceId){
  const session=createSharedSession(root,initiator,mode,choiceId);
  if(!session||!startSocial(root,'talk',initiator,target,false))return false;
  root.socialAction.shared=session;
  return true;
}
/** The adapter remains two-resident only; social-graph.js works with N stable IDs. */
export function startBranchSocial(root,initiator,target,actionId){
  if(!root?.socialGraph||!availableSocialActions(root.socialGraph,initiator,otherId(initiator))
    .some(action=>action.id===actionId&&action.enabled))return false;
  if(!startSocial(root,'talk',initiator,target,false))return false;
  root.socialAction.branchAction={id:actionId};
  return true;
}
function recordPairCompletion(root,session,type){
  const graph=root.socialGraph,a=session.initiator,b=session.partner;
  if(!graph||!root.relationship?.views?.[a]||!root.relationship.views[b])return false;
  const views={[a]:root.relationship.views[a],[b]:root.relationship.views[b]};
  observePairViews(graph,a,b,views);
  return applySocialEvent(graph,{
    actorId:a,targetId:b,type,at:root.minutes
  },{observedViews:views})||null;
}
export function arriveSocial(root) {
  if(root.socialAction?.phase!=='walking')return false;
  root.socialAction.phase='using';root.socialAction.elapsed=0;return true;
}
export function cancelSocial(root) {
  if(!root.socialAction)return false;
  root.socialAction=null;return true;
}
function completeSocial(root,conversationScore=null){
  const s=root.socialAction,def=SOCIAL_ACTIONS[s?.kind];
  if(!def||!root.otherSim){root.socialAction=null;return false;}
  // One-button talk/argue is never refused, preserving legacy semantics.
  // Its individual effects go through socialImpressionFactor below.
  const directReaction=s.branchAction||s.conversation?null:evaluateSocialReaction({
    kind:'direct',actionId:s.kind,recipient:get(root,s.partner),
    view:getPerspective(root,s.partner),minutes:root.minutes
  });
  const reconciled=s.kind==='talk'&&canReconcile(root);
  // Old one-click talk/argue keep exact +8 / -12 / reconciliation +12.
  // A multi-turn talk has a single context-dependent signed result.
  const gain=conversationScore===null
    ?(reconciled?def.affinity+4:def.affinity)
    :(reconciled?Math.max(4,conversationScore)+4:conversationScore);
  root.relationship.affinity=clamp(root.relationship.affinity+gain,0,100);
  root.relationship.lastKind=s.kind;
  root.relationship.nextSocialAt=root.minutes+SOCIAL_COOLDOWN_MINUTES;
  for(const id of ['alex','mira']){
    const resident=get(root,id);
    resident.needs.fun=clamp(resident.needs.fun+def.fun,0,100);
    const memoryId=reconciled?'reconcile'
      :s.kind==='argue'?(id===s.initiator?'regret':'hurt'):'talk';
    const memory={id:memoryId,at:root.minutes,fulfilled:false};
    resident.mind.memories.push(memory);
    resident.mind.memories=resident.mind.memories.slice(-12);
    feelMemory(resident,memory);
    // A completed shared interaction leaves two DIFFERENT impressions.
    // The old affinity meter remains a backwards-compatible shared record.
    applySocialPerspective(getPerspective(root,id),memory,resident,root.minutes);
    resident.autonomy.nextAt=root.minutes+15;
    resident.event=reconciled?'Удалось помириться'
      :s.kind==='talk'?'Приятно поговорили'
      :id===s.initiator?'Сожалеет о ссоре':'Обиделся после ссоры';
    refreshMind(resident);
  }
  const completed=recordPairCompletion(root,s,s.branchAction?.resultType||
    (s.conversation?'conversation.'+s.kind:s.kind));
  if(completed&&s.conversation){
    // No premature discovery from a started, abandoned or merely queued talk.
    for(const turn of s.conversation.turns||[]){
      const tag=CONVERSATION_DISCOVERY_TAGS[turn.id];
      if(turn.accepted&&tag)learnSocialPreference(root.socialGraph,completed,
        s.initiator,s.partner,get(root,s.partner).personality,tag);
      if(cueFromAnswer(turn.id,turn.accepted))learnSocialCue(root.socialGraph,completed,
        s.initiator,s.partner,turn.id,turn.accepted);
    }
  }
  // Legacy one-button actions only show a response after their effects finish.
  if(directReaction){
    emitSocialReaction(root,{actorId:s.initiator,responderId:s.partner,
      outcome:directReaction.outcome,intensity:directReaction.intensity,
      eventType:'direct.reply'});
    emitSocialReaction(root,{actorId:s.partner,responderId:s.initiator,
      outcome:s.kind==='argue'?'awkward':directReaction.outcome,
      eventType:'direct.initiator'});
  }
  root.socialAction=null;
  return true;
}
export function tickSocial(root,minutes){
  const s=root.socialAction;
  if(root.paused||!Number.isFinite(minutes)||minutes<=0||s?.phase!=='using')return false;
  if(s.conversation)return false; // explicit multi-turn choices decide the finish
  if(s.branchAction){
    s.elapsed+=minutes;
    if(s.elapsed<18)return false;
    const response=resolveBranchResponse(root.socialGraph,s.initiator,s.partner,
      s.branchAction.id,{recipient:get(root,s.partner),minutes:root.minutes,
        compatibilityBias:socialCompatibility(get(root,s.partner)?.personality,
          get(root,s.initiator)?.personality).bias});
    if(!response){root.socialAction=null;return false;}
    s.branchAction.resultType=response.type;
    s.kind=response.accepted?'talk':'argue';
    if(!completeSocial(root,response.accepted?6:-5))return false;
    emitSocialReaction(root,{actorId:s.initiator,responderId:s.partner,
      outcome:response.outcome,intensity:response.intensity,eventType:'branch.reply'});
    emitSocialReaction(root,{actorId:s.partner,responderId:s.initiator,
      outcome:response.accepted?'neutral':'awkward',eventType:'branch.initiator'});
    return true;
  }
  if(s.shared){
    const duration=sharedDuration(s.shared);
    if(!duration){root.socialAction=null;return false;}
    s.elapsed+=minutes;
    if(s.elapsed<duration)return false;
    const receipt=completeSharedSession(root);
    if(!receipt){root.socialAction=null;return false;}
    const completed=recordPairCompletion(root,s,s.shared.mode==='gift'
      ?receipt.kind==='refused'?'gift.refused':'gift.accepted'
      :receipt.kind==='refused'?'leisure.refused':'leisure.accepted');
    const accepted=receipt.kind!=='refused';
    if(accepted&&completed){
      const tag=s.shared.mode==='gift'
        ?GIFT_CATALOG[inventoryFor(root,s.partner)
          .find(item=>item.id===s.shared.choiceId)?.type]?.tag
        :LEISURE_CATALOG[s.shared.choiceId]?.tag;
      if(tag)learnSocialPreference(root.socialGraph,completed,
        s.initiator,s.partner,get(root,s.partner).personality,tag);
    }
    const recipientOutcome=!accepted?'refused':
      receipt.kind==='liked'||s.shared.mode==='leisure'?'warm':'neutral';
    emitSocialReaction(root,{actorId:s.initiator,responderId:s.partner,
      outcome:recipientOutcome,eventType:s.shared.mode+'.reply'});
    emitSocialReaction(root,{actorId:s.partner,responderId:s.initiator,
      outcome:accepted?'neutral':'awkward',eventType:s.shared.mode+'.initiator'});
    root.relationship.nextSocialAt=root.minutes+SOCIAL_COOLDOWN_MINUTES;
    root.socialAction=null;
    return true;
  }
  const def=SOCIAL_ACTIONS[s.kind];
  if(!def)return false;
  s.elapsed+=minutes;
  return s.elapsed>=def.duration?completeSocial(root):false;
}
export function loadSocialAction(data,root) {
  const shared=data?.shared===undefined?null:restoreSharedSession(data.shared,root,data.initiator);
  const duration=shared?sharedDuration(shared):SOCIAL_ACTIONS[data?.kind]?.duration;
  if(!data||typeof data!=='object'||Array.isArray(data)||
    !Object.hasOwn(SOCIAL_ACTIONS,data.kind)||!validId(data.initiator)||
    data.partner!==otherId(data.initiator)||!['walking','using'].includes(data.phase)||
    !data.target||!Number.isFinite(data.target.x)||!Number.isFinite(data.target.z)||
    Math.abs(data.target.x)>4.65||Math.abs(data.target.z)>4.01||
    !Number.isFinite(data.elapsed)||data.elapsed<0||data.elapsed>=duration||
    (!root.autonomy.enabled&&data.automatic===true))return null;
  if(get(root,data.initiator).action||get(root,data.partner).action)return null;
  const session=data.conversation===undefined?null:restoreConversation(data.conversation);
  if(data.conversation!==undefined&&(!session||data.kind!=='talk'||data.automatic===true))
    return null;
  if(data.shared!==undefined&&(!shared||session||data.kind!=='talk'||data.automatic===true))
    return null;
  const branch=data.branchAction;
  if(branch!==undefined&&(
    !branch||typeof branch!=='object'||Array.isArray(branch)||
    !Object.hasOwn(branch,'id')||Object.keys(branch).length!==1||
    !availableSocialActions(root.socialGraph,data.initiator,data.partner)
      .some(action=>action.id===branch.id&&action.enabled)||
    session||shared||data.kind!=='talk'||data.automatic===true))return null;
  return {kind:data.kind,initiator:data.initiator,partner:data.partner,
    target:{x:data.target.x,z:data.target.z},phase:data.phase,
    elapsed:data.elapsed,automatic:data.automatic===true,
    ...(session?{conversation:session}:{}),
    ...(shared?{shared}:{}),
    ...(branch?{branchAction:{id:branch.id}}:{})};
}
/** Current scene adapter stays two-person; policy core handles N IDs.
 * No automatic invitation reserves or deletes a player's FIFO action here.
 */
export function autonomousSocialChoice(root,id='alex') {
  if(!validId(id)||!root?.otherSim)return null;
  const idea=proposeAutonomousSocial({
    graph:root.socialGraph,actorId:id,
    residents:{alex:root,mira:root.otherSim},
    queues:root.actionQueues,minutes:root.minutes,
    enabled:root.autonomy?.enabled,paused:root.paused,
    socialBusy:Boolean(root.socialAction),
    nextSocialAt:root.relationship?.nextSocialAt??Infinity
  });
  return idea?.kind??null;
}
