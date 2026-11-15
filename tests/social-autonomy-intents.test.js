import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newSocialGraph,markAcquainted,getPair,applySocialEvent,
  observePairViews} from '../src/social-graph.js';
import {newActionQueues,enqueueAction,pendingActions} from '../src/action-queue.js';
import {createProfile,DEMO_PROFILES} from '../src/trait-catalog.js';
import {proposeAutonomousSocial,autonomousLeisureToken,
  AUTONOMOUS_LEISURE,AUTONOMOUS_FRIEND_BRANCHES,
  AUTONOMOUS_PAIR_COOLDOWN} from '../src/social-dynamics.js';
import {newHousehold,loadHousehold,tickHousehold,
  chooseResidentAction,setHouseholdAutonomy} from '../src/household.js';
import {startSharedSocial,startBranchSocial,autonomousSocialChoice,
  arriveSocial,cancelSocial,tickSocial,startSocial} from '../src/relationships.js';
import {LEISURE_CATALOG,evaluateLeisure,sharedDuration} from '../src/gifts-leisure.js';
import {SAVE_KEY} from '../src/simulation.js';

const ids=['nova','ember','iris','opal','riven'],place={x:-.2,z:1.85};
const copy=x=>JSON.parse(JSON.stringify(x));
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const evt=(g,a,b,type,at,token=null)=>applySocialEvent(g,{
  actorId:a,targetId:b,type,at,...(token?{token}:{})
});
const profile=(likes,dislikes=[])=>createProfile(
  ['temperament.cheerful','social.outgoing'],{likes,dislikes});
const actor=(likes=['books'],fun=22)=>({
  needs:{energy:88,hunger:88,hygiene:87,fun},
  personality:profile(likes),
  mind:{mood:{value:72}},paused:false,autonomy:{enabled:true},
  action:null
});
function generic(own=['books'],other=['books']){
  const graph=newSocialGraph(ids);
  markAcquainted(graph,'nova','ember',480);
  observePairViews(graph,'nova','ember',{
    nova:{friendship:70,trust:72,tension:3},
    ember:{friendship:71,trust:70,tension:5}
  });
  const residents=Object.fromEntries(ids.map(id=>[id,actor([])]));
  residents.nova=actor(own);residents.ember=actor(other);
  return {graph,residents,queues:newActionQueues(ids),
    actorId:'nova',minutes:1000,nextSocialAt:0,enabled:true};
}
function legacy(){
  const s=newHousehold();
  s.minutes=1000;s.otherSim.minutes=1000;
  s.needs.fun=20;s.otherSim.needs.fun=20;
  s.mind.mood.value=75;s.otherSim.mind.mood.value=75;
  s.relationship.nextSocialAt=0;
  s.relationship.views.alex.friendship=75;
  s.relationship.views.alex.trust=75;
  s.relationship.views.mira.friendship=75;
  s.relationship.views.mira.trust=75;
  const pair=getPair(s.socialGraph,'alex','mira');
  pair.views.alex={friendship:75,trust:75,tension:0};
  pair.views.mira={friendship:75,trust:75,tension:0};
  return s;
}
function recordLeisure(g,from,to,mode,at){
  return evt(g,from,to,'leisure.accepted',at,
    autonomousLeisureToken(mode,g.nextSeq));
}

test('1.0i offered spontaneous leisure uses only existing typed catalog',()=>{
  assert.deepEqual(AUTONOMOUS_LEISURE,Object.keys(LEISURE_CATALOG));
  assert.deepEqual(AUTONOMOUS_FRIEND_BRANCHES,
    ['acquaint.chat','friend.tease','friend.confide']);
  const c=generic(['music'],['music']);
  const result=proposeAutonomousSocial(c);
  assert.equal(result?.kind,'talk');
  assert.deepEqual(result?.action,{type:'shared',mode:'leisure',choiceId:'music'});
  assert.equal(c.graph.nextSeq,1);
  assert.deepEqual(pendingActions(c.queues,'nova'),[]);
});

