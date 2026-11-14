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
  console.log('MIRA_ASSET_JOINTS',JSON.stringify({pelvis,head:nodeNames.filter(s=>/Head$/i.test(s)),
    arms:nodeNames.filter(s=>/(LeftArm|RightArm|LeftForeArm|RightForeArm)$/i.test(s))}));
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
  console.log('MIRA_ASSET_TRACKS',JSON.stringify(tracks));
  const needed=['Look_Back_and_Sit','Sit_to_Stand_Transition_F','Step_to_Sit_Transition','Lie_Down_Hands_Spread'];
  assert.ok(needed.every(name=>root.animations.some(x=>x.name===name)));
  assert.ok(pelvis.length>=1);
});
