import {recordBiographyCareer} from './life-biography.js';
/** W2-A.3: genuine branch choice after the original five ranks.
 * Stable catalog and pure career rules: no DOM, PlayCanvas, salary or extra XP.
 */
import {careerDefinition} from './career-catalog.js';
import {currentSkillLevel} from './skills-engine.js';
import {HOBBY_SKILLS} from './hobby-reading.js';
import {seniorRank,seniorTrack,resetSeniorProof} from './career-seniority.js';
import {savedAdditionalActor} from './resident-activity-runtime.js';

const validTime=n=>Number.isSafeInteger(n)&&n>=0&&n<=5256000000;
const validCount=n=>Number.isSafeInteger(n)&&n>=0&&n<=1000000;
const residentActor=(root,id)=>id==='alex'?root:id==='mira'?root?.otherSim:savedAdditionalActor(root,id);
const TRACKS=[
  ['city-services',123,
    ['logistics','Маршрутная логистика','Эксперт маршрутной логистики',5,89,null,0,'city-missing','Сложные доставки и точные маршруты'],
    ['infrastructure','Городская инфраструктура','Архитектор городской инфраструктуры',6,86,null,0,'city-route','Новые маршруты и развитие городской сети']],
  ['kitchen-studio',135,
    ['signature','Авторская кухня','Шеф авторской кухни',5,86,'cooking',6,'kitchen-special','Авторские рецепты и качество блюд'],
    ['operations','Управление мастерскими','Операционный директор мастерских',6,90,'cooking',5,'kitchen-allergy','Организация работы и контроль качества']],
  ['editorial',130,
    ['investigations','Журналистика и расследования','Автор расследований',5,87,'literature',6,'legacy','Проверенные факты, источники и публикации'],
    ['leadership','Редакционное руководство','Руководитель редакционных выпусков',6,90,'literature',5,'editorial-deadline','Выпуск материалов и редакционная команда']],
  ['art-studio',128,
    ['artist','Авторское творчество','Ведущий художник студии',5,87,'painting',6,'legacy','Оригинальные художественные решения'],
    ['projects','Художественные проекты','Продюсер художественных проектов',6,90,'painting',5,'art-young','Выставки, авторы и сотрудничество']],
  ['business-center',137,
    ['strategy','Аналитика и стратегия','Стратегический консультант',5,89,null,0,'business-idea','Исследование и улучшение процессов'],
    ['management','Управление организациями','Директор организационных программ',6,87,null,0,'business-pitch','Организация команд и управленческих решений']],
  ['civic-service',134,
    ['people','Работа с людьми','Эксперт по обращениям граждан',5,88,null,0,'civic-record','Сложные обращения и помощь горожанам'],
    ['initiatives','Городские инициативы','Координатор городских инициатив',6,87,null,0,'civic-neighbors','Общественные проекты и соседские инициативы']]
];
export const CAREER_SPECIALIZATIONS=Object.freeze(Object.fromEntries(TRACKS.map(([careerId,rate,...rows])=>[
  careerId,Object.freeze(rows.map(([id,title,rankTitle,shifts,performance,skill,level,scenarioId,description])=>
    Object.freeze({id,careerId,title,description,scenarioId,
      rank:Object.freeze({index:5,title:rankTitle,hourlyCredits:rate}),
      requirements:Object.freeze({shifts,performance,skill,level})})))
])));
export function specializationDefinition(careerId,id){
  return CAREER_SPECIALIZATIONS[careerId]?.find(track=>track.id===id)||null;
}
export function careerRankForContract(contract){
  const career=careerDefinition(contract?.careerId);
  if(!career||!Number.isInteger(contract?.level))return null;
  if(contract.level>=0&&contract.level<career.ranks.length)return career.ranks[contract.level];
  if(contract.level===5)return specializationDefinition(career.id,contract.specialization?.id)?.rank||null;
  if(contract.level===6||contract.level===7)return seniorRank(career.id,contract.specialization?.id,contract.level);
  return null;
}
/** One optional field inside the existing schema-1 contract. Never invalidate a
 * valid old five-rank contract because the new optional extension is malformed.
 */
