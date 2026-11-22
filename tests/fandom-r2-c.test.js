import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold} from '../src/household.js';
import {sportsFixtures} from '../src/sports-league.js';
import {planSharedTv} from '../src/tv-together.js';
import {newSportsSharedWatch,restoreSportsSharedWatch,
  observeSharedSportsWatch} from '../src/sports-shared-watch.js';
const copy=x=>JSON.parse(JSON.stringify(x));
function ready(){
 const root=newHousehold('2026-11-22'),m=sportsFixtures(root.sportsWorld)[0];
 const plan=planSharedTv(root,'alex','home-tv-1');
 assert.ok(plan,'real separate two-person physical positions');
 root.minutes=m.kickoff+7;root.otherSim.minutes=root.minutes;
 root.position={x:plan.places.alex.x,z:plan.places.alex.z};
 root.otherSim.position={x:plan.places.mira.x,z:plan.places.mira.z};
 root.socialAction={kind:'talk',initiator:'alex',partner:'mira',phase:'using',
   elapsed:0,automatic:false,shared:{mode:'leisure',choiceId:'tv',
     tvConsent:true,tvPlan:plan}};
 root.sportsSharedWatch=newSportsSharedWatch();
 return {root,m,plan};
}
test('R2-C only real two-place, consenting and current-match shared TV yields one bounded memory, no second rewards',()=>{
 const {root,m,plan}=ready();
 const money=root.shop.credits,fun=[root.needs.fun,root.otherSim.needs.fun],
   social=[root.needs.social,root.otherSim.needs.social],
   relation=root.relationship.affinity;
 assert.equal(observeSharedSportsWatch(root,8),false);
 root.minutes+=8;root.otherSim.minutes=root.minutes;root.socialAction.elapsed=8;
 assert.equal(observeSharedSportsWatch(root,8),true);
 root.minutes+=8;root.otherSim.minutes=root.minutes;root.socialAction.elapsed=16;
 assert.equal(root.sportsSharedWatch.memories.length,1);
 assert.equal(root.sportsSharedWatch.memories[0].matchId,m.id);
 assert.equal(root.sportsSharedWatch.memories[0].tvId,plan.tvId);
 assert.equal(observeSharedSportsWatch(root,7),false);
 assert.equal(root.sportsSharedWatch.memories.length,1);
 assert.equal(root.shop.credits,money);
 assert.deepEqual([root.needs.fun,root.otherSim.needs.fun],fun);
 assert.deepEqual([root.needs.social,root.otherSim.needs.social],social);
 assert.equal(root.relationship.affinity,relation);
 const restored=loadHousehold(copy(root),'2026-11-22');
 assert.equal(restored.sportsSharedWatch.memories.length,1);
 assert.equal(restored.version,1);
 assert.equal(restored.shop.credits,money);
});
test('R2-C queued, refused, paused, removed TV, wrong position and cancelled sessions cannot credit',()=>{
 for(const change of [
   root=>{root.socialAction.phase='walking';},
   root=>{delete root.socialAction.shared.tvConsent;},
   root=>{root.paused=true;},
   root=>{root.world.furniture.instances=root.world.furniture.instances.filter(x=>x.prefabId!=='tv');},
   root=>{root.position={x:-2.4,z:1.2};},
   root=>{root.socialAction=null;},
   root=>{root.phoneCalls.active={type:'call'};}
 ]){
   const {root}=ready();change(root);
   assert.equal(observeSharedSportsWatch(root,20),false);
   assert.equal(root.sportsSharedWatch.memories.length,0);
 }
});
test('R2-C anti-replay guards forged future history and stale mid-watch save, preserves old root-v1',()=>{
 const {root,m}=ready();
 root.minutes+=24;root.otherSim.minutes=root.minutes;
 assert.deepEqual(restoreSportsSharedWatch(undefined,root),newSportsSharedWatch());
 root.sportsSharedWatch={schema:1,active:null,memories:[
    {matchId:m.id,seasonId:0,tvId:'home-tv-1',at:root.minutes+1000,watchedMinutes:20},
    {matchId:'999-99-0',seasonId:999,tvId:'home-tv-1',at:root.minutes,watchedMinutes:20},
    {matchId:m.id,seasonId:0,tvId:'home-tv-1',at:root.minutes,watchedMinutes:16},
    {matchId:m.id,seasonId:0,tvId:'home-tv-1',at:root.minutes,watchedMinutes:20}
 ]};
 const restored=restoreSportsSharedWatch(root.sportsSharedWatch,root);
 assert.equal(restored.memories.length,1);
 assert.equal(restored.memories[0].matchId,m.id);
 const old=copy(root);delete old.sportsSharedWatch;
 assert.deepEqual(loadHousehold(old,'2026-11-22').sportsSharedWatch,newSportsSharedWatch());
});
