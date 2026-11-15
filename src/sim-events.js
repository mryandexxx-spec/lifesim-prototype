/** Small, pure typed receipts. Gameplay completes an action before producing one. */
export const SIM_EVENT_TYPES=Object.freeze(['activity.completed','social.exchange','gift.given','project.created']);
const ACTION_IDS=new Set(['bed','fridge','shower','sofa','toilet']);
export function activityReceipt(actionId,atGameMinute){
  if(!ACTION_IDS.has(actionId)||!Number.isFinite(atGameMinute)||atGameMinute<0)return null;
  return Object.freeze({type:'activity.completed',atGameMinute,actionId,
    tags:Object.freeze([actionId])});
}
export function isSimEvent(value){
  return value!==null&&typeof value==='object'&&SIM_EVENT_TYPES.includes(value.type)&&
    Number.isFinite(value.atGameMinute)&&value.atGameMinute>=0;
}
