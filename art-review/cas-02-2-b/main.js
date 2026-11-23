import * as pc from 'https://mryandexxx-spec.github.io/lifesim-prototype/vendor/playcanvas.mjs';
import {computeReviewFraming} from './camera-layout.js';

const $=id=>document.getElementById(id);
const ASSETS='https://mryandexxx-spec.github.io/lifesim-prototype/assets/characters/';
const URLs={
  alex:ASSETS+'meshy-casual-v1.glb',
  mira:ASSETS+'meshy-mira-mobile-v1.glb',
  candidate:'https://cdn.jsdelivr.net/gh/kblood/CharacterCreator@852e48f316b90a0937234886630e4fb4cdfd1f78/output/base_body.glb'
};
const canvas=$('scene'),panel=$('panel'),status=$('status');
const app=new pc.Application(canvas,{graphicsDeviceOptions:{antialias:false,alpha:false}});
app.graphicsDevice.maxPixelRatio=Math.min(window.devicePixelRatio||1,1.25);
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
app.scene.ambientLight=new pc.Color(.62,.66,.65);
const floorMat=new pc.StandardMaterial();floorMat.diffuse=new pc.Color(.82,.87,.83);floorMat.gloss=20;floorMat.update();
const floor=new pc.Entity('floor');floor.addComponent('render',{type:'box',material:floorMat});
floor.setLocalPosition(0,-.055,0);floor.setLocalScale(7,.11,7);app.root.addChild(floor);
for(const [az,elevation,intensity] of [[-30,55,1.55],[122,23,.72]]){
  const light=new pc.Entity('review light');light.addComponent('light',{type:'directional',intensity,color:new pc.Color(1,.97,.93)});
  light.setEulerAngles(elevation,az,0);app.root.addChild(light);
}
const camera=new pc.Entity('review camera');
camera.addComponent('camera',{clearColor:new pc.Color(.90,.94,.92),fov:42,nearClip:.015,farClip:100});
app.root.addChild(camera);
const models={};const sourceColors=new WeakMap();
let resident='alex',viewMode='original',focus='body',yaw=12,pitch=5;
let dist=4.0,lastLayout=null,loadError='',isLoading=false,zoomMultiplier=1;
function say(message,error=false){status.textContent=message;status.classList.toggle('error',error);}
function adjustStatus(){panel.style.setProperty('--panel-height',panel.getBoundingClientRect().height+'px');}
function placeCamera(){
  adjustStatus();
  const bounds=panel.getBoundingClientRect();
  const controlsBottom=$('view-switch').getBoundingClientRect().bottom;
  const result=computeReviewFraming({
    viewportHeight:window.innerHeight,panelTop:bounds.top,controlsBottom,focus,fovDegrees:42
  });
  lastLayout=result;dist=Math.min(25,Math.max(.65,result.distance*zoomMultiplier));
  updateCamera();
}
function updateCamera(){
  if(!lastLayout)return;
  const y=lastLayout.targetY;
  const az=yaw*Math.PI/180,el=pitch*Math.PI/180;
  const centre=new pc.Vec3(0,y,0);
  camera.setPosition(Math.sin(az)*Math.cos(el)*dist,
    centre.y+Math.sin(el)*dist,Math.cos(az)*Math.cos(el)*dist);
  camera.lookAt(centre);
}
const pointers=new Map();let pinch=0;
canvas.addEventListener('pointerdown',event=>{
  try{canvas.setPointerCapture(event.pointerId);}catch{}
  pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});pinch=0;
});
canvas.addEventListener('pointermove',event=>{
  const previous=pointers.get(event.pointerId);if(!previous)return;
  const x=event.clientX,y=event.clientY;
  pointers.set(event.pointerId,{x,y});
  if(pointers.size===1){
    yaw-=(x-previous.x)*.32;
    pitch=Math.max(-30,Math.min(65,pitch+(y-previous.y)*.24));
  }else if(pointers.size===2){
    const [a,b]=[...pointers.values()];
    const length=Math.hypot(a.x-b.x,a.y-b.y);
    if(pinch>0&&length>0)zoomMultiplier=Math.max(.25,Math.min(4,zoomMultiplier*pinch/length));
    pinch=length;
    dist=Math.max(.65,Math.min(25,lastLayout.distance*zoomMultiplier));
  }
  updateCamera();
});
for(const event of ['pointerup','pointercancel','lostpointercapture'])
  canvas.addEventListener(event,e=>{pointers.delete(e.pointerId);pinch=0;});
