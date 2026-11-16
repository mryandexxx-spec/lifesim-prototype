/** R5c: optional two-person sofa evening, independent of PlayCanvas and save root.
 * Ordinary sofa relaxation and F3b television continue to reserve the WHOLE sofa.
 * A consented romantic evening alone may use two distinct physical cushion slots.
 */
import {SOFA_APPROACH,SOFA_POSE} from './pose-config.js';
import {furniturePoint} from './furniture-transform.js';

export const ROMANTIC_SOFA_SIDE_OFFSET=.635;
const finite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&
  Math.abs(p.x)<=4.75&&Math.abs(p.z)<=4.1;
const close=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=.012;
const items=world=>world?.furniture?.instances;
const sofaFor=(world,id)=>items(world)?.find(i=>i.instanceId===id&&
  i.prefabId==='sofa'&&i.location==='home'&&
  Number.isFinite(i.x)&&Number.isFinite(i.z)&&[0,90,180,270].includes(i.yaw))||null;
/** index 0 is the physical right-hand cushion when sofa yaw=0. */
export const romanticSofaSlotOffset=index=>
  index===0?ROMANTIC_SOFA_SIDE_OFFSET:index===1?-ROMANTIC_SOFA_SIDE_OFFSET:null;
export function romanticSofaApproach(world,sofaId,index){
  const dx=romanticSofaSlotOffset(index);
  return dx===null?null:furniturePoint(world,'sofa',
    {x:SOFA_APPROACH.x+dx,z:SOFA_APPROACH.z},sofaId);
}
export function romanticSofaSeat(world,sofaId,index){
  const dx=romanticSofaSlotOffset(index);
  return dx===null?null:furniturePoint(world,'sofa',
    {x:SOFA_POSE.x+dx,y:SOFA_POSE.y,z:SOFA_POSE.z,yaw:SOFA_POSE.yaw},sofaId);
}
function cost(route,start){
  let previous=start,total=0;
  for(const point of route){total+=Math.hypot(point.x-previous.x,point.z-previous.z);previous=point;}
  return total;
}
export function planRomanticEveningSofa(world,actor,partner,pathfinder,{blockedIds=[]}={}){
  if(!Array.isArray(items(world))||!finite(actor)||!finite(partner)||
    typeof pathfinder!=='function')return null;
  const busy=new Set(blockedIds),candidates=[];
  for(const item of items(world)){
    if(!sofaFor(world,item.instanceId)||busy.has(item.instanceId))continue;
    for(const [actorSlot,partnerSlot] of [[0,1],[1,0]]){
      const a=romanticSofaApproach(world,item.instanceId,actorSlot);
      const b=romanticSofaApproach(world,item.instanceId,partnerSlot);
      const seatA=romanticSofaSeat(world,item.instanceId,actorSlot);
      const seatB=romanticSofaSeat(world,item.instanceId,partnerSlot);
      if(!finite(a)||!finite(b)||!seatA||!seatB||
        Math.hypot(a.x-b.x,a.z-b.z)<1.2||
        Math.hypot(seatA.x-seatB.x,seatA.z-seatB.z)<1.2)continue;
      const actorRoute=pathfinder(actor,a,world);
      const partnerRoute=pathfinder(partner,b,world);
      if(!Array.isArray(actorRoute)||!Array.isArray(partnerRoute))continue;
      candidates.push({score:cost(actorRoute,actor)+cost(partnerRoute,partner),
        stage:{instanceId:item.instanceId,sofaX:item.x,sofaZ:item.z,
          sofaYaw:item.yaw,actorSlot,partnerSlot,
          actor:{...a},partner:{...b}},actorRoute,partnerRoute});
    }
  }
  candidates.sort((a,b)=>a.score-b.score);
  return candidates[0]||null;
}
/** Reject arbitrary coordinates, removed furniture or two actors in same slot. */
export function validRomanticEveningSofa(world,stage){
  if(!stage||typeof stage!=='object'||Array.isArray(stage)||
    ![0,1].includes(stage.actorSlot)||![0,1].includes(stage.partnerSlot)||
    stage.actorSlot===stage.partnerSlot)return false;
  const sofa=sofaFor(world,stage.instanceId);
  if(!sofa||!close(stage.sofaX,sofa.x)||!close(stage.sofaZ,sofa.z)||
    stage.sofaYaw!==sofa.yaw||!finite(stage.actor)||!finite(stage.partner))return false;
  const a=romanticSofaApproach(world,sofa.instanceId,stage.actorSlot);
  const b=romanticSofaApproach(world,sofa.instanceId,stage.partnerSlot);
  return a&&b&&close(stage.actor.x,a.x)&&close(stage.actor.z,a.z)&&
    close(stage.partner.x,b.x)&&close(stage.partner.z,b.z);
}
/** Visual-only snapshot; cannot grant consent, gameplay rewards or teleportation. */
export function romanticEveningSofaFrame(social,world,{eligible=true}={}){
  const active=eligible===true&&social?.phase==='using'&&
    social?.branchAction?.id==='romance.evening'&&
    social.branchAction.eveningConsent===true&&
    validRomanticEveningSofa(world,social.eveningSofa);
  return {active,sofaId:active?social.eveningSofa.instanceId:null,
    actorSlot:active?social.eveningSofa.actorSlot:null,
    partnerSlot:active?social.eveningSofa.partnerSlot:null};
}
