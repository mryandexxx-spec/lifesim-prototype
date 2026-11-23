import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {readSourceAsset} from './cas-source-asset-audit.mjs';
import {digest, editGlb, primitive} from './cas-c3-glb.mjs';
import {readBindRig} from './cas-c3-rig.mjs';

const ANKLE = {
  alex: {seamY: .132, skin: [.55, .269, .131, 1]},
  mira: {seamY: .15, skin: [.50, .252, .139, 1]}
};
const SIDES = ['left', 'right'];
const EPSILON = 1e-6;
const sub = (a, b) => a.map((x, i) => x - b[i]);
const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const unit = a => { const length = Math.hypot(...a); return length ? a.map(x => x / length) : [0, 1, 0]; };
const smooth = t => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
const pointKey = p => p.map(x => Math.round(x / EPSILON)).join(',');
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];

export function packWeights(influences) {
  const ordered = [...influences].filter(([, w]) => w > 1e-8)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4);
  const total = ordered.reduce((n, [, w]) => n + w, 0);
  while (ordered.length < 4) ordered.push([0, 0]);
  return {joints: ordered.map(([j]) => j), weights: ordered.map(([, w]) => w / total)};
}

export function interpolateVertex(a, b, t) {
  const influences = new Map();
  for (const [v, scale] of [[a, 1 - t], [b, t]]) {
    v.joints.forEach((j, i) => influences.set(j, (influences.get(j) ?? 0) + v.weights[i] * scale));
  }
  return {position: mix(a.position, b.position, t), uv: mix(a.uv, b.uv, t),
    normal: unit(mix(a.normal, b.normal, t)), ...packWeights(influences)};
}

function clipAnkles(vertices, faces, height) {
  const out = [], clippedFaces = [];
  const originals = new Map(), edges = new Map();
  const rings = {left: new Map(), right: new Map()};

  function existing(i) {
    if (!originals.has(i)) originals.set(i, out.push(vertices[i]) - 1);
    return originals.get(i);
  }

  function cut(a, b) {
    const key = a < b ? a + ':' + b : b + ':' + a;
    if (edges.has(key)) return edges.get(key);
    const t = (height - vertices[a].position[1]) / (vertices[b].position[1] - vertices[a].position[1]);
    const v = interpolateVertex(vertices[a], vertices[b], t);
    v.position[1] = height;
    const ring = rings[v.position[0] > 0 ? 'left' : 'right'];
    const position = pointKey(v.position);
    if (ring.has(position)) {
      const canonical = ring.get(position);
      // Keep the source UV island and use the same skin weights at the join.
      v.position = canonical.position;
      v.joints = canonical.joints;
      v.weights = canonical.weights;
    } else {
      ring.set(position, v);
    }
    const index = out.push(v) - 1;
    edges.set(key, index);
    return index;
  }

  for (const f of faces) {
    const polygon = [];
    for (let i = 0; i < 3; i++) {
      const a = f[i], b = f[(i + 1) % 3];
      const inA = vertices[a].position[1] >= height;
      const inB = vertices[b].position[1] >= height;
      if (inA) polygon.push(existing(a));
      if (inA !== inB) polygon.push(cut(a, b));
    }
    for (let j = 1; j + 1 < polygon.length; j++) {
      clippedFaces.push([polygon[0], polygon[j], polygon[j + 1]]);
    }
  }
  return {vertices: out, faces: clippedFaces,
    rings: Object.fromEntries(SIDES.map(side => [side, [...rings[side].values()]]))};
}

function section(vertices) {
  const ranges = [0, 2].map(axis => {
    const values = vertices.map(v => v.position[axis]);
    return [Math.min(...values), Math.max(...values)];
  });
  const center = ranges.map(([lo, hi]) => (lo + hi) / 2);
  const span = ranges.map(([lo, hi]) => hi - lo);
  return {center, span};
}

function orderedRing(vertices, indices, s) {
  return indices.map(i => {
    const [x, , z] = vertices[i].position;
    return {i, angle: Math.atan2((z - s.center[1]) / s.span[1], (x - s.center[0]) / s.span[0])};
  }).sort((a, b) => a.angle - b.angle);
}

