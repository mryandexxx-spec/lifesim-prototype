/** F4G original kitchen rules. PlayCanvas-free; all content data and v1-safe storage.
 * C3b removes the free daily starter pantry replenishment.
 */
import {resolveActionFurniture,furnitureActionApproach} from './furniture-catalog.js';
import {findPath} from './navigation.js';
import {readyMeal} from './ready-meal-catalog.js';
import {GRILL_RECIPES,grillRecipe} from './grill-catalog.js';

export const KITCHEN_SCHEMA=1;
export const KITCHEN_PREPARED_LIMIT=12;
export const KITCHEN_PANTRY_DELIVERY_LIMIT=12;
// Domain-side autonomous care threshold; presentation remains dependency-free.
export const DISH_AUTO_WASH_THRESHOLD=6;
export const COOKING_SKILL_ID='cooking';
export const FRESH_MEAL_HUNGER_THRESHOLD=55;
export const PANTRY_START=Object.freeze({vegetables:8,grains:8,dairy:8,meat:0,chicken:0});
export const KITCHEN_HERB_LIMIT=16;
export const KITCHEN_HARVEST_UNITS=2;
const recipe=(id,label,requires,minLevel,cookMinutes,portions,hungerFactor,color)=>
  Object.freeze({id,label,requires:Object.freeze({...requires}),minLevel,
    cookMinutes,prepMinutes:8,portions,hungerFactor,color});
export const KITCHEN_RECIPES=Object.freeze({
  'cook.soup':recipe('cook.soup','Домашний овощной суп',{vegetables:2},0,25,3,1.08,'#d58d50'),
  'cook.herb-soup':recipe('cook.herb-soup','Суп с садовыми травами',{vegetables:2,herbs:1},0,26,3,1.14,'#8caf73'),
  'cook.pancakes':recipe('cook.pancakes','Тёплые оладьи',{grains:2,dairy:1},0,23,3,1.12,'#e5c77a'),
  'cook.pasta':recipe('cook.pasta','Паста с овощами',{grains:2,vegetables:1},2,30,3,1.20,'#c7ba6f'),
  'cook.gratin':recipe('cook.gratin','Сливочная запеканка',{vegetables:2,dairy:2},4,37,4,1.32,'#ddad6f'),
  'cook.grain-bowl':recipe('cook.grain-bowl','Крупяная миска с овощами',{grains:2,vegetables:2},1,28,3,1.14,'#caa66a'),
  'cook.herb-noodles':recipe('cook.herb-noodles','Лапша с садовыми травами',{grains:3,dairy:1,herbs:1},3,33,3,1.24,'#95ae70'),
  'cook.roast-tray':recipe('cook.roast-tray','Овощи из печи',{vegetables:3,dairy:1,grains:1},5,39,4,1.36,'#d28b55'),
  'cook.festival-pie':recipe('cook.festival-pie','Праздничный пирог с травами',{grains:3,dairy:2,herbs:2},7,44,4,1.43,'#dfb67c')
});
/** Only home-cooked batches receive a skill-derived bonus. Old v1 rows and
 * purchased FOOD-R1 servings retain their original 1x factor. */
export const KITCHEN_QUALITIES=Object.freeze({
  normal:Object.freeze({id:'normal',label:'Домашнее',hungerMultiplier:1}),
  good:Object.freeze({id:'good',label:'Вкусное',hungerMultiplier:1.08}),
  excellent:Object.freeze({id:'excellent',label:'Отличное',hungerMultiplier:1.16}),
  chef:Object.freeze({id:'chef',label:'Мастерское',hungerMultiplier:1.24})
});
export function cookingQuality(level=0){
  return KITCHEN_QUALITIES[Number.isFinite(level)&&level>=9?'chef':
    Number.isFinite(level)&&level>=6?'excellent':
    Number.isFinite(level)&&level>=3?'good':'normal'];
}
export function kitchenQualityId(recipeId,quality){
  return (Object.hasOwn(KITCHEN_RECIPES,recipeId)||Object.hasOwn(GRILL_RECIPES,recipeId))&&
    typeof quality==='string'&&Object.hasOwn(KITCHEN_QUALITIES,quality)
      ?quality:'normal';
}
export function kitchenServingMultiplier(recipeId,quality){
  return KITCHEN_QUALITIES[kitchenQualityId(recipeId,quality)].hungerMultiplier;
}
const own=(obj,key)=>Object.hasOwn(obj||{},key);
const finiteInt=n=>Number.isSafeInteger(n)&&n>=0;
export const kitchenRecipe=id=>typeof id==='string'
  ?(own(KITCHEN_RECIPES,id)?KITCHEN_RECIPES[id]:(grillRecipe(id)||readyMeal(id))):null;
