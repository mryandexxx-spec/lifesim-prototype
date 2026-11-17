/** Scoped Safari touch fallback for the LifeSim app shell.
 * CSS touch-action:manipulation prevents double-tap PAGE zoom while letting
 * scrollable sheets work. Canvas touch-action:none keeps camera pinch/orbit.
 * Only block native callouts/text selection/HTML dragging on non-editable UI;
 * do not swallow touchstart/end or pointer events used by gameplay.
 */
const EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';

export function isEditableGestureTarget(target) {
  const element=target?.nodeType===3?target.parentElement:target;
  return Boolean(element?.isContentEditable || element?.closest?.(EDITABLE_SELECTOR));
}

export function preventNativeGameGesture(event) {
  if(!event?.cancelable || isEditableGestureTarget(event.target))return false;
  event.preventDefault();
  return true;
}

export function installMobileGesturePolicy(root,canvas) {
  if(!root?.addEventListener)return ()=>{};
  const guard=event=>{preventNativeGameGesture(event);};
  const listenerOptions={capture:true};
  const guardedEvents=['contextmenu','selectstart','dragstart'];
  guardedEvents.forEach(type=>root.addEventListener(type,guard,listenerOptions));

  // Legacy WebKit GestureEvents can zoom the webpage during a canvas pinch,
  // even when the game expects two PointerEvents for its camera controller.
  // Do not attach these to menus or form controls.
  const suppressCanvasPinch=event=>{if(event.cancelable)event.preventDefault();};
  const pinchEvents=['gesturestart','gesturechange'];
  const pinchOptions={passive:false};
  pinchEvents.forEach(type=>canvas?.addEventListener?.(type,suppressCanvasPinch,pinchOptions));
  return ()=>{
    guardedEvents.forEach(type=>root.removeEventListener(type,guard,listenerOptions));
    pinchEvents.forEach(type=>canvas?.removeEventListener?.(type,suppressCanvasPinch,pinchOptions));
  };
}
