import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {outdoorFeatureRect} from '../src/outdoor-catalog.js';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');

test('garden bench turns quarter rounds with truthful footprint bounds',()=>{
  const sample={itemId:'garden.bench',x:0,z:0,yaw:0};
  const box=(yaw)=>outdoorFeatureRect({...sample,yaw});
  assert.ok(box(0));
  const size=(rect)=>[rect.maxX-rect.minX,rect.maxZ-rect.minZ];
  const [w,d]=size(box(0));
  assert.ok(w>d);
  const [w90,d90]=size(box(90));
  assert.equal(w90,d);assert.equal(d90,w);
  assert.deepEqual(size(box(180)),[w,d]);
  assert.deepEqual(size(box(270)),[d,w]);
});
test('outdoor phone editor exposes actual yaw and confirmation steps',()=>{
  assert.match(html,/id="outdoor-feature-angle"/);
  assert.match(html,/id="outdoor-feature-rotate"/);
  assert.match(html,/Участок.*Мебель и свет/);
  assert.match(html,/Поверни.*90.*подтверд/);
  assert.match(css,/#outdoor-feature-rotate\s*\{/);
  assert.match(css,/min-height:\s*44px/);
});
test('rotation preview displays current yaw and keeps existing geometric proposal gate',()=>{
  assert.match(game,/outdoorYaw=\(outdoorYaw\+90\)%360/);
  assert.match(game,/\$\('outdoor-feature-angle'\)\.textContent/);
  assert.match(game,/previewOutdoorObject\(outdoorPose\)/);
  assert.match(game,/commitOutdoorFeatureEdit\(game,p\)/);
});
