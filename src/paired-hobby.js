/** H3 — physical, two-person book/music leisure. Pure A* planner; no PlayCanvas. */
import {resolveActionFurniture,rotateLocal} from './furniture-catalog.js';
import {musicListeningSpots} from './music-listening.js';
import {findPath,isWalkable} from './navigation.js';

const IDS=Object.freeze(['alex','mira']);
const finite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const actionFor=choiceId=>choiceId==='music'?'music':choiceId==='books'?'hobby':null;
const positions=root=>({alex:root?.position,mira:root?.otherSim?.position});
const bookOffsets=Object.freeze([{x:0,z:.91},{x:0,z:-.91},{x:1.08,z:0},{x:-1.08,z:0}]);

export function pairedHobbySpots(world,choiceId,instanceId){
  const actionId=actionFor(choiceId);
  const instance=actionId&&resolveActionFurniture(world,actionId,instanceId);
  if(!instance)return [];
  if(choiceId==='music')return musicListeningSpots(world,instance.instanceId);
  return bookOffsets.map(local=>{
    const offset=rotateLocal(local.x,local.z,instance.yaw);
    return {x:instance.x+offset.x,z:instance.z+offset.z};
  }).filter(p=>isWalkable(p.x,p.z,world));
}
function routeCost(world,from,to){
  const path=finite(from)&&findPath(from,to,world);
  if(!path)return Infinity;
  let cost=0,prev=from;
  for(const point of path){cost+=distance(prev,point);prev=point;}
  return cost;
}
/** No teleport and no implicit new station when a saved target is removed. */
export function planPairedHobby(root,initiator,choiceId,instanceId=null){
  if(!IDS.includes(initiator)||!root?.otherSim||!actionFor(choiceId))return null;
  const station=resolveActionFurniture(root.world,actionFor(choiceId),instanceId);
  if(!station)return null;
  const spots=pairedHobbySpots(root.world,choiceId,station.instanceId);
  const start=positions(root),other=initiator==='alex'?'mira':'alex';
  let best=null,bestScore=Infinity;
  for(let i=0;i<spots.length;i++)for(let j=0;j<spots.length;j++){
    if(i===j||distance(spots[i],spots[j])<.82)continue;
    const a=routeCost(root.world,start[initiator],spots[i]);
    const b=routeCost(root.world,start[other],spots[j]);
    if(!Number.isFinite(a)||!Number.isFinite(b))continue;
    if(a+b<bestScore){best={a:spots[i],b:spots[j]};bestScore=a+b;}
  }
  if(!best)return null;
  return {choiceId,instanceId:station.instanceId,places:{
    [initiator]:{x:best.a.x,z:best.a.z},
    [other]:{x:best.b.x,z:best.b.z}
  }};
}
export function validPairedHobbyPlan(root,plan,initiator,{requireRoutes=true}={}){
  if(!IDS.includes(initiator)||!plan||typeof plan!=='object'||Array.isArray(plan)||
    !actionFor(plan.choiceId)||typeof plan.instanceId!=='string')return false;
  const spots=pairedHobbySpots(root?.world,plan.choiceId,plan.instanceId);
  if(spots.length<2)return false;
  const a=plan.places?.alex,b=plan.places?.mira;
  if(!finite(a)||!finite(b)||distance(a,b)<.82)return false;
  const starts=positions(root);
  return IDS.every(id=>{
    const p=plan.places[id];
    return spots.some(spot=>distance(spot,p)<.025)&&
      (!requireRoutes||Number.isFinite(routeCost(root.world,starts[id],p)));
  });
}
export function livePairedHobby(root){
  const social=root?.socialAction,shared=social?.shared;
  if(social?.phase!=='using'||shared?.mode!=='leisure'||
    !['books','music'].includes(shared.choiceId)||
    shared.pairConsent!==true||
    !validPairedHobbyPlan(root,shared.pairPlan,social.initiator,{requireRoutes:false})||
    shared.pairPlan.choiceId!==shared.choiceId)return null;
  const current=positions(root);
  return IDS.every(id=>distance(current[id],shared.pairPlan.places[id])<.35)
    ?shared.pairPlan:null;
}
