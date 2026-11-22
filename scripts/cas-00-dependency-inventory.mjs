/**
 * CAS-00.2: lexical dependency inventory across every PUBLIC src ES module.
 * Counts are NOT proof of a defect or semantic call-graph analysis.
 */
import {readdirSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const PATTERNS=Object.freeze({
  literalAlex:/['"]alex['"]/g,
  literalMira:/['"]mira['"]/g,
  otherSim:/\botherSim\b/g,
  householdIds:/\bHOUSEHOLD_IDS\b/g,
  careerIds:/\bCAREER_RESIDENT_IDS\b/g,
  actorPair:/\b(?:otherId|otherFor|otherActor|partnerId|peerId)\b/g,
  binaryPartner:/===?\s*['"]alex['"]\s*\?\s*['"]mira['"]/g,
  legacyDom:/\b(?:queue|mind-view|resident)[-_](?:alex|mira)\b/g
});

function walk(directory){
  const result=[];
  for(const ent of readdirSync(directory,{withFileTypes:true})){
    const full=path.join(directory,ent.name);
    if(ent.isDirectory())result.push(...walk(full));
    else if(ent.isFile()&&/\.(?:js|mjs)$/.test(ent.name))
      result.push(full);
  }
  return result;
}
export function auditResidentCoupling(root=ROOT){
  const files=walk(path.join(root,'src')).sort();
  const rows=files.map(file=>{
    const source=readFileSync(file,'utf8');
    const counts=Object.fromEntries(Object.entries(PATTERNS).map(([key,expression])=>
      [key,[...source.matchAll(expression)].length]));
    return {path:path.relative(root,file).replace(/\\/g,'/'),
      lines:source.split('\n').length,counts,
      flagged:Object.values(counts).some(v=>v>0)};
  });
  const totals=Object.fromEntries(Object.keys(PATTERNS).map(key=>
    [key,rows.reduce((sum,row)=>sum+row.counts[key],0)]));
  return {schema:1,kind:'lexical-candidates-not-proven-defects',
    filesScanned:files.length,filesFlagged:rows.filter(r=>r.flagged).length,
    totalLines:rows.reduce((sum,row)=>sum+row.lines,0),totals,files:rows};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const report=auditResidentCoupling();
  const out=path.join(ROOT,'artifacts','cas-00');
  mkdirSync(out,{recursive:true});
  writeFileSync(path.join(out,'resident-dependency-inventory.json'),
    JSON.stringify(report,null,2)+'\n');
  const strongest=[...report.files].filter(r=>r.flagged)
    .sort((a,b)=>Object.values(b.counts).reduce((x,y)=>x+y,0)-
      Object.values(a.counts).reduce((x,y)=>x+y,0)).slice(0,25)
    .map(row=>({path:row.path,counts:row.counts}));
  console.log('CAS-00.2 REPO INVENTORY '+JSON.stringify({
    filesScanned:report.filesScanned,filesFlagged:report.filesFlagged,
    totalLines:report.totalLines,totals:report.totals,strongest}));
}
