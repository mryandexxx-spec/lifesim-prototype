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
import {kitchenRecipe} from './kitchen.js';
import {insideLot} from './lot-surface.js';
import {validPoolId} from './pool-topology.js';
import {validPoolFixtureId} from './pool-equipment.js';
import {validOutdoorId} from './outdoor-catalog.js';
import {grillRecipe} from './grill-catalog.js';

export const ACTION_QUEUE_SCHEMA=1;
export const MAX_ACTION_QUEUE=12;
export const MAX_BLOCKED_QUEUE=12;
export const BLOCKED_REASONS=Object.freeze(['missing-target','unreachable-route','invalid-destination','unavailable-gift']);
export const ACTION_QUEUE_TYPES=Object.freeze(['object','social','conversation','branch','shared','activity','move','outdoor','garden','pool','grill']);
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const count=n=>Number.isSafeInteger(n)&&n>=1&&n<=1000000000;
const known=(o,k)=>typeof k==='string'&&Object.hasOwn(o,k);
const pair=(id,targetId)=>validPersonId(id)&&validPersonId(targetId)&&id!==targetId;
export function sanitizeQueueCommand(id,raw,persons){
  if(!record(raw)||!Array.isArray(persons)||!persons.includes(id))return null;
  const type=raw.type;
  if(!ACTION_QUEUE_TYPES.includes(type))return null;
  if(type==='grill')return validOutdoorId(raw.instanceId)&&grillRecipe(raw.recipeId)
    ?{type:'grill',instanceId:raw.instanceId,recipeId:raw.recipeId}:null;
  if(type==='outdoor')return validOutdoorId(raw.instanceId)
    ?{type:'outdoor',instanceId:raw.instanceId}:null;
  if(type==='garden')return validOutdoorId(raw.instanceId)&&
    ['water','admire','inspect','harvest','replant'].includes(raw.actionId)
    ?{type:'garden',instanceId:raw.instanceId,actionId:raw.actionId}:null;
  if(type==='pool'){
    if(!validPoolId(raw.poolId)||!['swim','jump'].includes(raw.actionId)||
      (raw.fixtureId!==undefined&&!validPoolFixtureId(raw.fixtureId))||
      (raw.actionId==='jump'&&!raw.fixtureId))return null;
    return {type:'pool',poolId:raw.poolId,actionId:raw.actionId,
      ...(raw.fixtureId?{fixtureId:raw.fixtureId}:{}),
      ...(Number.isFinite(raw.queuedAt)&&raw.queuedAt>=0&&raw.queuedAt<=10000000
        ?{queuedAt:raw.queuedAt}:{})};
  }
  if(type==='move'){
    if(!insideLot(raw.x,raw.z))return null;
    const x=Math.round(raw.x*20)/20,z=Math.round(raw.z*20)/20;
    return insideLot(x,z)?{type:'move',x,z}:null;
  }
  if(type==='object'&&raw.actionId!=='swim'&&known(ACTIONS,raw.actionId)){
    // Optional v1 queue intent: fridge chooses a table when action starts.
    if(raw.autoTable!==undefined&&
      (raw.actionId!=='dining'||raw.autoTable!==true||raw.targetInstanceId!==undefined))
      return null;
    if(raw.autoTable===true){
      if(raw.recipeId!==undefined&&!kitchenRecipe(raw.recipeId))return null;
      return {type,actionId:'dining',autoTable:true,
        ...(raw.recipeId?{recipeId:raw.recipeId}:{})};
    }
    if(raw.targetInstanceId!==undefined&&!validFurnitureInstanceId(raw.targetInstanceId))
      return null;
    if(raw.actionId==='cook'){
      if(!kitchenRecipe(raw.recipeId)||!raw.targetInstanceId)return null;
      return {type,actionId:'cook',targetInstanceId:raw.targetInstanceId,recipeId:raw.recipeId};
    }
    if(raw.actionId==='dining'&&raw.recipeId!==undefined){
      if(!kitchenRecipe(raw.recipeId))return null;
      return {type,actionId:'dining',recipeId:raw.recipeId,
        ...(raw.targetInstanceId?{targetInstanceId:raw.targetInstanceId}:{})};
    }
    // Whitelist one manual variation; other object tasks reject forged flags.
    if(raw.recipeId!==undefined||
      (raw.mirrorPractice!==undefined&&
        (raw.actionId!=='mirror'||raw.mirrorPractice!==true))||
      (raw.tvTalk!==undefined&&
        (raw.actionId!=='tv'||raw.tvTalk!==true)))return null;
    return {type,actionId:raw.actionId,
      ...(raw.targetInstanceId?{targetInstanceId:raw.targetInstanceId}:{}),
      ...(raw.mirrorPractice===true?{mirrorPractice:true}:{}),
      ...(raw.tvTalk===true?{tvTalk:true}:{})};
  }
  // Solo physical hobby queue commands do not have a social target.
  if(type==='activity'){
    const definition=getActivityDefinition(HOBBY_ACTIVITIES,raw.activityId);
    const content=getHobbyContent(HOBBY_CONTENT,raw.contentId);
    if(!definition||definition.source!=='item'||definition.participation!=='solo'||
      !validFurnitureInstanceId(raw.targetInstanceId)||
      (definition.contentKind&&(content?.kind!==definition.contentKind)))return null;
    if(raw.inventoryItemId!==undefined&&(
      definition.id!=='hobby.read.fiction'||
      typeof raw.inventoryItemId!=='string'||
      !/^[am][0-9]{1,8}$/.test(raw.inventoryItemId)))return null;
    return {type,activityId:definition.id,targetInstanceId:raw.targetInstanceId,
      contentId:content?.id||null,
      ...(raw.inventoryItemId?{inventoryItemId:raw.inventoryItemId}:{})};
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
      if(raw.targetInstanceId!==undefined&&(
        !validFurnitureInstanceId(raw.targetInstanceId)||
        !(raw.choiceId==='books'?/^shop-bookcase-[0-9]+$/:/^shop-music-[0-9]+$/)
          .test(raw.targetInstanceId)))return null;
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
  const byResident={},blockedByResident={};
  for(const id of personIds){
    Object.defineProperty(byResident,id,
      {value:[],writable:true,configurable:true,enumerable:true});
    Object.defineProperty(blockedByResident,id,
      {value:[],writable:true,configurable:true,enumerable:true});
  }
  return {schema:ACTION_QUEUE_SCHEMA,nextSeq:1,byResident,blockedByResident};
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
  // Optional schema-1 extension: retired-but-recoverable commands remain in
  // the user's saved plan, outside active FIFO. Legacy saves simply have none.
  for(const id of personIds){
    if(!Array.isArray(raw.blockedByResident?.[id]))continue;
    for(const item of raw.blockedByResident[id]){
      if(q.blockedByResident[id].length>=MAX_BLOCKED_QUEUE)break;
      const command=sanitizeQueueCommand(id,item,personIds);
      if(!count(item?.seq)||seen.has(item.seq)||!command||
        !BLOCKED_REASONS.includes(item.blockedReason))continue;
      seen.add(item.seq);largest=Math.max(largest,item.seq);
      q.blockedByResident[id].push({
        seq:item.seq,...command,blockedReason:item.blockedReason,
        blockedAt:Number.isFinite(item.blockedAt)&&item.blockedAt>=0
          ?Math.min(item.blockedAt,1000000000):0
      });
    }
    q.blockedByResident[id].sort((a,b)=>a.seq-b.seq);
  }
  if(count(raw.nextSeq)&&raw.nextSeq>largest)q.nextSeq=raw.nextSeq;
  else q.nextSeq=largest+1;
  return q;
}
export function pendingActions(queues,residentId){
  return Object.hasOwn(queues?.byResident||{},residentId)
    ?queues.byResident[residentId]:[];
}
export function blockedActions(queues,residentId){
  return Object.hasOwn(queues?.blockedByResident||{},residentId)
    ?queues.blockedByResident[residentId]:[];
}
/** A persistently impossible HEAD cannot monopolize subsequent manual plans.
 * Keep its original command, sequence and human-readable reason in a saved
 * review tray. Never touch currently running actions or another resident.
 */
export function parkQueuedHead(queues,residentId,seq,reason,at=0){
  const active=pendingActions(queues,residentId),parked=blockedActions(queues,residentId);
  if(!count(seq)||!BLOCKED_REASONS.includes(reason)||
    !Array.isArray(active)||!Array.isArray(parked)||
    !active.length||active[0].seq!==seq||parked.length>=MAX_BLOCKED_QUEUE)return false;
  const task=active.shift();
  parked.push({...task,blockedReason:reason,
    blockedAt:Number.isFinite(at)&&at>=0?Math.min(at,1000000000):0});
  return true;
}
/** Rescue of an already accepted active manual invitation when its future
 * FIFO is full. This keeps the plan in the saved review tray and releases the
 * shared social lock without erasing or jumping ahead of existing entries.
 */
export function parkInterruptedAction(queues,residentId,request,reason,at=0){
  const parked=blockedActions(queues,residentId),persons=Object.keys(queues?.byResident||{});
  if(!Array.isArray(parked)||parked.length>=MAX_BLOCKED_QUEUE||
    !count(queues?.nextSeq)||!BLOCKED_REASONS.includes(reason))return null;
  const command=sanitizeQueueCommand(residentId,request,persons);
  if(!command)return null;
  const task={seq:queues.nextSeq++,...command,blockedReason:reason,
    blockedAt:Number.isFinite(at)&&at>=0?Math.min(at,1000000000):0};
  parked.push(task);
  return task;
}
/** Explicit user retry only: re-enter at FIFO tail with a fresh unique seq. */
export function retryBlockedAction(queues,residentId,seq,at=0){
  const parked=blockedActions(queues,residentId),active=pendingActions(queues,residentId);
  if(!count(seq)||!Array.isArray(parked)||!Array.isArray(active)||
    active.length>=MAX_ACTION_QUEUE||!count(queues?.nextSeq))return null;
  const index=parked.findIndex(task=>task.seq===seq);
  if(index<0)return null;
  const command=sanitizeQueueCommand(residentId,parked[index],
    Object.keys(queues.byResident));
  if(!command)return null;
  if(command.type==='pool')command.queuedAt=Number.isFinite(at)&&at>=0?at:0;
  const task={seq:queues.nextSeq++,...command};
  active.push(task);parked.splice(index,1);
  return task;
}
export function removeBlockedAction(queues,residentId,seq){
  const items=blockedActions(queues,residentId);
  if(!count(seq)||!Array.isArray(items))return false;
  const index=items.findIndex(task=>task.seq===seq);
  if(index<0)return false;
  items.splice(index,1);return true;
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
