import {MIRA_MESHY_URL,miraHasClips,miraClipFor,
  miraMeshPlacement,canShowMiraMeshy} from './meshy-mira-policy.js';

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

/** Production Mira renderer: cosmetic only, separately fail-safe from Alex.
 * The procedural avatar controls navigation, sleep, sofa, food, shower, etc.
 */
export function createMiraMeshyVisual({pc,app,rig,onStatus=()=>{}}){
  const preserved=new Set([rig.selected,rig.snack,rig.book,rig.showerWrap]);
  const legacyRenderers=rig.avatar.findComponents('render')
    .filter(component=>!preserved.has(component.entity));
  const state={ready:false,status:'loading',error:null,
    root:null,model:null,clip:null,visible:false,base:null};
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
      for(const clip of clips)model.anim.assignAnimation(
        clip.name,clip,undefined,1,
        !['Hand_on_Hip_Gesture','Lie_Down_Hands_Spread',
          'Look_Back_and_Sit','Sit_to_Stand_Transition_F',
          'Step_to_Sit_Transition','Wave_for_Help_1'].includes(clip.name)
      );
      model.anim.baseLayer.play('Idle_7');
      model.anim.playing=false;
      rig.avatar.addChild(root);
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
      sofaBusy=false,bedBusy=false,showerBusy=false,fridgeBusy=false}={}){
      const show=canShowMiraMeshy({
        preferred,ready:state.ready,actionId,
        sofaBusy,bedBusy,showerBusy,fridgeBusy
      });
      if(state.visible!==show){
        for(const renderer of legacyRenderers)renderer.enabled=!show;
        if(state.root)state.root.enabled=show;
        state.visible=show;
      }
      if(!show||!state.model)return show;
      const clip=miraClipFor({walking,social});
      if(state.clip!==clip){
        state.model.anim.baseLayer.transition(clip,.20);
        state.clip=clip;
      }
      state.model.anim.playing=!paused;
      return true;
    },
    reset(){
      if(!state.ready)return;
      state.model.anim.baseLayer.play('Idle_7');
      state.model.anim.playing=false;
      state.clip='Idle_7';
      const {base}=state;
      state.model.setLocalPosition(base.x,base.y,base.z);
    }
  };
}
