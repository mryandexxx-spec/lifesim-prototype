import * as pc from 'https://mryandexxx-spec.github.io/lifesim-prototype/vendor/playcanvas.mjs';
import {computeReviewFraming} from './camera-layout.js';
const $=id=>document.getElementById(id);
const BASE='https://mryandexxx-spec.github.io/lifesim-prototype/assets/characters/';
const URLS={
 alex:{original:BASE+'meshy-casual-v1.glb',morph:BASE+'cas-02-2-alex-morphs.glb'},
 mira:{original:BASE+'meshy-mira-mobile-v1.glb',morph:BASE+'cas-02-2-mira-morphs.glb'}
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
 const l=new pc.Entity('review light');
 l.addComponent('light',{type:'directional',intensity,color:new pc.Color(1,.97,.93)});
 l.setEulerAngles(elevation,az,0);app.root.addChild(l);
}
const camera=new pc.Entity('review camera');
camera.addComponent('camera',{clearColor:new pc.Color(.90,.94,.92),fov:42,nearClip:.015,farClip:100});app.root.addChild(camera);
const models={};let resident='alex',viewMode='original',focus='body',yaw=8,pitch=2,dist=4,lastLayout=null,zoomMultiplier=1;
let busy=false,loadError='',statusTimer=null;
function say(message,error=false){
 status.textContent=message;status.classList.toggle('error',error);status.hidden=false;
 if(statusTimer)clearTimeout(statusTimer);
 if(!error&&!/Загружаю/.test(message))statusTimer=setTimeout(()=>{status.hidden=true;},4600);
}
function positionCamera(){
 document.documentElement.style.setProperty('--panel-height',panel.getBoundingClientRect().height+'px');
 lastLayout=computeReviewFraming({
   viewportHeight:innerHeight,panelTop:panel.getBoundingClientRect().top,
   controlsBottom:$('view-switch').getBoundingClientRect().bottom,focus,fovDegrees:42
 });
 dist=Math.max(.65,Math.min(25,lastLayout.distance*zoomMultiplier));updateCamera();
}
function updateCamera(){
 if(!lastLayout)return;
 const az=yaw*Math.PI/180,el=pitch*Math.PI/180,centre=new pc.Vec3(0,lastLayout.targetY,0);
 camera.setPosition(Math.sin(az)*Math.cos(el)*dist,centre.y+Math.sin(el)*dist,
   Math.cos(az)*Math.cos(el)*dist);camera.lookAt(centre);
}
const pointers=new Map();let pinch=0;
canvas.addEventListener('pointerdown',event=>{
 try{canvas.setPointerCapture(event.pointerId);}catch{}
 pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});pinch=0;
});
canvas.addEventListener('pointermove',event=>{
 const old=pointers.get(event.pointerId);if(!old)return;
 const x=event.clientX,y=event.clientY;pointers.set(event.pointerId,{x,y});
 if(pointers.size===1){yaw-=(x-old.x)*.30;pitch=Math.max(-22,Math.min(60,pitch+(y-old.y)*.22));}
 else if(pointers.size===2){
   const [a,b]=[...pointers.values()],n=Math.hypot(a.x-b.x,a.y-b.y);
   if(pinch>0&&n>0)zoomMultiplier=Math.max(.25,Math.min(4,zoomMultiplier*pinch/n));
   pinch=n;dist=Math.max(.65,Math.min(25,lastLayout.distance*zoomMultiplier));
 }
 updateCamera();
});
for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,e=>{pointers.delete(e.pointerId);pinch=0;});
canvas.addEventListener('wheel',e=>{
 e.preventDefault();zoomMultiplier=Math.max(.25,Math.min(4,zoomMultiplier*(1+e.deltaY*.001)));
 dist=Math.max(.65,Math.min(25,lastLayout.distance*zoomMultiplier));updateCamera();
},{passive:false});
function setPanel(open){
 panel.classList.toggle('expanded',open);$('tools-toggle').textContent=open?'×':'⚙';
 $('tools-toggle').setAttribute('aria-expanded',String(open));
 $('tools-toggle').setAttribute('aria-label',open?'Свернуть настройки':'Показать настройки');
 requestAnimationFrame(positionCamera);
}
$('tools-toggle').addEventListener('click',()=>setPanel(!panel.classList.contains('expanded')));
function setFocus(v){
 focus=v;zoomMultiplier=1;
 $('view-face').setAttribute('aria-pressed',String(v==='face'));
 $('view-body').setAttribute('aria-pressed',String(v==='body'));
 positionCamera();
}
$('view-face').addEventListener('click',()=>setFocus('face'));
$('view-body').addEventListener('click',()=>setFocus('body'));
function getBounds(entity){
 let min=null,max=null;
 for(const component of entity.findComponents('render'))for(const mi of component.meshInstances){
   const b=mi.aabb;if(!b)continue;
   const a=b.getMin(),c=b.getMax();
   if(!min){min=a.clone();max=c.clone();}
   else{min.x=Math.min(min.x,a.x);min.y=Math.min(min.y,a.y);min.z=Math.min(min.z,a.z);
     max.x=Math.max(max.x,c.x);max.y=Math.max(max.y,c.y);max.z=Math.max(max.z,c.z);}
 }
 return min?{min,max}:null;
}
function modelKey(who,mode){return who+'-'+mode;}
async function loadModel(who,mode){
 const key=modelKey(who,mode);
 if(models[key])return models[key];
 const asset=new pc.Asset(key,'container',{url:URLS[who][mode]});app.assets.add(asset);
 try{
  await Promise.race([
   new Promise((resolve,reject)=>{asset.ready(resolve);asset.once('error',reject);app.assets.load(asset);}),
   new Promise((_,reject)=>setTimeout(()=>reject(Error('GLB не загрузился за 40 с')),40000))
  ]);
  const entity=asset.resource.instantiateRenderEntity();
  app.root.addChild(entity);
  try{
   const bounds=getBounds(entity);if(!bounds)throw Error('Нет геометрии GLB');
   const height=bounds.max.y-bounds.min.y;if(height<.1)throw Error('Некорректная высота модели');
   const factor=1.76/height;
   entity.setLocalScale(factor,factor,factor);
   entity.setLocalPosition(-(bounds.max.x+bounds.min.x)*.5*factor,-bounds.min.y*factor,
     -(bounds.max.z+bounds.min.z)*.5*factor);
   const clips=asset.resource.animations||[];
   if(clips.length){
    entity.addComponent('anim',{activate:true});
    for(const item of clips)entity.anim.assignAnimation(item.resource.name,item.resource);
    const idle=clips.find(item=>/^idle/i.test(item.resource.name))||clips[0];
    entity.anim.baseLayer.play(idle.resource.name);
   }
   const morphs=entity.findComponents('render').flatMap(component=>component.meshInstances)
     .map(mi=>mi.morphInstance).filter(Boolean);
   if(mode==='morph'&&(morphs.length!==1||morphs[0].morph?.targets?.length!==2))
     throw Error('GLB не содержит двух подтверждённых исходных морфов');
   entity.enabled=false;
   const record={asset,entity,morphs,clips:clips.length,sourceResident:who};
   models[key]=record;return record;
  }catch(err){entity.destroy();throw err;}
 }catch(err){app.assets.remove(asset);asset.unload();throw err;}
}
function current(){return models[modelKey(resident,viewMode)]||null;}
function setVisible(){
 const key=modelKey(resident,viewMode);
 for(const [name,record] of Object.entries(models))record.entity.enabled=(name===key);
 $('original').setAttribute('aria-pressed',String(viewMode==='original'));
 $('candidate').setAttribute('aria-pressed',String(viewMode==='morph'));
}
function enableSliders(){
 const enabled=viewMode==='morph'&&!!current();
 for(const name of ['head','torso'])$('morph-'+name).disabled=!enabled;
}
function updateMorphs(){
 const instance=current()?.morphs[0];if(viewMode!=='morph'||!instance)return;
 const weights=['head','torso'].map(name=>Number($('morph-'+name).value)/100);
 weights.forEach((weight,index)=>instance.setWeight(index,Math.max(0,Math.min(1,weight))));
 for(const [index,name] of ['head','torso'].entries())$('morph-'+name+'-val').textContent=Math.round(weights[index]*100)+'%';
}
async function switchMode(next){
 if(busy)return;
 const key=modelKey(resident,next);
 if(!models[key]){
  busy=true;$('original').disabled=$('candidate').disabled=true;
  say('Загружаю исходный '+(resident==='alex'?'GLB Алекса':'GLB Миры')+' с настоящими morph targets…');
  try{await loadModel(resident,next);loadError='';}
  catch(error){
    loadError=String(error?.message||error);
    say('Не удалось загрузить проверенный оригинальный GLB: '+loadError+'. Исходный персонаж остаётся.',true);
    busy=false;$('original').disabled=$('candidate').disabled=false;return;
  }
  busy=false;$('original').disabled=$('candidate').disabled=false;
 }
 viewMode=next;setVisible();enableSliders();updateMorphs();
 say(next==='morph'?'Настоящий '+(resident==='alex'?'Алекс':'Мира')+' · 2 геометрических канала. Откройте ⚙.':
   'Исходный '+(resident==='alex'?'Алекс':'Мира')+' без изменений.');
}
$('original').addEventListener('click',()=>switchMode('original'));
$('candidate').addEventListener('click',()=>switchMode('morph'));
$('resident').addEventListener('change',async()=>{
 if(busy)return;
 const next=$('resident').value==='mira'?'mira':'alex';
 busy=true;$('original').disabled=$('candidate').disabled=true;
 if(!models[modelKey(next,viewMode)]){
  say('Загружаю исходного '+(next==='alex'?'Алекса':'Миру')+'…');
  try{await loadModel(next,viewMode);}
  catch(error){say('Ошибка модели: '+String(error?.message||error),true);
   $('resident').value=resident;busy=false;$('original').disabled=$('candidate').disabled=false;return;}
 }
 resident=next;setVisible();enableSliders();updateMorphs();
 busy=false;$('original').disabled=$('candidate').disabled=false;
 say('Оригинальный персонаж '+(resident==='alex'?'Алекс':'Мира')+' загружен.');
});
for(const name of ['head','torso'])$('morph-'+name).addEventListener('input',updateMorphs);
$('reset').addEventListener('click',()=>{
 for(const name of ['head','torso'])$('morph-'+name).value=0;
 updateMorphs();zoomMultiplier=1;yaw=8;pitch=2;positionCamera();
});
const resize=()=>{app.resizeCanvas();requestAnimationFrame(positionCamera);};
window.addEventListener('resize',resize);
window.visualViewport?.addEventListener('resize',resize);
new ResizeObserver(()=>requestAnimationFrame(positionCamera)).observe(panel);
window.__LifeSimCas022BProbe=()=>({
 resident,viewMode,focus,loaded:Object.keys(models),originalPreserved:!!models[modelKey(resident,'original')],
 modelVisible:!!current()?.entity.enabled,
 morphCount:current()?.morphs[0]?.morph?.targets?.length||0,
 weights:current()?.morphs[0]?['head','torso'].map((_,i)=>current().morphs[0].getWeight(i)):[],
 clipCount:current()?.clips||0,skinOrFacePresetsAvailable:false,
 hasMakeHuman:false,panelExpanded:panel.classList.contains('expanded'),
 stage:lastLayout,loadError,saveChanged:false,drawCalls:app.stats?.drawCalls?.total||0
});
app.start();requestAnimationFrame(positionCamera);
(async()=>{try{
 await loadModel('alex','original');setVisible();
 say('Оригинальный Алекс. Кнопка «Морфы» включает только два проверенных канала.');
}catch(e){loadError=String(e?.message||e);say('Ошибка загрузки оригинального Алекса: '+loadError,true);}})();