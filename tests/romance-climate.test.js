import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newSocialGraph,markAcquainted,observePairViews,getPair,applySocialEvent,
  restoreSocialGraph,availableSocialActions,setLifeStage,addFamilyLink,
  resolveBranchResponse} from '../src/social-graph.js';
import {romanceClimate,romanceLoveDescription,romanceStatus,
  setRomanceBoundary} from '../src/romance.js';
import {newHousehold,loadHousehold} from '../src/household.js';
import {startBranchSocial,arriveSocial,tickSocial,cancelSocial} from '../src/relationships.js';
import {enqueueAction,pendingActions} from '../src/action-queue.js';

const names=['nova','ember','iris','opal','riven'];
const clone=x=>JSON.parse(JSON.stringify(x));
const position={x:-.2,z:1.85};
const person=(mood=86)=>({mind:{mood:{value:mood}},personality:null,
  needs:{energy:92,hunger:94,hygiene:91,fun:80}});
function socialGraph(){
  const g=newSocialGraph(names);
  for(const name of names)setLifeStage(g,name,'adult');
  markAcquainted(g,'nova','ember',480);
  observePairViews(g,'nova','ember',{nova:{friendship:88,trust:90,tension:0},
    ember:{friendship:88,trust:90,tension:0}});
  return g;
}
const write=(g,a,b,type,at)=>applySocialEvent(g,{
  actorId:a,targetId:b,type,at});
