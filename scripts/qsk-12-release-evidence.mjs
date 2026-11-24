import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const WORKFLOWS = new Map([
  ['.github/workflows/ci-targeted.yml','feature'],
  ['.github/workflows/pages.yml','release']
]);
const SHA = /^[a-f0-9]{40}$/;
const ID = n => Number.isSafeInteger(n) && n > 0;
const statuses = new Set(['success','failure','cancelled','skipped','timed_out','neutral','action_required','stale','startup_failure']);
const state = item => item?.status === 'completed' && statuses.has(item.conclusion) ? item.conclusion : 'unknown';
const safeName = value => String(value ?? '').replace(/[\x00-\x1f\x7f]/g,' ').slice(0,240);
const cleanPath = p => String(p ?? '').split('@')[0];

export function buildReport({repo,run,jobs,artifacts}) {
  assert.match(repo,/^[\w.-]+\/[\w.-]+$/);
  assert.ok(ID(run.id) && ID(run.run_attempt) && SHA.test(run.head_sha),'Invalid source identity');
  const kind = WORKFLOWS.get(cleanPath(run.path));
  assert.ok(kind,'Unexpected source workflow');
  assert.equal(run.status,'completed','Source run must be completed');
  const root = 'https://github.com/'+repo+'/actions/runs/'+run.id;
  const jobRows = jobs.map(job => {
    assert.ok(ID(job.id),'Invalid job ID');
    if (job.run_attempt != null) assert.equal(job.run_attempt,run.run_attempt,'Mismatched job attempt');
    return {id:job.id,name:safeName(job.name),status:state(job),url:root+'/job/'+job.id,
      steps:(job.steps ?? []).map(step=>({number:step.number,name:safeName(step.name),status:state(step)}))};
  });
  const steps = jobRows.flatMap(job=>job.steps.map(step=>({...step,job:job.name,url:job.url})));
  const selected = pattern => steps.filter(step=>pattern.test(step.name));
  const deploy = steps.filter(s=>s.job==='validate-and-deploy' && s.name==='Deploy');
  const published = kind==='release' && run.head_branch==='main' &&
    ['push','workflow_dispatch'].includes(run.event) && state(run)==='success' &&
    deploy.length===1 && deploy[0].status==='success';
  const artifactRows = artifacts.map(a=>{
    assert.ok(ID(a.id),'Invalid artifact ID');
    return {id:a.id,name:safeName(a.name),expired:a.expired===true,
      url:root+'/artifacts/'+a.id,scope:'source-run; may include earlier rerun attempts'};
  });
  return {schema:1,kind,repository:repo,source:{runId:run.id,attempt:run.run_attempt,
    headSha:run.head_sha,branch:safeName(run.head_branch),event:safeName(run.event),
    status:state(run),url:root,checkoutSha:kind==='release'?run.head_sha:null,
    checkoutNote:kind==='feature'?'PR head identity only; checkout may be synthetic merge commit':'Pages source revision'},
    publication:{status:published?'deployed-by-this-run':'not-certified',deployedSha:published?run.head_sha:null,
      note:'Historical evidence for this run, not proof of current live SHA.'},
    physicalIphoneAcceptance:'not-verified-by-ci',
    checks:{node:selected(/affected Node tests|Check game rules and browser source syntax/),
      webgl:selected(/WebGL|PlayCanvas startup|real PlayCanvas|real mobile/i),
      touch:selected(/touch|HUD|social smoke/i),
      assets:selected(/GLB|asset.*(?:audit|verify)|published F2/i),
      fallback:selected(/404|fault|fallback/i)},
    jobs:jobRows,artifacts:artifactRows,
    limitations:['Missing steps are not tested. Composite steps report their actual overall conclusion, not individual subtest outcomes.',
      'Artifact names are links, not certification of their contents; source run artifacts can span reruns.',
      'Chromium/SwiftShader is not physical iPhone Safari. No private project documents or raw logs collected.']};
}
export function markdown(report) {
  const lines=['## QSK-12 — release evidence','',
    'Source: [run '+report.source.runId+' (attempt '+report.source.attempt+')]('+report.source.url+')',
    '', 'Source SHA: '+report.source.headSha,
    '', 'Run: '+report.source.status+' | Publication: '+report.publication.status,
    '', 'Physical iPhone acceptance: not verified by CI',
    '', '### Jobs',''];
  for(const job of report.jobs) lines.push('- '+job.status+' — [job '+job.id+']('+job.url+')');
  lines.push('','### Evidence artifacts','');
  for(const a of report.artifacts) lines.push('- [artifact '+a.id+']('+a.url+')'+(a.expired?' (expired)':''));
  lines.push('','See the JSON artifact for named steps and limitations.');
  return lines.join('\n')+'\n';
}
async function main(){
  const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  const repo=process.env.GITHUB_REPOSITORY;
  assert.match(repo,/^[\w.-]+\/[\w.-]+$/);
  const id=event.workflow_run?.id;
  const attempt=event.workflow_run?.run_attempt;
  assert.ok(ID(id)&&ID(attempt),'Missing workflow_run identity');
  const headers={Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
  async function get(suffix){
    const response=await fetch('https://api.github.com/repos/'+repo+suffix,{headers,redirect:'error'});
    assert.ok(response.ok,'GitHub evidence API HTTP '+response.status);
    return response.json();
  }
  async function pages(suffix,key){
    const result=[];
    for(let page=1;page<=100;page++){
      const data=await get(suffix+'?per_page=100&page='+page);
      assert.ok(Array.isArray(data[key]),'Missing evidence list');
      result.push(...data[key]);
      if(data[key].length<100)return result;
    }
    throw Error('Evidence pagination limit exceeded');
  }
  const run=await get('/actions/runs/'+id+'/attempts/'+attempt);
  assert.equal(run.id,id);assert.equal(run.run_attempt,attempt);
  assert.equal(run.head_sha,event.workflow_run.head_sha);
  const [jobs,artifacts]=await Promise.all([
    pages('/actions/runs/'+id+'/attempts/'+attempt+'/jobs','jobs'),
    pages('/actions/runs/'+id+'/artifacts','artifacts')
  ]);
  const report=buildReport({repo,run,jobs,artifacts});
  mkdirSync('artifacts/qsk-12',{recursive:true});
  writeFileSync('artifacts/qsk-12/report.json',JSON.stringify(report,null,2)+'\n');
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,markdown(report));
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) await main();
