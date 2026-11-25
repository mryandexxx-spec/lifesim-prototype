/** One lazy container per SKU/LOD; shared mesh/material resources.
 * Keep original geometry until valid GLB attaches. Never mutate world state. */
import {ofVegetationSpec,OF_VEGETATION_DIR,vegetationLod} from './of-vegetation-assets.js';
export function createOutdoorVegetationVisual({pc,app,enabled=true}){
 const cache=new Map(),records=new Map();let failures=0;
 function load(sku,level){
  const key=sku+(level==='lod'?'-lod':'');
  if(cache.has(key))return cache.get(key);
  const p=new Promise((resolve,reject)=>{
   const a=new pc.Asset('OF vegetation '+key,'container',{url:OF_VEGETATION_DIR+key+'.glb'});
   app.assets.add(a);a.ready(()=>resolve(a));a.once('error',e=>reject(e||Error(key)));app.assets.load(a);
  });cache.set(key,p);p.catch(()=>{});return p;
 }
 function show(r){
  const level=r.pivots[r.desired]?r.desired:r.pivots.high?'high':r.pivots.lod?'lod':null;
  for(const [key,p] of Object.entries(r.pivots))p.enabled=key===level;
  for(const c of r.fallback)c.enabled=!level;
  r.visible=level;
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
  records.set(node,r);node.once('destroy',()=>records.delete(node));ensure(r,'high');return true;
 }
 function update(cameraPosition){
  if(!cameraPosition)return;
  for(const r of records.values()){
   const p=r.node.getPosition();const d=Math.hypot(p.x-cameraPosition.x,p.y-cameraPosition.y,p.z-cameraPosition.z);
   const next=vegetationLod(r.sku,d,r.desired);
   if(next!==r.desired){r.desired=next;ensure(r,next);show(r);}
  }
 }
 function stats(){let high=0,lod=0,fallback=0,triangles=0,meshInstances=0;const meshes=new Set();
  for(const r of records.values()){
   if(!r.visible){fallback++;continue;}if(r.visible==='high')high++;else lod++;
   const spec=ofVegetationSpec(r.sku);triangles+=(r.visible==='lod'?spec.lod:spec).triangles;
   for(const c of r.pivots[r.visible].findComponents('render'))for(const mi of c.meshInstances){meshInstances++;meshes.add(mi.mesh);}
  }return {high,lod,fallback,triangles,meshInstances,uniqueMeshes:meshes.size,cachedVariants:cache.size,failures};
 }
 return Object.freeze({attach,update,clear:()=>records.clear(),stats});
}
