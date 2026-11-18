/** W2-A.4: branch-specific seventh/eighth jobs and evidence from real work.
 * Additive schema-1 contract field; no DOM, salary mint or professional XP.
 */
import {currentSkillLevel} from './skills-engine.js';
import {HOBBY_SKILLS} from './hobby-reading.js';
const realTime=n=>Number.isSafeInteger(n)&&n>=0&&n<=5256000000;
const receiptPattern=/^(e[1-9]\d{0,8})@([0-9]+)@([0-9]+)#work$/;
const SKILL_NAMES={cooking:'Кулинария',painting:'Живопись',literature:'Литературная эрудиция'};
const CASE_NAMES={
  'city-missing':'Посылка без адреса','city-route':'Карта нового квартала',
  'kitchen-special':'Идея для сезонного меню','kitchen-allergy':'Вопрос об ингредиентах',
  legacy:'Профессиональное дело', 'editorial-letter':'Письмо читателя',
  'editorial-deadline':'Пустая полоса', 'art-frame':'Трещина в раме',
  'art-young':'Неизвестный художник','business-pitch':'Срочная презентация',
  'business-idea':'Предложение улучшения','civic-record':'Потерянная справка',
  'civic-neighbors':'Встреча соседей'
};
// careerId -> [rank6 hourly, rank7 hourly, trackId, rank6 title, rank7 title,
//                rank6 shifts, performance, skill, skill level, required case,
//                rank7 shifts, performance, skill level, two required cases]
const DATA=[
  ['city-services',139,158,[
    ['logistics','Руководитель маршрутных операций','Главный планировщик городской логистики',7,89,null,0,'city-route',9,92,0,['city-missing','city-route']],
    ['infrastructure','Руководитель развития городской сети','Главный проектировщик городских маршрутов',8,88,null,0,'city-missing',10,92,0,['city-route','city-missing']]]],
  ['kitchen-studio',151,172,[
    ['signature','Мастер гастрономических концепций','Автор гастрономического направления',7,89,'cooking',7,'kitchen-allergy',9,92,8,['kitchen-special','kitchen-allergy']],
    ['operations','Руководитель качества мастерских','Директор сети кулинарных мастерских',8,91,'cooking',6,'kitchen-special',10,93,7,['kitchen-allergy','kitchen-special']]]],
  ['editorial',146,166,[
    ['investigations','Редактор расследовательских проектов','Руководитель бюро расследований',7,89,'literature',7,'editorial-letter',9,92,8,['legacy','editorial-letter']],
    ['leadership','Продюсер редакционных выпусков','Директор редакционной программы',8,91,'literature',6,'legacy',10,93,7,['editorial-deadline','legacy']]]],
  ['art-studio',144,163,[
    ['artist','Куратор авторских серий','Художественный руководитель студии',7,89,'painting',7,'art-frame',9,92,8,['legacy','art-frame']],
    ['projects','Руководитель выставочных программ','Директор художественных программ',8,91,'painting',6,'art-frame',10,93,7,['art-young','art-frame']]]],
  ['business-center',153,174,[
    ['strategy','Ведущий исследователь стратегий','Главный архитектор деловых решений',7,91,null,0,'business-pitch',9,93,0,['business-idea','business-pitch']],
    ['management','Руководитель организационных преобразований','Директор сети деловых программ',8,90,null,0,'business-idea',10,92,0,['business-pitch','business-idea']]]],
  ['civic-service',150,170,[
    ['people','Наставник службы обращений','Руководитель центра гражданской поддержки',7,90,null,0,'civic-neighbors',9,92,0,['civic-record','civic-neighbors']],
    ['initiatives','Руководитель общественных проектов','Директор городских общественных программ',8,89,null,0,'civic-record',10,92,0,['civic-neighbors','civic-record']]]]
];
export const SENIOR_CAREER_PATHS=Object.freeze(Object.fromEntries(DATA.map(([careerId,rate6,rate7,rows])=>[
  careerId,Object.freeze(Object.fromEntries(rows.map(([id,title6,title7,s6,p6,skill,k6,scene6,s7,p7,k7,scenes7])=>[
    id,Object.freeze({careerId,id,ranks:Object.freeze([
      Object.freeze({index:6,title:title6,hourlyCredits:rate6,
        requirements:Object.freeze({shifts:s6,performance:p6,skill,level:k6,scenes:Object.freeze([scene6])})}),
      Object.freeze({index:7,title:title7,hourlyCredits:rate7,
        requirements:Object.freeze({shifts:s7,performance:p7,skill,level:k7,scenes:Object.freeze(scenes7)})})
    ])})
  ])))])));
export const seniorTrack=(careerId,id)=>SENIOR_CAREER_PATHS[careerId]?.[id]||null;
export const seniorRank=(careerId,id,index)=>
  seniorTrack(careerId,id)?.ranks.find(rank=>rank.index===index)||null;
export const seniorNextRank=contract=>
  seniorRank(contract?.careerId,contract?.specialization?.id,contract?.level+1);
