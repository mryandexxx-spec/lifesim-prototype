/** LOT-B3: bench position, exclusive occupancy and deterministic night lighting.
 * Pure gameplay geometry; no PlayCanvas, DOM or duplicate simulation clock.
 */
import {OUTDOOR_CATALOG} from './outdoor-catalog.js';

export const OUTDOOR_BENCH_ITEM='garden.bench';
export const OUTDOOR_LIGHT_LIMIT=8;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
export function outdoorBench(world,instanceId){
  return (world?.outdoors?.features||[]).find(item=>
    item.instanceId===instanceId&&item.itemId===OUTDOOR_BENCH_ITEM)||null;
}
export function outdoorBenchApproach(world,instanceId){
  const bench=outdoorBench(world,instanceId);
  if(!bench)return null;
  const {depth}=OUTDOOR_CATALOG[OUTDOOR_BENCH_ITEM];
  const angle=bench.yaw*Math.PI/180;
  const front=-depth/2-.55;
  return {x:Math.round((bench.x-Math.sin(angle)*front)*1000)/1000,
    z:Math.round((bench.z+Math.cos(angle)*front)*1000)/1000};
}
export function outdoorBenchBusy(root,instanceId){
  return [root,root?.otherSim].some(actor=>
    (actor?.action?.id==='bench'&&actor.action.targetInstanceId===instanceId)||
    (actor?.action?.id==='dining'&&actor.action.diningSeatInstanceId===instanceId))||
    Object.values(root?.actionQueues?.byResident||{}).some(tasks=>
      Array.isArray(tasks)&&tasks.some(t=>
        t.type==='outdoor'&&t.instanceId===instanceId));
}
export function outdoorBenchAvailable(root,residentId,instanceId){
  if(!outdoorBench(root?.world,instanceId))return false;
  const other=residentId==='alex'?root?.otherSim:root;
  return !(other?.action?.id==='bench'&&other.action.targetInstanceId===instanceId) &&
    !(other?.action?.id==='dining'&&other.action.diningSeatInstanceId===instanceId);
}
const ease=x=>{const p=Math.max(0,Math.min(1,x));return p*p*(3-2*p);};
export function outdoorBenchPose(world,instanceId,progress){
  const bench=outdoorBench(world,instanceId);
  const approach=outdoorBenchApproach(world,instanceId);
  if(!bench||!approach)return null;
  const p=ease(progress),a=bench.yaw*Math.PI/180;
  return {x:approach.x+(bench.x-approach.x)*p,
    y:-.53-.225*p,
    z:approach.z+(bench.z-approach.z)*p,
    yaw:bench.yaw+180*p,pitch:0,sofaWeight:p};
}
export function outdoorLightFactor(daylight){
  const daylightAmount=daylight?.normalizedDaylight;
  if(!finite(daylightAmount))return 0;
  return Math.max(0,Math.min(1,(.34-daylightAmount)/.24));
}
