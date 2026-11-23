import * as pc from 'https://mryandexxx-spec.github.io/lifesim-prototype/vendor/playcanvas.mjs';
import {computeReviewFraming} from './camera-layout.js';
const $=id=>document.getElementById(id);
const SOURCE='https://mryandexxx-spec.github.io/lifesim-prototype/assets/characters/';
const TARGETS=['eyes','nose','lips','chin','cheeks','body'];
const PEOPLE={
 alex:[
  {name:'Глеб · новое лицо',weights:[.84,.12,.58,.93,.22,.85]},
  {name:'Тимур · новое лицо',weights:[.17,1,.19,.18,.97,.26]},
  {name:'Лев · новое лицо',weights:[.56,.66,.93,.37,.08,.55]}],
 mira:[
  {name:'Ника · новое лицо',weights:[.92,.16,.92,.22,.83,.13]},
  {name:'Ева · новое лицо',weights:[.14,.98,.18,.94,.23,.68]},
  {name:'Майя · новое лицо',weights:[.64,.57,.68,.13,.94,.92]}]
};
const original={alex:SOURCE+'meshy-casual-v1.glb',mira:SOURCE+'meshy-mira-mobile-v1.glb'};
const derived={alex:'./source-variants/alex.glb',mira:'./source-variants/mira.glb'};
const canvas=$('scene'),panel=$('panel'),status=$('status');
const app=new pc.Application(canvas,{graphicsDeviceOptions:{antialias:false,alpha:false}});
app.graphicsDevice.maxPixelRatio=Math.min(devicePixelRatio||1,1.25);
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);app.setCanvasResolution(pc.RESOLUTION_AUTO);
app.scene.ambientLight=new pc.Color(.62,.66,.65);
const mat=new pc.StandardMaterial();mat.diffuse=new pc.Color(.82,.87,.83);mat.gloss=20;mat.update();
const floor=new pc.Entity('review-floor');floor.addComponent('render',{type:'box',material:mat});
floor.setLocalPosition(0,-.055,0);floor.setLocalScale(7,.11,7);app.root.addChild(floor);
for(const [az,elevation,intensity]of [[-30,55,1.55],[122,23,.72]]){
 const light=new pc.Entity('review-light');light.addComponent('light',{type:'directional',
  intensity,color:new pc.Color(1,.97,.93)});light.setEulerAngles(elevation,az,0);app.root.addChild(light);
}
const camera=new pc.Entity('review-camera');
camera.addComponent('camera',{clearColor:new pc.Color(.90,.94,.92),fov:42,nearClip:.015,farClip:100});
app.root.addChild(camera);
const models=new Map(),assetPromises=new Map(),appearance=new Map();
let who='alex',selection=0,focus='body',yaw=8,pitch=2,zoomMultiplier=1,dist=4,lastLayout=null;
let busy=false,loadError='',toastTimer=null;
function say(msg,isError=false){
 status.textContent=msg;status.hidden=false;status.classList.toggle('error',isError);
 clearTimeout(toastTimer);
 if(!isError&&!msg.startsWith('Загружаю'))toastTimer=setTimeout(()=>{status.hidden=true;},4900);
}
function cameraPosition(){
 if(!lastLayout)return;
 const az=yaw*Math.PI/180,el=pitch*Math.PI/180,center=new pc.Vec3(0,lastLayout.targetY,0);
 camera.setPosition(Math.sin(az)*Math.cos(el)*dist,center.y+Math.sin(el)*dist,Math.cos(az)*Math.cos(el)*dist);
 camera.lookAt(center);
}
function frame(){
 document.documentElement.style.setProperty('--panel-height',panel.getBoundingClientRect().height+'px');
 lastLayout=computeReviewFraming({viewportHeight:innerHeight,
  panelTop:panel.getBoundingClientRect().top,controlsBottom:$('view-switch').getBoundingClientRect().bottom,
  focus,fovDegrees:42});
 dist=Math.max(.65,Math.min(25,lastLayout.distance*zoomMultiplier));cameraPosition();
}
const touches=new Map();let pinch=0;
canvas.addEventListener('pointerdown',e=>{
 try{canvas.setPointerCapture(e.pointerId);}catch{}
 touches.set(e.pointerId,{x:e.clientX,y:e.clientY});pinch=0;
});
canvas.addEventListener('pointermove',e=>{
 const a=touches.get(e.pointerId);if(!a)return;
 touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(touches.size===1){yaw-=(e.clientX-a.x)*.30;
  pitch=Math.max(-22,Math.min(60,pitch+(e.clientY-a.y)*.22));}
 else if(touches.size===2){
  const [u,v]=[...touches.values()],next=Math.hypot(u.x-v.x,u.y-v.y);
  if(pinch>0&&next>0)zoomMultiplier=Math.max(.25,Math.min(4,zoomMultiplier*pinch/next));
  pinch=next;dist=Math.max(.65,Math.min(25,lastLayout.distance*zoomMultiplier));
 }
 cameraPosition();
});
for(const type of ['pointerup','pointercancel','lostpointercapture'])
 canvas.addEventListener(type,e=>{touches.delete(e.pointerId);pinch=0;});