test('hobby suggestion follows a character own taste, not a partners secret taste',()=>{
  const c=generic([],['music']);
  assert.equal(proposeAutonomousSocial(c)?.action,undefined,
    'recipient liking music is not disclosed to an uninformed initiator');
  const first=evt(c.graph,'nova','ember','conversation.talk',580);
  const pair=getPair(c.graph,'nova','ember');
  pair.knowledge.nova=[{tag:'music',stance:'likes',seq:first.seq,at:first.at}];
  c.minutes=580+AUTONOMOUS_PAIR_COOLDOWN;
  assert.deepEqual(proposeAutonomousSocial(c)?.action,
    {type:'shared',mode:'leisure',choiceId:'music'});
  assert.deepEqual(pair.knowledge.ember,[]);
});

test('explicit disliked hobbies and strong mutual tension veto spontaneous leisure',()=>{
  const c=generic(['books'],[]);
  c.residents.ember.personality=profile(['music'],['books']);
  assert.equal(proposeAutonomousSocial(c)?.action,undefined);
  c.residents.ember.personality=profile(['books']);
  c.graph.pairs[JSON.stringify(['ember','nova'])].views.ember.tension=93;
  assert.equal(proposeAutonomousSocial(c)?.action,undefined);
});

test('real last completed leisure token rotates activities instead of grinding one',()=>{
  const c=generic(['books','music'],['books','music']);
  assert.equal(proposeAutonomousSocial(c)?.action.choiceId,'books',
    'deterministic tie resolution');
  const token=autonomousLeisureToken('books',c.graph.nextSeq);
  assert.equal(token,'auto.leisure.books:1');
  assert.equal(autonomousLeisureToken('bad',1),null);
  assert.equal(autonomousLeisureToken('music',-1),null);
  recordLeisure(c.graph,'nova','ember','books',900);
  c.minutes=900+AUTONOMOUS_PAIR_COOLDOWN;
  assert.deepEqual(proposeAutonomousSocial(c)?.action,
    {type:'shared',mode:'leisure',choiceId:'music'});
  assert.deepEqual(getPair(c.graph,'nova','ember').events.at(-1).token,token);
});

test('cancelled, proposed and refused shared leisure never set completed-activity token',()=>{
  const c=generic(['music'],['music']);
  proposeAutonomousSocial(c);
  assert.equal(getPair(c.graph,'nova','ember').events.length,0);
  const r=evt(c.graph,'nova','ember','leisure.refused',800);
  assert.equal(r.token,undefined);
  assert.equal(getPair(c.graph,'nova','ember').events.length,1);
});

test('past talk can evolve into existing acquaintance branch without new graph actions',()=>{
  const c=generic([],[]);
  evt(c.graph,'nova','ember','talk',580);
  c.minutes=580+AUTONOMOUS_PAIR_COOLDOWN;
  assert.deepEqual(proposeAutonomousSocial(c)?.action,
    {type:'branch',actionId:'acquaint.chat'});
});

test('supportive friendship proposes existing confidences and playful friendship teasing',()=>{
  const c=generic([],[]);
  const pair=getPair(c.graph,'nova','ember');
  pair.friendship='friends';
  pair.views.nova.trust=82;pair.views.ember.trust=80;
  pair.views.nova.friendship=84;pair.views.ember.friendship=83;
  evt(c.graph,'nova','ember','conversation.talk',560);
  evt(c.graph,'nova','ember','gift.accepted',1440+560);
  evt(c.graph,'nova','ember','friend.confide',1440+590);
  c.minutes=1440+590+AUTONOMOUS_PAIR_COOLDOWN;
  assert.equal(proposeAutonomousSocial(c)?.action,undefined,
    'do not repeat the same branch immediately');
  // With a different latest confirmed action, supportive bond may confide.
  evt(c.graph,'nova','ember','talk',1440+995);
  c.minutes=1440+995+AUTONOMOUS_PAIR_COOLDOWN;
  assert.deepEqual(proposeAutonomousSocial(c)?.action,
    {type:'branch',actionId:'friend.confide'});
  // Another pair has a playful pattern with different actual history.
  const q=generic([],[]);
  const p=getPair(q.graph,'nova','ember');
  p.friendship='friends';
  p.views.nova.trust=74;p.views.ember.trust=70;
  evt(q.graph,'nova','ember','friend.tease',560);
  evt(q.graph,'ember','nova','leisure.accepted',1440+560);
  evt(q.graph,'nova','ember','talk',1440+590);
  q.minutes=1440+590+AUTONOMOUS_PAIR_COOLDOWN;
  assert.deepEqual(proposeAutonomousSocial(q)?.action,
    {type:'branch',actionId:'friend.tease'});
});

