/** Bлин’С: a player's multi-turn conversation choice gates SIMULATION TIME,
 * not the saved global paused preference. On reload, the restored session
 * itself recreates the gate. No extra save keys, automatic social receipts or
 * browser-specific state.
 */
const PHASES=new Set(['opening','response','followUp']);
export function dialogueNeedsDecision(root){
  const action=root?.socialAction;
  return action?.phase==='using'&&
    PHASES.has(action.conversation?.phase);
}
/** Choice callbacks execute synchronously, without advancing any game tick.
 * Respect a manually paused game: briefly lift its guard for the *chosen*
 * conversational action only, then restore the original pause flag even on
 * failure. Headless conversation-engine guard remains strict for normal calls.
 */
export function applyDialogueDecision(root,callback){
  if(!dialogueNeedsDecision(root)||typeof callback!=='function')return null;
  const wasPaused=root.paused===true;
  if(wasPaused)root.paused=false;
  try{return callback(root);}
  finally{if(wasPaused)root.paused=true;}
}
