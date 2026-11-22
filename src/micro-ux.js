/** MICRO-UX-R1: engine-agnostic, transient presentation policies. */
export function sleepZzzVisible(actor,suppressed=false){
  return !suppressed&&actor?.action?.id==='bed'&&actor.action.phase==='using';
}
/** Called after the existing camera gesture session confirms a short single tap. */
export function dismissOnCanvasTap({tap=false,target=null,modal=false,editing=false,
  menuOpen=false}={}){
  return Boolean(tap&&target==='empty'&&!modal&&!editing&&menuOpen);
}
