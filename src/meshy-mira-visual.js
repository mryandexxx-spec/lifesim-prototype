import {MIRA_MESHY_URL,miraHasClips,miraClipFor,
  miraMeshPlacement,canShowMiraMeshy} from './meshy-mira-policy.js';
import {MIRA_SOFA_CLIP,MIRA_SOFA_DURATION,miraSofaClipTime,miraSofaOffset}
  from './meshy-mira-sofa.js';
import {MIRA_SLEEP_CLIP,MIRA_SLEEP_DURATION,miraBedPose,createMiraBedController}
  from './meshy-mira-bed.js';
import {createMeshyFridgeController} from './meshy-fridge-runtime.js';

/** Read undeformed geometry AABBs, never pose-dependent meshInstance.aabb.
 * The validated female GLB has one original skinned mesh.
 */
export function miraStaticSourceBounds(renderRoot){
  let min=null,max=null;
  for(const component of renderRoot.findComponents('render')){
    for(const instance of component.meshInstances||[]){
      const bounds=instance.mesh?.aabb;
      if(!bounds?.getMin||!bounds?.getMax)continue;
      const lo=bounds.getMin(),hi=bounds.getMax();
      if(!min){min={x:lo.x,y:lo.y,z:lo.z};max={x:hi.x,y:hi.y,z:hi.z};}
      else for(const axis of ['x','y','z']){
        min[axis]=Math.min(min[axis],lo[axis]);
        max[axis]=Math.max(max[axis],hi[axis]);
      }
    }
  }
  if(!min)throw Error('Mira GLB has no static mesh bounds');
  return {min,max};
}

/** Production Mira renderer: cosmetic only and separately fail-safe from Alex.
 * The existing avatar controls motion and sofa seat root; the authored
 * female sitting clip drives ONLY the skinned pose with X/Z motion removed.
 */
