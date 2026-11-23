import {readFileSync, statSync} from 'node:fs';
import {resolve} from 'node:path';
import {digest} from './cas-c3-glb.mjs';
import {FEMALE_STYLES} from './cas-c4-mira-shoes.mjs';

const base = resolve(process.argv[2] ?? 'site');
const folder = resolve(base,'assets/characters/cas-c3');
const read = name => readFileSync(resolve(folder,name));
const manifest = JSON.parse(read('c4-manifest.json'));
const source = JSON.parse(read('c4-source-manifest.json'));
const old = JSON.parse(read('manifest.json'));
if (manifest.version !== 1 || manifest.resident !== 'mira' ||
    Object.keys(manifest.wearers).join() !== 'mira' ||
    manifest.maleBaselineSha256 !== old.wearers.alex.bodySha256)
  throw new Error('C4 staged release corrupted resident/male baseline');
if (manifest.wearers.mira.bodySha256 !== old.wearers.mira.bodySha256)
  throw new Error('C4 baseline Mira modified by import');
for (const name of FEMALE_STYLES) {
  const item = manifest.wearers.mira.styles[name];
  const approved = source.styles[name];
  if (!item || !approved || item.sourceSha256 !== approved.sha256 ||
      !approved.license.includes('CC0') ||
      !Number.isInteger(approved.triangles) || approved.triangles < 100 || approved.triangles > 30000)
    throw new Error('C4 incomplete source identity '+name);
  for (const [file,sha] of [[item.file,item.sha256],[approved.file,approved.sha256]]) {
    const path = resolve(folder,file);
    if (!file.startsWith('c4-') && !file.startsWith('mira-c4-')) throw new Error('C4 unsafe file');
    if (statSync(path).size < 25000 || digest(readFileSync(path)) !== sha)
      throw new Error('C4 staged GLB digest mismatch '+file);
  }
  for (const side of ['left','right'])
    if (item.sides[side].triangles !== approved.sides[side])
      throw new Error('C4 shoe half topology mismatch '+name+' '+side);
}
for(const pathname of ['cas-f2-c4b-lab.html','src/cas-f2-c4b-lab.js'])
  if(statSync(resolve(base,pathname)).size<200)
    throw new Error('C4 staged preview missing '+pathname);
console.log('C4 Pages: three true female vendor styles, Mira-only bind, SHA, source textures and preview validated');
