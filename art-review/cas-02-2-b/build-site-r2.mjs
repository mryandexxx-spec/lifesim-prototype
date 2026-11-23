/** CAS-B R2 art-review only. Fails deployment if real mobile WebGL smoke fails. */
import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const run=(bin,args)=>execFileSync(bin,args,{stdio:'inherit'});
run(process.execPath,['--check','main.js']);
run(process.execPath,['build-source-identities.mjs']);
run('npm',['install','--no-save','--no-audit','--no-fund',
 'playwright-core@1.56.1','@sparticuz/chromium@153.0.0']);
run(process.execPath,['smoke-new-people-browser.mjs']);
mkdirSync('site/source-variants',{recursive:true});
for(const file of ['index.html','main.js','camera-layout.js'])copyFileSync(file,'site/'+file);
for(const person of ['alex','mira']){
 const name='source-variants/'+person,glb=readFileSync(name+'.glb'),manifest=JSON.parse(readFileSync(name+'.json'));
 const hash=createHash('sha256').update(glb).digest('hex');
 if(hash!==manifest.generatedSha256||manifest.eyeCheekOverlap!==0||manifest.eyeNoseOverlap!==0)
  throw Error('Refusing to publish unvalidated source morph '+person);
 copyFileSync(name+'.glb','site/'+name+'.glb');
 copyFileSync(name+'.json','site/'+name+'.json');
}
console.log('CAS_B_R2_ART_LAB_STAGE_OK two mobile WebGL viewports, semantic morph isolation, source SHA and bounded static artifacts');
