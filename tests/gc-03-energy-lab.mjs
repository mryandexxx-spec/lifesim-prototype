/** Diagnostic only. Source copies are isolated under the repo for ESM resolution.
 * No checked-out production source is modified. */
import assert from 'node:assert/strict';
import {cpSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const root=process.cwd(), output=resolve('artifacts/gc-03');
mkdirSync(output,{recursive:true});
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(process.env.GC_EXPECTED_SHA)assert.equal(sha,process.env.GC_EXPECTED_SHA);
const variants=[{id:'A-baseline'},{id:'B-recovery',recovery:true},{id:'C-seated',recovery:true,seated:true},{id:'D-exertion',recovery:true,seated:true,exertion:true}];
const sourceFiles=['need-balance.js','simulation.js','career-work-needs.js'];
const original=Object.fromEntries(sourceFiles.map(f=>[f,readFileSync(join(root,'src',f),'utf8')]));
const summary={sha,variants:[],failures:[]};
function patch(path,from,to){let s=readFileSync(path,'utf8');assert.equal(s.split(from).length,2,'patch anchor '+from);writeFileSync(path,s.replace(from,to));}
for(const v of variants){
 const dir=mkdtempSync(join(root,'.gc03-scratch-'));
 try{
  cpSync(join(root,'src'),join(dir,'src'),{recursive:true});
  mkdirSync(join(dir,'tests'));
  cpSync(join(root,'tests/gc-03-policy-probe.mjs'),join(dir,'tests/gc-03-policy-probe.mjs'));
  const need=join(dir,'src/need-balance.js'),sim=join(dir,'src/simulation.js'),work=join(dir,'src/career-work-needs.js');
  if(v.recovery){patch(need,'SLEEP_RECOVERY_PER_MINUTE=.19','SLEEP_RECOVERY_PER_MINUTE=.11');patch(need,'recoveryPerMinute:.24','recoveryPerMinute:.15');}
  if(v.seated)patch(sim,'minutes-sofaRestMinutes-sleepMinutes','minutes-sofaRestMinutes*.5-sleepMinutes');
  if(v.exertion){
   patch(sim,"}else state.needs[need]=clamp(state.needs[need]-NEED_DECAY_PER_MINUTE[need]*elapsed);","}else state.needs[need]=clamp(state.needs[need]-NEED_DECAY_PER_MINUTE[need]*elapsed-(need==='energy'&&state.action?.phase==='using'&&['paint','cook','garden','music'].includes(state.action.id)? .035*minutes:0));");
   patch(work,'(.037+.015*Math.min(1,duration/480))','(.050+.015*Math.min(1,duration/480))');
  }
  let error=null;
  try{execFileSync(process.execPath,['tests/gc-03-policy-probe.mjs'],{cwd:dir,stdio:'inherit',env:process.env,timeout:180000});}catch(e){error=String(e);}
  const evidence=JSON.parse(readFileSync(join(dir,'artifacts/gc-03/report.json'),'utf8'));
  assert.equal(evidence.sha,sha);
  assert.equal(evidence.policies.length,7);
  writeFileSync(join(output,v.id+'.json'),JSON.stringify(evidence,null,2));
  summary.variants.push({variant:v,rows:evidence.policies.filter(x=>!x.replay).map(x=>({block:x.block,policy:x.variant.name,status:x.status,energy:x.energySummary,actions:x.actions,critical:x.criticalNeedMinutes,time:x.timeClasses,travelFailures:x.travelFailures,actors:x.daily.at(-1)?.actors})),controls:evidence.controls});
  if(error||evidence.failures.length)summary.failures.push({id:v.id,error,failures:evidence.failures});
 }catch(e){summary.failures.push({id:v.id,error:String(e)});}
 finally{rmSync(dir,{recursive:true,force:true});}
}
for(const f of sourceFiles)assert.equal(readFileSync(join(root,'src',f),'utf8'),original[f],'production source mutated');
writeFileSync(join(output,'summary.json'),JSON.stringify(summary,null,2));
assert.equal(summary.variants.length,4);assert.deepEqual(summary.failures,[]);
