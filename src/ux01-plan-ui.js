/** UX-01: presentation-only, no simulation or persistence dependencies. */
export function planButtonLabel(count){
  const safe=Number.isFinite(count)?Math.max(0,Math.floor(count)):0;
  return 'План · '+safe;
}
export function queueViewerResident(selected,inspected){
  return inspected==='alex'||inspected==='mira' ? inspected
    :selected==='mira'?'mira':'alex';
}
export function commandReceipt(name,action,position){
  const order=Number.isSafeInteger(position)&&position>0?position:'?';
  return name+' · в плане №'+order+': '+action;
}
export function offerForName(name){
  return name+' · добавить в план после выбора';
}
