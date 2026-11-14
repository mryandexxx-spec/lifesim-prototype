import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  createSeatSurface,seatSlot,solveSeatRoot,rotateSeatVector,blendSeatRoot,
  seatFootTargets,smoothContactWeight,solveTwoBoneTargets,seatGroundedAnkleTargets
} from '../src/interaction-anchors.js';
import {SOFA_LAYOUT} from '../src/pose-config.js';

const near=(actual,expected,epsilon=1e-8)=>
  assert.ok(Math.abs(actual-expected)<=epsilon,actual+' differs from '+expected);

function localToWorld(root,contact,scale,yaw) {
  const p=rotateSeatVector({x:contact.x*scale,y:contact.y*scale,z:contact.z*scale},yaw);
  return {x:root.x+p.x,y:root.y+p.y,z:root.z+p.z};
}

test('current built-in sofa derives contact height and approach from dimensions',()=>{
  const sofa=createSeatSurface({
    id:'living-sofa',origin:{x:SOFA_LAYOUT.x,y:0,z:SOFA_LAYOUT.z},yaw:180,
    width:SOFA_LAYOUT.seatWidth,depth:SOFA_LAYOUT.seatDepth,
    seatHeight:SOFA_LAYOUT.seatCenterY+SOFA_LAYOUT.seatHeight/2,slots:1
  });
  const slot=seatSlot(sofa,0);
  near(slot.contact.y,.35);
  near(slot.contact.x,SOFA_LAYOUT.x);
  near(slot.approach.z,SOFA_LAYOUT.z-(SOFA_LAYOUT.seatDepth/2+.50));
  near(slot.approach.y,0);
  assert.equal(slot.yaw,180);
});

test('two residents can take separate seats on an arbitrarily rotated couch',()=>{
  const sofa=createSeatSurface({
    id:'new-couch',origin:{x:4,y:0,z:-2},yaw:90,
    width:2.4,depth:.9,seatHeight:.48,slots:2,sideMargin:.36
  });
  const left=seatSlot(sofa,0),right=seatSlot(sofa,1);
  near(left.contact.y,.48);near(right.contact.y,.48);
  assert.notEqual(left.contact.z,right.contact.z);
  assert.equal(left.approach.y,0);
  assert.equal(left.id,'new-couch:0');
  assert.equal(right.id,'new-couch:1');
});

test('one solver fits two different avatars to different sofas, no avatar/sofa pair tweaks',()=>{
  const furniture=[
    createSeatSurface({id:'low-couch',origin:{x:1,y:0,z:2},yaw:180,
      width:1.8,depth:.78,seatHeight:.29}),
    createSeatSurface({id:'high-armchair',origin:{x:-4,y:0,z:3},yaw:-90,
      width:.86,depth:.96,seatHeight:.52})
  ];
  const avatars=[
    {contact:{x:.03,y:.48,z:.11},scale:1.21},
    {contact:{x:-.04,y:.57,z:-.07},scale:.97}
  ];
  for(const surface of furniture)for(const avatar of avatars){
    const seat=seatSlot(surface,0);
    const root=solveSeatRoot({
      seat,contactLocal:avatar.contact,scale:avatar.scale,clearance:.015
    });
    const point=localToWorld(root,avatar.contact,avatar.scale,seat.yaw);
    near(point.x,seat.contact.x);near(point.y,surface.seatHeight+.015);
    near(point.z,seat.contact.z);
  }
});

test('seat blend is continuous and respects both endpoints',()=>{
  const standing={x:0,y:0,z:0},seated={x:1,y:-.25,z:3};
  assert.deepEqual(blendSeatRoot({freeRoot:standing,seatedRoot:seated,weight:0}),standing);
  assert.deepEqual(blendSeatRoot({freeRoot:standing,seatedRoot:seated,weight:1}),seated);
  near(blendSeatRoot({freeRoot:standing,seatedRoot:seated,weight:.5}).y,-.125);
  near(smoothContactWeight(.25)+smoothContactWeight(.75),1);
  near(smoothContactWeight(-1),0);near(smoothContactWeight(9),1);
});

