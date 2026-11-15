import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SOCIAL_OUTCOMES,SOCIAL_OUTCOME_LABELS,socialOutcome,
  emitSocialReaction,consumeSocialReactions,clearSocialReactions,
  reactionBadgePoint} from '../src/social-feedback.js';
import {REACTION_BADGE_SECONDS} from '../src/reaction-badges.js';
import {evaluateSocialReaction} from '../src/social-reactions.js';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {startSocial,arriveSocial,cancelSocial,startConversation,
  chooseSocialLine,finishSocialConversation,startSharedSocial,startBranchSocial,
  SOCIAL_ACTIONS} from '../src/relationships.js';
import {SAVE_KEY} from '../src/simulation.js';

const spot={x:-.2,z:1.85};
const clone=x=>JSON.parse(JSON.stringify(x));
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('six original expressive reactions are defined and can all be reached',()=>{
  assert.deepEqual(SOCIAL_OUTCOMES,
    ['warm','neutral','awkward','defensive','hostile','refused']);
  assert.equal(new Set(Object.values(SOCIAL_OUTCOME_LABELS)).size,6);
  assert.deepEqual([
    socialOutcome({kind:'conversation',accepted:true,score:93}),
    socialOutcome({kind:'conversation',accepted:true,score:64}),
    socialOutcome({kind:'conversation',accepted:true,score:54}),
    socialOutcome({kind:'conversation',accepted:false,score:38,tone:'sharp'}),
    socialOutcome({kind:'conversation',accepted:false,score:11,tone:'sharp'}),
    socialOutcome({kind:'gift',accepted:false,score:31})
  ],SOCIAL_OUTCOMES);
  assert.equal(socialOutcome({kind:'branch',actionId:'rival.taunt',
    accepted:false,score:50}),'hostile');
  assert.equal(socialOutcome({kind:'direct',actionId:'argue',
    accepted:true,score:80}),'hostile');
  assert.equal(socialOutcome({accepted:'yes',score:50}),null);
  assert.equal(socialOutcome({accepted:true,score:NaN}),null);
});

test('the actual 1.0d scorer returns typed meaning without changing existing acceptance',()=>{
  const receiver={personality:null,mind:{mood:{value:65},memories:[],emotions:[]}};
  const reaction=evaluateSocialReaction({kind:'gift',recipient:receiver,minutes:500,
    tag:'music',view:{trust:60,tension:0,friendship:60}});
  assert.equal(typeof reaction.accepted,'boolean');
  assert.ok(SOCIAL_OUTCOMES.includes(reaction.outcome));
  assert.ok(reaction.intensity>=0&&reaction.intensity<=100);
  assert.equal(reaction.score,reaction.confidence);
  assert.equal(evaluateSocialReaction({kind:'unknown',minutes:500}),null);
});

test('feedback queue is pure, per root and keyed to arbitrary resident IDs',()=>{
  const root={minutes:500,paused:false};
  const ids=['nova','ember','iris','dorian','riven'];
  const before=JSON.stringify(root);
  for(let i=0;i<ids.length;i++)
    assert.ok(emitSocialReaction(root,{actorId:ids[(i+1)%ids.length],
      responderId:ids[i],outcome:SOCIAL_OUTCOMES[i],eventType:'reply',
      receiptId:'episode-'+i}));
  assert.equal(JSON.stringify(root),before);
  const events=consumeSocialReactions(root);
  assert.deepEqual(events.map(x=>x.responderId),ids);
  assert.deepEqual(events.map(x=>x.outcome),SOCIAL_OUTCOMES.slice(0,5));
  assert.deepEqual(consumeSocialReactions(root),[]);
  assert.ok(Object.isFrozen(events[0]));
  assert.equal(consumeSocialReactions(clone(root)).length,0,
    'restored root does not contain transient icon events');
  assert.equal(emitSocialReaction(root,{actorId:'nova',responderId:'nova',
    outcome:'bad'}),null);
});

