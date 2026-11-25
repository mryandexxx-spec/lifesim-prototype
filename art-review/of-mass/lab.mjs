import * as pc from './playcanvas.mjs';
const data=await (await fetch('manifest.json')).json(), canvas=document.querySelector('canvas');
const options=new URLSearchParams(location.search);const aa=options.get('aa')==='1';canvas.width=Math.max(1,canvas.clientWidth);canvas.height=Math.max(1,canvas.clientHeight);const app=new pc.Application(canvas,{graphicsDeviceOptions:{alpha:false,preserveDrawingBuffer:true,antialias:aa}});app.setCanvasFillMode(pc.FILLMODE_NONE);app.setCanvasResolution(pc.RESOLUTION_FIXED,canvas.width,canvas.height);app.start();app.autoRender=false;app.scene.ambientLight=new pc.Color(.55,.57,.60);
const cam=new pc.Entity('Camera');cam.addComponent('camera',{clearColor:new pc.Color(.75,.80,.79),projection:pc.PROJECTION_ORTHOGRAPHIC,nearClip:.01,farClip:100});app.root.addChild(cam);
const key=new pc.Entity('Key');key.addComponent('light',{type:'directional',color:new pc.Color(1,.95,.87),intensity:1.5});key.setEulerAngles(48,32,0);app.root.addChild(key);
const fill=new pc.Entity('Fill');fill.addComponent('light',{type:'directional',color:new pc.Color(.76,.85,1),intensity:.6});fill.setEulerAngles(38,-100,0);app.root.addChild(fill);
const root=new pc.Entity('Object');app.root.addChild(root);
const catalog=await (await fetch('catalog.json')).json();
const names=Object.fromEntries(Object.entries(catalog).map(([k,v])=>[k,v.name]));
const frames=Object.fromEntries(Object.entries(catalog).map(([k,v])=>[k,v.frame]));
const sku=document.querySelector('#sku');for(const id of Object.keys(data)){const opt=new Option(names[id],id);sku.add(opt)}
let current=null,version='new',angle=1,night=false,seq=0;const cache=new Map();
function material(c){const m=new pc.StandardMaterial();m.diffuse=new pc.Color(...c);m.update();return m}
function box(n,p,s,c){let e=new pc.Entity(n);e.addComponent('render',{type:'box',material:material(c)});e.setPosition(...p);e.setLocalScale(...s);app.root.addChild(e);return e}
const floor=box('Floor',[0,-.06,0],[20,.1,20],[.77,.79,.74]);const deck=box('Deck',[0,-.04,-.75],[3,.08,1.5],[.85,.80,.72]);const wall=box('Pool wall',[0,-.64,-.04],[3,1.2,.08],[.45,.62,.65]);
function frame(){let [y,s]=frames[sku.value];const ps=[[0,y+.25,5],[3.5,y+2.5,4],[5,y+.25,0]];cam.setPosition(...ps[angle]);cam.lookAt(0,y,0);cam.camera.orthoHeight=s/2*Math.max(1,canvas.clientHeight/canvas.clientWidth);floor.enabled=!sku.value.startsWith('pool.');deck.enabled=wall.enabled=!floor.enabled}
function resize(){const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);if(canvas.width!==w||canvas.height!==h)app.setCanvasResolution(pc.RESOLUTION_FIXED,w,h);frame();app.renderNextFrame=true}window.addEventListener('resize',resize);
async function asset(url){if(!cache.has(url))cache.set(url,new Promise((resolve,reject)=>{const a=new pc.Asset(url,'container',{url});app.assets.add(a);a.ready(()=>resolve(a));a.on('error',reject);app.assets.load(a)}));return cache.get(url)}
async function show(id=sku.value,v=version,a=angle,n=night){const ticket=++seq;window.ready=false;sku.value=id;version=v;angle=a;night=n;const item=data[id][v];document.querySelector('#status').textContent='Загрузка…';for(const k of ['old','new','donor']){const b=document.querySelector('#'+k);b.disabled=!data[id][k];b.setAttribute('aria-pressed',String(k===v))}
if(!item)throw Error('missing model '+id+'/'+v);const loaded=await asset(item.file);if(ticket!==seq)return;if(current)current.destroy();current=loaded.resource.instantiateRenderEntity();root.addChild(current);key.light.intensity=n?.28:1.5;fill.light.intensity=n?.18:.6;app.scene.ambientLight=n?new pc.Color(.20,.24,.34):new pc.Color(.55,.57,.60);light.enabled=n&&(id==='floorlamp.arc'||id.startsWith('light.'));light.setPosition(...(id==='light.path'?[0,1.15,0]:id==='light.standing'?[0,2.44,0]:[.48,1.23,0]));frame();document.querySelector('#status').textContent=names[id]+' · '+v;document.querySelector('#metrics').textContent=item.triangles+' треугольников · '+Math.round(item.bytes/1024)+' КиБ · '+item.materials+' материалов';await settle();if(ticket===seq)window.ready=true}
const light=new pc.Entity('Lamp light');light.addComponent('light',{type:'omni',color:new pc.Color(1,.78,.48),intensity:1,range:3});light.setPosition(.48,1.23,0);app.root.addChild(light);
function run(...args){show(...args).catch(e=>{document.querySelector('#status').textContent=String(e);window.labError=String(e)})}
sku.onchange=()=>run(sku.value,'new');for(const v of ['old','new','donor'])document.querySelector('#'+v).onclick=()=>run(sku.value,v);document.querySelector('#angle').onclick=()=>run(sku.value,version,(angle+1)%3);document.querySelector('#light').onclick=()=>run(sku.value,version,angle,!night);
async function settle(){for(let i=0;i<2;i++)await new Promise(r=>{app.once('postrender',r);app.renderNextFrame=true;});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));}
async function framebuffer(){return new Promise(resolve=>{app.once('postrender',()=>{const gl=app.graphicsDevice.gl;const info={width:gl.drawingBufferWidth,height:gl.drawingBufferHeight,attributes:gl.getContextAttributes(),lost:gl.isContextLost(),error:gl.getError(),boundDefault:gl.getParameter(gl.FRAMEBUFFER_BINDING)===null};window.lastRenderInfo=info;resolve(canvas.toDataURL('image/png'));});app.renderNextFrame=true;});}
async function clearProbe(){const before=cam.camera.clearColor.clone(),visible=root.enabled,ground=floor.enabled;root.enabled=false;floor.enabled=false;deck.enabled=wall.enabled=false;
const images=[];for(const color of [new pc.Color(1,0,0),new pc.Color(0,1,0)]){cam.camera.clearColor=color;await settle();images.push(await framebuffer());}
cam.camera.clearColor=before;root.enabled=visible;floor.enabled=ground;frame();await settle();return {images,info:window.lastRenderInfo};}
let lot=null;
async function stress(v){
 if(lot)lot.destroy();lot=new pc.Entity('Diagnostic lot');app.root.addChild(lot);root.enabled=false;floor.enabled=true;deck.enabled=wall.enabled=false;light.enabled=false;key.light.intensity=1.5;fill.light.intensity=.6;app.scene.ambientLight=new pc.Color(.55,.57,.60);
 const ids=['tree.round','tree.tall','tree.broad','shrub.small','shrub.flowering','shrub.broad','flower.daisy','flower.tulip','flower.lavender','hedge.short','garden.bench','garden.table'];
 let n=0,triangles=0;
 for(let i=0;i<96;i++){const id=ids[i%4],item=data[id][v],a=await asset(item.file),e=a.resource.instantiateRenderEntity();lot.addChild(e);e.setLocalPosition((i%12-5.5)*2.2,0,(Math.floor(i/12)-3.5)*2.5);e.setLocalEulerAngles(0,(i%4)*90,0);n++;triangles+=item.triangles;}
 const a=await asset(data['pool.ladder'][v].file),e=a.resource.instantiateRenderEntity();lot.addChild(e);e.setLocalPosition(6,0,-5);n++;triangles+=data['pool.ladder'][v].triangles;
 cam.setPosition(12,14,17);cam.lookAt(0,0,0);cam.camera.orthoHeight=16*Math.max(1,canvas.clientHeight/canvas.clientWidth);
 await settle();const timings=[];let last=performance.now();for(let i=0;i<100;i++){app.renderNextFrame=true;await new Promise(r=>app.once('postrender',r));const t=performance.now();if(i>=10)timings.push(t-last);last=t;}
 timings.sort((a,b)=>a-b);return {instances:n,triangles,medianMs:timings[45],p95Ms:timings[85],drawCalls:app.stats?.drawCalls?.total??null};
}
function resetStress(){lot?.destroy();lot=null;root.enabled=true;frame();app.renderNextFrame=true;}
function visible(e){for(let n=e;n;n=n.parent)if(!n.enabled)return false;let count=0;function walk(n){if(!n.enabled)return;if(n.render?.enabled)count+=n.render.meshInstances.filter(m=>m.visible).length;for(const child of n.children)walk(child);}walk(e);return count>0;}
async function placeProbe(p){
 const saved=root.getLocalPosition().clone(),rotation=root.getLocalEulerAngles().clone();
 root.setLocalPosition(p.x,0,p.z);root.setLocalEulerAngles(0,-p.yaw,0);const ghost=current.clone();root.addChild(ghost);current.enabled=false;await settle();
 const pos=ghost.getPosition(),actual={x:pos.x,z:pos.z,yaw:Math.atan2(-root.forward.x,-root.forward.z)*180/Math.PI,ghostVisible:visible(ghost),committedHidden:!current.enabled};
 ghost.destroy();current.enabled=true;root.setLocalPosition(saved);root.setLocalEulerAngles(rotation);await settle();return {...actual,ghostRemoved:!root.children.includes(ghost),committedVisible:visible(current)};
}
window.ofLab={show,data,app,framebuffer,stress,resetStress,placeProbe,clearProbe,lotVisibility:async visible=>{lot.enabled=visible;await settle();},visibility:async visible=>{root.enabled=visible;await settle();}};resize();run();
