import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {ASSET_SHA256} from './cas-02-1-f0-download-assets.mjs';
import {digest, editGlb, primitive} from './cas-c3-glb.mjs';
import {supportReport} from './cas-c3-contact.mjs';
import {plantarFrame, intoFootFrame, fromFootFrame} from './cas-c3-foot-frame.mjs';
import {bakeBodies, interpolateVertex, packWeights} from './cas-c3-body.mjs';

export const C3_STYLES = ['dress', 'sneakers', 'boots'];
const SIDES = ['left', 'right'];
const folder = new URL('../assets/characters/cas-c3/', import.meta.url);
const settings = JSON.parse(readFileSync(new URL('source-collars.json', folder))).styles;
const pointKey = p => p.map(x => Math.round(x * 1e5)).join(',');
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const add = (a, b) => a.map((v, i) => v + b[i]);
const smooth = t => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };

export function layers(editor, p) {
  const attr = Object.fromEntries(Object.entries(p.attributes).map(([key, index]) => [key, editor.read(index)]));
  const indices = editor.read(p.indices).flat();
  return {
    vertices: attr.POSITION.map((position, i) => ({position, uv: attr.TEXCOORD_0[i],
      normal: attr.NORMAL[i], joints: attr.JOINTS_0?.[i], weights: attr.WEIGHTS_0?.[i],
      ...(attr.COLOR_0 && {color: attr.COLOR_0[i]})})),
    faces: Array.from({length: indices.length / 3}, (_, i) => indices.slice(i*3, i*3+3))
  };
}

function selectSide(source, part) {
  const faces = source.faces.slice(...part.sourceTriangleRange);
  const used = [...new Set(faces.flat())];
  const indexMap = new Map(used.map((id, i) => [id, i]));
  const [a, b, c] = part.rotation;
  const determinant = a[0]*(b[1]*c[2]-b[2]*c[1]) - a[1]*(b[0]*c[2]-b[2]*c[0]) + a[2]*(b[0]*c[1]-b[1]*c[0]);
  if (Math.abs(determinant - 1) > 1e-5 || Math.abs(dot(a, b)) > 1e-5 ||
      Math.abs(dot(a, c)) > 1e-5 || Math.abs(dot(b, c)) > 1e-5 ||
      [a,b,c].some(row => Math.abs(dot(row, row)-1) > 1e-5))
    throw new Error('C3 source orientation must be a proper rotation');
  const [cx, cz] = part.collarCenterXZ;
  const converted = used.map(i => {
    const {position, ...v} = source.vertices[i];
    const p = part.rotation.map((row, axis) => dot(row, position) + part.translation[axis]);
    return {...v, normal: part.rotation.map(row => dot(row, v.normal)),
      position: [p[0] - cx, p[1], p[2] - cz]};
  });
  const ground = Math.min(...converted.map(v => v.position[1]));
  const axis = plantarFrame(converted.map(v => v.position));
  for (const v of converted) {
    v.position = intoFootFrame(v.position, axis);
    v.position[1] -= ground;
    v.normal = intoFootFrame(v.normal, axis);
  }
  return {
    vertices: converted, faces: faces.map(f => f.map(i => indexMap.get(i))),
    originalKeys: new Set(used.map(i => pointKey(source.vertices[i].position))),
    collar: part.collarRoofY.map(y => y - ground), openingRadiiXZ: part.openingRadiiXZ
  };
}

export function normalizeShoePair(bytes, style) {
  const entry = settings[style];
  const seam = editGlb(bytes);
  if (!entry || seam.source.sourceSha256 !== entry.sourceSha256 || (ASSET_SHA256[style] && entry.sourceSha256 !== ASSET_SHA256[style]))
    throw new Error('Unrecognized C3 shoe source');
  const base = seam.gltf.meshes[0].primitives[0];
  if (seam.gltf.skins?.length || seam.gltf.meshes.length !== 1 || seam.gltf.meshes[0].primitives.length !== 1)
    throw new Error('Expected one static source primitive');
  const source = layers(seam, base);
  const left = selectSide(source, entry.parts.left);
  const right = selectSide(source, entry.parts.right);
  if (left.faces.length + right.faces.length !== source.faces.length ||
      entry.parts.left.sourceTriangleRange[1] !== entry.parts.right.sourceTriangleRange[0] ||
      [...left.originalKeys].some(key => right.originalKeys.has(key)))
    throw new Error('C3 source division cuts a connected surface');
  return {editor: seam, material: base.material, flex: entry.flex, shell: entry.shell,
    sides: {left, right}};
}

