/** FANDOM-R2-B: original per-club geometric icon, no outside artwork. */
import {SPORTS_TEAMS,sportsTeam} from './sports-catalog.js';
const symbols=Object.freeze(['◈','✦','⬡','◆','✺','▰']);
export function sportsCrest(teamId){
 const team=sportsTeam(teamId);
 if(!team)return null;
 const index=SPORTS_TEAMS.findIndex(t=>t.id===team.id);
 return Object.freeze({teamId:team.id,name:team.name,color:team.color,
   symbol:symbols[index],initials:team.short.slice(0,2)});
}
