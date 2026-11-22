/** CAREER-SHIFTS-R1: approved rank-specific schedules (A/A/A/A).
 * One canonical Gregorian/game-minute clock. No money, PlayCanvas or DOM.
 * Rank=contract.level 0..7; tracks share hours, not names/rates.
 */
import {careerDefinition,validCareerSchedule} from './career-catalog.js';
import {civilToSerial,weekdayFromSerial,MINUTES_PER_GAME_DAY} from './calendar-core.js';

const DAY=MINUTES_PER_GAME_DAY;
const WEEKDAYS=Object.freeze({
  standard:Object.freeze([0,1,2,3,4]),
  kitchen:Object.freeze([1,2,3,4,5]),
  civic:Object.freeze([2,3,4,5,6]),
  leadership:Object.freeze([0,1,3,4]),
  civicLeadership:Object.freeze([2,3,4,5])
});
const freezeSchedule=([startMinute,duration,days])=>Object.freeze({
  weekdays:WEEKDAYS[days],startMinute,duration,holidayPolicy:'observe'
});
// A fixed schedule per rank; the table is data rather than conditional UI logic.
const PROFILES=Object.freeze({
  'city-services':[[360,540,'standard'],[420,480,'standard'],
    [480,480,'standard'],[480,480,'standard'],[540,420,'standard'],
    [540,420,'standard'],[540,480,'leadership'],[540,480,'leadership']],
  'kitchen-studio':[[1020,540,'kitchen'],[840,480,'kitchen'],
    [720,480,'kitchen'],[720,480,'kitchen'],[600,420,'kitchen'],
    [600,420,'kitchen'],[600,420,'kitchen'],[600,420,'kitchen']],
  'art-studio':[[720,540,'standard'],[660,480,'standard'],
    [600,480,'standard'],[600,480,'standard'],[600,420,'standard'],
    [600,420,'standard'],[600,480,'leadership'],[600,480,'leadership']],
  editorial:[[960,540,'standard'],[720,480,'standard'],
    [600,480,'standard'],[600,480,'standard'],[600,420,'standard'],
    [600,420,'standard'],[540,480,'leadership'],[540,480,'leadership']],
  'business-center':[[480,540,'standard'],[540,480,'standard'],
    [540,480,'standard'],[540,480,'standard'],[600,420,'standard'],
    [600,420,'standard'],[600,480,'leadership'],[600,480,'leadership']],
  'civic-service':[[1200,540,'civic'],[1080,480,'civic'],
    [840,480,'civic'],[840,480,'civic'],[600,420,'civic'],
    [600,420,'civic'],[600,480,'civicLeadership'],[600,480,'civicLeadership']]
});
export const CAREER_RANK_SCHEDULES=Object.freeze(Object.fromEntries(
  Object.entries(PROFILES).map(([id,rows])=>{
    const schedules=Object.freeze(rows.map(row=>{
      const schedule=freezeSchedule(row);
      if(!validCareerSchedule(schedule))throw new Error('Invalid approved shift '+id);
      return schedule;
    }));
    return [id,schedules];
  })
));
export const SHIFT_SCHEDULE_SCHEMA=1;
const validDay=day=>Number.isSafeInteger(day)&&day>=0&&day<=3650000;
export const approvedRankSchedule=(careerId,level)=>
  Number.isInteger(level)?CAREER_RANK_SCHEDULES[careerId]?.[level]??null:null;

/** Legacy contract dates before the epoch keep exactly the former fixed job schedule.
 * Old paid/received employment@day@start IDs cannot change retroactively.
 */
export function careerScheduleAtDay(contract,dayIndex){
  const career=careerDefinition(contract?.careerId);
  if(!career||!validDay(dayIndex))return null;
  const effective=contract?.shiftSchedule?.schema===SHIFT_SCHEDULE_SCHEMA&&
    validDay(contract.shiftSchedule.effectiveDayIndex)?
      contract.shiftSchedule.effectiveDayIndex:null;
  return effective!==null&&dayIndex>=effective?
    approvedRankSchedule(career.id,contract.level):career.schedule;
}
export function restoreShiftSchedule(raw){
  return raw&&raw.schema===SHIFT_SCHEDULE_SCHEMA&&validDay(raw.effectiveDayIndex)?
    {schema:SHIFT_SCHEDULE_SCHEMA,effectiveDayIndex:raw.effectiveDayIndex}:null;
}
export function newShiftSchedule(atMinute){
  const day=Math.floor(atMinute/DAY);
  if(!validDay(day))throw new RangeError('Invalid shift calendar epoch');
  return {schema:SHIFT_SCHEDULE_SCHEMA,effectiveDayIndex:day};
}
function nextMondayAfter(day,calendar){
  const serial=civilToSerial(calendar.startCivilDate)+day;
  const weekday=weekdayFromSerial(serial);
  return day+7-weekday; // always NEXT Monday, even when today is Monday
}
/** Applied ONCE on legacy load; save the chosen date so a later reload cannot
 * postpone it again. Already booked leave and an active future shift retain
 * their exact IDs, start/end and credits. No payroll or appointment mutation.
 */
export function migrateLegacyCareerSchedules(root){
  if(!root?.calendar?.startCivilDate||!Number.isFinite(root.minutes)||
    root.minutes<0||!root.careerSystem?.byResident)return false;
  const day=Math.floor(root.minutes/DAY);
  if(!validDay(day))return false;
  let changed=false;
  for(const id of ['alex','mira']){
    const contract=root.careerSystem.byResident[id];
    if(!contract||restoreShiftSchedule(contract.shiftSchedule))continue;
    let effective=nextMondayAfter(day,root.calendar);
    const bookings=contract.timeOff?.bookings??[];
    // The last legal unpaid/paid reservation determines the first safe Monday.
    for(const booked of bookings){
      if(booked?.settled||!Number.isSafeInteger(booked?.end)||
        booked.end<=root.minutes)continue;
      while(effective*DAY<=booked.end)effective+=7;
    }
    const active=contract.currentShift;
    if(active&&Number.isFinite(active.end)&&active.end>=root.minutes)
      while(effective*DAY<=active.end)effective+=7;
    if(!validDay(effective))continue;
    contract.shiftSchedule={schema:SHIFT_SCHEDULE_SCHEMA,effectiveDayIndex:effective};
    changed=true;
  }
  return changed;
}
