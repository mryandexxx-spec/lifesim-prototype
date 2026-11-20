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
  // Two independent covers share one small cloth mesh. In bed coordinates
  // the foot hem is fixed, the sides drape to mattress height, and only the
  // occupied half unfolds. No changes to the bed or the skin GLB buffers.
  let coverMesh=null,coverMaterial=null;
  function createCover(node,slot){
    if(!coverMesh){
      const positions=[],indices=[];
      const across=16,along=12;
      for(let j=0;j<=along;j++)for(let i=0;i<=across;i++){
        const u=i/across*2-1,t=j/along;
        const ridge=Math.max(0,1-Math.pow(Math.abs(u),3));
        const foot=Math.min(1,t*6);
        const loft=(.30+.15*t)*ridge*foot;
        const crease=.012*Math.cos(12*u+7*t)*ridge*foot;
        positions.push(u*.55,.013+loft+crease,-1.56*t+.018*Math.cos(u*4)*t);
        if(i<across&&j<along){
          const a=j*(across+1)+i,b=a+across+1;
          indices.push(a,a+1,b,b,a+1,b+1);
        }
      }
      coverMesh=new pc.Mesh(app.graphicsDevice);
      coverMesh.setPositions(positions);
      coverMesh.setNormals(pc.calculateNormals(positions,indices));
      coverMesh.setIndices(indices);coverMesh.update();
      coverMaterial=new pc.StandardMaterial();
      coverMaterial.diffuse=new pc.Color(.56,.58,.34);
      coverMaterial.cull=pc.CULLFACE_NONE;coverMaterial.update();
    }
    const part=new pc.Entity('Platform quilt '+slot);
    part.addComponent('render',{meshInstances:[new pc.MeshInstance(coverMesh,coverMaterial)]});
    part.setLocalPosition(slot==='left'?-.56:.56,.48,1.12);
    part.enabled=false;node.addChild(part);
    return part;
  }
  function setBedCover(node,slot,unfold){
    const record=instances.get(node);
    if(!record?.visual?.enabled||record.sku!=='bed.platform')return false;
    const part=record[slot]||(unfold>0?record[slot]=createCover(node,slot):null);
    if(part){
      part.enabled=unfold>0;
      if(part.enabled)part.setLocalScale(1,Math.min(1,unfold*5),unfold);
    }
    return true;
  }
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
      c.enabled&&!/^(F4E |C3 |F4G |H5 |R5b )/.test(c.entity?.name||''));
    const record={sku,fallback,visual:null,legacy:false};
    instances.set(node,record);
    load(sku).then(asset=>{
      // ClearShopPreview destroys temporary roots while downloads are pending.
      if(!node.parent||instances.get(node)!==record)return;
      const renderEntity=asset.resource.instantiateRenderEntity();
      if(!renderEntity)throw Error('Empty GLB '+sku);
      const pivot=new pc.Entity('Meshy furniture '+sku);
      pivot.setLocalPosition(fit.offset.x,fit.offset.y,fit.offset.z);
      pivot.setLocalEulerAngles(fit.rotationX,fit.rotationY,0);
      renderEntity.setLocalScale(fit.scale.x,fit.scale.y,fit.scale.z);
      pivot.addChild(renderEntity);
      node.addChild(pivot);
      record.visual=pivot;
      pivot.enabled=!record.legacy;
      for(const component of fallback)component.enabled=record.legacy;
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
    if(!record)return false;
    if(record.legacy===Boolean(enabled))return true;
    record.legacy=Boolean(enabled);
    if(!record.visual)return false;
    record.visual.enabled=!record.legacy;
    for(const component of record.fallback)component.enabled=record.legacy;
    return true;
  }
  return Object.freeze({
    attach,useProcedural,setBedCover,
    hasModel:node=>Boolean(instances.get(node)?.visual?.enabled),
    stats:()=>Object.freeze({attached,failures,cachedSkus:assets.size})
  });
}
