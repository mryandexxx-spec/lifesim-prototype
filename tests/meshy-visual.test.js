import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  MESHY_ASSET_URL, MESHY_DISPLAY_HEIGHT, MESHY_VISUAL_KEY, meshPlacement,
  MESHY_SOURCE_BOUNDS, MESHY_IDLE_FOOT_LOCAL_Y,
  REQUIRED_MESHY_CLIPS,meshVisualPreference,meshSeatRuntimeSettings,meshClipFor,canShowMeshy,
  availableMeshClips,ALEX_GREETING_CLIP,ALEX_GREETING_WINDOW_MINUTES,
  alexGreetingClipTime
} from '../src/meshy-visual-policy.js';

test('Meshy is an opt-out visual mode; legacy and URL overrides are supported',()=>{
  assert.equal(meshVisualPreference(null),true);
  assert.equal(meshVisualPreference('meshy'),true);
  assert.equal(meshVisualPreference('legacy'),false);
  assert.equal(meshVisualPreference('legacy','meshy'),true);
  assert.equal(meshVisualPreference('meshy','legacy'),false);
  assert.equal(MESHY_VISUAL_KEY,'lifesim.meshyVisual.v1');
});

test('Meshy sofa and guarded fridge/bed/shower gates preserve fallback',()=>{
  const standard={preferred:true,ready:true};
  assert.equal(canShowMeshy(standard),true);
  assert.equal(canShowMeshy({...standard,ready:false}),false);
  assert.equal(canShowMeshy({...standard,preferred:false}),false);
  assert.equal(canShowMeshy({...standard,actionId:'sofa'}),true);
  for(const actionId of ['bed','fridge','shower'])
    assert.equal(canShowMeshy({...standard,actionId}),false,actionId);
  assert.equal(canShowMeshy({...standard,actionId:'fridge',fridgeReady:true}),true);
  assert.equal(canShowMeshy({...standard,actionId:'fridge',fridgeReady:false}),false);
  assert.equal(canShowMeshy({...standard,fridgeReady:true,fridgeBusy:true}),true);
  assert.equal(canShowMeshy({...standard,fridgeReady:false,fridgeBusy:true}),false);
  assert.equal(canShowMeshy({...standard,actionId:'bed',bedReady:true}),true);
  assert.equal(canShowMeshy({...standard,actionId:'bed',bedReady:false}),false);
  assert.equal(canShowMeshy({...standard,bedBusy:true,bedReady:true}),true);
  assert.equal(canShowMeshy({...standard,bedBusy:true,bedReady:false}),false);
  assert.equal(canShowMeshy({...standard,actionId:'shower',bedReady:true}),false);
  assert.equal(canShowMeshy({...standard,actionId:'shower',showerReady:true}),true);
  assert.equal(canShowMeshy({...standard,actionId:'shower',showerReady:false}),false);
  assert.equal(canShowMeshy({...standard,showerBusy:true,showerReady:true}),true);
  assert.equal(canShowMeshy({...standard,showerBusy:true,showerReady:false}),false);
  assert.equal(canShowMeshy({...standard,showerBusy:true,showerReady:true,actionId:'shower',bedBusy:true}),false);
  assert.equal(canShowMeshy({...standard,sofaBusy:true}),true);
  for(const gate of ['bedBusy','showerBusy','fridgeBusy'])
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
  assert.ok(REQUIRED_MESHY_CLIPS.includes('Sit_to_Stand_Transition_M'));
});

test('production asset path, height and file contract match validated Meshy GLB',()=>{
  assert.equal(MESHY_ASSET_URL,'./assets/characters/meshy-casual-v1.glb');
  assert.equal(MESHY_DISPLAY_HEIGHT,2.05);
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
  const position=model.accessors[model.meshes[0].primitives[0].attributes.POSITION];
  for(const [i,k] of ['x','y','z'].entries()){
    assert.ok(Math.abs(position.min[i]-MESHY_SOURCE_BOUNDS.min[k])<.00001);
    assert.ok(Math.abs(position.max[i]-MESHY_SOURCE_BOUNDS.max[k])<.00001);
  }
  const fit=meshPlacement();
  assert.ok(fit.scale>1.2 && fit.scale<1.22);
  assert.ok(fit.y>.03 && fit.y<.04,'idle shoe is raised to floor contact');
});

test('GLB geometry-fit is stable independent of current animated skinned AABB',()=>{
  const a=meshPlacement(),b=meshPlacement();
  assert.deepEqual(a,b);
  assert.ok(Math.abs(MESHY_IDLE_FOOT_LOCAL_Y*a.scale+a.y)<1e-10);
  assert.ok(Math.abs((MESHY_SOURCE_BOUNDS.max.y-MESHY_SOURCE_BOUNDS.min.y)*a.scale-2.05)<1e-9);
  assert.throws(()=>meshPlacement(0),RangeError);
  assert.throws(()=>meshPlacement(NaN),RangeError);
});

test('0.7c regression: full XYZ remains disabled; guarded shoe planting has rollback',()=>{
  assert.deepEqual(meshSeatRuntimeSettings(null,null),{
    enabled:true,mode:'vertical',footIK:false,footPlant:true
  });
  assert.deepEqual(meshSeatRuntimeSettings('legacy','on'),{
    enabled:false,mode:'vertical',footIK:false,footPlant:false
  });
  assert.deepEqual(meshSeatRuntimeSettings('full','on'),{
    enabled:true,mode:'full',footIK:true,footPlant:false
  });
  assert.deepEqual(meshSeatRuntimeSettings('full',null),{
    enabled:true,mode:'full',footIK:false,footPlant:false
  });
  assert.deepEqual(meshSeatRuntimeSettings('unknown','on'),{
    enabled:true,mode:'vertical',footIK:false,footPlant:true
  });
  assert.deepEqual(meshSeatRuntimeSettings(null,null,'off'),{
    enabled:true,mode:'vertical',footIK:false,footPlant:false
  });
});

test('Alex uses a real one-shot greeting only for his own friendly conversation',()=>{
  assert.equal(ALEX_GREETING_CLIP,'Wave_One_Hand');
  assert.equal(ALEX_GREETING_WINDOW_MINUTES,3.6);
  assert.equal(alexGreetingClipTime({social:'talk',initiator:true,elapsed:0,duration:2.4}),0);
  assert.ok(Math.abs(alexGreetingClipTime({social:'talk',initiator:true,elapsed:1.8,duration:2.4})-1.2)<1e-10);
  for(const params of [
    {social:'argue',initiator:true,elapsed:0,duration:2.4},
    {social:'talk',initiator:false,elapsed:0,duration:2.4},
    {social:'talk',initiator:true,elapsed:3.6,duration:2.4},
    {social:'talk',initiator:true,elapsed:0,duration:0},
    {social:null,initiator:true,elapsed:0,duration:2.4}
  ])assert.equal(alexGreetingClipTime(params),null);
});
