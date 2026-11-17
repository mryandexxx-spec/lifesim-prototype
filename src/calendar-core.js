/** W1-A.1: deterministic proleptic Gregorian calendar, independent of DOM, Date and PlayCanvas.
 * Civil dates are game dates; device time may suggest an anchor ONCE, never tick it.
 */
export const MINUTES_PER_GAME_DAY=1440;
export const CALENDAR_SCHEMA=1;
export const DEFAULT_CIVIL_DATE='2026-01-01';
export const WEEKDAYS_RU=Object.freeze(['Пн','Вт','Ср','Чт','Пт','Сб','Вс']);
export const MONTHS_RU=Object.freeze(['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек']);

export function isLeapYear(year){
  return Number.isInteger(year)&&year>=1&&(year%4===0&&(year%100!==0||year%400===0));
}
export function daysInMonth(year,month){
  if(!Number.isInteger(year)||year<1||year>9999||
     !Number.isInteger(month)||month<1||month>12)throw new RangeError('Invalid Gregorian month');
  return [31,isLeapYear(year)?29:28,31,30,31,30,31,31,30,31,30,31][month-1];
}
export function parseCivilDate(iso){
  if(typeof iso!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(iso))return null;
  const year=Number(iso.slice(0,4)),month=Number(iso.slice(5,7)),day=Number(iso.slice(8,10));
  if(year<1||year>9999||month<1||month>12)return null;
  if(day<1||day>daysInMonth(year,month))return null;
  return {year,month,day};
}
export function toISODate({year,month,day}){
  if(!Number.isInteger(day)||day<1||day>daysInMonth(year,month))
    throw new RangeError('Invalid Gregorian date');
  return String(year).padStart(4,'0')+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
}
function asCivil(value){
  const parsed=typeof value==='string'?parseCivilDate(value):value;
  if(!parsed)return null;
  try{return parseCivilDate(toISODate(parsed));}catch{return null;}
}
/** Days since 1970-01-01, using 400-year eras; negative serials are supported. */
export function civilToSerial(value){
  const civil=asCivil(value);
  if(!civil)throw new RangeError('Invalid Gregorian date');
  let {year:y,month:m,day:d}=civil;
  y-=m<=2?1:0;
  const era=Math.floor(y/400),yoe=y-era*400;
  const mp=m+(m>2?-3:9);
  const doy=Math.floor((153*mp+2)/5)+d-1;
  const doe=yoe*365+Math.floor(yoe/4)-Math.floor(yoe/100)+doy;
  return era*146097+doe-719468;
}
export function serialToCivil(serial){
  if(!Number.isSafeInteger(serial))throw new RangeError('Invalid calendar day');
  const z=serial+719468,era=Math.floor(z/146097),doe=z-era*146097;
  const yoe=Math.floor((doe-Math.floor(doe/1460)+Math.floor(doe/36524)-Math.floor(doe/146096))/365);
  let y=yoe+era*400;
  const doy=doe-(365*yoe+Math.floor(yoe/4)-Math.floor(yoe/100));
  const mp=Math.floor((5*doy+2)/153);
  const d=doy-Math.floor((153*mp+2)/5)+1;
  const m=mp+(mp<10?3:-9);
  y+=m<=2?1:0;
  const date={year:y,month:m,day:d};
  toISODate(date); // explicitly reject civil years outside 0001..9999
  return date;
}
/** Monday=0 ... Sunday=6. 1970-01-01 was Thursday. */
export function weekdayFromSerial(serial){
  if(!Number.isSafeInteger(serial))throw new RangeError('Invalid calendar day');
  return ((serial+3)%7+7)%7;
}
export function monthCells(year,month){
  const first=civilToSerial({year,month,day:1});
  const start=first-weekdayFromSerial(first);
  const count=Math.ceil((weekdayFromSerial(first)+daysInMonth(year,month))/7)*7;
  return Array.from({length:count},(_,i)=>{
    const civil=serialToCivil(start+i);
    return {iso:toISODate(civil),...civil,weekday:weekdayFromSerial(start+i),inMonth:civil.month===month};
  });
}
export function gameDayIndex(minutes){
  if(!Number.isFinite(minutes)||minutes<0)throw new RangeError('Invalid game minute');
  return Math.floor(minutes/MINUTES_PER_GAME_DAY);
}
export function createCalendar(startCivilDate=DEFAULT_CIVIL_DATE,anchorConfirmed=false){
  if(!parseCivilDate(startCivilDate))throw new RangeError('Invalid calendar anchor');
  return {schema:CALENDAR_SCHEMA,startCivilDate,anchorConfirmed:anchorConfirmed===true};
}
export function calendarForCurrentDate(currentISO,minutes,anchorConfirmed=false){
  const serial=civilToSerial(currentISO)-gameDayIndex(minutes);
  return createCalendar(toISODate(serialToCivil(serial)),anchorConfirmed);
}
/** Missing legacy v1 calendar is anchored to proposed current GAME day, not to game day 1.
 * Existing valid anchors win over every later device date/clock change.
 */
export function restoreCalendar(raw,minutes,proposedCurrentDate=DEFAULT_CIVIL_DATE){
  if(raw&&raw.schema===CALENDAR_SCHEMA&&parseCivilDate(raw.startCivilDate))
    return createCalendar(raw.startCivilDate,raw.anchorConfirmed);
  return calendarForCurrentDate(
    parseCivilDate(proposedCurrentDate)?proposedCurrentDate:DEFAULT_CIVIL_DATE,
    minutes,false);
}
export function calendarAt(calendar,minutes){
  const dayIndex=gameDayIndex(minutes);
  if(!calendar||!parseCivilDate(calendar.startCivilDate))throw new RangeError('Missing calendar anchor');
  const serial=civilToSerial(calendar.startCivilDate)+dayIndex;
  const civil=serialToCivil(serial),weekday=weekdayFromSerial(serial);
  const withinDay=Math.floor(minutes)%MINUTES_PER_GAME_DAY;
  const hour=Math.floor(withinDay/60),minute=withinDay%60;
  return {
    ...civil,iso:toISODate(civil),serial,weekday,weekdayLabel:WEEKDAYS_RU[weekday],
    isWeekend:weekday>=5,dayIndex,gameDay:dayIndex+1,hour,minute,
    time:String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0')
  };
}
export function formatCalendarDay(view,{includeYear=false}={}){
  const d=typeof view==='string'?(()=>{const civil=asCivil(view);if(!civil)throw new RangeError('Invalid date');
    const serial=civilToSerial(civil);return {...civil,weekday:weekdayFromSerial(serial)};})():view;
  return WEEKDAYS_RU[d.weekday]+', '+d.day+' '+MONTHS_RU[d.month-1]+(includeYear?' '+d.year:'');
}
/** W1-A.1: one-time personal anchor selection, no alteration to game clock or residents.
 * Later event/holiday/shift records make the anchor immutable until a dedicated migration.
 */
export function setCurrentCalendarDate(calendar,minutes,currentISO){
  if(!calendar||!parseCivilDate(calendar.startCivilDate))throw new RangeError('Missing calendar anchor');
  if(['events','holidays','occurrenceOverrides','reminderReceipts','workSchedules']
    .some(key=>Array.isArray(calendar[key])&&calendar[key].length))
    throw new Error('Cannot move calendar dates after scheduling events');
  return calendarForCurrentDate(currentISO,minutes,true);
}
