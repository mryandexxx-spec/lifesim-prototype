import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {calendarAt,createCalendar,calendarForCurrentDate,setCurrentCalendarDate} from '../src/calendar-core.js';
import {addCalendarEvent,editCalendarEvent,changeEventOccurrence,expandCalendarEvents,findEventConflicts} from '../src/calendar-events.js';
import {consumeCalendarReminders} from '../src/calendar-reminders.js';
import {holidaysOnDate,saveHoliday,isCalendarDayOff} from '../src/calendar-holidays.js';
import {sampleWorldLighting,sunSchedule} from '../src/day-night-cycle.js';
import {createDayNightRenderer} from '../src/day-night-render.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const event=(date,options={})=>({title:'Ужин в семье',date,start:1140,end:1200,
  participants:['alex','mira'],repeat:'none',reminder:15,...options});

test('W1-A.4 paused household crosses leap midnight exactly once with one canonical night renderer',()=>{
  const root=newHousehold('2024-02-28');
  root.shop.credits=1234;
  root.otherSim.needs.hunger=66;
  root.minutes=1439.7;root.otherSim.minutes=root.minutes;
  root.calendar=addCalendarEvent(root.calendar,event('2024-02-29',{title:'Полночный праздник',start:0,end:60,reminder:0}));
  const before=sampleWorldLighting(root.calendar,root.minutes);
  root.paused=true;
  tickHousehold(root,30);
  assert.equal(root.minutes,1439.7);
  assert.equal(consumeCalendarReminders(root.calendar,1439.7,root.minutes).messages.length,0);
  root.paused=false;
  const oldMinutes=root.minutes;
  tickHousehold(root,.3);
  assert.equal(root.minutes,1440);
  assert.equal(root.otherSim.minutes,1440);
  assert.equal(calendarAt(root.calendar,root.minutes).iso,'2024-02-29');
  const crossing=consumeCalendarReminders(root.calendar,oldMinutes,root.minutes);
  assert.equal(crossing.messages.length,1);
  assert.equal(crossing.messages[0].title,'Полночный праздник');
  root.calendar=crossing.calendar;
  const after=sampleWorldLighting(root.calendar,root.minutes);
  assert.equal(before.phase,'night');
  assert.equal(after.phase,'night');
  assert.ok(Math.max(...after.backdropColor.map((v,i)=>Math.abs(v-before.backdropColor[i])))<.01);
  const restored=loadHousehold(clone(root),'2028-01-01');
  assert.equal(restored.version,1);assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.equal(restored.shop.credits,1234);
  assert.equal(restored.otherSim.needs.hunger,root.otherSim.needs.hunger);
  assert.equal(restored.otherSim.minutes,root.minutes);
  assert.equal(restored.calendar.reminderReceipts.length,1);
  assert.equal(consumeCalendarReminders(restored.calendar,1439.7,1440).messages.length,0);
  assert.deepEqual(sampleWorldLighting(restored.calendar,restored.minutes),after);
});

test('W1-A.4 next-day lead-time reminders at x3 crossing and reload never repeat',()=>{
  let cal=createCalendar('2026-12-31');
  cal=addCalendarEvent(cal,event('2027-01-01',{title:'Встреча в новом году',start:5,end:65,reminder:15}));
  // Scheduled for Dec 31 23:50, not Jan 1 00:05.
  const before=consumeCalendarReminders(cal,1429.5,1430.1);
  assert.equal(before.messages.length,1);
  assert.equal(before.messages[0].iso,'2027-01-01');
  assert.equal(before.messages[0].at,1430);
  const repeated=consumeCalendarReminders(clone(before.calendar),1430.1,1450);
  assert.equal(repeated.messages.length,0);
  assert.equal(consumeCalendarReminders(before.calendar,1429.5,1430.1).messages.length,0);
  assert.equal(consumeCalendarReminders(before.calendar,1450,1450).messages.length,0);
});

