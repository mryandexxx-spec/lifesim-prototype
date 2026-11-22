import test from 'node:test';
import assert from 'node:assert/strict';
import {SAVE_KEY,newGame} from '../src/simulation.js';
import {newHousehold,loadHousehold,tickHousehold,getActor,setHouseholdAutonomy} from '../src/household.js';
import {isWalkable,findPath} from '../src/navigation.js';
import {enqueueAction,pendingActions} from '../src/action-queue.js';
import {getPair,applySocialEvent,romanceSafety,relationSummary} from '../src/social-graph.js';
import {ADDRESSED_BRANCHES,addressedSocialPeers,queueAddressedSocial,
  dispatchAddressedSocial,cancelAddressedSocial,restoreAddressedSocial,
  additionalSocialEngaged} from '../src/resident-social-runtime.js';

const clone=value=>JSON.parse(JSON.stringify(value));
function makeExtra(id,name){
  const actor=newGame();actor.personality.name=name;
  return {id,identity:{firstName:name,lastName:'Тестовый',lifeStage:'adult'},actor};
}
function household({away=false,kinship=[]}={}){
  const root=newHousehold();
  root.population={schema:1,nextResidentSerial:5,
    residentsById:{resident_3:makeExtra('resident_3','Вера'),
      resident_4:makeExtra('resident_4','Игорь')},
    linksByResident:{
      alex:{familyId:'family_1',dwellingId:'dwelling_1'},
      mira:{familyId:'family_1',dwellingId:'dwelling_1'},
      resident_3:{familyId:'family_1',dwellingId:'dwelling_1'},
      resident_4:{familyId:'family_2',dwellingId:away?'dwelling_2':'dwelling_1'}},
    kinship};
  const restored=loadHousehold(clone(root));
  setHouseholdAutonomy(restored,false);
  return restored;
}
/** Find genuine walkable social spacing on the furnished lot, not a teleport. */
function placePair(root,idA,idB){
  const a=getActor(root,idA),b=getActor(root,idB);
  for(let x=-4;x<=3;x+=.5)for(let z=-3;z<=3;z+=.5){
    const p={x,z},q={x:x+1.05,z};
    const other=['alex','mira','resident_3','resident_4'].filter(id=>
      id!==idA&&id!==idB&&getActor(root,id));
    if(!isWalkable(p.x,p.z,root.world)||!isWalkable(q.x,q.z,root.world)||
      !findPath(p,q,root.world)||other.some(id=>
        [p,q].some(point=>Math.hypot(point.x-getActor(root,id).position.x,
          point.z-getActor(root,id).position.z)<1.2)))continue;
    a.position=p;b.position=q;
    return;
  }
  assert.fail('A physical social spot must exist');
}
test('CAS-01.5-social migrates N-person graph without changing legacy root v1 or family inference',()=>{
  const root=household();
  assert.equal(root.version,1);
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.deepEqual(root.socialGraph.persons,['alex','mira','resident_3','resident_4']);
  assert.equal(root.socialGraph.lifeStages.resident_3,'adult');
  assert.equal(root.socialGraph.lifeStages.resident_4,'adult');
  assert.equal(getPair(root.socialGraph,'resident_3','resident_4'),null);
  assert.deepEqual(addressedSocialPeers(root,'resident_3').map(x=>x.id),
    ['alex','mira','resident_4']);
  assert.equal(addressedSocialPeers(root,'not-real').length,0);
  assert.equal(root.relationship.affinity,50,'legacy affinity remains owned by Alex/Mira');
  const old=loadHousehold(clone(newHousehold()));
  assert.equal(old.population,undefined);
  assert.equal(old.additionalSocial,null);
  assert.deepEqual(old.socialGraph.persons,['alex','mira']);
});
test('CAS-01.5-social chooses only co-resident peers by ID and blocks distant dwellings',()=>{
  const root=household({away:true});
  assert.deepEqual(addressedSocialPeers(root,'resident_3').map(x=>x.id),['alex','mira']);
  assert.equal(queueAddressedSocial(root,'resident_3','resident_4'),null);
  assert.equal(queueAddressedSocial(root,'resident_4','resident_3'),null);
  assert.equal(queueAddressedSocial(root,'resident_3','resident_3'),null);
  assert.equal(queueAddressedSocial(root,'resident_3','does-not-exist'),null);
  assert.equal(root.additionalSocial,null);
  assert.equal(root.socialGraph.nextSeq,1);
});
test('CAS-01.5-social physical rendezvous creates one addressed pair receipt and need gain',()=>{
  const root=household();placePair(root,'resident_3','resident_4');
  const a=getActor(root,'resident_3'),b=getActor(root,'resident_4');
  const startA=a.needs.social=30,startB=b.needs.social=30;
  const queued=queueAddressedSocial(root,'resident_3','resident_4','talk');
  assert.ok(queued);
  assert.equal(getPair(root.socialGraph,'resident_3','resident_4'),null);
  tickHousehold(root,.1);
  assert.equal(root.additionalSocial?.phase,'using');
  assert.equal(additionalSocialEngaged(root,'resident_3'),true);
  assert.equal(pendingActions(root.actionQueues,'resident_3').length,0);
  assert.ok(a.needs.social<=startA);
  assert.ok(b.needs.social<=startB);
  assert.equal(getPair(root.socialGraph,'resident_3','resident_4'),null);
  tickHousehold(root,9);
  assert.equal(getPair(root.socialGraph,'resident_3','resident_4'),null);
  tickHousehold(root,9);
  const pair=getPair(root.socialGraph,'resident_3','resident_4');
  assert.equal(pair.events.length,1);
  assert.equal(pair.events[0].type,'talk');
  assert.equal(pair.events[0].actorId,'resident_3');
  assert.equal(pair.events[0].targetId,'resident_4');
  assert.ok(a.needs.social>startA&&b.needs.social>startB,
    'positive receipt raises each social need once');
  assert.equal(root.additionalSocial,null);
  const after=pair.events.length;
  tickHousehold(root,.1);
  assert.equal(pair.events.length,after,'no replay after completion');
  assert.equal(root.socialGraph.nextSeq,2);
  assert.equal(relationSummary(root.socialGraph,'resident_3','resident_4').met,true);
  assert.equal(root.relationship.affinity,50,'legacy pair is untouched');
  assert.ok(a.mind.memories.some(m=>m.id==='talk'));
  assert.ok(b.mind.memories.some(m=>m.id==='talk'));
});
test('CAS-01.5-social persists in-progress session, never credits paused or cancelled action',()=>{
  const root=household();placePair(root,'resident_3','resident_4');
  queueAddressedSocial(root,'resident_3','resident_4','talk');
  tickHousehold(root,.1);
  tickHousehold(root,4);
  const saved=clone(root);
  const resumed=loadHousehold(saved);
  assert.equal(resumed.additionalSocial?.phase,'using');
  assert.equal(resumed.additionalSocial?.elapsed,4);
  assert.equal(resumed.socialGraph.nextSeq,1);
  resumed.paused=true;
  tickHousehold(resumed,20);
  assert.equal(resumed.additionalSocial?.elapsed,4);
  assert.equal(resumed.socialGraph.nextSeq,1);
  resumed.paused=false;
  assert.equal(cancelAddressedSocial(resumed,'resident_4'),true);
  tickHousehold(resumed,20);
  assert.equal(resumed.additionalSocial,null);
  assert.equal(resumed.socialGraph.nextSeq,1);
  assert.equal(getPair(resumed.socialGraph,'resident_3','resident_4'),null);
  assert.equal(restoreAddressedSocial({...saved.additionalSocial,elapsed:9999},resumed),null);
  assert.equal(restoreAddressedSocial({...saved.additionalSocial,partner:'ghost'},resumed),null);
});
test('CAS-01.5-social keeps blocked FIFO head and does not interrupt manual work',()=>{
  const root=household();placePair(root,'resident_3','resident_4');
  const person=getActor(root,'resident_3');
  const goal={x:person.position.x+.4,z:person.position.z};
  person.action={id:'move',phase:'walking',elapsed:0,automatic:false,goal};
  const task=queueAddressedSocial(root,'resident_3','resident_4','talk');
  assert.ok(task);
  assert.equal(dispatchAddressedSocial(root),false);
  assert.equal(pendingActions(root.actionQueues,'resident_3')[0].seq,task.seq);
  person.action=null;
  assert.equal(dispatchAddressedSocial(root),true);
  assert.equal(root.additionalSocial?.seq,task.seq);
  assert.equal(pendingActions(root.actionQueues,'resident_3').length,0);
  assert.equal(queueAddressedSocial(root,'resident_3','resident_3'),null);
});
test('CAS-01.5-social explicit parent/sibling kinship disallows romance; name/family alone does not',()=>{
  const sibling=household({kinship:[{fromId:'resident_3',toId:'resident_4',type:'sibling'}]});
  const graph=sibling.socialGraph;
  assert.ok(ADDRESSED_BRANCHES.includes('romance.flirt'));
  assert.ok(!ADDRESSED_BRANCHES.includes('romance.intimacy'),
    'physical romance remains in dedicated later stages');
  applySocialEvent(graph,{type:'introduced',actorId:'resident_3',
    targetId:'resident_4',at:sibling.minutes});
  assert.equal(romanceSafety(graph,'resident_3','resident_4').allowed,false);
  assert.equal(queueAddressedSocial(sibling,'resident_3','resident_4','romance.flirt'),null);
  const root=household();
  applySocialEvent(root.socialGraph,{type:'introduced',actorId:'resident_3',
    targetId:'resident_4',at:root.minutes});
  assert.equal(romanceSafety(root.socialGraph,'resident_3','resident_4').allowed,true,
    'different family labels, and same family labels, are not kinship proof');
});
test('CAS-01.5-social acquaintance uses graph branch and is not an instant social reward',()=>{
  const root=household();placePair(root,'resident_3','alex');
  const a=getActor(root,'resident_3');a.needs.social=32;
  assert.ok(queueAddressedSocial(root,'resident_3','alex','acquaint.introduce'));
  assert.equal(getPair(root.socialGraph,'resident_3','alex'),null);
  tickHousehold(root,.1);
  assert.equal(root.additionalSocial?.phase,'using');
  assert.equal(getPair(root.socialGraph,'resident_3','alex'),null);
  tickHousehold(root,18);
  const pair=getPair(root.socialGraph,'resident_3','alex');
  assert.equal(pair.events.length,1);
  assert.equal(pair.events[0].type,'introduced');
  assert.equal(pair.metAt,root.minutes);
  assert.ok(a.needs.social<32,'introduction does not grant a positive receipt reward');
});
test('CAS-01.5-social old 1- and 2-person saves remain valid after a normal tick',()=>{
  const root=loadHousehold(clone(newHousehold()));
  tickHousehold(root,1);
  assert.equal(root.population,undefined);
  assert.equal(root.additionalSocial,null);
  assert.deepEqual(Object.keys(root.actionQueues.byResident),['alex','mira']);
  assert.equal(root.version,1);
});