test('foot IK targets are calculated on the floor from the same seat transform',()=>{
  const couch=createSeatSurface({id:'sofa',origin:{x:1,y:0,z:2},yaw:180,
    width:1.8,depth:1.0,seatHeight:.36});
  const feet=seatFootTargets({seat:seatSlot(couch,0),halfStance:.17,forward:.50});
  assert.equal(feet.length,2);
  for(const f of feet)near(f.y,0);
  near(Math.hypot(feet[0].x-feet[1].x,feet[0].z-feet[1].z),.34);
  assert.ok(feet[0].z<2 && feet[1].z<2);
});

test('invalid surfaces or pose data fail fast, not silently warp a character',()=>{
  assert.throws(()=>createSeatSurface({id:'bad',origin:{x:0,y:0,z:0},
    width:1,depth:1,seatHeight:-.2}),RangeError);
  assert.throws(()=>createSeatSurface({id:'bad',origin:{x:0,y:0,z:0},
    width:1,depth:1,seatHeight:.2,slots:0}),RangeError);
  const s=createSeatSurface({id:'chair',origin:{x:0,y:0,z:0},
    width:1,depth:1,seatHeight:.3});
  assert.throws(()=>seatSlot(s,1),RangeError);
  assert.throws(()=>solveSeatRoot({seat:seatSlot(s,0),
    contactLocal:{x:0,y:1,z:0},scale:0}),RangeError);
  assert.throws(()=>solveSeatRoot({seat:seatSlot(s,0),
    contactLocal:{x:NaN,y:1,z:0},scale:1}),TypeError);
});

test('two-bone IK keeps limb lengths and places ankle on reachable foot target',()=>{
  const hip={x:0,y:.85,z:0},knee={x:0,y:.48,z:.15},ankle={x:0,y:.10,z:.20};
  const target={x:.08,y:.18,z:.20}; // Inside measured max extension (~0.78m).
  const res=solveTwoBoneTargets({hip,knee,ankle,target});
  assert.equal(res.reachable,true);
  const d=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
  near(d(res.knee,hip),res.lengthUpper,1e-8);
  near(d(res.knee,res.ankle),res.lengthLower,1e-8);
  near(d(res.ankle,target),0,1e-8);
});
test('two-bone IK clamps impossible foot targets instead of stretching bones',()=>{
  const hip={x:0,y:.80,z:0},knee={x:0,y:.40,z:.10},ankle={x:0,y:.10,z:.20};
  const target={x:0,y:0,z:4};
  const res=solveTwoBoneTargets({hip,knee,ankle,target});
  assert.equal(res.reachable,false);
  const d=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
  near(d(res.ankle,hip),.995*(res.lengthUpper+res.lengthLower));
  near(d(res.knee,res.ankle),res.lengthLower,1e-8);
  assert.throws(()=>solveTwoBoneTargets({hip,knee:hip,ankle,target}),RangeError);
});

test('Mixamo foot-side mapping respects anatomical left +X and right -X',()=>{
  const surf=createSeatSurface({id:'rig-sofa',origin:{x:0,y:0,z:0},
    width:2.0,depth:1.0,seatHeight:.38,yaw:0});
  const slot=seatSlot(surf,0);
  const [left,right]=seatFootTargets({seat:slot,halfStance:.18,
    forward:.44,sideSigns:[1,-1]});
  assert.ok(left.x>right.x,'Left bone uses positive local X in Mixamo');
  near(left.x,.18);near(right.x,-.18);
  assert.throws(()=>seatFootTargets({seat:slot,sideSigns:[1,1]}),RangeError);
});

