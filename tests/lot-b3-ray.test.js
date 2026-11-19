/** LOT-B3: true 3D bench ray-picking never bypasses blockers. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {pickWorldRayTarget} from '../src/world-interactions.js';
const near={x:0,y:1,z:-4},far={x:0,y:1,z:8};
const bounds=(z0,z1)=>({min:{x:-.8,y:.4,z:z0},max:{x:.8,y:1.7,z:z1}});
test('B3 a bench is a selectable outdoor target with its canonical instance ID',()=>{
  assert.deepEqual(pickWorldRayTarget(near,far,[{
    kind:'outdoor',id:'bench',instanceId:'out-2',bounds:bounds(0,1)
  }]),{kind:'outdoor',id:'bench',instanceId:'out-2'});
  assert.equal(pickWorldRayTarget(near,far,[
    {kind:'blocker',id:'covered',bounds:bounds(-1,-.4)},
    {kind:'outdoor',id:'bench',instanceId:'out-2',bounds:bounds(0,1)}
  ]),null);
});
