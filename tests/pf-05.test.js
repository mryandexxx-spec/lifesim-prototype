import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold,getActor,chooseResidentAction,tickHousehold} from '../src/household.js';
import {newGame,arrive,actionDuration} from '../src/simulation.js';
import {labelActiveTask,labelQueuedTask} from '../src/qsk-11-task-labels.js';
import {findMarketPlacement,buyMarketItem} from '../src/furniture-shop.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {enqueueAction} from '../src/action-queue.js';
import {verifiedLastEvent} from '../src/qsk-08-touch-ux.js';
const copy=x=>JSON.parse(JSON.stringify(x));
function fixture(extra=false){
  const root=newHousehold();root.autonomy.enabled=false;
  const pose=findMarketPlacement(root.world.furniture,root.shop,'mirror.panel');
  const bought=buyMarketItem(root.world.furniture,root.shop,'mirror.panel',pose);
  assert.ok(bought.ok);root.world.furniture=bought.world;root.shop=bought.shop;
  const id=bought.instanceId,point=furnitureActionApproach(root.world,'mirror',id);
  if(extra){
    const actor=newGame();actor.position={...point};actor.autonomy.enabled=false;
    root.population={schema:1,nextResidentSerial:4,residentsById:{resident_3:{
      id:'resident_3',identity:{firstName:'Вера',lastName:'Тестовая',lifeStage:'adult'},actor}},
      linksByResident:{alex:{familyId:'family_1',dwellingId:'dwelling_1'},
        mira:{familyId:'family_1',dwellingId:'dwelling_1'},resident_3:{familyId:'family_1',dwellingId:'dwelling_1'}},kinship:[]};
    return {root:loadHousehold(copy(root)),id,point};
  }
  return {root,id,point};
}
test('PF-05 grooming and speech keep distinct labels, duration, start and completion through v1 reload',()=>{
  for(const person of ['alex','mira'])for(const speech of [false,true]){
    let {root,id,point}=fixture(),actor=getActor(root,person);
    actor.needs.social=25;actor.needs.fun=25;
    const command={type:'object',actionId:'mirror',targetInstanceId:id,...(speech?{mirrorPractice:true}:{})};
    const label=speech?'Репетировать речь':'Причесаться у зеркала';
    assert.equal(labelQueuedTask(root,command),label);
    assert.ok(chooseResidentAction(root,'mirror',false,person,id,null,null,null,null,null,speech));
    assert.equal(actor.event,label);assert.equal(labelActiveTask(root,person),label);
    actor.position={...point};arrive(actor);
    assert.equal(actionDuration(actor.action),speech?24:17);
    tickHousehold(root,8);root=loadHousehold(copy(root));actor=getActor(root,person);
    assert.equal(labelActiveTask(root,person),label);assert.equal(actor.event,label);
    tickHousehold(root,speech?16:9);
    assert.equal(actor.action,null);assert.equal(actor.skills.xpById.charisma||0,speech?13.5:0);
    assert.match(actor.event,speech?/Речь отрепетирована/:/Причесаться у зеркала — готово/);
    assert.equal(actor.needs.social>25,speech);
  }
});
test('PF-05 additional resident manual queue preserves speech, completes once after reload',()=>{
  let {root,id,point}=fixture(true);
  enqueueAction(root.actionQueues,'resident_3',{type:'object',actionId:'mirror',targetInstanceId:id,mirrorPractice:true});
  tickHousehold(root,.1);
  let actor=getActor(root,'resident_3');
  assert.equal(actor.action?.mirrorPractice,true);
  actor.position={...point};arrive(actor);
  tickHousehold(root,12);root=loadHousehold(copy(root));actor=getActor(root,'resident_3');
  assert.equal(actor.action?.mirrorPractice,true);
  assert.equal(labelActiveTask(root,'resident_3'),'Репетировать речь');
  tickHousehold(root,12);
  assert.equal(actor.action,null);assert.equal(actor.skills?.xpById.charisma,13.5);
  tickHousehold(root,1);assert.equal(actor.skills.xpById.charisma,13.5);
});
test('PF-05 browser uses variant-aware progress and confirmed mirror completion before dispatch',()=>{
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  assert.match(game,/actionDuration\(actor\.action\)/);
  assert.match(game,/mirrorCompletion/);
  assert.match(game,/mirror-speech-button/);
});

test('PF-05 last event is a verified completion and not an active intent',()=>{
  assert.equal(verifiedLastEvent('Причесаться у зеркала — готово')?.code,'completed');
  assert.equal(verifiedLastEvent('Речь отрепетирована · харизма +18 XP')?.code,'completed');
  assert.equal(verifiedLastEvent('Речь отрепетирована · харизма +9 XP')?.code,'completed');
  assert.equal(verifiedLastEvent('Речь отрепетирована · харизма +13.5 XP')?.code,'completed');
  assert.equal(verifiedLastEvent('Репетировать речь'),null);
  assert.equal(verifiedLastEvent('Практика речи прервана: зеркало недоступно')?.code,'interrupted');
});

test('PF-05 rejected restored mirror never retains misleading active label or pays XP',()=>{
  for(const person of ['alex','mira']){
    const {root,id,point}=fixture(),actor=getActor(root,person);
    assert.ok(chooseResidentAction(root,'mirror',false,person,id,null,null,null,null,null,true));
    actor.position={...point};arrive(actor);tickHousehold(root,8);
    actor.position={x:point.x+3,z:point.z};
    const loaded=loadHousehold(copy(root)),after=getActor(loaded,person);
    assert.equal(after.action,null);assert.equal(labelActiveTask(loaded,person),null);
    assert.match(after.event,/прервано/);assert.equal(after.skills.xpById.charisma||0,0);
  }
});
