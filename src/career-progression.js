/** W2-A.1: append-only promotion gates built on original real work and skills.
 * Pure domain rules only: no real-world clock, DOM, currency mint or second XP.
 */
import {careerDefinition} from './career-catalog.js';
import {CAREER_RESIDENT_IDS} from './career-state.js';
import {currentSkillLevel} from './skills-engine.js';
import {HOBBY_SKILLS} from './hobby-reading.js';
import {refreshMind} from './psychology.js';
import {WORK_MODES,cleanWorkMode} from './career-work-needs.js';
import {careerRankForContract,specializationReadiness} from './career-specializations.js';
import {seniorPromotionReadiness,resetSeniorProof} from './career-seniority.js';

const clip=(v,lo=0,hi=100)=>Math.max(lo,Math.min(hi,v));
const count=n=>Number.isSafeInteger(n)&&n>=0&&n<=1000000?n:0;
const PLAN=Object.freeze({
  'city-services':[{shifts:3,performance:68},{shifts:6,performance:80},
    {shifts:7,performance:83},{shifts:9,performance:87}],
  'kitchen-studio':[{shifts:3,performance:68,skill:'cooking',level:1},
    {shifts:5,performance:80,skill:'cooking',level:3},
    {shifts:7,performance:83,skill:'cooking',level:4},
    {shifts:9,performance:88,skill:'cooking',level:5}],
  'art-studio':[{shifts:3,performance:68,skill:'painting',level:1},
    {shifts:5,performance:80,skill:'painting',level:3},
    {shifts:7,performance:83,skill:'painting',level:4},
    {shifts:9,performance:88,skill:'painting',level:5}],
  editorial:[{shifts:3,performance:68,skill:'literature',level:1},
    {shifts:5,performance:80,skill:'literature',level:3},
    {shifts:7,performance:83,skill:'literature',level:4},
    {shifts:9,performance:88,skill:'literature',level:5}],
  'business-center':[{shifts:4,performance:68},{shifts:6,performance:80},
    {shifts:8,performance:83},{shifts:10,performance:88}],
  'civic-service':[{shifts:4,performance:68},{shifts:6,performance:80},
    {shifts:8,performance:83},{shifts:10,performance:88}]
});
const SKILL_LABEL={cooking:'Кулинария',painting:'Живопись',literature:'Литературная эрудиция'};
const actorFor=(root,id)=>id==='mira'?root?.otherSim:root;

