import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {skillProfileRows} from '../src/skill-presentation.js';
import {newSkillProgress,restoreSkillProgress} from '../src/skills-engine.js';
import {getHobbyContent} from '../src/hobby-content.js';
import {HOBBY_SKILLS,HOBBY_CONTENT,READING_ACTIVITY_ID,READING_CONTENT_ID,
  READING_ADVANCED_CONTENT_ID,READING_ADVANCED_UNLOCK_ID,READING_SKILL_ID,
  canReadHobbyContent} from '../src/hobby-reading.js';
import {newHousehold,loadHousehold,chooseResidentAction,tickHousehold} from '../src/household.js';
import {findMarketPlacement,buyMarketItem} from '../src/furniture-shop.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {arriveReadingJourney} from '../src/reading-journey.js';
import {enqueueAction} from '../src/action-queue.js';
const copy=v=>JSON.parse(JSON.stringify(v));
const file=p=>readFileSync(new URL(p,import.meta.url),'utf8');
function buyBookcase(root){
  const pose=findMarketPlacement(root.world.furniture,root.shop,'bookcase.starter');
  assert.ok(pose);
  const bought=buyMarketItem(root.world.furniture,root.shop,'bookcase.starter',pose);
  assert.equal(bought.ok,true);
  root.world.furniture=bought.world;root.shop=bought.shop;return bought.instanceId;
}

test('H4 skill selector derives 0–10, thresholds, progress and unlocks without mutating state',()=>{
  const raw=newSkillProgress();const before=copy(raw);
  let [skill]=skillProfileRows(raw,HOBBY_SKILLS);
  assert.equal(skill.id,READING_SKILL_ID);
  assert.equal(skill.level,0);assert.equal(skill.xp,0);
  assert.equal(skill.next,30);assert.equal(skill.percentage,0);
  assert.equal(skill.unlocks[0].unlocked,false);
  assert.equal(skill.unlocks[0].minLevel,3);
  raw.xpById.literature=100;
  [skill]=skillProfileRows(raw,HOBBY_SKILLS);
  assert.equal(skill.level,2);assert.equal(skill.previous,75);
  assert.equal(skill.next,135);assert.equal(skill.percentage,42);
  assert.equal(skill.unlocks[0].unlocked,false);
  raw.xpById.literature=135;
  [skill]=skillProfileRows(raw,HOBBY_SKILLS);
  assert.equal(skill.level,3);assert.equal(skill.unlocks[0].id,READING_ADVANCED_UNLOCK_ID);
  assert.equal(skill.unlocks[0].unlocked,true);
  raw.xpById.literature=999999;
  [skill]=skillProfileRows(raw,HOBBY_SKILLS);
  assert.equal(skill.level,10);assert.equal(skill.xp,1380);assert.equal(skill.percentage,100);
  assert.equal(skill.mastered,true);
  assert.deepEqual(before,newSkillProgress());
  assert.equal(skillProfileRows(null,null).length,0);
});

test('H4 invalid XP/old saves create no imaginary progress, no imaginary skill',()=>{
  const root=newHousehold();
  delete root.skills;delete root.otherSim.skills;
  const loaded=loadHousehold(copy(root));
  assert.equal(skillProfileRows(loaded.skills,HOBBY_SKILLS)[0].level,0);
  assert.equal(skillProfileRows(loaded.otherSim.skills,HOBBY_SKILLS)[0].level,0);
  const broken=restoreSkillProgress({schema:1,xpById:{literature:Infinity,'music.performance':800}},HOBBY_SKILLS);
  assert.equal(skillProfileRows(broken,HOBBY_SKILLS)[0].xp,0);
  assert.equal(skillProfileRows({schema:1,xpById:{literature:-100}},HOBBY_SKILLS)[0].level,0);
  assert.equal(skillProfileRows({schema:1,xpById:{literature:'135'}},HOBBY_SKILLS)[0].level,0);
  assert.equal(skillProfileRows(newSkillProgress(),HOBBY_SKILLS).length,2);
  assert.equal(skillProfileRows(newSkillProgress(),HOBBY_SKILLS)[1].id,'painting');
});

