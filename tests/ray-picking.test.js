import test from 'node:test';
import assert from 'node:assert/strict';
import {pickWorldRayTarget,rayBoxHit} from '../src/world-interactions.js';
const point=(x,y,z)=>({x,y,z});
const box=(id,z,kind='object',x=0)=>({id,kind,bounds:{
  min:point(x-.5,0,z-.5),max:point(x+.5,2,z+.5)}});
const start=point(0,1,5),end=point(0,1,-10);
test('ray returns nearest interactive surface, not an actor behind furniture',()=>{
  assert.deepEqual(pickWorldRayTarget(start,end,[
    box('alex',-2,'resident'),box('sofa',1)
  ]),{kind:'object',id:'sofa'});
});
test('resident in front wins rather than distant furniture',()=>{
  assert.deepEqual(pickWorldRayTarget(start,end,[
    box('sofa',-2),box('mira',1,'resident')
  ]),{kind:'resident',id:'mira'});
});
test('noninteractive occluder prevents clicking hidden bed through a table',()=>{
  assert.equal(pickWorldRayTarget(start,end,[
    box('bed',-3),box('table',1,'blocker')
  ]),null);
});
test('side angle and empty area do not select distant world objects',()=>{
  assert.deepEqual(pickWorldRayTarget(point(1,1,5),point(1,1,-10),[box('bed',1,'object',1)]),
    {kind:'object',id:'bed'});
  assert.equal(pickWorldRayTarget(point(5,1,5),point(5,1,-10),[box('bed',1)]),null);
});
test('parallel rays, in-box starts, behind-camera objects and invalid bounds are safe',()=>{
  assert.equal(rayBoxHit(point(0,1,0),point(0,1,0),box('x',0).bounds),null);
  assert.equal(rayBoxHit(point(0,1,5),point(0,1,6),box('x',0).bounds),null);
  assert.equal(rayBoxHit(point(0,1,1),point(0,1,-5),box('x',1).bounds),0);
  assert.equal(rayBoxHit(start,end,{min:point(1,0,0),max:point(-1,1,1)}),null);
  assert.equal(rayBoxHit(start,end,{min:point(NaN,0,0),max:point(1,1,1)}),null);
});
test('visibility and arbitrary stable resident IDs are respected',()=>{
  const obscured={...box('npc-999',1,'resident'),visible:false};
  assert.deepEqual(pickWorldRayTarget(start,end,[obscured,box('chair',-2)]),
    {kind:'object',id:'chair'});
  assert.deepEqual(pickWorldRayTarget(start,end,[box('npc-999',1,'resident')]),
    {kind:'resident',id:'npc-999'});
});
