/** H4: pure, read-only per-resident skill selectors, independent of DOM and 3D. */
import {deriveSkillLevel,getSkillDefinition} from './skill-registry.js';
import {PAINT_SUBJECTS} from './painting.js';
import {READING_BOOKS,READING_ADVANCED_CONTENT_ID} from './hobby-reading.js';

const SKILL_GUIDANCE=Object.freeze({
  literature:'Читай книги у купленного книжного шкафа. Совместное чтение тоже развивает эрудицию.',
  painting:'Практикуй живопись у мольберта. Новые сюжеты открываются с уровнями; картины остаются в коллекции.',
  cooking:'Готовь на плите после подготовки продуктов на рабочей поверхности. Новые блюда открываются по уровню кулинарии.',
  charisma:'Репетируй речь у настоящего зеркала. С 3-го уровня дружелюбные беседы становятся немного увереннее.',
  gardening:'Поливай грядки, собирай травы и сажай их заново. Опыт дают только завершённые ручные действия; автоматический уход не повышает навык.'
});
const UNLOCK_LABELS=Object.freeze({
  'books.read.classics':'Книга «Пути старых городов»',
  ...Object.fromEntries(READING_BOOKS.filter(book=>
    book.minLevel>0&&book.id!==READING_ADVANCED_CONTENT_ID)
    .map(book=>[book.id,'Книга «'+book.label+'»'])),
  'cook.pasta':'Рецепт «Паста с овощами»',
  'cook.gratin':'Рецепт «Сливочная запеканка»',
  'garden.hydration-1':'Полив сохраняет влагу на 3 часа дольше',
  'garden.yield-1':'На одну траву больше с урожая',
  'garden.hydration-2':'Полив сохраняет влагу на 6 часов дольше',
  'garden.yield-2':'На две травы больше с урожая'
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
        id:unlock.id,label:UNLOCK_LABELS[unlock.id]||(PAINT_SUBJECTS[unlock.id]?.label
          ?'Сюжет «'+PAINT_SUBJECTS[unlock.id].label+'»':unlock.id),
        minLevel:unlock.minLevel,unlocked:level>=unlock.minLevel
      })))
    });
  }).filter(Boolean);
}
