// Convex trilinear weights on jointly evaluated native nodes; neutral implicit.
export const bodyAxes=['fullness','muscle','proportions'];
export function latticeWeights(values){
 const q=bodyAxes.map(k=>{const x=values[k]??0;if(!Number.isFinite(x)||x< -1||x>1)throw RangeError(k);return x+1});
 const lo=q.map(x=>Math.min(1,Math.floor(x))),f=q.map((x,i)=>x-lo[i]),out={};
 for(let a=0;a<2;a++)for(let b=0;b<2;b++)for(let c=0;c<2;c++){
 const bits=[a,b,c],key='grid_'+bits.map((x,i)=>lo[i]+x).join('');
 const w=bits.reduce((p,x,i)=>p*(x?f[i]:1-f[i]),1);
 if(key!=='grid_111'&&w>0)out[key]=w;
 }return out;
}
