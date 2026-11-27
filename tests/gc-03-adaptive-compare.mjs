/** Matched runtime comparison: candidate source, baseline sleep modules only.
 * All other source is identical; source variants copied to isolated scratch.
 * No human gameplay or actual traversal claim. */
import assert from 'node:assert/strict';
import {cpSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const autonomyDiagnostic=process.env.GC_AUTONOMY_DIAGNOSTIC==='1';
const root=process.cwd(),out=resolve(autonomyDiagnostic?'artifacts/gc-03-autonomy':'artifacts/gc-03-adaptive');
mkdirSync(out,{recursive:true});
const base='881c17e31ebaf30340bb1ea930cfd639b79a5924';
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(process.env.GC_EXPECTED_SHA)assert.equal(sha,process.env.GC_EXPECTED_SHA);
const files=['src/need-balance.js','src/simulation.js'];
const hash=x=>createHash('sha256').update(x).digest('hex');
const arms={};
const nightAware=process.env.GC_NIGHT_POLICY==='1';
for(const arm of ['baseline','adaptive']){
 const scratch=mkdtempSync(join(root,'.gc03-'));
 try{
  cpSync(join(root,'src'),join(scratch,'src'),{recursive:true});
  mkdirSync(join(scratch,'tests'));
  cpSync(join(root,'tests/gc-03-property-probe.mjs'),join(scratch,'tests/gc-03-property-probe.mjs'));
  if(arm==='baseline')for(const path of files)writeFileSync(join(scratch,path),execFileSync('git',['show',base+':'+path],{maxBuffer:10e6}));
  const hashes=Object.fromEntries(files.map(path=>[path,hash(readFileSync(join(scratch,path)))]));
  let failure=null;
  try{execFileSync(process.execPath,['tests/gc-03-property-probe.mjs'],{cwd:scratch,stdio:'inherit',timeout:480000});}catch(e){failure=String(e);}
  const data=JSON.parse(readFileSync(join(scratch,'artifacts/gc-03-adaptive/property/report.json'),'utf8'));
  writeFileSync(join(out,arm+'.json'),JSON.stringify({arm,source:arm==='baseline'?base:sha,hashes,failure,data},null,2));
  arms[arm]={data,failure,hashes};
 }finally{rmSync(scratch,{recursive:true,force:true});}
}
const sum=(map,suffix)=>Object.entries(map).filter(([k])=>k.endsWith(':'+suffix)).reduce((n,[,v])=>n+v,0);
const rows=[],failures=[];
for(const [arm,a] of Object.entries(arms)){
 if(a.failure||a.data.failures.length)failures.push({arm,error:a.failure,details:a.data.failures});
 // A timeout may leave a readable but incomplete checkpoint; never accept it.
 assert.equal(a.data.policies.length,autonomyDiagnostic?5:15);
 if(!a.data.policies.every(p=>p.status==='PASS'&&p.daily.length===(autonomyDiagnostic?7:30))||
    a.data.controls.replay!=='PASS'||(!autonomyDiagnostic&&(a.data.checkpoints?.length!==28||
    a.data.propertyComparisons?.length!==28)))
  failures.push({arm,error:'incomplete 30-day rows, replay or final checkpoints'});

}
for(const a of arms.baseline.data.policies.filter(p=>!p.replay)){
 const b=arms.adaptive.data.policies.find(p=>!p.replay&&p.block.date===a.block.date&&p.variant.name===a.variant.name);
 assert.ok(b);const metrics=p=>({sleepMinutes:sum(p.timeClasses,'sleep'),criticalEnergy:sum(p.criticalNeedMinutes,'energy'),criticalHunger:sum(p.criticalNeedMinutes,'hunger'),idle:sum(p.timeClasses,'idle'),socialMinutes:sum(p.timeClasses,'social'),hobbyMinutes:sum(p.timeClasses,'hobby'),sales:p.sales,decisions:p.decisions,social:p.socialCompletions,wallet:p.daily.at(-1)?.wallet,debt:p.daily.at(-1)?.debt,missed:p.daily.at(-1)?.actors.reduce((n,x)=>n+(x.career?.missedShifts||0),0),travelFailures:p.travelFailures,premiumWake:p.property.premiumCompleted,premiumNonFull:p.property.premiumNonFullCompleted,sleepStarts:p.sleepEpisodes.filter(e=>e.kind==='start').length,workInterruptions:p.sleepEpisodes.filter(e=>e.outcome==='work-interrupt').length,fullWakes:p.sleepEpisodes.filter(e=>e.outcome==='full').length});
 const baseline=metrics(a),adaptive=metrics(b);
 rows.push({block:a.block.date,variant:a.variant.name,baseline,adaptive,delta:Object.fromEntries(Object.keys(baseline).map(k=>[k,adaptive[k]-baseline[k]]))});
 if(b.property.premiumNonFullCompleted>0)failures.push({variant:b.variant.name,block:b.block.date,error:'non-full premium completion'});
}
assert.equal(rows.length,autonomyDiagnostic?4:14);
const pairs=[];
for(const row of rows.filter(x=>x.variant.endsWith('-base'))){
 const p=rows.find(x=>x.block===row.block&&x.variant===row.variant.replace('-base','-premium-bed'));
 assert.ok(p);
 pairs.push({block:row.block,policy:row.variant,baselineSavedMinutes:row.baseline.sleepMinutes-p.baseline.sleepMinutes,adaptiveSavedMinutes:row.adaptive.sleepMinutes-p.adaptive.sleepMinutes,baselineCriticalDelta:p.baseline.criticalEnergy-row.baseline.criticalEnergy,adaptiveCriticalDelta:p.adaptive.criticalEnergy-row.adaptive.criticalEnergy});
}
assert.equal(pairs.length,autonomyDiagnostic?0:6);
if(nightAware&&!autonomyDiagnostic){
 for(const row of rows.filter(x=>x.variant!=='no-intervention')){
  if(row.adaptive.criticalEnergy>row.baseline.criticalEnergy)
   failures.push({block:row.block,variant:row.variant,error:'critical energy exceeds matched bedtime baseline'});
 }
 for(const pair of pairs)if(pair.adaptiveSavedMinutes<=0)
  failures.push({block:pair.block,policy:pair.policy,error:'premium sleep benefit lost'});
}
writeFileSync(join(out,'comparison.json'),JSON.stringify({sha,base,nightAware,autonomyDiagnostic,rows,pairs,failures},null,2));
console.log(JSON.stringify({nightAware,rows,pairs,failures}));
assert.deepEqual(failures,[]);
