import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync, readFileSync} from 'node:fs';
import {digest, editGlb} from '../scripts/cas-c3-glb.mjs';
import {motionTracks, samplePose} from '../scripts/cas-c3-contact.mjs';
import {modelResolver, multiply} from '../scripts/cas-c3-rig.mjs';
import {intoFootFrame} from '../scripts/cas-c3-foot-frame.mjs';
import {meshSections, rayDistance} from '../scripts/cas-c4-open-upper.mjs';
import {HEEL_CLIPS} from '../scripts/cas-c4c-heel-motion.mjs';
import {HEEL_PINS, heelSourceFile, normalizeHeelPair} from '../scripts/cas-c4c-heel-source.mjs';

const root = new URL('../assets/characters/cas-c3/', import.meta.url);
const read = file => readFileSync(new URL(file, root));
const requires = {skip: !existsSync(new URL('c4c-manifest.json', root)) && process.env.CAS_C4C_REQUIRE_ASSETS !== '1'};
const sides = ['left', 'right'];

function layer(editor, name) {
  const node = editor.gltf.nodes.find(n => n.name === name);
  assert.equal(node?.skin, 0, name);
  const primitive = editor.gltf.meshes[node.mesh].primitives[0];
  const indices = editor.read(primitive.indices).flat();
  return {positions: editor.read(primitive.attributes.POSITION), triangles: indices.length / 3,
    faces: Array.from({length: indices.length / 3}, (_, i) => indices.slice(i * 3, i * 3 + 3)),
    joints: editor.read(primitive.attributes.JOINTS_0), weights: editor.read(primitive.attributes.WEIGHTS_0)};
}

function fixture() {
  const manifest = JSON.parse(read('c4c-manifest.json'));
  const body = editGlb(read('mira.glb'));
  const shoe = editGlb(read(manifest.file));
  const skin = shoe.gltf.skins[0];
  const inverse = shoe.read(skin.inverseBindMatrices);
  return {manifest, body, shoe, skin, inverse};
}

test('C4C matches the exact CC0 source and original Mira bind with a separate rigged heel pair', requires, () => {
  const {manifest, body, shoe, skin, inverse} = fixture();
  const c4b = JSON.parse(read('c4-manifest.json')).wearers.mira;
  assert.equal(manifest.resident, 'mira');
  assert.equal(manifest.bodySha256, c4b.bodySha256);
  assert.equal(manifest.inverseBindSha256, c4b.inverseBindSha256);
  assert.equal(digest(read(manifest.file)), manifest.sha256);
  assert.deepEqual(manifest.source.pins, HEEL_PINS);
  assert.deepEqual(manifest.clips, HEEL_CLIPS);
  for (const [file, sha] of Object.entries(HEEL_PINS)) assert.equal(digest(read(heelSourceFile(file))), sha);
  const source = normalizeHeelPair(read(heelSourceFile('high-heels.glb')));
  assert.equal(shoe.gltf.textures.length, source.editor.gltf.textures.length);
  assert.deepEqual(skin.joints, body.gltf.skins[0].joints);
  assert.deepEqual(inverse, body.read(body.gltf.skins[0].inverseBindMatrices));
  const profile = JSON.parse(read('mira.profile.json'));
  for (const side of sides) {
    const fit = manifest.fit[side];
    assert.ok(fit.heelRise > .08 && fit.heelRise < .09);
    assert.ok(fit.pitch > .40 && fit.pitch < .53);
    const mesh = layer(shoe, 'C3 shoe ' + side);
    assert.equal(mesh.triangles, 6716);
    assert.equal(mesh.triangles, source.sides[side].faces.length);
    assert.ok(mesh.weights.every(([one, ...rest]) => one === 1 && rest.every(n => n === 0)));
    assert.ok(mesh.joints.every(([joint]) => joint === profile.sides[side].joints.Foot));
    const cuff = mesh => mesh.positions.flatMap((p, i) =>
      Math.abs(p[1] - profile.sides[side].seam.y) < 1e-6 ? [[p, mesh.joints[i], mesh.weights[i]]] : []);
    for (const garment of ['foot', 'sock']) {
      const old = layer(body, 'C3 ' + garment + ' ' + side);
      const fitted = layer(shoe, 'C3 opening ' + garment + ' ' + side);
      assert.ok(cuff(old).length >= 12);
      assert.deepEqual(cuff(fitted), cuff(old));
    }
  }
});