canvas.addEventListener('wheel',e=>{
  e.preventDefault();
  zoomMultiplier=Math.max(.25,Math.min(4,zoomMultiplier*(1+e.deltaY*.001)));
  dist=Math.max(.65,Math.min(25,lastLayout.distance*zoomMultiplier));updateCamera();
},{passive:false});
function setPanel(expanded){
  panel.classList.toggle('expanded',expanded);
  $('tools-toggle').textContent=expanded?'×':'⚙';
  $('tools-toggle').setAttribute('aria-expanded',String(expanded));
  $('tools-toggle').setAttribute('aria-label',expanded?'Свернуть настройки':'Показать настройки');
  $('tools-toggle').title=expanded?'Свернуть настройки':'Настройки';
  requestAnimationFrame(placeCamera);
}
$('tools-toggle').addEventListener('click',()=>setPanel(!panel.classList.contains('expanded')));
function setFocus(value){
  focus=value;zoomMultiplier=1;
  $('view-face').setAttribute('aria-pressed',String(focus==='face'));
  $('view-body').setAttribute('aria-pressed',String(focus==='body'));
  placeCamera();
}
$('view-face').addEventListener('click',()=>setFocus('face'));
$('view-body').addEventListener('click',()=>setFocus('body'));
function renderBounds(entity){
  let min=null,max=null;
  for(const node of entity.findComponents('render'))for(const mesh of node.meshInstances){
    if(!mesh.aabb)continue;
    const lo=mesh.aabb.getMin(),hi=mesh.aabb.getMax();
    if(!min){min=lo.clone();max=hi.clone();}
    else{
      min.x=Math.min(min.x,lo.x);min.y=Math.min(min.y,lo.y);min.z=Math.min(min.z,lo.z);
      max.x=Math.max(max.x,hi.x);max.y=Math.max(max.y,hi.y);max.z=Math.max(max.z,hi.z);
    }
  }
  return min?{min,max}:null;
}
async function loadModel(kind){
  if(models[kind])return models[kind];
  const asset=new pc.Asset(kind,'container',{url:URLs[kind]});
  app.assets.add(asset);
  const promise=new Promise((resolve,reject)=>{
    asset.ready(resolve);asset.once('error',reject);app.assets.load(asset);
  });
  await Promise.race([
    promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Таймаут загрузки GLB (40 с)')),40000))
  ]);
  const entity=asset.resource.instantiateRenderEntity();
  app.root.addChild(entity);
  const bounds=renderBounds(entity);
  if(!bounds || bounds.max.y-bounds.min.y<.1){
    entity.destroy();throw new Error('Геометрия GLB не обнаружена');
  }
  const scale=1.76/(bounds.max.y-bounds.min.y);
  entity.setLocalScale(scale,scale,scale);
  entity.setLocalPosition(-(bounds.max.x+bounds.min.x)*.5*scale,-bounds.min.y*scale,
    -(bounds.max.z+bounds.min.z)*.5*scale);
  const animations=asset.resource.animations||[];
  if(kind!=='candidate'&&animations.length){
    try{
      entity.addComponent('anim',{activate:true});
      for(const item of animations)entity.anim.assignAnimation(item.resource.name,item.resource);
      const idle=animations.find(a=>/^idle/i.test(a.resource.name))||animations[0];
      entity.anim.baseLayer.play(idle.resource.name);
    }catch(error){console.warn('Optional idle animation unavailable',error);}
  }
  const morphInstances=entity.findComponents('render')
    .flatMap(x=>x.meshInstances||[])
    .map(x=>x.morphInstance).filter(Boolean);
  const names=[...new Set(morphInstances.flatMap(x=>x.morph?.targets?.map(t=>t.name)||[]))];
  entity.enabled=false;
  const model={asset,entity,morphInstances,names,animationCount:animations.length,
    meshCount:entity.findComponents('render').length};
  models[kind]=model;return model;
}
function displayed(){return viewMode==='candidate'?'candidate':resident;}
function displayModels(){for(const [name,model] of Object.entries(models))model.entity.enabled=name===displayed();}
function setChoice(){for(const [id,mode] of [['original','original'],['candidate','candidate']])
  $(id).setAttribute('aria-pressed',String(viewMode===mode));}
