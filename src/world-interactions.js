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
