/** Three original musical motifs, generated on demand. No third-party audio or streams.
 * Web Audio exists ONLY after a direct click; render/update is autoplay-safe.
 */
import {actionDuration} from './simulation.js';
import {SHOWER_WASH_START,SHOWER_WASH_END} from './shower-interaction.js';
import {currentSkillLevel} from './skills-engine.js';
import {HOBBY_SKILLS,MUSIC_SKILL_ID} from './hobby-reading.js';
export const MUSIC_STYLE_NOTES=Object.freeze({
  'music.calm':Object.freeze([261.63,329.63,392,329.63,293.66,261.63,220,293.66]),
  'music.rhythmic':Object.freeze([220,330,440,330,293.66,440,392,330]),
  'music.dreamy':Object.freeze([349.23,523.25,493.88,392,440,587.33,523.25,392])
});
// Shower cues are not selectable stereo tracks.
export const SHOWER_SINGING_NOTES=Object.freeze({
  'shower.beginner':Object.freeze([262,318,403,327,287,267,223,285]),
  'shower.confident':Object.freeze([261.63,329.63,392,329.63,293.66,261.63,220,293.66])
});
const AUDIO_CUES=Object.freeze({...MUSIC_STYLE_NOTES,...SHOWER_SINGING_NOTES});
export function audibleMusicStyle(actors,{paused=false,hidden=false,editing=false}={}){
  if(paused||hidden||editing||!Array.isArray(actors))return null;
  const actor=actors.find(a=>a?.action?.id==='music'&&a.action.phase==='using'&&
    Object.hasOwn(MUSIC_STYLE_NOTES,a.action.contentId)&&
    a.activitySession?.phase==='using'&&
    a.activitySession.targetInstanceId===a.action.targetInstanceId);
  if(actor)return actor.action.contentId;
  const singer=actors.find(a=>{
    const action=a?.action,duration=actionDuration(action);
    return action?.id==='shower'&&action.phase==='using'&&action.showerSinging===true&&
      action.automatic===false&&duration>0&&action.elapsed>=duration*SHOWER_WASH_START&&
      action.elapsed<duration*SHOWER_WASH_END;
  });
  return singer?(currentSkillLevel(singer.skills,HOBBY_SKILLS,MUSIC_SKILL_ID)>=3?
    'shower.confident':'shower.beginner'):null;
}
export function createMusicAudio({contextFactory=null}={}){
  let context=null,master=null,enabled=false,muted=true,style=null;
  let nextTime=0,index=0;
  function volume(level){
    if(!context||!master)return;
    const now=context.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(level,now,.025);
  }
  async function enable(){
    if(!context){
      try{
        const Ctor=globalThis.AudioContext||globalThis.webkitAudioContext;
        context=contextFactory?contextFactory():(Ctor?new Ctor():null);
        if(!context)return false;
        master=context.createGain();
        master.gain.value=0;
        master.connect(context.destination);
      }catch{context=null;master=null;return false;}
    }
    try{
      // Resume executes in the caller's genuine touch/click handler.
      const pending=context.resume();
      if(pending&&typeof pending.then==='function')await pending;
      enabled=context.state==='running';
      if(enabled)muted=false;
      return enabled;
    }catch{enabled=false;return false;}
  }
  function setMuted(value){
    muted=Boolean(value);
    if(muted){style=null;volume(0);}
  }
  function note(hz,at,duration,type){
    const osc=context.createOscillator(),gain=context.createGain();
    osc.type=type;
    osc.frequency.setValueAtTime(hz,at);
    gain.gain.setValueAtTime(.0001,at);
    gain.gain.exponentialRampToValueAtTime(.65,at+.035);
    gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    osc.connect(gain);gain.connect(master);
    osc.start(at);osc.stop(at+duration+.025);
  }
  function update(requested){
    const allowed=enabled&&!muted&&context?.state==='running'&&
      Object.hasOwn(AUDIO_CUES,requested||'');
    if(!allowed){style=null;volume(0);return false;}
    if(requested!==style){style=requested;index=0;nextTime=context.currentTime+.035;}
    volume(style.startsWith('shower.')?.028:.045);
    const notes=AUDIO_CUES[style],step=style==='music.rhythmic'?.23:.38;
    nextTime=Math.max(nextTime,context.currentTime);
    for(let count=0;count<3&&nextTime<context.currentTime+.32;count++){
      note(notes[index%notes.length],nextTime,step*.85,
        style==='music.rhythmic'?'triangle':'sine');
      index++;nextTime+=step;
    }
    return true;
  }
  return Object.freeze({enable,setMuted,update,
    status:()=>({enabled,muted,available:!!context,running:context?.state==='running'})});
}
