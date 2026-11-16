/** R5b: display-only romantic evening vignette. No gameplay, renderer or save.
 * The existing R5a invitation and consent remain authoritative.
 * Warm props attach only to a REAL nearby coffee-table instance. The
 * resident accents are cosmetic, pause with the scene and vanish on refusal.
 */
import {ROMANTIC_EVENING_DURATION_MINUTES} from './relationships.js';
const finitePoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const clamp01=v=>Math.min(1,Math.max(0,v));
const smooth=v=>{const n=clamp01(v);return n*n*(3-2*n);};
const inactive=()=>({active:false,weight:0,gestureWeight:0,tableInstanceId:null,accents:[],center:null});

/** `clock` is a presentation clock, not the simulator clock.
 * No omniscient romance state: consent must be stored by arriveSocial.
 * The geometry is always in world coordinates; the renderer may attach
 * tabletop props directly to the associated saved furniture instance.
 */
export function romanticEveningVignette(social,world,positions,clock=0,{eligible=true}={}){
  if(eligible!==true||social?.phase!=='using'||social.branchAction?.id!=='romance.evening'||
    social.branchAction.eveningConsent!==true||
    !Number.isFinite(social.elapsed)||social.elapsed<0||
    social.elapsed>=ROMANTIC_EVENING_DURATION_MINUTES||
    !finitePoint(positions?.alex)||!finitePoint(positions?.mira))
    return inactive();
  const a=positions.alex,b=positions.mira;
  const center={x:(a.x+b.x)/2,z:(a.z+b.z)/2};
  const separation=distance(a,b);
  const weight=smooth(social.elapsed/2.2)*
    smooth((ROMANTIC_EVENING_DURATION_MINUTES-social.elapsed)/2.8);
  const data=world?.furniture?.instances?world.furniture:world;
  let table=null,best=Infinity;
  if(Array.isArray(data?.instances)){
    for(const item of data.instances){
      if(item?.prefabId!=='table'||item.location!=='home'||!finitePoint(item)||
        typeof item.instanceId!=='string')continue;
      const near=distance(center,item);
      // Both adults must actually be near the table. Never light an
      // arbitrary stored, distant or out-of-view fixture on another side.
      if(near>2.2||distance(a,item)>2.65||distance(b,item)>2.65||near>=best)continue;
      best=near;table=item.instanceId;
    }
  }
  // For very distant or overlapping residents there must not be hovering
  // heart-like particles. The tabletop vignette can remain independently.
  const accents=[];
  if(separation>=.38&&separation<=2.5&&weight>.001){
    const t=Number.isFinite(clock)?clock:0;
    for(let i=0;i<5;i++){
      const phase=i*Math.PI*2/5+t*.64;
      accents.push({x:center.x+Math.cos(phase)*(.26+.065*i/5),
        y:1.44+Math.sin(phase*1.4+t*.36)*.16+.085*(i%3),
        z:center.z+Math.sin(phase)*(.23+.05*i/5),
        size:(.047+.012*Math.sin(t*1.15+i))*weight});
    }
  }
  return {active:true,weight,gestureWeight:weight*.9,
    tableInstanceId:table,center,accents};
}
