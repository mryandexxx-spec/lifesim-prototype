/** GRILL-R1: original food content, not interchangeable with stove recipes. */
const entry=(id,label,requires,minLevel,cookMinutes,portions,hungerFactor,color)=>
  Object.freeze({id,label,requires:Object.freeze(requires),minLevel,cookMinutes,
    portions,hungerFactor,color});
export const GRILL_RECIPES=Object.freeze({
  'grill.vegetables':entry('grill.vegetables','Овощи на решётке',{vegetables:2},0,30,3,1.14,'#9bb36c'),
  'grill.chicken':entry('grill.chicken','Куриные шашлычки',{chicken:2,vegetables:1},2,36,3,1.25,'#d9b16b'),
  'grill.steak':entry('grill.steak','Стейки на углях',{meat:2},4,42,2,1.39,'#995b42'),
  'grill.shashlik':entry('grill.shashlik','Мясной шашлык с травами',{meat:2,vegetables:1,herbs:1},6,46,3,1.40,'#bd794c'),
  'grill.platter':entry('grill.platter','Ассорти на углях',{meat:2,chicken:1,vegetables:2},8,50,4,1.43,'#b98360')
});
export const grillRecipe=id=>typeof id==='string'&&Object.hasOwn(GRILL_RECIPES,id)
  ?GRILL_RECIPES[id]:null;
