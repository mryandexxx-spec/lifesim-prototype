/** W1-B.3a: additive root-v1 career save contract and sanitized work receipts. */
import {careerDefinition} from './career-catalog.js';
export const CAREER_SCHEMA=1;
export const CAREER_RESIDENT_IDS=Object.freeze(['alex','mira']);
const validTime=n=>Number.isFinite(n)&&n>=0&&n<=5256000000;
const validEmployeeId=id=>typeof id==='string'&&/^e[1-9]\d{0,8}$/.test(id);
function cleanWorkShift(raw,contract){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const {id,start,end,phase,departedAt,hourlyCredits}=raw;
  const career=careerDefinition(contract.careerId);
  const expectedRate=career?.ranks[contract.level]?.hourlyCredits;
  if(!Number.isSafeInteger(start)||start<contract.hiredAt||start<0||
    !Number.isSafeInteger(end)||end-start<60||end-start>720||
    id!==contract.employmentId+'@'+Math.floor(start/1440)+'@'+start||
    !['pending','departing','working','returning'].includes(phase)||
    raw.employmentId!==contract.employmentId||
    raw.careerId!==contract.careerId||hourlyCredits!==expectedRate||
    (['working','returning'].includes(phase)&&
      (!validTime(departedAt)||departedAt<start||departedAt>end)))return null;
  return {id,employmentId:contract.employmentId,careerId:contract.careerId,
    start,end,hourlyCredits,phase,warn60:raw.warn60===true,warn15:raw.warn15===true,
    departedAt:['working','returning'].includes(phase)?departedAt:null};
}
function cleanLastShift(raw,contract){
  if(!raw||typeof raw!=='object'||typeof raw.id!=='string'||
    !new RegExp('^'+contract.employmentId+'@[0-9]+@[0-9]+
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.residentId!==id||
    !validEmployeeId(raw.employmentId)||!validTime(raw.hiredAt)||
    raw.status!=='employed'||!Number.isInteger(raw.level))return null;
  const career=careerDefinition(raw.careerId);
  if(!career||raw.level<0||raw.level>=career.ranks.length)return null;
  const contract={residentId:id,employmentId:raw.employmentId,careerId:career.id,level:raw.level,
    hiredAt:raw.hiredAt,status:'employed',performance:Number.isFinite(raw.performance)?
      Math.max(0,Math.min(100,Math.round(raw.performance))):50,
    currentShift:null};
  contract.currentShift=cleanWorkShift(raw.currentShift,contract);
  const last=cleanLastShift(raw.lastShift,contract);
  if(last)contract.lastShift=last;
  return contract;
}
export function newCareerSystem(){
  return {schema:CAREER_SCHEMA,nextEmploymentId:1,byResident:{alex:null,mira:null},settlementIds:[]};
}
export function restoreCareerSystem(raw){
  const state=newCareerSystem();
  if(!raw||raw.schema!==CAREER_SCHEMA||typeof raw.byResident!=='object'||!raw.byResident)return state;
  const ids=new Set();
  for(const id of CAREER_RESIDENT_IDS){
    const entry=cleanContract(raw.byResident[id],id);
    if(entry&&!ids.has(entry.employmentId)){
      state.byResident[id]=entry;ids.add(entry.employmentId);
    }
  }
  const max=Math.max(0,...[...ids].map(x=>Number(x.slice(1))));
  const next=raw.nextEmploymentId;
  state.nextEmploymentId=Number.isSafeInteger(next)&&next>max&&next<=999999999
    ?next:max+1;
  if(Array.isArray(raw.settlementIds)){
    state.settlementIds=[...new Set(raw.settlementIds.filter(x=>
      typeof x==='string'&&x.length<=96&&/^e[1-9]\d{0,8}@[0-9]+@[0-9]+$/.test(x)))].slice(-256);
  }
  return state;
}
/** Pure hire transition. Gameplay/UI and attendance will call this adapter in W1-B.2. */
export function hireCareer(system,residentId,careerId,atMinute){
  if(!CAREER_RESIDENT_IDS.includes(residentId)||!careerDefinition(careerId)||
    !validTime(atMinute))throw new RangeError('Invalid career hire');
  const state=restoreCareerSystem(system);
  if(state.byResident[residentId])throw new Error('Resident already employed');
  if(state.nextEmploymentId>999999999)throw new RangeError('Employment limit');
  const id='e'+state.nextEmploymentId++;
  state.byResident[residentId]={residentId,employmentId:id,careerId,level:0,
    hiredAt:atMinute,status:'employed',performance:50,currentShift:null};
  return state;
}
export function resignCareer(system,residentId){
  if(!CAREER_RESIDENT_IDS.includes(residentId))throw new RangeError('Invalid resident');
  const state=restoreCareerSystem(system);
  state.byResident[residentId]=null;
  return state;
}
).test(raw.id)||
    !validTime(raw.start)||!validTime(raw.end)||raw.end<=raw.start||
    !['missed','worked'].includes(raw.outcome)||
    !Number.isSafeInteger(raw.salary)||raw.salary<0||raw.salary>1000000000||
    !Number.isFinite(raw.workedMinutes)||raw.workedMinutes<0||
    !Number.isFinite(raw.lateMinutes)||raw.lateMinutes<0||
    !validTime(raw.finishedAt))return null;
  return {id:raw.id,start:raw.start,end:raw.end,outcome:raw.outcome,
    salary:raw.salary,workedMinutes:raw.workedMinutes,
    lateMinutes:raw.lateMinutes,finishedAt:raw.finishedAt};
}
function cleanContract(raw,id){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.residentId!==id||
    !validEmployeeId(raw.employmentId)||!validTime(raw.hiredAt)||
    raw.status!=='employed'||!Number.isInteger(raw.level))return null;
  const career=careerDefinition(raw.careerId);
  if(!career||raw.level<0||raw.level>=career.ranks.length)return null;
  return {residentId:id,employmentId:raw.employmentId,careerId:career.id,level:raw.level,
    hiredAt:raw.hiredAt,status:'employed',performance:Number.isFinite(raw.performance)?
      Math.max(0,Math.min(100,Math.round(raw.performance))):50,
    currentShift:null}; // W1-B.1 never fabricates an absent work-presence shift
}
export function newCareerSystem(){
  return {schema:CAREER_SCHEMA,nextEmploymentId:1,byResident:{alex:null,mira:null},settlementIds:[]};
}
export function restoreCareerSystem(raw){
  const state=newCareerSystem();
  if(!raw||raw.schema!==CAREER_SCHEMA||typeof raw.byResident!=='object'||!raw.byResident)return state;
  const ids=new Set();
  for(const id of CAREER_RESIDENT_IDS){
    const entry=cleanContract(raw.byResident[id],id);
    if(entry&&!ids.has(entry.employmentId)){
      state.byResident[id]=entry;ids.add(entry.employmentId);
    }
  }
  const max=Math.max(0,...[...ids].map(x=>Number(x.slice(1))));
  const next=raw.nextEmploymentId;
  state.nextEmploymentId=Number.isSafeInteger(next)&&next>max&&next<=999999999
    ?next:max+1;
  if(Array.isArray(raw.settlementIds)){
    state.settlementIds=[...new Set(raw.settlementIds.filter(x=>
      typeof x==='string'&&x.length<=96&&/^e[1-9]\d{0,8}@[0-9]+@[0-9]+$/.test(x)))].slice(-256);
  }
  return state;
}
/** Pure hire transition. Gameplay/UI and attendance will call this adapter in W1-B.2. */
export function hireCareer(system,residentId,careerId,atMinute){
  if(!CAREER_RESIDENT_IDS.includes(residentId)||!careerDefinition(careerId)||
    !validTime(atMinute))throw new RangeError('Invalid career hire');
  const state=restoreCareerSystem(system);
  if(state.byResident[residentId])throw new Error('Resident already employed');
  if(state.nextEmploymentId>999999999)throw new RangeError('Employment limit');
  const id='e'+state.nextEmploymentId++;
  state.byResident[residentId]={residentId,employmentId:id,careerId,level:0,
    hiredAt:atMinute,status:'employed',performance:50,currentShift:null};
  return state;
}
export function resignCareer(system,residentId){
  if(!CAREER_RESIDENT_IDS.includes(residentId))throw new RangeError('Invalid resident');
  const state=restoreCareerSystem(system);
  state.byResident[residentId]=null;
  return state;
}
