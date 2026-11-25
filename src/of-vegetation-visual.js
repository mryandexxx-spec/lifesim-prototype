/** One lazy container per SKU/LOD; shared mesh/material resources.
 * Keep original geometry until valid GLB attaches. Never mutate world state. */
import {ofVegetationSpec,OF_VEGETATION_DIR,vegetationLod,vegetationLevelSpec} from './of-vegetation-assets.js';
export function createOutdoorVegetationVisual({pc,app,enabled=true,instancing=true}){
 const cache=new Map(),records=new Map();let failures=0;
 let batches=[],dirty=true,instancingEnabled=instancing,instancingFailures=0;
 function clearBatches(){for(const r of records.values())for(const p of Object.values(r.pivots))for(const c of p.findComponents('render'))for(const mi of c.meshInstances)mi.visible=true;for(const b of batches){b.node.destroy();b.buffer.destroy();}batches=[];}
 function rebuildBatches(){
  if(!dirty)return;dirty=false;clearBatches();if(!instancingEnabled)return;
  const groups=new Map();
  for(const r of records.values()){
   if(!r.visible||!r.node.enabled)continue;
   const pivot=r.pivots[r.visible];
   for(const c of pivot.findComponents('render'))for(const mi of c.meshInstances){
    // Use exact mesh/material identity and authored world matrices; opaque static vegetation only.
    if(mi.skinInstance||mi.morphInstance||mi.material.blendType!==pc.BLEND_NONE)continue;
    const key=r.sku+'|'+r.visible+'|'+mi.mesh.id+'|'+mi.material.id+'|'+c.layers.join(',')+'|'+Number(mi.castShadow)+'|'+Number(mi.receiveShadow);
    const group=groups.get(key)||[];group.push({mi,c});groups.set(key,group);
   }
  }
  try{for(const group of groups.values()){
   if(group.length<2)continue;const first=group[0],data=new Float32Array(group.length*16);
   const bounds=first.mi.aabb.clone();
   for(const [i,{mi}] of group.entries()){data.set(mi.node.getWorldTransform().data,i*16);if(i)bounds.add(mi.aabb);}
   const format=pc.VertexFormat.getDefaultInstancingFormat(app.graphicsDevice);
   const buffer=new pc.VertexBuffer(app.graphicsDevice,format,group.length,{data});
   const node=new pc.Entity('OF vegetation instanced '+first.mi.mesh.id);
   const mesh=new pc.MeshInstance(first.mi.mesh,first.mi.material,node);
   try{mesh.setInstancing(buffer,true);mesh.aabb=bounds;
    node.addComponent('render',{meshInstances:[mesh],layers:[...first.c.layers],castShadows:first.mi.castShadow,receiveShadows:first.mi.receiveShadow});
    app.root.addChild(node);batches.push({node,buffer,count:group.length});
    for(const {mi} of group)mi.visible=false;
   }catch(e){node.destroy();buffer.destroy();throw e;}
  }}catch(e){clearBatches();instancingEnabled=false;instancingFailures++;console.warn('OF vegetation instancing fallback',e);}
 }
 function setInstancing(enabled){instancingEnabled=Boolean(enabled)&&instancing;dirty=true;rebuildBatches();}
 function load(sku,level){
  const key=sku+(level==='high'?'':'-'+level);
  if(cache.has(key))return cache.get(key);
  const p=new Promise((resolve,reject)=>{
   const a=new pc.Asset('OF vegetation '+key,'container',{url:OF_VEGETATION_DIR+key+'.glb'});
   app.assets.add(a);a.ready(()=>resolve(a));a.once('error',e=>reject(e||Error(key)));app.assets.load(a);
  });cache.set(key,p);p.catch(()=>{});return p;
 }
 function show(r){
  const level=r.pivots[r.desired]?r.desired:r.pivots.high?'high':r.pivots.far?'far':r.pivots.lod?'lod':null;
  for(const [key,p] of Object.entries(r.pivots))p.enabled=key===level;
  for(const c of r.fallback)c.enabled=!level;
  r.visible=level;dirty=true;
 }
 function ensure(r,level){
  if(r.requested.has(level))return;r.requested.add(level);
  load(r.sku,level).then(asset=>{
   if(records.get(r.node)!==r||!r.node.parent)return;
   const p=asset.resource.instantiateRenderEntity();
   if(!p||!p.findComponents('render').some(c=>c.meshInstances?.length)){p?.destroy();throw Error('Empty OF vegetation '+r.sku);}
   p.name='OF vegetation '+r.sku+' '+level;
   p.enabled=false;r.node.addChild(p);r.pivots[level]=p;show(r);
  }).catch(error=>{if(records.get(r.node)!==r)return;failures++;console.warn('OF vegetation fallback '+r.sku+' '+level,error);});
 }
 function attach(node,sku){
  if(!enabled||!ofVegetationSpec(sku)||!node||records.has(node))return false;
  const r={node,sku,fallback:node.findComponents('render').filter(c=>c.enabled),pivots:{},requested:new Set(),desired:'high',visible:null};
  records.set(node,r);node.once('destroy',()=>{records.delete(node);dirty=true;});ensure(r,'high');return true;
 }
 function update(cameraPosition){
  if(!cameraPosition)return;
  for(const r of records.values()){
   const p=r.node.getPosition();const d=Math.hypot(p.x-cameraPosition.x,p.y-cameraPosition.y,p.z-cameraPosition.z);
   const next=vegetationLod(r.sku,d,r.desired);
   if(next!==r.desired){r.desired=next;ensure(r,next);show(r);}
  }
  rebuildBatches();
 }
 function stats(){let high=0,lod=0,far=0,fallback=0,triangles=0,meshInstances=0;const meshes=new Set();
  for(const r of records.values()){
   if(!r.visible){fallback++;continue;}if(r.visible==='high')high++;else if(r.visible==='far')far++;else lod++;
   triangles+=vegetationLevelSpec(r.sku,r.visible).triangles;
   for(const c of r.pivots[r.visible].findComponents('render'))for(const mi of c.meshInstances){meshInstances++;meshes.add(mi.mesh);}
  }return {high,lod,far,fallback,triangles,meshInstances,uniqueMeshes:meshes.size,cachedVariants:cache.size,failures,instancingFailures,instancedGroups:batches.length,instancedCopies:batches.reduce((sum,b)=>sum+b.count,0)};
 }
 return Object.freeze({attach,update,setInstancing,clear:()=>{clearBatches();records.clear();dirty=true;},stats});
}
