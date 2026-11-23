import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  SOURCES, auditFaceTopology, measureConnectivity, weldConnectivityProbe, readGLB, accessor
} from '../art-review/cas-02-2-b/audit-facial-topology.mjs';

const dir = new URL('../assets/characters/', import.meta.url);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('CAS-B G1 UV splits do not falsely prove disjoint facial geometry', () => {
  const pos=Float64Array.from([0,0,0, 1,0,0, 0,1,0,
    0,1,0, 1,0,0, 1,1,0]);
  const idx=[0,1,2,3,4,5],mask=new Uint8Array(6).fill(1);
  assert.equal(measureConnectivity(idx,6,mask).connectedComponents,2);
  const welded=weldConnectivityProbe(idx,pos,mask);
  assert.equal(welded.coincidentIndexDuplicates,2);
  assert.equal(welded.connectivity.connectedComponents,1);
  assert.equal(welded.connectivity.triangles,2);
  assert.throws(()=>weldConnectivityProbe(idx,new Float64Array(0),mask),/cardinality mismatch/);
});

test('CAS-B G1 actual indexed connectivity is not guessed from region labels', () => {
  const mesh = measureConnectivity([0,1,2,4,5,6],7,new Uint8Array(7).fill(1));
  assert.equal(mesh.connectedComponents,2);
  assert.equal(mesh.largestComponentVertices,3);
  assert.equal(mesh.usedVertices,6);
  assert.equal(mesh.triangles,2);
  assert.equal(mesh.openEdges,6);
  assert.equal(mesh.nonManifoldEdges,0);
  assert.throws(()=>measureConnectivity([0,1,7],7,new Uint8Array(7).fill(1)),/Invalid index/);
  assert.throws(()=>measureConnectivity([0,1],7,new Uint8Array(7).fill(1)),/triangle index/);
});

for (const [kind,source] of Object.entries(SOURCES)) {
  test('CAS-B G1 source topology is measured directly without changing original '+kind, () => {
    const bytes = readFileSync(new URL(source.file,dir));
    const before = sha(bytes), report = auditFaceTopology(kind,bytes);
    assert.equal(before,source.sha);
    assert.equal(sha(bytes),before,'must not rewrite the original');
    assert.deepEqual(report,auditFaceTopology(kind,bytes),'topology audit must be reproducible');
    console.log('CAS_B_G1_MEASURED '+JSON.stringify(report));
    assert.equal(report.sourceSha256,before);
    assert.ok(report.coincidenceWeldedFaceProbe.connectedComponents>0);
    assert.ok(report.coincidenceWeldedFaceProbe.connectedComponents<=report.frontFaceCandidate.connectedComponents);
    assert.ok(report.coincidenceWeldedDuplicateVertexIndices>0);
    assert.ok(report.rawVsCoincidenceWeldedComponentRatio>=1);
    assert.equal(report.primitiveCount,1);
    assert.equal(report.joints,66);
    assert.equal(report.animationClips,kind==='alex'?10:13);
    assert.equal(report.sourceMorphTargets,0);
    assert.equal(report.atlasImages,1);
    assert.ok(report.frontFaceCandidateVertices>1500);
    assert.ok(report.frontFaceCandidate.triangles>1500);
    assert.ok(report.atlasBins16x16>100);
    for (const band of Object.values(report.probeBands)) {
      assert.ok(band.candidateVertices>0);
      assert.ok(band.triangles>=0);
      assert.ok(band.usedVertices<=band.candidateVertices);
    }
    assert.equal(report.anatomyLandmarksValidated,false);
    assert.equal(report.eyelidLipNostrilLoopsValidated,false);
    assert.equal(report.independentSkinEyeLipHairUVValidated,false);
    assert.equal(report.correctedTexturesAvailable,false);
    assert.equal(report.artistSculptedNewIdentities,0);
    assert.equal(report.productionReady,false);
    assert.match(report.conclusion,/must not be mistaken for validated/i);
  });
}

test('CAS-B G1 source mismatch and truncated geometry fail closed',()=>{
  const original=readFileSync(new URL(SOURCES.alex.file,dir));
  const altered=Buffer.from(original);
  altered[altered.length-16] ^= 1;
  assert.throws(()=>auditFaceTopology('alex',altered),/SHA mismatch/);
  assert.throws(()=>auditFaceTopology('unknown',original),/Unknown original family/);
  assert.throws(()=>readGLB(Buffer.alloc(32)),/Unrecognized/);
  const parsed=readGLB(original);
  assert.throws(()=>accessor(parsed,999999),/Unsupported/);
});