function fitShoe(source, target, localJoint, style) {
  const z = source.vertices.map(v => v.position[2]);
  const heel = Math.min(...z);
  const toe = Math.max(...z);
  const [ax, , az] = target.ankle;
  const ground = target.sourceSoleY;
  const origin = [ax, 0, az];
  const modelPoint = point => add(fromFootFrame(point, target.axis), origin);
  const footPoint = point => intoFootFrame(sub(point, origin), target.axis);
  const heelZ = footPoint(target.heel)[2];
  const toeZ = footPoint(target.toe)[2];
  const ballZ = footPoint(target.ball)[2];
  // Clearance for lining, heel counter and toe box. The same rule applies
  // to each style, with the authored collar fixed under the reconstructed ankle.
  const scale = Math.max((target.footLength + .018) / (toe - heel),
    (heelZ - .006) / heel, (toeZ + .009) / toe);
  if (scale < .55 || scale > 1.3) throw new Error('C3 source does not fit ankle/length envelope: ' +
    JSON.stringify({scale, sourceLength: toe-heel, targetLength: target.footLength,
      sourceHeel: heel, sourceToe: toe, targetHeel: heelZ, targetToe: toeZ}));
  const collar = source.collar.map(y => ground + y * scale);
  const widthScale = style.fitOpenUpper ? (target.footWidth + .012) / source.measuredSource.width : scale;
  const centerX = style.fitOpenUpper ? footPoint(target.ball)[0] : 0;
  const {Leg, Foot, ToeBase} = localJoint;
  function influences([, y, z]) {
    const bend = smooth((z - ballZ + .025) / .075) * style.flex;
    const calf = (style.shell === 'high' ? .68 : 0) * smooth((y - target.ankle[1] * .68) / .07);
    return [[Leg, calf], [Foot, (1-calf)*(1-bend)], [ToeBase, (1-calf)*bend]];
  }
  const vertices = source.vertices.map(v => {
    const [x, y, z] = v.position;
    const local = [centerX + x * widthScale, ground + y * scale, z * scale];
    const [nx, ny, nz] = v.normal;
    const normal = style.fitOpenUpper ? [nx * scale / widthScale, ny, nz] : v.normal;
    const length = style.fitOpenUpper ? Math.hypot(...normal) : 1;
    return {...v, position: modelPoint(local), normal: fromFootFrame(normal.map(n => n / length), target.axis),
      ...packWeights(influences(local))};
  });
  return {vertices, faces: source.faces, scale, collar, axis: target.axis,
    footPoint, modelPoint, influences, seamY: target.seam.y,
    openingRadiiXZ: source.openingRadiiXZ.map(n => n * scale),
    sole: modelPoint([0, ground, heel*scale]), toe: modelPoint([0, ground, toe*scale])};
}

function clipForOpening(layer, fit) {
  const [back, middle, front] = fit.collar;
  const [rx, rz] = fit.openingRadiiXZ;
  function visible(position) {
    const [, y, z] = fit.footPoint(position);
    const end = z < 0 ? back : front;
    const cut = middle + (end-middle)*Math.min(1, Math.abs(z)/rz);
    return y - cut + .006;
  }
  const {vertices, faces} = layer;
  const out = [], kept = [];
  const retained = new Map(), intersections = new Map();
  const offsets = vertices.map(v => visible(v.position));
  function retain(i) {
    if (!retained.has(i)) retained.set(i, out.push({...vertices[i]}) - 1);
    return retained.get(i);
  }
  function cut(i, j) {
    const key = i < j ? i + ':' + j : j + ':' + i;
    if (!intersections.has(key)) intersections.set(key,
      out.push(interpolateVertex(vertices[i], vertices[j], offsets[i] / (offsets[i]-offsets[j]))) - 1);
    return intersections.get(key);
  }
  for (const face of faces) {
    const polygon = [];
    for (let n = 0; n < 3; n++) {
      const i = face[n], j = face[(n+1)%3];
      if (offsets[i] >= 0) polygon.push(retain(i));
      if ((offsets[i] >= 0) !== (offsets[j] >= 0)) polygon.push(cut(i,j));
    }
    for (let i=1; i+1<polygon.length; i++) kept.push([polygon[0],polygon[i],polygon[i+1]]);
  }
  const rimTop = Math.max(back, middle, front);
  const startBlend = Math.min(rimTop, fit.seamY - .017);
  for (const v of out) {
    const [x, y, z] = fit.footPoint(v.position);
    const radial = Math.hypot(x / rx, z / rz);
    const inside = Math.min(1, .90 / Math.max(radial, 1e-5));
    // At the rim the skin follows the lining's deformation. Its original
    // cuff positions and weights are recovered continuously above the rim.
    const lining = 1 - smooth((y - startBlend) / (fit.seamY - startBlend));
    const scale = 1 - (1 - inside) * lining;
    const local = [x * scale, y, z * scale];
    v.position = fit.modelPoint(local);
    const mixed = new Map(fit.influences(local).map(([j, w]) => [j, w * lining]));
    v.joints.forEach((j, i) => mixed.set(j, (mixed.get(j) ?? 0) + v.weights[i]*(1-lining)));
    Object.assign(v, packWeights(mixed));
  }
  return {vertices: out, faces: kept};
}

