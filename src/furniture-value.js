/** F4a: read-only, truthful furniture value descriptions for the shop.
 * Display metadata only: no balance modifiers, hidden buffs or save fields.
 * Gameplay remains owned by the existing action and social simulation modules.
 */
import {FURNITURE_CATALOG} from './furniture-catalog.js';
import {ACTIONS} from './simulation.js';

const needLabels=Object.freeze({
  energy:'энергия',fun:'досуг',hunger:'сытость',
  hygiene:'гигиена',bladder:'туалет'
});
const shortActions=Object.freeze({
  bed:'Сон',sofa:'Отдых',tv:'Просмотр ТВ',
  fridge:'Перекус',shower:'Душ',toilet:'Туалет'
});
const passiveLabels=Object.freeze({
  plant:'Украшение комнаты',
  table:'Столик для встреч',
  nightstand:'Прикроватный декор',
  counter:'Рабочая поверхность',
  bookcase:'Чтение → досуг и литературная эрудиция',
  armchair:'Кресло для обстановки · посадка появится позже',
  chair:'Стул для обстановки · посадка появится позже',
  diningtable:'Обеденная поверхность · без новой команды еды',
  floorlamp:'Декоративное освещение · без изменения потребностей',
  rug:'Ковёр для интерьера · по нему можно ходить',
  dresser:'Декоративный комод',wardrobe:'Декоративный гардероб',
  mirror:'Зеркало для интерьера',sculpture:'Украшение дома'
});

/** Returns actual action need or an honest non-numeric utility description.
 * A sofa's Energy-decay pause while seated is part of action runtime, not
 * a permanent bonus on owning a sofa or a fake quality tier.
 */
export function describeFurnitureValue(prefabId){
  if(!Object.hasOwn(FURNITURE_CATALOG,prefabId))return null;
  const item=FURNITURE_CATALOG[prefabId];
  const action=item.actionId?ACTIONS[item.actionId]:null;
  if(action){
    return {kind:'action',need:action.need,
      effectText:(shortActions[item.actionId]||action.label)+' → '+(needLabels[action.need]||action.need)};
  }
  const surface=item.capabilities.includes('surface');
  return {kind:surface?'surface':'decor',need:null,
    effectText:passiveLabels[prefabId]||(surface?'Поверхность':'Декор без прямого бонуса')};
}
