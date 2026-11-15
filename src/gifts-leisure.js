/** Блин’С 0.9b — inventory, accepted gifts and shared leisure.
 * Pure simulation with an optional saved session; no renderer or wall clock.
 */
import {evaluateSocialReaction} from './social-reactions.js';
import {feelMemory} from './emotion-engine.js';
import {getPerspective,applySocialPerspective} from './social-perspective.js';
import {refreshMind} from './psychology.js';

export const GIFT_CATALOG=Object.freeze({
  book:Object.freeze({label:'Книга историй',symbol:'📖',tag:'books'}),
  postcard:Object.freeze({label:'Музыкальная открытка',symbol:'♫',tag:'music'}),
  sketch:Object.freeze({label:'Акварельный набросок',symbol:'✧',tag:'drawing'}),
  boardgame:Object.freeze({label:'Настольная игра',symbol:'♟',tag:'games'})
});
export const LEISURE_CATALOG=Object.freeze({
  music:Object.freeze({label:'Вместе слушать музыку',symbol:'♫',tag:'music',duration:28}),
  books:Object.freeze({label:'Читать и обсуждать истории',symbol:'📖',tag:'books',duration:30}),
  games:Object.freeze({label:'Играть вместе',symbol:'♟',tag:'games',duration:36})
});
export const GIFT_DURATION=12;
export const INVENTORY_LIMIT=12;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const isRecord=v=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const validId=id=>typeof id==='string'&&/^[am][0-9]{1,8}$/.test(id);
const resident=id=>id==='alex'||id==='mira';
const other=id=>id==='alex'?'mira':'alex';
const actor=(root,id)=>id==='mira'?root.otherSim:root;
const has=(catalog,id)=>typeof id==='string'&&Object.hasOwn(catalog,id);
export function starterInventory(){
  // Each person starts with a thoughtful gift matching the OTHER's interests.
  return {alex:[{id:'a1',type:'postcard'},{id:'a2',type:'sketch'}],
    mira:[{id:'m1',type:'book'},{id:'m2',type:'boardgame'}]};
}
/** Missing inventory is an OLD v1 save; a present empty inventory stays empty.
 * Strict whitelist, de-duplication across both owners and bounded arrays.
 */
export function restoreInventory(raw){
  if(raw===undefined)return starterInventory();
  const inventory={alex:[],mira:[]},seen=new Set();
  if(!isRecord(raw))return inventory;
  for(const id of ['alex','mira']){
    const entries=Array.isArray(raw[id])?raw[id]:[];
    for(const item of entries){
      if(!isRecord(item)||!validId(item.id)||!has(GIFT_CATALOG,item.type)||
        seen.has(item.id))continue;
      seen.add(item.id);inventory[id].push({id:item.id,type:item.type});
      if(inventory[id].length>=INVENTORY_LIMIT)break;
    }
  }
  return inventory;
}
export function inventoryFor(root,id){
  return resident(id)&&Array.isArray(root?.inventory?.[id])?root.inventory[id]:[];
}
export function createSharedSession(root,initiator,mode,choiceId){
  if(!resident(initiator)||!root?.otherSim)return null;
  if(mode==='gift'){
    if(!inventoryFor(root,initiator).some(item=>item.id===choiceId))return null;
    return {mode:'gift',choiceId};
  }
  if(mode==='leisure'&&has(LEISURE_CATALOG,choiceId))
    return {mode:'leisure',choiceId};
  return null;
}
export function sharedDuration(session){
  if(!isRecord(session))return null;
  if(session.mode==='gift')return GIFT_DURATION;
  if(session.mode==='leisure'&&has(LEISURE_CATALOG,session.choiceId))
    return LEISURE_CATALOG[session.choiceId].duration;
  return null;
}
export function restoreSharedSession(raw,root,initiator){
  if(!isRecord(raw)||Object.keys(raw).some(key=>!['mode','choiceId'].includes(key)))return null;
  return createSharedSession(root,initiator,raw.mode,raw.choiceId);
}
/** After the item was offered, the recipient decides deterministically.
 * A dislike can lead to refusal; a neutral gift can be accepted politely.
 */
