/** Блин’С 0.8d: persistent directed views, independent of 3D and shared affinity.
 * Relationship state is distinct from emotions (short) and memories (history).
 */
import {deriveAxes} from './trait-catalog.js';
import {visibleEmotions} from './emotion-engine.js';

export const RELATIONSHIP_VIEW_IDS=Object.freeze(['alex','mira']);
export const SENTIMENT_LIMIT=8;
export const SENTIMENTS=Object.freeze({
  talk:Object.freeze({label:'Приятный разговор',tone:'positive'}),
  argue:Object.freeze({label:'Давний спор',tone:'negative'}),
  regret:Object.freeze({label:'Сожалеет о ссоре',tone:'negative'}),
  hurt:Object.freeze({label:'Помнит обиду',tone:'negative'}),
  reconcile:Object.freeze({label:'Примирение',tone:'positive'})
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
    !['talk','regret','hurt','reconcile'].includes(memory.id))return false;
  const key=eventKey(memory.id,memory.at);
  if(view.sentiments.some(m=>eventKey(m.id,m.at)===key))return false;
  const axes=deriveAxes(resident?.personality);
  const positive=memory.id==='talk'||memory.id==='reconcile';
  const feelings=visibleEmotions(resident?.mind,minutes,resident?.personality);
  const active=feelings.find(e=>e.source===memory.id&&e.at===memory.at);
  const intensity=active?.intensity??60;
  const felt=clamp(.9+intensity/600,.9,1.1);
  const positiveFactor=clamp(.7+axes.sociability*.25+axes.empathy*.25+
    axes.optimism*.12,.7,1.2)*felt;
  const negativeFactor=clamp(.77+axes.emotionalReactivity*.4+
    (1-axes.resilience)*.2,.77,1.37)*felt;
  const factor=positive?positiveFactor:negativeFactor;
  const raw=memory.id==='talk'?{friendship:6,trust:3,tension:-3}:
    memory.id==='regret'?{friendship:-5,trust:-4,tension:5}:
    memory.id==='hurt'?{friendship:-10,trust:-11,tension:12}:
    {friendship:7,trust:10,tension:-10};
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
