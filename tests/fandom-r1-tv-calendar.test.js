import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,tickHousehold,loadHousehold} from '../src/household.js';
import {sportsFixtures,matchAt} from '../src/sports-league.js';
import {sportsTvFrame,sportsWatchOpportunity,paintSportsTv} from '../src/sports-tv.js';
import {calendarAgendaSummary} from '../src/calendar-ui.js';
import {calendarAt} from '../src/calendar-core.js';

const fresh=()=>newHousehold('2026-01-01');
const live=()=>{
  const root=fresh(),match=sportsFixtures(root.sportsWorld)[0];
  tickHousehold(root,match.kickoff-root.minutes+42);
  return {root,match};
};
test('R1-C sports cannot activate television when nobody physically uses a real purchased TV',()=>{
 const {root,match}=live();
 const before=JSON.stringify(root);
 assert.equal(sportsTvFrame(root,'home-tv-1'),null);
 assert.equal(sportsTvFrame(root,'not-installed'),null);
 assert.equal(JSON.stringify(root),before);
 assert.equal(sportsWatchOpportunity(root)?.matchId,match.id);
});
test('R1-C an actual using-phase viewer sees only currently elapsed sports events',()=>{
 const {root,match}=live();
 root.action={id:'tv',phase:'walking',elapsed:0,targetInstanceId:'home-tv-1',automatic:false};
 assert.equal(sportsTvFrame(root,'home-tv-1'),null);
 root.action.phase='using';
 const screen=sportsTvFrame(root,'home-tv-1');
 assert.equal(screen.matchId,match.id);
 assert.equal(screen.state,'live');
 assert.deepEqual(screen.score,matchAt(root.sportsWorld,match.id,root.minutes).score);
 assert.ok(screen.events.every(e=>e.minute<=root.minutes-match.kickoff));
 assert.equal(sportsTvFrame(root,'nonexistent'),null);
});
test('R1-C 2D broadcast paints original field on a mock canvas without DOM/WebGL',()=>{
 const {root}=live();
 root.action={id:'tv',phase:'using',elapsed:4,targetInstanceId:'home-tv-1',automatic:false};
 const screen=sportsTvFrame(root,'home-tv-1'),ops=[];
 const ctx=new Proxy({}, {get:(_,key)=>{
   if(key==='canvas')return {width:512,height:312};
   return (...args)=>ops.push([key,...args]);
 },set:(_,key,value)=>{ops.push(['set',key,value]);return true;}});
 assert.equal(paintSportsTv(ctx,screen,512,312),true);
 assert.ok(ops.some(x=>x[0]==='fillRect'));
 assert.ok(ops.some(x=>x[0]==='fillText'));
});
test('R1-C match read-only calendar appears next to shifts without adding user events',()=>{
 const root=fresh(),first=sportsFixtures(root.sportsWorld)[0];
 const date=calendarAt(root.calendar,first.kickoff).iso;
 const before=JSON.stringify(root.calendar);
 const agenda=calendarAgendaSummary(root,date);
 assert.equal(agenda.sports.length,3);
 assert.equal(agenda.sports[0].readonly,true);
 assert.equal(JSON.stringify(root.calendar),before);
 const loaded=loadHousehold(JSON.parse(JSON.stringify(root)),'2026-01-01');
 assert.equal(calendarAgendaSummary(loaded,date).sports.length,3);
});
test('R1-C screen stops after match and does not invent a new match, a save event or extra Fun',()=>{
 const {root,match}=live();
 root.action={id:'tv',phase:'using',elapsed:10,targetInstanceId:'home-tv-1',automatic:false};
 const before=root.needs.fun;
 assert.ok(sportsTvFrame(root,'home-tv-1'));
 assert.equal(root.needs.fun,before);
 tickHousehold(root,match.end-root.minutes+1);
 assert.equal(sportsTvFrame(root,'home-tv-1'),null);
 assert.equal(root.needs.fun<=100,true);
});
