/** F1b: data-first household editor with scene/contact-safe functional fixtures.
 * The built-in kitchen counter is immovable until kitchen/wall construction;
 * all other authored fixtures are grouped and transformed by one world adapter.
 */
import {FURNITURE_CATALOG,restoreFurnitureWorld} from './furniture-catalog.js';
import {proposeFurnitureMove} from './furniture-layout.js';

export const F1_MOVEABLE_PREFABS=Object.freeze([
  'nightstand','table','tv','plant','bed','sofa','fridge','shower','toilet'
]);
export const F1_GRID_STEP=.25;
export function canMoveFurniture(instance){
  return !!instance&&instance.location==='home'&&
    F1_MOVEABLE_PREFABS.includes(instance.prefabId);
}
export function snapFurnitureCoordinate(n,step=F1_GRID_STEP){
  if(!Number.isFinite(n)||!Number.isFinite(step)||step<=0)return null;
  return Math.round(n/step)*step;
}
export function createFurnitureEditor(initial){
  const valid=restoreFurnitureWorld(initial);
  let timeline=[valid],index=0,revision=valid.revision,current=valid;
  const copy=world=>restoreFurnitureWorld(world);
  const results=()=>({world:copy(current),canUndo:index>0,canRedo:index<timeline.length-1});
  function commit(instanceId,pose,context={}){
    const source=current.instances.find(i=>i.instanceId===instanceId);
    if(!canMoveFurniture(source))return {ok:false,reason:'fixed-or-missing',...results()};
    if(!pose||!Number.isFinite(pose.x)||!Number.isFinite(pose.z)||
       ![0,90,180,270].includes(pose.yaw))return {ok:false,reason:'invalid-pose',...results()};
    if(source.x===pose.x&&source.z===pose.z&&source.yaw===pose.yaw)
      return {ok:false,reason:'unchanged',...results()};
    const changed=proposeFurnitureMove(current,instanceId,pose,context);
    if(!changed.ok)return {...changed,...results()};
    revision+=1;
    current=copy({...changed.world,revision});
    timeline=timeline.slice(0,index+1);
    timeline.push(current);index++;
    if(timeline.length>50){timeline.shift();index--;}
    return {ok:true,...results()};
  }
  function traverse(direction){
    const target=index+direction;
    if(target<0||target>=timeline.length)return {ok:false,reason:'empty-history',...results()};
    index=target;revision++;
    current=copy({...timeline[index],revision});
    return {ok:true,...results()};
  }
  return {state:results,commit,undo:()=>traverse(-1),redo:()=>traverse(1)};
}
/** Pure ray vs floor for drag gestures; CSS pixels are interpreted in game adapter. */
export function furnitureFloorPoint(near,far){
  if(!near||!far||![near.x,near.y,near.z,far.x,far.y,far.z].every(Number.isFinite))
    return null;
  const delta=far.y-near.y;
  if(Math.abs(delta)<1e-8)return null;
  const t=-near.y/delta;
  if(t<0||t>1)return null;
  return {x:near.x+(far.x-near.x)*t,z:near.z+(far.z-near.z)*t};
}
