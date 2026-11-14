import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {advanceVisualGait,WALK_PHASE_PER_METER,gaitTargets} from '../src/locomotion.js';
import {createAnimationState,stepAnimation} from '../src/animations.js';
import {newHousehold,loadHousehold} from '../src/household.js';

const near=(a,b,e=1e-8)=>Math.abs(a-b)<=e;
const origin={x:0,z:0};

test('free walk advances stride from displayed metres, not leading logical position',()=>{
  const shown={x:.12,z:0},simulation={x:.25,z:0};
  const r=advanceVisualGait(2.5,origin,shown,true);
  assert.ok(near(r.distance,.12));
  assert.ok(near(r.phase,2.5+.12*WALK_PHASE_PER_METER));
  assert.ok(!near(r.phase,2.5+simulation.x*WALK_PHASE_PER_METER));
  assert.ok(near(r.heading,90));
});
test('eased motion matches root distance exactly for both x1 and x3 speeds at 30/60/120 fps',()=>{
  for(const speed of [1,3])for(const fps of [30,60,120]){
    let phase=0,logical=0,display=0;
    const dt=1/fps,k=1-Math.exp(-11*dt);
    for(let i=0;i<Math.ceil(fps*1.8);i++){
      logical+=1.65*speed*dt;
      const prev=display;
      display+=(logical-display)*k;
      const r=advanceVisualGait(phase,{x:prev,z:0},{x:display,z:0},true);
      phase=r.phase;
      assert.ok(near(phase,display*WALK_PHASE_PER_METER,1e-7),
        'stride phase must match the displayed root at '+speed+'x / '+fps+' fps');
      assert.ok(near(r.heading,90));
    }
    assert.ok(logical>display,'simulation leads visible root at '+speed+'x');
  }
});
test('turning to another A-star segment uses visible vector heading instead of new distant waypoint',()=>{
  let p=0,previous=origin;
  for(const to of [{x:.11,z:0},{x:.17,z:.06},{x:.19,z:.15},{x:.19,z:.27}]){
    const r=advanceVisualGait(p,previous,to,true);
    assert.ok(r.phase>p);
    assert.ok(Number.isFinite(r.heading));
    assert.ok(near(r.heading,Math.atan2(to.x-previous.x,to.z-previous.z)*180/Math.PI));
    p=r.phase;previous=to;
  }
  assert.ok(near(p,(.11+Math.hypot(.06,.06)+Math.hypot(.02,.09)+.12)*WALK_PHASE_PER_METER));
});
test('pause and stationary frame never move stride clock or rotate the heading',()=>{
  const last=advanceVisualGait(2.1,{x:1,z:-2},{x:2,z:-2},false);
  assert.deepEqual(last,{phase:2.1,heading:null,distance:0});
  assert.deepEqual(advanceVisualGait(2.1,origin,origin,true),last);
  assert.deepEqual(advanceVisualGait(2.1,origin,{x:0,z:0},false),last);
});
test('reset, teleport, invalid position or invalid state never triggers a burst of walk frames',()=>{
  for(const [start,end] of [
    [origin,{x:1,z:0}], [origin,{x:0,z:NaN}],
    [origin,{x:Infinity,z:0}],[null,origin],[origin,null]
  ]){
    const r=advanceVisualGait(5,start,end,true);
    assert.equal(r.phase,5);assert.equal(r.heading,null);assert.equal(r.distance,0);
  }
  assert.ok(Number.isFinite(advanceVisualGait(NaN,origin,{x:.1,z:.1}).phase));
});
test('gait phase continues across successive waypoints with no per-turn reset',()=>{
  const a=advanceVisualGait(0,origin,{x:.2,z:0});
  const b=advanceVisualGait(a.phase,{x:.2,z:0},{x:.2,z:.17});
  assert.ok(near(b.phase,.37*WALK_PHASE_PER_METER));
  assert.ok(near(a.heading,90));
  assert.ok(near(b.heading,0));
  assert.equal(b.distance,.17);
  assert.ok(Math.abs(gaitTargets(b.phase,1).arms[0])<=20);
});
test('independent Alex and Mira travel without sharing phase or touching v1 saves',()=>{
  const original=newHousehold(),serialized=JSON.stringify(original);
  const alex=advanceVisualGait(1.3,origin,{x:.12,z:0});
  const mira=advanceVisualGait(2.7,origin,{x:0,z:.24});
  assert.notEqual(alex.phase,mira.phase);
  const a=stepAnimation(createAnimationState(),{id:'alex',walking:true,gait:alex.phase},.016);
  const m=stepAnimation(createAnimationState(),{id:'mira',walking:true,gait:mira.phase},.016);
  assert.notDeepEqual(a.legs,m.legs);
  assert.equal(JSON.stringify(original),serialized);
  assert.equal(loadHousehold(JSON.parse(serialized)).version,1);
});
test('renderer binds both resident phases after xz smoothing and retains shower-specific gait',()=>{
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const locomotion=readFileSync(new URL('../src/locomotion.js',import.meta.url),'utf8');
  assert.ok(game.includes('const alexMotion=advanceVisualGait(gait,previousAlexXZ,display,'));
  assert.ok(game.includes('const miraMotion=advanceVisualGait(miraGait,previousMiraXZ,miraDisplay,'));
  assert.ok(game.includes('if(alexMotion.heading!==null)'));
  assert.ok(game.includes('if(miraMotion.heading!==null)'));
  assert.ok(!game.includes('gait+=step*WALK_PHASE_PER_METER'));
  assert.ok(!game.includes('miraGait+=step*WALK_PHASE_PER_METER'));
  assert.ok(game.includes('alexShower.gaitMeters*WALK_PHASE_PER_METER'));
  assert.ok(game.includes('miraShower.gaitMeters*WALK_PHASE_PER_METER'));
  assert.ok(locomotion.includes('distance>.4'));
});
