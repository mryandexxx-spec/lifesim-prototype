import test from 'node:test';
import assert from 'node:assert/strict';
import {newSocialWalkGuard,inspectSocialWalk,recoverableSocialCommand,
  SOCIAL_WALK_STALL_MINUTES} from '../src/queue-rescue.js';
import {newActionQueues,enqueueAction,restoreActionQueues} from '../src/action-queue.js';
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
