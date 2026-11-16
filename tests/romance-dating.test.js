import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newSocialGraph,getOrCreatePair,getPair,markAcquainted,observePairViews,
  applySocialEvent,restoreSocialGraph,availableSocialActions,setLifeStage,
  addFamilyLink,resolveBranchResponse} from '../src/social-graph.js';
import {currentDatingPartner,romanceStatus,romanceAvailability} from '../src/romance.js';
import {newHousehold,loadHousehold} from '../src/household.js';
import {startBranchSocial,arriveSocial,cancelSocial,tickSocial} from '../src/relationships.js';
import {enqueueAction,pendingActions} from '../src/action-queue.js';

const ids=['nova','ember','iris','opal','riven'];
const clone=v=>JSON.parse(JSON.stringify(v));
const place={x:-.2,z:1.85};
function person(mood=82){
  return {personality:null,mind:{mood:{value:mood},memories:[]},
    needs:{energy:95,hunger:95,hygiene:95,fun:85}};
}
function setup(){
  const graph=newSocialGraph(ids);
  for(const id of ids)setLifeStage(graph,id,'adult');
  markAcquainted(graph,'nova','ember',480);
  observePairViews(graph,'nova','ember',{
    nova:{friendship:85,trust:86,tension:0},
    ember:{friendship:86,trust:87,tension:0}
  });
  return graph;
}
function event(g,actor,target,type,at){
  return applySocialEvent(g,{actorId:actor,targetId:target,type,at});
}
function court(g,a='nova',b='ember'){
  // Directional, completed, accepted initiative from both people + confession.
  for(const [actor,target,type,at] of [
    [a,b,'romance.flirt',900],
    [b,a,'romance.flirt',2400],
    [a,b,'romance.flirt',3900],
    [a,b,'romance.confess',4200]
  ])assert.ok(event(g,actor,target,type,at));
}
function choose(g,a,b,id,at=4500){
  return availableSocialActions(g,a,b,at).find(x=>x.id===id);
}
function household(){
  const root=newHousehold();
  root.minutes=6000;
  root.otherSim.minutes=6000;
  root.mind.mood.value=82;root.otherSim.mind.mood.value=82;
  for(const id of ['alex','mira'])
    Object.assign(root.relationship.views[id],{friendship:86,trust:86,tension:0});
  observePairViews(root.socialGraph,'alex','mira',root.relationship.views);
  court(root.socialGraph,'alex','mira');
  return root;
}
function finish(root,actor='alex',action='romance.date'){
  assert.equal(startBranchSocial(root,actor,place,action),true);
  assert.equal(arriveSocial(root),true);
  return tickSocial(root,19);
}

