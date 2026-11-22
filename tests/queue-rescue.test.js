import test from 'node:test';
import assert from 'node:assert/strict';
import {newSocialWalkGuard,inspectSocialWalk,recoverableSocialCommand,
  SOCIAL_WALK_STALL_MINUTES} from '../src/queue-rescue.js';
import {newActionQueues,enqueueAction,restoreActionQueues,pendingActions,
  blockedActions,parkQueuedHead,retryBlockedAction,removeBlockedAction,MAX_ACTION_QUEUE} from '../src/action-queue.js';
import {readFileSync} from 'node:fs';

const points=(a=0,b=1)=>({alex:{x:a,z:0},mira:{x:b,z:0}});
const session=(extra={})=>({initiator:'alex',partner:'mira',kind:'talk',
  phase:'walking',automatic:false,...extra});
test('stationary social approach eventually recovers, never on first observation',()=>{
  const w=newSocialWalkGuard(),s=session();
  assert.equal(inspectSocialWalk(w,s,points(),3),null);
  assert.equal(inspectSocialWalk(w,s,points(),SOCIAL_WALK_STALL_MINUTES-1),null);
  assert.equal(inspectSocialWalk(w,s,points(),1),'no-approach-progress');
});
test('spatial progress restarts timer and phase change cancels watchdog',()=>{
  const w=newSocialWalkGuard(),s=session();
  inspectSocialWalk(w,s,points(),1);
  inspectSocialWalk(w,s,points(),30);
  assert.equal(inspectSocialWalk(w,s,points(.2,1),1),null);
  assert.equal(w.stillMinutes,0);
  assert.equal(inspectSocialWalk(w,s,points(.2,1),30),null);
  assert.equal(inspectSocialWalk(w,{...s,phase:'using'},points(),90),null);
  assert.equal(w.stillMinutes,0);
});
test('pause and non-moving new session do not inherit stale waiting duration',()=>{
  const w=newSocialWalkGuard(),s=session();
  inspectSocialWalk(w,s,points(),1);
  inspectSocialWalk(w,s,points(),25);
  inspectSocialWalk(w,s,points(),90,{paused:true});
  assert.equal(w.stillMinutes,25);
  assert.equal(inspectSocialWalk(w,session(),points(),1),null);
  assert.equal(w.stillMinutes,0);
});
test('a partner unexpectedly away immediately invalidates walking only',()=>{
  const w=newSocialWalkGuard(),s=session();
  assert.equal(inspectSocialWalk(w,s,points(),1,{partnerAway:true}),'partner-away');
  assert.equal(inspectSocialWalk(w,{...s,phase:'using'},points(),50,{partnerAway:true}),null);
});
test('recovered manual invitation retains original intent, automatic does not replay',()=>{
  const all=[
    [session(),{type:'social',targetId:'mira',actionId:'talk'}],
    [session({kind:'argue'}),{type:'social',targetId:'mira',actionId:'argue'}],
    [session({conversation:{topic:'support'}}),
      {type:'conversation',targetId:'mira',topicId:'support'}],
    [session({branchAction:{id:'romance.hug'}}),
      {type:'branch',targetId:'mira',actionId:'romance.hug'}],
    [session({shared:{mode:'leisure',choiceId:'tv'}}),
      {type:'shared',targetId:'mira',mode:'leisure',choiceId:'tv'}]
  ];
  for(const [s,expected] of all){
    assert.deepEqual(recoverableSocialCommand(s),expected);
    const q=newActionQueues(['alex','mira']);
    const queued=enqueueAction(q,'alex',recoverableSocialCommand(s));
    assert.ok(queued);
    assert.equal(restoreActionQueues(structuredClone(q),['alex','mira'])
      .byResident.alex[0].seq,queued.seq);
  }
  assert.equal(recoverableSocialCommand(session({automatic:true})),null);
});
test('runtime connects watchdog to route follower, queue feedback and Pages packaging',()=>{
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert.match(game,/inspectSocialWalk\(socialWalkGuard,/);
  assert.match(game,/recoverableSocialCommand\(stalledSocial\)/);
  assert.match(game,/enqueueAction\(game\.actionQueues,stalledSocial\.initiator,replay\)/);
  assert.match(game,/cancelSocial\(game\)/);
  assert.match(game,/inspectQueueWait\(residentId\)/);
  assert.match(pages,/node --check src\/queue-rescue\.js/);
  assert.match(pages,/cp src\/queue-rescue\.js site\/src\//);
});

test('permanently impossible head moves to persistent review tray, not silent deletion',()=>{
  const q=newActionQueues(['alex','mira']);
  const head=enqueueAction(q,'alex',{type:'object',actionId:'fridge'});
  const later=enqueueAction(q,'alex',{type:'object',actionId:'bed'});
  const other=enqueueAction(q,'mira',{type:'object',actionId:'sofa'});
  assert.equal(parkQueuedHead(q,'alex',later.seq,'unreachable-route',120),false,
    'only the head can be parked');
  assert.equal(parkQueuedHead(q,'alex',head.seq,'unreachable-route',120),true);
  assert.deepEqual(pendingActions(q,'alex').map(x=>x.seq),[later.seq]);
  assert.deepEqual(pendingActions(q,'mira').map(x=>x.seq),[other.seq]);
  assert.deepEqual(blockedActions(q,'alex').map(x=>x.seq),[head.seq]);
  const loaded=restoreActionQueues(structuredClone(q),['alex','mira']);
  assert.deepEqual(loaded,q,'preserve root v1 queue extension exactly');
  const retried=retryBlockedAction(loaded,'alex',head.seq,121);
  assert.equal(retried.actionId,'fridge');
  assert.ok(retried.seq>other.seq);
  assert.deepEqual(pendingActions(loaded,'alex').map(x=>x.seq),[later.seq,retried.seq]);
  assert.equal(blockedActions(loaded,'alex').length,0);
});
test('invalid blocked records are rejected on reload and no foreign residents injected',()=>{
  const q=newActionQueues(['alex','mira']);
  const head=enqueueAction(q,'alex',{type:'object',actionId:'fridge'});
  parkQueuedHead(q,'alex',head.seq,'missing-target',9);
  const copy=structuredClone(q);
  copy.blockedByResident.alex.push({...copy.blockedByResident.alex[0]});
  copy.blockedByResident.alex.push({seq:999,type:'object',
    actionId:'__proto__',blockedReason:'unreachable-route',blockedAt:0});
  copy.blockedByResident.alex.push({seq:1000,type:'object',
    actionId:'bed',blockedReason:'forged',blockedAt:0});
  copy.blockedByResident.evil=[{seq:1001,type:'object',
    actionId:'bed',blockedReason:'missing-target',blockedAt:0}];
  const restored=restoreActionQueues(copy,['alex','mira']);
  assert.equal(blockedActions(restored,'alex').length,1);
  assert.equal(restored.blockedByResident.evil,undefined);
  assert.equal(restored.nextSeq,2);
});
test('full active FIFO cannot be overwritten by retry; saved blocked intent remains',()=>{
  const q=newActionQueues(['alex','mira']);
  const first=enqueueAction(q,'alex',{type:'object',actionId:'bed'});
  parkQueuedHead(q,'alex',first.seq,'unreachable-route',10);
  for(let i=0;i<MAX_ACTION_QUEUE;i++)
    assert.ok(enqueueAction(q,'alex',{type:'object',actionId:'fridge'}));
  const before=structuredClone(q);
  assert.equal(retryBlockedAction(q,'alex',first.seq,11),null);
  assert.deepEqual(q,before);
  assert.equal(removeBlockedAction(q,'alex',first.seq),true);
  assert.equal(removeBlockedAction(q,'alex',first.seq),false);
});
