/** Browser-agnostic screen-space touch selection for a projected 3D world.
 * The DOM overlays are optional; a player can still tap an unlabelled object.
 * Only a tap (not drag or multi-touch) should call this function.
 */
export function pickWorldTarget(x,y,targets){
  if(!Number.isFinite(x)||!Number.isFinite(y)||!Array.isArray(targets))return null;
  const valid=[];
  for(const target of targets){
    if(!target||target.visible===false||!['resident','object'].includes(target.kind)||
       typeof target.id!=='string'||!Number.isFinite(target.x)||!Number.isFinite(target.y)||
       !Number.isFinite(target.rx)||!Number.isFinite(target.ry)||
       target.rx<=0||target.ry<=0)continue;
    const distance=((x-target.x)/target.rx)**2+((y-target.y)/target.ry)**2;
    if(distance<=1)valid.push({target,distance});
  }
  // Residents take precedence over overlapping furniture when physically tapped.
  valid.sort((a,b)=>Number(b.target.kind==='resident')-Number(a.target.kind==='resident')||
    a.distance-b.distance);
  return valid.length?{kind:valid[0].target.kind,id:valid[0].target.id}:null;
}

/**
 * Segment-vs-AABB intersection, using CSS-pixel ray endpoints supplied by
 * PlayCanvas CameraComponent.screenToWorld. No physics engine is required.
 * Returns a 0..1 segment fraction, or null on miss/invalid geometry.
 */
export function rayBoxHit(near,far,bounds){
  for(const point of [near,far,bounds?.min,bounds?.max]){
    if(!point||!['x','y','z'].every(a=>Number.isFinite(point[a])))return null;
  }
  let tmin=0,tmax=1;
  let changed=false;
  for(const axis of ['x','y','z']){
    const lo=bounds.min[axis],hi=bounds.max[axis];
    if(lo>hi)return null;
    const d=far[axis]-near[axis];
    if(Math.abs(d)<1e-9){
      if(near[axis]<lo||near[axis]>hi)return null;
    }else{
      let a=(lo-near[axis])/d,b=(hi-near[axis])/d;
      if(a>b)[a,b]=[b,a];
      tmin=Math.max(tmin,a);tmax=Math.min(tmax,b);
      if(tmin>tmax)return null;
      changed=true;
    }
  }
  return changed?tmin:null;
}
/**
 * Nearest *3D surface* wins instead of a screen-space actor priority.
 * 'blocker' volumes represent props that visibly cover an interaction, but
 * are not themselves interactive. They suppress tapping objects behind them.
 */
export function pickWorldRayTarget(near,far,targets){
  if(!Array.isArray(targets))return null;
  const found=[];
  for(const candidate of targets){
    if(!candidate||candidate.visible===false||!['object','resident','blocker','outdoor'].includes(candidate.kind))continue;
    if(typeof candidate.id!=='string'||!candidate.id.trim())continue;
    const at=rayBoxHit(near,far,candidate.bounds);
    if(at!==null)found.push({target:candidate,at});
  }
  if(!found.length)return null;
  found.sort((a,b)=>a.at-b.at);
  // If two registered boxes share a physical face, resident wins a numerical
  // tie; otherwise a person behind a sofa is never selected through the sofa.
  const best=found[0];
  for(const other of found){
    if(other.at>best.at+0.0005)break;
    if(other.target.kind==='blocker')return null;
    if(other.target.kind==='resident'&&best.target.kind!=='resident')
      return {kind:'resident',id:other.target.id};
  }
  // A copied functional object must retain its exact saved instance ID
  // through 3D ray selection → action queue → route → animation.
  return best.target.kind==='blocker'?null:
    {kind:best.target.kind,id:best.target.id,
      ...(typeof best.target.instanceId==='string'
        ?{instanceId:best.target.instanceId}:{})};
}
