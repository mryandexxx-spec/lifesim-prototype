import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold} from '../src/household.js';
import {characterCardSnapshot,oncePerButton} from '../src/ux05-character-ui.js';
import {startConversation,arriveSocial,chooseSocialLine,finishSocialConversation} from '../src/relationships.js';
import {dialogueNeedsDecision,applyDialogueDecision} from '../src/dialogue-decision.js';
import {conversationOptions} from '../src/conversation-engine.js';
const text=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const source=text('../src/game.js'),html=text('../index.html'),
 css=text('../styles.css'),pages=text('../.github/workflows/pages.yml');
test('UX05 distinct actual needs and reasons for Alex and Mira',()=>{
 const game=newHousehold();game.needs.hunger=12;game.otherSim.needs.energy=9;
 const alex=characterCardSnapshot(game,{name:'Алекс'});
 const mira=characterCardSnapshot(game.otherSim,{name:'Мира'});
 assert.equal(alex.needs.find(n=>n.id==='hunger').value,12);
 assert.equal(mira.needs.find(n=>n.id==='energy').value,9);
 assert.match(alex.primaryNeed,/Сытость/);
 assert.match(mira.primaryNeed,/Энергия/);
 assert.notEqual(alex.reason,mira.reason);
});
test('UX05 personality, mood and social data read without mutation or invented metrics',()=>{
 const game=newHousehold(),serialized=JSON.stringify(game);
 const data=characterCardSnapshot(game,{name:'Алекс',world:game.world});
 assert.equal(JSON.stringify(game),serialized);
 assert.deepEqual(data.needs.map(n=>n.id).sort(),
  ['hunger','energy','hygiene','fun','social','bladder'].sort());
 assert.equal(data.reasons.length>0,true);
 assert.equal(Object.hasOwn(data,'internalCompatibility'),false);
});
test('UX05 confirm callback yields one canonical request after rapid double tap',()=>{
 let count=0;const once=oncePerButton(()=>{count++;return true;});
 assert.equal(once(),true);assert.equal(once(),false);assert.equal(count,1);
});
test('UX05 rejected confirmation can be retried without accidental loss',()=>{
 let count=0;const once=oncePerButton(()=>++count>=2);
 assert.equal(once(),false);assert.equal(once(),true);assert.equal(count,2);
});
test('UX05 exceptions do not permanently lock confirmation',()=>{
 let count=0;const once=oncePerButton(()=>{
  if(++count===1)throw Error('rejected');
  return true;
 });
 assert.throws(once,/rejected/);assert.equal(once(),true);assert.equal(count,2);
});
test('UX05 inspection switches only viewer and not selected commander',()=>{
 const begin=source.indexOf("for(const id of HOUSEHOLD_IDS)$('mind-view-");
 const end=source.indexOf('function renderSkillsTab',begin);
 assert.ok(begin>=0&&end>begin);
 assert.ok(!source.slice(begin,end).includes('selectResident(game,id)'));
 assert.match(source,/mindInspectResident=id;skillProfileKey='';/);
 assert.match(source,/mindInspectResident!==game.selectedSim/);
 assert.match(source,/getActor\(game,mindInspectResident\)/);
});
test('UX05 social command requires category option then explicit confirmation',()=>{
 assert.match(source,/scheduleCommand\(\{targetId,\.\.\.request\},initiator\)/);
 assert.match(source,/if\(dialogueNeedsDecision\(game\)\|\|game.selectedSim!==initiator\)return false/);
 assert.match(source,/box\.dataset\.ux05Confirm='true'/);
 assert.match(source,/found.label\+' · недоступно: '/);
 assert.match(source,/action.label\+' · недоступно: '/);
});
test('UX05 cards expose real data with progressive disclosure and safe touch size',()=>{
 for(const id of ['mind-view-alex','mind-view-mira','mind-primary-need','mind-cause',
   'mind-wish-label','mind-action-current','mind-action-next','mind-memories',
   'mind-relation-friendship','mind-skills-list','mind-reading-skill'])
   assert.ok(html.includes('id="'+id+'"'),id);
 assert.equal((html.match(/class="mind-disclosure"/g)||[]).length,4);
 assert.match(css,/\.mind-view-switch button\{min-height:44px/);
});
test('UX05 required line is paused, single-result, survives root-v1 reload',()=>{
 const game=newHousehold(),pos={x:-.2,z:1.85};
 assert.equal(startConversation(game,'alex',pos,'daily'),true);
 assert.equal(arriveSocial(game),true);
 assert.equal(dialogueNeedsDecision(game),true);
 const loaded=loadHousehold(JSON.parse(JSON.stringify(game)));
 assert.equal(loaded.version,1);
 assert.equal(dialogueNeedsDecision(loaded),true);
 const id=conversationOptions(loaded.socialAction.conversation)[0].id;
 const submit=oncePerButton(()=>applyDialogueDecision(loaded,r=>chooseSocialLine(r,id)));
 assert.ok(submit());assert.equal(submit(),false);
 assert.equal(loaded.socialAction.conversation.turns.length,1);
 const completed=applyDialogueDecision(loaded,finishSocialConversation);
 assert.ok(completed);assert.equal(dialogueNeedsDecision(loaded),false);
});
test('UX05 mandatory panel cannot close via Escape, background or optional mode',()=>{
 assert.match(source,/dialogueNeedsDecision\(game\)\?oncePerButton\(callback\):callback/);
 assert.match(source,/if\(dialogueNeedsDecision\(game\)\)return; \/\/ Mandatory decisions have no close path/);
 assert.match(source,/const restoreRequiredDialogue=/);
 assert.match(source,/document\.addEventListener\('visibilitychange'/);
 assert.match(source,/!document\.hidden;/);
 assert.ok(html.includes('id="conversation-kind"'));
 assert.ok(pages.includes('src/ux05-character-ui.js'));
});
