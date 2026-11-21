/** HUD-R1: ephemeral event arrows only while the *visible* need value changes.
 * Comparison uses the same rounded percentage displayed by the real HUD.
 * Passive decay stays quiet between one-point steps; a genuinely active
 * recovery shows repeated ↑ events. Never modifies simulation/save state.
 */
export const NEED_TREND_FLASH_MS=1000;
export const NEED_TREND_SAMPLE_GAP_MS=5000;
export const NEED_TREND_MAX_GAME_GAP_MINUTES=60;
const NEED_IDS=Object.freeze(['hunger','energy','hygiene','fun','social','bladder']);
const RESIDENT_IDS=Object.freeze(['alex','mira']);
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const idle=()=>({direction:'idle',symbol:'',label:'',visible:false});
const arrow=direction=>({
  direction,symbol:direction==='up'?'↑':'↓',
  label:direction==='up'?'Повышается':'Снижается',visible:true
});
const toDisplay=value=>finite(value)?Math.round(Math.max(0,Math.min(100,value))):null;
/** Return a read-only snapshot for both actors. nowMs uses browser elapsed
 * milliseconds, not game time; pause/visibility explicitly clears flashes.
 */
export function createNeedTrendTracker(){
 let rootRef=null,lastMinute=null,lastAtMs=null;
 const actors={alex:null,mira:null};
 const previous={alex:{},mira:{}};
 const clear=()=>{for(const id of RESIDENT_IDS){actors[id]=null;previous[id]={};}};
 return {
  reset(){rootRef=null;lastMinute=null;lastAtMs=null;clear();},
  observe(root,{paused=false,nowMs=0}={}){
   const minutes=root?.minutes;
   const invalid= !finite(minutes)||!finite(nowMs);
   const discontinuous=lastMinute!==null&&(
     minutes<lastMinute-.001||minutes-lastMinute>NEED_TREND_MAX_GAME_GAP_MINUTES||
     nowMs<lastAtMs||nowMs-lastAtMs>NEED_TREND_SAMPLE_GAP_MS);
   if(root!==rootRef||invalid||discontinuous){
     rootRef=root;clear();
   }
   lastMinute=finite(minutes)?minutes:null;
   lastAtMs=finite(nowMs)?nowMs:null;
   const result={};
   for(const id of RESIDENT_IDS){
     const actor=id==='alex'?root:root?.otherSim;
     if(actor!==actors[id]){actors[id]=actor;previous[id]={};}
     result[id]={};
     for(const need of NEED_IDS){
       const current=toDisplay(actor?.needs?.[need]);
       const old=previous[id][need];
       // No arrow on first sample, invalid needs, paused clock, or missing actor.
       if(current===null){
         previous[id][need]=null;
         result[id][need]=idle();
         continue;
       }
       const state=old??{value:current,direction:'idle',until:0};
       if(paused||invalid){
         previous[id][need]={value:current,direction:'idle',until:0};
         result[id][need]=idle();
         continue;
       }
       if(current!==state.value){
         const direction=current>state.value?'up':'down';
         previous[id][need]={value:current,direction,until:nowMs+NEED_TREND_FLASH_MS};
         result[id][need]=arrow(direction);
         continue;
       }
       if(state.until>nowMs&&state.direction!=='idle'){
         result[id][need]=arrow(state.direction);
       }else{
         result[id][need]=idle();
       }
       previous[id][need]={...state,value:current};
     }
   }
   return result;
  }
 };
}
