test('in-game friendly branch is unlocked only after mutual status and completes once',()=>{
  const s=newHousehold(),g=s.socialGraph;
  for(const id of ['alex','mira']){
    s.relationship.views[id].friendship=80;
    s.relationship.views[id].trust=76;
    s.relationship.views[id].tension=0;
  }
  for(const [type,at] of [['talk',480],['gift.accepted',485],['leisure.accepted',1950]])
    applySocialEvent(g,{type,at,actorId:'alex',targetId:'mira'},
      {observedViews:{alex:s.relationship.views.alex,mira:s.relationship.views.mira}});
  assert.equal(relationSummary(g,'alex','mira').friendship,'friends');
  assert.equal(startBranchSocial(s,'alex',place,'friend.tease'),true);
  arriveSocial(s);
  tickSocial(s,19);
  assert.equal(s.socialAction,null);
  assert.equal(s.relationship.affinity,56);
  assert.equal(g.pairs[pairKey('alex','mira')].events.at(-1).type,'friend.tease');
  assert.equal(g.pairs[pairKey('alex','mira')].counts.positive,4);
  tickSocial(s,19);
  assert.equal(g.pairs[pairKey('alex','mira')].counts.positive,4);
});
test('in-game mutual enemies can confront and record asymmetric conflict',()=>{
  const s=newHousehold(),g=s.socialGraph;
  for(const id of ['alex','mira']){
    s.relationship.views[id].friendship=14;
    s.relationship.views[id].trust=12;
    s.relationship.views[id].tension=92;
  }
  const observed={alex:s.relationship.views.alex,mira:s.relationship.views.mira};
  for(const [type,at] of [['argue',480],['rival.taunt',520]])
    applySocialEvent(g,{type,at,actorId:'alex',targetId:'mira'},{observedViews:observed});
  assert.equal(relationSummary(g,'alex','mira').rivalry,'mutual');
  assert.equal(startBranchSocial(s,'mira',place,'rival.taunt'),true);
  arriveSocial(s);tickSocial(s,19);
  assert.equal(s.socialAction,null);
  assert.equal(s.relationship.affinity,45);
  assert.equal(s.mind.memories.at(-1).id,'hurt');
  assert.equal(s.otherSim.mind.memories.at(-1).id,'regret');
  assert.equal(g.pairs[pairKey('alex','mira')].events.at(-1).type,'rival.taunt');
});

