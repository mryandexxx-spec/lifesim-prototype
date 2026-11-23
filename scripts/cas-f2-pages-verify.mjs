/** CAS-F2 release integrity gate.
 * Validate the EXACT staged Pages tree, not repository checkout assets.
 * A missing assessment.json previously left original Alex permanently invisible
 * on physical iPhone Safari although the full Node/Pages CI was green.
 */
import {readFileSync,existsSync,statSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {ASSET_SHA256,CC0_SHOE_CANDIDATES} from './cas-02-1-f0-download-assets.mjs';
function requireFile(path){
 if(!existsSync(path)||!statSync(path).isFile()||statSync(path).size===0)
  throw Error('CAS-F2 Pages release BLOCKED: required staged file missing: '+path);
 return readFileSync(path);
}
export function verifyF2PublishedDirectory(root='site'){
 const site=resolve(root),dir=join(site,'assets/characters/cas-cc0-f2');
 const auditBytes=requireFile(join(dir,'assessment.json'));
 let audit;
 try{audit=JSON.parse(auditBytes.toString('utf8'))}
 catch(e){throw Error('CAS-F2 Pages release BLOCKED: assessment.json invalid JSON: '+e.message)}
 if(audit.standard!=='CAS-02.1-F2-C'||audit.productionReady!==false||
     audit.physicallyApproved!==false||!Array.isArray(audit.sources)||
     audit.sources.length!==CC0_SHOE_CANDIDATES.length)
  throw Error('CAS-F2 Pages release BLOCKED: unexpected source review contract');
 const details=[];
 for(const source of CC0_SHOE_CANDIDATES){
  const item=audit.sources.find(x=>x.id===source.id);
  if(!item||item.sourceSha256!==ASSET_SHA256[source.id]||
     item.sourceTriangles!==source.expectedTriangles||
     item.license!=='CC0-1.0'||item.productionReady===true||
     item.sourceOrientationVerified!==false||item.contactApproved!==false||
     item.status!=='geometry-split-review-required'||
     !Array.isArray(item.sourceParts)||item.sourceParts.length!==2)
   throw Error('CAS-F2 Pages release BLOCKED: unaudited or incomplete '+source.id);
  let sum=0;
  const seen=new Set();
  for(const part of item.sourceParts){
   if(!['left','right'].includes(part.side)||seen.has(part.side)||
       part.file!==source.id+'-'+part.side+'.glb'||
       !Number.isSafeInteger(part.sourceTriangles)||part.sourceTriangles<=0)
    throw Error('CAS-F2 Pages release BLOCKED: invalid '+source.id+' side');
   seen.add(part.side);
   const bytes=requireFile(join(dir,part.file));
   const sha=createHash('sha256').update(bytes).digest('hex');
   if(sha!==part.sha256)
    throw Error('CAS-F2 Pages release BLOCKED: corrupted '+part.file);
   sum+=part.sourceTriangles;
  }
  if(sum!==source.expectedTriangles)
   throw Error('CAS-F2 Pages release BLOCKED: geometry count drift '+source.id);
  details.push({id:source.id,sides:[...seen],triangles:sum});
 }
 for(const path of [
  'cas-f2-footwear-lab.html','src/cas-f2-footwear-lab.js',
  'src/cas-footwear-standard.js','src/cas-footwear-layers.js',
  'src/character-lab-config.js',
  'assets/characters/cas-alex-cc0-fitting-base.glb',
  'vendor/playcanvas.mjs'
 ])requireFile(join(site,path));
 const html=readFileSync(join(site,'cas-f2-footwear-lab.html'),'utf8');
 const loader=readFileSync(join(site,'src/cas-f2-footwear-lab.js'),'utf8');
 if(!html.includes('cas-f2-footwear-lab.js')||
    !loader.includes('./assets/characters/cas-cc0-f2/assessment.json'))
  throw Error('CAS-F2 Pages release BLOCKED: staged URL and loader mismatch');
 return {stage:'cas-f2-pages',status:'verified',sources:details,
   file:'assets/characters/cas-cc0-f2/assessment.json'};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const report=verifyF2PublishedDirectory(process.argv[2]||'site');
 console.log('CAS-F2 exact staged Pages assets verified '+JSON.stringify(report));
}
