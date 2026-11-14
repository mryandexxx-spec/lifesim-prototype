import {canShowMeshy, meshClipFor, availableMeshClips,
  MESHY_ASSET_URL, MESHY_DISPLAY_HEIGHT} from './meshy-visual-policy.js';
import {MESHY_SOFA_CLIP,meshySitClipTime,meshySofaOffset} from './meshy-sofa-pose.js';

/**
 * Meshy visual adapter for the EXISTING LifeSim procedural character root.
 * Navigation, action poses, selection ring and localStorage remain on the old rig.
 * Its existing avatar remains authoritative for motion, selection and props.
 * The sofa uses the audited Sit-to-Stand clip, scrubbed from real transition
 * progress with X/Z hip root-motion compensation. Bed/fridge/shower still use
 * the tested procedural rig until their poses have been retargeted.
 */
export function createMeshyVisual({pc,app,rig,onStatus=()=>{}}) {
  const hiddenFromReplacement=new Set([rig.selected,rig.snack,rig.book,rig.showerWrap]);
  const legacyRenderers=rig.avatar.findComponents('render')
    .filter(component=>!hiddenFromReplacement.has(component.entity));
  const state={status:'loading',ready:false,root:null,model:null,clip:null,visible:false,error:null,
    scale:1,base:{x:0,y:0,z:0},sofaOffset:{x:0,z:0},sofaRelease:null};
  let requested=false;

  function boundsFor(entity) {
    let min=null,max=null;
    for(const comp of entity.findComponents('render')){
      for(const instance of comp.meshInstances){
        const aabb=instance.aabb;
        if(!aabb)continue;
        const a=aabb.getMin(),b=aabb.getMax();
        if(!min){min=a.clone();max=b.clone();}
        else{
          min.x=Math.min(min.x,a.x);min.y=Math.min(min.y,a.y);min.z=Math.min(min.z,a.z);
          max.x=Math.max(max.x,b.x);max.y=Math.max(max.y,b.y);max.z=Math.max(max.z,b.z);
        }
      }
    }
    return min?{min,max}:null;
  }

  function attach(container){
    const model=container.resource.instantiateRenderEntity();
    // Fit in an identity parent before attaching beneath the moving game rig.
    // Model-space glTF bones and animations remain untouched.
    const root=new pc.Entity('Meshy Alex visual');
    app.root.addChild(root);
    root.addChild(model);
    try{
      const bounds=boundsFor(model);
      const height=bounds && bounds.max.y-bounds.min.y;
      if(!Number.isFinite(height)||height<.05)throw Error('Meshy bounds unavailable');
      const scale=MESHY_DISPLAY_HEIGHT/height;
      const base={x:-(bounds.min.x+bounds.max.x)*scale/2,
        y:-bounds.min.y*scale,z:-(bounds.min.z+bounds.max.z)*scale/2};
      model.setLocalScale(scale,scale,scale);
      model.setLocalPosition(base.x,base.y,base.z);
      state.scale=scale;state.base=base;
      model.addComponent('anim',{activate:true});
      const clips=(container.resource.animations||[]).map(item=>item.resource);
      if(!availableMeshClips(clips.map(clip=>clip.name)))
        throw Error('Missing required Meshy animation clips');
      for(const clip of clips)model.anim.assignAnimation(
        clip.name,clip,undefined,1,
        !['Sit_to_Stand_Transition_M','Wave_One_Hand','Call_Gesture'].includes(clip.name)
      );
      model.anim.baseLayer.play('Idle_3');
      model.anim.playing=false;
      // The root has identity local transform, and therefore follows the
      // existing Alex avatar's x/z, heading, paused movement and body lift.
      rig.avatar.addChild(root);
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
      sofaBusy=false,sofaWeight=0,dt=0,
      bedBusy=false,showerBusy=false,fridgeBusy=false}={}){
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
        const correction=meshySofaOffset(sofaWeight,state.scale);
        state.sofaOffset=correction;
        state.model.setLocalPosition(state.base.x+correction.x,
          state.base.y,state.base.z+correction.z);
        // PlayCanvas 2.24 evaluates a manually scrubbed layer with speed=0.
        // The game's timeline, not the GLB root translation, owns the seat.
        anim.speed=0;
        anim.playing=true;
        anim.baseLayer.activeStateCurrentTime=meshySitClipTime(sofaWeight);
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
          state.base.y,state.base.z+r.offset.z*weight);
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
        state.sofaOffset={x:0,z:0};
        state.sofaRelease=null;
        state.model.setLocalPosition(state.base.x,state.base.y,state.base.z);
      }
    }
  };
}
