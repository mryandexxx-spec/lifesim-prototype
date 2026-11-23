import * as pc from 'playcanvas';
import {
  chooseIdleClip, isOneShotClip, characterFit, summarizeClips, inspectGltf, formatAssetBytes, characterLabModel
} from './character-lab-config.js';

const $ = id => document.getElementById(id);
const status = message => { $('lab-status').textContent = message; };
const canvas = $('lab-canvas');
const app = new pc.Application(canvas, {graphicsDeviceOptions:{antialias:true,alpha:false}});
app.graphicsDevice.maxPixelRatio=Math.min(window.devicePixelRatio||1,1.5);
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
app.scene.ambientLight = new pc.Color(.65,.69,.67);
window.addEventListener('resize',()=>{app.resizeCanvas();fitCasViewport();});

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
const isResidentStyleLab=['alexstyles','mirastyles'].includes(document.body.dataset.character);
const isCas022Lab=['cas022alex','cas022mira'].includes(document.body.dataset.character);
const isModularLab=['casproto','alexpilot','alexstyles','mirastyles'].includes(document.body.dataset.character)||isCas022Lab;
const view={yaw:isModularLab?8:24,pitch:isModularLab?3:12,distance:3.7};
let casFocusY=.94;
function fitCasViewport(){
 if(!isModularLab)return;
 const panel=document.getElementById('cas-lab-panel');
 if(!panel)return;
 const h=window.innerHeight,rect=panel.getBoundingClientRect();
 const upper=55,lower=Math.max(upper+90,rect.top-12);
 const usable=lower-upper,desired=Math.max(130,usable*.80);
 const radians=42*Math.PI/360;
 const height=labModel?.targetHeight??1.85;
 view.distance=Math.max(3.4,Math.min(9,height*h/(2*Math.tan(radians)*desired)));
 const pxPerMeter=h/(2*Math.tan(radians)*view.distance);
 casFocusY=height/2-(h/2-(upper+lower)/2)/pxPerMeter;
 updateView();
}
function updateView(){
  const az=view.yaw*Math.PI/180,el=view.pitch*Math.PI/180;
  const target=new pc.Vec3(0,isModularLab?casFocusY:.94,0);
  camera.setPosition(target.x+Math.sin(az)*Math.cos(el)*view.distance,
    target.y+Math.sin(el)*view.distance,
    target.z+Math.cos(az)*Math.cos(el)*view.distance);
  camera.lookAt(target);
}
updateView();
$('reset-view').addEventListener('click',()=>{Object.assign(view,{yaw:isModularLab?8:24,pitch:isModularLab?3:12,distance:3.7});if(isModularLab)fitCasViewport();else updateView();});
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
let cas022Fallback=false;
const clipSelect=$('clip-select');
const pauseButton=$('pause-animation');
const labModel=characterLabModel(document.body.dataset.character);
const preferredAutoUrl=labModel.assetUrl;
let modelInfo=null,fps=null,fpsFrames=0,fpsSeconds=0;
function updateMetrics(){
  $('lab-fps').textContent=fps===null?'FPS: замер…':`FPS: ${fps}`;
  $('lab-asset-info').textContent=modelInfo
    ?`${formatAssetBytes(modelInfo.bytes)} · ${modelInfo.triangles??'?'} треуг. · ${modelInfo.joints??'?'} костей · ${modelInfo.clips??'?'} анимаций`
    :'GLB ещё не загружен';
}
app.on('update',dt=>{
  if(!Number.isFinite(dt)||dt<=0||dt>1)return;
  fpsFrames++;fpsSeconds+=dt;
  if(fpsSeconds>=1){fps=Math.round(fpsFrames/fpsSeconds);fpsFrames=0;fpsSeconds=0;updateMetrics();}
});
updateMetrics();
$('show-lab-report').addEventListener('click',()=>{
  const box=$('lab-report');box.hidden=!box.hidden;
  if(box.hidden)return;
  $('lab-report-text').value=[
    'Блин’С Meshy Character Lab — диагностический отчёт',
    `Модель: ${modelInfo?.title||'не загружена'}`,
    `Размер: ${formatAssetBytes(modelInfo?.bytes||0)}`,
    `Треугольников: ${modelInfo?.triangles??'—'}`,
    `Костей: ${modelInfo?.joints??'—'}`,
    `Анимаций: ${modelInfo?.clips??'—'}`,
    `Morph targets: ${modelInfo?.morphTargets??'—'}`,
    `Активная анимация: ${clipSelect.value||'—'}`,
    `FPS (приблизительно): ${fps??'—'}`,
    'Визуальная приёмка: ожидается проверка владельцем на iPhone'
  ].join('\n');
});

