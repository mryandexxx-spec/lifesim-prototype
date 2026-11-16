import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {planSharedTv,validSharedTvPlan,liveSharedTv} from '../src/tv-together.js';
import {startSharedSocial,arriveSocial,cancelSocial} from '../src/relationships.js';
import {evaluateLeisure,LEISURE_CATALOG,restoreSharedSession} from '../src/gifts-leisure.js';
import {enqueueAction,restoreActionQueues} from '../src/action-queue.js';
import {tvScreenFrame} from '../src/tv-interaction.js';
import {findPath} from '../src/navigation.js';
import {createProfile} from '../src/trait-catalog.js';
const copy=x=>JSON.parse(JSON.stringify(x));

test('F3c: real default screen gives two physically separate reachable targets',()=>{
  const root=newHousehold(),plan=planSharedTv(root,'alex','home-tv-1');
  assert.ok(plan,'real room should be able to host two separate TV watchers');
  assert.equal(plan.tvId,'home-tv-1');
  assert.equal(validSharedTvPlan(root,plan,'alex'),true);
  const a=plan.places.alex,b=plan.places.mira;
  assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=.82);
  assert.ok(findPath(root.position,a,root.world));
  assert.ok(findPath(root.otherSim.position,b,root.world));
  assert.ok([a.seatId,b.seatId].some(Boolean),'the existing sofa is usable');
  assert.ok(!(a.seatId&&a.seatId===b.seatId),'one F3b sofa is one seat');
});
test('F3c: works from either inviter, with two sofas only if both view the same TV',()=>{
  const root=newHousehold();
  const fromMira=planSharedTv(root,'mira','home-tv-1');
  assert.ok(fromMira);
  assert.equal(validSharedTvPlan(root,fromMira,'mira'),true);
  const world=root.world.furniture;
  const sofa=world.instances.find(i=>i.prefabId==='sofa');
  world.instances.push({...sofa,instanceId:'shop-sofa-77',x:-1.5,z:1.05,yaw:0});
  world.revision++;
  const plan=planSharedTv(root,'alex','home-tv-1');
  assert.ok(plan);
  assert.ok(!plan.places.alex.seatId||plan.places.alex.seatId!==plan.places.mira.seatId);
});
test('F3c: typed queue keeps the selected TV ID, rejects poisoned target',()=>{
  const root=newHousehold();
  const task=enqueueAction(root.actionQueues,'alex',
    {type:'shared',targetId:'mira',mode:'leisure',choiceId:'tv',targetInstanceId:'home-tv-1'});
  assert.equal(task.targetInstanceId,'home-tv-1');
  assert.equal(task.choiceId,'tv');
  assert.equal(enqueueAction(root.actionQueues,'alex',
    {type:'shared',targetId:'mira',mode:'leisure',choiceId:'tv',targetInstanceId:'<script>'}),null);
  assert.equal(enqueueAction(root.actionQueues,'alex',
    {type:'shared',targetId:'mira',mode:'leisure',choiceId:'music',targetInstanceId:'home-tv-1'}),null);
  assert.equal(restoreActionQueues(copy(root.actionQueues),['alex','mira']).byResident.alex[0].targetInstanceId,'home-tv-1');
});
test('F3c: invitation and walking do not grant Social, Fun or an on-air TV',()=>{
  const root=newHousehold(),plan=planSharedTv(root,'alex','home-tv-1');
  const beforeSocial=root.needs.social,beforeFun=root.needs.fun,
    beforeSeq=root.socialGraph.nextSeq;
  assert.equal(startSharedSocial(root,'alex',plan.places.alex,'leisure','tv',false,plan),true);
  assert.equal(root.socialAction.phase,'walking');
  assert.deepEqual(tvScreenFrame([root,root.otherSim],'home-tv-1',0,root.socialAction),{on:false,frame:0});
  tickHousehold(root,2);
  assert.ok(root.needs.social<=beforeSocial);
  assert.ok(root.needs.fun<=beforeFun);
  assert.equal(root.socialGraph.nextSeq,beforeSeq);
  assert.equal(root.socialAction.phase,'walking');
  assert.equal(cancelSocial(root),true);
  tickHousehold(root,40);
  assert.equal(root.socialGraph.nextSeq,beforeSeq,'cancelled walk cannot create social receipt');
});
test('F3c: acceptance at arrival, effect over real viewing, one completed social receipt',()=>{
  const root=newHousehold(),plan=planSharedTv(root,'alex','home-tv-1');
  assert.equal(evaluateLeisure(root,'alex','tv')?.accepted,true);
  assert.equal(startSharedSocial(root,'alex',plan.places.alex,'leisure','tv',false,plan),true);
  // Headless arrival (3D runtime separately follows two independent routes).
  root.position={x:plan.places.alex.x,z:plan.places.alex.z};
  root.otherSim.position={x:plan.places.mira.x,z:plan.places.mira.z};
  const before={fun:[root.needs.fun,root.otherSim.needs.fun],
    social:[root.needs.social,root.otherSim.needs.social],
    seq:root.socialGraph.nextSeq,affinity:root.relationship.affinity};
  assert.equal(arriveSocial(root),true);
  assert.ok(liveSharedTv(root));
  assert.equal(root.socialGraph.nextSeq,before.seq);
  assert.equal(tvScreenFrame([root,root.otherSim],'home-tv-1',1,root.socialAction).on,true);
  tickHousehold(root,8);
  assert.ok(root.needs.fun>before.fun[0]);
  assert.ok(root.otherSim.needs.fun>before.fun[1]);
  assert.equal(root.socialGraph.nextSeq,before.seq);
  assert.ok(root.needs.social<=before.social[0]);
  // A v1 save with consent and real target survives reload.
  let restored=loadHousehold(copy(root));
  assert.ok(liveSharedTv(restored));
  assert.equal(restored.socialAction.shared.tvConsent,true);
  assert.equal(restored.socialAction.shared.tvPlan.tvId,'home-tv-1');
  tickHousehold(restored,25);
  assert.equal(restored.socialAction,null);
  assert.equal(restored.socialGraph.nextSeq,before.seq+1);
  assert.equal(restored.relationship.affinity,before.affinity+4);
  assert.ok(restored.needs.social>before.social[0]);
  assert.ok(restored.otherSim.needs.social>before.social[1]);
  const afterSeq=restored.socialGraph.nextSeq;
  const afterFun=restored.needs.fun;
  tickHousehold(restored,2);
  assert.equal(restored.socialGraph.nextSeq,afterSeq);
  assert.ok(restored.needs.fun<=afterFun,'no replayed post-completion fun');
});
test('F3c: refusal at arrival creates no positive or negative social receipt',()=>{
  const root=newHousehold();
  root.relationship.views.mira.trust=0;
  root.relationship.views.mira.tension=100;
  root.otherSim.personality=createProfile(['temperament.cheerful','social.outgoing'],
    {likes:['music'],dislikes:['games']});
  assert.equal(evaluateLeisure(root,'alex','tv')?.accepted,false);
  const plan=planSharedTv(root,'alex','home-tv-1');
  assert.ok(startSharedSocial(root,'alex',plan.places.alex,'leisure','tv',false,plan));
  root.position={x:plan.places.alex.x,z:plan.places.alex.z};
  root.otherSim.position={x:plan.places.mira.x,z:plan.places.mira.z};
  const seq=root.socialGraph.nextSeq,affinity=root.relationship.affinity;
  assert.equal(arriveSocial(root),false);
  assert.equal(root.socialAction,null);
  assert.equal(root.socialGraph.nextSeq,seq);
  assert.equal(root.relationship.affinity,affinity);
  assert.deepEqual(root.mind.memories,[]);
});
test('F3c: cannot forge a paired TV save, stolen shared seat or instant consent',()=>{
  const root=newHousehold(),plan=planSharedTv(root,'alex','home-tv-1');
  assert.equal(startSharedSocial(root,'alex',plan.places.alex,'leisure','tv',false,plan),true);
  assert.ok(loadHousehold(copy(root)).socialAction?.shared?.tvPlan);
  assert.equal(restoreSharedSession({mode:'leisure',choiceId:'tv'},root,'alex'),null);
  const fake=copy(root);
  fake.socialAction.shared.tvConsent=true; // still walking: impossible
  assert.equal(loadHousehold(fake).socialAction,null);
  for(const bad of [
    {...plan,tvId:'shop-tv-missing'},
    {...plan,places:{alex:{...plan.places.alex,seatId:'home-sofa-missing'},mira:plan.places.mira}},
    {...plan,places:{alex:plan.places.alex,mira:{...plan.places.alex}}}
  ]){
    const cloned=copy(root);cloned.socialAction.shared.tvPlan=bad;
    assert.equal(loadHousehold(cloned).socialAction,null);
  }
});
test('F3c: pausing and cancelling accepted session prevents phantom social bonus',()=>{
  const root=newHousehold(),plan=planSharedTv(root,'alex','home-tv-1');
  assert.ok(startSharedSocial(root,'alex',plan.places.alex,'leisure','tv',false,plan));
  root.position={x:plan.places.alex.x,z:plan.places.alex.z};
  root.otherSim.position={x:plan.places.mira.x,z:plan.places.mira.z};
  assert.ok(arriveSocial(root));
  const before=copy(root);
  root.paused=true;
  const frozen=copy(root);
  tickHousehold(root,5);
  assert.deepEqual(root,frozen);
  root.paused=false;
  tickHousehold(root,6);
  assert.ok(root.needs.fun>before.needs.fun);
  const seq=root.socialGraph.nextSeq;
  assert.ok(cancelSocial(root));
  tickHousehold(root,90);
  assert.equal(root.socialGraph.nextSeq,seq);
  assert.equal(tvScreenFrame([root,root.otherSim],'home-tv-1',0,root.socialAction).on,false);
});
test('F3c: social session cannot be completed after its screen disappears',()=>{
  const root=newHousehold(),plan=planSharedTv(root,'alex','home-tv-1');
  assert.ok(startSharedSocial(root,'alex',plan.places.alex,'leisure','tv',false,plan));
  root.position={x:plan.places.alex.x,z:plan.places.alex.z};
  root.otherSim.position={x:plan.places.mira.x,z:plan.places.mira.z};
  assert.ok(arriveSocial(root));
  const seq=root.socialGraph.nextSeq;
  root.world.furniture.instances=root.world.furniture.instances.filter(i=>i.instanceId!=='home-tv-1');
  root.world.furniture.revision++;
  tickHousehold(root,40);
  assert.equal(root.socialGraph.nextSeq,seq);
  assert.equal(root.socialAction,null);
});
test('F3c: Safari wires both independently routed citizens and protected two resource slots',()=>{
  const g=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert.match(g,/planSharedTv\(game,actorId/);
  assert.match(g,/session\.shared\.tvPlan\?\.places\?\.\[residentId\]/);
  assert.match(g,/pairedPlan\?\.places\?\.\[residentId\]/);
  assert.match(g,/if\(ready\)arriveSocial\(game\)/);
  assert.match(g,/const pairedTv=liveSharedTv\(game\)/);
  assert.match(g,/frame=tvScreenFrame\(\[game,game.otherSim\],item.instanceId,effectTime,/);
  assert.match(g,/if\(jointTv\)/);
  assert.match(pages,/node --check src\/tv-together\.js/);
  assert.match(pages,/cp src\/tv-together\.js site\/src\//);
  assert.ok(LEISURE_CATALOG.tv);
});