export function careerReadiness(actor){
  const energy=clip(Number.isFinite(actor?.needs?.energy)?actor.needs.energy:50);
  const hygiene=clip(Number.isFinite(actor?.needs?.hygiene)?actor.needs.hygiene:50);
  const mood=clip(Number.isFinite(actor?.mind?.mood?.value)?actor.mind.mood.value:60);
  return Math.round(energy*.55+hygiene*.2+mood*.25);
}
export function promotionReadiness(root,residentId){
  const contract=root?.careerSystem?.byResident?.[residentId];
  const career=careerDefinition(contract?.careerId);
  if(!CAREER_RESIDENT_IDS.includes(residentId)||!contract||!career)return null;
  const branch=contract.level===4?specializationReadiness(root,residentId):null;
  if(contract.level===4&&!branch?.selected)return {
    maxLevel:false,ready:false,needsSpecialization:true,rank:'Выбери специализацию',
    requirements:[]};
  const senior=contract.level>=5?seniorPromotionReadiness(root,residentId):null;
  const rule=contract.level===4?branch.selected.requirements:
    senior?.rule||PLAN[career.id]?.[contract.level];
  if(!rule)return {maxLevel:true,ready:false,
    rank:careerRankForContract(contract)?.title||'',requirements:[]};
  const actor=actorFor(root,residentId);
  const currentSkill=rule.skill?currentSkillLevel(actor?.skills,HOBBY_SKILLS,rule.skill):null;
  const performance=clip(contract.performance),shifts=count(contract.rankShifts);
  const requirements=[
    {label:'Результативность',current:performance,target:rule.performance,
      met:performance>=rule.performance},
    {label:'Смен на должности',current:shifts,target:rule.shifts,met:shifts>=rule.shifts}
  ];
  if(rule.skill)requirements.push({label:SKILL_LABEL[rule.skill],current:currentSkill,
    target:rule.level,met:currentSkill>=rule.level});
  if(branch?.selected)requirements.push(...branch.requirements.filter(item=>
    item.label==='Профильная рабочая ситуация'));
  if(senior)requirements.push(...senior.requirements.filter(item=>
    item.label.startsWith('Успешная ситуация')));
  return {maxLevel:false,ready:requirements.every(item=>item.met),
    rank:senior?.rank.title||branch?.selected?.rank.title||career.ranks[contract.level+1]?.title||'',requirements};
}
export function promoteCareer(root,residentId){
  const contract=root?.careerSystem?.byResident?.[residentId];
  if(!contract)return {ok:false,reason:'Нет трудового договора'};
  if(contract.currentShift)return {ok:false,reason:'Сначала заверши текущую смену и возвращение домой'};
  const goal=promotionReadiness(root,residentId);
  if(!goal||goal.maxLevel)return {ok:false,reason:'Достигнута верхняя должность'};
  if(!goal.ready)return {ok:false,reason:'Не выполнены условия повышения'};
  contract.level++;
  contract.rankShifts=0;
  if(contract.level>=5)contract.seniorProofs=resetSeniorProof(contract,root.minutes);
  // Progress is earned separately at the next rank, never wiped to zero.
  contract.performance=Math.max(55,clip(contract.performance-18));
  const actor=actorFor(root,residentId);
  if(actor)actor.event='Повышение: '+goal.rank;
  return {ok:true,rank:goal.rank,rate:careerRankForContract(contract).hourlyCredits};
}
/** Called ONCE from idempotent salary settlement, never from presentation. */
export function recordCompletedCareerShift(contract,actor,shift,workedMinutes,lateMinutes){
  const duration=Math.max(1,shift.end-shift.start);
  const fraction=clip(workedMinutes/duration,0,1);
  const readiness=clip(Number.isFinite(shift.readiness)?shift.readiness:65);
  const plan=PLAN[contract.careerId]?.[contract.level];
  const skill=plan?.skill?currentSkillLevel(actor?.skills,HOBBY_SKILLS,plan.skill):0;
  const modeBonus=shift.workNeeds?shift.workNeeds.modeScore/Math.max(1,duration):0;
  const delta=Math.round(3+6*fraction+(readiness-60)/20+modeBonus-
    Math.min(8,lateMinutes/45)-(1-fraction)*8+Math.min(4,skill)*.5);
  const change=clip(delta,-10,12);
  contract.performance=clip(clip(contract.performance)+change);
  contract.workedShifts=Math.min(1000000,count(contract.workedShifts)+1);
  contract.rankShifts=Math.min(1000000,count(contract.rankShifts)+1);
  if(lateMinutes>0)contract.lateShifts=Math.min(1000000,count(contract.lateShifts)+1);
  // In the rabbit hole, residents do not run home activity simulations. Fatigue
  // is debited exactly once at settlement and feeds the EXISTING mood engine.
  const energyLoss=Math.round((9+13*fraction)*fraction);
  const hygieneLoss=Math.round(7*fraction);
  if(actor?.needs){
    // New W3-B shifts already consumed energy/hygiene/fun minute-by-minute.
    // Keep the legacy one-time debit only for direct/older settlement paths.
    if(!shift.workNeeds){
      actor.needs.energy=clip(actor.needs.energy-energyLoss);
      actor.needs.hygiene=clip(actor.needs.hygiene-hygieneLoss);
      actor.needs.fun=clip(actor.needs.fun-Math.round(3*fraction));
    }
    refreshMind(actor);
  }
  const grade=change>=8&&readiness>=60?'удачный день':
    change<=2||readiness<40?'сложный день':'обычная смена';
  return {grade,delta:change,energyLoss,readiness};
}
/** Called only for a real missed/explicitly skipped shift, not on reload. */
export function recordMissedCareerShift(contract){
  contract.performance=clip(clip(contract.performance)-7);
  contract.missedShifts=Math.min(1000000,count(contract.missedShifts)+1);
  return {grade:'пропуск',delta:-7};
}
