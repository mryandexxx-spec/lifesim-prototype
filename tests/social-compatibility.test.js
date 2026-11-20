import {findMarketPlacement,buyMarketItem} from '../src/furniture-shop.js';
import {planPairedHobby} from '../src/paired-hobby.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createProfile,DEMO_PROFILES} from '../src/trait-catalog.js';
import {socialCompatibility,newSocialKnowledge,discoverPreference,
  restoreSocialKnowledge,knownPreferences,discoveryNotes,KNOWLEDGE_LIMIT,
  CONVERSATION_DISCOVERY_TAGS} from '../src/social-compatibility.js';
import {newSocialGraph,applySocialEvent,getPair,learnSocialPreference,
  socialKnowledgeNotes,restoreSocialGraph,episodeContext} from '../src/social-graph.js';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {startConversation,chooseSocialLine,finishSocialConversation,
  arriveSocial,startSharedSocial,cancelSocial} from '../src/relationships.js';
import {evaluateResponse} from '../src/conversation-engine.js';
import {GIFT_DURATION,sharedDuration} from '../src/gifts-leisure.js';
import {SAVE_KEY} from '../src/simulation.js';

const clone=x=>JSON.parse(JSON.stringify(x));
const spot={x:-.2,z:1.85};
const names=['nova','ember','iris','riven','dorian'];
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const a=createProfile(['social.outgoing','values.empathetic'],{
  likes:['music'],dislikes:[]});
const b=createProfile(['social.reserved','values.independent'],{
  likes:[],dislikes:['music']});
const line=(graph,actorId,targetId,type,at)=>applySocialEvent(
  graph,{actorId,targetId,type,at});

test('1.0f stable directed compatibility is personality-based, not shared affinity',()=>{
  const aa=socialCompatibility(a,a);
  const ab=socialCompatibility(a,b);
  const ba=socialCompatibility(b,a);
  assert.ok(aa.bias>ab.bias);
  assert.notEqual(ab.bias,ba.bias,'viewer priorities and tastes are directional');
  for(const r of [aa,ab,ba]){
    assert.ok(Number.isInteger(r.bias)&&r.bias>=-9&&r.bias<=9);
    assert.ok(['easy','uneven','mixed'].includes(r.style));
  }
  assert.deepEqual(socialCompatibility(null,b),{bias:0,style:'unknown'});
  assert.deepEqual(socialCompatibility(a,{}),{bias:0,style:'unknown'});
  assert.deepEqual(socialCompatibility(a,b),ab);
  assert.equal(JSON.stringify(a).includes('socialGraph'),false);
});

test('the core stores knowledge by arbitrary IDs with no special-cased residents',()=>{
  const graph=newSocialGraph(names);
  assert.deepEqual(newSocialKnowledge('nova','ember'),{nova:[],ember:[]});
  assert.deepEqual(newSocialKnowledge('nova','nova'),{});
  const receipt=line(graph,'nova','ember','conversation.talk',500);
  assert.ok(receipt);
  assert.deepEqual(socialKnowledgeNotes(graph,'nova','ember'),[]);
  assert.ok(learnSocialPreference(graph,receipt,'nova','ember',b,'music'));
  assert.deepEqual(socialKnowledgeNotes(graph,'nova','ember').map(x=>x.text),
    ['•'.slice(1)+'Не любит музыку']);
  assert.equal(knownPreferences(getPair(graph,'nova','ember'),'nova')[0].stance,'dislikes');
  assert.deepEqual(socialKnowledgeNotes(graph,'ember','nova'),[]);
  assert.deepEqual(socialKnowledgeNotes(graph,'iris','riven'),[]);
  assert.equal(getPair(graph,'nova','iris'),null);
});

