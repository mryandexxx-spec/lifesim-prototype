/** LOT-C2a: one bounded, deterministic autonomous gardening opportunity policy.
 * The existing household/scene action engine remains the ONLY garden executor.
 * Never uses wall-clock time, DOM, PlayCanvas or Math.random.
 */
import {deriveAxes,preferenceAffinity} from './trait-catalog.js';
import {gardenView,gardenApproach,gardenActionAllowed,gardenRequestStillValid,GARDEN_DURATION} from './gardening.js';
import {nextCareerShift} from './career-scheduler.js';
import {pendingWorkIncident} from './career-incidents.js';
import {residentUnavailableForHome} from './career-work.js';

export const GARDEN_AUTO_POLICY=Object.freeze({
  startHour:7,endHour:20,considerMinutes:180,unreachableBackoff:360,
  waterRemainingMinutes:360,workBufferMinutes:120,maxTravelAndWaterMinutes:45,
  perResidentDaily:2,householdDaily:4,residentCooldown:180,
  householdCooldown:90,routeCandidates:2,
  needs:Object.freeze({energy:65,hunger:55,bladder:60,hygiene:40,social:50,fun:35}),
  minimumPhysical:35,minimumMood:50
});
const IDS=['alex','mira'];
const MAX_MINUTES=10000000;
const validTime=(x,now)=>Number.isFinite(x)&&x>=0&&x<=now&&x<=MAX_MINUTES;
const integer=(x,min,max)=>Number.isInteger(x)&&x>=min&&x<=max?x:null;
const actor=(root,id)=>id==='alex'?root:id==='mira'?root?.otherSim:null;
const day=minutes=>Math.floor(minutes/1440);
const validAt=(x,now)=>validTime(x,now)?x:null;
const blankResident=now=>({lastSlot:-1,nextAt:now,lastAutoAt:null,count:0});
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

/** Optional root-v1 field. Unknown/malicious history is discarded, not trusted. */
export function restoreGardenRoutine(raw,now=480){
  const time=validTime(now,MAX_MINUTES)?now:480;
  const dayIndex=day(time),slot=Math.floor(time/GARDEN_AUTO_POLICY.considerMinutes);
  const safe=raw?.schema===1&&typeof raw==='object'&&!Array.isArray(raw);
  const sameDay=safe&&raw.dayIndex===dayIndex;
  const byResident={};
  for(const id of IDS){
    const r=safe?raw.byResident?.[id]:null;
    const item=blankResident(time);
    if(r&&typeof r==='object'&&!Array.isArray(r)){
      item.lastSlot=integer(r.lastSlot,-1,slot)??-1;
      item.nextAt=Number.isFinite(r.nextAt)&&r.nextAt>=0&&
        r.nextAt<=Math.min(MAX_MINUTES,time+GARDEN_AUTO_POLICY.unreachableBackoff)
        ?r.nextAt:time;
      item.lastAutoAt=validAt(r.lastAutoAt,time);
      item.count=sameDay?integer(r.count,0,GARDEN_AUTO_POLICY.perResidentDaily)??0:0;
    }
    byResident[id]=item;
  }
  return {schema:1,dayIndex,householdCount:sameDay
      ?integer(raw.householdCount,0,GARDEN_AUTO_POLICY.householdDaily)??0:0,
    lastHouseholdAt:safe?validAt(raw.lastHouseholdAt,time):null,byResident};
}

function routineFor(root){
  const current=root.gardenRoutine;
  if(!current||current.schema!==1||current.dayIndex!==day(root.minutes))
    root.gardenRoutine=restoreGardenRoutine(current,root.minutes);
  return root.gardenRoutine;
}

/** All checks are read-only; NEVER schedule garden against the player's plans. */
export function autonomousGardenEligible(root,id){
  const a=actor(root,id),now=root?.minutes;
  if(!a||!Number.isFinite(now)||now<0||now>MAX_MINUTES||
    root.paused||!root.autonomy?.enabled||a.autonomy?.nextAt>now||
    a.action||root.socialAction||
    residentUnavailableForHome(root,id)||
    (root.actionQueues?.byResident?.[id]||[]).length)return false;
  if(a.workRecovery?.until>now)return false;
  const hour=now%1440/60,P=GARDEN_AUTO_POLICY;
  if(hour<P.startHour||hour>=P.endHour)return false;
  if(Object.entries(P.needs).some(([need,minimum])=>
    !Number.isFinite(a.needs?.[need])||a.needs[need]<minimum))return false;
  if(['energy','hunger','hygiene','fun','bladder'].some(n=>
    a.needs[n]<P.minimumPhysical)||!Number.isFinite(a.mind?.mood?.value)||
    a.mind.mood.value<P.minimumMood)return false;
  if(pendingWorkIncident(root,id))return false;
  const contract=root.careerSystem?.byResident?.[id];
  if(contract){
    if(contract.currentShift&&contract.currentShift.phase!=='pending')return false;
    const upcoming=nextCareerShift(root.calendar,contract,Math.max(0,now-.001));
    if(upcoming&&upcoming.start-now<P.workBufferMinutes)return false;
    if(contract.currentShift&&contract.currentShift.start-now<P.workBufferMinutes)
      return false;
  }
  return true;
}

