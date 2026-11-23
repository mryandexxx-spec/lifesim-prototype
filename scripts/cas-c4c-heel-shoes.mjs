import {Mat4, Vec3} from 'playcanvas';
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {digest} from './cas-c3-glb.mjs';
import {layers, skinnedWearable} from './cas-c3-shoes.mjs';
import {packWeights} from './cas-c3-body.mjs';
import {intoFootFrame, fromFootFrame} from './cas-c3-foot-frame.mjs';
import {modelResolver, multiply} from './cas-c3-rig.mjs';
import {meshSections, openUpperSeat, rayDistance, refineFoot} from './cas-c4-open-upper.mjs';
import {HEEL_CLIPS, exportHeelClips, heelMotion} from './cas-c4c-heel-motion.mjs';
import {HEEL_PINS, HEEL_SOURCE, normalizeHeelPair, readHeelSource} from './cas-c4c-heel-source.mjs';

const folder = new URL('../assets/characters/cas-c3/', import.meta.url);
const clamp = (x, low, high) => Math.min(high, Math.max(low, x));
const smooth = x => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
const mix = (a, b, scale) => a.map((value, i) => value + (b[i] - value) * scale);
const vector = values => new Vec3(...values);
const matrix = values => new Mat4().set(values);

function footbed(slice, complete, rear, front) {
  // Sample the top of the authored outsole, not the bottom of the heel stem.
  const count = 80;
  const start = rear + .002, end = front - .002;
  const samples = Array.from({length: count + 1}, (_, i) => {
    const z = start + i / count * (end - start);
    const edges = slice(z);
    if (!edges.length) throw new Error('C4C outsole has no section at ' + z);
    const xs = edges.flat().map(p => p[0]);
    const center = (Math.min(...xs) + Math.max(...xs)) / 2;
    const outsole = 1 - rayDistance(edges, [center, 1], [0, -1]);
    // A low ray above the outsole finds the lining beneath the open instep.
    const aboveLining = outsole + .012;
    const height = aboveLining - rayDistance(complete(z), [center, aboveLining], [0, -1]);
    if (!Number.isFinite(height)) throw new Error('C4C outsole surface is discontinuous');
    return height;
  });
  return z => {
    const index = clamp((z - start) / (end - start) * count, 0, count);
    const a = Math.min(count - 1, Math.floor(index));
    return samples[a] + (samples[a + 1] - samples[a]) * (index - a);
  };
}

function fitLast(source, profile) {
  const {axis} = profile;
  const origin = [profile.ankle[0], 0, profile.ankle[2]];
  const footPoint = p => intoFootFrame(p.map((x, i) => x - origin[i]), axis);
  const modelPoint = p => fromFootFrame(p, axis).map((x, i) => x + origin[i]);
  const heel = footPoint(profile.heel)[2], toe = footPoint(profile.toe)[2];
  const [[minX, maxX], , [minZ, maxZ]] = source.bounds;
  const scale = (toe - heel + .012) / (maxZ - minZ);
  const widthScale = (profile.footWidth + .004) / (maxX - minX);
  const center = footPoint(profile.ball)[0];
  const back = heel - .006;
  const transform = ([x, y, z]) => [center + x * widthScale, y * scale, back + (z - minZ) * scale];
  const vertices = source.vertices.map(v => {
    const n = [...v.normal];
    n[0] *= scale / widthScale;
    return {...v, position: modelPoint(transform(v.position)),
      normal: fromFootFrame(vector(n).normalize().toArray(), axis)};
  });
  const sole = vertices.map(v => footPoint(v.position));
  const front = back + (maxZ - minZ) * scale;
  const insoleAt = footbed(meshSections(sole, source.sole), meshSections(sole, source.faces), back, front);
  const heelTip = transform(source.heelTip), ball = transform(source.ball);
  const heelRise = insoleAt(heelTip[2]) - insoleAt(ball[2]);
  const pitch = Math.atan2(heelRise, ball[2] - heelTip[2]);
  if (heelRise < .055 || heelRise > .11 || pitch < .25 || pitch > .7 ||
      Math.abs(heelTip[1] - ball[1]) > .002)
    throw new Error('C4C fitted heel contact or pitch is outside the expected physical envelope');
  return {vertices, faces: source.faces, footPoint, modelPoint, insoleAt, back, front,
    heelTip: modelPoint(heelTip), ball: modelPoint(ball),
    heelRise, pitch, seamY: profile.seam.y + heelRise};
}

function blendedMatrix(palette, {joints, weights}) {
  const result = Array(16).fill(0);
  for (const [i, joint] of joints.entries()) {
    for (let k = 0; k < 16; k++) result[k] += palette[joint][k] * weights[i];
  }
  return matrix(result);
}