test('receipt deduplication, pause, cancellation and invalid IDs cannot spawn reactions',()=>{
  const root={minutes:505,paused:true};
  const args={actorId:'nova',responderId:'ember',outcome:'neutral',
    eventType:'conversation.line',receiptId:'one'};
  assert.equal(emitSocialReaction(root,args),null);
  root.paused=false;
  assert.ok(emitSocialReaction(root,args));
  assert.equal(emitSocialReaction(root,args),null,'same confirmed reply is not replayed');
  assert.ok(emitSocialReaction(root,{...args,responderId:'iris'}));
  assert.ok(emitSocialReaction(root,{...args,eventType:'conversation.finish'}));
  assert.equal(emitSocialReaction(root,{...args,responderId:'bad person'}),null);
  assert.equal(emitSocialReaction(root,{...args,intensity:Infinity}),null);
  assert.deepEqual(consumeSocialReactions(root).map(x=>x.responderId),
    ['ember','iris','ember']);
  clearSocialReactions(root);
  assert.deepEqual(consumeSocialReactions(root),[]);
});

test('camera projection rejects hidden, clipped, invalid and behind-camera badges',()=>{
  assert.deepEqual(reactionBadgePoint({x:210.2,y:170.8},{z:-4},390,750),
    {x:210,y:171});
  assert.equal(reactionBadgePoint({x:210,y:170},{z:1},390,750),null);
  assert.equal(reactionBadgePoint({x:21,y:170},{z:-2},390,750),null);
  assert.equal(reactionBadgePoint({x:210,y:20},{z:-2},390,750),null);
  assert.equal(reactionBadgePoint({x:210,y:719},{z:-2},390,750),null);
  assert.equal(reactionBadgePoint({x:NaN,y:200},{z:-2},390,750),null);
  assert.ok(REACTION_BADGE_SECONDS>=2&&REACTION_BADGE_SECONDS<=4);
});

test('queued, walking, paused and cancelled one-click talk show no feedback',()=>{
  const s=newHousehold();
  assert.deepEqual(consumeSocialReactions(s),[]);
  assert.equal(startSocial(s,'talk','alex',spot),true);
  assert.deepEqual(consumeSocialReactions(s),[]);
  tickHousehold(s,50);
  assert.deepEqual(consumeSocialReactions(s),[]);
  assert.equal(arriveSocial(s),true);
  s.paused=true;
  tickHousehold(s,50);
  assert.deepEqual(consumeSocialReactions(s),[]);
  s.paused=false;
  assert.equal(cancelSocial(s),true);
  assert.deepEqual(consumeSocialReactions(s),[]);
  assert.equal(s.relationship.affinity,50);
});

test('completed direct talk issues two personal badges only once, no change to save',()=>{
  const s=newHousehold(),initial=s.relationship.affinity;
  startSocial(s,'talk','alex',spot);arriveSocial(s);
  tickHousehold(s,SOCIAL_ACTIONS.talk.duration+1);
  assert.equal(s.relationship.affinity,initial+8);
  const events=consumeSocialReactions(s);
  assert.deepEqual(events.map(x=>x.responderId),['mira','alex']);
  assert.ok(events.every(x=>SOCIAL_OUTCOMES.includes(x.outcome)));
  tickHousehold(s,120);
  assert.deepEqual(consumeSocialReactions(s),[]);
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  const restored=loadHousehold(clone(s));
  assert.equal(restored.version,1);
  assert.equal(restored.relationship.affinity,initial+8);
  assert.deepEqual(consumeSocialReactions(restored),[]);
  assert.ok(!JSON.stringify(s).includes('receiptId'));
});

test('completed quarrel shows hostility to target and regret/awkwardness to initiator',()=>{
  const s=newHousehold();
  assert.equal(startSocial(s,'argue','mira',spot),true);
  arriveSocial(s);tickHousehold(s,SOCIAL_ACTIONS.argue.duration+1);
  const events=consumeSocialReactions(s);
  assert.deepEqual(events.map(x=>x.responderId),['alex','mira']);
  assert.deepEqual(events.map(x=>x.outcome),['hostile','awkward']);
});

test('spoken multi-turn response emits only when accepted as actual reply, no phantom replay',()=>{
  const s=newHousehold();
  startConversation(s,'alex',spot,'support');
  assert.deepEqual(consumeSocialReactions(s),[]);
  assert.equal(chooseSocialLine(s,'support.listen'),null);
  arriveSocial(s);
  assert.ok(chooseSocialLine(s,'support.listen'));
  assert.deepEqual(consumeSocialReactions(s).map(x=>x.responderId),['mira']);
  assert.equal(chooseSocialLine(s,'support.listen'),null);
  assert.deepEqual(consumeSocialReactions(s),[]);
  assert.ok(finishSocialConversation(s));
  assert.deepEqual(consumeSocialReactions(s).map(x=>x.responderId),['alex']);
  assert.equal(finishSocialConversation(s),null);
  assert.deepEqual(consumeSocialReactions(s),[]);
});

