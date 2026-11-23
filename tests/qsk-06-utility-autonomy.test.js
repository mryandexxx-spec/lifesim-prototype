import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,evaluateAutonomy,autonomousChoice,SAVE_KEY} from '../src/simulation.js';
import {createProfile} from '../src/trait-catalog.js';
import {newHousehold,loadHousehold,tickHousehold,getActor} from '../src/household.js';
import {resolveActionFurniture,furnitureActionApproach} from '../src/furniture-catalog.js';
import {pendingActions,enqueueAction} from '../src/action-queue.js';
import {explainAdditionalResidentAutonomy} from '../src/resident-activity-runtime.js';

const copy=value=>JSON.parse(JSON.stringify(value));
const healthy=state=>{
  for(const key of ['hunger','energy','hygiene','fun','bladder'])state.needs[key]=95;
  state.needs.social=90;
};
function oneExtra(){
  const root=newHousehold(),actor=newGame();
  actor.personality.name='Вера';
  actor.position={...furnitureActionApproach(root.world,'toilet')};
  root.population={schema:1,nextResidentSerial:4,
    residentsById:{resident_3:{
      id:'resident_3',
      identity:{firstName:'Вера',lastName:'Тестовая',lifeStage:'adult'},
      actor
    }},
    linksByResident:{
      alex:{familyId:'family_1',dwellingId:'dwelling_1'},
      mira:{familyId:'family_1',dwellingId:'dwelling_1'},
      resident_3:{familyId:'family_1',dwellingId:'dwelling_1'}
    },kinship:[]};
  return loadHousehold(copy(root));
}

test('QSK-06 seeded snapshots have identical ranked motives without state mutation',()=>{
  const s=newGame();
  healthy(s);s.minutes=23*60;s.needs.energy=51;s.needs.hunger=40;
  const snapshot=copy(s);
  const first=evaluateAutonomy(s),second=evaluateAutonomy(copy(s));
  assert.deepEqual(first,second);
  assert.deepEqual(s,snapshot);
  assert.equal(first.blocked,null);
  assert.equal(first.selected,'bed');
  assert.equal(autonomousChoice(s),'bed');
  assert.equal(first.candidates[0].reason,'night-rest');
  assert.ok(first.candidates[0].factors.nightRest>0);
  assert.ok(first.candidates.every(c=>Number.isFinite(c.score)));
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
});

test('QSK-06 personality contributes only bounded utility over real needs',()=>{
  const neat=newGame(),untidy=newGame();
  for(const s of [neat,untidy]){
    healthy(s);s.minutes=760;s.needs.hunger=52;s.needs.hygiene=53;
  }
  untidy.personality=createProfile(['temperament.calm','habits.untidy']);
  assert.equal(evaluateAutonomy(neat).selected,'shower');
  assert.equal(evaluateAutonomy(untidy).selected,'fridge');
  assert.ok(evaluateAutonomy(neat).candidates.find(c=>c.id==='shower')
    .factors.personality>0);
  assert.equal(untidy.needs.hunger,52,'deciding gives no resource or need reward');
});

test('QSK-06 manual action, pause, disabled AI and saved memory veto decisions',()=>{
  const s=newGame();
  healthy(s);s.minutes=850;s.needs.hunger=34;
  s.action={id:'sofa',phase:'walking',elapsed:0,automatic:false};
  assert.equal(evaluateAutonomy(s).blocked,'action-running');
  assert.equal(autonomousChoice(s),null);
  s.action=null;s.paused=true;
  assert.equal(evaluateAutonomy(s).blocked,'paused');
  s.paused=false;s.autonomy.enabled=false;
  assert.equal(evaluateAutonomy(s).blocked,'disabled');
  s.autonomy.enabled=true;s.autonomy.nextAt=900;
  assert.equal(evaluateAutonomy(s).blocked,'cooldown');
  s.autonomy.nextAt=480;
  s.mind.memories.push({id:'fridge',at:849,fulfilled:true});
  const verdict=evaluateAutonomy(s).candidates.find(c=>c.id==='fridge');
  assert.equal(verdict.reason,'recent-action-cooldown');
  assert.equal(verdict.score,0);
  s.needs.hunger=9;
  assert.equal(evaluateAutonomy(s).selected,'fridge',
    'critical hunger still outranks optional memory cooldown');
});

test('QSK-06 occupied preferred fridge falls back to reachable urgent toilet, no phantom benefit',()=>{
  const root=oneExtra(),a=getActor(root,'resident_3');
  const fridge=resolveActionFurniture(root.world,'fridge');
  assert.ok(fridge);
  healthy(a);a.needs.hunger=2;a.needs.bladder=13;
  root.action={id:'fridge',phase:'using',elapsed:0,automatic:false,
    targetInstanceId:fridge.instanceId};
  const before=copy(a.needs);
  assert.equal(evaluateAutonomy(a).selected,'fridge');
  const beforeTrace=copy(root);
  const decision=explainAdditionalResidentAutonomy(root,'resident_3');
  assert.deepEqual(root,beforeTrace,'explanation must not mutate the household');
  assert.equal(decision.selected,'toilet');
  assert.deepEqual(decision.attempts.slice(0,2).map(x=>[x.id,x.availability]),[
    ['fridge','unavailable-or-unreachable'],
    ['toilet','free-and-reachable']
  ]);
  tickHousehold(root,.1);
  assert.equal(a.action?.id,'toilet');
  assert.equal(a.action?.automatic,true);
  assert.equal(a.action?.phase,'walking');
  assert.ok(a.needs.hunger<=before.hunger);
  assert.ok(a.needs.bladder<=before.bladder);
  assert.equal(pendingActions(root.actionQueues,'resident_3').length,0);
  assert.equal(root.version,1);
});

test('QSK-06 blocked manual queue still outranks ranked fallback after save/reload',()=>{
  const root=oneExtra(),a=getActor(root,'resident_3');
  healthy(a);a.needs.hunger=2;a.needs.bladder=13;
  const fridge=resolveActionFurniture(root.world,'fridge');
  root.action={id:'fridge',phase:'using',elapsed:0,automatic:false,
    targetInstanceId:fridge.instanceId};
  enqueueAction(root.actionQueues,'resident_3',
    {type:'object',actionId:'fridge',targetInstanceId:fridge.instanceId});
  const restored=loadHousehold(copy(root));
  assert.equal(explainAdditionalResidentAutonomy(restored,'resident_3').blocked,
    'manual-fifo');
  tickHousehold(restored,.1);
  const b=getActor(restored,'resident_3');
  assert.equal(b.action,null,'AI cannot skip a blocked user command');
  assert.equal(pendingActions(restored.actionQueues,'resident_3').length,1);
  assert.equal(restored.version,1);
});
