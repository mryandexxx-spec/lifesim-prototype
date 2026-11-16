import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newGame,loadGame,chooseAction,arrive,tick,SAVE_KEY} from '../src/simulation.js';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {refreshMind,calculateMood} from '../src/psychology.js';
import {createProfile} from '../src/trait-catalog.js';
import {moodActionPolicy,voluntaryMoodEfficiency} from '../src/mood-action-policy.js';
import {newActionQueues,enqueueAction,pendingActions,dispatchActionQueues,
  restoreActionQueues,removeQueuedAction} from '../src/action-queue.js';
import {startSharedSocial,arriveSocial} from '../src/relationships.js';
import {LEISURE_CATALOG} from '../src/gifts-leisure.js';
import {NEED_DECAY_PER_MINUTE} from '../src/need-balance.js';

const clone=v=>JSON.parse(JSON.stringify(v));
const point={x:-.2,z:1.85};
const care=id=>({type:'object',actionId:id});
const pastime={type:'shared',mode:'leisure',choiceId:'music'};
const conversation={type:'conversation',targetId:'mira',topicId:'humor'};
const allLow=()=>{const s=newGame();Object.assign(s.needs,
  {hunger:6,energy:9,hygiene:11,fun:12});refreshMind(s);return s;};

test('M2: only derived canonical mood is used, never the cached save label',()=>{
  const s=allLow(),command=conversation;
  const first=moodActionPolicy(s,command);
  assert.equal(first.willing,false);
  assert.ok(first.mood<40);
  assert.ok(first.reason&&typeof first.reason==='string');
  const before=JSON.stringify(s);
  s.mind.mood={value:100,label:'OK'};
  assert.equal(moodActionPolicy(s,command).willing,false);
  s.mind.mood={value:0,label:'BAD'};
  assert.equal(moodActionPolicy(s,command).mood,first.mood);
  assert.notEqual(JSON.stringify(s),before); // only explicit test tampering did change it
  const immutable=JSON.stringify(s);
  for(let i=0;i<4;i++)moodActionPolicy(s,command);
  assert.equal(JSON.stringify(s),immutable);
});

test('M2: basic food, sleep and hygiene care cannot be refused even in collapse',()=>{
  const s=allLow();
  for(const id of ['fridge','bed','shower','sofa']){
    const result=moodActionPolicy(s,care(id));
    assert.equal(result.willing,true,id);
    assert.equal(result.reason,null);
    if(id!=='sofa')assert.equal(result.efficiency,1);
  }
});

test('M2: direct legacy talk/argue and unilateral separation are protected',()=>{
  const s=allLow();
  for(const command of [
    {type:'social',actionId:'talk'},{type:'social',actionId:'argue'},
    {type:'branch',actionId:'romance.breakup'},
    {type:'branch',actionId:'romance.divorce'},
    {type:'branch',actionId:'romance.propose'}
  ])assert.equal(moodActionPolicy(s,command).willing,true,JSON.stringify(command));
  assert.equal(moodActionPolicy(s,{type:'social',actionId:'talk'},{automatic:true}).willing,false);
});

test('M2: mood can refuse OPTIONAL leisure, long talks, teasing, and even gifts when exhausted',()=>{
  const s=allLow();
  for(const cmd of [conversation,pastime,
    {type:'shared',mode:'gift',choiceId:'a1'},
    {type:'branch',actionId:'friend.tease'},
    {type:'branch',actionId:'acquaint.chat'}]){
    const r=moodActionPolicy(s,cmd);
    assert.equal(r.willing,false,JSON.stringify(cmd));
    assert.ok(r.reason.includes('устал'));
  }
});

test('M2: character resilience changes threshold, but every policy remains bounded',()=>{
  const s=newGame();
  s.personality=createProfile(['temperament.calm','habits.neat']);
  const stoic=moodActionPolicy(s,conversation);
  s.personality=createProfile(['temperament.hotheaded','habits.neat']);
  const sensitive=moodActionPolicy(s,conversation);
  assert.ok(stoic.threshold<sensitive.threshold);
  for(const need of [0,12,25,49,68,80,100]){
    Object.assign(s.needs,{hunger:need,energy:need,hygiene:need,fun:need});
    for(const action of [care('sofa'),pastime,conversation,care('bed')]){
      const result=moodActionPolicy(s,action);
      assert.ok(result.mood>=0&&result.mood<=100);
      assert.ok(result.efficiency>=.85&&result.efficiency<=1.12);
      assert.equal(Number.isFinite(result.efficiency),true);
    }
  }
});

test('M2: high mood gives leisure bonus, low mood slows it, ordinary mood stays close to x1',()=>{
  const low=allLow(),high=newGame();
  Object.assign(high.needs,{hunger:95,energy:96,hygiene:96,fun:95});
  refreshMind(high);
  const slow=voluntaryMoodEfficiency(low,care('sofa'));
  const fast=voluntaryMoodEfficiency(high,care('sofa'));
  assert.ok(slow>=.85&&slow<1);
  assert.ok(fast>=1&&fast<=1.12);
  assert.ok(fast>slow);
  assert.equal(voluntaryMoodEfficiency(low,care('bed')),1);
  assert.equal(voluntaryMoodEfficiency(high,care('shower')),1);
  assert.equal(voluntaryMoodEfficiency(low,{type:'social',actionId:'talk'}),1);
});

