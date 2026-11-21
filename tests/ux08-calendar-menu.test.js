import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold} from '../src/household.js';
import {calendarAt} from '../src/calendar-core.js';
import {addCalendarEvent,changeEventOccurrence,expandCalendarEvents} from '../src/calendar-events.js';
import {calendarAgendaSummary} from '../src/calendar-ui.js';
import {careerVacancies,acceptCareerOffer,calendarCareerShifts} from '../src/career-job-board.js';

test('UX08: today uses the canonical household clock; existing shift and Mira event share selected date',()=>{
 const root=newHousehold('2026-11-17');
 root.minutes=600;root.otherSim.minutes=600;
 const vacancy=careerVacancies(root,'alex')[0];
 assert.ok(vacancy?.id);
 const offer=acceptCareerOffer(root,'alex',vacancy.id);
 assert.equal(offer.ok,true);
 root.careerSystem=offer.careerSystem;
 const target=offer.shift.iso;
 root.calendar=addCalendarEvent(root.calendar,{
  title:'Личное событие Миры',date:target,start:1100,end:1160,
  participants:['mira'],category:'personal',repeat:'none'
 });
 const summary=calendarAgendaSummary(root,target);
 assert.equal(summary.events.length,1);
 assert.deepEqual(summary.events[0].participants,['mira']);
 assert.ok(summary.shifts.some(s=>s.residentId==='alex'));
 assert.deepEqual(summary.shifts,calendarCareerShifts(root,target,target));
 assert.equal(summary.holidays.length>=0,true);
 assert.equal(calendarAt(root.calendar,root.minutes).iso,'2026-11-17');
 assert.equal(root.version,1);
 const restored=loadHousehold(structuredClone(root));
 assert.deepEqual(calendarAgendaSummary(restored,target).events,summary.events);
});
test('UX08: change one weekly repetition without changing series or root v1',()=>{
 const root=newHousehold('2026-11-17');
 root.calendar=addCalendarEvent(root.calendar,{title:'Встреча',
  date:'2026-11-17',start:1000,end:1060,participants:['alex','mira'],
  repeat:'weekly',weekdays:[1],count:5});
 const first=expandCalendarEvents(root.calendar,'2026-11-17','2026-11-17')[0];
 const second=expandCalendarEvents(root.calendar,'2026-11-24','2026-11-24')[0];
 assert.ok(first&&second);
 root.calendar=changeEventOccurrence(root.calendar,second.id,second.iso,{title:'Только эта встреча'});
 assert.equal(calendarAgendaSummary(root,'2026-11-17').events[0].title,'Встреча');
 assert.equal(calendarAgendaSummary(root,'2026-11-24').events[0].title,'Только эта встреча');
 assert.equal(calendarAgendaSummary(root,'2026-12-01').events[0].title,'Встреча');
 assert.equal(loadHousehold(structuredClone(root)).version,1);
});
test('UX08: reachable controls, no duplicate listeners or save schema change',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const cal=read('src/calendar-ui.js'),game=read('src/game.js');
 const html=read('index.html'),css=read('styles.css'),pages=read('.github/workflows/pages.yml');
 assert.match(cal,/selected=today\(\);view='day'/);
 assert.match(cal,/calendarAgendaSummary\(root,selected\)/);
 assert.match(cal,/lc-jump-date/);
 assert.match(cal,/visualViewport\?\.addEventListener\('resize',syncViewport\)/);
 assert.match(cal,/id="lc-event-done">Готово/);
 assert.match(cal,/changeEventOccurrence\(calendar,editing.id,editing.iso,data\)/);
 assert.match(css,/\.lc-form-toolbar\{position:sticky/);
 assert.match(css,/minmax\(44px,1fr\)/);
 for(const name of ['Вид и управление','Игра и сохранение','Помощь','Начать заново']){
  assert.ok(html.includes(name),name);
 }
 for(const id of ['save-btn','reset-btn','tour-replay','viewport-health-open',
   'item-labels-btn','menu-rotate-btn','menu-reset-camera-btn','menu-lot-camera-btn',
   'music-audio-toggle','auto-btn','mesh-model-btn'])assert.equal(html.split('id="'+id+'"').length,2,id);
 assert.match(game,/if\(!save\(true\)\)\{\s*game=previous/);
 assert.match(game,/window\.confirm\('Начать новую жизнь/);
 assert.match(pages,/cp src\/calendar-core\.js src\/calendar-events\.js src\/calendar-holidays\.js src\/calendar-reminders\.js src\/calendar-ui\.js site\/src\//);
 assert.ok(!cal.includes('new Date('),'calendar must not use wall clock');
});
