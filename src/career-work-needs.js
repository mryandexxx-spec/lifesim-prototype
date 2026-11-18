/** W3-B: deterministic, PlayCanvas-independent off-lot care and work mode economy.
 * Work is credited only at completed game-minute boundaries, with saved watermark.
 * No wallet, skill, work-scene, friend, coworker or relationship writes.
 */
import {NEED_DECAY_PER_MINUTE} from './need-balance.js';
import {socialNeedDecayRate} from './social-need.js';
import {deriveAxes} from './trait-catalog.js';

export const WORK_MODES=Object.freeze({
  effort:Object.freeze({label:'Стараться',description:'Больше результативности, но быстрее накапливаются усталость и напряжение. Меньше общения.',performance:3,fatigue:1.42,fun:1.4,social:.22,strain:1.65}),
  normal:Object.freeze({label:'Обычный темп',description:'Сбалансированная работа, обычная усталость и короткие разговоры.',performance:0,fatigue:1,fun:1,social:1,strain:1}),
  network:Object.freeze({label:'Налаживать связи',description:'Больше общения, немного меньше результативности и чуть выше нагрузка. Не создаёт новых знакомых.',performance:-1,fatigue:1.07,fun:.8,social:2.15,strain:.9}),
  conserve:Object.freeze({label:'Беречь силы',description:'Меньше усталости и напряжения ценой более медленного карьерного результата.',performance:-3,fatigue:.56,fun:.75,social:.7,strain:.5})
});
export const WORK_MODE_IDS=Object.freeze(Object.keys(WORK_MODES));
export const cleanWorkMode=value=>Object.hasOwn(WORK_MODES,value)?value:'normal';
const clamp=value=>Math.max(0,Math.min(100,value));
const actorFor=(root,id)=>id==='mira'?root?.otherSim:root;
const safeInt=(v,min,max,fallback)=>Number.isSafeInteger(v)&&v>=min&&v<=max?v:fallback;

/** Optional v1 extension. Missing / corrupted data never rewinds a shift or invents breaks. */
export function restoreWorkNeeds(raw,shift){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const from=Math.floor(shift.departedAt),end=Math.floor(shift.end);
  const minute=safeInt(raw.appliedThrough,from,end,null);
  if(minute===null)return null;
  return {
    appliedThrough:minute,
    mealUsed:raw.mealUsed===true,
    toiletCount:safeInt(raw.toiletCount,0,2,0),
    lastToiletMinute:safeInt(raw.lastToiletMinute,from,end,from),
    socialMinutes:safeInt(raw.socialMinutes,0,720,0),
    modeScore:Number.isFinite(raw.modeScore)&&Math.abs(raw.modeScore)<=2160?raw.modeScore:0,
    strain:Number.isFinite(raw.strain)&&raw.strain>=0&&raw.strain<=100?raw.strain:0
  };
}
export function newWorkNeeds(departedAt){
  const minute=Math.floor(departedAt);
  return {appliedThrough:minute,mealUsed:false,toiletCount:0,
    lastToiletMinute:minute-150,socialMinutes:0,modeScore:0,strain:0};
}
export function workNeedsReport(shift){
  const w=shift?.workNeeds;
  return {meal:w?.mealUsed===true,toilet:w?.toiletCount||0,
    socialMinutes:w?.socialMinutes||0,strain:Math.round(w?.strain||0)};
}
/** Process only whole GAME minutes in [before, after] intersected with real working.
 * New shifts carry their arrival marker. Legacy saves start at the current
 * tick boundary, avoiding retrospective meals/rewards from already played time.
 */
export function progressWorkNeeds(root,before,after){
  if(!root||root.paused||!Number.isFinite(before)||!Number.isFinite(after)||after<=before)return;
  for(const id of ['alex','mira']){
    const shift=root.careerSystem?.byResident?.[id]?.currentShift;
    const actor=actorFor(root,id);
    if(!actor?.needs||!shift||shift.phase!=='working')continue;
    if(!shift.workNeeds)shift.workNeeds=newWorkNeeds(Math.max(shift.departedAt,before));
    const state=shift.workNeeds;
    const limit=Math.floor(Math.min(after,shift.end));
    const start=Math.max(Math.floor(shift.departedAt),state.appliedThrough);
    if(limit<=start)continue;
    const mode=WORK_MODES[cleanWorkMode(shift.workMode)];
    const axes=deriveAxes(actor.personality);
    const readiness=Math.max(0,Math.min(100,Number.isFinite(shift.readiness)?shift.readiness:65));
    const duration=shift.end-shift.start;
    const fatiguePerMinute=(.026+.015*Math.min(1,duration/480))*
      (1.12-(axes.resilience-.5)*.24)*(1.12-(readiness-50)/500)*mode.fatigue;
    const socialDecay=socialNeedDecayRate(actor.personality);
    for(let minute=start+1;minute<=limit;minute++){
      const needs=actor.needs;
      needs.hunger=clamp(needs.hunger-NEED_DECAY_PER_MINUTE.hunger);
      needs.bladder=clamp(needs.bladder-NEED_DECAY_PER_MINUTE.bladder);
      needs.energy=clamp(needs.energy-fatiguePerMinute);
      needs.hygiene=clamp(needs.hygiene-.014);
      needs.fun=clamp(needs.fun-.0085*mode.fun);
      // Ordinary unnamed ambient conversations, diminishing near the comfort cap.
      const talk=Math.max(0,Math.min(1,(88-needs.social)/35))*
        (.056+(axes.sociability-.5)*.024)*mode.social;
      const nextSocial=clamp(needs.social-socialDecay+talk);
      if(nextSocial>needs.social)state.socialMinutes=Math.min(720,state.socialMinutes+1);
      needs.social=nextSocial;
      if(!state.mealUsed&&duration>=300&&minute>=shift.start+duration*.5){
        state.mealUsed=true;
        needs.hunger=Math.min(80,needs.hunger+33);
      }
      const maxToilets=duration>=420?2:1;
      if(needs.bladder<=39&&state.toiletCount<maxToilets&&
        minute-state.lastToiletMinute>=120){
        needs.bladder=Math.min(79,needs.bladder+43);
        state.toiletCount++;
        state.lastToiletMinute=minute;
      }
      state.modeScore+=mode.performance;
      state.strain=Math.min(100,state.strain+.029*mode.strain*
        (1.15-(axes.resilience-.5)*.3));
    }
    state.appliedThrough=limit;
  }
}
