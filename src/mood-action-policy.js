/** M2: deterministic, read-only willingness and productivity.
 * One source of aggregate mood: psychology.calculateMood. No DOM/PlayCanvas,
 * no random draws, no saved flags, relationship events or queue mutations.
 */
import {calculateMood} from './psychology.js';
import {deriveAxes} from './trait-catalog.js';

const clamp=(value,lo,hi)=>Math.max(lo,Math.min(hi,value));
const safeNeeds=needs=>Object.fromEntries(['hunger','energy','hygiene','fun']
  .map(key=>[key,clamp(Number.isFinite(needs?.[key])?needs[key]:50,0,100)]));
const record=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const important=new Set(['fridge','bed','shower','toilet']);
const direct=new Set(['talk','argue']);

/** The initiator can decline voluntary work, but cannot evade basic self-care,
 * one-click legacy talk/argue, or unilateral breakup/divorce. Recipients still
 * separately decide consent through the existing unified reaction engine.
 */
function effortThreshold(command,{automatic=false}={}){
  if(!record(command))return null;
  if(command.type==='object')return null; // all current care/recovery actions protected
  if(command.type==='social')return automatic&&direct.has(command.actionId)?33:null;
  if(command.type==='conversation')return 30;
  if(command.type==='shared')return command.mode==='leisure'?34:
    command.mode==='gift'?22:null;
  if(command.type==='branch'&&typeof command.actionId==='string'){
    if(/^(acquaint|friend|rival)\./.test(command.actionId))return 27;
    // Romantic consent and free, unilateral exit have their own safeguards.
    return null;
  }
  return null;
}
const productivity=command=>(command?.type==='object'&&command.actionId==='sofa')||
  (command?.type==='shared'&&command.mode==='leisure');

/** Pure policy snapshot; command is the typed FIFO intent or autonomous idea.
 * Efficiency multiplies only fun recovery from voluntary rest/leisure, never
 * movement, animations, timers, basic food/sleep/wash or social affinity.
 */
export function moodActionPolicy(resident,command,options={}){
  const needs=safeNeeds(resident?.needs);
  const mind=record(resident?.mind)?resident.mind:{memories:[],emotions:[]};
  const minutes=Number.isFinite(resident?.minutes)?Math.max(0,resident.minutes):480;
  const mood=calculateMood(needs,mind,minutes,resident?.personality).value;
  const personality=deriveAxes(resident?.personality);
  const threshold=effortThreshold(command,options);
  // A very depleted person does not force themselves into optional work merely
  // because a recent positive emotion temporarily masks exhaustion.
  const urgent=needs.energy<16||needs.hunger<14;
  const refusalThreshold=threshold===null?null:
    clamp(Math.round(threshold+(0.5-personality.resilience)*14),16,42);
  const willing=refusalThreshold===null||(!urgent&&mood>=refusalThreshold);
  const factor=mood<60?0.85+0.15*mood/60:
    mood>75?1+0.12*(mood-75)/25:1;
  const efficiency=productivity(command)?clamp(factor,0.85,1.12):1;
  const reason=willing?null:needs.energy<25?'Сильно устал и пока не готов к этому':
    needs.hunger<22?'Слишком голоден для этого занятия':
    'Сейчас не в настроении для этого занятия';
  return {mood,efficiency,willing,reason,threshold:refusalThreshold};
}
export function voluntaryMoodEfficiency(resident,command){
  return moodActionPolicy(resident,command).efficiency;
}
