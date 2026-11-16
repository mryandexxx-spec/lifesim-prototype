import {canShowMeshy, meshClipFor, availableMeshClips,
  MESHY_ASSET_URL, meshPlacement,MESHY_SEAT_RIG_PROFILE,
  ALEX_GREETING_CLIP,alexGreetingClipTime,ALEX_ALTERNATE_IDLE_CLIP,
  alexIdleClipFor} from './meshy-visual-policy.js?v=1.2q';
import {MESHY_SOFA_CLIP,meshySitClipTime,meshySofaOffset,meshySofaVerticalLift} from './meshy-sofa-pose.js';
import {createSkinnedSeatController} from './meshy-seat-runtime.js';
import {createMeshyFridgeController} from './meshy-fridge-runtime.js';
import {createMeshyBedController} from './meshy-bed-runtime.js';
import {createMeshyShowerController,meshyShowerPose,showerWalkClipTime}
  from './meshy-shower-runtime.js';
import {hasToiletSitClip,meshyToiletPose} from './meshy-toilet-pose.js';
import {createMeshyHugController} from './meshy-hug-runtime.js';
import {createMeshyKissController} from './meshy-kiss-runtime.js';
import {createMeshyReadingController} from './meshy-reading-runtime.js?v=1.2q';

/**
 * Meshy visual adapter for the EXISTING LifeSim procedural character root.
 * Navigation, action poses, selection ring and localStorage remain on the old rig.
 * Its existing avatar remains authoritative for motion, selection and props.
 * The sofa uses the audited Sit-to-Stand clip, scrubbed from real transition
 * progress with X/Z hip root-motion compensation. Bed uses the existing
 * side-entry game root with a guarded post-Anim skeletal pose. Shower uses
 * the same skin for dressed entry/exit, but the entire avatar is hidden
 * behind the existing opaque privacy enclosure for washing.
 */
