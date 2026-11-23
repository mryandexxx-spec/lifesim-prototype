#!/usr/bin/env node
/**
 * CAS-HEAD-V2 read-only CC0 donor feasibility gate.
 * Usage: node art-review/cas-head-v2/audit-mpfb-donor.mjs /path/to/mpfb2
 * Use exact upstream v2.0.18 checkout. Never downloads software, writes vendor
 * assets, changes hero avatars, or declares a new game resident art-ready.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';

const manifest = JSON.parse(readFileSync(new URL('./MPFB-DONOR-PIN.json',import.meta.url),'utf8'));

export function parseOBJ(text){
  const vertices = [];
  let quads=0,faces=0,uvCoordinates=0;
  for (const line of text.split(/\r?\n/)){
    if(line.startsWith('v ')){
      const fields=line.trim().split(/\s+/);
      if(fields.length<4)throw new Error('Bad OBJ vertex');
      const point=fields.slice(1,4).map(Number);
      if(!point.every(Number.isFinite))throw new Error('Non-finite OBJ coordinates');
      vertices.push(point);
    }else if(line.startsWith('vt ')){
      uvCoordinates++;
    }else if(line.startsWith('f ')){
      const fields=line.trim().split(/\s+/);
      faces++;
      if(fields.length===5)quads++;
      else throw new Error('Non-quad topology cannot be used as the pinned donor');
      for(const corner of fields.slice(1)){
        const i=Number(corner.split('/')[0]);
        if(!Number.isInteger(i)||i===0||Math.abs(i)>vertices.length)throw new Error('Invalid OBJ face index');
      }
    }
  }
  return {vertices,faces,quads,uvCoordinates};
}
export function parseSparseTarget(raw, vertexCount){
  const text = gunzipSync(raw).toString('utf8');
  const ids=new Set(),deltas=[];
  for(const line of text.split(/\r?\n/)){
    const v=line.trim();
    if(!v || v.startsWith('#'))continue;
    const parts=v.split(/\s+/);
    if(parts.length!==4)throw new Error('Target line must be: ID dx dy dz');
    const i=Number(parts[0]),d=parts.slice(1).map(Number);
    if(!Number.isInteger(i)||i<0||i>=vertexCount)throw new Error('Target index out of bounds');
    if(!d.every(Number.isFinite))throw new Error('Target delta non-finite');
    if(ids.has(i))throw new Error('Duplicate target vertex ID');
    ids.add(i);
    const length=Math.hypot(...d);
    if(length>0) deltas.push({i,delta:d,length});
  }
  return deltas;
}
export const sha256=b=>createHash('sha256').update(b).digest('hex');

export function auditMPFB(root){
  assert.equal(manifest.ownerApproved.referenceOnlyUseOfMakeHuman,true);
  for(const key of ['productionReady','sourceFitted','originalRigTransferVerified','ownerVisualApproval']){
    assert.equal(manifest.gate[key],false,key+' must remain closed');
  }
  const base=readFileSync(join(root,manifest.donor.sourceRelPath));
  assert.equal(sha256(base),manifest.donor.sha256,'Pinned MPFB donor base content mismatch');
  const obj=parseOBJ(base.toString('utf8'));
  assert.equal(obj.vertices.length,manifest.donor.vertexCount);
  assert.equal(obj.faces,manifest.donor.quadCount);
  assert.equal(obj.quads,manifest.donor.quadCount);
  assert.equal(obj.uvCoordinates,manifest.donor.uvCoordinateCount);
  const samples=[];
  const changedSets={};
  for(const expected of manifest.targets){
    const compressed=readFileSync(join(root,'src/mpfb/data/targets',expected.path));
    assert.equal(sha256(compressed),expected.sha256,'MPFB target hash mismatch: '+expected.channel);
    const d=parseSparseTarget(compressed,obj.vertices.length);
    assert.equal(d.length,expected.changed,'MPFB target geometry changed: '+expected.channel);
    assert.ok(d.every(x=>x.length>0));
    const max=Math.max(...d.map(x=>x.length));
    assert.ok(Math.abs(max-expected.maxDelta)<.0005,'MPFB target displacement changed: '+expected.channel);
    assert.ok(d.length<obj.vertices.length/5,'Target '+expected.channel+' unexpectedly alters large part of body');
    changedSets[expected.channel]=new Set(d.map(x=>x.i));
    samples.push({channel:expected.channel,changedVertices:d.length,maxDelta:Math.round(max*1e4)/1e4});
  }
  for(const row of samples){
    const own=changedSets[row.channel];
    row.sharedWithOtherTargets=Object.entries(changedSets)
      .filter(([name])=>name!==row.channel)
      .reduce((sum,[,set])=>sum+[...own].filter(i=>set.has(i)).length,0);
  }
  return {schema:'lifesim.cas-head-v2.donor-audit.v1',upstreamCommit:manifest.upstream.commit,
    license:manifest.upstream.coreAssetsLicense,donorVertices:obj.vertices.length,
    donorQuads:obj.quads,uvCoordinateCount:obj.uvCoordinates,
    morphTargets:samples,originalSourceGLBModified:false,
    realNewResidents:0,headSourceFitted:false,rigTransferred:false,
    textureCorrected:false,artApproved:false,productionReady:false};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  if(!process.argv[2]){
    console.error('Specify an upstream mpfb2 v2.0.18 checkout. No automatic network downloads.');
    process.exitCode=2;
  }else{
    const result=auditMPFB(resolve(process.argv[2]));
    console.log('CAS_HEAD_V2_MPFBDONOR '+JSON.stringify(result));
  }
}