export function gardenAutoChance(profile){
  const a=deriveAxes(profile);
  // C2b will add 'gardening' to the existing preference catalog. Until then
  // missing interests are neutral and never corrupt older profile schema1.
  return clamp(.26+.14*(a.organization-.5)+.12*(a.practicality-.5)+
    .10*(a.creativity-.5)+.20*preferenceAffinity(profile,'gardening')-
    .10*(a.sociability-.5),.06,.65);
}

/** Reproducible draw, stable over refresh, frame chunking and 1x/3x speed. */
export function gardenAutoDraw(residentId,slot,instanceId){
  const string=residentId+':'+slot+':'+instanceId;
  let hash=2166136261;
  for(let i=0;i<string.length;i++){
    hash=Math.imul(hash^string.charCodeAt(i),16777619);
  }
  return (hash>>>0)/4294967296;
}

export function autonomousGardenQuota(root,id){
  const r=routineFor(root),a=r.byResident[id],now=root.minutes,P=GARDEN_AUTO_POLICY;
  return Boolean(a)&&a.count<P.perResidentDaily&&
    r.householdCount<P.householdDaily&&
    (a.lastAutoAt===null||now-a.lastAutoAt>=P.residentCooldown)&&
    (r.lastHouseholdAt===null||now-r.lastHouseholdAt>=P.householdCooldown);
}

/** Called only from the existing 12-real-second idle AI window, AFTER self-care/social. 
 * Consumes one persisted opportunity even if rejected; cannot spin on each frame.
 */
export function considerAutonomousGarden(root,id){
  const now=root?.minutes;
  if(!IDS.includes(id)||!Number.isFinite(now)||now<0||now>MAX_MINUTES||
    !root?.gardenRoutine)return null;
  const r=routineFor(root),entry=r.byResident[id],P=GARDEN_AUTO_POLICY;
  const slot=Math.floor(now/P.considerMinutes);
  if(entry.lastSlot>=slot||now<entry.nextAt)return null;
  entry.lastSlot=slot;
  entry.nextAt=Math.min(MAX_MINUTES,now+P.considerMinutes);
  if(!autonomousGardenEligible(root,id)||!autonomousGardenQuota(root,id))return null;
  const candidates=(root.world?.outdoors?.features||[]).filter(f=>{
    const v=gardenView(root.world.outdoors,f.instanceId,now);
    return v&&!v.mature&&v.waterRemaining<=P.waterRemainingMinutes&&
      gardenActionAllowed(root,id,f.instanceId,'water');
  }).map(f=>({id:f.instanceId,remaining:gardenView(root.world.outdoors,f.instanceId,now).waterRemaining}))
    .sort((a,b)=>a.remaining-b.remaining||a.id.localeCompare(b.id))
    .slice(0,P.routeCandidates);
  if(!candidates.length)return null;
  const position=actor(root,id).position;
  let picked=null;
  for(const candidate of candidates){
    const plan=gardenApproach(root.world,candidate.id,position);
    if(!plan)continue;
    let length=0,last=position;
    for(const step of plan.path){
      length+=Math.hypot(step.x-last.x,step.z-last.z);last=step;
    }
    // Conservative walking budget: 1 game-minute per 0.5 world metres.
    const total=length*2+GARDEN_DURATION.water;
    if(total>P.maxTravelAndWaterMinutes)continue;
    if(!picked||total<picked.total||
       (total===picked.total&&candidate.id<picked.instanceId))
      picked={instanceId:candidate.id,total};
  }
  if(!picked){
    entry.nextAt=Math.min(MAX_MINUTES,now+P.unreachableBackoff);
    return null;
  }
  if(gardenAutoDraw(id,slot,picked.instanceId)>=gardenAutoChance(actor(root,id).personality))
    return null;
  return {instanceId:picked.instanceId,actionId:'water'};
}

/** Commit exactly when the existing executor accepted a genuine automatic action. */
export function noteAutonomousGardenStart(root,id,instanceId){
  if(!IDS.includes(id)||!root||!instanceId)return false;
  const r=routineFor(root),entry=r.byResident[id];
  if(!entry||!autonomousGardenQuota(root,id))return false;
  const a=actor(root,id);
  if(a?.action?.id!=='garden'||a.action.automatic!==true||
    a.action.targetInstanceId!==instanceId||a.action.gardenActionId!=='water')
    return false;
  entry.lastAutoAt=root.minutes;
  entry.count++;
  r.lastHouseholdAt=root.minutes;
  r.householdCount++;
  return true;
}

/** A player can claim a plot from automatic care, never from another manual
 * action/queued command. The actual automatic action is cancelled ONLY after
 * enqueueAction succeeds (game.js), so a full FIFO cannot steal reservations.
 */
export function playerMayClaimGarden(root,residentId,instanceId,actionId){
  if(!gardenRequestStillValid(root,residentId,instanceId,actionId))return false;
  if(gardenActionAllowed(root,residentId,instanceId,actionId))return true;
  if(Object.values(root?.actionQueues?.byResident||{}).some(queue=>
    Array.isArray(queue)&&queue.some(cmd=>
      cmd.type==='garden'&&cmd.instanceId===instanceId)))return false;
  const sessions=[root,root?.otherSim].filter(a=>
    a?.action?.id==='garden'&&a.action.targetInstanceId===instanceId);
  return sessions.length>0&&sessions.every(a=>a.action.automatic===true);
}
