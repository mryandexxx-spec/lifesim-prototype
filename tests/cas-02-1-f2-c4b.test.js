import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync, readFileSync} from 'node:fs';
import {digest, editGlb} from '../scripts/cas-c3-glb.mjs';
import {intoFootFrame} from '../scripts/cas-c3-foot-frame.mjs';
import {FEMALE_STYLES, normalizeFemalePair} from '../scripts/cas-c4-mira-shoes.mjs';

const root = new URL('../assets/characters/cas-c3/', import.meta.url);
const loaded = existsSync(new URL('c4-manifest.json',root));
const strict = process.env.CAS_C4_REQUIRE_ASSETS === '1';
const requires = {skip: !loaded && !strict};

function meshLayer(model, name) {
  const node = model.gltf.nodes.find(n => n.name === name);
  const primitive = model.gltf.meshes[node.mesh].primitives[0];
  const position = model.read(primitive.attributes.POSITION);
  return {position, indices: model.read(primitive.indices).flat(),
    joints: model.read(primitive.attributes.JOINTS_0), weights: model.read(primitive.attributes.WEIGHTS_0)};
}

function topSurface(positions, indices, x, z) {
  let top = -Infinity;
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]].map(index => positions[index]);
    const [bx, bz] = [b[0] - a[0], b[2] - a[2]], [cx, cz] = [c[0] - a[0], c[2] - a[2]];
    const det = bx * cz - bz * cx;
    if (Math.abs(det) < 1e-10) continue;
    const u = ((x - a[0]) * cz - (z - a[2]) * cx) / det;
    const v = ((z - a[2]) * bx - (x - a[0]) * bz) / det;
    if (u >= 0 && v >= 0 && u + v <= 1)
      top = Math.max(top, a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1]));
  }
  return top;
}

test('C4B exposes three distinct female author-authored styles and none for Alex', () => {
  assert.deepEqual([...FEMALE_STYLES], ['ballet','mary-jane','ankle-boots']);
  assert.throws(() => normalizeFemalePair(Buffer.alloc(10), 'male'));
  const c3=readFileSync(new URL('../scripts/cas-c3-shoes.mjs',import.meta.url),'utf8');
  assert.match(c3,/buildWearableFromGeometry/);
});

test('C4B true external CC0 geometry, one Mira bind and independent sides', requires, () => {
  const audit=JSON.parse(readFileSync(new URL('c4-source-manifest.json',root)));
  const manifest=JSON.parse(readFileSync(new URL('c4-manifest.json',root)));
  const c3=JSON.parse(readFileSync(new URL('manifest.json',root)));
  const profile=JSON.parse(readFileSync(new URL('mira.profile.json',root)));
  assert.deepEqual(Object.keys(manifest.wearers),['mira']);
  assert.equal(manifest.maleBaselineSha256,c3.wearers.alex.bodySha256);
  assert.equal(manifest.wearers.mira.bodySha256,c3.wearers.mira.bodySha256);
  assert.equal(manifest.wearers.mira.inverseBindSha256,c3.wearers.mira.inverseBindSha256);
  for(const style of FEMALE_STYLES) {
    const source=audit.styles[style];
    const sourceBytes=readFileSync(new URL(source.file,root));
    assert.equal(digest(sourceBytes),source.sha256);
    assert.equal(source.license,'CC0 (source MHCLO declaration)');
    const base=editGlb(sourceBytes).gltf;
    assert.equal(base.textures.length,1);
    assert.equal(base.images.length,1);
    assert.equal(base.skins?.length??0,0);
    const halves=normalizeFemalePair(sourceBytes,style,profile);
    assert.equal(halves.sides.left.faces.length+halves.sides.right.faces.length,
      source.triangles);
    for (const side of ['left','right']) {
      const h=halves.sides[side];
      assert.ok(h.faces.length>30);
      assert.ok(h.vertices.some(v=>v.uv.some(c=>c>0)));
      assert.ok(h.collar.every(Number.isFinite));
      assert.ok(h.measuredSource.width<.18);
      assert.ok(h.measuredSource.heelFraction>.1 && h.measuredSource.heelFraction<.3);
      const positions=h.vertices.map(v=>v.position[2]);
      const shoeHeel=Math.min(...positions), shoeToe=Math.max(...positions);
      assert.ok(shoeHeel<0 && shoeToe>0);
      assert.ok(Math.abs(-shoeHeel/(shoeToe-shoeHeel)-h.measuredSource.heelFraction)<1e-5,
        'C4 canonical shoe socket should align with true recipient heel/toe semantics');
    }
    const entry=manifest.wearers.mira.styles[style];
    assert.equal(entry.sourceSha256,source.sha256);
    const output=readFileSync(new URL(entry.file,root));
    assert.equal(digest(output),entry.sha256);
    const rendered=editGlb(output);
    assert.equal(rendered.gltf.skins.length,1);
    for (const side of ['left','right']) {
      const node=rendered.gltf.nodes.find(n=>n.name==='C3 shoe '+side);
      assert.ok(node?.mesh>=0,'not actually skinned shoe '+side);
      assert.equal(node.skin,0);
      assert.ok(rendered.gltf.meshes[node.mesh].primitives[0].attributes.TEXCOORD_0>=0);
    }
    assert.equal(rendered.gltf.images.length,1,'retain original MakeHuman texture');
  }
});

