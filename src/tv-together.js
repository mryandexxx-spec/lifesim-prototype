/** F3c — two distinct viewing positions for a chosen real television.
 * One person per sofa on this iteration. A second can stand; NEVER pile two
 * people into the same F3b one-seat pose. No PlayCanvas, HUD or clock.
 */
import {furnitureActionApproach} from './furniture-catalog.js';
import {furniturePoint} from './furniture-transform.js';
import {findPath,isWalkable} from './navigation.js';
import {tvSofaView} from './tv-seating.js';
import {TV_APPROACH} from './tv-interaction.js';
const ids=['alex','mira'];
const magnitude=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const validPoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&
  Math.abs(p.x)<=4.65&&Math.abs(p.z)<=4.01;
const routeCost=(from,to,world)=>{
  const path=findPath(from,to,world);
  if(!path)return Infinity;
  let cost=0,prev=from;
  for(const pt of path){cost+=magnitude(prev,pt);prev=pt;}
  return cost;
};
/** Two independent sofa candidates plus physically separated standing places.
 * The plan is computed before the session starts and committed atomically.
 */
export function planSharedTv(root,initiator,tvId){
  if(!ids.includes(initiator)||!root?.world||typeof tvId!=='string')return null;
  const world=root.world,items=world.furniture?.instances;
  if(!Array.isArray(items)||!items.some(i=>i.instanceId===tvId&&i.prefabId==='tv'&&i.location==='home'))
    return null;
  const peer=initiator==='alex'?'mira':'alex',positions={
    alex:root.position,mira:root.otherSim?.position
  };
  if(!validPoint(positions.alex)||!validPoint(positions.mira))return null;
  const occupied=new Set();
  // Other ongoing object actions are ruled out by the normal social preflight.
  // Queued personal sofa actions still have the right to their named object.
  for(const id of ids)
    for(const task of root.actionQueues?.byResident?.[id]||[])
      if(task.type==='object'&&task.actionId==='sofa')
        occupied.add(task.targetInstanceId||'home-sofa-1');
  const seats=[];
  for(const item of items){
    if(item.prefabId!=='sofa'||item.location!=='home'||occupied.has(item.instanceId))continue;
    const view=tvSofaView(world,item.instanceId,tvId);
    const at=furnitureActionApproach(world,'sofa',item.instanceId);
    if(view&&at&&validPoint(at)){
      seats.push({seatId:item.instanceId,point:at,view,
        alex:routeCost(positions.alex,at,world),
        mira:routeCost(positions.mira,at,world)});
    }
  }
  const sideOffsets=[
    [0,0],[-.55,0],[-1.05,0],[0,.55],[0,-.55],
    [-.45,.70],[-.45,-.70],[-1.05,.65],[-1.05,-.65],
    [-.80,1.05],[-.80,-1.05],[-1.45,0],[-1.45,.9],[-1.45,-.9],
    [.15,1.1],[.15,-1.1],[-1.8,1.2],[-1.8,-1.2]
  ];
  const stands=sideOffsets.map(([dx,dz])=>
    furniturePoint(world,'tv',{x:TV_APPROACH.x+dx,z:TV_APPROACH.z+dz},tvId))
    .filter(point=>validPoint(point)&&isWalkable(point.x,point.z,world));
  const candidates={alex:[],mira:[]};
  for(const id of ids){
    for(const seat of seats){
      const cost=seat[id];
      if(Number.isFinite(cost))candidates[id].push({seatId:seat.seatId,
        x:seat.point.x,z:seat.point.z,cost});
    }
    for(const point of stands){
      const cost=routeCost(positions[id],point,world);
      if(Number.isFinite(cost))candidates[id].push({
        seatId:null,x:point.x,z:point.z,cost:cost+2.2});
    }
    candidates[id].sort((a,b)=>a.cost-b.cost||
      String(a.seatId).localeCompare(String(b.seatId)));
  }
  // Optimise both residents as a pair: never overlap, never share one couch,
  // and prefer 2 seated (when physically possible) to 1 seated to standing.
  let best=null,bestScore=Infinity;
  for(const a of candidates[initiator])for(const b of candidates[peer]){
    if((a.seatId&&a.seatId===b.seatId)||magnitude(a,b)<.82)continue;
    const seated=Number(Boolean(a.seatId))+Number(Boolean(b.seatId));
    const score=a.cost+b.cost+(2-seated)*3;
    if(score<bestScore){best={a,b};bestScore=score;}
  }
  if(!best)return null;
  return {tvId,places:{
    [initiator]:{x:best.a.x,z:best.a.z,seatId:best.a.seatId},
    [peer]:{x:best.b.x,z:best.b.z,seatId:best.b.seatId}
  }};
}
/** Validate existing v1 save, not just presence of IDs: never fabricate a
 * seat or route on reload, nor collect a receipt from vanished furniture.
 */
export function validSharedTvPlan(root,plan,initiator){
  if(!plan||typeof plan!=='object'||Array.isArray(plan)||
    !ids.includes(initiator)||typeof plan.tvId!=='string')return false;
  const world=root?.world,items=world?.furniture?.instances;
  if(!Array.isArray(items)||!items.some(i=>i.prefabId==='tv'&&
    i.instanceId===plan.tvId&&i.location==='home'))return false;
  const a=plan.places?.alex,b=plan.places?.mira;
  if(!validPoint(a)||!validPoint(b)||magnitude(a,b)<.82)return false;
  if(a.seatId&&a.seatId===b.seatId)return false;
  for(const [id,point] of [['alex',a],['mira',b]]){
    const origin=id==='alex'?root.position:root.otherSim?.position;
    if(!validPoint(origin))return false;
    if(point.seatId){
      if(typeof point.seatId!=='string'||!tvSofaView(world,point.seatId,plan.tvId))return false;
      const at=furnitureActionApproach(world,'sofa',point.seatId);
      if(!at||magnitude(at,point)>.08)return false;
    }else if(point.seatId!==null||!isWalkable(point.x,point.z,world))return false;
    if(!findPath(origin,point,world))return false;
  }
  return true;
}
/** Once shared TV is accepted, only a real paired session can activate a
 * particular screen; this is intentionally NOT a generic social event.
 */
export function liveSharedTv(root){
  const social=root?.socialAction,shared=social?.shared;
  return social?.phase==='using'&&shared?.mode==='leisure'&&
    shared.choiceId==='tv'&&shared.tvConsent===true&&
    validSharedTvPlan(root,shared.tvPlan,social.initiator)
      ?shared.tvPlan:null;
}
