/** W3-D: one native mood, real settled-shift receipts, no second needs system. */
import {feelMemory} from './emotion-engine.js';
import {refreshMind} from './psychology.js';
import {disciplineStatus} from './career-discipline.js';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const validTime=n=>Number.isFinite(n)&&n>=0&&n<=5256000000;
const scores=Object.freeze({'worklife.success':12,'worklife.exhaustedPride':12,
  'worklife.hard':-12,'worklife.overloaded':2,'worklife.missed':-15,
  'worklife.warning':-12,'worklife.finalWarning':-12,'worklife.neutral':2});
const feelings=Object.freeze({
  'worklife.success':7,'worklife.exhaustedPride':2,
  'worklife.hard':-8,'worklife.hardStrain':-10,'worklife.overloaded':-5,
  'worklife.missed':-9,'worklife.warning':-6,'worklife.finalWarning':-10,
  'worklife.dismissal':-14,'worklife.promotion':11,'worklife.resignation':-3,
  'worklife.sharedInterrupted':-6,'worklife.sharedDisappointed':-4
});
export const WORK_LIFE_FEELINGS=feelings;
export const WORK_LIFE_SCORE=scores;
const idPrefix=id=>typeof id==='string'&&/^e[1-9]\d{0,8}$/.test(id)?id+'@':null;
const validShiftId=(id,employmentId)=>
  typeof id==='string'&&id.startsWith(idPrefix(employmentId)||'\u0000')&&
  /^e[1-9]\d{0,8}@[0-9]+@[0-9]+$/.test(id);
export function newWorkLife(lastShift=null){
  return {recentShifts:[],lastProcessedShiftStart:validTime(lastShift?.start)?
    lastShift.start:-1,conflictNotifiedShiftId:null,choiceShiftId:null,
    promotedAt:null,lastFeeling:null};
}
/** Old-save lastShift is a watermark, never retroactively converted to W3-D emotion. */
export function restoreWorkLife(raw,employmentId,lastShift=null){
  const out=newWorkLife(lastShift);
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return out;
  const list=Array.isArray(raw.recentShifts)?raw.recentShifts.slice(-5):[];
  const seen=new Set();
  for(const entry of list){
    if(!entry||!validShiftId(entry.id,employmentId)||
       !validTime(entry.start)||!Object.hasOwn(scores,entry.feeling)||
       entry.id.split('@')[2]!==String(entry.start)||
       seen.has(entry.id))continue;
    seen.add(entry.id);
    out.recentShifts.push({id:entry.id,start:entry.start,feeling:entry.feeling});
  }
  out.recentShifts.sort((a,b)=>a.start-b.start);
  const max=Math.max(out.lastProcessedShiftStart,...out.recentShifts.map(x=>x.start));
  if(validTime(raw.lastProcessedShiftStart))
    out.lastProcessedShiftStart=Math.max(max,raw.lastProcessedShiftStart);
  else out.lastProcessedShiftStart=max;
  for(const key of ['conflictNotifiedShiftId','choiceShiftId']){
    if(validShiftId(raw[key],employmentId))out[key]=raw[key];
  }
  if(validTime(raw.promotedAt))out.promotedAt=raw.promotedAt;
  if(typeof raw.lastFeeling==='string'&&Object.hasOwn(feelings,raw.lastFeeling))
    out.lastFeeling=raw.lastFeeling;
  return out;
}
export function jobSatisfaction(contract,now){
  if(!contract)return null;
  const list=contract.workLife?.recentShifts||[];
  const average=list.length?Math.round(list.reduce((n,e)=>
    n+(scores[e.feeling]??0),0)/list.length):0;
  const performance=Number.isFinite(contract.performance)?contract.performance:55;
  const performanceBonus=clamp(Math.round((performance-60)/5),-8,8);
  const promotion=validTime(contract.workLife?.promotedAt)&&
    now>=contract.workLife.promotedAt&&now-contract.workLife.promotedAt<2880?6:0;
  const stage=disciplineStatus(contract.discipline).stage;
  const warning=stage==='final'||stage==='dismissal'?-8:stage==='warning'?-4:0;
  return clamp(55+average+performanceBonus+promotion+warning,0,100);
}
export function workMoodContext(contract,now){
  const satisfaction=jobSatisfaction(contract,now);
  return satisfaction===null?0:clamp(Math.round((satisfaction-55)/4),-5,5);
}
export function applyWorkMoodContext(root){
  if(!root?.careerSystem)return;
  for(const id of ['alex','mira']){
    const actor=id==='mira'?root.otherSim:root;
    if(!actor)continue;
    actor.workMoodContext=workMoodContext(root.careerSystem.byResident?.[id],root.minutes);
    const contract=root.careerSystem.byResident?.[id];
    const last=contract?.lastShift;
    actor.workRecovery=last&&validTime(last.finishedAt)&&
      root.minutes-last.finishedAt>=0&&root.minutes-last.finishedAt<=180&&
      last.grade==='сложный день'
      ?{until:last.finishedAt+180,strain:last.workReport?.strain||0}:null;
    refreshMind(actor,root.world);
  }
}
/** Impressions use the original emotion engine and whitelist. `at` may
 * be the settlement boundary inside a large tick; actor clock stays intact. */
