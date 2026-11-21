/** DISH-R1: renderer-only placements of actual dirty dishes.
 * All quantities come from root.kitchen.dirtyDishes; never persist this plan.
 * Four fixed stacks per real kitchen station, at most 8 plates per stack.
 */
export const DISH_VISUAL_CAP=32;
export const DISH_AUTO_WASH_THRESHOLD=6;
const slots=Object.freeze([
  Object.freeze({x:-.37,z:.20}),
  Object.freeze({x:-.36,z:-.20}),
  Object.freeze({x:.35,z:-.20}),
  Object.freeze({x:.37,z:.20})
]);
export function dirtyDishVisualPlan(kitchen,world){
  const raw=kitchen?.dirtyDishes;
  const count=Number.isSafeInteger(raw)&&raw>=0?Math.min(DISH_VISUAL_CAP,raw):0;
  const surfaces=(world?.furniture?.instances||[])
    .filter(item=>item.location==='home'&&['sink','prep'].includes(item.prefabId)&&
      typeof item.instanceId==='string'&&Number.isFinite(item.x)&&
      Number.isFinite(item.z)&&[0,90,180,270].includes(item.yaw))
    .sort((a,b)=>(a.prefabId==='sink'?0:1)-(b.prefabId==='sink'?0:1)||
      a.instanceId.localeCompare(b.instanceId));
  if(!surfaces.length)return {count,visible:[],unplaced:count};
  // Keep the near sink visibly full before advancing to the preparation counter.
  // Once all home surfaces reach 32 plates, no more renderer entities can appear.
  const visible=[];
  for(let index=0;index<count;index++){
    const station=surfaces[Math.min(surfaces.length-1,Math.floor(index/16))];
    const localIndex=surfaces.length>1?index%16:index;
    const stack=Math.floor(localIndex/8),height=localIndex%8;
    const offset=slots[stack];
    // Every plate is centered above an existing furniture footprint, not an A* lane.
    const radians=station.yaw*Math.PI/180;
    const cos=Math.cos(radians),sin=Math.sin(radians);
    visible.push({
      instanceId:station.instanceId,
      x:station.x+offset.x*cos-offset.z*sin,
      y:(station.prefabId==='sink'?1.075:1.065)+height*.030,
      z:station.z+offset.x*sin+offset.z*cos,
      stack,height
    });
  }
  return {count,visible,unplaced:count-visible.length};
}
