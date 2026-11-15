import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newSocialGraph,markAcquainted,applySocialEvent,getPair,
  observePairViews,restoreSocialGraph} from '../src/social-graph.js';
import {pairDynamic,proposeAutonomousSocial,PAIR_DYNAMICS,
  DYNAMIC_WINDOW_DAYS,AUTONOMOUS_PAIR_COOLDOWN,
  AUTONOMOUS_REFUSAL_COOLDOWN} from '../src/social-dynamics.js';
import {newActionQueues,enqueueAction,pendingActions} from '../src/action-queue.js';
import {newHousehold,loadHousehold,chooseResidentAction} from '../src/household.js';
import {autonomousSocialChoice,startSocial,arriveSocial,tickSocial,
  canStartSocial} from '../src/relationships.js';
import {ACTIONS,SAVE_KEY} from '../src/simulation.js';

const DAY=1440,ids=['nova','ember','iris','riven','opal'],spot={x:-.2,z:1.85};
const copy=o=>JSON.parse(JSON.stringify(o));
const file=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const event=(g,a,b,type,at)=>applySocialEvent(g,{actorId:a,targetId:b,type,at});
const resident=(fun=20)=>({needs:{energy:85,hunger:83,hygiene:85,fun},
  mind:{mood:{value:65}},autonomy:{enabled:true,nextAt:0},
  paused:false,action:null,personality:{schema:1,
    traitIds:['temperament.cheerful','social.outgoing'],
    preferences:{likes:['socializing'],dislikes:[]}}});
const context=(g,other={})=>({
  graph:g,actorId:'nova',minutes:900,residents:Object.fromEntries(ids.map(id=>[id,resident()])),
  queues:newActionQueues(ids),nextSocialAt:0,enabled:true,...other
});

test('1.0h patterns are original qualitative, not a visible hidden score',()=>{
  assert.deepEqual(Object.keys(PAIR_DYNAMICS),
    ['forming','supportive','playful','strained','distant']);
  for(const info of Object.values(PAIR_DYNAMICS)){
    assert.ok(info.label.length>=8);
    assert.ok(info.description.length>=12);
  }
  assert.equal(DYNAMIC_WINDOW_DAYS,14);
  assert.ok(AUTONOMOUS_REFUSAL_COOLDOWN>AUTONOMOUS_PAIR_COOLDOWN);
});

test('a single encounter or many repeated talks on one day form no false pair dynamic',()=>{
  const g=newSocialGraph(ids);
  const before=pairDynamic(null,'nova',900);
  assert.equal(before.id,'forming');
  markAcquainted(g,'nova','ember',480);
  for(let i=0;i<30;i++)event(g,'nova','ember','talk',510+i*6);
  const p=getPair(g,'nova','ember');
  const x=pairDynamic(p,'nova',900);
  assert.equal(x.id,'forming');
  assert.deepEqual(pairDynamic(p,'badID',900),before);
  assert.equal(pairDynamic(p,'nova',-20).id,'forming');
  assert.equal(pairDynamic(p,'nova',NaN).id,'forming');
  assert.equal(p.events.length,30);
});

test('supportive bond emerges slowly from distinct positive completed meetings',()=>{
  const g=newSocialGraph(ids);
  markAcquainted(g,'nova','ember',400);
  const p=getPair(g,'nova','ember');
  observePairViews(g,'nova','ember',{
    nova:{friendship:70,trust:78,tension:10},
    ember:{friendship:48,trust:35,tension:10}});
  event(g,'nova','ember','conversation.talk',540);
  event(g,'nova','ember','gift.accepted',DAY+530);
  assert.equal(pairDynamic(p,'nova',DAY+550).id,'forming');
  event(g,'nova','ember','friend.confide',DAY+560);
  assert.equal(pairDynamic(p,'nova',DAY+570).id,'supportive');
  assert.equal(pairDynamic(p,'ember',DAY+570).id,'forming',
    'the same history may feel different if directed trust differs');
  assert.equal(pairDynamic(p,'nova',DAY+570).label,'Поддерживают друг друга');
});

test('mutual playful history is different from friendliness or tension',()=>{
  const g=newSocialGraph(ids);
  const p=getPair(g,'nova','ember')||(
    markAcquainted(g,'nova','ember',300),getPair(g,'nova','ember'));
  observePairViews(g,'nova','ember',{
    nova:{friendship:78,trust:66,tension:7},
    ember:{friendship:72,trust:62,tension:9}});
  event(g,'nova','ember','friend.tease',560);
  event(g,'ember','nova','leisure.accepted',DAY+530);
  event(g,'nova','ember','talk',DAY+570);
  assert.equal(pairDynamic(p,'nova',DAY+580).id,'playful');
  assert.equal(pairDynamic(p,'ember',DAY+580).id,'playful');
});

