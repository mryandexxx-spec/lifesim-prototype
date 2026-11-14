import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chooseIdleClip,isOneShotClip,characterFit,parseGlbHeader,summarizeClips,KNOWN_CLIPS,inspectGltf,formatAssetBytes} from '../src/character-lab-config.js';

test('meshys actual ten animation clip names are in the preview contract',()=>{
  assert.equal(KNOWN_CLIPS.length,10);
  assert.equal(chooseIdleClip(KNOWN_CLIPS),'Idle_3');
  assert.equal(chooseIdleClip(['Walking']),'Walking');
  assert.equal(chooseIdleClip([]),null);
});
test('sit-to-stand is one shot; locomotion loops',()=>{
  assert.equal(isOneShotClip('Sit_to_Stand_Transition_M'),true);
  assert.equal(isOneShotClip('Walking'),false);
});
test('bounds normalization fits model to scene without shifting origin as pose changes',()=>{
  const f=characterFit({min:{x:-.5,y:.1,z:-.2},max:{x:.5,y:1.1,z:.3}},1.8);
  assert.equal(f.scale,1.8);
  assert.ok(Math.abs(f.y+.18)<1e-8);
  assert.ok(Math.abs(f.z+.09)<1e-8);
  assert.throws(()=>characterFit({min:{x:0,y:1,z:0},max:{x:1,y:1,z:1}}));
});
test('GLB header rejects empty, malformed and mismatched binary',()=>{
  const buf=new ArrayBuffer(24);let dv=new DataView(buf);
  dv.setUint32(0,0x46546c67,true);dv.setUint32(4,2,true);dv.setUint32(8,24,true);
  assert.deepEqual(parseGlbHeader(buf),{version:2,bytes:24});
  dv.setUint32(8,20,true);assert.throws(()=>parseGlbHeader(buf));
  dv.setUint32(8,24,true);dv.setUint32(0,0,true);assert.throws(()=>parseGlbHeader(buf));
});
test('clip summary is deduplicated and preserves authoring order',()=>{
  assert.deepEqual(summarizeClips(['Idle_3','Idle_3','Sit_to_Stand_Transition_M']),[
    {name:'Idle_3',loop:true},{name:'Sit_to_Stand_Transition_M',loop:false}
  ]);
});


test('GLB metadata counts triangles for indexed and unindexed primitives',()=>{
  const meta=inspectGltf({
    accessors:[{count:6},{count:9},{count:120}],
    meshes:[{primitives:[{indices:0},{mode:4,attributes:{POSITION:1}},{mode:1,indices:2,targets:[{}]}]}],
    skins:[{joints:[1,2,3]}],animations:[{},{}],materials:[{}]
  });
  assert.deepEqual(meta,{triangles:5,joints:3,clips:2,materials:1,morphTargets:1});
});

test('metadata parsing rejects malformed shapes, sizes have neutral fallback',()=>{
  assert.throws(()=>inspectGltf(null));
  assert.throws(()=>inspectGltf({meshes:null}));
  assert.equal(formatAssetBytes(2278456),'2.28 МБ');
  assert.equal(formatAssetBytes(0),'—');
});