test('W1-A.4 one occurrence changes participant and category only for that day and survives JSON migration',()=>{
  let c=createCalendar('2026-11-17');
  c=addCalendarEvent(c,event('2026-11-17',{repeat:'weekly',weekdays:[1],participants:['alex'],category:'personal'}));
  c=changeEventOccurrence(c,'ce-1','2026-11-24',{
    title:'Встреча Миры',participants:['mira'],category:'meeting',start:1200,end:1250
  });
  const first=expandCalendarEvents(c,'2026-11-17','2026-11-17')[0];
  const edited=expandCalendarEvents(c,'2026-11-24','2026-11-24')[0];
  assert.deepEqual(first.participants,['alex']);
  assert.equal(first.category,'personal');
  assert.deepEqual(edited.participants,['mira']);
  assert.equal(edited.category,'meeting');
  assert.equal(edited.title,'Встреча Миры');
  const reloaded=loadHousehold({...newHousehold('2026-11-17'),calendar:clone(c)});
  const saved=expandCalendarEvents(reloaded.calendar,'2026-11-24','2026-11-24')[0];
  assert.deepEqual(saved.participants,['mira']);
  assert.equal(saved.category,'meeting');
  assert.equal(expandCalendarEvents(reloaded.calendar,'2026-12-01','2026-12-01')[0].title,'Ужин в семье');
  assert.equal(reloaded.calendar.events[0].date,'2026-11-17');
});

test('W1-A.4 editing a future instance in series keeps original anchor and count',()=>{
  let c=createCalendar('2026-11-17');
  c=addCalendarEvent(c,event('2026-11-17',{repeat:'weekly',weekdays:[1],count:5}));
  const later=expandCalendarEvents(c,'2026-12-01','2026-12-01')[0];
  assert.equal(later.date,'2026-11-17');
  assert.equal(later.iso,'2026-12-01');
  c=editCalendarEvent(c,'ce-1',{title:'Семейный ужин по вторникам'});
  assert.equal(c.events[0].date,'2026-11-17');
  assert.equal(expandCalendarEvents(c,'2026-11-17','2026-11-17').length,1);
  assert.equal(expandCalendarEvents(c,'2026-12-01','2026-12-01').length,1);
  assert.equal(expandCalendarEvents(c,'2026-12-15','2026-12-15').length,1);
  assert.equal(expandCalendarEvents(c,'2026-12-22','2026-12-22').length,0);
});

test('W1-A.4 configured weekends are reflected in all calendar read models and survive anchor edit',()=>{
  let c={...createCalendar('2026-11-17'),weekendDays:[1,3]};
  assert.equal(calendarAt(c,480).isWeekend,true);
  assert.equal(isCalendarDayOff(c,'2026-11-17'),true);
  assert.equal(isCalendarDayOff(c,'2026-11-21'),false);
  c=setCurrentCalendarDate(c,480,'2027-04-06');
  assert.deepEqual(c.weekendDays,[1,3]);
  assert.equal(calendarAt(c,480).isWeekend,true);
  assert.equal(calendarAt(c,480).iso,'2027-04-06');
  c=saveHoliday(c,{title:'Семейный выходной',month:4,day:7,dayOffWork:true});
  assert.equal(isCalendarDayOff(c,'2027-04-07'),true);
  assert.throws(()=>setCurrentCalendarDate(c,480,'2028-11-02'));
  const restored=loadHousehold({...newHousehold('2027-04-06'),calendar:clone(c)});
  assert.equal(isCalendarDayOff(restored.calendar,'2027-04-07'),true);
});

test('W1-A.4 summer-winter lighting derives from shared date, never from added events',()=>{
  const cal=createCalendar('2026-06-21');
  const plain=sampleWorldLighting(cal,780);
  const withEvents=addCalendarEvent(cal,event('2026-06-21',{repeat:'yearly'}));
  const withHolidays=saveHoliday(withEvents,{title:'Праздник света',month:6,day:21,dayOffWork:true});
  assert.deepEqual(sampleWorldLighting(withHolidays,780),plain);
  assert.ok(sampleWorldLighting(cal,60).sunlightIntensity<plain.sunlightIntensity);
  assert.ok(sunSchedule('2026-06-21').sunsetMinute>sunSchedule('2026-12-21').sunsetMinute);
  class Color{set(r,g,b){this.r=r;this.g=g;this.b=b;}}
  const lightSun={light:{intensity:0},setEulerAngles(){}};
  const lightFill={light:{intensity:0}},scene={};
  const camera={camera:{}};
  const renderer=createDayNightRenderer({scene,sun:lightSun,fill:lightFill,camera,Color});
  renderer.update(cal,780);
  const count=renderer.getUpdateCount();
  renderer.update(withHolidays,780);
  assert.equal(renderer.getUpdateCount(),count,'calendar event/holiday edits do not recreate scene colors');
});