export function recordWorkFeeling(root,residentId,source,at=root?.minutes){
  const actor=residentId==='mira'?root?.otherSim:residentId==='alex'?root:null;
  if(!actor?.mind||!Object.hasOwn(feelings,source)||!validTime(at))return false;
  const memory={id:source,at,fulfilled:false};
  actor.mind.memories=[...(actor.mind.memories||[]),memory].slice(-12);
  feelMemory({...actor,minutes:at},memory);
  return true;
}
/** Only canonical salary/missed settlement calls this, after W3-C discipline. */
export function recordWorkLifeShift(root,residentId,contract,shift,discipline){
  if(!contract||!shift||!validShiftId(shift.id,contract.employmentId))return null;
  if(!contract.workLife)contract.workLife=newWorkLife();
  const state=contract.workLife;
  if(state.lastProcessedShiftStart>=shift.start)return null;
  const last=contract.lastShift;
  if(last?.id!==shift.id||!['worked','missed'].includes(last.outcome))return null;
  let feeling='worklife.neutral';
  const strain=last.workReport?.strain||0;
  if(discipline?.transition==='final')feeling='worklife.finalWarning';
  else if(discipline?.transition==='warning')feeling='worklife.warning';
  else if(last.outcome==='missed')feeling='worklife.missed';
  else if(last.grade==='сложный день')feeling='worklife.hard';
  else if(last.grade==='удачный день')feeling=strain>=23?'worklife.exhaustedPride':'worklife.success';
  else if(strain>=23)feeling='worklife.overloaded';
  state.lastProcessedShiftStart=shift.start;
  state.recentShifts.push({id:shift.id,start:shift.start,feeling});
  state.recentShifts=state.recentShifts.slice(-5);
  // A completed dismissal is more meaningful than duplicate shift grief;
  // it is emitted only after the later true contract separation.
  if(discipline?.transition!=='dismissal'&&feeling!=='worklife.neutral'){
    const actual=feeling==='worklife.hard'&&strain>=23
      ?'worklife.hardStrain':feeling;
    recordWorkFeeling(root,residentId,actual,last.finishedAt);
    state.lastFeeling=actual;
  }else if(feeling==='worklife.neutral')state.lastFeeling=null;
  return feeling;
}
export function recordWorkLifePromotion(root,residentId,contract,at=root?.minutes){
  if(!contract)return false;
  if(!contract.workLife)contract.workLife=newWorkLife(contract.lastShift);
  contract.workLife.promotedAt=at;
  contract.workLife.lastFeeling='worklife.promotion';
  return recordWorkFeeling(root,residentId,'worklife.promotion',at);
}
export function workLoadLabel(strain){
  return strain>=23?'Высокая':strain>=12?'Заметная':'Низкая';
}

/** Only a true ongoing manual task or genuine partner reservation competes
 * with the imminent shift. Queued future plans do not count as conflicts. */
export function workLifeConflict(root,id,at=root?.minutes){
  const contract=root?.careerSystem?.byResident?.[id];
  const shift=contract?.currentShift;
  const person=id==='mira'?root?.otherSim:id==='alex'?root:null;
  if(contract.workLife?.choiceShiftId===shift?.id)return null;
  if(!person||!shift||shift.phase!=='pending'||!validTime(at)||
    at<shift.start-15||at>=shift.end)return null;
  const active=person.action&&person.action.automatic!==true;
  const s=root.socialAction;
  const shared=s&&s.automatic!==true&&
    (s.initiator===id||s.partner===id)&&
    ['walking','using'].includes(s.phase);
  if(!active&&!shared)return null;
  return {shiftId:shift.id,start:shift.start,end:shift.end,
    lateMinutes:Math.max(0,Math.floor(at-shift.start)),
    activeType:shared?'shared':'manual',canTimeOff:at<shift.start};
}
export function noteWorkLifeConflict(root,id,at){
  const conflict=workLifeConflict(root,id,at);
  const state=root?.careerSystem?.byResident?.[id]?.workLife;
  if(!conflict||!state||state.conflictNotifiedShiftId===conflict.shiftId)
    return false;
  state.conflictNotifiedShiftId=conflict.shiftId;
  return true;
}
