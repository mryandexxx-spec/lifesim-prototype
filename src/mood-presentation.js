/** Read-only mood/need visuals. Actual mood belongs to psychology.calculateMood.
 * No saved state, random numbers, PlayCanvas, DOM, clock timers or gameplay effects.
 */
import {visibleEmotions} from './emotion-engine.js';
import {reactionBadgePoint} from './social-feedback.js';

const clamp=value=>Number.isFinite(value)?Math.max(0,Math.min(100,value)):50;
export const NEED_LABELS=Object.freeze({
  hunger:'Сытость',energy:'Энергия',hygiene:'Гигиена',fun:'Досуг',
  social:'Общение'
});
export const NEED_TONES=Object.freeze([
  Object.freeze({id:'critical',min:0,label:'Критично',color:'#d9756a'}),
  Object.freeze({id:'low',min:20,label:'Низко',color:'#d89d45'}),
  Object.freeze({id:'fair',min:45,label:'Норма',color:'#a5b86d'}),
  Object.freeze({id:'good',min:75,label:'Хорошо',color:'#63b69a'})
]);
export const MOOD_TONES=Object.freeze([
  Object.freeze({id:'overwhelmed',min:0,label:'На пределе',color:'#d9756a'}),
  Object.freeze({id:'down',min:20,label:'Не в духе',color:'#d89d45'}),
  Object.freeze({id:'steady',min:40,label:'Ровное',color:'#8baf9f'}),
  Object.freeze({id:'content',min:60,label:'Доволен',color:'#63b69a'}),
  Object.freeze({id:'radiant',min:80,label:'Окрылён',color:'#399d83'})
]);
const toneFor=(value,scale)=>{
  const amount=clamp(value);
  let selected=scale[0];
  for(const entry of scale)if(amount>=entry.min)selected=entry;
  return {...selected,value:Math.round(amount)};
};
export function needPresentation(value){return toneFor(value,NEED_TONES);}
export function moodTone(value){return toneFor(value,MOOD_TONES);}

const NEED_REASONS=Object.freeze({
  hunger:['Очень голоден','Хочет поесть'],
  energy:['Сильно устал','Нуждается в отдыхе'],
  hygiene:['Нуждается в душе','Хочет освежиться'],
  fun:['Сильно скучает','Не хватает досуга'],
  social:['Чувствует одиночество','Не хватает общения']
});
/** Causes only from validated needs and *actual* stored emotion receipts;
 * never claim a fictional event or invent a seventh need.
 */
export function moodReasons(resident,{limit=3}={}){
  const max=Number.isInteger(limit)?Math.max(0,Math.min(limit,3)):3;
  const needs=resident?.needs||{};
  const reasons=Object.keys(NEED_REASONS)
    .filter(key=>Number.isFinite(needs[key])&&needs[key]<45)
    .sort((a,b)=>needs[a]-needs[b])
    .map(key=>needs[key]<20?NEED_REASONS[key][0]:NEED_REASONS[key][1]);
  const feelings=visibleEmotions(resident?.mind,resident?.minutes,resident?.personality);
  for(const emotion of feelings){
    if(emotion.intensity<20)continue;
    if(!reasons.includes(emotion.cause))reasons.push(emotion.cause);
  }
  if(reasons.length===0){
    if(Object.keys(NEED_REASONS).every(key=>Number.isFinite(needs[key])&&needs[key]>=75))
      reasons.push('Основные потребности удовлетворены');
    else reasons.push('Сейчас нет сильных переживаний');
  }
  return reasons.slice(0,max);
}
export function moodPresentation(resident){
  const band=moodTone(resident?.mind?.mood?.value);
  return {...band,description:moodReasons(resident).join(' · ')};
}
/** Same tested camera-space safety as ephemeral reactions; the UI uses a
 * separate head offset and hides while a real social response is showing.
 */
export function moodOrbitPoint(screen,viewPoint,width,height){
  return reactionBadgePoint(screen,viewPoint,width,height,{top:112,bottom:152});
}
