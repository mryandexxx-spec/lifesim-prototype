/** Блин’С 0.8c: deterministic, headless, short-term emotions driven by known memories.
 * Memory is a durable history; an emotion is a bounded time-decaying reaction.
 * No DOM, PlayCanvas, wall-clock time, labels or free text from a save file.
 */
import {deriveAxes} from './trait-catalog.js';

export const EMOTION_DURATION=360; // in-game minutes, deliberately matches v1 memory decay
export const EMOTION_LIMIT=5;
export const EMOTION_KINDS=Object.freeze({
  calm:Object.freeze({label:'Спокоен',icon:'☾'}),
  joy:Object.freeze({label:'Радуется',icon:'♡'}),
  inspiration:Object.freeze({label:'Вдохновлён',icon:'✧'}),
  sadness:Object.freeze({label:'Грустит',icon:'☁'}),
  irritation:Object.freeze({label:'Раздражён',icon:'⚡'}),
  anxiety:Object.freeze({label:'Тревожится',icon:'◇'}),
  enthusiasm:Object.freeze({label:'Увлечён',icon:'♫'})
});
export const EMOTION_SOURCES=Object.freeze({
  bed:Object.freeze({kind:'calm',cause:'Хорошо выспался',mood:5}),
  fridge:Object.freeze({kind:'joy',cause:'Вкусно поел',mood:5}),
  shower:Object.freeze({kind:'calm',cause:'Принял душ',mood:5}),
  sofa:Object.freeze({kind:'enthusiasm',cause:'Удалось отдохнуть',mood:5}),
  talk:Object.freeze({kind:'joy',cause:'Приятный разговор',mood:11}),
  argue:Object.freeze({kind:'irritation',cause:'Ссора',mood:-18}),
  regret:Object.freeze({kind:'sadness',cause:'Сожалеет о ссоре',mood:-13}),
  hurt:Object.freeze({kind:'sadness',cause:'Обиделся после ссоры',mood:-22}),
  reconcile:Object.freeze({kind:'joy',cause:'Удалось помириться',mood:18}),
  'gift.given':Object.freeze({kind:'joy',cause:'Вручил подарок',mood:7}),
  'gift.liked':Object.freeze({kind:'joy',cause:'Получил желанный подарок',mood:14}),
  'gift.neutral':Object.freeze({kind:'calm',cause:'Принял подарок',mood:5}),
  'gift.rejected':Object.freeze({kind:'sadness',cause:'Подарок не приняли',mood:-9}),
  'gift.refused':Object.freeze({kind:'irritation',cause:'Не понравился подарок',mood:-5}),
  'leisure.music':Object.freeze({kind:'enthusiasm',cause:'Музыка вместе',mood:11}),
  'leisure.books':Object.freeze({kind:'inspiration',cause:'Совместное чтение',mood:11}),
  'leisure.games':Object.freeze({kind:'joy',cause:'Совместная игра',mood:11}),
  'leisure.refused':Object.freeze({kind:'sadness',cause:'Не удалось провести время вместе',mood:-5})
});
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const isRecord=v=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const isSource=id=>typeof id==='string'&&Object.hasOwn(EMOTION_SOURCES,id);
const eventKey=(source,at,fulfilled)=>source+'|'+at+'|'+(fulfilled?'1':'0');
const active=(entry,minutes)=>isRecord(entry)&&isSource(entry.source)&&
  Number.isFinite(entry.at)&&entry.at>=0&&entry.at<=minutes&&
  Number.isFinite(entry.intensity)&&entry.intensity>0&&entry.intensity<=100&&
  entry.until===entry.at+EMOTION_DURATION&&entry.until>minutes;

