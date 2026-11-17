import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MINUTES_PER_GAME_DAY,isLeapYear,daysInMonth,parseCivilDate,toISODate,
  civilToSerial,serialToCivil,weekdayFromSerial,monthCells,calendarForCurrentDate,
  createCalendar,restoreCalendar,calendarAt,setCurrentCalendarDate,formatCalendarDay
} from '../src/calendar-core.js';

test('W1-A.1 leap years respect the Gregorian /4 /100 /400 rules',()=>{
  assert.equal(isLeapYear(1900),false);
  assert.equal(isLeapYear(2000),true);
  assert.equal(isLeapYear(2024),true);
  assert.equal(isLeapYear(2026),false);
  assert.equal(daysInMonth(2000,2),29);
  assert.equal(daysInMonth(1900,2),28);
  assert.equal(daysInMonth(2026,4),30);
  assert.equal(daysInMonth(2026,12),31);
  assert.deepEqual(parseCivilDate('2024-02-29'),{year:2024,month:2,day:29});
  for(const invalid of ['2026-02-29','1900-02-29','2026-13-01','2026-04-31',
    '2026-00-10','2026-01-00','2026-1-01','2026-01-01T00:00','0000-01-01',null])
    assert.equal(parseCivilDate(invalid),null,invalid);
  assert.throws(()=>toISODate({year:2026,month:2,day:29}),RangeError);
});
test('W1-A.1 civil dates round-trip through serial days, even across centuries',()=>{
  assert.equal(civilToSerial('1970-01-01'),0);
  assert.equal(weekdayFromSerial(0),3); // Thursday
  for(const iso of ['0001-01-01','1582-10-15','1900-02-28','1900-03-01',
    '1969-12-31','1970-01-01','1999-12-31','2000-02-29',
    '2024-02-29','2026-11-17','2026-12-31','2400-02-29','9999-12-31']){
    const serial=civilToSerial(iso);
    assert.equal(toISODate(serialToCivil(serial)),iso);
    assert.equal(civilToSerial(serialToCivil(serial)),serial);
  }
  const leap=civilToSerial('2000-02-28');
  assert.equal(toISODate(serialToCivil(leap+1)),'2000-02-29');
  assert.equal(toISODate(serialToCivil(leap+2)),'2000-03-01');
  assert.equal(civilToSerial('1900-03-01')-civilToSerial('1900-02-28'),1);
});
test('W1-A.1 canonical weekdays, weekends, and Monday-first month grids',()=>{
  assert.equal(weekdayFromSerial(civilToSerial('2026-11-16')),0);
  assert.equal(weekdayFromSerial(civilToSerial('2026-11-17')),1);
  assert.equal(weekdayFromSerial(civilToSerial('2026-11-22')),6);
  const november=monthCells(2026,11);
  assert.equal(november[0].iso,'2026-10-26');
  assert.equal(november[0].weekday,0);
  assert.equal(november.at(-1).weekday,6);
  assert.equal(november.filter(day=>day.inMonth).length,30);
  const feb=monthCells(2024,2);
  assert.equal(feb.filter(day=>day.inMonth).length,29);
  assert.equal(feb.find(day=>day.iso==='2024-02-29').inMonth,true);
});
test('W1-A.1 absolute household minute stays the single source of time',()=>{
  const calendar=createCalendar('2026-12-31');
  const m=MINUTES_PER_GAME_DAY;
  assert.deepEqual(
    (({iso,time,gameDay})=>({iso,time,gameDay}))(calendarAt(calendar,480)),
    {iso:'2026-12-31',time:'08:00',gameDay:1});
  assert.equal(calendarAt(calendar,m-0.001).time,'23:59');
  assert.equal(calendarAt(calendar,m-0.001).iso,'2026-12-31');
  assert.equal(calendarAt(calendar,m).time,'00:00');
  assert.equal(calendarAt(calendar,m).iso,'2027-01-01');
  assert.equal(calendarAt(calendar,m+180).time,'03:00');
  assert.equal(calendarAt(calendar,m*2+1439).iso,'2027-01-02');
  assert.equal(calendarAt(calendar,m*2+1439).time,'23:59');
  assert.equal(formatCalendarDay(calendarAt(calendar,m),{includeYear:true}),'Пт, 1 янв 2027');
});
test('W1-A.1 missing v1 field anchors CURRENT game day without changing minutes',()=>{
  const minutes=MINUTES_PER_GAME_DAY*87+480.33;
  const calendar=restoreCalendar(undefined,minutes,'2026-11-17');
  assert.equal(calendar.schema,1);
  assert.equal(calendar.anchorConfirmed,false);
  assert.equal(calendarAt(calendar,minutes).iso,'2026-11-17');
  assert.equal(calendarAt(calendar,minutes).time,'08:00');
  assert.equal(calendarAt(calendar,minutes-MINUTES_PER_GAME_DAY).iso,'2026-11-16');
  assert.equal(calendarAt(calendar,minutes+MINUTES_PER_GAME_DAY).iso,'2026-11-18');
  assert.equal(calendarAt(calendar,minutes).isWeekend,false);
});
test('W1-A.1 saved epoch never follows changing device dates or timezone',()=>{
  const minutes=60000;
  const saved=restoreCalendar(null,minutes,'2026-11-17');
  assert.deepEqual(restoreCalendar(JSON.parse(JSON.stringify(saved)),minutes,'2040-12-31'),saved);
  assert.equal(calendarAt(saved,minutes).iso,'2026-11-17');
  assert.equal(calendarAt(saved,minutes+1).iso,'2026-11-17');
  const replaced=setCurrentCalendarDate(saved,minutes,'2028-02-29');
  assert.equal(replaced.anchorConfirmed,true);
  assert.equal(calendarAt(replaced,minutes).iso,'2028-02-29');
  assert.equal(calendarAt(replaced,minutes+MINUTES_PER_GAME_DAY).iso,'2028-03-01');
  assert.equal(calendarAt(saved,minutes).iso,'2026-11-17'); // no in-place mutations
  assert.deepEqual(restoreCalendar(replaced,minutes,'2030-01-01'),replaced);
  assert.throws(()=>setCurrentCalendarDate({...replaced,events:[{id:'event-1'}]},minutes,'2029-01-01'));
  assert.deepEqual(restoreCalendar({schema:1,startCivilDate:'2026-02-30'},0,'2026-11-17'),
    calendarForCurrentDate('2026-11-17',0));
});
test('W1-A.1 long simulated time has no DST or device clock side effects',()=>{
  const calendar=createCalendar('2024-03-30');
  assert.equal(calendarAt(calendar,MINUTES_PER_GAME_DAY).iso,'2024-03-31');
  assert.equal(calendarAt(calendar,MINUTES_PER_GAME_DAY).time,'00:00');
  assert.equal(calendarAt(calendar,2*MINUTES_PER_GAME_DAY).iso,'2024-04-01');
  assert.equal(calendarAt(calendar,10000000).gameDay,6945);
  assert.equal(calendarAt(calendar,10000000).time,'10:40');
  for(let i=0;i<400;i+=17){
    const date=serialToCivil(civilToSerial('2000-01-01')+i);
    assert.deepEqual(serialToCivil(civilToSerial(date)),date);
  }
});
