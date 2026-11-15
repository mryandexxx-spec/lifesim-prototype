import * as pc from 'playcanvas';
import {dialogueNeedsDecision,applyDialogueDecision} from './dialogue-decision.js';
import {pickWorldRayTarget} from './world-interactions.js';
import {planPreview,planTaskIcon} from './plan-preview.js';
import {contextualPlacement,viewMenuPlacement} from './ui-layout.js';
import {createRequiredChoiceFocus} from './required-choice-focus.js';
import {createLoadingProgress} from './loading-progress.js';
import {registerModelCache} from './model-cache.js';
import {CAMERA_INITIAL,dragCamera,orbitCamera,pinchCamera,wheelCamera} from './camera-controls.js';
import { ACTIONS, NEEDS, SAVE_KEY, AUTONOMY_WAIT_SECONDS, newGame, loadGame, chooseAction, arrive, tick, autonomousChoice, setAutonomyEnabled, advanceAutonomyWait, readableTime } from './simulation.js';
import { findPath, nearestWalkable } from './navigation.js';
import { SOCIAL_ACTIONS, relationshipLabel, canStartSocial, startSocial,
  arriveSocial, cancelSocial, autonomousSocialChoice, startConversation,
  chooseSocialLine,nextSocialLine,finishSocialConversation,startSharedSocial,startBranchSocial } from './relationships.js';
import {availableSocialActions,relationSummary,BRANCH_ACTIONS,getPair,episodeContext,socialKnowledgeNotes,socialCommunicationNotes} from './social-graph.js';
import {latestEpisodes} from './social-episodes.js';
import {pairDynamic} from './social-dynamics.js';
import {romanceStatus,romanceLoveDescription,romanceClimate} from './romance.js';
import {enqueueAction,pendingActions,removeQueuedAction,dispatchActionQueues} from './action-queue.js';
import {GIFT_CATALOG,LEISURE_CATALOG,inventoryFor,sharedDuration} from './gifts-leisure.js';
import {CONVERSATION_TOPICS,conversationOptions,conversationTranscript,
  CONVERSATION_MAX_TURNS} from './conversation-engine.js';
import { WISHES, MEMORY_TEXT } from './psychology.js';
import {getPerspective,latestSentiments} from './social-perspective.js';
import {visibleEmotions} from './emotion-engine.js';
import {consumeSocialReactions,clearSocialReactions} from './social-feedback.js';
import {createReactionBadges} from './reaction-badges.js';
import {needPresentation,moodPresentation,moodOrbitPoint} from './mood-presentation.js';
import {moodActionPolicy} from './mood-action-policy.js';
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

// View is a presentation-only popover: both existing preferences remain wired
// to their original IDs and neither value enters the saved household schema.
let viewOpen=false;
const positionViewPanel=()=>{
  if(!viewOpen)return;
  const b=$('view-toggle').getBoundingClientRect();
  const appRect=canvas.getBoundingClientRect();
  const panel=$('view-panel');
  const pos=viewMenuPlacement({
    buttonLeft:b.left-appRect.left,buttonTop:b.top-appRect.top,
    viewportWidth:canvas.clientWidth,viewportHeight:canvas.clientHeight,
    menuWidth:panel.offsetWidth||226,menuHeight:panel.offsetHeight||160
  });
  panel.style.setProperty('--view-x',pos.x+'px');
  panel.style.setProperty('--view-y',pos.y+'px');
};
function setViewOpen(open,{restoreFocus=false}={}){
  if(open&&dialogueNeedsDecision(game))return;
  viewOpen=Boolean(open);
  $('view-panel').hidden=!viewOpen;
  $('view-toggle').setAttribute('aria-expanded',String(viewOpen));
  if(viewOpen){
    closeSocialContext();
    select(null);
    requestAnimationFrame(positionViewPanel);
  }else if(restoreFocus){
    $('view-toggle').focus({preventScroll:true});
  }
}
$('view-toggle').addEventListener('click',()=>setViewOpen(!viewOpen));
$('view-close').addEventListener('click',()=>setViewOpen(false,{restoreFocus:true}));
document.addEventListener('pointerdown',event=>{
  if(!viewOpen)return;
  if($('view-panel').contains(event.target)||$('view-toggle').contains(event.target))return;
  setViewOpen(false);
},true);
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&viewOpen&&!dialogueNeedsDecision(game)){
    event.preventDefault();setViewOpen(false,{restoreFocus:true});
  }
},true);
window.addEventListener('resize',positionViewPanel);

const META = {
  bed: { title: 'Уютная кровать', category: 'Спальня', description: 'Сон восстанавливает энергию', icon: '☾', anchor: [-2.5, 1.22, -1.48] },
  fridge: { title: 'Холодильник', category: 'Кухня', description: 'Перекус восстанавливает сытость', icon: '◕', anchor: [3.42, 2.13, -2.79] },
  shower: { title: 'Душевая', category: 'Ванная', description: 'Душ повышает уровень гигиены', icon: '✧', anchor: [-3.65, 2.16, 2.45] },
  sofa: { title: 'Диван', category: 'Гостиная', description: 'Отдых повышает уровень досуга', icon: '♫', anchor: [1.35, 1.38, 1.54] }
};

