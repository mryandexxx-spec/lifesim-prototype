import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {digest, editGlb} from './cas-c3-glb.mjs';
import {HEEL_CLIPS} from './cas-c4c-heel-motion.mjs';
import {HEEL_PINS, heelSourceFile} from './cas-c4c-heel-source.mjs';

const base = resolve(process.argv[2] ?? 'site');
const assets = resolve(base, 'assets/characters/cas-c3');
const read = name => readFileSync(resolve(assets, name));
const manifest = JSON.parse(read('c4c-manifest.json'));
const c4b = JSON.parse(read('c4-manifest.json')).wearers.mira;
if (manifest.version !== 1 || manifest.stage !== 'CAS-02.1-F2-C4C' || manifest.resident !== 'mira' ||
    manifest.file !== 'mira-c4c-heels.glb' || manifest.bodySha256 !== c4b.bodySha256 ||
    manifest.inverseBindSha256 !== c4b.inverseBindSha256)
  throw new Error('C4C Pages index or Mira binding does not match');
const bytes = read(manifest.file);
if (digest(bytes) !== manifest.sha256) throw new Error('C4C Pages fitted GLB checksum differs');
const still = read('mira-c4c-preview.jpg');
if (still.length < 100 || still.readUInt16BE(0) !== 0xffd8)
  throw new Error('C4C Pages startup preview is missing or invalid');
for (const [file, hash] of Object.entries(HEEL_PINS)) {
  if (manifest.source.pins[file] !== hash || digest(read(heelSourceFile(file))) !== hash)
    throw new Error('C4C Pages original publisher bytes differ: ' + file);
}
const {gltf} = editGlb(bytes);
for (const [mode, clip] of Object.entries(HEEL_CLIPS)) {
  if (manifest.clips[mode] !== clip || !gltf.animations?.some(animation => animation.name === clip))
    throw new Error('C4C Pages animation missing: ' + clip);
}
if (gltf.animations.length !== Object.keys(HEEL_CLIPS).length ||
    !readFileSync(resolve(base, 'cas-f2-c4b-lab.html'), 'utf8').includes('value="heels"') ||
    !readFileSync(resolve(base, 'src/cas-f2-c4b-lab.js'), 'utf8').includes('c4c-manifest.json'))
  throw new Error('C4C Pages prepared preview is incomplete');
console.log('C4C Pages: pinned CC0 pair, Mira bind, four heel poses and preview verified');
