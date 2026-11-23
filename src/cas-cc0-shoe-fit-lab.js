/** CAS-02.1-F0: real vendor CC0 shoe geometry inspection near the real Alex.
 * Standalone lab only. Unrigged raw pair geometry, no cosmetic gameplay mutations.
 */
import * as pc from 'playcanvas';
import {characterFit} from './character-lab-config.js';
const $=id=>document.getElementById(id);
const setStatus=text=>{$('lab-status').textContent=text;};
const canvas=$('fit-canvas'),app=new pc.Application(canvas,{graphicsDeviceOptions:{antialias:true,alpha:false}});
app.graphicsDevice.maxPixelRatio=Math.min(devicePixelRatio||1,1.5);
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
app.scene.ambientLight=new pc.Color(.62,.69,.67);
const makeMat=hex=>{
 const material=new pc.StandardMaterial();
 material.diffuse=new pc.Color().fromString(hex);
 material.gloss=20;material.update();return material;
};
const floor=new pc.Entity('CC0 shoe fit ground');
floor.addComponent('render',{type:'box',material:makeMat('#e0e4df')});
floor.setLocalScale(6,.08,6);floor.setLocalPosition(0,-.041,0);app.root.addChild(floor);
for(const [angles,intensity,color] of [[[55,-35,0],1.45,[1,.96,.88]],[[15,140,0],.75,[.82,.9,1]]]){
 const key=new pc.Entity('Lab directional');
 key.addComponent('light',{type:'directional',intensity,
   color:new pc.Color(...color),castShadows:false});
 key.setEulerAngles(...angles);app.root.addChild(key);
}
const camera=new pc.Entity('Lab camera');
camera.addComponent('camera',{clearColor:new pc.Color(.88,.92,.89),fov:42,nearClip:.03,farClip:100});
app.root.addChild(camera);
const cameraState={yaw:18,pitch:4,distance:4.6},selected={model:'dress',mode:'compare'};
function cameraMove(){
 const a=cameraState.yaw*Math.PI/180,b=cameraState.pitch*Math.PI/180;
 const target=new pc.Vec3(.24,1.0,0);
 camera.setPosition(target.x+Math.sin(a)*Math.cos(b)*cameraState.distance,
  target.y+Math.sin(b)*cameraState.distance,
  target.z+Math.cos(a)*Math.cos(b)*cameraState.distance);
 camera.lookAt(target);
}
cameraMove();
const pointers=new Map();let pinch=0;
canvas.addEventListener('pointerdown',e=>{
 canvas.setPointerCapture?.(e.pointerId);
 pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});pinch=0;
});
canvas.addEventListener('pointermove',e=>{
 const old=pointers.get(e.pointerId);if(!old)return;
 pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pointers.size===1){
  cameraState.yaw-=(e.clientX-old.x)*.35;
  cameraState.pitch=Math.min(65,Math.max(-20,cameraState.pitch+(e.clientY-old.y)*.27));
 }else if(pointers.size===2){
  const pts=[...pointers.values()],d=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);
  if(pinch>0&&d>0)cameraState.distance=Math.min(10,Math.max(1.2,cameraState.distance*pinch/d));
  pinch=d;
 }
 cameraMove();
});
for(const k of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(k,e=>{
 pointers.delete(e.pointerId);pinch=0;
});
canvas.addEventListener('wheel',e=>{
 e.preventDefault();cameraState.distance=Math.min(10,Math.max(1.2,cameraState.distance*(1+e.deltaY*.001)));cameraMove();
},{passive:false});
$('camera-reset').addEventListener('click',()=>{
 Object.assign(cameraState,{yaw:18,pitch:4,distance:4.6});cameraMove();
});
window.addEventListener('resize',()=>app.resizeCanvas());

function bounds(entity){
 let min=null,max=null;
 for(const r of entity.findComponents('render'))for(const mi of r.meshInstances||[]){
  const b=mi.aabb;if(!b)continue;
  const lo=b.getMin(),hi=b.getMax();
  if(!min){min=lo.clone();max=hi.clone();}
  else{
   for(const axis of ['x','y','z']){min[axis]=Math.min(min[axis],lo[axis]);max[axis]=Math.max(max[axis],hi[axis]);}
  }
 }
 if(!min)throw Error('Невозможно измерить реальную геометрию GLB');
 return {min,max};
}
async function assetContainer(url){
 const asset=new pc.Asset(url,'container',{url});
 app.assets.add(asset);
 await new Promise((resolve,reject)=>{asset.ready(resolve);asset.once('error',reject);app.assets.load(asset);});
 return asset;
}
const models=new Map();let avatar=null,avatarResource=null,active=null;
const CANDIDATES={
 dress:{label:'Кожаные туфли',file:'dress',page:'https://grab3d.com/models/props/shoe/'},
 sneakers:{label:'Кеды',file:'sneakers',page:'https://grab3d.com/models/props/sneaker/'},
 boots:{label:'Туристические ботинки',file:'boots',page:'https://grab3d.com/models/props/hiking-boots/'}
};
function setAvatarShoes(on){
 if(!avatar)return;
 for(const style of ['original','graphite','terracotta']){
  const node=avatar.findByName('CAS alex shoes '+style);
  if(!node?.render)throw Error('Source Alex shoes not independently available');
  node.enabled=on&&style==='original';
 }
}
function place(activeShoe,mode){
 if(!activeShoe)return;
 const {entity,raw}=activeShoe;
 const width=raw.max.x-raw.min.x,depth=raw.max.z-raw.min.z;
 const sourceMax=Math.max(width,depth);
 if(sourceMax<=0)throw Error('Нулевые размеры загруженной обуви');
 const scale=.34/sourceMax;
 const cx=(raw.min.x+raw.max.x)/2,cz=(raw.min.z+raw.max.z)/2;
 entity.setLocalScale(scale,scale,scale);
 const showByAlex=mode==='mock';
 entity.setLocalPosition((showByAlex?0:.74)-cx*scale,-raw.min.y*scale,
  (showByAlex?0.055:0)-cz*scale);
 setAvatarShoes(!showByAlex);
 if(avatar?.anim)avatar.anim.playing=!showByAlex;
 const tall=(raw.max.y-raw.min.y)*scale;
 $('fit-metrics').textContent=
   `${activeShoe.audit.triangles.toLocaleString('ru-RU')} треуг. · GLB ${(activeShoe.audit.bytes/1e6).toFixed(2)} МБ · высота ${(tall*100).toFixed(0)} см`;
 $('asset-page').href=CANDIDATES[selected.model].page;
 setStatus(showByAlex?'Условная статичная примерка: пара ещё не разделена и не прикреплена к костям стоп.':
  'Рядом с настоящим Алексом: исходная пара обуви сохранена.');
}
async function showShoe(id){
 const candidate=CANDIDATES[id];if(!candidate)throw Error('Неизвестная модель');
 selected.model=id;setStatus('Загрузка CC0 GLB '+candidate.label+'…');
 let info=models.get(id);
 if(!info){
  const root='./assets/characters/cas-cc0-f0/'+candidate.file;
  const audit=await fetch(root+'.audit.json',{cache:'no-store'}).then(r=>{
   if(!r.ok)throw Error('Проверка лицензии и хеша не опубликована');
   return r.json();
  });
  if(audit.license!=='CC0-1.0'||!audit.sha256||audit.id!==id)
   throw Error('У модели нет проверенного provenance-аудита');
  const asset=await assetContainer(root+'.glb');
  const entity=asset.resource.instantiateRenderEntity();
  app.root.addChild(entity);
  const raw=bounds(entity);
  entity.enabled=false;
  info={asset,entity,raw,audit};
  models.set(id,info);
 }
 if(active&&active!==info)active.entity.enabled=false;
 active=info;active.entity.enabled=true;
 place(info,selected.mode);
}
$('source-shoes').addEventListener('change',e=>
 showShoe(e.target.value).catch(error=>{setStatus('Ошибка загрузки: '+error.message);console.error(error);}));
$('fit-mode').addEventListener('change',e=>{
 selected.mode=e.target.value;
 if(active)place(active,selected.mode);
});
$('pause-resume').addEventListener('click',()=>{
 if(!avatar?.anim)return;
 avatar.anim.playing=!avatar.anim.playing;
 $('pause-resume').textContent=avatar.anim.playing?'Пауза':'Продолжить';
});
$('show-report').addEventListener('click',()=>{
 const t=$('debug-report');t.hidden=!t.hidden;
 t.value=JSON.stringify(window.__LifeSimCasF0Probe(),null,2);
});
let fpsFrame=0,fpsTime=0,fpsValue=null;
app.on('update',dt=>{
 if(!Number.isFinite(dt)||dt<=0||dt>1)return;
 fpsFrame++;fpsTime+=dt;
 if(fpsTime>=1){
  fpsValue=Math.round(fpsFrame/fpsTime);
  $('fps').textContent='FPS: '+fpsValue;
  fpsFrame=0;fpsTime=0;
 }
});
window.__LifeSimCasF0Probe=()=>({
 loaded:!!avatar&&!!active,
 sourceAlex:!!avatar,assetId:active?.audit.id??null,
 assetHash:active?.audit.sha256??null,license:active?.audit.license??null,
 triangles:active?.audit.triangles??null,skinCount:active?.audit.skins??null,
 clips:avatarResource?.resource?.animations?.map(x=>x.resource.name)??[],
 sourceShoeVisible:avatar?.findByName('CAS alex shoes original')?.enabled??null,
 mode:selected.mode,geometryBounds:active?{
  min:active.raw.min.toString(),max:active.raw.max.toString(),
  scale:active.entity.getLocalScale().x,
  visible:active.entity.enabled}:null,
 panelTop:$('fit-panel').getBoundingClientRect().top,
 view:{...cameraState},
 fps:fpsValue,physicalIphoneApproved:false,productionReady:false
});
app.start();
(async()=>{
 try{
  avatarResource=await assetContainer('./assets/characters/cas-alex-footwear-v2.glb');
  avatar=avatarResource.resource.instantiateRenderEntity();
  app.root.addChild(avatar);
  const fit=characterFit(bounds(avatar),2.05);
  avatar.setLocalScale(fit.scale,fit.scale,fit.scale);
  avatar.setLocalPosition(fit.x,fit.y,fit.z);
  const clips=avatarResource.resource.animations.map(x=>x.resource);
  avatar.addComponent('anim',{activate:true});
  for(const clip of clips)avatar.anim.assignAnimation(clip.name,clip,undefined,1,true);
  const idle=clips.find(c=>/^idle/i.test(c.name))?.name||clips[0]?.name;
  if(idle)avatar.anim.baseLayer.play(idle);
  $('pause-resume').disabled=false;
  await showShoe('dress');
  $('source-shoes').disabled=false;
  $('fit-mode').disabled=false;
 }catch(e){setStatus('Не удалось загрузить лабораторию: '+e.message);console.error(e);}
})();