function joinRings(lower, upper) {
  // Merge the two angular sequences, advancing one ring for every triangle.
  const faces = [];
  let i = 0, j = 0;
  while (i < lower.length || j < upper.length) {
    const a = lower[i % lower.length].i;
    const b = upper[j % upper.length].i;
    const nextLower = lower[(i + 1) % lower.length];
    const nextUpper = upper[(j + 1) % upper.length];
    if (j === upper.length || (i < lower.length &&
        nextLower.angle + (i + 1 === lower.length ? 2 * Math.PI : 0) <
        nextUpper.angle + (j + 1 === upper.length ? 2 * Math.PI : 0))) {
      faces.push([a, b, nextLower.i]);
      i++;
    } else {
      faces.push([a, b, nextUpper.i]);
      j++;
    }
  }
  return faces;
}

function fitFoot(template, cuff, soleShell, bones, height, sock) {
  if (cuff.length < 12 || soleShell.length < 100) throw new Error('C3 source ankle or sole cannot be sampled');
  const collar = section(cuff);
  const shoe = section(soleShell);
  const {heel, toe, ball} = template.landmarks;
  const donor = template.vertices.map(position => ({position}));
  const donorRim = [...new Set(template.ankleEdges.flat())];
  const donorAnkle = section(donorRim.map(i => donor[i]));
  const donorWidth = section(donor).span[0];
  // The shod source bounds constrain the initial profile. The reference supplies anatomy.
  const soleY = Math.min(...soleShell.map(v => v.position[1])) + .006;
  const footLength = shoe.span[1] - .014;
  const footWidth = Math.min(shoe.span[0] - .012, donorWidth * (footLength / (toe[2] - heel[2])));
  const xScale = footWidth / donorWidth;
  const heelZ = shoe.center[1] - footLength / 2;
  const toeZ = shoe.center[1] + footLength / 2;
  const ballZ = Math.min(heelZ + footLength * .82, Math.max(heelZ + footLength * .57, bones.anchors.ToeBase[2]));
  const footZ = z => z < ball[2]
    ? heelZ + (z - heel[2]) / (ball[2] - heel[2]) * (ballZ - heelZ)
    : ballZ + (z - ball[2]) / (toe[2] - ball[2]) * (toeZ - ballZ);
  const top = height - .014;
  const yScale = (top - soleY) / template.seamY;
  const output = donor.map(({position}) => {
    const [x, y, z] = position;
    const ankle = smooth((y / template.seamY - .55) / .45);
    const nail = smooth((z - ball[2] + .025) / .065) * (1 - ankle);
    const flat = [shoe.center[0] + x*xScale, soleY + y*yScale, footZ(z)];
    const topPoint = [collar.center[0] + (x-donorAnkle.center[0])*collar.span[0]/donorAnkle.span[0],
      flat[1], collar.center[1] + (z-donorAnkle.center[1])*collar.span[1]/donorAnkle.span[1]];
    const surface = mix(flat, topPoint, ankle);
    const calf = .65 * ankle;
    const {joints} = bones;
    return {position: surface, uv: [Math.atan2(surface[2]-collar.center[1], surface[0]-collar.center[0])/(2*Math.PI)+.5, surface[1]*12],
      ...packWeights([[joints.Leg, calf], [joints.Foot, (1-calf)*(1-nail)], [joints.ToeBase, (1-calf)*nail]])};
  });
  const faces = template.triangles.map(tri => [...tri]);
  const first = output.length;
  output.push(...cuff.map(v => ({...v})));
  const lowerSection = section(donorRim.map(i => output[i]));
  faces.push(...joinRings(orderedRing(output, donorRim, lowerSection),
    orderedRing(output, cuff.map((_, i) => first + i), collar)));
  const normals = output.map(() => [0, 0, 0]);
  for (const [a, b, c] of faces) {
    const n = cross(sub(output[b].position, output[a].position), sub(output[c].position, output[a].position));
    for (const index of [a, b, c]) n.forEach((x, axis) => {normals[index][axis] += x;});
  }
  for (let i = 0; i < output.length; i++) {
    // At the shared rim keep authored normals and skinning on both sides.
    const v = output[i];
    if (i < first) v.normal = unit(normals[i]);
    if (sock && i < first) {
      const thickness = .0014 * smooth((height - v.position[1]) / .02);
      v.position = v.position.map((p, axis) => p + thickness * v.normal[axis]);
    }
  }
  return {vertices: output, faces, profile: {
    seam: {y: height, center: collar.center, vertices: cuff.length},
    heel: [shoe.center[0], soleY, heelZ],
    ball: [shoe.center[0], soleY, ballZ],
    toe: [shoe.center[0], soleY, toeZ],
    ankle: [collar.center[0], top, collar.center[1]], footWidth,
    soleY, sourceSoleY: soleY - .006, footLength
  }};
}

