import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {sportsFixtures} from '../src/sports-league.js';
import {selectSportsClub,readSportsNews,restoreSportsFan,sportsConversationReady} from '../src/sports-fandom.js';
import {startConversation,arriveSocial,chooseSocialLine,finishSocialConversation} from '../src/relationships.js';
import {CONVERSATION_TOPICS} from '../src/conversation-engine.js';
import {getPair} from '../src/social-graph.js';

const fixture=()=>newHousehold('2026-01-01');
const played=()=>{
  const root=fixture(),first=sportsFixtures(root.sportsWorld)[0];
  tickHousehold(root,first.end-root.minutes+3);
  return {root,first};
};
test('R1-B old root-v1 residents start without favorite and do not invent fandom',()=>{
  const x=fixture();
  assert.equal(x.sportsFan.favoriteTeamId,null);
  assert.equal(x.otherSim.sportsFan.favoriteTeamId,null);
  const raw=JSON.parse(JSON.stringify(x));delete raw.sportsFan;delete raw.otherSim.sportsFan;
  const old=loadHousehold(raw,'2026-01-01');
  assert.equal(old.sportsFan.favoriteTeamId,null);
  assert.equal(old.otherSim.sportsFan.favoriteTeamId,null);
  assert.equal(old.version,1);
});
test('R1-B original clubs can be freely selected independently once and then bounded by 7d cooldown',()=>{
  const root=fixture();
  assert.equal(selectSportsClub(root,'alex','not-a-real-team').ok,false);
  assert.equal(selectSportsClub(root,'alex','moon-foxes').ok,true);
  assert.equal(selectSportsClub(root,'mira','copper-gulls').ok,true);
  assert.equal(root.sportsFan.favoriteTeamId,'moon-foxes');
  assert.equal(root.otherSim.sportsFan.favoriteTeamId,'copper-gulls');
  assert.equal(root.sportsFan.fanIntensity,40);
  assert.equal(selectSportsClub(root,'alex','amber-pier').ok,false);
  const loaded=loadHousehold(JSON.parse(JSON.stringify(root)),'2026-01-01');
  assert.equal(loaded.sportsFan.favoriteTeamId,'moon-foxes');
  assert.equal(selectSportsClub(loaded,'alex','amber-pier').ok,false);
});
test('R1-B no retroactive reactions when club chosen after the played match',()=>{
  const {root,first}=played();
  assert.equal(selectSportsClub(root,'alex',first.home).ok,true);
  assert.equal(readSportsNews(root,'alex',first.id).ok,false);
  assert.equal(root.mind.memories.filter(m=>m.id.startsWith('sports.')).length,0);
});
test('R1-B finished match news drives one bounded real emotion and no repeated reward',()=>{
  const root=fixture(),first=sportsFixtures(root.sportsWorld)[0];
  selectSportsClub(root,'alex',first.home);
  tickHousehold(root,first.end-root.minutes+1);
  const before=root.mind.memories.length;
  const news=readSportsNews(root,'alex',first.id);
  assert.equal(news.ok,true);
  assert.equal(root.mind.memories.length,before+1);
  assert.ok(['sports.win','sports.draw','sports.loss'].includes(news.emotion));
  assert.equal(root.mind.memories.at(-1).id,news.emotion);
  assert.equal(root.mind.emotions.at(-1).source,news.emotion);
  assert.ok(root.sportsFan.fanIntensity<=100);
  const intensity=root.sportsFan.fanIntensity;
  assert.equal(readSportsNews(root,'alex',first.id).ok,false);
  assert.equal(root.sportsFan.fanIntensity,intensity);
  const loaded=loadHousehold(JSON.parse(JSON.stringify(root)),'2026-01-01');
  assert.equal(readSportsNews(loaded,'alex',first.id).ok,false);
  assert.equal(loaded.sportsFan.fanIntensity,intensity);
});
test('R1-B paused news cannot award emotion, malformed saved fan history is sanitized',()=>{
  const root=fixture(),first=sportsFixtures(root.sportsWorld)[0];
  selectSportsClub(root,'mira',first.away);
  tickHousehold(root,first.end-root.minutes+1);
  root.paused=true;
  assert.equal(readSportsNews(root,'mira',first.id).ok,false);
  assert.equal(root.otherSim.mind.memories.some(m=>m.id.startsWith('sports.')),false);
  const restore=restoreSportsFan({schema:1,favoriteTeamId:'copper-gulls',
    fanIntensity:100000,lastReactedMatchIds:['<script>','0-0-0','0-0-0'],
    followSince:root.minutes,nextChangeAt:root.minutes+100000},root.minutes);
  assert.equal(restore.favoriteTeamId,'copper-gulls');
  assert.ok(restore.fanIntensity<=100);
  assert.deepEqual(restore.lastReactedMatchIds,['0-0-0']);
});
test('R1-B sports discussion is a real physical multi-turn conversation, only completed receipt grants +3..6 Social',()=>{
  const {root}=played();
  assert.ok(CONVERSATION_TOPICS.sports);
  assert.equal(sportsConversationReady(root),true);
  root.needs.social=30;root.otherSim.needs.social=30;
  const oldPair=getPair(root.socialGraph,'alex','mira').events.length;
  const target={...root.otherSim.position};
  assert.equal(startConversation(root,'alex',target,'sports'),true);
  assert.equal(root.needs.social,30);assert.equal(root.otherSim.needs.social,30);
  assert.equal(getPair(root.socialGraph,'alex','mira').events.length,oldPair);
  assert.equal(arriveSocial(root),true);
  assert.ok(chooseSocialLine(root,'sports.result'));
  const result=finishSocialConversation(root);
  assert.ok(result);
  const receipt=getPair(root.socialGraph,'alex','mira').events.at(-1);
  assert.ok(['sports.discuss','sports.disagree'].includes(receipt.type));
  assert.ok(root.needs.social>=33&&root.needs.social<=36);
  assert.equal(root.needs.social,root.otherSim.needs.social);
  assert.equal(startConversation(root,'alex',target,'sports'),false); // 60 minute bounded cooldown
});
test('R1-B without completed league result sports talk never takes ownership of social FIFO',()=>{
  const root=fixture(),before=JSON.stringify(root.actionQueues);
  assert.equal(sportsConversationReady(root),false);
  assert.equal(startConversation(root,'alex',{...root.otherSim.position},'sports'),false);
  assert.equal(root.socialAction,null);
  assert.equal(JSON.stringify(root.actionQueues),before);
});