test('C4B source skinned contact supports five original Mira animations',requires,()=>{
  const manifest=JSON.parse(readFileSync(new URL('c4-manifest.json',root)));
  const report=manifest.wearers.mira.contact;
  assert.equal(Object.keys(report).length,5);
  for(const [motion,items] of Object.entries(report))for(const name of FEMALE_STYLES) {
    const data=items[name];
    assert.ok(data.sampleCount>=1,motion+' '+name);
    assert.ok(Number.isFinite(data.offsetY));
    assert.ok(data.maxLiftOnOriginalSupport<.025,motion+' '+name);
  }
});

test('C4B fitted skin and socks fill both open vamps and stay under the toe boxes and strap', requires, () => {
  const read = name => readFileSync(new URL(name, root));
  const styles = JSON.parse(read('c4-manifest.json')).wearers.mira.styles;
  const profile = JSON.parse(read('mira.profile.json'));
  const body = editGlb(read('mira.glb'));
  for (const style of ['ballet', 'mary-jane']) {
    const shoe = editGlb(read(styles[style].file));
    for (const side of ['left', 'right']) {
      const {ankle, axis, ball, seam, footWidth} = profile.sides[side];
      const frame = ([x, y, z]) => intoFootFrame([x - ankle[0], y, z - ankle[2]], axis);
      const last = meshLayer(shoe, 'C3 shoe ' + side);
      const lastPositions = last.position.map(frame);
      const sole = frame(styles[style].sides[side].sole)[2];
      const toe = frame(styles[style].sides[side].toe)[2];
      const x = frame(ball)[0];
      const cuff = layer => layer.position.flatMap((position, i) =>
        Math.abs(position[1] - seam.y) < 1e-6 ? [[position, layer.joints[i], layer.weights[i]]] : [])
        .sort(([a], [b]) => a[0] - b[0] || a[2] - b[2]);
      for (const name of ['foot', 'sock']) {
        const fitted = meshLayer(shoe, `C3 opening ${name} ${side}`);
        const positions = fitted.position.map(frame);
        const originalCuff = cuff(meshLayer(body, `C3 ${name} ${side}`));
        const label = `${style} ${side} ${name}`;
        assert.ok(originalCuff.length >= 12);
        assert.deepEqual(cuff(fitted), originalCuff, label + ' cuff and weights');
        for (const offset of [-.1, 0, .1]) {
          const coveredPositions = style === 'mary-jane' && offset === 0 ? [.55, .86, .9] : [.86, .9];
          for (const [covered, fractions] of [[false, [.64, .67, .69]], [true, coveredPositions]]) {
            for (const fraction of fractions) {
              const sampleX = x + offset * footWidth, sampleZ = sole + fraction * (toe - sole);
              const shell = topSurface(lastPositions, last.indices, sampleX, sampleZ);
              const skin = topSurface(positions, fitted.indices, sampleX, sampleZ);
              assert.ok(Number.isFinite(shell) && Number.isFinite(skin), label + ` missing surface at ${fraction}`);
              assert.ok(covered ? skin < shell : skin - shell > .015,
                label + ` ${covered ? 'covered' : 'open'} at ${fraction}, heights ${skin}, ${shell}`);
            }
          }
        }
      }
    }
  }
});
