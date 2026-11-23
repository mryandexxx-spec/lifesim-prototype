/** CAS-02.1-F1 isolated original Alex + real CC0 leather dress shoes attached to
 * independently animated left/right foot bones. Rigid prototype; no toe skinning.
 */
import * as pc from 'playcanvas';
import {characterFit} from './character-lab-config.js';
const $=id=>document.getElementById(id);
const status=message=>{$('lab-status').textContent=message;};
const canvas=$('rig-canvas');
const app=new pc.Application(canvas,{graphicsDeviceOptions:{antialias:true,alpha:false}});
app.graphicsDevice.maxPixelRatio=Math.min(devicePixelRatio||1,1.5);
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
app.scene.ambientLight=new pc.Color(.62,.69,.67);
const mat=new pc.StandardMaterial();
mat.diffuse=new pc.Color(.85,.88,.85);
mat.update();
const floor=new pc.Entity('F1 laboratory floor');
floor.addComponent('render',{type:'box',material:mat});
floor.setLocalScale(6,.08,6);
floor.setLocalPosition(0,-.041,0);
app.root.addChild(floor);
for(const [ang,intensity,colour] of [
 [[55,-35,0],1.45,[1,.96,.88]],[[15,140,0],.75,[.82,.9,1]]]){
 const key=new pc.Entity('Rig laboratory light');
 key.addComponent('light',{type:'directional',intensity,
  color:new pc.Color(...colour),castShadows:false});
 key.setEulerAngles(...ang);
 app.root.addChild(key);
}
const camera=new pc.Entity('F1 rig camera');
camera.addComponent('camera',{clearColor:new pc.Color(.88,.92,.89),
 fov:42,nearClip:.03,farClip:100});
app.root.addChild(camera);
const view={yaw:18,pitch:20,distance:3.35};
let focusY=0;
function moveCamera(){
 const a=view.yaw*Math.PI/180,b=view.pitch*Math.PI/180;
 const target=new pc.Vec3(0,focusY,0);
 camera.setPosition(Math.sin(a)*Math.cos(b)*view.distance,
  target.y+Math.sin(b)*view.distance,
  Math.cos(a)*Math.cos(b)*view.distance);
 camera.lookAt(target);
}
function frameShoes(){
 const dock=$('rig-panel').getBoundingClientRect();
 const desired=Math.max(95,Math.min(innerHeight*.55,dock.top-64));
 const pixels=innerHeight/(2*Math.tan(camera.camera.fov*Math.PI/360)*view.distance);
 for(let i=0;i<3;i++){
  moveCamera();
  const y=camera.camera.worldToScreen(new pc.Vec3(0,.065,0)).y;
  focusY=Math.max(-1.2,Math.min(1.1,focusY-(y-desired)/pixels));
 }
 // The old F0 fixed -0.29m shift forced the low-pitch camera under
 // the floor on real mobile viewports. Keep the camera safely above it.
 moveCamera();
}
moveCamera();
const pointers=new Map();let pinch=0;
canvas.addEventListener('pointerdown',e=>{
 canvas.setPointerCapture?.(e.pointerId);
 pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 pinch=0;
});
canvas.addEventListener('pointermove',e=>{
 const prev=pointers.get(e.pointerId);if(!prev)return;
 pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pointers.size===1){
  view.yaw-=(e.clientX-prev.x)*.35;
  view.pitch=Math.min(65,Math.max(-20,view.pitch+(e.clientY-prev.y)*.27));
 }else if(pointers.size===2){
  const pts=[...pointers.values()],d=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);
  if(pinch>0&&d>0)view.distance=Math.min(10,Math.max(1.2,view.distance*pinch/d));
  pinch=d;
 }
 moveCamera();
});
for(const type of ['pointerup','pointercancel','lostpointercapture'])
 canvas.addEventListener(type,e=>{pointers.delete(e.pointerId);pinch=0;});
