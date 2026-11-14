import {canShowMeshy, meshClipFor, availableMeshClips,
  MESHY_ASSET_URL, MESHY_DISPLAY_HEIGHT} from './meshy-visual-policy.js';

/**
 * Meshy visual adapter for the EXISTING LifeSim procedural character root.
 * Navigation, action poses, selection ring and localStorage remain on the old rig.
 * Only its ordinary body renderers are replaced in safe states; furniture,
 * exits, bathing privacy and hand props keep the old procedural renderers.
 */
export function createMeshyVisual({pc,app,rig,onStatus=()=>{}}) {
  const hiddenFromReplacement=new Set([rig.selected,rig.snack,rig.book,rig.showerWrap]);
  const legacyRenderers=rig.avatar.findComponents('render')
    .filter(component=>!hiddenFromReplacement.has(component.entity));
  const state={status:'loading',ready:false,root:null,model:null,clip:null,visible:false,error:null};
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
      model.setLocalScale(scale,scale,scale);
      model.setLocalPosition(
        -(bounds.min.x+bounds.max.x)*scale/2,
        -bounds.min.y*scale,
        -(bounds.min.z+bounds.max.z)*scale/2
      );
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
      sofaBusy=false,bedBusy=false,showerBusy=false,fridgeBusy=false}={}){
      requested=preferred;
      const useMeshy=canShowMeshy({
        preferred:requested,ready:state.ready,actionId,sofaBusy,bedBusy,showerBusy,fridgeBusy
      });
      if(state.visible!==useMeshy){
        for(const comp of legacyRenderers)comp.enabled=!useMeshy;
        if(state.root)state.root.enabled=useMeshy;
        state.visible=useMeshy;
      }
      if(!useMeshy||!state.model)return;
      const target=meshClipFor({walking,social});
      if(target!==state.clip){
        state.model.anim.baseLayer.transition(target,.20);
        state.clip=target;
      }
      state.model.anim.playing=!paused;
    },
    reset(){
      // Reset/Load do not destroy or reimport the skin; next update will
      // reselect the correct visual mode from current game state.
      if(state.model&&state.ready){
        state.model.anim.baseLayer.play('Idle_3');
        state.clip='Idle_3';
      }
    }
  };
}
