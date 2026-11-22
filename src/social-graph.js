import {initialPairEpisodes,rememberPairReceipt,restorePairEpisodes,episodeAppraisal} from './social-episodes.js';
import {newSocialKnowledge,discoverPreference,restoreSocialKnowledge,discoveryNotes} from './social-compatibility.js';
import {newSocialCues,observeSocialCue,restoreSocialCues,socialCueNotes,cueConversationBias} from './social-boundaries.js';
import {evaluateSocialReaction} from './social-reactions.js';
import {ROMANCE_ACTION_IDS,newRomanceState,restoreRomanceState,romanceClimate,setLifeStage,
  addFamilyLink,romanceSafety,romanceAvailability,recordRomanceReceipt,
  currentDatingPartner} from './romance.js';
export {setLifeStage,addFamilyLink,romanceSafety,romanceAvailability} from './romance.js';
/** Блин’С social graph V1: N residents, N sparse links. No renderer/household imports.
 * Legacy two-resident values are observational inputs from an external adapter.
 */
export const GRAPH_SCHEMA=1;
export const MAX_PEOPLE=512;
export const MAX_PAIRS=8192;
export const EVENT_LIMIT=32;
const DAY=1440;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export const validPersonId=id=>typeof id==='string'&&/^[a-zA-Z][a-zA-Z0-9_-]{0,47}$/.test(id);
const safeAt=at=>Number.isFinite(at)&&at>=0&&at<=1e7;
const view=()=>({friendship:50,trust:45,tension:0});
const safeView=(raw,fallback=view())=>{
  const output={...fallback};
  if(record(raw))for(const axis of ['friendship','trust','tension'])
    if(Number.isFinite(raw[axis]))output[axis]=clamp(Math.round(raw[axis]),0,100);
  return output;
};
export function pairKey(a,b){
  if(!validPersonId(a)||!validPersonId(b)||a===b)return null;
  return JSON.stringify(a<b?[a,b]:[b,a]);
}
const names=key=>{
  if(typeof key!=='string')return null;
  try{
    const arr=JSON.parse(key);
    return Array.isArray(arr)&&arr.length===2&&pairKey(arr[0],arr[1])===key?arr:null;
  }catch{return null;}
};
const makePair=(a,b)=>({
  ids:[a,b],metAt:null,views:{[a]:view(),[b]:view()},
  counts:{positive:0,negative:0},positiveDays:[],
  counted:[],negativeSinceFriend:0,positiveSinceRival:0,
  friendship:'none',rivalry:'none',romance:newRomanceState([a,b]),
  lastAt:null,events:[],episodes:initialPairEpisodes(a,b),knowledge:newSocialKnowledge(a,b),cues:newSocialCues(a,b),revision:0
});
const adj=graph=>{
  if(graph._links)return graph._links;
  const map=new Map(graph.persons.map(id=>[id,new Set()]));
  for(const [key,pair] of Object.entries(graph.pairs)){
    const ids=names(key);if(!ids||!map.has(ids[0])||!map.has(ids[1]))continue;
    map.get(ids[0]).add(key);map.get(ids[1]).add(key);
  }
  Object.defineProperty(graph,'_links',{value:map,writable:true,configurable:true,enumerable:false});
  return map;
};
export function newSocialGraph(personIds=[]){
  if(!Array.isArray(personIds)||personIds.length>MAX_PEOPLE)throw new RangeError('Invalid residents');
  const persons=[];
  for(const id of personIds){
    if(!validPersonId(id)||persons.includes(id))throw new TypeError('Duplicate or invalid resident id');
    persons.push(id);
  }
  return {schema:GRAPH_SCHEMA,persons,nextSeq:1,pairs:{},lifeStages:{},familyLinks:[]};
}
export function registerPerson(graph,id){
  if(!record(graph)||!validPersonId(id)||!Array.isArray(graph.persons))return false;
  if(graph.persons.includes(id))return true;
  if(graph.persons.length>=MAX_PEOPLE)return false;
  graph.persons.push(id);
  if(graph._links)graph._links.set(id,new Set());
  return true;
}
export function getPair(graph,idA,idB){
  const key=pairKey(idA,idB);
  return key&&record(graph?.pairs)&&Object.hasOwn(graph.pairs,key)?graph.pairs[key]:null;
}
export function getOrCreatePair(graph,idA,idB){
  const key=pairKey(idA,idB);
  if(!key||!graph?.persons?.includes(idA)||!graph.persons.includes(idB))return null;
  if(Object.hasOwn(graph.pairs,key))return graph.pairs[key];
  if(Object.keys(graph.pairs).length>=MAX_PAIRS)return null;
  const [a,b]=names(key),pair=makePair(a,b);
  graph.pairs[key]=pair;
  if(graph._links){graph._links.get(a)?.add(key);graph._links.get(b)?.add(key);}
  return pair;
}
/** Existing generic pair owns all lasting episodes; only a derived bias is passed
 * to the single social-reactions evaluator. No mutable duplicated relationship.
 */