async function inspectLocalFile(file){
  const header=await file.slice(0,20).arrayBuffer();
  if(header.byteLength!==20)throw new Error('Слишком короткий GLB.');
  const dv=new DataView(header);
  if(dv.getUint32(0,true)!==0x46546c67||dv.getUint32(4,true)!==2||dv.getUint32(8,true)!==file.size)
    throw new Error('Файл не является корректным GLB 2.0.');
  const jsonLength=dv.getUint32(12,true);
  if(dv.getUint32(16,true)!==0x4e4f534a || jsonLength<4 || jsonLength>file.size-20)
    throw new Error('Некорректная JSON-секция GLB.');
  const buffer=await file.slice(20,20+jsonLength).arrayBuffer();
  return inspectGltf(JSON.parse(new TextDecoder().decode(buffer)));
}

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

async function loadAsset(url, title, metadata={}){
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
      info=characterFit(bounds,labModel.targetHeight);
      avatar.setLocalScale(info.scale,info.scale,info.scale);
      avatar.setLocalPosition(info.x,info.y,info.z);
      avatar.addComponent('anim',{activate:true});
      const clips=asset.resource.animations.map(entry=>entry.resource);
      for(const clip of clips)avatar.anim.assignAnimation(clip.name,clip,undefined,1,!isOneShotClip(clip.name));
      current=avatar;currentAsset=asset;
      if(labModel.key==='casproto')applyCasVariants();
      if(labModel.key==='alexpilot')applyAlexFootwear();
      if(isResidentStyleLab)applyResidentFootwearStyles();
      if(isCas022Lab&&!cas022Fallback)applyCas022Morphs();
      modelInfo={title,bytes:metadata.bytes||0,triangles:metadata.triangles??null,
        joints:metadata.joints??null,clips:clips.length,morphTargets:metadata.morphTargets??null};
      updateMetrics();
      if(isModularLab)fitCasViewport();
      if(previous){previous.destroy();app.assets.remove(previousAsset);previousAsset.unload();}
      clipSelect.replaceChildren();
      const available=summarizeClips(clips.map(c=>c.name));
      for(const clip of available){const option=document.createElement('option');option.value=clip.name;option.textContent=clip.name+(clip.loop?'':' · однократно');clipSelect.append(option);}
      clipSelect.disabled=!clips.length;pauseButton.disabled=!clips.length;pauseButton.textContent='Пауза';
      if(clips.length){const initial=chooseIdleClip(clips.map(c=>c.name));clipSelect.value=initial;avatar.anim.baseLayer.play(initial);}
      status(`Загружено: ${title}. Высота ${info.height.toFixed(2)} м, ${clips.length} анимаций. Проверьте все ракурсы и FPS.`);
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
  try{
    const metadata=await inspectLocalFile(file);
    const nextUrl=URL.createObjectURL(file);
    try{await loadAsset(nextUrl,file.name,{...metadata,bytes:file.size});if(currentUrl)URL.revokeObjectURL(currentUrl);currentUrl=nextUrl;}
    catch(error){URL.revokeObjectURL(nextUrl);throw error;}
  }catch(error){status(`Ошибка файла: ${error?.message||String(error)}`);console.error(error);}
});
window.addEventListener('pagehide',()=>{if(currentUrl)URL.revokeObjectURL(currentUrl);});

