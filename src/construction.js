/**
 * F5-A: authoritative, renderer-free one-storey construction world.
 * Grid edges are canonical: h:i,j spans [i,i+1] on X; v:i,j spans [j,j+1] on Z.
 * The legacy floor/fixtures keep their exact transforms and save schema v1.
 */
import {ROOF_MAX_MODULES,validRoofSettings,validRoofModule,roofRect,
  roofRectSupported,roofsOverlap,roofContains,roofAutomaticModules}
  from './roof-construction.js';
import {BUILD_WALL_HEIGHTS,BUILD_FACADE_FINISHES,BUILD_PORCH_FINISHES,
  exteriorWallSegments,porchFootprint,porchFootprints} from './exterior-construction.js';
export {BUILD_WALL_HEIGHTS,BUILD_FACADE_FINISHES,BUILD_PORCH_FINISHES}
  from './exterior-construction.js';
export const BUILD_STEP=.5;
// F5-B: immutable, original stylized interior finishes. IDs, not colors,
// are persisted in construction.materials so visual assets may later change.
export const BUILD_FINISHES=Object.freeze({
  floor:Object.freeze({
    'floor.default':{label:'Исходный пол',color:'#e4cdb4'},
    'floor.oak':{label:'Тёплый дуб',color:'#b58f68'},
    'floor.ash':{label:'Светлый ясень',color:'#d6c2a4'},
    'floor.tile':{label:'Слоновая керамика',color:'#ece7d9'},
    'floor.slate':{label:'Графитовая плитка',color:'#788688'},
    'floor.clay':{label:'Терракота',color:'#be8469'},
    'floor.planks-x':{label:'Доски вдоль дома',color:'#bb956e',pattern:'planks-x'},
    'floor.planks-z':{label:'Доски поперёк',color:'#bb956e',pattern:'planks-z'},
    'floor.mosaic':{label:'Мозаика',color:'#d6cab0',pattern:'mosaic'}
  }),
  wall:Object.freeze({
    'wall.default':{label:'Исходные стены',color:'#f5ebda'},
    'wall.cream':{label:'Тёплый лён',color:'#e4d4b7'},
    'wall.sage':{label:'Шалфей',color:'#acc3a9'},
    'wall.blue':{label:'Тихий голубой',color:'#a6c5cf'},
    'wall.rose':{label:'Пудровый розовый',color:'#ddbaa9'},
    'wall.olive':{label:'Мягкая олива',color:'#b9bc8a'},
    'wall.sand':{label:'Песчаная штукатурка',color:'#c8b497'},
    'wall.stripes':{label:'Обои с полосами',color:'#d8e1d2',pattern:'stripes'},
    'wall.panels':{label:'Стеновые панели',color:'#d7c5a9',pattern:'panels'}
  }),
  ceiling:Object.freeze({
    'ceiling.default':{label:'Без отделки',color:'#f5eee0'},
    'ceiling.chalk':{label:'Меловой белый',color:'#f4f1e7'},
    'ceiling.cream':{label:'Сливочный',color:'#e8ddc7'},
    'ceiling.sage':{label:'Дымчатый шалфей',color:'#c5d1bc'},
    'ceiling.blue':{label:'Светлый небесный',color:'#d4e3e7'}
  })
});
// F5-B.2: stable, license-free procedural opening designs. The width is
// measured in canonical .5m wall sections, not a decorative scale factor.
export const BUILD_OPENING_STYLES=Object.freeze({
  'door.simple':Object.freeze({type:'door',label:'Простая дверь · 1,5 м',sections:3,finish:'wood'}),
  'door.glass':Object.freeze({type:'door',label:'Стеклянная дверь · 1,5 м',sections:3,finish:'glass'}),
  'door.double':Object.freeze({type:'door',label:'Двустворчатая · 2 м',sections:4,finish:'double'}),
  'arch.round':Object.freeze({type:'arch',label:'Открытая арка · 1,5 м',sections:3,finish:'round'}),
  'arch.wide':Object.freeze({type:'arch',label:'Широкая арка · 2 м',sections:4,finish:'wide'}),
  'window.classic':Object.freeze({type:'window',label:'Обычное окно · 1,5 м',sections:3,finish:'classic'}),
  'window.panorama':Object.freeze({type:'window',label:'Панорамное · 2 м',sections:4,finish:'panorama'}),
  'window.high':Object.freeze({type:'window',label:'Высокое окно · 1,5 м',sections:3,finish:'high'}),
  'window.slim':Object.freeze({type:'window',label:'Узкое окно · 1,5 м',sections:3,finish:'slim'})
});
export const BUILD_DEFAULT_OPENING_STYLE=Object.freeze({
  door:'door.simple',window:'window.classic',arch:'arch.round'
});
export function constructionOpeningStyle(opening){
  const raw=BUILD_OPENING_STYLES[opening?.styleId];
  return raw?.type===opening?.type&&raw.sections===opening?.edgeIds?.length
    ?opening.styleId:BUILD_DEFAULT_OPENING_STYLE[opening?.type]||null;
}
export const BUILD_LOT=Object.freeze({minX:-9,maxX:23,minZ:-12,maxZ:12});
const BASE=Object.freeze({minI:-10,maxI:28,minJ:-9,maxJ:9});
// Old cutaway: opaque west/north, open right/front. Preserve original geometry
// while making all four extents a serializable, editable construction entity.
export const STARTER_SHELL=Object.freeze({
  west:BASE.minI,east:BASE.maxI,north:BASE.minJ,south:BASE.maxJ
});
const STARTER_SIDE=Object.freeze({west:-1,east:1,north:-1,south:1});
// Original-house walls have the same per-cell identity as constructed walls.
// Stable orthogonal indices survive moving the entire starter side.
const starterSide=id=>typeof id==='string'
  ?(/^starter:(west|east|north|south)(?::-?[0-9]+)?$/.exec(id)?.[1]||null):null;
