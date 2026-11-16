/** R5b: optional furniture-aware meeting, independent of PlayCanvas/DOM.
 * Both residents use ordinary A*; no position, reward or consent is changed here.
 * If a table has no TWO valid, reachable sides the R5a meeting still works.
 */
import {rotateLocal} from './furniture-catalog.js';

const positions=Object.freeze([
  [[-1.24,0],[1.24,0]],
  [[0,-1.04],[0,1.04]]
]);
const finitePoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&
  Math.abs(p.x)<=4.75&&Math.abs(p.z)<=4.1;
const close=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=.012;
const items=world=>world?.furniture?.instances;
const tableFor=(world,id)=>items(world)?.find(i=>i.instanceId===id&&
  i.prefabId==='table'&&i.location==='home'&&
  Number.isFinite(i.x)&&Number.isFinite(i.z)&&[0,90,180,270].includes(i.yaw))||null;
function sides(table){
  return positions.map(([a,b])=>[a,b].map(([x,z])=>{
    const rotated=rotateLocal(x,z,table.yaw);
    return {x:table.x+rotated.x,z:table.z+rotated.z};
  }));
}
function cost(route,start){
  let pos=start,sum=0;
  for(const p of route){
    sum+=Math.hypot(p.x-pos.x,p.z-pos.z);pos=p;
  }
  return sum;
}
export function planRomanticEveningTable(world,actor,partner,pathfinder){
  if(!Array.isArray(items(world))||!finitePoint(actor)||!finitePoint(partner)||
    typeof pathfinder!=='function')return null;
  let winner=null,minCost=Infinity;
  for(const item of items(world)){
    const table=tableFor(world,item.instanceId);
    if(!table)continue;
    for(const [left,right] of sides(table)){
      for(const [a,b] of [[left,right],[right,left]]){
        if(!finitePoint(a)||!finitePoint(b)||Math.hypot(a.x-b.x,a.z-b.z)<1.6)continue;
        const actorRoute=pathfinder(actor,a,world);
        if(!Array.isArray(actorRoute))continue;
        const partnerRoute=pathfinder(partner,b,world);
        if(!Array.isArray(partnerRoute))continue;
        const total=cost(actorRoute,actor)+cost(partnerRoute,partner);
        if(total<minCost){
          minCost=total;
          winner={
            stage:{instanceId:table.instanceId,tableX:table.x,tableZ:table.z,
              tableYaw:table.yaw,actor:{...a},partner:{...b}},
            actorRoute,partnerRoute
          };
        }
      }
    }
  }
  return winner;
}
/** Validate independently on load: don't trust arbitrary saved coordinates.
 * A moved/stored table invalidates the stage without invalidating old saves.
 */
export function validRomanticEveningStage(world,stage){
  if(!stage||typeof stage!=='object'||Array.isArray(stage))return false;
  const table=tableFor(world,stage.instanceId);
  if(!table||!close(stage.tableX,table.x)||!close(stage.tableZ,table.z)||
    stage.tableYaw!==table.yaw||!finitePoint(stage.actor)||
    !finitePoint(stage.partner))return false;
  return sides(table).some(([a,b])=>
    (close(stage.actor.x,a.x)&&close(stage.actor.z,a.z)&&
     close(stage.partner.x,b.x)&&close(stage.partner.z,b.z))||
    (close(stage.actor.x,b.x)&&close(stage.actor.z,b.z)&&
     close(stage.partner.x,a.x)&&close(stage.partner.z,a.z)));
}
export function romanticEveningTableFrame(social,world,duration=30){
  const stage=social?.eveningStage;
  const active=social?.phase==='using'&&
    social?.branchAction?.id==='romance.evening'&&
    social.branchAction.eveningConsent===true&&
    validRomanticEveningStage(world,stage);
  const progress=active&&Number.isFinite(social.elapsed)&&duration>0
    ?Math.max(0,Math.min(1,social.elapsed/duration)):0;
  return {active,instanceId:active?stage.instanceId:null,progress};
}
