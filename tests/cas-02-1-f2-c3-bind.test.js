import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {gunzipSync} from 'node:zlib';
import {buildBody} from '../scripts/cas-c3-body.mjs';
import {readSourceAsset, parseLegacyGlb, sourceAccessor} from '../scripts/cas-source-asset-audit.mjs';
import {digest} from '../scripts/cas-c3-glb.mjs';

const template = JSON.parse(gunzipSync(readFileSync(new URL('../assets/characters/cas-c3/foot-template.json.gz', import.meta.url))));

function rows(model, index) {
  const {values, componentCount} = sourceAccessor(model, index);
  return Array.from({length: values.length / componentCount}, (_, i) =>
    values.slice(i * componentCount, (i + 1) * componentCount));
}

function semantic(model, name, field) {
  const node = model.gltf.nodes.find(n => n.name === name);
  return rows(model, model.gltf.meshes[node.mesh].primitives[0].attributes[field]);
}

function seam(model, name, y, side) {
  const positions = semantic(model, name, 'POSITION');
  const joints = semantic(model, name, 'JOINTS_0');
  const weights = semantic(model, name, 'WEIGHTS_0');
  return positions.flatMap((p, i) =>
    p[1] === Math.fround(y) && (p[0] > 0) === (side === 'left') ?
      [JSON.stringify([p, joints[i], weights[i]])] : []);
}

test('C3 builds exact bind seams and keeps original weighted clips for both residents', () => {
  const hashes = [];
  for (const resident of ['alex', 'mira']) {
    const raw = readSourceAsset(resident);
    const original = parseLegacyGlb(raw);
    const {glb, profile} = buildBody(raw, resident, template);
    const model = parseLegacyGlb(glb);
    assert.ok(profile.maxBindError < .00001);
    hashes.push(profile.inverseBindSha256);
    assert.deepEqual(model.gltf.skins, original.gltf.skins);
    assert.deepEqual(model.gltf.animations, original.gltf.animations);
    const originalNodeCount = original.gltf.nodes.length;
    const preserved = model.gltf.nodes.slice(0, originalNodeCount).map(node =>
      node.children ? {...node, children: node.children.filter(i => i < originalNodeCount)} : node);
    assert.deepEqual(preserved, original.gltf.nodes);
    assert.deepEqual(model.bin.subarray(0, original.bin.length), original.bin);
    for (const side of ['left', 'right']) {
      const {seam: {y, vertices}, joints, footLength, soleY, axis} = profile.sides[side];
      const body = [...new Set(seam(model, 'C3 body', y, side))].sort();
      assert.equal(body.length, vertices);
      assert.ok(footLength > .16 && footLength < .28);
      assert.ok(Math.abs(Math.hypot(axis.sin, axis.cos)-1) < 1e-10);
      assert.ok(axis.sin * (side === 'left' ? 1 : -1) > 0);
      const donor = template.sides[side];
      const {heel, toe, ball} = donor.landmarks;
      const lengthScale = footLength / (toe[2] - heel[2]);
      const barefoot = semantic(model, 'C3 foot ' + side, 'POSITION');
      let measured = 0;
      for (const [i, vertex] of donor.vertices.entries()) {
        if (vertex[2] < ball[2]) continue;
        assert.ok(Math.abs(barefoot[i][1] - soleY - vertex[1]*lengthScale) < 1e-7,
          'instep and toes keep the template proportions');
        measured++;
      }
      assert.ok(measured > 20);
      const tone = semantic(model, 'C3 foot ' + side, 'COLOR_0');
      assert.equal(tone.length, barefoot.length);
      assert.ok(new Set(tone.map(v => v.join(','))).size > 8, 'native seams retain the sampled skin tones');
      for (const layer of ['foot', 'sock']) {
        const name = 'C3 ' + layer + ' ' + side;
        assert.deepEqual(seam(model, name, y, side).sort(), body);
        const weight = semantic(model, name, 'WEIGHTS_0');
        const indices = semantic(model, name, 'JOINTS_0');
        assert.ok(weight.every(w => Math.abs(w.reduce((sum, x) => sum + x) - 1) < 1e-6));
        assert.ok(weight.some((values, i) => values.some((v, k) => v > .8 && indices[i][k] === joints.ToeBase)));
      }
    }
    assert.equal(digest(buildBody(raw, resident, template).glb), digest(glb));
  }
  assert.notEqual(...hashes);
});
