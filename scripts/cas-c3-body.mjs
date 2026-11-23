import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import jpeg from 'jpeg-js';
import {readSourceAsset} from './cas-source-asset-audit.mjs';
import {digest, editGlb, primitive} from './cas-c3-glb.mjs';
import {readBindRig} from './cas-c3-rig.mjs';
import {plantarFrame, intoFootFrame, fromFootFrame} from './cas-c3-foot-frame.mjs';

const ANKLE_SEAMS = {alex: .132, mira: .15};
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
    normal: unit(mix(a.normal, b.normal, t)),
    ...(a.color && b.color && {color: mix(a.color, b.color, t)}), ...packWeights(influences)};
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

function skinSampler(editor, primitive) {
  const original = editor.gltf.materials[primitive.material].pbrMetallicRoughness;
  const texture = editor.gltf.textures[original.baseColorTexture.index];
  const image = editor.gltf.images[texture.source];
  const view = editor.gltf.bufferViews[image.bufferView];
  const offset = view.byteOffset ?? 0;
  if (image.mimeType !== 'image/jpeg') throw new Error('Unexpected resident skin atlas');
  const {width, height, data} = jpeg.decode(editor.source.bin.subarray(offset, offset + view.byteLength),
    {useTArray: true, maxResolutionInMP: 16, maxMemoryUsageInMB: 128});
  const factor = original.baseColorFactor ?? [1, 1, 1, 1];
  const linear = raw => raw <= .04045 ? raw / 12.92 : ((raw + .055) / 1.055) ** 2.4;
  const pixel = (x, y, c) => data[(Math.min(height - 1, Math.max(0, y)) * width +
    Math.min(width - 1, Math.max(0, x))) * 4 + c];
  return ([u, v]) => {
    const px = u * width - .5, py = v * height - .5;
    const x = Math.floor(px), y = Math.floor(py);
    return [0, 1, 2].map(c => {
      const top = pixel(x, y, c) + (pixel(x+1, y, c) - pixel(x, y, c)) * (px-x);
      const bottom = pixel(x, y+1, c) + (pixel(x+1, y+1, c) - pixel(x, y+1, c)) * (px-x);
      return linear((top + (bottom-top) * (py-y)) / 255) * factor[c];
    });
  };
}

function fitFoot(template, cuff, soleShell, bones, height, sampleSkin) {
  if (cuff.length < 12 || soleShell.length < 100) throw new Error('C3 source ankle or sole cannot be sampled');
  const axis = plantarFrame(soleShell.map(v => v.position));
  const local = vertices => vertices.map(v => ({...v, position: intoFootFrame(v.position, axis)}));
  const cuffLocal = local(cuff);
  const collar = section(cuffLocal);
  const rimAngles = cuffLocal.map(({position: [x, , z]}) =>
    Math.atan2((z - collar.center[1]) / collar.span[1], (x - collar.center[0]) / collar.span[0]));
  const shoe = section(local(soleShell));
  const {heel, toe, ball, ankle: donorPivot} = template.landmarks;
  const donor = template.vertices.map(position => ({position}));
  const donorRim = [...new Set(template.ankleEdges.flat())];
  const donorAnkle = section(donorRim.map(i => donor[i]));
  const donorWidth = section(donor).span[0];
  const soleY = Math.min(...soleShell.map(v => v.position[1])) + .006;
  const footLength = shoe.span[1] - .014;
  const lengthScale = footLength / (toe[2] - heel[2]);
  const footWidth = Math.min(shoe.span[0] - .012, donorWidth * lengthScale);
  const xScale = footWidth / donorWidth;
  const heelZ = shoe.center[1] - footLength / 2;
  const toeZ = shoe.center[1] + footLength / 2;
  const footZ = z => heelZ + (z - heel[2]) * lengthScale;
  const top = height - .014;
  // Preserve the donor's instep and toes. Only the shaft above the dorsal
  // contour stretches to join the existing leg.
  const instep = Math.max(...template.vertices.filter(p => p[2] > (donorPivot[2] + ball[2]) / 2).map(p => p[1]));
  const extension = top - soleY - template.seamY * lengthScale;
  const ankleColors = sampleSkin && cuff.map(v => sampleSkin(v.uv));
  const skinColor = ankleColors && [0, 1, 2].map(channel => {
    const samples = ankleColors.map(c => c[channel]).sort((a,b) => a-b);
    return samples[Math.floor(samples.length / 2)];
  });
  const {joints} = bones;
  const output = donor.map(({position}) => {
    const [x, y, z] = position;
    const ankle = smooth((y - instep) / (template.seamY - instep));
    const forefoot = smooth((z - ball[2] + .018) / .065);
    const flat = [shoe.center[0] + x*xScale, soleY + y*lengthScale + extension*ankle, footZ(z)];
    const topPoint = [collar.center[0] + (x-donorAnkle.center[0])*collar.span[0]/donorAnkle.span[0],
      flat[1], collar.center[1] + (z-donorAnkle.center[1])*collar.span[1]/donorAnkle.span[1]];
    const surface = mix(flat, topPoint, ankle);
    const dx = surface[0] - collar.center[0], dz = surface[2] - collar.center[1];
    const angle = Math.atan2(dz / collar.span[1], dx / collar.span[0]);
    let nearest = 0, largest = -Infinity;
    rimAngles.forEach((angleAtRim, i) => {
      const similarity = Math.cos(angle - angleAtRim);
      if (similarity > largest) {nearest = i; largest = similarity;}
    });
    const rim = cuff[nearest];
    const weights = new Map([[joints.Foot, (1-ankle)*(1-forefoot)], [joints.ToeBase, (1-ankle)*forefoot]]);
    rim.joints.forEach((j, i) => weights.set(j, (weights.get(j) ?? 0) + rim.weights[i]*ankle));
    return {position: fromFootFrame(surface, axis), uv: [angle/(2*Math.PI)+.5, surface[1]*12],
      ...(skinColor && {color: mix(skinColor, ankleColors[nearest], ankle)}), ...packWeights(weights)};
  });
  const faces = template.triangles.map(tri => [...tri]);
  const first = output.length;
  output.push(...cuff.map((v, i) => ({...v, ...(ankleColors && {color: ankleColors[i]})})));
  const collarModel = section(cuff);
  const lowerSection = section(donorRim.map(i => output[i]));
  faces.push(...joinRings(orderedRing(output, donorRim, lowerSection),
    orderedRing(output, cuff.map((_, i) => first + i), collarModel)));
  const normals = output.map(() => [0, 0, 0]);
  for (const [a, b, c] of faces) {
    const n = cross(sub(output[b].position, output[a].position), sub(output[c].position, output[a].position));
    for (const index of [a, b, c]) n.forEach((x, axis) => {normals[index][axis] += x;});
  }
  for (let i = 0; i < output.length; i++) {
    // At the shared rim keep authored normals and skinning on both sides.
    const v = output[i];
    if (i < first) v.normal = unit(normals[i]);
    if (!sampleSkin && i < first) {
      const thickness = .0014 * smooth((height - v.position[1]) / .02);
      v.position = v.position.map((p, axis) => p + thickness * v.normal[axis]);
    }
  }
  return {vertices: output, faces, profile: {
    seam: {y: height, center: collarModel.center, vertices: cuff.length},
    axis,
    heel: fromFootFrame([shoe.center[0], soleY, heelZ], axis),
    ball: fromFootFrame([shoe.center[0], soleY, footZ(ball[2])], axis),
    toe: fromFootFrame([shoe.center[0], soleY, toeZ], axis),
    ankle: fromFootFrame([collar.center[0], top, collar.center[1]], axis), footWidth,
    soleY, sourceSoleY: soleY - .006, footLength
  }};
}

