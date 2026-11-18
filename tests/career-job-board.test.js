import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold} from '../src/household.js';
import {CAREER_CATALOG} from '../src/career-catalog.js';
import {careerVacancies,acceptCareerOffer,leaveCareer,describeCareerShift,clockLabel,calendarCareerShifts}
  from '../src/career-job-board.js';
import {nextCareerShift} from '../src/career-scheduler.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const fresh=()=>newHousehold('2026-11-17');
test('W1-B.2a: phone shows six real professions with actual catalog rate and schedule',()=>{
  const game=fresh();
  const before=JSON.stringify(game);
  const list=careerVacancies(game,'alex');
  assert.equal(list.length,6);
  assert.deepEqual(list.map(x=>x.id),CAREER_CATALOG.map(x=>x.id));
  for(const offer of list){
    const def=CAREER_CATALOG.find(x=>x.id===offer.id);
    assert.equal(offer.rank,def.ranks[0].title);
    assert.equal(offer.hourlyCredits,def.ranks[0].hourlyCredits);
    assert.equal(offer.shiftCredits,def.ranks[0].hourlyCredits*def.schedule.duration/60);
    assert.equal(offer.workdays.split(' · ').length,def.schedule.weekdays.length);
    assert.equal(offer.hours,clockLabel(def.schedule.startMinute)+'–'+clockLabel(def.schedule.startMinute+def.schedule.duration));
    assert.ok(offer.nextShift);
    assert.equal(offer.firstShiftLabel,describeCareerShift(offer.nextShift));
  }
  assert.equal(JSON.stringify(game),before,'Browsing vacancies must not mutate saved game');
});
test('W1-B.2a: signing a real offer is separate, explicit and idempotent',()=>{
  const game=fresh(),old=JSON.stringify(game);
  const preview=careerVacancies(game,'alex').find(x=>x.id==='editorial');
  assert.ok(preview);
  assert.equal(JSON.stringify(game),old,'Preview must not sign a contract');
  const offered=acceptCareerOffer(game,'alex','editorial');
  assert.equal(offered.ok,true);
  assert.equal(JSON.stringify(game),old,'Pure transition must not mutate the root');
  game.careerSystem=offered.careerSystem;
  const contract=game.careerSystem.byResident.alex;
  assert.equal(contract.careerId,'editorial');
  assert.equal(contract.residentId,'alex');
  assert.deepEqual(offered.shift,nextCareerShift(game.calendar,contract,game.minutes));
  assert.equal(careerVacancies(game,'alex').length,0,'No additional jobs without resigning');
  assert.equal(acceptCareerOffer(game,'alex','city-services').ok,false,'Cannot double-hire');
  assert.equal(game.careerSystem.byResident.mira,null);
  assert.equal(game.shop.credits,5000,'No fictional wages');
});
test('W1-B.2a: Mira can hire independently; quitting does not touch partner or possessions',()=>{
  const game=fresh();
  game.careerSystem=acceptCareerOffer(game,'alex','kitchen-studio').careerSystem;
  game.careerSystem=acceptCareerOffer(game,'mira','civic-service').careerSystem;
  const alex=JSON.stringify(game.careerSystem.byResident.alex);
  const shop=JSON.stringify(game.shop),world=JSON.stringify(game.world);
  const first=game.careerSystem.byResident.mira.employmentId;
  const resigned=leaveCareer(game,'mira');
  assert.equal(resigned.ok,true);
  game.careerSystem=resigned.careerSystem;
  assert.equal(JSON.stringify(game.careerSystem.byResident.alex),alex);
  assert.equal(game.careerSystem.byResident.mira,null);
  assert.equal(leaveCareer(game,'mira').ok,false);
  const second=acceptCareerOffer(game,'mira','art-studio');
  assert.equal(second.ok,true);
  assert.notEqual(second.contract.employmentId,first);
  assert.equal(JSON.stringify(game.shop),shop);
  assert.equal(JSON.stringify(game.world),world);
});
test('W1-B.2a: restore preserves real contract and the real next-shift schedule',()=>{
  const game=fresh();
  game.minutes=2880+12*60;
  game.careerSystem=acceptCareerOffer(game,'mira','civic-service').careerSystem;
  const next=nextCareerShift(game.calendar,game.careerSystem.byResident.mira,game.minutes);
  const restored=loadHousehold(JSON.parse(JSON.stringify(game)),'2035-01-01');
  assert.equal(restored.careerSystem.byResident.mira.careerId,'civic-service');
  assert.deepEqual(nextCareerShift(restored.calendar,restored.careerSystem.byResident.mira,restored.minutes),next);
  assert.equal(restored.minutes,game.minutes);
});
test('W1-B.2a: legacy no-career save stays playable and uses the same v1 key',()=>{
  const game=fresh();
  const legacy=JSON.parse(JSON.stringify(game));
  delete legacy.careerSystem;
  legacy.shop.credits=4321;
  const next=loadHousehold(legacy,'2030-01-01');
  assert.equal(next.careerSystem.byResident.alex,null);
  assert.equal(next.careerSystem.byResident.mira,null);
  assert.equal(next.shop.credits,4321);
  assert.equal(next.version,1);
  assert.equal(acceptCareerOffer(next,'mira','art-studio').ok,true);
});
test('W1-B.2a: invalid actors/contracts are rejected without altering state',()=>{
  const game=fresh(),before=JSON.stringify(game);
  assert.equal(acceptCareerOffer(game,'hacker','art-studio').ok,false);
  assert.equal(acceptCareerOffer(game,'alex','not-a-career').ok,false);
  assert.equal(leaveCareer(game,'alex').ok,false);
  assert.deepEqual(careerVacancies(game,'hacker'),[]);
  assert.equal(JSON.stringify(game),before);
});
test('W1-B.2a: cross-midnight work is previewed with the real calendar date',()=>{
  const game=fresh();
  const offer=careerVacancies(game,'mira').find(x=>x.id==='civic-service');
  assert.equal(offer.hours,'20:00–04:00');
  assert.equal(offer.nextShift.end-offer.nextShift.start,480);
  assert.match(offer.firstShiftLabel,/20:00–04:00/);
  assert.equal(clockLabel(1440),'00:00');
});
test('W1-B.2a: source and deploy graph include accessible phone, not fake paycheck or second clock',()=>{
  const index=read('index.html'),game=read('src/game.js'),ui=read('src/career-phone-ui.js'),
    css=read('styles.css'),workflow=read('.github/workflows/pages.yml');
  assert.match(index,/id="career-phone-toggle"/);
  assert.match(game,/createCareerPhoneUI/);
  assert.match(game,/phoneMeshes\[id\]/);
  assert.match(game,/careerPhone\.close/);
  assert.match(ui,/aria-modal/);
  assert.match(ui,/aria-expanded/);
  assert.match(ui,/Одна смена: /);
  assert.match(ui,/Зарплата начисляется/);
  assert.match(ui,/Подписать договор/);
  assert.match(ui,/window\.confirm/);
  assert.match(css,/career-phone-body.*?overflow-y:auto/s);
  assert.match(workflow,/node --check src\/career-job-board\.js/);
  assert.match(workflow,/node --check src\/career-phone-ui\.js/);
  assert.match(workflow,/cp src\/career-catalog\.js src\/career-scheduler\.js src\/career-state\.js src\/career-job-board\.js src\/career-phone-ui\.js src\/career-shift-summary-ui\.js site\/src\//);
});

test('W1-B.2a: shifts appear as read-only calendar projections, not duplicate personal events',()=>{
 const game=fresh(),oldEvents=JSON.stringify(game.calendar.events||[]);
 game.careerSystem=acceptCareerOffer(game,'alex','editorial').careerSystem;
 const next=nextCareerShift(game.calendar,game.careerSystem.byResident.alex,game.minutes);
 const entries=calendarCareerShifts(game,next.iso,next.iso);
 assert.equal(entries.length,1);
 assert.equal(entries[0].id,next.id);
 assert.equal(entries[0].careerId,'editorial');
 assert.equal(entries[0].residentId,'alex');
 assert.equal(entries[0].iso,next.iso);
 assert.equal(entries[0].start,next.start%1440);
 assert.equal(entries[0].end,next.end%1440);
 assert.equal(entries[0].work,true);
 assert.equal(JSON.stringify(game.calendar.events||[]),oldEvents);
 game.careerSystem=leaveCareer(game,'alex').careerSystem;
 assert.deepEqual(calendarCareerShifts(game,next.iso,next.iso),[]);
 assert.equal(JSON.stringify(game.calendar.events||[]),oldEvents);
});
test('W1-B.2a: calendar renders both persons read-only, after refresh and independent of old events',()=>{
 const game=fresh();
 game.careerSystem=acceptCareerOffer(game,'alex','art-studio').careerSystem;
 game.careerSystem=acceptCareerOffer(game,'mira','editorial').careerSystem;
 const work=calendarCareerShifts(game,'2026-11-17','2026-11-25');
 assert.ok(work.some(x=>x.residentId==='alex'));
 assert.ok(work.some(x=>x.residentId==='mira'));
 assert.ok(work.every(x=>x.work&&x.id&&x.title));
 assert.deepEqual(calendarCareerShifts(game,'1900-01-01','1900-01-04'),[]);
 assert.deepEqual(calendarCareerShifts(game,'2026-11-17','2027-11-17'),[],'Bound lookahead');
 const ui=read('src/calendar-ui.js');
 assert.match(ui,/calendarCareerShifts\(root,from,to\)/);
 assert.match(ui,/lc-readonly/);
 assert.match(ui,/▣ Работа:/);
 assert.match(read('index.html'),/calendar-ui\.js\?v=w1a4-20261117-w1b2a/);
 assert.match(read('src/game.js'),/calendarUI\.refresh\(\)/);
});
