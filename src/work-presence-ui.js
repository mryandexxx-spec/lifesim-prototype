/** Read-only bridge between career phases and physical HUD/pick behavior.
 * No clock, wallet, queue, or saved state changes. A worker's last home
 * coordinates must not be exposed as an invisible interactive proxy.
 */
export function workPresenceView(phase,statusLabel=null){
  const offLot=phase==='working'||phase==='returning'||phase==='waiting';
  const unavailable=offLot||phase==='departing';
  const label=typeof statusLabel==='string'&&statusLabel.trim()?statusLabel.trim():null;
  return {
    hitTestable:!unavailable,
    overlayVisible:!offLot,
    statusOverride:unavailable?label:null,
    idleLabel:phase==='pending'?label:null
  };
}
