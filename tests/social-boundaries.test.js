import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createProfile,DEMO_PROFILES} from '../src/trait-catalog.js';
import {cueFromAnswer,newSocialCues,knownSocialCues,observeSocialCue,
  restoreSocialCues,socialCueNotes,boundaryDisposition,cueConversationBias,
  CUE_LIMIT,CUE_IDS} from '../src/social-boundaries.js';
import {newSocialGraph,applySocialEvent,getPair,learnSocialCue,
  socialCommunicationNotes,socialCommunicationBias,restoreSocialGraph} from '../src/social-graph.js';
import {newHousehold,loadHousehold} from '../src/household.js';
import {startConversation,chooseSocialLine,arriveSocial,
  cancelSocial,finishSocialConversation} from '../src/relationships.js';
import {evaluateResponse} from '../src/conversation-engine.js';

const clone=x=>JSON.parse(JSON.stringify(x));
const spot={x:-.2,z:1.85};
const ids=['nova','ember','iris','dorian','riven'];
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const actual=(g,from,to,type,at)=>applySocialEvent(g,{actorId:from,targetId:to,type,at});

test('1.0g maps reactions to tentative social cues without assuming a trait is permanent',()=>{
  assert.deepEqual(CUE_IDS,['gentle','support','space','playful','clear']);
  assert.equal(cueFromAnswer('humor.tease',false),'gentle');
  assert.equal(cueFromAnswer('hobbies.mock',false),'gentle');
  assert.equal(cueFromAnswer('support.listen',true),'support');
  assert.equal(cueFromAnswer('humor.joke',true),'playful');
  assert.equal(cueFromAnswer('plans.invite',false),'space');
  assert.equal(cueFromAnswer('conflict.explain',true),'clear');
  assert.equal(cueFromAnswer('humor.tease',true),null,
    'accepted sharp joke is not assumed to be a disliked boundary');
  assert.equal(cueFromAnswer('daily.news',false),null);
  assert.equal(cueFromAnswer('support.listen','true'),null);
  assert.equal(cueFromAnswer('unknown',false),null);
});

test('canonical completed events yield only the viewer directional observation',()=>{
  const g=newSocialGraph(ids);
  assert.deepEqual(newSocialCues('nova','ember'),{nova:[],ember:[]});
  assert.deepEqual(newSocialCues('nova','nova'),{});
  assert.deepEqual(socialCommunicationNotes(g,'nova','ember'),[]);
  const receipt=actual(g,'nova','ember','conversation.talk',500);
  const learned=learnSocialCue(g,receipt,'nova','ember','humor.joke',true);
  assert.deepEqual(learned,{id:'playful',count:1,lastSeq:1,at:500});
  assert.deepEqual(socialCommunicationNotes(g,'nova','ember'),[
    {id:'playful',confirmed:false,text:'Улыбнулся доброй шутке'}
  ]);
  assert.deepEqual(socialCommunicationNotes(g,'ember','nova'),[]);
  assert.deepEqual(socialCommunicationNotes(g,'nova','iris'),[]);
  assert.equal(getPair(g,'nova','iris'),null);
  assert.equal(socialCommunicationBias(g,'nova','ember','humor.joke'),2);
  assert.equal(socialCommunicationBias(g,'ember','nova','humor.joke'),0);
});

test('repeat confirmation in distinct sessions builds evidence without grinding the same receipt',()=>{
  const g=newSocialGraph(ids);
  const a=actual(g,'nova','ember','conversation.talk',510);
  learnSocialCue(g,a,'nova','ember','support.listen',true);
  assert.equal(learnSocialCue(g,a,'nova','ember','support.help',true),null);
  assert.equal(getPair(g,'nova','ember').cues.nova[0].count,1);
  const b=actual(g,'nova','ember','conversation.talk',590);
  learnSocialCue(g,b,'nova','ember','support.help',true);
  assert.deepEqual(socialCommunicationNotes(g,'nova','ember'),[
    {id:'support',confirmed:true,text:'Ценит бережное участие'}
  ]);
  assert.equal(socialCommunicationBias(g,'nova','ember','support.listen'),5);
  assert.equal(learnSocialCue(g,b,'nova','ember','support.listen',true),null);
  assert.equal(getPair(g,'nova','ember').cues.nova[0].count,2);
  const c=actual(g,'nova','ember','conversation.talk',630);
  learnSocialCue(g,c,'nova','ember','support.listen',true);
  assert.equal(getPair(g,'nova','ember').cues.nova[0].count,2);
  assert.equal(getPair(g,'nova','ember').cues.nova[0].lastSeq,c.seq);
});

