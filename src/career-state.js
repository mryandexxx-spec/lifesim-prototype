/** W1-B.3a: additive root-v1 career save contract and sanitized work receipts. */
import {careerDefinition} from './career-catalog.js';
import {restoreWorkIncident,workScenario,INCIDENT_HISTORY_LIMIT} from './career-incidents.js';
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
  const shift={id,employmentId:contract.employmentId,careerId:contract.careerId,
    start,end,hourlyCredits,phase,warn60:raw.warn60===true,warn15:raw.warn15===true,
    departedAt:['working','returning'].includes(phase)?departedAt:null,
    readiness:Number.isFinite(raw.readiness)?Math.max(0,Math.min(100,Math.round(raw.readiness))):null};
  shift.incident=restoreWorkIncident(shift,raw.incident);
  return shift;
}
function cleanLastShift(raw,contract){
  if(!raw||typeof raw!=='object'||typeof raw.id!=='string')return null;
  const parts=raw.id.split('@');
  if(parts.length!==3||parts[0]!==contract.employmentId||
    !parts.slice(1).every(part=>/^\d+$/.test(part))||
    !validTime(raw.start)||!validTime(raw.end)||raw.end<=raw.start||
    !['missed','worked'].includes(raw.outcome)||
    !Number.isSafeInteger(raw.salary)||raw.salary<0||raw.salary>1000000000||
    !Number.isFinite(raw.workedMinutes)||raw.workedMinutes<0||
    !Number.isFinite(raw.lateMinutes)||raw.lateMinutes<0||
    !validTime(raw.finishedAt))return null;
  return {id:raw.id,start:raw.start,end:raw.end,outcome:raw.outcome,
    salary:raw.salary,workedMinutes:raw.workedMinutes,
    lateMinutes:raw.lateMinutes,finishedAt:raw.finishedAt,
    grade:['удачный день','обычная смена','сложный день','пропуск'].includes(raw.grade)?raw.grade:null,
    performanceDelta:Number.isInteger(raw.performanceDelta)&&raw.performanceDelta>=-10&&raw.performanceDelta<=12
      ?raw.performanceDelta:null,
    incident:raw.incident&&workScenario(contract.careerId,raw.incident.scenarioId===undefined?'legacy':raw.incident.scenarioId)?.options.some(x=>x.id===raw.incident.choiceId)&&
      Number.isInteger(raw.incident.performanceDelta)&&raw.incident.performanceDelta>=-5&&raw.incident.performanceDelta<=10
        ?{scenarioId:raw.incident.scenarioId===undefined?'legacy':raw.incident.scenarioId,
          choiceId:raw.incident.choiceId,auto:raw.incident.auto===true,
          performanceDelta:raw.incident.performanceDelta}:null};
}
function cleanContract(raw,id){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.residentId!==id||
    !validEmployeeId(raw.employmentId)||!validTime(raw.hiredAt)||
    raw.status!=='employed'||!Number.isInteger(raw.level))return null;
  const career=careerDefinition(raw.careerId);
  if(!career||raw.level<0||raw.level>=career.ranks.length)return null;
  const validCount=n=>Number.isSafeInteger(n)&&n>=0&&n<=1000000?n:0;
  const contract={residentId:id,employmentId:raw.employmentId,careerId:career.id,level:raw.level,
    workedShifts:validCount(raw.workedShifts),rankShifts:validCount(raw.rankShifts),
    missedShifts:validCount(raw.missedShifts),lateShifts:validCount(raw.lateShifts),
    hiredAt:raw.hiredAt,status:'employed',performance:Number.isFinite(raw.performance)?
      Math.max(0,Math.min(100,Math.round(raw.performance))):50,
    currentShift:null};
  contract.currentShift=cleanWorkShift(raw.currentShift,contract);
  const last=cleanLastShift(raw.lastShift,contract);
  if(last)contract.lastShift=last;
  return contract;
}
/** Only authored decisions enter per-resident work memory; no arbitrary save text. */
function cleanWorkHistory(raw){
  if(!Array.isArray(raw))return [];
  const entries=[];
  for(const item of raw.slice(-128)){
    if(!item||typeof item!=='object'||Array.isArray(item)||
      typeof item.id!=='string'||item.id.length>102||
      !/^e[1-9]\d{0,8}@[0-9]+@[0-9]+#work$/.test(item.id)||
      !careerDefinition(item.careerId)||typeof item.scenarioId!=='string')continue;
    const scene=workScenario(item.careerId,item.scenarioId);
    if(!scene?.options.some(o=>o.id===item.choiceId)||
      !validTime(item.shiftStart)||!validTime(item.at)||item.at<item.shiftStart||
      !Number.isInteger(item.rank)||item.rank<0||item.rank>2||
      !Number.isInteger(item.performanceDelta)||item.performanceDelta< -5||
        item.performanceDelta>10||
      !Number.isInteger(item.performanceAfter)||item.performanceAfter<0||
        item.performanceAfter>100||
      !Number.isInteger(item.energyDelta)||item.energyDelta< -20||item.energyDelta>5||
      !Number.isInteger(item.funDelta)||item.funDelta< -10||item.funDelta>10||
      !item.id.endsWith('@'+item.shiftStart+'#work')||
      entries.some(x=>x.id===item.id))continue;
    entries.push({id:item.id,careerId:item.careerId,scenarioId:item.scenarioId,
      shiftStart:item.shiftStart,at:item.at,rank:item.rank,choiceId:item.choiceId,
      auto:item.auto===true,performanceDelta:item.performanceDelta,
      performanceAfter:item.performanceAfter,energyDelta:item.energyDelta,
      funDelta:item.funDelta});
  }
  return entries.slice(-INCIDENT_HISTORY_LIMIT);
}
export function newCareerSystem(){
  return {schema:CAREER_SCHEMA,nextEmploymentId:1,byResident:{alex:null,mira:null},
    settlementIds:[],incidentIds:[],incidentHistory:{alex:[],mira:[]}};
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
  if(Array.isArray(raw.incidentIds))state.incidentIds=[...new Set(raw.incidentIds.filter(x=>
    typeof x==='string'&&x.length<=102&&/^e[1-9]\d{0,8}@[0-9]+@[0-9]+#work$/.test(x)))].slice(-256);
  for(const id of CAREER_RESIDENT_IDS)state.incidentHistory[id]=cleanWorkHistory(raw.incidentHistory?.[id]);
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
    hiredAt:atMinute,status:'employed',performance:50,currentShift:null,
    workedShifts:0,rankShifts:0,missedShifts:0,lateShifts:0};
  return state;
}
export function resignCareer(system,residentId){
  if(!CAREER_RESIDENT_IDS.includes(residentId))throw new RangeError('Invalid resident');
  const state=restoreCareerSystem(system);
  state.byResident[residentId]=null;
  return state;
}
