import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  createSeatSurface,seatSlot,solveSeatRoot,rotateSeatVector,blendSeatRoot,
  seatFootTargets,smoothContactWeight
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
