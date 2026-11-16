/** R2a disposable adult couple for a REAL intimacy invitation.
 * Test-only, memory-only, no user save, DOM or renderer dependencies.
 */
import {newHousehold,setHouseholdAutonomy} from './household.js';
import {observePairViews,applySocialEvent} from './social-graph.js';
import {romanceAvailability} from './romance.js';
import {intimacyBedPlan} from './romantic-intimacy.js';
export const INTIMACY_QA_DEBUG_QUERY='intimacy';
export function createIntimacyQAHousehold(){
  const root=newHousehold();
  root.minutes=8000;
  root.otherSim.minutes=root.minutes;
  root.mind.mood.value=88;
  root.otherSim.mind.mood.value=88;
  for(const id of ['alex','mira']){
    Object.assign(root.relationship.views[id],{friendship:88,trust:90,tension:0});
    const resident=id==='alex'?root:root.otherSim;
    Object.assign(resident.needs,{hunger:95,energy:95,hygiene:95,fun:95,social:95,bladder:95});
  }
  setHouseholdAutonomy(root,false);
  if(!observePairViews(root.socialGraph,'alex','mira',root.relationship.views))
    throw Error('Intimacy QA: perspectives unavailable');
  // Genuine canonical romance receipts ONLY in a new throwaway graph.
  for(const [actorId,targetId,type,at] of [
    ['alex','mira','romance.flirt',900],
    ['mira','alex','romance.flirt',2400],
    ['alex','mira','romance.flirt',3900],
    ['alex','mira','romance.confess',4200],
    ['alex','mira','romance.date',4500],
    ['alex','mira','romance.tender',5000],
    ['mira','alex','romance.tender',5400]
  ]){
    if(!applySocialEvent(root.socialGraph,{actorId,targetId,type,at}))
      throw Error('Intimacy QA: invalid milestone '+type);
  }
  for(const [a,b] of [['alex','mira'],['mira','alex']]){
    if(!romanceAvailability(root.socialGraph,a,b,'romance.intimacy',root.minutes).enabled||
      !intimacyBedPlan(root,a))throw Error('Intimacy QA: unable to offer '+a);
  }
  return root;
}
