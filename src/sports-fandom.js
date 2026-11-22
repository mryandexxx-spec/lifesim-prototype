/** FANDOM-R1: opted-in football identity, once-only emotional news and voluntary talk.
 * Uses verified sports receipts, one existing mind and one social graph.
 */
import {sportsTeam} from './sports-catalog.js';
import {sportsFixtures} from './sports-league.js';
import {feelMemory} from './emotion-engine.js';
import {refreshMind} from './psychology.js';
const LIMIT=32,CHANGE_COOLDOWN=7*1440,TALK_COOLDOWN=60,MAX_TIME=10000000;
const validTime=n=>Number.isFinite(n)&&n>=0&&n<=MAX_TIME;
const record=x=>x&&typeof x==='object'&&!Array.isArray(x);
const ids=['alex','mira'];
const actor=(root,id)=>id==='mira'?root?.otherSim:id==='alex'?root:null;
const matchId=id=>typeof id==='string'&&/^\d+-\d+-[0-2]$/.test(id);
export const newSportsFan=()=>({schema:1,favoriteTeamId:null,fanIntensity:0,
  followSince:null,nextChangeAt:0,lastReactedMatchIds:[],lastDiscussedAt:null});
export function restoreSportsFan(raw,now=0){
  const fan=newSportsFan();
  if(!record(raw)||raw.schema!==1||!validTime(now))return fan;
  if(!sportsTeam(raw.favoriteTeamId))return fan;
  fan.favoriteTeamId=raw.favoriteTeamId;
  fan.fanIntensity=Number.isFinite(raw.fanIntensity)
    ?Math.max(0,Math.min(100,Math.round(raw.fanIntensity))):40;
  fan.followSince=validTime(raw.followSince)&&raw.followSince<=now?raw.followSince:now;
  fan.nextChangeAt=validTime(raw.nextChangeAt)&&
    raw.nextChangeAt<=now+CHANGE_COOLDOWN
    ?raw.nextChangeAt:now;
  const seen=new Set();
  if(Array.isArray(raw.lastReactedMatchIds))
    for(const value of raw.lastReactedMatchIds.slice(-LIMIT*3))
      if(matchId(value))seen.add(value);
  fan.lastReactedMatchIds=[...seen].slice(-LIMIT);
  fan.lastDiscussedAt=validTime(raw.lastDiscussedAt)&&raw.lastDiscussedAt<=now
    ?raw.lastDiscussedAt:null;
  return fan;
}
export function selectSportsClub(root,id,teamId){
  const resident=actor(root,id),now=root?.minutes;
  if(!resident||!validTime(now)||root.paused)return {ok:false,reason:'unavailable'};
  if(teamId!==null&&!sportsTeam(teamId))return {ok:false,reason:'unknown-club'};
  const fan=resident.sportsFan||newSportsFan();
  if(fan.favoriteTeamId===teamId)return {ok:false,reason:'unchanged'};
  if(fan.favoriteTeamId!==null&&now<fan.nextChangeAt)
    return {ok:false,reason:'cooldown',until:fan.nextChangeAt};
  resident.sportsFan={schema:1,favoriteTeamId:teamId,
    fanIntensity:teamId?40:0,followSince:teamId?now:null,
    nextChangeAt:now+CHANGE_COOLDOWN,
    lastReactedMatchIds:[],lastDiscussedAt:fan.lastDiscussedAt??null};
  return {ok:true,teamId};
}
/** A read is an explicit in-world news interaction, not a passive UI render.
 * Only completed authoritative results after becoming a fan may react.
 */
export function readSportsNews(root,id,selectedMatchId=null){
  const resident=actor(root,id),now=root?.minutes,fan=resident?.sportsFan;
  if(!resident||!fan?.favoriteTeamId||!root?.sportsWorld||root.paused||!validTime(now))
    return {ok:false,reason:'unavailable'};
  const fixtures=new Map(sportsFixtures(root.sportsWorld).map(m=>[m.id,m]));
  const eligible=(root.sportsWorld.results||[]).filter(result=>{
    const m=fixtures.get(result.id);
    return m&&m.end<=now&&m.kickoff>=fan.followSince&&
      [m.home,m.away].includes(fan.favoriteTeamId)&&
      !fan.lastReactedMatchIds.includes(m.id)&&
      (selectedMatchId===null||selectedMatchId===m.id);
  }).sort((a,b)=>fixtures.get(b.id).end-fixtures.get(a.id).end);
  const chosen=eligible[0],match=chosen&&fixtures.get(chosen.id);
  if(!match)return {ok:false,reason:'no-new-match'};
  const goals=fan.favoriteTeamId===match.home
    ?[chosen.home,chosen.away]:[chosen.away,chosen.home];
  const emotion=goals[0]>goals[1]?'sports.win':
    goals[0]<goals[1]?'sports.loss':'sports.draw';
  const memory={id:emotion,at:now,fulfilled:false};
  resident.minutes=now;
  if(!Array.isArray(resident.mind?.memories))return {ok:false,reason:'mind-unavailable'};
  resident.mind.memories=[...resident.mind.memories,memory].slice(-12);
  if(feelMemory(resident,memory)){
    const entry=resident.mind.emotions.find(e=>e.source===emotion&&e.at===now);
    if(entry)entry.intensity=Math.max(20,Math.min(85,
      Math.round(entry.intensity*(.75+fan.fanIntensity/200))));
  }
  fan.lastReactedMatchIds=[...fan.lastReactedMatchIds,match.id].slice(-LIMIT);
  fan.fanIntensity=Math.min(100,fan.fanIntensity+2);
  resident.event=emotion==='sports.win'?'Радуется победе любимого клуба':
    emotion==='sports.loss'?'Расстроился из-за поражения клуба':
    'Размышляет о ничьей';
  refreshMind(resident,root.world);
  return {ok:true,matchId:match.id,emotion};
}
/** Participants can discuss a verified recent score, even if one is a non-fan.
 * The physical dialogue is handled by the existing path+consent system.
 */
export function sportsConversationReady(root){
  if(!root||root.paused||!validTime(root.minutes)||!root.sportsWorld?.results?.length)
    return false;
  return ids.every(id=>{
    const resident=actor(root,id),since=resident?.sportsFan?.lastDiscussedAt;
    return resident&&(!validTime(since)||root.minutes-since>=TALK_COOLDOWN);
  });
}
export function recordSportsDiscussion(root){
  if(!root||!validTime(root.minutes))return false;
  for(const id of ids){
    const sim=actor(root,id);
    if(!sim?.sportsFan)sim.sportsFan=newSportsFan();
    sim.sportsFan.lastDiscussedAt=root.minutes;
  }
  return true;
}
