/**
 * Optional GLB visual replacement for purchased/staged room furniture.
 * The original primitive furniture remains a fail-safe and continues to own
 * collision, interaction anchors, animations, scene root and save identity.
 * Model loading is lazy (one asset per SKU), and failed downloads show the
 * procedural version instead of leaving a missing or invisible object.
 */
import {meshyFurnitureFit,meshyFurnitureUrl} from './meshy-furniture-policy.js';

export function createMeshyFurnitureVisual({pc,app,onError=()=>{},enabled=true}){
  const assets=new Map(),instances=new WeakMap();
  let failures=0,attached=0;
  function load(sku){
    if(assets.has(sku))return assets.get(sku);
    const url=meshyFurnitureUrl(sku);
    if(!url)return null;
    const pending=new Promise((resolve,reject)=>{
      const asset=new pc.Asset('LifeSim furniture '+sku,'container',{url});
      app.assets.add(asset);
      asset.ready(()=>resolve(asset));
      asset.once('error',error=>reject(error||Error('Unable to load '+sku)));
      app.assets.load(asset);
    });
    // A reject handler is installed immediately; Safari must never log an
    // unhandled rejection when the player leaves the shop before loading.
    assets.set(sku,pending);
    return pending;
  }
  function attach(node,sku){
    const fit=meshyFurnitureFit(sku);
    if(!enabled||!fit||!node||instances.has(node))return false;
    // Only hide old authored furniture, never working simulation overlays:
    // bulbs, transient plates, art, mirror glint, steam or selection outlines.
    const fallback=node.findComponents('render').filter(c=>
      !/^(F4E |C3 |F4G |H5 )/.test(c.entity?.name||''));
    const record={sku,fallback,visual:null,legacy:false};
    instances.set(node,record);
    load(sku).then(asset=>{
      // ClearShopPreview destroys temporary roots while downloads are pending.
      if(!node.parent||instances.get(node)!==record)return;
      const renderEntity=asset.resource.instantiateRenderEntity();
      if(!renderEntity)throw Error('Empty GLB '+sku);
      const pivot=new pc.Entity('Meshy furniture '+sku);
      pivot.setLocalPosition(fit.offset.x,fit.offset.y,fit.offset.z);
      if(fit.rotationX)pivot.setLocalEulerAngles(fit.rotationX||0,fit.rotationY||0,0);
      renderEntity.setLocalScale(fit.scale.x,fit.scale.y,fit.scale.z);
      pivot.addChild(renderEntity);
      node.addChild(pivot);
      record.visual=pivot;
      for(const component of fallback)component.enabled=false;
      attached++;
    }).catch(error=>{
      failures++;
      console.warn('Using procedural furniture fallback for '+sku,error);
      onError(sku,error);
    });
    return true;
  }
  /** Wardrobe and drawer articulation still uses authored procedural parts. */
  function useProcedural(node,enabled){
    const record=instances.get(node);
    if(!record||!record.visual)return false;
    if(record.legacy===Boolean(enabled))return true;
    record.legacy=Boolean(enabled);
    record.visual.enabled=!record.legacy;
    for(const component of record.fallback)component.enabled=record.legacy;
    return true;
  }
  return Object.freeze({
    attach,useProcedural,
    stats:()=>Object.freeze({attached,failures,cachedSkus:assets.size})
  });
}
