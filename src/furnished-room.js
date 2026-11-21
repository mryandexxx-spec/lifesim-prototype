/** F5-D.2: transactional move of a detached furnished room.
 * All validation happens before the caller commits construction + furniture.
 * No item duplication, SKU changes, new painting anchors or save-version bump.
 */
import {constructionRoomSelection,proposeConstructionEdit,restoreConstructionWorld} from './construction.js';
import {FURNITURE_CATALOG,instanceRect,furnitureObstacles,restoreFurnitureWorld,
  furnitureActionApproach} from './furniture-catalog.js';
import {F1_MOVEABLE_PREFABS} from './furniture-editor.js';
import {findPath,isWalkable} from './navigation.js';

const fail=reason=>({ok:false,reason});
const finite=Number.isFinite;
const overlaps=(a,b)=>a.minX<b.maxX-.02&&a.maxX>b.minX+.02&&
  a.minZ<b.maxZ-.02&&a.maxZ>b.minZ+.02;
const inRoom=(item,room)=>item.x>=room.i0*.5&&item.x<room.i1*.5&&
  item.z>=room.j0*.5&&item.z<room.j1*.5;
const within=(rect,room)=>rect.minX>=room.i0*.5-.005&&
  rect.maxX<=room.i1*.5+.005&&rect.minZ>=room.j0*.5-.005&&
  rect.maxZ<=room.j1*.5+.005;

/** Existing shop products retain instance IDs, variants, price, state and inventory. */
export function proposeFurnishedRoomMove(household,command,context={}){
  const construction=household?.construction||household?.world?.construction||
    (household?.world?.schema===1?household.world:null);
  const furniture=household?.furniture||household?.world?.furniture;
  if(!construction||!furniture||command?.type!=='room-relocate')
    return fail('invalid-command');
  const selected=constructionRoomSelection(construction,command.source);
  if(!selected.ok)return selected;
  const r=selected.room,rotation=command.rotation??0;
  if(![0,90,180,270].includes(rotation)||!finite(command.at?.x)||
    !finite(command.at?.z))return fail('invalid-room-placement');
  const carried=furniture.instances.filter(item=>item.location==='home'&&inRoom(item,r));
  const ids=new Set(carried.map(item=>item.instanceId));
  const locked=new Set(context.lockedInstanceIds||[]);
  for(const item of carried){
    if(!F1_MOVEABLE_PREFABS.includes(item.prefabId))
      return fail('room-item-fixed');
    if(locked.has(item.instanceId))return fail('room-item-busy');
    const definition=FURNITURE_CATALOG[item.prefabId];
    for(const local of [definition.footprint,...definition.extras.map(x=>x.footprint)])
      if(!within(instanceRect(item,local),r))return fail('room-item-crosses-wall');
  }
  // Every obstacle intersecting the footprint must travel with the room,
  // otherwise a room boundary would silently cut through another object.
  for(const box of furnitureObstacles(furniture)){
    const roomBox={minX:r.i0*.5,maxX:r.i1*.5,minZ:r.j0*.5,maxZ:r.j1*.5};
    if(overlaps(box,roomBox)&&!ids.has(box.instanceId))
      return fail('room-item-crosses-wall');
  }
  const proposal=proposeConstructionEdit(construction,command,{
    ...context,furniture:furniture.instances,
    furnitureBoxes:furnitureObstacles(furniture),
    movableFurnitureIds:[...ids]
  });
  if(!proposal.ok)return proposal;
  const w=r.width,h=r.height,rw=rotation%180===0?w:h,rh=rotation%180===0?h:w;
  const ti=Math.round(command.at.x*2)-Math.floor(rw/2);
  const tj=Math.round(command.at.z*2)-Math.floor(rh/2);
  const movePoint=(x,z)=>{
    const dx=x*2-r.i0,dz=z*2-r.j0;
    const rotated=rotation===0?[dx,dz]:rotation===90?[h-dz,dx]:
      rotation===180?[w-dx,h-dz]:[dz,w-dx];
    return {x:(ti+rotated[0])*.5,z:(tj+rotated[1])*.5};
  };
  const next=restoreFurnitureWorld({...furniture,revision:furniture.revision+1,
    instances:furniture.instances.map(item=>ids.has(item.instanceId)
      ?{...item,...movePoint(item.x,item.z),yaw:(item.yaw+rotation)%360}:item)});
  // Reject restore fallback (e.g. old coordinate caps) instead of destroying
  // purchased inventory or assigning a phantom item to the new room.
  if(next.instances.length!==furniture.instances.length)return fail('room-item-bounds');
  for(const old of carried){
    const candidate=next.instances.find(i=>i.instanceId===old.instanceId);
    const position=movePoint(old.x,old.z);
    if(!candidate||Math.abs(candidate.x-position.x)>.001||
      Math.abs(candidate.z-position.z)>.001||candidate.yaw!==(old.yaw+rotation)%360)
      return fail('room-item-bounds');
    const definition=FURNITURE_CATALOG[candidate.prefabId];
    const target={i0:ti,i1:ti+rw,j0:tj,j1:tj+rh};
    for(const local of [definition.footprint,...definition.extras.map(x=>x.footprint)])
      if(!within(instanceRect(candidate,local),target))
        return fail('room-item-outside');
  }
  const boxes=furnitureObstacles(next);
  for(const a of boxes)if(ids.has(a.instanceId))
    for(const b of boxes)if(!ids.has(b.instanceId)&&overlaps(a,b))
      return fail('room-item-collision');
  const nav={construction:proposal.world,furniture:next};
  const residents=(context.residents||[]).filter(p=>finite(p?.x)&&finite(p?.z));
  for(const person of residents){
    if(!isWalkable(person.x,person.z,nav))return fail('resident-blocked');
    for(const action of ['fridge','shower','toilet','sofa','tv']){
      const point=furnitureActionApproach(next,action);
      if(point&&!findPath(person,point,nav))return fail('inaccessible-essential');
    }
  }
  // Every moved object exposing an interaction must remain physically usable.
  for(const item of carried){
    const newItem=next.instances.find(i=>i.instanceId===item.instanceId);
    const action=FURNITURE_CATALOG[item.prefabId].actionId;
    if(!action||!residents.length)continue;
    const point=furnitureActionApproach(next,action,item.instanceId);
    if(point&&!residents.some(p=>findPath(p,point,nav)))
      return fail('room-item-unreachable');
  }
  return {ok:true,world:proposal.world,furniture:next,movedIds:[...ids]};
}

