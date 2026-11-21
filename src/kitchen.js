/** F4G original kitchen rules. PlayCanvas-free; all content data and v1-safe storage.
 * C3b removes the free daily starter pantry replenishment.
 */
import {resolveActionFurniture,furnitureActionApproach} from './furniture-catalog.js';
import {findPath} from './navigation.js';
import {readyMeal} from './ready-meal-catalog.js';

export const KITCHEN_SCHEMA=1;
export const KITCHEN_PREPARED_LIMIT=12;
// Domain-side autonomous care threshold; presentation remains dependency-free.
export const DISH_AUTO_WASH_THRESHOLD=6;
export const COOKING_SKILL_ID='cooking';
export const FRESH_MEAL_HUNGER_THRESHOLD=55;
export const PANTRY_START=Object.freeze({vegetables:8,grains:8,dairy:8});
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
  'cook.gratin':recipe('cook.gratin','Сливочная запеканка',{vegetables:2,dairy:2},4,37,4,1.32,'#ddad6f')
});
const entries=Object.values(KITCHEN_RECIPES);
const own=(obj,key)=>Object.hasOwn(obj||{},key);
const finiteInt=n=>Number.isSafeInteger(n)&&n>=0;
export const kitchenRecipe=id=>typeof id==='string'
  ?(own(KITCHEN_RECIPES,id)?KITCHEN_RECIPES[id]:readyMeal(id)):null;
export function newKitchen(){
  return {schema:KITCHEN_SCHEMA,pantry:{...PANTRY_START,herbs:0},prepared:[],
    deliveries:[],dirtyDishes:0,lastPantryDay:0};
}
export function restoreKitchen(raw){
  const state=newKitchen();
  if(!raw||raw.schema!==KITCHEN_SCHEMA||typeof raw!=='object')return state;
  if(raw.pantry&&Object.keys(PANTRY_START).every(id=>
    finiteInt(raw.pantry[id])&&raw.pantry[id]<=30))
    state.pantry={...Object.fromEntries(Object.keys(PANTRY_START).map(id=>[id,raw.pantry[id]])),
      herbs:finiteInt(raw.pantry.herbs)&&raw.pantry.herbs<=KITCHEN_HERB_LIMIT?raw.pantry.herbs:0};
  if(Array.isArray(raw.prepared)&&raw.prepared.length<=12){
    const combined=new Map();
    for(const entry of raw.prepared){
      if(!kitchenRecipe(entry?.recipeId)||!finiteInt(entry.portions)||entry.portions>12)
        continue;
      combined.set(entry.recipeId,Math.min(12,
        (combined.get(entry.recipeId)||0)+entry.portions));
    }
    state.prepared=[...combined].map(([recipeId,portions])=>({recipeId,portions}))
      .filter(x=>x.portions>0);
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
  const previous=kitchen.prepared.find(x=>x.recipeId===recipeId);
  if(previous)previous.portions+=recipe.portions;
  else kitchen.prepared.push({recipeId,portions:recipe.portions});
  return true;
}
/** Fridge inventory: data-only rows shared by UI, selection and autonomous eating. */
export function preparedKitchenMeals(kitchen){
  return Array.isArray(kitchen?.prepared)?kitchen.prepared
    .filter(item=>kitchenRecipe(item?.recipeId)&&finiteInt(item.portions)&&item.portions>0)
    .map(item=>({recipeId:item.recipeId,label:kitchenRecipe(item.recipeId).label,
      portions:item.portions,color:kitchenRecipe(item.recipeId).color})):[];
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
/** Only a confirmed eater at a valid chair consumes one chosen saved portion. */
export function takeKitchenServing(kitchen,requestedRecipeId=null){
  if(!Array.isArray(kitchen?.prepared))return null;
  if(requestedRecipeId!==null&&!kitchenRecipe(requestedRecipeId))return null;
  const entry=kitchen.prepared.find(x=>x.portions>0&&kitchenRecipe(x.recipeId)&&
    (requestedRecipeId===null||x.recipeId===requestedRecipeId));
  if(!entry)return null;
  entry.portions--;
  const id=entry.recipeId;
  kitchen.prepared=kitchen.prepared.filter(x=>x.portions>0);
  return id;
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