test('1.0l: reciprocal completed courtship unlocks a proposal, not a premature couple',()=>{
  const g=setup(),p=getPair(g,'nova','ember');
  assert.equal(choose(g,'nova','ember','romance.date').enabled,false);
  event(g,'nova','ember','romance.flirt',900);
  event(g,'nova','ember','romance.flirt',2400);
  event(g,'nova','ember','romance.flirt',3900);
  event(g,'nova','ember','romance.confess',4200);
  assert.equal(choose(g,'nova','ember','romance.date').enabled,false,
    'one-sided successes never become a committed relationship');
  assert.equal(p.romance.bond.status,'none');
  const h=setup();
  court(h);
  assert.equal(choose(h,'nova','ember','romance.date').enabled,true);
  assert.equal(getPair(h,'nova','ember').romance.bond.status,'none',
    'an offered menu option is not consent');
});
test('1.0l: live recipient answer does not commit until canonical completion',()=>{
  const g=setup();court(g);
  const pair=getPair(g,'nova','ember');
  const reply=resolveBranchResponse(g,'nova','ember','romance.date',{
    recipient:person(),minutes:4500
  });
  assert.equal(reply.type,'romance.date');
  assert.equal(reply.accepted,true);
  assert.equal(pair.romance.bond.status,'none');
  const receipt=event(g,'nova','ember',reply.type,4500);
  assert.ok(receipt);
  assert.equal(pair.romance.bond.status,'dating');
  assert.equal(pair.romance.bond.since,4500);
  assert.equal(pair.romance.bond.ex,false);
  assert.equal(currentDatingPartner(g,'nova'),'ember');
  assert.equal(currentDatingPartner(g,'ember'),'nova');
  assert.equal(currentDatingPartner(g,'iris'),null);
  assert.equal(romanceStatus(g,'nova','ember'),'Встречаются');
  assert.equal(romanceStatus(g,'ember','nova'),'Встречаются');
  assert.equal(choose(g,'nova','ember','romance.date',4600).enabled,false);
  assert.equal(event(g,'nova','ember','romance.date',4700),null,
    'graph itself refuses to duplicate the milestone');
});
test('1.0l: bad mood or physical needs can decline proposal without a commitment',()=>{
  const g=setup();court(g);
  const p=getPair(g,'nova','ember'),raw=clone(g);
  for(const recipient of [person(18),{...person(),needs:{...person().needs,energy:15}}]){
    const reply=resolveBranchResponse(g,'nova','ember','romance.date',{
      recipient,minutes:4500});
    assert.equal(reply.accepted,false);
    assert.equal(reply.type,'romance.date.refused');
  }
  const refused=resolveBranchResponse(g,'nova','ember','romance.date',{
    recipient:person(15),minutes:4500});
  assert.ok(event(g,'nova','ember',refused.type,4500));
  assert.equal(p.romance.bond.status,'none');
  assert.equal(p.romance.views.ember.lastRefusedAt,4500);
  assert.equal(choose(g,'nova','ember','romance.date',4700).enabled,false);
  assert.equal(choose(g,'nova','ember','romance.date',6000).enabled,true);
  assert.equal(raw.pairs[JSON.stringify(['ember','nova'])].romance.bond.status,'none');
});
test('1.0l: safe voluntary separation keeps bounded history and no new fake couple',()=>{
  const g=setup();court(g);
  event(g,'nova','ember','romance.date',4500);
  assert.equal(choose(g,'ember','nova','romance.breakup',5000).enabled,true);
  assert.ok(event(g,'ember','nova','romance.breakup',5000));
  const p=getPair(g,'nova','ember');
  assert.deepEqual(p.romance.bond,
    {status:'none',since:null,ex:true,lastEndedAt:5000});
  assert.equal(romanceStatus(g,'ember','nova'),'Бывшие партнёры');
  assert.equal(currentDatingPartner(g,'nova'),null);
  assert.equal(event(g,'ember','nova','romance.breakup',5500),null,
    'a second breakup cannot fake extra history');
  const restored=restoreSocialGraph(clone(g),ids);
  assert.deepEqual(getPair(restored,'nova','ember').romance.bond,p.romance.bond);
  assert.equal(choose(restored,'nova','ember','romance.breakup',5600).enabled,false);
});
test('1.0l: commitment is per pair and does not allow overlapping exclusive partners',()=>{
  const g=setup();court(g);
  assert.ok(event(g,'nova','ember','romance.date',4500));
  markAcquainted(g,'nova','iris',480);
  observePairViews(g,'nova','iris',{
    nova:{friendship:90,trust:90,tension:0},iris:{friendship:90,trust:90,tension:0}});
  const third=getPair(g,'nova','iris');
  third.romance.views.nova.attraction=100;
  third.romance.views.iris.attraction=100;
  assert.equal(choose(g,'nova','iris','romance.flirt',5100).enabled,false);
  assert.equal(choose(g,'nova','iris','romance.date',5100).enabled,false);
  assert.equal(event(g,'nova','iris','romance.date',5100),null);
  assert.equal(currentDatingPartner(g,'iris'),null);
  assert.equal(currentDatingPartner(g,'riven'),null);
});
test('1.0l: a closed boundary or being a minor stops entry, but not a breakup',()=>{
  const g=setup();court(g);event(g,'nova','ember','romance.date',4500);
  assert.equal(setLifeStage(g,'nova','teen'),true);
  assert.equal(choose(g,'nova','ember','romance.flirt',5000).enabled,false);
  assert.equal(choose(g,'nova','ember','romance.breakup',5000).enabled,true);
  assert.ok(event(g,'nova','ember','romance.breakup',5000));
  assert.equal(getPair(g,'nova','ember').romance.bond.ex,true);
  const h=setup();court(h);event(h,'nova','ember','romance.date',4500);
  assert.equal(addFamilyLink(h,'iris','nova','parent'),true);
  assert.equal(addFamilyLink(h,'iris','ember','parent'),true);
  assert.equal(choose(h,'nova','ember','romance.date',5000).enabled,false);
  assert.equal(choose(h,'nova','ember','romance.breakup',5000).enabled,true);
  assert.ok(event(h,'nova','ember','romance.breakup',5000));
});
test('1.0l: old saves never become automatically dating, new state survives v1',()=>{
  const g=setup();court(g);
  const old=clone(g);
  for(const pair of Object.values(old.pairs))delete pair.romance.bond;
  const loaded=restoreSocialGraph(old,ids);
  assert.equal(getPair(loaded,'nova','ember').romance.bond.status,'none');
  assert.equal(loaded.schema,1);
  event(g,'nova','ember','romance.date',4500);
  const restored=restoreSocialGraph(clone(g),ids);
  assert.equal(restored.schema,1);
  assert.equal(getPair(restored,'nova','ember').romance.bond.status,'dating');
  assert.equal(getPair(restored,'nova','ember').romance.bond.since,4500);
  assert.equal(restored.nextSeq,g.nextSeq);
});
test('1.0l: corrupted double-commitment save is reduced to one safe pair',()=>{
  const g=setup();court(g);event(g,'nova','ember','romance.date',4500);
  const p=getOrCreatePair(g,'nova','iris');
  p.metAt=5000;p.lastAt=5100;
  p.romance.bond={status:'dating',since:5000,ex:false,lastEndedAt:null};
  let restored=restoreSocialGraph(clone(g),ids);
  assert.equal(currentDatingPartner(restored,'nova'),'ember');
  assert.equal(getPair(restored,'nova','iris').romance.bond.status,'none');
  const tainted=clone(g);
  tainted.pairs[JSON.stringify(['ember','nova'])].romance.bond.since=999999;
  restored=restoreSocialGraph(tainted,ids);
  assert.equal(getPair(restored,'nova','ember').romance.bond.status,'none');
});
test('1.0l: live manual dating uses the same 18-minute path, not the queue preview',()=>{
  const s=household(),p=getPair(s.socialGraph,'alex','mira');
  const before=s.relationship.affinity,seq=s.socialGraph.nextSeq;
  assert.equal(startBranchSocial(s,'alex',place,'romance.date',true),false);
  assert.equal(startBranchSocial(s,'alex',place,'romance.date'),true);
  assert.equal(p.romance.bond.status,'none');
  const mid=loadHousehold(clone(s));
  assert.equal(mid.socialAction.branchAction.id,'romance.date');
  assert.equal(mid.socialGraph.pairs[JSON.stringify(['alex','mira'])].romance.bond.status,'none');
  assert.equal(arriveSocial(s),true);
  s.paused=true;assert.equal(tickSocial(s,50),false);
  s.paused=false;
  assert.equal(tickSocial(s,19),true);
  assert.equal(s.socialAction,null);
  assert.equal(p.romance.bond.status,'dating');
  assert.equal(s.socialGraph.nextSeq,seq+1);
  assert.equal(s.relationship.affinity,before,
    'a committed pair should not magically gain generic friendship points');
  assert.equal(s.mind.memories.length,0);
  assert.equal(s.otherSim.mind.memories.length,0);
  const reloaded=loadHousehold(clone(s));
  assert.equal(getPair(reloaded.socialGraph,'alex','mira').romance.bond.status,'dating');
});
test('1.0l: a declined live proposal is not a quarrel or hidden approval',()=>{
  const s=household(),p=getPair(s.socialGraph,'alex','mira');
  const affinity=s.relationship.affinity;
  assert.equal(startBranchSocial(s,'alex',place,'romance.date'),true);
  arriveSocial(s);
  s.otherSim.mind.mood.value=10;
  assert.equal(tickSocial(s,19),true);
  assert.equal(s.socialAction,null);
  assert.equal(p.events.at(-1).type,'romance.date.refused');
  assert.equal(p.romance.bond.status,'none');
  assert.equal(s.relationship.affinity,affinity);
  assert.deepEqual(s.mind.memories,[]);
  assert.deepEqual(s.otherSim.mind.memories,[]);
  assert.equal(choose(s.socialGraph,'alex','mira','romance.date',s.minutes).enabled,false);
});
test('1.0l: in-game separation can be chosen from either side, no consent veto',()=>{
  const s=household();
  assert.equal(finish(s,'alex','romance.date'),true);
  assert.equal(finish(s,'mira','romance.breakup'),true);
  const p=getPair(s.socialGraph,'alex','mira');
  assert.equal(p.romance.bond.status,'none');
  assert.equal(p.romance.bond.ex,true);
  assert.equal(romanceStatus(s.socialGraph,'mira','alex'),'Бывшие партнёры');
  assert.equal(s.socialAction,null);
  assert.equal(s.relationship.affinity,50);
});
test('1.0l: cancel and FIFO restoration never fabricate dating evidence',()=>{
  const s=household(),g=s.socialGraph;
  const item=enqueueAction(s.actionQueues,'alex',{
    type:'branch',targetId:'mira',actionId:'romance.date'
  });
  assert.ok(item);
  assert.equal(startBranchSocial(s,'alex',place,'romance.date'),true);
  arriveSocial(s);
  assert.equal(cancelSocial(s),true);
  assert.equal(getPair(g,'alex','mira').romance.bond.status,'none');
  assert.equal(pendingActions(s.actionQueues,'alex')[0].seq,item.seq);
  const loaded=loadHousehold(clone(s));
  assert.equal(pendingActions(loaded.actionQueues,'alex')[0].seq,item.seq);
  assert.equal(getPair(loaded.socialGraph,'alex','mira').romance.bond.status,'none');
});
test('1.0l: only category-backed actions, no imported renderer or age-life-cycle implementation',()=>{
  const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
  const html=read('../index.html'),game=read('../src/game.js'),
    romance=read('../src/romance.js');
  assert.ok(html.includes('сборка / 1.2s'));
  assert.ok(html.includes('id="romance-btn"'));
  assert.ok(game.includes("category==='romance'"));
  assert.ok(romance.includes("'romance.date'"));
  assert.ok(romance.includes("'romance.breakup'"));
  assert.ok(!/\b(playcanvas|document|localStorage|Math.random)\b/i.test(romance));
});