const vertical = (m, [x, y, z]) => m[1] * x + m[5] * y + m[9] * z + m[13];

test('C4C skin and socks occupy the open instep in stance and remain under the closed toe', requires, () => {
  const {manifest, shoe, skin, inverse} = fixture();
  const profile = JSON.parse(read('mira.profile.json'));
  const stance = shoe.gltf.animations.find(clip => clip.name === HEEL_CLIPS.bind);
  const rig = modelResolver(shoe.gltf, samplePose(motionTracks(shoe, stance), 0));
  const joints = skin.joints.map((node, i) => multiply(rig(node), inverse[i]));
  const model = (m, [x, y, z]) => [0, 1, 2].map(i => m[i] * x + m[i + 4] * y + m[i + 8] * z + m[i + 12]);
  for (const side of sides) {
    const fit = manifest.fit[side], {axis} = profile.sides[side];
    const local = p => intoFootFrame(p, axis);
    const heel = local(model(joints[fit.joint], fit.heelTip));
    const ball = local(model(joints[fit.joint], fit.ball));
    const sections = name => {
      const mesh = layer(shoe, name + side);
      const points = mesh.positions.map((p, i) => {
        const moved = mesh.joints[i].map(joint => model(joints[joint], p));
        return local([0, 1, 2].map(a => moved.reduce((sum, point, j) => sum + point[a] * mesh.weights[i][j], 0)));
      });
      return meshSections(points, mesh.faces);
    };
    const shell = sections('C3 shoe ');
    for (const garment of ['foot', 'sock']) {
      const inside = sections('C3 opening ' + garment + ' ');
      for (const sample of [.43, .54, .70, 1.11]) {
        const z = heel[2] + sample * (ball[2] - heel[2]);
        const top = slice => 1 - rayDistance(slice(z), [ball[0], 1], [0, -1]);
        const shoeTop = top(shell), garmentTop = top(inside);
        assert.ok(Number.isFinite(shoeTop) && Number.isFinite(garmentTop), `${side} ${garment} ${sample}`);
        assert.ok(sample > 1 ? garmentTop < shoeTop : garmentTop > shoeTop + .015,
          `${side} ${garment} ${sample}: foot ${garmentTop}, shoe ${shoeTop}`);
      }
    }
  }
});

test('C4C keeps real heel and forefoot contacts across subframes with alternating walk support', requires, () => {
  const {manifest, shoe, skin, inverse} = fixture();
  const fit = sides.map(side => ({...manifest.fit[side], positions: layer(shoe, 'C3 shoe ' + side).positions}));
  assert.deepEqual(shoe.gltf.animations.map(clip => clip.name), Object.values(HEEL_CLIPS));
  for (const clip of shoe.gltf.animations) {
    const tracks = motionTracks(shoe, clip);
    const duration = Math.max(...tracks.map(t => t.times.at(-1)));
    const count = Math.ceil(120 * duration);
    const walk = clip.name === HEEL_CLIPS.walk;
    const flags = sides.map(() => ({strike: false, pushOff: false, swing: false}));
    for (let i = 0; i <= count; i++) {
      const rig = modelResolver(shoe.gltf, samplePose(tracks, i / count * duration));
      const heights = fit.map(({joint, heelTip, ball, positions}, side) => {
        const pose = multiply(rig(skin.joints[joint]), inverse[joint]);
        const heel = vertical(pose, heelTip), toe = vertical(pose, ball);
        const bottom = Math.min(...positions.map(p => vertical(pose, p)));
        assert.ok(bottom > -.0035, clip.name + ' penetrates the floor at ' + i + ' by ' + bottom);
        if (!walk) {
          assert.ok(Math.abs(heel) < .002 && Math.abs(toe) < .002, clip.name + ' needs two supports');
        } else {
          const active = flags[side];
          active.strike ||= heel < .006 && toe - heel > .02;
          active.pushOff ||= toe < .007 && heel - toe > .02;
          active.swing ||= bottom > .04;
        }
        return bottom;
      });
      assert.ok(Math.min(...heights) < .0035, clip.name + ' has no grounded foot at frame ' + i);
    }
    if (walk) assert.deepEqual(flags, sides.map(() => ({strike: true, pushOff: true, swing: true})));
  }
});
