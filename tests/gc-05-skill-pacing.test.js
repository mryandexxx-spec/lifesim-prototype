import test from 'node:test';
import assert from 'node:assert/strict';
import {HOBBY_SKILLS} from '../src/hobby-reading.js';
import {SKILL_XP_RATE,scaleSkillXP,restoreSkillProgress,currentSkillLevel} from '../src/skills-engine.js';
import {skillUnlocksAtLevel} from '../src/skill-registry.js';
import {newHousehold,loadHousehold} from '../src/household.js';
test('GC05 prospective rate is uniform; legacy levels and unlocks survive reload',()=>{
 assert.equal(SKILL_XP_RATE,.5);
 for(const amount of [1,1.05,1.2,10,12,18,25,36,45])assert.equal(scaleSkillXP(amount),amount*.5);
 const root=newHousehold();
 for(const actor of [root,root.otherSim]){
  for(const [id,def] of Object.entries(HOBBY_SKILLS.skills)) actor.skills.xpById[id]=def.xpThresholds[4]+.125;
 }
 const saved=JSON.parse(JSON.stringify(root)),loaded=loadHousehold(saved);
 for(const [old,now] of [[saved,loaded],[saved.otherSim,loaded.otherSim]]){
  assert.deepEqual(now.skills,old.skills);
  assert.deepEqual(restoreSkillProgress(old.skills,HOBBY_SKILLS),old.skills);
  for(const id of Object.keys(HOBBY_SKILLS.skills)){
   assert.equal(currentSkillLevel(now.skills,HOBBY_SKILLS,id),5);
   assert.deepEqual(skillUnlocksAtLevel(HOBBY_SKILLS,id,5),HOBBY_SKILLS.skills[id].unlocks.filter(x=>x.minLevel<=5));
  }
 }
 assert.equal(loaded.version,1);
});
