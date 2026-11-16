import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newSocialGraph,getPair,getOrCreatePair,markAcquainted,observePairViews,
  applySocialEvent,restoreSocialGraph,availableSocialActions,setLifeStage,
  addFamilyLink,resolveBranchResponse} from '../src/social-graph.js';
import {romanceStatus,romanceLoveDescription,romanceAvailability,
  currentDatingPartner,setRomanceBoundary} from '../src/romance.js';
import {newHousehold,loadHousehold} from '../src/household.js';
import {startBranchSocial,arriveSocial,tickSocial,cancelSocial} from '../src/relationships.js';
import {enqueueAction,pendingActions} from '../src/action-queue.js';

const ids=['nova','ember','iris','opal','riven'];
const clone=obj=>JSON.parse(JSON.stringify(obj));
const position={x:-.2,z:1.85};
function person(mood=88){
  return {personality:null,mind:{mood:{value:mood},memories:[]},
    needs:{energy:95,hunger:95,hygiene:95,fun:80}};
}
function fresh(a='nova',b='ember'){
  const g=newSocialGraph(ids);
  for(const id of ids)setLifeStage(g,id,'adult');
  markAcquainted(g,a,b,480);
  observePairViews(g,a,b,{[a]:{friendship:88,trust:90,tension:0},
    [b]:{friendship:88,trust:90,tension:0}});
  return g;
}
const action=(g,a,b,id,at)=>availableSocialActions(g,a,b,at).find(x=>x.id===id);
const write=(g,a,b,type,at)=>applySocialEvent(g,{actorId:a,targetId:b,type,at});
function dating(g,a='nova',b='ember'){
  for(const [from,to,type,at] of [
    [a,b,'romance.flirt',900],[b,a,'romance.flirt',2400],
    [a,b,'romance.flirt',3900],[a,b,'romance.confess',4200],
    [a,b,'romance.date',4500]
  ])assert.ok(write(g,from,to,type,at),type);
}
function care(g,a='nova',b='ember'){
  for(const [who,to,at] of [[a,b,6000],[b,a,6050],[a,b,7500],[b,a,7550]])
    assert.ok(write(g,who,to,'romance.tender',at));
}
function engaged(g,a='nova',b='ember'){
  dating(g,a,b);care(g,a,b);
  assert.ok(write(g,a,b,'romance.propose',9000));
}
function married(g,a='nova',b='ember'){
  engaged(g,a,b);assert.ok(write(g,b,a,'romance.marry',10500));
}
function household(){
  const s=newHousehold();s.minutes=12000;s.otherSim.minutes=12000;
  s.mind.mood.value=88;s.otherSim.mind.mood.value=88;
  for(const id of ['alex','mira'])
    Object.assign(s.relationship.views[id],{friendship:88,trust:90,tension:0});
  observePairViews(s.socialGraph,'alex','mira',s.relationship.views);
  dating(s.socialGraph,'alex','mira');care(s.socialGraph,'alex','mira');
  return s;
}
function finish(root,initiator,id){
  assert.equal(startBranchSocial(root,initiator,position,id),true,id);
  assert.equal(arriveSocial(root),true);
  return tickSocial(root,19);
}

