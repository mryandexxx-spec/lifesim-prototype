/** F3b: real one-person sofa seat for a TV action; all geometry is pure.
 * A TV is still independently usable standing if there is no suitable free sofa.
 * A shared couch session, two seats on one couch and social rewards are F3c.
 */
import {FURNITURE_CATALOG,furnitureObstacles} from './furniture-catalog.js';
import {furnitureActionApproach} from './furniture-catalog.js';
import {furniturePoint} from './furniture-transform.js';
import {findPath} from './navigation.js';
import {SOFA_POSE,SOFA_APPROACH} from './pose-config.js';

const SCREEN_FRONT=Object.freeze({x:3.39,z:0.345});
const SCREEN_FORWARD=Object.freeze({x:2.39,z:0.345});
const SOFA_FORWARD=Object.freeze({x:SOFA_POSE.x,z:SOFA_POSE.z-1});
const len=(a,b)=>Math.hypot(b.x-a.x,b.z-a.z);
const dot=(a,b)=>a.x*b.x+a.z*b.z;
const unit=(a,b)=>{
  const d=len(a,b);
  return d>1e-6?{x:(b.x-a.x)/d,z:(b.z-a.z)/d}:null;
};
const clamped=(x,a,b)=>Math.min(Math.max(x,a),b);
const segmentCrosses=(a,b,r)=>{
  let from=0,to=1;
  const vx=b.x-a.x,vz=b.z-a.z;
  for(const [start,delta,min,max] of [[a.x,vx,r.minX,r.maxX],[a.z,vz,r.minZ,r.maxZ]]){
    if(Math.abs(delta)<1e-8){if(start<min||start>max)return false;continue;}
    const t1=(min-start)/delta,t2=(max-start)/delta;
    from=Math.max(from,Math.min(t1,t2));
    to=Math.min(to,Math.max(t1,t2));
    if(from>to)return false;
  }
  return to>=from&&to>0&&from<1;
};
/** Camera-independent view check: sofa must face the television broadly,
 * television glass must face the sofa, no tall furniture may block sight.
 */
export function tvSofaView(world,sofaId,tvId){
  const items=world?.furniture?.instances||world?.instances||[];
  const sofa=items.find(i=>i.instanceId===sofaId&&i.prefabId==='sofa'&&i.location==='home');
  const tv=items.find(i=>i.instanceId===tvId&&i.prefabId==='tv'&&i.location==='home');
  if(!sofa||!tv)return null;
  const seated=furniturePoint(world,'sofa',SOFA_POSE,sofaId);
  const sofaFront=furniturePoint(world,'sofa',SOFA_FORWARD,sofaId);
  const screen=furniturePoint(world,'tv',SCREEN_FRONT,tvId);
  const tvFront=furniturePoint(world,'tv',SCREEN_FORWARD,tvId);
  if(!seated||!sofaFront||!screen||!tvFront)return null;
  const length=len(seated,screen);
  if(length<1.15||length>5.5)return null;
  const toScreen=unit(seated,screen),toViewer=unit(screen,seated);
  const seatFacing=unit(seated,sofaFront),tvFacing=unit(screen,tvFront);
  if(!toScreen||!toViewer||!seatFacing||!tvFacing||
    dot(toScreen,seatFacing)<.22||dot(toViewer,tvFacing)<.30)return null;
  // Coffee tables, plants and small side cabinets do not block eye-height sight.
  // All taller pieces use the same persisted rectangles as navigation.
  const blocks=furnitureObstacles(world).filter(b=>
    b.instanceId!==sofaId&&b.instanceId!==tvId&&
    !['table','nightstand','plant'].includes(b.id));
  if(blocks.some(b=>segmentCrosses(seated,screen,b)))return null;
  const yaw=Math.atan2(toScreen.x,toScreen.z)*180/Math.PI;
  const sofaYaw=180-sofa.yaw;
  let difference=((yaw-sofaYaw+540)%360)-180;
  return {sofaId,tvId,seated,screen,distance:length,
    torsoYaw:clamped(difference,-30,30)};
}
/** One seat per sofa. Respect another person's active sofa/TV command and
 * already queued ordinary sofa reservations (no duplicate bookings).
 */
export function chooseTvSofa(root,residentId,tvId){
  const world=root?.world?.furniture||root?.world;
  const self=residentId==='mira'?root?.otherSim:residentId==='alex'?root:null;
  if(!self||!world?.instances?.some(i=>i.instanceId===tvId&&i.prefabId==='tv'&&i.location==='home'))
    return null;
  const other=residentId==='mira'?root:root?.otherSim;
  const occupied=new Set();
  if(root?.socialAction?.eveningSofa?.instanceId)
    occupied.add(root.socialAction.eveningSofa.instanceId);
  if(other?.action?.id==='sofa')
    occupied.add(other.action.targetInstanceId||'home-sofa-1');
  if(other?.action?.id==='tv'&&other.action.watchSeatInstanceId)
    occupied.add(other.action.watchSeatInstanceId);
  const otherId=residentId==='mira'?'alex':'mira';
  const pending=root?.actionQueues?.byResident?.[otherId]||[];
  for(const command of pending){
    if(command.type==='object'&&command.actionId==='sofa')
      occupied.add(command.targetInstanceId||'home-sofa-1');
  }
  let best=null,bestScore=Infinity;
  for(const sofa of world.instances){
    if(sofa.prefabId!=='sofa'||sofa.location!=='home'||occupied.has(sofa.instanceId))continue;
    const view=tvSofaView(world,sofa.instanceId,tvId);
    const approach=furnitureActionApproach(world,'sofa',sofa.instanceId);
    if(!view||!approach)continue;
    const path=findPath(self.position,approach,root.world);
    if(!path)continue;
    let prev=self.position,route=0;
    for(const p of path){route+=len(prev,p);prev=p;}
    const score=route+.12*view.distance;
    if(score<bestScore){best=view;bestScore=score;}
  }
  return best;
}
