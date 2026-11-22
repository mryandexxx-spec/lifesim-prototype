/** FANDOM-R2-C: verified, bounded shared match memories.
 * This module never updates Fun, Social, relationship, money or mind/emotions.
 * One canonical television, two physically separated voluntary occupants,
 * validated game-time live fixture, no phone-only faux receipts.
 */
import {sportsFixtures} from './sports-league.js';
import {liveSharedTv,validSharedTvPlan} from './tv-together.js';
import {sharedDuration} from './gifts-leisure.js';
import {residentUnavailableForHome} from './career-work.js';
export const SPORTS_SHARED_MINUTES=15;
export const SPORTS_SHARED_HISTORY_LIMIT=8;
const validNumber=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=10000000;
const record=v=>v&&typeof v==='object'&&!Array.isArray(v);
const fixtureId=s=>typeof s==='string'&&/^\d+-\d+-[0-2]$/.test(s);
const MAX_WATCH=32;
const close=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)<.36;
const actorsInPlace=(root,plan)=>['alex','mira'].every(id=>{
 const actor=id==='alex'?root:root.otherSim;
 const target=plan.places[id];
 return actor?.position&&target&&[actor.position.x,actor.position.z,
   target.x,target.z].every(Number.isFinite)&&close(actor.position,target);
});
export const newSportsSharedWatch=()=>({schema:1,active:null,memories:[]});
const currentFixture=(root,id)=>sportsFixtures(root?.sportsWorld).find(m=>m.id===id)||null;
function safeMemory(raw,root){
 if(!record(raw)||!fixtureId(raw.matchId)||!validNumber(raw.at)||
   raw.at>root.minutes||!validNumber(raw.watchedMinutes)||
   raw.watchedMinutes<SPORTS_SHARED_MINUTES||raw.watchedMinutes>MAX_WATCH||
   !Number.isSafeInteger(raw.seasonId)||raw.seasonId<0||
   raw.seasonId>root.sportsWorld?.seasonId||
   typeof raw.tvId!=='string'||!/^[a-z][a-z0-9-]{2,63}$/.test(raw.tvId)||
   !raw.matchId.startsWith(raw.seasonId+'-'))return null;
 const m=raw.seasonId===root.sportsWorld?.seasonId
   ?currentFixture(root,raw.matchId):null;
 const old=raw.seasonId<root.sportsWorld?.seasonId&&
   (root.sportsWorld.history||[]).some(h=>h.seasonId===raw.seasonId);
 if(!m&&!old)return null;
 if(m&&(raw.at<m.kickoff+SPORTS_SHARED_MINUTES||raw.at>m.end))return null;
 return {matchId:raw.matchId,seasonId:raw.seasonId,
   tvId:raw.tvId,at:raw.at,watchedMinutes:raw.watchedMinutes};
}
function sessionEvidence(root){
 const s=root?.socialAction,plan=liveSharedTv(root);
 if(!plan||s?.automatic===true||s?.phase!=='using'||root?.paused||
   root?.phoneCalls?.active||
   residentUnavailableForHome(root,'alex')||residentUnavailableForHome(root,'mira')||
   !validSharedTvPlan(root,plan,s.initiator)||!actorsInPlace(root,plan))return null;
 if(!validNumber(s.elapsed)||s.elapsed>=sharedDuration(s.shared))return null;
 return {plan,elapsed:s.elapsed,
   startedAt:Math.round((root.minutes-s.elapsed)*1000000)/1000000,
   duration:sharedDuration(s.shared)};
}
export function restoreSportsSharedWatch(raw,root){
 const state=newSportsSharedWatch();
 if(!record(raw)||raw.schema!==1||!root?.sportsWorld||!validNumber(root.minutes))
   return state;
 const seen=new Set();
 for(const v of (Array.isArray(raw.memories)?raw.memories:[]).slice(-64)){
   const safe=safeMemory(v,root);
   if(!safe||seen.has(safe.matchId))continue;
   seen.add(safe.matchId);state.memories.push(safe);
 }
 state.memories=state.memories.sort((a,b)=>a.at-b.at)
   .slice(-SPORTS_SHARED_HISTORY_LIMIT);
 const e=sessionEvidence(root),a=raw.active;
 if(!e||!record(a)||!fixtureId(a.matchId)||
   !validNumber(a.watchedMinutes)||a.watchedMinutes>=SPORTS_SHARED_MINUTES||
   !validNumber(a.startedAt)||Math.abs(a.startedAt-e.startedAt)>.002||
   a.tvId!==e.plan.tvId)return state;
 const match=currentFixture(root,a.matchId);
 if(!match||root.minutes<match.kickoff||root.minutes>=match.end||
   a.watchedMinutes>Math.min(e.elapsed,root.minutes-match.kickoff)+.002||
   seen.has(a.matchId))return state;
 state.active={matchId:match.id,tvId:e.plan.tvId,
   startedAt:e.startedAt,watchedMinutes:a.watchedMinutes};
 return state;
}
/** Caller invokes BEFORE the one household tick. Cap by both remaining
 * physical shared session and remaining real fixture, never generic TV time.
 */
export function observeSharedSportsWatch(root,minutes){
 if(!root||!root.sportsWorld||!validNumber(root.minutes)||
   !Number.isFinite(minutes)||minutes<=0||minutes>10000000)return false;
 if(!record(root.sportsSharedWatch)||root.sportsSharedWatch.schema!==1)
   root.sportsSharedWatch=newSportsSharedWatch();
 const state=root.sportsSharedWatch;
 const s=sessionEvidence(root);
 if(!s){state.active=null;return false;}
 const now=root.minutes;
 const match=sportsFixtures(root.sportsWorld).find(m=>m.kickoff<=now&&now<m.end);
 if(!match){state.active=null;return false;}
 if(state.memories.some(memory=>memory.matchId===match.id)){
   state.active=null;return false;
 }
 const seen=Math.min(minutes,s.duration-s.elapsed,match.end-now);
 if(seen<=0){state.active=null;return false;}
 const active=state.active&&state.active.matchId===match.id&&
   state.active.tvId===s.plan.tvId&&
   Math.abs(state.active.startedAt-s.startedAt)<.002
   ?state.active:null;
 const watchedMinutes=Math.min(MAX_WATCH,(active?.watchedMinutes||0)+seen);
 if(watchedMinutes<SPORTS_SHARED_MINUTES){
   state.active={matchId:match.id,tvId:s.plan.tvId,
     startedAt:s.startedAt,watchedMinutes};
   return false;
 }
 state.active=null;
 const memory={matchId:match.id,seasonId:root.sportsWorld.seasonId,
   tvId:s.plan.tvId,at:now+seen,watchedMinutes};
 state.memories=[...state.memories,memory].slice(-SPORTS_SHARED_HISTORY_LIMIT);
 return true;
}
