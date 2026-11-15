import test from 'node:test';
import assert from 'node:assert/strict';
import {pickWorldTarget} from '../src/world-interactions.js';
const resident={kind:'resident',id:'mira',x:120,y:180,rx:35,ry:90};
const sofa={kind:'object',id:'sofa',x:120,y:225,rx:65,ry:35};
test('unlabelled world objects remain tappable by projected hit area',()=>{
  assert.deepEqual(pickWorldTarget(170,225,[sofa]),{kind:'object',id:'sofa'});
  assert.deepEqual(pickWorldTarget(30,30,[sofa]),null);
});
test('non-selected resident wins over overlapping furniture',()=>{
  assert.deepEqual(pickWorldTarget(120,215,[sofa,resident]),{kind:'resident',id:'mira'});
});
test('two nearby furniture anchors choose nearest in normalized screen space',()=>{
  assert.deepEqual(pickWorldTarget(120,225,[sofa,{...sofa,id:'bed',x:162}]),{kind:'object',id:'sofa'});
});
test('offscreen, malformed and invisible targets are ignored',()=>{
  assert.equal(pickWorldTarget(120,225,[{...sofa,visible:false}]),null);
  assert.equal(pickWorldTarget(120,225,[{...sofa,rx:0}]),null);
  assert.equal(pickWorldTarget(NaN,225,[sofa]),null);
});
test('selection never depends on the visible-label setting or names',()=>{
  assert.deepEqual(pickWorldTarget(120,225,[{...sofa,id:'new-furniture'}]),
    {kind:'object',id:'new-furniture'});
});
