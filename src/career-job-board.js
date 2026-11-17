/** W1-B.2a: pure recruitment/read-model adapter. No DOM, PlayCanvas or salary mutations. */
import {CAREER_CATALOG,careerDefinition} from './career-catalog.js';
import {hireCareer,resignCareer,CAREER_RESIDENT_IDS} from './career-state.js';
import {nextCareerShift} from './career-scheduler.js';

const DAY_NAMES=Object.freeze(['Пн','Вт','Ср','Чт','Пт','Сб','Вс']);
export function clockLabel(minute){
  if(!Number.isFinite(minute)||minute<0)return '—';
  const h=Math.floor(minute/60)%24,m=Math.floor(minute)%60;
  return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
}
export function describeCareerShift(shift){
  if(!shift)return 'Смена пока не назначена';
  return shift.iso+' · '+clockLabel(shift.start)+'–'+clockLabel(shift.end);
}
function legalRoot(root,id){
  return root&&CAREER_RESIDENT_IDS.includes(id)&&
    Number.isFinite(root.minutes)&&root.minutes>=0&&root.calendar?.startCivilDate&&
    root.careerSystem?.schema===1;
}
export function careerVacancies(root,residentId){
  if(!legalRoot(root,residentId))return [];
  if(root.careerSystem.byResident?.[residentId])return [];
  return CAREER_CATALOG.map(career=>{
    // Preview the real scheduler using a TEMPORARY contract; no state is written.
    const preview=hireCareer(root.careerSystem,residentId,career.id,root.minutes);
    const shift=nextCareerShift(root.calendar,preview.byResident[residentId],root.minutes);
    const rank=career.ranks[0];
    return Object.freeze({
      id:career.id,title:career.title,description:career.description,
      rank:rank.title,hourlyCredits:rank.hourlyCredits,
      duration:career.schedule.duration,
      workdays:career.schedule.weekdays.map(d=>DAY_NAMES[d]).join(' · '),
      hours:clockLabel(career.schedule.startMinute)+'–'+
        clockLabel(career.schedule.startMinute+career.schedule.duration),
      nextShift:shift,firstShiftLabel:describeCareerShift(shift),
      shiftCredits:Math.round(rank.hourlyCredits*career.schedule.duration/60)
    });
  });
}
/** Returns a new careerSystem ONLY on explicit consent. Never modifies root. */
export function acceptCareerOffer(root,residentId,careerId){
  if(!legalRoot(root,residentId))return {ok:false,reason:'Недоступный житель или календарь'};
  if(root.careerSystem.byResident?.[residentId])
    return {ok:false,reason:'У персонажа уже есть работа'};
  if(!careerDefinition(careerId))return {ok:false,reason:'Вакансия больше недоступна'};
  try{
    const careerSystem=hireCareer(root.careerSystem,residentId,careerId,root.minutes);
    const contract=careerSystem.byResident[residentId];
    return {ok:true,careerSystem,contract,
      shift:nextCareerShift(root.calendar,contract,root.minutes)};
  }catch{
    return {ok:false,reason:'Не удалось оформить договор'};
  }
}
export function leaveCareer(root,residentId){
  if(!legalRoot(root,residentId)||!root.careerSystem.byResident?.[residentId])
    return {ok:false,reason:'Нет действующего договора'};
  return {ok:true,careerSystem:resignCareer(root.careerSystem,residentId)};
}
