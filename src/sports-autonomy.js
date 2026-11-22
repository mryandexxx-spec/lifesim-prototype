/** FANDOM-R1: optional bounded real-TV interest, never a free action or reward.
 * Pure eligibility check; once-only intent receipt after physical action starts.
 */
import {sportsFixtures} from './sports-league.js';
import {sportsWatchOpportunity} from './sports-tv.js';
import {pendingActions} from './action-queue.js';
import {residentUnavailableForHome} from './career-work.js';
const actor=(root,id)=>id==='alex'?root:id==='mira'?root?.otherSim:null;
const validNow=n=>Number.isFinite(n)&&n>=0&&n<=10000000;
const safeHash=(seed,id)=>{
 let h=2166136261;
 for(const ch of String(seed)+'|'+String(id))h=Math.imul(h^ch.charCodeAt(0),16777619);
 return h>>>0;
};
export function sportsAutoIntent(root,id){
 const person=actor(root,id),fan=person?.sportsFan,now=root?.minutes;
 if(!person||!fan?.favoriteTeamId||fan.fanIntensity<30||
   !root.autonomy?.enabled||root.paused||!validNow(now)||root.socialAction||
   root.phoneCalls?.active||person.action||residentUnavailableForHome(root,id)||
   pendingActions(root.actionQueues,id).length||
   (Number.isFinite(person.autonomy?.nextAt)&&now<person.autonomy.nextAt)||
   (Number.isFinite(fan.nextAutoAt)&&now<fan.nextAutoAt))return null;
 if(Math.min(...['hunger','energy','bladder','hygiene'].map(
   need=>person.needs?.[need]??100))<38)return null;
 const opportunity=sportsWatchOpportunity(root);
 if(!opportunity||opportunity.remaining<20||
   fan.lastAutoMatchId===opportunity.matchId)return null;
 const match=sportsFixtures(root.sportsWorld).find(x=>x.id===opportunity.matchId);
 if(!match||![match.home,match.away].includes(fan.favoriteTeamId))return null;
 const roll=safeHash(root.sportsWorld.seed,match.id+':'+id+':interest')%100;
 if(roll>=fan.fanIntensity)return null;
 return {matchId:match.id,tvId:opportunity.tvId,remaining:opportunity.remaining};
}
/** One marker ONLY after the ordinary A*/FIFI physical TV action was accepted.
 * No direct Fun/social benefit, no queue insertion, no time advancement here.
 */
export function recordSportsAutoStart(root,id,matchId,tvId){
 const person=actor(root,id),fan=person?.sportsFan,act=person?.action,now=root?.minutes;
 if(!fan||!act||act.id!=='tv'||act.automatic!==true||
   act.targetInstanceId!==tvId||!validNow(now)||
   fan.lastAutoMatchId===matchId)return false;
 const opportunity=sportsWatchOpportunity(root);
 const match=sportsFixtures(root.sportsWorld).find(m=>m.id===matchId);
 if(!opportunity||opportunity.tvId!==tvId||opportunity.matchId!==matchId||
   !match||![match.home,match.away].includes(fan.favoriteTeamId))return false;
 fan.lastAutoMatchId=matchId;
 fan.lastAutoAt=now;
 fan.nextAutoAt=Math.min(10000000,now+120);
 return true;
}