const casSlots=['hair','top','trousers','shoes'];
function applyCasVariants(){
  if(labModel.key!=='casproto'||!current)return;
  for(const slot of casSlots){
    const base=current.findByName('CAS slot '+slot);
    const alternate=current.findByName('CAS slot '+slot+'-alt');
    if(!base||!alternate)throw new Error('Incomplete real skinned CAS mesh pair: '+slot);
    const button=document.querySelector('[data-cas-slot="'+slot+'"]');
    const useAlt=button?.getAttribute('aria-pressed')==='true';
    base.enabled=!useAlt;
    alternate.enabled=useAlt;
  }
}
if(labModel.key==='casproto'){
  for(const button of document.querySelectorAll('[data-cas-slot]'))button.addEventListener('click',()=>{
    button.setAttribute('aria-pressed',button.getAttribute('aria-pressed')==='true'?'false':'true');
    applyCasVariants();
  });
  // Read-only QA probe on this standalone lab; the game runtime has no such global.
  window.__LifeSimCasModularProbe=()=>({
    loaded:!!current,
    slots:casSlots.map(slot=>({
      slot,base:current?.findByName('CAS slot '+slot)?.enabled??null,
      alternate:current?.findByName('CAS slot '+slot+'-alt')?.enabled??null
    })),
    clips:currentAsset?.resource?.animations?.map(x=>x.resource?.name)||[],
    graphics:!!app.graphicsDevice,draws:app.stats?.drawCalls?.total||0,
    mobileFrame:(()=>{
      const dock=document.getElementById('cas-lab-panel')?.getBoundingClientRect();
      if(!current)return null;
      const toScreen=y=>{
        const pos=current.getWorldTransform().transformPoint(new pc.Vec3(0,y,0));
        return camera.camera.worldToScreen(pos).y;
      };
      return {headY:toScreen(1.85),footY:toScreen(0),
        dockTop:dock?.top??0,topSafe:42,width:innerWidth,height:innerHeight,
        yaw:view.yaw,pitch:view.pitch};
    })()
  });
}
function applyAlexFootwear(){
 if(labModel.key!=='alexpilot'||!current)return;
 const base=current.findByName('CAS Alex shoes original');
 const alt=current.findByName('CAS Alex shoes alternative');
 if(!base?.render||!alt?.render)throw new Error('Real Alex footwear skin nodes missing, refusing cosmetic-only demo');
 const button=$('alex-footwear-swap');
 const alternate=button.getAttribute('aria-pressed')==='true';
 base.enabled=!alternate;alt.enabled=alternate;
 button.disabled=false;
 button.textContent=alternate?'Исходная обувь · вернуть':'Обувь B · надеть';
}
if(labModel.key==='alexpilot'){
 $('alex-footwear-swap').addEventListener('click',()=>{
  const button=$('alex-footwear-swap');
  button.setAttribute('aria-pressed',button.getAttribute('aria-pressed')==='true'?'false':'true');
  applyAlexFootwear();
  status(button.getAttribute('aria-pressed')==='true'
   ?'Надета обувь B — скелет и оригинальные анимации Алекса сохранены.'
   :'Исходная обувь Алекса восстановлена.');
 });
 window.__LifeSimCasAlexProbe=()=>{
  const base=current?.findByName('CAS Alex shoes original');
  const alt=current?.findByName('CAS Alex shoes alternative');
  const panel=document.getElementById('cas-lab-panel')?.getBoundingClientRect();
  const project=y=>{
   if(!current)return null;
   const point=current.getWorldTransform().transformPoint(new pc.Vec3(0,y,0));
   return camera.camera.worldToScreen(point).y;
  };
  return {
   loaded:!!current,graphics:!!app.graphicsDevice,
   originalFootwearVisible:base?.enabled??null,alternativeFootwearVisible:alt?.enabled??null,
   originalSkin:!!base?.render,alternativeSkin:!!alt?.render,
   clips:currentAsset?.resource?.animations?.map(x=>x.resource?.name)||[],
   frame:current?{headY:project(1.70),footY:project(0),dockTop:panel?.top??null,
    topSafe:40,yaw:view.yaw,pitch:view.pitch,width:innerWidth,height:innerHeight}:null,
   drawCalls:app.stats?.drawCalls?.total??0
  };
 };
}
const casStyleChoices=['original','graphite','terracotta'];
function applyResidentFootwearStyles(){
 if(!isResidentStyleLab||!current)return;
 const kind=labModel.key==='mirastyles'?'mira':'alex';
 const selector=$('footwear-style');
 const active=selector.value||'original';
 for(const style of casStyleChoices){
  const node=current.findByName('CAS '+kind+' shoes '+style);
  if(!node?.render)throw new Error('Missing real '+kind+' independently skinned shoe style '+style);
  node.enabled=style===active;
 }
 selector.disabled=false;
}
if(isResidentStyleLab){
 $('footwear-style').addEventListener('change',()=>{
  applyResidentFootwearStyles();
  const name=labModel.key==='mirastyles'?'Миры':'Алекса';
  status('Выбрана обувь '+$('footwear-style').selectedOptions[0].textContent+
    ' — исходная модель и анимации '+name+' сохранены.');
 });
 window.__LifeSimCasResidentStylesProbe=()=>{
  const kind=labModel.key==='mirastyles'?'mira':'alex';
  const dock=$('cas-lab-panel')?.getBoundingClientRect();
  const project=y=>{
   if(!current)return null;
   return camera.camera.worldToScreen(current.getWorldTransform().transformPoint(
    new pc.Vec3(0,y,0))).y;
  };
  return {
   resident:kind,loaded:!!current,graphics:!!app.graphicsDevice,
   styles:casStyleChoices.map(style=>{
    const node=current?.findByName('CAS '+kind+' shoes '+style);
    return {style,exists:!!node,skinned:!!node?.render,enabled:node?.enabled??null,
     primitives:node?.render?.meshInstances?.length??0};
   }),
   active:$('footwear-style').value,
   clips:currentAsset?.resource?.animations?.map(x=>x.resource?.name)||[],
   view:{yaw:view.yaw,pitch:view.pitch,distance:view.distance},
   frame:current?{headY:project(1.7),footY:project(0),
    dockTop:dock?.top??null,topSafe:40,width:innerWidth,height:innerHeight}:null,
   drawCalls:app.stats?.drawCalls?.total??0
  };
 };
}