test('private boundary discovery takes two genuine rejected pointed conversations',()=>{
  const g=newSocialGraph(ids);
  const a=actual(g,'nova','ember','conversation.argue',510);
  learnSocialCue(g,a,'nova','ember','humor.tease',false);
  let [state]=socialCommunicationNotes(g,'nova','ember');
  assert.equal(state.confirmed,false);
  assert.equal(state.text,'Не понравились резкие слова');
  assert.equal(socialCommunicationBias(g,'nova','ember','humor.tease'),-2);
  assert.equal(socialCommunicationBias(g,'nova','ember','daily.news'),0);
  const b=actual(g,'nova','ember','conversation.argue',800);
  learnSocialCue(g,b,'nova','ember','hobbies.mock',false);
  [state]=socialCommunicationNotes(g,'nova','ember');
  assert.equal(state.confirmed,true);
  assert.equal(state.text,'Болезненно воспринимает колкости');
  assert.equal(socialCommunicationBias(g,'nova','ember','humor.tease'),-5);
});

test('attempts to forge an observation without the matching event or responder fail',()=>{
  const g=newSocialGraph(ids);
  assert.equal(learnSocialCue(g,null,'nova','ember','humor.joke',true),null);
  const a=actual(g,'nova','ember','argue',400);
  assert.equal(learnSocialCue(g,a,'nova','ember','humor.tease',false),null,
    'simple conflict is not proof of the tone used in a multi-turn dialogue');
  const b=actual(g,'nova','ember','conversation.talk',500);
  assert.equal(learnSocialCue(g,{...b,seq:999},'nova','ember','humor.joke',true),null);
  assert.equal(learnSocialCue(g,b,'ember','nova','humor.joke',true),null);
  assert.equal(learnSocialCue(g,b,'nova','nova','humor.joke',true),null);
  assert.equal(learnSocialCue(g,b,'nova','ember','fabricated',true),null);
  assert.equal(learnSocialCue(g,b,'nova','iris','humor.joke',true),null);
  assert.equal(learnSocialCue(g,b,'nova','ember','humor.joke','yes'),null);
  assert.deepEqual(socialCommunicationNotes(g,'nova','ember'),[]);
});

test('different pairs among five residents cannot share or leak personal impressions',()=>{
  const g=newSocialGraph(ids);
  const a=actual(g,'nova','ember','conversation.talk',500);
  learnSocialCue(g,a,'nova','ember','humor.joke',true);
  const b=actual(g,'riven','dorian','conversation.argue',510);
  learnSocialCue(g,b,'riven','dorian','humor.tease',false);
  const c=actual(g,'iris','nova','conversation.talk',520);
  learnSocialCue(g,c,'iris','nova','support.listen',true);
  assert.deepEqual(socialCommunicationNotes(g,'nova','ember').map(x=>x.id),['playful']);
  assert.deepEqual(socialCommunicationNotes(g,'riven','dorian').map(x=>x.id),['gentle']);
  assert.deepEqual(socialCommunicationNotes(g,'iris','nova').map(x=>x.id),['support']);
  for(const pair of [['ember','nova'],['dorian','riven'],['nova','iris'],
    ['iris','ember']])assert.deepEqual(socialCommunicationNotes(g,...pair),[]);
});

test('naturally different personalities respond differently to communication style',()=>{
  const sensitive=createProfile(['temperament.melancholic','habits.neat'],{likes:[],dislikes:[]});
  const cheerful=createProfile(['temperament.cheerful','social.outgoing'],{likes:[],dislikes:[]});
  const independent=createProfile(['social.reserved','values.independent'],{likes:[],dislikes:[]});
  assert.equal(boundaryDisposition(sensitive,'humor.tease'),-6);
  assert.equal(boundaryDisposition(cheerful,'humor.joke'),4);
  assert.equal(boundaryDisposition(independent,'plans.invite'),-5);
  assert.equal(boundaryDisposition(independent,'support.help'),-5);
  assert.equal(boundaryDisposition(null,'plans.invite'),0);
  assert.equal(boundaryDisposition(cheerful,'unknown'),0);
  assert.equal(boundaryDisposition(cheerful,'daily.news'),0);
  assert.ok(boundaryDisposition(DEMO_PROFILES.second,'humor.joke')>0);
});