export function buildBody(bytes, resident, template) {
  if (template.version !== 1 || template.axes !== 'gltf' || !ANKLE_SEAMS[resident])
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

  const seamY = ANKLE_SEAMS[resident];
  const sampleSkin = skinSampler(editor, source);
  const trimmed = clipAnkles(vertices, faces, seamY);
  const parent = gltf.nodes.find(n => n.children?.includes(node));
  const siblings = parent?.children ?? gltf.scenes[gltf.scene ?? 0].nodes;
  function attachPrimitive(name, part) {
    const mesh = gltf.meshes.push({name, primitives: [part]}) - 1;
    siblings.push(gltf.nodes.push({...original, name, mesh}) - 1);
  }
  function attach(name, data, material) {
    attachPrimitive(name, primitive(editor, data.vertices, data.faces, material));
  }
  const mat = (name, color, roughness) => gltf.materials.push({name, pbrMetallicRoughness: {
    baseColorFactor: color, roughnessFactor: roughness, metallicFactor: 0}}) - 1;
  const skinMat = mat('Foot skin', [1, 1, 1, 1], 1);
  const sockMat = mat('Cotton sock', [.22, .215, .195, 1], .99);
  const bodyPrimitive = primitive(editor, trimmed.vertices, trimmed.faces, source.material);
  attachPrimitive('C3 body', bodyPrimitive);
  const sockets = {};
  for (const side of SIDES) {
    const soleShell = vertices.filter(v => v.position[1] < .05 && (v.position[0] > 0) === (side === 'left'));
    const cuff = trimmed.rings[side];
    const neutral = fitFoot(template.sides[side], cuff, soleShell, rig.sides[side], seamY, sampleSkin);
    const sock = fitFoot(template.sides[side], cuff, soleShell, rig.sides[side], seamY, null);
    attach('C3 foot ' + side, neutral, skinMat);
    attach('C3 sock ' + side, sock, sockMat);
    sockets[side] = {...rig.sides[side], ...neutral.profile};
  }
  const tucked = trimmed.vertices.map(v => {
    const [x, y, z] = v.position;
    if (y > seamY + .08) return v;
    const side = x > 0 ? 'left' : 'right';
    const [cx, cz] = sockets[side].seam.center;
    const dx = x - cx, dz = z - cz;
    const radial = Math.hypot(dx / .028, dz / .041);
    const taper = 1 - smooth((y - seamY - .024) / .056);
    const scale = 1 - (1 - Math.min(1, .95 / Math.max(radial, 1e-5))) * taper;
    return {...v, position: [cx + dx*scale, y, cz + dz*scale]};
  });
  attachPrimitive('C3 body boot', {...bodyPrimitive, attributes: {...bodyPrimitive.attributes,
    POSITION: editor.append(tucked.map(v => v.position), 'VEC3', 5126, 34962, true)}});
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