test('M2: sofa experience changes fun gain but never movement or fixed action duration',()=>{
  const make=(hunger,energy,hygiene)=>{
    const s=newGame();
    Object.assign(s.needs,{hunger,energy,hygiene,fun:30});
    refreshMind(s);assert.equal(chooseAction(s,'sofa'),true);
    arrive(s);assert.equal(s.action.phase,'using');
    const before=s.needs.fun;
    tick(s,1);
    return {s,gained:s.needs.fun-before+NEED_DECAY_PER_MINUTE.fun};
  };
  const low=make(8,12,17),high=make(94,94,94);
  assert.ok(high.gained>low.gained+0.07);
  assert.equal(high.s.action.elapsed,1);
  assert.equal(low.s.action.elapsed,1);
  assert.equal(high.s.action.id,'sofa');
  assert.equal(low.s.action.id,'sofa');
});

test('M2: essential sleeping gets exactly original benefit regardless of bad mood',()=>{
  const s=allLow();s.needs.energy=25;refreshMind(s);
  assert.equal(chooseAction(s,'bed'),true);arrive(s);
  const before=s.needs.energy;
  tick(s,5);
  assert.ok(Math.abs(s.needs.energy-(before+5*(.74-NEED_DECAY_PER_MINUTE.energy)))<1e-6);
  assert.equal(s.action.elapsed,5);
});

test('M2: queue refusal consumes ONLY a startable head, then later task waits its turn',()=>{
  const ids=['nova','iris','riven'];
  const q=newActionQueues(ids);
  const a=enqueueAction(q,'nova',{type:'conversation',targetId:'iris',topicId:'humor'});
  const next=enqueueAction(q,'nova',care('bed'));
  const another=enqueueAction(q,'riven',care('fridge'));
  const attitudes={nova:allLow(),iris:newGame(),riven:newGame()};
  const notices=[];
  const dispatch=()=>dispatchActionQueues(q,{
    canStart:()=>true,
    beforeStart:(id,cmd)=>moodActionPolicy(attitudes[id],cmd).reason,
    onRefused:(id,cmd,reason)=>notices.push({id,seq:cmd.seq,reason}),
    start:()=>true
  });
  const started=dispatch();
  assert.deepEqual(started.map(x=>x.command.seq),[another.seq]);
  assert.equal(notices.length,1);
  assert.equal(notices[0].seq,a.seq);
  assert.deepEqual(pendingActions(q,'nova').map(x=>x.seq),[next.seq]);
  assert.equal(pendingActions(q,'iris').length,0);
  assert.equal(dispatch().length,1);
  assert.equal(pendingActions(q,'nova').length,0);
});

test('M2: blocked resources do NOT trigger refusal, drop, or queue jumping',()=>{
  const q=newActionQueues(['nova','iris']);
  const old=enqueueAction(q,'nova',{type:'conversation',targetId:'iris',topicId:'humor'});
  enqueueAction(q,'nova',care('fridge'));
  let refusalChecks=0,started=0;
  const run=available=>dispatchActionQueues(q,{
    canStart:()=>available,
    beforeStart:()=>{refusalChecks++;return 'Не хочет';},
    start:()=>{started++;return true;}
  });
  assert.deepEqual(run(false),[]);
  assert.equal(refusalChecks,0);
  assert.equal(started,0);
  assert.equal(pendingActions(q,'nova').length,2);
  assert.deepEqual(run(true),[]);
  assert.equal(refusalChecks,1);
  assert.equal(started,0);
  assert.deepEqual(pendingActions(q,'nova').map(x=>x.type),['object']);
  assert.equal(pendingActions(q,'nova')[0].seq,old.seq+1);
});

test('M2: refusing personal initiative cannot produce social graph receipts or memories',()=>{
  const root=newHousehold();
  Object.assign(root.needs,allLow().needs);refreshMind(root);
  const first=enqueueAction(root.actionQueues,'alex',pastime.targetId
    ?pastime:{...pastime,targetId:'mira'});
  const seq=root.socialGraph.nextSeq,graph=JSON.stringify(root.socialGraph);
  const memories=JSON.stringify(root.mind.memories),friendship=root.relationship.affinity;
  const refused=[];
  dispatchActionQueues(root.actionQueues,{
    canStart:()=>true,
    beforeStart:(id,cmd)=>moodActionPolicy(id==='alex'?root:root.otherSim,cmd).reason,
    onRefused:(id,cmd,reason)=>refused.push({id,reason}),
    start:()=>{throw Error('refused task must not start');}
  });
  assert.equal(refused.length,1);
  assert.equal(pendingActions(root.actionQueues,'alex').length,0);
  assert.equal(root.socialGraph.nextSeq,seq);
  assert.equal(JSON.stringify(root.socialGraph),graph);
  assert.equal(JSON.stringify(root.mind.memories),memories);
  assert.equal(root.relationship.affinity,friendship);
  const loaded=loadHousehold(clone(root));
  assert.equal(loaded.actionQueues.byResident.alex.length,0);
  assert.equal(loaded.version,1);
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.ok(first);
});

