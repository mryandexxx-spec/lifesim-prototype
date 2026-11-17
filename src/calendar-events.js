/** W1-A.3: bounded household event registry; no browser Date, DOM, PlayCanvas or real time. */
import {civilToSerial,serialToCivil,toISODate,parseCivilDate,weekdayFromSerial,daysInMonth} from './calendar-core.js';
export const MAX_CALENDAR_EVENTS=256;
const CATEGORIES=['personal','family','meeting','holiday','other'];
const REPEATS=['none','daily','weekly','monthly','yearly'];
export const EVENT_PARTICIPANTS=Object.freeze(['alex','mira']);
const clean=(value,max=160)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
const validDate=(iso)=>Boolean(parseCivilDate(iso));
const boundedInt=(n,min,max,defaultValue)=>Number.isInteger(n)&&n>=min&&n<=max?n:defaultValue;
function normalize(raw,id){
  if(!raw||typeof raw!=='object'||!validDate(raw.date))return null;
  const title=clean(raw.title,80);
  if(!title)return null;
  const allDay=raw.allDay===true;
  const start=allDay?0:boundedInt(Number(raw.start),0,1439,NaN);
  const end=allDay?1440:boundedInt(Number(raw.end),1,1440,NaN);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return null;
  const repeat=REPEATS.includes(raw.repeat)?raw.repeat:'none';
  const days=Array.isArray(raw.weekdays)?[...new Set(raw.weekdays.filter(n=>Number.isInteger(n)&&n>=0&&n<=6))].sort((a,b)=>a-b):[];
  const weekdays=repeat==='weekly'&&days.length?days:[weekdayFromSerial(civilToSerial(raw.date))];
  const participants=Array.isArray(raw.participants)
    ?EVENT_PARTICIPANTS.filter(p=>raw.participants.includes(p)):EVENT_PARTICIPANTS.slice();
  if(!participants.length)return null;
  const until=validDate(raw.until)&&civilToSerial(raw.until)>=civilToSerial(raw.date)?raw.until:null;
  const count=boundedInt(Number(raw.count),1,10000,null);
  const reminder=[null,0,15,60,1440].includes(raw.reminder)?raw.reminder:null;
  return {id,title,description:clean(raw.description,280),date:raw.date,start,end,allDay,
    participants,category:CATEGORIES.includes(raw.category)?raw.category:'personal',
    repeat,weekdays,until,count,reminder};
}
const idValid=id=>typeof id==='string'&&/^ce-[1-9]\d{0,8}$/.test(id);
const overrideKey=(eventId,date)=>eventId+'@'+date;
export function restoreEventRecords(raw){
  const events=[],known=new Set();
  for(const source of (Array.isArray(raw?.events)?raw.events:[]).slice(0,MAX_CALENDAR_EVENTS*2)){
    if(!idValid(source?.id)||known.has(source.id))continue;
    const event=normalize(source,source.id);
    if(!event)continue;
    known.add(event.id);events.push(event);
    if(events.length===MAX_CALENDAR_EVENTS)break;
  }
  const overrides=[],keys=new Set();
  for(const x of (Array.isArray(raw?.occurrenceOverrides)?raw.occurrenceOverrides:[]).slice(-512)){
    if(!known.has(x?.eventId)||!validDate(x?.date))continue;
    const key=overrideKey(x.eventId,x.date);
    if(keys.has(key))continue;
    const fields=x.deleted===true?{}:{
      title:clean(x.title,80),description:clean(x.description,280),
      start:boundedInt(x.start,0,1439,0),end:boundedInt(x.end,1,1440,1440),allDay:x.allDay===true,
      ...(Array.isArray(x.participants)
        ?{participants:EVENT_PARTICIPANTS.filter(p=>x.participants.includes(p))}:{}),
      ...(CATEGORIES.includes(x.category)?{category:x.category}:{})
    };
    if(x.deleted!==true&&(!fields.title||(fields.end<=fields.start&&!fields.allDay)||
      (fields.participants&&fields.participants.length===0)))continue;
    overrides.push({eventId:x.eventId,date:x.date,deleted:x.deleted===true,...fields});keys.add(key);
  }
  const maxId=Math.max(0,...events.map(e=>Number(e.id.slice(3))));
  const eventSeq=Math.max(maxId+1,boundedInt(raw?.eventSeq,1,100000000,1));
  return {events,occurrenceOverrides:overrides,eventSeq};
}
export function addCalendarEvent(calendar,input){
  const records=restoreEventRecords(calendar);
  if(records.events.length>=MAX_CALENDAR_EVENTS)throw new RangeError('Слишком много событий');
  const id='ce-'+records.eventSeq;
  const event=normalize(input,id);
  if(!event)throw new RangeError('Некорректное событие');
  return {...calendar,...records,events:[...records.events,event],eventSeq:records.eventSeq+1};
}
export function editCalendarEvent(calendar,id,changes){
  const records=restoreEventRecords(calendar);
  const original=records.events.find(e=>e.id===id);
  if(!original)throw new RangeError('Событие не найдено');
  const updated=normalize({...original,...changes},id);
  if(!updated)throw new RangeError('Некорректное событие');
  return {...calendar,...records,events:records.events.map(e=>e.id===id?updated:e)};
}
export function removeCalendarEvent(calendar,id){
  const records=restoreEventRecords(calendar);
  return {...calendar,...records,events:records.events.filter(e=>e.id!==id),
    occurrenceOverrides:records.occurrenceOverrides.filter(x=>x.eventId!==id)};
}
function ordinal(event,serial){
  const first=civilToSerial(event.date);
  if(serial<first)return null;
  const delta=serial-first, date=serialToCivil(serial);
  if(event.until&&serial>civilToSerial(event.until))return null;
  if(event.repeat==='none')return delta===0?1:null;
  if(event.repeat==='daily')return delta+1;
  if(event.repeat==='weekly'){
    const weekday=weekdayFromSerial(serial);
    if(!event.weekdays.includes(weekday))return null;
    const firstWeek=first-weekdayFromSerial(first);
    const week=Math.floor((serial-firstWeek)/7);
    const partial=event.weekdays.filter(d=>firstWeek+d>=first).length;
    if(week===0)return event.weekdays.filter(d=>d<=weekday&&firstWeek+d>=first).length;
    return partial+(week-1)*event.weekdays.length+event.weekdays.filter(d=>d<=weekday).length;
  }
  const anchor=parseCivilDate(event.date);
  if(event.repeat==='monthly'){
    if(date.day!==anchor.day)return null;
    const months=(date.year-anchor.year)*12+date.month-anchor.month;
    if(months<0)return null;
    let count=0;
    for(let offset=0;offset<=months;offset++){
      const total=anchor.year*12+anchor.month-1+offset;
      const y=Math.floor(total/12),m=total%12+1;
      if(anchor.day<=daysInMonth(y,m))count++;
    }
    return count; // absent 31st never consumes the recurrence count
  }
  if(event.repeat==='yearly'){
    if(date.month!==anchor.month||date.day!==anchor.day)return null;
    if(anchor.month===2&&anchor.day===29){
      let count=0;
      for(let year=anchor.year;year<=date.year;year++)if(daysInMonth(year,2)===29)count++;
      return count;
    }
    return date.year-anchor.year+1;
  }
  return null;
}
export function expandCalendarEvents(calendar,fromISO,toISO,{limit=600}={}){
  const from=civilToSerial(fromISO),to=civilToSerial(toISO);
  if(to<from||to-from>366||limit<1)return [];
  const records=restoreEventRecords(calendar),overrides=new Map(records.occurrenceOverrides.map(x=>[overrideKey(x.eventId,x.date),x]));
  const result=[];
  for(const e of records.events){
    for(let serial=Math.max(from,civilToSerial(e.date));serial<=to;serial++){
      const number=ordinal(e,serial);
      if(!number||(e.count&&number>e.count))continue;
      const iso=toISODate(serialToCivil(serial)),override=overrides.get(overrideKey(e.id,iso));
      if(override?.deleted)continue;
      const item={...e,iso,occurrenceId:overrideKey(e.id,iso),originalDate:e.date,
        ...(override?{title:override.title,description:override.description,start:override.start,
          end:override.end,allDay:override.allDay,
          participants:override.participants??e.participants,category:override.category??e.category,
          overridden:true}:{})};
      result.push(item);
      if(result.length>=limit)break;
    }
    if(result.length>=limit)break;
  }
  return result.sort((a,b)=>a.iso.localeCompare(b.iso)||a.start-b.start||a.id.localeCompare(b.id));
}
/** Edit/delete one instance of a repeating series; stable key is original occurrence day. */
export function changeEventOccurrence(calendar,id,iso,changes=null){
  const records=restoreEventRecords(calendar);
  const event=records.events.find(x=>x.id===id);
  if(!event||!expandCalendarEvents({...calendar,...records,occurrenceOverrides:[]},iso,iso)
    .some(x=>x.id===id))throw new RangeError('Нет такого повторения');
  const next=records.occurrenceOverrides.filter(x=>x.eventId!==id||x.date!==iso);
  if(changes!==null){
    if(changes.deleted===true)next.push({eventId:id,date:iso,deleted:true});
    else {
      const projected=normalize({...event,...changes,date:iso},id);
      if(!projected)throw new RangeError('Некорректное изменение');
      next.push({eventId:id,date:iso,deleted:false,title:projected.title,
        description:projected.description,start:projected.start,end:projected.end,
        allDay:projected.allDay,participants:projected.participants,category:projected.category});
    }
  }
  if(next.length>512)throw new RangeError('Слишком много исключений');
  return {...calendar,...records,occurrenceOverrides:next};
}
export function findEventConflicts(calendar,candidate){
  const candidateEnd=candidate.end,iso=candidate.iso||candidate.date;
  return expandCalendarEvents(calendar,iso,iso).filter(x=>x.id!==candidate.id&&
    x.start<candidateEnd&&candidate.start<x.end&&
    x.participants.some(p=>candidate.participants.includes(p)));
}
