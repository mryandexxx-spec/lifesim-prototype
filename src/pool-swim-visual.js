/** LOT-D2c: read-only water-pose projection of D2b's canonical saved action.
 * No separate swimmer clock, world motion, physics, or save fields.
 * The visible avatar root is feet-origin; both procedural rigs share that
 * origin and the two imported GLBs are individually normalized to it.
 */
import {poolCellBounds} from './pool-topology.js';
import {poolLaneCircuit,poolEntryMinutes} from './pool-navigation.js';

export const POOL_WATER_LEVEL=-.475; // Same constant as D1c pool-visual.js.
const LAND_LEVEL=-.53;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const point=cell=>{
  const b=poolCellBounds(cell);
  return b?{x:(b.minX+b.maxX)/2,z:(b.minZ+b.maxZ)/2}:null;
};
const mix=(a,b,t)=>a+(b-a)*t;
const toward=(a,b,t)=>({x:mix(a.x,b.x,t),z:mix(a.z,b.z,t)});
const valid=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.z);
function section(path,index,progress=0){
  if(!Array.isArray(path)||!path.length)return null;
  const a=point(path[Math.min(path.length-1,Math.max(0,index))]);
  const b=point(path[Math.min(path.length-1,Math.max(0,index+1))])||a;
  return a&&b?toward(a,b,clamp(progress)):null;
}
function heading(a,b,previous=0){
  if(!valid(a)||!valid(b)||Math.hypot(b.x-a.x,b.z-a.z)<.001)
    return previous;
  return Math.atan2(b.x-a.x,b.z-a.z)*180/Math.PI;
}
const output=(stage,xz,yaw,pitch,stroke,waterFraction)=>{
  // Rotation occurs around the shared foot-origin. Pull the ankle root back
  // along the heading by half a body, keeping the chest on its water cell.
  const lean=clamp(pitch/70);
  const radians=yaw*Math.PI/180;
  return {stage,x:xz.x-Math.sin(radians)*.43*lean,
    z:xz.z-Math.cos(radians)*.43*lean,
    y:mix(LAND_LEVEL,POOL_WATER_LEVEL-1.22*(1-lean)-.22*lean,waterFraction),
    yaw,pitch,stroke,immersed:waterFraction>.015};
};

/** Null for land, walking, or corrupted/removed pool references. */
export function poolSwimVisualFrame(world,action){
  if(action?.id!=='swim'||!['entering','swimming','exiting','recovering'].includes(action.stage))
    return null;
  const pool=world?.outdoors?.pools?.find(p=>p.poolId===action.poolId);
  if(!pool||!Array.isArray(pool.cells)||!pool.cells.includes(action.waterCell))
    return null;
  const water=point(action.waterCell),dry=action.dryApproach;
  if(!water||!valid(dry))return null;
  const idx=Number.isSafeInteger(action.wetPathIndex)?action.wetPathIndex:0;
  const progress=clamp(Number.isFinite(action.wetProgress)?action.wetProgress:0);
  const duration=poolEntryMinutes(action.entryKind);
  if(action.stage==='entering'){
    // The D2b ladder token is exclusive only during this transition.
    // Before the wet route advances, lower and tip the body into the water.
    const t=clamp((action.elapsed||0)/duration);
    const first=point(action.entryWetPath?.[0])||water;
    const wetRoute=section(action.entryWetPath,idx,progress)||water;
    if(action.entryKind==='board'&&t<1){
      const flight=clamp((t-.36)/.43),submerge=clamp((t-.79)/.21);
      const run=clamp(t/.36);
      const boardTop=.478;
      const stand=boardTop*clamp(run*2)-.10*Math.sin(Math.PI*run);
      const arc=(1-flight)*boardTop+2.25*flight*(1-flight);
      const frame=output('entering',toward(dry,first,.55*run+.45*flight),
        heading(dry,first),70*submerge,t*4,submerge);
      frame.y+=t<.36?stand:arc;
      frame.jump={bend:Math.sin(Math.PI*run),lift:Math.sin(Math.PI*flight)};
      return frame;
    }
    const xy=t<1?toward(dry,first,t):wetRoute;
    const direction=heading(dry,first);
    const bend=clamp((t-.38)/.62);
    const pitch=70*bend;
    const frame=output('entering',xy,direction,pitch,(action.elapsed||0)*2,t);
    // At the shore the original avatar starts at a true dry ground height.
    return frame;
  }
  if(action.stage==='swimming'){
    const lane=poolLaneCircuit(action.slotCells);
    const index=lane?.indexOf(action.waterCell)??-1;
    if(index<0)return null;
    // A quadratic through the two edge midpoints rounds each tile corner.
    // Its tangent is shared by the next segment, including the lap seam.
    const i=index+(progress>=.5?1:0),t=(progress+.5)%1;
    const cell=offset=>point(lane[(i+offset+lane.length)%lane.length]);
    const center=cell(0);
    const incoming=toward(toward(cell(-1),center,.5),center,t);
    const outgoing=toward(center,toward(center,cell(1),.5),t);
    const pos=toward(incoming,outgoing,t);
    const direction=heading(incoming,outgoing);
    return output('swimming',pos,direction,70,
      Number.isFinite(action.waterElapsed)?action.waterElapsed:0,1);
  }
  const exitPath=Array.isArray(action.exitWetPath)?action.exitWetPath:null;
  const wetPos=exitPath?section(exitPath,idx,progress)||water:water;
  const toDry=valid(action.exitDryApproach)?action.exitDryApproach:null;
  const previous=exitPath?.length>1?point(exitPath[Math.max(0,idx-1)]):null;
  const next=exitPath?.length>1?point(exitPath[Math.min(exitPath.length-1,idx+1)]):null;
  const direction=heading(wetPos,next||toDry,heading(previous,wetPos));
  const atShore=exitPath&&idx>=exitPath.length-1;
  const climb=atShore&&toDry?clamp((action.elapsed||0)/2):0;
  const pos=toDry?toward(wetPos,toDry,climb):wetPos;
  const pitch=70*(1-climb);
  return output(action.stage,pos,direction,pitch,
    (action.waterElapsed||0)+(action.elapsed||0),1-climb);
}
