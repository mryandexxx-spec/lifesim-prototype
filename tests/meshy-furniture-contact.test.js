import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Mat4,Quat,Vec3} from 'playcanvas';
import {MESHY_FURNITURE_SKUS,meshyFurnitureSpec,meshyFurnitureFit} from '../src/meshy-furniture-policy.js';
import {FURNITURE_CATALOG,furnitureRenderOrigin} from '../src/furniture-catalog.js';
import {SOFA_LAYOUT,SOFA_POSE} from '../src/pose-config.js';
import {BED_LAYOUT,BED_SLOTS} from '../src/bed-layout.js';
import {PURCHASED_SEAT_PROFILES} from '../src/seat-furniture.js';

// Decode the actual indexed triangles, including accessor and view offsets.
// Accessor AABBs cannot distinguish a backrest or pillow from a support surface.
function triangles(sku){
  const bytes=readFileSync(new URL('../assets/furniture/meshy-room-v1/'+sku+'.glb',import.meta.url));
  const length=bytes.readUInt32LE(12);
  const gltf=JSON.parse(bytes.toString('utf8',20,20+length));
  function accessor(index){
    const a=gltf.accessors[index],v=gltf.bufferViews[a.bufferView];
    const offset=28+length+(v.byteOffset??0)+(a.byteOffset??0);
    const array={5123:Uint16Array,5125:Uint32Array,5126:Float32Array}[a.componentType];
    const size=a.type==='VEC3'?3:1;
    assert.ok(!v.byteStride||v.byteStride===size*array.BYTES_PER_ELEMENT);
    return new array(bytes.buffer,bytes.byteOffset+offset,size*a.count);
  }
  const fit=meshyFurnitureFit(sku),{offset,scale}=fit;
  const transform=new Mat4().setTRS(new Vec3(offset.x,offset.y,offset.z),
    new Quat().setFromEulerAngles(fit.rotationX,fit.rotationY,0),new Vec3(scale.x,scale.y,scale.z));
  const result=[];
  for(const primitive of gltf.meshes[0].primitives){
    const xyz=accessor(primitive.attributes.POSITION),indices=accessor(primitive.indices);
    const vertices=[];
    for(let i=0;i<xyz.length;i+=3)
      vertices.push(transform.transformPoint(new Vec3(xyz[i],xyz[i+1],xyz[i+2])));
    for(let i=0;i<indices.length;i+=3)
      result.push([vertices[indices[i]],vertices[indices[i+1]],vertices[indices[i+2]]]);
  }
  return result;
}
function surface(mesh,x,z){
  let top=-Infinity;
  for(const [a,b,c] of mesh){
    const dx=b.x-a.x,dz=b.z-a.z,ex=c.x-a.x,ez=c.z-a.z;
    const det=dx*ez-ex*dz;
    if(Math.abs(det)<1e-10)continue;
    const u=((x-a.x)*ez-(z-a.z)*ex)/det,v=(dx*(z-a.z)-dz*(x-a.x))/det;
    if(u>=0&&v>=0&&u+v<=1)top=Math.max(top,a.y+u*(b.y-a.y)+v*(c.y-a.y));
  }
  return top;
}
for(const sku of MESHY_FURNITURE_SKUS)test('physical contact envelope: '+sku,()=>{
  const {prefabId}=meshyFurnitureSpec(sku),def=FURNITURE_CATALOG[prefabId];
  const mesh=triangles(sku),{footprint:bounds,approach}=def;
  for(const t of mesh)for(const v of t){
    assert.ok(v.x>=bounds.minX-.002&&v.x<=bounds.maxX+.002);
    assert.ok(v.z>=bounds.minZ-.002&&v.z<=bounds.maxZ+.002);
    if(prefabId==='rug')assert.ok(v.y>=0&&v.y<.026);
  }
  if(approach)assert.equal(surface(mesh,approach.x,approach.z),-Infinity,'clear standing approach');
  if(prefabId==='sofa'||prefabId==='armchair'){
    const isSofa=prefabId==='sofa',origin=furnitureRenderOrigin(prefabId);
    const z=isSofa?SOFA_POSE.z-origin.z:PURCHASED_SEAT_PROFILES.armchair.seatZ;
    const target=isSofa?SOFA_LAYOUT.seatCenterY+SOFA_LAYOUT.seatHeight/2:PURCHASED_SEAT_PROFILES.armchair.seatHeight;
    for(const x of isSofa?[-.63,0,.63]:[-.12,0,.12]){
      assert.ok(Math.abs(surface(mesh,x,z)-target)<.045,'occupied cushion at '+x);
      assert.ok(surface(mesh,x,.34)>target+.12,'backrest behind resident');
      assert.ok(surface(mesh,x,-.44)<target+.06,'knees clear the front edge');
    }
  }
  if(prefabId==='bed'){
    const top=BED_LAYOUT.mattressY+BED_LAYOUT.mattressHeight/2;
    for(const slot of Object.values(BED_SLOTS)){
      const x=slot.x-BED_LAYOUT.centerX;
      for(const z of [-.35,0,.4,.7])
        assert.ok(Math.abs(surface(mesh,x,z)-top)<.04,'mattress supports '+slot.id);
      const pillow=surface(mesh,x,-.81);
      assert.ok(pillow>top+.07&&pillow<top+.18,'pillow supports head');
    }
  }
});

test('both imported sleep poses settle on the pillow and clear it on exit at every rotation',async()=>{
  const {bedSkinSupport}=await import('../src/meshy-bed-runtime.js');
  const {bedTransitionPose}=await import('../src/bed-transition.js');
  // Final head joints relative to avatar, after each shipped clip's existing
  // root-motion extraction and Mira's authored hip counter-rotation.
  const heads={alex:new Vec3(.012,1.719,-.066),mira:new Vec3(-.024,1.222,-.166)};
  for(const resident of Object.keys(heads))for(const slot of Object.values(BED_SLOTS)){
    assert.equal(bedSkinSupport(resident,bedTransitionPose({slot:slot.id,progress:0})),null);
    const pose=bedTransitionPose({slot:slot.id,progress:1}),fit=bedSkinSupport(resident,pose);
    const local=new Quat().setFromEulerAngles(fit.pitch,0,0).transformVector(heads[resident]);
    local.add(new Vec3(0,fit.y,fit.z));
    const offset=new Quat().setFromEulerAngles(pose.pitch,0,0).transformVector(local);
    const head=new Vec3(pose.x-BED_LAYOUT.centerX+offset.x,pose.y+offset.y,pose.z-BED_LAYOUT.centerZ+offset.z);
    for(const angle of [0,90,180,270]){
      const rotation=new Quat().setFromEulerAngles(0,angle,0);
      const world=rotation.transformVector(head);
      const pillow=rotation.transformVector(new Vec3(slot.x-BED_LAYOUT.centerX,.62,-.81));
      assert.ok(Math.hypot(world.x-pillow.x,world.z-pillow.z)<.24,resident+' aligned with pillow');
      assert.ok(world.y>pillow.y+.035&&world.y<pillow.y+.26,resident+' head clearance '+world.y);
    }
  }
});
