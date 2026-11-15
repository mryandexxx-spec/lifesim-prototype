import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NEEDS,PHYSICAL_NEEDS,SAVE_KEY,newGame,loadGame,tick,
  chooseAction,autonomousChoice} from '../src/simulation.js';
import {newHousehold,loadHousehold,tickHousehold,getActor} from '../src/household.js';
import {refreshMind,calculateMood} from '../src/psychology.js';
import {NEED_LABELS,moodReasons} from '../src/mood-presentation.js';
import {socialNeedDecayRate,creditCompletedSocialNeed,
  SOCIAL_NEED_REWARDS,SOCIAL_NEED_INITIAL,
  SOCIAL_NEED_LEGACY_DEFAULT} from '../src/social-need.js';
import {startSocial,arriveSocial,cancelSocial,startConversation,
  chooseSocialLine,finishSocialConversation,startSharedSocial} from '../src/relationships.js';
import {newSocialGraph,markAcquainted,getPair} from '../src/social-graph.js';
import {newActionQueues} from '../src/action-queue.js';
import {proposeAutonomousSocial} from '../src/social-dynamics.js';
import {DEMO_PROFILES} from '../src/trait-catalog.js';

const clone=v=>JSON.parse(JSON.stringify(v));
const spot={x:-.2,z:1.85};
const near=(value,expected,tolerance=1e-6)=>
  assert.ok(Math.abs(value-expected)<tolerance,`${value} != ${expected}`);
function setSocial(root,value){
  root.needs.social=value;
  root.otherSim.needs.social=value;
  refreshMind(root);refreshMind(root.otherSim);
}

test('M3: fresh residents have independent fifth social need and existing identifiers remain stable',()=>{
  const a=newGame(),b=newGame(),house=newHousehold();
  assert.deepEqual(NEEDS,['hunger','energy','hygiene','fun','bladder','social']);
  assert.deepEqual(PHYSICAL_NEEDS,['hunger','energy','hygiene','fun','bladder']);
  assert.equal(NEED_LABELS.social,'Общение');
  assert.equal(a.needs.social,SOCIAL_NEED_INITIAL);
  assert.equal(house.otherSim.needs.social,76);
  a.needs.social=4;
  assert.equal(b.needs.social,SOCIAL_NEED_INITIAL);
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.equal(house.version,1);
  assert.equal(house.actionQueues.schema,1);
  assert.equal(house.socialGraph.schema,1);
});

test('M3: old Alex/Mira saves without social migrate to safe neutral level, no synthetic receipts',()=>{
  const old=newHousehold();
  const seq=old.socialGraph.nextSeq;
  delete old.needs.social;
  delete old.otherSim.needs.social;
  old.needs.energy=21;
  old.otherSim.needs.fun=32;
  const restored=loadHousehold(clone(old));
  assert.equal(restored.needs.social,SOCIAL_NEED_LEGACY_DEFAULT);
  assert.equal(restored.otherSim.needs.social,SOCIAL_NEED_LEGACY_DEFAULT);
  assert.equal(restored.needs.energy,21);
  assert.equal(restored.otherSim.needs.fun,32);
  assert.equal(restored.socialGraph.nextSeq,seq);
  assert.deepEqual(restored.mind.memories,[]);
  assert.deepEqual(restored.otherSim.mind.memories,[]);
  assert.deepEqual(loadHousehold(clone(restored)).needs,restored.needs);
});

test('M3: restored social values clamp, corrupt values use neutral rather than NaN or crash',()=>{
  const base=newGame();
  for(const [input,expected] of [[220,100],[-10,0],[null,75],['80',75],[NaN,75],[Infinity,75]]){
    const raw=clone(base);raw.needs.social=input;
    const loaded=loadGame(raw);
    assert.equal(loaded.needs.social,expected);
    assert.ok(loaded.mind.mood.value>=0&&loaded.mind.mood.value<=100);
  }
});

