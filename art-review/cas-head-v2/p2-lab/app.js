import * as pc from 'https://mryandexxx-spec.github.io/lifesim-prototype/vendor/playcanvas.mjs';
const $=id=>document.getElementById(id);
const SOURCE='https://mryandexxx-spec.github.io/lifesim-prototype/assets/characters/';
const PATH={
 alex:{original:SOURCE+'meshy-casual-v1.glb',derived:'./assets/alex-derivative-dense.glb'},
 mira:{original:SOURCE+'meshy-mira-mobile-v1.glb',derived:'./assets/mira-derivative-dense.glb'}
};
const CHANNELS=['eyes','nose','lips','chin','cheeks'];
const state={family:'alex',variant:'derived',view:'face',pose:'idle',angle:0};
const weightMemory={alex:CHANNELS.map(()=>0),mira:CHANNELS.map(()=>0)};
const models=new Map(),pending=new Map();
let shown=null,serial=0;
const status=(message,error=false)=>{const el=$('status');el.textContent=message;el.style.color=error?'#ffd29c':'#e3f7f5';};
const canvas=$('review-canvas'),viewport=$('viewport');
const app=new pc.Application(canvas,{graphicsDeviceOptions:{antialias:true,alpha:false}});
app.start();
app.scene.ambientLight=new pc.Color(.7,.76,.75);
app.scene.gammaCorrection=pc.GAMMA_SRGB;
const floorMat=new pc.StandardMaterial();floorMat.diffuse=new pc.Color(.47,.55,.56);floorMat.gloss=8;floorMat.update();
const floor=new pc.Entity('floor');floor.addComponent('render',{type:'box',material:floorMat});floor.setLocalScale(5,.02,5);floor.setLocalPosition(0,-.04,0);app.root.addChild(floor);
for(const [rotation,intensity] of [[[42,24,0],1.5],[[60,-115,0],.65]]){
 const sun=new pc.Entity('studio-light');sun.addComponent('light',{type:'directional',intensity,color:new pc.Color(1,.97,.91)});
 sun.setEulerAngles(...rotation);app.root.addChild(sun);
}
const camera=new pc.Entity('camera');camera.addComponent('camera',{fov:42,nearClip:.01,farClip:60,clearColor:new pc.Color(.35,.46,.47)});app.root.addChild(camera);
function frame(){
 const face=state.view==='face';
 const y=face?(state.family==='alex'?1.54:1.47):.87;
 const radius=face?.58:3.15;
 const angle=state.angle*Math.PI/180;
 camera.setPosition(Math.sin(angle)*radius,y+.012,Math.cos(angle)*radius);
 camera.lookAt(new pc.Vec3(0,y,0));
 camera.camera.fov=face?36:41;
}
function resize(){
 const width=viewport.clientWidth,height=viewport.clientHeight;
 if(width>0&&height>0)app.resizeCanvas(width,height);
 frame();
}
new ResizeObserver(resize).observe(viewport);
window.addEventListener('orientationchange',resize);
function modelBounds(entity){
 let min=null,max=null;
 for(const comp of entity.findComponents('render'))for(const mi of comp.meshInstances){
  const aabb=mi.aabb;if(!aabb)continue;
  const a=aabb.getMin(),b=aabb.getMax();
  if(!min){min=a.clone();max=b.clone();}
  else{
   min.x=Math.min(min.x,a.x);min.y=Math.min(min.y,a.y);min.z=Math.min(min.z,a.z);
   max.x=Math.max(max.x,b.x);max.y=Math.max(max.y,b.y);max.z=Math.max(max.z,b.z);
  }
 }
 return min&&max?{min,max}:null;
}
async function assetFor(family,variant){
 const key=family+':'+variant;
 if(pending.has(key))return pending.get(key);
 const task=new Promise((resolve,reject)=>{
  const asset=new pc.Asset('CAS_HEAD_V2_'+key,'container',{url:PATH[family][variant]});
  app.assets.add(asset);
  asset.ready(()=>resolve(asset));
  asset.once('error',e=>reject(e instanceof Error?e:new Error('GLB import failed')));
  app.assets.load(asset);
 }).catch(error=>{pending.delete(key);throw error;});
 pending.set(key,task);return task;
}
async function instantiate(family,variant){
 const key=family+':'+variant;
 if(models.has(key))return models.get(key);
 const asset=await assetFor(family,variant);
 const entity=asset.resource.instantiateRenderEntity();
 app.root.addChild(entity);
 try{
  const bounds=modelBounds(entity);
  if(!bounds)throw Error('У GLB нет геометрии render');
  const height=bounds.max.y-bounds.min.y;
  if(!(height>.5&&height<5))throw Error('Неверный рост/координаты GLB');
  const scale=1.76/height;
  entity.setLocalScale(scale,scale,scale);
  entity.setLocalPosition(-(bounds.min.x+bounds.max.x)*scale*.5,-bounds.min.y*scale,-(bounds.min.z+bounds.max.z)*scale*.5);
  const morphInstances=entity.findComponents('render').flatMap(c=>c.meshInstances).map(mi=>mi.morphInstance).filter(Boolean);
  if(variant==='derived'){
   const real=morphInstances.filter(mi=>(mi.morph?.targets?.length??0)===CHANNELS.length);
   if(real.length!==1)throw Error('В новом GLB нет ровно одного комплекта из пяти геометрических морфов');
   // The P1 structural gate verifies Blender targetNames order on both exported files.
   morphInstances.length=0;morphInstances.push(real[0]);
  }
  const clips=asset.resource.animations||[];
  if(clips.length){
   entity.addComponent('anim',{activate:true});
   for(const clip of clips)entity.anim.assignAnimation(clip.resource.name,clip.resource);
  }
  entity.enabled=false;
  const record={entity,morphInstances,clips,scale};
  models.set(key,record);return record;
 }catch(error){entity.destroy();throw error;}
}
function applyMorphs(rec,kind){
 if(!rec||!rec.morphInstances.length||kind==='original')return;
 const values=weightMemory[state.family];
 values.forEach((w,i)=>rec.morphInstances[0].setWeight(i,w));
}
function choosePose(rec){
 if(!rec?.entity.anim||!rec.clips.length)return;
 const pattern={idle:/^idle/i,walking:/walk/i,sit:/sit|stand_to_sit/i}[state.pose];
 const clip=rec.clips.find(c=>pattern.test(c.resource.name))
  ||rec.clips.find(c=>/^idle/i.test(c.resource.name))||rec.clips[0];
 rec.entity.anim.baseLayer.play(clip.resource.name);
}
function pressed(group,value){
 document.querySelectorAll('[data-'+group+']').forEach(el=>
  el.setAttribute('aria-pressed',String(el.dataset[group]===value)));
}
function updatePanel(){
 pressed('family',state.family);pressed('variant',state.variant);
 pressed('view',state.view);pressed('pose',state.pose);
 $('rotate').textContent='Угол '+state.angle+'°';
 const disabled=state.variant!=='derived';
 for(const input of document.querySelectorAll('[data-morph]')){
  const i=CHANNELS.indexOf(input.dataset.morph);
  input.disabled=disabled;input.value=Math.round(weightMemory[state.family][i]*100);
  input.nextElementSibling.textContent=input.value+'%';
 }
}
async function switchModel(){
 const ticket=++serial;
 const family=state.family,variant=state.variant,key=family+':'+variant;
 updatePanel();frame();status('Загружаю '+(variant==='original'?'неизменный оригинал':'Blender WIP')+'…');
 try{
  const rec=await instantiate(family,variant);
  if(ticket!==serial)return;
  if(shown?.entity!==rec.entity)shown?.entity&&(shown.entity.enabled=false);
  shown=rec;rec.entity.enabled=true;
  applyMorphs(rec,variant);choosePose(rec);
  status(variant==='derived'
   ?'WIP · 5 геометрических морфов · исходный риг · художественный контроль НЕ пройден'
   :'Оригинал без изменений · сравнение с производной головой');
 }catch(error){
  if(ticket!==serial)return;
  shown?.entity&&(shown.entity.enabled=false);
  shown=null;
  status('Не удалось загрузить '+key+': '+(error?.message||error),true);
 }
}
document.querySelectorAll('[data-family]').forEach(el=>el.addEventListener('click',()=>{state.family=el.dataset.family;switchModel();}));
document.querySelectorAll('[data-variant]').forEach(el=>el.addEventListener('click',()=>{state.variant=el.dataset.variant;switchModel();}));
document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',()=>{state.view=el.dataset.view;updatePanel();frame();}));
document.querySelectorAll('[data-pose]').forEach(el=>el.addEventListener('click',()=>{state.pose=el.dataset.pose;updatePanel();choosePose(shown);}));
$('rotate').addEventListener('click',()=>{state.angle=(state.angle+45)%360;updatePanel();frame();});
for(const input of document.querySelectorAll('[data-morph]')){
 input.addEventListener('input',()=>{
  if(state.variant!=='derived')return;
  const index=CHANNELS.indexOf(input.dataset.morph);
  weightMemory[state.family][index]=Number(input.value)/100;
  input.nextElementSibling.textContent=input.value+'%';
  applyMorphs(shown,'derived');
 });
}
for(const [id,value] of [['min',0],['max',1]]){
 $(id).addEventListener('click',()=>{
  if(state.variant!=='derived')return;
  weightMemory[state.family]=CHANNELS.map(()=>value);
  updatePanel();applyMorphs(shown,'derived');
 });
}
$('toggle').addEventListener('click',()=>{
 const collapsed=$('panel').classList.toggle('collapsed');
 $('toggle').textContent=collapsed?'Раскрыть ⌃':'Свернуть ⌄';
 $('toggle').setAttribute('aria-expanded',String(!collapsed));
 resize();
});
canvas.addEventListener('webglcontextlost',()=>status('WebGL контекст потерян; сцена приостановлена',true));
canvas.addEventListener('webglcontextrestored',()=>{status('WebGL контекст восстановлен');switchModel();});
frame();resize();switchModel();