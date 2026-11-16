/** H0: pure, serializable session lifecycle. No routes, renderer or rewards. */
import {getActivityDefinition} from './activity-registry.js';
import {getHobbyContent} from './hobby-content.js';
export const ACTIVITY_SESSION_SCHEMA=1;
const ACTOR=/^[a-z][a-z0-9_-]{1,63}$/;
const INSTANCE=/^[a-z][a-z0-9-]{2,63}$/;
const SESSION=/^[a-z][a-z0-9._:-]{1,95}$/;
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=(v,regex)=>typeof v==='string'&&regex.test(v);
const copy=s=>({...s});
export function createActivitySession(registry,params,content=null){
  if(!record(params))return null;
  const def=getActivityDefinition(registry,params.activityId);
  if(!def||!id(params.sessionId,SESSION)||!id(params.actorId,ACTOR))return null;
  const paired=def.participation==='paired',partnerId=params.partnerId??null;
  if(paired?(!id(partnerId,ACTOR)||partnerId===params.actorId):partnerId!==null)
    return null;
  const targetInstanceId=params.targetInstanceId??null;
  const inventoryItemId=params.inventoryItemId??null;
  if(def.source==='item'
    ?(!id(targetInstanceId,INSTANCE)||inventoryItemId!==null)
    :(!id(inventoryItemId,SESSION)||targetInstanceId!==null))return null;
  const contentId=params.contentId??null;
  if(def.contentKind){
    const item=getHobbyContent(content,contentId);
    if(!item||item.kind!==def.contentKind)return null;
  }else if(contentId!==null)return null;
  return {schema:ACTIVITY_SESSION_SCHEMA,sessionId:params.sessionId,
    activityId:def.id,actorId:params.actorId,partnerId,targetInstanceId,
    inventoryItemId,contentId,phase:'walking',elapsed:0,awardedMinutes:0,
    receiptId:null};
}
export function restoreActivitySession(registry,raw,content=null){
  if(!record(raw)||raw.schema!==ACTIVITY_SESSION_SCHEMA||
    !['walking','using','ready'].includes(raw.phase))return null;
  const expected=createActivitySession(registry,raw,content);
  if(!expected||!Number.isFinite(raw.elapsed)||!Number.isFinite(raw.awardedMinutes)||
    raw.elapsed<0||raw.awardedMinutes<0||raw.awardedMinutes>raw.elapsed||
    raw.receiptId!==null)return null;
  const def=getActivityDefinition(registry,raw.activityId);
  const max=def.timeBudget.targetMinutes;
  if(raw.elapsed>max||
    (raw.phase==='walking'&&(raw.elapsed!==0||raw.awardedMinutes!==0))||
    (raw.phase==='using'&&raw.elapsed>=max)||
    (raw.phase==='ready'&&raw.elapsed!==max))return null;
  return {...expected,phase:raw.phase,elapsed:raw.elapsed,
    awardedMinutes:raw.awardedMinutes};
}
/** Caller authorizes real A* arrival and ownership; these booleans are not proofs. */
export function arriveActivitySession(session,{authorized=false,resourceAvailable=false}={}){
  if(session?.phase!=='walking'||authorized!==true||resourceAvailable!==true)
    return null;
  return {...copy(session),phase:'using'};
}
/** No progress before arrival, during pause or without a valid physical source. */
export function advanceActivitySession(registry,session,minutes,
  {authorized=false,resourceAvailable=false,paused=false}={}){
  const def=getActivityDefinition(registry,session?.activityId);
  if(!def||!session||session.phase!=='using'||authorized!==true||
    resourceAvailable!==true||paused===true||
    !Number.isFinite(minutes)||minutes<=0||minutes>1440)
    return {session,usedMinutes:0};
  const elapsed=Math.min(def.timeBudget.targetMinutes,session.elapsed+minutes);
  const usedMinutes=elapsed-session.elapsed;
  if(usedMinutes<=0)return {session,usedMinutes:0};
  return {session:{...copy(session),elapsed,
    phase:elapsed===def.timeBudget.targetMinutes?'ready':'using'},usedMinutes};
}
/** Completion requires an externally authorized event; never awards on its own. */
export function completeActivitySession(registry,session,
  {authorized=false,resourceAvailable=false,eventId=null}={}){
  if(!getActivityDefinition(registry,session?.activityId)||
    session?.phase!=='ready'||authorized!==true||resourceAvailable!==true||
    !id(eventId,SESSION))return null;
  return {...copy(session),phase:'done',receiptId:eventId};
}
export function cancelActivitySession(session){
  if(!session||!['walking','using','ready'].includes(session.phase))return null;
  return {...copy(session),phase:'canceled',receiptId:null};
}
