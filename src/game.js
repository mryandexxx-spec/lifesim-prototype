import * as pc from 'playcanvas';
import {createLoadingProgress} from './loading-progress.js';
import {registerModelCache} from './model-cache.js';
import {CAMERA_INITIAL,dragCamera,orbitCamera,pinchCamera,wheelCamera} from './camera-controls.js';
import { ACTIONS, NEEDS, SAVE_KEY, AUTONOMY_WAIT_SECONDS, newGame, loadGame, chooseAction, arrive, tick, autonomousChoice, setAutonomyEnabled, advanceAutonomyWait, readableTime } from './simulation.js';
import { findPath, nearestWalkable } from './navigation.js';
import { SOCIAL_ACTIONS, relationshipLabel, canStartSocial, startSocial,
  arriveSocial, cancelSocial, autonomousSocialChoice } from './relationships.js';
import { WISHES, MEMORY_TEXT } from './psychology.js';
import {getPerspective,latestSentiments} from './social-perspective.js';
import {visibleEmotions} from './emotion-engine.js';
import {traitLabels,interestLabels} from './trait-catalog.js';
import { createCharacterRig,applyShowerAppearance } from './characters.js';
import {createMeshyVisual} from './meshy-visual.js';
import {createSeatSurface,seatSlot} from './interaction-anchors.js';
import {createMiraMeshyVisual} from './meshy-mira-visual.js';
import {meshVisualPreference,MESHY_VISUAL_KEY,meshSeatRuntimeSettings} from './meshy-visual-policy.js';
import { createAnimationState,stepAnimation,applyCharacterAnimation } from './animations.js';
import {WALK_PHASE_PER_METER,advanceVisualGait} from './locomotion.js';
import {SOFA_LAYOUT,SOFA_POSE,SOFA_APPROACH} from './pose-config.js';
import {createSofaTransition,advanceSofaTransition,sofaTransitionPose} from './sofa-transition.js';
import {BED_SLOTS,BED_LAYOUT} from './bed-layout.js';
import {createBedTransition,advanceBedTransition,bedTransitionPose,bedBeddingPose} from './bed-transition.js';
import {FRIDGE_LAYOUT,FRIDGE_FACING_YAW,fridgeSequence,closeFridgeDoor} from './fridge-interaction.js';
import {SHOWER_LAYOUT,createShowerTransition,advanceShowerTransition} from './shower-interaction.js';
import {createPrivacyMosaicMaterial} from './privacy-mosaic.js';
import { HOUSEHOLD_IDS, RESIDENT_NAMES, newHousehold, loadHousehold, getActor, getActorName,
  selectResident, furnitureAvailable, chooseResidentAction, setHouseholdAutonomy, tickHousehold,
  residentAutonomousChoice,bedDestinationFor } from './household.js';

// A fully code-authored room: no PlayCanvas Editor or 3D asset pipeline required.
const $ = id => document.getElementById(id);
const canvas = $('game-canvas');
const loadingProgress=createLoadingProgress(['scene','alex','mira'],({completed,total,failed})=>{
  $('loading-count').textContent=completed+' / '+total;
  $('loading-bar').style.width=(completed/total*100)+'%';
  $('loading-status').textContent=failed
    ? 'Не все модели доступны — используем резервные облики'
    : completed===total?'Готово!':'Загружаем сцену и 3D-модели';
});
let game;
try { game = loadHousehold(JSON.parse(localStorage.getItem(SAVE_KEY) || 'null')); }
catch { game = newHousehold(); }
const selectedActor = () => getActor(game,game.selectedSim);
const selectedName = () => getActorName(game.selectedSim);
const visualQuery = new URLSearchParams(window.location.search).get('model') || '';
// The photographed 0.7c contact solver moved Alex outside the couch by
// treating a game-owned animated X/Z root as an independent world root.
// Default is guarded vertical-only contact. Full XYZ+IK is explicitly opt-in,
// not shipped as a user-facing default until it passes real-device QA.
const seatQuery = new URLSearchParams(window.location.search);
const seatSettings=meshSeatRuntimeSettings(
  seatQuery.get('seat'),seatQuery.get('ik'),seatQuery.get('legs'));
const seatMode=seatSettings.mode;
const seatContactEnabled=seatSettings.enabled;
const seatIKEnabled=seatSettings.footIK;
const seatFootPlantEnabled=seatSettings.footPlant;
let meshyPreferred = meshVisualPreference(null,visualQuery);
try { meshyPreferred=meshVisualPreference(localStorage.getItem(MESHY_VISUAL_KEY),visualQuery); }
catch { /* Safari private mode may reject storage; use the in-memory choice. */ }
function updateMeshModelButton(){
  const button=$('mesh-model-btn');
  button.setAttribute('aria-pressed',String(meshyPreferred));
  button.setAttribute('aria-label',meshyPreferred
    ? 'Алекс и Мира: 3D-модели Meshy. Нажмите, чтобы вернуть старые модели.'
    : 'Алекс и Мира: старые модели. Нажмите, чтобы включить 3D-модели Meshy.');
  $('mesh-model-state').textContent=meshyPreferred?'MESHY':'СТАРЫЙ';
}
$('mesh-model-btn').addEventListener('click',()=>{
  meshyPreferred=!meshyPreferred;
  try{localStorage.setItem(MESHY_VISUAL_KEY,meshyPreferred?'meshy':'legacy');}
  catch{/* This is only a visual preference and never blocks gameplay. */}
  updateMeshModelButton();
  toast(meshyPreferred?'3D-облики Алекса и Миры включены':'Оба жителя: прежние облики');
});
updateMeshModelButton();

const META = {
  bed: { title: 'Уютная кровать', category: 'Спальня', description: 'Сон восстанавливает энергию', icon: '☾', anchor: [-2.5, 1.22, -1.48] },
  fridge: { title: 'Холодильник', category: 'Кухня', description: 'Перекус восстанавливает сытость', icon: '◕', anchor: [3.42, 2.13, -2.79] },
  shower: { title: 'Душевая', category: 'Ванная', description: 'Душ повышает уровень гигиены', icon: '✧', anchor: [-3.65, 2.16, 2.45] },
  sofa: { title: 'Диван', category: 'Гостиная', description: 'Отдых повышает уровень досуга', icon: '♫', anchor: [1.35, 1.38, 1.54] }
};

