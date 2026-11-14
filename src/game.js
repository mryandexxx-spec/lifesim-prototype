import * as pc from 'playcanvas';
import { ACTIONS, NEEDS, SAVE_KEY, newGame, loadGame, chooseAction, arrive, tick, autonomousChoice, readableTime } from './simulation.js';
import { findPath, nearestWalkable } from './navigation.js';
import { WISHES, MEMORY_TEXT } from './psychology.js';

// A fully code-authored room: no PlayCanvas Editor or 3D asset pipeline required.
const $ = id => document.getElementById(id);
const canvas = $('game-canvas');
let game;
try { game = loadGame(JSON.parse(localStorage.getItem(SAVE_KEY) || 'null')); }
catch { game = newGame(); }

const META = {
  bed: { title: 'Уютная кровать', category: 'Спальня', description: 'Сон восстанавливает энергию', icon: '☾', anchor: [-2.5, 1.22, -1.48] },
  fridge: { title: 'Холодильник', category: 'Кухня', description: 'Перекус восстанавливает сытость', icon: '◕', anchor: [3.42, 2.13, -2.79] },
  shower: { title: 'Душевая', category: 'Ванная', description: 'Душ повышает уровень гигиены', icon: '✧', anchor: [-3.65, 2.16, 2.45] },
  sofa: { title: 'Диван', category: 'Гостиная', description: 'Отдых повышает уровень досуга', icon: '♫', anchor: [1.35, 1.38, 1.54] }
};

let selected = null;
let beginAction = () => false;
let resetRuntime = () => {};
let toastTimeout;
function toast(message) {
  const el = $('toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toastTimeout); toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}
function save(silent = false) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); if (!silent) toast('Игра сохранена на этом устройстве'); }
  catch { if (!silent) toast('Не удалось сохранить: браузер запретил хранилище'); }
}
function closeMindPanel() {
  $('mind-panel').hidden = true;
  $('mind-toggle').setAttribute('aria-expanded', 'false');
}
$('mind-toggle').addEventListener('click', () => {
  const open = $('mind-panel').hidden;
  $('mind-panel').hidden = !open;
  $('mind-toggle').setAttribute('aria-expanded', String(open));
  if (open) select(null);
});
$('mind-close').addEventListener('click', closeMindPanel);
$('wish-do-btn').addEventListener('click', () => {
  const id = game.mind?.wish?.id;
  if (id && beginAction(id)) {
    closeMindPanel();
    toast('Алекс исполняет желание: ' + WISHES[id].label.toLowerCase());
  }
});
function select(id) {
  if (id) closeMindPanel();
  selected = id;
  for (const [key, button] of Object.entries(markers)) button.classList.toggle('active', key === id);
  $('action-sheet').hidden = !id;
  $('hint').hidden = Boolean(id);
  if (!id) return;
  $('action-category').textContent = META[id].category;
  $('action-title').textContent = META[id].title;
  $('action-description').textContent = META[id].description;
  $('action-button').innerHTML = `${ACTIONS[id].label} <span>↗</span>`;
}
const markers = {};
for (const id of Object.keys(META)) {
  const el = document.createElement('button'); el.type = 'button';
  el.className = 'hotspot';
  el.innerHTML = `<span class="item-symbol">${META[id].icon}</span><span>${META[id].title}</span>`;
  el.addEventListener('click', () => select(id));
  $('hotspots').append(el); markers[id] = el;
}
$('close-action').addEventListener('click', () => select(null));
$('action-button').addEventListener('click', () => {
  if (!selected) return;
  if (beginAction(selected)) {
    toast(`Алекс: ${ACTIONS[selected].label.toLowerCase()}`);
    select(null);
  }
});
$('pause-btn').addEventListener('click', () => {
  game.paused = !game.paused;
  $('pause-icon').textContent = game.paused ? '▶' : 'Ⅱ';
  $('pause-btn').setAttribute('aria-label', game.paused ? 'Продолжить' : 'Пауза');
  toast(game.paused ? 'Симуляция на паузе' : 'Время снова идёт');
});
$('speed-btn').addEventListener('click', () => {
  game.speed = game.speed === 1 ? 3 : 1;
  $('speed-btn').textContent = `${game.speed}×`;
  toast(game.speed === 3 ? 'Ускорение времени ×3' : 'Обычная скорость');
});
$('save-btn').addEventListener('click', () => save());
$('reset-btn').addEventListener('click', () => {
  if (!window.confirm('Начать новую жизнь? Текущее сохранение будет заменено.')) return;
  game = newGame(); resetRuntime(); save(true); select(null); closeMindPanel(); toast('Новая игра началась');
});
window.addEventListener('pagehide', () => save(true));
window.addEventListener('visibilitychange', () => { if (document.hidden) save(true); });
setInterval(() => save(true), 8000);