export function episodeContext(graph,personId,otherId,minutes){
  return episodeAppraisal(getPair(graph,personId,otherId),personId,minutes);
}
/** Only a confirmed canonical event can disclose a real interest. */
export function learnSocialPreference(graph,receipt,viewerId,targetId,targetProfile,tag){
  const pair=getPair(graph,viewerId,targetId);
  return pair?discoverPreference(pair,receipt,viewerId,targetId,targetProfile,tag):null;
}
/** Player-facing knowledge is per point of view; no spoilers for unseen traits. */
export function socialKnowledgeNotes(graph,viewerId,targetId,limit=4){
  return discoveryNotes(getPair(graph,viewerId,targetId),viewerId,limit);
}
/** A one-sided communication observation, only after a committed conversation. */
export function learnSocialCue(graph,receipt,viewerId,targetId,actionId,accepted){
  const pair=getPair(graph,viewerId,targetId);
  return pair?observeSocialCue(pair,receipt,viewerId,targetId,actionId,accepted):null;
}
/** Read-only cues and learned expectations, no technical probability in UI. */
export function socialCommunicationNotes(graph,viewerId,targetId,limit=3){
  return socialCueNotes(getPair(graph,viewerId,targetId),viewerId,limit);
}
export function socialCommunicationBias(graph,viewerId,targetId,actionId){
  return cueConversationBias(getPair(graph,viewerId,targetId),viewerId,actionId);
}
export function getDirectedView(graph,sourceId,targetId){
  const pair=getPair(graph,sourceId,targetId);
  return pair?.views?.[sourceId]||null;
}
export function listRelationsFor(graph,personId){
  if(!graph?.persons?.includes(personId))return [];
  const keys=adj(graph).get(personId)||new Set();
  return [...keys].map(k=>graph.pairs[k]).filter(Boolean);
}
export function markAcquainted(graph,a,b,at){
  if(!safeAt(at))return false;
  const pair=getOrCreatePair(graph,a,b);
  if(!pair)return false;
  if(pair.metAt!==null)return true;
  pair.metAt=at;pair.revision++;
  return true;
}
/** Pure two-perspective snapshot bridge; don't replay score effects from old saves. */
export function observePairViews(graph,idA,idB,views){
  const pair=getOrCreatePair(graph,idA,idB);
  if(!pair||!record(views))return false;
  if(!record(views[idA])||!record(views[idB]))return false;
  pair.views[idA]=safeView(views[idA],pair.views[idA]);
  pair.views[idB]=safeView(views[idB],pair.views[idB]);
  return true;
}
const POSITIVE=new Set(['phone.call','sports.discuss','sports.disagree','talk','conversation.talk','gift.accepted','leisure.accepted',
  'acquaint.chat','friend.tease','friend.confide','rival.truce',
  'romance.flirt','romance.confess','romance.date',
  'romance.tender','romance.propose','romance.marry',
  'romance.checkin','romance.repair','romance.hug','romance.kiss',
  'romance.intimacy','romance.evening']);
const NEGATIVE=new Set(['argue','conversation.argue','gift.refused','leisure.refused',
  'rival.taunt','friend.tease.refused','friend.confide.refused','rival.truce.refused','acquaint.chat.refused',
  'romance.flirt.refused','romance.confess.refused',
  'romance.date.refused','romance.breakup','romance.divorce',
  'romance.tender.refused','romance.propose.refused','romance.marry.refused',
  'romance.checkin.refused','romance.repair.refused',
  'romance.hug.refused','romance.kiss.refused','romance.intimacy.refused',
  'romance.evening.refused','romance.jealousy']);