test('two-day repeated conflict forms a strained dynamic, not instant affection',()=>{
  const g=newSocialGraph(ids);
  event(g,'nova','ember','argue',500);
  event(g,'ember','nova','conversation.argue',DAY+500);
  event(g,'nova','ember','rival.taunt',DAY+550);
  const p=getPair(g,'nova','ember');
  assert.equal(pairDynamic(p,'ember',DAY+570).id,'strained');
  assert.equal(pairDynamic(p,'nova',DAY+570).id,'strained');
  assert.equal(pairDynamic(p,'ember',DAY*20).id,'forming',
    'without new interactions the derived recent pattern fades');
});

test('repeated refusals can yield gentle distance without anger or permanent lock',()=>{
  const g=newSocialGraph(ids);
  event(g,'nova','ember','gift.refused',500);
  event(g,'nova','ember','leisure.refused',DAY+500);
  event(g,'nova','ember','acquaint.chat.refused',DAY+570);
  const p=getPair(g,'nova','ember');
  assert.equal(pairDynamic(p,'nova',DAY+600).id,'distant');
  assert.ok(pairDynamic(p,'nova',DAY+600).description.includes('сближении'));
});

test('five independent pairs never share dynamic state, and save restore is stable',()=>{
  const g=newSocialGraph(ids);
  for(const [a,b] of [['nova','ember'],['iris','riven']])
    markAcquainted(g,a,b,450);
  event(g,'nova','ember','argue',500);
  event(g,'nova','ember','rival.taunt',DAY+500);
  event(g,'nova','ember','conversation.argue',DAY+550);
  event(g,'iris','riven','conversation.talk',500);
  event(g,'iris','riven','gift.accepted',DAY+500);
  event(g,'iris','riven','friend.confide',DAY+550);
  const snapshot=copy(g),first=pairDynamic(getPair(g,'nova','ember'),'ember',DAY+600);
  const loaded=restoreSocialGraph(snapshot,ids);
  assert.deepEqual(loaded,g);
  assert.deepEqual(pairDynamic(getPair(loaded,'nova','ember'),'ember',DAY+600),first);
  assert.equal(pairDynamic(getPair(loaded,'iris','riven'),'iris',DAY+600).id,'supportive');
  assert.equal(pairDynamic(getPair(loaded,'nova','opal'),'nova',DAY+600).id,'forming');
  assert.equal(Object.keys(g.pairs).length,2);
});

test('idle social proposal finds a known consenting resident without changing root or FIFO',()=>{
  const g=newSocialGraph(ids);
  markAcquainted(g,'nova','ember',480);
  const c=context(g);
  const snap=JSON.stringify(c);
  const result=proposeAutonomousSocial(c);
  assert.ok(result);
  assert.equal(result.actorId,'nova');
  assert.equal(result.targetId,'ember');
  assert.equal(result.kind,'talk');
  assert.ok(Number.isInteger(result.score));
  assert.equal(JSON.stringify(c),snap);
  assert.deepEqual(pendingActions(c.queues,'nova'),[]);
  assert.deepEqual(pendingActions(c.queues,'ember'),[]);
});

test('candidate selection across many IDs prefers real social history, not array order',()=>{
  const g=newSocialGraph(ids);
  markAcquainted(g,'nova','ember',480);
  markAcquainted(g,'nova','opal',480);
  observePairViews(g,'nova','ember',{
    nova:{friendship:34,trust:32,tension:42},
    ember:{friendship:36,trust:30,tension:38}});
  observePairViews(g,'nova','opal',{
    nova:{friendship:91,trust:86,tension:3},
    opal:{friendship:87,trust:85,tension:4}});
  const x=proposeAutonomousSocial(context(g));
  assert.equal(x?.targetId,'opal');
});

