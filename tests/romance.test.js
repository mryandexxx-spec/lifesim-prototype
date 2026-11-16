import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newSocialGraph,markAcquainted,observePairViews,applySocialEvent,
  getPair,restoreSocialGraph,availableSocialActions,resolveBranchResponse,
  setLifeStage,addFamilyLink,romanceSafety} from '../src/social-graph.js';
import {newActionQueues,enqueueAction,pendingActions} from '../src/action-queue.js';
import {createProfile} from '../src/trait-catalog.js';
import {newHousehold,loadHousehold} from '../src/household.js';
import {startBranchSocial,arriveSocial,cancelSocial,tickSocial} from '../src/relationships.js';
import {romanceAvailability,romanceStatus,setRomanceBoundary,relatedByFamily,
  ROMANCE_ACTION_IDS} from '../src/romance.js';
import {SAVE_KEY} from '../src/simulation.js';

const ids=['nova','ember','iris','opal','riven'],pos={x:-.2,z:1.85};
const clone=x=>JSON.parse(JSON.stringify(x));
const person=(mood=75)=>({mind:{mood:{value:mood}},needs:{
  energy:90,hunger:90,hygiene:90,fun:55},
  personality:createProfile(['temperament.cheerful','social.outgoing'],{
    likes:['socializing'],dislikes:[]
  }),action:null});
function graph(){
  const g=newSocialGraph(ids);
  for(const id of ids)setLifeStage(g,id,'adult');
  markAcquainted(g,'nova','ember',480);
  observePairViews(g,'nova','ember',{nova:{friendship:75,trust:80,tension:2},
    ember:{friendship:74,trust:80,tension:4}});
  return g;
}
function eligibleHousehold(){
  const s=newHousehold();
  for(const id of ['alex','mira']){
    Object.assign(s.relationship.views[id],{friendship:76,trust:82,tension:3});
  }
  observePairViews(s.socialGraph,'alex','mira',s.relationship.views);
  s.mind.mood.value=80;s.otherSim.mind.mood.value=80;
  return s;
}
const action=(g,id='romance.flirt',a='nova',b='ember',now=900)=>
  availableSocialActions(g,a,b,now).find(o=>o.id===id);
const receipt=(g,actor,type,at)=>
  applySocialEvent(g,{actorId:actor,targetId:actor==='nova'?'ember':'nova',
    type,at});

