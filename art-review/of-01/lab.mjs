import * as pc from './playcanvas.mjs';
const data=await (await fetch('manifest.json')).json(), canvas=document.querySelector('canvas');
const app=new pc.Application(canvas,{graphicsDeviceOptions:{alpha:false,preserveDrawingBuffer:true,antialias:true}});app.setCanvasFillMode(pc.FILLMODE_NONE);app.setCanvasResolution(pc.RESOLUTION_AUTO);app.start();app.scene.ambientLight=new pc.Color(.55,.57,.60);
const cam=new pc.Entity('Camera');cam.addComponent('camera',{clearColor:new pc.Color(.75,.80,.79),projection:pc.PROJECTION_ORTHOGRAPHIC,nearClip:.01,farClip:100});app.root.addChild(cam);
const key=new pc.Entity('Key');key.addComponent('light',{type:'directional',color:new pc.Color(1,.95,.87),intensity:1.5});key.setEulerAngles(48,32,0);app.root.addChild(key);
const fill=new pc.Entity('Fill');fill.addComponent('light',{type:'directional',color:new pc.Color(.76,.85,1),intensity:.6});fill.setEulerAngles(38,-100,0);app.root.addChild(fill);
const root=new pc.Entity('Object');app.root.addChild(root);
const names={'diningtable.farm':'Стол «Ферма»','floorlamp.arc':'Торшер «Арка»','sculpture.balance':'Скульптура «Баланс»','tree.round':'Круглое дерево','pool.ladder':'Лестница бассейна'};
const frames={'diningtable.farm':[.42,3],'floorlamp.arc':[.84,2.5],'sculpture.balance':[.73,2.3],'tree.round':[1.05,3],'pool.ladder':[-.15,2.1]};
const sku=document.querySelector('#sku');for(const id of Object.keys(data)){const opt=new Option(names[id],id);sku.add(opt)}
let current=null,version='new',angle=1,night=false,seq=0;const cache=new Map();
function material(c){const m=new pc.StandardMaterial();m.diffuse=new pc.Color(...c);m.update();return m}
function box(n,p,s,c){let e=new pc.Entity(n);e.addComponent('render',{type:'box',material:material(c)});e.setPosition(...p);e.setLocalScale(...s);app.root.addChild(e);return e}
const floor=box('Floor',[0,-.06,0],[20,.1,20],[.77,.79,.74]);const deck=box('Deck',[0,-.04,-.75],[3,.08,1.5],[.85,.80,.72]);const wall=box('Pool wall',[0,-.64,-.04],[3,1.2,.08],[.45,.62,.65]);
function frame(){let [y,s]=frames[sku.value];const ps=[[0,y+.25,5],[3.5,y+2.5,4],[5,y+.25,0]];cam.setPosition(...ps[angle]);cam.lookAt(0,y,0);cam.camera.orthoHeight=s/2*Math.max(1,canvas.clientHeight/canvas.clientWidth);floor.enabled=sku.value!=='pool.ladder';deck.enabled=wall.enabled=!floor.enabled}
function resize(){app.resizeCanvas(canvas.clientWidth,canvas.clientHeight);frame()}window.addEventListener('resize',resize);
async function asset(url){if(!cache.has(url))cache.set(url,new Promise((resolve,reject)=>{const a=new pc.Asset(url,'container',{url});app.assets.add(a);a.ready(()=>resolve(a));a.on('error',reject);app.assets.load(a)}));return cache.get(url)}
async function show(id=sku.value,v=version,a=angle,n=night){const ticket=++seq;window.ready=false;sku.value=id;version=v;angle=a;night=n;const item=data[id][v];document.querySelector('#status').textContent='Загрузка…';for(const k of ['old','new','donor']){const b=document.querySelector('#'+k);b.disabled=!data[id][k];b.setAttribute('aria-pressed',String(k===v))}
if(!item)throw Error('missing model '+id+'/'+v);const loaded=await asset(item.file);if(ticket!==seq)return;if(current)current.destroy();current=loaded.resource.instantiateRenderEntity();root.addChild(current);key.light.intensity=n?.28:1.5;fill.light.intensity=n?.18:.6;app.scene.ambientLight=n?new pc.Color(.20,.24,.34):new pc.Color(.55,.57,.60);frame();document.querySelector('#status').textContent=names[id]+' · '+v;document.querySelector('#metrics').textContent=item.triangles+' треугольников · '+Math.round(item.bytes/1024)+' КиБ · '+item.materials+' материалов';await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));if(ticket===seq)window.ready=true}
const light=new pc.Entity('Lamp light');light.addComponent('light',{type:'omni',color:new pc.Color(1,.78,.48),intensity:1,range:3});light.setPosition(.48,1.23,0);app.root.addChild(light);app.on('update',()=>{light.enabled=night&&sku.value==='floorlamp.arc'});
function run(...args){show(...args).catch(e=>{document.querySelector('#status').textContent=String(e);window.labError=String(e)})}
sku.onchange=()=>run(sku.value,'new');for(const v of ['old','new','donor'])document.querySelector('#'+v).onclick=()=>run(sku.value,v);document.querySelector('#angle').onclick=()=>run(sku.value,version,(angle+1)%3);document.querySelector('#light').onclick=()=>run(sku.value,version,angle,!night);
window.ofLab={show,data,app};resize();run();
