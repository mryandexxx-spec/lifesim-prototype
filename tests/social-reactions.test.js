import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateSocialReaction,socialReactionContext,socialImpressionFactor,
  SOCIAL_REACTION_KINDS} from '../src/social-reactions.js';
import {newSocialGraph,getOrCreatePair,resolveBranchResponse} from '../src/social-graph.js';
import {newHousehold,loadHousehold} from '../src/household.js';
import {evaluateResponse} from '../src/conversation-engine.js';
import {evaluateGift,evaluateLeisure} from '../src/gifts-leisure.js';

const profile=(traits=[],likes=[],dislikes=[])=>({
  schema:1,traitIds:traits,preferences:{likes,dislikes}
});
const respondent=(personality=profile(),mood=65,negative=null)=>({
  personality,mind:{mood:{value:mood},memories:negative?[{id:negative,at:500,fulfilled:false}]:[],
    emotions:negative?[{source:negative,at:500,until:860,intensity:85,fulfilled:false}]:[]}
});
const view=(trust=45,tension=0,friendship=50)=>({trust,tension,friendship});
const evaluate=(kind,recipient,other={})=>evaluateSocialReaction({
  kind,recipient,view:view(),minutes:510,...other
});

test('one generic stateless engine handles all social response categories, no names or renderer',()=>{
  assert.deepEqual(SOCIAL_REACTION_KINDS,['conversation','gift','leisure','branch','direct']);
  const source=readFileSync(new URL('../src/social-reactions.js',import.meta.url),'utf8');
  assert.ok(!/\b(alex|mira|PlayCanvas|document|localStorage)\b/i.test(source));
  assert.equal(evaluateSocialReaction({kind:'unknown',minutes:510}),null);
  assert.equal(evaluateSocialReaction({kind:'branch',actionId:'fake',minutes:510}),null);
  const resident=respondent();
  const before=JSON.stringify(resident);
  const first=evaluate('gift',resident,{tag:'music'});
  const second=evaluate('gift',resident,{tag:'music'});
  assert.deepEqual(first,second);
  assert.equal(JSON.stringify(resident),before);
  assert.equal(evaluateSocialReaction({kind:'gift',minutes:-5}),null);
});

test('conversation keeps its supported topic/tone semantics and is resident-character dependent',()=>{
  const liking=respondent(profile(['temperament.cheerful','social.outgoing','values.empathetic'],['socializing']),85);
  const avoiding=respondent(profile(['temperament.melancholic','social.reserved'],[],['socializing']),24,'hurt');
  const args={tag:'socializing',tone:'warm',weight:4,view:view(35,25,50)};
  const yes=evaluate('conversation',liking,args);
  const no=evaluate('conversation',avoiding,args);
  assert.equal(yes.accepted,true);
  assert.equal(no.accepted,false);
  assert.ok(yes.score>no.score);
  assert.equal(evaluate('conversation',liking,{...args,tone:'sharp',weight:-4}).accepted,false);
});

test('gift acceptance and enjoyment use taste, empathy, trust and emotional context',()=>{
  const liking=respondent(profile(['values.empathetic'],['books']));
  const avoiding=respondent(profile(['social.reserved'],[],['books']),25,'argue');
  const good=evaluate('gift',liking,{tag:'books'});
  const bad=evaluate('gift',avoiding,{tag:'books'});
  assert.equal(good.accepted,true);
  assert.equal(good.liked,true);
  assert.equal(bad.accepted,false);
  assert.equal(bad.liked,false);
});

test('shared leisure now reacts to current distress, not just taste and relationship scores',()=>{
  const neutral=respondent();
  const anxious=respondent(profile(),25,'hurt');
  const normal=evaluate('leisure',neutral,{tag:'music',view:view(45,25)});
  const sad=evaluate('leisure',anxious,{tag:'music',view:view(45,25)});
  assert.equal(normal.accepted,true);
  assert.equal(sad.accepted,false);
  assert.ok(normal.score>sad.score);
  const liked=evaluate('leisure',respondent(profile([],['music'])),{tag:'music'});
  const disliked=evaluate('leisure',respondent(profile([],[],['music'])),{tag:'music'});
  assert.ok(liked.score>disliked.score);
});

