import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,tickHousehold,residentAutonomousChoice} from '../src/household.js';
import {sportsFixtures} from '../src/sports-league.js';
import {selectSportsClub} from '../src/sports-fandom.js';
import {sportsAutoIntent,recordSportsAutoStart} from '../src/sports-autonomy.js';

const setup=()=>{
 const root=newHousehold('2026-11-22'),m=sportsFixtures(root.sportsWorld)[0];
 assert.equal(selectSportsClub(root,'alex',m.home).ok,true);
 tickHousehold(root,m.kickoff-root.minutes+12);
 root.autonomy.enabled=true;root.otherSim.autonomy.enabled=true;
 root.needs={...root.needs,hunger:85,energy:85,bladder:85,hygiene:85,fun:40};
 root.sportsFan.fanIntensity=100;
 return {root,m};
};
test('R1-E opted-in fan may voluntarily prefer LIVE match only when rested and free',()=>{
 const {root,m}=setup();
 const before=JSON.stringify(root);
 const intent=sportsAutoIntent(root,'alex');
 assert.equal(intent?.matchId,m.id);
 assert.equal(intent?.tvId,'home-tv-1');
 assert.equal(residentAutonomousChoice(root,'alex'),'tv');
 // Rendering a candidate is pure: no bonus, salary, queue or mood receipt.
 assert.equal(JSON.stringify(root.sportsFan),JSON.stringify(JSON.parse(before).sportsFan));
});
test('R1-E critical needs, paused, manual queues, active calls and work block sports autoplay',()=>{
 const {root}=setup();
 root.needs.hunger=12;assert.equal(sportsAutoIntent(root,'alex'),null);
 root.needs.hunger=85;root.paused=true;assert.equal(sportsAutoIntent(root,'alex'),null);
 root.paused=false;
 root.actionQueues.byResident.alex.push({seq:1,type:'object',actionId:'fridge',targetInstanceId:'home-fridge-1'});
 assert.equal(sportsAutoIntent(root,'alex'),null);
 root.actionQueues.byResident.alex=[];
 root.phoneCalls.active={id:1};assert.equal(sportsAutoIntent(root,'alex'),null);
 root.phoneCalls.active=null;
 root.careerSystem.byResident.alex={currentShift:{phase:'working'}};
 assert.equal(sportsAutoIntent(root,'alex'),null);
});
test('R1-E a successfully initiated physical sports watch stores just one bounded intent across reload',()=>{
 const {root,m}=setup(),intent=sportsAutoIntent(root,'alex');
 assert.ok(intent);
 root.action={id:'tv',phase:'walking',targetInstanceId:intent.tvId,automatic:true};
 assert.equal(recordSportsAutoStart(root,'alex',intent.matchId,intent.tvId),true);
 assert.equal(root.sportsFan.lastAutoMatchId,m.id);
 assert.equal(recordSportsAutoStart(root,'alex',intent.matchId,intent.tvId),false);
 root.action=null;
 assert.equal(sportsAutoIntent(root,'alex'),null);
 const saved=loadHousehold(JSON.parse(JSON.stringify(root)),'2026-11-22');
 assert.equal(saved.sportsFan.lastAutoMatchId,m.id);
 assert.equal(sportsAutoIntent(saved,'alex'),null);
});
test('R1-E canceled/fake TV attempts do not consume a fan intent',()=>{
 const {root,m}=setup();
 assert.equal(recordSportsAutoStart(root,'alex',m.id,'home-tv-1'),false);
 assert.equal(root.sportsFan.lastAutoMatchId,null);
 root.action={id:'tv',phase:'walking',targetInstanceId:'nonexistent',automatic:true};
 assert.equal(recordSportsAutoStart(root,'alex',m.id,'nonexistent'),false);
 assert.equal(root.sportsFan.lastAutoMatchId,null);
});
test('R1-E actual spectator gets a once-only result emotion at final whistle without phone tap',()=>{
 const root=newHousehold('2026-11-22'),m=sportsFixtures(root.sportsWorld)[0];
 selectSportsClub(root,'alex',m.home);
 tickHousehold(root,m.end-root.minutes-7);
 root.paused=false;
 root.needs.hunger=83;root.needs.energy=83;
 root.action={id:'tv',phase:'using',elapsed:4,targetInstanceId:'home-tv-1',automatic:false};
 tickHousehold(root,8);
 assert.ok(root.sportsFan.lastReactedMatchIds.includes(m.id));
 assert.ok(root.mind.emotions.some(e=>e.source.startsWith('sports.')));
 const count=root.sportsFan.lastReactedMatchIds.length;
 tickHousehold(root,1);
 assert.equal(root.sportsFan.lastReactedMatchIds.length,count);
});
