import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

/** Raw source-asset contract; makes bone/clip assumptions explicit before retargeting. */
test('audit female GLB clip timelines and animated pelvis translation',()=>{
  const glb=readFileSync(new URL('../assets/characters/meshy-mira-mobile-v1.glb',import.meta.url));
  assert.equal(glb.readUInt32LE(0),0x46546c67);
  const jsonLen=glb.readUInt32LE(12);
  const root=JSON.parse(glb.subarray(20,20+jsonLen).toString('utf8'));
  const binOffset=20+jsonLen+8;
  const nodeNames=root.nodes.map(n=>n.name||'');
  const pelvis=nodeNames.map((s,i)=>/Hips$/i.test(s)?{name:s,id:i}:null).filter(Boolean);
  assert.equal(pelvis.length,1);
  assert.equal(pelvis[0].name,'mixamorig:Hips');
  assert.ok(nodeNames.includes('mixamorig:Head'));
  assert.equal(nodeNames.filter(s=>/(LeftArm|RightArm|LeftForeArm|RightForeArm)$/i.test(s)).length,4);
  const values=(i,maxValues=5)=>{
    const a=root.accessors[i],v=root.bufferViews[a.bufferView];
    if(a.componentType!==5126)return null;
    const n={SCALAR:1,VEC3:3,VEC4:4}[a.type]||0;
    const stride=v.byteStride||4*n,offset=binOffset+v.byteOffset+(a.byteOffset||0);
    const row=j=>Array.from({length:n},(_,k)=>glb.readFloatLE(offset+j*stride+4*k));
    return {count:a.count,min:a.min,max:a.max,first:row(0),
      mid:row(Math.floor((a.count-1)/2)),last:row(a.count-1)};
  };
  const tracks=root.animations.map(a=>{
    const first=a.samplers.map(s=>root.accessors[s.input].max?.[0]||0);
    const hip=a.channels.filter(c=>pelvis.some(n=>n.id===c.target.node)&&c.target.path==='translation')
      .map(c=>values(a.samplers[c.sampler].output));
    return {name:a.name,seconds:Math.max(...first,0),channels:a.channels.length,hipTranslations:hip};
  });
  assert.equal(tracks.length,13);
  assert.ok(tracks.find(t=>t.name==='Look_Back_and_Sit').seconds>2.2);
  assert.ok(tracks.find(t=>t.name==='sleep').seconds>5.6);
  const target=root.animations.find(a=>a.name==='Look_Back_and_Sit');
  const c=target.channels.find(c=>pelvis.some(x=>x.id===c.target.node)&&c.target.path==='translation');
  const sampler=target.samplers[c.sampler],input=root.accessors[sampler.input],output=root.accessors[sampler.output];
  function sample(accessor,index){
    const v=root.bufferViews[accessor.bufferView],n={SCALAR:1,VEC3:3}[accessor.type];
    const base=binOffset+v.byteOffset+(accessor.byteOffset||0)+index*(v.byteStride||n*4);
    return Array.from({length:n},(_,k)=>glb.readFloatLE(base+k*4));
  }
  const start=sample(output,0),end=sample(output,input.count-1);
  assert.ok(Math.abs(start[2]+.01003)<.00002);
  assert.ok(Math.abs(end[2]+.41930)<.00002);
  assert.ok(Math.abs(sample(input,input.count-1)[0]-2.26666665)<.00001);

  const needed=['Look_Back_and_Sit','Sit_to_Stand_Transition_F','Step_to_Sit_Transition','Lie_Down_Hands_Spread'];
  assert.ok(needed.every(name=>root.animations.some(x=>x.name===name)));
  assert.ok(pelvis.length>=1);
  const sleep=root.animations.find(a=>a.name==='sleep');
  const hipID=pelvis[0].id;
  const tr=sleep.channels.find(c=>c.target.node===hipID&&c.target.path==='translation');
  const ro=sleep.channels.find(c=>c.target.node===hipID&&c.target.path==='rotation');
  assert.equal(root.accessors[sleep.samplers[tr.sampler].output].count,62);
  assert.equal(root.accessors[sleep.samplers[ro.sampler].output].count,59);
});