export function restoreCareerSpecialization(raw,careerId,employmentId,level,workedShifts){
  if(!raw||raw.schema!==1||!specializationDefinition(careerId,raw.id)||
    !validTime(raw.chosenAt)||!validCount(raw.workedShiftsAtChoice)||
    raw.workedShiftsAtChoice>workedShifts)return null;
  const cleaned={schema:1,id:raw.id,chosenAt:raw.chosenAt,
    workedShiftsAtChoice:raw.workedShiftsAtChoice,
    focusReceiptId:null,focusScenarioId:null,focusAt:null};
  const def=specializationDefinition(careerId,raw.id);
  const expected=/^e[1-9]\d{0,8}@[0-9]+@[0-9]+#work$/;
  if(raw.focusScenarioId===def.scenarioId&&validTime(raw.focusAt)&&
    raw.focusAt>=raw.chosenAt&&typeof raw.focusReceiptId==='string'&&
    raw.focusReceiptId.length<=102&&expected.test(raw.focusReceiptId)&&
    raw.focusReceiptId.startsWith(employmentId+'@')){
    cleaned.focusReceiptId=raw.focusReceiptId;
    cleaned.focusScenarioId=raw.focusScenarioId;
    cleaned.focusAt=raw.focusAt;
  }
  return cleaned;
}
export function specializationReadiness(root,residentId){
  if(!Object.hasOwn(root?.careerSystem?.byResident||{},residentId))return null;
  const contract=root?.careerSystem?.byResident?.[residentId];
  const career=careerDefinition(contract?.careerId);
  if(!career)return null;
  const tracks=CAREER_SPECIALIZATIONS[career.id];
  const selected=specializationDefinition(career.id,contract.specialization?.id);
  const since=selected?Math.max(0,contract.workedShifts-contract.specialization.workedShiftsAtChoice):0;
  const active=!!contract.currentShift;
  const actor=residentActor(root,residentId);
  const progress=selected?(()=>{
    const rule=selected.requirements;
    const skill=rule.skill?currentSkillLevel(actor?.skills,HOBBY_SKILLS,rule.skill):null;
    const needs=[
      {label:'Результативность',current:contract.performance,target:rule.performance,met:contract.performance>=rule.performance},
      {label:'Смен на должности',current:contract.rankShifts,target:rule.shifts,met:contract.rankShifts>=rule.shifts}
    ];
    if(rule.skill)needs.push({label:({cooking:'Кулинария',literature:'Литературная эрудиция',painting:'Живопись'})[rule.skill],
      current:skill,target:rule.level,met:skill>=rule.level});
    needs.push({label:'Профильная рабочая ситуация',current:contract.specialization.focusReceiptId?1:0,
      target:1,met:!!contract.specialization.focusReceiptId});
    return needs;
  })():[];
  return {tracks,selected,unlocked:contract.level>=4,atTop:contract.level>=5,
    active,since,canSwitch:contract.level>=4&&!active&&(!selected||since===0||since>=2),
    requirements:progress,ready:!!selected&&progress.every(x=>x.met)};
}
/** Choice/change of focus never changes employment, wages, seniority or receipts. */
export function chooseCareerSpecialization(root,residentId,trackId){
  const contract=root?.careerSystem?.byResident?.[residentId];
  const target=specializationDefinition(contract?.careerId,trackId);
  if(!Object.hasOwn(root?.careerSystem?.byResident||{},residentId)||!contract||!target)
    return {ok:false,reason:'Недоступная специализация'};
  if(contract.level<4||contract.level>7)
    return {ok:false,reason:'Выбор открывается после пятой карьерной ступени'};
  if(contract.currentShift)
    return {ok:false,reason:'Выбор доступен только между сменами'};
  if(contract.specialization?.id===target.id)
    return {ok:false,reason:'Это уже выбранное направление'};
  const progress=specializationReadiness(root,residentId);
  if(!progress?.canSwitch)
    return {ok:false,reason:'Для смены направления нужны две завершённые смены после предыдущего выбора'};
  if(contract.level>=5){
    const targetRule=contract.level===5?target.requirements:
      seniorTrack(contract.careerId,trackId)?.ranks.find(r=>r.index===contract.level)?.requirements;
    if(targetRule?.skill){
      const level=currentSkillLevel(residentActor(root,residentId)?.skills,HOBBY_SKILLS,targetRule.skill);
      if(level<targetRule.level)return {ok:false,reason:'Для перевода необходим навык '+targetRule.skill+
        ' уровня '+targetRule.level};
    }
  }
  contract.specialization={schema:1,id:target.id,chosenAt:validTime(root.minutes)?root.minutes:0,
    workedShiftsAtChoice:contract.workedShifts,
    focusReceiptId:null,focusScenarioId:null,focusAt:null};
  if(contract.level>=5)contract.seniorProofs=resetSeniorProof(contract,root.minutes);
  const actor=residentActor(root,residentId);
  if(actor)actor.event='Новый профессиональный путь: '+target.title;
  recordBiographyCareer(root,residentId,'specialization');
  return {ok:true,track:target,rank:careerRankForContract(contract)};
}
/** Called only from the canonical once-only incident resolution after its
 * receipt and validated journal are written. Evidence survives journal eviction.
 */
export function recordSpecializationIncident(root,residentId,incident){
  const contract=root?.careerSystem?.byResident?.[residentId];
  const chosen=contract?.specialization;
  const focus=specializationDefinition(contract?.careerId,chosen?.id);
  if(!focus||!incident||chosen.focusReceiptId||incident.performanceDelta<=0||
    incident.careerId!==contract.careerId||incident.scenarioId!==focus.scenarioId||
    !validTime(incident.resolvedAt)||incident.resolvedAt<chosen.chosenAt)return false;
  const id=incident.id;
  if(typeof id!=='string'||!id.startsWith(contract.employmentId+'@')||
    !root.careerSystem.incidentIds?.includes(id)||
    !root.careerSystem.incidentHistory?.[residentId]?.some(h=>
      h.id===id&&h.careerId===contract.careerId&&h.scenarioId===focus.scenarioId&&h.performanceDelta>0))
    return false;
  chosen.focusReceiptId=id;
  chosen.focusScenarioId=focus.scenarioId;
  chosen.focusAt=incident.resolvedAt;
  return true;
}