test('sofa shoe targets are on floor just beyond seat FRONT EDGE, not under cushion',()=>{
  for(const depth of [.70,1.05,1.35]){
    const couch=createSeatSurface({
      id:'depth-'+depth,origin:{x:1.35,y:0,z:1.54},yaw:180,
      width:2.53,depth,seatHeight:.35,slots:1
    });
    const slot=seatSlot(couch,0);
    const feet=seatGroundedAnkleTargets({
      seat:slot,scale:2.05/1.7,halfStance:.16,
      soleDrops:[.15041,.14668],frontClearance:.09,
      sideSigns:[1,-1]
    });
    for(const foot of feet){
      assert.ok(foot.z<slot.front.z-.08,'shoe is ahead of cushion front');
      assert.ok(foot.y>.18&&foot.y<.21,'shoe sole height is grounded');
    }
    assert.ok(feet[0].x<feet[1].x,'Mixamo left and right feet do not cross');
    near(feet[1].x-feet[0].x,.32);
    assert.ok(slot.approach.z<feet[0].z,'walk approach remains in front of planted feet');
  }
});

test('optimized GLB seated bones can reach grounded shoe targets without moving game root',()=>{
  const sofa=createSeatSurface({
    id:'source-sofa',origin:{x:1.35,y:0,z:1.54},yaw:180,
    width:2.53,depth:1.05,seatHeight:.35
  });
  const seat=seatSlot(sofa,0);
  const scale=2.05/1.7;
  // Exact skinned bone origins at t=0 from meshy-casual-v1.glb; both shoes
  // originally sink ~15cm when the old game sofa root lowers by .225m.
  const data=[
    {h:[.08183475,.53698005,-.71941992],k:[.24037714,.50382335,-.39384406],
      a:[.14496716,.14261694,-.45998932]},
    {h:[-.11809682,.54384804,-.70488976],k:[-.25909585,.52770487,-.36689592],
      a:[-.19542703,.15453119,-.34033732]}
  ];
  const offset={x:(.001-(-.016573))*scale,z:(-.027-(-.738054))*scale};
  const baseY=-.225+(.02791073)*scale;
  const markerY=baseY+(.63078082-.20)*scale;
  const contactY=.35+.020;
  const rootY=baseY+(contactY-markerY);
  const bone=(v)=>{
    const r=rotateSeatVector({x:v[0]*scale+offset.x,y:v[1]*scale,z:v[2]*scale+offset.z},180);
    return {x:1.35+r.x,y:rootY+r.y,z:1.44+r.z};
  };
  const feet=seatGroundedAnkleTargets({seat,scale,soleDrops:[.15041,.14668],
    halfStance:.16,frontClearance:.09,sideSigns:[1,-1]});
  for(let i=0;i<2;i++){
    const hip=bone(data[i].h),knee=bone(data[i].k),ankle=bone(data[i].a);
    assert.ok(ankle.y<feet[i].y-.12,'original imported shoe is too far below floor');
    const forward=rotateSeatVector({x:0,y:0,z:.60},seat.yaw);
    const pole={x:hip.x+forward.x,y:hip.y-.30,z:hip.z+forward.z};
    const result=solveTwoBoneTargets({hip,knee,ankle,target:feet[i],pole,maxStretch:.995});
    assert.equal(result.reachable,true,'shoe target physically reachable for GLB leg');
    assert.ok(result.knee.y<hip.y+.06,'knee is not lifted unnaturally above hip');
    assert.ok(result.ankle.y>.18 && result.ankle.y<.21);
  }
});

test('an invalid sole marker or inverted feet pair cannot silently corrupt IK',()=>{
  const s=createSeatSurface({id:'chair',origin:{x:0,y:0,z:0},
    yaw:0,width:.8,depth:.7,seatHeight:.46});
  const seat=seatSlot(s,0);
  assert.throws(()=>seatGroundedAnkleTargets({seat,scale:1,soleDrops:[.15]}),RangeError);
  assert.throws(()=>seatGroundedAnkleTargets({seat,scale:1,sideSigns:[1,1]}),RangeError);
  assert.throws(()=>seatGroundedAnkleTargets({seat,scale:-2}),RangeError);
});