export function evaluateGift(root,initiator,item){
  if(!resident(initiator)||!has(GIFT_CATALOG,item?.type))return null;
  const receiverId=other(initiator),receiver=actor(root,receiverId);
  if(!receiver)return null;
  const reaction=evaluateSocialReaction({
    kind:'gift',recipient:receiver,view:getPerspective(root,receiverId),
    minutes:root.minutes,tag:GIFT_CATALOG[item.type].tag
  });
  return reaction?{accepted:reaction.accepted,liked:reaction.liked,score:reaction.score}:null;
}
export function evaluateLeisure(root,initiator,id){
  if(!resident(initiator)||!has(LEISURE_CATALOG,id))return null;
  const peerId=other(initiator),peer=actor(root,peerId);
  if(!peer)return null;
  const reaction=evaluateSocialReaction({
    kind:'leisure',recipient:peer,view:getPerspective(root,peerId),
    minutes:root.minutes,tag:LEISURE_CATALOG[id].tag
  });
  return reaction?{accepted:reaction.accepted,score:reaction.score}:null;
}
const remember=(root,id,memoryId)=>{
  const person=actor(root,id);
  const memory={id:memoryId,at:root.minutes,fulfilled:false};
  person.mind.memories=[...(person.mind.memories||[]),memory].slice(-12);
  feelMemory(person,memory);
  applySocialPerspective(getPerspective(root,id),memory,person,root.minutes);
  person.autonomy.nextAt=root.minutes+15;
  refreshMind(person);
};
const transfer=(root,owner,id)=>{
  const from=inventoryFor(root,owner),to=inventoryFor(root,other(owner));
  const at=from.findIndex(x=>x.id===id);
  if(at<0||to.length>=INVENTORY_LIMIT)return false;
  const [gift]=from.splice(at,1);to.push(gift);return true;
};
/** Called by relationships.tickSocial once, only when the shared session ended.
 * Full action receipt: needs / inventory / each person's memory+emotion /
 * directed relationships / shared affinity. No partial completion rewards.
 */
export function completeSharedSession(root){
  const action=root?.socialAction,session=action?.shared;
  if(!action||action.phase!=='using'||!session||root.paused)return null;
  const from=action.initiator,to=other(from),giver=actor(root,from),receiver=actor(root,to);
  if(!giver||!receiver)return null;
  let delta=0,message='',kind='';
  if(session.mode==='gift'){
    const item=inventoryFor(root,from).find(x=>x.id===session.choiceId);
    if(!item)return null;
    const assessment=evaluateGift(root,from,item);
    if(!assessment)return null;
    if(assessment.accepted&&!transfer(root,from,item.id))return null;
    if(assessment.accepted){
      kind=assessment.liked?'liked':'accepted';
      remember(root,from,'gift.given');
      remember(root,to,assessment.liked?'gift.liked':'gift.neutral');
      delta=assessment.liked?5:1;
      message=assessment.liked?'Подарок очень понравился!':'Подарок принят';
    }else{
      kind='refused';
      remember(root,from,'gift.rejected');remember(root,to,'gift.refused');
      delta=-2;message='От подарка отказались';
    }
  }else if(session.mode==='leisure'){
    const evaluation=evaluateLeisure(root,from,session.choiceId);
    if(!evaluation)return null;
    if(evaluation.accepted){
      kind='completed';
      const mem='leisure.'+session.choiceId;
      remember(root,from,mem);remember(root,to,mem);
      giver.needs.fun=clamp(giver.needs.fun+12,0,100);
      receiver.needs.fun=clamp(receiver.needs.fun+12,0,100);
      delta=4;message='Хорошо провели время вместе';
    }else{
      kind='refused';
      remember(root,from,'leisure.refused');remember(root,to,'leisure.refused');
      delta=-1;message='Сегодня не получилось отдохнуть вместе';
    }
  }else return null;
  root.relationship.affinity=clamp(root.relationship.affinity+delta,0,100);
  giver.event=message;receiver.event=message;
  refreshMind(giver);refreshMind(receiver);
  // Caller clears the action immediately so ticks and reload never duplicate it.
  return {kind,delta,label:message};
}