test('a caller cannot invent learning without a matching completed social receipt',()=>{
  const g=newSocialGraph(names);
  const p=getPair(g,'nova','ember');
  assert.equal(p,null);
  assert.equal(learnSocialPreference(g,null,'nova','ember',a,'music'),null);
  let receipt=line(g,'nova','ember','argue',500);
  assert.equal(learnSocialPreference(g,receipt,'nova','ember',b,'music'),null,
    'quarrel is not a discussion of interests');
  receipt=line(g,'nova','ember','conversation.talk',510);
  assert.equal(learnSocialPreference(g,{...receipt,seq:999},'nova','ember',b,'music'),null);
  assert.equal(learnSocialPreference(g,{...receipt,actorId:'ember'},'nova','ember',b,'music'),null);
  assert.equal(learnSocialPreference(g,receipt,'nova','nova',b,'music'),null);
  assert.equal(learnSocialPreference(g,receipt,'nova','ember',b,'privateData'),null);
  assert.ok(learnSocialPreference(g,receipt,'nova','ember',b,'music'));
  assert.equal(learnSocialPreference(g,receipt,'nova','ember',b,'music'),null,
    'repeated identical knowledge cannot be farmed');
  assert.equal(getPair(g,'nova','ember').knowledge.nova.length,1);
});

test('two residents can learn opposing individual things without globally revealing profiles',()=>{
  const g=newSocialGraph(names);
  const r1=line(g,'nova','ember','conversation.talk',500);
  learnSocialPreference(g,r1,'nova','ember',b,'music');
  const r2=line(g,'ember','nova','conversation.talk',520);
  learnSocialPreference(g,r2,'ember','nova',a,'music');
  const pair=getPair(g,'ember','nova');
  assert.deepEqual(discoveryNotes(pair,'nova'),[{tag:'music',stance:'dislikes',text:'Не любит музыку'}]);
  assert.deepEqual(discoveryNotes(pair,'ember'),[{tag:'music',stance:'likes',text:'Любит музыку'}]);
  assert.equal(episodeContext(g,'nova','ember',530).bias,0);
});

test('loaded legacy graph has no fabricated knowledge and no retroactive reveal',()=>{
  const g=newSocialGraph(names);
  line(g,'nova','ember','conversation.talk',500);
  const old=clone(g);
  for(const pair of Object.values(old.pairs))delete pair.knowledge;
  const restored=restoreSocialGraph(old,names);
  assert.deepEqual(getPair(restored,'nova','ember').knowledge,{ember:[],nova:[]});
  assert.deepEqual(socialKnowledgeNotes(restored,'nova','ember'),[]);
  assert.equal(getPair(restored,'nova','ember').events.length,1);
});

test('knowledge restores validated catalogs and rejects corrupt timestamps, forged tags and seq',()=>{
  const g=newSocialGraph(names);
  const r=line(g,'nova','ember','conversation.talk',500);
  learnSocialPreference(g,r,'nova','ember',b,'music');
  const valid=clone(g);
  assert.deepEqual(restoreSocialGraph(valid,names),valid);
  const pair=getPair(valid,'nova','ember');
  pair.knowledge.nova.push(
    {tag:'injected',stance:'likes',seq:1,at:500},
    {tag:'books',stance:'superlikes',seq:1,at:500},
    {tag:'games',stance:'likes',seq:900,at:500},
    {tag:'drawing',stance:'likes',seq:1,at:900000},
    {tag:'parties',stance:'neutral',seq:1,at:500,html:'<script>'}
  );
  const loaded=restoreSocialGraph(valid,names);
  const learned=knownPreferences(getPair(loaded,'nova','ember'),'nova');
  assert.deepEqual(learned.map(x=>x.tag),['music','parties']);
  assert.ok(learned.every(x=>!Object.hasOwn(x,'html')));
  assert.equal(learned.length,2);
  assert.deepEqual(restoreSocialKnowledge({nova:'bad'},['nova','ember'],2,500),
    {nova:[],ember:[]});
  assert.deepEqual(restoreSocialKnowledge({},['nova','nova'],2,500),{});
});

