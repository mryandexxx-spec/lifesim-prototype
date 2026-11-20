/** UX-04: presentation-only lot palette / quote summary.
 * Domain proposals remain the only authority for pricing and safe placement.
 * No DOM, state, clock, A* or save schema changes. */
import {OUTDOOR_GROUND_PRICE} from './lot-surface.js';
import {OUTDOOR_CATALOG} from './outdoor-catalog.js';

export const OUTDOOR_PALETTE=Object.freeze([
  Object.freeze({id:'ground',label:'▦ Покрытия'}),
  Object.freeze({id:'plants',label:'🌳 Растения'}),
  Object.freeze({id:'garden',label:'🌱 Грядки'}),
  Object.freeze({id:'objects',label:'🪑 Мебель и свет'}),
  Object.freeze({id:'pool',label:'🏊 Бассейн'})
]);
export const OUTDOOR_GROUND_LABELS=Object.freeze({
  lawn:'Газон',stone:'Каменная дорожка',gravel:'Гравий',
  soil:'Грунт',flowers:'Декоративный цветник'
});
const size=n=>Number(n.toFixed(2)).toLocaleString('ru-RU');
export function describeOutdoorSelection({category='ground',groundKind='lawn',
  itemId='',operation='place',proposal=null,
  poolTool='paint',poolOperation='fixture-add'}={}){
  if(category==='pool'){
    const names={paint:'Добавить воду',erase:'Убрать воду',
      ladder:'Лестница',steps:'Ступени',board:'Низкий трамплин'};
    const name=names[poolTool]||'Бассейн';
    const action=poolTool==='paint'||poolTool==='erase'?name:
      poolOperation==='fixture-remove'?'Продать оборудование':
        poolOperation==='fixture-move'?'Переместить оборудование':name;
    if(proposal?.ok&&Number.isFinite(proposal.cost))
      return action+' · '+size(proposal.areaSquareMetres)+' м² · '+
        (proposal.cost<0?'возврат '+(-proposal.cost):'стоимость '+proposal.cost)+
        ' кр. к подтверждению';
    return action+' · сетка 0,5 м · '+(
      poolTool==='paint'||poolTool==='erase'?'выдели водные клетки':'коснись бортика');
  }
  if(category==='ground'){
    const name=OUTDOOR_GROUND_LABELS[groundKind]||'Покрытие';
    const unit=OUTDOOR_GROUND_PRICE[groundKind]??0;
    if(proposal?.ok&&Number.isFinite(proposal.changedCells)){
      return name+' · '+proposal.changedCells+' кл. · '+
        size(proposal.changedCells*.25)+' м² · '+proposal.cost+' кр. к подтверждению';
    }
    return name+' · '+unit+' кр./клетка · 0,25 м²/клетка · выдели область';
  }
  const def=OUTDOOR_CATALOG[itemId];
  const name=def?.name||'Выбери объект';
  if(operation==='sell')
    return proposal?.ok?name+' · возврат '+(-proposal.cost)+' кр. · подтверди':
      name+' · выбери установленный предмет для продажи';
  if(operation==='move')
    return proposal?.ok?name+' · перенос 0 кр. · подтверди':
      name+' · перенос бесплатно · выбери новое место';
  const footprint=def?size(def.width*def.depth)+' м²':'—';
  return proposal?.ok?name+' · площадь '+footprint+' · '+proposal.cost+
      ' кр. к подтверждению':
    name+' · '+(def?.price??'—')+' кр. · площадь '+footprint+' · выбери место';
}
