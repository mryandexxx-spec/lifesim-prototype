/** Two-person household without importing PlayCanvas, DOM or browser APIs.
 * Legacy root fields remain Alex's exact v1 state; otherSim is an optional extension.
 */
import { newGame, loadGame, tick, chooseAction, autonomousChoice, setAutonomyEnabled } from './simulation.js';
import { refreshMind } from './psychology.js';
import {DEMO_PROFILES} from './trait-catalog.js';
import {BED_SLOTS,BED_SLOT_IDS,availableBedSlot,validBedSlot} from './bed-layout.js';
import {findPath,nearestWalkable} from './navigation.js';
import { newRelationship,loadRelationship,loadSocialAction,cancelSocial,
  tickSocial } from './relationships.js';

export const HOUSEHOLD_IDS = Object.freeze(['alex', 'mira']);
export const RESIDENT_NAMES = Object.freeze({ alex: 'Алекс', mira: 'Мира' });
export const RESIDENT_START = Object.freeze({ x: -0.80, z: 2.95 });

function newMira(minutes=480) {
  const mira=newGame(DEMO_PROFILES.second);
  mira.position={ ...RESIDENT_START };
  mira.needs={ hunger: 72, energy: 86, hygiene: 75, fun: 72 };
  mira.minutes=minutes;
  mira.autonomy.nextAt=minutes;
  mira.event='Свободное время';
  refreshMind(mira);
  return mira;
}

export function newHousehold() {
  const state=newGame(DEMO_PROFILES.first);
  state.otherSim=newMira(state.minutes);
  state.selectedSim='alex';
  state.relationship=newRelationship(state.minutes);
  state.socialAction=null;
  return state;
}

/** Do not change save key or version: parse and sanitize each resident using v1 loader. */
export function loadHousehold(raw) {
  if (!raw || raw.version!==1) return newHousehold();
  const root=loadGame(raw,DEMO_PROFILES.first);
  const validMira=raw.otherSim && typeof raw.otherSim==='object' && !Array.isArray(raw.otherSim) &&
    raw.otherSim.version===1 && raw.otherSim.needs && raw.otherSim.position;
  // Ignore saved clock/speed/pause for Mira; the household has one shared clock.
  const mira=validMira
    ? loadGame({ ...raw.otherSim, minutes:root.minutes, paused:root.paused, speed:root.speed,
        autonomy:{ ...raw.otherSim.autonomy, enabled:root.autonomy.enabled } },
        DEMO_PROFILES.second)
    : newMira(root.minutes);
  mira.minutes=root.minutes;
  mira.paused=root.paused;
  mira.speed=root.speed;
  mira.autonomy.enabled=root.autonomy.enabled;
  if (!root.autonomy.enabled && mira.action?.automatic) mira.action=null;
  root.otherSim=mira;
  root.selectedSim=raw.selectedSim==='mira' ? 'mira' : 'alex';
  root.relationship=loadRelationship(raw.relationship,root.minutes);
  root.socialAction=loadSocialAction(raw.socialAction,root);
  // Legacy v1 had no bedSlot. Keep valid reservations first, then assign
  // any remaining sleepers a distinct free half by actual route distance.
  // No preference or ownership of a bed side by Alex or Mira.
  const used=[];
  for(const id of HOUSEHOLD_IDS){
    const resident=getActor(root,id);
    if(resident.action?.id!=='bed'||!validBedSlot(resident.action.bedSlot))continue;
    if(!used.includes(resident.action.bedSlot))used.push(resident.action.bedSlot);
    else delete resident.action.bedSlot;
  }
  for(const id of HOUSEHOLD_IDS){
    const resident=getActor(root,id);
    if(resident.action?.id!=='bed'||validBedSlot(resident.action.bedSlot))continue;
    const slot=chooseFreeBedSlot(resident.position,used);
    if(slot){resident.action.bedSlot=slot;used.push(slot);}
    else resident.action=null;
  }
  return root;
}

export function getActor(root,id='alex') {
  return id==='mira' ? root.otherSim : root;
}
export function getActorName(id='alex') {
  return RESIDENT_NAMES[id] || RESIDENT_NAMES.alex;
}
export function selectResident(root,id) {
  if (!HOUSEHOLD_IDS.includes(id)) return false;
  root.selectedSim=id;
  return true;
}