export function buildBody(bytes, resident, template) {
  if (template.version !== 1 || template.axes !== 'gltf' || !ANKLE[resident])
    throw new Error('C3 incompatible foot template');
  const editor = editGlb(bytes);
  const rig = readBindRig(editor, resident);
  const {gltf} = editor;
  const node = gltf.nodes.findIndex(n => n.skin === 0);
  const original = gltf.nodes[node];
  const source = gltf.meshes[original.mesh].primitives[0];
  const attr = Object.fromEntries(Object.entries(source.attributes)
    .map(([semantic, id]) => [semantic, editor.read(id)]));
  const vertices = attr.POSITION.map((position, i) => ({position, normal: attr.NORMAL[i],
    uv: attr.TEXCOORD_0[i], joints: attr.JOINTS_0[i], weights: attr.WEIGHTS_0[i]}));
  const indices = editor.read(source.indices).flat();
  const faces = Array.from({length: indices.length / 3}, (_, i) => indices.slice(i*3, i*3+3));

  const {seamY, skin} = ANKLE[resident];
  const trimmed = clipAnkles(vertices, faces, seamY);
  const parent = gltf.nodes.find(n => n.children?.includes(node));
  const siblings = parent?.children ?? gltf.scenes[gltf.scene ?? 0].nodes;
  function attach(name, data, material) {
    const mesh = gltf.meshes.push({name, primitives: [primitive(editor, data.vertices, data.faces, material)]}) - 1;
    siblings.push(gltf.nodes.push({...original, name, mesh}) - 1);
  }
  const mat = (name, color, roughness) => gltf.materials.push({name, pbrMetallicRoughness: {
    baseColorFactor: color, roughnessFactor: roughness, metallicFactor: 0}}) - 1;
  const skinMat = mat('Foot skin', skin, .86);
  const sockMat = mat('Cotton sock', [.22, .215, .195, 1], .99);
  attach('C3 body', trimmed, source.material);
  const sockets = {};
  for (const side of SIDES) {
    const soleShell = vertices.filter(v => v.position[1] < .05 && (v.position[0] > 0) === (side === 'left'));
    const cuff = trimmed.rings[side];
    const neutral = fitFoot(template.sides[side], cuff, soleShell, rig.sides[side], seamY, false);
    const sock = fitFoot(template.sides[side], cuff, soleShell, rig.sides[side], seamY, true);
    attach('C3 foot ' + side, neutral, skinMat);
    attach('C3 sock ' + side, sock, sockMat);
    sockets[side] = {...rig.sides[side], ...neutral.profile};
  }
  const profile = {...rig, templateSha256: digest(Buffer.from(JSON.stringify(template))),
    originalRender: original.name, sides: sockets};
  return {glb: editor.finish(), profile};
}

export function bakeBodies() {
  const folder = new URL('../assets/characters/cas-c3/', import.meta.url);
  const template = JSON.parse(gunzipSync(readFileSync(new URL('foot-template.json.gz', folder))));
  for (const resident of ['alex', 'mira']) {
    const {glb, profile} = buildBody(readSourceAsset(resident), resident, template);
    writeFileSync(new URL(resident + '.glb', folder), glb);
    writeFileSync(new URL(resident + '.profile.json', folder), JSON.stringify(profile, null, 2) + '\n');
    console.log('CAS C3 bind body', resident, profile.maxBindError, profile.sides.left.seam.vertices, digest(glb));
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) bakeBodies();
