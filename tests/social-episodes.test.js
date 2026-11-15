import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newSocialGraph,applySocialEvent,getPair,episodeContext,
  restoreSocialGraph,relationSummary} from '../src/social-graph.js';
import {EPISODE_LIMIT,EPISODE_DAY,EPISODE_LABELS,episodesFor,
  latestEpisodes,episodeAppraisal,restorePairEpisodes} from '../src/social-episodes.js';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {startSocial,arriveSocial,cancelSocial,startSharedSocial,
  SOCIAL_ACTIONS} from '../src/relationships.js';
import {evaluateResponse} from '../src/conversation-engine.js';
import {evaluateGift,evaluateLeisure} from '../src/gifts-leisure.js';
import {SAVE_KEY} from '../src/simulation.js';

const clone=o=>JSON.parse(JSON.stringify(o));
const ids=['nova','ember','iris','dorian','riven'];
const line=(g,a,b,type,at)=>applySocialEvent(g,{actorId:a,targetId:b,type,at});
const spot={x:-.2,z:1.85};
const text=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('one canonical social graph receipt records two unequal personal episodes',()=>{
  const g=newSocialGraph(ids);
  const r=line(g,'nova','ember','argue',480);
  assert.equal(r.seq,1);
  const p=getPair(g,'nova','ember');
  assert.deepEqual(episodesFor(p,'nova').map(x=>x.kind),['regret']);
  assert.deepEqual(episodesFor(p,'ember').map(x=>x.kind),['hurt']);
  assert.ok(episodesFor(p,'ember')[0].salience>episodesFor(p,'nova')[0].salience);
  assert.equal(episodesFor(p,'iris').length,0);
  assert.equal(getPair(g,'nova','iris'),null);
  assert.equal(episodeContext(g,'ember','nova',480).unresolved,true);
  assert.equal(episodeContext(g,'nova','ember',480).unresolved,false);
  assert.equal(episodeContext(g,'iris','dorian',480).bias,0);
  assert.deepEqual(latestEpisodes(p,'ember',480,1).map(e=>e.label),['Помнит сильную обиду']);
  assert.ok(Object.hasOwn(EPISODE_LABELS,'hurt'));
});

test('a strong hurt survives several ordinary friendly talks on the same game day',()=>{
  const g=newSocialGraph(ids);
  line(g,'nova','ember','argue',480);
  const initial=episodeContext(g,'ember','nova',480);
  for(let i=0;i<24;i++)line(g,'nova','ember','talk',490+i*8);
  const p=getPair(g,'nova','ember');
  assert.ok(episodesFor(p,'ember').length<=EPISODE_LIMIT);
  assert.ok(episodesFor(p,'ember').some(e=>e.kind==='hurt'),
    'substantive hurt is retained even after 24 generic compliments');
  const after=episodeContext(g,'ember','nova',700);
  assert.equal(after.repair,0);
  assert.ok(after.bias<0);
  assert.ok(after.unresolved);
  assert.ok(initial.bias<=-15);
  assert.equal(g.nextSeq,26);
});

test('rebuilding trust requires distinct meaningful acts on different days',()=>{
  const g=newSocialGraph(ids);
  line(g,'nova','ember','argue',480);
  const base=episodeContext(g,'ember','nova',500);
  line(g,'nova','ember','conversation.talk',600);
  line(g,'nova','ember','gift.accepted',700);
  line(g,'nova','ember','leisure.accepted',800);
  assert.equal(episodeContext(g,'ember','nova',1000).repair,0,
    'same-day positives cannot erase serious hurt');
  line(g,'nova','ember','gift.accepted',EPISODE_DAY+570);
  let partial=episodeContext(g,'ember','nova',EPISODE_DAY+580);
  assert.equal(partial.repair,2);
  assert.ok(partial.bias>base.bias);
  line(g,'nova','ember','leisure.accepted',EPISODE_DAY*2+540);
  const improved=episodeContext(g,'ember','nova',EPISODE_DAY*2+600);
  assert.equal(improved.repair,3);
  assert.ok(improved.bias>partial.bias);
  assert.equal(episodeContext(g,'nova','ember',EPISODE_DAY*2+600).bias,0,
    'the initiator has no symmetric invented serious hurt');
});

test('serious memory persists across days but its effect decays deterministically',()=>{
  const g=newSocialGraph(ids);
  line(g,'nova','ember','rival.taunt',480);
  const p=getPair(g,'nova','ember');
  const base=episodeAppraisal(p,'ember',480);
  const later=episodeAppraisal(p,'ember',480+EPISODE_DAY*16);
  assert.ok(base.bias<later.bias);
  assert.ok(later.bias<0);
  assert.deepEqual(episodeAppraisal(p,'ember',480+EPISODE_DAY*16),later);
  assert.equal(episodeAppraisal(p,'ember',NaN).bias,0);
  assert.deepEqual(latestEpisodes(p,'ember',479),[]);
});

