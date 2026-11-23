import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createFootFitProfile,createShoeFitManifest}
 from '../src/cas-footwear-standard.js';
import {buildFootSurface,skinFootSurface,clipSurfaceAbove,resolveFootwearLayers}
 from '../src/cas-footwear-layers.js';
const p=(x,y,z)=>({x,y,z}),hash=x=>x.repeat(64);
const foot=(side='left',residentId='alex')=>{
 const x=side==='left'?-0.1:.1;
 return createFootFitProfile({residentId,side,rigId:residentId+'-source-own-rig',
  sourceSkinSha256:hash('a'),ballWidth:.085,soleY:0,
  landmarks:{ankle:p(x,.17,0),heel:p(x,.015,0),ball:p(x,.025,.18),
   toe:p(x,.02,.27),instep:p(x,.075,.1)}});
};
const shoe=(cut='low-top',height=.095)=>createShoeFitManifest({
 version:1,id:'cc0-'+cut,cut,source:{license:'CC0-1.0',sha256:hash('b'),
  url:'https://grab3d.com/models/props/shoe/'},
 parts:Object.fromEntries(['left','right'].map((side,index)=>[side,{
  side,meshSha256:hash(index?'d':'c'),triangles:9872,
  ballWidth:.085,bounds:{min:p(-.055,0,-.01),max:p(.055,height+.01,.29)},
  landmarks:{ankle:p(0,height,0),heel:p(0,.015,0),ball:p(0,.025,.18),
   toe:p(0,.02,.27),instep:p(0,.07,.1)},
  collarOpening:p(0,height,0),solePlanePoint:p(0,0,0)
 }]))});
const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const translation=(x,y,z)=>{const m=identity();m[12]=x;m[13]=y;m[14]=z;return m;};

test('F2-B neutral skin and optional sock are separate original layered geometry with valid two-bone weights',()=>{
 for(const side of ['left','right']){
  const f=foot(side),neutral=buildFootSurface(f),sock=buildFootSurface(f,{kind:'sock'});
  assert.equal(neutral.kind,'neutral');assert.equal(sock.kind,'sock');
  assert.equal(neutral.vertices.length,60);assert.equal(sock.vertices.length,60);
  assert.equal(sock.triangles.length,96);
  assert.notDeepEqual(neutral.vertices[0].bind,sock.vertices[0].bind);
  assert.equal(sock.originalGeometry,true);assert.equal(sock.productionApproved,false);
  assert.equal(sock.skinId,f.sourceSkinSha256);
  for(const vertex of sock.vertices){
   assert.ok(Math.abs(vertex.weights.foot+vertex.weights.toe-1)<1e-12);
   assert.ok(vertex.weights.foot>=0&&vertex.weights.toe>=0);
  }
  assert.deepEqual(sock.bindBones,['foot','toe']);
 }
});
test('F2-B animated foot/toe delta matrices move sock toes independently of ankle, with no shared Alex/Mira rig',()=>{
 const a=foot('left','alex'),m=foot('left','mira');
 const sockA=buildFootSurface(a,{kind:'sock'}),sockM=buildFootSurface(m,{kind:'sock'});
 assert.notEqual(a.rigId,m.rigId);
 assert.equal(sockA.residentId,'alex');assert.equal(sockM.residentId,'mira');
 const orig=skinFootSurface(sockA,{footDelta:identity(),toeDelta:identity()});
 const moved=skinFootSurface(sockA,{footDelta:translation(0,.01,0),
  toeDelta:translation(0,.08,.03)});
 const ankleDist=Math.hypot(moved[0].x-orig[0].x,moved[0].y-orig[0].y,
  moved[0].z-orig[0].z);
 const toeDist=Math.hypot(moved.at(-1).x-orig.at(-1).x,
  moved.at(-1).y-orig.at(-1).y,moved.at(-1).z-orig.at(-1).z);
 assert.ok(ankleDist<.011);assert.ok(toeDist>.075);
 assert.notDeepEqual(moved,orig);
 assert.deepEqual(skinFootSurface(sockM,{footDelta:identity(),toeDelta:identity()}),
  orig,'same geometry possible, but matrices and source rig remain individually bound');
});
test('F2-B cloth mask exactly clips posed sock triangles to the currently selected collar plane',()=>{
 const f=foot(),s=buildFootSurface(f,{kind:'sock'});
 const points=skinFootSurface(s,{footDelta:identity(),toeDelta:identity()});
 const low=resolveFootwearLayers(f,shoe());
 assert.equal(low.sockVisible,true);assert.equal(low.neutralFootVisible,false);
 assert.equal(low.originalShoesVisible,false);
 assert.equal(low.originalSneakerResidueVisible,false);
 const tri=clipSurfaceAbove(points,s.triangles,low.clipY);
 assert.ok(tri.length>0&&tri.length<s.triangles.length*2);
 for(const face of tri)for(const v of face)assert.ok(v.y>=low.clipY-1e-8);
 const naked=resolveFootwearLayers(f,shoe(),{socks:false});
 assert.equal(naked.sockVisible,false);assert.equal(naked.neutralFootVisible,true);
 assert.equal(naked.restorePolicy,'snapshot-original-render-states');
 assert.equal(naked.fit.contactApproved,false);
});
test('F2-B higher shoe collars cover more ankle, rather than stretching shoe into the ankle',()=>{
 const f=foot();
 const low=resolveFootwearLayers(f,shoe('low-top',.095));
 const high=resolveFootwearLayers(f,shoe('high-top',.145));
 const boot=resolveFootwearLayers(f,shoe('boot',.24));
 assert.ok(low.clipY<high.clipY&&high.clipY<boot.clipY);
 assert.equal(boot.sockVisible,false,'boot itself covers ankle');
 assert.equal(boot.neutralFootVisible,false);
 for(const item of [low,high,boot])assert.equal(item.fit.scale,1);
 assert.equal(low.fit.soleWorldY,high.fit.soleWorldY);
});
test('F2-B masking is independent of original Meshy sneaker triangles and does not write to legacy saves',()=>{
 const source=readFileSync('src/cas-footwear-layers.js','utf8');
 assert.doesNotMatch(source,/localStorage|\.setItem\(|planRigidShoeAnkleFit/);
 assert.match(source,/originalSneakerResidueVisible:false/);
 assert.match(readFileSync('scripts/cas-02-1-f1-alex-underfoot.mjs','utf8'),/CAS F1 source underfoot residual/);
 assert.throws(()=>skinFootSurface(buildFootSurface(foot()),{
  footDelta:[0],toeDelta:identity()}),/invalid/);
});
