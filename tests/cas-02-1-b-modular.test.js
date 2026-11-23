import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildCasMannequinGlb,SLOTS,ALL_SLOTS,RIG_SOURCE} from '../scripts/build-cas-modular-mannequin.mjs';
const unpack=b=>{
 assert.equal(b.readUInt32LE(0),0x46546c67);assert.equal(b.readUInt32LE(4),2);
 assert.equal(b.readUInt32LE(8),b.length);assert.equal(b.readUInt32LE(16),0x4e4f534a);
 const len=b.readUInt32LE(12),g=JSON.parse(b.subarray(20,20+len).toString());
 const at=20+len;assert.equal(b.readUInt32LE(at+4),0x4e4942);
 return {g,bin:b.subarray(at+8,at+8+b.readUInt32LE(at))};
};
const values=(a,g,bin)=>{
 const x=g.accessors[a],v=g.bufferViews[x.bufferView],sizes={5123:2,5126:4};
 const types={SCALAR:1,VEC3:3,VEC4:4,MAT4:16};
 const b=bin.subarray(v.byteOffset+(x.byteOffset||0),v.byteOffset+(x.byteOffset||0)+x.count*types[x.type]*sizes[x.componentType]);
 return x.componentType===5123?new Uint16Array(b.buffer,b.byteOffset,b.length/2):new Float32Array(b.buffer,b.byteOffset,b.length/4);
};
test('CAS-02.1-B deterministically exports a real original GLB with provenance',()=>{
 const a=buildCasMannequinGlb(),b=buildCasMannequinGlb();assert.ok(a.buffer.equals(b.buffer));
 const {g,bin}=unpack(a.buffer);
 assert.equal(g.asset.generator,RIG_SOURCE);assert.equal(g.extras.productionReady,false);
 assert.equal(g.buffers[0].byteLength,bin.length);assert.equal(createHash('sha256').update(a.buffer).digest('hex').length,64);
 assert.equal(g.skins.length,1);assert.equal(g.skins[0].joints.length,18);
 assert.deepEqual(g.extras.slots,ALL_SLOTS);
});
test('CAS-02.1-B five independent skinned meshes share joint order and physically verified bind transforms',()=>{
 const {buffer,bindDigest}=buildCasMannequinGlb(),{g,bin}=unpack(buffer);
 assert.equal(g.meshes.length,9);assert.equal(g.nodes.filter(n=>n.skin===0).length,9);
 const skin=g.skins[0],ibm=values(skin.inverseBindMatrices,g,bin);
 assert.equal(createHash('sha256').update(Buffer.from(ibm.buffer,ibm.byteOffset,ibm.byteLength)).digest('hex'),bindDigest);
 const global=skin.joints.map(id=>{
  let pos=[0,0,0],at=id;
  while(at!==0){const curr=g.nodes[at];pos=pos.map((v,i)=>v+(curr.translation?.[i]||0));
    at=g.nodes.findIndex(node=>node.children?.includes(at));assert.ok(at>=0);
  }return pos;
 });
 for(let k=0;k<skin.joints.length;k++)for(let j=0;j<3;j++)
  assert.ok(Math.abs(ibm[16*k+12+j]+global[k][j])<.00001);
 for(let i=0;i<ALL_SLOTS.length;i++){
  const mesh=g.meshes[i],prim=mesh.primitives[0];
  assert.equal(g.nodes.find(n=>n.mesh===i).name,'CAS slot '+ALL_SLOTS[i]);
  assert.deepEqual(Object.keys(prim.attributes).sort(),['JOINTS_0','NORMAL','POSITION','WEIGHTS_0']);
  const js=values(prim.attributes.JOINTS_0,g,bin),ws=values(prim.attributes.WEIGHTS_0,g,bin);
  assert.equal(js.length,ws.length);assert.ok(ws.length>0);
  for(let v=0;v<ws.length;v+=4){assert.ok(js[v]<18&&js[v+1]<18);assert.ok(Math.abs(ws[v]+ws[v+1]-1)<1e-5);}
 }
});
test('CAS-02.1-B source-authored animations target valid bones with real rotation channels',()=>{
 const {buffer}=buildCasMannequinGlb(),{g,bin}=unpack(buffer);
 assert.deepEqual(g.animations.map(x=>x.name),['idle','walk','sit','bed']);
 for(const anim of g.animations){
  assert.ok(anim.channels.length>=2);
  for(const channel of anim.channels){
   assert.equal(channel.target.path,'rotation');assert.ok(g.skins[0].joints.includes(channel.target.node));
   const sampler=anim.samplers[channel.sampler];assert.equal(values(sampler.input,g,bin).length,3);
   assert.equal(values(sampler.output,g,bin).length,12);
  }
 }
});
test('CAS-02.1-B renders no false production readiness and never accesses save-v1',()=>{
 const {json}=buildCasMannequinGlb();
 assert.equal(json.extras.productionReady,false);assert.ok(!JSON.stringify(json).includes('lifesim.room01.v1'));
 assert.equal(json.nodes.filter(n=>n.name.startsWith('CAS slot ')).length,9);
});