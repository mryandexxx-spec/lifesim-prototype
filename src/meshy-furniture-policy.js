import {MESHY_ROOM_V2_ENTRIES} from './meshy-room-v2-data.js';
/**
 * Cosmetic Meshy furniture catalog. No SKU, ownership, price, A* obstacle,
 * action/seat contact, mount or save changes. Values below are audited from
 * the exact optimized GLB POSITION accessors committed with this module.
 *
 * Source meshes are normalized by Meshy near [-0.5, +0.5]; these MUST be fit
 * to LifeSim's meter-like world dimensions (Alex/Mira ~2.05m display height).
 */
import {SOFA_LAYOUT,SOFA_POSE} from './pose-config.js';
import {BED_LAYOUT} from './bed-layout.js';
import {PURCHASED_SEAT_PROFILES} from './seat-furniture.js';
import {FURNITURE_CATALOG,furnitureRenderOrigin} from './furniture-catalog.js';

// The ratios are vertical ray intersections on the shipped triangles, measured
// from the floor to the occupied cushion or mattress as a fraction of GLB height.
// Fit art to the same support used by entry, exit, sleeping slots and foot IK.
const sofaTop=SOFA_LAYOUT.seatCenterY+SOFA_LAYOUT.seatHeight/2;
const chairTop=PURCHASED_SEAT_PROFILES.armchair.seatHeight;
const mattressTop=BED_LAYOUT.mattressY+BED_LAYOUT.mattressHeight/2;
const frontAtPositiveZ=new Set(['sofa','armchair','mirror','dresser','wardrobe','walllight']);

const entries=[
 // sku, prefabId, desired height in LifeSim world units, raw bounds min/max
 ['sofa.comfort','sofa',sofaTop/.555,[-.500,-.246,-.208],[.500,.244,.211]],
 ['sofa.loft','sofa',sofaTop/.535,[-.500,-.228,-.214],[.500,.222,.215]],
 ['armchair.wing','armchair',chairTop/.41,[-.375,-.500,-.390],[.374,.500,.389]],
 ['armchair.shell','armchair',chairTop/.565,[-.500,-.500,-.420],[.500,.500,.419]],
 ['bed.platform','bed',mattressTop/.625,[-.397,-.263,-.500],[.398,.261,.500]],
 ['bookcase.starter','bookcase',2.04,[-.322,-.500,-.218],[.324,.500,.216]],
 ['dresser.reed','dresser',1.19,[-.428,-.500,-.247],[.424,.500,.247]],
 ['floorlamp.tripod','floorlamp',2.04,[-.216,-.500,-.210],[.213,.500,.212]],
 ['legacy.plant','plant',1.53,[-.398,-.500,-.235],[.397,.500,.231]],
 ['mirror.panel','mirror',1.94,[-.214,-.500,-.154],[.203,.500,.153]],
 ['plant.palm','plant',1.87,[-.336,-.500,-.340],[.337,.499,.338]],
 // Meshy reconstructed flat woven rugs standing vertically. X rotation
 // lays them flat; height is explicitly constrained to 2cm and walk-through.
 ['rug.geo','rug',.018,[-.500,-.241,-.306],[.500,.242,.302]],
 ['rug.weave','rug',.018,[-.500,-.287,-.032],[.500,.287,.032]],
 // C3's authorized mount y/side remains authoritative; art centered on it.
 ['sconce.halo','walllight',.57,[-.315,-.500,-.497],[.313,.500,.500]],
 ['wardrobe.classic','wardrobe',2.24,[-.305,-.500,-.163],[.300,.500,.160]]
];
export const MESHY_FURNITURE_DIR='./assets/furniture/meshy-room-v1/';
export const MESHY_FURNITURE_SPECS=Object.freeze(Object.fromEntries(entries.map(
 ([sku,prefabId,height,min,max])=>[sku,Object.freeze({
   sku,prefabId,height,
   bounds:Object.freeze({min:Object.freeze([...min]),max:Object.freeze([...max])}),
   orientation:prefabId==='rug'?'flat':'upright',
   mount:prefabId==='walllight'?'wall':'floor'
 })]
)));
export const MESHY_FURNITURE_SKUS=Object.freeze(Object.keys(MESHY_FURNITURE_SPECS));
export const MESHY_FURNITURE_DISPLAY_HEIGHT=2.05; // same as Alex/Mira
export const MESHY_ROOM_V2_SPECS=Object.freeze(Object.fromEntries(
  MESHY_ROOM_V2_ENTRIES.map(item=>[item.sku,Object.freeze({
    ...item,bounds:Object.freeze({min:Object.freeze(item.bounds.min),max:Object.freeze(item.bounds.max)})
  })])));
export const MESHY_ROOM_V2_SKUS=Object.freeze(Object.keys(MESHY_ROOM_V2_SPECS));


export function meshyFurnitureSpec(sku){
  if(typeof sku!=='string')return null;
  if(Object.hasOwn(MESHY_FURNITURE_SPECS,sku))return MESHY_FURNITURE_SPECS[sku];
  return Object.hasOwn(MESHY_ROOM_V2_SPECS,sku)?MESHY_ROOM_V2_SPECS[sku]:null;
}
export function meshyFurnitureUrl(sku){
  if(!meshyFurnitureSpec(sku))return null;
  return Object.hasOwn(MESHY_ROOM_V2_SPECS,sku)
    ?'./assets/furniture/meshy-room-v2/'+MESHY_ROOM_V2_SPECS[sku].slug+'.glb'
    :MESHY_FURNITURE_DIR+sku+'.glb';
}
/** Store thumbnails always use the same actual mesh as 3D placement. */
export function meshyFurnitureThumbnailUrl(sku){
  const spec=meshyFurnitureSpec(sku);
  if(!spec)return null;
  return Object.hasOwn(MESHY_ROOM_V2_SPECS,sku)
    ?'./assets/furniture/meshy-room-v2/thumbnails/'+spec.slug+'.png'
    :'./assets/furniture/meshy-room-v1/thumbnails/'+sku+'.png';
}

