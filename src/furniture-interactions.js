/** F4E: capabilities for actual purchased household utility furniture.
 * Headless, deterministic and save-v1 compatible. Rendering is a separate
 * adapter: this file never imports PlayCanvas or touches the DOM.
 */
export const UTILITY_FURNITURE=Object.freeze({
  lamp:Object.freeze({prefabId:'floorlamp',label:'Переключить свет',
    duration:5,frontZ:-.90,capability:'light.switch'}),
  mirror:Object.freeze({prefabId:'mirror',label:'Причесаться у зеркала',
    duration:17,frontZ:-.88,capability:'appearance.groom'}),
  dresser:Object.freeze({prefabId:'dresser',label:'Осмотреть комод',
    duration:16,frontZ:-1.06,capability:'storage.inspect'}),
  wardrobe:Object.freeze({prefabId:'wardrobe',label:'Разобрать гардероб',
    duration:22,frontZ:-1.20,capability:'clothing.organize'})
});
export const UTILITY_ACTION_IDS=Object.freeze(Object.keys(UTILITY_FURNITURE));
export const MIRROR_SPEECH_DURATION=24;
export const MIRROR_SPEECH_XP=18;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,Number.isFinite(x)?x:a));
const smooth=n=>{const t=clamp(n,0,1);return t*t*(3-2*t);};
export function isUtilityAction(id){return Object.hasOwn(UTILITY_FURNITURE,id);}
/** Show a real open/close transaction only while actually using THIS item.
 * First fifth: open; middle: work with it; final fifth: close, then release.
 */
export function furnitureUseWeight(action,instanceId){
  if(!action||!isUtilityAction(action.id)||action.id==='lamp'||
     action.phase!=='using'||action.targetInstanceId!==instanceId)return 0;
  const duration=action.id==='mirror'&&action.mirrorPractice===true
    ?MIRROR_SPEECH_DURATION:UTILITY_FURNITURE[action.id].duration;
  const t=clamp(action.elapsed/duration,0,1);
  return smooth(t/.22)*smooth((1-t)/.22);
}
export function furnitureUseOccupancy(actors,item){
  if(!item||item.location!=='home')return {actionId:null,weight:0};
  let weight=0,actionId=null;
  for(const actor of actors||[]){
    const a=actor?.action;
    if(a?.id!==item.prefabId&&
       !(item.prefabId==='floorlamp'&&a?.id==='lamp'))continue;
    if(a?.targetInstanceId!==item.instanceId)continue;
    const w=furnitureUseWeight(a,item.instanceId);
    if(w>weight){weight=w;actionId=a.id;}
  }
  return {actionId,weight};
}
const instances=world=>world?.furniture?.instances||world?.instances||[];
/** Only after arrival; never on enqueue, during walking, or while paused.
 * Both change and receipt are persisted together in the existing v1 JSON.
 */
export function switchLampAtArrival(world,actor){
  const a=actor?.action;
  if(a?.id!=='lamp'||a.phase!=='using'||a.lampSwitched===true)return false;
  const fixture=instances(world).find(i=>i.instanceId===a.targetInstanceId&&
    i.prefabId==='floorlamp'&&i.location==='home');
  if(!fixture)return false;
  fixture.lampOn=!Boolean(fixture.lampOn);
  a.lampSwitched=true;
  const store=world?.furniture?.instances?world.furniture:world;
  if(Number.isSafeInteger(store?.revision)&&store.revision<1e9)store.revision++;
  return true;
}
export function lampIsOn(world,instanceId){
  return Boolean(instances(world).find(i=>i.instanceId===instanceId&&
    i.prefabId==='floorlamp'&&i.location==='home')?.lampOn);
}
