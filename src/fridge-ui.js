/** FRIDGE-UX-R2: read-only adapter for the existing kitchen and wallet.
 * No DOM, commands, inventory changes or persistence. */
import {preparedKitchenMeals,KITCHEN_PREPARED_LIMIT,KITCHEN_HERB_LIMIT,
  KITCHEN_RECIPES,canCookRecipe} from './kitchen.js';
import {quoteReadyMeal} from './ready-food.js';
import {READY_MEAL_IDS,readyMeal} from './ready-meal-catalog.js';
import {KITCHEN_RESTOCK_LABELS,KITCHEN_RESTOCK_PRICE,
  KITCHEN_RESTOCK_MAX,quoteKitchenRestock,ingredientPack} from './kitchen-market.js';

export const FRIDGE_TABS=Object.freeze(['eat','stock','buy']);
export const fridgeTab=value=>FRIDGE_TABS.includes(value)?value:'eat';
const safe=n=>Number.isSafeInteger(n)&&n>=0?n:0;
const reasons={
  'pantry-full':'Нет места для +5',
  'storage-full':'Холодильник заполнен',
  'insufficient-credits':'Недостаточно кредитов',
  'missing-fridge':'Нет доступного холодильника',
  'invalid-pantry':'Проверь содержимое холодильника',
  'invalid-wallet':'Кошелёк временно недоступен',
  'invalid-kitchen':'Запасы временно недоступны'
};
export function fridgeViewModel(root,skillLevel=0){
  const kitchen=root?.kitchen;
  const meals=preparedKitchenMeals(kitchen).map(meal=>({...meal}));
  const stored=meals.reduce((sum,meal)=>sum+meal.portions,0);
  const reserved=Array.isArray(kitchen?.deliveries)?kitchen.deliveries.length:0;
  const capacity=KITCHEN_PREPARED_LIMIT;
  const level=Number.isFinite(skillLevel)?Math.max(0,skillLevel):0;
  const recipes=Object.values(KITCHEN_RECIPES).map(recipe=>{
    const available=canCookRecipe(kitchen,recipe.id,level);
    const missing=Object.entries(recipe.requires).filter(([id,n])=>
      safe(kitchen?.pantry?.[id])<n).map(([id,n])=>id+' ×'+n);
    return {id:recipe.id,label:recipe.label,portions:recipe.portions,
      available,requires:recipe.requires,
      reason:available?'Доступно':
        level<recipe.minLevel?'Нужен уровень '+recipe.minLevel:
        stored+reserved+recipe.portions>capacity?'Недостаточно места для '+recipe.portions+' порций':
        missing.length?'Не хватает продуктов':'Рецепт недоступен'};
  });
  const ready=READY_MEAL_IDS.map(id=>{
    const meal=readyMeal(id),quote=quoteReadyMeal(root,id,'fridge');
    return {id,label:meal.label,price:meal.fridgePrice,
      available:quote.ok,reason:quote.ok?'Доступно':
        reasons[quote.reason]||'Покупка недоступна'};
  });
  const staples=Object.entries(KITCHEN_RESTOCK_LABELS).map(([id,label])=>{
    const quote=quoteKitchenRestock(root,id);
    const pack=ingredientPack(id);
    return {id,label,current:safe(kitchen?.pantry?.[id]),max:KITCHEN_RESTOCK_MAX,
      price:pack.price,units:pack.units,available:quote.ok,
      reason:quote.ok?'Доступно':reasons[quote.reason]||'Покупка недоступна'};
  });
  return {
    tabs:FRIDGE_TABS,meals,recipes,ready,staples,
    stored,reserved,capacity,remaining:Math.max(0,capacity-stored-reserved),
    pantry:{vegetables:safe(kitchen?.pantry?.vegetables),
      grains:safe(kitchen?.pantry?.grains),dairy:safe(kitchen?.pantry?.dairy),
      meat:safe(kitchen?.pantry?.meat),chicken:safe(kitchen?.pantry?.chicken),
      herbs:safe(kitchen?.pantry?.herbs),herbsMax:KITCHEN_HERB_LIMIT},
    dirtyDishes:safe(kitchen?.dirtyDishes),
    credits:safe(root?.shop?.credits)
  };
}
