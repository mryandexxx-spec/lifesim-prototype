import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReport,markdown} from '../scripts/qsk-12-release-evidence.mjs';
const sha='a'.repeat(40);
const run={id:123,run_attempt:2,path:'.github/workflows/pages.yml',head_sha:sha,head_branch:'main',event:'push',status:'completed',conclusion:'success'};
const step=(name,conclusion)=>({name,number:1,status:'completed',conclusion});
const job={id:456,name:'validate-and-deploy',run_attempt:2,status:'completed',conclusion:'success',steps:[step('Check game rules and browser source syntax','success'),step('Deploy','success')]};
const make=(r=run,jobs=[job],artifacts=[])=>buildReport({repo:'owner/repo',run:r,jobs,artifacts});
test('exact-main deployment requires successful actual Deploy step',()=>{
  assert.equal(make().publication.deployedSha,sha);
  for(const r of [{...run,head_branch:'other'},{...run,conclusion:'failure'},{...run,event:'pull_request'}])
    assert.equal(make(r).publication.deployedSha,null);
  assert.equal(make(run,[{...job,steps:[step('Deploy','skipped')]}]).publication.deployedSha,null);
  assert.equal(make(run,[]).publication.deployedSha,null);
});
test('feature CI cannot certify deploy or physical iPhone and preserves skipped results',()=>{
  const report=make({...run,path:'.github/workflows/ci-targeted.yml',event:'pull_request'},[{...job,steps:[step('Real PlayCanvas startup','skipped'),step('QSK-02 404 fallback','failure')]}]);
  assert.equal(report.source.checkoutSha,null);
  assert.equal(report.publication.deployedSha,null);
  assert.equal(report.physicalIphoneAcceptance,'not-verified-by-ci');
  assert.equal(report.checks.webgl[0].status,'skipped');
  assert.equal(report.checks.fallback[0].status,'failure');
});
test('wrong attempt and untrusted workflow rejected',()=>{
  assert.throws(()=>make(run,[{...job,run_attempt:1}]));
  assert.throws(()=>make({...run,path:'.github/workflows/unknown.yml'}));
  assert.throws(()=>make({...run,head_sha:'bad'}));
  assert.throws(()=>make({...run,status:'in_progress'}));
});
test('artifact link is scoped to actual run; no attacker text in Markdown',()=>{
  const report=make(run,[{...job,name:'<img src=x>'}],[{id:7,name:'<script>',expired:true}]);
  assert.equal(report.artifacts[0].url,'https://github.com/owner/repo/actions/runs/123/artifacts/7');
  assert.equal(report.artifacts[0].expired,true);
  assert.ok(!markdown(report).includes('<script>'));
  assert.ok(!markdown(report).includes('<img'));
});
