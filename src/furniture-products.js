/** F4b2 — canonical, UI/renderer-agnostic purchasable product data.
 * Product/SKU ID remains stable even when several products share one prefab.
 * New content lives here rather than in financial transactions or PlayCanvas.
 */
const offered=[
  {itemId:'legacy.plant',prefabId:'plant',price:130},
  {itemId:'legacy.table',prefabId:'table',price:250},
  {itemId:'legacy.nightstand',prefabId:'nightstand',price:170},
  {itemId:'legacy.tv',prefabId:'tv',price:650},
  {itemId:'legacy.sofa',prefabId:'sofa',price:550},
  {itemId:'legacy.bed',prefabId:'bed',price:850},
  // H1: first functional leisure station. Pilot price only; economy TBD.
  {itemId:'bookcase.starter',prefabId:'bookcase',price:320,
    name:'Шкаф с историями',description:'Чтение повышает досуг и литературную эрудицию'},
  // H2: physical listening station; sound always requires a direct user gesture.
  {itemId:'music.starter',prefabId:'music',price:390,
    name:'Музыкальный центр «Волна»',
    description:'Три стиля музыки · досуг без опыта игры на инструментах'},
  // Pilot of physical appearance only. No quality/buff, price differential or XP.
  {itemId:'plant.amber',prefabId:'plant',price:130,
    name:'Растение «Янтарные листья»',appearanceId:'foliage.amber',
    modelKey:'plant.amber',typeCategoryId:'type.decor.plants',
    description:'Янтарная листва · украшение без дополнительного бонуса'},
  // F4b4 trial: healing only while actively resting on THIS SKU.
  {itemId:'sofa.comfort',prefabId:'sofa',price:700,
    name:'Диван «Комфорт»',appearanceId:'upholstery.sage',
    modelKey:'sofa.tufted',typeCategoryId:'type.seating.sofas',
    description:'Отдых → досуг и +0,2 энергии за игровую минуту',
    effects:[{id:'rest.energy',trigger:'item.use.tick',actionId:'sofa',
      statId:'needs.energy',mode:'perMinute',amount:0.2,
      stacking:'highest',group:'comfort.rest.energy'}]},
  // F4C: broad Build/Buy collection. Prices are continuity-preserving
  // playtest tokens, NOT jobs, wages, rarity multipliers or a final economy.
  // All sculptural variants have unique modelKey, independent of SKU/prefab.
  {itemId:'sofa.loft',prefabId:'sofa',price:620,name:'Диван «Лофт»',
    typeCategoryId:'type.seating.sofas',modelKey:'sofa.loft',
    description:'Низкий прямой силуэт, открытые опоры · отдых'},
  {itemId:'sofa.classic',prefabId:'sofa',price:640,name:'Диван «Классика»',
    typeCategoryId:'type.seating.sofas',modelKey:'sofa.classic',
    description:'Высокая фигурная спинка и круглые подлокотники · отдых'},
  {itemId:'bed.platform',prefabId:'bed',price:930,name:'Кровать «Платформа»',
    typeCategoryId:'type.sleep.beds',modelKey:'bed.platform',
    description:'Низкий деревянный каркас и широкое изголовье · сон'},
  {itemId:'bed.canopy',prefabId:'bed',price:1100,name:'Кровать «Балдахин»',
    typeCategoryId:'type.sleep.beds',modelKey:'bed.canopy',
    description:'Четыре стойки и лёгкий верхний каркас · сон'},
  {itemId:'table.round',prefabId:'table',price:290,name:'Столик «Круг»',
    typeCategoryId:'type.tables.coffee',modelKey:'table.round',
    description:'Круглая столешница на одной опоре · поверхность'},
  {itemId:'bookcase.open',prefabId:'bookcase',price:360,name:'Стеллаж «Воздух»',
    typeCategoryId:'type.storage.books',modelKey:'bookcase.open',
    description:'Асимметричные открытые ячейки · чтение книг'},
  {itemId:'plant.palm',prefabId:'plant',price:150,name:'Пальма «Оазис»',
    typeCategoryId:'type.decor.plants',modelKey:'plant.palm',
    description:'Высокий ствол и отдельные пальмовые листья · декор'},
  {itemId:'nightstand.open',prefabId:'nightstand',price:180,name:'Тумба «Открытая»',
    typeCategoryId:'type.storage.dressers',modelKey:'nightstand.open',
    description:'Открытая ниша и стройные ножки · декор'},
  // Nine new independent geometry types (two actually different forms each).
  // F4D: all four new seating variants share real seat anchors and an
  // instance-based sit/stand action. Pure decoration remains non-interactive.
  {itemId:'armchair.wing',prefabId:'armchair',price:400,name:'Кресло «Крыло»',
    typeCategoryId:'type.seating.armchairs',modelKey:'armchair.wing',
    description:'Высокая крылатая спинка · можно сесть'},
  {itemId:'armchair.shell',prefabId:'armchair',price:430,name:'Кресло «Ракушка»',
    typeCategoryId:'type.seating.armchairs',modelKey:'armchair.shell',
    description:'Округлая спинка и чашеобразная посадка · можно сесть'},
  {itemId:'chair.loft',prefabId:'chair',price:110,name:'Стул «Лофт»',
    typeCategoryId:'type.seating.chairs',modelKey:'chair.loft',
    description:'Тонкие опоры и прямая спинка · можно сесть'},
  {itemId:'chair.cross',prefabId:'chair',price:125,name:'Стул «Перекрестье»',
    typeCategoryId:'type.seating.chairs',modelKey:'chair.cross',
    description:'Перекрещённые рейки спинки · можно сесть'},
  {itemId:'diningtable.farm',prefabId:'diningtable',price:420,name:'Стол «Ферма»',
    typeCategoryId:'type.tables.dining',modelKey:'diningtable.farm',
    description:'Прямоугольный стол на массивных опорах · поверхность'},
  {itemId:'diningtable.oval',prefabId:'diningtable',price:470,name:'Стол «Овал»',
    typeCategoryId:'type.tables.dining',modelKey:'diningtable.oval',
    description:'Овальная столешница с центральным основанием · поверхность'},
  {itemId:'floorlamp.arc',prefabId:'floorlamp',price:195,name:'Торшер «Арка»',
    typeCategoryId:'type.lighting.floor',modelKey:'floorlamp.arc',
    description:'Изогнутая стойка и плафон · включает и выключает настоящий свет'},
  {itemId:'floorlamp.tripod',prefabId:'floorlamp',price:210,name:'Торшер «Тренога»',
    typeCategoryId:'type.lighting.floor',modelKey:'floorlamp.tripod',
    description:'Три опоры и тканевый абажур · включаемое освещение'},
  {itemId:'rug.geo',prefabId:'rug',price:145,name:'Ковёр «Геометрия»',
    typeCategoryId:'type.decor.rugs',modelKey:'rug.geo',
    description:'Плоский ковёр с крупным геометрическим узором · проходной'},
  {itemId:'rug.weave',prefabId:'rug',price:160,name:'Ковёр «Плетение»',
    typeCategoryId:'type.decor.rugs',modelKey:'rug.weave',
    description:'Тканый узор с кисточками · не перекрывает путь'},
  {itemId:'dresser.reed',prefabId:'dresser',price:305,name:'Комод «Рея»',
    typeCategoryId:'type.storage.dressers',modelKey:'dresser.reed',
    description:'Три выдвигаемых ящика · можно осмотреть содержимое'},
  {itemId:'dresser.arch',prefabId:'dresser',price:340,name:'Комод «Арка»',
    typeCategoryId:'type.storage.dressers',modelKey:'dresser.arch',
    description:'Арочные дверцы и нижняя полка · можно открывать'},
  {itemId:'mirror.oval',prefabId:'mirror',price:135,name:'Зеркало «Овал»',
    typeCategoryId:'type.decor.mirrors',modelKey:'mirror.oval',
    description:'Овальная отражающая поверхность · можно причесаться'},
  {itemId:'mirror.panel',prefabId:'mirror',price:165,name:'Зеркало «Панель»',
    typeCategoryId:'type.decor.mirrors',modelKey:'mirror.panel',
    description:'Высокое напольное зеркало · можно причесаться'},
  {itemId:'sculpture.balance',prefabId:'sculpture',price:185,name:'Скульптура «Баланс»',
    typeCategoryId:'type.decor.art',modelKey:'sculpture.balance',
    description:'Сфера и асимметричная опора на пьедестале · декор'},
  {itemId:'sculpture.spire',prefabId:'sculpture',price:210,name:'Скульптура «Парус»',
    typeCategoryId:'type.decor.art',modelKey:'sculpture.spire',
    description:'Высокие пересекающиеся пластины на подставке · декор'},
  {itemId:'wardrobe.classic',prefabId:'wardrobe',price:510,name:'Шкаф «Классика»',
    typeCategoryId:'type.storage.wardrobes',modelKey:'wardrobe.classic',
    description:'Двухдверный шкаф · можно разобрать гардероб'},
  {itemId:'wardrobe.open',prefabId:'wardrobe',price:540,name:'Гардероб «Открытый»',
    typeCategoryId:'type.storage.wardrobes',modelKey:'wardrobe.open',
    description:'Открытые полки с одеждой · можно разобрать гардероб'}
];
export const FURNITURE_PRODUCTS=Object.freeze(offered.map(x=>Object.freeze({...x,
  ...(x.effects?{effects:Object.freeze(x.effects.map(e=>Object.freeze({...e})))}:{})})));