test('M2: old v1 saved working action never gets interrupted by mood change',()=>{
  const s=newGame();
  assert.equal(chooseAction(s,'sofa'),true);arrive(s);
  const restored=loadGame(clone(s));
  Object.assign(restored.needs,allLow().needs);refreshMind(restored);
  const previous=restored.action.elapsed;
  tick(restored,3);
  assert.equal(restored.action?.id,'sofa');
  assert.equal(restored.action.elapsed,previous+3);
  assert.equal(restored.version,1);
  assert.ok(restored.needs.fun>=0);
});

test('M2: accepted leisure rewards two individual needs using mood BEFORE new positive memory',()=>{
  const s=newHousehold();
  Object.assign(s.needs,{hunger:12,energy:13,hygiene:18,fun:35});
  Object.assign(s.otherSim.needs,{hunger:94,energy:93,hygiene:94,fun:35});
  refreshMind(s);refreshMind(s.otherSim);
  assert.equal(startSharedSocial(s,'alex',point,'leisure','music'),true);
  assert.equal(arriveSocial(s),true);
  const affinity=s.relationship.affinity;
  tickHousehold(s,LEISURE_CATALOG.music.duration+1);
  assert.equal(s.socialAction,null);
  assert.equal(s.relationship.affinity,affinity+4);
  assert.equal(s.mind.memories.filter(x=>x.id==='leisure.music').length,1);
  assert.equal(s.otherSim.mind.memories.filter(x=>x.id==='leisure.music').length,1);
  const after=clone(s);
  tickHousehold(s,1);
  assert.equal(s.relationship.affinity,after.relationship.affinity);
  assert.equal(s.mind.memories.filter(x=>x.id==='leisure.music').length,1);
});

test('M2: user pause freezes new action effectiveness and shared queues',()=>{
  const s=newHousehold();
  assert.ok(enqueueAction(s.actionQueues,'alex',{type:'conversation',targetId:'mira',topicId:'humor'}));
  s.paused=true;
  const data=JSON.stringify(s);
  tickHousehold(s,15);
  assert.equal(JSON.stringify(s),data);
  const policy=moodActionPolicy(s,{type:'conversation',topicId:'humor'});
  assert.ok(policy);
  assert.equal(JSON.stringify(s),data);
});

test('M2: policies and callbacks are wired in game without bypassing UI, saves or the 1.0q decision gate',()=>{
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const sim=readFileSync(new URL('../src/simulation.js',import.meta.url),'utf8');
  const gifts=readFileSync(new URL('../src/gifts-leisure.js',import.meta.url),'utf8');
  const queue=readFileSync(new URL('../src/action-queue.js',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../.github/workflows/mood-m2-checks.yml',import.meta.url),'utf8');
  assert.match(game,/if\(game.paused\|\|dialogueNeedsDecision\(game\)\)return \[\];/);
  assert.match(game,/beforeStart\(residentId,command\)/);
  assert.match(game,/onRefused\(residentId,command,reason\)/);
  assert.match(game,/if\(started.length\|\|refused.length\)save\(true\)/);
  assert.match(game,/if\(willing\)resident.autonomy.nextAt=game.minutes\+15/);
  assert.match(game,/renderQueuePanel\(true\)/);
  assert.match(sim,/if\(state.action.id==='sofa'\)gained\*=voluntaryMoodEfficiency/);
  assert.match(gifts,/const giverGain=12\*voluntaryMoodEfficiency/);
  assert.match(queue,/if\(!canStart\(residentId,command\)\)continue;/);
  assert.match(workflow,/npm test/);
  assert.doesNotMatch(workflow,/deploy-pages|upload-pages|pages: write/);
});

test('1.0s release retains M2 in Pages, preserves 1.0q dialogue, M1 and Safari cache URLs',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  const lock=JSON.parse(readFileSync(new URL('../package-lock.json',import.meta.url),'utf8'));
  assert.match(workflow,/node --check src\/mood-action-policy\.js/);
  assert.match(workflow,/cp src\/mood-action-policy\.js site\/src\//);
  assert.match(workflow,/src\/game\.js src\/simulation\.js/);
  assert.match(workflow,/src\/mood-presentation\.js src\/social-perspective\.js/);
  assert.match(workflow,/src\/conversation-engine\.js src\/dialogue-decision\.js src\/world-interactions\.js src\/gifts-leisure\.js/);
  assert.match(html,/сборка \/ 1\.1k/);
  assert.match(html,/styles\.css\?v=1\.1k/);
  assert.match(html,/src\/game\.js\?v=1\.1k/);
  assert.match(html,/id="mood-orbit"/);
  assert.match(html,/id="mood-overview"/);
  assert.match(html,/id="conversation-panel"/);
  assert.equal(pkg.version,'1.0.0-alpha.37');
  assert.equal(lock.version,pkg.version);
  assert.equal(lock.packages[''].version,pkg.version);
});
