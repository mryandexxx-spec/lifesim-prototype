import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {buildWearable} from './cas-c3-shoes.mjs';

const destination = 'artifacts/cas-02-1-f2-c3';
const source = 'https://grab3d.com/dl/slippers/';
const folder = new URL('../assets/characters/cas-c3/', import.meta.url);

const provided = process.argv[2];
function get(file) {
  if (provided) return readFileSync(resolve(provided, file));
  return execFileSync('curl', ['--fail', '--silent', '--show-error', '--retry', '2',
    '--max-time', '25', '--proto', '=https', source + file], {maxBuffer: 4 * 1024 * 1024});
}
const mesh = get('slippers.glb');
const terms = get('LICENSE.txt').toString('utf8');
const provenance = get('manifest.json').toString('utf8');
assert.match(terms, /CC0/i);
assert.match(provenance, /CC0/i);
assert.match(provenance, /slippers\.glb/i);
const proof = {style: 'slippers', source, visualApproved: false, fit: {}};
for (const resident of ['alex', 'mira']) {
  const profile = JSON.parse(readFileSync(new URL(resident + '.profile.json', folder)));
  const body = readFileSync(new URL(resident + '.glb', folder));
  const {stats} = buildWearable(body, profile, mesh, 'slippers');
  assert.equal(stats.left.triangles, 5698);
  assert.equal(stats.right.triangles, 5698);
  proof.fit[resident] = stats;
}
mkdirSync(destination, {recursive: true});
writeFileSync(destination + '/fourth-source.json', JSON.stringify(proof, null, 2) + '\n');
console.log('C3 fourth independent source compiled (5,698 faces per slipper) for both rigs');
