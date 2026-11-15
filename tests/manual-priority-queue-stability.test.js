import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ACTIONS,chooseAction,arrive,tick,newGame} from '../src/simulation.js';
import {NEED_DECAY_PER_MINUTE} from '../src/need-balance.js';
import {newHousehold,loadHousehold,chooseResidentAction,tickHousehold,
  preemptAutomaticForManual} from '../src/household.js';
import {startSocial} from '../src/relationships.js';
import {newActionQueues,enqueueAction,pendingActions,
  dispatchActionQueues,MAX_ACTION_QUEUE} from '../src/action-queue.js';
const copy=v=>JSON.parse(JSON.stringify(v));
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} vs ${b}`);
test('a committed manual queue command cancels ONLY the addressed spontaneous object action',()=>{
  const root=newHousehold();root.minutes=900;
  assert.ok(chooseResidentAction(root,'sofa',true,'alex'));
  assert.ok(chooseResidentAction(root,'fridge',false,'mira'));
  const old=copy(root);
  const task=enqueueAction(root.actionQueues,'alex',{type:'object',actionId:'bed'});
  assert.ok(task);
  const result=preemptAutomaticForManual(root,'alex');
  assert.equal(result.objectId,'sofa');
  assert.equal(root.action,null);
  assert.equal(root.otherSim.action.id,'fridge');
  assert.equal(root.otherSim.action.automatic,false);
  assert.equal(pendingActions(root.actionQueues,'alex')[0].seq,task.seq);
  assert.equal(root.mind.memories.length,old.mind.memories.length);
  assert.equal(root.actionQueues.schema,1);
  assert.equal(loadHousehold(copy(root)).actionQueues.byResident.alex.length,1);
});
test('a manual instruction to the partner releases a spontaneous social reservation, never creates a receipt',()=>{
  const root=newHousehold();root.minutes=900;root.otherSim.minutes=900;
  root.relationship.nextSocialAt=0;
  assert.equal(startSocial(root,'talk','alex',{x:-.2,z:1.85},true),true);
  const affinity=root.relationship.affinity;
  const task=enqueueAction(root.actionQueues,'mira',{type:'object',actionId:'shower'});
  assert.ok(task);
  const removed=preemptAutomaticForManual(root,'mira');
  assert.equal(removed.socialInitiator,'alex');
  assert.equal(root.socialAction,null);
  assert.equal(root.actionQueues.byResident.mira.length,1);
  assert.equal(root.relationship.affinity,affinity);
  assert.equal(root.mind.memories.length,0);
  assert.equal(root.otherSim.mind.memories.length,0);
});
test('player-owned active actions and manual social conversation are never interrupted by a later queued task',()=>{
  const root=newHousehold();root.minutes=900;
  assert.ok(chooseResidentAction(root,'bed',false,'alex'));
  assert.ok(enqueueAction(root.actionQueues,'alex',{type:'object',actionId:'fridge'}));
  const result=preemptAutomaticForManual(root,'alex');
  assert.equal(result.objectId,null);
  assert.equal(root.action.id,'bed');
  assert.equal(root.action.automatic,false);
  const social=newHousehold();social.minutes=900;social.otherSim.minutes=900;
  assert.ok(startSocial(social,'talk','alex',{x:-.2,z:1.85},false));
  assert.ok(enqueueAction(social.actionQueues,'mira',{type:'object',actionId:'sofa'}));
  assert.equal(preemptAutomaticForManual(social,'mira').socialInitiator,null);
  assert.ok(social.socialAction);
});
test('sofa REST keeps energy level on both residents while other needs behave normally',()=>{
  const root=newHousehold();
  assert.ok(chooseResidentAction(root,'sofa',false,'mira'));
  arrive(root.otherSim);
  const e=root.otherSim.needs.energy;
  const f=root.otherSim.needs.fun;
  const alex=root.needs.energy;
  tickHousehold(root,20);
  close(root.otherSim.needs.energy,e);
  assert.ok(root.otherSim.needs.fun>f);
  close(root.needs.energy,alex-20*NEED_DECAY_PER_MINUTE.energy);
});
test('walking to sofa consumes energy; if an oversized tick goes beyond seated duration, decay resumes',()=>{
  const s=newGame();const rate=NEED_DECAY_PER_MINUTE.energy;
  assert.ok(chooseAction(s,'sofa'));const initial=s.needs.energy;
  tick(s,3);close(s.needs.energy,initial-3*rate);
  arrive(s);const atSeat=s.needs.energy;
  tick(s,ACTIONS.sofa.duration+8);
  close(s.needs.energy,atSeat-8*rate);
  assert.equal(s.action,null);
});
test('sofa energy integration is chunk-invariant across start, finish, and pause',()=>{
  const a=newGame(),b=newGame();
  for(const sim of [a,b]){sim.needs.fun=5;sim.needs.energy=80;chooseAction(sim,'sofa');arrive(sim);}
  tick(a,ACTIONS.sofa.duration+10);
  for(let i=0;i<ACTIONS.sofa.duration+10;i++)tick(b,1);
  close(a.needs.energy,b.needs.energy);
  a.paused=true;const frozen=a.needs.energy;tick(a,40);close(a.needs.energy,frozen);
});
test('24 queued instructions across two residents drain fairly with bounded one-head-per-resident dispatch',()=>{
  const q=newActionQueues(['alex','mira']);
  for(let i=0;i<MAX_ACTION_QUEUE;i++){
    assert.ok(enqueueAction(q,'alex',{type:'object',actionId:i%2?'fridge':'sofa'}));
    assert.ok(enqueueAction(q,'mira',{type:'object',actionId:i%2?'bed':'shower'}));
  }
  assert.equal(enqueueAction(q,'alex',{type:'object',actionId:'bed'}),null);
  let cycles=0,accepted=0;
  while(pendingActions(q,'alex').length||pendingActions(q,'mira').length){
    const started=dispatchActionQueues(q,{canStart:()=>true,start:()=>true});
    accepted+=started.length;cycles++;
    assert.ok(cycles<=MAX_ACTION_QUEUE,'scheduler stalled');
  }
  assert.equal(accepted,2*MAX_ACTION_QUEUE);
  assert.equal(cycles,MAX_ACTION_QUEUE);
});
test('mobile scheduling wires priority and throttles repeated failed A* head searches',()=>{
  const src=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const h=readFileSync(new URL('../src/household.js',import.meta.url),'utf8');
  assert.ok(src.includes('onManualCommandQueued(preemptAutomaticForManual(game,residentId))'));
  assert.ok(src.includes('if((routeRetryAt.get(command.seq)||0)>performance.now())return false'));
  assert.ok(src.includes('routeRetryAt.set(command.seq,performance.now()+900)'));
  assert.ok(src.includes('if(lowerBound>=bestLength)break'));
  assert.ok(h.includes("if(social?.automatic===true"));
});
