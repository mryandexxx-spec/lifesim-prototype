import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hugMotion,hugPairTarget,HUG_DURATION_MINUTES,
  HUG_REFUSAL_DURATION_MINUTES} from '../src/romantic-hug.js';
import {createMeshyHugController} from '../src/meshy-hug-runtime.js';
import {newHousehold,loadHousehold} from '../src/household.js';
import {applySocialEvent,observePairViews,getPair,
  availableSocialActions,setLifeStage,addFamilyLink} from '../src/social-graph.js';
import {romanceAvailability,setRomanceBoundary} from '../src/romance.js';
import {startBranchSocial,arriveSocial,tickSocial,cancelSocial} from '../src/relationships.js';
const place={x:-.2,z:1.85};
const clone=x=>JSON.parse(JSON.stringify(x));
function couple(){
  const s=newHousehold();
  s.minutes=8000;s.otherSim.minutes=8000;
  s.mind.mood.value=88;s.otherSim.mind.mood.value=88;
  for(const id of ['alex','mira'])
    Object.assign(s.relationship.views[id],{friendship:88,trust:90,tension:0});
  observePairViews(s.socialGraph,'alex','mira',s.relationship.views);
  for(const [actorId,targetId,type,at] of [
    ['alex','mira','romance.flirt',900],
    ['mira','alex','romance.flirt',2400],
    ['alex','mira','romance.flirt',3900],
    ['alex','mira','romance.confess',4200],
    ['alex','mira','romance.date',4500]
  ]) assert.ok(applySocialEvent(s.socialGraph,{actorId,targetId,type,at}),type);
  assert.equal(getPair(s.socialGraph,'alex','mira').romance.bond.status,'dating');
  return s;
}
const hugs=s=>getPair(s.socialGraph,'alex','mira').events
  .filter(e=>e.type==='romance.hug'||e.type==='romance.hug.refused');
