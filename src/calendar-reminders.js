/** W1-A.3 game-time-only reminders. Crossing receipts stored inside the household. */
import {civilToSerial,parseCivilDate,serialToCivil,toISODate} from './calendar-core.js';
import {expandCalendarEvents} from './calendar-events.js';
export const REMINDER_RECEIPT_LIMIT=512;
const validReceipt=x=>typeof x==='string'&&/^(?:ce-\d+|h-[a-z0-9-]+)@\d{4}-\d{2}-\d{2}@(?:0|15|60|1440)$/.test(x);
export function restoreReminderReceipts(raw){
  return [...new Set((Array.isArray(raw)?raw:[]).filter(validReceipt).slice(-REMINDER_RECEIPT_LIMIT))];
}
function absoluteStart(calendar,iso,start){
  return (civilToSerial(iso)-civilToSerial(calendar.startCivilDate))*1440+start;
}
/** Trigger if previous < scheduled <= current. Works across midnight, x3, reload and large jumps. */
export function consumeCalendarReminders(calendar,previousMinutes,currentMinutes){
  if(!Number.isFinite(previousMinutes)||!Number.isFinite(currentMinutes)||
    currentMinutes<=previousMinutes)return {calendar,messages:[]};
  const seen=new Set(restoreReminderReceipts(calendar.reminderReceipts)),messages=[];
  // Chunk event expansion into safe one-year viewports even for large simulation jumps.
  const left=Math.floor((previousMinutes-1440)/1440),right=Math.floor(currentMinutes/1440);
  const base=civilToSerial(calendar.startCivilDate);
  let processed=0;
  for(let day=left;day<=right&&processed<730;day+=60,processed+=60){
    const end=Math.min(day+59,right);
    let from,to;
    try{from=toISODate(serialToCivil(base+day));to=toISODate(serialToCivil(base+end));}
    catch{break;}
    for(const event of expandCalendarEvents(calendar,from,to,{limit:2000})){
      if(event.reminder===null)continue;
      const offset=event.reminder,at=absoluteStart(calendar,event.iso,event.start)-offset;
      const receipt=event.occurrenceId+'@'+offset;
      if(at<=previousMinutes||at>currentMinutes||seen.has(receipt))continue;
      seen.add(receipt);
      messages.push({id:receipt,eventId:event.id,iso:event.iso,title:event.title,
        at,offset,participants:event.participants});
      if(messages.length>=50)break;
    }
    if(messages.length>=50)break;
  }
  if(!messages.length)return {calendar,messages};
  return {calendar:{...calendar,reminderReceipts:[...seen].slice(-REMINDER_RECEIPT_LIMIT)},
    messages:messages.sort((a,b)=>a.at-b.at)};
}
