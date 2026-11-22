import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,tickHousehold,loadHousehold} from '../src/household.js';
import {enqueueAction,pendingActions} from '../src/action-queue.js';
import {outdoorCellAt} from '../src/lot-surface.js';
import {poolSwimVisualFrame,POOL_WATER_LEVEL} from '../src/pool-swim-visual.js';
import {poolActionStatus,poolActivityLabel} from '../src/pool-touch-policy.js';
import {beginPoolSwim,arrivePoolApproach,requestPoolExit} from '../src/pool-swim-runtime.js';
import {createAnimationState,stepAnimation} from '../src/animations.js';

const base=outdoorCellAt(18.25,8.25);
const tiles=(w=4,h=4)=>Array.from({length:w*h},(_,i)=>base+Math.floor(i/w)*64+i%w).sort((a,b)=>a-b);
const ladder=(edgeCell=base,side='west',fixtureId='fixture-1')=>
 ({poolId:'pool-1',fixtureId,kind:'ladder',edgeCell,side,purchasePriceCredits:120});
function home({width=4,height=4,fixtures=[ladder()]}={}){
  const root=newHousehold();
  root.world.outdoors={...root.world.outdoors,revision:root.world.outdoors.revision+1,
    pools:[{poolId:'pool-1',cells:tiles(width,height)}],
    poolFixtures:fixtures};
  return root;
}
const actor=(root,id)=>id==='alex'?root:root.otherSim;
function start(root,id='alex'){
  const p=beginPoolSwim(root,id,{actionId:'swim',poolId:'pool-1'});
  assert.ok(p,'the pool has a valid dry approach and wet slot');
  actor(root,id).position={...p.action.dryApproach};
  assert.equal(arrivePoolApproach(root,id),true);
  for(let i=0;i<20&&actor(root,id).action?.stage!=='swimming';i++)tickHousehold(root,1);
  assert.equal(actor(root,id).action?.stage,'swimming');
  return actor(root,id).action;
}
const finite=frame=>Boolean(frame&&['x','y','z','yaw','pitch'].every(k=>
  Number.isFinite(frame[k])));
const copied=x=>JSON.parse(JSON.stringify(x));

test('D2c true 3D water frame derives from canonical D2b lane, not dry saved position',()=>{
  const root=home(),a=start(root);
  assert.ok(a.waterElapsed===0);
  const first=poolSwimVisualFrame(root.world,a);
  assert.ok(finite(first));
  assert.equal(first.stage,'swimming');
  assert.ok(first.immersed);
  assert.ok(first.y<POOL_WATER_LEVEL&&first.y>POOL_WATER_LEVEL-1.3);
  assert.ok(Math.hypot(first.x-root.position.x,first.z-root.position.z)>1);
  tickHousehold(root,1.25);
  const next=poolSwimVisualFrame(root.world,a);
  assert.ok(finite(next));
  assert.ok(Math.hypot(next.x-first.x,next.z-first.z)<=1.5);
  assert.equal(root.position.x,a.dryApproach.x,'render projection does not write canonical dry anchor');
});

test('D2c entering, waiting and climbing are reflected visually on actual waterline',()=>{
  const root=home();
  assert.equal(poolSwimVisualFrame(root.world,root.action),null);
  const p=beginPoolSwim(root,'alex',{poolId:'pool-1',actionId:'swim'});
  root.position={...p.action.dryApproach};
  arrivePoolApproach(root,'alex');
  assert.equal(poolSwimVisualFrame(root.world,root.action),null,'wait at real land position');
  tickHousehold(root,1);
  assert.equal(root.action.stage,'entering');
  const entry=poolSwimVisualFrame(root.world,root.action);
  assert.ok(finite(entry)&&entry.stage==='entering');
  tickHousehold(root,1);
  const moved=poolSwimVisualFrame(root.world,root.action);
  assert.ok(finite(moved));
  assert.ok(moved.y<=entry.y+1e-6);
  for(let i=0;i<20&&root.action?.stage!=='swimming';i++)tickHousehold(root,1);
  requestPoolExit(root,'alex','cancelled');
  assert.equal(root.action.stage,'exiting');
  const exit=poolSwimVisualFrame(root.world,root.action);
  assert.ok(finite(exit)&&exit.stage==='exiting');
  for(let i=0;i<70&&root.action;i++){
    const frame=poolSwimVisualFrame(root.world,root.action);
    if(frame)assert.ok(finite(frame));
    tickHousehold(root,1);
  }
  assert.equal(root.action,null);
  assert.equal(poolSwimVisualFrame(root.world,root.action),null);
});

