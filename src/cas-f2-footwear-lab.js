/** CAS-02.1-F2-C2 real source Alex + candidate CC0 footwear families attached to
 * independently animated left/right foot bones. Rigid prototype; no toe skinning.
 */
import * as pc from 'playcanvas';
import {characterFit} from './character-lab-config.js';
import {createFootFitProfile,createShoeFitManifest,planShoeLastFit} from './cas-footwear-standard.js';
import {buildFootSurface,skinFootSurface,clipSurfaceAbove,resolveFootwearLayers} from './cas-footwear-layers.js';
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

// F2-C2 is an EXPERIMENTAL visual rig lab, never live clothing inventory.
// Unknown real last orientations are quarantined and are not production ready.
const ALEX_F1_SKIN_SHA='b513bf95e9ca0201ae127db3d5ced6e94e4cf0cf92a40ea81d178d17c5fc44fa';
const SOURCE_SHOES=['dress','sneakers','boots'];
let avatar=null,avatarAsset=null,sourceAudit=null,pairs={},ready=false;
let mode='dress',currentClip=null,socks=true,selectedEpoch=0;
let gate=null,revealed=false,footSockets={};
let sockLayers={},sourceMask=null,sourceShoesNode=null;
const vec=p=>new pc.Vec3(p.x,p.y,p.z);
const toPlain=v=>({x:v.x,y:v.y,z:v.z});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
function renderGate(model){
 const snapshots=model.findComponents('render').map(component=>({component,wasEnabled:component.enabled}));
 if(snapshots.length<4)throw Error('Missing independently renderable original Alex meshes');
 for(const s of snapshots)s.component.enabled=false;
 return snapshots;
}
function reveal(){
 if(!gate)throw Error('Missing loading render state');
 for(const s of gate)s.component.enabled=s.wasEnabled;
 revealed=true;
}
function sourceVisible(visible){
 sourceMask.enabled=visible;
 for(const style of ['original','graphite','terracotta']){
  const node=avatar.findByName('CAS alex shoes '+style);
  if(!node?.render)throw Error('Original Meshy source shoe node missing');
  node.enabled=visible&&style==='original';
 }
}
function feetFromSkeleton(side){
 const cap=side==='left'?'Left':'Right';
 const foot=avatar.findByName('mixamorig:'+cap+'Foot');
 const toe=avatar.findByName('mixamorig:'+cap+'ToeBase');
 if(!foot||!toe)throw Error('Missing independent avatar foot/toe bone '+side);
 const fp=foot.getPosition(),tp=toe.getPosition();
 const dx=tp.x-fp.x,dz=tp.z-fp.z;
 const horizontal=Math.hypot(dx,dz);
 if(horizontal<.055||horizontal>.32)throw Error('CAS F2 source foot bone distance implausible '+side+' '+horizontal);
 const front={x:dx/horizontal,y:0,z:dz/horizontal};
 // Mixamo ToeBase is NOT a toe tip and is usually a very short bone span.
 // Use one resident-level anthropometric foot-length estimate (12.5% of the
 // existing 2.05m fitted actor stature), bounded by the measured bone span.
 // This remains a prototype estimate until original full skin-foot measurement;
 // never tune dress/sneaker/boot separately, and never stretch the upper.
 const L=clamp(2.05*.125,horizontal*1.3,horizontal*5);
 const heel={x:fp.x-front.x*horizontal*.16,y:0,z:fp.z-front.z*horizontal*.16};
 const tip={x:heel.x+front.x*L,y:0,z:heel.z+front.z*L};
 const soleY=Math.max(-.02,Math.min(fp.y,tp.y)-.038);
 heel.y=soleY+.023;tip.y=soleY+.018;
 const ball={x:heel.x+(tip.x-heel.x)*.7,y:soleY+.035,z:heel.z+(tip.z-heel.z)*.7};
 const instep={x:heel.x+(tip.x-heel.x)*.38,y:soleY+.072,z:heel.z+(tip.z-heel.z)*.38};
 const profile=createFootFitProfile({
  residentId:'alex',rigId:'alex-original-mixamo-66',side,
  sourceSkinSha256:ALEX_F1_SKIN_SHA,ballWidth:L*.37,soleY,
  landmarks:{ankle:toPlain(fp),heel,ball,toe:tip,instep}
 });
 return {side,foot,toe,profile,bindFoot:foot.getWorldTransform().clone(),
  bindToe:toe.getWorldTransform().clone()};
}
function normalizePairLast(id,parts){
 const report=sourceAudit.sources.find(s=>s.id===id);
 if(!report||report.status!=='geometry-split-review-required'||report.sourceParts.length!==2)
  throw Error('Source candidate '+id+' not safely split/audited');
 const manifestParts={};
 const rawBounds={};
 for(const side of ['left','right']){
  const p=parts[side],a=bounds(p.shoe);
  const min=toPlain(a.min),max=toPlain(a.max);
  const wx=max.x-min.x,dz=max.z-min.z,hy=max.y-min.y;
  const long=Math.max(wx,dz),short=Math.min(wx,dz);
  if(short<.03||long<.09||hy<.025)
   throw Error('Source shoe last geometry invalid '+id+' '+side);
  const axis=dz>=wx?'z':'x';
  const across=axis==='z'?'x':'z';
  const cent={x:(min.x+max.x)/2,y:0,z:(min.z+max.z)/2};
  const point=(along,height)=>({
    x:axis==='x'?along:cent.x,
    y:height,
    z:axis==='z'?along:cent.z
  });
  const start=min[axis]+long*.04,end=max[axis]-long*.04;
  const ysole=min.y;
  // Candidate landmarks extracted from measured original source AABB, not
  // hand-edited for dress/sneaker/boot nor per resident. Actual toe direction
  // and boot orientation remain UNVERIFIED until full anatomical inspection.
  manifestParts[side]={
   side,meshSha256:report.sourceParts.find(v=>v.side===side).sha256,
   triangles:report.sourceParts.find(v=>v.side===side).sourceTriangles,
   bounds:{min,max},
   ballWidth:short*.88,
   landmarks:{
    heel:point(start,ysole+hy*.13),
    toe:point(end,ysole+hy*.12),
    ball:point(start+(end-start)*.72,ysole+hy*.19),
    instep:point(start+(end-start)*.38,ysole+hy*.52),
    ankle:point(start+(end-start)*.12,ysole+hy*.88)
   },
   collarOpening:point(start+(end-start)*.20,ysole+hy*.9),
   solePlanePoint:point(start,ysole)
  };
  rawBounds[side]={axis,short,long,height:hy};
 }
 const manifest=createShoeFitManifest({version:1,id:'source-'+id,
  cut:id==='boots'?'boot':'low-top',
  source:{license:'CC0-1.0',sha256:report.sourceSha256,url:report.sourceUrl},
  parts:manifestParts});
 return {manifest,rawBounds};
}
function attachSide(part,socket,fit,side,id){
 // Resolve source vertex coordinates in REAL avatar bone world basis, preserving
 // one universal uniform scale in all three dimensions and grounded sole.
 const anchor=new pc.Entity('F2 '+id+' '+side+' foot socket');
 socket.foot.addChild(anchor);
 anchor.setPosition(vec(fit.translation));
 anchor.setEulerAngles(0,fit.yawRadians*180/Math.PI,0);
 app.root.removeChild(part.shoe);
 anchor.addChild(part.shoe);
 const avatarScale=avatar.getLocalScale().x;
 part.shoe.setLocalPosition(0,0,0);
 part.shoe.setLocalEulerAngles(0,0,0);
 part.shoe.setLocalScale(fit.scale/avatarScale,fit.scale/avatarScale,fit.scale/avatarScale);
 anchor.enabled=false;
 return anchor;
}
function makeSockLayer(socket){
 const garment=buildFootSurface(socket.profile,{kind:'sock'});
 const neutral=buildFootSurface(socket.profile,{kind:'neutral'});
 const mesh=new pc.Mesh(app.graphicsDevice);
 const mat=new pc.StandardMaterial();
 mat.diffuse=new pc.Color(.79,.82,.77);
 mat.useLighting=true;
 mat.cull=pc.CULLFACE_NONE;
 mat.update();
 const e=new pc.Entity('F2 anatomical sock '+socket.side);
 // Keep an initial valid triangle to allocate PlayCanvas mesh buffers.
 mesh.setPositions([0,0,0,.001,0,0,0,.001,0]);
 mesh.setIndices([0,1,2]);mesh.update();
 e.addComponent('render',{meshInstances:[new pc.MeshInstance(mesh,mat)]});
 app.root.addChild(e);e.enabled=false;
 return {entity:e,mesh,garment,neutral,mat,faces:0,vertexCount:0,lastTip:null};
}
function deltaMatrix(bone,bindWorld){
 const inv=bindWorld.clone().invert();
 const out=new pc.Mat4();
 out.mul2(bone.getWorldTransform(),inv);
 return [...out.data];
}
function applyGarment(){
 if(!avatar||!ready)return;
 const family=pairs[mode];
 for(const side of ['left','right']){
  const s=sockLayers[side],socket=footSockets[side];
  const policy=family?resolveFootwearLayers(socket.profile,family.last,{socks}):null;
  const show=mode!=='source'&&!!family?.fits?.[side]&&
   !!(policy?.sockVisible||policy?.neutralFootVisible);
  s.entity.enabled=show;
  if(!show){s.faces=0;s.vertexCount=0;continue;}
  const footDelta=deltaMatrix(socket.foot,socket.bindFoot);
  const toeDelta=deltaMatrix(socket.toe,socket.bindToe);
  const points=skinFootSurface(socks?s.garment:s.neutral,{footDelta,toeDelta});
  const item=family.sides[side];
  const src=family.last.parts[side];
  const collar=item.shoe.getWorldTransform().transformPoint(vec(src.collarOpening));
  const triangles=clipSurfaceAbove(points,(socks?s.garment:s.neutral).triangles,collar.y-.004);
  const positions=[],indices=[];
  for(const triangle of triangles)for(const vertex of triangle){
   positions.push(vertex.x,vertex.y,vertex.z);indices.push(indices.length);
  }
  if(!positions.length){s.entity.enabled=false;s.faces=0;s.vertexCount=0;continue;}
  s.mesh.setPositions(positions);
  s.mesh.setIndices(indices);
  s.mesh.update();
  s.faces=triangles.length;s.vertexCount=positions.length/3;
  s.lastTip=points.at(-1);
 }
}
async function loadPair(id){
 if(pairs[id])return pairs[id];
 const audit=sourceAudit.sources.find(a=>a.id===id);
 if(!audit||audit.status!=='geometry-split-review-required')
  throw Error(id+' candidate quarantined: '+(audit?.reason||'unknown'));
 const sourceParts={};
 const assets=await Promise.all(['left','right'].map(side=>{
  const part=audit.sourceParts.find(p=>p.side===side);
  if(!part)throw Error('Missing genuine '+id+' '+side+' GLB');
  return container('./assets/characters/cas-cc0-f2/'+part.file);
 }));
 for(const [i,side] of ['left','right'].entries()){
  const shoe=assets[i].resource.instantiateRenderEntity();
  app.root.addChild(shoe);
  sourceParts[side]={shoe};
 }
 const {manifest,rawBounds}=normalizePairLast(id,sourceParts);
 const fits={},sides={};
 for(const side of ['left','right']){
  let fit;
  try{fit=planShoeLastFit(footSockets[side].profile,manifest)}
  catch(error){throw Error(id+' '+side+' last='+round(manifest.parts[side].frame.length)+
   ' foot='+round(footSockets[side].profile.frame.length)+
   ' width='+round(footSockets[side].profile.ballWidth)+': '+error.message)}
  const anchor=attachSide(sourceParts[side],footSockets[side],fit,side,id);
  fits[side]=fit;
  sides[side]={...sourceParts[side],anchor,fit};
 }
 const family={id,last:manifest,sides,fits,rawBounds};
 pairs[id]=family;
 return family;
}
function applyMode(){
 if(!avatar||!ready)return;
 const original=mode==='source';
 sourceVisible(original);
 for(const [id,pair] of Object.entries(pairs))
  for(const side of ['left','right'])pair.sides[side].anchor.enabled=!original&&id===mode;
 for(const item of Object.values(sockLayers))item.entity.enabled=!original;
 for(const item of Object.values(sockLayers)){
  item.mat.diffuse=socks?new pc.Color(.79,.82,.77):new pc.Color(.72,.52,.41);
  item.mat.update();
 }
 status(original?'Исходные белые кроссовки восстановлены.':
  'Надета экспериментальная пара '+mode+'; стопы и носки анимируются. Посадка носка обуви ещё не утверждена.');
 applyGarment();
}
async function equipMode(next){
 const nonce=++selectedEpoch;
 if(next==='source'){
  mode=next;applyMode();return;
 }
 try{
  $('shoe-choice').disabled=true;
  status('Проверка и загрузка исходной пары '+next+'…');
  await loadPair(next);
  if(nonce!==selectedEpoch)return;
  mode=next;applyMode();
 }catch(error){
  if(nonce===selectedEpoch){
   status('Обувь '+next+' не прошла стандарт: '+error.message);
   console.warn('CAS F2 quarantined style:',next,error);
  }
 }finally{
  if(nonce===selectedEpoch){
   $('shoe-choice').disabled=false;
   $('shoe-choice').value=mode;
  }
 }
}
$('shoe-choice').addEventListener('change',e=>{void equipMode(e.target.value)});
$('sock-choice').addEventListener('change',e=>{
 socks=e.target.value==='on';applyMode();
});
$('animation-clip').addEventListener('change',e=>{
 if(!avatar?.anim)return;
 currentClip=e.target.value;
 avatar.anim.baseLayer.play(currentClip);
});
$('pause-resume').addEventListener('click',()=>{
 if(!avatar?.anim)return;
 avatar.anim.playing=!avatar.anim.playing;
 $('pause-resume').textContent=avatar.anim.playing?'Пауза':'Продолжить';
});
$('show-report').addEventListener('click',()=>{
 const element=$('debug-report');
 element.hidden=!element.hidden;
 element.value=JSON.stringify(window.__LifeSimCasF2Probe(),null,2);
});
let frameCount=0,frameSeconds=0,fps=null;
app.on('update',dt=>{
 if(Number.isFinite(dt)&&dt>0&&dt<1){
  frameCount++;frameSeconds+=dt;
  if(frameSeconds>=1){
   fps=Math.round(frameCount/frameSeconds);
   $('fps').textContent='FPS: '+fps;
   frameCount=0;frameSeconds=0;
  }
 }
});
app.on('postUpdate',()=>{applyGarment()});
window.__LifeSimCasF2Probe=()=>({
 loaded:ready,avatarInstantiated:!!avatar,previewRevealed:revealed,
 previewRendersSuppressed:avatar&&!revealed?
   avatar.findComponents('render').every(component=>!component.enabled):false,
 mode,currentClip,socks,fps,
 originalShoesVisible:avatar?.findByName('CAS alex shoes original')?.enabled??null,
 originalResidueVisible:sourceMask?.enabled??null,
 sourceClips:avatarAsset?.resource?.animations?.map(x=>x.resource.name)||[],
 auditedSources:sourceAudit?.sources?.map(s=>({
  id:s.id,status:s.status,sourceSha256:s.sourceSha256,
  orientationVerified:s.sourceOrientationVerified,contactApproved:s.contactApproved
 }))??[],
 attached:Object.fromEntries(Object.entries(pairs).map(([id,pair])=>[id,{
  cuts:pair.last.cut,rigType:'rigid source mesh with skinned sock',
  sides:Object.fromEntries(['left','right'].map(side=>{
   const p=pair.sides[side];
   return [side,{meshTriangles:pair.last.parts[side].triangles,
    meshSourceHash:pair.last.parts[side].meshSha256,
    parentFoot:p.anchor.parent===footSockets[side].foot,
    visible:p.anchor.enabled,scale:round(p.fit.scale),
    soleWorldY:round(p.fit.soleWorldY),collarWorldY:round(p.fit.collarWorldY),
    noVerticalStretch:true,sourceLast:pair.rawBounds[side],
    footWorld:position(footSockets[side].foot.getPosition())}];
  }))
 }])),
 sockLayers:Object.fromEntries(Object.entries(sockLayers).map(([side,s])=>
  [side,{visible:s.entity.enabled,sourceSkin:s.garment.skinId,
    originalGarment:s.garment.originalGeometry,layer:socks?'sock':'neutral-foot',
    faces:s.faces,vertices:s.vertexCount,
    movingToe:s.lastTip?position(s.lastTip):null}])),
 panelTop:$('rig-panel').getBoundingClientRect().top,
 footPixelY:camera.camera.worldToScreen(new pc.Vec3(0,.065,0)).y,
 view:{...view,focusY},productionReady:false,
 fourResidentPerformanceApproved:false,physicalIphoneApproved:false
});
app.start();
(async()=>{
 try{
  avatarAsset=await container('./assets/characters/cas-alex-cc0-fitting-base.glb');
  avatar=avatarAsset.resource.instantiateRenderEntity();
  gate=renderGate(avatar);
  app.root.addChild(avatar);
  const fit=characterFit(bounds(avatar),2.05);
  avatar.setLocalScale(fit.scale,fit.scale,fit.scale);
  avatar.setLocalPosition(fit.x,fit.y,fit.z);
  const clips=avatarAsset.resource.animations.map(a=>a.resource);
  avatar.addComponent('anim',{activate:true});
  for(const clip of clips){
   avatar.anim.assignAnimation(clip.name,clip,undefined,1,true);
   const option=document.createElement('option');
   option.value=clip.name;option.textContent=clip.name;
   $('animation-clip').append(option);
  }
  currentClip=clips.find(x=>/^idle/i.test(x.name))?.name||clips[0]?.name;
  if(!currentClip)throw Error('Missing genuine Alex animation clips');
  avatar.anim.baseLayer.play(currentClip);
  $('animation-clip').value=currentClip;
  sourceMask=avatar.findByName('CAS F1 source underfoot residual');
  if(!sourceMask?.render)throw Error('Source Meshy residual skin mask missing');
  const res=await fetch('./assets/characters/cas-cc0-f2/assessment.json',{cache:'no-store'});
  if(!res.ok)throw Error('F2 audit report missing from release');
  sourceAudit=await res.json();
  if(sourceAudit.productionReady!==false||sourceAudit.sources?.length!==3)
   throw Error('Unexpected or falsely approved CC0 assessment');
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  for(const side of ['left','right']){
   const socket=feetFromSkeleton(side);
   footSockets[side]=socket;
   sockLayers[side]=makeSockLayer(socket);
  }
  await loadPair('dress');
  mode='dress';
  ready=true;
  applyMode();
  reveal();
  $('shoe-choice').disabled=false;
  $('sock-choice').disabled=false;
  $('animation-clip').disabled=false;
  $('pause-resume').disabled=false;
  $('fit-metrics').textContent='Реальные CC0 GLB · 2 стопы · независимые анимированные носки';
  frameShoes();
 }catch(error){
  status('F2 экспериментальная примерка остановлена: '+error.message);
  console.error(error);
 }
})();
