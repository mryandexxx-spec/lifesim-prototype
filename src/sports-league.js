/** FANDOM-R1: deterministic, offline and headless league state. No DOM or PlayCanvas. */
import {SPORTS_SCHEMA,SPORTS_LEAGUE_ID,SPORTS_SEASON_DAYS,SPORTS_TEAMS,sportsTeam} from './sports-catalog.js';
import {sportsSchedule} from './sports-calendar.js';
import {calendarAt,civilToSerial,weekdayFromSerial} from './calendar-core.js';
const DAY=1440,MAX_MINUTES=10000000;
const integer=(x,a=0,b=MAX_MINUTES)=>Number.isSafeInteger(x)&&x>=a&&x<=b;
const record=x=>x&&typeof x==='object'&&!Array.isArray(x);
const key=x=>String(x);
const hashes=(s)=>{
  let h=2166136261;
  for(const ch of String(s)){h=Math.imul(h^ch.charCodeAt(0),16777619);}
  return h>>>0;
};
const draw=(seed,id,kind)=>hashes(seed+'|'+id+'|'+kind);
const seedNext=seed=>(Math.imul(seed,1664525)+1013904223)>>>0;
const byKickoff=(a,b)=>a.kickoff-b.kickoff||a.slot-b.slot;
export const sportsFixtures=world=>world&&integer(world.seasonStartDay,0,7000)&&
  integer(world.seasonId,0,1000)
  ?sportsSchedule(world.seasonStartDay,world.seasonId):[];

