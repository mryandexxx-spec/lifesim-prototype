/** LOT-A: one canonical property surface shared by navigation, touch and renderer.
 * The outside is neither a fake indoor floor nor a second scene / clock.
 */
import {BUILD_LOT,constructionContains} from './construction.js';

export const OUTDOORS_SCHEMA=1;
export const LOT_ACTOR_CLEARANCE=.26;
export const YARD_SURFACE_Y=-.53;
export const HOUSE_SURFACE_Y=0;

export function newOutdoorsWorld(){
  return {schema:OUTDOORS_SCHEMA,revision:0};
}
export function restoreOutdoorsWorld(raw){
  return {schema:OUTDOORS_SCHEMA,
    revision:raw?.schema===OUTDOORS_SCHEMA&&Number.isSafeInteger(raw.revision)&&
      raw.revision>=0&&raw.revision<=100000000?raw.revision:0};
}
export function insideLot(x,z,margin=LOT_ACTOR_CLEARANCE){
  return Number.isFinite(x)&&Number.isFinite(z)&&Number.isFinite(margin)&&margin>=0&&
    x>=BUILD_LOT.minX+margin&&x<=BUILD_LOT.maxX-margin&&
    z>=BUILD_LOT.minZ+margin&&z<=BUILD_LOT.maxZ-margin;
}
/** Classify the *topmost* physical ground; never treat a yard tile as a roofable room. */
export function lotSurfaceAt(world,x,z){
  if(!insideLot(x,z))return {kind:'outside',y:null,walkable:false};
  if(constructionContains(world,x,z))
    return {kind:'floor',y:HOUSE_SURFACE_Y,walkable:true};
  return {kind:'yard',y:YARD_SURFACE_Y,walkable:true};
}
/** A real wall in the original cutaway room is still solid on west and north.
 * East/south were intentionally open in legacy household saves.
 */
export function legacyLotWallAt(construction,x,z,radius=LOT_ACTOR_CLEARANCE){
  if(construction?.legacy!==true)return false;
  const shell=construction.starterShell||{west:-10,east:28,north:-9,south:9};
  const west=shell.west*.5,north=shell.north*.5;
  const minX=west,maxX=shell.east*.5,minZ=north,maxZ=shell.south*.5;
  return (Math.abs(x-west)<=radius+.09&&z>=minZ-radius&&z<=maxZ+radius)||
    (Math.abs(z-north)<=radius+.09&&x>=minX-radius&&x<=maxX+radius);
}
/** Nearest visible supported plane along the actual PlayCanvas camera ray.
 * A tap on the sky or ground behind the edge of the property has no target.
 */
export function lotRaySurface(near,far,world){
  if(!near||!far||![near.x,near.y,near.z,far.x,far.y,far.z].every(Number.isFinite))
    return null;
  const dy=far.y-near.y;
  if(Math.abs(dy)<1e-9)return null;
  const options=[];
  for(const [y,kind] of [[HOUSE_SURFACE_Y,'floor'],[YARD_SURFACE_Y,'yard']]){
    const t=(y-near.y)/dy;
    if(t<0||t>1)continue;
    const x=near.x+(far.x-near.x)*t,z=near.z+(far.z-near.z)*t;
    if(lotSurfaceAt(world,x,z).kind===kind)options.push({x,z,y,kind,t});
  }
  options.sort((a,b)=>a.t-b.t);
  return options[0]||null;
}
/** 3D display offset, optional smoothing is owned by the existing avatar spring. */
export function lotActorHeight(world,position){
  return lotSurfaceAt(world,position?.x,position?.z).y??0;
}