test('1.0k romantic category is separate from friendship, and no hidden numeric UI',()=>{
  const g=graph(),pair=getPair(g,'nova','ember');
  assert.deepEqual(ROMANCE_ACTION_IDS,['romance.flirt','romance.confess',
    'romance.date','romance.breakup','romance.tender','romance.propose',
    'romance.marry','romance.divorce','romance.checkin','romance.repair',
    'romance.hug','romance.kiss','romance.intimacy','romance.evening']);
  assert.equal(pair.friendship,'none');
  assert.equal(action(g).enabled,true);
  assert.equal(action(g,'romance.confess').enabled,false);
  assert.equal(romanceStatus(g,'nova','ember'),'Пока нет романтической истории');
  assert.deepEqual(pair.romance.views.nova,{attraction:0,boundary:'open',
    touchBoundary:'open',exclusivity:'exclusive',jealousy:0,lastRefusedAt:null});
  assert.notStrictEqual(pair.romance.views.nova,pair.romance.views.ember);
});
test('unknown ages, minors and unspecified identities fail closed',()=>{
  const g=newSocialGraph(ids);
  markAcquainted(g,'nova','ember',480);
  observePairViews(g,'nova','ember',{nova:{friendship:90,trust:90,tension:0},
    ember:{friendship:90,trust:90,tension:0}});
  assert.equal(romanceSafety(g,'nova','ember').allowed,false);
  assert.equal(action(g).enabled,false);
  assert.equal(setLifeStage(g,'nova','adult'),true);
  assert.equal(setLifeStage(g,'ember','teen'),true);
  assert.equal(action(g).enabled,false);
  assert.equal(receipt(g,'nova','romance.flirt',900),null);
  assert.equal(setLifeStage(g,'ember','adult'),true);
  assert.equal(action(g).enabled,true);
  assert.equal(romanceSafety(g,'iris','opal').allowed,false);
  assert.equal(setLifeStage(g,'iris','unknown'),false);
});
test('parent/child, shared parent, sibling and transitive family ties veto flirting',()=>{
  const g=graph();
  markAcquainted(g,'nova','iris',480);
  markAcquainted(g,'ember','iris',480);
  assert.equal(addFamilyLink(g,'iris','nova','parent'),true);
  assert.equal(addFamilyLink(g,'iris','ember','parent'),true);
  assert.equal(relatedByFamily(g,'nova','ember'),true);
  assert.equal(action(g).enabled,false);
  assert.equal(receipt(g,'nova','romance.flirt',900),null);
  assert.equal(addFamilyLink(g,'nova','iris','parent'),false,'parent ancestry cannot cycle');
  assert.equal(addFamilyLink(g,'iris','nova','parent'),false,'no duplicate');
  assert.equal(addFamilyLink(g,'nova','nova','sibling'),false);
  const h=graph();
  assert.equal(addFamilyLink(h,'nova','ember','sibling'),true);
  assert.equal(romanceSafety(h,'nova','ember').allowed,false);
  assert.equal(addFamilyLink(h,'ember','nova','sibling'),false);
});
test('completed accepted flirting records distinct feelings, not a dating commitment',()=>{
  const g=graph(),before=g.nextSeq;
  const response=resolveBranchResponse(g,'nova','ember','romance.flirt',{
    recipient:person(),minutes:900
  });
  assert.equal(response.accepted,true);
  assert.equal(response.type,'romance.flirt');
  assert.equal(getPair(g,'nova','ember').romance.views.nova.attraction,0,
    'preview or reaction has no persistent effects');
  const result=receipt(g,'nova',response.type,900);
  assert.equal(result.seq,before);
  assert.equal(g.nextSeq,before+1);
  const p=getPair(g,'nova','ember');
  assert.equal(p.romance.views.nova.attraction,10);
  assert.equal(p.romance.views.ember.attraction,7);
  assert.equal(p.friendship,'none','romantic feelings do not invent friendship');
  assert.equal('commitment' in p.romance,false,'not automatically dating');
  assert.equal(romanceStatus(g,'nova','ember'),'Искра симпатии');
});
test('reciprocal and unilateral attraction remain different for different viewers',()=>{
  const g=graph();
  receipt(g,'nova','romance.flirt',900);
  receipt(g,'nova','romance.flirt',2400);
  assert.equal(romanceStatus(g,'nova','ember'),'Нравится, но взаимность неясна');
  assert.equal(romanceStatus(g,'ember','nova'),'К нему проявляют симпатию');
  receipt(g,'ember','romance.flirt',3900);
  receipt(g,'ember','romance.flirt',5400);
  assert.equal(romanceStatus(g,'nova','ember'),'Взаимная симпатия');
  assert.equal(romanceStatus(g,'ember','nova'),'Взаимная симпатия');
  assert.equal(getPair(g,'nova','iris'),null,'other relationships are untouched');
});
test('confession requires reciprocal history; no automatic dating from friendly chat',()=>{
  const g=graph();
  for(const [actor,at] of [['nova',900],['nova',2500],['nova',4100]])
    receipt(g,actor,'romance.flirt',at);
  assert.equal(action(g,'romance.confess','nova','ember',4700).enabled,false,
    'even one-sided flirting does not suffice');
  receipt(g,'ember','romance.flirt',5700);
  assert.equal(action(g,'romance.confess','nova','ember',6100).enabled,true);
  const response=resolveBranchResponse(g,'nova','ember','romance.confess',{
    recipient:person(),minutes:6100
  });
  assert.equal(response.accepted,true);
  receipt(g,'nova',response.type,6100);
  const p=getPair(g,'nova','ember');
  assert.ok(p.romance.views.nova.attraction>p.romance.views.ember.attraction);
  assert.equal('commitment' in p.romance,false);
});
test('explicit boundary and rejection cooldown prevent pressure',()=>{
  const g=graph(),p=getPair(g,'nova','ember');
  assert.equal(setRomanceBoundary(g,'ember','nova','closed'),true);
  assert.equal(action(g).enabled,false);
  assert.equal(setRomanceBoundary(g,'ember','nova','open'),true);
  assert.equal(action(g).enabled,true);
  receipt(g,'nova','romance.flirt.refused',900);
  assert.equal(p.romance.views.nova.attraction,0);
  assert.equal(p.romance.views.ember.attraction,0);
  assert.equal(p.romance.views.ember.lastRefusedAt,900);
  assert.equal(action(g,'romance.flirt','nova','ember',1000).enabled,false);
  assert.equal(action(g,'romance.flirt','nova','ember',2340).enabled,true);
});
test('live reaction checks consent, needs and mood again, not just menu eligibility',()=>{
  const g=graph(),p=getPair(g,'nova','ember');
  assert.equal(resolveBranchResponse(g,'nova','ember','romance.flirt',{
    recipient:person(20),minutes:900
  }).accepted,false);
  const exhausted=person();exhausted.needs.energy=20;
  assert.equal(resolveBranchResponse(g,'nova','ember','romance.flirt',{
    recipient:exhausted,minutes:900
  }).type,'romance.flirt.refused');
  assert.equal(resolveBranchResponse(g,'nova','ember','romance.flirt',{
    minutes:900
  }).accepted,false,'missing recipient cannot silently agree');
  assert.equal(p.events.length,0);
});
test('manual romance uses existing route, reply badges and completion only; no auto',()=>{
  const s=eligibleHousehold(),p=getPair(s.socialGraph,'alex','mira');
  assert.equal(startBranchSocial(s,'alex',pos,'romance.flirt',true),false);
  assert.equal(startBranchSocial(s,'alex',pos,'romance.flirt'),true);
  assert.equal(p.events.length,0);
  const pending=clone(s);
  const restored=loadHousehold(pending);
  assert.equal(restored.socialAction.branchAction.id,'romance.flirt');
  assert.equal(arriveSocial(s),true);
  assert.equal(tickSocial(s,19),true);
  assert.equal(s.socialAction,null);
  assert.equal(p.events.at(-1).type,'romance.flirt');
  assert.ok(p.romance.views.alex.attraction>p.romance.views.mira.attraction);
  assert.deepEqual(loadHousehold(clone(s)).socialGraph.pairs,
    s.socialGraph.pairs,'save/load does not replay completed romantic rewards');
});
test('refused romance is not a fight, does not punish shared affinity or create fake love',()=>{
  const s=eligibleHousehold(),p=getPair(s.socialGraph,'alex','mira');
  const base=s.relationship.affinity;
  assert.equal(startBranchSocial(s,'alex',pos,'romance.flirt'),true);
  arriveSocial(s);
  s.otherSim.mind.mood.value=18;
  assert.equal(tickSocial(s,19),true);
  assert.equal(s.socialAction,null);
  assert.equal(p.events.at(-1).type,'romance.flirt.refused');
  assert.equal(s.relationship.affinity,base);
  assert.equal(s.mind.memories.length,0);
  assert.equal(s.otherSim.mind.memories.length,0);
  assert.equal(p.romance.views.alex.attraction,0);
  assert.equal(p.romance.views.mira.attraction,0);
  assert.equal(availableSocialActions(s.socialGraph,'alex','mira',s.minutes)
    .find(a=>a.id==='romance.flirt').enabled,false);
});
test('cancel, pause and player FIFO never forge a romantic completion',()=>{
  const s=eligibleHousehold(),g=s.socialGraph;
  const task=enqueueAction(s.actionQueues,'alex',{
    type:'branch',targetId:'mira',actionId:'romance.flirt'
  });
  assert.ok(task);
  assert.equal(pendingActions(s.actionQueues,'alex').length,1);
  assert.equal(startBranchSocial(s,'alex',pos,'romance.flirt'),true);
  arriveSocial(s);s.paused=true;
  assert.equal(tickSocial(s,20),false);
  s.paused=false;
  assert.equal(cancelSocial(s),true);
  assert.equal(getPair(g,'alex','mira').events.length,0);
  assert.equal(pendingActions(s.actionQueues,'alex')[0].seq,task.seq);
});
test('legacy v1 saves explicitly migrate only the two known demo adults',()=>{
  const saved=clone(newHousehold());
  delete saved.socialGraph.lifeStages;
  delete saved.socialGraph.familyLinks;
  for(const pair of Object.values(saved.socialGraph.pairs))delete pair.romance;
  const loaded=loadHousehold(saved);
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.equal(loaded.version,1);
  assert.equal(loaded.socialGraph.schema,1);
  assert.equal(loaded.socialGraph.lifeStages.alex,'adult');
  assert.equal(loaded.socialGraph.lifeStages.mira,'adult');
  assert.equal(getPair(loaded.socialGraph,'alex','mira').romance.views.alex.attraction,0);
  const modern=clone(newHousehold());
  modern.socialGraph.lifeStages.alex='teen';
  const noAdult=loadHousehold(modern);
  assert.equal(noAdult.socialGraph.lifeStages.alex,'teen');
  assert.equal(romanceSafety(noAdult.socialGraph,'alex','mira').allowed,false);
});
test('N-resident graph restore sanitizes forged romantic state and connected family',()=>{
  const g=graph();
  receipt(g,'nova','romance.flirt',900);
  const raw=clone(g);
  raw.pairs[JSON.stringify(['ember','nova'])].romance.views.nova.attraction=1e9;
  raw.lifeStages.ember='teen';
  const loaded=restoreSocialGraph(raw,ids);
  const p=getPair(loaded,'nova','ember');
  assert.equal(p.romance.views.nova.attraction,0,'minor romantic progress discarded');
  assert.ok(p.events.every(e=>!e.type.startsWith('romance.')));
  raw.lifeStages.ember='adult';
  raw.familyLinks=[{from:'iris',to:'nova',kind:'parent'},
    {from:'iris',to:'ember',kind:'parent'}];
  const relative=restoreSocialGraph(raw,ids);
  assert.equal(romanceSafety(relative,'nova','ember').allowed,false);
  assert.equal(getPair(relative,'nova','ember').romance.views.nova.attraction,0);
});
test('shipped Safari menu and CI include romance module without showing formulas',()=>{
  const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
  const html=read('../index.html'),game=read('../src/game.js'),
    ci=read('../.github/workflows/pages.yml'),romance=read('../src/romance.js');
  assert.ok(html.includes('сборка / 1.2d'));
  assert.ok(html.includes('id="romance-btn"'));
  assert.ok(html.includes('id="romance-status"'));
  assert.ok(game.includes("['romance-btn','romance']"));
  assert.ok(game.includes('romanceStatus(game.socialGraph'));
  assert.ok(game.includes("category==='romance'"));
  assert.ok(ci.includes('node --check src/romance.js'));
  assert.ok(ci.includes('src/social-dynamics.js src/romance.js src/reaction-badges.js'));
  assert.ok(!/\b(alex|mira|document|localStorage|playcanvas)\b/i.test(romance));
  assert.ok(!romance.includes('Math.random('));
});