export const FURNITURE_PRODUCT_BY_ID=Object.freeze(
  Object.fromEntries(FURNITURE_PRODUCTS.map(x=>[x.itemId,x])));
if(Object.keys(FURNITURE_PRODUCT_BY_ID).length!==FURNITURE_PRODUCTS.length)
  throw new Error('Duplicate authored furniture product IDs');
export const FURNITURE_LEGACY_OFFERS=Object.freeze(FURNITURE_PRODUCTS.filter(x=>
  x.itemId==='legacy.'+x.prefabId));
/** Renderer only: optional per-part material overrides for a known appearance.
 * New colorways reference a named palette; unknown style is no-op.
 */
export const FURNITURE_APPEARANCES=Object.freeze({
  'upholstery.sage':Object.freeze({
    'sofa seat':'#748f7c', 'sofa back':'#486f5b',
    'sofa arm left':'#486f5b', 'sofa arm right':'#486f5b',
    'sofa pillow left':'#d1d0b6', 'sofa pillow right':'#acc4aa'
  }),
  'foliage.amber':Object.freeze({
    'leaf crown':'#bd8940',
    'plant leaf':'#d6a45d'
  })
});
export function furnitureProduct(itemDefinitionId){
  return typeof itemDefinitionId==='string'&&
    Object.hasOwn(FURNITURE_PRODUCT_BY_ID,itemDefinitionId)
    ?FURNITURE_PRODUCT_BY_ID[itemDefinitionId]:null;
}
/** Missing v1 SKU resolves to a known legacy shape; mismatch never crosses
 * prefab types. Old saves omit the field and remain byte-shape compatible.
 */