test('learning a social cue affects real conversation appraisal but not friendship meter',()=>{
  const s=newHousehold();
  const before=evaluateResponse(s,'alex','humor','humor.joke');
  const affinity=s.relationship.affinity;
  const receipt=actual(s.socialGraph,'alex','mira','conversation.talk',s.minutes);
  assert.ok(learnSocialCue(s.socialGraph,receipt,'alex','mira','humor.joke',true));
  const learned=evaluateResponse(s,'alex','humor','humor.joke');
  assert.equal(learned.confidence,before.confidence+2);
  assert.equal(s.relationship.affinity,affinity);
  assert.deepEqual(socialCommunicationNotes(s.socialGraph,'mira','alex'),[]);
});

test('unfinished and cancelled sessions yield zero permanent social cues',()=>{
  const s=newHousehold();
  assert.equal(startConversation(s,'alex',spot,'humor'),true);
  assert.equal(chooseSocialLine(s,'humor.joke'),null,
    'walking must not create a response or learn a habit');
  assert.deepEqual(socialCommunicationNotes(s.socialGraph,'alex','mira'),[]);
  arriveSocial(s);
  const result=chooseSocialLine(s,'humor.joke');
  assert.equal(result.accepted,true);
  assert.deepEqual(socialCommunicationNotes(s.socialGraph,'alex','mira'),[],
    'a spoken but unfinished session is not enough for saved knowledge');
  assert.equal(cancelSocial(s),true);
  assert.deepEqual(socialCommunicationNotes(s.socialGraph,'alex','mira'),[]);
  const restored=loadHousehold(clone(s));
  assert.deepEqual(socialCommunicationNotes(restored.socialGraph,'alex','mira'),[]);
});

test('completed friendly humor reveals tentative playfulness only to the initiator',()=>{
  const s=newHousehold();
  startConversation(s,'alex',spot,'humor');arriveSocial(s);
  assert.ok(chooseSocialLine(s,'humor.joke'));
  assert.deepEqual(socialCommunicationNotes(s.socialGraph,'alex','mira'),[]);
  assert.ok(finishSocialConversation(s));
  assert.deepEqual(socialCommunicationNotes(s.socialGraph,'alex','mira'),[
    {id:'playful',confirmed:false,text:'Улыбнулся доброй шутке'}
  ]);
  assert.deepEqual(socialCommunicationNotes(s.socialGraph,'mira','alex'),[]);
  assert.equal(s.relationship.lastKind,'talk');
});

test('completed rejected sharp joke creates a boundary, not a lifetime hatred',()=>{
  const s=newHousehold();
  startConversation(s,'alex',spot,'humor');arriveSocial(s);
  const reaction=chooseSocialLine(s,'humor.tease');
  assert.equal(reaction.accepted,false);
  assert.deepEqual(socialCommunicationNotes(s.socialGraph,'alex','mira'),[]);
  assert.ok(finishSocialConversation(s));
  assert.deepEqual(socialCommunicationNotes(s.socialGraph,'alex','mira'),[
    {id:'gentle',confirmed:false,text:'Не понравились резкие слова'}
  ]);
  assert.equal(s.socialGraph.pairs[JSON.stringify(['alex','mira'])].cues.mira.length,0);
  assert.equal(s.socialGraph.pairs[JSON.stringify(['alex','mira'])].cues.alex[0].count,1);
});

test('old 1.0f saves load without retrospective fabricated communication habits',()=>{
  const g=newSocialGraph(ids);
  const r=actual(g,'nova','ember','conversation.talk',530);
  learnSocialCue(g,r,'nova','ember','humor.joke',true);
  const old=clone(g);
  delete getPair(old,'nova','ember').cues;
  const restored=restoreSocialGraph(old,ids);
  assert.deepEqual(getPair(restored,'nova','ember').cues,{ember:[],nova:[]});
  assert.equal(getPair(restored,'nova','ember').events.length,1);
  assert.deepEqual(socialCommunicationNotes(restored,'nova','ember'),[]);
});

