import test from 'node:test';
import assert from 'node:assert/strict';
import {createCalendar,calendarAt,setCurrentCalendarDate} from '../src/calendar-core.js';
import {addCalendarEvent,editCalendarEvent,removeCalendarEvent,expandCalendarEvents,changeEventOccurrence,findEventConflicts,restoreEventRecords} from '../src/calendar-events.js';
import {saveHoliday,removeHoliday,holidaysOnDate,holidayDefinitions,isCalendarDayOff} from '../src/calendar-holidays.js';
import {consumeCalendarReminders,restoreReminderReceipts} from '../src/calendar-reminders.js';
const clone=x=>JSON.parse(JSON.stringify(x));
const event=(date,extra={})=>({title:'Семейный ужин',date,start:1080,end:1140,participants:['alex','mira'],repeat:'none',reminder:60,...extra});
test('W1-A.3 event CRUD preserves epoch and canonical v1 clock',()=>{
  const c=createCalendar('2026-11-17');
  let next=addCalendarEvent(c,event('2026-11-18'));
  assert.equal(c.events,undefined);
  assert.equal(next.events[0].id,'ce-1');
  assert.equal(next.events[0].title,'Семейный ужин');
  next=editCalendarEvent(next,'ce-1',{title:'Ужин с Мирой'});
  assert.equal(expandCalendarEvents(next,'2026-11-18','2026-11-18')[0].title,'Ужин с Мирой');
  assert.throws(()=>setCurrentCalendarDate(next,480,'2027-02-01'),/Cannot move/);
  assert.equal(calendarAt(next,480).iso,'2026-11-17');
  next=removeCalendarEvent(next,'ce-1');
  assert.equal(expandCalendarEvents(next,'2026-11-18','2026-11-18').length,0);
  next=addCalendarEvent(next,event('2026-11-19'));
  assert.equal(next.events[0].id,'ce-2');
});
test('weekly multiple weekdays and single occurrence edit / skip',()=>{
  let c=createCalendar('2026-11-17');
  c=addCalendarEvent(c,event('2026-11-17',{repeat:'weekly',weekdays:[1,3],count:4}));
  assert.deepEqual(expandCalendarEvents(c,'2026-11-17','2026-12-01').map(x=>x.iso),
    ['2026-11-17','2026-11-19','2026-11-24','2026-11-26']);
  c=changeEventOccurrence(c,'ce-1','2026-11-19',{title:'Особый ужин'});
  assert.equal(expandCalendarEvents(c,'2026-11-19','2026-11-19')[0].title,'Особый ужин');
  c=changeEventOccurrence(c,'ce-1','2026-11-24',{deleted:true});
  assert.equal(expandCalendarEvents(c,'2026-11-24','2026-11-24').length,0);
  const loaded=restoreEventRecords(clone(c));
  assert.equal(loaded.occurrenceOverrides.length,2);
});
test('Feb29 and monthly31 skip invalid days without drift',()=>{
  let c=createCalendar('2024-02-29');
  c=addCalendarEvent(c,event('2024-02-29',{repeat:'yearly'}));
  c=addCalendarEvent(c,event('2024-01-31',{repeat:'monthly',reminder:null}));
  assert.deepEqual(expandCalendarEvents(c,'2025-02-01','2025-03-31').map(x=>x.iso),['2025-03-31']);
  assert.deepEqual(expandCalendarEvents(c,'2028-02-01','2028-02-29').map(x=>x.iso),['2028-02-29']);
});
test('same-day overlap warns, but does not delete other residents events',()=>{
  let c=createCalendar('2026-11-17');
  c=addCalendarEvent(c,event('2026-11-18',{participants:['alex']}));
  assert.equal(findEventConflicts(c,{...event('2026-11-18',{participants:['alex']}),id:'draft'}).length,1);
  assert.equal(findEventConflicts(c,{...event('2026-11-18',{participants:['mira']}),id:'draft'}).length,0);
});
test('holiday definitions custom and original defaults can be edited, disabled, work-free tag',()=>{
  let c=createCalendar('2026-01-01');
  assert.ok(holidaysOnDate(c,'2026-01-01').some(x=>x.id==='h-newyear'));
  c=saveHoliday(c,{title:'Наш праздник',month:2,day:29,dayOffWork:true});
  assert.equal(holidaysOnDate(c,'2028-02-29').some(x=>x.title==='Наш праздник'),true);
  assert.equal(holidaysOnDate(c,'2027-02-28').length,0);
  assert.equal(isCalendarDayOff(c,'2028-02-29'),true);
  c=saveHoliday(c,{...holidayDefinitions(c).find(x=>x.id==='h-newyear'),enabled:false});
  assert.equal(holidaysOnDate(c,'2027-01-01').length,0);
  c=removeHoliday(c,'h-custom-1');
  assert.equal(holidaysOnDate(c,'2028-02-29').length,0);
});
test('reminders are game time crossings once, across midnight, x3 and reload',()=>{
  let c=createCalendar('2026-11-17');
  c=addCalendarEvent(c,event('2026-11-18',{start:30,end:90,reminder:60}));
  const crossing=consumeCalendarReminders(c,1380,1410);
  assert.equal(crossing.messages.length,1);
  assert.equal(crossing.messages[0].at,1410);
  assert.equal(consumeCalendarReminders(crossing.calendar,1400,1600).messages.length,0);
  const saved=clone(crossing.calendar);
  assert.equal(consumeCalendarReminders(saved,1400,1600).messages.length,0);
  assert.equal(consumeCalendarReminders(saved,1400,1400).messages.length,0);
  assert.equal(restoreReminderReceipts(['invalid',...saved.reminderReceipts]).length,1);
});
test('malformed saved events/overrides are rejected, bounded and sanitized',()=>{
  const restored=restoreEventRecords({events:[{...event('2026-11-18'),id:'ce-9',title:'<b>Test</b>'},
    {...event('2026-02-30'),id:'ce-1'}],occurrenceOverrides:[{eventId:'ce-9',date:'bad',deleted:true}]});
  assert.equal(restored.events.length,1);
  assert.equal(restored.events[0].id,'ce-9');
  assert.equal(restored.eventSeq,10);
});
