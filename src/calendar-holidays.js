/** W1-A.3: original optional holidays; editable and independent of employment rules. */
import {parseCivilDate,daysInMonth,civilToSerial,serialToCivil,toISODate,weekdayFromSerial} from './calendar-core.js';
const DEFAULTS=Object.freeze([
  {id:'h-family',title:'День семьи',month:5,day:15,dayOffWork:false,enabled:true},
  {id:'h-light',title:'Праздник света',month:12,day:20,dayOffWork:false,enabled:true},
  {id:'h-harvest',title:'Праздник урожая',month:9,day:23,dayOffWork:false,enabled:true},
  {id:'h-newyear',title:'Встреча нового года',month:1,day:1,dayOffWork:true,enabled:true}
]);
export const HOLIDAY_LIMIT=128;
const clean=x=>String(x??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,80);
function sanitize(raw){
  if(!raw||typeof raw!=='object'||!/^h-(?:[a-z]+|custom-[1-9]\d{0,7})$/.test(raw.id))return null;
  const month=Number(raw.month),day=Number(raw.day);
  if(!Number.isInteger(month)||month<1||month>12||
    !Number.isInteger(day)||day<1||day>daysInMonth(2024,month))return null;
  const title=clean(raw.title);if(!title)return null;
  return {id:raw.id,title,month,day,dayOffWork:raw.dayOffWork===true,enabled:raw.enabled!==false,
    participants:['alex','mira'].filter(p=>!Array.isArray(raw.participants)||raw.participants.includes(p))};
}
export function holidayDefinitions(calendar){
  const map=new Map(DEFAULTS.map(h=>[h.id,sanitize(h)]));
  for(const x of (Array.isArray(calendar?.holidays)?calendar.holidays:[]).slice(0,HOLIDAY_LIMIT*2)){
    const record=sanitize(x);if(record)map.set(record.id,record);
    if(map.size>=HOLIDAY_LIMIT)break;
  }
  return [...map.values()];
}
export function saveHoliday(calendar,input){
  const current=holidayDefinitions(calendar);
  const id=input?.id||'h-custom-'+(Math.max(0,...current.map(h=>Number(h.id.split('custom-')[1])||0))+1);
  const holiday=sanitize({...input,id});
  if(!holiday)throw new RangeError('Неверная дата или название праздника');
  if(!current.some(h=>h.id===id)&&current.length>=HOLIDAY_LIMIT)throw new RangeError('Слишком много праздников');
  const saved=(Array.isArray(calendar.holidays)?calendar.holidays:[]).filter(h=>h?.id!==id);
  return {...calendar,holidays:[...saved,holiday]};
}
export function removeHoliday(calendar,id){
  if(DEFAULTS.some(h=>h.id===id))return saveHoliday(calendar,{...holidayDefinitions(calendar).find(h=>h.id===id),enabled:false});
  return {...calendar,holidays:(calendar.holidays||[]).filter(h=>h.id!==id)};
}
export function holidaysOnDate(calendar,iso){
  const date=parseCivilDate(iso);if(!date)return [];
  return holidayDefinitions(calendar).filter(h=>h.enabled&&h.month===date.month&&h.day===date.day);
}
export function isCalendarDayOff(calendar,iso,{weekends=[5,6]}={}){
  const date=parseCivilDate(iso);if(!date)return false;
  return weekends.includes(weekdayFromSerial(civilToSerial(iso)))||
    holidaysOnDate(calendar,iso).some(h=>h.dayOffWork);
}
export function expandHolidays(calendar,fromISO,toISO){
  const from=civilToSerial(fromISO),to=civilToSerial(toISO);
  if(to<from||to-from>366)return [];
  const holidays=holidayDefinitions(calendar).filter(h=>h.enabled),out=[];
  for(let serial=from;serial<=to;serial++){
    const date=serialToCivil(serial),iso=toISODate(date);
    for(const h of holidays)if(h.month===date.month&&h.day===date.day)out.push({...h,iso,allDay:true,start:0,end:1440});
  }
  return out;
}
