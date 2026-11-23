import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync, readFileSync} from 'node:fs';
import {parseLegacyGlb, sourceAccessor} from '../scripts/cas-source-asset-audit.mjs';
import {C3_STYLES, normalizeShoePair} from '../scripts/cas-c3-shoes.mjs';
import {digest} from '../scripts/cas-c3-glb.mjs';

const root = new URL('../assets/characters/', import.meta.url);
const manifestPath = new URL('cas-c3/manifest.json', root);
const built = existsSync(manifestPath);
const strict = process.env.CAS_C3_REQUIRE_ASSETS === '1';

test('C3 source pose and complete disjoint shoe parts export on both resident rigs', {skip: !built && !strict}, () => {
  const manifest = JSON.parse(readFileSync(manifestPath));
  for (const style of C3_STYLES) {
    const source = readFileSync(new URL('cas-cc0-f0/' + style + '.glb', root));
    const {sides} = normalizeShoePair(source, style);
    const dimensions = {};
    for (const side of ['left', 'right']) {
      const {vertices, faces} = sides[side];
      const extent = [0, 1, 2].map(axis => {
        const values = vertices.map(v => v.position[axis]);
        return Math.max(...values) - Math.min(...values);
      });
      dimensions[side] = extent;
      assert.ok(extent[2] > .25 && extent[2] < .35);
      assert.equal(faces.length, {dress: 9872, sneakers: 9919, boots: 10004}[style]);
    }
    assert.ok(dimensions.left.every((n, i) => Math.abs(n-dimensions.right[i]) < .002));
    for (const wearer of Object.values(manifest.wearers)) {
      const {file, sha256} = wearer.styles[style];
      const bytes = readFileSync(new URL('cas-c3/' + file, root));
      assert.equal(digest(bytes), sha256);
      const pair = parseLegacyGlb(bytes);
      const body = parseLegacyGlb(readFileSync(new URL('cas-c3/' + wearer.body, root)));
      const matrices = model => sourceAccessor(model, model.gltf.skins[0].inverseBindMatrices).values;
      assert.deepEqual(matrices(pair), matrices(body));
      for (const side of ['left', 'right']) {
        const node = pair.gltf.nodes.find(n => n.name === 'C3 shoe ' + side);
        const p = pair.gltf.meshes[node.mesh].primitives[0];
        assert.equal(node.skin, 0);
        const weights = sourceAccessor(pair, p.attributes.WEIGHTS_0).values;
        assert.ok(weights.some(w => w > .1 && w < .9));
        for (let i = 0; i < weights.length; i += 4)
          assert.ok(Math.abs(weights[i]+weights[i+1]+weights[i+2]+weights[i+3]-1) < 1e-6);
      }
    }
  }
});
