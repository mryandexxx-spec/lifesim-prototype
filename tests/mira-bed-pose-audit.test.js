import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('audit female joint positions for authored lying and sleeping clips',()=>{
  const glb=readFileSync(new URL('../assets/characters/meshy-mira-mobile-v1.glb',import.meta.url));
  const jsonSize=glb.readUInt32LE(12),g=JSON.parse(glb.subarray(20,20+jsonSize).toString('utf8'));
  const binOffset=20+jsonSize+8,parents=Array(g.nodes.length).fill(-1);
  for(let n=0;n<g.nodes.length;n++)
    for(const c of g.nodes[n].children||[])parents[c]=n;
  const samples=(idx)=>{
    const a=g.accessors[idx],view=g.bufferViews[a.bufferView];
    const n={SCALAR:1,VEC3:3,VEC4:4}[a.type],stride=view.byteStride||n*4;
    return Array.from({length:a.count},(_,j)=>Array.from({length:n},
      (_,k)=>glb.readFloatLE(binOffset+view.byteOffset+(a.byteOffset||0)+j*stride+k*4)));
  };
  const lerp=(a,b,w)=>a.map((v,k)=>v*(1-w)+b[k]*w);
  const mul=(a,b)=>[
    a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
    a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
    a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],
    a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]
  ];
  const rotate=(q,v)=>{const t=mul(mul(q,[...v,0]),[-q[0],-q[1],-q[2],q[3]]);return t.slice(0,3);};
  const sample=(ts,values,t)=>{let i=0;while(i+1<ts.length&&ts[i+1][0]<=t)i++;
    const next=Math.min(i+1,ts.length-1);if(i===next)return values[i];
    const w=Math.max(0,Math.min(1,(t-ts[i][0])/(ts[next][0]-ts[i][0])));
    return lerp(values[i],values[next],w);
  };
  const at=(name,t)=>{
    const clip=g.animations.find(a=>a.name===name);
    const local=g.nodes.map(n=>({t:[...(n.translation||[0,0,0])],
      r:[...(n.rotation||[0,0,0,1])]}));
    for(const c of clip.channels){
      if(!['rotation','translation'].includes(c.target.path))continue;
      const sm=clip.samplers[c.sampler],value=sample(samples(sm.input),samples(sm.output),t);
      local[c.target.node][c.target.path==='translation'?'t':'r']=value;
    }
    const world=[];
    const compute=i=>{if(world[i])return world[i];
      const v=local[i],parent=parents[i];
      if(parent===-1)return world[i]={p:v.t,q:v.r};
      const p=compute(parent);
      const delta=rotate(p.q,v.t);
      return world[i]={q:mul(p.q,v.r),p:p.p.map((x,k)=>x+delta[k])};
    };
    return Object.fromEntries(['Hips','Head','LeftFoot','RightFoot','LeftUpLeg','RightUpLeg','LeftLeg','RightLeg','Spine2','LeftHand']
      .map(b=>{const idx=g.nodes.findIndex(n=>n.name==='mixamorig:'+b);
        return [b,compute(idx).p.map(x=>+x.toFixed(3))];}));
  };
  // Reproduce the owner's Safari defect: a stuck Look_Back_and_Sit frame
  // keeps the torso upright and the legs dangling, whereas the authored
  // final sleep frame is FLAT. The visuals must actually activate sleep.
  const sitting=at('Look_Back_and_Sit',2.26666665);
  const sleeping=at('sleep',5.7);
  const flatLie=at('Lie_Down_Hands_Spread',3.7);
  const relativeY=(joints,bone)=>joints[bone][1]-joints.Hips[1];
  assert.ok(relativeY(sitting,'Head')>.35,
    'the first clip ends sitting upright');
  for(const pose of [sleeping,flatLie]){
    for(const bone of ['Head','LeftLeg','RightLeg','LeftFoot','RightFoot']){
      assert.ok(Math.abs(relativeY(pose,bone))<.14,
        `${bone} must be close to the mattress plane in a native lying pose`);
    }
    assert.ok(pose.LeftFoot[2]-pose.Hips[2]>.75,
      'sleep legs should extend forward, not hang down from the hips');
  }
  assert.ok(g.nodes.some(n=>n.name==='mixamorig:LeftFoot'));
});
