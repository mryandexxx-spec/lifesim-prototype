/** F3a: a single, deliberately standing TV viewing slot per physical set.
 * A sofa/couch viewing contract is a separate F3b feature. No renderer imports.
 */
export const TV_APPROACH=Object.freeze({x:2.88,z:0.345});
export const TV_WATCH_POSE=Object.freeze({
  x:TV_APPROACH.x,y:0,z:TV_APPROACH.z,pitch:0,yaw:90
});
export const TV_WATCH_DURATION=36; // Game minutes; positive Fun only during actual use.
export const TV_FRAME_SECONDS=3.0;
/** A television only lights when a resident really uses THAT saved instance.
 * No fictional reward for entering editing mode, clicking a screen or buying it.
 */
export function tvScreenFrame(residents,instanceId,activeSeconds=0,socialAction=null){
  if(typeof instanceId!=='string'||!instanceId)return {on:false,frame:0};
  const sharedOn=socialAction?.phase==='using'&&
    socialAction.shared?.mode==='leisure'&&
    socialAction.shared.choiceId==='tv'&&
    socialAction.shared.tvConsent===true&&
    socialAction.shared.tvPlan?.tvId===instanceId;
  const on=Boolean(sharedOn)||(Array.isArray(residents)&&residents.some(resident=>{
    const action=resident?.action;
    return action?.id==='tv'&&action.phase==='using'&&
      (action.targetInstanceId===instanceId||
        (!action.targetInstanceId&&instanceId==='home-tv-1'));
  }));
  const elapsed=Number.isFinite(activeSeconds)?Math.max(0,activeSeconds):0;
  return {on:Boolean(on),frame:on?Math.floor(elapsed/TV_FRAME_SECONDS)%3:0};
}