canvas.addEventListener('wheel',e=>{e.preventDefault();
 zoomMultiplier=Math.max(.25,Math.min(4,zoomMultiplier*(1+e.deltaY*.001)));
 dist=Math.max(.65,Math.min(25,lastLayout.distance*zoomMultiplier));cameraPosition();
},{passive:false});
$('tools-toggle').addEventListener('click',()=>{
 const show=!panel.classList.contains('expanded');panel.classList.toggle('expanded',show);
 $('tools-toggle').textContent=show?'×':'⚙';$('tools-toggle').setAttribute('aria-expanded',String(show));
 requestAnimationFrame(frame);
});
function setFocus(f){
 focus=f;zoomMultiplier=1;
 $('view-face').setAttribute('aria-pressed',String(f==='face'));
 $('view-body').setAttribute('aria-pressed',String(f==='body'));
 frame();
}
$('view-face').addEventListener('click',()=>setFocus('face'));
$('view-body').addEventListener('click',()=>setFocus('body'));
function getBounds(entity){
 let min=null,max=null;
 for(const c of entity.findComponents('render'))for(const m of c.meshInstances){
  const b=m.aabb;if(!b)continue;
  const a=b.getMin(),z=b.getMax();
  if(!min){min=a.clone();max=z.clone();}
  else{min.x=Math.min(min.x,a.x);min.y=Math.min(min.y,a.y);min.z=Math.min(min.z,a.z);
   max.x=Math.max(max.x,z.x);max.y=Math.max(max.y,z.y);max.z=Math.max(max.z,z.z);}
 }
 if(!min)return null;return {min,max};
}
const cacheKey=(kind,id)=>kind+':'+id;
const choice=()=>selection===-1?'original':'new-'+selection;
const record=()=>models.get(cacheKey(who,choice()));
const weightsFor=(kind,id)=>appearance.get(cacheKey(kind,id))||PEOPLE[kind][id].weights.slice();
async function getAsset(kind,newPerson){
 const k=kind+':'+(newPerson?'derived':'original');
 if(assetPromises.has(k))return assetPromises.get(k);
 const asset=new pc.Asset(k,'container',{url:(newPerson?derived:original)[kind]});
 app.assets.add(asset);
 const task=Promise.race([
  new Promise((resolve,reject)=>{asset.ready(()=>resolve(asset));asset.once('error',reject);app.assets.load(asset);}),
  new Promise((_,reject)=>setTimeout(()=>reject(Error('GLB did not load in 40s')),40000))
 ]).catch(e=>{assetPromises.delete(k);app.assets.remove(asset);asset.unload();throw e;});
 assetPromises.set(k,task);return task;
}
async function createPerson(kind,id){
 const key=cacheKey(kind,id===-1?'original':'new-'+id);
 if(models.has(key))return models.get(key);
 const asset=await getAsset(kind,id!==-1);
 const entity=asset.resource.instantiateRenderEntity();
 app.root.addChild(entity);
 try{
  const bounds=getBounds(entity);if(!bounds)throw Error('GLB has no skinned geometry');
  const height=bounds.max.y-bounds.min.y;
  if(!(height>.5&&height<5))throw Error('Unexpected source model height');
  const s=1.76/height;
  entity.setLocalScale(s,s,s);
  entity.setLocalPosition(-(bounds.max.x+bounds.min.x)*s*.5,-bounds.min.y*s,-(bounds.max.z+bounds.min.z)*s*.5);
  const clips=asset.resource.animations||[];
  if(clips.length){
   entity.addComponent('anim',{activate:true});
   for(const item of clips)entity.anim.assignAnimation(item.resource.name,item.resource);
   const idle=clips.find(c=>/^idle/i.test(c.resource.name))||clips[0];
   entity.anim.baseLayer.play(idle.resource.name);
  }
  const morphs=entity.findComponents('render').flatMap(c=>c.meshInstances)
   .map(mi=>mi.morphInstance).filter(Boolean);
  if(id!==-1&&(morphs.length!==1||morphs[0].morph?.targets?.length!==6))
   throw Error('Source derivative did not load six real PlayCanvas morph targets');
  if(id===-1&&morphs.length)throw Error('Canonical original unexpectedly has morph targets');
  if(id!==-1){
   for(const prev of models.values())if(prev.kind===kind&&prev.id!==-1&&prev.morphs[0]===morphs[0])
    throw Error('PlayCanvas shared morph weights between distinct new people');
   weightsFor(kind,id).forEach((v,i)=>morphs[0].setWeight(i,v));
  }
  entity.enabled=false;
  const result={asset,entity,morphs,kind,id,clips:clips.length};
  models.set(key,result);return result;
 }catch(error){entity.destroy();throw error;}
}
function updateSelect(){
 const select=$('identity');select.replaceChildren();
 const orig=document.createElement('option');orig.value='original';orig.textContent=who==='alex'?'Оригинал: Алекс':'Оригинал: Мира';
 select.append(orig);
 PEOPLE[who].forEach((p,i)=>{const o=document.createElement('option');
  o.value=String(i);o.textContent=p.name;select.append(o);});
 select.value=selection===-1?'original':String(selection);
}
function updateSliders(){
 const newPerson=selection!==-1&&!!record()?.morphs[0];
 const w=newPerson?weightsFor(who,selection):TARGETS.map(()=>0);
 TARGETS.forEach((name,i)=>{
  const input=$('morph-'+name);input.disabled=!newPerson;input.value=Math.round(w[i]*100);
  $('morph-'+name+'-val').textContent=Math.round(w[i]*100)+'%';
 });
}
function show(){
 const key=cacheKey(who,choice());
 for(const [k,rec]of models)rec.entity.enabled=(k===key);
 updateSelect();updateSliders();
}
async function selectPerson(kind,id){
 if(busy)return;
 const oldWho=who,oldId=selection;busy=true;
 $('resident').disabled=$('identity').disabled=$('next').disabled=true;
 say('Загружаю '+(id===-1?'оригинал':PEOPLE[kind][id].name)+'…');
 try{
  await createPerson(kind,id);
  who=kind;selection=id;loadError='';
  $('resident').value=who;show();
  say(id===-1?'Оригинальный житель без изменений. Выберите нового в списке.':
    PEOPLE[kind][id].name+': геометрия исходной модели, независимый экземпляр, 6 каналов лица/корпуса.');
 }catch(e){
  loadError=String(e?.message||e);who=oldWho;selection=oldId;
  $('resident').value=who;show();
  say('Не удалось открыть вариант: '+loadError+'. Оригинал доступен.',true);
 }finally{busy=false;$('resident').disabled=$('identity').disabled=$('next').disabled=false;}
}
$('resident').addEventListener('change',()=>selectPerson($('resident').value==='mira'?'mira':'alex',0));
$('identity').addEventListener('change',()=>{
 const value=$('identity').value;
 selectPerson(who,value==='original'?-1:Math.max(0,Math.min(2,Number(value))));
});
$('next').addEventListener('click',()=>selectPerson(who,selection<0?0:(selection+1)%PEOPLE[who].length));
TARGETS.forEach((name,i)=>$('morph-'+name).addEventListener('input',()=>{
 const rec=record();if(selection<0||!rec?.morphs[0])return;
 // Do not let a valid body morph look inert while the camera is on the face,
 // or hide a small face morph in the full-figure framing.
 const intendedFocus=name==='body'?'body':'face';
 if(focus!==intendedFocus)setFocus(intendedFocus);
 const weights=weightsFor(who,selection),value=Number($('morph-'+name).value)/100;
 weights[i]=Math.max(0,Math.min(1,value));
 appearance.set(cacheKey(who,selection),weights);
 rec.morphs[0].setWeight(i,weights[i]);
 $('morph-'+name+'-val').textContent=Math.round(weights[i]*100)+'%';
}));
$('reset').addEventListener('click',()=>{
 if(selection<0)return;
 const w=PEOPLE[who][selection].weights.slice();
 appearance.set(cacheKey(who,selection),w);
 w.forEach((v,i)=>record()?.morphs[0]?.setWeight(i,v));
 updateSliders();
});
const resize=()=>{app.resizeCanvas();requestAnimationFrame(frame);};
addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);
new ResizeObserver(()=>requestAnimationFrame(frame)).observe(panel);
window.__LifeSimNewPeopleProbe=()=>{
 const r=record();
 return {sourceFamily:who,identity:selection<0?'original':PEOPLE[who][selection].name,
  distinctLoaded:[...models.keys()],originalPreserved:!!models.get(cacheKey(who,'original')),
  visible:!!r?.entity.enabled,clips:r?.clips||0,morphCount:r?.morphs[0]?.morph?.targets?.length||0,
  weights:r?.morphs[0]?TARGETS.map((_,i)=>r.morphs[0].getWeight(i)):[],
  independentMorphInstances:new Set([...models.values()].filter(x=>x.id!==-1).map(x=>x.morphs[0])).size===
    [...models.values()].filter(x=>x.id!==-1).length,
  panelExpanded:panel.classList.contains('expanded'),focus,stage:lastLayout,
  error:loadError,localStorageWritten:false,hasMakeHuman:false,gameIntegration:false,
  drawCalls:app.stats?.drawCalls?.total||0};
};
// Art-only diagnostic hook: freezes source animations so per-slider WebGL
// pixel differences can be attributed to geometry rather than Idle motion.
window.__LifeSimMorphRegionQA={
 pause(){for(const r of models.values())r.entity.anim?.baseLayer?.pause();},
 zero(){const r=record();if(!r?.morphs[0])return false;
   TARGETS.forEach((_,i)=>r.morphs[0].setWeight(i,0));return true;},
 set(channel,value){const i=TARGETS.indexOf(channel),r=record();
   if(i<0||!r?.morphs[0])return false;
   r.morphs[0].setWeight(i,value);return true;}
};
app.start();requestAnimationFrame(frame);
(async()=>{try{
 await createPerson('alex',-1);await selectPerson('alex',0);
}catch(e){loadError=String(e?.message||e);say('Ошибка начальной загрузки: '+loadError,true);}})();