test('one denied invitation is not automatically a hostile lifetime scar',()=>{
  const g=newSocialGraph(ids);
  line(g,'nova','ember','leisure.refused',480);
  const x=episodeContext(g,'ember','nova',500);
  assert.equal(x.bias,0);
  assert.equal(x.unresolved,false);
  assert.equal(episodesFor(getPair(g,'nova','ember'),'ember')[0].kind,'boundary');
});

test('a single 1.0e addition neither duplicates nor replays social event receipts',()=>{
  const g=newSocialGraph(ids);
  const receipt=applySocialEvent(g,{actorId:'nova',targetId:'ember',type:'argue',
    at:480,token:'unique-480'});
  assert.ok(receipt);
  assert.equal(applySocialEvent(g,{actorId:'nova',targetId:'ember',type:'argue',
    at:480,token:'unique-480'}),null);
  const p=getPair(g,'nova','ember');
  assert.equal(p.events.length,1);
  assert.equal(episodesFor(p,'nova').length,1);
  assert.equal(episodesFor(p,'ember').length,1);
  const snapshot=JSON.stringify(g);
  assert.deepEqual(episodeContext(g,'ember','nova',550),episodeContext(g,'ember','nova',550));
  assert.equal(JSON.stringify(g),snapshot,'read-only scoring may not change graph');
});

test('saved graph round-trip preserves episodes and excludes future/corrupt hostile data',()=>{
  const g=newSocialGraph(ids);
  line(g,'nova','ember','argue',480);
  line(g,'nova','ember','gift.accepted',530);
  const saved=clone(g);
  const restored=restoreSocialGraph(saved,ids);
  assert.deepEqual(restored, saved);
  assert.deepEqual(episodeContext(restored,'ember','nova',600),
    episodeContext(g,'ember','nova',600));
  const p=getPair(saved,'nova','ember');
  p.episodes.ember.push(
    {seq:99,at:530,type:'argue',kind:'hurt',salience:92},
    {seq:2,at:999999,type:'argue',kind:'hurt',salience:92},
    {seq:2,at:530,type:'gift.accepted',kind:'hurt',salience:92},
    {seq:2,at:530,type:'argue',kind:'hurt',salience:999},
    {seq:2,at:530,type:'gift.accepted',kind:'gratitude',salience:47}
  );
  const broken=restoreSocialGraph(saved,ids);
  const clean=episodesFor(getPair(broken,'nova','ember'),'ember');
  assert.ok(clean.every(e=>e.seq<=2&&e.at<=530&&e.salience<=100));
  assert.ok(clean.length<=EPISODE_LIMIT);
  assert.equal(Object.hasOwn(clean[0],'unexpectedHtml'),false);
});

test('old v1 graph without episodic field opens without invented historic wounds',()=>{
  const g=newSocialGraph(ids);
  line(g,'nova','ember','argue',480);
  const legacy=clone(g);
  for(const p of Object.values(legacy.pairs))delete p.episodes;
  const restored=restoreSocialGraph(legacy,ids);
  const pair=getPair(restored,'nova','ember');
  assert.equal(pair.events.length,1,'historical receipts remain');
  assert.deepEqual(pair.episodes,{ember:[],nova:[]});
  assert.equal(episodeContext(restored,'ember','nova',500).bias,0,
    'old saved events must not replay into new memory or change behavior');
  assert.equal(relationSummary(restored,'nova','ember').met,true);
});

test('legacy household saves stay version 1; completed talk and quarrel add directed memories',()=>{
  const s=newHousehold();
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.equal(s.version,1);
  const previous=JSON.stringify(s);
  assert.equal(startSocial(s,'argue','alex',spot),true);
  assert.equal(JSON.stringify(s).includes('socialAction'),true);
  assert.equal(episodesFor(getPair(s.socialGraph,'alex','mira'),'mira').length,0);
  assert.equal(cancelSocial(s),true);
  assert.equal(episodesFor(getPair(s.socialGraph,'alex','mira'),'mira').length,0);
  assert.equal(startSocial(s,'argue','alex',spot),true);
  arriveSocial(s);tickHousehold(s,SOCIAL_ACTIONS.argue.duration+1);
  const pair=getPair(s.socialGraph,'alex','mira');
  assert.equal(episodesFor(pair,'alex').at(-1).kind,'regret');
  assert.equal(episodesFor(pair,'mira').at(-1).kind,'hurt');
  assert.ok(episodeContext(s.socialGraph,'mira','alex',s.minutes).bias<0);
  const saved=clone(s);
  const loaded=loadHousehold(saved);
  assert.equal(loaded.version,1);
  assert.equal(loaded.relationship.affinity,s.relationship.affinity);
  assert.deepEqual(episodesFor(getPair(loaded.socialGraph,'alex','mira'),'mira'),
    episodesFor(pair,'mira'));
  assert.ok(previous.length>0);
});

