import test from 'node:test';
import assert from 'node:assert/strict';
import {WALK_PHASE_PER_METER,gaitTargets,gaitGroundOffset} from '../src/locomotion.js';
import {createAnimationState,stepAnimation,applyCharacterAnimation} from '../src/animations.js';
import {createCharacterRig} from '../src/characters.js';
import {newHousehold,loadHousehold} from '../src/household.js';

const near=(a,b,eps=.0001)=>Math.abs(a-b)<eps;
const walk=(id='alex',phase=Math.PI/2)=>({id,walking:true,gait:phase,mood:65,energy:70});

test('stride cycle is tied to metres, not frame count or speed preset',()=>{
  const metres=2.1;
  const phase=metres*WALK_PHASE_PER_METER;
  assert.ok(near(gaitTargets(phase,1).hips[0],gaitTargets((metres/3)*WALK_PHASE_PER_METER*3,1).hips[0]));
  assert.ok(WALK_PHASE_PER_METER>6&&WALK_PHASE_PER_METER<9);
});

test('opposite legs and arms swing; forward knee bends, toes lift',()=>{
  const p=gaitTargets(Math.PI/2,1,70);
  assert.ok(p.hips[0]>20&&p.hips[1]<-20);
  assert.ok(p.knees[1]>p.knees[0]+25);
  assert.ok(p.feet[1]<-8&&p.feet[0]>0);
  assert.ok(p.arms[0]<0&&p.arms[1]>0);
  assert.ok(p.torsoRoll*p.pelvisRoll<0);
});

test('standing has no gait and all targets remain bounded for malformed input',()=>{
  const idle=gaitTargets(Math.PI/2,0);
  assert.deepEqual(idle.hips,[0,0]);
  assert.deepEqual(idle.feet,[0,0]);
  assert.equal(idle.pelvisRoll,0);
  const bad=gaitTargets(NaN,Infinity,NaN);
  assert.ok([...bad.hips,...bad.knees,...bad.feet,...bad.arms,bad.torsoRoll].every(Number.isFinite));
  assert.ok(Math.max(...bad.knees)<=35);
});

test('ground-contact correction is small, never digs body into the floor',()=>{
  const base=gaitGroundOffset([0,0],[0,0]);
  assert.ok(near(base,0));
  for(let p=0;p<Math.PI*2;p+=.13){
    const sample=gaitTargets(p,1,70);
    const y=gaitGroundOffset(sample.hips,sample.knees);
    assert.ok(y<=0&&y>=-.07,'bounded support offset');
    assert.ok(Number.isFinite(y));
  }
});

test('walk eases in, then eases out without sudden leg or arm snaps',()=>{
  let a=createAnimationState();
  const first=stepAnimation(a,walk(),.016);
  assert.ok(first.walkWeight>0&&first.walkWeight<.15);
  assert.ok(first.legs[0]>0&&first.legs[0]<6);
  a=first;
  for(let i=0;i<70;i++)a=stepAnimation(a,walk(),.016);
  assert.ok(a.walkWeight>.98);
  assert.ok(a.legs[0]>21);
  const stop=stepAnimation(a,{id:'alex',walking:false,gait:Math.PI/2},.016);
  assert.ok(stop.walkWeight<a.walkWeight);
  assert.ok(stop.legs[0]>0&&stop.legs[0]<a.legs[0]);
  for(let i=0;i<110;i++)a=stepAnimation(a,{id:'alex',walking:false,gait:Math.PI/2},.016);
  assert.ok(Math.abs(a.legs[0])<.1);
  assert.ok(Math.abs(a.walkBob)<.02);
});

test('pause freezes all leg, foot and weight states; large dt is capped',()=>{
  const start=createAnimationState();
  assert.equal(stepAnimation(start,walk(),0),start);
  assert.equal(stepAnimation(start,walk(),NaN),start);
  const step=stepAnimation(start,walk(),5);
  assert.ok(step.time<=.06);
  assert.ok(step.walkWeight>0&&step.walkWeight<.5);
});

test('chair overrides walking and returns ankle and pelvis to neutral',()=>{
  let a=createAnimationState();
  for(let i=0;i<60;i++)a=stepAnimation(a,walk(),.016);
  for(let i=0;i<120;i++)a=stepAnimation(a,{
    id:'alex',walking:false,using:'sofa',sofaWeight:1,gait:2},.016);
  assert.ok(a.legs[0]<-70&&a.knees[0]>70);
  assert.ok(Math.abs(a.feet[0])<.04);
  assert.ok(Math.abs(a.pelvisRoll)<.04);
  assert.ok(Math.abs(a.walkBob)<.01);
});

test('both residents use the same gait mathematics with different independent state',()=>{
  let alex=createAnimationState(),mira=createAnimationState();
  for(let i=0;i<50;i++){
    alex=stepAnimation(alex,walk('alex',Math.PI/2),.016);
    mira=stepAnimation(mira,walk('mira',-Math.PI/2),.016);
  }
  assert.ok(alex.legs[0]>20&&mira.legs[0]<-20);
  assert.ok(alex.walkWeight>.95&&mira.walkWeight>.95);
});

test('animator applies foot/weight transforms to existing meshes, not new meshes',()=>{
  class Entity {
    constructor(name){this.name=name;this.children=[];this.enabled=true;}
    addChild(e){this.children.push(e);e.parent=this;}
    setLocalPosition(x,y,z){this.position={x,y,z};}
    setLocalEulerAngles(x,y,z){this.rot=[x,y,z];}
    setLocalScale(x,y,z){this.scale=[x,y,z];}
  }
  const all=[],root=new Entity('root');
  const shape=kind=>(name,x,y,z,w,h,d,material,parent=root)=>{
    const node=new Entity(name);node.setLocalPosition(x,y,z);
    node.setLocalScale(w,h,d);node.kind=kind;parent.addChild(node);all.push(node);return node;
  };
  const scene={pc:{Entity},root,ball:shape('ball'),box:shape('box'),
    cylinder:shape('cyl'),mat:x=>x,materials:{
      black:'black',cream:'cream',yellow:'yellow',green:'green'}};
  for(const id of ['alex','mira']){
    const rig=createCharacterRig(scene,id),count=all.length;
    assert.equal(rig.shoes.length,2);
    let state=createAnimationState();
    for(let i=0;i<60;i++){
      state=stepAnimation(state,walk(id,.4+i*.07),.016);
      applyCharacterAnimation(rig,state);
    }
    assert.ok(Math.abs(rig.shoes[0].rot[0])>0);
    assert.equal(rig.pelvis.rot[2],state.pelvisRoll);
    assert.equal(all.length,count);
  }
});

test('gait is visual-only and preserves current save and autonomy settings',()=>{
  const s=newHousehold(),json=JSON.stringify(s);
  let visual=createAnimationState();
  for(let i=0;i<80;i++)visual=stepAnimation(visual,walk('alex',i*.21),.016);
  assert.equal(JSON.stringify(s),json);
  const restored=loadHousehold(JSON.parse(json));
  assert.equal(restored.version,1);
  assert.equal(restored.autonomy.enabled,s.autonomy.enabled);
});