test('saved cues survive v1 restore exactly, unsafe forged values are filtered',()=>{
  const g=newSocialGraph(ids);
  const a=actual(g,'nova','ember','conversation.talk',500);
  learnSocialCue(g,a,'nova','ember','humor.joke',true);
  const b=actual(g,'nova','ember','conversation.argue',600);
  learnSocialCue(g,b,'nova','ember','humor.tease',false);
  const good=clone(g), restored=restoreSocialGraph(good,ids);
  assert.deepEqual(restored,good);
  const data=getPair(good,'nova','ember');
  data.cues.nova.push(
    {id:'malicious',count:2,lastSeq:2,at:600},
    {id:'space',count:0,lastSeq:2,at:600},
    {id:'support',count:4,lastSeq:2,at:600},
    {id:'clear',count:1,lastSeq:5,at:600},
    {id:'space',count:1,lastSeq:2,at:600,html:'<script>'},
    {id:'playful',count:1,lastSeq:1,at:500,html:'<script>'});
  const clean=restoreSocialGraph(good,ids).pairs[JSON.stringify(['ember','nova'])];
  assert.deepEqual(clean.cues.nova.map(x=>x.id),['playful','gentle','space']);
  assert.ok(clean.cues.nova.every(e=>!Object.hasOwn(e,'html')));
  assert.ok(clean.cues.nova.length<=CUE_LIMIT);
  assert.deepEqual(restoreSocialCues({},['nova','ember'],10,600),{nova:[],ember:[]});
  assert.deepEqual(restoreSocialCues({},['nova','nova'],10,600),{});
});

test('a paused or restored queued conversation does not generate new cues',()=>{
  const s=newHousehold();s.paused=true;
  assert.equal(startConversation(s,'alex',spot,'humor'),false);
  assert.deepEqual(socialCommunicationNotes(s.socialGraph,'alex','mira'),[]);
  s.paused=false;
  startConversation(s,'alex',spot,'humor');
  const saved=clone(s),old=loadHousehold(saved);
  assert.deepEqual(socialCommunicationNotes(old.socialGraph,'alex','mira'),[]);
  assert.equal(old.socialAction?.phase,'walking');
  cancelSocial(old);
  assert.deepEqual(socialCommunicationNotes(old.socialGraph,'alex','mira'),[]);
});

test('mobile scene and Pages include optional personal cue UI, not numeric thresholds',()=>{
 const html=read('../index.html'),ui=read('../src/game.js'),
   graph=read('../src/social-graph.js'),relation=read('../src/relationships.js'),
   response=read('../src/social-reactions.js'),workflow=read('../.github/workflows/pages.yml'),
   core=read('../src/social-boundaries.js');
 assert.ok(html.includes('сборка / 1.2'));
 assert.ok(html.includes('id="mind-social-cues"'));
 assert.ok(html.includes('КАК ЛУЧШЕ ОБЩАТЬСЯ'));
 assert.ok(ui.includes('socialCommunicationNotes(game.socialGraph,mindInspectResident,otherId,3)'));
 assert.ok(ui.includes('Пока не замечено особенностей общения'));
 assert.ok(relation.includes('if(cueFromAnswer(turn.id,turn.accepted))'));
 assert.ok(graph.includes('restoreSocialCues(entry.cues'));
 assert.ok(response.includes('styleBias=0'));
 assert.ok(workflow.includes('node --check src/social-boundaries.js'));
 assert.ok(workflow.includes('src/social-compatibility.js src/social-boundaries.js src/social-dynamics.js src/romance.js src/reaction-badges.js'));
 assert.ok(!/\b(alex|mira|document|localStorage|playcanvas)\b/i.test(core));
 assert.equal(CUE_LIMIT,5);
});


test('LP-02A: empathetic resident welcomes help, personal space wins for combined profile',()=>{
  const empathetic=createProfile(['temperament.calm','values.empathetic']);
  const reserved=createProfile(['social.reserved','values.empathetic']);
  const neutral=createProfile(['temperament.calm','habits.neat']);
  assert.equal(boundaryDisposition(empathetic,'support.help'),4);
  assert.equal(boundaryDisposition(empathetic,'support.listen'),4);
  assert.equal(boundaryDisposition(reserved,'support.help'),-5);
  assert.equal(boundaryDisposition(reserved,'support.listen'),4);
  assert.equal(boundaryDisposition(neutral,'support.help'),0);
  const s=newHousehold();s.otherSim.personality=empathetic;
  const before=evaluateResponse(s,'alex','support','support.help');
  s.otherSim.personality=neutral;
  const after=evaluateResponse(s,'alex','support','support.help');
  assert.ok(before.confidence>after.confidence);
});
test('LP-02A: real learned support cue applies to help unless a space boundary is known',()=>{
  const g=newSocialGraph(ids),a=actual(g,'nova','ember','conversation.talk',500);
  learnSocialCue(g,a,'nova','ember','support.help',true);
  assert.equal(socialCommunicationBias(g,'nova','ember','support.help'),2);
  assert.equal(socialCommunicationBias(g,'nova','ember','support.listen'),2);
  const b=actual(g,'nova','ember','conversation.talk',600);
  learnSocialCue(g,b,'nova','ember','support.help',false);
  assert.equal(socialCommunicationBias(g,'nova','ember','support.help'),-2);
  assert.equal(socialCommunicationBias(g,'nova','ember','support.listen'),2);
  const restored=restoreSocialGraph(clone(g),ids);
  assert.equal(socialCommunicationBias(restored,'nova','ember','support.help'),-2);
});


