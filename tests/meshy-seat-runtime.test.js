import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSkinnedSeatController} from '../src/meshy-seat-runtime.js';
import {meshPlacement,MESHY_SEAT_RIG_PROFILE} from '../src/meshy-visual-policy.js';
import {meshySofaOffset} from '../src/meshy-sofa-pose.js';
import {createSeatSurface,seatSlot,rotateSeatVector} from '../src/interaction-anchors.js';

const close=(a,b,tol=1e-6)=>assert.ok(Math.abs(a-b)<tol,`${a} differs from ${b}`);
class Vec3{
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
  length(){return Math.hypot(this.x,this.y,this.z);}
  normalize(){let n=this.length();if(n){this.x/=n;this.y/=n;this.z/=n;}return this;}
  dot(v){return this.x*v.x+this.y*v.y+this.z*v.z;}
}
class Quat{
  copy(){return this;}
  setFromDirections(){return this;}
  mul2(){return this;}
  slerp(){return this;}
}
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
function environment({yaw=180,withLegBones=false}={}){
  let boneRotations=0;
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
      if(name!==MESHY_SEAT_RIG_PROFILE.pelvisBone){
        if(!withLegBones)return null;
        const joints={
          'mixamorig:LeftUpLeg':[.08183475,.53698005,-.71941992],
          'mixamorig:LeftLeg':[.24037714,.50382335,-.39384406],
          'mixamorig:LeftFoot':[.14496716,.14261694,-.45998932],
          'mixamorig:RightUpLeg':[-.11809682,.54384804,-.70488976],
          'mixamorig:RightLeg':[-.25909585,.52770487,-.36689592],
          'mixamorig:RightFoot':[-.19542703,.15453119,-.34033732]
        };
        const p=joints[name];
        if(!p)return null;
        return {
          getPosition(){return model.getWorldTransform().transformPoint(
            new Vec3(p[0],p[1],p[2]));},
          getRotation(){return new Quat();},
          setRotation(){boneRotations++;}
        };
      }
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
  return {pc,model,avatar,seat,base,hipLocal,get boneRotations(){return boneRotations;}};
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

test('REGRESSION 0.7c: guarded pelvis placement never ejects Alex behind the couch',()=>{
  const env=environment({yaw:180});
  const controller=createSkinnedSeatController({
    pc:env.pc,model:env.model,avatar:env.avatar,
    profile:MESHY_SEAT_RIG_PROFILE,footIK:false
  });
  const moved=controller.placeVertical({
    seat:env.seat,weight:1,base:env.base,scale:env.base.scale,
    horizontalOffset:meshySofaOffset(1,env.base.scale)
  });
  const seatPoint=env.model.getWorldTransform().transformPoint({
    x:env.hipLocal.x+MESHY_SEAT_RIG_PROFILE.contact.x,
    y:env.hipLocal.y+MESHY_SEAT_RIG_PROFILE.contact.y,
    z:env.hipLocal.z+MESHY_SEAT_RIG_PROFILE.contact.z
  });
  close(seatPoint.y,env.seat.contact.y+MESHY_SEAT_RIG_PROFILE.clearance);
  // The X/Z of the *visible skinned body contact*, not the model origin,
  // must remain inside the actual seat rectangle during the entire pose.
  assert.ok(Math.abs(seatPoint.x-1.35)<1.0,'person left the sofa along X');
  assert.ok(seatPoint.z>1.015&&seatPoint.z<2.065,
    'person moved in front of or behind sofa: '+seatPoint.z);
  const oldOffset=meshySofaOffset(1,env.base.scale);
  close(moved.offset.x,oldOffset.x);
  close(moved.offset.z,oldOffset.z);
  assert.equal(moved.footChains,0,'untested foot IK must stay off');
});
test('guarded solver aligns two cushion heights but never adjusts horizontal placement',()=>{
  for(const height of [.29,.35,.52]){
    const env=environment({yaw:180});
    const contactSeat=seatSlot(createSeatSurface({
      id:'test-seat-'+height,origin:{x:1.35,y:0,z:1.54},
      yaw:180,width:2.53,depth:1.05,seatHeight:height
    }),0);
    const controller=createSkinnedSeatController({
      pc:env.pc,model:env.model,avatar:env.avatar,
      profile:MESHY_SEAT_RIG_PROFILE,footIK:false
    });
    const offset=meshySofaOffset(1,env.base.scale);
    const result=controller.placeVertical({
      seat:contactSeat,weight:1,scale:env.base.scale,
      base:env.base,horizontalOffset:offset
    });
    close(result.offset.x,offset.x);
    close(result.offset.z,offset.z);
    const contact=env.model.getWorldTransform().transformPoint({
      x:env.hipLocal.x+MESHY_SEAT_RIG_PROFILE.contact.x,
      y:env.hipLocal.y+MESHY_SEAT_RIG_PROFILE.contact.y,
      z:env.hipLocal.z+MESHY_SEAT_RIG_PROFILE.contact.z
    });
    close(contact.y,height+MESHY_SEAT_RIG_PROFILE.clearance);
  }
});
test('outlier pelvic transforms fail safely rather than moving the person metres away',()=>{
  const env=environment();
  const controller=createSkinnedSeatController({
    pc:env.pc,model:env.model,avatar:env.avatar,
    profile:MESHY_SEAT_RIG_PROFILE,footIK:false
  });
  const impossiblyHighSeat=seatSlot(createSeatSurface({
    id:'stool',origin:{x:1.35,y:0,z:1.54},yaw:180,
    width:2.53,depth:1.05,seatHeight:1.6
  }),0);
  assert.throws(()=>controller.placeVertical({
    seat:impossiblyHighSeat,weight:1,scale:env.base.scale,base:env.base,
    horizontalOffset:{x:0,z:0}
  }),RangeError);
  const idle=controller.placeVertical({
    seat:env.seat,weight:0,scale:env.base.scale,base:env.base,
    horizontalOffset:{x:0,z:0}
  });
  close(idle.offset.y,0);
});

test('guarded sofa foot planting plants the legs and preserves shoe orientation without relocating the root',()=>{
  const env=environment({withLegBones:true});
  const controlled=createSkinnedSeatController({
    pc:env.pc,model:env.model,avatar:env.avatar,
    profile:MESHY_SEAT_RIG_PROFILE,footIK:false,footPlant:true
  });
  assert.equal(controlled.validFootChains,2);
  const offset=meshySofaOffset(1,env.base.scale);
  const result=controlled.placeVertical({
    seat:env.seat,weight:1,base:env.base,scale:env.base.scale,
    horizontalOffset:offset
  });
  assert.equal(result.footChains,2,'both knees and ankles have reachable targets');
  assert.equal(env.boneRotations,6,'two thigh/shin chains plus both shoe orientations');
  close(result.offset.x,offset.x);
  close(result.offset.z,offset.z);
  assert.ok(result.offset.y>.0&&result.offset.y<.10);
});
test('legs=off keeps same safe cushion placement but performs no joint IK',()=>{
  const env=environment({withLegBones:true});
  const controlled=createSkinnedSeatController({
    pc:env.pc,model:env.model,avatar:env.avatar,
    profile:MESHY_SEAT_RIG_PROFILE,footIK:false,footPlant:false
  });
  const result=controlled.placeVertical({
    seat:env.seat,weight:1,base:env.base,scale:env.base.scale,
    horizontalOffset:meshySofaOffset(1,env.base.scale)
  });
  assert.equal(result.footChains,0);
  assert.equal(env.boneRotations,0);
});
test('foot planting is disabled while walking into or standing up from sofa',()=>{
  const env=environment({withLegBones:true});
  const controlled=createSkinnedSeatController({
    pc:env.pc,model:env.model,avatar:env.avatar,
    profile:MESHY_SEAT_RIG_PROFILE,footIK:false,footPlant:true
  });
  const result=controlled.placeVertical({
    seat:env.seat,weight:.55,base:env.base,scale:env.base.scale,
    horizontalOffset:meshySofaOffset(.55,env.base.scale)
  });
  assert.equal(result.footChains,0);
  assert.equal(env.boneRotations,0);
});