test('eight-tag knowledge cap is safe during frequent generic 5-person interactions',()=>{
  const g=newSocialGraph(names);
  const prefs=createProfile(['social.outgoing','values.empathetic'],{
    likes:['music','books'],dislikes:['parties']});
  for(const id of names.filter(n=>n!=='nova')){
    const receipt=line(g,'nova',id,'leisure.accepted',500);
    for(const tag of ['music','books','drawing','games','calm_leisure','socializing','cooking','parties'])
      learnSocialPreference(g,receipt,'nova',id,prefs,tag);
    const known=socialKnowledgeNotes(g,'nova',id,KNOWLEDGE_LIMIT);
    assert.equal(known.length,KNOWLEDGE_LIMIT);
    assert.equal(socialKnowledgeNotes(g,id,'nova').length,0);
    assert.equal(getPair(g,'nova',id).knowledge.nova.length,KNOWLEDGE_LIMIT);
  }
  assert.equal(socialKnowledgeNotes(g,'nova','iris',1).length,1);
  assert.equal(names.length,5);
});

test('confirmed accepted hobby dialogue reveals specific taste, not just broad topic',()=>{
  const s=newHousehold();
  assert.deepEqual(socialKnowledgeNotes(s.socialGraph,'alex','mira'),[]);
  assert.equal(CONVERSATION_DISCOVERY_TAGS['hobbies.books'],'books');
  assert.equal(startConversation(s,'alex',spot,'hobbies'),true);
  assert.equal(chooseSocialLine(s,'hobbies.music'),null,'cannot learn while walking');
  assert.deepEqual(socialKnowledgeNotes(s.socialGraph,'alex','mira'),[]);
  arriveSocial(s);
  const answer=chooseSocialLine(s,'hobbies.music');
  assert.equal(answer?.accepted,true,'Mira likes music');
  assert.deepEqual(socialKnowledgeNotes(s.socialGraph,'alex','mira'),[],
    'learning waits for actual conversation completion');
  assert.ok(finishSocialConversation(s));
  assert.deepEqual(socialKnowledgeNotes(s.socialGraph,'alex','mira').map(x=>x.text),
    ['Любит музыку']);
  assert.deepEqual(socialKnowledgeNotes(s.socialGraph,'mira','alex'),[]);
  assert.equal(s.relationship.lastKind,'talk');
});

test('abandoning a spoken session does not disclose saved information prematurely',()=>{
  const s=newHousehold();
  startConversation(s,'alex',spot,'hobbies');
  arriveSocial(s);chooseSocialLine(s,'hobbies.music');
  assert.deepEqual(socialKnowledgeNotes(s.socialGraph,'alex','mira'),[]);
  const snapshot=clone(s);
  const resumed=loadHousehold(snapshot);
  assert.deepEqual(socialKnowledgeNotes(resumed.socialGraph,'alex','mira'),[]);
  cancelSocial(resumed);
  assert.deepEqual(socialKnowledgeNotes(resumed.socialGraph,'alex','mira'),[]);
});

test('completed accepted gift and leisure can teach initiator about the actual recipient',()=>{
  const gift=newHousehold();
  assert.equal(startSharedSocial(gift,'alex',spot,'gift','a1'),true);
  assert.deepEqual(socialKnowledgeNotes(gift.socialGraph,'alex','mira'),[]);
  arriveSocial(gift);tickHousehold(gift,GIFT_DURATION+1);
  assert.deepEqual(socialKnowledgeNotes(gift.socialGraph,'alex','mira')
    .map(x=>x.text),['Любит музыку']);
  assert.deepEqual(socialKnowledgeNotes(gift.socialGraph,'mira','alex'),[]);
  const leisure=newHousehold();
  const pose=findMarketPlacement(leisure.world.furniture,leisure.shop,'bookcase.starter');
  assert.ok(pose);
  const bought=buyMarketItem(leisure.world.furniture,leisure.shop,'bookcase.starter',pose);
  assert.equal(bought.ok,true);
  leisure.world.furniture=bought.world;leisure.shop=bought.shop;
  const plan=planPairedHobby(leisure,'mira','books',bought.instanceId);
  assert.ok(plan);
  assert.equal(startSharedSocial(leisure,'mira',plan.places.mira,'leisure','books',false,plan),true);
  leisure.position={...plan.places.alex};leisure.otherSim.position={...plan.places.mira};
  arriveSocial(leisure);tickHousehold(leisure,sharedDuration({mode:'leisure',choiceId:'books'})+1);
  assert.deepEqual(socialKnowledgeNotes(leisure.socialGraph,'mira','alex')
    .map(x=>x.text),['Любит книги']);
  assert.deepEqual(socialKnowledgeNotes(leisure.socialGraph,'alex','mira'),[]);
});