/** One undo/redo timeline for both construction and furniture, never two
 * independently drifting stacks. Keeps existing construction editor API.
 */
export function createHouseholdConstructionEditor(initial,initialFurniture,validateCandidate=null){
  let validator=validateCandidate;
  let states=[{world:restoreConstructionWorld(initial),
    furniture:restoreFurnitureWorld(initialFurniture)}],index=0;
  const snapshot=()=>({world:restoreConstructionWorld(states[index].world),
    furniture:restoreFurnitureWorld(states[index].furniture),
    canUndo:index>0,canRedo:index<states.length-1});
  return {
    state:snapshot,
    setValidator(fn){validator=typeof fn==='function'?fn:null;},
    commit(command,context={}){
      const previous=states[index],move=command?.type==='room-relocate';
      const result=move
        ?proposeFurnishedRoomMove(previous,command,context)
        :proposeConstructionEdit(previous.world,command,{...context,
            furniture:previous.furniture.instances});
      if(!result.ok)return {...result,...snapshot()};
      // Validate against the live household before storing a reversible edit.
      const safe=validator?.(result.world,result.furniture||previous.furniture);
      if(safe&&!safe.ok)return {...safe,...snapshot()};
      states=states.slice(0,index+1);
      states.push({world:result.world,furniture:result.furniture||previous.furniture});
      index++;if(states.length>50){states.shift();index--;}
      return {...result,...snapshot()};
    },
    undo(){
      if(index===0)return fail('empty-history');
      const candidate=states[index-1],safe=validateCandidate?.(candidate.world,candidate.furniture);
      if(safe&&!safe.ok)return {...safe,...snapshot()};
      index--;return {ok:true,...snapshot()};
    },
    redo(){
      if(index===states.length-1)return fail('empty-history');
      const candidate=states[index+1],safe=validateCandidate?.(candidate.world,candidate.furniture);
      if(safe&&!safe.ok)return {...safe,...snapshot()};
      index++;return {ok:true,...snapshot()};
    }
  };
}