/** Exact same goal timeline for replay, time acceleration, reload, closed apps. */
export function sportsMatchTimeline(world,m){
  if(!world||!m||!sportsTeam(m.home)||!sportsTeam(m.away))return [];
  const timeline=[
    {minute:6,type:'kick',label:'Начало атаки'},
    {minute:22,type:'chance',label:'Опасный момент'},
    {minute:39,type:'save',label:'Сейв вратаря'},
    {minute:61,type:'pass',label:'Комбинация'},
    {minute:82,type:'corner',label:'Угловой удар'},
    {minute:97,type:'counter',label:'Быстрая контратака'}
  ];
  for(const [side,team] of [['home',m.home],['away',m.away]]){
    const strength=sportsTeam(team).strength;
    const goals=Math.min(3,(draw(world.seed,m.id,side+'-goals')%3)+
      (strength>=53&&draw(world.seed,m.id,side+'-boost')%4===0?1:0));
    for(let n=0;n<goals;n++){
      const picked=10+(draw(world.seed,m.id,side+'-minute-'+n)%79);
      const minute=picked<45?picked:picked+15;
      timeline.push({minute,type:'goal',side,label:'Гол · '+sportsTeam(team).short,
        key:m.id+':'+side+':'+n});
    }
  }
  return timeline.sort((a,b)=>a.minute-b.minute||
    (a.type==='goal'?-1:b.type==='goal'?1:0)||
    String(a.key||a.type).localeCompare(String(b.key||b.type)));
}
const finalScore=(world,m)=>{
  const goals=sportsMatchTimeline(world,m).filter(x=>x.type==='goal');
  return [goals.filter(x=>x.side==='home').length,goals.filter(x=>x.side==='away').length];
};
/** Future results never appear in the UI read model. */
export function matchAt(world,id,now){
  const m=sportsFixtures(world).find(x=>x.id===id);
  if(!m||!Number.isFinite(now))return null;
  if(now<m.kickoff)return {...m,state:'upcoming',score:null,minute:0,events:[]};
  const elapsed=Math.max(0,Math.min(now-m.kickoff,m.end-m.kickoff));
  const events=sportsMatchTimeline(world,m).filter(e=>e.minute<=elapsed);
  const score=[events.filter(e=>e.type==='goal'&&e.side==='home').length,
    events.filter(e=>e.type==='goal'&&e.side==='away').length];
  return {...m,state:now>=m.end?'completed':'live',score,minute:Math.min(90,elapsed<=45?elapsed:elapsed-15),
    events};
}
export function newSportsWorld(root){
  const minutes=Number.isFinite(root?.minutes)?Math.max(0,root.minutes):480;
  const iso=calendarAt(root.calendar,minutes).iso;
  const day=Math.floor(minutes/DAY),weekday=weekdayFromSerial(civilToSerial(iso));
  return {schema:SPORTS_SCHEMA,leagueId:SPORTS_LEAGUE_ID,seasonId:0,
    seasonStartDay:day+(7-weekday)%7,
    seed:hashes(iso+'|'+day+'|blins-sports-v1')||1,
    results:[],history:[]};
}
export function standings(world){
  const board=new Map(SPORTS_TEAMS.map(t=>[t.id,
    {teamId:t.id,played:0,wins:0,draws:0,losses:0,for:0,against:0,points:0}]));
  const byId=new Map(sportsFixtures(world).map(m=>[m.id,m]));
  for(const receipt of world?.results||[]){
    const m=byId.get(receipt.id);
    if(!m||!integer(receipt.home,0,9)||!integer(receipt.away,0,9))continue;
    const a=board.get(m.home),b=board.get(m.away);
    if(!a||!b)continue;
    a.played++;b.played++;
    a.for+=receipt.home;a.against+=receipt.away;
    b.for+=receipt.away;b.against+=receipt.home;
    if(receipt.home===receipt.away){a.draws++;b.draws++;a.points++;b.points++;}
    else if(receipt.home>receipt.away){a.wins++;a.points+=3;b.losses++;}
    else{b.wins++;b.points+=3;a.losses++;}
  }
  return [...board.values()].sort((a,b)=>b.points-a.points||
    (b.for-b.against)-(a.for-a.against)||b.for-a.for||a.teamId.localeCompare(b.teamId));
}
export function restoreSportsWorld(raw,root){
  if(!record(raw)||raw.schema!==1||raw.leagueId!==SPORTS_LEAGUE_ID||
    !integer(raw.seasonId,0,1000)||!integer(raw.seasonStartDay,0,7000)||
    !integer(raw.seed,1,4294967295))return newSportsWorld(root);
  const data={schema:1,leagueId:SPORTS_LEAGUE_ID,seasonId:raw.seasonId,
    seasonStartDay:raw.seasonStartDay,seed:raw.seed,results:[],history:[]};
  const fixtures=new Map(sportsFixtures(data).map(m=>[m.id,m]));
  const seen=new Set(),now=root?.minutes??0;
  for(const r of (Array.isArray(raw.results)?raw.results:[]).slice(0,90)){
    const m=fixtures.get(r?.id);
    if(!m||seen.has(m.id)||m.end>now)continue;
    const [home,away]=finalScore(data,m);
    if(r.home!==home||r.away!==away)continue;
    seen.add(m.id);data.results.push({id:m.id,home,away,at:m.end});
  }
  data.results.sort((a,b)=>fixtures.get(a.id).end-fixtures.get(b.id).end);
  const history=Array.isArray(raw.history)?raw.history.slice(-3):[];
  data.history=history.filter(h=>record(h)&&integer(h.seasonId,0,1000)&&
    h.seasonId<data.seasonId&&sportsTeam(h.championId)&&
    integer(h.matches,0,30)).map(h=>({
      seasonId:h.seasonId,championId:h.championId,matches:h.matches
    }));
  return data;
}
/** One advance per household tick, no UI or per-person effect. */
export function advanceSportsWorld(root){
  if(!root||!Number.isFinite(root.minutes)||root.paused)return [];
  if(!root.sportsWorld)root.sportsWorld=newSportsWorld(root);
  let world=root.sportsWorld,now=root.minutes,completed=[];
  // 10m game minutes allow < 170 seasons; guard protects damaged saves.
  for(let i=0;i<250&&now>=(world.seasonStartDay+SPORTS_SEASON_DAYS)*DAY;i++){
    const fixtures=sportsFixtures(world);
    const seen=new Set(world.results.map(r=>r.id));
    for(const m of fixtures)if(!seen.has(m.id)&&m.end<=now){
      const [home,away]=finalScore(world,m);
      world.results.push({id:m.id,home,away,at:m.end});
      completed.push(m.id);seen.add(m.id);
    }
    world.results.sort((a,b)=>fixtures.find(x=>x.id===a.id).end-
      fixtures.find(x=>x.id===b.id).end);
    const table=standings(world);
    world.history=[...world.history,{
      seasonId:world.seasonId,championId:table[0].teamId,matches:world.results.length
    }].slice(-3);
    world={schema:1,leagueId:SPORTS_LEAGUE_ID,seasonId:world.seasonId+1,
      seasonStartDay:world.seasonStartDay+SPORTS_SEASON_DAYS,
      seed:seedNext(world.seed)||1,results:[],history:world.history};
    root.sportsWorld=world;
  }
  const seen=new Set(world.results.map(r=>r.id));
  for(const m of sportsFixtures(world)){
    if(m.end>now)break;
    if(seen.has(m.id))continue;
    const [home,away]=finalScore(world,m);
    world.results.push({id:m.id,home,away,at:m.end});
    completed.push(m.id);seen.add(m.id);
  }
  return completed;
}
