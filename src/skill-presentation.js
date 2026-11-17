/** H4: pure, read-only per-resident skill selectors, independent of DOM and 3D. */
import {deriveSkillLevel,getSkillDefinition} from './skill-registry.js';

const SKILL_GUIDANCE=Object.freeze({
  literature:'Читай книги у купленного книжного шкафа. Совместное чтение тоже развивает эрудицию.',
  painting:'Рисуй у купленного мольберта: каждая законченная картина остаётся в коллекции.',
  cooking:'Готовь на плите после подготовки продуктов на рабочей поверхности. Новые блюда открываются по уровню кулинарии.'
});
const UNLOCK_LABELS=Object.freeze({
  'books.read.classics':'Книга «Пути старых городов»',
  'cook.pasta':'Рецепт «Паста с овощами»',
  'cook.gratin':'Рецепт «Сливочная запеканка»'
});

export function skillProfileRows(progress,registry){
  if(registry?.schema!==1||!registry.skills||typeof registry.skills!=='object')return [];
  return Object.values(registry.skills).map(def=>{
    const skill=getSkillDefinition(registry,def.id);
    if(!skill)return null;
    const saved=progress?.schema===1?progress?.xpById?.[skill.id]:null;
    const rawXP=typeof saved==='number'&&Number.isFinite(saved)&&saved>=0?saved:0;
    const cap=skill.xpThresholds.at(-1);
    const xp=Math.min(rawXP,cap);
    const level=deriveSkillLevel(registry,skill.id,xp);
    const previous=level>0?skill.xpThresholds[level-1]:0;
    const next=level===skill.maxLevel?cap:skill.xpThresholds[level];
    const percentage=level===skill.maxLevel?100:
      Math.max(0,Math.min(100,Math.round((xp-previous)/(next-previous)*100)));
    return Object.freeze({id:skill.id,label:skill.label,level,maxLevel:skill.maxLevel,
      xp,next,previous,percentage,mastered:level===skill.maxLevel,
      hint:SKILL_GUIDANCE[skill.id]||'Практикуйся с подходящими предметами.',
      unlocks:Object.freeze(skill.unlocks.map(unlock=>Object.freeze({
        id:unlock.id,label:UNLOCK_LABELS[unlock.id]||unlock.id,
        minLevel:unlock.minLevel,unlocked:level>=unlock.minLevel
      })))
    });
  }).filter(Boolean);
}
