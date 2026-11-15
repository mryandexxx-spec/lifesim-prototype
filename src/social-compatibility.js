/** Блин’С 1.0f: directed compatibility and what one resident has learned.
 * Pure, deterministic, bounded and independent of rendering or character names.
 * Compatibility is never a friendship score or automatically revealed to player.
 */
import {AXES,deriveAxes,PREFERENCE_CATALOG,preferenceAffinity} from './trait-catalog.js';

export const KNOWLEDGE_LIMIT=8;
export const KNOWLEDGE_STANCES=Object.freeze(['likes','dislikes','neutral']);
export const CONVERSATION_DISCOVERY_TAGS=Object.freeze({
  'hobbies.music':'music','hobbies.books':'books'
});
const validRecord=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const validTag=tag=>typeof tag==='string'&&Object.hasOwn(PREFERENCE_CATALOG,tag);
const validPersonId=id=>typeof id==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(id);
const DISCOVERY_EVENT_TYPES=new Set(['conversation.talk','gift.accepted','leisure.accepted']);
const preferenceObject=Object.freeze({
  books:'книги',drawing:'рисование',music:'музыку',games:'игры',
  calm_leisure:'спокойный досуг',socializing:'общение',
  cooking:'готовку',parties:'вечеринки'
});
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));

/** Stable, directed psychological fit: similar rhythms + complementary traits
 * and mutual hobby overlaps. Does not use directed friendship or time.
 * A->B can differ from B->A, because priorities belong to the observer.
 */
export function socialCompatibility(observerProfile,otherProfile){
  if(!validRecord(observerProfile)||!validRecord(otherProfile)||
    !Array.isArray(observerProfile.traitIds)||!Array.isArray(otherProfile.traitIds))
    return {bias:0,style:'unknown'};
  const a=deriveAxes(observerProfile),b=deriveAxes(otherProfile);
  const priorities={
    sociability:1.15+(1-a.sociability)*.30,
    emotionalReactivity:.8+a.emotionalReactivity*.5,
    empathy:.7+a.empathy*.6,
    organization:.6+a.organization*.45,
    independence:.6+a.independence*.45,
    creativity:.55+a.creativity*.3,
    optimism:.6+a.optimism*.4,
    practicality:.55+a.practicality*.3
  };
  let agreement=0,total=0;
  for(const [key,priority] of Object.entries(priorities)){
    agreement+=(1-Math.abs(a[key]-b[key]))*priority;
    total+=priority;
  }
  const similarity=total?agreement/total:.7;
  const mine=Array.isArray(observerProfile.preferences?.likes)?observerProfile.preferences.likes:[];
  const theirs=Array.isArray(otherProfile.preferences?.likes)?otherProfile.preferences.likes:[];
  const theirDislikes=Array.isArray(otherProfile.preferences?.dislikes)?otherProfile.preferences.dislikes:[];
  let shared=0,conflict=0;
  for(const tag of mine.slice(0,KNOWLEDGE_LIMIT)){
    if(!validTag(tag))continue;
    if(theirs.includes(tag))shared++;
    if(theirDislikes.includes(tag))conflict++;
  }
  // Base differences have a modest impact: mutual trust and actual context
  // still matter more than a predetermined personality combination.
  const extra=clamp(shared*1.7-conflict*2.3,-4,4);
  const bias=clamp(Math.round((similarity-.79)*20+extra),-9,9);
  return {bias,style:bias>=4?'easy':bias<=-4?'uneven':'mixed'};
}
export function newSocialKnowledge(a,b){
  if(!validPersonId(a)||!validPersonId(b)||a===b)return {};
  return {[a]:[],[b]:[]};
}
export function knownPreferences(pair,viewerId){
  return Array.isArray(pair?.knowledge?.[viewerId])?pair.knowledge[viewerId]:[];
}
/** Knowledge is directional. A real finished canonical graph receipt is
 * required, preventing queue/cancel/in-flight conversation leakage.
 * Nothing about targetProfile is returned or exposed until this completes.
 */
export function discoverPreference(pair,receipt,viewerId,targetId,targetProfile,tag){
  if(!validRecord(pair)||!Array.isArray(pair.ids)||pair.ids.length!==2||
    !pair.ids.includes(viewerId)||!pair.ids.includes(targetId)||
    viewerId===targetId||!validTag(tag)||!validRecord(receipt)||
    !Number.isSafeInteger(receipt.seq)||receipt.seq<1||
    !Number.isFinite(receipt.at)||receipt.at<0||receipt.at>1e7||
    !DISCOVERY_EVENT_TYPES.has(receipt.type)||
    receipt.actorId!==viewerId||receipt.targetId!==targetId||
    !Array.isArray(pair.events)||!pair.events.some(e=>e.seq===receipt.seq&&
      e.actorId===viewerId&&e.targetId===targetId&&e.at===receipt.at&&
      e.type===receipt.type)||
    !validRecord(targetProfile))return null;
  if(!validRecord(pair.knowledge))pair.knowledge=newSocialKnowledge(...pair.ids);
  if(!Array.isArray(pair.knowledge[viewerId]))pair.knowledge[viewerId]=[];
  if(pair.knowledge[viewerId].some(x=>x.tag===tag))return null;
  const taste=preferenceAffinity(targetProfile,tag);
  const stance=taste>0?'likes':taste<0?'dislikes':'neutral';
  const learned={tag,stance,seq:receipt.seq,at:receipt.at};
  pair.knowledge[viewerId]=[...pair.knowledge[viewerId],learned].slice(-KNOWLEDGE_LIMIT);
  return learned;
}
/** Optional v1 save field. All labels are from a known catalog, not
 * arbitrary user-provided HTML or invented retrospective knowledge.
 */
export function restoreSocialKnowledge(raw,ids,maxSeq=1e9,maxAt=1e7){
  if(!Array.isArray(ids)||ids.length!==2||
    !ids.every(validPersonId)||ids[0]===ids[1])return {};
  const out=newSocialKnowledge(...ids);
  if(!validRecord(raw))return out;
  for(const id of ids){
    if(!Array.isArray(raw[id]))continue;
    const seen=new Set();
    for(const e of raw[id].slice(-KNOWLEDGE_LIMIT*4)){
      if(!validRecord(e)||!validTag(e.tag)||
        !KNOWLEDGE_STANCES.includes(e.stance)||
        !Number.isSafeInteger(e.seq)||e.seq<1||e.seq>=maxSeq||
        !Number.isFinite(e.at)||e.at<0||e.at>maxAt||seen.has(e.tag))continue;
      seen.add(e.tag);
      out[id].push({tag:e.tag,stance:e.stance,seq:e.seq,at:e.at});
    }
    out[id]=out[id].slice(-KNOWLEDGE_LIMIT);
  }
  return out;
}
/** Story-friendly strings show ONLY discovered facts from one viewpoint. */
export function discoveryNotes(pair,viewerId,limit=4){
  return knownPreferences(pair,viewerId)
    .slice(-clamp(Number.isFinite(limit)?Math.floor(limit):4,1,KNOWLEDGE_LIMIT))
    .map(e=>({tag:e.tag,stance:e.stance,
      text:e.stance==='likes'?'Любит '+preferenceObject[e.tag]:
        e.stance==='dislikes'?'Не любит '+preferenceObject[e.tag]:
        'Без особых предпочтений: '+PREFERENCE_CATALOG[e.tag].toLowerCase()}));
}
