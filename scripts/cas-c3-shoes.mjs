import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {ASSET_SHA256} from './cas-02-1-f0-download-assets.mjs';
import {digest, editGlb, primitive} from './cas-c3-glb.mjs';
import {supportReport} from './cas-c3-contact.mjs';
import {bakeBodies, interpolateVertex, packWeights} from './cas-c3-body.mjs';

export const C3_STYLES = ['dress', 'sneakers', 'boots'];
const SIDES = ['left', 'right'];
const folder = new URL('../assets/characters/cas-c3/', import.meta.url);
const settings = JSON.parse(readFileSync(new URL('source-collars.json', folder))).styles;
const pointKey = p => p.map(x => Math.round(x * 1e5)).join(',');
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const smooth = t => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };

function layers(editor, p) {
  const attr = Object.fromEntries(Object.entries(p.attributes).map(([key, index]) => [key, editor.read(index)]));
  const indices = editor.read(p.indices).flat();
  return {
    vertices: attr.POSITION.map((position, i) => ({position, uv: attr.TEXCOORD_0[i],
      normal: attr.NORMAL[i], joints: attr.JOINTS_0?.[i], weights: attr.WEIGHTS_0?.[i]})),
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
  for (const v of converted) v.position[1] -= ground;
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
  // Clearance for lining, heel counter and toe box. The same rule applies
  // to each style, with the authored collar fixed under the reconstructed ankle.
  const scale = Math.max((target.footLength + .018) / (toe - heel),
    (target.heel[2] - az - .006) / heel, (target.toe[2] - az + .009) / toe);
  if (scale < .55 || scale > 1.3) throw new Error('C3 source does not fit ankle/length envelope');
  const ground = target.sourceSoleY;
  const [back, mid, front] = source.collar.map(y => ground + y * scale);
  const {Leg, Foot, ToeBase} = localJoint;
  const vertices = source.vertices.map(v => {
    const [x, y, z] = v.position;
    const position = [ax + x * scale, ground + y * scale, az + z * scale];
    const bend = smooth((position[2] - target.ball[2] + .025) / .075) * style.flex;
    const calf = (style.shell === 'high' ? .68 : 0) * smooth((position[1] - target.ankle[1] * .68) / .07);
    return {...v, position, ...packWeights([[Leg, calf], [Foot, (1-calf)*(1-bend)], [ToeBase, (1-calf)*bend]])};
  });
  return {vertices, faces: source.faces, scale, collar: [back, mid, front], origin: [ax, ground, az],
    openingRadiiXZ: source.openingRadiiXZ.map(n => n * scale),
    sole: [ax, ground, az + heel*scale], toe: [ax, ground, az + toe*scale]};
}

function clipForOpening(layer, fit) {
  const [back, middle, front] = fit.collar;
  const [ax, , az] = fit.origin;
  const [rx, rz] = fit.openingRadiiXZ;
  function visible([, y, z]) {
    const cut = z < az
      ? middle + (back-middle)*Math.min(1, (az-z)/.037)
      : middle + (front-middle)*Math.min(1, (z-az)/.043);
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
  for (const v of out) {
    const [x, y, z] = v.position;
    const dx = x - ax;
    const dz = z - az;
    const radial = Math.hypot(dx / rx, dz / rz);
    const inside = Math.min(1, .93 / Math.max(radial, 1e-5));
    // Conform only the hidden overlap and opening. The ankle seam above
    // this zone retains precisely the authored positions and skinning.
    const taper = 1 - smooth((y - rimTop) / .029);
    const scale = 1 - (1 - inside) * taper;
    v.position = [ax + dx * scale, y, az + dz * scale];
  }
  return {vertices: out, faces: kept};
}

export function buildWearable(bodyBytes, profile, shoeBytes, style) {
  const body = editGlb(bodyBytes);
  const geometry = normalizeShoePair(shoeBytes, style);
  const {editor} = geometry;
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
  const stats = {};
  function attach(name, data, material) {
    if (!data.faces.length) return;
    const mesh = gltf.meshes.push({name, primitives: [primitive(editor, data.vertices, data.faces, material)]}) - 1;
    siblings.push(gltf.nodes.push({name, mesh, skin: 0}) - 1);
  }
  for (const side of SIDES) {
    const target = profile.sides[side];
    const fit = fitShoe(geometry.sides[side], target, target.joints, geometry);
    attach('C3 shoe ' + side, fit, geometry.material);
    for (const garment of ['foot', 'sock']) {
      const name = 'C3 ' + garment + ' ' + side;
      const bodyNode = body.gltf.nodes.find(n => n.name === name);
      const bodyPrimitive = body.gltf.meshes[bodyNode.mesh].primitives[0];
      const layer = clipForOpening(layers(body, bodyPrimitive), fit);
      if (!layer.faces.length) continue;
      const material = gltf.materials.push(body.gltf.materials[bodyPrimitive.material]) - 1;
      attach('C3 opening ' + garment + ' ' + side, layer, material);
    }
    stats[side] = {scale: fit.scale, triangles: fit.faces.length, sole: fit.sole, toe: fit.toe,
      openingHeight: fit.collar};
  }
  const glb = editor.finish();
  return {glb, stats, inverseBindSha256: profile.inverseBindSha256};
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
