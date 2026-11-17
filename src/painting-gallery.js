/** H5b: one painting ID has one location. No PlayCanvas/DOM, no new save schema. */
import {studioArtworkPose} from './painting-visual.js';
import {starterShellOffset} from './construction.js';

export const PAINT_WALL_SLOTS=Object.freeze(
  Array.from({length:8},(_,i)=>Object.freeze({
    id:i,label:'Стена · место '+(i+1),
    x:1.8+i*1.4,y:1.72,z:-4.10,yaw:180
  }))
);
const owners=Object.freeze(['alex','mira']);
const actorFor=(root,id)=>id==='alex'?root:id==='mira'?root?.otherSim:null;
export const availablePaintingWallSlots=root=>{
  const occupied=new Set(owners.flatMap(id=>
    (actorFor(root,id)?.createdWorks||[]).filter(w=>
      w.kind==='artwork'&&w.location==='wall'&&Number.isInteger(w.wallSlot))
      .map(w=>w.wallSlot)));
  return PAINT_WALL_SLOTS.filter(s=>!occupied.has(s.id));
};
export function artworkDisplayPose(work,index=0,sourceOrigin=null,construction=null){
  if(work?.kind!=='artwork')return null;
  if(work.location==='wall'){
    const slot=PAINT_WALL_SLOTS[work.wallSlot];
    return slot?{x:slot.x,y:slot.y,z:slot.z+
      starterShellOffset(construction,'north'),yaw:slot.yaw,wall:true}:null;
  }
  if(work.location==='studio')
    return studioArtworkPose({...work,origin:work.origin||sourceOrigin},index);
  return null;
}
/** Provisional art price, credited to existing playtest furniture wallet only. */
export function paintingResaleCredits(work){
  return work&&Number.isInteger(work.quality)&&work.quality>=1&&work.quality<=100
    ?Math.round(25+work.quality*3):0;
}
/** Pure atomic transaction; callers apply BOTH returned works/shop and save together. */
export function transactPainting(root,ownerId,workId,operation,wallSlot=null){
  if(!owners.includes(ownerId)||typeof workId!=='string')
    return {ok:false,reason:'invalid-work'};
  const actor=actorFor(root,ownerId),works=actor?.createdWorks;
  if(!Array.isArray(works))return {ok:false,reason:'invalid-owner'};
  const index=works.findIndex(w=>w.id===workId&&w.ownerId===ownerId);
  if(index<0)return {ok:false,reason:'not-owned'};
  const work=works[index];
  if(operation==='store'){
    if(!(work.location==='studio'||work.location==='wall'||!work.kind))
      return {ok:false,reason:'not-displayed'};
    const next={...work,kind:'artwork',location:'inventory'};
    delete next.wallSlot;
    return {ok:true,works:works.map((v,i)=>i===index?next:v),shop:root.shop};
  }
  if(operation==='hang'){
    if(work.kind!=='artwork'||work.location!=='inventory')
      return {ok:false,reason:'not-in-inventory'};
    if(!Number.isInteger(wallSlot)||!PAINT_WALL_SLOTS[wallSlot])
      return {ok:false,reason:'invalid-slot'};
    if(!availablePaintingWallSlots(root).some(s=>s.id===wallSlot))
      return {ok:false,reason:'slot-occupied'};
    return {ok:true,works:works.map((v,i)=>i===index
      ?{...v,location:'wall',wallSlot}:v),shop:root.shop};
  }
  if(operation==='sell'){
    if(work.kind!=='artwork'||work.location!=='inventory')
      return {ok:false,reason:'not-in-inventory'};
    const amount=paintingResaleCredits(work);
    if(!Number.isSafeInteger(root?.shop?.credits)||root.shop.credits<0||
      root.shop.credits+amount>1000000)return {ok:false,reason:'wallet-limit'};
    return {ok:true,works:works.filter((_,i)=>i!==index),
      shop:{...root.shop,credits:root.shop.credits+amount},amount};
  }
  return {ok:false,reason:'unknown-operation'};
}