const starterEdgeId=(side,index)=>'starter:'+side+':'+index;
const starterIndex=id=>{
  const match=/^starter:(west|east|north|south):(-?[0-9]+)$/.exec(id||'');
  return match?Number(match[2]):null;
};
function validStarter(raw){
  if(!raw||!Object.keys(STARTER_SHELL).every(k=>Number.isSafeInteger(raw[k])))
    return {...STARTER_SHELL};
  const s={west:raw.west,east:raw.east,north:raw.north,south:raw.south};
  if(s.west>STARTER_SHELL.west||s.east<STARTER_SHELL.east||
    s.north>STARTER_SHELL.north||s.south<STARTER_SHELL.south||
    s.west<BUILD_LOT.minX/BUILD_STEP||s.east>BUILD_LOT.maxX/BUILD_STEP||
    s.north<BUILD_LOT.minZ/BUILD_STEP||s.south>BUILD_LOT.maxZ/BUILD_STEP)return {...STARTER_SHELL};
  return s;
}
export function starterShellSegments(world){
  const s=validStarter(world?.starterShell),segments=[];
  for(let j=s.north;j<s.south;j++)for(const [side,i] of [['west',s.west],['east',s.east]])
    segments.push({id:starterEdgeId(side,j),axis:'v',i,j,starterSide:side,sideId:'starter:'+side});
  for(let i=s.west;i<s.east;i++)for(const [side,j] of [['north',s.north],['south',s.south]])
    segments.push({id:starterEdgeId(side,i),axis:'h',i,j,starterSide:side,sideId:'starter:'+side});
  return segments;
}
export function constructionWallSegments(world){
  const state=world?.construction||world;
  const removed=new Set(state?.starterRemoved||[]);
  return [...(state?.wallEdges||[]),...starterShellSegments(state).filter(w=>!removed.has(w.id))];
}
/** Real exterior surface topology, not the camera's temporary wall cutaway. */
export function constructionExteriorSegments(world){
  const state=world?.construction||world;
  return exteriorWallSegments(state,constructionWallSegments(state));
}
export function constructionPorches(world){
  const state=world?.construction||world;
  return porchFootprints(state,constructionWallSegments(state))
    .filter(p=>p.footprint);
}
// One physical wall may carry both a pre-F5-A structural edge and a
// virtual starter edge (e.g. east boundary of the old home + new room).
// An opening cuts the SAME place through both render/collision layers.
export function constructionOpeningEdgeIds(world,types=null){
  const state=world?.construction||world,ids=new Set();
  for(const opening of state?.openings||[])
    if(!types||types.includes(opening.type))
      for(const id of opening.edgeIds)ids.add(id);
  if(!ids.size)return ids;
  for(const wall of starterShellSegments(state)){
    const physical=edge(wall.axis,wall.i,wall.j);
    if(ids.has(wall.id)||ids.has(physical)){
      ids.add(wall.id);ids.add(physical);
    }
  }
  return ids;
}
export function starterShellOffset(world,side){
  const s=validStarter(world?.starterShell);
  return (s[side]-STARTER_SHELL[side])*BUILD_STEP;
}
const finite=Number.isFinite;
const cell=(i,j)=>i+','+j;
const edge=(axis,i,j)=>axis+':'+i+','+j;
const floorIndex=p=>Math.floor(p/BUILD_STEP);
const snap=p=>Math.round(p/BUILD_STEP);
const clone=v=>JSON.parse(JSON.stringify(v));
const topologyCache=new WeakMap();
function topology(state){
  let found=topologyCache.get(state);
  if(!found){found={floors:new Set(state.floorCells),
    doors:constructionOpeningEdgeIds(state,['door','arch']),
    removed:new Set(state.starterRemoved||[]),solid:new Set(state.starterSolidSides||[]),
    porches:new Set(constructionPorches(state).flatMap(p=>p.footprint.cells))};
    topologyCache.set(state,found);}
  return found;
}
const fail=reason=>({ok:false,reason});
function isBase(i,j){return i>=BASE.minI&&i<BASE.maxI&&j>=BASE.minJ&&j<BASE.maxJ;}
function lotCell(i,j){return i>=BUILD_LOT.minX/BUILD_STEP&&i<BUILD_LOT.maxX/BUILD_STEP&&j>=BUILD_LOT.minZ/BUILD_STEP&&j<BUILD_LOT.maxZ/BUILD_STEP;}
export function newConstructionWorld(){
  const floorCells=[];
  for(let i=BASE.minI;i<BASE.maxI;i++)for(let j=BASE.minJ;j<BASE.maxJ;j++)floorCells.push(cell(i,j));
  return {schema:1,revision:0,lot:{...BUILD_LOT},step:BUILD_STEP,floorCells,wallEdges:[],openings:[],
    materials:{floor:{},wall:{}},roofModules:[],legacy:true,nextId:1,
    starterShell:{...STARTER_SHELL},starterOwned:[],starterRemoved:[],starterSolidSides:[]};
}
export function restoreConstructionWorld(raw){
  const initial=newConstructionWorld();
  if(raw?.schema!==1||raw.step!==BUILD_STEP||!Array.isArray(raw.floorCells)||
    !Array.isArray(raw.wallEdges)||!Array.isArray(raw.openings)||
    raw.floorCells.length>5000||raw.wallEdges.length>6000||raw.openings.length>600)return initial;
  const floors=new Set(initial.floorCells);
  for(const key of raw.floorCells){
    if(typeof key!=='string'||!/^[-]?\d+,[-]?\d+$/.test(key))return initial;
    const [i,j]=key.split(',').map(Number);
    if(!Number.isSafeInteger(i)||!Number.isSafeInteger(j)||!lotCell(i,j))return initial;
    floors.add(cell(i,j));
  }
  const shell=validStarter(raw.starterShell),owned=new Set();
  if(Array.isArray(raw.starterOwned)&&raw.starterOwned.length<=5000){
    for(const key of raw.starterOwned){
      if(typeof key!=='string'||!/^[-]?\d+,[-]?\d+$/.test(key))continue;
      const [i,j]=key.split(',').map(Number);
      if(!isBase(i,j)&&i>=shell.west&&i<shell.east&&j>=shell.north&&j<shell.south&&
        floors.has(key))owned.add(key);
    }
  }
  // Defensive recovery: partial saves may contain shell bounds without strips.
  for(let i=shell.west;i<shell.east;i++)for(let j=shell.north;j<shell.south;j++){
    const key=cell(i,j);
    if(!floors.has(key)){floors.add(key);if(!isBase(i,j))owned.add(key);}
  }
  const virtual=new Set(starterShellSegments({starterShell:shell}).map(w=>w.id));
  const starterRemoved=Array.isArray(raw.starterRemoved)&&raw.starterRemoved.length<500
    ?[...new Set(raw.starterRemoved.filter(id=>typeof id==='string'&&virtual.has(id)))]:[];
  const starterSolidSides=Array.isArray(raw.starterSolidSides)
    ?[...new Set(raw.starterSolidSides.filter(side=>side==='east'||side==='south'))]:[];
  const walls=[],keys=new Set();
  for(const value of raw.wallEdges){
    if(!value||!['h','v'].includes(value.axis)||!Number.isSafeInteger(value.i)||!Number.isSafeInteger(value.j)||
      !lotCell(value.i,value.j)||!/^([hv]):[-]?\d+,[-]?\d+$/.test(value.id||'')||
      value.id!==edge(value.axis,value.i,value.j)||keys.has(value.id))return initial;
    keys.add(value.id);
    walls.push({id:value.id,axis:value.axis,i:value.i,j:value.j,heightClass:'normal'});
  }
  const openings=[],openingKeys=new Set();
  for(const rawOpening of raw.openings){
    if(!rawOpening||!['door','window','arch'].includes(rawOpening.type)||
      typeof rawOpening.id!=='string'||openingKeys.has(rawOpening.id)||
      !Array.isArray(rawOpening.edgeIds)||rawOpening.edgeIds.length<1||
      rawOpening.edgeIds.length>4||!rawOpening.edgeIds.every(k=>(keys.has(k)||virtual.has(k))&&!starterRemoved.includes(k)))return initial;
    openingKeys.add(rawOpening.id);
    const ids=[...new Set(rawOpening.edgeIds)];
    // Old F5-A door/window records intentionally keep their missing styleId,
    // while valid new variants retain their immutable identifier.
    const variant=BUILD_OPENING_STYLES[rawOpening.styleId];
    const styleId=variant?.type===rawOpening.type&&variant.sections===ids.length
      ?rawOpening.styleId:null;
    openings.push({id:rawOpening.id,type:rawOpening.type,edgeIds:ids,
      ...(styleId?{styleId}:{})});
  }
  for(const o of openings)for(const id of o.edgeIds){
    const side=starterSide(id);
    if((side==='east'||side==='south')&&!starterSolidSides.includes(side))starterSolidSides.push(side);
  }
  // Restore only known finite finish IDs attached to real surfaces. Unknown
  // palette IDs or retired wall/floor coordinates must not poison a v1 save.
  const materials={floor:{},wall:{}};
  const rawFloor=raw.materials?.floor,rawWall=raw.materials?.wall;
  if(rawFloor&&typeof rawFloor==='object'&&!Array.isArray(rawFloor))
    for(const [key,id] of Object.entries(rawFloor).slice(0,4000))
      if(floors.has(key)&&Object.hasOwn(BUILD_FINISHES.floor,id)&&id!=='floor.default')
        materials.floor[key]=id;
  if(rawWall&&typeof rawWall==='object'&&!Array.isArray(rawWall))
    for(const [key,faces] of Object.entries(rawWall).slice(0,5000)){
      if(!keys.has(key)&&!['starter:west','starter:east','starter:north','starter:south'].includes(key))continue;
      if(!faces||typeof faces!=='object'||Array.isArray(faces))continue;
      const stored={};
      for(const side of ['a','b'])if(Object.hasOwn(BUILD_FINISHES.wall,faces[side])&&faces[side]!=='wall.default')
        stored[side]=faces[side];
      if(Object.keys(stored).length)materials.wall[key]=stored;
    }
  // Optional F5-B.4 extension: old v1 saves retain their floor/wall shape.
  const rawCeiling=raw.materials?.ceiling;
  if(rawCeiling&&typeof rawCeiling==='object'&&!Array.isArray(rawCeiling)){
    const ceiling={};
    for(const [key,id] of Object.entries(rawCeiling).slice(0,4000))
      if(floors.has(key)&&Object.hasOwn(BUILD_FINISHES.ceiling,id)&&
        id!=='ceiling.default')ceiling[key]=id;
    if(Object.keys(ceiling).length)materials.ceiling=ceiling;
  }
  // F5-C.2: independently sanitize optional exterior coats and wall height.
  const wallHeightClass=Object.hasOwn(BUILD_WALL_HEIGHTS,raw.wallHeightClass)
    ?raw.wallHeightClass:'normal';
  const rawFacade=raw.materials?.facade;
  if(rawFacade&&typeof rawFacade==='object'&&!Array.isArray(rawFacade)){
    const facade={},validEdges=new Set([...keys,...virtual]);
    for(const [id,materialId] of Object.entries(rawFacade).slice(0,5000))
      if(validEdges.has(id)&&!starterRemoved.includes(id)&&
        Object.hasOwn(BUILD_FACADE_FINISHES,materialId)&&materialId!=='facade.default')
        facade[id]=materialId;
    if(Object.keys(facade).length)materials.facade=facade;
  }
  // Porches are anchored to immutable door IDs; never trust user-supplied mesh
  // coordinates, and never add their exterior deck to the automatic roof floor.
  const originalWalls=[...walls,...starterShellSegments({starterShell:shell})
    .filter(w=>!starterRemoved.includes(w.id))];
  const originalWorld={floorCells:[...floors],openings,wallEdges:walls,
    starterShell:shell,starterRemoved,starterSolidSides};
  const porches=[],occupiedPorch=new Set();
  if(Array.isArray(raw.porches)&&raw.porches.length<=32)
    for(const entry of raw.porches){
      if(!entry||typeof entry.id!=='string'||!/^porch-[0-9]+$/.test(entry.id)||
        porches.some(p=>p.id===entry.id||p.openingId===entry.openingId)||
        !Object.hasOwn(BUILD_PORCH_FINISHES,entry.materialId))continue;
      const door=openings.find(o=>o.id===entry.openingId);
      const deck=porchFootprint(originalWorld,door,originalWalls,entry.depthSections);
      if(!deck||deck.cells.some(c=>occupiedPorch.has(c)))continue;
      deck.cells.forEach(c=>occupiedPorch.add(c));
      porches.push({id:entry.id,openingId:entry.openingId,
        depthSections:entry.depthSections,materialId:entry.materialId});
    }
  // Old saves always have roofModules:[]; sanitize optional v1 roof records
  // independently rather than discard an entire household for bad roof data.
  const storedRoofs=Array.isArray(raw.roofModules)&&raw.roofModules.length<=ROOF_MAX_MODULES
    ?raw.roofModules:[];
  const roofModules=[],roofIds=new Set();
  for(const entry of storedRoofs){
    const valid=validRoofModule(entry,floors,roofIds,roofModules);
    if(valid){roofModules.push(valid);roofIds.add(valid.id);}
  }
  const autoSettings=raw.roofAuto===true?validRoofSettings(storedRoofs[0]):null;
  const rebuiltAuto=autoSettings?roofAutomaticModules(floors,autoSettings):null;
  const cleanRoofs=rebuiltAuto||roofModules;
  const roofAuto=Boolean(rebuiltAuto);
  return {...initial,materials,roofModules:cleanRoofs,...(roofAuto?{roofAuto:true}:{}),
    ...(wallHeightClass!=='normal'?{wallHeightClass}:{}),
    ...(porches.length?{porches}:{}),
    revision:Number.isSafeInteger(raw.revision)?Math.min(raw.revision,1e8):0,
    legacy:raw.legacy===true&&walls.length===0&&openings.length===0&&starterRemoved.length===0&&
      starterSolidSides.length===0&&floors.size===initial.floorCells.length&&
      Object.keys(STARTER_SHELL).every(k=>shell[k]===STARTER_SHELL[k]),
    starterShell:shell,starterOwned:[...owned],starterRemoved,starterSolidSides,
    nextId:Number.isSafeInteger(raw.nextId)&&raw.nextId>=1&&raw.nextId<1e8?raw.nextId:1,
    floorCells:[...floors],wallEdges:walls,openings};
}
export function constructionContains(world,x,z){
  if(!finite(x)||!finite(z))return false;
  const state=world?.construction||world;
  if(!state||state.schema!==1)return x>=-4.62&&x<=13.86&&z>=-3.96&&z<=3.98;
  if(state.legacy)return x>=-4.62&&x<=13.86&&z>=-3.96&&z<=3.98;
  const topo=topology(state),key=cell(floorIndex(x),floorIndex(z));
  return topo.floors.has(key)||topo.porches.has(key);
}
/** A full wall can never be traversed, windows never act as doors. */
export function constructionWallAt(world,x,z,radius=.26){
  const state=world?.construction||world;
  if(!state||state.legacy)return false;
  const topo=topology(state),opened=topo.doors;
  // East/south were cosmetic cutaway in historic saves. An explicit user
  // opening turns that side into a real wall with a proper navigation portal.
  const shell=validStarter(state.starterShell);
  const clear=(side,index)=>topo.removed.has(starterEdgeId(side,index))||
    opened.has(starterEdgeId(side,index))||
    ((side==='east'||side==='south')&&!topo.solid.has(side));
  for(const side of ['west','east']){
    const i=shell[side],j=floorIndex(z),xx=i*BUILD_STEP;
    if(Math.abs(x-xx)<radius+.055)for(const at of [j-1,j,j+1])
      if(at>=shell.north&&at<shell.south&&
        z>=at*BUILD_STEP-radius&&z<=(at+1)*BUILD_STEP+radius&&
        !clear(side,at))return true;
  }
  for(const side of ['north','south']){
    const j=shell[side],i=floorIndex(x),zz=j*BUILD_STEP;
    if(Math.abs(z-zz)<radius+.055)for(const at of [i-1,i,i+1])
      if(at>=shell.west&&at<shell.east&&
        x>=at*BUILD_STEP-radius&&x<=(at+1)*BUILD_STEP+radius&&
        !clear(side,at))return true;
  }
  for(const w of state.wallEdges){
    if(opened.has(w.id))continue;
    const bx=w.i*BUILD_STEP,bz=w.j*BUILD_STEP;
    const near=w.axis==='h'
      ?Math.abs(z-bz)<radius+.055&&x>=bx-radius&&x<=bx+BUILD_STEP+radius
      :Math.abs(x-bx)<radius+.055&&z>=bz-radius&&z<=bz+BUILD_STEP+radius;
    if(near)return true;
  }
  return false;
}
export function constructionBounds(world){
  const state=world?.construction||world;
  const cs=state?.floorCells||newConstructionWorld().floorCells;
  let minI=Infinity,maxI=-Infinity,minJ=Infinity,maxJ=-Infinity;
  for(const k of cs){const [i,j]=k.split(',').map(Number);minI=Math.min(i,minI);maxI=Math.max(i+1,maxI);minJ=Math.min(j,minJ);maxJ=Math.max(j+1,maxJ);}
  return {minX:minI*BUILD_STEP,maxX:maxI*BUILD_STEP,minZ:minJ*BUILD_STEP,maxZ:maxJ*BUILD_STEP};
}