test('physiology, pending FIFO, pause or busy target block every advanced proposal',()=>{
  const c=generic(['books'],['books']);
  enqueueAction(c.queues,'ember',{type:'object',actionId:'fridge'});
  assert.equal(proposeAutonomousSocial(c),null);
  c.queues=newActionQueues(ids);
  c.residents.ember.action={id:'bed',phase:'using'};
  assert.equal(proposeAutonomousSocial(c),null);
  c.residents.ember.action=null;
  c.residents.nova.needs.energy=13;
  assert.equal(proposeAutonomousSocial(c),null);
  c.residents.nova.needs.energy=88;
  assert.equal(proposeAutonomousSocial({...c,paused:true}),null);
  assert.equal(proposeAutonomousSocial({...c,socialBusy:true}),null);
});

test('automatic leisure uses real session and saves/restores midway without rewards',()=>{
  const s=legacy();
  assert.equal(evaluateLeisure(s,'alex','books').accepted,true);
  assert.equal(startSharedSocial(s,'alex',place,'leisure','books',true),true);
  assert.equal(s.socialAction.automatic,true);
  assert.equal(s.socialAction.shared.choiceId,'books');
  const start=copy(s),affinity=s.relationship.affinity,fun=s.needs.fun;
  let restored=loadHousehold(start);
  assert.equal(restored.socialAction.automatic,true);
  assert.equal(restored.socialAction.phase,'walking');
  arriveSocial(restored);
  tickHousehold(restored,10);
  assert.equal(restored.relationship.affinity,affinity);
  assert.equal(restored.needs.fun<fun,true,'needs still decay before completion');
  restored=loadHousehold(copy(restored));
  assert.ok(restored.socialAction?.shared);
  tickHousehold(restored,sharedDuration(restored.socialAction.shared)+1);
  assert.equal(restored.socialAction,null);
  assert.equal(restored.relationship.affinity,affinity+4);
  assert.equal(getPair(restored.socialGraph,'alex','mira').events.at(-1).token,
    'auto.leisure.books:'+String(restored.socialGraph.nextSeq-1));
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.equal(restored.version,1);
});

test('auto leisure cancellation while walking emits zero rewards or completed event',()=>{
  const s=legacy();
  const initial=copy(s);
  assert.equal(startSharedSocial(s,'alex',place,'leisure','books',true),true);
  assert.equal(cancelSocial(s),true);
  assert.equal(s.relationship.affinity,initial.relationship.affinity);
  assert.equal(s.socialGraph.nextSeq,initial.socialGraph.nextSeq);
  assert.equal(s.mind.memories.length,0);
  assert.equal(getPair(s.socialGraph,'alex','mira').events.length,0);
});

test('automatic gift cannot consume any player goods; manual gift remains possible',()=>{
  const s=legacy(),items=copy(s.inventory);
  assert.equal(startSharedSocial(s,'alex',place,'gift','a1',true),false);
  assert.deepEqual(s.inventory,items);
  assert.equal(s.socialAction,null);
  assert.equal(startSharedSocial(s,'alex',place,'gift','a1'),true);
  assert.equal(s.socialAction.automatic,false);
});