export function buildWearable(bodyBytes, profile, shoeBytes, style) {
  return buildWearableFromGeometry(bodyBytes, profile, normalizeShoePair(shoeBytes, style));
}

// C3 and C4 share the shoe skinning, bind rig and contact policy.
// Open uppers may fit the foot and sock to their authored opening.
export function buildWearableFromGeometry(bodyBytes, profile, geometry) {
  const {editor} = geometry;
  const {body, attach} = skinnedWearable(bodyBytes, profile, editor);
  const {gltf} = editor;
  const stats = {};
  for (const side of SIDES) {
    const target = profile.sides[side];
    const fit = fitShoe(geometry.sides[side], target, target.joints, geometry);
    const fitLayer = geometry.fitOpenUpper?.(fit) ?? (layer => clipForOpening(layer, fit));
    attach('C3 shoe ' + side, fit, geometry.material);
    for (const garment of ['foot', 'sock']) {
      const name = 'C3 ' + garment + ' ' + side;
      const bodyNode = body.gltf.nodes.find(n => n.name === name);
      const bodyPrimitive = body.gltf.meshes[bodyNode.mesh].primitives[0];
      const layer = fitLayer(layers(body, bodyPrimitive));
      if (!layer.faces.length) continue;
      const material = gltf.materials.push(body.gltf.materials[bodyPrimitive.material]) - 1;
      attach('C3 opening ' + garment + ' ' + side, layer, material);
    }
    stats[side] = {scale: fit.scale, triangles: fit.faces.length, sole: fit.sole, toe: fit.toe,
      openingHeight: fit.collar, axis: fit.axis};
  }
  const glb = editor.finish();
  return {glb, stats, inverseBindSha256: profile.inverseBindSha256};
}

export function skinnedWearable(bodyBytes, profile, editor) {
  const body = editGlb(bodyBytes);
  const {gltf} = editor;
  const skin = body.gltf.skins[0];
  const inverse = body.read(skin.inverseBindMatrices);
  const count = body.gltf.nodes.findIndex(node => node.name === 'C3 body');
  const originalRender = body.gltf.nodes.findIndex(node => node.name === profile.originalRender);
  const inverseBindMatrices = editor.append(inverse, 'MAT4', 5126);
  gltf.nodes = body.gltf.nodes.slice(0, count).map(({mesh, skin, children, ...node}) =>
    children ? {...node, children: children.filter(i => i < count)} : node);
  gltf.meshes = [];
  gltf.skins = [{...skin, inverseBindMatrices}];
  gltf.scenes = structuredClone(body.gltf.scenes);
  gltf.scene = body.gltf.scene ?? 0;
  const siblings = gltf.nodes.find(n => n.children?.includes(originalRender))?.children ??
    gltf.scenes[gltf.scene].nodes;
  function attach(name, data, material) {
    if (!data.faces.length) return;
    const mesh = gltf.meshes.push({name, primitives: [primitive(editor, data.vertices, data.faces, material)]}) - 1;
    siblings.push(gltf.nodes.push({name, mesh, skin: 0}) - 1);
  }
  return {body, attach};
}

export function bakeFootwear() {
  bakeBodies();
  const manifest = {version: 1, stage: 'CAS-02.1-F2-C3', wearers: {}};
  for (const resident of ['alex', 'mira']) {
    const body = readFileSync(new URL(resident + '.glb', folder));
    const profile = JSON.parse(readFileSync(new URL(resident + '.profile.json', folder)));
    const wearer = {body: resident + '.glb', bodySha256: digest(body),
      inverseBindSha256: profile.inverseBindSha256, originalRender: profile.originalRender, styles: {}};
    const outfits = {};
    for (const style of C3_STYLES) {
      const bytes = readFileSync(new URL('../cas-cc0-f0/' + style + '.glb', folder));
      const {glb, stats} = buildWearable(body, profile, bytes, style);
      const file = resident + '-' + style + '.glb';
      writeFileSync(new URL(file, folder), glb);
      wearer.styles[style] = {file, sha256: digest(glb), sides: stats};
      outfits[style] = glb;
    }
    wearer.contact = supportReport(body, profile.originalRender, outfits);
    manifest.wearers[resident] = wearer;
  }
  writeFileSync(new URL('manifest.json', folder), JSON.stringify(manifest, null, 2) + '\n');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) bakeFootwear();