/** Direction of a room's outward-facing wall. For interior partitions returns null:
 * no room ownership can be inferred from a single shared wall.
 */
export function constructionWallOutward(world,edgeId){
  const side=starterSide(edgeId);
  if(Object.hasOwn(STARTER_SIDE,side))return STARTER_SIDE[side];
  const w=world?.wallEdges?.find(w=>w.id===edgeId);
  if(!w)return null;
  const floors=topology(world).floors;
  const sideA=w.axis==='v'?floors.has(cell(w.i-1,w.j)):floors.has(cell(w.i,w.j-1));
  const sideB=floors.has(cell(w.i,w.j));
  if(sideA===sideB)return null;
  // A is west/north, B is east/south; move away from the occupied cell.
  return sideA?1:-1;
}

export function nearestConstructionEdge(world,point,maxDistance=.38){
  if(!finite(point?.x)||!finite(point?.z))return null;
  let best=null,distance=Infinity;
  for(const w of constructionWallSegments(world)){
    const a=w.i*BUILD_STEP,b=w.j*BUILD_STEP;
    const d=w.axis==='h'
      ?Math.hypot(point.x-Math.max(a,Math.min(a+BUILD_STEP,point.x)),point.z-b)
      :Math.hypot(point.x-a,point.z-Math.max(b,Math.min(b+BUILD_STEP,point.z)));
    if(d<distance){best=w;distance=d;}
  }
  return distance<=maxDistance?best:null;
}
// Choose contiguous physical segments. A four-part opening can anchor at
// either of its two middle sections; never leave a half-hole at a corner.
function segmentsForOpening(walls,at,sections){
  if(!at)return null;
  const offsets=sections===4?[[-1,0,1,2],[-2,-1,0,1]]:[[-1,0,1]];
  for(const sequence of offsets){
    const ids=sequence.map(d=>at.starterSide
      ?starterEdgeId(at.starterSide,(at.axis==='h'?at.i:at.j)+d)
      :edge(at.axis,at.i+(at.axis==='h'?d:0),
        at.j+(at.axis==='v'?d:0)));
    if(ids.every(id=>walls.has(id)))return ids;
  }
  return null;
}
const overlap=(r,a)=>r.minX<a.maxX&&r.maxX>a.minX&&r.minZ<a.maxZ&&r.maxZ>a.minZ;
function editSegments(a,b){
  const i0=snap(a.x),j0=snap(a.z),i1=snap(b.x),j1=snap(b.z);
  if(i0===i1&&j0===j1)return null;
  if(i0!==i1&&j0!==j1)return null;
  const result=[];
  if(i0===i1)for(let j=Math.min(j0,j1);j<Math.max(j0,j1);j++)result.push({id:edge('v',i0,j),axis:'v',i:i0,j,heightClass:'normal'});
  else for(let i=Math.min(i0,i1);i<Math.max(i0,i1);i++)result.push({id:edge('h',i,j0),axis:'h',i,j:j0,heightClass:'normal'});
  return result;
}
function buildRect(a,b){
  if(!a||!b||![a.x,a.z,b.x,b.z].every(finite))return null;
  const [i0,i1]=[snap(a.x),snap(b.x)].sort((x,y)=>x-y);
  const [j0,j1]=[snap(a.z),snap(b.z)].sort((x,y)=>x-y);
  if(i1-i0<2||j1-j0<2)return null;
  const cells=[],walls=[];
  for(let i=i0;i<i1;i++)for(let j=j0;j<j1;j++)cells.push(cell(i,j));
  for(let i=i0;i<i1;i++)for(const j of [j0,j1])walls.push({id:edge('h',i,j),axis:'h',i,j,heightClass:'normal'});
  for(let j=j0;j<j1;j++)for(const i of [i0,i1])walls.push({id:edge('v',i,j),axis:'v',i,j,heightClass:'normal'});
  return {cells,walls};
}
/**
 * F5-D.1: a room is selected from topology, not a persistent room index.
 * Only a fully enclosed, rectangular, newly constructed room is eligible
 * for atomic geometry operations. Legacy furnished shell stays immutable.
 */