test('automatic branch is allowed only if real existing friendship branch is eligible',()=>{
  const s=legacy();
  assert.equal(startBranchSocial(s,'alex',place,'rival.taunt',true),false);
  assert.equal(startBranchSocial(s,'alex',place,'friend.tease',true),false);
  assert.equal(startBranchSocial(s,'alex',place,'acquaint.chat',true),true);
  assert.equal(s.socialAction.automatic,true);
  assert.deepEqual(s.socialAction.branchAction,{id:'acquaint.chat'});
  let r=loadHousehold(copy(s));
  assert.ok(r.socialAction?.branchAction);
  arriveSocial(r);tickHousehold(r,19);
  assert.equal(r.socialAction,null);
  assert.equal(getPair(r.socialGraph,'alex','mira').events.at(-1).type,'acquaint.chat');
});

test('auto branch restore rejects forbidden conflict branch and auto gift files',()=>{
  const s=legacy();
  startBranchSocial(s,'alex',place,'acquaint.chat',true);
  const bad=copy(s);
  bad.socialAction.branchAction.id='rival.taunt';
  assert.equal(loadHousehold(bad).socialAction,null);
  bad.socialAction=copy(s.socialAction);
  bad.socialAction.branchAction.id='friend.confide';
  assert.equal(loadHousehold(bad).socialAction,null,
    'friend branch requires actual directed trust/friendship');
  const gift=legacy();
  startSharedSocial(gift,'alex',place,'gift','a1');
  const forged=copy(gift);forged.socialAction.automatic=true;
  assert.equal(loadHousehold(forged).socialAction,null);
});

test('autonomous adapter returns structured leisure plan without changing legacy talk/argue',()=>{
  const s=legacy();
  const proposal=autonomousSocialChoice(s,'alex');
  assert.deepEqual(proposal,
    {kind:'talk',type:'shared',mode:'leisure',choiceId:'books'});
  assert.equal(s.socialAction,null);
  assert.deepEqual(s.actionQueues.byResident.alex,[]);
  assert.equal(s.relationship.affinity,50);
  enqueueAction(s.actionQueues,'mira',{type:'object',actionId:'shower'});
  assert.equal(autonomousSocialChoice(s,'alex'),null);
});

test('autonomy switch off drops only existing automatic shared session, not queued work',()=>{
  const s=legacy();
  startSharedSocial(s,'alex',place,'leisure','books',true);
  const task=enqueueAction(s.actionQueues,'alex',
    {type:'object',actionId:'fridge'});
  assert.ok(s.socialAction?.automatic);
  setHouseholdAutonomy(s,false);
  assert.equal(s.socialAction,null);
  assert.equal(s.actionQueues.byResident.alex[0].seq,task.seq);
  assert.deepEqual(getPair(s.socialGraph,'alex','mira').events,[]);
  assert.equal(s.relationship.affinity,50);
});

test('final player-facing and deploy wiring handles structured automation',()=>{
  const game=read('../src/game.js'),rel=read('../src/relationships.js'),
    core=read('../src/social-dynamics.js'),html=read('../index.html'),
    workflow=read('../.github/workflows/pages.yml');
  assert.ok(html.includes('сборка / 1.1'));
  assert.ok(game.includes("plan.type==='shared'"));
  assert.ok(game.includes("plan.type==='branch'"));
  assert.ok(game.includes('shared.mode,shared.choiceId,automatic'));
  assert.ok(rel.includes("mode!=='leisure'"));
  assert.ok(rel.includes('autonomousLeisureToken'));
  assert.ok(core.includes('last=recentLeisureChoice(pair)'));
  assert.ok(workflow.includes('node --check src/social-dynamics.js'));
  assert.ok(workflow.includes('src/social-boundaries.js src/social-dynamics.js src/romance.js src/reaction-badges.js'));
  assert.ok(!/\b(alex|mira|document|localStorage|playcanvas)\b/i.test(core));
});
