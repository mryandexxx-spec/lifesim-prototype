import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold,tickHousehold,residentAutonomousChoice,
  chooseResidentAction,setHouseholdAutonomy,getActor} from '../src/household.js';
import {newGame} from '../src/simulation.js';
import {queueAddressedConversation} from '../src/resident-social-runtime.js';
import {hireCareer} from '../src/career-state.js';
import {arriveCareerPortal,finishCareerReturn,residentUnavailableForHome,requestCareerDeparture,
  socialCommandBlockedByWork,cancelUnavailableSocialCommands}
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
  const graphSeq=root.socialGraph.nextSeq;
  const messages=tickHousehold(root,60);
  assert.equal(residentUnavailableForHome(root,'alex'),true);
  assert.deepEqual(pendingActions(root.actionQueues,'mira').map(x=>x.seq),[food.seq]);
  assert.deepEqual(pendingActions(root.actionQueues,'alex').map(x=>x.seq),[shower.seq]);
  assert.equal(root.socialGraph.nextSeq,graphSeq);
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


test('PF-11 all four unavailable work phases invalidate only affected talk, topic and relationship commands once',()=>{
  const root=newHousehold('2026-11-16');
  root.careerSystem=hireCareer(root.careerSystem,'alex','editorial',root.minutes);
  tickHousehold(root,1);
  const shift=root.careerSystem.byResident.alex.currentShift;
  assert.equal(shift.phase,'pending');
  for(const phase of ['departing','waiting','working','returning']){
    shift.phase='pending';
    const tasks=[
      enqueueAction(root.actionQueues,'mira',{type:'conversation',targetId:'alex',topicId:'daily'}),
      enqueueAction(root.actionQueues,'mira',{type:'social',targetId:'alex',actionId:'argue'}),
      enqueueAction(root.actionQueues,'alex',{type:'branch',targetId:'mira',actionId:'acquaint.introduce'})
    ];
    const food=enqueueAction(root.actionQueues,'mira',{type:'object',actionId:'fridge'});
    assert.ok(tasks.every(Boolean)&&food);
    assert.equal(socialCommandBlockedByWork(root,'mira',tasks[0]),false);
    assert.deepEqual(cancelUnavailableSocialCommands(root),[]);
    const seq=root.actionQueues.nextSeq,graph=root.socialGraph.nextSeq;
    shift.phase=phase;
    assert.equal(socialCommandBlockedByWork(root,'mira',tasks[0]),true);
    assert.equal(socialCommandBlockedByWork(root,'mira',food),false);
    const messages=cancelUnavailableSocialCommands(root);
    assert.equal(messages.reduce((n,event)=>n+event.count,0),3);
    assert.deepEqual(cancelUnavailableSocialCommands(root),[]);
    assert.deepEqual(pendingActions(root.actionQueues,'mira').map(x=>x.seq),[food.seq]);
    assert.equal(pendingActions(root.actionQueues,'alex').length,0);
    assert.equal(root.socialGraph.nextSeq,graph);
    assert.equal(root.actionQueues.nextSeq,seq);
    dispatchActionQueues(root.actionQueues,{canStart:()=>true,start:()=>true});
  }
});
test('PF-11 addressed invitations for an additional resident cancel on work departure, not other residents’ personal tasks',()=>{
  const raw=newHousehold('2026-11-16');
  const make=(id,firstName,x,z)=>{
    const actor=newGame();actor.position={x,z};
    return {id,identity:{firstName,lastName:'Тест',lifeStage:'adult'},actor};
  };
  raw.population={schema:1,nextResidentSerial:5,
    residentsById:{resident_3:make('resident_3','Вера',1.2,1.2),resident_4:make('resident_4','Игорь',2.1,1.2)},
    linksByResident:{alex:{familyId:'family_1',dwellingId:'dwelling_1'},mira:{familyId:'family_1',dwellingId:'dwelling_1'},
      resident_3:{familyId:'family_2',dwellingId:'dwelling_1'},resident_4:{familyId:'family_3',dwellingId:'dwelling_1'}},kinship:[]};
  const root=loadHousehold(structuredClone(raw));
  setHouseholdAutonomy(root,false);
  root.careerSystem=hireCareer(root.careerSystem,'resident_3','editorial',root.minutes);
  const invite=queueAddressedConversation(root,'resident_4','resident_3','daily');
  const own=queueAddressedConversation(root,'resident_3','mira','daily');
  const food=enqueueAction(root.actionQueues,'mira',{type:'object',actionId:'fridge'});
  assert.ok(invite&&own&&food);
  const graph=root.socialGraph.nextSeq;
  const messages=tickHousehold(root,60);
  assert.equal(residentUnavailableForHome(root,'resident_3'),true);
  assert.equal(pendingActions(root.actionQueues,'resident_4').length,0);
  assert.equal(pendingActions(root.actionQueues,'resident_3').length,0);
  assert.deepEqual(pendingActions(root.actionQueues,'mira').map(x=>x.seq),[food.seq]);
  assert.equal(queueAddressedConversation(root,'resident_4','resident_3','daily'),null);
  assert.equal(root.additionalSocial,null);
  assert.equal(root.socialGraph.nextSeq,graph);
  assert.equal(messages.filter(x=>x.type==='social-canceled').reduce((n,x)=>n+x.count,0),2);
  getActor(root,'resident_4').needs.hunger=5;
  assert.equal(pendingActions(root.actionQueues,'resident_4').length,0);
});
