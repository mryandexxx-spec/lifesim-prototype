import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {SOURCE,SOURCE_SHA,benchDescriptor,deriveHeight,measureBench} from './cf-interact-geometry.mjs';
import {resolveSeatInteraction,rotateSeatVector} from '../src/interaction-anchors.js';
const sides=['l','r'],clips=['Sitting_Enter','Sitting_Exit'],finite=Number.isFinite;
const xyz=v=>Array.isArray(v)&&v.length===3&&v.every(finite);
const sha=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
export function validateMeasuredRig(r,action){
 if(!r||r.version!==1||!sha(r.revision)||!r.id||!Array.isArray(r.names)||r.names.length!==104||
    !Array.isArray(r.parents)||r.parents.length!==104||!Array.isArray(r.bind)||r.bind.length!==104||
    !r.bind.every(b=>xyz(b.p)&&Array.isArray(b.r)&&b.r.length===4&&b.r.every(finite))||
    !r.parents.every((p,i)=>Number.isInteger(p)&&p>=-1&&p<i)||
    !finite(r.bindSkinReplay?.max_m)||r.bindSkinReplay.max_m>=.002||
    r.anatomicalLimitStatus!=='UNVERIFIED'||!r.declaredJointLimits||!r.observedClipRomRad||
    !action||!sha(action.revision)||action.kind!=='sit.normal'||!clips.every(c=>sha(action.clips?.[c]?.sampleSha)))return false;
 if(!sides.every(s=>{
   const l=r.segments?.[s];return l&&['thighM','shinM','upperarmM','forearmM','neutralSoleDropM','flatKneeCeilingM'].every(k=>finite(l[k])&&l[k]>0)&&
    Math.abs(l.flatKneeCeilingM-l.shinM-l.neutralSoleDropM)<1e-8&&
    ['sole_','palm_','thigh_'].every(k=>r.markers?.[k+s]?.vertexCount>0);
 })||!r.markers?.pelvis?.vertexCount)return false;
 if(!clips.every(c=>{
   const p=r.poses?.[c];return p&&p.index===action.clips[c].seatedIndex&&sha(p.retargetPoseSha)&&
    finite(p.skinReplay?.max_m)&&p.skinReplay.max_m<.002&&
    Array.isArray(p.supportPoints)&&p.supportPoints.length===p.supportVertexCount&&p.supportVertexCount>=3&&p.supportPoints.every(xyz)&&
    finite(p.supportWidth)&&p.supportWidth>0&&finite(p.supportDepth)&&p.supportDepth>0&&
    sides.every(s=>{const l=p.limbs?.[s];return l&&xyz(l.hip)&&xyz(l.knee)&&xyz(l.ankle)&&xyz(l.hand)&&finite(l.soleDropM)&&l.soleDropM>0;});
 }))return false;
 return Math.abs(r.maxFlatKneeHeight-Math.min(...sides.map(s=>r.segments[s].flatKneeCeilingM)))<1e-8&&
   Math.abs(r.supportWidth-Math.max(...clips.map(c=>r.poses[c].supportWidth)))<1e-8&&
   Math.abs(r.supportDepth-Math.max(...clips.map(c=>r.poses[c].supportDepth)))<1e-8;
}
export function resolveMeasuredSeatInteraction(args){
 const {rig:r,action}=args;
 if(!validateMeasuredRig(r,action))return {ok:false,reason:'INVALID_MEASURED_PASSPORT'};
 const base=resolveSeatInteraction(args);if(!base.ok)return base;
 const localWorld=v=>{const d=rotateSeatVector({x:v[0],y:v[1],z:v[2]},base.yaw);return [base.contact.x+d.x,base.contact.y+d.y,base.contact.z+d.z];};
 const rows=[];
 for(const clip of clips)for(const side of sides){
   const limb=r.poses[clip].limbs[side],l=r.segments[side];
   const hip=localWorld(limb.hip),ankle=localWorld(limb.ankle);
   ankle[1]=base.floorY+limb.soleDropM;
   const distance=Math.hypot(...hip.map((x,i)=>x-ankle[i])),min=Math.abs(l.thighM-l.shinM),max=l.thighM+l.shinM;
   rows.push({clip,side,hip,ankle,distance,min,max,within:distance>=min-1e-8&&distance<=max+1e-8});
 }
 if(rows.some(r=>!r.within))return {ok:false,reason:'AUTHORED_FOOT_REACH',rows};
 return {...base,status:'MEASURED_PREFLIGHT_CANDIDATE',reach:rows,
   pending:[...base.pending,'ANATOMICAL_LIMIT_VALIDATION','HAND_AND_BACK_CLEARANCE','SOURCE_SEAM']};
}
export function runMeasuredMatrix(path='artifacts/cf-interact-01b'){
 const data=JSON.parse(readFileSync(path+'/rig-action-passports.json','utf8')),source=readFileSync(SOURCE);
 assert.equal(data.solverExecuted,false);assert.equal(data.frozenFbik,'6974fc7e91ee2b089bde79c701eee946da142b51');
 const profiles=Object.values(data.rigs);assert.equal(profiles.length,6);
 assert.equal(new Set(profiles.map(r=>r.sex+':'+r.scale)).size,6);
 const action=data.action,cases=[],fixtures=[];
 for(const [name,height,bytes] of [['native',.64,source],['candidate45',.45,deriveHeight(source,.45)],['heldout42',.42,deriveHeight(source,.42)]]){
   const measurement=measureBench(bytes,height),asset=benchDescriptor(measurement.assetSha,height);
   if(name==='native')assert.equal(measurement.assetSha,SOURCE_SHA);
   fixtures.push({name,measurement,asset});
   for(const rig of profiles){
     assert.ok(validateMeasuredRig(rig,action),rig.id);
     let first;
     for(const yaw of [0,90,180,270,37,-123]){
       const instance={id:'bench',origin:{x:19,y:-.53,z:8},yaw},environment={occupiedSlots:[],corridorClear:()=>true};
       const args={asset,measurement,instance,rig,action,environment},result=resolveMeasuredSeatInteraction(args);
       if(first===undefined)first=result;
       else{assert.equal(result.ok,first.ok);assert.equal(result.reason,first.reason);if(result.ok)assert.equal(result.cacheKey,first.cacheKey);}
       if(result.ok){
         assert.equal(result.status,'MEASURED_PREFLIGHT_CANDIDATE');
         for(const row of result.reach){
           assert.ok(row.within);assert.ok(Math.abs(row.ankle[1]-(instance.origin.y+rig.poses[row.clip].limbs[row.side].soleDropM))<1e-8);
         }
         const other=resolveMeasuredSeatInteraction({...args,environment:{...environment,occupiedSlots:[result.slotId]}});
         assert.ok(other.ok);assert.notEqual(other.slotId,result.slotId);
         assert.equal(resolveMeasuredSeatInteraction({...args,environment:{...environment,occupiedSlots:[result.slotId,other.slotId]}}).reason,'SLOT_OCCUPIED');
         assert.equal(resolveMeasuredSeatInteraction({...args,environment:{...environment,corridorClear:()=>false}}).reason,'APPROACH_BLOCKED');
       }
       if(name==='native')assert.equal(result.reason,'SEAT_TOO_HIGH',rig.id);
       cases.push({name,yaw,rig:rig.id,result});
     }
   }
 }
 assert.equal(cases.length,108);
 const counts={};for(const c of cases){const k=c.result.ok?c.result.status:c.result.reason;counts[k]=(counts[k]||0)+1;}
 const output={stage:'01B',fixtures,cases,counts,disposition:cases.some(c=>c.result.ok)?'CANDIDATES_FOR_BAKE_ONLY':'NO_COMPATIBLE_CANDIDATE',
    limitations:['Patch rectangle and vertices are not actual contact area','No measured anatomical limits or dynamic obstacle sweep','Corridor callback is controlled fixture','Source seam, balance and ART open','No production wiring or solve']};
 writeFileSync(path+'/eligibility-matrix.json',JSON.stringify(output,null,2));console.log('01B measured matrix',JSON.stringify(counts),output.disposition);return output;
}
