import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,tickHousehold,loadHousehold} from '../src/household.js';
import {sportsFixtures} from '../src/sports-league.js';
import {selectSportsClub,readSportsNews} from '../src/sports-fandom.js';
import {PHONE_APPS,phoneAppRoute} from '../src/phone-app-registry.js';
import {sportsPhoneView} from '../src/sports-phone-model.js';

const home=()=>newHousehold('2026-11-22');
test('R1-D adds fifth original sports phone app without changing G routes',()=>{
 assert.deepEqual(PHONE_APPS.map(a=>a.id),['work','food','finance','calls','sports']);
 for(const id of ['work','food','finance','calls','sports'])assert.equal(phoneAppRoute(id),id);
 assert.equal(phoneAppRoute('__proto__'),'home');
});
test('R1-D phone projection is entirely read-only on a new unassigned household',()=>{
 const root=home(),previous=JSON.stringify(root),view=sportsPhoneView(root,'alex');
 assert.equal(view.favoriteTeamId,null);
 assert.equal(view.table.length,6);
 assert.ok(view.upcoming.length>=3);
 assert.equal(view.live,null);
 assert.deepEqual(view.results,[]);
 assert.equal(JSON.stringify(root),previous);
});
test('R1-D club, live-score and nonrevealed later match data use only game time',()=>{
 const root=home(),m=sportsFixtures(root.sportsWorld)[0];
 selectSportsClub(root,'alex',m.home);
 const initial=sportsPhoneView(root,'alex');
 assert.equal(initial.favoriteTeamId,m.home);
 assert.equal(initial.results.length,0);
 assert.ok(initial.upcoming[0].score===null);
 tickHousehold(root,m.kickoff-root.minutes+37);
 const during=sportsPhoneView(root,'alex');
 assert.equal(during.live?.matchId,m.id);
 assert.ok(during.live?.score?.every(v=>v>=0&&v<=4));
 assert.equal(during.upcoming.some(x=>x.matchId===m.id),false);
 assert.ok(during.watch?.tvId,'existing TV can be offered for actual physical interaction');
});
test('R1-D saved completed receipts appear once with opt-in fan reaction',()=>{
 const root=home(),m=sportsFixtures(root.sportsWorld)[0];
 selectSportsClub(root,'alex',m.home);
 tickHousehold(root,m.end-root.minutes+1);
 const view=sportsPhoneView(root,'alex');
 assert.equal(view.live,null);
 assert.equal(view.results[0].matchId,m.id);
 assert.ok(view.results[0].score);
 assert.equal(view.unread.length,1);
 assert.equal(readSportsNews(root,'alex',m.id).ok,true);
 assert.equal(sportsPhoneView(root,'alex').unread.length,0);
 const loaded=loadHousehold(JSON.parse(JSON.stringify(root)),'2026-11-22');
 assert.equal(sportsPhoneView(loaded,'alex').unread.length,0);
});
test('R1-D proposed match-watch action does not become a false reward while paused or without installed TV',()=>{
 const root=home(),m=sportsFixtures(root.sportsWorld)[0];
 tickHousehold(root,m.kickoff-root.minutes+1);
 root.paused=true;
 assert.equal(sportsPhoneView(root,'alex').watch,null);
 root.paused=false;
 root.world.furniture.instances=root.world.furniture.instances.filter(x=>x.prefabId!=='tv');
 assert.equal(sportsPhoneView(root,'alex').watch,null);
});
