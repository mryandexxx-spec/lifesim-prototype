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

/**
 * World picking is performed on classified pointerup, before the browser
 * dispatches its compatibility click. A newly displayed DOM control can
 * become that click's target (WebKit and Chromium). Claim the click by the
 * originating primary pointer gesture, not by the destination or a timer.
 * The next independent pointerdown always replaces ownership.
 */
export function installWorldClickOwnership(root,canvas){
  const doc=root?.ownerDocument;
  const host=doc?.defaultView;
  if(!host||!canvas)return ()=>{};
  let owner=null;
  const clear=()=>{owner=null;};
  const down=event=>{
    if(event.isPrimary===false)return;
    owner=event.isTrusted&&event.button===0&&event.target===canvas
      ?{id:event.pointerId,released:false}:null;
  };
  const up=event=>{
    if(owner?.id===event.pointerId)owner.released=true;
  };
  const cancel=event=>{
    if(owner?.id===event.pointerId)clear();
  };
  const click=event=>{
    // Keyboard/assistive activation (detail 0, no physical pointer) and
    // intentional programmatic clicks are not world compatibility clicks.
    if(!event.isTrusted||!(event.detail>0||
      event.pointerType==='touch'||event.pointerType==='pen'))return;
    if(!owner?.released)return;
    clear();
    if(!root.contains(event.target))return;
    if(event.cancelable)event.preventDefault();
    event.stopImmediatePropagation();
  };
  const visibility=()=>{if(doc.hidden)clear();};
  const handlers={pointerdown:down,pointerup:up,pointercancel:cancel,click,blur:clear};
  // Window capture runs before both the world pointerup dispatcher and any
  // document/DOM click listeners, including parcel capture handlers.
  for(const [type,fn] of Object.entries(handlers))host.addEventListener(type,fn,true);
  doc.addEventListener('visibilitychange',visibility);
  return ()=>{
    clear();
    for(const [type,fn] of Object.entries(handlers))host.removeEventListener(type,fn,true);
    doc.removeEventListener('visibilitychange',visibility);
  };
}

export function installMobileGesturePolicy(root,canvas) {
  if(!root?.addEventListener)return ()=>{};
  const uninstallOwnership=installWorldClickOwnership(root,canvas);
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
    uninstallOwnership();
    guardedEvents.forEach(type=>root.removeEventListener(type,guard,listenerOptions));
    pinchEvents.forEach(type=>canvas?.removeEventListener?.(type,suppressCanvasPinch,pinchOptions));
  };
}