test('friendship and conflict branch response uses same recipient mood, tastes and temperament',()=>{
  const g=newSocialGraph(['nova','ember','iris','riven','opal']);
  const pair=getOrCreatePair(g,'nova','ember');
  pair.metAt=0;pair.friendship='friends';
  pair.views.ember={trust:55,tension:27,friendship:65};
  pair.views.nova={trust:65,tension:5,friendship:75};
  const cheerful=respondent(profile(['temperament.cheerful','social.outgoing'],['games']),80);
  const unhappy=respondent(profile(['temperament.melancholic','social.reserved'],[],['games']),20,'hurt');
  const good=resolveBranchResponse(g,'nova','ember','friend.tease',{recipient:cheerful,minutes:510});
  const bad=resolveBranchResponse(g,'nova','ember','friend.tease',{recipient:unhappy,minutes:510});
  assert.equal(good.accepted,true);
  assert.equal(bad.accepted,false);
  assert.equal(bad.type,'friend.tease.refused');
  assert.equal(getOrCreatePair(g,'nova','ember').events.length,0,'evaluation never commits progress');
  assert.equal(getOrCreatePair(g,'nova','iris').events.length,0,'other pairs isolated');
  assert.equal(resolveBranchResponse(g,'nova','ember','friend.tease').accepted,true,
    'headless N-person callers without a body use neutral defaults');
  assert.equal(resolveBranchResponse(g,'nova','ember','friend.confide').accepted,false,
    'friendship unlocks do not bypass trust gates');
});

test('introductions remain possible, hostile confrontation remains hostile; unrelated gates stay intact',()=>{
  const g=newSocialGraph(['nova','ember','iris']);
  const newPerson=respondent(profile(),10,'hurt');
  assert.equal(resolveBranchResponse(g,'nova','ember','acquaint.introduce',
    {recipient:newPerson,minutes:510}).accepted,true);
  assert.equal(resolveBranchResponse(g,'nova','ember','friend.tease'),null);
  const pair=getOrCreatePair(g,'nova','ember');
  pair.metAt=0;pair.rivalry='mutual';
  assert.equal(resolveBranchResponse(g,'nova','ember','rival.taunt',
    {recipient:newPerson,minutes:510}).accepted,false);
});

test('direct legacy talk and argument cannot be blocked by mood, but memory impressions are personal',()=>{
  const sad=respondent(profile(['temperament.hotheaded','social.reserved']),5,'hurt');
  assert.equal(evaluate('direct',sad,{view:view(0,100,0)}).accepted,true);
  const calm=respondent(profile(['temperament.calm','values.empathetic']),75);
  const angry=respondent(profile(['temperament.hotheaded','social.outgoing']),75);
  const m={id:'hurt',at:510};
  const a=socialImpressionFactor(calm,m,510);
  const b=socialImpressionFactor(angry,m,510);
  assert.ok(Number.isFinite(a)&&Number.isFinite(b));
  assert.notEqual(a,b);
});

test('legacy adapters agree with the shared reaction interpreter without changing saved session format',()=>{
  const root=newHousehold();
  const response=evaluateResponse(root,'alex','support','support.listen');
  const same=evaluateSocialReaction({
    kind:'conversation',recipient:root.otherSim,
    view:root.relationship.views.mira,minutes:root.minutes,
    tag:'socializing',tone:'warm',weight:4
  });
  assert.deepEqual(response,{accepted:same.accepted,confidence:same.confidence});
  const gift=evaluateGift(root,'alex',{type:'postcard'});
  const sameGift=evaluateSocialReaction({
    kind:'gift',recipient:root.otherSim,view:root.relationship.views.mira,
    minutes:root.minutes,tag:'music'
  });
  assert.equal(gift.accepted,sameGift.accepted);
  assert.equal(evaluateLeisure(root,'alex','music').accepted,evaluateSocialReaction({
    kind:'leisure',recipient:root.otherSim,view:root.relationship.views.mira,
    minutes:root.minutes,tag:'music'
  }).accepted);
  const old=JSON.parse(JSON.stringify(root));
  delete old.actionQueues;delete old.socialGraph;
  const loaded=loadHousehold(old);
  assert.equal(loaded.version,1);
  assert.equal(loaded.actionQueues.schema,1);
  assert.ok(loaded.socialGraph);
  assert.deepEqual(loaded.relationship.views,root.relationship.views);
});

test('new reaction core is included in both CI syntax checks and deployed Pages source',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.ok(workflow.includes('node --check src/social-reactions.js'));
  assert.ok(workflow.includes('src/social-reactions.js src/characters.js'));
  assert.ok(html.includes('сборка / 1.0c'));
  assert.ok(!Object.keys(socialReactionContext(respondent(),view(),510)).includes('residentId'));
});
