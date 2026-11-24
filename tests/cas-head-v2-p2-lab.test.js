import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const ROOT=resolve(import.meta.dirname,'..');
const read=path=>readFileSync(resolve(ROOT,path),'utf8');
const sha=path=>createHash('sha256').update(readFileSync(resolve(ROOT,path))).digest('hex');
const base='art-review/cas-head-v2/';
const pin=JSON.parse(read(base+'MPFB-DONOR-PIN.json'));

test('P2 original Alex and Mira are bit-for-bit unchanged and pinned',()=>{
 for(const [family,file] of Object.entries({
  alex:'assets/characters/meshy-casual-v1.glb',
  mira:'assets/characters/meshy-mira-mobile-v1.glb'
 }))assert.equal(sha(file),pin.originalHeroGLBSha256[family]);
});
test('experimental build actually derives new rigged face from legal CC0 MPFB topology',()=>{
 const script=read(base+'blender-p2-derivative-wip.py');
 assert.match(script,/def parse_donor\(/);
 assert.match(script,/check_hash\(obj,PIN\['donor'\]\['sha256'\]\)/);
 assert.match(script,/def donor_targets\(/);
 assert.match(script,/bpy\.ops\.import_scene\.gltf/);
 assert.match(script,/bpy\.ops\.export_scene\.gltf/);
 assert.match(script,/bind_to_original/);
 for(const channel of ['eyes','nose','lips','chin','cheeks'])
  assert.ok(script.includes("'"+channel+"'"),'Real shape key script missing '+channel);
 assert.match(script,/shape_key_add\(name=name\)/);
 assert.match(script,/uv_layers\.new/);
 assert.match(script,/tex\.image\.pack\(\)/);
 assert.doesNotMatch(script,/productionReady\s*=\s*True/);
});
test('explicit sparse morph decoding is dense and retains normalized glTF buffer',()=>{
 const script=read(base+'expand-sparse-p2.py');
 assert.match(script,/a\.pop\('sparse'\)/);
 assert.match(script,/dense\[j\*width:\(j\+1\)\*width\]/);
 assert.match(script,/js\['buffers'\]\[0\]\['byteLength'\]/);
 assert.match(script,/struct\.pack\('<III'/);
});
test('mobile art preview is separated from gameplay and never hides face below a modal',()=>{
 const html=read(base+'p2-lab/index.html');
 const js=read(base+'p2-lab/app.js');
 assert.match(html,/height:100dvh/);
 assert.match(html,/id="viewport"/);
 assert.match(html,/id="panel"/);
 assert.match(html,/#viewport\{flex:1/);
 assert.match(html,/#panel\{flex:none/);
 assert.match(html,/АРТ|ART НЕ ПРИНЯТ/);
 assert.match(js,/const PATH=\{/);
 assert.match(js,/meshy-casual-v1\.glb/);
 assert.match(js,/meshy-mira-mobile-v1\.glb/);
 assert.match(js,/assets\/alex-derivative-dense\.glb/);
 assert.match(js,/assets\/mira-derivative-dense\.glb/);
 assert.match(js,/new pc\.Application/);
 assert.match(js,/instantiateRenderEntity\(/);
 assert.match(js,/\.setWeight\(/);
 assert.match(js,/new ResizeObserver\(/);
 assert.doesNotMatch(js,/localStorage|fetch\(.*save|productionReady\s*=\s*true/);
 for(const channel of ['eyes','nose','lips','chin','cheeks'])
  assert.ok(html.includes('data-morph="'+channel+'"'));
});
test('review gate has no false-positive user approval or missing-assets fallback',()=>{
 const js=read(base+'p2-lab/app.js');
 const html=read(base+'p2-lab/index.html');
 assert.match(html,/Не интегрировано в игру/);
 assert.match(js,/Арт|художественный контроль НЕ пройден/);
 assert.match(js,/Не удалось загрузить/);
 assert.doesNotMatch(html,/утверждено владельцем/i);
 const missing=spawnSync(process.execPath,[resolve(ROOT,base+'verify-derived-heads.mjs'),
  '/tmp/no-alex.glb','/tmp/no-mira.glb'],{encoding:'utf8'});
 assert.notEqual(missing.status,0,'missing real GLB must fail closed');
});
