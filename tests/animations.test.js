import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnimationState,stepAnimation,applyCharacterAnimation} from '../src/animations.js';
import {createCharacterRig} from '../src/characters.js';
import {SOFA_HIP_PITCH} from '../src/pose-config.js';
import {newHousehold,loadHousehold} from '../src/household.js';

const at=(x={})=>({...{walking:false,using:null,social:null,gait:0,mood:68,energy:70,id:'alex'},...x});
test('transition into walk is smooth, then naturally settles in idle',()=>{
  let a=createAnimationState();
  const first=stepAnimation(a,at({walking:true,gait:Math.PI/2}),.016);
  assert.ok(first.legs[0]<0 && first.legs[0]>-10);
  assert.ok(Math.abs(first.legs[1])<10);
  a=first;
  for(let i=0;i<35;i++)a=stepAnimation(a,at({walking:true,gait:Math.PI/2}),.016);
  assert.ok(a.legs[0]<-14 && a.legs[0]>-45);
  const stop=stepAnimation(a,at(),.016);
  assert.ok(stop.legs[0]<0 && stop.legs[0]>a.legs[0]);
});
test('sit, shower, fridge and bed poses converge without snapping',()=>{
  const scenarios=[
    ['sofa',p=>p.legs[0]<-60&&p.legs[1]<-60&&p.knees[0]>60&&p.knees[1]>60],
    ['fridge',p=>p.arms[1]<-30],
    ['shower',p=>p.arms[0]>19],
    ['bed',p=>p.eyeOpen<.2]
  ];
  for(const [id,check] of scenarios){
    let a=createAnimationState();
    a=stepAnimation(a,at({using:id}),.016);
    assert.ok(Math.abs(a.arms[0])<=40);
    for(let i=0;i<110;i++)a=stepAnimation(a,at({using:id}),.016);
    assert.ok(check(a),id+' pose should converge');
  }
});
test('talk and argue create different gestures, both gradual and non-synchronous',()=>{
  let a=createAnimationState(),b=createAnimationState();
  for(let i=0;i<90;i++){
    a=stepAnimation(a,at({social:'talk',id:'alex'}),.016);
    b=stepAnimation(b,at({social:'argue',id:'mira'}),.016);
  }
  assert.ok(b.arms[0]>a.arms[0]+3);
  assert.ok(b.brow>a.brow);
});
test('mood expression changes brows, mouth and eyes without altering state model',()=>{
  let happy=createAnimationState(),sad=createAnimationState();
  const original=newHousehold();
  const snapshot=JSON.stringify(original);
  for(let i=0;i<55;i++){
    happy=stepAnimation(happy,at({mood:95}),.016);
    sad=stepAnimation(sad,at({mood:20}),.016);
  }
  assert.ok(happy.mouthWidth>sad.mouthWidth);
  assert.ok(happy.brow<sad.brow);
  assert.equal(JSON.stringify(original),snapshot);
  assert.equal(loadHousehold(JSON.parse(snapshot)).version,1);
});
test('pause freezes animator and invalid or extreme dt cannot cause jumps',()=>{
  const a=createAnimationState();
  assert.equal(stepAnimation(a,at({walking:true}),0),a);
  assert.equal(stepAnimation(a,at({walking:true}),Number.NaN),a);
  const b=stepAnimation(a,at({using:'sofa'}),5);
  assert.ok(b.legs[0]<0 && b.legs[0]>SOFA_HIP_PITCH);
  assert.ok(b.time<=.06);
});
test('every returned pose remains finite even with malformed mood inputs',()=>{
  let a=createAnimationState();
  for(let i=0;i<70;i++)a=stepAnimation(a,at({mood:Infinity,gait:NaN}),.016);
  assert.ok([...a.legs,...a.arms,a.torso,a.brow,a.mouthHeight,a.eyeOpen].every(Number.isFinite));
  assert.ok(a.eyeOpen>=0&&a.eyeOpen<=1);
});
test('rig transforms apply to existing pivots, eye groups and face without new meshes',()=>{
  class Entity{
    constructor(name){this.name=name;this.children=[];this.enabled=true;}
    addChild(v){this.children.push(v);}
    setLocalPosition(x,y,z){this.position={x,y,z};}
    setLocalEulerAngles(x,y,z){this.rotation=[x,y,z];}
    setLocalScale(x,y,z){this.scale=[x,y,z];}
  }
  const root=new Entity('root'),made=[];
  const shape=(type)=>(name,x,y,z,sx,sy,sz,mat,parent=root)=>{
    const obj=new Entity(name);obj.setLocalPosition(x,y,z);
    obj.setLocalScale(sx,sy,sz);parent.addChild(obj);made.push(obj);return obj;
  };
  const ctx={pc:{Entity},root,ball:shape('ball'),box:shape('box'),
    cylinder:shape('cyl'),mat:(x)=>x,materials:{
      black:'black',cream:'cream',yellow:'yellow',green:'green'}};
  const rigs=[createCharacterRig(ctx,'alex'),createCharacterRig(ctx,'mira')];
  const count=made.length;
  for(const rig of rigs){
    const pose=stepAnimation(createAnimationState(),at({mood:20,social:'argue'}),.06);
    applyCharacterAnimation(rig,pose);
    assert.equal(rig.legPivot[0].rotation[0],pose.legs[0]);
    assert.equal(rig.kneePivot[0].rotation[0],pose.knees[0]);
    assert.equal(rig.armPivot[1].rotation[0],pose.arms[1]);
    assert.equal(rig.mouth.scale[0],pose.mouthWidth);
    assert.equal(rig.brows.length,2);
    assert.ok(rig.leftEye.scale[1]<=1);
  }
  assert.equal(made.length,count,'transforms must not allocate geometry per frame');
});