canvas.addEventListener('wheel',e=>{
 e.preventDefault();view.distance=Math.min(10,Math.max(1.2,view.distance*(1+e.deltaY*.001)));
 moveCamera();
},{passive:false});
$('camera-reset').addEventListener('click',()=>{
 Object.assign(view,{yaw:18,pitch:20,distance:3.35});
 focusY=0;frameShoes();
});
window.addEventListener('resize',()=>{app.resizeCanvas();frameShoes();});
function bounds(entity){
 let min=null,max=null;
 for(const component of entity.findComponents('render'))for(const instance of component.meshInstances||[]){
  const aabb=instance.aabb;
  if(!aabb)continue;
  const lo=aabb.getMin(),hi=aabb.getMax();
  if(!min){min=lo.clone();max=hi.clone();}
  else for(const axis of ['x','y','z']){
   min[axis]=Math.min(min[axis],lo[axis]);
   max[axis]=Math.max(max[axis],hi[axis]);
  }
 }
 if(!min)throw Error('Нет видимой геометрии GLB');
 return {min,max};
}
async function container(url){
 const a=new pc.Asset(url,'container',{url});
 app.assets.add(a);
 await new Promise((resolve,reject)=>{
  a.ready(resolve);a.once('error',reject);app.assets.load(a);
 });
 return a;
}
const round=v=>Math.round(v*10000)/10000;
const position=v=>({x:round(v.x),y:round(v.y),z:round(v.z)});
let avatar=null,avatarAsset=null,manifest=null,parts=null,ready=false;
let mode='source',currentClip=null;
function originalShoes(on){
 if(!avatar)return;
 for(const variant of ['original','graphite','terracotta']){
  const node=avatar.findByName('CAS alex shoes '+variant);
  if(!node?.render)throw Error('Исходная обувь Алекса недоступна');
  node.enabled=on&&variant==='original';
 }
}
function applyMode(){
 if(!parts)return;
 const dressed=mode==='dress';
 // Part of the original white sneaker remains in the 02.1-E body skin.
 // The independently split, original-skin residual is toggled reversibly.
 const residue=avatar?.findByName('CAS F1 source underfoot residual');
 if(!residue?.render)throw Error('F1 masked white sneaker residue not found');
 residue.enabled=!dressed;
 for(const side of ['left','right'])parts[side].anchor.enabled=dressed;
 originalShoes(!dressed);
 status(dressed?'Надеты кожаные туфли: каждая закреплена на своей анимированной стопе.':
  'Исходные кроссовки Алекса восстановлены.');
}
$('shoe-choice').addEventListener('change',e=>{
 mode=e.target.value;
 applyMode();
});
$('animation-clip').addEventListener('change',e=>{
 const next=e.target.value;
 if(!avatar?.anim||!next)return;
 currentClip=next;
 avatar.anim.baseLayer.play(next);
 status('Анимация Алекса: '+next+'. Обувь следует за костями стоп.');
});
$('pause-resume').addEventListener('click',()=>{
 if(!avatar?.anim)return;
 avatar.anim.playing=!avatar.anim.playing;
 $('pause-resume').textContent=avatar.anim.playing?'Пауза':'Продолжить';
});
$('show-report').addEventListener('click',()=>{
 const element=$('debug-report');
 element.hidden=!element.hidden;
 element.value=JSON.stringify(window.__LifeSimCasF1Probe(),null,2);
});
let frameCount=0,frameSeconds=0,fps=null;
app.on('update',dt=>{
 if(!Number.isFinite(dt)||dt<=0||dt>1)return;
 frameCount++;frameSeconds+=dt;
 if(frameSeconds>=1){
  fps=Math.round(frameCount/frameSeconds);
  $('fps').textContent='FPS: '+fps;
  frameCount=0;frameSeconds=0;
 }
});
window.__LifeSimCasF1Probe=()=>({
 loaded:ready,mode,currentClip,sourceResident:'alex',
 sourceClips:avatarAsset?.resource?.animations?.map(a=>a.resource.name)||[],
 sourceShoesVisible:avatar?.findByName('CAS alex shoes original')?.enabled??null,
 sourceSneakerResidueVisible:avatar?.findByName('CAS F1 source underfoot residual')?.enabled??null,
 vendorSourceHash:manifest?.sourceSha256??null,license:manifest?.license??null,
 sourceTriangles:manifest?.originalTriangles??null,
 twoSeparateMeshes:parts?Object.keys(parts).length===2:false,
 binding:parts?Object.fromEntries(['left','right'].map(side=>{
  const p=parts[side],a=p.anchor.getPosition(),f=p.foot.getPosition();
  return [side,{meshTriangles:manifest.parts[side].triangles,
   sourceHash:manifest.parts[side].sha256,
   parentFoot:p.anchor.parent===p.foot,visible:p.anchor.enabled,
   boneName:p.foot.name,toeName:p.toe.name,
   worldAnchor:position(a),worldFoot:position(f),
   anchorDistance:round(a.distance(f)),scale:round(p.size)}];
 })):null,
 view:{...view,focusY},cameraHeight:round(camera.getPosition().y),
 footBonesWorld:parts?Object.fromEntries(['left','right'].map(side=>
  [side,position(parts[side].foot.getPosition())])):null,
 footBonesPixelY:parts?Object.fromEntries(['left','right'].map(side=>
  [side,round(camera.camera.worldToScreen(parts[side].foot.getPosition()).y)])):null,
 panelTop:$('rig-panel').getBoundingClientRect().top,
 footPixelY:avatar?camera.camera.worldToScreen(new pc.Vec3(0,.065,0)).y:null,
 fps,riggingType:'per-foot rigid attachment',skinDeformation:false,
 productionReady:false,physicalIphoneApproved:false
});
/** An anchor inherits every translation and rotation of its OWN Mixamo foot bone.
 * The initial world position/rotation are converted into parent-relative space
 * by PlayCanvas; no model animation channels or bone transforms are mutated.
 */
