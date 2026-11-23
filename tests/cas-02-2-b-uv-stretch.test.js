import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {deriveSourceGLB} from '../art-review/cas-02-2-b/build-source-identities.mjs';
import {audit,STRETCH_P95_MAX} from '../art-review/cas-02-2-b/audit-uv-stretch.mjs';
const base=new URL('../assets/characters/',import.meta.url);
const files={alex:'meshy-casual-v1.glb',mira:'meshy-mira-mobile-v1.glb'};
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const [kind,file] of Object.entries(files)){
 test('CAS-B G0 UV audit measures genuine surface deformation without changing '+kind+' source',()=>{
  const source=readFileSync(new URL(file,base)),before=hash(source);
  const {buffer}=deriveSourceGLB(kind,source);
  const r=audit(kind,source,buffer);
  assert.equal(r.sourceSha256,before);
  assert.equal(hash(source),before,'original binary remains untouched');
  assert.equal(r.derivativeSha256,hash(buffer));
  assert.equal(r.originalAtlasUnchanged,true);
  assert.equal(r.originalTextureHashes.length,1);
  assert.equal(r.morphTargets.length,6);
  assert.ok(r.facialVertices>1500&&r.facialTriangles>1500);
  assert.ok(r.uvAtlas16x16FaceBins>100,'face occupies dispersed areas of original packed UV atlas');
  for(const m of r.morphTargets.filter(x=>x.name!=='body')){
   assert.ok(m.changedVertices>50&&m.affectedFaceTriangles>30,m.name);
   assert.ok(m.areaStretchP95>STRETCH_P95_MAX,'R2 '+kind+' '+m.name+' art must remain BLOCKED');
   assert.equal(m.uvUnchanged,true);
   assert.equal(m.atlasCorrected,false);
   assert.equal(m.artistSculptApproved,false);
  }
  assert.equal(r.productionReady,false);
  assert.equal(r.ownerArtApproved,false);
  assert.ok(r.morphAreaStretchFailures.length>=5,'all R2 facial controls require re-authoring');
  assert.ok(r.artBlockers.some(x=>x.includes('atlas')));
 });
}
test('CAS-B UV audit fails closed on unverified source GLB',()=>{
 const source=readFileSync(new URL(files.alex,base));
 const {buffer}=deriveSourceGLB('alex',source);
 const fake=Buffer.from(source);fake[fake.length-12]^=1;
 assert.throws(()=>audit('alex',fake,buffer),/Unverified original source SHA/);
 assert.throws(()=>audit('unknown',source,buffer),/Unknown source/);
});


test('CAS-B audit detects tampering with source UV bytes inside derivative GLB',()=>{
 const source=readFileSync(new URL(files.alex,base));
 const {buffer}=deriveSourceGLB('alex',source);
 const changed=Buffer.from(buffer);
 const jsonLen=changed.readUInt32LE(12), g=JSON.parse(changed.toString('utf8',20,20+jsonLen));
 const tex=g.accessors[g.meshes[0].primitives[0].attributes.TEXCOORD_0];
 const view=g.bufferViews[tex.bufferView];
 const off=20+jsonLen+8+(view.byteOffset||0)+(tex.byteOffset||0);
 changed[off]^=1;
 assert.throws(()=>audit('alex',source,changed),/Original attribute bytes differ: TEXCOORD_0/);
});
