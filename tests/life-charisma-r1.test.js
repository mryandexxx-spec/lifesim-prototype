import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold,chooseResidentAction,tickHousehold,furnitureAvailable}
  from '../src/household.js';
import {ACTIONS,arrive,SAVE_KEY} from '../src/simulation.js';
import {HOBBY_SKILLS,CHARISMA_SKILL_ID,charismaSocialBonus} from '../src/hobby-reading.js';
import {currentSkillLevel,restoreSkillProgress} from '../src/skills-engine.js';
import {findMarketPlacement,buyMarketItem} from '../src/furniture-shop.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {findPath} from '../src/navigation.js';
import {enqueueAction,restoreActionQueues} from '../src/action-queue.js';
import {startSocial,arriveSocial,tickSocial} from '../src/relationships.js';
import {evaluateResponse} from '../src/conversation-engine.js';
import {MIRROR_SPEECH_DURATION,MIRROR_SPEECH_XP,furnitureUseWeight}
  from '../src/furniture-interactions.js';
const copy=x=>JSON.parse(JSON.stringify(x));
function householdWithMirror(){
  const root=newHousehold();
  const pose=findMarketPlacement(root.world.furniture,root.shop,'mirror.panel');
  assert.ok(pose,'real mirror placement');
  const bought=buyMarketItem(root.world.furniture,root.shop,'mirror.panel',pose);
  assert.equal(bought.ok,true,bought.reason);
  root.world.furniture=bought.world;root.shop=bought.shop;
  const point=furnitureActionApproach(root.world,'mirror',bought.instanceId);
  assert.ok(point);
  assert.ok(findPath(root.position,point,root.world));
  return {root,id:bought.instanceId,point};
}
function start(root,id,person='alex'){
  assert.equal(chooseResidentAction(root,'mirror',false,person,id,
    null,null,null,null,null,true),true);
  const actor=person==='alex'?root:root.otherSim;
  assert.equal(actor.action.phase,'walking');
  assert.equal(actor.action.mirrorPractice,true);
  return actor;
}
test('CHARISMA: canonical 0–10 skill, thresholds, cap and conservative social tiers',()=>{
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.equal(Object.keys(HOBBY_SKILLS.skills).length,6);
  assert.ok(HOBBY_SKILLS.skills.gardening,'canonical skill registry is extensible');
  assert.equal(HOBBY_SKILLS.skills.charisma.maxLevel,10);
  assert.equal(HOBBY_SKILLS.skills.charisma.group,'social');
  assert.equal(currentSkillLevel({schema:1,xpById:{charisma:149.9}},HOBBY_SKILLS,'charisma'),2);
  assert.equal(currentSkillLevel({schema:1,xpById:{charisma:150}},HOBBY_SKILLS,'charisma'),3);
  assert.equal(currentSkillLevel({schema:1,xpById:{charisma:1360}},HOBBY_SKILLS,'charisma'),10);
  assert.equal(restoreSkillProgress({schema:1,xpById:{charisma:9999}},HOBBY_SKILLS).xpById.charisma,1360);
  assert.equal(charismaSocialBonus({schema:1,xpById:{charisma:0}}),0);
  assert.equal(charismaSocialBonus({schema:1,xpById:{charisma:150}}),1);
  assert.equal(charismaSocialBonus({schema:1,xpById:{charisma:650}}),2);
  assert.equal(charismaSocialBonus({schema:1,xpById:{charisma:1090}}),3);
});
test('CHARISMA: genuine purchased mirror, A* walking, exclusive occupancy, completed XP only',()=>{
  const {root,id,point}=householdWithMirror();
  const actor=start(root,id);
  assert.equal(furnitureAvailable(root,'mirror','mira',id),false);
  tickHousehold(root,10);
  assert.equal(actor.skills.xpById.charisma,undefined);
  actor.position={...point};arrive(actor);
  tickHousehold(root,MIRROR_SPEECH_DURATION-1);
  assert.equal(actor.skills.xpById.charisma,undefined);
  assert.ok(furnitureUseWeight(actor.action,id)>0);
  tickHousehold(root,1);
  assert.equal(actor.action,null);
  assert.equal(actor.skills.xpById.charisma,MIRROR_SPEECH_XP*.75);
  assert.match(actor.event,/харизма \+13\.5 XP/);
  tickHousehold(root,100);
  assert.equal(actor.skills.xpById.charisma,MIRROR_SPEECH_XP*.75);
});
test('CHARISMA: pause freezes, faster game clock gives no extra XP per practice',()=>{
  const {root,id,point}=householdWithMirror();
  start(root,id);root.position={...point};arrive(root);
  tickHousehold(root,9);
  root.paused=true;
  const before=copy(root);
  tickHousehold(root,99);
  assert.deepEqual(root,before);
  root.paused=false;root.speed=3;
  tickHousehold(root,MIRROR_SPEECH_DURATION-9);
  assert.equal(root.action,null);
  assert.equal(root.skills.xpById.charisma,MIRROR_SPEECH_XP*.75);
});
test('CHARISMA: in-progress action saved at 12 minutes resumes safely, no replay on reload',()=>{
  const {root,id,point}=householdWithMirror();
  start(root,id);root.position={...point};arrive(root);
  tickHousehold(root,12);
  const reloaded=loadHousehold(copy(root));
  assert.equal(reloaded.version,1);
  assert.equal(reloaded.action.mirrorPractice,true);
  assert.equal(reloaded.action.elapsed,12);
  assert.equal(reloaded.skills.xpById.charisma,undefined);
  tickHousehold(reloaded,11);
  assert.equal(reloaded.skills.xpById.charisma,undefined);
  tickHousehold(reloaded,1);
  assert.equal(reloaded.skills.xpById.charisma,MIRROR_SPEECH_XP*.75);
  const twice=loadHousehold(copy(reloaded));
  tickHousehold(twice,20);
  assert.equal(twice.skills.xpById.charisma,MIRROR_SPEECH_XP*.75);
});
test('CHARISMA: moved/removed object or teleported resident cancels reward',()=>{
  for(const type of ['stored','away']){
    const {root,id,point}=householdWithMirror();
    start(root,id);root.position={...point};arrive(root);
    tickHousehold(root,10);
    if(type==='stored')root.world.furniture.instances
      .find(item=>item.instanceId===id).location='storage';
    else root.position={x:point.x+2,z:point.z};
    tickHousehold(root,50);
    assert.equal(root.action,null);
    assert.equal(root.skills.xpById.charisma,undefined);
  }
});
test('CHARISMA: corrupt finished or remote saved practice never revives',()=>{
  const {root,id,point}=householdWithMirror();
  start(root,id);root.position={...point};arrive(root);tickHousehold(root,10);
  const corrupt=copy(root);corrupt.action.elapsed=24;
  assert.equal(loadHousehold(corrupt).action,null);
  const remote=copy(root);remote.position.x+=3;
  assert.equal(loadHousehold(remote).action,null);
  const legacy=copy(root);delete legacy.skills;delete legacy.action.mirrorPractice;
  const old=loadHousehold(legacy);
  assert.equal(old.skills.xpById.charisma,undefined);
  assert.equal(old.action.id,'mirror');
  tickHousehold(old,30);
  assert.equal(old.skills.xpById.charisma,undefined);
});
test('CHARISMA: persistent manual FIFO sanitizes flags; no XP from enqueue',()=>{
  const {root,id}=householdWithMirror();
  const request={type:'object',actionId:'mirror',targetInstanceId:id,mirrorPractice:true};
  assert.equal(enqueueAction(root.actionQueues,'alex',request)?.mirrorPractice,true);
  assert.equal(enqueueAction(root.actionQueues,'alex',{type:'object',actionId:'shower',mirrorPractice:true}),null);
  assert.equal(enqueueAction(root.actionQueues,'alex',{type:'object',actionId:'mirror',mirrorPractice:3}),null);
  const restored=restoreActionQueues(copy(root.actionQueues),['alex','mira']);
  assert.equal(restored.byResident.alex[0].mirrorPractice,true);
  assert.equal(root.skills.xpById.charisma,undefined);
});
test('CHARISMA: Alex/Mira personal XP; grooming still XP-free; legacy saves accepted',()=>{
  const {root,id,point}=householdWithMirror();
  start(root,id,'mira');root.otherSim.position={...point};arrive(root.otherSim);
  tickHousehold(root,MIRROR_SPEECH_DURATION);
  assert.equal(root.otherSim.skills.xpById.charisma,MIRROR_SPEECH_XP*.75);
  assert.equal(root.skills.xpById.charisma,undefined);
  assert.equal(chooseResidentAction(root,'mirror',false,'alex',id),true);
  root.position={...point};arrive(root);
  tickHousehold(root,ACTIONS.mirror.duration);
  assert.equal(root.skills.xpById.charisma,undefined);
  const old=loadHousehold({version:1,minutes:800,
    needs:{hunger:60,energy:70,hygiene:55,fun:40},position:{x:0,z:0}});
  assert.equal(old.version,1);
  assert.equal(old.skills.xpById.charisma,undefined);
});
test('CHARISMA: friendly talk grants bounded extra affinity; argument unaffected',()=>{
  const plain=newHousehold(),trained=newHousehold();
  trained.skills.xpById.charisma=1090;
  for(const root of [plain,trained]){
    assert.equal(startSocial(root,'talk','alex',{x:-.2,z:1.8}),true);
    assert.equal(arriveSocial(root),true);
    assert.equal(tickSocial(root,18),true);
  }
  assert.equal(plain.relationship.affinity,58);
  assert.equal(trained.relationship.affinity,61);
  const hostile=newHousehold();hostile.skills.xpById.charisma=1090;
  assert.equal(startSocial(hostile,'argue','alex',{x:-.2,z:1.8}),true);
  assert.equal(arriveSocial(hostile),true);
  tickSocial(hostile,16);
  assert.equal(hostile.relationship.affinity,38);
});
test('CHARISMA: dialogue modest confidence, no sharp-phrase bonus, boundaries prevail',()=>{
  const ordinary=newHousehold(),trained=newHousehold();
  trained.skills.xpById.charisma=1090;
  const a=evaluateResponse(ordinary,'alex','support','support.listen');
  const b=evaluateResponse(trained,'alex','support','support.listen');
  assert.equal(b.confidence-a.confidence,3);
  const c=evaluateResponse(ordinary,'alex','conflict','conflict.blame');
  const d=evaluateResponse(trained,'alex','conflict','conflict.blame');
  assert.equal(c.confidence,d.confidence);
  trained.relationship.views.mira.trust=0;
  trained.relationship.views.mira.tension=100;
  assert.equal(evaluateResponse(trained,'alex','support','support.listen').accepted,false);
});
test('CHARISMA: Safari source, cache and optimized conditional mobile CI connected',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../.github/workflows/ci-targeted.yml',import.meta.url),'utf8');
  assert.match(html,/id="mirror-speech-button"/);
  assert.match(html,/charisma-r1/);
  assert.match(game,/command\.mirrorPractice===true/);
  assert.match(game,/\$\('mirror-speech-button'\)\.addEventListener/);
  assert.match(workflow,/mobile-webgl-smoke/);
  assert.match(workflow,/pull_request:/);
});
