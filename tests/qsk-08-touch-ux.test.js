import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold,getActor,tickHousehold,furnitureAvailable} from '../src/household.js';
import {newGame,SAVE_KEY} from '../src/simulation.js';
import {newActionQueues,enqueueAction,parkQueuedHead,blockedActions,
  pendingActions,retryBlockedAction,restoreActionQueues} from '../src/action-queue.js';
import {cancelAdditionalResidentAction,residentIdsForSimulation}
  from '../src/resident-activity-runtime.js';
import {resolveActionFurniture} from '../src/furniture-catalog.js';
import {blockedActionMessage,visibleActionPhase,queuedActionStatus,
  interruptionQuestion,verifiedLastEvent} from '../src/qsk-08-touch-ux.js';

const clone=v=>JSON.parse(JSON.stringify(v));
function withExtras(){
  const root=newHousehold();
  root.autonomy.enabled=false;root.otherSim.autonomy.enabled=false;
  const make=(id,name)=>{
    const actor=newGame();actor.personality.name=name;
    actor.position={x:0,z:0};
    return {id,identity:{firstName:name,lastName:'Новый',lifeStage:'adult'},actor};
  };
  root.population={
    schema:1,nextResidentSerial:5,
    residentsById:{resident_3:make('resident_3','Вера'),resident_4:make('resident_4','Игорь')},
    linksByResident:{
      alex:{familyId:'family_1',dwellingId:'dwelling_1'},
      mira:{familyId:'family_2',dwellingId:'dwelling_1'},
      resident_3:{familyId:'family_1',dwellingId:'dwelling_1'},
      resident_4:{familyId:'family_1',dwellingId:'dwelling_1'}
    },kinship:[]};
  return loadHousehold(clone(root));
}

test('QSK-08: honest available/queued/walking/using/paused, no fake completion',()=>{
  assert.deepEqual(visibleActionPhase(null,null),{code:'idle',text:'Свободен'});
  assert.equal(visibleActionPhase('Душ','walking').text,'Идёт к цели · Душ');
  assert.equal(visibleActionPhase('Душ','using').text,'Выполняется · Душ');
  assert.equal(visibleActionPhase('Беседа','waiting').code,'waiting');
  assert.equal(visibleActionPhase('Беседа','walking',{paused:true}).code,'paused');
  assert.equal(queuedActionStatus(1),'В очереди · №1');
  assert.equal(queuedActionStatus(1,'Собеседник занят'),'Ожидает · Собеседник занят');
  assert.equal(queuedActionStatus(2,'Собеседник занят'),'В очереди · №2');
  assert.equal(verifiedLastEvent('Свободное время'),null);
  assert.equal(verifiedLastEvent('Пришёл в выбранное место').code,'completed');
  assert.equal(verifiedLastEvent('Действие прервано по команде игрока').code,'interrupted');
});
test('QSK-08: five saved blocked reasons are human readable and not game mutations',()=>{
  for(const reason of ['missing-target','unreachable-route','invalid-destination',
    'unavailable-gift','resource-busy'])
    assert.ok(blockedActionMessage(reason).length>13);
  assert.match(blockedActionMessage('unreachable-route'),/маршрут/);
  assert.match(blockedActionMessage('resource-busy'),/занят/);
  assert.match(interruptionQuestion('Алекс','Беседа',{shared:true}),/обоих/);
  assert.match(interruptionQuestion('Мира','Сон'),/останутся в очереди/);
});
test('QSK-08: retry remains real saved FIFO for four, no duplicate or v1 change',()=>{
  const ids=['alex','mira','resident_3','resident_4'];
  const q=newActionQueues(ids);
  const first=enqueueAction(q,'resident_3',{type:'move',x:1,z:1});
  const second=enqueueAction(q,'resident_3',{type:'move',x:2,z:2});
  const other=enqueueAction(q,'mira',{type:'move',x:1,z:1});
  assert.equal(parkQueuedHead(q,'resident_3',first.seq,'unreachable-route',22),true);
  const restored=restoreActionQueues(clone(q),ids);
  assert.equal(blockedActions(restored,'resident_3')[0].seq,first.seq);
  const reply=retryBlockedAction(restored,'resident_3',first.seq,23);
  assert.ok(reply.seq>other.seq);
  assert.deepEqual(pendingActions(restored,'resident_3').map(t=>t.seq),[second.seq,reply.seq]);
  assert.equal(blockedActions(restored,'resident_3').length,0);
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
});
test('QSK-08: explicit extra resident cancellation releases shared furniture, preserves other resident',()=>{
  const root=withExtras();
  assert.deepEqual(residentIdsForSimulation(root),['alex','mira','resident_3','resident_4']);
  const seat=resolveActionFurniture(root.world,'sofa');
  assert.ok(seat);
  enqueueAction(root.actionQueues,'resident_3',{type:'object',actionId:'sofa',targetInstanceId:seat.instanceId});
  enqueueAction(root.actionQueues,'resident_4',{type:'object',actionId:'sofa',targetInstanceId:seat.instanceId});
  tickHousehold(root,.1);
  assert.equal(getActor(root,'resident_3').action?.id,'sofa');
  assert.equal(getActor(root,'resident_4').action,null);
  assert.equal(furnitureAvailable(root,'sofa','alex',seat.instanceId),false);
  assert.equal(cancelAdditionalResidentAction(root,'resident_3'),true);
  assert.equal(getActor(root,'resident_3').action,null);
  assert.match(getActor(root,'resident_3').event,/прервано/);
  assert.equal(pendingActions(root.actionQueues,'resident_4').length,1);
  tickHousehold(root,.1);
  assert.equal(getActor(root,'resident_4').action?.id,'sofa');
  assert.equal(cancelAdditionalResidentAction(root,'alex'),false);
  assert.equal(root.version,1);
  const saved=loadHousehold(clone(root));
  assert.equal(pendingActions(saved.actionQueues,'resident_3').length,0);
});
test('QSK-08: production browser uses real module, iPhone safe 44px hit targets, validated action gate',()=>{
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert.match(game,/visibleActionPhase\(active,phase/);
  assert.match(game,/queuedActionStatus\(index\+1/);
  assert.match(game,/blockedActionMessage\(task\.blockedReason\)/);
  assert.match(game,/window\.confirm\(interruptionQuestion/);
  assert.match(game,/cancelAdditionalResidentAction\(game,id\)/);
  assert.match(game,/retryBlockedAction\(game\.actionQueues,id/);
  assert.match(css,/queue-items li button,[\s\S]*?min-width:44px;min-height:44px/);
  assert.match(css,/\.queue-panel\{top:auto;bottom:calc\(env\(safe-area-inset-bottom\)/);
  assert.match(html,/src\/game\.js\?v=[^"]+qsk-08/);
  assert.match(html,/styles\.css\?v=[^"]+qsk-08/);
  assert.match(html,/src\/qsk-08-touch-ux\.js\?v=qsk-08/);
  assert.match(pages,/node --check src\/qsk-08-touch-ux\.js/);
  assert.match(pages,/cp src\/qsk-08-touch-ux\.js site\/src\//);
});
