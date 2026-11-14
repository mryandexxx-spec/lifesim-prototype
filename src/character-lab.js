import * as pc from 'playcanvas';
import {
  chooseIdleClip, isOneShotClip, parseGlbHeader, characterFit, summarizeClips
} from './character-lab-config.js';

const $ = id => document.getElementById(id);
const status = message => { $('lab-status').textContent = message; };
const canvas = $('lab-canvas');
const app = new pc.Application(canvas, {graphicsDeviceOptions:{antialias:true,alpha:false}});
app.graphicsDevice.maxPixelRatio=Math.min(window.devicePixelRatio||1,1.5);
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
app.scene.ambientLight = new pc.Color(.65,.69,.67);
window.addEventListener('resize',()=>app.resizeCanvas());

const createMaterial = hex => {
  const m=new pc.StandardMaterial();
  m.diffuse = new pc.Color().fromString(hex);
  m.metalness=0;
  m.gloss=18;
  m.update();
  return m;
};
const floor=new pc.Entity('Character Lab floor');
floor.addComponent('render',{type:'box',material:createMaterial('#d3dad4')});
floor.setLocalPosition(0,-.04,0);
floor.setLocalScale(6,.08,6);
app.root.addChild(floor);
const key=new pc.Entity('Lab key');
key.addComponent('light',{type:'directional',intensity:1.55,color:new pc.Color(1,.96,.88),castShadows:false});
key.setEulerAngles(55,-35,0);app.root.addChild(key);
const fill=new pc.Entity('Lab fill');
fill.addComponent('light',{type:'directional',intensity:.8,color:new pc.Color(.83,.9,1),castShadows:false});
fill.setEulerAngles(15,140,0);app.root.addChild(fill);
const camera=new pc.Entity('Lab camera');
camera.addComponent('camera',{clearColor:new pc.Color(.88,.91,.89),nearClip:.03,farClip:120,fov:42});
app.root.addChild(camera);
const view={yaw:24,pitch:12,distance:3.7};
function updateView(){
  const az=view.yaw*Math.PI/180,el=view.pitch*Math.PI/180;
  const target=new pc.Vec3(0,.94,0);
  camera.setPosition(target.x+Math.sin(az)*Math.cos(el)*view.distance,
    target.y+Math.sin(el)*view.distance,
    target.z+Math.cos(az)*Math.cos(el)*view.distance);
  camera.lookAt(target);
}
updateView();
$('reset-view').addEventListener('click',()=>{Object.assign(view,{yaw:24,pitch:12,distance:3.7});updateView();});
const activePointers=new Map();
let pinchDistance=0;
canvas.addEventListener('pointerdown',event=>{canvas.setPointerCapture?.(event.pointerId);activePointers.set(event.pointerId,{x:event.clientX,y:event.clientY});pinchDistance=0;});
canvas.addEventListener('pointermove',event=>{
  const old=activePointers.get(event.pointerId);if(!old)return;
  const dx=event.clientX-old.x,dy=event.clientY-old.y;
  activePointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(activePointers.size===1){view.yaw-=dx*.35;view.pitch=Math.max(-14,Math.min(65,view.pitch+dy*.28));}
  else if(activePointers.size===2){
    const pts=[...activePointers.values()];const distance=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);
    if(pinchDistance>0&&distance>0)view.distance=Math.max(1.7,Math.min(9,view.distance*pinchDistance/distance));
    pinchDistance=distance;
  }
  updateView();
});
for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,event=>{activePointers.delete(event.pointerId);pinchDistance=0;});
canvas.addEventListener('wheel',event=>{event.preventDefault();view.distance=Math.max(1.7,Math.min(9,view.distance*(1+event.deltaY*.001)));updateView();},{passive:false});

let current=null,currentAsset=null,currentUrl=null;
const clipSelect=$('clip-select');
const pauseButton=$('pause-animation');
const preferredAutoUrl='./assets/characters/meshy-casual-v1.glb';