test('M3: social need decays only by real game minutes and stops completely on pause',()=>{
  const s=newGame(),initial=s.needs.social;
  const rate=socialNeedDecayRate(s.personality);
  assert.ok(rate>=.04&&rate<=.075);
  tick(s,100);
  near(s.needs.social,initial-100*rate);
  s.paused=true;
  const snap=JSON.stringify(s);
  tick(s,500);
  assert.equal(JSON.stringify(s),snap);
  s.paused=false;
  tick(s,3000);
  assert.equal(s.needs.social,0);
  assert.ok(Number.isFinite(s.mind.mood.value));
});

test('M3: a more outgoing personality loses social fulfilment a little faster',()=>{
  const reserved=socialNeedDecayRate({schema:1,traitIds:['temperament.calm','social.reserved'],
    preferences:{likes:[],dislikes:[]}});
  const outgoing=socialNeedDecayRate(DEMO_PROFILES.second);
  assert.ok(reserved<outgoing);
  assert.ok(outgoing<.075);
});

test('M3: loneliness affects only the existing derived mood and real reason list',()=>{
  const s=newGame();
  for(const k of PHYSICAL_NEEDS)s.needs[k]=90;
  s.needs.social=90;refreshMind(s);
  const content=s.mind.mood.value;
  s.needs.social=3;refreshMind(s);
  assert.ok(s.mind.mood.value<content);
  assert.ok(moodReasons(s).includes('Чувствует одиночество'));
  assert.equal(s.mind.mood.value,calculateMood(s.needs,s.mind,s.minutes,s.personality).value);
  const untouched=JSON.stringify(s);moodReasons(s);
  assert.equal(JSON.stringify(s),untouched);
});

test('M3: canonical positive map never counts conflict, refusal, breakup or cancel',()=>{
  for(const kind of ['argue','conversation.argue','gift.refused','leisure.refused',
    'rival.taunt','friend.confide.refused','romance.flirt.refused',
    'romance.breakup','romance.divorce','introduced']){
    assert.equal(Object.hasOwn(SOCIAL_NEED_REWARDS,kind),false,kind);
  }
  for(const kind of ['talk','conversation.talk','acquaint.chat','friend.tease',
    'friend.confide','rival.truce','gift.accepted','leisure.accepted',
    'romance.flirt','romance.tender','romance.checkin','romance.repair']){
    assert.ok(SOCIAL_NEED_REWARDS[kind]>0,kind);
  }
});

test('M3: generic N-person reward credits ONLY two actual participants and no extra history',()=>{
  const people={nova:{needs:{social:20}},iris:{needs:{social:30}},
    riven:{needs:{social:12}},opal:{needs:{social:42}}};
  const before=clone(people),receipt={seq:7,at:600,actorId:'nova',targetId:'opal',type:'talk'};
  assert.equal(creditCompletedSocialNeed(people,receipt),true);
  assert.equal(people.nova.needs.social,before.nova.needs.social+SOCIAL_NEED_REWARDS.talk);
  assert.equal(people.opal.needs.social,before.opal.needs.social+SOCIAL_NEED_REWARDS.talk);
  assert.deepEqual(people.iris,before.iris);
  assert.deepEqual(people.riven,before.riven);
  assert.deepEqual(Object.keys(people.nova.needs),['social']);
});

test('M3: malformed, irrelevant and rejected receipts never credit either person',()=>{
  const people={nova:{needs:{social:30}},iris:{needs:{social:30}}};
  const valid={seq:1,at:600,actorId:'nova',targetId:'iris',type:'talk'};
  const invalid=[
    {...valid,type:'argue'}, {...valid,type:'gift.refused'},
    {...valid,type:'romance.breakup'},{...valid,type:'__proto__'},
    {...valid,seq:0},{...valid,seq:1.5},{...valid,at:NaN},
    {...valid,targetId:'missing'},{...valid,targetId:'nova'},
    {...valid,actorId:'bad id'},null
  ];
  for(const x of invalid){
    assert.equal(creditCompletedSocialNeed(people,x),false);
    assert.equal(people.nova.needs.social,30);
    assert.equal(people.iris.needs.social,30);
  }
});

