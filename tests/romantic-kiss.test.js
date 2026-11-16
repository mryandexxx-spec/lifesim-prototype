import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {kissMotion,kissPairTarget,KISS_DURATION_MINUTES} from '../src/romantic-kiss.js';
import {createMeshyKissController} from '../src/meshy-kiss-runtime.js';
import {newHousehold,loadHousehold} from '../src/household.js';
import {applySocialEvent,observePairViews,getPair,availableSocialActions,
  setLifeStage,addFamilyLink} from '../src/social-graph.js';
import {romanceAvailability,setRomanceBoundary} from '../src/romance.js';
import {startBranchSocial,arriveSocial,tickSocial,cancelSocial}
  from '../src/relationships.js';
const point={x:-.2,z:1.85};
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
function couple(){
  const s=newHousehold();s.minutes=8000;s.otherSim.minutes=8000;
  s.mind.mood.value=88;s.otherSim.mind.mood.value=88;
  for(const id of ['alex','mira'])
    Object.assign(s.relationship.views[id],{friendship:88,trust:90,tension:0});
  observePairViews(s.socialGraph,'alex','mira',s.relationship.views);
  for(const [actorId,targetId,type,at] of [
    ['alex','mira','romance.flirt',900],['mira','alex','romance.flirt',2400],
    ['alex','mira','romance.flirt',3900],['alex','mira','romance.confess',4200],
    ['alex','mira','romance.date',4500]
  ])assert.ok(applySocialEvent(s.socialGraph,{actorId,targetId,type,at}),type);
  return s;
}
const receipts=s=>getPair(s.socialGraph,'alex','mira').events
  .filter(e=>e.type.startsWith('romance.kiss'));
