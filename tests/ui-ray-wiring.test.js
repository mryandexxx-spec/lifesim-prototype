import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const src=read('../src/game.js'),html=read('../index.html'),css=read('../styles.css');
test('UI3 camera ray uses CSS pixels instead of projected screen ellipses',()=>{
  assert.match(src,/camera\.camera\.screenToWorld\(x,y,camera\.camera\.nearClip\)/);
  assert.match(src,/camera\.camera\.screenToWorld\(x,y,camera\.camera\.farClip\)/);
  assert.match(src,/return pickWorldRayTarget\(near,far,\[\.\.\.residents,\.\.\.hitVolumes\]\)/);
  assert.ok(!src.includes('const projectedObject='));
});
test('UI3 registers each interactive object by geometry and allows future pieces',()=>{
  assert.match(src,/const registerHitVolume=\(id,kind,x,y,z,sx,sy,sz\)=>/);
  for(const id of ['bed','fridge','sofa','shower','toilet'])
    assert.ok(src.includes("touchBox('"+id+"'"),id+' is registered');
  assert.ok(src.includes("blockerBox('coffee table top'"));
});
test('UI3 tests only non-selected 3D residents and honors shower privacy',()=>{
  assert.match(src,/if\(id===game\.selectedSim\|\|!reactionRigs\[id\]\|\|showerStates\[id\]\?\.active\|\|[\s\S]*toiletStates\[id\]\?\.active\)continue/);
  assert.match(src,/for\(const id of HOUSEHOLD_IDS\)/);
  assert.match(src,/if\(target\?\.kind==='resident'\)openSocialContext\(\)/);
});
test('UI3 world tap gives transient, nonblocking feedback and guidance',()=>{
  assert.match(html,/id="world-tap-cue"[^>]+aria-hidden="true" hidden/);
  assert.match(src,/if\(target\)confirmWorldTap\(pos\)/);
  assert.match(css,/\.world-tap-cue\{[^}]*pointer-events:none/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(src,/МЕТКИ — названия предметов/);
});
