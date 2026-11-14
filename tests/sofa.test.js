import test from 'node:test';
import assert from 'node:assert/strict';
import { SOFA_LAYOUT,SOFA_POSE,SOFA_HIP_PITCH,SOFA_KNEE_PITCH,LEG_GEOMETRY } from '../src/pose-config.js';
import { createCharacterRig,CHARACTER_IDS } from '../src/characters.js';
import { createAnimationState,stepAnimation,applyCharacterAnimation } from '../src/animations.js';
import { newHousehold,loadHousehold,chooseResidentAction } from '../src/household.js';
const rad=d=>d*Math.PI/180;
const near=(a,b,tol=.05)=>Math.abs(a-b)<tol;
test('seat top supports pelvis; knees and shoes reach natural heights',()=>{
  const seatTop=SOFA_LAYOUT.seatCenterY+SOFA_LAYOUT.seatHeight/2;
  const hip=SOFA_POSE.y+LEG_GEOMETRY.hipHeight;
  const knee=hip+LEG_GEOMETRY.kneeOffsetY*Math.cos(rad(SOFA_HIP_PITCH));
  const footBottom=knee+LEG_GEOMETRY.shoeCenterY*
    Math.cos(rad(SOFA_HIP_PITCH+SOFA_KNEE_PITCH))-LEG_GEOMETRY.shoeHeight/2;
  assert.ok(hip>seatTop && hip-seatTop<.15);
  assert.ok(knee>=seatTop);
  assert.ok(footBottom>=-.025 && footBottom<.085);
  assert.ok(seatTop<.5,'sofa must be lower than standing hips');
});
test('seated thighs project forward, feet do not point behind sofa',()=>{
  const forward=LEG_GEOMETRY.kneeOffsetY*Math.sin(rad(SOFA_HIP_PITCH));
  assert.ok(forward>.30,'hips must swing toward local +Z');
  assert.equal(SOFA_POSE.yaw,180,'face world -Z away from backrest');
  const front=SOFA_LAYOUT.z-SOFA_LAYOUT.seatDepth/2;
  const footZ=SOFA_POSE.z-forward-.077;
  assert.ok(footZ<front+.05,'shoe must reach front of cushion');
  assert.ok(SOFA_LAYOUT.backZ>SOFA_POSE.z);
  assert.ok(near(SOFA_HIP_PITCH+SOFA_KNEE_PITCH,0,1));
});
test('sitting and standing both ease knees and thighs without snapping',()=>{
  let pose=createAnimationState();
  const sit={id:'alex',using:'sofa'};
  const start=stepAnimation(pose,sit,.016);
  assert.ok(start.legs[0]<0 && start.legs[0]>SOFA_HIP_PITCH);
  assert.ok(start.knees[0]>0 && start.knees[0]<SOFA_KNEE_PITCH);
  pose=start;
  for(let i=0;i<90;i++)pose=stepAnimation(pose,sit,.016);
  assert.ok(near(pose.legs[0],SOFA_HIP_PITCH,1));
  assert.ok(near(pose.knees[0],SOFA_KNEE_PITCH,1));
  const stand=stepAnimation(pose,{id:'alex'},.016);
  assert.ok(stand.legs[0]>pose.legs[0]);
  assert.ok(stand.knees[0]<pose.knees[0]);
});
test('both characters have hinged knees and animation creates no new mesh',()=>{
  class Entity {
    constructor(name){this.name=name;this.children=[];this.enabled=true;}
    addChild(e){this.children.push(e);e.parent=this;}
    setLocalPosition(x,y,z){this.position={x,y,z};}
    setLocalEulerAngles(x,y,z){this.rotation=[x,y,z];}
    setLocalScale(x,y,z){this.scale=[x,y,z];}
  }
  const root=new Entity('root'),meshes=[];
  const shape=kind=>(name,x,y,z,w,h,d,material,parent=root)=>{
    const m=new Entity(name);m.setLocalPosition(x,y,z);m.setLocalScale(w,h,d);
    m.type=kind;parent.addChild(m);meshes.push(m);return m;
  };
  const ctx={pc:{Entity},root,ball:shape('ball'),box:shape('box'),
    cylinder:shape('cylinder'),mat:x=>x,
    materials:{black:'black',cream:'cream',yellow:'yellow',green:'green'}};
  for(const id of CHARACTER_IDS){
    const rig=createCharacterRig(ctx,id),count=meshes.length;
    assert.equal(rig.kneePivot.length,2);
    for(let i=0;i<2;i++){
      assert.equal(rig.kneePivot[i].parent,rig.legPivot[i]);
      assert.ok(rig.kneePivot[i].children.some(x=>x.name.endsWith(' shin')));
      assert.ok(rig.anklePivot[i].children.some(x=>x.name.endsWith(' shoe')));
    }
    let a=createAnimationState();
    for(let i=0;i<50;i++){
      a=stepAnimation(a,{id,using:'sofa'},.016);
      applyCharacterAnimation(rig,a);
    }
    assert.equal(rig.legPivot[0].rotation[0],a.legs[0]);
    assert.equal(rig.kneePivot[0].rotation[0],a.knees[0]);
    assert.equal(meshes.length,count);
  }
});
test('manual sofa remains available and old saves retain residents',()=>{
  const root=newHousehold();root.needs.fun=9;root.otherSim.needs.fun=33;
  const saved=JSON.stringify(root);
  assert.ok(chooseResidentAction(root,'sofa',false,'mira'));
  assert.equal(root.otherSim.action.id,'sofa');
  const loaded=loadHousehold(JSON.parse(saved));
  assert.equal(loaded.needs.fun,9);
  assert.equal(loaded.otherSim.needs.fun,33);
  assert.equal(loaded.selectedSim,'alex');
  assert.equal(loaded.version,1);
});
