/** Блин’С 1.0e — bounded, directional episodic social memory.
 * Pure records belong to the canonical socialGraph pair, not a second bond.
 * No character-name branches, browser APIs, renderer or random seeds.
 */
export const EPISODE_LIMIT=18;
export const EPISODE_DAY=1440;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const validTime=x=>Number.isFinite(x)&&x>=0&&x<=1e7;
const types=Object.freeze({
  talk:['ease','ease',19,19],
  'conversation.talk':['understood','understood',27,31],
  'gift.accepted':['generosity','gratitude',35,47],
  'leisure.accepted':['shared','shared',29,32],
  'acquaint.chat':['curiosity','curiosity',18,20],
  'friend.tease':['shared','shared',23,24],
  'friend.confide':['trust','trusted',37,50],
  'rival.truce':['repair','repair',44,44],
  argue:['regret','hurt',49,92],
  'conversation.argue':['regret','hurt',46,85],
  'rival.taunt':['resentment','hurt',32,95],
  'gift.refused':['rejected','boundary',43,17],
  'leisure.refused':['rejected','boundary',38,12],
  'friend.tease.refused':['regret','hurt',34,74],
  'friend.confide.refused':['rejected','boundary',62,29],
  'rival.truce.refused':['rejected','boundary',52,25],
  'acquaint.chat.refused':['rejected','boundary',24,14]
});
const negative=new Set(['regret','hurt','resentment','rejected','boundary']);
export const EPISODE_LABELS=Object.freeze({
  ease:'Приятный разговор',understood:'Нашли общий язык',
  generosity:'Помог другому',gratitude:'Помнит заботу',
  shared:'Хорошо провели время',curiosity:'Узнали друг друга',
  trust:'Открылся другому',trusted:'Ему доверились',repair:'Попытались помириться',
  regret:'Сожалеет о ссоре',hurt:'Помнит сильную обиду',
  resentment:'Осталось раздражение',rejected:'Его предложение отвергли',
  boundary:'Предпочёл обозначить границы'
});
const positiveEvidence=new Set(['conversation.talk','gift.accepted','leisure.accepted',
  'friend.confide','rival.truce']);
const known=(type,kind)=>Array.isArray(types[type])&&
  (types[type][0]===kind||types[type][1]===kind);
const severityValid=n=>Number.isSafeInteger(n)&&n>=0&&n<=100;
const valid=e=>record(e)&&Number.isSafeInteger(e.seq)&&e.seq>=1&&
  validTime(e.at)&&typeof e.type==='string'&&known(e.type,e.kind)&&
  severityValid(e.salience);
const keep=items=>{
  const tail=items.slice(-EPISODE_LIMIT);
  if(items.length<=EPISODE_LIMIT)return tail;
  // Retain an unexpired serious hurt when everyday chatter fills the log.
  const last=items.at(-1)?.at??0;
  const significant=items.filter(e=>e.salience>=65&&e.at>=last-30*EPISODE_DAY)
    .slice(-3);
  const merge=[...significant,...items.slice(-(EPISODE_LIMIT-3))].sort((a,b)=>a.seq-b.seq);
  const unique=[...new Map(merge.map(e=>[e.seq,e])).values()];
  return unique.slice(-EPISODE_LIMIT);
};
export function initialPairEpisodes(a,b){return {[a]:[],[b]:[]};}
/** One existing social-graph receipt -> two potentially unequal appraisals.
 * Graph already guarantees this receipt is committed, never preflight/queue.
 */
