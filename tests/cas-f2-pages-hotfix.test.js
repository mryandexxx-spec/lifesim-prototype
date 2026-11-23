import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyF2PublishedDirectory} from '../scripts/cas-f2-pages-verify.mjs';

test('CAS F2 Pages stages exact assessment.json BEFORE deploy and checks staged bytes',()=>{
 const pages=readFileSync('.github/workflows/pages.yml','utf8');
 const cp='cp assets/characters/cas-cc0-f2/assessment.json site/assets/characters/cas-cc0-f2/';
 const gate='node scripts/cas-f2-pages-verify.mjs site';
 assert.ok(pages.includes(cp),'glob *.assessment.json does not copy assessment.json');
 assert.ok(pages.includes(gate),'must fail before publishing broken site');
 assert.ok(pages.indexOf(cp)<pages.indexOf(gate));
 assert.ok(pages.indexOf(gate)<pages.indexOf('actions/configure-pages@v5'));
 assert.match(pages,/cp assets\/characters\/cas-cc0-f2\/\*\.glb site\/assets\/characters\/cas-cc0-f2\//);
});
test('CAS F2 release must reject missing staged report, not trust checkout or passing Node tests',()=>{
 const site=mkdtempSync(join(tmpdir(),'cas-f2-missing-published-audit-'));
 try{
  assert.throws(()=>verifyF2PublishedDirectory(site),/required staged file missing.*assessment\.json/);
 }finally{rmSync(site,{recursive:true,force:true})}
});
test('CAS F2 iPhone Safari never remains blank if required deployed JSON is absent',()=>{
 const source=readFileSync('src/cas-f2-footwear-lab.js','utf8');
 assert.match(source,/if\(!res\.ok\)throw Error\('F2 audit report missing from release'\)/);
 assert.match(source,/fallbackToSource=true/);
 assert.match(source,/if\(!revealed\)reveal\(\)/);
 assert.match(source,/if\(sourceMask\)sourceVisible\(true\)/);
 assert.match(source,/mode='source'/);
 assert.match(source,/\$\('shoe-choice'\)\.disabled=true/);
 assert.match(source,/Алекс показан в исходной обуви/);
 assert.doesNotMatch(source,/localStorage\.setItem/);
 const html=readFileSync('cas-f2-footwear-lab.html','utf8');
 assert.match(html,/cas-02-1-f2-c2-1-release-guard-r1/);
});
