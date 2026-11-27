/** GARDEN-R1: physical completion, anti-farm, personal skill and v1 crop economy. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {previewOutdoorFeatureEdit,commitOutdoorFeatureEdit} from '../src/outdoor-proposals.js';
import {gardenApproach,gardenActionAllowed,settleGardenAction,
  GARDEN_DURATION,GARDEN_HYDRATION_MINUTES} from '../src/gardening.js';
import {HOBBY_SKILLS} from '../src/hobby-reading.js';
import {currentSkillLevel} from '../src/skills-engine.js';
import {gardenSkillBenefits,gardenHarvestUnits,creditGardenPractice} from '../src/garden-skill.js';
import {gardenActionSheet} from '../src/garden-presentation.js';
import {skillProfileRows} from '../src/skill-presentation.js';

const copy=x=>structuredClone(x);
function plot(){
  const initial=newHousehold();
  initial.autonomy.enabled=false;initial.otherSim.autonomy.enabled=false;
  const proposal=previewOutdoorFeatureEdit(initial,{operation:'place',
    itemId:'garden.herb.mint',pose:{x:19,z:8,yaw:0}});
  assert.equal(proposal.ok,true,proposal.reason);
  const result=commitOutdoorFeatureEdit(initial,proposal);
  assert.equal(result.ok,true,result.reason);
  return {root:result.root,id:result.root.world.outdoors.features[0].instanceId};
}
function using(root,id,verb,resident='alex',automatic=false){
  const actor=resident==='mira'?root.otherSim:root;
  const p=gardenApproach(root.world,id,actor.position);
  assert.ok(p,'garden must be A* reachable');
  actor.position={...p.goal};
  actor.action={id:'garden',phase:'using',automatic,elapsed:0,
    targetInstanceId:id,gardenActionId:verb,
    gardenPlantedAt:root.world.outdoors.gardens[id].plantedAt,
    gardenGoal:{...p.goal}};
}
function ripe(root,id){
  const r=root.world.outdoors.gardens[id];
  r.progressWetMinutes=4320;r.evaluatedAt=root.minutes;
}
test('GARDEN: one canonical 0-10 personal skill, old save and presentation',()=>{
  const {root}=plot();
  assert.equal(currentSkillLevel(root.skills,HOBBY_SKILLS,'gardening'),0);
  assert.equal(currentSkillLevel(root.otherSim.skills,HOBBY_SKILLS,'gardening'),0);
  const rows=skillProfileRows(root.skills,HOBBY_SKILLS);
  const r=rows.find(x=>x.id==='gardening');
  assert.equal(r.level,0);assert.equal(r.unlocks.length,4);
  assert.match(r.hint,/автоматический уход/);
  const old=copy(root);delete old.skills;delete old.otherSim.skills;
  const restored=loadHousehold(old);
  assert.equal(currentSkillLevel(restored.skills,HOBBY_SKILLS,'gardening'),0);
  assert.equal(restored.world.outdoors.features.length,1);
  assert.equal(restored.world.outdoors.gardens[root.world.outdoors.features[0].instanceId].schema,1);
});
test('GARDEN: manual water gets exactly 10 XP upon physical completion only once',()=>{
  const {root,id}=plot();using(root,id,'water');
  tickHousehold(root,7);
  assert.equal(root.skills.xpById.gardening,undefined);
  tickHousehold(root,8);
  assert.equal(root.skills.xpById.gardening,5);
  assert.equal(root.world.outdoors.gardens[id].hydratedUntil,
    root.minutes+GARDEN_HYDRATION_MINUTES);
  const snapshot=loadHousehold(copy(root));
  tickHousehold(snapshot,10);
  assert.equal(snapshot.skills.xpById.gardening,5);
  assert.equal(snapshot.otherSim.skills.xpById.gardening,undefined);
  assert.equal(gardenActionAllowed(snapshot,'mira',id,'water'),false);
});
test('GARDEN: pause, walking, cancellation and autonomous water give no XP',()=>{
  const {root,id}=plot();using(root,id,'water');
  root.paused=true;tickHousehold(root,99);
  assert.equal(root.action.elapsed,0);assert.equal(root.skills.xpById.gardening,undefined);
  root.paused=false;root.action=null;tickHousehold(root,20);
  assert.equal(root.skills.xpById.gardening,undefined);
  using(root,id,'water','alex',true);tickHousehold(root,GARDEN_DURATION.water);
  assert.equal(root.skills.xpById.gardening,undefined);
  assert.equal(root.world.outdoors.gardens[id].lastWateredAt,root.minutes);
  assert.equal(creditGardenPractice(root.skills,HOBBY_SKILLS,'inspect'),null);
  assert.equal(creditGardenPractice(root.skills,HOBBY_SKILLS,'admire'),null);
  assert.equal(creditGardenPractice(root.skills,HOBBY_SKILLS,'water',{automatic:true}),null);
});
test('GARDEN: real skill improves water duration, not rate or planted metadata',()=>{
  const {root,id}=plot();
  root.skills.xpById.gardening=135; // level 3, +3 hours
  assert.deepEqual(gardenSkillBenefits(3),{hydrationBonusMinutes:180,extraHarvestUnits:0});
  using(root,id,'water');tickHousehold(root,15);
  assert.equal(root.world.outdoors.gardens[id].hydratedUntil,
    root.minutes+GARDEN_HYDRATION_MINUTES+180);
  assert.equal(root.skills.xpById.gardening,140);
  assert.equal(root.otherSim.skills.xpById.gardening,undefined);
  const restored=loadHousehold(copy(root));
  assert.equal(restored.world.outdoors.gardens[id].hydratedUntil,
    root.world.outdoors.gardens[id].hydratedUntil);
  assert.deepEqual(gardenSkillBenefits(8),{hydrationBonusMinutes:360,extraHarvestUnits:1});
  assert.deepEqual(gardenSkillBenefits(100),{hydrationBonusMinutes:0,extraHarvestUnits:0});
});
test('GARDEN: harvest bonus clamped to pantry; no double harvest or credit',()=>{
  const {root,id}=plot();ripe(root,id);
  root.skills.xpById.gardening=425; // level 6: base 2 + 1 herb
  using(root,id,'harvest');tickHousehold(root,GARDEN_DURATION.harvest);
  assert.equal(root.kitchen.pantry.herbs,3);
  assert.equal(root.skills.xpById.gardening,437.5);
  assert.equal(root.world.outdoors.gardens[id].harvestedAt,root.minutes);
  const persisted=loadHousehold(copy(root));
  assert.equal(settleGardenAction(persisted,'alex',id,'harvest'),false);
  tickHousehold(persisted,12);
  assert.equal(persisted.skills.xpById.gardening,437.5);
  assert.equal(gardenHarvestUnits(10,15,16,2),1);
  assert.equal(gardenHarvestUnits(10,14,16,2),2);
  assert.equal(gardenHarvestUnits(10,0,16,2),4);
});
test('GARDEN: manual replant paid once, credits XP once, new planting still compatible',()=>{
  const {root,id}=plot();ripe(root,id);
  root.world.outdoors.gardens[id].harvestedAt=root.minutes;
  const balance=root.shop.credits,log=root.financialHistory.entries.length;
  using(root,id,'replant');tickHousehold(root,GARDEN_DURATION.replant);
  assert.equal(root.shop.credits,balance-30);
  assert.equal(root.financialHistory.entries.length,log+1);
  assert.equal(root.skills.xpById.gardening,6);
  assert.equal(root.world.outdoors.gardens[id].harvestedAt,null);
  assert.equal(settleGardenAction(root,'alex',id,'replant'),false);
  const restored=loadHousehold(copy(root));
  assert.equal(restored.shop.credits,balance-30);
  assert.equal(restored.skills.xpById.gardening,6);
});
test('GARDEN: panel shows personal tier, actual projected harvest and stable caps',()=>{
  const {root,id}=plot();
  root.skills.xpById.gardening=940; // level 9: +6h, +1 herb
  let sheet=gardenActionSheet(root,'alex',id);
  assert.match(sheet.info,/Садоводство 9\/10/);
  assert.match(sheet.info,/полив \+6 ч/);
  ripe(root,id);root.kitchen.pantry.herbs=13;
  sheet=gardenActionSheet(root,'alex',id);
  assert.match(sheet.actions.find(a=>a.actionId==='harvest').label,/\+3/);
  root.kitchen.pantry.herbs=15;
  sheet=gardenActionSheet(root,'alex',id);
  assert.equal(sheet.actions.find(a=>a.actionId==='harvest').available,false);
  assert.equal(creditGardenPractice(root.skills,HOBBY_SKILLS,'water').gained,5);
  const full=copy(root.skills);full.xpById.gardening=1190;
  const maxed=creditGardenPractice(full,HOBBY_SKILLS,'harvest');
  assert.equal(maxed.gained,0);assert.equal(maxed.progress.xpById.gardening,1190);
});
