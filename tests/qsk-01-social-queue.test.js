/** QSK-01: lock the production social/FIFO/save/cache contracts without changing gameplay. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold} from '../src/household.js';
import {newGame,SAVE_KEY} from '../src/simulation.js';
import {enqueueAction,pendingActions,queueHeads,dispatchActionQueues} from '../src/action-queue.js';

const snapshot=x=>JSON.parse(JSON.stringify(x));
function household(residents){
  const root=newHousehold('2026-11-23');
  root.autonomy.enabled=false;
  if(residents===4){
    const extra=(id,name,x)=>{
      const actor=newGame();
      actor.position={x,z:1.2};
      return {id,identity:{firstName:name,lastName:'Тест',lifeStage:'adult'},actor};
    };
    root.population={schema:1,nextResidentSerial:5,
      residentsById:{resident_3:extra('resident_3','Вера',1.2),
        resident_4:extra('resident_4','Игорь',2.1)},
      linksByResident:{
        alex:{familyId:'family_1',dwellingId:'dwelling_1'},
        mira:{familyId:'family_1',dwellingId:'dwelling_1'},
        resident_3:{familyId:'family_2',dwellingId:'dwelling_1'},
        resident_4:{familyId:'family_3',dwellingId:'dwelling_1'}},kinship:[]};
  }
  return loadHousehold(snapshot(root));
}
for(const people of [2,4])test('QSK-01 '+people+' residents: directional social confirmations stay in independent FIFO after v1 restore',()=>{
  const root=household(people);
  const q=root.actionQueues;
  const alex=enqueueAction(q,'alex',{type:'social',targetId:'mira',actionId:'talk'});
  const alexTail=enqueueAction(q,'alex',{type:'object',actionId:'bed'});
  const mira=enqueueAction(q,'mira',{type:'social',targetId:'alex',actionId:'talk'});
  const miraTail=enqueueAction(q,'mira',{type:'object',actionId:'fridge'});
  assert.ok(alex&&alexTail&&mira&&miraTail);
  assert.ok(alex.seq<alexTail.seq&&alexTail.seq<mira.seq&&mira.seq<miraTail.seq);
  if(people===4){
    assert.ok(enqueueAction(q,'resident_3',{type:'object',actionId:'bed'}));
    assert.ok(enqueueAction(q,'resident_4',{type:'object',actionId:'fridge'}));
  }
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  const saved=snapshot(root);
  assert.equal(saved.version,1);
  const restored=loadHousehold(saved);
  const expected=['alex','mira',...(people===4?['resident_3','resident_4']:[])];
  assert.deepEqual(Object.keys(restored.actionQueues.byResident).sort(),expected.sort());
  for(const id of expected){
    // Restore may resolve a generic bed/fridge request to its canonical
    // instance ID. Intent, personal ordering, identity and seq must survive.
    const intent=task=>({seq:task.seq,type:task.type,
      actionId:task.actionId,targetId:task.targetId});
    assert.deepEqual(pendingActions(restored.actionQueues,id).map(intent),
      pendingActions(q,id).map(intent),
      'personal order, seq and social target survive save-v1 for '+id);
  }
  assert.deepEqual(queueHeads(restored.actionQueues).map(x=>x.residentId),
    expected,'only the head of each personal FIFO may dispatch');
  assert.equal(pendingActions(restored.actionQueues,'alex')[0].targetId,'mira');
  assert.equal(pendingActions(restored.actionQueues,'mira')[0].targetId,'alex');
  assert.equal(pendingActions(restored.actionQueues,'mira').length,2,
    'one Alex invitation does not append to Mira\'s personal queue');
  const first=dispatchActionQueues(restored.actionQueues,{
    canStart:id=>id==='alex',
    start:()=>false
  });
  assert.deepEqual(first,[],'declined dispatch must not consume an action');
  assert.equal(pendingActions(restored.actionQueues,'alex')[0].seq,alex.seq);
  const started=dispatchActionQueues(restored.actionQueues,{
    canStart:id=>id==='alex',
    start:()=>true
  });
  assert.deepEqual(started.map(x=>x.command.seq),[alex.seq]);
  assert.equal(pendingActions(restored.actionQueues,'alex')[0].seq,alexTail.seq);
  assert.equal(pendingActions(restored.actionQueues,'mira')[0].seq,mira.seq);
  assert.deepEqual(dispatchActionQueues(restored.actionQueues,{
    canStart:()=>false,start:()=>true
  }),[],'busy participants cannot have FIFO entries silently dropped');
});

test('QSK-01 Safari stale-import guard keeps both social and queue modules versioned',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const match=html.match(/<script\s+type="importmap">([\s\S]*?)<\/script>/);
  assert.ok(match,'explicit import map must exist');
  const imports=JSON.parse(match[1]).imports;
  for(const name of ['household','action-queue','resident-social-runtime','resident-hud']){
    const key='./src/'+name+'.js';
    assert.ok(imports[key]?.startsWith(key+'?v='),name+' must have a Safari-busting import URL');
  }
  const entry=html.match(/<script\s+type="module"\s+src="([^"]*game\.js\?[^"]+)"/);
  assert.ok(entry,'main game module needs a versioned URL');
  assert.match(entry[1],/social-queue-r1/,
    'cannot restore pre-social hotfix Safari cached game module');
});
