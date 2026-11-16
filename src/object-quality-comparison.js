/** F4b7 — compare actual purchasable variants of one physical prefab.
 * Read-only, registry-backed: same prefab is the only comparable scope.
 * No inferred quality star, fake boost, passive bonus or persisted state.
 */
import {getObjectItem} from './object-definition-registry.js';
import {describeObjectQualities} from './object-quality-presentation.js';

const measureKey=e=>[e.statId,e.trigger,e.mode,e.actionId??''].join(':');
const formatNumber=n=>String(Number(n.toFixed(3))).replace('.',',');
const comparablePrice=n=>Number.isSafeInteger(n)&&n>=0;

function difference(registry,other,selected){
  const otherMeasures=new Map(other.effects.map(e=>[measureKey(e),e]));
  const selectedMeasures=new Map(selected.effects.map(e=>[measureKey(e),e]));
  const deltas=[];
  for(const [key,e] of otherMeasures){
    const old=selectedMeasures.get(key);
    const shift=e.amount-(old?.amount??0);
    if(Math.abs(shift)>1e-9){
      const label=registry.stats[e.statId]?.label||e.statId;
      const period=e.mode==='perMinute'?'/мин':'';
      const when=e.trigger==='item.use.tick'?' при использовании':'';
      deltas.push(Object.freeze({
        statId:e.statId,delta:Number(shift.toFixed(6)),
        label:label+' '+(shift>0?'+':'')+formatNumber(shift)+period+when
      }));
    }
  }
  for(const [key,e] of selectedMeasures){
    if(otherMeasures.has(key))continue;
    const shift=-e.amount;
    if(!shift)continue;
    const label=registry.stats[e.statId]?.label||e.statId;
    const period=e.mode==='perMinute'?'/мин':'';
    const when=e.trigger==='item.use.tick'?' при использовании':'';
    deltas.push(Object.freeze({
      statId:e.statId,delta:Number(shift.toFixed(6)),
      label:label+' '+(shift>0?'+':'')+formatNumber(shift)+period+when
    }));
  }
  // Compare only authored numeric quality dimensions; no implicit zeros.
  const ratingDeltas=[];
  for(const [id,otherValue] of Object.entries(other.ratings)){
    if(!Object.hasOwn(selected.ratings,id))continue;
    const shift=otherValue-selected.ratings[id];
    if(shift)ratingDeltas.push(Object.freeze({
      id,delta:shift,label:(registry.attributes[id]?.label||id)+
        ': '+(shift>0?'+':'')+formatNumber(shift)
    }));
  }
  return {deltas:Object.freeze(deltas),ratingDeltas:Object.freeze(ratingDeltas)};
}

/** Alternatives for a currently offered selected SKU; never cross prefab IDs.
 * All displayed price deltas reflect offers, not hidden quality multipliers.
 */
export function compareShopVariants(registry,offers,selectedItemId){
  if(!Array.isArray(offers)||offers.length>1024)return Object.freeze([]);
  const chosenOffer=offers.find(x=>x?.itemId===selectedItemId);
  const chosen=getObjectItem(registry,selectedItemId);
  if(!chosenOffer||!chosen||chosen.prefabId!==chosenOffer.prefabId||
    !comparablePrice(chosenOffer.price))return Object.freeze([]);
  const result=[];
  const seen=new Set([selectedItemId]);
  for(const offer of offers){
    if(!offer||seen.has(offer.itemId)||offer.prefabId!==chosen.prefabId||
      !comparablePrice(offer.price))continue;
    const item=getObjectItem(registry,offer.itemId);
    if(!item||item.prefabId!==chosen.prefabId)continue;
    seen.add(item.id);
    const {deltas,ratingDeltas}=difference(registry,item,chosen);
    const priceDifference=offer.price-chosenOffer.price;
    const appearanceDifferent=item.appearanceId!==chosen.appearanceId;
    const view=describeObjectQualities(registry,item.id);
    result.push(Object.freeze({
      itemId:item.id,name:item.name,price:offer.price,
      priceDifference,appearanceDifferent,
      effectDeltas:deltas,ratingDeltas,
      hasMeasuredQuality:view?.hasMeasuredQuality===true
    }));
  }
  return Object.freeze(result);
}

export function formatShopVariantComparison(row){
  if(!row)return '';
  const price=row.priceDifference===0?'та же цена':
    row.priceDifference>0?'дороже на '+row.priceDifference+' кр.':
      'дешевле на '+(-row.priceDifference)+' кр.';
  const measures=[...row.effectDeltas.map(x=>x.label),
    ...row.ratingDeltas.map(x=>x.label)];
  const pieces=[row.name+' · '+price];
  if(measures.length)pieces.push(measures.join(' · '));
  if(row.appearanceDifferent)pieces.push('отличается оформление');
  if(measures.length===0&&!row.appearanceDifferent)pieces.push('характеристики не отличаются');
  return pieces.join(' · ');
}
