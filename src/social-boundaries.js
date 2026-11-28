/** Блин’С 1.0g — discoverable communication habits and personal boundaries.
 * Each resident forms their own modest, revisable impression from completed
 * dialogue. One situational reaction is an observation, not a fixed trait.
 * Pure independent social logic; no personal IDs, rendering, or real clock.
 */
import {deriveAxes} from './trait-catalog.js';

export const CUE_LIMIT=5;
export const CUE_IDS=Object.freeze(['gentle','support','space','playful','clear']);
export const CUE_TEXT=Object.freeze({
  gentle:['Не понравились резкие слова','Болезненно воспринимает колкости'],
  support:['Откликнулся на поддержку','Ценит бережное участие'],
  space:['Сейчас не хотел сближаться','Ему важно личное пространство'],
  playful:['Улыбнулся доброй шутке','Любит добродушный юмор'],
  clear:['Откликнулся на спокойное объяснение','Ценит прямой спокойный разговор']
});
const sharp=new Set(['daily.critic','hobbies.mock','humor.tease','support.dismiss','plans.doubt','conflict.blame']);
const support=new Set(['support.listen','support.help']);
const playful=new Set(['humor.joke','humor.story']);
const clear=new Set(['conflict.explain']);
const space=new Set(['plans.invite','support.help']);
// Authored conversational content, not inferred from a topic, mood or taste.
// A reflective temperament does not mean that someone enjoys sadness.
const optimistic=new Set(['daily.news','daily.yes','daily.reframe','daily.tact']);
const reflective=new Set(['philosophy.share','philosophy.reflect','memories.reflect','dreams.deep']);
const composed=new Set(['conflict.extra','conflict.repair','conflict.yes']);
const imaginative=new Set(['plans.idea','hobbies.extra','dreams.share','humor.extra']);
const concrete=new Set(['money.ask','money.share','plans.extra','plans.yes','dreams.reflect']);
const validRecord=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const validId=id=>typeof id==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(id);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const validTime=x=>Number.isFinite(x)&&x>=0&&x<=1e7;

export function cueFromAnswer(actionId,accepted){
  if(typeof accepted!=='boolean'||typeof actionId!=='string')return null;
  if(!accepted&&sharp.has(actionId))return 'gentle';
  if(!accepted&&space.has(actionId))return 'space';
  if(accepted&&support.has(actionId))return 'support';
  if(accepted&&playful.has(actionId))return 'playful';
  if(accepted&&clear.has(actionId))return 'clear';
  return null;
}
export function newSocialCues(a,b){
  return validId(a)&&validId(b)&&a!==b?{[a]:[],[b]:[]}:{};
}
export function knownSocialCues(pair,viewerId){
  return Array.isArray(pair?.cues?.[viewerId])?pair.cues[viewerId]:[];
}
/** Can only be written from a real graph receipt with a completed social
 * conversation. One episode can contribute at most one signal per cue.
 */
export function observeSocialCue(pair,receipt,viewerId,targetId,actionId,accepted){
  const cue=cueFromAnswer(actionId,accepted);
  if(!cue||!validRecord(pair)||!Array.isArray(pair.ids)||pair.ids.length!==2||
    !pair.ids.includes(viewerId)||!pair.ids.includes(targetId)||viewerId===targetId||
    !validRecord(receipt)||!Number.isSafeInteger(receipt.seq)||receipt.seq<1||
    !validTime(receipt.at)||!['conversation.talk','conversation.argue'].includes(receipt.type)||
    receipt.actorId!==viewerId||receipt.targetId!==targetId||
    !Array.isArray(pair.events)||!pair.events.some(e=>e.seq===receipt.seq&&
      e.actorId===viewerId&&e.targetId===targetId&&e.type===receipt.type&&
      e.at===receipt.at))return null;
  if(!validRecord(pair.cues))pair.cues=newSocialCues(...pair.ids);
  if(!Array.isArray(pair.cues[viewerId]))pair.cues[viewerId]=[];
  const current=pair.cues[viewerId];
  const prior=current.find(e=>e.id===cue);
  if(prior?.lastSeq===receipt.seq)return null;
  const item={id:cue,count:Math.min(2,(prior?.count||0)+1),
    lastSeq:receipt.seq,at:receipt.at};
  pair.cues[viewerId]=[...current.filter(e=>e.id!==cue),item].slice(-CUE_LIMIT);
  return {...item};
}
/** Existing v1 saved socialGraph may not contain cues; never reconstruct them
 * from old receipts on load. Corrupt or forged fields must be discarded.
 */