// Graphics setup. WebGL2 is preferred for predictability on mobile Safari.
function boot() {
  const app = new pc.Application(canvas, { graphicsDeviceOptions: { alpha: false, antialias: true, preserveDrawingBuffer: false } });
  app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  app.scene.ambientLight = new pc.Color(0.69, 0.70, 0.70);
  window.addEventListener('resize', () => app.resizeCanvas());

  const mat = (hex, opts = {}) => {
    const color = new pc.Color().fromString(hex);
    const m = new pc.StandardMaterial();
    m.diffuse = color;
    if (opts.emissive) { m.emissive = color; m.emissiveIntensity = opts.emissive; }
    if (opts.opacity !== undefined) { m.opacity = opts.opacity; m.blendType = pc.BLEND_NORMAL; m.depthWrite = false; }
    m.metalness = opts.metalness || 0;
    m.shininess = opts.shininess || 28;
    m.update(); return m;
  };
  const M = {
    floor: mat('#e4cdb4'), line: mat('#e9d8c5'), edge: mat('#f0dfce'), wall: mat('#f5ebda'), wall2: mat('#ecf3e8'),
    trim: mat('#d8cab5'), wood: mat('#9f745c'), paleWood: mat('#c99e7d'), dark: mat('#53615c'), cream: mat('#faf5e8'),
    mint: mat('#a7cab6'), green: mat('#477e62'), darkGreen: mat('#315d50'), leaf: mat('#4f986b'), leaf2: mat('#7cb785'),
    pink: mat('#e8b6aa'), peach: mat('#efcfb6'), rust: mat('#bb856f'), slate: mat('#6f8b89'), glass: mat('#badeda', {opacity:0.38}),
    white: mat('#fffdf7'), black: mat('#303c3a'), tan: mat('#be9d86'), blue: mat('#c5dbdd'), yellow: mat('#f7d68d'),
    skin: mat('#c88d6e'), hair: mat('#47382f'), shirt: mat('#4b967d'), trousers: mat('#566675'), rug: mat('#d6b8a5')
  };
  const primitive = (type,name,x,y,z,sx,sy,sz,material,parent=app.root) => {
    const entity = new pc.Entity(name);
    entity.addComponent('render',{ type, material });
    entity.setLocalPosition(x,y,z);
    entity.setLocalScale(sx,sy,sz);
    parent.addChild(entity);
    return entity;
  };
  const box = (...args) => primitive('box', ...args);
  const ball = (...args) => primitive('sphere', ...args);
  const cylinder = (...args) => primitive('cylinder', ...args);

  // Room platform: visible cutaway walls, planks, and sunlight accents.
  box('foundation',0,-0.28,0,10.5,.47,9.2,M.edge);
  box('floor',0,-0.032,0,10,.12,8.65,M.floor);
  for (let i=0;i<10;i++) box('floor plank',-4.45+i*.99,.034,0,.021,.008,8.6,M.line);
  box('back wall',0,1.40,-4.34,10.02,2.9,.16,M.wall);
  box('left wall',-4.97,1.40,0,.16,2.9,8.65,M.wall2);
  box('back top trim',0,2.91,-4.30,10.1,.13,.2,M.trim);
  box('left top trim',-4.96,2.91,0,.20,.13,8.68,M.trim);
  box('baseboard back',0,.16,-4.19,10,.18,.13,M.trim);
  box('baseboard left',-4.83,.16,0,.13,.18,8.5,M.trim);
  // Wall art: one picture, one shelf and one window with sky-coloured panes.
  box('window frame',-2.18,1.87,-4.16,2.0,1.28,.1,M.paleWood);
  box('window',-2.18,1.87,-4.06,1.77,1.08,.08,M.blue);
  box('window cross vertical',-2.18,1.87,-3.99,.09,1.14,.13,M.cream);
  box('window cross horizontal',-2.18,1.88,-3.99,1.84,.09,.13,M.cream);
  box('landscape',.2,2.12,-4.13,1.1,.72,.12,M.wood);
  box('landscape inside',.2,2.12,-4.03,.93,.56,.07,M.slate);
  ball('art sun',.42,2.22,-3.97,.25,.25,.04,M.yellow);
  box('shelf on left wall',-4.72,1.74,.15,.27,.1,1.2,M.paleWood);
  for (let i=0;i<3;i++) box('books',-4.69,1.91,-.25+i*.22,.21,.32,.13,[M.pink,M.cream,M.green][i]);

  // Bed, blanket, headboard and pillows.
  box('bed frame',-2.62,.28,-1.42,2.42,.38,2.52,M.wood);
  box('mattress',-2.62,.52,-1.42,2.23,.22,2.36,M.white);
  box('duvet',-2.62,.65,-.95,2.2,.15,1.45,M.mint);
  box('duvet detail',-2.62,.735,-1.58,2.08,.025,.045,M.cream);
  box('bed headboard',-2.62,.82,-2.69,2.47,.95,.17,M.paleWood);
  box('pillow left',-3.15,.69,-2.18,.87,.19,.50,M.cream);
  box('pillow right',-2.10,.69,-2.18,.87,.19,.50,M.peach);
  box('side table',-4.23,.38,-1.45,.65,.64,.68,M.paleWood);
  cylinder('lamp base',-4.23,.76,-1.45,.22,.10,.22,M.white);
  cylinder('lamp stem',-4.23,.94,-1.45,.055,.32,.055,M.slate);
  cylinder('lamp shade',-4.23,1.17,-1.45,.45,.32,.45,M.yellow);

  // Kitchen zone with tall fridge, little counter and upper cupboards.
  box('fridge',3.43,.99,-2.85,1.12,1.98,1.14,M.cream);
  box('fridge shadow seam',3.43,1.49,-2.26,1.06,.035,.03,M.trim);
  box('fridge handle top',3.01,1.69,-2.20,.055,.33,.08,M.slate);
  box('fridge handle bottom',3.01,1.12,-2.20,.055,.26,.08,M.slate);
  // A hinged door gives visible feedback during a snack action.
  const fridgeHinge = new pc.Entity('Fridge door hinge'); app.root.addChild(fridgeHinge);
  fridgeHinge.setPosition(2.88,1.44,-2.21);
  box('fridge door',.55,0,.055,1.08,.91,.08,M.cream,fridgeHinge);
  box('door handle',.94,.07,.13,.05,.31,.055,M.slate,fridgeHinge);
  box('kitchen cabinet',1.68,.46,-3.31,2.20,.91,.89,M.paleWood);
  box('countertop',1.68,.95,-3.31,2.3,.11,1.01,M.cream);
  box('sink',1.04,1.017,-3.31,.66,.012,.43,M.slate);
  cylinder('faucet',1.0,1.20,-3.54,.06,.33,.06,M.slate);
  box('kitchen top cabinets',1.48,2.12,-4.02,2.1,.85,.55,M.mint);
  for(let i=0;i<2;i++) box('cabinet handle',.87+i*.9,2.12,-3.726,.20,.035,.04,M.paleWood);
  box('ceramic cup',2.29,1.08,-3.28,.24,.21,.24,M.pink);
  box('kitchen rug',1.57,.036,-2.39,1.8,.01,.70,M.rug);

  // Lounge with sofa, rug, coffee table and TV.
  box('living rug',1.24,.034,1.19,4.15,.015,3.1,M.cream);
  box('rug center',1.24,.045,1.19,3.84,.012,2.78,M.rug);
  box('sofa seat',1.35,.42,1.54,2.53,.54,1.05,M.peach);
  box('sofa back',1.35,.73,2.10,2.52,.95,.29,M.rust);
  box('sofa arm left',.11,.63,1.54,.30,.86,1.21,M.rust);
  box('sofa arm right',2.58,.63,1.54,.30,.86,1.21,M.rust);
  box('sofa pillow left',.72,.75,1.80,.63,.47,.23,M.cream);
  box('sofa pillow right',1.99,.75,1.80,.63,.47,.23,M.mint);
  box('coffee table top',1.34,.40,.15,1.47,.12,.73,M.paleWood);
  for(let x of [.74,1.94]) for(let z of [-.12,.42]) cylinder('table leg',x,.20,z,.085,.33,.085,M.wood);
  box('tv console',3.91,.41,.37,.66,.73,1.69,M.paleWood);
  box('tv screen',3.52,1.35,.36,.16,1.07,1.62,M.dark);
  box('tv glass',3.42,1.35,.36,.045,.89,1.44,M.slate);
  box('tv stand',3.67,.80,.37,.35,.12,.28,M.black);

  // Shower corner: soft mint tiles and a simple visible frame.
  box('shower platform',-3.67,.12,2.50,1.85,.22,1.88,M.white);
  box('shower back',-4.72,1.48,2.55,.13,2.68,1.92,M.blue);
  box('shower bar',-2.72,1.31,3.38,.08,2.5,.08,M.slate);
  box('shower rim',-3.66,2.53,3.40,1.86,.08,.09,M.slate);
  box('shower curtain',-3.67,1.60,3.40,1.70,1.61,.055,M.glass);
  cylinder('shower head',-4.41,2.27,2.19,.46,.09,.46,M.slate);
  cylinder('shower pipe',-4.41,1.85,2.19,.065,.80,.065,M.slate);
  box('shower towel',-2.55,.89,3.69,.45,.7,.08,M.mint);

  // Potted plant, decorations and an oversized welcoming mat.
  cylinder('plant pot',4.19,.30,3.22,.58,.63,.58,M.rust);
  cylinder('plant stem',4.19,.78,3.22,.10,.70,.10,M.darkGreen);
  ball('leaf crown',4.20,1.27,3.2,1.02,.94,.91,M.leaf);
  ball('plant leaf',3.93,1.10,3.08,.62,.63,.6,M.leaf2);
  ball('plant leaf',4.45,1.38,3.42,.65,.74,.51,M.green);
  box('entry mat',-.65,.042,3.45,1.45,.012,.60,M.mint);

  // Character: small joint pivots allow walking, sitting and reaching without external assets.
  const avatar = new pc.Entity('Alex'); app.root.addChild(avatar);
  const torso = box('torso',0,.91,0,.47,.60,.32,M.shirt,avatar);
  ball('head',0,1.48,0,.46,.48,.42,M.skin,avatar);
  ball('hair cap',0,1.67,-.045,.47,.22,.46,M.hair,avatar);
  ball('hair fringe',.05,1.61,.11,.43,.16,.24,M.hair,avatar);
  const leftEye=ball('eye left',-.115,1.50,.20,.05,.055,.04,M.black,avatar);
  const rightEye=ball('eye right',.115,1.50,.20,.05,.055,.04,M.black,avatar);
  const legPivot = [], armPivot = [];
  for(const [side, x] of [['left',-.15], ['right',.15]]) {
    const pivot=new pc.Entity(side+' hip');avatar.addChild(pivot);pivot.setLocalPosition(x,.72,0);
    box(side+' leg',0,-.29,0,.16,.50,.19,M.trousers,pivot);
    box(side+' shoe',0,-.605,.08,.19,.15,.33,M.black,pivot);
    legPivot.push(pivot);
  }
  for(const [side, x] of [['left',-.33],['right',.33]]) {
    const pivot=new pc.Entity(side+' shoulder'); avatar.addChild(pivot);pivot.setLocalPosition(x,1.17,0);
    box(side+' arm',0,-.25,0,.15,.50,.18,M.skin,pivot);
    armPivot.push(pivot);
  }
  const snack = ball('apple',0,-.51,.12,.20,.17,.20,M.yellow,armPivot[1]);
  const book = box('book',0,-.51,.12,.28,.065,.29,M.green,armPivot[1]);
  snack.enabled=false;book.enabled=false;
  const showerDrops = Array.from({length:9},(_,i)=>{
    const drop=ball('water drop '+i,-4.47+i*.14,2.02,2.20+(i%3)*.12,.058,.10,.06,M.blue);
    drop.enabled=false;return drop;
  });
  const ACTOR_POSES = {
    bed:    {x:-2.62,y:.81,z:-.64,pitch:-85,yaw:0},
    sofa:   {x:1.35,y:.59,z:1.55,pitch:0,yaw:180},
    shower: {x:-3.68,y:.18,z:2.44,pitch:0,yaw:0},
    fridge: {x:3.48,y:0,z:-1.76,pitch:0,yaw:180}
  };
  if(game.action?.phase==='using') {
    const [x,z]=ACTIONS[game.action.id].location;
    game.position={x,z}; // old v0.1 saves used different stand positions
  }
  game.position=nearestWalkable(game.position);
  const display={x:game.position.x,y:0,z:game.position.z,yaw:0,pitch:0};
  let facing=0, gait=0, effectTime=0, fridgeOpen=0;
  let route=null, routeIndex=0, routeId=null;
  const destination=id=>({x:ACTIONS[id].location[0],z:ACTIONS[id].location[1]});
  function buildRoute(id) {
    const points=findPath(game.position,destination(id));
    if(!points) return false;
    route=points;routeId=id;routeIndex=0;
    return true;
  }
  beginAction=(id,automatic=false)=>{
    if(!ACTIONS[id])return false;
    if(!buildRoute(id)){
      if(!automatic) toast('Алекс не может добраться до предмета');
      else game.autonomy.nextAt=game.minutes+15;
      return false;
    }
    return chooseAction(game,id,automatic);
  };
  resetRuntime=()=>{
    route=null;routeId=null;routeIndex=0;facing=0;gait=0;fridgeOpen=0;
    display.x=game.position.x;display.z=game.position.z;display.y=0;display.yaw=0;display.pitch=0;
  };
  avatar.setPosition(display.x,display.y,display.z);

  // Lighting and orbital camera.
  const sun = new pc.Entity('Sun'); sun.addComponent('light',{
    type:'directional', intensity:1.4, color:new pc.Color(1,0.94,0.84), castShadows:false
  }); sun.setEulerAngles(50,-40,0); app.root.addChild(sun);
  const fill = new pc.Entity('Fill'); fill.addComponent('light',{
    type:'directional', intensity:0.6, color:new pc.Color(0.76,0.87,1), castShadows:false
  }); fill.setEulerAngles(15,160,0); app.root.addChild(fill);
  const camera = new pc.Entity('Camera');
  camera.addComponent('camera',{ clearColor:new pc.Color(0.85,0.91,0.86), fov:41, nearClip:.1, farClip:120 });
  app.root.addChild(camera);
  const view = { yaw: 42, pitch: 47, distance: 16.9, center: new pc.Vec3(0,0.62,0) };
  function cameraUpdate() {
    const y = view.yaw * Math.PI/180, p = view.pitch * Math.PI/180;
    camera.setPosition(view.center.x + Math.sin(y)*Math.cos(p)*view.distance,
      view.center.y + Math.sin(p)*view.distance,
      view.center.z + Math.cos(y)*Math.cos(p)*view.distance);
    camera.lookAt(view.center);
  }
  cameraUpdate();
  $('reset-camera-btn').addEventListener('click',()=>{view.yaw=42;view.pitch=47;view.distance=16.9;cameraUpdate();toast('Камера возвращена');});

  // Direct pointer gestures work in Safari and desktop browsers.
  const fingers = new Map();
  let startPoint = null, lastPinch = null;
  const pinchDistance = () => {
    const a=[...fingers.values()];return a.length<2?0:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
  };
  canvas.addEventListener('pointerdown',event=>{
    canvas.setPointerCapture?.(event.pointerId);
    fingers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(fingers.size===1) startPoint={x:event.clientX,y:event.clientY,t:performance.now(),travel:0};
    else {startPoint=null;lastPinch=pinchDistance();}
  });
  canvas.addEventListener('pointermove',event=>{
    if(!fingers.has(event.pointerId)) return;
    const prev=fingers.get(event.pointerId);
    fingers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(fingers.size===1){
      const dx=event.clientX-prev.x,dy=event.clientY-prev.y;
      view.yaw-=dx*.26;view.pitch=Math.max(24,Math.min(68,view.pitch+dy*.19));
      if(startPoint)startPoint.travel+=Math.hypot(dx,dy);
      cameraUpdate();
    } else if(fingers.size===2){
      const d=pinchDistance(); if(lastPinch)view.distance=Math.max(11.0,Math.min(24.0,view.distance*lastPinch/d));
      lastPinch=d;cameraUpdate();
    }
  });
  const endPointer=event=>{
    const click=startPoint && fingers.size===1 && startPoint.travel<10 && performance.now()-startPoint.t<360;
    const pos={x:event.clientX,y:event.clientY};fingers.delete(event.pointerId);
    if(fingers.size===0){lastPinch=null;startPoint=null;}
    if(click){
      let best=null,bestDist=65;
      for(const [id,btn] of Object.entries(markers)){
        if(btn.hidden)continue;
        const rect=btn.getBoundingClientRect();
        const dx=rect.left+rect.width/2-pos.x,dy=rect.top+rect.height/2-pos.y;
        const dist=Math.hypot(dx,dy);if(dist<bestDist){bestDist=dist;best=id;}
      }
      if(best)select(best);else select(null);
    }
  };
  canvas.addEventListener('pointerup',endPointer);
  canvas.addEventListener('pointercancel',event=>{fingers.delete(event.pointerId);startPoint=null;lastPinch=null;});
  canvas.addEventListener('wheel',event=>{event.preventDefault();view.distance=Math.max(11,Math.min(24,view.distance+event.deltaY*.012));cameraUpdate();},{passive:false});
  canvas.addEventListener('contextmenu',event=>event.preventDefault());

  let accumulator=0, uiTimer=0, autosaveTime=0, lastStatus='';
  const approach = (a,b,rate,dt) => a+(b-a)*(1-Math.exp(-rate*dt));
  const approachAngle=(a,b,rate,dt)=>a+((((b-a+540)%360)+360)%360-180)*(1-Math.exp(-rate*dt));
  app.on('update',dt=>{
    dt=Math.min(dt,.06);
    const active=!game.paused;
    const animDt=active?dt:0;
    if(active){
      accumulator+=dt;
      // Fixed timestep: simulation speed cannot depend on rendering FPS.
      while(accumulator>=.10){
        const previous=game.action?.id;
        tick(game,.30 * game.speed); // 1 real second = 3 game minutes at 1x.
        if(previous && !game.action) toast('Алекс закончил: '+ACTIONS[previous].label.toLowerCase());
        accumulator-=.10;
      }
      if(game.action?.phase==='walking'){
        if(routeId!==game.action.id || !route) {
          if(!buildRoute(game.action.id)) {game.action=null;game.event='Путь недоступен';}
        }
        if(route && game.action?.phase==='walking') {
          let remaining=dt*1.65*game.speed, hops=0;
          while(remaining>0 && routeIndex<route.length && hops++<12) {
            const next=route[routeIndex];
            const dx=next.x-game.position.x,dz=next.z-game.position.z;
            const dist=Math.hypot(dx,dz);
            if(dist<.0001){routeIndex++;continue;}
            facing=Math.atan2(dx,dz)*180/Math.PI;
            const step=Math.min(dist,remaining);
            game.position.x+=dx/dist*step;game.position.z+=dz/dist*step;
            remaining-=step;
            gait+=step*7.2;
            if(dist-step<.0001){game.position.x=next.x;game.position.z=next.z;routeIndex++;}
          }
          if(routeIndex>=route.length){
            const goal=destination(game.action.id);
            game.position={x:goal.x,z:goal.z};
            arrive(game);route=null;routeId=null;routeIndex=0;
          }
        }
      }
      if(!game.action){
        const idea=autonomousChoice(game);
        if(idea && beginAction(idea,true))toast('Алекс сам решил: '+ACTIONS[idea].label.toLowerCase());
      }
    }
    const using=game.action?.phase==='using', useId=using?game.action.id:null;
    const walking=active && game.action?.phase==='walking';
    const pose=useId?ACTOR_POSES[useId]:null;
    const desired={
      x:pose?pose.x:game.position.x,
      y:pose?pose.y:(walking?Math.abs(Math.sin(gait))*.045:0),
      z:pose?pose.z:game.position.z,
      pitch:pose?pose.pitch:0,
      yaw:pose?pose.yaw:facing
    };
    display.x=approach(display.x,desired.x,pose?3.4:11,animDt);
    display.y=approach(display.y,desired.y,pose?3.4:10,animDt);
    display.z=approach(display.z,desired.z,pose?3.4:11,animDt);
    display.pitch=approach(display.pitch,desired.pitch,3.8,animDt);
    display.yaw=approachAngle(display.yaw,desired.yaw,10,animDt);
    avatar.setPosition(display.x,display.y,display.z);
    avatar.setEulerAngles(display.pitch,display.yaw,0);
    const wave=active?Math.sin(gait):0;
    legPivot[0].setLocalEulerAngles(using && useId==='sofa'?67:walking?wave*25:0,0,0);
    legPivot[1].setLocalEulerAngles(using && useId==='sofa'?67:walking?-wave*25:0,0,0);
    armPivot[0].setLocalEulerAngles(using && useId==='shower'?35+Math.sin(effectTime*5)*16:using && useId==='sofa'?26:walking?-wave*18:0,0,0);
    armPivot[1].setLocalEulerAngles(using && useId==='fridge'?-54+Math.sin(effectTime*4)*11:using && useId==='shower'?35-Math.sin(effectTime*5)*15:using && useId==='sofa'?35:walking?wave*18:0,0,0);
    if(active) effectTime+=dt*game.speed;
    torso.setLocalEulerAngles(0,0,using && useId!=='bed'?Math.sin(effectTime*2)*1.4:0);
    const sleepy=using && useId==='bed';
    leftEye.enabled=!sleepy;rightEye.enabled=!sleepy;
    snack.enabled=using && useId==='fridge';book.enabled=using && useId==='sofa';
    fridgeOpen=approach(fridgeOpen,using && useId==='fridge'?1:0,4,animDt);
    fridgeHinge.setEulerAngles(0,-64*fridgeOpen,0);
    for(let i=0;i<showerDrops.length;i++){
      const drop=showerDrops[i];
      drop.enabled=using && useId==='shower';
      if(drop.enabled){
        const t=(effectTime*.8+i*.17)%1;
        drop.setLocalPosition(-4.42+(i%5)*.15,2.25-t*1.9,2.17+Math.floor(i/5)*.15);
      }
    }
    uiTimer+=dt;autosaveTime+=dt;
    if(uiTimer>.14){
      uiTimer=0;
      const t=readableTime(game.minutes);$('day-label').textContent=t.day;$('time-label').textContent=t.time;
      for(const need of NEEDS){
        const val=Math.round(game.needs[need]);
        $('bar-'+need).style.width=val+'%';
        $('bar-'+need).style.background=val<30?'#e2a074':val<55?'#e1c27d':'#80bda1';
        $('value-'+need).textContent=val;
      }
      $('mood-label').textContent=game.mind.mood.label;
      const wish=game.mind.wish && WISHES[game.mind.wish.id];
      $('wish-label').textContent=wish ? wish.symbol+' Хочет: '+wish.label : 'Думает о будущем';
      $('mind-mood-label').textContent=game.mind.mood.label+' · '+game.mind.mood.value+'/100';
      $('mind-mood-bar').style.width=game.mind.mood.value+'%';
      $('mind-wish-label').textContent=wish?.label || 'Присматривается к миру';
      $('wish-do-btn').disabled=!wish;
      if (!$('mind-panel').hidden) {
        const list=$('mind-memories');
        list.replaceChildren();
        const memories=game.mind.memories.slice(-4).reverse();
        for (const entry of memories) {
          const li=document.createElement('li');
          li.textContent=(entry.fulfilled?'★ ':'• ')+MEMORY_TEXT[entry.id]+' · '+readableTime(entry.at).day;
          list.appendChild(li);
        }
        if (!memories.length) {
          const li=document.createElement('li');li.textContent='Пока всё впереди';list.appendChild(li);
        }
      }
      $('pause-icon').textContent=game.paused?'▶':'Ⅱ';
      $('speed-btn').textContent=game.speed+'×';
      const status=game.paused?'Пауза':game.action?.phase==='walking'?'Идёт: '+ACTIONS[game.action.id].label.toLowerCase():game.action?.phase==='using'?ACTIONS[game.action.id].label+' · '+Math.min(100,Math.round(100*game.action.elapsed/ACTIONS[game.action.id].duration))+'%':game.event;
      if(status!==lastStatus){$('status-text').textContent=status;lastStatus=status;}
      // Visible buttons are separate DOM controls: no hit-testing dependency on physics.
      for(const [id,meta] of Object.entries(META)){
        const p=camera.camera.worldToScreen(new pc.Vec3(...meta.anchor));
        const x=p.x;
        const y=p.y; // PlayCanvas worldToScreen already returns CSS pixels.
        const el=markers[id];
        el.style.left=x+'px';el.style.top=y+'px';
        const pointInView = camera.camera.viewMatrix.transformPoint(new pc.Vec3(...meta.anchor));
        el.hidden=pointInView.z>=0 || x<25 || x>canvas.clientWidth-30 || y<85 || y>canvas.clientHeight-116;
      }
    }
    if(autosaveTime>8){autosaveTime=0;save(true);}
  });
  app.start();
  $('loading').hidden=true;
  if(!localStorage.getItem(SAVE_KEY))toast('Выбери любой предмет в комнате ✨');
}

try { boot(); }
catch(error) {
  console.error('LifeSim startup failed',error);
  $('loading').innerHTML = `<div class="loading-mark">!</div><strong>3D не запустился</strong><span>${String(error?.message || error).slice(0,170)}<br>Попробуй обновить страницу в Safari.</span>`;
}
