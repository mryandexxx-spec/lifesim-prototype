import * as pc from 'playcanvas';
import {dialogueNeedsDecision,applyDialogueDecision} from './dialogue-decision.js';
import {pickWorldRayTarget} from './world-interactions.js';
import {planPreview,planTaskIcon} from './plan-preview.js';
import {residentMoodInsight,socialReactionInsight,insightLayerPolicy} from './insight-presentation.js';
import {contextualPlacement,viewMenuPlacement} from './ui-layout.js';
import {createRequiredChoiceFocus} from './required-choice-focus.js';
import {createLoadingProgress} from './loading-progress.js';
import {registerModelCache} from './model-cache.js';
import {CAMERA_INITIAL,wheelCamera} from './camera-controls.js';
import {createCameraGestureSession} from './camera-gestures.js';
import {UI_TOUR_STORAGE_KEY,createUITour,shouldShowTour} from './ui-onboarding.js';
import {HUD_COMPACT_KEY,createHudPanel} from './hud-panel.js';
import { ACTIONS, NEEDS, SAVE_KEY, AUTONOMY_WAIT_SECONDS, newGame, loadGame, chooseAction, arrive, tick, autonomousChoice, setAutonomyEnabled, advanceAutonomyWait, readableTime } from './simulation.js';
import { findPath, nearestWalkable } from './navigation.js';
import {FURNITURE_CATALOG,ORIGINAL_FURNITURE,instanceRect,furnitureRenderOrigin} from './furniture-catalog.js';
import {proposeFurnitureMove} from './furniture-layout.js';
import {F1_MOVEABLE_PREFABS,createFurnitureEditor,canMoveFurniture,
  snapFurnitureCoordinate,furnitureFloorPoint} from './furniture-editor.js';
import {FURNITURE_HOLD_MS,createFurnitureHoldGesture} from './furniture-hold.js';
import {SHOP_ITEMS,MARKET_OFFERS,findMarketPlacement,buyMarketItem,storeMarketItem,restoreMarketItem,sellMarketItem,canTradeMarketInstance} from './furniture-shop.js';
import {HOBBY_ACTIVITIES,HOBBY_SKILLS,HOBBY_CONTENT,READING_ACTIVITY_ID,READING_CONTENT_ID,READING_SKILL_ID} from './hobby-reading.js';
import {getActivityDefinition} from './activity-registry.js';
import {getSkillDefinition} from './skill-registry.js';
import {currentSkillLevel} from './skills-engine.js';
import {selectShopCatalog,shopCategoryOptions} from './shop-catalog-selector.js';
import {describeObjectQualities,shopQualitySummary} from './object-quality-presentation.js';
import {legacyObjectRegistry} from './object-legacy-adapter.js';
import {cameraPlacementPose,dragShopPlacement} from './furniture-placement-preview.js';
import {furnitureProduct,FURNITURE_APPEARANCES} from './furniture-products.js';
import {furniturePoint,furniturePose,inverseFurniturePose,furnitureBounds,
  fixtureContactLayout,furnitureInstance} from './furniture-transform.js';
import {resolveActionFurniture,furnitureActionApproach} from './furniture-catalog.js';
import { SOCIAL_ACTIONS, relationshipLabel, canStartSocial, startSocial,
  arriveSocial, cancelSocial, autonomousSocialChoice, startConversation,
  chooseSocialLine,nextSocialLine,finishSocialConversation,startSharedSocial,startBranchSocial } from './relationships.js';
import {availableSocialActions,relationSummary,BRANCH_ACTIONS,getPair,episodeContext,socialKnowledgeNotes,socialCommunicationNotes} from './social-graph.js';
import {latestEpisodes} from './social-episodes.js';
import {pairDynamic} from './social-dynamics.js';
import {romanceStatus,romanceLoveDescription,romanceClimate,romanceAvailability,
  setRomancePreference,romancePreferenceSummary} from './romance.js';
import {enqueueAction,pendingActions,removeQueuedAction,dispatchActionQueues} from './action-queue.js';
import {GIFT_CATALOG,LEISURE_CATALOG,inventoryFor,sharedDuration} from './gifts-leisure.js';
import {CONVERSATION_TOPICS,conversationOptions,conversationTranscript,
  CONVERSATION_MAX_TURNS} from './conversation-engine.js';
import { WISHES, MEMORY_TEXT, refreshMind } from './psychology.js';
import {getPerspective,latestSentiments} from './social-perspective.js';
import {visibleEmotions} from './emotion-engine.js';
import {consumeSocialReactions,clearSocialReactions} from './social-feedback.js';
import {createReactionBadges} from './reaction-badges.js';
import {needPresentation,moodPresentation,moodOrbitPoint} from './mood-presentation.js';
import {moodActionPolicy} from './mood-action-policy.js';
import {traitLabels,interestLabels} from './trait-catalog.js';
import { createCharacterRig,applyShowerAppearance } from './characters.js';
import {createMeshyVisual} from './meshy-visual.js?v=1.2q';
import {createSeatSurface,seatSlot} from './interaction-anchors.js';
import {createMiraMeshyVisual} from './meshy-mira-visual.js?v=1.2q';
import {hugMotion,hugPairTarget} from './romantic-hug.js';
import {kissMotion,kissPairTarget} from './romantic-kiss.js';
import {intimacyFrame,intimacyBedPlan} from './romantic-intimacy.js';
import {romanticEveningVignette} from './romantic-evening-scene.js';
import {planRomanticEveningTable} from './romantic-evening-stage.js';
import {planRomanticEveningSofa,romanticEveningSofaFrame,
  romanticSofaSlotOffset} from './romantic-sofa-stage.js';
import {meshVisualPreference,MESHY_VISUAL_KEY,meshSeatRuntimeSettings} from './meshy-visual-policy.js';
import { createAnimationState,stepAnimation,applyCharacterAnimation } from './animations.js';
import {WALK_PHASE_PER_METER,advanceVisualGait} from './locomotion.js';
import {SOFA_LAYOUT,SOFA_POSE,SOFA_APPROACH} from './pose-config.js';
import {createSofaTransition,advanceSofaTransition,sofaTransitionPose} from './sofa-transition.js';
import {BED_SLOTS,BED_LAYOUT} from './bed-layout.js';
import {TV_WATCH_POSE,tvScreenFrame} from './tv-interaction.js';
import {chooseTvSofa,tvSofaView} from './tv-seating.js';
import {planSharedTv,liveSharedTv} from './tv-together.js';
import {createBedTransition,advanceBedTransition,bedTransitionPose,bedBeddingPose} from './bed-transition.js';
import {FRIDGE_LAYOUT,FRIDGE_FACING_YAW,fridgeSequence,closeFridgeDoor} from './fridge-interaction.js';
import {SHOWER_LAYOUT,createShowerTransition,advanceShowerTransition} from './shower-interaction.js';
import {TOILET_LAYOUT,createToiletTransition,advanceToiletTransition} from './toilet-interaction.js';
import {createPrivacyMosaicMaterial} from './privacy-mosaic.js';
import { HOUSEHOLD_IDS, RESIDENT_NAMES, newHousehold, loadHousehold, getActor, getActorName,
  selectResident, furnitureAvailable, chooseResidentAction, setHouseholdAutonomy, tickHousehold,
  residentAutonomousChoice,bedDestinationFor,preemptAutomaticForManual } from './household.js';

// A fully code-authored room: no PlayCanvas Editor or 3D asset pipeline required.
const $ = id => document.getElementById(id);
const canvas = $('game-canvas');
const intimacyVeil=$('intimacy-veil');
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

// Optional first-use explanation does not pause, enqueue or persist gameplay.
// Only an independent localStorage *UI preference* tracks whether it was read.
const uiTour=createUITour();
let tourOpen=false;
function closeTour({remember=true,restoreFocus=false}={}){
  if(!tourOpen)return;
  tourOpen=false;
  $('tour-panel').hidden=true;
  if(remember){
    try{localStorage.setItem(UI_TOUR_STORAGE_KEY,'done');}
    catch{/* Safari private browsing: play without persistent UI hints. */}
  }
  if(restoreFocus)$('view-toggle').focus({preventScroll:true});
}
function renderTour(){
  const step=uiTour.current();
  $('tour-progress').textContent=uiTour.progress();
  $('tour-title').textContent=step.title;
  $('tour-body').textContent=step.body;
  $('tour-tip').textContent=step.hint;
  $('tour-next').textContent=uiTour.index()===uiTour.length-1?'Играть':'Дальше';
}
function openTour(){
  if(dialogueNeedsDecision(game))return false;
  uiTour.reset();renderTour();
  tourOpen=true;$('tour-panel').hidden=false;
  $('tour-panel').focus({preventScroll:true});
  return true;
}
$('tour-close').addEventListener('click',()=>closeTour({restoreFocus:true}));
$('tour-skip').addEventListener('click',()=>closeTour({restoreFocus:true}));
$('tour-next').addEventListener('click',()=>{
  if(uiTour.next())renderTour();
  else closeTour({restoreFocus:true});
});
$('tour-replay').addEventListener('click',()=>{
  setViewOpen(false);
  closeInsightPanel();closeMindPanel();closeSocialContext();select(null);
  queueVisible=false;renderQueuePanel(true);
  openTour();
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&tourOpen&&!dialogueNeedsDecision(game)){
    event.preventDefault();closeTour({restoreFocus:true});
  }
},true);
document.addEventListener('pointerdown',event=>{
  if(!tourOpen)return;
  if($('tour-panel').contains(event.target)||$('tour-replay').contains(event.target))return;
  closeTour({remember:true});
},true);

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
    closeTour();closeInsightPanel();queueVisible=false;renderQueuePanel(true);
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
  toilet: { title: 'Унитаз', category: 'Ванная', description: 'Приватное использование туалета восстановит потребность', icon: 'WC', anchor: [-1.65, 1.28, 3.14] },
  sofa: { title: 'Диван', category: 'Гостиная', description: 'Отдых повышает уровень досуга', icon: '♫', anchor: [1.35, 1.38, 1.54] },
  tv: { title: 'Телевизор', category: 'Гостиная', description: 'Сядет на свободный диван с видом на экран или посмотрит стоя, если мест нет', icon: '▣', anchor: [3.5, 1.42, .36] },
  hobby: { title: 'Книжный шкаф', category: 'Гостиная',
    description: 'Подойти к шкафу, выбрать историю и почитать. Досуг растёт во время чтения, а навык — от практики.',
    icon: '📖', anchor: [0,1.5,0] }
};

let furnishMode=false; // F1 is an independent, unsaved UI mode; manual pause is untouched.
let selected = null;
let selectedFurnitureInstanceId=null; // action-specific target, never in household save
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
let socialAnchor=null; // CSS position from tapped world resident, never serialized.
let socialMenuDisplayKey='';
let queueVisible=false;
let queueDisplayKey='';
let planPeekKey='';
let insightOpen=false,insightDisplayKey='';
let socialFlashLeft=0;
let dispatchPlannedActions=()=>[];
let debugTapCount=0;
let debugTapAt=0;
let resetRuntime = () => {};
let restartAutonomyWait = () => {};
let onManualCommandQueued = () => {};
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
  if(task.type==='activity')return getActivityDefinition(HOBBY_ACTIVITIES,task.activityId)?.label||'Хобби';
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
  if(command.type==='object'||command.type==='activity'){
    const actionId=command.type==='activity'?'hobby':command.actionId;
    const target=resolveActionFurniture(game.world,actionId,command.targetInstanceId);
    if(!target){toast('Этот предмет недоступен');return false;}
    command={...command,targetInstanceId:target.instanceId};
  }
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
  // A manual task has authority over the addressed person's spontaneous
  // action, including being the partner of an autonomous conversation.
  // Don't cancel anything if enqueue failed; keep older MANUAL plans intact.
  onManualCommandQueued(preemptAutomaticForManual(game,residentId));
  // Successful commands are visible in the queue counter, not in a floating
  // overlay over the game. Screen readers receive a nonblocking confirmation.
  renderQueuePanel(true);
  $('queue-feedback').textContent=getActorName(residentId)+': добавлено в очередь — '+
    taskLabel({...task,residentId});
  save(true);
  if(command.type!=='object'&&command.type!=='activity'){
    // A confirmed queue entry closes only presentation, never the action.
    socialContextVisible=false;socialAnchor=null;
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
// Explanation reads only the selected actor's own verified state and viewpoint.
function closeInsightPanel(){
  insightOpen=false;
  $('insight-panel').hidden=true;
  $('insight-toggle').setAttribute('aria-expanded','false');
}
function renderInsightPanel(force=true){
  if(!insightOpen)return;
  const partnerId=HOUSEHOLD_IDS.find(id=>id!==game.selectedSim);
  const info=residentMoodInsight(selectedActor(),{
    residentName:selectedName(),world:game.world,
    partnerName:partnerId?getActorName(partnerId):null,
    relationLabel:partnerId
      ?relationSummary(game.socialGraph,game.selectedSim,partnerId)?.label:null,
    perspective:getPerspective(game,game.selectedSim)
  });
  const key=JSON.stringify([game.selectedSim,info]);
  if(!force&&key===insightDisplayKey)return;
  insightDisplayKey=key;
  $('insight-title').textContent='Почему '+info.name+' так себя чувствует?';
  $('insight-summary').textContent=info.mood+' · '+info.summary;
  const list=$('insight-causes');list.replaceChildren();
  for(const item of info.needs){
    const card=document.createElement('div');card.className='insight-cause';
    const glyph=document.createElement('span');glyph.className='insight-cause-symbol';
    glyph.setAttribute('aria-hidden','true');glyph.textContent=item.symbol;
    const content=document.createElement('span');content.className='insight-cause-text';
    const title=document.createElement('strong');title.textContent=item.title;
    const detail=document.createElement('small');detail.textContent=item.detail;
    content.append(title,detail);card.append(glyph,content);list.append(card);
  }
  // M5 ambient causes are calculated from actual F1-layout instances.
  const ambient=$('insight-environment');
  ambient.replaceChildren();ambient.hidden=!info.environment?.length;
  for(const cause of info.environment||[]){
    const line=document.createElement('div');line.className='insight-cause';
    const glyph=document.createElement('span');glyph.className='insight-cause-symbol';
    glyph.setAttribute('aria-hidden','true');glyph.textContent=cause.symbol;
    const copy=document.createElement('span');copy.className='insight-cause-text';
    const title=document.createElement('strong');title.textContent=cause.title;
    const detail=document.createElement('small');detail.textContent=cause.detail;
    copy.append(title,detail);line.append(glyph,copy);ambient.append(line);
  }
  const feeling=$('insight-feeling');
  feeling.replaceChildren();feeling.hidden=!info.feeling;
  if(info.feeling){
    const title=document.createElement('strong');title.textContent=
      info.feeling.symbol+' '+info.feeling.title;
    const detail=document.createElement('small');detail.textContent=info.feeling.detail;
    feeling.append(title,detail);
  }
  const relationship=$('insight-relationship');
  relationship.replaceChildren();relationship.hidden=!info.relation;
  if(info.relation){
    const title=document.createElement('strong');
    title.textContent=info.relation.title+' · '+info.relation.status;
    const detail=document.createElement('small');
    detail.textContent=info.relation.recent;
    relationship.append(title,detail);
  }
  $('insight-guidance').textContent=info.guidance;
}
$('insight-toggle').addEventListener('click',()=>{
  if(dialogueNeedsDecision(game))return;
  const open=!insightOpen;
  if(open){
    setViewOpen(false);closeSocialContext();closeMindPanel();select(null);
    queueVisible=false;renderQueuePanel(true);
  }
  insightOpen=open;
  $('insight-panel').hidden=!insightOpen;
  $('insight-toggle').setAttribute('aria-expanded',String(insightOpen));
  if(insightOpen)renderInsightPanel(true);
});
$('insight-close').addEventListener('click',()=>{
  closeInsightPanel();$('insight-toggle').focus({preventScroll:true});
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&insightOpen&&!dialogueNeedsDecision(game)){
    event.preventDefault();closeInsightPanel();
    $('insight-toggle').focus({preventScroll:true});
  }
},true);

function closeMindPanel() {
  $('mind-panel').hidden = true;
  $('mind-toggle').setAttribute('aria-expanded', 'false');
}
$('mind-toggle').addEventListener('click', () => {
  const open = $('mind-panel').hidden;
  $('mind-panel').hidden = !open;
  $('mind-toggle').setAttribute('aria-expanded', String(open));
  if (open){
    closeInsightPanel();setViewOpen(false);closeSocialContext();
    queueVisible=false;renderQueuePanel(true);select(null);
  }
});
$('mind-close').addEventListener('click', closeMindPanel);
$('wish-do-btn').addEventListener('click', () => {
  const id = selectedActor().mind?.wish?.id;
  if (id && scheduleCommand({type:'object',actionId:id})) {
    closeMindPanel();
    toast(selectedName()+': в очереди желание — '+WISHES[id].label.toLowerCase());
  }
});
function select(id,instanceId=null) {
  if (id){
    closeInsightPanel();closeMindPanel();closeSocialContext();setViewOpen(false);
    queueVisible=false;renderQueuePanel(true);
  }
  selected = id;
  selectedFurnitureInstanceId=['sofa','bed','tv','hobby'].includes(id)&&typeof instanceId==='string'
    ?instanceId:null;
  for (const [key, button] of Object.entries(markers)) button.classList.toggle('active', key === id);
  $('action-sheet').hidden = !id;
  $('hint').hidden = Boolean(id);
  if (!id) return;
  $('action-category').textContent = META[id].category;
  $('action-title').textContent = META[id].title;
  $('action-description').textContent = selectedFurnitureInstanceId
    ?(id==='bed'?'Сон в выбранной кровати · две независимые стороны и свой маршрут':
      id==='tv'?'Просмотр этого телевизора · с дивана, если он свободен и экран виден':
      'Отдых на выбранном диване · собственный маршрут и место посадки')
    :META[id].description;
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
  const command=selected==='hobby'
    ?{type:'activity',activityId:READING_ACTIVITY_ID,contentId:READING_CONTENT_ID,
      ...(selectedFurnitureInstanceId?{targetInstanceId:selectedFurnitureInstanceId}:{})}
    :{type:'object',actionId:selected,
      ...(selectedFurnitureInstanceId?{targetInstanceId:selectedFurnitureInstanceId}:{})};
  if (scheduleCommand(command)) {
    select(null);
  }
});
// Legacy buttons remain hidden for old UI references; queue rather than interrupt.
for(const kind of Object.keys(SOCIAL_ACTIONS))
  $(kind+'-btn').addEventListener('click',()=>queuedSocial(kind));