/**
 * The fit spans the existing, conservative game footprint, preserving all
 * actual interaction approach points and never changing the physics.
 * Return scale axes in the ORIGINAL GLB's coordinate system. For rugs, a
 * parent -90deg X pivot maps original Y->horizontal Z, Z->vertical Y.
 */
export function meshyFurnitureFit(sku){
  const spec=meshyFurnitureSpec(sku);
  if(!spec)return null;
  const def=FURNITURE_CATALOG[spec.prefabId];
  if(!def)throw Error('Missing footprint for '+sku);
  const width=(def.footprint.maxX-def.footprint.minX)*.93;
  const fullDepth=(def.footprint.maxZ-def.footprint.minZ)*.93;
  // Collision includes the front skirt and padding of the old prefab. Keep
  // the rear within that envelope, but end the new cushion before the shins.
  const seatZ=spec.prefabId==='sofa'?SOFA_POSE.z-furnitureRenderOrigin('sofa').z
    :PURCHASED_SEAT_PROFILES[spec.prefabId]?.seatZ??null;
  const front=seatZ===null?-fullDepth/2:seatZ-.30;
  const depth=fullDepth/2-front;
  const centerZ=(front+fullDepth/2)/2;
  const {min,max}=spec.bounds;
  const size=[0,1,2].map(i=>max[i]-min[i]);
  if(size.some(x=>!Number.isFinite(x)||x<=0))throw Error('Invalid GLB bounds: '+sku);
  const flat=spec.orientation==='flat';
  const sx=width/size[0];
  const scale=flat
    ? {x:sx,y:depth/size[1],z:spec.height/size[2]}
    : {x:sx,y:spec.height/size[1],z:depth/size[2]};
  // Rotation is a cosmetic pivot; the old collision footprint remains canonical.
  const roomYaw={'legacy.tv':-90,'fixture.shower':90,'fixture.toilet':180,
    'chair.loft':180,'prep.oak':180,'sink.farm':180,'stove.modern':180};
  const yaw=roomYaw[sku]??spec.rotationY??0;
  if(Object.hasOwn(MESHY_ROOM_V2_SPECS,sku)){
    const rawCenter=side=>(min[side]+max[side])/2;
    const height=sku==='chair.loft'?PURCHASED_SEAT_PROFILES.chair.seatHeight/.49:spec.height;
    const quarter=Math.abs(yaw)===90;
    const v2scale={x:(quarter?depth:width)/size[0],
      y:height/size[1],z:(quarter?width:depth)/size[2]};
    const cx=rawCenter(0)*v2scale.x,cz=rawCenter(2)*v2scale.z;
    const y=spec.mount==='wall'?1.65-rawCenter(1)*v2scale.y
      :spec.mount==='ceiling'?-max[1]*v2scale.y:-min[1]*v2scale.y;
    const sin=Math.round(Math.sin(yaw*Math.PI/180)),cos=Math.round(Math.cos(yaw*Math.PI/180));
    const offset={x:-cx*cos-cz*sin,y,z:centerZ+cx*sin-cz*cos};
    return Object.freeze({sku,prefabId:spec.prefabId,rotationX:0,
      rotationY:yaw,scale:Object.freeze(v2scale),offset:Object.freeze(offset),
      footprint:Object.freeze({width,depth,height}),
      mount:spec.mount});
  }
  // The root of purchased furniture is at its floor-cell center. Walllights
  // instead inherit the canonical C3 vertical wall mount and must be centered.
  const rotationY=frontAtPositiveZ.has(spec.prefabId)?180:0;
  const direction=rotationY?-1:1;
  const offset={
    x:-direction*(min[0]+max[0])*scale.x/2,
    y:flat ? -min[2]*scale.z+.006
      :spec.mount==='wall' ? -(min[1]+max[1])*scale.y/2
      :-min[1]*scale.y,
    z:flat ? (min[1]+max[1])*scale.y/2
      :centerZ-direction*(min[2]+max[2])*scale.z/2
  };
  return Object.freeze({
    sku,prefabId:spec.prefabId,rotationX:flat?-90:0,rotationY,
    scale:Object.freeze(scale),offset:Object.freeze(offset),
    footprint:Object.freeze({width,depth,height:spec.height}),
    mount:spec.mount
  });
}


/**
 * Visual aliases for original saved furniture. This is NEVER written to
 * household/world data: older saves retain the same instance IDs and SKUs.
 * Only products whose prefab has a matching Meshy model can be substituted.
 */
export const MESHY_STARTER_SKUS=Object.freeze({
  sofa:'sofa.comfort',
  bed:'bed.platform',
  plant:'legacy.plant',
  nightstand:'nightstand.open',table:'legacy.table',tv:'legacy.tv',
  fridge:'fixture.fridge',shower:'fixture.shower',toilet:'fixture.toilet'
});
export function meshyStarterFurnitureSku(prefabId){
  return typeof prefabId==='string'&&
    Object.hasOwn(MESHY_STARTER_SKUS,prefabId)
    ?MESHY_STARTER_SKUS[prefabId]:null;
}
export function meshyFurnitureDisplaySku(itemId){
  if(meshyFurnitureSpec(itemId))return itemId;
  if(itemId==='legacy.sofa')return 'sofa.comfort';
  if(itemId==='legacy.bed')return 'bed.platform';
  if(itemId==='legacy.nightstand')return 'nightstand.open';
  return null;
}