test('R1b normal romance action is mutual, eligible only for romantic partners',()=>{
  const plain=newHousehold();
  assert.equal(romanceAvailability(plain.socialGraph,'alex','mira','romance.kiss',0).enabled,false);
  for(const id of ['alex','mira']){
    const s=couple(),target=id==='alex'?'mira':'alex';
    assert.equal(romanceAvailability(s.socialGraph,id,target,'romance.kiss',s.minutes).enabled,true);
    assert.ok(availableSocialActions(s.socialGraph,id,target,s.minutes)
      .some(x=>x.id==='romance.kiss'&&x.enabled));
    assert.equal(startBranchSocial(s,id,point,'romance.kiss'),true);
    assert.equal(kissMotion(s.socialAction).weight,0);
    assert.equal(receipts(s).length,0);
    assert.equal(arriveSocial(s),true);
    assert.equal(s.socialAction.branchAction.kissConsent,true);
    assert.equal(tickSocial(s,8),false);
    assert.ok(kissMotion(s.socialAction).weight>.5);
    assert.equal(receipts(s).length,0);
    assert.equal(tickSocial(s,8),true);
    assert.deepEqual(receipts(s).map(e=>e.type),['romance.kiss']);
    assert.equal(receipts(s)[0].actorId,id);
    assert.equal(tickSocial(s,16),false);
    assert.equal(receipts(s).length,1);
  }
});
test('R1b refusal never moves a pair, rewards either side or auto starts',()=>{
  const s=couple();s.otherSim.mind.mood.value=10;
  assert.equal(startBranchSocial(s,'alex',point,'romance.kiss'),true);
  assert.equal(arriveSocial(s),true);
  assert.equal(s.socialAction.branchAction.kissConsent,false);
  assert.equal(kissMotion(s.socialAction).weight,0);
  const before=getPair(s.socialGraph,'alex','mira').romance.views;
  const prev=[before.alex.attraction,before.mira.attraction];
  assert.equal(tickSocial(s,3),true);
  assert.deepEqual(receipts(s).map(e=>e.type),['romance.kiss.refused']);
  const after=getPair(s.socialGraph,'alex','mira').romance.views;
  assert.deepEqual([after.alex.attraction,after.mira.attraction],prev);
  const auto=couple();
  assert.equal(startBranchSocial(auto,'alex',point,'romance.kiss',true),false);
});
test('R1b age, kinship, consent boundary and in-flight changes fail closed',()=>{
  const a=couple();setLifeStage(a.socialGraph,'alex','teen');
  assert.equal(romanceAvailability(a.socialGraph,'alex','mira','romance.kiss',a.minutes).enabled,false);
  const b=couple();addFamilyLink(b.socialGraph,'alex','mira','sibling');
  assert.equal(romanceAvailability(b.socialGraph,'alex','mira','romance.kiss',b.minutes).enabled,false);
  const c=couple();setRomanceBoundary(c.socialGraph,'mira','alex','closed');
  assert.equal(romanceAvailability(c.socialGraph,'alex','mira','romance.kiss',c.minutes).enabled,false);
  const d=couple();assert.ok(startBranchSocial(d,'alex',point,'romance.kiss'));
  assert.ok(arriveSocial(d));setRomanceBoundary(d.socialGraph,'mira','alex','closed');
  assert.equal(tickSocial(d,16),true);
  assert.deepEqual(receipts(d).map(e=>e.type),['romance.kiss.refused']);
});
test('R1b cancellation and pause do not leave receipts',()=>{
  const s=couple();assert.ok(startBranchSocial(s,'alex',point,'romance.kiss'));
  assert.ok(arriveSocial(s));s.paused=true;
  assert.equal(tickSocial(s,30),false);s.paused=false;
  assert.equal(cancelSocial(s),true);assert.equal(receipts(s).length,0);
});
test('R1b save restores real approval without new save schema',()=>{
  const s=couple();assert.ok(startBranchSocial(s,'alex',point,'romance.kiss'));
  assert.ok(arriveSocial(s));s.socialAction.elapsed=7;
  const loaded=loadHousehold(JSON.parse(JSON.stringify(s)));
  assert.equal(loaded.version,1);
  assert.equal(loaded.socialAction?.branchAction?.id,'romance.kiss');
  assert.equal(loaded.socialAction?.branchAction?.kissConsent,true);
  assert.equal(tickSocial(loaded,9),true);
  assert.deepEqual(receipts(loaded).map(e=>e.type),['romance.kiss']);
});
test('R1b motion clamps distance, eases in and out, symmetric and consent gated',()=>{
  assert.equal(KISS_DURATION_MINUTES,16);
  const a={x:0,z:0},b={x:.84,z:0};
  const k=kissPairTarget(a,b,1);
  assert.ok(k.distance>=.29&&k.distance<=.31);
  assert.ok(Math.abs((k.a.x+k.b.x)/2-.42)<1e-8);
  assert.deepEqual(kissPairTarget(a,b,0),{a,b,distance:.84});
  assert.equal(kissPairTarget(a,{x:3,z:0},1),null);
  assert.equal(kissMotion({phase:'using',elapsed:8,
    branchAction:{id:'romance.kiss',kissConsent:false}}).weight,0);
  assert.ok(kissMotion({phase:'using',elapsed:8,
    branchAction:{id:'romance.kiss',kissConsent:true}}).weight>.8);
});
test('R1b skin rotates neck after Anim and never accumulates when paused',()=>{
  class Quat{
    setFromEulerAngles(x,y,z){this.tilt=[x,y,z];return this;}
    mul2(base,other){this.tilt=other.tilt;return this;}
  }
  const neck={writes:[],getLocalRotation:()=>new Quat(),
    setLocalRotation(q){this.writes.push(q.tilt);}};
  const controller=createMeshyKissController({pc:{Quat},model:{
    findByName:name=>name==='mixamorig:Neck'?neck:null
  }});
  assert.equal(controller.ready,true);
  controller.setFrame({active:true,weight:1,initiator:true});
  assert.equal(controller.apply(),true);assert.ok(neck.writes[0][2]>0);
  controller.setFrame({active:true,weight:1,initiator:false});
  assert.equal(controller.apply(),true);assert.ok(neck.writes[1][2]<0);
  controller.setFrame({active:true,weight:1},true);
  assert.equal(controller.apply(),false);assert.equal(neck.writes.length,2);
  assert.equal(createMeshyKissController({}).ready,false);
});
test('R1b GLB necks and deployed Safari imports exist, QA shortcut is retired',()=>{
  for(const file of ['meshy-casual-v1.glb','meshy-mira-mobile-v1.glb']){
    const buffer=readFileSync(new URL('../assets/characters/'+file,import.meta.url));
    const gltf=JSON.parse(buffer.toString('utf8',20,20+buffer.readUInt32LE(12)));
    assert.ok(gltf.nodes.some(n=>n.name==='mixamorig:Neck'),file);
  }
  const game=read('../src/game.js'),ci=read('../.github/workflows/pages.yml');
  assert.doesNotMatch(game,/hugQAMode|hug-qa-controls|createHugQAHousehold/);
  assert.ok(game.includes('kissPairTarget(game.position,game.otherSim.position'));
  assert.ok(game.includes('kissFrame:kissMiraFrame'));
  assert.ok(game.includes('kissFrame:kissAlexFrame'));
  assert.ok(read('../src/meshy-visual.js').includes('createMeshyKissController'));
  assert.ok(read('../src/meshy-mira-visual.js').includes('createMeshyKissController'));
  assert.ok(ci.includes('src/meshy-kiss-runtime.js'));
  assert.ok(ci.includes('src/romantic-kiss.js'));
});