const activeRule=contract=>seniorNextRank(contract)?.requirements||null;
export function seniorMissingScenes(contract){
  const rule=activeRule(contract);
  if(!rule)return [];
  const proof=contract.seniorProofs;
  const recorded=proof?.schema===1&&proof.trackId===contract.specialization?.id&&
    proof.rank===contract.level&&Array.isArray(proof.positiveReceipts)?
    proof.positiveReceipts.map(x=>x.scenarioId):[];
  return rule.scenes.filter(id=>!recorded.includes(id));
}
export function seniorPromotionReadiness(root,residentId){
  const contract=root?.careerSystem?.byResident?.[residentId];
  const rank=seniorNextRank(contract);
  if(!rank||!['alex','mira'].includes(residentId))return null;
  const rule=rank.requirements,actor=residentId==='mira'?root.otherSim:root;
  const skill=rule.skill?currentSkillLevel(actor?.skills,HOBBY_SKILLS,rule.skill):null;
  const needs=[
    {label:'Результативность',current:contract.performance,target:rule.performance,met:contract.performance>=rule.performance},
    {label:'Смен на должности',current:contract.rankShifts,target:rule.shifts,met:contract.rankShifts>=rule.shifts}
  ];
  if(rule.skill)needs.push({label:SKILL_NAMES[rule.skill],current:skill,
    target:rule.level,met:skill>=rule.level});
  const missing=seniorMissingScenes(contract);
  for(const id of rule.scenes)needs.push({
    label:'Успешная ситуация «'+CASE_NAMES[id]+'»',
    current:missing.includes(id)?0:1,target:1,met:!missing.includes(id)
  });
  return {rank,rule,requirements:needs,ready:needs.every(x=>x.met)};
}
export function resetSeniorProof(contract,now){
  if(!contract||contract.level<5||contract.level>7||!seniorTrack(
    contract.careerId,contract.specialization?.id))return null;
  return {schema:1,trackId:contract.specialization.id,rank:contract.level,
    startedAt:realTime(now)?Math.max(now,contract.hiredAt):contract.hiredAt,
    positiveReceipts:[]};
}
/** Defensively restore only matching contract/rank/career/scenes and on-rank receipts.
 * A missing/malformed optional proof NEVER invalidates an already earned contract.
 */
export function restoreSeniorProof(raw,contract){
  const path=seniorTrack(contract?.careerId,contract?.specialization?.id);
  if(!path||!raw||raw.schema!==1||raw.trackId!==path.id||
    raw.rank!==contract.level||!realTime(raw.startedAt)||
    raw.startedAt<contract.hiredAt||!Array.isArray(raw.positiveReceipts))return null;
  const rule=activeRule(contract);
  const clean=resetSeniorProof(contract,raw.startedAt);
  if(!clean)return null;
  const seen=new Set();
  for(const r of raw.positiveReceipts.slice(0,8)){
    const match=typeof r?.incidentId==='string'&&r.incidentId.length<=102?
      r.incidentId.match(receiptPattern):null;
    if(!rule||!match||match[1]!==contract.employmentId||
      Number(match[3])<raw.startedAt||!rule.scenes.includes(r.scenarioId)||
      seen.has(r.scenarioId)||r.careerId!==contract.careerId||
      !realTime(r.resolvedAt)||r.resolvedAt<Number(match[3])||
      r.resolvedAt<raw.startedAt)continue;
    seen.add(r.scenarioId);
    clean.positiveReceipts.push({incidentId:r.incidentId,careerId:r.careerId,
      scenarioId:r.scenarioId,resolvedAt:r.resolvedAt});
  }
  return clean;
}
/** Canonical incident handler invokes only after its one-time ledger and journal.
 * Proofs survive eviction of the 12 most recent work-story entries.
 */
export function recordSeniorIncident(root,residentId,incident){
  const contract=root?.careerSystem?.byResident?.[residentId];
  const rule=activeRule(contract);
  if(!rule||!incident||incident.careerId!==contract.careerId||
    !rule.scenes.includes(incident.scenarioId)||incident.performanceDelta<=0||
    !realTime(incident.resolvedAt))return false;
  const id=incident.id,match=typeof id==='string'?id.match(receiptPattern):null;
  if(!match||match[1]!==contract.employmentId||
    !root.careerSystem.incidentIds?.includes(id)||!root.careerSystem.incidentHistory?.[residentId]?.some(h=>
      h.id===id&&h.careerId===contract.careerId&&h.scenarioId===incident.scenarioId&&
      h.rank===contract.level&&h.performanceDelta>0&&h.at===incident.resolvedAt))return false;
  let proof=contract.seniorProofs;
  if(!proof||proof.schema!==1||proof.rank!==contract.level||
    proof.trackId!==contract.specialization?.id){
    proof=resetSeniorProof(contract,Number(match[3]));
    contract.seniorProofs=proof;
  }
  if(!proof||Number(match[3])<proof.startedAt||
    incident.resolvedAt<proof.startedAt||
    proof.positiveReceipts.some(r=>r.scenarioId===incident.scenarioId))return false;
  proof.positiveReceipts.push({incidentId:id,careerId:contract.careerId,
    scenarioId:incident.scenarioId,resolvedAt:incident.resolvedAt});
  return true;
}
