import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditQsk05,selectSourceClips,summarizeContactProxy,validateSource} from '../scripts/qsk-05-contact-matrix.mjs';

const points=(delta=0)=>Object.fromEntries([
  ['mixamorig:Hips',[0,1+delta*.5,0]],
  ['mixamorig:Head',[0,1.65+delta,0]],
  ['mixamorig:LeftFoot',[-.10,.1+delta,0]],
  ['mixamorig:RightFoot',[.10,.1,0]],
  ['mixamorig:LeftHand',[-.3,1.2+delta,0]],
  ['mixamorig:RightHand',[.3,1.2,0]]
]);

test('QSK-05 clip selection distinguishes authored idle, gait and sit-to-stand, not synthetic activity labels',()=>{
  assert.deepEqual(selectSourceClips([
    {name:'Idle_3'},{name:'Walking'},{name:'Running'},
    {name:'Sit_to_Stand_Transition_M'},{name:'Shower false'}
  ]),{idle:'Idle_3',walk:'Walking',run:'Running',sitToStand:'Sit_to_Stand_Transition_M'});
  assert.deepEqual(selectSourceClips([]),{idle:null,walk:null,run:null,sitToStand:null});
});

test('QSK-05 ankle-relative proxy never promotes its metric into floor or collision proof',()=>{
  const result=summarizeContactProxy([points(0),points(.02),points(0)]);
  assert.equal(result.frameCount,3);
  assert.equal(result.leftFoot.verticalRange,.02);
  assert.equal(result.rightFoot.verticalRange,0);
  assert.equal(result.groundingVerified,false);
  assert.equal(result.collisionVerified,false);
  assert.ok(result.handTravel>.01);
  assert.throws(()=>summarizeContactProxy([]),/sampled frames/);
  const bad=points();bad['mixamorig:LeftFoot'][0]=NaN;
  assert.throws(()=>summarizeContactProxy([bad]),/Invalid joint/);
});

test('QSK-05 original SHA/size/license gate rejects tampered source and invented rights',()=>{
  const bytes=Buffer.from('hello'); const fake={id:'test',sha256:'0'.repeat(64),bytes:5,provenance:{license:'unknown-not-cleared'}};
  assert.throws(()=>validateSource(bytes,fake),/SHA\/size mismatch/);
  assert.throws(()=>validateSource(bytes,{...fake,sha256:''}),/pinned source/);
  assert.throws(()=>validateSource(bytes,{...fake,sha256:undefined}),/pinned source/);
});

test('QSK-05 original Alex and Mira real binary clips and joint timeline audited without CAS promotion',()=>{
  const report=auditQsk05();
  assert.equal(report.originals.length,2);
  assert.equal(report.casGate,'GO-INDEPENDENT-ONLY');
  assert.equal(report.finalMultiBodyMatrixReady,false);
  assert.equal(report.originalRigSoleContactVerified,false);
  assert.deepEqual(report.originals.map(x=>x.joints),[66,66]);
  assert.deepEqual(report.originals.map(x=>x.clipCount),[10,13]);
  for(const original of report.originals){
    assert.match(original.sha256,/^[a-f0-9]{64}$/);
    for(const key of ['idle','walk','sitToStand']){
      const observation=original.observations[key];
      assert.equal(observation.status,'measured-joint-proxy-only',original.id+' '+key);
      assert.ok(observation.contact.frameCount>=3);
      assert.equal(observation.contact.groundingVerified,false);
      assert.ok(Number.isFinite(observation.contact.leftFoot.minY));
      assert.ok(Number.isFinite(observation.contact.rightFoot.maxY));
    }
    assert.equal(original.canonicalSourceUnchanged,true);
  }
  assert.ok(report.requirements.some(x=>x.action==='2–4 distinct body rigs'&&x.status.includes('CAS-02.2-B')));
});
