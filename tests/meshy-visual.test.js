import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  MESHY_ASSET_URL, MESHY_DISPLAY_HEIGHT, MESHY_VISUAL_KEY,
  REQUIRED_MESHY_CLIPS,meshVisualPreference,meshClipFor,canShowMeshy,
  availableMeshClips
} from '../src/meshy-visual-policy.js';

test('Meshy is an opt-out visual mode; legacy and URL overrides are supported',()=>{
  assert.equal(meshVisualPreference(null),true);
  assert.equal(meshVisualPreference('meshy'),true);
  assert.equal(meshVisualPreference('legacy'),false);
  assert.equal(meshVisualPreference('legacy','meshy'),true);
  assert.equal(meshVisualPreference('meshy','legacy'),false);
  assert.equal(MESHY_VISUAL_KEY,'lifesim.meshyVisual.v1');
});

test('only safe free locomotion and social states show the experimental mesh',()=>{
  const standard={preferred:true,ready:true};
  assert.equal(canShowMeshy(standard),true);
  assert.equal(canShowMeshy({...standard,ready:false}),false);
  assert.equal(canShowMeshy({...standard,preferred:false}),false);
  for(const actionId of ['bed','sofa','fridge','shower'])
    assert.equal(canShowMeshy({...standard,actionId}),false,actionId);
  for(const gate of ['sofaBusy','bedBusy','showerBusy','fridgeBusy'])
    assert.equal(canShowMeshy({...standard,[gate]:true}),false,gate);
  assert.equal(canShowMeshy({...standard,actionId:null}),true);
});

test('Meshy clip mapping matches actual semantic states, not fabricated clip names',()=>{
  assert.equal(meshClipFor({}),'Idle_3');
  assert.equal(meshClipFor({walking:true}),'Walking');
  assert.equal(meshClipFor({social:'talk'}),'Listening_Gesture');
  assert.equal(meshClipFor({social:'argue'}),'Stand_Talking_Angry');
  assert.equal(meshClipFor({walking:true,social:'talk'}),'Walking');
  assert.equal(availableMeshClips(REQUIRED_MESHY_CLIPS),true);
  assert.equal(availableMeshClips(['Idle_3','Walking']),false);
});

test('production asset path, height and file contract match validated Meshy GLB',()=>{
  assert.equal(MESHY_ASSET_URL,'./assets/characters/meshy-casual-v1.glb');
  assert.equal(MESHY_DISPLAY_HEIGHT,1.78);
  const glb=readFileSync(new URL('../assets/characters/meshy-casual-v1.glb',import.meta.url));
  assert.equal(glb.readUInt32LE(0),0x46546c67);
  assert.equal(glb.readUInt32LE(4),2);
  assert.equal(glb.readUInt32LE(8),glb.length);
  const jsonSize=glb.readUInt32LE(12);
  assert.equal(glb.readUInt32LE(16),0x4e4f534a);
  const model=JSON.parse(glb.subarray(20,20+jsonSize).toString('utf8'));
  assert.equal(model.animations.length,10);
  assert.equal(model.skins[0].joints.length,66);
  assert.equal(model.meshes.length,1);
  assert.ok(REQUIRED_MESHY_CLIPS.every(name=>model.animations.some(a=>a.name===name)));
  assert.equal(model.images[0].mimeType,'image/jpeg');
});