export function newKitchen(){
  return {schema:KITCHEN_SCHEMA,pantry:{...PANTRY_START,herbs:0},prepared:[],
    deliveries:[],pantryDeliveries:[],dirtyDishes:0,lastPantryDay:0};
}
export function restoreKitchen(raw){
  const state=newKitchen();
  if(!raw||raw.schema!==KITCHEN_SCHEMA||typeof raw!=='object')return state;
  if(raw.pantry&&['vegetables','grains','dairy'].every(id=>
    finiteInt(raw.pantry[id])&&raw.pantry[id]<=30))
    state.pantry={...Object.fromEntries(Object.keys(PANTRY_START).map(id=>
      [id,finiteInt(raw.pantry[id])&&raw.pantry[id]<=30?raw.pantry[id]:
        PANTRY_START[id]])),
      herbs:finiteInt(raw.pantry.herbs)&&raw.pantry.herbs<=KITCHEN_HERB_LIMIT?raw.pantry.herbs:0};
  if(Array.isArray(raw.prepared)&&raw.prepared.length<=12){
    const combined=new Map();
    for(const entry of raw.prepared){
      if(!kitchenRecipe(entry?.recipeId)||!finiteInt(entry.portions)||entry.portions>12)
        continue;
      const quality=kitchenQualityId(entry.recipeId,entry.quality);
      const key=entry.recipeId+'|'+quality;
      const previous=combined.get(key);
      combined.set(key,{recipeId:entry.recipeId,
        portions:Math.min(12,(previous?.portions||0)+entry.portions),
        ...(quality==='normal'?{}:{quality})});
    }
    state.prepared=[...combined.values()].filter(x=>x.portions>0);
  }
  // Save-v1 additive optional delivery queue. Paid slots survive reload; never mint
  // unknown entries, duplicate order IDs, or stock beyond physical capacity.
  if(Array.isArray(raw.deliveries)&&raw.deliveries.length<=KITCHEN_PREPARED_LIMIT){
    const seen=new Set();
    let reserved=state.prepared.reduce((n,x)=>n+x.portions,0);
    for(const order of raw.deliveries){
      if(!readyMeal(order?.recipeId)||typeof order.id!=='string'||
         !/^ready-order-[1-9][0-9]*$/.test(order.id)||seen.has(order.id)||
         !finiteInt(order.dueAt)||order.dueAt>2_000_000_000||
         !finiteInt(order.orderedAt)||order.orderedAt>order.dueAt||
         reserved>=KITCHEN_PREPARED_LIMIT)continue;
      seen.add(order.id);
      state.deliveries.push({id:order.id,recipeId:order.recipeId,
        orderedAt:order.orderedAt,dueAt:order.dueAt});
      reserved++;
    }
  }
  // Additive optional v1 grocery deliveries. Keep original ready meal orders
  // independent and never accept a forged/duplicated warehouse top-up.
  if(Array.isArray(raw.pantryDeliveries)&&
      raw.pantryDeliveries.length<=KITCHEN_PANTRY_DELIVERY_LIMIT){
    const seen=new Set(),reserved=Object.fromEntries(
      Object.keys(PANTRY_START).filter(k=>k!=='herbs').map(k=>[k,state.pantry[k]]));
    for(const row of raw.pantryDeliveries){
      const ingredientId=row?.ingredientId;
      const units=['meat','chicken'].includes(ingredientId)?3:5;
      if(!Object.hasOwn(reserved,ingredientId)||
        !finiteInt(row.units)||row.units!==units||
        typeof row.id!=='string'||!/^pantry-order-[1-9][0-9]*$/.test(row.id)||
        seen.has(row.id)||!finiteInt(row.orderedAt)||!finiteInt(row.dueAt)||
        row.dueAt<row.orderedAt||row.dueAt>2_000_000_000||
        reserved[ingredientId]+units>30)continue;
      reserved[ingredientId]+=units;seen.add(row.id);
      state.pantryDeliveries.push({id:row.id,ingredientId,units,
        orderedAt:row.orderedAt,dueAt:row.dueAt});
    }
  }
  if(finiteInt(raw.dirtyDishes))state.dirtyDishes=Math.min(32,raw.dirtyDishes);
  if(finiteInt(raw.lastPantryDay)&&raw.lastPantryDay<=200000)
    state.lastPantryDay=raw.lastPantryDay;
  return state;
}
/** Legacy day watermark only: do not mint food at dawn. */
export function replenishKitchen(kitchen,clockMinutes){
  if(!kitchen||!Number.isFinite(clockMinutes))return false;
  const day=Math.floor(Math.max(0,clockMinutes)/1440);
  if(day<=kitchen.lastPantryDay)return false;
  kitchen.lastPantryDay=day;
  return true;
}
export function canCookRecipe(kitchen,recipeId,level=0){
  const recipe=own(KITCHEN_RECIPES,recipeId)?KITCHEN_RECIPES[recipeId]:null;
  return Boolean(recipe&&Number.isFinite(level)&&level>=recipe.minLevel&&
    Object.entries(recipe.requires).every(([id,count])=>
      finiteInt(kitchen?.pantry?.[id])&&kitchen.pantry[id]>=count)&&
    Array.isArray(kitchen?.prepared)&&
    kitchen.prepared.reduce((n,x)=>n+x.portions,0)+
      (Array.isArray(kitchen.deliveries)?kitchen.deliveries.length:0)+
      recipe.portions<=KITCHEN_PREPARED_LIMIT);
}
export function finishKitchenRecipe(kitchen,recipeId,level=0){
  const recipe=kitchenRecipe(recipeId);
  if(!canCookRecipe(kitchen,recipeId,level))return false;
  for(const [id,count] of Object.entries(recipe.requires))kitchen.pantry[id]-=count;
  const quality=cookingQuality(level).id;
  const previous=kitchen.prepared.find(x=>x.recipeId===recipeId&&
    kitchenQualityId(x.recipeId,x.quality)===quality);
  if(previous)previous.portions+=recipe.portions;
  else kitchen.prepared.push({recipeId,portions:recipe.portions,
    ...(quality==='normal'?{}:{quality})});
  return true;
}
/** Fridge inventory: data-only rows shared by UI, selection and autonomous eating. */
export function preparedKitchenMeals(kitchen){
  if(!Array.isArray(kitchen?.prepared))return [];
  const grouped=new Map();
  for(const item of kitchen.prepared){
    if(!kitchenRecipe(item?.recipeId)||!finiteInt(item.portions)||item.portions===0)
      continue;
    const quality=kitchenQualityId(item.recipeId,item.quality);
    const previous=grouped.get(item.recipeId);
    if(previous){
      previous.portions+=item.portions;
      if(previous.quality!==quality)previous.quality='mixed';
    }else grouped.set(item.recipeId,{recipeId:item.recipeId,
      label:kitchenRecipe(item.recipeId).label,portions:item.portions,
      color:kitchenRecipe(item.recipeId).color,quality});
  }
  return [...grouped.values()];
}
export function hasKitchenServing(kitchen,recipeId){
  return Boolean(kitchenRecipe(recipeId)&&preparedKitchenMeals(kitchen)
    .some(item=>item.recipeId===recipeId));
}
/** After physical storage, hungry cooks may take exactly one of their new portions. */
export function shouldEatFreshKitchenMeal(hunger,tableAvailable){
  return Number.isFinite(hunger)&&hunger<=FRESH_MEAL_HUNGER_THRESHOLD&&
    tableAvailable===true;
}
/** One physical serving is taken only at the confirmed seated-eating stage.
 * Legacy API returns the recipe ID; the new detailed variant also returns
 * the quality of the exact batch, without discarding parallel stock. */
