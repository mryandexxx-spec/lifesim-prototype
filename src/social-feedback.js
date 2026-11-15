/** Блин’С 1.0d: headless, transient, per-responder social feedback.
 * Appraisal decides what someone felt. The UI may display this once;
 * neither this queue nor an animation is part of the saved simulation.
 */
export const SOCIAL_OUTCOMES=Object.freeze([
  'warm','neutral','awkward','defensive','hostile','refused'
]);
export const SOCIAL_OUTCOME_LABELS=Object.freeze({
  warm:'Тепло',neutral:'Доброжелательно',awkward:'Неловко',
  defensive:'Настороженно',hostile:'Раздражение',refused:'Отказ'
});
const states=new WeakMap();
const validId=id=>typeof id==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(id);
const clamp=(n,a,b)=>Math.max(a,Math.min(n,b));

/** Classify a completed reply, not a queue request. No graphics or randomness. */
export function socialOutcome({kind='conversation',accepted,score=50,tone='neutral',actionId=null}={}){
  if(typeof accepted!=='boolean'||!Number.isFinite(score))return null;
  const certainty=clamp(score,0,100);
  if((kind==='direct'&&actionId==='argue')||
    (kind==='branch'&&actionId==='rival.taunt'))return 'hostile';
  if(!accepted){
    if(tone==='sharp')return certainty<25?'hostile':'defensive';
    if(kind==='branch'&&
      (actionId==='friend.tease'||actionId==='friend.confide'))return 'defensive';
    return 'refused';
  }
  if(tone==='sharp'||(kind==='branch'&&certainty<47)||
    (kind==='conversation'&&certainty<56))return 'awkward';
  return certainty>=72?'warm':'neutral';
}
/** Emit an immutable one-time feedback receipt. No mutation to root or save. */
export function emitSocialReaction(root,{
  actorId,responderId,outcome,eventType='reply',receiptId=null,intensity=60,at=null
}={}){
  if(!root||typeof root!=='object'||root.paused||
    !validId(actorId)||!validId(responderId)||
    !SOCIAL_OUTCOMES.includes(outcome)||
    typeof eventType!=='string'||!/^[a-z][a-z0-9.-]{0,47}$/.test(eventType)||
    !Number.isFinite(intensity))return null;
  const minute=at??root.minutes;
  if(!Number.isFinite(minute)||minute<0)return null;
  let state=states.get(root);
  if(!state){state={next:1,items:[],seen:new Set()};states.set(root,state);}
  const identity=receiptId===null||receiptId===undefined
    ?'live-'+(state.next++)
    :typeof receiptId==='string'&&receiptId.length>0&&receiptId.length<=96
      ?receiptId:null;
  if(identity===null)return null;
  const key=JSON.stringify([identity,responderId,eventType]);
  if(state.seen.has(key))return null;
  state.seen.add(key);
  // Bounded in-flight notifications, safe even with many residents at x3.
  if(state.seen.size>128)state.seen.clear();
  const receipt=Object.freeze({receiptId:identity,actorId,responderId,
    outcome,eventType,at:minute,intensity:clamp(Math.round(intensity),0,100)});
  state.items.push(receipt);
  if(state.items.length>24)state.items.shift();
  return receipt;
}
/** At-most-once delivery to a view. New/loaded root has no old popups. */
export function consumeSocialReactions(root){
  const state=root&&typeof root==='object'?states.get(root):null;
  return state?state.items.splice(0):[];
}
export function clearSocialReactions(root){
  if(root&&typeof root==='object')states.delete(root);
}
/** 2D projection guard, deterministic and unit-testable without PlayCanvas. */
export function reactionBadgePoint(screen,viewPoint,width,height,{top=90,bottom=145}={}){
  if(!Number.isFinite(screen?.x)||!Number.isFinite(screen?.y)||
    !Number.isFinite(viewPoint?.z)||!Number.isFinite(width)||
    !Number.isFinite(height)||width<=0||height<=0||
    viewPoint.z>=0||screen.x<38||screen.x>width-38||
    screen.y<top||screen.y>height-bottom)return null;
  return {x:Math.round(screen.x),y:Math.round(screen.y)};
}
