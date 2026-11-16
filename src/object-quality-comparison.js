/** F4b7 — compare actual purchasable variants of one physical prefab.
 * Read-only, registry-backed: same prefab is the only comparable scope.
 * No inferred quality star, fake boost, passive bonus or persisted state.
 */
import {getObjectItem} from './object-definition-registry.js';
import {describeObjectQualities} from './object-quality-presentation.js';

// Only comparable gameplay facts can be subtracted: stat, timing and action.
// Effect stacking/group are independent policy, NEVER silently equate them.
const measureKey=e=>JSON.stringify([e.statId,e.trigger,e.mode,e.actionId??null]);
const policyKey=e=>JSON.stringify([e.stacking,e.group]);
const formatNumber=n=>String(Number(n.toFixed(3))).replace('.',',');
const comparablePrice=n=>Number.isSafeInteger(n)&&n>=0;

/** An effect is comparable iff each SKU has at most one declaration for
 * the same stat/trigger/mode/action, and (when both exist) their stacking and
 * group policy match. Otherwise a numeric subtraction would be invented.
 */
function difference(registry,other,selected){
  const group=effects=>{
    const by=new Map();
    for(const effect of effects){
      const key=measureKey(effect);
      if(!by.has(key))by.set(key,[]);
      by.get(key).push(effect);
    }
    return by;
  };
  const otherMeasures=group(other.effects),selectedMeasures=group(selected.effects);
  const keys=[...new Set([...otherMeasures.keys(),...selectedMeasures.keys()])].sort();
  const deltas=[];
  let effectConditionsDifferent=false;
  for(const key of keys){
    const theirs=otherMeasures.get(key)||[],ours=selectedMeasures.get(key)||[];
    // Two potential contributions need their own stacking resolver, not a
    // last-write-wins Map or a fictional 'gain' from a different rule.
    if(theirs.length>1||ours.length>1||
      (theirs.length&&ours.length&&policyKey(theirs[0])!==policyKey(ours[0]))){
      effectConditionsDifferent=true;continue;
    }
    const otherEffect=theirs[0],selectedEffect=ours[0];
    if(!otherEffect&&!selectedEffect)continue;
    const shift=(otherEffect?.amount??0)-(selectedEffect?.amount??0);
    if(Math.abs(shift)<=1e-9)continue;
    const effect=otherEffect||selectedEffect;
    const label=registry.stats[effect.statId]?.label||effect.statId;
    const period=effect.mode==='perMinute'?'/мин':'';
    const when=effect.trigger==='item.use.tick'?' при использовании':
      effect.trigger==='item.use.complete'?' после завершения':'';
    deltas.push(Object.freeze({
      statId:effect.statId,delta:Number(shift.toFixed(6)),
      label:label+' '+(shift>0?'+':'')+formatNumber(shift)+period+when
    }));
  }
  const ratingDeltas=[];
  for(const [id,value] of Object.entries(other.ratings)){
    if(!Object.hasOwn(selected.ratings,id))continue;
    const shift=value-selected.ratings[id];
    if(shift)ratingDeltas.push(Object.freeze({
      id,delta:shift,label:(registry.attributes[id]?.label||id)+
        ': '+(shift>0?'+':'')+formatNumber(shift)
    }));
  }
  return {deltas:Object.freeze(deltas),ratingDeltas:Object.freeze(ratingDeltas),
    effectConditionsDifferent};
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
    const {deltas,ratingDeltas,effectConditionsDifferent}=difference(registry,item,chosen);
    const priceDifference=offer.price-chosenOffer.price;
    const appearanceDifferent=item.appearanceId!==chosen.appearanceId;
    const view=describeObjectQualities(registry,item.id);
    result.push(Object.freeze({
      itemId:item.id,name:item.name,price:offer.price,
      priceDifference,appearanceDifferent,
      effectDeltas:deltas,ratingDeltas,effectConditionsDifferent,
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
  if(row.effectConditionsDifferent)pieces.push('условия бонусов различаются — смотри свойства');
  if(row.appearanceDifferent)pieces.push('отличается оформление');
  if(measures.length===0&&!row.appearanceDifferent&&!row.effectConditionsDifferent)
    pieces.push('характеристики не отличаются');
  return pieces.join(' · ');
}

/** Safe UI selection helper. It MUST receive the currently visible/filtered
 * offers; no hidden or unrelated SKU may be selected by a comparison tap.
 * This only chooses a SKU, never purchases, moves or grants anything.
 */
export function chooseComparableVariant(registry,visibleOffers,selectedId,targetId){
  if(typeof targetId!=='string'||!targetId)return null;
  return compareShopVariants(registry,visibleOffers,selectedId)
    .some(row=>row.itemId===targetId)?targetId:null;
}
