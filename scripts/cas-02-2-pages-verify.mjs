/** CAS-02.2-A release gate: validate the actual staged Pages artifacts, not source checkout. */
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {parseLegacyGlb} from './cas-source-asset-audit.mjs';
import {CAS_022_SOURCE_SHA256,CAS_022_MORPHS} from './cas-02-2-morphs.mjs';
const root=process.argv[2]||'site';
for(const p of ['cas-02-2-lab.html','src/character-lab.js','src/character-lab-config.js',
  'assets/characters/meshy-casual-v1.glb','assets/characters/meshy-mira-mobile-v1.glb']){
 if(!existsSync(join(root,p)))throw Error('CAS-02.2 missing staged Pages path: '+p);
}
const html=readFileSync(join(root,'cas-02-2-lab.html'),'utf8');
if(!html.includes('src/character-lab.js?cas-02-2-a')||
  !html.includes('cas022-resident')||!html.includes('cas022-head')||
  !html.includes('cas022-torso'))
 throw Error('CAS-02.2 lab entry/UI missing in final Pages tree');
for(const kind of ['alex','mira']){
 const stem='assets/characters/cas-02-2-'+kind+'-morphs';
 const file=join(root,stem+'.glb');
 const manifest=JSON.parse(readFileSync(join(root,stem+'.json'),'utf8'));
 const bytes=readFileSync(file),data=parseLegacyGlb(bytes);
 const digest=createHash('sha256').update(bytes).digest('hex');
 if(digest!==manifest.sha256||
   data.sourceSha256!==manifest.sha256||
   manifest.sourceSha256!==CAS_022_SOURCE_SHA256[kind]||
   manifest.resident!==kind||manifest.productionReady!==false)
   throw Error('CAS-02.2 wrong staged digest/provenance '+kind);
 const prim=data.gltf.meshes?.[0]?.primitives?.[0];
 if(data.gltf.skins?.[0]?.joints?.length!==66||
  prim?.targets?.length!==2||
  data.gltf.meshes?.[0]?.weights?.some(w=>w!==0)||
  JSON.stringify(data.gltf.meshes?.[0]?.extras?.targetNames)!==JSON.stringify(CAS_022_MORPHS))
   throw Error('CAS-02.2 staged real morph rig invalid '+kind);
 console.log('CAS-02.2-A staged '+kind+' SHA256 '+digest+' ('+bytes.length+' bytes)');
}
