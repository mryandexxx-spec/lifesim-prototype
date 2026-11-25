import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold} from '../src/household.js';
import {createConversation,conversationOptions,chooseConversationTurn,restoreConversation,continueConversation} from '../src/conversation-engine.js';
import {dialogueNeedsDecision} from '../src/dialogue-decision.js';

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
