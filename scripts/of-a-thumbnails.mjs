import {OF_INTERIOR_ENTRIES} from '../src/of-interior-assets.js';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const source=process.argv[2];assert.ok(source,'exact approved artifact path required');
mkdirSync('assets/furniture/of-r2/thumbnails',{recursive:true});
for(const e of OF_INTERIOR_ENTRIES){const glb=readFileSync(source+'/lab/'+e.file);assert.equal(createHash('sha256').update(glb).digest('hex'),e.sha256);const png=readFileSync(source+'/blender/'+e.sku+'-new-three-quarter.png');assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.ok(png.length>2000);writeFileSync('assets/furniture/of-r2/thumbnails/'+e.sku+'.png',png);}
console.log('20 reviewed same-GLB thumbnails copied from exact R2 evidence');