function fitFoot(layer, shoe, target, palette) {
  const {top, seat} = openUpperSeat(shoe);
  const seam = target.seam.y;
  const foot = target.joints.Foot;
  const refined = refineFoot(layer, seam - .012, seam);
  function fitToShoe([width, height, depth]) {
    const collar = 1 - smooth((height - top) / (shoe.seamY - top));
    const z = depth + (clamp(depth, shoe.back + .003, shoe.front - .003) - depth) * collar;
    const point = [width, height, z];
    return collar > 0 && z > shoe.back && z < shoe.front ? seat(point, collar) : point;
  }
  const neighbors = refined.vertices.map(() => new Set());
  for (const face of refined.faces) {
    for (const i of face) for (const j of face) if (i !== j) neighbors[i].add(j);
  }
  const prepared = refined.vertices.map(v => {
    const [x, y, z] = shoe.footPoint(v.position);
    const shape = blendedMatrix(palette, v);
    const neutral = shoe.footPoint(shape.transformPoint(vector(v.position)).toArray());
    const blend = smooth((y - (seam - .065)) / .065);
    const lengthwise = clamp(z, shoe.back + .003, shoe.front - .003);
    const innerY = shoe.insoleAt(lengthwise) + .002 + Math.max(0, y - target.soleY);
    const fitted = y >= seam - 1e-7 ? neutral : fitToShoe(mix([x, innerY, lengthwise], neutral, blend));
    return {v, y, shape, blend, fitted};
  });
  // Soften facets where the ankle blends into the steeper heel shape. Keep
  // shared cuff vertices fixed and return the smoothed surface to the last.
  let positions = prepared.map(v => v.fitted);
  for (let pass = 0; pass < 2; pass++) {
    positions = positions.map((point, i) => {
      const weight = .35 * smooth((seam - prepared[i].y) / .024);
      if (!weight || !neighbors[i].size) return point;
      const adjacent = [...neighbors[i]].map(j => positions[j]);
      const average = [0, 1, 2].map(axis => adjacent.reduce((sum, p) => sum + p[axis], 0) / adjacent.length);
      return fitToShoe(mix(point, average, weight));
    });
  }
  const posed = positions.map(p => vector(shoe.modelPoint(p)));
  const normals = posed.map(() => new Vec3());
  for (const [a, b, c] of refined.faces) {
    const normal = new Vec3().cross(new Vec3().sub2(posed[b], posed[a]), new Vec3().sub2(posed[c], posed[a]));
    for (const i of [a, b, c]) normals[i].add(normal);
  }
  return {...refined, vertices: prepared.map(({v, y, shape, blend}, i) => {
    if (y >= seam - 1e-7) return v;
    const weights = new Map([[foot, 1 - blend]]);
    v.joints.forEach((joint, i) => weights.set(joint, (weights.get(joint) ?? 0) + v.weights[i] * blend));
    const packed = packWeights(weights);
    const inverse = blendedMatrix(palette, packed).invert();
    const prior = shape.transformVector(vector(v.normal)).normalize();
    const normal = inverse.transformVector(normals[i].normalize().lerp(normals[i], prior, blend)).normalize();
    return {...v, position: inverse.transformPoint(posed[i]).toArray(), normal: normal.toArray(), ...packed};
  })};
}

export function buildHeelWearable(bodyBytes, profile, sourceBytes) {
  if (profile.resident !== 'mira') throw new Error('C4C is bound to Mira');
  const {editor, material, sides: source} = normalizeHeelPair(sourceBytes);
  const {body, attach} = skinnedWearable(bodyBytes, profile, editor);
  const shoes = Object.fromEntries(Object.entries(source).map(([side, last]) =>
    [side, fitLast(last, profile.sides[side])]));
  const motion = heelMotion(body, profile, shoes);
  const bind = modelResolver(body.gltf, motion.neutral);
  const skin = body.gltf.skins[0];
  const inverse = body.read(skin.inverseBindMatrices);
  const palette = skin.joints.map((node, index) => multiply(bind(node), inverse[index]));
  const fit = {};
  for (const [side, shoe] of Object.entries(shoes)) {
    const target = profile.sides[side];
    const unpose = matrix(palette[target.joints.Foot]).invert();
    const weights = packWeights([[target.joints.Foot, 1]]);
    const rigid = point => unpose.transformPoint(vector(point)).toArray();
    attach('C3 shoe ' + side, {...shoe, vertices: shoe.vertices.map(v =>
      ({...v, position: rigid(v.position), normal: unpose.transformVector(vector(v.normal)).normalize().toArray(),
        ...weights}))}, material);
    for (const garment of ['foot', 'sock']) {
      const node = body.gltf.nodes.find(n => n.name === 'C3 ' + garment + ' ' + side);
      const primitive = body.gltf.meshes[node.mesh].primitives[0];
      const surface = fitFoot(layers(body, primitive), shoe, target, palette);
      const material = editor.gltf.materials.push(body.gltf.materials[primitive.material]) - 1;
      attach('C3 opening ' + garment + ' ' + side, surface, material);
    }
    fit[side] = {triangles: shoe.faces.length, heelRise: shoe.heelRise, pitch: shoe.pitch,
      heelTip: rigid(shoe.heelTip), ball: rigid(shoe.ball), joint: target.joints.Foot,
      sourceAxis: source[side].sourceAxis};
  }
  exportHeelClips(editor, body, motion.clips);
  return {glb: editor.finish(), fit};
}

export async function bakeMiraHeels() {
  const model = readFileSync(new URL('mira.glb', folder));
  const profile = JSON.parse(readFileSync(new URL('mira.profile.json', folder)));
  const base = JSON.parse(readFileSync(new URL('manifest.json', folder))).wearers.mira;
  if (base.bodySha256 !== digest(model) || base.inverseBindSha256 !== profile.inverseBindSha256)
    throw new Error('C4C original Mira body or binding changed');
  const source = await readHeelSource(folder);
  const {glb, fit} = buildHeelWearable(model, profile, source);
  const file = 'mira-c4c-heels.glb';
  const manifest = {version: 1, stage: 'CAS-02.1-F2-C4C', resident: 'mira',
    bodySha256: base.bodySha256, inverseBindSha256: base.inverseBindSha256,
    file, sha256: digest(glb), source: {url: HEEL_SOURCE, pins: HEEL_PINS, license: 'CC0-1.0'},
    clips: HEEL_CLIPS, fit};
  writeFileSync(new URL(file, folder), glb);
  writeFileSync(new URL('c4c-manifest.json', folder), JSON.stringify(manifest, null, 2) + '\n');
  console.log('C4C Mira heels', manifest.sha256, JSON.stringify(fit));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await bakeMiraHeels();
