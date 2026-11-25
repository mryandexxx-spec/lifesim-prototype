/** CAS-01.7: read-only same-dwelling N-person presentation; no new save schema. */
import {residentIdsForSimulation,savedAdditionalActor} from './resident-activity-runtime.js';
import {pendingActions} from './action-queue.js';
import {residentWorkPhase,residentWorkStatus,residentAwayAtWork} from './career-work.js';
import {careerDefinition} from './career-catalog.js';
import {careerRankForContract} from './career-specializations.js';
const LEGACY=Object.freeze({alex:'Алекс',mira:'Мира'});
const NEEDS=['hunger','energy','hygiene','fun','social','bladder'];
const finite=n=>Number.isFinite(n);
export const CAS_ACTIONS=Object.freeze([['fridge','Поесть'],['bed','Спать'],['shower','Душ'],['toilet','Туалет'],['sofa','Отдых'],['tv','ТВ']]);
export function validHudSelection(root,id){return residentIdsForSimulation(root).includes(id);}
export function effectiveHudSelection(root,id){return validHudSelection(root,id)?id:validHudSelection(root,root?.selectedSim)?root.selectedSim:'alex';}
export function residentDisplayName(root,id){
 if(Object.hasOwn(LEGACY,id))return LEGACY[id];
 if(!validHudSelection(root,id))return null;
 return root.population?.residentsById?.[id]?.identity?.firstName||null;
}
export function residentScenePose(root,id){
 if(!validHudSelection(root,id)||Object.hasOwn(LEGACY,id)||residentAwayAtWork(root,id))return null;
 const p=savedAdditionalActor(root,id)?.position;
 return finite(p?.x)&&finite(p?.z)?{x:p.x,z:p.z}:null;
}
export function residentRoster(root,selectedId){
 const selected=effectiveHudSelection(root,selectedId);
 return residentIdsForSimulation(root).map(id=>{
  const actor=id==='alex'?root:id==='mira'?root.otherSim:savedAdditionalActor(root,id);
  const contract=root.careerSystem?.byResident?.[id]||null;
  const career=contract?careerDefinition(contract.careerId):null;
  const work=residentWorkStatus(root,id);
  const needs=Object.fromEntries(NEEDS.map(key=>[key,finite(actor?.needs?.[key])?Math.max(0,Math.min(100,Math.round(actor.needs[key]))):0]));
  const priority=NEEDS.reduce((a,b)=>needs[b]<needs[a]?b:a,NEEDS[0]);
  return Object.freeze({id,name:residentDisplayName(root,id),selected:id===selected,
   legacy:Object.hasOwn(LEGACY,id),away:residentAwayAtWork(root,id),
   workPhase:residentWorkPhase(root,id),workLabel:work?.label||'',
   career:career?.title||null,rank:contract?careerRankForContract(contract)?.title||null:null,
   needs,priorityNeed:priority,priorityValue:needs[priority],
   queued:pendingActions(root.actionQueues,id).length});
 });
}

/** Update the existing picker buttons from canonical presence only. No selection,
 * camera, focus, queue or save changes; unchanged attributes are not rewritten.
 * Called by the existing HUD cadence, including when a non-selected resident
 * returns (additional adults finish inside the simulation tick).
 */
export function syncResidentPickerWorkStatus(root,buttonFor){
 for(const id of residentIdsForSimulation(root)){
  const button=buttonFor(id);
  if(!button)continue;
  const away=residentAwayAtWork(root,id);
  const value=String(away);
  const label='Выбрать '+residentDisplayName(root,id)+(away?' · на работе':'');
  if(button.dataset.away!==value)button.dataset.away=value;
  if(button.getAttribute('aria-label')!==label)button.setAttribute('aria-label',label);
 }
}
