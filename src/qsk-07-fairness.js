/** QSK-07: deterministic, session-local FIFO and A* recovery guards.
 * Game minutes, not wall-clock or render frames. Guards are NOT saved:
 * pending and parked intentions use the existing validated save-v1 queues.
 */
export const QUEUE_ROUTE_MAX_FAILURES=4;
export const RESOURCE_WAIT_MINUTES=45;
export const WALK_STALL_MINUTES=3;
export const WALK_PROGRESS_METERS=.06;
export const WALK_MAX_STALLS=3;
const safeTime=n=>Number.isFinite(n)&&n>=0?n:0;
const position=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z)
  ?{x:p.x,z:p.z}:null;

export function newQueuedHeadGuard(){
  return {seq:null,reason:null,firstAt:0,attempts:0,retryAt:0};
}
export function resetQueuedHeadGuard(guard){
  Object.assign(guard,newQueuedHeadGuard());
}
/** Busy resources wait for their occupant; broken static routes get
 * exponentially spaced retries before an explicit-retry tray takes over.
 * No queue is mutated inside this decision function.
 */
export function inspectQueuedHead(guard,seq,reason,now){
  if(!Number.isSafeInteger(seq)||seq<1||typeof reason!=='string')return 'ignored';
  const at=safeTime(now);
  if(guard.seq!==seq||guard.reason!==reason)
    Object.assign(guard,{seq,reason,firstAt:at,attempts:0,retryAt:at});
  if(at<guard.retryAt)return 'backoff';
  if(reason==='resource-busy'){
    guard.retryAt=at+1;
    return at-guard.firstAt>=RESOURCE_WAIT_MINUTES?'park':'waiting-for-resource';
  }
  guard.attempts=Math.min(QUEUE_ROUTE_MAX_FAILURES,guard.attempts+1);
  if(guard.attempts>=QUEUE_ROUTE_MAX_FAILURES){
    guard.retryAt=at+8; // parked-tray overflow must not spin on A*
    return 'park';
  }
  guard.retryAt=at+Math.pow(2,guard.attempts-1);
  return 'backoff';
}
export function newWalkGuard(){
  return {action:null,anchor:null,still:0,stalls:0,retryAt:0};
}
export function resetWalkGuard(guard){
  Object.assign(guard,newWalkGuard());
}
/** Observe cumulative meaningful progress, ignoring tiny per-frame changes.
 * Suspended/pause steps (minutes=0) cannot increment the timeout.
 */
export function inspectWalkingAction(guard,action,location,minutes,now,{routeValid=true}={}){
  if(!action||action.phase!=='walking'){
    resetWalkGuard(guard);return 'inactive';
  }
  const here=position(location);
  if(!here)return 'invalid-position';
  const at=safeTime(now);
  if(guard.action!==action){
    Object.assign(guard,{action,anchor:here,still:0,stalls:0,retryAt:at});
    return 'tracking';
  }
  if(guard.anchor&&Math.hypot(guard.anchor.x-here.x,guard.anchor.z-here.z)
    >=WALK_PROGRESS_METERS){
    guard.anchor=here;guard.still=0;guard.stalls=0;guard.retryAt=at;
    return 'progress';
  }
  if(at<guard.retryAt)return 'backoff';
  guard.still+=routeValid?(Number.isFinite(minutes)?Math.max(0,minutes):0)
    :WALK_STALL_MINUTES;
  if(guard.still<WALK_STALL_MINUTES)return 'tracking';
  guard.still=0;
  guard.stalls=Math.min(WALK_MAX_STALLS,guard.stalls+1);
  if(guard.stalls>=WALK_MAX_STALLS){
    guard.retryAt=at+8; // defer recovery if saved review tray is full
    return 'exhausted';
  }
  guard.retryAt=at+Math.pow(2,guard.stalls-1);
  return 'backoff';
}
export function walkingRetryAllowed(guard,action,now){
  return guard.action!==action||safeTime(now)>=guard.retryAt;
}
