import {canShowMeshy, meshClipFor, availableMeshClips,
  MESHY_ASSET_URL, meshPlacement,MESHY_SEAT_RIG_PROFILE,
  ALEX_GREETING_CLIP,alexGreetingClipTime} from './meshy-visual-policy.js';
import {MESHY_SOFA_CLIP,meshySitClipTime,meshySofaOffset,meshySofaVerticalLift} from './meshy-sofa-pose.js';
import {createSkinnedSeatController} from './meshy-seat-runtime.js';

/**
 * Meshy visual adapter for the EXISTING LifeSim procedural character root.
 * Navigation, action poses, selection ring and localStorage remain on the old rig.
 * Its existing avatar remains authoritative for motion, selection and props.
 * The sofa uses the audited Sit-to-Stand clip, scrubbed from real transition
 * progress with X/Z hip root-motion compensation. Bed/fridge/shower still use
 * the tested procedural rig until their poses have been retargeted.
 */
export function createMeshyVisual({pc,app,rig,footIK=true,footPlant=false,onStatus=()=>{}}) {
  const hiddenFromReplacement=new Set([rig.selected,rig.snack,rig.book,rig.showerWrap]);
  const legacyRenderers=rig.avatar.findComponents('render')
    .filter(component=>!hiddenFromReplacement.has(component.entity));
  const state={status:'loading',ready:false,root:null,model:null,clip:null,visible:false,error:null,
    scale:1,base:{x:0,y:0,z:0},sofaOffset:{x:0,y:0,z:0},sofaRelease:null,
    seatRuntime:null,seatWarning:false,greetingDuration:0};
  let requested=false;

  function attach(container){
    const model=container.resource.instantiateRenderEntity();
    // Fit in an identity parent before attaching beneath the moving game rig.
    // Model-space glTF bones and animations remain untouched.
    const root=new pc.Entity('Meshy Alex visual');
    app.root.addChild(root);
    root.addChild(model);
    try{
      // Skinned mesh AABBs can include animated bone transforms, depending on
      // frame/time when the PlayCanvas container is instantiated. Use the
      // audited ORIGINAL GLB POSITION accessor dimensions instead, so Alex
      // is consistently the same size on Safari.
      const base=meshPlacement();
      const scale=base.scale;
      model.setLocalScale(scale,scale,scale);
      model.setLocalPosition(base.x,base.y,base.z);
      state.scale=scale;state.base=base;
      model.addComponent('anim',{activate:true});
      const clips=(container.resource.animations||[]).map(item=>item.resource);
      if(!availableMeshClips(clips.map(clip=>clip.name)))
        throw Error('Missing required Meshy animation clips');
      state.greetingDuration=clips.find(clip=>clip.name===ALEX_GREETING_CLIP)?.duration||0;
      for(const clip of clips)model.anim.assignAnimation(
        clip.name,clip,undefined,1,
        !['Sit_to_Stand_Transition_M','Wave_One_Hand','Call_Gesture'].includes(clip.name)
      );
      model.anim.baseLayer.play('Idle_3');
      model.anim.playing=false;
      // The root has identity local transform, and therefore follows the
      // existing Alex avatar's x/z, heading, paused movement and body lift.
      rig.avatar.addChild(root);
      // A contact profile belongs to the imported humanoid, not any couch.
      // Rendering falls back to the old clip offset if a future GLB has no
      // compatible bone hierarchy (this does not block other game actions).
      if(typeof model.findByName==='function')try{
        state.seatRuntime=createSkinnedSeatController({
          pc,model,avatar:rig.avatar,profile:MESHY_SEAT_RIG_PROFILE,
          footIK,footPlant
        });
      }catch(error){console.warn('Meshy seat contact unavailable',error);}
      root.enabled=false;
      state.root=root;state.model=model;state.clip='Idle_3';
      state.ready=true;state.status='ready';
      onStatus('ready');
    }catch(error){root.destroy();throw error;}
  }

  const asset=new pc.Asset('LifeSim Meshy Alex','container',{url:MESHY_ASSET_URL});
  app.assets.add(asset);
  asset.ready(()=>{
    try{attach(asset);}catch(error){
      state.status='error';state.error=String(error?.message||error);
      onStatus('error',state.error);
    }
  });
  asset.once('error',error=>{
    state.status='error';state.error=String(error?.message||error);
    onStatus('error',state.error);
  });
  app.assets.load(asset);

  return {
    get ready(){return state.ready;},
    get status(){return state.status;},
    get error(){return state.error;},
    update({preferred=false,paused=false,walking=false,social=null,actionId=null,
      sofaBusy=false,sofaWeight=0,seat=null,seatMode='vertical',dt=0,
      bedBusy=false,showerBusy=false,fridgeBusy=false,
      socialInitiator=false,socialElapsed=null}={}){
      requested=preferred;
      const useMeshy=canShowMeshy({
        preferred:requested,ready:state.ready,actionId,sofaBusy,bedBusy,showerBusy,fridgeBusy
      });
      if(state.visible!==useMeshy){
        for(const comp of legacyRenderers)comp.enabled=!useMeshy;
        if(state.root)state.root.enabled=useMeshy;
        state.visible=useMeshy;
      }
      if(!useMeshy||!state.model)return useMeshy;
      const sofa=actionId==='sofa'||sofaBusy;
      const anim=state.model.anim;
      if(sofa){
        // This clip is authored SIT -> STAND.  Reverse-scrub it from the
        // existing sofa bend progress, which also freezes when paused.
        if(state.clip!==MESHY_SOFA_CLIP){
          anim.baseLayer.play(MESHY_SOFA_CLIP);
          state.clip=MESHY_SOFA_CLIP;
          state.sofaRelease=null;
        }
        // Set the source clip's time BEFORE reading animated joint matrices.
        // The old order solved contact against a previous-frame pose, then
        // advanced the animation, which could kick knees and soles on motion.
        anim.speed=0;
        anim.playing=true;
        anim.baseLayer.activeStateCurrentTime=meshySitClipTime(sofaWeight);
        if(seat && state.seatRuntime){
          try{
            const horizontalOffset=meshySofaOffset(sofaWeight,state.scale);
            const placed=seatMode==='full'
              ? state.seatRuntime.place({
                seat,weight:sofaWeight,scale:state.scale,base:state.base,
                ik:true
              })
              : state.seatRuntime.placeVertical({
                seat,weight:sofaWeight,scale:state.scale,base:state.base,
                horizontalOffset
              });
            state.sofaOffset=placed.offset;
          }catch(error){
            // Keep the accepted 0.7b model rather than crashing gameplay if
            // a malformed furniture prefab or rig contact cannot be solved.
            if(!state.seatWarning){
              state.seatWarning=true;
              console.warn('Meshy contact solve fallback',error);
            }
            state.seatRuntime=null;
          }
        }
        if(!seat||!state.seatRuntime){
          // Backward-compatibility fallback for missing rig bones or bad seat
          // metadata. The production sofa passes a SeatSurface by default.
          const correction=meshySofaOffset(sofaWeight,state.scale);
          const lift=meshySofaVerticalLift(sofaWeight,state.scale,state.base.y);
          state.sofaOffset={...correction,y:lift};
          state.model.setLocalPosition(state.base.x+correction.x,
            state.base.y+lift,state.base.z+correction.z);
        }
        // The game's timeline, not independent GLB time/root motion, owns
        // the seat. The scrub was applied before the contact/foot pass.
        return true;
      }
      const greetingTime=alexGreetingClipTime({
        social,initiator:socialInitiator,elapsed:socialElapsed,
        duration:state.greetingDuration
      });
      if(greetingTime!==null){
        // Friendly greeting is a deterministic one-shot, not a looping clip.
        if(state.clip!==ALEX_GREETING_CLIP){
          anim.baseLayer.play(ALEX_GREETING_CLIP);
          state.clip=ALEX_GREETING_CLIP;
        }
        anim.speed=0;
        anim.playing=true;
        anim.baseLayer.activeStateCurrentTime=greetingTime;
        state.model.setLocalPosition(state.base.x,state.base.y,state.base.z);
        return true;
      }
      const target=meshClipFor({walking,social});
      if(state.clip===MESHY_SOFA_CLIP){
        // Blend both the bone pose and its root-motion correction back to
        // regular locomotion, avoiding a 30-cm standing pose pop.
        state.sofaRelease={remaining:.20,offset:{...state.sofaOffset}};
      }
      anim.speed=1;
      if(target!==state.clip){
        anim.baseLayer.transition(target,.20);
        state.clip=target;
      }
      if(state.sofaRelease){
        const r=state.sofaRelease;
        r.remaining=Math.max(0,r.remaining-(Number.isFinite(dt)?Math.max(0,dt):0));
        const weight=r.remaining/.20;
        state.model.setLocalPosition(state.base.x+r.offset.x*weight,
          state.base.y+r.offset.y*weight,state.base.z+r.offset.z*weight);
        if(r.remaining===0)state.sofaRelease=null;
      }else{
        state.model.setLocalPosition(state.base.x,state.base.y,state.base.z);
      }
      anim.playing=!paused;
      return true;
    },
    reset(){
      // Reset/Load do not destroy or reimport the skin; next update will
      // reselect the correct visual mode from current game state.
      if(state.model&&state.ready){
        state.model.anim.speed=1;
        state.model.anim.baseLayer.play('Idle_3');
        state.clip='Idle_3';
        state.sofaOffset={x:0,y:0,z:0};
        state.sofaRelease=null;
        state.model.setLocalPosition(state.base.x,state.base.y,state.base.z);
      }
    }
  };
}