function entityBounds(entity){
  let min=null,max=null;
  for(const e of entity.findComponents('render')){
    for(const mi of e.meshInstances){
      const aabb=mi.aabb;if(!aabb)continue;
      const a=aabb.getMin(),b=aabb.getMax();
      if(!min){min=a.clone();max=b.clone();}
      else{min.x=Math.min(min.x,a.x);min.y=Math.min(min.y,a.y);min.z=Math.min(min.z,a.z);
        max.x=Math.max(max.x,b.x);max.y=Math.max(max.y,b.y);max.z=Math.max(max.z,b.z);}
    }
  }
  return min?{min,max}:null;
}

async function loadAsset(url, title){
  status(`Загрузка ${title}…`);
  const asset=new pc.Asset(title,'container',{url});
  app.assets.add(asset);
  try{
    await new Promise((resolve,reject)=>{
      asset.ready(resolve);
      asset.once('error',reject);
      app.assets.load(asset);
    });
    const avatar=asset.resource.instantiateRenderEntity();
    const previous=current,previousAsset=currentAsset;
    app.root.addChild(avatar);
    let info;
    try{
      const bounds=entityBounds(avatar);
      info=characterFit(bounds);
      avatar.setLocalScale(info.scale,info.scale,info.scale);
      avatar.setLocalPosition(info.x,info.y,info.z);
      avatar.addComponent('anim',{activate:true});
      const clips=asset.resource.animations.map(entry=>entry.resource);
      for(const clip of clips)avatar.anim.assignAnimation(clip.name,clip,undefined,1,!isOneShotClip(clip.name));
      current=avatar;currentAsset=asset;
      if(previous){previous.destroy();app.assets.remove(previousAsset);previousAsset.unload();}
      clipSelect.replaceChildren();
      const available=summarizeClips(clips.map(c=>c.name));
      for(const clip of available){const option=document.createElement('option');option.value=clip.name;option.textContent=clip.name+(clip.loop?'':' · однократно');clipSelect.append(option);}
      clipSelect.disabled=!clips.length;pauseButton.disabled=!clips.length;pauseButton.textContent='Пауза';
      if(clips.length){const initial=chooseIdleClip(clips.map(c=>c.name));clipSelect.value=initial;avatar.anim.baseLayer.play(initial);}
      status(`Загружено: ${title}. Высота ${info.height.toFixed(2)} м, скелет и ${clips.length} анимаций. Меняйте клипы в списке.`);
    }catch(error){avatar.destroy();throw error;}
  }catch(error){
    if(currentAsset!==asset){app.assets.remove(asset);asset.unload();}
    throw error;
  }
}

clipSelect.addEventListener('change',()=>{
  if(!current?.anim || !clipSelect.value)return;
  current.anim.playing=true;pauseButton.textContent='Пауза';
  current.anim.baseLayer.transition(clipSelect.value,.25);
});
pauseButton.addEventListener('click',()=>{
  if(!current?.anim)return;
  current.anim.playing=!current.anim.playing;
  pauseButton.textContent=current.anim.playing?'Пауза':'Продолжить';
});
$('glb-input').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;
  const header=await file.slice(0,12).arrayBuffer();
  try{
    const view=new DataView(header);
    if(view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==file.size){throw new Error('Файл не является корректным GLB 2.0.');}
    const nextUrl=URL.createObjectURL(file);
    try{await loadAsset(nextUrl,file.name);if(currentUrl)URL.revokeObjectURL(currentUrl);currentUrl=nextUrl;}
    catch(error){URL.revokeObjectURL(nextUrl);throw error;}
  }catch(error){status(`Ошибка файла: ${error?.message||String(error)}`);console.error(error);}
});
window.addEventListener('pagehide',()=>{if(currentUrl)URL.revokeObjectURL(currentUrl);});

app.start();
// If the model has been committed as a stable asset, it loads without user input.
// No temporary signed Meshy URLs or user tokens belong in the public repository.
fetch(preferredAutoUrl,{method:'HEAD'}).then(response=>{
  if(!response.ok)throw new Error('not bundled');
  return loadAsset(preferredAutoUrl,'meshy-casual-v1.glb');
}).catch(()=>status('3D-сцена готова. Модель ещё не добавлена в опубликованные ассеты — выберите GLB через кнопку.'));