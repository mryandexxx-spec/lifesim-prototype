import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,tickHousehold,getActor,setHouseholdAutonomy} from '../src/household.js';
import {createConversation,conversationOptions,chooseConversationTurn,restoreConversation,continueConversation} from '../src/conversation-engine.js';
import {dialogueNeedsDecision,applyDialogueDecision} from '../src/dialogue-decision.js';
import {newGame} from '../src/simulation.js';
import {restoreSkillProgress} from '../src/skills-engine.js';
import {HOBBY_SKILLS} from '../src/hobby-reading.js';
import {isWalkable,findPath,isClearLine} from '../src/navigation.js';
import {queueAddressedConversation,finishAddressedConversation,cancelAddressedSocial,dispatchAddressedSocial,tickAddressedSocial} from '../src/resident-social-runtime.js';
import {getPair} from '../src/social-graph.js';
import {startConversation,arriveSocial,finishSocialConversation} from '../src/relationships.js';
import {enqueueAction,pendingActions} from '../src/action-queue.js';
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
      !findPath(p,q,root.world)||!isClearLine(p,q,root.world)||other.some(id=>
        [p,q].some(point=>Math.hypot(point.x-getActor(root,id).position.x,
          point.z-getActor(root,id).position.z)<1.2)))continue;
    a.position=p;b.position=q;
    return;
  }
  assert.fail('A physical social spot must exist');
}


test('PF-10/A gates pilot dialogue choices by the initiator’s real charisma and preserves old IDs',()=>{
  const root=newHousehold();
  const c=createConversation('daily');
  root.socialAction={initiator:'alex',partner:'mira',phase:'using',conversation:c};
  const opts=conversationOptions(c,root);
  for(const [id,min] of [['daily.tact',3],['daily.reframe',6],['daily.inspire',9]]){
    assert.equal(opts.find(x=>x.id===id)?.minLevel,min);
    assert.equal(opts.find(x=>x.id===id)?.locked,true);
    assert.equal(chooseConversationTurn(root,id),null);
  }
  assert.equal(c.turns.length,0);
  assert.ok(chooseConversationTurn(root,'daily.listen'));
  assert.deepEqual(restoreConversation(c),c);
  assert.ok(continueConversation(root));
  assert.ok(conversationOptions(c,root).some(x=>!x.locked));
});
test('PF-10/A addressed required-choice gate uses the same pause contract',()=>{
  const root=newHousehold();
  root.additionalSocial={phase:'walking',conversation:createConversation('daily')};
  assert.equal(dialogueNeedsDecision(root),false);
  root.additionalSocial.phase='using';
  assert.equal(dialogueNeedsDecision(root),true);
});

