/**
 * QSK-05 — READ-ONLY baseline on the two existing canonical source rigs.
 * Bone positions are not foot-sole collision contacts. Every estimated stance
 * below is explicitly a relative ANKLE proxy, not certification of grounding.
 * No game runtime/rig/clip/save mutation.
 */
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {digest, editGlb} from './cas-c3-glb.mjs';
import {motionTracks, samplePose} from './cas-c3-contact.mjs';
import {modelResolver} from './cas-c3-rig.mjs';

const root = new URL('../', import.meta.url);
const clipPatterns = Object.freeze({
  idle: /^Idle/,
  walk: /^Walking$/,
  run: /^Running$/,
  sitToStand: /^Sit_to_Stand/
});
const required = Object.freeze([
  'mixamorig:Hips','mixamorig:Head',
  'mixamorig:LeftFoot','mixamorig:RightFoot',
  'mixamorig:LeftHand','mixamorig:RightHand'
]);
const feet = ['mixamorig:LeftFoot','mixamorig:RightFoot'];
const safeRange = numbers => Math.max(...numbers)-Math.min(...numbers);
const distance = (a,b) => Math.hypot(...a.map((v,i)=>v-b[i]));
const round = n => Math.round(n*1e5)/1e5;

export function validateSource(bytes, entry) {
  if (!entry || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw Error('Missing pinned source SHA256');
  if (bytes.length !== entry.bytes || digest(bytes) !== entry.sha256)
    throw Error('QSK-05 original source SHA/size mismatch: ' + entry.id);
  if (entry.provenance?.license !== 'unknown-not-cleared')
    throw Error('QSK-05 does not change licence clearance');
  return true;
}

export function selectSourceClips(animations) {
  const names = animations.map(a=>a.name);
  return Object.fromEntries(Object.entries(clipPatterns).map(([key,pattern])=>
    [key, names.find(name=>pattern.test(name)) ?? null]));
}

export function summarizeContactProxy(samples) {
  if (!Array.isArray(samples) || !samples.length) throw Error('QSK-05 requires sampled frames');
  for (const sample of samples) {
    for (const name of required) {
      if (!Array.isArray(sample[name]) || sample[name].length !== 3 ||
        !sample[name].every(Number.isFinite)) throw Error('Invalid joint sample ' + name);
    }
  }
  const heights = feet.map(foot => samples.map(frame=>frame[foot][1]));
  const minima = heights.map(h=>Math.min(...h));
  const ankleProxy = feet.map((foot,i)=>{
    // A moving ankle near its clip-relative low point might indicate stance.
    // It does NOT establish the shoe outsole contact or world-floor height.
    const indices = heights[i].flatMap((y,k)=>y-minima[i]<=.012 ? [k]:[]);
    const steps = indices.filter(k=>k>0 && indices.includes(k-1))
      .map(k=>distance(samples[k][foot],samples[k-1][foot]));
    return {
      minY:round(minima[i]), maxY:round(Math.max(...heights[i])),
      verticalRange:round(safeRange(heights[i])),
      nearLowAnkleFrames:indices.length,
      maxNearLowAnkleStep:round(Math.max(0,...steps)),
      lateralTravelFromFirst:round(Math.max(...samples.map(s=>
        Math.hypot(s[foot][0]-samples[0][foot][0],s[foot][2]-samples[0][foot][2])))
    };
  });
  return {
    frameCount:samples.length,
    pelvisVerticalRange:round(safeRange(samples.map(s=>s['mixamorig:Hips'][1]))),
    headVerticalRange:round(safeRange(samples.map(s=>s['mixamorig:Head'][1]))),
    leftFoot:ankleProxy[0],rightFoot:ankleProxy[1],
    handTravel:round(Math.max(...['mixamorig:LeftHand','mixamorig:RightHand']
      .map(name=>Math.max(...samples.map(s=>distance(s[name],samples[0][name])))))),
    groundingVerified:false,
    collisionVerified:false,
    interpretation:'Ankle-position-only; no mesh sole, heel, seat, shower or furniture collider measurement'
  };
}

export function auditOriginal(entry,bytes) {
  validateSource(bytes,entry);
  const editor = editGlb(bytes), gltf=editor.gltf;
  const skin=gltf.skins?.[0];
  if (gltf.skins?.length!==1 || skin?.joints?.length!==66 ||
    gltf.animations?.length!==entry.expected.clips) throw Error('QSK-05 original rig/clip contract changed: '+entry.id);
  const byName = Object.fromEntries(required.map(name=>
    [name,gltf.nodes.findIndex(n=>n.name===name)]));
  if (Object.values(byName).some(i=>i<0)) throw Error('QSK-05 missing canonical joint: '+entry.id);
  const picked=selectSourceClips(gltf.animations);
  if (!picked.walk || !picked.idle || !picked.sitToStand)
    throw Error('QSK-05 required existing source animation absent: '+entry.id);
  const observations={};
  for (const [intent,name] of Object.entries(picked)) {
    if (!name) {observations[intent]={status:'missing-source-clip'};continue;}
    const clip=gltf.animations.find(a=>a.name===name),tracks=motionTracks(editor,clip);
    const duration=Math.max(0,...tracks.map(t=>t.times.at(-1)));
    if (!Number.isFinite(duration)||duration<=0) throw Error('QSK-05 invalid source animation duration: '+name);
    const count=Math.max(2,Math.min(120,Math.ceil(duration*24)));
    const frames=[];
    for(let index=0;index<=count;index++){
      const resolver=modelResolver(gltf,samplePose(tracks,index/count*duration));
      const frame={};
      for(const [bone,node] of Object.entries(byName))frame[bone]=resolver(node).slice(12,15);
      frames.push(frame);
    }
    observations[intent]={
      status:'measured-joint-proxy-only',clip:name,durationSeconds:round(duration),
      sampleRateNominalHz:24,contact:summarizeContactProxy(frames)
    };
  }
  return {id:entry.id,asset:entry.file,sha256:entry.sha256,joints:skin.joints.length,
    clipCount:gltf.animations.length, selectedClips:picked, observations,
    canonicalSourceUnchanged:true};
}

export function auditQsk05() {
  const registry=JSON.parse(readFileSync(new URL('../docs/qsk-04-asset-registry.json',import.meta.url)));
  const originals=registry.origins.filter(x=>x.id==='original-alex'||x.id==='original-mira');
  if (originals.length!==2)throw Error('QSK-05 must use both QSK-04 pinned originals');
  return {
    stage:'QSK-05 independent original-rig contact baseline',
    casGate:'GO-INDEPENDENT-ONLY',
    derivedResidentsApproved:false,
    finalMultiBodyMatrixReady:false,
    originalRigSoleContactVerified:false,
    originals:originals.map(entry=>auditOriginal(entry,readFileSync(new URL('../'+entry.file,import.meta.url)))),
    requirements:[
      {action:'stand',status:'ankle-proxy-baseline-only'},
      {action:'walk',status:'ankle-proxy-baseline-only'},
      {action:'sit/stand',status:'joint-motion-baseline-only; furniture contact not verified'},
      {action:'sleep',status:'blocked until stable CAS rig/garment contract and dedicated furniture measurements'},
      {action:'shower',status:'blocked until corresponding authored rig/collider measurement'},
      {action:'social',status:'blocked until paired contact measurement'},
      {action:'heels',status:'existing C4C isolated lab and sampled contact tests; not reproduced in this original-only scan'},
      {action:'2–4 distinct body rigs',status:'CAS-02.2-B art/rig owner acceptance missing'}
    ],
    disclaimer:'Source-relative bone observations are NOT world-floor sole contact, collision proof, visual acceptance, iPhone Safari, or production rig readiness'
  };
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const output=auditQsk05();
  mkdirSync(new URL('../artifacts/qsk-05/',import.meta.url),{recursive:true});
  writeFileSync(new URL('../artifacts/qsk-05/original-rig-matrix.json',import.meta.url),
    JSON.stringify(output,null,2)+'\n');
  console.log('QSK-05 original SHA-pinned source joint matrix PASS: '+
    output.originals.map(x=>x.id+' '+x.clipCount+' clips').join(', ')+
    '; FINAL COLLISION/NEW CAS GATE BLOCKED');
}
