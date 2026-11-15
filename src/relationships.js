/** Headless two-person social relationship simulation. */
import { refreshMind } from './psychology.js';
import {feelMemory} from './emotion-engine.js';
import {newPerspective,restorePerspective,applySocialPerspective,getPerspective} from './social-perspective.js';
import {createConversation,restoreConversation,chooseConversationTurn,continueConversation,conversationOutcome} from './conversation-engine.js';
import {createSharedSession,restoreSharedSession,sharedDuration,completeSharedSession} from './gifts-leisure.js';
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
  // Manual talk/argue is always available at affinity 0 or 100 and may
  // override a partner's scheduled task. Autonomous social still waits for
  // both residents to become free and respects its cooldown.
  if(automatic&&(partner.action||!root.autonomy?.enabled||root.paused||
    self.action||root.minutes<root.relationship.nextSocialAt))return false;
  return true;
}
export function startSocial(root,kind,initiator,target,automatic=false) {
  if(!canStartSocial(root,kind,initiator,automatic)||!target||
    !Number.isFinite(target.x)||!Number.isFinite(target.z)||
    Math.abs(target.x)>4.65||Math.abs(target.z)>4.01)return false;
  const self=get(root,initiator),partner=get(root,otherId(initiator));
  self.action=null;
  // Explicit player intent takes priority over the other resident's job.
  // Render transitions (bed/sofa/shower/fridge) still finish safely before
  // the talking pose starts; no need to remove or overwrite saved fields.
  if(!automatic)partner.action=null;
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
  completeSocial(root,outcome.score);
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
  root.socialAction=null;
  return true;
}
export function tickSocial(root,minutes){
  const s=root.socialAction;
  if(root.paused||!Number.isFinite(minutes)||minutes<=0||s?.phase!=='using')return false;
  if(s.conversation)return false; // explicit multi-turn choices decide the finish
  if(s.shared){
    const duration=sharedDuration(s.shared);
    if(!duration){root.socialAction=null;return false;}
    s.elapsed+=minutes;
    if(s.elapsed<duration)return false;
    const receipt=completeSharedSession(root);
    if(!receipt){root.socialAction=null;return false;}
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
  return {kind:data.kind,initiator:data.initiator,partner:data.partner,
    target:{x:data.target.x,z:data.target.z},phase:data.phase,
    elapsed:data.elapsed,automatic:data.automatic===true,
    ...(session?{conversation:session}:{}),
    ...(shared?{shared}:{})};
}
export function autonomousSocialChoice(root,id='alex') {
  if(!validId(id)||!root.relationship||!root.autonomy.enabled||
    root.minutes<540||root.minutes<root.relationship.nextSocialAt||root.socialAction||root.paused)return null;
  const self=get(root,id),partner=get(root,otherId(id));
  if(!self||!partner||self.action||partner.action)return null;
  if(Math.min(self.needs.energy,self.needs.hunger,self.needs.hygiene,
    partner.needs.energy,partner.needs.hunger,partner.needs.hygiene)<40)return null;
  // The one who started the last quarrel may initiate making peace
  // once the normal three-hour social cooldown passes. Do not use wall
  // clocks, random rolls or a new save field.
  if(canReconcile(root)&&root.relationship.affinity<70&&
    lastSocialMemory(self)?.id==='regret')return 'talk';
  const view=getPerspective(root,id);
  // High personal tension may influence an idle person's voluntary response.
  // This never disables the player's manual talk or argue controls.
  if(self.needs.fun<35&&view?.tension>=65&&self.mind.mood.value<48)return 'argue';
  if(self.needs.fun<55&&root.relationship.affinity>=25)return 'talk';
  if(self.needs.fun<35&&root.relationship.affinity<25&&self.mind.mood.value<45)return 'argue';
  return null;
}
