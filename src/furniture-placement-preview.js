/** F2 shop: deterministic camera-focused placement, independent of PlayCanvas.
 * Raycast-only preview could be null on mobile when its chosen screen point
 * intersected a wall / horizon instead of the floor: then NO 3D object showed.
 * The camera's own look-at XZ always points into the navigable room, keeping a
 * preview visible even for invalid furniture placements (shown in red).
 */
import {snapFurnitureCoordinate} from './furniture-editor.js';
import {screenFloorDragDelta} from './camera-controls.js';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export function cameraPlacementPose(view,previous=null){
  const cx=Number.isFinite(view?.centerX)?view.centerX:0;
  const cz=Number.isFinite(view?.centerZ)?view.centerZ:0;
  // Inside the lot, including newly built detached rooms. Collision/nav rules remain the authoritative
  // final decision; these clamps do not silently "approve" a placement.
  const x=snapFurnitureCoordinate(clamp(cx,-8.75,22.75));
  const z=snapFurnitureCoordinate(clamp(cz,-11.75,11.75));
  const yaw=[0,90,180,270].includes(previous?.yaw)?previous.yaw:0;
  return {x,z,yaw};
}

/** Unpaid preview moves with the finger. Keep raw coordinates unsnapped
 * between events; game.js snaps visible/committed positions only.
 */
export function dragShopPlacement(view,rawPose,dx,dy,height){
  if(!rawPose||!Number.isFinite(rawPose.x)||!Number.isFinite(rawPose.z))
    return null;
  const delta=screenFloorDragDelta(view,dx,dy,height);
  return {x:clamp(rawPose.x+delta.x,-8.75,22.75),
    z:clamp(rawPose.z+delta.z,-11.75,11.75),
    yaw:[0,90,180,270].includes(rawPose.yaw)?rawPose.yaw:0};
}
