import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readSourceAsset,auditSourceGlb,parseLegacyGlb,sourceAccessor} from '../scripts/cas-source-asset-audit.mjs';

test('CAS-02.1-D audit actual source Alex and Mira, never replace recognizable full-body assets',()=>{
  const reports=['alex','mira'].map(label=>auditSourceGlb(readSourceAsset(label),label));
  for(const r of reports){
    assert.ok(r.bytes>1_000_000);
    assert.equal(r.joints,66);
    assert.equal(r.skinCount,1);
    assert.equal(r.footJointIndices.length,2);
    assert.ok(r.triangles>20_000);
    assert.ok(r.primitives.length>=1);
    assert.equal(r.morphTargets,0);
    assert.match(r.sha256,/^[a-f0-9]{64}$/);
    assert.match(r.bindSha256,/^[a-f0-9]{64}$/);
    assert.ok(r.primitives.some(p=>p.attributes.includes('JOINTS_0')&&p.attributes.includes('WEIGHTS_0')));
    console.log('CAS-02.1-D REAL SOURCE ASSET AUDIT '+JSON.stringify(r));
  }
  assert.notEqual(reports[0].sha256,reports[1].sha256,'two real resident GLBs remain separate assets');
});
test('CAS-02.1-D inverse-bind and source accessors read actual bytes without aliasing saves',()=>{
 const original=readSourceAsset('alex'),copy=Buffer.from(original);
 const parsed=parseLegacyGlb(original);
 const skin=parsed.gltf.skins[0];
 const matrices=sourceAccessor(parsed,skin.inverseBindMatrices);
 assert.equal(matrices.componentCount,16);
 assert.equal(matrices.values.length,66*16);
 assert.ok(matrices.values.every(Number.isFinite));
 assert.ok(original.equals(copy),'no mutation of original binary');
 assert.equal(JSON.stringify(parsed.gltf).includes('lifesim.room01.v1'),false);
});