export function emotionKindFor(source,personality){
  const base=EMOTION_SOURCES[source];if(!base)return null;
  const axes=deriveAxes(personality);
  if(source==='regret'||source==='hurt'||source==='argue'){
    if(axes.emotionalReactivity>=.74&&axes.resilience<.5)return 'irritation';
    if(source==='hurt'&&axes.emotionalReactivity>=.65)return 'anxiety';
  }
  if(source==='sofa'&&axes.creativity>.63)return 'inspiration';
  if(source==='talk'&&axes.sociability<.38)return 'calm';
  if(source==='reconcile'&&axes.resilience>.62)return 'calm';
  return base.kind;
}
/** No scripts or cause strings enter persistent records, only enumerated IDs. */
export function emotionFromMemory(memory,personality,{legacy=false}={}){
  if(!isRecord(memory)||!isSource(memory.id)||!Number.isFinite(memory.at)||
    memory.at<0)return null;
  const axes=deriveAxes(personality);
  const mood=EMOTION_SOURCES[memory.id].mood;
  const factor=.9+(axes.emotionalReactivity-.5)*.5+
    (mood>0?axes.optimism-.5:.5-axes.resilience)*.25;
  return {
    source:memory.id,at:memory.at,until:memory.at+EMOTION_DURATION,
    intensity:legacy?60:clamp(Math.round(60*factor),24,94),
    fulfilled:memory.fulfilled===true
  };
}
export function pruneEmotions(mind,minutes){
  if(!isRecord(mind))return [];
  mind.emotions=(Array.isArray(mind.emotions)?mind.emotions:[])
    .filter(entry=>active(entry,minutes)).slice(-EMOTION_LIMIT);
  return mind.emotions;
}
/** Called once immediately after a completed action appends its memory. */
export function feelMemory(state,memory){
  if(!state?.mind||!memory||!Number.isFinite(state.minutes))return false;
  const entry=emotionFromMemory(memory,state.personality);
  if(!entry||entry.at!==state.minutes)return false;
  const current=pruneEmotions(state.mind,state.minutes);
  const key=eventKey(entry.source,entry.at,entry.fulfilled);
  if(current.some(item=>eventKey(item.source,item.at,item.fulfilled)===key))return false;
  state.mind.emotions=[...current,entry].slice(-EMOTION_LIMIT);
  return true;
}
/** Restore only entries linked to validated memories. A 0.8b save had no emotions:
 * synthesize neutral-intensity interpretations of the remaining history.
 */
export function restoreEmotions(raw,memories,minutes,personality){
  const validMemories=Array.isArray(memories)?memories:[];
  const out=[],used=new Set();
  const old=isRecord(raw)&&Array.isArray(raw.emotions)?raw.emotions:null;
  const candidates=old??validMemories.map(memory=>emotionFromMemory(memory,personality,{legacy:true}));
  for(const entry of candidates){
    if(!active(entry,minutes)||!validMemories.some(m=>m.id===entry.source&&m.at===entry.at&&
      (m.fulfilled===true)===(entry.fulfilled===true)))continue;
    const key=eventKey(entry.source,entry.at,entry.fulfilled);
    if(used.has(key))continue;
    used.add(key);
    out.push({source:entry.source,at:entry.at,until:entry.at+EMOTION_DURATION,
      intensity:entry.intensity,fulfilled:entry.fulfilled===true});
  }
  return out.slice(-EMOTION_LIMIT);
}
/** Read-only snapshots. UI labels and reasons are always from our trusted catalog. */
export function visibleEmotions(mind,minutes,personality=null){
  if(!Number.isFinite(minutes))return [];
  return (Array.isArray(mind?.emotions)?mind.emotions:[])
    .filter(entry=>active(entry,minutes))
    .map(entry=>{
      const remaining=entry.until-minutes;
      const intensity=Math.round(entry.intensity*remaining/EMOTION_DURATION);
      const kind=emotionKindFor(entry.source,personality);
      return {kind,icon:EMOTION_KINDS[kind].icon,label:EMOTION_KINDS[kind].label,
        cause:EMOTION_SOURCES[entry.source].cause,source:entry.source,
        at:entry.at,remaining,intensity};
    })
    .filter(entry=>entry.intensity>0)
    .sort((a,b)=>b.intensity-a.intensity||b.at-a.at).slice(0,EMOTION_LIMIT);
}
/** New reactions replace *matching* legacy memory mood effects, never stack
 * with them. The remaining unmatched history retains its old 0.8a behavior.
 */
export function emotionMoodImpact(mind,minutes){
  let delta=0;
  const covered=new Set();
  if(!Number.isFinite(minutes))return {delta,covered};
  const memories=Array.isArray(mind?.memories)?mind.memories:[];
  for(const entry of (Array.isArray(mind?.emotions)?mind.emotions:[])){
    if(!active(entry,minutes)||!memories.some(m=>m.id===entry.source&&m.at===entry.at&&
      (m.fulfilled===true)===(entry.fulfilled===true)))continue;
    const key=eventKey(entry.source,entry.at,entry.fulfilled);
    if(covered.has(key))continue;
    covered.add(key);
    const def=EMOTION_SOURCES[entry.source];
    const strength=(entry.until-minutes)/EMOTION_DURATION;
    const baseline=entry.source==='bed'||entry.source==='fridge'||
      entry.source==='shower'||entry.source==='sofa'
      ? (entry.fulfilled?12:5):def.mood;
    delta+=baseline*(entry.intensity/60)*strength;
  }
  return {delta,covered};
}
export function memoryEmotionKey(memory){
  return eventKey(memory.id,memory.at,memory.fulfilled===true);
}