test('one reconciliation still works for old saves but does not erase lasting hurt',()=>{
  const s=newHousehold();
  startSocial(s,'argue','alex',spot);arriveSocial(s);
  tickHousehold(s,SOCIAL_ACTIONS.argue.duration+1);
  const oldWound=episodeContext(s.socialGraph,'mira','alex',s.minutes);
  assert.ok(oldWound.bias<0);
  startSocial(s,'talk','mira',spot);arriveSocial(s);
  tickHousehold(s,SOCIAL_ACTIONS.talk.duration+1);
  const next=episodeContext(s.socialGraph,'mira','alex',s.minutes);
  assert.equal(s.relationship.lastKind,'talk');
  assert.equal(next.repair,0);
  assert.ok(next.unresolved,'apology is not instant full trust restoration');
  assert.ok(next.bias<0);
  assert.ok(episodesFor(getPair(s.socialGraph,'alex','mira'),'mira')
    .some(e=>e.kind==='hurt'));
});

test('personal memory actually changes willingness to accept the same social action',()=>{
  const s=newHousehold();
  const recipient='mira';
  const baseline=evaluateResponse(s,'alex','support','support.listen');
  const gift=evaluateGift(s,'alex',{type:'postcard'});
  const leisure=evaluateLeisure(s,'alex','music');
  const pair=getPair(s.socialGraph,'alex',recipient);
  assert.ok(pair);
  const seed=s.minutes;
  // Graph event emulates an actual severe completed action and already owns
  // the directed receipt; this test deliberately preserves all other scores.
  line(s.socialGraph,'alex','mira','rival.taunt',seed);
  const answer=evaluateResponse(s,'alex','support','support.listen');
  const giftAfter=evaluateGift(s,'alex',{type:'postcard'});
  const leisureAfter=evaluateLeisure(s,'alex','music');
  assert.ok(answer.confidence<baseline.confidence);
  assert.ok(giftAfter.score<gift.score);
  assert.ok(leisureAfter.score<leisure.score);
  assert.deepEqual(pair.views.mira, getPair(s.socialGraph,'alex','mira').views.mira);
});

test('pair memories are independent for many residents and never require specific names',()=>{
  const g=newSocialGraph(ids);
  line(g,'nova','ember','argue',480);
  line(g,'iris','riven','gift.accepted',490);
  assert.equal(episodeContext(g,'ember','nova',500).unresolved,true);
  assert.equal(episodeContext(g,'riven','iris',500).unresolved,false);
  assert.equal(episodeContext(g,'ember','iris',500).bias,0);
  assert.equal(episodeContext(g,'nova','ember',500).bias,0);
  assert.equal(getPair(g,'iris','riven').events[0].seq,2);
});

test('UI, workflow and current saved scheme expose stories without copying Sims UI',()=>{
  const html=text('../index.html'),js=text('../src/game.js');
  const workflow=text('../.github/workflows/pages.yml'),game=text('../src/social-graph.js');
  assert.ok(html.includes('id="mind-episodes"'));
  assert.ok(html.includes('сборка / 1.0'));
  assert.ok(js.includes('latestEpisodes(memoryPair,game.selectedSim,game.minutes,3)'));
  assert.ok(js.includes('Доверие ещё восстанавливается'));
  assert.ok(workflow.includes('node --check src/social-episodes.js'));
  assert.ok(workflow.includes('src/social-feedback.js src/social-episodes.js src/social-compatibility.js src/social-boundaries.js src/social-dynamics.js src/reaction-badges.js'));
  assert.ok(game.includes('rememberPairReceipt(pair,receipt)'));
  assert.ok(game.includes('restorePairEpisodes(entry.episodes'));
  assert.ok(!/\b(alex|mira|PlayCanvas|document|localStorage)\b/i.test(
    text('../src/social-episodes.js')));
  assert.ok(EPISODE_LIMIT<=24);
  assert.deepEqual(restorePairEpisodes({nova:[{seq:1,type:'unknown',kind:'hurt',
    at:500,salience:99}]},['nova','ember'],10,500),{nova:[],ember:[]});
});
