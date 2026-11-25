/** MICRO-UX-R1: engine-agnostic, transient presentation policies. */
export function sleepZzzVisible(actor,suppressed=false){
  return !suppressed&&actor?.action?.id==='bed'&&actor.action.phase==='using';
}
/** Called after the existing camera gesture session confirms a short single tap. */
export function dismissOnCanvasTap({tap=false,target=null,modal=false,editing=false,
  menuOpen=false}={}){
  return Boolean(tap&&target==='empty'&&!modal&&!editing&&menuOpen);
}

/** UI-only double-tap recognizer. No timer delays selection, no persisted state. */
export const RESIDENT_DOUBLE_TAP_MS=350;
export function createResidentDoubleTap(){
  let previous=null;
  return {
    clear(){previous=null;},
    tap(id,now,physical=true){
      if(!physical||typeof id!=='string'||!id||!Number.isFinite(now)){
        previous=null;return false;
      }
      if(previous&&previous.id===id&&now>=previous.now&&now-previous.now<=RESIDENT_DOUBLE_TAP_MS){
        previous=null;return true;
      }
      previous={id,now};return false;
    }
  };
}