export function constructionRoomSelection(raw,at){
  const world=raw?.construction||raw;
  if(!finite(at?.x)||!finite(at?.z))return fail('room-not-found');
  const selected=constructionRooms(world).find(r=>
    r.cells.includes(cell(floorIndex(at.x),floorIndex(at.z))));
  if(!selected)return fail('room-not-found');
  const coordinates=selected.cells.map(k=>k.split(',').map(Number));
  const i0=Math.min(...coordinates.map(v=>v[0])),i1=Math.max(...coordinates.map(v=>v[0]))+1;
  const j0=Math.min(...coordinates.map(v=>v[1])),j1=Math.max(...coordinates.map(v=>v[1]))+1;
  if(coordinates.some(([i,j])=>isBase(i,j)||
    (i>=world.starterShell.west&&i<world.starterShell.east&&
      j>=world.starterShell.north&&j<world.starterShell.south)))
    return fail('room-protected');
  if(i1-i0<2||j1-j0<2||selected.cells.length!==(i1-i0)*(j1-j0)||
    selected.cells.length>512)return fail('room-not-rectangular');
  const edges=new Set(world.wallEdges.map(w=>w.id)),walls=[];
  for(let i=i0;i<i1;i++)for(const j of [j0,j1])walls.push(edge('h',i,j));
  for(let j=j0;j<j1;j++)for(const i of [i0,i1])walls.push(edge('v',i,j));
  if(walls.some(id=>!edges.has(id)))return fail('room-not-enclosed');
  return {ok:true,room:{i0,i1,j0,j1,width:i1-i0,height:j1-j0,
    cells:selected.cells,wallIds:walls}};
}
/** Pure preview; no state, queue, furniture, money or localStorage mutation. */
export function proposeConstructionEdit(raw,command,{furniture=[],furnitureBoxes=[],residents=[],wallDecor=[],movableFurnitureIds=[]}={}){
  const world=restoreConstructionWorld(raw);
  if(!command||typeof command.type!=='string')return fail('invalid-command');
  let floors=new Set(world.floorCells),walls=new Map(world.wallEdges.map(w=>[w.id,w]));
  let openings=[...world.openings],nextId=world.nextId;
  let roofModules=world.roofModules.map(roof=>({...roof})),roofAuto=world.roofAuto===true;
  let porches=(world.porches||[]).map(p=>({...p}));
  let wallHeightClass=world.wallHeightClass||'normal';
  const materials=clone(world.materials);
  let starterShell={...world.starterShell},starterOwned=new Set(world.starterOwned);
  const starterRemoved=new Set(world.starterRemoved||[]);
  const starterSolidSides=new Set(world.starterSolidSides||[]);
  const starterEdges=()=>starterShellSegments({starterShell}).filter(w=>!starterRemoved.has(w.id));
  const allWalls=()=>new Map([...walls,...starterEdges().map(w=>[w.id,w])]);
  const physicalEdgeIds=ids=>{
    const known=allWalls();
    return new Set(ids.map(id=>{
      const e=known.get(id);
      return e?edge(e.axis,e.i,e.j):id;
    }));
  };
  const overlapsOpening=(ids,except=null)=>{
    const positions=physicalEdgeIds(ids);
    return openings.some(o=>o.id!==except&&
      [...physicalEdgeIds(o.edgeIds)].some(id=>positions.has(id)));
  };
  const openingFitsDecor=ids=>{
    const records=ids.map(id=>allWalls().get(id)).filter(Boolean);
    if(!records.length)return false;
    // A new structural edge built on the old perimeter is still the SAME
    // physical surface as its starter counterpart, including its artwork.
    const side=records[0].starterSide||
      starterEdges().find(w=>w.axis===records[0].axis&&
        w.i===records[0].i&&w.j===records[0].j)?.starterSide;
    if(!side)return true;
    const first=Math.min(...records.map(e=>(e.axis==='h'?e.i:e.j)*BUILD_STEP));
    const last=Math.max(...records.map(e=>(e.axis==='h'?e.i:e.j)*BUILD_STEP+BUILD_STEP));
    // Authored landscape and left-wall bookshelf are not movable shop items:
    // never delete them to create a doorway. The prebuilt window may be
    // replaced by hiding its visual mesh, but not its data or identity.
    if(side==='north'&&first<.92&&last>-.53)return false;
    if(side==='west'&&first<.90&&last>-.93)return false;
    const line=starterShell[side]*BUILD_STEP;
    for(const decor of wallDecor){
      if(!finite(decor?.x)||!finite(decor?.z))continue;
      const along=(side==='north'||side==='south')?decor.x:decor.z;
      const across=(side==='north'||side==='south')?decor.z:decor.x;
      if(Math.abs(across-line)>.6)continue;
      const pad=finite(decor.radius)?Math.max(.25,Math.min(1.3,decor.radius)):.43;
      if(first<along+pad&&last>along-pad)return false;
    }
    return true;
  };
  const type=command.type;
  if(['room','floor','remove-floor'].includes(type)){
    const r=buildRect(command.from,command.to);
    if(!r)return fail('invalid-rectangle');
    for(const key of r.cells){const [i,j]=key.split(',').map(Number);
      if(!lotCell(i,j))return fail('lot-bounds');
      if(type==='remove-floor'&&isBase(i,j))return fail('protected-legacy-floor');
      if(type==='remove-floor'&&i>=starterShell.west&&i<starterShell.east&&
        j>=starterShell.north&&j<starterShell.south)return fail('protected-starter-floor');
    }
    if(type==='remove-floor'){
      const removed=new Set(r.cells);
      for(const person of residents)if(finite(person?.x)&&finite(person?.z)&&removed.has(cell(floorIndex(person.x),floorIndex(person.z))))return fail('resident-on-floor');
      for(const item of furniture)if(item.location==='home'&&finite(item.x)&&finite(item.z)&&removed.has(cell(floorIndex(item.x),floorIndex(item.z))))return fail('furniture-on-floor');
      for(const key of removed){
        const [i,j]=key.split(',').map(Number);
        const patch={minX:i*BUILD_STEP,minZ:j*BUILD_STEP,
          maxX:(i+1)*BUILD_STEP,maxZ:(j+1)*BUILD_STEP};
        if(furnitureBoxes.some(r=>overlap(patch,r)))return fail('furniture-on-floor');
      }
      for(const k of removed)floors.delete(k);
      for(const [k,w] of walls)if(!floors.has(cell(w.i,w.j))&&!floors.has(cell(w.i-(w.axis==='v'?1:0),w.j-(w.axis==='h'?1:0))))walls.delete(k);
      openings=openings.filter(o=>o.edgeIds.every(k=>walls.has(k)));
    }else{
      r.cells.forEach(k=>floors.add(k));
      // Preserve F5-A room-boundary IDs exactly for old saves and A*.
      // A structure may abut the original cosmetic cutaway, but its
      // shared wall remains a real, independent partition.
      if(type==='room')r.walls.forEach(w=>walls.set(w.id,w));
    }
  }else if(type==='room-duplicate'||type==='room-relocate'){
    const selection=constructionRoomSelection(world,command.source);
    if(!selection.ok)return selection;
    const room=selection.room,rotation=command.rotation??0;
    if(![0,90,180,270].includes(rotation)||
      !finite(command.at?.x)||!finite(command.at?.z))
      return fail('invalid-room-placement');
    const source=new Set(room.cells),boundary=new Set(room.wallIds);
    const rect={minX:room.i0*BUILD_STEP,minZ:room.j0*BUILD_STEP,
      maxX:room.i1*BUILD_STEP,maxZ:room.j1*BUILD_STEP};
    // Neither shop products nor legacy fixtures/artworks may be silently
    // duplicated or deleted. F5-D.2 handles furniture as a separate atomic
    // household transaction after object IDs, inventory and action locks.
    const carriedIds=type==='room-relocate'?new Set(movableFurnitureIds):new Set();
    if(furniture.some(item=>!carriedIds.has(item.instanceId)&&item?.location==='home'&&
        finite(item.x)&&finite(item.z)&&item.x>=rect.minX&&item.x<rect.maxX&&
        item.z>=rect.minZ&&item.z<rect.maxZ)||
      furnitureBoxes.some(box=>!carriedIds.has(box.instanceId)&&overlap(rect,box)))
      return fail('room-has-furniture');
    if(wallDecor.some(item=>finite(item?.x)&&finite(item?.z)&&
      item.x>=rect.minX-.6&&item.x<=rect.maxX+.6&&
      item.z>=rect.minZ-.6&&item.z<=rect.maxZ+.6))
      return fail('room-has-art');
    if(residents.some(item=>finite(item?.x)&&finite(item?.z)&&
      item.x>=rect.minX&&item.x<rect.maxX&&item.z>=rect.minZ&&item.z<rect.maxZ))
      return fail('room-has-resident');
    const openingSet=openings.filter(o=>o.edgeIds.some(id=>boundary.has(id)));
    if(openingSet.some(o=>o.edgeIds.some(id=>!boundary.has(id))))
      return fail('room-shared-opening');
    if(porches.some(p=>openingSet.some(o=>o.id===p.openingId)))
      return fail('room-has-porch');
    if(type==='room-relocate'){
      // Do not pull a shared wall out of an attached house; use push/pull
      // on such a room until the full household move transaction is ready.
      for(const id of boundary){
        const w=walls.get(id);
        const outside=w.axis==='h'
          ?cell(w.i,w.j===room.j0?room.j0-1:room.j1)
          :cell(w.i===room.i0?room.i0-1:room.i1,w.j);
        if(floors.has(outside))return fail('room-shared-boundary');
      }
      if(roofModules.some(r=>!r.id.startsWith('roof-auto:')&&
        r.i0<room.i1&&r.i1>room.i0&&r.j0<room.j1&&r.j1>room.j0))
        return fail('room-has-manual-roof');
    }
    const w=room.width,h=room.height;
    const rw=rotation%180===0?w:h,rh=rotation%180===0?h:w;
    const ti=snap(command.at.x)-Math.floor(rw/2);
    const tj=snap(command.at.z)-Math.floor(rh/2);
    const transform=(x,z)=>{
      const dx=x-room.i0,dz=z-room.j0;
      const local=rotation===0?[dx,dz]:rotation===90?[h-dz,dx]:
        rotation===180?[w-dx,h-dz]:[dz,w-dx];
      return {i:ti+local[0],j:tj+local[1]};
    };
    const rotateNormal=(x,z)=>rotation===0?[x,z]:
      rotation===90?[-z,x]:rotation===180?[-x,-z]:[z,-x];
    const targetCells=new Set();
    for(const key of room.cells){
      const [i,j]=key.split(',').map(Number);
      const a=transform(i,j),b=transform(i+1,j+1);
      const ni=Math.min(a.i,b.i),nj=Math.min(a.j,b.j);
      if(!lotCell(ni,nj))return fail('lot-bounds');
      const target=cell(ni,nj);
      if(floors.has(target))return fail('room-target-overlap');
      const patch={minX:ni*BUILD_STEP,minZ:nj*BUILD_STEP,
        maxX:(ni+1)*BUILD_STEP,maxZ:(nj+1)*BUILD_STEP};
      if(furnitureBoxes.some(box=>overlap(patch,box))||
        residents.some(p=>finite(p?.x)&&finite(p?.z)&&
          p.x>=patch.minX&&p.x<patch.maxX&&p.z>=patch.minZ&&p.z<patch.maxZ))
        return fail('room-target-occupied');
      targetCells.add(target);
    }
    const wallMap=new Map(),facesMap=new Map();
    for(const id of room.wallIds){
      const old=walls.get(id);
      const a=transform(old.i,old.j);
      const b=transform(old.i+(old.axis==='h'?1:0),old.j+(old.axis==='v'?1:0));
      const axis=a.j===b.j?'h':'v',i=Math.min(a.i,b.i),j=Math.min(a.j,b.j);
      const newId=edge(axis,i,j);
      if(walls.has(newId))return fail('room-target-overlap');
      wallMap.set(id,{...old,id:newId,axis,i,j});
      const normal=rotateNormal(old.axis==='h'?0:-1,old.axis==='h'?-1:0);
      const targetNormal=axis==='h'?[0,-1]:[-1,0];
      const faces=materials.wall[id];
      if(faces){
        const swap=normal[0]!==targetNormal[0]||normal[1]!==targetNormal[1];
        facesMap.set(newId,swap?{...(faces.b?{a:faces.b}:{}),
          ...(faces.a?{b:faces.a}:{})}:{...faces});
      }
    }
    const copiedFloor=new Map(),copiedCeiling=new Map(),copiedFacade=new Map();
    for(const key of room.cells){
      const [i,j]=key.split(',').map(Number);
      const a=transform(i,j),b=transform(i+1,j+1);
      const dest=cell(Math.min(a.i,b.i),Math.min(a.j,b.j));
      if(materials.floor[key])copiedFloor.set(dest,materials.floor[key]);
      if(materials.ceiling?.[key])copiedCeiling.set(dest,materials.ceiling[key]);
    }
    for(const id of room.wallIds)if(materials.facade?.[id])
      copiedFacade.set(wallMap.get(id).id,materials.facade[id]);
    const movedOpenings=openingSet.map(o=>({...o,
      id:type==='room-duplicate'?'opening-'+nextId++:o.id,
      edgeIds:o.edgeIds.map(id=>wallMap.get(id).id)}));
    if(type==='room-relocate'){
      room.cells.forEach(key=>floors.delete(key));
      room.wallIds.forEach(id=>{
        walls.delete(id);delete materials.wall[id];
        if(materials.facade)delete materials.facade[id];
      });
      for(const key of room.cells){
        delete materials.floor[key];
        if(materials.ceiling)delete materials.ceiling[key];
      }
      openings=openings.filter(o=>!openingSet.includes(o));
    }
    targetCells.forEach(key=>floors.add(key));
    for(const wall of wallMap.values())walls.set(wall.id,wall);
    for(const [key,value] of copiedFloor)materials.floor[key]=value;
    if(copiedCeiling.size){
      materials.ceiling||={};
      for(const [key,value] of copiedCeiling)materials.ceiling[key]=value;
    }
    for(const [key,value] of facesMap)materials.wall[key]=value;
    if(copiedFacade.size){
      materials.facade||={};
      for(const [key,value] of copiedFacade)materials.facade[key]=value;
    }
    openings.push(...movedOpenings);
  }else if(type==='wall'){
    if(!command.from||!command.to||![command.from.x,command.from.z,command.to.x,command.to.z].every(finite))return fail('invalid-wall');
    const line=editSegments(command.from,command.to);
    if(!line)return fail('wall-must-be-straight');
    for(const w of line)if(!lotCell(w.i,w.j)||!floors.has(cell(w.i-(w.axis==='v'?1:0),w.j-(w.axis==='h'?1:0)))&&!floors.has(cell(w.i,w.j)))return fail('outside-floor');
    line.forEach(w=>walls.set(w.id,w));
  }else if(type==='move-wall'&&Object.hasOwn(STARTER_SIDE,starterSide(command.edgeId))){
    const side=starterSide(command.edgeId);
    const shift=(side==='west'||side==='east')?command.deltaI:command.deltaJ;
    const orth=(side==='west'||side==='east')?command.deltaJ:command.deltaI;
    if(!Number.isSafeInteger(shift)||shift===0||Math.abs(shift)>8||orth!==0)
      return fail('invalid-wall-move');
    const next=starterShell[side]+shift;
    // Never eat into the original furnished floor without a separate
    // furniture migration. Retract only strips previously added by building.
    if((side==='west'&&next>STARTER_SHELL.west)||
       (side==='east'&&next<STARTER_SHELL.east)||
       (side==='north'&&next>STARTER_SHELL.north)||
       (side==='south'&&next<STARTER_SHELL.south))return fail('starter-minimum');
    if((side==='west'&&next<BUILD_LOT.minX/BUILD_STEP)||
       (side==='east'&&next>BUILD_LOT.maxX/BUILD_STEP)||
       (side==='north'&&next<BUILD_LOT.minZ/BUILD_STEP)||
       (side==='south'&&next>BUILD_LOT.maxZ/BUILD_STEP))return fail('lot-bounds');
    starterShell={...starterShell,[side]:next};
    for(let i=starterShell.west;i<starterShell.east;i++)
      for(let j=starterShell.north;j<starterShell.south;j++){
        const k=cell(i,j);
        if(!floors.has(k)){floors.add(k);starterOwned.add(k);}
      }
    for(const k of [...starterOwned]){
      const [i,j]=k.split(',').map(Number);
      if(i>=starterShell.west&&i<starterShell.east&&
        j>=starterShell.north&&j<starterShell.south)continue;
      const patch={minX:i*BUILD_STEP,minZ:j*BUILD_STEP,
        maxX:(i+1)*BUILD_STEP,maxZ:(j+1)*BUILD_STEP};
      if(furnitureBoxes.some(r=>overlap(patch,r))||
        residents.some(p=>finite(p?.x)&&finite(p?.z)&&
          p.x>=patch.minX&&p.x<patch.maxX&&p.z>=patch.minZ&&p.z<patch.maxZ))
        return fail('furniture-on-floor');
      if([...walls.values()].some(w=>Math.abs(w.i-i)<=1&&Math.abs(w.j-j)<=1))
        return fail('starter-strip-occupied');
      floors.delete(k);starterOwned.delete(k);
    }
    const available=new Set(starterEdges().map(w=>w.id));
    if(openings.some(o=>o.edgeIds.some(id=>starterSide(id)&&!available.has(id)))||
      [...starterRemoved].some(id=>{
        const at=starterIndex(id),s=starterSide(id);
        return s&&(s==='north'||s==='south'
          ?at<starterShell.west||at>=starterShell.east
          :at<starterShell.north||at>=starterShell.south);
      }))return fail('starter-opening-outside');
    if(side==='west'||side==='north'){
      const line=starterShell[side]*BUILD_STEP,half=.14;
      const corridor=side==='west'
        ?{minX:line-half,maxX:line+half,
          minZ:starterShell.north*BUILD_STEP,
          maxZ:starterShell.south*BUILD_STEP}
        :{minZ:line-half,maxZ:line+half,
          minX:starterShell.west*BUILD_STEP,
          maxX:starterShell.east*BUILD_STEP};
      if(furnitureBoxes.some(r=>overlap(corridor,r)))return fail('wall-intersects-furniture');
    }
  }else if(type==='move-wall'){
    const selected=walls.get(command.edgeId);
    if(!selected)return fail('wall-not-found');
    const step=selected.axis==='h'?command.deltaJ:command.deltaI;
    const orth=selected.axis==='h'?command.deltaI:command.deltaJ;
    if(!Number.isSafeInteger(step)||Math.abs(step)>8||step===0||orth!==0)
      return fail('invalid-wall-move');
    const axis=selected.axis,position=axis==='h'?selected.j:selected.i;
    const candidates=[...walls.values()].filter(w=>w.axis===axis&&
      (axis==='h'?w.j:w.i)===position);
    const indexed=new Map(candidates.map(w=>[axis==='h'?w.i:w.j,w]));
    const startIndex=axis==='h'?selected.i:selected.j;
    let low=startIndex,high=startIndex;
    while(indexed.has(low-1))low--;
    while(indexed.has(high+1))high++;
    const moved=[];
    for(let i=low;i<=high;i++){
      const original=indexed.get(i);
      if(!original)return fail('invalid-wall-move');
      moved.push(original);
    }
    const oldIds=new Set(moved.map(w=>w.id));
    const replaceIds=new Map();
    for(const w of moved){
      const i=w.i+(axis==='v'?step:0),j=w.j+(axis==='h'?step:0);
      if(!lotCell(i,j))return fail('lot-bounds');
      const id=edge(axis,i,j);
      if(walls.has(id)&&!oldIds.has(id))return fail('wall-already-exists');
      replaceIds.set(w.id,id);
    }
    for(const w of moved)walls.delete(w.id);
    for(const w of moved){
      const i=w.i+(axis==='v'?step:0),j=w.j+(axis==='h'?step:0);
      walls.set(edge(axis,i,j),{...w,id:edge(axis,i,j),i,j});
      // The wall drags its floor strip so it cannot hang beyond the foundation.
      for(let offset=Math.min(0,step);offset<Math.max(0,step);offset++){
        const a=w.i+(axis==='v'?offset:0),b=w.j+(axis==='h'?offset:0);
        if(lotCell(a,b))floors.add(cell(a,b));
      }
    }
    const former=position,shifted=position+step;
    for(let at=Math.min(former,shifted);at<Math.max(former,shifted);at++){
      for(const extremity of [low,high+1]){
        const i=axis==='v'?at:extremity,j=axis==='h'?at:extremity;
        const perp=axis==='v'?'h':'v',id=edge(perp,i,j);
        if(!lotCell(i,j))return fail('lot-bounds');
        if(!walls.has(id))walls.set(id,{id,axis:perp,i,j,heightClass:'normal'});
      }
    }
    openings=openings.map(o=>({...o,edgeIds:o.edgeIds.map(id=>replaceIds.get(id)||id)}));
    for(const [from,to] of replaceIds){
      if(materials.wall[from]){
        materials.wall[to]=materials.wall[from];delete materials.wall[from];
      }
      if(materials.facade?.[from]){
        materials.facade[to]=materials.facade[from];delete materials.facade[from];
      }
    }
  }else if(type==='set-wall-height'){
    if(!Object.hasOwn(BUILD_WALL_HEIGHTS,command.heightClass))return fail('unknown-wall-height');
    wallHeightClass=command.heightClass;
  }else if(type==='paint-facade'){
    if(!Object.hasOwn(BUILD_FACADE_FINISHES,command.materialId))return fail('unknown-facade');
    if(!['all','segment'].includes(command.scope))return fail('invalid-facade-scope');
    const candidate={...world,wallEdges:[...walls.values()],floorCells:[...floors],
      starterShell,starterRemoved:[...starterRemoved],starterSolidSides:[...starterSolidSides]};
    const exterior=constructionExteriorSegments(candidate);
    const requested=allWalls().get(command.edgeId);
    const painted=command.scope==='all'?exterior:
      exterior.filter(e=>e.id===command.edgeId||(requested&&
        e.axis===requested.axis&&e.i===requested.i&&e.j===requested.j));
    if(!painted.length)return fail('not-exterior-wall');
    const facade={...(materials.facade||{})};
    for(const target of painted)
      if(command.materialId==='facade.default')delete facade[target.id];
      else facade[target.id]=command.materialId;
    if(Object.keys(facade).length)materials.facade=facade;
    else delete materials.facade;
  }else if(type==='porch-add'){
    if(!Object.hasOwn(BUILD_PORCH_FINISHES,command.materialId))return fail('unknown-porch');
    if(porches.length>=32)return fail('too-many-porches');
    const found=openings.find(o=>o.id===command.openingId);
    if(!found||found.type!=='door')return fail('porch-needs-door');
    if(porches.some(p=>p.openingId===found.id))return fail('porch-exists');
    const candidate={...world,wallEdges:[...walls.values()],floorCells:[...floors],
      starterShell,starterRemoved:[...starterRemoved],starterSolidSides:[...starterSolidSides]};
    const deck=porchFootprint(candidate,found,[...allWalls().values()],command.depthSections);
    if(!deck)return fail('porch-needs-exterior-door');
    const occupied=new Set(constructionPorches({...candidate,porches}).flatMap(p=>p.footprint.cells));
    if(deck.cells.some(c=>occupied.has(c)))return fail('porch-overlap');
    // An entrance cannot materialize through an occupied furniture footprint.
    for(const r of furnitureBoxes)
      if(deck.cells.some(key=>{
        const [i,j]=key.split(',').map(Number);
        return overlap({minX:i*.5,minZ:j*.5,maxX:(i+1)*.5,maxZ:(j+1)*.5},r);
      }))return fail('porch-intersects-furniture');
    porches.push({id:'porch-'+nextId++,openingId:found.id,
      depthSections:command.depthSections,materialId:command.materialId});
  }else if(type==='porch-remove'){
    const existing=porches.find(p=>p.id===command.id||p.openingId===command.openingId);
    if(!existing)return fail('porch-not-found');
    porches=porches.filter(p=>p.id!==existing.id);
  }else if(['roof-auto','roof-add','roof-update','roof-remove','roof-clear'].includes(type)){
    if(type==='roof-clear'){
      roofModules=[];roofAuto=false;
    }else if(type==='roof-remove'){
      const target=roofModules.find(r=>r.id===command.id)||
        [...roofModules].reverse().find(r=>roofContains(r,command.at));
      if(!target)return fail('roof-not-found');
      roofModules=roofModules.filter(r=>r.id!==target.id);roofAuto=false;
    }else if(type==='roof-update'){
      const index=roofModules.findIndex(r=>r.id===command.id);
      if(index<0)return fail('roof-not-found');
      const settings=validRoofSettings(command);
      if(!settings)return fail('unknown-roof-style');
      roofModules[index]={...roofModules[index],...settings};roofAuto=false;
    }else{
      const settings=validRoofSettings(command);
      if(!settings)return fail('unknown-roof-style');
      if(type==='roof-auto'){
        const generated=roofAutomaticModules(floors,settings);
        if(!generated)return fail('roof-too-complex');
        roofModules=generated;roofAuto=true;
      }else{
        const rect=roofRect(command.from,command.to);
        if(!rect)return fail('invalid-roof-rectangle');
        if(!roofRectSupported(rect,floors))return fail('roof-needs-floor');
        if(roofModules.some(other=>roofsOverlap(other,rect)))return fail('roof-overlap');
        if(roofModules.length>=ROOF_MAX_MODULES)return fail('roof-too-complex');
        while(roofModules.some(r=>r.id==='roof-'+nextId))nextId++;
        roofModules.push({id:'roof-'+nextId++,...rect,...settings});roofAuto=false;
      }
    }
  }else if(type==='paint-floor'){
    const at=command.at;
    if(!finite(at?.x)||!finite(at?.z))return fail('invalid-finish-target');
    const key=cell(floorIndex(at.x),floorIndex(at.z));
    if(!floors.has(key))return fail('finish-needs-floor');
    if(!Object.hasOwn(BUILD_FINISHES.floor,command.materialId))return fail('unknown-finish');
    const target=command.scope==='room'
      ?constructionRooms(world).find(room=>room.cells.includes(key))?.cells
      :command.scope==='tile'?[key]:null;
    if(!target)return fail('invalid-finish-target');
    for(const k of target)if(command.materialId==='floor.default')delete materials.floor[k];
      else materials.floor[k]=command.materialId;
  }else if(type==='paint-ceiling'){
    const at=command.at;
    if(!finite(at?.x)||!finite(at?.z))return fail('invalid-finish-target');
    const key=cell(floorIndex(at.x),floorIndex(at.z));
    if(!floors.has(key))return fail('finish-needs-floor');
    if(!Object.hasOwn(BUILD_FINISHES.ceiling,command.materialId))return fail('unknown-finish');
    const target=command.scope==='room'
      ?constructionRooms(world).find(room=>room.cells.includes(key))?.cells
      :command.scope==='tile'?[key]:null;
    if(!target)return fail('invalid-finish-target');
    const ceiling={...(materials.ceiling||{})};
    for(const k of target)if(command.materialId==='ceiling.default')delete ceiling[k];
      else ceiling[k]=command.materialId;
    if(Object.keys(ceiling).length)materials.ceiling=ceiling;
    else delete materials.ceiling;
  }else if(type==='paint-wall'){
    const id=command.edgeId,starter=Object.hasOwn(STARTER_SIDE,starterSide(id));
    const materialKey=starter?'starter:'+starterSide(id):id;
    const target=walls.get(id);
    if(!starter&&!target)return fail('wall-not-found');
    if(!Object.hasOwn(BUILD_FINISHES.wall,command.materialId))return fail('unknown-finish');
    if(!['both','a','b'].includes(command.side||'both'))return fail('invalid-finish-target');
    if(!['run','segment'].includes(command.scope||'run'))return fail('invalid-finish-target');
    const ids=starter?[id]:[id];
    if(target&&command.scope!=='segment'){
      const axis=target.axis,base=axis==='h'?target.j:target.i;
      const sequence=[...walls.values()].filter(w=>w.axis===axis&&
        (axis==='h'?w.j:w.i)===base).sort((a,b)=>
          (axis==='h'?a.i-b.i:a.j-b.j));
      let low=axis==='h'?target.i:target.j,high=low;
      const byIndex=new Map(sequence.map(w=>[axis==='h'?w.i:w.j,w.id]));
      while(byIndex.has(low-1))low--;
      while(byIndex.has(high+1))high++;
      ids.splice(0,ids.length,...Array.from({length:high-low+1},(_,i)=>byIndex.get(low+i)));
    }
    for(const wallId of ids){
      const selected=starter?materialKey:wallId;
      const faces={...(materials.wall[selected]||{})};
      for(const face of command.side==='both'||!command.side?['a','b']:[command.side])
        if(command.materialId==='wall.default')delete faces[face];
        else faces[face]=command.materialId;
      if(Object.keys(faces).length)materials.wall[selected]=faces;
      else delete materials.wall[selected];
    }
  }else if(['erase-wall','door','window','arch','change-opening'].includes(type)){
    if(type==='change-opening'){
      const before=openings.find(o=>o.id===command.id);
      if(!before)return fail('opening-not-found');
      const style=BUILD_OPENING_STYLES[command.styleId];
      if(!style)return fail('unknown-opening-style');
      // Editing an opening preserves its immutable ID; changing from door to
      // window or vice versa also changes the A* portal on commit, never preview.
      const middle=before.edgeIds[Math.floor((before.edgeIds.length-1)/2)];
      const candidateWalls=allWalls();
      const anchor=candidateWalls.get(middle);
      const ids=segmentsForOpening(candidateWalls,anchor,style.sections);
      if(!ids)return fail('opening-needs-wall-space');
      if(overlapsOpening(ids,before.id))return fail('opening-overlap');
      if(!openingFitsDecor(ids))return fail('wall-has-decor');
      openings=openings.map(o=>o.id===before.id?{
        ...o,type:style.type,styleId:command.styleId,edgeIds:ids
      }:o);
    }else{
      const candidateWalls=allWalls();
      const found=typeof command.edgeId==='string'?candidateWalls.get(command.edgeId):
        nearestConstructionEdge(world,command.at||{});
      if(!found)return fail('wall-not-found');
      if(type==='erase-wall'){
        if(overlapsOpening([found.id]))return fail('wall-has-opening');
        if(found.starterSide){
          if(!openingFitsDecor([found.id]))return fail('wall-has-decor');
          starterRemoved.add(found.id);
        }else walls.delete(found.id);
      }else{
        const styleId=command.styleId||BUILD_DEFAULT_OPENING_STYLE[type];
        const style=BUILD_OPENING_STYLES[styleId];
        if(!style||style.type!==type)return fail('unknown-opening-style');
        const ids=segmentsForOpening(candidateWalls,found,style.sections);
        if(!ids)return fail(style.sections===3
          ?'opening-needs-three-wall-sections':'opening-needs-wall-space');
        if(overlapsOpening(ids))return fail('opening-overlap');
        if(!openingFitsDecor(ids))return fail('wall-has-decor');
        if(found.starterSide&&(found.starterSide==='east'||found.starterSide==='south'))
          starterSolidSides.add(found.starterSide);
        openings.push({id:'opening-'+nextId++,type,edgeIds:ids,
          ...(command.styleId?{styleId}:{})});
      }
    }
  }else if(type==='remove-opening'){
    if(!openings.some(o=>o.id===command.id))return fail('opening-not-found');
    openings=openings.filter(o=>o.id!==command.id);
  }else return fail('unsupported-command');
  if(floors.size>4000||walls.size>5000)return fail('too-large');
  // Auto roofs follow the actual supported footprint when a room or original
  // wall grows. Manual roof modules must not remain suspended above removed floor.
  if(roofAuto&&!['roof-auto','roof-add','roof-update','roof-remove','roof-clear'].includes(type)){
    const options=roofModules[0]&&validRoofSettings(roofModules[0]);
    roofModules=options?roofAutomaticModules(floors,options):null;
    if(!roofModules)return fail('roof-too-complex');
  }
  if(roofModules.some(r=>!roofRectSupported(r,floors,{minSections:r.id.startsWith('roof-auto:')?1:4})))return fail('roof-needs-floor');
  for(const k of Object.keys(materials.floor))if(!floors.has(k))delete materials.floor[k];
  if(materials.ceiling){
    for(const k of Object.keys(materials.ceiling))if(!floors.has(k))delete materials.ceiling[k];
    if(!Object.keys(materials.ceiling).length)delete materials.ceiling;
  }
  for(const k of Object.keys(materials.wall))if(!walls.has(k)&&
    !['starter:west','starter:east','starter:north','starter:south'].includes(k))
      delete materials.wall[k];
  if(materials.facade){
    const validExterior=new Set(constructionExteriorSegments({
      ...world,wallEdges:[...walls.values()],floorCells:[...floors],
      starterShell,starterRemoved:[...starterRemoved],
      starterSolidSides:[...starterSolidSides]}).map(w=>w.id));
    for(const key of Object.keys(materials.facade))
      if(!validExterior.has(key))delete materials.facade[key];
    if(!Object.keys(materials.facade).length)delete materials.facade;
  }
  // Any wall, door or floor change must preserve entrance anchors and never
  // put porch deck over an interior floor or another porch.
  const porchWorld={...world,wallEdges:[...walls.values()],openings,
    floorCells:[...floors],starterShell,starterRemoved:[...starterRemoved],
    starterSolidSides:[...starterSolidSides],porches};
  const occupiedPorch=new Set();
  for(const p of porches){
    const door=openings.find(o=>o.id===p.openingId);
    const deck=porchFootprint(porchWorld,door,[...allWalls().values()],p.depthSections);
    if(!deck)return fail('porch-needs-exterior-door');
    if(deck.cells.some(c=>occupiedPorch.has(c)))return fail('porch-overlap');
    deck.cells.forEach(c=>occupiedPorch.add(c));
  }
  const changed=JSON.stringify({floors:[...floors].sort(),walls:[...walls.keys()].sort(),
      openings,starterShell,starterRemoved:[...starterRemoved].sort(),
      starterSolidSides:[...starterSolidSides].sort(),materials,roofModules,roofAuto,
      wallHeightClass,porches})!==
    JSON.stringify({floors:[...world.floorCells].sort(),walls:world.wallEdges.map(w=>w.id).sort(),
      openings:world.openings,starterShell:world.starterShell,
      starterRemoved:[...(world.starterRemoved||[])].sort(),
      starterSolidSides:[...(world.starterSolidSides||[])].sort(),materials:world.materials,
      roofModules:world.roofModules||[],roofAuto:world.roofAuto===true,
      wallHeightClass:world.wallHeightClass||'normal',porches:world.porches||[]});
  if(!changed)return fail('unchanged');
  // A room wall is structural, never allowed through a purchased object,
  // protected kitchen fixture, painting easel or resident's occupied space.
  const existing=new Set(world.wallEdges.map(w=>w.id));
  for(const w of walls.values()){
    if(existing.has(w.id))continue;
    const x=w.i*BUILD_STEP,z=w.j*BUILD_STEP;
    const thickness=.12;
    const volume=w.axis==='h'
      ?{minX:x,minZ:z-thickness,maxX:x+BUILD_STEP,maxZ:z+thickness}
      :{minX:x-thickness,minZ:z,maxX:x+thickness,maxZ:z+BUILD_STEP};
    if(furnitureBoxes.some(r=>overlap(volume,r)))return fail('wall-intersects-furniture');
  }
  const next={...world,revision:world.revision+1,
    legacy:['paint-floor','paint-wall','paint-ceiling','paint-facade','set-wall-height'].includes(type)?world.legacy:false,
    materials,nextId,floorCells:[...floors],
    starterShell,starterOwned:[...starterOwned],starterRemoved:[...starterRemoved],
    starterSolidSides:[...starterSolidSides],wallEdges:[...walls.values()],openings,
    roofModules};
  if(wallHeightClass!=='normal')next.wallHeightClass=wallHeightClass;
  else delete next.wallHeightClass;
  if(porches.length)next.porches=porches;
  else delete next.porches;
  if(roofAuto)next.roofAuto=true;else delete next.roofAuto;
  for(const resident of residents)if(finite(resident?.x)&&finite(resident?.z)&&
    (!constructionContains(next,resident.x,resident.z)||constructionWallAt(next,resident.x,resident.z)))return fail('resident-blocked');
  return {ok:true,world:next,diff:{floorCount:next.floorCells.length-world.floorCells.length,
    wallCount:next.wallEdges.length-world.wallEdges.length,openingCount:next.openings.length-world.openings.length}};
}
export function createConstructionEditor(initial){
  let states=[restoreConstructionWorld(initial)],index=0;
  const snapshot=()=>({world:clone(states[index]),canUndo:index>0,canRedo:index<states.length-1});
  return {state:snapshot,commit(command,context){
    const result=proposeConstructionEdit(states[index],command,context);
    if(!result.ok)return {...result,...snapshot()};
    states=states.slice(0,index+1);
    states.push(result.world);index++;
    if(states.length>50){states.shift();index--;}
    return {...result,...snapshot()};
  },undo(){if(index===0)return fail('empty-history');index--;return {ok:true,...snapshot()};},
    redo(){if(index===states.length-1)return fail('empty-history');index++;return {ok:true,...snapshot()};}};
}
export function constructionRooms(world){
  const floors=new Set(world.floorCells),seen=new Set(),rooms=[];
  const barriers=new Set(world.wallEdges.map(w=>w.id));
  const solid=new Set(world.starterSolidSides||[]),removed=new Set(world.starterRemoved||[]);
  for(const w of starterShellSegments(world)){
    if(removed.has(w.id))continue;
    if((w.starterSide==='east'||w.starterSide==='south')&&!solid.has(w.starterSide))continue;
    barriers.add(edge(w.axis,w.i,w.j));
  }
  for(const k of floors){
    if(seen.has(k))continue;
    const queue=[k],part=[];seen.add(k);
    for(let p=0;p<queue.length;p++){
      const v=queue[p];part.push(v);const [i,j]=v.split(',').map(Number);
      const neighbours=[[i+1,j,edge('v',i+1,j)],[i-1,j,edge('v',i,j)],
        [i,j+1,edge('h',i,j+1)],[i,j-1,edge('h',i,j)]];
      for(const [a,b,e] of neighbours){const next=cell(a,b);
        if(floors.has(next)&&!seen.has(next)&&!barriers.has(e)){seen.add(next);queue.push(next);}
      }
    }
    rooms.push({id:'room-'+rooms.length,cells:part});
  }
  return rooms;
}