export function createMeshyVisual({pc,app,rig,footIK=true,footPlant=false,
  fridgeLayout=null,partnerAvatar=null,onStatus=()=>{}}) {
  const hiddenFromReplacement=new Set([rig.selected,rig.snack,rig.book,rig.showerWrap]);
  const legacyRenderers=rig.avatar.findComponents('render')
    .filter(component=>!hiddenFromReplacement.has(component.entity));
  const state={status:'loading',ready:false,root:null,model:null,clip:null,visible:false,error:null,
    scale:1,base:{x:0,y:0,z:0},sofaOffset:{x:0,y:0,z:0},sofaRelease:null,
    seatRuntime:null,seatWarning:false,greetingDuration:0,fridgeRuntime:null,
    bedRuntime:null,showerRuntime:null,hugRuntime:null,readingRuntime:null,walkDuration:0,toiletReady:false,
    alternateIdleAvailable:false};
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
      state.walkDuration=clips.find(clip=>clip.name==='Walking')?.duration||0;
      state.toiletReady=state.walkDuration>0&&hasToiletSitClip(clips,'alex');
      state.alternateIdleAvailable=clips.some(
        clip=>clip.name===ALEX_ALTERNATE_IDLE_CLIP
      );
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
      // A stable post-Anim script for the right arm and hand-attached snack.
      // If the rig lacks bones or Script support, retain procedural fridge.
      try{
        const fridge=createMeshyFridgeController({pc,model,avatar:rig.avatar,
          layout:fridgeLayout||undefined});
        if(fridge.ready&&pc.Script&&typeof model.addComponent==='function'){
          class FridgePostUpdate extends pc.Script{
            static scriptName='blinsAlexFridgePostUpdate';
            postUpdate(){fridge.apply();}
          }
          model.addComponent('script');
          model.script.create(FridgePostUpdate);
          state.fridgeRuntime=fridge;
        }
      }catch(error){
        console.warn('Meshy fridge arm unavailable',error);
        state.fridgeRuntime=null;
      }
      // The bed animator shares the same Script component (if any) as the
      // fridge hand overlay, but operates on disjoint frames/action states.
      try{
        const bed=createMeshyBedController({pc,model});
        if(bed.ready&&pc.Script){
          if(!model.script)model.addComponent('script');
          class BedPostUpdate extends pc.Script{
            static scriptName='blinsAlexBedPostUpdate';
            postUpdate(){bed.apply();}
          }
          model.script.create(BedPostUpdate);
          state.bedRuntime=bed;
        }
      }catch(error){
        console.warn('Meshy bed rig unavailable',error);
        state.bedRuntime=null;
      }
      // Safe shower: only fully clothed entry/exit is visible. The game's
      // applyShowerAppearance() hides the entire avatar while private.
      try{
        const shower=createMeshyShowerController({pc,model});
        if(shower.ready&&pc.Script){
          if(!model.script)model.addComponent('script');
          class ShowerPostUpdate extends pc.Script{
            static scriptName='blinsAlexShowerPostUpdate';
            postUpdate(){shower.apply();}
          }
          model.script.create(ShowerPostUpdate);
          state.showerRuntime=shower;
        }
      }catch(error){
        console.warn('Meshy shower arm unavailable',error);
        state.showerRuntime=null;
      }
      // Independent pair-contact pose overlay, post-Anim and visual-only.
      try{
        if(pc.Script&&model.findByName&&partnerAvatar){
          const hug=createMeshyHugController({pc,model,
            avatar:rig.avatar,partnerAvatar});
          if(hug.ready){
            if(!model.script)model.addComponent('script');
            class AlexHugPostUpdate extends pc.Script{
              static scriptName='blinsAlexHugPostUpdate';
              postUpdate(){hug.apply();}
            }
            model.script.create(AlexHugPostUpdate);
            state.hugRuntime=hug;
          }
        }
      }catch(error){
        state.hugRuntime=null;
        console.warn('Alex hug rig unavailable',error);
      }
      try{
        if(pc.Script&&model.findByName){
          const kiss=createMeshyKissController({pc,model});
          if(kiss.ready){
            if(!model.script)model.addComponent('script');
            class AlexKissPostUpdate extends pc.Script{
              static scriptName='blinsAlexKissPostUpdate';
              postUpdate(){kiss.apply();}
            }
            model.script.create(AlexKissPostUpdate);
            state.kissRuntime=kiss;
          }
        }
      }catch(error){state.kissRuntime=null;console.warn('Alex kiss rig unavailable',error);}
      // H1: rigged book + two-hand post-Anim motion, without changing gameplay.
      // A missing joint or Script support retains the procedural H1 fallback.
      try{
        const reading=createMeshyReadingController({
          pc,model,avatar:rig.avatar,resident:'Alex'
        });
        if(reading.ready&&pc.Script){
          if(!model.script)model.addComponent('script');
          class AlexReadingPostUpdate extends pc.Script{
            static scriptName='blinsAlexReadingPostUpdate';
            postUpdate(){reading.apply();}
          }
          model.script.create(AlexReadingPostUpdate);
          state.readingRuntime=reading;
        }
      }catch(error){console.warn('Alex reading rig unavailable',error);}
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
    // Opt-in QA displays facts from actual runtime post-Anim bone rotations,
    // not only an eligible social receipt / movement between residents.
    get hugStatus(){return {modelReady:state.ready,visible:state.visible,
      controllerReady:Boolean(state.hugRuntime?.ready),
      ...(state.hugRuntime?.status?.()||{})};},
    get kissStatus(){return {modelReady:state.ready,visible:state.visible,
      controllerReady:Boolean(state.kissRuntime?.ready),
      ...(state.kissRuntime?.status?.()||{})};},
    get ready(){return state.ready;},
    get status(){return state.status;},
    get error(){return state.error;},
    update({preferred=false,paused=false,walking=false,social=null,actionId=null,
      sofaBusy=false,sofaWeight=0,seat=null,seatMode='vertical',dt=0,
      bedBusy=false,bedFrame=null,showerBusy=false,showerFrame=null,
      toiletBusy=false,toiletFrame=null,fridgeBusy=false,
      socialInitiator=false,socialElapsed=null,hugFrame=null,kissFrame=null,fridgeFrame=null,
      worldMinutes=null,mood=null,energy=null,readingElapsed=null}={}){
      requested=preferred;
      const useMeshy=canShowMeshy({
        preferred:requested&&(!hugFrame?.active||Boolean(state.hugRuntime?.ready))&&
          (!kissFrame?.active||Boolean(state.kissRuntime?.ready)),ready:state.ready,actionId,sofaBusy,bedBusy,showerBusy,
        fridgeBusy,fridgeReady:Boolean(state.fridgeRuntime?.ready),
        readingReady:Boolean(state.readingRuntime?.ready),
        bedReady:Boolean(state.bedRuntime?.ready),
        showerReady:Boolean(state.showerRuntime?.ready),
        toiletBusy,toiletReady:state.toiletReady
      });
      if(state.visible!==useMeshy){
        for(const comp of legacyRenderers)comp.enabled=!useMeshy;
        if(state.root)state.root.enabled=useMeshy;
        state.visible=useMeshy;
      }
      if(!useMeshy||!state.model){
        state.readingRuntime?.setFrame(null);
        state.fridgeRuntime?.setFrame(null);
        state.readingRuntime?.setFrame(null);
        state.hugRuntime?.setFrame(null);
        state.kissRuntime?.setFrame(null);
        state.bedRuntime?.setFrame(null);
        state.showerRuntime?.setFrame(null);
        return useMeshy;
      }
      state.readingRuntime?.setFrame(actionId==='hobby'
        ?{active:true,elapsed:readingElapsed}:null,paused);
      state.hugRuntime?.setFrame(hugFrame,paused);
      state.kissRuntime?.setFrame(kissFrame,paused);
      // Game updates the pose; postUpdate applies joint rotations after Anim.
      const fridge=actionId==='fridge'||fridgeBusy;
      state.fridgeRuntime?.setFrame(fridge&&actionId==='fridge'?fridgeFrame:null);
      const bed=actionId==='bed'||bedBusy;
      state.bedRuntime?.setFrame(bed?bedFrame:null,paused);
      const shower=actionId==='shower'||showerBusy;
      state.showerRuntime?.setFrame(shower?showerFrame:null,paused);
      if(shower){
        // The game exclusively owns the walk-in/out x/z, curtain, privacy,
        // costume and water. This adapter controls only the imported skin.
        const anim=state.model.anim;
        const phase=meshyShowerPose(showerFrame);
        const gait=phase?.walking===true;
        const target=gait?'Walking':'Idle_3';
        if(state.clip!==target){
          anim.baseLayer.transition(target,.16);
          state.clip=target;
        }
        state.sofaRelease=null;
        state.model.setLocalPosition(state.base.x,state.base.y,state.base.z);
        const walkingTime=gait
          ?showerWalkClipTime(phase.gaitMeters,state.walkDuration):null;
        if(walkingTime!==null){
          anim.speed=0;
          anim.playing=true;
          anim.baseLayer.activeStateCurrentTime=walkingTime;
        }else{
          anim.speed=1;
          anim.playing=!paused;
        }
        return true;
      }
      if(actionId==='toilet'||toiletBusy){
        // The game owns root, mask and toilet timeline; only the skinned
        // pose and imported pelvic translation are handled here.
        const anim=state.model.anim;
        const pose=meshyToiletPose(toiletFrame,{
          resident:'alex',scale:state.scale,walkDuration:state.walkDuration
        });
        if(!pose)return true;
        if(state.clip!==pose.clip){
          // A timed crossfade remains stuck at speed 0; direct sampling
          // is deterministic through pause, save/reload and 3x speed.
          anim.baseLayer.play(pose.clip);
          state.clip=pose.clip;
        }
        state.sofaRelease=null;
        state.model.setLocalPosition(state.base.x+pose.offset.x,
          state.base.y,state.base.z+pose.offset.z);
        if(pose.time!==null){
          anim.speed=0;anim.playing=true;
          anim.baseLayer.activeStateCurrentTime=pose.time;
        }else{anim.speed=1;anim.playing=!paused;}
        return true;
      }
      if(bed){
        // Bed root x/y/z, yaw and 78-degree recline are already calculated
        // by the game's mirrored side-entry bedTransitionPose. Never adjust
        // avatar position or re-use sofa root-motion/contact correction here.
        const anim=state.model.anim;
        if(state.clip!=='Idle_3'){
          anim.baseLayer.transition('Idle_3',.20);
          state.clip='Idle_3';
        }
        state.sofaRelease=null;
        state.model.setLocalPosition(state.base.x,state.base.y,state.base.z);
        anim.speed=1;
        anim.playing=!paused;
        return true;
      }
      if(fridge){
        const anim=state.model.anim;
        if(state.clip!=='Idle_3'){
          anim.baseLayer.transition('Idle_3',.20);
          state.clip='Idle_3';
        }
        state.model.setLocalPosition(state.base.x,state.base.y,state.base.z);
        anim.speed=1;
        anim.playing=!paused;
        return true;
      }
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
      if(actionId==='hobby'){
        // Audited original Meshy idle plus skeletal book pose; do not invent
        // an imported reading clip or apply unrelated sofa root compensation.
        if(state.clip!=='Idle_3'){
          anim.baseLayer.transition('Idle_3',.20);
          state.clip='Idle_3';
        }
        state.sofaRelease=null;
        state.model.setLocalPosition(state.base.x,state.base.y,state.base.z);
        anim.speed=1;
        anim.playing=!paused;
        return true;
      }
      const greetingTime=hugFrame?.active?null:alexGreetingClipTime({
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
      const target=walking||social
        ? meshClipFor({walking,social:hugFrame?.active?null:social})
        : alexIdleClipFor({minutes:worldMinutes,mood,energy,walking,social,
          actionId,sofaBusy,bedBusy,showerBusy,fridgeBusy,
          available:state.alternateIdleAvailable});
      if(state.clip===MESHY_SOFA_CLIP){
        // Blend both the bone pose and its root-motion correction back to
        // regular locomotion, avoiding a 30-cm standing pose pop.
        state.sofaRelease={remaining:.20,offset:{...state.sofaOffset}};
      }
      anim.speed=1;
      if(target!==state.clip){
        anim.baseLayer.transition(target,
          target===ALEX_ALTERNATE_IDLE_CLIP||state.clip===ALEX_ALTERNATE_IDLE_CLIP
            ?.28:.20);
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
        state.fridgeRuntime?.setFrame(null);
        state.bedRuntime?.setFrame(null);
        state.showerRuntime?.setFrame(null);
        state.hugRuntime?.setFrame(null);
        state.kissRuntime?.setFrame(null);
        state.model.setLocalPosition(state.base.x,state.base.y,state.base.z);
      }
    }
  };
}
