import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,tickHousehold,loadHousehold} from '../src/household.js';
import {SPORTS_LEAGUES,sportsLeague,SPORTS_LEAGUE_ID,SPORTS_TEAMS} from '../src/sports-catalog.js';
import {sportsSchedule,sportsScheduleForLeague} from '../src/sports-calendar.js';
import {sportsFixtures,matchAt} from '../src/sports-league.js';
import {sportsTvFrame,sportsBroadcastFrame,paintSportsTv} from '../src/sports-tv.js';
import {sportsPhoneView} from '../src/sports-phone-model.js';

test('R2-A retains historical six-team fixture identity while exposing extensible league registry',()=>{
  assert.equal(SPORTS_LEAGUES.length,1,'do not invent unapproved active leagues');
  assert.equal(sportsLeague(SPORTS_LEAGUE_ID)?.teams.length,6);
  assert.deepEqual(sportsScheduleForLeague(sportsLeague(SPORTS_LEAGUE_ID),42,9),
    sportsSchedule(42,9),'all old IDs, times, slots and home/away legs remain stable');
  const fixtures=sportsSchedule(42,9);
  assert.equal(fixtures.length,30);
  assert.equal(fixtures[0].id,'9-0-0');
  assert.equal(new Set(fixtures.map(x=>x.id)).size,30);
});
test('R2-A generalized offline double round-robin supports independent 4/8-team leagues',()=>{
  for(const count of [4,8]){
    const teams=Array.from({length:count},(_,i)=>({id:'club-'+i,name:'Клуб '+i,short:'К'+i,
      color:'#345678',strength:50}));
    const league={id:'future-league-'+count,teams,duration:105};
    const schedule=sportsScheduleForLeague(league,14,3);
    assert.equal(schedule.length,count*(count-1));
    assert.equal(new Set(schedule.map(x=>x.id)).size,schedule.length);
    assert.ok(schedule.every(x=>x.id.startsWith(league.id+':')));
    const pairs=new Map();
    for(const item of schedule){
      const key=[item.home,item.away].sort().join('|');
      pairs.set(key,(pairs.get(key)||0)+1);
      assert.equal(item.end-item.kickoff,105);
    }
    assert.equal(pairs.size,count*(count-1)/2);
    assert.ok([...pairs.values()].every(n=>n===2));
    const rounds=new Set(schedule.map(x=>x.round));
    assert.equal(rounds.size,2*(count-1));
    for(const round of rounds){
      const members=schedule.filter(x=>x.round===round).flatMap(x=>[x.home,x.away]);
      assert.equal(new Set(members).size,count);
    }
  }
  assert.deepEqual(sportsScheduleForLeague({id:'bad',teams:[SPORTS_TEAMS[0]],duration:105},0,0),[]);
});
test('R2-A mobile feed renders current offline match without a TV, a fake action or free Fun',()=>{
  const root=newHousehold('2026-11-22'),m=sportsFixtures(root.sportsWorld)[0];
  root.autonomy.enabled=false;
  root.otherSim.autonomy.enabled=false;
  tickHousehold(root,m.kickoff-root.minutes+32);
  root.world.furniture.instances=root.world.furniture.instances.filter(i=>i.prefabId!=='tv');
  const before=JSON.stringify(root),fun=root.needs.fun;
  const frame=sportsBroadcastFrame(root);
  assert.equal(frame?.matchId,m.id);
  assert.equal(frame?.state,'live');
  assert.equal(frame?.minute,matchAt(root.sportsWorld,m.id,root.minutes).minute);
  assert.deepEqual(frame?.score,matchAt(root.sportsWorld,m.id,root.minutes).score);
  assert.equal(sportsPhoneView(root,'alex')?.broadcast?.matchId,m.id);
  assert.equal(sportsTvFrame(root,'home-tv-1'),null,'physical TV still requires owned and used set');
  const seen=[];
  const ctx=new Proxy({}, {get:(_,key)=>(...a)=>seen.push([key,...a]),
    set:(_,key,value)=>{seen.push([key,value]);return true;}});
  assert.equal(paintSportsTv(ctx,frame),true);
  assert.ok(seen.some(x=>x[0]==='fillRect'));
  assert.equal(JSON.stringify(root),before);
  assert.equal(root.needs.fun,fun);
  const restored=loadHousehold(JSON.parse(before),'2026-11-22');
  assert.deepEqual(sportsBroadcastFrame(restored)?.score,frame.score);
  tickHousehold(root,m.end-root.minutes+1);
  assert.equal(sportsBroadcastFrame(root),null,'no fabricated future broadcasts');
  assert.equal(sportsPhoneView(root,'alex')?.broadcast,null);
});
