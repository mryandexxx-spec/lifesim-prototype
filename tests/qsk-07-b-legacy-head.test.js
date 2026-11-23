import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newActionQueues,enqueueAction,pendingActions,blockedActions,
  dispatchActionQueues,parkQueuedHead,retryBlockedAction} from '../src/action-queue.js';
import {newQueuedHeadGuard,inspectQueuedHead} from '../src/qsk-07-fairness.js';

test('QSK-07-B: Alex and Mira independent FIFO, blocked pre-start A* does not starve next move',()=>{
  const q=newActionQueues(['alex','mira']);
  const blocked=enqueueAction(q,'alex',{type:'move',x:1,z:1});
  const next=enqueueAction(q,'alex',{type:'move',x:2,z:2});
  const mira=enqueueAction(q,'mira',{type:'move',x:-1,z:-1});
  const guard=newQueuedHeadGuard(),started=[];
  for(let minute=0;minute<=8;minute++){
    dispatchActionQueues(q,{
      canStart(id,cmd){
        if(id==='alex'&&cmd.seq===blocked.seq){
          if(guard.seq===cmd.seq&&minute<guard.retryAt)return false;
          if(inspectQueuedHead(guard,cmd.seq,'unreachable-route',minute)==='park')
            parkQueuedHead(q,id,cmd.seq,'unreachable-route',minute);
          return false;
        }
        return true;
      },
      start(id,cmd){started.push({id,seq:cmd.seq});return true;}
    });
  }
  assert.deepEqual(started,[{id:'mira',seq:mira.seq},{id:'alex',seq:next.seq}],
    'unreachable Alex move must not starve next plan; Mira dispatch unaffected');
  const parked=blockedActions(q,'alex');
  assert.equal(parked.length,1);
  assert.equal(parked[0].seq,blocked.seq);
  assert.equal(parked[0].blockedReason,'unreachable-route');
  const persisted=JSON.parse(JSON.stringify(q));
  assert.deepEqual(persisted.blockedByResident.alex,parked);
  const retry=retryBlockedAction(q,'alex',blocked.seq);
  assert.ok(retry.seq>next.seq,'manual retry returns only to FIFO tail');
  assert.equal(pendingActions(q,'alex').length,1);
  assert.equal(blockedActions(q,'alex').length,0);
});

test('QSK-07-B: legacy browser controller really handles failed pre-start A* in game time',()=>{
  const source=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(source,/import \{newQueuedHeadGuard,inspectQueuedHead\} from '\.\/qsk-07-fairness\.js'/);
  assert.match(source,/const legacyMoveHeadGuards=new Map\(\)/);
  assert.match(source,/if\(guard\.seq===command\.seq&&game\.minutes<guard\.retryAt\)return false/);
  assert.match(source,/if\(inspectQueuedHead\(guard,command\.seq,'unreachable-route'/);
  assert.match(source,/parkQueuedHead\(game\.actionQueues,residentId,command\.seq/);
  assert.match(source,/renderQueuePanel\(true\);save\(true\);toast\(notice\)/);
  assert.match(html,/src\/game\.js\?v=[^"]+qsk-07-b/);
});