function cas022MorphInstances(){
 if(!current)return [];
 return current.findComponents('render').flatMap(component=>component.meshInstances||[])
   .map(instance=>instance.morphInstance).filter(Boolean);
}
function applyCas022Morphs(){
 if(!isCas022Lab||!current)return;
 const morphs=cas022MorphInstances();
 if(morphs.length!==1||morphs[0].morph.targets.length!==2)
   throw new Error('Real original-source head/torso morph targets are absent');
 const head=$('cas022-head'),torso=$('cas022-torso');
 const headWeight=Number(head.value)/100,torsoWeight=Number(torso.value)/100;
 if(!Number.isFinite(headWeight)||!Number.isFinite(torsoWeight))throw Error('Invalid CAS-02.2 weight');
 morphs[0].setWeight(0,Math.max(0,Math.min(1,headWeight)));
 morphs[0].setWeight(1,Math.max(0,Math.min(1,torsoWeight)));
 head.disabled=false;torso.disabled=false;
 $('cas022-head-value').textContent=Math.round(headWeight*100)+'%';
 $('cas022-torso-value').textContent=Math.round(torsoWeight*100)+'%';
}
if(isCas022Lab){
 for(const key of ['head','torso'])$('cas022-'+key).addEventListener('input',()=>{
   applyCas022Morphs();
   status('Изменена настоящая 3D-геометрия. Это эксперимент, не игровой пресет.');
 });
 $('cas022-resident').addEventListener('change',()=>{
   const resident=$('cas022-resident').value==='mira'?'mira':'alex';
   location.assign('./cas-02-2-lab.html?resident='+resident);
 });
 window.__LifeSimCas022Probe=()=>{
   const morphs=cas022MorphInstances();
   const panel=$('cas-lab-panel')?.getBoundingClientRect();
   const project=y=>current?camera.camera.worldToScreen(
     current.getWorldTransform().transformPoint(new pc.Vec3(0,y,0))).y:null;
   return {loaded:!!current,graphics:!!app.graphicsDevice,
     resident:labModel.key==='cas022mira'?'mira':'alex',
     morphCount:morphs[0]?.morph.targets.length??0,
     weights:morphs[0]?[morphs[0].getWeight(0),morphs[0].getWeight(1)]:[],
     clips:currentAsset?.resource?.animations?.map(x=>x.resource?.name)||[],
     drawCalls:app.stats?.drawCalls?.total??0,
     frame:current?{headY:project(1.7),footY:project(0),
       dockTop:panel?.top??null,topSafe:40,pitch:view.pitch,
       width:innerWidth,height:innerHeight}:null};
 };
}

