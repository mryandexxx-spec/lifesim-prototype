/** Native static models, atomic fallback swap; never own interactive overlays. */
import {OF_OUTDOOR_DIR,outdoorModelSpec} from './of-outdoor-assets.js';
export function createOutdoorFurnitureVisual({pc,app,enabled=true}){
 const cache=new Map(),records=new Map();let failures=0,brightness=0;
 function applyGlow(r){if(!r.glow)return;const value=brightness*1.25;if(r.glow.emissiveIntensity===value)return;r.glow.emissiveIntensity=value;r.glow.update();}
 function setBrightness(value){if(!Number.isFinite(value))return;const next=Math.round(Math.max(0,Math.min(1,value))*100)/100;if(next===brightness)return;brightness=next;for(const r of records.values())applyGlow(r);}
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
  const r={node,sku,keep,fallback:node.findComponents('render').filter(c=>c.enabled&&!keep.has(c)),pivot:null,glow:null};
  records.set(node,r);node.once('destroy',()=>{records.delete(node);r.glow?.destroy();});
  load(sku).then(asset=>{
   if(records.get(node)!==r||!node.parent)return;
   const pivot=asset.resource.instantiateRenderEntity();
   try{
    if(!pivot.findComponents('render').some(c=>c.meshInstances?.length))throw Error('Empty '+sku);
    // Only a fixture with a real, budgeted emitter gets a luminous diffuser.
    // Clone per lit fixture: shared GLB materials and unlit overflow stay untouched.
    if(sku.startsWith('light.')&&node.findComponents('light').length){
     const meshes=pivot.findComponents('render').flatMap(c=>c.meshInstances).filter(m=>m.material?.name==='Warm opal');
     if(!meshes.length)throw Error('Missing lantern diffuser '+sku);
     r.glow=meshes[0].material.clone();r.glow.emissive=new pc.Color(1,.78,.51);r.glow.emissiveIntensity=-1;
     applyGlow(r);for(const m of meshes)m.material=r.glow;
    }
    pivot.name='OF outdoor '+sku;node.addChild(pivot);r.pivot=pivot;
    for(const c of r.fallback)c.enabled=false;
   }catch(error){pivot.destroy();r.glow?.destroy();r.glow=null;throw error;}
  }).catch(error=>{if(records.get(node)!==r)return;failures++;console.warn('OF outdoor legacy fallback',sku,error);});
  return true;
 }
 function stats(){return {failures,cached:cache.size,objects:[...records.values()].map(r=>({node:r.node.name,sku:r.sku,attached:!!r.pivot?.parent,meshInstances:r.pivot?.findComponents('render').reduce((n,c)=>n+c.meshInstances.length,0)||0,fallbackVisible:r.fallback.some(c=>c.enabled),overlayComponents:r.keep.size,glow:r.glow?.emissiveIntensity??null}))};}
 return Object.freeze({attach,stats,setBrightness});
}
