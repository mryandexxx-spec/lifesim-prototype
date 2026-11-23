import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync, readFileSync} from 'node:fs';
import {digest, editGlb} from '../scripts/cas-c3-glb.mjs';
import {FEMALE_STYLES, normalizeFemalePair} from '../scripts/cas-c4-mira-shoes.mjs';

const root = new URL('../assets/characters/cas-c3/', import.meta.url);
const loaded = existsSync(new URL('c4-manifest.json',root));
const strict = process.env.CAS_C4_REQUIRE_ASSETS === '1';
const requires = {skip: !loaded && !strict};

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
    const halves=normalizeFemalePair(sourceBytes,style);
    assert.equal(halves.sides.left.faces.length+halves.sides.right.faces.length,
      source.triangles);
    for (const side of ['left','right']) {
      const h=halves.sides[side];
      assert.ok(h.faces.length>30);
      assert.ok(h.vertices.some(v=>v.uv.some(c=>c>0)));
      assert.ok(h.collar.every(Number.isFinite));
      assert.ok(h.measuredSource.width<.18);
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