test('PF-10/A all twelve directed pairs use initiator skills, shared dialogue, restore and one receipt',()=>{
  const ids=['alex','mira','resident_3','resident_4'];
  for(const a of ids)for(const b of ids){
    if(a===b)continue;
    const root=household();placePair(root,a,b);
    const actor=getActor(root,a),peer=getActor(root,b);
    actor.skills=restoreSkillProgress({schema:1,xpById:{charisma:650}},HOBBY_SKILLS);
    peer.skills=restoreSkillProgress({schema:1,xpById:{charisma:1090}},HOBBY_SKILLS);
    const legacy=ids.indexOf(a)<2&&ids.indexOf(b)<2;
    if(legacy){
      assert.ok(startConversation(root,a,actor.position,'daily'));
      assert.ok(arriveSocial(root));
    }else{
      assert.ok(queueAddressedConversation(root,a,b,'daily'));
      tickHousehold(root,.1);
      assert.equal(root.additionalSocial?.phase,'using',a+' -> '+b);
    }
    const s=root.socialAction||root.additionalSocial;
    const before=root.socialGraph.nextSeq;
    const minute=root.minutes;
    assert.ok(dialogueNeedsDecision(root));
    tickHousehold(root,20);
    assert.equal(root.minutes,minute);
    const choices=conversationOptions(s.conversation,root);
    assert.equal(choices.find(x=>x.id==='daily.tact').locked,false);
    assert.equal(choices.find(x=>x.id==='daily.reframe').locked,false);
    assert.equal(choices.find(x=>x.id==='daily.inspire').locked,true);
    assert.equal(chooseConversationTurn(root,'daily.inspire'),null);
    assert.ok(chooseConversationTurn(root,'daily.reframe'));
    assert.equal(root.socialGraph.nextSeq,before);
    const restored=loadHousehold(clone(root));
    assert.ok(dialogueNeedsDecision(restored),a+' -> '+b+' restore');
    assert.equal(getActor(restored,a).skills.xpById.charisma,650);
    assert.equal(getActor(restored,b).skills.xpById.charisma,1090);
    assert.deepEqual((restored.socialAction||restored.additionalSocial).conversation,s.conversation);
    restored.paused=true;
    assert.ok(applyDialogueDecision(restored,r=>legacy?finishSocialConversation(r):finishAddressedConversation(r)));
    assert.equal(restored.paused,true);
    assert.equal(restored.socialGraph.nextSeq,before+1);
    assert.equal(getPair(restored.socialGraph,a,b).events.at(-1).actorId,a);
    assert.equal(getPair(restored.socialGraph,a,b).events.at(-1).targetId,b);
    assert.equal(legacy?finishSocialConversation(restored):finishAddressedConversation(restored),null);
    assert.equal(restored.socialGraph.nextSeq,before+1);
    if(!legacy)assert.equal(restored.relationship.affinity,50);
  }
});
test('PF-10/A charisma exact thresholds and refusal branch do not remove basic choices',()=>{
  for(const xp of [0,149.9,150,484.9,485,649.9,650,1089.9,1090,1360]){
    const root=newHousehold();
    root.skills.xpById.charisma=xp;
    root.otherSim.skills.xpById.charisma=1360;
    const session=createConversation('daily');
    root.socialAction={initiator:'alex',partner:'mira',phase:'using',conversation:session};
    // Real registry threshold for level 6 is 485, not 650 (which is level 7).
    const actual=xp>=1090?9:xp>=485?6:xp>=150?3:0;
    for(const [id,min] of [['daily.tact',3],['daily.reframe',6],['daily.inspire',9]])
      assert.equal(conversationOptions(session,root).find(x=>x.id===id).locked,actual<min);
  }
  const root=newHousehold();
  root.skills.xpById.charisma=1360;
  const session=restoreConversation({topic:'daily',phase:'followUp',turns:[{id:'daily.critic',accepted:false}],score:-4});
  root.socialAction={initiator:'alex',partner:'mira',phase:'using',conversation:session};
  assert.equal(conversationOptions(session,root).find(x=>x.id==='daily.inspire').locked,true);
  assert.equal(chooseConversationTurn(root,'daily.inspire'),null);
  assert.ok(conversationOptions(session,root).some(x=>x.id==='daily.listen'&&!x.locked));
});
test('PF-10/A later FIFO entries survive a conversation and cancellation has no receipt',()=>{
  const root=household();placePair(root,'resident_3','resident_4');
  const a='resident_3',b='resident_4';
  root.paused=true;
  const first=queueAddressedConversation(root,a,b,'support');
  assert.ok(first);
  assert.ok(enqueueAction(root.actionQueues,a,{type:'move',x:0,z:0}));
  assert.ok(enqueueAction(root.actionQueues,b,{type:'move',x:0,z:0}));
  root.paused=false;
  // Dispatch directly before unrelated movement tick; FIFO later heads must remain.
  // The addressed runtime owns a single physical reservation.
  const before=root.socialGraph.nextSeq;
  assert.equal(pendingActions(root.actionQueues,a)[0].seq,first.seq);
  assert.equal(queueAddressedConversation(root,a,a,'daily'),null);
  assert.equal(queueAddressedConversation(root,a,b,'sports'),null);
  assert.equal(root.socialGraph.nextSeq,before);
  assert.ok(dispatchAddressedSocial(root));
  tickAddressedSocial(root,.1);
  assert.equal(root.additionalSocial?.phase,'using');
  assert.ok(chooseConversationTurn(root,'support.listen'));
  assert.ok(cancelAddressedSocial(root,a));
  assert.equal(root.socialGraph.nextSeq,before);
  assert.equal(pendingActions(root.actionQueues,a)[0].type,'move');
  assert.equal(pendingActions(root.actionQueues,b)[0].type,'move');
});