test('M3: walking/using/cancelled talk awards no social need, a completed talk credits both once',()=>{
  const root=newHousehold();setSocial(root,35);
  const seq=root.socialGraph.nextSeq;
  assert.equal(startSocial(root,'talk','alex',spot),true);
  assert.equal(root.needs.social,35);
  assert.equal(root.socialGraph.nextSeq,seq);
  tickHousehold(root,10); // walking: the graph has no receipt
  const walked=root.needs.social;
  assert.ok(walked<35);
  assert.equal(root.socialGraph.nextSeq,seq);
  assert.equal(arriveSocial(root),true);
  tickHousehold(root,8); // using, but not completed yet
  assert.ok(root.needs.social<walked);
  assert.equal(root.socialGraph.nextSeq,seq);
  assert.equal(cancelSocial(root),true);
  tickHousehold(root,1);
  assert.equal(root.socialGraph.nextSeq,seq);
  assert.deepEqual(root.mind.memories,[]);
  const before=root.needs.social,otherBefore=root.otherSim.needs.social;
  assert.equal(startSocial(root,'talk','alex',spot),true);
  arriveSocial(root);
  tickHousehold(root,18);
  assert.equal(root.socialGraph.nextSeq,seq+1);
  near(root.needs.social,before-socialNeedDecayRate(root.personality)*18+SOCIAL_NEED_REWARDS.talk);
  near(root.otherSim.needs.social,otherBefore-socialNeedDecayRate(root.otherSim.personality)*18+SOCIAL_NEED_REWARDS.talk);
  const after=root.needs.social;
  tickHousehold(root,1);
  assert.ok(root.needs.social<after,'no duplicate post-completion credit');
});

test('M3: a completed quarrel does not satisfy social need',()=>{
  const root=newHousehold();setSocial(root,45);
  const previous=root.socialGraph.nextSeq;
  assert.equal(startSocial(root,'argue','alex',spot),true);
  arriveSocial(root);tickHousehold(root,16);
  assert.equal(root.socialGraph.nextSeq,previous+1);
  assert.equal(getPair(root.socialGraph,'alex','mira').events.at(-1).type,'argue');
  assert.ok(root.needs.social<45);
  assert.ok(root.otherSim.needs.social<45);
});

test('M3: accepted conversation credits only when explicitly finished; rejected dialogue does not',()=>{
  const yes=newHousehold();setSocial(yes,36);
  assert.equal(startConversation(yes,'alex',spot,'support'),true);
  arriveSocial(yes);
  const seq=yes.socialGraph.nextSeq;
  assert.equal(chooseSocialLine(yes,'support.listen').accepted,true);
  assert.equal(yes.socialGraph.nextSeq,seq);
  assert.equal(yes.needs.social,36);
  assert.equal(finishSocialConversation(yes).kind,'talk');
  assert.equal(yes.socialGraph.nextSeq,seq+1);
  assert.equal(yes.needs.social,36+SOCIAL_NEED_REWARDS['conversation.talk']);
  assert.equal(yes.otherSim.needs.social,36+SOCIAL_NEED_REWARDS['conversation.talk']);
  assert.equal(finishSocialConversation(yes),null);
  const no=newHousehold();setSocial(no,36);
  assert.equal(startConversation(no,'alex',spot,'conflict'),true);
  arriveSocial(no);
  assert.equal(chooseSocialLine(no,'conflict.blame').accepted,false);
  assert.equal(finishSocialConversation(no).kind,'argue');
  assert.equal(no.needs.social,36);
  assert.equal(no.otherSim.needs.social,36);
});

