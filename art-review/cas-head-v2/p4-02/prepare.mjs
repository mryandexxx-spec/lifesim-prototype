import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const here=dirname(fileURLToPath(import.meta.url)),out=resolve(process.env.P4_SITE||join(here,'site'));
execFileSync(process.execPath,[join(here,'../p4-01/prepare.mjs')],{env:{...process.env,P4_SITE:out},stdio:'inherit'});
const previous=join(out,'assets/p4-p3.glb'),baseline=join(out,'assets/p3-p3.glb');
await copyFile(previous,baseline);
execFileSync(process.execPath,[join(here,'build.mjs'),baseline,previous],{stdio:'inherit'});
const sha=async p=>createHash('sha256').update(await readFile(p)).digest('hex');
assert.equal(await sha(baseline),'ef4f26db3842d30d6124b665fd51e0ebff27cd94bdd49f08a312d5cd99da8a2c');
assert.equal(await sha(previous),'4f0068503afdea25284c50c5972843c63ac395aa50cdd4f12b885bdf22a7175c');
for(const f of ['index.html','app.mjs']){const p=join(out,f);let s=await readFile(p,'utf8');s=s.replaceAll('P4-01','P4-02').replaceAll('P3-09','P4-01').replaceAll('глаза P4-02','лицо P4-02');await writeFile(p,s)}
await writeFile(join(out,'candidate.json'),JSON.stringify({version:'P4-02',source:await sha(baseline),candidate:await sha(previous),original:await sha(join(out,'assets/meshy-mira-mobile-v1.glb')),ownerAccepted:false},null,2));
console.log('P4-02 ready',out);

