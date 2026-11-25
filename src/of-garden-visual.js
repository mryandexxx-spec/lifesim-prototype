/** OF-C: lazy native garden variants, unchanged gameplay and fallback.
 * Wet mature R2 GLB is also the exact material donor for wet early/harvested beds.
 */
import {OF_GARDEN_DIR,gardenModelState} from './of-garden-assets.js';
export function createGardenVisual({pc,app,enabled=true}){
 const cache=new Map(),wetCache=new Map(),records=new Map();let failures=0;
 function load(sku,variant){
  const key=sku+'-'+variant;
  if(!cache.has(key)){
   const promise=new Promise((resolve,reject)=>{
    const asset=new pc.Asset('OF garden '+key,'container',{url:OF_GARDEN_DIR+key+'.glb'});
    app.assets.add(asset);asset.ready(()=>resolve(asset));asset.once('error',e=>reject(e||Error(key)));app.assets.load(asset);
   });
   cache.set(key,promise);promise.catch(()=>{});
  }
  return cache.get(key);
 }
 function wetMaterial(sku){
  if(!wetCache.has(sku)){
   const p=load(sku,'wet').then(asset=>{
    const donor=asset.resource.instantiateRenderEntity();
    try{
     const material=donor.findComponents('render').flatMap(c=>c.meshInstances).find(m=>m.material?.name==='Wet soil')?.material;
     if(!material)throw Error('Missing exact wet soil '+sku);return material;
    }finally{donor.destroy();}
   });
   wetCache.set(sku,p);p.catch(()=>{});
  }
  return wetCache.get(sku);
 }
 function attach(node,sku,view){
  const state=gardenModelState(sku,view);
  if(!enabled||!state||!node||records.has(node))return false;
  const record={node,sku,state,fallback:node.findComponents('render').filter(c=>c.enabled),pivot:null,soil:null};
  records.set(node,record);node.once('destroy',()=>records.delete(node));
  Promise.all([load(sku,state.variant),state.wetSoil?wetMaterial(sku):Promise.resolve(null)]).then(([asset,wet])=>{
   if(records.get(node)!==record||!node.parent)return;
   const pivot=asset.resource.instantiateRenderEntity();
   try{
    const meshes=pivot.findComponents('render').flatMap(c=>c.meshInstances);
    if(!meshes.length)throw Error('Empty garden '+sku);
    const soilName=state.variant==='wet'?'Wet soil':'Dry soil';
    const soil=meshes.filter(m=>m.material?.name===soilName);
    if(!soil.length)throw Error('Missing soil mesh '+sku+' '+state.variant);
    if(wet)for(const mesh of soil)mesh.material=wet;
    record.soil=soil[0].material.name;
    pivot.name='OF garden '+sku+' '+state.variant;
    node.addChild(pivot);record.pivot=pivot;
    for(const c of record.fallback)c.enabled=false;
   }catch(error){pivot.destroy();throw error;}
  }).catch(error=>{if(records.get(node)!==record)return;failures++;console.warn('OF garden legacy fallback',sku,state,error);});
  return true;
 }
 function stats(){
  return {failures,cachedVariants:cache.size,plots:[...records.values()].map(r=>({
   node:r.node.name,sku:r.sku,variant:r.state.variant,wet:r.state.wet,soil:r.soil,
   attached:!!r.pivot?.parent,meshInstances:r.pivot?.findComponents('render').reduce((n,c)=>n+c.meshInstances.length,0)||0,
   fallbackVisible:r.fallback.some(c=>c.enabled)
  }))};
 }
 return Object.freeze({attach,stats});
}