test('completed gifts & leisure have target-specific responses and do not re-emit',()=>{
  const gift=newHousehold();
  assert.equal(startSharedSocial(gift,'alex',spot,'gift','a1'),true);
  assert.deepEqual(consumeSocialReactions(gift),[]);
  arriveSocial(gift);
  tickHousehold(gift,13);
  const events=consumeSocialReactions(gift);
  assert.deepEqual(events.map(x=>x.responderId),['mira','alex']);
  assert.ok(['warm','neutral'].includes(events[0].outcome));
  tickHousehold(gift,20);assert.deepEqual(consumeSocialReactions(gift),[]);
  const leisure=newHousehold();
  assert.equal(startSharedSocial(leisure,'mira',spot,'leisure','music'),true);
  arriveSocial(leisure);tickHousehold(leisure,70);
  const both=consumeSocialReactions(leisure);
  assert.deepEqual(both.map(x=>x.responderId),['alex','mira']);
});

test('refused gift shows polite refusal over recipient, not false hostile romance symbol',()=>{
  const s=newHousehold();
  s.relationship.views.mira.tension=100;
  s.relationship.views.mira.trust=0;
  assert.equal(startSharedSocial(s,'alex',spot,'gift','a2'),true);
  arriveSocial(s);tickHousehold(s,13);
  const events=consumeSocialReactions(s);
  assert.equal(events.length,2);
  assert.equal(events[0].responderId,'mira');
  assert.equal(events[0].outcome,'refused');
  assert.equal(events[1].responderId,'alex');
  assert.equal(events[1].outcome,'awkward');
});

test('available branch scene action resolves two recipients with independent icons',()=>{
  const s=newHousehold();
  assert.equal(startBranchSocial(s,'alex',spot,'acquaint.chat'),true);
  arriveSocial(s);tickHousehold(s,19);
  const events=consumeSocialReactions(s);
  assert.deepEqual(events.map(x=>x.responderId),['mira','alex']);
  assert.ok(events.some(x=>x.eventType==='branch.reply'));
  assert.equal(s.socialAction,null);
  assert.deepEqual(consumeSocialReactions(s),[]);
});

test('iPhone scene integrates original SVG badges above rig heads rather than central heart',()=>{
  const page=read('../index.html'),css=read('../styles.css'),game=read('../src/game.js');
  const rig=read('../src/characters.js'),visual=read('../src/reaction-badges.js');
  const workflow=read('../.github/workflows/pages.yml');
  assert.ok(page.includes('id="reaction-layer"'));
  assert.ok(page.includes('сборка / 1.0f'));
  assert.ok(!page.includes('id="social-effect"'));
  assert.ok(game.includes('reactionBadges.show(consumeSocialReactions(game))'));
  assert.ok(game.includes('reactionBadges.update({dt,paused:game.paused'));
  assert.ok(game.includes('reactionBadges.clear();clearSocialReactions(game)'));
  assert.ok(!game.includes("const socialFx=$('social-effect')"));
  assert.ok(rig.includes('const head=upperBall('));
  assert.ok(rig.includes('avatar,head,torso'));
  assert.ok(visual.includes('camera.camera.worldToScreen(point)'));
  assert.ok(visual.includes('rig.head||rig.avatar'));
  assert.ok(visual.includes('state.element.hidden=!projected'));
  assert.ok(css.includes('pointer-events:none'));
  assert.ok(css.includes('prefers-reduced-motion'));
  for(const outcome of SOCIAL_OUTCOMES){
    assert.ok(visual.includes(outcome+':'),outcome);
    assert.ok(css.includes('data-outcome="'+outcome+'"'),outcome);
  }
  assert.ok(workflow.includes('node --check src/social-feedback.js'));
  assert.ok(workflow.includes('node --check src/reaction-badges.js'));
  assert.ok(workflow.includes('src/social-feedback.js src/social-episodes.js src/social-compatibility.js src/reaction-badges.js src/characters.js'));
});
