/** F2 shop: deterministic camera-focused placement, independent of PlayCanvas.
 * Raycast-only preview could be null on mobile when its chosen screen point
 * intersected a wall / horizon instead of the floor: then NO 3D object showed.
 * The camera's own look-at XZ always points into the navigable room, keeping a
 * preview visible even for invalid furniture placements (shown in red).
 */
import {snapFurnitureCoordinate} from './furniture-editor.js';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export function cameraPlacementPose(view,previous=null){
  const cx=Number.isFinite(view?.centerX)?view.centerX:0;
  const cz=Number.isFinite(view?.centerZ)?view.centerZ:0;
  // Inside the visual room walls. Collision/nav rules remain the authoritative
  // final decision; these clamps do not silently "approve" a placement.
  const x=snapFurnitureCoordinate(clamp(cx,-4.25,4.25));
  const z=snapFurnitureCoordinate(clamp(cz,-3.75,3.75));
  const yaw=[0,90,180,270].includes(previous?.yaw)?previous.yaw:0;
  return {x,z,yaw};
}