let selected = null;
let beginAction = () => false;
let beginSocial = () => false;
let resetRuntime = () => {};
let restartAutonomyWait = () => {};
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
  const id = selectedActor().mind?.wish?.id;
  if (id && beginAction(id)) {
    closeMindPanel();
    toast(selectedName()+' исполняет желание: ' + WISHES[id].label.toLowerCase());
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
    toast(`${selectedName()}: ${ACTIONS[selected].label.toLowerCase()}`);
    select(null);
  }
});
for(const kind of Object.keys(SOCIAL_ACTIONS)){
  $(kind+'-btn').addEventListener('click',()=>{
    if(beginSocial(kind)) {
      select(null);closeMindPanel();
      toast(selectedName()+' хочет '+(kind==='talk'?'поговорить':'поспорить')+' с '+getActorName(game.selectedSim==='alex'?'mira':'alex'));
    }
  });
}
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
function updateAutoButton() {
  const enabled = game.autonomy.enabled;
  $('auto-btn').setAttribute('aria-pressed', String(enabled));
  $('auto-btn').setAttribute('aria-label', enabled
    ? 'Автономность включена. Нажмите, чтобы отключить'
    : 'Автономность выключена. Нажмите, чтобы включить');
  $('auto-state').textContent = enabled ? 'ВКЛ' : 'ВЫКЛ';
}
$('auto-btn').addEventListener('click', () => {
  const enabled = setHouseholdAutonomy(game, !game.autonomy.enabled);
  restartAutonomyWait();
  if (enabled) game.event = 'Свободное время';
  updateAutoButton();
  save(true);
  toast(enabled ? 'Автономность включена. Жители скоро решат, чем заняться.'
    : 'Автономность выключена. Оба жителя ждут твоих команд.');
});
updateAutoButton();
function updateResidentPicker() {
  for (const id of HOUSEHOLD_IDS) {
    $('pick-'+id).setAttribute('aria-pressed',String(game.selectedSim===id));
  }
  $('resident-name').textContent=selectedName();
  $('avatar-symbol').textContent=game.selectedSim==='alex' ? '☺' : '✿';
  $('mind-panel').setAttribute('aria-label','Внутренний мир: '+selectedName());
  $('mind-person').textContent=selectedName().toUpperCase()+' / ВНУТРЕННИЙ МИР';
  const personality=selectedActor().personality;
  $('mind-traits-label').textContent=traitLabels(personality).join(' · ')||'Характер не выбран';
  const likes=interestLabels(personality,'likes'),dislikes=interestLabels(personality,'dislikes');
  $('mind-preferences-label').textContent=
    (likes.length?'Любит: '+likes.join(', '):'')+
    (dislikes.length?' · Не любит: '+dislikes.join(', '):'');
}
for (const id of HOUSEHOLD_IDS) {
  $('pick-'+id).addEventListener('click',()=>{
    selectResident(game,id);
    select(null); closeMindPanel(); updateResidentPicker(); save(true);
    toast('Теперь управляешь: '+selectedName());
  });
}
updateResidentPicker();
$('save-btn').addEventListener('click', () => save());
$('reset-btn').addEventListener('click', () => {
  if (!window.confirm('Начать новую жизнь? Текущее сохранение будет заменено.')) return;
  const enabled = game.autonomy.enabled;
  game = newHousehold();
  setHouseholdAutonomy(game, enabled); // Keep the player's chosen play style.
  resetRuntime(); restartAutonomyWait(); updateAutoButton(); updateResidentPicker();
  save(true); select(null); closeMindPanel(); toast('Новая игра началась');
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
  box('bed frame',BED_LAYOUT.centerX,BED_LAYOUT.frameY,BED_LAYOUT.centerZ,
    2.42,BED_LAYOUT.frameHeight,2.52,M.wood);
  box('mattress',BED_LAYOUT.centerX,BED_LAYOUT.mattressY,BED_LAYOUT.centerZ,
    BED_LAYOUT.width,BED_LAYOUT.mattressHeight,BED_LAYOUT.depth,M.white);
  // Two separate quilts cover the two independent sleepers.
  const quilts={};
  for(const [slot,color] of [['left',M.mint],['right',M.peach]]){
    const bx=BED_SLOTS[slot].x;
    quilts[slot]={
      body:box('duvet '+slot,bx,.53,-.49,1.02,.15,.45,color),
      trim:box('duvet trim '+slot,bx,.62,-.69,.98,.025,.045,M.cream)
    };
  }
  box('bed headboard',-2.62,.82,-2.69,2.47,.95,.17,M.paleWood);
  box('pillow left',-3.15,.54,-2.18,.87,.19,.50,M.cream);
  box('pillow right',-2.10,.54,-2.18,.87,.19,.50,M.peach);
  box('side table',-4.23,.38,-3.35,.65,.64,.68,M.paleWood);
  cylinder('lamp base',-4.23,.76,-3.35,.22,.10,.22,M.white);
  cylinder('lamp stem',-4.23,.94,-3.35,.055,.32,.055,M.slate);
  cylinder('lamp shade',-4.23,1.17,-3.35,.45,.32,.45,M.yellow);

  // Kitchen zone with tall fridge, little counter and upper cupboards.
  box('fridge',3.43,.99,-2.85,1.12,1.98,1.14,M.cream);
  box('fridge shadow seam',3.43,1.49,-2.26,1.06,.035,.03,M.trim);
  box('fridge lower handle',3.01,.64,-2.20,.055,.27,.075,M.slate);
  // Shelf is in front of the fridge body but behind the closed door.
  box('fridge interior',3.43,1.46,-2.247,1.03,.85,.045,M.blue);
  box('fridge interior shelf',3.43,1.25,-2.18,1.02,.045,.11,M.cream);
  const fridgeFood=ball('fridge portion on shelf',3.24,1.38,-2.22,.20,.18,.20,M.yellow);
  fridgeFood.enabled=false;
  // A real right-side hinge opens away from the resident at left approach.
  const fridgeHinge = new pc.Entity('Fridge door hinge'); app.root.addChild(fridgeHinge);
  fridgeHinge.setPosition(FRIDGE_LAYOUT.hinge.x,FRIDGE_LAYOUT.hinge.y,FRIDGE_LAYOUT.hinge.z);
  box('fridge upper door',-.55,0,.055,FRIDGE_LAYOUT.doorWidth,.91,.08,M.cream,fridgeHinge);
  box('door handle',-.94,.07,.13,.05,.31,.055,M.slate,fridgeHinge);
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
  // Seat height and actor pose share the same dimensions.
  box('sofa seat',SOFA_LAYOUT.x,SOFA_LAYOUT.seatCenterY,SOFA_LAYOUT.z,
    SOFA_LAYOUT.seatWidth,SOFA_LAYOUT.seatHeight,SOFA_LAYOUT.seatDepth,M.peach);
  box('sofa back',SOFA_LAYOUT.x,SOFA_LAYOUT.backCenterY,SOFA_LAYOUT.backZ,
    2.52,SOFA_LAYOUT.backHeight,.29,M.rust);
  box('sofa arm left',.11,SOFA_LAYOUT.armCenterY,SOFA_LAYOUT.z,
    .30,SOFA_LAYOUT.armHeight,1.21,M.rust);
  box('sofa arm right',2.58,SOFA_LAYOUT.armCenterY,SOFA_LAYOUT.z,
    .30,SOFA_LAYOUT.armHeight,1.21,M.rust);
  box('sofa pillow left',.72,SOFA_LAYOUT.pillowCenterY,SOFA_LAYOUT.pillowZ,
    .63,SOFA_LAYOUT.pillowHeight,.23,M.cream);
  box('sofa pillow right',1.99,SOFA_LAYOUT.pillowCenterY,SOFA_LAYOUT.pillowZ,
    .63,SOFA_LAYOUT.pillowHeight,.23,M.mint);
  // Leave a navigable front approach so residents do not cross the sofa arm.
  box('coffee table top',1.34,.40,-.26,1.47,.12,.73,M.paleWood);
  for(let x of [.74,1.94]) for(let z of [-.53,.01])
    cylinder('table leg',x,.20,z,.085,.33,.085,M.wood);
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
  // 0.6e.1: a lightweight original floating pixel mosaic, NOT a solid box.
  // One opaque texture is shared by 3 curved shell primitives (3 draw calls).
  // The full character rig is still hidden while privacy is active; this is
  // visual decoration, never a translucent renderer or a simulated censor.
  const showerPrivacy=new pc.Entity('Floating mosaic shower privacy');
  app.root.addChild(showerPrivacy);
  showerPrivacy.setPosition(SHOWER_LAYOUT.interior.x,0,SHOWER_LAYOUT.interior.z);
  const mosaicMaterial=createPrivacyMosaicMaterial(pc,app.graphicsDevice);
  const veilWidth=SHOWER_LAYOUT.privacyWidth*.89;
  const veilDepth=SHOWER_LAYOUT.privacyDepth*.89;
  cylinder('shower mosaic cloud',0,1.25,0,veilWidth,1.95,veilDepth,
    mosaicMaterial,showerPrivacy);
  ball('shower mosaic top',0,2.23,0,veilWidth,.32,veilDepth,
    mosaicMaterial,showerPrivacy);
  ball('shower mosaic base',0,.27,0,veilWidth,.30,veilDepth,
    mosaicMaterial,showerPrivacy);
  showerPrivacy.enabled=false;

  // Potted plant, decorations and an oversized welcoming mat.
  cylinder('plant pot',4.19,.30,3.22,.58,.63,.58,M.rust);
  cylinder('plant stem',4.19,.78,3.22,.10,.70,.10,M.darkGreen);
  ball('leaf crown',4.20,1.27,3.2,1.02,.94,.91,M.leaf);
  ball('plant leaf',3.93,1.10,3.08,.62,.63,.6,M.leaf2);
  ball('plant leaf',4.45,1.38,3.42,.65,.74,.51,M.green);
  box('entry mat',-.65,.042,3.45,1.45,.012,.60,M.mint);

  // Original reusable 0.5a rigs. Keep all existing motion/interaction pivot references.
  const rigContext={pc,root:app.root,ball,box,cylinder,mat,materials:M};
  // Furniture publishes its own physical seat dimensions/placement.
  // Future armchairs and couch variants register the same metadata and
  // reuse this controller: no per-sofa adjustments of the avatar's Y.
  const livingSofaSurface=createSeatSurface({
    id:'living-sofa',origin:{x:SOFA_LAYOUT.x,y:0,z:SOFA_LAYOUT.z},
    yaw:SOFA_POSE.yaw,width:SOFA_LAYOUT.seatWidth,depth:SOFA_LAYOUT.seatDepth,
    seatHeight:SOFA_LAYOUT.seatCenterY+SOFA_LAYOUT.seatHeight/2,
    floorY:0,slots:1,sideMargin:.35,backClearance:.10,approachGap:.50
  });
  const livingSofaSeat=seatSlot(livingSofaSurface,0);
  const alexRig=createCharacterRig(rigContext,'alex');
  const miraRig=createCharacterRig(rigContext,'mira');
  // Visual-only experimental Alex skin. The procedural rig and every action
  // controller remain authoritative; any GLB error falls back immediately.
  const meshyAlex=createMeshyVisual({pc,app,rig:alexRig,
    footIK:seatIKEnabled,footPlant:seatFootPlantEnabled,onStatus:(status,error)=>{
    if(status==='ready'||status==='error')loadingProgress.finish('alex',status==='ready');
    if(error)console.warn('Meshy visual unavailable',error);
  }});
  const meshyMira=createMiraMeshyVisual({pc,app,rig:miraRig,onStatus:(status,error)=>{
    if(status==='ready'||status==='error')loadingProgress.finish('mira',status==='ready');
    if(error)console.warn('Meshy Mira visual unavailable',error);
  }});
  const animationStates={alex:createAnimationState(),mira:createAnimationState()};
  const sofaStates={alex:createSofaTransition(),mira:createSofaTransition()};
  const bedStates={alex:createBedTransition(),mira:createBedTransition()};
  const showerStates={alex:createShowerTransition(),mira:createShowerTransition()};
  const {avatar,torso,leftEye,rightEye,legPivot,armPivot,snack,book,selected:alexSelected}=alexRig;
  const {avatar:miraAvatar,torso:miraTorso,leftEye:miraLeftEye,rightEye:miraRightEye,
    legPivot:miraLegPivot,armPivot:miraArmPivot,snack:miraSnack,book:miraBook,
    selected:miraSelected}=miraRig;
  const showerDrops = Array.from({length:9},(_,i)=>{
    const drop=ball('water drop '+i,-4.47+i*.14,2.02,2.20+(i%3)*.12,.058,.10,.06,M.blue);
    drop.enabled=false;return drop;
  });
  const ACTOR_POSES = {
    sofa:   SOFA_POSE,
    fridge: {x:FRIDGE_LAYOUT.approach.x,y:0,z:FRIDGE_LAYOUT.approach.z,pitch:0,yaw:FRIDGE_FACING_YAW}
  };
  if(game.action?.phase==='using') {
    const dest=game.action.id==='bed'?bedDestinationFor(game,'alex'):null;
    const [x,z]=dest?[dest.x,dest.z]:ACTIONS[game.action.id].location;
    game.position={x,z}; // old v0.1 saves used different stand positions
  }
  game.position=nearestWalkable(game.position);
  if(game.otherSim.action?.phase==='using') {
    const dest=game.otherSim.action.id==='bed'?bedDestinationFor(game,'mira'):null;
    const [x,z]=dest?[dest.x,dest.z]:ACTIONS[game.otherSim.action.id].location;
    game.otherSim.position={x,z};
  }
  game.otherSim.position=nearestWalkable(game.otherSim.position);
  const display={x:game.position.x,y:0,z:game.position.z,yaw:0,pitch:0,roll:0};
  const miraDisplay={x:game.otherSim.position.x,y:0,z:game.otherSim.position.z,yaw:0,pitch:0,roll:0};
  let facing=0,gait=0,miraFacing=0,miraGait=0,effectTime=0,fridgeOpen=0;
  const fridgeLeaving={alex:false,mira:false};
  const fridgeWasUsing={
    alex:game.action?.id==='fridge'&&game.action.phase==='using',
    mira:game.otherSim.action?.id==='fridge'&&game.otherSim.action.phase==='using'
  };
  const paths={
    alex:{points:null,index:0,id:null},
    mira:{points:null,index:0,id:null}
  };
  const autonomyWaitSeconds={alex:0,mira:0};
  restartAutonomyWait=(id=null)=>{
    if (id) autonomyWaitSeconds[id]=0;
    else for(const key of HOUSEHOLD_IDS) autonomyWaitSeconds[key]=0;
  };
  const destination=(id,residentId='alex')=>id==='bed'
    ?bedDestinationFor(game,residentId)
    :{x:ACTIONS[id].location[0],z:ACTIONS[id].location[1]};
  function buildRoute(id,actorId='alex') {
    const actor=getActor(game,actorId);
    const goal=destination(id,actorId);
    const points=goal&&findPath(actor.position,goal);
    if(!points) return false;
    paths[actorId]={points,index:0,id};
    return true;
  }
  beginAction=(id,automatic=false,actorId=game.selectedSim)=>{
    const actor=getActor(game,actorId);
    if(!ACTIONS[id] || (automatic && !game.autonomy.enabled))return false;
    // Releasing the headless shower action does not immediately clear the
    // physical cubicle: the prior user must finish dressing and exiting first.
    if(id==='shower'&&HOUSEHOLD_IDS.some(other=>other!==actorId&&showerStates[other].active)){
      if(!automatic)toast('Душевая пока занята: житель выходит');
      return false;
    }
    if(!furnitureAvailable(game,id,actorId)){
      if(!automatic)toast('Предмет сейчас занят другим жителем');
      return false;
    }
    if(!buildRoute(id,actorId)){
      if(!automatic) toast(getActorName(actorId)+' не может добраться до предмета');
      else actor.autonomy.nextAt=game.minutes+15;
      return false;
    }
    const started=chooseResidentAction(game,id,automatic,actorId);
    if(started)restartAutonomyWait(actorId);
    return started;
  };

  // Meet beside the other resident at a walkable, reachable point.
  beginSocial=(kind,automatic=false,actorId=game.selectedSim)=>{
    if(!canStartSocial(game,kind,actorId,automatic)){
      if(!automatic)toast('Собеседник занят или разговор уже идёт');
      return false;
    }
    const self=getActor(game,actorId), partner=getActor(game,actorId==='alex'?'mira':'alex');
    const offsets=[[.84,0],[-.84,0],[0,.84],[0,-.84],[.62,.62],[-.62,.62],[.62,-.62],[-.62,-.62]];
    let best=null,bestLength=Infinity;
    for(const [dx,dz] of offsets){
      const goal={x:partner.position.x+dx,z:partner.position.z+dz};
      const points=findPath(self.position,goal);
      if(!points)continue;
      let previous=self.position,len=0;
      for(const point of points){len+=Math.hypot(point.x-previous.x,point.z-previous.z);previous=point;}
      if(len<bestLength){best={goal,points};bestLength=len;}
    }
    if(!best){if(!automatic)toast('Сейчас не получается подойти к собеседнику');return false;}
    if(!startSocial(game,kind,actorId,best.goal,automatic))return false;
    // A manual invitation interrupts the partner's task but never bypasses
    // its renderer exit transition (bed/sofa/shower/fridge). Drop obsolete A*.
    if(!automatic){
      const partnerId=actorId==='alex'?'mira':'alex';
      paths[partnerId]={points:null,index:0,id:null};
    }
    paths[actorId]={points:best.points,index:0,id:'social:'+kind};
    restartAutonomyWait();
    return true;
  };
  resetRuntime=()=>{
    for(const id of HOUSEHOLD_IDS)paths[id]={points:null,index:0,id:null};
    facing=0;gait=0;miraFacing=0;miraGait=0;fridgeOpen=0;
    for(const id of HOUSEHOLD_IDS){fridgeLeaving[id]=false;fridgeWasUsing[id]=false;}
    for(const id of HOUSEHOLD_IDS){
      sofaStates[id]=createSofaTransition();
      bedStates[id]=createBedTransition();
      showerStates[id]=createShowerTransition();
      animationStates[id]=createAnimationState();
      applyShowerAppearance(id==='alex'?alexRig:miraRig,false,false);
    }
    meshyAlex.reset();
    meshyMira.reset();
    game.position=nearestWalkable(game.position);
    game.otherSim.position=nearestWalkable(game.otherSim.position);
    Object.assign(display,{...game.position,y:0,yaw:0,pitch:0,roll:0});
    Object.assign(miraDisplay,{...game.otherSim.position,y:0,yaw:0,pitch:0,roll:0});
    showerPrivacy.enabled=false;
    for(const drop of showerDrops)drop.enabled=false;
  };
  avatar.setPosition(display.x,display.y,display.z);
  miraAvatar.setPosition(miraDisplay.x,miraDisplay.y,miraDisplay.z);

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
  const view={...CAMERA_INITIAL};
  const cameraTarget=new pc.Vec3(view.centerX,view.centerY,view.centerZ);
  function cameraUpdate(){
    const y=view.yaw*Math.PI/180,p=view.pitch*Math.PI/180;
    cameraTarget.set(view.centerX,view.centerY,view.centerZ);
    camera.setPosition(view.centerX+Math.sin(y)*Math.cos(p)*view.distance,
      view.centerY+Math.sin(p)*view.distance,
      view.centerZ+Math.cos(y)*Math.cos(p)*view.distance);
    camera.lookAt(cameraTarget);
  }
  function setView(next){Object.assign(view,next);cameraUpdate();}
  cameraUpdate();
  $('reset-camera-btn').addEventListener('click',()=>{
    setView(CAMERA_INITIAL);
    toast('Камера сброшена');
  });
  // Default one-finger pan is preserved. Tapping the visible rotate control
  // changes only the drag interpretation; it never changes the saved game.
  let dragMode='pan';
  const rotateButton=$('rotate-camera-btn');
  rotateButton.addEventListener('click',()=>{
    dragMode=dragMode==='pan'?'orbit':'pan';
    const rotating=dragMode==='orbit';
    rotateButton.setAttribute('aria-pressed',String(rotating));
    rotateButton.setAttribute('aria-label',rotating
      ?'Режим вращения включён. Нажмите для перемещения камеры'
      :'Включить вращение камеры одним пальцем');
    rotateButton.title=rotating?'Перемещать камеру':'Вращать камеру';
    $('hint').textContent=rotating?'Один палец — вращение · два — поворот/масштаб'
      :'Один палец — перемещение · два — поворот/масштаб';
    toast(rotating?'Вращение камеры: проведи одним пальцем'
      :'Перемещение камеры: проведи одним пальцем');
  });

  // 1 finger grabs/pans the room; 2 fingers orbit and pinch in mobile Safari.
  // A multi-touch gesture never accidentally becomes a tap on furniture.
  const fingers=new Map();
  let tapCandidate=null,lastPinch=null,lastMidpoint=null;
  const twoFingerMetrics=()=>{
    const points=[...fingers.values()];
    if(points.length!==2)return null;
    return {
      distance:Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y),
      x:(points[0].x+points[1].x)/2,
      y:(points[0].y+points[1].y)/2
    };
  };
  canvas.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse'&&event.button!==0)return;
    if(event.cancelable)event.preventDefault();
    try{canvas.setPointerCapture?.(event.pointerId);}catch{/* iOS capture may fail */}
    fingers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(fingers.size===1){
      tapCandidate={id:event.pointerId,t:performance.now(),travel:0};
      lastPinch=null;lastMidpoint=null;
    }else{
      tapCandidate=null;
      const metrics=twoFingerMetrics();
      lastPinch=metrics?.distance??null;lastMidpoint=metrics;
    }
  });
  // Window-level listeners continue a swipe even when iOS pointer capture
  // fails or a finger crosses a hotspot / the edge of the canvas.
  window.addEventListener('pointermove',event=>{
    if(!fingers.has(event.pointerId))return;
    if(event.cancelable)event.preventDefault();
    const prev=fingers.get(event.pointerId);
    fingers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(fingers.size===1){
      const dx=event.clientX-prev.x,dy=event.clientY-prev.y;
      if(tapCandidate)tapCandidate.travel+=Math.hypot(dx,dy);
      if(dx||dy)setView(dragCamera(view,dragMode,dx,dy,canvas.clientHeight));
    }else if(fingers.size===2){
      const metrics=twoFingerMetrics();
      if(metrics&&lastMidpoint){
        const dx=metrics.x-lastMidpoint.x,dy=metrics.y-lastMidpoint.y;
        let next=orbitCamera(view,dx,dy,2.0);
        if(lastPinch)next=pinchCamera(next,lastPinch,metrics.distance);
        setView(next);
      }
      lastPinch=metrics?.distance??null;lastMidpoint=metrics;
    }
  });
  const endPointer=event=>{
    if(!fingers.has(event.pointerId))return;
    const tap=tapCandidate&&tapCandidate.id===event.pointerId&&
      fingers.size===1&&tapCandidate.travel<10&&
      performance.now()-tapCandidate.t<360;
    const pos={x:event.clientX,y:event.clientY};
    fingers.delete(event.pointerId);
    tapCandidate=null;lastPinch=null;lastMidpoint=null;
    if(tap){
      let best=null,bestDist=65;
      for(const [id,btn] of Object.entries(markers)){
        if(btn.hidden)continue;
        const rect=btn.getBoundingClientRect();
        const dx=rect.left+rect.width/2-pos.x,dy=rect.top+rect.height/2-pos.y;
        const dist=Math.hypot(dx,dy);
        if(dist<bestDist){bestDist=dist;best=id;}
      }
      if(best)select(best);else select(null);
    }
  };
  window.addEventListener('pointerup',endPointer);
  window.addEventListener('pointercancel',event=>{
    fingers.delete(event.pointerId);
    tapCandidate=null;lastPinch=null;lastMidpoint=null;
  });
  canvas.addEventListener('wheel',event=>{
    event.preventDefault();
    setView(wheelCamera(view,event.deltaY));
  },{passive:false});
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
        const prevAlex=game.action?.id,prevMira=game.otherSim.action?.id;
        const socialBefore=game.socialAction?.kind;
        tickHousehold(game,.30 * game.speed); // Both share the clock; no double advancement.
        if(prevAlex && !game.action) toast('Алекс закончил: '+ACTIONS[prevAlex].label.toLowerCase());
        if(prevMira && !game.otherSim.action) toast('Мира закончила: '+ACTIONS[prevMira].label.toLowerCase());
        if(socialBefore && !game.socialAction)toast(socialBefore==='talk'?'Жители поговорили ♡':'Жители поспорили ⚡');
        accumulator-=.10;
      }
      // On cancellation, finish closing before the former fridge user departs.
      for(const residentId of HOUSEHOLD_IDS){
        const a=getActor(game,residentId);
        const stillUsing=a.action?.id==='fridge'&&a.action.phase==='using';
        if(fridgeWasUsing[residentId]&&!stillUsing&&fridgeOpen>.015)fridgeLeaving[residentId]=true;
        if(fridgeLeaving[residentId]&&fridgeOpen<=.015)fridgeLeaving[residentId]=false;
        fridgeWasUsing[residentId]=Boolean(stillUsing);
      }
      // Run two independent route followers with one shared room and item reservation.
      for(const residentId of HOUSEHOLD_IDS){
        const resident=getActor(game,residentId);
        // If another command arrives during a sit, stand up completely first.
        if(sofaStates[residentId].progress>0||bedStates[residentId].progress>0||
          showerStates[residentId].active||fridgeLeaving[residentId])continue;
        const socialWalking=game.socialAction?.phase==='walking' &&
          game.socialAction.initiator===residentId;
        const jobId=socialWalking?'social:'+game.socialAction.kind:
          resident.action?.phase==='walking'?resident.action.id:null;
        if(jobId){
          let p=paths[residentId];
          if(p.id!==jobId || !p.points){
            const available=socialWalking
              ? findPath(resident.position,game.socialAction.target)
              : (buildRoute(jobId,residentId)?paths[residentId].points:null);
            if(!available){
              if(socialWalking)cancelSocial(game);
              else {resident.action=null;resident.event='Путь недоступен';}
              paths[residentId]={points:null,index:0,id:null};
            } else if(socialWalking){
              paths[residentId]={points:available,index:0,id:jobId};
            }
            p=paths[residentId];
          }
          if(p.points && (socialWalking?game.socialAction?.phase==='walking':resident.action?.phase==='walking')){
            let remaining=dt*1.65*game.speed,hops=0;
            while(remaining>0 && p.index<p.points.length && hops++<12){
              const next=p.points[p.index];
              const dx=next.x-resident.position.x,dz=next.z-resident.position.z;
              const dist=Math.hypot(dx,dz);
              if(dist<.0001){p.index++;continue;}
              if(residentId==='alex')facing=Math.atan2(dx,dz)*180/Math.PI;
              else miraFacing=Math.atan2(dx,dz)*180/Math.PI;
              const step=Math.min(dist,remaining);
              resident.position.x+=dx/dist*step;resident.position.z+=dz/dist*step;
              remaining-=step;
              if(dist-step<.0001){resident.position.x=next.x;resident.position.z=next.z;p.index++;}
            }
            if(p.index>=p.points.length){
              resident.position=socialWalking?{...game.socialAction.target}:destination(jobId,residentId);
              if(socialWalking){
                const partnerId=residentId==='alex'?'mira':'alex';
                const partnerExiting=sofaStates[partnerId].progress>0||
                  bedStates[partnerId].progress>0||
                  showerStates[partnerId].active||
                  fridgeLeaving[partnerId];
                if(partnerExiting){
                  // Do not start conversation while partner is still
                  // physically standing up / exiting shower / closing door.
                  paths[residentId]={points:[{...game.socialAction.target}],
                    index:0,id:jobId};
                  continue;
                }
                arriveSocial(game);
              }else arrive(resident);
              paths[residentId]={points:null,index:0,id:null};
            }
          }
        }
      }
      // Real active-time wait is independent for each sim and unaffected by game speed.
      for(const residentId of HOUSEHOLD_IDS){
        const resident=getActor(game,residentId);
        if(game.socialAction){autonomyWaitSeconds[residentId]=0;continue;}
        autonomyWaitSeconds[residentId]=advanceAutonomyWait(autonomyWaitSeconds[residentId],dt,resident);
        if(!resident.action && autonomyWaitSeconds[residentId]>=AUTONOMY_WAIT_SECONDS){
          const socialIdea=autonomousSocialChoice(game,residentId);
          if(socialIdea && beginSocial(socialIdea,true,residentId)){
            toast(getActorName(residentId)+' захотел(а) поговорить');
            continue;
          }
          const idea=residentAutonomousChoice(game,residentId);
          if(idea && beginAction(idea,true,residentId))
            toast(getActorName(residentId)+' самостоятельно решил(а): '+ACTIONS[idea].label.toLowerCase());
        }
      }
    }
    const socialUsing=game.socialAction?.phase==='using';
    const using=game.action?.phase==='using', useId=using?game.action.id:null;
    const alexFridge=useId==='fridge'?fridgeSequence(game.action.elapsed,ACTIONS.fridge.duration):null;
    showerStates.alex=advanceShowerTransition(showerStates.alex,useId==='shower',
      game.action?.elapsed||0,ACTIONS.shower.duration,animDt,display.yaw);
    const alexShower=showerStates.alex.frame;
    const walking=active&&(game.action?.phase==='walking'||
      (game.socialAction?.phase==='walking'&&game.socialAction.initiator==='alex'));
    sofaStates.alex=advanceSofaTransition(sofaStates.alex,
      useId==='sofa'&&bedStates.alex.progress===0&&!showerStates.alex.active,animDt);
    const seatPose=sofaTransitionPose(sofaStates.alex);
    const seating=useId==='sofa'||sofaStates.alex.progress>0;
    bedStates.alex=advanceBedTransition(bedStates.alex,
      useId==='bed'&&sofaStates.alex.progress===0&&!showerStates.alex.active,
      game.action?.bedSlot,animDt,{...display});
    const bedPose=bedTransitionPose(bedStates.alex);
    const bedding=Boolean(bedPose);
    const pose=useId&&useId!=='sofa'&&useId!=='bed'&&useId!=='shower'?ACTOR_POSES[useId]:null;
    const previousAlexXZ={x:display.x,z:display.z};
    const desired=alexShower?alexShower.pose:bedding?bedPose:seating?seatPose:{
      x:pose?pose.x:game.position.x,
      y:pose?pose.y:animationStates.alex.walkBob,
      z:pose?pose.z:game.position.z,
      pitch:pose?pose.pitch:0,
      yaw:pose?pose.yaw:socialUsing
        ? Math.atan2(game.otherSim.position.x-game.position.x,
          game.otherSim.position.z-game.position.z)*180/Math.PI:facing
    };
    if(alexShower){
      Object.assign(display,alexShower.pose);facing=alexShower.pose.yaw;
    }else if(bedding){
      Object.assign(display,bedPose);facing=bedPose.yaw;
    }else{
      display.x=approach(display.x,desired.x,seating||pose?10:11,animDt);
      display.y=approach(display.y,desired.y,seating||pose?10:10,animDt);
      display.z=approach(display.z,desired.z,seating||pose?10:11,animDt);
      display.pitch=approach(display.pitch,desired.pitch,3.8,animDt);
      display.yaw=approachAngle(display.yaw,desired.yaw,10,animDt);
      display.roll=approach(display.roll,0,12,animDt);
    }
    // Drive the stride from the ACTUAL onscreen movement, after x/z easing.
    // At tight A* bends the visible motion direction leads the character;
    // neither turning the camera nor a pause advances the gait clock.
    const alexMotion=advanceVisualGait(gait,previousAlexXZ,display,
      walking&&!seating&&!bedding&&!pose&&!alexShower);
    gait=alexMotion.phase;
    if(alexMotion.heading!==null)
      display.yaw=approachAngle(display.yaw,alexMotion.heading,13,animDt);
    avatar.setPosition(display.x,display.y,display.z);
    avatar.setEulerAngles(display.pitch,display.yaw,display.roll);
    if(active)effectTime+=dt*game.speed;
    animationStates.alex=stepAnimation(animationStates.alex,{
      id:'alex',walking:(walking||Boolean(alexShower?.stepWeight>.015))&&!seating&&!bedding,
      using:alexShower?'shower':useId,
      showerStep:alexShower?.stepWeight||0,showerWater:Boolean(alexShower?.water),
      showerExiting:Boolean(alexShower&&useId!=='shower'),
      sofaWeight:seatPose.sofaWeight,
      bedStepWeight:bedPose?.bedStepWeight||0,
      bedSitWeight:bedPose?.bedSitWeight||0,
      bedReclineWeight:bedPose?.bedReclineWeight||0,
      bedSwingWeight:bedPose?.bedSwingWeight||0,
      bedSide:bedPose?.bedSide||null,bedJoints:bedPose?.bedJoints,bedFootYaw:bedPose?.bedFootYaw,
      social:socialUsing?game.socialAction.kind:null,
      fridgeReach:alexFridge?.reach||0,fridgeEat:alexFridge?.eat||0,
      fridgeChew:alexFridge?.chew||0,
      gait:alexShower?alexShower.gaitMeters*WALK_PHASE_PER_METER:gait,
      mood:game.mind?.mood?.value,energy:game.needs.energy
    },animDt);
    // Contact gait is phase-accurate only when the root dip is applied in
    // the SAME frame as its ankle joints; the old display spring lagged one.
    // Never override the directly controlled bed/sofa/shower interaction root.
    if(!alexShower&&!bedding&&!seating&&!pose&&!socialUsing){
      display.y=animationStates.alex.walkBob;
      avatar.setPosition(display.x,display.y,display.z);
    }
    applyCharacterAnimation(alexRig,animationStates.alex);
    applyShowerAppearance(alexRig,Boolean(alexShower?.privacy),Boolean(alexShower?.bathing));
    snack.enabled=Boolean(alexFridge&&alexFridge.handFood>.012);
    if(snack.enabled)snack.setLocalScale(.20*alexFridge.handFood,.17*alexFridge.handFood,.20*alexFridge.handFood);
    book.enabled=using&&useId==='sofa';
    // Mira uses the same pose definitions, but maintains her own position and gait.
    const miraUsing=game.otherSim.action?.phase==='using';
    const miraUseId=miraUsing?game.otherSim.action.id:null;
    const miraFridge=miraUseId==='fridge'?fridgeSequence(game.otherSim.action.elapsed,ACTIONS.fridge.duration):null;
    showerStates.mira=advanceShowerTransition(showerStates.mira,miraUseId==='shower',
      game.otherSim.action?.elapsed||0,ACTIONS.shower.duration,animDt,miraDisplay.yaw);
    const miraShower=showerStates.mira.frame;
    const miraWalking=active&&(game.otherSim.action?.phase==='walking'||
      (game.socialAction?.phase==='walking'&&game.socialAction.initiator==='mira'));
    sofaStates.mira=advanceSofaTransition(sofaStates.mira,
      miraUseId==='sofa'&&bedStates.mira.progress===0&&!showerStates.mira.active,animDt);
    const miraSeatPose=sofaTransitionPose(sofaStates.mira);
    const miraSeating=miraUseId==='sofa'||sofaStates.mira.progress>0;
    bedStates.mira=advanceBedTransition(bedStates.mira,
      miraUseId==='bed'&&sofaStates.mira.progress===0&&!showerStates.mira.active,
      game.otherSim.action?.bedSlot,animDt,{...miraDisplay});
    const miraBedPose=bedTransitionPose(bedStates.mira);
    const miraBedding=Boolean(miraBedPose);
    const miraPose=miraUseId&&miraUseId!=='sofa'&&miraUseId!=='bed'&&miraUseId!=='shower'?ACTOR_POSES[miraUseId]:null;
    const previousMiraXZ={x:miraDisplay.x,z:miraDisplay.z};
    const miraDesired=miraShower?miraShower.pose:miraBedding?miraBedPose:miraSeating?miraSeatPose:{
      x:miraPose?miraPose.x:game.otherSim.position.x,
      y:miraPose?miraPose.y:animationStates.mira.walkBob,
      z:miraPose?miraPose.z:game.otherSim.position.z,
      pitch:miraPose?miraPose.pitch:0,
      yaw:miraPose?miraPose.yaw:socialUsing
        ? Math.atan2(game.position.x-game.otherSim.position.x,
          game.position.z-game.otherSim.position.z)*180/Math.PI:miraFacing
    };
    if(miraShower){
      Object.assign(miraDisplay,miraShower.pose);miraFacing=miraShower.pose.yaw;
    }else if(miraBedding){
      Object.assign(miraDisplay,miraBedPose);miraFacing=miraBedPose.yaw;
    }else{
      miraDisplay.x=approach(miraDisplay.x,miraDesired.x,miraSeating||miraPose?10:11,animDt);
      miraDisplay.y=approach(miraDisplay.y,miraDesired.y,miraSeating||miraPose?10:10,animDt);
      miraDisplay.z=approach(miraDisplay.z,miraDesired.z,miraSeating||miraPose?10:11,animDt);
      miraDisplay.pitch=approach(miraDisplay.pitch,miraDesired.pitch,3.8,animDt);
      miraDisplay.yaw=approachAngle(miraDisplay.yaw,miraDesired.yaw,10,animDt);
      miraDisplay.roll=approach(miraDisplay.roll,0,12,animDt);
    }
    const miraMotion=advanceVisualGait(miraGait,previousMiraXZ,miraDisplay,
      miraWalking&&!miraSeating&&!miraBedding&&!miraPose&&!miraShower);
    miraGait=miraMotion.phase;
    if(miraMotion.heading!==null)
      miraDisplay.yaw=approachAngle(miraDisplay.yaw,miraMotion.heading,13,animDt);
    miraAvatar.setPosition(miraDisplay.x,miraDisplay.y,miraDisplay.z);
    miraAvatar.setEulerAngles(miraDisplay.pitch,miraDisplay.yaw,miraDisplay.roll);
    animationStates.mira=stepAnimation(animationStates.mira,{
      id:'mira',walking:(miraWalking||Boolean(miraShower?.stepWeight>.015))&&!miraSeating&&!miraBedding,
      using:miraShower?'shower':miraUseId,
      showerStep:miraShower?.stepWeight||0,showerWater:Boolean(miraShower?.water),
      showerExiting:Boolean(miraShower&&miraUseId!=='shower'),
      sofaWeight:miraSeatPose.sofaWeight,
      bedStepWeight:miraBedPose?.bedStepWeight||0,
      bedSitWeight:miraBedPose?.bedSitWeight||0,
      bedReclineWeight:miraBedPose?.bedReclineWeight||0,
      bedSwingWeight:miraBedPose?.bedSwingWeight||0,
      bedSide:miraBedPose?.bedSide||null,bedJoints:miraBedPose?.bedJoints,bedFootYaw:miraBedPose?.bedFootYaw,
      social:socialUsing?game.socialAction.kind:null,
      fridgeReach:miraFridge?.reach||0,fridgeEat:miraFridge?.eat||0,
      fridgeChew:miraFridge?.chew||0,
      gait:miraShower?miraShower.gaitMeters*WALK_PHASE_PER_METER:miraGait,
      mood:game.otherSim.mind?.mood?.value,energy:game.otherSim.needs.energy
    },animDt);
    if(!miraShower&&!miraBedding&&!miraSeating&&!miraPose&&!socialUsing){
      miraDisplay.y=animationStates.mira.walkBob;
      miraAvatar.setPosition(miraDisplay.x,miraDisplay.y,miraDisplay.z);
    }
    applyCharacterAnimation(miraRig,animationStates.mira);
    applyShowerAppearance(miraRig,Boolean(miraShower?.privacy),Boolean(miraShower?.bathing));
    miraSnack.enabled=Boolean(miraFridge&&miraFridge.handFood>.012);
    if(miraSnack.enabled)miraSnack.setLocalScale(.20*miraFridge.handFood,.17*miraFridge.handFood,.20*miraFridge.handFood);
    miraBook.enabled=miraUsing&&miraUseId==='sofa';
    // Mira retains one 3D skin for sofa, bed, fridge and clothed shower
    // entry/exit. The original game owns shower water, cover, full avatar
    // privacy and all simulation/save state; no private body is visible.
    const miraMeshShown=meshyMira.update({
      preferred:meshyPreferred,paused:!active,dt:animDt,
      walking:(game.otherSim.action?.phase==='walking'||
        (game.socialAction?.phase==='walking'&&game.socialAction.initiator==='mira'))&&
        !miraSeating&&!miraBedding&&!miraShower,
      social:socialUsing?game.socialAction.kind:null,
      actionId:miraUseId,
      sofaBusy:sofaStates.mira.progress>0,
      sofaWeight:miraSeatPose.sofaWeight,
      bedBusy:bedStates.mira.progress>0,
      bedFrame:miraBedPose,
      bedProgress:bedStates.mira.progress,
      showerBusy:showerStates.mira.active,
      showerFrame:miraShower,
      fridgeBusy:fridgeLeaving.mira,
      fridgeFrame:miraFridge
    });
    // The procedural book belongs to a hidden elbow; never show it floating.
    if(miraMeshShown&&miraUseId==='sofa')miraBook.enabled=false;
    // The old snack is on the hidden procedural elbow, not the Meshy hand.
    if(miraMeshShown&&miraUseId==='fridge')miraSnack.enabled=false;
    // Alex stays on the same 3D rig for bed and fridge when their verified
    // skeleton controllers exist. The original simulation/root still owns
    // mattress placement, both bed slots, shower movement and opaque privacy.
    const meshyShown=meshyAlex.update({
      preferred:meshyPreferred,paused:!active,dt:animDt,
      // Preserve the Walking clip on pause: playback freezes but the
      // resident has not arrived at the destination.
      walking:(game.action?.phase==='walking'||
        (game.socialAction?.phase==='walking'&&game.socialAction.initiator==='alex'))&&
        !seating&&!bedding&&!alexShower,
      worldMinutes:game.minutes,
      mood:game.mind?.mood?.value,
      energy:game.needs.energy,
      social:socialUsing?game.socialAction.kind:null,
      socialInitiator:socialUsing&&game.socialAction.initiator==='alex',
      socialElapsed:socialUsing?game.socialAction.elapsed:null,
      actionId:useId,
      sofaBusy:sofaStates.alex.progress>0,
      sofaWeight:seatPose.sofaWeight,
      seat:seatContactEnabled?livingSofaSeat:null,
      seatMode,
      bedBusy:bedStates.alex.progress>0,
      bedFrame:bedPose,
      showerBusy:showerStates.alex.active,
      showerFrame:alexShower,
      fridgeBusy:fridgeLeaving.alex,
      fridgeFrame:alexFridge
    });
    // The old snack is attached to the hidden procedural elbow; use the
    // new Meshy hand-bone prop instead, never show both at once.
    if(meshyShown&&useId==='fridge')snack.enabled=false;
    // The existing procedural book is attached to the old right elbow.
    // Never let it float beside the Meshy hand until a real socket exists.
    if(meshyShown&&useId==='sofa')book.enabled=false;
    alexSelected.enabled=game.selectedSim==='alex' && !using;
    miraSelected.enabled=game.selectedSim==='mira' && !miraUsing;
    for(const slot of ['left','right']){
      const progress=Math.max(...Object.values(bedStates).map(s=>s.slot===slot?s.progress:0));
      const quilt=bedBeddingPose(progress),bx=BED_SLOTS[slot].x;
      quilts[slot].body.setPosition(bx,quilt.y,quilt.z);
      quilts[slot].body.setLocalScale(1.02,.15,quilt.depth);
      quilts[slot].trim.setPosition(bx,quilt.y+.09,quilt.trimZ);
    }
    const activeFridge=alexFridge||miraFridge;
    fridgeOpen=activeFridge?activeFridge.doorOpen:closeFridgeDoor(fridgeOpen,animDt);
    fridgeHinge.setEulerAngles(0,FRIDGE_LAYOUT.doorAngle*fridgeOpen,0);
    const shelfFood=activeFridge?.shelfFood||0;
    fridgeFood.enabled=shelfFood>.012;
    if(fridgeFood.enabled)fridgeFood.setLocalScale(.20*shelfFood,.18*shelfFood,.20*shelfFood);
    // The private resident is never rendered: the screen is opaque from ALL
    // viewpoints, even when camera is rotating during the shower.
    showerPrivacy.enabled=Boolean(alexShower?.privacy||miraShower?.privacy);
    const waterOn=Boolean(alexShower?.water||miraShower?.water);
    for(let i=0;i<showerDrops.length;i++){
      const drop=showerDrops[i];
      drop.enabled=waterOn;
      if(drop.enabled){
        const t=(effectTime*.8+i*.17)%1;
        drop.setLocalPosition(-4.28+(i%5)*.22,2.13-t*1.8,3.25+(i%2)*.035);
      }
    }
    uiTimer+=dt;autosaveTime+=dt;
    if(uiTimer>.14){
      uiTimer=0;
      const t=readableTime(game.minutes);$('day-label').textContent=t.day;$('time-label').textContent=t.time;
      const current=selectedActor();
      $('resident-name').textContent=selectedName();
      const relation=game.relationship;
      $('relationship-value').textContent=Math.round(relation.affinity)+'/100';
      $('relationship-label').textContent=relationshipLabel(relation.affinity);
      $('relationship-bar').style.width=relation.affinity+'%';
      $('social-partner').textContent=game.selectedSim==='alex'?'Мирой':'Алексом';
      // Affinity reaching 0 or 100 is only a meter clamp. Player-requested
      // talk/argue stays available; the partner's current task is interruptible.
      const busy=Boolean(game.socialAction);
      for(const kind of Object.keys(SOCIAL_ACTIONS))$(kind+'-btn').disabled=busy;
      const socialFx=$('social-effect');
      socialFx.hidden=!socialUsing;
      if(socialUsing){
        socialFx.textContent=game.socialAction.kind==='talk'?'♡ ✦':'⚡';
        const p=camera.camera.worldToScreen(new pc.Vec3(
          (game.position.x+game.otherSim.position.x)/2,2.2,
          (game.position.z+game.otherSim.position.z)/2));
        socialFx.style.left=p.x+'px';socialFx.style.top=p.y+'px';
      }
      for(const need of NEEDS){
        const val=Math.round(current.needs[need]);
        $('bar-'+need).style.width=val+'%';
        $('bar-'+need).style.background=val<30?'#e2a074':val<55?'#e1c27d':'#80bda1';
        $('value-'+need).textContent=val;
      }
      $('mood-label').textContent=current.mind.mood.label;
      const wish=current.mind.wish && WISHES[current.mind.wish.id];
      $('wish-label').textContent=wish ? wish.symbol+' Хочет: '+wish.label : 'Думает о будущем';
      $('mind-mood-label').textContent=current.mind.mood.label+' · '+current.mind.mood.value+'/100';
      $('mind-mood-bar').style.width=current.mind.mood.value+'%';
      $('mind-wish-label').textContent=wish?.label || 'Присматривается к миру';
      $('wish-do-btn').disabled=!wish;
      if (!$('mind-panel').hidden) {
        const feelings=visibleEmotions(current.mind,current.minutes,current.personality).slice(0,3);
        $('mind-emotions').textContent=feelings.length
          ?feelings.map(e=>e.icon+' '+e.label+' · '+e.intensity+'/100 · '+e.cause+
            ' · ещё '+Math.ceil(e.remaining)+' игр. мин.').join('\n')
          :'Сейчас нет сильных переживаний';
        const perspective=getPerspective(game,game.selectedSim);
        $('mind-relation-name').textContent='К '+getActorName(game.selectedSim==='alex'?'mira':'alex');
        for(const axis of ['friendship','trust','tension']){
          const value=Math.round(perspective[axis]);
          $('mind-relation-'+axis).textContent=value+'/100';
          $('mind-relation-'+axis+'-bar').style.width=value+'%';
        }
        const sentiments=latestSentiments(perspective,2);
        $('mind-sentiments').textContent=sentiments.length
          ?sentiments.map(item=>'• '+item.label+' · '+readableTime(item.at).day).join('\n')
          :'Общих событий пока мало';
        const list=$('mind-memories');
        list.replaceChildren();
        const memories=current.mind.memories.slice(-4).reverse();
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
      const status=game.paused?'Пауза':game.socialAction
        ? (game.socialAction.phase==='walking'?'Идёт на встречу: ':'Общаются: ')+SOCIAL_ACTIONS[game.socialAction.kind].label.toLowerCase()
        :!game.autonomy.enabled&&!current.action?selectedName()+' ждёт указаний':current.action?.phase==='walking'?'Идёт: '+ACTIONS[current.action.id].label.toLowerCase():current.action?.phase==='using'?ACTIONS[current.action.id].label+' · '+Math.min(100,Math.round(100*current.action.elapsed/ACTIONS[current.action.id].duration))+'%':current.event;
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
  // Count the scene after rendering has had a chance to draw its first frame.
  requestAnimationFrame(()=>requestAnimationFrame(()=>loadingProgress.finish('scene')));
  void loadingProgress.wait().then(({failed})=>{
    $('loading').hidden=true;
    toast(failed
      ? 'Часть 3D-моделей недоступна — включены старые облики'
      : 'Свайп — двигай комнату · два пальца — поворот и масштаб');
  });
}

void (async()=>{
  // Register before PlayCanvas requests the character GLBs, including first visit.
  await registerModelCache();
  boot();
})().catch(error=>{
  console.error('Блин’С startup failed',error);
  const el=$('loading');
  el.replaceChildren();
  const heading=document.createElement('strong');
  heading.textContent='3D не запустился';
  const hint=document.createElement('span');
  hint.textContent=String(error?.message||error).slice(0,170)+' · Обнови страницу в Safari.';
  el.append(heading,hint);
});
