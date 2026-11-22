/** G: optional root-v1 remote calls; one game clock, no A* or separate money. */
import {pendingActions} from './action-queue.js';
import {residentWorkPhase} from './career-work.js';
import {pendingWorkIncident} from './career-incidents.js';
import {applySocialEvent} from './social-graph.js';
import {creditCompletedSocialNeed} from './social-need.js';

export const PHONE_CALLS_SCHEMA=1;
export const CALL_DURATION=8;
export const CALL_COOLDOWN=60;
const LIMIT=32,IDS=['alex','mira'];
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const validTime=x=>Number.isFinite(x)&&x>=0&&x<=1e7;
const validId=x=>Number.isSafeInteger(x)&&x>0&&x<Number.MAX_SAFE_INTEGER;
const actor=(root,id)=>id==='alex'?root:root?.otherSim;
const other=id=>id==='alex'?'mira':'alex';
const clamp=n=>Math.max(0,Math.min(100,n));
export const newPhoneCalls=()=>({schema:1,nextId:1,active:null,lastCompletedAt:null,receipts:[]});

export function restorePhoneCalls(raw,now=0){
  const state=newPhoneCalls();
  if(!record(raw)||raw.schema!==1||!validId(raw.nextId)||!validTime(now))return state;
  state.nextId=raw.nextId;
  const seen=new Set();
  for(const r of (Array.isArray(raw.receipts)?raw.receipts:[]).slice(-LIMIT)){
    if(!record(r)||!validId(r.id)||r.id>=state.nextId||seen.has(r.id)||
      !validTime(r.at)||r.at>now||!IDS.includes(r.from)||r.to!==other(r.from))continue;
    state.receipts.push({id:r.id,at:r.at,from:r.from,to:r.to});seen.add(r.id);
  }
  if(validTime(raw.lastCompletedAt)&&raw.lastCompletedAt<=now)
    state.lastCompletedAt=raw.lastCompletedAt;
  const a=raw.active;
  if(record(a)&&validId(a.id)&&a.id<state.nextId&&!seen.has(a.id)&&
    IDS.includes(a.from)&&a.to===other(a.from)&&validTime(a.startedAt)&&
    a.startedAt<=now&&validTime(a.endAt)&&a.endAt===a.startedAt+CALL_DURATION&&
    (state.lastCompletedAt===null||a.startedAt>=state.lastCompletedAt))
    state.active={id:a.id,from:a.from,to:a.to,startedAt:a.startedAt,endAt:a.endAt};
  return state;
}
export function phoneContactStatus(root,id){
  if(!IDS.includes(id)||!actor(root,id)||!record(root?.careerSystem))
    return {ok:false,reason:'invalid-resident',label:'Контакт недоступен'};
  const phase=residentWorkPhase(root,id);
  if(phase==='departing')return {ok:false,reason:'departing',label:'По пути на работу'};
  if(phase==='returning')return {ok:false,reason:'returning',label:'Возвращается домой'};
  if(root.recruitmentSystem?.byResident?.[id]?.phase==='interview_active'||
    pendingWorkIncident(root,id))
    return {ok:false,reason:'mandatory-choice',label:'Требуется важное решение'};
  if(root.socialAction||root.phoneCalls?.active)
    return {ok:false,reason:'busy',label:'Уже занят разговором'};
  if(phase!=='working'&&(actor(root,id)?.action||pendingActions(root.actionQueues,id).length))
    return {ok:false,reason:'busy',label:'Занят действием'};
  return {ok:true,reason:null,label:phase==='working'?'На работе · на связи':'На связи'};
}
export function startPhoneCall(root,from,to){
  if(!IDS.includes(from)||to!==other(from)||!validTime(root?.minutes))
    return {ok:false,reason:'invalid-resident'};
  if(root.paused)return {ok:false,reason:'paused'};
  if(!record(root.phoneCalls)||root.phoneCalls.schema!==1||
    !validId(root.phoneCalls.nextId)||!Array.isArray(root.phoneCalls.receipts))
    return {ok:false,reason:'invalid-state'};
  if(root.phoneCalls.active)return {ok:false,reason:'busy'};
  if(root.phoneCalls.lastCompletedAt!==null&&
    root.minutes-root.phoneCalls.lastCompletedAt<CALL_COOLDOWN)
    return {ok:false,reason:'cooldown'};
  for(const id of [from,to]){
    const status=phoneContactStatus(root,id);
    if(!status.ok)return {ok:false,reason:status.reason,who:id};
  }
  const id=root.phoneCalls.nextId++;
  root.phoneCalls.active={id,from,to,startedAt:root.minutes,endAt:root.minutes+CALL_DURATION};
  return {ok:true,id,endAt:root.phoneCalls.active.endAt};
}
export function cancelPhoneCall(root,reason='cancelled'){
  if(!root?.phoneCalls?.active)return {ok:false,reason:'no-call'};
  root.phoneCalls.active=null;
  return {ok:true,reason};
}
export function progressPhoneCalls(root,now=root?.minutes){
  const a=root?.phoneCalls?.active;
  if(!a||root.paused||!validTime(now)||!validTime(root.minutes))return [];
  if(!validId(a.id)||a.id>=root.phoneCalls.nextId||!IDS.includes(a.from)||
    a.to!==other(a.from)||!validTime(a.startedAt)||a.startedAt>now||
    a.endAt!==a.startedAt+CALL_DURATION){
    cancelPhoneCall(root,'invalid');return [];
  }
  if(root.phoneCalls.receipts.some(r=>r.id===a.id)){
    cancelPhoneCall(root,'already-credited');return [];
  }
  root.phoneCalls.active=null;
  const statuses=[phoneContactStatus(root,a.from),phoneContactStatus(root,a.to)];
  root.phoneCalls.active=a;
  if(statuses.some(s=>!s.ok)){cancelPhoneCall(root,'interrupted');return [];}
  if(now<a.endAt)return [];
  if(!root.socialGraph||!root.relationship?.views?.alex||
    !root.relationship?.views?.mira||!record(root.needs)||
    !record(root.otherSim?.needs)){
    cancelPhoneCall(root,'invalid-social');return [];
  }
  const receipt=applySocialEvent(root.socialGraph,{
    type:'phone.call',at:now,actorId:a.from,targetId:a.to,token:'phone.call.'+a.id
  },{observedViews:root.relationship.views});
  if(!receipt){cancelPhoneCall(root,'invalid-receipt');return [];}
  creditCompletedSocialNeed({alex:root,mira:root.otherSim},receipt);
  root.relationship.affinity=clamp(root.relationship.affinity+1);
  for(const id of IDS){
    const view=root.relationship.views[id];
    view.friendship=clamp((Number.isFinite(view.friendship)?view.friendship:50)+1);
    actor(root,id).event='Приятный телефонный разговор';
  }
  root.phoneCalls.receipts.push({id:a.id,at:now,from:a.from,to:a.to});
  root.phoneCalls.receipts=root.phoneCalls.receipts.slice(-LIMIT);
  root.phoneCalls.lastCompletedAt=now;
  root.phoneCalls.active=null;
  return [{type:'phone-call',residentId:a.from,
    text:'Телефонный разговор завершён · общение +6 обоим, отношения +1'}];
}