test('H4 advanced authored literature is a real threshold-gated item content, not just a badge',()=>{
  assert.equal(getHobbyContent(HOBBY_CONTENT,READING_ADVANCED_CONTENT_ID)?.difficulty,3);
  const state=newSkillProgress();
  assert.equal(canReadHobbyContent(state,READING_CONTENT_ID),true);
  assert.equal(canReadHobbyContent(state,READING_ADVANCED_CONTENT_ID),false);
  assert.equal(canReadHobbyContent(state,'nonexistent'),false);
  state.xpById.literature=134.999;
  assert.equal(canReadHobbyContent(state,READING_ADVANCED_CONTENT_ID),false);
  state.xpById.literature=135;
  assert.equal(canReadHobbyContent(state,READING_ADVANCED_CONTENT_ID),true);
});

test('H4 physical bookcase queues can retain a future classic, but execution cannot bypass level gate',()=>{
  const root=newHousehold(),id=buyBookcase(root);
  const advanced={type:'activity',activityId:READING_ACTIVITY_ID,
    targetInstanceId:id,contentId:READING_ADVANCED_CONTENT_ID};
  assert.equal(chooseResidentAction(root,'hobby',false,'alex',id,
    READING_ACTIVITY_ID,READING_ADVANCED_CONTENT_ID),false);
  assert.equal(enqueueAction(root.actionQueues,'alex',advanced)?.type,'activity');
  assert.equal(root.actionQueues.byResident.alex.length,1);
  root.skills.xpById.literature=135;
  assert.equal(chooseResidentAction(root,'hobby',false,'alex',id,
    READING_ACTIVITY_ID,READING_ADVANCED_CONTENT_ID),true);
  assert.equal(root.action.contentId,READING_ADVANCED_CONTENT_ID);
  assert.equal(root.activitySession.contentId,READING_ADVANCED_CONTENT_ID);
  const restored=loadHousehold(copy(root));
  assert.equal(restored.action?.contentId,READING_ADVANCED_CONTENT_ID);
  assert.equal(restored.skills.xpById.literature,135);
  assert.equal(restored.otherSim.skills.xpById.literature,undefined);
});

test('H4 real advanced reading awards personal XP only in active seated reading and reload is safe',()=>{
  const root=newHousehold(),id=buyBookcase(root);
  root.skills.xpById.literature=135;
  assert.equal(chooseResidentAction(root,'hobby',false,'alex',id,
    READING_ACTIVITY_ID,READING_ADVANCED_CONTENT_ID),true);
  const actor=root;
  actor.position={...furnitureActionApproach(root.world,'hobby',id)};
  assert.equal(arriveReadingJourney(actor.action),true);
  tickHousehold(root,2.4);
  const seat=furnitureActionApproach(root.world,'sofa',actor.action.readingSeatInstanceId);
  assert.ok(seat);
  actor.position={...seat};assert.equal(arriveReadingJourney(actor.action),true);
  tickHousehold(root,6);tickHousehold(root,2.4);
  assert.equal(actor.action.phase,'using');
  const xp=actor.skills.xpById.literature;
  tickHousehold(root,3);
  assert.ok(actor.skills.xpById.literature>xp);
  assert.equal(root.otherSim.skills.xpById.literature,undefined);
  const restored=loadHousehold(copy(root));
  const saved=restored.skills.xpById.literature;
  assert.equal(saved,actor.skills.xpById.literature);
  assert.equal(restored.activitySession.awardedMinutes,root.activitySession.awardedMinutes);
  assert.equal(restored.otherSim.skills.xpById.literature,undefined);
});

test('H4 Safari presentation, owned unlock, voice-over semantics and static deploy are wired',()=>{
  const html=file('../index.html'),game=file('../src/game.js'),css=file('../styles.css');
  const yml=file('../.github/workflows/pages.yml');
  assert.match(html,/id="mind-tab-skills"[^>]+role="tab"/);
  assert.match(html,/id="mind-skills-list"/);
  assert.match(html,/id="reading-content-select"/);
  assert.match(html,/book.classic.pathways/);
  assert.ok(html.includes('1.2u.11 · F4F.2 / H5 / F4F.1'));
  assert.match(game,/skillProfileRows/);
  assert.match(game,/canReadHobbyContent/);
  assert.ok(css.includes('.skill-card-progress'));
  assert.ok(yml.includes('cp src/skill-presentation.js site/src/'));
});
