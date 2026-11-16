/**
 * Test-only disposable household for checking the REAL paired hug animation.
 * No PlayCanvas, DOM, storage, clocks, persistence or canonical save mutation.
 * Never use this function on a loaded player's household.
 */
import {newHousehold,setHouseholdAutonomy} from './household.js';
import {observePairViews,applySocialEvent} from './social-graph.js';
import {romanceAvailability} from './romance.js';

export const HUG_QA_DEBUG_QUERY='hug';
export function createHugQAHousehold(){
  const root=newHousehold();
  root.minutes=8000;
  root.otherSim.minutes=root.minutes;
  root.mind.mood.value=88;
  root.otherSim.mind.mood.value=88;
  for(const id of ['alex','mira']){
    Object.assign(root.relationship.views[id],{
      friendship:88,trust:90,tension:0
    });
    const resident=id==='alex'?root:root.otherSim;
    Object.assign(resident.needs,{hunger:95,energy:95,hygiene:95});
  }
  setHouseholdAutonomy(root,false);
  if(!observePairViews(root.socialGraph,'alex','mira',root.relationship.views))
    throw Error('QA setup: perspectives unavailable');
  // These are the same verified domain receipts used by romance tests.
  // They are constructed on a fresh sandbox only, never on a saved graph.
  for(const [actorId,targetId,type,at] of [
    ['alex','mira','romance.flirt',900],
    ['mira','alex','romance.flirt',2400],
    ['alex','mira','romance.flirt',3900],
    ['alex','mira','romance.confess',4200],
    ['alex','mira','romance.date',4500]
  ]){
    const result=applySocialEvent(root.socialGraph,{actorId,targetId,type,at});
    if(!result)throw Error('QA setup: romance receipt rejected '+type);
  }
  for(const [a,b] of [['alex','mira'],['mira','alex']]){
    if(!romanceAvailability(root.socialGraph,a,b,'romance.hug',root.minutes).enabled)
      throw Error('QA setup: romance hug unavailable '+a);
  }
  return root;
}