test('1.0m: dating is not a wedding; one-sided tenderness cannot unlock engagement',()=>{
  const g=fresh();dating(g);
  const pair=getPair(g,'nova','ember');
  assert.equal(romanceStatus(g,'nova','ember'),'Встречаются');
  assert.equal(action(g,'nova','ember','romance.propose',9000).enabled,false);
  assert.equal(action(g,'nova','ember','romance.marry',9000).enabled,false);
  for(const at of [6000,6060,6100,7500,7600])
    assert.ok(write(g,'nova','ember','romance.tender',at));
  assert.deepEqual(pair.romance.bond.careDays.nova,[4,5]);
  assert.deepEqual(pair.romance.bond.careDays.ember,[]);
  assert.equal(action(g,'nova','ember','romance.propose',9000).enabled,false);
  assert.equal(romanceLoveDescription(g,'nova','ember'),'Любовь растёт из поступков');
});
test('1.0m: mutual care on two distinct game days enables love, never instant engagement',()=>{
  const g=fresh();dating(g);care(g);
  const bond=getPair(g,'nova','ember').romance.bond;
  assert.deepEqual(bond.careDays.nova,[4,5]);
  assert.deepEqual(bond.careDays.ember,[4,5]);
  assert.equal(romanceLoveDescription(g,'nova','ember'),'Чувства стали глубже');
  assert.equal(action(g,'nova','ember','romance.propose',8000).enabled,false);
  assert.equal(action(g,'nova','ember','romance.propose',9000).enabled,true);
  assert.equal(bond.status,'dating','menu preview alone never commits');
  assert.equal(action(g,'nova','ember','romance.marry',9000).enabled,false);
});
test('1.0m: engagement is a second mutual explicit milestone with a true date',()=>{
  const g=fresh();dating(g);care(g);
  const response=resolveBranchResponse(g,'nova','ember','romance.propose',{
    recipient:person(),minutes:9000
  });
  assert.equal(response.type,'romance.propose');assert.equal(response.accepted,true);
  assert.equal(getPair(g,'nova','ember').romance.bond.status,'dating');
  assert.ok(write(g,'nova','ember','romance.propose',9000));
  const bond=getPair(g,'nova','ember').romance.bond;
  assert.equal(bond.status,'engaged');assert.equal(bond.since,4500);
  assert.equal(bond.engagedAt,9000);
  assert.equal(romanceStatus(g,'ember','nova'),'Помолвлены');
  assert.equal(action(g,'nova','ember','romance.propose',10000).enabled,false);
  assert.equal(write(g,'nova','ember','romance.propose',9100),null);
  assert.equal(action(g,'nova','ember','romance.marry',10000).enabled,false);
  assert.equal(action(g,'nova','ember','romance.marry',10500).enabled,true);
});
test('1.0m: wedding vows are explicit, consented and persist in graph v1',()=>{
  const g=fresh();married(g);
  const p=getPair(g,'nova','ember');
  assert.equal(p.romance.bond.status,'married');
  assert.equal(p.romance.bond.since,4500);
  assert.equal(p.romance.bond.engagedAt,9000);
  assert.equal(p.romance.bond.marriedAt,10500);
  assert.equal(romanceStatus(g,'nova','ember'),'Супруги');
  assert.equal(romanceStatus(g,'ember','nova'),'Супруги');
  assert.equal(currentDatingPartner(g,'nova'),'ember');
  assert.equal(action(g,'nova','ember','romance.marry',12000).enabled,false);
  assert.equal(write(g,'nova','ember','romance.marry',12000),null);
  const saved=restoreSocialGraph(clone(g),ids);
  assert.equal(saved.schema,1);
  assert.deepEqual(getPair(saved,'nova','ember').romance.bond,p.romance.bond);
});
test('1.0m: a tired or unhappy partner may refuse a wedding without undoing engagement',()=>{
  const g=fresh();engaged(g);
  for(const recipient of [person(10),{...person(),needs:{...person().needs,energy:15}}]){
    const reply=resolveBranchResponse(g,'nova','ember','romance.marry',
      {recipient,minutes:10500});
    assert.equal(reply?.accepted,false);
    assert.equal(reply?.type,'romance.marry.refused');
  }
  assert.ok(write(g,'nova','ember','romance.marry.refused',10500));
  const bond=getPair(g,'nova','ember').romance.bond;
  assert.equal(bond.status,'engaged');
  assert.equal(action(g,'nova','ember','romance.marry',11000).enabled,false);
  assert.equal(action(g,'nova','ember','romance.marry',12000).enabled,true);
});
test('1.0m: adult-only and kinship restrictions also apply to proposals and wedding',()=>{
  const g=fresh();engaged(g);
  assert.equal(setLifeStage(g,'ember','teen'),true);
  assert.equal(action(g,'nova','ember','romance.marry',11000).enabled,false);
  assert.equal(write(g,'nova','ember','romance.marry',11000),null);
  assert.equal(action(g,'nova','ember','romance.breakup',11000).enabled,true,
    'one person may end even an age-invalid engagement');
  const h=fresh();engaged(h);
  assert.equal(addFamilyLink(h,'iris','nova','parent'),true);
  assert.equal(addFamilyLink(h,'iris','ember','parent'),true);
  assert.equal(action(h,'nova','ember','romance.marry',11000).enabled,false);
  assert.equal(action(h,'nova','ember','romance.breakup',11000).enabled,true);
});
test('1.0m: declining engagement is not an automatic wedding or a breakup',()=>{
  const g=fresh();dating(g);care(g);
  const reply=resolveBranchResponse(g,'nova','ember','romance.propose',{
    recipient:person(15),minutes:9000
  });
  assert.equal(reply.accepted,false);
  assert.equal(reply.type,'romance.propose.refused');
  assert.ok(write(g,'nova','ember','romance.propose.refused',9000));
  const b=getPair(g,'nova','ember').romance.bond;
  assert.equal(b.status,'dating');
  assert.equal(b.engagedAt,undefined);
  assert.equal(action(g,'nova','ember','romance.propose',9700).enabled,false);
  assert.equal(action(g,'nova','ember','romance.propose',10500).enabled,true);
});

