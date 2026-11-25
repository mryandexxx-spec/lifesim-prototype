import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {digest, editGlb} from './cas-c3-glb.mjs';
import {intoFootFrame} from './cas-c3-foot-frame.mjs';

export const HEEL_SOURCE = 'https://grab3d.com/dl/high-heels/';
export const HEEL_PINS = Object.freeze({
  'high-heels.glb': '551171703d2f88455fdb58b28cbc3b799f47614ecbc76d63543e3b9b77fe8717',
  'LICENSE.txt': '01908a56d6cada52704b20c5094c2aa16c9d8be6f124349c986764067abfd921',
  'manifest.json': 'e8819e4be35ebcfb645f2c4d37f80d32aaae1024d6ff85ef0e36ceebc7dac88d'
});

export const heelSourceFile = name => 'c4c-heel-source-' + name;

// The previous verified Pages release publishes the original CC0 files,
// not only the fitted wearable. Treat it as a mirror, never as a trust root.
export const HEEL_MIRROR = 'https://mryandexxx-spec.github.io/lifesim-prototype/assets/characters/cas-c3/';

export async function fetchPinnedHeelFile(name, hash, request = fetch) {
  const urls = [HEEL_MIRROR + heelSourceFile(name), HEEL_SOURCE + name];
  const failures = [];
  for (const url of urls) {
    try {
      const response = await request(url, {
        redirect: 'error', signal: AbortSignal.timeout(30000)
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = Buffer.from(await response.arrayBuffer());
      if (digest(data) !== hash) throw new Error('SHA-256 mismatch');
      return data;
    } catch (error) {
      failures.push(url + ': ' + error.message);
    }
  }
  throw new Error('C4C no exact pinned source for ' + name + ': ' + failures.join('; '));
}

export async function readHeelSource(folder) {
  const records = await Promise.all(Object.entries(HEEL_PINS).map(async ([name, hash]) => {
    const path = new URL(heelSourceFile(name), folder);
    const data = existsSync(path) ? readFileSync(path) : await fetchPinnedHeelFile(name, hash);
    if (digest(data) !== hash) throw new Error('C4C publisher checksum changed for ' + name);
    writeFileSync(path, data);
    return data;
  }));
  const [model, license, manifest] = records;
  const provenance = JSON.parse(manifest);
  if (!license.toString().startsWith('CC0 1.0 Universal') || provenance.extras.license !== 'CC0-1.0' ||
      provenance.files.glb.name !== 'high-heels.glb' || provenance.files.glb.bytes !== model.length)
    throw new Error('C4C publisher license or model declaration does not match');
  return model;
}

const mean = points => [0, 1, 2].map(i => points.reduce((total, p) => total + p[i], 0) / points.length);
const range = values => [Math.min(...values), Math.max(...values)];
const positions = (vertices, faces) => [...new Set(faces.flat())].map(i => vertices[i].position);

function components(vertices, faces) {
  const parents = vertices.map((_, i) => i);
  const welds = new Map();
  function root(i) {
    while (parents[i] !== i) {
      parents[i] = parents[parents[i]];
      i = parents[i];
    }
    return i;
  }
  function connect(a, b) {parents[root(a)] = root(b);}
  for (const [i, {position}] of vertices.entries()) {
    const key = position.map(n => Math.round(n * 1e6)).join(',');
    if (welds.has(key)) connect(i, welds.get(key));
    else welds.set(key, i);
  }
  for (const [a, b, c] of faces) {
    connect(a, b);
    connect(a, c);
  }
  const byRoot = new Map();
  for (const face of faces) {
    const rootVertex = root(face[0]);
    if (!byRoot.has(rootVertex)) byRoot.set(rootVertex, []);
    byRoot.get(rootVertex).push(face);
  }
  return [...byRoot.values()].sort((a, b) => b.length - a.length);
}

function normalizeShoe(original, faces, side) {
  const parts = components(original, faces);
  const [shell, sole, heel] = parts;
  if (shell?.length !== 3490 || sole?.length !== 1230 || heel?.length !== 936)
    throw new Error('C4C source upper, outsole or heel topology changed: ' + side);
  const back = positions(original, heel).filter(p => p[1] < .001);
  const front = positions(original, sole).filter(p => p[1] < .002);
  if (!back.length || !front.length) throw new Error('C4C missing authored heel or forefoot support');
  const origin = mean(back);
  const ball = mean(front);
  const length = Math.hypot(ball[0] - origin[0], ball[2] - origin[2]);
  const axis = {sin: (ball[0] - origin[0]) / length, cos: (ball[2] - origin[2]) / length};
  const point = p => intoFootFrame(p.map((x, i) => x - origin[i]), axis);
  const ids = [...new Set(faces.flat())];
  const indices = new Map(ids.map((i, at) => [i, at]));
  const remap = face => face.map(i => indices.get(i));
  const vertices = ids.map(i => ({...original[i], position: point(original[i].position),
    normal: intoFootFrame(original[i].normal, axis)}));
  const bounds = [0, 1, 2].map(axis => range(vertices.map(v => v.position[axis])));
  return {vertices, faces: faces.map(remap), sole: sole.map(remap),
    heelTip: point(origin), ball: point(ball), bounds, sourceAxis: axis};
}

export function normalizeHeelPair(bytes) {
  if (digest(bytes) !== HEEL_PINS['high-heels.glb']) throw new Error('C4C unknown heel source bytes');
  const editor = editGlb(bytes);
  const {gltf} = editor;
  const [mesh] = gltf.meshes;
  const [primitive] = mesh.primitives;
  if (gltf.meshes.length !== 1 || mesh.primitives.length !== 1 || gltf.skins?.length || gltf.animations?.length)
    throw new Error('C4C expected one static authored pair');
  const p = editor.read(primitive.attributes.POSITION);
  const normals = editor.read(primitive.attributes.NORMAL);
  const uv = editor.read(primitive.attributes.TEXCOORD_0);
  const vertices = p.map((position, i) => ({position, normal: normals[i], uv: uv[i]}));
  const ids = editor.read(primitive.indices).flat();
  if (ids.length !== 13432 * 3) throw new Error('C4C heel pair triangle count changed');
  // The pinned display composition separates the two shoes on source X.
  // The first has its almond toe towards its medial (negative-X) side.
  const sorted = [...new Set(p.map(v => v[0]))].sort((a, b) => a - b);
  const gap = sorted.slice(1).reduce((best, x, i) =>
    x - sorted[i] > best.span ? {span: x - sorted[i], center: (x + sorted[i]) / 2} : best, {span: 0});
  if (gap.span < .02) throw new Error('C4C cannot separate source shoes');
  const halves = {left: [], right: []};
  for (let i = 0; i < ids.length; i += 3) {
    const face = ids.slice(i, i + 3);
    const [a, b, c] = face.map(index => p[index][0] < gap.center);
    if (a !== b || b !== c) throw new Error('C4C triangle crosses the source shoe separation');
    halves[a ? 'left' : 'right'].push(face);
  }
  const sides = Object.fromEntries(Object.entries(halves).map(([side, faces]) => {
    if (faces.length !== 6716) throw new Error('C4C source shoe is incomplete: ' + side);
    return [side, normalizeShoe(vertices, faces, side)];
  }));
  return {editor, material: primitive.material, sides};
}
