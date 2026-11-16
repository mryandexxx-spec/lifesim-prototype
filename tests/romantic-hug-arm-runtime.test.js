import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMeshyHugController} from '../src/meshy-hug-runtime.js';
test('audit actual bundled Mixamo arm lengths; no animation-only assumptions',()=>{
  for(const name of ['meshy-casual-v1.glb','meshy-mira-mobile-v1.glb']){
    const buf=readFileSync(new URL('../assets/characters/'+name,import.meta.url));
    const json=JSON.parse(buf.toString('utf8',20,20+buf.readUInt32LE(12)));
    const joints={};
    for(const side of ['Left','Right']){
      const nodes=['Arm','ForeArm','Hand'].map(part=>{
        const node=json.nodes.find(n=>n.name==='mixamorig:'+side+part);
        assert.ok(node,name+' '+side+part);
        return node;
      });
      const upper=Math.hypot(...(nodes[1].translation||[0,0,0]));
      const fore=Math.hypot(...(nodes[2].translation||[0,0,0]));
      joints[side]={upper,fore,total:upper+fore};
      assert.ok(upper>0.02&&fore>0.02);
    }
    console.info('HUG_GLTF_ARM_LENGTHS',name,JSON.stringify(joints));
  }
});
class V{
  constructor(x=0,y=0,z=0){this.set(x,y,z);}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this}
  sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this}
  dot(v){return this.x*v.x+this.y*v.y+this.z*v.z}
  length(){return Math.hypot(this.x,this.y,this.z)}
  normalize(){const n=this.length()||1;this.x/=n;this.y/=n;this.z/=n;return this}
}
class Q{
  constructor(){this.x=0;this.y=0;this.z=0;this.w=1}
  setFromDirections(from,to){
    this.x=from.x-to.x;this.y=from.y-to.y;this.z=from.z-to.z;this.w=0.8;return this;
  }
  mul2(a,b){this.x=a.x+b.x;this.y=a.y+b.y;this.z=a.z+b.z;this.w=a.w;return this}
  slerp(from,to,weight){
    this.x=from.x+(to.x-from.x)*weight;
    this.y=from.y+(to.y-from.y)*weight;
    this.z=from.z+(to.z-from.z)*weight;
    this.w=from.w+(to.w-from.w)*weight;
    return this;
  }
}
const pt=(x,y,z)=>({getPosition:()=>new V(x,y,z),
  getRotation:()=>new Q(),setRotation(r){this.calls++;this.pose=[r.x,r.y,r.z,r.w]},
  calls:0});
function rig(partnerX=.84){
  const bones={};
  for(const [side,sign] of [['Left',-1],['Right',1]]){
    const shoulder=pt(sign*.22,1.52,0),
      elbow=pt(sign*.42,1.40,0),
      wrist=pt(sign*.62,1.28,0);
    bones['mixamorig:'+side+'Arm']=shoulder;
    bones['mixamorig:'+side+'ForeArm']=elbow;
    bones['mixamorig:'+side+'Hand']=wrist;
  }
  const avatar={getWorldTransform(){return {
    transformVector(v,dst){return dst.set(v.x,v.y,v.z)}
  }}};
  const partnerAvatar={getWorldTransform(){return {
    transformPoint(v,dst){return dst.set(v.x+partnerX,v.y,v.z)}
  }}};
  return {pc:{Quat:Q,Vec3:V},model:{findByName:n=>bones[n]},avatar,
    partnerAvatar,bones};
}
test('R1a must actually rotate both shoulders and elbows even for a wide stance',()=>{
  const f=rig(.84),ctrl=createMeshyHugController(f);
  assert.equal(ctrl.ready,true);
  ctrl.setFrame({weight:1,active:true});
  assert.equal(ctrl.apply(),true,'old silent reach cutoff must not skip all arms');
  for(const side of ['Left','Right']){
    assert.ok(f.bones['mixamorig:'+side+'Arm'].calls>0,side+' shoulder static');
    assert.ok(f.bones['mixamorig:'+side+'ForeArm'].calls>0,side+' elbow static');
  }
  ctrl.setFrame({weight:0,active:true});
  const prev=f.bones['mixamorig:LeftArm'].calls;
  assert.equal(ctrl.apply(),false);
  assert.equal(f.bones['mixamorig:LeftArm'].calls,prev);
});
