/** W2-A.2: compact, headless professional goals; recognition only, never money or XP.
 * Evidence is taken only from existing canonical shift and work-incident receipts.
 */
import {CAREER_CATALOG} from './career-catalog.js';
import {workScenario} from './career-incidents.js';
import {currentSkillLevel} from './skills-engine.js';
import {HOBBY_SKILLS} from './hobby-reading.js';
import {savedAdditionalActor} from './resident-activity-runtime.js';

const VALID_TIME=n=>Number.isSafeInteger(n)&&n>=0&&n<=5256000000;
const MAX_SHIFTS=4;
const residentIds=system=>Object.keys(system?.byResident||{});
const SKILL_BY_CAREER=Object.freeze({
  'kitchen-studio':'cooking',editorial:'literature','art-studio':'painting'
});
const DEFINITIONS=Object.freeze({
  'city-services':[
    ['address','Точный адрес','Помочь горожанам с непростой доставкой.',['legacy','city-missing']],
    ['route','Маршрут без пробуксовки','Найти рабочее решение для нового городского маршрута.',['city-route']]
  ],
  'kitchen-studio':[
    ['safety','Безопасная кухня','Проверить ингредиенты и обеспечить качество блюд.',['legacy','kitchen-allergy']],
    ['season','Сезонная находка','Помочь мастерской создать удачное сезонное блюдо.',['kitchen-special']]
  ],
  editorial:[
    ['facts','Проверенные факты','Сохранить точность материалов перед выпуском.',['legacy','editorial-deadline']],
    ['readers','История читателя','Найти профессиональное решение для письма читателя.',['editorial-letter']]
  ],
  'art-studio':[
    ['exhibition','Выставка в порядке','Справиться с неожиданностями подготовки выставки.',['legacy','art-frame']],
    ['talent','Открыть талант','Поддержать нового автора в художественном проекте.',['art-young']]
  ],
  'business-center':[
    ['numbers','Точные цифры','Разобраться в отчёте или важной презентации.',['legacy','business-pitch']],
    ['process','Дело улучшено','Успешно внедрить полезное улучшение процесса.',['business-idea']]
  ],
  'civic-service':[
    ['request','Обращение решено','Помочь людям с обращением или документами.',['legacy','civic-record']],
    ['neighbors','Соседи услышаны','Помочь горожанам найти решение на встрече.',['civic-neighbors']]
  ]
});
export const PROFESSIONAL_GOALS=Object.freeze(Object.fromEntries(
  CAREER_CATALOG.map(career=>[career.id,Object.freeze(DEFINITIONS[career.id].map(
    ([suffix,title,description,scenes],index)=>Object.freeze({
      id:career.id+'.'+suffix,careerId:career.id,title,description,
      requiredShifts:index===0?2:4,
      skill:SKILL_BY_CAREER[career.id]||null,
      skillLevel:SKILL_BY_CAREER[career.id]?(index===0?2:3):0,
      scenes:Object.freeze(scenes)
    })
  ))])
));
const knownGoal=(careerId,goalId)=>
  PROFESSIONAL_GOALS[careerId]?.find(g=>g.id===goalId)||null;
const blank=()=>({shifts:0,shiftReceipts:[],scenes:{},awarded:{}});
const properId=id=>typeof id==='string'&&
  /^e[1-9]\d{0,8}@[0-9]+@[0-9]+#work$/.test(id)&&id.length<=102;
const actorOf=(root,id)=>id==='alex'?root:id==='mira'?root?.otherSim:savedAdditionalActor(root,id);
function cleanCareer(raw,careerId){
  const item=blank();
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return item;
  if(Number.isSafeInteger(raw.shifts)&&raw.shifts>=0)
    item.shifts=Math.min(MAX_SHIFTS,raw.shifts);
  if(Array.isArray(raw.shiftReceipts))item.shiftReceipts=[...new Set(
    raw.shiftReceipts.filter(receipt=>typeof receipt==='string'&&
      /^e[1-9]\d{0,8}@[0-9]+@[0-9]+$/.test(receipt)&&receipt.length<=96)
  )].slice(-MAX_SHIFTS);
  if(raw.scenes&&typeof raw.scenes==='object'&&!Array.isArray(raw.scenes)){
    for(const scenarioId of ['legacy',...DEFINITIONS[careerId].flatMap(x=>x[3])]){
      const proof=raw.scenes[scenarioId];
      if(workScenario(careerId,scenarioId)&&properId(proof?.receiptId)&&
        VALID_TIME(proof.at)&&!item.scenes[scenarioId])
        item.scenes[scenarioId]={receiptId:proof.receiptId,at:proof.at};
    }
  }
  if(raw.awarded&&typeof raw.awarded==='object'&&!Array.isArray(raw.awarded)){
    for(const goal of PROFESSIONAL_GOALS[careerId]){
      if(VALID_TIME(raw.awarded[goal.id])&&item.shifts>=goal.requiredShifts&&
        goal.scenes.some(s=>item.scenes[s]))
        item.awarded[goal.id]=raw.awarded[goal.id];
    }
  }
  return item;
}
export function newProfessionalGoals(ids=['alex','mira']){
  return {schema:1,byResident:Object.fromEntries(ids.map(id=>[id,{}]))};
}
/** Called AFTER canonical contracts and 12-entry work stories are validated.
 * Missing old-v1 field derives only trustworthy existing shift counts and real
 * positive saved scenes. Evicted / unknown events are never fabricated.
 */
