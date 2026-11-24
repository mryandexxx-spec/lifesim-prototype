import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accessor, auditHeadGLB, sha256, unpackGLB } from '../verify-derived-heads.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const pins = JSON.parse(readFileSync(new URL('../MPFB-DONOR-PIN.json', import.meta.url)));
const originals = { alex: 'meshy-casual-v1.glb', mira: 'meshy-mira-mobile-v1.glb' };
const xyz = (row) => row.map((value) => Math.round(value * 1e6)).join(',');
const edgeKey = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;

function inspectGeometry(glb, primitive) {
  const p = primitive.attributes;
  const positions = accessor(glb, p.POSITION);
  const indices = accessor(glb, primitive.indices).flat();
  const jointIDs = accessor(glb, p.JOINTS_0);
  const weights = accessor(glb, p.WEIGHTS_0);
  const welded = positions.map(xyz);
  const signatures = new Map();
  for (const [i, position] of welded.entries()) {
    signatures.set(position, jointIDs[i].flatMap((joint, slot) => weights[i][slot] > 1e-7 ? [[joint, weights[i][slot]]] : [])
      .sort(([a], [b]) => a - b));
  }
  const edges = new Map();
  for (let i = 0; i < indices.length; i += 3) {
    const corners = indices.slice(i, i + 3).map((index) => welded[index]);
    if (new Set(corners).size !== 3) continue;
    for (let j = 0; j < 3; j++) {
      const key = edgeKey(corners[j], corners[(j + 1) % 3]);
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  return { positions, indices, edges, signatures };
}

function normal([ax, ay, az], [bx, by, bz], [cx, cy, cz]) {
  return [(by-ay)*(cz-az)-(bz-az)*(cy-ay), (bz-az)*(cx-ax)-(bx-ax)*(cz-az), (bx-ax)*(cy-ay)-(by-ay)*(cx-ax)];
}

function morphQuality(glb, head, base, channels, seam) {
  const deltas = head.targets.map((target) => accessor(glb, target.POSITION));
  return Object.fromEntries([...channels, 'all'].map((name, targetIndex) => {
    const delta = targetIndex < channels.length ? deltas[targetIndex] : base.positions.map((_, vertex) => (
      [0, 1, 2].map((coordinate) => deltas.reduce((sum, rows) => sum + rows[vertex][coordinate], 0))
    ));
    const changed = base.positions.map((position, vertex) => position.map((value, axis) => value + delta[vertex][axis]));
    const ratios = [];
    let reversed = 0;
    let nearZero = 0;
    for (let i = 0; i < base.indices.length; i += 3) {
      const corners = base.indices.slice(i, i + 3);
      if (corners.every((index) => Math.hypot(...delta[index]) < 1e-7)) continue;
      const before = normal(...corners.map((index) => base.positions[index]));
      const after = normal(...corners.map((index) => changed[index]));
      const area0 = Math.hypot(...before);
      const area1 = Math.hypot(...after);
      if (area0 < 1e-10) continue;
      if (area1 < 1e-10 || area1 / area0 < .20) nearZero++;
      if (before.reduce((dot, value, axis) => dot + value * after[axis], 0) <= 0) reversed++;
      ratios.push(area1 / area0);
    }
    for (const [i, position] of base.positions.entries()) {
      if (seam.has(xyz(position))) assert.ok(Math.hypot(...delta[i]) < 1e-7, `${name} moved the neck seam`);
    }
    ratios.sort((a, b) => a - b);
    return [name, { affectedTriangles: ratios.length, reversed, nearZero, p95AreaRatio: ratios[Math.floor(ratios.length * .95)] }];
  }));
}

const lab = process.argv[2] ?? resolve(root, 'art-review/cas-head-v2/p3-lab/assets');
const result = Object.entries(originals).map(([family, name]) => {
  const original = readFileSync(resolve(root, 'assets/characters', name));
  const candidate = readFileSync(resolve(lab, `${family}-p3.glb`));
  assert.equal(sha256(original), pins.originalHeroGLBSha256[family]);
  const structural = auditHeadGLB(candidate, original, family);
  const source = unpackGLB(original);
  const derived = unpackGLB(candidate);
  assert.deepEqual(derived.json.animations, source.json.animations, 'Original animation channel/sampler lists must be identical');
  assert.deepEqual(derived.json.skins, source.json.skins, 'Original inverse-bind and joint references must be identical');
  assert.ok(derived.bin.subarray(0, source.bin.length).equals(source.bin), 'Original inverse-bind and animation bytes must be identical');
  for (const joint of source.json.skins[0].joints) assert.deepEqual(derived.json.nodes[joint], source.json.nodes[joint]);
  const mesh = derived.json.meshes.find((item) => item.extras?.lifeSimRole === 'derivative-head');
  const [primitive] = mesh.primitives;
  assert.equal(derived.json.materials[primitive.material].alphaMode ?? 'OPAQUE', 'OPAQUE');
  const head = inspectGeometry(derived, primitive);
  const body = inspectGeometry(derived, derived.json.meshes[0].primitives[0]);
  const boundary = [...head.edges].filter(([, count]) => count === 1).map(([edge]) => edge);
  assert.ok(boundary.length >= 16, 'Neck seam missing');
  assert.ok([...head.edges.values()].every((count) => count <= 2), 'Head has non-manifold edges');
  const seam = new Set(boundary.flatMap((edge) => edge.split('|')));
  for (const edge of boundary) assert.equal(body.edges.get(edge), 1, `Open head edge outside body seam: ${edge}`);
  for (const key of seam) {
    const top = head.signatures.get(key);
    const bottom = body.signatures.get(key);
    assert.equal(top.length, bottom.length);
    for (const [i, [joint, weight]] of top.entries()) {
      assert.equal(joint, bottom[i][0]);
      assert.ok(Math.abs(weight - bottom[i][1]) < 2e-5, `Inconsistent seam weights at ${key}`);
    }
  }
  const morphs = morphQuality(derived, primitive, head, mesh.extras.targetNames, seam);
  for (const [channel, quality] of Object.entries(morphs)) {
    assert.equal(quality.reversed + quality.nearZero, 0, `${family} ${channel} has a folded or near-zero triangle`);
  }
  return { ...structural, bytes: candidate.length, rigAndClipBytesIdentical: true, seamEdges: boundary.length,
    seamPoints: seam.size, nonNeckOpenEdges: 0, morphs };
});
console.log(JSON.stringify(result, null, 2));
