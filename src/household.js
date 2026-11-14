/** Two-person household without importing PlayCanvas, DOM or browser APIs.
 * Legacy root fields remain Alex's exact v1 state; otherSim is an optional extension.
 */
import { newGame, loadGame, tick, chooseAction, autonomousChoice, setAutonomyEnabled } from './simulation.js';
import { refreshMind } from './psychology.js';
import { newRelationship,loadRelationship,loadSocialAction,cancelSocial,
  tickSocial } from './relationships.js';

export const HOUSEHOLD_IDS = Object.freeze(['alex', 'mira']);
export const RESIDENT_NAMES = Object.freeze({ alex: 'Алекс', mira: 'Мира' });
export const RESIDENT_START = Object.freeze({ x: -0.80, z: 2.95 });

function newMira(minutes=480) {
  const mira=newGame();
  mira.position={ ...RESIDENT_START };
  mira.needs={ hunger: 72, energy: 86, hygiene: 75, fun: 72 };
  mira.minutes=minutes;
  mira.autonomy.nextAt=minutes;
  mira.event='Свободное время';
  refreshMind(mira);
  return mira;
}

export function newHousehold() {
  const state=newGame();
  state.otherSim=newMira(state.minutes);
  state.selectedSim='alex';
  state.relationship=newRelationship(state.minutes);
  state.socialAction=null;
  return state;
}

/** Do not change save key or version: parse and sanitize each resident using v1 loader. */
export function loadHousehold(raw) {
  if (!raw || raw.version!==1) return newHousehold();
  const root=loadGame(raw);
  const validMira=raw.otherSim && typeof raw.otherSim==='object' && !Array.isArray(raw.otherSim) &&
    raw.otherSim.version===1 && raw.otherSim.needs && raw.otherSim.position;
  // Ignore saved clock/speed/pause for Mira; the household has one shared clock.
  const mira=validMira
    ? loadGame({ ...raw.otherSim, minutes:root.minutes, paused:root.paused, speed:root.speed,
        autonomy:{ ...raw.otherSim.autonomy, enabled:root.autonomy.enabled } })
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

/** Each piece of furniture has a single interaction slot. */
export function furnitureAvailable(root,itemId,residentId='alex') {
  const other=getActor(root,residentId==='alex'?'mira':'alex');
  return other?.action?.id!==itemId;
}
export function chooseResidentAction(root,itemId,automatic=false,residentId='alex') {
  if (!HOUSEHOLD_IDS.includes(residentId) || !furnitureAvailable(root,itemId,residentId)) return false;
  const resident=getActor(root,residentId);
  if (!resident || (automatic && root.socialAction)) return false;
  if(!automatic && root.socialAction)cancelSocial(root);
  return chooseAction(resident,itemId,automatic);
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
