/** W3-C: deterministic employment discipline. No DOM, renderer, real clock or wallet. */
export const DISCIPLINE_WINDOW=10;
export const DISCIPLINE_REHIRE_MINUTES=4320;
const LIMIT=5256000000;
const time=n=>Number.isSafeInteger(n)&&n>=0&&n<=LIMIT;
const safeId=id=>typeof id==='string'&&/^e[1-9]\d{0,8}@[0-9]+@[0-9]+$/.test(id);
export function newCareerDiscipline(){
  return {entries:[],finalWarningId:null,pendingDismissal:false};
}
export function restoreCareerDiscipline(raw,employmentId){
  const state=newCareerDiscipline();
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||!Array.isArray(raw.entries))
    return state;
  const seen=new Set();
  for(const e of raw.entries.slice(-DISCIPLINE_WINDOW)){
    if(!e||!safeId(e.id)||!e.id.startsWith(employmentId+'@')||
      seen.has(e.id)||!time(e.at)||!['worked','missed'].includes(e.outcome)||
      !Number.isSafeInteger(e.lateMinutes)||e.lateMinutes<0||e.lateMinutes>720)
      continue;
    const points=e.outcome==='missed'?2:e.lateMinutes>=90?2:e.lateMinutes>=30?1:0;
    if(e.points!==points)continue;
    seen.add(e.id);
    state.entries.push({id:e.id,at:e.at,outcome:e.outcome,
      lateMinutes:e.lateMinutes,points});
  }
  if(typeof raw.finalWarningId==='string'&&
    state.entries.some(e=>e.id===raw.finalWarningId)&&disciplineRisk(state)>=8)
    state.finalWarningId=raw.finalWarningId;
  if(raw.pendingDismissal===true&&state.finalWarningId&&disciplineRisk(state)>=12&&
    state.entries.at(-1)?.id!==state.finalWarningId)
    state.pendingDismissal=true;
  return state;
}
export function disciplineRisk(state){
  const entries=state?.entries||[];
  const strikes=entries.reduce((sum,e)=>sum+(e.points||0),0);
  const clean=entries.filter(e=>e.outcome==='worked'&&e.lateMinutes<30).length;
  return Math.max(0,strikes-Math.floor(clean/2));
}
export function disciplineStatus(state){
  const risk=disciplineRisk(state);
  return {risk,stage:state?.pendingDismissal?'dismissal':
    risk>=8?'final':risk>=4?'warning':'clear',
    cleanShifts:(state?.entries||[]).filter(e=>e.outcome==='worked'&&e.lateMinutes<30).length};
}
/** Only after canonical once-only salary settlement or actual missed shift.
 * An existing shift ID can never count twice, even if the save is reloaded.
 */
export function recordCareerDiscipline(contract,shift,outcome,lateMinutes=0,at=shift?.end){
  if(!contract||!safeId(shift?.id)||!shift.id.startsWith(contract.employmentId+'@')||
    !['worked','missed'].includes(outcome)||!time(Math.floor(at))||
    !Number.isFinite(lateMinutes)||lateMinutes<0)
    return {newEvent:false,transition:null};
  const state=contract.discipline??=newCareerDiscipline();
  if(state.pendingDismissal||state.entries.some(e=>e.id===shift.id))
    return {newEvent:false,transition:null,risk:disciplineRisk(state)};
  const before=disciplineRisk(state);
  const priorFinal=state.finalWarningId;
  const late=outcome==='missed'?0:Math.max(0,Math.min(720,Math.round(lateMinutes)));
  const entry={id:shift.id,at:Math.floor(at),outcome,lateMinutes:late,
    points:outcome==='missed'?2:late>=90?2:late>=30?1:0};
  state.entries.push(entry);
  if(state.entries.length>DISCIPLINE_WINDOW)state.entries.shift();
  const after=disciplineRisk(state);
  if(after<8||!state.entries.some(e=>e.id===state.finalWarningId))
    state.finalWarningId=null;
  let transition=null;
  if(after>=12&&priorFinal&&priorFinal!==entry.id&&
    state.entries.some(e=>e.id===priorFinal)){
    state.pendingDismissal=true;
    transition='dismissal';
  }else if(after>=8&&!state.finalWarningId){
    state.finalWarningId=entry.id;
    transition='final';
  }else if(after>=4&&before<4){
    transition='warning';
  }
  return {newEvent:true,entry,transition,risk:after};
}
