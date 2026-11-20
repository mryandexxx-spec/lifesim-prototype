import * as pc from 'playcanvas';
import {dialogueNeedsDecision,applyDialogueDecision} from './dialogue-decision.js';
import {pickWorldRayTarget} from './world-interactions.js';
import {planPreview,planTaskIcon} from './plan-preview.js';
import {residentMoodInsight,socialReactionInsight,insightLayerPolicy} from './insight-presentation.js';
import {contextualPlacement,viewMenuPlacement} from './ui-layout.js';
import {createRequiredChoiceFocus} from './required-choice-focus.js';
import {createLoadingProgress} from './loading-progress.js';
import {registerModelCache} from './model-cache.js';
import {CAMERA_INITIAL,CAMERA_LOT_BOUNDS,wheelCamera,setCameraBuildBounds} from './camera-controls.js';
import {createCameraGestureSession} from './camera-gestures.js';
import {installMobileGesturePolicy} from './mobile-gesture-policy.js';
import {createViewportHealth,viewportHealthLabel,viewportHealthReport} from './viewport-health.js';
import {UI_TOUR_STORAGE_KEY,createUITour,shouldShowTour} from './ui-onboarding.js';
import {HUD_COMPACT_KEY,createHudPanel} from './hud-panel.js';
import { ACTIONS, NEEDS, SAVE_KEY, AUTONOMY_WAIT_SECONDS, newGame, loadGame, chooseAction, arrive, tick, autonomousChoice, setAutonomyEnabled, advanceAutonomyWait, readableTime } from './simulation.js';
import {calendarAt,formatCalendarDay,setCurrentCalendarDate,toISODate,parseCivilDate,DEFAULT_CIVIL_DATE} from './calendar-core.js';
import {createDayNightRenderer} from './day-night-render.js';
import {createCalendarUI} from './calendar-ui.js';
import {consumeCalendarReminders} from './calendar-reminders.js';
import {createCareerPhoneUI} from './career-phone-ui.js';
import {pendingWorkIncident} from './career-incidents.js';
import {createCareerShiftSummaryUI} from './career-shift-summary-ui.js';
import {applyWorkMoodContext} from './career-worklife.js';
import {residentWorkPhase,residentUnavailableForHome,residentAwayAtWork,
  residentWorkStatus,arriveCareerPortal,finishCareerReturn} from './career-work.js';
import { findPath, nearestWalkable, isWalkable } from './navigation.js';
import {lotRaySurface,lotActorHeight,outdoorCellAt,OUTDOOR_GRID_WIDTH} from './lot-surface.js';
import {previewOutdoorPaint,commitOutdoorPreview,
  previewOutdoorFeatureEdit,commitOutdoorFeatureEdit} from './outdoor-proposals.js';
import {OUTDOOR_PRODUCTS,OUTDOOR_CATALOG,outdoorFeatureRect} from './outdoor-catalog.js';
import {outdoorBench,outdoorBenchApproach,outdoorBenchPose,
  outdoorBenchAvailable,outdoorLightFactor,OUTDOOR_LIGHT_LIMIT} from './outdoor-interactions.js';
import {isGardenItem,gardenView,gardenApproach,gardenActionAllowed,
  gardenRequestStillValid} from './gardening.js';
import {playerMayClaimGarden} from './garden-autonomy.js';
import {gardenWishCommand} from './garden-psychology.js';
import {gardenActionSheet} from './garden-presentation.js';
import {BUILD_TOOL_GROUPS,buildGroupForTool,describeBuildPreview} from './build-tool-palette.js';
import {createConstructionEditor,proposeConstructionEdit,nearestConstructionEdge,constructionWallOutward,
  starterShellSegments,constructionWallSegments,constructionOpeningEdgeIds,starterShellOffset,BUILD_LOT,BUILD_FINISHES,BUILD_OPENING_STYLES,
  BUILD_DEFAULT_OPENING_STYLE,constructionOpeningStyle,constructionBounds,
  constructionExteriorSegments,constructionPorches,constructionRoomSelection,
  BUILD_WALL_HEIGHTS,BUILD_FACADE_FINISHES,BUILD_PORCH_FINISHES} from './construction.js';
import {ROOF_STYLES,ROOF_MATERIALS,ROOF_PITCHES,ROOF_EAVES,
  roofContains,roofMeshGeometry} from './roof-construction.js';
import {FURNITURE_CATALOG,ORIGINAL_FURNITURE,LEGACY_FURNITURE_IDS,
  instanceRect,furnitureRenderOrigin,rotateLocal} from './furniture-catalog.js';
import {proposeFurnitureMove} from './furniture-layout.js';
import {F1_MOVEABLE_PREFABS,createFurnitureEditor,canMoveFurniture,
  snapFurnitureCoordinate,furnitureFloorPoint} from './furniture-editor.js';
import {FURNITURE_HOLD_MS,createFurnitureHoldGesture} from './furniture-hold.js';
import {SHOP_ITEMS,MARKET_OFFERS,findMarketPlacement,findStoredPlacement,buyMarketItem,storeMarketItem,restoreMarketItem,sellMarketItem,canTradeMarketInstance} from './furniture-shop.js';
import {recordFinanceChange} from './finance-ledger.js';
import {HOBBY_ACTIVITIES,HOBBY_SKILLS,HOBBY_CONTENT,READING_ACTIVITY_ID,READING_CONTENT_ID,READING_ADVANCED_CONTENT_ID,READING_SKILL_ID,MUSIC_ACTIVITY_ID,MUSIC_DANCE_ACTIVITY_ID,MUSIC_CONTENT_IDS,canReadHobbyContent} from './hobby-reading.js';
import {skillProfileRows} from './skill-presentation.js';
import {PAINT_ACTIVITY_ID,PAINT_CONTENT_IDS,PAINT_SUBJECTS,PAINT_SKILL_ID,PAINT_COMPOSITION_SHAPES,canPaintContent,
  compositionForArtwork,paintingSeedFromSession} from './painting.js';
import {COOKING_SKILL_ID,kitchenRecipe,canCookRecipe,kitchenSummary,
  preparedKitchenMeals,hasKitchenServing,chooseKitchenPlan} from './kitchen.js';
import {KITCHEN_RESTOCK_LABELS,quoteKitchenRestock,proposeKitchenRestock} from './kitchen-market.js';
import {easelPaintingPose,studioArtworkPose} from './painting-visual.js';
import {PAINT_WALL_SLOTS,availablePaintingWallSlots,artworkDisplayPose,
  paintingResaleCredits,transactPainting} from './painting-gallery.js';
import {readingStage,readingIsSeated,readingHasBook,readingRouteId,arriveReadingJourney} from './reading-journey.js';
import {getActivityDefinition} from './activity-registry.js';
import {getSkillDefinition} from './skill-registry.js';
import {currentSkillLevel} from './skills-engine.js';
import {createMusicAudio,audibleMusicStyle} from './music-audio.js';
import {chooseMusicListeningSpot,validMusicListeningSpot} from './music-listening.js';
import {selectShopCatalog,shopCategoryOptions} from './shop-catalog-selector.js';
import {describeObjectQualities,shopQualitySummary} from './object-quality-presentation.js';
import {compareShopVariants,formatShopVariantComparison,chooseComparableVariant} from './object-quality-comparison.js';
import {legacyObjectRegistry} from './object-legacy-adapter.js';
import {cameraPlacementPose,dragShopPlacement} from './furniture-placement-preview.js';
import {quoteOwnedPlacement,findOwnedPlacement} from './furniture-owned-preview.js';
import {furnitureProduct,FURNITURE_APPEARANCES,FURNITURE_SHOP_TYPES,
  PROCEDURAL_NEW_PREFABS,PROCEDURAL_DEFAULT_SKU} from './furniture-products.js';
import {proceduralFurnitureModel} from './furniture-procedural-library.js';
import {createMeshyFurnitureVisual} from './meshy-furniture-visual.js';
import {meshyStarterFurnitureSku,meshyFurnitureDisplaySku,meshyFurnitureThumbnailUrl} from './meshy-furniture-policy.js';
import {furnitureThumbnailFaces} from './furniture-thumbnails.js';
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
import {planButtonLabel,queueViewerResident,commandReceipt,offerForName} from './ux01-plan-ui.js';
import {effectiveSleepSpeed} from './sleep-acceleration.js';
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
import {createMeshyVisual} from './meshy-visual.js?v=1.2t';
import {createSeatSurface,seatSlot} from './interaction-anchors.js';
import {purchasedSeatPrefab,purchasedSeatPose,purchasedSeatSurface,
  purchasedDiningSeatPose,purchasedDiningSeatSurface} from './seat-furniture.js';
import {diningSeatApproach,diningPlatePosition,diningChairPullLimit,
  diningChairPullOffset} from './dining.js';
import {UTILITY_FURNITURE,UTILITY_ACTION_IDS,furnitureUseWeight,lampIsOn} from './furniture-interactions.js';
import {MOUNTED_LIGHTS,lightingMountPose,mountedAnchorAt,mountedLightIsOn,setMountedLightMode,
  mountedFixturesSurviveEdit,prioritizeVisibleLights} from './mounted-lighting.js';
import {createMiraMeshyVisual} from './meshy-mira-visual.js?v=1.2t';
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
import {planPairedHobby,livePairedHobby} from './paired-hobby.js';
import {createBedTransition,advanceBedTransition,bedTransitionPose,bedBeddingPose} from './bed-transition.js';
import {FRIDGE_LAYOUT,FRIDGE_FACING_YAW,fridgeSequence,closeFridgeDoor} from './fridge-interaction.js';
import {SHOWER_LAYOUT,createShowerTransition,advanceShowerTransition} from './shower-interaction.js';
import {TOILET_LAYOUT,createToiletTransition,advanceToiletTransition} from './toilet-interaction.js';
import {createPrivacyMosaicMaterial} from './privacy-mosaic.js';
import {proposeFurnishedRoomMove,createHouseholdConstructionEditor} from './furnished-room.js';
import { HOUSEHOLD_IDS, RESIDENT_NAMES, newHousehold, loadHousehold, getActor, getActorName,
  selectResident, furnitureAvailable, chooseResidentAction, setHouseholdAutonomy, tickHousehold,
  residentAutonomousChoice,residentGardenOpportunity,recordResidentGardenStart,
  bedDestinationFor,preemptAutomaticForManual,
  nearestAvailableDiningTable } from './household.js';

// A fully code-authored room: no PlayCanvas Editor or 3D asset pipeline required.
const $ = id => document.getElementById(id);
const canvas = $('game-canvas');
// Prevent Safari native selection/callouts on game UI without swallowing taps,
// camera pointer events, scrollable panels or editable field gestures.
installMobileGesturePolicy(document.querySelector('.app-shell'),canvas);
const intimacyVeil=$('intimacy-veil');
const loadingProgress=createLoadingProgress(['scene','alex','mira'],({completed,total,failed})=>{
  $('loading-count').textContent=completed+' / '+total;
  $('loading-bar').style.width=(completed/total*100)+'%';
  $('loading-status').textContent=failed
    ? 'Не все модели доступны — используем резервные облики'
    : completed===total?'Готово!':'Загружаем сцену и 3D-модели';
});
// Only propose the phone's LOCAL date at first creation/migration. Saved anchors win forever.
function suggestedGameDate(){
  try{
    const d=new Date();
    return toISODate({year:d.getFullYear(),month:d.getMonth()+1,day:d.getDate()});
  }catch{return DEFAULT_CIVIL_DATE;}
}
const calendarSuggestion=suggestedGameDate();
let game;
let calendarNeedsPersistence=false;
let billsNeedsPersistence=false;
try {
  const stored=JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
  billsNeedsPersistence=stored?.householdBills?.schema!==1;
  calendarNeedsPersistence=stored?.calendar?.schema!==1||
    !parseCivilDate(stored.calendar.startCivilDate);
  game=loadHousehold(stored,calendarSuggestion);
} catch {
  game=newHousehold(calendarSuggestion);
  calendarNeedsPersistence=true;
  billsNeedsPersistence=true;
}
const musicAudio=createMusicAudio();
let musicMutedByPlayer=false; // explicit silence wins over future Listen taps
const audioButton=$('music-audio-toggle');
function refreshMusicAudioButton(){
  const state=musicAudio.status();
  const audible=state.enabled&&!state.muted&&state.running;
  audioButton.textContent=audible?'🔊 Выключить звук':'🔇 Включить звук';
  audioButton.setAttribute('aria-pressed',String(audible));
  audioButton.title=state.enabled&&!state.running
    ?'Safari приостановил звук — коснитесь для возобновления'
    :'Звук звучит только во время прослушивания';
}
audioButton.addEventListener('click',async()=>{
  const state=musicAudio.status();
  if(state.enabled&&!state.muted&&state.running){
    musicMutedByPlayer=true;musicAudio.setMuted(true);
  }else{
    musicMutedByPlayer=false;await musicAudio.enable();
  }
  refreshMusicAudioButton();
});
refreshMusicAudioButton();
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

// Comfort C2: UI-only house tool picker. All editor mutations stay in
// the existing, tested Build/Furnish handlers.
let homeOpen=false;
function setHomeOpen(open,{restoreFocus=false}={}){
  if(open&&(dialogueNeedsDecision(game)||furnishMode||buildMode||outdoorMode))return;
  homeOpen=Boolean(open);
  $('home-panel').hidden=!homeOpen;
  $('home-open').setAttribute('aria-expanded',String(homeOpen));
  if(homeOpen){
    setViewOpen(false);
    calendarUI.close();closeCalendarAnchorPanel();
    closeTour();closeInsightPanel();closeMindPanel();closeSocialContext();select(null);
    queueVisible=false;renderQueuePanel(true);
    requestAnimationFrame(()=>$('home-furnish').focus({preventScroll:true}));
  }else if(restoreFocus)$('home-open').focus({preventScroll:true});
}
$('home-open').addEventListener('click',()=>setHomeOpen(!homeOpen));
$('home-close').addEventListener('click',()=>setHomeOpen(false,{restoreFocus:true}));
$('home-furnish').addEventListener('click',()=>{setHomeOpen(false);$('furnish-toggle').click();});
$('home-build').addEventListener('click',()=>{setHomeOpen(false);$('build-toggle').click();});
$('menu-rotate-btn').addEventListener('click',()=>$('rotate-camera-btn').click());
$('menu-reset-camera-btn').addEventListener('click',()=>$('reset-camera-btn').click());
const syncCameraMenu=()=>{
  const rotating=$('rotate-camera-btn').getAttribute('aria-pressed')==='true';
  $('menu-rotate-btn').setAttribute('aria-pressed',String(rotating));
  $('menu-rotate-btn').textContent=rotating?'⟳ Камера: вращение одним пальцем':'⟳ Камера: перемещение одним пальцем';
};
new MutationObserver(syncCameraMenu).observe($('rotate-camera-btn'),{
  attributes:true,attributeFilter:['aria-pressed']
});
syncCameraMenu();
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&homeOpen&&!dialogueNeedsDecision(game)){
    event.preventDefault();setHomeOpen(false,{restoreFocus:true});
  }
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
  if(open&&(dialogueNeedsDecision(game)||furnishMode||buildMode||outdoorMode))return;
  viewOpen=Boolean(open);
  $('view-panel').hidden=!viewOpen;
  $('view-toggle').setAttribute('aria-expanded',String(viewOpen));
  if(viewOpen){
    setHomeOpen(false);calendarUI.close();closeCalendarAnchorPanel();
    closeTour();closeMindPanel();closeInsightPanel();queueVisible=false;renderQueuePanel(true);
    closeSocialContext();
    select(null);
    requestAnimationFrame(()=>{positionViewPanel();$('view-panel').focus({preventScroll:true});});
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
  fridge: { title: 'Холодильник', category: 'Кухня', description: 'Быстрый перекус утоляет голод немного. Полноценный обед — за ближайшим подходящим столом', icon: '◕', anchor: [3.42, 2.13, -2.79] },
  shower: { title: 'Душевая', category: 'Ванная', description: 'Душ повышает уровень гигиены', icon: '✧', anchor: [-3.65, 2.16, 2.45] },
  toilet: { title: 'Унитаз', category: 'Ванная', description: 'Приватное использование туалета восстановит потребность', icon: 'WC', anchor: [-1.65, 1.28, 3.14] },
  sofa: { title: 'Диван', category: 'Гостиная', description: 'Отдых повышает уровень досуга', icon: '♫', anchor: [1.35, 1.38, 1.54] },
  seat: { title: 'Кресло или стул', category: 'Сиденья', description: 'Посидеть на выбранном предмете · без бонуса навыков', icon: '▣', anchor: [0,1.2,0] },
  dining: {title:'Обеденный стол',category:'Столовая',description:'Нужны холодильник и свободный стул лицом к столу. Житель возьмёт еду, сядет и поест.',icon:'🍽',anchor:[0,.85,0]},
  cook: {title:'Плита',category:'Кухня',description:'Холодильник → рабочая поверхность → плита. Готовые порции хранятся для обеда за столом.',icon:'🍳',anchor:[0,1.15,0]},
  prep: {title:'Рабочая поверхность',category:'Кухня',description:'Подготовка ингредиентов происходит здесь во время готовки.',icon:'▤',anchor:[0,1.05,0]},
  wash: {title:'Кухонная мойка',category:'Кухня',description:'Вымыть накопившуюся после обедов посуду.',icon:'◉',anchor:[0,1.12,0]},
  lamp: { title:'Торшер',category:'Освещение',description:'Переключить настоящий свет после подхода к выбранному торшеру',icon:'☀',anchor:[0,1.3,0] },
  mirror: { title:'Зеркало',category:'Уход за собой',description:'Подойти к зеркалу и привести себя в порядок',icon:'◇',anchor:[0,1.4,0] },
  dresser: { title:'Комод',category:'Хранение',description:'Подойти и открыть ящики или дверцы комода',icon:'▤',anchor:[0,.75,0] },
  wardrobe: { title:'Гардероб',category:'Хранение',description:'Подойти к шкафу и осмотреть одежду и полки',icon:'▥',anchor:[0,1.6,0] },
  tv: { title: 'Телевизор', category: 'Гостиная', description: 'Сядет на свободный диван с видом на экран или посмотрит стоя, если мест нет', icon: '▣', anchor: [3.5, 1.42, .36] },
  hobby: { title: 'Книжный шкаф', category: 'Гостиная',
    description: 'Подойти к шкафу, выбрать историю и почитать. Досуг растёт во время чтения, а навык — от практики.',
    icon: '📖', anchor: [0,1.5,0] },
  paint: {title:'Мольберт',category:'Творчество',description:'Рисовать настоящую картину · выбрать тему и пополнить личную коллекцию.',icon:'🎨',anchor:[0,1.4,0]},
  music: {title:'Музыкальный центр',category:'Гостиная',
    description:'Выбери музыкальный стиль: слушай спокойно или танцуй. Оба занятия сопровождаются движениями и звуком.',
    icon:'♫',anchor:[0,1.1,0]}
};

let updatePhoneProps=()=>{}; // Cosmetic phone mesh is bound when the 3D rigs exist.
let furnishMode=false; // F1 is an independent, unsaved UI mode; manual pause is untouched.
let buildMode=false; // F5-A separate pause-on-editor; house geometry persists, UI mode does not.
let outdoorMode=false; // LOT-B1 transient outdoor editor: world and credits still persist in root-v1.
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
let queueInspectResident=null;
let queueReceiptTimer=null;
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
function toast(message,{incidentResidentId=null}={}) {
  const el=$('toast');
  el.replaceChildren(document.createTextNode(message));
  el.classList.toggle('toast-actionable',Boolean(incidentResidentId));
  if(incidentResidentId&&pendingWorkIncident(game,incidentResidentId)){
    const button=document.createElement('button');
    button.type='button';button.className='toast-incident-cta';
    button.textContent='Решить';
    button.setAttribute('aria-label','Решить рабочую ситуацию: '+
      (incidentResidentId==='mira'?'Мира':'Алекс'));
    button.addEventListener('click',()=>openWorkIncident(incidentResidentId));
    el.append(button);
  }
  el.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout=setTimeout(()=>el.classList.remove('show'),incidentResidentId?8000:2600);
}
// Never serialize a not-yet-rendered fallback household during a failed 3D boot.
// The last valid on-device save stays byte-for-byte untouched until startup succeeds.
let bootReadyToSave=false;
function save(silent = false) {
  if(!bootReadyToSave)return false;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(game));
    if (!silent) toast('Игра сохранена на этом устройстве');
    return true;
  } catch {
    if (!silent) toast('Не удалось сохранить: браузер запретил хранилище');
    return false;
  }
}
// Fix the epoch at first migration, not on some later autosave after a phone date change.
// Save date/bill migrations only after graphics startup succeeds, never on a failed boot.
// W1-A.3 mobile calendar: one household date and one persistence root.
const datePanel=$('calendar-anchor-panel');
const calendarUI=createCalendarUI({
  host:document.querySelector('.app-shell'),getRoot:()=>game,
  setCalendar:calendar=>{game.calendar=calendar;save(true);},
  notify:toast,
  onClose:()=>$('calendar-anchor-toggle').setAttribute('aria-expanded','false'),
  onAnchor:()=>{datePanel.hidden=false;$('calendar-anchor-date').value=calendarAt(game.calendar,game.minutes).iso;
    $('calendar-anchor-toggle').setAttribute('aria-expanded','true');}
});
function closeCalendarAnchorPanel(){datePanel.hidden=true;$('calendar-anchor-toggle').setAttribute('aria-expanded','false');}
$('calendar-anchor-toggle').addEventListener('click',()=>{
  setHomeOpen(false);setViewOpen(false);closeMindPanel();
  closeCalendarAnchorPanel();calendarUI.open();
  $('calendar-anchor-toggle').setAttribute('aria-expanded','true');
});
$('calendar-anchor-close').addEventListener('click',closeCalendarAnchorPanel);
$('calendar-anchor-apply').addEventListener('click',()=>{
  try{
    game.calendar=setCurrentCalendarDate(game.calendar,game.minutes,$('calendar-anchor-date').value);
    save(true);closeCalendarAnchorPanel();calendarUI.refresh();
    toast('Игровая дата: '+formatCalendarDay(calendarAt(game.calendar,game.minutes),{includeYear:true}));
  }catch{toast('Дату нельзя менять после планирования событий.');}
});
function taskLabel(task){
  if(!task)return 'Неизвестное действие';
  if(task.type==='move')return 'Идти в указанное место';
  if(task.type==='outdoor')return 'Отдохнуть на садовой скамейке';
  if(task.type==='garden')return task.actionId==='water'?'Полить грядку':
    task.actionId==='inspect'?'Осмотреть растение':
    task.actionId==='harvest'?'Собрать садовые травы':
    task.actionId==='replant'?'Посадить травы заново':'Полюбоваться садом';
  if(task.type==='object')return ACTIONS[task.actionId]?.label||'Предмет';
  if(task.type==='activity')return task.inventoryItemId?'Читать подаренную книгу':
    getActivityDefinition(HOBBY_ACTIVITIES,task.activityId)?.label||'Хобби';
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
  if(command.type==='garden'){
    const actor=getActor(game,residentId);
    if(residentUnavailableForHome(game,residentId)||
      !playerMayClaimGarden(game,residentId,command.instanceId,command.actionId)||
      !gardenApproach(game.world,command.instanceId,actor.position)){
      toast('Садовое действие недоступно или грядка занята');return false;
    }
  }
  if(command.type==='outdoor'){
    const p=outdoorBenchApproach(game.world,command.instanceId);
    const actor=getActor(game,residentId);
    if(!p||!outdoorBenchAvailable(game,residentId,command.instanceId)||
      !findPath(actor.position,p,game.world)){
      toast('Скамейка недоступна или занята');return false;
    }
  }
  if(command.type==='move'){
    const person=getActor(game,residentId);
    if(!person||residentUnavailableForHome(game,residentId)||
      !isWalkable(command.x,command.z,game.world)||
      !findPath(person.position,{x:command.x,z:command.z},game.world)){
      toast('Путь к этой точке недоступен');return false;
    }
  }
  if(command.type==='object'||command.type==='activity'){
    const definition=command.type==='activity'
      ?getActivityDefinition(HOBBY_ACTIVITIES,command.activityId):null;
    const actionId=command.type==='activity'
      ?(definition?.requiredCapabilities.includes('music.playback')?'music':
        definition?.requiredCapabilities.includes('art.paint')?'paint':'hobby')
      :command.actionId;
    if(command.type==='object'&&actionId==='wash'&&!(game.kitchen?.dirtyDishes>0)){
      toast('Грязной посуды пока нет');return false;
    }
    if(command.type==='object'&&actionId==='cook'){
      const actor=getActor(game,residentId);
      const level=currentSkillLevel(actor.skills,HOBBY_SKILLS,COOKING_SKILL_ID);
      if(!canCookRecipe(game.kitchen,command.recipeId,level)){
        toast('Недостаточно продуктов, места для порций или навыка кулинарии');
        return false;
      }
    }
    if(command.type==='object'&&actionId==='dining'&&command.recipeId&&
      !hasKitchenServing(game.kitchen,command.recipeId)){
      toast('Выбранное блюдо закончилось в холодильнике');return false;
    }
    if(command.type==='object'&&actionId==='dining'&&command.autoTable===true){
      if(!nearestAvailableDiningTable(game,residentId)){
        toast('Для обеда нужны доступный обеденный стол и свободный стул');
        return false;
      }
      // The closest table is resolved again when the queued task starts.
    }else{
      const target=resolveActionFurniture(game.world,actionId,command.targetInstanceId);
      if(!target){toast('Этот предмет недоступен');return false;}
      command={...command,targetInstanceId:target.instanceId};
      if(command.type==='object'&&actionId==='cook'&&
        !chooseKitchenPlan(game.world,getActor(game,residentId).position,target.instanceId)){
        toast('Для готовки нужны доступные холодильник, рабочая поверхность и плита');
        return false;
      }
    }
    if(command.inventoryItemId&&!inventoryFor(game,residentId).some(item=>
      item.type==='book'&&item.id===command.inventoryItemId)){
      toast('Книга больше не принадлежит персонажу');return false;
    }
  }
  if(command.type==='shared'&&command.mode==='leisure'&&
    ['music','books'].includes(command.choiceId)){
    const station=resolveActionFurniture(game.world,
      command.choiceId==='music'?'music':'hobby',command.targetInstanceId);
    if(!station){toast('Нужен установленный предмет для совместного досуга');return false;}
    command={...command,targetInstanceId:station.instanceId};
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
  // If the player claims a plot currently used autonomously by the OTHER
  // resident, the automatic task yields after (never before) successful enqueue.
  if(command.type==='garden')for(const otherId of HOUSEHOLD_IDS){
    const other=getActor(game,otherId);
    if(other?.action?.id==='garden'&&other.action.automatic===true&&
      other.action.targetInstanceId===command.instanceId)
      onManualCommandQueued(preemptAutomaticForManual(game,otherId));
  }
  // One common, nonblocking receipt after an explicit furniture, ground or
  // outdoor confirmation. The pending entry is counted exactly once.
  renderQueuePanel(true);
  const position=pendingActions(game.actionQueues,residentId)
    .findIndex(entry=>entry.seq===task.seq)+1;
  const receipt=commandReceipt(getActorName(residentId),
    taskLabel({...task,residentId}),position);
  $('queue-feedback').textContent=receipt;
  const receiptEl=$('queue-receipt');
  receiptEl.textContent=receipt;receiptEl.hidden=false;
  if(queueReceiptTimer!==null)clearTimeout(queueReceiptTimer);
  queueReceiptTimer=setTimeout(()=>{receiptEl.hidden=true;queueReceiptTimer=null;},4200);
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
    setHomeOpen(false);setViewOpen(false);closeSocialContext();closeMindPanel();select(null);
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

// H4 — read-only projection of saved personal XP into an accessible tab.
let mindTab='overview',skillProfileKey='';
function renderSkillsTab(force=false){
  if(mindTab!=='skills'||$('mind-panel').hidden)return;
  const actor=selectedActor(),rows=skillProfileRows(actor.skills,HOBBY_SKILLS);
  const key=JSON.stringify([game.selectedSim,rows,actor.action?.phase,game.socialAction?.phase,actor.createdWorks]);
  if(!force&&skillProfileKey===key)return;
  skillProfileKey=key;
  const list=$('mind-skills-list');list.replaceChildren();
  for(const skill of rows){
    const card=document.createElement('article');card.className='skill-card';
    const header=document.createElement('div');header.className='skill-card-head';
    const title=document.createElement('strong');title.textContent=skill.label;
    const level=document.createElement('span');level.className='skill-card-level';
    level.textContent='Уровень '+skill.level+'/'+skill.maxLevel;
    header.append(title,level);
    const track=document.createElement('div');track.className='skill-card-progress';
    track.setAttribute('role','progressbar');track.setAttribute('aria-label','Прогресс: '+skill.label);
    track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');
    track.setAttribute('aria-valuenow',String(skill.percentage));
    track.setAttribute('aria-valuetext',skill.mastered?'Максимальный уровень':
      'Уровень '+skill.level+', '+Math.floor(skill.xp)+' из '+skill.next+' опыта');
    const fill=document.createElement('i');fill.style.width=skill.percentage+'%';track.append(fill);
    const status=document.createElement('div');status.className='skill-card-detail';
    status.textContent=skill.mastered?'Мастерство освоено · '+Math.floor(skill.xp)+' опыта':
      Math.floor(skill.xp)+' / '+skill.next+' опыта · осталось '+Math.ceil(skill.next-skill.xp);
    const reading=skill.id===READING_SKILL_ID&&(
      (actor.action?.id==='hobby'&&actor.action.phase==='using')||
      (game.socialAction?.shared?.choiceId==='books'&&game.socialAction.phase==='using'));
    const hint=document.createElement('p');hint.className='skill-card-hint';
    hint.textContent=(reading?'📖 Сейчас практикуется. ':'')+skill.hint;
    card.append(header,track,status,hint);
    const unlocks=document.createElement('div');unlocks.className='skill-unlocks';
    for(const item of skill.unlocks){
      const line=document.createElement('div');line.className='skill-unlock';
      line.dataset.unlocked=String(item.unlocked);
      line.textContent=item.unlocked?'✓ Освоено: '+item.label:
        '🔒 На уровне '+item.minLevel+' откроется: '+item.label;
      unlocks.append(line);
    }
    card.append(unlocks);list.append(card);
  }
  const portfolio=$('mind-painting-works');
  const works=Array.isArray(actor.createdWorks)?actor.createdWorks:[];
  portfolio.replaceChildren();
  const heading=document.createElement('strong');
  heading.textContent='Картины · '+works.length+'/24';
  portfolio.append(heading);
  if(!works.length){const empty=document.createElement('p');
    empty.textContent='Пока пусто. Купи мольберт и закончи рисунок.';
    portfolio.append(empty);
  }
  for(const work of [...works].reverse()){
    const item=document.createElement('div');item.className='skill-work';
    const status=work.location==='wall'?'На стене · место '+(work.wallSlot+1):
      work.location==='inventory'?'В инвентаре':
      work.location==='studio'?'В комнате':'Старая коллекция';
    const name=document.createElement('div');
    name.textContent=(PAINT_SUBJECTS[work.contentId]?.label||'Картина')+
      ' · качество '+work.quality+'/100 · '+status;
    item.append(name);
    const actions=document.createElement('div');actions.className='skill-work-actions';
    const command=(label,operation,slot=null)=>{
      const button=document.createElement('button');
      button.type='button';button.textContent=label;
      button.addEventListener('click',()=>{
        if(operation==='sell'&&!window.confirm('Продать картину за '+
          paintingResaleCredits(work)+' пробных кредитов?'))return;
        const result=transactPainting(game,game.selectedSim,work.id,operation,slot===null
          ?null:Number(slot.value));
        if(!result.ok){toast('Картина: действие недоступно ('+result.reason+')');return;}
        const finance=operation==='sell'
          ?recordFinanceChange(game,result.shop,{kind:'art-sale',
            sourceId:work.id,actorId:game.selectedSim,
            atGameMinute:Math.floor(game.minutes),
            receiptId:'art:'+game.selectedSim+':'+work.id})
          :null;
        if(finance&&!finance.ok){toast('Не удалось записать доход от картины');return;}
        selectedActor().createdWorks=result.works;
        if(result.shop)game.shop=finance?.shop||result.shop;
        if(finance)game.financialHistory=finance.financialHistory;
        updateFamilyBalance();save(true);renderSkillsTab(true);
        toast(operation==='sell'?'Картина продана · +'+result.amount+' кредитов':
          operation==='hang'?'Картина на стене':
          'Картина в личном инвентаре');
      });
      actions.append(button);return button;
    };
    if(work.location==='studio'||!work.kind)command('📦 В инвентарь','store');
    if(work.location==='wall')command('Снять со стены','store');
    if(work.location==='inventory'){
      const free=availablePaintingWallSlots(game),slots=document.createElement('select');
      slots.setAttribute('aria-label','Место картины на стене');
      for(const slot of free){
        const option=document.createElement('option');option.value=String(slot.id);
        option.textContent=slot.label;slots.append(option);
      }
      if(free.length){actions.append(slots);command('Повесить','hang',slots);}
      else{const note=document.createElement('small');note.textContent='Свободных мест нет';
        actions.append(note);}
      command('Продать · +'+paintingResaleCredits(work),'sell');
    }
    item.append(actions);portfolio.append(item);
  }
}
function setMindTab(tab){
  mindTab=tab==='skills'?'skills':'overview';
  for(const name of ['overview','skills']){
    const chosen=mindTab===name,b=$('mind-tab-'+name);
    b.setAttribute('aria-selected',String(chosen));b.tabIndex=chosen?0:-1;
    $(name==='overview'?'mind-overview':'mind-skills-tab').hidden=!chosen;
  }
  renderSkillsTab(true);
}
for(const tab of ['overview','skills'])
  $('mind-tab-'+tab).addEventListener('click',()=>setMindTab(tab));
function updateReadingContentChoice(){
  const select=$('reading-content-select');
  const option=select.querySelector('option[value="'+READING_ADVANCED_CONTENT_ID+'"]');
  const unlocked=canReadHobbyContent(selectedActor().skills,READING_ADVANCED_CONTENT_ID);
  option.disabled=!unlocked;
  option.textContent='Пути старых городов · '+(unlocked?'освоено':'откроется на уровне 3');
  if(!canReadHobbyContent(selectedActor().skills,select.value))select.value=READING_CONTENT_ID;
}
function closeMindPanel() {
  $('mind-panel').hidden = true;
  $('mind-toggle').setAttribute('aria-expanded', 'false');
}
$('mind-toggle').addEventListener('click', () => {
  const open = $('mind-panel').hidden;
  $('mind-panel').hidden = !open;
  $('mind-toggle').setAttribute('aria-expanded', String(open));
  if (open){
    setHomeOpen(false);closeInsightPanel();setViewOpen(false);closeSocialContext();
    queueVisible=false;renderQueuePanel(true);select(null);
  }
});
$('mind-close').addEventListener('click', closeMindPanel);
$('wish-do-btn').addEventListener('click', () => {
  const id = selectedActor().mind?.wish?.id;
  const command=id?.startsWith('garden.')?gardenWishCommand(game,game.selectedSim):
    id?{type:'object',actionId:id}:null;
  if (command && scheduleCommand(command)) {
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
  selectedFurnitureInstanceId=['sofa','seat','dining','cook','prep','wash','bed','tv','hobby','music','paint',...UTILITY_ACTION_IDS].includes(id)&&typeof instanceId==='string'
    ?instanceId:null;
  for (const [key, button] of Object.entries(markers)) button.classList.toggle('active', key === id);
  $('action-sheet').hidden = !id;
  $('hint').hidden = Boolean(id);
  if (!id) return;
  $('action-category').textContent = META[id].category;
  $('action-title').textContent = META[id].title;
  $('action-recipient').textContent=offerForName(getActorName(game.selectedSim));
  $('action-description').textContent = selectedFurnitureInstanceId
    ?(id==='bed'?'Сон в выбранной кровати · две независимые стороны и свой маршрут':
      id==='tv'?'Просмотр этого телевизора · с дивана, если он свободен и экран виден':
      id==='hobby'||id==='music'||id==='paint'||id==='seat'||id==='dining'||id==='cook'||id==='prep'||id==='wash'||UTILITY_ACTION_IDS.includes(id)?META[id].description:
      'Отдых на выбранном диване · собственный маршрут и место посадки')
    :META[id].description;
  if(['cook','fridge','dining','wash'].includes(id)){
    const k=kitchenSummary(game.kitchen);
    $('action-description').textContent+=' · Готовых порций: '+k.prepared+
      ' · Грязных тарелок: '+k.dirtyDishes+
      ' · Продукты (овощи/крупы/молоко): '+k.supplies+
      ' · Садовые травы: '+k.herbs+'/16';
  }
  $('fridge-prepared-field').hidden=id!=='fridge';
  $('fridge-staple-field').hidden=id!=='fridge';
  $('fridge-buy-button').hidden=id!=='fridge';
  if(id==='fridge'){
    const menu=$('fridge-prepared-select');
    menu.replaceChildren();
    const meals=preparedKitchenMeals(game.kitchen);
    for(const meal of meals){
      const option=document.createElement('option');
      option.value=meal.recipeId;
      option.textContent=meal.label+' · '+meal.portions+' порц.';
      menu.append(option);
    }
    if(!meals.length){
      const empty=document.createElement('option');
      empty.value='';empty.textContent='Готовой еды пока нет';
      menu.append(empty);
    }
    $('fridge-lunch-button').disabled=!meals.length;
    renderKitchenRestock();
  }
  $('cooking-recipe-field').hidden=!['cook','fridge'].includes(id);
  if(id==='cook'||id==='fridge'){
    const select=$('cooking-recipe-select');
    const level=currentSkillLevel(selectedActor().skills,HOBBY_SKILLS,COOKING_SKILL_ID);
    for(const option of select.options){
      const recipe=kitchenRecipe(option.value);
      option.disabled=!recipe||!canCookRecipe(game.kitchen,recipe.id,level);
      option.textContent=recipe?recipe.label+(level<recipe.minLevel
        ?' · 🔒 уровень '+recipe.minLevel
        :' · '+recipe.portions+' порции'):'Неизвестный рецепт';
    }
    if(select.selectedOptions[0]?.disabled)
      select.value=[...select.options].find(o=>!o.disabled)?.value||'';
  }
  $('music-style-field').hidden=id!=='music';
  $('reading-content-field').hidden=id!=='hobby';
  $('painting-theme-field').hidden=id!=='paint';
  if(id==='paint'){
    const menu=$('painting-theme-select');menu.replaceChildren();
    for(const contentId of PAINT_CONTENT_IDS){
      const theme=PAINT_SUBJECTS[contentId],allowed=canPaintContent(
        selectedActor().skills,HOBBY_SKILLS,contentId);
      const option=document.createElement('option');option.value=contentId;
      option.disabled=!allowed;
      option.textContent=theme.label+(allowed?' · доступно':
        ' · 🔒 уровень '+theme.minLevel);
      menu.append(option);
    }
    menu.value=PAINT_CONTENT_IDS[0];
  }
  if(id==='hobby'){$('reading-content-select').value=READING_CONTENT_ID;updateReadingContentChoice();}
  $('music-dance-button').hidden=id!=='music';
  $('fridge-lunch-button').hidden=id!=='fridge';
  $('fridge-cook-button').hidden=id!=='fridge';
  const lampLabel=id==='lamp'
    ?(lampIsOn(game?.world,selectedFurnitureInstanceId)?'Выключить торшер':'Включить торшер')
    :ACTIONS[id].label;
  $('action-button').innerHTML = `${lampLabel} <span>↗</span>`;
}
// LOT-C3b fridge groceries are voluntary and separately confirmed.
function renderKitchenRestock(){
  if(selected!=='fridge')return;
  const menu=$('fridge-staple-select');
  for(const option of menu.options){
    const qty=game.kitchen?.pantry?.[option.value]??0;
    option.textContent=KITCHEN_RESTOCK_LABELS[option.value]+' · '+qty+'/30';
  }
  const quote=quoteKitchenRestock(game,menu.value);
  const button=$('fridge-buy-button');
  button.disabled=!quote.ok;
  const labels={
    'pantry-full':'Нет места для +5 продуктов',
    'insufficient-credits':'Недостаточно кредитов',
    'missing-fridge':'Холодильник недоступен'
  };
  button.textContent=quote.ok?'🛒 Купить +5 · 15 кр.':
    (labels[quote.reason]||'Покупка недоступна');
}
$('fridge-staple-select').addEventListener('change',renderKitchenRestock);
$('fridge-buy-button').addEventListener('click',()=>{
  if(selected!=='fridge')return;
  const itemId=$('fridge-staple-select').value;
  const quote=quoteKitchenRestock(game,itemId);
  if(!quote.ok){renderKitchenRestock();toast('Покупка недоступна');return;}
  if(!window.confirm('Купить «'+quote.label+'» · +5 за 15 кредитов?'))return;
  const transaction=proposeKitchenRestock(game,itemId,game.selectedSim);
  if(!transaction.ok){renderKitchenRestock();toast('Баланс или запас изменились');return;}
  const oldKitchen=game.kitchen,oldShop=game.shop,oldHistory=game.financialHistory;
  game.kitchen=transaction.kitchen;game.shop=transaction.shop;
  game.financialHistory=transaction.financialHistory;
  // The whole monetary and stock state is committed as ONE localStorage snapshot.
  if(!save(true)){
    game.kitchen=oldKitchen;game.shop=oldShop;game.financialHistory=oldHistory;
    toast('Не удалось сохранить покупку · списания нет');return;
  }
  updateFamilyBalance();select('fridge');
  $('fridge-staple-select').value=itemId;renderKitchenRestock();
  toast('Куплено: '+quote.label+' +5 · −15 кредитов');
});
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
  if(selected==='paint'&&!canPaintContent(selectedActor().skills,HOBBY_SKILLS,
    $('painting-theme-select').value)){
    toast('Тема картины ещё не открыта · практикуй живопись');return;
  }
  const command=selected==='hobby'
    ?{type:'activity',activityId:READING_ACTIVITY_ID,
      contentId:canReadHobbyContent(selectedActor().skills,$('reading-content-select').value)
        ?$('reading-content-select').value:READING_CONTENT_ID,
      ...(selectedFurnitureInstanceId?{targetInstanceId:selectedFurnitureInstanceId}:{})}
    :selected==='music'
      ?{type:'activity',activityId:MUSIC_ACTIVITY_ID,
        contentId:MUSIC_CONTENT_IDS.includes($('music-style-select').value)
          ?$('music-style-select').value:MUSIC_CONTENT_IDS[0],
        ...(selectedFurnitureInstanceId?{targetInstanceId:selectedFurnitureInstanceId}:{})}
      :selected==='paint'
        ?{type:'activity',activityId:PAINT_ACTIVITY_ID,
          contentId:PAINT_CONTENT_IDS.includes($('painting-theme-select').value)
            ?$('painting-theme-select').value:PAINT_CONTENT_IDS[0],
          ...(selectedFurnitureInstanceId?{targetInstanceId:selectedFurnitureInstanceId}:{})}
      :selected==='cook'
        ?{type:'object',actionId:'cook',recipeId:$('cooking-recipe-select').value,
          ...(selectedFurnitureInstanceId?{targetInstanceId:selectedFurnitureInstanceId}:{})}
        :{type:'object',actionId:selected,
          ...(selectedFurnitureInstanceId?{targetInstanceId:selectedFurnitureInstanceId}:{})};
  // A tap on the explicit "Listen to music" action is itself an iOS user
  // gesture: unlock audio HERE rather than requiring an unrelated View menu.
  // Never re-enable after the player has deliberately selected Mute.
  if(selected==='music'&&!musicMutedByPlayer&&
    (!musicAudio.status().enabled||!musicAudio.status().running)){
    void musicAudio.enable().then(ok=>{
      refreshMusicAudioButton();
      if(!ok)toast('Звук Safari недоступен. Действие выполняется без аудио.');
    });
  }
  if (scheduleCommand(command)) {
    select(null);
  }
});
// F4G.2: fridge pop-up lists the actual stored recipe and remaining portions.
$('fridge-lunch-button').addEventListener('click',()=>{
  if(selected!=='fridge')return;
  const recipeId=$('fridge-prepared-select').value;
  if(!hasKitchenServing(game.kitchen,recipeId)){
    toast('Сначала приготовь блюдо');return;
  }
  if(scheduleCommand({type:'object',actionId:'dining',autoTable:true,recipeId}))select(null);
});
// The fridge can start a full recipe too: walk fridge → prep → selected real stove.
$('fridge-cook-button').addEventListener('click',()=>{
  if(selected!=='fridge')return;
  const resident=selectedActor(),recipeId=$('cooking-recipe-select').value;
  const stove=game.world.furniture.instances
    .filter(item=>item.prefabId==='stove'&&item.location==='home'&&
      furnitureAvailable(game,'cook',game.selectedSim,item.instanceId)&&
      chooseKitchenPlan(game.world,resident.position,item.instanceId))
    .sort((a,b)=>Math.hypot(a.x-resident.position.x,a.z-resident.position.z)-
      Math.hypot(b.x-resident.position.x,b.z-resident.position.z)||
      a.instanceId.localeCompare(b.instanceId))[0];
  if(!stove){toast('Для готовки купи плиту и рабочую поверхность');return;}
  if(scheduleCommand({type:'object',actionId:'cook',recipeId,
    targetInstanceId:stove.instanceId}))select(null);
});
// Dance is an independent activity queued against the same physical stereo.
// This click also provides the genuine Safari gesture for Web Audio unlock.
$('music-dance-button').addEventListener('click',()=>{
  if(selected!=='music')return;
  const command={type:'activity',activityId:MUSIC_DANCE_ACTIVITY_ID,
    contentId:MUSIC_CONTENT_IDS.includes($('music-style-select').value)
      ?$('music-style-select').value:MUSIC_CONTENT_IDS[0],
    ...(selectedFurnitureInstanceId?{targetInstanceId:selectedFurnitureInstanceId}:{})};
  if(!musicMutedByPlayer&&
    (!musicAudio.status().enabled||!musicAudio.status().running)){
    void musicAudio.enable().then(ok=>{
      refreshMusicAudioButton();
      if(!ok)toast('Звук Safari недоступен. Танец выполняется без аудио.');
    });
  }
  if(scheduleCommand(command))select(null);
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
  setHomeOpen(false);closeInsightPanel();queueVisible=false;renderQueuePanel(true);
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
  return actor.action
    ?(actor.action.id==='music'
      ?getActivityDefinition(HOBBY_ACTIVITIES,actor.action.activityId)?.label
      :null)||ACTIONS[actor.action.id]?.label||'Занятие'
    :null;
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
    const duration=getActivityDefinition(HOBBY_ACTIVITIES,actor.action.activityId)?.timeBudget.targetMinutes??ACTIONS[actor.action.id]?.duration;
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
  $('plan-label').textContent=planButtonLabel(pendingActions(game.actionQueues,residentId).length);
  $('plan-resident').textContent='Управляешь: '+getActorName(residentId);
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
  button.setAttribute('aria-label',planButtonLabel(pendingActions(game.actionQueues,residentId).length)+' · '+plan.accessible);
}
$('plan-peek').addEventListener('click',()=>{
  if(dialogueNeedsDecision(game))return;
  setHomeOpen(false);closeInsightPanel();setViewOpen(false);closeSocialContext();select(null);closeMindPanel();
  queueInspectResident=game.selectedSim;
  queueVisible=!queueVisible;
  renderQueuePanel(true);
});
function renderQueuePanel(force=true){
  renderPlanPeek();
  const residentId=queueViewerResident(game.selectedSim,queueInspectResident);
  const pending=pendingActions(game.actionQueues,residentId);
  const active=activeTaskLabel(residentId);
  const key=JSON.stringify([queueVisible,residentId,game.selectedSim,pending,active,
    HOUSEHOLD_IDS.map(id=>pendingActions(game.actionQueues,id).length),
    game.socialAction?.phase,
    getActor(game,residentId).action?.phase,
    (game.socialAction?.eveningStage||game.socialAction?.eveningSofa)&&
      game.socialAction.phase==='using'
      ?Math.floor(game.socialAction.elapsed/3):null]);
  $('queue-toggle').textContent=planButtonLabel(pendingActions(game.actionQueues,game.selectedSim).length);
  if(!force&&key===queueDisplayKey)return;
  queueDisplayKey=key;
  $('queue-panel').hidden=!queueVisible;
  $('queue-toggle').setAttribute('aria-expanded',String(queueVisible));
  $('plan-peek').setAttribute('aria-expanded',String(queueVisible));
  if(!queueVisible)return;
  $('queue-title').textContent='План · '+getActorName(residentId);
  for(const id of HOUSEHOLD_IDS){
    $('queue-'+id).textContent=getActorName(id)+' · '+pendingActions(game.actionQueues,id).length;
    $('queue-'+id).setAttribute('aria-pressed',String(id===residentId));
  }
  $('queue-person-note').textContent=residentId===game.selectedSim
    ?'Сейчас управляешь: '+getActorName(game.selectedSim)+'.'
    :'Просмотр плана '+getActorName(residentId)+'. Сейчас управляешь: '+
       getActorName(game.selectedSim)+'. Просмотр не переключает управление.';
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
    remove.type='button';remove.textContent='Убрать';
    remove.setAttribute('aria-label','Удалить из очереди: '+taskLabel({...task,residentId}));
    remove.addEventListener('click',()=>{
      if(removeQueuedAction(game.actionQueues,residentId,task.seq)){
        $('queue-feedback').textContent=getActorName(residentId)+
          ': убрано будущее действие — '+taskLabel({...task,residentId});
        renderQueuePanel(true);save(true);
        $('queue-'+residentId).focus({preventScroll:true});
      }
    });
    li.append(name,remove);list.append(li);
  }
  $('queue-empty').hidden=pending.length>0;
}
$('queue-toggle').addEventListener('click',()=>{
  if(dialogueNeedsDecision(game))return;
  closeInsightPanel();setViewOpen(false);closeSocialContext();select(null);closeMindPanel();
  queueInspectResident=game.selectedSim;
  queueVisible=!queueVisible;renderQueuePanel();
});
for(const id of HOUSEHOLD_IDS)$('queue-'+id).addEventListener('click',()=>{
  if(dialogueNeedsDecision(game))return;
  queueInspectResident=id;
  renderQueuePanel(true);
  $('queue-'+id).focus({preventScroll:true});
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
    options.append(conversationButton(def.symbol+' Подарить: '+def.label,()=>{
      if(queuedSocial('shared',{mode:'gift',choiceId:item.id})){
        sharedPicker=false;renderSharedPanel();
      }
    }));
    if(item.type==='book'){
      const shelf=game.world.furniture.instances.find(candidate=>
        resolveActionFurniture(game.world,'hobby',candidate.instanceId));
      const read=conversationButton('📖 Читать свою книгу · подарок сохраняется',()=>{
        if(shelf&&scheduleCommand({type:'activity',activityId:READING_ACTIVITY_ID,
          contentId:READING_CONTENT_ID,targetInstanceId:shelf.instanceId,
          inventoryItemId:item.id})){
          sharedPicker=false;renderSharedPanel();
        }
      },true);
      read.disabled=!shelf;options.append(read);
      if(!shelf){const hint=document.createElement('p');hint.className='shared-progress-text';
        hint.textContent='Для чтения своей книги сначала установи книжную полку';options.append(hint);}
    }
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
    if(id==='books'||id==='music'){
      const stations=game.world.furniture.instances.filter(item=>
        resolveActionFurniture(game.world,id==='books'?'hobby':'music',item.instanceId));
      if(!stations.length){const hint=document.createElement('p');hint.className='shared-progress-text';
        hint.textContent=def.symbol+' '+def.label+' · нужен установленный '+
          (id==='books'?'книжный шкаф':'музыкальный центр');options.append(hint);}
      for(const item of stations){
        options.append(conversationButton(def.symbol+' '+def.label+
          (stations.length>1?' · '+item.instanceId:''),()=>{
          if(id==='music'&&!musicMutedByPlayer&&
            (!musicAudio.status().enabled||!musicAudio.status().running))
            void musicAudio.enable().then(()=>refreshMusicAudioButton());
          if(queuedSocial('shared',{mode:'leisure',choiceId:id,
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
    setHomeOpen(false);setViewOpen(false);closeInsightPanel();
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
  const paused=game.paused||blocked||furnishMode||buildMode||outdoorMode;
  $('pause-icon').textContent=paused?'▶':'Ⅱ';
  $('pause-btn').setAttribute('aria-label',blocked
    ?'Выбери реплику: игровое время остановлено'
    :outdoorMode?'Участок: игровое время остановлено'
    :buildMode?'Строительство: игровое время остановлено'
    :furnishMode?'Обстановка: игровое время остановлено'
      :paused?'Продолжить':'Пауза');
}
$('pause-btn').addEventListener('click', () => {
  if(dialogueNeedsDecision(game)||careerPhone.interviewNeedsDecision()||furnishMode)return;
  if(buildMode||outdoorMode)return;
  game.paused = !game.paused;
  renderPauseButton();
  toast(game.paused ? 'Симуляция на паузе' : 'Время снова идёт');
});
$('speed-btn').addEventListener('click', () => {
  if(furnishMode||buildMode||outdoorMode)return;
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
  if(furnishMode||buildMode||outdoorMode)return;
  const enabled = setHouseholdAutonomy(game, !game.autonomy.enabled);
  restartAutonomyWait();
  if (enabled) game.event = 'Свободное время';
  updateAutoButton();
  save(true);
  toast(enabled ? 'Автономность включена. Жители скоро решат, чем заняться.'
    : 'Автономность выключена. Оба жителя ждут твоих команд.');
});
updateAutoButton();
// W4-B: no second wallet, only a presentation of the single family credits balance.
const familyFunds=$('family-balance-chip');
let shownFamilyCredits=null;
function updateFamilyBalance(){
  const amount=game.shop?.credits??0;
  if(amount===shownFamilyCredits)return;
  shownFamilyCredits=amount;
  familyFunds.textContent='Семья · '+amount.toLocaleString('ru-RU')+' кр.';
  familyFunds.setAttribute('aria-label',
    'Общий баланс семьи '+amount+' кредитов. Открыть финансы');
}
// The compact career line follows the selected person, even while the avatar
// is physically away. It does not create a second work clock or state.
const workHud=document.createElement('small');
workHud.id='career-work-hud';
workHud.className='career-work-hud';
$('resident-name').insertAdjacentElement('afterend',workHud);
const incidentBadge=document.createElement('b');
incidentBadge.id='career-incident-badge';
incidentBadge.className='career-incident-badge';
incidentBadge.hidden=true;
$('career-phone-toggle').append(incidentBadge);
function refreshIncidentNotifications(){
  const ids=HOUSEHOLD_IDS.filter(id=>pendingWorkIncident(game,id));
  incidentBadge.hidden=ids.length===0;
  incidentBadge.textContent=String(ids.length);
  $('career-phone-toggle').setAttribute('aria-label',
    ids.length?'Рабочие ситуации: '+ids.length+' требуют решения. Открыть смартфон':
      'Открыть работу и график выбранного жителя');
}
function updateCareerHud(){
  const status=residentWorkStatus(game,game.selectedSim);
  workHud.hidden=!status;
  const pending=game.careerSystem?.byResident?.[game.selectedSim]?.currentShift?.incident;
  workHud.textContent=(pending?.choiceId===null?'📩 Рабочая ситуация · ':'')+(status?.label||'');
}
function updateResidentPicker() {
  for (const id of HOUSEHOLD_IDS) {
    $('pick-'+id).setAttribute('aria-pressed',String(game.selectedSim===id));
  }
  $('resident-name').textContent=selectedName();
  updateCareerHud();updateFamilyBalance();refreshIncidentNotifications();
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
    careerPhone.close({focus:false});setHomeOpen(false);setViewOpen(false);
    selectResident(game,id);closeInsightPanel();
    conversationTopicPicker=false;sharedPicker=false;branchPicker=false;
    socialMenuCategory=null;socialContextVisible=false;socialAnchor=null;
    select(null); closeMindPanel();queueInspectResident=id; updateResidentPicker();renderSocialContext();
    renderConversationPanel();renderSharedPanel();renderBranchPanel();
    renderSocialMenu();renderQueuePanel();save(true);
    toast('Теперь управляешь: '+selectedName());
  });
}
updateResidentPicker();
// W1-B.3a: the existing phone now shows live shift presence, pay and attendance.
const careerPhone=createCareerPhoneUI({
  host:document.querySelector('.app-shell'),trigger:$('career-phone-toggle'),
  financeTrigger:$('family-balance-chip'),getRoot:()=>game,
  setCareerSystem:state=>{
    game.careerSystem=state;applyWorkMoodContext(game);calendarUI.refresh();
  },
  save,notify:toast,onFundsChanged:updateFamilyBalance,
  onOpenChange:id=>updatePhoneProps(id),
  onIncidentChanged:()=>{updateCareerHud();refreshIncidentNotifications();},
  selectResident:id=>{
    if(!HOUSEHOLD_IDS.includes(id))return false;
    if(game.selectedSim!==id){
      selectResident(game,id);
      updateResidentPicker();save(true);
    }
    return true;
  },
  canOpen:()=>!furnishMode&&!buildMode&&!outdoorMode&&!dialogueNeedsDecision(game),
  beforeOpen:()=>{
    calendarUI.close();closeCalendarAnchorPanel();setHomeOpen(false);
    closeMindPanel();closeInsightPanel();setViewOpen(false);closeSocialContext();select(null);
  }
});
function openWorkIncident(residentId){
  if(!pendingWorkIncident(game,residentId))return false;
  return careerPhone.openIncident(residentId);
}
const shiftSummary=createCareerShiftSummaryUI({
  host:document.querySelector('.app-shell'),getRoot:()=>game,
  shouldDefer:()=>dialogueNeedsDecision(game)||careerPhone.isOpen()||
    document.querySelector('.life-calendar:not([hidden])')!==null,
  onDismissal:residentId=>{
    if(game.selectedSim!==residentId){
      selectResident(game,residentId);
      updateResidentPicker();
      save(true);
    }
    careerPhone.open();
  }
});
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
  careerPhone.close({focus:false});shiftSummary.clear();
  const enabled = game.autonomy.enabled;
  game = newHousehold();
  setHouseholdAutonomy(game, enabled); // Keep the player's chosen play style.
  closeInsightPanel();calendarUI.reset();resetRuntime(); restartAutonomyWait(); updateAutoButton(); updateResidentPicker();
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

  // Q0: game simulation can pause intentionally while PlayCanvas must keep
  // rendering. Observe engine update and real postrender independently, even
  // when game input and ordinary DOM save buttons still work.
  const viewportHealth=createViewportHealth();
  viewportHealth.begin(performance.now());
  const viewportPanel=$('viewport-recovery');
  let viewportManual=false,viewportDismissed=null,viewportIssue=null;
  let activeViewportPointers=()=>0;
  let viewportReport='';
  const viewportSnapshot=()=>viewportHealth.inspect(performance.now(),{
    hidden:document.hidden,paused:game.paused||furnishMode||buildMode||outdoorMode||
      dialogueNeedsDecision(game)||shiftSummary.isOpen(),
    mode:outdoorMode?'outdoors':buildMode?'build':furnishMode?'furnish':'play',
    pointers:activeViewportPointers(),
    canvasWidth:canvas.clientWidth,canvasHeight:canvas.clientHeight,
    dpr:app.graphicsDevice.maxPixelRatio,
    outdoorFeatures:game.world.outdoors?.features?.length||0,
    furniture:game.world.furniture?.instances?.length||0
  });
  const refreshViewportPanel=()=>{
    const snapshot=viewportSnapshot(),status=snapshot.status;
    const bad=['webgl-lost','update-stall','render-stall'].includes(status);
    if(bad&&viewportIssue!==status){viewportIssue=status;viewportDismissed=null;
      viewportHealth.markError('viewport-'+status,performance.now());}
    if(!bad){viewportIssue=null;viewportDismissed=null;}
    const show=viewportManual||(bad&&viewportDismissed!==status);
    viewportPanel.hidden=!show;
    if(!show)return;
    $('viewport-health-title').textContent=viewportHealthLabel(status);
    $('viewport-health-message').textContent=status==='healthy'
      ?snapshot.paused
        ?'Графика работает. Игровое время или действия сейчас приостановлены намеренно.'
        :'Графика обновляется. Если касания не работают, скопируйте отчёт и проверьте режим управления.'
      :status==='webgl-lost'
        ?'Safari потерял WebGL-контекст. Игра не будет перезагружена без вашего согласия.'
        :status==='update-stall'||status==='render-stall'
          ?'3D перестал отвечать. Можно сохранить прогресс и вручную перезагрузить изображение.'
          :'Проверка продолжается. При сворачивании Safari останавливает кадры — это нормально.';
    viewportReport=viewportHealthReport(viewportSnapshot());
    $('viewport-health-details').textContent=viewportReport;
  };
  $('viewport-health-open').addEventListener('click',()=>{
    setViewOpen(false);viewportManual=true;refreshViewportPanel();
  });
  $('viewport-health-close').addEventListener('click',()=>{
    viewportManual=false;viewportDismissed=viewportSnapshot().status;
    viewportPanel.hidden=true;
  });
  $('viewport-health-copy').addEventListener('click',async()=>{
    refreshViewportPanel();
    try{
      if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(viewportReport);
      toast('Диагностика 3D скопирована');
    }catch{
      toast('Не удалось скопировать: можно сделать снимок экрана');
    }
  });
  $('viewport-health-reload').addEventListener('click',()=>{
    // A failed write is a hard stop: never erase unsaved household progress.
    if(!save(true)){
      $('viewport-health-message').textContent=
        'Сохранение не удалось. Не перезагружайте страницу, пока Safari не разрешит сохранение.';
      return;
    }
    window.location.reload();
  });
  canvas.addEventListener('webglcontextlost',event=>{
    event.preventDefault(); // Permit WebGL's context-restoration mechanism.
    viewportHealth.loseContext(performance.now());refreshViewportPanel();
  },false);
  canvas.addEventListener('webglcontextrestored',()=>{
    viewportHealth.restoreContext(performance.now());refreshViewportPanel();
  },false);
  app.on('postrender',()=>viewportHealth.markRender(performance.now()));
  // This timer is intentionally outside app.on('update'): a broken game loop
  // cannot silence the watchdog while ordinary HTML controls still function.
  window.setInterval(refreshViewportPanel,2600);

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
  // Meshy is a visual override only: original action, collision, price and saves stay canonical.
  // ?furniture=legacy restores ALL procedural furniture for Safari diagnosis.
  const furnitureVisualMode=new URLSearchParams(window.location.search).get('furniture');
  const meshyFurniture=createMeshyFurnitureVisual({pc,app,
    enabled:furnitureVisualMode!=='legacy'});
  if(furnitureVisualMode==='qa')window.__LifeSimMeshyFurnitureStats=meshyFurniture.stats;
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
  // Only actual purchased instances get meshes. A hidden template for a
  // new prefab is EMPTY: the recipe is attached on demand after clone.
  // Each product's modelKey may be mapped to an optimized Meshy GLB later.
  const applySkuModel=(node,itemDefinitionId)=>{
    if(!node)return;
    const product=furnitureProduct(itemDefinitionId);
    const recipe=proceduralFurnitureModel(product?.modelKey);
    if(recipe){
      const hide=new Set(recipe.hideBase);
      const hideNamed=nodePart=>{
        if(hide.has(nodePart.name))nodePart.enabled=false;
        for(const child of nodePart.children||[])hideNamed(child);
      };
      if(hide.size)hideNamed(node);
      for(const part of recipe.parts){
        if(!variantMaterials.has(part.color))
          variantMaterials.set(part.color,mat(part.color));
        const mesh=primitive(part.kind,'SKU '+recipe.modelKey+' '+part.name,
          part.x,part.y,part.z,part.sx,part.sy,part.sz,
          variantMaterials.get(part.color),node);
        if(part.rotation)mesh.setLocalEulerAngles(...part.rotation);
      }
    }
    applyItemAppearance(node,itemDefinitionId);
  };
  const decorNodes=new Map();
  // H5c: cache the 78 theme stroke entities per easel for Safari performance.
  const paintStrokeCache=new WeakMap();
  const decorTemplates=new Map();
  const f4eOriginalPositions=new WeakMap();
  // H5: bounded brush compositions come from the testable data-only catalog.
  // Meshes are created once per bought easel; only visibility changes.
  let decorDrawing=null;
  let refreshSofaSeat=()=>{};
  const withDecor=(prefabId,render)=>{
    const origin=furnitureRenderOrigin(prefabId);
    if(!origin)throw new Error('Unknown furniture renderer origin: '+prefabId);
    const templateOnly=origin.location==='template';
    const current=templateOnly?origin:
      game.world.furniture.instances.find(i=>i.instanceId===origin.instanceId)||
      {...origin,location:'storage'};
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
    // Adopt Meshy for original household furniture when the fixture exists.
    if(!templateOnly)meshyFurniture.attach(node,meshyStarterFurnitureSku(prefabId));
  };
  const updateDecorNodes=(previewId=null,previewPose=null)=>{
    const items=game.world.furniture.instances;
    for(const item of items){
      if(decorNodes.has(item.instanceId))continue;
      const template=decorTemplates.get(item.prefabId);
      if(!template||!MARKET_OFFERS.some(s=>s.prefabId===item.prefabId))continue;
      const node=template.clone();
      node.name='F2 purchased / '+item.instanceId;
      applySkuModel(node,item.itemDefinitionId||
        PROCEDURAL_DEFAULT_SKU[item.prefabId]);
      if(item.prefabId==='easel'){
        for(const contentId of PAINT_CONTENT_IDS){
          PAINT_COMPOSITION_SHAPES[contentId].forEach(([kind,x,y,sx,sy,paletteIndex],i)=>{
            const color=PAINT_SUBJECTS[contentId].palette[paletteIndex];
            const stroke=primitive(kind,'H5 paint '+contentId+' '+i,
              x,y,-.181-i*.0007,sx,sy,.009,mat(color),node);
            stroke.enabled=false;
          });
        }
      }
      // F4E: each bought lamp has a real world-space light source and a
      // tiny emissive bulb. Parent it to the persistent instance node, so
      // rotating/storing/moving the furniture cannot leave orphan lights.
      if(item.prefabId==='floorlamp'){
        const light=new pc.Entity('F4E lamp light');
        const arc=furnitureProduct(item.itemDefinitionId)?.modelKey==='floorlamp.arc';
        light.setLocalPosition(arc ? .48 : 0,arc ? 1.23 : 1.48,0);
        light.addComponent('light',{type:'omni',
          color:new pc.Color(1,.80,.54),intensity:.75,range:4.6,
          castShadows:false});
        const glow=new pc.Entity('F4E lamp bulb');
        glow.addComponent('render',{type:'sphere',
          material:mat('#ffdb94',{emissive:1.1})});
        glow.setLocalScale(.20,.16,.20);
        light.addChild(glow);node.addChild(light);
        light.light.enabled=false;glow.enabled=false;
      }
      // C3: one cached, shadow-free warm light per actual mounted paid fixture.
      if(MOUNTED_LIGHTS[item.itemDefinitionId]){
        const light=new pc.Entity('C3 mounted lamp light');
        light.setLocalPosition(0,-.24,item.prefabId==='walllight' ? -.24 : 0);
        light.addComponent('light',{type:'omni',color:new pc.Color(1,.84,.61),
          intensity:item.prefabId==='walllight'?.70:.91,
          range:item.prefabId==='walllight'?3.1:4.2,castShadows:false});
        const bulb=new pc.Entity('C3 mounted bulb');
        bulb.addComponent('render',{type:'sphere',material:mat('#fff4d0',{emissive:1.1})});
        bulb.setLocalScale(.11,.11,.11);
        light.addChild(bulb);node.addChild(light);
        light.light.enabled=false;bulb.enabled=false;
      }
      // F4G cookware is attached to the specific purchased appliance, never to the room.
      if(item.prefabId==='stove'){
        const pot=new pc.Entity('F4G cooking pot');
        pot.addComponent('render',{type:'cylinder',material:mat('#796f68')});
        pot.setLocalPosition(0,1.075,-.09);
        pot.setLocalScale(.51,.18,.47);node.addChild(pot);pot.enabled=false;
        for(let i=0;i<3;i++){
          const steam=new pc.Entity('F4G cooking steam '+i);
          steam.addComponent('render',{type:'sphere',material:mat('#e8f4ee',{opacity:.50})});
          steam.setLocalScale(.09+i*.025,.18+i*.02,.09+i*.025);
          steam.setLocalPosition((i-1)*.12,1.32+i*.13,-.10);
          node.addChild(steam);steam.enabled=false;
        }
        const spoon=new pc.Entity('F4G stirring spoon');
        spoon.addComponent('render',{type:'box',material:mat('#bd8b54')});
        spoon.setLocalScale(.035,.40,.04);spoon.setLocalPosition(.14,1.27,-.05);
        node.addChild(spoon);spoon.enabled=false;
      }
      if(item.prefabId==='prep'){
        const chopped=new pc.Entity('F4G chopped ingredients');
        chopped.addComponent('render',{type:'sphere',material:mat('#91ae67')});
        chopped.setLocalScale(.36,.095,.25);
        chopped.setLocalPosition(-.17,1.0,-.12);
        node.addChild(chopped);chopped.enabled=false;
        const prepBowl=new pc.Entity('F4G prep bowl');
        prepBowl.addComponent('render',{type:'cylinder',material:mat('#e6dfcb')});
        prepBowl.setLocalScale(.27,.10,.27);
        prepBowl.setLocalPosition(.26,1.035,-.21);
        node.addChild(prepBowl);prepBowl.enabled=false;
      }
      if(item.prefabId==='sink'){
        const plate=new pc.Entity('F4G dirty plate');
        plate.addComponent('render',{type:'cylinder',material:mat('#c8bb9c')});
        plate.setLocalScale(.40,.055,.36);plate.setLocalPosition(.05,1.03,-.12);
        node.addChild(plate);plate.enabled=false;
      }
      if(item.prefabId==='mirror'){
        const glint=new pc.Entity('F4E mirror highlight');
        glint.addComponent('render',{type:'sphere',
          material:mat('#fff6d7',{emissive:.42,opacity:.55})});
        glint.setLocalPosition(0,1.36,-.16);
        glint.setLocalScale(.13,.32,.026);
        node.addChild(glint);glint.enabled=false;
      }
      app.root.addChild(node);
      meshyFurniture.attach(node,meshyFurnitureDisplaySku(item.itemDefinitionId)||
        item.itemDefinitionId||PROCEDURAL_DEFAULT_SKU[item.prefabId]);
      decorNodes.set(item.instanceId,node);
    }
    for(const [instanceId,node] of decorNodes){
      const item=items.find(i=>i.instanceId===instanceId);
      if(!item){
        if(instanceId.startsWith('shop-')){node.destroy();decorNodes.delete(instanceId);}
        else node.enabled=false;
        continue;
      }
      const previewing=instanceId===previewId&&!!previewPose;
      node.enabled=item.location==='home'||previewing;
      if(!node.enabled)continue;
      const pose=previewing?previewPose:item;
      // A stored object is visible only as a transient ghost; no saved
      // location, instanceId or mounted-light anchor is changed here.
      const mount=previewing&&MOUNTED_LIGHTS[item.itemDefinitionId]
        ?mountedAnchorAt(game.world.construction,item.itemDefinitionId,pose.x,pose.z):null;
      const mounted=MOUNTED_LIGHTS[item.itemDefinitionId]
        ?lightingMountPose(game.world.construction,item.itemDefinitionId,
          previewing?mount:item.mount):null;
      // Invalid preview pose never teleports back to the saved wall mount.
      // A missing anchor is displayed at the finger-selected draft pose.
      node.setPosition(mounted?.x??pose.x,mounted?.y??0,mounted?.z??pose.z);
      node.setEulerAngles(0,-(mounted?.yaw??pose.yaw),0);
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
  // H5a: each completed work is its OWN persistently identified 3D object,
  // independent from the temporary paint preview and purchased easel node.
  // H5b will transfer these IDs to inventory/walls without recreating art.
  const artworkNodes=new Map();
  const allArtwork=()=>[...(game.createdWorks||[]),...(game.otherSim.createdWorks||[])]
    .filter(work=>work.kind==='artwork'&&['studio','wall'].includes(work.location))
    .sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id));
  const updateArtworkNodes=()=>{
    const works=allArtwork(),keep=new Set(works.map(w=>w.id));
    for(const [id,node] of artworkNodes)if(!keep.has(id)){
      node.destroy();artworkNodes.delete(id);
    }
    for(const [index,work] of works.entries()){
      const source=game.world.furniture.instances.find(i=>
        i.instanceId===work.easelInstanceId&&i.prefabId==='easel');
      const origin=work.origin||(source?{x:source.x,z:source.z,yaw:source.yaw}:null);
      const position=artworkDisplayPose(work,index,origin,game.world.construction);
      if(!position)continue;
      let node=artworkNodes.get(work.id);
      if(!node){
        node=new pc.Entity('H5a artwork / '+work.id);
        app.root.addChild(node);
        const frame=mat('#916e53'),paper=mat('#f6eacb');
        primitive('box','H5a finished framed canvas',0,.79,0,
          .70,.86,.062,frame,node);
        primitive('box','H5a finished painting support',0,.79,-.037,
          .61,.76,.018,paper,node);
        // Old artworks have no renderVersion and retain their original look.
        const parts=work.renderVersion===1
          ?compositionForArtwork(work.contentId,work.seed,work.renderVersion)
          :PAINT_COMPOSITION_SHAPES[work.contentId]||[];
        parts.forEach(([kind,x,y,sx,sy,colorIndex],i)=>{
          const palette=PAINT_SUBJECTS[work.contentId]?.palette;
          if(!palette)return;
          primitive(kind,'H5a preserved brush stroke '+i,x*.73,
            .79+(y-1.37)*.73,-.050-i*.0008,
            sx*.73,sy*.73,.008,mat(palette[colorIndex]),node);
        });
        // Frame is a standalone leaning panel, not an easel texture.
        primitive('box','H5a frame foot',0,.31,.10,.63,.10,.12,frame,node);
        artworkNodes.set(work.id,node);
      }
      // Mount on the visible room-side of the back wall; no studio floor foot.
      node.setPosition(position.x,position.wall?position.y-.79:0,position.z);
      node.setEulerAngles(0,-position.yaw,0);
      const foot=node.findByName('H5a frame foot');
      if(foot)foot.enabled=!position.wall;
    }
  };

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
  // F4D: double the navigable area eastward; never move legacy furnishings.
  // Old floor starts at x=-5; the new wing ends at x=14.25.  box('foundation',4.65,-0.28,0,19.8,.47,9.2,M.edge);
  const starterFloorSurface=box('floor',4.625,-0.032,0,19.25,.12,8.65,M.floor);
  for (let i=0;i<19;i++) box('floor plank',-4.45+i*.99,.034,0,.021,.008,8.6,M.line);

  const starterBackDecor=new pc.Entity('Starter back-wall art anchor');
  const starterLeftDecor=new pc.Entity('Starter left-wall shelf anchor');
  app.root.addChild(starterBackDecor);app.root.addChild(starterLeftDecor);
  const legacyWallNodes=[
    box('back wall',4.625,1.40,-4.34,19.27,2.9,.16,M.wall),
    box('left wall',-4.97,1.40,0,.16,2.9,8.65,M.wall2),
    box('back top trim',4.625,2.91,-4.30,19.35,.13,.2,M.trim),
    box('left top trim',-4.96,2.91,0,.20,.13,8.68,M.trim)
  ];
  const starterBackWindowNodes=[];
  const starterBackWindowCovered=state=>{
    const impacted=new Set([
      ...constructionOpeningEdgeIds(state),...(state.starterRemoved||[])
    ]);
    return starterShellSegments(state).some(w=>w.starterSide==='north'&&
      impacted.has(w.id)&&w.i*.5<-1.14&&(w.i+1)*.5>-3.22);
  };
  const legacySkirts=[
    box('baseboard back',4.625,.16,-4.19,19.25,.18,.13,M.trim),
    box('baseboard left',-4.83,.16,0,.13,.18,8.5,M.trim)
  ];
  // F5-A render adapter: construction data is authoritative; no gameplay geometry in PlayCanvas.
  let constructionWallMode='cut',renderedConstruction=null,renderedWallMode='',
    ceilingPreview=false,roofPreview=false,renderedRoofPreview=false;
  const constructionNodes=[],roofMeshes=[];
  // Hinges are renderer-only; the navigation graph always uses the authoritative
  // physical opening. A nearby resident gently swings a real panel open.
  const automaticDoors=[];
  const lotGround=box('LOT-A lawn',7,-.59,0,32,.12,24,mat('#8fb78b'));
  lotGround.enabled=true;
  // B1: four *combined* meshes, not one entity per cell. Even the full
  // 1536-cell override limit produces at most four draw-call groups.
  const outdoorPaintMaterials={
    stone:mat('#aaa99b'),gravel:mat('#c1b6a0'),
    soil:mat('#80694e'),flowers:mat('#9875a7')
  };
  const outdoorPaintNodes=[],outdoorPaintMeshes=[];
  const renderOutdoorGround=()=>{
    for(const n of outdoorPaintNodes.splice(0))n.destroy();
    for(const m of outdoorPaintMeshes.splice(0))m.destroy();
    const groups=new Map();
    for(const entry of game.world?.outdoors?.ground||[]){
      if(!outdoorPaintMaterials[entry.kind]||!Number.isInteger(entry.cell)||
         entry.cell<0||entry.cell>=3072)continue;
      let group=groups.get(entry.kind);
      if(!group){group={vertices:[],normals:[],indices:[]};groups.set(entry.kind,group);}
      const i=entry.cell%OUTDOOR_GRID_WIDTH,j=Math.floor(entry.cell/OUTDOOR_GRID_WIDTH);
      const x=-9+i*.5,z=-12+j*.5,y=-.521,base=group.vertices.length/3;
      group.vertices.push(x,y,z,x+.5,y,z,x+.5,y,z+.5,x,y,z+.5);
      for(let k=0;k<4;k++)group.normals.push(0,1,0);
      group.indices.push(base,base+2,base+1,base,base+3,base+2);
    }
    for(const [kind,group] of groups){
      const mesh=new pc.Mesh(app.graphicsDevice);
      mesh.setPositions(group.vertices);mesh.setNormals(group.normals);
      mesh.setIndices(group.indices);mesh.update();
      const node=new pc.Entity('LOT-B1 ground '+kind);
      node.addComponent('render',{meshInstances:[
        new pc.MeshInstance(mesh,outdoorPaintMaterials[kind])
      ]});
      app.root.addChild(node);outdoorPaintMeshes.push(mesh);outdoorPaintNodes.push(node);
    }
  };
  renderOutdoorGround();
  // LOT-B2: original low-poly plants and boundaries, grouped under one node
  // per owned instance. Only the 96-item bounded save controls these meshes.
  const outdoorFeatureNodes=[],outdoorLightNodes=[];
  let currentOutdoorDaylight=null;
  const syncOutdoorLights=daylight=>{
    const brightness=outdoorLightFactor(daylight);
    for(const light of outdoorLightNodes)
      light.light.intensity=brightness*(light.name.includes('standing')?1.75:1.15);
  };
  let gardenStageSignature='';
  const currentGardenStageSignature=()=>game.world.outdoors?.features
    ?.filter(f=>isGardenItem(f.itemId))
    .map(f=>{const state=gardenView(game.world.outdoors,f.instanceId,game.minutes);
      return f.instanceId+':'+(state?.stage??0)+':'+Number((state?.waterRemaining??0)>0)+':'+Number(state?.harvestedAt!==null&&state?.harvestedAt!==undefined);})
    .join('|')||'';
  const outdoorFeatureMaterials={
    bark:mat('#917256'),leaf:mat('#4d8960'),lightLeaf:mat('#7cac69'),
    darkLeaf:mat('#437956'),pink:mat('#dc9aa7'),white:mat('#f6eee0'),
    yellow:mat('#e9c767'),purple:mat('#8f77b6'),
    wood:mat('#af8967'),woodDark:mat('#846e54'),soil:mat('#6e8761'),
    gardenSoil:mat('#6b4e3d'),wetSoil:mat('#544536'),
    drySoil:mat('#9a7252'),orange:mat('#e5a352'),blue:mat('#7197d8')
  };
  const renderOutdoorFeatures=()=>{
    for(const node of outdoorFeatureNodes.splice(0))node.destroy();
    outdoorLightNodes.length=0;
    for(const item of game.world?.outdoors?.features||[]){
      const def=OUTDOOR_CATALOG[item.itemId];
      if(!def||!['tree','shrub','flower','fence','furniture','light','garden'].includes(def.category))continue;
      const node=new pc.Entity('LOT-B2 '+item.instanceId+' '+item.itemId);
      node.setLocalPosition(item.x,-.53,item.z);
      node.setLocalEulerAngles(0,-item.yaw,0);
      app.root.addChild(node);outdoorFeatureNodes.push(node);
      const part=(shape,name,x,y,z,sx,sy,sz,color)=>
        primitive(shape,name,x,y,z,sx,sy,sz,outdoorFeatureMaterials[color],node);
      if(def.category==='garden'){
        const gardenState=gardenView(game.world.outdoors,item.instanceId,game.minutes);
        const stage=gardenState?.stage??0;
        const herb=item.itemId.startsWith('garden.herb');
        const flowerColor=item.itemId.includes('calendula')?'orange':'blue';
        part('box','garden timber frame',0,.105,0,1.00,.21,1.00,'woodDark');
        part('box','garden rich soil',0,.225,0,.86,.05,.86,
          gardenState?.waterRemaining>0?'wetSoil':'drySoil');
        const spots=[[-.25,-.24],[.24,-.23],[-.22,.23],[.23,.23]];
        if(stage===0)for(const [x,z] of spots)
          part('sphere','sown seed mound',x,.255,z,.16,.05,.16,'soil');
        if(stage>0)for(const [k,[x,z]] of spots.entries()){
          const height=stage===1?.22:stage===2?.51:herb?.72:.66;
          const harvested=herb&&gardenState?.harvestedAt!==null&&gardenState?.harvestedAt!==undefined;
          part('cylinder','green garden stem',x,.26+height/2,z,.055,height,.055,'darkLeaf');
          part('sphere','garden leaves',x-.07,.34+height*.53,z,harvested?.14:.22,
            stage===1?.14:harvested?.15:.29,harvested?.13:.21,k%2?'leaf':'lightLeaf');
          if(stage>=2&&!harvested)part('sphere','upper leaves',x+.09,.24+height,z,
            herb?.24:.18,herb?.18:.17,herb?.22:.17,'lightLeaf');
          if(stage===3&&!herb){
            part('sphere','blossom petals',x,.37+height,z,.28,.16,.28,flowerColor);
            part('sphere','flower center',x,.47+height,z,.10,.07,.10,'yellow');
          }
          if(stage===3&&herb&&!harvested)part('sphere','mature herb tips',x,.37+height,z,
            .19,.10,.19,'lightLeaf');
        }
      }else if(def.category==='tree'){
        const scale=item.itemId==='tree.tall'?1.30:item.itemId==='tree.broad'?1.12:1;
        part('cylinder','trunk',0,.70*scale,0,.28,1.40*scale,.28,'bark');
        part('sphere','canopy',0,1.65*scale,0,def.width*1.08,.94*scale,def.depth*1.08,'leaf');
        if(item.itemId!=='tree.tall'){
          part('sphere','canopy east',.38,1.43*scale,-.14,.72,.72,.72,'lightLeaf');
          part('sphere','canopy west',-.37,1.48*scale,.20,.64,.68,.66,'darkLeaf');
        }
      }else if(def.category==='shrub'){
        const flowering=item.itemId==='shrub.flowering';
        part('sphere','bush',0,.43,0,def.width*1.1,.74,def.depth*1.10,flowering?'lightLeaf':'leaf');
        if(item.itemId==='shrub.broad')part('sphere','bush side',.34,.36,-.18,.7,.57,.67,'darkLeaf');
        if(flowering)for(const [x,z] of [[-.24,0],[.22,.18],[.04,-.28]])
          part('sphere','blossom',x,.77,z,.18,.15,.18,'pink');
      }else if(def.category==='flower'){
        const color=item.itemId==='flower.lavender'?'purple':
          item.itemId==='flower.tulip'?'pink':'white';
        for(const [x,z] of [[-.16,-.12],[.17,.10],[0,.19]]){
          part('cylinder','stem',x,.18,z,.035,.36,.035,'soil');
          part('sphere','petals',x,.39,z,.16,.15,.16,color);
          if(item.itemId==='flower.daisy')
            part('sphere','heart',x,.48,z,.055,.06,.055,'yellow');
        }
      }else if(item.itemId==='garden.bench'){
        for(const x of [-.57,.57])
          for(const z of [-.20,.20])
            part('box','bench leg',x,.30,z,.12,.60,.12,'woodDark');
        for(const z of [-.23,0,.23])
          part('box','bench slat',0,.59,z,1.50,.10,.17,'wood');
        part('box','bench back',0,.91,.25,1.50,.53,.11,'wood');
      }else if(item.itemId==='garden.table'){
        part('cylinder','table stand',0,.43,0,.20,.80,.20,'woodDark');
        part('cylinder','garden tabletop',0,.86,0,1.06,.11,1.06,'wood');
        for(const x of [-.33,.33])for(const z of [-.33,.33])
          part('box','table leg',x,.43,z,.09,.80,.09,'woodDark');
      }else if(def.category==='light'){
        const tall=item.itemId==='light.standing';
        const height=tall?2.35:1.06;
        part('cylinder','light pole',0,height/2,0,.13,height,.13,'woodDark');
        part('box','light body',0,height,0,tall?.43:.34,tall?.45:.35,tall?.43:.34,'wood');
        part('sphere','light lens',0,height+.02,0,tall?.30:.24,.24,tall?.30:.24,'yellow');
        part('box','light cap',0,height+.27,0,tall?.51:.39,.09,tall?.51:.39,'woodDark');
        // Real omni emitter, not a glowing sprite. Fully removed with the
        // owned fixture, capped at 8 and never allowed to cast shadow maps.
        if(outdoorLightNodes.length<OUTDOOR_LIGHT_LIMIT){
          const glow=new pc.Entity('LOT-B3 '+item.itemId+' emitter');
          glow.addComponent('light',{type:'omni',
            color:new pc.Color(1,.78,.51),intensity:0,
            range:tall?7.2:5.2,castShadows:false});
          glow.setLocalPosition(0,height+.09,0);
          node.addChild(glow);
          outdoorLightNodes.push(glow);
        }
      }else if(item.itemId==='fence.wood'){
        for(const x of [-.20,.20])
          part('box','fence post',x,.44,0,.09,.88,.10,'woodDark');
        for(const y of [.30,.63])
          part('box','fence rail',0,y,0,.51,.095,.09,'wood');
      }else{
        part('box','hedge base',0,.23,0,.49,.20,.24,'bark');
        for(const x of [-.17,.05,.20])
          part('sphere','hedge foliage',x,.55,0,.31,.63,.44,'darkLeaf');
      }
    }
    syncOutdoorLights(currentOutdoorDaylight);
    gardenStageSignature=currentGardenStageSignature();
  };
  renderOutdoorFeatures();
  const outdoorPaintGhost=box('LOT-B1 paint preview',0,-.509,0,.5,.025,.5,
    mat('#62b889',{opacity:.30}));
  outdoorPaintGhost.enabled=false;
  const buildGhost=box('F5 preview',0,.05,0,.2,.06,.2,mat('#438ac4',{opacity:.25}));
  buildGhost.enabled=false;
  const buildWallMarker=box('F5 selected wall',0,.32,0,.3,.62,.3,mat('#24c8bc',{opacity:.72}));
  buildWallMarker.enabled=false;
  const clearConstructionNodes=()=>{
    for(const node of constructionNodes)node.destroy();
    constructionNodes.length=0;automaticDoors.length=0;
    for(const mesh of roofMeshes)mesh.destroy();
    roofMeshes.length=0;
  };
  const buildBox=(name,x,y,z,sx,sy,sz,material)=>{
    const node=box(name,x,y,z,sx,sy,sz,material);
    constructionNodes.push(node);
    return node;
  };
  const buildFinishMaterials=new Map();
  const finishMaterial=id=>{
    if(!buildFinishMaterials.has(id)){
      const definition=id.startsWith('facade.')?BUILD_FACADE_FINISHES[id]:
        BUILD_FINISHES[id.startsWith('floor.')?'floor':id.startsWith('ceiling.')?'ceiling':'wall'][id];
      buildFinishMaterials.set(id,mat(definition.color));
    }
    return buildFinishMaterials.get(id);
  };
  // Renderer-only geometry; furniture, navigation and AI remain independent.
  const patternTrim=mat('#907966');
  const addWallPattern=(id,axis,center,line,span,face,offset)=>{
    const pattern=BUILD_FINISHES.wall[id]?.pattern;
    if(!pattern)return;
    const surface=line+(face==='a'?-1:1)*offset;
    const detail=(name,y,height,material)=>buildBox(name,
      axis==='h'?center:surface,y,axis==='v'?center:surface,
      axis==='h'?span:.027,height,axis==='v'?span:.027,material);
    if(pattern==='stripes'){
      for(const y of [.81,1.73,2.48])detail('F5-B.4 striped wallpaper',y,.034,patternTrim);
    }else if(pattern==='panels'){
      detail('F5-B.4 lower panelling',.64,1.18,finishMaterial('wall.sand'));
      detail('F5-B.4 panel cornice',1.26,.076,patternTrim);
    }
  };
  const roofPalette=new Map();
  // Exterior entrance platforms are traversable via the pure construction
  // footprint, yet never included in the indoor automatic roof footprint.
  const renderConstructionPorches=state=>{
    for(const porch of constructionPorches(state)){
      const r=porch.footprint,definition=BUILD_PORCH_FINISHES[porch.materialId];
      if(!r||!definition)continue;
      if(!buildFinishMaterials.has(porch.materialId))
        buildFinishMaterials.set(porch.materialId,mat(definition.color));
      const finish=buildFinishMaterials.get(porch.materialId),accent=M.trim;
      const x0=r.i0*.5,x1=r.i1*.5,z0=r.j0*.5,z1=r.j1*.5,
        x=(x0+x1)/2,z=(z0+z1)/2;
      const name='F5-C.2 porch '+porch.id;
      buildBox(name+' deck',x,-.125,z,x1-x0,.27,z1-z0,finish);
      const end=r.axis==='h'?(r.outward>0?z1:z0):(r.outward>0?x1:x0);
      const breadth=r.axis==='h'?x1-x0:z1-z0;
      for(let level=0;level<2;level++){
        const at=end+(level+.5)*r.outward*.30;
        buildBox(name+' stairs',r.axis==='h'?x:at,-.27-level*.14,
          r.axis==='h'?at:z,r.axis==='h'?breadth:.3,.14,
          r.axis==='v'?breadth:.3,finish);
      }
      const h=BUILD_WALL_HEIGHTS[state.wallHeightClass||'normal'].value;
      const doorway=r.axis==='h'?(r.outward>0?z0:z1):
        (r.outward>0?x0:x1);
      const canopy=doorway+r.outward*.44;
      buildBox(name+' entrance canopy',r.axis==='h'?x:canopy,h-.20,
        r.axis==='h'?canopy:z,r.axis==='h'?breadth:.9,.12,
        r.axis==='v'?breadth:.9,finish);
      for(const sign of [-1,1]){
        const along=r.axis==='h'?x+sign*(breadth/2-.14):z+sign*(breadth/2-.14);
        const outer=doorway+r.outward*.81;
        buildBox(name+' support post',r.axis==='h'?along:outer,
          (h-.27)/2,r.axis==='v'?along:outer,.085,h-.27,.085,accent);
      }
    }
  };
  const addFacadePattern=(id,axis,center,across,span,outward,height)=>{
    const type=BUILD_FACADE_FINISHES[id]?.pattern;
    if(!type)return;
    const pos=across+outward*.14,accent=M.trim;
    const line=(y,thick)=>buildBox('F5-C.2 facade course',
      axis==='h'?center:pos,y,axis==='v'?center:pos,
      axis==='h'?span:.019,thick,axis==='v'?span:.019,accent);
    if(type==='brick'||type==='clapboard'){
      const count=type==='brick'?8:12;
      for(let k=1;k<count;k++)line(height*k/count,.024);
    }else if(type==='stone'){
      for(const fract of [.27,.54,.81])line(height*fract,.032);
    }else if(type==='timber'){
      const count=Math.min(12,Math.max(2,Math.ceil(span/1.4)));
      for(let k=0;k<=count;k++){
        const along=center-span/2+span*k/count;
        buildBox('F5-C.2 facade timber batten',
          axis==='h'?along:pos,height/2,axis==='v'?along:pos,
          axis==='h'?.054:.018,height-.14,axis==='v'?.054:.018,accent);
      }
    }
  };
  const drawConstructionFacades=state=>{
    if(constructionWallMode==='down')return;
    const coatings=state.materials?.facade||{},opened=constructionOpeningEdgeIds(state);
    const h=BUILD_WALL_HEIGHTS[state.wallHeightClass||'normal'].value;
    const grouped=new Map();
    for(const wall of constructionExteriorSegments(state)){
      if(opened.has(wall.id))continue;
      const id=coatings[wall.id];if(!BUILD_FACADE_FINISHES[id])continue;
      const coordinate=wall.starterSide
        ?(wall.starterSide==='north'?-4.34+starterShellOffset(state,'north')
          :wall.starterSide==='south'?4.34+starterShellOffset(state,'south')
          :wall.starterSide==='west'?-4.97+starterShellOffset(state,'west')
          :14.25+starterShellOffset(state,'east'))
        :(wall.axis==='h'?wall.j:wall.i)*.5;
      if(constructionWallMode==='cut'&&(wall.axis==='h'?coordinate>0:coordinate>14))continue;
      const key=wall.axis+'|'+coordinate+'|'+wall.outward+'|'+id;
      if(!grouped.has(key))grouped.set(key,{axis:wall.axis,coordinate,
        outward:wall.outward,id,points:[]});
      grouped.get(key).points.push(wall.axis==='h'?wall.i:wall.j);
    }
    for(const {axis,coordinate,outward,id,points} of grouped.values()){
      points.sort((a,b)=>a-b);
      let start=points[0],prev=start;
      const flush=()=>{
        const span=(prev-start+1)*.5,center=(start+prev+1)*.25;
        const face=coordinate+outward*.106;
        buildBox('F5-C.2 real facade '+id,axis==='h'?center:face,h/2,
          axis==='v'?center:face,axis==='h'?span:.027,h-.12,
          axis==='v'?span:.027,finishMaterial(id));
        addFacadePattern(id,axis,center,coordinate,span,outward,h-.12);
      };
      for(const next of [...points.slice(1),Infinity]){
        if(next===prev+1){prev=next;continue;}
        flush();start=next;prev=next;
      }
    }
  };
  const renderConstructionRoofs=state=>{
    if(!buildMode||!roofPreview)return;
    for(const roof of state.roofModules||[]){
      const color=ROOF_MATERIALS[roof.materialId]?.color;
      if(!color)continue;
      if(!roofPalette.has(roof.materialId)){
        const m=mat(color);m.cull=pc.CULLFACE_NONE;m.update();
        roofPalette.set(roof.materialId,m);
      }
      const wallHeight=BUILD_WALL_HEIGHTS[state.wallHeightClass||'normal'].value;
      const shape=roofMeshGeometry(roof,{wallHeight});
      const mesh=new pc.Mesh(app.graphicsDevice);
      mesh.setPositions(shape.positions);
      mesh.setIndices(shape.indices);
      mesh.setNormals(pc.calculateNormals(shape.positions,shape.indices));
      mesh.update();
      const entity=new pc.Entity('F5-C.1 '+roof.styleId+' '+roof.id);
      entity.addComponent('render',{
        meshInstances:[new pc.MeshInstance(mesh,roofPalette.get(roof.materialId))]
      });
      app.root.addChild(entity);constructionNodes.push(entity);roofMeshes.push(mesh);
      // Fascia follows every section edge, reinforcing the roof silhouette.
      const x0=roof.i0*.5-roof.eaves,x1=roof.i1*.5+roof.eaves;
      const z0=roof.j0*.5-roof.eaves,z1=roof.j1*.5+roof.eaves;
      const cx=(x0+x1)/2,cz=(z0+z1)/2;
      for(const z of [z0,z1])
        buildBox('F5-C roof fascia X',cx,wallHeight+.125,z,x1-x0,.09,.085,M.trim);
      for(const x of [x0,x1])
        buildBox('F5-C roof fascia Z',x,wallHeight+.125,cz,.085,.09,z1-z0,M.trim);
    }
  };
  const drawConstructionFinishes=state=>{
    const finish=state.materials||{};
    const height=BUILD_WALL_HEIGHTS[state.wallHeightClass||'normal'].value;
    // Group floor paint by material + row; a recolored room costs one slab
    // per material run rather than a fresh PlayCanvas entity for every tile.
    const rows=new Map();
    for(const [key,id] of Object.entries(finish.floor||{})){
      if(!BUILD_FINISHES.floor[id])continue;
      const [i,j]=key.split(',').map(Number);
      if(!Number.isSafeInteger(i)||!Number.isSafeInteger(j))continue;
      const group=j+'|'+id;
      if(!rows.has(group))rows.set(group,{j,id,values:[]});
      rows.get(group).values.push(i);
    }
    for(const {j,id,values} of rows.values()){
      values.sort((a,b)=>a-b);
      let lo=values[0],last=lo;
      const draw=()=>buildBox('F5-B finished floor '+id,(lo+last+1)*.25,.053,
        (j+.5)*.5,(last-lo+1)*.5,.026,.5,finishMaterial(id));
      for(const i of [...values.slice(1),Infinity]){
        if(i===last+1){last=i;continue;}draw();lo=i;last=i;
      }
    }
    // Group pattern strokes into long runs: no one-mesh-per-tile storm.
    const patternRows=new Map(),patternCols=new Map();
    const register=(map,fixed,index,pattern)=>{
      const key=fixed+'|'+pattern;
      if(!map.has(key))map.set(key,{fixed,pattern,values:[]});
      map.get(key).values.push(index);
    };
    for(const [key,id] of Object.entries(finish.floor||{})){
      const pattern=BUILD_FINISHES.floor[id]?.pattern;
      if(!pattern)continue;
      const [i,j]=key.split(',').map(Number);
      if(pattern==='planks-x'||pattern==='mosaic')register(patternRows,j,i,pattern);
      if(pattern==='planks-z'||pattern==='mosaic')register(patternCols,i,j,pattern);
    }
    const patternRuns=(groups,axis)=>{
      for(const {fixed,pattern,values} of groups.values()){
        values.sort((a,b)=>a-b);
        let lo=values[0],last=lo;
        const flush=()=>{
          const span=(last-lo+1)*.5,mid=(lo+last+1)*.25;
          const at=(fixed+(pattern==='mosaic'?1:.5))*.5;
          buildBox('F5-B.4 '+pattern+' '+axis,
            axis==='x'?mid:at,.082,axis==='z'?mid:at,
            axis==='x'?span:.016,.012,axis==='z'?span:.016,patternTrim);
        };
        for(const next of [...values.slice(1),Infinity]){
          if(next===last+1){last=next;continue;}
          flush();lo=next;last=next;
        }
      }
    };
    patternRuns(patternRows,'x');patternRuns(patternCols,'z');
    // Ceiling is visible only on explicit request in Build; never in Life.
    if(buildMode&&ceilingPreview){
      const ceilings=new Map();
      for(const [key,id] of Object.entries(finish.ceiling||{})){
        if(!BUILD_FINISHES.ceiling[id])continue;
        const [i,j]=key.split(',').map(Number),group=j+'|'+id;
        if(!ceilings.has(group))ceilings.set(group,{j,id,values:[]});
        ceilings.get(group).values.push(i);
      }
      for(const {j,id,values} of ceilings.values()){
        values.sort((a,b)=>a-b);
        let lo=values[0],last=lo;
        const flush=()=>buildBox('F5-B.4 ceiling '+id,(lo+last+1)*.25,
          height-.065,(j+.5)*.5,(last-lo+1)*.5,.065,.5,finishMaterial(id));
        for(const next of [...values.slice(1),Infinity]){
          if(next===last+1){last=next;continue;}
          flush();lo=next;last=next;
        }
      }
    }
    if(constructionWallMode==='down')return;
    const faces=new Map(),opened=constructionOpeningEdgeIds(state);
    for(const edge of state.wallEdges){
      if(opened.has(edge.id))continue;
      if(constructionWallMode==='cut'&&
        (edge.axis==='h'?edge.j*.5>0:edge.i*.5>14))continue;
      for(const face of ['a','b']){
        const id=finish.wall?.[edge.id]?.[face];
        if(!BUILD_FINISHES.wall[id])continue;
        const group=edge.axis+'|'+(edge.axis==='h'?edge.j:edge.i)+'|'+face+'|'+id;
        if(!faces.has(group))faces.set(group,{axis:edge.axis,position:edge.axis==='h'?edge.j:edge.i,face,id,values:[]});
        faces.get(group).values.push(edge.axis==='h'?edge.i:edge.j);
      }
    }
    for(const {axis,position,face,id,values} of faces.values()){
      values.sort((a,b)=>a-b);
      let lo=values[0],last=lo;
      const draw=()=>{
        const span=(last-lo+1)*.5,mid=(lo+last+1)*.25,side=face==='a'?-1:1;
        buildBox('F5-B wall finish '+id,
          axis==='h'?mid:position*.5+side*.081,height/2,
          axis==='v'?mid:position*.5+side*.081,
          axis==='h'?span:.02,height-.18,axis==='v'?span:.02,finishMaterial(id));
         addWallPattern(id,axis,mid,position*.5,span,face,.109);
      };
      for(const i of [...values.slice(1),Infinity]){
        if(i===last+1){last=i;continue;}draw();lo=i;last=i;
      }
    }
    // Paint on the original house uses the SAME physical wall sections.
    // A window, doorway or demolished part must be a real hole in the paint.
    const starterSegments=starterShellSegments(state);
    const removed=new Set(state.starterRemoved||[]);
    const renderLine={
      north:-4.34+starterShellOffset(state,'north'),
      south:4.34+starterShellOffset(state,'south'),
      west:-4.97+starterShellOffset(state,'west'),
      east:14.25+starterShellOffset(state,'east')
    };
    for(const side of ['north','west','east','south']){
      if((side==='east'||side==='south')&&constructionWallMode!=='up')continue;
      const segments=starterSegments.filter(w=>w.starterSide===side&&
        !opened.has(w.id)&&!removed.has(w.id));
      if(!segments.length)continue;
      const axis=segments[0].axis,point=w=>axis==='h'?w.i:w.j;
      const sorted=segments.sort((a,b)=>point(a)-point(b));
      for(const face of ['a','b']){
        const id=finish.wall?.['starter:'+side]?.[face];
        if(!BUILD_FINISHES.wall[id])continue;
        let first=sorted[0],last=first;
        const flush=()=>{
          const span=(point(last)-point(first)+1)*.5;
          const center=(point(last)+point(first)+1)*.25;
          const offset=(face==='a'?-1:1)*.096;
          buildBox('F5-B original wall finish '+id,
            axis==='h'?center:renderLine[side]+offset,height/2,
            axis==='v'?center:renderLine[side]+offset,
            axis==='h'?span:.023,height-.22,axis==='v'?span:.023,finishMaterial(id));
           addWallPattern(id,axis,center,renderLine[side],span,face,.124);
        };
        for(const next of sorted.slice(1)){
          if(point(next)===point(last)+1){last=next;continue;}
          flush();first=next;last=next;
        }flush();
      }
    }
    drawConstructionFacades(state);
  };
  const syncConstructionRender=(force=false)=>{
    const state=game.world.construction;
    if(!force&&renderedConstruction===state&&renderedWallMode===constructionWallMode&&
      renderedRoofPreview===roofPreview)return;
    renderedConstruction=state;renderedWallMode=constructionWallMode;
    renderedRoofPreview=roofPreview;
    clearConstructionNodes();
    lotGround.enabled=true;
    const raised=constructionWallMode!=='down';
    const height=BUILD_WALL_HEIGHTS[state.wallHeightClass||'normal'].value;
    const w=starterShellOffset(state,'west'),e=starterShellOffset(state,'east');
    const n=starterShellOffset(state,'north'),s=starterShellOffset(state,'south');
    const width=19.27+e-w,depth=8.65+s-n;
    const widthCenter=4.625+(w+e)/2,depthCenter=(n+s)/2;
    // The old visible planks end at +/-4.325 while the construction grid
    // begins at +/-4.5. Bridge that seam only on sides actually extended,
    // leaving the accepted original floor appearance unchanged before edits.
    const floorMinZ=n<0?-4.515:-4.325,floorMaxZ=s>0?4.515:4.325;
    starterFloorSurface.setPosition(4.625,-.032,(floorMinZ+floorMaxZ)/2);
    starterFloorSurface.setLocalScale(19.25,.12,floorMaxZ-floorMinZ);
    // Preserve exact legacy geometry at zero offset. Resizing moves the real
    // original walls, their coping and skirting, not merely an outline.
    legacyWallNodes[0].setPosition(widthCenter,height/2-.05,-4.34+n);
    legacyWallNodes[0].setLocalScale(width,height,.16);
    legacyWallNodes[1].setPosition(-4.97+w,height/2-.05,depthCenter);
    legacyWallNodes[1].setLocalScale(.16,height,depth);
    legacyWallNodes[2].setPosition(widthCenter,height+.01,-4.30+n);
    legacyWallNodes[2].setLocalScale(19.35+e-w,.13,.2);
    legacyWallNodes[3].setPosition(-4.96+w,height+.01,depthCenter);
    legacyWallNodes[3].setLocalScale(.20,.13,8.68+s-n);
    legacySkirts[0].setPosition(widthCenter,.16,-4.19+n);
    legacySkirts[0].setLocalScale(19.25+e-w,.18,.13);
    legacySkirts[1].setPosition(-4.83+w,.16,depthCenter);
    legacySkirts[1].setLocalScale(.13,.18,8.5+s-n);
    starterBackDecor.setPosition(0,0,n);
    starterLeftDecor.setPosition(w,0,0);
    const removedStarter=new Set(state.starterRemoved||[]);
    const openingStarter=constructionOpeningEdgeIds(state);
    const originalSegments=starterShellSegments(state);
    const changedStarter=new Set(originalSegments.filter(edge=>
      removedStarter.has(edge.id)||openingStarter.has(edge.id)).map(edge=>edge.starterSide));
    const solidStarter=new Set(state.starterSolidSides||[]);
    // Original walls are still 100% their authored procedural material until
    // first edit. Afterwards, rebuild only that side from physical half-meter
    // sections: it is impossible for a long opaque box to cover a doorway.
    legacyWallNodes[0].enabled=raised&&!changedStarter.has('north');
    legacyWallNodes[2].enabled=raised&&!changedStarter.has('north');
    legacyWallNodes[1].enabled=raised&&!changedStarter.has('west');
    legacyWallNodes[3].enabled=raised&&!changedStarter.has('west');
    legacySkirts[0].enabled=!changedStarter.has('north');
    legacySkirts[1].enabled=!changedStarter.has('west');
    for(const node of starterBackWindowNodes)node.enabled=!starterBackWindowCovered(state);
    const originalLines={north:-4.34+n,west:-4.97+w,south:4.34+s,east:14.25+e};
    const drawStarterSide=side=>{
      const sections=originalSegments.filter(e=>e.starterSide===side&&
        !removedStarter.has(e.id)&&!openingStarter.has(e.id));
      if(!sections.length)return;
      const axis=sections[0].axis,point=e=>axis==='h'?e.i:e.j;
      sections.sort((a,b)=>point(a)-point(b));
      let first=sections[0],last=first;
      const flush=()=>{
        const length=(point(last)-point(first)+1)*.5;
        const center=(point(last)+point(first)+1)*.25;
        const x=axis==='h'?center:originalLines[side];
        const z=axis==='v'?center:originalLines[side];
        const front=side==='south'||side==='east';
        if(constructionWallMode==='down'||(front&&constructionWallMode==='cut')){
          buildBox('F5-B.3 original wall cut outline',x,.135,z,
            axis==='h'?length:.14,.18,axis==='v'?length:.14,M.trim);
        }else{
          buildBox('F5-B.3 original structural wall',x,height/2-.05,z,
            axis==='h'?length:.16,height,axis==='v'?length:.16,
            side==='west'?M.wall2:M.wall);
          buildBox('F5-B.3 original coping',x,height+.01,z,
            axis==='h'?length:.2,.13,axis==='v'?length:.2,M.trim);
        }
        // Painted trim follows the same physical spans, never a deleted hole.
        if(!(front&&constructionWallMode==='cut'))
          buildBox('F5-B.3 original baseboard',x,.16,z,
            axis==='h'?length:.14,.18,axis==='v'?length:.14,M.trim);
      };
      for(const next of sections.slice(1)){
        if(point(next)===point(last)+1){last=next;continue;}
        flush();first=next;last=next;
      }flush();
    };
    for(const side of ['north','west','east','south'])
      if(changedStarter.has(side)||solidStarter.has(side))drawStarterSide(side);
    // The old apartment has an open front/right cutaway. Render their
    // editable boundary lines in Build; never create a surprise A* barrier.
    if(buildMode){
      if(!solidStarter.has('south')&&!changedStarter.has('south'))
        buildBox('F5 starter front edge',widthCenter,.092,4.5+s,
          19+e-w,.12,.11,M.trim);
      if(!solidStarter.has('east')&&!changedStarter.has('east'))
        buildBox('F5 starter right edge',14+e,.092,depthCenter,
          .11,.12,9+s-n,M.trim);
    }
    if(state.legacy){
      if(constructionWallMode==='up'){
        buildBox('F5 starter front up',widthCenter,height/2-.05,4.34+s,width,height,.16,M.wall);
        buildBox('F5 starter right up',14.25+e,height/2-.05,depthCenter,.16,height,depth,M.wall);
      }
      drawConstructionFinishes(state);
      renderConstructionPorches(state);
      renderConstructionRoofs(state);
      return;
    }
    const grid=.5,base=new Set();
    for(let i=-10;i<28;i++)for(let j=-9;j<9;j++)base.add(i+','+j);
    const addedByRow=new Map();
    for(const key of state.floorCells){
      if(base.has(key))continue;
      const [i,j]=key.split(',').map(Number);
      if(!addedByRow.has(j))addedByRow.set(j,[]);
      addedByRow.get(j).push(i);
    }
    for(const [j,values] of addedByRow){
      values.sort((a,b)=>a-b);
      let start=values[0],previous=values[0];
      for(const i of [...values.slice(1),Infinity]){
        if(i===previous+1){previous=i;continue;}
        const span=previous-start+1,x=(start+(previous+1))*.25,z=(j+.5)*.5;
        buildBox('F5 floor foundation',x,-.28,z,span*.5,.45,.5,M.edge);
        buildBox('F5 floor surface',x,-.031,z,span*.5,.12,.5,M.floor);
        start=i;previous=i;
      }
    }
    const opened=constructionOpeningEdgeIds(state),
      originalById=new Map(originalSegments.map(w=>[w.id,w]));
    // Solid wall runs are coalesced into a handful of draw calls per uninterrupted stretch.
    const byLine=new Map();
    for(const w of state.wallEdges){
      if(opened.has(w.id))continue;
      const line=w.axis+':'+(w.axis==='h'?w.j:w.i);
      if(!byLine.has(line))byLine.set(line,[]);
      byLine.get(line).push(w);
    }
    const wallHeight=raised?height-.03:.19,wallY=raised?height/2-.02:.13;
    const exterior=constructionWallMode==='up';
    for(const walls of byLine.values()){
      const axis=walls[0].axis;walls.sort((a,b)=>axis==='h'?a.i-b.i:a.j-b.j);
      let start=walls[0],prev=walls[0];
      const draw=()=>{
        const len=(axis==='h'?prev.i-start.i:prev.j-start.j)+1;
        const x=axis==='h'?(start.i+prev.i+1)*.25:start.i*.5;
        const z=axis==='v'?(start.j+prev.j+1)*.25:start.j*.5;
        const faceCamera=axis==='h'?z>0:x>14;
        if(constructionWallMode==='cut'&&faceCamera){
          buildBox('F5 cutaway outline',x,.13,z,axis==='h'?len*.5:.14,.19,axis==='v'?len*.5:.14,M.trim);
        }else{
          buildBox('F5 structural wall',x,wallY,z,axis==='h'?len*.5:.14,
            wallHeight,axis==='v'?len*.5:.14,M.wall2);
          if(raised)buildBox('F5 wall coping',x,height+.02,z,axis==='h'?len*.5:.16,.12,axis==='v'?len*.5:.16,M.trim);
        }
      };
      for(const w of walls.slice(1)){
        const sequential=axis==='h'?w.i===prev.i+1:w.j===prev.j+1;
        if(!sequential){draw();start=w;}prev=w;
      }draw();
    }
    // Openings are true holes in wall segments, not decals. The single
    // variant ID chooses the procedural frame, panel and window proportions.
    // A 2m opening is physically four .5m segments in both render and A*.
    for(const opening of state.openings){
      const edges=opening.edgeIds.map(id=>state.wallEdges.find(w=>w.id===id)||
        originalById.get(id)).filter(Boolean);
      if(!edges.length)continue;
      const variantId=constructionOpeningStyle(opening);
      const design=BUILD_OPENING_STYLES[variantId];
      if(!design)continue;
      const axis=edges[0].axis,wide=design.sections===4;
      const side=edges[0].starterSide;
      const x=side==='west'||side==='east'?originalLines[side]:
        axis==='h'?edges.reduce((n,w)=>n+w.i,0)/edges.length*.5+.25:edges[0].i*.5;
      const z=side==='north'||side==='south'?originalLines[side]:
        axis==='v'?edges.reduce((n,w)=>n+w.j,0)/edges.length*.5+.25:edges[0].j*.5;
      const width=edges.length*.5,window=design.type==='window';
      const spanX=val=>axis==='h'?val:.15;
      const spanZ=val=>axis==='v'?val:.15;
      const cross=(name,y,height,material,widthOverride=width)=>
        buildBox(name,x,y,z,spanX(widthOverride),height,spanZ(widthOverride),material);
      const upright=(name,distance,y,height,material)=>
        buildBox(name,x+(axis==='h'?distance:0),y,
          z+(axis==='v'?distance:0),axis==='h'?.10:.16,height,
          axis==='v'?.10:.16,material);
      if(constructionWallMode==='down'||(constructionWallMode==='cut'&&
        (axis==='h'?z>0:x>14))){
        cross('F5-B opening threshold',.115,.16,M.trim);continue;
      }
      if(window){
        const dimensions={
          'window.classic':{bottom:.95,top:2.38,glassWidth:width-.18},
          'window.panorama':{bottom:.49,top:2.55,glassWidth:width-.18},
          'window.high':{bottom:1.52,top:2.64,glassWidth:width-.18},
          'window.slim':{bottom:.96,top:2.40,glassWidth:.56}
        }[variantId];
        if(!dimensions)continue;
        const {bottom,glassWidth}=dimensions;
        const top=Math.min(dimensions.top,height-.2),glassHeight=top-bottom;
        cross('F5-B window lower solid wall',bottom/2,bottom,M.wall);
        cross('F5-B window upper solid wall',(height+top)/2,height-top,M.wall);
        if(glassWidth<width-.25){
          for(const side of [-1,1])upright('F5-B narrow window reveal',
            side*(glassWidth+(width-glassWidth)/2)/2,(bottom+top)/2,
            glassHeight,M.wall2);
        }
        cross('F5-B window sill',bottom,.09,M.paleWood,glassWidth+.12);
        cross('F5-B window header',top,.09,M.paleWood,glassWidth+.12);
        for(const side of [-1,1])upright('F5-B glazed window jamb',
          side*glassWidth/2,(bottom+top)/2,glassHeight+.12,M.paleWood);
        buildBox('F5-B glazed pane '+variantId,x,(bottom+top)/2,z,
          spanX(glassWidth-.08),glassHeight-.11,spanZ(glassWidth-.08),M.glass);
        if(variantId!=='window.slim'){
          upright('F5-B window vertical glazing bar',0,(bottom+top)/2,glassHeight,M.cream);
          if(variantId==='window.classic')
            cross('F5-B window horizontal glazing bar',(bottom+top)/2,.06,M.cream,glassWidth);
        }
        continue;
      }
      const isArch=design.type==='arch',frame=isArch?M.trim:
        variantId==='door.glass'?M.slate:M.paleWood;
      for(const side of [-1,1])upright('F5-B portal jamb '+variantId,
        side*width/2,height/2,height,frame);
      cross('F5-B portal lintel',(height+2.30)/2,height-2.30,M.wall);
      if(isArch){
        const steps=wide?5:4;
        // Concentric stepped head of original procedural masonry; the opening
        // remains body-clear at all points below 1.94m.
        for(let i=0;i<steps;i++){
          const inset=i*.072,y=Math.min(2.51,height-.16)-i*.10;
          for(const sign of [-1,1])
            upright('F5-B arch curve '+variantId,
              sign*(width/2-.11-inset),y,.20,M.trim);
        }
        continue;
      }
      const createLeaf=(name,hingeDistance,leafWidth,direction)=>{
        const pivot=new pc.Entity('F5-B real swinging '+name);
        app.root.addChild(pivot);constructionNodes.push(pivot);
        pivot.setPosition(x+(axis==='h'?hingeDistance:0),0,
          z+(axis==='v'?hingeDistance:0));
        const center=direction*leafWidth/2;
        primitive('box',name+' hinged panel',
          axis==='h'?center:0,1.12,axis==='v'?center:0,
          axis==='h'?leafWidth-.07:.075,2.20,axis==='v'?leafWidth-.07:.075,
          variantId==='door.glass'?M.glass:M.wood,pivot);
        if(variantId==='door.glass'){
          primitive('box',name+' vertical frame',
            axis==='h'?center:0,1.12,axis==='v'?center:0,
            axis==='h'?.065:.095,2.18,axis==='v'?.065:.095,M.slate,pivot);
        }else{
          primitive('box',name+' inset panel',
            axis==='h'?center:0,1.14,axis==='v'?center:0,
            axis==='h'?leafWidth-.20:.083,1.68,axis==='v'?leafWidth-.20:.083,
            M.paleWood,pivot);
        }
        automaticDoors.push({pivot,x,z,rotation:0,sign:direction*(axis==='h'?1:-1)});
      };
      if(variantId==='door.double'){
        createLeaf('double left',-width/2,width/2,1);
        createLeaf('double right',width/2,width/2,-1);
      }else createLeaf(variantId,-width/2,width,1);
    }
    drawConstructionFinishes(state);
    renderConstructionPorches(state);
    renderConstructionRoofs(state);
    // UP mode adds former open-front boundaries for an exterior view only.
    // These are cosmetic: no surprise path block in legacy saves.
    if(exterior){
      if(!solidStarter.has('south')&&!changedStarter.has('south'))
        buildBox('F5 legacy front up',widthCenter,height/2-.05,4.34+s,width,height,.16,M.wall);
      if(!solidStarter.has('east')&&!changedStarter.has('east'))
        buildBox('F5 legacy right up',14.25+e,height/2-.05,depthCenter,.16,height,depth,M.wall);
    }
  };
  syncConstructionRender(true);
  // Wall art: one picture, one shelf and one window with sky-coloured panes.
  starterBackWindowNodes.push(
    box('window frame',-2.18,1.87,-4.16,2.0,1.28,.1,M.paleWood,starterBackDecor),
    box('window',-2.18,1.87,-4.06,1.77,1.08,.08,M.blue,starterBackDecor),
    box('window cross vertical',-2.18,1.87,-3.99,.09,1.14,.13,M.cream,starterBackDecor),
    box('window cross horizontal',-2.18,1.88,-3.99,1.84,.09,.13,M.cream,starterBackDecor)
  );
  for(const node of starterBackWindowNodes)
    node.enabled=!starterBackWindowCovered(game.world.construction);
  box('landscape',.2,2.12,-4.13,1.1,.72,.12,M.wood,starterBackDecor);
  box('landscape inside',.2,2.12,-4.03,.93,.56,.07,M.slate,starterBackDecor);
  ball('art sun',.42,2.22,-3.97,.25,.25,.04,M.yellow,starterBackDecor);
  box('shelf on left wall',-4.72,1.74,.15,.27,.1,1.2,M.paleWood,starterLeftDecor);
  for (let i=0;i<3;i++) box('books',-4.69,1.91,-.25+i*.22,.21,.32,.13,[M.pink,M.cream,M.green][i],starterLeftDecor);

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
  // H2: original procedural console; template is hidden until the user buys it.
  withDecor('music',()=>{
    box('music cabinet',0,.60,0,.92,1.04,.50,M.wood);
    box('music face',0,.65,.258,.84,.87,.025,M.darkGreen);
    box('music display',0,.93,.279,.38,.18,.035,M.mint);
    box('music dial',0,.72,.286,.12,.12,.035,M.cream);
    for(const x of [-.30,.30]){
      box('music speaker '+x,x,.49,.281,.33,.37,.038,M.green);
      box('music speaker center '+x,x,.49,.309,.17,.17,.018,M.blue);
    }
    box('music shelf',0,.085,0,.97,.13,.55,M.paleWood);
    box('music top',0,1.17,0,1,.10,.56,M.paleWood);
  });
  // Potted plant, decorations and an oversized welcoming mat.
  withDecor('plant',()=>{
    cylinder('plant pot',4.19,.30,3.22,.58,.63,.58,M.rust);
    cylinder('plant stem',4.19,.78,3.22,.10,.70,.10,M.darkGreen);
    ball('leaf crown',4.20,1.27,3.2,1.02,.94,.91,M.leaf);
    ball('plant leaf',3.93,1.10,3.08,.62,.63,.6,M.leaf2);
    ball('plant leaf',4.45,1.38,3.42,.65,.74,.51,M.green);
  });
  // New prefab templates remain empty; modelKey builds the geometry only
  // for a purchased or staged object and never for existing save fixtures.
  for(const prefabId of PROCEDURAL_NEW_PREFABS)
    withDecor(prefabId,()=>{
      // A visible fallback when a decorative Meshy GLB cannot load offline.
      if(prefabId.startsWith('mesh')){
        const wide=prefabId==='meshlarge'?1.7:prefabId==='meshwall'?1.22:.52;
        const height=prefabId==='meshtall'?1.6:prefabId==='meshwall'?.85:.5;
        box('Meshy decor fallback '+prefabId,0,
          prefabId==='meshwall'?1.65:height*.5,0,wide,height,.22,M.paleWood);
      }
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
    // The same skinned-seat contact solver now handles single-seat furniture.
    if(purchasedSeatPrefab(game.world,instanceId))
      return purchasedSeatSurface(game.world,instanceId);
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
  // A small original 3D smartphone is held near the existing right-hand pivot.
  // Create it AFTER Meshy captures legacy renderers, so it stays visible even
  // with imported skinned visuals; no collider or gameplay state is introduced.
  const phoneMeshes={},phoneReveal={alex:0,mira:0};
  for(const [id,rig] of [['alex',alexRig],['mira',miraRig]]){
    const phone=new pc.Entity('Phone held by '+id);
    rig.elbowPivot[1].addChild(phone);
    phone.setLocalPosition(0,-.245,.17);
    phone.setLocalEulerAngles(-24,0,14);
    box('Phone back '+id,0,0,0,.145,.265,.040,M.dark,phone);
    box('Phone lit screen '+id,0,0,.025,.118,.231,.012,M.mint,phone);
    phone.enabled=false;phoneMeshes[id]=phone;
  }
  updatePhoneProps=id=>{
    for(const [key,phone] of Object.entries(phoneMeshes)){
      phone.enabled=key===id;phoneReveal[key]=0;
      phone.setLocalScale(.06,.06,.06);
    }
  };
  updatePhoneProps(careerPhone.isOpen()?game.selectedSim:null);
  const animationStates={alex:createAnimationState(),mira:createAnimationState()};
  const sofaStates={alex:createSofaTransition(),mira:createSofaTransition()};
  const benchVisualTargets={alex:null,mira:null};
  // F4F.1: entirely cosmetic chair draw-out. Keep the selected table/seat
  // through the reverse stand-up animation, but never persist a moved chair.
  const diningVisual={alex:null,mira:null};
  let drawnDiningChairs=new Set();
  const diningVisualFor=(id,action)=>{
    if(action?.id==='dining'&&action.phase==='using'&&action.diningStage==='eating'){
      const previous=diningVisual[id];
      if(!previous||previous.tableId!==action.targetInstanceId||
         previous.chairId!==action.diningSeatInstanceId){
        const approach=diningSeatApproach(game.world,action.targetInstanceId,
          action.diningSeatInstanceId);
        diningVisual[id]=approach?{
          tableId:action.targetInstanceId,chairId:action.diningSeatInstanceId,
          side:approach.side,
          maxPull:diningChairPullLimit(game.world,action.targetInstanceId,
            action.diningSeatInstanceId)
        }:null;
      }
    }
    return diningVisual[id];
  };
  const renderDiningChairOffsets=()=>{
    const changed=new Set();
    if(!furnishMode)for(const id of HOUSEHOLD_IDS){
      const visual=diningVisual[id],progress=sofaStates[id].progress;
      if(!visual||progress<=0)continue;
      const item=game.world.furniture.instances.find(x=>x.instanceId===visual.chairId&&
        x.prefabId==='chair'&&x.location==='home');
      const node=item&&decorNodes.get(item.instanceId);
      if(!node)continue;
      const offset=diningChairPullOffset(progress,visual.maxPull);
      const q=rotateLocal(0,offset,item.yaw);
      node.setPosition(item.x+q.x,0,item.z+q.z);
      changed.add(item.instanceId);
    }
    for(const id of drawnDiningChairs)if(!changed.has(id)){
      const item=game.world.furniture.instances.find(x=>x.instanceId===id&&x.location==='home');
      const node=decorNodes.get(id);
      if(item&&node)node.setPosition(item.x,0,item.z);
    }
    drawnDiningChairs=changed;
  };
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
  // F4F: simple original tableware, visible only for a verified seated meal.
  const diningDishes=Object.fromEntries(HOUSEHOLD_IDS.map(id=>{
    const plate=cylinder('F4F plate '+id,0,.79,0,.34,.024,.34,M.white);
    const food=ball('F4F meal '+id,0,.84,0,.23,.075,.18,M.yellow);
    plate.enabled=false;food.enabled=false;
    return [id,{plate,food}];
  }));
  // Shared world-space carry presentation works with both character skins.
  const cookedCarry=Object.fromEntries(HOUSEHOLD_IDS.map(id=>{
    const tray=cylinder('F4G.2 tray '+id,0,0,0,.37,.045,.30,M.white);
    const food=ball('F4G.2 food '+id,0,0,0,.24,.09,.22,M.yellow);
    tray.enabled=false;food.enabled=false;
    return [id,{tray,food}];
  }));
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
    fridge: {x:FRIDGE_LAYOUT.approach.x,y:0,z:FRIDGE_LAYOUT.approach.z,pitch:0,yaw:FRIDGE_FACING_YAW},
    lamp: {x:0,y:0,z:-.90,pitch:0,yaw:0},
    mirror: {x:0,y:0,z:-.88,pitch:0,yaw:0},
    dresser: {x:0,y:0,z:-1.06,pitch:0,yaw:0},
    wardrobe: {x:0,y:0,z:-1.20,pitch:0,yaw:0},
    cook: {x:0,y:0,z:-1.08,pitch:0,yaw:0},
    prep: {x:0,y:0,z:-1.04,pitch:0,yaw:0},
    wash: {x:0,y:0,z:-1.05,pitch:0,yaw:0},
    paint: {x:0,y:0,z:-1.00,pitch:0,yaw:0}
  };
  if(game.action?.phase==='using') {
    const dest=game.action.id==='bed'
      ?bedDestinationFor(game,'alex',game.action.targetInstanceId):
      game.action.id==='tv'&&game.action.watchSeatInstanceId
        ?furnitureActionApproach(game.world,'sofa',game.action.watchSeatInstanceId):
      game.action.id==='hobby'&&game.action.readingSeatInstanceId
        ?furnitureActionApproach(game.world,'sofa',game.action.readingSeatInstanceId):
      game.action.id==='dining'
        ?(game.action.diningStage==='eating'
          ?diningSeatApproach(game.world,game.action.targetInstanceId,game.action.diningSeatInstanceId)
          :furnitureActionApproach(game.world,'fridge')):
      game.action.id==='cook'
        ?(['taking','toFridge','toFridgeStore','storing'].includes(game.action.cookStage)
          ?furnitureActionApproach(game.world,'fridge')
          :['toPrep','preparing'].includes(game.action.cookStage)
            ?furnitureActionApproach(game.world,'prep',game.action.prepInstanceId)
            :furnitureActionApproach(game.world,'cook',game.action.targetInstanceId)):null;
    const actual=dest||(game.action.id==='bench'
      ?outdoorBenchApproach(game.world,game.action.targetInstanceId)
      :furnitureActionApproach(game.world,game.action.id,game.action.targetInstanceId));
    const [x,z]=actual?[actual.x,actual.z]:ACTIONS[game.action.id].location;
    game.position={x,z}; // old v0.1 saves used different stand positions
  }
  game.position=nearestWalkable(game.position,game.world);
  if(game.otherSim.action?.phase==='using') {
    const dest=game.otherSim.action.id==='bed'
      ?bedDestinationFor(game,'mira',game.otherSim.action.targetInstanceId):
      game.otherSim.action.id==='tv'&&game.otherSim.action.watchSeatInstanceId
        ?furnitureActionApproach(game.world,'sofa',game.otherSim.action.watchSeatInstanceId):
      game.otherSim.action.id==='hobby'&&game.otherSim.action.readingSeatInstanceId
        ?furnitureActionApproach(game.world,'sofa',game.otherSim.action.readingSeatInstanceId):
      game.otherSim.action.id==='dining'
        ?(game.otherSim.action.diningStage==='eating'
          ?diningSeatApproach(game.world,game.otherSim.action.targetInstanceId,game.otherSim.action.diningSeatInstanceId)
          :furnitureActionApproach(game.world,'fridge')):
      game.otherSim.action.id==='cook'
        ?(['taking','toFridge','toFridgeStore','storing'].includes(game.otherSim.action.cookStage)
          ?furnitureActionApproach(game.world,'fridge')
          :['toPrep','preparing'].includes(game.otherSim.action.cookStage)
            ?furnitureActionApproach(game.world,'prep',game.otherSim.action.prepInstanceId)
            :furnitureActionApproach(game.world,'cook',game.otherSim.action.targetInstanceId)):null;
    const actual=dest||(game.otherSim.action.id==='bench'
      ?outdoorBenchApproach(game.world,game.otherSim.action.targetInstanceId)
      :furnitureActionApproach(game.world,game.otherSim.action.id,game.otherSim.action.targetInstanceId));
    const [x,z]=actual?[actual.x,actual.z]:ACTIONS[game.otherSim.action.id].location;
    game.otherSim.position={x,z};
  }
  game.otherSim.position=nearestWalkable(game.otherSim.position,game.world);
  const display={x:game.position.x,y:lotActorHeight(game.world,game.position),z:game.position.z,yaw:0,pitch:0,roll:0};
  const miraDisplay={x:game.otherSim.position.x,y:lotActorHeight(game.world,game.otherSim.position),z:game.otherSim.position.z,yaw:0,pitch:0,roll:0};
  let facing=0,gait=0,miraFacing=0,miraGait=0,effectTime=0,fridgeOpen=0;
  const fridgeLeaving={alex:false,mira:false};
  const fridgeWasUsing={
    alex:game.action?.phase==='using'&&(game.action.id==='fridge'||
      (game.action.id==='cook'&&['taking','storing'].includes(game.action.cookStage))),
    mira:game.otherSim.action?.phase==='using'&&(game.otherSim.action.id==='fridge'||
      (game.otherSim.action.id==='cook'&&['taking','storing'].includes(game.otherSim.action.cookStage)))
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
  const destination=(id,residentId='alex',targetInstanceId=null,watchSeatInstanceId=null)=>{
    if(id==='garden')return getActor(game,residentId)?.action?.gardenGoal||
      gardenApproach(game.world,targetInstanceId,getActor(game,residentId)?.position)?.goal||null;
    if(id==='move')return getActor(game,residentId)?.action?.goal||null;
    if(id==='bench')return outdoorBenchApproach(game.world,targetInstanceId);
    if(id==='hobby:toSeat'){
      const reader=getActor(game,residentId);
      return reader?.action?.id==='hobby'
        ?furnitureActionApproach(game.world,'sofa',reader.action.readingSeatInstanceId):null;
    }
    if(id==='hobby:toShelf'||id==='hobby:returnShelf')
      return furnitureActionApproach(game.world,'hobby',targetInstanceId);
    if(id==='cook'){
      const a=getActor(game,residentId)?.action;
      if(!a||['toFridge','taking','toFridgeStore','storing'].includes(a.cookStage))
        return furnitureActionApproach(game.world,'fridge');
      if(['toPrep','preparing'].includes(a.cookStage))
        return furnitureActionApproach(game.world,'prep',a.prepInstanceId);
      return furnitureActionApproach(game.world,'cook',a.targetInstanceId);
    }
    if(id==='dining'){
      const a=getActor(game,residentId)?.action;
      return !a||['toFridge','taking'].includes(a.diningStage)
        ?furnitureActionApproach(game.world,'fridge')
        :diningSeatApproach(game.world,a.targetInstanceId,a.diningSeatInstanceId);
    }
    if(id==='music'){
      const person=getActor(game,residentId);
      if(person?.action?.id==='music'&&
        validMusicListeningSpot(game.world,
          person.action.targetInstanceId,person.action.musicSpot))
        return person.action.musicSpot;
      return chooseMusicListeningSpot(game.world,person.position,targetInstanceId)?.point||null;
    }
    return id==='bed'
      ?bedDestinationFor(game,residentId,targetInstanceId)
      :id==='tv'&&watchSeatInstanceId
        ?furnitureActionApproach(game.world,'sofa',watchSeatInstanceId)
        :furnitureActionApproach(game.world,id,targetInstanceId);
  };
  function buildRoute(id,actorId='alex',targetInstanceId=null,watchSeatInstanceId=null,
    musicPlan=null) {
    const actor=getActor(game,actorId);
    const goal=musicPlan?.point||destination(id,actorId,targetInstanceId,watchSeatInstanceId);
    const points=musicPlan?.path||(goal&&findPath(actor.position,goal,game.world));
    if(!points) return false;
    paths[actorId]={points,index:0,id};
    return true;
  }
  beginAction=(id,automatic=false,actorId=game.selectedSim,fromQueue=false,targetInstanceId=null,
    activityId=null,contentId=null,inventoryItemId=null,recipeId=null)=>{
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
    // Music is not a fixed front-facing appliance. Pick a clear A* approach
    // around the player's actual rotated station, and persist the SAME goal.
    const musicPlan=id==='music'
      ?chooseMusicListeningSpot(game.world,actor.position,targetInstanceId):null;
    if((id==='music'&&!musicPlan)||
      !buildRoute(id,actorId,targetInstanceId,watchSeat?.sofaId||null,musicPlan)){
      if(!automatic&&!fromQueue) toast(getActorName(actorId)+' не может добраться до предмета');
      else actor.autonomy.nextAt=game.minutes+15;
      return false;
    }
    const started=chooseResidentAction(game,id,automatic,actorId,targetInstanceId,
      activityId,contentId,musicPlan,inventoryItemId,recipeId);
    if(started)restartAutonomyWait(actorId);
    return started;
  };

  const beginGardenAction=(actorId,instanceId,actionId,fromQueue=false,automatic=false)=>{
    const actor=getActor(game,actorId);
    if(actor.action||game.socialAction||residentUnavailableForHome(game,actorId)||
      !gardenActionAllowed(game,actorId,instanceId,actionId,{ignoreReservation:fromQueue})){
      if(!fromQueue&&!automatic)toast('Уход за грядкой сейчас недоступен');
      return false;
    }
    const plan=gardenApproach(game.world,instanceId,actor.position);
    if(!plan)return false;
    if(!chooseAction(actor,'garden',automatic))return false;
    actor.action.targetInstanceId=instanceId;
    actor.action.gardenActionId=actionId;
    actor.action.gardenGoal=plan.goal;
    actor.action.gardenPlantedAt=game.world.outdoors.gardens[instanceId]?.plantedAt;
    if(automatic&&!recordResidentGardenStart(game,actorId,instanceId)){
      actor.action=null;return false;
    }
    actor.event=actionId==='water'?'Идёт поливать растение':
      actionId==='inspect'?'Идёт осмотреть растение':
      actionId==='harvest'?'Идёт собирать урожай':
      actionId==='replant'?'Идёт сажать травы заново':'Идёт полюбоваться садом';
    paths[actorId]={points:plan.path,index:0,id:'garden'};
    restartAutonomyWait(actorId);
    return true;
  };
  // LOT-B3: one genuine, timed seat reserved by exact outdoor ID.
  // Uses canonical A*, action simulation and FIFO, never a parallel clock.
  const beginOutdoorBench=(actorId,instanceId,fromQueue=false)=>{
    const actor=getActor(game,actorId);
    if(actor.action||game.socialAction||residentUnavailableForHome(game,actorId)||
      !outdoorBenchAvailable(game,actorId,instanceId)){
      if(!fromQueue)toast('Скамейка занята или персонаж недоступен');
      return false;
    }
    if(!buildRoute('bench',actorId,instanceId)){
      if(!fromQueue)toast('Не получается подойти к скамейке');
      return false;
    }
    if(!chooseAction(actor,'bench',false))return false;
    actor.action.targetInstanceId=instanceId;
    actor.event='Идёт отдыхать на садовой скамейке';
    restartAutonomyWait(actorId);return true;
  };
  // Meet beside the other resident at a walkable, reachable point.
  beginSocial=(kind,automatic=false,actorId=game.selectedSim,topic=null,shared=null,branchId=null,fromQueue=false)=>{
    if(residentUnavailableForHome(game,actorId)||
       residentUnavailableForHome(game,actorId==='alex'?'mira':'alex')){
      if(!automatic&&!fromQueue)toast('Один из жителей сейчас на работе');
      return false;
    }
    if(!canStartSocial(game,kind,actorId,automatic)){
      if(!automatic&&!fromQueue)toast('Собеседник занят или разговор уже идёт');
      return false;
    }
    const self=getActor(game,actorId),partnerId=actorId==='alex'?'mira':'alex',
      partner=getActor(game,partnerId);
    if(shared?.mode==='leisure'&&['tv','books','music'].includes(shared.choiceId)){
      const plan=shared.choiceId==='tv'
        ?planSharedTv(game,actorId,shared.targetInstanceId||'home-tv-1')
        :planPairedHobby(game,actorId,shared.choiceId,shared.targetInstanceId||null);
      if(!plan)return false;
      const first=plan.places[actorId],second=plan.places[partnerId];
      const a=findPath(self.position,first,game.world);
      const b=findPath(partner.position,second,game.world);
      if(!a||!b||!(shared.choiceId==='tv'
        ?startSharedSocial(game,actorId,first,'leisure','tv',false,plan)
        :startSharedSocial(game,actorId,first,'leisure',shared.choiceId,automatic,plan)))return false;
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
        (session.shared?.mode==='leisure'&&
          Boolean((session.shared.tvPlan||session.shared.pairPlan)?.places?.[residentId]))||
        (session.branchAction?.id==='romance.evening'&&
          (session.eveningStage||session.eveningSofa)&&session.partner===residentId));
  };
  dispatchPlannedActions=()=>{
    if(game.paused||dialogueNeedsDecision(game))return [];
    // An unfinished plan can mature before its watering command is reached.
    // Drop obsolete garden instructions without blocking subsequent FIFO tasks.
    let expired=0;
    for(const id of HOUSEHOLD_IDS)for(const task of [...pendingActions(game.actionQueues,id)]){
      if(task.type==='garden'&&!gardenRequestStillValid(game,id,task.instanceId,task.actionId))
        if(removeQueuedAction(game.actionQueues,id,task.seq))expired++;
    }
    if(expired){save(true);toast('Сад вырос: устаревшее действие убрано из очереди');}
    const refused=[];
    const started=dispatchActionQueues(game.actionQueues,{
      canStart(residentId,command){
        if(!HOUSEHOLD_IDS.includes(residentId)||game.socialAction||
           residentUnavailableForHome(game,residentId))return false;
        if((routeRetryAt.get(command.seq)||0)>performance.now())return false;
        const actor=getActor(game,residentId);
        if(actor.action||sofaStates[residentId].progress>0||
          bedStates[residentId].progress>0||showerStates[residentId].active||
          toiletStates[residentId].active||fridgeLeaving[residentId])return false;
        if(command.type==='activity'){
          const activity=getActivityDefinition(HOBBY_ACTIVITIES,command.activityId);
          return (!command.inventoryItemId||inventoryFor(game,residentId).some(item=>
            item.type==='book'&&item.id===command.inventoryItemId))&&
            furnitureAvailable(game,
              activity?.requiredCapabilities.includes('music.playback')?'music':
              activity?.requiredCapabilities.includes('art.paint')?'paint':'hobby',
              residentId,command.targetInstanceId);
        }
        if(command.type==='object')
          return (command.actionId!=='cook'||canCookRecipe(game.kitchen,command.recipeId,
            currentSkillLevel(actor.skills,HOBBY_SKILLS,COOKING_SKILL_ID)))&&
            (command.autoTable===true&&command.actionId==='dining'
            ?Boolean(nearestAvailableDiningTable(game,residentId))
            :furnitureAvailable(game,command.actionId,residentId,command.targetInstanceId))&&
            !(command.actionId==='shower'&&HOUSEHOLD_IDS.some(id=>
              id!==residentId&&showerStates[id].active))&&
            !(command.actionId==='toilet'&&HOUSEHOLD_IDS.some(id=>
              id!==residentId&&toiletStates[id].active));
        if(command.type==='garden')return gardenActionAllowed(game,residentId,
          command.instanceId,command.actionId,{ignoreReservation:true})&&
          Boolean(gardenApproach(game.world,command.instanceId,actor.position));
        if(command.type==='outdoor')return outdoorBenchAvailable(game,residentId,command.instanceId)&&
          Boolean(findPath(actor.position,outdoorBenchApproach(game.world,command.instanceId),game.world));
        if(command.type==='move')return isWalkable(command.x,command.z,game.world)&&
          Boolean(findPath(actor.position,{x:command.x,z:command.z},game.world));
        const partnerId=command.targetId;
        // Current 3D scene is a two-person adapter; the queue core is N-person.
        if(!HOUSEHOLD_IDS.includes(partnerId)||partnerId===residentId||
          (residentId==='alex'?'mira':'alex')!==partnerId)return false;
        const partner=getActor(game,partnerId);
        if(residentUnavailableForHome(game,partnerId)||
           partner.action||sofaStates[partnerId].progress>0||
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
        if(command.type==='object'){
          const target=command.autoTable===true&&command.actionId==='dining'
            ?nearestAvailableDiningTable(game,residentId)?.instanceId
            :command.targetInstanceId;
          if(target||command.autoTable!==true)
            started=beginAction(command.actionId,false,residentId,true,target,
              null,null,null,command.recipeId||null);
        }
        else if(command.type==='activity'){
          const activity=getActivityDefinition(HOBBY_ACTIVITIES,command.activityId);
          const actionId=activity?.requiredCapabilities.includes('music.playback')?'music':
            activity?.requiredCapabilities.includes('art.paint')?'paint':'hobby';
          started=beginAction(actionId,false,residentId,true,command.targetInstanceId,
            command.activityId,command.contentId,command.inventoryItemId||null);
        }
        else if(command.type==='outdoor')
          started=beginOutdoorBench(residentId,command.instanceId,true);
        else if(command.type==='garden')
          started=beginGardenAction(residentId,command.instanceId,command.actionId,true);
        else if(command.type==='move'){
          const actor=getActor(game,residentId),goal={x:command.x,z:command.z};
          const route=findPath(actor.position,goal,game.world);
          if(route){
            actor.action={id:'move',phase:'walking',elapsed:0,automatic:false,goal};
            actor.event='Идёт в выбранное место';
            paths[residentId]={id:'move',points:route,index:0};
            restartAutonomyWait(residentId);started=true;
          }
        }
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
            const musicBlocked=command.type==='activity'&&[MUSIC_ACTIVITY_ID,MUSIC_DANCE_ACTIVITY_ID].includes(command.activityId);
            const message=getActorName(residentId)+
              (musicBlocked
                ? ': нет свободного подхода к музыкальному центру. В «Дом → Комната» поверни или перенеси его.'
                : ': путь пока недоступен — проверь расположение мебели или удали задание из очереди');
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
    benchVisualTargets.alex=null;benchVisualTargets.mira=null;
    facing=0;gait=0;miraFacing=0;miraGait=0;fridgeOpen=0;
    for(const id of HOUSEHOLD_IDS){fridgeLeaving[id]=false;fridgeWasUsing[id]=false;}
    for(const id of HOUSEHOLD_IDS){
      sofaStates[id]=createSofaTransition();
      diningVisual[id]=null;
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
    drawnDiningChairs.clear(); // reset returns every visual-only chair to its saved position
    updateDecorNodes();renderOutdoorGround();renderOutdoorFeatures();
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
  camera.addComponent('camera',{ clearColor:new pc.Color(0.85,0.91,0.86), fov:41, nearClip:.1, farClip:180 });
  app.root.addChild(camera);
  // W1-A.2: physically varying environment uses ONLY the existing two
  // non-shadow directional lights and one camera. Saved lamp states stay manual.
  const dayNightRenderer=createDayNightRenderer({scene:app.scene,sun,fill,camera,Color:pc.Color});
  currentOutdoorDaylight=dayNightRenderer.update(game.calendar,game.minutes);
  syncOutdoorLights(currentOutdoorDaylight);
  setCameraBuildBounds(CAMERA_LOT_BOUNDS);
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
  $('menu-lot-camera-btn').addEventListener('click',()=>{
    if(furnishMode||buildMode||outdoorMode)return;
    setView({...view,centerX:7,centerZ:0,distance:44,pitch:61});
    setViewOpen(false);toast('Весь участок: коснись земли, чтобы отправить жителя');
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
      ?'Земля → выбор «Идти сюда» · один палец — вращение · два — масштаб'
      :'Земля → выбор «Идти сюда» · свайп — камера · два — масштаб';
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
  activeViewportPointers=()=>cameraGesture.count();
  // User may view the entire lot from the same camera in touch Build mode.
  const gesturePoint=e=>({id:e.pointerId,x:e.clientX,y:e.clientY});
  // F1 edit mode: UI state is ephemeral; only confirmed domain transactions
  // change the optional v1 world.furniture save extension. No action is consumed.
  let editSession=null,editSelectedId=null,editDrag=null;
  let buildSession=null,buildDrag=null,buildTool='camera',pendingBuild=null,buildPreviousView=null,selectedBuildWall=null;
  let selectedBuildRoom=null,selectedBuildRoomInfo=null,buildRoomRotation=0;
  let finishFloor='floor.oak',finishWall='wall.sage',finishCeiling='ceiling.chalk',
    finishFacade='facade.brick',finishSide='both';
  let porchMaterial='porch.stone',porchDepth=3;
  const openingChoice={door:'door.simple',window:'window.classic',arch:'arch.round'};
  let selectedBuildOpening=null,selectedBuildRoof=null;
  const roofChoice={styleId:'roof.gable',materialId:'roof.slate',pitch:.38,eaves:.4};
  let shopOpen=false,warehouseOpen=false,shopSelected=null,shopPose=null;
  // UX-02b is transient: the canonical root-v1 world and wallet are not
  // touched until the player confirms a valid owned-item placement.
  let ownedPlacement=null,ownedSwipeRawPose=null;
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
  const lockedFurnitureIds=(includePending=true)=>{
    const busy=new Set();
    if(game.socialAction?.eveningStage?.instanceId)
      busy.add(game.socialAction.eveningStage.instanceId);
    if(game.socialAction?.eveningSofa?.instanceId)
      busy.add(game.socialAction.eveningSofa.instanceId);
    // Unaddressed shared plans in old saves: do not remove the partner's seat.
    if(game.socialAction?.shared&&!game.socialAction.shared.tvPlan)
      for(const item of game.world.furniture.instances)
        if(['sofa','tv','bed'].includes(item.prefabId)&&item.location==='home')
          busy.add(item.instanceId);
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
      else if(actor?.action?.id){
        const prefab=Object.values(FURNITURE_CATALOG).find(def=>
          def.actionId===actor.action.id)?.prefabId;
        if(prefab)lockPrefab(prefab);
      }
      if(actor?.action?.id==='hobby'&&actor.action.readingSeatInstanceId)
        busy.add(actor.action.readingSeatInstanceId);
      if(actor?.action?.id==='tv'&&actor.action.watchSeatInstanceId)
        busy.add(actor.action.watchSeatInstanceId);
      if(actor?.action?.id==='cook'&&actor.action.prepInstanceId)
      busy.add(actor.action.prepInstanceId);
    if(actor?.action?.id==='dining'&&actor.action.diningSeatInstanceId)
        busy.add(actor.action.diningSeatInstanceId);
      // Pending commands identify the same durable instance ID after moving
      // or rotating it, so allow repositioning to repair a blocked approach.
      // Storing/selling is still prohibited while commands are pending.
      if(includePending)for(const pending of pendingActions(game.actionQueues,id)){
        if(['object','activity'].includes(pending.type)&&pending.targetInstanceId)
          busy.add(pending.targetInstanceId);
        else if(pending.type==='object'){
          const prefab=Object.values(FURNITURE_CATALOG).find(def=>
            def.actionId===pending.actionId)?.prefabId;
          if(prefab)lockPrefab(prefab);
        }
      }
    }
    return [...busy];
  };
  const editorContext=(allowQueuedReposition=false)=>({
    lockedInstanceIds:lockedFurnitureIds(!allowQueuedReposition),
    construction:game.world.construction,
    residents:HOUSEHOLD_IDS.map(id=>getActor(game,id).position)
  });
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
      'protected-item':'Этот предмет встроен в конструкцию и пока не отделяется',
      'last-essential':'Нельзя убрать последнюю необходимую мебель · сначала установи замену',
      'missing-working-replacement':'Замена есть, но к ней нельзя безопасно подойти',
      'missing-appraisal':'Для этого предмета ещё не определена оценочная стоимость',
      'unreachable-sofa':'К этому дивану нельзя пройти · выбери другое место',
      'unreachable-tv':'Нельзя подойти к экрану этого телевизора · выбери другое место',
      'unreachable-music':'К музыкальному центру не подойти · поверни его или освободи проход',
      'unreachable-seat':'К предмету нельзя подойти · освободи место спереди',
      'unreachable-utility':'К этой мебели нельзя подойти · освободи место перед ней',
      'insufficient-credits':'Недостаточно пробных кредитов',
      'full-household':'Слишком много предметов',
      'missing-light-mount':'Нужна настоящая стена рядом или пол внутри комнаты',
      'light-mount-occupied':'На этом креплении уже есть светильник',
      'mounted-light-blocks-construction':'Сначала перенеси или убери светильник с изменяемой стены',
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
  const ownedQuote=()=>ownedPlacement?quoteOwnedPlacement(
    game.world.furniture,game.shop,ownedPlacement.kind,
    ownedPlacement.instanceId,ownedPlacement.pose,editorContext()):null;
  const renderOwnedPlacement=()=>{
    const stage=ownedPlacement,box=$('furnish-owned-preview');
    box.hidden=!stage;
    $('furniture-editor').dataset.ownedPlacing=String(!!stage);
    if(!stage)return;
    const item=editorItem(stage.instanceId);
    if(!item)return;
    const quote=ownedQuote();
    const changed=stage.kind==='restore'||item.x!==stage.pose.x||
      item.z!==stage.pose.z||item.yaw!==stage.pose.yaw;
    const canConfirm=!!quote?.ok&&changed;
    $('furnish-owned-name').textContent=(stage.kind==='restore'?'Со склада · ':'Перестановка · ')+
      editorLabel(stage.instanceId);
    $('furnish-owned-status').textContent=!changed?'Передвинь предмет или поверни его':
      quote?.ok?'✓ Подходит · '+(stage.kind==='restore'?'возврат бесплатный':'бесплатная перестановка'):
      '✕ '+editorMessage(quote?.reason);
    $('furnish-owned-status').dataset.invalid=String(changed&&!quote?.ok);
    $('furnish-owned-confirm').disabled=!canConfirm;
    $('furnish-owned-confirm').textContent=stage.kind==='restore'
      ?'✓ Вернуть бесплатно':'✓ Подтвердить';
    const rect=instanceRect(stage.pose,FURNITURE_CATALOG[item.prefabId].footprint);
    furnitureGhost.setPosition((rect.minX+rect.maxX)/2,.075,(rect.minZ+rect.maxZ)/2);
    furnitureGhost.setLocalScale(Math.max(.15,rect.maxX-rect.minX),.038,
      Math.max(.15,rect.maxZ-rect.minZ));
    furnitureGhost.render.material=canConfirm?ghostValid:ghostInvalid;
    furnitureGhost.enabled=furnishMode;
    updateDecorNodes(stage.instanceId,stage.pose);
    $('hint').textContent=oneFingerMode==='orbit'
      ?'Коснись пола для выбора места · два пальца — камера'
      :'Перемещай предмет пальцем · два пальца — камера';
  };
  const cancelOwnedPlacement=(feedback=true)=>{
    if(!ownedPlacement)return;
    ownedPlacement=null;ownedSwipeRawPose=null;
    editDrag=null;canvas.dataset.furnitureGrab='false';
    furnitureGhost.enabled=false;
    updateDecorNodes();renderFurnitureSelection();renderWarehouse();
    if(feedback)editorFeedback('Отменено · мебель, склад и кошелёк без изменений');
  };
  const beginOwnedPlacement=(kind,id)=>{
    if(!furnishMode||shopOpen||ownedPlacement)return false;
    const item=editorItem(id);
    if(!item||(kind==='move'?!canMoveFurniture(item):
      kind!=='restore'||item.location!=='storage'))return false;
    const initial=kind==='restore'
      ?findOwnedPlacement(game.world.furniture,game.shop,kind,id,editorContext())
      :{x:item.x,z:item.z,yaw:item.yaw};
    ownedPlacement={kind,instanceId:id,pose:initial||
      {x:item.x,z:item.z,yaw:item.yaw}};
    ownedSwipeRawPose=null;
    if(kind==='move')editSelectedId=id;
    renderFurnitureSelection();
    editorFeedback(kind==='restore'
      ?'Примерка со склада · бесплатно. Выбери место и подтверди.':
      'Перестановка · положение сохранится только после подтверждения.');
    return true;
  };
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
  const lightControl=document.createElement('label');
  lightControl.textContent='Режим света ';
  lightControl.className='furnish-light-control';
  const lightModeSelect=document.createElement('select');
  lightModeSelect.id='furnish-light-mode';
  lightModeSelect.setAttribute('aria-label','Режим настенного или потолочного светильника');
  for(const [value,label] of [['auto','Авто'],['on','Вкл'],['off','Выкл']]){
    const option=document.createElement('option');option.value=value;option.textContent=label;
    lightModeSelect.append(option);
  }
  lightControl.append(lightModeSelect);
  $('furnish-commands').append(lightControl);
  lightModeSelect.addEventListener('change',()=>{
    if(!furnishMode||!editSession)return;
    const item=game.world.furniture.instances.find(x=>x.instanceId===editSelectedId);
    if(!item||!MOUNTED_LIGHTS[item.itemDefinitionId])return;
    const changed=setMountedLightMode(game.world.furniture,item.instanceId,lightModeSelect.value);
    if(!changed.ok)return;
    const done=editSession.transactMarket({...changed,shop:game.shop,
      instanceId:item.instanceId,amount:0});
    if(!done.ok)return;
    game.world.furniture=done.world;game.shop=done.shop;
    updateDecorNodes();renderFurnitureSelection();save(true);
    editorFeedback('Режим света сохранён');
  });
  const renderFurnitureSelection=()=>{
    const item=editorItem(editSelectedId);
    const selectable=!!item&&item.location==='home';
    lightControl.hidden=!selectable||!MOUNTED_LIGHTS[item?.itemDefinitionId];
    if(!lightControl.hidden)lightModeSelect.value=item.lightMode||'auto';
    $('furnish-commands').hidden=!furnishMode||shopOpen||warehouseOpen||!selectable||!!ownedPlacement;
    // Unlike the former hidden selection-only turn button, this room toolbar
    // is always present. A native picker lets Safari users select items even
    // when the 3D ray is partly covered by another piece of furniture.
    const roomTools=$('furnish-room-tools');
    roomTools.hidden=!furnishMode||shopOpen||warehouseOpen||!!ownedPlacement;
    if(!roomTools.hidden){
      const picker=$('furnish-item-select');
      const prompt=document.createElement('option');
      prompt.value='';prompt.textContent='Выбери мебель…';
      const options=[prompt];
      for(const instance of game.world.furniture.instances){
        if(!canMoveFurniture(instance))continue;
        const option=document.createElement('option');
        option.value=instance.instanceId;
        option.textContent=editorLabel(instance.instanceId)+
          (instance.instanceId.startsWith('shop-')?' · №'+instance.instanceId.split('-').at(-1):'');
        options.push(option);
      }
      picker.replaceChildren(...options);
      picker.value=selectable&&canMoveFurniture(item)?item.instanceId:'';
    }
    $('furnish-rotate').disabled=!selectable||!canMoveFurniture(item);
    $('furnish-move').disabled=!selectable||!canMoveFurniture(item);
    const tradable=selectable&&canTradeMarketInstance(item);
    const storeQuote=tradable?storeMarketItem(game.world.furniture,game.shop,
      item.instanceId,editorContext()):null;
    const saleQuote=tradable?sellMarketItem(game.world.furniture,game.shop,
      item.instanceId,editorContext()):null;
    $('furnish-store').disabled=!storeQuote?.ok;
    $('furnish-restore').hidden=true; // storage gets its own visible item actions
    $('furnish-sell').disabled=!saleQuote?.ok;
    $('furnish-sell').textContent=saleQuote?.ok
      ?'Продать · +'+saleQuote.amount+' кр.':'Продать';
    $('furnish-selected-card').textContent=selectable
      ?editorLabel(item.instanceId)+' · '+(item.instanceId.startsWith('shop-')
        ?'Куплено':'Исходная мебель')+' · В комнате':'Выбери предмет в комнате';
    $('furnish-trade-status').textContent=!selectable?'':[
      'Склад: '+(storeQuote?.ok?'бесплатно':editorMessage(storeQuote?.reason||'protected-item')),
      'Продажа: '+(saleQuote?.ok?'+'+saleQuote.amount+' кр.':
        editorMessage(saleQuote?.reason||'protected-item'))
    ].join(' · ');
    // M15: a last bed is protected with guidance, not an obscure tooltip.
    const lastBed=selectable&&item.prefabId==='bed'&&
      (storeQuote?.reason==='last-essential'||saleQuote?.reason==='last-essential');
    if(lastBed)$('furnish-trade-status').textContent=
      'Одна кровать в доме. Чтобы убрать или продать её, сначала поставь другую.';
    $('furnish-protected-shop').hidden=!lastBed;
    $('furnish-store').title=storeQuote?.ok?'Поместить на склад бесплатно':
      editorMessage(storeQuote?.reason||'protected-item');
    $('furnish-sell').title=saleQuote?.ok?'Продажа с подтверждением':
      editorMessage(saleQuote?.reason||'protected-item');
    const history=editSession?.state();
    $('furnish-undo').disabled=!furnishMode||!history?.canUndo;
    $('furnish-redo').disabled=!furnishMode||!history?.canRedo;
    $('furnish-title').textContent=shopPlacing?'Выбираем место':shopOpen?'Магазин':
      warehouseOpen?'Склад':item&&selectable
        ?'Обстановка · '+editorLabel(item.instanceId):'Обстановка';
    if(shopOpen||warehouseOpen||!selectable)furnitureGhost.enabled=false;
    else if(!ownedPlacement)showGhost(editSelectedId);
    $('furnish-balance').textContent='Кредиты: '+game.shop.credits;
    renderOwnedPlacement();
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
      editorFeedback(editorLabel(id)+': нажми «Переставить» или удерживай палец 0,5 секунды');
    else editorFeedback('Коснись предмета на 3D-сцене или открой каталог');
  };
  // F4b2: store UI selects SKU identity; renderer/footprint still use prefab.
  const shopListings=selectShopCatalog();
  const shopQualityRegistry=legacyObjectRegistry();
  // Sculptural SVG previews reuse modelKey geometry; no image downloads and
  // no PlayCanvas instances are created while scrolling the store.
  const svgNS='http://www.w3.org/2000/svg';
  const buildProductThumbnail=offer=>{
    const meshSku=meshyFurnitureDisplaySku(offer.itemId);
    if(meshSku&&furnitureVisualMode!=='legacy'){
      // Real GLB snapshots generated by the protected public CI pipeline.
      // The 32 unsupported SKUs keep authored procedural sketches.
      const photo=document.createElement('img');
      photo.className='furnish-sku-sketch furnish-meshy-thumb';
      photo.src=meshyFurnitureThumbnailUrl(meshSku);
      photo.alt='';photo.decoding='async';photo.loading='lazy';
      photo.addEventListener('error',()=>{
        const svg=buildProductThumbnail({...offer,itemId:'__procedural__'});
        photo.replaceWith(svg);
      },{once:true});
      return photo;
    }
    const svg=document.createElementNS(svgNS,'svg');
    svg.setAttribute('viewBox','0 0 92 76');
    svg.setAttribute('aria-hidden','true');
    svg.classList.add('furnish-sku-sketch');
    const recipe=furnitureThumbnailFaces(offer.prefabId,offer.modelKey);
    for(const face of recipe){
      const part=document.createElementNS(svgNS,face.kind==='ellipse'?'ellipse':'polygon');
      part.setAttribute('fill',face.fill);
      if(face.kind==='ellipse'){
        for(const attribute of ['x','y','rx','ry'])
          part.setAttribute(attribute==='x'?'cx':attribute==='y'?'cy':attribute,String(face[attribute]));
      }else{
        part.setAttribute('points',face.points.map(p=>p.join(',')).join(' '));
      }
      svg.append(part);
    }
    return svg;
  };
  let shopRoomCategory=null,shopFunctionCategory=null;
  let shopTypeCategory=null,shopSearchText='';
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
    const requestedPreviewType=shopSelected+'|'+(shopSelectedItemId||'');
    if(shopPreviewType!==requestedPreviewType){
      clearShopPreviewEntity();
      const template=decorTemplates.get(shopSelected);
      if(template){
        shopPreviewEntity=template.clone();
        shopPreviewEntity.name='Unsaved furniture placement preview';
        if(shopSelectedItemId)applySkuModel(shopPreviewEntity,shopSelectedItemId);
        app.root.addChild(shopPreviewEntity);
        meshyFurniture.attach(shopPreviewEntity,
          meshyFurnitureDisplaySku(shopSelectedItemId)||shopSelectedItemId);
        shopPreviewType=requestedPreviewType;
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
    const visibleShopListings=selectShopCatalog({
      roomCategoryId:shopRoomCategory,functionCategoryId:shopFunctionCategory,
      typeCategoryId:shopTypeCategory,searchText:shopSearchText
    });
    const comparable=listing&&!shopPlacing
      ?compareShopVariants(shopQualityRegistry,visibleShopListings,listing.itemId):[];
    const comparePanel=$('furnish-variant-compare');
    comparePanel.hidden=!shopOpen||shopPlacing||comparable.length===0;
    // Data is produced by the canonical SKU registry, never from 3D/UI state.
    const compareRows=$('furnish-variant-rows');
    compareRows.replaceChildren();
    if(!comparePanel.hidden)for(const other of comparable){
      const line=document.createElement('div');
      line.className='furnish-variant-row';
      const description=document.createElement('p');
      description.textContent=formatShopVariantComparison(other);
      const selectVariant=document.createElement('button');
      selectVariant.type='button';
      selectVariant.className='furnish-variant-select';
      selectVariant.textContent='Выбрать вариант';
      selectVariant.setAttribute('aria-label','Выбрать в каталоге: '+other.name);
      selectVariant.addEventListener('click',()=>{
        // Recheck the CURRENT catalog filters and placement status.
        // A stale comparison row can never select a hidden SKU or buy it.
        if(!furnishMode||!shopOpen||shopPlacing)return;
        const currentVisible=selectShopCatalog({
          roomCategoryId:shopRoomCategory,functionCategoryId:shopFunctionCategory,
      typeCategoryId:shopTypeCategory,searchText:shopSearchText
        });
        const id=chooseComparableVariant(shopQualityRegistry,currentVisible,
          shopSelectedItemId,other.itemId);
        if(!id)return;
        chooseShopProduct(id);
        if(game.shop.credits>=shopListings.find(item=>item.itemId===id).price)
          $('furnish-buy').click();
        else editorFeedback('Недостаточно кредитов для выбранной модели',true);
        $('furnish-buy').focus({preventScroll:true});
      });
      line.append(description,selectVariant);compareRows.append(line);
    }
    $('furnish-placement-guide').hidden=!shopPlacing;
    $('furnish-placing-name').textContent=listing?.name||'Предмет';
    $('furnish-placing-status').textContent=shopPlacing
      ?(MOUNTED_LIGHTS[listing?.itemId]?.mount==='wall'
        ?'Проведи по полу вдоль стены: бра крепится к ближайшему свободному сегменту.'
        :MOUNTED_LIGHTS[listing?.itemId]?.mount==='ceiling'
          ?'Коснись пола нужной комнаты — светильник поднимется к потолку.'
          :'Веди предмет пальцем по полу. Два пальца — камера.'):'';
    const preview=shopPlacing&&listing&&shopPose
      ?buyMarketItem(game.world.furniture,game.shop,shopSelectedItemId,shopPose,editorContext())
      :null;
    const suitable=preview?.ok===true;
    const previewLabel=!listing?'Выбери товар в каталоге':
      !shopPlacing?'Выбран: '+listing.name+' · '+listing.effectText+'. Коснись карточки для примерки или нажми «Примерить».':
      !shopPose?'Место не выбрано. Коснись пола или нажми «Найти место»':
      suitable?'✓ Место подходит · веди предмет пальцем, «Установить» для покупки':
      '✕ '+editorMessage(preview.reason)+' · подбери другое место свайпом';
    $('furnish-preview').textContent=previewLabel;
    $('furnish-preview').dataset.invalid=String(shopPlacing&&!!listing&&!suitable);
    const purchaseSummary=$('furnish-action-summary');
    if(purchaseSummary)purchaseSummary.textContent=shopPlacing
      ?'Примерка · '+(listing?.name||'предмет')+' · деньги не списаны'
      :listing?'Выбран: '+listing.name+' · '+listing.price+' кр.':'Выбери мебель для примерки';
    $('furnish-buy').textContent=shopPlacing?'✓ Купить и установить · '+(listing?.price??0)+' кр.':
      'Примерить · '+(listing?.price??0)+' кр.';
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
      item.location==='storage'&&canTradeMarketInstance(item));
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
      const status=document.createElement('small');
      status.className='furnish-storage-status';
      const quote=sellMarketItem(game.world.furniture,game.shop,item.instanceId,editorContext());
      status.textContent='На складе · возврат 0 кр. · №'+item.instanceId+
        ' · продажа '+(quote.ok?'+'+quote.amount+' кр.':editorMessage(quote.reason));
      const restore=document.createElement('button');restore.type='button';
      restore.textContent='↩ Разместить';
      restore.addEventListener('click',()=>beginOwnedPlacement('restore',item.instanceId));
      const sell=document.createElement('button');sell.type='button';
      sell.textContent=quote.ok?'Продать · +'+quote.amount:'Продать';
      sell.disabled=!quote.ok;
      sell.addEventListener('click',()=>sellFurniture(item.instanceId));
      card.append(title,status,restore,sell);list.append(card);
    }
  };
  const setEditorView=mode=>{
    if(ownedPlacement)cancelOwnedPlacement(false);
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
  // Touch-friendly category rail, independent from room/function facets.
  // Category IDs are registered data; no product-specific UI switches.
  const typeTabs=$('furnish-type-tabs');
  const subtypeTabs=$('furnish-subtype-tabs');
  const buildTypeTab=(category)=>{
    const button=document.createElement('button');
    button.type='button';button.dataset.categoryId=category?.id||'';
    button.textContent=category?((category.icon||'▦')+' '+category.label):'Все';
    button.setAttribute('aria-pressed','false');
    button.addEventListener('click',()=>{
      if(!shopOpen||shopPlacing)return;
      shopTypeCategory=category?.id||null;
      renderShopFilteredItems();renderFurnitureSelection();
    });
    typeTabs.append(button);
  };
  buildTypeTab(null);
  const availableTypeIds=new Set(shopCategoryOptions('type').map(cat=>cat.id));
  for(const category of FURNITURE_SHOP_TYPES)
    if(!category.parentId&&availableTypeIds.has(category.id))
      buildTypeTab(category);
  const syncSubtypes=()=>{
    const selected=FURNITURE_SHOP_TYPES.find(cat=>cat.id===shopTypeCategory);
    const root=selected?.parentId||selected?.id||null;
    for(const tab of typeTabs.querySelectorAll('button'))
      tab.setAttribute('aria-pressed',String(tab.dataset.categoryId===(root||'')));
    subtypeTabs.replaceChildren();
    subtypeTabs.hidden=!root;
    if(!root)return;
    const entries=[{id:root,label:'Все'}].concat(
      FURNITURE_SHOP_TYPES.filter(cat=>cat.parentId===root&&availableTypeIds.has(cat.id)));
    for(const entry of entries){
      const button=document.createElement('button');
      button.type='button';button.textContent=entry.label;
      button.dataset.categoryId=entry.id;
      button.setAttribute('aria-pressed',String(shopTypeCategory===entry.id));
      button.addEventListener('click',()=>{
        if(!shopOpen||shopPlacing)return;
        shopTypeCategory=entry.id;
        renderShopFilteredItems();renderFurnitureSelection();
      });
      subtypeTabs.append(button);
    }
  };
  $('furnish-search').addEventListener('input',event=>{
    if(!shopOpen||shopPlacing)return;
    shopSearchText=event.currentTarget.value||'';
    renderShopFilteredItems();renderFurnitureSelection();
  });
  const renderShopFilteredItems=()=>{
    const visible=selectShopCatalog({
      roomCategoryId:shopRoomCategory,functionCategoryId:shopFunctionCategory,
      typeCategoryId:shopTypeCategory,searchText:shopSearchText
    });
    const ids=new Set(visible.map(item=>item.itemId));
    syncSubtypes();
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
    const skuSketch=buildProductThumbnail(item);
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
    button.prepend(skuSketch);
    if(qualitySummary)button.append(quality);
    button.setAttribute('aria-pressed','false');
    button.addEventListener('click',()=>{
      if(!furnishMode||!shopOpen||shopPlacing)return;
      chooseShopProduct(item.itemId);
      if(game.shop.credits<item.price){
        editorFeedback('Недостаточно кредитов для «'+item.name+'»',true);return;
      }
      // Selecting a card opens the existing non-persistent 3D preview.
      // The canonical Buy handler still charges only on explicit installation.
      $('furnish-buy').click();
    });
    $('furnish-stock').append(button);
  }
  renderShopFilteredItems();
  $('furnish-item-select').addEventListener('change',event=>{
    if(!furnishMode||shopOpen||warehouseOpen)return;
    chooseFurniture(event.currentTarget.value||null);
  });
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
    const finance=recordFinanceChange(game,transaction.shop,{
      kind:transaction.amount<0?'purchase':transaction.amount>0?'sale':'undo',
      sourceId:transaction.instanceId||'furniture',
      atGameMinute:Math.floor(game.minutes)});
    if(!finance.ok){editorFeedback('Финансовая операция отклонена',true);return false;}
    const result=editSession.transactMarket(transaction);
    if(!result.ok){editorFeedback(editorMessage(result.reason),true);return false;}
    game.world.furniture=result.world;game.shop=finance.shop;
    game.financialHistory=finance.financialHistory;
    updateFamilyBalance();refreshMind(game,game.world);refreshMind(game.otherSim,game.world);
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
    if(editSelectedId)beginOwnedPlacement('restore',editSelectedId);
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
  $('furnish-protected-shop').addEventListener('click',()=>{
    const item=editorItem(editSelectedId);
    if(item?.prefabId!=='bed')return;
    // M15: take the player to existing bed offers, without a second catalog.
    shopRoomCategory=null;shopFunctionCategory=null;shopTypeCategory=null;
    shopSearchText='кровать';
    $('furnish-search').value=shopSearchText;
    $('furnish-room-filter').value='';
    $('furnish-function-filter').value='';
    setEditorView('shop');renderShopFilteredItems();
    editorFeedback('Выбери и поставь ещё одну кровать, чтобы продать исходную.');
  });
  $('furnish-move').addEventListener('click',()=>{
    if(editSelectedId)beginOwnedPlacement('move',editSelectedId);
  });
  $('furnish-owned-turn').addEventListener('click',()=>{
    if(!ownedPlacement)return;
    ownedPlacement.pose={...ownedPlacement.pose,
      yaw:(ownedPlacement.pose.yaw+90)%360};
    ownedSwipeRawPose=null;renderOwnedPlacement();
  });
  $('furnish-owned-auto').addEventListener('click',()=>{
    if(!ownedPlacement)return;
    const pose=findOwnedPlacement(game.world.furniture,game.shop,
      ownedPlacement.kind,ownedPlacement.instanceId,editorContext());
    if(!pose){editorFeedback('Безопасное место не найдено',true);return;}
    ownedPlacement.pose=pose;ownedSwipeRawPose=null;renderOwnedPlacement();
  });
  $('furnish-owned-cancel').addEventListener('click',()=>cancelOwnedPlacement());
  $('furnish-owned-confirm').addEventListener('click',()=>{
    if(!ownedPlacement)return;
    const stage=ownedPlacement,quote=ownedQuote();
    const source=editorItem(stage.instanceId);
    if(!quote?.ok){editorFeedback(editorMessage(quote?.reason),true);return;}
    if(stage.kind==='move'){
      if(source.x===stage.pose.x&&source.z===stage.pose.z&&source.yaw===stage.pose.yaw)return;
      // The editor is the existing source of truth for reversible movement.
      if(!commitFurniture(stage.instanceId,stage.pose))return;
      ownedPlacement=null;ownedSwipeRawPose=null;renderFurnitureSelection();
    }else{
      if(!applyMarketTransaction(restoreMarketItem(game.world.furniture,game.shop,
        stage.instanceId,stage.pose,editorContext()),'Со склада · бесплатно'))return;
      ownedPlacement=null;ownedSwipeRawPose=null;
      setEditorView('edit');chooseFurniture(stage.instanceId);
    }
  });
  const commitFurniture=(instanceId,pose)=>{
    if(!editSession||!furnishMode)return false;
    const result=editSession.commit(instanceId,pose,editorContext(true));
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
    const finance=recordFinanceChange(game,result.shop,{
      kind:type,sourceId:'furniture-revision-'+result.world.revision,
      atGameMinute:Math.floor(game.minutes)});
    if(!finance.ok){
      // Editor history already moved; return to its previous snapshot.
      if(type==='undo')editSession.redo();else editSession.undo();
      editorFeedback('Не удалось сохранить финансовое изменение',true);return;
    }
    game.world.furniture=result.world;
    if(result.shop)game.shop=finance.shop;
    game.financialHistory=finance.financialHistory;
    updateFamilyBalance();renderWarehouse();
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
    if(beginOwnedPlacement('move',item.instanceId)){
      ownedPlacement.pose={...ownedPlacement.pose,yaw:(ownedPlacement.pose.yaw+90)%360};
      renderOwnedPlacement();
    }
  });
  const exitFurniture=()=>{
    if(!furnishMode)return;
    cancelPendingGrab();
    if(ownedPlacement)cancelOwnedPlacement(false);
    editDrag=null;canvas.dataset.furnitureGrab='false';
    cameraGesture.clear();
    furnishMode=false;editSelectedId=null;editSession=null;
    setCameraBuildBounds(CAMERA_LOT_BOUNDS);
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
    // F5-D.2: reach built rooms across the 32×24 lot while arranging items.
    setCameraBuildBounds({minX:BUILD_LOT.minX+1,maxX:BUILD_LOT.maxX-1,
      minZ:BUILD_LOT.minZ+1,maxZ:BUILD_LOT.maxZ-1,maxDistance:100});
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
    editorFeedback('Выбери мебель → «Переставить» → укажи место → «Подтвердить». Доступно удержание 0,5 с.');
  };

  // F5-A construction editor: separate transaction history, no change to Buy mode.
  const buildingReason={
    'invalid-rectangle':'Протяни прямоугольник хотя бы 1×1 м',
    'wall-must-be-straight':'Стена должна идти по прямой оси сетки',
    'outside-floor':'Строить стены можно по контуру построенного пола',
    'lot-bounds':'За границами участка 32×24',
    'protected-legacy-floor':'Исходный пол защищён: пристройку удалять можно',
    'protected-starter-floor':'Пол расширенной исходной комнаты убирается возвратом её стены',
    'resident-on-floor':'На этом месте стоит житель',
    'furniture-on-floor':'На этом месте стоит мебель',
    'resident-blocked':'Стена задевает жителя',
    'wall-not-found':'Нажми на стену, а не на пустой участок',
    'opening-needs-three-wall-sections':'Для проёма нужны три соседние секции стены',
    'opening-overlap':'На выбранном участке уже есть дверь или окно',
    'wall-has-opening':'Сначала убери проём, затем стену',
    'opening-not-found':'Здесь нет двери или окна',
    'wall-intersects-furniture':'Стена пересекает мебель. Сначала переставь предмет',
    'furniture-on-floor':'Сперва убери мебель с участка',
    'invalid-wall-move':'Перетащи выбранную стену перпендикулярно от неё',
    'starter-minimum':'Исходную стену можно сужать только до первоначального размера комнаты',
    'starter-strip-occupied':'Пол пристройки занят новой стеной: сначала убери её',
    'wall-already-exists':'Здесь уже есть другая стена',
    'empty-history':'Нет изменений для отмены',
    'unchanged':'Здесь уже всё построено',
    'inaccessible-essential':'После перестройки житель не дойдёт до важных предметов',
    'finish-needs-floor':'Отделку пола можно положить только на построенный пол',
    'invalid-finish-target':'Выбери нужную поверхность: пол или стену',
    'unknown-finish':'Этот вариант покрытия недоступен',
    'unknown-opening-style':'Неизвестный вариант проёма',
    'wall-has-decor':'На этом участке висит картина или полка · выбери свободный участок',
      'mounted-light-blocks-construction':'Сначала перенеси или убери светильник с изменяемой стены',
    'starter-opening-outside':'Сначала убери проём или отверстие на удаляемой полосе стены',
    'opening-needs-wall-space':'Для этого широкого проёма нужны четыре свободных секции стены',
    'opening-style-unavailable':'Выбери дизайн двери, окна или арки',
    'invalid-roof-rectangle':'Для секции крыши протяни область хотя бы 2×2 м',
    'roof-needs-floor':'Под крышей должен быть построенный пол. Сначала убери крышу перед сносом пола',
    'roof-overlap':'Секции крыши не должны перекрываться',
    'roof-too-complex':'Слишком сложный контур: укрой отдельными секциями',
    'roof-not-found':'Коснись существующей секции крыши',
    'unknown-roof-style':'Выбери форму, материал, уклон и свес крыши',
    'unknown-wall-height':'Выбери одну из трёх высот стен',
    'unknown-facade':'Выбери облицовку фасада',
    'invalid-facade-scope':'Выбери весь фасад или одну стену',
    'not-exterior-wall':'Нужна наружная стена: включи «Стены ↑» и коснись внешнего контура',
    'unknown-porch':'Выбери камень, дерево или кирпич',
    'porch-needs-door':'Для крыльца нужна настоящая наружная дверь',
    'porch-needs-exterior-door':'Дверь должна выходить наружу, на свободный участок',
    'porch-overlap':'Здесь уже есть входная площадка',
    'porch-exists':'У этой двери уже построено крыльцо',
    'porch-not-found':'Коснись двери с построенным крыльцом',
    'porch-intersects-furniture':'Крыльцо пересекает предмет мебели',
    'too-many-porches':'На участке слишком много крылец',
    'room-not-found':'Коснись пола существующей комнаты',
    'room-protected':'Первоначальный дом можно копировать как пустую планировку, но нельзя переносить целиком',
    'room-not-rectangular':'Выбери прямоугольную комнату без выступов и внутренних перегородок',
    'room-not-enclosed':'Нужна комната с четырьмя настоящими стенами',
    'room-has-furniture':'Нельзя перенести комнату с непереносимыми предметами',
    'room-item-fixed':'Есть встроенный предмет, который нельзя перенести вместе с комнатой',
    'room-item-busy':'Мебель используется или запланирована в очереди действий',
    'room-item-crosses-wall':'Часть мебели выступает за пределы комнаты',
    'room-item-bounds':'Мебель не помещается в допустимые границы участка',
    'room-item-outside':'После поворота мебель выходит за стену комнаты',
    'room-item-collision':'На новом месте мебель столкнётся с другим предметом',
    'room-item-unreachable':'После переноса к одному из предметов нельзя подойти',
    'room-has-art':'На стене есть картина: перенос с сохранением её привязки — следующий этап',
    'room-has-resident':'Житель находится в комнате. Попроси его выйти перед изменением',
    'room-shared-opening':'Проём соединяет несколько помещений — сначала измени его',
    'room-shared-boundary':'Комната соединена с другим полом. Пока её можно копировать, переносить — только отдельную',
    'room-has-porch':'Для переноса комнаты сначала убери крыльцо; при копировании оно остаётся у исходной двери',
    'room-has-manual-roof':'Сначала убери отдельную секцию крыши над комнатой',
    'partition-wall-not-found':'Коснись настоящей общей стены двух соседних комнат',
    'partition-needs-two-rooms':'Здесь наружная стена. Для объединения нужна стена между комнатами',
    'partition-already-connected':'Это уже одно помещение: перегородка не разделяет две комнаты',
    'partition-legacy-wall':'Эта часть исходного дома имеет старую стену и декор. Пока объединяй через новые общие стены',
    'partition-partial-opening':'Проём пересекает границу выбранной стены; сначала измени его',
    'partition-has-porch':'Сначала убери крыльцо с затронутой двери',
    'partition-has-art':'На перегородке картина: сначала сними её в инвентарь',
    'room-target-overlap':'На новом месте уже есть пол или стены',
    'room-target-occupied':'Новое место пересекает мебель или жителя',
    'invalid-room-placement':'Выбери свободное место на участке для комнаты'
  };
  const buildFeedback=(msg,invalid=false)=>{
    $('build-feedback').textContent=msg;
    $('build-feedback').dataset.invalid=String(invalid);
  };
  const buildHistoryButtons=()=>{
    const state=buildSession?.state();
    $('build-undo').disabled=!state?.canUndo;
    $('build-redo').disabled=!state?.canRedo;
  };
  const buildSnap=pt=>({x:Math.round(pt.x*2)/2,z:Math.round(pt.z*2)/2});
  const buildContext=()=>({residents:HOUSEHOLD_IDS.map(id=>getActor(game,id).position),
    furniture:game.world.furniture.instances,
    furnitureBoxes:game.world.furniture.instances.filter(item=>item.location==='home'&&
      !FURNITURE_CATALOG[item.prefabId].walkThrough)
      .map(item=>({instanceId:item.instanceId,...instanceRect(item,FURNITURE_CATALOG[item.prefabId].footprint)})),
    lockedInstanceIds:lockedFurnitureIds(),
    // H5b paintings are permanent objects. Forbid placing a real opening
    // underneath a hanging work rather than silently losing its wall anchor.
    wallDecor:allArtwork().map((work,index)=>{
      const item=game.world.furniture.instances.find(i=>i.instanceId===work.easelInstanceId);
      const origin=work.origin||(item?{x:item.x,z:item.z,yaw:item.yaw}:null);
      const pose=artworkDisplayPose(work,index,origin,game.world.construction);
      return pose?{x:pose.x,z:pose.z,radius:.46}:null;
    }).filter(Boolean)});
  const buildProposal=cmd=>{
    const candidate=cmd?.type==='room-relocate'
      ?proposeFurnishedRoomMove(game.world,cmd,buildContext())
      :proposeConstructionEdit(game.world.construction,cmd,buildContext());
    if(!candidate.ok)return candidate;
    const guard=mountedFixturesSurviveEdit(game.world.construction,candidate.world,
      candidate.furniture||game.world.furniture);
    return guard.ok?candidate:guard;
  };
  const buildCommand=(from,to)=>{
    if(buildTool==='roof-add')return {type:'roof-add',from,to,...roofChoice};
    if(buildTool!=='wall')return {type:buildTool,from,to};
    // Deliberate axis lock: imperfect diagonal touch still draws a straight wall.
    const straight=Math.abs(to.x-from.x)>=Math.abs(to.z-from.z)
      ?{x:to.x,z:from.z}:{x:from.x,z:to.z};
    return {type:'wall',from,to:straight};
  };
  const showBuildGhost=(from,to)=>{
    if(!from||!to||!['room','floor','wall','remove-floor','move-wall','roof-add'].includes(buildTool)){
      buildGhost.enabled=false;return;
    }
    const command=buildTool==='move-wall'
      ?{type:'move-wall',edgeId:buildDrag?.wallEdge?.id,
        deltaI:buildDrag?.wallEdge?.axis==='v'?Math.round((to.x-from.x)*2):0,
        deltaJ:buildDrag?.wallEdge?.axis==='h'?Math.round((to.z-from.z)*2):0}
      :buildCommand(from,to);
    const result=buildProposal(command);
    const x=(from.x+to.x)/2,z=(from.z+to.z)/2;
    buildGhost.enabled=true;
    buildGhost.setPosition(x,.084,z);
    const dx=Math.abs(to.x-from.x),dz=Math.abs(to.z-from.z);
    buildGhost.setLocalScale(Math.max(.12,dx),.09,Math.max(.12,dz));
    buildFeedback(result.ok?'Отпусти палец для предварительного просмотра':buildingReason[result.reason]||result.reason,!result.ok);
  };
  const applyBuildChange=(result,label)=>{
    if(!result.ok){buildFeedback(buildingReason[result.reason]||result.reason,true);return false;}
    game.world.construction=result.world;
    if(result.furniture){
      game.world.furniture=result.furniture;
      updateDecorNodes();
      refreshMind(game,game.world);refreshMind(game.otherSim,game.world);
    }
    // IDs of moved wall segments change, so never leave an obsolete selection.
    selectedBuildWall=null;
    if(pendingBuild?.type==='room-relocate'){
      selectedBuildRoom=null;selectedBuildRoomInfo=null;
      $('build-room-label').textContent='Коснись комнаты, чтобы выбрать её';
    }
    buildWallMarker.enabled=false;
    $('build-wall-controls').hidden=true;
    for(const id of HOUSEHOLD_IDS)paths[id]={points:null,index:0,id:null};
    syncConstructionRender(true);
    // C3 mount heights follow the actual wall profile after edits and undo/redo.
    updateDecorNodes();
    buildHistoryButtons();
    save(true);
    buildFeedback(label);
    return true;
  };
  const buildEdit=cmd=>{
    if(!buildSession)return false;
    const candidate=buildProposal(cmd);
    if(!candidate.ok){buildFeedback(buildingReason[candidate.reason]||candidate.reason,true);return false;}
    // Verify the essential pathways from BOTH residents after each transaction.
    const candidateLayout={furniture:candidate.furniture||game.world.furniture,construction:candidate.world};
    for(const id of HOUSEHOLD_IDS){
      const actor=getActor(game,id);
      for(const action of ['fridge','shower','toilet','bed']){
        const point=furnitureActionApproach(game.world,action);
        if(point&&!findPath(actor.position,point,candidateLayout)){
          buildFeedback(buildingReason['inaccessible-essential'],true);return false;
        }
      }
    }
    const applied=buildSession.commit(cmd,buildContext());
    return applyBuildChange(applied,applied.movedIds?.length
      ?'Комната и '+applied.movedIds.length+' предмет(ов) перенесены · сохранено'
      :'Планировка изменена · сохранено');
  };
  const clearBuildPending=()=>{
    pendingBuild=null;$('build-pending').hidden=true;buildGhost.enabled=false;
  };
  const stageBuild=cmd=>{
    const preview=buildProposal(cmd);
    if(!preview.ok){
      buildFeedback(buildingReason[preview.reason]||preview.reason,true);
      return false;
    }
    pendingBuild=cmd;$('build-pending').hidden=false;
    const previewLabel=describeBuildPreview(cmd);
    $('build-pending-title').textContent=previewLabel.title+(previewLabel.detail?' · '+previewLabel.detail:'');
    $('build-apply').textContent=previewLabel.action;
    buildFeedback((previewLabel.detail?previewLabel.detail+' · ':'')+
      'Предпросмотр готов · подтвердить или отменить');
    return true;
  };
  $('build-apply').addEventListener('click',()=>{
    if(!pendingBuild)return;
    const committed=buildEdit(pendingBuild);
    if(committed)clearBuildPending();
  });
  $('build-cancel').addEventListener('click',()=>{
    clearBuildPending();buildFeedback('Изменение отменено · сохранение не затронуто');
  });
  const resetBuildWallSelection=()=>{
    selectedBuildWall=null;
    buildWallMarker.enabled=false;
    $('build-wall-controls').hidden=true;
  };
  const selectBuildWall=wall=>{
    resetBuildWallSelection();
    if(!wall){buildFeedback('Коснись стены в 3D, чтобы выбрать и перенести её',true);return;}
    selectedBuildWall=wall.id;
    const x=wall.axis==='h'?(wall.i+.5)*.5:wall.i*.5;
    const z=wall.axis==='v'?(wall.j+.5)*.5:wall.j*.5;
    buildWallMarker.setPosition(x,.30,z);
    buildWallMarker.setLocalScale(wall.axis==='h'?.55:.19,.56,wall.axis==='v'?.55:.19);
    buildWallMarker.enabled=true;
    $('build-wall-controls').hidden=false;
    const outward=constructionWallOutward(game.world.construction,wall.id);
    $('build-wall-expand').disabled=outward===null;
    $('build-wall-contract').disabled=outward===null||
      Boolean(wall.starterSide&&starterShellOffset(game.world.construction,wall.starterSide)===0);
    $('build-wall-label').textContent=outward===null
      ?'Межкомнатная стена · проведи пальцем перпендикулярно стене'
      :'Стена выбрана · перетащи или нажми +0,5 м для расширения';
    buildFeedback(outward===null?'Это внутренняя стена. Перетащи её в нужную сторону':
      'Для увеличения комнаты нажми «+0,5 м наружу» или перетащи стену');
  };
  const shiftSelectedBuildWall=(sign)=>{
    if(!selectedBuildWall)return;
    const wall=game.world.construction.wallEdges.find(w=>w.id===selectedBuildWall)||
      starterShellSegments(game.world.construction).find(w=>w.id===selectedBuildWall);
    if(!wall){resetBuildWallSelection();return;}
    const outward=constructionWallOutward(game.world.construction,wall.id);
    if(outward===null){buildFeedback('У межкомнатной стены нет внешней стороны: используй перетаскивание',true);return;}
    const delta=outward*sign;
    stageBuild({type:'move-wall',edgeId:wall.id,
      deltaI:wall.axis==='v'?delta:0,
      deltaJ:wall.axis==='h'?delta:0});
  };
  $('build-wall-expand').addEventListener('click',()=>shiftSelectedBuildWall(1));
  $('build-wall-contract').addEventListener('click',()=>shiftSelectedBuildWall(-1));
  $('build-wall-deselect').addEventListener('click',resetBuildWallSelection);
   const buildHeightChoices=$('build-height-choices');
  const refreshWallHeightChoices=()=>{
    buildHeightChoices.replaceChildren();
    for(const [id,option] of Object.entries(BUILD_WALL_HEIGHTS)){
      const btn=document.createElement('button');
      btn.type='button';btn.dataset.wallHeight=id;btn.textContent=option.label;
      btn.setAttribute('aria-pressed',String((game.world.construction.wallHeightClass||'normal')===id));
      btn.addEventListener('click',()=>{
        stageBuild({type:'set-wall-height',heightClass:id});
        refreshWallHeightChoices();
      });
      buildHeightChoices.appendChild(btn);
    }
  };
  const porchChoices=$('build-porch-choices');
  const refreshPorchChoices=()=>{
    porchChoices.replaceChildren();
    for(const [id,choice] of Object.entries(BUILD_PORCH_FINISHES)){
      const btn=document.createElement('button');
      btn.type='button';btn.dataset.porchFinish=id;
      const chip=document.createElement('span');chip.className='build-roof-color';
      chip.style.background=choice.color;
      btn.append(chip,document.createTextNode(choice.label));
      btn.setAttribute('aria-pressed',String(porchMaterial===id));
      btn.addEventListener('click',()=>{
        porchMaterial=id;refreshPorchChoices();
        buildFeedback('Материал крыльца: '+choice.label+' · коснись двери');
      });
      porchChoices.appendChild(btn);
    }
    $('build-porch-depth').value=String(porchDepth);
  };
  $('build-porch-depth').addEventListener('change',event=>{
    const v=Number(event.target.value);
    if([2,3,4].includes(v))porchDepth=v;
  });
  const buildFinishPalette=$('build-finish-colors');
  const refreshBuildFinishes=()=>{
    const kind=buildTool.startsWith('paint-facade')?'facade':
      buildTool==='paint-wall'?'wall':
      buildTool.startsWith('paint-ceiling')?'ceiling':'floor';
    const selected=kind==='facade'?finishFacade:
      kind==='wall'?finishWall:kind==='ceiling'?finishCeiling:finishFloor;
    buildFinishPalette.replaceChildren();
    for(const [id,definition] of Object.entries(kind==='facade'?BUILD_FACADE_FINISHES:BUILD_FINISHES[kind])){
      const button=document.createElement('button');
      button.type='button';button.className='build-finish-swatch';
      button.dataset.finishId=id;
      button.setAttribute('aria-pressed',String(selected===id));
      button.setAttribute('aria-label',definition.label);
      const chip=document.createElement('span');chip.style.background=definition.color;
      chip.className='build-finish-chip';
      const title=document.createElement('small');title.textContent=definition.label;
      button.append(chip,title);
      button.addEventListener('click',()=>{
        if(kind==='facade')finishFacade=id;
        else if(kind==='wall')finishWall=id;
        else if(kind==='ceiling')finishCeiling=id;
        else finishFloor=id;
        refreshBuildFinishes();
        if(kind==='facade'&&buildTool==='paint-facade-all')
          stageBuild({type:'paint-facade',scope:'all',materialId:finishFacade});
        else buildFeedback('Материал выбран: '+definition.label+' · коснись поверхности');
      });
      buildFinishPalette.appendChild(button);
    }
    $('build-finish-side-label').hidden=kind!=='wall';
    $('build-finish-side').value=finishSide;
    $('build-finish-label').textContent=kind==='facade'?'Наружная отделка фасада':
      kind==='wall'?'Покрытие стен':kind==='ceiling'?'Покрытие потолка':'Покрытие пола';
    $('build-finish-tip').textContent=kind==='facade'
      ?'Фасад независим от внутренних обоев. Рельеф — авторская процедурная геометрия.'
      :kind==='wall'
      ?'Полосы и панели рисуются процедурно на обеих сторонах стены.'
      :kind==='ceiling'?'Для просмотра включи «Потолок».'
      :'Направление досок и мозаика — отдельные образцы.';
  };
  $('build-finish-side').addEventListener('change',event=>{finishSide=event.target.value;});
  const roofStylesRoot=$('build-roof-styles'),roofMaterialsRoot=$('build-roof-materials');
  const stageRoofSettings=()=>{
    if(buildTool==='roof-auto')stageBuild({type:'roof-auto',...roofChoice});
    else if(buildTool==='roof-edit'&&selectedBuildRoof)
      stageBuild({type:'roof-update',id:selectedBuildRoof.id,...roofChoice});
    else buildFeedback('Форма выбрана · отметь участок крыши');
  };
  const refreshBuildRoofs=()=>{
    const make=(root,registry,key)=>{
      root.replaceChildren();
      for(const [id,info] of Object.entries(registry)){
        const button=document.createElement('button');
        button.type='button';button.dataset.roofChoice=id;
        button.setAttribute('aria-pressed',String(roofChoice[key]===id));
        button.textContent=info.label;
        if(info.color){
          const chip=document.createElement('span');chip.style.background=info.color;
          chip.className='build-roof-color';button.prepend(chip);
        }
        button.addEventListener('click',()=>{
          roofChoice[key]=id;refreshBuildRoofs();stageRoofSettings();
        });
        root.appendChild(button);
      }
    };
    make(roofStylesRoot,ROOF_STYLES,'styleId');
    make(roofMaterialsRoot,ROOF_MATERIALS,'materialId');
    $('build-roof-pitch').value=String(roofChoice.pitch);
    $('build-roof-eaves').value=String(roofChoice.eaves);
    $('build-roof-tip').textContent=buildTool==='roof-edit'
      ?selectedBuildRoof?'Секция выбрана · поменяй форму, цвет, уклон или свес и примени':
        'Коснись секции крыши в 3D, затем изменяй параметры.'
      :buildTool==='roof-add'?'Протяни над построенным полом прямоугольник от 2×2 м.'
      :buildTool==='roof-remove'?'Коснись крыши, чтобы снять только её секцию.'
      :buildTool==='roof-clear'?'Удаляем все секции крыши только после подтверждения.'
      :'Построит кровлю по существующему полу. Изменения требуют подтверждения.';
  };
  for(const [id,key] of [['build-roof-pitch','pitch'],['build-roof-eaves','eaves']])
    $(id).addEventListener('change',event=>{
      const value=Number(event.target.value);
      if((key==='pitch'?ROOF_PITCHES:ROOF_EAVES).includes(value)){
        roofChoice[key]=value;stageRoofSettings();
      }
    });
  const buildOpeningPalette=$('build-opening-variants');
  const refreshBuildOpenings=()=>{
    const replace=buildTool==='change-opening';
    const family=replace?'':buildTool;
    buildOpeningPalette.replaceChildren();
    $('build-opening-label').textContent=replace
      ?selectedBuildOpening?'Выбери замену для проёма':'Сначала коснись существующей двери, окна или арки'
      :family==='door'?'Выбери дверь':family==='window'?'Выбери окно':'Выбери арку';
    for(const [id,variant] of Object.entries(BUILD_OPENING_STYLES)){
      if(!replace&&variant.type!==family)continue;
      const button=document.createElement('button');
      button.type='button';button.className='build-opening-variant';
      button.dataset.openingStyle=id;
      button.textContent=variant.label;
      button.disabled=replace&&!selectedBuildOpening;
      const active=replace
        ?selectedBuildOpening&&selectedBuildOpening.styleId===id
        :openingChoice[family]===id;
      button.setAttribute('aria-pressed',String(Boolean(active)));
      button.addEventListener('click',()=>{
        if(replace){
          if(!selectedBuildOpening)return;
          const candidate={type:'change-opening',id:selectedBuildOpening.id,styleId:id};
          if(stageBuild(candidate)){
            selectedBuildOpening={...selectedBuildOpening,styleId:id};
            refreshBuildOpenings();
          }
        }else{
          openingChoice[family]=id;
          refreshBuildOpenings();
          buildFeedback('Выбрано: '+variant.label+' · коснись стены для установки');
        }
      });
      buildOpeningPalette.appendChild(button);
    }
  };
  // UX-03: tool groups are a transient view of the original 31 command buttons.
  // Switching a tab does not commit, discard, or change a staged ConstructionWorld edit.
  const showBuildView=open=>{
    $('build-view-panel').hidden=!open;
    $('build-view-trigger').setAttribute('aria-expanded',String(open));
  };
  const showBuildGroup=id=>{
    if(!BUILD_TOOL_GROUPS.some(group=>group.id===id))return;
    document.querySelectorAll('[data-build-group-tab]').forEach(button=>
      button.setAttribute('aria-pressed',String(button.dataset.buildGroupTab===id)));
    document.querySelectorAll('#build-tools [data-build-tool]').forEach(button=>{
      button.hidden=button.dataset.buildGroup!==id;
    });
    showBuildView(false);
  };
  document.querySelectorAll('[data-build-group-tab]').forEach(button=>
    button.addEventListener('click',()=>showBuildGroup(button.dataset.buildGroupTab)));
  $('build-view-trigger').addEventListener('click',()=>
    showBuildView($('build-view-panel').hidden));
  const setBuildTool=type=>{
    clearBuildPending();resetBuildWallSelection();
    selectedBuildRoom=null;selectedBuildRoomInfo=null;buildRoomRotation=0;
    $('build-room-label').textContent='Коснись прямоугольной комнаты для выбора';
    $('build-room-turn').textContent='⟳ Поворот 0°';
    selectedBuildOpening=null;selectedBuildRoof=null;
    buildTool=type;buildDrag=null;cameraGesture.clear();
    if(buildGroupForTool(type)!=='view')showBuildGroup(buildGroupForTool(type));
    const selectedButton=document.querySelector('[data-build-tool="'+type+'"]');
    $('build-active-tool').textContent='Инструмент: '+
      (selectedButton?.textContent?.replace(/^[^A-Za-zА-Яа-яЁё0-9]+/,'').trim()||type);
    const wantRoof=type.startsWith('roof-')||(type==='camera'&&roofPreview);
    if(roofPreview!==wantRoof){
      roofPreview=wantRoof;
      $('build-roof-toggle').setAttribute('aria-pressed',String(roofPreview));
      syncConstructionRender(true);
    }
    const wantCeiling=type.startsWith('paint-ceiling');
    if(wantCeiling!==ceilingPreview){
      ceilingPreview=wantCeiling;
      $('build-ceiling-toggle').setAttribute('aria-pressed',String(ceilingPreview));
      syncConstructionRender(true);
    }
    $('build-editor').dataset.tool=type;
    const finishes=['paint-floor','paint-room','paint-wall','paint-ceiling-room',
      'paint-ceiling-tile','sample-finish','paint-facade','paint-facade-all'];
    $('build-finish-picker').hidden=!finishes.includes(type);
    if(finishes.includes(type))refreshBuildFinishes();
    const openings=['door','window','arch','change-opening'];
    $('build-opening-picker').hidden=!openings.includes(type);
    if(openings.includes(type))refreshBuildOpenings();
    $('build-room-controls').hidden=!['room-duplicate','room-relocate'].includes(type);
    $('build-roof-picker').hidden=!type.startsWith('roof-');
    if(type.startsWith('roof-'))refreshBuildRoofs();
    $('build-height-picker').hidden=type!=='wall-height';
    if(type==='wall-height')refreshWallHeightChoices();
    $('build-porch-picker').hidden=type!=='porch-add';
    if(type==='porch-add')refreshPorchChoices();
    if(type.startsWith('paint-facade')||type.startsWith('porch-')){
      constructionWallMode='up';
      document.querySelectorAll('[data-build-walls]').forEach(btn=>
        btn.setAttribute('aria-pressed',String(btn.dataset.buildWalls==='up')));
      syncConstructionRender(true);
    }
    document.querySelectorAll('[data-build-tool]').forEach(btn=>
      btn.setAttribute('aria-pressed',String(btn.dataset.buildTool===type)));
    const tips={
      camera:'Свайп одним пальцем — перемещение камеры; двумя — поворот и масштаб',
      'move-wall':'Коснись любой стены дома — старой или новой — и перенеси её пальцем либо кнопкой +0,5 м.',
      room:'Протяни прямоугольник новой комнаты и нажми «Применить»',
      'room-duplicate':'Выбери даже исходную комнату, затем место для копии. Для большой исходной комнаты поверни копию на 90° и ставь справа от дома; мебель, картины и крыльцо остаются в оригинале.',
      'room-relocate':'Коснись отдельной комнаты с мебелью, затем нового места. Мебель переместится вместе со стенами. Картины на стене защищены.',
      'room-join':'Коснись общей стены двух соседних помещений: целая непрерывная перегородка будет убрана одним действием. Картину сначала сними; дверь или окно на перегородке исчезнет вместе с ней. Для разделения пользуйся инструментом «Стена».',
      floor:'Протяни область, чтобы увеличить пол без перегородки',
      wall:'Протяни по прямой, чтобы построить стену',
      door:'Выбери дизайн и коснись стены для установки двери',
      window:'Выбери дизайн и коснись стены для установки окна',
      arch:'Выбери дизайн и коснись стены для открытой арки',
      'change-opening':'Коснись установленного проёма, затем выбери новый дизайн',
      'erase-wall':'Коснись стены для демонтажа',
      'remove-opening':'Коснись двери, окна или арки для удаления',
      'remove-floor':'Протяни область пола, которую нужно убрать',
      'paint-floor':'Выбери покрытие и коснись одной плитки пола. Затем «Применить».',
      'paint-room':'Выбери покрытие и коснись комнаты — зальём весь её пол.',
      'paint-wall':'Выбери обои или панели, затем коснись любой стены.',
      'paint-ceiling-room':'Выбери цвет и коснись пола комнаты — отделаем потолок над ней.',
      'paint-ceiling-tile':'Выбери цвет и коснись плитки — отделаем потолок над ней.',
      'sample-finish':'Пипетка: коснись уже отделанной поверхности, чтобы взять её покрытие.',
      'paint-facade':'Выбери наружное покрытие и коснись секции внешней стены.',
      'paint-facade-all':'Выбери покрытие для всего наружного фасада, затем «Применить».',
      'wall-height':'Выбери физическую высоту стен: потолки и крыши адаптируются.',
      'porch-add':'Выбери материал, глубину, затем коснись настоящей наружной двери.',
      'porch-remove':'Коснись двери с крыльцом, чтобы убрать входную площадку.',
      'roof-auto':'Подберём крышу под весь дом. Выбери форму и нажми «Применить».',
      'roof-add':'Протяни прямоугольник над полом для отдельной секции крыши.',
      'roof-edit':'Коснись крыши, чтобы выбрать секцию и изменить её дизайн.',
      'roof-remove':'Коснись секции крыши для её демонтажа.',
      'roof-clear':'Уберём все крыши после нажатия «Применить».'
    };
    $('build-instruction').textContent=tips[type]||'Выбери инструмент';
    buildFeedback(tips[type]||'Готово');
    if(type==='roof-auto')stageBuild({type:'roof-auto',...roofChoice});
    if(type==='roof-clear')stageBuild({type:'roof-clear'});
    if(type==='paint-facade-all')
      stageBuild({type:'paint-facade',scope:'all',materialId:finishFacade});
  };
  $('build-room-turn').addEventListener('click',()=>{
    buildRoomRotation=(buildRoomRotation+90)%360;
    $('build-room-turn').textContent='⟳ Поворот '+buildRoomRotation+'°';
    clearBuildPending();
    buildFeedback(selectedBuildRoom?'Поворот '+buildRoomRotation+'° · коснись нового места':'Сначала выбери комнату');
  });
  $('build-room-reset').addEventListener('click',()=>{
    selectedBuildRoom=null;selectedBuildRoomInfo=null;clearBuildPending();
    $('build-room-label').textContent='Коснись прямоугольной комнаты для выбора';
    buildFeedback('Выделение снято · выбери другую комнату');
  });
  document.querySelectorAll('[data-build-tool]').forEach(btn=>
    btn.addEventListener('click',()=>setBuildTool(btn.dataset.buildTool)));
  document.querySelectorAll('[data-build-walls]').forEach(btn=>
    btn.addEventListener('click',()=>{
      constructionWallMode=btn.dataset.buildWalls;
      document.querySelectorAll('[data-build-walls]').forEach(element=>
        element.setAttribute('aria-pressed',String(element===btn)));
      syncConstructionRender(true);
      buildFeedback('Видимость стен: '+btn.textContent);
    }));
  $('build-roof-toggle').addEventListener('click',()=>{
    roofPreview=!roofPreview;
    $('build-roof-toggle').setAttribute('aria-pressed',String(roofPreview));
    if(roofPreview&&ceilingPreview){
      ceilingPreview=false;
      $('build-ceiling-toggle').setAttribute('aria-pressed','false');
    }
    syncConstructionRender(true);
    buildFeedback(roofPreview?'Крыша показана для внешнего осмотра':
      'Крыша скрыта, интерьер виден');
  });
  $('build-ceiling-toggle').addEventListener('click',()=>{
    ceilingPreview=!ceilingPreview;
    $('build-ceiling-toggle').setAttribute('aria-pressed',String(ceilingPreview));
    syncConstructionRender(true);
    buildFeedback(ceilingPreview?'Потолок виден':'Потолок скрыт для обзора комнат');
  });
  for(const type of ['undo','redo'])$('build-'+type).addEventListener('click',()=>{
    clearBuildPending();
    if(!buildSession)return;
    const result=buildSession[type]();
    applyBuildChange(result,type==='undo'?'Стройка отменена':'Стройка возвращена');
  });
  const exitBuild=()=>{
    if(!buildMode)return;
    buildMode=false;ceilingPreview=false;roofPreview=false;selectedBuildRoof=null;
    // Wall cutaway is camera UI state, not persisted building geometry.
    constructionWallMode='cut';
    document.querySelectorAll('[data-build-walls]').forEach(btn=>
      btn.setAttribute('aria-pressed',String(btn.dataset.buildWalls==='cut')));
    $('build-roof-toggle').setAttribute('aria-pressed','false');
    $('build-ceiling-toggle').setAttribute('aria-pressed','false');
    buildDrag=null;buildSession=null;clearBuildPending();resetBuildWallSelection();
    cameraGesture.clear();setCameraBuildBounds(CAMERA_LOT_BOUNDS);
    if(buildPreviousView)setView(buildPreviousView);
    buildPreviousView=null;
    $('build-editor').hidden=true;
    $('build-toggle').setAttribute('aria-pressed','false');
    document.querySelector('.app-shell').dataset.buildMode='false';
    lotGround.enabled=true;
    for(const id of HOUSEHOLD_IDS)paths[id]={points:null,index:0,id:null};
    syncConstructionRender(true);renderPauseButton();save(true);
  };
  const enterBuild=()=>{
    if(buildMode)return;
    if(intimacyFrame(game.socialAction).active||dialogueNeedsDecision(game)){
      toast('Сначала закончи текущее взаимодействие');return;
    }
    if(furnishMode)exitFurniture();
    buildSession=createHouseholdConstructionEditor(game.world.construction,game.world.furniture);
    // Never retain the previously selected drawing tool between sessions:
    // one-finger swipes must always pan when Build first opens.
    buildTool='camera';ceilingPreview=false;roofPreview=false;selectedBuildRoof=null;
    constructionWallMode='cut';
    document.querySelectorAll('[data-build-walls]').forEach(btn=>
      btn.setAttribute('aria-pressed',String(btn.dataset.buildWalls==='cut')));
    $('build-roof-toggle').setAttribute('aria-pressed','false');
    $('build-ceiling-toggle').setAttribute('aria-pressed','false');
    // Restore the previously tested camera gesture path unchanged:
    // entering Build explicitly selects pan, without altering shop VM listeners.
    oneFingerMode='pan';showCameraMode();
    buildPreviousView={...view};
    buildMode=true;setCameraBuildBounds({minX:BUILD_LOT.minX+1,maxX:BUILD_LOT.maxX-1,
      minZ:BUILD_LOT.minZ+1,maxZ:BUILD_LOT.maxZ-1,maxDistance:100});
    // Show the eastern expansion area within the narrow portrait viewport.
    setView({...view,centerX:14.5,centerZ:0,distance:36,pitch:64});
    document.querySelector('.app-shell').dataset.buildMode='true';
    $('build-editor').hidden=false;
    $('build-toggle').setAttribute('aria-pressed','true');
    closeTour();closeMindPanel();closeInsightPanel();closeSocialContext();
    select(null);setViewOpen(false);renderQueuePanel(true);
    showBuildGroup('room');showBuildView(false);
    buildHistoryButtons();setBuildTool(buildTool);
    syncConstructionRender(true);renderPauseButton();
  };
  $('build-toggle').addEventListener('click',()=>{
    if(outdoorMode)exitOutdoor();
    buildMode?exitBuild():enterBuild();
  });
  $('build-exit').addEventListener('click',exitBuild);
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&buildMode){event.preventDefault();exitBuild();}
  },true);
  const buildWallAtScreen=point=>{
    const rect=canvas.getBoundingClientRect();
    let selected=null,best=45;
    for(const wall of constructionWallSegments(game.world.construction)){
      const shell=game.world.construction,side=wall.starterSide;
      const x=side==='west'?-4.97+starterShellOffset(shell,'west')
        :side==='east'?14.25+starterShellOffset(shell,'east')
        :wall.axis==='h'?(wall.i+.5)*.5:wall.i*.5;
      const z=side==='north'?-4.34+starterShellOffset(shell,'north')
        :side==='south'?4.34+starterShellOffset(shell,'south')
        :wall.axis==='v'?(wall.j+.5)*.5:wall.j*.5;
      // Screen rays hit walls above the floor. Accept taps near the base,
      // middle or top (including CUT mode) instead of only a thin 1.4m line.
      for(const height of [.12,.75,1.4,2.25]){
        const p=camera.camera.worldToScreen(new pc.Vec3(x,height,z));
        const dist=Math.hypot(p.x-(point.x-rect.left),p.y-(point.y-rect.top));
        if(dist<best){best=dist;selected=wall;}
      }
    }
    return selected;
  };
  const findBuildOpeningAt=target=>{
    if(!target)return null;
    const all=new Map(constructionWallSegments(game.world.construction)
      .map(w=>[w.id,w]));
    return game.world.construction.openings.find(opening=>opening.edgeIds.some(id=>{
      const edge=all.get(id);
      return id===target.id||(edge&&edge.axis===target.axis&&
        edge.i===target.i&&edge.j===target.j);
    }))||null;
  };
  const endBuildDrag=event=>{
    if(!buildDrag||buildDrag.pointerId!==event.pointerId)return false;
    const {from,to,wallEdge,hit}=buildDrag;
    buildDrag=null;
    const type=buildTool;
    if(type==='room-duplicate'||type==='room-relocate'){
      const point=hit||from;
      if(!selectedBuildRoom){
        const selected=constructionRoomSelection(game.world.construction,point,
          {allowStarter:type==='room-duplicate'});
        if(!selected.ok){
          buildFeedback(buildingReason[selected.reason]||selected.reason,true);
        }else{
          selectedBuildRoom={x:point.x,z:point.z};selectedBuildRoomInfo=selected.room;
          const room=selected.room;
          $('build-room-label').textContent='Комната '+(room.width*.5).toFixed(1)+
            ' × '+(room.height*.5).toFixed(1)+' м · '+(room.cells.length*.25).toFixed(1)+' м²';
          buildGhost.setPosition((room.i0+room.i1)*.25,.084,(room.j0+room.j1)*.25);
          buildGhost.setLocalScale(room.width*.5,.09,room.height*.5);
          buildGhost.enabled=true;
          buildFeedback('Комната выделена · коснись нового места на участке');
        }
      }else{
        const cmd={type,source:selectedBuildRoom,at:point,rotation:buildRoomRotation};
        if(stageBuild(cmd)){
          const room=selectedBuildRoomInfo;
          const rw=buildRoomRotation%180===0?room.width:room.height;
          const rh=buildRoomRotation%180===0?room.height:room.width;
          const i=Math.round(point.x*2)-Math.floor(rw/2);
          const j=Math.round(point.z*2)-Math.floor(rh/2);
          buildGhost.setPosition((i+rw/2)*.5,.084,(j+rh/2)*.5);
          buildGhost.setLocalScale(rw*.5,.09,rh*.5);
          buildGhost.enabled=true;
        }
      }
    }else if(['door','window','arch','erase-wall','room-join','remove-opening','change-opening'].includes(type)){
      const target=buildWallAtScreen(gesturePoint(event))||
        nearestConstructionEdge(game.world.construction,to,.75);
      if(type==='change-opening'){
        selectedBuildOpening=findBuildOpeningAt(target);
        if(selectedBuildOpening){
          selectedBuildOpening={...selectedBuildOpening,
            styleId:constructionOpeningStyle(selectedBuildOpening)};
          buildFeedback('Проём выбран · нажми нужный вариант в палитре');
        }else buildFeedback('Нажми на существующую дверь, окно или арку',true);
        refreshBuildOpenings();
      }else if(type==='remove-opening'){
        const opening=findBuildOpeningAt(target);
        stageBuild({type:'remove-opening',id:opening?.id});
      }else stageBuild({type,edgeId:target?.id,at:to,
        ...(openingChoice[type]?{styleId:openingChoice[type]}:{})});
    }else if(type==='porch-add'||type==='porch-remove'){
      const target=buildWallAtScreen(gesturePoint(event))||
        nearestConstructionEdge(game.world.construction,to,.75);
      const found=findBuildOpeningAt(target);
      if(type==='porch-add'){
        stageBuild({type:'porch-add',openingId:found?.id,
          depthSections:porchDepth,materialId:porchMaterial});
      }else{
        const existing=game.world.construction.porches?.find(p=>p.openingId===found?.id);
        stageBuild({type:'porch-remove',id:existing?.id});
      }
    }else if(type==='paint-facade'){
      const target=wallEdge||buildWallAtScreen(gesturePoint(event));
      stageBuild({type:'paint-facade',edgeId:target?.id,
        scope:'segment',materialId:finishFacade});
    }else if(type==='roof-remove'){
      stageBuild({type:'roof-remove',at:hit||from});
    }else if(type==='roof-edit'){
      selectedBuildRoof=[...(game.world.construction.roofModules||[])].reverse()
        .find(roof=>roofContains(roof,hit||from))||null;
      if(selectedBuildRoof){
        Object.assign(roofChoice,{styleId:selectedBuildRoof.styleId,
          materialId:selectedBuildRoof.materialId,pitch:selectedBuildRoof.pitch,
          eaves:selectedBuildRoof.eaves});
        buildFeedback('Секция крыши выбрана · изменяй параметры');
      }else buildFeedback('Секция не найдена: выбери крышу над полом',true);
      refreshBuildRoofs();
    }else if(type==='roof-add'){
      stageBuild(buildCommand(from,to));
    }else if(type==='move-wall'){
      const target=wallEdge||buildWallAtScreen(gesturePoint(event));
      if(target)selectBuildWall(target);
      const dI=target?.axis==='v'?Math.round((to.x-from.x)*2):0;
      const dJ=target?.axis==='h'?Math.round((to.z-from.z)*2):0;
      if(dI||dJ)stageBuild({type:'move-wall',edgeId:target?.id,deltaI:dI,deltaJ:dJ});
    }else if(type==='paint-floor'||type==='paint-room'){
      stageBuild({type:'paint-floor',at:hit||from,materialId:finishFloor,
        scope:type==='paint-room'?'room':'tile'});
    }else if(type==='paint-ceiling-room'||type==='paint-ceiling-tile'){
      stageBuild({type:'paint-ceiling',at:hit||from,materialId:finishCeiling,
        scope:type==='paint-ceiling-room'?'room':'tile'});
    }else if(type==='paint-wall'){
      const target=wallEdge||buildWallAtScreen(gesturePoint(event));
      stageBuild({type:'paint-wall',edgeId:target?.id,materialId:finishWall,
        side:finishSide,scope:'run'});
    }else if(type==='sample-finish'){
      const target=wallEdge||buildWallAtScreen(gesturePoint(event));
      const materialKey=target?.starterSide?'starter:'+target.starterSide:target?.id;
      const value=materialKey&&game.world.construction.materials?.wall?.[materialKey]?.b;
      if(value){
        finishWall=value;setBuildTool('paint-wall');
        buildFeedback('Пипетка взяла покрытие стены · коснись другой стены');
      }else{
        const point=hit||from,key=Math.floor(point.x*2)+','+Math.floor(point.z*2);
        finishFloor=game.world.construction.materials?.floor?.[key]||'floor.default';
        setBuildTool('paint-floor');
        buildFeedback('Пипетка взяла покрытие пола · коснись другого участка');
      }
    }else if(type!=='camera'){
      stageBuild(buildCommand(from,to));
    }
    if(!pendingBuild)buildGhost.enabled=false;
    return true;
  };

  $('furnish-toggle').addEventListener('click',()=>{
    if(outdoorMode)exitOutdoor();
    if(buildMode)exitBuild();
    furnishMode?exitFurniture():enterFurniture();
  });
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
    const candidate=cameraPlacementPose(view,shopPose,'lot');
    if(shopPose&&shopPose.x===candidate.x&&shopPose.z===candidate.z)return;
    shopPose=candidate;shopManualPose=false;renderMarket();
  };
  const editorFurnitureAt=pos=>{
    const {near,far}=furnitureRay(pos);
    const boxes=game.world.furniture.instances.filter(item=>item.location==='home')
      .map(item=>{
        const rect=instanceRect(item,FURNITURE_CATALOG[item.prefabId].footprint);
        const height={armchair:1.85,chair:1.65,diningtable:.95,floorlamp:2.1,
          rug:.09,dresser:1.17,mirror:2.17,sculpture:1.95,wardrobe:2.62,
          table:.63,nightstand:1.49,tv:2.0,plant:1.87,
          bed:1.40,counter:2.50,fridge:2.2,sofa:1.3,shower:2.75,toilet:1.45,easel:2.02,
        bookcase:2.05,music:1.2}[item.prefabId]||2;
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
    if(!beginOwnedPlacement('move',id))return false;
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
    if(ownedPlacement?.instanceId===editDrag.instanceId)ownedPlacement.pose=pose;
    // Full A* validation is expensive on iPhone: only compute when the
    // snapped cell changes and not more than ten checks per second.
    if(performance.now()-editDrag.lastCheck<95){
      renderOwnedPlacement();
      return true;
    }
    editDrag.lastCheck=performance.now();
    const candidate=ownedQuote();
    editDrag.valid=candidate.ok;
    renderOwnedPlacement();
    editorFeedback(candidate.ok?'Отпусти, чтобы поставить предмет сюда':
      editorMessage(candidate.reason),!candidate.ok);
    return true;
  };
  const endEditorDrag=event=>{
    if(!editDrag||editDrag.pointerId!==event.pointerId)return false;
    editDrag=null;holdGesture.end(gesturePoint(event));
    canvas.dataset.furnitureGrab='false';
    // Releasing the touch NEVER mutates a save. Confirmation is explicit.
    renderOwnedPlacement();return true;
  };
  const armFurnitureHold=(event,now)=>{
    if(!furnishMode||shopOpen||warehouseOpen||ownedPlacement||cameraGesture.count()!==1)return;
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
  // LOT-B2: touch-first surface and feature editing with one shared timeline; with a session-local reversible
  // financial timeline. The saved authoritative root stays game, never a UI VM.
  let outdoorTool='paint',outdoorDrag=null,outdoorPending=null;
  let outdoorCategory='ground',outdoorPose=null,outdoorYaw=0;
  const outdoorFeatureItems=OUTDOOR_PRODUCTS;
  const activeOutdoorItems=()=>outdoorFeatureItems.filter(item=>
    outdoorCategory==='garden'?item.category==='garden':
    outdoorCategory==='objects'?['furniture','light'].includes(item.category):
      ['tree','shrub','flower','fence'].includes(item.category));
  const syncOutdoorFeatureCatalog=()=>{
    const selected=$('outdoor-feature-kind').value;
    const list=activeOutdoorItems().map(item=>{
      const opt=document.createElement('option');opt.value=item.itemId;
      opt.textContent=item.name+' · '+item.price+' кр.';
      return opt;
    });
    $('outdoor-feature-kind').replaceChildren(...list);
    if(list.some(o=>o.value===selected))$('outdoor-feature-kind').value=selected;
  };
  const syncOutdoorOwned=()=>{
    const selected=$('outdoor-feature-owned').value;
    const permitted=new Set(activeOutdoorItems().map(p=>p.itemId));
    const list=game.world.outdoors.features.filter(i=>permitted.has(i.itemId));
    const options=list.map(item=>{
      const opt=document.createElement('option');opt.value=item.instanceId;
      opt.textContent=OUTDOOR_CATALOG[item.itemId].name+' · №'+item.instanceId.slice(4);
      return opt;
    });
    $('outdoor-feature-owned').replaceChildren(...options);
    if(list.some(i=>i.instanceId===selected))$('outdoor-feature-owned').value=selected;
  };
  let outdoorTimeline=[],outdoorHistoryIndex=0;
  const outdoorSnapshot=()=>({
    outdoors:JSON.parse(JSON.stringify(game.world.outdoors)),
    credits:game.shop.credits
  });
  const outdoorReason={
    'outside-lot':'Выбери землю внутри участка',
    'unchanged':'Выбранные клетки уже имеют это покрытие или защищены домом',
    'ground-limit':'Слишком большая площадь: уменьши выделение',
    'insufficient-credits':'Не хватает кредитов на выбранное покрытие',
    'unknown-ground':'Неизвестный материал',
    'invalid-state':'Данные участка недоступны',
    'stale-preview':'Участок изменился: выбери клетки снова',
    'revision-limit':'Достигнут предел операций',
    'unavailable-item':'Этот предмет появится в следующем этапе',
    'unknown-item':'Неизвестное растение или ограждение',
    'missing-instance':'Этот объект уже удалён или недоступен',
    'feature-limit':'Достигнут предел в 96 уличных объектов',
    'id-limit':'Достигнут предел номеров объектов',
    'blocked-or-outside':'Требуется свободная земля вне дома и границ участка',
    'overlap-outdoor':'Здесь уже стоит растение или ограждение',
    'overlap-furniture':'Место занято домашней мебелью',
    'resident-blocked':'Нельзя ставить препятствие прямо на жителя',
    'would-block-route':'Нельзя перекрывать проход к дому, выходу или нужным предметам',
    'invalid-pose':'Выбери допустимое место и поворот',
    'wallet-limit':'Баланс семьи достиг предела',
    'reserved-bench':'Сначала закончи отдых или удали заказ из очереди',
    'unreachable-bench':'Нельзя сесть: оставь подход и путь для обоих жителей',
    'light-limit':'На участке уже установлено восемь фонарей',
    'garden-limit':'Для мобильного участка допускается не больше восьми грядок',
    'reserved-garden':'Сначала закончи садовое действие или удали его из очереди',
    'unreachable-garden':'Оставь доступный подход к грядке для обоих жителей'
  };
  const outdoorFeedback=(message,invalid=false)=>{
    $('outdoor-preview-text').textContent=message;
    $('outdoor-preview-text').dataset.invalid=String(invalid);
  };
  const updateOutdoorPanel=()=>{
    $('outdoor-balance').textContent='Баланс семьи: '+game.shop.credits+' кр.';
    $('outdoor-apply').disabled=!outdoorPending?.ok;
    $('outdoor-undo').disabled=outdoorHistoryIndex===0;
    $('outdoor-redo').disabled=outdoorHistoryIndex>=outdoorTimeline.length-1;
    $('outdoor-tool-paint').setAttribute('aria-pressed',String(outdoorTool==='paint'));
    $('outdoor-tool-camera').setAttribute('aria-pressed',String(outdoorTool==='camera'));
    outdoorCategory=$('outdoor-category').value;
    document.querySelector('.outdoor-surface-choice[for="outdoor-ground-kind"]').hidden=outdoorCategory!=='ground';
    $('outdoor-feature-controls').hidden=outdoorCategory==='ground';
    $('outdoor-feature-kind-label').hidden=outdoorCategory==='ground'||
      $('outdoor-feature-operation').value!=='place';
    $('outdoor-feature-owned-label').hidden=outdoorCategory==='ground'||
      $('outdoor-feature-operation').value==='place';
    $('outdoor-feature-rotate').disabled=outdoorCategory==='ground'||
      $('outdoor-feature-operation').value==='sell';
    $('outdoor-apply').textContent=outdoorPending?.operation==='sell'
      ?'✓ Продать · +'+(-outdoorPending.cost)+' кр.'
      :outdoorPending?.operation==='move'?'✓ Переместить бесплатно'
      :'✓ Купить и применить';
  };
  const clearOutdoorPending=(quiet=false)=>{
    outdoorDrag=null;outdoorPending=null;outdoorPaintGhost.enabled=false;outdoorPose=null;
    if(!quiet)outdoorFeedback(outdoorCategory==='ground'
      ?'Протяни пальцем прямоугольник по свободной земле'
      :'Выбери предмет и коснись свободной земли. Поворот — отдельной кнопкой.');
    updateOutdoorPanel();
  };
  const outdoorSurfaceAtScreen=point=>{
    const {near,far}=furnitureRay(point);
    return lotRaySurface(near,far,game.world);
  };
  const paintGhostFrom=(from,to)=>{
    const a=outdoorCellAt(from?.x,from?.z),b=outdoorCellAt(to?.x,to?.z);
    if(a===null||b===null){outdoorPaintGhost.enabled=false;return;}
    const i0=Math.min(a%OUTDOOR_GRID_WIDTH,b%OUTDOOR_GRID_WIDTH);
    const i1=Math.max(a%OUTDOOR_GRID_WIDTH,b%OUTDOOR_GRID_WIDTH);
    const j0=Math.min(Math.floor(a/OUTDOOR_GRID_WIDTH),Math.floor(b/OUTDOOR_GRID_WIDTH));
    const j1=Math.max(Math.floor(a/OUTDOOR_GRID_WIDTH),Math.floor(b/OUTDOOR_GRID_WIDTH));
    outdoorPaintGhost.setPosition(-9+(i0+i1+1)*.25,-.506,-12+(j0+j1+1)*.25);
    outdoorPaintGhost.setLocalScale((i1-i0+1)*.5,.025,(j1-j0+1)*.5);
    outdoorPaintGhost.enabled=true;
  };
  const previewOutdoorSelection=(from,to,kind)=>{
    const p=previewOutdoorPaint(game,{from,to,kind});
    outdoorPending=p.ok?{...p,from,to,kind}:null;
    if(p.ok)outdoorFeedback('Выбрано '+p.changedCells+
      ' клеток · стоимость '+p.cost+' кр. · нажми «Купить и применить»');
    else outdoorFeedback(outdoorReason[p.reason]||'Нельзя изменить этот участок',true);
    updateOutdoorPanel();return p;
  };
  const outdoorSnap=n=>Math.round(n*4)/4;
  const showOutdoorFeatureGhost=(pose,valid=true)=>{
    if(!pose){outdoorPaintGhost.enabled=false;return;}
    const operation=$('outdoor-feature-operation').value;
    const chosen=operation==='place'
      ?{itemId:$('outdoor-feature-kind').value,...pose}
      :game.world.outdoors.features.find(i=>i.instanceId===$('outdoor-feature-owned').value);
    if(!chosen){outdoorPaintGhost.enabled=false;return;}
    const boxRect=outdoorFeatureRect({...chosen,...pose});
    if(!boxRect){outdoorPaintGhost.enabled=false;return;}
    outdoorPaintGhost.setPosition((boxRect.minX+boxRect.maxX)/2,-.505,
      (boxRect.minZ+boxRect.maxZ)/2);
    outdoorPaintGhost.setLocalScale(boxRect.maxX-boxRect.minX,.045,
      boxRect.maxZ-boxRect.minZ);
    outdoorPaintGhost.render.material=valid?ghostValid:ghostInvalid;
    outdoorPaintGhost.enabled=true;
  };
  const previewOutdoorObject=(pose=null)=>{
    const operation=$('outdoor-feature-operation').value;
    const id=$('outdoor-feature-owned').value;
    const itemId=$('outdoor-feature-kind').value;
    const proposal=previewOutdoorFeatureEdit(game,{
      operation,itemId,instanceId:id,
      pose:operation==='sell'?null:pose
    });
    outdoorPending=proposal.ok?proposal:null;
    if(proposal.ok)outdoorFeedback(operation==='sell'
      ?'Продажа '+OUTDOOR_CATALOG[proposal.itemId].name+
        ' · возврат '+(-proposal.cost)+' кр. (70% от оплаченной цены)'
      :operation==='move'
        ?'Положение подходит · перенос бесплатный · подтверди'
        :'Место подходит · '+OUTDOOR_CATALOG[itemId].name+
          ' · стоимость '+proposal.cost+' кр. · подтверди');
    else outdoorFeedback(outdoorReason[proposal.reason]||'Нельзя разместить здесь объект',true);
    if(operation!=='sell')showOutdoorFeatureGhost(pose,proposal.ok);
    updateOutdoorPanel();return proposal;
  };
  const exitOutdoor=()=>{
    if(!outdoorMode)return;
    outdoorMode=false;clearOutdoorPending(true);outdoorTimeline=[];
    cameraGesture.clear();setCameraBuildBounds(CAMERA_LOT_BOUNDS);
    $('outdoor-editor').hidden=true;
    document.querySelector('.app-shell').dataset.outdoorMode='false';
    renderPauseButton();save(true);
  };
  const enterOutdoor=()=>{
    if(intimacyFrame(game.socialAction).active||dialogueNeedsDecision(game)||
      careerPhone.interviewNeedsDecision()){
      toast('Сначала закончи текущее взаимодействие');return;
    }
    if(buildMode)exitBuild();
    if(furnishMode)exitFurniture();
    outdoorMode=true;outdoorTool='paint';outdoorCategory='ground';
    $('outdoor-category').value='ground';syncOutdoorFeatureCatalog();syncOutdoorOwned();
    setView({...view,centerX:7,centerZ:0,distance:43,pitch:60});
    setCameraBuildBounds({minX:BUILD_LOT.minX+1,maxX:BUILD_LOT.maxX-1,
      minZ:BUILD_LOT.minZ+1,maxZ:BUILD_LOT.maxZ-1,maxDistance:100});
    document.querySelector('.app-shell').dataset.outdoorMode='true';
    $('outdoor-editor').hidden=false;
    setHomeOpen(false);setViewOpen(false);
    closeTour();closeMindPanel();closeInsightPanel();closeSocialContext();
    select(null);cameraGesture.clear();
    outdoorTimeline=[outdoorSnapshot()];outdoorHistoryIndex=0;
    clearOutdoorPending();
    renderPauseButton();
  };
  $('home-outdoors').addEventListener('click',()=>enterOutdoor());
  $('outdoor-exit').addEventListener('click',exitOutdoor);
  for(const mode of ['paint','camera'])$('outdoor-tool-'+mode).addEventListener('click',()=>{
    if(!outdoorMode)return;
    outdoorTool=mode;cameraGesture.clear();clearOutdoorPending();
    outdoorFeedback(mode==='paint'
      ?'Протяни пальцем прямоугольник по свободной земле'
      :'Камера: свайп одним пальцем, масштаб и вращение двумя');
  });
  $('outdoor-ground-kind').addEventListener('change',()=>clearOutdoorPending());
  $('outdoor-category').addEventListener('change',()=>{
    outdoorCategory=$('outdoor-category').value;outdoorYaw=0;
    clearOutdoorPending();syncOutdoorFeatureCatalog();syncOutdoorOwned();
  });
  $('outdoor-feature-kind').addEventListener('change',()=>{
    outdoorYaw=0;clearOutdoorPending();
  });
  $('outdoor-feature-owned').addEventListener('change',()=>{
    const item=game.world.outdoors.features.find(f=>
      f.instanceId===$('outdoor-feature-owned').value);
    outdoorYaw=item?.yaw||0;clearOutdoorPending();
    if($('outdoor-feature-operation').value==='sell')previewOutdoorObject();
  });
  $('outdoor-feature-operation').addEventListener('change',()=>{
    const item=game.world.outdoors.features.find(f=>
      f.instanceId===$('outdoor-feature-owned').value);
    outdoorYaw=item?.yaw||0;clearOutdoorPending();
    if($('outdoor-feature-operation').value==='sell')previewOutdoorObject();
  });
  $('outdoor-feature-rotate').addEventListener('click',()=>{
    outdoorYaw=(outdoorYaw+90)%360;
    const operation=$('outdoor-feature-operation').value;
    if(operation==='move'&&!outdoorPose){
      const item=game.world.outdoors.features.find(f=>
        f.instanceId===$('outdoor-feature-owned').value);
      if(item)outdoorPose={x:item.x,z:item.z,yaw:outdoorYaw};
    }else if(outdoorPose)outdoorPose={...outdoorPose,yaw:outdoorYaw};
    if(outdoorPose)previewOutdoorObject(outdoorPose);
    else outdoorFeedback('Поворот: '+outdoorYaw+'° · выбери землю для размещения');
  });
  $('outdoor-cancel').addEventListener('click',()=>clearOutdoorPending());
  $('outdoor-apply').addEventListener('click',()=>{
    if(!outdoorMode||!outdoorPending?.ok)return;
    const feature=Boolean(outdoorPending.operation);
    const p=feature?previewOutdoorFeatureEdit(game,{
      operation:outdoorPending.operation,itemId:outdoorPending.itemId,
      instanceId:outdoorPending.operation==='place'?undefined:outdoorPending.instanceId,
      pose:outdoorPending.pose
    }):previewOutdoorPaint(game,outdoorPending);
    if(!p.ok){clearOutdoorPending(true);outdoorFeedback(outdoorReason[p.reason]||p.reason,true);return;}
    const result=feature?commitOutdoorFeatureEdit(game,p):commitOutdoorPreview(game,p);
    if(!result.ok){clearOutdoorPending(true);outdoorFeedback(outdoorReason[result.reason]||result.reason,true);return;}
    game.world.outdoors=result.root.world.outdoors;
    game.shop=result.root.shop;game.financialHistory=result.root.financialHistory;
    outdoorTimeline=outdoorTimeline.slice(0,outdoorHistoryIndex+1);
    outdoorTimeline.push(outdoorSnapshot());outdoorHistoryIndex++;
    if(outdoorTimeline.length>50){outdoorTimeline.shift();outdoorHistoryIndex--;}
    renderOutdoorGround();renderOutdoorFeatures();syncOutdoorOwned();updateFamilyBalance();
    for(const id of HOUSEHOLD_IDS)paths[id]={points:null,index:0,id:null};
    save(true);clearOutdoorPending(true);
    outdoorFeedback(feature?(p.operation==='sell'
      ?'Объект продан · зачислено '+(-p.cost)+' кр.'
      :p.operation==='move'?'Объект перенесён бесплатно'
      :'Объект посажен/поставлен · списано '+p.cost+' кр.')
      :'Готово: '+p.changedCells+' клеток · списано '+p.cost+' кр.');
    updateOutdoorPanel();
  });
  // One explicit action confirmation for terrain AND every outdoor item.
  // Opening/closing the popup never changes a sim, their task or saved FIFO.
  let groundWalkOffer=null;
  const groundWalkPanel=$('ground-walk-menu');
  const closeGroundWalkMenu=()=>{
    groundWalkOffer=null;groundWalkPanel.hidden=true;
    $('ground-walk-info').hidden=true;
    $('ground-walk-wish').hidden=true;
    $('ground-walk-progress').hidden=true;
    $('ground-walk-more').replaceChildren();
    $('ground-walk-action').disabled=true;
  };
  const confirmWorldOffer=(offer,command)=>{
    closeGroundWalkMenu();
    if(!offer||!command)return;
    // A sold/replanted plant cannot acquire a stale queued action.
    if(offer.instanceId&&!game.world.outdoors?.features?.some(
      item=>item.instanceId===offer.instanceId))return;
    if(Number.isFinite(offer.plantedAt)&&
      gardenView(game.world.outdoors,offer.instanceId,game.minutes)?.plantedAt!==offer.plantedAt){
      toast('Грядка изменилась — выбери действие заново');return;
    }
    scheduleCommand(command,offer.residentId);
  };
  const offerWorldAction=(point,heading,label,command,instanceId=null,options={})=>{
    groundWalkOffer={residentId:game.selectedSim,command,instanceId,
      plantedAt:options.plantedAt};
    $('ground-walk-title').textContent=heading;
    $('ground-walk-action-label').textContent=label;
    $('ground-walk-recipient').textContent=offerForName(getActorName(game.selectedSim));
    $('ground-walk-info').textContent=options.info||'';
    $('ground-walk-info').hidden=!options.info;
    $('ground-walk-wish').textContent=options.wish||'';
    $('ground-walk-wish').hidden=!options.wish;
    const progress=$('ground-walk-progress');
    progress.hidden=!Number.isFinite(options.progress);
    if(Number.isFinite(options.progress))progress.value=options.progress;
    const more=$('ground-walk-more');more.replaceChildren();
    for(const choice of options.choices||[]){
      const button=document.createElement('button');
      button.type='button';button.className='garden-choice';
      button.dataset.gardenAction=choice.actionId;
      button.disabled=!choice.available;
      const title=document.createElement('span');title.textContent=choice.label;
      const note=document.createElement('small');
      note.textContent=choice.available?'Добавить в очередь':choice.reason;
      button.append(title,note);
      button.addEventListener('click',()=>
        confirmWorldOffer(groundWalkOffer,choice.command));
      more.append(button);
    }
    groundWalkPanel.hidden=false;
    const frame=document.querySelector('.app-shell').getBoundingClientRect();
    const topInset=Math.max(70,Math.ceil(
      $('calendar-anchor-toggle').getBoundingClientRect().bottom-frame.top)+10);
    // HUD floats above bottom navigation (including at 320px / landscape).
    // Reserve the entire band from the actual HUD top to the shell bottom,
    // not just the card height, or the garden sheet clips the HUD.
    const dashboardTop=$('dashboard').getBoundingClientRect().top;
    const bottomInset=Math.max(0,Math.ceil(frame.bottom-dashboardTop))+12;
    const pos=contextualPlacement({anchorX:point.x-frame.left,
      anchorY:point.y-frame.top,viewportWidth:frame.width,viewportHeight:frame.height,
      panelWidth:groundWalkPanel.offsetWidth||290,
      panelHeight:groundWalkPanel.scrollHeight||240,
      topInset,bottomInset,edge:8});
    groundWalkPanel.style.left=pos.x+'px';
    groundWalkPanel.style.top=pos.y+'px';
    groundWalkPanel.style.maxHeight=pos.maxHeight+'px';
    $('ground-walk-action').disabled=options.primaryAvailable===false;
  };
  const openGroundWalkMenu=(point,ground)=>{
    const id=game.selectedSim,actor=getActor(game,id);
    if(residentUnavailableForHome(game,id)){
      closeGroundWalkMenu();toast('Персонаж сейчас не на участке');return;
    }
    const requested={x:Math.round(ground.x*20)/20,z:Math.round(ground.z*20)/20};
    const valid=isWalkable(requested.x,requested.z,game.world)?requested:null;
    const nearest=valid||nearestWalkable(requested,game.world);
    if(!nearest||(!valid&&Math.hypot(nearest.x-requested.x,nearest.z-requested.z)>.35)){
      closeGroundWalkMenu();toast('Здесь нельзя пройти — выбери свободное место');return;
    }
    if(!findPath(actor.position,nearest,game.world)){
      closeGroundWalkMenu();toast('Путь к этой точке недоступен');return;
    }
    offerWorldAction(point,'Действия на земле','↗ Идти сюда',
      {type:'move',x:nearest.x,z:nearest.z});
  };
  const openOutdoorActionMenu=(point,target)=>{
    const feature=game.world.outdoors?.features?.find(
      item=>item.instanceId===target.instanceId);
    const def=feature&&OUTDOOR_CATALOG[feature.itemId];
    const id=game.selectedSim,actor=getActor(game,id);
    if(!feature||!def)return;
    if(residentUnavailableForHome(game,id)){
      toast('Персонаж сейчас не на участке');return;
    }
    if(isGardenItem(feature.itemId)){
      const sheet=gardenActionSheet(game,id,feature.instanceId);
      if(!sheet||!sheet.actions.length)return;
      const first=sheet.actions[0];
      offerWorldAction(point,sheet.name,first.label,first.command,feature.instanceId,{
        info:sheet.info,progress:sheet.progress,wish:sheet.wish,
        plantedAt:sheet.plantedAt,primaryAvailable:first.available,
        choices:sheet.actions.slice(1)
      });
      return;
    }
    if(feature.itemId==='garden.bench'){
      // Revalidation of availability and route happens again on confirmation.
      offerWorldAction(point,def.name,'🪑 Отдохнуть',
        {type:'outdoor',instanceId:feature.instanceId},feature.instanceId);
      return;
    }
    const rect=outdoorFeatureRect(feature),margin=.55;
    const candidates=[
      {x:feature.x,z:rect.minZ-margin},
      {x:feature.x,z:rect.maxZ+margin},
      {x:rect.minX-margin,z:feature.z},
      {x:rect.maxX+margin,z:feature.z}
    ].sort((a,b)=>Math.hypot(a.x-actor.position.x,a.z-actor.position.z)-
      Math.hypot(b.x-actor.position.x,b.z-actor.position.z));
    const spot=candidates.find(p=>isWalkable(p.x,p.z,game.world)&&
      findPath(actor.position,p,game.world));
    if(!spot){toast('К предмету сейчас нельзя подойти');return;}
    offerWorldAction(point,def.name,'↗ Подойти',
      {type:'move',x:spot.x,z:spot.z},feature.instanceId);
  };
  $('ground-walk-action').addEventListener('click',()=>
    confirmWorldOffer(groundWalkOffer,groundWalkOffer?.command));
  canvas.addEventListener('pointerdown',closeGroundWalkMenu);
  $('ground-walk-close').addEventListener('click',closeGroundWalkMenu);
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!groundWalkPanel.hidden){
      event.preventDefault();closeGroundWalkMenu();
    }
  });
  const navigateOutdoorHistory=direction=>{
    if(!outdoorMode||!outdoorTimeline.length)return;
    const target=outdoorHistoryIndex+direction;
    if(target<0||target>=outdoorTimeline.length)return;
    const before=outdoorTimeline[outdoorHistoryIndex],after=outdoorTimeline[target];
    // Only reverse THIS transaction's delta; never restore a historical wallet
    // snapshot that could erase a concurrent salary or invoice.
    if(game.shop.credits!==before.credits){
      outdoorFeedback('Баланс изменился. Повтори операцию после закрытия редактора',true);
      return;
    }
    const delta=after.credits-before.credits;
    const value=game.shop.credits+delta;
    if(!Number.isSafeInteger(value)||value<0||value>1000000000){
      outdoorFeedback('Недостаточно средств для повтора',true);return;
    }
    const revision=game.world.outdoors.revision+1;
    if(revision>100000000){
      outdoorFeedback('Слишком много правок участка',true);return;
    }
    const nextShop={...game.shop,credits:value};
    const finance=recordFinanceChange(game,nextShop,{
      kind:direction<0?'undo':'redo',sourceId:'outdoors-history-'+revision,
      atGameMinute:Math.floor(game.minutes)});
    if(!finance.ok){outdoorFeedback('Ошибка записи финансовой операции',true);return;}
    game.world.outdoors={...after.outdoors,revision};
    game.shop=finance.shop;game.financialHistory=finance.financialHistory;
    outdoorHistoryIndex=target;
    // Snapshot's revision tracks the latest canonical topology for the next
    // undo/redo, while credits and old states remain stable.
    outdoorTimeline[target]={...after,outdoors:JSON.parse(JSON.stringify(game.world.outdoors))};
    renderOutdoorGround();renderOutdoorFeatures();syncOutdoorOwned();updateFamilyBalance();
    for(const id of HOUSEHOLD_IDS)paths[id]={points:null,index:0,id:null};
    save(true);clearOutdoorPending(true);
    outdoorFeedback(direction<0?'Отменено: объект/покрытие и баланс восстановлены':
      'Повторено: объект/покрытие и баланс восстановлены');
    updateOutdoorPanel();
  };
  $('outdoor-undo').addEventListener('click',()=>navigateOutdoorHistory(-1));
  $('outdoor-redo').addEventListener('click',()=>navigateOutdoorHistory(1));
  document.addEventListener('keydown',event=>{
    if(outdoorMode&&event.key==='Escape'){event.preventDefault();exitOutdoor();}
  },true);

  canvas.addEventListener('pointerdown',event=>{
    viewportHealth.markInput(performance.now());
    if(event.pointerType==='mouse'&&event.button!==0)return;
    if(dialogueNeedsDecision(game))return;
    if(event.cancelable)event.preventDefault();
    try{canvas.setPointerCapture?.(event.pointerId);}catch{/* iOS capture may fail */}
    const point=gesturePoint(event),now=performance.now();
    if(buildMode){
      clearBuildPending();
      if(buildDrag){
        const last=buildDrag.last;
        buildDrag=null;buildGhost.enabled=false;cameraGesture.clear();
        if(last&&last.id!==point.id)cameraGesture.begin(last,now);
        cameraGesture.begin(point,now);
        return;
      }
      if(buildTool!=='camera'&&!['roof-auto','roof-clear','wall-height',
        'paint-facade-all'].includes(buildTool)&&
        cameraGesture.count()===0){
        const raw=editorFloorAt(point);
        const pickWall=['move-wall','door','window','arch','change-opening','erase-wall','room-join',
          'remove-opening','paint-wall','sample-finish','paint-facade',
          'porch-add','porch-remove'].includes(buildTool);
        const wallEdge=pickWall?buildWallAtScreen(point):null;
        if(pickWall&&!wallEdge&&buildTool==='move-wall')
          buildFeedback('Коснись нужной стены или передвинь камеру свайпом по пустому участку');
        // Swiping empty background pans even when a wall tool is selected.
        if(raw&&(!pickWall||wallEdge||buildTool==='sample-finish')){
          const from=buildSnap(raw);
          buildDrag={pointerId:event.pointerId,from,to:from,hit:raw,last:point,wallEdge};
          showBuildGhost(from,from);return;
        }
      }
      cameraGesture.begin(point,now);return;
    }
    if(outdoorMode){
      if(outdoorDrag){
        // Second finger cancels paint rather than committing a giant rectangle.
        // Feed both contacts back to the camera for true pinch/orbit.
        const first=outdoorDrag.last;
        clearOutdoorPending(true);cameraGesture.clear();
        if(first&&first.id!==point.id)cameraGesture.begin(first,now);
        cameraGesture.begin(point,now);return;
      }
      if(outdoorTool==='paint'&&cameraGesture.count()===0&&
        (outdoorCategory==='ground'||$('outdoor-feature-operation').value!=='sell')){
        const ground=outdoorSurfaceAtScreen(point);
        if(ground?.kind==='yard'){
          outdoorPending=null;
          outdoorDrag={pointerId:event.pointerId,from:ground,to:ground,last:point};
          if(outdoorCategory==='ground')paintGhostFrom(ground,ground);
          else{
            outdoorPose={x:outdoorSnap(ground.x),z:outdoorSnap(ground.z),yaw:outdoorYaw};
            showOutdoorFeatureGhost(outdoorPose);
          }
          outdoorFeedback(outdoorCategory==='ground'
            ?'Выдели прямоугольник · после отпускания покажу цену'
            :'Выбери место · после отпускания проверю проходы');
          updateOutdoorPanel();
          return;
        }
      }
      cameraGesture.begin(point,now);return;
    }
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
    if(furnishMode&&ownedPlacement)ownedSwipeRawPose=null;
    cameraGesture.begin(point,now);
    armFurnitureHold(event,now);
  });
  // Track user input even when an editor consumes the pointer event before
  // it reaches cameraGesture (otherwise a frozen camera looks like no input).
  window.addEventListener('pointermove',()=>viewportHealth.markInput(performance.now()),true);
  // Global listeners survive canvas leaving the viewport on iOS Safari.
  // Separate capture listener preserves the furniture VM touch contract.
  window.addEventListener('pointermove',event=>{
    if(!outdoorMode||outdoorDrag?.pointerId!==event.pointerId)return;
    if(event.cancelable)event.preventDefault();
    const hit=outdoorSurfaceAtScreen(gesturePoint(event));
    outdoorDrag.last=gesturePoint(event);
    if(hit?.kind==='yard'){
      outdoorDrag.to=hit;
      if(outdoorCategory==='ground')paintGhostFrom(outdoorDrag.from,outdoorDrag.to);
      else{
        outdoorPose={x:outdoorSnap(hit.x),z:outdoorSnap(hit.z),yaw:outdoorYaw};
        showOutdoorFeatureGhost(outdoorPose);
      }
    }
    event.stopImmediatePropagation?.();
  },true);
  window.addEventListener('pointermove',event=>{
    if(!buildMode||buildDrag?.pointerId!==event.pointerId)return;
    if(event.cancelable)event.preventDefault();
    const raw=editorFloorAt(gesturePoint(event));
    buildDrag.last=gesturePoint(event);
    if(raw){
      const next=buildSnap(raw);
      if(next.x!==buildDrag.to.x||next.z!==buildDrag.to.z){
        buildDrag.to=next;showBuildGhost(buildDrag.from,next);
      }
    }
    event.stopImmediatePropagation?.();
  },true);
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
      canvas.clientHeight,{oneFinger:furnishMode&&ownedPlacement
        ?'placement':furnishMode&&shopPlacing&&oneFingerMode==='pan'
          ?'placement':oneFingerMode});
    if(result.placementDelta&&furnishMode&&shopPlacing&&shopPose){
      if(event.cancelable)event.preventDefault();
      const {dx,dy}=result.placementDelta;
      // Accumulate sub-grid deltas: slow swipes must not get swallowed by snap.
      shopSwipeRawPose=dragShopPlacement(view,shopSwipeRawPose||shopPose,
        dx,dy,canvas.clientHeight,'lot');
      if(shopSwipeRawPose){
        const pose={x:snapFurnitureCoordinate(shopSwipeRawPose.x),
          z:snapFurnitureCoordinate(shopSwipeRawPose.z),yaw:shopPose.yaw};
        if(pose.x!==shopPose.x||pose.z!==shopPose.z){
          shopPose=pose;shopManualPose=true;renderMarket();
        }
      }
    }
    if(result.placementDelta&&furnishMode&&ownedPlacement){
      if(event.cancelable)event.preventDefault();
      const {dx,dy}=result.placementDelta;
      ownedSwipeRawPose=dragShopPlacement(view,ownedSwipeRawPose||ownedPlacement.pose,
        dx,dy,canvas.clientHeight,'lot');
      if(ownedSwipeRawPose){
        const pose={x:snapFurnitureCoordinate(ownedSwipeRawPose.x),
          z:snapFurnitureCoordinate(ownedSwipeRawPose.z),
          yaw:ownedPlacement.pose.yaw};
        if(pose.x!==ownedPlacement.pose.x||pose.z!==ownedPlacement.pose.z){
          ownedPlacement.pose=pose;renderOwnedPlacement();
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
    const blockers=game.world.furniture.instances
      .filter(i=>i.prefabId==='table'&&i.location==='home')
      .map(table=>{
        const r=instanceRect(table,FURNITURE_CATALOG.table.footprint);
        return {kind:'blocker',id:'coffee-table',bounds:{
          min:{x:r.minX,y:.28,z:r.minZ},max:{x:r.maxX,y:.48,z:r.maxZ}
        }};
      });
    const movedVolumes=hitVolumes.map(volume=>{
      if(!volume.fixtureType)return volume;
      const originalId=LEGACY_FURNITURE_IDS[volume.fixtureType];
      const present=game.world.furniture.instances.some(item=>
        item.instanceId===originalId&&item.location==='home');
      if(!present)return null; // Sold/stored starter cannot intercept taps.
      const bounds=furnitureBounds(game.world,volume.fixtureType,
        volume.bounds,originalId);
      return bounds?{...volume,bounds}:null;
    }).filter(Boolean).concat(game.world.furniture.instances
      .filter(item=>item.location==='home'&&
        Object.values(UTILITY_FURNITURE).some(p=>p.prefabId===item.prefabId))
      .map(item=>{
        const p=FURNITURE_CATALOG[item.prefabId];
        const rect=instanceRect(item,p.footprint);
        return {kind:'object',id:p.actionId,instanceId:item.instanceId,
          bounds:{min:{x:rect.minX,y:.04,z:rect.minZ},
            max:{x:rect.maxX,y:item.prefabId==='wardrobe'?2.52:
              item.prefabId==='dresser'?1.17:item.prefabId==='mirror'?2.15:1.94,
              z:rect.maxZ}}};
      }));
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
    const diningTables=game.world.furniture.instances
      .filter(item=>item.prefabId==='diningtable'&&item.location==='home')
      .map(item=>{
        const r=instanceRect(item,FURNITURE_CATALOG.diningtable.footprint);
        return {kind:'object',id:'dining',instanceId:item.instanceId,
          bounds:{min:{x:r.minX,y:0,z:r.minZ},max:{x:r.maxX,y:1.08,z:r.maxZ}}};
      });
    // F4D bought chairs are real ray targets: one tappable action per instance.
    const chairSeats=game.world.furniture.instances
      .filter(item=>['chair','armchair'].includes(item.prefabId)&&item.location==='home')
      .map(item=>{
        const r=instanceRect(item,FURNITURE_CATALOG[item.prefabId].footprint);
        return {kind:'object',id:'seat',instanceId:item.instanceId,
          bounds:{min:{x:r.minX,y:0,z:r.minZ},
            max:{x:r.maxX,y:item.prefabId==='armchair'?1.7:1.6,z:r.maxZ}}};
      });
    const musicStations=game.world.furniture.instances
      .filter(item=>item.prefabId==='music'&&item.location==='home')
      .map(item=>{
        const r=instanceRect(item,FURNITURE_CATALOG.music.footprint);
        return {kind:'object',id:'music',instanceId:item.instanceId,
          bounds:{min:{x:r.minX,y:0,z:r.minZ},
            max:{x:r.maxX,y:1.3,z:r.maxZ}}};
      });
    const finishedArt=allArtwork().map((work,index)=>{
      const source=game.world.furniture.instances.find(i=>i.instanceId===work.easelInstanceId);
      const origin=work.origin||(source?{x:source.x,z:source.z,yaw:source.yaw}:null);
      const pos=artworkDisplayPose(work,index,origin,game.world.construction);
      if(!pos)return null;
      return {kind:'artwork',id:work.id,work,
        bounds:pos.wall
          ?{min:{x:pos.x-.38,y:pos.y-.44,z:pos.z-.13},
            max:{x:pos.x+.38,y:pos.y+.44,z:pos.z+.13}}
          :{min:{x:pos.x-.39,y:.25,z:pos.z-.39},
            max:{x:pos.x+.39,y:1.23,z:pos.z+.39}}};
    }).filter(Boolean);
    const kitchenAppliances=game.world.furniture.instances
      .filter(item=>['stove','prep','sink'].includes(item.prefabId)&&item.location==='home')
      .map(item=>{
        const r=instanceRect(item,FURNITURE_CATALOG[item.prefabId].footprint);
        return {kind:'object',id:FURNITURE_CATALOG[item.prefabId].actionId,
          instanceId:item.instanceId,bounds:{min:{x:r.minX,y:0,z:r.minZ},
            max:{x:r.maxX,y:1.66,z:r.maxZ}}};
      });
    // Every purchased outdoor item has a real 3D pick volume. Decorative
    // items offer a queued walk nearby; the bench offers queued rest.
    const outdoorTargets=(game.world.outdoors?.features||[])
      .map(item=>{
        const rect=outdoorFeatureRect(item),def=OUTDOOR_CATALOG[item.itemId];
        if(!rect||!def)return null;
        const height=def.category==='tree'?3.10:
          def.category==='light'?(item.itemId==='light.standing'?3.05:1.85):
          def.category==='shrub'?1.12:
          def.category==='flower'?.48:
          def.category==='fence'?1.12:
          // Preserve C1's garden hit-volume while polishing its visual stages.
          item.itemId==='garden.bench'?1.20:1.24;
        return {kind:'outdoor',id:item.itemId,instanceId:item.instanceId,
          bounds:{min:{x:rect.minX,y:-.49,z:rect.minZ},
            max:{x:rect.maxX,y:height-.53,z:rect.maxZ}}};
      }).filter(Boolean);
    const easels=game.world.furniture.instances
      .filter(item=>item.prefabId==='easel'&&item.location==='home')
      .map(item=>{
        const r=instanceRect(item,FURNITURE_CATALOG.easel.footprint);
        return {kind:'object',id:'paint',instanceId:item.instanceId,
          bounds:{min:{x:r.minX,y:0,z:r.minZ},max:{x:r.maxX,y:2.02,z:r.maxZ}}};
      });
    return pickWorldRayTarget(near,far,
      [...residents,...finishedArt,...sofaCopies,...bedCopies,...tvCopies,...bookshelves,...diningTables,...chairSeats,...musicStations,...kitchenAppliances,...easels,...outdoorTargets,...movedVolumes,...blockers]);
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
    viewportHealth.markInput(performance.now());
    if(outdoorMode){
      if(outdoorDrag?.pointerId===event.pointerId){
        const drag=outdoorDrag;outdoorDrag=null;
        if(outdoorCategory==='ground')
          previewOutdoorSelection(drag.from,drag.to,$('outdoor-ground-kind').value);
        else previewOutdoorObject(outdoorPose);
      }else cameraGesture.end(gesturePoint(event),performance.now());
      return; // Editor touch never creates a free-walk command.
    }
    if(buildMode&&endBuildDrag(event))return;
    if(buildMode){cameraGesture.end(gesturePoint(event),performance.now());return;}
    if(furnishMode&&endEditorDrag(event))return;
    if(furnishMode&&holdGesture.pointerId===event.pointerId)
      cancelPendingGrab();
    const pos=cameraGesture.end(gesturePoint(event),performance.now());
    shopSwipeRawPose=null; // next gesture starts from last snapped object pose
    ownedSwipeRawPose=null;
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
      if(ownedPlacement){
        const floor=editorFloorAt(pos);
        if(floor){
          ownedPlacement.pose={x:snapFurnitureCoordinate(floor.x),
            z:snapFurnitureCoordinate(floor.z),yaw:ownedPlacement.pose.yaw};
          renderOwnedPlacement();
        }else editorFeedback('Коснись пола или нажми «Найти место»',true);
        return;
      }
      if(warehouseOpen)setEditorView('edit');
      chooseFurniture(editorFurnitureAt(pos));return;
    }
    closeGroundWalkMenu();
    const target=worldTargetAt(pos);
    if(target)confirmWorldTap(pos);
    if(target?.kind==='resident')openSocialContext(pos);
    else if(target?.kind==='artwork'){
      closeSocialContext();select(null);
      game.selectedSim=target.work.ownerId;
      $('mind-panel').hidden=false;
      $('mind-toggle').setAttribute('aria-expanded','true');
      setMindTab('skills');
      toast('Картина · открыть инвентарь, повесить или продать во вкладке «Навыки»');
    }
    else if(target?.kind==='object')select(target.id,target.instanceId);
    else if(target?.kind==='outdoor'){
      closeSocialContext();select(null);
      openOutdoorActionMenu(pos,target);
    }
    else{
      closeSocialContext();select(null);
      const {near,far}=furnitureRay(pos);
      const ground=lotRaySurface(near,far,game.world);
      if(!ground)return; // Sky / off-lot: do not manufacture movement.
      openGroundWalkMenu(pos,ground);
    }
  };
  window.addEventListener('pointerup',endPointer);
  window.addEventListener('pointercancel',event=>{
    viewportHealth.markInput(performance.now());
    closeGroundWalkMenu();
    if(outdoorDrag?.pointerId===event.pointerId)clearOutdoorPending(true);
    if(buildDrag?.pointerId===event.pointerId){buildDrag=null;buildGhost.enabled=false;}
    if(holdGesture.pointerId===event.pointerId)cancelPendingGrab();
    if(editDrag?.pointerId===event.pointerId){
      cancelEditorDrag();holdGesture.cancel();
    }
    cameraGesture.end(gesturePoint(event),performance.now(),{cancel:true});
    shopSwipeRawPose=null;
    if(ownedPlacement)cancelOwnedPlacement(false);
  });
  window.addEventListener('blur',()=>{
    cancelPendingGrab();viewportHealth.markInput(performance.now());closeGroundWalkMenu();
    if(outdoorMode)clearOutdoorPending(true);
    buildDrag=null;buildGhost.enabled=false;cancelEditorDrag();cameraGesture.clear();shopSwipeRawPose=null;
    if(ownedPlacement)cancelOwnedPlacement(false);
  });
  // Safari may suspend a background tab without a matching pointerup/blur.
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden)viewportHealth.resume(performance.now());
    if(document.hidden){
      closeGroundWalkMenu();
      if(outdoorMode)clearOutdoorPending(true);
      buildDrag=null;buildGhost.enabled=false;
      cancelPendingGrab();cancelEditorDrag();cameraGesture.clear();shopSwipeRawPose=null;
      if(ownedPlacement)cancelOwnedPlacement(false);
    }
  });
  canvas.addEventListener('lostpointercapture',event=>{
    if(buildDrag?.pointerId===event.pointerId){buildDrag=null;buildGhost.enabled=false;}
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
    viewportHealth.markUpdate(performance.now());
    dt=Math.min(dt,.06);
    // Cosmetic 0.3s phone raise/reveal; never affects animation controller or clock.
    for(const [id,phone] of Object.entries(phoneMeshes))if(phone.enabled&&phoneReveal[id]<1){
      phoneReveal[id]=Math.min(1,phoneReveal[id]+dt*3.8);
      const eased=1-Math.pow(1-phoneReveal[id],3);
      phone.setLocalScale(eased,eased,eased);
    }
    // Reset / reload may replace construction object; rebuild only when identity changes.
    syncConstructionRender();
    // Visual auto-opening is deliberately non-physical: doorway clearance is
    // controlled only by ConstructionWorld, so pause/reload cannot trap a sim.
    for(const door of automaticDoors){
      const nearby=!buildMode&&HOUSEHOLD_IDS.some(id=>{
        if(residentAwayAtWork(game,id))return false;
        const pos=getActor(game,id).position;
        return Math.hypot(pos.x-door.x,pos.z-door.z)<1.72;
      });
      door.rotation+=(Number(nearby)-door.rotation)*Math.min(1,dt*5.5);
      door.pivot.setLocalEulerAngles(0,door.sign*76*door.rotation,0);
    }
    // Mandatory dialogue decisions freeze clock/needs/autonomy/animation
    // without altering the player's saved manual pause preference.
    shiftSummary.flush();
    const active=!game.paused&&!furnishMode&&!dialogueNeedsDecision(game)&&
      !careerPhone.interviewNeedsDecision()&&!shiftSummary.isOpen()&&!document.hidden;
    const frameActive=active&&!buildMode&&!outdoorMode;
    const sharedSound=frameActive&&game.socialAction?.phase==='using'&&
      livePairedHobby(game)?.choiceId==='music'?'music.calm':null;
    musicAudio.update(audibleMusicStyle([game,game.otherSim],{
      paused:!frameActive,hidden:document.hidden,editing:furnishMode||buildMode||outdoorMode})||sharedSound);
    const animDt=active?dt:0;
    const frameAnimDt=buildMode||outdoorMode?0:animDt;
    if(frameActive){
      accumulator+=dt;
      // Fixed timestep: simulation speed cannot depend on rendering FPS.
      while(accumulator>=.10){
        const prevAlex=game.action?.id,prevMira=game.otherSim.action?.id;
        const prevAlexGardenEvent=game.event,prevMiraGardenEvent=game.otherSim.event;
        const prevAlexLabel=game.action?.activityId
          ?getActivityDefinition(HOBBY_ACTIVITIES,game.action.activityId)?.label:null;
        const prevMiraLabel=game.otherSim.action?.activityId
          ?getActivityDefinition(HOBBY_ACTIVITIES,game.otherSim.action.activityId)?.label:null;
        const sharedBefore=game.socialAction?.shared?game.socialAction.initiator:null;
        const branchBefore=game.socialAction?.branchAction?.id||null;
        const socialBefore=game.socialAction?.conversation||
          game.socialAction?.shared||game.socialAction?.branchAction
          ?null:game.socialAction?.kind;
        const priorCalendarMinute=game.minutes;
        const priorHerbStock=game.kitchen?.pantry?.herbs??0;
        const priorGardenCredits=game.shop.credits;
        const careerEvents=tickHousehold(game,.30 * effectiveSleepSpeed(game,{
          blocked:!frameActive||dialogueNeedsDecision(game)||careerPhone.interviewNeedsDecision()||
            shiftSummary.isOpen()
        }))||[];
        if(gardenStageSignature!==currentGardenStageSignature())
          renderOutdoorFeatures();
        // Crop + replant wallet, plot watermark and pantry must persist together
        // immediately after actual physical completion (same rule as salary).
        if(priorHerbStock!==(game.kitchen?.pantry?.herbs??0)||
          ((prevAlex==='garden'||prevMira==='garden')&&
            priorGardenCredits!==game.shop.credits)){
          save(true);updateFamilyBalance();
        }
        // Persistent shift state, credited money and receipts must share one
        // localStorage snapshot; never wait for the eight-second autosave.
        if(careerEvents.length){
          save(true);updateFamilyBalance();
          updateCareerHud();refreshIncidentNotifications();
          careerPhone.refresh();
          shiftSummary.enqueue(careerEvents);
          const incidentEvent=careerEvents.find(entry=>
            entry.type==='incident'&&pendingWorkIncident(game,entry.residentId));
          if(incidentEvent)
            toast('💼 '+incidentEvent.text,{incidentResidentId:incidentEvent.residentId});
          else {
            const otherEvents=careerEvents.filter(entry=>entry.type!=='salary'&&entry.type!=='missed');
            if(otherEvents.length===1)
              toast((otherEvents[0].type?.startsWith('bill')?'🧾 ':'💼 ')+otherEvents[0].text);
            else if(otherEvents.length)toast('💼 '+otherEvents.map(entry=>entry.text).join(' · '));
          }
        }
        const dueReminders=consumeCalendarReminders(game.calendar,priorCalendarMinute,game.minutes);
        if(dueReminders.messages.length){
          game.calendar=dueReminders.calendar;save(true);
          const due=dueReminders.messages;
          if(due.length===1)
            toast('📅 '+due[0].title+' · '+(due[0].offset===0?'сейчас':'напоминание'));
          else
            toast('📅 '+due.length+' напоминания: '+due.slice(0,2).map(item=>item.title).join(' · ')+
              (due.length>2?' · ещё '+(due.length-2):''));
        }
        // Garden completion feedback uses canonical settlement receipt, never a tap or cancellation.
        for(const [id,previous,oldEvent] of [
          ['alex',prevAlex,prevAlexGardenEvent],['mira',prevMira,prevMiraGardenEvent]]){
          const actor=getActor(game,id);
          if(previous==='garden'&&actor.action?.id!=='garden'&&actor.event!==oldEvent&&
            /^(Полил|Осмотрел|Полюбовался)/.test(actor.event))
            toast(getActorName(id)+': '+actor.event);
        }
        // A completed job frees its own resident; planned commands start only
        // after both participant states and render transition guards allow it.
        dispatchPlannedActions();
        if(prevAlex && prevAlex!=='garden' && !game.action) toast('Алекс закончил: '+(prevAlexLabel||ACTIONS[prevAlex]?.label||'прогулку').toLowerCase());
        if(prevMira && prevMira!=='garden' && !game.otherSim.action) toast('Мира закончила: '+(prevMiraLabel||ACTIONS[prevMira]?.label||'прогулку').toLowerCase());
        if(socialBefore && !game.socialAction)toast(socialBefore==='talk'?'Жители поговорили ♡':'Жители поспорили ⚡');
      if(sharedBefore&&!game.socialAction)
        toast(getActor(game,sharedBefore).event);
      if(branchBefore&&!game.socialAction)
        toast('Завершено: '+BRANCH_ACTIONS[branchBefore].label);
        accumulator-=.10;
        if(shiftSummary.isOpen()){accumulator=0;break;}
      }
      // On cancellation, finish closing before the former fridge user departs.
      for(const residentId of HOUSEHOLD_IDS){
        const a=getActor(game,residentId);
        const stillUsing=(a.action?.id==='fridge'||
      (a.action?.id==='dining'&&a.action.diningStage==='taking'))&&
      a.action.phase==='using';
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
        // Career travel uses the SAME pathfinder and same walking animation
        // as household actions. No imaginary second scene or game timer.
        const work=game.careerSystem?.byResident?.[residentId]?.currentShift;
        if(work?.phase==='returning'){
          resident.position=nearestWalkable({x:-.65,z:3.45},game.world);
          finishCareerReturn(game,residentId);
          paths[residentId]={points:null,index:0,id:null};
          restartAutonomyWait(residentId);
          save(true);updateCareerHud();
          toast(getActorName(residentId)+' вернулся домой');
          continue;
        }
        if(work?.phase==='departing'){
          const goal=nearestWalkable({x:-.65,z:3.45},game.world);
          const routeId='career-exit:'+work.id;
          let route=paths[residentId];
          if(route.id!==routeId||!route.points){
            const points=findPath(resident.position,goal,game.world);
            route=paths[residentId]={points:points||[],index:0,id:routeId};
          }
          let remaining=dt*1.65*game.speed,hops=0;
          while(route.index<route.points.length&&remaining>0&&hops++<12){
            const next=route.points[route.index];
            const dx=next.x-resident.position.x,dz=next.z-resident.position.z;
            const distance=Math.hypot(dx,dz);
            if(distance<.0001){route.index++;continue;}
            const heading=Math.atan2(dx,dz)*180/Math.PI;
            if(residentId==='alex')facing=heading;else miraFacing=heading;
            const step=Math.min(distance,remaining);
            resident.position.x+=dx/distance*step;
            resident.position.z+=dz/distance*step;
            remaining-=step;
            if(distance-step<.0001){resident.position={...next};route.index++;}
          }
          if(route.index>=route.points.length){
            const fallback=route.points.length===0;
            if(arriveCareerPortal(game,residentId,game.minutes)){
              paths[residentId]={points:null,index:0,id:null};
              save(true);updateCareerHud();
              toast(getActorName(residentId)+(fallback?' отправился на работу (путь недоступен)':
                ' вышел через вход и отправился на работу'));
            }
          }
          continue;
        }
        if(work?.phase==='working')continue;
        const socialWalking=Boolean(socialWalkingFor(residentId));
        const pairedPlan=socialWalking
          ?game.socialAction?.shared?.tvPlan||game.socialAction?.shared?.pairPlan:null;
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
          resident.action?.phase==='walking'
            ?(resident.action.id==='hobby'?readingRouteId(resident.action):resident.action.id)
            :null;
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
              if(!socialWalking&&resident.action?.id==='move'){
                resident.action=null;resident.event='Пришёл в выбранное место';
                paths[residentId]={points:null,index:0,id:null};
                restartAutonomyWait(residentId);save(true);continue;
              }
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
              }else if(resident.action?.id==='hobby'&&
                readingRouteId(resident.action))arriveReadingJourney(resident.action);
              else if(resident.action?.id==='cook'){
                if(resident.action.cookStage==='toFridge'){
                  arrive(resident);resident.action.cookStage='taking';
                }else if(resident.action.cookStage==='toPrep'){
                  arrive(resident);resident.action.cookStage='preparing';
                }else if(resident.action.cookStage==='toStove'){
                  arrive(resident);resident.action.cookStage='cooking';
                }else if(resident.action.cookStage==='toFridgeStore'){
                  arrive(resident);resident.action.cookStage='storing';
                }
              }else if(resident.action?.id==='dining'){
                if(resident.action.diningStage==='toFridge'){
                  arrive(resident);resident.action.diningStage='taking';
                }else if(resident.action.diningStage==='toSeat'){
                  arrive(resident);resident.action.diningStage='eating';
                }
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
      const pairedWaiting=game.socialAction?.phase==='walking'
        ?game.socialAction.shared?.tvPlan||game.socialAction.shared?.pairPlan:null;
      if(pairedWaiting&&HOUSEHOLD_IDS.every(id=>{
        const pos=getActor(game,id).position,goal=pairedWaiting.places[id];
        return Math.hypot(pos.x-goal.x,pos.z-goal.z)<.075&&
          sofaStates[id].progress===0&&bedStates[id].progress===0&&
          !showerStates[id].active&&!toiletStates[id].active&&!fridgeLeaving[id];
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
          // Like a real household: when hungry, prefer an already cooked
          // portion over producing a new snack. The same table/chair A* applies.
          const ready=idea==='fridge'?preparedKitchenMeals(game.kitchen):[];
          const table=ready.length?nearestAvailableDiningTable(game,residentId):null;
          if(table&&beginAction('dining',true,residentId,false,table.instanceId,
              null,null,null,ready[0].recipeId)){
            toast(getActorName(residentId)+' берёт готовое: '+ready[0].label);
          }else if(idea && beginAction(idea,true,residentId))
            toast(getActorName(residentId)+' самостоятельно решил(а): '+ACTIONS[idea].label.toLowerCase());
          else if(!idea&&!socialIdea){
            // LOT-C2a: lowest-priority optional gardening, never a manual FIFO task.
            // The existing idle delay, social/need selection and work guards run first.
            const gardenIdea=residentGardenOpportunity(game,residentId);
            if(gardenIdea&&beginGardenAction(residentId,gardenIdea.instanceId,'water',false,true))
              save(true);
          }
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
    const pairedTv=liveSharedTv(game),pairedHobby=livePairedHobby(game);
    const pairedBooks=pairedHobby?.choiceId==='books';
    const pairedMusic=pairedHobby?.choiceId==='music';
    const using=game.action?.phase==='using',
      useId=using?(game.action.id==='dining'&&game.action.diningStage==='taking'
        ?'fridge':game.action.id==='cook'&&['taking','storing'].includes(game.action.cookStage)
          ?'fridge':game.action.id==='cook'&&game.action.cookStage==='preparing'
            ?'prep':game.action.id):pairedTv?'tv':pairedBooks?'hobby':pairedMusic?'music':null;
    const alexDining=useId==='dining'&&game.action?.diningStage==='eating';
    const alexDiningVisual=alexDining?diningVisualFor('alex',game.action):diningVisual.alex;
    const alexFridge=useId==='fridge'?fridgeSequence(game.action.elapsed,
      game.action?.id==='dining'?6:game.action?.id==='cook'&&game.action.cookStage==='storing'
        ?6:game.action?.id==='cook'?5:ACTIONS.fridge.duration):null;
    showerStates.alex=advanceShowerTransition(showerStates.alex,useId==='shower',
      game.action?.elapsed||0,ACTIONS.shower.duration,frameAnimDt,
      inverseFurniturePose(game.world,'shower',display).yaw);
    const alexShower=showerStates.alex.frame?{...showerStates.alex.frame,
      pose:furniturePose(game.world,'shower',showerStates.alex.frame.pose)}:null;
    toiletStates.alex=advanceToiletTransition(toiletStates.alex,useId==='toilet',
      game.action?.elapsed||0,ACTIONS.toilet.duration,frameAnimDt,
      inverseFurniturePose(game.world,'toilet',display).yaw);
    const alexToilet=toiletStates.alex.frame?{...toiletStates.alex.frame,
      pose:furniturePose(game.world,'toilet',toiletStates.alex.frame.pose)}:null;
    const alexReadingStage=readingStage(game.action);
    const alexReadingSeated=readingIsSeated(game.action);
    const walking=frameActive&&((game.action?.phase==='walking'&&
      (game.action.id!=='hobby'||Boolean(readingRouteId(game.action))))||
      socialWalkingFor('alex')||residentWorkPhase(game,'alex')==='departing');
    const alexWatchSeat=useId==='tv'
      ?(pairedTv?.places?.alex?.seatId||game.action?.watchSeatInstanceId):null;
    const alexDateSofa=romanticSofa.active;
    if(alexDateSofa){
      sofaVisualTargets.alex=romanticSofa.sofaId;
      romanticSofaSlots.alex=sofaDateFor('alex');
    }else if(useId==='sofa'||useId==='seat'||alexWatchSeat||alexReadingSeated||alexDining)
      sofaVisualTargets.alex=alexDining?game.action.diningSeatInstanceId:
        alexReadingSeated?game.action.readingSeatInstanceId:
        (alexWatchSeat||game.action?.targetInstanceId)||null;
    if(useId==='bench'&&game.action?.phase==='using')
      benchVisualTargets.alex=game.action.targetInstanceId;
    sofaStates.alex=advanceSofaTransition(sofaStates.alex,
      (useId==='sofa'||useId==='seat'||useId==='bench'||Boolean(alexWatchSeat)||alexDateSofa||alexReadingSeated||alexDining)&&
        bedStates.alex.progress===0&&!showerStates.alex.active,
      alexReadingStage?frameAnimDt*game.speed:frameAnimDt);
    const alexSeatBase=sofaTransitionPose(sofaStates.alex);
    const gardenSeatPose=benchVisualTargets.alex&&sofaStates.alex.progress>0
      ?outdoorBenchPose(game.world,benchVisualTargets.alex,sofaStates.alex.progress):null;
    if(!gardenSeatPose&&useId!=='bench')benchVisualTargets.alex=null;
    const seatPose=gardenSeatPose||(purchasedSeatPrefab(game.world,sofaVisualTargets.alex)
      ?(alexDiningVisual&&alexDiningVisual.chairId===sofaVisualTargets.alex
        ?purchasedDiningSeatPose(game.world,sofaVisualTargets.alex,alexSeatBase,
          sofaStates.alex.progress,alexDiningVisual.side,alexDiningVisual.maxPull)
        :purchasedSeatPose(game.world,sofaVisualTargets.alex,alexSeatBase))
      :furniturePose(game.world,'sofa',
        romanticSofaSlots.alex===null?alexSeatBase:
          {...alexSeatBase,x:alexSeatBase.x+romanticSofaSlotOffset(romanticSofaSlots.alex)},
        sofaVisualTargets.alex))||
      {...display,sofaWeight:0};
    const seating=useId==='sofa'||useId==='seat'||useId==='bench'||Boolean(alexWatchSeat)||alexReadingSeated||alexDining||
      sofaStates.alex.progress>0||alexDateSofa;
    if(!seating){sofaVisualTargets.alex=null;romanticSofaSlots.alex=null;diningVisual.alex=null;}
    if(alexSeatInstanceId!==sofaVisualTargets.alex||
      alexSeatSlot!==romanticSofaSlots.alex){
      alexSeatInstanceId=sofaVisualTargets.alex;
      alexSeatSlot=romanticSofaSlots.alex;
      refreshSofaSeat();
    }
    if(useId==='bed')bedVisualTargets.alex=game.action?.targetInstanceId??'home-bed-1';
    bedStates.alex=advanceBedTransition(bedStates.alex,
      useId==='bed'&&sofaStates.alex.progress===0&&!showerStates.alex.active,
      game.action?.bedSlot,frameAnimDt,
      inverseFurniturePose(game.world,'bed',display,bedVisualTargets.alex));
    const bedPose=bedStates.alex.progress>0
      ?furniturePose(game.world,'bed',bedTransitionPose(bedStates.alex),bedVisualTargets.alex):null;
    if(bedStates.alex.progress===0)bedVisualTargets.alex=null;
    const bedding=Boolean(bedPose);
    const pairedTvStand=pairedTv&&!alexWatchSeat
      ?{...pairedTv.places.alex,y:0,pitch:0,
        yaw:furniturePose(game.world,'tv',TV_WATCH_POSE,pairedTv.tvId)?.yaw||0}:null;
    const pose=pairedTvStand||(useId&&!pairedHobby&&!seating&&useId!=='sofa'&&useId!=='bed'&&useId!=='shower'&&useId!=='toilet'
      ?(useId==='paint'
        ?easelPaintingPose(game.world,game.action?.targetInstanceId,game.position)
        :furniturePose(game.world,useId==='lamp'?'floorlamp':
          useId==='cook'?'stove':useId==='wash'?'sink':useId,
          ACTOR_POSES[useId],game.action?.id==='dining'||
            (game.action?.id==='cook'&&useId==='fridge')?null:
            (game.action?.id==='cook'&&useId==='prep')
              ?game.action.prepInstanceId:game.action?.targetInstanceId)):null);
    const previousAlexXZ={x:display.x,z:display.z};
    const desired=alexToilet?alexToilet.pose:alexShower?alexShower.pose:bedding?bedPose:seating?seatPose:{
      x:pose?pose.x:pairTargets?.a.x??game.position.x,
      y:pose?pose.y:animationStates.alex.walkBob+lotActorHeight(game.world,game.position),
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
      display.x=approach(display.x,desired.x,seating||pose?10:11,frameAnimDt);
      display.y=approach(display.y,desired.y,seating||pose?10:10,frameAnimDt);
      display.z=approach(display.z,desired.z,seating||pose?10:11,frameAnimDt);
      display.pitch=approach(display.pitch,desired.pitch,3.8,frameAnimDt);
      display.yaw=approachAngle(display.yaw,desired.yaw,10,frameAnimDt);
      display.roll=approach(display.roll,0,12,frameAnimDt);
    }
    // Drive the stride from the ACTUAL onscreen movement, after x/z easing.
    // At tight A* bends the visible motion direction leads the character;
    // neither turning the camera nor a pause advances the gait clock.
    const alexMotion=advanceVisualGait(gait,previousAlexXZ,display,
      walking&&!seating&&!bedding&&!pose&&!alexShower&&!alexToilet);
    gait=alexMotion.phase;
    if(alexMotion.heading!==null)
      display.yaw=approachAngle(display.yaw,alexMotion.heading,13,frameAnimDt);
    avatar.setPosition(display.x,display.y,display.z);
    avatar.setEulerAngles(display.pitch,display.yaw,display.roll);
    if(frameActive)effectTime+=dt*game.speed;
    animationStates.alex=stepAnimation(animationStates.alex,{
      id:'alex',walking:(walking||Boolean(alexShower?.stepWeight>.015))&&!seating&&!bedding,
      using:alexToilet?'toilet':alexShower?'shower':useId,
      musicActivityId:pairedMusic?MUSIC_ACTIVITY_ID:
        game.action?.id==='music'?game.action.activityId:null,
      musicStyleId:pairedMusic?'music.calm':
        game.action?.id==='music'?game.action.contentId:null,
      musicElapsed:pairedMusic?game.socialAction.elapsed:
        game.action?.id==='music'?game.action.elapsed:null,
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
      social:socialUsing&&!pairedTv&&!pairedHobby&&!hugFrame.active&&!kissFrame.active?game.socialAction.kind:null,
      eveningWeight:eveningFrame.gestureWeight,
      hugWeight:hugFrame.weight,
      kissWeight:kissFrame.weight,
      fridgeReach:alexFridge?.reach||0,fridgeEat:alexFridge?.eat||0,
      fridgeChew:alexFridge?.chew||0,
      gait:alexShower?alexShower.gaitMeters*WALK_PHASE_PER_METER:gait,
      mood:game.mind?.mood?.value,energy:game.needs.energy
    },frameAnimDt);
    // Contact gait is phase-accurate only when the root dip is applied in
    // the SAME frame as its ankle joints; the old display spring lagged one.
    // Never override the directly controlled bed/sofa/shower interaction root.
    if(!alexShower&&!alexToilet&&!bedding&&!seating&&!pose&&!socialUsing){
      display.y=approach(display.y,animationStates.alex.walkBob+
        lotActorHeight(game.world,game.position),10,frameAnimDt);
      avatar.setPosition(display.x,display.y,display.z);
    }
    applyCharacterAnimation(alexRig,animationStates.alex);
    applyShowerAppearance(alexRig,Boolean(alexShower?.privacy||alexToilet?.privacy),Boolean(alexShower?.bathing));
    const alexCarryMeal=game.action?.id==='dining'&&
      ['toSeat','eating'].includes(game.action.diningStage);
    snack.enabled=Boolean((alexFridge&&alexFridge.handFood>.012)||alexCarryMeal);
    if(snack.enabled){
      const size=alexCarryMeal?(alexDining?Math.max(.20,1-game.action.elapsed/ACTIONS.dining.duration):.85):alexFridge.handFood;
      snack.setLocalScale(.20*size,.17*size,.20*size);
    }
    book.enabled=pairedBooks||(using&&useId==='sofa')||
      (game.action?.id==='hobby'&&
       (readingHasBook(game.action)||alexReadingStage==='taking'));
    // Mira uses the same pose definitions, but maintains her own position and gait.
    const miraUsing=game.otherSim.action?.phase==='using';
    const miraUseId=miraUsing?(game.otherSim.action.id==='dining'&&
      game.otherSim.action.diningStage==='taking'?'fridge':
      game.otherSim.action.id==='cook'&&['taking','storing'].includes(game.otherSim.action.cookStage)?'fridge':
      game.otherSim.action.id==='cook'&&game.otherSim.action.cookStage==='preparing'?'prep':
      game.otherSim.action.id):
      pairedTv?'tv':pairedBooks?'hobby':pairedMusic?'music':null;
    const miraDining=miraUseId==='dining'&&game.otherSim.action?.diningStage==='eating';
    const miraDiningVisual=miraDining?diningVisualFor('mira',game.otherSim):diningVisual.mira;
    const miraFridge=miraUseId==='fridge'?fridgeSequence(game.otherSim.action.elapsed,
      game.otherSim.action?.id==='dining'?6:game.otherSim.action?.id==='cook'&&
        game.otherSim.action.cookStage==='storing'?6:
        game.otherSim.action?.id==='cook'?5:ACTIONS.fridge.duration):null;
    showerStates.mira=advanceShowerTransition(showerStates.mira,miraUseId==='shower',
      game.otherSim.action?.elapsed||0,ACTIONS.shower.duration,frameAnimDt,
      inverseFurniturePose(game.world,'shower',miraDisplay).yaw);
    const miraShower=showerStates.mira.frame?{...showerStates.mira.frame,
      pose:furniturePose(game.world,'shower',showerStates.mira.frame.pose)}:null;
    toiletStates.mira=advanceToiletTransition(toiletStates.mira,miraUseId==='toilet',
      game.otherSim.action?.elapsed||0,ACTIONS.toilet.duration,frameAnimDt,
      inverseFurniturePose(game.world,'toilet',miraDisplay).yaw);
    const miraToilet=toiletStates.mira.frame?{...toiletStates.mira.frame,
      pose:furniturePose(game.world,'toilet',toiletStates.mira.frame.pose)}:null;
    const miraReadingStage=readingStage(game.otherSim.action);
    const miraReadingSeated=readingIsSeated(game.otherSim.action);
    const miraWalking=frameActive&&((game.otherSim.action?.phase==='walking'&&
      (game.otherSim.action.id!=='hobby'||Boolean(readingRouteId(game.otherSim.action))))||
      socialWalkingFor('mira')||residentWorkPhase(game,'mira')==='departing');
    const miraWatchSeat=miraUseId==='tv'
      ?(pairedTv?.places?.mira?.seatId||game.otherSim.action?.watchSeatInstanceId):null;
    const miraDateSofa=romanticSofa.active;
    if(miraDateSofa){
      sofaVisualTargets.mira=romanticSofa.sofaId;
      romanticSofaSlots.mira=sofaDateFor('mira');
    }else if(miraUseId==='sofa'||miraUseId==='seat'||miraWatchSeat||miraReadingSeated||miraDining)
      sofaVisualTargets.mira=miraDining?game.otherSim.action.diningSeatInstanceId:
        miraReadingSeated?game.otherSim.action.readingSeatInstanceId:
        (miraWatchSeat||game.otherSim.action?.targetInstanceId)||null;
    if(miraUseId==='bench'&&game.otherSim.action?.phase==='using')
      benchVisualTargets.mira=game.otherSim.action.targetInstanceId;
    sofaStates.mira=advanceSofaTransition(sofaStates.mira,
      (miraUseId==='sofa'||miraUseId==='seat'||miraUseId==='bench'||Boolean(miraWatchSeat)||miraDateSofa||miraReadingSeated||miraDining)&&
        bedStates.mira.progress===0&&!showerStates.mira.active,
      miraReadingStage?frameAnimDt*game.speed:frameAnimDt);
    const miraSeatBase=sofaTransitionPose(sofaStates.mira);
    const gardenMiraPose=benchVisualTargets.mira&&sofaStates.mira.progress>0
      ?outdoorBenchPose(game.world,benchVisualTargets.mira,sofaStates.mira.progress):null;
    if(!gardenMiraPose&&miraUseId!=='bench')benchVisualTargets.mira=null;
    const miraSeatPose=gardenMiraPose||(purchasedSeatPrefab(game.world,sofaVisualTargets.mira)
      ?(miraDiningVisual&&miraDiningVisual.chairId===sofaVisualTargets.mira
        ?purchasedDiningSeatPose(game.world,sofaVisualTargets.mira,miraSeatBase,
          sofaStates.mira.progress,miraDiningVisual.side,miraDiningVisual.maxPull)
        :purchasedSeatPose(game.world,sofaVisualTargets.mira,miraSeatBase))
      :furniturePose(game.world,'sofa',
        romanticSofaSlots.mira===null?miraSeatBase:
          {...miraSeatBase,x:miraSeatBase.x+romanticSofaSlotOffset(romanticSofaSlots.mira)},
        sofaVisualTargets.mira))||
      {...miraDisplay,sofaWeight:0};
    const miraSeating=miraUseId==='sofa'||miraUseId==='seat'||miraUseId==='bench'||Boolean(miraWatchSeat)||miraReadingSeated||miraDining||
      sofaStates.mira.progress>0||miraDateSofa;
    if(!miraSeating){sofaVisualTargets.mira=null;romanticSofaSlots.mira=null;diningVisual.mira=null;}
    // Both residents' chair roots share the same reversible animation curve.
    renderDiningChairOffsets();
    if(miraUseId==='bed')bedVisualTargets.mira=game.otherSim.action?.targetInstanceId??'home-bed-1';
    bedStates.mira=advanceBedTransition(bedStates.mira,
      miraUseId==='bed'&&sofaStates.mira.progress===0&&!showerStates.mira.active,
      game.otherSim.action?.bedSlot,frameAnimDt,
      inverseFurniturePose(game.world,'bed',miraDisplay,bedVisualTargets.mira));
    const miraBedPose=bedStates.mira.progress>0
      ?furniturePose(game.world,'bed',bedTransitionPose(bedStates.mira),bedVisualTargets.mira):null;
    if(bedStates.mira.progress===0)bedVisualTargets.mira=null;
    const miraBedding=Boolean(miraBedPose);
    const pairedTvMiraStand=pairedTv&&!miraWatchSeat
      ?{...pairedTv.places.mira,y:0,pitch:0,
        yaw:furniturePose(game.world,'tv',TV_WATCH_POSE,pairedTv.tvId)?.yaw||0}:null;
    const miraPose=pairedTvMiraStand||(miraUseId&&!pairedHobby&&!miraSeating&&miraUseId!=='sofa'&&miraUseId!=='bed'&&miraUseId!=='shower'&&miraUseId!=='toilet'
      ?(miraUseId==='paint'
        ?easelPaintingPose(game.world,game.otherSim.action?.targetInstanceId,game.otherSim.position)
        :furniturePose(game.world,miraUseId==='lamp'?'floorlamp':
          miraUseId==='cook'?'stove':miraUseId==='wash'?'sink':miraUseId,
          ACTOR_POSES[miraUseId],game.otherSim.action?.id==='dining'||
            (game.otherSim.action?.id==='cook'&&miraUseId==='fridge')?null:
            (game.otherSim.action?.id==='cook'&&miraUseId==='prep')
              ?game.otherSim.action.prepInstanceId:game.otherSim.action?.targetInstanceId)):null);
    const previousMiraXZ={x:miraDisplay.x,z:miraDisplay.z};
    const miraDesired=miraToilet?miraToilet.pose:miraShower?miraShower.pose:miraBedding?miraBedPose:miraSeating?miraSeatPose:{
      x:miraPose?miraPose.x:pairTargets?.b.x??game.otherSim.position.x,
      y:miraPose?miraPose.y:animationStates.mira.walkBob+lotActorHeight(game.world,game.otherSim.position),
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
      miraDisplay.x=approach(miraDisplay.x,miraDesired.x,miraSeating||miraPose?10:11,frameAnimDt);
      miraDisplay.y=approach(miraDisplay.y,miraDesired.y,miraSeating||miraPose?10:10,frameAnimDt);
      miraDisplay.z=approach(miraDisplay.z,miraDesired.z,miraSeating||miraPose?10:11,frameAnimDt);
      miraDisplay.pitch=approach(miraDisplay.pitch,miraDesired.pitch,3.8,frameAnimDt);
      miraDisplay.yaw=approachAngle(miraDisplay.yaw,miraDesired.yaw,10,frameAnimDt);
      miraDisplay.roll=approach(miraDisplay.roll,0,12,frameAnimDt);
    }
    const miraMotion=advanceVisualGait(miraGait,previousMiraXZ,miraDisplay,
      miraWalking&&!miraSeating&&!miraBedding&&!miraPose&&!miraShower&&!miraToilet);
    miraGait=miraMotion.phase;
    if(miraMotion.heading!==null)
      miraDisplay.yaw=approachAngle(miraDisplay.yaw,miraMotion.heading,13,frameAnimDt);
    miraAvatar.setPosition(miraDisplay.x,miraDisplay.y,miraDisplay.z);
    miraAvatar.setEulerAngles(miraDisplay.pitch,miraDisplay.yaw,miraDisplay.roll);
    animationStates.mira=stepAnimation(animationStates.mira,{
      id:'mira',walking:(miraWalking||Boolean(miraShower?.stepWeight>.015))&&!miraSeating&&!miraBedding,
      using:miraToilet?'toilet':miraShower?'shower':miraUseId,
      musicActivityId:pairedMusic?MUSIC_ACTIVITY_ID:
        game.otherSim.action?.id==='music'?game.otherSim.action.activityId:null,
      musicStyleId:pairedMusic?'music.calm':
        game.otherSim.action?.id==='music'?game.otherSim.action.contentId:null,
      musicElapsed:pairedMusic?game.socialAction.elapsed:
        game.otherSim.action?.id==='music'?game.otherSim.action.elapsed:null,
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
      social:socialUsing&&!pairedTv&&!pairedHobby&&!hugFrame.active&&!kissFrame.active?game.socialAction.kind:null,
      eveningWeight:eveningFrame.gestureWeight,
      hugWeight:hugFrame.weight,
      kissWeight:kissFrame.weight,
      fridgeReach:miraFridge?.reach||0,fridgeEat:miraFridge?.eat||0,
      fridgeChew:miraFridge?.chew||0,
      gait:miraShower?miraShower.gaitMeters*WALK_PHASE_PER_METER:miraGait,
      mood:game.otherSim.mind?.mood?.value,energy:game.otherSim.needs.energy
    },frameAnimDt);
    if(!miraShower&&!miraToilet&&!miraBedding&&!miraSeating&&!miraPose&&!socialUsing){
      miraDisplay.y=approach(miraDisplay.y,animationStates.mira.walkBob+
        lotActorHeight(game.world,game.otherSim.position),10,frameAnimDt);
      miraAvatar.setPosition(miraDisplay.x,miraDisplay.y,miraDisplay.z);
    }
    applyCharacterAnimation(miraRig,animationStates.mira);
    applyShowerAppearance(miraRig,Boolean(miraShower?.privacy||miraToilet?.privacy),Boolean(miraShower?.bathing));
    const miraCarryMeal=game.otherSim.action?.id==='dining'&&
      ['toSeat','eating'].includes(game.otherSim.action.diningStage);
    miraSnack.enabled=Boolean((miraFridge&&miraFridge.handFood>.012)||miraCarryMeal);
    if(miraSnack.enabled){
      const size=miraCarryMeal?(miraDining?Math.max(.20,1-game.otherSim.action.elapsed/ACTIONS.dining.duration):.85):miraFridge.handFood;
      miraSnack.setLocalScale(.20*size,.17*size,.20*size);
    }
    miraBook.enabled=pairedBooks||(miraUsing&&miraUseId==='sofa')||
      (game.otherSim.action?.id==='hobby'&&
        (readingHasBook(game.otherSim.action)||miraReadingStage==='taking'));
    // Mira retains one 3D skin for sofa, bed, fridge and clothed shower
    // entry/exit. The original game owns shower water, cover, full avatar
    // privacy and all simulation/save state; no private body is visible.
    const miraMeshShown=meshyMira.update({
      preferred:meshyPreferred&&!residentAwayAtWork(game,'mira'),
      paused:!frameActive,dt:frameAnimDt,
      walking:((game.otherSim.action?.phase==='walking'&&
        (game.otherSim.action.id!=='hobby'||Boolean(readingRouteId(game.otherSim.action))))||
        socialWalkingFor('mira'))&&
        !miraSeating&&!miraBedding&&!miraShower,
      social:socialUsing&&!pairedTv&&!pairedHobby?game.socialAction.kind:null,
      hugFrame,kissFrame:kissMiraFrame,
      actionId:(miraUseId==='seat'||miraUseId==='bench'||miraDining)?'sofa':miraUseId,
      readingStage:pairedBooks?'reading':miraReadingStage,
      readingStepElapsed:game.otherSim.action?.readingStepElapsed??0,
      readingElapsed:game.otherSim.action?.id==='hobby'?game.otherSim.action.elapsed:null,
      musicFrame:game.otherSim.action?.id==='music'?{
        phase:game.otherSim.action.phase,
        activityId:game.otherSim.action.activityId,
        contentId:game.otherSim.action.contentId,
        elapsed:game.otherSim.action.elapsed
      }:pairedMusic?{phase:'using',activityId:MUSIC_ACTIVITY_ID,
        contentId:'music.calm',elapsed:game.socialAction.elapsed}:null,
      diningFrame:miraDining?{phase:'using',activityId:'dining.meal',elapsed:game.otherSim.action.elapsed}:null,
      paintingFrame:miraUseId==='paint'?{phase:'using',elapsed:game.otherSim.action?.elapsed||0}:null,
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
    if(miraMeshShown&&(miraUseId==='sofa'||game.otherSim.action?.id==='hobby'))
      miraBook.enabled=false;
    if(miraMeshShown&&pairedBooks)miraBook.enabled=false;
    // The old snack is on the hidden procedural elbow, not the Meshy hand.
    if(miraMeshShown&&(miraUseId==='fridge'||miraCarryMeal))miraSnack.enabled=false;
    miraRig.paintbrush.enabled=Boolean(miraUseId==='paint'&&!miraMeshShown);
    // Alex stays on the same 3D rig for bed and fridge when their verified
    // skeleton controllers exist. The original simulation/root still owns
    // mattress placement, both bed slots, shower movement and opaque privacy.
    const meshyShown=meshyAlex.update({
      preferred:meshyPreferred&&!residentAwayAtWork(game,'alex'),
      paused:!frameActive,dt:frameAnimDt,
      // Preserve the Walking clip on pause: playback freezes but the
      // resident has not arrived at the destination.
      walking:((game.action?.phase==='walking'&&
        (game.action.id!=='hobby'||Boolean(readingRouteId(game.action))))||
        socialWalkingFor('alex'))&&
        !seating&&!bedding&&!alexShower,
      worldMinutes:game.minutes,
      mood:game.mind?.mood?.value,
      energy:game.needs.energy,
      social:socialUsing&&!pairedTv&&!pairedHobby?game.socialAction.kind:null,
      socialInitiator:socialUsing&&game.socialAction.initiator==='alex',
      socialElapsed:socialUsing?game.socialAction.elapsed:null,
      hugFrame,kissFrame:kissAlexFrame,
      actionId:(useId==='seat'||useId==='bench'||alexDining)?'sofa':useId,
      readingStage:pairedBooks?'reading':alexReadingStage,
      readingStepElapsed:game.action?.readingStepElapsed??0,
      readingElapsed:game.action?.id==='hobby'?game.action.elapsed:null,
      musicFrame:game.action?.id==='music'?{
        phase:game.action.phase,activityId:game.action.activityId,
        contentId:game.action.contentId,elapsed:game.action.elapsed
      }:pairedMusic?{phase:'using',activityId:MUSIC_ACTIVITY_ID,
        contentId:'music.calm',elapsed:game.socialAction.elapsed}:null,
      diningFrame:alexDining?{phase:'using',activityId:'dining.meal',elapsed:game.action.elapsed}:null,
      paintingFrame:useId==='paint'?{phase:'using',elapsed:game.action?.elapsed||0}:null,
      sofaBusy:sofaStates.alex.progress>0,
      sofaWeight:seatPose.sofaWeight,
      seat:seatContactEnabled?(alexDiningVisual&&
        alexDiningVisual.chairId===sofaVisualTargets.alex
        ?purchasedDiningSeatSurface(game.world,alexDiningVisual.chairId,
          diningChairPullOffset(sofaStates.alex.progress,alexDiningVisual.maxPull))
        :livingSofaSeat):null,
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
    if(meshyShown&&(useId==='fridge'||alexCarryMeal))snack.enabled=false;
    alexRig.paintbrush.enabled=Boolean(useId==='paint'&&!meshyShown);
    // The existing procedural book is attached to the old right elbow.
    // Never let it float beside the Meshy hand until a real socket exists.
    if(meshyShown&&(useId==='sofa'||game.action?.id==='hobby'))
      book.enabled=false;
    if(meshyShown&&pairedBooks)book.enabled=false;
    // F4G.2: visible cooked tray travels from stove to fridge, stage-only.
    for(const id of HOUSEHOLD_IDS){
      const action=getActor(game,id)?.action;
      const carrying=action?.id==='cook'&&
        ['toFridgeStore','storing'].includes(action.cookStage)&&!furnishMode;
      const drawn=cookedCarry[id];
      drawn.tray.enabled=Boolean(carrying);drawn.food.enabled=Boolean(carrying);
      if(carrying){
        const actor=id==='alex'?display:miraDisplay;
        const offset=rotateLocal(.26,-.03,actor.yaw);
        const x=actor.x+offset.x,y=actor.y+1.07,z=actor.z+offset.z;
        drawn.tray.setPosition(x,y,z);
        drawn.food.setPosition(x,y+.075,z);
      }
    }
    // Plates and their portions track the chosen purchased table and real seat.
    // Cancellation, completion, storage or removal hides them immediately.
    for(const id of HOUSEHOLD_IDS){
      const a=getActor(game,id)?.action;
      const pos=a?.id==='dining'&&a.phase==='using'&&a.diningStage==='eating'
        ?diningPlatePosition(game.world,a.targetInstanceId,a.diningSeatInstanceId):null;
      const dish=diningDishes[id];
      dish.plate.enabled=Boolean(pos);dish.food.enabled=Boolean(pos);
      if(pos){
        dish.plate.setPosition(pos.x,pos.y,pos.z);
        dish.food.setPosition(pos.x,pos.y+.055,pos.z);
        const size=Math.max(.07,1-a.elapsed/ACTIONS.dining.duration);
        dish.food.setLocalScale(.23*size,.075,.18*size);
      }
    }
    // Imported GLB roots are outside the legacy avatar hierarchy, hence
    // BOTH the skin preference and the procedural rig must hide off-lot sims.
    avatar.enabled=!residentAwayAtWork(game,'alex');
    miraAvatar.enabled=!residentAwayAtWork(game,'mira');
    alexSelected.enabled=game.selectedSim==='alex' && !using &&
      !residentAwayAtWork(game,'alex');
    miraSelected.enabled=game.selectedSim==='mira' && !miraUsing &&
      !residentAwayAtWork(game,'mira');
    // F4G appliance animation is visual-only; only the domain mints meals and XP.
    for(const item of game.world.furniture.instances){
      if(!['stove','prep','sink'].includes(item.prefabId))continue;
      const node=decorNodes.get(item.instanceId);
      if(!node)continue;
      const actor=HOUSEHOLD_IDS.map(id=>getActor(game,id)).find(resident=>
        resident?.action?.id==='cook'&&resident.action.phase==='using'&&
        (item.prefabId==='stove'&&resident.action.cookStage==='cooking'&&
          resident.action.targetInstanceId===item.instanceId||
         item.prefabId==='prep'&&resident.action.cookStage==='preparing'&&
          resident.action.prepInstanceId===item.instanceId));
      const active=Boolean(actor)&&item.location==='home'&&!furnishMode;
      if(item.prefabId==='stove'){
        const pot=node.findByName('F4G cooking pot');
        if(pot)pot.enabled=active;
        const spoon=node.findByName('F4G stirring spoon');
        if(spoon){
          spoon.enabled=active;
          if(active){
            spoon.setLocalPosition(.12+Math.sin(effectTime*4)*.075,
              1.26+Math.sin(effectTime*6)*.03,-.05);
            spoon.setLocalEulerAngles(0,0,Math.sin(effectTime*5)*24);
          }
        }
        for(let i=0;i<3;i++){
          const steam=node.findByName('F4G cooking steam '+i);
          if(!steam)continue;
          steam.enabled=active;
          if(active)steam.setLocalPosition((i-1)*.12+
            Math.sin(effectTime*2.0+i)*.035,
            1.32+i*.13+Math.sin(effectTime*1.8+i)*.065,-.10);
        }
      }else if(item.prefabId==='prep'){
        // Never leave a cooked dish on the worktop: props exist only during
        // the real preparation stage, then disappear on walk/finish/cancel.
        const chopped=node.findByName('F4G chopped ingredients');
        if(chopped)chopped.enabled=active;
        const bowl=node.findByName('F4G prep bowl');
        if(bowl)bowl.enabled=active;
      }else{
        const dish=node.findByName('F4G dirty plate');
        if(dish)dish.enabled=item.location==='home'&&game.kitchen?.dirtyDishes>0;
      }
    }
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
    // H5a artwork entities are independent of their source stations.
    updateArtworkNodes();
    // F4E: interaction visuals depend only on the real targeted action.
    // Lights persist in v1, while drawers, doors and mirror highlights close
    // automatically after completion, interruption or save reload.
    const c3Residents=HOUSEHOLD_IDS.map(id=>({
      ...getActor(game,id).position,
      away:residentUnavailableForHome(game,id)}));
    const lightingStates=new Map();
    for(const item of game.world.furniture.instances){
      if(item.location!=='home')continue;
      const node=decorNodes.get(item.instanceId);
      if(!node?.enabled)continue;
      if(item.prefabId==='floorlamp')
        lightingStates.set(item.instanceId,lampIsOn(game.world,item.instanceId));
      if(MOUNTED_LIGHTS[item.itemDefinitionId]){
        const previous=node.findByName('C3 mounted lamp light')?.light?.enabled||false;
        lightingStates.set(item.instanceId,mountedLightIsOn({fixture:item,
          construction:game.world.construction,calendar:game.calendar,
          minutes:game.minutes,residents:c3Residents,previous}));
      }
    }
    const litIds=new Set(prioritizeVisibleLights(
      game.world.furniture.instances.map(item=>({...item,
        on:lightingStates.get(item.instanceId)===true})),c3Residents,5));
    for(const item of game.world.furniture.instances){
      if(item.location!=='home')continue;
      const node=decorNodes.get(item.instanceId);
      if(!node?.enabled)continue;
      if(item.prefabId==='floorlamp'){
        const light=node.findByName('F4E lamp light');
        if(light?.light){
          light.light.enabled=litIds.has(item.instanceId);
          const bulb=light.findByName('F4E lamp bulb');
          if(bulb)bulb.enabled=light.light.enabled;
        }
      }
      if(MOUNTED_LIGHTS[item.itemDefinitionId]){
        const light=node.findByName('C3 mounted lamp light');
        if(light?.light){
          light.light.enabled=litIds.has(item.instanceId);
          const bulb=light.findByName('C3 mounted bulb');
          if(bulb)bulb.enabled=light.light.enabled;
        }
      }
      if(item.prefabId==='easel'){
        const painter=[game,game.otherSim].find(actor=>
          actor.action?.id==='paint'&&actor.action.targetInstanceId===item.instanceId);
        const activeAction=painter?.action;
        // Finished paintings live in independent H5a artwork entities.
        const contentId=activeAction?.contentId;
        const stage=activeAction?.phase==='using'
          ?Math.floor(Math.min(1,activeAction.elapsed/ACTIONS.paint.duration)*6)
          :0;
        let cached=paintStrokeCache.get(node);
        if(!cached){
          cached=new Map(PAINT_CONTENT_IDS.map(theme=>[theme,
            Array.from({length:6},(_,i)=>node.findByName('H5 paint '+theme+' '+i))]));
          paintStrokeCache.set(node,cached);
        }
        const seed=painter?.activitySession?.sessionId
          ?paintingSeedFromSession(painter.activitySession.sessionId):0;
        const preview=compositionForArtwork(contentId,seed,1);
        for(const theme of PAINT_CONTENT_IDS)for(let i=0;i<6;i++){
          const stroke=cached.get(theme)?.[i];
          if(!stroke)continue;
          const shown=theme===contentId&&i<stage&&Boolean(preview[i]);
          if(shown){
            const [,x,y,sx,sy]=preview[i];
            stroke.setLocalPosition(x,y,-.181-i*.0007);
            stroke.setLocalScale(sx,sy,.009);
          }
          stroke.enabled=shown;
        }
        continue;
      }
      if(!['dresser','wardrobe','mirror','fridge','shower','toilet'].includes(item.prefabId))continue;
      const weight=Math.max(0,...HOUSEHOLD_IDS.map(id=>
        furnitureUseWeight(getActor(game,id)?.action,item.instanceId)));
      if(['dresser','wardrobe','fridge','shower','toilet'].includes(item.prefabId))
        meshyFurniture.useProcedural(node,weight>.005);
      const reposition=(part,dx=0,dz=0)=>{
        if(!part)return;
        let base=f4eOriginalPositions.get(part);
        if(!base){const p=part.getLocalPosition();
          base={x:p.x,y:p.y,z:p.z};f4eOriginalPositions.set(part,base);}
        part.setLocalPosition(base.x+dx,base.y,base.z+dz);
      };
      if(item.prefabId==='dresser'){
        const sku=furnitureProduct(item.itemDefinitionId)?.modelKey;
        if(sku==='dresser.reed')for(let i=0;i<3;i++){
          reposition(node.findByName('SKU dresser.reed dresser drawer '+i),0,-.31*weight);
          reposition(node.findByName('SKU dresser.reed drawer pull '+i),0,-.31*weight);
        }
        if(sku==='dresser.arch')for(const sign of [-1,1]){
          const side=sign===-1?'-0.41':'0.41';
          for(const name of ['arched door ','arched door arch '])
            reposition(node.findByName('SKU dresser.arch '+name+side),
              sign*.17*weight,-.15*weight);
          const handle=sign===-1?'-0.12':'0.12';
          reposition(node.findByName('SKU dresser.arch arched brass knob '+handle),
            sign*.17*weight,-.15*weight);
        }
      }else if(item.prefabId==='wardrobe'){
        const sku=furnitureProduct(item.itemDefinitionId)?.modelKey;
        if(sku==='wardrobe.classic')for(const sign of [-1,1]){
          const side=sign===-1?'-0.41':'0.41';
          reposition(node.findByName('SKU wardrobe.classic carved wardrobe door '+side),
            sign*.36*weight,-.13*weight);
          const handle=sign===-1?'-0.11':'0.11';
          reposition(node.findByName('SKU wardrobe.classic long brass handle '+handle),
            sign*.36*weight,-.13*weight);
        }
        if(sku==='wardrobe.open'){
          for(let i=0;i<3;i++)reposition(
            node.findByName('SKU wardrobe.open hanging garment '+i),
            0,-.21*weight);
          for(let i=0;i<2;i++)reposition(
            node.findByName('SKU wardrobe.open folded basket '+i),
            0,-.26*weight);
        }
      }else{
        const glint=node.findByName('F4E mirror highlight');
        if(glint){glint.enabled=weight>.008;
          if(glint.enabled){
            glint.setLocalPosition(Math.sin(effectTime*1.7)*.13*weight,
              1.36,-.16);
            glint.setLocalScale(.12+.09*weight,.28+.13*weight,.026);
          }
        }
      }
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
    fridgeOpen=activeFridge?activeFridge.doorOpen:closeFridgeDoor(fridgeOpen,frameAnimDt);
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
    // Apply scene colors after the authoritative fixed-step clock tick.
    // No visual time advancement while paused, hidden or in Build/Furnish.
    const daylight=dayNightRenderer.update(game.calendar,game.minutes);
    currentOutdoorDaylight=daylight;syncOutdoorLights(daylight);
    uiTimer+=dt;autosaveTime+=dt;
    if(uiTimer>.14){
      uiTimer=0;
      const t=readableTime(game.minutes);
      const date=calendarAt(game.calendar,game.minutes);
      $('day-label').textContent=formatCalendarDay(date);
      calendarUI.tick();
      $('calendar-anchor-toggle').title=formatCalendarDay(date,{includeYear:true})+' · День '+date.gameDay+' · открыть календарь и события';
      $('time-label').textContent=t.time;
      $('light-phase-label').textContent=daylight.phaseLabel;
      const current=selectedActor();
      $('resident-name').textContent=selectedName();
      updateFamilyBalance();
      updateCareerHud(); // Live earned wages while shift is progressing.
      const skill=getSkillDefinition(HOBBY_SKILLS,READING_SKILL_ID);
      const currentXP=current.skills?.xpById?.[READING_SKILL_ID]||0;
      const level=currentSkillLevel(current.skills,HOBBY_SKILLS,READING_SKILL_ID);
      const nextXP=skill.xpThresholds[level]??skill.xpThresholds.at(-1);
      $('mind-reading-skill').textContent='Литературная эрудиция · уровень '+level+
        '/'+skill.maxLevel+' · '+Math.floor(currentXP)+' / '+nextXP+' опыта'+
        (current.action?.id==='hobby'&&current.action.phase==='using'?' · 📖 читает':'');
      if(!$('reading-content-field').hidden)updateReadingContentChoice();
      renderSkillsTab(false);
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
      const needNames={hunger:'Сытость',energy:'Энергия',hygiene:'Гигиена',
        fun:'Досуг',social:'Общение',bladder:'Туалет'};
      const urgent=NEEDS.map(need=>({need,value:Math.round(current.needs[need])}))
        .filter(item=>item.value<55).sort((a,b)=>a.value-b.value).slice(0,2);
      $('urgent-needs').textContent=urgent.length
        ?urgent.map(item=>needNames[item.need]+' '+item.value).join(' · ')
        :'Потребности в норме';
      $('urgent-needs').dataset.critical=String(urgent.some(item=>item.value<30));
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
      const wishTarget=current.mind.wish?.targetInstanceId;
      const wishFeature=wishTarget&&game.world.outdoors?.features?.find(f=>
        f.instanceId===wishTarget);
      const wishPlot=wishFeature&&OUTDOOR_CATALOG[wishFeature.itemId];
      const wishName=wish?wish.label+(wishPlot?' · '+wishPlot.name:''):null;
      $('wish-label').textContent=wish ? wish.symbol+' Хочет: '+wishName : 'Думает о будущем';
      $('mind-mood-label').textContent=current.mind.mood.label+' · '+current.mind.mood.value+'/100';
      $('mind-mood-bar').style.width=current.mind.mood.value+'%';
      $('mind-mood-bar').style.background=moodView.color;
      $('mind-mood-reasons').textContent=moodView.description;
      $('mind-wish-label').textContent=wishName || 'Присматривается к миру';
      $('wish-do-btn').disabled=!wish||Boolean(wishTarget&&!gardenWishCommand(game,game.selectedSim));
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
    bootReadyToSave=true;
    if(calendarNeedsPersistence||billsNeedsPersistence)save(true);
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
  hint.textContent='Мир не загрузился. Существующее сохранение не изменено. Проверь Safari и попробуй снова.';
  const details=document.createElement('small');
  details.className='startup-error-details';
  details.textContent=String(error?.message||error).slice(0,170);
  const retry=document.createElement('button');
  retry.type='button';retry.id='startup-retry';retry.className='startup-retry';
  retry.textContent='Повторить';
  // No save(true) here: pagehide/visibility autosave is gated until ready.
  retry.addEventListener('click',()=>window.location.reload());
  el.append(heading,hint,details,retry);
});
