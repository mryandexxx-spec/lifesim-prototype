import test from 'node:test';
import assert from 'node:assert/strict';
import { auditHeadGLB, unpackGLB, accessor, sha256 } from '../art-review/cas-head-v2/verify-derived-heads.mjs';

/** Synthetic in-memory GLB fixtures. They are NOT art and never enter assets/. */
function buildGLB(family='alex',opts={}){
  const source=opts.source===true, vcount=600, clips=family==='alex'?10:13;
  const buffers=[],views=[],accessors=[];
  let offset=0;
  function addBlob(bytes){
    while(offset%4){buffers.push(Buffer.from([0]));offset++;}
    const start=offset;buffers.push(bytes);offset+=bytes.length;
    const view=views.push({buffer:0,byteOffset:start,byteLength:bytes.length})-1;
    return view;
  }
  function addAccessor(rows,type,componentType=5126){
    const n={VEC2:2,VEC3:3,VEC4:4,SCALAR:1}[type];
    const size=componentType===5126?4:2;
    const buf=Buffer.alloc(rows.length*n*size);
    let pos=0;
    for(const row of rows){
      for(const v of row){
        if(componentType===5126)buf.writeFloatLE(v,pos);
        else buf.writeUInt16LE(v,pos);
        pos+=size;
      }
    }
    const bufferView=addBlob(buf);
    return accessors.push({bufferView,componentType,count:rows.length,type})-1;
  }
  const images=[];
  function image(fill){
    const data=Buffer.alloc(1100,fill);
    const bufferView=addBlob(data);
    images.push({bufferView,mimeType:'image/png'});
    return images.length-1;
  }
  const originalSkin=image(119);
  const src={asset:{version:'2.0'},nodes:[],skins:[],animations:[],meshes:[],
    images,materials:[],textures:[],bufferViews:views,accessors,buffers:[{byteLength:0}]};
  for(let j=0;j<66;j++)src.nodes.push({name:'Bone'+j,...(j<65?{children:[j+1]}:{})});
  const fakeHead={name:'head-node',mesh:0,skin:0};
  src.nodes.push(fakeHead);
  src.skins.push({joints:Array.from({length:66},(_,i)=>i)});
  for(let i=0;i<clips;i++)src.animations.push({name:'clip-'+i,channels:[],samplers:[]});
  src.textures.push({source:originalSkin});
  src.materials.push({name:'SOURCE_BAKED_ATLAS',
    pbrMetallicRoughness:{baseColorTexture:{index:0}}});
  if(!source){
    const changedNames=['eyes','nose','lips','chin','cheeks'];
    const pos=addAccessor(Array.from({length:vcount},(_,i)=>[i*.001,1.4,0]),'VEC3');
    const normal=addAccessor(Array.from({length:vcount},()=>[0,0,1]),'VEC3');
    const uv=addAccessor(Array.from({length:vcount},(_,i)=>[(i%30)/30,Math.floor(i/30)/20]),'VEC2');
    const joint=addAccessor(Array.from({length:vcount},()=>[24,0,0,0]),'VEC4',5123);
    const weight=addAccessor(Array.from({length:vcount},()=>[1,0,0,0]),'VEC4');
    const index=addAccessor(Array.from({length:vcount},(_,i)=>[i]),'SCALAR',5123);
    const targets=changedNames.map((_,k)=>({
      POSITION:addAccessor(Array.from({length:vcount},(_,i)=>
        i>=k*60&&i<k*60+34?[0.012+k*.001,0,0]:[0,0,0]),'VEC3')
    }));
    if(opts.emptyChannel!==undefined){
      const k=opts.emptyChannel;
      targets[k].POSITION=addAccessor(Array.from({length:vcount},()=>[0,0,0]),'VEC3');
    }
    const skinTexture=image(opts.reuseAtlas?119:155);
    src.textures.push({source:skinTexture});
    src.materials.push({name:'CAS_HEAD_SKIN_'+family,
      pbrMetallicRoughness:{baseColorTexture:{index:1}}});
    src.meshes.push({
      extras:{lifeSimRole:opts.noTag?'unreviewed':'derivative-head',
        targetNames:opts.duplicateChannels?['eyes','eyes','lips','chin','cheeks']:changedNames},
      primitives:[{
        attributes:{POSITION:pos,NORMAL:normal,TEXCOORD_0:uv,JOINTS_0:joint,WEIGHTS_0:weight},
        indices:index,material:1,targets
      }]
    });
    if(opts.unknownRig)src.nodes[2].name='Substitute-Rig';
    if(opts.noSkin)delete fakeHead.skin;
    if(opts.missingClip)src.animations.pop();
    if(opts.noTexture)src.materials[1].pbrMetallicRoughness={};
    if(opts.fakeApproval)src.extras={productionReady:true};
  }
  while(offset%4){buffers.push(Buffer.from([0]));offset++;}
  const bin=Buffer.concat(buffers),j=Buffer.from(JSON.stringify(src),'utf8');
  const jpad=Buffer.concat([j,Buffer.alloc((4-j.length%4)%4,32)]);
  src.buffers[0].byteLength=bin.length;
  const json=Buffer.from(JSON.stringify(src),'utf8');
  const jp=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
  const result=Buffer.alloc(12+8+jp.length+8+bin.length);
  result.write('glTF',0);result.writeUInt32LE(2,4);
  result.writeUInt32LE(result.length,8);
  result.writeUInt32LE(jp.length,12);result.writeUInt32LE(0x4e4f534a,16);
  jp.copy(result,20);
  const at=20+jp.length;
  result.writeUInt32LE(bin.length,at);result.writeUInt32LE(0x004e4942,at+4);
  bin.copy(result,at+8);
  return result;
}
const sourceFamily=family=>buildGLB(family,{source:true});
test('P1: correctly skinned and textured actual morph targets pass STRUCTURAL only',()=>{
  for(const family of ['alex','mira']){
    const candidate=buildGLB(family);
    const receipt=auditHeadGLB(candidate,sourceFamily(family),family);
    assert.equal(receipt.skinnedHead,true);
    assert.equal(receipt.geometryAndRigInspection,'PASS');
    assert.equal(receipt.sourceJointCount,66);
    assert.equal(receipt.sourceClipCount,family==='alex'?10:13);
    assert.equal(Object.keys(receipt.morphTargets).length,5);
    assert.equal(receipt.ownerArtApproved,false);
    assert.equal(receipt.uvAndFaceArtApproved,false);
    assert.equal(receipt.playcanvasWebGLVerified,false);
    assert.equal(receipt.productionReady,false);
  }
});
test('P1: GLB structural parser rejects corrupt magic and length',()=>{
  const original=buildGLB();
  const invalid=Buffer.from(original);invalid.write('RIG!',0);
  assert.throws(()=>unpackGLB(invalid),/header/);
  const truncated=Buffer.from(original);truncated.writeUInt32LE(truncated.length+4,8);
  assert.throws(()=>unpackGLB(truncated),/length/);
});
test('P1: source baked texture reuse, missing skin or unknown rig rejected',()=>{
  const source=sourceFamily('alex');
  for(const options of [{reuseAtlas:true},{noSkin:true},{unknownRig:true},{noTexture:true}]){
    assert.throws(()=>auditHeadGLB(buildGLB('alex',options),source,'alex'));
  }
});
test('P1: target names must actually deform geometry',()=>{
  const source=sourceFamily('mira');
  for(const options of [{emptyChannel:2},{duplicateChannels:true},{noTag:true},{missingClip:true}]){
    assert.throws(()=>auditHeadGLB(buildGLB('mira',options),source,'mira'));
  }
});
test('P1: premature production-art approval rejected',()=>{
  assert.throws(()=>auditHeadGLB(buildGLB('alex',{fakeApproval:true}),sourceFamily('alex'),'alex'),
    /cannot be self-certified/);
});
test('P1: malformed/unknown accessor rejected',()=>{
  const a=unpackGLB(buildGLB('alex'));
  assert.ok(accessor(a,0).length>0);
  assert.throws(()=>accessor(a,999),/Missing glTF accessor/);
  assert.match(sha256(buildGLB('alex')),/^[a-f0-9]{64}$/);
});