export function restoreSocialCues(raw,ids,maxSeq=1e9,maxAt=1e7){
  if(!Array.isArray(ids)||ids.length!==2||!ids.every(validId)||ids[0]===ids[1])return {};
  const out=newSocialCues(...ids);
  if(!validRecord(raw))return out;
  for(const id of ids){
    if(!Array.isArray(raw[id]))continue;
    const entries=new Map();
    for(const e of raw[id].slice(-CUE_LIMIT*4)){
      if(!validRecord(e)||!CUE_IDS.includes(e.id)||
        !Number.isSafeInteger(e.count)||e.count<1||e.count>2||
        !Number.isSafeInteger(e.lastSeq)||e.lastSeq<1||e.lastSeq>=maxSeq||
        !validTime(e.at)||e.at>maxAt)continue;
      const earlier=entries.get(e.id);
      if(!earlier||earlier.lastSeq<e.lastSeq)
        entries.set(e.id,{id:e.id,count:e.count,lastSeq:e.lastSeq,at:e.at});
    }
    out[id]=[...entries.values()].sort((a,b)=>a.lastSeq-b.lastSeq).slice(-CUE_LIMIT);
  }
  return out;
}
/** Gentle narrative with deliberately uncertain wording after one sighting. */
export function socialCueNotes(pair,viewerId,limit=3){
  return knownSocialCues(pair,viewerId).slice(-clamp(Number.isFinite(limit)?
    Math.floor(limit):3,1,CUE_LIMIT)).reverse().map(e=>({
    id:e.id,confirmed:e.count>=2,
    text:CUE_TEXT[e.id]?.[e.count>=2?1:0]||''
  }));
}
/** Stable disposition affects the recipient whether or not the initiator
 * knows it. A transient bad day may still override this small coefficient.
 */
export function boundaryDisposition(profile,actionId){
  if(!validRecord(profile)||!Array.isArray(profile.traitIds)||typeof actionId!=='string')return 0;
  const axes=deriveAxes(profile);
  if(sharp.has(actionId))return axes.emotionalReactivity>=.66?-6:axes.empathy>=.70?-4:0;
  if(space.has(actionId)&&(axes.independence>=.70||axes.sociability<=.36))return -5;
  if(support.has(actionId))return axes.empathy>=.70?4:0;
  if(playful.has(actionId))return axes.optimism>=.70?4:0;
  if(clear.has(actionId))return axes.practicality>=.72?3:0;
  // At most one modest content-specific response bias. Normal relationship,
  // emotional state, taste and consent still decide the actual answer.
  if(optimistic.has(actionId)&&axes.optimism>=.70)return 4;
  if(reflective.has(actionId)&&axes.emotionalReactivity>=.65&&axes.optimism<=.45)return 4;
  if(composed.has(actionId)&&axes.emotionalReactivity<=.36&&axes.resilience>=.62)return 4;
  if(imaginative.has(actionId)&&axes.creativity>=.70)return 4;
  if(concrete.has(actionId)&&axes.practicality>=.72)return 4;
  return 0;
}
/** Learned expectations modify contextual conversation choices, not the
 * person's personality, friendship, guaranteed legacy acts or save scores.
 */
export function cueConversationBias(pair,viewerId,actionId){
  const cues=knownSocialCues(pair,viewerId);
  const find=id=>cues.find(c=>c.id===id);
  const weight=c=>c?.count>=2?5:c?.count===1?2:0;
  if(sharp.has(actionId))return -weight(find('gentle'));
  if(space.has(actionId)&&find('space'))return -weight(find('space'));
  if(support.has(actionId))return weight(find('support'));
  if(playful.has(actionId))return weight(find('playful'));
  if(clear.has(actionId))return weight(find('clear'));
  return 0;
}
