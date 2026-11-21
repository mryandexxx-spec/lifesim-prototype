/** FOOD-R1: original ready-to-eat dishes; no cooking skill rewards. */
const meal=(id,label,fridgePrice,deliveryPrice,hungerFactor,color)=>
  Object.freeze({id,label,fridgePrice,deliveryPrice,hungerFactor,color});
export const READY_MEALS=Object.freeze({
  'ready.sunny-grains':meal('ready.sunny-grains','Солнечная крупяная миска',18,29,.96,'#e8bc6c'),
  'ready.garden-wrap':meal('ready.garden-wrap','Садовый овощной рулет',24,38,1.08,'#81bc85'),
  'ready.gold-roast':meal('ready.gold-roast','Золотистое жаркое',30,46,1.18,'#cf9466')
});
export const READY_MEAL_IDS=Object.freeze(Object.keys(READY_MEALS));
export const readyMeal=id=>typeof id==='string'&&Object.hasOwn(READY_MEALS,id)
  ?READY_MEALS[id]:null;
