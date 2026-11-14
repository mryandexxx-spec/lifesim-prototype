import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSkinnedSeatController} from '../src/meshy-seat-runtime.js';
import {meshPlacement,MESHY_SEAT_RIG_PROFILE} from '../src/meshy-visual-policy.js';
import {createSeatSurface,seatSlot,rotateSeatVector} from '../src/interaction-anchors.js';

const close=(a,b,tol=1e-6)=>assert.ok(Math.abs(a-b)<tol,`${a} differs from ${b}`);
class Vec3{
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
  length(){return Math.hypot(this.x,this.y,this.z);}
  normalize(){let n=this.length();if(n){this.x/=n;this.y/=n;this.z/=n;}return this;}
  dot(v){return this.x*v.x+this.y*v.y+this.z*v.z;}
}
class Quat{}
class Mat4{
  copy(t){this.model=t.model;this.negative=t.negative;return this;}
  invert(){this.negative=!this.negative;return this;}
  transformPoint(p,out=new Vec3()){
    const m=this.model,scale=m.scale;
    const rel=rotateSeatVector({x:p.x*scale,y:p.y*scale,z:p.z*scale},m.avatar.yaw);
    const world=m.getPosition();
    if(!this.negative)return out.set(world.x+rel.x,world.y+rel.y,world.z+rel.z);
    const q=rotateSeatVector({x:p.x-world.x,y:p.y-world.y,z:p.z-world.z},-m.avatar.yaw);
    return out.set(q.x/scale,q.y/scale,q.z/scale);
  }
}
function environment({yaw=180}={}){
  const base=meshPlacement();
  const avatar={origin:{x:1.35,y:-.225,z:1.44},yaw,
    getEulerAngles(){return {y:this.yaw};}};
  const hipLocal={x:-.016573,y:.630781,z:-.738054};
  const model={
    avatar,scale:base.scale,local:{...base},
    setLocalPosition(x,y,z){this.local={x,y,z};},
    getLocalPosition(){return this.local;},
    getPosition(){
      const off=rotateSeatVector(this.local,avatar.yaw);
      return {x:avatar.origin.x+off.x,y:avatar.origin.y+off.y,z:avatar.origin.z+off.z};
    },
    getWorldTransform(){return Object.assign(new Mat4(),{model:this,negative:false});},
    setPosition(x,y,z){
      const off=rotateSeatVector({x:x-avatar.origin.x,y:y-avatar.origin.y,z:z-avatar.origin.z},-avatar.yaw);
      this.local={...off};
    },
    findByName(name){
      if(name!==MESHY_SEAT_RIG_PROFILE.pelvisBone)return null;
      return {getWorldTransform(){
        return {transformPoint(point,out){
          const local={x:hipLocal.x+point.x,y:hipLocal.y+point.y,z:hipLocal.z+point.z};
          return model.getWorldTransform().transformPoint(local,out);
        }};
      }};
    }
  };
  const seat=seatSlot(createSeatSurface({
    id:'test-sofa',origin:{x:1.35,y:0,z:1.54},yaw,
    width:2.53,depth:1.05,seatHeight:.35
  }),0);
  const pc={Vec3,Quat,Mat4};
  return {pc,model,avatar,seat,base,hipLocal};
}
test('runtime aligns current animated pelvis to world cushion anchor (no old root Y added)',()=>{
  const {pc,model,avatar,seat,base,hipLocal}=environment();
  const controller=createSkinnedSeatController({
    pc,model,avatar,profile:MESHY_SEAT_RIG_PROFILE,footIK:false
  });
  const result=controller.place({seat,weight:1,scale:base.scale,base});
  assert.equal(result.footChains,0);
  const point=model.getWorldTransform().transformPoint(
    {x:hipLocal.x+MESHY_SEAT_RIG_PROFILE.contact.x,
      y:hipLocal.y+MESHY_SEAT_RIG_PROFILE.contact.y,
      z:hipLocal.z+MESHY_SEAT_RIG_PROFILE.contact.z});
  close(point.x,seat.contact.x);
  close(point.z,seat.contact.z);
  close(point.y,seat.contact.y+MESHY_SEAT_RIG_PROFILE.clearance);
  assert.ok(Number.isFinite(result.offset.y));
});
test('same skinned controller works for another couch height, orientation, without retuning rig',()=>{
  const env=environment({yaw:90});
  const highSeat=seatSlot(createSeatSurface({
    id:'high-sofa',origin:{x:2.7,y:0,z:-1},yaw:90,
    width:1.8,depth:.92,seatHeight:.52
  }),0);
  const controller=createSkinnedSeatController({
    pc:env.pc,model:env.model,avatar:env.avatar,profile:MESHY_SEAT_RIG_PROFILE,
    footIK:false
  });
  controller.place({seat:highSeat,weight:1,scale:env.base.scale,base:env.base});
  const contact=env.model.getWorldTransform().transformPoint({
    x:env.hipLocal.x+MESHY_SEAT_RIG_PROFILE.contact.x,
    y:env.hipLocal.y+MESHY_SEAT_RIG_PROFILE.contact.y,
    z:env.hipLocal.z+MESHY_SEAT_RIG_PROFILE.contact.z
  });
  close(contact.x,highSeat.contact.x);
  close(contact.y,highSeat.contact.y+MESHY_SEAT_RIG_PROFILE.clearance);
  close(contact.z,highSeat.contact.z);
});
test('contact update is stable frame-to-frame, pause and reverse to free pose',()=>{
  const env=environment();
  const con=createSkinnedSeatController({pc:env.pc,model:env.model,
    avatar:env.avatar,profile:MESHY_SEAT_RIG_PROFILE,footIK:false});
  const first=con.place({seat:env.seat,weight:1,scale:env.base.scale,base:env.base});
  const second=con.place({seat:env.seat,weight:1,scale:env.base.scale,base:env.base});
  close(first.offset.x,second.offset.x);
  close(first.offset.y,second.offset.y);
  close(first.offset.z,second.offset.z);
  const half=con.place({seat:env.seat,weight:.5,scale:env.base.scale,base:env.base});
  assert.ok(Math.abs(half.offset.y)<Math.abs(first.offset.y));
  const free=con.place({seat:env.seat,weight:0,scale:env.base.scale,base:env.base});
  close(free.offset.y,0);
  close(free.offset.z,0);
});
test('invalid seat marker stays a detectable error, not NaN pose',()=>{
  const env=environment();
  const con=createSkinnedSeatController({pc:env.pc,model:env.model,
    avatar:env.avatar,profile:MESHY_SEAT_RIG_PROFILE,footIK:false});
  assert.throws(()=>con.place({seat:null,weight:1,scale:env.base.scale,base:env.base}),TypeError);
});
