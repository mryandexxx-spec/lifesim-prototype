/** W3-D: explicit choice at a real impending work/life conflict, no UI dependencies. */
import {workLifeConflict,recordWorkFeeling,applyWorkMoodContext} from './career-worklife.js';
import {requestCareerDeparture} from './career-work.js';
import {bookCareerTimeOff} from './career-timeoff.js';
import {cancelSocial} from './relationships.js';
export function resolveWorkLifeConflict(root,residentId,choice,{leaveType='unpaid'}={}){
  const conflict=workLifeConflict(root,residentId);
  if(!conflict)return {ok:false,reason:'Сейчас нет конфликта со сменой'};
  const contract=root.careerSystem.byResident[residentId],shift=contract.currentShift;
  if(contract.workLife?.choiceShiftId===shift.id)
    return {ok:false,reason:'Выбор по этой смене уже сделан'};
  if(choice==='finish'){
    contract.workLife.choiceShiftId=shift.id;
    return {ok:true,kind:'finish'};
  }
  if(choice==='timeoff'){
    if(!conflict.canTimeOff)return {ok:false,reason:'Отгул оформляется только до начала смены'};
    const result=bookCareerTimeOff(root,residentId,shift.id,leaveType);
    if(!result.ok)return result;
    contract.workLife.choiceShiftId=shift.id;
    return {ok:true,kind:'timeoff'};
  }
  if(choice!=='leave')return {ok:false,reason:'Неизвестный выбор'};
  const person=residentId==='mira'?root.otherSim:root;
  const social=root.socialAction;
  const participates=social&&
    (social.initiator===residentId||social.partner===residentId);
  // Only an already-started and accepted shared leisure produces disappointment.
  const shared=social?.shared;
  const accepted=Boolean(participates&&social.automatic!==true&&
    social.phase==='using'&&shared?.mode==='leisure'&&
    (shared.choiceId==='tv'?shared.tvConsent===true:
      ['books','music'].includes(shared.choiceId)?shared.pairConsent===true:
      false));
  const other=participates?
    (social.initiator===residentId?social.partner:social.initiator):null;
  if(participates)cancelSocial(root);
  if(person.action?.automatic!==true&&person.action){
    person.action=null;person.activitySession=null;
  }
  // Canonical departure checks capacity and time. FIFO instructions remain.
  const departure=requestCareerDeparture(root,residentId,root.minutes);
  if(!departure.ok)return departure;
  contract.workLife.choiceShiftId=shift.id;
  if(accepted&&other){
    recordWorkFeeling(root,residentId,'worklife.sharedInterrupted',root.minutes);
    recordWorkFeeling(root,other,'worklife.sharedDisappointed',root.minutes);
    applyWorkMoodContext(root);
  }
  return {ok:true,kind:'leave',interruptedShared:accepted};
}
