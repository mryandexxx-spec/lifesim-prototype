import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  MESHY_SOFA_CLIP,MESHY_SOFA_SECONDS,meshyHipAtTime,meshySitClipTime,
  meshySofaOffset,meshySofaVerticalLift,MESHY_SIT_CONTACT_LOCAL_Y,MESHY_SOFA_CLEARANCE_M
} from '../src/meshy-sofa-pose.js';
import {meshPlacement} from '../src/meshy-visual-policy.js';
import {SOFA_LAYOUT,SOFA_POSE} from '../src/pose-config.js';

function readRawPelvisTrack(){
  const bytes=readFileSync(new URL('../assets/characters/meshy-casual-v1.glb',import.meta.url));
  const jsonSize=bytes.readUInt32LE(12);
  const doc=JSON.parse(bytes.subarray(20,20+jsonSize).toString('utf8'));
  const binStart=20+jsonSize+8;
  const pelvisNode=doc.nodes.findIndex(n=>n.name==='mixamorig:Hips');
  const sit=doc.animations.find(a=>a.name===MESHY_SOFA_CLIP);
  assert.ok(sit);
  const target=sit.channels.find(ch=>ch.target.node===pelvisNode && ch.target.path==='translation');
  assert.ok(target);
  const sam=sit.samplers[target.sampler];
  function floats(accessorIndex){
    const a=doc.accessors[accessorIndex],v=doc.bufferViews[a.bufferView];
    assert.equal(a.componentType,5126);
    const dims=a.type==='VEC3'?3:1;
    const start=binStart+(v.byteOffset||0)+(a.byteOffset||0);
    const stride=v.byteStride||dims*4;
    return Array.from({length:a.count},(_,i)=>
      Array.from({length:dims},(_,j)=>bytes.readFloatLE(start+i*stride+j*4))
    );
  }
  return {times:floats(sam.input).map(a=>a[0]),xyz:floats(sam.output)};
}

test('sofa sit clip curve is sourced from actual optimized GLB pelvis track',()=>{
  const {times,xyz}=readRawPelvisTrack();
  assert.ok(times.length>=40);
  assert.ok(Math.abs(times.at(-1)-MESHY_SOFA_SECONDS)<.003);
  let maxDeviation=0;
  for(let i=0;i<times.length;i++){
    const actual=xyz[i],p=meshyHipAtTime(times[i]);
    maxDeviation=Math.max(maxDeviation,Math.abs(p.x-actual[0]),Math.abs(p.z-actual[2]));
  }
  assert.ok(maxDeviation<.001, 'curve drift '+maxDeviation);
});
test('sofa scrub preserves endpoints and cancels only horizontal displacement',()=>{
  assert.ok(Math.abs(meshySitClipTime(0)-MESHY_SOFA_SECONDS)<1e-8);
  assert.equal(meshySitClipTime(1),0);
  assert.equal(meshySitClipTime(-10),MESHY_SOFA_SECONDS);
  assert.equal(meshySitClipTime(20),0);
  const standing=meshySofaOffset(0,1),seated=meshySofaOffset(1,1);
  assert.ok(standing.z>.25&&standing.z<.35);
  assert.ok(seated.z>.68&&seated.z<.75);
  assert.ok(Math.abs(seated.x-standing.x)>.08);
  for(const weight of [0,.05,.2,.5,.7,.95,1]){
    const p=meshyHipAtTime(meshySitClipTime(weight));
    const o=meshySofaOffset(weight,1.07);
    assert.ok(Math.abs(p.x*1.07+o.x-.001*1.07)<1e-10);
    assert.ok(Math.abs(p.z*1.07+o.z+.027*1.07)<1e-10);
  }
  assert.throws(()=>meshySofaOffset(1,-1),RangeError);
  assert.throws(()=>meshySofaOffset(.5,NaN),RangeError);
});

test('corrected sitting underside rests above actual couch seat top',()=>{
  const placement=meshPlacement();
  const seatTop=SOFA_LAYOUT.seatCenterY+SOFA_LAYOUT.seatHeight/2;
  const underside=SOFA_POSE.y+placement.y+MESHY_SIT_CONTACT_LOCAL_Y*placement.scale;
  const lift=meshySofaVerticalLift(1,placement.scale,placement.y);
  assert.ok(lift>=0 && lift<.07);
  assert.ok(underside+lift>=seatTop+MESHY_SOFA_CLEARANCE_M-1e-9);
  assert.equal(meshySofaVerticalLift(0,placement.scale,placement.y),0);
  assert.ok(meshySofaVerticalLift(.5,placement.scale,placement.y)<lift);
  assert.throws(()=>meshySofaVerticalLift(1,-1,0),RangeError);
  assert.throws(()=>meshySofaVerticalLift(1,1,NaN),RangeError);
});
