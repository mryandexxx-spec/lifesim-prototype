import {createHash} from 'node:crypto';
import {SOURCE_SHA256} from './build-cas-resident-footwear-v2.mjs';

const EPSILON = .00001;
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const SIDES = ['left', 'right'];

export function multiply(a, b) {
  return Array.from({length: 16}, (_, index) => {
    const row = index % 4;
    const column = Math.floor(index / 4) * 4;
    return a[row] * b[column] + a[row + 4] * b[column + 1] +
      a[row + 8] * b[column + 2] + a[row + 12] * b[column + 3];
  });
}

function localMatrix(node) {
  if (node.matrix) return node.matrix;
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1
  ];
}

export function readBindRig(editor, resident) {
  const {gltf, source} = editor;
  if (source.sourceSha256 !== SOURCE_SHA256[resident]) throw new Error('C3 resident source hash mismatch');
  const skin = gltf.skins[0];
  if (gltf.skins.length !== 1 || skin.joints.length !== 66 || !gltf.animations.length)
    throw new Error('C3 resident rig structure changed');
  const children = new Map(gltf.nodes.flatMap((n, i) => (n.children ?? []).map(child => [child, i])));
  const cache = new Map();
  function modelMatrix(index) {
    if (cache.has(index)) return cache.get(index);
    const local = localMatrix(gltf.nodes[index]);
    const ancestor = children.get(index);
    const matrix = ancestor === undefined ? local : multiply(modelMatrix(ancestor), local);
    cache.set(index, matrix);
    return matrix;
  }

  const inverses = editor.read(skin.inverseBindMatrices);
  const maxBindError = Math.max(...skin.joints.map((node, j) =>
    Math.max(...multiply(modelMatrix(node), inverses[j]).map((v, i) => Math.abs(v - IDENTITY[i])))));
  if (maxBindError > EPSILON) throw new Error(`C3 inconsistent inverse bind matrices: ${maxBindError}`);
  const sides = Object.fromEntries(SIDES.map(side => {
    const title = side[0].toUpperCase() + side.slice(1);
    const joints = {};
    const anchors = {};
    for (const bone of ['Leg', 'Foot', 'ToeBase']) {
      const name = `mixamorig:${title}${bone}`;
      const index = skin.joints.findIndex(i => gltf.nodes[i].name === name);
      if (index < 0) throw new Error(`C3 required bind bone absent: ${name}`);
      joints[bone] = index;
      anchors[bone] = modelMatrix(skin.joints[index]).slice(12, 15);
    }
    return [side, {joints, anchors}];
  }));
  const inverseBytes = Buffer.alloc(inverses.length * 16 * 4);
  inverses.flat().forEach((v, i) => inverseBytes.writeFloatLE(v, i * 4));
  return {version: 1, resident, modelSha256: source.sourceSha256,
    inverseBindSha256: createHash('sha256').update(inverseBytes).digest('hex'),
    maxBindError, sides};
}
