import {proceduralFurnitureModel} from '../../src/furniture-procedural-library.js';
import {mkdirSync,writeFileSync} from 'node:fs';
const part=(kind,name,x,y,z,sx,sy,sz,color,rotation=null)=>({kind,name,x,y,z,sx,sy,sz,color,rotation});
const models=Object.fromEntries(['diningtable.farm','floorlamp.arc','sculpture.balance'].map(id=>[id,proceduralFurnitureModel(id).parts]));
// Exact geometry parameters from pinned game.js and pool-visual.js, reconstructed in lab.
models['tree.round']=[part('cylinder','trunk',0,.70,0,.28,1.4,.28,'#775746'),part('sphere','canopy',0,1.65,0,1.188,.94,1.188,'#63865a'),part('sphere','east',.38,1.43,-.14,.72,.72,.72,'#8ca46a'),part('sphere','west',-.37,1.48,.20,.64,.68,.66,'#4e7048')];
const ladder=[];
for(const x of [-.18,.18]){
for(const [name,y,z,w,h,d] of [['socket',.015,-.102,.105,.04,.105],['deck rail',.25,-.102,.055,.50,.055],['grip',.49,.025,.055,.055,.31],['wet rail',-.15,.15,.055,1.32,.055]])ladder.push(part('box',name,x,y,z,w,h,d,'#aab8b7'));
}
for(let i=0;i<5;i++)ladder.push(part('box','rung',0,.12-i*.2,.15,.37,.045,.06,'#aab8b7'));
models['pool.ladder']=ladder;
mkdirSync('artifacts/of-01/lab',{recursive:true});
writeFileSync('artifacts/of-01/lab/baseline.json',JSON.stringify(models,null,2));
