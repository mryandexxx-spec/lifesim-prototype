/** CAS-01.6: additional saved adults use the original career/shift/wallet pipeline. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {SAVE_KEY,newGame} from '../src/simulation.js';
import {newHousehold,loadHousehold,tickHousehold,setHouseholdAutonomy,getActor} from '../src/household.js';
import {acceptCareerOffer,careerVacancies,calendarCareerShifts} from '../src/career-job-board.js';
import {nextCareerShift} from '../src/career-scheduler.js';
import {residentWorkStatus,residentAwayAtWork,skipCareerShift} from '../src/career-work.js';
import {enqueueAction,pendingActions} from '../src/action-queue.js';
import {careerResidentIds} from '../src/career-state.js';
import {recordFinanceChange} from '../src/finance-ledger.js';

const copy=x=>JSON.parse(JSON.stringify(x));
const extra=(id,name)=>{
  const actor=newGame();actor.personality.name=name;
  return {id,identity:{firstName:name,lastName:'Тестовый',lifeStage:'adult'},actor};
};
function household({remote=false}={}){
  const base=newHousehold();
  base.population={schema:1,nextResidentSerial:5,
    residentsById:{resident_3:extra('resident_3','Вера'),
      resident_4:extra('resident_4','Игорь')},
    linksByResident:{
      alex:{familyId:'family_1',dwellingId:'dwelling_1'},
      mira:{familyId:'family_1',dwellingId:'dwelling_1'},
      resident_3:{familyId:'family_2',dwellingId:'dwelling_1'},
      resident_4:{familyId:'family_3',dwellingId:remote?'dwelling_2':'dwelling_1'}},
    kinship:[]};
  const root=loadHousehold(copy(base));
  setHouseholdAutonomy(root,false);
  return root;
}
function employ(root,id,careerId='business-center'){
  const offer=acceptCareerOffer(root,id,careerId);
  assert.equal(offer.ok,true,offer.reason);
  root.careerSystem=offer.careerSystem;
  return offer.contract;
}
function nextShift(root,id){
  return nextCareerShift(root.calendar,root.careerSystem.byResident[id],root.minutes);
}
function advanceToShift(root,shift){
  root.minutes=shift.start-5;
  root.otherSim.minutes=root.minutes;
  tickHousehold(root,10);
  assert.equal(root.careerSystem.byResident[shift.residentId].currentShift?.phase,'working');
  assert.equal(residentAwayAtWork(root,shift.residentId),true);
}

test('CAS-01.6 migrates legacy root v1 and keeps unauthorised careers out',()=>{
  const legacy=copy(newHousehold());
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  const restored=loadHousehold(legacy);
  assert.equal(restored.version,1);
  assert.deepEqual(careerResidentIds(restored.careerSystem),['alex','mira']);
  assert.equal(restored.population,undefined);
  assert.equal(acceptCareerOffer(restored,'resident_3','editorial').ok,false);
  legacy.careerSystem.byResident.resident_3={residentId:'resident_3',employmentId:'e200',
    careerId:'editorial',hiredAt:0,level:0,status:'employed'};
  assert.equal(loadHousehold(legacy).careerSystem.byResident.resident_3,undefined);
});

test('CAS-01.6 permits only saved co-dwelling adults, with separate contracts and approved rank schedules',()=>{
  const root=household({remote:true});
  assert.deepEqual(careerResidentIds(root.careerSystem),
    ['alex','mira','resident_3','resident_4']);
  assert.equal(careerVacancies(root,'resident_3').length,6);
  assert.deepEqual(careerVacancies(root,'resident_4'),[]);
  assert.equal(acceptCareerOffer(root,'resident_4','editorial').ok,false);
  const first=employ(root,'resident_3','editorial');
  const second=employ(root,'mira','city-services');
  assert.notEqual(first.employmentId,second.employmentId);
  assert.equal(first.shiftSchedule.schema,1);
  assert.equal(first.residentId,'resident_3');
  const shift=nextShift(root,'resident_3');
  assert.ok(shift&&shift.id.startsWith(first.employmentId+'@'));
  assert.ok(calendarCareerShifts(root,shift.iso,shift.iso)
    .some(row=>row.residentId==='resident_3'));
  assert.ok(!calendarCareerShifts(root,shift.iso,shift.iso)
    .some(row=>row.residentId==='resident_4'));
});

test('CAS-01.6 extra salary is a single canonical journal payment after real end; resume cannot pay twice',()=>{
  let root=household();
  employ(root,'resident_3');
  const shift=nextShift(root,'resident_3');
  const initial=root.shop.credits;
  advanceToShift(root,shift);
  assert.equal(root.shop.credits,initial,'no payment at shift arrival');
  assert.equal(residentWorkStatus(root,'resident_3').phase,'working');
  assert.equal(getActor(root,'resident_3').action,null);
  const beforeNeeds=getActor(root,'resident_3').needs.energy;
  tickHousehold(root,shift.end-root.minutes-1);
  assert.equal(root.shop.credits,initial,'no early credit');
  assert.ok(getActor(root,'resident_3').needs.energy<beforeNeeds);
  root=loadHousehold(copy(root));
  assert.equal(root.careerSystem.byResident.resident_3.currentShift.phase,'working');
  tickHousehold(root,1);
  const contract=root.careerSystem.byResident.resident_3;
  const salary=contract.lastShift.salary;
  assert.ok(salary>0);
  assert.equal(root.shop.credits,initial+salary);
  assert.equal(root.careerSystem.settlementIds.filter(id=>id===shift.id).length,1);
  assert.equal(root.financialHistory.entries.filter(e=>
    e.kind==='salary'&&e.sourceId===shift.id&&e.actorId==='resident_3').length,1);
  const settled=copy(root);
  tickHousehold(root,2);
  tickHousehold(root,2);
  assert.equal(root.shop.credits,initial+salary);
  const reloaded=loadHousehold(settled);
  tickHousehold(reloaded,3);
  assert.equal(reloaded.shop.credits,initial+salary);
  assert.equal(reloaded.financialHistory.entries.filter(e=>e.sourceId===shift.id).length,1);
});

test('CAS-01.6 two simultaneous extras earn two different receipts in one wallet, never duplicate',()=>{
  const root=household();
  employ(root,'resident_3','business-center');
  employ(root,'resident_4','business-center');
  const s3=nextShift(root,'resident_3'),s4=nextShift(root,'resident_4');
  assert.equal(s3.start,s4.start);
  assert.notEqual(s3.id,s4.id);
  const initial=root.shop.credits;
  root.minutes=s3.start-5;root.otherSim.minutes=root.minutes;
  tickHousehold(root,s3.end-root.minutes);
  const a=root.careerSystem.byResident.resident_3.lastShift;
  const b=root.careerSystem.byResident.resident_4.lastShift;
  assert.equal(a?.outcome,'worked');
  assert.equal(b?.outcome,'worked');
  assert.ok(a.salary>0&&b.salary>0);
  assert.equal(root.shop.credits,initial+a.salary+b.salary);
  const payments=root.financialHistory.entries.filter(e=>e.kind==='salary');
  assert.equal(payments.length,2);
  assert.deepEqual(new Set(payments.map(e=>e.actorId)),new Set(['resident_3','resident_4']));
  assert.deepEqual(new Set(payments.map(e=>e.sourceId)),new Set([s3.id,s4.id]));
  tickHousehold(root,10);
  assert.equal(root.shop.credits,initial+a.salary+b.salary);
});

test('CAS-01.6 away extra does not use furniture or drain home needs, queued manual FIFO resumes after work',()=>{
  const root=household();
  employ(root,'resident_3');
  const shift=nextShift(root,'resident_3');
  const actor=getActor(root,'resident_3');
  assert.ok(enqueueAction(root.actionQueues,'resident_3',
    {type:'move',x:actor.position.x,z:actor.position.z}));
  advanceToShift(root,shift);
  assert.equal(pendingActions(root.actionQueues,'resident_3').length,1);
  assert.equal(actor.action,null);
  assert.equal(residentAwayAtWork(root,'resident_3'),true);
  const energy=actor.needs.energy;
  tickHousehold(root,30);
  assert.ok(actor.needs.energy<energy,'work needs still apply');
  assert.equal(actor.action,null,'home FIFO never dispatches while away');
  assert.equal(pendingActions(root.actionQueues,'resident_3').length,1);
});

test('CAS-01.6 missed extra shift and absent dwelling never mint salary',()=>{
  const root=household({remote:true});
  employ(root,'resident_3','business-center');
  const contract=root.careerSystem.byResident.resident_3;
  const shift=nextShift(root,'resident_3');
  root.minutes=shift.start-5;
  root.otherSim.minutes=root.minutes;
  assert.ok(skipCareerShift(root,'resident_3')===false);
  tickHousehold(root,1);
  assert.equal(contract.currentShift?.phase,'waiting');
  const credits=root.shop.credits;
  assert.equal(skipCareerShift(root,'resident_3'),false);
  const remoteCareer=root.careerSystem.byResident.resident_4;
  assert.equal(remoteCareer,null);
  tickHousehold(root,10);
  assert.equal(root.shop.credits,credits);
  assert.equal(residentWorkStatus(root,'resident_3').phase,'working');
});

test('CAS-01.6 rejected unsaved actor cannot forge a financial salary transaction',()=>{
  const root=household();
  const before=copy(root.financialHistory);
  const result=recordFinanceChange(root,{...root.shop,credits:root.shop.credits+50},
    {kind:'salary',sourceId:'fake',actorId:'resident_99',receiptId:'salary:fake',atGameMinute:root.minutes});
  assert.equal(result.ok,false);
  assert.deepEqual(root.financialHistory,before);
});
