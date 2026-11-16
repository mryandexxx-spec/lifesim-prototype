/** F4b6 — truthful, registry-driven furniture characteristics for the shop.
 * Presentation ONLY: no implicit buff, tier multiplier, purchase or save writes.
 * Future quality attributes can be authored without any prefab-specific cases.
 */
import {getObjectItem} from './object-definition-registry.js';

const signed=n=>(n>0?'+':'')+String(Number(n.toFixed(3))).replace('.',',');
const statisticLabel=(registry,id)=>registry.stats?.[id]?.label||id;
const triggerLabel=Object.freeze({
  'item.use.tick':'при использовании',
  'item.use.complete':'после использования',
  'item.presence.tick':'рядом с предметом',
  'item.placed':'при размещении',
  'item.repaired':'после ремонта'
});

/** Returns frozen, display-only facts; no rating is fabricated if un-authored. */
export function describeObjectQualities(registry,itemId){
  const item=getObjectItem(registry,itemId);
  if(!item)return null;
  const properties=Object.freeze(item.categoryIds
    .map(id=>registry.categories[id])
    .filter(cat=>cat?.facet==='function')
    .map(cat=>cat.label));
  const ratings=Object.freeze(Object.entries(item.ratings).map(([id,value])=>Object.freeze({
    id,label:registry.attributes[id]?.label||id,value,
    min:registry.attributes[id]?.min,max:registry.attributes[id]?.max
  })));
  const effects=Object.freeze(item.effects.map(effect=>{
    const perMinute=effect.mode==='perMinute';
    const action=effect.actionId?' · '+effect.actionId:'';
    const when=triggerLabel[effect.trigger]||effect.trigger;
    const label=statisticLabel(registry,effect.statId)+' '+signed(effect.amount)+
      (perMinute?'/мин':'')+' · '+when+action;
    return Object.freeze({id:effect.id,label,statId:effect.statId,
      trigger:effect.trigger,mode:effect.mode,amount:effect.amount});
  }));
  return Object.freeze({itemId:item.id,properties,ratings,effects,
    hasMeasuredQuality:ratings.length>0||effects.length>0});
}

/** Small mobile summary, empty when no measured quality is authored.
 * A purely decorative appearance is never described as gameplay quality.
 */
export function shopQualitySummary(profile){
  if(!profile)return '';
  const parts=[
    ...profile.ratings.map(r=>r.label+': '+r.value),
    ...profile.effects.map(e=>e.label)
  ];
  return parts.join(' · ');
}
