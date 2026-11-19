/** W3-D: native mood integration, genuine shift receipts, honest family conflict. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {hireCareer} from '../src/career-state.js';
import {nextCareerShift} from '../src/career-scheduler.js';
import {progressCareerWork,requestCareerDeparture} from '../src/career-work.js';
import {newWorkLife,restoreWorkLife,jobSatisfaction,workMoodContext,
  workLifeConflict,noteWorkLifeConflict,recordWorkFeeling,recordWorkLifeShift,
  applyWorkMoodContext} from '../src/career-worklife.js';
import {resolveWorkLifeConflict} from '../src/career-worklife-conflict.js';
import {MEMORY_TEXT,calculateMood} from '../src/psychology.js';
import {visibleEmotions,EMOTION_SOURCES} from '../src/emotion-engine.js';
import {SAVE_KEY} from '../src/simulation.js';

const clone=x=>JSON.parse(JSON.stringify(x));
function prepared(id='alex'){
  const root=newHousehold('2026-11-16');
  root.autonomy.enabled=false;root.otherSim.autonomy.enabled=false;
  root.careerSystem=hireCareer(root.careerSystem,id,'editorial',root.minutes);
  const contract=root.careerSystem.byResident[id];
  const shift=nextCareerShift(root.calendar,contract,root.minutes);
  return {root,contract,shift,id};
}
const actor=(r,id)=>id==='mira'?r.otherSim:r;

test('W3-D: canonical typed emotion catalog, seven types, original root save key',()=>{
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  for(const key of ['worklife.success','worklife.hard','worklife.hardStrain',
    'worklife.dismissal','worklife.promotion','worklife.sharedInterrupted',
    'worklife.sharedDisappointed']){
    assert.ok(MEMORY_TEXT[key]);assert.ok(EMOTION_SOURCES[key]);
  }
});
test('W3-D: grade outcome, strain, once-only shift watermark and original one mood',()=>{
  const {root,contract,shift}=prepared();
  contract.lastShift={id:shift.id,start:shift.start,end:shift.end,
    outcome:'worked',salary:800,workedMinutes:480,lateMinutes:0,
    finishedAt:shift.end,grade:'удачный день',performanceDelta:10,
    workReport:{strain:30,meal:true,toilet:1,socialMinutes:15}};
  const baseline=root.mind.memories.length;
  assert.equal(recordWorkLifeShift(root,'alex',contract,shift,null),'worklife.exhaustedPride');
  assert.equal(contract.workLife.recentShifts.length,1);
  assert.equal(root.mind.memories.length,baseline+1);
  assert.equal(recordWorkLifeShift(root,'alex',contract,shift,null),null);
  assert.equal(root.mind.memories.length,baseline+1);
  root.minutes=shift.end;root.otherSim.minutes=shift.end;
  applyWorkMoodContext(root);
  assert.ok(visibleEmotions(root.mind,root.minutes,root.personality).some(e=>
    e.source==='worklife.exhaustedPride'));
  assert.ok(Number.isInteger(root.mind.mood.value));
});
test('W3-D: hard-grade warning priority and neutral shift no memory',()=>{
  const {root,contract,shift}=prepared();
  contract.lastShift={id:shift.id,start:shift.start,end:shift.end,
    outcome:'missed',salary:0,workedMinutes:0,lateMinutes:0,
    finishedAt:shift.end,grade:'пропуск',performanceDelta:-7};
  recordWorkLifeShift(root,'alex',contract,shift,{transition:'warning'});
  assert.equal(contract.workLife.lastFeeling,'worklife.warning');
  assert.equal(root.mind.memories.at(-1).id,'worklife.warning');
  const next={...shift,id:contract.employmentId+'@'+
    Math.floor((shift.start+1440)/1440)+'@'+(shift.start+1440),
    start:shift.start+1440,end:shift.end+1440};
  contract.lastShift={...contract.lastShift,id:next.id,start:next.start,
    end:next.end,finishedAt:next.end,outcome:'worked',grade:'обычная смена'};
  recordWorkLifeShift(root,'alex',contract,next,null);
  assert.equal(contract.workLife.recentShifts.length,2);
  assert.equal(contract.workLife.lastFeeling,null);
  assert.equal(root.mind.memories.length,1);
});
test('W3-D: satisfaction from last five, performance and W3-C warning bounds',()=>{
  const {contract}=prepared();
  assert.equal(jobSatisfaction(contract,480),53);
  contract.performance=100;
  contract.workLife.recentShifts=[0,1,2,3,4].map(n=>({
    id:contract.employmentId+'@'+n+'@'+(540+n*1440),start:540+n*1440,
    feeling:'worklife.success'}));
  assert.equal(jobSatisfaction(contract,480),75);
  assert.equal(workMoodContext(contract,480),5);
  contract.workLife.recentShifts.forEach(x=>x.feeling='worklife.missed');
  contract.performance=0;
  assert.equal(workMoodContext(contract,480),-5);
  assert.equal(jobSatisfaction(null,480),null);
});
test('W3-D: emotional caps apply only to work and preserve strong personal sadness',()=>{
  const root=newHousehold();
  const now=root.minutes;
  for(const key of ['worklife.dismissal','worklife.finalWarning','worklife.hardStrain']){
    recordWorkFeeling(root,'alex',key,now);
  }
  const low=calculateMood(root.needs,root.mind,now,root.personality);
  // Additional work effects cannot bypass -14 source cap.
  recordWorkFeeling(root,'alex','worklife.missed',now);
  const same=calculateMood(root.needs,root.mind,now,root.personality);
  assert.equal(low.value,same.value);
  const memory={id:'hurt',at:now,fulfilled:false};
  root.mind.memories.push(memory);
  const after=calculateMood(root.needs,root.mind,now,root.personality);
  assert.ok(after.value<same.value,'Family event remains independent of work cap');
});
test('W3-D: real manual action warning exactly once; still valid after restore',()=>{
  const {root,shift}=prepared();
  root.minutes=shift.start-14;root.otherSim.minutes=root.minutes;
  root.action={id:'sofa',phase:'using',elapsed:5,automatic:false};
  progressCareerWork(root,shift.start-61,root.minutes);
  assert.ok(workLifeConflict(root,'alex'));
  assert.equal(root.careerSystem.byResident.alex.workLife.conflictNotifiedShiftId,
    shift.id,'The 15-minute scheduled sweep already issued the single notice');
  assert.equal(noteWorkLifeConflict(root,'alex',root.minutes),false);
  const restored=loadHousehold(clone(root),'2026-11-16');
  assert.equal(restored.careerSystem.byResident.alex.workLife.conflictNotifiedShiftId,shift.id);
});
test('W3-D: finish preserves action; leave cancels only active one, not FIFO',()=>{
  const {root,shift}=prepared();
  root.minutes=shift.start-12;root.otherSim.minutes=root.minutes;
  root.action={id:'sofa',phase:'using',elapsed:5,automatic:false};
  root.actionQueues.byResident.alex=[{type:'object',actionId:'fridge'}];
  progressCareerWork(root,shift.start-61,root.minutes);
  const finished=resolveWorkLifeConflict(root,'alex','finish');
  assert.equal(finished.ok,true);
  assert.equal(root.action.id,'sofa');
  assert.equal(root.actionQueues.byResident.alex.length,1);
  assert.equal(resolveWorkLifeConflict(root,'alex','finish').ok,false);
  // Fresh scenario permits explicit leave with no silently erased FIFO.
  const second=prepared(),r=second.root;
  r.minutes=second.shift.start-12;r.otherSim.minutes=r.minutes;
  r.action={id:'sofa',phase:'using',elapsed:5,automatic:false};
  r.actionQueues.byResident.alex=[{type:'object',actionId:'fridge'}];
  progressCareerWork(r,second.shift.start-61,r.minutes);
  assert.equal(resolveWorkLifeConflict(r,'alex','leave').ok,true);
  assert.equal(r.action,null);
  assert.equal(r.careerSystem.byResident.alex.currentShift.phase,'departing');
  assert.equal(r.actionQueues.byResident.alex.length,1);
});
test('W3-D: legal unpaid time off only before shift; no work-life regret',()=>{
  const {root,shift}=prepared();
  root.minutes=shift.start-10;root.otherSim.minutes=root.minutes;
  root.action={id:'sofa',phase:'using',elapsed:0,automatic:false};
  progressCareerWork(root,shift.start-61,root.minutes);
  const outcome=resolveWorkLifeConflict(root,'alex','timeoff');
  assert.equal(outcome.ok,true);
  assert.equal(root.careerSystem.byResident.alex.timeOff.bookings.at(-1).type,'unpaid');
  assert.equal(root.mind.memories.length,0);
  assert.equal(root.action.id,'sofa');
});
test('W3-D: real manually interrupted shared leisure gives two memories, never affinity',()=>{
  const {root,shift}=prepared();
  root.minutes=shift.start-8;root.otherSim.minutes=root.minutes;
  progressCareerWork(root,shift.start-61,root.minutes);
  root.socialAction={kind:'talk',initiator:'alex',partner:'mira',
    phase:'using',elapsed:5,automatic:false,
    shared:{mode:'leisure',choiceId:'games'}};
  const relation=root.relationship.affinity;
  const result=resolveWorkLifeConflict(root,'alex','leave');
  assert.equal(result.ok,true);
  assert.equal(result.interruptedShared,true);
  assert.equal(root.socialAction,null);
  assert.equal(root.relationship.affinity,relation);
  assert.equal(root.mind.memories.at(-1).id,'worklife.sharedInterrupted');
  assert.equal(root.otherSim.mind.memories.at(-1).id,'worklife.sharedDisappointed');
});
test('W3-D: queued invite is not a family interruption; idle worker no conflict',()=>{
  const {root,shift}=prepared();
  root.minutes=shift.start-8;root.otherSim.minutes=root.minutes;
  progressCareerWork(root,shift.start-61,root.minutes);
  assert.equal(workLifeConflict(root,'alex'),null);
  root.socialAction={kind:'talk',initiator:'alex',partner:'mira',
    phase:'walking',elapsed:0,automatic:false,
    shared:{mode:'leisure',choiceId:'games'}};
  const result=resolveWorkLifeConflict(root,'alex','leave');
  assert.equal(result.ok,true);
  assert.equal(result.interruptedShared,false);
  assert.equal(root.mind.memories.length,0);
  assert.equal(root.otherSim.mind.memories.length,0);
});
test('W3-D: old contract restores clean optional fields with no retroactive emotion',()=>{
  const {root,contract,shift}=prepared();
  contract.lastShift={id:shift.id,start:shift.start,end:shift.end,
    outcome:'worked',salary:1,workedMinutes:450,lateMinutes:0,
    finishedAt:shift.end,grade:'обычная смена',performanceDelta:5};
  delete contract.workLife;
  root.minutes=shift.end+10;root.otherSim.minutes=root.minutes;
  const before=root.shop.credits,copy=clone(root);
  const loaded=loadHousehold(copy,'2026-11-16');
  assert.equal(loaded.careerSystem.byResident.alex.workLife.lastProcessedShiftStart,
    shift.start);
  assert.equal(loaded.mind.memories.length,0);
  assert.equal(loaded.shop.credits,before);
  assert.equal(loaded.version,1);
  const restored=restoreWorkLife({recentShifts:[{id:'evil',start:0,
    feeling:'worklife.success'}],lastProcessedShiftStart:1e50},
    contract.employmentId,contract.lastShift);
  assert.deepEqual(restored.recentShifts,[]);
  assert.equal(restored.lastProcessedShiftStart,shift.start);
});
test('W3-D: independent resident state, no ghost household mood or receipts',()=>{
  const {root,shift}=prepared('mira');
  const contract=root.careerSystem.byResident.mira;
  contract.lastShift={id:shift.id,start:shift.start,end:shift.end,
    outcome:'worked',salary:10,workedMinutes:400,lateMinutes:0,
    finishedAt:shift.end,grade:'удачный день',performanceDelta:8};
  assert.equal(recordWorkLifeShift(root,'mira',contract,shift,null),'worklife.success');
  assert.equal(root.mind.memories.length,0);
  assert.equal(root.otherSim.mind.memories.at(-1).id,'worklife.success');
});