test('unknown residents can introduce themselves without earning free friendship',()=>{
  const g=newSocialGraph(ids);
  const actions=availableSocialActions(g,'nova','ember');
  assert.equal(actions.find(a=>a.id==='acquaint.introduce').enabled,true);
  assert.equal(actions.find(a=>a.id==='acquaint.chat').enabled,false);
  assert.equal(resolveBranchResponse(g,'nova','ember','acquaint.introduce').type,'introduced');
  assert.ok(event(g,'nova','ember','introduced',480));
  assert.equal(relationSummary(g,'nova','ember').label,'Знакомые');
  assert.equal(getPair(g,'nova','ember').counts.positive,0);
  assert.equal(availableSocialActions(g,'nova','ember').find(a=>a.id==='acquaint.introduce').enabled,false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GRAPH_SCHEMA,MAX_PEOPLE,EVENT_LIMIT,newSocialGraph,registerPerson,pairKey,
  validPersonId,getPair,getOrCreatePair,getDirectedView,listRelationsFor,
  markAcquainted,observePairViews,applySocialEvent,relationSummary,
  availableSocialActions,resolveBranchResponse,restoreSocialGraph} from '../src/social-graph.js';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {startSocial,arriveSocial,startBranchSocial,cancelSocial,tickSocial,
  SOCIAL_ACTIONS,startConversation,chooseSocialLine,finishSocialConversation,
  startSharedSocial} from '../src/relationships.js';
import {SAVE_KEY} from '../src/simulation.js';

const ids=['nova','ember','iris','riven','dorian'];
const place={x:-.2,z:1.85};
const clone=x=>JSON.parse(JSON.stringify(x));
const views=(x=50,t=45,z=0)=>({friendship:x,trust:t,tension:z});
const score=(a,b=views())=>({nova:a,ember:b});
const event=(g,a,b,type,at,token)=>applySocialEvent(g,{actorId:a,targetId:b,type,at,token});
const pair=(g,a,b)=>getOrCreatePair(g,a,b);
test('five arbitrary residents, no preallocated N² relationships, no Alex/Mira dependency',()=>{
  const g=newSocialGraph(ids);
  assert.equal(g.schema,GRAPH_SCHEMA);
  assert.deepEqual(g.persons,ids);
  assert.equal(Object.keys(g.pairs).length,0);
  assert.equal(getPair(g,'nova','ember'),null);
  assert.equal(getDirectedView(g,'nova','ember'),null);
  assert.ok(pair(g,'nova','ember'));
  assert.ok(pair(g,'nova','riven'));
  assert.ok(pair(g,'iris','dorian'));
  assert.equal(Object.keys(g.pairs).length,3);
  assert.equal(listRelationsFor(g,'nova').length,2);
  assert.equal(listRelationsFor(g,'ember').length,1);
  assert.equal(listRelationsFor(g,'iris').length,1);
  assert.equal(listRelationsFor(g,'dorian').length,1);
  assert.equal(pairKey('nova','ember'),pairKey('ember','nova'));
  assert.equal(pairKey('a_b','ab'),pairKey('ab','a_b'));
  assert.notEqual(pairKey('a','bc'),pairKey('ab','c'));
});
test('person registration updates index, pairs never share state',()=>{
  const g=newSocialGraph(['nova','ember','iris']);
  pair(g,'nova','ember');
  assert.equal(registerPerson(g,'riven'),true);
  assert.equal(registerPerson(g,'dorian'),true);
  assert.equal(registerPerson(g,'dorian'),true);
  assert.equal(g.persons.length,5);
  pair(g,'nova','riven');pair(g,'ember','dorian');
  assert.equal(listRelationsFor(g,'nova').length,2);
  assert.equal(listRelationsFor(g,'ember').length,2);
  assert.equal(listRelationsFor(g,'dorian').length,1);
  assert.equal(getOrCreatePair(g,'nova','stranger'),null);
  assert.equal(registerPerson(g,'<script>'),false);
  assert.equal(getOrCreatePair(g,'nova','nova'),null);
  assert.equal(pairKey('nova','nova'),null);
});
test('malformed or duplicate identity cannot create an edge',()=>{
  assert.equal(validPersonId('__proto__'),false);
  assert.equal(validPersonId('alpha-beta_02'),true);
  assert.equal(pairKey('a','a'),null);
  assert.throws(()=>newSocialGraph(['nova','nova']),/Duplicate/);
  assert.throws(()=>newSocialGraph(['good','bad name']),/invalid resident/);
  assert.throws(()=>newSocialGraph(Array.from({length:MAX_PEOPLE+1},(_,i)=>'p'+i)),RangeError);
  const g=newSocialGraph(ids);
  assert.equal(event(g,'nova','nova','talk',10),null);
  assert.equal(event(g,'nova','bad name','talk',10),null);
  assert.equal(Object.keys(g.pairs).length,0);
});
test('meeting must precede acquaintance; introduction is not friendship',()=>{
  const g=newSocialGraph(ids);
  assert.equal(relationSummary(g,'nova','ember').met,false);
  assert.equal(markAcquainted(g,'nova','ember',480),true);
  assert.equal(markAcquainted(g,'nova','ember',540),true);
  assert.equal(getPair(g,'nova','ember').metAt,480);
  assert.equal(relationSummary(g,'nova','ember').label,'Знакомые');
  assert.equal(getPair(g,'nova','ember').counts.positive,0);
  assert.equal(markAcquainted(g,'nova','nova',5),false);
  assert.equal(markAcquainted(g,'nova','ember',-1),false);
});
test('directed view scores differ, never spread to unrelated pairs',()=>{
  const g=newSocialGraph(ids);
  pair(g,'nova','ember');pair(g,'nova','iris');
  assert.equal(observePairViews(g,'nova','ember',
    {nova:views(92,80,0),ember:views(17,12,70)}),true);
  assert.equal(getDirectedView(g,'nova','ember').friendship,92);
  assert.equal(getDirectedView(g,'ember','nova').friendship,17);
  assert.equal(getDirectedView(g,'nova','iris').friendship,50);
  assert.notEqual(getDirectedView(g,'nova','ember'),getDirectedView(g,'ember','nova'));
  assert.equal(getPair(g,'nova','iris').counts.positive,0);
});
test('friendship needs mutual numbers, three diverse positive episodes and two days',()=>{
  const g=newSocialGraph(ids);
  assert.ok(event(g,'nova','ember','talk',480));
  assert.ok(event(g,'ember','nova','gift.accepted',481));
  let s=relationSummary(g,'nova','ember');
  assert.equal(s.friendship,'none');
  assert.equal(s.positive,2);
  assert.equal(s.days,1);
  assert.ok(event(g,'nova','ember','leisure.accepted',480+1440));
  s=relationSummary(g,'nova','ember');
  assert.equal(s.friendship,'friends');
  assert.equal(s.label,'Друзья');
  assert.equal(s.positive,3);
  assert.equal(s.days,2);
  assert.equal(getDirectedView(g,'ember','nova').trust>=50,true);
});
test('repeating same kind all day cannot farm relationship milestones',()=>{
  const g=newSocialGraph(ids);
  for(let i=0;i<40;i++)event(g,'nova','ember','talk',480+i);
  const p=getPair(g,'nova','ember');
  assert.equal(p.counts.positive,1);
  assert.equal(relationSummary(g,'nova','ember').friendship,'none');
  assert.equal(p.events.length,EVENT_LIMIT);
  assert.equal(g.nextSeq,41);
  assert.equal(p.positiveDays.length,1);
});
test('friendship can be one-sided in sentiment but requires bilateral commitment',()=>{
  const g=newSocialGraph(ids);
  pair(g,'nova','ember');
  observePairViews(g,'nova','ember',{nova:views(99,95,0),ember:views(25,15,5)});
  for(const [type,at] of [['talk',500],['gift.accepted',501],['leisure.accepted',1950]])
    event(g,'nova','ember',type,at);
  assert.equal(relationSummary(g,'nova','ember').friendship,'none');
  assert.equal(getDirectedView(g,'nova','ember').friendship,100);
  assert.equal(getDirectedView(g,'ember','nova').friendship<65,true);
});
test('good friends unlock playful jokes; trust unlocks deeper confidences',()=>{
  const g=newSocialGraph(ids);
  for(const [type,at] of [['talk',480],['gift.accepted',485],['leisure.accepted',1950]])
    event(g,'nova','ember',type,at);
  let actions=availableSocialActions(g,'nova','ember');
  assert.equal(actions.find(a=>a.id==='friend.tease').enabled,true);
  assert.equal(actions.find(a=>a.id==='friend.confide').enabled,false);
  assert.match(actions.find(a=>a.id==='friend.confide').reason,/доверие/);
  const p=getPair(g,'nova','ember');
  p.views.nova.trust=75;p.views.ember.trust=75;
  actions=availableSocialActions(g,'nova','ember');
  assert.equal(actions.find(a=>a.id==='friend.confide').enabled,true);
  assert.equal(resolveBranchResponse(g,'nova','ember','friend.tease').accepted,true);
  assert.equal(resolveBranchResponse(g,'nova','ember','friend.confide').accepted,true);
});
test('two fresh negative events and one-sided hostility mark only this pair',()=>{
  const g=newSocialGraph(ids);
  pair(g,'nova','ember');pair(g,'nova','iris');
  const visible={nova:views(18,20,80),ember:views(68,68,13)};
  for(const [type,at] of [['argue',480],['rival.taunt',500]])
    applySocialEvent(g,{actorId:'nova',targetId:'ember',type,at},{observedViews:visible});
  assert.equal(relationSummary(g,'nova','ember').rivalry,'oneSided');
  assert.equal(relationSummary(g,'ember','nova').label,'Неприязнь');
  assert.equal(relationSummary(g,'nova','iris').rivalry,'none');
  assert.equal(availableSocialActions(g,'nova','ember').find(a=>a.id==='rival.taunt').enabled,true);
  assert.equal(resolveBranchResponse(g,'nova','ember','rival.taunt').type,'rival.taunt');
  assert.equal(getPair(g,'nova','iris').counts.negative,0);
});
test('mutual enemies need hostility from both directions, not global meter',()=>{
  const g=newSocialGraph(ids);
  pair(g,'nova','ember');
  observePairViews(g,'nova','ember',{nova:views(15,12,80),ember:views(18,13,90)});
  event(g,'nova','ember','argue',480);
  event(g,'ember','nova','rival.taunt',500);
  assert.equal(relationSummary(g,'nova','ember').rivalry,'mutual');
  assert.equal(relationSummary(g,'ember','nova').label,'Враги');
  assert.equal(relationSummary(g,'nova','iris').label,'Незнакомы');
});
test('one single quarrel does not erase a historically earned friendship',()=>{
  const g=newSocialGraph(ids);
  for(const [type,at] of [['talk',480],['gift.accepted',481],['leisure.accepted',1950]])
    event(g,'nova','ember',type,at);
  assert.equal(relationSummary(g,'nova','ember').friendship,'friends');
  observePairViews(g,'nova','ember',{nova:views(20,10,95),ember:views(25,15,96)});
  event(g,'nova','ember','argue',2000);
  assert.equal(relationSummary(g,'nova','ember').friendship,'friends');
  event(g,'nova','ember','rival.taunt',2100);
  assert.equal(relationSummary(g,'nova','ember').friendship,'none');
});
test('truce can ease rivalry only after separate completed, positive activities',()=>{
  const g=newSocialGraph(ids);
  pair(g,'nova','ember');
  observePairViews(g,'nova','ember',{nova:views(20,20,85),ember:views(25,20,90)});
  event(g,'nova','ember','argue',480);
  event(g,'nova','ember','rival.taunt',500);
  assert.equal(relationSummary(g,'nova','ember').rivalry,'mutual');
  observePairViews(g,'nova','ember',{nova:views(35,44,25),ember:views(35,44,25)});
  applySocialEvent(g,{type:'rival.truce',actorId:'nova',targetId:'ember',at:600},
    {observedViews:{nova:views(35,44,25),ember:views(35,44,25)}});
  assert.equal(relationSummary(g,'nova','ember').rivalry,'mutual');
  applySocialEvent(g,{type:'leisure.accepted',actorId:'ember',targetId:'nova',at:610},
    {observedViews:{nova:views(38,48,21),ember:views(40,49,19)}});
  assert.equal(relationSummary(g,'nova','ember').rivalry,'none');
});
test('graph receipts have unique sequences even in same minute, token prevents replay',()=>{
  const g=newSocialGraph(ids);
  assert.equal(event(g,'nova','ember','talk',480,'receipt-1').seq,1);
  assert.equal(event(g,'nova','ember','gift.accepted',480,'receipt-2').seq,2);
  assert.equal(event(g,'nova','ember','gift.accepted',480,'receipt-2'),null);
  assert.equal(g.nextSeq,3);
  assert.equal(getPair(g,'nova','ember').counts.positive,2);
});
test('five-resident network survives JSON and continues without cross-link bleed',()=>{
  const g=newSocialGraph(ids);
  for(const [a,b,type,at] of [
    ['nova','ember','talk',480],['nova','ember','gift.accepted',481],
    ['nova','ember','leisure.accepted',1950],
    ['nova','riven','argue',480],['nova','riven','rival.taunt',500],
    ['iris','dorian','talk',550]
  ])event(g,a,b,type,at);
  const restored=restoreSocialGraph(clone(g),ids);
  assert.equal(Object.keys(restored.pairs).length,3);
  assert.equal(restored.nextSeq,g.nextSeq);
  assert.equal(relationSummary(restored,'nova','ember').label,'Друзья');
  assert.equal(relationSummary(restored,'nova','riven').friendship,'none');
  assert.equal(listRelationsFor(restored,'nova').length,2);
  assert.equal(listRelationsFor(restored,'dorian').length,1);
  assert.deepEqual(clone(restored),clone(g));
});
test('corrupt pair names, IDs, counters and event kinds are filtered from saved graph',()=>{
  const g=newSocialGraph(ids);
  pair(g,'nova','ember');
  const data=clone(g);
  data.pairs['__proto__']={ids:['nova','ember']};
  data.pairs['["nova","nova"]']={ids:['nova','nova']};
  data.pairs['["nova","intruder"]']={ids:['nova','intruder']};
  const key=pairKey('nova','ember');
  data.pairs[key].counts={positive:-100,negative:Infinity};
  data.pairs[key].events=[{seq:4,type:'evil',actorId:'nova',targetId:'ember',at:480}];
  const r=restoreSocialGraph(data,ids);
  assert.equal(Object.keys(r.pairs).length,1);
  assert.equal(r.pairs[key].counts.positive,0);
  assert.equal(r.pairs[key].events.length,0);
  assert.equal(r.pairs[key].friendship,'none');
});
test('old save migration preserves both old views and does not invent friends or marriage',()=>{
  const root=newHousehold();
  root.relationship.affinity=89;
  root.relationship.views.alex.friendship=92;
  root.relationship.views.alex.trust=87;
  root.relationship.views.mira.friendship=40;
  root.relationship.views.mira.trust=21;
  delete root.socialGraph;
  const resumed=loadHousehold(clone(root));
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.equal(resumed.version,1);
  assert.equal(resumed.relationship.affinity,89);
  assert.equal(resumed.relationship.views.alex.friendship,92);
  assert.equal(getDirectedView(resumed.socialGraph,'alex','mira').friendship,92);
  assert.equal(getDirectedView(resumed.socialGraph,'mira','alex').trust,21);
  assert.equal(relationSummary(resumed.socialGraph,'alex','mira').label,'Знакомые');
  assert.equal(getPair(resumed.socialGraph,'alex','mira').events.length,0);
  assert.equal(Object.hasOwn(resumed.socialGraph,'marriage'),false);
});
test('completed legacy talk/argue updates new milestone counters exactly once',()=>{
  const s=newHousehold();
  assert.equal(startSocial(s,'talk','alex',place),true);arriveSocial(s);
  tickSocial(s,SOCIAL_ACTIONS.talk.duration+1);
  assert.equal(s.relationship.affinity,58);
  assert.equal(getPair(s.socialGraph,'alex','mira').counts.positive,1);
  assert.equal(getPair(s.socialGraph,'alex','mira').events.length,1);
  tickSocial(s,999);
  assert.equal(getPair(s.socialGraph,'alex','mira').events.length,1);
  assert.equal(startSocial(s,'argue','mira',place),true);arriveSocial(s);
  tickSocial(s,SOCIAL_ACTIONS.argue.duration+1);
  assert.equal(s.relationship.affinity,46);
  assert.equal(getPair(s.socialGraph,'alex','mira').counts.negative,1);
  assert.equal(getPair(s.socialGraph,'alex','mira').events.length,2);
});
test('existing authored dialogue and completed gifts count for the same pair progress',()=>{
  const s=newHousehold();
  assert.equal(startConversation(s,'alex',place,'support'),true);arriveSocial(s);
  chooseSocialLine(s,'support.listen');finishSocialConversation(s);
  assert.equal(getPair(s.socialGraph,'alex','mira').counts.positive,1);
  assert.equal(startSharedSocial(s,'alex',place,'gift','a1'),true);arriveSocial(s);
  tickSocial(s,13);
  assert.equal(getPair(s.socialGraph,'alex','mira').counts.positive,2);
  assert.equal(s.inventory.mira.some(x=>x.id==='a1'),true);
  assert.equal(s.socialAction,null);
});
test('new branch interaction requires actual available milestone and walking',()=>{
  const s=newHousehold();
  assert.equal(startBranchSocial(s,'alex',place,'friend.tease'),false);
  assert.equal(startBranchSocial(s,'alex',place,'acquaint.chat'),true);
  assert.equal(s.socialAction.phase,'walking');
  tickSocial(s,25);
  assert.equal(s.relationship.affinity,50);
  arriveSocial(s);tickSocial(s,9);
  assert.equal(s.socialAction.phase,'using');
  assert.equal(getPair(s.socialGraph,'alex','mira').counts.positive,0);
  tickSocial(s,10);
  assert.equal(s.socialAction,null);
  assert.equal(s.relationship.affinity,56);
  assert.equal(getPair(s.socialGraph,'alex','mira').counts.positive,1);
  assert.equal(getPair(s.socialGraph,'alex','mira').events.at(-1).type,'acquaint.chat');
});
test('pending branch action roundtrips, cancellation is reward-free and pause freezes',()=>{
  const s=newHousehold();
  startBranchSocial(s,'alex',place,'acquaint.chat');arriveSocial(s);
  tickSocial(s,5);
  const loaded=loadHousehold(clone(s));
  assert.equal(loaded.socialAction.branchAction.id,'acquaint.chat');
  assert.equal(loaded.socialAction.elapsed,5);
  loaded.paused=true;
  const before=clone(loaded);
  tickHousehold(loaded,120);
  assert.deepEqual(clone(loaded),before);
  loaded.paused=false;
  assert.equal(cancelSocial(loaded),true);
  assert.equal(getPair(loaded.socialGraph,'alex','mira').events.length,0);
  assert.equal(loaded.relationship.affinity,50);
});
test('invalid saved branch action never becomes ordinary free talk',()=>{
  const s=newHousehold();
  startBranchSocial(s,'alex',place,'acquaint.chat');
  for(const bogus of [
    {id:'evil'},{id:'friend.tease'}, {id:'acquaint.chat',other:1},
    {id:'__proto__'},null
  ]){
    const raw=clone(s);raw.socialAction.branchAction=bogus;
    assert.equal(loadHousehold(raw).socialAction,null);
  }
});
test('view shows milestone reasons and touch UI includes new module in Pages artifact',()=>{
  const ui=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  for(const id of ['branch-btn','branch-close','branch-panel','branch-options',
    'relationship-branch','mind-relation-stage'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.ok(ui.includes('renderBranchPanel(false)'));
  assert.ok(ui.includes('branchDisplayKey'));
  assert.ok(ui.includes('startBranchSocial(game,actorId,best.goal,branchId)'));
  assert.ok(workflow.includes('node --check src/social-graph.js'));
  assert.ok(workflow.includes('src/social-graph.js src/action-queue.js src/conversation-engine.js'));
});
