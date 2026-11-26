import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function pngEvidence(bytes){
  assert.ok(Buffer.isBuffer(bytes)&&bytes.length>32,'missing PNG');
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a','PNG signature');
  assert.equal(bytes.subarray(12,16).toString(),'IHDR');
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
  assert.ok(width>0&&height>0);
  return {width,height,bytes:bytes.length,sha256:hash(bytes)};
}
export function assertEvidence(report,expectedSha,expectedCases){
  assert.match(expectedSha,/^[a-f0-9]{40}$/);
  assert.equal(report.sha,expectedSha);
  assert.equal(report.device,'OPEN: emulated browsers, not physical iPhone');
  assert.equal(report.game,'OPEN: scripted interaction, not human enjoyment');
  assert.equal(report.art,'OPEN: screenshots require visual review');
  assert.equal(report.cases.length,expectedCases.length);
  assert.deepEqual(report.cases.map(c=>c.id).sort(),[...expectedCases].sort());
  for(const c of report.cases){
    assert.equal(c.status,'PASS',c.id);
    assert.deepEqual(c.errors,[],c.id);
    assert.ok(c.durationMs>0&&c.steps.length>=2,c.id);
    assert.ok(c.steps.some(s=>s.input==='touch'&&s.touchEvents>0),c.id+' no actual touch');
    for(const s of c.steps){
      assert.equal(s.status,'PASS',s.name);
      assert.ok(s.elapsedMs>=0&&Number.isFinite(s.elapsedMs));
      assert.ok(s.image?.bytes>32&&s.image?.width===c.width&&s.image?.height===c.height);
      assert.match(s.image.sha256,/^[a-f0-9]{64}$/);
      assert.ok(s.image.file&&!s.image.file.includes('..'));
    }
  }
}
