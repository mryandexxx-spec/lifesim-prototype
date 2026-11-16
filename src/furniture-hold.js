/**
 * F2.0: deliberate furniture grab, independent of PlayCanvas and DOM.
 *
 * A ray hit only *arms* a possible pickup. Until the same pointer is held for
 * 500ms with <10 CSS px cumulative movement, camera gestures keep priority.
 * A second finger, lost focus, edit-mode exit or pointercancel calls cancel().
 * This state is transient; never store it in the household's v1 save.
 */
export const FURNITURE_HOLD_MS=500;
export const FURNITURE_HOLD_SLOP_PX=10;
const finite=n=>Number.isFinite(n);
const point=p=>p&&finite(p.x)&&finite(p.y)&&finite(p.id)?p:null;

export function createFurnitureHoldGesture(){
  let pending=null;
  const cancel=()=>{const had=Boolean(pending);pending=null;return had;};
  function begin(p,instanceId,time){
    if(!point(p)||typeof instanceId!=='string'||!instanceId.trim()||
      !finite(time)){cancel();return false;}
    pending={pointerId:p.id,instanceId,originX:p.x,originY:p.y,
      x:p.x,y:p.y,travel:0,startedAt:time,active:false};
    return true;
  }
  function move(p){
    if(!pending||!point(p)||p.id!==pending.pointerId)return 'ignored';
    pending.travel+=Math.hypot(p.x-pending.x,p.y-pending.y);
    pending.x=p.x;pending.y=p.y;
    if(!pending.active&&pending.travel>=FURNITURE_HOLD_SLOP_PX){
      cancel();return 'camera';
    }
    return pending.active?'drag':'pending';
  }
  function activate(now){
    if(!pending||pending.active||!finite(now)||
      now-pending.startedAt<FURNITURE_HOLD_MS||
      pending.travel>=FURNITURE_HOLD_SLOP_PX)return null;
    pending.active=true;
    return {pointerId:pending.pointerId,instanceId:pending.instanceId,
      x:pending.x,y:pending.y,id:pending.pointerId};
  }
  function end(p){
    if(!pending||!point(p)||p.id!==pending.pointerId)return null;
    const active=pending.active,instanceId=pending.instanceId;
    cancel();
    return {kind:active?'drop':'tap',instanceId};
  }
  return {begin,move,activate,end,cancel,
    get pending(){return Boolean(pending)&&!pending.active;},
    get active(){return Boolean(pending?.active);},
    get pointerId(){return pending?.pointerId??null;}
  };
}