export function takeKitchenServingDetails(kitchen,requestedRecipeId=null){
  if(!Array.isArray(kitchen?.prepared))return null;
  if(requestedRecipeId!==null&&!kitchenRecipe(requestedRecipeId))return null;
  const entry=kitchen.prepared.find(x=>x.portions>0&&kitchenRecipe(x.recipeId)&&
    (requestedRecipeId===null||x.recipeId===requestedRecipeId));
  if(!entry)return null;
  const serving={recipeId:entry.recipeId,
    quality:kitchenQualityId(entry.recipeId,entry.quality)};
  entry.portions--;
  kitchen.prepared=kitchen.prepared.filter(x=>x.portions>0);
  return serving;
}
export function takeKitchenServing(kitchen,requestedRecipeId=null){
  return takeKitchenServingDetails(kitchen,requestedRecipeId)?.recipeId??null;
}
export function recordDirtyDish(kitchen){
  if(kitchen&&finiteInt(kitchen.dirtyDishes))
    kitchen.dirtyDishes=Math.min(32,kitchen.dirtyDishes+1);
}
export function washKitchenDishes(kitchen){
  if(!kitchen||!finiteInt(kitchen.dirtyDishes)||kitchen.dirtyDishes===0)return 0;
  const cleaned=Math.min(3,kitchen.dirtyDishes);
  kitchen.dirtyDishes-=cleaned;
  return cleaned;
}
export function kitchenSummary(kitchen){
  const prepared=Array.isArray(kitchen?.prepared)?
    kitchen.prepared.reduce((n,x)=>n+x.portions,0):0;
  const pantry=kitchen?.pantry||PANTRY_START;
  return {prepared,deliveries:kitchen?.deliveries?.length||0,
    dirtyDishes:kitchen?.dirtyDishes||0,
    supplies:Object.keys(PANTRY_START).map(id=>pantry[id]||0).join('/'),herbs:pantry.herbs||0};
}
const routeLength=(start,path)=>path.reduce((sum,p,i)=>{
  const from=i?path[i-1]:start;
  return sum+Math.hypot(p.x-from.x,p.z-from.z);
},0);
/** Unique station + reachable real paths. No teleporting or phantom surface. */
export function chooseKitchenPlan(world,from,stoveId){
  const fridge=furnitureActionApproach(world,'fridge');
  const stove=resolveActionFurniture(world,'cook',stoveId);
  const hob=furnitureActionApproach(world,'cook',stoveId);
  if(!fridge||!stove||!hob||!from||!findPath(from,fridge,world))return null;
  let best=null;
  for(const counter of world?.furniture?.instances??[]){
    if(counter.prefabId!=='prep'||counter.location!=='home')continue;
    const prep=furnitureActionApproach(world,'prep',counter.instanceId);
    const toPrep=prep&&findPath(fridge,prep,world);
    const toStove=prep&&findPath(prep,hob,world);
    if(!toPrep||!toStove)continue;
    const cost=routeLength(fridge,toPrep)+routeLength(prep,toStove);
    if(!best||cost<best.cost-1e-5||
      (Math.abs(cost-best.cost)<1e-5&&counter.instanceId<best.prepInstanceId))
      best={prepInstanceId:counter.instanceId,cost};
  }
  return best;
}
export function cookingSourceValid(world,action){
  if(action?.id!=='cook'||!kitchenRecipe(action.recipeId))return false;
  return Boolean(resolveActionFurniture(world,'cook',action.targetInstanceId)&&
    resolveActionFurniture(world,'prep',action.prepInstanceId)&&
    furnitureActionApproach(world,'fridge'));
}
