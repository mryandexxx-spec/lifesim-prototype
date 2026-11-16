/** Disposable, isolated QA household for REAL R1b kiss animation.
 * Never import storage, DOM or renderer here; do not mutate a live save.
 */
import {newHousehold,setHouseholdAutonomy} from './household.js';
import {observePairViews,applySocialEvent} from './social-graph.js';
import {romanceAvailability} from './romance.js';
export const KISS_QA_DEBUG_QUERY='kiss';
export function createKissQAHousehold(){
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
    throw Error('Kiss QA: perspectives unavailable');
  // Only on this disposable graph; canonical romance gates remain unchanged.
  for(const [actorId,targetId,type,at] of [
    ['alex','mira','romance.flirt',900],
    ['mira','alex','romance.flirt',2400],
    ['alex','mira','romance.flirt',3900],
    ['alex','mira','romance.confess',4200],
    ['alex','mira','romance.date',4500]
  ]){
    if(!applySocialEvent(root.socialGraph,{actorId,targetId,type,at}))
      throw Error('Kiss QA: romantic receipt rejected '+type);
  }
  for(const [a,b] of [['alex','mira'],['mira','alex']]){
    if(!romanceAvailability(root.socialGraph,a,b,'romance.kiss',root.minutes).enabled)
      throw Error('Kiss QA: romantic kiss unavailable for '+a);
  }
  return root;
}
