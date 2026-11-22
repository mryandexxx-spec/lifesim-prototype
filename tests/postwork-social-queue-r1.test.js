import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold,tickHousehold,residentAutonomousChoice,
  chooseResidentAction} from '../src/household.js';
import {hireCareer} from '../src/career-state.js';
import {arriveCareerPortal,finishCareerReturn,residentUnavailableForHome}
  from '../src/career-work.js';
import {enqueueAction,pendingActions,dispatchActionQueues}
  from '../src/action-queue.js';
import {startSocial,cancelSocial} from '../src/relationships.js';

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

test('after a paid shift, partner FIFO social intent survives reload, drains once, and autonomy resumes',()=>{
  let root=newHousehold('2026-11-16');
  const initial=root.shop.credits;
  root.careerSystem=hireCareer(root.careerSystem,'alex','editorial',root.minutes);
  tickHousehold(root,60);
  assert.equal(arriveCareerPortal(root,'alex',root.minutes),true);
  const events=tickHousehold(root,480);
  assert.ok(events.some(x=>x.type==='salary'&&x.residentId==='alex'));
  assert.equal(root.shop.credits,initial+112);
  assert.equal(residentUnavailableForHome(root,'alex'),true);
  const queued=enqueueAction(root.actionQueues,'mira',
    {type:'social',targetId:'alex',actionId:'talk'});
  assert.ok(queued,'Mira may keep a manual invitation while Alex is away');
  const dispatch=()=>dispatchActionQueues(root.actionQueues,{
    canStart:(_,cmd)=>!residentUnavailableForHome(root,'alex')&&
      !residentUnavailableForHome(root,'mira')&&!root.socialAction,
    start:(_,cmd)=>startSocial(root,cmd.actionId,'mira',{x:-.2,z:1.85},false)
  });
  assert.equal(dispatch().length,0,'waiting work state must not discard queued intent');
  root=loadHousehold(structuredClone(root));
  assert.equal(pendingActions(root.actionQueues,'mira').length,1);
  assert.equal(finishCareerReturn(root,'alex'),true);
  assert.equal(residentUnavailableForHome(root,'alex'),false);
  assert.equal(dispatch().length,1);
  assert.equal(pendingActions(root.actionQueues,'mira').length,0);
  assert.equal(root.socialAction.initiator,'mira');
  assert.equal(cancelSocial(root),true);
  root.otherSim.autonomy.nextAt=0;
  root.otherSim.needs.hunger=5;
  assert.ok(residentAutonomousChoice(root,'mira'),
    'other resident has independent autonomy after social lock is released');
  assert.equal(chooseResidentAction(root,'fridge',false,'mira')!==false,true);
  assert.equal(root.shop.credits,initial+112,'no duplicate salary on home arrival');
  assert.equal(finishCareerReturn(root,'alex'),false,'reentry is idempotent');
});
