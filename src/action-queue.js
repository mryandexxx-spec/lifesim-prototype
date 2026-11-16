/** Блин’С — typed, persistent action queues for any resident identity.
 * Renderer-agnostic: commands only identify intent; execution happens in an
 * adapter after both participants and scene resources become available.
 */
import {validPersonId} from './social-graph.js';
import {ACTIONS} from './simulation.js';
import {CONVERSATION_TOPICS} from './conversation-engine.js';
import {GIFT_CATALOG,LEISURE_CATALOG} from './gifts-leisure.js';
import {BRANCH_ACTIONS} from './social-graph.js';
import {validFurnitureInstanceId} from './furniture-catalog.js';
import {getActivityDefinition} from './activity-registry.js';
import {getHobbyContent} from './hobby-content.js';
import {HOBBY_ACTIVITIES,HOBBY_CONTENT} from './hobby-reading.js';

export const ACTION_QUEUE_SCHEMA=1;
export const MAX_ACTION_QUEUE=12;
export const ACTION_QUEUE_TYPES=Object.freeze(['object','social','conversation','branch','shared','activity']);
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const count=n=>Number.isSafeInteger(n)&&n>=1&&n<=1000000000;
const known=(o,k)=>typeof k==='string'&&Object.hasOwn(o,k);
const pair=(id,targetId)=>validPersonId(id)&&validPersonId(targetId)&&id!==targetId;
export function sanitizeQueueCommand(id,raw,persons){
  if(!record(raw)||!Array.isArray(persons)||!persons.includes(id))return null;
  const type=raw.type;
  if(!ACTION_QUEUE_TYPES.includes(type))return null;
  if(type==='object'&&known(ACTIONS,raw.actionId)){
    if(raw.targetInstanceId!==undefined&&!validFurnitureInstanceId(raw.targetInstanceId))
      return null;
    return raw.targetInstanceId
      ?{type,actionId:raw.actionId,targetInstanceId:raw.targetInstanceId}
      :{type,actionId:raw.actionId};
  }
  // Solo physical hobby queue commands do not have a social target.
  if(type==='activity'){
    const definition=getActivityDefinition(HOBBY_ACTIVITIES,raw.activityId);
    const content=getHobbyContent(HOBBY_CONTENT,raw.contentId);
    if(!definition||definition.source!=='item'||definition.participation!=='solo'||
      !validFurnitureInstanceId(raw.targetInstanceId)||
      (definition.contentKind&&(content?.kind!==definition.contentKind)))return null;
    return {type,activityId:definition.id,targetInstanceId:raw.targetInstanceId,
      contentId:content?.id||null};
  }
  if(type==='object'||!pair(id,raw.targetId)||!persons.includes(raw.targetId))return null;
  const targetId=raw.targetId;
  if(type==='social'&&['talk','argue'].includes(raw.actionId))
    return {type,targetId,actionId:raw.actionId};
  if(type==='conversation'&&known(CONVERSATION_TOPICS,raw.topicId))
    return {type,targetId,topicId:raw.topicId};
  if(type==='branch'&&known(BRANCH_ACTIONS,raw.actionId))
    return {type,targetId,actionId:raw.actionId};
  if(type==='shared'&&raw.mode==='gift'&&
    typeof raw.choiceId==='string'&&/^[a-z][0-9]{1,8}$/.test(raw.choiceId))
    return {type,targetId,mode:'gift',choiceId:raw.choiceId};
  if(type==='shared'&&raw.mode==='leisure'&&known(LEISURE_CATALOG,raw.choiceId)){
    if(raw.choiceId==='tv'){
      if(raw.targetInstanceId!==undefined&&!validFurnitureInstanceId(raw.targetInstanceId))
        return null;
      return {type,targetId,mode:'leisure',choiceId:'tv',
        targetInstanceId:raw.targetInstanceId||'home-tv-1'};
    }
    if(['books','music'].includes(raw.choiceId)){
      if(raw.targetInstanceId!==undefined&&
        !validFurnitureInstanceId(raw.targetInstanceId))return null;
      return {type,targetId,mode:'leisure',choiceId:raw.choiceId,
        ...(raw.targetInstanceId?{targetInstanceId:raw.targetInstanceId}:{})};
    }
    if(raw.targetInstanceId!==undefined)return null;
    return {type,targetId,mode:'leisure',choiceId:raw.choiceId};
  }
  return null;
}
export function newActionQueues(personIds=[]){
  if(!Array.isArray(personIds)||personIds.some(id=>!validPersonId(id))||
    new Set(personIds).size!==personIds.length)throw new TypeError('Invalid queue residents');
  const byResident={};
  for(const id of personIds)Object.defineProperty(byResident,id,
    {value:[],writable:true,configurable:true,enumerable:true});
  return {schema:ACTION_QUEUE_SCHEMA,nextSeq:1,byResident};
}
export function restoreActionQueues(raw,personIds=[]){
  const q=newActionQueues(personIds);
  if(!record(raw)||raw.schema!==ACTION_QUEUE_SCHEMA||!record(raw.byResident))return q;
  const seen=new Set();
  let largest=0;
  for(const id of personIds){
    if(!Array.isArray(raw.byResident[id]))continue;
    for(const item of raw.byResident[id]){
      if(q.byResident[id].length>=MAX_ACTION_QUEUE)break;
      const sanitized=sanitizeQueueCommand(id,item,personIds);
      if(!count(item?.seq)||seen.has(item.seq)||!sanitized)continue;
      seen.add(item.seq);largest=Math.max(largest,item.seq);
      q.byResident[id].push({seq:item.seq,...sanitized});
    }
    q.byResident[id].sort((a,b)=>a.seq-b.seq);
  }
  if(count(raw.nextSeq)&&raw.nextSeq>largest)q.nextSeq=raw.nextSeq;
  else q.nextSeq=largest+1;
  return q;
}
export function pendingActions(queues,residentId){
  return Object.hasOwn(queues?.byResident||{},residentId)
    ?queues.byResident[residentId]:[];
}
export function enqueueAction(queues,residentId,request){
  if(!record(queues)||!count(queues.nextSeq)||
    !Object.hasOwn(queues.byResident||{},residentId))return null;
  const persons=Object.keys(queues.byResident);
  const task=sanitizeQueueCommand(residentId,request,persons);
  if(!task||pendingActions(queues,residentId).length>=MAX_ACTION_QUEUE)return null;
  const result={seq:queues.nextSeq++,...task};
  queues.byResident[residentId].push(result);
  return result;
}
export function removeQueuedAction(queues,residentId,seq){
  if(!count(seq)||!Object.hasOwn(queues?.byResident||{},residentId))return false;
  const items=queues.byResident[residentId],index=items.findIndex(x=>x.seq===seq);
  if(index<0)return false;
  items.splice(index,1);return true;
}
export function queueHeads(queues){
  if(!record(queues?.byResident))return [];
  return Object.entries(queues.byResident).filter(([,v])=>Array.isArray(v)&&v.length)
    .map(([residentId,items])=>({residentId,command:items[0]}))
    .sort((a,b)=>a.command.seq-b.command.seq);
}
/** Explicitly acknowledged dispatch: never remove a pending task until
 * execution accepts it, or the same resident explicitly refuses OPTIONAL
 * work at the dispatch boundary. A refusal is not an action-completion event,
 * and a later queue entry must wait for a later dispatch pass (strict FIFO).
 */
export function dispatchActionQueues(queues,{canStart,start,beforeStart,onRefused}={}){
  if(typeof canStart!=='function'||typeof start!=='function')return [];
  const started=[];
  for(const {residentId,command} of queueHeads(queues)){
    if(!canStart(residentId,command))continue;
    // Keep the "resource busy" retry semantics separate from an actual
    // initiator refusal, evaluated only when the head could start.
    const refusal=typeof beforeStart==='function'
      ?beforeStart(residentId,command):null;
    if(typeof refusal==='string'&&refusal.length>0){
      const current=pendingActions(queues,residentId);
      if(current[0]?.seq===command.seq){
        current.shift();
        if(typeof onRefused==='function')onRefused(residentId,command,refusal);
      }
      continue;
    }
    if(start(residentId,command)===true){
      const current=pendingActions(queues,residentId);
      if(current[0]?.seq===command.seq)current.shift();
      started.push({residentId,command});
    }
  }
  return started;
}