const TYPES=new Set([...POSITIVE,...NEGATIVE,'introduced']);
const positive=type=>POSITIVE.has(type);
const weights={
  'phone.call':{friendship:1,trust:0,tension:0},
  'sports.discuss':{friendship:1,trust:1,tension:0},
  'sports.disagree':{friendship:0,trust:0,tension:0},
  talk:{friendship:6,trust:3,tension:-3},
  'conversation.talk':{friendship:5,trust:4,tension:-3},
  'gift.accepted':{friendship:5,trust:4,tension:-3},
  'leisure.accepted':{friendship:5,trust:3,tension:-3},
  'acquaint.chat':{friendship:5,trust:3,tension:-2},
  'friend.tease':{friendship:4,trust:3,tension:-2},
  'friend.confide':{friendship:6,trust:6,tension:-3},
  'rival.truce':{friendship:4,trust:6,tension:-10},
  'romance.flirt':{friendship:1,trust:1,tension:-1},
  'romance.confess':{friendship:2,trust:2,tension:-1},
  'romance.date':{friendship:2,trust:2,tension:-1},
  'romance.tender':{friendship:1,trust:2,tension:-1},
  'romance.propose':{friendship:2,trust:2,tension:-1},
  'romance.marry':{friendship:2,trust:2,tension:-1},
  'romance.checkin':{friendship:1,trust:2,tension:-1},
  'romance.repair':{friendship:1,trust:3,tension:-3},
  'romance.hug':{friendship:1,trust:1,tension:-1},
  'romance.kiss':{friendship:1,trust:1,tension:-1},
  'romance.intimacy':{friendship:1,trust:2,tension:-1},
  'romance.evening':{friendship:1,trust:3,tension:-2},
  argue:{friendship:-9,trust:-9,tension:12},
  'conversation.argue':{friendship:-9,trust:-9,tension:12},
  'gift.refused':{friendship:-2,trust:-3,tension:4},
  'leisure.refused':{friendship:-3,trust:-2,tension:4},
  'rival.taunt':{friendship:-7,trust:-5,tension:12},
  'friend.tease.refused':{friendship:-4,trust:-5,tension:7},
  'friend.confide.refused':{friendship:-3,trust:-6,tension:6},
  'rival.truce.refused':{friendship:-2,trust:-2,tension:6},
  'acquaint.chat.refused':{friendship:-2,trust:-2,tension:3},
  'romance.flirt.refused':{friendship:0,trust:-1,tension:1},
  'romance.confess.refused':{friendship:0,trust:-2,tension:2},
  'romance.date.refused':{friendship:0,trust:-1,tension:1},
  'romance.breakup':{friendship:0,trust:-1,tension:1},
  'romance.divorce':{friendship:0,trust:-1,tension:1},
  'romance.tender.refused':{friendship:0,trust:-1,tension:1},
  'romance.propose.refused':{friendship:0,trust:-1,tension:1},
  'romance.marry.refused':{friendship:0,trust:-1,tension:1},
  'romance.checkin.refused':{friendship:0,trust:0,tension:0},
  'romance.repair.refused':{friendship:0,trust:0,tension:0},
  'romance.hug.refused':{friendship:0,trust:0,tension:0},
  'romance.kiss.refused':{friendship:0,trust:0,tension:0},
  'romance.intimacy.refused':{friendship:0,trust:0,tension:0},
  'romance.evening.refused':{friendship:0,trust:0,tension:0},
  'romance.jealousy':{friendship:0,trust:0,tension:0}
};
function recompute(pair){
  const [a,b]=pair.ids,v=pair.views;
  const mutualFriend=pair.ids.every(id=>v[id].friendship>=65&&v[id].trust>=50);
  const close=pair.ids.every(id=>v[id].friendship>=85&&v[id].trust>=75);
  const positiveDays=new Set(pair.positiveDays).size;
  if(pair.friendship==='none'&&mutualFriend&&pair.counts.positive>=3&&positiveDays>=2){
    pair.friendship='friends';pair.negativeSinceFriend=0;
  }
  if(pair.friendship==='friends'&&close&&pair.counts.positive>=7&&positiveDays>=3)
    pair.friendship='close';
  if(pair.friendship!=='none'&&pair.negativeSinceFriend>=2&&
    pair.ids.some(id=>v[id].friendship<45||v[id].trust<35))
    pair.friendship='none';
  const hostile=pair.ids.map(id=>v[id].tension>=65&&v[id].friendship<=30);
  const rivalry=pair.counts.negative>=2
    ?hostile.every(Boolean)?'mutual':hostile.some(Boolean)?'oneSided':'none'
    :'none';
  if(pair.rivalry==='none'&&rivalry!=='none'){pair.rivalry=rivalry;pair.positiveSinceRival=0;}
  else if(pair.rivalry!=='none'){
    if(pair.positiveSinceRival>=2&&pair.ids.every(id=>v[id].tension<40))
      pair.rivalry='none';
    else if(rivalry==='mutual')pair.rivalry='mutual';
    else if(rivalry==='oneSided'&&pair.rivalry==='mutual')
      pair.rivalry='oneSided';
  }
}
/** Only an explicitly witnessed completed incident creates a jealousy
 * memory. This does NOT infer what other residents know from omniscient
 * graph state; the 2-person 3D scene does not currently send witnesses.
 */