app.start();
if(isModularLab)requestAnimationFrame(fitCasViewport);
// If the model has been committed as a stable asset, it loads without user input.
// No temporary signed Meshy URLs or user tokens belong in the public repository.
(async()=>{
 const styleResident=labModel.key==='alexstyles'?'alex':
   labModel.key==='mirastyles'?'mira':null;
 const manifestUrl=isCas022Lab
   ?'./assets/characters/cas-02-2-'+(labModel.key==='cas022mira'?'mira':'alex')+'-morphs.json?cas-02-2-a'
   :styleResident
   ?'./assets/characters/cas-'+styleResident+'-footwear-v2.json?cas-02-1-e'
   :labModel.key==='alexpilot'
   ?'./assets/characters/cas-alex-footwear-lab-v1.json?cas-02-1-d'
   :'./assets/characters/cas-modular-mannequin-v1.json?cas-02-1-c';
 const extra=isModularLab?await fetch(manifestUrl,{cache:'no-store'})
   .then(r=>r.ok?r.json():null).catch(()=>null):null;
 const response=await fetch(preferredAutoUrl,{method:'HEAD'});
 if(!response.ok)throw new Error('not bundled');
 return loadAsset(preferredAutoUrl,labModel.fileName,{
   bytes:extra?.bytes||Number(response.headers.get('content-length'))||labModel.bytes,
   triangles:extra?.triangles??extra?.sourceTriangles??labModel.triangles,
   joints:extra?.joints??labModel.joints,morphTargets:labModel.morphTargets
 });
})().catch(async error=>{
 if(isCas022Lab){
  cas022Fallback=true;
  const kind=labModel.key==='cas022mira'?'mira':'alex';
  try{
   await loadAsset('./assets/characters/'+(kind==='mira'?'meshy-mira-mobile-v1.glb':'meshy-casual-v1.glb'),
     'Оригинальный '+(kind==='mira'?'Мира':'Алекс'),{joints:66});
   status('Экспериментальные morph targets недоступны ('+
     String(error?.message||error)+'). Показана исходная модель; редактор деформаций отключён.');
  }catch(fallbackError){
   status('Ошибка 3D-просмотра: '+String(fallbackError?.message||fallbackError));
  }
  return;
 }
 status('Не удалось автоматически загрузить '+labModel.label+
   ': '+String(error?.message||error)+'. Можно выбрать GLB вручную для диагностики.');
});