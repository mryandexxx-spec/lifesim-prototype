/** R1a cosmetic embrace. No DOM, renderer, simulation effects or saved state. */
export const HUG_DURATION_MINUTES=18;
export const HUG_REFUSAL_DURATION_MINUTES=3;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
/** No contact until actual recipient approval has been stored on arrival. */
export function hugMotion(social){
  if(social?.phase!=='using'||social.branchAction?.id!=='romance.hug'||
    social.branchAction.hugConsent!==true||!Number.isFinite(social.elapsed))
    return {weight:0,progress:0,active:false};
  const progress=clamp(social.elapsed/HUG_DURATION_MINUTES);
  return {weight:smooth(.06,.34,progress)*(1-smooth(.74,.96,progress)),progress,active:true};
}
/** Symmetric cosmetic approach. The authoritative simulation positions stay put. */
export function hugPairTarget(a,b,weight){
  if(!a||!b||![a.x,a.z,b.x,b.z].every(Number.isFinite))return null;
  const dx=b.x-a.x,dz=b.z-a.z,dist=Math.hypot(dx,dz);
  if(dist<.16||dist>1.7)return null;
  const advance=Math.min(.33,Math.max(0,(dist-.42)/2))*clamp(weight);
  const ux=dx/dist,uz=dz/dist;
  return {a:{x:a.x+ux*advance,z:a.z+uz*advance},
    b:{x:b.x-ux*advance,z:b.z-uz*advance},distance:dist-2*advance};
}