function attachPart(side,shoeAsset){
 const foot=avatar.findByName('mixamorig:'+(side==='left'?'LeftFoot':'RightFoot'));
 const toe=avatar.findByName('mixamorig:'+(side==='left'?'LeftToeBase':'RightToeBase'));
 if(!foot||!toe)throw Error('В оригинальном риге нет кости стопы/носка '+side);
 const shoe=shoeAsset.resource.instantiateRenderEntity();
 app.root.addChild(shoe);
 const raw=bounds(shoe);
 const w=raw.max.x-raw.min.x,d=raw.max.z-raw.min.z;
 if(w<=0||d<=0||w>=d*1.4)throw Error('Некорректная ориентация кожаной туфли');
 const size=Math.min(.12/w,.285/d);
 const cx=(raw.max.x+raw.min.x)/2,cz=(raw.max.z+raw.min.z)/2;
 const fp=foot.getPosition().clone(),tp=toe.getPosition().clone();
 const delta=tp.clone().sub(fp);
 if(delta.length()<.025)throw Error('Toe bone lies too close to foot bone');
 const yaw=Math.atan2(delta.x,delta.z)*180/Math.PI;
 const point=fp.clone().lerp(fp,tp,.53);
 // Source sole resting point is fixed at the idle calibration floor.
 point.y=Math.max(0,Math.min(fp.y,tp.y)-.035);
 const anchor=new pc.Entity('CAS F1 '+side+' animated shoe anchor');
 foot.addChild(anchor);
 anchor.setPosition(point);
 anchor.setEulerAngles(0,yaw,0);
 app.root.removeChild(shoe);
 anchor.addChild(shoe);
 const avatarScale=avatar.getLocalScale().x;
 // Keep the source sole at the anchor while extending the rigid instep to
 // cover the visible ankle seam of the baked Alex trouser/foot topology.
 // This is an explicit F1 fit calibration, NOT nonrigid boot deformation.
 shoe.setLocalScale(size/avatarScale,1.45*size/avatarScale,size/avatarScale);
 shoe.setLocalPosition(-cx*size/avatarScale,-raw.min.y*size/avatarScale,
  -cz*size/avatarScale);
 return {anchor,foot,toe,shoe,size};
}
app.start();
(async()=>{
 try{
  avatarAsset=await container('./assets/characters/cas-alex-cc0-fitting-base.glb');
  avatar=avatarAsset.resource.instantiateRenderEntity();
  app.root.addChild(avatar);
  const fit=characterFit(bounds(avatar),2.05);
  avatar.setLocalScale(fit.scale,fit.scale,fit.scale);
  avatar.setLocalPosition(fit.x,fit.y,fit.z);
  const clips=avatarAsset.resource.animations.map(a=>a.resource);
  avatar.addComponent('anim',{activate:true});
  for(const clip of clips)avatar.anim.assignAnimation(clip.name,clip,undefined,1,true);
  for(const clip of clips){
   const option=document.createElement('option');
   option.value=clip.name;option.textContent=clip.name;
   $('animation-clip').append(option);
  }
  currentClip=clips.find(c=>/^idle/i.test(c.name))?.name||clips[0]?.name;
  if(!currentClip)throw Error('Нет исходных анимаций Алекса');
  avatar.anim.baseLayer.play(currentClip);
  $('animation-clip').value=currentClip;
  const response=await fetch('./assets/characters/cas-cc0-f1/dress.manifest.json',{cache:'no-store'});
  if(!response.ok)throw Error('Не опубликован F1 manifest');
  manifest=await response.json();
  if(manifest.license!=='CC0-1.0'||manifest.sourceSha256!==
   'b128daa115033cf074c6f5fe1ceba2f38b3f65bfa2a98451f133ead0f98db9ad'||
    manifest.originalTriangles!==19744||!manifest.parts?.left||!manifest.parts?.right)
   throw Error('CC0 provenance or source mesh changed');
  const shoes=await Promise.all(['left','right'].map(async side=>
   container('./assets/characters/cas-cc0-f1/'+manifest.parts[side].file)));
  // Allow source idle animation to evaluate bone world transforms before
  // converting their rigid shoe anchors to foot-local transforms.
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  parts={};
  for(const [index,side] of ['left','right'].entries())parts[side]=attachPart(side,shoes[index]);
  mode='dress';
  $('shoe-choice').value=mode;
  applyMode();
  $('fit-metrics').textContent='19 744 треуг. · CC0 · 2 независимые стопы';
  $('shoe-choice').disabled=false;
  $('animation-clip').disabled=false;
  $('pause-resume').disabled=false;
  frameShoes();
  ready=true;
 }catch(error){
  status('Ошибка F1: '+error.message);
  console.error(error);
 }
})();