const faces={nose:['face_nose_width_decr','face_nose_width_incr'],
  eyes:['face_eye_size_decr','face_eye_size_incr'],
  lips:['face_lips_decr','face_lips_incr'],
  chin:['face_chin_decr','face_chin_incr'],
  weight:['weight_min','weight_max']
};
function setTarget(name,weight){
  for(const instance of models.candidate?.morphInstances||[]){
    const i=instance.morph?.targets?.findIndex(t=>t.name===name)??-1;
    if(i>=0)instance.setWeight(i,weight);
  }
}
function applyCandidate(){
  const model=models.candidate;if(!model)return;
  setTarget('gender_male',resident==='alex'?1:0);
  setTarget('gender_female',resident==='mira'?1:0);
  for(const [id,pair] of Object.entries(faces)){
    const amount=Number($(id).value)/100;
    setTarget(pair[0],Math.max(0,-amount));
    setTarget(pair[1],Math.max(0,amount));
  }
  const tints={source:'#ffffff',light:'#ffe1d3',warm:'#ddaf93',deep:'#986b51'};
  const tint=new pc.Color().fromString(tints[$('skin-tone').value]||'#ffffff');
  for(const component of model.entity.findComponents('render'))
    for(const instance of component.meshInstances){
      const material=instance.material;
      if(!material||!/(skin|body|face)/i.test(material.name||''))continue;
      if(!sourceColors.has(material))sourceColors.set(material,material.diffuse.clone());
      const base=sourceColors.get(material);
      material.diffuse=new pc.Color(base.r*tint.r,base.g*tint.g,base.b*tint.b);
      material.update();
    }
}
async function setView(mode){
  if(isLoading)return;
  if(mode==='original'){
    viewMode='original';displayModels();setChoice();
    say('Оригинальный '+(resident==='alex'?'Алекс':'Мира')+'. Управляйте камерой пальцем.');
    return;
  }
  if(!models.candidate){
    isLoading=true;$('candidate').disabled=true;
    say('Загружаю настоящую 3D-модель MakeHuman (7,2 МБ). Оригинал остаётся на экране…');
    try{await loadModel('candidate');loadError='';}
    catch(e){
      loadError=String(e?.message||e);
      say('Новая 3D-модель не загрузилась: '+loadError+'. Оригинал сохранён.',true);
      isLoading=false;$('candidate').disabled=false;return;
    }
    isLoading=false;$('candidate').disabled=false;
  }
  viewMode='candidate';
  for(const id of Object.keys(faces))$(id).disabled=false;
  $('skin-tone').disabled=false;
  applyCandidate();displayModels();setChoice();
  say('Реальная 3D-анатомия. Нажмите ⚙ для изменения черт лица.');
}
$('original').addEventListener('click',()=>{setView('original');});
$('candidate').addEventListener('click',()=>{setView('candidate');});
$('resident').addEventListener('change',async()=>{
  if(isLoading)return;
  resident=$('resident').value==='mira'?'mira':'alex';
  if(!models[resident]){
    say('Загружаю оригинальную модель '+(resident==='alex'?'Алекса':'Миры')+'…');
    try{await loadModel(resident);}catch(e){say('Не удалось загрузить оригинал: '+e.message,true);return;}
  }
  applyCandidate();displayModels();
  say(viewMode==='original'?'Оригинальный '+(resident==='alex'?'Алекс':'Мира')+'.':'3D-кандидат '+(resident==='alex'?'Алекса':'Миры')+'.');
});
for(const id of Object.keys(faces)){
  $(id).addEventListener('input',()=>{
    document.querySelector('output[for="'+id+'"]').textContent=$(id).value;
    applyCandidate();
  });
}
$('skin-tone').addEventListener('change',applyCandidate);
$('reset').addEventListener('click',()=>{
  for(const id of Object.keys(faces)){
    $(id).value=0;document.querySelector('output[for="'+id+'"]').textContent='0';
  }
  $('skin-tone').value='source';yaw=12;pitch=5;zoomMultiplier=1;applyCandidate();placeCamera();
});
const resize=()=>{app.resizeCanvas();requestAnimationFrame(placeCamera);};
window.addEventListener('resize',resize);
window.visualViewport?.addEventListener('resize',resize);
new ResizeObserver(()=>requestAnimationFrame(placeCamera)).observe(panel);
window.__LifeSimCas022BProbe=()=>({
  loaded:Object.keys(models),resident,viewMode,focus,panelExpanded:panel.classList.contains('expanded'),
  panelTop:panel.getBoundingClientRect().top,stage:lastLayout,
  targetCount:models.candidate?.names.length||0,
  missingFaceTargets:models.candidate?Object.values(faces).flat().filter(t=>!models.candidate.names.includes(t)):[],
  loadError,drawCalls:app.stats?.drawCalls?.total||0,
  originalPreserved:!!models[resident],saveChanged:false
});
app.start();requestAnimationFrame(placeCamera);
(async()=>{try{
  await loadModel('alex');displayModels();
  say('Алекс на экране. Выберите «Новый 3D» или масштаб сверху.');
}catch(e){loadError=String(e?.message||e);say('Не удалось загрузить исходную модель: '+loadError,true);}})();
