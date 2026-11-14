import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {meshyBedPose,createMeshyBedController,MESHY_BED_BONES}
  from '../src/meshy-bed-runtime.js';
import {bedTransitionPose} from '../src/bed-transition.js';
import {BED_SLOT_IDS} from '../src/bed-layout.js';

test('both bed sides remain mirrored during step, sitting and getting up',()=>{
  const left=meshyBedPose(bedTransitionPose({slot:'left',progress:.17}));
  const right=meshyBedPose(bedTransitionPose({slot:'right',progress:.17}));
  assert.equal(left.side,'left');
  assert.equal(right.side,'right');
  assert.ok(left.step>.5&&right.step>.5);
  assert.ok(left.hips[0]*right.hips[0]<0);
  for(const side of BED_SLOT_IDS){
    const sit=meshyBedPose(bedTransitionPose({slot:side,progress:.47}));
    const lie=meshyBedPose(bedTransitionPose({slot:side,progress:1}));
    assert.ok(sit.sit>.95);
    assert.ok(sit.hips.every(x=>x<-60));
    assert.ok(sit.knees.every(x=>x>70));
    assert.ok(lie.recline>.99);
    assert.deepEqual(lie.hips,[0,0]);
    assert.deepEqual(lie.knees,[0,0]);
    assert.ok(lie.shoulders.every(x=>x<0));
  }
});
test('pure bed overlay rejects missing state and never changes bed slot geometry',()=>{
  assert.equal(meshyBedPose(null),null);
  assert.equal(meshyBedPose({bedSide:'wrong',bedSitWeight:1,bedReclineWeight:1}),null);
  assert.equal(meshyBedPose({bedSide:'left',bedSitWeight:NaN,bedReclineWeight:1}),null);
  assert.equal(MESHY_BED_BONES.length,8);
});
test('bone overlay is post-Anim, pause-safe and never moves the game root',()=>{
  const changed=[];
  class Vec3 {constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}}
  class Quat {
    setFromAxisAngle(axis,angle){this.axis=axis;this.angle=angle;return this;}
    mul2(src,delta){this.copyAngle=delta.angle;return this;}
  }
  const bones=Object.fromEntries(MESHY_BED_BONES.map(name=>[name,{
    getLocalRotation(){return new Quat();},
    setLocalRotation(q){changed.push([name,q.copyAngle]);}
  }]));
  const pc={Quat,Vec3};
  const controller=createMeshyBedController({
    pc,model:{findByName:name=>bones[name]}
  });
  assert.equal(controller.ready,true);
  const frame=bedTransitionPose({slot:'right',progress:.48});
  controller.setFrame(frame);
  assert.equal(controller.apply(),true);
  assert.equal(changed.length,8);
  const names=new Set(changed.map(x=>x[0]));
  assert.equal(names.size,8);
  const count=changed.length;
  controller.setFrame(frame,true);
  assert.equal(controller.apply(),false);
  assert.equal(changed.length,count);
  controller.setFrame(null);
  assert.equal(controller.apply(),false);
  assert.equal(changed.length,count);
});
test('unavailable bones fall back to procedural bed without runtime errors',()=>{
  const controller=createMeshyBedController({
    pc:{Quat:class{},Vec3:class{}},model:{findByName:()=>null}
  });
  assert.equal(controller.ready,false);
  controller.setFrame(null);
  assert.equal(controller.apply(),false);
});
test('game feeds the real bed pose and Pages contains post-update module',()=>{
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const visual=readFileSync(new URL('../src/meshy-visual.js',import.meta.url),'utf8');
  const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert.match(game,/bedFrame:bedPose/);
  assert.match(visual,/class BedPostUpdate extends pc\.Script/);
  assert.match(visual,/postUpdate\(\)\{bed\.apply\(\);\}/);
  assert.match(visual,/bedReady:Boolean\(state\.bedRuntime\?\.ready\)/);
  assert.match(pages,/node --check src\/meshy-bed-runtime\.js/);
  assert.ok(pages.includes('src/meshy-bed-runtime.js src/meshy-shower-runtime.js'));
  assert.ok(pages.includes('src/meshy-shower-runtime.js src/loading-progress.js'));
});