// One interaction anchor serves categories and their second-level options.
// Position within the usable area: avoid topbar, mini-plan and bottom needs.
function placeSocialPopover(panel){
  if(!socialAnchor||panel.hidden||panel.classList.contains('dialogue-required')){
    panel.classList.remove('context-popover');
    return;
  }
  panel.classList.add('context-popover');
  const w=canvas.clientWidth||window.innerWidth,h=canvas.clientHeight||window.innerHeight;
  const landscape=h<560;
  const mobile=w<=700;
  const pos=contextualPlacement({
    anchorX:socialAnchor.x,anchorY:socialAnchor.y,
    viewportWidth:w,viewportHeight:h,
    panelWidth:panel.offsetWidth||340,panelHeight:panel.offsetHeight||280,
    topInset:landscape?72:mobile?116:102,
    bottomInset:Math.max(landscape?122:mobile?170:144,
      Math.ceil($('dashboard').getBoundingClientRect().height)+12)
  });
  panel.style.setProperty('--context-x',pos.x+'px');
  panel.style.setProperty('--context-y',pos.y+'px');
  panel.style.setProperty('--context-max-height',pos.maxHeight+'px');
}
function relayoutSocialPanels(){
  for(const id of ['social-context','social-menu-panel','shared-panel',
    'conversation-panel','branch-panel'])placeSocialPopover($(id));
}
const scheduleSocialPosition=()=>requestAnimationFrame(relayoutSocialPanels);
window.addEventListener('resize',scheduleSocialPosition);
function renderSocialContext(){
  const open=socialContextVisible&&!socialMenuCategory&&!conversationTopicPicker&&
    !sharedPicker&&!branchPicker&&!dialogueNeedsDecision(game);
  $('social-context').hidden=!open;
  if(open)scheduleSocialPosition();
  else $('social-context').classList.remove('context-popover');
}
function closeSocialContext(){
  socialContextVisible=false;
  socialAnchor=null;
  closeSocialPickers();
  renderSocialContext();
}
function openSocialContext(pos){
  if(dialogueNeedsDecision(game))return;
  closeInsightPanel();queueVisible=false;renderQueuePanel(true);
  select(null);closeMindPanel();closeSocialPickers();setViewOpen(false);
  const rect=canvas.getBoundingClientRect();
  socialAnchor=pos?{x:pos.x-rect.left,y:pos.y-rect.top}:null;
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
  const peer=game.selectedSim==='alex'?'mira':'alex';
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
  if(!category){$('social-menu-panel').classList.remove('context-popover');return;}
  scheduleSocialPosition();
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
    // R3 settings belong only to the active resident. No automatic
    // acceptance or synthetic interaction is issued from this menu.
    const chosen=game.selectedSim;
    const prefs=romancePreferenceSummary(game.socialGraph,chosen,targetId);
    if(prefs){
      const heading=document.createElement('p');
      heading.className='shared-progress-text';
      heading.textContent='Личные границы '+getActorName(chosen)+
        ' · только для выбранного жителя';
      options.append(heading);
      for(const [kind,label,values] of [
        ['boundary','Романтическое общение',['open','closed']],
        ['touchBoundary','Прикосновения',['open','closed']],
        ['exclusivity','Ожидание верности',['exclusive','open']]
      ]){
        const value=prefs[kind];
        const detail=kind==='exclusivity'
          ?value==='exclusive'?'ожидает исключительности':'допускает флирт без обязательств'
          :value==='closed'?'пока не готов(а)':'открыт(а)';
        const next=values.find(v=>v!==value);
        options.append(conversationButton(label+': '+detail+' · изменить',()=>{
          if(dialogueNeedsDecision(game))return;
          if(setRomancePreference(game.socialGraph,chosen,targetId,kind,next)){
            save(true);renderSocialMenu(true);
            toast('Границы '+getActorName(chosen)+' обновлены');
          }
        }));
      }
      if(prefs.jealousy>0){
        const note=document.createElement('p');
        note.className='shared-progress-text';
        note.textContent='Переживает из-за замеченного нарушения договорённостей. '+
          'Откровенный разговор поможет восстановить доверие.';
        options.append(note);
      }
    }
    const romanceActions=availableSocialActions(game.socialGraph,game.selectedSim,targetId,game.minutes)
      .filter(action=>action.category==='romance')
      .map(action=>action.id==='romance.intimacy'&&!intimacyBedPlan(game,game.selectedSim)
        ?{...action,enabled:false,reason:'Нужна свободная двуспальная кровать'}:action);
    for(const action of romanceActions){
      if(action.enabled)add(action.label,{type:'branch',actionId:action.id});
    }
    if(!romanceActions.some(action=>action.enabled)){
      const hint=document.createElement('p');
      hint.className='shared-progress-text';
      hint.textContent=romanceActions[0]?.reason||'Для романтики пока не время';
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
    if(s.shared)return s.shared.choiceId==='tv'?'Смотрит телевизор вместе':
      s.shared.mode==='gift'?'Вручает или принимает подарок':'Проводит время вместе';
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
  if(dialogueNeedsDecision(game))return;
  closeInsightPanel();setViewOpen(false);closeSocialContext();select(null);closeMindPanel();
  queueVisible=!queueVisible;
  renderQueuePanel(true);
});
function renderQueuePanel(force=true){
  renderPlanPeek();
  const residentId=game.selectedSim;
  const pending=pendingActions(game.actionQueues,residentId);
  const active=activeTaskLabel(residentId);
  const key=JSON.stringify([queueVisible,residentId,pending,active,game.socialAction?.phase,
    getActor(game,residentId).action?.phase,
    (game.socialAction?.eveningStage||game.socialAction?.eveningSofa)&&
      game.socialAction.phase==='using'
      ?Math.floor(game.socialAction.elapsed/3):null]);
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
  const evening=game.socialAction?.branchAction?.id==='romance.evening'&&
    (game.socialAction?.eveningStage||game.socialAction?.eveningSofa);
  if(evening&&active){
    const atSofa=Boolean(game.socialAction.eveningSofa);
    const detail=document.createElement('div');
    detail.className='shared-progress-text';
    detail.textContent=game.socialAction.phase==='walking'
      ?'Оба жителя идут к '+(atSofa?'дивану':'столику')+' · ждём встречи'
      :game.socialAction.branchAction.eveningConsent===true
        ?'Вечер '+(atSofa?'на диване':'у столика')+' · '+Math.round(Math.min(1,
          game.socialAction.elapsed/30)*100)+'%':'Приглашение не принято';
    activeEl.append(detail);
  }
  if(active){
    const stop=document.createElement('button');stop.type='button';
    stop.textContent='Прервать текущее действие';
    stop.addEventListener('click',()=>{
      const social=game.socialAction;
      if(social&&(social.initiator===residentId||social.partner===residentId))
        cancelSocial(game);
      else {
        getActor(game,residentId).action=null;
        getActor(game,residentId).activitySession=null;
      }
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
  if(dialogueNeedsDecision(game))return;
  closeInsightPanel();setViewOpen(false);closeSocialContext();select(null);closeMindPanel();
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
  if(open)scheduleSocialPosition();
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
  if(open&&!socialMenuCategory)scheduleSocialPosition();
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
  for(const [id,def] of Object.entries(LEISURE_CATALOG)){
    if(id==='tv'){
      // Keep a physical screen ID in the FIFO; the TV may later be moved,
      // sold or occupied, but the command must never silently change TVs.
      for(const item of game.world.furniture.instances.filter(i=>
        i.prefabId==='tv'&&i.location==='home')){
        options.append(conversationButton(def.symbol+' '+def.label+
          (item.instanceId==='home-tv-1'?' · Домашний ТВ':' · Купленный ТВ'),()=>{
          if(queuedSocial('shared',{mode:'leisure',choiceId:'tv',
            targetInstanceId:item.instanceId})){
            sharedPicker=false;renderSharedPanel();
          }
        }));
      }
      continue;
    }
    options.append(conversationButton(def.symbol+' '+def.label,()=>{
      if(queuedSocial('shared',{mode:'leisure',choiceId:id})){
        sharedPicker=false;renderSharedPanel();
      }
    }));
  }
}
function conversationButton(label,callback,secondary=false){
  const button=document.createElement('button');
  button.type='button';button.textContent=label;
  button.className=secondary?'conversation-option secondary':'conversation-option';
  button.addEventListener('click',callback);
  return button;
}
// The mandatory UI is the ONLY interactive subtree while a reply is owed.
const requiredChoiceFocus=createRequiredChoiceFocus({
  root:document.querySelector('.app-shell'),
  panel:$('conversation-panel'),
  backdrop:$('dialogue-backdrop'),
  doc:document,
  restoreFallback:$('plan-peek')
});
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
  if(enteringRequired){
    closeTour();
    // A required answer supersedes every optional popover without cancelling
    // its REAL underlying FIFO action or affecting manual pause state.
    setViewOpen(false);closeInsightPanel();
    socialContextVisible=false;socialAnchor=null;socialMenuCategory=null;
    sharedPicker=false;branchPicker=false;
    renderSocialContext();renderSocialMenu();renderSharedPanel();renderBranchPanel();
  }
  panel.classList.toggle('dialogue-required',required);
  $('conversation-close').hidden=required;
  $('dialogue-backdrop').hidden=!required;
  if(required){
    panel.setAttribute('role','dialog');
    panel.setAttribute('aria-modal','true');
    panel.setAttribute('aria-labelledby','conversation-title');
    panel.setAttribute('aria-describedby','conversation-subtitle');
  }else {panel.removeAttribute('aria-modal');panel.removeAttribute('aria-describedby');}
  const key=JSON.stringify([conversationTopicPicker,required,socialMenuCategory,
    game.selectedSim,game.paused,s?.phase,session?.topic,session?.phase,session?.turns]);
  if(!force&&key===conversationDisplayKey)return;
  conversationDisplayKey=key;
  const open=conversationTopicPicker||required;
  const options=$('conversation-options');
  const formerFocusIndex=required
    ?Array.from(options.querySelectorAll('button')).indexOf(document.activeElement):-1;
  panel.hidden=!open||(!required&&Boolean(socialMenuCategory));
  if(open&&!required&&!socialMenuCategory)scheduleSocialPosition();
  requiredChoiceFocus.activate(required);
  if(!open)return;
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
  if(s.phase!=='using'){
    if(required)requiredChoiceFocus.focusChoice(enteringRequired?0:formerFocusIndex);
    return;
  }
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
  if(required)requiredChoiceFocus.focusChoice(enteringRequired?0:formerFocusIndex);
}
renderConversationPanel();
renderSharedPanel();
renderBranchPanel();
renderSocialMenu();
renderQueuePanel();
renderSocialContext();
function renderPauseButton(){
  const blocked=dialogueNeedsDecision(game);
  const paused=game.paused||blocked||furnishMode;
  $('pause-icon').textContent=paused?'▶':'Ⅱ';
  $('pause-btn').setAttribute('aria-label',blocked
    ?'Выбери реплику: игровое время остановлено'
    :furnishMode?'Обстановка: игровое время остановлено'
      :paused?'Продолжить':'Пауза');
}
$('pause-btn').addEventListener('click', () => {
  if(dialogueNeedsDecision(game)||furnishMode)return;
  game.paused = !game.paused;
  renderPauseButton();
  toast(game.paused ? 'Симуляция на паузе' : 'Время снова идёт');
});
$('speed-btn').addEventListener('click', () => {
  if(furnishMode)return;
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
  if(furnishMode)return;
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
    selectResident(game,id);closeInsightPanel();
    conversationTopicPicker=false;sharedPicker=false;branchPicker=false;
    socialMenuCategory=null;socialContextVisible=false;socialAnchor=null;
    select(null); closeMindPanel(); updateResidentPicker();renderSocialContext();
    renderConversationPanel();renderSharedPanel();renderBranchPanel();
    renderSocialMenu();renderQueuePanel();save(true);
    toast('Теперь управляешь: '+selectedName());
  });
}
updateResidentPicker();
// Presentation-only HUD preference: never touches simulation or household saves.
createHudPanel({
  panel:$('dashboard'),toggle:$('hud-toggle'),
  readPreference:()=>localStorage.getItem(HUD_COMPACT_KEY),
  writePreference:value=>localStorage.setItem(HUD_COMPACT_KEY,value),
  onChange:compact=>{
    if(compact){closeMindPanel();closeInsightPanel();}
    requestAnimationFrame(relayoutSocialPanels);
  }
});
$('save-btn').addEventListener('click', () => save());
$('reset-btn').addEventListener('click', () => {
  if (!window.confirm('Начать новую жизнь? Текущее сохранение будет заменено.')) return;
  const enabled = game.autonomy.enabled;
  game = newHousehold();
  setHouseholdAutonomy(game, enabled); // Keep the player's chosen play style.
  closeInsightPanel();resetRuntime(); restartAutonomyWait(); updateAutoButton(); updateResidentPicker();
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
  // Data-only SKU colorways reuse the original prefab, navmesh and animation.
  // Only copied mesh instances are tinted; the authored original is unchanged.
  const variantMaterials=new Map();
  const applyItemAppearance=(node,itemDefinitionId)=>{
    const style=FURNITURE_APPEARANCES[furnitureProduct(itemDefinitionId)?.appearanceId];
    if(!style||!node)return;
    const visit=part=>{
      const color=style[part.name];
      if(color&&part.render){
        if(!variantMaterials.has(color))variantMaterials.set(color,mat(color));
        const material=variantMaterials.get(color);
        part.render.material=material;
        for(const mesh of part.render.meshInstances||[])mesh.material=material;
      }
      for(const child of part.children||[])visit(child);
    };
    visit(node);
  };
  const decorNodes=new Map();
  const decorTemplates=new Map();
  let decorDrawing=null;
  let refreshSofaSeat=()=>{};
  const withDecor=(prefabId,render)=>{
    const origin=furnitureRenderOrigin(prefabId);
    if(!origin)throw new Error('Unknown furniture renderer origin: '+prefabId);
    const templateOnly=origin.location==='template';
    const current=templateOnly?origin:
      game.world.furniture.instances.find(i=>i.instanceId===origin.instanceId)||origin;
    const node=new pc.Entity('F1 furniture / '+origin.instanceId);
    app.root.addChild(node);
    node.setPosition(current.x,0,current.z);
    node.setEulerAngles(0,-current.yaw,0);
    // Hidden purchased-item templates must never become owned world fixtures.
    if(!templateOnly)decorNodes.set(origin.instanceId,node);
    decorTemplates.set(prefabId,node);
    node.enabled=!templateOnly&&current.location==='home';
    const previous=decorDrawing;
    decorDrawing={origin,node};
    try{render();}finally{decorDrawing=previous;}
  };
  const updateDecorNodes=(previewId=null,previewPose=null)=>{
    const items=game.world.furniture.instances;
    for(const item of items){
      if(decorNodes.has(item.instanceId))continue;
      const template=decorTemplates.get(item.prefabId);
      if(!template||!MARKET_OFFERS.some(s=>s.prefabId===item.prefabId))continue;
      const node=template.clone();
      node.name='F2 purchased / '+item.instanceId;
      if(item.itemDefinitionId)applyItemAppearance(node,item.itemDefinitionId);
      app.root.addChild(node);
      decorNodes.set(item.instanceId,node);
    }
    for(const [instanceId,node] of decorNodes){
      const item=items.find(i=>i.instanceId===instanceId);
      if(!item){
        if(instanceId.startsWith('shop-')){node.destroy();decorNodes.delete(instanceId);}
        else node.enabled=false;
        continue;
      }
      node.enabled=item.location==='home';
      if(!node.enabled)continue;
      const pose=instanceId===previewId&&previewPose?previewPose:item;
      node.setPosition(pose.x,0,pose.z);
      node.setEulerAngles(0,-pose.yaw,0);
    }
    refreshSofaSeat();
  };
  const primitive = (type,name,x,y,z,sx,sy,sz,material,parent=app.root) => {
    const entity = new pc.Entity(name);
    entity.addComponent('render',{ type, material });
    // Authored world-space geometry is converted once to a stable prefab-local
    // scene transform. Existing animation roots remain unchanged and fixed.
    const grouped=decorDrawing&&parent===app.root;
    entity.setLocalPosition(grouped?x-decorDrawing.origin.x:x,y,
      grouped?z-decorDrawing.origin.z:z);
    entity.setLocalScale(sx,sy,sz);
    (grouped?decorDrawing.node:parent).addChild(entity);
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
    hitVolumes.push({kind,id,
      fixtureType:decorDrawing?.origin.prefabId||null,
      bounds:{
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

  // A physical bed is a single transform, including two separately reserved quilts.
  const quilts={};
  withDecor('bed',()=>{
    touchBox('bed','bed frame',BED_LAYOUT.centerX,BED_LAYOUT.frameY,BED_LAYOUT.centerZ,
    2.42,BED_LAYOUT.frameHeight,2.52,M.wood);
  touchBox('bed','mattress',BED_LAYOUT.centerX,BED_LAYOUT.mattressY,BED_LAYOUT.centerZ,
    BED_LAYOUT.width,BED_LAYOUT.mattressHeight,BED_LAYOUT.depth,M.white);
  // Two separate quilts cover the two independent sleepers.
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
  });
  withDecor('nightstand',()=>{
    box('side table',-4.23,.38,-3.35,.65,.64,.68,M.paleWood);
    cylinder('lamp base',-4.23,.76,-3.35,.22,.10,.22,M.white);
    cylinder('lamp stem',-4.23,.94,-3.35,.055,.32,.055,M.slate);
    cylinder('lamp shade',-4.23,1.17,-3.35,.45,.32,.45,M.yellow);
  });

  // The door pivot and shelf are children of the same moved fridge instance.
  let fridgeFood,fridgeHinge;
  withDecor('fridge',()=>{
  touchBox('fridge','fridge',3.43,.99,-2.85,1.12,1.98,1.14,M.cream);
  box('fridge shadow seam',3.43,1.49,-2.26,1.06,.035,.03,M.trim);
  box('fridge lower handle',3.01,.64,-2.20,.055,.27,.075,M.slate);
  // Shelf is in front of the fridge body but behind the closed door.
  box('fridge interior',3.43,1.46,-2.247,1.03,.85,.045,M.blue);
  box('fridge interior shelf',3.43,1.25,-2.18,1.02,.045,.11,M.cream);
  fridgeFood=ball('fridge portion on shelf',3.24,1.38,-2.22,.20,.18,.20,M.yellow);
  fridgeFood.enabled=false;
  // A real right-side hinge opens away from the resident at left approach.
  fridgeHinge = new pc.Entity('Fridge door hinge');
  decorDrawing.node.addChild(fridgeHinge);
  fridgeHinge.setLocalPosition(FRIDGE_LAYOUT.hinge.x-decorDrawing.origin.x,
    FRIDGE_LAYOUT.hinge.y,FRIDGE_LAYOUT.hinge.z-decorDrawing.origin.z);
  box('fridge upper door',-.55,0,.055,FRIDGE_LAYOUT.doorWidth,.91,.08,M.cream,fridgeHinge);
  box('door handle',-.94,.07,.13,.05,.31,.055,M.slate,fridgeHinge);
  });
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
  // Complete seat and contact shell share the saved physical sofa instance.
  withDecor('sofa',()=>{
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
  });
  // Leave a navigable front approach so residents do not cross the sofa arm.
  withDecor('table',()=>{
    // The blocker for ray-picking now follows the instance footprint below.
    box('coffee table top',1.34,.40,-.26,1.47,.12,.73,M.paleWood);
    for(let x of [.74,1.94]) for(let z of [-.53,.01])
      cylinder('table leg',x,.20,z,.085,.33,.085,M.wood);
    // R5b original tiny tabletop arrangement, parented to the real table.
    // Template clones follow purchased furniture, rotations, storage and sales.
    const dateSet=new pc.Entity('R5b romantic tableware');
    decorDrawing.node.addChild(dateSet);
    dateSet.enabled=false;
    const candleGlow=mat('#ffd39c',{emissive:.65});
    const bouquet=mat('#d17f93');
    cylinder('R5b candle plate',0,.482,0,.25,.025,.25,M.yellow,dateSet);
    cylinder('R5b candle wax',0,.563,0,.10,.14,.10,M.cream,dateSet);
    ball('R5b candle flame',0,.68,0,.078,.12,.078,candleGlow,dateSet);
    cylinder('R5b cup left',-.35,.526,.09,.16,.13,.16,M.peach,dateSet);
    cylinder('R5b cup right',.35,.526,.09,.16,.13,.16,M.mint,dateSet);
    cylinder('R5b flower vase',0,.522,-.19,.13,.12,.13,M.white,dateSet);
    cylinder('R5b flower stem',0,.635,-.19,.026,.16,.026,M.darkGreen,dateSet);
    ball('R5b flower petal 1',-.065,.721,-.19,.14,.095,.11,bouquet,dateSet);
    ball('R5b flower petal 2',.062,.706,-.20,.13,.085,.11,M.pink,dateSet);
  });
  // One shadowless warm light plus five tiny accents, all opt-in during the
  // ACTUAL consented shared evening; no extra saved or collided entities.
  const dateLight=new pc.Entity('R5b warm date light');
  dateLight.addComponent('light',{type:'omni',color:new pc.Color(.98,.79,.62),
    intensity:.28,range:2.6,castShadows:false});
  app.root.addChild(dateLight);dateLight.enabled=false;
  const dateSparkMaterials=[mat('#ffd0a1',{emissive:.7}),
    mat('#eeb3b4',{emissive:.55})];
  const dateAccents=Array.from({length:5},(_,i)=>{
    const glow=ball('R5b evening sparkle '+i,0,0,0,.08,.08,.08,dateSparkMaterials[i%2]);
    glow.enabled=false;return glow;
  });
  withDecor('tv',()=>{
    touchBox('tv','tv console',3.91,.41,.37,.66,.73,1.69,M.paleWood);
    box('tv screen',3.52,1.35,.36,.16,1.07,1.62,M.dark);
    touchBox('tv','tv glass',3.42,1.35,.36,.045,.89,1.44,M.slate);
    // Cheap original broadcast colours, no copyrighted footage or heavy video.
    const program=box('tv program',3.386,1.35,.36,.025,.77,1.26,M.mint);
    program.enabled=false;
    box('tv stand',3.67,.80,.37,.35,.12,.28,M.black);
  });

  // Share one opaque mosaic material between shower and toilet privacy shells.
  const mosaicMaterial=createPrivacyMosaicMaterial(pc,app.graphicsDevice);
  // All shower pieces and the opaque privacy group follow ONE instance.
  let showerPrivacy;
  withDecor('shower',()=>{
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
  showerPrivacy=new pc.Entity('Floating mosaic shower privacy');
  decorDrawing.node.addChild(showerPrivacy);
  showerPrivacy.setLocalPosition(SHOWER_LAYOUT.interior.x-decorDrawing.origin.x,
    0,SHOWER_LAYOUT.interior.z-decorDrawing.origin.z);
  const veilWidth=SHOWER_LAYOUT.privacyWidth*.89;
  const veilDepth=SHOWER_LAYOUT.privacyDepth*.89;
  cylinder('shower mosaic cloud',0,1.25,0,veilWidth,1.95,veilDepth,
    mosaicMaterial,showerPrivacy);
  ball('shower mosaic top',0,2.23,0,veilWidth,.32,veilDepth,
    mosaicMaterial,showerPrivacy);
  ball('shower mosaic base',0,.27,0,veilWidth,.30,veilDepth,
    mosaicMaterial,showerPrivacy);
  showerPrivacy.enabled=false;
  });

  // M4: real ceramic toilet, own reachable front and opaque privacy.
  // Each physical component registers its rotated 3D picking AABB.
  let toiletPrivacy;
  withDecor('toilet',()=>{
  touchBox('toilet','toilet porcelain pedestal',TOILET_LAYOUT.interior.x,.28,
    TOILET_LAYOUT.interior.z,.70,.51,.76,M.white);
  touchBox('toilet','toilet seat',TOILET_LAYOUT.interior.x,.52,
    TOILET_LAYOUT.interior.z-.06,.76,.08,.69,M.cream);
  touchBox('toilet','toilet cistern',TOILET_LAYOUT.interior.x,.86,
    TOILET_LAYOUT.interior.z+.36,.78,.90,.28,M.white);
  touchBox('toilet','toilet flush',TOILET_LAYOUT.interior.x,1.33,
    TOILET_LAYOUT.interior.z+.36,.16,.045,.14,M.slate);
  cylinder('toilet ceramic opening',TOILET_LAYOUT.interior.x,.54,
    TOILET_LAYOUT.interior.z-.06,.50,.02,.47,M.blue);
  toiletPrivacy=new pc.Entity('Original opaque toilet privacy mosaic');
  decorDrawing.node.addChild(toiletPrivacy);
  toiletPrivacy.setLocalPosition(TOILET_LAYOUT.interior.x-decorDrawing.origin.x,
    0,TOILET_LAYOUT.interior.z-decorDrawing.origin.z);
  cylinder('toilet privacy shell',0,1.18,0,
    TOILET_LAYOUT.privacyWidth,1.98,TOILET_LAYOUT.privacyDepth,
    mosaicMaterial,toiletPrivacy);
  ball('toilet privacy top',0,2.22,0,
    TOILET_LAYOUT.privacyWidth,.34,TOILET_LAYOUT.privacyDepth,
    mosaicMaterial,toiletPrivacy);
  ball('toilet privacy base',0,.22,0,
    TOILET_LAYOUT.privacyWidth,.28,TOILET_LAYOUT.privacyDepth,
    mosaicMaterial,toiletPrivacy);
  toiletPrivacy.enabled=false;
  });

  // H1: the original bookcase is a hidden prefab template, not free furniture.
  // Purchased instances clone this complete shelf, including physical books.
  withDecor('bookcase',()=>{
    box('bookcase back',0,1.03,-.15,1.04,1.95,.13,M.wood);
    box('bookcase left side',-.48,1.03,0,.085,1.95,.53,M.paleWood);
    box('bookcase right side',.48,1.03,0,.085,1.95,.53,M.paleWood);
    box('bookcase top',0,2.01,0,1.04,.10,.54,M.paleWood);
    box('bookcase bottom',0,.09,0,1.04,.13,.54,M.paleWood);
    for(const y of [.53,1.06,1.59])
      box('bookcase shelf',0,y,0,1.01,.075,.52,M.paleWood);
    const bookColors=[M.mint,M.pink,M.yellow,M.blue,M.peach,M.green,M.cream];
    for(let row=0;row<3;row++)for(let i=0;i<7;i++){
      const x=-.36+i*.12,y=.30+row*.53;
      box('bookcase story '+row+' '+i,x,y,.025,.095,.34+(i%3)*.025,.30,
        bookColors[(row*3+i)%bookColors.length]);
    }
  });
  // Potted plant, decorations and an oversized welcoming mat.
  withDecor('plant',()=>{
    cylinder('plant pot',4.19,.30,3.22,.58,.63,.58,M.rust);
    cylinder('plant stem',4.19,.78,3.22,.10,.70,.10,M.darkGreen);
    ball('leaf crown',4.20,1.27,3.2,1.02,.94,.91,M.leaf);
    ball('plant leaf',3.93,1.10,3.08,.62,.63,.6,M.leaf2);
    ball('plant leaf',4.45,1.38,3.42,.65,.74,.51,M.green);
  });
  box('entry mat',-.65,.042,3.45,1.45,.012,.60,M.mint);
  // Instantiate extra purchased decor from saved v1 furniture instances.
  updateDecorNodes();

  // Original reusable 0.5a rigs. Keep all existing motion/interaction pivot references.
  const rigContext={pc,root:app.root,ball,box,cylinder,mat,materials:M};
  // Furniture publishes its own physical seat dimensions/placement.
  // Future armchairs and couch variants register the same metadata and
  // reuse this controller: no per-sofa adjustments of the avatar's Y.
  const makeSofaSeat=(instanceId=null,romanticSlot=null)=>{
    const center=furniturePoint(game.world,'sofa',
      {x:SOFA_LAYOUT.x,z:SOFA_LAYOUT.z},instanceId);
    const instance=furnitureInstance(game.world,'sofa',instanceId);
    if(!center||!instance)return null;
    const pair=romanticSlot===0||romanticSlot===1;
    return seatSlot(createSeatSurface({
      id:'living-sofa',origin:{x:center.x,y:0,z:center.z},
      yaw:SOFA_POSE.yaw-instance.yaw,width:SOFA_LAYOUT.seatWidth,depth:SOFA_LAYOUT.seatDepth,
      seatHeight:SOFA_LAYOUT.seatCenterY+SOFA_LAYOUT.seatHeight/2,
      floorY:0,slots:pair?2:1,sideMargin:pair?.63:.35,
      backClearance:.10,approachGap:.50
    }),pair?romanticSlot:0);
  };
  let alexSeatInstanceId=null,alexSeatSlot=null;
  let livingSofaSeat=makeSofaSeat();
  refreshSofaSeat=()=>{livingSofaSeat=makeSofaSeat(alexSeatInstanceId,alexSeatSlot);};
  const alexRig=createCharacterRig(rigContext,'alex');
  const miraRig=createCharacterRig(rigContext,'mira');
  // Visual-only experimental Alex skin. The procedural rig and every action
  // controller remain authoritative; any GLB error falls back immediately.
  const liveFridgeLayout=()=>fixtureContactLayout(game.world,'fridge',FRIDGE_LAYOUT);
  const meshyAlex=createMeshyVisual({pc,app,rig:alexRig,
    partnerAvatar:miraRig.avatar,
    footIK:seatIKEnabled,footPlant:seatFootPlantEnabled,
    fridgeLayout:liveFridgeLayout,onStatus:(status,error)=>{
    if(status==='ready'||status==='error')loadingProgress.finish('alex',status==='ready');
    if(error)console.warn('Meshy visual unavailable',error);
  }});
  const meshyMira=createMiraMeshyVisual({pc,app,rig:miraRig,
    partnerAvatar:alexRig.avatar,
    fridgeLayout:liveFridgeLayout,onStatus:(status,error)=>{
    if(status==='ready'||status==='error')loadingProgress.finish('mira',status==='ready');
    if(error)console.warn('Meshy Mira visual unavailable',error);
  }});
  const animationStates={alex:createAnimationState(),mira:createAnimationState()};
  const sofaStates={alex:createSofaTransition(),mira:createSofaTransition()};
  // R5c seat slots outlive consent while Meshy physically stands up.
  const romanticSofaSlots={alex:null,mira:null};
  // The last used sofa remains the visual target while standing up.
  const sofaVisualTargets={alex:null,mira:null};
  const bedStates={alex:createBedTransition(),mira:createBedTransition()};
  // Retain the selected mattress through the physical climb-down animation.
  const bedVisualTargets={alex:null,mira:null};
  const showerStates={alex:createShowerTransition(),mira:createShowerTransition()};
  const toiletStates={alex:createToiletTransition(),mira:createToiletTransition()};
  const {avatar,torso,leftEye,rightEye,legPivot,armPivot,snack,book,selected:alexSelected}=alexRig;
  const {avatar:miraAvatar,torso:miraTorso,leftEye:miraLeftEye,rightEye:miraRightEye,
    legPivot:miraLegPivot,armPivot:miraArmPivot,snack:miraSnack,book:miraBook,
    selected:miraSelected}=miraRig;
  const reactionBadges=createReactionBadges($('reaction-layer'));
  const reactionRigs={alex:alexRig,mira:miraRig};
  const moodOrbit=$('mood-orbit');
  let feedbackRoot=game;
  // Water drops are local to the physical shower, including all quarter turns.
  const showerOrigin=ORIGINAL_FURNITURE.find(i=>i.prefabId==='shower');
  const showerNode=decorNodes.get(showerOrigin.instanceId);
  const showerDrops=Array.from({length:9},(_,i)=>{
    const drop=ball('water drop '+i,-4.47+i*.14-showerOrigin.x,2.02,
      2.20+(i%3)*.12-showerOrigin.z,.058,.10,.06,M.blue,showerNode);
    drop.enabled=false;return drop;
  });
  const ACTOR_POSES = {
    hobby: {x:0,y:0,z:.92,pitch:0,yaw:180},
    sofa:   SOFA_POSE,
    tv: TV_WATCH_POSE,
    fridge: {x:FRIDGE_LAYOUT.approach.x,y:0,z:FRIDGE_LAYOUT.approach.z,pitch:0,yaw:FRIDGE_FACING_YAW}
  };
  if(game.action?.phase==='using') {
    const dest=game.action.id==='bed'
      ?bedDestinationFor(game,'alex',game.action.targetInstanceId):
      game.action.id==='tv'&&game.action.watchSeatInstanceId
        ?furnitureActionApproach(game.world,'sofa',game.action.watchSeatInstanceId):null;
    const actual=dest||furnitureActionApproach(game.world,game.action.id,game.action.targetInstanceId);
    const [x,z]=actual?[actual.x,actual.z]:ACTIONS[game.action.id].location;
    game.position={x,z}; // old v0.1 saves used different stand positions
  }
  game.position=nearestWalkable(game.position,game.world);
  if(game.otherSim.action?.phase==='using') {
    const dest=game.otherSim.action.id==='bed'
      ?bedDestinationFor(game,'mira',game.otherSim.action.targetInstanceId):
      game.otherSim.action.id==='tv'&&game.otherSim.action.watchSeatInstanceId
        ?furnitureActionApproach(game.world,'sofa',game.otherSim.action.watchSeatInstanceId):null;
    const actual=dest||furnitureActionApproach(game.world,game.otherSim.action.id,game.otherSim.action.targetInstanceId);
    const [x,z]=actual?[actual.x,actual.z]:ACTIONS[game.otherSim.action.id].location;
    game.otherSim.position={x,z};
  }
  game.otherSim.position=nearestWalkable(game.otherSim.position,game.world);
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
  onManualCommandQueued=removed=>{
    if(!removed)return;
    const {residentId,objectId,objectPhase,socialInitiator}=removed;
    if(objectId){
      // Reset stale walking A* state. Keep existing seat/bed/shower/WC
      // transition controllers: their exit animation is a dispatch gate.
      paths[residentId]={points:null,index:0,id:null};
      // Fridge exit needs to complete closing its door before the next route.
      if(objectId==='fridge'&&objectPhase==='using'&&fridgeOpen>.015)
        fridgeLeaving[residentId]=true;
    }
    if(socialInitiator)
      paths[socialInitiator]={points:null,index:0,id:null};
    if(objectId||socialInitiator)restartAutonomyWait(residentId);
  };
  // Failed route searches used to repeat every 0.1s for the same queued
  // head, including up to eight A* social approaches. On mobile this can
  // monopolize the main thread and look like a frozen game.
  const routeRetryAt=new Map(),routeFailures=new Map();
  const destination=(id,residentId='alex',targetInstanceId=null,watchSeatInstanceId=null)=>id==='bed'
    ?bedDestinationFor(game,residentId,targetInstanceId)
    :id==='tv'&&watchSeatInstanceId
      ?furnitureActionApproach(game.world,'sofa',watchSeatInstanceId)
      :furnitureActionApproach(game.world,id,targetInstanceId);
  function buildRoute(id,actorId='alex',targetInstanceId=null,watchSeatInstanceId=null) {
    const actor=getActor(game,actorId);
    const goal=destination(id,actorId,targetInstanceId,watchSeatInstanceId);
    const points=goal&&findPath(actor.position,goal,game.world);
    if(!points) return false;
    paths[actorId]={points,index:0,id};
    return true;
  }
  beginAction=(id,automatic=false,actorId=game.selectedSim,fromQueue=false,targetInstanceId=null,
    activityId=null,contentId=null)=>{
    const actor=getActor(game,actorId);
    if(!ACTIONS[id] || (automatic && !game.autonomy.enabled))return false;
    // Releasing the headless shower action does not immediately clear the
    // physical cubicle: the prior user must finish dressing and exiting first.
    if(id==='toilet'&&HOUSEHOLD_IDS.some(other=>other!==actorId&&toiletStates[other].active)){
      if(!automatic&&!fromQueue)toast('Туалет ещё занят: житель выходит');
      return false;
    }
    if(id==='shower'&&HOUSEHOLD_IDS.some(other=>other!==actorId&&showerStates[other].active)){
      if(!automatic&&!fromQueue)toast('Душевая пока занята: житель выходит');
      return false;
    }
    if(!furnitureAvailable(game,id,actorId,targetInstanceId)){
      if(!automatic&&!fromQueue)toast('Предмет сейчас занят другим жителем');
      return false;
    }
    const watchSeat=id==='tv'?chooseTvSofa(game,actorId,
      resolveActionFurniture(game.world,'tv',targetInstanceId)?.instanceId||'home-tv-1'):null;
    if(!buildRoute(id,actorId,targetInstanceId,watchSeat?.sofaId||null)){
      if(!automatic&&!fromQueue) toast(getActorName(actorId)+' не может добраться до предмета');
      else actor.autonomy.nextAt=game.minutes+15;
      return false;
    }
    const started=chooseResidentAction(game,id,automatic,actorId,targetInstanceId,
      activityId,contentId);
    if(started)restartAutonomyWait(actorId);
    return started;
  };

  // Meet beside the other resident at a walkable, reachable point.
  beginSocial=(kind,automatic=false,actorId=game.selectedSim,topic=null,shared=null,branchId=null,fromQueue=false)=>{
    if(!canStartSocial(game,kind,actorId,automatic)){
      if(!automatic&&!fromQueue)toast('Собеседник занят или разговор уже идёт');
      return false;
    }
    const self=getActor(game,actorId),partnerId=actorId==='alex'?'mira':'alex',
      partner=getActor(game,partnerId);
    if(shared?.mode==='leisure'&&shared.choiceId==='tv'){
      const plan=planSharedTv(game,actorId,shared.targetInstanceId||'home-tv-1');
      if(!plan)return false;
      const first=plan.places[actorId],second=plan.places[partnerId];
      const a=findPath(self.position,first,game.world);
      const b=findPath(partner.position,second,game.world);
      if(!a||!b||!startSharedSocial(game,actorId,first,
        'leisure','tv',false,plan))return false;
      paths[actorId]={points:a,index:0,id:'social:'+kind};
      paths[partnerId]={points:b,index:0,id:'social:'+kind};
      restartAutonomyWait();return true;
    }
    // Optional: only the romantic evening can claim TWO walkable spots on an
    // actual table. Other social actions preserve their accepted navigation.
    // R5c prefers two independent sofa spots; R5b.1 table staging is a
    // real-geometry fallback and the original R5a invitation still survives.
    const sofaReservations=new Set();
    for(const id of HOUSEHOLD_IDS){
      const resident=getActor(game,id);
      if(resident.action?.id==='sofa')
        sofaReservations.add(resident.action.targetInstanceId||'home-sofa-1');
      if(resident.action?.watchSeatInstanceId)
        sofaReservations.add(resident.action.watchSeatInstanceId);
      for(const task of pendingActions(game.actionQueues,id))
        if(task.type==='object'&&task.actionId==='sofa')
          sofaReservations.add(task.targetInstanceId||'home-sofa-1');
    }
    const sofaPlan=branchId==='romance.evening'
      ?planRomanticEveningSofa(game.world,self.position,partner.position,findPath,
        {blockedIds:sofaReservations}):null;
    const tablePlan=branchId==='romance.evening'&&!sofaPlan
      ?planRomanticEveningTable(game.world,self.position,partner.position,findPath):null;
    const pairPlan=sofaPlan||tablePlan;
    const offsets=[[.84,0],[-.84,0],[0,.84],[0,-.84],[.62,.62],[-.62,.62],[.62,-.62],[-.62,-.62]];
    const candidates=offsets.map(([dx,dz])=>{
      const goal={x:partner.position.x+dx,z:partner.position.z+dz};
      return {goal,lowerBound:Math.hypot(goal.x-self.position.x,goal.z-self.position.z)};
    }).sort((a,b)=>a.lowerBound-b.lowerBound);
    let best=null,bestLength=Infinity;
    for(const {goal,lowerBound} of candidates){
      // Any path has length >= direct-line distance; later candidates
      // cannot improve a better route if their lower bound is already >=.
      if(lowerBound>=bestLength)break;
      const points=findPath(self.position,goal,game.world);
      if(!points)continue;
      let previous=self.position,len=0;
      for(const point of points){len+=Math.hypot(point.x-previous.x,point.z-previous.z);previous=point;}
      if(len<bestLength){best={goal,points};bestLength=len;}
    }
    if(pairPlan)best={goal:pairPlan.stage.actor,points:pairPlan.actorRoute};
    if(!best){if(!automatic&&!fromQueue)toast('Сейчас не получается подойти к собеседнику');return false;}
    if(!(branchId?startBranchSocial(game,actorId,best.goal,branchId,automatic)
      :shared?startSharedSocial(game,actorId,best.goal,shared.mode,shared.choiceId,automatic)
      :topic?startConversation(game,actorId,best.goal,topic)
      :startSocial(game,kind,actorId,best.goal,automatic)))return false;
    // Both residents are idle. Do not clear either existing action or path.
    paths[actorId]={points:best.points,index:0,id:'social:'+kind};
    if(pairPlan){
      game.socialAction[sofaPlan?'eveningSofa':'eveningStage']=pairPlan.stage;
      paths[partnerId]={points:pairPlan.partnerRoute,index:0,id:'social:'+kind};
      partner.event='Идёт на вечер вдвоём';
    }
    restartAutonomyWait();
    return true;
  };
  const socialWalkingFor=residentId=>{
    const session=game.socialAction;
    return session?.phase==='walking'&&
      (session.initiator===residentId||
        (session.shared?.choiceId==='tv'&&
          Boolean(session.shared.tvPlan?.places?.[residentId]))||
        (session.branchAction?.id==='romance.evening'&&
          (session.eveningStage||session.eveningSofa)&&session.partner===residentId));
  };
  dispatchPlannedActions=()=>{
    if(game.paused||dialogueNeedsDecision(game))return [];
    const refused=[];
    const started=dispatchActionQueues(game.actionQueues,{
      canStart(residentId,command){
        if(!HOUSEHOLD_IDS.includes(residentId)||game.socialAction)return false;
        if((routeRetryAt.get(command.seq)||0)>performance.now())return false;
        const actor=getActor(game,residentId);
        if(actor.action||sofaStates[residentId].progress>0||
          bedStates[residentId].progress>0||showerStates[residentId].active||
          toiletStates[residentId].active||fridgeLeaving[residentId])return false;
        if(command.type==='activity')
          return furnitureAvailable(game,'hobby',residentId,command.targetInstanceId);
        if(command.type==='object')
          return furnitureAvailable(game,command.actionId,residentId,command.targetInstanceId)&&
            !(command.actionId==='shower'&&HOUSEHOLD_IDS.some(id=>
              id!==residentId&&showerStates[id].active))&&
            !(command.actionId==='toilet'&&HOUSEHOLD_IDS.some(id=>
              id!==residentId&&toiletStates[id].active));
        const partnerId=command.targetId;
        // Current 3D scene is a two-person adapter; the queue core is N-person.
        if(!HOUSEHOLD_IDS.includes(partnerId)||partnerId===residentId||
          (residentId==='alex'?'mira':'alex')!==partnerId)return false;
        const partner=getActor(game,partnerId);
        if(partner.action||sofaStates[partnerId].progress>0||
          bedStates[partnerId].progress>0||showerStates[partnerId].active||
          toiletStates[partnerId].active||fridgeLeaving[partnerId])return false;
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
        let started=false;
        if(command.type==='object')
          started=beginAction(command.actionId,false,residentId,true,command.targetInstanceId);
        else if(command.type==='activity')
          started=beginAction('hobby',false,residentId,true,command.targetInstanceId,
            command.activityId,command.contentId);
        else if(command.type==='social')
          started=beginSocial(command.actionId,false,residentId,null,null,null,true);
        else if(command.type==='conversation')
          started=beginSocial('talk',false,residentId,command.topicId,null,null,true);
        else if(command.type==='branch')
          started=beginSocial('talk',false,residentId,null,null,command.actionId,true);
        else if(command.type==='shared')
          started=beginSocial('talk',false,residentId,null,
            {mode:command.mode,choiceId:command.choiceId,
              targetInstanceId:command.targetInstanceId},null,true);
        if(started){
          routeRetryAt.delete(command.seq);
          routeFailures.delete(command.seq);
        }else{
          // Retain the player's task and retry later; NEVER busy-loop A*
          // on every fixed simulation step when a layout is unreachable.
          if(routeRetryAt.size>=24){routeRetryAt.clear();routeFailures.clear();}
          routeRetryAt.set(command.seq,performance.now()+900);
          const count=(routeFailures.get(command.seq)||0)+1;
          routeFailures.set(command.seq,count);
          if(count===3){
            const message=getActorName(residentId)+
              ': путь пока недоступен — проверь расположение мебели или удали задание из очереди';
            $('queue-feedback').textContent=message;
            toast(message);
          }
        }
        return started;
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
    closeInsightPanel();socialFlashLeft=0;$('social-result').hidden=true;
    conversationTopicPicker=false;sharedPicker=false;branchPicker=false;
    socialMenuCategory=null;socialContextVisible=false;socialAnchor=null;queueVisible=false;
    conversationDisplayKey='';sharedDisplayKey='';branchDisplayKey='';
    socialMenuDisplayKey='';queueDisplayKey='';
    renderConversationPanel();renderSharedPanel();renderBranchPanel();
    renderSocialMenu();renderQueuePanel();
    for(const id of HOUSEHOLD_IDS)paths[id]={points:null,index:0,id:null};
    facing=0;gait=0;miraFacing=0;miraGait=0;fridgeOpen=0;
    for(const id of HOUSEHOLD_IDS){fridgeLeaving[id]=false;fridgeWasUsing[id]=false;}
    for(const id of HOUSEHOLD_IDS){
      sofaStates[id]=createSofaTransition();
      sofaVisualTargets[id]=null;
      romanticSofaSlots[id]=null;
      bedStates[id]=createBedTransition();
      showerStates[id]=createShowerTransition();
      toiletStates[id]=createToiletTransition();
      animationStates[id]=createAnimationState();
      applyShowerAppearance(id==='alex'?alexRig:miraRig,false,false);
    }
    meshyAlex.reset();
    meshyMira.reset();
    game.position=nearestWalkable(game.position,game.world);
    game.otherSim.position=nearestWalkable(game.otherSim.position,game.world);
    alexSeatInstanceId=null;
    updateDecorNodes();
    Object.assign(display,{...game.position,y:0,yaw:0,pitch:0,roll:0});
    Object.assign(miraDisplay,{...game.otherSim.position,y:0,yaw:0,pitch:0,roll:0});
    showerPrivacy.enabled=false;
    toiletPrivacy.enabled=false;
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
    // Camera reset must not teleport a pending shop object.
    toast('Камера сброшена');
  });
  // One finger pans by default; two fingers orbit and pinch.
  // Side button temporarily switches one-finger movement to rotation.
  let oneFingerMode='pan';
  const rotateButton=$('rotate-camera-btn');
  const showCameraMode=()=>{
    const rotating=oneFingerMode==='orbit';
    rotateButton.setAttribute('aria-pressed',String(rotating));
    rotateButton.setAttribute('aria-label',rotating
      ?'Выключить вращение камеры одним пальцем'
      :'Включить вращение камеры одним пальцем');
    rotateButton.title=rotating?'Вернуть перемещение одним пальцем'
      :'Вращать одним пальцем';
    rotateButton.querySelector('small').textContent=rotating?'ВРАЩЕНИЕ':'ПОВОРОТ';
    $('hint').textContent=rotating
      ?'Один палец — вращение · два — вращение и масштаб'
      :'Один палец — сдвиг · два — вращение и масштаб';
  };
  rotateButton.addEventListener('click',()=>{
    oneFingerMode=oneFingerMode==='orbit'?'pan':'orbit';
    showCameraMode();
    if(furnishMode&&shopPlacing)renderMarket();
    toast(oneFingerMode==='orbit'
      ?'Поворот включён: вращай одним пальцем'
      :'Перемещай одним пальцем · вращай двумя');
  });
  showCameraMode();

  // Pure session separates a deliberate tap from any rotation/pan/pinch.
  // A second pointer disqualifies the whole touch until BOTH are released.
  const cameraGesture=createCameraGestureSession();
  const gesturePoint=e=>({id:e.pointerId,x:e.clientX,y:e.clientY});
  // F1 edit mode: UI state is ephemeral; only confirmed domain transactions
  // change the optional v1 world.furniture save extension. No action is consumed.
  let editSession=null,editSelectedId=null,editDrag=null;
  let shopOpen=false,warehouseOpen=false,shopSelected=null,shopPose=null;
  let shopSelectedItemId=null; // stable SKU, independently from prefabId
  let shopManualPose=false,shopPreviousCameraMode=null;
  let shopPlacing=false,shopPreviewEntity=null,shopPreviewType=null;
  let shopSwipeRawPose=null; // transient, unsnapped, never stored
  let lastShopCameraPreviewAt=0;
  const ghostValid=mat('#3b9c73',{opacity:.23});
  const ghostInvalid=mat('#b84d55',{opacity:.26});
  const furnitureGhost=box('F1 placement preview',0,.075,0,.1,.038,.1,ghostValid);
  furnitureGhost.enabled=false;
  const marketGhost=box('F2 shop preview',0,.078,0,.1,.04,.1,ghostValid);
  marketGhost.enabled=false;
  const lockedFurnitureIds=()=>{
    const busy=new Set();
    if(game.socialAction?.eveningStage?.instanceId)
      busy.add(game.socialAction.eveningStage.instanceId);
    if(game.socialAction?.eveningSofa?.instanceId)
      busy.add(game.socialAction.eveningSofa.instanceId);
    const lockPrefab=prefabId=>{
      // Conservative transient lock over all instances of this prefab:
      // future F2 can add duplicates without original home-*-1 hardcodes.
      for(const item of game.world.furniture.instances)
        if(item.prefabId===prefabId&&item.location==='home')busy.add(item.instanceId);
    };
    // A finished need action may still have a physical stand-up, dressing,
    // masking or fridge-door-close animation. F1b forbids relocating those
    // assemblies until all residents are visually clear of the fixture.
    for(const id of HOUSEHOLD_IDS){
      if(bedStates[id].progress>0){
        if(bedVisualTargets[id])busy.add(bedVisualTargets[id]);
        else lockPrefab('bed'); // legacy transition: fail closed
      }
    }
    for(const id of HOUSEHOLD_IDS){
      if(sofaStates[id].progress>0){
        if(sofaVisualTargets[id])busy.add(sofaVisualTargets[id]);
        else lockPrefab('sofa'); // legacy transition before target migration
      }
    }
    if(Object.values(showerStates).some(s=>s.active))
      lockPrefab('shower');
    if(Object.values(toiletStates).some(s=>s.active))
      lockPrefab('toilet');
    if(fridgeOpen>.001||Object.values(fridgeLeaving).some(Boolean))
      lockPrefab('fridge');
    const jointTv=game.socialAction?.shared?.tvPlan;
    if(jointTv){
      busy.add(jointTv.tvId);
      for(const id of HOUSEHOLD_IDS){
        const seat=jointTv.places?.[id]?.seatId;
        if(seat)busy.add(seat);
      }
    }
    for(const id of HOUSEHOLD_IDS){
      const actor=getActor(game,id);
      if(actor?.action?.targetInstanceId)busy.add(actor.action.targetInstanceId);
      if(actor?.action?.id==='tv'&&actor.action.watchSeatInstanceId)
        busy.add(actor.action.watchSeatInstanceId);
      for(const pending of pendingActions(game.actionQueues,id))
        if(['object','activity'].includes(pending.type)&&pending.targetInstanceId)
          busy.add(pending.targetInstanceId);
    }
    return [...busy];
  };
  const editorContext=()=>({lockedInstanceIds:lockedFurnitureIds(),
    residents:HOUSEHOLD_IDS.map(id=>getActor(game,id).position)});
  const editorLabel=instanceId=>{
    const item=game.world.furniture.instances.find(i=>i.instanceId===instanceId);
    return item?(furnitureProduct(item.itemDefinitionId)?.name||
      FURNITURE_CATALOG[item.prefabId].name):'Предмет';
  };
  const editorMessage=(reason)=>{
    const messages={
      'fixed-or-missing':'Встроенную кухню пока нельзя перемещать: она связана со стеной',
      reserved:'Предмет занят или уже указан в очереди действий',
      'room-bounds':'Слишком близко к стене или за пределами комнаты',
      collision:'Здесь уже стоит другая мебель',
      'resident-blocked':'Здесь стоит житель — перемести предмет в другое место',
      'unreachable-bed':'После переноса к кровати нельзя подойти',
      'unreachable-fridge':'После переноса нельзя добраться до холодильника',
      'unreachable-shower':'После переноса нельзя добраться до душа',
      'unreachable-toilet':'После переноса нельзя добраться до туалета',
      'unreachable-sofa':'После переноса нельзя добраться до дивана',
      'invalid-pose':'Это положение невозможно', 'unchanged':'Положение не изменилось',
      'empty-history':'Больше нечего отменять или повторять',
      'not-in-shop':'Этот товар пока недоступен',
      'protected-item':'Исходная функциональная мебель защищена',
      'unreachable-sofa':'К этому дивану нельзя пройти · выбери другое место',
      'unreachable-tv':'Нельзя подойти к экрану этого телевизора · выбери другое место',
      'insufficient-credits':'Недостаточно пробных кредитов',
      'full-household':'Слишком много предметов',
      'already-stored':'Предмет уже на складе',
      'not-stored':'Предмет не на складе',
      'duplicate-id':'Конфликт идентификатора покупки',
      'wallet-limit':'Переполнение кошелька'
    };
    return messages[reason]||'Не удалось разместить мебель безопасно';
  };
  const editorFeedback=(message,invalid=false)=>{
    const element=$('furnish-feedback');
    element.textContent=message;
    element.dataset.invalid=String(invalid);
  };
  const editorItem=id=>game.world.furniture.instances.find(i=>i.instanceId===id);
  const showGhost=(instanceId,pose=null,valid=true)=>{
    const item=editorItem(instanceId);
    if(!item||!canMoveFurniture(item)){furnitureGhost.enabled=false;return;}
    const chosen=pose||item;
    const rect=instanceRect(chosen,FURNITURE_CATALOG[item.prefabId].footprint);
    furnitureGhost.setPosition((rect.minX+rect.maxX)/2,.075,
      (rect.minZ+rect.maxZ)/2);
    furnitureGhost.setLocalScale(Math.max(.1,rect.maxX-rect.minX),.038,
      Math.max(.1,rect.maxZ-rect.minZ));
    furnitureGhost.render.material=valid?ghostValid:ghostInvalid;
    furnitureGhost.enabled=furnishMode;
  };
  const renderFurnitureSelection=()=>{
    const item=editorItem(editSelectedId);
    const selectable=!!item&&item.location==='home';
    $('furnish-commands').hidden=!furnishMode||shopOpen||warehouseOpen||!selectable;
    $('furnish-rotate').disabled=!selectable||!canMoveFurniture(item);
    const tradable=selectable&&canTradeMarketInstance(item);
    $('furnish-store').disabled=!tradable;
    $('furnish-restore').hidden=true; // storage gets its own visible item actions
    $('furnish-sell').disabled=!tradable;
    const history=editSession?.state();
    $('furnish-undo').disabled=!furnishMode||!history?.canUndo;
    $('furnish-redo').disabled=!furnishMode||!history?.canRedo;
    $('furnish-title').textContent=shopPlacing?'Выбираем место':shopOpen?'Магазин':
      warehouseOpen?'Склад':item&&selectable
        ?'Обстановка · '+editorLabel(item.instanceId):'Обстановка';
    if(shopOpen||warehouseOpen||!selectable)furnitureGhost.enabled=false;
    else showGhost(editSelectedId);
    $('furnish-balance').textContent='Кредиты: '+game.shop.credits;
  };
  const chooseFurniture=id=>{
    const item=editorItem(id);
    editSelectedId=item?.location==='home'?item.instanceId:null;
    renderFurnitureSelection();
    if(item?.location==='storage')
      editorFeedback('Этот предмет на складе. Открой вкладку «Склад».');
    else if(item&&!canMoveFurniture(item))
      editorFeedback(editorMessage('fixed-or-missing'),true);
    else if(item)
      editorFeedback(editorLabel(id)+': удерживай 0,5 секунды для переноса или поверни кнопкой');
    else editorFeedback('Коснись предмета на 3D-сцене или открой каталог');
  };
  // F4b2: store UI selects SKU identity; renderer/footprint still use prefab.
  const shopListings=selectShopCatalog();
  const shopQualityRegistry=legacyObjectRegistry();
  let shopRoomCategory=null,shopFunctionCategory=null;
  // Separate visual staging entity is never a purchased item and never enters
  // world.furniture or household saves. The floor outline shows validation.
  const clearShopPreviewEntity=()=>{
    if(shopPreviewEntity){shopPreviewEntity.destroy();shopPreviewEntity=null;}
    shopPreviewType=null;
    marketGhost.enabled=false;
  };
  const syncShopPreviewEntity=()=>{
    if(!shopOpen||!shopPlacing||!shopSelected){
      clearShopPreviewEntity();return;
    }
    if(shopPreviewType!==shopSelected){
      clearShopPreviewEntity();
      const template=decorTemplates.get(shopSelected);
      if(template){
        shopPreviewEntity=template.clone();
        shopPreviewEntity.name='Unsaved furniture placement preview';
        if(shopSelectedItemId)applyItemAppearance(shopPreviewEntity,shopSelectedItemId);
        app.root.addChild(shopPreviewEntity);
        shopPreviewType=shopSelected;
      }
    }
    if(shopPreviewEntity){
      shopPreviewEntity.enabled=!!shopPose;
      if(shopPose){
        shopPreviewEntity.setPosition(shopPose.x,0,shopPose.z);
        shopPreviewEntity.setEulerAngles(0,-shopPose.yaw,0);
      }
    }
  };
  const renderMarket=()=>{
    // In buy-to-place the one-finger gesture moves the object, not the camera.
    if(furnishMode&&shopPlacing)
      $('hint').textContent=oneFingerMode==='orbit'
        ?'Один палец — вращение камеры · два — вращение и масштаб'
        :'Один палец — перемещение предмета · два — камера и масштаб';
    else showCameraMode();
    $('furnish-shop').hidden=!shopOpen;
    $('furnish-warehouse').hidden=!warehouseOpen;
    $('furnish-shop-toggle').setAttribute('aria-expanded',String(shopOpen));
    $('furnish-warehouse-toggle').setAttribute('aria-expanded',String(warehouseOpen));
    $('furnish-edit-toggle').setAttribute('aria-pressed',String(!shopOpen&&!warehouseOpen));
    $('furnish-shop').dataset.placing=String(shopPlacing);
    $('furniture-editor').dataset.shopPlacing=String(shopPlacing);
    $('furnish-placement-guide').hidden=!shopPlacing;
    $('furnish-place-cancel').hidden=!shopPlacing;
    $('furnish-placement-controls').hidden=!shopPlacing;
    marketGhost.enabled=false;
    if(!shopOpen){clearShopPreviewEntity();return;}
    for(const button of $('furnish-stock').querySelectorAll('button')){
      const active=button.dataset.itemId===shopSelectedItemId;
      button.setAttribute('aria-pressed',String(active));
      button.classList.toggle('selected-product',active);
      button.querySelector('.furnish-selected-mark').hidden=!active;
    }
    const listing=shopListings.find(i=>i.itemId===shopSelectedItemId);
    $('furnish-placement-guide').hidden=!shopPlacing;
    $('furnish-placing-name').textContent=listing?.name||'Предмет';
    $('furnish-placing-status').textContent=shopPlacing
      ?'Веди предмет пальцем по полу. Два пальца — камера.':'';
    const preview=shopPlacing&&listing&&shopPose
      ?buyMarketItem(game.world.furniture,game.shop,shopSelectedItemId,shopPose,editorContext())
      :null;
    const suitable=preview?.ok===true;
    const previewLabel=!listing?'Выбери товар в каталоге':
      !shopPlacing?'Выбран: '+listing.name+' · '+listing.effectText+'. Нажми «Купить» — увидишь его в комнате.':
      !shopPose?'Место не выбрано. Коснись пола или нажми «Найти место»':
      suitable?'✓ Место подходит · веди предмет пальцем, «Установить» для покупки':
      '✕ '+editorMessage(preview.reason)+' · подбери другое место свайпом';
    $('furnish-preview').textContent=previewLabel;
    $('furnish-preview').dataset.invalid=String(shopPlacing&&!!listing&&!suitable);
    $('furnish-buy').textContent=shopPlacing?'✓ Установить · '+(listing?.price??0)+' кр.':
      'Купить · '+(listing?.price??0)+' кр.';
    $('furnish-buy').disabled=shopPlacing?!suitable:
      !listing||game.shop.credits<listing.price;
    $('furnish-preview-turn').disabled=!shopPlacing||!shopPose;
    syncShopPreviewEntity();
    if(shopPlacing&&shopPose&&listing){
      const rect=instanceRect(shopPose,FURNITURE_CATALOG[shopSelected].footprint);
      marketGhost.setPosition((rect.minX+rect.maxX)/2,.079,(rect.minZ+rect.maxZ)/2);
      marketGhost.setLocalScale(Math.max(.22,rect.maxX-rect.minX+.14),.052,
        Math.max(.22,rect.maxZ-rect.minZ+.14));
      marketGhost.render.material=suitable?ghostValid:ghostInvalid;
      marketGhost.enabled=furnishMode;
    }
  };
  const renderWarehouse=()=>{
    const stored=game.world.furniture.instances.filter(item=>
      item.location==='storage'&&SHOP_ITEMS.some(product=>product.prefabId===item.prefabId));
    $('furnish-storage-count').textContent=String(stored.length);
    $('furnish-storage-empty').hidden=stored.length>0;
    const list=$('furnish-storage-list');
    list.replaceChildren();
    if(!warehouseOpen)return;
    for(const item of stored){
      const card=document.createElement('div');
      card.className='furnish-storage-card';
      const title=document.createElement('strong');
      title.textContent=furnitureProduct(item.itemDefinitionId)?.name||
        FURNITURE_CATALOG[item.prefabId].name;
      const restore=document.createElement('button');restore.type='button';
      restore.textContent='↩ Вернуть';
      restore.addEventListener('click',()=>{
        const result=restoreMarketItem(game.world.furniture,game.shop,item.instanceId,
          {x:item.x,z:item.z,yaw:item.yaw},editorContext());
        applyMarketTransaction(result,'Возвращено из склада без оплаты');
      });
      const sell=document.createElement('button');sell.type='button';sell.textContent='Продать';
      sell.addEventListener('click',()=>sellFurniture(item.instanceId));
      card.append(title,restore,sell);list.append(card);
    }
  };
  const setEditorView=mode=>{
    if(mode==='shop'&&!shopOpen){
      shopPreviousCameraMode=oneFingerMode;
      oneFingerMode='pan';showCameraMode();
      cameraGesture.clear();
    }else if(shopOpen&&mode!=='shop'){
      if(shopPreviousCameraMode){oneFingerMode=shopPreviousCameraMode;showCameraMode();}
      shopPreviousCameraMode=null;cameraGesture.clear();
    }
    shopOpen=mode==='shop';
    warehouseOpen=mode==='warehouse';
    if(!shopOpen){shopPlacing=false;shopPose=null;shopManualPose=false;shopSwipeRawPose=null;}
    $('furniture-editor').dataset.editorView=mode;
    // Reconcile a saved-in-UI filter even when returning from Warehouse/Room.
    // A hidden product must never become buyable after reopening the shop.
    if(shopOpen)renderShopFilteredItems();
    else renderMarket();
    renderWarehouse();renderFurnitureSelection();
  };
  const chooseShopProduct=itemId=>{
    const offer=shopListings.find(x=>x.itemId===itemId);
    shopPlacing=false;shopSelectedItemId=offer?.itemId||null;
    shopSelected=offer?.prefabId||null;
    shopManualPose=false;shopPose=null;shopSwipeRawPose=null;
    clearShopPreviewEntity();
    renderMarket();renderFurnitureSelection();
  };
  // The two native Safari dropdowns are generated from the registry, not an
  // ever-growing list of hardcoded furniture category buttons.
  const addShopFacetOptions=(facet,elementId)=>{
    const selector=$(elementId);
    for(const category of shopCategoryOptions(facet)){
      const option=document.createElement('option');
      option.value=category.id;option.textContent=category.label;
      selector.append(option);
    }
  };
  addShopFacetOptions('room','furnish-room-filter');
  addShopFacetOptions('function','furnish-function-filter');
  const renderShopFilteredItems=()=>{
    const visible=selectShopCatalog({
      roomCategoryId:shopRoomCategory,functionCategoryId:shopFunctionCategory
    });
    const ids=new Set(visible.map(item=>item.itemId));
    for(const button of $('furnish-stock').querySelectorAll('button'))
      button.hidden=!ids.has(button.dataset.itemId);
    $('furnish-filter-count').textContent='Показано '+visible.length+' из '+shopListings.length;
    $('furnish-filter-empty').hidden=visible.length!==0;
    $('furnish-stock').setAttribute('aria-label',
      'Товары для покупки · '+visible.length+' из '+shopListings.length);
    // A filtered-out card cannot remain silently selected for a purchase.
    if(!shopPlacing&&!visible.some(item=>item.itemId===shopSelectedItemId)){
      shopSelectedItemId=visible[0]?.itemId||null;
      shopSelected=visible[0]?.prefabId||null;
      shopPose=null;shopManualPose=false;shopSwipeRawPose=null;
      clearShopPreviewEntity();
    }
    renderMarket();
  };
  $('furnish-room-filter').addEventListener('change',event=>{
    if(!shopOpen||shopPlacing)return;
    shopRoomCategory=event.currentTarget.value||null;
    renderShopFilteredItems();renderFurnitureSelection();
  });
  $('furnish-function-filter').addEventListener('change',event=>{
    if(!shopOpen||shopPlacing)return;
    shopFunctionCategory=event.currentTarget.value||null;
    renderShopFilteredItems();renderFurnitureSelection();
  });
  for(const item of shopListings){
    const button=document.createElement('button');
    button.type='button';button.dataset.prefabId=item.prefabId;
    button.dataset.itemId=item.itemId;
    const name=document.createElement('strong');name.textContent=item.name;
    const cost=document.createElement('small');cost.textContent=item.price+' проб. кр.';
    const effect=document.createElement('small');
    effect.className='furnish-product-effect';
    effect.textContent=item.effectText;
    const qualitySummary=shopQualitySummary(describeObjectQualities(shopQualityRegistry,item.itemId));
    const quality=document.createElement('small');
    quality.className='furnish-product-quality';
    quality.textContent=qualitySummary;
    quality.hidden=!qualitySummary;
    const mark=document.createElement('span');
    mark.className='furnish-selected-mark';mark.textContent='✓ ВЫБРАНО';
    mark.hidden=true;
    button.append(name,cost,effect,mark);
    if(qualitySummary)button.append(quality);
    button.setAttribute('aria-pressed','false');
    button.addEventListener('click',()=>chooseShopProduct(item.itemId));
    $('furnish-stock').append(button);
  }
  renderShopFilteredItems();
  $('furnish-edit-toggle').addEventListener('click',()=>setEditorView('edit'));
  $('furnish-shop-toggle').addEventListener('click',()=>setEditorView(shopOpen?'edit':'shop'));
  $('furnish-warehouse-toggle').addEventListener('click',()=>setEditorView(warehouseOpen?'edit':'warehouse'));
  $('furnish-preview-turn').addEventListener('click',()=>{
    if(!shopOpen||!shopPlacing||!shopPose)return;
    shopPose={...shopPose,yaw:(shopPose.yaw+90)%360};
    shopSwipeRawPose=null;shopManualPose=true;renderMarket();
  });
  $('furnish-preview-auto').addEventListener('click',()=>{
    if(!shopOpen||!shopPlacing||!shopSelected)return;
    shopPose=findMarketPlacement(game.world.furniture,game.shop,shopSelectedItemId,editorContext());
    shopSwipeRawPose=null;shopManualPose=false;renderMarket();
  });
  const applyMarketTransaction=(transaction,success)=>{
    if(!transaction.ok){editorFeedback(editorMessage(transaction.reason),true);return false;}
    const result=editSession.transactMarket(transaction);
    if(!result.ok){editorFeedback(editorMessage(result.reason),true);return false;}
    game.world.furniture=result.world;game.shop=result.shop;
    refreshMind(game,game.world);refreshMind(game.otherSim,game.world);
    for(const id of HOUSEHOLD_IDS)paths[id]={points:null,index:0,id:null};
    updateDecorNodes();renderWarehouse();
    editSelectedId=result.world.instances.some(i=>i.instanceId===result.instanceId)
      ?result.instanceId:null;
    renderFurnitureSelection();renderMarket();
    editorFeedback(success);save(true);return true;
  };
  $('furnish-buy').addEventListener('click',()=>{
    if(!furnishMode||!shopOpen||!shopSelected)return;
    if(!shopPlacing){
      const listing=shopListings.find(i=>i.itemId===shopSelectedItemId);
      if(!listing||game.shop.credits<listing.price){
        editorFeedback('Недостаточно пробных кредитов',true);return;
      }
      // Buy enters a NON-persistent 3D placement session, not an instant sale.
      shopPlacing=true;shopPose=null;shopManualPose=false;shopSwipeRawPose=null;
      // Let the edit sheet collapse BEFORE choosing the visible room anchor.
      renderMarket();moveShopPreviewToCamera(true);
      editorFeedback('Размещение: веди предмет по полу одним пальцем, двумя поворачивай камеру, затем «Установить».');
      return;
    }
    if(!shopPose)return;
    // Only this second, explicit confirmation commits money and furniture.
    const ok=applyMarketTransaction(buyMarketItem(game.world.furniture,game.shop,
      shopSelectedItemId,{...shopPose},editorContext()),
      'Куплено и установлено · можно выбрать следующий предмет');
    if(ok){
      shopPlacing=false;shopPose=null;shopManualPose=false;shopSwipeRawPose=null;
      clearShopPreviewEntity();renderMarket();
    }
  });
  $('furnish-place-cancel').addEventListener('click',()=>{
    if(!shopPlacing)return;
    shopPlacing=false;shopPose=null;shopManualPose=false;shopSwipeRawPose=null;
    clearShopPreviewEntity();renderMarket();
    editorFeedback('Расстановка отменена · деньги и дом без изменений');
  });
  $('furnish-store').addEventListener('click',()=>{
    if(!furnishMode||!editSelectedId)return;
    applyMarketTransaction(storeMarketItem(game.world.furniture,game.shop,
      editSelectedId,editorContext()),'На складе · деньги не списаны');
  });
  $('furnish-restore').addEventListener('click',()=>{
    const item=game.world.furniture.instances.find(i=>i.instanceId===editSelectedId);
    if(!furnishMode||!item)return;
    applyMarketTransaction(restoreMarketItem(game.world.furniture,game.shop,
      item.instanceId,{x:item.x,z:item.z,yaw:item.yaw},editorContext()),
      'Снова в комнате · бесплатно');
  });
  const sellFurniture=instanceId=>{
    const item=game.world.furniture.instances.find(i=>i.instanceId===instanceId);
    if(!furnishMode||!item)return;
    const quote=sellMarketItem(game.world.furniture,game.shop,item.instanceId,editorContext());
    if(!quote.ok){editorFeedback(editorMessage(quote.reason),true);return;}
    const name=furnitureProduct(item.itemDefinitionId)?.name||
      FURNITURE_CATALOG[item.prefabId].name;
    const resale=quote.amount; // uses price paid for SKU, or legacy fallback
    if(!window.confirm('Продать «'+name+'» за '+resale+
      ' пробных кредитов? Для отмены есть кнопка ↶.'))return;
    applyMarketTransaction(sellMarketItem(game.world.furniture,game.shop,
      item.instanceId,editorContext()),'Продано · +'+resale+' кредитов');
  };
  $('furnish-sell').addEventListener('click',()=>sellFurniture(editSelectedId));
  const commitFurniture=(instanceId,pose)=>{
    if(!editSession||!furnishMode)return false;
    const result=editSession.commit(instanceId,pose,editorContext());
    if(!result.ok){
      editorFeedback(editorMessage(result.reason),true);
      updateDecorNodes();renderFurnitureSelection();return false;
    }
    game.world.furniture=result.world;
    if(result.shop)game.shop=result.shop;
    // M5 is causal: moving an instance recalculates both residents' live mood.
    refreshMind(game,game.world);
    refreshMind(game.otherSim,game.world);
    for(const id of HOUSEHOLD_IDS)paths[id]={points:null,index:0,id:null};
    updateDecorNodes();
    renderFurnitureSelection();
    shopPose=null;shopManualPose=false;
    renderMarket();
    editorFeedback(editorLabel(instanceId)+' переставлен · изменения сохранены');
    save(true);
    return true;
  };
  const editorHistory=type=>{
    if(!editSession||!furnishMode)return;
    const result=type==='undo'?editSession.undo():editSession.redo();
    if(!result.ok){editorFeedback(editorMessage(result.reason),true);return;}
    game.world.furniture=result.world;
    if(result.shop)game.shop=result.shop;
    renderWarehouse();
    // M5 is causal: moving an instance recalculates both residents' live mood.
    refreshMind(game,game.world);
    refreshMind(game.otherSim,game.world);
    for(const id of HOUSEHOLD_IDS)paths[id]={points:null,index:0,id:null};
    updateDecorNodes();
    renderFurnitureSelection();
    shopPose=null;shopManualPose=false;
    renderMarket();
    editorFeedback(type==='undo'?'Действие отменено':'Действие восстановлено');
    save(true);
  };
  $('furnish-undo').addEventListener('click',()=>editorHistory('undo'));
  $('furnish-redo').addEventListener('click',()=>editorHistory('redo'));
  $('furnish-rotate').addEventListener('click',()=>{
    const item=editorItem(editSelectedId);
    if(!furnishMode||!canMoveFurniture(item))return;
    commitFurniture(item.instanceId,{x:item.x,z:item.z,yaw:(item.yaw+90)%360});
  });
  const exitFurniture=()=>{
    if(!furnishMode)return;
    cancelPendingGrab();
    editDrag=null;canvas.dataset.furnitureGrab='false';
    cameraGesture.clear();
    furnishMode=false;editSelectedId=null;editSession=null;
    furnitureGhost.enabled=false;marketGhost.enabled=false;
    setEditorView('edit');
    updateDecorNodes();
    document.querySelector('.app-shell').dataset.furnishMode='false';
    $('furniture-editor').hidden=true;
    $('furnish-toggle').setAttribute('aria-pressed','false');
    $('furnish-toggle').setAttribute('aria-label','Войти в режим обстановки');
    // Never mutate manual game.paused. Resume only if it was unpaused before.
    for(const id of HOUSEHOLD_IDS)paths[id]={points:null,index:0,id:null};
    renderPauseButton();renderFurnitureSelection();updateItemLabels();
    save(true);
  };
  const enterFurniture=()=>{
    if(furnishMode)return;
    if(intimacyFrame(game.socialAction).active){
      toast('Сначала завершите личное время вдвоём');return;
    }
    if(dialogueNeedsDecision(game)){
      toast('Сначала выбери ответ или заверши разговор');return;
    }
    editSession=createFurnitureEditor(game.world.furniture,game.shop);
    furnishMode=true;
    document.querySelector('.app-shell').dataset.furnishMode='true';
    $('furniture-editor').hidden=false;
    $('furnish-toggle').setAttribute('aria-pressed','true');
    $('furnish-toggle').setAttribute('aria-label','Выйти из режима обстановки');
    closeTour();closeMindPanel();closeInsightPanel();closeSocialContext();
    select(null);setViewOpen(false);
    conversationTopicPicker=false;sharedPicker=false;branchPicker=false;
    socialMenuCategory=null;queueVisible=false;
    renderQueuePanel(true);renderSocialMenu();renderConversationPanel();
    renderSharedPanel();renderBranchPanel();
    shopPose=null;shopManualPose=false;
    chooseFurniture(null);setEditorView('edit');
    renderPauseButton();
    editorFeedback('Коснись предмета, чтобы выбрать. Для перемещения удерживай палец 0,5 секунды. Свайп по мебели поворачивает камеру.');
  };
  $('furnish-toggle').addEventListener('click',()=>furnishMode?exitFurniture():enterFurniture());
  $('furnish-exit').addEventListener('click',exitFurniture);
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&furnishMode){event.preventDefault();exitFurniture();}
  },true);
  const furnitureRay=(pos)=>{
    const rect=canvas.getBoundingClientRect();
    const x=pos.x-rect.left,y=pos.y-rect.top;
    return {near:camera.camera.screenToWorld(x,y,camera.camera.nearClip),
      far:camera.camera.screenToWorld(x,y,camera.camera.farClip)};
  };
  const editorFloorAt=pos=>{
    const {near,far}=furnitureRay(pos);
    return furnitureFloorPoint(near,far);
  };
  // Use the camera's own visible focus instead of a nullable screen ray.
  // A ray missing the floor used to disable the 3D preview after Buy on Safari.
  const moveShopPreviewToCamera=(force=false)=>{
    if(!furnishMode||!shopOpen||!shopPlacing)return;
    const now=performance.now();
    if(!force&&now-lastShopCameraPreviewAt<100)return;
    lastShopCameraPreviewAt=now;
    const candidate=cameraPlacementPose(view,shopPose);
    if(shopPose&&shopPose.x===candidate.x&&shopPose.z===candidate.z)return;
    shopPose=candidate;shopManualPose=false;renderMarket();
  };
  const editorFurnitureAt=pos=>{
    const {near,far}=furnitureRay(pos);
    const boxes=game.world.furniture.instances.filter(item=>item.location==='home')
      .map(item=>{
        const rect=instanceRect(item,FURNITURE_CATALOG[item.prefabId].footprint);
        const height={table:.63,nightstand:1.49,tv:2.0,plant:1.87,
          bed:1.40,counter:2.50,fridge:2.2,sofa:1.3,shower:2.75,toilet:1.45,
        bookcase:2.05}[item.prefabId]||2;
        return {kind:'object',id:item.instanceId,bounds:{
          min:{x:rect.minX,y:0,z:rect.minZ},
          max:{x:rect.maxX,y:height,z:rect.maxZ}
        }};
      });
    return pickWorldRayTarget(near,far,boxes)?.id||null;
  };
  // A furniture ray hit only arms a deliberate hold; the camera owns all
  // pointer movements until a stationary, single-pointer 500ms hold fires.
  const holdGesture=createFurnitureHoldGesture();
  let furnitureHoldTimer=null;
  const cancelPendingGrab=()=>{
    if(furnitureHoldTimer!==null){
      clearTimeout(furnitureHoldTimer);
      furnitureHoldTimer=null;
    }
    holdGesture.cancel();
  };
  const cancelEditorDrag=()=>{
    if(!editDrag)return;
    editDrag=null;canvas.dataset.furnitureGrab='false';
    updateDecorNodes();renderFurnitureSelection();
  };
  const startEditorDrag=event=>{
    if(!furnishMode||editDrag)return false;
    const id=event.grabInstanceId;
    const item=editorItem(id);
    if(!canMoveFurniture(item))return false;
    const floor=editorFloorAt(gesturePoint(event));
    if(!floor)return false;
    chooseFurniture(id);
    editDrag={pointerId:event.pointerId,instanceId:id,
      lastPoint:gesturePoint(event),
      offsetX:item.x-floor.x,offsetZ:item.z-floor.z,
      pose:{x:item.x,z:item.z,yaw:item.yaw},lastCheck:0,valid:true};
    canvas.dataset.furnitureGrab='true';
    showGhost(id);
    editorFeedback('Предмет захвачен · веди пальцем, чтобы переместить');
    return true;
  };
  const moveEditorDrag=event=>{
    if(!editDrag||editDrag.pointerId!==event.pointerId)return false;
    editDrag.lastPoint=gesturePoint(event);
    const pt=editorFloorAt(gesturePoint(event));
    if(!pt)return true;
    const pose={x:snapFurnitureCoordinate(pt.x+editDrag.offsetX),
      z:snapFurnitureCoordinate(pt.z+editDrag.offsetZ),yaw:editDrag.pose.yaw};
    if(pose.x===editDrag.pose.x&&pose.z===editDrag.pose.z)return true;
    editDrag.pose=pose;
    // Full A* validation is expensive on iPhone: only compute when the
    // snapped cell changes and not more than ten checks per second.
    if(performance.now()-editDrag.lastCheck<95){
      updateDecorNodes(editDrag.instanceId,pose);
      showGhost(editDrag.instanceId,pose,true);
      return true;
    }
    editDrag.lastCheck=performance.now();
    const candidate=proposeFurnitureMove(game.world.furniture,editDrag.instanceId,pose,editorContext());
    editDrag.valid=candidate.ok;
    updateDecorNodes(editDrag.instanceId,pose);
    showGhost(editDrag.instanceId,pose,candidate.ok);
    editorFeedback(candidate.ok?'Отпусти, чтобы поставить предмет сюда':
      editorMessage(candidate.reason),!candidate.ok);
    return true;
  };
  const endEditorDrag=event=>{
    if(!editDrag||editDrag.pointerId!==event.pointerId)return false;
    const {instanceId,pose}=editDrag;
    editDrag=null;holdGesture.end(gesturePoint(event));
    canvas.dataset.furnitureGrab='false';
    const item=editorItem(instanceId);
    if(item&&(item.x!==pose.x||item.z!==pose.z))
      commitFurniture(instanceId,pose);
    else{updateDecorNodes();renderFurnitureSelection();}
    return true;
  };
  const armFurnitureHold=(event,now)=>{
    if(!furnishMode||shopOpen||warehouseOpen||cameraGesture.count()!==1)return;
    const point=gesturePoint(event);
    const instanceId=editorFurnitureAt(point);
    const item=editorItem(instanceId);
    if(!canMoveFurniture(item)||!editorFloorAt(point))return;
    if(!holdGesture.begin(point,instanceId,now))return;
    furnitureHoldTimer=setTimeout(()=>{
      furnitureHoldTimer=null;
      if(!furnishMode||dialogueNeedsDecision(game)||cameraGesture.count()!==1){
        holdGesture.cancel();return;
      }
      const held=holdGesture.activate(performance.now());
      if(!held)return;
      // The camera has processed no drag while this finger stayed still.
      // Once picked up it must not receive a late click on pointerup.
      cameraGesture.clear();
      const grabEvent={pointerId:held.pointerId,clientX:held.x,
        clientY:held.y,grabInstanceId:held.instanceId};
      if(!startEditorDrag(grabEvent))holdGesture.cancel();
    },FURNITURE_HOLD_MS);
  };
  canvas.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse'&&event.button!==0)return;
    if(dialogueNeedsDecision(game))return;
    if(event.cancelable)event.preventDefault();
    try{canvas.setPointerCapture?.(event.pointerId);}catch{/* iOS capture may fail */}
    const point=gesturePoint(event),now=performance.now();
    if(furnishMode&&editDrag){
      // Two fingers always win over furniture. Re-seed the original
      // captured touch before adding the second for seamless pinch/pan.
      const first=editDrag.lastPoint;
      cancelEditorDrag();
      cameraGesture.clear();
      if(first&&first.id!==point.id)cameraGesture.begin(first,now);
    }
    if(furnishMode)cancelPendingGrab();
    if(furnishMode&&shopPlacing)shopSwipeRawPose=null;
    cameraGesture.begin(point,now);
    armFurnitureHold(event,now);
  });
  // Global listeners survive canvas leaving the viewport on iOS Safari.
  window.addEventListener('pointermove',event=>{
    if(furnishMode&&editDrag?.pointerId===event.pointerId){
      if(event.cancelable)event.preventDefault();
      moveEditorDrag(event);return;
    }
    if(furnishMode&&holdGesture.pending){
      if(holdGesture.move(gesturePoint(event))==='camera'){
        // The same pointer motion continues into cameraGesture.move below:
        // no dead zone, no camera jump and no transient furniture move.
        cancelPendingGrab();
      }
    }
    if(!cameraGesture.count())return;
    if(dialogueNeedsDecision(game)){
      cancelPendingGrab();cameraGesture.clear();return;
    }
    const result=cameraGesture.move(gesturePoint(event),view,
      canvas.clientHeight,{oneFinger:furnishMode&&shopPlacing&&oneFingerMode==='pan'
        ?'placement':oneFingerMode});
    if(result.placementDelta&&furnishMode&&shopPlacing&&shopPose){
      if(event.cancelable)event.preventDefault();
      const {dx,dy}=result.placementDelta;
      // Accumulate sub-grid deltas: slow swipes must not get swallowed by snap.
      shopSwipeRawPose=dragShopPlacement(view,shopSwipeRawPose||shopPose,
        dx,dy,canvas.clientHeight);
      if(shopSwipeRawPose){
        const pose={x:snapFurnitureCoordinate(shopSwipeRawPose.x),
          z:snapFurnitureCoordinate(shopSwipeRawPose.z),yaw:shopPose.yaw};
        if(pose.x!==shopPose.x||pose.z!==shopPose.z){
          shopPose=pose;shopManualPose=true;renderMarket();
        }
      }
    }
    if(result.changed){
      if(event.cancelable)event.preventDefault();
      // Two-finger orbit/pinch never teleports a shop item.
      setView(result.view);
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
      if(id===game.selectedSim||!reactionRigs[id]||showerStates[id]?.active||
        toiletStates[id]?.active)continue;
      const p=reactionRigs[id].avatar?.getPosition();
      if(!p)continue;
      const half=.43;
      residents.push({kind:'resident',id,bounds:{
        min:{x:p.x-half,y:p.y-.06,z:p.z-half},
        max:{x:p.x+half,y:p.y+2.26,z:p.z+half}
      }});
    }
    // The movable coffee table must block object rays at its *new* position.
    const table=game.world.furniture.instances.find(i=>i.prefabId==='table');
    let blockers=[];
    if(table&&table.location==='home'){
      const r=instanceRect(table,FURNITURE_CATALOG.table.footprint);
      blockers=[{kind:'blocker',id:'coffee-table',bounds:{
        min:{x:r.minX,y:.28,z:r.minZ},max:{x:r.maxX,y:.48,z:r.maxZ}
      }}];
    }
    const movedVolumes=hitVolumes.map(volume=>{
      if(!volume.fixtureType)return volume;
      return {...volume,bounds:furnitureBounds(game.world,volume.fixtureType,
        volume.bounds)};
    });
    // Cloned sofa has a real, movable scene node but no authored touchBoxes.
    // Raycasting its rotated saved footprint preserves exact instance identity.
    const sofaCopies=game.world.furniture.instances
      .filter(item=>item.prefabId==='sofa'&&item.location==='home'&&
        item.instanceId!=='home-sofa-1')
      .map(item=>{
        const r=instanceRect(item,FURNITURE_CATALOG.sofa.footprint);
        return {kind:'object',id:'sofa',instanceId:item.instanceId,
          bounds:{min:{x:r.minX,y:0,z:r.minZ},
            max:{x:r.maxX,y:1.08,z:r.maxZ}}};
      });
    const bedCopies=game.world.furniture.instances
      .filter(item=>item.prefabId==='bed'&&item.location==='home'&&
        item.instanceId!=='home-bed-1')
      .map(item=>{
        const r=instanceRect(item,FURNITURE_CATALOG.bed.footprint);
        return {kind:'object',id:'bed',instanceId:item.instanceId,
          bounds:{min:{x:r.minX,y:0,z:r.minZ},
            max:{x:r.maxX,y:1.42,z:r.maxZ}}};
      });
    const tvCopies=game.world.furniture.instances
      .filter(item=>item.prefabId==='tv'&&item.location==='home'&&
        item.instanceId!=='home-tv-1')
      .map(item=>{
        const r=instanceRect(item,FURNITURE_CATALOG.tv.footprint);
        return {kind:'object',id:'tv',instanceId:item.instanceId,
          bounds:{min:{x:r.minX,y:0,z:r.minZ},max:{x:r.maxX,y:1.97,z:r.maxZ}}};
      });
    const bookshelves=game.world.furniture.instances
      .filter(item=>item.prefabId==='bookcase'&&item.location==='home')
      .map(item=>{
        const r=instanceRect(item,FURNITURE_CATALOG.bookcase.footprint);
        return {kind:'object',id:'hobby',instanceId:item.instanceId,
          bounds:{min:{x:r.minX,y:0,z:r.minZ},
            max:{x:r.maxX,y:2.05,z:r.maxZ}}};
      });
    return pickWorldRayTarget(near,far,
      [...residents,...sofaCopies,...bedCopies,...tvCopies,...bookshelves,...movedVolumes,...blockers]);
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
    if(furnishMode&&endEditorDrag(event))return;
    if(furnishMode&&holdGesture.pointerId===event.pointerId)
      cancelPendingGrab();
    const pos=cameraGesture.end(gesturePoint(event),performance.now());
    shopSwipeRawPose=null; // next gesture starts from last snapped object pose
    if(!pos||dialogueNeedsDecision(game))return;
    if(furnishMode){
      if(shopOpen&&shopPlacing&&shopSelected){
        const floor=editorFloorAt(pos);
        if(floor){
          shopPose={x:snapFurnitureCoordinate(floor.x),z:snapFurnitureCoordinate(floor.z),
            yaw:shopPose?.yaw??0};
          shopSwipeRawPose=null;shopManualPose=true;renderMarket();
        }else editorFeedback('Коснись поверхности пола для размещения',true);
        return;
      }
      if(warehouseOpen)setEditorView('edit');
      chooseFurniture(editorFurnitureAt(pos));return;
    }
    const target=worldTargetAt(pos);
    if(target)confirmWorldTap(pos);
    if(target?.kind==='resident')openSocialContext(pos);
    else if(target?.kind==='object')select(target.id,target.instanceId);
    else{closeSocialContext();select(null);}
  };
  window.addEventListener('pointerup',endPointer);
  window.addEventListener('pointercancel',event=>{
    if(holdGesture.pointerId===event.pointerId)cancelPendingGrab();
    if(editDrag?.pointerId===event.pointerId){
      cancelEditorDrag();holdGesture.cancel();
    }
    cameraGesture.end(gesturePoint(event),performance.now(),{cancel:true});
    shopSwipeRawPose=null;
  });
  window.addEventListener('blur',()=>{
    cancelPendingGrab();cancelEditorDrag();cameraGesture.clear();shopSwipeRawPose=null;
  });
  // Safari may suspend a background tab without a matching pointerup/blur.
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){
      cancelPendingGrab();cancelEditorDrag();cameraGesture.clear();shopSwipeRawPose=null;
    }
  });
  canvas.addEventListener('lostpointercapture',event=>{
    if(holdGesture.pointerId===event.pointerId)cancelPendingGrab();
    if(editDrag?.pointerId===event.pointerId){
      cancelEditorDrag();holdGesture.cancel();
    }
    cameraGesture.end(gesturePoint(event),performance.now(),{cancel:true});
    shopSwipeRawPose=null;
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
    const active=!game.paused&&!furnishMode&&!dialogueNeedsDecision(game);
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
          showerStates[residentId].active||toiletStates[residentId].active||
          fridgeLeaving[residentId])continue;
        const socialWalking=Boolean(socialWalkingFor(residentId));
        const pairedPlan=socialWalking?game.socialAction?.shared?.tvPlan:null;
        const eveningStage=socialWalking
          ?game.socialAction?.eveningSofa||game.socialAction?.eveningStage:null;
        const socialGoal=pairedPlan?.places?.[residentId]||
          (eveningStage&&game.socialAction.partner===residentId
          ?eveningStage.partner:game.socialAction?.target);
        // A stage guest or TV viewer at their spot waits for their partner.
        const atStage=socialWalking&&(eveningStage||pairedPlan)&&
          Math.hypot(resident.position.x-socialGoal.x,
            resident.position.z-socialGoal.z)<.075;
        const jobId=socialWalking&&!atStage?'social:'+game.socialAction.kind:
          resident.action?.phase==='walking'?resident.action.id:null;
        if(jobId){
          let p=paths[residentId];
          if(p.id!==jobId || !p.points){
            const available=socialWalking
              ? findPath(resident.position,socialGoal,game.world)
              : (buildRoute(jobId,residentId,resident.action?.targetInstanceId,
                  resident.action?.watchSeatInstanceId)?paths[residentId].points:null);
            if(!available){
              if(socialWalking)cancelSocial(game);
              else {resident.action=null;resident.activitySession=null;resident.event='Путь недоступен';}
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
              resident.position=socialWalking?{...socialGoal}:
                destination(jobId,residentId,resident.action?.targetInstanceId,
                   resident.action?.watchSeatInstanceId);
              if(socialWalking){
                if(pairedPlan){
                  const ready=HOUSEHOLD_IDS.every(id=>{
                    const goal=pairedPlan.places[id],pos=getActor(game,id).position;
                    return Math.hypot(pos.x-goal.x,pos.z-goal.z)<.06;
                  });
                  if(ready)arriveSocial(game); // partner decides only after both arrive
                  paths[residentId]={points:null,index:0,id:null};
                  continue;
                }
                const partnerId=residentId==='alex'?'mira':'alex';
                const partnerExiting=sofaStates[partnerId].progress>0||
                  bedStates[partnerId].progress>0||
                  showerStates[partnerId].active||toiletStates[partnerId].active||
                  fridgeLeaving[partnerId];
                // Consent is requested once, only after both partners have
                // actually arrived at their opposite table staging positions.
                const staged=game.socialAction?.eveningSofa||
                  game.socialAction?.eveningStage;
                const otherGoal=staged
                  ?game.socialAction.initiator===partnerId?staged.actor:staged.partner
                  :null;
                const otherHere=!otherGoal||
                  Math.hypot(getActor(game,partnerId).position.x-otherGoal.x,
                    getActor(game,partnerId).position.z-otherGoal.z)<.075;
                if(partnerExiting||!otherHere){
                  paths[residentId]={points:[{...socialGoal}],index:0,id:jobId};
                  continue;
                }
                arriveSocial(game);
              }else arrive(resident);
              paths[residentId]={points:null,index:0,id:null};
            }
          }
        }
      }
      // A restored date can have two zero-step routes: check both real
      // positions and stand-up guards once rather than waiting indefinitely.
      const waitingStage=game.socialAction?.phase==='walking'
        ?game.socialAction.eveningSofa||game.socialAction.eveningStage:null;
      if(waitingStage&&HOUSEHOLD_IDS.every(id=>{
        const resident=getActor(game,id);
        const goal=game.socialAction.initiator===id
          ?waitingStage.actor:waitingStage.partner;
        return Math.hypot(resident.position.x-goal.x,
          resident.position.z-goal.z)<.075&&
          sofaStates[id].progress===0&&bedStates[id].progress===0&&
          !showerStates[id].active&&!toiletStates[id].active&&
          !fridgeLeaving[id];
      }))arriveSocial(game);
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
    const dateSocial=game.socialAction;
    const dateAllowed=dateSocial?.branchAction?.id==='romance.evening'&&
      romanceAvailability(game.socialGraph,dateSocial.initiator,
        dateSocial.partner,'romance.evening',game.minutes).enabled;
    const eveningFrame=romanticEveningVignette(furnishMode?null:game.socialAction,
      game.world,{alex:game.position,mira:game.otherSim.position},effectTime,
      {eligible:Boolean(dateAllowed)});
    const romanticSofa=romanticEveningSofaFrame(game.socialAction,game.world,
      {eligible:!furnishMode&&Boolean(dateAllowed)});
    const sofaDateFor=id=>romanticSofa.active&&
      (id===game.socialAction.initiator
        ?romanticSofa.actorSlot:romanticSofa.partnerSlot);
    // Both visible avatars follow the same consented hug timeline.
    // Simulation coordinates stay authoritative for movement and saves.
    const hugCandidate=hugMotion(game.socialAction);
    const hugTargets=hugCandidate.active
      ?hugPairTarget(game.position,game.otherSim.position,hugCandidate.weight):null;
    const hugFrame=hugTargets?hugCandidate:{weight:0,progress:0,active:false};
    const kissCandidate=kissMotion(game.socialAction);
    const kissTargets=kissCandidate.active
      ?kissPairTarget(game.position,game.otherSim.position,kissCandidate.weight):null;
    const kissFrame=kissTargets?kissCandidate:{weight:0,progress:0,active:false};
    // Only the consented adult R2 action can activate this opaque
    // fade-to-black. No explicit characters or anatomy are displayed.
    const privateFrame=intimacyFrame(game.socialAction);
    intimacyVeil.classList.toggle('visible',privateFrame.active);
    intimacyVeil.setAttribute('aria-hidden',String(!privateFrame.active));
    $('intimacy-progress').textContent=privateFrame.active
      ?Math.round(privateFrame.progress*100)+'%':''; 
    const kissAlexFrame={...kissFrame,initiator:game.socialAction?.initiator==='alex'};
    const kissMiraFrame={...kissFrame,initiator:game.socialAction?.initiator==='mira'};
    const pairTargets=hugTargets||kissTargets;
    const pairedTv=liveSharedTv(game);
    const using=game.action?.phase==='using',
      useId=using?game.action.id:pairedTv?'tv':null;
    const alexFridge=useId==='fridge'?fridgeSequence(game.action.elapsed,ACTIONS.fridge.duration):null;
    showerStates.alex=advanceShowerTransition(showerStates.alex,useId==='shower',
      game.action?.elapsed||0,ACTIONS.shower.duration,animDt,
      inverseFurniturePose(game.world,'shower',display).yaw);
    const alexShower=showerStates.alex.frame?{...showerStates.alex.frame,
      pose:furniturePose(game.world,'shower',showerStates.alex.frame.pose)}:null;
    toiletStates.alex=advanceToiletTransition(toiletStates.alex,useId==='toilet',
      game.action?.elapsed||0,ACTIONS.toilet.duration,animDt,
      inverseFurniturePose(game.world,'toilet',display).yaw);
    const alexToilet=toiletStates.alex.frame?{...toiletStates.alex.frame,
      pose:furniturePose(game.world,'toilet',toiletStates.alex.frame.pose)}:null;
    const walking=active&&(game.action?.phase==='walking'||
      socialWalkingFor('alex'));
    const alexWatchSeat=useId==='tv'
      ?(pairedTv?.places?.alex?.seatId||game.action?.watchSeatInstanceId):null;
    const alexDateSofa=romanticSofa.active;
    if(alexDateSofa){
      sofaVisualTargets.alex=romanticSofa.sofaId;
      romanticSofaSlots.alex=sofaDateFor('alex');
    }else if(useId==='sofa'||alexWatchSeat)
      sofaVisualTargets.alex=(alexWatchSeat||game.action?.targetInstanceId)||null;
    sofaStates.alex=advanceSofaTransition(sofaStates.alex,
      (useId==='sofa'||Boolean(alexWatchSeat)||alexDateSofa)&&
        bedStates.alex.progress===0&&!showerStates.alex.active,animDt);
    const alexSeatBase=sofaTransitionPose(sofaStates.alex);
    const seatPose=furniturePose(game.world,'sofa',
      romanticSofaSlots.alex===null?alexSeatBase:
        {...alexSeatBase,x:alexSeatBase.x+romanticSofaSlotOffset(romanticSofaSlots.alex)},
      sofaVisualTargets.alex)||
      {...display,sofaWeight:0};
    const seating=useId==='sofa'||Boolean(alexWatchSeat)||
      sofaStates.alex.progress>0||alexDateSofa;
    if(!seating){sofaVisualTargets.alex=null;romanticSofaSlots.alex=null;}
    if(alexSeatInstanceId!==sofaVisualTargets.alex||
      alexSeatSlot!==romanticSofaSlots.alex){
      alexSeatInstanceId=sofaVisualTargets.alex;
      alexSeatSlot=romanticSofaSlots.alex;
      refreshSofaSeat();
    }
    if(useId==='bed')bedVisualTargets.alex=game.action?.targetInstanceId??'home-bed-1';
    bedStates.alex=advanceBedTransition(bedStates.alex,
      useId==='bed'&&sofaStates.alex.progress===0&&!showerStates.alex.active,
      game.action?.bedSlot,animDt,
      inverseFurniturePose(game.world,'bed',display,bedVisualTargets.alex));
    const bedPose=bedStates.alex.progress>0
      ?furniturePose(game.world,'bed',bedTransitionPose(bedStates.alex),bedVisualTargets.alex):null;
    if(bedStates.alex.progress===0)bedVisualTargets.alex=null;
    const bedding=Boolean(bedPose);
    const pairedTvStand=pairedTv&&!alexWatchSeat
      ?{...pairedTv.places.alex,y:0,pitch:0,
        yaw:furniturePose(game.world,'tv',TV_WATCH_POSE,pairedTv.tvId)?.yaw||0}:null;
    const pose=pairedTvStand||(useId&&!seating&&useId!=='sofa'&&useId!=='bed'&&useId!=='shower'&&useId!=='toilet'
      ?furniturePose(game.world,useId,ACTOR_POSES[useId],game.action?.targetInstanceId):null);
    const previousAlexXZ={x:display.x,z:display.z};
    const desired=alexToilet?alexToilet.pose:alexShower?alexShower.pose:bedding?bedPose:seating?seatPose:{
      x:pose?pose.x:pairTargets?.a.x??game.position.x,
      y:pose?pose.y:animationStates.alex.walkBob,
      z:pose?pose.z:pairTargets?.a.z??game.position.z,
      pitch:pose?pose.pitch:0,
      yaw:pose?pose.yaw:socialUsing
        ? Math.atan2(game.otherSim.position.x-game.position.x,
          game.otherSim.position.z-game.position.z)*180/Math.PI:facing
    };
    if(alexToilet){
      Object.assign(display,alexToilet.pose);facing=alexToilet.pose.yaw;
    }else if(alexShower){
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
      walking&&!seating&&!bedding&&!pose&&!alexShower&&!alexToilet);
    gait=alexMotion.phase;
    if(alexMotion.heading!==null)
      display.yaw=approachAngle(display.yaw,alexMotion.heading,13,animDt);
    avatar.setPosition(display.x,display.y,display.z);
    avatar.setEulerAngles(display.pitch,display.yaw,display.roll);
    if(active)effectTime+=dt*game.speed;
    animationStates.alex=stepAnimation(animationStates.alex,{
      id:'alex',walking:(walking||Boolean(alexShower?.stepWeight>.015))&&!seating&&!bedding,
      using:alexToilet?'toilet':alexShower?'shower':useId,
      showerStep:alexShower?.stepWeight||0,showerWater:Boolean(alexShower?.water),
      showerExiting:Boolean(alexShower&&useId!=='shower'),
      toiletSitWeight:alexToilet?.seated||0,
      toiletStep:alexToilet?.walkWeight||0,
      sofaWeight:seatPose.sofaWeight,
      romanticSeatTurn:alexDateSofa
        ?(romanticSofaSlots.alex===0?-12:12)*eveningFrame.weight:0,
      tvGazeYaw:alexWatchSeat?tvSofaView(game.world,alexWatchSeat,
        pairedTv?.tvId||game.action?.targetInstanceId)?.torsoYaw||0:0,
      bedStepWeight:bedPose?.bedStepWeight||0,
      bedSitWeight:bedPose?.bedSitWeight||0,
      bedReclineWeight:bedPose?.bedReclineWeight||0,
      bedSwingWeight:bedPose?.bedSwingWeight||0,
      bedSide:bedPose?.bedSide||null,bedJoints:bedPose?.bedJoints,bedFootYaw:bedPose?.bedFootYaw,
      social:socialUsing&&!pairedTv&&!hugFrame.active&&!kissFrame.active?game.socialAction.kind:null,
      eveningWeight:eveningFrame.gestureWeight,
      hugWeight:hugFrame.weight,
      kissWeight:kissFrame.weight,
      fridgeReach:alexFridge?.reach||0,fridgeEat:alexFridge?.eat||0,
      fridgeChew:alexFridge?.chew||0,
      gait:alexShower?alexShower.gaitMeters*WALK_PHASE_PER_METER:gait,
      mood:game.mind?.mood?.value,energy:game.needs.energy
    },animDt);
    // Contact gait is phase-accurate only when the root dip is applied in
    // the SAME frame as its ankle joints; the old display spring lagged one.
    // Never override the directly controlled bed/sofa/shower interaction root.
    if(!alexShower&&!alexToilet&&!bedding&&!seating&&!pose&&!socialUsing){
      display.y=animationStates.alex.walkBob;
      avatar.setPosition(display.x,display.y,display.z);
    }
    applyCharacterAnimation(alexRig,animationStates.alex);
    applyShowerAppearance(alexRig,Boolean(alexShower?.privacy||alexToilet?.privacy),Boolean(alexShower?.bathing));
    snack.enabled=Boolean(alexFridge&&alexFridge.handFood>.012);
    if(snack.enabled)snack.setLocalScale(.20*alexFridge.handFood,.17*alexFridge.handFood,.20*alexFridge.handFood);
    book.enabled=using&&(useId==='sofa'||useId==='hobby');
    // Mira uses the same pose definitions, but maintains her own position and gait.
    const miraUsing=game.otherSim.action?.phase==='using';
    const miraUseId=miraUsing?game.otherSim.action.id:pairedTv?'tv':null;
    const miraFridge=miraUseId==='fridge'?fridgeSequence(game.otherSim.action.elapsed,ACTIONS.fridge.duration):null;
    showerStates.mira=advanceShowerTransition(showerStates.mira,miraUseId==='shower',
      game.otherSim.action?.elapsed||0,ACTIONS.shower.duration,animDt,
      inverseFurniturePose(game.world,'shower',miraDisplay).yaw);
    const miraShower=showerStates.mira.frame?{...showerStates.mira.frame,
      pose:furniturePose(game.world,'shower',showerStates.mira.frame.pose)}:null;
    toiletStates.mira=advanceToiletTransition(toiletStates.mira,miraUseId==='toilet',
      game.otherSim.action?.elapsed||0,ACTIONS.toilet.duration,animDt,
      inverseFurniturePose(game.world,'toilet',miraDisplay).yaw);
    const miraToilet=toiletStates.mira.frame?{...toiletStates.mira.frame,
      pose:furniturePose(game.world,'toilet',toiletStates.mira.frame.pose)}:null;
    const miraWalking=active&&(game.otherSim.action?.phase==='walking'||
      socialWalkingFor('mira'));
    const miraWatchSeat=miraUseId==='tv'
      ?(pairedTv?.places?.mira?.seatId||game.otherSim.action?.watchSeatInstanceId):null;
    const miraDateSofa=romanticSofa.active;
    if(miraDateSofa){
      sofaVisualTargets.mira=romanticSofa.sofaId;
      romanticSofaSlots.mira=sofaDateFor('mira');
    }else if(miraUseId==='sofa'||miraWatchSeat)
      sofaVisualTargets.mira=(miraWatchSeat||game.otherSim.action?.targetInstanceId)||null;
    sofaStates.mira=advanceSofaTransition(sofaStates.mira,
      (miraUseId==='sofa'||Boolean(miraWatchSeat)||miraDateSofa)&&
        bedStates.mira.progress===0&&!showerStates.mira.active,animDt);
    const miraSeatBase=sofaTransitionPose(sofaStates.mira);
    const miraSeatPose=furniturePose(game.world,'sofa',
      romanticSofaSlots.mira===null?miraSeatBase:
        {...miraSeatBase,x:miraSeatBase.x+romanticSofaSlotOffset(romanticSofaSlots.mira)},
      sofaVisualTargets.mira)||
      {...miraDisplay,sofaWeight:0};
    const miraSeating=miraUseId==='sofa'||Boolean(miraWatchSeat)||
      sofaStates.mira.progress>0||miraDateSofa;
    if(!miraSeating){sofaVisualTargets.mira=null;romanticSofaSlots.mira=null;}
    if(miraUseId==='bed')bedVisualTargets.mira=game.otherSim.action?.targetInstanceId??'home-bed-1';
    bedStates.mira=advanceBedTransition(bedStates.mira,
      miraUseId==='bed'&&sofaStates.mira.progress===0&&!showerStates.mira.active,
      game.otherSim.action?.bedSlot,animDt,
      inverseFurniturePose(game.world,'bed',miraDisplay,bedVisualTargets.mira));
    const miraBedPose=bedStates.mira.progress>0
      ?furniturePose(game.world,'bed',bedTransitionPose(bedStates.mira),bedVisualTargets.mira):null;
    if(bedStates.mira.progress===0)bedVisualTargets.mira=null;
    const miraBedding=Boolean(miraBedPose);
    const pairedTvMiraStand=pairedTv&&!miraWatchSeat
      ?{...pairedTv.places.mira,y:0,pitch:0,
        yaw:furniturePose(game.world,'tv',TV_WATCH_POSE,pairedTv.tvId)?.yaw||0}:null;
    const miraPose=pairedTvMiraStand||(miraUseId&&!miraSeating&&miraUseId!=='sofa'&&miraUseId!=='bed'&&miraUseId!=='shower'&&miraUseId!=='toilet'
      ?furniturePose(game.world,miraUseId,ACTOR_POSES[miraUseId],game.otherSim.action?.targetInstanceId):null);
    const previousMiraXZ={x:miraDisplay.x,z:miraDisplay.z};
    const miraDesired=miraToilet?miraToilet.pose:miraShower?miraShower.pose:miraBedding?miraBedPose:miraSeating?miraSeatPose:{
      x:miraPose?miraPose.x:pairTargets?.b.x??game.otherSim.position.x,
      y:miraPose?miraPose.y:animationStates.mira.walkBob,
      z:miraPose?miraPose.z:pairTargets?.b.z??game.otherSim.position.z,
      pitch:miraPose?miraPose.pitch:0,
      yaw:miraPose?miraPose.yaw:socialUsing
        ? Math.atan2(game.position.x-game.otherSim.position.x,
          game.position.z-game.otherSim.position.z)*180/Math.PI:miraFacing
    };
    if(miraToilet){
      Object.assign(miraDisplay,miraToilet.pose);miraFacing=miraToilet.pose.yaw;
    }else if(miraShower){
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
      miraWalking&&!miraSeating&&!miraBedding&&!miraPose&&!miraShower&&!miraToilet);
    miraGait=miraMotion.phase;
    if(miraMotion.heading!==null)
      miraDisplay.yaw=approachAngle(miraDisplay.yaw,miraMotion.heading,13,animDt);
    miraAvatar.setPosition(miraDisplay.x,miraDisplay.y,miraDisplay.z);
    miraAvatar.setEulerAngles(miraDisplay.pitch,miraDisplay.yaw,miraDisplay.roll);
    animationStates.mira=stepAnimation(animationStates.mira,{
      id:'mira',walking:(miraWalking||Boolean(miraShower?.stepWeight>.015))&&!miraSeating&&!miraBedding,
      using:miraToilet?'toilet':miraShower?'shower':miraUseId,
      showerStep:miraShower?.stepWeight||0,showerWater:Boolean(miraShower?.water),
      showerExiting:Boolean(miraShower&&miraUseId!=='shower'),
      toiletSitWeight:miraToilet?.seated||0,
      toiletStep:miraToilet?.walkWeight||0,
      sofaWeight:miraSeatPose.sofaWeight,
      romanticSeatTurn:miraDateSofa
        ?(romanticSofaSlots.mira===0?-12:12)*eveningFrame.weight:0,
      tvGazeYaw:miraWatchSeat?tvSofaView(game.world,miraWatchSeat,
        pairedTv?.tvId||game.otherSim.action?.targetInstanceId)?.torsoYaw||0:0,
      bedStepWeight:miraBedPose?.bedStepWeight||0,
      bedSitWeight:miraBedPose?.bedSitWeight||0,
      bedReclineWeight:miraBedPose?.bedReclineWeight||0,
      bedSwingWeight:miraBedPose?.bedSwingWeight||0,
      bedSide:miraBedPose?.bedSide||null,bedJoints:miraBedPose?.bedJoints,bedFootYaw:miraBedPose?.bedFootYaw,
      social:socialUsing&&!pairedTv&&!hugFrame.active&&!kissFrame.active?game.socialAction.kind:null,
      eveningWeight:eveningFrame.gestureWeight,
      hugWeight:hugFrame.weight,
      kissWeight:kissFrame.weight,
      fridgeReach:miraFridge?.reach||0,fridgeEat:miraFridge?.eat||0,
      fridgeChew:miraFridge?.chew||0,
      gait:miraShower?miraShower.gaitMeters*WALK_PHASE_PER_METER:miraGait,
      mood:game.otherSim.mind?.mood?.value,energy:game.otherSim.needs.energy
    },animDt);
    if(!miraShower&&!miraToilet&&!miraBedding&&!miraSeating&&!miraPose&&!socialUsing){
      miraDisplay.y=animationStates.mira.walkBob;
      miraAvatar.setPosition(miraDisplay.x,miraDisplay.y,miraDisplay.z);
    }
    applyCharacterAnimation(miraRig,animationStates.mira);
    applyShowerAppearance(miraRig,Boolean(miraShower?.privacy||miraToilet?.privacy),Boolean(miraShower?.bathing));
    miraSnack.enabled=Boolean(miraFridge&&miraFridge.handFood>.012);
    if(miraSnack.enabled)miraSnack.setLocalScale(.20*miraFridge.handFood,.17*miraFridge.handFood,.20*miraFridge.handFood);
    miraBook.enabled=miraUsing&&(miraUseId==='sofa'||miraUseId==='hobby');
    // Mira retains one 3D skin for sofa, bed, fridge and clothed shower
    // entry/exit. The original game owns shower water, cover, full avatar
    // privacy and all simulation/save state; no private body is visible.
    const miraMeshShown=meshyMira.update({
      preferred:meshyPreferred,paused:!active,dt:animDt,
      walking:(game.otherSim.action?.phase==='walking'||
        socialWalkingFor('mira'))&&
        !miraSeating&&!miraBedding&&!miraShower,
      social:socialUsing&&!pairedTv?game.socialAction.kind:null,
      hugFrame,kissFrame:kissMiraFrame,
      actionId:miraUseId,
      readingElapsed:miraUsing&&miraUseId==='hobby'?game.otherSim.action.elapsed:null,
      sofaBusy:sofaStates.mira.progress>0,
      sofaWeight:miraSeatPose.sofaWeight,
      bedBusy:bedStates.mira.progress>0,
      bedFrame:miraBedPose,
      bedProgress:bedStates.mira.progress,
      showerBusy:showerStates.mira.active,
      showerFrame:miraShower,
      toiletBusy:toiletStates.mira.active,
      toiletFrame:miraToilet,
      fridgeBusy:fridgeLeaving.mira,
      fridgeFrame:miraFridge
    });
    // The procedural book belongs to a hidden elbow; never show it floating.
    if(miraMeshShown&&(miraUseId==='sofa'||miraUseId==='hobby'))miraBook.enabled=false;
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
        socialWalkingFor('alex'))&&
        !seating&&!bedding&&!alexShower,
      worldMinutes:game.minutes,
      mood:game.mind?.mood?.value,
      energy:game.needs.energy,
      social:socialUsing&&!pairedTv?game.socialAction.kind:null,
      socialInitiator:socialUsing&&game.socialAction.initiator==='alex',
      socialElapsed:socialUsing?game.socialAction.elapsed:null,
      hugFrame,kissFrame:kissAlexFrame,
      actionId:useId,
      readingElapsed:using&&useId==='hobby'?game.action.elapsed:null,
      sofaBusy:sofaStates.alex.progress>0,
      sofaWeight:seatPose.sofaWeight,
      seat:seatContactEnabled?livingSofaSeat:null,
      seatMode,
      bedBusy:bedStates.alex.progress>0,
      bedFrame:bedPose,
      showerBusy:showerStates.alex.active,
      showerFrame:alexShower,
      toiletBusy:toiletStates.alex.active,
      toiletFrame:alexToilet,
      fridgeBusy:fridgeLeaving.alex,
      fridgeFrame:alexFridge
    });
    // The old snack is attached to the hidden procedural elbow; use the
    // new Meshy hand-bone prop instead, never show both at once.
    if(meshyShown&&useId==='fridge')snack.enabled=false;
    // The existing procedural book is attached to the old right elbow.
    // Never let it float beside the Meshy hand until a real socket exists.
    if(meshyShown&&(useId==='sofa'||useId==='hobby'))book.enabled=false;
    alexSelected.enabled=game.selectedSim==='alex' && !using;
    miraSelected.enabled=game.selectedSim==='mira' && !miraUsing;
    // R5b never writes to the simulator. Tableware only follows existing
    // home furniture and vanishes instantly on refusal, exit or furnishing.
    for(const item of game.world.furniture.instances){
      if(item.prefabId!=='table')continue;
      const decor=decorNodes.get(item.instanceId)?.findByName('R5b romantic tableware');
      if(decor)decor.enabled=item.location==='home'&&
        eveningFrame.tableInstanceId===item.instanceId;
    }
    dateLight.enabled=eveningFrame.active&&eveningFrame.weight>.001;
    if(dateLight.enabled&&eveningFrame.center){
      dateLight.setPosition(eveningFrame.center.x,1.42,eveningFrame.center.z);
      dateLight.light.intensity=.28*eveningFrame.weight;
    }
    for(let i=0;i<dateAccents.length;i++){
      const point=eveningFrame.accents[i],accent=dateAccents[i];
      accent.enabled=Boolean(point);
      if(point){accent.setPosition(point.x,point.y,point.z);
        accent.setLocalScale(point.size,point.size,point.size);}
    }
    // A TV only plays while one of its OWN watchers is actually using it.
    // Each instance keeps its own small procedural screen and no video files.
    for(const item of game.world.furniture.instances){
      if(item.prefabId!=='tv'||item.location!=='home')continue;
      const program=decorNodes.get(item.instanceId)?.findByName('tv program');
      if(!program)continue;
      const frame=tvScreenFrame([game,game.otherSim],item.instanceId,effectTime,
        game.socialAction);
      program.enabled=frame.on;
      if(frame.on)program.render.material=[M.mint,M.blue,M.peach][frame.frame];
    }
    // Independently animate blankets on the actual sleeping bed, not the original.
    for(const item of game.world.furniture.instances){
      if(item.prefabId!=='bed'||item.location!=='home')continue;
      const node=decorNodes.get(item.instanceId);
      if(!node)continue;
      for(const slot of ['left','right']){
        const progress=Math.max(...HOUSEHOLD_IDS.map(id=>
          bedVisualTargets[id]===item.instanceId&&bedStates[id].slot===slot
            ?bedStates[id].progress:0));
        const quilt=bedBeddingPose(progress),bx=BED_SLOTS[slot].x;
        const body=item.instanceId==='home-bed-1'
          ?quilts[slot].body:node.findByName('duvet '+slot);
        const trim=item.instanceId==='home-bed-1'
          ?quilts[slot].trim:node.findByName('duvet trim '+slot);
        if(!body||!trim)continue;
        body.setLocalPosition(bx+2.62,quilt.y,quilt.z+1.425);
        body.setLocalScale(1.02,.15,quilt.depth);
        trim.setLocalPosition(bx+2.62,quilt.y+.09,quilt.trimZ+1.425);
      }
    }
    const activeFridge=alexFridge||miraFridge;
    fridgeOpen=activeFridge?activeFridge.doorOpen:closeFridgeDoor(fridgeOpen,animDt);
    fridgeHinge.setLocalEulerAngles(0,FRIDGE_LAYOUT.doorAngle*fridgeOpen,0);
    const shelfFood=activeFridge?.shelfFood||0;
    fridgeFood.enabled=shelfFood>.012;
    if(fridgeFood.enabled)fridgeFood.setLocalScale(.20*shelfFood,.18*shelfFood,.20*shelfFood);
    // The private resident is never rendered: the screen is opaque from ALL
    // viewpoints, even when camera is rotating during the shower.
    showerPrivacy.enabled=Boolean(alexShower?.privacy||miraShower?.privacy);
    toiletPrivacy.enabled=Boolean(alexToilet?.privacy||miraToilet?.privacy);
    const waterOn=Boolean(alexShower?.water||miraShower?.water);
    for(let i=0;i<showerDrops.length;i++){
      const drop=showerDrops[i];
      drop.enabled=waterOn;
      if(drop.enabled){
        const t=(effectTime*.8+i*.17)%1;
        drop.setLocalPosition(-4.28+(i%5)*.22-showerOrigin.x,2.13-t*1.8,
          3.25+(i%2)*.035-showerOrigin.z);
      }
    }
    // An event is generated by the simulation only when the response happened.
    // UI markers are ephemeral, head anchored, and deliberately never saved.
    if(feedbackRoot!==game){
      reactionBadges.clear();feedbackRoot=game;
      socialFlashLeft=0;$('social-result').hidden=true;
    }
    // One-time receipts only, emitted AFTER a real social response. The
    // transient strip never grants relationship points or replays old events.
    const reactions=consumeSocialReactions(game);
    reactionBadges.show(reactions);
    const newest=reactions.at(-1);
    const report=newest&&!showerStates[newest.responderId]?.active
      ?socialReactionInsight(newest,getActorName):null;
    if(report){
      $('social-result-title').textContent=report.title;
      $('social-result-detail').textContent=report.description;
      $('social-result').setAttribute('aria-label',report.accessible);
      $('social-result').dataset.outcome=report.outcome;
      socialFlashLeft=4.1;
    }
    socialFlashLeft=Math.max(0,socialFlashLeft-Math.min(dt,.06));
    const optionalOpen=insightOpen||viewOpen||queueVisible||socialContextVisible||
      Boolean(socialMenuCategory)||sharedPicker||conversationTopicPicker||
      branchPicker||selected!==null||!$('mind-panel').hidden;
    const layers=insightLayerPolicy({
      required:dialogueNeedsDecision(game),optionalOpen,
      feedbackActive:socialFlashLeft>0
    });
    $('social-result').hidden=!layers.showFeedback;
    reactionBadges.update({dt,paused:game.paused||furnishMode,pc,camera,canvas,
      rigs:reactionRigs,
      visible:{alex:!showerStates.alex.active&&!toiletStates.alex.active,
        mira:!showerStates.mira.active&&!toiletStates.mira.active}});
    // A persistent ORIGINAL orbit belongs only to the selected resident;
    // social response icons take priority, and privacy must not leak position.
    const orbitRig=reactionRigs[game.selectedSim];
    const orbitHead=orbitRig?.head||orbitRig?.avatar;
    if(!orbitHead?.getPosition||showerStates[game.selectedSim]?.active||
       toiletStates[game.selectedSim]?.active||
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
      const skill=getSkillDefinition(HOBBY_SKILLS,READING_SKILL_ID);
      const currentXP=current.skills?.xpById?.[READING_SKILL_ID]||0;
      const level=currentSkillLevel(current.skills,HOBBY_SKILLS,READING_SKILL_ID);
      const nextXP=skill.xpThresholds[level]??skill.xpThresholds.at(-1);
      $('mind-reading-skill').textContent='Литературная эрудиция · уровень '+level+
        '/'+skill.maxLevel+' · '+Math.floor(currentXP)+' / '+nextXP+' опыта'+
        (current.action?.id==='hobby'&&current.action.phase==='using'?' · 📖 читает':'');
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
      const moodView=moodPresentation(current,game.world);
      const moodTrack=$('mood-overview');
      moodTrack.setAttribute('aria-valuenow',String(moodView.value));
      moodTrack.setAttribute('aria-valuetext',current.mind.mood.label+' — '+moodView.description);
      moodTrack.dataset.level=moodView.id;
      $('mood-overview-title').textContent=current.mind.mood.label;
      $('mood-overview-value').textContent=moodView.value+'/100';
      $('mood-overview-bar').style.width=moodView.value+'%';
      $('mood-overview-bar').style.background=moodView.color;
      $('mood-overview-reason').textContent=moodView.description;
      if(insightOpen)renderInsightPanel(false);
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
        const placed=furniturePoint(game.world,id,
          {x:meta.anchor[0],z:meta.anchor[2]});
        const el=markers[id];
        if(!placed){el.hidden=true;continue;}
        el.hidden=false;
        const p=camera.camera.worldToScreen(new pc.Vec3(placed.x,meta.anchor[1],placed.z));
        const x=p.x;
        const y=p.y; // PlayCanvas worldToScreen already returns CSS pixels.
        el.style.left=x+'px';el.style.top=y+'px';
        const pointInView=camera.camera.viewMatrix.transformPoint(
          new pc.Vec3(placed.x,meta.anchor[1],placed.z));
        el.hidden=pointInView.z>=0 || x<25 || x>canvas.clientWidth-30 || y<85 || y>canvas.clientHeight-116;
      }
    }
    if(autosaveTime>8){autosaveTime=0;save(true);}
  });
  app.start();
  // Count the scene after rendering has had a chance to draw its first frame.
  requestAnimationFrame(()=>requestAnimationFrame(()=>loadingProgress.finish('scene')));
  // A stalled optional GLB request may not hold the full-screen loader forever.
  const loadingWatchdog=setTimeout(()=>{
    if(loadingProgress.snapshot().completed<loadingProgress.snapshot().total){
      console.warn('3D loading timeout; proceeding with fallback');
      loadingProgress.failUnresolved();
    }
  },18000);
  void loadingProgress.wait().then(({failed})=>{
    clearTimeout(loadingWatchdog);
    $('loading').hidden=true;
    let seen='done';
    try{seen=localStorage.getItem(UI_TOUR_STORAGE_KEY);}
    catch{seen='done';/* Private mode never blocks loading. */}
    if(shouldShowTour(seen)&&!dialogueNeedsDecision(game))openTour();
    toast(failed
      ? 'Часть 3D-моделей недоступна — включены старые облики'
      : 'Коснись жителя или мебели · МЕТКИ — названия предметов');
  });
}

void (async()=>{
  // Optional Safari model cache must not indefinitely block 3D startup.
  await Promise.race([
    registerModelCache(),
    new Promise(resolve=>setTimeout(resolve,3500))
  ]);
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