test('CAS-01.5-social a new manual plan for either peer cancels session without reward',()=>{
  const root=household();placePair(root,'resident_3','resident_4');
  assert.ok(queueAddressedSocial(root,'resident_3','resident_4','talk'));
  tickHousehold(root,.1);
  assert.equal(root.additionalSocial?.phase,'using');
  const command=enqueueAction(root.actionQueues,'resident_4',
    {type:'object',actionId:'sofa'});
  assert.ok(command,'a manual peer request remains a queue head');
  tickHousehold(root,.1);
  assert.equal(root.additionalSocial,null);
  assert.equal(root.socialGraph.nextSeq,1);
  assert.equal(getPair(root.socialGraph,'resident_3','resident_4'),null);
});
test('CAS-01.5-social forged save session age, seq and physical presence are rejected',()=>{
  const root=household();placePair(root,'resident_3','resident_4');
  queueAddressedSocial(root,'resident_3','resident_4','talk');
  tickHousehold(root,.1);
  tickHousehold(root,3);
  const session=clone(root.additionalSocial);
  assert.equal(session.phase,'using');
  assert.equal(restoreAddressedSocial({...session,seq:root.actionQueues.nextSeq},root),null);
  assert.equal(restoreAddressedSocial({...session,createdAt:root.minutes+1},root),null);
  const original={...getActor(root,'resident_4').position};
  getActor(root,'resident_4').position={x:-4,z:-3};
  assert.equal(restoreAddressedSocial(session,root),null,'no remote conversation restore');
  getActor(root,'resident_4').position=original;
  assert.equal(restoreAddressedSocial(session,root)?.seq,session.seq);
});
test('CAS-01.5-social a queued invitation preempts only involved automatic tasks',()=>{
  const root=household();placePair(root,'resident_3','resident_4');
  const a=getActor(root,'resident_3'),b=getActor(root,'resident_4');
  a.action={id:'bed',phase:'walking',elapsed:0,automatic:true};
  b.action={id:'sofa',phase:'walking',elapsed:0,automatic:true};
  assert.ok(queueAddressedSocial(root,'resident_3','resident_4','talk'));
  assert.equal(a.action,null);
  assert.equal(b.action,null);
  assert.ok(pendingActions(root.actionQueues,'resident_3').length);
  assert.equal(root.relationship.affinity,50);
});
