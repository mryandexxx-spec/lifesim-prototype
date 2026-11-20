/** UX-06 presentation: contextual phone landing from canonical career data only.
 * No saved fields, jobs, salary amounts, or career transitions are created here.
 */
export function phoneWorkLanding({residentName,contract=null,recruitment=null,
  statusLabel='',shiftLabel='',pendingIncident=false,canDepart=false}={}){
  if(contract){
    const phase=contract.currentShift?.phase;
    const headline=pendingIncident?'Требуется решение':phase==='working'?'На рабочей смене':
      phase==='departing'?'По пути на работу':phase==='returning'?'Возвращается домой':
      phase==='pending'?'Смена назначена':'Рабочий график';
    const action=pendingIncident?'incident':canDepart?'depart':'map';
    return Object.freeze({kind:'employed',residentName,headline,
      description:[statusLabel,shiftLabel].filter(Boolean).join(' · '),
      action,actionLabel:action==='incident'?'Открыть рабочую ситуацию':
        action==='depart'?'Отправиться на работу':'Открыть карьерную карту'});
  }
  if(recruitment){
    const labels={waiting_reply:'Отклик отправлен',
      interview_invited:'Назначено собеседование',interview_active:'Собеседование идёт',
      waiting_decision:'Ожидается ответ',offer_ready:'Получено предложение',
      rejected:'Получен отказ'};
    return Object.freeze({kind:'recruiting',residentName,
      headline:labels[recruitment.phase]||'Мой отклик',
      description:'Ответы и условия находятся в разделе «Мои отклики».',
      action:'application',actionLabel:'Открыть мой отклик'});
  }
  return Object.freeze({kind:'looking',residentName,
    headline:'Поиск работы',description:'Выбери вакансию и отправь отклик.',
    action:'vacancies',actionLabel:'Смотреть вакансии'});
}
