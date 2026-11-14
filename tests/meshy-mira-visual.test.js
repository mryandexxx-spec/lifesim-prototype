import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MIRA_MESHY_URL,MIRA_REQUIRED_CLIPS,MIRA_DISPLAY_HEIGHT,
  MIRA_IDLE_GROUND_OFFSET,miraHasClips,miraClipFor,
  miraMeshPlacement,canShowMiraMeshy} from '../src/meshy-mira-policy.js';
import {createMiraMeshyVisual,miraStaticSourceBounds} from '../src/meshy-mira-visual.js';

const validBounds={min:{x:-.3,y:0,z:-.15},max:{x:.3,y:1.7,z:.15}};
test('female source asset has its own clips and separate 2.05 game-height placement',()=>{
  assert.equal(MIRA_MESHY_URL,'./assets/characters/meshy-mira-mobile-v1.glb');
  assert.equal(MIRA_DISPLAY_HEIGHT,2.05);
  assert.ok(miraHasClips(['Running',...MIRA_REQUIRED_CLIPS]));
  assert.equal(miraHasClips(['Idle_3','Walking']),false);
  assert.equal(miraClipFor({}),'Idle_7');
  assert.equal(miraClipFor({walking:true}),'Walking_Woman');
  assert.equal(miraClipFor({social:'talk'}),'Listening_Gesture');
  assert.equal(miraClipFor({social:'argue'}),'Hand_on_Hip_Gesture');
  const fit=miraMeshPlacement(validBounds);
  assert.ok(Math.abs(fit.scale*1.7-2.05)<1e-10);
  assert.equal(fit.y,MIRA_IDLE_GROUND_OFFSET);
  assert.deepEqual(miraMeshPlacement(validBounds),fit);
  assert.throws(()=>miraMeshPlacement({min:{x:0,y:1,z:0},max:{x:0,y:1,z:0}}),RangeError);
});
test('female visuals never replace furniture, shower or post-use exit transitions',()=>{
  const ready={preferred:true,ready:true};
  assert.equal(canShowMiraMeshy(ready),true);
  assert.equal(canShowMiraMeshy({...ready,ready:false}),false);
  for(const name of ['sofa','bed','fridge','shower'])
    assert.equal(canShowMiraMeshy({...ready,actionId:name}),false);
  for(const busy of ['sofaBusy','bedBusy','fridgeBusy','showerBusy'])
    assert.equal(canShowMiraMeshy({...ready,[busy]:true}),false);
  assert.equal(canShowMiraMeshy({...ready,preferred:false}),false);
});
function fixture({loadError=false,missingClip=false,noStaticBounds=false}={}){
  const events=[];
  class Entity{
    constructor(name){this.name=name;this.enabled=true;this.children=[];}
    addChild(child){this.children.push(child);child.parent=this;}
    destroy(){this.destroyed=true;}
    findComponents(type){return type==='render'?this.renderers||[]:[];}
    setLocalScale(...s){this.scale=s;}
    setLocalPosition(...p){this.position=p;}
    addComponent(type){
      assert.equal(type,'anim');
      this.anim={playing:false,assignAnimation:(name)=>events.push(['assign',name]),
        baseLayer:{play:(name)=>events.push(['play',name]),
          transition:(name)=>events.push(['transition',name])}};
    }
  }
  const selection=new Entity('ring'),snack=new Entity('snack'),book=new Entity('book'),showerWrap=new Entity('cover'),body=new Entity('body');
  const renderers=[body,selection,snack,book,showerWrap].map(entity=>({entity,enabled:true}));
  const avatar=new Entity('Mira');avatar.renderers=renderers;
  const rig={avatar,selected:selection,snack,book,showerWrap};
  const model=new Entity('Meshy Mira');
  const staticBounds={getMin:()=>({...validBounds.min}),getMax:()=>({...validBounds.max})};
  model.renderers=[{entity:model,meshInstances:[{aabb:{getMin:()=>({y:-99}),getMax:()=>({y:99})},
    mesh:noStaticBounds?{}:{aabb:staticBounds}}]}];
  const pc={Entity,Asset:class {
    constructor(name,type,file){this.file=file;}
    ready(cb){this.onReady=cb;}
    once(type,cb){this.onError=cb;}
  }};
  const app={root:new Entity('root'),assets:{add(){},load(asset){
    if(loadError){asset.onError(Error('network unavailable'));return;}
    const clips=missingClip?['Idle_7','Walking_Woman']:MIRA_REQUIRED_CLIPS;
    asset.resource={instantiateRenderEntity(){return model;},
      animations:clips.map(name=>({resource:{name}}))};
    asset.onReady();
  }}};
  return {pc,app,rig,model,events,renderers};
}
test('static POSITION-space mesh bounds are used, not animated 99-metre AABB',()=>{
  const f=fixture();const source=miraStaticSourceBounds(f.model);
  assert.deepEqual(source,validBounds);
  const v=createMiraMeshyVisual(f);
  assert.equal(v.ready,true);
  assert.ok(Math.abs(f.model.scale[0]-2.05/1.7)<1e-10);
  assert.ok(f.model.position[1]>.02&&f.model.position[1]<.04);
});
test('Mira controls walking, social, pause and returns to legacy on furniture',()=>{
  const f=fixture();const visual=createMiraMeshyVisual(f);
  visual.update({preferred:true,walking:true});
  assert.equal(f.renderers[0].enabled,false);
  assert.ok(f.renderers.slice(1).every(x=>x.enabled));
  assert.ok(f.events.some(x=>x[0]==='transition'&&x[1]==='Walking_Woman'));
  visual.update({preferred:true,social:'talk',paused:true});
  assert.equal(f.model.anim.playing,false);
  visual.update({preferred:true,social:'argue'});
  assert.ok(f.events.some(x=>x[0]==='transition'&&x[1]==='Hand_on_Hip_Gesture'));
  visual.update({preferred:true,actionId:'sofa'});
  assert.equal(f.renderers[0].enabled,true);
  visual.update({preferred:true,sofaBusy:true});
  assert.equal(f.renderers[0].enabled,true);
  visual.update({preferred:true,actionId:'bed'});
  assert.equal(f.renderers[0].enabled,true);
  visual.update({preferred:true,showerBusy:true});
  assert.equal(f.renderers[0].enabled,true);
  visual.update({preferred:true});
  assert.equal(f.renderers[0].enabled,false);
  visual.reset();assert.ok(f.events.some(x=>x[0]==='play'&&x[1]==='Idle_7'));
  visual.update({preferred:false});
  assert.equal(f.renderers[0].enabled,true);
});
test('female network, static bounds and missing animation clip each fail safe',()=>{
  for(const config of [{loadError:true},{missingClip:true},{noStaticBounds:true}]){
    const f=fixture(config),events=[];
    const v=createMiraMeshyVisual({...f,onStatus:(status)=>events.push(status)});
    v.update({preferred:true,walking:true});
    assert.equal(v.ready,false);
    assert.equal(v.status,'error');
    assert.equal(f.renderers[0].enabled,true);
    assert.deepEqual(events,['error']);
  }
});
test('game supplies both independent visual adapters and includes the female module in Pages',()=>{
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert.match(game,/createMiraMeshyVisual/);
  assert.match(game,/meshyMira\.update/);
  assert.match(game,/meshyMira\.reset/);
  assert.match(workflow,/src\/meshy-mira-visual\.js src\/meshy-mira-policy\.js site\/src\//);
  assert.match(workflow,/node --check src\/meshy-mira-visual\.js/);
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/Блин<span>’С<\/span>/);
  assert.match(html,/сборка \/ 0\.7e/);
});