test('R1a paired hug requires genuine adult relationship, no arbitrary N-ID shortcut',()=>{
  const s=newHousehold();
  const item=availableSocialActions(s.socialGraph,'alex','mira',s.minutes)
    .find(x=>x.id==='romance.hug');
  assert.equal(item.enabled,false);
  assert.match(item.reason,/симпат|знаком|чувств|довер|отношен|узнай/);
  const h=couple();
  assert.equal(romanceAvailability(h.socialGraph,'alex','mira','romance.hug',h.minutes).enabled,true);
  assert.equal(romanceAvailability(h.socialGraph,'mira','alex','romance.hug',h.minutes).enabled,true);
  setLifeStage(h.socialGraph,'mira','teen');
  assert.equal(romanceAvailability(h.socialGraph,'alex','mira','romance.hug',h.minutes).enabled,false);
  const r=couple();
  setRomanceBoundary(r.socialGraph,'mira','alex','closed');
  assert.equal(romanceAvailability(r.socialGraph,'alex','mira','romance.hug',r.minutes).enabled,false);
});
test('R1a receiver accepts BEFORE contact; one persistent completion only',()=>{
  const s=couple();
  assert.equal(startBranchSocial(s,'alex',place,'romance.hug'),true);
  assert.equal(hugMotion(s.socialAction).weight,0,'no pre-approval motion during walking');
  assert.equal(arriveSocial(s),true);
  assert.equal(s.socialAction.branchAction.hugConsent,true);
  assert.equal(hugs(s).length,0);
  assert.equal(tickSocial(s,9),false);
  assert.ok(hugMotion(s.socialAction).weight>.7);
  assert.equal(hugs(s).length,0,'no receipt before completion');
  assert.equal(tickSocial(s,9),true);
  assert.equal(s.socialAction,null);
  assert.deepEqual(hugs(s).map(e=>e.type),['romance.hug']);
  assert.equal(tickSocial(s,18),false,'cannot duplicate completed event');
});
test('R1a refusal never moves two bodies and never rewards hug',()=>{
  const s=couple();
  s.otherSim.mind.mood.value=10;
  assert.equal(startBranchSocial(s,'mira',place,'romance.hug'),true);
  // Initiator is Mira, receiver is Alex, so force recipient decline instead.
  s.mind.mood.value=10;
  assert.equal(arriveSocial(s),true);
  assert.equal(s.socialAction.branchAction.hugConsent,false);
  const before=getPair(s.socialGraph,'alex','mira').romance.views;
  const attraction=[before.alex.attraction,before.mira.attraction];
  assert.equal(hugMotion(s.socialAction).weight,0);
  assert.equal(tickSocial(s,HUG_REFUSAL_DURATION_MINUTES),true);
  assert.deepEqual(hugs(s).map(e=>e.type),['romance.hug.refused']);
  const after=getPair(s.socialGraph,'alex','mira').romance.views;
  assert.deepEqual([after.alex.attraction,after.mira.attraction],attraction);
});
test('R1a consent cannot be converted to a forged positive after revoked boundary',()=>{
  const s=couple();
  assert.equal(startBranchSocial(s,'alex',place,'romance.hug'),true);
  assert.equal(arriveSocial(s),true);
  assert.equal(s.socialAction.branchAction.hugConsent,true);
  assert.equal(setRomanceBoundary(s.socialGraph,'mira','alex','closed'),true);
  assert.equal(tickSocial(s,18),true);
  assert.deepEqual(hugs(s).map(e=>e.type),['romance.hug.refused']);
});
test('R1a cancellation and paused actions never commit an embrace',()=>{
  const s=couple();
  assert.equal(startBranchSocial(s,'alex',place,'romance.hug'),true);
  assert.equal(arriveSocial(s),true);
  s.paused=true;
  assert.equal(tickSocial(s,21),false);
  assert.ok(s.socialAction);
  s.paused=false;
  assert.equal(cancelSocial(s),true);
  assert.equal(hugs(s).length,0);
});
test('R1a active hug survives old save envelope and preserves consent',()=>{
  const s=couple();
  assert.equal(startBranchSocial(s,'alex',place,'romance.hug'),true);
  assert.equal(arriveSocial(s),true);
  s.socialAction.elapsed=8;
  const loaded=loadHousehold(clone(s));
  assert.equal(loaded.version,1);
  assert.equal(loaded.socialAction?.branchAction?.id,'romance.hug');
  assert.equal(loaded.socialAction?.branchAction?.hugConsent,true);
  assert.ok(hugMotion(loaded.socialAction).weight>.2);
  assert.equal(hugs(loaded).length,0);
  assert.equal(tickSocial(loaded,10),true);
  assert.equal(hugs(loaded).length,1);
});
test('R1a synchronized pose is bounded and symmetric, independent of actor names',()=>{
  assert.equal(HUG_DURATION_MINUTES,18);
  const a={x:0,z:0},b={x:.84,z:0};
  const near=hugPairTarget(a,b,1);
  assert.ok(near.distance>=.41&&near.distance<=.43);
  assert.ok(Math.abs((near.a.x+near.b.x)/2-.42)<1e-8);
  assert.deepEqual(hugPairTarget(a,b,0),{a,b,distance:.84});
  assert.equal(hugPairTarget(a,{x:4,z:0},1),null);
  assert.equal(hugPairTarget(a,a,1),null);
  assert.equal(hugMotion({phase:'using',elapsed:9,branchAction:
    {id:'romance.hug',hugConsent:false}}).weight,0);
  const w=hugMotion({phase:'using',elapsed:9,branchAction:
    {id:'romance.hug',hugConsent:true}});
  assert.ok(w.weight>.7);
  assert.equal(w.active,true);
  assert.equal(hugMotion({phase:'using',elapsed:18,branchAction:
    {id:'romance.hug',hugConsent:true}}).weight,0);
});
test('R1a skinned controller fails to fallback, never mutate a missing rig',()=>{
  const controller=createMeshyHugController({});
  assert.equal(controller.ready,false);
  controller.setFrame({weight:1});
  assert.equal(controller.apply(),false);
});
test('R1a actual bundled GLBs expose both Mixamo arm chains',()=>{
  for(const file of ['meshy-casual-v1.glb','meshy-mira-mobile-v1.glb']){
    const buffer=readFileSync(new URL('../assets/characters/'+file,import.meta.url));
    assert.equal(buffer.toString('ascii',0,4),'glTF');
    assert.equal(buffer.toString('ascii',16,20),'JSON');
    const gltf=JSON.parse(buffer.toString('utf8',20,20+buffer.readUInt32LE(12)));
    const names=new Set(gltf.nodes.map(n=>n.name));
    for(const side of ['Left','Right'])
      for(const ending of ['Arm','ForeArm','Hand'])
        assert.ok(names.has('mixamorig:'+side+ending),file+' missing '+side+ending);
  }
});
test('R1a renderer and production Pages include pair poses, script and fallback',()=>{
  const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
  const game=read('../src/game.js'),alex=read('../src/meshy-visual.js'),
    mira=read('../src/meshy-mira-visual.js'),ci=read('../.github/workflows/pages.yml');
  assert.ok(game.includes('hugPairTarget(game.position,game.otherSim.position'));
  assert.ok(game.includes('hugFrame,'));
  assert.ok(game.includes('hugWeight:hugFrame.weight'));
  assert.ok(alex.includes('createMeshyHugController'));
  assert.ok(mira.includes('createMeshyHugController'));
  assert.ok(alex.includes('state.hugRuntime?.setFrame(null)'));
  assert.ok(mira.includes('state.hugRuntime?.setFrame(null)'));
  assert.ok(ci.includes('node --check src/meshy-hug-runtime.js'));
  assert.ok(ci.includes('cp src/romantic-hug.js src/meshy-hug-runtime.js src/romantic-kiss.js src/meshy-kiss-runtime.js site/src/'));
  assert.ok(ci.includes('node --check src/romantic-hug.js'));
  assert.ok(!read('../src/romantic-hug.js').includes('Math.random('));
});
