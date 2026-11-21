import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {READING_BOOKS,READING_CONTENT_IDS,READING_CONTENT_ID,
 READING_ADVANCED_CONTENT_ID,READING_SKILL_ID,HOBBY_SKILLS,HOBBY_CONTENT,
 READING_ACTIVITY_ID,canReadHobbyContent,readingBookMinLevel} from '../src/hobby-reading.js';
import {getHobbyContent,contentByKind} from '../src/hobby-content.js';
import {skillProfileRows} from '../src/skill-presentation.js';
import {newSkillProgress} from '../src/skills-engine.js';
import {newHousehold,loadHousehold,chooseResidentAction,tickHousehold} from '../src/household.js';
import {findMarketPlacement,buyMarketItem} from '../src/furniture-shop.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {arriveReadingJourney} from '../src/reading-journey.js';
const clone=v=>JSON.parse(JSON.stringify(v));
const source=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('BOOK-R1 keeps the first two IDs and offers ten unique authored fiction titles',()=>{
 assert.equal(READING_BOOKS.length,10);
 assert.equal(READING_CONTENT_IDS[0],READING_CONTENT_ID);
 assert.equal(READING_CONTENT_IDS[1],READING_ADVANCED_CONTENT_ID);
 assert.equal(new Set(READING_CONTENT_IDS).size,10);
 assert.equal(new Set(READING_BOOKS.map(x=>x.label)).size,10);
 assert.equal(new Set(READING_BOOKS.map(x=>x.genre)).size,10);
 assert.equal(contentByKind(HOBBY_CONTENT,'book').length,10);
 for(const book of READING_BOOKS){
   const record=getHobbyContent(HOBBY_CONTENT,book.id);
   assert.equal(record.label,book.label);
   assert.equal(record.kind,'book');
   assert.equal(readingBookMinLevel(book.id),book.minLevel);
   assert.ok(record.tags.includes('book.fiction'));
 }
 assert.equal(readingBookMinLevel('book.forged'),null);
 assert.equal(getHobbyContent(HOBBY_CONTENT,'book.forged'),null);
});

test('BOOK-R1 availability is per resident and level-gated; old level-3 classic is unchanged',()=>{
 const alex=newSkillProgress(),mira=newSkillProgress();
 assert.deepEqual(READING_BOOKS.filter(x=>canReadHobbyContent(alex,x.id)).map(x=>x.minLevel),
   [0,0,0,0]);
 assert.equal(canReadHobbyContent(alex,READING_ADVANCED_CONTENT_ID),false);
 assert.equal(canReadHobbyContent(alex,'book.forged'),false);
 for(const [xp,level] of [[0,0],[30,1],[75,2],[135,3],[320,5]]){
   alex.xpById[READING_SKILL_ID]=xp;
   for(const book of READING_BOOKS)
     assert.equal(canReadHobbyContent(alex,book.id),book.minLevel<=level,book.id+' level '+level);
 }
 assert.equal(canReadHobbyContent(mira,'book.silence.drama'),false);
 assert.equal(canReadHobbyContent(alex,'book.silence.drama'),true);
 const rows=skillProfileRows(alex,HOBBY_SKILLS),literature=rows.find(x=>x.id===READING_SKILL_ID);
 assert.equal(literature.level,5);
 assert.ok(literature.unlocks.some(x=>x.label==='Книга «Карта тихих разговоров»'&&x.unlocked));
});

test('BOOK-R1 real bookcase action preserves chosen new ID and reload without free XP',()=>{
 const root=newHousehold(),pose=findMarketPlacement(root.world.furniture,root.shop,'bookcase.starter');
 assert.ok(pose);
 const bought=buyMarketItem(root.world.furniture,root.shop,'bookcase.starter',pose);
 assert.equal(bought.ok,true);
 root.world.furniture=bought.world;root.shop=bought.shop;
 const beforeCredits=root.shop.credits,book='book.orbit.scifi';
 assert.equal(chooseResidentAction(root,'hobby',false,'alex',bought.instanceId,
   READING_ACTIVITY_ID,'book.silence.drama'),false);
 assert.equal(chooseResidentAction(root,'hobby',false,'alex',bought.instanceId,
   READING_ACTIVITY_ID,book),true);
 assert.equal(root.action.contentId,book);
 assert.equal(root.activitySession.contentId,book);
 assert.equal(root.skills.xpById.literature,undefined);
 const restored=loadHousehold(clone(root));
 assert.equal(restored.action.contentId,book);
 assert.equal(restored.activitySession.contentId,book);
 assert.equal(restored.shop.credits,beforeCredits);
 assert.equal(restored.version,1);
 assert.equal(restored.otherSim.skills.xpById.literature,undefined);
 const actor=restored;
 actor.position={...furnitureActionApproach(restored.world,'hobby',bought.instanceId)};
 assert.equal(arriveReadingJourney(actor.action),true);
 tickHousehold(restored,2.4);
 const seat=furnitureActionApproach(restored.world,'sofa',actor.action.readingSeatInstanceId);
 assert.ok(seat);
 actor.position={...seat};
 assert.equal(arriveReadingJourney(actor.action),true);
 tickHousehold(restored,6);
 tickHousehold(restored,2.4);
 const xp=restored.skills.xpById.literature??0;
 tickHousehold(restored,3);
 assert.ok(restored.skills.xpById.literature>xp);
 assert.equal(restored.otherSim.skills.xpById.literature,undefined);
 const saved=loadHousehold(clone(restored));
 assert.equal(saved.action.contentId,book);
 assert.equal(saved.skills.xpById.literature,restored.skills.xpById.literature);
});

test('BOOK-R1 iPhone selector and Pages use the real catalog, no alternate save or purchase layer',()=>{
 const game=source('../src/game.js'),html=source('../index.html');
 assert.match(game,/for\(const book of READING_BOOKS\)/);
 assert.match(game,/canReadHobbyContent\(progress,book.id\)/);
 assert.match(game,/updateReadingContentChoice\(\);/);
 assert.match(html,/reading-content-select/);
 assert.match(html,/h5c-book-r1/);
 assert.match(html,/game.js\?v=1\.2u[^"]*book-r1-20261121/);
 assert.match(source('../.github/workflows/pages.yml'),/cp src\/hobby-reading\.js site\/src\//);
 assert.equal(readingBookMinLevel(READING_ADVANCED_CONTENT_ID),3);
});