export function restoreProfessionalGoals(raw,system){
  const out=newProfessionalGoals(residentIds(system));
  const legacy=!raw||raw.schema!==1||!raw.byResident||
    typeof raw.byResident!=='object';
  for(const id of residentIds(system)){
    for(const career of CAREER_CATALOG){
      const old=legacy?null:raw.byResident[id]?.[career.id];
      const contract=system.byResident?.[id];
      const stories=system.incidentHistory?.[id]||[];
      const relevant=stories.some(h=>h.careerId===career.id&&h.performanceDelta>0);
      if(!old&&!(legacy&&contract?.careerId===career.id&&contract.workedShifts>0)&&!relevant)continue;
      const item=cleanCareer(old,career.id);
      if(legacy&&contract?.careerId===career.id)
        item.shifts=Math.min(MAX_SHIFTS,Math.max(0,contract.workedShifts||0));
      for(const h of stories){
        if(h.careerId!==career.id||h.performanceDelta<=0||
          !workScenario(career.id,h.scenarioId)||!properId(h.id)||
          !VALID_TIME(h.at))continue;
        if(!item.scenes[h.scenarioId])
          item.scenes[h.scenarioId]={receiptId:h.id,at:h.at};
      }
      out.byResident[id][career.id]=item;
    }
  }
  return out;
}
function ensure(root,id,careerId){
  if(!residentIds(root?.careerSystem).includes(id)||!PROFESSIONAL_GOALS[careerId])return null;
  const system=root?.careerSystem;
  if(!system)return null;
  if(!system.professionalGoals)system.professionalGoals=newProfessionalGoals();
  const map=system.professionalGoals.byResident?.[id];
  if(!map)return null;
  return map[careerId]??(map[careerId]=blank());
}
function status(root,id,goal,item){
  const skill=goal.skill?currentSkillLevel(actorOf(root,id)?.skills,HOBBY_SKILLS,goal.skill):null;
  const sceneMet=goal.scenes.some(scene=>!!item.scenes[scene]);
  const shiftsMet=item.shifts>=goal.requiredShifts;
  const skillMet=!goal.skill||skill>=goal.skillLevel;
  const done=!!item.awarded[goal.id]||(sceneMet&&shiftsMet&&skillMet);
  return {id:goal.id,title:goal.title,description:goal.description,
    careerId:goal.careerId,requiredShifts:goal.requiredShifts,
    shifts:item.shifts,sceneMet,shiftsMet,skill:goal.skill,skillLevel:goal.skillLevel,
    currentSkill:skill,skillMet,done,recognizedAt:item.awarded[goal.id]??null};
}
/** Read-only projection: the UI cannot pay salary or mint a work outcome. */
export function professionalGoalsView(root,id){
  const contract=root?.careerSystem?.byResident?.[id];
  const careerId=contract?.careerId;
  const definitions=PROFESSIONAL_GOALS[careerId];
  if(!residentIds(root?.careerSystem).includes(id)||!definitions)return null;
  const item=root?.careerSystem?.professionalGoals?.byResident?.[id]?.[careerId]||blank();
  const goals=definitions.map(g=>status(root,id,g,item));
  return {careerId,rank:contract.level,goals,
    completed:goals.filter(g=>g.done),
    current:goals.find(g=>!g.done)||null,
    earned:goals.filter(g=>g.done).length};
}
function recognize(root,id,careerId,item){
  const done=[];
  for(const goal of PROFESSIONAL_GOALS[careerId]){
    const x=status(root,id,goal,item);
    if(x.done&&!Object.hasOwn(item.awarded,goal.id)){
      item.awarded[goal.id]=VALID_TIME(root.minutes)?root.minutes:0;
      done.push(goal.title);
    }
  }
  return done;
}
/** Must be called only after a NEW canonical salary settlement. */
export function recordProfessionalShift(root,id,shift){
  if(!shift||!root?.careerSystem?.settlementIds?.includes(shift.id))return [];
  const item=ensure(root,id,shift.careerId);
  if(!item)return [];
  if(item.shiftReceipts.includes(shift.id))return [];
  item.shiftReceipts.push(shift.id);
  if(item.shiftReceipts.length>MAX_SHIFTS)item.shiftReceipts.shift();
  item.shifts=Math.min(MAX_SHIFTS,item.shifts+1);
  return recognize(root,id,shift.careerId,item);
}
/** Must be called only after a NEW canonical incident decision and journal entry. */
export function recordProfessionalIncident(root,id,incident){
  const journal=root?.careerSystem?.incidentHistory?.[id]||[];
  if(!incident||incident.performanceDelta<=0||
    !root?.careerSystem?.incidentIds?.includes(incident.id)||
    !journal.some(h=>h.id===incident.id&&h.careerId===incident.careerId&&
      h.scenarioId===incident.scenarioId&&h.performanceDelta>0))return [];
  const item=ensure(root,id,incident.careerId);
  if(!item||!workScenario(incident.careerId,incident.scenarioId))return [];
  if(!item.scenes[incident.scenarioId])
    item.scenes[incident.scenarioId]={receiptId:incident.id,
      at:VALID_TIME(incident.resolvedAt)?incident.resolvedAt:root.minutes};
  return recognize(root,id,incident.careerId,item);
}
