import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {parseOBJ,parseSparseTarget,sha256} from '../art-review/cas-head-v2/audit-mpfb-donor.mjs';

const pin=JSON.parse(readFileSync(new URL('../art-review/cas-head-v2/MPFB-DONOR-PIN.json',import.meta.url)));

test('CAS-HEAD-V2 owner approval applies ONLY to derivatives and neither game nor paid provider',()=>{
  assert.equal(pin.ownerApproved.newResidentDerivedTopology,true);
  assert.equal(pin.ownerApproved.referenceOnlyUseOfMakeHuman,true);
  assert.equal(pin.ownerApproved.paidGeneration,false);
  assert.equal(pin.ownerApproved.gameIntegration,false);
  assert.equal(pin.upstream.tag,'v2.0.18');
  assert.match(pin.upstream.commit,/^[a-f0-9]{40}$/);
  assert.equal(pin.upstream.coreAssetsLicense,'CC0-1.0');
  assert.equal(pin.upstream.toolCodeLicense,'GPL-3.0');
  assert.equal(pin.upstream.toolVendored,false);
  assert.equal(pin.gate.donorGeomMeasured,true);
  for(const key of ['productionReady','sourceFitted','originalRigTransferVerified','correctiveSkinUV','playcanvasPreviewVerified','ownerVisualApproval']){
    assert.equal(pin.gate[key],false,key+' must not claim success');
  }
});

test('CAS-HEAD-V2 source hero originals SHA-locked even when new donor is tested',()=>{
  for(const [family,filename] of [['alex','meshy-casual-v1.glb'],['mira','meshy-mira-mobile-v1.glb']]){
    const buf=readFileSync(new URL('../assets/characters/'+filename,import.meta.url));
    assert.equal(createHash('sha256').update(buf).digest('hex'),pin.originalHeroGLBSha256[family]);
  }
});

test('CAS-HEAD-V2 OBJ topology gate catches a triangle and bad source geometry',()=>{
  const good='v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nvt 0 0\nf 1/1 2/1 3/1 4/1\n';
  const result=parseOBJ(good);
  assert.equal(result.quads,1);
  assert.equal(result.vertices.length,4);
  assert.equal(result.uvCoordinates,1);
  assert.throws(()=>parseOBJ(good.replace('4/1\n','\n')), /Non-quad/);
  assert.throws(()=>parseOBJ('v 0 Infinity 0\n'), /Non-finite/);
  assert.throws(()=>parseOBJ(good.replace('4/1','7/1')), /Invalid OBJ face index/);
});

test('CAS-HEAD-V2 sparse target parser rejects malformed/foreign morphs',()=>{
  const buf=x=>gzipSync(x);
  const got=parseSparseTarget(buf('0 1 0 0\n2 0 0.1 0\n'),3);
  assert.equal(got.length,2);
  assert.equal(got[1].i,2);
  assert.ok(got[1].length>.09);
  assert.throws(()=>parseSparseTarget(buf('3 0 0.1 0\n'),3),/out of bounds/);
  assert.throws(()=>parseSparseTarget(buf('0 1 0 0\n0 0 1 0\n'),3),/Duplicate/);
  assert.throws(()=>parseSparseTarget(buf('0 0 NaN 0\n'),3),/non-finite/);
  assert.throws(()=>parseSparseTarget(buf('0 1 0\n'),3),/must be/);
});

test('CAS-HEAD-V2 has five measured actual topology target channels, with immovable hashes',()=>{
  const keys=pin.targets.map(x=>x.channel);
  assert.deepEqual(keys,['eyes','nose','lips','chin','cheeks']);
  assert.equal(pin.donor.vertexCount,19158);
  assert.equal(pin.donor.quadCount,18486);
  assert.equal(pin.donor.uvCoordinateCount,21334);
  assert.equal(pin.donor.faceTopology,'ALL_QUADS');
  assert.match(pin.donor.sha256,/^[a-f0-9]{64}$/);
  for(const item of pin.targets){
    assert.match(item.sha256,/^[a-f0-9]{64}$/);
    assert.ok(item.path.endsWith('.target.gz'));
    assert.ok(item.changed>50);
    assert.ok(item.maxDelta>0);
    assert.ok(item.changed<pin.donor.vertexCount/5);
  }
  const receipt=JSON.stringify(pin);
  assert.ok(receipt.includes('not a stylistically accepted'));
  assert.equal(sha256(Buffer.from('abc')),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
