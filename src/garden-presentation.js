/** LOT-C2c: pure mobile garden sheet model, no DOM/renderer/save mutation. */
import {OUTDOOR_CATALOG} from './outdoor-catalog.js';
import {gardenFeature,gardenView,gardenApproach,gardenBusy,GARDEN_CARE_COOLDOWN,GARDEN_REPLANT_PRICE} from './gardening.js';
import {KITCHEN_HERB_LIMIT,KITCHEN_HARVEST_UNITS} from './kitchen.js';
import {playerMayClaimGarden} from './garden-autonomy.js';
import {gardenWishEligible,GARDEN_WISHES} from './garden-psychology.js';
import {WISHES} from './psychology.js';
const LABELS={water:'💧 Полить · 15 мин',inspect:'🔎 Осмотреть · 8 мин',
  admire:'🌼 Полюбоваться · 8 мин',harvest:'🌿 Собрать травы · 12 мин',
  replant:'🌱 Посадить заново · 10 мин · 30 кр.'};
const hours=m=>Math.ceil(Math.max(0,m)/60);
export function gardenActionSheet(root,residentId,instanceId){
  const feature=gardenFeature(root?.world,instanceId);
  const person=residentId==='alex'?root:residentId==='mira'?root?.otherSim:null;
  if(!feature||!person)return null;
  const view=gardenView(root.world.outdoors,instanceId,root.minutes);
  if(!view)return null;
  const route=gardenApproach(root.world,instanceId,person.position);
  const busy=gardenBusy(root,instanceId),wish=person.mind?.wish;
  const matched=Boolean(wish&&GARDEN_WISHES[wish.id]&&
    wish.targetInstanceId===instanceId&&wish.plantedAt===view.plantedAt&&
    gardenWishEligible(root,residentId,wish));
  const desired=matched?GARDEN_WISHES[wish.id]:null;
  const wet=hours(view.waterRemaining);
  const herb=feature.itemId.startsWith('garden.herb.');
  const stock=root?.kitchen?.pantry?.herbs??0;
  const cropStatus=herb&&view.mature
    ?' · '+(view.harvestedAt===null?'Можно собрать':'Урожай собран')+
      ' · Травы '+stock+'/'+KITCHEN_HERB_LIMIT:'';
  const info=view.label+' · '+Math.floor(view.progressWetMinutes/60)+
    '/72 ч роста · '+(view.mature?'Созрело':wet?'Влаги на '+wet+' ч':'Нужен полив')+cropStatus;
  const ids=view.mature
    ?herb?[view.harvestedAt===null?'harvest':'replant','admire']:['admire']
    :view.stage>=1?['water','inspect']:['water'];
  const actions=ids.map(actionId=>{
    const available=Boolean(route)&&playerMayClaimGarden(root,residentId,instanceId,actionId);
    const elapsed=Number.isFinite(view.lastWateredAt)?root.minutes-view.lastWateredAt:1e9;
    const reason=!route?'Нет свободного пути':
      busy?'Грядка занята или уже в очереди':
      actionId==='water'&&elapsed<GARDEN_CARE_COOLDOWN
        ?'Повторный полив через '+hours(GARDEN_CARE_COOLDOWN-elapsed)+' ч':
      actionId==='harvest'&&stock+KITCHEN_HARVEST_UNITS>KITCHEN_HERB_LIMIT
         ?'Запас трав заполнен ('+stock+'/'+KITCHEN_HERB_LIMIT+')':
       actionId==='replant'&&root?.shop?.credits<GARDEN_REPLANT_PRICE
         ?'Недостаточно средств для посадки':
       actionId==='admire'?'Любование уже было сегодня':'Пока недоступно';
    return {actionId,label:LABELS[actionId],available,reason:available?'':reason,
      wished:actionId===desired,command:{type:'garden',instanceId,actionId}};
  });
  if(route&&!actions.some(a=>a.available))
    actions.push({actionId:'approach',label:'↗ Подойти к грядке',
      available:true,reason:'',wished:false,
      command:{type:'move',x:route.goal.x,z:route.goal.z}});
  actions.sort((a,b)=>Number(b.available)-Number(a.available)||
    Number(b.wished)-Number(a.wished));
  return {instanceId,plantedAt:view.plantedAt,
    name:OUTDOOR_CATALOG[feature.itemId]?.name||'Грядка',
    info,stage:view.stage,wet:wet>0,
    progress:Math.max(0,Math.min(100,Math.round(view.progressWetMinutes/4320*100))),
    wish:matched?'✦ Желание '+(residentId==='mira'?'Миры':'Алекса')+
      ': '+WISHES[wish.id].label+' · эта грядка':null,actions};
}