test('manual queued items of either resident and active work always veto automatic invite',()=>{
  const g=newSocialGraph(ids);
  markAcquainted(g,'nova','ember',480);
  const c=context(g);
  const current=JSON.stringify(c);
  enqueueAction(c.queues,'nova',{type:'object',actionId:'bed'});
  assert.equal(proposeAutonomousSocial(c),null);
  c.queues=newActionQueues(ids);
  enqueueAction(c.queues,'ember',{type:'object',actionId:'shower'});
  assert.equal(proposeAutonomousSocial(c),null);
  c.queues=newActionQueues(ids);
  c.residents.ember.action={id:'bed',phase:'using',elapsed:2};
  assert.equal(proposeAutonomousSocial(c),null);
  c.residents.ember.action=null;c.residents.nova.action={id:'sofa',phase:'using'};
  assert.equal(proposeAutonomousSocial(c),null);
  c.residents.nova.action=null;c.socialBusy=true;
  assert.equal(proposeAutonomousSocial(c),null);
  c.socialBusy=false;
  assert.ok(proposeAutonomousSocial(c));
  assert.ok(current.length>0);
});

test('pausing, autonomy OFF, low needs, bad mood and early start all suppress invites',()=>{
  const g=newSocialGraph(ids);markAcquainted(g,'nova','ember',480);
  const c=context(g);
  assert.equal(proposeAutonomousSocial({...c,paused:true}),null);
  assert.equal(proposeAutonomousSocial({...c,enabled:false}),null);
  assert.equal(proposeAutonomousSocial({...c,queues:null}),null,
    'without per-resident queues we must fail closed');
  assert.equal(proposeAutonomousSocial({...c,minutes:539}),null);
  assert.equal(proposeAutonomousSocial({...c,nextSocialAt:960}),null);
  c.residents.nova.needs.energy=20;assert.equal(proposeAutonomousSocial(c),null);
  c.residents.nova.needs.energy=85;
  c.residents.ember.needs.hunger=25;assert.equal(proposeAutonomousSocial(c),null);
  c.residents.ember.needs.hunger=83;
  c.residents.ember.mind.mood.value=28;assert.equal(proposeAutonomousSocial(c),null);
  c.residents.ember.mind.mood.value=65;
  c.residents.nova.mind.mood.value=25;assert.equal(proposeAutonomousSocial(c),null);
  c.residents.nova.mind.mood.value=65;
  c.residents.nova.needs.fun=97;assert.equal(proposeAutonomousSocial(c),null);
});

test('after a recent kind reply or refusal the couple is left in peace',()=>{
  const g=newSocialGraph(ids);
  const c=context(g,{minutes:DAY+600});
  event(g,'nova','ember','talk',DAY+500);
  assert.equal(proposeAutonomousSocial(c),null);
  c.minutes=DAY+500+AUTONOMOUS_PAIR_COOLDOWN;
  assert.equal(proposeAutonomousSocial(c)?.kind,'talk');
  event(g,'nova','ember','gift.refused',DAY+800);
  c.minutes=DAY+800+AUTONOMOUS_PAIR_COOLDOWN+5;
  assert.equal(proposeAutonomousSocial(c),null);
  c.minutes=DAY+800+AUTONOMOUS_REFUSAL_COOLDOWN;
  assert.equal(proposeAutonomousSocial(c)?.kind,'talk',
    'respectful conversation can resume after a long quiet interval');
});

test('rare high tension with low mood permits previous conflict behaviour but only when idle',()=>{
  const g=newSocialGraph(ids);
  markAcquainted(g,'nova','ember',480);
  const c=context(g);
  c.residents.nova.needs.fun=20;
  c.residents.nova.mind.mood.value=38;
  const p=getPair(g,'nova','ember');
  p.views.nova.tension=90;
  assert.equal(proposeAutonomousSocial(c)?.kind,'argue');
  p.views.nova.tension=10;
  assert.equal(proposeAutonomousSocial(c)?.kind,'talk');
  c.queues.byResident.ember.push({seq:1,type:'object',actionId:'bed'});
  assert.equal(proposeAutonomousSocial(c),null);
});

test('qualified remorse preserves a noninterrupting voluntary peace initiative',()=>{
  const g=newSocialGraph(ids);
  event(g,'nova','ember','argue',600);
  const c=context(g,{minutes:600+180,reconcileTargetId:'nova',actorId:'ember'});
  c.residents.ember.needs.fun=91;
  c.residents.ember.mind.mood.value=31;
  assert.equal(proposeAutonomousSocial(c)?.kind,'talk');
  c.reconcileTargetId=null;
  assert.equal(proposeAutonomousSocial(c),null);
});

