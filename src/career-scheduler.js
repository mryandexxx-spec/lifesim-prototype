/** W1-B.1: deterministic Gregorian shift planning, no actions, payouts or side effects. */
import {civilToSerial,serialToCivil,toISODate,weekdayFromSerial,MINUTES_PER_GAME_DAY} from './calendar-core.js';
import {holidaysOnDate} from './calendar-holidays.js';
import {careerDefinition,validCareerSchedule} from './career-catalog.js';

const DAY=MINUTES_PER_GAME_DAY;
function contractSchedule(contract){
  if(!contract||typeof contract!=='object'||!/^e[1-9]\d{0,8}$/.test(contract.employmentId))return null;
  const career=careerDefinition(contract.careerId);
  if(!career||!Number.isInteger(contract.level)||contract.level<0||contract.level>=career.ranks.length||
    !Number.isFinite(contract.hiredAt)||contract.hiredAt<0)return null;
  return {career,schedule:career.schedule};
}
/** Stable IDs are derived from contract + game day, never Date.now or frame count. */
export function plannedCareerShift(calendar,contract,dayIndex){
  if(!Number.isSafeInteger(dayIndex)||dayIndex<0||dayIndex>3650000)return null;
  const candidate=contractSchedule(contract);
  if(!candidate||!calendar?.startCivilDate)return null;
  const {career,schedule}=candidate;
  if(!validCareerSchedule(schedule))return null;
  let iso,weekday;
  try{
    const serial=civilToSerial(calendar.startCivilDate)+dayIndex;
    iso=toISODate(serialToCivil(serial));
    weekday=weekdayFromSerial(serial);
  }catch{return null;}
  if(!schedule.weekdays.includes(weekday))return null;
  if(schedule.holidayPolicy==='observe'&&holidaysOnDate(calendar,iso).some(h=>h.dayOffWork))return null;
  const start=dayIndex*DAY+schedule.startMinute;
  if(start<contract.hiredAt||!Number.isSafeInteger(start))return null;
  const end=start+schedule.duration;
  if(!Number.isSafeInteger(end))return null;
  return Object.freeze({
    id:contract.employmentId+'@'+dayIndex+'@'+start,residentId:contract.residentId,
    employmentId:contract.employmentId,careerId:career.id,level:contract.level,
    iso,weekday,dayIndex,start,end,duration:schedule.duration,
    hourlyCredits:career.ranks[contract.level].hourlyCredits
  });
}
/** The next not-yet-finished scheduled shift, including one spanning midnight. */
export function nextCareerShift(calendar,contract,afterMinute){
  if(!Number.isFinite(afterMinute)||afterMinute<0)return null;
  const first=Math.max(0,Math.floor(afterMinute/DAY)-1);
  for(let d=first;d<=first+15;d++){
    const shift=plannedCareerShift(calendar,contract,d);
    if(shift&&shift.end>afterMinute)return shift;
  }
  return null;
}
/** Half-open window [from,to): catches exact start/end and jump-over boundaries. */
export function careerShiftsInWindow(calendar,contract,fromMinute,toMinute){
  if(!Number.isFinite(fromMinute)||!Number.isFinite(toMinute)||
    fromMinute<0||toMinute<fromMinute||toMinute-fromMinute>31*DAY)
    throw new RangeError('Invalid career shift window');
  if(fromMinute===toMinute)return [];
  const first=Math.max(0,Math.floor(fromMinute/DAY)-1),last=Math.floor((toMinute-1e-9)/DAY);
  const result=[];
  for(let d=first;d<=last;d++){
    const shift=plannedCareerShift(calendar,contract,d);
    if(shift&&shift.start<toMinute&&shift.end>fromMinute)result.push(shift);
  }
  return result;
}
