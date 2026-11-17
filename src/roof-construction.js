/**
 * F5-C.1: pure one-storey roof modules. No PlayCanvas, paths, purchases, or
 * resident state. All footprint positions are canonical half-metre indices.
 */
export const ROOF_STYLES=Object.freeze({
  'roof.flat':Object.freeze({label:'Плоская',kind:'flat'}),
  'roof.shed':Object.freeze({label:'Односкатная',kind:'shed'}),
  'roof.gable':Object.freeze({label:'Двускатная',kind:'gable'}),
  'roof.hip':Object.freeze({label:'Вальмовая',kind:'hip'})
});
export const ROOF_MATERIALS=Object.freeze({
  'roof.slate':Object.freeze({label:'Графит',color:'#636e77'}),
  'roof.clay':Object.freeze({label:'Черепица',color:'#b47a64'}),
  'roof.moss':Object.freeze({label:'Зелёная',color:'#738778'}),
  'roof.sand':Object.freeze({label:'Светлый камень',color:'#cbc0a8'})
});
export const ROOF_PITCHES=Object.freeze([.24,.38,.55]);
export const ROOF_EAVES=Object.freeze([.25,.4,.6]);
export const ROOF_MAX_MODULES=48;
const STEP=.5;
const finite=Number.isFinite;
const isInt=Number.isSafeInteger;
export const roofContains=(module,point)=>{
  if(!finite(point?.x)||!finite(point?.z))return false;
  return point.x>=module.i0*STEP&&point.x<module.i1*STEP&&
    point.z>=module.j0*STEP&&point.z<module.j1*STEP;
};
export function roofRect(from,to){
  if(!from||!to||![from.x,from.z,to.x,to.z].every(finite))return null;
  const i0=Math.min(Math.round(from.x/STEP),Math.round(to.x/STEP)),
    i1=Math.max(Math.round(from.x/STEP),Math.round(to.x/STEP)),
    j0=Math.min(Math.round(from.z/STEP),Math.round(to.z/STEP)),
    j1=Math.max(Math.round(from.z/STEP),Math.round(to.z/STEP));
  if(i1-i0<4||j1-j0<4)return null;
  return {i0,i1,j0,j1};
}
export function roofRectSupported(rect,floorCells,{minSections=4}={}){
  if(!rect||!['i0','i1','j0','j1'].every(k=>isInt(rect[k])))return false;
  if(rect.i1-rect.i0<minSections||rect.j1-rect.j0<minSections||
    rect.i0< -18||rect.i1>46||rect.j0< -24||rect.j1>24)return false;
  if((rect.i1-rect.i0)*(rect.j1-rect.j0)>4000)return false;
  const floors=floorCells instanceof Set?floorCells:new Set(floorCells);
  for(let j=rect.j0;j<rect.j1;j++)
    for(let i=rect.i0;i<rect.i1;i++)
      if(!floors.has(i+','+j))return false;
  return true;
}
export const roofsOverlap=(a,b)=>a.i0<b.i1&&b.i0<a.i1&&a.j0<b.j1&&b.j0<a.j1;
export function validRoofSettings(raw){
  if(!Object.hasOwn(ROOF_STYLES,raw?.styleId)||!Object.hasOwn(ROOF_MATERIALS,raw?.materialId)||
    !ROOF_PITCHES.includes(raw?.pitch)||!ROOF_EAVES.includes(raw?.eaves))return null;
  return {styleId:raw.styleId,materialId:raw.materialId,pitch:raw.pitch,eaves:raw.eaves};
}
export function validRoofModule(raw,floors,usedIds=new Set(),accepted=[]){
  if(!raw||typeof raw.id!=='string'||!/^roof-(?:[0-9]+|auto:-?[0-9]+:-?[0-9]+:-?[0-9]+:-?[0-9]+)$/.test(raw.id)||
    usedIds.has(raw.id)||!roofRectSupported(raw,floors,{minSections:raw.id.startsWith('roof-auto:')?1:4})||
    accepted.some(other=>roofsOverlap(other,raw)))return null;
  const settings=validRoofSettings(raw);
  if(!settings)return null;
  return {id:raw.id,i0:raw.i0,i1:raw.i1,j0:raw.j0,j1:raw.j1,...settings};
}
/** Exact rectangle decomposition of an irregular footprint; adjacent roof
 * modules may meet but may never cover empty ground or each other. */
