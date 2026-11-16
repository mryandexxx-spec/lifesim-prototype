import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, newGame } from '../src/simulation.js';
import { findPath, isClearLine, isWalkable, nearestWalkable, FURNITURE } from '../src/navigation.js';

const destinations = Object.fromEntries(Object.entries(ACTIONS).filter(([id])=>id!=='hobby'&&id!=='music').map(([id, a]) => [id, {x:a.location[0],z:a.location[1]}]));

test('each interaction has a reachable stand point from initial position', () => {
  const from = newGame().position;
  for(const [id,to] of Object.entries(destinations)) {
    assert.ok(isWalkable(to.x,to.z), `${id} destination should be outside furniture`);
    const path=findPath(from,to);
    assert.ok(path?.length, `No route found to ${id}`);
    let prev=from;
    for(const next of path) {
      assert.ok(isClearLine(prev,next), `Collision on route to ${id} from ${JSON.stringify(prev)} to ${JSON.stringify(next)}`);
      prev=next;
    }
    assert.deepEqual(prev,to);
  }
});

test('all pairwise item routes avoid furniture', () => {
  for(const [startId,start] of Object.entries(destinations)) {
    for(const [endId,end] of Object.entries(destinations)) {
      if(startId===endId) continue;
      const path=findPath(start,end);
      assert.ok(path?.length, `${startId} -> ${endId} has no route`);
      let prev=start;
      for(const point of path) {assert.ok(isClearLine(prev,point),`${startId} -> ${endId} crosses furniture`);prev=point;}
    }
  }
});

test('collision geometry rejects bed, coffee table and blocked straight lines', () => {
  for(const name of ['bed','table','sofa','shower','fridge']) {
    const rect=FURNITURE.find(x=>x.id===name);
    assert.equal(isWalkable((rect.minX+rect.maxX)/2,(rect.minZ+rect.maxZ)/2), false);
  }
  assert.equal(isClearLine({x:-.4,z:-1.45}, {x:-4.3,z:-1.45}),false);
  assert.equal(isClearLine({x:-.5,z:0}, {x:3.4,z:0}), false);
});

test('repairs an old save position that intersects furniture', () => {
  const point=nearestWalkable({x:1.35,z:.15});
  assert.equal(isWalkable(point.x,point.z),true);
  const route=findPath(point,destinations.sofa);
  assert.ok(route?.length);
  assert.equal(findPath({x:0,z:0},{x:-2.62,z:-1.42}),null);
});
