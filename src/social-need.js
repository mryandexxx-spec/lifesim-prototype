/** M3: independent social need, shared by arbitrary resident identities.
 * Gain is authorised ONLY by the canonical *newly committed* social graph
 * receipt in the household adapter. No event replay, UI/DOM, or RNG.
 */
import {deriveAxes} from './trait-catalog.js';
import {NEED_DECAY_PER_MINUTE,SOCIAL_DECAY_PERSONALITY_SPREAD} from './need-balance.js';

export const SOCIAL_NEED_LEGACY_DEFAULT=75; // old v1 save: a neutral, non-critical start
export const SOCIAL_NEED_INITIAL=78;
const clamp=n=>Math.max(0,Math.min(100,n));
const isRecord=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const validId=id=>typeof id==='string'&&/^[a-zA-Z][a-zA-Z0-9_-]{0,47}$/.test(id);

/** Outgoing residents need company slightly more often; reserved people
 * are independent, not broken. Rates are PER in-game minute, not wall time.
 */
export function socialNeedDecayRate(profile){
  const sociability=deriveAxes(profile).sociability;
  return Math.max(.015,Math.min(.023,
    NEED_DECAY_PER_MINUTE.social+(sociability-.5)*SOCIAL_DECAY_PERSONALITY_SPREAD));
}

/** Whitelist of successful, completed communication receipts. Neither an
 * argument nor a social refusal improves this need. For conversation.talk
 * the dialogue engine only commits this type when the outcome is positive;
 * cancelled/unfinished turns never reach the recorder.
 */
export const SOCIAL_NEED_REWARDS=Object.freeze({
  talk:14,
  'conversation.talk':18,
  'acquaint.chat':13,
  'friend.tease':12,
  'friend.confide':18,
  'rival.truce':15,
  'gift.accepted':9,
  'leisure.accepted':20,
  'romance.flirt':10,
  'romance.confess':14,
  'romance.date':18,
  'romance.tender':14,
  'romance.propose':16,
  'romance.marry':18,
  'romance.checkin':13,
  'romance.repair':15,
  'romance.evening':18
});

/** Pure receipt->gain boundary for ANY N-person residents dictionary. Call
 * exactly once, only after applySocialEvent returned a fresh canonical
 * receipt. Identity and receipt shape are revalidated defensively.
 * Does NOT create social events, relationship changes or extra save fields.
 */
export function creditCompletedSocialNeed(residents,receipt){
  if(!isRecord(residents)||!isRecord(receipt)||
     !Number.isSafeInteger(receipt.seq)||receipt.seq<1||
     !Number.isFinite(receipt.at)||receipt.at<0||
     !validId(receipt.actorId)||!validId(receipt.targetId)||
     receipt.actorId===receipt.targetId||
     !Object.hasOwn(SOCIAL_NEED_REWARDS,receipt.type))return false;
  const a=residents[receipt.actorId],b=residents[receipt.targetId];
  if(!isRecord(a?.needs)||!isRecord(b?.needs))return false;
  const benefit=SOCIAL_NEED_REWARDS[receipt.type];
  for(const resident of [a,b]){
    const current=Number.isFinite(resident.needs.social)
      ?clamp(resident.needs.social):SOCIAL_NEED_LEGACY_DEFAULT;
    resident.needs.social=clamp(current+benefit);
  }
  return true;
}