let selected = null;
let beginAction = () => false;
let beginSocial = () => false;
let conversationTopicPicker=false;
let conversationDisplayKey='';
let sharedPicker=false;
let sharedDisplayKey='';
let branchPicker=false;
let branchDisplayKey='';
let socialMenuCategory=null;
let socialContextVisible=false; // UI-only: no changes to the saved simulation.
let socialMenuDisplayKey='';
let queueVisible=false;
let queueDisplayKey='';
let planPeekKey='';
let dispatchPlannedActions=()=>[];
let debugTapCount=0;
let debugTapAt=0;
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
function taskLabel(task){
  if(!task)return 'Неизвестное действие';
  if(task.type==='object')return ACTIONS[task.actionId]?.label||'Предмет';
  if(task.type==='social')return SOCIAL_ACTIONS[task.actionId]?.label||'Общение';
  if(task.type==='conversation')return 'Беседа: '+(CONVERSATION_TOPICS[task.topicId]?.label||'Разговор');
  if(task.type==='branch')return BRANCH_ACTIONS[task.actionId]?.label||'Общение';
  if(task.type==='shared'){
    if(task.mode==='gift')return 'Подарить: '+(GIFT_CATALOG[inventoryFor(game,task.residentId||game.selectedSim)
      .find(x=>x.id===task.choiceId)?.type]?.label||'предмет');
    return LEISURE_CATALOG[task.choiceId]?.label||'Совместный досуг';
  }
  return 'Действие';
}
function scheduleCommand(command,residentId=game.selectedSim){
  // A physical gift has one ID and cannot be handed over twice.
  if(command.type==='shared'&&command.mode==='gift'&&(
    pendingActions(game.actionQueues,residentId).some(x=>
      x.type==='shared'&&x.mode==='gift'&&x.choiceId===command.choiceId)||
    (game.socialAction?.initiator===residentId&&
      game.socialAction?.shared?.mode==='gift'&&
      game.socialAction.shared.choiceId===command.choiceId))){
    toast('Этот подарок уже ожидает передачи');return false;
  }
  const task=enqueueAction(game.actionQueues,residentId,command);
  if(!task){toast('Не удалось добавить: очередь заполнена или действие недоступно');return false;}
  // Successful commands are visible in the queue counter, not in a floating
  // overlay over the game. Screen readers receive a nonblocking confirmation.
  renderQueuePanel(true);
  $('queue-feedback').textContent=getActorName(residentId)+': добавлено в очередь — '+
    taskLabel({...task,residentId});
  save(true);
  if(command.type!=='object'){
    // A confirmed queue entry closes only presentation, never the action.
    socialContextVisible=false;
    socialMenuCategory=null;conversationTopicPicker=false;sharedPicker=false;branchPicker=false;
    renderSocialContext();renderSocialMenu();renderConversationPanel();renderSharedPanel();
  }
  return true;
}
function queuedSocial(kind,extra={}){
  const targetId=game.selectedSim==='alex'?'mira':'alex';
  return scheduleCommand({type:kind==='talk'||kind==='argue'?'social':kind,
    targetId,...extra,...(kind==='talk'||kind==='argue'?{actionId:kind}:{})});
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
  if (id && scheduleCommand({type:'object',actionId:id})) {
    closeMindPanel();
    toast(selectedName()+': в очереди желание — '+WISHES[id].label.toLowerCase());
  }
});
function select(id) {
  if (id){ closeMindPanel();closeSocialContext(); }
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
// Persist only the optional display preference, never the game/save schema.
// Default is a clean room; projecting the 3D object still enables a canvas tap.
const ITEM_LABELS_PREF='lifesim.ui.itemLabels.v1';
let itemLabelsVisible=false;
try{itemLabelsVisible=localStorage.getItem(ITEM_LABELS_PREF)==='visible';}
catch{/* In-memory default works in Safari private mode. */}
function updateItemLabels(){
  $('hotspots').hidden=!itemLabelsVisible;
  const button=$('item-labels-btn');
  button.setAttribute('aria-pressed',String(itemLabelsVisible));
  button.setAttribute('aria-label',itemLabelsVisible
    ?'Скрыть подписи предметов':'Показать подписи предметов');
}
$('item-labels-btn').addEventListener('click',()=>{
  itemLabelsVisible=!itemLabelsVisible;
  try{localStorage.setItem(ITEM_LABELS_PREF,itemLabelsVisible?'visible':'hidden');}
  catch{/* UI preference is optional; never interrupt gameplay. */}
  updateItemLabels();
});
updateItemLabels();
$('close-action').addEventListener('click', () => select(null));
$('action-button').addEventListener('click', () => {
  if (!selected) return;
  if (scheduleCommand({type:'object',actionId:selected})) {
    select(null);
  }
});
// Legacy buttons remain hidden for old UI references; queue rather than interrupt.
for(const kind of Object.keys(SOCIAL_ACTIONS))
  $(kind+'-btn').addEventListener('click',()=>queuedSocial(kind));
function renderSocialContext(){
  const open=socialContextVisible&&!socialMenuCategory&&!conversationTopicPicker&&
    !sharedPicker&&!branchPicker&&!dialogueNeedsDecision(game);
  $('social-context').hidden=!open;
}
function closeSocialContext(){
  socialContextVisible=false;
  closeSocialPickers();
  renderSocialContext();
}
function openSocialContext(){
  if(dialogueNeedsDecision(game))return;
  select(null);closeMindPanel();closeSocialPickers();
  socialContextVisible=true;
  renderSocialContext();
}
$('social-context-close').addEventListener('click',closeSocialContext);
function closeSocialPickers(){
  conversationTopicPicker=false;
  sharedPicker=false;
  branchPicker=false;
  socialMenuCategory=null;
  renderConversationPanel();renderSharedPanel();renderBranchPanel();renderSocialMenu();
  renderSocialContext();
}
function showSocialCategory(category){
  // A multi-turn conversation requires the player's next answer, but opening
  // it is opt-in. Its button becomes "Продолжить беседу" while active.
  if(category==='conversation'&&game.socialAction?.conversation){
    closeSocialPickers();
    conversationTopicPicker=true;
    select(null);closeMindPanel();
    renderConversationPanel();renderSocialContext();
    return;
  }
  const peer=game.selectedSim='alex'?'mira':'alex';
  const status=relationSummary(game.socialGraph,game.selectedSim,peer);
  if(category==='friendship'&&status.friendship==='none'){
    toast('Дружеские действия пока недоступны');return;
  }
  closeSocialPickers();
  if(category==='shared'){
    sharedPicker=true;select(null);closeMindPanel();renderSharedPanel();renderSocialContext();return;
  }
  socialMenuCategory=category;
  select(null);closeMindPanel();
  renderConversationPanel();renderSharedPanel();renderSocialMenu();renderSocialContext();
}
for(const [id,category] of [
  ['conversation-btn','conversation'],['humor-btn','humor'],
  ['friendship-btn','friendship'],['romance-btn','romance'],
  ['conflict-btn','conflict'],['shared-btn','shared']
])$(id).addEventListener('click',()=>showSocialCategory(category));
$('social-menu-close').addEventListener('click',()=>{
  socialMenuCategory=null;renderSocialMenu();renderConversationPanel();renderSharedPanel();renderSocialContext();
});
// Close buttons dismiss only presentation. They must NEVER cancel a running
// task; the deliberate "Прервать текущее действие" control lives in the queue.
$('conversation-close').addEventListener('click',()=>{
  if(dialogueNeedsDecision(game))return; // Mandatory decisions have no close path.
  conversationTopicPicker=false;renderConversationPanel();
});
$('shared-close').addEventListener('click',()=>{
  sharedPicker=false;renderSharedPanel();
});
$('branch-close').addEventListener('click',()=>{
  branchPicker=false;renderBranchPanel();
});
// An unobtrusive seven-tap gesture reveals the full technical graph.
$('relationship-branch').addEventListener('click',()=>{
  const now=Date.now();
  if(now-debugTapAt>3500)debugTapCount=0;
  debugTapAt=now;
  if(++debugTapCount>=7){
    debugTapCount=0;
    closeSocialPickers();
    branchPicker=true;renderBranchPanel();
  }
});
if(new URLSearchParams(window.location.search).get('debug')==='relations')
  branchPicker=true;
function renderSocialMenu(force=true){
  const category=socialMenuCategory;
  const targetId=game.selectedSim==='alex'?'mira':'alex';
  const status=relationSummary(game.socialGraph,game.selectedSim,targetId);
  const rev=game.socialGraph?.pairs?.[JSON.stringify([game.selectedSim,targetId].sort())]?.revision||0;
  const key=JSON.stringify([category,game.selectedSim,status.friendship,status.rivalry,rev,
    category==='romance'?Math.floor(game.minutes/30):null]);
  if(!force&&key===socialMenuDisplayKey)return;
  socialMenuDisplayKey=key;
  $('social-menu-panel').hidden=!category;
  if(!category)return;
  const titles={conversation:'Беседа',humor:'Юмор',friendship:'Дружба',
    romance:'Романтика',conflict:'Конфликт'};
  $('social-menu-title').textContent=titles[category]||'Общение';
  $('social-menu-subtitle').textContent='Выбери взаимодействие с '+getActorName(targetId);
  const options=$('social-menu-options');options.replaceChildren();
  const add=(label,request)=>{
    options.append(conversationButton(label,()=>{
      if(scheduleCommand({targetId,...request})){
        socialMenuCategory=null;renderSocialMenu();
      }
    }));
  };
  const addTopic=id=>{
    const topic=CONVERSATION_TOPICS[id];
    if(topic)add(topic.label,{type:'conversation',topicId:id});
  };
  const addBranch=id=>{
    const found=availableSocialActions(game.socialGraph,game.selectedSim,targetId,game.minutes)
      .find(a=>a.id===id);
    if(found?.enabled)add(found.label,{type:'branch',actionId:id});
  };
  if(category==='conversation'){
    add('Поговорить',{type:'social',actionId:'talk'});
    addBranch('acquaint.introduce');
    addBranch('acquaint.chat');
    for(const id of ['daily','hobbies','plans','support'])addTopic(id);
  }else if(category==='humor'){
    addTopic('humor');
    addBranch('friend.tease');
  }else if(category==='friendship'){
    addBranch('friend.tease');
    addBranch('friend.confide');
  }else if(category==='romance'){
    const options=availableSocialActions(game.socialGraph,game.selectedSim,targetId,game.minutes)
      .filter(action=>action.category==='romance');
    for(const action of options){
      if(action.enabled)add(action.label,{type:'branch',actionId:action.id});
    }
    if(!options.some(action=>action.enabled)){
      const hint=document.createElement('p');
      hint.className='shared-progress-text';
      hint.textContent=options[0]?.reason||'Для романтики пока не время';
      $('social-menu-options').append(hint);
    }
  }else if(category==='conflict'){
    add('Поспорить',{type:'social',actionId:'argue'});
    addTopic('conflict');
    addBranch('rival.taunt');
    addBranch('rival.truce');
  }
}
function activeTaskLabel(id){
  const s=game.socialAction;
  if(s&&(s.initiator===id||s.partner===id)){
    if(s.conversation)return 'Беседа с '+getActorName(s.partner===id?s.initiator:s.partner);
    if(s.branchAction)return BRANCH_ACTIONS[s.branchAction.id]?.label||'Общение';
    if(s.shared)return s.shared.mode==='gift'?'Вручает или принимает подарок':'Проводит время вместе';
    return SOCIAL_ACTIONS[s.kind]?.label||'Общается';
  }
  const actor=getActor(game,id);
  return actor.action?ACTIONS[actor.action.id]?.label||'Занятие':null;
}
// A single, read-only status area opens the EXISTING full queue. It never
// dispatches/removes commands and never mutates serialized simulation state.
function renderPlanPeek(){
  const residentId=game.selectedSim;
  const actor=getActor(game,residentId);
  let active=activeTaskLabel(residentId);
  const social=game.socialAction;
  const involved=social&&(social.initiator===residentId||social.partner===residentId);
  const phase=involved?social.phase:actor.action?.phase;
  if(active&&phase==='walking')active='Идёт · '+active;
  else if(active&&phase==='using'&&!involved&&actor.action){
    const duration=ACTIONS[actor.action.id]?.duration;
    if(Number.isFinite(duration)&&duration>0)
      active+=' · '+Math.min(100,Math.round(100*(actor.action.elapsed||0)/duration))+'%';
  }
  const plan=planPreview({
    residentName:getActorName(residentId),
    activeLabel:active,
    pending:pendingActions(game.actionQueues,residentId),
    taskName:task=>taskLabel({...task,residentId}),
    paused:game.paused,
    needsReply:dialogueNeedsDecision(game),
    idleLabel:!game.autonomy.enabled?'Ждёт указаний':actor.event||'Свободное время'
  });
  const key=JSON.stringify([residentId,plan.heading,plan.upcoming,plan.more,queueVisible]);
  if(key===planPeekKey)return;
  planPeekKey=key;
  $('status-text').textContent=plan.heading;
  const list=$('plan-upcoming');list.replaceChildren();
  for(const item of plan.upcoming){
    const chip=document.createElement('span');chip.className='plan-chip';
    const index=document.createElement('span');index.className='plan-chip-index';
    index.textContent=item.index+'.';
    const icon=document.createElement('span');icon.className='plan-chip-icon';
    icon.textContent=planTaskIcon(item.type);
    const label=document.createElement('span');label.className='plan-chip-label';
    label.textContent=item.label;
    chip.append(index,icon,label);list.append(chip);
  }
  if(plan.more){
    const more=document.createElement('span');more.className='plan-more';
    more.textContent='+'+plan.more;
    list.append(more);
  }
  list.hidden=plan.upcoming.length===0;
  const button=$('plan-peek');
  button.setAttribute('aria-expanded',String(queueVisible));
  button.setAttribute('aria-label',plan.accessible);
}
$('plan-peek').addEventListener('click',()=>{
  queueVisible=!queueVisible;
  renderQueuePanel(true);
});
function renderQueuePanel(force=true){
  renderPlanPeek();
  const residentId=game.selectedSim;
  const pending=pendingActions(game.actionQueues,residentId);
  const active=activeTaskLabel(residentId);
  const key=JSON.stringify([queueVisible,residentId,pending,active,game.socialAction?.phase,
    getActor(game,residentId).action?.phase]);
  $('queue-toggle').textContent='Очередь · '+pending.length;
  if(!force&&key===queueDisplayKey)return;
  queueDisplayKey=key;
  $('queue-panel').hidden=!queueVisible;
  $('queue-toggle').setAttribute('aria-expanded',String(queueVisible));
  $('plan-peek').setAttribute('aria-expanded',String(queueVisible));
  if(!queueVisible)return;
  $('queue-title').textContent='План: '+getActorName(residentId);
  const activeEl=$('queue-active');activeEl.replaceChildren();
  const label=document.createElement('div');
  label.textContent=active?'Сейчас: '+active:'Сейчас: свободен';
  activeEl.append(label);
  if(active){
    const stop=document.createElement('button');stop.type='button';
    stop.textContent='Прервать текущее действие';
    stop.addEventListener('click',()=>{
      const social=game.socialAction;
      if(social&&(social.initiator===residentId||social.partner===residentId))
        cancelSocial(game);
      else getActor(game,residentId).action=null;
      getActor(game,residentId).event='Действие прервано по команде игрока';
      renderQueuePanel(true);save(true);
      toast('Текущее действие остановлено по твоей команде');
    });
    activeEl.append(stop);
  }
  const list=$('queue-items');list.replaceChildren();
  for(const [index,task] of pending.entries()){
    const li=document.createElement('li');
    const name=document.createElement('span');
    name.textContent=(index+1)+'. '+taskLabel({...task,residentId});
    const remove=document.createElement('button');
    remove.type='button';remove.textContent='×';
    remove.setAttribute('aria-label','Удалить из очереди: '+taskLabel({...task,residentId}));
    remove.addEventListener('click',()=>{
      if(removeQueuedAction(game.actionQueues,residentId,task.seq)){
        renderQueuePanel(true);save(true);
      }
    });
    li.append(name,remove);list.append(li);
  }
  $('queue-empty').hidden=pending.length>0;
}
$('queue-toggle').addEventListener('click',()=>{
  queueVisible=!queueVisible;renderQueuePanel();
});
$('queue-close').addEventListener('click',()=>{
  queueVisible=false;renderQueuePanel();
});
function renderBranchPanel(force=true){
  const s=game.socialAction,active=s?.branchAction;
  const target=game.selectedSim==='alex'?'mira':'alex';
  const status=relationSummary(game.socialGraph,game.selectedSim,target);
  const pairKey=JSON.stringify([game.selectedSim,target].sort());
  const revision=game.socialGraph?.pairs?.[pairKey]?.revision||0;
  const key=JSON.stringify([branchPicker,game.selectedSim,s?.phase,active,game.paused,revision]);
  if(!force&&key===branchDisplayKey)return;
  branchDisplayKey=key;
  // This panel is a hidden diagnostic explorer, not a mandatory action modal.
  // A normal social interaction must never open it automatically.
  const open=branchPicker;
  $('branch-panel').hidden=!open;
  if(!open)return;
  const opts=$('branch-options');opts.replaceChildren();
  $('branch-title').textContent=status.label;
  $('branch-subtitle').textContent=active
    ?game.paused?'Пауза — взаимодействие остановлено':
      s.phase==='walking'?'Жители идут друг к другу':'Общаются — действие завершится по игровому времени'
    :'ОТЛАДКА · хороших событий: '+status.positive+
      ', конфликтов: '+status.negative+', общих дней: '+status.days;
  if(active){
    const p=document.createElement('p');p.className='shared-progress-text';
    p.textContent=BRANCH_ACTIONS[active.id]?.label||'Социальное действие';
    opts.append(p);return;
  }
  const debug=document.createElement('p');debug.className='shared-progress-text';
  const a=getPerspective(game,game.selectedSim),b=getPerspective(game,target);
  debug.textContent='Направления · '+selectedName()+': '+Math.round(a.friendship)+' / '+
    Math.round(a.trust)+' / '+Math.round(a.tension)+'; '+getActorName(target)+': '+
    Math.round(b.friendship)+' / '+Math.round(b.trust)+' / '+Math.round(b.tension);
  opts.append(debug);
  const hints=document.createElement('p');hints.className='shared-progress-text';
  hints.textContent='Дружба: 3 события за 2 дня, взаимная дружба ≥65, доверие ≥50. Враги: ≥2 конфликта.';
  opts.append(hints);
  for(const action of availableSocialActions(game.socialGraph,game.selectedSim,target,game.minutes)){
    const button=conversationButton(action.label+(action.enabled?'':' · '+action.reason),()=>{
      if(queuedSocial('branch',{actionId:action.id})){
        branchPicker=false;renderBranchPanel();
      }
    });
    button.disabled=!action.enabled||Boolean(game.socialAction);
    opts.append(button);
  }
}
/** Browser-safe, stable controls: rerender only on a transition, never on a frame. */
function renderSharedPanel(force=true){
  const action=game.socialAction,session=action?.shared;
  const key=JSON.stringify([sharedPicker,socialMenuCategory,game.selectedSim,game.paused,action?.phase,session]);
  if(!force&&key===sharedDisplayKey)return;
  sharedDisplayKey=key;
  // The shared activity is displayed in the optional queue UI, not a popup.
  const open=sharedPicker;
  $('shared-panel').hidden=!open||Boolean(socialMenuCategory);
  if(!open)return;
  const options=$('shared-options');options.replaceChildren();
  const own=getActorName(session?action.initiator:game.selectedSim);
  const peer=getActorName(session?action.partner:
    game.selectedSim==='alex'?'mira':'alex');
  $('shared-subtitle').textContent=session
    ?game.paused?'На паузе — время не идёт':
      action.phase==='walking'?own+' идёт к '+peer:
      'Занимаются вместе · действие завершится по игровому времени'
    :'Выбери подарок или занятие для '+peer;
  if(session){
    const item=session.mode==='gift'
      ?inventoryFor(game,action.initiator).find(x=>x.id===session.choiceId)
      :null;
    const label=session.mode==='gift'?GIFT_CATALOG[item?.type]?.label||'Подарок':
      LEISURE_CATALOG[session.choiceId]?.label||'Досуг';
    $('shared-title').textContent=label;
    const progress=sharedDuration(session);
    const status=document.createElement('p');
    status.className='shared-progress-text';
    status.textContent=action.phase==='walking'?'Сначала нужно встретиться':
      'Продолжительность: '+progress+' игровых минут. Остановить можно в очереди.';
    options.append(status);
    // The current joint activity stays active; the player can still plan
    // another gift or leisure action from the same panel.
    if(!sharedPicker)return;
  }
  $('shared-title').textContent=session?'Запланировать следующее':'Подарки и досуг';
  const inventory=inventoryFor(game,game.selectedSim);
  const gifts=document.createElement('h3');gifts.textContent='Подарить из инвентаря ('+inventory.length+')';
  options.append(gifts);
  if(!inventory.length){
    const empty=document.createElement('p');empty.className='shared-progress-text';
    empty.textContent='Пока нет вещей для подарка';options.append(empty);
  }
  for(const item of inventory){
    const def=GIFT_CATALOG[item.type];
    options.append(conversationButton(def.symbol+' '+def.label,()=>{
      if(queuedSocial('shared',{mode:'gift',choiceId:item.id})){
        sharedPicker=false;renderSharedPanel();
      }
    }));
  }
  const activities=document.createElement('h3');activities.textContent='Провести время вместе';
  options.append(activities);
  for(const [id,def] of Object.entries(LEISURE_CATALOG))
    options.append(conversationButton(def.symbol+' '+def.label,()=>{
      if(queuedSocial('shared',{mode:'leisure',choiceId:id})){
        sharedPicker=false;renderSharedPanel();
      }
    }));
}
function conversationButton(label,callback,secondary=false){
  const button=document.createElement('button');
  button.type='button';button.textContent=label;
  button.className=secondary?'conversation-option secondary':'conversation-option';
  button.addEventListener('click',callback);
  return button;
}
/** End the conversation immediately; an empty one has no social rewards.
 * Confirmed prior lines are applied exactly once on explicit completion.
 */
function endPlayerConversation(){
  const outcome=applyDialogueDecision(game,root=>
    root.socialAction?.conversation?.turns?.length
      ?finishSocialConversation(root):cancelSocial(root));
  if(!outcome)return false;
  conversationTopicPicker=false;
  save(true);
  renderConversationPanel();
  renderQueuePanel(true);
  toast(typeof outcome==='object'?outcome.label:'Разговор завершён');
  return true;
}
/** Only replace interactive DOM when the conversation actually changes.
 * Replacing buttons every game frame would swallow iPhone touch clicks.
 */
function renderConversationPanel(force=true){
  const s=game.socialAction,session=s?.conversation;
  const required=dialogueNeedsDecision(game);
  $('conversation-btn').textContent=session?'Продолжить беседу':'Беседа';
  const panel=$('conversation-panel');
  const enteringRequired=required&&!panel.classList.contains('dialogue-required');
  panel.classList.toggle('dialogue-required',required);
  $('conversation-close').hidden=required;
  $('dialogue-backdrop').hidden=!required;
  if(required){
    panel.setAttribute('role','dialog');
    panel.setAttribute('aria-modal','true');
    panel.setAttribute('aria-labelledby','conversation-title');
  }else panel.removeAttribute('aria-modal');
  const key=JSON.stringify([conversationTopicPicker,required,socialMenuCategory,
    game.selectedSim,game.paused,s?.phase,session?.topic,session?.phase,session?.turns]);
  if(!force&&key===conversationDisplayKey)return;
  conversationDisplayKey=key;
  const open=conversationTopicPicker||required;
  panel.hidden=!open||(!required&&Boolean(socialMenuCategory));
  if(!open)return;
  if(enteringRequired)panel.focus({preventScroll:true});
  const options=$('conversation-options');
  options.replaceChildren();
  const list=$('conversation-lines');
  list.replaceChildren();
  $('conversation-title').textContent=session
    ?CONVERSATION_TOPICS[session.topic].label:'Выбери тему';
  $('conversation-subtitle').textContent=required
    ?'⏸ Игровое время остановлено · выбери ответ или заверши разговор'
    :session
      ?(s.phase==='walking'?'Персонажи идут навстречу':
        game.paused?'Сними паузу, чтобы жители встретились':
        s.phase==='using'?'Разговор с '+getActorName(s.partner):'Подготовка беседы')
      :'Начни разговор с '+getActorName(game.selectedSim==='alex'?'mira':'alex');
  if(!session){
    for(const [id,topic] of Object.entries(CONVERSATION_TOPICS))
      options.append(conversationButton(topic.label,()=>{
        if(queuedSocial('conversation',{topicId:id})){
          conversationTopicPicker=false;renderConversationPanel();
        }
      }));
    return;
  }
  for(const entry of conversationTranscript(session)){
    const li=document.createElement('li');
    li.textContent=(entry.speaker==='initiator'?getActorName(s.initiator):getActorName(s.partner))+
      ': '+entry.line;
    li.className=entry.speaker==='initiator'?'conversation-speaker':'conversation-reply';
    list.append(li);
  }
  list.scrollTop=list.scrollHeight;
  if(s.phase!=='using')return;
  if(session.phase==='response'){
    if(session.turns.length<CONVERSATION_MAX_TURNS)
      options.append(conversationButton('Продолжить беседу',()=>{
        if(applyDialogueDecision(game,root=>nextSocialLine(root))){
          save(true);renderConversationPanel();
        }
      }));
  }else{
    for(const choice of conversationOptions(session))
      options.append(conversationButton(choice.label,()=>{
        if(applyDialogueDecision(game,root=>chooseSocialLine(root,choice.id))){
          save(true);renderConversationPanel();
        }
      }));
  }
  // This is the only exit from a required-choice dialogue.
  options.append(conversationButton('Завершить разговор',endPlayerConversation,true));
}
renderConversationPanel();
renderSharedPanel();
renderBranchPanel();
renderSocialMenu();
renderQueuePanel();
renderSocialContext();
function renderPauseButton(){
  const blocked=dialogueNeedsDecision(game);
  const paused=game.paused||blocked;
  $('pause-icon').textContent=paused?'▶':'Ⅱ';
  $('pause-btn').setAttribute('aria-label',blocked
    ?'Выбери реплику: игровое время остановлено'
    :paused?'Продолжить':'Пауза');
}
$('pause-btn').addEventListener('click', () => {
  if(dialogueNeedsDecision(game))return;
  game.paused = !game.paused;
  renderPauseButton();
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
    conversationTopicPicker=false;sharedPicker=false;branchPicker=false;
    socialMenuCategory=null;socialContextVisible=false;
    select(null); closeMindPanel(); updateResidentPicker();renderSocialContext();
    renderConversationPanel();renderSharedPanel();renderBranchPanel();
    renderSocialMenu();renderQueuePanel();save(true);
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

  // Each furniture part registers its ACTUAL authored geometry, not a hardcoded
  // circle around a label. Future furniture needs only use the same wrapper.
  const hitVolumes=[];
  const registerHitVolume=(id,kind,x,y,z,sx,sy,sz)=>{
    const pad=.035;
    hitVolumes.push({kind,id,bounds:{
      min:{x:x-sx/2-pad,y:y-sy/2-pad,z:z-sz/2-pad},
      max:{x:x+sx/2+pad,y:y+sy/2+pad,z:z+sz/2+pad}
    }});
  };
  const touchBox=(id,name,x,y,z,sx,sy,sz,material)=>{
    const visual=box(name,x,y,z,sx,sy,sz,material);
    registerHitVolume(id,'object',x,y,z,sx,sy,sz);
    return visual;
  };
  const blockerBox=(name,x,y,z,sx,sy,sz,material)=>{
    const visual=box(name,x,y,z,sx,sy,sz,material);
    registerHitVolume(name,'blocker',x,y,z,sx,sy,sz);
    return visual;
  };

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
  touchBox('bed','bed frame',BED_LAYOUT.centerX,BED_LAYOUT.frameY,BED_LAYOUT.centerZ,
    2.42,BED_LAYOUT.frameHeight,2.52,M.wood);
  touchBox('bed','mattress',BED_LAYOUT.centerX,BED_LAYOUT.mattressY,BED_LAYOUT.centerZ,
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
  touchBox('bed','bed headboard',-2.62,.82,-2.69,2.47,.95,.17,M.paleWood);
  touchBox('bed','pillow left',-3.15,.54,-2.18,.87,.19,.50,M.cream);
  touchBox('bed','pillow right',-2.10,.54,-2.18,.87,.19,.50,M.peach);
  box('side table',-4.23,.38,-3.35,.65,.64,.68,M.paleWood);
  cylinder('lamp base',-4.23,.76,-3.35,.22,.10,.22,M.white);
  cylinder('lamp stem',-4.23,.94,-3.35,.055,.32,.055,M.slate);
  cylinder('lamp shade',-4.23,1.17,-3.35,.45,.32,.45,M.yellow);

  // Kitchen zone with tall fridge, little counter and upper cupboards.
  touchBox('fridge','fridge',3.43,.99,-2.85,1.12,1.98,1.14,M.cream);
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
  touchBox('sofa','sofa seat',SOFA_LAYOUT.x,SOFA_LAYOUT.seatCenterY,SOFA_LAYOUT.z,
    SOFA_LAYOUT.seatWidth,SOFA_LAYOUT.seatHeight,SOFA_LAYOUT.seatDepth,M.peach);
  touchBox('sofa','sofa back',SOFA_LAYOUT.x,SOFA_LAYOUT.backCenterY,SOFA_LAYOUT.backZ,
    2.52,SOFA_LAYOUT.backHeight,.29,M.rust);
  touchBox('sofa','sofa arm left',.11,SOFA_LAYOUT.armCenterY,SOFA_LAYOUT.z,
    .30,SOFA_LAYOUT.armHeight,1.21,M.rust);
  touchBox('sofa','sofa arm right',2.58,SOFA_LAYOUT.armCenterY,SOFA_LAYOUT.z,
    .30,SOFA_LAYOUT.armHeight,1.21,M.rust);
  touchBox('sofa','sofa pillow left',.72,SOFA_LAYOUT.pillowCenterY,SOFA_LAYOUT.pillowZ,
    .63,SOFA_LAYOUT.pillowHeight,.23,M.cream);
  touchBox('sofa','sofa pillow right',1.99,SOFA_LAYOUT.pillowCenterY,SOFA_LAYOUT.pillowZ,
    .63,SOFA_LAYOUT.pillowHeight,.23,M.mint);
  // Leave a navigable front approach so residents do not cross the sofa arm.
  blockerBox('coffee table top',1.34,.40,-.26,1.47,.12,.73,M.paleWood);
  for(let x of [.74,1.94]) for(let z of [-.53,.01])
    cylinder('table leg',x,.20,z,.085,.33,.085,M.wood);
  box('tv console',3.91,.41,.37,.66,.73,1.69,M.paleWood);
  box('tv screen',3.52,1.35,.36,.16,1.07,1.62,M.dark);
  box('tv glass',3.42,1.35,.36,.045,.89,1.44,M.slate);
  box('tv stand',3.67,.80,.37,.35,.12,.28,M.black);

  // Shower corner: soft mint tiles and a simple visible frame.
  touchBox('shower','shower platform',-3.67,.12,2.50,1.85,.22,1.88,M.white);
  touchBox('shower','shower back',-4.72,1.48,2.55,.13,2.68,1.92,M.blue);
  touchBox('shower','shower bar',-2.72,1.31,3.38,.08,2.5,.08,M.slate);
  touchBox('shower','shower rim',-3.66,2.53,3.40,1.86,.08,.09,M.slate);
  touchBox('shower','shower curtain',-3.67,1.60,3.40,1.70,1.61,.055,M.glass);
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
  const reactionBadges=createReactionBadges($('reaction-layer'));
  const reactionRigs={alex:alexRig,mira:miraRig};
  const moodOrbit=$('mood-orbit');
  let feedbackRoot=game;
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
  beginAction=(id,automatic=false,actorId=game.selectedSim,fromQueue=false)=>{
    const actor=getActor(game,actorId);
    if(!ACTIONS[id] || (automatic && !game.autonomy.enabled))return false;
    // Releasing the headless shower action does not immediately clear the
    // physical cubicle: the prior user must finish dressing and exiting first.
    if(id==='shower'&&HOUSEHOLD_IDS.some(other=>other!==actorId&&showerStates[other].active)){
      if(!automatic&&!fromQueue)toast('Душевая пока занята: житель выходит');
      return false;
    }
    if(!furnitureAvailable(game,id,actorId)){
      if(!automatic&&!fromQueue)toast('Предмет сейчас занят другим жителем');
      return false;
    }
    if(!buildRoute(id,actorId)){
      if(!automatic&&!fromQueue) toast(getActorName(actorId)+' не может добраться до предмета');
      else actor.autonomy.nextAt=game.minutes+15;
      return false;
    }
    const started=chooseResidentAction(game,id,automatic,actorId);
    if(started)restartAutonomyWait(actorId);
    return started;
  };

  // Meet beside the other resident at a walkable, reachable point.
  beginSocial=(kind,automatic=false,actorId=game.selectedSim,topic=null,shared=null,branchId=null,fromQueue=false)=>{
    if(!canStartSocial(game,kind,actorId,automatic)){
      if(!automatic&&!fromQueue)toast('Собеседник занят или разговор уже идёт');
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
    if(!best){if(!automatic&&!fromQueue)toast('Сейчас не получается подойти к собеседнику');return false;}
    if(!(branchId?startBranchSocial(game,actorId,best.goal,branchId,automatic)
      :shared?startSharedSocial(game,actorId,best.goal,shared.mode,shared.choiceId,automatic)
      :topic?startConversation(game,actorId,best.goal,topic)
      :startSocial(game,kind,actorId,best.goal,automatic)))return false;
    // Both residents are idle. Do not clear either existing action or path.
    paths[actorId]={points:best.points,index:0,id:'social:'+kind};
    restartAutonomyWait();
    return true;
  };
  dispatchPlannedActions=()=>{
    if(game.paused||dialogueNeedsDecision(game))return [];
    const refused=[];
    const started=dispatchActionQueues(game.actionQueues,{
      canStart(residentId,command){
        if(!HOUSEHOLD_IDS.includes(residentId)||game.socialAction)return false;
        const actor=getActor(game,residentId);
        if(actor.action||sofaStates[residentId].progress>0||
          bedStates[residentId].progress>0||showerStates[residentId].active||
          fridgeLeaving[residentId])return false;
        if(command.type==='object')
          return furnitureAvailable(game,command.actionId,residentId)&&
            !(command.actionId==='shower'&&HOUSEHOLD_IDS.some(id=>
              id!==residentId&&showerStates[id].active));
        const partnerId=command.targetId;
        // Current 3D scene is a two-person adapter; the queue core is N-person.
        if(!HOUSEHOLD_IDS.includes(partnerId)||partnerId===residentId||
          (residentId==='alex'?'mira':'alex')!==partnerId)return false;
        const partner=getActor(game,partnerId);
        if(partner.action||sofaStates[partnerId].progress>0||
          bedStates[partnerId].progress>0||showerStates[partnerId].active||
          fridgeLeaving[partnerId])return false;
        // Older personal plans of the invitee take priority over new invites.
        if((pendingActions(game.actionQueues,partnerId)[0]?.seq??Infinity)<
          command.seq)return false;
        if(!canStartSocial(game,command.type==='social'?command.actionId:'talk',
          residentId,false))return false;
        if(command.type==='branch'&&!availableSocialActions(
          game.socialGraph,residentId,partnerId,game.minutes)
          .some(a=>a.id===command.actionId&&a.enabled))return false;
        if(command.type==='shared'&&command.mode==='gift'&&
          !inventoryFor(game,residentId).some(item=>item.id===command.choiceId))
          return false;
        return true;
      },
      // No refusal when a task is blocked by another person or furniture.
      // This callback runs only for a startable HEAD, never on enqueue or on
      // an action already walking/using. Partner's consent stays separate.
      beforeStart(residentId,command){
        const policy=moodActionPolicy(getActor(game,residentId),command);
        return policy.willing?null:policy.reason;
      },
      onRefused(residentId,command,reason){
        const resident=getActor(game,residentId);
        resident.event=reason;
        resident.autonomy.nextAt=Math.max(resident.autonomy.nextAt,game.minutes+12);
        refused.push({residentId,command,reason});
      },
      start(residentId,command){
        if(command.type==='object')
          return beginAction(command.actionId,false,residentId,true);
        if(command.type==='social')
          return beginSocial(command.actionId,false,residentId,null,null,null,true);
        if(command.type==='conversation')
          return beginSocial('talk',false,residentId,command.topicId,null,null,true);
        if(command.type==='branch')
          return beginSocial('talk',false,residentId,null,null,command.actionId,true);
        if(command.type==='shared')
          return beginSocial('talk',false,residentId,null,
            {mode:command.mode,choiceId:command.choiceId},null,true);
        return false;
      }
    });
    if(refused.length){
      // A self-refusal is not partner rejection: no socialGraph receipt,
      // memory, affection change or cancellation of a running task.
      const last=refused[refused.length-1];
      const message=getActorName(last.residentId)+': '+last.reason+
        ' — '+taskLabel(last.command).toLowerCase();
      $('queue-feedback').textContent=message;
      renderQueuePanel(true);
      toast(message); // small pointer-transparent corner notification (1.0o)
    }
    // Persist both actual starts and rejected HEAD removal atomically in v1,
    // so a reload cannot replay a self-refused command.
    if(started.length||refused.length)save(true);
    return started;
  };
  resetRuntime=()=>{
    reactionBadges.clear();clearSocialReactions(game);feedbackRoot=game;
    conversationTopicPicker=false;sharedPicker=false;branchPicker=false;
    socialMenuCategory=null;socialContextVisible=false;queueVisible=false;
    conversationDisplayKey='';sharedDisplayKey='';branchDisplayKey='';
    socialMenuDisplayKey='';queueDisplayKey='';
    renderConversationPanel();renderSharedPanel();renderBranchPanel();
    renderSocialMenu();renderQueuePanel();
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
    if(dialogueNeedsDecision(game))return;
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
  // CSS-pixel tap -> PlayCanvas camera ray -> nearest ACTUAL registered 3D
  // piece. An object behind the sofa/counter does not win because it has a
  // closer 2D icon, and furniture stays selectable with labels hidden.
  const worldTargetAt=pos=>{
    const rect=canvas.getBoundingClientRect();
    const x=pos.x-rect.left,y=pos.y-rect.top;
    const near=camera.camera.screenToWorld(x,y,camera.camera.nearClip);
    const far=camera.camera.screenToWorld(x,y,camera.camera.farClip);
    const residents=[];
    for(const id of HOUSEHOLD_IDS){
      if(id===game.selectedSim||!reactionRigs[id]||showerStates[id]?.active)continue;
      const p=reactionRigs[id].avatar?.getPosition();
      if(!p)continue;
      const half=.43;
      residents.push({kind:'resident',id,bounds:{
        min:{x:p.x-half,y:p.y-.06,z:p.z-half},
        max:{x:p.x+half,y:p.y+2.26,z:p.z+half}
      }});
    }
    return pickWorldRayTarget(near,far,[...residents,...hitVolumes]);
  };
  let tapCueTimeout=null;
  const confirmWorldTap=pos=>{
    const cue=$('world-tap-cue');
    const rect=canvas.getBoundingClientRect();
    cue.style.left=(pos.x-rect.left)+'px';
    cue.style.top=(pos.y-rect.top)+'px';
    cue.hidden=false;
    clearTimeout(tapCueTimeout);
    tapCueTimeout=setTimeout(()=>{cue.hidden=true;},450);
  };
  const endPointer=event=>{
    if(!fingers.has(event.pointerId))return;
    const tap=tapCandidate&&tapCandidate.id===event.pointerId&&
      fingers.size===1&&tapCandidate.travel<10&&
      performance.now()-tapCandidate.t<360;
    const pos={x:event.clientX,y:event.clientY};
    fingers.delete(event.pointerId);
    tapCandidate=null;lastPinch=null;lastMidpoint=null;
    if(tap&&!dialogueNeedsDecision(game)){
      const target=worldTargetAt(pos);
      if(target)confirmWorldTap(pos);
      if(target?.kind==='resident')openSocialContext();
      else if(target?.kind==='object')select(target.id);
      else{closeSocialContext();select(null);}
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

  let accumulator=0, uiTimer=0, autosaveTime=0;
  const approach = (a,b,rate,dt) => a+(b-a)*(1-Math.exp(-rate*dt));
  const approachAngle=(a,b,rate,dt)=>a+((((b-a+540)%360)+360)%360-180)*(1-Math.exp(-rate*dt));
  app.on('update',dt=>{
    dt=Math.min(dt,.06);
    // Mandatory dialogue decisions freeze clock/needs/autonomy/animation
    // without altering the player's saved manual pause preference.
    const active=!game.paused&&!dialogueNeedsDecision(game);
    const animDt=active?dt:0;
    if(active){
      accumulator+=dt;
      // Fixed timestep: simulation speed cannot depend on rendering FPS.
      while(accumulator>=.10){
        const prevAlex=game.action?.id,prevMira=game.otherSim.action?.id;
        const sharedBefore=game.socialAction?.shared?game.socialAction.initiator:null;
        const branchBefore=game.socialAction?.branchAction?.id||null;
        const socialBefore=game.socialAction?.conversation||
          game.socialAction?.shared||game.socialAction?.branchAction
          ?null:game.socialAction?.kind;
        tickHousehold(game,.30 * game.speed); // Both share the clock; no double advancement.
        // A completed job frees its own resident; planned commands start only
        // after both participant states and render transition guards allow it.
        dispatchPlannedActions();
        if(prevAlex && !game.action) toast('Алекс закончил: '+ACTIONS[prevAlex].label.toLowerCase());
        if(prevMira && !game.otherSim.action) toast('Мира закончила: '+ACTIONS[prevMira].label.toLowerCase());
        if(socialBefore && !game.socialAction)toast(socialBefore==='talk'?'Жители поговорили ♡':'Жители поспорили ⚡');
      if(sharedBefore&&!game.socialAction)
        toast(getActor(game,sharedBefore).event);
      if(branchBefore&&!game.socialAction)
        toast('Завершено: '+BRANCH_ACTIONS[branchBefore].label);
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
        if(game.socialAction||pendingActions(game.actionQueues,residentId).length){
          autonomyWaitSeconds[residentId]=0;continue;
        }
        autonomyWaitSeconds[residentId]=advanceAutonomyWait(autonomyWaitSeconds[residentId],dt,resident);
        if(!resident.action && autonomyWaitSeconds[residentId]>=AUTONOMY_WAIT_SECONDS){
          const socialIdea=autonomousSocialChoice(game,residentId);
          if(socialIdea){
            const plan=typeof socialIdea==='string'?{kind:socialIdea}:socialIdea;
            const intent=plan.type==='shared'
              ?{type:'shared',mode:plan.mode,choiceId:plan.choiceId}
              :plan.type==='branch'
                ?{type:'branch',actionId:plan.actionId}
                :{type:'social',actionId:plan.kind};
            const willing=moodActionPolicy(resident,intent,{automatic:true}).willing;
            const started=willing&&(plan.type==='shared'
              ?beginSocial('talk',true,residentId,null,
                {mode:plan.mode,choiceId:plan.choiceId})
              :plan.type==='branch'
                ?beginSocial('talk',true,residentId,null,null,plan.actionId)
                :beginSocial(plan.kind,true,residentId));
            if(started){
              const label=plan.type==='shared'
                ?LEISURE_CATALOG[plan.choiceId]?.label.toLowerCase()
                :plan.type==='branch'
                  ?BRANCH_ACTIONS[plan.actionId]?.label.toLowerCase()
                  :plan.kind==='argue'?'высказать недовольство':'пообщаться';
              toast(getActorName(residentId)+' решил(а): '+(label||'пообщаться'));
              continue;
            }
            // Busy routes need a retry cooldown; bad mood instead permits
            // ordinary self-care choice below without wasting this frame.
            if(willing)resident.autonomy.nextAt=game.minutes+15;
            restartAutonomyWait(residentId);
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
    // An event is generated by the simulation only when the response happened.
    // UI markers are ephemeral, head anchored, and deliberately never saved.
    if(feedbackRoot!==game){reactionBadges.clear();feedbackRoot=game;}
    reactionBadges.show(consumeSocialReactions(game));
    reactionBadges.update({dt,paused:game.paused,pc,camera,canvas,
      rigs:reactionRigs,
      visible:{alex:!showerStates.alex.active,mira:!showerStates.mira.active}});
    // A persistent ORIGINAL orbit belongs only to the selected resident;
    // social response icons take priority, and privacy must not leak position.
    const orbitRig=reactionRigs[game.selectedSim];
    const orbitHead=orbitRig?.head||orbitRig?.avatar;
    if(!orbitHead?.getPosition||showerStates[game.selectedSim]?.active||
       reactionBadges.count()>0){
      moodOrbit.hidden=true;
    }else{
      const p=orbitHead.getPosition();
      const lift=orbitRig.head && typeof orbitRig.head.getPosition==='function' ? .91 : 2.43;
      const point=new pc.Vec3(p.x,p.y+lift,p.z);
      const pos=moodOrbitPoint(camera.camera.worldToScreen(point),
        camera.camera.viewMatrix.transformPoint(point),canvas.clientWidth,canvas.clientHeight);
      moodOrbit.hidden=!pos;
      if(pos){moodOrbit.style.left=pos.x+'px';moodOrbit.style.top=pos.y+'px';}
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
      // Categories stay clickable while another task runs: clicks only queue.
      // Friendship options unlock by progression, not exposed numeric gauges.
      const busy=Boolean(game.socialAction);
      for(const kind of Object.keys(SOCIAL_ACTIONS))$(kind+'-btn').disabled=busy;
      $('conversation-btn').disabled=false;
      $('humor-btn').disabled=false;
      $('shared-btn').disabled=false;
      $('romance-btn').disabled=false;
      $('conflict-btn').disabled=false;
      $('branch-btn').disabled=false; // hidden debug entry only
      const branchStatus=relationSummary(game.socialGraph,game.selectedSim,
        game.selectedSim==='alex'?'mira':'alex');
      const friendshipLocked=branchStatus.friendship==='none';
      $('friendship-btn').disabled=false; // tapping a lock explains it accessibly
      $('friendship-btn').setAttribute('aria-disabled',String(friendshipLocked));
      $('friendship-btn').textContent=friendshipLocked?'Дружба · 🔒':'Дружба';
      $('relationship-branch').textContent=branchStatus.label;
      $('romance-status').textContent=romanceStatus(game.socialGraph,game.selectedSim,
        game.selectedSim==='alex'?'mira':'alex');
      $('romance-depth').textContent=romanceLoveDescription(game.socialGraph,
        game.selectedSim,game.selectedSim==='alex'?'mira':'alex');
      $('romance-climate').textContent=romanceClimate(game.socialGraph,
        game.selectedSim,game.selectedSim==='alex'?'mira':'alex',game.minutes).label;
      if(socialMenuCategory)renderSocialMenu(false);
      renderPauseButton();
      renderQueuePanel(false);
      if(branchPicker||game.socialAction?.branchAction||!$('branch-panel').hidden)
        renderBranchPanel(false);
      if(conversationTopicPicker||game.socialAction?.conversation||!$('conversation-panel').hidden)
        renderConversationPanel(false);
      if(sharedPicker||game.socialAction?.shared||!$('shared-panel').hidden)
        renderSharedPanel(false);
      for(const need of NEEDS){
        const val=Math.round(current.needs[need]);
        const band=needPresentation(val);
        const bar=$('bar-'+need);
        bar.style.width=val+'%';
        bar.style.background=band.color;
        bar.closest('.need').dataset.level=band.id;
        $('value-'+need).textContent=val;
      }
      const moodView=moodPresentation(current);
      const moodTrack=$('mood-overview');
      moodTrack.setAttribute('aria-valuenow',String(moodView.value));
      moodTrack.setAttribute('aria-valuetext',current.mind.mood.label+' — '+moodView.description);
      moodTrack.dataset.level=moodView.id;
      $('mood-overview-title').textContent=current.mind.mood.label;
      $('mood-overview-value').textContent=moodView.value+'/100';
      $('mood-overview-bar').style.width=moodView.value+'%';
      $('mood-overview-bar').style.background=moodView.color;
      $('mood-overview-reason').textContent=moodView.description;
      $('mood-orbit').style.setProperty('--mood-tone',moodView.color);
      $('mood-label').textContent=current.mind.mood.label;
      const wish=current.mind.wish && WISHES[current.mind.wish.id];
      $('wish-label').textContent=wish ? wish.symbol+' Хочет: '+wish.label : 'Думает о будущем';
      $('mind-mood-label').textContent=current.mind.mood.label+' · '+current.mind.mood.value+'/100';
      $('mind-mood-bar').style.width=current.mind.mood.value+'%';
      $('mind-mood-bar').style.background=moodView.color;
      $('mind-mood-reasons').textContent=moodView.description;
      $('mind-wish-label').textContent=wish?.label || 'Присматривается к миру';
      $('wish-do-btn').disabled=!wish;
      if (!$('mind-panel').hidden) {
        const feelings=visibleEmotions(current.mind,current.minutes,current.personality).slice(0,3);
        $('mind-emotions').textContent=feelings.length
          ?feelings.map(e=>e.icon+' '+e.label+' · '+e.intensity+'/100 · '+e.cause+
            ' · ещё '+Math.ceil(e.remaining)+' игр. мин.').join('\n')
          :'Сейчас нет сильных переживаний';
        const perspective=getPerspective(game,game.selectedSim);
        const branch=relationSummary(game.socialGraph,game.selectedSim,
          game.selectedSim==='alex'?'mira':'alex');
        $('mind-relation-stage').textContent='Ваша связь: '+branch.label;
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
        // Long-lived story events belong to the directed graph, not the
        // short (12-item) personal mood log or the old affinity bar.
        const otherId=game.selectedSim==='alex'?'mira':'alex';
        const memoryPair=getPair(game.socialGraph,game.selectedSim,otherId);
        const dynamic=pairDynamic(memoryPair,game.selectedSim,game.minutes);
        $('mind-dynamic').textContent=dynamic.label+' · '+dynamic.description;
        const episodes=latestEpisodes(memoryPair,game.selectedSim,game.minutes,3);
        const unresolved=episodeContext(game.socialGraph,game.selectedSim,otherId,game.minutes);
        $('mind-episodes').textContent=episodes.length
          ?episodes.map(item=>'• '+item.label+' · '+readableTime(item.at).day).join('\n')+
            (unresolved.unresolved?'\n• Доверие ещё восстанавливается':'')
          :'Пока нет значимых совместных событий';
        const learned=socialKnowledgeNotes(game.socialGraph,game.selectedSim,otherId,4);
        $('mind-discovery-person').textContent='О '+getActorName(otherId);
        $('mind-discovery').textContent=learned.length
          ?learned.map(item=>'• '+item.text).join('\n')
          :'Пока не узнал(а) предпочтения собеседника';
        const cues=socialCommunicationNotes(game.socialGraph,game.selectedSim,otherId,3);
        $('mind-social-cues').textContent=cues.length
          ?cues.map(item=>'• '+item.text).join('\n')
          :'Пока не замечено особенностей общения';
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
      renderPauseButton(); // Includes the mandatory dialogue hold, not just manual pause.
      $('speed-btn').textContent=game.speed+'×';
      // Live plan is now the single source of HUD status, not a second stale label.
      renderPlanPeek();
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
      : 'Коснись жителя или мебели · МЕТКИ — названия предметов');
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
