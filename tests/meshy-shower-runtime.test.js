import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {showerSequence,advanceShowerTransition,showerPrivacyInvariant}
  from '../src/shower-interaction.js';
import {MESHY_SHOWER_BONES,meshyShowerPose,showerWalkClipTime,
  createMeshyShowerController} from '../src/meshy-shower-runtime.js';
import {canShowMeshy} from '../src/meshy-visual-policy.js';

const phase=p=>showerSequence(p*32,32);
test('gait sync is finite, deterministic and independent of wall-time or speed',()=>{
  assert.equal(showerWalkClipTime(0,2.4),0);
  assert.ok(showerWalkClipTime(.6,2.4)>1);
  assert.equal(showerWalkClipTime(1.3,2.4),0);
  assert.equal(showerWalkClipTime(-1,2.4),null);
  assert.equal(showerWalkClipTime(.2,NaN),null);
  assert.equal(showerWalkClipTime(.2,0),null);
  assert.deepEqual(meshyShowerPose(phase(.15)),meshyShowerPose(phase(.15)));
  assert.equal(meshyShowerPose(null),null);
});
test('walking entry and exit share the existing authored shower path',()=>{
  const enter=meshyShowerPose(phase(.12));
  assert.equal(enter.walking,true);
  assert.equal(enter.privacy,false);
  assert.ok(enter.gaitMeters>0);
  const wet=meshyShowerPose(phase(.55));
  assert.equal(wet.walking,false);
  assert.equal(wet.privacy,true);
  assert.ok(wet.washing>.9);
  const exiting=advanceShowerTransition({active:true,enterYaw:-90,
    frame:phase(.55),exit:null},false,0,32,1.25);
  const outbound=meshyShowerPose(exiting.frame);
  assert.equal(outbound.walking,false);
  assert.equal(outbound.washing,0);
  for(let i=0;i<100;i++){
    const f=phase(i/100),pose=meshyShowerPose(f);
    assert.equal(showerPrivacyInvariant(f),true);
    assert.ok(pose.angles.every(Number.isFinite));
    if(!f.privacy)assert.equal(pose.washing,0,'no exposed washing pose');
    if(f.water)assert.equal(f.privacy,true,'no water without screen');
  }
});
test('mask and water MUST both be on before any skeletal washing gesture',()=>{
  const dry=meshyShowerPose({...phase(.6),privacy:false});
  assert.equal(dry.washing,0);
  assert.ok(dry.angles.every(x=>x===0));
  const noWater=meshyShowerPose({...phase(.6),water:false});
  assert.equal(noWater.washing,0);
  assert.ok(noWater.angles.every(x=>x===0));
  assert.ok(MESHY_SHOWER_BONES.length===4);
});
test('unavailable or mismatched Mixamo bones use legacy rendering policy',()=>{
  const fallback=createMeshyShowerController({
    pc:{Quat:class{},Vec3:class{}},model:{findByName:()=>null}
  });
  assert.equal(fallback.ready,false);
  assert.equal(fallback.apply(),false);
  assert.equal(canShowMeshy({preferred:true,ready:true,actionId:'shower',showerReady:false}),false);
  assert.equal(canShowMeshy({preferred:true,ready:true,actionId:'shower',showerReady:true}),true);
});
test('post-Anim bone overlay freezes on pause and does not move the avatar root',()=>{
  const edits=[];
  class Quat{
    setFromAxisAngle(_axis,angle){this.angle=angle;return this;}
    mul2(_orig,delta){this.angle=delta.angle;return this;}
  }
  class Vec3{constructor(x,y,z){this.x=x;this.y=y;this.z=z;}}
  const bones=Object.fromEntries(MESHY_SHOWER_BONES.map(name=>[name,{
    getLocalRotation(){return new Quat();},
    setLocalRotation(quat){edits.push([name,quat.angle]);}
  }]));
  const source={findByName:name=>bones[name],
    setPosition(){throw Error('Shower overlay must never change model root');}};
  const ctrl=createMeshyShowerController({pc:{Quat,Vec3},model:source});
  assert.equal(ctrl.ready,true);
  const frame=phase(.50);
  ctrl.setFrame(frame,false);
  assert.equal(ctrl.apply(),true);
  assert.equal(edits.length,4);
  ctrl.setFrame(frame,true);
  assert.equal(ctrl.apply(),false);
  assert.equal(edits.length,4);
  ctrl.setFrame({...frame,privacy:false},false);
  assert.equal(ctrl.apply(),false);
  ctrl.setFrame(null);
  assert.equal(ctrl.apply(),false);
});
test('game keeps established opacity security and publishes new runtime',()=>{
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const visual=readFileSync(new URL('../src/meshy-visual.js',import.meta.url),'utf8');
  const chars=readFileSync(new URL('../src/characters.js',import.meta.url),'utf8');
  const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert.match(game,/applyShowerAppearance\(alexRig,Boolean\(alexShower\?\.privacy\)/);
  assert.match(game,/showerPrivacy\.enabled=Boolean\(alexShower\?\.privacy\|\|miraShower\?\.privacy\)/);
  assert.match(game,/showerFrame:alexShower/);
  assert.match(chars,/rig\.avatar\.enabled=!masked/);
  assert.match(visual,/class ShowerPostUpdate extends pc\.Script/);
  assert.match(visual,/postUpdate\(\)\{shower\.apply\(\);\}/);
  assert.match(visual,/showerReady:Boolean\(state\.showerRuntime\?\.ready\)/);
  assert.match(pages,/node --check src\/meshy-shower-runtime\.js/);
  assert.match(pages,/src\/meshy-shower-runtime\.js src\/loading-progress\.js/);
});
