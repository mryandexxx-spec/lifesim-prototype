/** LOT-D2d: deterministic, bounded idle swimming in the existing household.
 * One swim action, one clock, one queue, no PlayCanvas or separate rewards.
 */
import {deriveAxes,preferenceAffinity} from './trait-catalog.js';
import {planPoolAdmission} from './pool-navigation.js';
import {residentUnavailableForHome} from './career-work.js';
import {nextCareerShift} from './career-scheduler.js';
import {pendingWorkIncident} from './career-incidents.js';
export const POOL_AUTO_POLICY=Object.freeze({
  startHour:8,endHour:19,slotMinutes:180,dailyLimit:1,cooldown:240,workBuffer:140,
  needs:Object.freeze({energy:72,hunger:62,bladder:65,hygiene:42,fun:30,social:40}),
  minMood:56
});
const IDS=['alex','mira'],MAX=10000000;
const actor=(root,id)=>id==='alex'?root:id==='mira'?root?.otherSim:null;
const validTime=(v,now)=>Number.isFinite(v)&&v>=0&&v<=now&&v<=MAX;
const day=n=>Math.floor(n/1440);
const fresh=()=>({lastSlot:-1,lastStart:null,count:0});
export function restorePoolAutoRoutine(raw,now=480){
  if(!validTime(now,MAX))now=480;
  const same=raw?.schema===1&&raw?.dayIndex===day(now),byResident={};
  for(const id of IDS){
    const r=raw?.schema===1?raw.byResident?.[id]:null,s=fresh();
    if(r&&typeof r==='object'&&!Array.isArray(r)){
      if(Number.isSafeInteger(r.lastSlot)&&r.lastSlot>=-1&&
        r.lastSlot<=Math.floor(now/POOL_AUTO_POLICY.slotMinutes))s.lastSlot=r.lastSlot;
      if(validTime(r.lastStart,now))s.lastStart=r.lastStart;
      if(same&&Number.isSafeInteger(r.count)&&r.count>=0&&
        r.count<=POOL_AUTO_POLICY.dailyLimit)s.count=r.count;
    }
    byResident[id]=s;
  }
  return {schema:1,dayIndex:day(now),byResident};
}
function routine(root){
  if(root.poolAutoRoutine?.schema!==1||root.poolAutoRoutine.dayIndex!==day(root.minutes))
    root.poolAutoRoutine=restorePoolAutoRoutine(root.poolAutoRoutine,root.minutes);
  return root.poolAutoRoutine;
}
export function poolAutoDraw(id,slot,poolId){
  let h=2166136261;
  for(const c of id+':'+slot+':'+poolId)h=Math.imul(h^c.charCodeAt(0),16777619);
  return (h>>>0)/4294967296;
}
export function poolAutoChance(profile){
  const axes=deriveAxes(profile);
  return Math.max(.12,Math.min(.65,.40+.24*(axes.creativity-.5)+
    .20*(axes.sociability-.5)+.16*preferenceAffinity(profile,'games')-
    .12*preferenceAffinity(profile,'calm_leisure')));
}
export function considerAutonomousPool(root,id){
  if(!IDS.includes(id)||!Number.isFinite(root?.minutes)||
    root.minutes<0||root.minutes>MAX||!root.poolAutoRoutine)return null;
  const P=POOL_AUTO_POLICY,now=root.minutes,item=routine(root).byResident[id];
  const slot=Math.floor(now/P.slotMinutes);
  if(item.lastSlot>=slot)return null;
  item.lastSlot=slot;
  const a=actor(root,id),hour=now%1440/60;
  if(!a||root.paused||!root.autonomy?.enabled||a.action||
    a.autonomy?.nextAt>now||root.socialAction||residentUnavailableForHome(root,id)||
    (root.actionQueues?.byResident?.[id]||[]).length||
    hour<P.startHour||hour>=P.endHour||
    Object.entries(P.needs).some(([need,min])=>!Number.isFinite(a.needs?.[need])||a.needs[need]<min)||
    !Number.isFinite(a.mind?.mood?.value)||a.mind.mood.value<P.minMood||
    item.count>=P.dailyLimit||
    (item.lastStart!==null&&now-item.lastStart<P.cooldown)||
    pendingWorkIncident(root,id))return null;
  const work=root.careerSystem?.byResident?.[id];
  if(work){
    if(work.currentShift&&work.currentShift.phase!=='pending')return null;
    const next=nextCareerShift(root.calendar,work,Math.max(0,now-.001));
    if(next&&next.start-now<P.workBuffer)return null;
  }
  for(const p of root.world?.outdoors?.pools||[]){
    const plan=planPoolAdmission(root,id,p.poolId);
    if(plan&&poolAutoDraw(id,slot,p.poolId)<poolAutoChance(a.personality))
      return {poolId:p.poolId,actionId:'swim',fixtureId:plan.fixtureId};
  }
  return null;
}
export function recordAutonomousPoolStart(root,id){
  const a=actor(root,id);
  if(!a||a.action?.id!=='swim'||a.action.automatic!==true)return false;
  const item=routine(root).byResident[id];
  item.count=Math.min(POOL_AUTO_POLICY.dailyLimit,item.count+1);
  item.lastStart=root.minutes;
  return true;
}
