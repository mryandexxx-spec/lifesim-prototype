/** Headless two-person social relationship simulation. */
import { refreshMind } from './psychology.js';
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
  return {affinity:50,nextSocialAt:minutes+90,lastKind:null};
}
export function loadRelationship(data,minutes) {
  const rel=newRelationship(minutes);
  if(!data||typeof data!=='object'||Array.isArray(data))return rel;
  if(Number.isFinite(data.affinity))rel.affinity=clamp(Math.round(data.affinity),0,100);
  if(Number.isFinite(data.nextSocialAt))rel.nextSocialAt=clamp(data.nextSocialAt,0,10000000);
  if(Object.hasOwn(SOCIAL_ACTIONS,data.lastKind))rel.lastKind=data.lastKind;
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
export function arriveSocial(root) {
  if(root.socialAction?.phase!=='walking')return false;
  root.socialAction.phase='using';root.socialAction.elapsed=0;return true;
}
export function cancelSocial(root) {
  if(!root.socialAction)return false;
  root.socialAction=null;return true;
}
export function tickSocial(root,minutes) {
  const s=root.socialAction;
  if(root.paused||!Number.isFinite(minutes)||minutes<=0||s?.phase!=='using')return false;
  const def=SOCIAL_ACTIONS[s.kind];
  if(!def||!root.otherSim){root.socialAction=null;return false;}
  s.elapsed+=minutes;
  if(s.elapsed<def.duration)return false;
  const reconciled=s.kind==='talk'&&canReconcile(root);
  // A deliberate conversation after a quarrel rebuilds trust a little
  // faster than ordinary small talk, but never breaches the 0–100 cap.
  const affinityGain=reconciled?def.affinity+4:def.affinity;
  root.relationship.affinity=clamp(root.relationship.affinity+affinityGain,0,100);
  root.relationship.lastKind=s.kind;
  root.relationship.nextSocialAt=root.minutes+SOCIAL_COOLDOWN_MINUTES;
  for(const id of ['alex','mira']){
    const resident=get(root,id);
    resident.needs.fun=clamp(resident.needs.fun+def.fun,0,100);
    const memoryId=reconciled?'reconcile'
      :s.kind==='argue'?(id===s.initiator?'regret':'hurt'):'talk';
    resident.mind.memories.push({id:memoryId,at:root.minutes,fulfilled:false});
    resident.mind.memories=resident.mind.memories.slice(-12);
    resident.autonomy.nextAt=root.minutes+15;
    resident.event=reconciled?'Удалось помириться'
      :s.kind==='talk'?'Приятно поговорили'
      :id===s.initiator?'Сожалеет о ссоре':'Обиделся после ссоры';
    refreshMind(resident);
  }
  root.socialAction=null;
  return true;
}
export function loadSocialAction(data,root) {
  if(!data||typeof data!=='object'||Array.isArray(data)||
    !Object.hasOwn(SOCIAL_ACTIONS,data.kind)||!validId(data.initiator)||
    data.partner!==otherId(data.initiator)||!['walking','using'].includes(data.phase)||
    !data.target||!Number.isFinite(data.target.x)||!Number.isFinite(data.target.z)||
    Math.abs(data.target.x)>4.65||Math.abs(data.target.z)>4.01||
    !Number.isFinite(data.elapsed)||data.elapsed<0||data.elapsed>=SOCIAL_ACTIONS[data.kind].duration||
    (!root.autonomy.enabled&&data.automatic===true))return null;
  if(get(root,data.initiator).action||get(root,data.partner).action)return null;
  return {kind:data.kind,initiator:data.initiator,partner:data.partner,
    target:{x:data.target.x,z:data.target.z},phase:data.phase,
    elapsed:data.elapsed,automatic:data.automatic===true};
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
  if(self.needs.fun<55&&root.relationship.affinity>=25)return 'talk';
  if(self.needs.fun<35&&root.relationship.affinity<25&&self.mind.mood.value<45)return 'argue';
  return null;
}
