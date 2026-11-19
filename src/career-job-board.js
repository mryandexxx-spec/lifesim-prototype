import {recordWorkFeeling,jobSatisfaction} from './career-worklife.js';
/** W1-B.2a: pure recruitment/read-model adapter. No DOM, PlayCanvas or salary mutations. */
import {CAREER_CATALOG,careerDefinition} from './career-catalog.js';
import {hireCareer,separateCareer,CAREER_RESIDENT_IDS} from './career-state.js';
import {careerRankForContract} from './career-specializations.js';
import {DISCIPLINE_REHIRE_MINUTES} from './career-discipline.js';
import {nextCareerShift,plannedCareerShift} from './career-scheduler.js';
import {civilToSerial} from './calendar-core.js';
import {canResignNow} from './career-work.js';
import {careerTimeOffForShift} from './career-timeoff.js';

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
/** A discharge locks only the same profession; resignation is never locked. */
export function careerRehireRetry(root,residentId,careerId){
  const now=Number.isFinite(root?.minutes)?root.minutes:0;
  const previous=[...(root?.careerSystem?.endedContracts?.[residentId]||[])].reverse()
    .find(entry=>entry.careerId===careerId);
  const retryAt=previous?.reason==='dismissed'?
    previous.at+DISCIPLINE_REHIRE_MINUTES:0;
  return {retryAt,remaining:Math.max(0,Math.ceil(retryAt-now)),blocked:retryAt>now};
}
export function careerVacancies(root,residentId){
  if(!legalRoot(root,residentId))return [];
  if(root.careerSystem.byResident?.[residentId])return [];
  return CAREER_CATALOG.map(career=>{
    // Preview the real scheduler using a TEMPORARY contract; no state is written.
    const preview=hireCareer(root.careerSystem,residentId,career.id,root.minutes);
    const shift=nextCareerShift(root.calendar,preview.byResident[residentId],root.minutes);
    const rank=careerRankForContract(preview.byResident[residentId])||career.ranks[0];
    const retry=careerRehireRetry(root,residentId,career.id);
    return Object.freeze({
      id:career.id,title:career.title,description:career.description,
      disciplineRetryAt:retry.retryAt,disciplineBlocked:retry.blocked,
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
  const retry=careerRehireRetry(root,residentId,careerId);
  if(retry.blocked)return {ok:false,
    reason:'После увольнения повторный отклик доступен через '+retry.remaining+' игровых мин.'};
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
  if(!canResignNow(root,residentId))
    return {ok:false,reason:'Дождись возвращения со смены перед увольнением'};
  const satisfaction=jobSatisfaction(root.careerSystem.byResident[residentId],root.minutes);
  const result=separateCareer(root.careerSystem,residentId,'resigned',root.minutes);
  if(!result.ok)return result;
  recordWorkFeeling(root,residentId,result.archived.reason==='dismissed'
    ?'worklife.dismissal':satisfaction<40?'worklife.resignationRelief':'worklife.resignation');
  return {ok:true,careerSystem:result.careerSystem};
}

/** Read-only work dates for the EXISTING family calendar. Employment contract is
 * canonical; we never create a duplicate personal event or reminders receipt.
 * Only start-date entries are shown; overnight shifts carry explicit end HH:MM.
 */
export function calendarCareerShifts(root,fromIso,toIso){
  if(!root?.calendar?.startCivilDate||root?.careerSystem?.schema!==1)return [];
  let first,last;
  try{
    const anchor=civilToSerial(root.calendar.startCivilDate);
    first=Math.max(0,civilToSerial(fromIso)-anchor);
    last=civilToSerial(toIso)-anchor;
  }catch{return [];}
  if(last<first||last-first>45)return [];
  const out=[];
  for(const residentId of CAREER_RESIDENT_IDS){
    const contract=root.careerSystem.byResident?.[residentId];
    if(!contract)continue;
    const career=careerDefinition(contract.careerId);
    if(!career)continue;
    for(let d=first;d<=last;d++){
      const shift=plannedCareerShift(root.calendar,contract,d);
      if(!shift)continue;
      out.push(Object.freeze({
        id:shift.id,iso:shift.iso,careerId:career.id,residentId,
        title:career.title,rankTitle:career.ranks[contract.level].title,
        start:shift.start%1440,end:shift.end%1440,
        work:true,shiftId:shift.id,
        timeOff:careerTimeOffForShift(contract,shift.id)?.type??null
      }));
    }
  }
  return out.sort((a,b)=>a.iso.localeCompare(b.iso)||a.start-b.start||
    a.residentId.localeCompare(b.residentId));
}