test('M3: an unfinished selected dialogue is not a social completion on save/reload',()=>{
  const s=newHousehold();setSocial(s,41);
  assert.equal(startConversation(s,'alex',spot,'support'),true);arriveSocial(s);
  assert.ok(chooseSocialLine(s,'support.listen'));
  const seq=s.socialGraph.nextSeq;
  const loaded=loadHousehold(clone(s));
  assert.equal(loaded.socialGraph.nextSeq,seq);
  assert.equal(loaded.needs.social,41);
  assert.equal(loaded.otherSim.needs.social,41);
  assert.equal(loaded.socialAction.conversation.phase,'response');
  assert.equal(finishSocialConversation(loaded).kind,'talk');
  assert.equal(loaded.needs.social,41+SOCIAL_NEED_REWARDS['conversation.talk']);
  const loadedAgain=loadHousehold(clone(loaded));
  assert.equal(loadedAgain.needs.social,loaded.needs.social);
  assert.equal(loadedAgain.socialGraph.nextSeq,loaded.socialGraph.nextSeq);
});

test('M3: accepted gift credits genuine completion, rejected gift yields zero',()=>{
  const root=newHousehold();setSocial(root,25);
  assert.equal(startSharedSocial(root,'alex',spot,'gift','a1'),true);
  arriveSocial(root);
  tickHousehold(root,6);const before=root.needs.social;
  assert.ok(before<25);
  tickHousehold(root,6);
  assert.equal(root.socialAction,null);
  assert.equal(getPair(root.socialGraph,'alex','mira').events.at(-1).type,'gift.accepted');
  near(root.needs.social,before-socialNeedDecayRate(root.personality)*6+SOCIAL_NEED_REWARDS['gift.accepted']);
  const no=newHousehold();setSocial(no,25);
  no.relationship.views.mira.trust=0;
  no.relationship.views.mira.tension=100;
  assert.equal(startSharedSocial(no,'alex',spot,'gift','a2'),true);
  arriveSocial(no);tickHousehold(no,13);
  assert.equal(getPair(no.socialGraph,'alex','mira').events.at(-1).type,'gift.refused');
  assert.ok(no.needs.social<25);
  assert.ok(no.otherSim.needs.social<25);
});

test('M3: completed shared leisure credits both, partner refusal grants nothing',()=>{
  const s=newHousehold();setSocial(s,33);
  assert.equal(startSharedSocial(s,'alex',spot,'leisure','music'),true);
  arriveSocial(s);tickHousehold(s,28);
  assert.equal(getPair(s.socialGraph,'alex','mira').events.at(-1).type,'leisure.accepted');
  near(s.needs.social,33-socialNeedDecayRate(s.personality)*28+SOCIAL_NEED_REWARDS['leisure.accepted']);
  near(s.otherSim.needs.social,33-socialNeedDecayRate(s.otherSim.personality)*28+SOCIAL_NEED_REWARDS['leisure.accepted']);
  const refused=newHousehold();setSocial(refused,33);
  refused.relationship.views.mira.trust=0;
  refused.relationship.views.mira.tension=100;
  assert.equal(startSharedSocial(refused,'alex',spot,'leisure','music'),true);
  arriveSocial(refused);tickHousehold(refused,28);
  assert.equal(getPair(refused.socialGraph,'alex','mira').events.at(-1).type,'leisure.refused');
  assert.ok(refused.needs.social<33);
});

