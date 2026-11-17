/**
 * F5-A: authoritative, renderer-free one-storey construction world.
 * Grid edges are canonical: h:i,j spans [i,i+1] on X; v:i,j spans [j,j+1] on Z.
 * The legacy floor/fixtures keep their exact transforms and save schema v1.
 */
export const BUILD_STEP=.5;
export const BUILD_LOT=Object.freeze({minX:-9,maxX:23,minZ:-12,maxZ:12});
const BASE=Object.freeze({minI:-10,maxI:28,minJ:-9,maxJ:9});
const finite=Number.isFinite;
const cell=(i,j)=>i+','+j;
const edge=(axis,i,j)=>axis+':'+i+','+j;
const floorIndex=p=>Math.floor(p/BUILD_STEP);
const snap=p=>Math.round(p/BUILD_STEP);
const clone=v=>JSON.parse(JSON.stringify(v));
const topologyCache=new WeakMap();
function topology(state){
  let found=topologyCache.get(state);
  if(!found){found={floors:new Set(state.floorCells),doors:new Set(state.openings.filter(o=>o.type==='door').flatMap(o=>o.edgeIds))};topologyCache.set(state,found);}
  return found;
}
const fail=reason=>({ok:false,reason});
function isBase(i,j){return i>=BASE.minI&&i<BASE.maxI&&j>=BASE.minJ&&j<BASE.maxJ;}
function lotCell(i,j){return i>=BUILD_LOT.minX/BUILD_STEP&&i<BUILD_LOT.maxX/BUILD_STEP&&j>=BUILD_LOT.minZ/BUILD_STEP&&j<BUILD_LOT.maxZ/BUILD_STEP;}
export function newConstructionWorld(){
  const floorCells=[];
  for(let i=BASE.minI;i<BASE.maxI;i++)for(let j=BASE.minJ;j<BASE.maxJ;j++)floorCells.push(cell(i,j));
  return {schema:1,revision:0,lot:{...BUILD_LOT},step:BUILD_STEP,floorCells,wallEdges:[],openings:[],
    materials:{},roofModules:[],legacy:true,nextId:1};
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
    if(!rawOpening||!['door','window'].includes(rawOpening.type)||
      typeof rawOpening.id!=='string'||openingKeys.has(rawOpening.id)||
      !Array.isArray(rawOpening.edgeIds)||rawOpening.edgeIds.length<1||
      rawOpening.edgeIds.length>4||!rawOpening.edgeIds.every(k=>keys.has(k)))return initial;
    openingKeys.add(rawOpening.id);
    openings.push({id:rawOpening.id,type:rawOpening.type,edgeIds:[...new Set(rawOpening.edgeIds)]});
  }
  return {...initial,revision:Number.isSafeInteger(raw.revision)?Math.min(raw.revision,1e8):0,
    legacy:raw.legacy===true&&walls.length===0&&floors.size===initial.floorCells.length,
    nextId:Number.isSafeInteger(raw.nextId)&&raw.nextId>=1&&raw.nextId<1e8?raw.nextId:1,
    floorCells:[...floors],wallEdges:walls,openings};
}
export function constructionContains(world,x,z){
  if(!finite(x)||!finite(z))return false;
  const state=world?.construction||world;
  if(!state||state.schema!==1)return x>=-4.62&&x<=13.86&&z>=-3.96&&z<=3.98;
  if(state.legacy)return x>=-4.62&&x<=13.86&&z>=-3.96&&z<=3.98;
  return topology(state).floors.has(cell(floorIndex(x),floorIndex(z)));
}
/** A full wall can never be traversed, windows never act as doors. */
export function constructionWallAt(world,x,z,radius=.26){
  const state=world?.construction||world;
  if(!state||state.legacy)return false;
  const opened=topology(state).doors;
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
export function nearestConstructionEdge(world,point,maxDistance=.38){
  if(!finite(point?.x)||!finite(point?.z))return null;
  let best=null,distance=Infinity;
  for(const w of world.wallEdges){
    const a=w.i*BUILD_STEP,b=w.j*BUILD_STEP;
    const d=w.axis==='h'
      ?Math.hypot(point.x-Math.max(a,Math.min(a+BUILD_STEP,point.x)),point.z-b)
      :Math.hypot(point.x-a,point.z-Math.max(b,Math.min(b+BUILD_STEP,point.z)));
    if(d<distance){best=w;distance=d;}
  }
  return distance<=maxDistance?best:null;
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
/** Pure preview; no state, queue, furniture, money or localStorage mutation. */
export function proposeConstructionEdit(raw,command,{furniture=[],furnitureBoxes=[],residents=[]}={}){
  const world=restoreConstructionWorld(raw);
  if(!command||typeof command.type!=='string')return fail('invalid-command');
  let floors=new Set(world.floorCells),walls=new Map(world.wallEdges.map(w=>[w.id,w]));
  let openings=[...world.openings],nextId=world.nextId;
  const type=command.type;
  if(['room','floor','remove-floor'].includes(type)){
    const r=buildRect(command.from,command.to);
    if(!r)return fail('invalid-rectangle');
    for(const key of r.cells){const [i,j]=key.split(',').map(Number);
      if(!lotCell(i,j))return fail('lot-bounds');
      if(type==='remove-floor'&&isBase(i,j))return fail('protected-legacy-floor');
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
      if(type==='room')r.walls.forEach(w=>walls.set(w.id,w));
    }
  }else if(type==='wall'){
    if(!command.from||!command.to||![command.from.x,command.from.z,command.to.x,command.to.z].every(finite))return fail('invalid-wall');
    const line=editSegments(command.from,command.to);
    if(!line)return fail('wall-must-be-straight');
    for(const w of line)if(!lotCell(w.i,w.j)||!floors.has(cell(w.i-(w.axis==='v'?1:0),w.j-(w.axis==='h'?1:0)))&&!floors.has(cell(w.i,w.j)))return fail('outside-floor');
    line.forEach(w=>walls.set(w.id,w));
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
  }else if(['erase-wall','door','window'].includes(type)){
    const found=typeof command.edgeId==='string'?walls.get(command.edgeId):
      nearestConstructionEdge(world,command.at||{});
    if(!found)return fail('wall-not-found');
    if(type==='erase-wall'){
      const affected=openings.filter(o=>o.edgeIds.includes(found.id));
      if(affected.length)return fail('wall-has-opening');
      walls.delete(found.id);
    }else{
      // Three contiguous wall sections make a 1.5m clear doorway (safe for body radius).
      const segments=[-1,0,1].map(delta=>walls.get(edge(found.axis,
        found.i+(found.axis==='h'?delta:0),found.j+(found.axis==='v'?delta:0)))).filter(Boolean);
      if(segments.length<3)return fail('opening-needs-three-wall-sections');
      const ids=segments.map(w=>w.id);
      if(openings.some(o=>o.edgeIds.some(k=>ids.includes(k))))return fail('opening-overlap');
      openings.push({id:'opening-'+nextId++,type,edgeIds:ids});
    }
  }else if(type==='remove-opening'){
    if(!openings.some(o=>o.id===command.id))return fail('opening-not-found');
    openings=openings.filter(o=>o.id!==command.id);
  }else return fail('unsupported-command');
  if(floors.size>4000||walls.size>5000)return fail('too-large');
  const changed=JSON.stringify({floors:[...floors].sort(),walls:[...walls.keys()].sort(),openings})!==
    JSON.stringify({floors:[...world.floorCells].sort(),walls:world.wallEdges.map(w=>w.id).sort(),openings:world.openings});
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
  const next={...world,revision:world.revision+1,legacy:false,nextId,floorCells:[...floors],
    wallEdges:[...walls.values()],openings};
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
