/** FANDOM-R1: game-time Wed/Sat double round robin, no wall-clock dependencies. */
import {SPORTS_LEAGUES} from './sports-catalog.js';
import {calendarAt,civilToSerial} from './calendar-core.js';

/** Any even-sized original league can be scheduled independently. Default v1
 * fixture IDs and kickoff clock values are intentionally byte-for-byte stable.
 * The league namespace is mandatory only for future competitions.
 */
export function sportsScheduleForLeague(league,seasonStartDay,seasonId=0){
  if(!Number.isSafeInteger(seasonStartDay)||seasonStartDay<0||
    !Number.isSafeInteger(seasonId)||seasonId<0||
    typeof league?.id!=='string'||!/^[a-z0-9-]+$/.test(league.id)||
    !Array.isArray(league.teams)||league.teams.length<4||
    league.teams.length>16||league.teams.length%2!==0||
    !Number.isSafeInteger(league.duration)||league.duration<1||league.duration>115)return [];
  const teams=league.teams.map(x=>x?.id);
  if(teams.some(id=>typeof id!=='string'||!/^[a-z0-9-]+$/.test(id))||
    new Set(teams).size!==teams.length)return [];
  const n=teams.length,roundsPerLeg=n-1,slots=n/2,fixtures=[];
  let ring=[...teams];
  for(let round=0;round<2*roundsPerLeg;round++){
    if(round===roundsPerLeg)ring=[...teams];
    const weekday=round%2===0?2:5;
    // Broadcasts are staggered in the same Wed/Sat game calendar.
    // Six-club R1 keeps exactly 15/17/19 and 12/14/16 kickoffs.
    const first=round%2===0?Math.max(7,15-2*Math.max(0,slots-3)):
      Math.max(6,12-2*Math.max(0,slots-3));
    for(let slot=0;slot<slots;slot++){
      const host=ring[slot],visitor=ring[n-1-slot],reverse=round>=roundsPerLeg;
      const home=reverse?visitor:host,away=reverse?host:visitor;
      const kickoff=(seasonStartDay+Math.floor(round/2)*7+weekday)*1440+
        (first+slot*2)*60;
      const id=league.legacyFixtureIds?seasonId+'-'+round+'-'+slot:
        league.id+':'+seasonId+'-'+round+'-'+slot;
      fixtures.push({id,seasonId,round,slot,home,away,
        kickoff,end:kickoff+league.duration});
    }
    ring=[ring[0],ring[n-1],...ring.slice(1,n-1)];
  }
  return fixtures;
}
/** Stable v1 API: preserves all 30 historical fixtures and receipt IDs. */
export function sportsSchedule(seasonStartDay,seasonId=0){
  return sportsScheduleForLeague(SPORTS_LEAGUES[0],seasonStartDay,seasonId);
}

/** Read-only virtual events; never allocate an entry in root.calendar.events. */
export function sportsCalendarEvents(world,calendar,fromISO,toISO=fromISO){
  if(!world||!calendar||typeof fromISO!=='string'||typeof toISO!=='string')return [];
  let lo,hi;
  try{lo=civilToSerial(fromISO);hi=civilToSerial(toISO);}
  catch{return [];}
  if(hi<lo)return [];
  return sportsSchedule(world.seasonStartDay,world.seasonId).filter(m=>{
    const day=civilToSerial(calendarAt(calendar,m.kickoff).iso);
    return day>=lo&&day<=hi;
  }).map(m=>({
    id:'sports-'+m.id,
    matchId:m.id,
    iso:calendarAt(calendar,m.kickoff).iso,
    start:m.kickoff%1440,end:m.end%1440,
    home:m.home,away:m.away,
    title:'⚽ Лига Блин’С',
    category:'sports',
    readonly:true
  }));
}