test('LP-02A: temperament and approach respond to authored content rather than a whole topic',()=>{
  const profile=trait=>createProfile(['habits.neat',trait]);
  const neutral=profile('coordination.agile');
  const cases=[
    ['temperament.cheerful','daily.news','daily.critic'],
    ['temperament.melancholic','philosophy.share','daily.news'],
    ['temperament.calm','conflict.extra','plans.idea'],
    ['approach.creative','plans.idea','money.ask'],
    ['approach.pragmatic','money.ask','plans.idea']
  ];
  for(const [trait,meaningful,unrelated] of cases){
    assert.equal(boundaryDisposition(profile(trait),meaningful),4,trait);
    assert.equal(boundaryDisposition(neutral,meaningful),0);
    assert.equal(boundaryDisposition(profile(trait),unrelated),0);
  }
  assert.equal(boundaryDisposition(profile('temperament.hotheaded'),'conflict.blame'),-6);
  assert.equal(boundaryDisposition(profile('temperament.hotheaded'),'conflict.extra'),0);
  assert.equal(boundaryDisposition(createProfile(['temperament.cheerful','approach.creative']),'plans.idea'),4);
});
test('LP-02A: actual authored answers can change by profile and settle once for either resident',()=>{
  const cases=[
    ['temperament.cheerful','daily','daily.news',true],
    ['temperament.melancholic','philosophy','philosophy.share',true],
    ['temperament.calm','conflict','conflict.extra',true],
    ['temperament.hotheaded','daily','daily.critic',false],
    ['approach.creative','plans','plans.idea',true],
    ['approach.pragmatic','money','money.ask',true]
  ];
  const neutral=createProfile(['habits.neat','coordination.agile']);
  for(const initiator of ['alex','mira'])for(const [trait,topic,line,preferred] of cases){
    const partner=initiator==='alex'?'mira':'alex';
    const candidate=createProfile(['habits.neat',trait]);
    function fixture(profile,trust,tension){
      const s=newHousehold(),a=initiator==='alex'?s:s.otherSim,b=partner==='alex'?s:s.otherSim;
      a.personality=clone(neutral);b.personality=clone(profile);
      b.mind.mood.value=70;
      Object.assign(s.relationship.views[partner],{trust,tension,friendship:50});
      return s;
    }
    let matched=null;
    for(const trust of [10,30,50,70,90,100]){
      for(let tension=0;tension<=100;tension++){
        const a=fixture(neutral,trust,tension),b=fixture(candidate,trust,tension);
        const first=evaluateResponse(a,initiator,topic,line),second=evaluateResponse(b,initiator,topic,line);
        if(first?.accepted===!preferred&&second?.accepted===preferred){matched={a,b};break;}
      }
      if(matched)break;
    }
    assert.ok(matched,trait+' '+initiator+' has a genuine threshold crossing');
    for(const [root,expected] of [[matched.a,!preferred],[matched.b,preferred]]){
      const seq=root.socialGraph.nextSeq;
      assert.ok(startConversation(root,initiator,spot,topic));
      assert.ok(arriveSocial(root));
      assert.equal(chooseSocialLine(root,line)?.accepted,expected);
      assert.equal(root.socialGraph.nextSeq,seq,'reply is not yet a completed event');
      assert.ok(finishSocialConversation(root));
      const pair=getPair(root.socialGraph,'alex','mira');
      assert.equal(pair.events.at(-1).type,expected?'conversation.talk':'conversation.argue');
      assert.equal(root.socialGraph.nextSeq,seq+1);
      assert.equal(finishSocialConversation(root),null);
      const restored=loadHousehold(clone(root));
      assert.equal(restored.version,1);
      assert.deepEqual(getPair(restored.socialGraph,'alex','mira').events,pair.events);
    }
  }
});
