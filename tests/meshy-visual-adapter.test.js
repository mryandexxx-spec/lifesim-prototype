import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMeshyVisual} from '../src/meshy-visual.js';
import {REQUIRED_MESHY_CLIPS} from '../src/meshy-visual-policy.js';

function fixture({loadError=false,missClip=false}={}){
  const events=[];
  const vertex=(x,y,z)=>({x,y,z,clone(){return vertex(x,y,z);}});
  class Entity{
    constructor(name){this.name=name;this.children=[];this.enabled=true;}
    addChild(entity){this.children.push(entity);entity.parent=this;}
    destroy(){this.destroyed=true;}
    setLocalScale(...values){this.scale=values;}
    setLocalPosition(...values){this.position=values;}
    findComponents(kind){return kind==='render'?this.renderers||[]:[];}
    addComponent(kind){
      assert.equal(kind,'anim');
      this.anim={
        playing:false,
        assignAnimation(name){events.push(['assigned',name]);},
        baseLayer:{
          play(name){events.push(['play',name]);},
          transition(name){events.push(['transition',name]);}
        }
      };
    }
  }
  const selected=new Entity('selection');
  const snack=new Entity('apple');
  const book=new Entity('book');
  const showerWrap=new Entity('privacy costume');
  const body=new Entity('Alex body');
  const renderers=[body,selected,snack,book,showerWrap].map(entity=>({entity,enabled:true}));
  const avatar=new Entity('Alex');avatar.renderers=renderers;
  const rig={avatar,selected,snack,book,showerWrap};
  const pc={
    Entity,
    Asset:class{
      constructor(name,kind,file){this.file=file;}
      ready(callback){this.onReady=callback;}
      once(kind,callback){if(kind==='error')this.onError=callback;}
    }
  };
  const model=new Entity('Imported Meshy model');
  model.renderers=[{entity:model,enabled:true,meshInstances:[{aabb:{
    getMin(){return vertex(-.3,.05,-.2);},
    getMax(){return vertex(.3,1.05,.2);}
  }}]}];
  const app={
    root:new Entity('Scene root'),
    assets:{
      add(){},
      load(asset){
        if(loadError){asset.onError(Error('network failed'));return;}
        const names=missClip?['Idle_3','Walking']:REQUIRED_MESHY_CLIPS;
        asset.resource={
          instantiateRenderEntity(){return model;},
          animations:names.map(name=>({resource:{name}}))
        };
        asset.onReady();
      }
    }
  };
  return {events,rig,pc,app,renderers,model};
}

test('Meshy adapter hides only legacy body renderer; selection, items and privacy costume remain managed by game',()=>{
  const f=fixture();
  const statuses=[];
  const visual=createMeshyVisual({pc:f.pc,app:f.app,rig:f.rig,onStatus:status=>statuses.push(status)});
  assert.equal(visual.ready,true);
  assert.deepEqual(statuses,['ready']);
  assert.equal(f.model.scale[0],1.78);
  visual.update({preferred:true,walking:true});
  assert.equal(f.renderers[0].enabled,false);
  assert.ok(f.renderers.slice(1).every(r=>r.enabled));
  assert.ok(f.events.some(e=>e[0]==='transition'&&e[1]==='Walking'));
  visual.update({preferred:true,paused:true,social:'talk'});
  assert.equal(f.model.anim.playing,false);
  visual.update({preferred:true,paused:false,social:'argue'});
  assert.ok(f.events.some(e=>e[0]==='transition'&&e[1]==='Stand_Talking_Angry'));
  assert.equal(f.model.anim.playing,true);
  visual.update({preferred:true,actionId:'bed'});
  assert.equal(f.renderers[0].enabled,true);
  visual.update({preferred:true,showerBusy:true});
  assert.equal(f.renderers[0].enabled,true);
  visual.update({preferred:false});
  assert.equal(f.renderers[0].enabled,true);
  visual.reset();
  assert.ok(f.events.some(e=>e[0]==='play'&&e[1]==='Idle_3'));
});

test('GLB failure or incompatible animation track falls back to legacy rendering',()=>{
  for(const mode of [{loadError:true},{missClip:true}]){
    const f=fixture(mode);
    const statuses=[];
    const visual=createMeshyVisual({pc:f.pc,app:f.app,rig:f.rig,
      onStatus:status=>statuses.push(status)});
    visual.update({preferred:true,walking:true});
    assert.equal(visual.ready,false);
    assert.equal(visual.status,'error');
    assert.equal(f.renderers[0].enabled,true);
    assert.deepEqual(statuses,['error']);
  }
});
