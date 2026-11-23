#!/usr/bin/env node
/**
 * Geometry-only area distortion probe for a deliberately parameterized MPFB
 * donor topology. NOT a baked-texture quality score. Unlike the G0 source
 * atlas risk gate, values over 1.20 do not alone fail a valid facial key.
 */
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {parseOBJ,parseSparseTarget,auditMPFB} from './audit-mpfb-donor.mjs';

function triangleArea(a,b,c){
 const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]];
 const v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
 const w=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
 return Math.hypot(...w)/2;
}
export function areaStretchForTarget(vertices,triangles,deltas){
 const values=[];
 let degenerate=0;
 for(const [a,b,c] of triangles){
  if(!deltas.has(a)&&!deltas.has(b)&&!deltas.has(c))continue;
  const vv=[a,b,c].map(i=>vertices[i]);
  const morphed=[a,b,c].map(i=>{
    const v=vertices[i],d=deltas.get(i)||[0,0,0];
    return [v[0]+d[0],v[1]+d[1],v[2]+d[2]];
  });
  const x=triangleArea(...vv),y=triangleArea(...morphed);
  if(x<1e-10||y<1e-10){degenerate++;continue}
  values.push(Math.max(x/y,y/x));
 }
 values.sort((a,b)=>a-b);
 return {trianglesAffected:values.length,degenerateTriangles:degenerate,
   p95AreaStretch:values.length?Number(values[Math.ceil(.95*values.length)-1].toFixed(4)):0};
}
export function parseQuadFaces(text){
 const triangles=[];
 for(const line of text.split(/\r?\n/)){
  if(!line.startsWith('f '))continue;
  const ids=line.trim().split(/\s+/).slice(1).map(s=>Number(s.split('/')[0])-1);
  if(ids.length!==4||ids.some(i=>!Number.isInteger(i)||i<0)){
    throw new Error('Expected fixed MPFB quad topology');
  }
  triangles.push([ids[0],ids[1],ids[2]],[ids[0],ids[2],ids[3]]);
 }
 return triangles;
}
export function areaStudy(root){
 const a=auditMPFB(root);
 const p=JSON.parse(readFileSync(new URL('./MPFB-DONOR-PIN.json',import.meta.url)));
 const donorRoot=join(root,'src/mpfb/data');
 const objText=readFileSync(join(root,p.donor.sourceRelPath),'utf8');
 const {vertices}=parseOBJ(objText);
 const triangles=parseQuadFaces(objText);
 const targets=[];
 for(const target of p.targets){
  const raw=readFileSync(join(donorRoot,'targets',target.path));
  const deltaMap=new Map(parseSparseTarget(raw,vertices.length).map(d=>[d.i,d.delta]));
  targets.push({channel:target.channel,...areaStretchForTarget(vertices,triangles,deltaMap)});
 }
 return {
  schema:'lifesim.cas-head-v2.geometry-only-area-study.v1',
  upstreamCommit:a.upstreamCommit,quadTriangles:triangles.length,
  faceIdentityPixelsVerified:false,textureCorrected:false,
  shapesReadyForStylizedResidents:false,acceptanceFromP95Alone:false,targets
 };
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 if(!process.argv[2]){
  console.error('Usage: node audit-mpfb-morph-area.mjs /path/to/mpfb2');
  process.exitCode=2;
 }else{
  console.log('CAS_HEAD_V2_MORPH_AREA '+JSON.stringify(areaStudy(resolve(process.argv[2]))));
 }
}
