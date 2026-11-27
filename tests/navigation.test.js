import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold} from '../src/household.js';
import {resolveActionFurniture,furnitureActionApproach} from '../src/furniture-catalog.js';
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

test('short furniture corner intersection cannot disappear when a segment is sampled at a different length',()=>{
  const world=newHousehold('2026-11-27').world;
  const hot={x:-.82254,z:.76341},corner={x:.02,z:.54};
  const item=resolveActionFurniture(world,'sofa',null);
  const goal=furnitureActionApproach(world,'sofa',item.instanceId);
  assert.ok(isWalkable(hot.x,hot.z,world));
  assert.ok(isWalkable(corner.x,corner.z,world));
  const dist=Math.hypot(corner.x-hot.x,corner.z-hot.z);
  const prefix={x:hot.x+(corner.x-hot.x)*.66/dist,z:hot.z+(corner.z-hot.z)*.66/dist};
  assert.ok(isWalkable(prefix.x,prefix.z,world));
  assert.equal(isClearLine(hot,corner,world),false,'full corner-crossing segment');
  assert.equal(isClearLine(corner,hot,world),false,'reverse segment');
  assert.equal(isClearLine(hot,prefix,world),false,'actual movement prefix');
  const route=findPath(hot,goal,world);
  assert.ok(route?.length,'safe alternative to the sofa');
  let prev=hot;
  for(const next of route){
    assert.ok(isClearLine(prev,next,world));
    for(let i=0;i<=100;i++){
      const t=i/100,p={x:prev.x+(next.x-prev.x)*t,z:prev.z+(next.z-prev.z)*t};
      assert.ok(isWalkable(p.x,p.z,world),'fine path sample');
      assert.ok(isClearLine(prev,p,world),'every prefix must remain valid');
    }
    prev=next;
  }
  assert.deepEqual(prev,goal);
});

// Deterministic open three-metre lane with clearance on both sides. Fixture
// selection uses only static walkability, never the candidate avoidance result.
function openLane(world){
  for(let x=4;x<=10;x+=.5)for(let z=-2;z<=2;z+=.5){
    const from={x,z},goal={x:x+2.6,z},peer={x:x+1.3,z};
    if(![-.9,0,.9].every(d=>isClearLine({x,z:z+d},{x:x+2.6,z:z+d},world)))continue;
    if(![x,x+1.3,x+2.6].every(xx=>isClearLine({x:xx,z:z-.9},{x:xx,z:z+.9},world)))continue;
    return {from,goal,peer};
  }
  throw Error('starter lot has no open lane fixture');
}

test('A* transient segment constraint bypasses a peer without poisoning static grid',()=>{
  const world=newHousehold('2026-11-27').world;
  for(const layout of [null,world]){
    const {from,goal,peer}=openLane(layout);
    const clear=(a,b)=>{
      const dx=b.x-a.x,dz=b.z-a.z,n=dx*dx+dz*dz;
      const t=n?Math.max(0,Math.min(1,((peer.x-a.x)*dx+(peer.z-a.z)*dz)/n)):0;
      return Math.hypot(a.x+dx*t-peer.x,a.z+dz*t-peer.z)>=.505;
    };
    assert.deepEqual(findPath(from,goal,layout),[goal]);
    assert.equal(clear(from,goal),false);
    const route=findPath(from,goal,layout,clear);
    assert.ok(route?.length>1,'existing A* must find an actual bypass');
    let prev=from;
    for(const next of route){
      assert.ok(isClearLine(prev,next,layout)&&clear(prev,next),'every edge respects both constraints');
      prev=next;
    }
    assert.deepEqual(prev,goal);
    assert.equal(findPath(from,peer,layout,clear),null,'occupied endpoint is not a reachable route');
    assert.deepEqual(findPath(from,goal,layout),[goal],'transient peer cannot contaminate the static cache');
  }
});