export function compatibleFurnitureProduct(prefabId,itemDefinitionId){
  const product=furnitureProduct(itemDefinitionId);
  return product?.prefabId===prefabId?product:null;
}
export function legacyProductId(prefabId){return 'legacy.'+prefabId;}

/** Semantic type tree independent from PlayCanvas and furniture actions.
 * This describes discoverability, not guaranteed interactions.
 */
export const FURNITURE_SHOP_TYPES=Object.freeze([
  {id:'type.seating',label:'Сиденья',icon:'🛋'},
  {id:'type.seating.sofas',label:'Диваны',parentId:'type.seating'},
  {id:'type.seating.armchairs',label:'Кресла',parentId:'type.seating'},
  {id:'type.seating.chairs',label:'Стулья',parentId:'type.seating'},
  {id:'type.sleep',label:'Спальня',icon:'🛏'},
  {id:'type.sleep.beds',label:'Кровати',parentId:'type.sleep'},
  {id:'type.tables',label:'Столы',icon:'▤'},
  {id:'type.tables.coffee',label:'Журнальные',parentId:'type.tables'},
  {id:'type.tables.dining',label:'Обеденные',parentId:'type.tables'},
  {id:'type.storage',label:'Хранение',icon:'▥'},
  {id:'type.storage.books',label:'Книжные',parentId:'type.storage'},
  {id:'type.storage.dressers',label:'Комоды и тумбы',parentId:'type.storage'},
  {id:'type.storage.wardrobes',label:'Шкафы',parentId:'type.storage'},
  {id:'type.lighting',label:'Свет',icon:'☀'},
  {id:'type.lighting.floor',label:'Торшеры',parentId:'type.lighting'},
  {id:'type.decor',label:'Декор',icon:'✿'},
  {id:'type.decor.plants',label:'Растения',parentId:'type.decor'},
  {id:'type.decor.rugs',label:'Ковры',parentId:'type.decor'},
  {id:'type.decor.mirrors',label:'Зеркала',parentId:'type.decor'},
  {id:'type.decor.art',label:'Скульптуры',parentId:'type.decor'},
  {id:'type.electronics',label:'Техника',icon:'▣'},
  {id:'type.electronics.tv',label:'Телевизоры',parentId:'type.electronics'},
  {id:'type.electronics.music',label:'Музыкальные центры',parentId:'type.electronics'}
].map(x=>Object.freeze({...x})));
export const FURNITURE_TYPE_BY_PREFAB=Object.freeze({
  sofa:'type.seating.sofas',bed:'type.sleep.beds',chair:'type.seating.chairs',
  armchair:'type.seating.armchairs',table:'type.tables.coffee',
  diningtable:'type.tables.dining',nightstand:'type.storage.dressers',
  dresser:'type.storage.dressers',wardrobe:'type.storage.wardrobes',
  bookcase:'type.storage.books',plant:'type.decor.plants',
  rug:'type.decor.rugs',mirror:'type.decor.mirrors',
  sculpture:'type.decor.art',floorlamp:'type.lighting.floor',
  tv:'type.electronics.tv',music:'type.electronics.music'
});
export const PROCEDURAL_NEW_PREFABS=Object.freeze([
  'armchair','chair','diningtable','floorlamp','rug',
  'dresser','mirror','sculpture','wardrobe'
]);
export const PROCEDURAL_DEFAULT_SKU=Object.freeze(Object.fromEntries(
  PROCEDURAL_NEW_PREFABS.map(prefabId=>[
    prefabId,FURNITURE_PRODUCTS.find(item=>item.prefabId===prefabId)?.itemId
  ])
));