export function rememberPairReceipt(pair,receipt){
  if(!record(pair)||!Array.isArray(pair.ids)||!record(receipt)||
    !Array.isArray(types[receipt.type])||!Number.isSafeInteger(receipt.seq)||
    !validTime(receipt.at))return false;
  const [initiatorKind,recipientKind,initiatorStrength,recipientStrength]=types[receipt.type];
  if(!pair.ids.includes(receipt.actorId)||!pair.ids.includes(receipt.targetId)||
    receipt.actorId===receipt.targetId)return false;
  if(!record(pair.episodes))pair.episodes=initialPairEpisodes(...pair.ids);
  if(pair.ids.some(id=>!Array.isArray(pair.episodes[id])))return false;
  if(pair.ids.some(id=>pair.episodes[id].some(e=>e.seq===receipt.seq)))return false;
  for(const id of pair.ids){
    const initiator=id===receipt.actorId;
    const item={seq:receipt.seq,at:receipt.at,type:receipt.type,
      kind:initiator?initiatorKind:recipientKind,
      salience:initiator?initiatorStrength:recipientStrength};
    pair.episodes[id]=keep([...pair.episodes[id],item]);
  }
  return true;
}
/** Strictly validate saved optional data without replaying old events or bonuses. */
export function restorePairEpisodes(raw,ids,maxSeq=1e9,maxAt=1e7){
  if(!Array.isArray(ids)||ids.length!==2)return {};
  const out=initialPairEpisodes(...ids);
  if(!record(raw))return out;
  for(const id of ids){
    if(!Array.isArray(raw[id]))continue;
    const unique=new Map();
    for(const e of raw[id].slice(-EPISODE_LIMIT*4)){
      if(valid(e)&&e.seq<maxSeq&&e.at<=maxAt)
        unique.set(e.seq,{seq:e.seq,at:e.at,type:e.type,kind:e.kind,salience:e.salience});
    }
    out[id]=keep([...unique.values()].sort((a,b)=>a.seq-b.seq));
  }
  return out;
}
export function episodesFor(pair,personId){
  return Array.isArray(pair?.episodes?.[personId])?pair.episodes[personId]:[];
}
/** User-friendly narrative history; a persistent event is not a numeric score. */
export function latestEpisodes(pair,personId,now,limit=3){
  if(!validTime(now))return [];
  return episodesFor(pair,personId)
    .filter(e=>valid(e)&&e.at<=now)
    .slice(-clamp(Math.round(Number.isFinite(limit)?limit:3),1,6))
    .reverse().map(e=>({seq:e.seq,at:e.at,kind:e.kind,
      label:EPISODE_LABELS[e.kind],salience:e.salience}));
}
/** Unresolved severe wounds make a trusted invitation harder, but do not
 * overwrite the old shared affinity. Repair requires diverse demonstrated
 * positive acts on multiple game days, not 5 spammed compliments.
 */
export function episodeAppraisal(pair,personId,now){
  if(!validTime(now))return {bias:0,unresolved:false,repair:0,reason:null};
  const events=episodesFor(pair,personId).filter(e=>valid(e)&&e.at<=now);
  const wounds=events.filter(e=>negative.has(e.kind)&&e.salience>=65);
  if(!wounds.length)return {bias:0,unresolved:false,repair:0,reason:null};
  const wound=wounds.at(-1);
  const after=events.filter(e=>e.seq>wound.seq&&positiveEvidence.has(e.type)&&
    e.salience>=25&&e.at>wound.at);
  const categories=new Set(after.map(e=>e.type));
  const days=new Set(after.map(e=>Math.floor(e.at/EPISODE_DAY)));
  const span=now-wound.at;
  const repair=categories.size>=3&&days.size>=2&&span>=EPISODE_DAY*2?3:
    categories.size>=2&&days.size>=2&&span>=EPISODE_DAY?2:
    categories.size>=1&&span>=EPISODE_DAY?1:0;
  const halfLife=wound.salience>=85?16:10;
  const strength=wound.salience*Math.pow(.5,span/(halfLife*EPISODE_DAY));
  const remaining=Math.max(0,strength*(1-[0,.14,.45,.78][repair]));
  return {bias:-clamp(Math.round(remaining*.32),0,30),
    unresolved:remaining>=13,repair,reason:wound.kind,
    since:wound.at};
}