export function automaticRoofRects(floorCells){
  const rows=new Map();
  for(const key of floorCells){
    const [i,j]=key.split(',').map(Number);
    if(!isInt(i)||!isInt(j))return [];
    if(!rows.has(j))rows.set(j,[]);
    rows.get(j).push(i);
  }
  const sorted=[...rows].sort((a,b)=>a[0]-b[0]);
  const done=[],active=new Map();
  for(const [j,columns] of sorted){
    columns.sort((a,b)=>a-b);
    const spans=[];
    let first=columns[0],last=first;
    for(const i of [...columns.slice(1),Infinity]){
      if(i===last+1){last=i;continue;}
      if(first!==undefined)spans.push({i0:first,i1:last+1});
      first=i;last=i;
    }
    const present=new Set();
    for(const span of spans){
      const key=span.i0+':'+span.i1;present.add(key);
      const previous=active.get(key);
      if(previous&&previous.j1===j){previous.j1=j+1;}
      else{
        if(previous){done.push(previous);}
        active.set(key,{...span,j0:j,j1:j+1});
      }
    }
    for(const [key,rect] of [...active])
      if(!present.has(key)){done.push(rect);active.delete(key);}
  }
  done.push(...active.values());
  return done.sort((a,b)=>a.j0-b.j0||a.i0-b.i0);
}
export const roofAutomaticModules=(floorCells,settings)=>{
  if(!validRoofSettings(settings))return null;
  const rectangles=automaticRoofRects(floorCells);
  if(!rectangles.length||rectangles.length>ROOF_MAX_MODULES||
    rectangles.some(rect=>!roofRectSupported(rect,floorCells,{minSections:1})))return null;
  return rectangles.map(rect=>({
    id:'roof-auto:'+rect.i0+':'+rect.j0+':'+rect.i1+':'+rect.j1,
    ...rect,...validRoofSettings(settings)
  }));
};
/** A small flat-shaded mesh made entirely from roof planes, in world units.
 * Indices are independent per triangle for sharp roof ridges. */
export function roofMeshGeometry(module){
  const {i0,i1,j0,j1,styleId,pitch,eaves}=module;
  const x0=i0*STEP-eaves,x1=i1*STEP+eaves,z0=j0*STEP-eaves,z1=j1*STEP+eaves;
  const sx=x1-x0,sz=z1-z0,mx=(x0+x1)/2,mz=(z0+z1)/2;
  const base=3.06,crest=base+Math.min(sx,sz)*.5*pitch;
  const p=(x,y,z)=>[x,y,z],A=p(x0,base,z0),B=p(x0,base,z1),
    C=p(x1,base,z1),D=p(x1,base,z0);
  const faces=[];
  const tri=(a,b,c)=>faces.push([a,b,c]);
  const quad=(a,b,c,d)=>{tri(a,b,c);tri(a,c,d);};
  if(styleId==='roof.flat'){
    quad(p(x0,base+.12,z0),p(x0,base+.12,z1),
      p(x1,base+.12,z1),p(x1,base+.12,z0));
  }else if(styleId==='roof.shed'){
    if(sx>=sz)quad(A,p(x0,crest,z1),p(x1,crest,z1),D);
    else quad(p(x0,crest,z0),p(x0,crest,z1),C,D);
  }else if(sx>=sz){
    if(styleId==='roof.gable'){
      const R0=p(x0,crest,mz),R1=p(x1,crest,mz);
      quad(A,R0,R1,D);quad(R0,B,C,R1);
    }else{
      const inset=Math.min(sz/2,sx/2),R0=p(x0+inset,crest,mz),
        R1=p(x1-inset,crest,mz);
      quad(A,R0,R1,D);quad(R0,B,C,R1);tri(A,B,R0);tri(R1,C,D);
    }
  }else{
    if(styleId==='roof.gable'){
      const R0=p(mx,crest,z0),R1=p(mx,crest,z1);
      quad(A,B,R1,R0);quad(R0,R1,C,D);
    }else{
      const inset=Math.min(sx/2,sz/2),R0=p(mx,crest,z0+inset),
        R1=p(mx,crest,z1-inset);
      quad(A,B,R1,R0);quad(R0,R1,C,D);tri(A,R0,D);tri(R1,B,C);
    }
  }
  const positions=[],indices=[];
  for(const face of faces)for(const vertex of face){
    indices.push(positions.length/3);positions.push(...vertex);
  }
  return {positions,indices,triangleCount:faces.length,
    minY:base,maxY:styleId==='roof.flat'?base+.12:crest};
}
