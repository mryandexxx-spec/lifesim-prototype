import test from 'node:test';
import assert from 'node:assert/strict';
import {percentile,distribution,summarizeFrames,summarizeAssetResources} from '../scripts/qsk-03-metrics.mjs';

test('QSK-03 percentile uses nearest rank and retains null for unavailable metrics',()=>{
  assert.equal(percentile([9,5,7,1,3],.5),5);
  assert.equal(percentile([9,5,7,1,3],.95),9);
  assert.equal(percentile([null,undefined,NaN,Infinity],.95),null);
  assert.equal(percentile([0,3,2],.5),2);
  assert.throws(()=>percentile([1],1.1),RangeError);
  assert.deepEqual(distribution([null,NaN,3,7]),{samples:2,p50:3,p95:7,max:7});
});

test('QSK-03 reports unavailable engine GPU/CPU stats instead of synthetic zeros',()=>{
  const s=summarizeFrames([{rafIntervalMs:16,frameTimeMs:20,drawCalls:50,cpuUpdateMs:null},
    {rafIntervalMs:33,frameTimeMs:30,drawCalls:60,cpuUpdateMs:0.4}]);
  assert.equal(s.frameTimeMs.p95,30);
  assert.equal(s.rafIntervalMs.p95,33);
  assert.equal(s.drawCalls.p50,50);
  assert.equal(s.gpuFrameMs.samples,0);
  assert.equal(s.gpuFrameMs.p95,null);
  assert.equal(s.cpuUpdateMs.samples,1);
  assert.equal(s.cpuUpdateMs.p50,.4);
});

test('QSK-03 separates decoded asset bytes from cached transfer bytes and ignores query strings',()=>{
  const s=summarizeAssetResources([
    {name:'https://example.test/alex.glb?hash=1',decodedBodySize:1000,transferSize:1200},
    {name:'https://example.test/mira.GLB?hash=2',decodedBodySize:2000,transferSize:0},
    {name:'https://example.test/skin.webp?v=3',decodedBodySize:300,transferSize:150},
    {name:'https://example.test/game.js',decodedBodySize:800,transferSize:1000}
  ]);
  assert.deepEqual(s.glb,{requests:2,decodedBytes:3000,transferBytes:1200});
  assert.deepEqual(s.texture,{requests:1,decodedBytes:300,transferBytes:150});
  assert.equal(s.other.requests,1);
});
