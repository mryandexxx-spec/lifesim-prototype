/** HUD-R1: transient two-resident need trends. Read-only and never serialized.
 * Compare actual need values over game time, rather than guessing from the
 * passive decay constants: actions, sleep, work and social receipts all count.
 */
export const NEED_TREND_WINDOW_MINUTES=8;
export const NEED_TREND_MIN_SPAN_MINUTES=3;
const ENTER_RATE=.006;
const EXIT_RATE=.003;
const NEED_IDS=Object.freeze(['hunger','energy','hygiene','fun','social','bladder']);
const RESIDENT_IDS=Object.freeze(['alex','mira']);
const STATUS=Object.freeze({
  up:Object.freeze({symbol:'↑',label:'Повышается'}),
  down:Object.freeze({symbol:'↓',label:'Снижается'}),
  flat:Object.freeze({symbol:'→',label:'Без изменений'}),
  unknown:Object.freeze({symbol:'→',label:'Собираем данные'}),
  paused:Object.freeze({symbol:'→',label:'Время остановлено'})
});
const abs=Math.abs;
const finite=n=>typeof n==='number'&&Number.isFinite(n);

/** A new tracker is created on browser boot. Nothing is written to root-v1. */
export function createNeedTrendTracker(){
  let rootRef=null;
  const history={alex:[],mira:[]};
  const previous={alex:{},mira:{}};
  const clear=()=>{
    for(const id of RESIDENT_IDS){history[id]=[];previous[id]={};}
  };
  const status=(direction,rate=0)=>({...STATUS[direction],direction,rate});
  return {
    reset(){rootRef=null;clear();},
    observe(root,{paused=false}={}){
      if(root!==rootRef){rootRef=root;clear();}
      const minutes=root?.minutes;
      const output={};
      for(const id of RESIDENT_IDS){
        const actor=id==='alex'?root:root?.otherSim;
        const latest=history[id].at(-1);
        if(!finite(minutes)||!actor?.needs){
          history[id]=[];previous[id]={};
          output[id]=Object.fromEntries(NEED_IDS.map(need=>[need,status('unknown')]));
          continue;
        }
        // Load/reset/clock rewind and discontinuous jumps need a clean baseline.
        if(latest&&(minutes<latest.minute-.001||minutes-latest.minute>60)){
          history[id]=[];previous[id]={};
        }
        const values=Object.fromEntries(NEED_IDS.map(need=>[
          need,finite(actor.needs[need])?actor.needs[need]:null
        ]));
        const records=history[id],last=records.at(-1);
        if(last&&abs(last.minute-minutes)<.001)last.values=values;
        else records.push({minute:minutes,values});
        while(records.length>1&&records[1].minute<=minutes-NEED_TREND_WINDOW_MINUTES)
          records.shift();
        // A hard cap also guards long-running background sessions and x3.
        while(records.length>80)records.shift();
        const first=records[0],span=minutes-first.minute;
        output[id]={};
        for(const need of NEED_IDS){
          if(paused){output[id][need]=status('paused');continue;}
          if(span<NEED_TREND_MIN_SPAN_MINUTES||
             !finite(first.values[need])||!finite(values[need])){
            output[id][need]=status('unknown');continue;
          }
          const rate=(values[need]-first.values[need])/span;
          const old=previous[id][need]||'flat';
          const direction=rate>ENTER_RATE||(old==='up'&&rate>EXIT_RATE)?'up':
            rate< -ENTER_RATE||(old==='down'&&rate< -EXIT_RATE)?'down':'flat';
          previous[id][need]=direction;
          output[id][need]=status(direction,rate);
        }
      }
      return output;
    }
  };
}
