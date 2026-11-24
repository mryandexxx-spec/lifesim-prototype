// QSK-11/B: a presentation-only notification/input adapter.
// Game owns incident eligibility and commands; this adapter owns only DOM and one timeout.
export function createToastUI({
  element,document:doc,incidentPending,openIncident,
  onNotice=()=>{},clearTimer=clearTimeout,scheduleTimer=setTimeout
}){
  let toastTimeout;
  return function toast(message,{incidentResidentId=null,record=true}={}){
    if(record)onNotice(message,{incidentResidentId});
    element.replaceChildren(doc.createTextNode(message));
    element.classList.toggle('toast-actionable',Boolean(incidentResidentId));
    if(incidentResidentId&&incidentPending(incidentResidentId)){
      const button=doc.createElement('button');
      button.type='button';button.className='toast-incident-cta';
      button.textContent='Решить';
      button.setAttribute('aria-label','Решить рабочую ситуацию: '+
        (incidentResidentId==='mira'?'Мира':'Алекс'));
      button.addEventListener('click',()=>openIncident(incidentResidentId));
      element.append(button);
    }
    element.classList.add('show');
    clearTimer(toastTimeout);
    toastTimeout=scheduleTimer(()=>element.classList.remove('show'),
      incidentResidentId?8000:2600);
  };
}
