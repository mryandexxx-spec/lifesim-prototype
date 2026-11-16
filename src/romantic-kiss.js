/** R1b: purely cosmetic, synchronized kiss; zero motion before arrival consent. */
export const KISS_DURATION_MINUTES=16;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
export function kissMotion(social){
  if(social?.phase!=='using'||social.branchAction?.id!=='romance.kiss'||
    social.branchAction.kissConsent!==true||!Number.isFinite(social.elapsed))
    return {weight:0,progress:0,active:false};
  const progress=clamp(social.elapsed/KISS_DURATION_MINUTES);
  return {weight:smooth(.08,.35,progress)*(1-smooth(.70,.94,progress)),
    progress,active:true};
}
/** Symmetric drawing in of *render-only* roots, not simulation coordinates. */
export function kissPairTarget(a,b,weight){
  if(!a||!b||![a.x,a.z,b.x,b.z].every(Number.isFinite))return null;
  const dx=b.x-a.x,dz=b.z-a.z,dist=Math.hypot(dx,dz);
  if(dist<.22||dist>1.7)return null;
  const advance=Math.min(.32,Math.max(0,(dist-.30)/2))*clamp(weight);
  const ux=dx/dist,uz=dz/dist;
  return {a:{x:a.x+ux*advance,z:a.z+uz*advance},
    b:{x:b.x-ux*advance,z:b.z-uz*advance},distance:dist-2*advance};
}
