/** Native static models, atomic fallback swap; never own interactive overlays. */
import {OF_OUTDOOR_DIR,outdoorModelSpec} from './of-outdoor-assets.js';
export function createOutdoorFurnitureVisual({pc,app,enabled=true}){
 const cache=new Map(),records=new Map();let failures=0;
 function load(sku){
  if(!cache.has(sku)){
   const p=new Promise((resolve,reject)=>{
    const asset=new pc.Asset('OF outdoor '+sku,'container',{url:OF_OUTDOOR_DIR+sku+'-new.glb'});
    app.assets.add(asset);asset.ready(()=>resolve(asset));asset.once('error',e=>reject(e||Error(sku)));app.assets.load(asset);
   });cache.set(sku,p);p.catch(()=>{});
  }return cache.get(sku);
 }
 function attach(node,sku,preserve=[]){
  if(!enabled||!outdoorModelSpec(sku)||!node||records.has(node))return false;
  const keep=new Set(preserve.flatMap(p=>p.findComponents('render')));
  const r={node,sku,keep,fallback:node.findComponents('render').filter(c=>c.enabled&&!keep.has(c)),pivot:null};
  records.set(node,r);node.once('destroy',()=>records.delete(node));
  load(sku).then(asset=>{
   if(records.get(node)!==r||!node.parent)return;
   const pivot=asset.resource.instantiateRenderEntity();
   try{
    if(!pivot.findComponents('render').some(c=>c.meshInstances?.length))throw Error('Empty '+sku);
    pivot.name='OF outdoor '+sku;node.addChild(pivot);r.pivot=pivot;
    for(const c of r.fallback)c.enabled=false;
   }catch(error){pivot.destroy();throw error;}
  }).catch(error=>{if(records.get(node)!==r)return;failures++;console.warn('OF outdoor legacy fallback',sku,error);});
  return true;
 }
 function stats(){return {failures,cached:cache.size,objects:[...records.values()].map(r=>({node:r.node.name,sku:r.sku,attached:!!r.pivot?.parent,meshInstances:r.pivot?.findComponents('render').reduce((n,c)=>n+c.meshInstances.length,0)||0,fallbackVisible:r.fallback.some(c=>c.enabled),overlayComponents:r.keep.size}))};}
 return Object.freeze({attach,stats});
}
