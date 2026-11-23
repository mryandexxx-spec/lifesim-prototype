import {readFileSync, statSync} from 'node:fs';
import {resolve} from 'node:path';
import {digest} from './cas-c3-glb.mjs';
import {C3_STYLES} from './cas-c3-shoes.mjs';

const root = process.argv[2] ?? 'site';
for (const file of ['cas-f2-c3-lab.html', 'src/cas-f2-c3-lab.js', 'vendor/playcanvas.mjs']) {
  if (!statSync(resolve(root, file)).size) throw new Error('Missing staged C3 dependency: ' + file);
}
const directory = resolve(root, 'assets/characters/cas-c3');
const manifest = JSON.parse(readFileSync(resolve(directory, 'manifest.json'), 'utf8'));
if (manifest.version !== 1 || Object.keys(manifest.wearers).length !== 2)
  throw new Error('Invalid staged C3 manifest');
function verify(file, expected) {
  if (!/^[a-z]+(?:-[a-z]+)?\.glb$/.test(file) ||
      digest(readFileSync(resolve(directory, file))) !== expected)
    throw new Error('C3 release checksum mismatch: ' + file);
}
for (const id of ['alex', 'mira']) {
  const {body, bodySha256, styles} = manifest.wearers[id];
  verify(body, bodySha256);
  for (const style of C3_STYLES) verify(styles[style].file, styles[style].sha256);
}
console.log('C3 Pages validated: 2 bodies, 6 wearables, manifest and entrypoint');
