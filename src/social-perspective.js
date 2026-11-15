/** Блин’С 0.8d: persistent directed views, independent of 3D and shared affinity.
 * Relationship state is distinct from emotions (short) and memories (history).
 */
import {socialImpressionFactor} from './social-reactions.js';

export const RELATIONSHIP_VIEW_IDS=Object.freeze(['alex','mira']);
export const SENTIMENT_LIMIT=8;
export const SENTIMENTS=Object.freeze({
  talk:Object.freeze({label:'Приятный разговор',tone:'positive'}),
  argue:Object.freeze({label:'Давний спор',tone:'negative'}),
  regret:Object.freeze({label:'Сожалеет о ссоре',tone:'negative'}),
  hurt:Object.freeze({label:'Помнит обиду',tone:'negative'}),
  reconcile:Object.freeze({label:'Примирение',tone:'positive'}),
  'gift.given':Object.freeze({label:'Подарил вещь',tone:'positive'}),
  'gift.liked':Object.freeze({label:'Подарок понравился',tone:'positive'}),
  'gift.neutral':Object.freeze({label:'Принял подарок',tone:'positive'}),
  'gift.rejected':Object.freeze({label:'Его подарок не приняли',tone:'negative'}),
  'gift.refused':Object.freeze({label:'Отказался от подарка',tone:'negative'}),
  'leisure.music':Object.freeze({label:'Слушали музыку вместе',tone:'positive'}),
  'leisure.books':Object.freeze({label:'Читали вместе',tone:'positive'}),
  'leisure.games':Object.freeze({label:'Играли вместе',tone:'positive'}),
  'leisure.refused':Object.freeze({label:'Отказались от досуга',tone:'negative'})
});
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const finite=Number.isFinite;
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const validId=id=>typeof id==='string'&&Object.hasOwn(SENTIMENTS,id);
const validMoment=(entry,minutes)=>record(entry)&&validId(entry.id)&&
  finite(entry.at)&&entry.at>=0&&entry.at<=minutes;
const eventKey=(id,at)=>id+'|'+at;
const defaultTrust=friendship=>clamp(Math.round(45+(friendship-50)*.6),0,100);
const defaultTension=friendship=>clamp(Math.round(Math.max(0,50-friendship)*.8),0,100);

export function newPerspective(affinity=50){
  const friendship=clamp(Math.round(finite(affinity)?affinity:50),0,100);
  return {friendship,trust:defaultTrust(friendship),tension:defaultTension(friendship),sentiments:[]};
}
export function restoreSentiments(raw,minutes){
  if(!Array.isArray(raw)||!finite(minutes)||minutes<0)return [];
  const out=[],seen=new Set();
  for(const item of raw){
    if(!validMoment(item,minutes))continue;
    const key=eventKey(item.id,item.at);
    if(seen.has(key))continue;
    seen.add(key);out.push({id:item.id,at:item.at});
  }
  return out.slice(-SENTIMENT_LIMIT);
}
/** Legacy memories may populate *history only*, never replay numeric effects. */
export function legacySentiments(memories,minutes){
  return restoreSentiments(Array.isArray(memories)?memories:[],minutes);
}
export function restorePerspective(raw,affinity=50,minutes=480,legacyMemories=[]){
  const fallback=newPerspective(affinity);
  if(!record(raw)){
    fallback.sentiments=legacySentiments(legacyMemories,minutes);
    return fallback;
  }
  for(const key of ['friendship','trust','tension']){
    if(finite(raw[key]))fallback[key]=clamp(Math.round(raw[key]),0,100);
  }
  fallback.sentiments=restoreSentiments(raw.sentiments,minutes);
  return fallback;
}
export function getPerspective(root,id='alex'){
  if(!RELATIONSHIP_VIEW_IDS.includes(id))return null;
  const relationship=root?.relationship;
  return relationship?.views?.[id]||newPerspective(relationship?.affinity);
}
/** Completion events have a role-specific memory; apply at most once for a
 * given ID+game minute per viewpoint, even if a completion is retried.
 * All inputs are trusted server-free game state or sanitized save data.
 */
export function applySocialPerspective(view,memory,resident,minutes){
  if(!record(view)||!validMoment(memory,minutes)||!Array.isArray(view.sentiments)||
    !['talk','regret','hurt','reconcile',
      'gift.given','gift.liked','gift.neutral','gift.rejected','gift.refused',
      'leisure.music','leisure.books','leisure.games','leisure.refused'].includes(memory.id))return false;
  const key=eventKey(memory.id,memory.at);
  if(view.sentiments.some(m=>eventKey(m.id,m.at)===key))return false;
  const factor=socialImpressionFactor(resident,memory,minutes);
  const raw=memory.id==='talk'?{friendship:6,trust:3,tension:-3}:
    memory.id==='regret'?{friendship:-5,trust:-4,tension:5}:
    memory.id==='hurt'?{friendship:-10,trust:-11,tension:12}:
    memory.id==='reconcile'?{friendship:7,trust:10,tension:-10}:
    memory.id==='gift.liked'?{friendship:7,trust:6,tension:-4}:
    memory.id==='gift.given'?{friendship:2,trust:2,tension:-1}:
    memory.id==='gift.neutral'?{friendship:2,trust:2,tension:0}:
    memory.id==='gift.rejected'||memory.id==='gift.refused'
      ?{friendship:-2,trust:-2,tension:3}:
    memory.id==='leisure.refused'?{friendship:-2,trust:-1,tension:2}:
    {friendship:5,trust:3,tension:-3};
  for(const axis of ['friendship','trust','tension']){
    const safe=finite(view[axis])?view[axis]:newPerspective()[axis];
    view[axis]=clamp(Math.round(safe+raw[axis]*factor),0,100);
  }
  view.sentiments=[...view.sentiments,{id:memory.id,at:memory.at}].slice(-SENTIMENT_LIMIT);
  return true;
}
export function latestSentiments(view,limit=2){
  return (Array.isArray(view?.sentiments)?view.sentiments:[])
    .slice(-Math.max(0,Math.min(3,limit))).reverse()
    .filter(s=>validId(s.id)&&finite(s.at))
    .map(s=>({label:SENTIMENTS[s.id].label,at:s.at,id:s.id}));
}