test('D2c status supplies accessible unavailable reasons and detects long-run water state',()=>{
  const s=home();
  assert.equal(poolActionStatus(s,'alex','pool-1').available,true);
  s.needs.energy=29;
  assert.match(poolActionStatus(s,'alex','pool-1').reason,/сил/);
  s.needs.energy=85;s.needs.bladder=24;
  assert.match(poolActionStatus(s,'alex','pool-1').reason,/туалет/);
  s.needs.bladder=80;
  const noExit=home({fixtures:[]});
  assert.match(poolActionStatus(noExit,'alex','pool-1').reason,/лестницу/);
  const tiny=home({width:2,height:2});
  assert.equal(poolActionStatus(tiny,'alex','pool-1').available,false);
  start(s);
  assert.match(poolActionStatus(s,'alex','pool-1').reason,/уже плавает/);
  assert.match(poolActivityLabel(s.action),/Плавает/);
});

test('D2c two swimmers use independent read-only water frames with one shared ladder',()=>{
  const s=home();
  start(s,'alex');
  start(s,'mira');
  tickHousehold(s,3);
  const a=poolSwimVisualFrame(s.world,s.action);
  const b=poolSwimVisualFrame(s.world,s.otherSim.action);
  assert.ok(finite(a)&&finite(b));
  assert.notDeepEqual({x:a.x,z:a.z},{x:b.x,z:b.z});
  assert.equal(a.y,b.y);
});

test('D2c old save + empty pool + removed basin never generates a phantom render',()=>{
  const s=newHousehold();
  const old=loadHousehold(copied(s));
  assert.equal(poolSwimVisualFrame(old.world,old.action),null);
  const t=home();start(t);
  const snapshot=copied(t);
  const restored=loadHousehold(snapshot);
  assert.ok(finite(poolSwimVisualFrame(restored.world,restored.action)));
  restored.world.outdoors.pools=[];
  assert.equal(poolSwimVisualFrame(restored.world,restored.action),null);
});

test('D2c procedural swim controls animate opposite limbs without simulation mutation',()=>{
  const prev=createAnimationState();
  const pose=stepAnimation(prev,{id:'alex',using:'swim',swimStage:'swimming',
    swimStroke:2.2,mood:70,energy:70},.04);
  assert.ok(pose.arms.every(Number.isFinite));
  assert.ok(Math.abs(pose.arms[0]-pose.arms[1])>.1);
  assert.deepEqual(prev,createAnimationState());
  const waiting=stepAnimation(pose,{using:'swim',swimStage:'waiting',
    swimStroke:3,mood:70,energy:70},.04);
  assert.ok(waiting.legs.every(Number.isFinite));
});

test('one lap visits both lengths of the reserved lane with continuous orientation',()=>{
  for(const [width,height] of [[4,2],[2,4]]){
    const root=home({width,height}),a=start(root);
    const visited=new Set();
    let previous=poolSwimVisualFrame(root.world,a);
    for(let i=0;i<160;i++){
      tickHousehold(root,.05);
      visited.add(a.waterCell);
      const frame=poolSwimVisualFrame(root.world,a);
      const turn=Math.abs((frame.yaw-previous.yaw+540)%360-180);
      assert.ok(turn<18,'sudden reversal: '+turn);
      previous=frame;
    }
    assert.equal(visited.size,8);
  }
});

test('springboard entry rises above deck before feet-first immersion',()=>{
  const root=home(),p=beginPoolSwim(root,'alex',{poolId:'pool-1',actionId:'swim'});
  const a={...p.action,stage:'entering',entryKind:'board'};
  const sample=t=>poolSwimVisualFrame(root.world,{...a,elapsed:t*2});
  assert.ok(sample(.55).y>sample(0).y+.6);
  assert.ok(sample(.55).pitch<25);
  assert.equal(sample(.55).immersed,false);
  assert.ok(sample(.9).immersed);
  assert.ok(sample(1).pitch>=65);
});
