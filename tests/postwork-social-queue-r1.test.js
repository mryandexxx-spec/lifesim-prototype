import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold,tickHousehold,residentAutonomousChoice,
  chooseResidentAction} from '../src/household.js';
import {hireCareer} from '../src/career-state.js';
import {arriveCareerPortal,finishCareerReturn,residentUnavailableForHome,requestCareerDeparture}
  from '../src/career-work.js';
import {enqueueAction,pendingActions,dispatchActionQueues}
  from '../src/action-queue.js';

test('post-work return is handled BEFORE exit-animation gates and salary summary defers reentry',()=>{
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const routeLoop=game.indexOf('// Run two independent route followers');
  const returning=game.indexOf("if(work?.phase==='returning')",routeLoop);
  const exitGate=game.indexOf('if(sofaStates[residentId].progress>0',routeLoop);
  assert.ok(routeLoop>0&&returning>routeLoop&&exitGate>returning,
    'a stale sofa/bed/shower/WC/fridge transition cannot postpone career reentry');
  const reentry=game.slice(returning,exitGate);
  for(const expected of ['finishCareerReturn(game,residentId)',
    'createSofaTransition()', 'createBedTransition()',
    'createShowerTransition()', 'createToiletTransition()',
    'fridgeLeaving[residentId]=false','save(true)']){
    assert.ok(reentry.includes(expected),expected+' must be reset in work return');
  }
  assert.match(game,/shouldDefer:[\s\S]{0,240}residentWorkPhase\(game,id\)==='returning'/,
    'work result must not freeze the scene while a resident is still returning');
});

test('PF-11 automatic work departure cancels obsolete conversations anywhere in FIFO; other tasks and payroll survive',()=>{
  let root=newHousehold('2026-11-16');
  const initial=root.shop.credits;
  root.careerSystem=hireCareer(root.careerSystem,'alex','editorial',root.minutes);
  const first=enqueueAction(root.actionQueues,'mira',{type:'social',targetId:'alex',actionId:'talk'});
  const food=enqueueAction(root.actionQueues,'mira',{type:'object',actionId:'fridge'});
  const later=enqueueAction(root.actionQueues,'mira',{type:'conversation',targetId:'alex',topicId:'daily'});
  const own=enqueueAction(root.actionQueues,'alex',{type:'conversation',targetId:'mira',topicId:'daily'});
  const shower=enqueueAction(root.actionQueues,'alex',{type:'object',actionId:'shower'});
  assert.ok(first&&food&&later&&own&&shower);
  const graph=structuredClone(root.socialGraph);
  const messages=tickHousehold(root,60);
  assert.equal(residentUnavailableForHome(root,'alex'),true);
  assert.deepEqual(pendingActions(root.actionQueues,'mira').map(x=>x.seq),[food.seq]);
  assert.deepEqual(pendingActions(root.actionQueues,'alex').map(x=>x.seq),[shower.seq]);
  assert.deepEqual(root.socialGraph,graph);
  assert.ok(messages.some(x=>x.type==='social-canceled'));
  assert.equal(arriveCareerPortal(root,'alex',root.minutes),true);
  const events=tickHousehold(root,480);
  assert.ok(events.some(x=>x.type==='salary'&&x.residentId==='alex'));
  assert.equal(root.shop.credits,initial+112);
  // Simulate a stale older v1 save containing an invitation to someone away.
  assert.ok(enqueueAction(root.actionQueues,'mira',{type:'social',targetId:'alex',actionId:'talk'}));
  root=loadHousehold(structuredClone(root));
  assert.deepEqual(pendingActions(root.actionQueues,'mira').map(x=>x.seq),[food.seq]);
  assert.equal(finishCareerReturn(root,'alex'),true);
  const started=dispatchActionQueues(root.actionQueues,{
    canStart:id=>id==='mira',
    start:(_,cmd)=>cmd.actionId==='fridge'
  });
  assert.equal(started.length,1);
  assert.equal(pendingActions(root.actionQueues,'mira').length,0);
  root.otherSim.autonomy.nextAt=0;
  root.otherSim.needs.hunger=5;
  assert.ok(residentAutonomousChoice(root,'mira'));
  assert.equal(chooseResidentAction(root,'fridge',false,'mira')!==false,true);
  assert.equal(root.shop.credits,initial+112);
  assert.equal(finishCareerReturn(root,'alex'),false);
});

test('PF-11 a pending shift or busy person at home is not grounds for cancellation; manual departure is',()=>{
  const root=newHousehold('2026-11-16');
  root.careerSystem=hireCareer(root.careerSystem,'alex','editorial',root.minutes);
  const invite=enqueueAction(root.actionQueues,'mira',{type:'conversation',targetId:'alex',topicId:'daily'});
  // Prepare a valid pending shift without crossing automatic departure threshold.
  tickHousehold(root,1);
  const shift=root.careerSystem.byResident.alex.currentShift;
  assert.ok(shift);
  assert.equal(shift.phase,'pending');
  assert.equal(pendingActions(root.actionQueues,'mira')[0]?.seq,invite.seq);
  assert.equal(requestCareerDeparture(root,'alex',shift.start-60).ok,true);
  assert.equal(pendingActions(root.actionQueues,'mira').length,0);
});

