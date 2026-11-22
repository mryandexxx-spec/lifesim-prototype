import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold} from '../src/household.js';
import {hireCareer} from '../src/career-state.js';
import {nextCareerShift} from '../src/career-scheduler.js';
import {enqueueAction,pendingActions} from '../src/action-queue.js';
import {careerDepartureLeadMinutes,progressCareerWork,arriveCareerPortal,
  residentAwayAtWork,residentWorkStatus} from '../src/career-work.js';

function worker(careerId='business-center'){
  const root=newHousehold('2026-11-16');
  root.careerSystem=hireCareer(root.careerSystem,'alex',careerId,root.minutes,{rankSchedules:true});
  const contract=root.careerSystem.byResident.alex;
  const planned=nextCareerShift(root.calendar,contract,root.minutes-.001);
  assert.ok(planned,careerId+' Monday shift');
  return {root,contract,planned};
}
test('early work route lead has safe bounded route + travel buffer',()=>{
  const {root}=worker();
  assert.ok(careerDepartureLeadMinutes(root,'alex')>=20);
  assert.ok(careerDepartureLeadMinutes(root,'alex')<=60);
  assert.equal(careerDepartureLeadMinutes(root,'not-a-person'),60);
});
test('automatic worker departs ahead of start, arrives early and waits without wages',()=>{
  const {root,contract,planned}=worker();
  const lead=careerDepartureLeadMinutes(root,'alex');
  const before=planned.start-lead-1;
  root.minutes=before;
  progressCareerWork(root,before,planned.start-lead+.01);
  assert.equal(contract.currentShift?.phase,'departing');
  const arrival=planned.start-10;
  assert.equal(arriveCareerPortal(root,'alex',arrival),true);
  assert.equal(contract.currentShift.phase,'waiting');
  assert.equal(residentAwayAtWork(root,'alex'),true);
  assert.equal(contract.currentShift.departedAt,arrival);
  assert.match(residentWorkStatus(root,'alex').label,/Ожидает начала/);
  assert.equal(contract.lastShift??null,null);
  assert.equal(arriveCareerPortal(root,'alex',arrival),false);
  root.minutes=planned.start-1;
  progressCareerWork(root,planned.start-1,planned.start);
  assert.equal(contract.currentShift.phase,'working');
  assert.equal(contract.currentShift.departedAt,planned.start);
  assert.equal(contract.lastShift??null,null);
});
test('manual ordinary work is safely deferred into original FIFO before departure',()=>{
  const {root,contract,planned}=worker();
  root.minutes=planned.start-50;
  const queued=enqueueAction(root.actionQueues,'alex',{type:'object',actionId:'mirror',targetInstanceId:'home-mirror-1'});
  assert.ok(queued);
  root.action={id:'tv',phase:'using',elapsed:6,automatic:false,targetInstanceId:'home-tv-1',tvTalk:true};
  const lead=careerDepartureLeadMinutes(root,'alex');
  progressCareerWork(root,planned.start-lead-.01,planned.start-lead+.01);
  assert.equal(contract.currentShift.phase,'departing');
  assert.equal(root.action,null);
  const tasks=pendingActions(root.actionQueues,'alex');
  assert.equal(tasks.length,2);
  assert.equal(tasks[0].actionId,'mirror');
  assert.equal(tasks[1].actionId,'tv');
  assert.equal(tasks[1].tvTalk,true);
});
test('early waiting phase is root-v1 saved, sanitized and resumed without paying early',()=>{
  const {root,contract,planned}=worker('city-services');
  root.minutes=planned.start-20;
  progressCareerWork(root,planned.start-60,planned.start-20);
  assert.equal(contract.currentShift.phase,'departing');
  assert.equal(arriveCareerPortal(root,'alex',planned.start-15),true);
  const restored=loadHousehold(JSON.parse(JSON.stringify(root)),'2026-11-16');
  const shift=restored.careerSystem.byResident.alex.currentShift;
  assert.ok(shift);
  assert.equal(shift.phase,'waiting');
  assert.equal(shift.departedAt,planned.start-15);
  assert.equal(restored.shop.credits,root.shop.credits);
  assert.equal(restored.version,1);
});