const opts=(g,a,b,now,type)=>availableSocialActions(g,a,b,now).find(x=>x.id===type);
function relationship(g,a='nova',b='ember'){
  for(const [from,to,type,at] of [
    [a,b,'romance.flirt',900],[b,a,'romance.flirt',2400],
    [a,b,'romance.flirt',3900],[a,b,'romance.confess',4200],
    [a,b,'romance.date',4500]
  ])assert.ok(write(g,from,to,type,at),type);
  return getPair(g,a,b);
}
function household(){
  const root=newHousehold();
  root.minutes=10000;root.otherSim.minutes=10000;
  root.mind.mood.value=86;root.otherSim.mind.mood.value=86;
  for(const id of ['alex','mira'])
    Object.assign(root.relationship.views[id],{friendship:88,trust:90,tension:0});
  observePairViews(root.socialGraph,'alex','mira',root.relationship.views);
  relationship(root.socialGraph,'alex','mira');
  return root;
}
const finish=(s,actor,id)=>{
  assert.equal(startBranchSocial(s,actor,position,id),true,id);
  assert.equal(arriveSocial(s),true);
  return tickSocial(s,19);
};
test('1.0n: climate is a pure pair-local calculation, not auto wedding or romance',()=>{
  const g=socialGraph(),saved=clone(g);
  assert.deepEqual(romanceClimate(g,'nova','ember',10000),{state:'none',label:''});
  assert.deepEqual(g,saved);
  relationship(g);
  assert.equal(romanceClimate(g,'nova','ember',4500).state,'steady');
  assert.equal(romanceStatus(g,'nova','ember'),'Встречаются');
  assert.equal(romanceClimate(g,'nova','iris',4500).state,'none');
  assert.equal(g.schema,1);
});
test('1.0n: 5 days without romantic contact creates distance but does not divorce',()=>{
  const g=socialGraph(),p=relationship(g);
  assert.equal(romanceClimate(g,'nova','ember',4500+4*1440).state,'steady');
  assert.equal(romanceClimate(g,'nova','ember',4500+5*1440).state,'distant');
  assert.equal(opts(g,'nova','ember',13000,'romance.checkin').enabled,true);
  assert.equal(opts(g,'nova','ember',13000,'romance.propose').enabled,false);
  assert.equal(p.romance.bond.status,'dating');
  assert.equal(p.romance.bond.lastConnectionAt,undefined);
});
test('1.0n: completed check-in restores connection, rate-limited per actor/day',()=>{
  const g=socialGraph(),p=relationship(g);
  assert.equal(opts(g,'nova','ember',13000,'romance.checkin').enabled,true);
  const prev=g.nextSeq;
  const reply=resolveBranchResponse(g,'nova','ember','romance.checkin',{
    minutes:13000,recipient:person()
  });
  assert.equal(reply.type,'romance.checkin');
  assert.equal(reply.accepted,true);
  assert.equal(p.romance.bond.lastConnectionAt,undefined,'preview is side-effect free');
  assert.ok(write(g,'nova','ember',reply.type,13000));
  assert.equal(g.nextSeq,prev+1);
  assert.equal(p.romance.bond.lastConnectionAt,13000);
  assert.equal(romanceClimate(g,'nova','ember',13001).state,'steady');
  assert.equal(opts(g,'nova','ember',13002,'romance.checkin').enabled,false);
  assert.equal(write(g,'nova','ember','romance.checkin',13004),null);
  assert.equal(opts(g,'ember','nova',13002,'romance.checkin').enabled,true,
    'each resident may care in their own direction');
  assert.equal(opts(g,'nova','ember',13000+1440,'romance.checkin').enabled,true);
});
test('1.0n: one actual quarrel strains the couple but cannot end their commitment',()=>{
  const g=socialGraph(),p=relationship(g);
  assert.ok(write(g,'nova','ember','argue',6900));
  assert.equal(romanceClimate(g,'nova','ember',7000).state,'strained');
  assert.equal(opts(g,'nova','ember',7000,'romance.tender').enabled,false);
  assert.equal(opts(g,'nova','ember',7000,'romance.repair').enabled,true);
  assert.equal(opts(g,'nova','ember',7000,'romance.checkin').enabled,false);
  assert.equal(opts(g,'nova','ember',7000,'romance.breakup').enabled,true);
  assert.equal(p.romance.bond.status,'dating');
});
test('1.0n: a declined repair does not clear harm, create a fight or time-travel connection',()=>{
  const g=socialGraph(),p=relationship(g);
  write(g,'ember','nova','conversation.argue',6900);
  const reply=resolveBranchResponse(g,'nova','ember','romance.repair',{
    minutes:7100,recipient:person(15)
  });
  assert.equal(reply.accepted,false);
  assert.equal(reply.type,'romance.repair.refused');
  assert.ok(write(g,'nova','ember',reply.type,7100));
  assert.equal(p.romance.bond.lastConnectionAt,undefined);
  assert.equal(romanceClimate(g,'nova','ember',7200).state,'strained');
  assert.equal(opts(g,'nova','ember',7200,'romance.repair').enabled,false,
    'respect temporary refusal boundary');
  assert.equal(opts(g,'nova','ember',8550,'romance.repair').enabled,true);
  assert.equal(p.romance.bond.status,'dating');
});
test('1.0n: accepted repair clears the specific past conflict; a new one returns',()=>{
  const g=socialGraph(),p=relationship(g);
  write(g,'nova','ember','argue',6900);
  const yes=resolveBranchResponse(g,'ember','nova','romance.repair',{
    minutes:7100,recipient:person()
  });
  assert.equal(yes.accepted,true);
  assert.ok(write(g,'ember','nova',yes.type,7100));
  assert.equal(p.romance.bond.lastConnectionAt,7100);
  assert.equal(romanceClimate(g,'nova','ember',7100).state,'recovering');
  assert.equal(opts(g,'nova','ember',7101,'romance.repair').enabled,false);
  assert.equal(romanceClimate(g,'nova','ember',7100+3*1440).state,'steady');
  assert.ok(write(g,'nova','ember','argue',12000));
  assert.equal(romanceClimate(g,'nova','ember',12100).state,'strained');
});
test('1.0n: accepted tenderness also counts as connection but not any casual talk',()=>{
  const g=socialGraph(),p=relationship(g);
  assert.ok(write(g,'nova','ember','romance.tender',6000));
  assert.equal(p.romance.bond.lastConnectionAt,6000);
  write(g,'nova','ember','talk',14000);
  assert.equal(romanceClimate(g,'nova','ember',14000).state,'distant',
    'normal small talk cannot substitute for expressed romantic attention');
  assert.equal(p.romance.bond.careDays.nova.length,1);
  assert.equal(p.romance.bond.careDays.ember.length,0);
});
test('1.0n: bond maturity cannot skip a recent conflict or long distance',()=>{
  const g=socialGraph();relationship(g);
  for(const [id,to,at] of [['nova','ember',6000],['ember','nova',6050],
    ['nova','ember',7500],['ember','nova',7550]])
    assert.ok(write(g,id,to,'romance.tender',at));
  assert.equal(opts(g,'nova','ember',9000,'romance.propose').enabled,true);
  write(g,'nova','ember','argue',8900);
  assert.equal(opts(g,'nova','ember',9000,'romance.propose').enabled,false);
  const repaired=write(g,'nova','ember','romance.repair',9200);
  assert.ok(repaired);
  assert.equal(opts(g,'nova','ember',9300,'romance.propose').enabled,true);
  assert.equal(opts(g,'nova','ember',9200+6*1440,'romance.propose').enabled,false);
  assert.equal(opts(g,'nova','ember',9200+6*1440,'romance.checkin').enabled,true);
});
test('1.0n: future/polluted connection timestamps are sanitized, not rewarded',()=>{
  const g=socialGraph();relationship(g);
  write(g,'nova','ember','romance.tender',6000);
  const key=JSON.stringify(['ember','nova']);
  for(const invalid of [999999,-500,'6000',NaN]){
    const raw=clone(g);
    raw.pairs[key].romance.bond.lastConnectionAt=invalid;
    const loaded=restoreSocialGraph(raw,names);
    const p=getPair(loaded,'nova','ember');
    assert.equal(p.romance.bond.lastConnectionAt,undefined);
    assert.equal(romanceClimate(loaded,'nova','ember',12000).state,'distant');
  }
  const restored=restoreSocialGraph(clone(g),names);
  assert.equal(getPair(restored,'nova','ember').romance.bond.lastConnectionAt,6000);
});
test('1.0n: old 1.0m active bond loads with no invented check-in or repair',()=>{
  const g=socialGraph();relationship(g);
  const legacy=clone(g);
  for(const pair of Object.values(legacy.pairs)){
    delete pair.romance.bond.lastConnectionAt;
  }
  const restored=restoreSocialGraph(legacy,names);
  assert.equal(romanceClimate(restored,'nova','ember',13000).state,'distant');
  assert.equal(getPair(restored,'nova','ember').romance.bond.status,'dating');
  assert.equal(restored.nextSeq,g.nextSeq);
  assert.ok(!getPair(restored,'nova','ember').events.some(e=>
    ['romance.checkin','romance.repair'].includes(e.type)));
});
test('1.0n: no romance repair or attention involving minors, relatives or crossed partner',()=>{
  const g=socialGraph();relationship(g);
  write(g,'nova','ember','argue',6900);
  assert.equal(setRomanceBoundary(g,'ember','nova','closed'),true);
  assert.equal(opts(g,'nova','ember',7000,'romance.repair').enabled,false);
  assert.equal(opts(g,'nova','ember',7000,'romance.breakup').enabled,true);
  setRomanceBoundary(g,'ember','nova','open');
  setLifeStage(g,'ember','teen');
  assert.equal(opts(g,'nova','ember',7000,'romance.repair').enabled,false);
  setLifeStage(g,'ember','adult');
  addFamilyLink(g,'iris','nova','parent');addFamilyLink(g,'iris','ember','parent');
  assert.equal(opts(g,'nova','ember',7000,'romance.repair').enabled,false);
  assert.equal(opts(g,'nova','ember',7000,'romance.breakup').enabled,true);
});
test('1.0n: five arbitrary resident IDs have separate pair climates',()=>{
  const g=socialGraph();relationship(g);
  markAcquainted(g,'iris','opal',480);
  observePairViews(g,'iris','opal',{
    iris:{friendship:89,trust:90,tension:0},opal:{friendship:89,trust:90,tension:0}
  });
  relationship(g,'iris','opal');
  write(g,'nova','ember','argue',6900);
  assert.equal(romanceClimate(g,'nova','ember',7000).state,'strained');
  assert.equal(romanceClimate(g,'iris','opal',7000).state,'steady');
  assert.equal(romanceClimate(g,'opal','riven',7000).state,'none');
  write(g,'iris','opal','romance.checkin',7000);
  assert.equal(romanceClimate(g,'iris','opal',12000).state,'steady');
  assert.equal(romanceClimate(g,'nova','ember',7001).state,'strained');
});
test('1.0n: real scene route, pause, cancel and mid-action save cannot fabricate check-ins',()=>{
  const s=household(),pair=getPair(s.socialGraph,'alex','mira');
  const affinity=s.relationship.affinity,seq=s.socialGraph.nextSeq;
  assert.equal(romanceClimate(s.socialGraph,'alex','mira',s.minutes).state,'steady');
  assert.equal(startBranchSocial(s,'alex',position,'romance.checkin',true),false);
  const task=enqueueAction(s.actionQueues,'alex',{
    type:'branch',targetId:'mira',actionId:'romance.checkin'
  });
  assert.ok(task);
  assert.equal(startBranchSocial(s,'alex',position,'romance.checkin'),true);
  assert.equal(pair.romance.bond.lastConnectionAt,undefined);
  const mid=loadHousehold(clone(s));
  assert.equal(mid.socialAction.branchAction.id,'romance.checkin');
  arriveSocial(s);s.paused=true;
  assert.equal(tickSocial(s,20),false);s.paused=false;
  assert.equal(cancelSocial(s),true);
  assert.equal(pair.romance.bond.lastConnectionAt,undefined);
  assert.equal(pendingActions(s.actionQueues,'alex')[0].seq,task.seq);
  assert.equal(startBranchSocial(s,'alex',position,'romance.checkin'),true);
  arriveSocial(s);assert.equal(tickSocial(s,19),true);
  assert.equal(pair.romance.bond.lastConnectionAt,s.minutes);
  assert.equal(s.relationship.affinity,affinity);
  assert.equal(s.socialGraph.nextSeq,seq+1);
  assert.deepEqual(loadHousehold(clone(s)).socialGraph.pairs,
    s.socialGraph.pairs,'no duplicate rewards on restore');
});
test('1.0n: household conversation about an actual quarrel repairs, not overrides, it',()=>{
  const s=household(),pair=getPair(s.socialGraph,'alex','mira');
  const affinity=s.relationship.affinity;
  write(s.socialGraph,'alex','mira','argue',9500);
  assert.equal(romanceClimate(s.socialGraph,'alex','mira',s.minutes).state,'strained');
  assert.equal(startBranchSocial(s,'mira',position,'romance.repair'),true);
  arriveSocial(s);assert.equal(tickSocial(s,19),true);
  assert.equal(pair.events.at(-1).type,'romance.repair');
  assert.equal(romanceClimate(s.socialGraph,'alex','mira',s.minutes).state,'recovering');
  assert.equal(s.relationship.affinity,affinity);
  assert.deepEqual(s.mind.memories,[]);
  assert.deepEqual(s.otherSim.mind.memories,[]);
  assert.equal(pair.romance.bond.status,'dating');
});
test('1.0n: mobile status UI and ROMANCE actions exist without numeric climate meter',()=>{
  const read=x=>readFileSync(new URL(x,import.meta.url),'utf8');
  const html=read('../index.html'),game=read('../src/game.js'),
    logic=read('../src/romance.js'),graph=read('../src/social-graph.js');
  assert.ok(html.includes('сборка / 1.1u'));
  assert.ok(html.includes('id="romance-climate"'));
  assert.ok(game.includes("romanceClimate(game.socialGraph"));
  assert.ok(graph.includes('Уделить внимание'));
  assert.ok(graph.includes('Обсудить обиду'));
  assert.ok(!/\b(playcanvas|document|localStorage)\b/i.test(logic));
});