test('M3: a lonely but rested person has a stronger N-person autonomous social motive',()=>{
  const ids=['nova','iris'];
  const graph=newSocialGraph(ids);markAcquainted(graph,'nova','iris',480);
  const make=(social)=>({needs:{hunger:90,energy:90,hygiene:90,fun:97,social},
    mind:{mood:{value:65}},autonomy:{enabled:true,nextAt:0},
    paused:false,action:null,personality:DEMO_PROFILES.second});
  const c={graph,actorId:'nova',minutes:900,
    residents:{nova:make(95),iris:make(95)},queues:newActionQueues(ids)};
  const copyBefore=clone(c);
  assert.equal(proposeAutonomousSocial(c),null);
  c.residents.nova.needs.social=0;
  const proposed=proposeAutonomousSocial(c);
  assert.equal(proposed?.targetId,'iris');
  assert.equal(proposed?.kind,'talk');
  assert.equal(c.queues.byResident.nova.length,0);
  assert.equal(copyBefore.residents.iris.needs.social,c.residents.iris.needs.social);
  c.paused=true;
  assert.equal(proposeAutonomousSocial(c),null);
});

test('M3: isolation does not invent a furniture cure or block essential autonomous self-care',()=>{
  const s=newGame();
  s.needs.social=0;
  s.needs.energy=8;
  s.needs.fun=92;
  refreshMind(s);
  assert.equal(autonomousChoice(s),'bed');
  assert.equal(chooseAction(s,'fridge'),true);
});

test('M3: generic social rewards are bounded per participant even when saturated',()=>{
  const people={nova:{needs:{social:98}},iris:{needs:{social:100}},
    ember:{needs:{social:0}}};
  const receipt={seq:900,at:900,actorId:'nova',targetId:'iris',type:'leisure.accepted'};
  assert.equal(creditCompletedSocialNeed(people,receipt),true);
  assert.equal(people.nova.needs.social,100);
  assert.equal(people.iris.needs.social,100);
  assert.equal(people.ember.needs.social,0);
});

test('M3: browser HUD has fifth need, compact layout, and required dialogue still blocks time',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const rel=readFileSync(new URL('../src/relationships.js',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../.github/workflows/mood-m3-checks.yml',import.meta.url),'utf8');
  assert.match(html,/data-need="social"/);
  assert.match(html,/id="bar-social"/);
  assert.match(html,/id="value-social"/);
  assert.match(html,/Общение/);
  assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(game,/for\(const need of NEEDS\)/);
  assert.match(game,/dialogueNeedsDecision\(game\)/);
  assert.match(rel,/const committed=applySocialEvent/);
  assert.match(rel,/if\(committed&&creditCompletedSocialNeed/);
  assert.match(workflow,/npm test/);
  assert.doesNotMatch(workflow,/deploy-pages|upload-pages|pages: write/);
});

test('1.0u release bundles M3 and preserves 1.0s contextual UX and 1.0t live plan',()=>{
  const yml=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  const lock=JSON.parse(readFileSync(new URL('../package-lock.json',import.meta.url),'utf8'));
  assert.match(yml,/node --check src\/social-need\.js/);
  assert.match(yml,/cp src\/social-need\.js site\/src\//);
  assert.match(yml,/cp src\/mood-action-policy\.js site\/src\//);
  assert.match(yml,/cp src\/plan-preview\.js src\/ui-layout\.js src\/required-choice-focus\.js site\/src\//);
  assert.match(yml,/node --check src\/plan-preview\.js/);
  assert.match(yml,/src\/world-interactions\.js/);
  assert.match(html,/сборка \/ 1\.0x/);
  assert.match(html,/styles\.css\?v=1\.0x/);
  assert.match(html,/src\/game\.js\?v=1\.0x/);
  assert.match(html,/id="bar-social"/);
  assert.match(html,/id="plan-peek"/);
  assert.match(html,/id="plan-upcoming"/);
  assert.match(html,/id="mood-overview"/);
  assert.match(html,/id="item-labels-btn"/);
  assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(game,/dialogueNeedsDecision\(game\)/);
  assert.match(game,/pickWorldRayTarget\(/);
  assert.match(game,/planPreview\(/);
  assert.equal(pkg.version,'1.0.0-alpha.24');
  assert.equal(lock.version,pkg.version);
  assert.equal(lock.packages[''].version,pkg.version);
});
