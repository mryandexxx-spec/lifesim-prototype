import {readFileSync} from 'node:fs';
import {digest, editGlb} from './cas-c3-glb.mjs';
import {FEMALE_STYLES} from './cas-c4-mira-shoes.mjs';

const base = new URL('../assets/characters/cas-c3/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('c4-source-manifest.json',base)));
if (manifest.version !== 1 || !manifest.sourceURL?.startsWith('https://files'))
  throw new Error('C4 missing publisher source identity');
const exact = {
  ballet: {id:'toigo_ballet_flats', glb:'6e7d8d9659d2da99d3c52dd7d9618440b0623760cecd2bd2ddbc997ae45e1d84',obj:'80fd320014da',tris:8960},
  'mary-jane': {id:'toigo_mj_cloth_shoes',glb:'768ce0f1180d988fc14d21a9e49a8b5a690ceda2528d5cc7a79619242ec8c58c',obj:'adcfd0886d1e',tris:1004},
  'ankle-boots': {id:'toigo_ankle_boots_female',glb:'c2e390e73ef79c58ca8d4f7380e4f766b87557df54ed0779867c86576d707d12',obj:'dfceab751494',tris:4120}
};
for (const style of FEMALE_STYLES) {
  const pin=exact[style], source=manifest.styles[style];
  if (!source || source.sourceID!==pin.id || source.license!=='CC0 (source MHCLO declaration)' ||
    source.triangles!==pin.tris || !source.sourceObjSha256.startsWith(pin.obj) ||
    source.sha256!==pin.glb || source.file!=='c4-'+style+'.source.glb' ||
    source.sides.left+source.sides.right!==pin.tris)
    throw new Error('C4 source must match exact audited original publisher ' + style);
  const bytes=readFileSync(new URL(source.file,base));
  if (digest(bytes)!==pin.glb) throw new Error('C4 source GLB changed '+style);
  const model=editGlb(bytes);
  if (model.gltf.images?.length!==1 || model.gltf.skins?.length ||
      model.read(model.gltf.meshes[0].primitives[0].indices).length!==pin.tris*3)
    throw new Error('C4 source GLB lost audited image/mesh '+style);
}
console.log('C4B original female GLB source cache verified against exact CC0 audit and immutable SHA');