/** Choose the nearest *reachable* unoccupied bed half. This is not tied to
 * identity; either resident can sleep on either side on different nights.
 */
export function chooseFreeBedSlot(position,occupied=[]) {
  const origin=nearestWalkable(position);
  let best=null,bestCost=Infinity;
  for(const id of BED_SLOT_IDS){
    if(occupied.includes(id))continue;
    const to=BED_SLOTS[id].approach;
    const path=findPath(origin,to);
    if(!path)continue;
    let prev=origin,cost=0;
    for(const point of path){
      cost+=Math.hypot(point.x-prev.x,point.z-prev.z);
      prev=point;
    }
    if(cost<bestCost){best=id;bestCost=cost;}
  }
  return best;
}
/** Two independently reserved physical halves, no owner-specific defaults.
 * Occupancy is kept in the existing optional v1 action.bedSlot.
 */
export function bedSlotFor(root,residentId='alex') {
  if(!HOUSEHOLD_IDS.includes(residentId))return null;
  const self=getActor(root,residentId);
  if(self?.action?.id==='bed'&&validBedSlot(self.action.bedSlot))
    return self.action.bedSlot;
  const other=getActor(root,residentId==='alex'?'mira':'alex');
  const taken=other?.action?.id==='bed'&&validBedSlot(other.action.bedSlot)
    ?[other.action.bedSlot]:[];
  return chooseFreeBedSlot(self.position,taken);
}
export function bedDestinationFor(root,residentId='alex'){
  const slot=bedSlotFor(root,residentId);
  return slot?{...BED_SLOTS[slot].approach}:null;
}
/** Beds capacity=2; each of the other furniture actions remains exclusive. */
export function furnitureAvailable(root,itemId,residentId='alex') {
  if(itemId==='bed')return bedSlotFor(root,residentId)!==null;
  const other=getActor(root,residentId==='alex'?'mira':'alex');
  return other?.action?.id!==itemId;
}
export function chooseResidentAction(root,itemId,automatic=false,residentId='alex') {
  if (!HOUSEHOLD_IDS.includes(residentId) || !furnitureAvailable(root,itemId,residentId)) return false;
  const resident=getActor(root,residentId);
  if (!resident || (automatic && root.socialAction)) return false;
  if(!automatic && root.socialAction)cancelSocial(root);
  const slot=itemId==='bed'?bedSlotFor(root,residentId):null;
  const chosen=chooseAction(resident,itemId,automatic);
  if(chosen&&itemId==='bed')resident.action.bedSlot=slot;
  return chosen;
}

/** One global autonomy preference, mirrored into both independent actor controllers. */
export function setHouseholdAutonomy(root,enabled) {
  setAutonomyEnabled(root,enabled);
  if (root.otherSim) setAutonomyEnabled(root.otherSim,enabled);
  if(!root.autonomy.enabled&&root.socialAction?.automatic)cancelSocial(root);
  return root.autonomy.enabled;
}

/** A single time step, applied to both actors without doubling the household clock. */
export function tickHousehold(root,minutes) {
  // A paused or invalid tick must be completely side-effect free, including Mira's fields.
  if (root.paused || !Number.isFinite(minutes) || minutes<=0) return;
  const other=root.otherSim;
  if (!other) return tick(root,minutes);
  other.minutes=root.minutes;
  other.paused=root.paused;
  other.speed=root.speed;
  other.autonomy.enabled=root.autonomy.enabled;
  tick(root,minutes);
  tick(other,minutes);
  // Both clocks remain identical (including when paused).
  other.minutes=root.minutes;
  tickSocial(root,minutes);
}

export function residentAutonomousChoice(root,id='alex') {
  if(root.socialAction)return null;
  const resident=getActor(root,id);
  if (!root.autonomy.enabled || !resident) return null;
  resident.autonomy.enabled=root.autonomy.enabled;
  resident.paused=root.paused;
  resident.minutes=root.minutes;
  const proposal=autonomousChoice(resident);
  return proposal && furnitureAvailable(root,proposal,id) ? proposal : null;
}
