/** Matched actual domain policies on the current food, sleep and economy baseline.
 * Modeled A* arrival; not a human or physical device playthrough. */
import assert from 'node:assert/strict';
import {cpSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {HOBBY_SKILLS} from '../src/hobby-reading.js';
import {currentSkillLevel,SKILL_XP_RATE,restoreSkillProgress} from '../src/skills-engine.js';
const root=process.cwd(),out=resolve('artifacts/gc-05-skill-pacing');
mkdirSync(out,{recursive:true});
const base='2d1d93a3a9352b2796747fa925f336ef0f405e2b',sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(process.env.GC_EXPECTED_SHA)assert.equal(sha,process.env.GC_EXPECTED_SHA);
assert.equal(SKILL_XP_RATE,.5);
const files=['src/skills-engine.js','src/household.js','src/resident-activity-runtime.js','src/garden-skill.js'];
const hash=x=>createHash('sha256').update(x).digest('hex');
const arms={},failures=[];
for(const arm of ['baseline','candidate']){
 const scratch=mkdtempSync(join(root,'.gc05-'));
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
  arms[arm]=data;
  if(failure||data.failures.length||data.policies.length!==15||data.controls.replay!=='PASS'||!data.policies.every(p=>p.status==='PASS'&&p.daily.length===30))
   failures.push({arm,failure,details:data.failures});
 }finally{rmSync(scratch,{recursive:true,force:true});}
}
function metrics(p){
 const first=(id,test)=>p.daily.find(d=>test(d.actors.find(a=>a.id===id)))?.day??null;
 const end=p.daily.at(-1);
 return {actors:end.actors.map(a=>({id:a.id,xp:a.skills.xpById,levelBySkill:Object.fromEntries(Object.keys(HOBBY_SKILLS.skills).map(k=>[k,currentSkillLevel(a.skills,HOBBY_SKILLS,k)])),firstRankDays:[1,2,3,4].map(n=>first(a.id,x=>(x.career?.level??-1)>=n)),firstSkillDays:Object.fromEntries(Object.keys(HOBBY_SKILLS.skills).map(k=>[k,[1,3,5,10].map(n=>first(a.id,x=>currentSkillLevel(x.skills,HOBBY_SKILLS,k)>=n))])),worked:a.career?.workedShifts??0,missed:a.career?.missedShifts??0})),wallet:end.wallet,debt:end.debt,sales:p.sales,food:p.food,critical:p.criticalNeedMinutes,time:p.timeClasses,travelFailures:p.travelFailures};
}
const rows=[];
for(const a of arms.baseline.policies.filter(p=>!p.replay)){
 const b=arms.candidate.policies.find(p=>!p.replay&&p.block.date===a.block.date&&p.variant.name===a.variant.name);
 assert.ok(b);const baseline=metrics(a),candidate=metrics(b);
 rows.push({block:a.block.date,variant:a.variant.name,baseline,candidate});
 for(const x of baseline.actors){const y=candidate.actors.find(z=>z.id===x.id);
  for(const [i,d] of x.firstRankDays.entries())if(d!==null&&d+(i===0?1:3)<=30&&(y.firstRankDays[i]===null||y.firstRankDays[i]>d+(i===0?1:3)))failures.push({block:a.block.date,variant:a.variant.name,id:x.id,rank:i+1,baseline:d,candidate:y.firstRankDays[i]});
 }
}
assert.equal(rows.length,14);
const legacy={schema:1,xpById:Object.fromEntries(Object.keys(HOBBY_SKILLS.skills).map(k=>[k,123.456]))};
assert.deepEqual(restoreSkillProgress(legacy,HOBBY_SKILLS),legacy);
writeFileSync(join(out,'comparison.json'),JSON.stringify({sha,base,rows,failures},null,2));
console.log(JSON.stringify({rows:rows.map(r=>({block:r.block,variant:r.variant,baseline:r.baseline.actors,candidate:r.candidate.actors})),failures}));
assert.deepEqual(failures,[]);