export function createMiraMeshyVisual({pc,app,rig,onStatus=()=>{}}){
  const preserved=new Set([rig.selected,rig.snack,rig.book,rig.showerWrap]);
  const legacyRenderers=rig.avatar.findComponents('render')
    .filter(component=>!preserved.has(component.entity));
  const state={ready:false,status:'loading',error:null,
    root:null,model:null,clip:null,visible:false,base:null,
    sofaReady:false,sofaOffset:{x:0,z:0},sofaRelease:null,
    bedReady:false,bedRuntime:null,fridgeRuntime:null};
  function attach(asset){
    const model=asset.resource.instantiateRenderEntity();
    const root=new pc.Entity('Meshy Mira visual');
    app.root.addChild(root);
    root.addChild(model);
    try{
      const base=miraMeshPlacement(miraStaticSourceBounds(model));
      model.setLocalScale(base.scale,base.scale,base.scale);
      model.setLocalPosition(base.x,base.y,base.z);
      model.addComponent('anim',{activate:true});
      const clips=(asset.resource.animations||[]).map(item=>item.resource);
      if(!miraHasClips(clips.map(clip=>clip.name)))
        throw Error('Missing required female Meshy clips');
      const sourceSeat=clips.find(clip=>clip.name===MIRA_SOFA_CLIP);
      // The audited pelvis curve is tied to this exact source clip duration.
      // Future model replacements retain legacy sofa until re-audited.
      state.sofaReady=Number.isFinite(sourceSeat?.duration)&&
        Math.abs(sourceSeat.duration-MIRA_SOFA_DURATION)<.04;
      const sleep=clips.find(clip=>clip.name===MIRA_SLEEP_CLIP);
      const bedClipsReady=state.sofaReady&&Number.isFinite(sleep?.duration)&&
        Math.abs(sleep.duration-MIRA_SLEEP_DURATION)<.04;
      for(const clip of clips)model.anim.assignAnimation(
        clip.name,clip,undefined,1,
        !['Hand_on_Hip_Gesture','Lie_Down_Hands_Spread',
          'Look_Back_and_Sit','Sit_to_Stand_Transition_F',
          'Step_to_Sit_Transition','Wave_for_Help_1',MIRA_SLEEP_CLIP].includes(clip.name)
      );
      model.anim.baseLayer.play('Idle_7');
      model.anim.playing=false;
      rig.avatar.addChild(root);
      // Female bed inherits the same mattress slot/path as the procedural
      // controller; source 'sleep' is an original authored lying animation.
      // Guard the post-Anim absolute hip quaternion to avoid double reclining.
      if(bedClipsReady&&pc.Script&&model.findByName){
        try{
          const bed=createMiraBedController({pc,model});
          if(bed.ready){
            if(!model.script)model.addComponent('script');
            class MiraBedPostUpdate extends pc.Script{
              static scriptName='blinsMiraBedPostUpdate';
              postUpdate(){bed.apply();}
            }
            model.script.create(MiraBedPostUpdate);
            state.bedRuntime=bed;
            state.bedReady=true;
          }
        }catch(error){
          state.bedReady=false;state.bedRuntime=null;
          console.warn('Mira bed skin unavailable',error);
        }
      }
      // Reuse the tested right-arm/fridge-prefab controller also used by
      // Alex. Separate instance, skinned hand prop and post-Anim script:
      // no sharing resident bones, snacks or game state.
      try{
        if(pc.Script&&model.findByName){
          const fridge=createMeshyFridgeController({
            pc,model,avatar:rig.avatar,resident:'Mira'
          });
          if(fridge.ready){
            if(!model.script)model.addComponent('script');
            class MiraFridgePostUpdate extends pc.Script{
              static scriptName='blinsMiraFridgePostUpdate';
              postUpdate(){fridge.apply();}
            }
            model.script.create(MiraFridgePostUpdate);
            state.fridgeRuntime=fridge;
          }
        }
      }catch(error){
        state.fridgeRuntime=null;
        console.warn('Mira fridge skin unavailable',error);
      }
      root.enabled=false;
      Object.assign(state,{ready:true,status:'ready',root,model,clip:'Idle_7',base});
      onStatus('ready');
    }catch(error){root.destroy();throw error;}
  }
  const asset=new pc.Asset('LifeSim Meshy Mira','container',{url:MIRA_MESHY_URL});
  app.assets.add(asset);
  asset.ready(()=>{
    try{attach(asset);}
    catch(error){
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
      sofaBusy=false,sofaWeight=0,dt=0,
      bedBusy=false,bedFrame=null,bedProgress=0,
      showerBusy=false,fridgeBusy=false,fridgeFrame=null}={}){
      const show=canShowMiraMeshy({
        preferred,ready:state.ready,actionId,
        sofaBusy,sofaReady:state.sofaReady,
        bedBusy,bedReady:state.bedReady,showerBusy,fridgeBusy,
        fridgeReady:Boolean(state.fridgeRuntime?.ready)
      });
      if(state.visible!==show){
        for(const renderer of legacyRenderers)renderer.enabled=!show;
        if(state.root)state.root.enabled=show;
        state.visible=show;
      }
      if(!show||!state.model){
        state.bedRuntime?.setFrame(null);
        state.fridgeRuntime?.setFrame(null);
        return show;
      }
      const fridge=actionId==='fridge'||fridgeBusy;
      state.fridgeRuntime?.setFrame(
        fridge&&actionId==='fridge'?fridgeFrame:null
      );
      const sofa=actionId==='sofa'||sofaBusy;
      const anim=state.model.anim;
      if(sofa){
        state.bedRuntime?.setFrame(null);
        if(state.clip!==MIRA_SOFA_CLIP){
          anim.baseLayer.play(MIRA_SOFA_CLIP);
          state.clip=MIRA_SOFA_CLIP;
          state.sofaRelease=null;
        }
        // The source GLB hips move ~40 cm backward; the game already moves
        // the resident to the sofa and rotates her. Cancel only imported
        // horizontal drift. Authored knee and vertical hip bend remain.
        const t=miraSofaClipTime(sofaWeight);
        const offset=miraSofaOffset(sofaWeight,state.base.scale);
        state.sofaOffset=offset;
        state.model.setLocalPosition(state.base.x+offset.x,
          state.base.y,state.base.z+offset.z);
        anim.speed=0;
        anim.playing=true;
        anim.baseLayer.activeStateCurrentTime=t;
        return true;
      }
      const bedding=actionId==='bed'||bedBusy;
      if(bedding){
        const pose=miraBedPose(bedFrame,bedProgress,state.base.scale);
        state.bedRuntime?.setFrame(pose);
        if(!pose)return true;
        if(state.clip!==pose.clip){
          // Both imported bed clips are explicitly sampled from the game's
          // reversible action progress (anim.speed=0 below). A timed Anim
          // transition also uses the component clock; at speed=0 it never
          // completes and leaves Mira visibly sitting during sleep.
          // End of Look_Back_and_Sit and start of sleep are adjacent seated
          // poses in the audited GLB, so switch them immediately, then sample.
          anim.baseLayer.play(pose.clip);
          state.clip=pose.clip;
        }
        state.sofaRelease=null;
        state.model.setLocalPosition(state.base.x+pose.offset.x,
          state.base.y+pose.offset.y,state.base.z+pose.offset.z);
        if(pose.time!==null){
          anim.speed=0;
          anim.playing=true;
          anim.baseLayer.activeStateCurrentTime=pose.time;
        }else{
          anim.speed=1;anim.playing=!paused;
        }
        return true;
      }
      state.bedRuntime?.setFrame(null);
      if(fridge){
        // The shared action root already faces the prefab; postUpdate
        // reaches its world-space handle, shelf and mouth from Mira's bones.
        const clip='Idle_7';
        if(state.clip!==clip){
          anim.baseLayer.transition(clip,.20);
          state.clip=clip;
        }
        state.sofaRelease=null;
        state.model.setLocalPosition(state.base.x,state.base.y,state.base.z);
        anim.speed=1;
        anim.playing=!paused;
        return true;
      }
      const clip=miraClipFor({walking,social});
      if(state.clip===MIRA_SOFA_CLIP){
        state.sofaRelease={remaining:.2,offset:{...state.sofaOffset}};
      }
      if(state.clip!==clip){
        anim.baseLayer.transition(clip,.20);
        state.clip=clip;
      }
      if(state.sofaRelease){
        const r=state.sofaRelease;
        r.remaining=Math.max(0,r.remaining-
          (Number.isFinite(dt)?Math.max(0,dt):0));
        const w=r.remaining/.2;
        state.model.setLocalPosition(state.base.x+r.offset.x*w,
          state.base.y,state.base.z+r.offset.z*w);
        if(r.remaining===0)state.sofaRelease=null;
      }else{
        state.model.setLocalPosition(state.base.x,state.base.y,state.base.z);
      }
      anim.speed=1;
      anim.playing=!paused;
      return true;
    },
    reset(){
      if(!state.ready)return;
      state.model.anim.baseLayer.play('Idle_7');
      state.model.anim.playing=false;
      state.clip='Idle_7';
      state.sofaOffset={x:0,z:0};
      state.sofaRelease=null;
      state.bedRuntime?.setFrame(null);
      state.fridgeRuntime?.setFrame(null);
      state.model.anim.speed=1;
      const {base}=state;
      state.model.setLocalPosition(base.x,base.y,base.z);
    }
  };
}
