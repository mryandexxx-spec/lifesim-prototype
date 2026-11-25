import test from 'node:test';
import assert from 'node:assert/strict';
import {CONVERSATION_TOPICS,CONVERSATION_ACTS,createConversation,conversationOptions,restoreConversation,conversationTranscript,evaluateResponse,chooseConversationTurn,continueConversation} from '../src/conversation-engine.js';
import {newHousehold,loadHousehold} from '../src/household.js';
import {startConversation,arriveSocial,finishSocialConversation} from '../src/relationships.js';
const setup=(topic,xp=0)=>{
 const root=newHousehold();root.skills.xpById.charisma=xp;
 assert.ok(startConversation(root,'alex',{x:-.2,z:1.85},topic));assert.ok(arriveSocial(root));
 return [root,root.socialAction.conversation];
};
const newTopics=['memories','career','dreams','money','family','relationships','philosophy','gossip'];
test('PF-10/B catalogue: distinct authored lines, valid reply and old IDs',()=>{
 assert.equal(Object.keys(CONVERSATION_TOPICS).length,15);
 assert.equal(Object.keys(CONVERSATION_ACTS).length,101);
 assert.equal(new Set(Object.values(CONVERSATION_ACTS).map(a=>a.line)).size,101);
 for(const [topic,t] of Object.entries(CONVERSATION_TOPICS)){
  assert.ok(t.lines.length>=6,topic);
  for(const id of t.lines){const a=CONVERSATION_ACTS[id];assert.ok(a?.line&&a.yes&&a.no&&id.startsWith(topic+'.'),id);}
 }
});
test('PF-10/B charisma threshold previews and actual dispatch, both accepted and refusal branches',()=>{
 for(const topic of newTopics)for(const [xp,level] of [[0,0],[149,2],[150,3],[484,5],[485,6],[1089,8],[1090,9],[1360,10]]){
  const [root,c]=setup(topic,xp);const options=conversationOptions(c,root);
  assert.equal(options.length,5);
  assert.ok(options.some(o=>!o.locked));
  for(const [suffix,min] of [['tact',3],['reflect',6],['deep',9]]){
   const id=topic+'.'+suffix;assert.equal(options.find(o=>o.id===id)?.locked,level<min);
   if(level<min)assert.equal(chooseConversationTurn(root,id),null);
  }
  assert.ok(chooseConversationTurn(root,topic+'.ask'));assert.ok(continueConversation(root));
  const result=conversationOptions(c,root);const accepted=c.turns[0].accepted;
  assert.ok(!result.some(o=>o.id===topic+'.ask'));
  assert.ok(result.some(o=>o.id===topic+(accepted?'.yes':'.repair')&&!o.locked));
  assert.ok(!result.some(o=>o.id===topic+(accepted?'.repair':'.yes')));
  assert.equal(chooseConversationTurn(root,topic+(accepted?'.repair':'.yes')),null);
  assert.ok(chooseConversationTurn(root,topic+(accepted?'.yes':'.repair')));
  const restored=loadHousehold(JSON.parse(JSON.stringify(root)));
  assert.deepEqual(restored.socialAction.conversation,c);
  assert.equal(conversationTranscript(c).length,5);
  const before=restored.socialGraph.nextSeq;assert.ok(finishSocialConversation(restored));
  assert.equal(restored.socialGraph.nextSeq,before+1);assert.equal(finishSocialConversation(restored),null);
 }
});
test('PF-10/B contextual recovery across every topic and high charisma is not guaranteed acceptance',()=>{
 for(const [topic,t] of Object.entries(CONVERSATION_TOPICS)){
  const [root,c]=setup(topic==='sports'?'daily':topic,1360);
  const id=t.lines[0],a=CONVERSATION_ACTS[id];
  for(const accepted of [true,false]){
   const saved=restoreConversation({topic,phase:'followUp',turns:[{id,accepted}],score:accepted?Math.max(1,a.weight):-4});
   assert.ok(saved,topic);
   const options=conversationOptions(saved,root);
   assert.ok(options.some(o=>o.id===topic+(accepted?'.yes':'.repair')&&!o.locked),topic);
   assert.ok(!options.some(o=>o.id===topic+(accepted?'.repair':'.yes')));
  }
 }
 const [root]=setup('career',1360);
 root.relationship.views.mira.trust=0;root.relationship.views.mira.tension=100;
 assert.equal(evaluateResponse(root,'alex','career','career.deep').accepted,false);
});
