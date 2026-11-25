/** LOT-B3: bench position, exclusive occupancy and deterministic night lighting.
 * Pure gameplay geometry; no PlayCanvas, DOM or duplicate simulation clock.
 */
import {OUTDOOR_CATALOG} from './outdoor-catalog.js';
import {SOFA_LAYOUT,SOFA_POSE} from './pose-config.js';
import {createSeatSurface,seatSlot} from './interaction-anchors.js';

export const OUTDOOR_BENCH_ITEM='garden.bench';
// Physical top of both legacy and approved native GLB slats, in lot units.
export const OUTDOOR_BENCH_SEAT_HEIGHT=.64;
const BENCH_FLOOR_Y=-.53;
export function outdoorBenchSurface(world,instanceId){
  const bench=outdoorBench(world,instanceId);if(!bench)return null;
  const {width,depth}=OUTDOOR_CATALOG[OUTDOOR_BENCH_ITEM];
  return seatSlot(createSeatSurface({id:instanceId,origin:{x:bench.x,y:BENCH_FLOOR_Y,z:bench.z},
    yaw:180-bench.yaw,width,depth,seatHeight:BENCH_FLOOR_Y+OUTDOOR_BENCH_SEAT_HEIGHT,
    floorY:BENCH_FLOOR_Y,slots:1,sideMargin:.2,backClearance:.10,approachGap:.55}),0);
}
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
  const p=ease(progress);
  const seat=outdoorBenchSurface(world,instanceId);
  const referenceHeight=SOFA_LAYOUT.seatCenterY+SOFA_LAYOUT.seatHeight/2;
  // Same calibrated fallback as purchased chairs: seat height difference,
  // not a per-avatar offset. Skinned seat runtime refines actual contact.
  const lift=seat.contact.y-seat.floorY-referenceHeight;
  return {x:approach.x+(bench.x-approach.x)*p,
    y:seat.floorY+(SOFA_POSE.y+lift)*p,
    z:approach.z+(bench.z-approach.z)*p,
    yaw:-bench.yaw+180*p,pitch:0,sofaWeight:p};
}
export function outdoorLightFactor(daylight){
  const daylightAmount=daylight?.normalizedDaylight;
  if(!finite(daylightAmount))return 0;
  return Math.max(0,Math.min(1,(.34-daylightAmount)/.24));
}
