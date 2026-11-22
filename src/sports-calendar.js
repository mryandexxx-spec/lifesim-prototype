/** FANDOM-R1: game-time Wed/Sat double round robin, no wall-clock dependencies. */
import {SPORTS_TEAMS,SPORTS_DURATION} from './sports-catalog.js';
import {calendarAt,civilToSerial} from './calendar-core.js';

// Keeping club zero stationary is the circle method. Each pair meets once per leg.
export function sportsSchedule(seasonStartDay,seasonId=0){
  if(!Number.isSafeInteger(seasonStartDay)||seasonStartDay<0||
    !Number.isSafeInteger(seasonId)||seasonId<0)return [];
  const teams=SPORTS_TEAMS.map(t=>t.id),fixtures=[];
  let ring=[...teams];
  for(let round=0;round<10;round++){
    if(round===5)ring=[...teams];
    const local=round%5;
    const weekdays=round%2===0?2:5;
    const startHours=round%2===0?[15,17,19]:[12,14,16];
    for(let slot=0;slot<3;slot++){
      const host=ring[slot],visitor=ring[5-slot],reverse=round>=5;
      const home=reverse?visitor:host,away=reverse?host:visitor;
      const kickoff=(seasonStartDay+Math.floor(round/2)*7+weekdays)*1440+
        startHours[slot]*60;
      fixtures.push({id:seasonId+'-'+round+'-'+slot,seasonId,round,slot,
        home,away,kickoff,end:kickoff+SPORTS_DURATION});
    }
    ring=[ring[0],ring[5],ring[1],ring[2],ring[3],ring[4]];
    void local;
  }
  return fixtures;
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