function recordWitnessedJealousy(graph,source,partnerId,witnessId){
  const pair=getPair(graph,partnerId,witnessId);
  const bond=pair?.romance?.bond;
  const expectation=pair?.romance?.views?.[witnessId];
  if(!pair||!['dating','engaged','married'].includes(bond?.status)||
    expectation?.exclusivity!=='exclusive'||!safeAt(bond.since)||
    source.at<bond.since||pair.events.some(e=>
      e.type==='romance.jealousy'&&e.causeSeq===source.seq))return null;
  const receipt={seq:graph.nextSeq++,type:'romance.jealousy',at:source.at,
    actorId:witnessId,targetId:partnerId,causeSeq:source.seq};
  pair.events.push(receipt);pair.events=pair.events.slice(-EVENT_LIMIT);
  pair.lastAt=Math.max(pair.lastAt??0,source.at);
  expectation.jealousy=clamp((expectation.jealousy??0)+24,0,100);
  pair.views[witnessId].trust=clamp(pair.views[witnessId].trust-8,0,100);
  pair.views[witnessId].tension=clamp(pair.views[witnessId].tension+10,0,100);
  pair.revision++;
  return receipt;
}
export function applySocialEvent(graph,event,{observedViews=null}={}){
  // Jealousy is derived, never directly issued or queue-spawned.
  if(event?.type==='romance.jealousy')return null;
  if(!record(event)||!TYPES.has(event.type)||!safeAt(event.at)||
    !validPersonId(event.actorId)||!validPersonId(event.targetId)||
    event.actorId===event.targetId||!Number.isSafeInteger(graph?.nextSeq))return null;
  const romanceEvent=ROMANCE_ACTION_IDS.some(id=>
    event.type===id||event.type===id+'.refused');
  if(romanceEvent&&!['romance.breakup','romance.divorce'].includes(event.type)&&
    !romanceSafety(graph,event.actorId,event.targetId).allowed)return null;
  // Direct graph callers must not bypass the same third-party restriction as
  // the UI. Otherwise an invalid flirt could fabricate a jealousy incident.
  if(event.type==='romance.flirt'&&
    ((currentDatingPartner(graph,event.actorId)&&
      currentDatingPartner(graph,event.actorId)!==event.targetId)||
     (currentDatingPartner(graph,event.targetId)&&
      currentDatingPartner(graph,event.targetId)!==event.actorId))&&
    !romanceAvailability(graph,event.actorId,event.targetId,event.type,event.at).enabled)
    return null;
  // A canonical relationship milestone must be eligible even when written by
  // a headless client directly; otherwise an event could bypass consent gates.
  if(['romance.date','romance.tender','romance.propose','romance.marry',
    'romance.hug','romance.kiss','romance.intimacy','romance.breakup','romance.divorce','romance.checkin',
    'romance.repair','romance.evening'].includes(event.type)&&
    !romanceAvailability(graph,event.actorId,event.targetId,event.type,event.at).enabled)
    return null;
  const pair=getOrCreatePair(graph,event.actorId,event.targetId);
  if(!pair)return null;
  if(pair.metAt===null)pair.metAt=event.at;
  if(typeof event.token==='string'&&pair.events.some(e=>e.token===event.token))
    return null;
  const [a,b]=pair.ids;
  if(observedViews){
    if(!observePairViews(graph,a,b,observedViews))return null;
  }else if(event.type!=='introduced'){
    const delta=weights[event.type];
    for(const id of [a,b])for(const axis of ['friendship','trust','tension'])
      pair.views[id][axis]=clamp(pair.views[id][axis]+delta[axis],0,100);
  }
  // Counters rate-limit identical action categories on one game day.
  const day=Math.floor(event.at/DAY);
  const countKey=event.type+':'+day;
  const substantive=event.type!=='introduced'&&!pair.counted.includes(countKey);
  if(substantive){
    pair.counted.push(countKey);
    pair.counted=pair.counted.slice(-32);
    if(positive(event.type)){
      pair.counts.positive++;
      if(!pair.positiveDays.includes(day))pair.positiveDays.push(day);
      pair.positiveDays=pair.positiveDays.slice(-12);
      if(pair.rivalry!=='none')pair.positiveSinceRival++;
    }else{
      pair.counts.negative++;
      if(pair.friendship!=='none')pair.negativeSinceFriend++;
    }
  }
  const receipt={seq:graph.nextSeq++,type:event.type,at:event.at,
    actorId:event.actorId,targetId:event.targetId,
    ...(typeof event.token==='string'&&event.token.length<=80?{token:event.token}:{})};
  pair.events.push(receipt);
  pair.events=pair.events.slice(-EVENT_LIMIT);
  rememberPairReceipt(pair,receipt);
  if(romanceEvent)recordRomanceReceipt(graph,pair,receipt);
  pair.lastAt=event.at;
  pair.revision++;
  recompute(pair);
  if(['romance.flirt','romance.tender','romance.kiss','romance.intimacy']
    .includes(receipt.type)&&Array.isArray(event.witnessIds)){
    const witnesses=new Set(event.witnessIds.filter(id=>
      validPersonId(id)&&graph.persons.includes(id)));
    for(const involvedId of [receipt.actorId,receipt.targetId]){
      const partnerId=currentDatingPartner(graph,involvedId);
      if(partnerId&&partnerId!==receipt.actorId&&
        partnerId!==receipt.targetId&&witnesses.has(partnerId))
        recordWitnessedJealousy(graph,receipt,involvedId,partnerId);
    }
  }
  return receipt;
}
export function relationSummary(graph,sourceId,targetId){
  const pair=getPair(graph,sourceId,targetId);
  if(!pair||pair.metAt===null)return {label:'Незнакомы',met:false,friendship:'none',rivalry:'none',positive:0,negative:0,days:0};
  const view=pair.views[sourceId],other=pair.views[targetId];
  let label='Знакомые';
  if(pair.rivalry==='mutual')label='Враги';
  else if(pair.rivalry==='oneSided')label='Неприязнь';
  else if(pair.friendship==='close')label='Близкие друзья';
  else if(pair.friendship==='friends')label='Друзья';
  else if(view.friendship>=45&&other.friendship>=45&&pair.counts.positive>=2)
    label='Приятели';
  return {label,met:true,friendship:pair.friendship,rivalry:pair.rivalry,
    positive:pair.counts.positive,negative:pair.counts.negative,
    days:new Set(pair.positiveDays).size};
}
const action=(label,category,reason)=>Object.freeze({label,category,reason});
export const BRANCH_ACTIONS=Object.freeze({
  'acquaint.introduce':action('Представиться','acquaintance','Вы уже знакомы'),
  'acquaint.chat':action('Узнать друг друга получше','acquaintance','Сначала нужно познакомиться'),
  'friend.tease':action('Дружески подшутить','friendship','Нужна взаимная дружба'),
  'friend.confide':action('Доверить секрет','friendship','Нужна взаимная дружба и доверие'),
  'rival.taunt':action('Высказать претензию','conflict','Нужна устойчивая неприязнь'),
  'rival.truce':action('Предложить перемирие','conflict','Примиряться пока не с кем'),
  'romance.flirt':action('Осторожно пофлиртовать','romance','Пока рано для флирта'),
  'romance.confess':action('Признаться в симпатии','romance','Нужна взаимная симпатия'),
  'romance.date':action('Предложить встречаться','romance','Необходимы взаимные чувства'),
  'romance.breakup':action('Расстаться','romance','Вы пока не пара'),
  'romance.tender':action('Сказать нежные слова','romance','Сначала нужно стать парой'),
  'romance.propose':action('Предложить помолвку','romance','Нужна крепкая взаимная любовь'),
  'romance.marry':action('Обменяться брачными обещаниями','romance','Нужно время после помолвки'),
  'romance.divorce':action('Оформить развод','romance','Вы пока не супруги'),
  'romance.checkin':action('Уделить внимание','romance','Нужно свободное общение'),
  'romance.repair':action('Обсудить обиду','romance','Сначала должна возникнуть обида'),
  'romance.hug':action('Нежно обнять','romance','Нужна взаимная симпатия'),
  'romance.kiss':action('Поцеловать','romance','Нужно сблизиться и стать парой'),
  'romance.intimacy':action('Предложить близость','romance','Нужна взаимная взрослая пара и уединение'),
  'romance.evening':action('Провести романтический вечер','romance','Нужна взрослая пара и время вдвоём')
});
export function availableSocialActions(graph,a,b,minutes=0){
  if(!validPersonId(a)||!validPersonId(b)||a===b||
    !graph?.persons?.includes(a)||!graph.persons.includes(b))return [];
  const pair=getPair(graph,a,b),status=relationSummary(graph,a,b);
  return Object.entries(BRANCH_ACTIONS).map(([id,def])=>{
    if(ROMANCE_ACTION_IDS.includes(id)){
      const decision=romanceAvailability(graph,a,b,id,minutes);
      const label=id==='romance.breakup'&&pair?.romance?.bond?.status==='engaged'
        ?'Разорвать помолвку':def.label;
      return {id,label,category:def.category,enabled:decision.enabled,
        reason:decision.reason};
    }
    const enabled=id==='acquaint.introduce'?!status.met:
      id==='acquaint.chat'?status.met:
      id==='friend.tease'?status.friendship!=='none':
      id==='friend.confide'?status.friendship!=='none'&&
        (pair?.views[a]?.trust??0)>=60:
      id==='rival.taunt'||id==='rival.truce'?status.rivalry!=='none':false;
    return {id,label:def.label,category:def.category,enabled,reason:enabled?'':def.reason};
  });
}
export function resolveBranchResponse(graph,a,b,id,context={}){
  const available=availableSocialActions(graph,a,b,context.minutes??0).find(x=>x.id===id);
  if(!available?.enabled)return null;
  // The generic N-resident graph doesn't know rendering or resident shape.
  // The runtime adapter can inject a recipient snapshot; old pure callers
  // without a snapshot still get safe, neutral deterministic behavior.
  const climate=romanceClimate(graph,a,b,context.minutes??0);
  const romanceBias=id.startsWith('romance.')&&
    !['romance.repair','romance.checkin','romance.breakup',
      'romance.divorce'].includes(id)
    ?climate.state==='strained'?-12:climate.state==='distant'?-8:0
    :0;
  const reaction=evaluateSocialReaction({
    kind:'branch',actionId:id,recipient:context.recipient,
    view:getDirectedView(graph,b,a)||view(),minutes:context.minutes??0,
    historyBias:episodeContext(graph,b,a,context.minutes??0).bias+romanceBias,
    compatibilityBias:context.compatibilityBias??0
  });
  if(!reaction)return null;
  if(['romance.breakup','romance.divorce'].includes(id)){
    // Ending a union is never a partner-vetoed request.
    return {accepted:true,type:id,id,outcome:reaction.score>=55?'awkward':'defensive',
      intensity:reaction.intensity,
      label:id==='romance.divorce'?'Брак завершён':'Решили больше не быть парой'};
  }
  const isRomance=ROMANCE_ACTION_IDS.includes(id);
  // A romance request is a verbal invitation, not a forced physical act.
  // Missing or distressed current recipient data is a respectful refusal.
  const recipient=context.recipient;
  const willing=!isRomance||(Number.isFinite(recipient?.mind?.mood?.value)&&
    recipient.mind.mood.value>=44&&
    ['energy','hunger','hygiene'].every(k=>
      Number.isFinite(recipient?.needs?.[k])&&recipient.needs[k]>=42));
  const accepted=reaction.accepted&&willing;
  const type=id==='acquaint.introduce'?'introduced':
    id==='rival.taunt'?id:accepted?id:id+'.refused';
  return {accepted,type,id,outcome:isRomance&&!accepted?'refused':reaction.outcome,
    intensity:reaction.intensity,label:isRomance
      ?accepted?id==='romance.flirt'?'Ответил(а) на флирт':
        id==='romance.date'?'Решили встречаться':
        id==='romance.tender'?'Оценил(а) нежность':
        id==='romance.hug'?'Принял(а) объятие':
         id==='romance.kiss'?'Ответил(а) на поцелуй':
         id==='romance.intimacy'?'Взаимно согласились на близость':
         id==='romance.evening'?'Согласились провести вечер вдвоём':
        id==='romance.checkin'?'Почувствовал(а) внимание':
        id==='romance.repair'?'Удалось поговорить об обиде':
        id==='romance.propose'?'Обручились':
        id==='romance.marry'?'Стали супругами':'Чувства приняты'
        :'Собеседник предпочёл сохранить дистанцию'
      :accepted?
    id==='friend.tease'?'Шутку оценили':id==='friend.confide'?'Секрет принят':
    id==='rival.truce'?'Удалось начать примирение':
    id==='acquaint.introduce'?'Познакомились!':'Узнали друг друга получше':
    id==='rival.taunt'?'Снова разгорелся конфликт':'Собеседнику сейчас не подошло'};
}
/** Restoration validates IDs, pair keys, limits and counter shape; no events replay. */
export function restoreSocialGraph(raw,personIds=[],legacyPair=null){
  const good=record(raw)&&raw.schema===GRAPH_SCHEMA;
  const saved=good&&Array.isArray(raw.persons)?raw.persons.filter(validPersonId):[];
  const ids=[...new Set([...saved,...personIds.filter(validPersonId)])].slice(0,MAX_PEOPLE);
  const graph=newSocialGraph(ids);
  if(good&&record(raw.lifeStages))
    for(const id of ids){
      if(Object.hasOwn(raw.lifeStages,id))setLifeStage(graph,id,raw.lifeStages[id]);
    }
  if(good&&Array.isArray(raw.familyLinks))
    for(const edge of raw.familyLinks.slice(0,2048)){
      if(record(edge))addFamilyLink(graph,edge.from,edge.to,edge.kind);
    }
  if(good&&Number.isSafeInteger(raw.nextSeq)&&raw.nextSeq>=1&&raw.nextSeq<=1e9)
    graph.nextSeq=raw.nextSeq;
  if(good&&record(raw.pairs)){
    for(const [key,entry] of Object.entries(raw.pairs).slice(0,MAX_PAIRS)){
      const pairIds=names(key);
      if(!pairIds||!record(entry)||!pairIds.every(id=>ids.includes(id))||
        !Array.isArray(entry.ids)||JSON.stringify(entry.ids)!==JSON.stringify(pairIds))continue;
      const p=getOrCreatePair(graph,...pairIds);
      if(!p)continue;
      p.metAt=safeAt(entry.metAt)?entry.metAt:null;
      for(const id of pairIds)p.views[id]=safeView(entry.views?.[id]);
      for(const [n,max] of [['positive',100000],['negative',100000]])
        p.counts[n]=Number.isSafeInteger(entry.counts?.[n])
          ?clamp(entry.counts[n],0,max):0;
      p.positiveDays=Array.isArray(entry.positiveDays)
        ?[...new Set(entry.positiveDays.filter(x=>Number.isSafeInteger(x)&&x>=0&&x<=7000))].slice(-12):[];
      p.counted=Array.isArray(entry.counted)?entry.counted.filter(x=>typeof x==='string'&&/^[a-z.]+:[0-9]{1,5}$/.test(x)).slice(-32):[];
      for(const k of ['negativeSinceFriend','positiveSinceRival','revision'])
        p[k]=Number.isSafeInteger(entry[k])?clamp(entry[k],0,100000):0;
      if(['none','friends','close'].includes(entry.friendship))p.friendship=entry.friendship;
      if(['none','oneSided','mutual'].includes(entry.rivalry))p.rivalry=entry.rivalry;
      p.romance=restoreRomanceState(entry.romance,pairIds,entry.lastAt);
      // A corrupted/underage/related save never imports romantic progress.
      if(!romanceSafety(graph,pairIds[0],pairIds[1]).allowed)
        p.romance=newRomanceState(pairIds);
      p.events=Array.isArray(entry.events)?entry.events.filter(e=>record(e)&&
        Number.isSafeInteger(e.seq)&&e.seq>0&&e.seq<graph.nextSeq&&
        TYPES.has(e.type)&&safeAt(e.at)&&
        (['romance.breakup','romance.divorce'].includes(e.type)||
          !ROMANCE_ACTION_IDS.some(id=>e.type===id||e.type===id+'.refused')||
          romanceSafety(graph,e.actorId,e.targetId).allowed)&&
        e.actorId!==e.targetId&&
        pairIds.includes(e.actorId)&&pairIds.includes(e.targetId)).slice(-EVENT_LIMIT)
        .map(e=>({seq:e.seq,type:e.type,at:e.at,actorId:e.actorId,
          targetId:e.targetId,
          ...(e.type==='romance.jealousy'&&Number.isSafeInteger(e.causeSeq)&&
            e.causeSeq>0&&e.causeSeq<graph.nextSeq?{causeSeq:e.causeSeq}:{}),
          ...(typeof e.token==='string'&&e.token.length<=80?{token:e.token}:{})})):[];
      p.lastAt=safeAt(entry.lastAt)?entry.lastAt:null;
      p.episodes=restorePairEpisodes(entry.episodes,pairIds,graph.nextSeq,
        p.lastAt===null?1e7:p.lastAt);
      p.knowledge=restoreSocialKnowledge(entry.knowledge,pairIds,graph.nextSeq,
        p.lastAt===null?1e7:p.lastAt);
      p.cues=restoreSocialCues(entry.cues,pairIds,graph.nextSeq,
        p.lastAt===null?1e7:p.lastAt);
      // Preserve verified historical friendship milestones, no fresh events.
    }
  }
  // Save validation must also protect N-resident exclusivity. Reject a
  // conflicting/stale commitment rather than silently forging two partners.
  const occupied=new Set();
  for(const pair of Object.values(graph.pairs)){
    const bond=pair.romance?.bond;
    if(!['dating','engaged','married'].includes(bond?.status))continue;
    if(!romanceSafety(graph,...pair.ids).allowed||
      pair.lastAt===null||!safeAt(bond.since)||bond.since>pair.lastAt||
      (bond.status==='engaged'&&(!safeAt(bond.engagedAt)||
        bond.engagedAt>pair.lastAt))||
      (bond.status==='married'&&(!safeAt(bond.engagedAt)||
        !safeAt(bond.marriedAt)||bond.marriedAt>pair.lastAt||
        bond.engagedAt>bond.marriedAt))||
      pair.ids.some(id=>occupied.has(id))){
      pair.romance.bond={status:'none',since:null,ex:false,lastEndedAt:null};
    }else for(const id of pair.ids)occupied.add(id);
  }
  if(record(legacyPair)){
    const {ids:pairIds,at,views}=legacyPair;
    if(Array.isArray(pairIds)&&pairIds.length===2&&pairIds.every(id=>graph.persons.includes(id))&&
      safeAt(at)){
      markAcquainted(graph,pairIds[0],pairIds[1],at);
      observePairViews(graph,pairIds[0],pairIds[1],views);
    }
  }
  return graph;
}