test('failed gift never reveals a taste, even if the receiver does not want it',()=>{
  const s=newHousehold();
  s.relationship.views.mira.trust=0;
  s.relationship.views.mira.tension=100;
  assert.equal(startSharedSocial(s,'alex',spot,'gift','a2'),true);
  arriveSocial(s);tickHousehold(s,GIFT_DURATION+1);
  assert.deepEqual(socialKnowledgeNotes(s.socialGraph,'alex','mira'),[]);
});

test('stored knowledge survives save reload without revealing a secret second direction',()=>{
  const s=newHousehold();
  startConversation(s,'alex',spot,'hobbies');
  arriveSocial(s);
  chooseSocialLine(s,'hobbies.music');
  finishSocialConversation(s);
  const before=clone(s);
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  const restored=loadHousehold(before);
  assert.equal(restored.version,1);
  assert.deepEqual(socialKnowledgeNotes(restored.socialGraph,'alex','mira'),
    socialKnowledgeNotes(s.socialGraph,'alex','mira'));
  assert.deepEqual(socialKnowledgeNotes(restored.socialGraph,'mira','alex'),[]);
  assert.deepEqual(restoreSocialGraph(restored.socialGraph,['alex','mira']),
    restored.socialGraph);
});

test('compatibility changes the real social evaluation while existing direct affordance persists',()=>{
  const s=newHousehold();
  const baseline=evaluateResponse(s,'alex','daily','daily.news');
  const original=clone(s.personality);
  s.personality=clone(s.otherSim.personality);
  const aligned=evaluateResponse(s,'alex','daily','daily.news');
  assert.ok(aligned.confidence>=baseline.confidence,
    'two identical profiles are at least as comfortable as different routines');
  assert.equal(typeof baseline.accepted,'boolean');
  assert.equal(typeof aligned.accepted,'boolean');
  s.personality=original;
  assert.deepEqual(socialKnowledgeNotes(s.socialGraph,'alex','mira'),[],
    'compatibility alone is never a spoiler');
});

test('UI and Pages carry the new knowledge implementation without exposing numeric chemistry',()=>{
  const page=read('../index.html'),ui=read('../src/game.js'),
    graph=read('../src/social-graph.js'),engine=read('../src/social-reactions.js'),
    flow=read('../.github/workflows/pages.yml'),core=read('../src/social-compatibility.js');
  assert.ok(page.includes('сборка / 1.2'));
  assert.ok(page.includes('id="mind-discovery"'));
  assert.ok(page.includes('id="mind-discovery-person"'));
  assert.ok(ui.includes('socialKnowledgeNotes(game.socialGraph,mindInspectResident,otherId,4)'));
  assert.ok(ui.includes('Пока не узнал(а) предпочтения собеседника'));
  assert.ok(graph.includes('discoverPreference(pair,receipt'));
  assert.ok(graph.includes('restoreSocialKnowledge(entry.knowledge'));
  assert.ok(engine.includes('compatibilityBias'));
  assert.ok(flow.includes('node --check src/social-compatibility.js'));
  assert.ok(flow.includes('src/social-episodes.js src/social-compatibility.js src/social-boundaries.js src/social-dynamics.js src/romance.js src/reaction-badges.js'));
  assert.ok(!/\b(alex|mira|document|localStorage|playcanvas)\b/i.test(core),
    'headless ID-agnostic implementation');
});
