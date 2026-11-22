/** FANDOM-R1-D: read-only sports phone projection, one authoritative sportsWorld.
 * No browser, DOM, hidden future scores, payment or timeline writes.
 */
import {SPORTS_TEAMS,sportsTeam} from './sports-catalog.js';
import {sportsFixtures,matchAt,standings} from './sports-league.js';
import {sportsWatchOpportunity} from './sports-tv.js';
import {calendarAt} from './calendar-core.js';
const names={alex:'Алекс',mira:'Мира'};
const formatTime=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const selectActor=(root,id)=>id==='mira'?root?.otherSim:id==='alex'?root:null;
export function sportsPhoneView(root,id){
 if(!root?.sportsWorld||!root.calendar||!names[id]||!Number.isFinite(root.minutes))return null;
 const now=root.minutes,fan=selectActor(root,id)?.sportsFan;
 const fixtures=sportsFixtures(root.sportsWorld);
 const byId=new Map(fixtures.map(m=>[m.id,m]));
 const resultMap=new Map((root.sportsWorld.results||[]).map(r=>[r.id,r]));
 const club=fan?.favoriteTeamId||null;
 const watched=new Set(fan?.lastReactedMatchIds||[]);
 const formatMatch=(m)=>{
  const verified=resultMap.get(m.id);
  const active=now>=m.kickoff&&now<m.end;
  const current=active?matchAt(root.sportsWorld,m.id,now):null;
  const score=verified?[verified.home,verified.away]:current?.score||null;
  const date=calendarAt(root.calendar,m.kickoff).iso;
  return {matchId:m.id,homeId:m.home,awayId:m.away,
   home:sportsTeam(m.home)?.short,away:sportsTeam(m.away)?.short,
   kickoff:m.kickoff,iso:date,time:formatTime(m.kickoff%1440),
   score,state:verified?'completed':active?'live':'upcoming',
   minute:current?.minute??null};
 };
 const live=fixtures.find(m=>m.kickoff<=now&&now<m.end);
 const upcoming=fixtures.filter(m=>m.kickoff>now).slice(0,8).map(formatMatch);
 const finished=fixtures.filter(m=>resultMap.has(m.id)).slice(-8).reverse();
 const results=finished.map(formatMatch);
 const unread=club===null?[]:finished.filter(m=>
  [m.home,m.away].includes(club)&&m.kickoff>=(fan?.followSince??Infinity)&&
  !watched.has(m.id)).map(formatMatch);
 const table=standings(root.sportsWorld).map((x,i)=>({...x,
  place:i+1,teamName:sportsTeam(x.teamId)?.name||x.teamId,
  color:sportsTeam(x.teamId)?.color||'#999'}));
 const nextFavorite=club?fixtures.find(m=>m.kickoff>now&&[m.home,m.away].includes(club)):null;
 return {seasonId:root.sportsWorld.seasonId,teams:SPORTS_TEAMS,
  selectedResident:id,residentName:names[id],favoriteTeamId:club,
  favorite:club?sportsTeam(club):null,
  fanIntensity:fan?.fanIntensity??0,
  canChangeClub:!fan?.favoriteTeamId||now>=(fan?.nextChangeAt??0),
  changeCooldown:Math.max(0,Math.ceil((fan?.nextChangeAt??0)-now)),
  table,live:live?formatMatch(live):null,
  watch:sportsWatchOpportunity(root),
  upcoming,results,unread,
  nextFavorite:nextFavorite?formatMatch(nextFavorite):null,
  seasonHistory:Array.isArray(root.sportsWorld.history)
   ?root.sportsWorld.history.slice(-3).reverse():[]};
}
