import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readGLB,accessor} from '../art-review/cas-02-2-b/audit-facial-topology.mjs';

const root = new URL('../',import.meta.url);
const data = JSON.parse(readFileSync(new URL('../art-review/cas-02-2-b/G1-LANDMARK-CANDIDATES.json',import.meta.url)));
const sha = b=>createHash('sha256').update(b).digest('hex');
const landmark = (points,key,pos) => pos[3*points[key][0]+1];

test('CAS-B G1 manifest cannot claim generated identities, morphs or owner approval',()=>{
  assert.match(data.status,/NOT_VALIDATED_SCULPT/);
  assert.equal(data.productionReady,false);
  assert.equal(data.ownerArtApproved,false);
  assert.deepEqual(data.render.pixels,[420,420]);
  assert.equal(data.render.orthographicScale,.42);
  assert.ok(data.caveats.some(x=>x.includes('back-facing')));
  assert.ok(data.caveats.some(x=>x.includes('rejected')));
});
for(const [kind,family] of Object.entries(data.families)){
  test('CAS-B G1 actual source vertex landmarks and rig immutable '+kind,()=>{
    const input = readFileSync(new URL(family.source.replace(/^assets\//,'assets/'),root));
    const before=sha(input);
    assert.equal(before,family.sha256);
    const src=readGLB(input),g=src.json,p=g.meshes[0].primitives[0];
    const pos=accessor(src,p.attributes.POSITION);
    const n=accessor(src,p.attributes.NORMAL);
    const joints=accessor(src,p.attributes.JOINTS_0);
    const weights=accessor(src,p.attributes.WEIGHTS_0);
    const uv=accessor(src,p.attributes.TEXCOORD_0);
    const names=g.skins[0].joints.map(i=>g.nodes[i].name);
    const head=names.indexOf('mixamorig:Head');
    assert.ok(head>=0);
    assert.equal(g.skins[0].joints.length,family.jointCount);
    assert.equal(g.animations.length,family.animationClips);
    assert.equal(pos.length/3,family.expectedVertices);
    assert.equal(g.images.length,1);
    assert.ok(Object.keys(family.points).length>=15);
    const unique=new Set();
    for(const [label,pick] of Object.entries(family.points)){
      assert.equal(pick.length,3);
      const [i,px,py]=pick;
      assert.ok(Number.isInteger(i)&&i>=0&&i<family.expectedVertices,label+' source ID');
      assert.ok(px>=0&&px<data.render.pixels[0]&&py>=0&&py<data.render.pixels[1],label+' actual image pixel');
      assert.ok(!unique.has(i),'two distinct landmarks mapped to the same source vertex');
      unique.add(i);
      let hw=0;
      for(let k=0;k<4;k++)if(joints[4*i+k]===head)hw+=weights[4*i+k];
      assert.ok(hw>.9, label+' actual Head skin influence must exceed .90');
      assert.ok(pos[3*i+1]>1.39&&pos[3*i+1]<1.63, label+' actual face height');
      assert.ok(pos[3*i+2]>-.05&&pos[3*i+2]<.18, label+' source face depth');
      assert.ok(Number.isFinite(n[3*i])&&Number.isFinite(uv[2*i]),label);
    }
    for(const [l,r] of [['eyeLO','eyeRO'],['lipL','lipR'],['cheekL','cheekR']]){
      assert.ok(pos[3*family.points[l][0]]<0,l+' left of center');
      assert.ok(pos[3*family.points[r][0]]>0,r+' right of center');
    }
    assert.ok(landmark(family.points,'bridge',pos)>landmark(family.points,'noseTip',pos),'nose source anatomy');
    assert.ok(landmark(family.points,'upperLip',pos)>landmark(family.points,'lowerLip',pos),'lip source anatomy');
    assert.ok(landmark(family.points,'lowerLip',pos)>landmark(family.points,'chin',pos),'chin source anatomy');
    assert.equal(sha(input),before,'never alter shipped GLB');
  });
}