test('1.0m: ending engagement is unilateral, retains ex history and clears milestones',()=>{
  const g=fresh();engaged(g);
  assert.equal(action(g,'ember','nova','romance.breakup',10000).enabled,true);
  assert.ok(write(g,'ember','nova','romance.breakup',10000));
  const b=getPair(g,'nova','ember').romance.bond;
  assert.deepEqual(b,{status:'none',since:null,ex:true,lastEndedAt:10000});
  assert.equal(romanceStatus(g,'nova','ember'),'Бывшие партнёры');
  assert.equal(write(g,'nova','ember','romance.marry',12000),null);
  assert.equal(currentDatingPartner(g,'nova'),null);
});
test('1.0m: married people can divorce, not pretend to break up as a dating couple',()=>{
  const g=fresh();married(g);
  assert.equal(action(g,'nova','ember','romance.breakup',11000).enabled,false);
  assert.equal(action(g,'ember','nova','romance.divorce',11000).enabled,true);
  assert.ok(write(g,'ember','nova','romance.divorce',11000));
  const b=getPair(g,'nova','ember').romance.bond;
  assert.deepEqual(b,{status:'none',since:null,ex:true,lastEndedAt:11000});
  assert.equal(romanceStatus(g,'ember','nova'),'Бывшие партнёры');
  assert.equal(write(g,'nova','ember','romance.divorce',12000),null);
  const restored=restoreSocialGraph(clone(g),ids);
  assert.deepEqual(getPair(restored,'nova','ember').romance.bond,b);
});
test('1.0m: divorce cannot be vetoed by mood, boundary, or changed adult status',()=>{
  const g=fresh();married(g);
  const p=getPair(g,'nova','ember');
  assert.equal(setRomanceBoundary(g,'ember','nova','closed'),true);
  assert.equal(setLifeStage(g,'nova','teen'),true);
  assert.equal(action(g,'ember','nova','romance.divorce',11000).enabled,true);
  const reply=resolveBranchResponse(g,'ember','nova','romance.divorce',
    {recipient:person(5),minutes:11000});
  assert.equal(reply.accepted,true);
  assert.equal(reply.type,'romance.divorce');
  assert.ok(write(g,'ember','nova','romance.divorce',11000));
  assert.equal(p.romance.bond.status,'none');
});
test('1.0m: no overlapping simultaneous committed relationships across five IDs',()=>{
  const g=fresh();married(g);
  markAcquainted(g,'nova','iris',480);
  observePairViews(g,'nova','iris',{
    nova:{friendship:94,trust:94,tension:0},iris:{friendship:94,trust:94,tension:0}});
  assert.equal(action(g,'nova','iris','romance.tender',12000).enabled,false);
  assert.equal(action(g,'nova','iris','romance.propose',12000).enabled,false);
  const x=getOrCreatePair(g,'nova','iris');
  x.romance.bond={status:'married',since:5000,ex:false,lastEndedAt:null,
    careDays:{nova:[4,5],iris:[4,5]},engagedAt:8000,marriedAt:10000};
  x.lastAt=12000;
  const restored=restoreSocialGraph(clone(g),ids);
  assert.equal(currentDatingPartner(restored,'nova'),'ember');
  assert.equal(getPair(restored,'nova','iris').romance.bond.status,'none');
  assert.equal(currentDatingPartner(restored,'opal'),null);
});
test('1.0m: tampered wedding timestamps do not restore forged marriage',()=>{
  const g=fresh();married(g);
  const key=JSON.stringify(['ember','nova']);
  let raw=clone(g);raw.pairs[key].romance.bond.marriedAt=900;
  let restored=restoreSocialGraph(raw,ids);
  assert.equal(getPair(restored,'nova','ember').romance.bond.status,'engaged');
  raw=clone(g);raw.pairs[key].romance.bond.engagedAt=99999;
  restored=restoreSocialGraph(raw,ids);
  assert.equal(getPair(restored,'nova','ember').romance.bond.status,'dating');
  raw=clone(g);raw.pairs[key].romance.bond.careDays.nova=[-5,999999,4,4,5];
  restored=restoreSocialGraph(raw,ids);
  assert.deepEqual(getPair(restored,'nova','ember').romance.bond.careDays.nova,[4,5]);
});
test('1.0m: loading 1.0l save does not invent engagement or marriage',()=>{
  const g=fresh();dating(g);
  const old=clone(g),key=JSON.stringify(['ember','nova']);
  delete old.pairs[key].romance.bond.careDays;
  const restored=restoreSocialGraph(old,ids);
  const bond=getPair(restored,'nova','ember').romance.bond;
  assert.equal(bond.status,'dating');
  assert.deepEqual(bond.careDays,{nova:[],ember:[]});
  assert.equal(action(restored,'nova','ember','romance.propose',12000).enabled,false);
  assert.equal(romanceLoveDescription(restored,'nova','ember'),'Любовь растёт из поступков');
});
test('1.0m: in-game talk path and queue never grant instant engagement or a marriage',()=>{
  const s=household(),p=getPair(s.socialGraph,'alex','mira');
  const affinity=s.relationship.affinity,seq=s.socialGraph.nextSeq;
  assert.equal(startBranchSocial(s,'alex',position,'romance.propose',true),false);
  assert.equal(startBranchSocial(s,'alex',position,'romance.propose'),true);
  assert.equal(p.romance.bond.status,'dating');
  assert.equal(arriveSocial(s),true);
  s.paused=true;assert.equal(tickSocial(s,60),false);s.paused=false;
  const mid=loadHousehold(clone(s));
  assert.equal(mid.socialAction.branchAction.id,'romance.propose');
  assert.equal(mid.socialGraph.pairs[JSON.stringify(['alex','mira'])].romance.bond.status,'dating');
  assert.equal(tickSocial(s,19),true);
  assert.equal(p.romance.bond.status,'engaged');
  assert.equal(s.socialGraph.nextSeq,seq+1);
  assert.equal(s.relationship.affinity,affinity);
  assert.deepEqual(s.mind.memories,[]);
  assert.deepEqual(s.otherSim.mind.memories,[]);
  // A wedding cannot happen on the same game day as a newly accepted proposal.
  s.minutes+=1500;s.otherSim.minutes=s.minutes;
  assert.equal(action(s.socialGraph,'alex','mira','romance.marry',s.minutes).enabled,true);
  assert.equal(startBranchSocial(s,'mira',position,'romance.marry'),true);
  arriveSocial(s);
  assert.equal(cancelSocial(s),true);
  assert.equal(p.romance.bond.status,'engaged');
});
test('1.0m: the player can marry and later divorce after actual separate actions',()=>{
  const s=household();const p=getPair(s.socialGraph,'alex','mira');
  assert.equal(finish(s,'alex','romance.propose'),true);
  s.minutes+=1500;s.otherSim.minutes=s.minutes;
  assert.equal(finish(s,'mira','romance.marry'),true);
  assert.equal(p.romance.bond.status,'married');
  assert.equal(romanceStatus(s.socialGraph,'alex','mira'),'Супруги');
  assert.equal(finish(s,'alex','romance.divorce'),true);
  assert.equal(p.romance.bond.status,'none');
  assert.equal(p.romance.bond.ex,true);
  assert.equal(s.relationship.affinity,50);
  const reloaded=loadHousehold(clone(s));
  assert.equal(getPair(reloaded.socialGraph,'alex','mira').romance.bond.status,'none');
});
test('1.0m: FIFO and cancel preserve a proposed wedding only as an unexecuted plan',()=>{
  const s=household();const p=getPair(s.socialGraph,'alex','mira');
  assert.equal(finish(s,'alex','romance.propose'),true);
  s.minutes+=1500;s.otherSim.minutes=s.minutes;
  const task=enqueueAction(s.actionQueues,'alex',{
    type:'branch',targetId:'mira',actionId:'romance.marry'
  });
  assert.ok(task);
  assert.equal(startBranchSocial(s,'alex',position,'romance.marry'),true);
  arriveSocial(s);
  assert.equal(cancelSocial(s),true);
  assert.equal(p.romance.bond.status,'engaged');
  assert.equal(pendingActions(s.actionQueues,'alex')[0].seq,task.seq);
  const loaded=loadHousehold(clone(s));
  assert.equal(pendingActions(loaded.actionQueues,'alex')[0].seq,task.seq);
  assert.equal(getPair(loaded.socialGraph,'alex','mira').romance.bond.status,'engaged');
});
test('1.0m: Safari category, status and labels are wired without numeric scores',()=>{
  const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
  const html=read('../index.html'),js=read('../src/game.js'),
    romance=read('../src/romance.js'),graph=read('../src/social-graph.js');
  assert.ok(html.includes('сборка / 1.1x'));
  assert.ok(html.includes('id="romance-depth"'));
  assert.ok(js.includes('romanceLoveDescription(game.socialGraph'));
  assert.ok(graph.includes('Предложить помолвку'));
  assert.ok(graph.includes('Обменяться брачными обещаниями'));
  assert.ok(graph.includes('Оформить развод'));
  assert.ok(!/\b(playcanvas|document|localStorage)\b/i.test(romance));
});
