import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {SPORTS_TEAMS,SPORTS_DURATION} from '../src/sports-catalog.js';
import {sportsFixtures,matchAt,standings,advanceSportsWorld,restoreSportsWorld} from '../src/sports-league.js';
import {sportsCalendarEvents} from '../src/sports-calendar.js';
import {calendarAt,civilToSerial,weekdayFromSerial} from '../src/calendar-core.js';

const fixture=()=>newHousehold('2026-01-01');
test('R1-A uses six original allowlisted clubs and a deterministic ten-round two-leg league',()=>{
  assert.equal(SPORTS_TEAMS.length,6);
  assert.equal(new Set(SPORTS_TEAMS.map(t=>t.id)).size,6);
  const root=fixture(),matches=sportsFixtures(root.sportsWorld);
  assert.equal(matches.length,30);
  const games=new Map();
  for(const m of matches){
    assert.notEqual(m.home,m.away);assert.equal(m.end-m.kickoff,SPORTS_DURATION);
    games.set([m.home,m.away].sort().join(':'),(games.get([m.home,m.away].sort().join(':'))||0)+1);
  }
  assert.equal(games.size,15);assert.ok([...games.values()].every(n=>n===2));
  for(let r=0;r<10;r++){
    const round=matches.filter(m=>m.round===r);
    assert.equal(round.length,3);
    assert.equal(new Set(round.flatMap(m=>[m.home,m.away])).size,6);
  }
});
test('R1-A staggers fixtures on Wednesday and Saturday by the game calendar, no real time',()=>{
  const root=fixture(),ms=sportsFixtures(root.sportsWorld);
  for(const m of ms){
    const date=calendarAt(root.calendar,m.kickoff);
    const weekday=weekdayFromSerial(civilToSerial(date.iso));
    assert.equal(weekday,m.round%2===0?2:5);
    assert.deepEqual(ms.filter(x=>x.round===m.round).map(x=>x.kickoff%1440),
      m.round%2===0?[900,1020,1140]:[720,840,960]);
  }
  const example=ms[0],date=calendarAt(root.calendar,example.kickoff).iso;
  assert.equal(sportsCalendarEvents(root.sportsWorld,root.calendar,date,date).length,3);
  assert.equal(root.calendar.events.length,0); // sports never consumes user-event slots
});
test('R1-A never leaks future goals into the live match read model',()=>{
  const root=fixture(),m=sportsFixtures(root.sportsWorld)[0];
  assert.equal(matchAt(root.sportsWorld,m.id,m.kickoff-1).state,'upcoming');
  assert.equal(matchAt(root.sportsWorld,m.id,m.kickoff-1).score,null);
  assert.deepEqual(matchAt(root.sportsWorld,m.id,m.kickoff).score,[0,0]);
  assert.equal(matchAt(root.sportsWorld,m.id,m.end).state,'completed');
  assert.ok(matchAt(root.sportsWorld,m.id,m.end).events.length>=6);
});
test('R1-A completes each result exactly once even over jumps and repeated ticks',()=>{
  const root=fixture(),ms=sportsFixtures(root.sportsWorld);
  tickHousehold(root,ms[2].end-root.minutes+5);
  assert.equal(root.sportsWorld.results.length,3);
  const first=JSON.stringify(root.sportsWorld.results);
  advanceSportsWorld(root);
  assert.equal(JSON.stringify(root.sportsWorld.results),first);
  assert.equal(new Set(root.sportsWorld.results.map(x=>x.id)).size,3);
});
test('R1-A is independent of 1x / 3x clock chunking and persists all validated receipts',()=>{
  const a=fixture(),b=fixture(),end=sportsFixtures(a.sportsWorld)[18].end+4;
  tickHousehold(a,end-a.minutes);
  for(let n=0;n<3;n++)tickHousehold(b,(end-b.minutes)/(3-n));
  assert.deepEqual(a.sportsWorld.results,b.sportsWorld.results);
  const raw=JSON.parse(JSON.stringify(a));
  const loaded=loadHousehold(raw,'2026-01-01');
  assert.deepEqual(loaded.sportsWorld.results,a.sportsWorld.results);
  advanceSportsWorld(loaded);assert.deepEqual(loaded.sportsWorld.results,a.sportsWorld.results);
  assert.equal(loaded.version,1);
});
test('R1-A old root-v1 save gets new future Monday season without retroactive awards',()=>{
  const old=fixture();const first=sportsFixtures(old.sportsWorld)[0];
  tickHousehold(old,first.end+1440-old.minutes);
  const raw=JSON.parse(JSON.stringify(old));delete raw.sportsWorld;
  const load=loadHousehold(raw,'2026-01-01');
  assert.deepEqual(load.sportsWorld.results,[]);
  assert.ok(sportsFixtures(load.sportsWorld)[0].kickoff>load.minutes);
  assert.equal(load.version,1);
});
test('R1-A rejects duplicated, future, corrupted or forged receipts on restore',()=>{
  const root=fixture(),m=sportsFixtures(root.sportsWorld)[0];
  tickHousehold(root,m.end-root.minutes+1);
  const saved=JSON.parse(JSON.stringify(root.sportsWorld));
  const illegal={...saved,results:[saved.results[0],saved.results[0],
    {id:'none',home:100,away:100}]};
  const recovered=restoreSportsWorld(illegal,root);
  assert.equal(recovered.results.length,1);
  const forged={...saved,results:[{id:saved.results[0].id,home:99,away:99}]};
  assert.equal(restoreSportsWorld(forged,root).results.length,0);
});
test('R1-A table counts completed match receipts, not invisible future predictions',()=>{
  const root=fixture();
  assert.ok(standings(root.sportsWorld).every(t=>t.played===0&&t.points===0));
  const last=sportsFixtures(root.sportsWorld).at(-1);
  tickHousehold(root,last.end-root.minutes+1);
  const table=standings(root.sportsWorld);
  assert.equal(table.length,6);assert.ok(table.every(t=>t.played===10));
  assert.equal(table.reduce((sum,t)=>sum+t.played,0),60);
  assert.ok(table.every((t,i)=>i===0||table[i-1].points>=t.points));
});
test('R1-A pause never generates results, and 42-day season rollover retains bounded history',()=>{
  const root=fixture(),start=root.sportsWorld.seasonStartDay;
  root.paused=true;tickHousehold(root,42*1440);
  assert.equal(root.sportsWorld.results.length,0);
  root.paused=false;tickHousehold(root,84*1440);
  assert.equal(root.sportsWorld.seasonId,2);
  assert.equal(root.sportsWorld.seasonStartDay,start+84);
  assert.equal(root.sportsWorld.history.length,2);
  assert.equal(root.sportsWorld.results.length,0);
});
