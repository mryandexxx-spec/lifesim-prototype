/** R2a adult-only intimate privacy scene, rendered exclusively as fade-to-black.
 * No explicit animation, renderer dependency, DOM, or save schema mutation.
 */
import {BED_SLOTS} from './bed-layout.js';
import {furniturePoint} from './furniture-transform.js';
import {findPath} from './navigation.js';

export const INTIMACY_DURATION_MINUTES=30;
export const INTIMACY_REFUSAL_DURATION_MINUTES=3;

const distance=(from,route)=>{
  let total=0,prev=from;
  for(const step of route){total+=Math.hypot(step.x-prev.x,step.z-prev.z);prev=step;}
  return total;
};

/** Two distinct reachable halves of a present double bed are mandatory.
 * A furniture move/removal invalidates this plan; no room coordinates are
 * stored on the romance graph or conjured by the view layer.
 */
export function intimacyBedPlan(root,initiator='alex'){
  if(initiator!=='alex'&&initiator!=='mira')return null;
  const instances=root?.world?.furniture?.instances;
  const bed=Array.isArray(instances)?instances.find(i=>i.prefabId==='bed'&&i.location==='home'):null;
  if(!bed||!root?.otherSim?.position||!root?.position)return null;
  const actor=initiator==='alex'?root:root.otherSim;
  const partner=initiator==='alex'?root.otherSim:root;
  let chosen=null;
  for(const [mine,theirs] of [['left','right'],['right','left']]){
    const a=furniturePoint(root.world,'bed',BED_SLOTS[mine].approach,bed.instanceId);
    const b=furniturePoint(root.world,'bed',BED_SLOTS[theirs].approach,bed.instanceId);
    if(!a||!b)continue;
    const routeA=findPath(actor.position,a,root.world);
    const routeB=findPath(partner.position,b,root.world);
    if(!routeA||!routeB)continue;
    const cost=distance(actor.position,routeA)+distance(partner.position,routeB);
    if(!chosen||cost<chosen.cost)
      chosen={bedId:bed.instanceId,actor:{x:a.x,z:a.z},partner:{x:b.x,z:b.z},cost};
  }
  if(!chosen)return null;
  return {bedId:chosen.bedId,actor:chosen.actor,partner:chosen.partner};
}

/** The blackout is cosmetic: engine eligibility and canonical events live
 * in romance.js / relationships.js, never in the animation layer.
 */
export function intimacyFrame(social){
  const active=social?.phase==='using'&&
    social.branchAction?.id==='romance.intimacy'&&
    social.branchAction.intimacyConsent===true&&
    Number.isFinite(social.elapsed);
  return {active:Boolean(active),
    progress:active?Math.max(0,Math.min(1,social.elapsed/INTIMACY_DURATION_MINUTES)):0};
}
