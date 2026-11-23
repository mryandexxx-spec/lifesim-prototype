import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {ASSET_SHA256} from '../scripts/cas-02-1-f0-download-assets.mjs';
import {createFootFitProfile,createShoeFitManifest,planShoeLastFit,
 FOOTWEAR_STANDARD_VERSION} from '../src/cas-footwear-standard.js';

const p=(x,y,z)=>({x,y,z});
const sha1='1'.repeat(64),sha2='2'.repeat(64),skin='3'.repeat(64);
const originalFoot=(side,residentId='alex')=>{
 const x=side==='left'?-0.10:0.10;
 return createFootFitProfile({residentId,rigId:residentId+'-own-66-bones',side,
  sourceSkinSha256:skin,ballWidth:.09,soleY:0,
  landmarks:{ankle:p(x,.17,0),heel:p(x,.025,0),ball:p(x,.035,.19),
   toe:p(x,.028,.27),instep:p(x,.095,.1)}});
};
const shoePart=(side,{length=.27,width=.09,upper=.095,hash=side==='left'?sha1:sha2}={})=>({
 side,meshSha256:hash,triangles:9872,ballWidth:width,
 bounds:{min:p(-.055,0,-.015),max:p(.055,upper+.005,length+.01)},
 landmarks:{ankle:p(0,upper,0),heel:p(0,.02,0),ball:p(0,.038,length*.7),
  toe:p(0,.025,length),instep:p(0,.07,length*.38)},
 collarOpening:p(0,upper,0),solePlanePoint:p(0,0,0)
});
const manifest=(cut='low-top',width=.09,length=.27,sourceHash=ASSET_SHA256.dress)=>
 createShoeFitManifest({version:FOOTWEAR_STANDARD_VERSION,id:'cc0-'+cut,
 cut,source:{license:'CC0-1.0',sha256:sourceHash,
  url:'https://grab3d.com/models/props/shoe/'},
 parts:{left:shoePart('left',{width,length}),
  right:shoePart('right',{width,length})}});

test('F2-A resident left/right profiles keep source skin/rig identity',()=>{
 const l=originalFoot('left'),r=originalFoot('right'),m=originalFoot('left','mira');
 assert.notEqual(l.side,r.side);
 assert.notEqual(l.rigId,m.rigId);
 assert.ok(l.frame.length>.25&&l.frame.length<.3);
 assert.throws(()=>originalFoot('middle'),/quarantine/);
 assert.throws(()=>createFootFitProfile({...l,sourceSkinSha256:'wrong'}),/quarantine/);
 assert.ok(Object.isFrozen(l)&&Object.isFrozen(l.landmarks));
});

test('F2-A one geometric resolver fits real-source-identified low top, high top and boots without height stretching',()=>{
 // Synthetic landmarks isolate the fit math; source identities are the actual
 // pinned F0 original GLB digests, NOT a claim of real multi-model wearable fit.
 for(const [cut,hash,width,soleLength] of [
  ['low-top',ASSET_SHA256.dress,.09,.27],
  ['high-top',ASSET_SHA256.sneakers,.092,.265],
  ['boot',ASSET_SHA256.boots,.102,.28]]){
  for(const side of ['left','right']){
   const foot=originalFoot(side),last=manifest(cut,width,soleLength,hash);
   const fit=planShoeLastFit(foot,last);
   assert.equal(fit.side,side);
   assert.equal(fit.soleWorldY,0);
   assert.equal(fit.contactApproved,false);
   assert.equal(fit.skinned,false);
   assert.equal(last.productionReady,false);
   assert.equal(fit.exposedAnkle,cut==='low-top');
   assert.ok(fit.scale>.7&&fit.scale<1.4);
   assert.ok(Number.isFinite(fit.yawRadians));
   assert.equal(fit.collarWorldY,shoePart(side,{upper:.095}).collarOpening.y*fit.scale,
    'collar must retain normalized model height, not stretch to original ankle');
  }
 }
});

test('F2-A same shoe resolves distinct bind poses, no hard-coded per-pair nudges',()=>{
 const left=originalFoot('left'),shoe=manifest();
 const a=planShoeLastFit(left,shoe);
 const rotated=createFootFitProfile({...left,landmarks:{...left.landmarks,
  ball:p(-.29,.035,0),toe:p(-.37,.028,0)}});
 const b=planShoeLastFit(rotated,shoe);
 assert.notEqual(a.yawRadians,b.yawRadians);
 assert.equal(b.soleWorldY,0);
 assert.equal(a.scale,b.scale);
});

test('F2-A reject missing rights, wrong handedness, unsafe geometry, over-wide shoe',()=>{
 const input={version:1,id:'bad',cut:'low-top',
 source:{license:'CC0-1.0',sha256:ASSET_SHA256.dress,
  url:'https://grab3d.com/models/props/shoe/'},
 parts:{left:shoePart('left'),right:shoePart('right')}};
 assert.throws(()=>createShoeFitManifest({...input,source:{...input.source,license:'unknown'}}),/quarantine/);
 assert.throws(()=>createShoeFitManifest({...input,parts:{...input.parts,left:shoePart('right')}}),/quarantine/);
 assert.throws(()=>createShoeFitManifest({...input,parts:{...input.parts,left:shoePart('left',{length:0})}}),/quarantine/);
 assert.throws(()=>planShoeLastFit(originalFoot('left'),manifest('low-top',.15)),/quarantine/);
 assert.throws(()=>createShoeFitManifest({...input,cut:'spaceship'}),/quarantine/);
});

test('F2-A source GLB identities remain exact audited CC0, F1 prototype stays separate',()=>{
 for(const id of ['dress','sneakers','boots'])assert.match(ASSET_SHA256[id],/^[0-9a-f]{64}$/);
 const path='assets/characters/cas-cc0-f1/dress.manifest.json';
 if(existsSync(path)){
  const old=JSON.parse(readFileSync(path,'utf8'));
  assert.equal(old.sourceSha256,ASSET_SHA256.dress);
  assert.equal(old.license,'CC0-1.0');
  assert.equal(old.productionReady,false);
 }
 const old=readFileSync('src/cas-cc0-shoe-rig-lab.js','utf8');
 assert.match(old,/planRigidShoeAnkleFit/,'F1 legacy diagnostic still isolated, not silently promoted');
 const fit=readFileSync('src/cas-footwear-standard.js','utf8');
 assert.doesNotMatch(fit,/planRigidShoeAnkleFit|localStorage|verticalFactor|if\s*\(.*shoeId/);
});