test('recent quarrel triggers a longer rest, and hurt reduces voluntary pursuit',()=>{
  const g=newSocialGraph(ids);
  event(g,'nova','ember','argue',700);
  const c=context(g,{minutes:1200});
  assert.equal(proposeAutonomousSocial(c),null);
  c.minutes=700+AUTONOMOUS_REFUSAL_COOLDOWN;
  const x=proposeAutonomousSocial(c);
  assert.ok(x===null||x.kind==='talk');
  assert.ok(!x||x.kind!=='argue','no automatic quarrel for mere boredom');
});

test('discovered explicit desire for space stops pushy low-trust invitations',()=>{
  const g=newSocialGraph(ids);
  markAcquainted(g,'nova','ember',480);
  const p=getPair(g,'nova','ember');
  const q=event(g,'nova','ember','conversation.talk',550);
  p.cues.nova=[{id:'space',count:2,lastSeq:q.seq,at:q.at}];
  const c=context(g,{minutes:1300});
  c.residents.ember.personality={schema:1,traitIds:[
    'social.reserved','values.independent'],preferences:{likes:[],dislikes:[]}};
  assert.equal(proposeAutonomousSocial(c),null);
  p.views.nova.trust=75;
  assert.ok(proposeAutonomousSocial(c)?.kind==='talk');
});

test('real two-person adapter preserves manual social controls, active work and saved queues',()=>{
  const root=newHousehold();
  root.minutes=1100;root.otherSim.minutes=1100;
  root.relationship.nextSocialAt=0;
  root.needs.fun=20;
  root.otherSim.needs.fun=20;
  assert.equal(autonomousSocialChoice(root,'alex'),'talk');
  const queued=enqueueAction(root.actionQueues,'mira',{type:'object',actionId:'fridge'});
  assert.equal(autonomousSocialChoice(root,'alex'),null);
  assert.equal(autonomousSocialChoice(root,'mira'),null);
  const saved=copy(root),reloaded=loadHousehold(saved);
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.equal(reloaded.version,1);
  assert.equal(reloaded.actionQueues.byResident.mira[0].seq,queued.seq);
  assert.equal(autonomousSocialChoice(reloaded,'alex'),null);
  root.actionQueues.byResident.mira=[];
  assert.ok(chooseResidentAction(root,'bed',false,'mira'));
  assert.equal(autonomousSocialChoice(root,'alex'),null);
  assert.equal(root.otherSim.action.id,'bed');
  root.otherSim.action=null;
  assert.equal(startSocial(root,'argue','alex',spot,false),true);
  assert.equal(root.socialAction.kind,'argue');
  assert.equal(autonomousSocialChoice(root,'mira'),null);
  assert.equal(canStartSocial(root,'talk','mira'),false);
});

test('autonomy proposal is stateless and repeated previews do not schedule jobs',()=>{
  const g=newSocialGraph(ids);
  markAcquainted(g,'nova','ember',480);
  const c=context(g);
  const snapshot=copy(c);
  for(let i=0;i<40;i++)
    assert.deepEqual(proposeAutonomousSocial(c),proposeAutonomousSocial(c));
  assert.deepEqual(c,snapshot);
  assert.equal(c.queues.nextSeq,1);
  assert.equal(g.nextSeq,1);
  assert.equal(g.pairs[JSON.stringify(['ember','nova'])].events.length,0);
});

test('Pages, text-only UI and save contract include the read-only pair dynamics',()=>{
  const html=file('../index.html'),js=file('../src/game.js');
  const module=file('../src/social-dynamics.js');
  const relation=file('../src/relationships.js');
  const flow=file('../.github/workflows/pages.yml');
  assert.ok(html.includes('сборка / 1.1'));
  assert.ok(html.includes('id="mind-dynamic"'));
  assert.ok(js.includes('pairDynamic(memoryPair,game.selectedSim,game.minutes)'));
  assert.ok(js.includes('const socialIdea=autonomousSocialChoice(game,residentId)'));
  assert.ok(js.includes('resident.autonomy.nextAt=game.minutes+15'));
  assert.ok(relation.includes('proposeAutonomousSocial({'));
  assert.ok(flow.includes('node --check src/social-dynamics.js'));
  assert.ok(flow.includes('src/social-boundaries.js src/social-dynamics.js src/romance.js src/reaction-badges.js'));
  assert.ok(!/\b(alex|mira|document|localStorage|playcanvas)\b/i.test(module));
  assert.ok(!module.includes('Math.random('));
  assert.ok(!module.includes('enqueueAction('));
  assert.ok(!module.includes('root.version'));
});
