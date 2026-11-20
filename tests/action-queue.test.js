import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newActionQueues,restoreActionQueues,pendingActions,enqueueAction,
  removeQueuedAction,queueHeads,dispatchActionQueues,MAX_ACTION_QUEUE,
  ACTION_QUEUE_TYPES,sanitizeQueueCommand} from '../src/action-queue.js';
import {newHousehold,loadHousehold,chooseResidentAction,tickHousehold} from '../src/household.js';
import {startSocial,arriveSocial,tickSocial,canStartSocial,autonomousSocialChoice} from '../src/relationships.js';
import {arrive,ACTIONS,SAVE_KEY} from '../src/simulation.js';
const ids=['nova','iris','riven','opal','ember'];
const place={x:-.2,z:1.85};
const copy=v=>JSON.parse(JSON.stringify(v));
const obj=id=>({type:'object',actionId:id});
const talk=targetId=>({type:'social',actionId:'talk',targetId});
test('arbitrary residents have separate, empty, JSON-safe FIFO queues',()=>{
  const q=newActionQueues(ids);
  assert.deepEqual(Object.keys(q.byResident),ids);
  assert.equal(q.nextSeq,1);
  assert.equal(pendingActions(q,'nova').length,0);
  assert.equal(pendingActions(q,'alex').length,0);
  assert.deepEqual(copy(q),q);
  assert.equal(ACTION_QUEUE_TYPES.length,9);
  assert.ok(ACTION_QUEUE_TYPES.includes('garden'),'LOT-C1 adds a typed garden FIFO command');
  assert.ok(ACTION_QUEUE_TYPES.includes('move'),'LOT-A adds point movement without losing older types');
  assert.throws(()=>newActionQueues(['nova','nova']),TypeError);
  assert.throws(()=>newActionQueues(['bad id']),TypeError);
});
test('five arbitrary IDs enqueue independently in exact per-resident FIFO order',()=>{
  const q=newActionQueues(ids);
  const a=enqueueAction(q,'nova',obj('bed'));
  const b=enqueueAction(q,'iris',obj('shower'));
  const c=enqueueAction(q,'nova',obj('sofa'));
  const d=enqueueAction(q,'riven',talk('ember'));
  const e=enqueueAction(q,'opal',{type:'conversation',targetId:'iris',topicId:'humor'});
  assert.deepEqual([a.seq,b.seq,c.seq,d.seq,e.seq],[1,2,3,4,5]);
  assert.deepEqual(pendingActions(q,'nova').map(x=>x.seq),[1,3]);
  assert.equal(pendingActions(q,'ember').length,0);
  assert.equal(queueHeads(q).map(x=>x.command.seq).join(','),'1,2,4,5');
});
test('start only consumes the front when executor confirms actual acceptance',()=>{
  const q=newActionQueues(ids);
  enqueueAction(q,'nova',obj('bed'));
  enqueueAction(q,'nova',obj('sofa'));
  let started=dispatchActionQueues(q,{canStart:()=>true,start:()=>false});
  assert.deepEqual(started,[]);
  assert.equal(pendingActions(q,'nova').length,2);
  started=dispatchActionQueues(q,{canStart:()=>true,start:()=>true});
  assert.deepEqual(started.map(x=>x.command.actionId),['bed']);
  assert.equal(pendingActions(q,'nova')[0].actionId,'sofa');
  started=dispatchActionQueues(q,{canStart:()=>true,start:()=>true});
  assert.deepEqual(started.map(x=>x.command.actionId),['sofa']);
  assert.equal(pendingActions(q,'nova').length,0);
});
test('two residents can start separate compatible jobs on same scheduler pass',()=>{
  const q=newActionQueues(ids);
  enqueueAction(q,'nova',obj('sofa'));
  enqueueAction(q,'ember',obj('fridge'));
  const active=new Set();
  const started=dispatchActionQueues(q,{
    canStart:id=>!active.has(id),
    start:(id,cmd)=>{active.add(id);return true;}
  });
  assert.equal(started.length,2);
  assert.deepEqual([...active],['nova','ember']);
  assert.equal(queueHeads(q).length,0);
});
test('busy recipient defers conversation without interrupting their existing job',()=>{
  const q=newActionQueues(ids);
  enqueueAction(q,'nova',talk('iris'));
  const active=new Set(['iris']);
  const run=()=>dispatchActionQueues(q,{
    canStart:(actor,cmd)=>!active.has(actor)&&!active.has(cmd.targetId),
    start:(actor,cmd)=>{active.add(actor);active.add(cmd.targetId);return true;}
  });
  assert.deepEqual(run(),[]);
  assert.equal(pendingActions(q,'nova').length,1);
  assert.deepEqual([...active],['iris']);
  active.delete('iris');
  assert.equal(run().length,1);
  assert.equal(pendingActions(q,'nova').length,0);
});
test('older target command runs before later invitation, no stealing a pending plan',()=>{
  const q=newActionQueues(ids);
  enqueueAction(q,'iris',obj('bed')); // seq1
  enqueueAction(q,'nova',talk('iris')); // seq2
  let busy=false;
  const result=dispatchActionQueues(q,{
    canStart:(id,cmd)=>!busy&&(cmd.type==='object'||pendingActions(q,'iris').length===0),
    start:()=>{busy=true;return true;}
  });
  assert.equal(result.length,1);
  assert.equal(result[0].residentId,'iris');
  assert.equal(pendingActions(q,'nova').length,1);
});
test('deleting a queued item does not touch another resident or the active item',()=>{
  const q=newActionQueues(ids);
  const a=enqueueAction(q,'nova',obj('bed'));
  const b=enqueueAction(q,'nova',obj('fridge'));
  const c=enqueueAction(q,'ember',obj('shower'));
  assert.equal(removeQueuedAction(q,'nova',b.seq),true);
  assert.deepEqual(pendingActions(q,'nova').map(x=>x.seq),[a.seq]);
  assert.deepEqual(pendingActions(q,'ember').map(x=>x.seq),[c.seq]);
  assert.equal(removeQueuedAction(q,'nova',b.seq),false);
  assert.equal(removeQueuedAction(q,'opal',a.seq),false);
  assert.equal(removeQueuedAction(q,'nova',99999),false);
});
test('queue caps each person independently and does not overwrite the oldest',()=>{
  const q=newActionQueues(ids);
  for(let i=0;i<MAX_ACTION_QUEUE;i++)
    assert.ok(enqueueAction(q,'nova',obj('bed')));
  assert.equal(enqueueAction(q,'nova',obj('fridge')),null);
  assert.equal(pendingActions(q,'nova')[0].seq,1);
  assert.equal(pendingActions(q,'nova').length,MAX_ACTION_QUEUE);
  assert.ok(enqueueAction(q,'iris',obj('bed')));
});
test('validated queue commands use catalog IDs, not arbitrary payloads from saves',()=>{
  const q=newActionQueues(ids);
  for(const req of [
    obj('__proto__'),{type:'object',actionId:'<script>'},
    {type:'social',actionId:'marry',targetId:'iris'},
    talk('nova'),talk('stranger'),
    {type:'shared',targetId:'iris',mode:'gift',choiceId:'javascript:bad'},
    {type:'conversation',targetId:'iris',topicId:'intrusion'},
    {type:'branch',targetId:'iris',actionId:'romance.sex'},
    {type:'bad',targetId:'iris'}
  ])assert.equal(enqueueAction(q,'nova',req),null,JSON.stringify(req));
  assert.equal(queueHeads(q).length,0);
  assert.equal(sanitizeQueueCommand('nova',{type:'object',actionId:'bed',script:'evil'},ids).script,undefined);
});
test('all five task types can be saved and restored exactly',()=>{
  const q=newActionQueues(ids);
  const commands=[obj('sofa'),talk('iris'),
    {type:'conversation',targetId:'iris',topicId:'humor'},
    {type:'branch',targetId:'iris',actionId:'acquaint.chat'},
    {type:'shared',targetId:'iris',mode:'leisure',choiceId:'music'}];
  commands.forEach(c=>enqueueAction(q,'nova',c));
  const restored=restoreActionQueues(copy(q),ids);
  assert.deepEqual(restored,q);
  assert.ok(enqueueAction(restored,'nova',obj('bed')));
  assert.equal(restored.nextSeq,q.nextSeq+1);
});
test('valid v1 household restores manually planned actions without recreating completed ones',()=>{
  const root=newHousehold();
  const seq=enqueueAction(root.actionQueues,'alex',obj('bed')).seq;
  enqueueAction(root.actionQueues,'mira',talk('alex'));
  const after=loadHousehold(copy(root));
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.equal(after.version,1);
  assert.equal(after.actionQueues.byResident.alex[0].seq,seq);
  assert.equal(after.actionQueues.byResident.mira[0].type,'social');
  assert.equal(after.relationship.affinity,50);
  assert.equal(removeQueuedAction(after.actionQueues,'alex',seq),true);
  assert.equal(loadHousehold(copy(after)).actionQueues.byResident.alex.length,0);
});
test('old save without actionQueues gets empty queues, not two duplicated instructions',()=>{
  const root=newHousehold();
  delete root.actionQueues;
  const old=loadHousehold(copy(root));
  assert.deepEqual(old.actionQueues,newActionQueues(['alex','mira']));
  assert.equal(old.socialGraph.persons.length,2);
});
test('restoration drops invalid unknown residents and protects monotonic sequence',()=>{
  const raw={schema:1,nextSeq:1,byResident:{
    nova:[{seq:2,type:'object',actionId:'bed'},
      {seq:2,type:'object',actionId:'sofa'},
      {seq:20,type:'branch',targetId:'bad actor',actionId:'friend.tease'}],
    iris:[{seq:3,type:'social',targetId:'nova',actionId:'talk'}],
    intruder:[{seq:1,type:'object',actionId:'shower'}]
  }};
  const q=restoreActionQueues(raw,ids);
  assert.deepEqual(q.byResident.nova.map(x=>x.seq),[2]);
  assert.deepEqual(q.byResident.iris.map(x=>x.seq),[3]);
  assert.equal(q.byResident.intruder,undefined);
  assert.equal(q.nextSeq,4);
});
test('a paused game does not advance action or begin new jobs in the adapter',()=>{
  const root=newHousehold();
  enqueueAction(root.actionQueues,'alex',obj('fridge'));
  root.paused=true;
  const snapshot=copy(root);
  tickHousehold(root,200);
  assert.deepEqual(copy(root),snapshot);
  const started=dispatchActionQueues(root.actionQueues,{
    canStart:()=>!root.paused,
    start:()=>{throw Error('No dispatch while paused');}
  });
  assert.deepEqual(started,[]);
  assert.equal(pendingActions(root.actionQueues,'alex').length,1);
});
test('new headless object command never replaces an ongoing bed/shower/fridge job',()=>{
  const root=newHousehold();
  assert.ok(chooseResidentAction(root,'bed',false,'alex'));
  assert.equal(chooseResidentAction(root,'fridge',false,'alex'),false);
  assert.equal(root.action.id,'bed');
  enqueueAction(root.actionQueues,'alex',obj('fridge'));
  assert.equal(root.action.id,'bed');
  arrive(root);tickHousehold(root,ACTIONS.bed.duration+1);
  assert.equal(root.action,null);
  const result=dispatchActionQueues(root.actionQueues,{
    canStart:(id)=>!root.action&&!root.paused,
    start:(id,command)=>chooseResidentAction(root,command.actionId,false,id)
  });
  assert.equal(result.length,1);
  assert.equal(root.action.id,'fridge');
});
test('social planning never preempts partner sleep or current authored dialogue',()=>{
  const root=newHousehold();
  assert.ok(chooseResidentAction(root,'bed',false,'mira'));
  enqueueAction(root.actionQueues,'alex',talk('mira'));
  assert.equal(canStartSocial(root,'talk','alex'),false);
  assert.equal(startSocial(root,'talk','alex',place),false);
  assert.equal(root.otherSim.action.id,'bed');
  assert.equal(pendingActions(root.actionQueues,'alex').length,1);
  arrive(root.otherSim);tickHousehold(root,ACTIONS.bed.duration+1);
  const result=dispatchActionQueues(root.actionQueues,{
    canStart:()=>canStartSocial(root,'talk','alex'),
    start:()=>startSocial(root,'talk','alex',place)
  });
  assert.equal(result.length,1);
  assert.equal(root.socialAction.phase,'walking');
  assert.equal(root.otherSim.action,null);
  assert.equal(pendingActions(root.actionQueues,'alex').length,0);
});
test('manual queue survives autonomy toggled OFF even if original auto job is dropped',()=>{
  const root=newHousehold();
  const planned=enqueueAction(root.actionQueues,'alex',obj('sofa'));
  root.minutes=900;
  assert.ok(chooseResidentAction(root,'fridge',true,'mira'));
  root.autonomy.enabled=false;
  root.otherSim.action=null;
  assert.equal(pendingActions(root.actionQueues,'alex')[0].seq,planned.seq);
  assert.equal(restoreActionQueues(copy(root.actionQueues),['alex','mira']).byResident.alex.length,1);
});
test('queued social cancellation is removal, not cancellation of the current object action',()=>{
  const root=newHousehold();
  chooseResidentAction(root,'fridge',false,'alex');
  const planned=enqueueAction(root.actionQueues,'alex',talk('mira'));
  assert.equal(removeQueuedAction(root.actionQueues,'alex',planned.seq),true);
  assert.equal(root.action.id,'fridge');
  assert.equal(root.socialAction,null);
  assert.equal(root.mind.memories.length,0);
  assert.equal(root.relationship.affinity,50);
});
test('iPhone UI has five natural categories, hidden debug and safe editable queue',()=>{
  const src=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  for(const id of ['conversation-btn','humor-btn','friendship-btn','conflict-btn',
    'shared-btn','social-menu-panel','queue-toggle','queue-panel','queue-items',
    'queue-active','queue-close','social-menu-options','relationship-branch'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.ok(html.includes('id="branch-btn" type="button" hidden'));
  assert.ok(src.includes("get('debug')==='relations'"));
  assert.ok(src.includes('debugTapCount>=7'));
  assert.ok(src.includes('removeQueuedAction(game.actionQueues,residentId,task.seq)'));
  assert.ok(src.includes('dispatchPlannedActions()'));
  assert.ok(src.includes("pendingActions(game.actionQueues,residentId).length"));
  assert.ok(src.includes("friendshipLocked?'Дружба · 🔒':'Дружба'"));
  assert.ok(src.includes("setAttribute('aria-disabled',String(friendshipLocked))"));
  assert.ok(css.includes('.social-summary .dev-relationship'));
  assert.ok(workflow.includes('node --check src/action-queue.js'));
  assert.ok(workflow.includes('src/action-queue.js src/conversation-engine.js'));
});
test('autonomous social suggestions never preempt the manual queue of either participant',()=>{
  const root=newHousehold();
  root.minutes=900;
  root.otherSim.minutes=900;
  root.relationship.nextSocialAt=0;
  root.needs.fun=20;
  root.otherSim.needs.fun=20;
  enqueueAction(root.actionQueues,'mira',obj('fridge'));
  assert.equal(autonomousSocialChoice(root,'alex'),null);
  assert.equal(autonomousSocialChoice(root,'mira'),null);
});
test('active gift does not close the leisure picker or allow scheduling the same item twice',()=>{
  const ui=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  assert.ok(ui.includes("if(!sharedPicker)return;"));
  assert.ok(ui.includes("game.socialAction.shared.choiceId===command.choiceId"));
  assert.ok(ui.includes("session?'Запланировать следующее':'Подарки и досуг'"));
});
