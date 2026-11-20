/** UX-05: no new gameplay state. Read-only display of canonical needs and mood. */
import {NEED_LABELS,needPresentation} from './mood-presentation.js';
import {residentMoodInsight} from './insight-presentation.js';
export function characterCardSnapshot(actor,{name='Житель',world=null}={}){
 const info=residentMoodInsight(actor,{residentName:name,world});
 const needs=Object.entries(NEED_LABELS).filter(([id])=>Number.isFinite(actor?.needs?.[id]))
  .map(([id,label])=>({id,label,value:Math.round(actor.needs[id]),tone:needPresentation(actor.needs[id]).label}))
  .sort((a,b)=>a.value-b.value);
 return {name:info.name,mood:info.mood,reason:info.summary,reasons:info.reasons,
  primaryNeed:needs.length?needs[0].label+' · '+needs[0].value+'/100 · '+needs[0].tone:
   'Нет данных о потребностях',needs};
}
/** A stale/double-tapped DOM button cannot issue a second social receipt. */
export function oncePerButton(callback){
 let used=false;
 return (...args)=>{
  if(used)return false;
  used=true;
  try{const result=callback(...args);if(result===false)used=false;return result;}
  catch(error){used=false;throw error;}
 };
}
