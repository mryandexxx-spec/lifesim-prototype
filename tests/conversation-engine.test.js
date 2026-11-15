import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CONVERSATION_TOPICS,CONVERSATION_ACTS,CONVERSATION_MAX_TURNS,
  createConversation,restoreConversation,conversationOptions,evaluateResponse,
  conversationTranscript,conversationOutcome} from '../src/conversation-engine.js';
import {startConversation,chooseSocialLine,nextSocialLine,finishSocialConversation,
  arriveSocial,cancelSocial,startSocial,tickSocial,SOCIAL_ACTIONS,canReconcile} from '../src/relationships.js';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
const place={x:-.2,z:1.85},deep=x=>JSON.parse(JSON.stringify(x));
const begin=(root,topic='support',id='alex')=>{
  assert.equal(startConversation(root,id,place,topic),true);
  assert.equal(arriveSocial(root),true);
};
test('six original topics have exactly 18 meaningful choices',()=>{
  assert.equal(Object.keys(CONVERSATION_TOPICS).length,6);
  assert.equal(Object.keys(CONVERSATION_ACTS).length,18);
  assert.equal(CONVERSATION_MAX_TURNS,3);
  const ids=Object.values(CONVERSATION_TOPICS).flatMap(t=>t.lines);
  assert.equal(new Set(ids).size,18);
  for(const id of ids){
    const act=CONVERSATION_ACTS[id];
    assert.ok(act.line.length>12&&act.yes.length>5&&act.no.length>5);
    assert.ok(['warm','neutral','sharp'].includes(act.tone));
  }
});
test('unknown topic and mismatched choice are rejected',()=>{
  const s=newHousehold();
  assert.equal(createConversation('__proto__'),null);
  assert.equal(startConversation(s,'alex',place,'unknown'),false);
  assert.equal(s.socialAction,null);
  begin(s);
  assert.equal(chooseSocialLine(s,'conflict.blame'),null);
  assert.equal(s.socialAction.conversation.turns.length,0);
});
test('walking does not apply effects and cannot receive lines before arrival',()=>{
  const s=newHousehold();
  assert.equal(startConversation(s,'alex',place,'support'),true);
  assert.equal(chooseSocialLine(s,'support.listen'),null);
  tickHousehold(s,20);
  assert.equal(s.relationship.affinity,50);
  assert.equal(s.socialAction.phase,'walking');
  arriveSocial(s);
  tickHousehold(s,99);
  assert.equal(s.relationship.affinity,50);
  assert.equal(s.mind.memories.length,0);
});
test('a positive two-step conversation changes opinions and memories exactly once',()=>{
  const s=newHousehold();begin(s);
  assert.equal(chooseSocialLine(s,'support.listen').accepted,true);
  assert.equal(s.relationship.affinity,50);
  assert.equal(s.mind.memories.length,0);
  assert.equal(nextSocialLine(s),true);
  assert.equal(chooseSocialLine(s,'support.help').accepted,true);
  assert.equal(conversationTranscript(s.socialAction.conversation).length,5);
  const result=finishSocialConversation(s);
  assert.equal(result.kind,'talk');
  assert.ok(s.relationship.affinity>50);
  assert.equal(s.socialAction,null);
  assert.deepEqual(s.mind.memories.map(x=>x.id),['talk']);
  assert.deepEqual(s.otherSim.mind.memories.map(x=>x.id),['talk']);
  assert.equal(s.relationship.views.alex.sentiments.length,1);
  assert.equal(s.relationship.views.mira.sentiments.length,1);
  assert.equal(finishSocialConversation(s),null);
});
test('an accusatory line produces a refusal, actual conflict and asymmetric memory',()=>{
  const s=newHousehold();begin(s,'conflict');
  const response=chooseSocialLine(s,'conflict.blame');
  assert.equal(response.accepted,false);
  assert.match(conversationTranscript(s.socialAction.conversation).at(-1).line,/обвинения/);
  assert.equal(finishSocialConversation(s).kind,'argue');
  assert.equal(s.relationship.affinity,46);
  assert.equal(s.mind.memories.at(-1).id,'regret');
  assert.equal(s.otherSim.mind.memories.at(-1).id,'hurt');
  assert.equal(canReconcile(s),true);
});
test('same line is accepted or refused according to directed trust and tension',()=>{
  const s=newHousehold();
  const good=evaluateResponse(s,'alex','support','support.listen');
  s.relationship.views.mira.trust=0;
  s.relationship.views.mira.tension=100;
  const bad=evaluateResponse(s,'alex','support','support.listen');
  assert.equal(good.accepted,true);
  assert.equal(bad.accepted,false);
  assert.ok(good.confidence>bad.confidence);
});
test('choices cannot be double-tapped; exactly three turns maximum',()=>{
  const s=newHousehold();begin(s,'daily');
  assert.ok(chooseSocialLine(s,'daily.listen'));
  assert.equal(chooseSocialLine(s,'daily.listen'),null);
  assert.equal(nextSocialLine(s),true);
  assert.ok(chooseSocialLine(s,'daily.news'));
  assert.equal(nextSocialLine(s),true);
  assert.ok(chooseSocialLine(s,'daily.critic'));
  assert.equal(nextSocialLine(s),false);
  assert.equal(conversationTranscript(s.socialAction.conversation).length,7);
  assert.deepEqual(conversationOptions(s.socialAction.conversation),[]);
  assert.ok(finishSocialConversation(s));
});
test('ending with no actual line does not trigger free rewards',()=>{
  const s=newHousehold();begin(s,'plans');
  assert.equal(finishSocialConversation(s),null);
  assert.equal(s.relationship.affinity,50);
  assert.equal(s.mind.memories.length,0);
  chooseSocialLine(s,'plans.idea');
  assert.ok(finishSocialConversation(s));
  assert.equal(s.mind.memories.length,1);
});
test('cancellation before or after one exchange has zero effects',()=>{
  for(const withLine of [false,true]){
    const s=newHousehold();begin(s,'plans');
    if(withLine)chooseSocialLine(s,'plans.idea');
    assert.equal(cancelSocial(s),true);
    tickHousehold(s,100);
    assert.equal(s.relationship.affinity,50);
    assert.equal(s.mind.memories.length,0);
    assert.equal(s.relationship.views.alex.sentiments.length,0);
  }
});
test('pause freezes social session, options and side effects',()=>{
  const s=newHousehold();begin(s);
  s.paused=true;
  const saved=deep(s);
  assert.equal(chooseSocialLine(s,'support.listen'),null);
  assert.equal(nextSocialLine(s),false);
  assert.equal(finishSocialConversation(s),null);
  tickHousehold(s,999);
  assert.deepEqual(s,saved);
  s.paused=false;
  assert.ok(chooseSocialLine(s,'support.listen'));
});
test('valid mid-conversation save restores transcript and finishes once',()=>{
  const s=newHousehold();begin(s,'hobbies','mira');
  chooseSocialLine(s,'hobbies.books');
  const t=loadHousehold(deep(s));
  assert.deepEqual(t.socialAction.conversation,s.socialAction.conversation);
  assert.equal(t.relationship.affinity,50);
  assert.equal(conversationTranscript(t.socialAction.conversation).length,3);
  assert.equal(nextSocialLine(t),true);
  assert.ok(chooseSocialLine(t,'hobbies.music'));
  assert.ok(finishSocialConversation(t));
  assert.equal(t.mind.memories.length,1);
  assert.equal(t.version,1);
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
});
test('walking session survives save and can continue after arrival',()=>{
  const s=newHousehold();startConversation(s,'alex',place,'humor');
  const t=loadHousehold(deep(s));
  assert.equal(t.socialAction.phase,'walking');
  assert.equal(t.socialAction.conversation.phase,'opening');
  arriveSocial(t);
  assert.ok(chooseSocialLine(t,'humor.joke'));
});
test('hostile sessions are rejected rather than silently becoming legacy talk',()=>{
  const s=newHousehold();begin(s);
  const bad=[
    {topic:'evil',phase:'opening',turns:[],score:0},
    {topic:'support',phase:'opening',turns:[{id:'support.listen',accepted:true}],score:4},
    {topic:'support',phase:'response',turns:[{id:'support.listen',accepted:true}],score:999},
    {topic:'support',phase:'response',turns:[{id:'<script>',accepted:true}],score:4},
    {topic:'support',phase:'followUp',turns:[],score:0}
  ];
  for(const session of bad){
    const d=deep(s);d.socialAction.conversation=session;
    const t=loadHousehold(d);
    assert.equal(t.socialAction,null,JSON.stringify(session));
  }
  assert.equal(restoreConversation({topic:'support',phase:'opening',turns:[],score:0})?.phase,'opening');
});
test('legacy mid-action one-button conversation still completes at +8',()=>{
  const s=newHousehold();startSocial(s,'talk','alex',place);arriveSocial(s);
  tickSocial(s,8);
  const t=loadHousehold(deep(s));
  assert.equal(t.socialAction.conversation,undefined);
  tickSocial(t,11);
  assert.equal(t.relationship.affinity,58);
});
test('manual multi-turn talk can repeat at 100 affinity',()=>{
  const s=newHousehold();s.relationship.affinity=100;
  for(const id of ['daily.listen','daily.news']){
    begin(s,'daily');
    assert.ok(chooseSocialLine(s,id));
    assert.ok(finishSocialConversation(s));
    assert.equal(s.socialAction,null);
    assert.ok(s.relationship.affinity>=0&&s.relationship.affinity<=100);
  }
  // Availability at the cap is guaranteed, not a guaranteed positive outcome:
  // the partner may refuse a line and lower previously full affinity.
  assert.equal(s.mind.memories.length,2);
});
test('a conciliatory exchange after a quarrel can trigger one reconciliation',()=>{
  const s=newHousehold();
  startSocial(s,'argue','alex',place);arriveSocial(s);
  tickSocial(s,SOCIAL_ACTIONS.argue.duration+1);
  assert.equal(s.relationship.affinity,38);
  begin(s,'conflict','mira');
  chooseSocialLine(s,'conflict.apologize');
  assert.equal(finishSocialConversation(s).kind,'talk');
  assert.equal(s.mind.memories.at(-1).id,'reconcile');
  assert.equal(s.otherSim.mind.memories.at(-1).id,'reconcile');
  assert.equal(canReconcile(s),false);
});
test('iPhone dialogue panel is wired to cached touch controls and the Pages bundle',()=>{
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  for(const id of ['conversation-btn','conversation-panel','conversation-lines',
    'conversation-options','conversation-title','conversation-close'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.ok(game.includes('conversationDisplayKey'));
  assert.ok(game.includes('renderConversationPanel(false)'));
  assert.ok(game.includes('conversationTranscript(session)'));
  assert.ok(html.includes('id="talk-btn"')&&html.includes('id="argue-btn"'));
  assert.ok(css.includes('.conversation-panel[hidden]'));
  assert.ok(workflow.includes('node --check src/conversation-engine.js'));
  assert.ok(workflow.includes('src/conversation-engine.js src/dialogue-decision.js src/gifts-leisure.js src/household.js'));
});
